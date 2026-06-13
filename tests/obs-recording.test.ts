import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRecordingEvent,
  normalizeRecordingStatus,
  type ObsState,
} from "../server/obs";

function baseState(overrides: Partial<ObsState> = {}): ObsState {
  return {
    connected: true,
    host: "127.0.0.1",
    port: 4455,
    currentProgramScene: "Program",
    currentPreviewScene: null,
    studioMode: false,
    scenes: [],
    recordingActive: false,
    recordingPaused: false,
    recordingTimecode: null,
    recordingDurationMs: null,
    recordingOutputPath: null,
    ...overrides,
  };
}

test("normalizeRecordingStatus maps active paused OBS status", () => {
  const normalized = normalizeRecordingStatus({
    outputActive: true,
    outputPaused: true,
    outputTimecode: "00:01:02.345",
    outputDuration: 62345,
  });

  assert.equal(normalized.recordingActive, true);
  assert.equal(normalized.recordingPaused, true);
  assert.equal(normalized.recordingTimecode, "00:01:02.345");
  assert.equal(normalized.recordingDurationMs, 62345);
  assert.equal(normalized.recordingOutputPath, null);
});

test("normalizeRecordingStatus clears paused when OBS is not recording", () => {
  const normalized = normalizeRecordingStatus({
    outputActive: false,
    outputPaused: true,
    outputTimecode: "",
    outputDuration: -1,
  });

  assert.equal(normalized.recordingActive, false);
  assert.equal(normalized.recordingPaused, false);
  assert.equal(normalized.recordingTimecode, null);
  assert.equal(normalized.recordingDurationMs, null);
});

test("normalizeRecordingEvent maps paused and resumed events", () => {
  const paused = normalizeRecordingEvent({
    outputActive: true,
    outputState: "OBS_WEBSOCKET_OUTPUT_PAUSED",
  }, baseState({ recordingActive: true, recordingPaused: false }));

  assert.equal(paused.recordingActive, true);
  assert.equal(paused.recordingPaused, true);

  const resumed = normalizeRecordingEvent({
    outputActive: true,
    outputState: "OBS_WEBSOCKET_OUTPUT_RESUMED",
  }, baseState({ recordingActive: true, recordingPaused: true }));

  assert.equal(resumed.recordingActive, true);
  assert.equal(resumed.recordingPaused, false);
});

test("normalizeRecordingEvent maps stopped output path", () => {
  const normalized = normalizeRecordingEvent({
    outputActive: false,
    outputState: "OBS_WEBSOCKET_OUTPUT_STOPPED",
    outputPath: "/recordings/show.mkv",
  }, baseState({ recordingActive: true, recordingPaused: true }));

  assert.equal(normalized.recordingActive, false);
  assert.equal(normalized.recordingPaused, false);
  assert.equal(normalized.recordingOutputPath, "/recordings/show.mkv");
});
