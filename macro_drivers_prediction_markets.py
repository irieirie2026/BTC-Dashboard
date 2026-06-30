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
    r"super\s+bowl|oscar|grammy|nba|nfl|mvp|"
    r"album|gta\s+vi|tiktok|influencer"
    r")\b",
    re.I,
)

FINANCIAL_GLOBAL = re.compile(
    r"\b("
    # US
    r"fed\b|fomc|federal\s+reserve|powell|"
    r"treasury\s+yield|yield\s+curve|"
    # Europe
    r"ecb\b|european\s+central\s+bank|lagarde|"
    r"bank\s+of\s+england|boe\b|andrew\s+bailey|"
    r"eurozone|euro\s+area|euro\s+inflation|"
    r"gilt|bund|german\s+inflation|"
    # Asia-Pacific
    r"bank\s+of\s+japan|boj\b|ueda|yen|"
    r"pboc|people'?s\s+bank|china\s+gdp|china\s+inflation|yuan|renminbi|"
    r"rba\b|reserve\s+bank\s+of\s+australia|"
    r"rbi\b|reserve\s+bank\s+of\s+india|"
    r"bok\b|bank\s+of\s+korea|"
    # Other major CBs / macro
    r"snb\b|swiss\s+national\s+bank|"
    r"banco\s+central|central\s+bank|"
    r"opec|oil\s+price|crude\s+oil|brent|wti|"
    # Universal macro
    r"rate\s+cut|rate\s+hike|interest\s+rate|"
    r"basis\s+points|bps|dot\s+plot|monetary\s+policy|"
    r"cpi|pce|inflation|deflation|"
    r"recession|soft\s+landing|hard\s+landing|"
    r"unemployment|nonfarm|payroll|jobs\s+report|"
    r"gdp|pmi\b|ism\b|"
    r"liquidity|qe\b|qt\b|balance\s+sheet|"
    r"imf\b|world\s+bank|"
    r"emerging\s+market|fx\s+crisis|currency\s+crisis"
    r")\b",
    re.I,
)

GEO_POLITICAL = re.compile(
    r"\b("
    # Conflict & security
    r"sanction|tariff|trade\s+war|embargo|"
    r"ceasefire|geopolit|invasion|military|"
    r"nato|un\s+security\s+council|"
    r"ukraine|russia|gaza|israel|iran|"
    r"taiwan|south\s+china\s+sea|north\s+korea|"
    r"middle\s+east|red\s+sea|"
    # Elections & politics (worldwide)
    r"election|referendum|parliament|"
    r"prime\s+minister|president|chancellor|"
    r"congress|senate|house\s+of\s+commons|"
    r"coalition\s+government|snap\s+election|"
    # Regions & countries
    r"european\s+union|\beu\b|eurocrisis|brexit|"
    r"united\s+kingdom|\buk\b|france|germany|italy|spain|"
    r"india|brazil|mexico|canada|australia|"
    r"japan|south\s+korea|china|"
    # Policy & regulation (not BTC-specific)
    r"immigration|border|asylum|"
    r"executive\s+order|legislation|bill\s+passed|bill\s+signed|signed\s+into\s+law|"
    r"regulation|regulatory|market\s+structure|"
    r"crypto\s+regulation|regulate\s+crypto|stablecoin\s+bill|crypto\s+bill|"
    r"strategic\s+(bitcoin|crypto)\s+reserve|"
    r"sec\s+approve|etf\s+approval"
    r")\b",
    re.I,
)

BTC_PRICE_MARKET = re.compile(
    r"\b(bitcoin|btc\b).*(price|reach|hit|above|below|\$\d|(?:\d+)[kK]\b|ath|high|low|up\s+on)|"
    r"(price|reach|hit|above|below).*(bitcoin|btc\b)",
    re.I,
)

ECONOMICS_TOPIC = re.compile(
    r"\b("
    r"cpi|pce|inflation|deflation|gdp|recession|unemployment|"
    r"nonfarm|payroll|jobs\s+report|pmi\b|ism\b|soft\s+landing|hard\s+landing"
    r")\b",
    re.I,
)

FINANCE_TOPIC = re.compile(
    r"\b("
    r"fed\b|fomc|ecb\b|boe\b|boj\b|rba\b|rate\s+cut|rate\s+hike|"
    r"treasury|yield|liquidity|opec|oil\s+price|crude|brent|wti|"
    r"monetary\s+policy|basis\s+points|bps|dot\s+plot|qe\b|qt\b"
    r")\b",
    re.I,
)

