"""Persist cross-market anomaly events (7–30 day ring buffer)."""

from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from cache import service as cache_service
from cache.keys import cross_market_events

MAX_EVENTS = 50_000
MAX_AGE_SEC = 30 * 86400
_SLIDE_MS = 300_000


def _history_path() -> Path:
    override = (os.environ.get("XMARKET_HISTORY_PATH") or "").strip()
    if override:
        return Path(override)
    if os.environ.get("PYTEST_CURRENT_TEST"):
        raise RuntimeError("tests must set XMARKET_HISTORY_PATH and must not write data/xmarket_history.jsonl")
    return Path(__file__).resolve().parent / "data" / "xmarket_history.jsonl"


def _read_jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    rows: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def _write_jsonl(path: Path, events: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(json.dumps(row, separators=(",", ":")) + "\n" for row in events)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(body, encoding="utf-8")
    tmp.replace(path)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_events() -> list[dict]:
    # Durable jsonl survives a restart. An empty file falls through to the cache ring,
    # and a non-empty cache is copied onto disk once.
    path = _history_path()
    rows = _read_jsonl(path)
    if rows:
        return rows
    raw = cache_service.get(cross_market_events(), default=[], ttl=MAX_AGE_SEC)
    events = raw if isinstance(raw, list) else []
    if events:
        try:
            _write_jsonl(path, events)
        except OSError:
            pass
    return events


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


def _shock_identity(event: dict) -> tuple:
    pair = str(
        event.get("pair")
        or event.get("venue")
        or event.get("premiumId")
        or event.get("exchange")
        or ""
    )
    kind = str(event.get("type") or event.get("title") or "")
    return (pair, kind)


def _dedupe_key(event: dict) -> tuple:
    """Identity plus a fixed bucket. Readers use a sliding window instead of this key."""
    ts_ms = _event_ts_ms(event) or 0
    bucket = int(ts_ms // _SLIDE_MS)
    pair, kind = _shock_identity(event)
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
    added = 0
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
        added += 1
    events = _prune(events)
    cache_service.set(cross_market_events(), events, ttl=MAX_AGE_SEC)
    try:
        _write_jsonl(_history_path(), events)
    except OSError:
        pass
    return {"appended": added, "total": len(events)}


def get_history(*, days: int = 7, limit: int = 2000, window: str | None = None) -> dict:
    days = _parse_window(window, days)
    # days is the time window. It is not an event cap.
    limit = max(1, min(5000, int(limit or 2000)))
    cutoff_ms = (time.time() - days * 86400) * 1000
    if window and str(window).strip().lower().endswith("h"):
        hours = int(str(window).strip().lower()[:-1] or "24")
        cutoff_ms = (time.time() - max(1, hours) * 3600) * 1000
    events = sorted(_load_events(), key=lambda row: _event_ts_ms(row) or 0)
    filtered = []
    # Newest first. A later print of the same pair and type inside 5 minutes is one shock.
    # Exact 300_000 ms spacing stays distinct. A print that straddles a bucket boundary does not.
    last_kept: dict[tuple, float] = {}
    for e in reversed(events):
        ts_ms = _event_ts_ms(e)
        if ts_ms is None or ts_ms < cutoff_ms:
            continue
        ident = _shock_identity(e)
        prev = last_kept.get(ident)
        if prev is not None and abs(ts_ms - prev) < _SLIDE_MS:
            continue
        last_kept[ident] = ts_ms
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