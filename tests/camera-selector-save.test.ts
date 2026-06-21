import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCameraAssignmentSwapUpdatePayload,
  buildCameraEditUpdatePayload,
  type CameraData,
  type CameraEditFormState,
} from "../client/src/components/ptz/camera-selector";

const baseCamera: CameraData = {
  id: 1,
  name: "Camera 1",
  ip: "192.168.0.22",
  port: 52381,
  username: "admin",
  password: "secret",
  streamUrl: "rtsp://192.168.0.22/live",
  previewType: "rtsp",
  previewRefreshMs: 2000,
  atemInputId: 1,
  tallyState: "off",
  status: "online",
};

test("camera selector save payload preserves explicit cleared camera settings", () => {
  const form: CameraEditFormState = {
    assignment: "custom",
    name: "Wide Shot",
    ip: "192.168.0.22",
    port: 52381,
    username: "",
    password: "",
    streamUrl: "",
    previewType: "none",
    previewRefreshMs: 2000,
    atemInputId: "",
  };

  const payload = buildCameraEditUpdatePayload(baseCamera, form, null);

  assert.equal(payload.username, null);
  assert.equal(payload.password, null);
  assert.equal(payload.streamUrl, null);
  assert.equal(payload.previewType, "none");
  assert.equal(payload.atemInputId, null);
});

test("camera selector assignment swap payload keeps numbered ATEM mapping", () => {
  const payload = buildCameraAssignmentSwapUpdatePayload(
    { ...baseCamera, id: 2, name: "Camera 2", atemInputId: 99 },
    1,
  );

  assert.equal(payload.name, "Camera 1");
  assert.equal(payload.atemInputId, 1);
  assert.equal(payload.username, "admin");
  assert.equal(payload.password, "secret");
  assert.equal(payload.streamUrl, "rtsp://192.168.0.22/live");
  assert.equal(payload.previewType, "rtsp");
});
