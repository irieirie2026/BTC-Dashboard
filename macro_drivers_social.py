"""BTC Social metrics via LunarCrush API v4 (Individual / free tier).

Endpoints used (2 calls per refresh, Bitcoin only):
  1. GET https://lunarcrush.com/api4/public/coins/bitcoin/v1
     — Galaxy Score, AltRank, sentiment, social volume, dominance, 24h deltas
  2. GET https://lunarcrush.com/api4/public/coins/bitcoin/time-series/v1?interval=1w
     — 7-day social volume / sentiment for momentum sparkline

Optional fallback for influencers if coin payload lacks creators:
  GET https://lunarcrush.com/api4/public/topic/bitcoin/creators/v1

Env:
  LUNARCRUSH_API_KEY — Bearer token from https://lunarcrush.com/developers/api/authentication

Query:
  GET /api/social/btc?refresh=1
  GET /api/social/btc?mock=1
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

USER_AGENT = "btc-dashboard/1.0 (+social-lunarcrush)"
LUNARCRUSH_BASE = "https://lunarcrush.com/api4/public"
CACHE_TTL = 600  # 10 minutes — conservative for ~2k calls/day free tier

_cache: dict[str, tuple[float, dict]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _api_key() -> str | None:
    key = (os.environ.get("LUNARCRUSH_API_KEY") or "").strip()
    return key or None


def _fetch_json(path: str, *, params: dict | None = None, timeout: int = 25) -> object:
    api_key = _api_key()
    if not api_key:
        raise RuntimeError("LUNARCRUSH_API_KEY not configured")

    q = urllib.parse.urlencode(params or {})
    url = f"{LUNARCRUSH_BASE}/{path.lstrip('/')}"
    if q:
        url = f"{url}?{q}"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
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


def _pick(obj: dict, *keys, default=None):
    for k in keys:
        if k in obj and obj[k] is not None:
            return obj[k]
    return default


def _unwrap_coin(payload: object) -> dict:
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict):
            return data
        if isinstance(data, list) and data:
            first = data[0]
            return first if isinstance(first, dict) else payload
        return payload
    return {}


def _unwrap_list(payload: object) -> list:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "creators", "items", "results"):
            val = payload.get(key)
            if isinstance(val, list):
                return val
    return []


def _unwrap_series(payload: object) -> list[dict]:
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        if isinstance(data, dict):
            series = data.get("timeSeries") or data.get("time_series") or data.get("points")
            if isinstance(series, list):
                return [x for x in series if isinstance(x, dict)]
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    return []


def _pct_change(current, previous) -> float | None:
    c = _as_float(current)
    p = _as_float(previous)
    if c is None or p is None or p == 0:
        return None
    return ((c - p) / abs(p)) * 100.0


def _fmt_compact(n: float | None) -> str:
    if n is None:
        return "—"
    v = float(n)
    if v >= 1e9:
        return f"{v / 1e9:.2f}B"
    if v >= 1e6:
        return f"{v / 1e6:.2f}M"
    if v >= 1e3:
        return f"{v / 1e3:.1f}K"
    return f"{v:.0f}"


def _sentiment_split(coin: dict) -> tuple[float | None, float | None, str]:
    """Return bullish %, bearish %, trend arrow."""
    bullish = _as_float(
        _pick(
            coin,
            "sentiment",
            "sentiment_bullish",
            "bullish_percent",
            "percent_sentiment_bullish",
        )
    )
    bearish = _as_float(
        _pick(
            coin,
            "sentiment_bearish",
            "bearish_percent",
            "percent_sentiment_bearish",
        )
    )
    if bullish is not None and bearish is None:
        bearish = max(0.0, 100.0 - bullish)
    if bearish is not None and bullish is None:
        bullish = max(0.0, 100.0 - bearish)

    ch = _as_float(
        _pick(
            coin,
            "sentiment_change_24h",
            "percent_change_sentiment",
            "sentiment_24h_change",
        )
    )
    if ch is None:
        ch = _as_float(_pick(coin, "galaxy_score_change_24h", "percent_change_galaxy_score"))

    if ch is None or abs(ch) < 0.05:
        arrow = "→"
    elif ch > 0:
        arrow = "↑"
    else:
        arrow = "↓"

    return bullish, bearish, arrow


def _parse_influencers(coin: dict, creators_payload: object | None) -> list[dict]:
    raw: list = []
    embedded = _pick(coin, "top_creators", "creators", "influencers", default=[])
    if isinstance(embedded, list) and embedded:
        raw = embedded
    elif creators_payload is not None:
        raw = _unwrap_list(creators_payload)

    out: list[dict] = []
    for i, row in enumerate(raw[:5]):
        if not isinstance(row, dict):
            continue
        name = (
            _pick(row, "creator_display_name", "creator_name", "name", "display_name", "username")
            or f"Creator {i + 1}"
        )
        handle = _pick(row, "creator_name", "username", "screen_name", "handle")
        engagements = _as_float(
            _pick(row, "engagements", "interactions", "engagements_24h", "interactions_24h")
        )
        posts = _as_float(_pick(row, "posts", "posts_24h", "mentions", "creator_posts"))
        followers = _as_float(_pick(row, "followers", "creator_followers"))
        out.append(
            {
                "rank": i + 1,
                "name": str(name),
                "handle": str(handle) if handle else None,
                "engagements": engagements,
                "posts": posts,
                "followers": followers,
                "url": _pick(row, "url", "profile_url", "creator_link"),
                "platform": _pick(row, "network", "platform", "source"),
            }
        )
    return out


def _momentum_series(series_rows: list[dict]) -> list[float]:
    points: list[float] = []
    for row in series_rows[-14:]:
        v = _as_float(
            _pick(
                row,
                "social_volume",
                "interactions",
                "engagements",
                "posts",
                "mentions",
                "social_score",
            )
        )
        if v is not None:
            points.append(v)
    if len(points) >= 2:
        return [round(p, 4) for p in points]
    return []


def _mock_payload() -> dict:
    spark = [42.0, 44.5, 41.2, 46.8, 48.1, 45.0, 49.3, 51.0]
    return {
        "updatedAt": _now_iso(),
        "source": "mock",
        "mockOnly": True,
        "errors": [],
        "endpoints": [
            "coins/bitcoin/v1",
            "coins/bitcoin/time-series/v1?interval=1w",
        ],
        "heroes": [
            {"name": "Galaxy Score", "value": "72", "sub": "Social health"},
            {"name": "AltRank", "value": "#4", "sub": "Lower is better"},
            {"name": "Social Volume", "value": "1.24M", "sub": "+8.4% 24h"},
            {"name": "Dominance", "value": "38.2%", "sub": "Crypto social share"},
        ],
        "sentiment": {
            "bullishPct": 64.0,
            "bearishPct": 36.0,
            "trendArrow": "↑",
            "trendLabel": "Improving",
        },
        "metrics": {
            "galaxyScore": 72.0,
            "altRank": 4,
            "socialVolume": 1_240_000,
            "socialVolume24hChangePct": 8.4,
            "socialDominancePct": 38.2,
            "mentions24h": 89200,
            "activeCreators": 4210,
        },
        "momentum": {
            "label": "7d social volume",
            "changePct": 12.6,
            "sparkline": spark,
        },
        "influencers": [
            {
                "rank": 1,
                "name": "PlanB",
                "handle": "100trillionUSD",
                "engagements": 284000,
                "posts": 12,
                "followers": 1_900_000,
                "url": "https://x.com/100trillionUSD",
                "platform": "x",
            },
            {
                "rank": 2,
                "name": "Michael Saylor",
                "handle": "saylor",
                "engagements": 256000,
                "posts": 8,
                "followers": 4_200_000,
                "url": "https://x.com/saylor",
                "platform": "x",
            },
            {
                "rank": 3,
                "name": "Eric Balchunas",
                "handle": "EricBalchunas",
                "engagements": 198000,
                "posts": 15,
                "followers": 320000,
                "url": "https://x.com/EricBalchunas",
                "platform": "x",
            },
            {
                "rank": 4,
                "name": "CZ",
                "handle": "cz_binance",
                "engagements": 175000,
                "posts": 6,
                "followers": 8_800_000,
                "url": "https://x.com/cz_binance",
                "platform": "x",
            },
            {
                "rank": 5,
                "name": "Willey Woo",
                "handle": "woonomic",
                "engagements": 142000,
                "posts": 9,
                "followers": 1_100_000,
                "url": "https://x.com/woonomic",
                "platform": "x",
            },
        ],
        "commentary": [
            "Mock BTC social data — set LUNARCRUSH_API_KEY for live LunarCrush metrics.",
            "Galaxy Score 72 with rising social volume suggests steady BTC discourse on X and forums.",
            "Top creators skew toward ETF flows, accumulation, and macro — typical BTC cycle narratives.",
        ],
    }


def _build_live_payload() -> dict:
    errors: list[str] = []
    endpoints: list[str] = []

    coin_raw = _fetch_json("coins/bitcoin/v1")
    endpoints.append("coins/bitcoin/v1")
    coin = _unwrap_coin(coin_raw)

    series_raw: object = {}
    try:
        series_raw = _fetch_json("coins/bitcoin/time-series/v1", params={"interval": "1w"})
        endpoints.append("coins/bitcoin/time-series/v1?interval=1w")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
        errors.append(f"time-series: {exc}")

    creators_raw = None
    embedded_creators = _pick(coin, "top_creators", "creators", "influencers")
    if not embedded_creators:
        try:
            creators_raw = _fetch_json("topic/bitcoin/creators/v1")
            endpoints.append("topic/bitcoin/creators/v1")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
            errors.append(f"creators: {exc}")

    bullish, bearish, arrow = _sentiment_split(coin)
    galaxy = _as_float(_pick(coin, "galaxy_score", "galaxyScore"))
    alt_rank = _pick(coin, "alt_rank", "altRank", "altrank")
    try:
        alt_rank = int(alt_rank) if alt_rank is not None else None
    except (TypeError, ValueError):
        alt_rank = None

    social_vol = _as_float(
        _pick(
            coin,
            "social_volume",
            "social_volume_24h",
            "interactions",
            "interactions_24h",
            "posts",
            "posts_24h",
        )
    )
    vol_prev = _as_float(
        _pick(coin, "social_volume_24h_previous", "interactions_24h_previous", "posts_24h_previous")
    )
    vol_chg = _as_float(
        _pick(
            coin,
            "percent_change_social_volume_24h",
            "social_volume_change_24h",
            "percent_change_interactions_24h",
        )
    )
    if vol_chg is None:
        vol_chg = _pct_change(social_vol, vol_prev)

    dominance = _as_float(
        _pick(coin, "social_dominance", "social_dominance_24h", "percent_social_dominance")
    )
    if dominance is not None and dominance <= 1:
        dominance *= 100.0

    mentions = _as_float(_pick(coin, "mentions", "mentions_24h", "social_mentions"))
    creators_count = _as_float(
        _pick(coin, "active_creators", "creators", "num_contributors", "contributors")
    )

    series_rows = _unwrap_series(series_raw)
    spark = _momentum_series(series_rows)
    momentum_chg = None
    if len(spark) >= 2:
        momentum_chg = _pct_change(spark[-1], spark[0])

    influencers = _parse_influencers(coin, creators_raw)

    trend_label = "Stable"
    if arrow == "↑":
        trend_label = "Improving"
    elif arrow == "↓":
        trend_label = "Softening"

    heroes = [
        {
            "name": "Galaxy Score",
            "value": f"{galaxy:.0f}" if galaxy is not None else "—",
            "sub": "LunarCrush social health",
        },
        {
            "name": "AltRank",
            "value": f"#{alt_rank}" if alt_rank is not None else "—",
            "sub": "Lower is better",
        },
        {
            "name": "Social Volume",
            "value": _fmt_compact(social_vol),
            "sub": f"{vol_chg:+.1f}% 24h" if vol_chg is not None else "24h activity",
        },
        {
            "name": "Dominance",
            "value": f"{dominance:.1f}%" if dominance is not None else "—",
            "sub": "Share of crypto social",
        },
    ]

    commentary = [
        f"BTC social snapshot from LunarCrush ({len(endpoints)} API call{'s' if len(endpoints) != 1 else ''}).",
    ]
    if bullish is not None:
        commentary.append(
            f"Sentiment leans {bullish:.0f}% bullish / {bearish:.0f}% bearish ({trend_label.lower()})."
        )
    if vol_chg is not None:
        commentary.append(f"Social volume moved {vol_chg:+.1f}% over the last 24 hours.")
    if dominance is not None:
        commentary.append(f"Bitcoin captures ~{dominance:.1f}% of total crypto social conversation.")
    if errors:
        commentary.append("Partial data — some endpoints failed; showing best available fields.")

    return {
        "updatedAt": _now_iso(),
        "source": "live" if not errors else "live+partial",
        "mockOnly": False,
        "errors": errors,
        "endpoints": endpoints,
        "heroes": heroes,
        "sentiment": {
            "bullishPct": bullish,
            "bearishPct": bearish,
            "trendArrow": arrow,
            "trendLabel": trend_label,
        },
        "metrics": {
            "galaxyScore": galaxy,
            "altRank": alt_rank,
            "socialVolume": social_vol,
            "socialVolume24hChangePct": vol_chg,
            "socialDominancePct": dominance,
            "mentions24h": mentions,
            "activeCreators": creators_count,
        },
        "momentum": {
            "label": "7d social volume",
            "changePct": momentum_chg,
            "sparkline": spark,
        },
        "influencers": influencers,
        "commentary": commentary,
    }


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


def get_social_btc_payload(*, refresh: bool = False, mock_only: bool = False) -> dict:
    cache_key = "social:btc:mock" if mock_only else "social:btc:live"
    cached = _cache_get(cache_key, refresh)
    if cached is not None:
        return cached

    if mock_only:
        payload = _mock_payload()
        _cache_set(cache_key, payload)
        return payload

    try:
        if not _api_key():
            payload = _mock_payload()
            payload["source"] = "mock"
            payload["errors"] = ["LUNARCRUSH_API_KEY not set — showing mock data"]
            _cache_set(cache_key, payload)
            return payload

        payload = _build_live_payload()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
        stale = _cache.get(cache_key)
        if stale and time.time() - stale[0] <= CACHE_TTL * 6:
            out = dict(stale[1])
            out["source"] = "cached"
            out["errors"] = [str(exc)]
            return out
        payload = _mock_payload()
        payload["errors"] = [str(exc)]

    _cache_set(cache_key, payload)
    return payload