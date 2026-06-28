"""
Monthly liquidity proxy + true 3-month seasonally-adjusted annualized rate (3m SAR).

Uses FRED public CSV for high-frequency CB / money series (USD, JPY, EUR converted to USD).
FX reserves fall back to annual WB values forward-filled to monthly when no monthly feed exists.
"""

from __future__ import annotations

from typing import Any

from macro_data.fred_csv import fetch_fred_csv
from macro_data.liquidity_config import LIQUIDITY_METHODOLOGY, MONTHLY_LIQUIDITY_FEEDS
from macro_data.liquidity_resolver import resolve_country_components

_HEADERS = {"User-Agent": "BTC-MacroDrivers/2.0"}


def _month_key(date_str: str) -> str:
    return date_str[:7]


def _obs_to_monthly(obs: list[tuple[str, float]], *, freq: str) -> dict[str, float]:
    """Collapse daily/weekly observations to last-in-month buckets (YYYY-MM)."""
    if freq == "monthly":
        return {_month_key(d): v for d, v in obs}
    buckets: dict[str, tuple[str, float]] = {}
    for d, v in obs:
        mk = _month_key(d)
        if mk not in buckets or d >= buckets[mk][0]:
            buckets[mk] = (d, v)
    return {mk: val for mk, (_, val) in buckets.items()}