POLITICS_TOPIC = re.compile(
    r"\b("
    r"election|referendum|parliament|president|prime\s+minister|"
    r"chancellor|congress|senate|coalition|snap\s+election|"
    r"house\s+of\s+commons|legislation|bill\s+passed|bill\s+signed"
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
    if re.search(r"etf|sec\b|\bregulat|\bapprove\b|\bban\b|legislat|stablecoin|strategic\s+reserve", text):
        return "regulation"
    if FINANCIAL_GLOBAL.search(text) or (
        BTC_MACRO.search(text) and not re.search(r"price|reach|hit|above|below|\$|k\b", text)
    ):
        return "macro"
    if GEO_POLITICAL.search(text):
        return "regulation"
    return "price-targets"


def _is_btc_section_market(question: str, description: str = "", tags: list | None = None) -> bool:
    """Bitcoin/BTC-tagged markets — price, ETF, halving, crypto policy, explicit BTC macro links."""
    text = f"{question} {description}"
    if BTC_EXCLUDE.search(text):
        return False
    if re.search(
        r"bitcoin|btc\b|btc/usdt|btc-usdt|"
        r"crypto\s+etf|spot\s+bitcoin\s+etf|bitcoin\s+etf|"
        r"strategic\s+(bitcoin|crypto)\s+reserve|halving|"
        r"crypto\s+regulation|regulate\s+crypto|crypto\s+bill|crypto\s+market\s+structure",
        text,
        re.I,
    ):
        return True
    if BTC_INCLUDE.search(text):
        return True
    if tags:
        slugs = {str(t.get("slug", "")).lower() for t in tags if isinstance(t, dict)}
        if "bitcoin" in slugs or "crypto-prices" in slugs:
            return True
    return False


def _classify_section(
    question: str,
    description: str = "",
    category: str | None = None,
    tags: list | None = None,
) -> str:
    text = f"{question} {description}"
    if _is_btc_section_market(question, description, tags):
        return "btc-price"
    if FINANCIAL_GLOBAL.search(text) or BTC_MACRO.search(text) or category == "macro":
        return "financial"
    if GEO_POLITICAL.search(text) or category == "regulation":
        return "geopolitical"
    return "financial"


def _is_financial_market(question: str, description: str = "") -> bool:
    text = f"{question} {description}"
    if BTC_EXCLUDE.search(text):
        return False
    if BTC_PRICE_MARKET.search(text):
        return False
    return bool(FINANCIAL_GLOBAL.search(text) or BTC_MACRO.search(text))


def _is_geopolitical_market(question: str, description: str = "") -> bool:
    text = f"{question} {description}"
    if BTC_EXCLUDE.search(text):
        return False
    if BTC_PRICE_MARKET.search(text):
        return False
    if FINANCIAL_GLOBAL.search(text) and not GEO_POLITICAL.search(text):
        return False
    return bool(GEO_POLITICAL.search(text))


def _is_past_end(end_date: str | None) -> bool:
    if not end_date:
        return False
    try:
        end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return end < datetime.now(timezone.utc)
    except ValueError:
        return False


def _classify_topics(
    question: str,
    description: str = "",
    *,
    section: str | None = None,
    category: str | None = None,
    tags: list | None = None,
) -> list[str]:
    text = f"{question} {description}"
    topics: list[str] = []
    if _is_btc_section_market(question, description, tags):
        topics.append("bitcoin")
    if ECONOMICS_TOPIC.search(text):
        topics.append("economics")
    if FINANCE_TOPIC.search(text) or (section == "financial" and category == "macro" and not ECONOMICS_TOPIC.search(text)):
        topics.append("finance")
    if POLITICS_TOPIC.search(text):
        topics.append("politics")
    if GEO_POLITICAL.search(text) and not FINANCIAL_GLOBAL.search(text):
        topics.append("geopolitics")
    elif GEO_POLITICAL.search(text) and section == "geopolitical":
        if "geopolitics" not in topics:
            topics.append("geopolitics")
    if section == "btc-price" and "bitcoin" not in topics:
        topics.append("bitcoin")
    if section == "financial":
        if not any(t in topics for t in ("finance", "economics")):
            topics.append("economics" if ECONOMICS_TOPIC.search(text) else "finance")
    if section == "geopolitical":
        if POLITICS_TOPIC.search(text) and "politics" not in topics:
            topics.append("politics")
        if "geopolitics" not in topics:
            topics.append("geopolitics")
    return list(dict.fromkeys(topics)) or ["bitcoin"]


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
    volume_total: float | None = None,
    active: bool = True,
    event_title: str | None = None,
    tags: list | None = None,
) -> dict | None:
    if not question or yes_p is None:
        return None
    if no_p is None:
        no_p = max(0.0, 1.0 - yes_p)
    yes_p = max(0.0, min(1.0, yes_p))
    no_p = max(0.0, min(1.0, no_p))
    cat = category or _classify_category(question, description)
    sec = _classify_section(question, description, cat, tags=tags)
    tf = timeframe or _classify_timeframe(end_date)
    topics = _classify_topics(question, description, section=sec, category=cat, tags=tags)
    resolved = (not active) or _is_past_end(end_date)
    btc_highlight = _is_btc_section_market(question, description, tags)
    return {
        "id": mid,
        "question": question.strip(),
        "eventTitle": event_title,
        "yesOdds": round(yes_p, 4),
        "noOdds": round(no_p, 4),
        "yesProb": round(yes_p * 100, 1),
        "noProb": round(no_p * 100, 1),
        "volume24h": volume24h,
        "volumeTotal": volume_total,
        "liquidity": liquidity,
        "endDate": (end_date or "")[:10] or None,
        "platform": platform,
        "category": cat,
        "section": sec,
        "topics": topics,
        "timeframe": tf,
        "url": url,
        "description": (description or "").strip()[:1200],
        "sparkline": sparkline or [],
        "active": active and not resolved,
        "resolved": resolved,
        "btcHighlight": btc_highlight,
    }


def _parse_polymarket_event(event: dict, *, relevance_fn=None) -> list[dict]:
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
            rel = relevance_fn or (lambda qq, dd, tg=None: _is_btc_relevant(qq, dd, tg))
            if not rel(q, desc, tags):
                continue
            yes_p, no_p = _parse_prices(m.get("outcomePrices"))
            row = _normalize_market(
                mid=f"poly-{m.get('id') or m.get('slug')}",
                question=q,
                yes_p=yes_p,
                no_p=no_p,
                volume24h=_as_float(m.get("volume24hr") or m.get("volume24hrClob")),
                volume_total=_as_float(m.get("volume") or m.get("volumeNum")),
                end_date=m.get("endDate") or event.get("endDate"),
                platform="polymarket",
                url=_poly_url(m.get("slug"), event_slug),
                description=desc,
                sparkline=_sparkline_from_change(m.get("oneWeekPriceChange"), yes_p),
                liquidity=_as_float(m.get("liquidity") or m.get("liquidityClob")),
                active=bool(m.get("active", True)) and not m.get("closed"),
                event_title=event_title,
                tags=tags,
            )
            if row:
                markets_out.append(row)
        return markets_out

    q = event.get("title") or event.get("question") or ""
    desc = event.get("description") or ""
    rel = relevance_fn or (lambda qq, dd, tg=None: _is_btc_relevant(qq, dd, tg))
    if not rel(q, desc, tags):
        return []
    yes_p, no_p = _parse_prices(event.get("outcomePrices"))
    row = _normalize_market(
        mid=f"poly-ev-{event.get('id')}",
        question=q,
        yes_p=yes_p,
        no_p=no_p,
        volume24h=_as_float(event.get("volume24hr")),
        volume_total=_as_float(event.get("volume")),
        end_date=event.get("endDate"),
        platform="polymarket",
        url=_poly_url(event_slug),
        description=desc,
        sparkline=_sparkline_from_change(event.get("oneWeekPriceChange"), yes_p),
        liquidity=_as_float(event.get("liquidity")),
        active=bool(event.get("active", True)) and not event.get("closed"),
        tags=tags,
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
        volume_total=_as_float(m.get("volume") or m.get("volumeNum")),
        end_date=m.get("endDate"),
        platform="polymarket",
        url=_poly_url(m.get("slug"), ev_slug),
        description=desc,
        sparkline=_sparkline_from_change(m.get("oneWeekPriceChange"), yes_p),
        liquidity=_as_float(m.get("liquidity") or m.get("liquidityClob")),
        active=bool(m.get("active", True)) and not m.get("closed"),
        event_title=(event or {}).get("title"),
        tags=tags,
    )


