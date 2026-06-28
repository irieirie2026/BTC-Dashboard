"""Euro-area liquidity components via FRED when WB/IFS series are missing."""

from __future__ import annotations

from macro_data.fred_csv import fetch_fred_csv
from macro_data.liquidity_config import (
    COMPONENTS,
    EURO_AREA_AGGREGATE_IDS,
    EURO_AREA_COUNTRY_IDS,
    EURO_BM_FRED,
    EURO_BM_METHODOLOGY,
    EURO_CB_FRED,
    EURO_CB_FRED_SCALE,
    EURO_CB_METHODOLOGY,
    EURO_FX_FRED,
    FRED_COUNTRY_BM,
)

_EURO_CACHE: dict[str, dict[int, float]] | None = None


def clear_euro_cache() -> None:
    global _EURO_CACHE
    _EURO_CACHE = None


def _annual_last_by_year(series_id: str, *, refresh: bool = False) -> dict[int, float]:
    obs = fetch_fred_csv(series_id, refresh=refresh)
    by_year: dict[int, tuple[str, float]] = {}
    for date_str, value in obs:
        year = int(date_str[:4])
        prev = by_year.get(year)
        if prev is None or date_str >= prev[0]:
            by_year[year] = (date_str, value)
    return {year: val for year, (_, val) in by_year.items()}


def _load_euro_store(*, refresh: bool = False) -> dict[str, dict[int, float]]:
    global _EURO_CACHE
    if _EURO_CACHE is not None and not refresh:
        return _EURO_CACHE
    _EURO_CACHE = {
        "bm_eur": _annual_last_by_year(EURO_BM_FRED, refresh=refresh),
        "cb_eur_m": _annual_last_by_year(EURO_CB_FRED, refresh=refresh),
        "fx_usd_per_eur": _annual_last_by_year(EURO_FX_FRED, refresh=refresh),
    }
    return _EURO_CACHE


def _country_gdp_usd(store: dict, country: dict, year: int) -> float | None:
    from macro_data.liquidity_resolver import resolve_gdp_usd

    return resolve_gdp_usd(store, country, year)


def _euro_area_gdp_total(store: dict, year: int, countries: list[dict] | None = None) -> float:
    by_id = {c["id"]: c for c in (countries or [])}
    total = 0.0
    for cid in EURO_AREA_COUNTRY_IDS:
        country = by_id.get(cid) or {"id": cid, "listId": cid}
        gdp = _country_gdp_usd(store, country, year)
        if gdp:
            total += gdp
    return total


def _country_keys(country: dict) -> list[str]:
    keys: list[str] = []
    for key in (country.get("id"), country.get("listId")):
        if key and key not in keys:
            keys.append(key)
    return keys


def _is_euro_aggregate(country: dict) -> bool:
    return any(key in EURO_AREA_AGGREGATE_IDS for key in _country_keys(country))


def _is_euro_member(country: dict) -> bool:
    return country.get("id") in EURO_AREA_COUNTRY_IDS


def euro_gdp_share(
    store: dict,
    country: dict,
    year: int,
    *,
    countries: list[dict] | None = None,
) -> float | None:
    if not _is_euro_member(country):
        return None
    gdp = _country_gdp_usd(store, country, year)
    total = _euro_area_gdp_total(store, year, countries=countries)
    if gdp and total > 0:
        return gdp / total
    return None


def _resolve_bm_eur(bm_by_year: dict[int, float], year: int) -> float | None:
    if year in bm_by_year:
        return float(bm_by_year[year])
    if not bm_by_year:
        return None
    anchor_year = max(bm_by_year)
    if year < anchor_year:
        val = bm_by_year.get(year)
        return float(val) if val is not None else None

    years = sorted(bm_by_year)
    yoys: list[float] = []
    for i in range(1, len(years)):
        prev_y, cur_y = years[i - 1], years[i]
        prev_v = bm_by_year.get(prev_y)
        cur_v = bm_by_year.get(cur_y)
        if prev_v and cur_v and prev_v > 0:
            yoys.append((cur_v / prev_v - 1.0) * 100.0)
    growth = sum(yoys) / len(yoys) if yoys else 3.0

    cur = float(bm_by_year[anchor_year])
    for yr in range(anchor_year + 1, year + 1):
        cur *= 1.0 + growth / 100.0
    return cur


def _to_usd(
    euro_store: dict[str, dict[int, float]],
    year: int,
    *,
    eur_amount: float,
) -> float | None:
    fx = (euro_store.get("fx_usd_per_eur") or {}).get(year)
    if fx is None or fx <= 0:
        return None
    return float(eur_amount) * float(fx)


def resolve_fred_country_broad_money(
    store: dict,
    country: dict,
    year: int,
    *,
    refresh: bool = False,
) -> dict | None:
    cid = country.get("id")
    meta = FRED_COUNTRY_BM.get(cid or "")
    if not meta:
        return None

    bm_local = _resolve_bm_eur(
        _annual_last_by_year(meta["series"], refresh=refresh),
        year,
    )
    if bm_local is None:
        return None

    fx_by_year = _annual_last_by_year(meta["fx_series"], refresh=refresh)
    fx = fx_by_year.get(year)
    if fx is None and fx_by_year:
        fx = fx_by_year[max(fx_by_year)]
    if fx is None or fx <= 0:
        return None

    if meta.get("fx_divide"):
        usd = float(bm_local) / float(fx)
    else:
        usd = float(bm_local) * float(fx)

    if usd <= 0:
        return None
    return {
        "value": usd,
        "source": "Proxy",
        "methodology": meta.get("methodology"),
    }


def resolve_euro_broad_money(
    store: dict,
    country: dict,
    year: int,
    *,
    refresh: bool = False,
) -> dict | None:
    if not (_is_euro_member(country) or _is_euro_aggregate(country)):
        return None

    euro = _load_euro_store(refresh=refresh)
    bm_eur = _resolve_bm_eur(euro.get("bm_eur") or {}, year)
    if bm_eur is None:
        return None

    if _is_euro_aggregate(country):
        usd = _to_usd(euro, year, eur_amount=bm_eur)
    else:
        share = euro_gdp_share(store, country, year)
        if share is None:
            return None
        usd = _to_usd(euro, year, eur_amount=bm_eur * share)

    if usd is None or usd <= 0:
        return None
    return {
        "value": usd,
        "source": "Proxy",
        "methodology": EURO_BM_METHODOLOGY,
    }


def resolve_euro_cb_balance_sheet(
    store: dict,
    country: dict,
    year: int,
    *,
    refresh: bool = False,
) -> dict | None:
    if not (_is_euro_member(country) or _is_euro_aggregate(country)):
        return None

    euro = _load_euro_store(refresh=refresh)
    cb_raw = (euro.get("cb_eur_m") or {}).get(year)
    if cb_raw is None:
        return None
    cb_eur = float(cb_raw) * EURO_CB_FRED_SCALE

    if _is_euro_aggregate(country):
        usd = _to_usd(euro, year, eur_amount=cb_eur)
    else:
        share = euro_gdp_share(store, country, year)
        if share is None:
            return None
        usd = _to_usd(euro, year, eur_amount=cb_eur * share)

    if usd is None or usd <= 0:
        return None
    return {
        "value": usd,
        "source": "Proxy",
        "methodology": EURO_CB_METHODOLOGY,
    }