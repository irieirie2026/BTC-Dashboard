"""
Global Macro Dashboard API payload — World Bank primary, IMF fallback.
"""

from __future__ import annotations

import time
from typing import Any

from global_macro_config import (
    DEFAULT_YEAR,
    HISTORY_START_YEAR,
    INDICATOR_KEYS,
    INDICATORS,
)
from global_macro_imf import clear_cache as clear_imf_cache
from global_macro_imf import fetch_indicator_series, imf_code_for_country
from global_macro_worldbank import clear_cache as clear_wb_cache
from global_macro_worldbank import fetch_countries, fetch_indicator_all_countries

_PAYLOAD_CACHE: dict[str, dict[str, Any]] = {}
_PAYLOAD_TTL = 3600


def clear_payload_cache() -> None:
    _PAYLOAD_CACHE.clear()


def clear_all_caches() -> None:
    clear_payload_cache()
    clear_wb_cache()
    clear_imf_cache()


def _imf_lookup(
    imf_series: dict[str, dict[int, float]],
    country: dict,
    year: int,
) -> float | None:
    code = imf_code_for_country(country)
    if not code:
        return None
    return (imf_series.get(code) or {}).get(year)


def _best_default_year(years: list[int], cells: dict) -> int:
    if not years:
        return DEFAULT_YEAR
    for year in sorted(years, reverse=True):
        filled = sum(
            1
            for row in cells.values()
            if (row.get("gdp_growth") or {}).get(str(year), {}).get("value") is not None
        )
        if filled >= 80:
            return year
    return years[-1] if years else DEFAULT_YEAR


def get_global_macro_payload(*, refresh: bool = False, year: int | None = None) -> dict[str, Any]:
    cache_key = f"global:{year or 'auto'}"
    now = time.time()
    if not refresh:
        cached = _PAYLOAD_CACHE.get(cache_key)
        if cached and now - cached["ts"] < _PAYLOAD_TTL:
            return cached["data"]

    countries = fetch_countries(refresh=refresh)
    country_by_id = {c["id"]: c for c in countries}

    years = list(range(HISTORY_START_YEAR, time.gmtime().tm_year))
    cells: dict[str, dict[str, dict[str, dict[str, Any]]]] = {}
    iso3_by_country: dict[str, str] = {}

    for ind_key, meta in INDICATORS.items():
        wb_code = meta["wb_code"]
        wb_data, wb_iso3 = fetch_indicator_all_countries(wb_code, start_year=HISTORY_START_YEAR)
        for cid, iso3 in wb_iso3.items():
            if iso3 and cid not in iso3_by_country:
                iso3_by_country[cid] = iso3

        imf_data: dict[str, dict[int, float]] = {}
        imf_indicator = meta.get("imf_code")
        if imf_indicator:
            try:
                imf_data = fetch_indicator_series(imf_indicator, start_year=HISTORY_START_YEAR)
            except Exception:
                imf_data = {}

        for country in countries:
            cid = country["id"]
            wb_years = wb_data.get(cid) or {}
            if not wb_years and country.get("listId"):
                wb_years = wb_data.get(country["listId"]) or {}

            row = cells.setdefault(cid, {})
            ind_cells = row.setdefault(ind_key, {})

            for yr in years:
                val = wb_years.get(yr)
                source = None
                if val is not None:
                    source = "WB"
                elif imf_indicator:
                    imf_val = _imf_lookup(imf_data, country, yr)
                    if imf_val is not None:
                        # IMF NGDPD is billions USD; WB NY.GDP.MKTP.CD is full USD
                        if ind_key == "gdp_nominal" and imf_indicator == "NGDPD":
                            val = imf_val * 1e9
                        else:
                            val = imf_val
                        source = "IMF"

                if val is not None:
                    ind_cells[str(yr)] = {"value": val, "source": source}

    for country in countries:
        iso = iso3_by_country.get(country["id"])
        if iso and not country.get("iso3"):
            country["iso3"] = iso

    default_year = year if year in years else _best_default_year(years, cells)

    # KPI summaries for default year
    kpis: dict[str, Any] = {}
    for ind_key, meta in INDICATORS.items():
        vals = []
        for cid, row in cells.items():
            c = country_by_id.get(cid)
            if not c or c.get("isAggregate"):
                continue
            cell = (row.get(ind_key) or {}).get(str(default_year))
            if cell and cell.get("value") is not None:
                vals.append(cell["value"])
        if vals:
            vals.sort()
            mid = vals[len(vals) // 2]
            kpis[ind_key] = {
                "median": mid,
                "count": len(vals),
                "label": meta["label"],
            }

    payload = {
        "title": "Global Macro Drivers",
        "countries": countries,
        "indicators": [
            {
                "key": k,
                "label": v["label"],
                "unit": v["unit"],
                "tab": v["tab"],
                "format": v["format"],
                "wbCode": v["wb_code"],
                "imfCode": v.get("imf_code"),
            }
            for k, v in INDICATORS.items()
        ],
        "tabs": {
            "growth": "Growth & Income",
            "prices": "Prices & Stability",
            "trade": "Trade & Investment",
            "labor": "Labor Market",
        },
        "years": years,
        "defaultYear": default_year,
        "cells": cells,
        "kpis": kpis,
        "stats": {
            "countryCount": sum(1 for c in countries if not c["isAggregate"]),
            "aggregateCount": sum(1 for c in countries if c["isAggregate"]),
            "totalEntities": len(countries),
        },
        "source": "World Bank WDI + IMF WEO fallback",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "methodology": {
            "primary": "World Bank World Development Indicators (WDI) API v2",
            "fallback": "IMF World Economic Outlook via DataMapper API",
            "rule": "IMF fills a cell only when World Bank has no value for that country, indicator, and year.",
        },
    }

    _PAYLOAD_CACHE[cache_key] = {"ts": now, "data": payload}
    return payload