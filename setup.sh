#!/usr/bin/env bash
# KŌDO Agent — First-time setup script
set -e

echo ""
echo "⚡ KŌDO Agent Setup"
echo "==================="
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌ Python 3.11+ is required. Please install it first."
  exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "✓ Python $PYTHON_VERSION"

# Check Node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js 18+ is required. Please install it first."
  exit 1
fi
echo "✓ Node $(node --version)"

# Backend setup
echo ""
echo "📦 Setting up backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt --quiet
echo "✓ Backend dependencies installed"

# Create .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  Created backend/.env from template."
  echo "   Please add your ANTHROPIC_API_KEY to backend/.env"
fi
cd ..

# Frontend setup
echo ""
echo "📦 Setting up frontend..."
cd frontend
npm install --silent
echo "✓ Frontend dependencies installed"
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit backend/.env and add your ANTHROPIC_API_KEY"
echo "  2. Terminal 1: cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000"
echo "  3. Terminal 2: cd frontend && npm run dev"
echo "  4. Open http://localhost:5173"
echo ""
