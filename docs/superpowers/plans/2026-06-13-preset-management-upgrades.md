# Preset Management Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Dashboard preset management for rename, delete, thumbnail refresh, and program-camera recall confirmation.

**Architecture:** Put small reusable preset rules in a shared module and put server thumbnail refresh behavior behind a focused helper that can be tested without Express. Reuse existing preset storage and routes, add one thumbnail refresh route, and keep the operator UI inside the classic Dashboard preset area while sharing safer recall behavior with alternate skins.

**Tech Stack:** React 19, TanStack Query, Radix Dialog/AlertDialog, Express, TypeScript, node:test, existing PTZ Command storage/API patterns.

---

## File Structure

- Create `shared/preset-management.ts`: pure helper functions for recall warning and preset-name normalization.
- Create `server/preset-thumbnails.ts`: testable thumbnail-refresh workflow shared by the Express route.
- Create `tests/preset-management.test.ts`: focused tests for shared preset rules and server thumbnail refresh.
- Create `client/src/components/ptz/preset-management-dialog.tsx`: rename/delete/refresh/recall dialog for one saved preset.
- Modify `client/src/components/ptz/preset-grid.tsx`: add compact manage action for saved slots.
- Modify `client/src/lib/api.ts`: add `presetApi.update` and `presetApi.refreshThumbnail`.
- Modify `client/src/pages/dashboard.tsx`: add management mutations, dialog state, and program recall warning.
- Modify `server/routes/camera.ts`: register and implement `POST /api/presets/:id/thumbnail`.
- Modify `shared/version.ts`, `package.json`, `package-lock.json`, `README.md`, and `CHANGELOG.md`: version bump and docs.

Use the bundled Node runtime for local commands in this workspace:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH <command>
```

## Task 1: Pure Preset Management Rules

**Files:**
- Create: `shared/preset-management.ts`
- Create: `tests/preset-management.test.ts`

- [ ] **Step 1: Write failing tests for recall warning and name normalization**

Create `tests/preset-management.test.ts` with:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePresetName,
  requiresProgramRecallConfirmation,
} from "@shared/preset-management";

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
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test tests/preset-management.test.ts
```

Expected: FAIL with an import error for `@shared/preset-management`.

- [ ] **Step 3: Add the pure helper module**

Create `shared/preset-management.ts` with:

```ts
export interface PresetRecallCameraState {
  tallyState?: string | null;
  isProgramOutput?: boolean | null;
}

export function requiresProgramRecallConfirmation(camera?: PresetRecallCameraState | null) {
  return camera?.tallyState === "program" || camera?.isProgramOutput === true;
}

export function normalizePresetName(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test tests/preset-management.test.ts
```

Expected: PASS for the pure helper tests.

- [ ] **Step 5: Commit pure helper work**

Run:

```bash
git add shared/preset-management.ts tests/preset-management.test.ts
git commit -m "feat: add preset management helpers"
```

## Task 2: Server Thumbnail Refresh Core

**Files:**
- Create: `server/preset-thumbnails.ts`
- Modify: `tests/preset-management.test.ts`

- [ ] **Step 1: Add failing thumbnail refresh tests**

Append to `tests/preset-management.test.ts`:

```ts
import { refreshPresetThumbnail } from "../server/preset-thumbnails";

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
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test tests/preset-management.test.ts
```

Expected: FAIL with an import error for `../server/preset-thumbnails`.

- [ ] **Step 3: Add the thumbnail refresh helper**

Create `server/preset-thumbnails.ts` with:

```ts
import type { Camera, InsertPreset, Preset } from "@shared/schema";

export interface PresetThumbnailStorage {
  getPresetById(id: number): Promise<Preset | undefined>;
  getCamera(id: number): Promise<Camera | undefined>;
  savePreset(preset: InsertPreset): Promise<Preset>;
}

export type PresetThumbnailCapture = (url: string) => Promise<string | null>;

export async function refreshPresetThumbnail(
  storage: PresetThumbnailStorage,
  presetId: number,
  captureSnapshot: PresetThumbnailCapture,
) {
  const preset = await storage.getPresetById(presetId);
  if (!preset) {
    throw new Error("Preset not found");
  }

  const camera = await storage.getCamera(preset.cameraId);
  if (!camera) {
    throw new Error("Camera not found");
  }

  if (!camera.streamUrl) {
    throw new Error(`No preview URL configured for ${camera.name}`);
  }

  const thumbnail = await captureSnapshot(camera.streamUrl);
  if (!thumbnail) {
    throw new Error(`Could not capture thumbnail for ${camera.name}`);
  }

  return storage.savePreset({
    cameraId: preset.cameraId,
    presetNumber: preset.presetNumber,
    name: preset.name,
    thumbnail,
    pan: preset.pan,
    tilt: preset.tilt,
    zoom: preset.zoom,
    focus: preset.focus,
  });
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test tests/preset-management.test.ts
```

