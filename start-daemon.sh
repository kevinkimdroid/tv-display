#!/bin/bash
# Start TV Display in the background (survives SSH logout).
cd "$(dirname "$0")"
APP_DIR="$(pwd)"
PID_FILE="$APP_DIR/.tv-display.pid"
LOG_FILE="$APP_DIR/tv-display.log"

if [ ! -d node_modules ]; then echo "Run ./install.sh first"; exit 1; fi
if [ ! -f .env ]; then echo "Run ./install.sh first"; exit 1; fi

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "TV Display is already running (PID $OLD_PID)."
    echo "Use ./restart.sh to restart, or ./stop.sh to stop first."
    exit 1
  fi
  rm -f "$PID_FILE"
fi

PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d ' "'\''')
PORT=${PORT:-3000}

echo "Starting TV Display on http://0.0.0.0:$PORT"
nohup node server.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Started (PID $(cat "$PID_FILE")). Logs: $LOG_FILE"
