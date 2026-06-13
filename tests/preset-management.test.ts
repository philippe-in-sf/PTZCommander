import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePresetName,
  requiresProgramRecallConfirmation,
} from "@shared/preset-management";
import { refreshPresetThumbnail } from "../server/preset-thumbnails";

test("requiresProgramRecallConfirmation is true for program tally", () => {
  assert.equal(requiresProgramRecallConfirmation({ tallyState: "program" }), true);
});

test("requiresProgramRecallConfirmation is true for program output flag", () => {
  assert.equal(requiresProgramRecallConfirmation({ isProgramOutput: true }), true);
});

test("requiresProgramRecallConfirmation is false for preview, off, and missing cameras", () => {
  assert.equal(requiresProgramRecallConfirmation({ tallyState: "preview" }), false);
  assert.equal(requiresProgramRecallConfirmation({ tallyState: "off", isProgramOutput: false }), false);
  assert.equal(requiresProgramRecallConfirmation(null), false);
  assert.equal(requiresProgramRecallConfirmation(undefined), false);
});

test("normalizePresetName trims names and converts blank names to null", () => {
  assert.equal(normalizePresetName(" Center Close "), "Center Close");
  assert.equal(normalizePresetName("   "), null);
  assert.equal(normalizePresetName(""), null);
});

const basePreset = {
  id: 10,
  cameraId: 4,
  presetNumber: 2,
  name: "Center",
  thumbnail: "old-thumbnail",
  pan: 0,
  tilt: 0,
  zoom: 0,
  focus: 0,
  createdAt: new Date("2026-06-13T10:00:00Z"),
  updatedAt: new Date("2026-06-13T10:00:00Z"),
};

const baseCamera = {
  id: 4,
  name: "Cam 4",
  ip: "192.168.0.4",
  port: 52381,
  protocol: "visca",
  status: "online",
  username: null,
  password: null,
  streamUrl: "http://camera/snapshot.jpg",
  previewType: "snapshot",
  previewRefreshMs: 2000,
  atemInputId: null,
  tallyState: "off",
  isProgramOutput: false,
  isPreviewOutput: false,
  createdAt: new Date("2026-06-13T10:00:00Z"),
};

function thumbnailStorage(overrides: {
  preset?: typeof basePreset | undefined;
  camera?: typeof baseCamera | undefined;
} = {}) {
  const hasPresetOverride = Object.prototype.hasOwnProperty.call(overrides, "preset");
  const hasCameraOverride = Object.prototype.hasOwnProperty.call(overrides, "camera");
  const state = {
    preset: hasPresetOverride ? overrides.preset : basePreset,
    camera: hasCameraOverride ? overrides.camera : baseCamera,
    saved: null as typeof basePreset | null,
  };

  return {
    state,
    storage: {
      async getPresetById(id: number) {
        assert.equal(id, 10);
        return state.preset;
      },
      async getCamera(id: number) {
        assert.equal(id, 4);
        return state.camera;
      },
      async savePreset(preset: Partial<typeof basePreset>) {
        state.saved = { ...basePreset, ...preset, updatedAt: new Date("2026-06-13T11:00:00Z") };
        return state.saved;
      },
    },
  };
}

test("refreshPresetThumbnail stores a freshly captured thumbnail", async () => {
  const { state, storage } = thumbnailStorage();

  const updated = await refreshPresetThumbnail(storage, 10, async (url) => {
    assert.equal(url, "http://camera/snapshot.jpg");
    return "new-thumbnail";
  });

  assert.equal(state.saved?.thumbnail, "new-thumbnail");
  assert.equal(updated.thumbnail, "new-thumbnail");
  assert.equal(updated.name, "Center");
});

test("refreshPresetThumbnail rejects missing presets and cameras", async () => {
  await assert.rejects(
    () => refreshPresetThumbnail(thumbnailStorage({ preset: undefined }).storage, 10, async () => "new"),
    /Preset not found/,
  );

  await assert.rejects(
    () => refreshPresetThumbnail(thumbnailStorage({ camera: undefined }).storage, 10, async () => "new"),
    /Camera not found/,
  );
});

test("refreshPresetThumbnail rejects cameras without a preview URL", async () => {
  const { storage } = thumbnailStorage({
    camera: { ...baseCamera, streamUrl: null },
  });

  await assert.rejects(
    () => refreshPresetThumbnail(storage, 10, async () => "new"),
    /No preview URL configured for Cam 4/,
  );
});

test("refreshPresetThumbnail preserves the old thumbnail when capture fails", async () => {
  const { state, storage } = thumbnailStorage();

  await assert.rejects(
    () => refreshPresetThumbnail(storage, 10, async () => null),
    /Could not capture thumbnail for Cam 4/,
  );

  assert.equal(state.saved, null);
});
