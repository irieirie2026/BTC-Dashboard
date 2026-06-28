"""
Chunked Macro Drivers API — meta, snapshot, map, series endpoints.
"""

from __future__ import annotations

import time
from typing import Any

from macro_data.config import (
    DEFAULT_YEAR,
    HISTORY_START_YEAR,
    INDICATORS,
    INDICATOR_TABS,
    METHODOLOGY,
    PROJECTION_END_YEAR,
    data_years,
)
from macro_data.hierarchy import clear_all, filter_countries, get_cell, get_store, get_store_if_ready
from macro_data.bis_credit_gap import clear_bis_credit_gap_cache
from macro_data.liquidity import clear_liquidity_cache, get_liquidity_map_payload, get_liquidity_payload
from macro_drivers_worldbank import classify_regime


def clear_all_caches() -> None:
    clear_all()
    clear_liquidity_cache()
    clear_bis_credit_gap_cache()


def _indicator_list() -> list[dict]:
    return [
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
    ]


def _kpis_for_year(store: dict, year: int) -> dict[str, Any]:
    country_by_id = {c["id"]: c for c in store["countries"]}
    kpis: dict[str, Any] = {}
    for ind_key, meta in INDICATORS.items():
        vals = []
        for cid, row in store["cells"].items():
            c = country_by_id.get(cid)
            if not c or c.get("isAggregate"):
                continue
            cell = (row.get(ind_key) or {}).get(str(year))
            if cell and cell.get("value") is not None:
                vals.append(cell["value"])
        if vals:
            vals.sort()
            kpis[ind_key] = {
                "median": vals[len(vals) // 2],
                "count": len(vals),
                "label": meta["label"],
            }
    return kpis


def _observations(store: dict, year: int) -> list[str]:
    bullets: list[str] = []
    kpis = _kpis_for_year(store, year)
    gdp = kpis.get("gdp_growth")
    cpi = kpis.get("cpi_inflation")
    unemp = kpis.get("unemployment")
    if gdp:
        bullets.append(
            f"Global median GDP growth {gdp['median']:.1f}% ({year}, n={gdp['count']} countries)."
        )
    if cpi:
        bullets.append(
            f"Global median CPI inflation {cpi['median']:.1f}% ({year})."
        )
    if unemp:
        bullets.append(
            f"Global median unemployment {unemp['median']:.1f}% ({year})."
        )
    if not bullets:
        bullets.append("Insufficient cross-country coverage for automated observations.")
    return bullets


def _equity_implications(regime: dict) -> list[str]:
    label = regime.get("label", "")
    if "High inflation" in label or "Restrictive" in label:
        return [
            "Higher discount rates pressure long-duration growth; BTC can trade as liquidity-sensitive risk asset.",
            "Favor monitoring real yields and DXY for cross-asset pressure.",
        ]
    if "Tight financial" in label:
        return [
            "Wide lending spreads signal tighter credit — risk assets including BTC may face headwinds until conditions ease.",
        ]
    if "Disinflation" in label:
        return [
            "Falling inflation supports multiple expansion if growth holds — constructive for risk assets when liquidity stabilizes.",
        ]
    if "Contraction" in label:
        return [
            "Recession risk raises earnings downgrades and liquidity withdrawal — BTC correlation to equities often rises in stress.",
        ]
    return [
        "Mixed macro backdrop — BTC may follow liquidity and USD more than single-indicator prints.",
        "Cross-check with BTC on-chain flows and funding rates on the Derivatives tab.",
    ]


def _us_regime(store: dict, year: int) -> dict:
    us = None
    for c in store["countries"]:
        if c["id"] == "US":
            us = c
            break
    if not us:
        return {"label": "Insufficient data", "color": "secondary"}
    cid = us["id"]
    row = store["cells"].get(cid) or {}
    def _val(key: str) -> float | None:
        cell = (row.get(key) or {}).get(str(year))
        return cell.get("value") if cell else None

    return classify_regime(
        {
            "cpi": _val("cpi_inflation"),
            "unemployment": _val("unemployment"),
            "interest_spread": None,
            "gdp_real": _val("gdp_growth"),
        }
    )


def get_meta_payload(*, refresh: bool = False) -> dict[str, Any]:
    from macro_data.worldbank import fetch_countries

    countries = fetch_countries(refresh=refresh)
    years = data_years()
    store = get_store_if_ready()
    default_year = store["defaultYear"] if store else DEFAULT_YEAR
    fetched_at = store["fetchedAt"] if store else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "title": "Macro Drivers",
        "countries": countries,
        "indicators": _indicator_list(),
        "tabs": INDICATOR_TABS,
        "years": years,
        "defaultYear": default_year,
        "stats": {
            "countryCount": sum(1 for c in countries if not c["isAggregate"]),
            "aggregateCount": sum(1 for c in countries if c["isAggregate"]),
            "totalEntities": len(countries),
        },
        "methodology": METHODOLOGY,
        "source": "World Bank → IMF WEO → OECD EO → Eurostat → DBnomics → Proxy",
        "projectionEndYear": PROJECTION_END_YEAR,
        "projectionSources": store.get("projectionSources") if store else None,
        "oecdPublication": store.get("oecdPublication") if store else None,
        "fetchedAt": fetched_at,
        "liquidityAvailable": True,
    }


