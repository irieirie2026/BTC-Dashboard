#!/bin/bash

# =============================================
# One-click Commit & Push for BTC Dashboard
# Double-click this file to commit and push changes
# =============================================

cd "$(dirname "$0")"

echo "========================================"
echo "  BTC Dashboard - Commit & Push"
echo "========================================"
echo ""
echo "Folder: $(pwd)"
echo ""

if [ ! -d .git ]; then
    echo "❌ Error: This folder is not a Git repository."
    echo "Please make sure this .command file is inside your project folder."
    read -p "Press Enter to close..."
    exit 1
fi

BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
echo "Branch: $BRANCH"
echo ""

echo "Current status:"
git status --short
if [ -z "$(git status --porcelain)" ]; then
    echo "  (working tree clean)"
fi
echo ""

# Any local file changes? (modified, deleted, or untracked)
HAS_FILE_CHANGES=0
if [ -n "$(git status --porcelain)" ]; then
    HAS_FILE_CHANGES=1
fi

# Any commits not yet on GitHub?
NEEDS_PUSH=0
if git rev-parse --abbrev-ref @{u} >/dev/null 2>&1; then
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse @{u})
    if [ "$LOCAL" != "$REMOTE" ]; then
        NEEDS_PUSH=1
        AHEAD=$(git rev-list --count @{u}..@)
        echo "📤 $AHEAD commit(s) on this Mac not yet on GitHub."
        echo ""
    fi
else
    echo "⚠️  No upstream branch set. Will push with: git push -u origin $BRANCH"
    echo ""
fi

if [ "$HAS_FILE_CHANGES" -eq 0 ] && [ "$NEEDS_PUSH" -eq 0 ]; then
    echo "✅ Everything is up to date."
    echo "   No file changes to commit, and GitHub already has your latest commits."
    echo ""
    echo "Latest commit:"
    git log -1 --oneline
    echo ""
    read -p "Press Enter to close this window..."
    exit 0
fi

if [ "$HAS_FILE_CHANGES" -eq 1 ]; then
    echo "Enter a commit message (or press Enter for automatic message):"
    read -r commit_message

    if [ -z "$commit_message" ]; then
        commit_message="Add Cross-Market monitor: menu, charts, APIs, and Vercel config"
    fi

    echo ""
    echo "Committing with message: \"$commit_message\""
    echo ""

    git add .

    git commit -m "$commit_message"

    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ Commit failed."
        read -p "Press Enter to close..."
        exit 1
    fi
    NEEDS_PUSH=1
fi

echo "Pulling latest from GitHub (rebase)..."
if git pull --rebase origin "$BRANCH"; then
    echo "✅ Rebased onto origin/$BRANCH"
else
    echo ""
    echo "❌ Pull/rebase failed."
    echo "To undo: git rebase --abort"
    echo "Then fix conflicts, git add <files>, git rebase --continue, and run this script again."
    read -p "Press Enter to close..."
    exit 1
fi
echo ""

if [ "$NEEDS_PUSH" -eq 1 ]; then
    echo ""
    echo "Pushing to GitHub..."
    echo ""

    if git rev-parse --abbrev-ref @{u} >/dev/null 2>&1; then
        git push
    else
        git push -u origin "$BRANCH"
    fi

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Successfully pushed to GitHub!"
        git log -1 --oneline
        echo ""
        echo "Vercel will auto-deploy from main in ~1–2 min."
        echo "Check: https://btc-dashboard-bay.vercel.app/misc/cross-market"
        echo "Asset check: https://btc-dashboard-bay.vercel.app/cross-market-charts.js (should be 200)"
    else
        echo ""
        echo "❌ Push failed. You may need to authenticate or fix credentials."
        echo "Try running: gh auth login"
    fi
fi

echo ""
read -p "Press Enter to close this window..."