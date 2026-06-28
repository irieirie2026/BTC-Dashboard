"""
Macro Drivers API payload builder for the BTC dashboard.

Data: World Bank WDI public API (no key required).
Cache: 6h per series in macro_drivers_worldbank.
"""

from __future__ import annotations

import math
import time
from typing import Any

import pandas as pd

from macro_drivers_config import (
    DEFAULT_COUNTRIES,
    DEFAULT_INDICATORS,
    INDICATOR_CATALOG,
    LEADING_INDICATORS,
    PERIOD_OPTIONS,
    US_DASHBOARD_INDICATORS,
)
from macro_drivers_worldbank import (
    classify_regime,
    fetch_indicator_panel,
    fetch_multi_country_series,
    fetch_us_rates_snapshot,
    load_series_store,
    series_store_to_df,
)

COUNTRY_ALIASES = {
    "US": "United States",
    "EA": "Euro Area",
    "EMU": "Euro Area",
    "CN": "China",
    "JP": "Japan",
    "GB": "United Kingdom",
    "UK": "United Kingdom",
    "IN": "India",
    "DE": "Germany",
    "FR": "France",
    "BR": "Brazil",
    "CA": "Canada",
    "AU": "Australia",
    "KR": "South Korea",
    "MX": "Mexico",
    "ID": "Indonesia",
    "SA": "Saudi Arabia",
    "ZA": "South Africa",
    "TR": "Turkey",
    "RU": "Russia",
    "IT": "Italy",
    "ES": "Spain",
    "NL": "Netherlands",
    "CH": "Switzerland",
    "PL": "Poland",
    "AR": "Argentina",
    "NG": "Nigeria",
    "TH": "Thailand",
    "VN": "Vietnam",
    "MY": "Malaysia",
    "PH": "Philippines",
    "SG": "Singapore",
    "AE": "United Arab Emirates",
    "BE": "Belgium",
    "AT": "Austria",
    "PT": "Portugal",
    "IE": "Ireland",
    "FI": "Finland",
    "GR": "Greece",
}

_PAYLOAD_CACHE: dict[str, dict[str, Any]] = {}
_PAYLOAD_TTL = 6 * 3600


def clear_payload_cache() -> None:
    _PAYLOAD_CACHE.clear()


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


def _resolve_countries(raw: list[str] | None) -> list[str]:
    if not raw:
        return list(DEFAULT_COUNTRIES)
    out = []
    for item in raw:
        key = (item or "").strip()
        if not key:
            continue
        out.append(COUNTRY_ALIASES.get(key.upper(), key))
    return out or list(DEFAULT_COUNTRIES)


def _series_points(series: pd.Series, *, tail: int | None = None) -> list[dict]:
    if series is None or series.empty:
        return []
    s = series.dropna()
    if tail:
        s = s.tail(tail)
    out = []
    for idx, val in s.items():
        safe = _safe_float(val)
        if safe is None:
            continue
        out.append({"date": idx.strftime("%Y-%m-%d"), "value": safe})
    return out


def _build_us_dashboard(series_store: dict, lookback_days: int) -> dict:
    out: dict[str, Any] = {"panels": {}, "recessions": []}
    for panel_key, ind_key in US_DASHBOARD_INDICATORS.items():
        try:
            df = series_store_to_df(series_store, ind_key, INDICATOR_CATALOG)
            if df.empty or "United States" not in df.columns:
                out["panels"][panel_key] = []
                continue
            series = df["United States"].dropna()
            if lookback_days and not series.empty:
                cutoff = series.index.max() - pd.Timedelta(days=lookback_days)
                series = series[series.index >= cutoff]
            out["panels"][panel_key] = _series_points(series)
        except Exception:
            out["panels"][panel_key] = []
    return out


def _build_leading_payload(
    country_list: list[str],
    series_store: dict,
    lookback_days: int,
) -> dict[str, Any]:
    countries: dict[str, list[dict]] = {}
    notes: list[str] = []
    for ind_key in LEADING_INDICATORS:
        meta = INDICATOR_CATALOG.get(ind_key, {})
        df = fetch_multi_country_series(
            ind_key,
            country_list,
            INDICATOR_CATALOG,
            lookback_days=lookback_days,
            series_store=series_store,
        )
        note = meta.get("fallback_note")
        if note:
            notes.append(note)
        for col in df.columns:
            countries.setdefault(col, []).extend(
                [
                    {
                        "indicator": meta.get("label", ind_key),
                        "indicator_key": ind_key,
                        "points": _series_points(df[col]),
                    }
                ]
            )
    return {
        "label": "Investment, Trade & External Balance",
        "indicators": LEADING_INDICATORS,
        "countries": countries,
        "note": " ".join(dict.fromkeys(notes)),
    }


