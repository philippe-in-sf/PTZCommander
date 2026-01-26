# PTZ Command - Setup Script for Windows PowerShell

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  PTZ Command - Local Setup Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
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

# Check for PostgreSQL
try {
    $psqlVersion = psql --version
    Write-Host "PostgreSQL: $psqlVersion" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "Warning: PostgreSQL is not installed or not in PATH." -ForegroundColor Yellow
    Write-Host "Please install PostgreSQL 14+ from https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    Write-Host ""
}

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

# Check for .env file
if (!(Test-Path ".env")) {
    Write-Host ""
    Write-Host "Creating .env file..." -ForegroundColor Cyan
    @"
# PTZ Command Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ptz_command
PORT=5000
"@ | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host ".env file created. Please update with your PostgreSQL credentials." -ForegroundColor Yellow
}

# Push database schema
Write-Host ""
Write-Host "Initializing database schema..." -ForegroundColor Cyan
npm run db:push

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
