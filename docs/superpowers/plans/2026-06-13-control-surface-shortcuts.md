# Control Surface Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stream Deck-ready keyboard shortcuts that execute scene buttons 1 through 10 from anywhere in the signed-in app.

**Architecture:** Put all shortcut parsing and scene-button lookup in a pure shared module so it is easy to test without a browser. Mount a signed-in client-only listener that uses React Query to read scene buttons and the existing scene-button execution API to run the matched scene, preserving server-side auth, rehearsal behavior, logging, and device guardrails.

**Tech Stack:** TypeScript, React 19, TanStack Query, Sonner toasts, node:test, existing Express scene-button APIs.

---

## Verification Command Prefix

This local workspace currently needs the bundled Node runtime for project verification because global Node 26 does not match the native `better-sqlite3` binding. Use this prefix for npm commands during implementation:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

For example:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

## File Structure

- Create `shared/control-surface-shortcuts.ts`: pure shortcut definitions, keyboard-event normalization, editable/dialog target detection, and scene-button lookup.
- Create `tests/control-surface-shortcuts.test.ts`: unit tests for shortcut normalization, suppression rules, and lookup by `buttonNumber`.
- Create `client/src/hooks/use-control-surface-shortcuts.ts`: global keydown listener and scene execution hook.
- Create `client/src/components/control-surface-shortcuts.tsx`: invisible component that mounts the hook.
- Modify `client/src/App.tsx`: mount `ControlSurfaceShortcuts` only inside the signed-in shell.
- Modify `shared/version.ts`, `package.json`, `package-lock.json`, `README.md`, and `CHANGELOG.md`: bump to `1.7.6` and document shortcut defaults.

## Task 1: Add Pure Shortcut Resolution

**Files:**
- Create: `tests/control-surface-shortcuts.test.ts`
- Create: `shared/control-surface-shortcuts.ts`

- [ ] **Step 1: Write the failing shortcut tests**

Create `tests/control-surface-shortcuts.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  isEditableShortcutTarget,
  resolveControlSurfaceSceneShortcut,
  sceneButtonNumberFromShortcutEvent,
  type ShortcutKeyEventLike,
} from "@shared/control-surface-shortcuts";

type TestSceneButton = {
  id: number;
  buttonNumber: number;
  name: string;
};

function keyEvent(overrides: Partial<ShortcutKeyEventLike> = {}): ShortcutKeyEventLike {
  return {
    key: "1",
    code: "Digit1",
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    ...overrides,
  };
}

function target(overrides: Record<string, unknown>) {
  return {
    tagName: "DIV",
    nodeName: "DIV",
    isContentEditable: false,
    getAttribute: (_name: string) => null,
    closest: (_selector: string) => null,
    ...overrides,
  };
}

test("sceneButtonNumberFromShortcutEvent maps Ctrl+Alt digits to scene numbers", () => {
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "1", code: "Digit1" })), 1);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "9", code: "Digit9" })), 9);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "0", code: "Digit0" })), 10);
});

test("sceneButtonNumberFromShortcutEvent maps numpad digits", () => {
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "7", code: "Numpad7" })), 7);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "Unidentified", code: "Numpad0" })), 10);
});

test("sceneButtonNumberFromShortcutEvent ignores incomplete or unsafe modifiers", () => {
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ ctrlKey: false })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ altKey: false })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ metaKey: true })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ shiftKey: true })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ repeat: true })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "A", code: "KeyA" })), null);
});

test("isEditableShortcutTarget detects editable targets", () => {
  assert.equal(isEditableShortcutTarget(target({ tagName: "INPUT", nodeName: "INPUT" })), true);
  assert.equal(isEditableShortcutTarget(target({ tagName: "TEXTAREA", nodeName: "TEXTAREA" })), true);
  assert.equal(isEditableShortcutTarget(target({ tagName: "SELECT", nodeName: "SELECT" })), true);
  assert.equal(isEditableShortcutTarget(target({ isContentEditable: true })), true);
  assert.equal(isEditableShortcutTarget(target({ getAttribute: (name: string) => name === "role" ? "textbox" : null })), true);
  assert.equal(isEditableShortcutTarget(target({ getAttribute: (name: string) => name === "contenteditable" ? "true" : null })), true);
  assert.equal(isEditableShortcutTarget(target({})), false);
});

test("resolveControlSurfaceSceneShortcut ignores editable targets and dialogs", () => {
  const buttons: TestSceneButton[] = [{ id: 2, buttonNumber: 1, name: "Wide" }];

  assert.equal(
    resolveControlSurfaceSceneShortcut(keyEvent({ target: target({ tagName: "INPUT", nodeName: "INPUT" }) }), buttons),
    null,
  );

  assert.equal(
    resolveControlSurfaceSceneShortcut(keyEvent({ target: target({ closest: (selector: string) => selector.includes("dialog") ? {} : null }) }), buttons),
    null,
  );
});

test("resolveControlSurfaceSceneShortcut resolves by buttonNumber instead of array order", () => {
  const buttons: TestSceneButton[] = [
    { id: 20, buttonNumber: 10, name: "Close" },
    { id: 11, buttonNumber: 1, name: "Wide" },
  ];

  const one = resolveControlSurfaceSceneShortcut(keyEvent({ key: "1", code: "Digit1" }), buttons);
  assert.equal(one?.buttonNumber, 1);
  assert.equal(one?.sceneButton?.id, 11);

  const ten = resolveControlSurfaceSceneShortcut(keyEvent({ key: "0", code: "Digit0" }), buttons);
  assert.equal(ten?.buttonNumber, 10);
  assert.equal(ten?.sceneButton?.id, 20);
});

test("resolveControlSurfaceSceneShortcut returns an accepted missing-scene result", () => {
  const result = resolveControlSurfaceSceneShortcut<TestSceneButton>(keyEvent({ key: "5", code: "Digit5" }), []);

  assert.equal(result?.buttonNumber, 5);
  assert.equal(result?.sceneButton, null);
});
```

