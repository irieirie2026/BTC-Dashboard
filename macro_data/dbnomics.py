"""DBnomics tertiary data source (requests-based, optional dbnomics package)."""

from __future__ import annotations

import math
import time
from typing import Any

import requests

from macro_data.cache import cache_get, cache_set

DBN_BASE = "https://api.db.nomics.world/v22"
REQUEST_TIMEOUT = 60
_HEADERS = {"User-Agent": "BTC-MacroDrivers/2.0", "Accept": "application/json"}


def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def fetch_series_by_iso3(
    provider: str,
    dataset: str,
    series_pattern: str,
    *,
    start_year: int,
    end_year: int,
    refresh: bool = False,
) -> dict[str, dict[int, float]]:
    """
    Fetch DBnomics series matching pattern; returns {iso3: {year: value}}.
    series_pattern may include {iso3} placeholder for per-country codes.
    """
    cache_key = f"dbn:{provider}:{dataset}:{series_pattern}:{start_year}:{end_year}"
    if not refresh:
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

    # Global series (no country dimension)
    if "{iso3}" not in series_pattern:
        code = series_pattern
        url = f"{DBN_BASE}/series/{provider}/{dataset}/{code}"
        try:
            resp = requests.get(
                url,
                params={"observations": "1"},
                headers=_HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            if resp.status_code != 200:
                cache_set(cache_key, {})
                return {}
            payload = resp.json()
            out: dict[str, dict[int, float]] = {}
            docs = payload.get("series", {}).get("docs", [])
            if docs:
                periods = docs[0].get("period", [])
                values = docs[0].get("value", [])
                bucket: dict[int, float] = {}
                for p, v in zip(periods, values):
                    fval = _safe_float(v)
                    if fval is None:
                        continue
                    try:
                        yr = int(str(p)[:4])
                    except (TypeError, ValueError):
                        continue
                    if start_year <= yr <= end_year:
                        bucket[yr] = fval
                if bucket:
                    out["GLOBAL"] = bucket
            cache_set(cache_key, out)
            return out
        except requests.RequestException:
            cache_set(cache_key, {})
            return {}

    cache_set(cache_key, {})
    return {}