def _sparkline_from_change(week_change, current_yes: float | None) -> list[float]:
    if current_yes is None:
        return []
    ch = _as_float(week_change) or 0.0
    start = max(0.0, min(1.0, current_yes - ch))
    mid = (start + current_yes) / 2
    return [round(start, 3), round(mid, 3), round(current_yes, 3)]


def _polymarket_search(queries: list[str], relevance_fn, seen: set[str], results: list[dict]) -> None:
    for q in queries:
        url = (
            f"{POLYMARKET_GAMMA}/public-search?"
            + urllib.parse.urlencode({"q": q, "limit_per_type": 15, "events_status": "active"})
        )
        try:
            payload = _fetch_json(url)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
            continue

        rel = lambda qq, dd, tg=None: relevance_fn(qq, dd)  # noqa: E731
        for event in payload.get("events") or []:
            if not event.get("active") or event.get("closed"):
                continue
            for row in _parse_polymarket_event(event, relevance_fn=rel):
                if row["id"] not in seen:
                    seen.add(row["id"])
                    results.append(row)


def _fetch_polymarket_live() -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()

    _polymarket_search(
        [
            "bitcoin price",
            "bitcoin 2026",
            "btc above",
            "bitcoin all time high",
            "bitcoin etf",
            "spot bitcoin etf",
            "bitcoin halving",
            "strategic bitcoin reserve",
            "bitcoin regulation",
            "crypto bitcoin",
            "btc usdt",
        ],
        _is_btc_section_market,
        seen,
        results,
    )
    _polymarket_search(
        [
            "fed rate decision",
            "fomc",
            "cpi inflation",
            "recession",
            "fed rate cut",
            "treasury yield",
            "ecb rate",
            "european central bank",
            "bank of england rate",
            "bank of japan",
            "eurozone inflation",
            "uk cpi",
            "china gdp",
            "opec oil",
            "rba rate",
            "monetary policy",
            "interest rate",
            "unemployment",
            "gdp growth",
        ],
        _is_financial_market,
        seen,
        results,
    )
    _polymarket_search(
        [
            "uk election",
            "france election",
            "germany election",
            "india election",
            "ukraine ceasefire",
            "taiwan invasion",
            "eu sanctions",
            "nato",
            "crypto regulation",
            "tariff trade war",
            "israel ceasefire",
            "brazil election",
            "presidential election",
            "prime minister",
            "congress election",
            "trade war",
        ],
        _is_geopolitical_market,
        seen,
        results,
    )

    tag_url = (
        f"{POLYMARKET_GAMMA}/events?"
        + urllib.parse.urlencode(
            {"tag_slug": "bitcoin", "active": "true", "closed": "false", "limit": 48, "order": "volume24hr"}
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
                volume_total=_as_float(m.get("volume")),
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


def _enrich_markets(markets: list[dict]) -> list[dict]:
    out: list[dict] = []
    for raw in markets:
        m = dict(raw)
        if "topics" not in m:
            m["topics"] = _classify_topics(
                m.get("question", ""),
                m.get("description", ""),
                section=m.get("section"),
                category=m.get("category"),
            )
        if "btcHighlight" not in m:
            m["btcHighlight"] = _is_btc_section_market(m.get("question", ""), m.get("description", ""))
        if "resolved" not in m:
            m["resolved"] = (not m.get("active", True)) or _is_past_end(m.get("endDate"))
        if m.get("resolved"):
            m["active"] = False
        if m.get("volumeTotal") is None and m.get("volume24h") is not None:
            m["volumeTotal"] = float(m["volume24h"]) * 14
        out.append(m)
    return out


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
            "section": "btc-price",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/bitcoin-price-before-2027",
            "description": "Resolves Yes if BTC trades at or above $100k on Binance BTC/USDT before Jan 1, 2027.",
            "sparkline": [0.52, 0.55, 0.58],
            "active": True,
        },
        {
            "id": "mock-kalshi-btc-100k-2026",
            "question": "Will Bitcoin reach $100,000 before 2027?",
            "eventTitle": "Bitcoin price before 2027",
            "yesOdds": 0.48,
            "noOdds": 0.50,
            "yesProb": 48.0,
            "noProb": 50.0,
            "volume24h": 112_400,
            "volumeTotal": 1_980_000,
            "liquidity": 198_000,
            "endDate": "2026-12-31",
            "platform": "kalshi",
            "category": "price-targets",
            "section": "btc-price",
            "timeframe": "long-term",
            "url": "https://kalshi.com/markets/kxbtcmax",
            "description": "Kalshi BTC $100k bracket — cross-venue vs Polymarket pricing.",
            "sparkline": [0.44, 0.46, 0.48],
            "active": True,
        },
        {
            "id": "mock-poly-btc-120k-2026",
            "question": "Will Bitcoin reach $120,000 before 2027?",
            "eventTitle": "Bitcoin price before 2027",
            "yesOdds": 0.62,
            "noOdds": 0.36,
            "yesProb": 62.0,
            "noProb": 36.0,
            "volume24h": 198_200,
            "liquidity": 285_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "price-targets",
            "section": "btc-price",
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
            "section": "btc-price",
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
            "section": "btc-price",
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
            "section": "btc-price",
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
            "section": "btc-price",
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
            "section": "btc-price",
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
            "section": "btc-price",
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
            "section": "btc-price",
            "timeframe": "today",
            "url": "https://kalshi.com/markets/kxbtcd",
            "description": "Same-day directional BTC market for near-term sentiment.",
            "sparkline": [0.48, 0.5, 0.51],
            "active": True,
        },
        {
            "id": "mock-poly-fed-cut-jul",
            "question": "Will the Fed cut rates at the July 2026 FOMC meeting?",
            "yesOdds": 0.62,
            "noOdds": 0.38,
            "yesProb": 62.0,
            "noProb": 38.0,
            "volume24h": 412_000,
            "liquidity": 520_000,
            "endDate": "2026-07-30",
            "platform": "polymarket",
            "category": "macro",
            "section": "financial",
            "timeframe": "y2026",
            "url": "https://polymarket.com/event/fed-decision-july-2026",
            "description": "Fed funds path drives liquidity and risk appetite — primary macro channel into BTC.",
            "sparkline": [0.55, 0.58, 0.62],
            "active": True,
        },
        {
            "id": "mock-poly-cpi-jun",
            "question": "Will June 2026 CPI come in below 2.5% YoY?",
            "yesOdds": 0.41,
            "noOdds": 0.59,
            "yesProb": 41.0,
            "noProb": 59.0,
            "volume24h": 186_000,
            "endDate": "2026-07-15",
            "platform": "polymarket",
            "category": "macro",
            "section": "financial",
            "timeframe": "y2026",
            "url": "https://polymarket.com/event/cpi-june-2026",
            "description": "Inflation surprises move real yields and USD — key inputs for BTC risk pricing.",
            "sparkline": [0.38, 0.4, 0.41],
            "active": True,
        },
        {
            "id": "mock-poly-recession-2026",
            "question": "US recession declared before end of 2026?",
            "yesOdds": 0.28,
            "noOdds": 0.72,
            "yesProb": 28.0,
            "noProb": 72.0,
            "volume24h": 224_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "macro",
            "section": "financial",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/us-recession-2026",
            "description": "Growth scares typically hit BTC beta first, then liquidity response matters.",
            "sparkline": [0.32, 0.3, 0.28],
            "active": True,
        },
        {
            "id": "mock-poly-crypto-bill",
            "question": "US crypto market structure bill signed into law in 2026?",
            "yesOdds": 0.35,
            "noOdds": 0.65,
            "yesProb": 35.0,
            "noProb": 65.0,
            "volume24h": 156_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "regulation",
            "section": "btc-price",
            "timeframe": "y2026",
            "url": "https://polymarket.com/event/crypto-market-structure-2026",
            "description": "Federal legislation on digital assets — direct policy risk for US BTC access and flows.",
            "sparkline": [0.3, 0.33, 0.35],
            "active": True,
        },
        {
            "id": "mock-poly-tariff-risk",
            "question": "New US tariffs on China before Q4 2026?",
            "yesOdds": 0.33,
            "noOdds": 0.67,
            "yesProb": 33.0,
            "noProb": 67.0,
            "volume24h": 78_500,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "regulation",
            "section": "geopolitical",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/tariff-china-2026",
            "description": "Trade-war escalations affect global growth, USD liquidity, and risk appetite.",
            "sparkline": [0.36, 0.34, 0.33],
            "active": True,
        },
        {
            "id": "mock-poly-ecb-cut-sep",
            "question": "Will the ECB cut rates at the September 2026 meeting?",
            "yesOdds": 0.48,
            "noOdds": 0.52,
            "yesProb": 48.0,
            "noProb": 52.0,
            "volume24h": 198_000,
            "liquidity": 265_000,
            "endDate": "2026-09-18",
            "platform": "polymarket",
            "category": "macro",
            "section": "financial",
            "timeframe": "y2026",
            "url": "https://polymarket.com/event/ecb-september-2026",
            "description": "Eurozone monetary policy — ECB path shapes EUR liquidity and global risk pricing.",
            "sparkline": [0.44, 0.46, 0.48],
            "active": True,
        },
        {
            "id": "mock-poly-boe-hold-aug",
            "question": "Will the Bank of England hold rates at the August 2026 MPC meeting?",
            "yesOdds": 0.55,
            "noOdds": 0.45,
            "yesProb": 55.0,
            "noProb": 45.0,
            "volume24h": 124_000,
            "endDate": "2026-08-07",
            "platform": "polymarket",
            "category": "macro",
            "section": "financial",
            "timeframe": "y2026",
            "url": "https://polymarket.com/event/boe-august-2026",
            "description": "UK rates and gilt yields — BOE decisions feed into global financial conditions.",
            "sparkline": [0.51, 0.53, 0.55],
            "active": True,
        },
        {
            "id": "mock-poly-boj-hike",
            "question": "Will the Bank of Japan raise rates before end of 2026?",
            "yesOdds": 0.39,
            "noOdds": 0.61,
            "yesProb": 39.0,
            "noProb": 61.0,
            "volume24h": 156_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "macro",
            "section": "financial",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/boj-rate-2026",
            "description": "BOJ normalization affects yen carry trades and global liquidity flows.",
            "sparkline": [0.35, 0.37, 0.39],
            "active": True,
        },
        {
            "id": "mock-poly-china-gdp",
            "question": "Will China 2026 GDP growth exceed 5%?",
            "yesOdds": 0.44,
            "noOdds": 0.56,
            "yesProb": 44.0,
            "noProb": 56.0,
            "volume24h": 88_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "macro",
            "section": "financial",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/china-gdp-2026",
            "description": "China growth outlook — key driver for commodities, EM risk, and global cycle.",
            "sparkline": [0.41, 0.42, 0.44],
            "active": True,
        },
        {
            "id": "mock-poly-uk-election",
            "question": "Will the UK hold a general election before end of 2026?",
            "yesOdds": 0.22,
            "noOdds": 0.78,
            "yesProb": 22.0,
            "noProb": 78.0,
            "volume24h": 142_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "regulation",
            "section": "geopolitical",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/uk-election-2026",
            "description": "UK political calendar — fiscal and trade policy shifts affect European risk.",
            "sparkline": [0.25, 0.23, 0.22],
            "active": True,
        },
        {
            "id": "mock-poly-ukraine-ceasefire",
            "question": "Ukraine–Russia ceasefire before end of 2026?",
            "yesOdds": 0.31,
            "noOdds": 0.69,
            "yesProb": 31.0,
            "noProb": 69.0,
            "volume24h": 312_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "regulation",
            "section": "geopolitical",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/ukraine-ceasefire-2026",
            "description": "Geopolitical de-escalation market — energy and defense spending implications globally.",
            "sparkline": [0.28, 0.29, 0.31],
            "active": True,
        },
        {
            "id": "mock-poly-taiwan",
            "question": "China military action against Taiwan before 2027?",
            "yesOdds": 0.12,
            "noOdds": 0.88,
            "yesProb": 12.0,
            "noProb": 88.0,
            "volume24h": 245_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "regulation",
            "section": "geopolitical",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/taiwan-2027",
            "description": "Tail-risk geopolitical contract — semiconductor supply chain and global risk-off.",
            "sparkline": [0.11, 0.11, 0.12],
            "active": True,
        },
        {
            "id": "mock-poly-india-election",
            "question": "Will BJP retain majority in 2026 Indian general election?",
            "yesOdds": 0.58,
            "noOdds": 0.42,
            "yesProb": 58.0,
            "noProb": 42.0,
            "volume24h": 96_000,
            "endDate": "2026-12-31",
            "platform": "polymarket",
            "category": "regulation",
            "section": "geopolitical",
            "timeframe": "long-term",
            "url": "https://polymarket.com/event/india-election-2026",
            "description": "India political outlook — reform continuity and EM capital flows.",
            "sparkline": [0.54, 0.56, 0.58],
            "active": True,
        },
        {
            "id": "mock-poly-btc-90k-resolved",
            "question": "Did Bitcoin close above $90,000 in June 2026?",
            "yesOdds": 1.0,
            "noOdds": 0.0,
            "yesProb": 100.0,
            "noProb": 0.0,
            "volume24h": 0,
            "volumeTotal": 1_240_000,
            "liquidity": 0,
            "endDate": "2026-06-28",
            "platform": "polymarket",
            "category": "price-targets",
            "section": "btc-price",
            "timeframe": "y2026",
            "url": "https://polymarket.com/event/bitcoin-june-2026",
            "description": "Resolved Yes — BTC closed above $90k on Binance BTC/USDT in June 2026.",
            "sparkline": [0.72, 0.88, 1.0],
            "active": False,
            "resolved": True,
        },
    ]
    return _enrich_markets(seed)


