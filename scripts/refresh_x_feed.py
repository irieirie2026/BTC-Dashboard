#!/usr/bin/env python3
"""Refresh bundled X feed cache used when Nitter mirrors block serverless hosts."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from server import write_x_feed_cache, _fetch_x_tweets_live, X_FEED_CACHE_PATH  # noqa: E402


def main():
    print(f"Fetching live X feed from Nitter mirrors...")
    tweets, mirror_host = _fetch_x_tweets_live()
    if not tweets:
        print("ERROR: No tweets fetched from any mirror.", file=sys.stderr)
        return 1

    if not write_x_feed_cache(tweets, mirror_source=mirror_host):
        print("ERROR: Failed to write cache file.", file=sys.stderr)
        return 1

    print(f"Wrote {len(tweets)} tweets to {X_FEED_CACHE_PATH}")
    print(f"Mirror: {mirror_host or 'unknown'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())