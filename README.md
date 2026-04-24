# PTZ Command

Current version: **1.7.0**

PTZ Command is a browser-based control surface for small live-production environments. It combines PTZ camera control, ATEM switching, X32/M32 audio, OBS scene changes, Philips Hue lighting, display control, scenes, macros, and runsheet playback in one shared web app.

This branch is the current **multi-user** build. Multiple people can sign in from different computers and work against the same backend and database.

> Status: still in active development and not yet positioned as a hardened production release.

## Screenshots

### Dashboard
Camera selection, virtual joystick, presets, tally, previews, and top-level status cards in one view.

![Dashboard](docs/screenshots/dashboard.png)

### Video Switcher
Full ATEM switcher control with program/preview rows, transitions, keyers, and macro controls.

![Video Switcher](docs/screenshots/video-switcher.png)

### Audio Mixer
Behringer X32/M32 mixer control with tabbed channel sections.

![Audio Mixer](docs/screenshots/audio-mixer.png)

### Scenes
Programmable scene buttons that can combine camera, switcher, OBS, lighting, mixer, and display actions.

![Scenes](docs/screenshots/scenes.png)

### Mobile Companion
Touch-first control page for phones and tablets.

![Mobile Companion](docs/screenshots/mobile-companion.png)

## What The App Does

- Control up to 4 PTZ cameras over VISCA over IP with joystick, zoom, focus, presets, and tally awareness
- Control a Behringer X32/M32 mixer over OSC
- Control a Blackmagic ATEM switcher with program/preview, transitions, keys, macros, and fade to black
- Trigger OBS Studio program scene changes
- Control Philips Hue bridges, rooms, lights, and scenes
- Control supported displays over Samsung local control, Hisense VIDAA local control, or SmartThings
- Build reusable scene buttons, macros, and runsheet cues for show flow
- Let multiple operators sign in from different stations against one shared backend

## Multi-User Features

- Shared backend database for cameras, presets, layouts, scenes, macros, runsheet cues, displays, OBS links, Hue bridges, and logs
- Username/password sign-in with browser sessions
- First-run bootstrap flow that creates the initial admin account
- Role-based access with `viewer`, `operator`, and `admin`
- Protected live-control routes and WebSocket actions
- Rate-limited login endpoint

### Roles

- `viewer`: can sign in, open the app, see status, pages, and monitoring views
- `operator`: can run live actions such as camera moves, preset recall, scene execution, macro execution, switcher cuts, OBS program changes, lighting actions, and display commands
- `admin`: can configure the system, manage users, pair displays, connect SmartThings, and control admin-only settings like rehearsal mode

### Admin Tools

Admins get a dedicated **Users** page where they can:

- Create `viewer`, `operator`, and `admin` accounts
- Edit display names
- Change user roles
- Reset passwords
- Enable or disable accounts
- See each user's last login time

PTZ Command also prevents the last active admin from being removed or disabled.

## Pages

- **Dashboard**: camera grid, joystick, presets, zoom/focus, tally, preview, OBS strip, and summary panels
- **Scenes**: color-coded scene buttons with test and execute flows
- **Macros**: step-based automation for PTZ, ATEM, lighting, and displays
- **Runsheet**: cue stack built from saved scenes, with keyboard stepping
- **Mixer**: full X32/M32 page
- **Switcher**: full ATEM page
- **Lighting**: Hue bridge pairing and light/room/scene control
- **Displays**: Samsung, Hisense, and SmartThings display setup and control
- **Diagnostics**: device health, Hue bridge status, and recent events
- **Users**: admin-only account management
- **Mobile**: touch-optimized camera/scenes/macros/switcher/lighting page

## Scenes, Macros, And Runsheet

### Scene Buttons

Scene buttons can combine one or more of these actions:

- PTZ preset recall
- ATEM input changes
- OBS Studio program scene change
- Mixer actions
- Hue scene or light actions
- Display actions

The Scenes page also includes an **operator lock** mode that keeps scene execution available while blocking scene edits and deletion from that station.

### Macros

Macros are step-based and currently support:

- PTZ preset recall
- PTZ pan/tilt
- PTZ zoom
- PTZ focus auto
- ATEM preview/program selection
- ATEM cut and auto
- Delays
- Hue scene, group, and light actions
- Display commands

### Runsheet

Runsheet cues are built from saved scenes and support:

- ordered cue stacks
- notes per cue
- drag-to-reorder
- run current cue
- `Space` to advance
- `Shift+Space` to move back

## Monitoring And Safety

- Built-in log viewer from the header
- Persistent system and audit logs
- Diagnostics page with camera, mixer, switcher, display, and Hue bridge health
- Rehearsal mode banner and safety behavior

When rehearsal mode is enabled, the UI clearly indicates that **ATEM, OBS, and X32 live outputs are suppressed while VISCA camera movement remains available**.

## Supported Hardware And Integrations

### PTZ Cameras

- VISCA over IP
- Default control port: `52381` (configurable per camera)
- Inline browser previews via RTSP, RTP, snapshot/MJPEG, or browser USB/UVC
- RTSP preview uses stored camera credentials when authentication is required

FoMaKo RTSP examples:

