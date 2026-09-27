import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRtspCandidates,
  decryptSetupSecret,
  encryptSetupSecret,
  formatCameraPreviewResult,
  shouldOverwritePreview,
  type CameraPreviewRow,
} from "../script/lib/camera-preview-config";

test("buildRtspCandidates prefers FoMaKo main and sub streams", () => {
  assert.deepEqual(buildRtspCandidates("192.168.0.27"), [
    "rtsp://192.168.0.27:554/live/av0",
    "rtsp://192.168.0.27:554/live/av1",
  ]);
});

test("encryptSetupSecret round-trips with decryptSetupSecret", () => {
  const encrypted = encryptSetupSecret("admin", "test-secret");
  assert.notEqual(encrypted, "admin");
  assert.equal(decryptSetupSecret(encrypted, "test-secret"), "admin");
});

test("decryptSetupSecret rejects invalid encrypted payloads", () => {
  assert.throws(() => decryptSetupSecret("enc:v1:not-valid:not-valid:not-valid", "test-secret"));
  const encrypted = encryptSetupSecret("admin", "test-secret");
  assert.throws(() => decryptSetupSecret(encrypted, "wrong-secret"));
});

test("shouldOverwritePreview protects existing configured previews", () => {
  const camera: CameraPreviewRow = {
    id: 1,
    name: "Camera 1",
    ip: "192.168.0.27",
    username: null,
    password: null,
    preview_type: "rtsp",
    stream_url: "rtsp://192.168.0.27:554/live/av0",
    preview_refresh_ms: 2000,
  };
  assert.equal(shouldOverwritePreview(camera, false), false);
  assert.equal(shouldOverwritePreview(camera, true), true);
});

test("shouldOverwritePreview protects legacy preview urls", () => {
  const camera: CameraPreviewRow = {
    id: 1,
    name: "Camera 1",
    ip: "192.168.0.27",
    username: null,
    password: null,
    preview_type: null,
    stream_url: "rtsp://192.168.0.27:554/live/av0",
    preview_refresh_ms: 2000,
  };
  assert.equal(shouldOverwritePreview(camera, false), false);
  assert.equal(shouldOverwritePreview(camera, true), true);
});

test("shouldOverwritePreview protects configured preview modes without urls", () => {
  const camera: CameraPreviewRow = {
    id: 1,
    name: "Camera 1",
    ip: "192.168.0.27",
    username: null,
    password: null,
    preview_type: "rtsp",
    stream_url: "",
    preview_refresh_ms: 2000,
  };
  assert.equal(shouldOverwritePreview(camera, false), false);
  assert.equal(shouldOverwritePreview(camera, true), true);
});

test("shouldOverwritePreview allows explicit none mode even with stale url", () => {
  const camera: CameraPreviewRow = {
    id: 1,
    name: "Camera 1",
    ip: "192.168.0.27",
    username: null,
    password: null,
    preview_type: "none",
    stream_url: "rtsp://192.168.0.27:554/live/av0",
    preview_refresh_ms: 2000,
  };
  assert.equal(shouldOverwritePreview(camera, false), true);
  assert.equal(shouldOverwritePreview(camera, true), true);
});

test("shouldOverwritePreview allows empty preview configuration", () => {
  const camera: CameraPreviewRow = {
    id: 1,
    name: "Camera 1",
    ip: "192.168.0.27",
    username: null,
    password: null,
    preview_type: "none",
    stream_url: null,
    preview_refresh_ms: 2000,
  };
  assert.equal(shouldOverwritePreview(camera, false), true);
});

test("formatCameraPreviewResult reports configured camera", () => {
  assert.equal(
    formatCameraPreviewResult({ name: "Camera 1", status: "configured", url: "rtsp://192.168.0.27:554/live/av0" }),
    "Camera 1: configured rtsp://192.168.0.27:554/live/av0",
  );
});

test("formatCameraPreviewResult reports manual follow-up", () => {
  assert.equal(
    formatCameraPreviewResult({ name: "Camera 2", status: "needs-credentials" }),
    "Camera 2: RTSP responded but needs credentials",
  );
});
