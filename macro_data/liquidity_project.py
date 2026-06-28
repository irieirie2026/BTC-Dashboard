"""
Forward projections for liquidity proxy through PROJECTION_END_YEAR (annual + monthly).
Uses IMF WEO real GDP growth to extrapolate the stock when WDI components stop.
"""

from __future__ import annotations

import calendar
import time
from typing import Any

from macro_data.config import PROJECTION_END_MONTH, PROJECTION_END_YEAR
from macro_data.imf import imf_code_for_country
from macro_data.imf_weo import fetch_indicator_series
from macro_data.oecd_eo import fetch_measure_series, oecd_lookup
from macro_data.liquidity_config import LIQUIDITY_ENTITIES, LIQUIDITY_START_YEAR
from macro_data.liquidity_monthly import MONTHLY_LIQUIDITY_AGGREGATES
from macro_data.liquidity_resolver import resolve_country_components

_GROWTH_CACHE: dict[str, dict[str, dict[int, float]]] | None = None
_OECD_GROWTH_CACHE: dict[str, dict[int, float]] | None = None

PROJ_METHODOLOGY = (
    "IMF WEO / OECD EO real GDP growth applied to the latest observed liquidity proxy stock. "
    "Components scaled proportionally. Monthly path holds the latest 3m SAR momentum flat."
)


def _growth_table(refresh: bool = False) -> dict[str, dict[int, float]]:
    global _GROWTH_CACHE
    if _GROWTH_CACHE is not None and not refresh:
        return _GROWTH_CACHE.get("NGDP_RPCH") or {}
    try:
        data = fetch_indicator_series("NGDP_RPCH", end_year=PROJECTION_END_YEAR + 1, refresh=refresh)
    except Exception:
        data = {}
    _GROWTH_CACHE = {"NGDP_RPCH": data}
    return data


def _month_add(month_key: str, delta: int = 1) -> str:
    y, m = int(month_key[:4]), int(month_key[5:7])
    m += delta
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return f"{y:04d}-{m:02d}"


def _entity_growth_pct(
    entity_id: str,
    year: int,
    countries: list[dict],
    entity_countries_fn,
    growth: dict[str, dict[int, float]],
    *,
    oecd_growth: dict[str, dict[int, float]] | None = None,
) -> float | None:
    meta = LIQUIDITY_ENTITIES.get(entity_id)
    if meta and meta.get("type") == "wb_aggregate":
        for wid in meta.get("wb_ids") or []:
            c = next((x for x in countries if x["id"] == wid or x.get("listId") == wid), None)
            if c:
                code = imf_code_for_country(c)
                if code:
                    val = (growth.get(code) or {}).get(year)
                    if val is not None:
                        return float(val)
        return None

    members = entity_countries_fn(entity_id, countries)
    if not members:
        c = next((x for x in countries if x["id"] == entity_id or x.get("listId") == entity_id), None)
        members = [c] if c else []

    weighted = 0.0
    total_w = 0.0
    for m in members:
        g = _country_growth_pct(m, year, growth, oecd_growth=oecd_growth)
        if g is None:
            continue
        weighted += float(g)
        total_w += 1.0
    if total_w > 0:
        return weighted / total_w

    if entity_id in MONTHLY_LIQUIDITY_AGGREGATES:
        for key in MONTHLY_LIQUIDITY_AGGREGATES[entity_id]:
            g = _entity_growth_pct(
                key, year, countries, entity_countries_fn, growth, oecd_growth=oecd_growth
            )
            if g is not None:
                return g
    return None


def _sum_proxy(
    components: dict[str, dict | None],
) -> tuple[float | None, list[str], str | None]:
    total = 0.0
    have = False
    sources: set[str] = set()
    proxy_notes: list[str] = []
    for comp in components.values():
        if not comp or comp.get("value") is None:
            continue
        total += float(comp["value"])
        have = True
        if comp.get("source"):
            sources.add(comp["source"])
        if comp.get("source") == "Proxy" and comp.get("methodology"):
            proxy_notes.append(comp["methodology"])
    if not have:
        return None, [], None
    methodology = "; ".join(dict.fromkeys(proxy_notes)) if proxy_notes else None
    return total, sorted(sources), methodology


