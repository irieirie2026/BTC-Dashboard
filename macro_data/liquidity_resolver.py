"""4-tier liquidity component resolver: WB → IMF IFS → DBnomics → Proxy."""

from __future__ import annotations

from typing import Any

from macro_data.config import PROJECTION_END_YEAR
from macro_data.imf import imf_code_for_country
from macro_data.imf_ifs import ifs_lookup
from macro_data.imf_weo import fetch_indicator_series
from macro_data.liquidity_config import (
    BROAD_MONEY_PROXY_METHODOLOGY,
    CB_PROXY_METHODOLOGY,
    CB_PROXY_RATIO,
    COMPONENTS,
    FX_RESERVES_PROXY_METHODOLOGY,
)
from macro_data.liquidity_euro import (
    resolve_euro_broad_money,
    resolve_euro_cb_balance_sheet,
    resolve_fred_country_broad_money,
)

_GDP_IMF_CACHE: dict[str, dict[int, float]] | None = None
_GDP_GROWTH_CACHE: dict[str, dict[int, float]] | None = None


def clear_gdp_cache() -> None:
    global _GDP_IMF_CACHE, _GDP_GROWTH_CACHE
    _GDP_IMF_CACHE = None
    _GDP_GROWTH_CACHE = None


def _imf_gdp_table(refresh: bool = False) -> dict[str, dict[int, float]]:
    global _GDP_IMF_CACHE
    if _GDP_IMF_CACHE is not None and not refresh:
        return _GDP_IMF_CACHE
    try:
        _GDP_IMF_CACHE = fetch_indicator_series(
            "NGDPD", end_year=PROJECTION_END_YEAR + 1, refresh=refresh
        )
    except Exception:
        _GDP_IMF_CACHE = {}
    return _GDP_IMF_CACHE


def _imf_nominal_growth_table(refresh: bool = False) -> dict[str, dict[int, float]]:
    global _GDP_GROWTH_CACHE
    if _GDP_GROWTH_CACHE is not None and not refresh:
        return _GDP_GROWTH_CACHE
    try:
        _GDP_GROWTH_CACHE = fetch_indicator_series(
            "NGDP_RPCH", end_year=PROJECTION_END_YEAR + 1, refresh=refresh
        )
    except Exception:
        _GDP_GROWTH_CACHE = {}
    return _GDP_GROWTH_CACHE


def resolve_gdp_usd(
    store: dict,
    country: dict,
    year: int,
    *,
    refresh: bool = False,
) -> float | None:
    """Nominal GDP in USD: WB WDI → IMF WEO NGDPD → growth extrapolation from latest WB."""
    bm_cfg = COMPONENTS["broad_money"]
    cid = country["id"]
    list_id = country.get("listId") or ""
    gdp = _wb_years(store, bm_cfg["wb_gdp_usd"], cid, list_id).get(year)
    if gdp is not None and gdp > 0:
        return float(gdp)

    code = imf_code_for_country(country)
    if code:
        imf_val = (_imf_gdp_table(refresh=refresh).get(code) or {}).get(year)
        if imf_val is not None and imf_val > 0:
            return float(imf_val)

    wb_data = _wb_years(store, bm_cfg["wb_gdp_usd"], cid, list_id)
    if not wb_data:
        return None
    anchor_year = max(wb_data)
    anchor_gdp = wb_data.get(anchor_year)
    if anchor_gdp is None or anchor_gdp <= 0:
        return None
    if year <= anchor_year:
        val = wb_data.get(year)
        return float(val) if val and val > 0 else None

    cur = float(anchor_gdp)
    growth = _imf_nominal_growth_table(refresh=refresh)
    for yr in range(anchor_year + 1, year + 1):
        g = (growth.get(code) or {}).get(yr) if code else None
        if g is None:
            g = 0.0
        cur *= 1.0 + float(g) / 100.0
    return cur


def _prev_broad_money_value(
    store: dict,
    country: dict,
    year: int,
    bm_val: float | None,
    *,
    refresh: bool = False,
) -> float | None:
    prev_cell = resolve_broad_money(store, country, year - 1)
    if prev_cell and prev_cell.get("value") is not None:
        return float(prev_cell["value"])
    if bm_val is None:
        return None
    code = imf_code_for_country(country)
    if not code:
        return None
    g = (_imf_nominal_growth_table(refresh=refresh).get(code) or {}).get(year)
    if g is None:
        return None
    return float(bm_val) / (1.0 + float(g) / 100.0)


