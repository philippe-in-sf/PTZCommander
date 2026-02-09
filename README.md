# PTZ Command - Camera & Audio Control System

A professional PTZ camera, audio mixer, and video switcher controller for use with OBS, ATEM, and other broadcast software. Control up to 4 PTZ cameras via VISCA over IP, a Behringer X32 audio mixer via OSC, and a Blackmagic ATEM video switcher — all from a single interface.

## Features

### Camera Control
- Virtual joystick for pan/tilt control
- Program/Preview workflow (standard broadcast switcher style)
- 16 presets per camera with recall/store modes
- Zoom and focus control
- Adjustable pan/tilt speed
- Real-time WebSocket communication
- VISCA over IP protocol support
- Edit and delete cameras via settings gear icon

### Audio Mixer Control
- Behringer X32/M32 mixer support via OSC protocol
- 16 channel faders with mute buttons
- Main stereo fader control
- Real-time state synchronization with mixer hardware
- Channel names pulled from mixer
- Edit and delete mixer configuration via settings gear icon

### Video Switcher Control
- Blackmagic ATEM switcher support
- 8 input buttons for program/preview selection
- Cut and auto transitions
- Real-time tally state synchronization

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
set PORT=4000 && npx tsx server/index.ts
```

#### On Windows (PowerShell):
```powershell
$env:PORT=4000; npx tsx server/index.ts
```

The application will be available at `http://localhost:4000` (or whatever port you set).

On Mac/Linux the default port is 5000 unless you set the `PORT` environment variable.

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
4. In PTZ Command, click "Add Mixer" and enter the IP address

### Managing Mixer Settings
- Click the settings gear icon next to the mixer name to edit IP, port, or name
- Delete the mixer from the same settings dialog

### Supported Mixer Features
- Channels 1-16 fader control
- Channels 1-16 mute control
- Main stereo bus fader and mute
- Real-time state sync from mixer to UI

## Video Switcher Setup

### Blackmagic ATEM
1. Connect your ATEM switcher to the same network
2. Note the ATEM's IP address from its network settings
3. In PTZ Command, click "Add Switcher" and enter the IP address
4. Use the program/preview buttons to switch inputs
5. Use Cut or Auto buttons for transitions

## Usage

### Camera Control
1. **Add Cameras**: Click "Add Camera" and enter the camera name, IP address, and port
2. **Select Preview**: Click on a camera to select it for preview (green border)
3. **Control Movement**: Use the virtual joystick to pan and tilt
4. **Set Presets**: Switch to "STORE" mode and click a preset slot to save the current position
5. **Recall Presets**: In "RECALL" mode, click a preset to move the camera to that position
6. **Go Live**: Click "TAKE" to swap preview to program (red border = live)
7. **Edit Camera**: Hover over a camera card and click the gear icon to change settings

### Audio Mixer Control
1. **Add Mixer**: Click "Add Mixer" in the Audio Mixer panel and enter your X32's IP address
2. **Connect**: The mixer will connect automatically; green WiFi icon shows "online"
3. **Channel Faders**: Drag faders up/down to adjust channel levels
4. **Mute Channels**: Click the mute button below each fader to mute/unmute
5. **Main Fader**: Use the horizontal main fader at the bottom for master level control
6. **Edit Mixer**: Click the gear icon next to the mixer name to change settings or delete

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
- WebSocket communication uses the same port as the web server

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

### Database issues
- Local installations use SQLite automatically (stored in `data/ptzcommand.db`)
- No setup required — the database is created on first run
- If using PostgreSQL, verify `DATABASE_URL` environment variable is correct

### Windows "NODE_ENV is not recognized" error
- Use `npx tsx server/index.ts` instead of `npm run dev`
- See the Installation section above for Windows-specific commands

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
