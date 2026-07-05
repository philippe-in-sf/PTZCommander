import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { configureCameraPreviews } from "../script/configure-camera-previews";
import { encryptSetupSecret } from "../script/lib/camera-preview-config";

function createCameraDatabase(path: string) {
  const db = new Database(path);
  db.exec(`
    create table cameras (
      id integer primary key,
      name text not null,
      ip text not null,
      username text,
      password text,
      preview_type text,
      stream_url text,
      preview_refresh_ms integer
    )
  `);
  return db;
}

test("configureCameraPreviews uses stored credentials and preserves existing previews", async () => {
  const root = mkdtempSync(join(tmpdir(), "ptz-preview-test-"));
  const databasePath = join(root, "ptzcommand.db");
  const probePath = join(root, "fake-ffprobe.sh");
  const storedPassword = encryptSetupSecret("admin");
  const db = createCameraDatabase(databasePath);
  db.prepare(`
    insert into cameras (id, name, ip, username, password, preview_type, stream_url, preview_refresh_ms)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, "Camera 1", "192.168.0.27", null, null, "rtsp", "rtsp://192.168.0.27:554/live/av0", 2000);
  db.prepare(`
    insert into cameras (id, name, ip, username, password, preview_type, stream_url, preview_refresh_ms)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(2, "Camera 2", "192.168.0.165", "admin", storedPassword, "none", null, 2000);
  db.close();

  writeFileSync(probePath, [
    "#!/bin/sh",
    "case \"$*\" in",
    "  *admin:admin@192.168.0.165:554/live/av0*) echo 'h264|1920|1080'; exit 0 ;;",
    "  *) exit 1 ;;",
    "esac",
    "",
  ].join("\n"));
  chmodSync(probePath, 0o755);

  const results = await configureCameraPreviews({
    databasePath,
    root,
    probeCommand: probePath,
    probeTimeoutMs: 200,
  });

  assert.deepEqual(results, [
    { name: "Camera 1", status: "skipped-existing", url: "rtsp://192.168.0.27:554/live/av0" },
    { name: "Camera 2", status: "configured", url: "rtsp://192.168.0.165:554/live/av0" },
  ]);

  const verifyDb = new Database(databasePath);
  const camera = verifyDb.prepare("select * from cameras where id = 2").get() as {
    username: string | null;
    password: string | null;
    preview_type: string | null;
    stream_url: string | null;
    preview_refresh_ms: number | null;
  };
  verifyDb.close();
  assert.equal(camera.username, "admin");
  assert.equal(camera.password, storedPassword);
  assert.equal(camera.preview_type, "rtsp");
  assert.equal(camera.stream_url, "rtsp://192.168.0.165:554/live/av0");
  assert.equal(camera.preview_refresh_ms, 2000);
});
