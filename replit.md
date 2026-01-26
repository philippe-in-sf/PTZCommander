# PTZ Command - Camera Control System

## Overview

PTZ Command is a professional PTZ (Pan-Tilt-Zoom) camera controller designed for use with OBS, ATEM, and other broadcast software. The application enables control of up to 4 PTZ cameras via VISCA over IP protocol, featuring a virtual joystick for pan/tilt control, preset management with 16 presets per camera, and a standard broadcast-style program/preview workflow.

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

The frontend is a single-page application with a dashboard layout containing:
- Camera selector grid with program/preview indicators
- Virtual joystick component for real-time PTZ control
- Preset grid (16 presets per camera) with recall/store modes
- Lens controls for zoom, focus, and speed adjustments

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

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema**: Two tables - `cameras` (connection info, status, program/preview flags) and `presets` (camera positions with pan/tilt/zoom/focus values)
- **Migrations**: Managed via `drizzle-kit push`

### Project Structure
```
├── client/          # React frontend
│   ├── src/
│   │   ├── components/ptz/   # PTZ-specific components
│   │   ├── components/ui/    # shadcn/ui components
│   │   ├── pages/            # Route pages
│   │   └── lib/              # API clients, utilities
├── server/          # Express backend
│   ├── routes.ts    # API endpoints + WebSocket setup
│   ├── storage.ts   # Database operations
│   └── visca.ts     # VISCA protocol implementation
├── shared/          # Shared TypeScript types and schemas
│   └── schema.ts    # Drizzle schema definitions
```

## External Dependencies

### Database
- **PostgreSQL**: Primary data store for camera configurations and presets
- Connection via `DATABASE_URL` environment variable

### Camera Protocol
- **VISCA over IP**: Standard PTZ camera control protocol
- Default port: 52381 (configurable per camera)
- TCP socket connections managed by `VISCAClient` class

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `ws`: WebSocket server for real-time control
- `framer-motion`: Joystick animation and gestures
- `@tanstack/react-query`: Server state management
- `zod` / `drizzle-zod`: Runtime schema validation