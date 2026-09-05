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
import math
import os
import re
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

USER_AGENT = "btc-dashboard/1.0 (+prediction-markets)"
CACHE_TTL = 60  # align with 60s client refresh
PM_HTTP_TIMEOUT = 8  # keep PM/Kalshi snappy (VPN latency still OK)
PM_SEARCH_WORKERS = 10
_cache: dict[str, tuple[float, dict]] = {}

POLYMARKET_GAMMA = "https://gamma-api.polymarket.com"
KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2"
DERIBIT_API = "https://www.deribit.com/api/v2/public"

# Italian ADM gambling block (DNS hijack → sito-inibito-giochi.adm.gov.it)
ADM_BLOCK_MARKERS = (
    "sito-inibito-giochi",
    "sito-inibito",
    "adm.gov.it",
    "agenzia delle dogane",
    "inibito-giochi",
)
ADM_BLOCK_PAGE = "https://sito-inibito-giochi.adm.gov.it/"
PM_LIVE_HOSTS = (
    ("polymarket", "gamma-api.polymarket.com"),
    ("kalshi", "api.elections.kalshi.com"),
)

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


def _looks_like_adm_block(text: str | None) -> bool:
    if not text:
        return False
    low = text.lower()
    return any(m in low for m in ADM_BLOCK_MARKERS)


def _peer_cert_blob(host: str, port: int = 443, timeout: float = 3.0) -> bytes:
    """Raw DER certificate bytes presented by host (TLS verify disabled)."""
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with socket.create_connection((host, port), timeout=timeout) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as ssock:
            return ssock.getpeercert(binary_form=True) or b""


def _der_looks_like_adm(der: bytes) -> bool:
    """CN is not visible in PEM base64 — search the DER for ADM host markers."""
    if not der:
        return False
    low = der.lower()
    return any(m.encode("ascii") in low for m in ADM_BLOCK_MARKERS)


def _detect_adm_gambling_block(*, force: bool = False) -> dict | None:
    """Detect Italian ADM block of Polymarket/Kalshi (sito-inibito-giochi.adm.gov.it).

    Fast path: only TLS cert DER check per host (~seconds total). Skip long body probes.
    """
    cache_key = "adm-block-probe:v1"
    if not force:
        cached = _cache_get(cache_key, refresh=False)
        if cached is not None:
            return cached if cached.get("blocked") else None

    affected: list[str] = []
    evidence: list[str] = []
    resolved_ips: dict[str, str] = {}

    def _probe_one(label: str, host: str) -> tuple[str, str | None, str | None, str | None]:
        """Return (label, ip, evidence_if_blocked, error)."""
        try:
            ip = socket.gethostbyname(host)
        except OSError as exc:
            return label, None, None, f"{host}: DNS failed ({exc})"
        try:
            der = _peer_cert_blob(host, timeout=3.0)
            if _der_looks_like_adm(der):
                return (
                    label,
                    ip,
                    f"{host} ({ip}) presents TLS cert for sito-inibito-giochi.adm.gov.it "
                    f"— not the real {label} API (Italian ADM gambling block)",
                    None,
                )
            return label, ip, None, None
        except Exception as exc:
            err = str(exc)
            if "Hostname mismatch" in err or "CERTIFICATE_VERIFY_FAILED" in err:
                # Fall through: try one more read of cert without relying on verify
                try:
                    der = _peer_cert_blob(host, timeout=2.5)
                    if _der_looks_like_adm(der):
                        return (
                            label,
                            ip,
                            f"{host}: SSL mismatch + ADM cert → sito-inibito-giochi.adm.gov.it",
                            None,
                        )
                except Exception:
                    pass
            return label, ip, None, f"{host}: TLS probe error ({exc})"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futs = [pool.submit(_probe_one, label, host) for label, host in PM_LIVE_HOSTS]
        for fut in as_completed(futs):
            label, ip, blocked_ev, err = fut.result()
            if ip:
                host = next(h for l, h in PM_LIVE_HOSTS if l == label)
                resolved_ips[host] = ip
            if blocked_ev:
                affected.append(label)
                evidence.append(blocked_ev)
            elif err:
                evidence.append(err)

    if not affected:
        _cache_set(cache_key, {"blocked": False, "checkedAt": _now_iso()})
        return None

    payload = {
        "blocked": True,
        "blockHost": "sito-inibito-giochi.adm.gov.it",
        "blockPage": ADM_BLOCK_PAGE,
        "affected": affected,
        "resolvedIps": resolved_ips,
        "evidence": evidence[:8],
        "checkedAt": _now_iso(),
        "title": "Italian ADM gambling block",
        "message": (
            "Polymarket and/or Kalshi are being censored on this network: DNS/TLS is "
            "hijacked to the Italian government block page "
            "sito-inibito-giochi.adm.gov.it (Agenzia delle Dogane e dei Monopoli)."
        ),
        "suggestion": (
            "Turn on a VPN (exit outside Italy), then hard-refresh this page. "
            "Live odds, cross-venue locks, and PM↔Deribit arb need those APIs."
        ),
        "rant": (
            "Maledizione alla censura dell’ADM e al governo italiano: instead of "
            "regulating like adults, they DNS-hijack half the internet to a shame "
            "page — as if hiding prediction markets makes risk disappear. Shameful, "
            "paternalistic garbage. Use a VPN and skip the moral theatre."
        ),
    }
    _cache_set(cache_key, payload)
    return payload


def _fetch_json(url: str, timeout: int | None = None) -> object:
    timeout = PM_HTTP_TIMEOUT if timeout is None else timeout
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if _looks_like_adm_block(raw) or _looks_like_adm_block(resp.geturl()):
                raise urllib.error.URLError(
                    f"Italian ADM block (sito-inibito-giochi.adm.gov.it) intercepting {url}"
                )
            return json.loads(raw)
    except ssl.SSLError as exc:
        if "certificate" in str(exc).lower() or "hostname" in str(exc).lower():
            raise urllib.error.URLError(
                f"TLS failure (possible ADM block sito-inibito-giochi.adm.gov.it): {exc}"
            ) from exc
        raise
    except urllib.error.URLError:
        raise


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


def _polymarket_search_query(q: str, relevance_fn) -> list[dict]:
    url = (
        f"{POLYMARKET_GAMMA}/public-search?"
        + urllib.parse.urlencode({"q": q, "limit_per_type": 12, "events_status": "active"})
    )
    try:
        payload = _fetch_json(url, timeout=PM_HTTP_TIMEOUT)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, OSError):
        return []
    if not isinstance(payload, dict):
        return []
    rel = lambda qq, dd, tg=None: relevance_fn(qq, dd)  # noqa: E731
    out: list[dict] = []
    for event in payload.get("events") or []:
        if not event.get("active") or event.get("closed"):
            continue
        out.extend(_parse_polymarket_event(event, relevance_fn=rel))
    return out


def _polymarket_search(queries: list[str], relevance_fn, seen: set[str], results: list[dict]) -> None:
    """Parallel public-search fan-out (VPN-friendly)."""
    if not queries:
        return
    workers = min(PM_SEARCH_WORKERS, len(queries))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = [pool.submit(_polymarket_search_query, q, relevance_fn) for q in queries]
        for fut in as_completed(futs):
            try:
                rows = fut.result() or []
            except Exception:
                continue
            for row in rows:
                rid = row.get("id")
                if rid and rid not in seen:
                    seen.add(rid)
                    results.append(row)


# Fewer broader queries — parallelized (was ~45 sequential × 25s timeouts ≈ 60–90s)
_PM_BTC_QUERIES = [
    "bitcoin",
    "bitcoin price",
    "btc",
    "bitcoin etf",
    "bitcoin all time high",
    "strategic bitcoin reserve",
]
_PM_FIN_QUERIES = [
    "fed rate",
    "fomc",
    "cpi inflation",
    "recession",
    "ecb rate",
    "interest rate",
    "opec oil",
    "gdp",
]
_PM_GEO_QUERIES = [
    "election",
    "ukraine",
    "taiwan",
    "tariff",
    "sanctions",
    "ceasefire",
    "crypto regulation",
]


