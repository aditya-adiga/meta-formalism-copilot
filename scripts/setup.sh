#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[setup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[setup]${NC} $*"; }
error()   { echo -e "${RED}[setup]${NC} $*" >&2; }

# ── Prerequisite checks ───────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  error "node not found. Install Node.js 20+ and re-run."
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if (( NODE_MAJOR < 20 )); then
  warn "Node.js $NODE_MAJOR detected; Node.js 20+ is recommended."
fi

# ── npm install ───────────────────────────────────────────────────────────────
info "Installing npm dependencies..."
npm install

# ── Shutdown handler ──────────────────────────────────────────────────────────
NPM_PID=""
DOCKER_PID=""

cleanup() {
  echo ""
  info "Shutting down..."
  [[ -n "$NPM_PID" ]]    && kill "$NPM_PID"    2>/dev/null || true
  [[ -n "$DOCKER_PID" ]] && kill "$DOCKER_PID" 2>/dev/null || true
  wait
  info "Done."
}
trap cleanup INT TERM

# ── Start both services ───────────────────────────────────────────────────────
info "Starting Next.js dev server..."
npm run dev &
NPM_PID=$!

if ! command -v docker &>/dev/null; then
  warn "docker not found — skipping Lean verifier. The app will use mock verification."
else
  info "Building and starting the Lean 4 verifier (first build may take several minutes)..."
  docker compose up --build &
  DOCKER_PID=$!
fi

echo ""
info "Both services running. Press Ctrl+C to stop."
echo ""
echo "  App:             http://localhost:3000  (pid $NPM_PID)"
[[ -n "$DOCKER_PID" ]] && \
echo "  Lean verifier:   http://localhost:3100  (pid $DOCKER_PID)"
echo ""

wait
