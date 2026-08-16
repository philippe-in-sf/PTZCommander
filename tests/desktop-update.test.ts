import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DESKTOP_UPDATE_DOWNLOAD_URL,
  buildDesktopUpdateManifest,
  inspectDesktopUpdateArtifact,
} from "../server/desktop-update";

test("desktop update manifest publishes archive integrity metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ptz-desktop-update-"));
  try {
    const archivePath = join(directory, "PTZ-Commander-macOS.zip");
    const archive = Buffer.from("verified desktop package");
    await writeFile(archivePath, archive);

    const manifest = await buildDesktopUpdateManifest("1.7.12", archivePath);

    assert.deepEqual(manifest, {
      version: "1.7.12",
      platform: "macos",
      available: true,
      downloadUrl: DESKTOP_UPDATE_DOWNLOAD_URL,
      sha256: createHash("sha256").update(archive).digest("hex"),
      sizeBytes: archive.length,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("desktop update manifest reports an unpublished package safely", async () => {
  const missingPath = join(tmpdir(), `missing-ptz-update-${Date.now()}.zip`);

  assert.equal(await inspectDesktopUpdateArtifact(missingPath), null);
  assert.deepEqual(await buildDesktopUpdateManifest("1.7.12", missingPath), {
    version: "1.7.12",
    platform: "macos",
    available: false,
    downloadUrl: null,
    sha256: null,
    sizeBytes: null,
  });
});

test("macOS update flow verifies and replaces the app with rollback protection", async () => {
  const [appSource, buildScript, authSource, systemRoutes] = await Promise.all([
    readFile(join(process.cwd(), "macos/PTZCommandApp.swift"), "utf8"),
    readFile(join(process.cwd(), "deploy/build-macos-app.sh"), "utf8"),
    readFile(join(process.cwd(), "server/auth.ts"), "utf8"),
    readFile(join(process.cwd(), "server/routes/system.ts"), "utf8"),
  ]);

  assert.match(appSource, /CFBundleShortVersionString/);
  assert.match(appSource, /api\/desktop-update/);
  assert.match(appSource, /SHA256/);
  assert.match(appSource, /candidateBundle\.bundleIdentifier == Bundle\.main\.bundleIdentifier/);
  assert.match(appSource, /codesign/);
  assert.match(appSource, /previous-update/);
  assert.match(appSource, /Upgrade and Relaunch/);
  assert.match(appSource, /Check for Updates/);
  assert.match(buildScript, /PTZ-Commander-macOS\.zip/);
  assert.match(buildScript, /ditto -c -k --sequesterRsrc --keepParent/);
  assert.match(authSource, /api\\\/desktop-update/);
  assert.match(systemRoutes, /const desktopUpdateRateLimiter = rateLimit/);
  assert.match(systemRoutes, /app\.get\("\/api\/desktop-update", desktopUpdateRateLimiter/);
  assert.match(systemRoutes, /app\.get\("\/api\/desktop-update\/download", desktopUpdateRateLimiter/);
});
