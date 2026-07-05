import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runCommand } from "./lib/command-runner";
import {
  buildRtspCandidates,
  encryptSetupSecret,
  formatCameraPreviewResult,
  shouldOverwritePreview,
  type CameraPreviewRow,
  type CameraPreviewResult,
} from "./lib/camera-preview-config";

const root = process.cwd();
const force = process.argv.includes("--force");
const yes = process.argv.includes("--yes");
const databasePath = process.env.DATABASE_PATH || join(root, "data", "ptzcommand.db");

async function ask(question: string, fallback = "") {
  if (yes) return fallback;
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function ffprobe(url: string, username: string, password: string) {
  const probeUrl = username ? url.replace("rtsp://", `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`) : url;
  const result = await runCommand("ffprobe", [
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
  ], { cwd: root });
  const text = `${result.stdout}\n${result.stderr}`;
  if (result.code === 0 && result.stdout.trim()) return "ok";
  if (/401|Unauthorized/i.test(text)) return "needs-credentials";
  return "failed";
}

async function main() {
  if (!existsSync(databasePath)) {
    console.error(`ERROR: SQLite database not found at ${databasePath}. Start PTZ Command once or set DATABASE_PATH.`);
    process.exit(1);
  }

  const username = await ask("Shared camera username (blank for none): ", "");
  const password = username ? await ask("Shared camera password: ", "") : "";
  const db = new Database(databasePath);
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
    if (!shouldOverwritePreview(camera, force)) {
      results.push({ name: camera.name, status: "skipped-existing", url: camera.stream_url || "" });
      continue;
    }

    let configured = false;
    let sawAuth = false;
    for (const candidate of buildRtspCandidates(camera.ip)) {
      const status = await ffprobe(candidate, username, password);
      if (status === "ok") {
        update.run(
          username || camera.username || null,
          username ? encryptSetupSecret(password) : camera.password,
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

  for (const result of results) {
    console.log(formatCameraPreviewResult(result));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
