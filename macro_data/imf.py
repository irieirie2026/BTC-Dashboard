"""IMF fallback: DataMapper JSON when available, else WEO SDMX 3.0 CSV."""

from __future__ import annotations

import math
import time
from typing import Any

import requests

from macro_data.cache import cache_get, cache_set
from macro_data.config import HISTORY_START_YEAR, PROJECTION_END_YEAR, WB_IMF_AGGREGATE_MAP
from macro_data.imf_weo import fetch_indicator_series as fetch_weo_indicator_series

IMF_BASE = "https://www.imf.org/external/datamapper/api/v1"
REQUEST_TIMEOUT = 120
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
    refresh: bool = False,
) -> dict[str, dict[int, float]]:
    end_year = end_year or PROJECTION_END_YEAR + 1
    cache_key = f"imf:{imf_code}:{start_year}:{end_year}"
    if not refresh:
        cached = cache_get(cache_key)
        if cached is not None:
            return {
                code: {int(yr): val for yr, val in years.items()}
                for code, years in cached.items()
                if isinstance(years, dict)
            }

    out: dict[str, dict[int, float]] = {}
    try:
        url = f"{IMF_BASE}/{imf_code}?periods={start_year}-{end_year}"
        resp = requests.get(url, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        payload = resp.json()
        indicator_data = (payload.get("values") or {}).get(imf_code) or {}
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
    except requests.RequestException:
        out = {}

    if not out:
        out = fetch_weo_indicator_series(
            imf_code,
            start_year=start_year,
            end_year=end_year,
            refresh=refresh,
        )

    cache_set(cache_key, out)
    return out