import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";
import { runCommand } from "./lib/command-runner";
import {
  buildRtspCandidates,
  decryptSetupSecret,
  encryptSetupSecret,
  formatCameraPreviewResult,
  shouldOverwritePreview,
  type CameraPreviewRow,
  type CameraPreviewResult,
} from "./lib/camera-preview-config";

export interface ConfigureCameraPreviewsOptions {
  databasePath: string;
  root?: string;
  force?: boolean;
  sharedUsername?: string;
  sharedPassword?: string;
  probeCommand?: string;
  probeTimeoutMs?: number;
}

async function ask(question: string, yes: boolean, fallback = "") {
  if (yes) return fallback;
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function storedCameraPassword(camera: CameraPreviewRow) {
  if (!camera.password) return "";
  const decrypted = decryptSetupSecret(camera.password);
  if (decrypted !== null) return decrypted;
  return camera.password.startsWith("enc:v1:") ? "" : camera.password;
}

async function ffprobe(
  url: string,
  username: string,
  password: string,
  options: Required<Pick<ConfigureCameraPreviewsOptions, "root" | "probeCommand" | "probeTimeoutMs">>,
) {
  const probeUrl = username ? url.replace("rtsp://", `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`) : url;
  const result = await runCommand(options.probeCommand, [
    "-v",
    "error",
    "-rtsp_transport",
    "tcp",
    "-timeout",
    "3000000",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height",
    "-of",
    "compact=p=0:nk=1",
    probeUrl,
  ], { cwd: options.root, timeoutMs: options.probeTimeoutMs }).catch((error: unknown) => ({
    code: null,
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
  }));
  const text = `${result.stdout}\n${result.stderr}`;
  if (result.code === 0 && result.stdout.trim()) return "ok";
  if (/401|Unauthorized/i.test(text)) return "needs-credentials";
  return "failed";
}

export async function configureCameraPreviews(options: ConfigureCameraPreviewsOptions) {
  const root = options.root || process.cwd();
  const probeOptions = {
    root,
    probeCommand: options.probeCommand || "ffprobe",
    probeTimeoutMs: options.probeTimeoutMs || 5000,
  };
  const sharedUsername = options.sharedUsername?.trim() || "";
  const sharedPassword = options.sharedPassword || "";
  const db = new Database(options.databasePath);
  const cameras = db.prepare(`
    select id, name, ip, username, password, preview_type, stream_url, preview_refresh_ms
    from cameras
    order by id
  `).all() as CameraPreviewRow[];

  const results: CameraPreviewResult[] = [];
  const update = db.prepare(`
    update cameras
    set username = ?, password = ?, preview_type = 'rtsp', stream_url = ?, preview_refresh_ms = ?
    where id = ?
  `);

  for (const camera of cameras) {
    if (!shouldOverwritePreview(camera, Boolean(options.force))) {
      results.push({ name: camera.name, status: "skipped-existing", url: camera.stream_url || "" });
      continue;
    }

    let configured = false;
    let sawAuth = false;
    const probeUsername = sharedUsername || camera.username || "";
    const probePassword = sharedUsername ? sharedPassword : storedCameraPassword(camera);
    for (const candidate of buildRtspCandidates(camera.ip)) {
      const status = await ffprobe(candidate, probeUsername, probePassword, probeOptions);
      if (status === "ok") {
        update.run(
          sharedUsername || camera.username || null,
          sharedUsername ? encryptSetupSecret(sharedPassword) : camera.password,
          candidate,
          camera.preview_refresh_ms || 2000,
          camera.id,
        );
        results.push({ name: camera.name, status: "configured", url: candidate });
        configured = true;
        break;
      }
      if (status === "needs-credentials") sawAuth = true;
    }

    if (!configured) {
      results.push({ name: camera.name, status: sawAuth ? "needs-credentials" : "no-stream-found" });
    }
  }

  db.close();
  return results;
}

async function main() {
  const root = process.cwd();
  const force = process.argv.includes("--force");
  const yes = process.argv.includes("--yes");
  const databasePath = process.env.DATABASE_PATH || join(root, "data", "ptzcommand.db");

  if (!existsSync(databasePath)) {
    console.error(`ERROR: SQLite database not found at ${databasePath}. Start PTZ Command once or set DATABASE_PATH.`);
    process.exit(1);
  }

  const username = await ask("Shared camera username (blank for none): ", yes, "");
  const password = username ? await ask("Shared camera password: ", yes, "") : "";
  const results = await configureCameraPreviews({
    databasePath,
    root,
    force,
    sharedUsername: username,
    sharedPassword: password,
  });

  for (const result of results) {
    console.log(formatCameraPreviewResult(result));
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