def _fetch_polymarket_live() -> list[dict]:
    """Single flat parallel pool of search queries + bitcoin tag feed."""
    results: list[dict] = []
    seen: set[str] = set()

    jobs: list[tuple[str, object]] = (
        [(q, _is_btc_section_market) for q in _PM_BTC_QUERIES]
        + [(q, _is_financial_market) for q in _PM_FIN_QUERIES]
        + [(q, _is_geopolitical_market) for q in _PM_GEO_QUERIES]
    )

    def _tag_rows() -> list[dict]:
        tag_url = (
            f"{POLYMARKET_GAMMA}/events?"
            + urllib.parse.urlencode(
                {
                    "tag_slug": "bitcoin",
                    "active": "true",
                    "closed": "false",
                    "limit": 48,
                    "order": "volume24hr",
                }
            )
        )
        out: list[dict] = []
        try:
            events = _fetch_json(tag_url, timeout=PM_HTTP_TIMEOUT)
            if isinstance(events, list):
                for event in events:
                    out.extend(_parse_polymarket_event(event))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, OSError):
            pass
        return out

    workers = min(PM_SEARCH_WORKERS, max(4, len(jobs) + 1))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = [pool.submit(_polymarket_search_query, q, fn) for q, fn in jobs]
        futs.append(pool.submit(_tag_rows))
        for fut in as_completed(futs):
            try:
                rows = fut.result() or []
            except Exception:
                continue
            for row in rows:
                rid = row.get("id")
                if rid and rid not in seen:
                    seen.add(rid)
                    results.append(row)
    return results


def _kalshi_row_from_market(m: dict) -> dict | None:
    q = m.get("title") or m.get("subtitle") or ""
    if not _is_btc_relevant(q, m.get("rules_primary") or ""):
        return None
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
    return _normalize_market(
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


def _fetch_kalshi_live() -> list[dict]:
    results: list[dict] = []
    series = ["KXBTC", "KXBTCD", "KXBTCMAX", "KXBTCMIN"]

    def _series(series_ticker: str) -> list[dict]:
        url = (
            f"{KALSHI_API}/markets?"
            + urllib.parse.urlencode(
                {"limit": 20, "status": "open", "series_ticker": series_ticker}
            )
        )
        try:
            payload = _fetch_json(url, timeout=PM_HTTP_TIMEOUT)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, OSError):
            return []
        out: list[dict] = []
        for m in payload.get("markets") or []:
            row = _kalshi_row_from_market(m)
            if not row and (m.get("title") or m.get("ticker")):
                # Series tickers are already BTC; keep the row even if keyword filter misses.
                row = _normalize_market(
                    mid=f"kalshi-{m.get('ticker')}",
                    question=m.get("title") or m.get("ticker") or "Kalshi BTC",
                    yes_p=_as_float(m.get("yes_ask_dollars") or m.get("last_price_dollars")),
                    no_p=None,
                    volume24h=_as_float(m.get("volume_24h")),
                    volume_total=_as_float(m.get("volume")),
                    end_date=m.get("close_time") or m.get("expiration_time"),
                    platform="kalshi",
                    url=_kalshi_url(m.get("ticker")),
                    description=m.get("rules_primary") or "",
                    liquidity=_as_float(m.get("liquidity_dollars")),
                    active=m.get("status") == "open",
                )
            if row:
                out.append(row)
        return out

    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [pool.submit(_series, s) for s in series]
        for fut in as_completed(futs):
            try:
                results.extend(fut.result() or [])
            except Exception:
                continue
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


# ── Arbitrage engine (fee-aware, locked vs relative-value) ──────────────────
# Only report structures that remain profitable after platform fees + a
# conservative half-spread/slippage buffer. Cross-venue requires near-identical
# events (strike + end date + question similarity).

ARB_MIN_NET_EDGE = 0.012  # 1.2% after fees — pure locked arbs
ARB_MIN_JACCARD = 0.52
ARB_MAX_END_DATE_DAYS = 10  # cross-venue settlement windows must align
ARB_MIN_DERIBIT_GAP = 0.08  # 8pp PM vs Deribit RN digital (relative value)
ARB_DERIBIT_EXPIRY_DAYS = 12  # match PM endDate to nearest Deribit expiry

# Execution costs on mid prices (no live book). Kalshi fee ≈ 0.07·p·(1−p).
# Polymarket spot markets: 0 trading fee; buffer covers bid/ask + gas.
_PLATFORM_SLIPPAGE = {
    "polymarket": 0.008,  # ~0.8¢ per leg
    "kalshi": 0.006,
    "deribit": 0.010,  # options half-spread proxy (BTC premium units → USD frac)
}
_KALSHI_FEE_RATE = 0.07


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


def _primary_strike(question: str) -> int | None:
    strikes = _strike_values(question)
    return max(strikes) if strikes else None


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


def _yes_price(m: dict) -> float | None:
    y = m.get("yesOdds")
    if y is not None:
        return float(y)
    p = m.get("yesProb")
    return float(p) / 100.0 if p is not None else None


def _no_price(m: dict) -> float | None:
    n = m.get("noOdds")
    if n is not None:
        return float(n)
    y = _yes_price(m)
    return (1.0 - y) if y is not None else None


def _leg_all_in_cost(platform: str, mid: float) -> tuple[float, float, float]:
    """All-in cost to buy one $1-settlement contract at mid.

    Returns (all_in, fee, slippage) in dollars (0–1+).
    """
    p = max(0.0, min(1.0, float(mid)))
    plat = (platform or "").lower()
    slip = _PLATFORM_SLIPPAGE.get(plat, 0.01)
    if plat == "kalshi":
        fee = _KALSHI_FEE_RATE * p * (1.0 - p)
    elif plat == "polymarket":
        fee = 0.0
    elif plat == "deribit":
        fee = 0.0005  # tiny exchange fee proxy on options premium
    else:
        fee = 0.02 * p
    return p + fee + slip, fee, slip