def get_snapshot_payload(
    *,
    year: int | None = None,
    region: str = "",
    income: str = "",
    show_aggregates: bool = True,
    featured_only: bool = False,
    search: str = "",
    tab: str = "",
    refresh: bool = False,
) -> dict[str, Any]:
    store = get_store(refresh=refresh)
    yr = year if year in store["years"] else store["defaultYear"]
    countries = filter_countries(
        store,
        region=region,
        income=income,
        show_aggregates=show_aggregates,
        featured_only=featured_only,
        search=search,
    )

    indicators = _indicator_list()
    if tab and tab in INDICATOR_TABS:
        indicators = [i for i in indicators if i["tab"] == tab]

    rows = []
    for c in countries:
        ind_map: dict[str, dict] = {}
        sources: set[str] = set()
        for ind in indicators:
            cell = get_cell(store, c["id"], ind["key"], yr)
            if cell:
                ind_map[ind["key"]] = cell
                if cell.get("source"):
                    sources.add(cell["source"])
        rows.append(
            {
                "id": c["id"],
                "name": c["name"],
                "iso3": c.get("iso3") or "",
                "region": c.get("region") or "",
                "income": c.get("income") or "",
                "isAggregate": c.get("isAggregate", False),
                "featured": c.get("featured", False),
                "indicators": ind_map,
                "sources": sorted(sources),
            }
        )

    regime = _us_regime(store, yr)
    return {
        "year": yr,
        "tab": tab or "overview",
        "rows": rows,
        "kpis": _kpis_for_year(store, yr),
        "regime": regime,
        "observations": _observations(store, yr),
        "equityImplications": _equity_implications(regime),
        "fetchedAt": store["fetchedAt"],
        "methodology": store["methodology"],
    }


def get_map_payload(
    *,
    metric: str,
    year: int | None = None,
    region: str = "",
    income: str = "",
    refresh: bool = False,
) -> dict[str, Any]:
    store = get_store(refresh=refresh)
    if metric not in INDICATORS:
        metric = "gdp_growth"
    yr = year if year in store["years"] else store["defaultYear"]
    meta = INDICATORS[metric]

    points = []
    for c in filter_countries(store, region=region, income=income, show_aggregates=False):
        iso3 = c.get("iso3")
        if not iso3 or len(iso3) != 3:
            continue
        cell = get_cell(store, c["id"], metric, yr)
        if not cell or cell.get("value") is None:
            continue
        points.append(
            {
                "id": c["id"],
                "name": c["name"],
                "iso3": iso3,
                "value": cell["value"],
                "source": cell.get("source"),
                "vintage": cell.get("vintage"),
            }
        )

    return {
        "metric": metric,
        "label": meta["label"],
        "unit": meta["unit"],
        "format": meta["format"],
        "year": yr,
        "points": points,
        "fetchedAt": store["fetchedAt"],
    }


def get_series_payload(
    *,
    indicator: str,
    entities: list[str],
    start_year: int | None = None,
    end_year: int | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    store = get_store(refresh=refresh)
    if indicator not in INDICATORS:
        indicator = "gdp_growth"
    meta = INDICATORS[indicator]
    years = store["years"]
    s = start_year or years[0]
    e = end_year or years[-1]
    year_range = [y for y in years if s <= y <= e]

    country_by_id = {c["id"]: c for c in store["countries"]}
    series: dict[str, Any] = {}
    for eid in entities[:24]:
        c = country_by_id.get(eid)
        if not c:
            continue
        pts = []
        for yr in year_range:
            cell = get_cell(store, eid, indicator, yr)
            if cell and cell.get("value") is not None:
                pts.append(
                    {
                        "year": yr,
                        "value": cell["value"],
                        "source": cell.get("source"),
                    }
                )
        if pts:
            series[eid] = {"name": c["name"], "points": pts}

    return {
        "indicator": indicator,
        "label": meta["label"],
        "format": meta["format"],
        "unit": meta["unit"],
        "startYear": s,
        "endYear": e,
        "series": series,
        "fetchedAt": store["fetchedAt"],
    }


def get_liquidity_api_payload(
    *,
    entity: str = "WLD",
    year: int | None = None,
    overlay: bool = False,
    refresh: bool = False,
) -> dict[str, Any]:
    return get_liquidity_payload(entity=entity, year=year, overlay=overlay, refresh=refresh)


def get_liquidity_map_api_payload(
    *,
    metric: str = "proxy",
    year: int | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    return get_liquidity_map_payload(metric=metric, year=year, refresh=refresh)