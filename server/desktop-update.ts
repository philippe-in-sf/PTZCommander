import { createHash } from "crypto";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join } from "path";

export const DESKTOP_UPDATE_DOWNLOAD_URL = "/api/desktop-update/download";
export const DESKTOP_UPDATE_ARCHIVE_NAME = "PTZ-Commander-macOS.zip";

export type DesktopUpdateArtifact = {
  path: string;
  sha256: string;
  sizeBytes: number;
};

export type DesktopUpdateManifest = {
  version: string;
  platform: "macos";
  available: boolean;
  downloadUrl: string | null;
  sha256: string | null;
  sizeBytes: number | null;
};

let cachedArtifact: (DesktopUpdateArtifact & { modifiedMs: number }) | null = null;

export function desktopUpdateArtifactPath() {
  return process.env.PTZCOMMAND_DESKTOP_UPDATE_PATH
    || join(process.cwd(), "dist", DESKTOP_UPDATE_ARCHIVE_NAME);
}

export async function inspectDesktopUpdateArtifact(
  artifactPath: string = desktopUpdateArtifactPath(),
): Promise<DesktopUpdateArtifact | null> {
  try {
    const metadata = await stat(artifactPath);
    if (!metadata.isFile() || metadata.size <= 0) return null;
    if (
      cachedArtifact?.path === artifactPath
      && cachedArtifact.sizeBytes === metadata.size
      && cachedArtifact.modifiedMs === metadata.mtimeMs
    ) {
      const { modifiedMs: _modifiedMs, ...artifact } = cachedArtifact;
      return artifact;
    }

    const sha256 = await new Promise<string>((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(artifactPath);
      stream.on("error", reject);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
    });

    cachedArtifact = {
      path: artifactPath,
      sha256,
      sizeBytes: metadata.size,
      modifiedMs: metadata.mtimeMs,
    };
    return { path: artifactPath, sha256, sizeBytes: metadata.size };
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function buildDesktopUpdateManifest(
  version: string,
  artifactPath: string = desktopUpdateArtifactPath(),
): Promise<DesktopUpdateManifest> {
  const artifact = await inspectDesktopUpdateArtifact(artifactPath);
  return {
    version,
    platform: "macos",
    available: artifact !== null,
    downloadUrl: artifact ? DESKTOP_UPDATE_DOWNLOAD_URL : null,
    sha256: artifact?.sha256 ?? null,
    sizeBytes: artifact?.sizeBytes ?? null,
  };
}
