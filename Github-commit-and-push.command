#!/bin/bash

# =============================================
# One-click Commit & Push for BTC Dashboard
# Double-click this file to commit and push changes
# =============================================

# Change to the directory where this .command file is located
cd "$(dirname "$0")"

echo "========================================"
echo "  BTC Dashboard - Commit & Push"
echo "========================================"
echo ""

# Check if this is a git repository
if [ ! -d .git ]; then
    echo "❌ Error: This folder is not a Git repository."
    echo "Please make sure this .command file is inside your project folder."
    read -p "Press Enter to close..."
    exit 1
fi

# Show current status
echo "Current changes:"
git status --short
echo ""

# Check if there are any changes
if git diff-index --quiet HEAD --; then
    echo "✅ No changes to commit."
    read -p "Press Enter to close this window..."
    exit 0
fi

# Ask for commit message
echo "Enter a commit message (or press Enter for automatic message):"
read -r commit_message

if [ -z "$commit_message" ]; then
    commit_message="Update $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo ""
echo "Committing with message: \"$commit_message\""
echo ""

# Add all changes
git add .

# Commit
git commit -m "$commit_message"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Commit failed."
    read -p "Press Enter to close..."
    exit 1
fi

echo ""
echo "Pushing to GitHub..."
echo ""

# Push
git push

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
else
    echo ""
    echo "❌ Push failed. You may need to authenticate or fix credentials."
    echo "Try running: gh auth login"
fi

echo ""
read -p "Press Enter to close this window..."