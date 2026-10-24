"""Multi-venue BTC/ETH market proxy — Binance is often blocked in-browser.

Same-origin JSON for spot ticker, klines (Binance-shaped), ETH daily, and perp OI.
The spot card is the median last of the live venues. The order book stays on one venue.
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
# Longer than the 75s warm loop so a pass refreshes the copy before it expires.
# The book client still sends refresh=1 when its own age is past 30s.
CACHE_TTL = 120
DEPTH_CACHE_TTL = 90
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


def _cache_get(key: str, ttl: float | None = None) -> dict[str, Any] | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, val = hit
    if time.time() - ts > (CACHE_TTL if ttl is None else ttl):
        _CACHE.pop(key, None)
        return None
    return dict(val)


def _cache_set(key: str, val: dict[str, Any]) -> dict[str, Any]:
    _CACHE[key] = (time.time(), val)
    return val


def _fetch_json(url: str, *, timeout: float = 8) -> Any:
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


def spot_median_from_rows(rows: list[dict] | None) -> dict[str, Any]:
    """One median of live spot lasts. Unavailable and blank prices are left out."""
    names: list[str] = []
    prices: list[float] = []
    for row in rows or []:
        if not isinstance(row, dict) or row.get("unavailable"):
            continue
        raw = row.get("lastPrice") if row.get("lastPrice") not in (None, "") else row.get("price")
        px = _f(raw)
        name = row.get("venue") or row.get("exchange")
        if px is None or not name:
            continue
        prices.append(px)
        names.append(str(name))
    if not prices:
        return {"median": None, "venueCount": 0, "venues": [], "label": None}
    ordered = sorted(prices)
    mid = len(ordered) // 2
    median = ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2.0
    label = f"Median · {len(names)} venues ({', '.join(names)})"
    return {"median": float(median), "venueCount": len(names), "venues": names, "label": label}


def _median_finite(values) -> float | None:
    ordered = []
    for raw in values:
        try:
            num = float(raw)
        except (TypeError, ValueError):
            continue
        if num == num and num not in (float("inf"), float("-inf")):
            ordered.append(num)
    if not ordered:
        return None
    ordered.sort()
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[mid])
    return float((ordered[mid - 1] + ordered[mid]) / 2.0)


def _median_positive(values) -> float | None:
    return _median_finite([v for v in values if v is not None and _f(v) is not None and _f(v) > 0])


def _ticker_from_exchange_row(row: dict) -> dict[str, Any]:
    """Map one exchange desk row. A missing 24h change stays missing."""
    price = _f(row.get("price") if row.get("price") is not None else row.get("lastPrice"))
    raw_change = row.get("changePct")
    if raw_change is None:
        raw_change = row.get("priceChangePercent")
    change = _f(raw_change) if raw_change is not None else None
    open_px = None
    if change is not None and price and (1.0 + change / 100.0) != 0:
        open_px = price / (1.0 + change / 100.0)
    return {
        "venue": row.get("exchange") or row.get("venue"),
        "lastPrice": price,
        "openPrice": open_px,
        "openIs24h": open_px is not None,
        "changePct": change,
        "highPrice": _f(row.get("high") or row.get("highPrice")),
        "lowPrice": _f(row.get("low") or row.get("lowPrice")),
        "volume": _f(row.get("volume")) or 0,
        "quoteVolume": _f(row.get("quoteVolume") or row.get("volume")) or 0,
        "bidPrice": _f(row.get("bid") if row.get("bid") is not None else row.get("bidPrice")),
        "askPrice": _f(row.get("ask") if row.get("ask") is not None else row.get("askPrice")),
        "priceChangePercent": change,
    }


def _exchange_spot_rows(*, refresh: bool = False) -> tuple[list[dict], str | None]:
    """Live spot rows from the exchanges desk, so both cards share one median.

    A quote refresh reuses the exchange snapshot only when it is younger than 40s.
    Older copies are fetched again so bid/ask cannot sit on a 15-minute cache.
    The second value is that snapshot's fetchedAt, which is the age of the print.
    """
    try:
        from server import _fetch_all_exchange_data, _iso_age_sec

        raw = _fetch_all_exchange_data(refresh=False)
        if refresh:
            age = _iso_age_sec(raw.get("fetchedAt")) if isinstance(raw, dict) else None
            fresh = isinstance(raw, dict) and raw.get("spot") and age is not None and age <= 40
            if not fresh:
                raw = _fetch_all_exchange_data(refresh=True)
    except Exception:
        return [], None
    if not isinstance(raw, dict):
        return [], None
    out = []
    for row in raw.get("spot") or []:
        if isinstance(row, dict) and row.get("price") is not None and not row.get("unavailable"):
            out.append(row)
    return out, raw.get("fetchedAt")


def get_spot_quote(*, refresh: bool = False) -> dict[str, Any]:
    """Median last of every live spot venue. The book venue stays OKX."""
    global _last_quote_venue
    key = "market:quote:v4"
    if not refresh:
        cached = _cache_get(key)
        if cached:
            cached["fromCache"] = True
            _last_quote_venue = "OKX"
            return cached
    errors: list[str] = []
    exchange_rows, quoted_at = _exchange_spot_rows(refresh=refresh)
    rows: list[dict[str, Any]] = []
    if len(exchange_rows) >= 3:
        for row in exchange_rows:
            rows.append(_ticker_from_exchange_row(row))
    else:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        fns = (_coinbase_ticker, _kraken_ticker, _okx_ticker, _bitstamp_ticker, _binance_ticker)
        with ThreadPoolExecutor(max_workers=len(fns)) as pool:
            futs = {pool.submit(fn): fn.__name__ for fn in fns}
            for fut in as_completed(futs):
                name = futs[fut]
                try:
                    ticker = fut.result()
                    if ticker and _f(ticker.get("lastPrice")):
                        rows.append(ticker)
                except Exception as exc:
                    errors.append(f"{name}: {exc}")
    comp = spot_median_from_rows(rows)
    if not rows or comp["median"] is None:
        return {
            "ticker": None,
            "venue": None,
            "error": "All venues failed",
            "errors": errors,
            "fetchedAt": _now_iso(),
        }
    median = comp["median"]
    names = comp["venues"]
    base = min(rows, key=lambda t: abs((_f(t.get("lastPrice")) or median) - median))
    ticker = dict(base)
    def _row_change(row: dict):
        if row.get("changePct") is not None:
            return row.get("changePct")
        return row.get("priceChangePercent")

    med_change = _median_finite(
        [_row_change(r) for r in rows if _row_change(r) is not None]
    )
    med_bid = _median_positive([r.get("bidPrice") for r in rows])
    med_ask = _median_positive([r.get("askPrice") for r in rows])
    open_px = None
    if med_change is not None and (1.0 + med_change / 100.0) != 0:
        open_px = median / (1.0 + med_change / 100.0)
    ticker["lastPrice"] = f"{median:.2f}"
    ticker["weightedAvgPrice"] = f"{median:.2f}"
    ticker["priceSource"] = "median last"
    ticker["openPrice"] = f"{open_px:.2f}" if open_px is not None else None
    ticker["openIs24h"] = open_px is not None
    ticker["priceChangePercent"] = med_change
    ticker["changePct"] = med_change
    ticker["bidPrice"] = f"{med_bid:.2f}" if med_bid is not None else None
    ticker["askPrice"] = f"{med_ask:.2f}" if med_ask is not None else None
    ticker["pair"] = "BTC composite"
    label = comp["label"]
    ticker["venue"] = label
    ticker["lastSource"] = label
    # Depth must not follow the composite label. The ladder is one venue.
    _last_quote_venue = "OKX"
    held_at = quoted_at or _now_iso()
    payload = {
        "ticker": ticker,
        "venue": label,
        "venues": names,
        "venueCount": comp["venueCount"],
        "medianLast": median,
        "priceSource": "median last",
        "quotedAt": held_at,
        "fetchedAt": held_at,
        "errors": errors,
    }
    return _cache_set(key, payload)


def _kline_last_open_ms(rows: list) -> int | None:
    if not rows:
        return None
    try:
        return int(float(rows[-1][0]))
    except (TypeError, ValueError, IndexError):
        return None


def _kline_batch_fresh(rows: list, gran: int, now: float | None = None) -> bool:
    """True when the last open is within max(3 bars, 180 seconds)."""
    last = _kline_last_open_ms(rows)
    if last is None or len(rows) < 10:
        return False
    now_s = time.time() if now is None else float(now)
    max_age = max(int(gran) * 3, 180)
    return (now_s - (last / 1000.0)) <= max_age


def _coinbase_candles(product: str, gran: int, limit: int) -> list[list]:
    # Coinbase returns at most 300 candles. Walk backward, up to 4 pages, when more are requested.
    want = max(1, min(int(limit or 300), 1200))
    pages = 1 if want <= 300 else min(4, (want + 299) // 300)
    end = int(time.time())
    seen: set[int] = set()
    rows: list[list] = []
    for _page in range(pages):
        start = end - gran * min(300, want)
        if start >= end:
            break
        url = (
            f"https://api.exchange.coinbase.com/products/{product}/candles"
            f"?granularity={gran}&start={start}&end={end}"
        )
        raw = _fetch_json(url)
        if not isinstance(raw, list) or not raw:
            break
        page_rows: list[list] = []
        for item in raw:
            if not isinstance(item, (list, tuple)) or len(item) < 6:
                continue
            t, low, high, o, c, v = item[:6]
            open_ms = int(float(t) * 1000)
            if open_ms in seen:
                continue
            seen.add(open_ms)
            page_rows.append(
                _binance_kline_row(open_ms, float(o), float(high), float(low), float(c), float(v), gran)
            )
        if not page_rows:
            break
        rows.extend(page_rows)
        end = min(int(row[0]) for row in page_rows) // 1000
        if len(rows) >= want or len(page_rows) < 10:
            break
    rows.sort(key=lambda row: int(row[0]))
    return rows[-want:]


def _kraken_pair(product: str) -> str:
    return "ETHUSD" if str(product or "").upper().startswith("ETH") else "XBTUSD"


def _okx_inst(product: str) -> str:
    base = "ETH" if str(product or "").upper().startswith("ETH") else "BTC"
    return f"{base}-USDT"


def _bybit_symbol(product: str) -> str:
    base = "ETH" if str(product or "").upper().startswith("ETH") else "BTC"
    return f"{base}USDT"


_OKX_BAR = {
    "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H",
    "6h": "6H", "1d": "1D", "1D": "1D", "1w": "1W", "1W": "1W",
}
_BYBIT_IV = {
    "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240",
    "6h": "360", "1d": "D", "1D": "D", "1w": "W", "1W": "W",
}


def _okx_candles(product: str, interval: str, limit: int) -> list[list]:
    bar = _OKX_BAR.get(interval)
    if not bar:
        return []
    gran = GRANULARITY.get(interval, 60)
    raw = _fetch_json(
        "https://www.okx.com/api/v5/market/candles?"
        + urllib.parse.urlencode({
            "instId": _okx_inst(product),
            "bar": bar,
            "limit": str(min(limit, 300)),
        })
    )
    rows = []
    for item in reversed(raw.get("data") or []):
        if not isinstance(item, (list, tuple)) or len(item) < 6:
            continue
        ts, o, h, low, c, vol = item[:6]
        rows.append(_binance_kline_row(int(float(ts)), float(o), float(h), float(low), float(c), float(vol), gran))
    return rows[-limit:]


def _bybit_candles(product: str, interval: str, limit: int) -> list[list]:
    iv = _BYBIT_IV.get(interval)
    if not iv:
        return []
    gran = GRANULARITY.get(interval, 60)
    raw = _fetch_json(
        "https://api.bybit.com/v5/market/kline?"
        + urllib.parse.urlencode({
            "category": "spot",
            "symbol": _bybit_symbol(product),
            "interval": iv,
            "limit": str(min(limit, 1000)),
        })
    )
    series = (raw.get("result") or {}).get("list") or []
    rows = []
    for item in reversed(series):
        if not isinstance(item, (list, tuple)) or len(item) < 6:
            continue
        ts, o, h, low, c, vol = item[:6]
        rows.append(_binance_kline_row(int(float(ts)), float(o), float(h), float(low), float(c), float(vol), gran))
    return rows[-limit:]


def _kraken_ohlc(interval_min: int, limit: int, pair: str = "XBTUSD") -> list[list]:
    raw = _fetch_json(f"https://api.kraken.com/0/public/OHLC?pair={pair}&interval={interval_min}")
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

    def _try_coinbase() -> list:
        # 4h and 1w are not Coinbase granularities. OKX and Bybit cover those bars.
        if gran not in (60, 300, 900, 3600, 21600, 86400):
            return []
        return _coinbase_candles(product, gran, limit)

    def _try_kraken() -> list:
        mins = max(1, gran // 60)
        if mins not in (1, 5, 15, 60, 240, 1440, 10080):
            mins = 60
        return _kraken_ohlc(mins, limit, _kraken_pair(product))

    def _try_binance() -> list:
        symbol = "ETHUSDT" if str(product).upper().startswith("ETH") else "BTCUSDT"
        raw = _fetch_json(
            "https://api.binance.com/api/v3/klines?"
            + urllib.parse.urlencode({"symbol": symbol, "interval": interval, "limit": limit})
        )
        return raw if isinstance(raw, list) else []

    freshest: tuple[int, list, str] | None = None
    for name, fn in (
        ("Coinbase", _try_coinbase),
        ("OKX", lambda: _okx_candles(product, interval, limit)),
        ("Bybit", lambda: _bybit_candles(product, interval, limit)),
        ("Kraken", _try_kraken),
        ("Binance", _try_binance),
    ):
        try:
            rows = fn() or []
        except Exception as exc:
            errors.append(f"{name.lower()}: {exc}")
            continue
        if len(rows) < 10:
            continue
        last_ms = _kline_last_open_ms(rows) or 0
        if freshest is None or last_ms > freshest[0]:
            freshest = (last_ms, rows, name)
        if _kline_batch_fresh(rows, gran):
            klines = rows
            venue = name
            break
    if not klines and freshest is not None:
        klines = freshest[1]
        venue = freshest[2]
    if not klines:
        return {"klines": [], "venue": None, "error": "No klines", "errors": errors, "fetchedAt": _now_iso()}
    stale = not _kline_batch_fresh(klines, gran)
    payload = {
        "klines": klines,
        "venue": venue,
        "interval": interval,
        "stale": stale,
        "fetchedAt": _now_iso(),
        "errors": errors,
    }
    if stale:
        payload["staleReason"] = "last bar older than 3 intervals"
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


def _post_json(url: str, payload: dict[str, Any], *, timeout: float = 3.5) -> Any:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _okx_perp(*, timeout: float = 3.5) -> dict[str, Any] | None:
    tick = _fetch_json(
        "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP", timeout=timeout
    )
    row = (tick.get("data") or [None])[0] or {}
    last = _f(row.get("last"))
    if last is None:
        return None
    # The ticker payload has no mark or index. Those live on their own endpoints.
    mark = None
    index = None
    funding = None
    next_funding = None
    try:
        mark_raw = _fetch_json(
            "https://www.okx.com/api/v5/public/mark-price?instId=BTC-USDT-SWAP",
            timeout=timeout,
        )
        mark = _f(((mark_raw.get("data") or [None])[0] or {}).get("markPx"))
    except Exception:
        mark = None
    try:
        idx_raw = _fetch_json(
            "https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USDT",
            timeout=timeout,
        )
        index = _f(((idx_raw.get("data") or [None])[0] or {}).get("idxPx"))
    except Exception:
        index = None
    oi = None
    ls = None
    try:
        oi_raw = _fetch_json(
            "https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP",
            timeout=timeout,
        )
        oi_row = (oi_raw.get("data") or [None])[0] or {}
        oi = _f(oi_row.get("oiCcy") or oi_row.get("oi"))
    except Exception:
        pass
    try:
        fr = _fetch_json(
            "https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP",
            timeout=timeout,
        )
        fr_row = (fr.get("data") or [None])[0] or {}
        funding = _f(fr_row.get("fundingRate"))
        # fundingTime is the next settlement; nextFundingTime is the one after.
        nxt = fr_row.get("fundingTime") or fr_row.get("nextFundingTime")
        try:
            nxt_i = int(nxt) if nxt is not None else None
        except (TypeError, ValueError):
            nxt_i = None
        if nxt_i and nxt_i < 1_000_000_000_000:
            nxt_i *= 1000
        if nxt_i and nxt_i < time.time() * 1000:
            alt = fr_row.get("nextFundingTime")
            try:
                nxt_i = int(alt) if alt is not None else nxt_i
            except (TypeError, ValueError):
                pass
        next_funding = nxt_i
    except Exception:
        funding = None
    try:
        ls_raw = _fetch_json(
            "https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio"
            "?ccy=BTC&period=1H",
            timeout=timeout,
        )
        ls_row = (ls_raw.get("data") or [None])[0] or {}
        if isinstance(ls_row, dict):
            ls = _f(ls_row.get("longShortRatio"))
        elif isinstance(ls_row, list) and len(ls_row) > 1:
            ls = _f(ls_row[1])
    except Exception:
        pass
    # USDT-swap volCcy24h is BTC. vol24h is contracts (ctVal 0.01). Notional is BTC * last.
    btc_vol = _f(row.get("volCcy24h"))
    quote_vol = (btc_vol * last) if btc_vol and last else None
    return {
        "venue": "OKX",
        "fallback": True,
        "lastPrice": last,
        "markPrice": mark,
        "indexPrice": index,
        "indexSource": "OKX index",
        "openInterest": oi,
        "fundingRate": funding,
        "nextFundingTime": next_funding,
        "longShortRatio": ls,
        "highPrice": _f(row.get("high24h")),
        "lowPrice": _f(row.get("low24h")),
        "openPrice": _f(row.get("open24h")),
        "volume": btc_vol,
        "quoteVolume": quote_vol,
    }


def _hl_perp(*, timeout: float = 3.5) -> dict[str, Any] | None:
    raw = _post_json(
        "https://api.hyperliquid.xyz/info",
        {"type": "metaAndAssetCtxs"},
        timeout=timeout,
    )
    if not isinstance(raw, list) or len(raw) < 2:
        return None
    universe = (raw[0] or {}).get("universe") or []
    ctxs = raw[1] or []
    idx = next((i for i, u in enumerate(universe) if str(u.get("name") or "") == "BTC"), None)
    if idx is None or idx >= len(ctxs):
        return None
    ctx = ctxs[idx] or {}
    mark = _f(ctx.get("markPx"))
    if mark is None:
        return None
    oracle = _f(ctx.get("oraclePx")) or mark
    return {
        "venue": "Hyperliquid",
        "fallback": True,
        "lastPrice": mark,
        "markPrice": mark,
        "indexPrice": oracle,
        "indexSource": "Hyperliquid oracle",
        "openInterest": _f(ctx.get("openInterest")),
        "fundingRate": _f(ctx.get("funding")),
        "longShortRatio": None,
        "highPrice": _f(ctx.get("dayNtlVlm")),
        "lowPrice": None,
        "openPrice": None,
        "volume": _f(ctx.get("dayNtlVlm")),
        "quoteVolume": _f(ctx.get("dayNtlVlm")),
    }


def _bybit_perp(*, timeout: float = 3.5) -> dict[str, Any] | None:
    raw = _fetch_json(
        "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT",
        timeout=timeout,
    )
    row = ((raw.get("result") or {}).get("list") or [None])[0] or {}
    last = _f(row.get("lastPrice"))
    if last is None:
        return None
    return {
        "venue": "Bybit",
        "fallback": True,
        "lastPrice": last,
        "markPrice": _f(row.get("markPrice")) or last,
        "indexPrice": _f(row.get("indexPrice")) or last,
        "indexSource": "Bybit index",
        "openInterest": _f(row.get("openInterest")),
        "fundingRate": _f(row.get("fundingRate")),
        "longShortRatio": None,
        "highPrice": _f(row.get("highPrice24h")),
        "lowPrice": _f(row.get("lowPrice24h")),
        "openPrice": _f(row.get("prevPrice24h")),
        "volume": _f(row.get("volume24h")),
        "quoteVolume": _f(row.get("turnover24h")),
    }


def get_liquidations(*, refresh: bool = False) -> dict[str, Any]:
    """Recent BTC swap liquidations. OKX public liquidation-orders, then Bybit."""
    key = "market:liquidations:v1"
    if not refresh:
        cached = _cache_get(key)
        if cached:
            cached["fromCache"] = True
            return cached
    errors: list[str] = []
    rows: list[dict[str, Any]] = []
    venue = None
    try:
        raw = _fetch_json(
            "https://www.okx.com/api/v5/public/liquidation-orders"
            "?instType=SWAP&uly=BTC-USDT&state=filled",
            timeout=6,
        )
        for bucket in raw.get("data") or []:
            if not isinstance(bucket, dict):
                continue
            inst = bucket.get("instId") or "BTC-USDT-SWAP"
            for det in bucket.get("details") or []:
                if not isinstance(det, dict):
                    continue
                sz = _f(det.get("sz"))
                px = _f(det.get("bkPx"))
                # USDT-margined BTC swap ctVal is 0.01 BTC.
                btc = (sz * 0.01) if sz is not None else None
                ts = det.get("ts")
                try:
                    ts_i = int(ts) if ts is not None else None
                except (TypeError, ValueError):
                    ts_i = None
                rows.append({
                    "instId": inst,
                    "side": det.get("side"),
                    "posSide": det.get("posSide"),
                    "price": px,
                    "contracts": sz,
                    "btc": btc,
                    "notional": (btc * px) if btc and px else None,
                    "time": ts_i,
                })
        if rows:
            venue = "OKX"
    except Exception as exc:
        errors.append(f"okx: {exc}")
    rows.sort(key=lambda r: r.get("time") or 0, reverse=True)
    payload = {
        "venue": venue or "OKX",
        "rows": rows[:40],
        "count": len(rows[:40]),
        "errors": errors,
        "fetchedAt": _now_iso(),
    }
    if errors and not rows:
        payload["error"] = errors[0]
        return payload
    return _cache_set(key, payload)


def get_perp_snapshot(*, refresh: bool = False, allow_stale: bool = False) -> dict[str, Any]:
    """Return the perp quote.

    The open Perp tab reads with allow_stale so an expired entry still carries
    the last fetchedAt. A live fetch on that path was slow enough for the
    browser to abort, and the card kept the previous stamp.
    """
    key = "market:perp:v3"
    if not refresh:
        hit = _CACHE.get(key)
        if hit:
            stored_at, val = hit
            fresh = time.time() - stored_at <= CACHE_TTL
            if fresh or (allow_stale and val.get("lastPrice")):
                cached = dict(val)
                cached["fromCache"] = True
                if not fresh:
                    cached["stale"] = True
                return cached
            _CACHE.pop(key, None)
    errors: list[str] = []
    out: dict[str, Any] = {"fetchedAt": _now_iso()}
    for name, fn in (("okx", _okx_perp), ("hyperliquid", _hl_perp), ("bybit", _bybit_perp)):
        try:
            row = fn(timeout=3.5)
            if row and row.get("lastPrice"):
                out.update(row)
                out["errors"] = errors
                return _cache_set(key, out)
        except Exception as exc:
            errors.append(f"{name} perp: {exc}")
    out["error"] = "Perp venues failed"
    out["errors"] = errors
    return out


_FUT_MON = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}


def _expiry_ms_from_code(token: str) -> int | None:
    import re
    m = re.match(r"(\d{1,2})([A-Z]{3})(\d{2})$", (token or "").upper())
    if not m:
        return None
    mon = _FUT_MON.get(m.group(2))
    if not mon:
        return None
    year = 2000 + int(m.group(3))
    day = int(m.group(1))
    try:
        return int(datetime(year, mon, day, 8, tzinfo=timezone.utc).timestamp() * 1000)
    except ValueError:
        return None


def _days_to(exp_ms: int | None) -> float | None:
    if not exp_ms:
        return None
    return max(0.0, (exp_ms - time.time() * 1000) / 86_400_000)


def _basis_fields(mark: float | None, index: float | None, days: float | None) -> tuple[float | None, float | None]:
    if not mark or not index:
        return None, None
    pct = (mark - index) / index * 100.0
    ann = (pct / days * 365.0) if days and days > 0.05 else pct
    return pct, ann


def _contract_row(
    symbol: str,
    *,
    margin: str,
    last: float | None,
    mark: float | None,
    index: float | None,
    oi: float | None,
    volume: float | None,
    exp_ms: int | None,
    venue: str | None = None,
    quote_ts: int | float | str | None = None,
) -> dict[str, Any] | None:
    if last is None and mark is None:
        return None
    last_px = last if last is not None else mark
    mark_px = mark if mark is not None else last_px
    days = _days_to(exp_ms)
    basis, ann = _basis_fields(mark_px, index, days)
    price_source = "last"
    if last is not None and mark is not None and last > 0 and abs(mark - last) / last > 0.0015:
        # Last print has drifted from the mark. The desk shows the mark and says so.
        price_source = "mark"
    row = {
        "symbol": symbol,
        "type": "Dated",
        "margin": margin,
        "last": last_px,
        "lastTrade": last,
        "mark": mark_px,
        "priceSource": price_source,
        "index": index,
        "basisPct": basis,
        "annBasisPct": ann,
        "openInterest": oi,
        "volume": volume,
        "deliveryDate": exp_ms,
        "daysToExpiry": days,
        "venue": venue,
    }
    if quote_ts not in (None, ""):
        try:
            quoted = int(float(quote_ts))
            if quoted < 10_000_000_000:
                quoted *= 1000
            row["quoteTs"] = quoted
        except (TypeError, ValueError):
            pass
    return row


def _fetch_okx_dated(index_hint: float | None) -> tuple[list[dict], list[dict], float | None, list[str]]:
    errors: list[str] = []
    usdt: list[dict] = []
    coin: list[dict] = []
    index = index_hint
    try:
        tickers = _fetch_json("https://www.okx.com/api/v5/market/tickers?instType=FUTURES", timeout=4)
        marks = _fetch_json("https://www.okx.com/api/v5/public/mark-price?instType=FUTURES", timeout=4)
        instruments = _fetch_json(
            "https://www.okx.com/api/v5/public/instruments?instType=FUTURES&uly=BTC-USD",
            timeout=4,
        )
        oi_raw = _fetch_json(
            "https://www.okx.com/api/v5/public/open-interest?instType=FUTURES&uly=BTC-USD",
            timeout=4,
        )
        try:
            oi_um = _fetch_json(
                "https://www.okx.com/api/v5/public/open-interest?instType=FUTURES&uly=BTC-USDT",
                timeout=4,
            )
        except Exception:
            oi_um = {"data": []}
        idx_raw = _fetch_json("https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USD", timeout=4)
        index = _f(((idx_raw.get("data") or [None])[0] or {}).get("idxPx")) or index
    except Exception as exc:
        return [], [], index, [f"okx futures: {exc}"]

    mark_map = {r.get("instId"): _f(r.get("markPx")) for r in (marks.get("data") or []) if isinstance(r, dict)}
    inst_map = {r.get("instId"): r for r in (instruments.get("data") or []) if isinstance(r, dict)}
    oi_map = {}
    for r in (oi_raw.get("data") or []) + (oi_um.get("data") or []):
        if isinstance(r, dict):
            oi_map[r.get("instId")] = _f(r.get("oiCcy") or r.get("oi"))
    for row in tickers.get("data") or []:
        if not isinstance(row, dict):
            continue
        inst = str(row.get("instId") or "")
        if not (inst.startswith("BTC-USD-") or inst.startswith("BTC-USD_UM-")):
            continue
        if "SWAP" in inst:
            continue
        meta = inst_map.get(inst) or {}
        try:
            exp_ms = int(meta.get("expTime") or 0) or None
        except (TypeError, ValueError):
            exp_ms = None
        last = _f(row.get("last"))
        mark = mark_map.get(inst) or last
        btc_vol = _f(row.get("volCcy24h"))
        margin = "USDT" if "_UM" in inst else "COIN"
        built = _contract_row(
            inst, margin=margin, last=last, mark=mark, index=index,
            oi=oi_map.get(inst), volume=btc_vol, exp_ms=exp_ms, venue="OKX",
            quote_ts=row.get("ts"),
        )
        if not built:
            continue
        (usdt if margin == "USDT" else coin).append(built)
    usdt.sort(key=lambda c: c.get("deliveryDate") or 0)
    coin.sort(key=lambda c: c.get("deliveryDate") or 0)
    return usdt, coin, index, errors


def _fetch_deribit_dated(index_hint: float | None) -> tuple[list[dict], float | None, list[str]]:
    try:
        raw = _fetch_json(
            "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=future",
            timeout=6,
        )
    except Exception as exc:
        return [], index_hint, [f"deribit futures: {exc}"]
    out = []
    index = index_hint
    for row in raw.get("result") or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("instrument_name") or "")
        if not name.startswith("BTC-") or name.endswith("PERPETUAL"):
            continue
        exp_ms = _expiry_ms_from_code(name.split("-", 1)[-1])
        est = _f(row.get("estimated_delivery_price"))
        if est and est > 1000:
            index = est
        last = _f(row.get("last"))
        mark = _f(row.get("mark_price")) or last
        px = est or index or index_hint
        oi_usd = _f(row.get("open_interest"))
        # Inverse book summary quotes open interest in USD.
        oi_btc = (oi_usd / px) if oi_usd and px and px > 1000 else oi_usd
        built = _contract_row(
            name, margin="COIN", last=last, mark=mark, index=px,
            oi=oi_btc, volume=_f(row.get("volume")), exp_ms=exp_ms, venue="Deribit",
        )
        if built:
            out.append(built)
    out.sort(key=lambda c: c.get("deliveryDate") or 0)
    return out, index, []


def _fetch_bybit_dated(index_hint: float | None) -> tuple[list[dict], dict | None, list[str]]:
    try:
        raw = _fetch_json(
            "https://api.bybit.com/v5/market/tickers?category=inverse&baseCoin=BTC",
            timeout=4,
        )
    except Exception as exc:
        return [], None, [f"bybit futures: {exc}"]
    out = []
    perp = None
    for row in ((raw.get("result") or {}).get("list") or []):
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol") or "")
        if not symbol.startswith("BTC"):
            continue
        try:
            delivery = int(row.get("deliveryTime") or 0)
        except (TypeError, ValueError):
            delivery = 0
        last = _f(row.get("lastPrice"))
        mark = _f(row.get("markPrice")) or last
        index = _f(row.get("indexPrice")) or index_hint
        oi_usd = _f(row.get("openInterest"))
        oi_btc = (oi_usd / index) if oi_usd and index else None
        if delivery <= 0:
            perp = {
                "venue": "Bybit",
                "lastPrice": last,
                "markPrice": mark,
                "indexPrice": index,
                "openInterest": oi_btc,
                "fundingRate": _f(row.get("fundingRate")),
                "volume": _f(row.get("volume24h")),
                "quoteVolume": _f(row.get("turnover24h")),
            }
            continue
        built = _contract_row(
            symbol, margin="COIN", last=last, mark=mark, index=index,
            oi=oi_btc, volume=_f(row.get("volume24h")), exp_ms=delivery, venue="Bybit",
        )
        if built:
            out.append(built)
    out.sort(key=lambda c: c.get("deliveryDate") or 0)
    return out, perp, []


def _expiry_day(row: dict) -> str:
    """Calendar day in UTC. Same expiry with two timestamps is one contract."""
    ms = row.get("deliveryDate")
    try:
        ms_f = float(ms)
    except (TypeError, ValueError):
        ms_f = 0.0
    if ms_f > 0:
        return datetime.fromtimestamp(ms_f / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d")
    return str(row.get("symbol") or "")


def _dedupe_contracts(rows: list[dict]) -> list[dict]:
    """One row per margin and calendar expiry. Keep the higher open interest."""
    best: dict[tuple, dict] = {}
    order: list[tuple] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        key = (row.get("margin"), _expiry_day(row))
        prev = best.get(key)
        if prev is None:
            best[key] = row
            order.append(key)
            continue
        if (row.get("openInterest") or 0) > (prev.get("openInterest") or 0):
            best[key] = row
    out = [best[k] for k in order]
    out.sort(key=lambda c: c.get("deliveryDate") or 0)
    return out


def _curve_tick_label(row: dict) -> str:
    margin = "COIN" if str(row.get("margin") or "").upper().startswith("COIN") else "USDT"
    days = row.get("daysToExpiry")
    if days is None:
        return margin
    try:
        return f"{margin} {int(round(float(days)))}d"
    except (TypeError, ValueError):
        return margin


def get_futures_snapshot(*, refresh: bool = False) -> dict[str, Any]:
    """Dated BTC futures from OKX, Deribit, and Bybit."""
    key = "market:futures:v6"
    if not refresh:
        cached = _cache_get(key)
        if cached:
            cached["fromCache"] = True
            return cached
    from concurrent.futures import ThreadPoolExecutor

    errors: list[str] = []
    perp = get_perp_snapshot(refresh=refresh)
    index_hint = _f(perp.get("indexPrice")) if isinstance(perp, dict) else None
    with ThreadPoolExecutor(max_workers=3) as pool:
        okx_f = pool.submit(_fetch_okx_dated, index_hint)
        deribit_f = pool.submit(_fetch_deribit_dated, index_hint)
        bybit_f = pool.submit(_fetch_bybit_dated, index_hint)
        usdt, coin, okx_index, okx_err = okx_f.result()
        deribit, deribit_index, deribit_err = deribit_f.result()
        bybit, bybit_perp, bybit_err = bybit_f.result()
    errors.extend(okx_err + deribit_err + bybit_err)
    # Index is the perp venue index, then OKX, then Deribit. It is not the spot median.
    index = index_hint or okx_index or deribit_index
    if isinstance(perp, dict) and index and not perp.get("indexPrice"):
        perp["indexPrice"] = index
    usdt = _dedupe_contracts(usdt)
    coin_contracts = _dedupe_contracts((coin or []) + (deribit or []) + (bybit or []))
    curve_usdt = bool(usdt)
    curve_src = (usdt or coin_contracts)[:8]
    curve_margin = "USDT" if curve_usdt else "COIN"
    curve = [{"label": "Perp", "days": 0, "basis": 0, "annBasis": 0, "margin": curve_margin}]
    for c in curve_src:
        if c.get("daysToExpiry") is None:
            continue
        curve.append({
            "label": _curve_tick_label(c),
            "days": c["daysToExpiry"],
            "basis": c.get("basisPct") or 0,
            "annBasis": c.get("annBasisPct") or 0,
            "margin": c.get("margin"),
        })
    index_source = "Index"
    if (
        index is not None
        and index_hint is not None
        and abs(float(index) - float(index_hint)) < 1
        and isinstance(perp, dict)
    ):
        index_source = perp.get("indexSource") or f"{perp.get('venue') or 'Perp'} index"
    elif okx_index is not None and index is not None and abs(float(index) - float(okx_index)) < 1:
        index_source = "OKX index"
    elif deribit_index is not None:
        index_source = "Deribit index"
    venues = []
    if usdt or coin:
        venues.append("OKX")
    if deribit:
        venues.append("Deribit")
    if bybit or bybit_perp:
        venues.append("Bybit")
    if isinstance(perp, dict) and perp.get("venue") and perp.get("lastPrice"):
        if perp["venue"] not in venues:
            venues.insert(0, perp["venue"])
    payload = {
        "venue": "+".join(venues) or "OKX",
        "fallback": True,
        "fetchedAt": _now_iso(),
        "indexPrice": index,
        "indexSource": index_source,
        "curveMargin": curve_margin,
        "curveLabel": "USDT margin" if curve_margin == "USDT" else "COIN margin",
        "perp": perp if isinstance(perp, dict) else {},
        "contracts": (usdt or [])[:12],
        "coinContracts": coin_contracts[:12],
        "curvePoints": curve,
        "errors": errors + (perp.get("errors") if isinstance(perp, dict) else []),
    }
    if (isinstance(perp, dict) and perp.get("lastPrice")) or usdt or coin_contracts:
        return _cache_set(key, payload)
    payload["error"] = "Futures venues failed"
    return payload


def _book_levels(rows, limit: int) -> list[list[str]]:
    out: list[list[str]] = []
    for row in rows or []:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        price, qty = _f(row[0]), _f(row[1])
        if price is None or qty is None or price <= 0 or qty <= 0:
            continue
        out.append([str(price), str(qty)])
        if len(out) >= limit:
            break
    return out


_last_quote_venue: str | None = None


def get_depth(*, limit: int = 20, refresh: bool = False, prefer: str | None = None) -> dict[str, Any]:
    limit = max(5, min(int(limit or 20), 100))
    pref_key = (prefer or _last_quote_venue or "any").strip().lower() or "any"
    key = f"market:depth:v3:{limit}:{pref_key}"
    # Warm copy outlives one 75s pass. A client refresh=1 still fetches a live book.
    if not refresh:
        cached = _cache_get(key, ttl=DEPTH_CACHE_TTL)
        if cached:
            cached["fromCache"] = True
            return cached
    errors: list[str] = []

    def _okx():
        raw = _fetch_json(
            f"https://www.okx.com/api/v5/market/books?instId=BTC-USDT&sz={limit}",
            timeout=4,
        )
        book = (raw.get("data") or [None])[0] or {}
        return _book_levels(book.get("bids"), limit), _book_levels(book.get("asks"), limit), "OKX"

    def _coinbase():
        raw = _fetch_json(
            "https://api.exchange.coinbase.com/products/BTC-USD/book?level=2",
            timeout=4,
        )
        return _book_levels(raw.get("bids"), limit), _book_levels(raw.get("asks"), limit), "Coinbase"

    def _kraken():
        raw = _fetch_json(
            "https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=20",
            timeout=4,
        )
        result = raw.get("result") or {}
        book = next((v for k, v in result.items() if k != "last" and isinstance(v, dict)), {})
        return _book_levels(book.get("bids"), limit), _book_levels(book.get("asks"), limit), "Kraken"

    def _bybit():
        raw = _fetch_json(
            f"https://api.bybit.com/v5/market/orderbook?category=spot&symbol=BTCUSDT&limit={limit}",
            timeout=4,
        )
        book = raw.get("result") or {}
        return _book_levels(book.get("b"), limit), _book_levels(book.get("a"), limit), "Bybit"

    fetchers = [("okx", _okx), ("coinbase", _coinbase), ("kraken", _kraken), ("bybit", _bybit)]
    pref = (prefer or _last_quote_venue or "").strip().lower()
    if pref:
        fetchers.sort(key=lambda item: 0 if pref.startswith(item[0]) or item[0] in pref else 1)
    for name, fn in fetchers:
        try:
            bids, asks, venue = fn()
            if len(bids) >= 5 and len(asks) >= 5:
                return _cache_set(key, {
                    "bids": bids,
                    "asks": asks,
                    "venue": venue,
                    "fetchedAt": _now_iso(),
                    "errors": errors,
                })
        except Exception as exc:
            errors.append(f"{name} depth: {exc}")
    return {
        "bids": [],
        "asks": [],
        "venue": None,
        "error": "Depth unavailable",
        "errors": errors,
        "fetchedAt": _now_iso(),
    }


def _pin_book_top(levels: list, price: float | None, *, bids: bool) -> list:
    """Make row 0 the ticker price and drop levels that would sort back above it."""
    rows: list[list[float]] = []
    for row in levels or []:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        px, qty = _f(row[0]), _f(row[1])
        if px is None or qty is None or px <= 0 or qty <= 0:
            continue
        rows.append([px, qty])
    if price is None or price <= 0 or not rows:
        return [list(row) for row in (levels or [])]
    top_qty = rows[0][1]
    if bids:
        rest = [row for row in rows[1:] if row[0] < price]
    else:
        rest = [row for row in rows[1:] if row[0] > price]
    pinned = [[price, top_qty], *rest][: len(rows)]
    return [[str(px), str(qty)] for px, qty in pinned]


def _depth_aligned_to_ticker(depth: dict[str, Any], ticker: dict[str, Any], quote_venue: str | None) -> dict[str, Any]:
    depth_venue = (depth.get("venue") or "").strip().lower()
    want = (quote_venue or ticker.get("venue") or "").strip().lower()
    if depth_venue and want and depth_venue != want:
        return depth
    return {
        **depth,
        "bids": _pin_book_top(depth.get("bids") or [], _f(ticker.get("bidPrice")), bids=True),
        "asks": _pin_book_top(depth.get("asks") or [], _f(ticker.get("askPrice")), bids=False),
    }


def get_spot_bundle(*, refresh: bool = False) -> dict[str, Any]:
    quote = get_spot_quote(refresh=refresh)
    klines = get_klines(interval="1m", limit=500, refresh=refresh)
    # One venue's book. The composite last is not pinned onto these levels.
    depth = get_depth(limit=40, refresh=refresh, prefer="OKX")
    ticker = quote.get("ticker") or {}
    return {
        "ticker": ticker,
        "klines": klines.get("klines") or [],
        "depth": {
            "bids": (depth.get("bids") or [])[:20],
            "asks": (depth.get("asks") or [])[:20],
            "venue": depth.get("venue"),
            "fetchedAt": depth.get("fetchedAt"),
        },
        "depthVenue": depth.get("venue"),
        "venue": quote.get("venue") or klines.get("venue"),
        "klineVenue": klines.get("venue"),
        "klineStale": bool(klines.get("stale")),
        "venues": quote.get("venues") or [],
        "venueCount": quote.get("venueCount") or len(quote.get("venues") or []),
        "priceSource": quote.get("priceSource") or "median last",
        "quotedAt": quote.get("quotedAt") or quote.get("fetchedAt"),
        "fetchedAt": quote.get("quotedAt") or quote.get("fetchedAt") or _now_iso(),
        "errors": (quote.get("errors") or []) + (klines.get("errors") or []) + (depth.get("errors") or []),
    }
