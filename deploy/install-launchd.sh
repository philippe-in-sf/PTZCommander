#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PLIST_TEMPLATE="$SCRIPT_DIR/com.ptzcommander.multiuser.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.ptzcommander.multiuser.plist"
LOG_DIR="$SCRIPT_DIR/logs"
SECRET_FILE="$SCRIPT_DIR/.session-secret"
PORT="${PORT:-3478}"

if [ ! -f "$PLIST_TEMPLATE" ]; then
  echo "Missing plist template: $PLIST_TEMPLATE" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

if [ ! -f "$SECRET_FILE" ]; then
  umask 077
  /usr/bin/openssl rand -hex 32 > "$SECRET_FILE"
fi

SESSION_SECRET=$(tr -d '\n' < "$SECRET_FILE")
HOSTNAME=$(scutil --get LocalHostName 2>/dev/null || hostname -s)

ROOT_ESCAPED=$(printf '%s\n' "$ROOT_DIR" | sed 's/[\/&]/\\&/g')
PORT_ESCAPED=$(printf '%s\n' "$PORT" | sed 's/[\/&]/\\&/g')
SECRET_ESCAPED=$(printf '%s\n' "$SESSION_SECRET" | sed 's/[\/&]/\\&/g')

sed \
  -e "s/__ROOT__/$ROOT_ESCAPED/g" \
  -e "s/__PORT__/$PORT_ESCAPED/g" \
  -e "s/__SESSION_SECRET__/$SECRET_ESCAPED/g" \
  "$PLIST_TEMPLATE" > "$PLIST_TARGET"

launchctl bootout "gui/$(id -u)" "$PLIST_TARGET" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_TARGET"
launchctl enable "gui/$(id -u)/com.ptzcommander.multiuser" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/$(id -u)/com.ptzcommander.multiuser"

echo "Installed launchd agent:"
echo "  $PLIST_TARGET"
echo
echo "PTZCommander multi-user is now running in the background."
echo "Stable LAN URL:"
echo "  http://$HOSTNAME.local:$PORT"
echo
echo "To stop it later:"
echo "  launchctl bootout gui/$(id -u) $PLIST_TARGET"
