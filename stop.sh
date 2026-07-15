#!/bin/bash
# Stop only the TV Display app (does not affect other services on the server).
cd "$(dirname "$0")"
APP_DIR="$(pwd)"
PID_FILE="$APP_DIR/.tv-display.pid"
PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d ' "'\''')
PORT=${PORT:-3000}

stop_pid() {
  local pid="$1"
  [ -z "$pid" ] && return 1
  kill -0 "$pid" 2>/dev/null || return 1

  echo "Stopping TV Display (PID $pid)..."
  kill "$pid" 2>/dev/null

  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "Force stopping PID $pid..."
    kill -9 "$pid" 2>/dev/null
  fi
  return 0
}

# 1. PID file (preferred)
if [ -f "$PID_FILE" ]; then
  if stop_pid "$(cat "$PID_FILE")"; then
    rm -f "$PID_FILE"
    echo "TV Display stopped."
    exit 0
  fi
  rm -f "$PID_FILE"
fi

# 2. Process started via nohup ./start.sh (node server.js in this folder)
MATCHED=0
while IFS= read -r pid; do
  [ -z "$pid" ] && continue
  cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)
  if [ "$cwd" = "$APP_DIR" ]; then
    stop_pid "$pid" && MATCHED=1
  fi
done < <(pgrep -f "node.*server\.js" 2>/dev/null || true)

if [ "$MATCHED" -eq 1 ]; then
  echo "TV Display stopped."
  exit 0
fi

# 3. Whatever is listening on our port (tv-display default: 3000)
if command -v fuser &>/dev/null; then
  PIDS=$(fuser "${PORT}/tcp" 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$' || true)
  if [ -n "$PIDS" ]; then
    for pid in $PIDS; do
      stop_pid "$pid"
    done
    echo "TV Display stopped (port $PORT)."
    exit 0
  fi
fi

echo "TV Display is not running."
exit 0