ARB_MIN_CROSS_SPREAD = 5.0
ARB_MIN_JACCARD = 0.38
ARB_MIN_SUM_DISCOUNT = 1.5


def _question_tokens(question: str) -> set[str]:
    q = question.lower()
    q = re.sub(r"[^\w\s$]", " ", q)
    stop = {
        "will", "the", "a", "an", "on", "at", "before", "end", "of", "in", "this",
        "week", "by", "be", "is", "to", "for", "and", "or", "with", "does", "did",
        "what", "how", "any", "than", "into", "from",
    }
    return {t for t in q.split() if t not in stop and len(t) > 1}


def _strike_values(question: str) -> set[int]:
    strikes: set[int] = set()
    for m in re.finditer(r"\$?\s*([\d,]+)\s*(k|000)?", question, re.I):
        num = int(m.group(1).replace(",", ""))
        suffix = (m.group(2) or "").lower()
        if suffix in ("k", "000") or num < 1000:
            num = num * 1000 if num < 1000 else num
        if num >= 10_000:
            strikes.add(num)
    return strikes


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _ladder_similarity(qa: str, qb: str) -> float:
    def _norm(q: str) -> set[str]:
        q = re.sub(r"\$?[\d,]+k?", " strike ", q.lower())
        return _question_tokens(q)

    return _jaccard(_norm(qa), _norm(qb))


