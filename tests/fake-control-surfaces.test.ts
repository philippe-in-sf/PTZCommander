import test from "node:test";
import assert from "node:assert/strict";
import { parseLiveWsCommand, type LiveWsCommand } from "@shared/live-ws-commands";
import { parseMacroSteps } from "@shared/automation-schemas";

class FakeCameraClient {
  recalledPresets: number[] = [];
  moves: Array<{ pan: number; tilt: number; speed: number }> = [];

  isConnected() {
    return true;
  }

  recallPreset(presetNumber: number) {
    this.recalledPresets.push(presetNumber);
  }

  panTilt(pan: number, tilt: number, speed: number) {
    this.moves.push({ pan, tilt, speed });
  }
}

class FakeAtemClient {
  programInputs: number[] = [];
  cutCount = 0;

  isConnected() {
    return true;
  }

  setProgramInput(inputId: number) {
    this.programInputs.push(inputId);
  }

  cut() {
    this.cutCount++;
  }
}

function dispatchFakeCommand(command: LiveWsCommand, camera: FakeCameraClient, atem: FakeAtemClient) {
  switch (command.type) {
    case "recall_preset":
      camera.recallPreset(command.presetNumber);
      break;
    case "pan_tilt":
      camera.panTilt(command.pan, command.tilt, command.speed ?? 0.5);
      break;
    case "atem_program":
      atem.setProgramInput(command.inputId);
      break;
    case "atem_cut":
      atem.cut();
      break;
  }
}

test("fake control surfaces execute parsed live commands", () => {
  const camera = new FakeCameraClient();
  const atem = new FakeAtemClient();
  const parsed = parseLiveWsCommand({ type: "recall_preset", cameraId: 1, presetNumber: 3 });
  assert.equal(parsed.success, true);

  if (parsed.success) dispatchFakeCommand(parsed.data, camera, atem);

  assert.deepEqual(camera.recalledPresets, [3]);
});

test("fake control surfaces execute parsed macro steps", () => {
  const camera = new FakeCameraClient();
  const atem = new FakeAtemClient();
  const steps = parseMacroSteps(JSON.stringify([
    { type: "recall_preset", cameraId: 1, presetNumber: 4 },
    { type: "atem_program", inputId: 2 },
    { type: "atem_cut" },
  ]));

  assert.ok(steps);
  for (const step of steps!) {
    if (step.type === "recall_preset") camera.recallPreset(step.presetNumber);
    if (step.type === "atem_program") atem.setProgramInput(step.inputId);
    if (step.type === "atem_cut") atem.cut();
  }

  assert.deepEqual(camera.recalledPresets, [4]);
  assert.deepEqual(atem.programInputs, [2]);
  assert.equal(atem.cutCount, 1);
});
