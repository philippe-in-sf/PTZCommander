#!/bin/bash
echo "================================================"
echo "  PTZ Command - Camera Control System"
echo "================================================"
echo ""

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

echo "Checking for updates..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies."
    exit 1
fi
echo ""

echo "Starting PTZ Command server..."
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

open_browser() {
    sleep 2
    if command -v xdg-open &> /dev/null; then
        xdg-open "http://localhost:3478"
    elif command -v open &> /dev/null; then
        open "http://localhost:3478"
    else
        echo "Open http://localhost:3478 in your browser."
    fi
}

open_browser &
npx tsx server/index.ts
