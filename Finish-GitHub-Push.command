#!/bin/bash
# Double-click this file to amend message, rebase onto GitHub, and push (updates Vercel).

cd "$(dirname "$0")"
set -e

echo "========================================"
echo "  BTC Dashboard — finish GitHub push"
echo "========================================"
echo "Folder: $(pwd)"
echo ""

if [ ! -d .git ]; then
  echo "Error: not a git repository."
  read -r -p "Press Enter to close..."
  exit 1
fi

echo "Current commits:"
git log -2 --oneline
echo ""

# Fix bad commit message if HEAD is still the accidental one (or always set a clean message if not yet pushed)
if git rev-parse @{u} >/dev/null 2>&1; then
  LOCAL=$(git rev-parse @)
  REMOTE=$(git rev-parse @{u} 2>/dev/null || true)
  # Amend only if our tip is not on remote yet
  if [ -n "$REMOTE" ] && ! git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
    echo "Amending commit message..."
    git commit --amend -m "Volatility desk: HAR IC scope, Deribit trade plan, confidence column" || true
  fi
else
  git commit --amend -m "Volatility desk: HAR IC scope, Deribit trade plan, confidence column" || true
fi

# Safer: always amend if last message looks like the accidental shell paste
MSG=$(git log -1 --pretty=%s)
if [[ "$MSG" == cd\ * ]] || [[ "$MSG" == *git\ add* ]] || [[ "$MSG" == *BTC\ Dashboard* && "$MSG" == cd* ]]; then
  echo "Fixing accidental commit message..."
  git commit --amend -m "Volatility desk: HAR IC scope, Deribit trade plan, confidence column"
fi

# Also fix if message is the path line only
if [[ "$MSG" == *'/AI Stuff/BTC Dashboard'* ]]; then
  echo "Fixing accidental commit message..."
  git commit --amend -m "Volatility desk: HAR IC scope, Deribit trade plan, confidence column"
fi

echo ""
echo "Pulling with rebase from origin/main..."
if ! git pull --rebase origin main; then
  echo ""
  echo "Rebase failed (conflicts or network). Fix conflicts, then:"
  echo "  git add ."
  echo "  git rebase --continue"
  echo "  git push origin main"
  echo ""
  echo "Or abort: git rebase --abort"
  read -r -p "Press Enter to close..."
  exit 1
fi

echo ""
echo "Pushing to GitHub..."
if git push origin main; then
  echo ""
  echo "Success. Latest commit:"
  git log -1 --oneline
  echo ""
  echo "Vercel should redeploy main in ~1–2 minutes."
else
  echo ""
  echo "Push failed. You may need: gh auth login"
  read -r -p "Press Enter to close..."
  exit 1
fi

echo ""
git status
echo ""
read -r -p "Press Enter to close..."
