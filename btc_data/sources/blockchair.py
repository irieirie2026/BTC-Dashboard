"""Blockchair snapshot adapter."""

from __future__ import annotations

import time
import urllib.request
from typing import Any

from btc_data.fetchers import fetch_json
from macro_data.cache import cache_get, cache_set

TTL = 900


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def fetch(spec, *, refresh: bool = False) -> dict[str, Any]:
    cache_key = "btc:blockchair:stats:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=TTL)
        if cached:
            return {**cached, "fromCache": True}

    try:
        raw = fetch_json("https://api.blockchair.com/bitcoin/stats", timeout=30)
        data = raw.get("data") or {}
        ts = int(time.time())
        point = {
            "timestamp": ts,
            "date": time.strftime("%Y-%m-%d", time.gmtime(ts)),
            "value": float(data.get("market_price_usd") or 0),
            "snapshot": data,
        }
        payload = {
            "series": [point],
            "latest": point,
            "source": "Blockchair",
            "fetchedAt": _now_iso(),
            "note": "Network snapshot — not a full historical series",
        }
        cache_set(cache_key, payload)
        return payload
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
        stale = cache_get(cache_key, ttl=TTL * 48)
        if stale:
            return {**stale, "stale": True, "error": str(exc)}
        return {
            "series": [],
            "latest": None,
            "source": "Blockchair",
            "error": str(exc),
            "fetchedAt": _now_iso(),
        }