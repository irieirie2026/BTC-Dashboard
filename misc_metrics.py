"""Misc dashboard metrics — free public APIs only (no keys).

Sources:
  - CoinGecko: /global, /coins/bitcoin, /coins/bitcoin/market_chart, /coins/ethereum/market_chart
  - Mempool.space: hashrate, mempool, fees/recommended, difficulty-adjustment, blocks/fees
  - Blockchain.info: ticker, stats, charts/n-transactions, charts/estimated-transaction-volume
  - Alternative.me: Fear & Greed Index

Route: GET /api/misc/metrics?refresh=1
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from macro_data.cache import cache_get, cache_set

USER_AGENT = "BTC-Dashboard/1.0 (+misc-metrics)"
CACHE_TTL = 300
BLOCK_SUBSIDY_BTC = 3.125
BLOCKS_PER_DAY = 144
DAILY_ISSUANCE_BTC = BLOCK_SUBSIDY_BTC * BLOCKS_PER_DAY
AVG_BLOCK_VBYTES = 1_500_000  # ~1.5M vbytes typical full block


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fetch_json(url: str, *, timeout: int = 35) -> object:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _as_float(v) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _sma(values: list[float], window: int) -> float | None:
    if len(values) < window:
        return None
    chunk = values[-window:]
    return sum(chunk) / len(chunk)


def _pct_change(cur, prev) -> float | None:
    c = _as_float(cur)
    p = _as_float(prev)
    if c is None or p is None or p == 0:
        return None
    return ((c - p) / abs(p)) * 100.0


def _sparkline(values: list[float], *, max_pts: int = 30) -> list[float]:
    if not values:
        return []
    tail = values[-max_pts:]
    return [round(v, 4) for v in tail]


def _fng_zone(value: int) -> dict:
    zones = [
        (24, "Extreme Fear", "#ea3943"),
        (44, "Fear", "#ea8c00"),
        (54, "Neutral", "#f3d42f"),
        (74, "Greed", "#93d900"),
        (100, "Extreme Greed", "#16c784"),
    ]
    for cap, label, color in zones:
        if value <= cap:
            return {"label": label, "color": color}
    return {"label": "Extreme Greed", "color": "#16c784"}


def _align_market_caps(btc_chart: dict, eth_chart: dict) -> list[tuple[int, float, float]]:
    btc_m = {int(p[0]): _as_float(p[1]) for p in (btc_chart.get("market_caps") or []) if len(p) >= 2}
    eth_m = {int(p[0]): _as_float(p[1]) for p in (eth_chart.get("market_caps") or []) if len(p) >= 2}
    keys = sorted(set(btc_m) & set(eth_m))
    out: list[tuple[int, float, float]] = []
    for k in keys:
        b, e = btc_m.get(k), eth_m.get(k)
        if b is not None and e is not None and e > 0:
            out.append((k, b, e))
    return out


def _blockchain_chart(name: str, *, timespan: str = "1year") -> list[dict]:
    url = (
        f"https://api.blockchain.info/charts/{name}"
        f"?timespan={urllib.parse.quote(timespan)}&format=json"
    )
    raw = _fetch_json(url)
    return [
        {"ts": int(v["x"]), "date": datetime.utcfromtimestamp(v["x"]).strftime("%Y-%m-%d"), "value": float(v["y"])}
        for v in (raw.get("values") or [])
        if v.get("x") is not None and v.get("y") is not None
    ]


def get_misc_metrics_payload(*, refresh: bool = False) -> dict:
    cache_key = "misc:metrics:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=CACHE_TTL)
        if cached:
            return {**cached, "fromCache": True}

    errors: list[str] = []
    updated_at = _now_iso()

    # --- CoinGecko ---
    global_raw: dict = {}
    btc_coin: dict = {}
    market_chart: dict = {}
    eth_chart: dict = {}
    try:
        global_raw = _fetch_json("https://api.coingecko.com/api/v3/global")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"coingecko global: {exc}")
    try:
        btc_coin = _fetch_json("https://api.coingecko.com/api/v3/coins/bitcoin")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"coingecko bitcoin: {exc}")
    try:
        market_chart = _fetch_json(
            "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
            "?vs_currency=usd&days=365&interval=daily"
        )
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"coingecko market_chart: {exc}")
    try:
        eth_chart = _fetch_json(
            "https://api.coingecko.com/api/v3/coins/ethereum/market_chart"
            "?vs_currency=usd&days=30&interval=daily"
        )
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"coingecko eth chart: {exc}")

    dom_pct = _as_float((global_raw.get("data") or {}).get("market_cap_percentage", {}).get("btc"))
    price = _as_float((btc_coin.get("market_data") or {}).get("current_price", {}).get("usd"))
    mcap = _as_float((btc_coin.get("market_data") or {}).get("market_cap", {}).get("usd"))

    prices = [_as_float(p[1]) for p in (market_chart.get("prices") or []) if len(p) >= 2]
    prices = [p for p in prices if p is not None]
    mcaps = [_as_float(p[1]) for p in (market_chart.get("market_caps") or []) if len(p) >= 2]
    mcaps = [m for m in mcaps if m is not None]

    # Dominance 30d proxy via BTC+ETH mcap ratio scaled to current dominance
    dom_spark: list[float] = []
    aligned = _align_market_caps(market_chart, eth_chart)
    if dom_pct and aligned:
        ratios = [b / (b + e) * 100.0 for _, b, e in aligned]
        scale = dom_pct / max(max(ratios), 0.01)
        dom_spark = [round(r * scale, 2) for r in ratios[-30:]]
    elif dom_pct is not None:
        dom_spark = [round(dom_pct, 2)] * min(30, len(mcaps) or 1)

    # Mayer Multiple
    sma200 = _sma(prices, 200)
    mayer = (price / sma200) if price and sma200 else None
    mayer_series: list[float] = []
    if len(prices) >= 200:
        for i in range(199, len(prices)):
            s = sum(prices[i - 199 : i + 1]) / 200
            if s > 0:
                mayer_series.append(round(prices[i] / s, 3))

    # Puell Multiple
    puell_series: list[float] = []
    puell = None
    if prices:
        daily_rev = [p * DAILY_ISSUANCE_BTC for p in prices]
        for i in range(364, len(daily_rev)):
            ma = sum(daily_rev[i - 364 : i + 1]) / 365
            if ma > 0:
                puell_series.append(round(daily_rev[i] / ma, 3))
        if len(daily_rev) >= 365:
            ma365 = sum(daily_rev[-365:]) / 365
            if ma365 > 0:
                puell = daily_rev[-1] / ma365

    # --- Fear & Greed ---
    fng_latest = None
    fng_spark: list[float] = []
    fng_color = "#94a3b8"
    fng_label = "—"
    try:
        fng_raw = _fetch_json("https://api.alternative.me/fng/?limit=10")
        rows = fng_raw.get("data") or []
        pts = []
        for row in rows:
            try:
                val = int(row["value"])
                ts = int(row["timestamp"])
                pts.append({"value": val, "ts": ts, "date": datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")})
            except (KeyError, TypeError, ValueError):
                continue
        pts.sort(key=lambda x: x["ts"])
        if pts:
            fng_latest = pts[-1]["value"]
            zone = _fng_zone(fng_latest)
            fng_color = zone["color"]
            fng_label = zone["label"]
            fng_spark = [float(p["value"]) for p in pts[-7:]]
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"fear-greed: {exc}")

    # --- Blockchain.info ---
    tx_chart: list[dict] = []
    vol_chart: list[dict] = []
    chain_stats: dict = {}
    try:
        tx_chart = _blockchain_chart("n-transactions", timespan="1year")
        vol_chart = _blockchain_chart("estimated-transaction-volume", timespan="1year")
        chain_stats = _fetch_json("https://api.blockchain.info/stats?format=json")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"blockchain.info: {exc}")

    nvt = None
    nvt_spark: list[float] = []
    if mcap and tx_chart and vol_chart:
        tx_by_date = {r["date"]: r["value"] for r in tx_chart}
        vol_by_date = {r["date"]: r["value"] for r in vol_chart}
        common = sorted(set(tx_by_date) & set(vol_by_date))[-90:]
        for d in common:
            tx_n = tx_by_date[d]
            vol_usd = vol_by_date[d]
            if tx_n and tx_n > 0 and vol_usd and vol_usd > 0:
                nvt_spark.append(round(mcap / vol_usd, 2))
        if common:
            d = common[-1]
            tx_n = tx_by_date.get(d)
            vol_usd = vol_by_date.get(d)
            if tx_n and vol_usd and vol_usd > 0:
                nvt = mcap / vol_usd

    # --- Mempool.space ---
    mempool_raw: dict = {}
    fees_rec: dict = {}
    hashrate_3d: dict = {}
    fees_blocks: list = []
    try:
        mempool_raw = _fetch_json("https://mempool.space/api/mempool")
        fees_rec = _fetch_json("https://mempool.space/api/v1/fees/recommended")
        hashrate_3d = _fetch_json("https://mempool.space/api/v1/mining/hashrate/3d")
        fees_blocks = _fetch_json("https://mempool.space/api/v1/mining/blocks/fees/1d")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"mempool.space: {exc}")

    vsize = _as_float(mempool_raw.get("vsize"))
    hr_list = hashrate_3d.get("hashrates") or []
    hashrate_hs = None
    if hr_list:
        hashrate_hs = _as_float(hr_list[-1].get("avgHashrate"))
    hashrate_eh = (hashrate_hs / 1e18) if hashrate_hs else None

    fee_sat_vb = _as_float(fees_rec.get("fastestFee")) or _as_float(fees_rec.get("halfHourFee"))
    fee_btc_per_block = ((fee_sat_vb or 0) * AVG_BLOCK_VBYTES) / 1e8
    daily_fee_btc = fee_btc_per_block * BLOCKS_PER_DAY
    daily_subsidy_btc = DAILY_ISSUANCE_BTC
    daily_rev_btc = daily_subsidy_btc + daily_fee_btc

    hashprice = None
    if price and hashrate_eh and hashrate_eh > 0:
        hashprice = (daily_rev_btc * price) / hashrate_eh

    mempool_pressure = None
    if vsize is not None:
        block_ratio = min(vsize / AVG_BLOCK_VBYTES, 5.0) / 5.0
        fee_norm = min((fee_sat_vb or 0) / 100.0, 1.0)
        mempool_pressure = round(block_ratio * 50 + fee_norm * 50, 1)

    dom_fg_composite = None
    if dom_pct is not None and fng_latest is not None:
        dom_fg_composite = round(dom_pct * (fng_latest / 50.0), 2)

    metrics = [
        {
            "id": "btc-dominance",
            "title": "Bitcoin Dominance",
            "value": f"{dom_pct:.1f}%" if dom_pct is not None else "—",
            "sub": _pct_change(dom_spark[-1], dom_spark[0]) if len(dom_spark) >= 2 else None,
            "subLabel": "30d change (BTC+ETH proxy)",
            "sparkline": dom_spark,
            "description": "BTC share of total crypto market cap (CoinGecko). Sparkline uses BTC/ETH mcap ratio scaled to current dominance.",
            "source": "CoinGecko /global",
            "updatedAt": updated_at,
        },
        {
            "id": "fear-greed",
            "title": "Fear & Greed Index",
            "value": str(fng_latest) if fng_latest is not None else "—",
            "sub": fng_label,
            "subLabel": "Zone",
            "color": fng_color,
            "sparkline": fng_spark,
            "description": "Alternative.me composite sentiment (0–100). Higher = greedier market mood.",
            "source": "Alternative.me",
            "updatedAt": updated_at,
        },
        {
            "id": "mayer-multiple",
            "title": "Mayer Multiple",
            "value": f"{mayer:.2f}" if mayer is not None else "—",
            "sub": "< 1 historically cheap · > 2.4 overheated",
            "sparkline": _sparkline(mayer_series, max_pts=90),
            "description": "Spot price divided by 200-day simple moving average (CoinGecko daily prices).",
            "source": "CoinGecko market_chart",
            "updatedAt": updated_at,
        },
        {
            "id": "puell-multiple",
            "title": "Puell Multiple",
            "value": f"{puell:.2f}" if puell is not None else "—",
            "sub": f"Issuance {DAILY_ISSUANCE_BTC:.0f} BTC/day",
            "sparkline": _sparkline(puell_series, max_pts=90),
            "description": "Daily miner issuance revenue vs its 365-day average. Issuance = 3.125 × 144 blocks/day.",
            "source": "CoinGecko + issuance model",
            "updatedAt": updated_at,
        },
        {
            "id": "nvt-ratio",
            "title": "NVT Ratio (approx)",
            "value": f"{nvt:.1f}" if nvt is not None else "—",
            "sub": "Mcap / daily on-chain transfer volume",
            "sparkline": _sparkline(nvt_spark, max_pts=60),
            "description": "Market cap divided by Blockchain.info estimated daily USD transaction volume.",
            "source": "CoinGecko + Blockchain.info",
            "updatedAt": updated_at,
        },
        {
            "id": "hashprice",
            "title": "Hashprice",
            "value": f"${hashprice:,.0f}/EH/day" if hashprice is not None else "—",
            "sub": f"HR {hashrate_eh:.1f} EH/s" if hashrate_eh else None,
            "sparkline": [],
            "description": "Estimated daily miner revenue (subsidy + fees) per exahash of hashrate.",
            "source": "Mempool.space + CoinGecko",
            "updatedAt": updated_at,
        },
        {
            "id": "mempool-pressure",
            "title": "Mempool Pressure Score",
            "value": f"{mempool_pressure:.0f}" if mempool_pressure is not None else "—",
            "sub": f"{(vsize or 0)/1e6:.2f}M vbytes · {fee_sat_vb or 0} sat/vB fast",
            "sparkline": [],
            "description": "Composite 0–100 score from mempool vsize vs typical block size and recommended fee pressure.",
            "source": "Mempool.space",
            "updatedAt": updated_at,
        },
        {
            "id": "dom-fg-composite",
            "title": "Dominance × F&G Composite",
            "value": f"{dom_fg_composite:.1f}" if dom_fg_composite is not None else "—",
            "sub": f"Dom {dom_pct:.1f}% × F&G {fng_latest}" if dom_pct and fng_latest else None,
            "sparkline": [],
            "description": "BTC dominance weighted by Fear & Greed (÷50). Higher = strong BTC share in a greedy tape.",
            "source": "Derived",
            "updatedAt": updated_at,
        },
    ]

    heroes = [
        {"name": "BTC Price", "value": f"${price:,.0f}" if price else "—", "sub": "CoinGecko"},
        {"name": "Dominance", "value": f"{dom_pct:.1f}%" if dom_pct else "—", "sub": "Market share"},
        {"name": "Fear & Greed", "value": str(fng_latest) if fng_latest is not None else "—", "sub": fng_label},
        {"name": "Mayer Multiple", "value": f"{mayer:.2f}" if mayer else "—", "sub": "Price / 200d SMA"},
    ]

    payload = {
        "updatedAt": updated_at,
        "source": "live" if not errors else "live+partial",
        "errors": errors,
        "heroes": heroes,
        "metrics": metrics,
        "about": [
            "Misc metrics use only free public APIs — no keys required.",
            "Derived ratios (Mayer, Puell, NVT, hashprice, mempool pressure) are approximations for dashboard context, not trading signals.",
            "Dominance trend uses a BTC+ETH mcap proxy when historical global dominance is unavailable on the free tier.",
        ],
        "fromCache": False,
    }
    cache_set(cache_key, payload)
    return payload