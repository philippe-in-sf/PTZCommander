# OBS Recording Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recording-only OBS controls so operators can view recording state and start, stop, pause, or resume OBS recording from the Dashboard.

**Architecture:** Extend the existing OBS WebSocket v5 client with recording state normalization, recording requests, and event handling. Expose recording routes through the existing OBS route module, then wire the existing Dashboard OBS card to React Query mutations and a guarded stop-recording confirmation.

**Tech Stack:** TypeScript, Express 5, ws, React 19, TanStack Query, Radix/shadcn UI, lucide-react, node:test.

---

## File Structure

- Modify `server/obs.ts`: add recording fields to `ObsState`, pure normalization helpers, OBS recording request methods, and `RecordStateChanged` event handling.
- Modify `server/routes/obs.ts`: add recording status/action routes and rehearsal-mode suppression.
- Modify `client/src/lib/api.ts`: extend `ObsState` and add recording API client methods.
- Modify `client/src/pages/dashboard.tsx`: add recording mutations and pass them into the OBS card.
- Modify `client/src/components/obs/obs-connection-card.tsx`: render recording status/actions and stop confirmation.
- Create `tests/obs-recording.test.ts`: test pure OBS recording status/event normalization.
- Modify `shared/version.ts`, `package.json`, `package-lock.json`, `README.md`, and `CHANGELOG.md`: bump to `1.7.5` and document the feature.

## Task 1: Test And Implement OBS Recording State Normalization

**Files:**
- Create: `tests/obs-recording.test.ts`
- Modify: `server/obs.ts`

- [ ] **Step 1: Write the failing normalization tests**

Create `tests/obs-recording.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test
```

Expected: FAIL with TypeScript/runtime import errors for `normalizeRecordingStatus` and `normalizeRecordingEvent`, because `server/obs.ts` does not export them yet.

- [ ] **Step 3: Add recording state fields and pure normalization helpers**

In `server/obs.ts`, extend `ObsState`:

```ts
export interface ObsState {
  connected: boolean;
  host: string;
  port: number;
  currentProgramScene: string | null;
  currentPreviewScene: string | null;
  studioMode: boolean;
  scenes: ObsScene[];
  recordingActive: boolean;
  recordingPaused: boolean;
  recordingTimecode: string | null;
  recordingDurationMs: number | null;
  recordingOutputPath: string | null;
  error?: string;
}
```

Add these helper types and functions after `obsAuth`:

```ts
type RecordingPatch = Pick<
  ObsState,
  "recordingActive" | "recordingPaused" | "recordingTimecode" | "recordingDurationMs" | "recordingOutputPath"
>;

export type ObsRecordingStatusData = {
  outputActive?: unknown;
  outputPaused?: unknown;
  outputTimecode?: unknown;
  outputDuration?: unknown;
  outputPath?: unknown;
};

export const DEFAULT_RECORDING_STATE: RecordingPatch = {
  recordingActive: false,
  recordingPaused: false,
  recordingTimecode: null,
  recordingDurationMs: null,
  recordingOutputPath: null,
};

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function durationOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeRecordingStatus(data: ObsRecordingStatusData | null | undefined): RecordingPatch {
  const recordingActive = Boolean(data?.outputActive);
  return {
    recordingActive,
    recordingPaused: recordingActive ? Boolean(data?.outputPaused) : false,
    recordingTimecode: stringOrNull(data?.outputTimecode),
    recordingDurationMs: durationOrNull(data?.outputDuration),
    recordingOutputPath: stringOrNull(data?.outputPath),
  };
}

export function normalizeRecordingEvent(eventData: ObsRecordingStatusData & { outputState?: unknown }, previous: ObsState): RecordingPatch {
  const outputState = typeof eventData.outputState === "string" ? eventData.outputState : "";
  const hasActiveFlag = typeof eventData.outputActive === "boolean";
  const recordingActive = hasActiveFlag
    ? Boolean(eventData.outputActive)
    : outputState.includes("STOPPED")
      ? false
      : outputState.includes("STARTED") || outputState.includes("PAUSED") || outputState.includes("RESUMED")
        ? true
        : previous.recordingActive;

  const recordingPaused = !recordingActive
    ? false
    : outputState.includes("PAUSED")
      ? true
      : outputState.includes("RESUMED") || outputState.includes("STARTED")
        ? false
        : previous.recordingPaused;

  return {
    recordingActive,
    recordingPaused,
    recordingTimecode: previous.recordingTimecode,
    recordingDurationMs: previous.recordingDurationMs,
    recordingOutputPath: stringOrNull(eventData.outputPath) ?? previous.recordingOutputPath,
  };
}
```