- [ ] **Step 2: Run the shortcut tests and verify they fail**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

Expected: FAIL with an import error for `@shared/control-surface-shortcuts` because the module does not exist yet.

- [ ] **Step 3: Add the pure shortcut implementation**

Create `shared/control-surface-shortcuts.ts`:

```ts
export type ShortcutKeyEventLike = {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  target?: unknown;
};

type ShortcutTargetLike = {
  nodeName?: string;
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
};

export type SceneButtonShortcutCandidate = {
  id: number;
  buttonNumber: number;
  name?: string | null;
};

export type SceneShortcutResolution<T extends SceneButtonShortcutCandidate> = {
  buttonNumber: number;
  sceneButton: T | null;
};

export const CONTROL_SURFACE_SCENE_SHORTCUTS = [
  { label: "Ctrl+Alt+1", buttonNumber: 1 },
  { label: "Ctrl+Alt+2", buttonNumber: 2 },
  { label: "Ctrl+Alt+3", buttonNumber: 3 },
  { label: "Ctrl+Alt+4", buttonNumber: 4 },
  { label: "Ctrl+Alt+5", buttonNumber: 5 },
  { label: "Ctrl+Alt+6", buttonNumber: 6 },
  { label: "Ctrl+Alt+7", buttonNumber: 7 },
  { label: "Ctrl+Alt+8", buttonNumber: 8 },
  { label: "Ctrl+Alt+9", buttonNumber: 9 },
  { label: "Ctrl+Alt+0", buttonNumber: 10 },
] as const;

const EDITABLE_TAGS = new Set(["input", "textarea", "select"]);
const EDITABLE_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);
const EDITABLE_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]",
  "[role='textbox']",
  "[role='searchbox']",
  "[role='combobox']",
  "[role='spinbutton']",
].join(", ");
const DIALOG_TARGET_SELECTOR = "[role='dialog'], [data-radix-dialog-content]";

function targetLike(value: unknown): ShortcutTargetLike | null {
  return value && typeof value === "object" ? value as ShortcutTargetLike : null;
}

function normalizedTagName(target: ShortcutTargetLike) {
  return String(target.tagName ?? target.nodeName ?? "").toLowerCase();
}

function isContentEditableValue(value: string | null) {
  return value === "" || value?.toLowerCase() === "true";
}

function digitFromCode(code: string | undefined) {
  const digitMatch = code?.match(/^(?:Digit|Numpad)([0-9])$/);
  return digitMatch ? Number(digitMatch[1]) : null;
}

function digitFromKey(key: string | undefined) {
  return key && /^[0-9]$/.test(key) ? Number(key) : null;
}

function digitToSceneButtonNumber(digit: number | null) {
  if (digit === null) return null;
  return digit === 0 ? 10 : digit;
}

export function sceneButtonNumberFromShortcutEvent(event: ShortcutKeyEventLike) {
  if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey || event.repeat) {
    return null;
  }

  const digit = digitFromKey(event.key) ?? digitFromCode(event.code);
  return digitToSceneButtonNumber(digit);
}

export function isEditableShortcutTarget(value: unknown) {
  const target = targetLike(value);
  if (!target) return false;

  if (EDITABLE_TAGS.has(normalizedTagName(target))) return true;
  if (target.isContentEditable) return true;

  const contentEditable = target.getAttribute?.("contenteditable");
  if (isContentEditableValue(contentEditable ?? null)) return true;

  const role = target.getAttribute?.("role")?.toLowerCase() ?? null;
  if (role && EDITABLE_ROLES.has(role)) return true;

  if (typeof target.closest === "function" && target.closest(EDITABLE_TARGET_SELECTOR)) {
    return true;
  }

  return false;
}

export function isDialogShortcutTarget(value: unknown) {
  const target = targetLike(value);
  return Boolean(target && typeof target.closest === "function" && target.closest(DIALOG_TARGET_SELECTOR));
}

export function resolveControlSurfaceSceneShortcut<T extends SceneButtonShortcutCandidate>(
  event: ShortcutKeyEventLike,
  sceneButtons: readonly T[],
): SceneShortcutResolution<T> | null {
  if (isEditableShortcutTarget(event.target) || isDialogShortcutTarget(event.target)) {
    return null;
  }

  const buttonNumber = sceneButtonNumberFromShortcutEvent(event);
  if (!buttonNumber) return null;

  return {
    buttonNumber,
    sceneButton: sceneButtons.find((button) => button.buttonNumber === buttonNumber) ?? null,
  };
}
```