def _parse_end_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.strptime(str(raw)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _end_dates_compatible(a: dict, b: dict, max_days: int = ARB_MAX_END_DATE_DAYS) -> bool:
    da, db = _parse_end_date(a.get("endDate")), _parse_end_date(b.get("endDate"))
    if not da or not db:
        return False
    return abs((da - db).days) <= max_days


def _is_above_strike_market(question: str) -> bool:
    """True if market is a nested 'BTC above/over/reach K' style binary."""
    q = (question or "").lower()
    if not re.search(r"bitcoin|btc\b", q):
        return False
    if not _primary_strike(question):
        return False
    if re.search(r"\bbelow\b|\bunder\b|\bless than\b|\bdip\b|\bcrash\b", q):
        return False
    return bool(
        re.search(
            r"\babove\b|\bover\b|\breach\b|\bhit\b|\bat least\b|\bexceed\b|\bclose above\b",
            q,
        )
    )


def _arb_market_ref(m: dict, **extra) -> dict:
    ref = {
        "id": m.get("id"),
        "platform": m.get("platform"),
        "question": m.get("question"),
        "yesProb": m.get("yesProb"),
        "noProb": m.get("noProb"),
        "yesOdds": _yes_price(m),
        "noOdds": _no_price(m),
        "url": m.get("url"),
        "endDate": m.get("endDate"),
        "volume24h": m.get("volume24h"),
        "liquidity": m.get("liquidity"),
        "eventTitle": m.get("eventTitle"),
    }
    ref.update(extra)
    return ref


def _leg_detail(
    *,
    side: str,
    platform: str,
    mid: float,
    all_in: float,
    fee: float = 0.0,
    slip: float = 0.0,
    label: str | None = None,
    strike: int | float | None = None,
    instrument: str | None = None,
    role: str | None = None,
) -> dict:
    return {
        "side": side,
        "platform": platform,
        "mid": round(float(mid), 4) if mid is not None else None,
        "allIn": round(float(all_in), 4) if all_in is not None else None,
        "fee": round(float(fee), 4),
        "slip": round(float(slip), 4),
        "label": label or side.replace("_", " ").title(),
        "strike": strike,
        "instrument": instrument,
        "role": role,
    }


# Deribit inverse Bitcoin options: minimum order size is 0.1 BTC of contracts.
# Confirm on Deribit for the product you trade (inverse BTC vs USDC linear can differ).
DERIBIT_MIN_OPTION_BTC = 0.1


def _arb_economics(
    *,
    all_in: float,
    mid_sum: float,
    fees: float,
    net: float,
    locked: bool,
    example_notional: float = 1000.0,
) -> dict:
    """Cash economics for UI: per-$1 face + $1k worked example."""
    all_in = max(float(all_in), 1e-9)
    roi = (net / all_in) * 100.0
    payout = 1.0 if locked else None
    return {
        "allInCost": round(all_in, 4),
        "midSum": round(mid_sum, 4),
        "feesSlip": round(fees, 4),
        "netEdge": round(net, 4),
        "payout": payout,
        "roiOnCapitalPct": round(roi, 1),
        "exampleNotional": example_notional,
        "exampleCapital": round(all_in * example_notional, 2),
        "exampleProfit": round(net * example_notional, 2) if locked else None,
        "examplePayout": round(example_notional, 2) if locked else None,
        # Stack for bar chart: mids → fees → edge residual to $1
        "costStack": {
            "midsPct": round(mid_sum * 100, 2),
            "feesPct": round(fees * 100, 2),
            "edgePct": round(max(net, 0) * 100, 2),
            "allInPct": round(all_in * 100, 2),
            "payoutPct": 100.0 if locked else None,
        },
    }


def _liquidity_cap_usd(markets: list[dict] | None) -> float | None:
    """Rough max face from reported liquidity on linked markets."""
    if not markets:
        return None
    caps: list[float] = []
    for m in markets:
        for key in ("liquidity", "volume24h"):
            v = m.get(key)
            if v is not None:
                try:
                    fv = float(v)
                except (TypeError, ValueError):
                    continue
                if fv > 0:
                    caps.append(fv)
    if not caps:
        return None
    # Don't size above the thinnest liquidity proxy
    return max(100.0, min(caps))


def _sizing_locked_pm(
    *,
    all_in: float,
    net: float,
    markets: list[dict] | None = None,
) -> dict:
    """Size locked prediction-market structures (no Deribit minimum)."""
    all_in = max(float(all_in), 1e-9)
    net = float(net)
    liq_cap = _liquidity_cap_usd(markets)
    faces = [500.0, 1000.0, 2500.0, 5000.0]
    if liq_cap is not None:
        faces = [f for f in faces if f <= liq_cap * 0.25] or [min(500.0, liq_cap * 0.1)]
    rows = []
    for face in faces:
        rows.append(
            {
                "label": f"${face:,.0f} face",
                "faceUsd": face,
                "capitalUsd": round(all_in * face, 2),
                "edgeUsd": round(net * face, 2),
                "note": "Locked profit if rules match and both legs fill at modelled all-in.",
            }
        )
    return {
        "mode": "prediction_market_only",
        "title": "Trade size guide",
        "subtitle": "No Deribit leg — size to books and capital lock-up, not options minimums.",
        "minDeribitBtc": None,
        "rows": rows,
        "steps": [
            {
                "venue": "prediction market",
                "action": "Buy both legs of the locked structure",
                "size": f"Choose a face from the table (start small if liquidity is thin)",
                "capitalUsd": rows[0]["capitalUsd"] if rows else None,
                "note": (
                    f"All-in capital ≈ {all_in * 100:.1f}¢ per $1 face. "
                    + (
                        f"Liquidity/volume proxy suggests staying under ~${liq_cap:,.0f} face."
                        if liq_cap
                        else "Check live depth before size."
                    )
                ),
            }
        ],
        "totalCapitalUsd": rows[0]["capitalUsd"] if rows else None,
        "estimatedEdgeUsd": rows[0]["edgeUsd"] if rows else None,
        "rules": [
            "Prediction-market size is free of Deribit’s 0.1 BTC minimum (no options leg).",
            "Size to the thinner book so both Yes and No (or both venues) can fill.",
            "Capital stays locked until resolution — treat edge as return over the full holding period.",
            "If you later hedge with Deribit, re-size using the Deribit minimum (0.1 BTC) guide.",
        ],
    }


def _sizing_deribit_rv(
    *,
    index: float,
    direction: str,
    pm_all_in: float,
    net_edge: float,
    d_ref: float,
    call_mark_btc: float | None = None,
    pm_side: str = "Yes",
    instrument: str | None = None,
) -> dict:
    """Size prediction-market + Deribit relative-value around the 0.1 BTC options minimum.

    Desk rule of thumb: set prediction-market $ face ≈ 0.1 × Bitcoin index so the
    cash digital unit matches the underlying notional of the smallest Deribit order.
    """
    min_btc = DERIBIT_MIN_OPTION_BTC
    index = max(float(index or 0), 1.0)
    pm_all_in = max(float(pm_all_in), 1e-9)
    net_edge = float(net_edge)
    d_ref = max(0.0, min(1.0, float(d_ref or 0)))
    mark = float(call_mark_btc) if call_mark_btc is not None else None

    min_underlying_usd = min_btc * index
    # 1:1 match: $1 prediction-market face ↔ $1 of digital-style notional
    pm_face = min_underlying_usd
    pm_capital = pm_all_in * pm_face

    if mark is not None and mark > 0:
        premium_btc = min_btc * mark
        premium_usd = premium_btc * index
    else:
        # Fallback: treat digital mid as rough premium fraction of underlying notional
        premium_usd = d_ref * min_underlying_usd * 0.35
        premium_btc = premium_usd / index

    if direction == "long_pm":
        # Long prediction market, short digital-style options
        deribit_action = (
            f"Short digital-style exposure on Deribit "
            f"({instrument or 'matched call / call-spread'})"
        )
        # Short premium received; still need margin — conservative fraction of notional
        options_capital = max(premium_usd * 0.3, min_underlying_usd * 0.08)
        options_note = (
            f"Minimum size {min_btc} BTC. Short options: capital is mostly margin "
            f"(estimate ~${options_capital:,.0f}); premium received ≈ "
            f"{premium_btc:.4f} BTC (~${premium_usd:,.0f}) if using mark."
        )
    else:
        deribit_action = (
            f"Buy digital-style exposure on Deribit "
            f"({instrument or 'matched call / call-spread'})"
        )
        options_capital = premium_usd
        options_note = (
            f"Minimum size {min_btc} BTC. Long options: capital ≈ premium paid "
            f"({premium_btc:.4f} BTC ≈ ${premium_usd:,.0f} at index)."
        )

    edge_usd = net_edge * pm_face
    total_cap = pm_capital + options_capital

    multiples = []
    for mult, label in ((1, "Minimum (1×)"), (2, "2× minimum"), (5, "5× minimum"), (10, "10× minimum")):
        btc = min_btc * mult
        face = btc * index
        multiples.append(
            {
                "label": label,
                "deribitBtc": round(btc, 2),
                "pmFaceUsd": round(face, 2),
                "pmCapitalUsd": round(pm_all_in * face, 2),
                "optionsCapitalUsd": round(options_capital * mult, 2),
                "totalCapitalUsd": round((pm_all_in * face) + options_capital * mult, 2),
                "illustrativeEdgeUsd": round(net_edge * face, 2),
            }
        )

    return {
        "mode": "deribit_min_match",
        "title": "Trade size guide (Deribit minimum)",
        "subtitle": (
            f"Deribit inverse Bitcoin options minimum is {min_btc} BTC. "
            f"At index ${index:,.0f}, that is about ${min_underlying_usd:,.0f} underlying notional — "
            f"we match prediction-market face to that dollar amount."
        ),
        "minDeribitBtc": min_btc,
        "btcIndexUsd": round(index, 2),
        "minUnderlyingUsd": round(min_underlying_usd, 2),
        "pmFaceUsd": round(pm_face, 2),
        "callMarkBtc": round(mark, 5) if mark is not None else None,
        "rows": multiples,
        "steps": [
            {
                "venue": "prediction market",
                "action": f"Buy prediction-market {pm_side}",
                "size": (
                    f"${pm_face:,.0f} face "
                    f"(≈ {pm_face:,.0f} contracts if each pays $1)"
                ),
                "capitalUsd": round(pm_capital, 2),
                "note": (
                    f"All-in ≈ {pm_all_in * 100:.1f}¢ per $1 face → "
                    f"~${pm_capital:,.0f} capital at the Deribit-matched size."
                ),
            },
            {
                "venue": "deribit",
                "action": deribit_action,
                "size": f"{min_btc} BTC (exchange minimum order size)",
                "capitalUsd": round(options_capital, 2),
                "note": options_note,
            },
        ],
        "totalCapitalUsd": round(total_cap, 2),
        "estimatedEdgeUsd": round(edge_usd, 2),
        "edgeNote": (
            "Illustrative model gap × prediction-market face only — not locked profit. "
            "Options residual (volatility, skew, basis) can dominate."
        ),
        "rules": [
            f"Deribit inverse Bitcoin options: minimum order size {min_btc} BTC "
            "(confirm on Deribit for your product — USDC linear options may differ).",
            f"At Bitcoin index ${index:,.0f}, {min_btc} BTC ≈ ${min_underlying_usd:,.0f} underlying notional.",
            "Scale prediction-market $ face to that notional so a $1 digital matches ~$1 of options notional.",
            "Do not size the prediction market to a few hundred dollars and “ignore” Deribit — "
            f"you cannot hedge with less than {min_btc} BTC on Deribit.",
            "Larger size: only use whole multiples of 0.1 BTC on Deribit (0.2, 0.3, …) and scale the prediction market with the same multiple.",
            "Margin for short options is venue-specific — the capital column is a rough estimate, not Deribit portfolio margin.",
        ],
    }


_ARB_TYPE_META = {
    "sum-discount": {
        "shortLabel": "Yes + No lock",
        "plainEnglish": (
            "On one market, buying both Yes and No costs less than $1 after fees. "
            "When the market resolves, exactly one side pays $1 — so you lock a profit "
            "equal to $1 minus what you paid."
        ),
        "deskNotes": (
            "Classic binary completeness arbitrage. "
            "Net edge ≈ $1 − (Yes mid price + No mid price + trading fees + slippage buffer). "
            "This scan uses mid prices, not the live bid/ask book — real edge is often smaller. "
            "Kalshi fee model ≈ 7% × price × (1 − price) per contract; Polymarket often has "
            "zero trading fee, so the slippage buffer is the main cost haircut."
        ),
        "risks": [
            "Bid–ask spread wider than the assumed slippage buffer — edge disappears on market orders",
            "Partial fill: you only get one side and stay directional",
            "Venue outage, resolution dispute, or rule change",
        ],
        "checklist": [
            "Confirm Yes and No are both available at your limit prices",
            "Size to the thinner of the two books",
            "Account for capital locked until resolution",
        ],
    },
    "cross-platform": {
        "shortLabel": "Cross-venue lock",
        "plainEnglish": (
            "The same (or nearly the same) event is cheaper to buy Yes on one venue "
            "and No on another. If both markets really settle the same way, you again "
            "pay less than $1 total and collect $1 from one side."
        ),
        "deskNotes": (
            "Cross-venue completeness: long Yes on the cheap venue + long No on the rich venue. "
            "Math is simple; the hard part is event match quality (strike, end date, wording, "
            "settlement source). Treat as a true lock only when rulebooks align; otherwise "
            "it is relative value with residual event risk."
        ),
        "risks": [
            "Events look alike but resolve differently (source, timezone, cutoff)",
            "Two venues means two funding rails and fragmented capital",
            "One leg fills, the other price runs away",
        ],
        "checklist": [
            "Read both rulebooks — same price source / oracle?",
            "End dates close; same strike for Bitcoin price markets",
            "Fund both venues before working the trade",
        ],
    },
    "monotonicity": {
        "shortLabel": "Strike ladder lock",
        "plainEnglish": (
            "A higher Bitcoin price target should never be more likely than a lower one "
            "for the same deadline. When the market prices it that way, buy the cheaper "
            "low-strike Yes and the expensive high-strike No to lock at least $1 of payoff."
        ),
        "deskNotes": (
            "Nested outcomes: “spot above high strike” is a subset of “spot above low strike”. "
            "Long Yes (low strike) + long No (high strike) pays at least $1 in every state "
            "if the rules truly nest. Net edge = $1 − all-in cost of both legs. "
            "If price lands between the two strikes, both legs can pay (up to $2) — bonus, not required for the lock."
        ),
        "risks": [
            "Questions not truly nested (all-time high vs daily close, different oracles)",
            "Different end dates or event titles mis-grouped by the scanner",
            "Thin order books on one rung of the ladder",
        ],
        "checklist": [
            "Same platform and same settlement definition",
            "Low strike < high strike, and Yes (high) still richer than Yes (low) after fees",
            "Prefer multi-outcome markets under the same event title",
        ],
    },
    "deribit-basis": {
        "shortLabel": "Prediction market vs Deribit",
        "plainEnglish": (
            "Prediction-market odds disagree with what Deribit options imply for "
            "“Bitcoin above this strike by this expiry.” That can be a trade idea — "
            "but it is not a guaranteed profit, because the two products are different."
        ),
        "deskNotes": (
            "Compare the prediction-market mid price to a Black–Scholes risk-neutral "
            "cash-or-nothing digital probability (standard formula N(d₂) using Deribit mark "
            "implied volatility). When a nearby call spread is liquid, we blend that synthetic "
            "digital too. Any hedge with options leaves residual volatility and skew risk. "
            "This is relative value, not a cash-and-carry lock."
        ),
        "risks": [
            "Model risk (implied volatility, Black–Scholes assumptions, expiry mismatch)",
            "Prediction-market rules differ from Deribit cash settlement",
            "Options bid–ask spread and margin; prediction-market capital locked until resolution",
            "Not a locked arbitrage — profit and loss can go either way",
        ],
        "checklist": [
            "Option expiry close to the prediction-market end date",
            "Strike within about 3% of a listed Deribit strike",
            "Size for options liquidity and volatility regime, not only the printed edge",
        ],
    },
}


def _arb_record(
    *,
    type_: str,
    edge_pct: float,
    gross_pct: float,
    fee_pct: float,
    locked: bool,
    confidence: str,
    title: str,
    summary: str,
    action: str,
    description: str,
    markets: list[dict],
    legs: list[dict] | None = None,
    economics: dict | None = None,
    plain_english: str | None = None,
    desk_notes: str | None = None,
    risks: list[str] | None = None,
    checklist: list[str] | None = None,
    extras: dict | None = None,
) -> dict:
    meta = _ARB_TYPE_META.get(type_, {})
    rec = {
        "type": type_,
        "typeLabel": meta.get("shortLabel") or type_,
        "edgePct": round(edge_pct, 2),
        "grossEdgePct": round(gross_pct, 2),
        "feesPct": round(fee_pct, 2),
        "locked": locked,
        "confidence": confidence,
        "title": title,
        "summary": summary,
        "action": action,
        "description": description,
        "markets": markets,
        "legs": legs or [],
        "plainEnglish": plain_english or meta.get("plainEnglish") or "",
        "deskNotes": desk_notes or meta.get("deskNotes") or "",
        "risks": risks if risks is not None else list(meta.get("risks") or []),
        "checklist": checklist if checklist is not None else list(meta.get("checklist") or []),
        "economics": economics or {},
    }
    if extras:
        rec.update(extras)
    return rec


def _find_sum_discount_arbs(markets: list[dict]) -> list[dict]:
    """Buy Yes + Buy No on the same contract when all-in cost < $1."""
    opps: list[dict] = []
    for m in _active_markets(markets):
        yes_o, no_o = _yes_price(m), _no_price(m)
        if yes_o is None or no_o is None:
            continue
        plat = m.get("platform") or ""
        cost_y, fee_y, slip_y = _leg_all_in_cost(plat, yes_o)
        cost_n, fee_n, slip_n = _leg_all_in_cost(plat, no_o)
        all_in = cost_y + cost_n
        net = 1.0 - all_in
        if net < ARB_MIN_NET_EDGE:
            continue
        gross = 1.0 - (yes_o + no_o)
        fees = fee_y + fee_n + slip_y + slip_n
        econ = _arb_economics(
            all_in=all_in, mid_sum=yes_o + no_o, fees=fees, net=net, locked=True
        )
        opps.append(
            _arb_record(
                type_="sum-discount",
                edge_pct=net * 100,
                gross_pct=gross * 100,
                fee_pct=fees * 100,
                locked=True,
                confidence="high" if net >= 0.03 else "medium",
                title=f"Yes+No locked arb · {net * 100:.1f}% net",
                summary=(
                    f"Mids {yes_o * 100:.1f}¢ + {no_o * 100:.1f}¢ = {(yes_o + no_o) * 100:.1f}¢ · "
                    f"all-in ${all_in:.3f} incl. fees/slip → lock $1"
                ),
                action=(
                    f"Buy Yes + Buy No on {plat.title()} — payout $1 either way; "
                    f"net edge {net * 100:.1f}% after ~{fees * 100:.1f}% fees/slip "
                    f"(~{econ['roiOnCapitalPct']:.0f}% ROI on capital at risk)"
                ),
                description=m["question"],
                markets=[_arb_market_ref(m)],
                legs=[
                    _leg_detail(
                        side="buy_yes",
                        platform=plat,
                        mid=yes_o,
                        all_in=cost_y,
                        fee=fee_y,
                        slip=slip_y,
                        label="Buy Yes",
                        role="Collects $1 if event happens",
                    ),
                    _leg_detail(
                        side="buy_no",
                        platform=plat,
                        mid=no_o,
                        all_in=cost_n,
                        fee=fee_n,
                        slip=slip_n,
                        label="Buy No",
                        role="Collects $1 if event fails",
                    ),
                ],
                economics=econ,
                extras={
                    "sizing": _sizing_locked_pm(
                        all_in=all_in, net=net, markets=[_arb_market_ref(m)]
                    ),
                    "payoffStates": [
                        {"state": "Event Yes", "payoff": 1.0, "note": "Yes leg wins"},
                        {"state": "Event No", "payoff": 1.0, "note": "No leg wins"},
                    ],
                },
            )
        )
    return sorted(opps, key=lambda x: x["edgePct"], reverse=True)


def _events_match_for_cross_arb(a: dict, b: dict) -> tuple[bool, str, float]:
    """Strict match: same strike (if priced), end dates close, high question similarity."""
    tok_a, tok_b = _question_tokens(a["question"]), _question_tokens(b["question"])
    sim = _jaccard(tok_a, tok_b)
    strike_a, strike_b = _strike_values(a["question"]), _strike_values(b["question"])
    btc = bool({"bitcoin", "btc"} & (tok_a | tok_b))

    if strike_a and strike_b:
        # Require overlapping strike — $100k vs $108k is not an arb pair
        if not (strike_a & strike_b):
            return False, "strike mismatch", sim
        if not _end_dates_compatible(a, b):
            return False, "end-date mismatch", sim
        if sim < 0.35 and not btc:
            return False, "weak question match", sim
        return True, "strike+date", max(sim, 0.7 if btc else sim)

    if not _end_dates_compatible(a, b, max_days=7):
        return False, "end-date mismatch", sim
    if sim < ARB_MIN_JACCARD:
        return False, "low similarity", sim
    return True, "text+date", sim


def _find_cross_platform_arbs(markets: list[dict]) -> list[dict]:
    """Buy Yes on cheap venue + Buy No on rich venue when all-in < $1 (identical event)."""
    opps: list[dict] = []
    active = _active_markets(markets)
    poly = [m for m in active if m.get("platform") == "polymarket"]
    kalshi = [m for m in active if m.get("platform") == "kalshi"]
    if not poly or not kalshi:
        return opps

    seen_pairs: set[str] = set()
    for a in poly:
        for b in kalshi:
            ok, reason, sim = _events_match_for_cross_arb(a, b)
            if not ok:
                continue
            ya, yb = _yes_price(a), _yes_price(b)
            if ya is None or yb is None:
                continue
            # Cheap Yes + expensive Yes → buy Yes on cheap, No on expensive
            if ya <= yb:
                low, high = a, b
                yes_mid, no_mid = ya, _no_price(b)
            else:
                low, high = b, a
                yes_mid, no_mid = yb, _no_price(a)
            if no_mid is None:
                continue
            cost_y, fee_y, slip_y = _leg_all_in_cost(low["platform"], yes_mid)
            cost_n, fee_n, slip_n = _leg_all_in_cost(high["platform"], no_mid)
            all_in = cost_y + cost_n
            net = 1.0 - all_in
            if net < ARB_MIN_NET_EDGE:
                continue
            pair_key = "|".join(sorted([a["id"], b["id"]]))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            gross = 1.0 - (yes_mid + no_mid)
            fees = fee_y + fee_n + slip_y + slip_n
            conf = "high" if reason == "strike+date" and sim >= 0.45 else "medium"
            econ = _arb_economics(
                all_in=all_in, mid_sum=yes_mid + no_mid, fees=fees, net=net, locked=True
            )
            opps.append(
                _arb_record(
                    type_="cross-platform",
                    edge_pct=net * 100,
                    gross_pct=gross * 100,
                    fee_pct=fees * 100,
                    locked=True,
                    confidence=conf,
                    title=f"Cross-venue locked · {net * 100:.1f}% net",
                    summary=(
                        f"Buy Yes {low['platform'].title()} @ {yes_mid * 100:.1f}¢ + "
                        f"Buy No {high['platform'].title()} @ {no_mid * 100:.1f}¢ · "
                        f"all-in ${all_in:.3f} (match: {reason}, question similarity {sim:.0%})"
                    ),
                    action=(
                        f"Buy Yes on {low['platform'].title()} ({yes_mid * 100:.0f}¢) · "
                        f"Buy No on {high['platform'].title()} ({no_mid * 100:.0f}¢) — "
                        f"one side pays $1 if rules match; net {net * 100:.1f}% after fees "
                        f"(~{econ['roiOnCapitalPct']:.0f}% on capital)"
                    ),
                    description=low["question"],
                    markets=[_arb_market_ref(low), _arb_market_ref(high)],
                    legs=[
                        _leg_detail(
                            side="buy_yes",
                            platform=low["platform"],
                            mid=yes_mid,
                            all_in=cost_y,
                            fee=fee_y,
                            slip=slip_y,
                            label=f"Buy Yes · {low['platform'].title()}",
                            role="Cheap venue for the event",
                        ),
                        _leg_detail(
                            side="buy_no",
                            platform=high["platform"],
                            mid=no_mid,
                            all_in=cost_n,
                            fee=fee_n,
                            slip=slip_n,
                            label=f"Buy No · {high['platform'].title()}",
                            role="Hedge / rich venue for Yes",
                        ),
                    ],
                    economics=econ,
                    extras={
                        "matchQuality": reason,
                        "similarity": round(sim, 3),
                        "sizing": _sizing_locked_pm(
                            all_in=all_in,
                            net=net,
                            markets=[_arb_market_ref(low), _arb_market_ref(high)],
                        ),
                        "payoffStates": [
                            {"state": "Event Yes", "payoff": 1.0, "note": "Yes venue pays"},
                            {"state": "Event No", "payoff": 1.0, "note": "No venue pays"},
                        ],
                    },
                )
            )
    return sorted(opps, key=lambda x: x["edgePct"], reverse=True)


def _find_monotonicity_arbs(markets: list[dict]) -> list[dict]:
    """Nested BTC ladders: P(S>K_high) ≤ P(S>K_low). Violation → buy low Yes + buy high No."""
    opps: list[dict] = []
    buckets: dict[str, list[dict]] = {}
    for m in _active_markets(markets):
        if not _is_above_strike_market(m.get("question") or ""):
            continue
        strike = _primary_strike(m["question"])
        if strike is None:
            continue
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
            if low_m["_strike"] >= high_m["_strike"]:
                continue
            same_event = (
                low_m.get("eventTitle")
                and low_m.get("eventTitle") == high_m.get("eventTitle")
            )
            if not same_event and _ladder_similarity(low_m["question"], high_m["question"]) < 0.55:
                continue
            if not _end_dates_compatible(low_m, high_m, max_days=21) and not same_event:
                continue
            yes_low = _yes_price(low_m)
            no_high = _no_price(high_m)
            if yes_low is None or no_high is None:
                continue
            # Locked if always ≥$1: nested events pay Yes_low OR No_high (actually both in middle)
            cost_y, fee_y, slip_y = _leg_all_in_cost(low_m["platform"], yes_low)
            cost_n, fee_n, slip_n = _leg_all_in_cost(high_m["platform"], no_high)
            all_in = cost_y + cost_n
            net = 1.0 - all_in
            if net < ARB_MIN_NET_EDGE:
                continue
            # Only a structural arb when the high strike is *richer* (yes_high > yes_low)
            yes_high = _yes_price(high_m) or 0
            if yes_high <= yes_low + 0.005:
                continue
            gross = 1.0 - (yes_low + no_high)
            fees = fee_y + fee_n + slip_y + slip_n
            econ = _arb_economics(
                all_in=all_in, mid_sum=yes_low + no_high, fees=fees, net=net, locked=True
            )
            opps.append(
                _arb_record(
                    type_="monotonicity",
                    edge_pct=net * 100,
                    gross_pct=gross * 100,
                    fee_pct=fees * 100,
                    locked=True,
                    confidence="high" if same_event else "medium",
                    title=f"Strike ladder lock · {net * 100:.1f}% net",
                    summary=(
                        f"${low_m['_strike']:,} Yes {yes_low * 100:.0f}¢ vs "
                        f"${high_m['_strike']:,} Yes {yes_high * 100:.0f}¢ (inverted) · "
                        f"buy low Yes + high No → all-in ${all_in:.3f}"
                    ),
                    action=(
                        f"Buy Yes ${low_m['_strike']:,} ({yes_low * 100:.0f}¢) · "
                        f"Buy No ${high_m['_strike']:,} ({no_high * 100:.0f}¢) on "
                        f"{low_m['platform'].title()} — nested payoff ≥ $1; "
                        f"net {net * 100:.1f}% after fees (~{econ['roiOnCapitalPct']:.0f}% ROI)"
                    ),
                    description=(
                        f"P(BTC > ${high_m['_strike']:,}) priced above "
                        f"P(BTC > ${low_m['_strike']:,}) — structural lock if rules nest."
                    ),
                    markets=[_arb_market_ref(low_m), _arb_market_ref(high_m)],
                    legs=[
                        _leg_detail(
                            side="buy_yes",
                            platform=low_m["platform"],
                            mid=yes_low,
                            all_in=cost_y,
                            fee=fee_y,
                            slip=slip_y,
                            strike=low_m["_strike"],
                            label=f"Buy Yes · ${low_m['_strike']:,.0f}",
                            role="Lower strike (should be more likely)",
                        ),
                        _leg_detail(
                            side="buy_no",
                            platform=high_m["platform"],
                            mid=no_high,
                            all_in=cost_n,
                            fee=fee_n,
                            slip=slip_n,
                            strike=high_m["_strike"],
                            label=f"Buy No · ${high_m['_strike']:,.0f}",
                            role="Higher strike (overpriced Yes)",
                        ),
                    ],
                    economics=econ,
                    extras={
                        "strikes": {
                            "low": low_m["_strike"],
                            "high": high_m["_strike"],
                            "yesLow": round(yes_low * 100, 1),
                            "yesHigh": round(yes_high * 100, 1),
                        },
                        "sizing": _sizing_locked_pm(
                            all_in=all_in,
                            net=net,
                            markets=[_arb_market_ref(low_m), _arb_market_ref(high_m)],
                        ),
                        "payoffStates": [
                            {
                                "state": f"S ≤ ${low_m['_strike']:,.0f}",
                                "payoff": 1.0,
                                "note": "High No wins",
                            },
                            {
                                "state": f"${low_m['_strike']:,.0f} < S ≤ ${high_m['_strike']:,.0f}",
                                "payoff": 2.0,
                                "note": "Both legs can win",
                            },
                            {
                                "state": f"S > ${high_m['_strike']:,.0f}",
                                "payoff": 1.0,
                                "note": "Low Yes wins",
                            },
                        ],
                    },
                )
            )
    return sorted(opps, key=lambda x: x["edgePct"], reverse=True)


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _bs_digital_prob(F: float, K: float, T_years: float, sigma: float) -> float | None:
    """Risk-neutral P(S_T > K) under Black–Scholes (cash-or-nothing digital ≈ N(d2))."""
    if F <= 0 or K <= 0 or T_years <= 0 or sigma <= 0:
        return None
    try:
        d2 = (math.log(F / K) - 0.5 * sigma * sigma * T_years) / (sigma * math.sqrt(T_years))
        return max(0.0, min(1.0, _norm_cdf(d2)))
    except (ValueError, ZeroDivisionError):
        return None


_DERIBIT_MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}