Expected: PASS for all preset management tests.

- [ ] **Step 5: Commit thumbnail helper work**

Run:

```bash
git add server/preset-thumbnails.ts tests/preset-management.test.ts
git commit -m "feat: add preset thumbnail refresh helper"
```

## Task 3: Preset API Methods and Thumbnail Route

**Files:**
- Modify: `client/src/lib/api.ts`
- Modify: `server/routes/camera.ts`

- [ ] **Step 1: Add client preset API methods**

In `client/src/lib/api.ts`, extend `presetApi` after `recall` and before `delete`:

```ts
  update: async (id: number, updates: Partial<Preset>): Promise<Preset> => {
    const res = await fetch(`${API_BASE}/presets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to update preset");
    }
    return res.json();
  },

  refreshThumbnail: async (id: number): Promise<Preset> => {
    const res = await fetch(`${API_BASE}/presets/${id}/thumbnail`, {
      method: "POST",
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to refresh preset thumbnail");
    }
    return res.json();
  },
```

- [ ] **Step 2: Wire the server thumbnail route**

In `server/routes/camera.ts`:

Add this import:

```ts
import { refreshPresetThumbnail } from "../preset-thumbnails";
```

Update the preset access rule to include `/thumbnail`:

```ts
registerApiAccessRule(["PATCH", "POST", "DELETE"], /^\/api\/presets(?:\/\d+)?(?:\/(?:recall|thumbnail))?$/, "operator");
```

Add the route before `app.delete("/api/presets/:id", ...)`:

```ts
  app.post("/api/presets/:id/thumbnail", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const preset = await refreshPresetThumbnail(storage, id, captureSnapshot);
      logger.info("preset", `Preset thumbnail refreshed`, {
        action: "preset_thumbnail_refresh",
        details: { presetId: preset.id, cameraId: preset.cameraId, presetNumber: preset.presetNumber },
      });
      broadcast({ type: "invalidate", keys: ["presets"] });
      res.json(preset);
    } catch (error: any) {
      const message = error?.message || "Failed to refresh preset thumbnail";
      const status = message === "Preset not found" || message === "Camera not found" ? 404 : 400;
      res.status(status).json({ message });
    }
  });
```

- [ ] **Step 3: Type-check the route/API work**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit route/API work**

Run:

```bash
git add client/src/lib/api.ts server/routes/camera.ts
git commit -m "feat: add preset thumbnail refresh route"
```

## Task 4: Preset Management Dialog and Grid Action

**Files:**
- Create: `client/src/components/ptz/preset-management-dialog.tsx`
- Modify: `client/src/components/ptz/preset-grid.tsx`

- [ ] **Step 1: Create the preset management dialog**

Create `client/src/components/ptz/preset-management-dialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Camera, ImagePlus, Play, Save, Trash2 } from "lucide-react";
import type { Preset } from "@shared/schema";
import { normalizePresetName } from "@shared/preset-management";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PresetManagementDialogProps {
  preset: Preset | null;
  cameraName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveName: (preset: Preset, name: string | null) => void;
  onRefreshThumbnail: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  onRecall: (preset: Preset) => void;
  saving?: boolean;
  refreshing?: boolean;
  deleting?: boolean;
  recalling?: boolean;
}

