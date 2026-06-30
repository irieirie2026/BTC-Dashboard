"""
Liquidity proxy builder — CB BS + Broad Money + FX Reserves (ex-gold).
"""

from __future__ import annotations

import time
from typing import Any

from cache.config import TTL_COLD
from macro_data.cache import cache_get, cache_set
from macro_data.imf_ifs import load_ifs_store
from macro_data.liquidity_config import (
    CB_DBNOMICS,
    COMPONENTS,
    ENTITY_ORDER,
    FEATURED_LIQUIDITY_COUNTRIES,
    LIQUIDITY_ENTITIES,
    LIQUIDITY_METHODOLOGY,
    LIQUIDITY_START_YEAR,
)
from macro_data.bis_credit_gap import get_credit_gap_series
from macro_data.config import PROJECTION_END_YEAR, data_years
from macro_data.liquidity_monthly import attach_monthly_momentum, build_entity_monthly
from macro_data.liquidity_project import (
    apply_liquidity_projections,
    clear_projection_cache,
    resolve_projected_country_proxy,
)
from macro_data.liquidity_euro import clear_euro_cache
from macro_data.liquidity_resolver import (
    clear_gdp_cache,
    compute_derived,
    compute_derived_aggregate,
    coverage_stats,
    resolve_country_components,
)
from macro_data.worldbank import fetch_countries, fetch_indicator_all_countries

_COMPONENT_CACHE: dict[str, Any] | None = None
_LIQUIDITY_CACHE_TTL = TTL_COLD

_OVERLAY_SYMBOLS = [
    ("TLT", "20+ Year Treasuries (TLT)", "#38bdf8"),
    ("HYG", "High Yield (HYG)", "#f472b6"),
    ("^VIX", "VIX", "#fbbf24"),
]


def clear_liquidity_cache() -> None:
    global _COMPONENT_CACHE
    _COMPONENT_CACHE = None
    from cache.service import get_cache_service

    get_cache_service().invalidate_prefix("lq:")
    get_cache_service().invalidate_prefix("macro:liquidity:")
    clear_projection_cache()
    clear_gdp_cache()
    clear_euro_cache()


def _cell(value: float | None, source: str, *, methodology: str | None = None) -> dict | None:
    if value is None:
        return None
    return {
        "value": value,
        "source": source,
        "methodology": methodology,
    }


def _years_list() -> list[int]:
    return data_years(start=LIQUIDITY_START_YEAR)


def _fetch_dbnomics_annual(provider: str, dataset: str, series: str, scale: float = 1.0) -> dict[int, float]:
    import requests

    cache_key = f"lq:dbn:{provider}:{dataset}:{series}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {int(k): v for k, v in cached.items()}

    url = f"https://api.db.nomics.world/v22/series/{provider}/{dataset}/{series}"
    try:
        resp = requests.get(
            url,
            params={"observations": "1"},
            headers={"User-Agent": "BTC-MacroDrivers/2.0"},
            timeout=60,
        )
        if resp.status_code != 200:
            cache_set(cache_key, {})
            return {}
        payload = resp.json()
        docs = payload.get("series", {}).get("docs", [])
        if not docs:
            cache_set(cache_key, {})
            return {}
        periods = docs[0].get("period", [])
        values = docs[0].get("value", [])
        bucket: dict[int, float] = {}
        for p, v in zip(periods, values):
            if v is None:
                continue
            try:
                yr = int(str(p)[:4])
            except (TypeError, ValueError):
                continue
            try:
                bucket[yr] = float(v) * scale
            except (TypeError, ValueError):
                continue
        cache_set(cache_key, bucket)
        return bucket
    except Exception:
        cache_set(cache_key, {})
        return {}


