# PTZ Command - Camera Control System

A professional PTZ camera controller for use with OBS, ATEM, and other broadcast software. Control up to 4 PTZ cameras via VISCA over IP with a virtual joystick, preset management, and program/preview switching.

## Features

- Virtual joystick for pan/tilt control
- Program/Preview workflow (standard broadcast switcher style)
- 16 presets per camera
- Zoom and focus control
- Real-time WebSocket communication
- VISCA over IP protocol support

## Prerequisites

- **Node.js 20+** (https://nodejs.org/)
- **PostgreSQL 14+** (https://www.postgresql.org/download/)
- PTZ cameras with VISCA over IP support

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

## Usage

1. **Add Cameras**: Click "Add Camera" and enter the camera name, IP address, and port
2. **Select Preview**: Click on a camera to select it for preview (green border)
3. **Control Movement**: Use the virtual joystick to pan and tilt
4. **Set Presets**: Switch to "STORE" mode and click a preset slot to save the current position
5. **Recall Presets**: In "RECALL" mode, click a preset to move the camera to that position
6. **Go Live**: Click "TAKE" to swap preview to program (red border = live)

## Network Requirements

- All cameras must be on the same network as the computer running PTZ Command
- Firewall must allow TCP connections on port 52381 (or your camera's VISCA port)
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
