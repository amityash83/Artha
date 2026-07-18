#!/usr/bin/env bash
# Starts Artha for local development/testing on macOS.
# Bypasses electron/main.js's Windows-only backend spawn path (venv\Scripts\python.exe)
# by launching the FastAPI backend directly, then Vite, then Electron.
#
# Ports default to 8010/5183 (not Artha's Windows-desktop defaults 8000/5173) so this
# local dev setup doesn't collide with another project's server already using those
# common defaults on this machine. Override with:
#   ARTHA_BACKEND_PORT=1234 ARTHA_FRONTEND_PORT=5678 ./start.sh
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export ARTHA_BACKEND_PORT="${ARTHA_BACKEND_PORT:-8010}"
export ARTHA_FRONTEND_PORT="${ARTHA_FRONTEND_PORT:-5183}"
# The backend's CORS allowlist defaults to Vite's own default port (5173),
# not whatever ARTHA_FRONTEND_PORT resolves to here — without this, requests
# from this script's frontend get silently blocked by the browser, and the
# renderer's retry loop looks identical to "backend not responding" even
# though the backend is up. Respect an explicitly-set ARTHA_ALLOWED_ORIGINS
# as-is (e.g. to add a LAN origin); otherwise derive it from the frontend
# port so the two never drift out of sync.
export ARTHA_ALLOWED_ORIGINS="${ARTHA_ALLOWED_ORIGINS:-http://localhost:${ARTHA_FRONTEND_PORT},http://127.0.0.1:${ARTHA_FRONTEND_PORT}}"

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

# A port responding is NOT proof it's Artha's server — another project on this
# machine can easily be bound to the same port. Identity is checked by response
# *content*, not just "something answered".
is_artha_backend() {
  # Artha's /api/init always returns a JSON object with a "summary" key.
  # A wrong/foreign server will 404 or return an unrelated shape.
  curl -s "http://127.0.0.1:${ARTHA_BACKEND_PORT}/api/init" 2>/dev/null | grep -q '"summary"'
}

is_artha_frontend() {
  # Artha's index.html sets this title (see index.html) — a foreign Vite dev
  # server will serve its own project's title instead.
  curl -s "http://localhost:${ARTHA_FRONTEND_PORT}/" 2>/dev/null | grep -qi "<title>Artha"
}

if [ -f "$PID_DIR/backend.pid" ] && kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null && is_artha_backend; then
  echo "Backend already running (pid $(cat "$PID_DIR/backend.pid")) on port ${ARTHA_BACKEND_PORT}."
else
  if is_artha_backend; then
    echo "ERROR: port ${ARTHA_BACKEND_PORT} is already serving Artha's API but not from a PID this script started (stale .run/backend.pid)."
    echo "Refusing to start a second backend on the same port. Run ./stop.sh, confirm the port is free, then retry."
    exit 1
  elif curl -s -o /dev/null "http://127.0.0.1:${ARTHA_BACKEND_PORT}/" 2>/dev/null; then
    echo "ERROR: port ${ARTHA_BACKEND_PORT} is already in use by a different application (not Artha)."
    echo "Free the port, or override it: ARTHA_BACKEND_PORT=<other> ./start.sh"
    echo "See what's using it: lsof -i :${ARTHA_BACKEND_PORT}"
    exit 1
  fi
  echo "Starting FastAPI backend on 127.0.0.1:${ARTHA_BACKEND_PORT} (CORS allowlist: ${ARTHA_ALLOWED_ORIGINS})..."
  FINANCE_DB_DIR="$DATA_DIR" ./venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port "$ARTHA_BACKEND_PORT" \
    > "$PID_DIR/backend.log" 2>&1 &
  echo $! > "$PID_DIR/backend.pid"
fi

echo "Waiting for Artha's backend to respond..."
for i in $(seq 1 15); do
  if is_artha_backend; then
    echo "Backend is up."
    break
  fi
  sleep 1
done
if ! is_artha_backend; then
  echo "ERROR: backend did not come up as expected. Check $PID_DIR/backend.log"
  exit 1
fi

if [ -f "$PID_DIR/vite.pid" ] && kill -0 "$(cat "$PID_DIR/vite.pid")" 2>/dev/null && is_artha_frontend; then
  echo "Vite dev server already running (pid $(cat "$PID_DIR/vite.pid")) on port ${ARTHA_FRONTEND_PORT}."
else
  if is_artha_frontend; then
    echo "ERROR: port ${ARTHA_FRONTEND_PORT} is already serving Artha's frontend but not from a PID this script started (stale .run/vite.pid)."
    echo "Refusing to start a second Vite server on the same port. Run ./stop.sh, confirm the port is free, then retry."
    exit 1
  elif curl -s -o /dev/null "http://localhost:${ARTHA_FRONTEND_PORT}/" 2>/dev/null; then
    echo "ERROR: port ${ARTHA_FRONTEND_PORT} is already in use by a different application (not Artha) — likely another project's dev server."
    echo "Free the port, or override it: ARTHA_FRONTEND_PORT=<other> ./start.sh"
    echo "See what's using it: lsof -i :${ARTHA_FRONTEND_PORT}"
    exit 1
  fi
  echo "Starting Vite dev server on :${ARTHA_FRONTEND_PORT}..."
  npx vite > "$PID_DIR/vite.log" 2>&1 &
  echo $! > "$PID_DIR/vite.pid"
fi

echo "Waiting for Artha's frontend to respond..."
for i in $(seq 1 15); do
  if is_artha_frontend; then
    echo "Frontend is up."
    break
  fi
  sleep 1
done
if ! is_artha_frontend; then
  echo "ERROR: frontend did not come up as expected. Check $PID_DIR/vite.log"
  exit 1
fi

echo "Launching Electron shell..."
ELECTRON_BIN="$ROOT_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [ ! -x "$ELECTRON_BIN" ]; then
  echo "Electron binary not found at $ELECTRON_BIN, falling back to npx electron ."
  ELECTRON_BIN=""
fi
# ELECTRON_RUN_AS_NODE (set by some host environments, e.g. Electron-based editors/tools)
# forces any Electron binary to run as plain Node instead of launching the GUI shell.
# Unset it for Artha's own Electron process. ARTHA_BACKEND_PORT/ARTHA_FRONTEND_PORT are
# already exported above, so electron/main.js picks them up automatically.
if [ -n "$ELECTRON_BIN" ]; then
  env -u ELECTRON_RUN_AS_NODE "$ELECTRON_BIN" "$ROOT_DIR" > "$PID_DIR/electron.log" 2>&1 &
else
  env -u ELECTRON_RUN_AS_NODE npx electron . > "$PID_DIR/electron.log" 2>&1 &
fi
echo $! > "$PID_DIR/electron.pid"

echo ""
echo "Artha is starting on backend:${ARTHA_BACKEND_PORT} frontend:${ARTHA_FRONTEND_PORT}."
echo "Logs: $PID_DIR/{backend,vite,electron}.log"
echo "Run ./stop.sh to stop all services."
