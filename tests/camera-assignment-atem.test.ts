import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  atemInputIdForCameraAssignment,
  atemInputValueForAssignmentSelection,
  cameraNameForAssignmentSelection,
  formatCameraAssignmentName,
} from "@shared/camera-import";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("numbered camera assignments derive matching camera names and ATEM inputs", () => {
  assert.equal(formatCameraAssignmentName(1), "Camera 1");
  assert.equal(formatCameraAssignmentName(4), "Camera 4");
  assert.equal(atemInputIdForCameraAssignment(1, null), 1);
  assert.equal(atemInputIdForCameraAssignment(4, 99), 4);
});

test("custom camera assignments preserve manual ATEM inputs", () => {
  assert.equal(atemInputIdForCameraAssignment(null, 7), 7);
  assert.equal(atemInputIdForCameraAssignment(null, null), null);
});

test("custom assignment selection clears stale numbered camera values", () => {
  assert.equal(cameraNameForAssignmentSelection(null, "Camera 4"), "");
  assert.equal(atemInputValueForAssignmentSelection(null, 4, "4"), "");
});

test("custom assignment selection preserves explicit custom values", () => {
  assert.equal(cameraNameForAssignmentSelection(null, "Wide Shot"), "Wide Shot");
  assert.equal(atemInputValueForAssignmentSelection(null, 4, "7"), "7");
});

test("numbered assignment selection derives matching display values", () => {
  assert.equal(cameraNameForAssignmentSelection(2, "Wide Shot"), "Camera 2");
  assert.equal(atemInputValueForAssignmentSelection(2, null, "7"), "2");
});

test("camera selector updates and saves ATEM inputs from numbered assignments", () => {
  const selector = source("client/src/components/ptz/camera-selector.tsx");

  assert.match(selector, /atemInputIdForCameraAssignment/);
  assert.match(selector, /formatCameraAssignmentName/);
  assert.match(selector, /const parseAtemInputId = \(value: string\) =>/);
  assert.ok(selector.includes("if (!/^[1-9]\\d*$/.test(value.trim())) return null;"));
  assert.match(selector, /const nextAssignment = assignment === CUSTOM_CAMERA_ASSIGNMENT \? null : Number\.parseInt\(assignment, 10\);/);
  assert.match(selector, /const previousAssignment = editForm\.assignment === CUSTOM_CAMERA_ASSIGNMENT\s*\? null\s*: Number\.parseInt\(editForm\.assignment, 10\);/);
  assert.match(selector, /const effectiveAssignment = editForm\.assignment === CUSTOM_CAMERA_ASSIGNMENT\s*\? null\s*: getCameraAssignmentNumberFromName\(editForm\.name\);/);
  assert.match(selector, /const hasBlockingAssignmentConflict = Boolean\(assignmentConflict && !willSwapAssignment\);/);
  assert.match(selector, /const hasBlankCameraName = editForm\.name\.trim\(\)\.length === 0;/);
  assert.match(selector, /name: cameraNameForAssignmentSelection\(nextAssignment, editForm\.name\),/);
  assert.match(selector, /atemInputId: atemInputValueForAssignmentSelection\(nextAssignment, previousAssignment, editForm\.atemInputId\),/);
  assert.match(selector, /atemInputId: hasCameraUpdateOverride\(overrides, "atemInputId"\) \? overrides\.atemInputId \?\? null : camera\.atemInputId \?\? null,/);
  assert.match(selector, /if \(hasBlankCameraName\) return;/);
  assert.match(selector, /if \(hasBlockingAssignmentConflict\) return;/);
  assert.match(selector, /buildCameraAssignmentSwapUpdatePayload\(assignmentConflict, currentAssignment\)/);
  assert.match(selector, /atemInputId: atemInputIdForCameraAssignment\(currentAssignment, camera\.atemInputId \?\? null\),/);
  assert.match(selector, /atemInputId: atemInputIdForCameraAssignment\(effectiveAssignment, parseAtemInputId\(editForm\.atemInputId\)\),/);
  assert.match(selector, /disabled=\{hasBlockingAssignmentConflict \|\| hasBlankCameraName\}/);
});

test("camera selector saves explicit cleared camera settings", () => {
  const selector = source("client/src/components/ptz/camera-selector.tsx");

  assert.match(selector, /username: hasCameraUpdateOverride\(overrides, "username"\) \? overrides\.username \?\? null : camera\.username \?\? null,/);
  assert.match(selector, /password: hasCameraUpdateOverride\(overrides, "password"\) \? overrides\.password \?\? null : camera\.password \?\? null,/);
  assert.match(selector, /streamUrl: hasCameraUpdateOverride\(overrides, "streamUrl"\) \? overrides\.streamUrl \?\? null : \(camera\.previewType === 'none' \? null : camera\.streamUrl \?\? null\),/);
  assert.match(selector, /previewType: hasCameraUpdateOverride\(overrides, "previewType"\) \? overrides\.previewType \?\? "none" : camera\.previewType \?\? \(camera\.streamUrl \? 'snapshot' : 'none'\),/);
  assert.match(selector, /atemInputId: hasCameraUpdateOverride\(overrides, "atemInputId"\) \? overrides\.atemInputId \?\? null : camera\.atemInputId \?\? null,/);
});

test("camera route logs safe assignment and ATEM input updates", () => {
  const route = source("server/routes/camera.ts");
  const actionIndex = route.indexOf('action: "camera:assignment_atem_update"');
  assert.notEqual(actionIndex, -1);

  const logBlockStart = route.lastIndexOf("logger.info", actionIndex);
  const logBlockEnd = route.indexOf("});", actionIndex);
  assert.notEqual(logBlockStart, -1);
  assert.notEqual(logBlockEnd, -1);

  const logBlock = route.slice(logBlockStart, logBlockEnd);
  assert.match(logBlock, /previousName/);
  assert.match(logBlock, /name/);
  assert.match(logBlock, /previousAtemInputId/);
  assert.match(logBlock, /atemInputId/);
  assert.doesNotMatch(logBlock, /password/i);
  assert.doesNotMatch(logBlock, /username/i);
  assert.doesNotMatch(logBlock, /streamUrl/);
  assert.doesNotMatch(logBlock, /previewUrl/i);
});
