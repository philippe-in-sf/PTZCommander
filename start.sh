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

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies."
        exit 1
    fi
    echo ""
fi

echo "Starting PTZ Command server..."
echo "The app will open at http://localhost:3478"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""
npx tsx server/index.ts