def _parse_deribit_name(name: str) -> tuple[datetime, float, str] | None:
    parts = (name or "").split("-")
    if len(parts) < 4:
        return None
    typ = parts[-1].upper()
    if typ not in ("C", "P"):
        return None
    try:
        strike = float(parts[-2])
    except ValueError:
        return None
    token = parts[1].upper()
    if len(token) < 7:
        return None
    try:
        day = int(token[:2])
        mon = _DERIBIT_MONTHS.get(token[2:5])
        year = int(token[5:])
        if mon is None:
            return None
        if year < 100:
            year += 2000
        return datetime(year, mon, day, 8, 0, 0, tzinfo=timezone.utc), strike, ("call" if typ == "C" else "put")
    except Exception:
        return None


def _fetch_deribit_surface() -> dict | None:
    """Cached Deribit BTC option marks + index for digital probability."""
    cached = _cache_get("deribit-surface:v1", False)
    if cached is not None:
        return cached
    try:
        summary = _fetch_json(
            f"{DERIBIT_API}/get_book_summary_by_currency?currency=BTC&kind=option",
            timeout=12,
        )
        index = _fetch_json(f"{DERIBIT_API}/get_index_price?index_name=btc_usd", timeout=12)
    except Exception:
        return None
    rows = (summary or {}).get("result") or []
    idx = float(((index or {}).get("result") or {}).get("index_price") or 0)
    if not idx:
        for r in rows:
            up = r.get("underlying_price")
            if up:
                idx = float(up)
                break
    if not idx or not rows:
        return None

    # expiry_ms -> strike -> {call/put: {mark, iv, bid, ask, name}}
    by_exp: dict[int, dict[float, dict]] = {}
    for row in rows:
        name = row.get("instrument_name") or ""
        parsed = _parse_deribit_name(name)
        if not parsed:
            continue
        exp_dt, strike, opt = parsed
        exp_ms = int(exp_dt.timestamp() * 1000)
        iv = float(row.get("mark_iv") or 0)
        iv_dec = iv / 100.0 if iv > 3 else iv
        mark = float(row.get("mark_price") or 0)
        cell = by_exp.setdefault(exp_ms, {}).setdefault(strike, {})
        cell[opt] = {
            "name": name,
            "mark": mark,
            "iv": iv_dec,
            "bid": row.get("bid_price"),
            "ask": row.get("ask_price"),
            "underlying": float(row.get("underlying_price") or idx),
        }

    payload = {
        "index": idx,
        "byExpiry": by_exp,
        "fetchedAt": _now_iso(),
    }
    _cache_set("deribit-surface:v1", payload)
    return payload


