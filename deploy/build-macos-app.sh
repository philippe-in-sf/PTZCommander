#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
SOURCE_FILE="$ROOT_DIR/macos/PTZCommandApp.swift"
PLIST_TEMPLATE="$ROOT_DIR/macos/Info.plist"
ICON_SOURCE="$ROOT_DIR/client/src/assets/ptzcommand-logo-transparent.png"
INSTALL_DIR="${PTZCOMMAND_APP_INSTALL_DIR:-$HOME/Applications}"
APP_TARGET="$INSTALL_DIR/PTZ Commander.app"
BUILD_DIR=$(mktemp -d /tmp/ptzcommand-macos-app.XXXXXX)
APP_STAGING="$BUILD_DIR/PTZ Command.app"
CONTENTS_DIR="$APP_STAGING/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
FRAMEWORKS_DIR="$CONTENTS_DIR/Frameworks"
ICONSET_DIR="$BUILD_DIR/PTZCommand.iconset"
SERVER_DIR="$RESOURCES_DIR/server"
RUNTIME_DIR="$RESOURCES_DIR/runtime"
VERSION=$(node -e 'const pkg = require(process.argv[1]); process.stdout.write(pkg.version)' "$ROOT_DIR/package.json")
NODE_BIN=$(command -v node)
NODE_PREFIX=$(CDPATH= cd -- "$(dirname "$NODE_BIN")/.." && pwd -P)

cleanup() {
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT INT TERM

command -v xcrun >/dev/null 2>&1 || { echo "ERROR: Xcode Command Line Tools are required." >&2; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" = "24" ] || { echo "ERROR: Node 24 is required to build the standalone app." >&2; exit 1; }
[ -f "$SOURCE_FILE" ] || { echo "ERROR: Missing $SOURCE_FILE" >&2; exit 1; }
[ -f "$PLIST_TEMPLATE" ] || { echo "ERROR: Missing $PLIST_TEMPLATE" >&2; exit 1; }
[ -f "$ICON_SOURCE" ] || { echo "ERROR: Missing $ICON_SOURCE" >&2; exit 1; }

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$FRAMEWORKS_DIR" "$ICONSET_DIR" "$SERVER_DIR" "$RUNTIME_DIR/bin" "$RUNTIME_DIR/lib" "$INSTALL_DIR"

echo "Building production client and server..."
(cd "$ROOT_DIR" && npm run build)

cp -R "$ROOT_DIR/dist" "$SERVER_DIR/dist"
cp "$ROOT_DIR/package.json" "$ROOT_DIR/package-lock.json" "$SERVER_DIR/"
echo "Installing bundled production dependencies..."
(cd "$SERVER_DIR" && npm ci --omit=dev --no-audit --no-fund)

cp "$NODE_BIN" "$RUNTIME_DIR/bin/node"
chmod 755 "$RUNTIME_DIR/bin/node"

bundle_library() (
  source_path="$1"
  library_name=$(basename "$source_path")
  bundled_path="$RUNTIME_DIR/lib/$library_name"
  [ -f "$bundled_path" ] && exit 0

  cp -L "$source_path" "$bundled_path"
  chmod u+w "$bundled_path"
  install_name_tool -id "@loader_path/$library_name" "$bundled_path" 2>/dev/null || true

  otool -L "$bundled_path" | tail -n +2 | awk '{print $1}' | while IFS= read -r dependency; do
    case "$dependency" in
      /System/*|/usr/lib/*|@executable_path/*) continue ;;
      @loader_path/*)
        dependency_path="$(dirname "$source_path")/${dependency#@loader_path/}"
        ;;
      @rpath/*)
        dependency_path="$(dirname "$source_path")/${dependency#@rpath/}"
        [ -f "$dependency_path" ] || dependency_path="$NODE_PREFIX/lib/${dependency#@rpath/}"
        ;;
      /*)
        dependency_path="$dependency"
        ;;
      *) continue ;;
    esac

    [ -f "$dependency_path" ] || continue
    bundle_library "$dependency_path"
    if [ "$dependency" != "@loader_path/$(basename "$dependency_path")" ]; then
      install_name_tool -change "$dependency" "@loader_path/$(basename "$dependency_path")" "$bundled_path"
    fi
  done
)

bundle_library "$NODE_PREFIX/lib/$(basename "$(readlink "$NODE_PREFIX/lib/libnode.dylib" 2>/dev/null || printf '%s' libnode.137.dylib)")"

xcrun swiftc \
  -parse-as-library \
  -O \
  -framework AppKit \
  -framework Security \
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
codesign --force --sign - "$MACOS_DIR/PTZCommand" >/dev/null
codesign --force --sign - "$RUNTIME_DIR/bin/node" >/dev/null
find "$RUNTIME_DIR/lib" -type f -name '*.dylib' -print | while IFS= read -r executable_file; do
  codesign --force --sign - "$executable_file" >/dev/null
done
find "$SERVER_DIR/node_modules" -type f -name '*.node' -print | while IFS= read -r executable_file; do
  if file "$executable_file" | rg -q 'Mach-O'; then
    codesign --force --sign - "$executable_file" >/dev/null
  fi
done
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
