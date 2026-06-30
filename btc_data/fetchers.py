"""Fetchers for Bitcoin indicator data."""

from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from typing import Any

from macro_data.cache import cache_get, cache_set

from btc_data.config import BGEOMETRICS_TTL, BITINFO_TTL

USER_AGENT = "Mozilla/5.0 (compatible; BTCDashboard/1.0)"
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Canonical API: https://bitcoin-data.com/v1/ (see bitcoin-data.com/bguser/free-features.html)
BGEOMETRICS_DEFAULT_BASE = "https://bitcoin-data.com/v1"

BLOCKCHAIN_CHARTS = {
    "hash-rate": "hash-rate",
    "n-unique-addresses": "n-unique-addresses",
    "miners-revenue": "miners-revenue",
    "market-price": "market-price",
}

# Internal key → {path, value_key, requires_token}
BGEOMETRICS_SERIES: dict[str, dict[str, Any]] = {
    "mvrv": {"path": "mvrv", "value_key": "mvrv"},
    "mvrv_z_score": {"path": "mvrv-zscore", "value_key": "mvrvZscore"},
    "realized_price": {"path": "realized-price", "value_key": "realizedPrice"},
    "puell_multiple": {"path": "puell-multiple", "value_key": "puellMultiple"},
    "hodl_waves": {"path": "hodl-waves-supply", "value_key": "_hodl_1y_plus_pct"},
    "bitcoin_dominance": {"path": "bitcoin-dominance", "value_key": "bitcoinDominance"},
    "nupl": {"path": "nupl", "value_key": "nupl"},
    "sopr": {"path": "sopr", "value_key": "sopr"},
    "supply_in_profit": {"path": "profit-loss", "value_key": "profitLoss", "scale": 100},
    "etf_flow_btc": {"path": "etf-flow-btc", "value_key": "etfFlow"},
    # Valuation Models extensions
    "btc_price": {"path": "btc-price", "value_key": "btcPrice"},
    "supply_current": {"path": "supply-current", "value_key": "supplyCurrent"},
    "delta_cap": {"path": "delta-cap", "value_key": "deltaCap"},
    "investor_price": {"path": "investor-price", "value_key": "investorPrice"},
    "thermo_price": {"path": "thermo-price", "value_key": "thermoPrice"},
    "cdd": {"path": "cdd", "value_key": "cdd"},
    "cdd_90dma": {"path": "cdd-90dma", "value_key": "cdd90dma"},
    "hashribbons": {"path": "hashribbons", "value_key": "hashribbons"},
    "difficulty": {"path": "difficulty-BTC", "value_key": "difficultyBTC"},
    "nvts": {"path": "nvts", "value_key": "nvts"},
    # Extended free-tier endpoints (prefetch registry)
    "sth_mvrv": {"path": "sth-mvrv", "value_key": "sthMvrv"},
    "lth_mvrv": {"path": "lth-mvrv", "value_key": "lthMvrv"},
    "sth_nupl": {"path": "nupl-sth", "value_key": "nuplSth"},
    "lth_nupl": {"path": "nupl-lth", "value_key": "nuplLth"},
    "asopr": {"path": "asopr", "value_key": "asopr"},
    "vdd_multiple": {"path": "vdd-multiple", "value_key": "vddMultiple"},
    "terminal_price": {"path": "terminal-price", "value_key": "terminalPrice"},
    "nrpl_usd": {"path": "nrpl-usd", "value_key": "nrplUsd"},
    "hashprice": {"path": "hashprice", "value_key": "hashprice"},
    "hashrate_bg": {"path": "hashrate", "value_key": "hashrate"},
    "etf_btc_total": {"path": "etf-btc-total", "value_key": "etfBtcTotal"},
    "stablecoin_supply": {"path": "stablecoin-supply", "value_key": "stablecoinSupply"},
    "utxos_in_profit_pct": {"path": "utxos-in-profit-pct", "value_key": "utxosInProfitPct"},
}

MEMPOOL_BASE = "https://mempool.space/api"
MEMPOOL_TTL = 300

# Free-plan endpoints only (bitcoin-data.com/v1 — 8 req/hr, 15/day, last 4 years).
FREE_BGEOMETRICS_METRICS = frozenset(BGEOMETRICS_SERIES.keys())

SNAPSHOT_KPI_METRICS = ("mvrv", "mvrv_z_score", "realized_price", "hodl_waves")

