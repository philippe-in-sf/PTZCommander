import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiagnosticsBundle,
  REDACTED_DIAGNOSTIC_VALUE,
  redactDiagnosticsValue,
  summarizeDiagnostics,
} from "../server/diagnostics";
import { diagnosticsBundleFilename } from "../client/src/lib/diagnostics-export";

test("redactDiagnosticsValue masks sensitive keys recursively", () => {
  const redacted = redactDiagnosticsValue({
    camera: {
      password: "camera-password",
      nested: {
        apiKey: "hue-api-key",
        accessToken: "oauth-access-token",
        refreshToken: "oauth-refresh-token",
      },
    },
    authorization: "Bearer token",
    harmless: "keep-me",
  }) as any;

  assert.equal(redacted.camera.password, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.camera.nested.apiKey, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.camera.nested.accessToken, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.camera.nested.refreshToken, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.authorization, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.harmless, "keep-me");
});

test("redactDiagnosticsValue masks URL credentials inside strings", () => {
  const redacted = redactDiagnosticsValue({
    streamUrl: "rtsp://admin:super-secret@192.168.0.22/stream1",
    nestedUrl: "snapshot http://viewer:camera-pass@camera.local/frame.jpg",
  }) as any;

  assert.equal(redacted.streamUrl, "rtsp://redacted:redacted@192.168.0.22/stream1");
  assert.equal(redacted.nestedUrl, "snapshot http://redacted:redacted@camera.local/frame.jpg");
  assert.equal(JSON.stringify(redacted).includes("super-secret"), false);
  assert.equal(JSON.stringify(redacted).includes("camera-pass"), false);
});

test("summarizeDiagnostics counts offline devices, Hue bridges, warnings, and errors", () => {
  const summary = summarizeDiagnostics({
    health: {
      cameras: [{ type: "camera", id: 1, name: "Cam 1", ip: "192.168.0.10", status: "offline" }],
      mixers: [{ type: "mixer", id: 1, name: "X32", ip: "192.168.0.20", status: "online" }],
      switchers: [],
      displays: [{ type: "display", id: 1, name: "Display", ip: "192.168.0.30", status: "offline" }],
      timestamp: 1710000000000,
    },
    hueBridges: [
      { id: 1, name: "Hue 1", ip: "192.168.0.40", status: "online", apiKey: "secret" },
      { id: 2, name: "Hue 2", ip: "192.168.0.41", status: "offline", apiKey: null },
    ],
    recentLogs: [
      { timestamp: "2026-06-13T08:00:00.000Z", level: "info", category: "system", message: "Started" },
      { timestamp: "2026-06-13T08:01:00.000Z", level: "warn", category: "camera", message: "Camera slow" },
      { timestamp: "2026-06-13T08:02:00.000Z", level: "error", category: "switcher", message: "Switcher offline" },
    ],
  });

  assert.equal(summary.offlineDevices, 2);
  assert.equal(summary.offlineHueBridges, 1);
  assert.equal(summary.warnings, 1);
  assert.equal(summary.errors, 1);
  assert.deepEqual(summary.lastProblem, {
    timestamp: "2026-06-13T08:02:00.000Z",
    level: "error",
    category: "switcher",
    message: "Switcher offline",
  });
});

test("diagnosticsBundleFilename includes version and filesystem-safe timestamp", () => {
  assert.equal(
    diagnosticsBundleFilename("1.7.8", "2026-06-13T08:30:00.000Z"),
    "ptz-command-diagnostics-v1.7.8-2026-06-13T08-30-00.json",
  );
});

test("buildDiagnosticsBundle preserves partial data and records collection errors", async () => {
  const bundle = await buildDiagnosticsBundle({
    version: "1.7.8",
    now: new Date("2026-06-13T08:30:00.000Z"),
    runtime: {
      nodeVersion: "v20.19.0",
      platform: "darwin",
      arch: "arm64",
      pid: 1234,
      uptimeSeconds: 42,
      workingDirectory: "/workspace",
    },
    collectors: {
      system: async () => ({ cpuPercent: 12 }),
      health: async () => ({
        cameras: [{ type: "camera", id: 1, name: "Cam 1", ip: "192.168.0.10", status: "offline" }],
        mixers: [],
        switchers: [],
        displays: [],
        timestamp: 1710000000000,
      }),
      hueBridges: async () => [{ id: 1, name: "Hue", ip: "192.168.0.20", status: "online", apiKey: "hue-secret" }],
      recentLogs: async () => [{ level: "error", category: "system", message: "Bad thing" }],
      auditLogs: async () => {
        throw new Error("audit unavailable");
      },
      sessionLog: async () => [{ id: 1, timestamp: 1710000000000, category: "system", action: "Started", details: "ok" }],
    },
  });

  assert.equal(bundle.version, "1.7.8");
  assert.equal(bundle.generatedAt, "2026-06-13T08:30:00.000Z");
  assert.equal((bundle.system as any).cpuPercent, 12);
  assert.equal(bundle.auditLogs.length, 0);
  assert.deepEqual(bundle.collectionErrors, [{ section: "auditLogs", message: "audit unavailable" }]);
  assert.equal(bundle.summary.offlineDevices, 1);
  assert.equal(bundle.summary.errors, 1);
  assert.equal((bundle.hueBridges[0] as any).apiKey, REDACTED_DIAGNOSTIC_VALUE);
});
