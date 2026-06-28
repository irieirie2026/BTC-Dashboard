"""
World Bank WDI client for Macro Drivers.

Public API — no key required.
Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
"""

from __future__ import annotations

import math
import time
from datetime import datetime
from typing import Any

import pandas as pd
import requests

from macro_drivers_config import (
    EURO_AREA_LABEL,
    EURO_AREA_MEMBERS,
    EURO_AREA_WEIGHT_INDICATOR,
    INDICATOR_CATALOG,
    WB_COUNTRY_CODES,
    WB_COUNTRY_LABELS,
)

WB_BASE = "https://api.worldbank.org/v2"
CACHE_TTL_SECONDS = 6 * 3600
EMPTY_CACHE_TTL_SECONDS = 300
REQUEST_TIMEOUT = 45
MAX_RETRIES = 4
RETRY_BACKOFF = 2.0
INTER_REQUEST_SLEEP = 0.35
PER_PAGE = 2000

WB_HEADERS = {
    "User-Agent": "BTC-Macro-Dashboard/1.0 (local research)",
    "Accept": "application/json",
}

_cache: dict[str, dict[str, Any]] = {}
_session: requests.Session | None = None
# Per-country transform overrides when a fallback WDI series is used.
_transform_overrides: dict[str, dict[str, str]] = {}
_unit_overrides: dict[str, dict[str, str]] = {}
_series_id_overrides: dict[str, dict[str, str]] = {}
_euro_area_weight_cache: dict[int, dict[str, pd.Series]] = {}


def _session_get() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(WB_HEADERS)
    return _session


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


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if not entry:
        return None
    ttl = entry.get("ttl", CACHE_TTL_SECONDS)
    if time.time() - entry["ts"] > ttl:
        return None
    return entry["data"]


def _cache_set(key: str, data: Any, *, ttl: int = CACHE_TTL_SECONDS) -> None:
    _cache[key] = {"ts": time.time(), "data": data, "ttl": ttl}


def clear_cache() -> None:
    _cache.clear()
    _transform_overrides.clear()
    _unit_overrides.clear()
    _series_id_overrides.clear()
    _euro_area_weight_cache.clear()
    global _session
    _session = None


def _effective_transform(indicator_key: str, country: str, catalog: dict) -> str:
    return (
        _transform_overrides.get(indicator_key, {}).get(country)
        or catalog.get(indicator_key, {}).get("transform", "level")
    )


def _effective_unit(indicator_key: str, country: str, catalog: dict) -> str:
    return (
        _unit_overrides.get(indicator_key, {}).get(country)
        or catalog.get(indicator_key, {}).get("unit", "")
    )


def _effective_series_id(indicator_key: str, country: str, catalog: dict) -> str | None:
    return (
        _series_id_overrides.get(indicator_key, {}).get(country)
        or catalog.get(indicator_key, {}).get("wb_code")
    )


def _series_has_values(series: pd.Series | None) -> bool:
    return series is not None and not series.empty and series.dropna().size > 0


def _country_codes(countries: list[str]) -> list[str]:
    out = []
    for name in countries:
        code = WB_COUNTRY_CODES.get(name)
        if code:
            out.append(code)
    return out


