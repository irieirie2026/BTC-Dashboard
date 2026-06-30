"""
5-tier data resolver: World Bank → IMF → Eurostat → DBnomics → regional composite.
Builds and caches the merged cell store for all indicators.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from cache.config import HIERARCHY_STORE_TTL
from cache.keys import macro_hierarchy_store
from macro_data.cache import cache_get, cache_set, clear_cache
from macro_data.config import (
    AGGREGATE_COMPOSITE_REGIONS,
    DEFAULT_YEAR,
    FEATURED_AGGREGATES,
    HISTORY_START_YEAR,
    INDICATORS,
    METHODOLOGY,
    PROJECTION_END_YEAR,
    RATE_INDICATORS,
    data_years,
)
from macro_data.dbnomics import fetch_series_by_iso3
from macro_data.eurostat import EUROSTAT_SERIES, eurostat_lookup, fetch_indicator_series as fetch_eurostat_series
from macro_data.imf import fetch_indicator_series, imf_code_for_country
from macro_data.oecd_eo import fetch_all_indicator_series, oecd_lookup, publication_meta as oecd_publication_meta
from macro_data.projections import is_projection_year, resolve_forecast_value
from macro_data.worldbank import clear_memory as clear_wb_memory
from macro_data.worldbank import fetch_countries, fetch_indicator_all_countries

_store: dict[str, Any] | None = None


def clear_all() -> None:
    global _store
    _store = None
    from cache.service import get_cache_service

    get_cache_service().delete(macro_hierarchy_store())
    clear_cache()
    clear_wb_memory()


def _imf_lookup(
    imf_series: dict[str, dict[int, float]],
    country: dict,
    year: int,
) -> float | None:
    code = imf_code_for_country(country)
    if not code:
        return None
    return (imf_series.get(code) or {}).get(year)


def _dbn_lookup(
    dbn_series: dict[str, dict[int, float]],
    country: dict,
    year: int,
) -> float | None:
    iso3 = country.get("iso3")
    if iso3 and iso3 in dbn_series:
        return dbn_series[iso3].get(year)
    return (dbn_series.get("GLOBAL") or {}).get(year)


def _apply_imf_scale(ind_key: str, imf_indicator: str, val: float) -> float:
    if ind_key == "gdp_nominal" and imf_indicator == "NGDPD":
        return val * 1e9
    return val


def _est_lookup(
    est_series: dict[str, dict[int, float]],
    country: dict,
    year: int,
) -> float | None:
    return eurostat_lookup(est_series, country, year)


def _resolve_supplemental(
    country: dict,
    yr: int,
    ind_key: str,
    *,
    imf_indicator: str | None,
    imf_data: dict[str, dict[int, float]],
    oecd_data: dict[str, dict[int, float]],
    est_data: dict[str, dict[int, float]],
    dbn_data: dict[str, dict[int, float]],
    dbn_cfg: dict | None,
    prefer_eurostat: bool,
) -> tuple[float | None, str | None, str | None]:
    """IMF WEO + OECD EO + Eurostat + DBnomics for individual countries and aggregates."""
    if prefer_eurostat and est_data:
        est_val = _est_lookup(est_data, country, yr)
        if est_val is not None:
            return est_val, "EST", None

    oecd_only = ind_key in {"gdp_deflator", "current_account"}
    if is_projection_year(yr) or oecd_only:
        val, source, methodology = resolve_forecast_value(
            country,
            yr,
            ind_key,
            imf_data=imf_data,
            oecd_data=oecd_data,
            imf_indicator=imf_indicator,
            apply_imf_scale=_apply_imf_scale,
        )
        if oecd_only and val is None:
            val = oecd_lookup(oecd_data, country, yr)
            if val is not None:
                return val, "OECD", None
        if val is not None and source:
            return val, source, methodology

    if imf_indicator:
        imf_val = _imf_lookup(imf_data, country, yr)
        if imf_val is not None:
            return _apply_imf_scale(ind_key, imf_indicator, imf_val), "IMF", None

    oecd_val = oecd_lookup(oecd_data, country, yr)
    if oecd_val is not None:
        return oecd_val, "OECD", None

    if est_data:
        est_val = _est_lookup(est_data, country, yr)
        if est_val is not None:
            return est_val, "EST", None

    if dbn_cfg:
        dbn_val = _dbn_lookup(dbn_data, country, yr)
        if dbn_val is not None:
            return dbn_val, "DB", None

    return None, None, None


def _finalize_supplemental_cell(
    val: float,
    source: str,
    yr: int,
    methodology: str | None,
) -> dict[str, Any]:
    cell: dict[str, Any] = {
        "value": val,
        "source": source,
        "vintage": yr,
        "methodology": methodology,
    }
    if source in ("IMF", "OECD", "Proj") and is_projection_year(yr):
        cell["projection"] = True
        if not cell["methodology"]:
            if source == "IMF":
                cell["methodology"] = "IMF WEO forecast"
            elif source == "OECD":
                cell["methodology"] = "OECD Economic Outlook forecast"
    return cell


def _complement_individual_countries(
    cells: dict,
    countries: list[dict],
    years: list[int],
    supplemental: dict[str, dict[str, Any]],
) -> None:
    """Fill recent-year gaps on non-aggregate rows (same tiers as aggregates)."""
    recent_cutoff = time.gmtime().tm_year - 1
    recent_years = [yr for yr in years if yr >= recent_cutoff]
    if not recent_years:
        return

    for country in countries:
        if country.get("isAggregate"):
            continue
        cid = country["id"]
        row = cells.setdefault(cid, {})
        for ind_key, supp in supplemental.items():
            ind_cells = row.setdefault(ind_key, {})
            imf_indicator = INDICATORS[ind_key].get("imf_code")
            est_data = supp.get("est") or {}
            imf_data = supp.get("imf") or {}
            oecd_data = supp.get("oecd") or {}
            dbn_data = supp.get("dbn") or {}
            dbn_cfg = INDICATORS[ind_key].get("dbnomics")
            for yr in recent_years:
                if ind_cells.get(str(yr), {}).get("value") is not None:
                    continue
                val, source, methodology = _resolve_supplemental(
                    country,
                    yr,
                    ind_key,
                    imf_indicator=imf_indicator,
                    imf_data=imf_data,
                    oecd_data=oecd_data,
                    est_data=est_data,
                    dbn_data=dbn_data,
                    dbn_cfg=dbn_cfg,
                    prefer_eurostat=True,
                )
                if val is not None and source:
                    ind_cells[str(yr)] = _finalize_supplemental_cell(val, source, yr, methodology)


def _aggregate_members(countries: list[dict], regions: list[str]) -> list[dict]:
    region_set = {r.strip() for r in regions}
    return [
        c
        for c in countries
        if not c.get("isAggregate") and (c.get("region") or "").strip() in region_set
    ]


WORLD_AGGREGATE_KEYS = frozenset({"WLD", "1W"})
EU_AGGREGATE_KEYS = frozenset({"EMU", "XC", "EUU", "EU", "EURO"})


def _fill_major_aggregates(store: dict, countries: list[dict], years: list[int]) -> None:
    """Fill featured WB aggregates (World, EU, regional gaps) for projection years."""
    cells = store["cells"]
    recent_cutoff = time.gmtime().tm_year - 1
    recent_years = [yr for yr in years if yr >= recent_cutoff]
    if not recent_years:
        return

    all_members = [c for c in countries if not c.get("isAggregate")]
    partial_store = {"cells": cells}

    for country in countries:
        if not country.get("isAggregate"):
            continue
        agg_key = country.get("listId") or country.get("id")
        if agg_key not in FEATURED_AGGREGATES and country["id"] not in FEATURED_AGGREGATES:
            continue

        regions = AGGREGATE_COMPOSITE_REGIONS.get(agg_key)
        if regions:
            members = _aggregate_members(countries, regions)
        elif agg_key in WORLD_AGGREGATE_KEYS or country["id"] in WORLD_AGGREGATE_KEYS:
            members = all_members
        elif agg_key in EU_AGGREGATE_KEYS or country["id"] in EU_AGGREGATE_KEYS:
            members = _aggregate_members(countries, ["Europe & Central Asia"])
        else:
            continue

        if not members:
            continue

        cid = country["id"]
        row = cells.setdefault(cid, {})
        scope = (
            "World"
            if agg_key in WORLD_AGGREGATE_KEYS or country["id"] in WORLD_AGGREGATE_KEYS
            else ", ".join(regions or ["Europe & Central Asia"])
        )
        for ind_key in INDICATORS:
            ind_cells = row.setdefault(ind_key, {})
            for yr in recent_years:
                if ind_cells.get(str(yr), {}).get("value") is not None:
                    continue
                val = _composite_aggregate_value(partial_store, members, ind_key, yr)
                if val is None:
                    continue
                ind_cells[str(yr)] = {
                    "value": val,
                    "source": "Proxy",
                    "vintage": yr,
                    "projection": yr > recent_cutoff,
                    "methodology": (
                        f"GDP-weighted composite of {len(members)} economies in {scope} "
                        "(fills missing aggregate / projection-year gaps)."
                    ),
                }


def _member_weight(store: dict, member: dict, year: int) -> float:
    cell = get_cell(store, member["id"], "gdp_nominal", year)
    if cell and cell.get("value") and cell["value"] > 0:
        return float(cell["value"])
    for offset in (1, 2, 3):
        prior = get_cell(store, member["id"], "gdp_nominal", year - offset)
        if prior and prior.get("value") and prior["value"] > 0:
            return float(prior["value"])
    return 1.0


def _composite_aggregate_value(
    store: dict,
    members: list[dict],
    ind_key: str,
    year: int,
) -> float | None:
    if not members:
        return None

    if ind_key in RATE_INDICATORS:
        weighted = 0.0
        total_w = 0.0
        for member in members:
            cell = get_cell(store, member["id"], ind_key, year)
            if not cell or cell.get("value") is None:
                continue
            w = _member_weight(store, member, year)
            weighted += float(cell["value"]) * w
            total_w += w
        return weighted / total_w if total_w > 0 else None

    total = 0.0
    have = False
    for member in members:
        cell = get_cell(store, member["id"], ind_key, year)
        if cell and cell.get("value") is not None:
            total += float(cell["value"])
            have = True
    return total if have else None


def _fill_aggregate_composites(store: dict, countries: list[dict], years: list[int]) -> None:
    cells = store["cells"]
    for country in countries:
        if not country.get("isAggregate"):
            continue
        agg_key = country.get("listId") or country.get("id")
        regions = AGGREGATE_COMPOSITE_REGIONS.get(agg_key)
        if not regions:
            continue
        members = _aggregate_members(countries, regions)
        if not members:
            continue

        cid = country["id"]
        row = cells.setdefault(cid, {})
        for ind_key in INDICATORS:
            ind_cells = row.setdefault(ind_key, {})
            for yr in years:
                if ind_cells.get(str(yr), {}).get("value") is not None:
                    continue
                val = _composite_aggregate_value(store, members, ind_key, yr)
                if val is None:
                    continue
                ind_cells[str(yr)] = {
                    "value": val,
                    "source": "Proxy",
                    "vintage": yr,
                    "methodology": (
                        f"GDP-weighted composite of {len(members)} economies in "
                        f"{', '.join(regions)} (fills missing aggregate / recent-year gaps)."
                    ),
                }


def _best_default_year(years: list[int], cells: dict) -> int:
    for year in sorted(years, reverse=True):
        filled = sum(
            1
            for row in cells.values()
            if (row.get("gdp_growth") or {}).get(str(year), {}).get("value") is not None
        )
        if filled >= 80:
            return year
    return years[-1] if years else DEFAULT_YEAR


def get_store_if_ready() -> dict[str, Any] | None:
    return _store


def _fetch_indicator_bundle(
    ind_key: str,
    meta: dict,
    *,
    refresh: bool = False,
) -> tuple[str, dict, dict[str, str], dict, dict, dict, dict | None]:
    wb_code = meta["wb_code"]
    wb_data, wb_iso3 = fetch_indicator_all_countries(
        wb_code, start_year=HISTORY_START_YEAR, refresh=refresh
    )

    imf_data: dict[str, dict[int, float]] = {}
    imf_indicator = meta.get("imf_code")
    if imf_indicator:
        try:
            imf_data = fetch_indicator_series(imf_indicator, refresh=refresh)
        except Exception:
            imf_data = {}

    dbn_data: dict[str, dict[int, float]] = {}
    dbn_cfg = meta.get("dbnomics")
    if dbn_cfg:
        try:
            dbn_data = fetch_series_by_iso3(
                dbn_cfg["provider"],
                dbn_cfg["dataset"],
                dbn_cfg["series"],
                start_year=HISTORY_START_YEAR,
                end_year=PROJECTION_END_YEAR,
                refresh=refresh,
            )
        except Exception:
            dbn_data = {}

    est_data: dict[str, dict[int, float]] = {}
    if ind_key in EUROSTAT_SERIES:
        try:
            est_data = fetch_eurostat_series(
                ind_key,
                start_year=HISTORY_START_YEAR,
                end_year=PROJECTION_END_YEAR,
                refresh=refresh,
            )
        except Exception:
            est_data = {}

    return ind_key, wb_data, wb_iso3, imf_data, est_data, dbn_data, dbn_cfg


def _merge_indicator_cells(
    *,
    ind_key: str,
    meta: dict,
    wb_data: dict,
    imf_data: dict,
    oecd_data: dict,
    est_data: dict,
    dbn_data: dict,
    dbn_cfg: dict | None,
    countries: list[dict],
    years: list[int],
    cells: dict,
    recent_cutoff: int,
) -> None:
    imf_indicator = meta.get("imf_code")
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
            methodology = None

            if val is not None:
                source = "WB"
            else:
                prefer_est = (
                    yr >= recent_cutoff
                    and est_data
                    and not country.get("isAggregate")
                )
                val, source, methodology = _resolve_supplemental(
                    country,
                    yr,
                    ind_key,
                    imf_indicator=imf_indicator,
                    imf_data=imf_data,
                    oecd_data=oecd_data,
                    est_data=est_data,
                    dbn_data=dbn_data,
                    dbn_cfg=dbn_cfg,
                    prefer_eurostat=prefer_est,
                )

            if val is not None and source:
                if source == "WB":
                    ind_cells[str(yr)] = {
                        "value": val,
                        "source": source,
                        "vintage": yr,
                        "methodology": methodology,
                    }
                else:
                    ind_cells[str(yr)] = _finalize_supplemental_cell(val, source, yr, methodology)


def get_store(*, refresh: bool = False) -> dict[str, Any]:
    global _store
    if _store is not None and not refresh:
        return _store

    store_key = macro_hierarchy_store()
    if not refresh:
        cached = cache_get(store_key, ttl=HIERARCHY_STORE_TTL)
        if cached is not None:
            _store = cached
            return _store

    countries = fetch_countries(refresh=refresh)
    years = data_years()
    cells: dict[str, dict[str, dict[str, dict[str, Any]]]] = {}
    iso3_by_country: dict[str, str] = {}
    supplemental_by_ind: dict[str, dict[str, Any]] = {}
    recent_cutoff = time.gmtime().tm_year - 1

    bundles: dict[str, tuple] = {}
    oecd_bundle: dict[str, dict[str, dict[int, float]]] = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        oecd_future = pool.submit(fetch_all_indicator_series, refresh=refresh)
        futures = {
            pool.submit(_fetch_indicator_bundle, ind_key, meta, refresh=refresh): ind_key
            for ind_key, meta in INDICATORS.items()
        }
        for future in as_completed(futures):
            ind_key, wb_data, wb_iso3, imf_data, est_data, dbn_data, dbn_cfg = future.result()
            bundles[ind_key] = (wb_data, wb_iso3, imf_data, est_data, dbn_data, dbn_cfg)
            for cid, iso3 in wb_iso3.items():
                if iso3 and cid not in iso3_by_country:
                    iso3_by_country[cid] = iso3
        oecd_bundle = oecd_future.result()

    for ind_key, meta in INDICATORS.items():
        wb_data, wb_iso3, imf_data, est_data, dbn_data, dbn_cfg = bundles[ind_key]
        supplemental_by_ind[ind_key] = {
            "imf": imf_data,
            "oecd": oecd_bundle.get(ind_key) or {},
            "est": est_data,
            "dbn": dbn_data,
        }
        _merge_indicator_cells(
            ind_key=ind_key,
            meta=meta,
            wb_data=wb_data,
            imf_data=imf_data,
            oecd_data=oecd_bundle.get(ind_key) or {},
            est_data=est_data,
            dbn_data=dbn_data,
            dbn_cfg=dbn_cfg,
            countries=countries,
            years=years,
            cells=cells,
            recent_cutoff=recent_cutoff,
        )

    for country in countries:
        iso = iso3_by_country.get(country["id"])
        if iso and not country.get("iso3"):
            country["iso3"] = iso

    _complement_individual_countries(cells, countries, years, supplemental_by_ind)

    partial_store = {"countries": countries, "cells": cells, "years": years}
    _fill_aggregate_composites(partial_store, countries, years)
    _fill_major_aggregates(partial_store, countries, years)

    default_year = _best_default_year(years, cells)

    from macro_data.projections import projection_meta

    _store = {
        "countries": countries,
        "years": years,
        "defaultYear": default_year,
        "cells": cells,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "methodology": METHODOLOGY,
        "featuredAggregates": sorted(FEATURED_AGGREGATES),
        "projectionSources": projection_meta(),
        "oecdPublication": oecd_publication_meta(),
    }
    cache_set(store_key, _store, ttl=HIERARCHY_STORE_TTL)
    return _store


def get_cell(store: dict, country_id: str, indicator: str, year: int) -> dict | None:
    return (store["cells"].get(country_id) or {}).get(indicator, {}).get(str(year))


def filter_countries(
    store: dict,
    *,
    region: str = "",
    income: str = "",
    show_aggregates: bool = True,
    featured_only: bool = False,
    search: str = "",
) -> list[dict]:
    q = search.strip().lower()
    out = []
    for c in store["countries"]:
        if not show_aggregates and c.get("isAggregate"):
            continue
        if featured_only and c.get("isAggregate") and not c.get("featured"):
            continue
        if region and c.get("region") != region:
            continue
        if income and c.get("income") != income:
            continue
        if q:
            hay = f"{c.get('name','')} {c.get('id','')} {c.get('iso3','')}".lower()
            if q not in hay:
                continue
        out.append(c)
    return out