# PTZ Command - Camera & Audio Control System

A professional PTZ camera, audio mixer, and video switcher controller for use with OBS, ATEM, and other broadcast software. Control up to 4 PTZ cameras via VISCA over IP, a Behringer X32 audio mixer via OSC, and a Blackmagic ATEM video switcher — all from a single interface.
****** THIS IS STILL IN DEVELOPMENT.  NOT PRODUCTION READY *****

A professional PTZ camera and audio mixer controller for use with OBS, ATEM, and other broadcast software. Control up to 4 PTZ cameras via VISCA over IP and a Behringer X32 audio mixer via OSC, all from a single interface.

## Screenshots

### Dashboard
Camera selection, virtual joystick, presets, zoom/focus controls, and connection status — all in one view.

![Dashboard](docs/screenshots/dashboard.png)

### Video Switcher
Full ATEM switcher control with program/preview rows, transition styles, upstream/downstream keyers, and macro management.

![Video Switcher](docs/screenshots/video-switcher.png)

### Audio Mixer
Behringer X32/M32 mixer control with faders, mute buttons, and tabbed sections for all channel types.

![Audio Mixer](docs/screenshots/audio-mixer.png)

### Scenes
Programmable scene buttons that combine camera presets, ATEM inputs, and mixer actions into a single press.

![Scenes](docs/screenshots/scenes.png)

### Mobile Companion
Touch-optimized mobile web view with camera control, scene execution, and switcher access from any phone or tablet.

![Mobile Companion](docs/screenshots/mobile-companion.png)

## Features

### Camera Control
- Virtual joystick for pan/tilt control
- 16 presets per camera with recall/store modes
- Zoom and focus control
- Adjustable pan/tilt speed
- Real-time WebSocket communication
- VISCA over IP protocol support
- Edit and delete cameras via settings gear icon

### Audio Mixer Control
- Behringer X32/M32 mixer support via OSC protocol
- Full mixer section access: Channels, Mix Bus, Aux In, FX Returns, Matrix, DCA
- Real-time state synchronization with mixer hardware
- Channel names pulled from mixer
- Dedicated full-page Audio Mixer view with tabbed sections
- Edit and delete mixer configuration via settings gear icon

### Video Switcher Control
- Blackmagic ATEM switcher support
- Program/Preview input selection
- Transition controls: Mix, Dip, Wipe, Stinger, DVE with adjustable rates
- Upstream and Downstream Keyer controls (on-air, tie, auto)
- Fade to Black
- Macro management (run, stop, continue)
- Dedicated full-page Video Switcher view with tabbed sections

### Multi-Page Interface
- **Dashboard**: ATEM/Mixer summary panels at the top, camera selection grid, virtual joystick, preset grid, lens controls
- **Audio Mixer**: Full-page X32 mixer control with tabbed sections (Channels, Mix Bus, Aux In, FX Returns, Matrix, DCA)
- **Video Switcher**: Full-page ATEM switcher control with tabbed sections (Program/Preview, Transitions, Upstream Keys, Downstream Keys, Macros)

### Logging & Troubleshooting
- Built-in log viewer accessible from the header
- Filterable by category: Camera, Mixer, Switcher, API, System
- Log levels: Debug, Info, Warning, Error
- Persistent audit logs stored in database
- All mixer, camera, and switcher operations are logged for troubleshooting

## Prerequisites

