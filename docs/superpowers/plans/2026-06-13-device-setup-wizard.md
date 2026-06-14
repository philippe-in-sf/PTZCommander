# Device Setup Wizard Implementation Plan

## Goal

Ship the first anytime Add Device Wizard slice from `docs/superpowers/specs/2026-06-13-device-setup-wizard-design.md` without disturbing the existing layout-compatibility changes already on this branch.

## Tasks

1. Add pure shared wizard behavior and tests first:
   - Define the six supported device types, route targets, discovery support, status hints, and initial-step behavior.
   - Cover type coverage, preselected start behavior, discovery eligibility, warning finish results, and sensitive-field redaction.

2. Add the opener layer:
   - Create `DeviceSetupProvider`.
   - Create `useDeviceSetup`.
   - Wrap the signed-in app shell so the wizard can be opened from the header and pages.

3. Build the wizard modal:
   - Device Type step for all six types.
   - Discover or Manual step only for Camera and Display.
   - Details step with practical fields for Camera, Mixer, ATEM Switcher, OBS, Hue Bridge, and Display.
   - Add and Test step that calls existing API methods and treats test failures after creation as Finish warnings.
   - Finish step with result summary, route action, and Add another action.

4. Wire entry points:
   - Add the global admin-only Add Device action to the shared header.
   - Point Dashboard camera and OBS add actions at the wizard.
   - Point Mixer, Switcher, Lighting, and Displays add actions at the wizard while keeping older local forms as fallback where useful.

5. Update support surfaces:
   - Add a small Hue API wrapper around the existing routes.
   - Bump app version to `1.7.9`.
   - Update `README.md` and `CHANGELOG.md`.

6. Verify:
   - Run focused wizard tests after shared behavior lands.
   - Run `npm run test`, `npm run check`, `npm run lint`, and `npm run build`.
   - Run a targeted browser smoke for the global action and preselected entry points if an authenticated local session is available.