def _active_markets(markets: list[dict]) -> list[dict]:
    return [m for m in markets if not m.get("resolved") and m.get("active", True)]


def _find_sum_discount_arbs(markets: list[dict]) -> list[dict]:
    opps: list[dict] = []
    for m in _active_markets(markets):
        yes_o = m.get("yesOdds")
        no_o = m.get("noOdds")
        if yes_o is None or no_o is None:
            continue
        total = yes_o + no_o
        discount = (1.0 - total) * 100
        if discount < ARB_MIN_SUM_DISCOUNT:
            continue
        opps.append(
            {
                "type": "sum-discount",
                "edgePct": round(discount, 1),
                "confidence": "high" if discount >= 3 else "medium",
                "title": f"Yes+No discount · {discount:.1f}% edge",
                "summary": f"Combined odds {total * 100:.1f}¢ — buy both sides for ${total:.2f} to lock $1",
                "action": (
                    f"Buy Yes ({m['yesProb']:.0f}%) + No ({m['noProb']:.0f}%) on "
                    f"{m['platform'].title()} — net {discount:.1f}% below par"
                ),
                "description": m["question"],
                "markets": [_arb_market_ref(m)],
            }
        )
    return sorted(opps, key=lambda x: x["edgePct"], reverse=True)


def _arb_market_ref(m: dict) -> dict:
    return {
        "id": m.get("id"),
        "platform": m.get("platform"),
        "question": m.get("question"),
        "yesProb": m.get("yesProb"),
        "noProb": m.get("noProb"),
        "url": m.get("url"),
    }


