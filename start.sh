#!/usr/bin/env bash
# Starts Artha for local development/testing on macOS.
# Bypasses electron/main.js's Windows-only backend spawn path (venv\Scripts\python.exe)
# by launching the FastAPI backend directly, then Vite, then Electron.
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PID_DIR="$ROOT_DIR/.run"
mkdir -p "$PID_DIR"
DATA_DIR="$ROOT_DIR/data"
mkdir -p "$DATA_DIR"

if [ ! -d "venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv venv
  ./venv/bin/pip install -q -r backend/requirements.txt
fi

if [ ! -d "node_modules" ]; then
  echo "Installing Node dependencies..."
  npm install
fi

if [ -f "$PID_DIR/backend.pid" ] && kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
  echo "Backend already running (pid $(cat "$PID_DIR/backend.pid"))."
else
  echo "Starting FastAPI backend on 127.0.0.1:8000..."
  FINANCE_DB_DIR="$DATA_DIR" ./venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 \
    > "$PID_DIR/backend.log" 2>&1 &
  echo $! > "$PID_DIR/backend.pid"
fi

echo "Waiting for backend to respond..."
for i in $(seq 1 15); do
  if curl -s -o /dev/null http://127.0.0.1:8000/api/init; then
    echo "Backend is up."
    break
  fi
  sleep 1
done

if [ -f "$PID_DIR/vite.pid" ] && kill -0 "$(cat "$PID_DIR/vite.pid")" 2>/dev/null; then
  echo "Vite dev server already running (pid $(cat "$PID_DIR/vite.pid"))."
else
  echo "Starting Vite dev server on :5173..."
  npx vite > "$PID_DIR/vite.log" 2>&1 &
  echo $! > "$PID_DIR/vite.pid"
fi

echo "Waiting for Vite to respond..."
for i in $(seq 1 15); do
  if curl -s -o /dev/null http://localhost:5173; then
    echo "Vite is up."
    break
  fi
  sleep 1
done

echo "Launching Electron shell..."
ELECTRON_BIN="$ROOT_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [ ! -x "$ELECTRON_BIN" ]; then
  echo "Electron binary not found at $ELECTRON_BIN, falling back to npx electron ."
  ELECTRON_BIN=""
fi
# ELECTRON_RUN_AS_NODE (set by some host environments, e.g. Electron-based editors/tools)
# forces any Electron binary to run as plain Node instead of launching the GUI shell.
# Unset it for Artha's own Electron process.
if [ -n "$ELECTRON_BIN" ]; then
  env -u ELECTRON_RUN_AS_NODE "$ELECTRON_BIN" "$ROOT_DIR" > "$PID_DIR/electron.log" 2>&1 &
else
  env -u ELECTRON_RUN_AS_NODE npx electron . > "$PID_DIR/electron.log" 2>&1 &
fi
echo $! > "$PID_DIR/electron.pid"

echo ""
echo "Artha is starting. Logs: $PID_DIR/{backend,vite,electron}.log"
echo "Run ./stop.sh to stop all services."
