# Camera Assignment ATEM Input Sync Design

## Purpose

Keep camera assignment numbers and ATEM input numbers aligned when operators change numbered camera assignments.

Today, the camera settings dialog can move a camera from one numbered assignment to another, including swapping two cameras. The camera name changes, but the `atemInputId` field remains independent unless the operator edits it manually. That leaves tally routing and ATEM-related UI state pointed at the wrong physical camera, which is a delightful way to make a live switcher lie with confidence.

## Approved Behavior

For numbered camera assignments, the ATEM input number follows the assignment number.

Rules:

- Changing a camera to `Camera N` sets that camera's `atemInputId` to `N`.
- Swapping two numbered assignments also swaps the other camera's ATEM input:
  - If Camera A moves from `Camera 2` to `Camera 4`, Camera B currently assigned to `Camera 4` moves to `Camera 2`.
  - Camera A gets ATEM input `4`.
  - Camera B gets ATEM input `2`.
- Custom camera names keep manual ATEM input behavior.
- If a numbered camera is changed to a custom name, preserve the manually entered ATEM input from the form.
- Existing tally logic remains unchanged because it already reads `camera.atemInputId`.

## Implementation Scope

Implement this in `client/src/components/ptz/camera-selector.tsx`, where assignment changes and swaps are already assembled before calling `onUpdateCamera`.

The client should send coherent update payloads:

- The edited camera payload should derive `atemInputId` from the selected numbered assignment unless the assignment is custom.
- The swapped camera payload should derive `atemInputId` from the edited camera's previous numbered assignment.
- The ATEM input field should update in the dialog when the assignment selector changes to a numbered assignment, making the automatic behavior visible before save.

Do not add new backend storage fields or new ATEM commands. This is a metadata consistency fix, not a live switcher routing command.

## Data Flow

Existing flow:

1. User opens camera settings.
2. `CameraSelector` builds `editForm`.
3. User changes assignment.
4. `handleSave` calls `onUpdateCamera` once or twice.
5. Dashboard mutation sends camera update requests.
6. Server persists camera fields.
7. Tally state continues to map ATEM program/preview inputs to cameras via `atemInputId`.

Updated flow:

1. User selects `Camera N`.
2. `editForm.name` becomes `Camera N`.
3. `editForm.atemInputId` also becomes `N`.
4. On save, any swapped camera gets the previous numbered assignment and matching ATEM input.
5. Camera updates invalidate camera queries as they do today.
6. Tally logic observes the corrected `atemInputId` values through existing camera data.

## Logging

Preserve the existing server update path and add a safe camera settings log when either the camera name assignment or `atemInputId` changes. The log should include camera id, old and new camera names, old and new ATEM input values, and whether the update came from a swap when that can be known from the request sequence.

Do not log credentials, stream URLs containing secrets, or camera passwords. Apparently we still need to say this out loud, because logs are forever and embarrassment has high availability.

## Edge Cases

- If the edited camera currently has a custom name and moves to `Camera N`, set its ATEM input to `N`.
- If a numbered camera moves to a custom name, do not auto-clear the ATEM input; use the form field value.
- If an assignment conflict exists but no old numbered assignment exists, do not perform a swap. This matches the existing conflict behavior.
- If the ATEM input field is manually edited after selecting a numbered assignment, the first pass may still save the manually edited value only for custom assignment mode. Numbered assignment mode owns the matching input.

## Testing

Add focused coverage around the camera selector source and shared assignment helpers:

- Camera settings expose assignment controls and ATEM input controls.
- The assignment change handler updates the ATEM input field for numbered assignments.
- Save logic sets the edited camera's `atemInputId` from its selected assignment.
- Swap logic sets the conflicting camera's `atemInputId` from the edited camera's previous assignment.
- Existing assignment-order and preview-order tests continue to pass.

Run:

```bash
npm run test
npm run check
npm run build
```

## Out of Scope

- Sending live ATEM program or preview commands when assignments change.
- Rewriting tally-light logic.
- Adding a dedicated camera assignment column to the database.
- Changing scene button ATEM input behavior.
- Changing camera import behavior unless a test exposes the same mismatch there.

## Approval

The user approved keeping numbered camera assignments and ATEM input numbers synchronized.