- **Node.js 18+** (https://nodejs.org/)
- PTZ cameras with VISCA over IP support (optional)
- Behringer X32/M32 mixer (optional)
- Blackmagic ATEM switcher (optional)

**No database setup required.** The app automatically uses SQLite for local installations. PostgreSQL is used automatically when a `DATABASE_URL` environment variable is present (e.g., on Replit or cloud deployments).

## Installation

### 1. Download and Install Dependencies

Download the project files and open a terminal in the project folder:

```bash
npm install
```

### 2. Start the Application

#### On Mac / Linux:
```bash
npm run dev
```

#### On Windows (Command Prompt):
```bash
npx tsx server/index.ts
```

#### On Windows (PowerShell):
```powershell
npx tsx server/index.ts
```

The application will be available at `http://localhost:3478`.

The default port is **3478**. You can change it by setting the `PORT` environment variable:

```bash
# Mac / Linux
PORT=4000 npm run dev

# Windows Command Prompt
set PORT=4000 && npx tsx server/index.ts

# Windows PowerShell
$env:PORT=4000; npx tsx server/index.ts
```

Port 3478 was chosen to avoid clashes with common services (e.g. AirPlay on Mac uses port 5000).

### Optional: PostgreSQL (Cloud/Advanced)

If you prefer PostgreSQL instead of SQLite, set up a database and create a `.env` file:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/ptz_command
```

Then push the schema:

```bash
npm run db:push
```

The app will automatically detect and use PostgreSQL when `DATABASE_URL` is set.

## Camera Setup

1. Ensure your PTZ cameras are connected to the same network
2. Note each camera's IP address (usually found in camera settings or via DHCP table)
3. Default VISCA port is 52381 (some cameras like Fomako use non-standard ports)
4. Click "Add Camera" in the interface to configure each camera
5. Use the settings gear icon on any camera card to edit IP, port, or name
6. Cameras auto-connect on startup

### Supported Camera Protocols

- **VISCA over IP** (Sony, PTZOptics, Marshall, Fomako, and most PTZ cameras)
- Default port: 52381 (configurable per camera)

## Audio Mixer Setup

### Behringer X32/M32
1. Connect your X32 to the same network as the computer running PTZ Command
2. On the X32, go to **Setup > Network** and note the IP address
3. Ensure the X32 is set to use port 10023 (default OSC port)
4. In PTZ Command, navigate to the **Audio Mixer** tab and click "Add Mixer"

### Managing Mixer Settings
- Click the settings gear icon next to the mixer name to edit IP, port, or name
- Delete the mixer from the same settings dialog

### Supported Mixer Sections
- **Channels**: Channels 1-32 fader and mute control
- **Mix Bus**: Mix bus fader and mute control
- **Aux In**: Auxiliary input control
- **FX Returns**: Effects return control
- **Matrix**: Matrix output control
- **DCA**: DCA group fader and mute control
- Real-time state sync from mixer to UI

## Video Switcher Setup

### Blackmagic ATEM
1. Connect your ATEM switcher to the same network
2. Note the ATEM's IP address from its network settings
3. In PTZ Command, navigate to the **Video Switcher** tab and click "Add Switcher"
4. Use the program/preview buttons to switch inputs
5. Use Cut or Auto buttons for transitions

### Supported Switcher Features
- **Program/Preview**: Input source selection with tally indicators
- **Transitions**: Mix, Dip, Wipe, Stinger, DVE with rate control and preview toggle
- **Upstream Keys**: On-air toggle for upstream keyers
- **Downstream Keys**: On-air, tie, and auto controls for downstream keyers
- **Macros**: Run, stop, and continue macros
- **Fade to Black**: Full FTB control

## Usage

### Dashboard
1. **ATEM & Mixer Panels**: Summary panels at the top show connection status and quick controls
2. **Add Cameras**: Click "Add Camera" and enter the camera name, IP address, and port
3. **Select Camera**: Click on a camera card to select it for joystick control (cyan border = selected)
4. **Control Movement**: Use the virtual joystick to pan and tilt the selected camera
5. **Set Presets**: Switch to "STORE" mode and click a preset slot to save the current position
6. **Recall Presets**: In "RECALL" mode, click a preset to move the camera to that position
7. **Edit Camera**: Hover over a camera card and click the gear icon to change settings

### Audio Mixer (Full Page)
1. Navigate to the **Audio Mixer** tab
2. **Add Mixer**: Click "Add Mixer" and enter your X32's IP address
3. **Connect**: The mixer will connect automatically; green WiFi icon shows "online"
4. **Sections**: Use the tabs to switch between Channels, Mix Bus, Aux In, FX Returns, Matrix, and DCA
5. **Faders**: Drag faders up/down to adjust levels
6. **Mute**: Click the mute button below each fader to mute/unmute

### Video Switcher (Full Page)
1. Navigate to the **Video Switcher** tab
2. **Add Switcher**: Click "Add Switcher" and enter your ATEM's IP address
3. **Connect**: Click the Connect button to establish connection
4. **ME Control**: Use program/preview rows to switch inputs; Cut and Auto buttons for transitions
5. **Transitions**: Select transition style (Mix, Dip, Wipe, Stinger, DVE) and adjust rate
6. **Keyers**: Control upstream and downstream keyers from their respective tabs
7. **Macros**: Run, stop, or continue macros from the Macros tab

### Viewing Logs
1. Click the "Logs" button in the header bar
2. Filter by category (Camera, Mixer, Switcher, API, System)
3. Logs update automatically every 5 seconds while the viewer is open
4. Error and warning logs are highlighted for quick identification

## Network Requirements

- All devices must be on the same network as the computer running PTZ Command
- **PTZ Cameras**: Firewall must allow TCP connections on the camera's VISCA port
- **X32 Mixer**: Firewall must allow UDP connections on port 10023 (OSC)
- **ATEM Switcher**: Firewall must allow TCP connections to the ATEM
- WebSocket communication uses the same port as the web server (default 3478)

## Troubleshooting

### Camera shows "Offline"
- Verify the camera IP address is correct (click gear icon to check)
- Check network connectivity (try pinging the camera)
- Ensure the camera's VISCA port is not blocked by firewall
- Some cameras need VISCA over IP enabled in their settings
- Check the Logs viewer (Camera category) for connection error details

### Joystick not responding
- Check the Logs viewer for WebSocket connection errors
- Ensure no other application is controlling the camera simultaneously
- Look for "pan_tilt received" messages in the logs to confirm commands are being sent

### X32 Mixer shows "Offline"
- Verify the mixer IP address is correct (click gear icon to check)
- Ensure UDP port 10023 is not blocked by firewall
- Check that no other application is using the X32's OSC port
- The X32 must be on the same network subnet
- Check the Logs viewer (Mixer category) for connection error details

### Mixer faders not syncing
- The X32 sends state updates periodically; wait a few seconds for initial sync
- If the mixer was offline and reconnected, fader positions will update automatically
- Check logs for "X32 OSC send error" messages

### ATEM Switcher shows "Offline"
- Verify the ATEM IP address is correct
- Ensure the ATEM is powered on and connected to the network
- Check that no firewall is blocking TCP connections to the ATEM
- Check the Logs viewer (Switcher category) for connection error details

### Database issues
- Local installations use SQLite automatically (stored in `data/ptzcommand.db`)
- No setup required — the database is created on first run
- If using PostgreSQL, verify `DATABASE_URL` environment variable is correct

### Windows "NODE_ENV is not recognized" error
- Use `npx tsx server/index.ts` instead of `npm run dev`
- See the Installation section above for Windows-specific commands

### Port conflicts
- The default port is 3478. If it's in use, set a different port: `PORT=4000 npm run dev`
- On Mac, port 5000 is used by AirPlay — this is why the default was changed to 3478

## Data Storage

- **Local installs**: SQLite database at `data/ptzcommand.db` (auto-created, no setup needed)
- **Cloud/Replit**: PostgreSQL via `DATABASE_URL` environment variable
- All camera, mixer, and switcher configurations are persisted
- Audit logs are stored in the database for troubleshooting

## Development

```bash
npx tsx server/index.ts    # Start development server (cross-platform)
npm run build              # Build for production
npm run db:push            # Push schema changes to PostgreSQL
npm run check              # TypeScript type checking
```

## License

MIT