# Serialize BGeometrics HTTP calls — free tier allows ~8–10 req/hour.
_BG_LAST_REQUEST_AT = 0.0
_BG_MIN_INTERVAL_SEC = 2.5
_BG_THROTTLE_LOCK = threading.Lock()


def _bgeometrics_throttle() -> None:
    global _BG_LAST_REQUEST_AT
    with _BG_THROTTLE_LOCK:
        elapsed = time.monotonic() - _BG_LAST_REQUEST_AT
        if elapsed < _BG_MIN_INTERVAL_SEC:
            time.sleep(_BG_MIN_INTERVAL_SEC - elapsed)
        _BG_LAST_REQUEST_AT = time.monotonic()


def _friendly_bgeometrics_error(exc: urllib.error.HTTPError, raw_msg: str) -> str:
    if exc.code == 429:
        return (
            "BGeometrics rate limit (429) — cached data shown when available. "
            "Free tier allows 8 requests/hour; data is cached 24h."
        )
    return raw_msg


def _bgeometrics_stale_series(stale: dict[str, Any] | None, *, note: str | None = None) -> dict[str, Any] | None:
    """Return stale cached series without error when points exist."""
    if not stale or not stale.get("series"):
        return None
    return {
        **stale,
        "fromCache": True,
        "stale": True,
        "error": None,
        "note": note or stale.get("note"),
    }


def _bgeometrics_stale_last(stale: dict[str, Any] | None, *, note: str | None = None) -> dict[str, Any] | None:
    """Return stale cached latest value without error when data exists."""
    if not stale:
        return None
    if stale.get("latest") is not None:
        has_data = True
    elif stale.get("series"):
        has_data = True
        if stale.get("latest") is None:
            stale = {**stale, "latest": stale["series"][-1]}
    else:
        has_data = False
    if not has_data:
        return None
    return {
        **stale,
        "fromCache": True,
        "stale": True,
        "error": None,
        "note": note or stale.get("note"),
    }


