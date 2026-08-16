#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
SOURCE_FILE="$ROOT_DIR/macos/PTZCommandApp.swift"
PLIST_TEMPLATE="$ROOT_DIR/macos/Info.plist"
ICON_SOURCE="$ROOT_DIR/client/src/assets/ptzcommand-logo-transparent.png"
INSTALL_DIR="${PTZCOMMAND_APP_INSTALL_DIR:-$HOME/Applications}"
APP_TARGET="$INSTALL_DIR/PTZ Command.app"
BUILD_DIR=$(mktemp -d /tmp/ptzcommand-macos-app.XXXXXX)
APP_STAGING="$BUILD_DIR/PTZ Command.app"
CONTENTS_DIR="$APP_STAGING/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
ICONSET_DIR="$BUILD_DIR/PTZCommand.iconset"
VERSION=$(node -e 'const pkg = require(process.argv[1]); process.stdout.write(pkg.version)' "$ROOT_DIR/package.json")

cleanup() {
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT INT TERM

command -v xcrun >/dev/null 2>&1 || { echo "ERROR: Xcode Command Line Tools are required." >&2; exit 1; }
[ -f "$SOURCE_FILE" ] || { echo "ERROR: Missing $SOURCE_FILE" >&2; exit 1; }
[ -f "$PLIST_TEMPLATE" ] || { echo "ERROR: Missing $PLIST_TEMPLATE" >&2; exit 1; }
[ -f "$ICON_SOURCE" ] || { echo "ERROR: Missing $ICON_SOURCE" >&2; exit 1; }

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$ICONSET_DIR" "$INSTALL_DIR"

xcrun swiftc \
  -parse-as-library \
  -O \
  -framework AppKit \
  -framework WebKit \
  -o "$MACOS_DIR/PTZCommand" \
  "$SOURCE_FILE"

for icon_size in 16 32 128 256 512; do
  double_size=$((icon_size * 2))
  sips -z "$icon_size" "$icon_size" "$ICON_SOURCE" --out "$ICONSET_DIR/icon_${icon_size}x${icon_size}.png" >/dev/null
  sips -z "$double_size" "$double_size" "$ICON_SOURCE" --out "$ICONSET_DIR/icon_${icon_size}x${icon_size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/PTZCommand.icns"

sed "s/__VERSION__/$VERSION/g" "$PLIST_TEMPLATE" > "$CONTENTS_DIR/Info.plist"

plutil -lint "$CONTENTS_DIR/Info.plist" >/dev/null
codesign --force --deep --sign - "$APP_STAGING" >/dev/null

if [ -e "$APP_TARGET" ]; then
  rm -rf "$APP_TARGET"
fi
mv "$APP_STAGING" "$APP_TARGET"

echo "Installed native app:"
echo "  $APP_TARGET"
echo
echo "The browser version remains available at:"
echo "  http://127.0.0.1:3478"