def _find_cross_platform_arbs(markets: list[dict]) -> list[dict]:
    opps: list[dict] = []
    active = _active_markets(markets)
    poly = [m for m in active if m.get("platform") == "polymarket"]
    kalshi = [m for m in active if m.get("platform") == "kalshi"]
    if not poly or not kalshi:
        return opps

    seen_pairs: set[str] = set()
    for a in poly:
        tok_a = _question_tokens(a["question"])
        strike_a = _strike_values(a["question"])
        for b in kalshi:
            tok_b = _question_tokens(b["question"])
            strike_b = _strike_values(b["question"])
            sim = _jaccard(tok_a, tok_b)
            btc_related = bool({"bitcoin", "btc"} & (tok_a | tok_b))
            strike_match = bool(strike_a & strike_b) and btc_related
            if strike_a and strike_b and not strike_match:
                continue
            if not strike_match and sim < max(ARB_MIN_JACCARD, 0.48):
                continue
            spread = abs((a.get("yesProb") or 0) - (b.get("yesProb") or 0))
            if spread < ARB_MIN_CROSS_SPREAD:
                continue
            pair_key = "|".join(sorted([a["id"], b["id"]]))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            low, high = (a, b) if (a.get("yesProb") or 0) <= (b.get("yesProb") or 0) else (b, a)
            confidence = "high" if strike_match or sim >= 0.5 else "medium"
            opps.append(
                {
                    "type": "cross-platform",
                    "edgePct": round(spread, 1),
                    "confidence": confidence,
                    "title": f"Cross-venue · {spread:.0f}pp spread",
                    "summary": (
                        f"{low['platform'].title()} Yes {low['yesProb']:.0f}% vs "
                        f"{high['platform'].title()} Yes {high['yesProb']:.0f}%"
                    ),
                    "action": (
                        f"Buy Yes on {low['platform'].title()} ({low['yesProb']:.0f}%) · "
                        f"Buy No on {high['platform'].title()} ({high['noProb']:.0f}%)"
                    ),
                    "description": low["question"],
                    "markets": [_arb_market_ref(low), _arb_market_ref(high)],
                }
            )
    return sorted(opps, key=lambda x: x["edgePct"], reverse=True)


def _find_monotonicity_arbs(markets: list[dict]) -> list[dict]:
    """Higher BTC strike should not have higher Yes prob than lower strike (same horizon)."""
    opps: list[dict] = []
    buckets: dict[str, list[dict]] = {}
    for m in _active_markets(markets):
        strikes = _strike_values(m["question"])
        if not strikes or m.get("category") != "price-targets":
            continue
        strike = max(strikes)
        end = m.get("endDate") or "unknown"
        end_key = end[:7] if len(end) >= 7 else end
        key = f"{m.get('platform')}|{end_key}"
        buckets.setdefault(key, []).append({**m, "_strike": strike})

    for group in buckets.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda x: x["_strike"])
        for i in range(len(group) - 1):
            low_m, high_m = group[i], group[i + 1]
            same_event = (
                low_m.get("eventTitle")
                and low_m.get("eventTitle") == high_m.get("eventTitle")
            )
            if not same_event and _ladder_similarity(low_m["question"], high_m["question"]) < 0.55:
                continue
            low_p = low_m.get("yesProb") or 0
            high_p = high_m.get("yesProb") or 0
            if high_p <= low_p + 2:
                continue
            violation = high_p - low_p
            opps.append(
                {
                    "type": "monotonicity",
                    "edgePct": round(violation, 1),
                    "confidence": "medium",
                    "title": f"Strike ladder mismatch · {violation:.0f}pp",
                    "summary": (
                        f"${low_m['_strike']:,} Yes {low_p:.0f}% vs "
                        f"${high_m['_strike']:,} Yes {high_p:.0f}%"
                    ),
                    "action": (
                        f"Sell Yes on ${high_m['_strike']:,} ({high_p:.0f}%) · "
                        f"Buy Yes on ${low_m['_strike']:,} ({low_p:.0f}%)"
                    ),
                    "description": (
                        f"Higher strike implies lower probability — "
                        f"${high_m['_strike']:,} priced richer than ${low_m['_strike']:,}."
                    ),
                    "markets": [_arb_market_ref(low_m), _arb_market_ref(high_m)],
                }
            )
    return sorted(opps, key=lambda x: x["edgePct"], reverse=True)


def _find_arbitrage_opportunities(markets: list[dict]) -> list[dict]:
    combined: list[dict] = []
    combined.extend(_find_cross_platform_arbs(markets))
    combined.extend(_find_sum_discount_arbs(markets))
    combined.extend(_find_monotonicity_arbs(markets))
    combined.sort(key=lambda x: (x.get("edgePct") or 0), reverse=True)
    return combined[:12]


def _topic_sentiment(markets: list[dict]) -> list[dict]:
    topics = ("bitcoin", "finance", "economics", "politics", "geopolitics")
    labels = {
        "bitcoin": "Bitcoin",
        "finance": "Finance",
        "economics": "Economics",
        "politics": "Politics",
        "geopolitics": "Geopolitics",
    }
    signals: list[dict] = []
    active = _active_markets(markets)
    for tid in topics:
        subset = [m for m in active if tid in (m.get("topics") or [])]
        if not subset:
            continue
        avg_yes = sum(m.get("yesProb") or 0 for m in subset) / len(subset)
        vol = sum(m.get("volume24h") or 0 for m in subset)
        bias = "bullish" if avg_yes >= 55 else "bearish" if avg_yes <= 45 else "neutral"
        signals.append(
            {
                "topic": tid,
                "label": labels[tid],
                "avgYes": round(avg_yes, 1),
                "count": len(subset),
                "volume24h": vol,
                "bias": bias,
            }
        )
    return sorted(signals, key=lambda s: s["volume24h"], reverse=True)


