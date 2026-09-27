#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
KEY_FILE="$SCRIPT_DIR/.secret-encryption-key"
KEY_ID_FILE="$SCRIPT_DIR/.secret-encryption-key-id"
SESSION_FILE="$SCRIPT_DIR/.session-secret"
PREVIOUS_KEYS_FILE="$SCRIPT_DIR/.secret-encryption-previous-keys"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.ptzcommander.multiuser.plist"
SERVICE_DOMAIN="gui/$(id -u)"
NEW_KEY_ID="${1:-}"

case "$NEW_KEY_ID" in
  ''|*[!A-Za-z0-9._-]*)
    echo "Usage: $0 <new-key-id>" >&2
    echo "Key IDs may contain letters, numbers, dots, underscores, and hyphens." >&2
    exit 1
    ;;
esac

for required in "$KEY_FILE" "$KEY_ID_FILE" "$SESSION_FILE"; do
  if [ ! -f "$required" ]; then
    echo "ERROR: Missing $required. Run deploy/install-launchd.sh first." >&2
    exit 1
  fi
done

OLD_KEY=$(tr -d '\n' < "$KEY_FILE")
OLD_KEY_ID=$(tr -d '\n' < "$KEY_ID_FILE")
SESSION_SECRET=$(tr -d '\n' < "$SESSION_FILE")
if [ "$NEW_KEY_ID" = "$OLD_KEY_ID" ]; then
  echo "ERROR: New key ID must differ from the active key ID $OLD_KEY_ID." >&2
  exit 1
fi

NEW_KEY=$(/usr/bin/openssl rand -hex 32)
NODE_BIN=$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' "$PLIST_TARGET" 2>/dev/null || true)
if [ ! -x "$NODE_BIN" ]; then
  echo "ERROR: Could not read the launchd Node binary from $PLIST_TARGET." >&2
  exit 1
fi
EXISTING_PREVIOUS_KEYS="{}"
if [ -f "$PREVIOUS_KEYS_FILE" ]; then
  EXISTING_PREVIOUS_KEYS=$(tr -d '\n' < "$PREVIOUS_KEYS_FILE")
fi
PREVIOUS_KEYS=$(OLD_KEY_ID="$OLD_KEY_ID" OLD_KEY="$OLD_KEY" EXISTING_PREVIOUS_KEYS="$EXISTING_PREVIOUS_KEYS" "$NODE_BIN" -e 'const previous = JSON.parse(process.env.EXISTING_PREVIOUS_KEYS || "{}"); previous[process.env.OLD_KEY_ID] = process.env.OLD_KEY; process.stdout.write(JSON.stringify(previous))')
CURRENT_PORT=$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:PORT' "$PLIST_TARGET" 2>/dev/null || printf '%s' "3478")
CURRENT_HOST=$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:PTZ_HOST' "$PLIST_TARGET" 2>/dev/null || printf '%s' "127.0.0.1")
if [ "$CURRENT_HOST" = "0.0.0.0" ]; then
  CURRENT_MODE="lan-http"
else
  CURRENT_MODE="https-proxy"
fi

restart_after_failure() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "Rotation failed; restarting PTZ Commander with the recoverable keyring." >&2
    PORT="$CURRENT_PORT" PTZCOMMAND_DEPLOYMENT_MODE="$CURRENT_MODE" sh "$SCRIPT_DIR/install-launchd.sh" || true
  fi
  exit "$status"
}
trap restart_after_failure EXIT

umask 077
printf '%s\n' "$PREVIOUS_KEYS" > "$PREVIOUS_KEYS_FILE.next"
printf '%s\n' "$NEW_KEY_ID" > "$KEY_ID_FILE.next"
printf '%s\n' "$NEW_KEY" > "$KEY_FILE.next"
mv "$PREVIOUS_KEYS_FILE.next" "$PREVIOUS_KEYS_FILE"
mv "$KEY_ID_FILE.next" "$KEY_ID_FILE"
mv "$KEY_FILE.next" "$KEY_FILE"

launchctl bootout "$SERVICE_DOMAIN" "$PLIST_TARGET" >/dev/null 2>&1 || true

(
  cd "$ROOT_DIR"
  NODE_ENV=production \
  SESSION_SECRET="$SESSION_SECRET" \
  SECRET_ENCRYPTION_KEY_ID="$NEW_KEY_ID" \
  SECRET_ENCRYPTION_KEY="$NEW_KEY" \
  SECRET_ENCRYPTION_PREVIOUS_KEYS="$PREVIOUS_KEYS" \
  "$NODE_BIN" --import tsx script/rotate-secret-encryption-key.ts
)

rm -f "$PREVIOUS_KEYS_FILE"
PORT="$CURRENT_PORT" PTZCOMMAND_DEPLOYMENT_MODE="$CURRENT_MODE" sh "$SCRIPT_DIR/install-launchd.sh"
trap - EXIT
echo "Credential encryption now uses key ID $NEW_KEY_ID."