Update the constructor state in `ObsClient`:

```ts
this.state = {
  connected: false,
  host: config.host,
  port: config.port,
  currentProgramScene: null,
  currentPreviewScene: null,
  studioMode: false,
  scenes: [],
  ...DEFAULT_RECORDING_STATE,
};
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
npm run test
```

Expected: PASS for the new `obs-recording` tests and existing tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add server/obs.ts tests/obs-recording.test.ts
git commit -m "test: add OBS recording state normalization"
```

## Task 2: Add OBS Recording Requests And Events

**Files:**
- Modify: `server/obs.ts`

- [ ] **Step 1: Update `refreshState()` to include recording status**

Replace the current `refreshState()` implementation in `server/obs.ts` with:

```ts
async refreshState() {
  const [sceneList, studioMode, recordingStatus] = await Promise.all([
    this.request("GetSceneList"),
    this.request("GetStudioModeEnabled").catch(() => null),
    this.request("GetRecordStatus").then(normalizeRecordingStatus).catch(() => null),
  ]);
  this.setState({
    connected: true,
    scenes: Array.isArray(sceneList.scenes) ? sceneList.scenes : [],
    currentProgramScene: sceneList.currentProgramSceneName ?? null,
    currentPreviewScene: sceneList.currentPreviewSceneName ?? null,
    studioMode: Boolean(studioMode?.studioModeEnabled),
    ...(recordingStatus ?? {}),
    error: undefined,
  });
  return this.state;
}
```

- [ ] **Step 2: Add OBS recording methods**

Add these methods to `ObsClient` after `setCurrentPreviewScene()`:

```ts
async refreshRecordingStatus() {
  const data = await this.request("GetRecordStatus");
  this.setState(normalizeRecordingStatus(data));
  return this.state;
}

async startRecording() {
  await this.request("StartRecord");
  return this.refreshRecordingStatus();
}

async stopRecording() {
  const data = await this.request("StopRecord");
  const outputPath = stringOrNull(data?.outputPath);
  try {
    await this.refreshRecordingStatus();
  } catch {
    this.setState({
      recordingActive: false,
      recordingPaused: false,
      recordingTimecode: null,
      recordingDurationMs: null,
    });
  }
  if (outputPath) {
    this.setState({ recordingOutputPath: outputPath });
  }
  return this.state;
}

async pauseRecording() {
  await this.request("PauseRecord");
  return this.refreshRecordingStatus();
}

async resumeRecording() {
  await this.request("ResumeRecord");
  return this.refreshRecordingStatus();
}
```

- [ ] **Step 3: Handle OBS recording events**

In `handleMessage()`, extend the `OBS_OP_EVENT` branch:

```ts
} else if (eventType === "StudioModeStateChanged") {
  this.setState({ studioMode: Boolean(eventData.studioModeEnabled) });
} else if (eventType === "RecordStateChanged") {
  this.setState(normalizeRecordingEvent(eventData, this.state));
  if (eventData.outputActive) {
    await this.refreshRecordingStatus().catch(() => undefined);
  }
}
```

- [ ] **Step 4: Run typecheck and tests**

Run:

```bash
npm run check
npm run test
```

Expected: both commands pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add server/obs.ts
git commit -m "feat: track OBS recording state"
```

## Task 3: Add OBS Recording Routes With Rehearsal Suppression

**Files:**
- Modify: `server/routes/obs.ts`

- [ ] **Step 1: Import rehearsal mode**

At the top of `server/routes/obs.ts`, add:

```ts
import type { Response } from "express";
import type { ObsClient } from "../obs";
import { isRehearsalMode } from "../rehearsal";
```

- [ ] **Step 2: Register operator access for recording writes**

Inside `registerObsRoutes()`, after the existing program-scene access rule, add:

```ts
registerApiAccessRule(["POST"], /^\/api\/obs\/\d+\/recording\/(start|stop|pause|resume)$/, "operator");
```

- [ ] **Step 3: Add route helpers**

Inside `registerObsRoutes()`, after `persistCurrentState()`, add:

