# Changelog

All notable changes to PTZ Command are documented in this file.

## [1.0] - 2026-04-16

### Added
- **Scene Operations** — added scene groups, dry-run previews, saved-scene test controls, and operator lock mode for safer live operation
- **Diagnostics** — added a diagnostics page for device health, Hue bridge status, and recent system events
- **Scene Rollback** — scene execution now records rollback snapshots for supported ATEM, mixer, and Hue actions

### Changed
- **Hue Scene Picker** — Hue scene selection now includes bridge status and room-aware scene labels
- **Version Display** — interface version labels now report v1.0

## [0.16.0] - 2026-04-09

### Added
- **README Screenshots** — added generated UI screenshots (Dashboard, Video Switcher, Audio Mixer, Scenes, Mobile Companion) to the README for potential re-users

### Changed
- **Shared AppLayout** — all pages (Mixer, Switcher, Lighting, Macros) now use the unified AppLayout/AppHeader component for consistent skin support across every view
- **Scroll behavior** — AppLayout now provides a proper scrollable content area so long pages (e.g. Lighting) are no longer clipped
- **Unused import cleanup** — removed leftover imports from header migration across all pages

## [0.15.0] - 2026-04-01

### Added
- **Auto-Update on New Releases** — connected clients automatically reload when a new version is deployed; server sends version over WebSocket on connect, client detects mismatch and refreshes
- **UI Skin Selector Fix** — skin selector and theme toggle now always visible in Command Center (header z-index fix) and Studio Glass (moved to top of sidebar)
- **Studio Glass Dark Mode** — full dark mode support with proper dark: variants throughout the entire skin
- **README Overhaul** — removed stale merge conflict markers, added missing feature documentation (Lighting, Scenes, Macros, Layouts, Tally, Undo, Mobile, Skins), corrected port info for Replit vs local

## [0.14.0] - 2026-03-27

### Added
- **Mobile: Focus Controls** — Far/Near hold-to-focus buttons and Auto Focus button added to the Camera tab alongside zoom
- **Mobile: Speed Control** — Slow / Med / Fast toggle now adjusts joystick pan/tilt sensitivity on the Camera tab
- **Mobile: Macros Tab** — new Macros tab lists all configured macros with a one-tap Run button and step count
- **Mobile: Lighting Tab** — new Lighting tab shows Hue bridges with Scenes, Rooms, and Lights sub-tabs; toggle rooms/lights and activate scenes from mobile
- **Mobile: Theme Toggle** — light/dark mode switch added to the mobile header
- **VISCA: Manual Focus Commands** — added `focusFar`, `focusNear`, and `focusStop` VISCA commands (also available from the desktop via WebSocket)

## [0.13.0] - 2026-03-20

### Added
- **Philips Hue Lighting Control** — new Lighting page (accessible from all navigation headers) for managing Philips Hue bridges and controlling lights directly from the interface
- **Hue Bridge Management** — add bridges by IP address with optional API key; pair new bridges by pressing the link button then clicking Pair
- **Hue Scene Activation** — browse and activate saved Hue scenes grouped by room/zone from the Lighting page
- **Room & Zone Control** — toggle entire rooms/zones on or off and adjust brightness with a slider
- **Individual Light Control** — toggle individual lights on/off and set brightness; unreachable lights shown clearly
- **Hue Actions in Scenes** — scene buttons now support Hue lighting actions (activate a scene in a room when a scene button fires)
- **Hue Steps in Macros** — macro builder now supports three new step types: Activate Hue Scene, Control Room/Zone, and Control Individual Light
- **Hue Status on Dashboard** — new Lighting summary panel on the dashboard showing all configured bridges with online/offline status

## [0.12.0] - 2026-03-15

### Added
- **Undo / History** — undo button appears in the dashboard header when actions can be reversed (preset recalls, scene executions)
- **Session Log** — real-time timestamped feed of all actions taken during the current session (preset recalls, scene executions, ATEM transitions, macro runs), accessible from the header; updates live via WebSocket
- **Preset Thumbnails** — when saving a preset, the camera's current snapshot is captured and shown as a background image on the preset button
- **Import / Export Layouts** — export any saved production layout as a JSON file, and import layout files to restore configurations; download and upload buttons in the Layout Manager
- **Connection Health Dashboard** — device status panel showing all cameras, mixers, and switchers with live online/offline indicators, IP addresses, and tally state; accessible from the header
- Notes field added to macros for usage instructions and free-text details

## [0.11.0] - 2026-03-15

