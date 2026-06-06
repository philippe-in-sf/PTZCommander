#!/bin/sh
set -eu

LABEL="com.ptzcommander.multiuser"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
PLIST_TEMPLATE="$SCRIPT_DIR/com.ptzcommander.multiuser.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="${PTZCOMMAND_LOG_DIR:-$HOME/Library/Logs/PTZCommand}"
SECRET_FILE="$SCRIPT_DIR/.session-secret"
PORT="${PORT:-3478}"
SELF_CHECK_TIMEOUT="${PTZCOMMAND_SELF_CHECK_TIMEOUT:-45}"
SERVICE_DOMAIN="gui/$(id -u)"
SERVICE_TARGET="$SERVICE_DOMAIN/$LABEL"
VERSION_URL="http://127.0.0.1:$PORT/api/version"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

print_failure_context() {
  echo "launchd status:" >&2
  launchctl print "$SERVICE_TARGET" >&2 || true

  if [ -f "$LOG_DIR/ptzcommander.stderr.log" ]; then
    echo >&2
    echo "Recent stderr log:" >&2
    tail -n 30 "$LOG_DIR/ptzcommander.stderr.log" >&2 || true
  fi
}

wait_for_version_metadata() {
  deadline=$(( $(date +%s) + SELF_CHECK_TIMEOUT ))

  while [ "$(date +%s)" -le "$deadline" ]; do
    if metadata=$(curl --fail --silent --show-error --max-time 2 "$VERSION_URL" 2>/dev/null); then
      if printf '%s' "$metadata" | node -e 'const fs = require("fs"); JSON.parse(fs.readFileSync(0, "utf8"));' >/dev/null 2>&1; then
        printf '%s' "$metadata"
        return 0
      fi
    fi

    sleep 1
  done

  return 1
}

get_launchd_pid() {
  launchctl print "$SERVICE_TARGET" 2>/dev/null | awk '/^[[:space:]]*pid = [0-9]+$/ { print $3; exit }'
}

