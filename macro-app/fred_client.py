"""
FRED API client with in-memory caching and transformation helpers.

Data delay: FRED mirrors source publication lags (CPI ~1 month, GDP quarterly, etc.).
Rate limits: FRED allows ~120 requests/minute per key; batch thoughtfully and cache.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any

import pandas as pd
import requests

FRED_BASE = "https://api.stlouisfed.org/fred"
CACHE_TTL_SECONDS = 6 * 3600  # 6 hours — macro series update infrequently

_cache: dict[str, dict[str, Any]] = {}


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if not entry:
        return None
    if time.time() - entry["ts"] > CACHE_TTL_SECONDS:
        return None
    return entry["data"]


def _cache_set(key: str, data: Any) -> None:
    _cache[key] = {"ts": time.time(), "data": data}


def clear_cache() -> None:
    _cache.clear()


def _fred_get(path: str, api_key: str, params: dict | None = None) -> dict:
    if not api_key:
        raise ValueError("FRED API key is required.")
    q = {"api_key": api_key, "file_type": "json"}
    if params:
        q.update(params)
    url = f"{FRED_BASE}/{path}"
    resp = requests.get(url, params=q, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_series(
    series_id: str,
    api_key: str,
    *,
    start: str | None = None,
    end: str | None = None,
) -> pd.Series:
    """Return a pandas Series indexed by date (DatetimeIndex), float values."""
    cache_key = f"series:{series_id}:{start}:{end}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached.copy()

    if not start:
        start = (datetime.utcnow() - timedelta(days=365 * 25)).strftime("%Y-%m-%d")
    if not end:
        end = datetime.utcnow().strftime("%Y-%m-%d")

    payload = _fred_get(
        "series/observations",
        api_key,
        {
            "series_id": series_id,
            "observation_start": start,
            "observation_end": end,
            "sort_order": "asc",
        },
    )
    obs = payload.get("observations") or []
    if not obs:
        series = pd.Series(dtype=float)
        _cache_set(cache_key, series)
        return series

    df = pd.DataFrame(obs)
    df["date"] = pd.to_datetime(df["date"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"])
    series = df.set_index("date")["value"].sort_index()
    _cache_set(cache_key, series)
    return series.copy()


def apply_transform(series: pd.Series, transform: str) -> pd.Series:
    """Convert raw FRED levels to display series."""
    if series.empty:
        return series
    if transform == "level":
        return series
    if transform == "yoy_pct":
        return series.pct_change(12) * 100.0
    if transform == "mom_pct":
        return series.pct_change(1) * 100.0
    if transform == "qoq_pct":
        return series.pct_change(1) * 100.0
    return series


def latest_with_changes(series: pd.Series, transform: str) -> dict[str, Any]:
    """Latest value plus YoY and MoM deltas where meaningful."""
    if series.empty:
        return {"value": None, "yoy": None, "mom": None, "date": None}

    transformed = apply_transform(series, transform)
    transformed = transformed.dropna()
    if transformed.empty:
        return {"value": None, "yoy": None, "mom": None, "date": None}

    last_date = transformed.index[-1]
    last_val = float(transformed.iloc[-1])

    yoy = None
    mom = None
    if len(transformed) > 12:
        prev_y = transformed.iloc[-13]
        if prev_y and prev_y != 0:
            yoy = last_val - float(prev_y) if transform == "level" else last_val
    if len(transformed) > 1:
        prev_m = transformed.iloc[-2]
        if transform == "level" and prev_m:
            mom = last_val - float(prev_m)
        elif transform != "level":
            mom = last_val - float(prev_m)

    # For yoy_pct transform, last_val IS yoy; compute delta vs prior year reading
    if transform == "yoy_pct" and len(transformed) > 12:
        yoy = last_val - float(transformed.iloc[-13])

    return {
        "value": last_val,
        "yoy": yoy,
        "mom": mom,
        "date": last_date.strftime("%Y-%m-%d"),
    }


def fetch_indicator_panel(
    api_key: str,
    countries: list[str],
    indicator_keys: list[str],
    catalog: dict,
    *,
    lookback_days: int = 365 * 5,
) -> dict[str, Any]:
    """
    Build snapshot rows + sparkline history for countries × indicators.
    Missing series return nulls without failing the whole panel.
    """
    start = (datetime.utcnow() - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
    rows: list[dict] = []
    errors: list[str] = []

    for country in countries:
        for ind_key in indicator_keys:
            meta = catalog.get(ind_key, {})
            sid = (meta.get("countries") or {}).get(country)
            label = meta.get("label", ind_key)
            unit = meta.get("unit", "")
            transform = meta.get("transform", "level")

            if not sid:
                rows.append(
                    {
                        "country": country,
                        "indicator": label,
                        "indicator_key": ind_key,
                        "series_id": None,
                        "value": None,
                        "yoy": None,
                        "mom": None,
                        "unit": unit,
                        "date": None,
                        "sparkline": [],
                        "spark_dates": [],
                        "missing": True,
                    }
                )
                continue

            try:
                raw = fetch_series(sid, api_key, start=start)
                stats = latest_with_changes(raw, transform)
                hist = apply_transform(raw, transform).dropna().tail(36)
                rows.append(
                    {
                        "country": country,
                        "indicator": label,
                        "indicator_key": ind_key,
                        "series_id": sid,
                        "value": stats["value"],
                        "yoy": stats["yoy"],
                        "mom": stats["mom"],
                        "unit": unit,
                        "date": stats["date"],
                        "sparkline": hist.values.tolist(),
                        "spark_dates": [d.strftime("%Y-%m-%d") for d in hist.index],
                        "missing": False,
                    }
                )
            except Exception as exc:  # noqa: BLE001 — surface per-series errors
                errors.append(f"{country} / {label} ({sid}): {exc}")
                rows.append(
                    {
                        "country": country,
                        "indicator": label,
                        "indicator_key": ind_key,
                        "series_id": sid,
                        "value": None,
                        "yoy": None,
                        "mom": None,
                        "unit": unit,
                        "date": None,
                        "sparkline": [],
                        "spark_dates": [],
                        "missing": True,
                        "error": str(exc),
                    }
                )

    return {"rows": rows, "errors": errors, "fetched_at": datetime.utcnow().isoformat()}


def fetch_multi_country_series(
    api_key: str,
    indicator_key: str,
    countries: list[str],
    catalog: dict,
    *,
    lookback_days: int = 365 * 5,
) -> pd.DataFrame:
    """Wide DataFrame: date index, columns = countries."""
    meta = catalog[indicator_key]
    transform = meta.get("transform", "level")
    start = (datetime.utcnow() - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
    frames: dict[str, pd.Series] = {}

    for country in countries:
        sid = (meta.get("countries") or {}).get(country)
        if not sid:
            continue
        try:
            raw = fetch_series(sid, api_key, start=start)
            frames[country] = apply_transform(raw, transform)
        except Exception:
            continue

    if not frames:
        return pd.DataFrame()
    df = pd.DataFrame(frames).sort_index()
    return df.dropna(how="all")


def fetch_us_yield_curve(api_key: str, date: str | None = None) -> pd.DataFrame:
    """Current or historical US curve across standard tenors."""
    from indicators_config import US_YIELD_CURVE_SERIES

    rows = []
    for tenor, sid in US_YIELD_CURVE_SERIES.items():
        try:
            s = fetch_series(sid, api_key, start=(datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d"))
            if s.empty:
                continue
            if date:
                subset = s.loc[:date]
                val = float(subset.iloc[-1]) if not subset.empty else None
                dt = subset.index[-1] if not subset.empty else None
            else:
                val = float(s.iloc[-1])
                dt = s.index[-1]
            rows.append({"tenor": tenor, "yield": val, "date": dt})
        except Exception:
            continue
    return pd.DataFrame(rows)


def fetch_recession_series(api_key: str) -> pd.Series:
    from indicators_config import US_RECESSION_SERIES

    return fetch_series(US_RECESSION_SERIES, api_key)


def classify_regime(us_row: dict[str, Any]) -> dict[str, str]:
    """
    Simple rule-based macro regime from latest US indicators.
    Returns label + Bootstrap color class for badge.
    """
    cpi = us_row.get("cpi")
    unemp = us_row.get("unemployment")
    curve = us_row.get("yield_curve")
    gdp = us_row.get("gdp_real")

    if cpi is None and unemp is None:
        return {"label": "Insufficient data", "color": "secondary"}

    if curve is not None and curve < -0.5:
        return {"label": "Inversion / Slowdown risk", "color": "warning"}

    if cpi is not None and cpi > 4.0:
        return {"label": "High inflation / Restrictive", "color": "danger"}

    if cpi is not None and cpi < 2.0 and unemp is not None and unemp > 5.0:
        return {"label": "Disinflation / Soft landing", "color": "info"}

    if gdp is not None and gdp < 0:
        return {"label": "Contraction", "color": "dark"}

    if cpi is not None and 2.0 <= cpi <= 3.5:
        return {"label": "Moderate growth / Normalization", "color": "success"}

    return {"label": "Mixed / Transitional", "color": "primary"}