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
    "exchange_netflow": {
        "path": "exchange-netflow-btc",
        "value_key": "exchangeNetflowBtc",
        "requires_token": True,
    },
    "exchange_inflow": {
        "path": "exchange-inflow-btc",
        "value_key": "exchangeInflowBtc",
        "requires_token": True,
    },
    "exchange_outflow": {
        "path": "exchange-outflow-btc",
        "value_key": "exchangeOutflowBtc",
        "requires_token": True,
    },
}

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
            "Set BGEOMETRICS_API_KEY in .env.local for higher limits."
        )
    return raw_msg


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
        "auth": "Bearer token" if token else "free tier (no token)",
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

    token = bgeometrics_token()
    if spec.get("requires_token") and not token:
        return {
            "latest": None,
            "source": "BGeometrics",
            "error": "Advanced plan token required (set BGEOMETRICS_API_KEY in env)",
            "fetchedAt": _now_iso(),
            "requiresToken": True,
        }

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
        if stale:
            return {**stale, "fromCache": True, "stale": True, "error": msg}
        return {"latest": None, "source": "BGeometrics", "error": msg, "fetchedAt": _now_iso()}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        if stale:
            return {**stale, "fromCache": True, "stale": True, "error": str(exc)}
        return {"latest": None, "source": "BGeometrics", "error": str(exc), "fetchedAt": _now_iso()}

    if isinstance(raw, dict) and raw.get("error"):
        err = raw["error"]
        msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        if stale:
            return {**stale, "fromCache": True, "stale": True, "error": msg}
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

    token = bgeometrics_token()
    if spec.get("requires_token") and not token:
        return {
            "series": [],
            "latest": None,
            "source": "BGeometrics",
            "error": "Advanced plan token required (set BGEOMETRICS_API_KEY in env)",
            "fetchedAt": _now_iso(),
            "requiresToken": True,
        }

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
        if stale:
            return {**stale, "fromCache": True, "stale": True, "error": msg}
        return {"series": [], "latest": None, "source": "BGeometrics", "error": msg, "fetchedAt": _now_iso()}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        if stale:
            return {**stale, "fromCache": True, "stale": True, "error": str(exc)}
        return {"series": [], "latest": None, "source": "BGeometrics", "error": str(exc), "fetchedAt": _now_iso()}

    if isinstance(raw, dict) and raw.get("error"):
        err = raw["error"]
        msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        if stale:
            return {**stale, "fromCache": True, "stale": True, "error": msg}
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


def _extract_bgeometrics_value(row: dict, spec: dict[str, Any]) -> float | None:
    value_key = spec.get("value_key")
    if value_key == "_hodl_1y_plus_pct":
        return _hodl_1y_plus_pct(row)

    if value_key and value_key in row and row[value_key] is not None:
        return float(row[value_key])

    if value_key:
        for k, v in row.items():
            if k.lower() == str(value_key).lower() and v is not None:
                return float(v)

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