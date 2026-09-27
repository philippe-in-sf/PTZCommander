# Local Setup Installer Design

## Goal

Create a guided local setup path for technical volunteers and admins who can run one command, but should not have to debug Node versions, Homebrew links, missing dependencies, FFmpeg, port conflicts, launchd metadata, or camera preview URLs by hand.

The target experience is:

```bash
npm run setup:local
```

The command should diagnose the host, apply safe fixes when requested, and finish with an accurate app URL and a clear next action. A separate camera command handles preview source discovery:

```bash
npm run cameras:configure-previews
```

## Current Problems

- The app requires Node 24.x, but macOS/Homebrew can leave `node` pointing at Node 26 while `node@24` is installed separately.
- Missing dependencies produce low-context errors such as `tsx: command not found`.
- The old setup script points users to port 5000 even though the app defaults to 3478; on macOS, port 5000 can be AirPlay/Control Center.
- Launchd installation already has strong checks, but users must know when and how to run it.
- Camera discovery can find VISCA control ports, but preview sources remain unset unless someone knows camera-specific RTSP/MJPEG/snapshot URLs.
- Preview credentials must be stored through the app-compatible encrypted format, not edited as plaintext in SQLite.

## Proposed Commands

### `npm run setup:local`

This is the main guided setup command for a local macOS/Linux checkout. It should be implemented as a Node script so it can give structured output, run cross-platform checks where practical, and avoid shell quoting fragility.

It will:

- Check the current Node version and require `24.x`.
- Detect common Homebrew states:
  - `node` is Node 26 and `node@24` is installed.
  - `node@24` exists but is not linked.
  - no usable Node 24 binary is visible.
- Check that `npm install` has produced local binaries such as `node_modules/.bin/tsx`.
- Offer to run `npm install` when dependencies are missing.
- Check for FFmpeg/FFprobe, which are required for RTSP/RTP preview frames.
- Check port `3478` and report the owning process when occupied.
- Run `npm run build` or explain why build cannot proceed.
- Offer to run `deploy/install-launchd.sh` on macOS after a successful build.
- Print the actual app URL, normally `http://127.0.0.1:3478/`.

The command should be mostly read-only until it asks for confirmation before running install/build/launchd steps. In non-interactive mode, it should fail with explicit commands rather than prompting.

### `npm run cameras:configure-previews`

This command configures preview sources for cameras already stored in the app database.

It will:

- Read configured cameras from the same SQLite database path the app uses.
- Prompt once for shared camera credentials, with an option to skip credentials.
- Probe common preview ports and stream paths, starting with known FoMaKo defaults:
  - `rtsp://CAMERA_IP:554/live/av0`
  - `rtsp://CAMERA_IP:554/live/av1`
- Use FFprobe to verify that each candidate returns a video stream.
- Save working settings through app-compatible logic:
  - `preview_type = rtsp`
  - `stream_url = rtsp://CAMERA_IP:554/live/av0` or the verified candidate
  - encrypted password using the existing secret format
  - shared username if provided
- Print a per-camera result table: configured, needs credentials, no stream found, or unreachable.

The command should not blindly overwrite existing working preview settings unless `--force` is provided or the user confirms.

## Architecture

Add focused scripts under `script/`:

- `script/setup-local.ts`
- `script/configure-camera-previews.ts`
- Optional shared helpers under `script/lib/`

Reusable logic should be kept small and boring:

- Node/runtime detection
- command execution with captured output
- port ownership detection
- SQLite camera access
- secret encryption reuse
- FFprobe stream probing

The app already contains `server/secrets.ts` and SQLite camera storage behavior. The scripts should either import existing helpers where that is safe, or mirror the same encryption algorithm in a tiny shared helper to avoid booting the whole server.

## Data Flow

`setup:local`:

1. Gather environment facts.
2. Produce a checklist result.
3. Ask before changes.
4. Run selected setup actions.
5. Re-check and print final status.

`cameras:configure-previews`:

1. Load camera rows.
2. Collect optional credentials.
3. Probe each camera.
4. Verify streams with FFprobe.
5. Save only verified preview settings.
6. Print a summary and any manual follow-up.

## Error Handling

Errors must be written for a technical volunteer, not a developer already inside the codebase.

Examples:

- Instead of `tsx: command not found`, report `Dependencies are not installed. Run npm install, or let setup run it now.`
- Instead of `Node.js v26.4.0`, report `PTZ Command requires Node 24.x. Homebrew node is currently Node 26; link node@24 or set PTZCOMMAND_NODE_BIN.`
- Instead of an empty preview tile, report `Camera 2 accepts RTSP but requires credentials. Re-run cameras:configure-previews with username/password.`

## Testing

Add automated tests for pure helpers:

- Node version classification.
- Homebrew Node diagnostic messages.
- port conflict result formatting.
- camera preview candidate generation.
- encrypted password round-trip compatibility.
- no-overwrite behavior for existing configured previews.

For network behavior, keep tests injectable and mock command execution rather than requiring real cameras.

Manual verification should cover:

- Node 24 success path.
- Node 26 failure path.
- missing dependencies.
- missing FFmpeg.
- port 3478 occupied.
- FoMaKo RTSP auto-detection.
- authenticated RTSP auto-detection.

## Out Of Scope

- A signed macOS app or `.pkg` installer.
- Bundling Node or FFmpeg.
- Replacing the in-app device setup wizard.
- Full ONVIF discovery.
- Cloud deployment automation.

These can come later. The immediate goal is to turn source-checkout setup from a scavenger hunt into one guided command.