def _cell(value: float | None, source: str, *, methodology: str | None = None) -> dict | None:
    if value is None:
        return None
    return {
        "value": value,
        "source": source,
        "methodology": methodology,
    }


def _wb_years(store: dict, code: str, country_id: str, list_id: str = "") -> dict[int, float]:
    buckets = store["wb"].get(code) or {}
    data = buckets.get(country_id) or {}
    if not data and list_id:
        data = buckets.get(list_id) or {}
    return data


def _dbn_cb(store: dict, country_id: str, list_id: str, year: int) -> float | None:
    cb_dbn = store.get("cb_dbn") or {}
    val = (cb_dbn.get(country_id) or {}).get(year)
    if val is not None:
        return val
    if list_id:
        return (cb_dbn.get(list_id) or {}).get(year)
    return None


def resolve_fx_reserves(store: dict, country: dict, year: int) -> dict | None:
    cid = country["id"]
    list_id = country.get("listId") or ""
    fx_cfg = COMPONENTS["fx_reserves"]

    ifs_val = ifs_lookup(store.get("ifs") or {}, "fx_reserves", country, year)
    if ifs_val is not None:
        return _cell(ifs_val, "IMF")

    total = _wb_years(store, fx_cfg["wb_total"], cid, list_id).get(year)
    if total is None:
        return None
    gold = _wb_years(store, fx_cfg["wb_gold"], cid, list_id).get(year)
    if gold is not None and gold <= total:
        return _cell(total - gold, "WB", methodology=None)
    return _cell(total, "WB", methodology=FX_RESERVES_PROXY_METHODOLOGY)


def resolve_broad_money(store: dict, country: dict, year: int) -> dict | None:
    cid = country["id"]
    list_id = country.get("listId") or ""
    bm_cfg = COMPONENTS["broad_money"]

    ifs_val = ifs_lookup(store.get("ifs") or {}, "broad_money", country, year)
    if ifs_val is not None:
        return _cell(ifs_val, "IMF")

    level = _wb_years(store, bm_cfg["wb_level_lcu"], cid, list_id).get(year)
    fx = _wb_years(store, bm_cfg["wb_fx"], cid, list_id).get(year)
    if level is not None and fx and fx > 0:
        return _cell(level / fx, "WB")

    gdp = _wb_years(store, bm_cfg["wb_gdp_usd"], cid, list_id).get(year)
    ratio = _wb_years(store, bm_cfg["wb_gdp_ratio"], cid, list_id).get(year)
    if gdp is not None and ratio is not None:
        return _cell(gdp * ratio / 100.0, "Proxy", methodology=BROAD_MONEY_PROXY_METHODOLOGY)

    fred_bm = resolve_fred_country_broad_money(store, country, year)
    if fred_bm is not None:
        return fred_bm

    euro = resolve_euro_broad_money(store, country, year)
    if euro is not None:
        return euro
    return None


def resolve_cb_balance_sheet(
    store: dict,
    country: dict,
    year: int,
    broad_money: dict | None,
) -> dict | None:
    cid = country["id"]
    list_id = country.get("listId") or ""

    dbn = _dbn_cb(store, cid, list_id, year)
    if dbn is not None:
        return _cell(dbn, "DB")

    ifs_val = ifs_lookup(store.get("ifs") or {}, "cb_balance_sheet", country, year)
    if ifs_val is not None:
        return _cell(ifs_val, "IMF")

    euro_cb = resolve_euro_cb_balance_sheet(store, country, year)
    if euro_cb is not None:
        return _cell(
            euro_cb["value"],
            euro_cb.get("source") or "Proxy",
            methodology=euro_cb.get("methodology"),
        )

    if broad_money and broad_money.get("value") is not None:
        return _cell(
            broad_money["value"] * CB_PROXY_RATIO,
            "Proxy",
            methodology=CB_PROXY_METHODOLOGY,
        )
    return None


def resolve_country_components(store: dict, country: dict, year: int) -> dict[str, dict | None]:
    bm = resolve_broad_money(store, country, year)
    return {
        "fx_reserves": resolve_fx_reserves(store, country, year),
        "broad_money": bm,
        "cb_balance_sheet": resolve_cb_balance_sheet(store, country, year, bm),
    }