HODL_1Y_PLUS_KEYS = (
    "age_1y_2y",
    "age_2y_3y",
    "age_3y_4y",
    "age_4y_5y",
    "age_5y_7y",
    "age_7y_10y",
    "age_10y",
)


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def fetch_json(url: str, *, timeout: int = 45, headers: dict | None = None) -> Any:
    hdrs = {"User-Agent": USER_AGENT}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def fetch_html(url: str, *, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def bgeometrics_token() -> str:
    """Read at runtime — supports BGEOMETRICS_API_KEY or BGEOMETRICS_TOKEN."""
    return (
        os.environ.get("BGEOMETRICS_API_KEY", "").strip()
        or os.environ.get("BGEOMETRICS_TOKEN", "").strip()
    )


def bgeometrics_base() -> str:
    return os.environ.get("BGEOMETRICS_API_BASE", BGEOMETRICS_DEFAULT_BASE).rstrip("/")


def bgeometrics_status() -> dict[str, Any]:
    token = bgeometrics_token()
    return {
        "configured": bool(token),
        "base": bgeometrics_base(),
        "auth": "free tier (no token)" if not token else "optional token",
        "freeOnly": True,
        "limits": {"perHour": 8, "perDay": 15, "history": "4 years"},
        "strategy": "sequential fetch + 24h disk cache",
    }


def _hodl_1y_plus_pct(row: dict) -> float | None:
    age_keys = [k for k in row if str(k).startswith("age_")]
    if not age_keys:
        return None
    total = sum(float(row.get(k) or 0) for k in age_keys)
    if total <= 0:
        return None
    one_y = sum(float(row.get(k) or 0) for k in HODL_1Y_PLUS_KEYS if k in row)
    return round(one_y / total * 100, 2)


def _bgeometrics_endpoint(metric: str) -> dict[str, Any] | None:
    return BGEOMETRICS_SERIES.get(metric)


def _bgeometrics_request(path: str) -> tuple[str, dict[str, str]]:
    url = f"{bgeometrics_base()}/{path.lstrip('/')}"
    headers: dict[str, str] = {}
    token = bgeometrics_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return url, headers


def _parse_bgeometrics_http_error(exc: urllib.error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace")
        parsed = json.loads(body)
        err = parsed.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
        if isinstance(parsed.get("message"), str):
            return parsed["message"]
        return body[:200] or str(exc)
    except (json.JSONDecodeError, OSError, AttributeError):
        return str(exc)


def fetch_bgeometrics_kpi_bundle(*, refresh: bool = False) -> dict[str, dict[str, Any]]:
    """Sequential /last fetches for snapshot KPIs — respects free-tier rate limits."""
    cache_key = "btc:bundle:bg-kpis:v2"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None:
            return cached

    out: dict[str, dict[str, Any]] = {}
    for metric in SNAPSHOT_KPI_METRICS:
        out[metric] = fetch_bgeometrics_last(metric, refresh=refresh)
    cache_set(cache_key, out)
    return out


def fetch_bgeometrics_last(metric: str, *, refresh: bool = False) -> dict[str, Any]:
    """Latest value only — uses /last to minimize API quota (for snapshot KPIs)."""
    spec = _bgeometrics_endpoint(metric)
    if not spec:
        return {
            "latest": None,
            "source": "BGeometrics",
            "error": f"Unknown BGeometrics metric: {metric}",
            "fetchedAt": _now_iso(),
        }

    if metric not in FREE_BGEOMETRICS_METRICS:
        return {
            "latest": None,
            "source": "BGeometrics",
            "error": f"Metric not available on free plan: {metric}",
            "fetchedAt": _now_iso(),
        }

    token = bgeometrics_token()
    cache_key = f"btc:bg:last:v2:{metric}:{'auth' if token else 'free'}"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    url, headers = _bgeometrics_request(f"{spec['path']}/last")
    try:
        _bgeometrics_throttle()
        raw = fetch_json(url, timeout=45, headers=headers)
    except urllib.error.HTTPError as exc:
        msg = _friendly_bgeometrics_error(exc, _parse_bgeometrics_http_error(exc))
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        cached = _bgeometrics_stale_last(stale, note=msg)
        if cached:
            return cached
        return {"latest": None, "source": "BGeometrics", "error": msg, "fetchedAt": _now_iso()}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        cached = _bgeometrics_stale_last(stale, note=str(exc))
        if cached:
            return cached
        return {"latest": None, "source": "BGeometrics", "error": str(exc), "fetchedAt": _now_iso()}

    if isinstance(raw, dict) and raw.get("error"):
        err = raw["error"]
        msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        cached = _bgeometrics_stale_last(stale, note=msg)
        if cached:
            return cached
        return {"latest": None, "source": "BGeometrics", "error": msg, "fetchedAt": _now_iso()}

    series = _normalize_bgeometrics(raw, spec)
    latest = series[-1] if series else None
    payload = {
        "latest": latest,
        "source": "BGeometrics · bitcoin-data.com",
        "fetchedAt": _now_iso(),
        "fromCache": False,
        "authenticated": bool(token),
    }
    cache_set(cache_key, payload)
    return payload


def fetch_bgeometrics_series(metric: str, *, refresh: bool = False) -> dict[str, Any]:
    spec = _bgeometrics_endpoint(metric)
    if not spec:
        return {
            "series": [],
            "latest": None,
            "source": "BGeometrics",
            "error": f"Unknown BGeometrics metric: {metric}",
            "fetchedAt": _now_iso(),
        }

    if metric not in FREE_BGEOMETRICS_METRICS:
        return {
            "series": [],
            "latest": None,
            "source": "BGeometrics",
            "error": f"Metric not available on free plan: {metric}",
            "fetchedAt": _now_iso(),
        }

    token = bgeometrics_token()
    cache_key = f"btc:bg:v2:{metric}:{'auth' if token else 'free'}"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    url, headers = _bgeometrics_request(spec["path"])
    try:
        _bgeometrics_throttle()
        raw = fetch_json(url, timeout=60, headers=headers)
    except urllib.error.HTTPError as exc:
        msg = _friendly_bgeometrics_error(exc, _parse_bgeometrics_http_error(exc))
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        cached = _bgeometrics_stale_series(stale, note=msg)
        if cached:
            return cached
        return {"series": [], "latest": None, "source": "BGeometrics", "error": msg, "fetchedAt": _now_iso()}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        cached = _bgeometrics_stale_series(stale, note=str(exc))
        if cached:
            return cached
        return {"series": [], "latest": None, "source": "BGeometrics", "error": str(exc), "fetchedAt": _now_iso()}

    if isinstance(raw, dict) and raw.get("error"):
        err = raw["error"]
        msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        cached = _bgeometrics_stale_series(stale, note=msg)
        if cached:
            return cached
        return {
            "series": [],
            "latest": None,
            "source": "BGeometrics",
            "error": msg,
            "fetchedAt": _now_iso(),
        }

    series = _normalize_bgeometrics(raw, spec)
    latest = series[-1] if series else None
    payload = {
        "series": series,
        "latest": latest,
        "source": "BGeometrics · bitcoin-data.com",
        "fetchedAt": _now_iso(),
        "fromCache": False,
        "authenticated": bool(token),
    }
    cache_set(cache_key, payload)
    return payload


def _hashribbons_signal_value(raw: Any) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    mapped = {
        "up": 1.0,
        "down": -1.0,
        "buy": 1.0,
        "recovery": 1.0,
        "capitulation": -1.0,
    }
    return mapped.get(str(raw).strip().lower())


def _extract_bgeometrics_value(row: dict, spec: dict[str, Any]) -> float | None:
    value_key = spec.get("value_key")
    if value_key == "_hodl_1y_plus_pct":
        return _hodl_1y_plus_pct(row)

    scale = float(spec.get("scale") or 1)
    if value_key and value_key in row and row[value_key] is not None:
        raw_val = row[value_key]
        if value_key == "hashribbons":
            mapped = _hashribbons_signal_value(raw_val)
            if mapped is not None:
                return mapped
        try:
            return float(raw_val) * scale
        except (TypeError, ValueError):
            pass

    if value_key:
        for k, v in row.items():
            if k.lower() == str(value_key).lower() and v is not None:
                if value_key == "hashribbons":
                    mapped = _hashribbons_signal_value(v)
                    if mapped is not None:
                        return mapped
                try:
                    return float(v) * scale
                except (TypeError, ValueError):
                    continue

    for k, v in row.items():
        if k in ("d", "unixTs", "date", "timestamp", "t"):
            continue
        if isinstance(v, (int, float)):
            return float(v)
    return None


def _normalize_bgeometrics(raw: Any, spec: dict[str, Any]) -> list[dict]:
    if isinstance(raw, dict):
        if raw.get("error"):
            return []
        for key in ("data", "values", "series"):
            if key in raw:
                return _normalize_bgeometrics(raw[key], spec)
        val = _extract_bgeometrics_value(raw, spec)
        if val is not None:
            ts = raw.get("unixTs") or raw.get("t") or raw.get("timestamp")
            date = raw.get("d") or raw.get("date")
            if isinstance(ts, str) and ts.isdigit():
                ts = int(ts)
            return [{"timestamp": ts, "date": str(date or "")[:10], "value": val}]

    if isinstance(raw, list):
        out = []
        for row in raw:
            if not isinstance(row, dict):
                continue
            val = _extract_bgeometrics_value(row, spec)
            ts = row.get("unixTs") or row.get("t") or row.get("timestamp")
            date = row.get("d") or row.get("date")
            if isinstance(ts, str) and str(ts).isdigit():
                ts = int(ts)
            if ts is None and date:
                try:
                    ts = int(time.mktime(time.strptime(str(date)[:10], "%Y-%m-%d")))
                except (ValueError, OverflowError):
                    ts = None
            if val is None:
                continue
            out.append({"timestamp": ts, "date": str(date or "")[:10], "value": float(val)})
        out.sort(key=lambda p: p.get("timestamp") or 0)
        return out

    return []


def fetch_blockchain_chart(name: str, timespan: str = "1year", *, refresh: bool = False) -> dict[str, Any]:
    if name not in BLOCKCHAIN_CHARTS:
        raise ValueError(f"Unknown blockchain chart: {name}")
    cache_key = f"btc:bc:{name}:{timespan}:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=3600)
        if cached is not None:
            return {**cached, "fromCache": True}

    url = (
        f"https://api.blockchain.info/charts/{name}"
        f"?timespan={timespan}&format=json"
    )
    raw = fetch_json(url, timeout=60)
    series = []
    for pt in raw.get("values", []):
        try:
            series.append({
                "timestamp": int(pt["x"]),
                "date": time.strftime("%Y-%m-%d", time.gmtime(int(pt["x"]))),
                "value": float(pt["y"]),
            })
        except (KeyError, TypeError, ValueError):
            continue
    if name == "hash-rate":
        for pt in series:
            pt["value"] = blockchain_hashrate_to_ehs(pt["value"])
    series.sort(key=lambda p: p["timestamp"])
    latest = series[-1] if series else None
    payload = {
        "series": series,
        "latest": latest,
        "source": "Blockchain.info",
        "unit": "EH/s" if name == "hash-rate" else None,
        "fetchedAt": _now_iso(),
        "fromCache": False,
    }
    cache_set(cache_key, payload)
    return payload


def compute_puell_multiple(*, refresh: bool = False) -> dict[str, Any]:
    cache_key = "btc:puell:computed:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=3600)
        if cached is not None:
            return {**cached, "fromCache": True}

    rev = fetch_blockchain_chart("miners-revenue", "2years", refresh=refresh)
    series = rev.get("series") or []
    if len(series) < 30:
        return {"series": [], "latest": None, "source": "Computed · Blockchain.info", "error": "Insufficient data", "fetchedAt": _now_iso()}

    window = 365
    out = []
    values = [p["value"] for p in series]
    for i, pt in enumerate(series):
        start = max(0, i - window + 1)
        window_vals = values[start : i + 1]
        avg = sum(window_vals) / len(window_vals) if window_vals else None
        if not avg or avg <= 0:
            continue
        puell = pt["value"] / avg
        out.append({**pt, "value": round(puell, 4)})

    latest = out[-1] if out else None
    payload = {
        "series": out,
        "latest": latest,
        "source": "Computed · Blockchain.info",
        "fetchedAt": _now_iso(),
        "isEstimate": True,
        "fromCache": False,
    }
    cache_set(cache_key, payload)
    return payload


def fetch_bitinfo_snapshot(*, refresh: bool = False) -> dict[str, Any]:
    cache_key = "btc:bitinfo:snapshot:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=BITINFO_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    html = fetch_html("https://bitinfocharts.com/bitcoin/")
    wealth = re.search(
        r'id="tdid18"[^>]*>\s*([\d.]+%)\s*/\s*([\d.]+%)\s*/\s*([\d.]+%)\s*/\s*([\d.]+%)',
        html,
    )
    top100 = re.search(
        r'id="tdid17"[^>]*>.*?([\d,]+)\s*BTC.*?([\d.]+)%\s*Total',
        html,
        re.S,
    )
    active = re.search(r'id="tdid20"[^>]*>\s*([\d,]+)', html)
    hashrate = re.search(r"([\d.]+)\s*Z(?:</abbr>)?\s*hash/s", html, re.I)

    snapshot = {
        "wealth_top10_pct": _pct_float(wealth.group(1)) if wealth else None,
        "rich_top100_pct": _pct_float(wealth.group(2)) if wealth else (_pct_float(top100.group(2)) if top100 else None),
        "rich_top1000_pct": _pct_float(wealth.group(3)) if wealth else None,
        "wealth_top10000_pct": _pct_float(wealth.group(4)) if wealth else None,
        "top100_btc": _int_commas(top100.group(1)) if top100 else None,
        "active_addresses_24h": _int_commas(active.group(1)) if active else None,
        "hash_rate_zhs": float(hashrate.group(1)) if hashrate else None,
        "source": "BitInfoCharts",
        "fetchedAt": _now_iso(),
    }
    cache_set(cache_key, snapshot)
    return {**snapshot, "fromCache": False}


def fetch_bitinfo_wallet_cohorts(*, refresh: bool = False) -> dict[str, Any]:
    cache_key = "btc:bitinfo:cohorts:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=BITINFO_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    html = fetch_html("https://bitinfocharts.com/top-100-richest-bitcoin-addresses.html")
    cohorts = []
    dist_idx = html.find("Balance, BTC")
    if dist_idx >= 0:
        tbody = html[dist_idx : dist_idx + 120_000]
        for row in re.finditer(r"<tr>(.*?)</tr>", tbody, re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row.group(1), re.S)
            if len(cells) < 4:
                continue
            texts = [re.sub(r"<[^>]+>", " ", c) for c in cells]
            texts = [" ".join(t.split()) for t in texts]
            range_label = texts[0].strip()
            if not range_label or range_label.startswith("Address Balance"):
                continue
            if not re.match(r"^[\[(]", range_label):
                break
            addr_m = re.search(r"([\d.]+)%", texts[2] if len(texts) > 2 else "")
            supply_m = re.search(r"([\d.]+)%", texts[5] if len(texts) > 5 else (texts[-1] if texts else ""))
            addr_pct = _pct_float(addr_m.group(1)) if addr_m else None
            supply_pct = _pct_float(supply_m.group(1)) if supply_m else None
            cohorts.append({
                "range": range_label,
                "addresses": _int_commas(re.sub(r"[^\d]", "", texts[1])),
                "addresses_pct": addr_pct,
                "btc": _float_commas(re.sub(r"[^\d.]", "", texts[3])) if len(texts) > 3 else None,
                "supply_pct": supply_pct,
            })

    payload = {
        "cohorts": cohorts,
        "source": "BitInfoCharts",
        "fetchedAt": _now_iso(),
        "fromCache": False,
    }
    cache_set(cache_key, payload)
    return payload


def fetch_mempool_fees(*, refresh: bool = False) -> dict[str, Any]:
    cache_key = "btc:mempool:fees:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=MEMPOOL_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    try:
        fees = fetch_json(f"{MEMPOOL_BASE}/v1/fees/recommended", timeout=20)
        mempool = fetch_json(f"{MEMPOOL_BASE}/mempool", timeout=20)
    except Exception as exc:
        stale = cache_get(cache_key, ttl=MEMPOOL_TTL * 12)
        if stale:
            return {**stale, "fromCache": True, "stale": True, "error": str(exc)}
        return {
            "value": None,
            "source": "Mempool.space",
            "error": str(exc),
            "fetchedAt": _now_iso(),
        }

    fast = fees.get("fastestFee")
    payload = {
        "value": float(fast) if fast is not None else None,
        "fast_fee": fees.get("fastestFee"),
        "hour_fee": fees.get("hourFee"),
        "economy_fee": fees.get("economyFee"),
        "mempool_count": mempool.get("count"),
        "mempool_mb": round(mempool.get("vsize", 0) / 1e6, 2) if mempool.get("vsize") else None,
        "source": "Mempool.space",
        "fetchedAt": _now_iso(),
        "fromCache": False,
    }
    cache_set(cache_key, payload)
    return payload


def fetch_coingecko_dominance(*, refresh: bool = False) -> dict[str, Any]:
    cache_key = "btc:coingecko:dominance:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=300)
        if cached is not None:
            return {**cached, "fromCache": True}

    raw = fetch_json("https://api.coingecko.com/api/v3/global", timeout=30)
    pct = raw.get("data", {}).get("market_cap_percentage", {}).get("btc")
    payload = {
        "value": float(pct) if pct is not None else None,
        "source": "CoinGecko",
        "fetchedAt": _now_iso(),
        "fromCache": False,
    }
    cache_set(cache_key, payload)
    return payload


def fetch_binance_open_interest(*, refresh: bool = False) -> dict[str, Any]:
    cache_key = "btc:binance:oi:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=120)
        if cached is not None:
            return {**cached, "fromCache": True}

    raw = fetch_json("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT", timeout=20)
    oi = float(raw.get("openInterest", 0))
    payload = {
        "value": oi,
        "source": "Binance Futures",
        "fetchedAt": _now_iso(),
        "fromCache": False,
    }
    cache_set(cache_key, payload)
    return payload


def _pct_float(s: str | None) -> float | None:
    if not s:
        return None
    try:
        return float(str(s).replace("%", "").strip())
    except ValueError:
        return None


def _int_commas(s: str | None) -> int | None:
    if not s:
        return None
    try:
        return int(str(s).replace(",", "").strip())
    except ValueError:
        return None


def _float_commas(s: str | None) -> float | None:
    if not s:
        return None
    try:
        return float(str(s).replace(",", "").strip())
    except ValueError:
        return None


def hash_rate_to_ehs(zhs: float | None) -> float | None:
    if zhs is None:
        return None
    return zhs * 1000  # ZH/s → EH/s


def blockchain_hashrate_to_ehs(ths: float | None) -> float | None:
    """Blockchain.info hash-rate chart values are in TH/s."""
    if ths is None:
        return None
    return ths / 1e6


def normalize_hash_rate_ehs(
    raw: float | int | None,
    *,
    unit: str | None = None,
    from_store: bool = False,
) -> float | None:
    """Normalize hash-rate readings to EH/s (Bitcoin network is typically 50–5000 EH/s)."""
    if raw is None:
        return None
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    if unit == "EH/s" or from_store:
        return val
    if 50 <= val <= 5000:
        return val
    if val >= 1e5:
        return blockchain_hashrate_to_ehs(val)
    if 0 < val < 50:
        fixed = val * 1e6
        if 50 <= fixed <= 5000:
            return fixed
    converted = blockchain_hashrate_to_ehs(val)
    if converted is not None and 50 <= converted <= 5000:
        return converted
    return val if val >= 50 else converted