- [ ] **Step 4: Run the tests and verify shortcut behavior passes**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

Expected: PASS, including the new `control-surface-shortcuts` tests.

- [ ] **Step 5: Commit the pure shortcut module**

Run:

```bash
git add shared/control-surface-shortcuts.ts tests/control-surface-shortcuts.test.ts
git commit -m "feat: add control surface shortcut resolver"
```

## Task 2: Mount Signed-In Shortcut Handling

**Files:**
- Create: `client/src/hooks/use-control-surface-shortcuts.ts`
- Create: `client/src/components/control-surface-shortcuts.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add the signed-in shell integration first**

Modify `client/src/App.tsx` by adding the import:

```ts
import { ControlSurfaceShortcuts } from "@/components/control-surface-shortcuts";
```

Then update the signed-in return block in `Shell()`:

```tsx
  return (
    <WsSync>
      <ControlSurfaceShortcuts />
      <RehearsalChrome />
      {showStartupSplash && (
        <div className="transition-opacity duration-500">
          <StartupSplash
            overlay
            label="Bringing the control surface online"
            detail="Cameras, switcher, mixer, and lighting are syncing"
          />
        </div>
      )}
    </WsSync>
  );
```

- [ ] **Step 2: Run typecheck and verify it fails**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: FAIL because `@/components/control-surface-shortcuts` does not exist yet.

- [ ] **Step 3: Add the shortcut hook**

Create `client/src/hooks/use-control-surface-shortcuts.ts`:

```ts
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SceneButton } from "@shared/schema";
import { resolveControlSurfaceSceneShortcut } from "@shared/control-surface-shortcuts";
import { sceneButtonApi } from "@/lib/api";

