#!/bin/bash
cd "$(dirname "$0")"

if lsof -ti :5173 >/dev/null 2>&1; then
  echo "Server already running at http://localhost:5173"
else
  echo "Starting server..."
  if [ -x "./.venv/bin/python" ]; then
    ./.venv/bin/python server.py &
  else
    python3 server.py &
  fi
  sleep 2
fi

open "http://localhost:5173"
echo "Press Ctrl+C to stop this window (server keeps running in background)."
wait