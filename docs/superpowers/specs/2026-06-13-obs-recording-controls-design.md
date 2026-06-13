# OBS Recording Controls Design

## Goal

Add recording-only OBS control to PTZ Command so operators can see OBS recording state and start, stop, pause, or resume recording from the existing Dashboard OBS card.

## Scope

This first pass is intentionally limited to recording. It does not add streaming start/stop controls, recording automation inside macros or runsheets, multi-OBS support, persistent recording state columns, or a dedicated OBS page.

## Current Context

PTZ Command already has a single OBS WebSocket v5 integration:

- `server/obs.ts` connects to OBS, authenticates, tracks scene and studio-mode state, sends OBS requests, and handles OBS events.
- `server/routes/obs.ts` exposes OBS connection, status, scene-list, and program-scene routes.
- `client/src/lib/api.ts` defines the OBS API client and `ObsState` type.
- `client/src/components/obs/obs-connection-card.tsx` renders the Dashboard OBS control card.
- `client/src/pages/dashboard.tsx` owns the OBS queries and mutations passed into that card.
- Rehearsal mode already suppresses live writes for ATEM, OBS program scene changes, and X32 output writes.

## Proposed Behavior

When OBS is connected, the Dashboard OBS card will show recording status:

- `Recording` when OBS reports active recording.
- `Paused` when OBS reports recording active and paused.
- `Standby` when OBS reports no active recording.
- `Unknown` when OBS is disconnected or status cannot be read.

Operators can:

- Start recording when OBS is connected and not recording.
- Stop recording when OBS is connected and recording.
- Pause recording when OBS is recording and not paused.
- Resume recording when OBS is recording and paused.
- Refresh OBS state using the existing refresh affordance.

Stopping recording requires a confirmation dialog. Starting, pausing, and resuming do not require confirmation because they are reversible or low-risk compared with ending the capture.

## Server Design

Extend `ObsState` in `server/obs.ts` with live recording fields:

- `recordingActive: boolean`
- `recordingPaused: boolean`
- `recordingTimecode: string | null`
- `recordingDurationMs: number | null`
- `recordingOutputPath: string | null`

These fields remain in memory and are not persisted. OBS is the source of truth. Persisting live output state would create stale database theater, which is not a hobby worth funding.

Add `ObsClient` methods:

- `refreshRecordingStatus()`
- `startRecording()`
- `stopRecording()`
- `pauseRecording()`
- `resumeRecording()`

OBS WebSocket request mapping:

- `GetRecordStatus`
- `StartRecord`
- `StopRecord`
- `PauseRecord`
- `ResumeRecord`

`refreshState()` will include recording status in its state refresh. OBS output events will update state when OBS emits recording changes. The client will handle OBS v5 `RecordStateChanged` events and will also run an explicit `GetRecordStatus` refresh after each recording write command.

## Route Design

Add operator-only routes in `server/routes/obs.ts`:

- `GET /api/obs/:id/recording`
- `POST /api/obs/:id/recording/start`
- `POST /api/obs/:id/recording/stop`
- `POST /api/obs/:id/recording/pause`
- `POST /api/obs/:id/recording/resume`

All routes require a configured OBS connection. Write routes require an active OBS WebSocket client.

Read route behavior:

- Return current recording state.
- If OBS is connected, refresh from OBS before responding.
- If OBS is disconnected, return the current in-memory state with `connected: false`.

Write route behavior:

- If rehearsal mode is enabled, suppress the OBS write, add a session-log entry noting suppression, broadcast state invalidation, and return a successful suppressed response.
- Otherwise call the matching `ObsClient` method.
- Refresh recording status after the write.
- Add a session-log entry for the operator action.
- Broadcast `obs_state` and invalidate `obs-status`.

## Client Design

Extend `ObsState` in `client/src/lib/api.ts` with the same recording fields. Add API client methods:

- `getRecordingStatus(id)`
- `startRecording(id)`
- `stopRecording(id)`
- `pauseRecording(id)`
- `resumeRecording(id)`

Update `OBSConnectionCard` to accept recording handlers and pending states. The card will render a compact recording control panel when an OBS connection exists:

- A status pill: `Recording`, `Paused`, `Standby`, `Unknown`.
- A timecode line when OBS provides one.
- Primary action button:
  - `Start Recording` when standby.
  - `Resume` when paused.
  - `Pause` when recording.
- Secondary destructive `Stop Recording` button when recording or paused.

Use existing `Button`, `AlertDialog`, and lucide icons. Keep controls inside the existing OBS card instead of creating another page.

Update `client/src/pages/dashboard.tsx` to wire React Query mutations for recording actions. On success, invalidate `obs-status`. Do not invalidate `obs-scenes` or `health-devices` in this pass because recording state does not affect scene lists or the existing health response.

## Error Handling

The server returns clear error messages for:

- Missing OBS connection.
- OBS not connected.
- OBS WebSocket request failure.
- OBS WebSocket timeout.

The client displays failed writes with `toast.error(error.message)`.

Buttons are disabled when:

- OBS is disconnected.
- A relevant mutation is pending.
- The requested action does not match current recording state.

## Rehearsal Mode

Recording write routes honor rehearsal mode. Reads still work.

When rehearsal mode is enabled:

- `start`, `stop`, `pause`, and `resume` do not send OBS write requests.
- The server logs a session event explaining that the recording action was suppressed.
- The client receives a successful response indicating suppression so operators understand the click was acknowledged but not sent to OBS.

## Testing

Add focused tests for the new recording state mapping:

- OBS recording status normalization maps OBS response fields into `ObsState`.
- OBS `RecordStateChanged` event normalization maps event data into `ObsState`.
- Existing public DTO tests continue to verify OBS passwords are redacted.

Run:

- `npm run check`
- `npm run test`
- `npm run lint`

## Rollout

This feature is a recording-only increment. After it is stable, streaming controls can reuse the same architecture with stricter confirmation copy and a more visible live-state treatment.
