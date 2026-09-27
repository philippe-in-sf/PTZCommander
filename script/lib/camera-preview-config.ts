import {
  decryptSecretWithKeyring,
  encryptSecretWithKeyring,
  secretKeyringFromEnv,
  type SecretKeyring,
} from "../../server/secrets";

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

function setupKeyring(material?: string): SecretKeyring {
  if (!material) return secretKeyringFromEnv();
  return {
    activeId: "setup",
    keys: new Map([["setup", material]]),
    legacyMaterials: [material],
  };
}

export function encryptSetupSecret(value: string | null | undefined, material?: string) {
  return encryptSecretWithKeyring(value, setupKeyring(material));
}

export function decryptSetupSecret(value: string | null | undefined, material?: string) {
  return decryptSecretWithKeyring(value, setupKeyring(material));
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
