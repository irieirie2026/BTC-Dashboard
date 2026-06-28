"""IMF World Economic Outlook via SDMX 3.0 CSV API (replaces blocked DataMapper)."""

from __future__ import annotations

import csv
import io
import math
import time
from typing import Any

import requests

from macro_data.cache import cache_get, cache_set
from macro_data.config import HISTORY_START_YEAR, PROJECTION_END_YEAR

IMF_SDMX_WEO_URL = "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/~/*"
REQUEST_TIMEOUT = 180
_HEADERS = {
    "User-Agent": "BTC-MacroDrivers/2.0",
    "Accept": "text/csv",
}


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


def _parse_weo_csv(
    text: str,
    imf_code: str,
    *,
    start_year: int,
    end_year: int,
) -> dict[str, dict[int, float]]:
    out: dict[str, dict[int, float]] = {}
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        if (row.get("INDICATOR") or "") != imf_code:
            continue
        if (row.get("FREQUENCY") or "") != "A":
            continue
        country = (row.get("COUNTRY") or "").strip()
        if not country:
            continue
        period = row.get("TIME_PERIOD") or ""
        try:
            year = int(str(period)[:4])
        except (TypeError, ValueError):
            continue
        if year < start_year or year > end_year:
            continue
        val = _safe_float(row.get("OBS_VALUE"))
        if val is None:
            continue
        out.setdefault(country, {})[year] = val
    return out


def fetch_indicator_series(
    imf_code: str,
    *,
    start_year: int = HISTORY_START_YEAR,
    end_year: int | None = None,
    refresh: bool = False,
) -> dict[str, dict[int, float]]:
    end_year = end_year or PROJECTION_END_YEAR + 1
    cache_key = f"imf:weo:{imf_code}:{start_year}:{end_year}"
    if not refresh:
        cached = cache_get(cache_key)
        if cached is not None:
            return {
                code: {int(yr): val for yr, val in years.items()}
                for code, years in cached.items()
                if isinstance(years, dict)
            }

    params = {
        "c[TIME_PERIOD]": f"ge:{start_year}-01",
        "c[INDICATOR]": imf_code,
    }
    try:
        resp = requests.get(
            IMF_SDMX_WEO_URL,
            params=params,
            headers=_HEADERS,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        parsed = _parse_weo_csv(
            resp.text,
            imf_code,
            start_year=start_year,
            end_year=end_year,
        )
    except requests.RequestException:
        cache_set(cache_key, {})
        return {}

    cache_set(cache_key, parsed)
    return parsed