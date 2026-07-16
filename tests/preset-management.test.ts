import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePresetName,
  requiresProgramRecallConfirmation,
} from "@shared/preset-management";
import { refreshPresetThumbnail } from "../server/preset-thumbnails";
import { captureConfiguredPreviewThumbnail, isConfiguredFfmpegPreviewTarget } from "../server/routes/camera";

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

test("refreshPresetThumbnail captures plain snapshot thumbnails with the full camera config", async () => {
  const { state, storage } = thumbnailStorage();

  const updated = await refreshPresetThumbnail(storage, 10, async (camera: any) => {
    assert.equal(camera.previewType, "snapshot");
    assert.equal(camera.streamUrl, "http://camera/snapshot.jpg");
    return "new-thumbnail";
  });

  assert.equal(state.saved?.thumbnail, "new-thumbnail");
  assert.equal(updated.thumbnail, "new-thumbnail");
  assert.equal(updated.name, "Center");
});

test("refreshPresetThumbnail captures RTSP and RTP thumbnails with the configured preview type", async () => {
  for (const previewType of ["rtsp", "rtp"] as const) {
    const streamUrl = `${previewType}://camera/live`;
    const { state, storage } = thumbnailStorage({
      camera: { ...baseCamera, previewType, streamUrl },
    });

    const updated = await refreshPresetThumbnail(storage, 10, async (camera: any) => {
      assert.equal(camera.previewType, previewType);
      assert.equal(camera.streamUrl, streamUrl);
      return `${previewType}-thumbnail`;
    });

    assert.equal(state.saved?.thumbnail, `${previewType}-thumbnail`);
    assert.equal(updated.thumbnail, `${previewType}-thumbnail`);
  }
});

test("refreshPresetThumbnail keeps authenticated snapshot credentials available to capture", async () => {
  const { state, storage } = thumbnailStorage({
    camera: {
      ...baseCamera,
      username: "viewer",
      password: "camera-secret",
      streamUrl: "http://camera.local/snapshot.jpg",
      previewType: "snapshot",
    },
  });

  const updated = await refreshPresetThumbnail(storage, 10, async (camera: any) => {
    assert.equal(camera.previewType, "snapshot");
    assert.equal(camera.streamUrl, "http://camera.local/snapshot.jpg");
    assert.equal(camera.username, "viewer");
    assert.equal(camera.password, "camera-secret");
    return "auth-thumbnail";
  });

  assert.equal(state.saved?.thumbnail, "auth-thumbnail");
  assert.equal(updated.thumbnail, "auth-thumbnail");
});

test("captureConfiguredPreviewThumbnail captures a plain snapshot preview", async () => {
  const frame = Buffer.from("plain-snapshot");
  const thumbnail = await captureConfiguredPreviewThumbnail(baseCamera, {
    fetchImpl: async (url, init) => {
      assert.equal(url, "http://camera/snapshot.jpg");
      assert.deepEqual(init?.headers, {});
      return new Response(frame, { headers: { "content-type": "image/jpeg" } });
    },
  });

  assert.equal(thumbnail, `data:image/jpeg;base64,${frame.toString("base64")}`);
});

test("captureConfiguredPreviewThumbnail captures RTSP and RTP preview frames", async () => {
  for (const previewType of ["rtsp", "rtp"] as const) {
    const streamUrl = `${previewType}://camera/live`;
    const frame = Buffer.from(`${previewType}-frame`);
    const thumbnail = await captureConfiguredPreviewThumbnail(
      { ...baseCamera, previewType, streamUrl },
      {
        captureFfmpegFrame: async (camera, protocol) => {
          assert.equal(protocol, previewType);
          assert.equal(camera.streamUrl, streamUrl);
          return frame;
        },
      },
    );

    assert.equal(thumbnail, `data:image/jpeg;base64,${frame.toString("base64")}`);
  }
});

test("FFmpeg preview targets must stay on the configured camera host", () => {
  assert.equal(isConfiguredFfmpegPreviewTarget("rtsp://192.168.0.4/live", baseCamera), true);
  assert.equal(isConfiguredFfmpegPreviewTarget("rtsps://192.168.0.4/live", baseCamera), true);
  assert.equal(isConfiguredFfmpegPreviewTarget("rtp://192.168.0.4:5004/live", baseCamera), true);
  assert.equal(isConfiguredFfmpegPreviewTarget("rtsp://169.254.169.254/latest/meta-data", baseCamera), false);
  assert.equal(isConfiguredFfmpegPreviewTarget("rtsp://192.168.0.44/live", baseCamera), false);
  assert.equal(isConfiguredFfmpegPreviewTarget("not a url", baseCamera), false);
});

test("captureConfiguredPreviewThumbnail sends basic auth for authenticated snapshot previews", async () => {
  const frame = Buffer.from("auth-snapshot");
  const thumbnail = await captureConfiguredPreviewThumbnail(
    {
      ...baseCamera,
      username: "viewer",
      password: "camera-secret",
      streamUrl: "http://camera.local/snapshot.jpg",
      previewType: "snapshot",
    },
    {
      fetchImpl: async (url, init) => {
        assert.equal(url, "http://camera.local/snapshot.jpg");
        assert.deepEqual(init?.headers, {
          Authorization: `Basic ${Buffer.from("viewer:camera-secret").toString("base64")}`,
        });
        return new Response(frame, { headers: { "content-type": "image/jpeg" } });
      },
    },
  );

  assert.equal(thumbnail, `data:image/jpeg;base64,${frame.toString("base64")}`);
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
