@echo off
REM PTZ Command - Setup Script for Windows
REM Controls PTZ cameras via VISCA, Behringer X32 mixers via OSC, and ATEM switchers

echo ==========================================
echo   PTZ Command - Local Setup Script
echo ==========================================
echo.
echo This application provides:
echo   - PTZ camera control via VISCA over IP
echo   - Behringer X32 mixer control via OSC
echo   - Blackmagic ATEM switcher control
echo   - Program/Preview switching workflow
echo.

REM Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js is not installed.
    echo Please install Node.js 20+ from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version: 
node -v

REM Install dependencies
echo.
echo Installing dependencies...
call npm install

REM Database setup information
echo.
echo ==========================================
echo   Database Configuration
echo ==========================================
echo.
echo PTZ Command supports two database options:
echo.
echo 1. SQLite (Default - No setup required)
echo    - Database file stored at: data\ptzcommand.db
echo    - Automatically created on first run
echo    - Perfect for single-user local installations
echo.
echo 2. PostgreSQL (Optional)
echo    - Set DATABASE_URL environment variable
echo    - Example: set DATABASE_URL=postgresql://user:pass@localhost:5432/ptz_command
echo    - Then run: npm run db:push
echo.

REM Create data directory for SQLite
if not exist data mkdir data
echo Created data directory for SQLite database.

echo.
echo ==========================================
echo   Setup Complete!
echo ==========================================
echo.
echo To start the application:
echo   npm run dev
echo.
echo Then open http://localhost:5000 in your browser.
echo.
echo Network Requirements:
echo   - PTZ cameras: TCP port 52381 (VISCA)
echo   - X32 mixer: UDP port 10023 (OSC)
echo   - ATEM switcher: TCP (auto-discovered)
echo.
pause
