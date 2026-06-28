"""
IMF World Economic Outlook (DataMapper API) fallback for Global Macro Dashboard.
"""

from __future__ import annotations

import math
import time
from typing import Any

import requests

from global_macro_config import HISTORY_START_YEAR, WB_IMF_AGGREGATE_MAP

IMF_BASE = "https://www.imf.org/external/datamapper/api/v1"
CACHE_TTL = 6 * 3600
REQUEST_TIMEOUT = 120

_HEADERS = {"User-Agent": "BTC-Global-Macro/1.0", "Accept": "application/json"}

_cache: dict[str, Any] = {}


def clear_cache() -> None:
    _cache.clear()


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


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if not entry or time.time() - entry["ts"] > CACHE_TTL:
        return None
    return entry["data"]


def _cache_set(key: str, data: Any) -> None:
    _cache[key] = {"ts": time.time(), "data": data}


def imf_code_for_country(country: dict) -> str | None:
    if country.get("isAggregate"):
        for key in (country.get("listId"), country.get("iso3"), country.get("id")):
            if key and key in WB_IMF_AGGREGATE_MAP:
                return WB_IMF_AGGREGATE_MAP[key]
        return None
    iso3 = country.get("iso3")
    return iso3 if iso3 and len(iso3) == 3 else None


def fetch_indicator_series(
    imf_code: str,
    *,
    start_year: int = HISTORY_START_YEAR,
    end_year: int | None = None,
) -> dict[str, dict[int, float]]:
    """
    Fetch full IMF DataMapper series for one indicator.
    Returns {imf_country_code: {year: value}}.
    """
    end_year = end_year or time.gmtime().tm_year + 1
    cache_key = f"imf:{imf_code}:{start_year}:{end_year}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    url = f"{IMF_BASE}/{imf_code}?periods={start_year}-{end_year}"
    resp = requests.get(url, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    payload = resp.json()

    indicator_data = (payload.get("values") or {}).get(imf_code) or {}
    out: dict[str, dict[int, float]] = {}

    for country_code, year_map in indicator_data.items():
        if not isinstance(year_map, dict):
            continue
        parsed: dict[int, float] = {}
        for year_str, val in year_map.items():
            fval = _safe_float(val)
            if fval is None:
                continue
            try:
                parsed[int(year_str)] = fval
            except (TypeError, ValueError):
                continue
        if parsed:
            out[country_code] = parsed

    _cache_set(cache_key, out)
    return out