def _build_observations(rows: list[dict], regime: dict) -> list[str]:
    bullets = []
    us = [r for r in rows if r.get("country") == "United States" and not r.get("missing")]
    for r in us[:6]:
        if r.get("value") is not None:
            bullets.append(
                f"US {r['indicator']}: {r['value']:.2f}{' ' + r.get('unit', '') if r.get('unit') else ''} "
                f"(as of {r.get('date', '—')})."
            )
    if regime.get("label"):
        bullets.append(f"Rule-based regime: {regime['label']}.")
    intl = [r for r in rows if r.get("country") != "United States" and not r.get("missing")]
    if intl:
        top = sorted(intl, key=lambda x: x.get("value") or -999, reverse=True)[:3]
        bullets.append(
            "International: "
            + "; ".join(
                f"{t['country']} {t['indicator']} {t['value']:.2f}" for t in top if t.get("value") is not None
            )
            + "."
        )
    bullets.append(
        "World Bank WDI series are mostly annual — Δ MoM is not shown. "
        "Some indicators have publication lags or gaps for select economies."
    )
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
            "Watch credit spreads and VIX for confirmation of risk-off regime.",
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


def get_macro_drivers_payload(
    *,
    countries: list[str] | None = None,
    indicators: list[str] | None = None,
    period: str = "5Y",
    trend_indicator: str | None = None,
    refresh: bool = False,
) -> dict:
    country_list = _resolve_countries(countries)
    ind_list = [i for i in (indicators or DEFAULT_INDICATORS) if i in INDICATOR_CATALOG]
    if not ind_list:
        ind_list = list(DEFAULT_INDICATORS)

    cache_key = (
        f"{','.join(country_list)}|{','.join(ind_list)}|{period}|{trend_indicator or ''}"
    )
    now = time.time()
    if not refresh:
        cached = _PAYLOAD_CACHE.get(cache_key)
        if cached and now - cached["ts"] < _PAYLOAD_TTL:
            return cached["data"]

    lookback = PERIOD_OPTIONS.get(period or "5Y", 365 * 5)
    series_store, store_errors = load_series_store(
        country_list, ind_list, INDICATOR_CATALOG, lookback_days=lookback
    )

    panel = fetch_indicator_panel(
        country_list,
        ind_list,
        INDICATOR_CATALOG,
        lookback_days=lookback,
        series_store=series_store,
        store_errors=store_errors,
    )
    rows = panel.get("rows") or []
    filled = sum(1 for r in rows if not r.get("missing"))
    if rows and filled == 0:
        panel.setdefault("errors", []).append(
            "World Bank returned no data for the selected countries and indicators."
        )

    us_map = {
        r["indicator_key"]: r.get("value")
        for r in rows
        if r.get("country") == "United States" and not r.get("missing")
    }
    regime = classify_regime(
        {
            "cpi": us_map.get("cpi"),
            "unemployment": us_map.get("unemployment"),
            "interest_spread": us_map.get("interest_spread"),
            "gdp_real": us_map.get("gdp_real"),
        }
    )

    trend_key = trend_indicator if trend_indicator in ind_list else ind_list[0]
    multi_df = fetch_multi_country_series(
        trend_key,
        country_list,
        INDICATOR_CATALOG,
        lookback_days=lookback,
        series_store=series_store,
    )
    multi_country = {
        "indicator": trend_key,
        "label": INDICATOR_CATALOG.get(trend_key, {}).get("label", trend_key),
        "countries": {
            col: _series_points(multi_df[col])
            for col in multi_df.columns
            if col in multi_df
        },
    }

    leading = _build_leading_payload(country_list, series_store, lookback)

    leading_chart_df = fetch_multi_country_series(
        "manufacturing_growth",
        country_list,
        INDICATOR_CATALOG,
        lookback_days=lookback,
        series_store=series_store,
    )
    leading_chart = {
        "indicator": "manufacturing_growth",
        "label": INDICATOR_CATALOG["manufacturing_growth"]["label"],
        "countries": {
            col: _series_points(leading_chart_df[col]) for col in leading_chart_df.columns
        },
    }

    policy_df = fetch_multi_country_series(
        "lending_rate",
        country_list,
        INDICATOR_CATALOG,
        lookback_days=lookback,
        series_store=series_store,
    )
    cpi_df = fetch_multi_country_series(
        "cpi",
        country_list,
        INDICATOR_CATALOG,
        lookback_days=lookback,
        series_store=series_store,
    )

    rates_snapshot = fetch_us_rates_snapshot(
        lookback_days=lookback,
        series_store=series_store,
    )
    yield_rows = []
    if rates_snapshot is not None and not rates_snapshot.empty:
        for _, row in rates_snapshot.iterrows():
            yield_rows.append(
                {
                    "tenor": row.get("tenor"),
                    "yield": _safe_float(row.get("yield")),
                }
            )

    payload = {
        "section": "drivers",
        "title": "Macro Drivers",
        "panel": {k: v for k, v in panel.items() if k != "series_store"},
        "regime": regime,
        "multiCountry": multi_country,
        "leading": leading,
        "leadingChart": leading_chart,
        "pmi": leading_chart,
        "policyInflation": {
            "policy": {col: _series_points(policy_df[col]) for col in policy_df.columns},
            "cpi": {col: _series_points(cpi_df[col]) for col in cpi_df.columns},
        },
        "yieldCurve": yield_rows,
        "usDashboard": _build_us_dashboard(series_store, lookback),
        "observations": _build_observations(rows, regime),
        "equityImplications": _equity_implications(regime),
        "countries": country_list,
        "indicators": ind_list,
        "period": period,
        "source": "World Bank (WDI)",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    _PAYLOAD_CACHE[cache_key] = {"ts": now, "data": payload}
    return payload