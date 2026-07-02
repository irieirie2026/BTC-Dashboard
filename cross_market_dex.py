"""DEX and alt-perp price fetchers for Cross-Market monitor (secondary weight)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

USER_AGENT = "BTC-Dashboard/1.0 (+cross-market-dex)"


def _get(url: str, *, method: str = "GET", body: dict | None = None, timeout: float = 6.0):
    data = None
    headers = {"User-Agent": USER_AGENT}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None


def _dex_row(exchange: str, pair: str, price: float | None, *, market: str = "dex", basis_pct=None, funding=None):
    if not price or price <= 0:
        return None
    return {
        "exchange": exchange,
        "pair": pair,
        "price": price,
        "ccy": "USD",
        "market": market,
        "weight": 0.5,
        "source": "dex",
        "basisPct": basis_pct,
        "fundingRate": funding,
    }


def fetch_hyperliquid_btc() -> dict | None:
    data = _get("https://api.hyperliquid.xyz/info", method="POST", body={"type": "metaAndAssetCtxs"})
    if not data or not isinstance(data, list) or len(data) < 2:
        return None
    meta, ctxs = data[0], data[1]
    universe = meta.get("universe") or []
    idx = next((i for i, u in enumerate(universe) if u.get("name") == "BTC"), None)
    if idx is None or idx >= len(ctxs):
        return None
    ctx = ctxs[idx]
    mark = float(ctx.get("markPx") or ctx.get("midPx") or 0)
    funding = float(ctx.get("funding") or 0) * 100 if ctx.get("funding") else None
    return _dex_row("Hyperliquid", "BTC Perp", mark, market="perp", funding=funding)


def fetch_dydx_btc() -> dict | None:
    data = _get("https://indexer.dydx.trade/v4/perpetualMarkets?ticker=BTC-USD")
    if not data:
        return None
    markets = data.get("markets") or {}
    m = markets.get("BTC-USD") or {}
    px = float(m.get("oraclePrice") or m.get("price") or 0)
    funding = float(m.get("nextFundingRate") or 0) * 100 if m.get("nextFundingRate") else None
    return _dex_row("dYdX", "BTC-USD Perp", px, market="perp", funding=funding)


def fetch_jupiter_wbtc() -> dict | None:
    data = _get("https://price.jup.ag/v6/price?ids=3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh")
    if not data:
        return None
    px = float((data.get("data") or {}).get("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", {}).get("price") or 0)
    return _dex_row("Jupiter", "wBTC/SOL", px, market="dex")


def fetch_defillama_prices() -> list[dict]:
    """Uniswap/Curve wBTC via DefiLlama coins API."""
    ids = (
        "ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599,"  # WBTC
        "coingecko:bitcoin",
    )
    data = _get(f"https://coins.llama.fi/prices/current/{ids}")
    if not data or not data.get("coins"):
        return []
    out = []
    coins = data["coins"]
    wbtc = coins.get("ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599")
    if wbtc and wbtc.get("price"):
        out.append(_dex_row("Uniswap/Curve", "wBTC/USD", float(wbtc["price"]), market="dex"))
    return [r for r in out if r]


def fetch_all_dex_venues() -> tuple[list[dict], list[str]]:
    venues: list[dict] = []
    errors: list[str] = []
    fetchers = [
        ("hyperliquid", fetch_hyperliquid_btc),
        ("dydx", fetch_dydx_btc),
        ("jupiter", fetch_jupiter_wbtc),
    ]
    for name, fn in fetchers:
        try:
            row = fn()
            if row:
                venues.append(row)
        except Exception as exc:
            errors.append(f"{name}: {exc}")
    try:
        venues.extend(fetch_defillama_prices())
    except Exception as exc:
        errors.append(f"defillama: {exc}")
    return venues, errors