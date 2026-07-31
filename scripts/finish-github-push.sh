#!/bin/bash
set -euo pipefail
cd "/Users/lucahajimepolenghi/AI Stuff/BTC Dashboard"

echo "== status =="
git status --short
git log -2 --oneline

echo "== amend message =="
git commit --amend -m "Volatility desk: HAR IC scope, Deribit trade plan, confidence column" || true

echo "== pull --rebase =="
git pull --rebase origin main

echo "== push =="
git push origin main

echo "== done =="
git log -1 --oneline
git status
