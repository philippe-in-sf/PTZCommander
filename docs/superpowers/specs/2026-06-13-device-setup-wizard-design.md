# Device Setup Wizard Design

## Goal

Add an anytime **Add Device Wizard** that consolidates scattered setup flows for cameras, mixers, switchers, OBS, Hue bridges, and displays into one guided modal.

The point is not to replace every device page. The point is to make first-time setup and later device additions feel like one coherent workflow instead of a scavenger hunt through Dashboard, Mixer, Switcher, Lighting, and Displays.

## Scope

This first Device Setup Wizard slice adds:

- A reusable guided modal for adding one device at a time.
- Device choices for Camera, Mixer, ATEM Switcher, OBS, Hue Bridge, and Display.
- A global **Add Device** entry point from the signed-in app shell.
- Existing device-specific add buttons opening the wizard with that device type preselected.
- Discovery where the app already supports it:
  - VISCA camera discovery.
  - Samsung display discovery.
  - Hisense display discovery.
- Manual setup for every supported device type.
- Automatic create and test behavior after details are submitted, using the existing device APIs.
- A finish step with the result summary, a link to the relevant page, and an **Add another** action.

This pass does not add new discovery protocols for mixers, ATEM switchers, OBS, or Hue. Making up autodiscovery for vendor ecosystems that do not already cooperate would be a charming way to ship lies with a spinner.

## Current State

PTZ Command already has the setup pieces, but they are distributed by page:

- Dashboard has camera discovery, manual camera creation, OBS setup, and Hue setup.
- Mixer has Behringer X32 manual setup and connect/status checks.
- Switcher has ATEM manual setup and connect/status checks.
- Lighting has Hue bridge management and pairing flows.
- Displays has Samsung and Hisense discovery, manual display setup, SmartThings OAuth, refresh, and pairing.
- Diagnostics shows device health after setup, but is not a device onboarding flow.

Existing client API methods cover most of the wizard behavior:

- `cameraApi.discover`
- `cameraApi.importDiscovered`
- `mixerApi.create`
- `mixerApi.connect`
- `mixerApi.getStatus`
- `switcherApi.create`
- `switcherApi.connect`
- `switcherApi.getStatus`
- `obsApi.create`
- `obsApi.connect`
- `obsApi.getStatus`
- `obsApi.getScenes`
- `displayApi.discoverSamsung`
- `displayApi.discoverHisense`
- `displayApi.create`
- `displayApi.refresh`
- `displayApi.pair`

Hue bridge creation and pairing already exist in the lighting routes and UI. The wizard should use those existing paths rather than inventing a parallel Hue setup stack, because one bridge flow is already plenty.

## User Experience

The wizard opens as a modal with a clear step rail:

1. Device Type
2. Discover or Manual
3. Details
4. Add and Test
5. Finish

The modal is available from a general app-shell **Add Device** action. Existing page-level actions remain, but instead of opening separate local forms first, they open this wizard with the relevant device type already selected:

- Add Camera opens the wizard on Camera.
- Add Mixer opens the wizard on Mixer.
- Add Switcher opens the wizard on ATEM Switcher.
- Add OBS opens the wizard on OBS.
- Add Hue Bridge opens the wizard on Hue Bridge.
- Add Display opens the wizard on Display.

If keeping an old page form temporarily lowers implementation risk, it may stay as a fallback during the first implementation pass. The visible default path should be the wizard.

## Step Behavior

### Device Type

Show six choices:

- Camera
- Mixer
- ATEM Switcher
- OBS
- Hue Bridge
- Display

Each choice should include a short device-specific status hint, such as "VISCA over IP" for cameras or "OBS WebSocket" for OBS. Keep the text compact; this is an operator tool, not a product brochure.

### Discover Or Manual

Discovery is shown only for types that already support it:

- Camera: VISCA discovery.
- Display: Samsung and Hisense discovery.

All types offer manual setup. For unsupported discovery types, the wizard goes directly to manual details after Device Type.

SmartThings display setup should remain available from Displays as the existing advanced cloud flow. The wizard can link to it from Display setup, but the first pass should not move the OAuth flow into the modal.

### Details

Use the same practical fields the existing forms use today:

- Camera: name, IP address, port, protocol, credentials when supported, stream URL when supported.
- Mixer: name, IP address, port.
- ATEM Switcher: name, IP address, port if the existing model supports it.
- OBS: name, host, port, password.
- Hue Bridge: name, host or bridge IP, app key when already available, pair prompt when needed.
- Display: name, IP address, protocol/vendor type, port, pairing token or auth fields when supported.

Validation should happen before the wizard submits. Required fields should be obvious and errors should sit next to the relevant field, not be dumped into a generic toast like a ransom note.

### Add And Test

After the user submits Details, the wizard creates the device and then runs the safest supported verification flow:

