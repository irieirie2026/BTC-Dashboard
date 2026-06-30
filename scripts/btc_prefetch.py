#!/usr/bin/env python3
"""Prefetch Bitcoin metric series into data/btc-series/ (cron-friendly).

Examples:
  python3 scripts/btc_prefetch.py --status
  python3 scripts/btc_prefetch.py --dry-run --max 10
  python3 scripts/btc_prefetch.py --once --max 3
  python3 scripts/btc_prefetch.py --metric mvrv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def _load_env() -> None:
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in __import__("os").environ:
            __import__("os").environ[key] = val


def main() -> int:
    _load_env()
    from btc_data.scheduler import run_batch, status_payload

    parser = argparse.ArgumentParser(description="Prefetch BTC metrics into local series store")
    parser.add_argument("--status", action="store_true", help="Print scheduler status JSON")
    parser.add_argument("--dry-run", action="store_true", help="List what would be fetched")
    parser.add_argument("--once", action="store_true", help="Run one prefetch batch")
    parser.add_argument("--max", type=int, default=3, help="Max metrics per batch (default 3)")
    parser.add_argument("--metric", type=str, default="", help="Fetch a single metric id")
    args = parser.parse_args()

    if args.status:
        print(json.dumps(status_payload(), indent=2))
        return 0

    if not args.once and not args.dry_run and not args.metric:
        parser.print_help()
        return 1

    result = run_batch(
        max_fetches=args.max,
        dry_run=args.dry_run,
        metric_id=args.metric or None,
    )
    print(json.dumps(result, indent=2))
    if result.get("error"):
        return 1
    failures = [r for r in result.get("results") or [] if r.get("error") and not r.get("skipped")]
    return 1 if failures and not args.dry_run else 0


if __name__ == "__main__":
    raise SystemExit(main())