def _start_year(lookback_days: int) -> int:
    return max(1960, datetime.utcnow().year - max(1, lookback_days // 365))


def _build_url(country_codes: list[str], indicator_code: str, *, start_year: int) -> str:
    end_year = datetime.utcnow().year
    countries = ";".join(country_codes)
    return (
        f"{WB_BASE}/country/{countries}/indicator/{indicator_code}"
        f"?format=json&per_page={PER_PAGE}&date={start_year}:{end_year}"
    )


def _wb_get(url: str) -> list[dict]:
    cached = _cache_get(url)
    if cached is not None:
        return cached

    records: list[dict] = []
    page = 1
    pages = 1

    while page <= pages:
        page_url = url if page == 1 else f"{url}&page={page}"
        for attempt in range(MAX_RETRIES):
            try:
                resp = _session_get().get(page_url, timeout=REQUEST_TIMEOUT)
                if resp.status_code == 404:
                    _cache_set(url, [], ttl=EMPTY_CACHE_TTL_SECONDS)
                    return []
                resp.raise_for_status()
                payload = resp.json()
                if not isinstance(payload, list) or len(payload) < 2:
                    _cache_set(url, [], ttl=EMPTY_CACHE_TTL_SECONDS)
                    return []
                meta, rows = payload[0], payload[1]
                if not rows:
                    break
                pages = int(meta.get("pages") or 1)
                records.extend(rows)
                break
            except Exception:
                time.sleep(RETRY_BACKOFF * (2**attempt))
        else:
            return []
        page += 1

    _cache_set(url, records)
    return records


def _parse_wb_records(records: list[dict]) -> dict[str, pd.Series]:
    if not records:
        return {}

    buckets: dict[str, list[tuple[pd.Timestamp, float]]] = {}
    for row in records:
        country_id = (row.get("country") or {}).get("id")
        label = WB_COUNTRY_LABELS.get(country_id)
        if not label:
            continue
        val = _safe_float(row.get("value"))
        if val is None:
            continue
        year = row.get("date")
        try:
            ts = pd.Timestamp(f"{int(year)}-12-31")
        except (TypeError, ValueError):
            continue
        buckets.setdefault(label, []).append((ts, val))

    out: dict[str, pd.Series] = {}
    for label, pts in buckets.items():
        pts.sort(key=lambda x: x[0])
        series = pd.Series([v for _, v in pts], index=pd.DatetimeIndex([d for d, _ in pts]))
        series = series[~series.index.duplicated(keep="last")].sort_index()
        if not series.empty:
            out[label] = series
    return out


def _gdp_weighted_composite(
    member_series: dict[str, pd.Series],
    weights: dict[str, pd.Series],
) -> pd.Series:
    dates: set[pd.Timestamp] = set()
    for series in member_series.values():
        dates.update(series.index)
    if not dates:
        return pd.Series(dtype=float)

    out_dates: list[pd.Timestamp] = []
    out_values: list[float] = []
    for dt in sorted(dates):
        numerator = 0.0
        denominator = 0.0
        for country, series in member_series.items():
            if dt not in series.index:
                continue
            val = _safe_float(series.loc[dt])
            weight_series = weights.get(country)
            if val is None or weight_series is None or dt not in weight_series.index:
                continue
            weight = _safe_float(weight_series.loc[dt])
            if weight is None or weight <= 0:
                continue
            numerator += val * weight
            denominator += weight
        if denominator > 0:
            out_dates.append(dt)
            out_values.append(numerator / denominator)

    if not out_values:
        return pd.Series(dtype=float)
    return pd.Series(out_values, index=pd.DatetimeIndex(out_dates)).sort_index()


def _euro_area_weights(lookback_days: int) -> dict[str, pd.Series]:
    cached = _euro_area_weight_cache.get(lookback_days)
    if cached is not None:
        return cached
    weights = _fetch_indicator_records(
        EURO_AREA_MEMBERS, EURO_AREA_WEIGHT_INDICATOR, lookback_days=lookback_days
    )
    _euro_area_weight_cache[lookback_days] = weights
    return weights


def _apply_member_fallbacks(
    members: list[str],
    indicator_meta: dict,
    *,
    lookback_days: int,
) -> dict[str, pd.Series]:
    code = indicator_meta.get("wb_code")
    if not code:
        return {}
    out = _fetch_indicator_records(members, code, lookback_days=lookback_days)
    fallback_code = indicator_meta.get("fallback_wb_code")
    if not fallback_code:
        return out

    missing = [m for m in members if not _series_has_values(out.get(m))]
    if not missing:
        return out

    fallback = _fetch_indicator_records(missing, fallback_code, lookback_days=lookback_days)
    for member in missing:
        series = fallback.get(member)
        if _series_has_values(series):
            out[member] = series
    return out


def _build_euro_area_composite(
    indicator_meta: dict,
    *,
    lookback_days: int,
    indicator_key: str | None = None,
) -> pd.Series | None:
    member_data = _apply_member_fallbacks(
        EURO_AREA_MEMBERS, indicator_meta, lookback_days=lookback_days
    )
    members_with_data = {c: s for c, s in member_data.items() if _series_has_values(s)}
    if not members_with_data:
        return None

    weights = _euro_area_weights(lookback_days)
    composite = _gdp_weighted_composite(members_with_data, weights)
    if composite.empty:
        return None

    if indicator_key:
        code = indicator_meta.get("wb_code") or ""
        _series_id_overrides.setdefault(indicator_key, {})[EURO_AREA_LABEL] = (
            f"{code} (EA GDP-weighted composite)"
        )
    return composite


def _fetch_indicator_records(
    countries: list[str],
    indicator_code: str,
    *,
    lookback_days: int,
) -> dict[str, pd.Series]:
    codes = _country_codes(countries)
    if not codes or not indicator_code:
        return {}
    url = _build_url(codes, indicator_code, start_year=_start_year(lookback_days))
    records = _wb_get(url)
    return _parse_wb_records(records)


def fetch_series_batch(
    countries: list[str],
    indicator_meta: dict,
    *,
    lookback_days: int = 365 * 5,
    indicator_key: str | None = None,
) -> dict[str, pd.Series]:
    indicator_code = indicator_meta.get("wb_code")
    if not indicator_code:
        return {}

    out = _fetch_indicator_records(countries, indicator_code, lookback_days=lookback_days)

    fallback_code = indicator_meta.get("fallback_wb_code")
    if fallback_code:
        missing = [c for c in countries if not _series_has_values(out.get(c))]
        if missing:
            fallback = _fetch_indicator_records(missing, fallback_code, lookback_days=lookback_days)
            fb_transform = indicator_meta.get(
                "fallback_transform", indicator_meta.get("transform", "level")
            )
            fb_unit = indicator_meta.get("fallback_unit")

            if indicator_key:
                for country in missing:
                    series = fallback.get(country)
                    if not _series_has_values(series):
                        continue
                    out[country] = series
                    _transform_overrides.setdefault(indicator_key, {})[country] = fb_transform
                    if fb_unit:
                        _unit_overrides.setdefault(indicator_key, {})[country] = fb_unit

    if (
        indicator_meta.get("euro_area_composite")
        and EURO_AREA_LABEL in countries
        and not _series_has_values(out.get(EURO_AREA_LABEL))
    ):
        composite = _build_euro_area_composite(
            indicator_meta, lookback_days=lookback_days, indicator_key=indicator_key
        )
        if _series_has_values(composite):
            out[EURO_AREA_LABEL] = composite

    return out


def apply_transform(series: pd.Series, transform: str) -> pd.Series:
    if series.empty:
        return series
    if transform in ("level", "level_pct", "growth"):
        return series
    if transform == "yoy_pct":
        return series.pct_change(1) * 100.0
    if transform == "mom_pct":
        return series.pct_change(1) * 100.0
    if transform == "yoy_pp":
        return series.diff()
    return series


def latest_with_changes(series: pd.Series, transform: str) -> dict[str, Any]:
    if series.empty:
        return {"value": None, "yoy": None, "mom": None, "date": None}

    transformed = apply_transform(series, transform).dropna()
    if transformed.empty:
        return {"value": None, "yoy": None, "mom": None, "date": None}

    last_date = transformed.index[-1]
    last_val = _safe_float(transformed.iloc[-1])
    if last_val is None:
        return {"value": None, "yoy": None, "mom": None, "date": None}

    yoy = None
    if len(transformed) > 1:
        prev_y = _safe_float(transformed.iloc[-2])
        if prev_y is not None:
            yoy = last_val - prev_y

    return {
        "value": last_val,
        "yoy": _safe_float(yoy),
        "mom": None,
        "date": last_date.strftime("%Y-%m-%d"),
    }


def expand_indicator_keys(indicator_keys: list[str], catalog: dict) -> list[str]:
    ordered = list(dict.fromkeys(indicator_keys))
    for extra in (
        "cpi",
        "lending_rate",
        "manufacturing_growth",
        "gdp_real",
        "unemployment",
        "trade_openness",
        "current_account",
    ):
        if extra in catalog and extra not in ordered:
            ordered.append(extra)
    return [k for k in ordered if k in catalog]


def load_series_store(
    countries: list[str],
    indicator_keys: list[str],
    catalog: dict,
    *,
    lookback_days: int = 365 * 5,
) -> tuple[dict[str, dict[str, pd.Series]], list[str]]:
    _transform_overrides.clear()
    _unit_overrides.clear()
    _series_id_overrides.clear()
    _euro_area_weight_cache.clear()
    store: dict[str, dict[str, pd.Series]] = {}
    errors: list[str] = []
    ordered = expand_indicator_keys(indicator_keys, catalog)

    for ind_key in ordered:
        meta = catalog.get(ind_key, {})
        try:
            store[ind_key] = fetch_series_batch(
                countries, meta, lookback_days=lookback_days, indicator_key=ind_key
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{ind_key}: {exc}")
            store[ind_key] = {}
        time.sleep(INTER_REQUEST_SLEEP)

    return store, errors


def series_store_to_df(
    store: dict[str, dict[str, pd.Series]],
    indicator_key: str,
    catalog: dict,
) -> pd.DataFrame:
    meta = catalog.get(indicator_key, {})
    frames = store.get(indicator_key) or {}
    if not frames:
        return pd.DataFrame()
    transformed = {
        c: apply_transform(s, _effective_transform(indicator_key, c, catalog)).dropna()
        for c, s in frames.items()
        if not s.empty
    }
    if not transformed:
        return pd.DataFrame()
    return pd.DataFrame(transformed).sort_index().dropna(how="all")


def fetch_indicator_panel(
    countries: list[str],
    indicator_keys: list[str],
    catalog: dict,
    *,
    lookback_days: int = 365 * 5,
    series_store: dict[str, dict[str, pd.Series]] | None = None,
    store_errors: list[str] | None = None,
) -> dict[str, Any]:
    rows: list[dict] = []
    errors: list[str] = list(store_errors or [])

    if series_store is None:
        series_store, load_errors = load_series_store(
            countries, indicator_keys, catalog, lookback_days=lookback_days
        )
        errors.extend(load_errors)

    for country in countries:
        for ind_key in indicator_keys:
            meta = catalog.get(ind_key, {})
            label = meta.get("label", ind_key)
            unit = _effective_unit(ind_key, country, catalog)
            transform = _effective_transform(ind_key, country, catalog)

            country_series = (series_store.get(ind_key) or {}).get(country)
            if country_series is None or country_series.empty:
                rows.append(
                    {
                        "country": country,
                        "indicator": label,
                        "indicator_key": ind_key,
                        "series_id": _effective_series_id(ind_key, country, catalog),
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
                stats = latest_with_changes(country_series, transform)
                hist = apply_transform(country_series, transform).dropna().tail(12)
                sparkline = [_safe_float(v) for v in hist.values.tolist()]
                sparkline = [v for v in sparkline if v is not None]
                rows.append(
                    {
                        "country": country,
                        "indicator": label,
                        "indicator_key": ind_key,
                        "series_id": _effective_series_id(ind_key, country, catalog),
                        "value": stats["value"],
                        "yoy": stats["yoy"],
                        "mom": stats["mom"],
                        "unit": unit,
                        "date": stats["date"],
                        "sparkline": sparkline,
                        "spark_dates": [
                            d.strftime("%Y-%m-%d") for d in hist.index[-len(sparkline) :]
                        ],
                        "missing": False,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{country} / {label}: {exc}")
                rows.append(
                    {
                        "country": country,
                        "indicator": label,
                        "indicator_key": ind_key,
                        "series_id": _effective_series_id(ind_key, country, catalog),
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

    return {
        "rows": rows,
        "errors": errors,
        "fetched_at": datetime.utcnow().isoformat(),
        "series_store": series_store,
    }


def fetch_multi_country_series(
    indicator_key: str,
    countries: list[str],
    catalog: dict,
    *,
    lookback_days: int = 365 * 5,
    series_store: dict[str, dict[str, pd.Series]] | None = None,
) -> pd.DataFrame:
    if series_store is not None and indicator_key in series_store:
        return series_store_to_df(series_store, indicator_key, catalog)

    meta = catalog[indicator_key]
    frames = fetch_series_batch(
        countries, meta, lookback_days=lookback_days, indicator_key=indicator_key
    )

    if not frames:
        return pd.DataFrame()

    transformed = {
        c: apply_transform(s, _effective_transform(indicator_key, c, catalog)).dropna()
        for c, s in frames.items()
        if not s.empty
    }
    if not transformed:
        return pd.DataFrame()
    return pd.DataFrame(transformed).sort_index().dropna(how="all")


def fetch_us_rates_snapshot(
    *,
    lookback_days: int = 365 * 5,
    series_store: dict[str, dict[str, pd.Series]] | None = None,
) -> pd.DataFrame:
    rows = []
    mapping = {
        "Lending rate": "lending_rate",
        "Real interest rate": "real_interest_rate",
        "Interest spread": "interest_spread",
    }
    for tenor, ind_key in mapping.items():
        series = None
        if series_store:
            series = (series_store.get(ind_key) or {}).get("United States")
        if series is None or series.empty:
            meta = INDICATOR_CATALOG.get(ind_key, {})
            try:
                batch = fetch_series_batch(["United States"], meta, lookback_days=lookback_days)
                series = batch.get("United States")
            except Exception:
                series = None
        if series is None or series.empty:
            continue
        val = _safe_float(series.iloc[-1])
        dt = series.index[-1]
        rows.append({"tenor": tenor, "yield": val, "date": dt})
    return pd.DataFrame(rows)


def classify_regime(us_row: dict[str, Any]) -> dict[str, str]:
    cpi = us_row.get("cpi")
    unemp = us_row.get("unemployment")
    spread = us_row.get("interest_spread")
    gdp = us_row.get("gdp_real")

    if cpi is None and unemp is None:
        return {"label": "Insufficient data", "color": "secondary"}

    if spread is not None and spread < 2.0 and cpi is not None and cpi > 3.0:
        return {"label": "Tight financial conditions", "color": "warning"}

    if cpi is not None and cpi > 4.0:
        return {"label": "High inflation / Restrictive", "color": "danger"}

    if cpi is not None and cpi < 2.5 and unemp is not None and unemp > 5.0:
        return {"label": "Disinflation / Soft landing", "color": "info"}

    if gdp is not None and gdp < 0:
        return {"label": "Contraction", "color": "dark"}

    if cpi is not None and 2.0 <= cpi <= 3.5:
        return {"label": "Moderate growth / Normalization", "color": "success"}

    return {"label": "Mixed / Transitional", "color": "primary"}