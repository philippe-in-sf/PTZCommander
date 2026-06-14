import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  atemInputIdForCameraAssignment,
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

test("camera selector updates and saves ATEM inputs from numbered assignments", () => {
  const selector = source("client/src/components/ptz/camera-selector.tsx");

  assert.match(selector, /atemInputIdForCameraAssignment/);
  assert.match(selector, /formatCameraAssignmentName/);
  assert.match(selector, /const parseAtemInputId = \(value: string\) =>/);
  assert.match(selector, /const nextAssignment = assignment === CUSTOM_CAMERA_ASSIGNMENT \? null : Number\.parseInt\(assignment, 10\);/);
  assert.match(selector, /name: nextAssignment \? formatCameraAssignmentName\(nextAssignment\) : editForm\.name,/);
  assert.match(selector, /atemInputId: nextAssignment \? String\(nextAssignment\) : editForm\.atemInputId,/);
  assert.match(selector, /atemInputId: "atemInputId" in overrides \? overrides\.atemInputId \?\? null : camera\.atemInputId \?\? null,/);
  assert.match(selector, /name: formatCameraAssignmentName\(currentAssignment\),/);
  assert.match(selector, /atemInputId: atemInputIdForCameraAssignment\(currentAssignment, assignmentConflict\.atemInputId \?\? null\),/);
  assert.match(selector, /atemInputId: atemInputIdForCameraAssignment\(selectedAssignment, parseAtemInputId\(editForm\.atemInputId\)\),/);
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
  assert.doesNotMatch(logBlock, /streamUrl/);
});
