import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const SECRET_PREFIX = "enc:v1:";
const DEV_SECRET_FALLBACK = "ptzcommand-dev-secret-encryption-key";
const LEGACY_DEV_SECRET_FALLBACK = "ptzcommand-dev-session-secret";

function keyMaterial() {
  if (process.env.SECRET_ENCRYPTION_KEY) return process.env.SECRET_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SECRET_ENCRYPTION_KEY must be set in production.");
  }
  return DEV_SECRET_FALLBACK;
}

function previousKeyMaterials() {
  const previousKeys = (process.env.SECRET_ENCRYPTION_PREVIOUS_KEYS || process.env.SECRET_ENCRYPTION_PREVIOUS_KEY || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production") previousKeys.push(LEGACY_DEV_SECRET_FALLBACK);
  return previousKeys;
}

function key(material = keyMaterial()) {
  return createHash("sha256").update(material).digest();
}

export function isEncryptedSecret(value: unknown) {
  return typeof value === "string" && value.startsWith(SECRET_PREFIX);
}

function encryptPlaintext(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${SECRET_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptWithKey(value: string, material = keyMaterial()) {
  const encoded = value.slice(SECRET_PREFIX.length);
  const [ivText, tagText, encryptedText] = encoded.split(":");
  if (!ivText || !tagText || !encryptedText) return null;

  const decipher = createDecipheriv("aes-256-gcm", key(material), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function decodeSecret(value: string) {
  if (!isEncryptedSecret(value)) {
    return { plaintext: value, key: "plaintext" as const };
  }

  try {
    const plaintext = decryptWithKey(value);
    if (plaintext !== null) return { plaintext, key: "current" as const };
  } catch {
    // Try previous keys below.
  }

  for (const previousKey of previousKeyMaterials()) {
    try {
      const plaintext = decryptWithKey(value, previousKey);
      if (plaintext !== null) return { plaintext, key: "previous" as const };
    } catch {
      // Keep trying the rotation list.
    }
  }

  return null;
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return value ?? null;
  const decoded = decodeSecret(value);
  if (!decoded) return value;
  if (decoded.key === "current" && isEncryptedSecret(value)) return value;
  return encryptPlaintext(decoded.plaintext);
}

export function reencryptSecret(value: string | null | undefined) {
  if (!value) return { value: value ?? null, changed: false };
  const encrypted = encryptSecret(value);
  return { value: encrypted, changed: encrypted !== value };
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return value ?? null;
  return decodeSecret(value)?.plaintext ?? null;
}
