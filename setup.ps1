# KODO Agent - Windows Setup Script
# Run this from the kodo-agent-export folder in PowerShell

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  KODO Agent - Windows Setup" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "OK Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Python 3.11+ is required. Download from https://python.org" -ForegroundColor Red
    exit 1
}

# Check Node
try {
    $nodeVersion = node --version 2>&1
    Write-Host "OK Node: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js 18+ is required. Download from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Backend setup
Write-Host ""
Write-Host "Setting up backend..." -ForegroundColor Yellow

Set-Location backend
python -m venv venv
Write-Host "OK Virtual environment created" -ForegroundColor Green

.\venv\Scripts\pip install -r requirements.txt --quiet
Write-Host "OK Backend dependencies installed" -ForegroundColor Green

# Create .env if missing
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "IMPORTANT: Created backend\.env from template." -ForegroundColor Yellow
    Write-Host "           Open backend\.env and add your ANTHROPIC_API_KEY!" -ForegroundColor Yellow
}

Set-Location ..

# Frontend setup
Write-Host ""
Write-Host "Setting up frontend..." -ForegroundColor Yellow
Set-Location frontend
npm install --silent
Write-Host "OK Frontend dependencies installed" -ForegroundColor Green
Set-Location ..

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor White
Write-Host ""
Write-Host "1. Edit backend\.env and set your ANTHROPIC_API_KEY" -ForegroundColor Yellow
Write-Host "   (Get a key at https://console.anthropic.com)" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Open TWO PowerShell terminals in this folder:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Terminal 1 (Backend):" -ForegroundColor Cyan
Write-Host "   cd backend" -ForegroundColor White
Write-Host "   .\venv\Scripts\Activate.ps1" -ForegroundColor White
Write-Host "   uvicorn main:app --reload --port 8000" -ForegroundColor White
Write-Host ""
Write-Host "   Terminal 2 (Frontend):" -ForegroundColor Cyan
Write-Host "   cd frontend" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "3. Open http://localhost:5173 in your browser" -ForegroundColor Yellow
Write-Host ""