def _load_component_store(*, refresh: bool = False) -> dict[str, Any]:
    global _COMPONENT_CACHE
    if _COMPONENT_CACHE is not None and not refresh:
        return _COMPONENT_CACHE

    fx_cfg = COMPONENTS["fx_reserves"]
    bm_cfg = COMPONENTS["broad_money"]

    wb_codes = [
        fx_cfg["wb_total"],
        fx_cfg["wb_gold"],
        bm_cfg["wb_level_lcu"],
        bm_cfg["wb_gdp_ratio"],
        bm_cfg["wb_gdp_usd"],
        bm_cfg["wb_fx"],
    ]

    raw: dict[str, dict[str, dict[int, float]]] = {}
    for code in wb_codes:
        buckets, _ = fetch_indicator_all_countries(code, start_year=LIQUIDITY_START_YEAR, refresh=refresh)
        raw[code] = buckets

    cb_dbn: dict[str, dict[int, float]] = {}
    for cid, meta in CB_DBNOMICS.items():
        cb_dbn[cid] = _fetch_dbnomics_annual(
            meta["provider"],
            meta["dataset"],
            meta["series"],
            meta.get("scale", 1.0),
        )

    ifs = load_ifs_store(refresh=refresh)

    _COMPONENT_CACHE = {
        "wb": raw,
        "cb_dbn": cb_dbn,
        "ifs": ifs,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    return _COMPONENT_CACHE


def _sum_components(components: dict[str, dict | None]) -> tuple[float | None, list[str], str | None]:
    total = 0.0
    have = False
    sources: set[str] = set()
    proxy_notes: list[str] = []
    for comp in components.values():
        if not comp or comp.get("value") is None:
            continue
        total += comp["value"]
        have = True
        if comp.get("source"):
            sources.add(comp["source"])
        if comp.get("source") == "Proxy" and comp.get("methodology"):
            proxy_notes.append(comp["methodology"])
    if not have:
        return None, [], None
    methodology = "; ".join(dict.fromkeys(proxy_notes)) if proxy_notes else None
    return total, sorted(sources), methodology


def _yoy(series: list[dict]) -> None:
    for i, pt in enumerate(series):
        if i == 0:
            pt["yoy"] = None
            pt["momentum3m"] = None
            continue
        prev = series[i - 1]["proxy"]
        cur = pt["proxy"]
        if prev and cur and prev > 0:
            yoy = (cur / prev - 1) * 100
            pt["yoy"] = yoy
            if i >= 2:
                prev_yoy = series[i - 1].get("yoy")
                if prev_yoy is not None:
                    pt["momentum3m"] = (yoy - prev_yoy) / 4
                else:
                    pt["momentum3m"] = yoy / 4
            else:
                pt["momentum3m"] = yoy / 4
        else:
            pt["yoy"] = None
            pt["momentum3m"] = None


def _resolve_country(countries: list[dict], code: str) -> dict | None:
    return next(
        (x for x in countries if x["id"] == code or x.get("listId") == code),
        None,
    )


def _featured_country_entities(countries: list[dict]) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for code in FEATURED_LIQUIDITY_COUNTRIES:
        c = _resolve_country(countries, code)
        if not c or c["id"] in seen:
            continue
        seen.add(c["id"])
        out.append({"id": c["id"], "label": c["name"]})
    return out


def _entity_countries(entity_id: str, countries: list[dict]) -> list[dict]:
    meta = LIQUIDITY_ENTITIES.get(entity_id)
    if not meta:
        c = _resolve_country(countries, entity_id)
        return [c] if c else []

    etype = meta["type"]
    if etype == "wb_aggregate":
        out = []
        for wid in meta["wb_ids"]:
            c = next((x for x in countries if x["id"] == wid or x.get("listId") == wid), None)
            if c:
                out.append(c)
        return out[:1] if out else []

    if etype == "income_filter":
        incomes = set(meta.get("incomes") or [])
        return [
            c
            for c in countries
            if not c.get("isAggregate")
            and c.get("income") in incomes
        ]

    if etype == "region_filter":
        regions = set(meta.get("regions") or [])
        return [
            c
            for c in countries
            if not c.get("isAggregate")
            and c.get("region") in regions
        ]

    return []


def _entity_derived_mode(
    entity_id: str,
    countries: list[dict],
) -> tuple[list[dict], bool]:
    meta = LIQUIDITY_ENTITIES.get(entity_id)
    if meta:
        members = _entity_countries(entity_id, countries)
        is_single = meta["type"] == "wb_aggregate" or len(members) == 1
        return members, is_single
    c = _resolve_country(countries, entity_id)
    return ([c] if c else []), True


def _attach_derived(
    store: dict,
    members: list[dict],
    point: dict,
    *,
    is_single: bool,
    refresh: bool = False,
) -> None:
    growth_pct = point.get("growthAssumption")
    if is_single and members:
        point["derived"] = compute_derived(
            store,
            members[0],
            point["year"],
            point["components"],
            refresh=refresh,
            growth_pct=growth_pct,
        )
    elif members:
        point["derived"] = compute_derived_aggregate(
            store,
            members,
            point["year"],
            point["components"],
            refresh=refresh,
            growth_pct=growth_pct,
        )


def _refresh_series_derived(
    store: dict,
    entity: dict[str, Any],
    members: list[dict],
    *,
    is_single: bool,
    refresh: bool = False,
) -> None:
    series = entity.get("series") or []
    for point in series:
        _attach_derived(store, members, point, is_single=is_single, refresh=refresh)
    if series:
        entity["latest"] = series[-1]


def _build_series_for_entity(
    store: dict,
    countries: list[dict],
    entity_id: str,
) -> dict[str, Any]:
    meta = LIQUIDITY_ENTITIES.get(entity_id)
    if meta:
        label = meta["label"]
        members = _entity_countries(entity_id, countries)
        is_aggregate = meta["type"] == "wb_aggregate"
    else:
        c = _resolve_country(countries, entity_id)
        label = c["name"] if c else entity_id
        members = [c] if c else []
        is_aggregate = False

    years = _years_list()
    series: list[dict] = []

    if is_aggregate and members:
        member = members[0]
        for yr in years:
            comps = resolve_country_components(store, member, yr)
            proxy, sources, methodology = _sum_components(comps)
            if proxy is None:
                continue
            point = {
                "year": yr,
                "proxy": proxy,
                "components": comps,
                "sources": sources,
                "methodology": methodology,
            }
            _attach_derived(store, members, point, is_single=True)
            series.append(point)
    elif members:
        for yr in years:
            agg_comps: dict[str, float] = {}
            agg_sources: set[str] = set()
            comp_details: dict[str, dict] = {}
            for m in members:
                comps = resolve_country_components(store, m, yr)
                for key, cell in comps.items():
                    if not cell or cell.get("value") is None:
                        continue
                    agg_comps[key] = agg_comps.get(key, 0.0) + cell["value"]
                    if cell.get("source"):
                        agg_sources.add(cell["source"])
                    if key not in comp_details:
                        comp_details[key] = {
                            "value": 0.0,
                            "source": cell.get("source"),
                            "methodology": cell.get("methodology"),
                        }
                    comp_details[key]["value"] += cell["value"]
                    if cell.get("source") == "Proxy":
                        comp_details[key]["source"] = "Proxy"
                        comp_details[key]["methodology"] = cell.get("methodology")

            proxy = sum(agg_comps.values()) if agg_comps else None
            if proxy is None:
                continue
            formatted_comps = {
                k: _cell(v["value"], v.get("source") or "WB", methodology=v.get("methodology"))
                for k, v in comp_details.items()
            }
            point = {
                "year": yr,
                "proxy": proxy,
                "components": formatted_comps,
                "sources": sorted(agg_sources),
                "methodology": None,
                "countryCount": len(members),
            }
            is_single = len(members) == 1
            _attach_derived(store, members, point, is_single=is_single)
            series.append(point)
    else:
        return {"id": entity_id, "label": label, "series": [], "latest": None}

    _yoy(series)
    latest = series[-1] if series else None
    return {
        "id": entity_id,
        "label": label,
        "isAggregate": bool(meta and meta["type"] == "wb_aggregate"),
        "series": series,
        "latest": latest,
    }


def _country_table(
    store: dict,
    countries: list[dict],
    year: int,
    *,
    refresh: bool = False,
) -> list[dict]:
    rows = []
    for cid in FEATURED_LIQUIDITY_COUNTRIES:
        c = _resolve_country(countries, cid)
        if not c:
            continue
        proxy, comps, sources, methodology, projected = resolve_projected_country_proxy(
            store, c, year, refresh=False
        )
        if proxy is None:
            continue
        prev_proxy, prev_comps, _, _, _ = resolve_projected_country_proxy(
            store, c, year - 1, refresh=False
        )
        yoy = (proxy / prev_proxy - 1) * 100 if prev_proxy and prev_proxy > 0 else None
        derived = compute_derived(store, c, year, comps, refresh=refresh)
        rows.append(
            {
                "id": c["id"],
                "name": c["name"],
                "iso3": c.get("iso3") or "",
                "proxy": proxy,
                "yoy": yoy,
                "projected": projected,
                "components": comps,
                "sources": sources,
                "methodology": methodology,
                "derived": derived,
            }
        )
    rows.sort(key=lambda r: r.get("proxy") or 0, reverse=True)
    return rows


def _build_market_overlay() -> dict[str, Any] | None:
    try:
        from server import fetch_yahoo_chart, fetch_yahoo_quotes
    except Exception:
        return None

    symbols = [s[0] for s in _OVERLAY_SYMBOLS]
    quotes = fetch_yahoo_quotes(symbols)
    heroes = []
    charts = []
    for sym, label, color in _OVERLAY_SYMBOLS:
        q = quotes.get(sym)
        if q:
            heroes.append(q)
        chart = fetch_yahoo_chart(sym)
        charts.append(
            {
                "symbol": sym,
                "label": label,
                "color": color,
                "points": chart.get("points") or [],
            }
        )
    if not heroes and not any(c.get("points") for c in charts):
        return None
    return {
        "heroes": heroes,
        "charts": charts,
        "overlaySource": "Yahoo",
    }


def get_liquidity_map_payload(
    *,
    metric: str = "proxy",
    year: int | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    cache_key = f"lq:map:v2:{metric}:{year}"
    if not refresh:
        cached = cache_get(cache_key, ttl=_LIQUIDITY_CACHE_TTL)
        if cached is not None:
            return cached

    store = _load_component_store(refresh=refresh)
    countries = fetch_countries(refresh=refresh)
    years = _years_list()
    yr = year if year in years else (years[-1] if years else 2024)

    points = []
    for c in countries:
        if c.get("isAggregate") or not c.get("iso3"):
            continue
        proxy, comps, sources, _, projected = resolve_projected_country_proxy(
            store, c, yr, refresh=refresh
        )
        if proxy is None:
            continue
        prev_proxy, _, _, _, _ = resolve_projected_country_proxy(
            store, c, yr - 1, refresh=refresh
        )
        yoy = (proxy / prev_proxy - 1) * 100 if prev_proxy and prev_proxy > 0 else None
        value = yoy if metric == "yoy" else proxy
        if metric == "yoy" and value is None:
            continue
        points.append(
            {
                "id": c["id"],
                "name": c["name"],
                "iso3": c["iso3"],
                "value": value,
                "proxy": proxy,
                "yoy": yoy,
                "projected": projected,
                "sources": sources,
            }
        )

    payload = {
        "metric": metric,
        "year": yr,
        "label": "YoY %" if metric == "yoy" else "Liquidity proxy (USD)",
        "format": "pct" if metric == "yoy" else "large_usd",
        "unit": "%" if metric == "yoy" else "USD",
        "points": points,
        "fetchedAt": store["fetchedAt"],
    }
    cache_set(cache_key, payload, ttl=_LIQUIDITY_CACHE_TTL)
    return payload


def get_liquidity_payload(
    *,
    entity: str = "WLD",
    year: int | None = None,
    overlay: bool = False,
    refresh: bool = False,
) -> dict[str, Any]:
    cache_key = f"lq:v4:{entity}:{year}:{overlay}"
    if not refresh:
        cached = cache_get(cache_key, ttl=_LIQUIDITY_CACHE_TTL)
        if cached is not None:
            return cached

    store = _load_component_store(refresh=refresh)
    countries = fetch_countries(refresh=refresh)
    years = _years_list()
    yr = year if year in years else (years[-1] if years else 2024)

    global_entity = _build_series_for_entity(store, countries, entity)
    monthly = build_entity_monthly(entity, store, countries, refresh=refresh)
    apply_liquidity_projections(
        global_entity, monthly, entity, countries, _entity_countries, refresh=refresh
    )
    global_members, global_single = _entity_derived_mode(entity, countries)
    _refresh_series_derived(
        store, global_entity, global_members, is_single=global_single, refresh=refresh
    )
    attach_monthly_momentum(global_entity, monthly)
    regional = []
    for eid in ENTITY_ORDER:
        if eid not in LIQUIDITY_ENTITIES:
            continue
        block = _build_series_for_entity(store, countries, eid)
        apply_liquidity_projections(
            block, None, eid, countries, _entity_countries, refresh=refresh
        )
        members, is_single = _entity_derived_mode(eid, countries)
        _refresh_series_derived(store, block, members, is_single=is_single, refresh=refresh)
        regional.append(block)
    table = _country_table(store, countries, yr, refresh=refresh)

    market_overlay = _build_market_overlay() if overlay else None
    credit_gap = get_credit_gap_series(entity, projection_end_year=yr, refresh=refresh)

    payload = {
        "entity": entity,
        "year": yr,
        "label": global_entity.get("label") or entity,
        "formula": LIQUIDITY_METHODOLOGY["formula"],
        "methodology": LIQUIDITY_METHODOLOGY,
        "components": COMPONENTS,
        "global": global_entity,
        "monthly": monthly,
        "regional": regional,
        "countries": table,
        "coverageStats": coverage_stats(table),
        "derived": (global_entity.get("latest") or {}).get("derived"),
        "entities": [
            {"id": eid, "label": LIQUIDITY_ENTITIES[eid]["label"]}
            for eid in ENTITY_ORDER
            if eid in LIQUIDITY_ENTITIES
        ]
        + _featured_country_entities(countries),
        "featuredCountries": FEATURED_LIQUIDITY_COUNTRIES,
        "marketOverlay": market_overlay,
        "creditGap": credit_gap,
        "meta": {
            "frequency": "annual",
            "startYear": LIQUIDITY_START_YEAR,
            "endYear": years[-1] if years else yr,
            "projectionEndYear": PROJECTION_END_YEAR,
            "projectionEndMonth": monthly.get("projectionEndMonth") if monthly else None,
        },
        "fetchedAt": store["fetchedAt"],
        "source": "WB → IMF IFS → DBnomics → Proxy → IMF WEO projection (+ optional Yahoo overlay)",
    }

    cache_set(cache_key, payload, ttl=_LIQUIDITY_CACHE_TTL)
    return payload