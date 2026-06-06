import test from "node:test";
import assert from "node:assert/strict";
import { parseLiveWsCommand } from "@shared/live-ws-commands";

test("live WebSocket command schema accepts bounded switcher commands", () => {
  const parsed = parseLiveWsCommand({ type: "atem_program", inputId: 4, commandId: "cmd-1" });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.type, "atem_program");
    assert.equal(parsed.data.inputId, 4);
  }
});

test("live WebSocket command schema rejects unsafe movement values", () => {
  const parsed = parseLiveWsCommand({ type: "pan_tilt", cameraId: 1, pan: 3, tilt: 0, speed: 0.5 });

  assert.equal(parsed.success, false);
});

test("live WebSocket command schema rejects unknown commands", () => {
  const parsed = parseLiveWsCommand({ type: "launch_confetti_cannon", payload: true });

  assert.equal(parsed.success, false);
});