```ts
async function requireObsClient(id: number, res: Response) {
  const connection = await storage.getObsConnection(id);
  if (!connection) {
    res.status(404).json({ message: "OBS connection not found" });
    return null;
  }

  const client = obsManager.getClient();
  if (!client || !client.isConnected()) {
    res.status(503).json({ message: "OBS is not connected" });
    return null;
  }

  return { connection, client };
}

async function runRecordingAction(
  id: number,
  res: Response,
  actionLabel: string,
  action: (client: ObsClient) => Promise<unknown>,
) {
  const required = await requireObsClient(id, res);
  if (!required) return;

  if (isRehearsalMode()) {
    const details = `${actionLabel} suppressed by rehearsal mode`;
    addSessionLog("switcher", "OBS Recording", details);
    logger.warn("switcher", details, { action: "obs_recording_suppressed", details: { id, actionLabel } });
    broadcast({ type: "invalidate", keys: ["obs-status"] });
    return res.json({ success: true, suppressed: true, state: obsManager.getState() });
  }

  await action(required.client);
  await persistCurrentState(id, "online");
  addSessionLog("switcher", "OBS Recording", actionLabel);
  logger.info("switcher", actionLabel, { action: "obs_recording", details: { id, actionLabel } });
  broadcast({ type: "obs_state", ...obsManager.getState() });
  broadcast({ type: "invalidate", keys: ["obs-status"] });
  res.json({ success: true, suppressed: false, state: obsManager.getState() });
}
```

- [ ] **Step 4: Add recording routes**

Add these routes before the existing `/api/obs/:id/program` route:

```ts
app.get("/api/obs/:id/recording", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const connection = await storage.getObsConnection(id);
    if (!connection) return res.status(404).json({ message: "OBS connection not found" });

    const client = obsManager.getClient();
    if (client && client.isConnected()) {
      await client.refreshRecordingStatus();
      await persistCurrentState(id, "online");
      broadcast({ type: "obs_state", ...obsManager.getState() });
    }

    res.json({ success: true, state: obsManager.getState() || { connected: false, scenes: [] } });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to get OBS recording status" });
  }
});

app.post("/api/obs/:id/recording/start", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await runRecordingAction(id, res, "Recording started", async (client) => {
      await client.startRecording();
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to start OBS recording" });
  }
});

app.post("/api/obs/:id/recording/stop", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await runRecordingAction(id, res, "Recording stopped", async (client) => {
      await client.stopRecording();
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to stop OBS recording" });
  }
});

app.post("/api/obs/:id/recording/pause", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await runRecordingAction(id, res, "Recording paused", async (client) => {
      await client.pauseRecording();
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to pause OBS recording" });
  }
});

app.post("/api/obs/:id/recording/resume", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await runRecordingAction(id, res, "Recording resumed", async (client) => {
      await client.resumeRecording();
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to resume OBS recording" });
  }
});
```

- [ ] **Step 5: Run typecheck and tests**

Run:

```bash
npm run check
npm run test
```

Expected: both commands pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add server/routes/obs.ts
git commit -m "feat: add OBS recording routes"
```

## Task 4: Add Client OBS Recording API And Dashboard Mutations

**Files:**
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/pages/dashboard.tsx`

- [ ] **Step 1: Extend client OBS types**

In `client/src/lib/api.ts`, extend `ObsState`:

```ts
export interface ObsState {
  connected: boolean;
  host?: string;
  port?: number;
  currentProgramScene?: string | null;
  currentPreviewScene?: string | null;
  studioMode?: boolean;
  scenes?: ObsScene[];
  recordingActive?: boolean;
  recordingPaused?: boolean;
  recordingTimecode?: string | null;
  recordingDurationMs?: number | null;
  recordingOutputPath?: string | null;
  error?: string;
}

export interface ObsRecordingResponse {
  success: boolean;
  suppressed?: boolean;
  state: ObsState;
}
```

- [ ] **Step 2: Add client recording methods**

Inside `obsApi`, after `setProgramScene`, add:

```ts
  getRecordingStatus: async (id: number): Promise<ObsRecordingResponse> => {
    const res = await fetch(`${API_BASE}/obs/${id}/recording`);
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.message || "Failed to get OBS recording status");
    return payload;
  },

  startRecording: async (id: number): Promise<ObsRecordingResponse> => {
    const res = await fetch(`${API_BASE}/obs/${id}/recording/start`, { method: "POST" });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.message || "Failed to start OBS recording");
    return payload;
  },

  stopRecording: async (id: number): Promise<ObsRecordingResponse> => {
    const res = await fetch(`${API_BASE}/obs/${id}/recording/stop`, { method: "POST" });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.message || "Failed to stop OBS recording");
    return payload;
  },

  pauseRecording: async (id: number): Promise<ObsRecordingResponse> => {
    const res = await fetch(`${API_BASE}/obs/${id}/recording/pause`, { method: "POST" });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.message || "Failed to pause OBS recording");
    return payload;
  },

  resumeRecording: async (id: number): Promise<ObsRecordingResponse> => {
    const res = await fetch(`${API_BASE}/obs/${id}/recording/resume`, { method: "POST" });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.message || "Failed to resume OBS recording");
    return payload;
  },
```

