"""Fetchers for Bitcoin indicator data."""

from __future__ import annotations

import json
import os
import re
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

BGEOMETRICS_BASE = os.environ.get("BGEOMETRICS_API_BASE", "https://api.bgeometrics.com/v1")
BGEOMETRICS_KEY = os.environ.get("BGEOMETRICS_API_KEY", "").strip()

BLOCKCHAIN_CHARTS = {
    "hash-rate": "hash-rate",
    "n-unique-addresses": "n-unique-addresses",
    "miners-revenue": "miners-revenue",
    "market-price": "market-price",
}

BGEOMETRICS_SERIES = {
    "mvrv": "mvrv",
    "mvrv_z_score": "mvrv_z_score",
    "realized_price": "realized_price",
    "exchange_netflow": "exchange_netflow",
    "exchange_inflow": "exchange_inflow",
    "exchange_outflow": "exchange_outflow",
    "hodl_waves": "hodl_waves",
    "puell_multiple": "puell_multiple",
}


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


def _bgeometrics_url(metric: str) -> str:
    base = BGEOMETRICS_BASE.rstrip("/")
    url = f"{base}/{metric}"
    if BGEOMETRICS_KEY:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}api_key={BGEOMETRICS_KEY}"
    return url


def fetch_bgeometrics_series(metric: str, *, refresh: bool = False) -> dict[str, Any]:
    cache_key = f"btc:bg:{metric}:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    url = _bgeometrics_url(metric)
    try:
        raw = fetch_json(url, timeout=60)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
        if stale:
            return {**stale, "fromCache": True, "stale": True, "error": str(exc)}
        return {"series": [], "latest": None, "source": "BGeometrics", "error": str(exc), "fetchedAt": _now_iso()}

    if isinstance(raw, dict) and raw.get("error"):
        err = raw["error"]
        if isinstance(err, dict):
            stale = cache_get(cache_key, ttl=BGEOMETRICS_TTL * 7)
            if stale:
                return {**stale, "fromCache": True, "stale": True, "error": err.get("message", str(err))}
            return {
                "series": [],
                "latest": None,
                "source": "BGeometrics",
                "error": err.get("message", str(err)),
                "fetchedAt": _now_iso(),
            }

    series = _normalize_bgeometrics(raw, metric)
    latest = series[-1] if series else None
    payload = {
        "series": series,
        "latest": latest,
        "source": "BGeometrics",
        "fetchedAt": _now_iso(),
        "fromCache": False,
    }
    cache_set(cache_key, payload)
    return payload


def _normalize_bgeometrics(raw: Any, metric: str) -> list[dict]:
    if isinstance(raw, list):
        out = []
        for row in raw:
            if not isinstance(row, dict):
                continue
            val = None
            for k in (metric, metric.replace("_", ""), "v", "value", "y"):
                if k in row and row[k] is not None:
                    val = row[k]
                    break
            if val is None:
                for k, v in row.items():
                    if k in ("d", "unixTs", "date", "timestamp", "t"):
                        continue
                    if isinstance(v, (int, float)):
                        val = v
                        break
            ts = row.get("unixTs") or row.get("t") or row.get("timestamp")
            date = row.get("d") or row.get("date")
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

    if isinstance(raw, dict):
        for key in ("data", "values", "series"):
            if key in raw:
                return _normalize_bgeometrics(raw[key], metric)
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