def _section_outlook(markets: list[dict], section: str) -> dict:
    subset = [m for m in markets if m.get("section") == section]
    if section == "btc-price":
        return _build_outlook(subset)
    if section == "financial":
        lead = max(subset, key=lambda m: m.get("volume24h") or 0, default=None)
        headline = "Financial & economic events — worldwide macro odds"
        if lead:
            headline = f"Lead macro market: {lead['yesProb']:.0f}% Yes — {lead['question'][:60]}"
        return {
            "headline": headline,
            "lines": [
                "Central bank decisions, inflation, growth, and commodity markets from the US, Europe, Asia-Pacific, and beyond.",
                f"Tracking {len(subset)} financial/economic markets — no Bitcoin price requirement.",
                "Macro moves often transmit to BTC via real yields, USD, and risk appetite. Compare with Macro tab — not financial advice.",
            ],
            "activeMarkets": len(subset),
            "totalVolume24h": sum(m.get("volume24h") or 0 for m in subset),
        }
    if section == "geopolitical":
        headline = "Geopolitics & politics — worldwide coverage"
        top = max(subset, key=lambda m: m.get("volume24h") or 0, default=None)
        if top:
            headline = f"Top geo/politics market: {top['yesProb']:.0f}% Yes on {top['question'][:55]}…"
        return {
            "headline": headline,
            "lines": [
                "Elections, conflicts, sanctions, trade policy, and regulation across major economies — not US-only.",
                f"Tracking {len(subset)} geopolitical and political markets worldwide.",
                "Sports and celebrity markets excluded. Policy and risk events may affect BTC through global risk channels.",
            ],
            "activeMarkets": len(subset),
            "totalVolume24h": sum(m.get("volume24h") or 0 for m in subset),
        }
    return _build_outlook(subset)


def _section_heroes(markets: list[dict], section: str) -> list[dict]:
    subset = [m for m in markets if m.get("section") == section]
    vol = sum(m.get("volume24h") or 0 for m in subset)
    bullish = len([m for m in subset if (m.get("yesProb") or 0) >= 50])
    if section == "btc-price":
        outlook = _build_outlook(subset)
        return [
            {
                "name": "BTC > $100k",
                "value": f"{outlook['btc100kProb']:.0f}%" if outlook.get("btc100kProb") is not None else "—",
                "sub": "Implied probability",
            },
            {"name": "Price markets", "value": str(len(subset)), "sub": "Active"},
            {"name": "24h volume", "value": _fmt_usd(vol), "sub": "Section total"},
            {"name": "Bullish bets", "value": str(bullish), "sub": "Yes ≥ 50%"},
        ]
    if section == "financial":
        lead = max(subset, key=lambda m: m.get("volume24h") or 0, default=None)
        return [
            {
                "name": "Lead macro",
                "value": f"{lead['yesProb']:.0f}%" if lead else "—",
                "sub": "Highest-volume Yes",
            },
            {"name": "Macro markets", "value": str(len(subset)), "sub": "Worldwide"},
            {"name": "24h volume", "value": _fmt_usd(vol), "sub": "Section total"},
            {"name": "Bullish macro", "value": str(bullish), "sub": "Yes ≥ 50%"},
        ]
    return [
        {"name": "Geo / politics", "value": str(len(subset)), "sub": "Worldwide"},
        {"name": "Bullish odds", "value": str(bullish), "sub": "Yes ≥ 50%"},
        {"name": "24h volume", "value": _fmt_usd(vol), "sub": "Section total"},
        {
            "name": "Top Yes",
            "value": f"{max((m.get('yesProb') or 0 for m in subset), default=0):.0f}%",
            "sub": "Highest implied",
        },
    ]


def _build_outlook(markets: list[dict]) -> dict:
    active = _active_markets(markets)
    price_markets = [m for m in active if m.get("category") == "price-targets"]
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
    arbitrage = _find_arbitrage_opportunities(markets)
    signals = _topic_sentiment(markets)

    cross_spreads = [a for a in arbitrage if a["type"] == "cross-platform"]
    max_cross = max((a["edgePct"] for a in cross_spreads), default=0)

    headline = "Prediction markets — outlook & arb scan"
    if arbitrage:
        headline = f"{len(arbitrage)} arb opportunit{'y' if len(arbitrage) == 1 else 'ies'} · max spread {max_cross:.0f}pp"
    elif above_100:
        headline = f"BTC > $100k implied: {above_100['yesProb']:.0f}% · no cross-venue gaps detected"
    elif avg_yes is not None:
        headline = f"Avg BTC price-market Yes: {avg_yes:.0f}% · arb scan clear"

    lead_macro = max(
        [m for m in active if "finance" in (m.get("topics") or []) or "economics" in (m.get("topics") or [])],
        key=lambda m: m.get("volume24h") or 0,
        default=None,
    )

    return {
        "headline": headline,
        "btc100kProb": above_100["yesProb"] if above_100 else None,
        "bullishCount": len(bullish),
        "activeMarkets": len(active),
        "totalVolume24h": sum(m.get("volume24h") or 0 for m in active),
        "arbCount": len(arbitrage),
        "maxArbEdge": arbitrage[0]["edgePct"] if arbitrage else 0,
        "signals": signals,
        "arbitrage": arbitrage,
        "lines": _outlook_commentary(markets, above_100, avg_yes, arbitrage, signals, lead_macro),
    }


