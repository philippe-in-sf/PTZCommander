# PTZ Command iOS

Native SwiftUI companion app for PTZCommander.

## What works in this first slice

- Connect to a PTZCommander server on the local network.
- Read `/api/mobile/config` to verify server version and supported features.
- Load configured cameras, presets, scenes, and macros.
- Send live PTZ, zoom, focus, and preset recall commands over the existing `/ws` WebSocket protocol.
- Execute scene buttons and macros over the existing REST API.

## Running locally

1. Start PTZCommander on the Mac or server that controls the production devices.
2. Open `PTZCommander.xcodeproj` in Xcode.
3. Select the `PTZCommander` scheme and an iPhone or iPad simulator/device.
4. Run the app.
5. Enter the PTZCommander server address, for example `http://192.168.0.96:4101`.

The app allows local-network HTTP connections through `NSAllowsLocalNetworking`, so production LAN addresses work without requiring HTTPS during local control.

## Notes

- The app expects the PTZCommander server to expose `/api/mobile/config`. Older servers will fail at setup until they include that endpoint.
- The current app is intentionally a control surface. Device configuration, camera discovery, Hue pairing, and layout editing still live in the web UI.
- Bonjour/mDNS server discovery is a good next step once the first manual-connect flow is tested on device.