def compute_derived(
    store: dict,
    country: dict,
    year: int,
    components: dict[str, dict | None],
    *,
    refresh: bool = False,
    growth_pct: float | None = None,
) -> dict[str, float | None]:
    gdp = resolve_gdp_usd(store, country, year, refresh=refresh)

    cb = components.get("cb_balance_sheet")
    bm = components.get("broad_money")
    cb_val = cb.get("value") if cb else None
    bm_val = bm.get("value") if bm else None

    cb_to_gdp = (cb_val / gdp * 100.0) if cb_val is not None and gdp and gdp > 0 else None
    money_to_gdp = (bm_val / gdp * 100.0) if bm_val is not None and gdp and gdp > 0 else None

    impulse = None
    if gdp and gdp > 0 and bm_val is not None:
        prev_bm = _prev_broad_money_value(store, country, year, bm_val, refresh=refresh)
        if prev_bm is None and growth_pct is not None:
            prev_bm = float(bm_val) / (1.0 + float(growth_pct) / 100.0)
        if prev_bm is not None:
            impulse = (bm_val - prev_bm) / gdp * 100.0

    return {
        "cb_to_gdp": cb_to_gdp,
        "money_to_gdp": money_to_gdp,
        "liquidity_impulse": impulse,
    }


def _member_gdp_sum(
    store: dict,
    members: list[dict],
    year: int,
    *,
    refresh: bool = False,
) -> float:
    total = 0.0
    for m in members:
        gdp = resolve_gdp_usd(store, m, year, refresh=refresh)
        if gdp:
            total += gdp
    return total


def compute_derived_aggregate(
    store: dict,
    members: list[dict],
    year: int,
    components: dict[str, dict | None],
    *,
    refresh: bool = False,
    growth_pct: float | None = None,
) -> dict[str, float | None]:
    gdp = _member_gdp_sum(store, members, year, refresh=refresh)
    cb = components.get("cb_balance_sheet")
    bm = components.get("broad_money")
    cb_val = cb.get("value") if cb else None
    bm_val = bm.get("value") if bm else None

    cb_to_gdp = (cb_val / gdp * 100.0) if cb_val is not None and gdp > 0 else None
    money_to_gdp = (bm_val / gdp * 100.0) if bm_val is not None and gdp > 0 else None

    impulse = None
    if gdp > 0 and bm_val is not None:
        prev_bm_sum = 0.0
        have_prev = False
        for m in members:
            cur_cell = resolve_broad_money(store, m, year)
            cur_bm = cur_cell.get("value") if cur_cell else None
            prev_bm = _prev_broad_money_value(store, m, year, cur_bm, refresh=refresh)
            if prev_bm is not None:
                prev_bm_sum += prev_bm
                have_prev = True
        if not have_prev and bm_val is not None:
            if growth_pct is not None:
                prev_bm_sum = bm_val / (1.0 + float(growth_pct) / 100.0)
                have_prev = True
            else:
                bm_cell = components.get("broad_money")
                if bm_cell and bm_cell.get("source") == "Proj":
                    growth_sum = 0.0
                    growth_n = 0
                    growth = _imf_nominal_growth_table(refresh=refresh)
                    for m in members:
                        code = imf_code_for_country(m)
                        if not code:
                            continue
                        g = (growth.get(code) or {}).get(year)
                        if g is not None:
                            growth_sum += float(g)
                            growth_n += 1
                    if growth_n > 0:
                        prev_bm_sum = bm_val / (1.0 + growth_sum / growth_n / 100.0)
                        have_prev = True
        if have_prev:
            impulse = (bm_val - prev_bm_sum) / gdp * 100.0

    return {
        "cb_to_gdp": cb_to_gdp,
        "money_to_gdp": money_to_gdp,
        "liquidity_impulse": impulse,
    }


def coverage_stats(rows: list[dict]) -> dict[str, Any]:
    counts: dict[str, int] = {"WB": 0, "IMF": 0, "DB": 0, "Proxy": 0, "Proj": 0}
    total = 0
    for row in rows:
        for comp in (row.get("components") or {}).values():
            if not comp or comp.get("value") is None:
                continue
            total += 1
            src = comp.get("source") or "WB"
            counts[src] = counts.get(src, 0) + 1
    estimated = counts.get("Proxy", 0) + counts.get("Proj", 0)
    proxy_pct = round(100.0 * estimated / total, 1) if total else 0.0
    return {
        "componentCells": total,
        "bySource": counts,
        "proxySharePct": proxy_pct,
    }