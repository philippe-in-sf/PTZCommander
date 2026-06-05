import test from "node:test";
import assert from "node:assert/strict";
import type { Camera, HueBridge, ObsConnection } from "@shared/schema";
import {
  REDACTED_SECRET,
  isRedactedSecret,
  publicCamera,
  publicHueBridge,
  publicObsConnection,
  redactLayoutSnapshot,
} from "../server/routes/public-dtos";

test("public camera DTO redacts stored passwords", () => {
  const camera: Camera = {
    id: 1,
    name: "Cam 1",
    ip: "192.168.0.10",
    port: 52381,
    protocol: "visca",
    username: "admin",
    password: "super-secret",
    streamUrl: null,
    previewType: "snapshot",
    previewRefreshMs: 2000,
    atemInputId: null,
    tallyState: "off",
    status: "online",
    isProgramOutput: false,
    isPreviewOutput: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  assert.equal(publicCamera(camera).password, REDACTED_SECRET);
  assert.equal(publicCamera({ ...camera, password: null }).password, null);
  assert.equal(isRedactedSecret(REDACTED_SECRET), true);
});

test("public integration DTOs redact access tokens and passwords", () => {
  const bridge: HueBridge = {
    id: 1,
    name: "Hue",
    ip: "192.168.0.20",
    apiKey: "hue-api-key",
    status: "online",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  const obs: ObsConnection = {
    id: 1,
    name: "OBS",
    host: "127.0.0.1",
    port: 4455,
    password: "obs-password",
    status: "online",
    currentProgramScene: "Program",
    studioMode: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  assert.equal(publicHueBridge(bridge).apiKey, REDACTED_SECRET);
  assert.equal(publicObsConnection(obs).password, REDACTED_SECRET);
});

test("layout snapshot redaction preserves shape without leaking secrets", () => {
  const redacted = redactLayoutSnapshot(JSON.stringify({
    cameras: [{ name: "Cam 1", password: "camera-password" }],
    obsConnections: [{ name: "OBS", password: "obs-password" }],
    hueBridges: [{ name: "Hue", apiKey: "hue-api-key" }],
  }));
  const parsed = JSON.parse(redacted);

  assert.equal(parsed.cameras[0].password, REDACTED_SECRET);
  assert.equal(parsed.obsConnections[0].password, REDACTED_SECRET);
  assert.equal(parsed.hueBridges[0].apiKey, REDACTED_SECRET);
  assert.equal(redacted.includes("camera-password"), false);
  assert.equal(redacted.includes("obs-password"), false);
  assert.equal(redacted.includes("hue-api-key"), false);
});
