import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SECRET_PREFIX = "enc:v1:";
const DEFAULT_SECRET = "ptzcommand-dev-session-secret";

export interface CameraPreviewRow {
  id: number;
  name: string;
  ip: string;
  username: string | null;
  password: string | null;
  preview_type: string | null;
  stream_url: string | null;
  preview_refresh_ms: number | null;
}

export type CameraPreviewResult =
  | { name: string; status: "configured"; url: string }
  | { name: string; status: "skipped-existing"; url: string }
  | { name: string; status: "needs-credentials" }
  | { name: string; status: "no-stream-found" }
  | { name: string; status: "unreachable" };

export function buildRtspCandidates(ip: string) {
  return [
    `rtsp://${ip}:554/live/av0`,
    `rtsp://${ip}:554/live/av1`,
  ];
}

function secretKey(material = process.env.SECRET_ENCRYPTION_KEY || process.env.SESSION_SECRET || DEFAULT_SECRET) {
  return createHash("sha256").update(material).digest();
}

export function encryptSetupSecret(value: string | null | undefined, material?: string) {
  if (!value) return value ?? null;
  if (value.startsWith(SECRET_PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(material), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSetupSecret(value: string | null | undefined, material?: string) {
  if (!value) return value ?? null;
  if (!value.startsWith(SECRET_PREFIX)) return value;
  try {
    const [ivText, tagText, encryptedText] = value.slice(SECRET_PREFIX.length).split(":");
    if (!ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv("aes-256-gcm", secretKey(material), Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function shouldOverwritePreview(camera: CameraPreviewRow, force: boolean) {
  if (force) return true;
  const url = camera.stream_url?.trim() || "";
  const type = camera.preview_type?.trim() || "";
  if (type === "none") return true;
  if (type !== "") return false;
  if (url !== "") return false;
  return true;
}

export function formatCameraPreviewResult(result: CameraPreviewResult) {
  switch (result.status) {
    case "configured":
      return `${result.name}: configured ${result.url}`;
    case "skipped-existing":
      return `${result.name}: kept existing preview ${result.url}`;
    case "needs-credentials":
      return `${result.name}: RTSP responded but needs credentials`;
    case "no-stream-found":
      return `${result.name}: no supported preview stream found`;
    case "unreachable":
      return `${result.name}: camera unreachable`;
  }
}
