"""BTC-centric prediction markets — Polymarket Gamma API + Kalshi with mock fallback.

Live data (default):
  - Polymarket public Gamma API (no key): https://gamma-api.polymarket.com
  - Kalshi trade API (no key for market listings): https://api.elections.kalshi.com/trade-api/v2

Optional Dome unified API (EOL April 2026 — migrate to Polymarket APIs):
  - Set DOME_API_KEY in the environment
  - pip install dome-api-sdk  (only if extending Dome integration)

Force mock-only (dev / offline):
  - GET /api/prediction-markets?mock=1

Refresh cache:
  - GET /api/prediction-markets?refresh=1
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

USER_AGENT = "btc-dashboard/1.0 (+prediction-markets)"
CACHE_TTL = 60  # align with 60s client refresh
_cache: dict[str, tuple[float, dict]] = {}

POLYMARKET_GAMMA = "https://gamma-api.polymarket.com"
KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2"

BTC_INCLUDE = re.compile(
    r"\b("
    r"bitcoin|btc\b|btc/usdt|btc-usdt|"
    r"crypto\s+etf|spot\s+bitcoin\s+etf|bitcoin\s+etf|"
    r"strategic\s+(bitcoin|crypto)\s+reserve|"
    r"halving|"
    r"binance\s+btc|"
    r"price\s+of\s+bitcoin|bitcoin\s+price|bitcoin\s+reach|bitcoin\s+hit|bitcoin\s+above|bitcoin\s+below|"
    r"bitcoin\s+high|bitcoin\s+low|bitcoin\s+all.time.high|"
    r"sec.*(bitcoin|btc|crypto\s+etf)|"
    r"(fed|fomc).*(bitcoin|btc|crypto)|"
    r"(rate\s+cut|rate\s+hike).*(bitcoin|btc|crypto)"
    r")\b",
    re.I,
)

BTC_MACRO = re.compile(
    r"\b("
    r"fed\s+(rate|funds|decision|cut|hike)|fomc|"
    r"cpi|inflation|recession|"
    r"spot\s+bitcoin\s+etf|bitcoin\s+etf\s+approval|sec\s+approve.*etf|"
    r"crypto\s+regulation|stablecoin\s+bill|"
    r"strategic\s+(bitcoin|crypto)\s+reserve"
    r")\b",
    re.I,
)

BTC_EXCLUDE = re.compile(
    r"\b("
    r"gta\s+vi|rihanna|playboi\s+carti|jesus\s+christ|"
    r"super\s+bowl|oscar|grammy|nba|nfl|"
    r"presidential\s+election|win\s+the\s+election|"
    r"ukraine|gaza|israel(?!.*etf)"
    r")\b",
    re.I,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fetch_json(url: str, timeout: int = 25) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _as_float(v) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _parse_prices(raw) -> tuple[float | None, float | None]:
    if raw is None:
        return None, None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None, None
    if not isinstance(raw, (list, tuple)) or len(raw) < 2:
        return None, None
    yes_p = _as_float(raw[0])
    no_p = _as_float(raw[1])
    return yes_p, no_p


def _classify_category(question: str, description: str = "") -> str:
    text = f"{question} {description}".lower()
    if re.search(r"etf|sec|regulat|approve|ban|legislat|stablecoin|reserve", text):
        return "regulation"
    if BTC_MACRO.search(text) and not re.search(r"price|reach|hit|above|below|\$|k\b", text):
        return "macro"
    return "price-targets"


def _classify_timeframe(end_date: str | None) -> str:
    if not end_date:
        return "long-term"
    try:
        end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    except ValueError:
        return "long-term"
    now = datetime.now(timezone.utc)
    delta = (end - now).total_seconds()
    if delta <= 0:
        return "today"
    if delta <= 86_400:
        return "today"
    if delta <= 7 * 86_400:
        return "week"
    if end.year == now.year:
        return "y2026"
    return "long-term"


def _is_btc_relevant(question: str, description: str = "", tags: list | None = None) -> bool:
    text = f"{question} {description}"
    if BTC_EXCLUDE.search(text):
        return False
    if BTC_INCLUDE.search(text):
        return True
    if BTC_MACRO.search(text):
        return True
    if tags:
        slugs = {str(t.get("slug", "")).lower() for t in tags if isinstance(t, dict)}
        if "bitcoin" in slugs or "crypto-prices" in slugs:
            return True
    return False


def _poly_url(slug: str | None, event_slug: str | None = None) -> str | None:
    if event_slug:
        return f"https://polymarket.com/event/{event_slug}"
    if slug:
        return f"https://polymarket.com/market/{slug}"
    return None


def _kalshi_url(ticker: str | None) -> str | None:
    if not ticker:
        return None
    return f"https://kalshi.com/markets/{ticker.lower()}"


def _normalize_market(
    *,
    mid: str,
    question: str,
    yes_p: float | None,
    no_p: float | None,
    volume24h: float | None,
    end_date: str | None,
    platform: str,
    url: str | None,
    description: str = "",
    category: str | None = None,
    timeframe: str | None = None,
    sparkline: list | None = None,
    liquidity: float | None = None,
    active: bool = True,
    event_title: str | None = None,
) -> dict | None:
    if not question or yes_p is None:
        return None
    if no_p is None:
        no_p = max(0.0, 1.0 - yes_p)
    yes_p = max(0.0, min(1.0, yes_p))
    no_p = max(0.0, min(1.0, no_p))
    cat = category or _classify_category(question, description)
    tf = timeframe or _classify_timeframe(end_date)
    return {
        "id": mid,
        "question": question.strip(),
        "eventTitle": event_title,
        "yesOdds": round(yes_p, 4),
        "noOdds": round(no_p, 4),
        "yesProb": round(yes_p * 100, 1),
        "noProb": round(no_p * 100, 1),
        "volume24h": volume24h,
        "liquidity": liquidity,
        "endDate": (end_date or "")[:10] or None,
        "platform": platform,
        "category": cat,
        "timeframe": tf,
        "url": url,
        "description": (description or "").strip()[:1200],
        "sparkline": sparkline or [],
        "active": active,
    }


def _parse_polymarket_event(event: dict) -> list[dict]:
    if not event or event.get("closed"):
        return []
    event_slug = event.get("slug")
    event_title = event.get("title")
    tags = event.get("tags") or []
    markets_out: list[dict] = []

    nested = event.get("markets") or []
    if nested:
        for m in nested:
            if m.get("closed"):
                continue
            q = m.get("question") or ""
            desc = m.get("description") or event.get("description") or ""
            if not _is_btc_relevant(q, desc, tags):
                continue
            yes_p, no_p = _parse_prices(m.get("outcomePrices"))
            row = _normalize_market(
                mid=f"poly-{m.get('id') or m.get('slug')}",
                question=q,
                yes_p=yes_p,
                no_p=no_p,
                volume24h=_as_float(m.get("volume24hr") or m.get("volume24hrClob")),
                end_date=m.get("endDate") or event.get("endDate"),
                platform="polymarket",
                url=_poly_url(m.get("slug"), event_slug),
                description=desc,
                sparkline=_sparkline_from_change(m.get("oneWeekPriceChange"), yes_p),
                liquidity=_as_float(m.get("liquidity") or m.get("liquidityClob")),
                active=bool(m.get("active", True)),
                event_title=event_title,
            )
            if row:
                markets_out.append(row)
        return markets_out

    q = event.get("title") or event.get("question") or ""
    desc = event.get("description") or ""
    if not _is_btc_relevant(q, desc, tags):
        return []
    yes_p, no_p = _parse_prices(event.get("outcomePrices"))
    row = _normalize_market(
        mid=f"poly-ev-{event.get('id')}",
        question=q,
        yes_p=yes_p,
        no_p=no_p,
        volume24h=_as_float(event.get("volume24hr")),
        end_date=event.get("endDate"),
        platform="polymarket",
        url=_poly_url(event_slug),
        description=desc,
        sparkline=_sparkline_from_change(event.get("oneWeekPriceChange"), yes_p),
        liquidity=_as_float(event.get("liquidity")),
        active=bool(event.get("active", True)),
    )
    return [row] if row else []


def _parse_polymarket_market(m: dict, event: dict | None = None) -> dict | None:
    if m.get("closed"):
        return None
    q = m.get("question") or ""
    desc = m.get("description") or (event or {}).get("description") or ""
    tags = (event or {}).get("tags") or []
    if not _is_btc_relevant(q, desc, tags):
        return None
    yes_p, no_p = _parse_prices(m.get("outcomePrices"))
    ev_slug = (event or {}).get("slug")
    return _normalize_market(
        mid=f"poly-{m.get('id') or m.get('slug')}",
        question=q,
        yes_p=yes_p,
        no_p=no_p,
        volume24h=_as_float(m.get("volume24hr") or m.get("volume24hrClob")),
        end_date=m.get("endDate"),
        platform="polymarket",
        url=_poly_url(m.get("slug"), ev_slug),
        description=desc,
        sparkline=_sparkline_from_change(m.get("oneWeekPriceChange"), yes_p),
        liquidity=_as_float(m.get("liquidity") or m.get("liquidityClob")),
        active=bool(m.get("active", True)),
        event_title=(event or {}).get("title"),
    )


def _sparkline_from_change(week_change, current_yes: float | None) -> list[float]:
    if current_yes is None:
        return []
    ch = _as_float(week_change) or 0.0
    start = max(0.0, min(1.0, current_yes - ch))
    mid = (start + current_yes) / 2
    return [round(start, 3), round(mid, 3), round(current_yes, 3)]


def _fetch_polymarket_live() -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()
    queries = ["bitcoin price", "bitcoin etf", "bitcoin 2026", "btc above", "strategic bitcoin reserve"]

    for q in queries:
        url = (
            f"{POLYMARKET_GAMMA}/public-search?"
            + urllib.parse.urlencode({"q": q, "limit_per_type": 12, "events_status": "active"})
        )
        try:
            payload = _fetch_json(url)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
            continue

        for event in payload.get("events") or []:
            if not event.get("active") or event.get("closed"):
                continue
            for row in _parse_polymarket_event(event):
                if row["id"] not in seen:
                    seen.add(row["id"])
                    results.append(row)

        for m in payload.get("markets") or []:
            ev = (m.get("events") or [None])[0]
            row = _parse_polymarket_market(m, ev)
            if row and row["id"] not in seen:
                seen.add(row["id"])
                results.append(row)

    # Tag-based events feed
    tag_url = (
        f"{POLYMARKET_GAMMA}/events?"
        + urllib.parse.urlencode(
            {"tag_slug": "bitcoin", "active": "true", "closed": "false", "limit": 30, "order": "volume24hr"}
        )
    )
    try:
        events = _fetch_json(tag_url)
        if isinstance(events, list):
            for event in events:
                for row in _parse_polymarket_event(event):
                    if row["id"] not in seen:
                        seen.add(row["id"])
                        results.append(row)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        pass

    return results


def _fetch_kalshi_live() -> list[dict]:
    results: list[dict] = []
    series = ["KXBTC", "KXBTCD", "KXBTCMAX", "KXBTCMIN"]
    for series_ticker in series:
        url = (
            f"{KALSHI_API}/markets?"
            + urllib.parse.urlencode(
                {"limit": 20, "status": "open", "series_ticker": series_ticker}
            )
        )
        try:
            payload = _fetch_json(url)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
            continue
        for m in payload.get("markets") or []:
            q = m.get("title") or m.get("subtitle") or ""
            if not _is_btc_relevant(q, m.get("rules_primary") or ""):
                continue
            yes_p = _as_float(m.get("yes_ask_dollars") or m.get("last_price_dollars"))
            if yes_p is None:
                yes_cents = _as_float(m.get("yes_ask") or m.get("last_price"))
                if yes_cents is not None:
                    yes_p = yes_cents / 100.0
            no_p = None
            if yes_p is not None:
                no_cents = _as_float(m.get("no_ask"))
                no_p = (no_cents / 100.0) if no_cents is not None else None
            end_date = m.get("close_time") or m.get("expiration_time")
            row = _normalize_market(
                mid=f"kalshi-{m.get('ticker')}",
                question=q,
                yes_p=yes_p,
                no_p=no_p,
                volume24h=_as_float(m.get("volume_24h")),
                end_date=end_date,
                platform="kalshi",
                url=_kalshi_url(m.get("ticker")),
                description=m.get("rules_primary") or m.get("rules_secondary") or "",
                liquidity=_as_float(m.get("liquidity_dollars")),
                active=m.get("status") == "open",
            )
            if row:
                results.append(row)
    return results


def _mock_markets() -> list[dict]:
    """Realistic seeded BTC-centric markets for dev / API fallback."""
    seed = [
        {
            "id": "mock-poly-btc-100k-2026",
            "question": "Will Bitcoin reach $100,000 before 2027?",
            "eventTitle": "Bitcoin price before 2027",
            "yesOdds": 0.58,
            "noOdds": 0.42,
            "yesProb": 58.0,
            "noProb": 42.0,
            "volume24h": 284_500,
            "liquidity": 412_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "price-targets",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/bitcoin-price-before-2027",
            "description": "Resolves Yes if BTC trades at or above $100k on Binance BTC/USDT before Jan 1, 2027.",
            "sparkline": [0.52, 0.55, 0.58],
            "active": True,
        },
        {
            "id": "mock-poly-btc-120k-2026",
            "question": "Will Bitcoin reach $120,000 before 2027?",
            "eventTitle": "Bitcoin price before 2027",
            "yesOdds": 0.34,
            "noOdds": 0.66,
            "yesProb": 34.0,
            "noProb": 66.0,
            "volume24h": 198_200,
            "liquidity": 285_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "price-targets",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/bitcoin-price-before-2027",
            "description": "Resolves Yes if BTC trades at or above $120k on Binance BTC/USDT before Jan 1, 2027.",
            "sparkline": [0.29, 0.31, 0.34],
            "active": True,
        },
        {
            "id": "mock-poly-btc-150k-2026",
            "question": "Will Bitcoin reach $150,000 before 2027?",
            "eventTitle": "Bitcoin price before 2027",
            "yesOdds": 0.18,
            "noOdds": 0.82,
            "yesProb": 18.0,
            "noProb": 82.0,
            "volume24h": 142_800,
            "liquidity": 198_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "price-targets",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/bitcoin-price-before-2027",
            "description": "Resolves Yes if BTC trades at or above $150k on Binance BTC/USDT before Jan 1, 2027.",
            "sparkline": [0.15, 0.16, 0.18],
            "active": True,
        },
        {
            "id": "mock-kalshi-btc-above-108k-week",
            "question": "BTC above $108,000 on Friday 4PM ET?",
            "yesOdds": 0.47,
            "noOdds": 0.53,
            "yesProb": 47.0,
            "noProb": 53.0,
            "volume24h": 86_400,
            "liquidity": 124_000,
            "endDate": "2026-07-04",
            "platform": "kalshi",
            "category": "price-targets",
            "timeframe": "week",
            "url": "https://kalshi.com/markets/kxbtc",
            "description": "Kalshi short-term binary: Binance BTC/USDT close above strike at expiry.",
            "sparkline": [0.41, 0.44, 0.47],
            "active": True,
        },
        {
            "id": "mock-kalshi-btc-ytd-high",
            "question": "Will BTC set a new 2026 yearly high above $112k?",
            "yesOdds": 0.61,
            "noOdds": 0.39,
            "yesProb": 61.0,
            "noProb": 39.0,
            "volume24h": 52_300,
            "liquidity": 88_000,
            "endDate": "2026-12-31",
            "platform": "kalshi",
            "category": "price-targets",
            "timeframe": "y2026",
            "url": "https://kalshi.com/markets/kxbtcmax",
            "description": "Resolves Yes if BTC prints a 2026 high above $112,000 on Binance.",
            "sparkline": [0.55, 0.58, 0.61],
            "active": True,
        },
        {
            "id": "mock-poly-etf-flow",
            "question": "US spot Bitcoin ETF net inflows positive every week in Q3 2026?",
            "yesOdds": 0.44,
            "noOdds": 0.56,
            "yesProb": 44.0,
            "noProb": 56.0,
            "volume24h": 38_900,
            "liquidity": 72_000,
            "endDate": "2026-09-30",
            "platform": "polymarket",
            "category": "regulation",
            "timeframe": "y2026",
            "url": "https://polymarket.com/event/bitcoin-etf",
            "description": "Tracks sustained spot ETF demand — a key BTC flow driver.",
            "sparkline": [0.48, 0.46, 0.44],
            "active": True,
        },
        {
            "id": "mock-poly-fed-cut-btc",
            "question": "Fed cuts rates at least once before BTC retests $100k?",
            "yesOdds": 0.52,
            "noOdds": 0.48,
            "yesProb": 52.0,
            "noProb": 48.0,
            "volume24h": 29_100,
            "liquidity": 54_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "macro",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/fed-btc",
            "description": "Macro linkage market: liquidity easing coinciding with BTC $100k retest.",
            "sparkline": [0.46, 0.49, 0.52],
            "active": True,
        },
        {
            "id": "mock-poly-strategic-reserve",
            "question": "US Strategic Bitcoin Reserve holds ≥10k BTC by end of 2026?",
            "yesOdds": 0.27,
            "noOdds": 0.73,
            "yesProb": 27.0,
            "noProb": 73.0,
            "volume24h": 67_500,
            "liquidity": 95_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "regulation",
            "timeframe": "y2026",
            "url": "https://polymarket.com/event/strategic-bitcoin-reserve",
            "description": "Policy market with direct supply/demand implications for BTC.",
            "sparkline": [0.22, 0.25, 0.27],
            "active": True,
        },
        {
            "id": "mock-kalshi-btc-today",
            "question": "Bitcoin up on the day (Binance close vs open)?",
            "yesOdds": 0.51,
            "noOdds": 0.49,
            "yesProb": 51.0,
            "noProb": 49.0,
            "volume24h": 41_200,
            "liquidity": 62_000,
            "endDate": "2026-06-30",
            "platform": "kalshi",
            "category": "price-targets",
            "timeframe": "today",
            "url": "https://kalshi.com/markets/kxbtcd",
            "description": "Same-day directional BTC market for near-term sentiment.",
            "sparkline": [0.48, 0.5, 0.51],
            "active": True,
        },
    ]
    return seed


def _build_outlook(markets: list[dict]) -> dict:
    price_markets = [m for m in markets if m.get("category") == "price-targets"]
    above_100 = next(
        (m for m in price_markets if re.search(r"100[,.]?000|100k", m.get("question", ""), re.I)),
        None,
    )
    bullish = [m for m in price_markets if (m.get("yesProb") or 0) >= 50]
    avg_yes = (
        sum(m.get("yesProb") or 0 for m in price_markets) / len(price_markets)
        if price_markets
        else None
    )
    headline = "BTC prediction markets — aggregated outlook"
    if above_100:
        headline = f"Market-implied probability BTC > $100k: {above_100['yesProb']:.0f}%"
    elif avg_yes is not None:
        headline = f"Avg implied probability across {len(price_markets)} price markets: {avg_yes:.0f}%"
    return {
        "headline": headline,
        "btc100kProb": above_100["yesProb"] if above_100 else None,
        "bullishCount": len(bullish),
        "activeMarkets": len(markets),
        "totalVolume24h": sum(m.get("volume24h") or 0 for m in markets),
        "lines": _outlook_commentary(markets, above_100, avg_yes),
    }


def _outlook_commentary(markets, above_100, avg_yes) -> list[str]:
    lines = []
    if above_100:
        lines.append(
            f"Polymarket/Kalshi-style pricing implies a {above_100['yesProb']:.0f}% chance of BTC reaching "
            f"$100k before the stated deadline — a common benchmark for cycle sentiment."
        )
    platforms = {}
    for m in markets:
        platforms[m["platform"]] = platforms.get(m["platform"], 0) + 1
    plat_txt = ", ".join(f"{k}: {v}" for k, v in sorted(platforms.items()))
    lines.append(f"Tracking {len(markets)} BTC-relevant markets ({plat_txt}). Generic politics excluded.")
    if avg_yes is not None:
        lines.append(
            f"Mean Yes probability across price-target markets is {avg_yes:.0f}% — compare with spot technicals "
            "on the Indicators tab for confluence."
        )
    return lines


PM_MAX_MARKETS = 72


def _rank_markets(markets: list[dict]) -> list[dict]:
    return sorted(markets, key=lambda m: m.get("volume24h") or 0, reverse=True)


def _merge_live_with_mock(live: list[dict], mock: list[dict]) -> list[dict]:
    if not live:
        return _rank_markets(mock)[:PM_MAX_MARKETS]
    # Prefer live; fill gaps from mock when live set is thin
    if len(live) >= 6:
        ranked = _rank_markets(live)
        return ranked[:PM_MAX_MARKETS]
    seen_q = {m["question"].lower()[:60] for m in live}
    merged = list(live)
    for m in mock:
        key = m["question"].lower()[:60]
        if key not in seen_q:
            merged.append(m)
    return _rank_markets(merged)[:PM_MAX_MARKETS]


def _cache_get(key: str, refresh: bool) -> dict | None:
    if refresh:
        return None
    hit = _cache.get(key)
    if not hit:
        return None
    ts, payload = hit
    if time.time() - ts > CACHE_TTL:
        return None
    return payload


def _cache_set(key: str, payload: dict) -> None:
    _cache[key] = (time.time(), payload)


def get_prediction_markets_payload(*, refresh: bool = False, mock_only: bool = False) -> dict:
    cache_key = "prediction-markets:mock" if mock_only else "prediction-markets:live"
    cached = _cache_get(cache_key, refresh)
    if cached is not None:
        return cached

    source = "mock"
    errors: list[str] = []
    markets: list[dict] = []

    if mock_only:
        markets = _mock_markets()
    else:
        live: list[dict] = []
        try:
            live.extend(_fetch_polymarket_live())
        except Exception as exc:
            errors.append(f"polymarket: {exc}")
        try:
            live.extend(_fetch_kalshi_live())
        except Exception as exc:
            errors.append(f"kalshi: {exc}")

        mock = _mock_markets()
        markets = _merge_live_with_mock(live, mock)
        source = "live" if live else "mock"
        if live and len(live) < len(mock):
            source = "live+mock"

    outlook = _build_outlook(markets)
    payload = {
        "updatedAt": _now_iso(),
        "source": source,
        "mockOnly": mock_only,
        "errors": errors,
        "heroes": [
            {
                "name": "BTC > $100k",
                "value": f"{outlook['btc100kProb']:.0f}%" if outlook.get("btc100kProb") is not None else "—",
                "sub": "Implied probability",
            },
            {
                "name": "Active markets",
                "value": str(outlook["activeMarkets"]),
                "sub": "BTC-relevant",
            },
            {
                "name": "24h volume",
                "value": _fmt_usd(outlook["totalVolume24h"]),
                "sub": "Combined",
            },
            {
                "name": "Bullish price bets",
                "value": str(outlook["bullishCount"]),
                "sub": "Yes ≥ 50%",
            },
        ],
        "outlook": outlook,
        "markets": markets,
        "filters": {
            "timeframes": [
                {"id": "all", "label": "All"},
                {"id": "today", "label": "Today"},
                {"id": "week", "label": "This week"},
                {"id": "y2026", "label": "2026"},
                {"id": "long-term", "label": "Long-term"},
            ],
            "categories": [
                {"id": "all", "label": "All"},
                {"id": "price-targets", "label": "Price Targets"},
                {"id": "regulation", "label": "Regulation"},
                {"id": "macro", "label": "Macro"},
            ],
            "platforms": [
                {"id": "all", "label": "All"},
                {"id": "polymarket", "label": "Polymarket"},
                {"id": "kalshi", "label": "Kalshi"},
            ],
        },
    }
    _cache_set(cache_key, payload)
    return payload


def _fmt_usd(value: float | None) -> str:
    if value is None:
        return "—"
    v = float(value)
    if v >= 1e6:
        return f"${v / 1e6:.2f}M"
    if v >= 1e3:
        return f"${v / 1e3:.1f}K"
    return f"${v:.0f}"