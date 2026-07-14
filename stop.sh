#!/usr/bin/env bash
# Stops all Artha services started by start.sh.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT_DIR/.run"

stop_pid_file() {
  local name="$1"
  local file="$PID_DIR/$name.pid"
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (pid $pid)..."
      kill "$pid" 2>/dev/null
      for i in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      kill -9 "$pid" 2>/dev/null || true
    else
      echo "$name not running (stale pid file)."
    fi
    rm -f "$file"
  else
    echo "$name pid file not found, skipping."
  fi
}

stop_pid_file electron
stop_pid_file vite
stop_pid_file backend

# Electron may spawn a couple of helper/renderer processes not covered by the pid file.
pkill -f "node_modules/.bin/electron" 2>/dev/null || true

echo "All services stopped."
