# PTZ Command - Setup Script for Windows PowerShell

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  PTZ Command - Local Setup Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This application provides:" -ForegroundColor White
Write-Host "  - PTZ camera control via VISCA over IP" -ForegroundColor White
Write-Host "  - Behringer X32 mixer control via OSC" -ForegroundColor White
Write-Host "  - Blackmagic ATEM switcher control" -ForegroundColor White
Write-Host "  - Program/Preview switching workflow" -ForegroundColor White
Write-Host ""

# Check for Node.js
try {
    $nodeVersion = node -v
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Node.js is not installed." -ForegroundColor Red
    Write-Host "Please install Node.js 20+ from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

# Database setup information
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Database Configuration" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "PTZ Command supports two database options:" -ForegroundColor White
Write-Host ""
Write-Host "1. SQLite (Default - No setup required)" -ForegroundColor Green
Write-Host "   - Database file stored at: data\ptzcommand.db" -ForegroundColor Gray
Write-Host "   - Automatically created on first run" -ForegroundColor Gray
Write-Host "   - Perfect for single-user local installations" -ForegroundColor Gray
Write-Host ""
Write-Host "2. PostgreSQL (Optional)" -ForegroundColor Yellow
Write-Host "   - Set DATABASE_URL environment variable" -ForegroundColor Gray
Write-Host "   - Example: `$env:DATABASE_URL = 'postgresql://user:pass@localhost:5432/ptz_command'" -ForegroundColor Gray
Write-Host "   - Then run: npm run db:push" -ForegroundColor Gray
Write-Host ""

# Create data directory for SQLite
if (!(Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
}
Write-Host "Created data directory for SQLite database." -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the application:" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor Green
Write-Host ""
Write-Host "Then open http://localhost:5000 in your browser." -ForegroundColor White
Write-Host ""
Write-Host "Network Requirements:" -ForegroundColor White
Write-Host "  - PTZ cameras: TCP port 52381 (VISCA)" -ForegroundColor Gray
Write-Host "  - X32 mixer: UDP port 10023 (OSC)" -ForegroundColor Gray
Write-Host "  - ATEM switcher: TCP (auto-discovered)" -ForegroundColor Gray
Write-Host ""
