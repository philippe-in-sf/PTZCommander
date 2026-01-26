# PTZ Command - Camera & Audio Control System

A professional PTZ camera and audio mixer controller for use with OBS, ATEM, and other broadcast software. Control up to 4 PTZ cameras via VISCA over IP and a Behringer X32 audio mixer via OSC, all from a single interface.

## Features

### Camera Control
- Virtual joystick for pan/tilt control
- Program/Preview workflow (standard broadcast switcher style)
- 16 presets per camera
- Zoom and focus control
- Real-time WebSocket communication
- VISCA over IP protocol support

### Audio Mixer Control
- Behringer X32/M32 mixer support via OSC
- 16 channel faders with mute buttons
- Main stereo fader control
- Real-time state synchronization
- Channel names from mixer

## Prerequisites

- **Node.js 20+** (https://nodejs.org/)
- **PostgreSQL 14+** (https://www.postgresql.org/download/)
- PTZ cameras with VISCA over IP support
- Behringer X32/M32 mixer (optional, for audio control)

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd ptz-command
npm install
```

### 2. Set Up PostgreSQL

#### On Mac (using Homebrew):
```bash
brew install postgresql@14
brew services start postgresql@14
createdb ptz_command
```

#### On Windows:
1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Run the installer and follow the prompts
3. Open pgAdmin or psql and create a database named `ptz_command`

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/ptz_command
PORT=5000
```

Replace `username` and `password` with your PostgreSQL credentials.

### 4. Initialize Database

```bash
npm run db:push
```

### 5. Start the Application

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

The application will be available at `http://localhost:5000`

## Camera Setup

1. Ensure your PTZ cameras are connected to the same network
2. Note each camera's IP address (usually found in camera settings or via DHCP table)
3. Default VISCA port is 52381 (standard for most PTZ cameras)
4. Click "Add Camera" in the interface to configure each camera

### Supported Camera Protocols

- **VISCA over IP** (Sony, PTZOptics, Marshall, and most PTZ cameras)
- Default port: 52381

## Audio Mixer Setup

### Behringer X32/M32
1. Connect your X32 to the same network as the computer running PTZ Command
2. On the X32, go to **Setup > Network** and note the IP address
3. Ensure the X32 is set to use port 10023 (default OSC port)
4. In PTZ Command, click "Add Mixer" and enter the IP address

### Supported Mixer Features
- Channels 1-16 fader control
- Channels 1-16 mute control  
- Main stereo bus fader and mute
- Real-time state sync from mixer to UI

## Usage

### Camera Control
1. **Add Cameras**: Click "Add Camera" and enter the camera name, IP address, and port
2. **Select Preview**: Click on a camera to select it for preview (green border)
3. **Control Movement**: Use the virtual joystick to pan and tilt
4. **Set Presets**: Switch to "STORE" mode and click a preset slot to save the current position
5. **Recall Presets**: In "RECALL" mode, click a preset to move the camera to that position
6. **Go Live**: Click "TAKE" to swap preview to program (red border = live)

### Audio Mixer Control
1. **Add Mixer**: Click "Add Mixer" in the Audio Mixer panel and enter your X32's IP address
2. **Connect**: The mixer will connect automatically; status shows "online" when connected
3. **Channel Faders**: Drag faders up/down to adjust channel levels (0-100%)
4. **Mute Channels**: Click the mute button below each fader to mute/unmute
5. **Main Fader**: Use the horizontal main fader at the bottom for master level control

## Network Requirements

- All devices must be on the same network as the computer running PTZ Command
- **PTZ Cameras**: Firewall must allow TCP connections on port 52381 (or your camera's VISCA port)
- **X32 Mixer**: Firewall must allow UDP connections on port 10023 (OSC)
- WebSocket communication uses the same port as the web server (default 5000)

## Troubleshooting

### Camera shows "Offline"
- Verify the camera IP address is correct
- Check network connectivity (try pinging the camera)
- Ensure the camera's VISCA port is not blocked by firewall
- Some cameras need VISCA over IP enabled in their settings

### Joystick not responding
- Check browser console for WebSocket connection errors
- Ensure no other application is controlling the camera simultaneously

### X32 Mixer shows "Offline"
- Verify the mixer IP address is correct (check X32's network settings)
- Ensure UDP port 10023 is not blocked by firewall
- Check that no other application is using the X32's OSC port
- The X32 must be on the same network subnet

### Mixer faders not syncing
- The X32 sends state updates periodically; wait a few seconds for initial sync
- If the mixer was offline and reconnected, fader positions will update automatically

### Database connection errors
- Verify PostgreSQL is running
- Check DATABASE_URL environment variable is correct
- Ensure the database exists

## Development

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run db:push      # Push schema changes to database
npm run check        # TypeScript type checking
```

## License

MIT
