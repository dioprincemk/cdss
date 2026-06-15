#!/bin/bash
# =============================================================================
# CDSS — Single startup script
# Starts both backend (FastAPI) and frontend (Vite) concurrently
# Usage: chmod +x start.sh && ./start.sh
# =============================================================================

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  ██████╗██████╗ ███████╗███████╗"
echo " ██╔════╝██╔══██╗██╔════╝██╔════╝"
echo " ██║     ██║  ██║███████╗███████╗"
echo " ██║     ██║  ██║╚════██║╚════██║"
echo " ╚██████╗██████╔╝███████║███████║"
echo "  ╚═════╝╚═════╝ ╚══════╝╚══════╝"
echo -e "${NC}"
echo -e "${GREEN}Clinical Decision Support System${NC}"
echo "======================================"

# ── Check prerequisites ────────────────────────────────────────────────────────
check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗ '$1' not found. Please install it first.${NC}"
    exit 1
  fi
}

check_command python3
check_command node
check_command npm
check_command psql

echo -e "${GREEN}✓ All prerequisites found${NC}"

# ── Backend setup ──────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[Backend] Setting up Python environment...${NC}"
cd backend

if [ ! -d "venv" ]; then
  echo "  Creating virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate
echo "  Installing dependencies..."
pip install -r requirements.txt -q

if [ ! -f ".env" ]; then
  echo -e "${YELLOW}  .env not found — copying from .env.example${NC}"
  cp .env.example .env
  echo -e "${RED}  ⚠ Please edit backend/.env with your database credentials before proceeding.${NC}"
fi

echo -e "${GREEN}✓ Backend ready${NC}"

# ── Frontend setup ─────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[Frontend] Installing Node dependencies...${NC}"
cd ../frontend
if [ ! -d "node_modules" ]; then
  npm install -q
fi
echo -e "${GREEN}✓ Frontend ready${NC}"

# ── Launch both ────────────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo -e "${GREEN}Starting CDSS...${NC}"
echo -e "  Backend:  ${BLUE}http://localhost:8000${NC}"
echo -e "  Frontend: ${BLUE}http://localhost:5173${NC}"
echo -e "  API Docs: ${BLUE}http://localhost:8000/api/docs${NC}"
echo "======================================"
echo ""

# Start backend in background
cd ../backend
source venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start frontend in background
cd ../frontend
npm run dev &
FRONTEND_PID=$!

# Trap Ctrl+C to kill both
cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  echo -e "${GREEN}Stopped.${NC}"
  exit 0
}
trap cleanup INT TERM

echo -e "${GREEN}Both services running. Press Ctrl+C to stop.${NC}"
wait
