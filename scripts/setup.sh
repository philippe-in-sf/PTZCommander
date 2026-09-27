#!/bin/sh
set -eu

echo "PTZ Command setup now runs through the guided local setup command."
echo "This checks Node 24, dependencies, FFmpeg, port 3478, build readiness, and launchd options."
echo ""

if [ ! -x "node_modules/.bin/tsx" ]; then
  echo "Installing local dependencies first..."
  npm install
  echo ""
fi

npm run setup:local