def _deribit_digital_for_strike(
    surface: dict, strike: float, end_date: datetime | None
) -> dict | None:
    """Nearest-expiry RN digital P(S>K) and optional call-spread synthetic cost."""
    by_exp = surface.get("byExpiry") or {}
    if not by_exp:
        return None
    idx = float(surface.get("index") or 0)
    now = datetime.now(timezone.utc)
    target = end_date or now

    best_exp = None
    best_delta = 10**9
    for exp_ms in by_exp:
        exp_dt = datetime.fromtimestamp(exp_ms / 1000, tz=timezone.utc)
        delta = abs((exp_dt - target).days)
        if delta < best_delta:
            best_delta = delta
            best_exp = exp_ms
    if best_exp is None or best_delta > ARB_DERIBIT_EXPIRY_DAYS:
        return None

    strikes_map = by_exp[best_exp]
    # Nearest listed strike
    nearest_k = min(strikes_map.keys(), key=lambda k: abs(k - strike))
    if abs(nearest_k - strike) / max(strike, 1) > 0.03:
        return None
    call = (strikes_map.get(nearest_k) or {}).get("call")
    if not call:
        return None
    F = float(call.get("underlying") or idx)
    iv = float(call.get("iv") or 0)
    exp_dt = datetime.fromtimestamp(best_exp / 1000, tz=timezone.utc)
    T = max((exp_dt - now).total_seconds() / (365.25 * 24 * 3600), 1 / 365.25)
    digital = _bs_digital_prob(F, nearest_k, T, iv if iv > 0.05 else 0.5)
    if digital is None:
        return None

    # Call-spread synthetic digital (cost in BTC marks / (Δ/F) ≈ probability units)
    sorted_ks = sorted(strikes_map.keys())
    hi_k = next((k for k in sorted_ks if k > nearest_k), None)
    call_spread_cost = None
    synth_digital = None
    if hi_k is not None:
        c_lo = call.get("mark") or 0
        c_hi = ((strikes_map.get(hi_k) or {}).get("call") or {}).get("mark") or 0
        if c_lo and c_hi is not None and hi_k > nearest_k and F > 0:
            # Inverse call-spread max payoff ≈ (hi−lo)/F in BTC terms when deep ITM
            width = hi_k - nearest_k
            max_pay = width / F
            raw_cost = max(0.0, float(c_lo) - float(c_hi))
            if max_pay > 1e-9:
                synth_digital = max(0.0, min(1.5, raw_cost / max_pay))
                call_spread_cost = raw_cost

    return {
        "strike": nearest_k,
        "expiry": exp_dt.strftime("%Y-%m-%d"),
        "dte": max(0, (exp_dt - now).days),
        "index": F,
        "iv": iv,
        "digital": digital,
        "synthDigital": synth_digital,
        "callMark": call.get("mark"),
        "callName": call.get("name"),
        "callSpreadCostBtc": call_spread_cost,
        "expiryDeltaDays": best_delta,
    }


