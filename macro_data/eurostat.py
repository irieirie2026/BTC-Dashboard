"""Eurostat JSON API — European macro fallback for recent-year gaps in WDI."""

from __future__ import annotations

import math
import time
from typing import Any

import requests

from macro_data.cache import cache_get, cache_set
from macro_data.config import (
    EUROSTAT_AGGREGATE_MAP,
    EUROSTAT_GEO_OVERRIDES,
    HISTORY_START_YEAR,
    PROJECTION_END_YEAR,
)

ESTAT_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0"
REQUEST_TIMEOUT = 90
_HEADERS = {"User-Agent": "BTC-MacroDrivers/2.0", "Accept": "application/json"}

# Indicator → Eurostat dataset + fixed dimension filters (geo/time vary).
EUROSTAT_SERIES: dict[str, dict[str, Any]] = {
    "gdp_growth": {
        "dataset": "nama_10_gdp",
        "filters": {"na_item": "B1GQ", "unit": "CLV_PCH_PRE"},
    },
    "cpi_inflation": {
        "dataset": "prc_hicp_aind",
        "filters": {"coicop": "CP00", "unit": "RCH_A_AVG"},
    },
    "unemployment": {
        "dataset": "une_rt_a",
        "filters": {"age": "Y15-74", "sex": "T", "unit": "PC_ACT"},
    },
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


def eurostat_geo_for_country(country: dict) -> str | None:
    if country.get("isAggregate"):
        for key in (country.get("listId"), country.get("id")):
            if key and key in EUROSTAT_AGGREGATE_MAP:
                return EUROSTAT_AGGREGATE_MAP[key]
        return None
    cid = country.get("id") or ""
    if cid in EUROSTAT_GEO_OVERRIDES:
        return EUROSTAT_GEO_OVERRIDES[cid]
    if len(cid) == 2 and cid.isalpha():
        return cid.upper()
    return None


def _parse_eurostat_json(payload: dict) -> dict[str, dict[int, float]]:
    if not payload or "value" not in payload:
        return {}
    dim = payload.get("dimension") or {}
    dim_ids = list(dim.keys())
    if "geo" not in dim_ids or "time" not in dim_ids:
        return {}

    sizes = [len(dim[d]["category"]["index"]) for d in dim_ids]
    strides = [1] * len(dim_ids)
    for i in range(len(dim_ids) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    fixed = {
        d: next(iter(dim[d]["category"]["index"].values()))
        for d in dim_ids
        if d not in ("geo", "time")
    }
    geo_map = dim["geo"]["category"]["index"]
    time_map = dim["time"]["category"]["index"]
    raw = payload.get("value") or {}

    out: dict[str, dict[int, float]] = {}
    for geo, gpos in geo_map.items():
        bucket = out.setdefault(geo, {})
        for tstr, tpos in time_map.items():
            try:
                year = int(str(tstr)[:4])
            except (TypeError, ValueError):
                continue
            multi = []
            for i, d in enumerate(dim_ids):
                if d == "geo":
                    multi.append(gpos)
                elif d == "time":
                    multi.append(tpos)
                else:
                    multi.append(fixed[d])
            flat = sum(multi[i] * strides[i] for i in range(len(dim_ids)))
            val = _safe_float(raw.get(str(flat)))
            if val is not None:
                bucket[year] = val
    return out


def fetch_indicator_series(
    ind_key: str,
    *,
    start_year: int = HISTORY_START_YEAR,
    end_year: int | None = None,
    refresh: bool = False,
) -> dict[str, dict[int, float]]:
    """Return {eurostat_geo: {year: value}} for a macro indicator."""
    spec = EUROSTAT_SERIES.get(ind_key)
    if not spec:
        return {}

    end_year = end_year or PROJECTION_END_YEAR
    cache_key = f"est:{ind_key}:{start_year}:{end_year}"
    if not refresh:
        cached = cache_get(cache_key)
        if cached is not None:
            return {
                geo: {int(yr): val for yr, val in years.items() if start_year <= int(yr) <= end_year}
                for geo, years in cached.items()
                if isinstance(years, dict)
            }

    url = f"{ESTAT_BASE}/data/{spec['dataset']}"
    params = {"format": "JSON", "lang": "en", **spec["filters"]}
    try:
        resp = requests.get(url, params=params, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        parsed = _parse_eurostat_json(resp.json())
    except requests.RequestException:
        cache_set(cache_key, {})
        return {}

    trimmed: dict[str, dict[int, float]] = {}
    for geo, years in parsed.items():
        bucket = {
            yr: val for yr, val in years.items() if start_year <= yr <= end_year
        }
        if bucket:
            trimmed[geo] = bucket

    cache_set(cache_key, trimmed)
    return trimmed


def eurostat_lookup(
    est_data: dict[str, dict[int, float]],
    country: dict,
    year: int,
) -> float | None:
    geo = eurostat_geo_for_country(country)
    if not geo:
        return None
    return (est_data.get(geo) or {}).get(year)