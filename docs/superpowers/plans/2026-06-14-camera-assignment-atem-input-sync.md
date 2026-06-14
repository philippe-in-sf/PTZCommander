# Camera Assignment ATEM Input Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep numbered camera assignments and ATEM input numbers synchronized when camera assignments are changed or swapped.

**Architecture:** Add tiny shared helpers for assignment-derived names and ATEM input values, then use them in the existing `CameraSelector` assignment-change and save paths. Preserve the current storage and tally architecture; add safe camera-route logging so assignment/input changes leave an audit trail without touching secrets.

**Tech Stack:** TypeScript, React 19, node:test, existing Express camera routes, existing logger/audit pipeline.

---

## Verification Command Prefix

This workspace has previously needed the bundled Node runtime for verification because global Node can mismatch the native `better-sqlite3` binding. Use this prefix for all npm verification commands during implementation:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

For example:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

## File Structure

- Create `tests/camera-assignment-atem.test.ts`: focused node:test coverage for assignment-derived ATEM helper behavior, camera selector wiring, and safe server logging.
- Modify `shared/camera-import.ts`: add pure helpers for formatting numbered camera names and deriving ATEM input IDs from assignments.
- Modify `client/src/components/ptz/camera-selector.tsx`: update assignment changes, save payloads, and swap payloads so numbered assignments own matching ATEM input IDs.
- Modify `server/routes/camera.ts`: log safe camera assignment / ATEM input changes after camera updates.

## Task 1: Add Failing Camera Assignment / ATEM Tests

**Files:**
- Create: `tests/camera-assignment-atem.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/camera-assignment-atem.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

Expected: FAIL with TypeScript import errors for `atemInputIdForCameraAssignment` and `formatCameraAssignmentName`, because the helpers do not exist yet.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/camera-assignment-atem.test.ts
git commit -m "test: specify camera assignment ATEM input sync"
```

## Task 2: Add Shared Assignment Helpers

**Files:**
- Modify: `shared/camera-import.ts`
- Test: `tests/camera-assignment-atem.test.ts`

- [ ] **Step 1: Add the shared helper functions**

In `shared/camera-import.ts`, after `getCameraAssignmentNumberFromName`, add:

```ts
export function formatCameraAssignmentName(assignment: number) {
  return `Camera ${assignment}`;
}

export function atemInputIdForCameraAssignment(
  assignment: number | null,
  manualAtemInputId: number | null,
) {
  return assignment ?? manualAtemInputId;
}
```

- [ ] **Step 2: Update existing import payload code to reuse the formatter**

In `buildDiscoveredCameraImportPayload`, replace:

```ts
name: assignment ? `Camera ${assignment}` : camera.name?.trim() || `Camera ${camera.ip}`,
```

with:

```ts
name: assignment ? formatCameraAssignmentName(assignment) : camera.name?.trim() || `Camera ${camera.ip}`,
```

- [ ] **Step 3: Run tests and verify helper tests pass while UI/logging tests still fail**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

Expected: helper assertions pass, but the new source assertions for `camera-selector.tsx` and `server/routes/camera.ts` still fail because those files have not been wired yet.

- [ ] **Step 4: Commit the shared helpers**

```bash
git add shared/camera-import.ts
git commit -m "feat: derive ATEM inputs from camera assignments"
```

## Task 3: Wire CameraSelector Assignment Saves

**Files:**
- Modify: `client/src/components/ptz/camera-selector.tsx`
- Test: `tests/camera-assignment-atem.test.ts`

- [ ] **Step 1: Import the new helpers**

Replace the existing import from `@shared/camera-import`:

```ts
import { getCameraAssignmentNumberFromName, sortCamerasByAssignmentName } from "@shared/camera-import";
```

with:

```ts
import {
  atemInputIdForCameraAssignment,
  formatCameraAssignmentName,
  getCameraAssignmentNumberFromName,
  sortCamerasByAssignmentName,
} from "@shared/camera-import";
```

- [ ] **Step 2: Add a local ATEM input parser**

After `const CUSTOM_CAMERA_ASSIGNMENT = "custom";`, add:

```ts
const parseAtemInputId = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
```

- [ ] **Step 3: Update manual name edits so typed numbered names update ATEM input**

Replace `handleNameChange` with:

```ts
  const handleNameChange = (name: string) => {
    const assignment = getCameraAssignmentNumberFromName(name);
    setEditForm({
      ...editForm,
      name,
      assignment: assignment ? String(assignment) : CUSTOM_CAMERA_ASSIGNMENT,
      atemInputId: assignment ? String(assignment) : editForm.atemInputId,
    });
  };
```

- [ ] **Step 4: Update assignment selector changes so numbered assignments update ATEM input visibly**

Replace `handleAssignmentChange` with:

