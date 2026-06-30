"""Coin Metrics Community API — free BTC on-chain metrics (no API key)."""

from __future__ import annotations

import time
import urllib.parse
from typing import Any

from macro_data.cache import cache_get, cache_set

from btc_data.fetchers import fetch_json

COMMUNITY_BASE = "https://community-api.coinmetrics.io/v4"
COINMETRICS_TTL = 43_200  # 12h

# Internal key → CM metric id
COINMETRICS_METRICS: dict[str, str] = {
    "exchange_inflow": "FlowInExNtv",
    "exchange_outflow": "FlowOutExNtv",
    "exchange_balance": "SplyExNtv",
    "tx_count": "TxCnt",
}


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _parse_cm_time(time_str: str) -> tuple[int | None, str]:
    if not time_str:
        return None, ""
    raw = str(time_str).strip()
    try:
        from datetime import datetime, timezone

        if raw.endswith("Z"):
            core = raw[:-1]
            if "." in core:
                base, frac = core.split(".", 1)
                core = f"{base}.{frac[:6]}"
            iso = core + "+00:00"
        elif len(raw) == 10:
            iso = raw + "T00:00:00+00:00"
        else:
            iso = raw
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        ts = int(dt.timestamp())
        return ts, dt.strftime("%Y-%m-%d")
    except (ValueError, OverflowError):
        date = raw[:10]
        try:
            ts = int(time.mktime(time.strptime(date, "%Y-%m-%d")))
            return ts, date
        except (ValueError, OverflowError):
            return None, date


def _normalize_cm_rows(raw: Any, value_key: str) -> list[dict]:
    rows = raw.get("data") if isinstance(raw, dict) else raw
    if not isinstance(rows, list):
        return []
    out: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        val = row.get(value_key)
        if val is None:
            continue
        try:
            fval = float(val)
        except (TypeError, ValueError):
            continue
        ts, date = _parse_cm_time(str(row.get("time") or ""))
        out.append({"timestamp": ts, "date": date, "value": fval})
    out.sort(key=lambda p: p.get("timestamp") or 0)
    return out


def fetch_coinmetrics_series(
    metric_key: str,
    *,
    days_back: int = 365,
    refresh: bool = False,
) -> dict[str, Any]:
    cm_metric = COINMETRICS_METRICS.get(metric_key)
    if not cm_metric:
        return {
            "series": [],
            "latest": None,
            "source": "Coin Metrics Community",
            "error": f"Unknown Coin Metrics metric: {metric_key}",
            "fetchedAt": _now_iso(),
        }

    cache_key = f"btc:cm:v2:{metric_key}:{days_back}"
    if not refresh:
        cached = cache_get(cache_key, ttl=COINMETRICS_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    start_time = time.strftime("%Y-%m-%d", time.gmtime(time.time() - days_back * 86400))
    params = urllib.parse.urlencode({
        "assets": "btc",
        "metrics": cm_metric,
        "frequency": "1d",
        "start_time": start_time,
        "page_size": 10000,
        "sort": "time",
    })
    url = f"{COMMUNITY_BASE}/timeseries/asset-metrics?{params}"
    try:
        raw = fetch_json(url, timeout=60)
    except Exception as exc:
        stale = cache_get(cache_key, ttl=COINMETRICS_TTL * 7)
        if stale:
            return {**stale, "fromCache": True, "stale": True, "error": str(exc)}
        return {
            "series": [],
            "latest": None,
            "source": "Coin Metrics Community",
            "error": str(exc),
            "fetchedAt": _now_iso(),
        }

    series = _normalize_cm_rows(raw, cm_metric)
    latest = series[-1] if series else None
    payload = {
        "series": series,
        "latest": latest,
        "source": "Coin Metrics Community",
        "fetchedAt": _now_iso(),
        "fromCache": False,
    }
    cache_set(cache_key, payload)
    return payload


def fetch_exchange_netflow_series(*, days_back: int = 365, refresh: bool = False) -> dict[str, Any]:
    cache_key = f"btc:cm:v1:exchange_netflow:{days_back}"
    if not refresh:
        cached = cache_get(cache_key, ttl=COINMETRICS_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    inflow = fetch_coinmetrics_series("exchange_inflow", days_back=days_back, refresh=refresh)
    outflow = fetch_coinmetrics_series("exchange_outflow", days_back=days_back, refresh=refresh)
    errors = [e for e in (inflow.get("error"), outflow.get("error")) if e]

    by_key: dict[str, dict] = {}
    for pt in inflow.get("series") or []:
        key = str(pt.get("date") or pt.get("timestamp") or "")
        if not key:
            continue
        by_key.setdefault(key, {"date": pt.get("date", key), "timestamp": pt.get("timestamp")})
        by_key[key]["inflow"] = pt["value"]
    for pt in outflow.get("series") or []:
        key = str(pt.get("date") or pt.get("timestamp") or "")
        if not key:
            continue
        by_key.setdefault(key, {"date": pt.get("date", key), "timestamp": pt.get("timestamp")})
        by_key[key]["outflow"] = pt["value"]

    series = []
    for key in sorted(by_key):
        row = by_key[key]
        inf = row.get("inflow")
        out = row.get("outflow")
        if inf is None or out is None:
            continue
        ts = row.get("timestamp")
        if ts is None and row.get("date"):
            try:
                ts = int(time.mktime(time.strptime(str(row["date"])[:10], "%Y-%m-%d")))
            except (ValueError, OverflowError):
                ts = None
        series.append({
            "timestamp": ts,
            "date": row.get("date", key),
            "value": round(float(inf) - float(out), 4),
        })

    latest = series[-1] if series else None
    payload = {
        "series": series,
        "latest": latest,
        "source": "Coin Metrics Community",
        "fetchedAt": _now_iso(),
        "fromCache": False,
        "error": "; ".join(errors) if errors and not series else None,
        "note": "Netflow = exchange inflow − outflow (native BTC)",
    }
    cache_set(cache_key, payload)
    return payload