def _find_deribit_arbs(markets: list[dict]) -> list[dict]:
    """PM binary vs Deribit risk-neutral digital (relative value + fee buffer).

    Not a pure locked arb (different venues, settlement, and residual vol risk on
    the options hedge). Flag only large gaps after PM fees + Deribit slippage.
    """
    surface = _fetch_deribit_surface()
    if not surface:
        return []

    candidates: list[dict] = []
    for m in _active_markets(markets):
        mid = str(m.get("id") or "")
        if mid.startswith("mock-"):
            continue
        q = m.get("question") or ""
        if not _is_above_strike_market(q):
            continue
        if _primary_strike(q) is None or _yes_price(m) is None or not m.get("endDate"):
            continue
        candidates.append(m)
    # Cap scan size — full universe is huge after broad Polymarket search
    candidates.sort(key=lambda x: x.get("volume24h") or 0, reverse=True)
    candidates = candidates[:36]

    opps: list[dict] = []
    for m in candidates:
        strike = _primary_strike(m.get("question") or "")
        yes = _yes_price(m)
        end = _parse_end_date(m.get("endDate"))
        if strike is None or yes is None or not end:
            continue
        dinfo = _deribit_digital_for_strike(surface, float(strike), end)
        if not dinfo:
            continue

        # Prefer Black–Scholes digital; blend with call-spread synth when available
        d_bs = float(dinfo["digital"])
        d_syn = dinfo.get("synthDigital")
        d_ref = d_bs
        if d_syn is not None and abs(d_syn - d_bs) < 0.15:
            d_ref = 0.6 * d_bs + 0.4 * float(d_syn)

        # All-in PM buy vs "fair" digital; sell-side uses no-leg approximation
        cost_yes, fee_y, slip_y = _leg_all_in_cost(m.get("platform") or "", yes)
        # Deribit hedge buffer on digital notional
        deribit_buf = _PLATFORM_SLIPPAGE["deribit"] + 0.01  # extra model risk

        # PM cheap vs options: long PM Yes, short digital (sell OTM call / call-spread)
        edge_long_pm = d_ref - cost_yes - deribit_buf
        # PM rich: short PM Yes (buy No), long digital via call-spread
        no_mid = _no_price(m)
        edge_short_pm = None
        if no_mid is not None:
            cost_no, fee_n, slip_n = _leg_all_in_cost(m.get("platform") or "", no_mid)
            edge_short_pm = (1.0 - d_ref) - cost_no - deribit_buf

        best_edge = edge_long_pm
        direction = "long_pm"
        if edge_short_pm is not None and edge_short_pm > best_edge:
            best_edge = edge_short_pm
            direction = "short_pm"

        if best_edge is None or best_edge < ARB_MIN_DERIBIT_GAP:
            continue
        # Require a large raw mid gap so we don't spam noise near the fee buffer
        if abs(d_ref - yes) < ARB_MIN_DERIBIT_GAP:
            continue

        gross_gap = abs(d_ref - yes) * 100
        fees_pct = (fee_y + slip_y + deribit_buf) * 100
        if direction == "long_pm":
            action = (
                f"Buy PM Yes @ {yes * 100:.0f}¢ on {m['platform'].title()} · "
                f"hedge by shorting a digital-style option exposure on Deribit ({dinfo['callName']}) "
                f"(Black–Scholes digital ≈ {d_ref * 100:.0f}% · expiry {dinfo['expiry']}) — "
                f"relative edge ~{best_edge * 100:.1f} percentage points after buffers"
            )
            summary = (
                f"Prediction-market Yes {yes * 100:.0f}% vs Deribit Black–Scholes digital "
                f"{d_ref * 100:.0f}% @ ${dinfo['strike']:,.0f} expiring {dinfo['expiry']} "
                f"(mark implied vol {dinfo['iv'] * 100:.0f}%) — prediction market looks cheap"
            )
        else:
            action = (
                f"Buy prediction-market No @ {(no_mid or 0) * 100:.0f}¢ · "
                f"long Deribit digital (call or call-spread near ${dinfo['strike']:,.0f}) — "
                f"prediction market looks rich vs options by ~{best_edge * 100:.1f} percentage points after buffers"
            )
            summary = (
                f"Prediction-market Yes {yes * 100:.0f}% vs Deribit Black–Scholes digital "
                f"{d_ref * 100:.0f}% @ ${dinfo['strike']:,.0f} — prediction market looks rich"
            )

        conf = "medium" if dinfo["expiryDeltaDays"] <= 5 and dinfo.get("dte", 99) <= 45 else "low"
        # Long-dated digitals are model-sensitive — demote confidence
        if dinfo.get("dte", 0) > 90:
            conf = "low"
        pm_mid = yes if direction == "long_pm" else (no_mid or 0)
        pm_all_in = cost_yes if direction == "long_pm" else cost_no
        fee_pm = fee_y if direction == "long_pm" else fee_n
        slip_pm = slip_y if direction == "long_pm" else slip_n
        # RV economics: capital ≈ PM all-in; “edge” is model gap after buffers
        econ = _arb_economics(
            all_in=pm_all_in + deribit_buf,
            mid_sum=pm_mid,
            fees=fee_pm + slip_pm + deribit_buf,
            net=best_edge,
            locked=False,
        )
        econ["pmProbPct"] = round(yes * 100, 1)
        econ["deribitDigitalPct"] = round(d_ref * 100, 1)
        econ["gapPct"] = round((d_ref - yes) * 100, 1)
        econ["direction"] = direction
        call_mark = dinfo.get("callMark")
        try:
            call_mark_f = float(call_mark) if call_mark is not None else None
        except (TypeError, ValueError):
            call_mark_f = None
        econ["deribit"] = {
            "strike": dinfo.get("strike"),
            "expiry": dinfo.get("expiry"),
            "dte": dinfo.get("dte"),
            "ivPct": round(float(dinfo.get("iv") or 0) * 100, 1),
            "callName": dinfo.get("callName"),
            "callMarkBtc": round(call_mark_f, 5) if call_mark_f is not None else None,
            "index": dinfo.get("index"),
            "expiryDeltaDays": dinfo.get("expiryDeltaDays"),
            "synthDigitalPct": (
                round(float(d_syn) * 100, 1) if d_syn is not None else None
            ),
            "minOrderBtc": DERIBIT_MIN_OPTION_BTC,
        }
        # Comparison bars for chart (percent probability units)
        econ["costStack"] = {
            "midsPct": round(yes * 100, 2),
            "feesPct": round((fee_pm + slip_pm + deribit_buf) * 100, 2),
            "edgePct": round(best_edge * 100, 2),
            "allInPct": round((pm_all_in + deribit_buf) * 100, 2),
            "payoutPct": None,
            "pmPct": round(yes * 100, 2),
            "deribitPct": round(d_ref * 100, 2),
        }
        sizing = _sizing_deribit_rv(
            index=float(dinfo.get("index") or 0),
            direction=direction,
            pm_all_in=pm_all_in,
            net_edge=best_edge,
            d_ref=d_ref,
            call_mark_btc=call_mark_f,
            pm_side="Yes" if direction == "long_pm" else "No",
            instrument=dinfo.get("callName"),
        )
        # Prefer $1k-style metric to min-size capital for the hero grid
        if sizing.get("totalCapitalUsd") is not None:
            econ["exampleCapital"] = sizing["totalCapitalUsd"]
            econ["exampleProfit"] = sizing.get("estimatedEdgeUsd")
            econ["exampleNotional"] = sizing.get("pmFaceUsd")
        opps.append(
            _arb_record(
                type_="deribit-basis",
                edge_pct=best_edge * 100,
                gross_pct=gross_gap,
                fee_pct=fees_pct,
                locked=False,
                confidence=conf,
                title=f"Prediction market vs Deribit · {best_edge * 100:.1f}pp net gap",
                summary=summary,
                action=action,
                description=(
                    "Relative value versus Deribit Black–Scholes digital probability — "
                    "not a locked cash arbitrage. Settlement rules and options risk remain."
                ),
                markets=[
                    _arb_market_ref(m),
                    {
                        "id": dinfo.get("callName"),
                        "platform": "deribit",
                        "question": (
                            f"Deribit Bitcoin {dinfo['strike']:,.0f} call · "
                            f"expiry {dinfo['expiry']} · Black–Scholes digital "
                            f"{d_ref * 100:.1f}%"
                        ),
                        "yesProb": round(d_ref * 100, 1),
                        "noProb": round((1 - d_ref) * 100, 1),
                        "url": "https://www.deribit.com/options/BTC",
                        "endDate": dinfo["expiry"],
                    },
                ],
                legs=[
                    _leg_detail(
                        side="buy_yes" if direction == "long_pm" else "buy_no",
                        platform=m.get("platform") or "",
                        mid=pm_mid,
                        all_in=pm_all_in,
                        fee=fee_pm,
                        slip=slip_pm,
                        label=(
                            f"Buy prediction-market {'Yes' if direction == 'long_pm' else 'No'} · "
                            f"{(m.get('platform') or '').title()}"
                        ),
                        role="Prediction-market leg",
                    ),
                    _leg_detail(
                        side="short_digital" if direction == "long_pm" else "long_digital",
                        platform="deribit",
                        mid=d_ref,
                        all_in=d_ref + deribit_buf,
                        fee=0.0005,
                        slip=deribit_buf,
                        label=(
                            f"{'Short' if direction == 'long_pm' else 'Long'} Deribit digital exposure"
                        ),
                        instrument=dinfo.get("callName"),
                        strike=dinfo.get("strike"),
                        role=(
                            f"Black–Scholes digital ≈ {d_ref * 100:.0f}% · "
                            f"mark implied vol {float(dinfo.get('iv') or 0) * 100:.0f}% · "
                            f"min size {DERIBIT_MIN_OPTION_BTC} BTC"
                        ),
                    ),
                ],
                economics=econ,
                extras={
                    "direction": direction,
                    "sizing": sizing,
                    "payoffStates": [
                        {
                            "state": "Illustrative only",
                            "payoff": None,
                            "note": "Not a locked $1 structure — model residual remains",
                        }
                    ],
                },
            )
        )

    return sorted(opps, key=lambda x: x["edgePct"], reverse=True)[:8]


