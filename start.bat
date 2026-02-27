@echo off
title PTZ Command
echo ================================================
echo   PTZ Command - Camera Control System
echo ================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies.
        pause
        exit /b 1
    )
    echo.
)

echo Starting PTZ Command server...
echo The app will open at http://localhost:3478
echo.
echo Press Ctrl+C to stop the server.
echo.
npx tsx server/index.ts
pause
