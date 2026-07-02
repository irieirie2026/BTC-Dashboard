#!/bin/bash
PROJECT="/Users/lucahajimepolenghi/AI Stuff/BTC Dashboard"
URL="http://localhost:5173"
LOG="/tmp/btc-dashboard-server.log"

cd "$PROJECT" || { echo "Project not found"; read -r _; exit 1; }

if ! lsof -ti :5173 >/dev/null 2>&1; then
  echo "Starting server…"
  nohup python3 server.py >> "$LOG" 2>&1 &
  sleep 2
fi

open "$URL"
echo "Dashboard: $URL"
echo "Log: $LOG"
read -r -p "Press Enter to close…"