- [ ] **Step 3: Add dashboard mutation helper**

In `client/src/pages/dashboard.tsx`, after `setObsSceneMutation`, add:

```tsx
  function handleObsRecordingSuccess(action: string, suppressed?: boolean) {
    queryClient.invalidateQueries({ queryKey: ["obs-status"] });
    if (suppressed) {
      toast.info(`${action} suppressed by rehearsal mode`);
    } else {
      toast.success(action);
    }
  }

  const startObsRecordingMutation = useMutation({
    mutationFn: (id: number) => obsApi.startRecording(id),
    onSuccess: (data) => handleObsRecordingSuccess("OBS recording started", data.suppressed),
    onError: (error: Error) => toast.error(error.message),
  });

  const stopObsRecordingMutation = useMutation({
    mutationFn: (id: number) => obsApi.stopRecording(id),
    onSuccess: (data) => handleObsRecordingSuccess("OBS recording stopped", data.suppressed),
    onError: (error: Error) => toast.error(error.message),
  });

  const pauseObsRecordingMutation = useMutation({
    mutationFn: (id: number) => obsApi.pauseRecording(id),
    onSuccess: (data) => handleObsRecordingSuccess("OBS recording paused", data.suppressed),
    onError: (error: Error) => toast.error(error.message),
  });

  const resumeObsRecordingMutation = useMutation({
    mutationFn: (id: number) => obsApi.resumeRecording(id),
    onSuccess: (data) => handleObsRecordingSuccess("OBS recording resumed", data.suppressed),
    onError: (error: Error) => toast.error(error.message),
  });
```

- [ ] **Step 4: Pass recording props into `OBSConnectionCard`**

In the `OBSConnectionCard` call in `client/src/pages/dashboard.tsx`, add:

```tsx
            onStartRecording={() => obsConnection && startObsRecordingMutation.mutate(obsConnection.id)}
            onStopRecording={() => obsConnection && stopObsRecordingMutation.mutate(obsConnection.id)}
            onPauseRecording={() => obsConnection && pauseObsRecordingMutation.mutate(obsConnection.id)}
            onResumeRecording={() => obsConnection && resumeObsRecordingMutation.mutate(obsConnection.id)}
            recordingPending={
              startObsRecordingMutation.isPending ||
              stopObsRecordingMutation.isPending ||
              pauseObsRecordingMutation.isPending ||
              resumeObsRecordingMutation.isPending
            }
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run check
```

Expected: FAIL because `OBSConnectionCard` does not yet accept the new props. This confirms the dashboard wiring is reaching the component.

- [ ] **Step 6: Commit after Task 5 passes instead of now**

Do not commit this task yet. It intentionally depends on the component prop changes in Task 5.

## Task 5: Render Recording Controls In The OBS Card

**Files:**
- Modify: `client/src/components/obs/obs-connection-card.tsx`
- Modify: `client/src/pages/dashboard.tsx`

- [ ] **Step 1: Add imports**

In `client/src/components/obs/obs-connection-card.tsx`, extend imports:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CircleDot, Pause, Square } from "lucide-react";
```

Keep the existing lucide import and either merge these names into it or use one lucide import:

```tsx
import { CircleDot, Pause, Plus, Radio, Repeat, Play, LogOut, Square, Trash2, Wifi } from "lucide-react";
```

- [ ] **Step 2: Add recording props**

Extend the function destructuring and prop type:

```tsx
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  recordingPending,
```

```tsx
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  recordingPending: boolean;
```

- [ ] **Step 3: Add recording display helpers**

Before `return`, after `selectableSceneNames`, add:

```tsx
  const recordingActive = Boolean(status?.recordingActive);
  const recordingPaused = Boolean(status?.recordingPaused);
  const recordingLabel = !connected
    ? "Unknown"
    : recordingPaused
      ? "Paused"
      : recordingActive
        ? "Recording"
        : "Standby";
  const recordingClass = recordingPaused
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
    : recordingActive
      ? "bg-red-500/10 text-red-600 dark:text-red-300"
      : connected
        ? "bg-slate-500/10 text-slate-600 dark:text-slate-300"
        : "bg-slate-500/10 text-slate-500 dark:text-slate-400";
  const canStartRecording = connected && !recordingActive && !recordingPending;
  const canStopRecording = connected && recordingActive && !recordingPending;
  const canPauseRecording = connected && recordingActive && !recordingPaused && !recordingPending;
  const canResumeRecording = connected && recordingActive && recordingPaused && !recordingPending;
