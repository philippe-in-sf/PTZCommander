# PTZ Command - Camera Control System

## Overview

PTZ Command is a professional PTZ (Pan-Tilt-Zoom) camera controller designed for use with OBS, ATEM, and other broadcast software. The application enables control of up to 4 PTZ cameras via VISCA over IP protocol, featuring a virtual joystick for pan/tilt control, preset management with 16 presets per camera, and a standard broadcast-style program/preview workflow.

The application also includes integrated control for Behringer X32 digital audio mixers via OSC protocol, providing basic channel control (faders, mute) from the same interface. Additionally, it supports Blackmagic ATEM video switchers for program/preview input selection and cut/auto transitions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom plugins for Replit integration
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS v4 with custom dark theme optimized for broadcast control rooms
- **Animations**: Framer Motion for joystick interactions

The frontend is a multi-page application with navigation tabs:
- **Dashboard** (`/`): Scene buttons (quick access), ATEM/Mixer summary panels, camera preview grid (with live JPEG snapshots), camera selector strip, virtual joystick, preset grid, lens controls
- **Scenes** (`/scenes`): Full-page scene button management — create, edit, and execute programmable macro buttons that trigger combined ATEM, mixer, and PTZ actions
- **Video Switcher** (`/switcher`): Full-page ATEM switcher control with tabbed sections (Program/Preview, Transitions, Upstream Keys, Downstream Keys, Macros)
- **Audio Mixer** (`/mixer`): Full-page X32 mixer control with tabbed sections (Channels, Mix Bus, Aux In, FX Returns, Matrix, DCA)

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript compiled with TSX
- **API Style**: RESTful endpoints under `/api/` prefix
- **Real-time Communication**: WebSocket server (ws library) for low-latency camera control commands
- **Protocol**: VISCA over IP (TCP sockets) for camera communication

The server handles:
- Camera CRUD operations
- Preset storage and retrieval
- WebSocket connections for real-time joystick/control commands
- VISCA command translation and TCP socket management to cameras
- X32 mixer connection and OSC command handling
- ATEM switcher connection and control via atem-connection library
- Real-time state synchronization between hardware and UI
- Production layout save/load with full configuration snapshots

### Data Storage
- **Database**: PostgreSQL (cloud/Replit) or SQLite (local installation)
  - Automatically detects: Uses PostgreSQL when `DATABASE_URL` is set, otherwise falls back to SQLite
  - SQLite file stored at `data/ptzcommand.db` for portable local installations
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema**: Seven tables - `cameras`, `presets`, `mixers`, `switchers`, `scene_buttons`, `layouts`, and `audit_logs`
- **Migrations**: Managed via `drizzle-kit push` (PostgreSQL) or auto-created (SQLite)

### Production Layouts
- Save complete production setups as named layouts (e.g. "Sunday Service", "Concert", "Interview")
- Each layout stores a JSON snapshot of all cameras, presets, scene buttons, mixer, and switcher configurations
- Load a layout to restore the entire production configuration in one action
- Update an active layout's snapshot after making changes
- Active layout indicator shown in the header across all pages
- Layout selector component: `client/src/components/layouts/layout-selector.tsx`

### Logging System
- Centralized logging via `server/logger.ts`
- Categories: api, websocket, camera, mixer, switcher, database, system
- Levels: debug, info, warn, error
- Persistent audit logs stored in database for debugging and auditing
- In-memory buffer for recent logs (last 1000 entries)
- Log viewer UI accessible from header

### Scene Buttons
- Programmable macro buttons that execute combined ATEM, mixer, and PTZ actions in a single press
- Each button stores: ATEM input + transition type, mixer channel actions (JSON array), camera + preset number
- Active/selected scene button shows inverted colors (solid background with dark text)
- Dashboard shows compact quick-access strip; Scenes page shows full management UI
- Preset numbers use 0-based indexing (preset 1 = index 0) matching VISCA protocol

### Startup Scripts
- `start.bat` — Windows startup script (double-click to launch)
- `start.sh` — Mac/Linux startup script (`./start.sh`)
- Both scripts: check Node.js installation, run `npm install` for updates, auto-open browser at correct URL, start the server

### Project Structure
```
├── client/          # React frontend
│   ├── src/
│   │   ├── components/ptz/      # PTZ-specific components
│   │   ├── components/mixer/    # Audio mixer components
│   │   ├── components/switcher/ # Video switcher components
│   │   ├── components/layouts/  # Production layout components
│   │   ├── components/logs/     # Log viewer components
│   │   ├── components/ui/       # shadcn/ui components
│   │   ├── pages/               # Route pages (dashboard, scenes, switcher, mixer)
│   │   └── lib/                 # API clients, utilities
├── server/          # Express backend
│   ├── routes.ts    # API endpoints + WebSocket setup
│   ├── storage.ts   # Database operations (IStorage interface + DatabaseStorage)
│   ├── db.ts        # Database connection (PostgreSQL/SQLite auto-detection)
│   ├── visca.ts     # VISCA protocol implementation
│   ├── x32.ts       # X32 OSC protocol implementation
│   ├── atem.ts      # ATEM switcher protocol implementation
│   └── logger.ts    # Centralized logging service
├── shared/          # Shared TypeScript types and schemas
│   └── schema.ts    # Drizzle schema definitions (7 tables)
├── start.bat        # Windows startup script
├── start.sh         # Mac/Linux startup script
```

## External Dependencies

### Database
- **PostgreSQL**: Primary data store for camera configurations and presets
- Connection via `DATABASE_URL` environment variable

### Camera Protocol
- **VISCA over IP**: Standard PTZ camera control protocol
- Default port: 52381 (configurable per camera)
- TCP socket connections managed by `VISCAClient` class

### Audio Mixer Protocol
- **OSC over UDP**: Open Sound Control protocol for Behringer X32/M32 mixers
- Default port: 10023 (standard X32 OSC port)
- UDP socket connections managed by `X32Client` class
- Requires `/xremote` keep-alive every 9 seconds

### Video Switcher Protocol
- **ATEM Protocol**: Blackmagic ATEM switcher control via atem-connection library
- Network control only (USB not supported by Node.js libraries)
- Managed by `ATEMClient` class with connection state tracking
- Real-time state synchronization via WebSocket broadcast

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `ws`: WebSocket server for real-time control
- `osc`: OSC protocol library for X32 mixer communication
- `atem-connection`: Blackmagic ATEM switcher control library
- `framer-motion`: Joystick animation and gestures
- `@tanstack/react-query`: Server state management
- `zod` / `drizzle-zod`: Runtime schema validation
