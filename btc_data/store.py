"""Persisted time-series store for Bitcoin metrics (data/btc-series/)."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent


def _series_dir() -> Path:
    """Read the env on each call so tests can point writes at a tmp directory."""
    explicit = os.environ.get("BTC_SERIES_DIR", "").strip()
    if explicit:
        return Path(explicit)
    dash = os.environ.get("BTC_DASH_DATA_DIR", "").strip()
    if dash:
        return Path(dash) / "btc-series"
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return Path("/tmp/btc-series")
    return ROOT / "data" / "btc-series"


def _state_file() -> Path:
    return _series_dir() / "_scheduler_state.json"


# Import-time snapshots. Call sites inside this module re-read the env.
SERIES_DIR = _series_dir()
STATE_FILE = _state_file()


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _metric_path(metric_id: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in metric_id)
    return _series_dir() / f"{safe}.json"


def _disk_ok() -> bool:
    try:
        _series_dir().mkdir(parents=True, exist_ok=True)
        probe = _series_dir() / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def read_series(metric_id: str) -> dict[str, Any] | None:
    path = _metric_path(metric_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _series_body(metric_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "metricId": metric_id,
        "series": payload.get("series") or [],
        "latest": payload.get("latest"),
        "source": payload.get("source"),
        "unit": payload.get("unit"),
        "note": payload.get("note"),
        "error": payload.get("error"),
        "stale": payload.get("stale", False),
        "fetchedAt": payload.get("fetchedAt") or _now_iso(),
        "storedAt": _now_iso(),
        "pointCount": len(payload.get("series") or []),
    }


def sync_series_to_cache(metric_id: str, body: dict[str, Any], *, ttl: int) -> None:
    """Write-through: mirror disk series into Redis/disk cache layer."""
    try:
        from cache.keys import btc_series
        from macro_data.cache import cache_set

        cache_set(btc_series(metric_id), body, ttl=ttl)
    except Exception:
        pass


def read_series_cached(metric_id: str, *, ttl: int) -> dict[str, Any] | None:
    """Redis L1 → disk L2 read for a stored metric."""
    try:
        from cache.keys import btc_series
        from macro_data.cache import cache_get

        cached = cache_get(btc_series(metric_id), ttl=ttl)
        if cached is not None:
            return cached
    except Exception:
        pass
    return read_series(metric_id)


def write_series(metric_id: str, payload: dict[str, Any], *, ttl: int | None = None) -> bool:
    body = _series_body(metric_id, payload)
    if ttl is not None:
        cache_ttl = ttl
    else:
        raw_ttl = (os.environ.get("CACHE_TTL_MACRO") or "").strip()
        cache_ttl = int(raw_ttl) if raw_ttl.isdigit() else 86400
    sync_series_to_cache(metric_id, body, ttl=cache_ttl)

    if not _disk_ok():
        return False
    path = _metric_path(metric_id)
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(body, indent=2), encoding="utf-8")
        tmp.replace(path)
        return True
    except OSError:
        return False


def is_stale(metric_id: str, ttl: int) -> bool:
    payload = read_series(metric_id)
    if not payload:
        return True
    fetched = payload.get("fetchedAt") or payload.get("storedAt")
    if not fetched:
        return True
    try:
        ts = time.mktime(time.strptime(str(fetched)[:19], "%Y-%m-%dT%H:%M:%S"))
    except (ValueError, OverflowError):
        return True
    return (time.time() - ts) > ttl


def list_inventory() -> list[dict[str, Any]]:
    series_dir = _series_dir()
    if not series_dir.exists():
        return []
    rows: list[dict[str, Any]] = []
    for path in sorted(series_dir.glob("*.json")):
        if path.name.startswith("_"):
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            rows.append({
                "metricId": raw.get("metricId") or path.stem,
                "pointCount": raw.get("pointCount") or len(raw.get("series") or []),
                "fetchedAt": raw.get("fetchedAt"),
                "storedAt": raw.get("storedAt"),
                "source": raw.get("source"),
                "error": raw.get("error"),
                "stale": raw.get("stale"),
            })
        except (OSError, json.JSONDecodeError):
            continue
    return rows


def read_scheduler_state() -> dict[str, Any]:
    path = _state_file()
    if not path.exists():
        return {"runs": [], "lastSourceFetch": {}, "errors": {}}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"runs": [], "lastSourceFetch": {}, "errors": {}}


def write_scheduler_state(state: dict[str, Any]) -> None:
    if not _disk_ok():
        return
    state["updatedAt"] = _now_iso()
    path = _state_file()
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
        tmp.replace(path)
    except OSError:
        pass


def append_run_log(entry: dict[str, Any], *, max_entries: int = 200) -> None:
    state = read_scheduler_state()
    runs = state.get("runs") or []
    runs.insert(0, entry)
    state["runs"] = runs[:max_entries]
    write_scheduler_state(state)