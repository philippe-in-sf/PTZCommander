import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const V1_PREFIX = "enc:v1:";
const V2_PREFIX = "enc:v2:";
const DEV_SECRET_FALLBACK = "ptzcommand-dev-secret-encryption-key";
const LEGACY_DEV_SECRET_FALLBACK = "ptzcommand-dev-session-secret";
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export interface SecretKeyring {
  activeId: string;
  keys: Map<string, string>;
  legacyMaterials: string[];
}

export class SecretDecryptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SecretDecryptionError";
  }
}

function derivedKey(material: string) {
  return createHash("sha256").update(material).digest();
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function parsePreviousKeys(value: string | undefined) {
  if (!value) return new Map<string, string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error("SECRET_ENCRYPTION_PREVIOUS_KEYS must be a JSON object of key IDs to key material.", { cause: error });
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("SECRET_ENCRYPTION_PREVIOUS_KEYS must be a JSON object of key IDs to key material.");
  }

  const result = new Map<string, string>();
  for (const [id, material] of Object.entries(parsed)) {
    if (!KEY_ID_PATTERN.test(id) || typeof material !== "string" || !material) {
      throw new Error("SECRET_ENCRYPTION_PREVIOUS_KEYS contains an invalid key ID or empty key material.");
    }
    result.set(id, material);
  }
  return result;
}

export function secretKeyringFromEnv(env: NodeJS.ProcessEnv = process.env): SecretKeyring {
  const production = env.NODE_ENV === "production";
  const activeMaterial = env.SECRET_ENCRYPTION_KEY || (production ? "" : DEV_SECRET_FALLBACK);
  const activeId = env.SECRET_ENCRYPTION_KEY_ID || (production ? "" : "development");
  if (!activeMaterial || !activeId) {
    throw new Error("SECRET_ENCRYPTION_KEY and SECRET_ENCRYPTION_KEY_ID must be set in production.");
  }
  if (!KEY_ID_PATTERN.test(activeId)) {
    throw new Error("SECRET_ENCRYPTION_KEY_ID must use 1-64 letters, numbers, dots, underscores, or hyphens.");
  }
  if (production && activeMaterial.length < 32) {
    throw new Error("SECRET_ENCRYPTION_KEY must be at least 32 characters in production.");
  }

  const previousKeys = parsePreviousKeys(env.SECRET_ENCRYPTION_PREVIOUS_KEYS);
  if (previousKeys.has(activeId)) {
    if (previousKeys.get(activeId) !== activeMaterial) {
      throw new Error(`SECRET_ENCRYPTION_PREVIOUS_KEYS conflicts with the active key ID ${activeId}.`);
    }
    previousKeys.delete(activeId);
  }

  const keys = new Map(previousKeys);
  keys.set(activeId, activeMaterial);
  return {
    activeId,
    keys,
    legacyMaterials: unique([
      activeMaterial,
      ...previousKeys.values(),
      env.SECRET_ENCRYPTION_LEGACY_KEY,
      env.SESSION_SECRET,
      LEGACY_DEV_SECRET_FALLBACK,
      production ? undefined : DEV_SECRET_FALLBACK,
    ]),
  };
}

export function validateSecretConfiguration(env: NodeJS.ProcessEnv = process.env) {
  secretKeyringFromEnv(env);
}

export function isEncryptedSecret(value: unknown) {
  return typeof value === "string" && (value.startsWith(V1_PREFIX) || value.startsWith(V2_PREFIX));
}

function encryptWithMaterial(value: string, keyId: string, material: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(material), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}${keyId}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function encryptSecretWithKeyring(value: string | null | undefined, keyring: SecretKeyring) {
  if (!value) return value ?? null;
  if (isEncryptedSecret(value)) {
    try {
      decryptSecretWithKeyring(value, keyring);
      return value;
    } catch (error) {
      if (!(error instanceof SecretDecryptionError)) throw error;
    }
  }
  const material = keyring.keys.get(keyring.activeId);
  if (!material) throw new Error(`Active encryption key ${keyring.activeId} is not present in the keyring.`);
  return encryptWithMaterial(value, keyring.activeId, material);
}

function decryptPayload(encoded: string, material: string) {
  const [ivText, tagText, encryptedText, ...extra] = encoded.split(":");
  if (!ivText || !tagText || !encryptedText || extra.length) {
    throw new SecretDecryptionError("Encrypted secret payload is malformed.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(material), Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw new SecretDecryptionError("Encrypted secret could not be decrypted with the configured key.", { cause: error });
  }
}

export function decryptSecretWithKeyring(value: string | null | undefined, keyring: SecretKeyring) {
  if (!value) return value ?? null;
  if (!isEncryptedSecret(value)) return value;

  if (value.startsWith(V2_PREFIX)) {
    const encoded = value.slice(V2_PREFIX.length);
    const separator = encoded.indexOf(":");
    if (separator < 1) throw new SecretDecryptionError("Encrypted secret is missing its key ID.");
    const keyId = encoded.slice(0, separator);
    const material = keyring.keys.get(keyId);
    if (!material) throw new SecretDecryptionError(`Encrypted secret references unknown key ID ${keyId}.`);
    return decryptPayload(encoded.slice(separator + 1), material);
  }

  const encoded = value.slice(V1_PREFIX.length);
  for (const material of keyring.legacyMaterials) {
    try {
      return decryptPayload(encoded, material);
    } catch (error) {
      if (!(error instanceof SecretDecryptionError)) throw error;
    }
  }
  throw new SecretDecryptionError("Legacy encrypted secret could not be decrypted with any configured migration key.");
}

export function reencryptSecretWithKeyring(value: string | null | undefined, keyring: SecretKeyring) {
  if (!value) return { value: value ?? null, changed: false };
  const plaintext = decryptSecretWithKeyring(value, keyring);
  if (plaintext === null) throw new SecretDecryptionError("Encrypted secret decrypted to an invalid null value.");
  const activePrefix = `${V2_PREFIX}${keyring.activeId}:`;
  if (value.startsWith(activePrefix)) return { value, changed: false };

  const material = keyring.keys.get(keyring.activeId);
  if (!material) throw new Error(`Active encryption key ${keyring.activeId} is not present in the keyring.`);
  return {
    value: encryptWithMaterial(plaintext, keyring.activeId, material),
    changed: true,
  };
}

export function encryptSecret(value: string | null | undefined) {
  return encryptSecretWithKeyring(value, secretKeyringFromEnv());
}

export function decryptSecret(value: string | null | undefined) {
  return decryptSecretWithKeyring(value, secretKeyringFromEnv());
}

export function reencryptSecret(value: string | null | undefined) {
  return reencryptSecretWithKeyring(value, secretKeyringFromEnv());
}
