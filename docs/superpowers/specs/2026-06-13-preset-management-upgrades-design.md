# Preset Management Upgrades Design

## Goal

Add the first useful slice of preset management: operators can manage saved preset slots from the Dashboard, refresh thumbnails, and get a warning before moving a camera that is currently on program.

## Scope

This pass covers the classic Dashboard preset grid and the shared preset recall handler used by the dashboard skins. It adds:

- Rename for saved presets.
- Delete for saved presets.
- Thumbnail refresh for saved presets.
- Program/live camera recall warning before moving a camera that is marked as program.
- A single recall path so one click does not send duplicate recall commands.

This pass does not add bulk rename, preset notes, groups, compare, or drift checks. Drift checks require reliable live PTZ pose reads from the camera link; without that, the feature would be a confidence costume with no camera behind it.

## Current State

Preset rows already include:

- `name`
- `thumbnail`
- `pan`, `tilt`, `zoom`, `focus`
- `createdAt`
- `updatedAt`

The server already exposes:

- `GET /api/cameras/:id/presets`
- `POST /api/presets`
- `PATCH /api/presets/:id`
- `POST /api/presets/:id/recall`
- `DELETE /api/presets/:id`

The classic preset grid shows 16 slots and supports recall/store modes, but it does not expose update/delete actions. The Dashboard recall handler currently calls the REST recall route and then also sends a WebSocket recall command, so this pass will make recall use one server-backed path.

## User Experience

Saved preset slots get a compact manage action. Opening it shows a preset management dialog with:

- Slot number and current preset name.
- Thumbnail preview when available.
- Editable name field.
- Recall button.
- Refresh Thumbnail button.
- Delete button with destructive confirmation.
- Metadata such as last updated time when available.

The recall/store slot grid remains dense and operator-friendly. Empty slots still behave as they do now: they can be stored in store mode and ignored in recall mode.

When a recall targets a selected camera that is currently program/live, the app opens a confirmation dialog before sending the move. The warning uses camera state already present on `Camera`:

- `tallyState === "program"`
- or `isProgramOutput === true`

Preview/offline cameras do not get this warning. If the operator confirms, the existing server recall route executes the move.

## API Changes

Add client API methods:

- `presetApi.update(id, updates)`
- `presetApi.refreshThumbnail(id)`

`presetApi.update` uses the existing `PATCH /api/presets/:id` route.

Add a new server route:

- `POST /api/presets/:id/thumbnail`

The thumbnail route loads the preset and its camera, captures a fresh thumbnail using the same preview/snapshot infrastructure available to the server, stores it on the preset, broadcasts `presets` invalidation, and returns the updated preset. If the camera has no usable preview source or capture fails, the route returns a clear error and leaves the existing thumbnail unchanged.

The preset API access rule must include `/api/presets/:id/thumbnail` for operator writes.

## Data Flow

Rename:

1. Operator edits the name in the preset dialog.
2. Client calls `PATCH /api/presets/:id` with `{ name }`.
3. Server validates with `patchPresetSchema`.
4. Server saves the preset through existing storage.
5. Client updates React Query cache and invalidates `["presets", cameraId]`.

Delete:

1. Operator confirms delete.
2. Client calls `DELETE /api/presets/:id`.
3. Server deletes the row and broadcasts invalidation.
4. Client removes the preset from the local cache and invalidates `["presets", cameraId]`.

Refresh Thumbnail:

1. Operator clicks Refresh Thumbnail.
2. Client calls `POST /api/presets/:id/thumbnail`.
3. Server captures a fresh frame from the camera preview source.
4. Server patches the preset thumbnail.
5. Client updates cache and invalidates `["presets", cameraId]`.

Recall:

1. Operator recalls a saved preset.
2. Client checks whether the selected camera is program/live.
3. If program/live, client asks for confirmation.
4. Client calls `POST /api/presets/:id/recall`.
5. Server sends the VISCA recall command and logs the session event.

## Error Handling

Rename failures show a toast and keep the dialog open.

Delete failures show a toast and keep the preset visible.

Thumbnail refresh failures show the server message. Common failures include no preview URL, unsupported preview source, camera preview timeout, and FFmpeg unavailable for RTSP/RTP sources.

Recall failures show the server message. Program/live warning cancellation does not show an error because the operator intentionally cancelled the move.

## Testing

Add focused tests for pure preset management behavior:

- Program recall warning is required for `tallyState: "program"`.
- Program recall warning is required for `isProgramOutput: true`.
- Program recall warning is not required for preview/off cameras.
- Empty or whitespace-only preset names normalize to `null`.

Run the existing project checks after implementation:

- `npm run test`
- `npm run check`
- `npm run build`

Also smoke-test the UI in the browser:

- Open the Dashboard.
- Confirm saved preset slots expose a manage action.
- Confirm rename/delete/refresh controls render without layout overlap.
- Confirm program/live recall warning appears when the selected camera is marked program, if test data is available.

## Documentation

Update `README.md` and `CHANGELOG.md` to describe preset management. Bump the app version after implementation.

## Open Decisions

This design intentionally keeps preset management on the classic Dashboard only. The alternate skins still inherit the safer recall path, but their preset grids do not get management controls in this pass because those files currently have unrelated local edits and the first slice should not grow tentacles just to look busy.