```

- [ ] **Step 4: Render recording controls**

Inside the connected `div className="grid gap-2"` block, after the scene switching grid and before the connect/disconnect row, add:

```tsx
            {connection && (
              <div className="rounded-md border border-slate-400/30 dark:border-slate-800 bg-slate-200/50 dark:bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]", recordingClass)}>
                        <CircleDot className="mr-1 h-3 w-3" />
                        {recordingLabel}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Recording</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {status?.recordingTimecode
                        ? `Timecode ${status.recordingTimecode}`
                        : status?.recordingOutputPath
                          ? `Last file: ${status.recordingOutputPath}`
                          : connected
                            ? "OBS recording output is ready"
                            : "Connect OBS to read recording state"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!recordingActive && (
                      <Button size="sm" variant="outline" onClick={onStartRecording} disabled={!canStartRecording} data-testid="button-start-obs-recording">
                        <CircleDot className="h-4 w-4 mr-2" /> Start Recording
                      </Button>
                    )}
                    {recordingActive && !recordingPaused && (
                      <Button size="sm" variant="outline" onClick={onPauseRecording} disabled={!canPauseRecording} data-testid="button-pause-obs-recording">
                        <Pause className="h-4 w-4 mr-2" /> Pause
                      </Button>
                    )}
                    {recordingActive && recordingPaused && (
                      <Button size="sm" variant="outline" onClick={onResumeRecording} disabled={!canResumeRecording} data-testid="button-resume-obs-recording">
                        <Play className="h-4 w-4 mr-2" /> Resume
                      </Button>
                    )}
                    {recordingActive && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" disabled={!canStopRecording} data-testid="button-stop-obs-recording">
                            <Square className="h-4 w-4 mr-2" /> Stop Recording
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Stop OBS recording?</AlertDialogTitle>
                            <AlertDialogDescription>
                              OBS will stop writing the current recording file. This cannot be undone from PTZ Command.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={onStopRecording} className="bg-red-600 text-white hover:bg-red-700">
                              Stop Recording
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </div>
            )}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run check
```

Expected: PASS. If `variant="destructive"` is not supported by the local button variant type, use `variant="outline"` plus `className="border-red-500/40 text-red-600 hover:text-red-700 dark:text-red-300"`.

- [ ] **Step 6: Commit Tasks 4 and 5 together**

```bash
git add client/src/lib/api.ts client/src/pages/dashboard.tsx client/src/components/obs/obs-connection-card.tsx
git commit -m "feat: add OBS recording controls to dashboard"
```

## Task 6: Version, Changelog, And Documentation

**Files:**
- Modify: `shared/version.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump app version to 1.7.5**

Update `shared/version.ts`:

```ts
export const APP_VERSION = "1.7.5";
```

Update `package.json`:

```json
  "version": "1.7.5",
```

Update both top-level `1.7.4` values in `package-lock.json` to `1.7.5`.

Update `README.md`:

```md
Current version: **1.7.5**
```

- [ ] **Step 2: Add changelog entry**

Add this section immediately after the `# Changelog` intro:

```md
## [1.7.5] - 2026-06-13

### Added
- **OBS Recording Controls** - added Dashboard recording status plus start, stop, pause, and resume controls for OBS WebSocket recording, with stop confirmation and rehearsal-mode suppression.

### Changed
- **Version Display** - interface version labels now report v1.7.5
```

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS. This specifically catches version drift across `package.json`, `shared/version.ts`, and `README.md`.

- [ ] **Step 4: Commit Task 6**

```bash
git add shared/version.ts package.json package-lock.json README.md CHANGELOG.md
git commit -m "chore: bump version for OBS recording controls"
```

## Task 7: Full Verification

**Files:**
- No source file changes expected.

- [ ] **Step 1: Run full static and test checks**

Run:

```bash
npm run check
npm run test
npm run lint
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Start the dev server**

Run:

```bash
npm run dev
```

Expected: server starts on `http://localhost:3478` unless the port is already occupied.

- [ ] **Step 3: Browser smoke test**

Use the Browser plugin against `http://localhost:3478`:

- Log in if the local session requires it.
- Open the Dashboard.
- Confirm the OBS card renders without layout overlap.
- If no OBS connection exists, confirm the Add OBS path still renders.
- If OBS is configured but disconnected, confirm recording status shows `Unknown` and controls are disabled.
- If OBS is connected, confirm recording status appears and start/pause/resume/stop buttons match the live state.
- Confirm stop recording opens a confirmation dialog instead of immediately firing.

- [ ] **Step 4: Stop the dev server**

Stop the dev server session cleanly with `Ctrl-C`.

- [ ] **Step 5: Final git status review**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing dirty files remain. Do not stage or revert unrelated files.
