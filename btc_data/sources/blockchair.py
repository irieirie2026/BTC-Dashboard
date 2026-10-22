"""Blockchair snapshot adapter."""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from typing import Any

from btc_data.fetchers import fetch_json
from macro_data.cache import cache_get, cache_get_stale, cache_set

TTL = 900
_CACHE_KEY = "btc:blockchair:stats:v1"
# 429 waits 15 minutes. 430 waits 30. A live call during the window is skipped.
_BACKOFF_UNTIL = 0.0


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _unavailable(reason: str) -> dict[str, Any]:
    return {
        "series": [],
        "latest": None,
        "source": "Blockchair",
        "stale": True,
        "unavailable": True,
        "status": "unavailable",
        "error": reason,
        "reason": reason,
        "fetchedAt": _now_iso(),
    }


def _last_good() -> tuple[dict[str, Any], float | None] | None:
    """Newest persisted Blockchair body, ignoring TTL. Disk series is the second copy."""
    hit = cache_get_stale(_CACHE_KEY)
    if hit and isinstance(hit[0], dict):
        body = hit[0]
        snap = (body.get("latest") or {}).get("snapshot") if isinstance(body.get("latest"), dict) else None
        if body.get("series") or isinstance(snap, dict):
            return body, hit[1]
    try:
        from btc_data.store import read_series

        stored = read_series("blockchair_stats")
    except Exception:
        stored = None
    if isinstance(stored, dict) and (stored.get("series") or stored.get("latest")):
        return stored, None
    return None


def _tag_stale(payload: dict[str, Any], reason: str, age: float | None) -> dict[str, Any]:
    out = dict(payload)
    out["stale"] = True
    out["status"] = "STALE"
    out["fromCache"] = True
    out["error"] = reason
    out["reason"] = reason
    if age is not None:
        out["ageSec"] = round(float(age), 1)
    return out


def _serve_last_good(reason: str) -> dict[str, Any]:
    last = _last_good()
    if last:
        body, age = last
        return _tag_stale(body, reason, age)
    return _unavailable(reason)


def fetch(spec, *, refresh: bool = False) -> dict[str, Any]:
    global _BACKOFF_UNTIL
    if not refresh:
        cached = cache_get(_CACHE_KEY, ttl=TTL)
        if cached:
            return {**cached, "fromCache": True}

    now = time.time()
    if now < _BACKOFF_UNTIL:
        return _serve_last_good("Blockchair rate limit — serving the last good copy")

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
        cache_set(_CACHE_KEY, payload)
        return payload
    except urllib.error.HTTPError as exc:
        if exc.code in (429, 430):
            wait = 1800 if exc.code == 430 else 900
            _BACKOFF_UNTIL = time.time() + wait
            return _serve_last_good(f"Blockchair HTTP {exc.code} — serving the last good copy")
        return _serve_last_good(f"Blockchair HTTP {exc.code}")
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
        return _serve_last_good(str(exc))