#!/usr/bin/env sh
# Kept for habit: same as "./artha start" (backend + web UI + desktop window).
# Pass "web" to skip the desktop window: ./start.sh web
exec "$(dirname "$0")/artha" start "$@"