def _oecd_growth_table(refresh: bool = False) -> dict[str, dict[int, float]]:
    global _OECD_GROWTH_CACHE
    if _OECD_GROWTH_CACHE is not None and not refresh:
        return _OECD_GROWTH_CACHE
    try:
        _OECD_GROWTH_CACHE = fetch_measure_series("GDPV_ANNPCT", refresh=refresh)
    except Exception:
        _OECD_GROWTH_CACHE = {}
    return _OECD_GROWTH_CACHE


def _country_growth_pct(
    country: dict,
    year: int,
    growth: dict[str, dict[int, float]],
    *,
    oecd_growth: dict[str, dict[int, float]] | None = None,
) -> float | None:
    code = imf_code_for_country(country)
    if code:
        val = (growth.get(code) or {}).get(year)
        if val is not None:
            return float(val)
    if oecd_growth:
        val = oecd_lookup(oecd_growth, country, year)
        if val is not None:
            return float(val)
    return None


def resolve_projected_country_proxy(
    store: dict,
    country: dict,
    year: int,
    *,
    refresh: bool = False,
) -> tuple[float | None, dict[str, dict | None], list[str], str | None, bool]:
    """Resolve liquidity proxy for a country/year, projecting forward when WB/IFS data ends."""
    comps = resolve_country_components(store, country, year)
    proxy, sources, methodology = _sum_proxy(comps)
    if proxy is not None:
        return proxy, comps, sources, methodology, False

    anchor_year: int | None = None
    anchor_comps: dict[str, dict | None] | None = None
    anchor_proxy: float | None = None
    for yr in range(year, LIQUIDITY_START_YEAR - 1, -1):
        candidate = resolve_country_components(store, country, yr)
        p, _, _ = _sum_proxy(candidate)
        if p is not None:
            anchor_year = yr
            anchor_comps = candidate
            anchor_proxy = p
            break

    if anchor_year is None or anchor_comps is None or anchor_proxy is None:
        return None, comps, [], None, False

    if year <= anchor_year:
        p, s, m = _sum_proxy(anchor_comps)
        return p, anchor_comps, s, m, False

    growth = _growth_table(refresh=refresh)
    oecd_growth = _oecd_growth_table(refresh=refresh)
    cur_proxy = float(anchor_proxy)
    cur_comps = anchor_comps
    for yr in range(anchor_year + 1, year + 1):
        g = _country_growth_pct(country, yr, growth, oecd_growth=oecd_growth)
        if g is None:
            g = 0.0
        cur_proxy *= 1.0 + g / 100.0
        scale = cur_proxy / anchor_proxy if anchor_proxy else 1.0
        cur_comps = _scale_components(anchor_comps, scale)

    return cur_proxy, cur_comps, ["Proj"], PROJ_METHODOLOGY, True


def _scale_components(components: dict, factor: float) -> dict:
    out: dict[str, dict] = {}
    for key, cell in (components or {}).items():
        if not cell or cell.get("value") is None:
            out[key] = cell
            continue
        out[key] = {
            **cell,
            "value": float(cell["value"]) * factor,
            "source": "Proj",
            "methodology": PROJ_METHODOLOGY,
        }
    return out