function formatPresetDate(value: Preset["updatedAt"]) {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function PresetManagementDialog({
  preset,
  cameraName,
  open,
  onOpenChange,
  onSaveName,
  onRefreshThumbnail,
  onDelete,
  onRecall,
  saving = false,
  refreshing = false,
  deleting = false,
  recalling = false,
}: PresetManagementDialogProps) {
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setName(preset?.name || "");
    setConfirmDelete(false);
  }, [preset?.id, preset?.name, open]);

  if (!preset) return null;

  const normalizedName = normalizePresetName(name);
  const unchanged = normalizedName === (preset.name || null);
  const busy = saving || refreshing || deleting || recalling;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-200 dark:bg-slate-950 border-slate-300 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-cyan-500" />
            Preset {preset.presetNumber + 1}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-950 aspect-video">
            {preset.thumbnail ? (
              <img src={preset.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs font-mono uppercase tracking-[0.18em] text-slate-500">
                No Thumbnail
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
            <div>
              <div className="font-mono uppercase tracking-[0.16em] text-slate-500">Camera</div>
              <div className="mt-1 text-slate-900 dark:text-slate-100">{cameraName || `Camera ${preset.cameraId}`}</div>
            </div>
            <div>
              <div className="font-mono uppercase tracking-[0.16em] text-slate-500">Updated</div>
              <div className="mt-1 text-slate-900 dark:text-slate-100">{formatPresetDate(preset.updatedAt)}</div>
            </div>
          </div>

          <div>
            <Label htmlFor="preset-name">Preset Name</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`Preset ${preset.presetNumber + 1}`}
              data-testid="input-preset-name"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onRecall(preset)}
              disabled={busy}
              data-testid="button-dialog-recall-preset"
            >
              <Play className="h-4 w-4" /> Recall
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onRefreshThumbnail(preset)}
              disabled={busy}
              data-testid="button-refresh-preset-thumbnail"
            >
              <ImagePlus className="h-4 w-4" /> Refresh Thumbnail
            </Button>
          </div>

          {confirmDelete ? (
            <div className="rounded-lg border border-red-400/50 bg-red-500/10 p-3 space-y-3">
              <div className="text-sm font-medium text-red-700 dark:text-red-300">Delete this preset slot?</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => onDelete(preset)}
                  disabled={busy}
                  data-testid="button-confirm-delete-preset"
                >
                  <Trash2 className="h-4 w-4" /> Delete Preset
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              data-testid="button-delete-preset"
            >
              <Trash2 className="h-4 w-4" /> Delete Preset
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          <Button
            type="button"
            onClick={() => onSaveName(preset, normalizedName)}
            disabled={busy || unchanged}
            data-testid="button-save-preset-name"
          >
            <Save className="h-4 w-4" /> Save Name
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add manage action to saved preset slots**

Modify `client/src/components/ptz/preset-grid.tsx`:

Add `Settings` to the icon import:

```ts
import { Save, Play, Settings } from "lucide-react";
```

Extend props:

```ts
  onManage?: (preset: Preset) => void;
```

Update the component signature:

```ts
export function PresetGrid({ presets, onRecall, onStore, onManage }: PresetGridProps) {
```

Inside saved slot rendering, add a manage button before the slot labels:

```tsx
              {preset && mode !== 'store' && onManage && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onManage(preset);
                  }}
                  className="absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded bg-slate-950/70 text-slate-200 opacity-0 transition-opacity hover:bg-cyan-600 group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Manage preset ${i + 1}`}
                  data-testid={`button-manage-preset-${i}`}
                >
                  <Settings className="h-3 w-3" />
                </button>
              )}
```

- [ ] **Step 3: Type-check the component work**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit dialog/grid work**

Run:

```bash
git add client/src/components/ptz/preset-management-dialog.tsx client/src/components/ptz/preset-grid.tsx
git commit -m "feat: add preset management dialog"
```

## Task 5: Dashboard Wiring and Program Recall Warning

**Files:**
- Modify: `client/src/pages/dashboard.tsx`

- [ ] **Step 1: Add imports**

In `client/src/pages/dashboard.tsx`, update imports:

```ts
import { PresetManagementDialog } from "@/components/ptz/preset-management-dialog";
import { normalizePresetName, requiresProgramRecallConfirmation } from "@shared/preset-management";
```

Add AlertDialog imports:

```ts
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

- [ ] **Step 2: Add state**

Near existing Dashboard state:

```ts
  const [managingPreset, setManagingPreset] = useState<Preset | null>(null);
  const [pendingProgramRecall, setPendingProgramRecall] = useState<Preset | null>(null);
```

- [ ] **Step 3: Add management mutations**

After `recallPresetMutation`, add:

```ts
  const updatePresetMutation = useMutation({
    mutationFn: ({ preset, name }: { preset: Preset; name: string | null }) =>
      presetApi.update(preset.id, { name }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Preset[]>(["presets", updated.cameraId], (current = []) =>
        current.map((preset) => preset.id === updated.id ? updated : preset)
      );
      queryClient.invalidateQueries({ queryKey: ["presets", updated.cameraId] });
      setManagingPreset(updated);
      toast.success("Preset name saved");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const refreshPresetThumbnailMutation = useMutation({
    mutationFn: presetApi.refreshThumbnail,
    onSuccess: (updated) => {
      queryClient.setQueryData<Preset[]>(["presets", updated.cameraId], (current = []) =>
        current.map((preset) => preset.id === updated.id ? updated : preset)
      );
      queryClient.invalidateQueries({ queryKey: ["presets", updated.cameraId] });
      setManagingPreset(updated);
      toast.success("Preset thumbnail refreshed");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: (preset: Preset) => presetApi.delete(preset.id).then(() => preset),
    onSuccess: (deleted) => {
      queryClient.setQueryData<Preset[]>(["presets", deleted.cameraId], (current = []) =>
        current.filter((preset) => preset.id !== deleted.id)
      );
      queryClient.invalidateQueries({ queryKey: ["presets", deleted.cameraId] });
      setManagingPreset(null);
      toast.success("Preset deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
```

- [ ] **Step 4: Replace duplicate recall behavior with guarded server recall**

Replace `handleRecallPreset` with:

