#!/bin/bash
# Restart only TV Display — safe to run on a server shared with CRM or other apps.
cd "$(dirname "$0")"
chmod +x stop.sh start-daemon.sh 2>/dev/null || true
./stop.sh
sleep 1
./start-daemon.sh
