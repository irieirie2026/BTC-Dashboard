#!/bin/bash
# Double-click or run from Terminal to refresh free-tier BTC series into data/btc-series/.
# Safe for BGeometrics rate limits: small batches with pauses.

cd "$(dirname "$0")/.." || exit 1
echo "BTC series prefetch — project: $(pwd)"
echo "Status before:"
python3 scripts/btc_prefetch.py --status 2>/dev/null | head -40
echo ""
echo "Running batch (max 4 metrics)…"
python3 scripts/btc_prefetch.py --once --max 4
echo ""
echo "Tip: re-run every hour or enable GitHub Actions workflow prefetch-btc-series.yml"
echo "Status after:"
python3 scripts/btc_prefetch.py --status 2>/dev/null | head -40
read -r -p "Press Enter to close…"
