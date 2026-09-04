"""Multi-venue BTC/ETH market proxy — Binance is often blocked in-browser.

Same-origin JSON for spot ticker, klines (Binance-shaped), ETH daily, and perp OI.
Venues tried in order: Coinbase, Kraken, OKX, Bitstamp, then Binance.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

USER_AGENT = "BTC-Dashboard/1.0 (+market-feed)"
CACHE_TTL = 20
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

GRANULARITY = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "6h": 21600,
    "1d": 86400,
    "1D": 86400,
    "1w": 604800,
    "1W": 604800,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _cache_get(key: str) -> dict[str, Any] | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, val = hit
    if time.time() - ts > CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    return dict(val)


def _cache_set(key: str, val: dict[str, Any]) -> dict[str, Any]:
    _CACHE[key] = (time.time(), val)
    return val


def _fetch_json(url: str, *, timeout: int = 8) -> Any:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _f(v) -> float | None:
    try:
        if v is None or v == "":
            return None
        n = float(v)
        return n if n == n else None
    except (TypeError, ValueError):
        return None


def _binance_kline_row(open_ms: int, o: float, h: float, low: float, c: float, v: float, gran_s: int) -> list:
    close_ms = open_ms + gran_s * 1000 - 1
    return [open_ms, str(o), str(h), str(low), str(c), str(v), close_ms, "0", 0, "0", "0", "0"]


def _coinbase_ticker(product: str = "BTC-USD") -> dict[str, Any] | None:
    ticker = _fetch_json(f"https://api.exchange.coinbase.com/products/{product}/ticker")
    stats = _fetch_json(f"https://api.exchange.coinbase.com/products/{product}/stats")
    price = _f(ticker.get("price"))
    if not price:
        return None
    open_p = _f(stats.get("open")) or price
    vol = _f(stats.get("volume")) or _f(ticker.get("volume")) or 0.0
    return {
        "venue": "Coinbase",
        "pair": product.replace("-", "/"),
        "lastPrice": str(price),
        "openPrice": str(open_p),
        "highPrice": str(_f(stats.get("high")) or price),
        "lowPrice": str(_f(stats.get("low")) or price),
        "volume": str(vol),
        "quoteVolume": str(vol * price),
        "bidPrice": str(_f(ticker.get("bid")) or price),
        "askPrice": str(_f(ticker.get("ask")) or price),
        "weightedAvgPrice": str(price),
        "priceChangePercent": str(((price - open_p) / open_p) * 100) if open_p else "0",
    }


def _kraken_ticker() -> dict[str, Any] | None:
    raw = _fetch_json("https://api.kraken.com/0/public/Ticker?pair=XBTUSD")
    result = (raw.get("result") or {})
    row = next(iter(result.values()), None) if isinstance(result, dict) else None
    if not isinstance(row, dict):
        return None
    price = _f((row.get("c") or [None])[0])
    if not price:
        return None
    open_p = _f(row.get("o")) or price
    vol = _f((row.get("v") or [None, None])[1]) or 0.0
    high = _f((row.get("h") or [None, None])[1]) or price
    low = _f((row.get("l") or [None, None])[1]) or price
    bid = _f((row.get("b") or [None])[0]) or price
    ask = _f((row.get("a") or [None])[0]) or price
    return {
        "venue": "Kraken",
        "pair": "BTC/USD",
        "lastPrice": str(price),
        "openPrice": str(open_p),
        "highPrice": str(high),
        "lowPrice": str(low),
        "volume": str(vol),
        "quoteVolume": str(vol * price),
        "bidPrice": str(bid),
        "askPrice": str(ask),
        "weightedAvgPrice": str(price),
        "priceChangePercent": str(((price - open_p) / open_p) * 100) if open_p else "0",
    }


def _okx_ticker() -> dict[str, Any] | None:
    raw = _fetch_json("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT")
    row = ((raw.get("data") or [None])[0]) if isinstance(raw, dict) else None
    if not isinstance(row, dict):
        return None
    price = _f(row.get("last"))
    if not price:
        return None
    open_p = _f(row.get("open24h")) or price
    vol = _f(row.get("vol24h")) or 0.0
    return {
        "venue": "OKX",
        "pair": "BTC/USDT",
        "lastPrice": str(price),
        "openPrice": str(open_p),
        "highPrice": str(_f(row.get("high24h")) or price),
        "lowPrice": str(_f(row.get("low24h")) or price),
        "volume": str(vol),
        "quoteVolume": str(_f(row.get("volCcy24h")) or vol * price),
        "bidPrice": str(_f(row.get("bidPx")) or price),
        "askPrice": str(_f(row.get("askPx")) or price),
        "weightedAvgPrice": str(price),
        "priceChangePercent": str(((price - open_p) / open_p) * 100) if open_p else "0",
    }


def _bitstamp_ticker() -> dict[str, Any] | None:
    row = _fetch_json("https://www.bitstamp.net/api/v2/ticker/btcusd")
    price = _f(row.get("last"))
    if not price:
        return None
    open_p = _f(row.get("open")) or price
    vol = _f(row.get("volume")) or 0.0
    return {
        "venue": "Bitstamp",
        "pair": "BTC/USD",
        "lastPrice": str(price),
        "openPrice": str(open_p),
        "highPrice": str(_f(row.get("high")) or price),
        "lowPrice": str(_f(row.get("low")) or price),
        "volume": str(vol),
        "quoteVolume": str(vol * price),
        "bidPrice": str(_f(row.get("bid")) or price),
        "askPrice": str(_f(row.get("ask")) or price),
        "weightedAvgPrice": str(_f(row.get("vwap")) or price),
        "priceChangePercent": str(((price - open_p) / open_p) * 100) if open_p else "0",
    }


def _binance_ticker() -> dict[str, Any] | None:
    row = _fetch_json("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")
    price = _f(row.get("lastPrice"))
    if not price:
        return None
    row["venue"] = "Binance"
    row["pair"] = "BTC/USDT"
    return row


def get_spot_quote(*, refresh: bool = False) -> dict[str, Any]:
    key = "market:quote:v1"
    if not refresh:
        cached = _cache_get(key)
        if cached:
            cached["fromCache"] = True
            return cached
    errors: list[str] = []
    for fn in (_coinbase_ticker, _kraken_ticker, _okx_ticker, _bitstamp_ticker, _binance_ticker):
        try:
            ticker = fn()
            if ticker and _f(ticker.get("lastPrice")):
                payload = {
                    "ticker": ticker,
                    "venue": ticker.get("venue"),
                    "fetchedAt": _now_iso(),
                    "errors": errors,
                }
                return _cache_set(key, payload)
        except Exception as exc:
            errors.append(f"{fn.__name__}: {exc}")
    return {"ticker": None, "venue": None, "error": "All venues failed", "errors": errors, "fetchedAt": _now_iso()}


def _coinbase_candles(product: str, gran: int, limit: int) -> list[list]:
    # Coinbase max 300 candles per request
    end = int(time.time())
    start = end - gran * min(limit, 300)
    url = (
        f"https://api.exchange.coinbase.com/products/{product}/candles"
        f"?granularity={gran}&start={start}&end={end}"
    )
    raw = _fetch_json(url)
    if not isinstance(raw, list):
        return []
    # Coinbase: [time, low, high, open, close, volume], newest first
    rows = []
    for item in reversed(raw):
        if not isinstance(item, (list, tuple)) or len(item) < 6:
            continue
        t, low, high, o, c, v = item[:6]
        open_ms = int(float(t) * 1000)
        rows.append(_binance_kline_row(open_ms, float(o), float(high), float(low), float(c), float(v), gran))
    return rows[-limit:]


def _kraken_ohlc(interval_min: int, limit: int) -> list[list]:
    raw = _fetch_json(f"https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval={interval_min}")
    result = raw.get("result") or {}
    series = None
    for k, v in result.items():
        if k != "last" and isinstance(v, list):
            series = v
            break
    if not series:
        return []
    gran = interval_min * 60
    rows = []
    for item in series[-limit:]:
        t, o, h, low, c, _vwap, v, _cnt = item[:8]
        open_ms = int(float(t) * 1000)
        rows.append(_binance_kline_row(open_ms, float(o), float(h), float(low), float(c), float(v), gran))
    return rows


def get_klines(*, interval: str = "1m", limit: int = 500, product: str = "BTC-USD", refresh: bool = False) -> dict[str, Any]:
    interval = interval or "1m"
    limit = max(10, min(int(limit or 500), 1000))
    key = f"market:klines:{product}:{interval}:{limit}"
    if not refresh:
        cached = _cache_get(key)
        if cached:
            cached["fromCache"] = True
            return cached
    gran = GRANULARITY.get(interval, 60)
    errors: list[str] = []
    klines: list[list] = []
    venue = None
    try:
        klines = _coinbase_candles(product, gran if gran in (60, 300, 900, 3600, 21600, 86400) else 3600, limit)
        venue = "Coinbase"
    except Exception as exc:
        errors.append(f"coinbase: {exc}")
    if len(klines) < 10:
        try:
            mins = max(1, gran // 60)
            if mins not in (1, 5, 15, 60, 240, 1440, 10080):
                mins = 60
            klines = _kraken_ohlc(mins, limit)
            venue = "Kraken"
        except Exception as exc:
            errors.append(f"kraken: {exc}")
    if len(klines) < 10:
        try:
            raw = _fetch_json(
                "https://api.binance.com/api/v3/klines?"
                + urllib.parse.urlencode({"symbol": "BTCUSDT", "interval": interval, "limit": limit})
            )
            if isinstance(raw, list) and raw:
                klines = raw
                venue = "Binance"
        except Exception as exc:
            errors.append(f"binance: {exc}")
    if not klines:
        return {"klines": [], "venue": None, "error": "No klines", "errors": errors, "fetchedAt": _now_iso()}
    payload = {
        "klines": klines,
        "venue": venue,
        "interval": interval,
        "fetchedAt": _now_iso(),
        "errors": errors,
    }
    return _cache_set(key, payload)


def get_eth_daily(*, refresh: bool = False) -> dict[str, Any]:
    key = "market:eth-daily:v1"
    if not refresh:
        cached = _cache_get(key)
        if cached:
            cached["fromCache"] = True
            return cached
    errors: list[str] = []
    days: list[dict[str, Any]] = []
    venue = None
    try:
        rows = _coinbase_candles("ETH-USD", 86400, 300)
        venue = "Coinbase"
        for k in rows:
            days.append({
                "date": int(k[0]),
                "open": float(k[1]),
                "high": float(k[2]),
                "low": float(k[3]),
                "close": float(k[4]),
                "volume": float(k[5]),
            })
    except Exception as exc:
        errors.append(f"coinbase eth: {exc}")
    if len(days) < 30:
        try:
            raw = _fetch_json("https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1440")
            result = raw.get("result") or {}
            series = next((v for k, v in result.items() if k != "last" and isinstance(v, list)), [])
            days = []
            for item in series[-300:]:
                t, o, h, low, c, _vwap, v, _cnt = item[:8]
                days.append({
                    "date": int(float(t) * 1000),
                    "open": float(o),
                    "high": float(h),
                    "low": float(low),
                    "close": float(c),
                    "volume": float(v),
                })
            venue = "Kraken"
        except Exception as exc:
            errors.append(f"kraken eth: {exc}")
    if len(days) < 30:
        return {"days": [], "error": "ETH daily unavailable", "errors": errors, "fetchedAt": _now_iso()}
    payload = {"days": days, "venue": venue, "fetchedAt": _now_iso(), "errors": errors}
    return _cache_set(key, payload)


def get_perp_snapshot(*, refresh: bool = False) -> dict[str, Any]:
    key = "market:perp:v1"
    if not refresh:
        cached = _cache_get(key)
        if cached:
            cached["fromCache"] = True
            return cached
    errors: list[str] = []
    out: dict[str, Any] = {"fetchedAt": _now_iso()}
    try:
        tick = _fetch_json("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP")
        row = (tick.get("data") or [None])[0] or {}
        oi = _fetch_json("https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP")
        oi_row = (oi.get("data") or [None])[0] or {}
        ls = _fetch_json(
            "https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio"
            "?instId=BTC-USDT-SWAP&period=1H"
        )
        ls_row = (ls.get("data") or [None])[0] or {}
        last = _f(row.get("last"))
        mark = _f(row.get("markPx") or row.get("last"))
        funding = _f(row.get("fundingRate"))
        if funding is None:
            try:
                fr = _fetch_json(
                    "https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP"
                )
                funding = _f(((fr.get("data") or [None])[0] or {}).get("fundingRate"))
            except Exception:
                funding = None
        out.update({
            "venue": "OKX",
            "lastPrice": last,
            "markPrice": mark,
            "indexPrice": _f(row.get("idxPx")) or last,
            "openInterest": _f(oi_row.get("oiCcy") or oi_row.get("oi")),
            "fundingRate": funding,
            "longShortRatio": _f(ls_row.get("longShortRatio") or (ls_row[1] if isinstance(ls_row, list) and len(ls_row) > 1 else None)),
            "highPrice": _f(row.get("high24h")),
            "lowPrice": _f(row.get("low24h")),
            "volume": _f(row.get("vol24h")),
            "quoteVolume": _f(row.get("volCcy24h")),
        })
        return _cache_set(key, {**out, "errors": errors})
    except Exception as exc:
        errors.append(f"okx perp: {exc}")
    try:
        raw = _fetch_json("https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT")
        row = ((raw.get("result") or {}).get("list") or [None])[0] or {}
        last = _f(row.get("lastPrice"))
        out.update({
            "venue": "Bybit",
            "lastPrice": last,
            "markPrice": _f(row.get("markPrice")) or last,
            "indexPrice": _f(row.get("indexPrice")) or last,
            "openInterest": _f(row.get("openInterest")),
            "fundingRate": _f(row.get("fundingRate")),
            "highPrice": _f(row.get("highPrice24h")),
            "lowPrice": _f(row.get("lowPrice24h")),
            "volume": _f(row.get("volume24h")),
            "quoteVolume": _f(row.get("turnover24h")),
        })
        return _cache_set(key, {**out, "errors": errors})
    except Exception as exc:
        errors.append(f"bybit perp: {exc}")
    out["error"] = "Perp venues failed"
    out["errors"] = errors
    return out


def get_spot_bundle(*, refresh: bool = False) -> dict[str, Any]:
    quote = get_spot_quote(refresh=refresh)
    klines = get_klines(interval="1m", limit=500, refresh=refresh)
    ticker = quote.get("ticker") or {}
    bid = _f(ticker.get("bidPrice"))
    ask = _f(ticker.get("askPrice"))
    depth = {
        "bids": [[str(bid), "1"]] if bid else [],
        "asks": [[str(ask), "1"]] if ask else [],
    }
    try:
        book = _fetch_json("https://api.exchange.coinbase.com/products/BTC-USD/book?level=2")
        bids = [[str(p), str(q)] for p, q, *_ in (book.get("bids") or [])[:20]]
        asks = [[str(p), str(q)] for p, q, *_ in (book.get("asks") or [])[:20]]
        if len(bids) >= 5 and len(asks) >= 5:
            depth = {"bids": bids, "asks": asks}
    except Exception:
        pass
    return {
        "ticker": ticker,
        "klines": klines.get("klines") or [],
        "depth": depth,
        "venue": quote.get("venue") or klines.get("venue"),
        "fetchedAt": _now_iso(),
        "errors": (quote.get("errors") or []) + (klines.get("errors") or []),
    }
