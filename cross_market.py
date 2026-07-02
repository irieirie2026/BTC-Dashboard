"""Cross-Market Anomaly Monitor — multi-venue BTC prices, FX, premiums, news attribution."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

USER_AGENT = "BTC-Dashboard/1.0 (+cross-market)"
CACHE_TTL = 4  # seconds — fast refresh for anomaly monitor
ROOT = Path(__file__).parent

CROSSES = [
    "BTC/USDT", "BTC/USD", "BTC/KRW", "BTC/JPY", "BTC/EUR",
    "BTC/GBP", "BTC/AUD", "BTC/CAD",
]

FX_PAIRS = ("KRW", "JPY", "EUR", "GBP", "AUD", "CAD")

_cache: dict[str, dict] = {}


def _safe_float(val) -> float | None:
    try:
        if val is None or val == "":
            return None
        f = float(val)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def _get(path: str, url: str, timeout: float = 5.0) -> dict | list | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None


def _fetch_fx_rates() -> dict[str, float]:
    """USD per 1 unit of foreign currency → invert to foreign per USD."""
    data = _get("fx", "https://api.frankfurter.app/latest?from=USD&to=" + ",".join(FX_PAIRS))
    if not data or not data.get("rates"):
        return {}
    out: dict[str, float] = {"USD": 1.0}
    for ccy, per_usd in data["rates"].items():
        if per_usd:
            out[ccy] = float(per_usd)
    return out


def _row(exchange: str, pair: str, price: float | None, *, ccy: str = "USD",
         change_pct: float | None = None, volume: float | None = None,
         market: str = "spot", stale: bool = False, source: str = "rest") -> dict:
    return {
        "exchange": exchange,
        "pair": pair,
        "price": price,
        "ccy": ccy,
        "changePct": change_pct,
        "volume": volume,
        "market": market,
        "stale": stale,
        "source": source,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


def _fetch_binance() -> dict | None:
    d = _get("binance", "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")
    if not d:
        return None
    return _row("Binance", "BTC/USDT", float(d.get("lastPrice") or 0),
                change_pct=float(d.get("priceChangePercent") or 0),
                volume=float(d.get("quoteVolume") or 0))


def _fetch_coinbase() -> dict | None:
    d = _get("coinbase", "https://api.exchange.coinbase.com/products/BTC-USD/ticker")
    if not d:
        return None
    return _row("Coinbase", "BTC/USD", float(d.get("price") or 0))


def _fetch_kraken() -> dict | None:
    d = _get("kraken", "https://api.kraken.com/0/public/Ticker?pair=XBTUSD")
    if not d:
        return None
    res = d.get("result") or {}
    key = next(iter(res), None)
    if not key:
        return None
    t = res[key]
    return _row("Kraken", "BTC/USD", float((t.get("c") or [0])[0]))


def _fetch_upbit() -> dict | None:
    d = _get("upbit", "https://api.upbit.com/v1/ticker?markets=KRW-BTC")
    if not d or not isinstance(d, list) or not d:
        return None
    t = d[0]
    return _row("Upbit", "BTC/KRW", float(t.get("trade_price") or 0), ccy="KRW",
                change_pct=float(t.get("signed_change_rate") or 0) * 100,
                volume=float(t.get("acc_trade_price_24h") or 0))


def _fetch_bithumb() -> dict | None:
    d = _get("bithumb", "https://api.bithumb.com/public/ticker/BTC_KRW")
    if not d or str(d.get("status")) != "0000":
        return None
    t = d.get("data") or {}
    return _row("Bithumb", "BTC/KRW", float(t.get("closing_price") or 0), ccy="KRW",
                change_pct=float(t.get("fluctate_rate_24H") or 0))


def _fetch_bitflyer() -> dict | None:
    d = _get("bitflyer", "https://api.bitflyer.com/v1/ticker?product_code=BTC_JPY")
    if not d:
        return None
    return _row("bitFlyer", "BTC/JPY", float(d.get("ltp") or 0), ccy="JPY",
                volume=float(d.get("volume_by_product") or 0))


def _fetch_okx() -> dict | None:
    d = _get("okx", "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT")
    if not d or not d.get("data"):
        return None
    t = d["data"][0]
    return _row("OKX", "BTC/USDT", float(t.get("last") or 0),
                volume=float(t.get("volCcy24h") or 0))


def _fetch_bybit() -> dict | None:
    d = _get("bybit", "https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT")
    if not d or not d.get("result", {}).get("list"):
        return None
    t = d["result"]["list"][0]
    return _row("Bybit", "BTC/USDT", float(t.get("lastPrice") or 0),
                volume=float(t.get("turnover24h") or 0))


def _fetch_htx() -> dict | None:
    d = _get("htx", "https://api.huobi.pro/market/detail/merged?symbol=btcusdt")
    if not d or not d.get("tick"):
        return None
    tick = d["tick"]
    return _row("HTX", "BTC/USDT", float(tick.get("close") or 0),
                volume=float(tick.get("amount") or 0))


def _fetch_bitfinex() -> dict | None:
    d = _get("bitfinex", "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD")
    if not d or not isinstance(d, list) or len(d) < 7:
        return None
    return _row("Bitfinex", "BTC/USD", float(d[6]))


def _fetch_gemini() -> dict | None:
    d = _get("gemini", "https://api.gemini.com/v1/pubticker/btcusd")
    if not d:
        return None
    return _row("Gemini", "BTC/USD", float(d.get("last") or 0),
                volume=float(d.get("volume", {}).get("BTC") or 0))


def _fetch_bitstamp() -> dict | None:
    d = _get("bitstamp", "https://www.bitstamp.net/api/v2/ticker/btcusd/")
    if not d:
        return None
    return _row("Bitstamp", "BTC/USD", float(d.get("last") or 0),
                volume=float(d.get("volume") or 0))


def _fetch_binance_perp() -> dict | None:
    d = _get("binance_perp", "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT")
    if not d:
        return None
    mark = float(d.get("markPrice") or 0)
    index = float(d.get("indexPrice") or mark)
    basis = ((mark - index) / index * 100) if index else None
    row = _row("Binance", "BTC/USDT Perp", mark, market="perp")
    row["basisPct"] = basis
    row["fundingRate"] = float(d.get("lastFundingRate") or 0) * 100
    return row


def _fetch_bybit_perp() -> dict | None:
    d = _get("bybit_perp", "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT")
    if not d or not d.get("result", {}).get("list"):
        return None
    t = d["result"]["list"][0]
    mark = float(t.get("markPrice") or t.get("lastPrice") or 0)
    index = float(t.get("indexPrice") or mark)
    basis = ((mark - index) / index * 100) if index else None
    row = _row("Bybit", "BTC/USDT Perp", mark, market="perp")
    row["basisPct"] = basis
    row["fundingRate"] = float(t.get("fundingRate") or 0) * 100
    return row


def _to_usd(price: float | None, ccy: str, fx: dict[str, float]) -> float | None:
    if price is None:
        return None
    if ccy == "USD" or ccy == "USDT":
        return price
    rate = fx.get(ccy)
    if not rate or rate <= 0:
        return None
    return price / rate


def _compute_premiums(venues: list[dict], fx: dict[str, float]) -> dict:
    usd_prices: dict[str, float] = {}
    for v in venues:
        usd = _to_usd(v.get("price"), v.get("ccy", "USD"), fx)
        if usd and usd > 0:
            usd_prices[v["exchange"]] = usd
            v["priceUsd"] = round(usd, 2)

    ref = usd_prices.get("Binance") or _median(list(usd_prices.values()))
    premiums: dict[str, dict] = {}

    def prem(label: str, local: float | None, ref_px: float | None) -> dict | None:
        if not local or not ref_px or ref_px <= 0:
            return None
        pct = (local - ref_px) / ref_px * 100
        return {"label": label, "pct": round(pct, 3), "localUsd": round(local, 2), "refUsd": round(ref_px, 2)}

    upbit = usd_prices.get("Upbit")
    bithumb = usd_prices.get("Bithumb")
    kr_local = upbit or bithumb
    if kr_local and ref:
        premiums["kimchi"] = prem("Kimchi (KRW)", kr_local, ref)

    cb = usd_prices.get("Coinbase")
    if cb and ref:
        premiums["coinbase"] = prem("Coinbase USD", cb, ref)

    jpy_v = usd_prices.get("bitFlyer")
    if jpy_v and ref:
        premiums["jpy"] = prem("Japan (JPY)", jpy_v, ref)

    for ex in ("Kraken", "Bitstamp", "Gemini"):
        px = usd_prices.get(ex)
        if px and ref:
            premiums[ex.lower()] = prem(f"{ex} USD", px, ref)

    return {"referenceUsd": ref, "premiums": premiums}


def _median(vals: list[float]) -> float | None:
    if not vals:
        return None
    s = sorted(vals)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


def _fetch_venues() -> tuple[list[dict], list[str]]:
    fetchers = [
        _fetch_binance, _fetch_coinbase, _fetch_kraken, _fetch_upbit, _fetch_bithumb,
        _fetch_bitflyer, _fetch_okx, _fetch_bybit, _fetch_htx, _fetch_bitfinex,
        _fetch_gemini, _fetch_bitstamp, _fetch_binance_perp, _fetch_bybit_perp,
    ]
    venues: list[dict] = []
    errors: list[str] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(fn): fn.__name__ for fn in fetchers}
        for fut in as_completed(futs):
            name = futs[fut]
            try:
                row = fut.result()
                if row and row.get("price"):
                    row["fetchedAt"] = datetime.now(timezone.utc).isoformat()
                    row["stale"] = False
                    venues.append(row)
            except Exception as exc:
                errors.append(f"{name}: {exc}")

    try:
        from cross_market_dex import fetch_all_dex_venues

        dex_rows, dex_errs = fetch_all_dex_venues()
        for row in dex_rows:
            row["fetchedAt"] = datetime.now(timezone.utc).isoformat()
            row["stale"] = False
            venues.append(row)
        errors.extend(dex_errs)
    except Exception as exc:
        errors.append(f"dex: {exc}")

    return venues, errors


def _attribute_news(keywords: list[str], limit: int = 6) -> list[dict]:
    articles: list[dict] = []
    try:
        from server import get_news_payload

        for section in ("all", "market", "x"):
            try:
                payload = get_news_payload(section, refresh=False)
            except Exception:
                continue
            batch = payload.get("articles") or payload.get("items") or []
            seen = {a.get("link") or a.get("url") for a in articles}
            for art in batch:
                link = art.get("link") or art.get("url")
                if link and link in seen:
                    continue
                if link:
                    seen.add(link)
                articles.append(art)
    except Exception:
        return []
    if not articles:
        return []
    blob_kw = [k.lower() for k in keywords if k]
    scored: list[tuple[float, dict]] = []
    for art in articles[:80]:
        title = (art.get("title") or "").lower()
        summary = (art.get("summary") or art.get("description") or "").lower()
        text = f"{title} {summary}"
        score = 0.0
        for kw in blob_kw:
            if kw in text:
                score += 2.0 if len(kw) > 4 else 1.0
        if re.search(r"\b(korea|korean|kimchi|upbit|bithumb|impeach|tariff|etf|sec|institutional)\b", text):
            score += 1.5
        if score > 0:
            scored.append((score, {
                "title": art.get("title"),
                "link": art.get("link") or art.get("url"),
                "source": art.get("source"),
                "published": art.get("published"),
                "confidence": min(0.95, 0.35 + score * 0.12),
                "sentiment": art.get("sentiment"),
            }))
    scored.sort(key=lambda x: -x[0])
    return [s[1] for s in scored[:limit]]


def _venues_from_exchange_cache() -> tuple[list[dict], list[str]]:
    """Fallback: reuse server.py cross-exchange spot table (15m cache)."""
    try:
        from server import _fetch_all_exchange_data

        raw = _fetch_all_exchange_data()
        venues: list[dict] = []
        for r in raw.get("spot") or []:
            px = _safe_float(r.get("price"))
            if not px:
                continue
            pair = r.get("pair") or "BTC/USD"
            ccy = "USDT" if "USDT" in pair.upper() else "USD"
            venues.append(_row(r.get("exchange") or "?", pair, px, ccy=ccy, change_pct=r.get("changePct"), volume=r.get("volume")))
        for r in raw.get("perp") or []:
            px = _safe_float(r.get("price"))
            if not px:
                continue
            row = _row(r.get("exchange") or "?", r.get("pair") or "BTC Perp", px, market="perp")
            row["basisPct"] = r.get("basisPct")
            venues.append(row)
        return venues, list(raw.get("errors") or [])
    except Exception as exc:
        return [], [f"exchange_cache: {exc}"]


def _pack_snapshot(
    venues: list[dict],
    errors: list[str],
    fx: dict[str, float] | None = None,
    *,
    fallback: bool = False,
) -> dict:
    fx = fx if fx is not None else (_fetch_fx_rates() or {})
    prem = _compute_premiums(venues, fx)
    ref = prem.get("referenceUsd")
    vwap = _median([v["priceUsd"] for v in venues if v.get("priceUsd")])
    return {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "crosses": CROSSES,
        "fx": fx,
        "referenceUsd": ref,
        "vwapUsd": round(vwap, 2) if vwap else None,
        "venues": venues,
        "premiums": prem.get("premiums") or {},
        "errors": errors,
        "staleVenues": [v["exchange"] for v in venues if v.get("stale")],
        "fallback": fallback,
    }


def get_cross_market_snapshot(*, refresh: bool = False) -> dict:
    key = "cross_market:snapshot"
    now = time.time()
    entry = _cache.get(key)
    if not refresh and entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]

    try:
        fx, (venues, errors) = {}, ([], [])
        with ThreadPoolExecutor(max_workers=2) as pool:
            fx_fut = pool.submit(_fetch_fx_rates)
            ven_fut = pool.submit(_fetch_venues)
            fx = fx_fut.result(timeout=12) or {}
            venues, errors = ven_fut.result(timeout=12)

        if len(venues) < 3:
            cached, cache_errs = _venues_from_exchange_cache()
            if cached:
                venues = cached
                errors = errors + cache_errs

        if not venues:
            raise RuntimeError("No venue prices available")

        data = _pack_snapshot(venues, errors, fx, fallback=False)
        _cache[key] = {"ts": now, "data": data}
        return data
    except Exception as exc:
        cached, cache_errs = _venues_from_exchange_cache()
        if len(cached) >= 2:
            try:
                data = _pack_snapshot(
                    cached,
                    [f"degraded: {exc}"] + cache_errs,
                    fallback=False,
                )
                data["partial"] = True
                _cache[key] = {"ts": now, "data": data}
                return data
            except Exception:
                pass
        sample = get_sample_payload()
        if not isinstance(sample, dict):
            sample = {}
        out = dict(sample)
        out["errors"] = [str(exc)] + list(out.get("errors") or [])
        out["fallback"] = True
        out["demo"] = True
        out["updatedAt"] = datetime.now(timezone.utc).isoformat()
        _cache[key] = {"ts": now, "data": out}
        return out


def build_snapshot_from_exchange_payloads(
    spot_payload: dict | None,
    perp_payload: dict | None = None,
    *,
    errors: list[str] | None = None,
    partial: bool = False,
) -> dict:
    """Build a cross-market snapshot from server.py exchange table payloads."""
    venues: list[dict] = []
    for payload, market in ((spot_payload, "spot"), (perp_payload, "perp")):
        if not payload:
            continue
        for row in payload.get("table") or []:
            px = _safe_float(row.get("price"))
            if not px:
                continue
            pair = row.get("pair") or ("BTC/USDT Perp" if market == "perp" else "BTC/USDT")
            ccy = "USDT" if "USDT" in pair.upper() else "USD"
            venues.append(
                _row(
                    row.get("exchange") or "?",
                    pair,
                    px,
                    ccy=ccy,
                    change_pct=_safe_float(row.get("changePct")),
                    volume=_safe_float(row.get("volume")),
                    market=market,
                )
            )
    if len(venues) < 2:
        raise ValueError("exchange payloads yielded fewer than 2 venues")
    data = _pack_snapshot(venues, list(errors or []), _fetch_fx_rates(), fallback=False)
    if partial:
        data["partial"] = True
    return data


def get_cross_market_news(body: dict | None = None) -> dict:
    body = body or {}
    keywords = body.get("keywords") or []
    anomaly_type = (body.get("type") or "").lower()
    defaults = {
        "kimchi": ["korea", "kimchi", "upbit", "bithumb", "krw", "bitcoin"],
        "coinbase": ["coinbase", "institutional", "tariff", "etf", "cme", "bitcoin"],
        "premium": ["premium", "arbitrage", "spread", "bitcoin", "btc"],
        "shock": ["bitcoin", "btc", "crash", "surge", "liquidation", "volatility"],
        "return": ["bitcoin", "btc", "surge", "crash", "liquidation", "volatility"],
        "volume": ["bitcoin", "btc", "volume", "liquidation", "whale"],
        "divergence": ["bitcoin", "btc", "arbitrage", "exchange", "spread"],
        "cross": ["bitcoin", "btc", "arbitrage", "exchange"],
    }
    for k, words in defaults.items():
        if k in anomaly_type:
            keywords = list(dict.fromkeys(keywords + words))
    if not keywords:
        keywords = ["bitcoin", "btc", "crypto"]
    matches = _attribute_news(keywords)
    if not matches:
        matches = _attribute_news(["bitcoin", "btc"])
    return {"keywords": keywords, "matches": matches, "updatedAt": datetime.now(timezone.utc).isoformat()}


_EMBEDDED_SAMPLE: dict | None = None


def _embedded_sample() -> dict:
    global _EMBEDDED_SAMPLE
    if _EMBEDDED_SAMPLE is None:
        _EMBEDDED_SAMPLE = {
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "crosses": CROSSES,
            "fx": {"USD": 1, "KRW": 1385.2, "JPY": 157.4, "EUR": 0.92, "GBP": 0.79, "AUD": 1.52, "CAD": 1.37},
            "referenceUsd": 94250,
            "vwapUsd": 94210,
            "premiums": {
                "kimchi": {"label": "Kimchi (KRW)", "pct": 2.84, "localUsd": 96930, "refUsd": 94250},
                "coinbase": {"label": "Coinbase USD", "pct": 0.42, "localUsd": 94646, "refUsd": 94250},
                "jpy": {"label": "Japan (JPY)", "pct": 0.18, "localUsd": 94420, "refUsd": 94250},
            },
            "venues": [
                {"exchange": "Binance", "pair": "BTC/USDT", "price": 94250, "priceUsd": 94250, "ccy": "USD", "market": "spot"},
                {"exchange": "Coinbase", "pair": "BTC/USD", "price": 94646, "priceUsd": 94646, "ccy": "USD", "market": "spot"},
                {"exchange": "Upbit", "pair": "BTC/KRW", "price": 134200000, "priceUsd": 96930, "ccy": "KRW", "market": "spot"},
                {"exchange": "Bithumb", "pair": "BTC/KRW", "price": 134050000, "priceUsd": 96822, "ccy": "KRW", "market": "spot"},
                {"exchange": "bitFlyer", "pair": "BTC/JPY", "price": 14865000, "priceUsd": 94420, "ccy": "JPY", "market": "spot"},
            ],
            "errors": [],
            "fallback": True,
            "demo": True,
        }
    out = dict(_EMBEDDED_SAMPLE)
    out["updatedAt"] = datetime.now(timezone.utc).isoformat()
    return out


def get_sample_payload() -> dict:
    path = ROOT / "data" / "cross-market-sample.json"
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("venues"):
                return data
        except (OSError, json.JSONDecodeError):
            pass
    return _embedded_sample()