def _deribit_scan_status(markets: list[dict]) -> dict:
    """Explain why PM↔Deribit may be empty (live feed vs surface vs filters)."""
    active = _active_markets(markets)
    live_above = [
        m
        for m in active
        if not str(m.get("id") or "").startswith("mock-")
        and _is_above_strike_market(m.get("question") or "")
        and m.get("endDate")
    ]
    surface = None
    try:
        surface = _fetch_deribit_surface()
    except Exception:
        surface = None
    matched = 0
    if surface and live_above:
        for m in live_above:
            strike = _primary_strike(m.get("question") or "")
            if strike is None:
                continue
            if _deribit_digital_for_strike(surface, float(strike), _parse_end_date(m.get("endDate"))):
                matched += 1
    if not live_above:
        status = "no_live_pm"
        detail = (
            "No live Polymarket/Kalshi BTC “above strike” markets in the feed "
            "(APIs blocked, empty, or still on seed mock). Deribit is not compared to mock prices."
        )
    elif not surface:
        status = "deribit_down"
        detail = "Deribit option surface unavailable — PM↔Deribit scan skipped."
    elif matched == 0:
        status = "no_expiry_match"
        detail = (
            f"{len(live_above)} live BTC price markets, but none match a Deribit expiry "
            f"within ±{ARB_DERIBIT_EXPIRY_DAYS}d and strike within 3%."
        )
    else:
        status = "scanned"
        detail = (
            f"Compared {matched} live prediction-market contract(s) to Deribit "
            f"Black–Scholes digitals (gap threshold {ARB_MIN_DERIBIT_GAP * 100:.0f} percentage points after buffers)."
        )
    return {
        "status": status,
        "detail": detail,
        "liveCandidates": len(live_above),
        "deribitMatched": matched,
        "deribitIndex": (surface or {}).get("index"),
        "deribitOk": bool(surface),
    }