def project_annual_series(
    entity: dict[str, Any],
    entity_id: str,
    countries: list[dict],
    entity_countries_fn,
    *,
    refresh: bool = False,
) -> None:
    series = entity.get("series") or []
    if not series:
        return

    growth = _growth_table(refresh=refresh)
    oecd_growth = _oecd_growth_table(refresh=refresh)
    last_actual = next((p for p in reversed(series) if not p.get("projected")), series[-1])
    anchor_year = int(last_actual["year"])
    if anchor_year >= PROJECTION_END_YEAR:
        return

    anchor_proxy = float(last_actual["proxy"])
    anchor_components = last_actual.get("components") or {}
    cur_proxy = anchor_proxy

    for yr in range(anchor_year + 1, PROJECTION_END_YEAR + 1):
        if any(int(p["year"]) == yr for p in series):
            continue
        g = _entity_growth_pct(
            entity_id, yr, countries, entity_countries_fn, growth, oecd_growth=oecd_growth
        )
        if g is None:
            yoy = last_actual.get("yoy")
            g = float(yoy) if yoy is not None else 0.0
        factor = 1.0 + g / 100.0
        cur_proxy *= factor
        point = {
            "year": yr,
            "proxy": cur_proxy,
            "components": _scale_components(anchor_components, cur_proxy / anchor_proxy if anchor_proxy else 1.0),
            "sources": ["Proj"],
            "methodology": PROJ_METHODOLOGY,
            "projected": True,
            "growthAssumption": g,
        }
        series.append(point)

    series.sort(key=lambda p: p["year"])
    # Recompute YoY / momentum on full series
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
                pt["momentum3m"] = (yoy - prev_yoy) / 4 if prev_yoy is not None else yoy / 4
            else:
                pt["momentum3m"] = yoy / 4
        else:
            pt["yoy"] = None
            pt["momentum3m"] = None

    entity["series"] = series
    entity["latest"] = series[-1] if series else None
    entity["projectionEndYear"] = PROJECTION_END_YEAR


def project_monthly_block(monthly: dict[str, Any] | None) -> None:
    if not monthly:
        return
    points = list(monthly.get("points") or [])
    if not points:
        return

    last = next((p for p in reversed(points) if not p.get("projected")), points[-1])
    last_month = last.get("month") or ""
    if last_month >= PROJECTION_END_MONTH:
        monthly["points"] = points
        return

    sar = last.get("sar3m")
    yoy = last.get("yoy")
    if sar is not None:
        monthly_factor = (1.0 + float(sar) / 100.0) ** (1.0 / 12.0)
    elif yoy is not None:
        monthly_factor = (1.0 + float(yoy) / 100.0) ** (1.0 / 12.0)
    else:
        monthly_factor = 1.0

    cur_proxy = float(last.get("proxy") or 0)
    cur_month = _month_add(last_month, 1)
    projected: list[dict] = []

    while cur_month <= PROJECTION_END_MONTH:
        cur_proxy *= monthly_factor
        projected.append(
            {
                "month": cur_month,
                "proxy": cur_proxy,
                "components": last.get("components"),
                "projected": True,
                "sar3m": sar,
                "yoy": yoy,
                "methodology": PROJ_METHODOLOGY,
            }
        )
        cur_month = _month_add(cur_month, 1)

    if projected:
        # Recompute SAR/YoY on tail for chart consistency
        combined = points + projected
        _recompute_monthly_growth(combined)
        monthly["points"] = combined[-120:]
        monthly["latest"] = combined[-1]
        monthly["projectionEndMonth"] = PROJECTION_END_MONTH
        monthly["hasProjection"] = True


def _recompute_monthly_growth(points: list[dict]) -> None:
    for i, pt in enumerate(points):
        if i < 3:
            pt["sar3m"] = pt.get("sar3m") if pt.get("projected") else None
        else:
            cur = pt.get("proxy")
            prev = points[i - 3].get("proxy")
            if cur and prev and prev > 0:
                pt["sar3m"] = ((cur / prev) ** 4 - 1) * 100
        if i < 12:
            if not pt.get("projected"):
                pt["yoy"] = None
            continue
        cur = pt.get("proxy")
        prev = points[i - 12].get("proxy")
        if cur and prev and prev > 0:
            pt["yoy"] = (cur / prev - 1) * 100


def clear_projection_cache() -> None:
    global _GROWTH_CACHE, _OECD_GROWTH_CACHE
    _GROWTH_CACHE = None
    _OECD_GROWTH_CACHE = None


def apply_liquidity_projections(
    entity: dict[str, Any],
    monthly: dict[str, Any] | None,
    entity_id: str,
    countries: list[dict],
    entity_countries_fn,
    *,
    refresh: bool = False,
) -> None:
    project_annual_series(entity, entity_id, countries, entity_countries_fn, refresh=refresh)
    if monthly is not None:
        project_monthly_block(monthly)