### Added
- **Macro Builder** — dedicated page for creating, editing, and executing multi-step PTZ command sequences
- New `/macros` page accessible from all navigation headers
- Macro steps support: Recall Preset, Pan/Tilt, Pan/Tilt Stop, Zoom, Auto Focus, ATEM Preview/Program/Cut/Auto, and configurable Delays
- Reorder steps with up/down arrows, duplicate macros, color-coded macro cards
- One-click macro execution runs all steps in sequence with proper timing
- Macro data persisted in database (PostgreSQL and SQLite)
- "Macros" navigation tab added to all pages (Dashboard, Scenes, Switcher, Mixer)

## [0.10.0] - 2026-03-10

### Added
- **Light/dark theme toggle** — click the sun/moon button in the header to switch themes
- Light theme with clean, professional appearance for well-lit environments
- Dark theme remains the default, optimized for broadcast control rooms
- Theme preference saved to browser local storage

## [0.9.0] - 2026-03-01

### Added
- **Tally lights** — cameras can now be mapped to ATEM switcher inputs via an "ATEM Input Number" field in camera settings
- Automatic tally state updates when ATEM program/preview inputs change
- VISCA tally on/off commands sent to physical camera LEDs
- Camera cards show red border + PGM badge (program) and green border + PVW badge (preview)
- Camera preview grid reflects tally state with colored borders

## [0.8.0] - 2026-02-28

### Added
- **Camera preview grid** on the dashboard showing live JPEG snapshots from cameras
- Server-side snapshot proxy (`/api/cameras/:id/snapshot`) with timeout and basic auth support
- Snapshot/Stream URL field in camera settings for configuring JPEG snapshot endpoint
- Fullscreen preview dialog for individual camera feeds
- Preview grid always visible when cameras exist, with placeholder for cameras without a stream URL

## [0.7.0] - 2026-02-27

### Added
- **Production layout system** — save and load complete production configurations
- Layouts store snapshots of all cameras, presets, scene buttons, mixer, and switcher settings
- Layout selector in the header across all pages with active layout indicator
- Create, load, update, and delete layouts
- **Startup scripts** — `start.bat` (Windows) and `start.sh` (Mac/Linux) for easy local launching
- Auto-check for Node.js, run `npm install`, and open browser at `http://localhost:3478`

## [0.6.0] - 2026-02-26

### Added
- **Scenes page** (`/scenes`) — dedicated full-page scene button management
- Scene buttons moved to top of dashboard as a compact quick-access strip
- Active scene button highlighted with inverted colors (solid background, dark text)

### Improved
- Scene button error reporting for PTZ camera preset recalls
- Longer-lasting toast notifications for scene button execution feedback

## [0.5.0] - 2026-02-25

### Added
- **Scene buttons** — programmable macro buttons that execute combined ATEM, mixer, and PTZ actions in a single press
- Each button stores ATEM input + transition type, mixer channel actions, and camera preset

## [0.4.0] - 2026-02-22

### Added
- **Video switcher page** (`/switcher`) — full ATEM switcher control with Program/Preview, Transitions, Upstream Keys, Downstream Keys, and Macros tabs
- Navigation reordered: Dashboard | Scenes | Video Switcher | Audio Mixer

### Changed
- Dashboard layout rearranged with simplified camera selection
- Default port changed to 3478 to avoid conflicts with common services

## [0.3.0] - 2026-02-09

### Added
- **Audio mixer page** (`/mixer`) — dedicated full-page X32 mixer control with Channels, Mix Bus, Aux In, FX Returns, Matrix, and DCA tabs
- Ability to edit and delete audio mixer configurations

### Improved
- Camera controls enhanced with better lens control UI
- Documentation updated to reflect all current features

## [0.2.0] - 2026-02-05

### Added
- **SQLite support** — automatic fallback to local SQLite database when no PostgreSQL is available, stored at `data/ptzcommand.db`
- **System logging** — centralized logging with categories (api, websocket, camera, mixer, switcher, database, system) and audit log storage
- Log viewer accessible from the header
- Camera settings dialog — edit name, IP, port; delete cameras
- Startup scripts updated for SQLite and ATEM support

### Improved
- Camera connections made non-blocking to prevent server startup delays
- WebSocket connection handling for more reliable message delivery
- Joystick control smoothness and responsiveness
- VISCA command logging for debugging
- Error messages for camera connection issues
- Port conflict detection with helpful error messages
- Windows compatibility for development server startup

## [0.1.0] - 2026-01-26

### Added
- **Initial release** of PTZ Command
- Control up to 4 PTZ cameras via VISCA over IP
- Virtual joystick for pan/tilt control with velocity-based movement
- 16 presets per camera with save and recall
- Zoom and focus controls (auto/manual focus)
- Program and preview camera selection
- **Behringer X32 mixer control** — connect via OSC protocol, channel faders and mute
- **ATEM video switcher control** — program/preview input selection, cut/auto transitions
- Real-time WebSocket communication for low-latency control
- PostgreSQL database for camera and preset storage
- Dark theme UI optimized for broadcast control rooms
