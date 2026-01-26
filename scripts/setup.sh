#!/bin/bash

# PTZ Command - Setup Script for Mac/Linux
# Controls PTZ cameras via VISCA and Behringer X32 mixers via OSC

echo "=========================================="
echo "  PTZ Command - Local Setup Script"
echo "=========================================="
echo ""
echo "This application provides:"
echo "  - PTZ camera control via VISCA over IP"
echo "  - Behringer X32 mixer control via OSC"
echo "  - Program/Preview switching workflow"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "Warning: Node.js version 20+ recommended. Current version: $(node -v)"
fi

echo "Node.js version: $(node -v)"

# Check for PostgreSQL
if ! command -v psql &> /dev/null; then
    echo ""
    echo "Warning: PostgreSQL is not installed or not in PATH."
    echo "Please install PostgreSQL 14+ from https://www.postgresql.org/download/"
    echo ""
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Check for .env file
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env file..."
    cat > .env << EOF
# PTZ Command Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ptz_command
PORT=5000
EOF
    echo ".env file created. Please update with your PostgreSQL credentials."
fi

# Push database schema
echo ""
echo "Initializing database schema..."
npm run db:push

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "To start the application:"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:5000 in your browser."
echo ""
echo "Network Requirements:"
echo "  - PTZ cameras: TCP port 52381 (VISCA)"
echo "  - X32 mixer: UDP port 10023 (OSC)"
echo ""
