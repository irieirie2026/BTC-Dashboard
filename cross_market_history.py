"""Persist cross-market anomaly events (7–30 day ring buffer)."""

from __future__ import annotations

import time
from datetime import datetime, timezone

from cache import service as cache_service
from cache.keys import cross_market_events

MAX_EVENTS = 50_000
MAX_AGE_SEC = 30 * 86400


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_events() -> list[dict]:
    raw = cache_service.get(cross_market_events(), default=[])
    return raw if isinstance(raw, list) else []


def _prune(events: list[dict]) -> list[dict]:
    cutoff = time.time() - MAX_AGE_SEC
    out = []
    for e in events:
        ts = e.get("ts")
        if isinstance(ts, (int, float)):
            ts_sec = ts / 1000 if ts > 1e12 else ts
            if ts_sec < cutoff:
                continue
        out.append(e)
    return out[-MAX_EVENTS:]


def append_events(new_events: list[dict]) -> dict:
    if not new_events:
        return {"appended": 0, "total": len(_load_events())}
    events = _prune(_load_events())
    for e in new_events:
        if not isinstance(e, dict):
            continue
        row = dict(e)
        if "recordedAt" not in row:
            row["recordedAt"] = _now_iso()
        events.append(row)
    events = _prune(events)
    cache_service.set(cross_market_events(), events, ttl=MAX_AGE_SEC)
    return {"appended": len(new_events), "total": len(events)}


def get_history(*, days: int = 7, limit: int = 2000) -> dict:
    days = max(1, min(30, int(days or 7)))
    limit = max(1, min(5000, int(limit or 2000)))
    cutoff_ms = (time.time() - days * 86400) * 1000
    events = _load_events()
    filtered = []
    for e in reversed(events):
        ts = e.get("ts")
        if ts is None:
            continue
        ts_ms = ts if ts > 1e12 else ts * 1000
        if ts_ms < cutoff_ms:
            continue
        filtered.append(e)
        if len(filtered) >= limit:
            break
    filtered.reverse()
    return {
        "days": days,
        "count": len(filtered),
        "events": filtered,
        "updatedAt": _now_iso(),
    }