def _find_arbitrage_opportunities(markets: list[dict]) -> list[dict]:
    combined: list[dict] = []
    combined.extend(_find_sum_discount_arbs(markets))
    combined.extend(_find_cross_platform_arbs(markets))
    combined.extend(_find_monotonicity_arbs(markets))
    try:
        combined.extend(_find_deribit_arbs(markets))
    except Exception:
        pass
    # Locked pure arbs first, then by net edge
    combined.sort(
        key=lambda x: (1 if x.get("locked") else 0, x.get("edgePct") or 0),
        reverse=True,
    )
    return combined[:15]


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
    deribit_scan = _deribit_scan_status(markets)
    signals = _topic_sentiment(markets)

    locked_arbs = [a for a in arbitrage if a.get("locked")]
    max_edge = max((a["edgePct"] for a in arbitrage), default=0)
    deri_arbs = [a for a in arbitrage if a.get("type") == "deribit-basis"]

    headline = "Prediction markets — outlook & arb scan"
    if locked_arbs:
        headline = (
            f"{len(locked_arbs)} locked arb{'s' if len(locked_arbs) != 1 else ''} · "
            f"max net {max((a['edgePct'] for a in locked_arbs), default=0):.1f}%"
        )
        if deri_arbs:
            headline += f" · {len(deri_arbs)} Deribit RV"
    elif deri_arbs:
        headline = f"{len(deri_arbs)} PM↔Deribit gap{'s' if len(deri_arbs) != 1 else ''} · max {max_edge:.1f}pp (not locked)"
    elif deribit_scan.get("status") == "no_live_pm":
        headline = "PM↔Deribit idle · live prediction feed unavailable"
    elif above_100:
        headline = f"BTC > $100k implied: {above_100['yesProb']:.0f}% · fee-aware arb scan clear"
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
        "deribitScan": deribit_scan,
        "lines": _outlook_commentary(
            markets, above_100, avg_yes, arbitrage, signals, lead_macro, deribit_scan
        ),
    }


def _outlook_commentary(
    markets, above_100, avg_yes, arbitrage, signals, lead_macro, deribit_scan=None
) -> list[str]:
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
        locked = [a for a in arbitrage if a.get("locked")]
        cross = [a for a in arbitrage if a["type"] == "cross-platform"]
        sum_d = [a for a in arbitrage if a["type"] == "sum-discount"]
        mono = [a for a in arbitrage if a["type"] == "monotonicity"]
        deri = [a for a in arbitrage if a["type"] == "deribit-basis"]
        parts = []
        if cross:
            parts.append(f"{len(cross)} cross-venue")
        if sum_d:
            parts.append(f"{len(sum_d)} sum-discount")
        if mono:
            parts.append(f"{len(mono)} strike-ladder")
        if deri:
            parts.append(f"{len(deri)} PM↔Deribit")
        kind = "locked arb" if locked else "relative-value gap"
        lines.append(
            f"Arb scan: {', '.join(parts)} {kind}{'s' if len(arbitrage) != 1 else ''} — "
            "net edges are after platform fees + slippage buffers; "
            "only locked structures guarantee ≥$1 if rules match."
        )
        best = arbitrage[0]
        lock_tag = "locked" if best.get("locked") else "RV"
        fee_bit = ""
        if best.get("feesPct") is not None:
            fee_bit = f", fees ~{float(best.get('feesPct') or 0):.1f}%"
        lines.append(
            f"Top ({best['edgePct']:.1f}% net, {lock_tag}{fee_bit}): {best['action']}"
        )
    else:
        lines.append(
            "Arb scan: no fee-adjusted locked arbs (Yes+No / cross-venue / ladder) in the current universe."
        )

    ds = deribit_scan or {}
    if ds.get("detail"):
        idx = ds.get("deribitIndex")
        idx_txt = f" Deribit index ~${idx:,.0f}." if idx else ""
        lines.append(f"PM↔Deribit: {ds['detail']}{idx_txt}")

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
    network_block: dict | None = None

    if mock_only:
        markets = _mock_markets()
    else:
        live: list[dict] = []
        # Fast ADM probe first — skip ~minute of dead searches when blocked
        try:
            network_block = _detect_adm_gambling_block(force=refresh)
        except Exception:
            network_block = None

        if network_block and network_block.get("blocked"):
            errors.append(
                "adm-block: sito-inibito-giochi.adm.gov.it is censoring "
                f"{', '.join(network_block.get('affected') or ['prediction markets'])}"
            )
        else:
            # Parallel live fetches (Polymarket search fan-out is already parallel)
            def _poly() -> list[dict]:
                return _fetch_polymarket_live()

            def _kal() -> list[dict]:
                return _fetch_kalshi_live()

            with ThreadPoolExecutor(max_workers=2) as pool:
                f_poly = pool.submit(_poly)
                f_kal = pool.submit(_kal)
                try:
                    live.extend(f_poly.result() or [])
                except Exception as exc:
                    errors.append(f"polymarket: {exc}")
                try:
                    live.extend(f_kal.result() or [])
                except Exception as exc:
                    errors.append(f"kalshi: {exc}")

            # If live still empty, re-check ADM (VPN flaky / partial)
            if not live:
                try:
                    network_block = _detect_adm_gambling_block(force=True)
                except Exception:
                    pass
                if network_block and network_block.get("blocked"):
                    errors.append(
                        "adm-block: sito-inibito-giochi.adm.gov.it is censoring "
                        f"{', '.join(network_block.get('affected') or ['prediction markets'])}"
                    )

        mock = _mock_markets()
        markets = _enrich_markets(_merge_live_with_mock(live, mock))
        if not any(m.get("platform") == "kalshi" for m in markets):
            markets = _enrich_markets(
                list(markets) + [m for m in mock if m.get("platform") == "kalshi"]
            )
        source = "live" if live else "mock"
        if live and len(live) < len(mock):
            source = "live+mock"
        if network_block and network_block.get("blocked") and not live:
            source = "mock+adm-block"

    outlook = _build_outlook(markets)
    if network_block and network_block.get("blocked"):
        outlook = dict(outlook)
        outlook["networkBlock"] = network_block
        block_lines = [
            f"⚠ Censorship: {network_block.get('message')}",
            f"Block page: {network_block.get('blockHost')} — {network_block.get('blockPage')}",
            f"Fix: {network_block.get('suggestion')}",
            network_block.get("rant") or "",
        ]
        outlook["lines"] = [ln for ln in block_lines if ln] + list(outlook.get("lines") or [])
        if source.startswith("mock"):
            outlook["headline"] = "Blocked by Italian ADM · sito-inibito-giochi.adm.gov.it"
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
    # Light section meta only — full arb/Deribit scan runs once on main outlook
    # (frontend does not consume sectionData outlooks; avoid 2× slow path).
    section_payload = {
        sid: {
            "heroes": _section_heroes(markets, sid),
            "outlook": {
                "headline": sections_meta[sid]["label"],
                "lines": [sections_meta[sid]["description"]],
                "activeMarkets": len([m for m in markets if m.get("section") == sid]),
            },
        }
        for sid in sections_meta
    }
    payload = {
        "updatedAt": _now_iso(),
        "source": source,
        "mockOnly": mock_only,
        "errors": errors,
        "networkBlock": network_block,
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