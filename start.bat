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

echo Checking for updates...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)
echo.

echo Clearing Vite cache...
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
)
echo.

echo Starting PTZ Command server...
echo.
echo Press Ctrl+C to stop the server.
echo.

start "" "http://localhost:3478"
npx tsx server/index.ts
pause