```ts
  const handleAssignmentChange = (assignment: string) => {
    const nextAssignment = assignment === CUSTOM_CAMERA_ASSIGNMENT ? null : Number.parseInt(assignment, 10);

    setEditForm({
      ...editForm,
      assignment,
      name: nextAssignment ? formatCameraAssignmentName(nextAssignment) : editForm.name,
      atemInputId: nextAssignment ? String(nextAssignment) : editForm.atemInputId,
    });
  };
```

- [ ] **Step 5: Let camera update payloads intentionally clear ATEM input IDs**

In `cameraUpdatePayload`, replace:

```ts
    atemInputId: overrides.atemInputId ?? camera.atemInputId ?? null,
```

with:

```ts
    atemInputId: "atemInputId" in overrides ? overrides.atemInputId ?? null : camera.atemInputId ?? null,
```

This preserves the current fallback behavior when no ATEM input override is provided, while allowing custom/manual mode to clear the stored ATEM input by passing `null`.

- [ ] **Step 6: Update swap payloads so the displaced camera receives the previous assignment's ATEM input**

Inside `handleSave`, replace the swap update block:

```ts
        onUpdateCamera(assignmentConflict.id, cameraUpdatePayload(assignmentConflict, {
          name: `Camera ${currentAssignment}`,
        }));
```

with:

```ts
        onUpdateCamera(assignmentConflict.id, cameraUpdatePayload(assignmentConflict, {
          name: formatCameraAssignmentName(currentAssignment),
          atemInputId: atemInputIdForCameraAssignment(currentAssignment, assignmentConflict.atemInputId ?? null),
        }));
```

- [ ] **Step 7: Update edited camera payloads so numbered assignment owns the ATEM input**

In the edited camera `onUpdateCamera` payload inside `handleSave`, replace:

```ts
        atemInputId: editForm.atemInputId ? parseInt(editForm.atemInputId) : null,
```

with:

```ts
        atemInputId: atemInputIdForCameraAssignment(selectedAssignment, parseAtemInputId(editForm.atemInputId)),
```

- [ ] **Step 8: Run tests and verify UI source assertions pass while logging still fails**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

Expected: `camera-selector.tsx` source assertions pass, but `camera route logs safe assignment and ATEM input updates` still fails because the route log has not been added yet.

- [ ] **Step 9: Commit the selector wiring**

```bash
git add client/src/components/ptz/camera-selector.tsx
git commit -m "fix: sync ATEM input with camera assignment edits"
```

## Task 4: Add Safe Camera Update Logging

**Files:**
- Modify: `server/routes/camera.ts`
- Test: `tests/camera-assignment-atem.test.ts`

- [ ] **Step 1: Add safe logging after camera update persistence**

In the `app.patch("/api/cameras/:id", ...)` handler, immediately after this block:

```ts
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }
```

add:

```ts
      const assignmentChanged = previousCamera.name !== camera.name;
      const atemInputChanged = previousCamera.atemInputId !== camera.atemInputId;

      if (assignmentChanged || atemInputChanged) {
        logger.info("camera", "Camera assignment or ATEM input changed", {
          action: "camera:assignment_atem_update",
          details: {
            cameraId: camera.id,
            previousName: previousCamera.name,
            name: camera.name,
            previousAtemInputId: previousCamera.atemInputId ?? null,
            atemInputId: camera.atemInputId ?? null,
          },
        });
      }
```

This block intentionally excludes password, username, stream URL, and preview URL data. The logger can still provide an audit trail without volunteering secrets to future archaeology.

- [ ] **Step 2: Run tests and verify the focused suite passes**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

Expected: PASS for all node tests, including `tests/camera-assignment-atem.test.ts`.

- [ ] **Step 3: Commit the logging update**

```bash
git add server/routes/camera.ts tests/camera-assignment-atem.test.ts
git commit -m "feat: log camera assignment ATEM sync changes"
```

## Task 5: Full Verification

**Files:**
- Verify only; no planned edits.

- [ ] **Step 1: Run type checking**

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run the full test suite again**

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

Expected: PASS for all node tests.

- [ ] **Step 3: Run production build**

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
```

Expected: PASS and produce the production bundle.

- [ ] **Step 4: Inspect final diff**

```bash
git diff --stat HEAD~4..HEAD
git status --short --branch
```

Expected: branch is ahead with only the planned commits and no unstaged changes.

## Task 6: Manual Behavior Check

**Files:**
- Verify only; no planned edits.

- [ ] **Step 1: Start the development server if a browser check is needed**

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run dev
```

Expected: the app starts locally and reports the listening URL.

- [ ] **Step 2: Check assignment edit behavior in the UI**

In the dashboard camera settings dialog:

1. Open a numbered camera.
2. Change assignment to another numbered slot.
3. Confirm the ATEM input field changes to the same number before save.
4. Save.
5. If the assignment displaced another numbered camera, reopen both cameras and confirm the assignments and ATEM inputs swapped together.

- [ ] **Step 3: Stop the local server**

Stop the dev server process started in Step 1.

Expected: no local dev server remains running unless the user explicitly wants it left open.