- `rtsp://CAMERA_IP:554/live/av0`
- `rtsp://CAMERA_IP:554/live/av1`

### Audio Mixer

- Behringer X32/M32 over OSC
- Sections: channels, mix bus, aux in, FX returns, matrix, and DCA

### Video Switcher

- Blackmagic ATEM
- Program/preview
- Cut/auto
- Transition styles and rates
- Upstream/downstream key controls
- Fade to black
- ATEM macros

### OBS Studio

- OBS connection management from the dashboard
- Manual program scene switching
- Scene buttons can switch OBS program scenes

### Lighting

- Philips Hue bridges
- Pairing, bridge status, reachable-device visibility, and scene activation

### Displays

- Samsung local display control
- Hisense VIDAA local display control
- SmartThings-connected displays

Supported display actions depend on protocol, and can include:

- power on/off/toggle
- mute/unmute
- volume changes
- input changes
- custom SmartThings commands

## Requirements

- **Node.js 18+**
- PTZ cameras with VISCA over IP support if you want camera control
- Behringer X32/M32 if you want mixer control
- Blackmagic ATEM if you want switcher control
- FFmpeg on the host machine if you want RTSP/RTP preview proxying

## Installation

```bash
npm install
```

## Running Locally

### Development

On macOS or Linux:

```bash
npm run dev
```

On Windows, use:

```bash
npx tsx server/index.ts
```

The app runs on `http://localhost:3478` by default.

To change the port:

```bash
PORT=4000 npm run dev
```

### First Run

On a brand-new install:

1. Start PTZ Command.
2. Open the app in a browser.
3. Create the first admin account in the bootstrap flow.
4. Sign in and finish system setup from the admin pages.

## Environment And Data Storage

### Default Local Setup

- SQLite is used automatically
- Local database path: `data/ptzcommand.db`
- No manual database setup is required for local use

### PostgreSQL

If `DATABASE_URL` is set, PTZ Command uses PostgreSQL instead of SQLite.

Example:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/ptz_command
SESSION_SECRET=change-this-in-production
```

Then push the schema:

```bash
npm run db:push
```

### Useful Environment Variables

- `PORT`: web server port, default `3478`
- `DATABASE_URL`: switch from SQLite to PostgreSQL
- `SESSION_SECRET`: strongly recommended for shared or hosted installs
- `SESSION_COOKIE_SECURE`: override session cookie security behavior if needed

## Shared LAN Hosting

For a shared control-room station, run the app on one host machine and let other computers connect to it in a browser.

Build and start production mode:

```bash
npm run build
PORT=3478 SESSION_SECRET=change-this npm run start
```

The server listens on `0.0.0.0`, so other machines on the same network can open:

```text
http://your-hostname.local:3478
```

All users on the networked clients share the host machine's backend and database.

### macOS Background Service

This repo includes a `launchd` installer for a persistent macOS host:

```bash
./deploy/install-launchd.sh
```

That script:

- installs a user launch agent
- generates a session secret if one does not exist yet
- starts PTZ Command in the background after login
- writes logs to `deploy/logs`

To stop it later:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.ptzcommander.multiuser.plist
```

## Setup Notes

### Cameras

1. Put cameras on the same network as the PTZ Command host.
2. Add each camera from the dashboard.
3. Enter name, IP, VISCA port, and optional preview settings.
4. Save RTSP credentials in PTZ Command if the stream requires authentication.

### X32 / M32

1. Put the mixer on the same network.
2. Confirm OSC access on port `10023`.
3. Add the mixer from the Mixer page.

### ATEM

1. Put the switcher on the same network.
2. Add it from the Switcher page.
3. Use the full-page switcher or dashboard summary controls.

### Hue

1. Add the bridge from the Lighting page.
2. Pair it using the bridge link button.
3. Use scenes, groups, or direct light controls.

### Displays

- Use the Displays page to discover or add Samsung local displays
- Use the Displays page to discover or add Hisense VIDAA local displays
- Use the SmartThings setup flow when cloud-connected TV control is needed
- Some local displays require a one-time pairing flow

## Troubleshooting

### Camera Offline

- Verify IP and VISCA port
- Confirm the camera is on the same network
- Confirm VISCA over IP is enabled on the device if required

### Camera Preview Fails

- Verify the preview URL
- Confirm FFmpeg is installed on the host machine
- For RTSP auth failures, verify the saved camera username and password

### Mixer Offline

- Verify mixer IP
- Confirm OSC port `10023`
- Make sure another application is not already occupying the mixer control path

### ATEM Offline

- Verify the ATEM IP
- Confirm the switcher is powered on and reachable from the host

### Another Computer Cannot Reach The App

- Confirm both machines are on the same subnet
- Confirm the host machine firewall allows incoming connections
- Confirm you are opening the host machine URL and port, not `localhost` on the remote machine

### Login Or Session Problems On Shared Installs

- Set `SESSION_SECRET` explicitly
- If you are fronting the app with a proxy or HTTPS terminator, review `SESSION_COOKIE_SECURE`

## Development

```bash
npm run dev
npm run build
npm run start
npm run check
npm run db:push
```

## License

MIT
