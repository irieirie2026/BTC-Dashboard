"""
OECD Economic Outlook (DSD_EO@DF_EO) via SDMX REST API.

Complements IMF WEO for projection-year gaps — especially OECD economies and
indicators WB has not yet published (gdp deflator, current account, etc.).
"""

from __future__ import annotations

import csv
import io
import math
import time
from typing import Any

import requests

from macro_data.cache import cache_get, cache_set
from macro_data.config import HISTORY_START_YEAR, INDICATORS, PROJECTION_END_YEAR

OECD_EO_URL = "https://sdmx.oecd.org/public/rest/data/OECD.ECO.MAD,DSD_EO@DF_EO,1.0"
REQUEST_TIMEOUT = 180
_HEADERS = {
    "User-Agent": "BTC-MacroDrivers/2.0",
    "Accept": "text/csv",
}

# ind_key → OECD EO MEASURE code (annual frequency).
OECD_EO_MEASURES: dict[str, str] = {
    "gdp_growth": "GDPV_ANNPCT",
    "cpi_inflation": "CPI_YTYPCT",
    "gdp_deflator": "CPV_ANNPCT",
    "unemployment": "UNR",
    "gdp_nominal": "GDP_USD",
    "current_account": "CBGDPR",
    "population": "POP",
}

OECD_METHODOLOGY = "OECD Economic Outlook (SDMX DSD_EO@DF_EO)"


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


def oecd_code_for_country(country: dict) -> str | None:
    if country.get("isAggregate"):
        return None
    iso3 = country.get("iso3")
    return iso3 if iso3 and len(iso3) == 3 else None


def _apply_scale(ind_key: str, val: float) -> float:
    if ind_key == "population" and val < 1_000_000:
        return val * 1_000_000
    return val


def _parse_csv(
    text: str,
    *,
    start_year: int,
    end_year: int,
) -> dict[str, dict[int, float]]:
    out: dict[str, dict[int, float]] = {}
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        if (row.get("FREQ") or "") != "A":
            continue
        ref = (row.get("REF_AREA") or "").strip()
        if not ref:
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
        out.setdefault(ref, {})[year] = val
    return out


def fetch_measure_series(
    measure: str,
    *,
    start_year: int = HISTORY_START_YEAR,
    end_year: int | None = None,
    refresh: bool = False,
) -> dict[str, dict[int, float]]:
    end_year = end_year or PROJECTION_END_YEAR + 1
    cache_key = f"oecd:eo:{measure}:{start_year}:{end_year}"
    if not refresh:
        cached = cache_get(cache_key)
        if cached is not None:
            return {
                code: {int(yr): val for yr, val in years.items()}
                for code, years in cached.items()
                if isinstance(years, dict)
            }

    url = f"{OECD_EO_URL}/.{measure}...."
    params = {
        "startPeriod": str(start_year),
        "endPeriod": str(end_year),
        "format": "csvfile",
    }
    try:
        resp = requests.get(url, params=params, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        parsed = _parse_csv(resp.text, start_year=start_year, end_year=end_year)
    except requests.RequestException:
        cache_set(cache_key, {})
        return {}

    cache_set(cache_key, parsed)
    return parsed


def fetch_all_indicator_series(
    *,
    start_year: int = HISTORY_START_YEAR,
    end_year: int | None = None,
    refresh: bool = False,
) -> dict[str, dict[str, dict[int, float]]]:
    """Return {ind_key: {iso3: {year: value}}} for all configured EO measures."""
    end_year = end_year or PROJECTION_END_YEAR + 1
    cache_key = f"oecd:eo:bundle:{start_year}:{end_year}"
    if not refresh:
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

    out: dict[str, dict[str, dict[int, float]]] = {}
    for ind_key, measure in OECD_EO_MEASURES.items():
        if ind_key not in INDICATORS:
            continue
        raw = fetch_measure_series(measure, start_year=start_year, end_year=end_year, refresh=refresh)
        scaled: dict[str, dict[int, float]] = {}
        for code, years in raw.items():
            bucket: dict[int, float] = {}
            for yr, val in years.items():
                bucket[int(yr)] = _apply_scale(ind_key, float(val))
            if bucket:
                scaled[code] = bucket
        out[ind_key] = scaled

    cache_set(cache_key, out)
    return out


def oecd_lookup(
    oecd_data: dict[str, dict[int, float]],
    country: dict,
    year: int,
) -> float | None:
    code = oecd_code_for_country(country)
    if not code:
        return None
    return (oecd_data.get(code) or {}).get(year)


def publication_meta() -> dict[str, Any]:
    return {
        "source": "OECD Economic Outlook",
        "dataset": "DSD_EO@DF_EO",
        "agency": "OECD.ECO.MAD",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "measures": dict(OECD_EO_MEASURES),
    }