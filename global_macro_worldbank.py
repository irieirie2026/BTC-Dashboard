"""
World Bank WDI bulk fetch for Global Macro Dashboard.
"""

from __future__ import annotations

import math
import time
from typing import Any

import requests

from global_macro_config import HISTORY_START_YEAR

WB_BASE = "https://api.worldbank.org/v2"
CACHE_TTL = 6 * 3600
REQUEST_TIMEOUT = 90
PER_PAGE = 20000
MAX_PAGES = 20

_HEADERS = {"User-Agent": "BTC-Global-Macro/1.0", "Accept": "application/json"}

_cache: dict[str, Any] = {}
_countries_cache: list[dict] | None = None


def clear_cache() -> None:
    _cache.clear()
    global _countries_cache
    _countries_cache = None


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


def fetch_countries(*, refresh: bool = False) -> list[dict]:
    global _countries_cache
    if not refresh and _countries_cache is not None:
        return _countries_cache

    cached = _cache_get("countries")
    if cached and not refresh:
        _countries_cache = cached
        return cached

    url = f"{WB_BASE}/country?format=json&per_page=400"
    resp = requests.get(url, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    payload = resp.json()
    rows = payload[1] if len(payload) > 1 else []

    out: list[dict] = []
    for row in rows:
        region = (row.get("region") or {}).get("value") or ""
        income = (row.get("incomeLevel") or {}).get("value") or ""
        is_agg = region == "Aggregates"
        list_id = row.get("id") or ""
        data_id = row.get("iso2Code") or list_id
        name = row.get("name") or list_id
        if not data_id or data_id in ("", "1A"):
            continue
        out.append(
            {
                "id": data_id,
                "listId": list_id,
                "iso3": list_id if len(list_id) == 3 else "",
                "name": name,
                "region": region if not is_agg else "Aggregates",
                "income": income if not is_agg else "Aggregate",
                "isAggregate": is_agg,
                "featured": list_id in {
                    "WLD", "EUU", "EMU", "SSA", "EAS", "ECS", "LCN", "MEA", "NAC", "SAS", "AFR", "ARB", "CEB"
                }
                or data_id in {"1W", "EUU", "EMU", "SSA", "EAS", "ECS", "LCN", "MEA", "NAC", "SAS", "AFR", "ARB", "CEB"},
            }
        )

    out.sort(key=lambda c: (not c["isAggregate"], c["name"]))
    _cache_set("countries", out)
    _countries_cache = out
    return out


def fetch_indicator_all_countries(
    wb_code: str,
    *,
    start_year: int = HISTORY_START_YEAR,
    end_year: int | None = None,
) -> tuple[dict[str, dict[int, float]], dict[str, str]]:
    """Return ({data_country_id: {year: value}}, {data_country_id: iso3})."""
    end_year = end_year or time.gmtime().tm_year
    cache_key = f"wb:{wb_code}:{start_year}:{end_year}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    url = (
        f"{WB_BASE}/country/all/indicator/{wb_code}"
        f"?format=json&per_page={PER_PAGE}&date={start_year}:{end_year}"
    )

    buckets: dict[str, dict[int, float]] = {}
    iso3_map: dict[str, str] = {}
    page = 1
    pages = 1

    while page <= pages and page <= MAX_PAGES:
        page_url = url if page == 1 else f"{url}&page={page}"
        resp = requests.get(page_url, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        payload = resp.json()
        if len(payload) < 2:
            break
        meta, rows = payload[0], payload[1] or []
        pages = int(meta.get("pages") or 1)
        for row in rows:
            country = row.get("country") or {}
            cid = country.get("id")
            val = _safe_float(row.get("value"))
            if not cid or val is None:
                continue
            iso3 = row.get("countryiso3code") or ""
            if iso3:
                iso3_map[cid] = iso3
            try:
                year = int(row.get("date"))
            except (TypeError, ValueError):
                continue
            buckets.setdefault(cid, {})[year] = val
        page += 1

    result = (buckets, iso3_map)
    _cache_set(cache_key, result)
    return result