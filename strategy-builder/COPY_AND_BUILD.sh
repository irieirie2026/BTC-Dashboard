#!/usr/bin/env bash
# Build Strategy Builder into dashboard assets (single-app workflow).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/strategy-builder"
npm install
npm run build
echo "Built → $ROOT/assets/options-strategy/"
ls -la "$ROOT/assets/options-strategy/btc-options-strategy."*
