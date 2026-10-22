"""Persist cross-market anomaly events (7–30 day ring buffer)."""

from __future__ import annotations

import math
import time
from datetime import datetime, timezone

from cache import service as cache_service
from cache.keys import cross_market_events

MAX_EVENTS = 50_000
MAX_AGE_SEC = 30 * 86400


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_events() -> list[dict]:
    # Write TTL is 30 days. The read must use the same window or 7d/30d history disappears.
    raw = cache_service.get(cross_market_events(), default=[], ttl=MAX_AGE_SEC)
    return raw if isinstance(raw, list) else []


def _event_ts_ms(event: dict) -> float | None:
    ts = event.get("ts")
    if isinstance(ts, str):
        text = ts.strip()
        if text.isdigit():
            ts = float(text)
        else:
            try:
                ts = datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
            except ValueError:
                ts = None
    if ts is None:
        recorded = event.get("recordedAt")
        if isinstance(recorded, str) and recorded.strip():
            try:
                ts = datetime.fromisoformat(recorded.strip().replace("Z", "+00:00")).timestamp()
            except ValueError:
                return None
    if isinstance(ts, (int, float)):
        return float(ts) if ts > 1e12 else float(ts) * 1000
    return None


def _prune(events: list[dict]) -> list[dict]:
    cutoff = time.time() - MAX_AGE_SEC
    out = []
    for e in events:
        ts_ms = _event_ts_ms(e)
        if ts_ms is not None and (ts_ms / 1000) < cutoff:
            continue
        out.append(e)
    return out[-MAX_EVENTS:]


def _coarse_z(event: dict):
    raw = event.get("z")
    if raw is None:
        raw = event.get("devSigma")
    if raw is None:
        raw = event.get("delta")
    try:
        return round(float(raw), 1)
    except (TypeError, ValueError):
        return ""


def _dedupe_key(event: dict) -> tuple:
    """Same pair (or venue) and type inside a 5-minute bucket is one event.

    A second print 0.8s later with a different z is the same shock.
    """
    ts_ms = _event_ts_ms(event) or 0
    bucket = int(ts_ms // 300_000)
    pair = str(
        event.get("pair")
        or event.get("venue")
        or event.get("premiumId")
        or event.get("exchange")
        or ""
    )
    kind = str(event.get("type") or event.get("title") or "")
    return (pair, kind, bucket)


def _parse_window(window: str | None, days: int) -> int:
    """Honour window=7d|30d|24h and days. The store itself only keeps 30 days."""
    if window:
        text = str(window).strip().lower()
        if text.endswith("h") and text[:-1].isdigit():
            hours = max(1, min(24 * 30, int(text[:-1])))
            return max(1, min(30, int(math.ceil(hours / 24.0))))
        if text.endswith("d") and text[:-1].isdigit():
            return max(1, min(30, int(text[:-1])))
    try:
        parsed = int(days or 7)
    except (TypeError, ValueError):
        parsed = 7
    return max(1, min(30, parsed))


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
        if row.get("ts") is None:
            stamped = _event_ts_ms(row)
            if stamped is not None:
                row["ts"] = stamped
        events.append(row)
    events = _prune(events)
    cache_service.set(cross_market_events(), events, ttl=MAX_AGE_SEC)
    return {"appended": len(new_events), "total": len(events)}


def get_history(*, days: int = 7, limit: int = 2000, window: str | None = None) -> dict:
    days = _parse_window(window, days)
    # days is the time window. It is not an event cap.
    limit = max(1, min(5000, int(limit or 2000)))
    cutoff_ms = (time.time() - days * 86400) * 1000
    if window and str(window).strip().lower().endswith("h"):
        hours = int(str(window).strip().lower()[:-1] or "24")
        cutoff_ms = (time.time() - max(1, hours) * 3600) * 1000
    events = _load_events()
    filtered = []
    seen: set[tuple] = set()
    for e in reversed(events):
        ts_ms = _event_ts_ms(e)
        if ts_ms is None or ts_ms < cutoff_ms:
            continue
        key = _dedupe_key(e)
        if key in seen:
            continue
        seen.add(key)
        filtered.append(e)
        if len(filtered) >= limit:
            break
    filtered.reverse()
    empty = len(filtered) == 0
    return {
        "days": days,
        "window": window,
        "count": len(filtered),
        "events": filtered,
        "empty": empty,
        "emptyReason": (
            "No cross-market events in this window. Events are written when the desk "
            "detects a high-severity venue shock. Open Cross-Market and leave it running."
            if empty
            else None
        ),
        "updatedAt": _now_iso(),
    }