def _forward_fill(months: list[str], values: dict[str, float | None]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    last: float | None = None
    for m in months:
        if values.get(m) is not None:
            last = values[m]
        out[m] = last
    return out


def _sorted_months(*series: dict[str, float | None]) -> list[str]:
    keys: set[str] = set()
    for s in series:
        keys.update(s.keys())
    return sorted(keys)


def _convert_to_usd(
    values: dict[str, float],
    *,
    currency: str,
    fx_series_id: str | None,
    refresh: bool,
) -> dict[str, float]:
    if currency == "USD":
        return values
    if not fx_series_id:
        return {}
    fx_obs = fetch_fred_csv(fx_series_id, refresh=refresh)
    fx_monthly = _obs_to_monthly(fx_obs, freq="monthly")
    out: dict[str, float] = {}
    for mk, val in values.items():
        rate = fx_monthly.get(mk)
        if rate and rate > 0:
            if currency == "JPY":
                out[mk] = val / rate
            elif currency == "EUR":
                out[mk] = val * rate
            else:
                out[mk] = val
    return out


def _annual_fx_monthly(
    store: dict,
    country: dict,
    months: list[str],
) -> dict[str, float | None]:
    """Forward-fill annual FX reserves (USD) to monthly grid."""
    out: dict[str, float | None] = {m: None for m in months}
    by_year: dict[int, float] = {}
    for m in months:
        yr = int(m[:4])
        if yr in by_year:
            out[m] = by_year[yr]
            continue
        comps = resolve_country_components(store, country, yr)
        cell = comps.get("fx_reserves")
        val = cell.get("value") if cell else None
        by_year[yr] = val
        out[m] = val
    return _forward_fill(months, out)


def _load_component_monthly(
    spec: dict,
    *,
    months: list[str],
    store: dict,
    country: dict | None,
    refresh: bool,
) -> dict[str, float | None]:
    if spec.get("from_annual"):
        if not country:
            return {m: None for m in months}
        return _annual_fx_monthly(store, country, months)

    fred_id = spec.get("fred_id")
    if not fred_id:
        return {m: None for m in months}

    obs = fetch_fred_csv(fred_id, refresh=refresh)
    if not obs:
        return {m: None for m in months}

    monthly = _obs_to_monthly(obs, freq=spec.get("freq", "monthly"))
    scale = spec.get("scale", 1.0)
    scaled = {mk: v * scale for mk, v in monthly.items()}
    currency = spec.get("currency", "USD")
    fx_id = spec.get("fx_series")
    usd = _convert_to_usd(scaled, currency=currency, fx_series_id=fx_id, refresh=refresh)

    aligned: dict[str, float | None] = {m: usd.get(m) for m in months}
    return _forward_fill(months, aligned)


def _compute_sar3m(points: list[dict]) -> None:
    for i, pt in enumerate(points):
        if i < 3:
            pt["sar3m"] = None
            continue
        cur = pt.get("proxy")
        prev = points[i - 3].get("proxy")
        if cur and prev and prev > 0:
            pt["sar3m"] = ((cur / prev) ** 4 - 1) * 100
        else:
            pt["sar3m"] = None


def _compute_monthly_yoy(points: list[dict]) -> None:
    for i, pt in enumerate(points):
        if i < 12:
            pt["yoy"] = None
            continue
        cur = pt.get("proxy")
        prev = points[i - 12].get("proxy")
        if cur and prev and prev > 0:
            pt["yoy"] = (cur / prev - 1) * 100
        else:
            pt["yoy"] = None


def _resolve_monthly_entity(entity_id: str) -> str | list[str] | None:
    """Map view entity to monthly feed key(s)."""
    if entity_id in MONTHLY_LIQUIDITY_FEEDS:
        return entity_id
    aliases = {
        "DE": "EMU",
        "FR": "EMU",
        "IT": "EMU",
        "ES": "EMU",
        "NL": "EMU",
        "BE": "EMU",
        "AT": "EMU",
        "FI": "EMU",
        "PT": "EMU",
        "IE": "EMU",
        "GR": "EMU",
    }
    if entity_id in aliases:
        return aliases[entity_id]
    if entity_id == "WLD":
        return MONTHLY_LIQUIDITY_AGGREGATES.get("WLD", [])
    if entity_id == "ADV":
        return MONTHLY_LIQUIDITY_AGGREGATES.get("ADV", [])
    if entity_id == "EM":
        return MONTHLY_LIQUIDITY_AGGREGATES.get("EM", [])
    return None


# Country blocks included in global monthly aggregates.
MONTHLY_LIQUIDITY_AGGREGATES: dict[str, list[str]] = {
    "WLD": ["US", "JP", "EMU"],
    "ADV": ["US", "JP", "EMU"],
    "EM": [],
}


def _build_country_monthly(
    feed_key: str,
    store: dict,
    countries: list[dict],
    *,
    refresh: bool,
    start_month: str = "2003-01",
) -> dict[str, Any] | None:
    cfg = MONTHLY_LIQUIDITY_FEEDS.get(feed_key)
    if not cfg:
        return None

    country = None
    country_id = cfg.get("country_id")
    if country_id:
        country = next((c for c in countries if c["id"] == country_id), None)

    # Bootstrap month grid from US WALCL (longest high-frequency feed).
    seed = fetch_fred_csv("WALCL", refresh=refresh)
    seed_months = sorted(_obs_to_monthly(seed, freq="weekly").keys())
    months = [m for m in seed_months if m >= start_month]
    if len(months) < 15:
        return None

    comp_monthly: dict[str, dict[str, float | None]] = {}
    comp_sources: dict[str, str] = {}
    for comp_key, spec in cfg.get("components", {}).items():
        comp_monthly[comp_key] = _load_component_monthly(
            spec,
            months=months,
            store=store,
            country=country,
            refresh=refresh,
        )
        comp_sources[comp_key] = spec.get("source", "FRED")

    points: list[dict] = []
    for m in months:
        comps: dict[str, dict | None] = {}
        total = 0.0
        have = False
        for ck, series in comp_monthly.items():
            val = series.get(m)
            if val is None:
                comps[ck] = None
                continue
            comps[ck] = {"value": val, "source": comp_sources.get(ck, "FRED")}
            total += val
            have = True
        if not have:
            continue
        points.append({"month": m, "proxy": total, "components": comps})

    if len(points) < 15:
        return None

    _compute_sar3m(points)
    _compute_monthly_yoy(points)
    latest = points[-1]
    monthly_components = sum(1 for ck in cfg.get("components", {}) if cfg["components"][ck].get("fred_id"))
    return {
        "entity": feed_key,
        "label": cfg.get("label", feed_key),
        "frequency": "monthly",
        "points": points[-120:],
        "latest": latest,
        "coverage": {
            "monthlyComponents": monthly_components,
            "totalComponents": len(cfg.get("components", {})),
            "method": cfg.get("method", "FRED monthly"),
        },
        "source": "FRED monthly → USD",
    }


def _merge_aggregate_monthly(blocks: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not blocks:
        return None
    month_set: set[str] = set()
    for b in blocks:
        for p in b.get("points") or []:
            month_set.add(p["month"])
    months = sorted(month_set)
    if len(months) < 15:
        return None

    points: list[dict] = []
    for m in months:
        total = 0.0
        have = False
        sources: set[str] = set()
        for b in blocks:
            pt = next((p for p in b.get("points", []) if p["month"] == m), None)
            if pt and pt.get("proxy") is not None:
                total += pt["proxy"]
                have = True
                for c in (pt.get("components") or {}).values():
                    if c and c.get("source"):
                        sources.add(c["source"])
        if not have:
            continue
        points.append({"month": m, "proxy": total, "sources": sorted(sources)})

    if len(points) < 15:
        return None

    _compute_sar3m(points)
    _compute_monthly_yoy(points)
    return {
        "entity": "aggregate",
        "label": "Monthly aggregate",
        "frequency": "monthly",
        "points": points[-120:],
        "latest": points[-1],
        "coverage": {
            "blocks": [b.get("label") for b in blocks],
            "blockCount": len(blocks),
            "method": "Sum of monthly country proxies (USD)",
        },
        "source": "FRED monthly → USD",
    }


def build_entity_monthly(
    entity_id: str,
    store: dict,
    countries: list[dict],
    *,
    refresh: bool = False,
) -> dict[str, Any] | None:
    """Build monthly proxy + 3m SAR for an entity, or None if no monthly feeds."""
    resolved = _resolve_monthly_entity(entity_id)
    if resolved is None:
        return None

    if isinstance(resolved, list):
        blocks = []
        for key in resolved:
            block = _build_country_monthly(key, store, countries, refresh=refresh)
            if block:
                blocks.append(block)
        agg = _merge_aggregate_monthly(blocks)
        if agg:
            agg["entity"] = entity_id
            labels = [b.get("label", "") for b in blocks]
            agg["label"] = " + ".join(labels) if labels else entity_id
            agg["methodology"] = LIQUIDITY_METHODOLOGY.get("momentumMonthly", "")
        return agg

    return _build_country_monthly(resolved, store, countries, refresh=refresh)


def attach_monthly_momentum(global_entity: dict[str, Any], monthly: dict[str, Any] | None) -> None:
    """Overlay true 3m SAR on annual series latest point when monthly data exists."""
    if not monthly or not global_entity:
        return
    latest_m = monthly.get("latest") or {}
    sar = latest_m.get("sar3m")
    if sar is None:
        return
    latest = global_entity.get("latest")
    if not latest:
        return
    latest["momentum3mSar"] = sar
    latest["momentum3mMonth"] = latest_m.get("month")
    latest["momentum3mSource"] = "monthly"