"""Resolve metric series: local store first, then live fetch + persist."""

from __future__ import annotations

from typing import Any

from btc_data.registry import REGISTRY, refresh_registry
from btc_data.sources import fetch_metric
from btc_data.store import is_stale, read_series, read_series_cached, write_series
from btc_data.valuation_computed import compute_hash_ribbons


def _stored_fallback(metric_id: str, spec) -> dict[str, Any] | None:
    """Return the newest on-disk series when live fetch failed."""
    stale_stored = read_series(metric_id)
    if stale_stored and stale_stored.get("series"):
        return {
            **stale_stored,
            "fromStore": True,
            "fromCache": stale_stored.get("fromCache", False),
            "stale": True,
            "error": None,
        }
    return None


def _hash_ribbons_fallback() -> dict[str, Any] | None:
    """Compute hash ribbons from cached hash-rate series when API data is missing."""
    for source_key in ("hashrate_bg", "hash_rate"):
        stored = read_series(source_key)
        if not stored or not stored.get("series"):
            continue
        computed = compute_hash_ribbons(stored["series"])
        if not computed.get("series"):
            continue
        return {
            **computed,
            "fromStore": True,
            "stale": True,
            "error": None,
        }
    return None


def get_metric_data(metric_id: str, *, refresh: bool = False) -> dict[str, Any]:
    """Load series for a registry metric id."""
    refresh_registry()
    spec = REGISTRY.get(metric_id)
    if not spec or not spec.enabled:
        return {
            "series": [],
            "latest": None,
            "source": spec.source if spec else "",
            "error": f"Metric unavailable: {metric_id}",
        }

    if not refresh:
        stored = read_series_cached(metric_id, ttl=spec.ttl)
        if stored and stored.get("series") and not is_stale(metric_id, spec.ttl):
            out = {
                **stored,
                "fromStore": True,
                "fromCache": stored.get("fromCache", False),
                "stale": stored.get("stale", False),
            }
            if out.get("series"):
                out["error"] = None
            return out

    try:
        payload = fetch_metric(spec, refresh=refresh)
    except Exception as exc:
        payload = {
            "series": [],
            "latest": None,
            "source": spec.source,
            "error": str(exc),
        }
    if payload.get("series"):
        write_series(metric_id, {**payload, "unit": spec.unit}, ttl=spec.ttl)
        payload["fromStore"] = False
        payload["error"] = None
        return payload

    fallback = _stored_fallback(metric_id, spec)
    if fallback:
        return fallback

    if metric_id == "hashribbons":
        computed = _hash_ribbons_fallback()
        if computed:
            return computed

    return payload