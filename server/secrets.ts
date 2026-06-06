import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const SECRET_PREFIX = "enc:v1:";
const DEV_SECRET_FALLBACK = "ptzcommand-dev-session-secret";

function keyMaterial() {
  return process.env.SECRET_ENCRYPTION_KEY || process.env.SESSION_SECRET || DEV_SECRET_FALLBACK;
}

function key() {
  return createHash("sha256").update(keyMaterial()).digest();
}

export function isEncryptedSecret(value: unknown) {
  return typeof value === "string" && value.startsWith(SECRET_PREFIX);
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return value ?? null;
  if (isEncryptedSecret(value)) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${SECRET_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return value ?? null;
  if (!isEncryptedSecret(value)) return value;

  try {
    const encoded = value.slice(SECRET_PREFIX.length);
    const [ivText, tagText, encryptedText] = encoded.split(":");
    if (!ivText || !tagText || !encryptedText) return null;

    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
