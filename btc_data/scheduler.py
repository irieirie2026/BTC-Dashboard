"""Background prefetch orchestrator for Bitcoin metric series."""

from __future__ import annotations

import os
import time
from typing import Any

from btc_data.registry import REGISTRY, SOURCE_LIMITS, MetricSpec, refresh_registry
from btc_data.sources import fetch_metric
from btc_data.store import (
    append_run_log,
    is_stale,
    list_inventory,
    read_scheduler_state,
    read_series,
    write_scheduler_state,
    write_series,
)


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _source_interval(source: str) -> float:
    limits = SOURCE_LIMITS.get(source) or {}
    return float(limits.get("minIntervalSec") or 1.0)


def _can_fetch_source(source: str, state: dict[str, Any]) -> bool:
    mono_map = state.get("lastSourceFetchMono") or {}
    if source not in mono_map:
        return True
    last_at = float(mono_map[source])
    return (time.monotonic() - last_at) >= _source_interval(source)


def _mark_source_fetch(source: str, state: dict[str, Any]) -> None:
    state.setdefault("lastSourceFetchMono", {})[source] = time.monotonic()
    state.setdefault("lastSourceFetch", {})[source] = _now_iso()
    write_scheduler_state(state)


def stale_metrics(*, include_disabled: bool = False) -> list[MetricSpec]:
    refresh_registry()
    rows: list[MetricSpec] = []
    for spec in REGISTRY.values():
        if not spec.enabled and not include_disabled:
            continue
        if spec.id == "dune_placeholder":
            continue
        if is_stale(spec.id, spec.ttl):
            rows.append(spec)
    rows.sort(key=lambda s: (s.priority, s.tier != "hot", s.tier != "warm", s.id))
    return rows


def fetch_and_store(spec: MetricSpec, *, refresh: bool = True, dry_run: bool = False) -> dict[str, Any]:
    state = read_scheduler_state()
    if not _can_fetch_source(spec.source, state):
        return {
            "metricId": spec.id,
            "skipped": True,
            "reason": f"source throttle: {spec.source}",
        }

    if dry_run:
        return {
            "metricId": spec.id,
            "dryRun": True,
            "source": spec.source,
            "label": spec.label,
        }

    payload = fetch_metric(spec, refresh=refresh)
    payload["unit"] = spec.unit
    ok = write_series(spec.id, payload, ttl=spec.ttl)
    _mark_source_fetch(spec.source, state)

    errors = state.setdefault("errors", {})
    if payload.get("error") and not payload.get("series"):
        errors[spec.id] = str(payload["error"])
    elif spec.id in errors:
        errors.pop(spec.id, None)
    write_scheduler_state(state)

    entry = {
        "metricId": spec.id,
        "source": spec.source,
        "ok": ok,
        "points": len(payload.get("series") or []),
        "error": payload.get("error"),
        "fetchedAt": payload.get("fetchedAt") or _now_iso(),
        "at": _now_iso(),
    }
    append_run_log(entry)
    return entry


def run_batch(*, max_fetches: int = 5, dry_run: bool = False, metric_id: str | None = None) -> dict[str, Any]:
    refresh_registry()
    if metric_id:
        spec = REGISTRY.get(metric_id)
        if not spec:
            return {"error": f"Unknown metric: {metric_id}", "results": []}
        if not spec.enabled:
            return {"error": f"Metric disabled: {metric_id}", "results": []}
        results = [fetch_and_store(spec, dry_run=dry_run)]
        return {"results": results, "ranAt": _now_iso(), "count": len(results)}

    queue = stale_metrics()
    results: list[dict] = []
    for spec in queue:
        if len(results) >= max_fetches:
            break
        state = read_scheduler_state()
        if not _can_fetch_source(spec.source, state):
            continue
        results.append(fetch_and_store(spec, dry_run=dry_run))

    return {
        "results": results,
        "queueRemaining": max(0, len(queue) - len(results)),
        "queueSize": len(queue),
        "ranAt": _now_iso(),
        "count": len(results),
    }


def get_stored_metric(metric_id: str) -> dict[str, Any] | None:
    return read_series(metric_id)


def status_payload() -> dict[str, Any]:
    refresh_registry()
    state = read_scheduler_state()
    inventory = list_inventory()
    stale = stale_metrics()
    return {
        "scheduler": {
            "lastSourceFetch": state.get("lastSourceFetch") or {},
            "recentRuns": (state.get("runs") or [])[:15],
            "errors": state.get("errors") or {},
            "updatedAt": state.get("updatedAt"),
        },
        "registry": {
            "enabled": sum(1 for s in REGISTRY.values() if s.enabled),
            "total": len(REGISTRY),
            "stale": len(stale),
            "stored": len(inventory),
        },
        "staleQueue": [{"id": s.id, "source": s.source, "label": s.label, "priority": s.priority} for s in stale[:25]],
        "inventory": inventory,
        "sources": SOURCE_LIMITS,
        "env": {
            "santiment": bool(os.environ.get("SANTIMENT_API_KEY", "").strip()),
            "dune": bool(os.environ.get("DUNE_API_KEY", "").strip()),
            "duneQueries": len([s for s in REGISTRY.values() if s.source == "dune" and s.enabled]),
            "bgeometrics": bool(os.environ.get("BGEOMETRICS_API_KEY", "").strip() or os.environ.get("BGEOMETRICS_TOKEN", "").strip()),
        },
        "fetchedAt": _now_iso(),
    }


def run_background_tick(*, max_fetches: int = 2) -> None:
    """Called from server startup thread — small batch to avoid blocking."""
    try:
        result = run_batch(max_fetches=max_fetches, dry_run=False)
        print(f"BTC prefetch: {result.get('count', 0)} metrics refreshed, queue={result.get('queueRemaining', 0)}")
    except Exception as exc:
        print(f"BTC prefetch tick failed: {exc}")