export function useControlSurfaceShortcuts() {
  const queryClient = useQueryClient();
  const pendingRef = useRef(false);
  const { data: sceneButtons = [] } = useQuery({
    queryKey: ["scene-buttons"],
    queryFn: sceneButtonApi.getAll,
    staleTime: 5000,
  });

  const { mutate: executeShortcutScene } = useMutation({
    mutationFn: async (sceneButton: SceneButton) => {
      const result = await sceneButtonApi.execute(sceneButton.id);
      return { result, sceneButton };
    },
    onSuccess: ({ sceneButton }) => {
      toast.success("Scene executed", { description: sceneButton.name });
      queryClient.invalidateQueries({ queryKey: ["scene-buttons"] });
    },
    onError: (error: Error) => {
      toast.error("Shortcut failed", { description: error.message });
    },
    onSettled: () => {
      pendingRef.current = false;
    },
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const resolution = resolveControlSurfaceSceneShortcut(event, sceneButtons);
      if (!resolution) return;

      event.preventDefault();
      event.stopPropagation();

      if (pendingRef.current) return;

      if (!resolution.sceneButton) {
        toast.error("No scene assigned", {
          description: `Scene button ${resolution.buttonNumber} is not configured`,
        });
        return;
      }

      pendingRef.current = true;
      executeShortcutScene(resolution.sceneButton);
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [executeShortcutScene, sceneButtons]);
}
```

- [ ] **Step 4: Add the invisible mounting component**

Create `client/src/components/control-surface-shortcuts.tsx`:

```tsx
import { useControlSurfaceShortcuts } from "@/hooks/use-control-surface-shortcuts";

export function ControlSurfaceShortcuts() {
  useControlSurfaceShortcuts();
  return null;
}
```

- [ ] **Step 5: Run typecheck and verify the client integration passes**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit the client shortcut listener**

Run:

```bash
git add client/src/App.tsx client/src/hooks/use-control-surface-shortcuts.ts client/src/components/control-surface-shortcuts.tsx
git commit -m "feat: execute scene buttons from keyboard shortcuts"
```

## Task 3: Bump Version And Document Shortcuts

**Files:**
- Modify: `shared/version.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump app version to 1.7.6**

Update `shared/version.ts`:

```ts
export const APP_VERSION = "1.7.6";
```

Update `package.json`:

```json
  "version": "1.7.6",
```

Update both top-level package version values in `package-lock.json` to `1.7.6`.

Update `README.md` near the top:

```md
Current version: **1.7.6**
```

- [ ] **Step 2: Add shortcut documentation to README**

Add this section after the scene button or runsheet usage section in `README.md`:

```md
### Control Surface Shortcuts

PTZ Command includes fixed keyboard shortcuts for Stream Deck profiles and other physical control surfaces that can emit key combinations:

- `Ctrl+Alt+1` through `Ctrl+Alt+9` execute scene buttons 1 through 9
- `Ctrl+Alt+0` executes scene button 10

On macOS, use Control+Option+number. Shortcuts only work after sign-in and are ignored while typing in fields or while a dialog is focused.
```

- [ ] **Step 3: Add changelog entry**

Add this entry at the top of `CHANGELOG.md` above `1.7.5`:

```md
## [1.7.6] - 2026-06-13

### Added
- **Control Surface Shortcuts** - added Stream Deck-ready `Ctrl+Alt+1` through `Ctrl+Alt+0` shortcuts for executing scene buttons 1 through 10 from the signed-in app.

### Changed
- **Version Display** - interface version labels now report v1.7.6
```

- [ ] **Step 4: Run metadata lint**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run lint
```

Expected: PASS with `lint: project metadata and artifact checks passed`.

- [ ] **Step 5: Commit version and docs**

Run:

```bash
git add shared/version.ts package.json package-lock.json README.md CHANGELOG.md
git commit -m "chore: document control surface shortcuts"
```

## Task 4: Full Verification And Browser Smoke

**Files:**
- No required source edits.

- [ ] **Step 1: Run typecheck**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: PASS.

- [ ] **Step 2: Run tests**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

Expected: PASS with the existing test suite plus `tests/control-surface-shortcuts.test.ts`.

- [ ] **Step 3: Run lint**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
```

Expected: PASS. A Vite large chunk warning is acceptable if the build exits zero, because that warning already exists and is not caused by this shortcut slice.

- [ ] **Step 5: Start local preview**

Run:

```bash
PORT=4792 TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run dev
```

Expected: server starts on `http://localhost:4792`. If that port is already in use, use the next open port and record it in the final verification notes.

- [ ] **Step 6: Browser smoke test**

Open the local preview in the in-app browser.

Verify:

- The login page loads and shows app version `v1.7.6`.
- Pressing `Ctrl+Alt+1` on the login page does not execute anything because the shortcut component is only mounted after sign-in.
- If an authenticated session is available, press `Ctrl+Alt+1` while focus is not inside a field and confirm either a scene execution toast or a `No scene assigned` toast.
- If an authenticated session is available, focus an input field and press `Ctrl+Alt+1`; confirm the shortcut is ignored.

If no authenticated browser session is available, do not modify users or passwords just for smoke testing. Report that post-login shortcut smoke was blocked by missing credentials.

- [ ] **Step 7: Stop local preview**

Stop the dev server started in Step 5 before reporting completion.

- [ ] **Step 8: Confirm workspace state**

Run:

```bash
git status -sb
```

Expected: only the known unrelated skin/header edits remain unstaged:

```text
 M client/src/components/app-header.tsx
 M client/src/components/skin-selector.tsx
 M client/src/components/skins/broadcast-console.tsx
 M client/src/components/skins/command-center.tsx
 M client/src/components/skins/studio-glass.tsx
?? client/src/components/skins/live-data.ts
```

If any files from this shortcut feature are unstaged, inspect and either commit them intentionally or fix the missed step.