validate_self_check() {
  metadata_json="$1"
  launchd_pid="$2"

  SELF_CHECK_JSON="$metadata_json" node - "$ROOT_DIR" "$EXPECTED_VERSION" "$launchd_pid" <<'NODE'
const expectedRoot = process.argv[2];
const expectedVersion = process.argv[3];
const launchdPid = process.argv[4];
let metadata;

try {
  metadata = JSON.parse(process.env.SELF_CHECK_JSON || "{}");
} catch (error) {
  console.error(`ERROR: /api/version returned invalid JSON: ${error.message}`);
  process.exit(1);
}

const stringValue = (key) => (typeof metadata[key] === "string" ? metadata[key] : "");
const version = stringValue("version");
const workingDirectory = stringValue("workingDirectory");
const nodeVersion = stringValue("nodeVersion");
const pid = typeof metadata.pid === "number" || typeof metadata.pid === "string" ? String(metadata.pid) : "";
const problems = [];

console.log("Startup self-check:");
console.log(`  Live app version: ${version || "(missing)"}`);
console.log(`  Working directory: ${workingDirectory || "(missing)"}`);
console.log(`  Node version: ${nodeVersion || "(missing)"}`);
console.log(`  Runtime PID: ${pid || "(missing)"}`);
console.log(`  launchd PID: ${launchdPid || "(missing)"}`);

if (!version) {
  problems.push("/api/version did not report an app version.");
} else if (version !== expectedVersion) {
  problems.push(`live app version ${version} does not match this repo's package.json version ${expectedVersion}.`);
}

if (!workingDirectory) {
  problems.push("/api/version did not report a working directory. The running app is probably old code.");
} else if (workingDirectory !== expectedRoot) {
  problems.push(`live working directory is ${workingDirectory}, expected ${expectedRoot}.`);
}

if (!nodeVersion) {
  problems.push("/api/version did not report a Node version. The running app is probably old code.");
}

if (!pid) {
  problems.push("/api/version did not report a runtime PID.");
} else if (!launchdPid) {
  problems.push("launchd did not report a running PID for com.ptzcommander.multiuser.");
} else if (pid !== launchdPid) {
  problems.push(`HTTP response came from PID ${pid}, but launchd is supervising PID ${launchdPid}. Another process is still answering on the port.`);
}

if (problems.length > 0) {
  console.error("");
  console.error("ERROR: launchd startup self-check failed:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}
NODE
}

if [ ! -f "$PLIST_TEMPLATE" ]; then
  fail "Missing plist template: $PLIST_TEMPLATE"
fi

case "$SELF_CHECK_TIMEOUT" in
  ''|*[!0-9]*)
    fail "PTZCOMMAND_SELF_CHECK_TIMEOUT must be a positive integer."
    ;;
esac
if [ "$SELF_CHECK_TIMEOUT" -lt 1 ]; then
  fail "PTZCOMMAND_SELF_CHECK_TIMEOUT must be a positive integer."
fi

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed or not in PATH."
fi

if ! command -v curl >/dev/null 2>&1; then
  fail "curl is not installed or not in PATH."
fi

NODE_BIN=$(command -v node)
case "$NODE_BIN" in
  /*)
    ;;
  *)
    fail "Could not resolve an absolute Node.js binary path from: $NODE_BIN"
    ;;
esac

EXPECTED_VERSION=$(node -e 'const fs = require("fs"); const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); if (typeof pkg.version !== "string" || !pkg.version) process.exit(1); process.stdout.write(pkg.version);' "$ROOT_DIR/package.json") || fail "Could not read package.json version."

if [ ! -f "$ROOT_DIR/dist/index.cjs" ]; then
  fail "Missing production build at $ROOT_DIR/dist/index.cjs. Run npm run build before installing the launchd agent."
fi

STALE_SOURCE=$(find "$ROOT_DIR/client" "$ROOT_DIR/server" "$ROOT_DIR/shared" "$ROOT_DIR/package.json" "$ROOT_DIR/vite.config.ts" -type f -newer "$ROOT_DIR/dist/index.cjs" -print 2>/dev/null | sed -n '1p')
if [ -n "$STALE_SOURCE" ]; then
  fail "Production build is older than $STALE_SOURCE. Run npm run build before installing the launchd agent."
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

if [ ! -f "$SECRET_FILE" ]; then
  umask 077
  /usr/bin/openssl rand -hex 32 > "$SECRET_FILE"
fi

SESSION_SECRET=$(tr -d '\n' < "$SECRET_FILE")
HOSTNAME=$(scutil --get LocalHostName 2>/dev/null || hostname -s)

ROOT_ESCAPED=$(printf '%s\n' "$ROOT_DIR" | sed 's/[\/&]/\\&/g')
NODE_ESCAPED=$(printf '%s\n' "$NODE_BIN" | sed 's/[\/&]/\\&/g')
LOG_ESCAPED=$(printf '%s\n' "$LOG_DIR" | sed 's/[\/&]/\\&/g')
PORT_ESCAPED=$(printf '%s\n' "$PORT" | sed 's/[\/&]/\\&/g')
SECRET_ESCAPED=$(printf '%s\n' "$SESSION_SECRET" | sed 's/[\/&]/\\&/g')

sed \
  -e "s/__ROOT__/$ROOT_ESCAPED/g" \
  -e "s/__NODE_BIN__/$NODE_ESCAPED/g" \
  -e "s/__LOG_DIR__/$LOG_ESCAPED/g" \
  -e "s/__PORT__/$PORT_ESCAPED/g" \
  -e "s/__SESSION_SECRET__/$SECRET_ESCAPED/g" \
  "$PLIST_TEMPLATE" > "$PLIST_TARGET"

launchctl bootout "$SERVICE_DOMAIN" "$PLIST_TARGET" >/dev/null 2>&1 || true
launchctl bootstrap "$SERVICE_DOMAIN" "$PLIST_TARGET"
launchctl enable "$SERVICE_TARGET" >/dev/null 2>&1 || true
launchctl kickstart -k "$SERVICE_TARGET"

if ! SELF_CHECK_JSON=$(wait_for_version_metadata); then
  echo "ERROR: launchd startup self-check failed: $VERSION_URL did not return valid JSON within ${SELF_CHECK_TIMEOUT}s." >&2
  print_failure_context
  exit 1
fi

LAUNCHD_PID=$(get_launchd_pid || true)
if ! validate_self_check "$SELF_CHECK_JSON" "$LAUNCHD_PID"; then
  print_failure_context
  exit 1
fi

echo "Installed launchd agent:"
echo "  $PLIST_TARGET"
echo "Node binary:"
echo "  $NODE_BIN"
echo "Logs:"
echo "  $LOG_DIR/ptzcommander.stdout.log"
echo "  $LOG_DIR/ptzcommander.stderr.log"
echo
echo "PTZCommander multi-user is now running in the background."
echo "Stable LAN URL:"
echo "  http://$HOSTNAME.local:$PORT"
echo
echo "To stop it later:"
echo "  launchctl bootout $SERVICE_DOMAIN $PLIST_TARGET"
