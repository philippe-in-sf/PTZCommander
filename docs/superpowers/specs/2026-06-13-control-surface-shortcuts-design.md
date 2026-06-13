# Control Surface Shortcuts Design

## Goal

Add the first slice of physical control surface support by giving operators Stream Deck-ready keyboard shortcuts that execute existing scene buttons.

## Scope

This pass adds fixed global keyboard shortcuts for scene buttons 1 through 10. It does not add a shortcut editor, persistent shortcut settings, MIDI, USB gamepad or joystick support, inbound OSC, native Stream Deck plugin support, or browser access to raw HID devices.

Those can come later. Shipping every hardware protocol at once would be impressively theatrical and operationally stupid.

## Current Context

PTZ Command already has the right execution primitives:

- Scene buttons can run coordinated PTZ, ATEM, OBS, mixer, Hue, and display actions through `POST /api/scene-buttons/:id/execute`.
- Scene execution already runs through server-side route logic, logging, rehearsal-mode handling, and device-specific guardrails.
- The client already has `sceneButtonApi.getAll()` and `sceneButtonApi.execute(id)`.
- Live WebSocket commands are validated in `shared/live-ws-commands.ts`, but raw live commands are not the right first target for physical buttons because scene buttons are safer, named, and operator-facing.
- The runsheet page already has a local spacebar shortcut and an editable-target guard pattern.

## Proposed Behavior

When a signed-in operator presses a supported shortcut anywhere in the app, PTZ Command executes the matching scene button by `buttonNumber`.

Default bindings:

- `Ctrl+Alt+1` executes scene button number 1.
- `Ctrl+Alt+2` executes scene button number 2.
- `Ctrl+Alt+3` executes scene button number 3.
- `Ctrl+Alt+4` executes scene button number 4.
- `Ctrl+Alt+5` executes scene button number 5.
- `Ctrl+Alt+6` executes scene button number 6.
- `Ctrl+Alt+7` executes scene button number 7.
- `Ctrl+Alt+8` executes scene button number 8.
- `Ctrl+Alt+9` executes scene button number 9.
- `Ctrl+Alt+0` executes scene button number 10.

On macOS this is Control+Option+number. Stream Deck can send those key combinations today, which makes this immediately useful without pretending we need a hardware plugin before we have a command model.

## Shortcut Rules

The shortcut handler only responds when all of these are true:

- The user is signed in.
- `ctrlKey` and `altKey` are true.
- `metaKey` and `shiftKey` are false.
- The key is one of `0` through `9`, either from `event.key`, `event.code`, or a numpad code.
- The event is not a repeat.
- The focused target is not editable.
- The focused target is not inside a modal dialog.

Editable targets include:

- `input`
- `textarea`
- `select`
- elements with `contenteditable`
- elements with ARIA textbox/searchbox/combobox/spinbutton roles

When the handler accepts a shortcut, it calls `preventDefault()` and `stopPropagation()` before executing the scene. When it rejects a shortcut, it leaves the event alone.

## Architecture

Create a small pure shortcut module for testable logic:

- `shared/control-surface-shortcuts.ts`
  - Exports the fixed scene shortcut definitions.
  - Normalizes keyboard events into scene button numbers.
  - Detects editable targets.
  - Resolves a button number against a list of scene buttons.

Create a client hook and shell component:

- `client/src/hooks/use-control-surface-shortcuts.ts`
  - Adds and removes the global `keydown` listener.
  - Uses React Query to load scene buttons.
  - Executes the matching scene with `sceneButtonApi.execute(id)`.
  - Shows success and error toasts.

- `client/src/components/control-surface-shortcuts.tsx`
  - Mounts the hook without rendering visible UI.

Mount `ControlSurfaceShortcuts` inside the signed-in shell in `client/src/App.tsx`, alongside WebSocket invalidation and rehearsal chrome.

No server routes or database changes are needed in this first pass.

## Data Flow

1. The user or Stream Deck sends `Ctrl+Alt+number`.
2. The browser keydown listener normalizes the event.
3. The shortcut resolver maps the key to scene button number 1 through 10.
4. The hook looks up the matching `SceneButton` by `buttonNumber`.
5. If a match exists, the hook calls `sceneButtonApi.execute(scene.id)`.
6. Existing server-side scene execution handles device actions, logging, rehearsal behavior, and errors.
7. The client shows a toast with the scene name and invalidates scene-related query state only if needed by existing execution responses.

## Feedback And Errors

Successful execution shows:

- Title: `Scene executed`
- Description: scene name

Missing scene button shows:

- Title: `No scene assigned`
- Description: `Scene button <number> is not configured`

Execution failure shows:

- Title: `Shortcut failed`
- Description: server error message when available

While a shortcut execution is pending, additional accepted shortcut presses are ignored until the request finishes. This avoids accidental double-taps from key repeat or an overenthusiastic Stream Deck profile.

## Safety

This feature intentionally triggers scene buttons instead of raw device commands. Scene buttons are named, visible, and already represent operator-approved actions.

The shortcut layer does not bypass:

- authentication
- API access rules
- rehearsal-mode suppression
- scene execution logging
- device-specific validation

The app ignores shortcuts while typing or while a modal dialog is focused, because surprise scene execution while entering an IP address is the kind of "feature" that should be illegal.

## Testing

Add focused unit tests for pure shortcut behavior:

- `Ctrl+Alt+1` resolves to scene button number 1.
- `Ctrl+Alt+0` resolves to scene button number 10.
- Numpad digits resolve the same way.
- Missing `ctrlKey` or `altKey` is ignored.
- `metaKey`, `shiftKey`, and repeated keydown events are ignored.
- Editable targets are ignored.
- Scene lookup resolves by `buttonNumber`, not array order.

Run:

- `npm run check`
- `npm run test`
- `npm run lint`
- `npm run build`

Browser smoke should verify:

- The app loads.
- Shortcuts do not fire on the login page.
- After sign-in, shortcut handling is mounted.
- Shortcuts are ignored inside editable fields.

Dashboard visual verification is not required for this slice because there is no visible UI beyond toast feedback.

## Rollout

Document the shortcut defaults in `README.md` and `CHANGELOG.md`. Bump the app version after implementation.

Future increments can add:

- a shortcut editor
- macro shortcuts
- runsheet next/take shortcuts
- MIDI input
- gamepad or joystick input
- inbound OSC actions
- a native Stream Deck profile or plugin

Those future adapters should call the same internal shortcut/action execution layer so each hardware path does not grow its own exciting brand of bugs.
