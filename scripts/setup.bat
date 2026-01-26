@echo off
REM PTZ Command - Setup Script for Windows
REM Controls PTZ cameras via VISCA and Behringer X32 mixers via OSC

echo ==========================================
echo   PTZ Command - Local Setup Script
echo ==========================================
echo.
echo This application provides:
echo   - PTZ camera control via VISCA over IP
echo   - Behringer X32 mixer control via OSC
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

for /f "tokens=1,2,3 delims=." %%a in ('node -v') do set NODE_MAJOR=%%a
set NODE_MAJOR=%NODE_MAJOR:v=%
echo Node.js version: 
node -v

REM Install dependencies
echo.
echo Installing dependencies...
call npm install

REM Check for .env file
if not exist .env (
    echo.
    echo Creating .env file...
    (
        echo # PTZ Command Configuration
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ptz_command
        echo PORT=5000
    ) > .env
    echo .env file created. Please update with your PostgreSQL credentials.
)

REM Push database schema
echo.
echo Initializing database schema...
call npm run db:push

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
echo.
pause
