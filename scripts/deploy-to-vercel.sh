#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Staging changes..."
git add -A
git status --short

if git diff --cached --quiet; then
  echo "==> No staged changes; continuing with existing commits..."
else
  echo "==> Committing..."
  git commit -m "Add Cross-Market monitor: menu, charts, APIs, and Vercel config"
fi

echo "==> Pulling main (rebase)..."
if ! git pull --rebase origin main; then
  echo "==> Rebase failed. Run: git rebase --abort"
  exit 1
fi

echo "==> Pushing to origin main (triggers Vercel)..."
git push origin main

echo "==> Latest commit:"
git log -1 --oneline

echo "==> Waiting 90s for Vercel build..."
sleep 90

code=$(curl -s -o /dev/null -w "%{http_code}" "https://btc-dashboard-bay.vercel.app/cross-market-charts.js?v=8" || echo "000")
echo "==> cross-market-charts.js HTTP status: $code (expect 200 after deploy)"
echo "==> Production: https://btc-dashboard-bay.vercel.app/misc/cross-market"