def _outlook_commentary(markets, above_100, avg_yes, arbitrage, signals, lead_macro) -> list[str]:
    lines = []
    active = _active_markets(markets)

    if above_100:
        lines.append(
            f"Benchmark: {above_100['yesProb']:.0f}% implied probability BTC reaches $100k "
            f"({above_100['platform'].title()}) — primary cycle sentiment gauge."
        )

    if signals:
        top = signals[0]
        lines.append(
            f"Highest-volume topic: {top['label']} — avg Yes {top['avgYes']:.0f}% across "
            f"{top['count']} active markets ({_fmt_usd(top['volume24h'])} 24h)."
        )

    if lead_macro:
        lines.append(
            f"Lead macro contract: {lead_macro['yesProb']:.0f}% Yes on "
            f"“{lead_macro['question'][:70]}…” ({lead_macro['platform'].title()})."
        )

    if arbitrage:
        cross = [a for a in arbitrage if a["type"] == "cross-platform"]
        sum_d = [a for a in arbitrage if a["type"] == "sum-discount"]
        mono = [a for a in arbitrage if a["type"] == "monotonicity"]
        parts = []
        if cross:
            parts.append(f"{len(cross)} cross-venue")
        if sum_d:
            parts.append(f"{len(sum_d)} sum-discount")
        if mono:
            parts.append(f"{len(mono)} strike-ladder")
        lines.append(
            f"Arb scan: {', '.join(parts)} gap{'s' if len(arbitrage) != 1 else ''} detected — "
            "review legs below; edges are pre-fee and may not be executable."
        )
        best = arbitrage[0]
        lines.append(f"Top opportunity ({best['edgePct']:.1f}% edge): {best['action']}")
    else:
        lines.append(
            "Arb scan: no material cross-venue or pricing gaps (>5pp) across Polymarket/Kalshi pairs in the current universe."
        )

    price_count = len([m for m in active if m.get("category") == "price-targets"])
    if avg_yes is not None and price_count:
        lines.append(
            f"BTC price-target basket averages {avg_yes:.0f}% Yes across {price_count} contracts — "
            "cross-check with Market → Indicators for technical confluence."
        )

    platforms: dict[str, int] = {}
    for m in active:
        platforms[m["platform"]] = platforms.get(m["platform"], 0) + 1
    plat_txt = ", ".join(f"{k}: {v}" for k, v in sorted(platforms.items()))
    lines.append(f"Universe: {len(active)} active markets ({plat_txt}). Not financial advice.")
    return lines


PM_SECTION_CAPS = {"btc-price": 60, "financial": 60, "geopolitical": 60}


def _rank_markets(markets: list[dict]) -> list[dict]:
    return sorted(markets, key=lambda m: m.get("volume24h") or 0, reverse=True)


def _cap_by_section(markets: list[dict]) -> list[dict]:
    buckets: dict[str, list[dict]] = {sid: [] for sid in PM_SECTION_CAPS}
    for m in markets:
        sec = m.get("section") or "btc-price"
        if sec not in buckets:
            sec = "btc-price"
        cap = PM_SECTION_CAPS[sec]
        if len(buckets[sec]) < cap:
            buckets[sec].append(m)
    out: list[dict] = []
    for sid in ("btc-price", "financial", "geopolitical"):
        out.extend(buckets[sid])
    return out


def _merge_live_with_mock(live: list[dict], mock: list[dict]) -> list[dict]:
    """Fill each section from live first, then backfill thin sections from mock."""
    buckets: dict[str, list[dict]] = {sid: [] for sid in PM_SECTION_CAPS}
    seen_ids: set[str] = set()
    seen_q: set[str] = set()

    def _add(m: dict) -> None:
        sec = m.get("section") or "btc-price"
        if sec not in buckets:
            sec = "btc-price"
        if len(buckets[sec]) >= PM_SECTION_CAPS[sec]:
            return
        mid = m.get("id")
        qkey = m["question"].lower()[:60]
        if mid and mid in seen_ids:
            return
        if qkey in seen_q:
            return
        if mid:
            seen_ids.add(mid)
        seen_q.add(qkey)
        buckets[sec].append(m)

    for m in _rank_markets(live):
        _add(m)
    for m in _rank_markets(mock):
        _add(m)

    out: list[dict] = []
    for sid in ("btc-price", "financial", "geopolitical"):
        out.extend(buckets[sid])
    return out


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
        markets = _enrich_markets(_merge_live_with_mock(live, mock))
        source = "live" if live else "mock"
        if live and len(live) < len(mock):
            source = "live+mock"

    outlook = _build_outlook(markets)
    sections_meta = {
        "btc-price": {
            "label": "BTC Price",
            "description": "All BTC-related markets — price, ETF, halving, policy; use Category filter to narrow",
        },
        "financial": {
            "label": "Financial Events",
            "description": "All worldwide financial & economic markets — central banks, inflation, growth, commodities",
        },
        "geopolitical": {
            "label": "Geopolitical",
            "description": "All worldwide politics & geopolitics — elections, conflicts, sanctions, trade & policy",
        },
    }
    section_payload = {
        sid: {"heroes": _section_heroes(markets, sid), "outlook": _section_outlook(markets, sid)}
        for sid in sections_meta
    }
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
                "name": "Arb opportunities",
                "value": str(outlook.get("arbCount", 0)),
                "sub": (
                    f"Max {outlook['maxArbEdge']:.0f}pp edge"
                    if outlook.get("arbCount")
                    else "Scan clear"
                ),
            },
            {
                "name": "24h volume",
                "value": _fmt_usd(outlook["totalVolume24h"]),
                "sub": "Active universe",
            },
            {
                "name": "Active markets",
                "value": str(outlook["activeMarkets"]),
                "sub": "Polymarket + Kalshi",
            },
        ],
        "outlook": outlook,
        "markets": markets,
        "sections": sections_meta,
        "sectionData": section_payload,
        "filters": {
            "topics": [
                {"id": "bitcoin", "label": "Bitcoin"},
                {"id": "finance", "label": "Finance"},
                {"id": "economics", "label": "Economics"},
                {"id": "politics", "label": "Politics"},
                {"id": "geopolitics", "label": "Geopolitics"},
            ],
            "platforms": [
                {"id": "all", "label": "All"},
                {"id": "polymarket", "label": "Polymarket"},
                {"id": "kalshi", "label": "Kalshi"},
            ],
            "statuses": [
                {"id": "active", "label": "Active"},
                {"id": "resolved", "label": "Resolved"},
                {"id": "all", "label": "All"},
            ],
            "sorts": [
                {"id": "volume24h", "label": "24h Volume"},
                {"id": "volumeTotal", "label": "Total Volume"},
                {"id": "probability", "label": "Probability"},
                {"id": "endDate", "label": "End Date"},
                {"id": "liquidity", "label": "Liquidity"},
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