- Camera:
  - Import selected discovered camera or create manual camera.
  - Do not run pan/tilt/zoom or recall commands.
  - Trigger existing health refresh behavior where available.
- Mixer:
  - Create mixer.
  - Call connect.
  - Read status.
- ATEM Switcher:
  - Create switcher.
  - Call connect.
  - Read status.
- OBS:
  - Create OBS connection.
  - Call connect.
  - Read status and scenes.
- Hue Bridge:
  - Create bridge.
  - If pairing is needed, guide the user to press the physical link button and then call the existing pair flow.
  - Read bridge status where available.
- Display:
  - Create display from manual or discovered details.
  - Call refresh where supported.
  - If pairing is needed, offer the existing pair action.

The wizard should show a per-step progress list during Add and Test:

- Created
- Connected or Paired
- Status Verified

Each line can succeed, warn, or fail. A created device with a failed connection test should still reach Finish with a warning and a link to the relevant page.

## Finish State

Finish shows:

- Device name.
- Device type.
- Created status.
- Connection, pairing, or health-test result.
- Any warning returned by the test step.
- Primary action to open the relevant page.
- Secondary action to add another device.

Relevant destinations:

- Camera: Dashboard.
- Mixer: Mixer.
- ATEM Switcher: Switcher.
- OBS: Dashboard.
- Hue Bridge: Lighting.
- Display: Displays.

## Architecture

Add a shared wizard component:

- `client/src/components/setup/device-setup-wizard.tsx`

Add a small opener layer so the wizard can be launched from the app shell and from pages without each page owning its own modal state:

- `client/src/components/setup/device-setup-provider.tsx`
- `client/src/hooks/use-device-setup.ts`

The provider should support:

- `openDeviceSetup()`
- `openDeviceSetup({ type: "camera" })`
- `closeDeviceSetup()`

Use a device configuration map for copy, route targets, discovery support, field definitions, and submit/test behavior. Keep device-specific submit code in small functions rather than turning the modal into a 1,000-line shrine to conditional rendering.

Do not add server routes solely for the wizard unless the existing APIs cannot express a required operation. The wizard should orchestrate the existing APIs first.

## Access Control

The wizard must not bypass the API access model.

The current default is:

- `GET` and `HEAD` API routes require viewer access.
- Mutating API routes require admin access unless a route registers a lower role.
- Command-like actions such as scene execution, presets, display refresh, and device control register operator or admin rules where appropriate.

Because adding devices is configuration work, the first pass should leave create/update/delete permissions at the existing API requirement level, which is admin unless the current route explicitly says otherwise. If implementation exposes any new mutating setup route, require admin unless there is a deliberate reason to lower it.

The UI should hide or disable the global **Add Device** action for users who cannot create devices, with a short permission message when they reach the wizard through a stale view.

## Error Handling

The wizard should handle partial success cleanly:

- Validation errors keep the user on Details.
- Discovery failures keep the user on Discover or Manual and preserve manual setup.
- Create failures stop the flow and show a retry action.
- Test failures continue to Finish with a warning when the device was created successfully.
- Pairing timeouts continue to Finish with a warning and a route to the relevant page.

Errors should preserve enough context for the operator to act:

- Device type.
- Host or IP address.
- Operation that failed.
- Server message when available.

Do not log or display saved passwords or tokens.

## Testing

Add focused tests for pure wizard behavior where possible:

- Device type config includes all six supported types.
- Preselected type skips the generic Device Type decision when appropriate.
- Discovery-capable types expose discovery options.
- Non-discovery types go directly to manual details.
- Add and Test converts create success plus test failure into a warning finish state.
- Sensitive fields are not echoed into result summaries.

Run the existing project checks after implementation:

- `npm run test`
- `npm run check`
- `npm run lint`
- `npm run build`

Browser smoke:

- Open the signed-in app.
- Confirm the global **Add Device** action opens the wizard.
- Confirm Dashboard camera add opens Camera preselected.
- Confirm Mixer, Switcher, Lighting, and Displays entry points open the wizard preselected.
- Confirm manual setup validation does not overlap or overflow on desktop and mobile widths.
- Confirm a failed connection test reaches Finish with a warning instead of trapping the user in the modal.

If no authenticated browser session is available, report that UI smoke was limited to signed-out route behavior and automated checks.

## Documentation

Update `README.md` and `CHANGELOG.md`.

Bump the app to `1.7.9`.

## Out Of Scope

Not included in this slice:

- New LAN discovery for mixers.
- New LAN discovery for ATEM switchers.
- New LAN discovery for OBS.
- New Hue bridge discovery.
- Moving SmartThings OAuth into the wizard.
- Editing or deleting existing devices.
- Bulk import beyond existing camera import and display discovery flows.
- Running live production commands such as camera moves, mixer writes, or ATEM transitions as setup tests.
- Background setup jobs.
- Replacing the Diagnostics page.
- Building a separate full setup hub page.