```ts
  const recallPreset = (preset: Preset) => {
    recallPresetMutation.mutate(preset.id);
  };

  const requestPresetRecall = (preset: Preset) => {
    if (requiresProgramRecallConfirmation(selectedCam)) {
      setPendingProgramRecall(preset);
      return;
    }
    recallPreset(preset);
  };

  const handleRecallPreset = (index: number) => {
    const preset = presets.find(p => p.presetNumber === index);
    if (preset) requestPresetRecall(preset);
  };
```

Keep `handleStorePreset` unchanged.

- [ ] **Step 5: Pass manage handler into `PresetGrid`**

Update the `PresetGrid` render:

```tsx
              <PresetGrid
                presets={presets}
                onRecall={handleRecallPreset}
                onStore={handleStorePreset}
                onManage={setManagingPreset}
              />
```

- [ ] **Step 6: Render management and recall confirmation dialogs**

Before the closing `</main>` or adjacent to the command deck section, render:

```tsx
        <PresetManagementDialog
          preset={managingPreset}
          cameraName={selectedCam?.name}
          open={!!managingPreset}
          onOpenChange={(open) => !open && setManagingPreset(null)}
          onSaveName={(preset, name) => updatePresetMutation.mutate({ preset, name: normalizePresetName(name || "") })}
          onRefreshThumbnail={(preset) => refreshPresetThumbnailMutation.mutate(preset.id)}
          onDelete={(preset) => deletePresetMutation.mutate(preset)}
          onRecall={requestPresetRecall}
          saving={updatePresetMutation.isPending}
          refreshing={refreshPresetThumbnailMutation.isPending}
          deleting={deletePresetMutation.isPending}
          recalling={recallPresetMutation.isPending}
        />

        <AlertDialog open={!!pendingProgramRecall} onOpenChange={(open) => !open && setPendingProgramRecall(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Recall preset on program camera?</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedCam?.name || "This camera"} is currently marked as program. Recalling preset {pendingProgramRecall ? pendingProgramRecall.presetNumber + 1 : ""} will move the live camera.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingProgramRecall) recallPreset(pendingProgramRecall);
                  setPendingProgramRecall(null);
                }}
                className="bg-red-600 text-white hover:bg-red-700"
                data-testid="button-confirm-program-preset-recall"
              >
                Recall Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
```

- [ ] **Step 7: Type-check Dashboard wiring**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: PASS.

- [ ] **Step 8: Commit Dashboard wiring**

Run:

```bash
git add client/src/pages/dashboard.tsx
git commit -m "feat: wire preset management into dashboard"
```

## Task 6: Version and Documentation

**Files:**
- Modify: `shared/version.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version to 1.7.7**

Update:

```ts
export const APP_VERSION = "1.7.7";
```

Update both `package.json` and the top-level `package-lock.json` package version values from `1.7.6` to `1.7.7`.

- [ ] **Step 2: Update README preset documentation**

Update the preset bullets near the Dashboard feature list to include:

```md
- 16 presets per camera with recall/store modes, preset rename/delete, thumbnail refresh, and live-camera recall warnings
```

Update the setup flow near the preset instructions to include:

```md
7. **Manage Presets**: Use the manage action on a saved preset to rename it, refresh its thumbnail, delete it, or recall it with live-camera warning protection
```

- [ ] **Step 3: Update CHANGELOG**

Add an entry under the top `Unreleased` or latest section:

```md
- **Preset Management Upgrades** — added Dashboard preset rename, delete, thumbnail refresh, and program-camera recall warnings while removing duplicate recall sends.
```

- [ ] **Step 4: Run docs/version checks**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit docs/version work**

Run:

```bash
git add shared/version.ts package.json package-lock.json README.md CHANGELOG.md
git commit -m "chore: document preset management upgrades"
```

## Task 7: Final Verification and PR Update

**Files:**
- No new production files expected beyond previous tasks.

- [ ] **Step 1: Run full test suite**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

Expected: PASS.

- [ ] **Step 2: Run full type check**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
```

Expected: PASS. A Vite chunk-size warning is acceptable if the command exits zero.

- [ ] **Step 4: Browser smoke test**

Start the app:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PORT=4790 npm run dev
```

Open `http://localhost:4790`.

Confirm:

- Signed-out app does not show preset controls.
- After sign-in, saved preset slots show a manage action.
- Management dialog renders rename, recall, refresh thumbnail, and delete controls without overlap at desktop width.
- If authenticated test data has a program camera, recall shows the program warning before sending.

If no authenticated browser session is available, report that UI smoke was limited by missing credentials and rely on automated checks.

- [ ] **Step 5: Inspect git state**

Run:

```bash
git status -sb
```

Expected: only unrelated pre-existing skin/header edits remain unstaged.

- [ ] **Step 6: Push branch**

Run:

```bash
git push
```

Expected: branch `codex/layout-compatibility-pass` updates the existing PR.
