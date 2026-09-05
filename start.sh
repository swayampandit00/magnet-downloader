#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Start backend API
cd "$ROOT"
if [ ! -d node_modules ]; then
  npm install
fi
node src/server.js &
BACKEND_PID=$!

# Start web UI (exposed preview port)
cd "$ROOT/web"
if [ ! -d node_modules ]; then
  npm install
fi

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm run dev
