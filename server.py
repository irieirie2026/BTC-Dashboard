#!/usr/bin/env python3
"""Static file server with BTC market, ETF, and treasury data APIs (Bitbo)."""

import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlparse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
CACHE_TTL = 900  # 15 minutes
STATS_HISTORY_CACHE_TTL = 21_600  # 6 hours
SYMBOL_NAME_CACHE_TTL = 604800  # 7 days
_cache = {}

ETF_TICKERS = [
    "IBIT", "FBTC", "GBTC", "BTC", "BITB", "ARKB", "HODL",
    "BTCO", "BRRR", "EZBC", "MSBT", "BTCW", "DEFI",
]

USER_AGENT = (
    "Mozilla/5.0 (compatible; BTCDashboard/1.0; +https://localhost)"
)

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

NITTER_MIRRORS = [
    "https://nitter.net",
]
X_RSS_USER_AGENT = "Feedly/1.0 (+https://github.com/irieirie2026/BTC-Dashboard)"
X_FEED_STALE_TTL = 86400  # 24 hours
X_FEED_CACHE_PATH = ROOT / "data" / "x-feed-cache.json"
NITTER_MIRROR_HOSTS = (
    "nitter.net",
    "xcancel.com",
    "rss.xcancel.com",
    "nitter.poast.org",
    "nitter.privacyredirect.com",
    "nt.vern.cc",
    "twitter.com",
)


def fetch_html(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def cached_fetch(key, url, parser):
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]

    data = parser(fetch_html(url))
    _cache[key] = {"ts": now, "data": data}
    return data


def parse_holdings(html):
    etfs = []
    total_btc = None
    total_usd = None
    pct_21m = None
    updated = None

    for row in re.finditer(r"<tr>\s*(.*?)</tr>", html, re.S):
        chunk = row.group(1)
        if "td-company" not in chunk or "td-symbol" not in chunk:
            continue

        name_match = re.search(
            r'td-company[^>]*>.*?<a[^>]*>\s*([^<]+?)\s*</a>', chunk, re.S
        )
        symbol_match = re.search(
            r'td-symbol[^>]*>([A-Z]{2,5}):(NASDAQ|NYSE|CBOE)</td>', chunk
        )
        btc_match = re.search(r'td-company_btc[^>]*>([^<]+)</td>', chunk)
        usd_match = re.search(r'td-value[^>]*>([^<]+)</td>', chunk)
        pct_match = re.search(r'td-company_percent[^>]*>([^<]+)</td>', chunk)

        if not all([name_match, symbol_match, btc_match, usd_match, pct_match]):
            continue

        try:
            etfs.append({
                "name": re.sub(r"\s+", " ", name_match.group(1)).strip(),
                "ticker": symbol_match.group(1),
                "exchange": symbol_match.group(2),
                "btc": float(btc_match.group(1).replace(",", "").strip()),
                "usd": float(
                    usd_match.group(1).replace(",", "").replace("$", "").strip()
                ),
                "pct21m": float(pct_match.group(1).replace("%", "").strip()),
            })
        except ValueError:
            continue

    summary = re.search(
        r'top-table-data-row.*?td-company_btc[^>]*>\s*([\d,]+).*?'
        r'td-value[^>]*>\s*\$?([\d,]+).*?'
        r'td-company_percent[^>]*>\s*([\d.]+%).*?'
        r'td-last-updated[^>]*>\s*([^<]+)',
        html,
        re.S,
    )
    if summary:
        total_btc = float(summary.group(1).replace(",", ""))
        total_usd = float(summary.group(2).replace(",", ""))
        pct_21m = float(summary.group(3).replace("%", ""))
        updated = summary.group(4).strip()

    etfs.sort(key=lambda e: e["btc"], reverse=True)
    return {
        "etfs": etfs,
        "totalBtc": total_btc or sum(e["btc"] for e in etfs),
        "totalUsd": total_usd or sum(e["usd"] for e in etfs),
        "pct21m": pct_21m,
        "updated": updated,
        "source": "bitbo.io/treasuries/us-etfs",
    }


def _sum_by_etf(rows, predicate=None):
    totals = {ticker: 0.0 for ticker in ETF_TICKERS}
    for row in rows:
        if predicate and not predicate(row):
            continue
        for ticker in ETF_TICKERS:
            totals[ticker] += row["flows"].get(ticker, 0.0)
    return totals


def compute_flow_summaries(rows):
    if not rows:
        return []

    last_5 = rows[:5]
    five_day_total = sum(r["totalUsdM"] for r in last_5)
    daily_avg = sum(r["totalUsdM"] for r in rows) / len(rows)
    inflow_total = sum(r["totalUsdM"] for r in rows if r["totalUsdM"] > 0)
    outflow_total = sum(r["totalUsdM"] for r in rows if r["totalUsdM"] < 0)

    return [
        {
            "label": "5 trading days",
            "totalUsdM": five_day_total,
            "byEtf": _sum_by_etf(last_5),
        },
        {
            "label": "Daily average",
            "totalUsdM": daily_avg,
            "byEtf": {
                ticker: total / len(rows)
                for ticker, total in _sum_by_etf(rows).items()
            },
        },
        {
            "label": "Inflow days total",
            "totalUsdM": inflow_total,
            "byEtf": _sum_by_etf(rows, lambda r: r["totalUsdM"] > 0),
        },
        {
            "label": "Outflow days total",
            "totalUsdM": outflow_total,
            "byEtf": _sum_by_etf(rows, lambda r: r["totalUsdM"] < 0),
        },
    ]


def parse_flows(html):
    rows = []

    for match in re.finditer(
        r'<tr>\s*<td class="cell right-align">\s*<span>([^<]+)</span>\s*</td>(.*?)</tr>',
        html,
        re.S,
    ):
        label = match.group(1).strip()
        body = match.group(2)
        values = re.findall(r"<span>(-?[\d.]+)</span>", body)

        if not values:
            continue

        if re.match(r"[A-Za-z]{3} \d+, \d{4}", label) and len(values) >= len(ETF_TICKERS):
            flows = {}
            for i, ticker in enumerate(ETF_TICKERS):
                if i < len(values):
                    flows[ticker] = float(values[i])
            total = float(values[-1]) if values else sum(flows.values())
            rows.append({"date": label, "flows": flows, "totalUsdM": total})

    summaries = compute_flow_summaries(rows)

    return {
        "tickers": ETF_TICKERS,
        "rows": rows,
        "summaries": summaries,
        "source": "bitbo.io/treasuries/etf-flows",
    }


DERIBIT_API = "https://www.deribit.com/api/v2/public"

BT_HOME_URL = "https://bitcointreasuries.net"
BT_DATA_URL = "https://bitcointreasuries.net/__data.json"
BT_STRATEGY_URL = "https://bitcointreasuries.net/public-companies/strategy/__data.json"
BITBO_STRATEGY_URL = "https://bitbo.io/treasuries/microstrategy/"
DOMINANCE_KEYS = ["BTC", "ETH", "SOL", "BNB", "XRP"]


def _resolve_bt_value(arr, ref, depth=0, cache=None):
    if cache is None:
        cache = {}
    if depth > 30:
        return None
    if isinstance(ref, bool):
        return ref
    if isinstance(ref, (str, float)):
        return ref
    if isinstance(ref, list):
        return [_resolve_bt_value(arr, x, depth + 1, cache) for x in ref]
    if isinstance(ref, dict):
        return {
            k: _resolve_bt_value(arr, v, depth + 1, cache)
            for k, v in ref.items()
        }
    if not isinstance(ref, int):
        return ref
    if ref in cache:
        return cache[ref]
    if ref < 0 or ref >= len(arr):
        return ref
    val = arr[ref]
    if isinstance(val, dict):
        resolved = {
            k: _resolve_bt_value(arr, v, depth + 1, cache)
            for k, v in val.items()
        }
    elif isinstance(val, list):
        resolved = [_resolve_bt_value(arr, x, depth + 1, cache) for x in val]
    else:
        resolved = val
    cache[ref] = resolved
    return resolved


def _bt_num(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict):
        raw = value.get("display_value", value.get("native", value.get("value")))
        if isinstance(raw, list) and raw and raw[0] == "BigDecimal":
            return float(raw[1])
        return float(raw) if raw is not None else None
    if isinstance(value, list) and len(value) == 2 and value[0] == "BigDecimal":
        return float(value[1])
    return None


def _bt_parse_map(raw):
    if isinstance(raw, list) and len(raw) > 1 and raw[0] == "Map":
        return {raw[i]: raw[i + 1] for i in range(1, len(raw), 2)}
    return raw if isinstance(raw, dict) else {}


def _bt_parse_quotes(quotes_raw):
    quotes = {}
    if not isinstance(quotes_raw, list):
        return quotes
    items = quotes_raw
    if quotes_raw and quotes_raw[0] == "Map":
        items = list(_bt_parse_map(quotes_raw).values())
    for item in items:
        if isinstance(item, dict) and item.get("symbol"):
            price = _bt_num(item.get("price"))
            if price is not None:
                quotes[item["symbol"]] = price
    return quotes


def _bt_normalize_company(ent, btc_price):
    if not isinstance(ent, dict) or ent.get("type") != "PUBLIC_COMPANY":
        return None

    raw_btc = ent.get("btc_balance")
    if isinstance(raw_btc, dict):
        return None
    btc = _bt_num(raw_btc)
    if btc is None or btc <= 0 or btc > 900_000:
        return None

    ticker = ent.get("ticker") or {}
    country = ent.get("country") or {}
    industries = ent.get("industries") or []
    industry = None
    if industries and isinstance(industries[0], dict):
        industry = industries[0].get("name")

    mcap = _bt_num(ent.get("market_cap_fully_diluted"))
    if mcap is None:
        mcap = _bt_num(ent.get("market_cap_basic"))

    usd = btc * btc_price if btc_price else None
    mnav = round(mcap / usd, 2) if mcap and usd else None
    ch7 = ent.get("btc_balance_change_7d")
    ch7n = _bt_num(ch7) if isinstance(ch7, (int, float)) else None

    return {
        "name": ent.get("name"),
        "slug": ent.get("slug"),
        "ticker": ticker.get("symbol") if isinstance(ticker, dict) else None,
        "countryCode": country.get("alpha2") if isinstance(country, dict) else None,
        "countryFlag": country.get("flag") if isinstance(country, dict) else None,
        "countryName": country.get("name") if isinstance(country, dict) else None,
        "btc": btc,
        "btcChange7d": ch7n,
        "usd": usd,
        "pct21m": (btc / 21_000_000) * 100,
        "costBasis": _bt_num(ent.get("cost_basis")),
        "stockPrice": _bt_num(ent.get("stock_price")),
        "marketCap": mcap,
        "enterpriseValue": _bt_num(ent.get("enterprise_value")),
        "mnav": mnav,
        "btcPerShare": _bt_num(ent.get("btc_per_share_fully_diluted"))
        or _bt_num(ent.get("btc_per_share_basic")),
        "industry": industry,
        "subtype": ent.get("subtype"),
        "rank": ent.get("group_ranking"),
        "url": (
            f"https://bitcointreasuries.net/public-companies/{ent.get('slug')}"
            if ent.get("slug")
            else None
        ),
    }


def _bt_asset_dominance(alt_map, quotes, btc_usd):
    alt_usd = {}
    for item in alt_map.values():
        if not isinstance(item, dict):
            continue
        symbol = item.get("symbol")
        if not symbol:
            continue
        balance = sum(
            float(e.get("balance", 0))
            for e in item.get("entities", [])
            if isinstance(e, dict)
        )
        price = quotes.get(f"{symbol}USD", 0)
        alt_usd[symbol] = balance * price

    total = btc_usd + sum(alt_usd.values())
    if total <= 0:
        return {"BTC": 100.0}

    dominance = {"BTC": round(btc_usd / total * 100, 1)}
    for symbol, value in alt_usd.items():
        dominance[symbol] = round(value / total * 100, 2)
    return dominance


def _fetch_bt_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _parse_homepage_summary(html):
    summary = {}

    def _section(label):
        idx = html.find(label)
        return html[idx : idx + 900] if idx >= 0 else ""

    btc_chunk = _section("BTC Held by Public Companies")
    btc_label = re.search(r"([\d.]+M)", btc_chunk)
    usd_label = re.search(r"\$([\d.]+)B", btc_chunk)
    if btc_label:
        summary["totalBtcLabel"] = btc_label.group(1)
    if usd_label:
        summary["totalUsdLabel"] = f"${usd_label.group(1)}B"

    count_chunk = _section("Number of Public Companies")
    count_match = re.search(r">(\d{1,4})</", count_chunk)
    if count_match:
        summary["count"] = int(count_match.group(1))

    price_chunk = _section("BTC Price")
    price_match = re.search(r"\$([\d,]+)</", price_chunk)
    if price_match:
        summary["btcPriceLabel"] = "$" + price_match.group(1)
        summary["btcPrice"] = float(price_match.group(1).replace(",", ""))

    dom_chunk = _section("Asset Dominance")
    dom_match = re.search(r"([\d.]+)%", dom_chunk)
    widths = re.findall(r"width:\s*([\d.]+)%", html)
    if dom_match:
        summary["btcDominanceLabel"] = dom_match.group(1) + "%"
    if widths:
        dominance = {}
        for i, key in enumerate(DOMINANCE_KEYS):
            if i < len(widths):
                dominance[key] = round(float(widths[i]), 2)
        summary["assetDominance"] = dominance

    return summary


def parse_bitcointreasuries(_html=""):
    homepage_html = fetch_html(BT_HOME_URL)
    homepage_summary = _parse_homepage_summary(homepage_html)
    payload = _fetch_bt_json(BT_DATA_URL)
    nodes = payload.get("nodes", [])
    if len(nodes) < 2:
        raise ValueError("Unexpected bitcointreasuries.net payload")

    meta_arr = nodes[0]["data"]
    data_arr = nodes[1]["data"]
    meta_root = meta_arr[0] if meta_arr else {}
    data_root = data_arr[0] if data_arr else {}

    metrics = _resolve_bt_value(
        meta_arr, meta_root.get("initialBitcoinMetrics"), cache={}
    )
    btc_price = metrics.get("price") if isinstance(metrics, dict) else None
    btc_change_24h = metrics.get("change_pct_24h") if isinstance(metrics, dict) else None

    quotes = _bt_parse_quotes(
        _resolve_bt_value(
            data_arr, data_root.get("initialAltcoinQuotes"), cache={}
        )
    )
    alt_map = _bt_parse_map(
        _resolve_bt_value(data_arr, data_root.get("altcoinHoldings"), cache={})
    )

    entities_ref = data_root.get("entities")
    entity_indices = (
        data_arr[entities_ref]
        if isinstance(entities_ref, int) and entities_ref < len(data_arr)
        else []
    )
    companies = []
    for entity_idx in entity_indices or []:
        if not isinstance(entity_idx, int):
            continue
        ent = _resolve_bt_value(data_arr, entity_idx, cache={})
        company = _bt_normalize_company(ent, btc_price)
        if company:
            companies.append(company)

    companies.sort(key=lambda c: c["btc"], reverse=True)
    for i, company in enumerate(companies, start=1):
        company["rank"] = i

    holders = [c for c in companies if c["btc"] > 0]
    total_btc = sum(c["btc"] for c in holders)
    total_usd = sum(c.get("usd") or 0 for c in holders)

    strategy = next((c for c in companies if c.get("slug") == "strategy"), None)

    strategy_extras = {}
    try:
        strategy_payload = _fetch_bt_json(BT_STRATEGY_URL)
        s_nodes = strategy_payload.get("nodes", [])
        if len(s_nodes) >= 2:
            s_arr = s_nodes[1]["data"]
            s_root = s_arr[0] if s_arr else {}
            peers = (
                _resolve_bt_value(s_arr, s_root.get("peerHolders"), cache={}) or []
            )
            digital = (
                _resolve_bt_value(
                    s_arr, s_root.get("digitalCreditInstruments"), cache={}
                )
                or []
            )
            strategy_extras = {
                "peers": [
                    {
                        "name": p.get("name"),
                        "ticker": (p.get("ticker") or {}).get("symbol"),
                        "btc": _bt_num(p.get("btc_balance")),
                        "rank": p.get("group_ranking"),
                    }
                    for p in peers
                    if isinstance(p, dict)
                ],
                "digitalCredit": [
                    {
                        "symbol": d.get("symbol"),
                        "name": d.get("name"),
                        "dividendPct": d.get("current_dividend_pct"),
                        "notional": d.get("notional"),
                    }
                    for d in digital
                    if isinstance(d, dict)
                ],
            }
    except Exception:
        strategy_extras = {}

    try:
        strategy_html = fetch_html(BITBO_STRATEGY_URL)
        bitbo_strategy = parse_strategy(strategy_html)
    except Exception:
        bitbo_strategy = {"purchases": [], "holdingsHistory": []}

    if strategy:
        strategy = {
            **strategy,
            "avgCostUsd": (
                strategy["costBasis"] / strategy["btc"]
                if strategy.get("costBasis") and strategy.get("btc")
                else bitbo_strategy.get("avgCostUsd")
            ),
            "totalCostB": (
                strategy["costBasis"] / 1e9 if strategy.get("costBasis") else None
            ),
            "purchases": bitbo_strategy.get("purchases", []),
            "holdingsHistory": bitbo_strategy.get("holdingsHistory", []),
            **strategy_extras,
        }

    computed_dominance = _bt_asset_dominance(alt_map, quotes, total_usd)
    asset_dominance = homepage_summary.get("assetDominance") or computed_dominance

    return {
        "btcPrice": homepage_summary.get("btcPrice") or btc_price,
        "btcChange24h": btc_change_24h,
        "summary": {
            "totalBtc": total_btc,
            "totalBtcLabel": homepage_summary.get("totalBtcLabel")
            or f"{total_btc / 1e6:.3f}M".rstrip("0").rstrip("."),
            "totalUsd": total_usd,
            "totalUsdLabel": homepage_summary.get("totalUsdLabel")
            or f"${total_usd / 1e9:.2f}B",
            "count": homepage_summary.get("count") or len(holders),
            "pct21m": (total_btc / 21_000_000) * 100,
            "btcPriceLabel": homepage_summary.get("btcPriceLabel"),
            "btcDominanceLabel": homepage_summary.get("btcDominanceLabel"),
            "assetDominance": asset_dominance,
        },
        "companies": companies,
        "strategy": strategy,
        "source": "bitcointreasuries.net",
        "sourceUrl": BT_HOME_URL,
    }


def parse_strategy(html):
    pairs = re.findall(r"\(\s*(\d+)\s*\),\s*truncate\(([\d.]+)", html)
    holdings_history = [
        {"time": int(ts), "btc": float(btc)} for ts, btc in pairs
    ]
    holdings_history.sort(key=lambda x: x["time"])

    purchases = []
    table_start = html.find("MicroStrategy Bitcoin Purchase History")
    if table_start >= 0:
        section = html[table_start : table_start + 200000]
        for row in re.finditer(r"<tr>(.*?)</tr>", section, re.S):
            cells = re.findall(r"<span>([^<]*)</span>", row.group(1))
            if len(cells) < 5:
                continue
            date, btc_bought, amount, total_btc, total_usd = cells[:5]
            if not re.match(r"\d{1,2}/\d{1,2}/\d{4}", date.strip()):
                continue
            btc_clean = btc_bought.replace(",", "").replace("(", "-").replace(")", "")
            try:
                purchases.append({
                    "date": date.strip(),
                    "btcBought": float(btc_clean),
                    "amount": amount.strip(),
                    "totalBtc": float(total_btc.replace(",", "")),
                    "totalUsd": total_usd.strip(),
                })
            except ValueError:
                continue

    avg_match = re.search(
        r"average purchase price as \$([\d,]+\.?\d*)", html, re.I
    )
    cost_match = re.search(r"total cost of \$([\d.]+) billion", html, re.I)
    current = holdings_history[-1]["btc"] if holdings_history else None

    return {
        "name": "Strategy (MicroStrategy)",
        "ticker": "MSTR",
        "exchange": "NASDAQ",
        "btc": current,
        "avgCostUsd": float(avg_match.group(1).replace(",", "")) if avg_match else None,
        "totalCostB": float(cost_match.group(1)) if cost_match else None,
        "holdingsHistory": holdings_history[-120:],
        "purchases": purchases[:60],
    }


def _fetch_treasury_payload(_html=""):
    payload = parse_bitcointreasuries()
    payload["fetchedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return payload


def get_treasury_payload():
    return cached_fetch("treasury", BT_DATA_URL, _fetch_treasury_payload)


def _fetch_json_url(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _fetch_options_payload(_html=""):
    summary = _fetch_json_url(
        f"{DERIBIT_API}/get_book_summary_by_currency?currency=BTC&kind=option"
    )
    index = _fetch_json_url(
        f"{DERIBIT_API}/get_index_price?index_name=btc_usd"
    )
    return {
        "contracts": summary.get("result", []),
        "index": index.get("result", {}),
        "source": "deribit.com",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def get_options_payload():
    now = time.time()
    entry = _cache.get("options")
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]
    data = _fetch_options_payload()
    _cache["options"] = {"ts": now, "data": data}
    return data


ONCHAIN_CHART_NAMES = frozenset({
    "avg-block-size",
    "estimated-transaction-volume",
    "hash-rate",
    "miners-revenue",
    "n-transactions",
    "n-unique-addresses",
    "total-bitcoins",
    "transaction-fees",
})


def get_onchain_chart_payload(name, timespan="30days"):
    if name not in ONCHAIN_CHART_NAMES:
        raise ValueError(f"Unknown on-chain chart: {name}")
    allowed_timespans = {"1year", "2years", "30days", "60days", "90days"}
    if timespan not in allowed_timespans:
        timespan = "30days"
    key = f"onchain-chart:{name}:{timespan}"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]
    url = (
        f"https://api.blockchain.info/charts/{name}"
        f"?timespan={timespan}&format=json"
    )
    data = fetch_json(url)
    _cache[key] = {"ts": now, "data": data}
    return data


BITSTAMP_OHLC_URL = "https://www.bitstamp.net/api/v2/ohlc/btcusd/"
BLOCKCHAIN_MARKET_PRICE_URL = (
    "https://api.blockchain.info/charts/market-price?timespan=all&format=json"
)
STATS_HISTORY_DISK_CACHE = ROOT / "data" / "stats-btc-history-cache.json"
DAY_MS = 86_400_000


def _normalize_day_ms(ts_ms):
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    midnight = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return int(midnight.timestamp() * 1000)


def fetch_json_retry(url, retries=3, timeout=45, backoff=1.2):
    last_err = None
    for attempt in range(retries):
        try:
            return fetch_json(url, timeout=timeout)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            last_err = exc
            if attempt < retries - 1:
                time.sleep(backoff * (attempt + 1))
    raise last_err


def _fetch_bitstamp_daily_btc():
    step = 86_400
    limit = 1000
    start = int(datetime(2011, 8, 1, tzinfo=timezone.utc).timestamp())
    now_ts = int(time.time())
    by_day = {}

    while start < now_ts:
        end = min(start + step * limit, now_ts + step)
        url = (
            f"{BITSTAMP_OHLC_URL}?step={step}&limit={limit}"
            f"&start={start}&end={end}"
        )
        payload = fetch_json_retry(url, retries=3, timeout=45)
        ohlc = payload.get("data", {}).get("ohlc", [])
        if not ohlc:
            break

        for row in ohlc:
            close = float(row["close"])
            if close <= 0:
                continue
            day = _normalize_day_ms(int(row["timestamp"]) * 1000)
            by_day[day] = {
                "date": day,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": close,
                "volume": float(row.get("volume") or 0),
                "source": "bitstamp",
            }

        last_ts = int(ohlc[-1]["timestamp"])
        if last_ts <= start:
            break
        start = last_ts + step
        time.sleep(0.08)

    if not by_day:
        raise RuntimeError("Bitstamp returned no daily OHLC rows")
    return [by_day[k] for k in sorted(by_day)]


def _fetch_blockchain_market_price():
    data = fetch_json_retry(BLOCKCHAIN_MARKET_PRICE_URL, retries=3, timeout=60)
    rows = []
    for point in data.get("values", []):
        close = float(point["y"])
        if close <= 0:
            continue
        day = _normalize_day_ms(int(point["x"]) * 1000)
        rows.append({
            "date": day,
            "open": close,
            "high": close,
            "low": close,
            "close": close,
            "volume": 0,
            "source": "blockchain.info",
        })
    if not rows:
        raise RuntimeError("Blockchain.info returned no positive market prices")
    return rows


def _stitch_btc_stats_sources():
    errors = []
    bitstamp = []
    blockchain = []

    with ThreadPoolExecutor(max_workers=2) as pool:
        bitstamp_future = pool.submit(_fetch_bitstamp_daily_btc)
        blockchain_future = pool.submit(_fetch_blockchain_market_price)
        try:
            bitstamp = bitstamp_future.result(timeout=55)
        except Exception as exc:
            errors.append(f"Bitstamp: {exc}")
        try:
            blockchain = blockchain_future.result(timeout=55)
        except Exception as exc:
            errors.append(f"Blockchain.info: {exc}")

    if not bitstamp and not blockchain:
        raise RuntimeError("; ".join(errors) or "Both BTC history sources failed")

    first_bitstamp = bitstamp[0]["date"] if bitstamp else None
    merged = {}
    sources = []

    for row in blockchain:
        if first_bitstamp and row["date"] >= first_bitstamp:
            continue
        merged[row["date"]] = row
    if blockchain:
        sources.append("Blockchain.info")

    for row in bitstamp:
        merged[row["date"]] = row
    if bitstamp:
        sources.append("Bitstamp")

    stitched = [merged[k] for k in sorted(merged)]
    return stitched, errors, sources


def _fill_daily_gaps(rows):
    valid = [r for r in rows if float(r.get("close") or 0) > 0]
    if not valid:
        return [], 0

    valid.sort(key=lambda r: r["date"])
    known_dates = [r["date"] for r in valid]
    by_day = {r["date"]: r for r in valid}
    start_ms = known_dates[0]
    end_ms = known_dates[-1]
    filled = []
    interpolated = 0
    day = start_ms

    while day <= end_ms:
        if day in by_day:
            filled.append(by_day[day])
        else:
            prev_date = next((d for d in reversed(known_dates) if d < day), None)
            next_date = next((d for d in known_dates if d > day), None)
            if prev_date and next_date:
                prev_row = by_day[prev_date]
                next_row = by_day[next_date]
                gap_days = (next_date - prev_date) // DAY_MS
                offset = (day - prev_date) // DAY_MS
                frac = offset / gap_days
                close = prev_row["close"] + (next_row["close"] - prev_row["close"]) * frac
                filled.append({
                    "date": day,
                    "open": close,
                    "high": close,
                    "low": close,
                    "close": close,
                    "volume": 0,
                    "source": "interpolated",
                })
                interpolated += 1
            elif prev_date:
                prev_row = by_day[prev_date]
                filled.append({
                    "date": day,
                    "open": prev_row["close"],
                    "high": prev_row["close"],
                    "low": prev_row["close"],
                    "close": prev_row["close"],
                    "volume": 0,
                    "source": "interpolated",
                })
                interpolated += 1
        day += DAY_MS

    return filled, interpolated


def _stats_history_payload_from_days(days, meta=None):
    meta = meta or {}
    sources = meta.get("sources") or ["Bitstamp", "Blockchain.info"]
    payload = {
        "pair": "BTC/USD",
        "source": " + ".join(sources) if len(sources) > 1 else sources[0],
        "startDate": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(days[0]["date"] / 1000)
        ),
        "endDate": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(days[-1]["date"] / 1000)
        ),
        "count": len(days),
        "days": days,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stale": bool(meta.get("stale")),
        "warnings": list(meta.get("warnings") or []),
        "interpolatedDays": int(meta.get("interpolatedDays") or 0),
    }
    return payload


def _load_stats_history_disk_cache():
    if not STATS_HISTORY_DISK_CACHE.is_file():
        return None
    try:
        return json.loads(STATS_HISTORY_DISK_CACHE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _save_stats_history_disk_cache(payload):
    try:
        STATS_HISTORY_DISK_CACHE.parent.mkdir(parents=True, exist_ok=True)
        STATS_HISTORY_DISK_CACHE.write_text(
            json.dumps(payload, separators=(",", ":")),
            encoding="utf-8",
        )
    except OSError:
        pass


def _build_btc_stats_history():
    stitched, errors, sources = _stitch_btc_stats_sources()
    days, interpolated = _fill_daily_gaps(stitched)
    if not days:
        raise ValueError("No BTC history data available after gap fill")
    return days, {
        "sources": sources,
        "warnings": errors,
        "interpolatedDays": interpolated,
        "stale": False,
    }


def get_stats_btc_history_payload():
    key = "stats:btc-history"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < STATS_HISTORY_CACHE_TTL:
        return entry["data"]

    try:
        days, meta = _build_btc_stats_history()
        payload = _stats_history_payload_from_days(days, meta)
        _cache[key] = {"ts": now, "data": payload}
        _save_stats_history_disk_cache(payload)
        return payload
    except Exception as exc:
        stale_entry = _cache.get(key)
        stale_payload = (
            stale_entry["data"]
            if stale_entry and stale_entry.get("data", {}).get("days")
            else _load_stats_history_disk_cache()
        )
        if stale_payload and stale_payload.get("days"):
            fallback = dict(stale_payload)
            fallback["stale"] = True
            warnings = list(fallback.get("warnings") or [])
            warnings.insert(0, str(exc))
            fallback["warnings"] = warnings
            return fallback
        raise RuntimeError(
            f"BTC history update failed ({exc}). No cached fallback available."
        ) from exc


def get_etf_payload():
    holdings = cached_fetch(
        "holdings", "https://bitbo.io/treasuries/us-etfs/", parse_holdings
    )
    flows = cached_fetch(
        "flows", "https://bitbo.io/treasuries/etf-flows/", parse_flows
    )
    return {
        "holdings": holdings,
        "flows": flows,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


try:
    import yfinance as yf

    YFINANCE_AVAILABLE = True
except ImportError:
    yf = None
    YFINANCE_AVAILABLE = False

SYMBOL_LABELS = {
    "^GSPC": "S&P 500",
    "^DJI": "Dow Jones",
    "^IXIC": "Nasdaq Composite",
    "^RUT": "Russell 2000",
    "^VIX": "VIX",
    "^STOXX50E": "Euro Stoxx 50",
    "^N225": "Nikkei 225",
    "^HSI": "Hang Seng",
    "^FTSE": "FTSE 100",
    "^GDAXI": "DAX",
    "^FCHI": "CAC 40",
    "^AXJO": "ASX 200",
    "^BSESN": "S&P BSE Sensex",
    "^KS11": "KOSPI",
    "^TWII": "Taiwan Weighted",
    "^TNX": "10-Year Treasury",
    "^FVX": "5-Year Treasury",
    "^TYX": "30-Year Treasury",
    "^IRX": "13-Week Treasury",
    "DX-Y.NYB": "US Dollar Index",
    "EURUSD=X": "EUR / USD",
    "USDJPY=X": "USD / JPY",
    "GBPUSD=X": "GBP / USD",
    "AUDUSD=X": "AUD / USD",
    "USDCAD=X": "USD / CAD",
    "USDCHF=X": "USD / CHF",
    "USDCNH=X": "USD / CNH",
    "EURJPY=X": "EUR / JPY",
    "EURGBP=X": "EUR / GBP",
    "NZDUSD=X": "NZD / USD",
    "ES=F": "S&P 500 E-mini",
    "NQ=F": "Nasdaq E-mini",
    "YM=F": "Dow E-mini",
    "RTY=F": "Russell E-mini",
    "CL=F": "WTI Crude",
    "BZ=F": "Brent Crude",
    "GC=F": "Gold",
    "SI=F": "Silver",
    "NG=F": "Natural Gas",
    "HG=F": "Copper",
    "ZB=F": "30Y T-Bond Future",
    "ZN=F": "10Y T-Note Future",
    "ZF=F": "5Y T-Note Future",
    "6E=F": "Euro FX Future",
    "6J=F": "Yen FX Future",
}

TRADFI_SECTIONS = {
    "stocks-indices": {
        "title": "Global Indices",
        "heroes": ["^GSPC", "^DJI", "^IXIC", "^RUT"],
        "table": [
            "^VIX", "^STOXX50E", "^FTSE", "^GDAXI", "^FCHI",
            "^N225", "^HSI", "^AXJO", "^BSESN", "^KS11", "^TWII",
        ],
        "chart": "^GSPC",
        "chartLabel": "S&P 500",
        "charts": [
            {"symbol": "^GSPC", "label": "S&P 500"},
            {"symbol": "^DJI", "label": "Dow Jones"},
            {"symbol": "^IXIC", "label": "Nasdaq Composite"},
            {"symbol": "^RUT", "label": "Russell 2000"},
            {"symbol": "^GDAXI", "label": "DAX"},
            {"symbol": "^FTSE", "label": "FTSE 100"},
            {"symbol": "^STOXX50E", "label": "Euro Stoxx 50"},
            {"symbol": "^N225", "label": "Nikkei 225"},
            {"symbol": "^HSI", "label": "Hang Seng"},
            {"symbol": "^AXJO", "label": "ASX 200"},
        ],
        "priceMode": "price",
    },
    "stocks-companies": {
        "title": "Bellwethers",
        "heroes": ["AAPL", "MSFT", "NVDA", "AMZN"],
        "table": [
            "GOOGL", "META", "TSLA", "BRK-B", "JPM", "V",
            "UNH", "XOM", "WMT", "LLY",
        ],
        "chart": "SPY",
        "chartLabel": "S&P 500 (SPY)",
        "priceMode": "price",
    },
    "futures": {
        "title": "Futures",
        "heroes": ["ES=F", "NQ=F", "YM=F", "RTY=F"],
        "table": ["CL=F", "GC=F", "SI=F", "NG=F", "ZB=F", "ZN=F", "ZF=F", "6E=F", "6J=F"],
        "chart": "ES=F",
        "chartLabel": "S&P 500 E-mini",
        "priceMode": "price",
    },
    "rates": {
        "title": "Rates & Bonds",
        "heroes": ["^TNX", "^FVX", "^TYX", "^IRX"],
        "table": ["TLT", "IEF", "SHY", "LQD", "HYG", "TIP", "AGG", "BND"],
        "chart": "^TNX",
        "chartLabel": "10-Year Treasury Yield",
        "priceMode": "yield",
    },
    "currencies": {
        "title": "Currencies",
        "heroes": ["DX-Y.NYB", "EURUSD=X", "USDJPY=X", "GBPUSD=X"],
        "table": [
            "AUDUSD=X", "USDCAD=X", "USDCHF=X", "USDCNH=X",
            "EURJPY=X", "EURGBP=X", "NZDUSD=X",
        ],
        "chart": "DX-Y.NYB",
        "chartLabel": "US Dollar Index",
        "priceMode": "fx",
    },
    "commodities": {
        "title": "Commodities",
        "heroes": ["CL=F", "BZ=F", "GC=F", "SI=F"],
        "table": ["HG=F", "NG=F", "ZC=F", "ZS=F", "KC=F", "CT=F", "PL=F", "PA=F"],
        "chart": "CL=F",
        "chartLabel": "WTI Crude",
        "priceMode": "price",
    },
    "sectors": {
        "title": "Sectors",
        "heroes": ["XLK", "XLF", "XLE", "XLV"],
        "table": [
            "XLK", "XLF", "XLE", "XLV", "XLI", "XLP", "XLY", "XLU",
            "XLRE", "XLB", "XLC",
        ],
        "chart": "SPY",
        "chartLabel": "S&P 500 (SPY)",
        "priceMode": "price",
    },
    "energy": {
        "title": "Energy",
        "heroes": ["CL=F", "BZ=F", "NG=F", "XLE"],
        "table": ["USO", "UNG", "XOM", "CVX", "COP", "OXY", "SLB", "HAL"],
        "chart": "CL=F",
        "chartLabel": "WTI Crude",
        "priceMode": "price",
    },
}

SECTOR_LABELS = {
    "XLK": "Technology",
    "XLF": "Financials",
    "XLE": "Energy",
    "XLV": "Health Care",
    "XLI": "Industrials",
    "XLP": "Consumer Staples",
    "XLY": "Consumer Disc.",
    "XLU": "Utilities",
    "XLRE": "Real Estate",
    "XLB": "Materials",
    "XLC": "Comm. Services",
}


def _yahoo_quote_label(raw):
    symbol = raw.get("symbol") or ""
    name = (
        raw.get("shortName")
        or raw.get("longName")
        or SECTOR_LABELS.get(symbol)
        or symbol
    )
    return name


def _symbol_label(symbol, fallback=None):
    return (
        SYMBOL_LABELS.get(symbol)
        or SECTOR_LABELS.get(symbol)
        or fallback
        or symbol
    )


def _closes_for_symbol(data, symbol, multi):
    if data is None or getattr(data, "empty", True):
        return None
    try:
        cols = getattr(data, "columns", None)
        if cols is not None and getattr(cols, "nlevels", 1) > 1:
            level0 = cols.get_level_values(0)
            level1 = cols.get_level_values(1)
            if symbol in level0:
                return data[symbol]["Close"].dropna()
            if symbol in level1:
                return data.xs("Close", axis=1, level=0)[symbol].dropna()
        if "Close" in data:
            close = data["Close"]
            if getattr(close, "ndim", 1) > 1 and symbol in getattr(close, "columns", []):
                return close[symbol].dropna()
            return close.dropna()
    except Exception:
        return None
    return None


def _as_float(value):
    if value is None:
        return None
    if hasattr(value, "item"):
        return float(value.item())
    return float(value)


def _quote_from_closes(symbol, closes):
    if closes is None or closes.empty:
        return None
    price = _as_float(closes.iloc[-1])
    prev = _as_float(closes.iloc[-2]) if len(closes) >= 2 else price
    change = price - prev
    change_pct = (change / prev) * 100 if prev else None
    return {
        "symbol": symbol,
        "name": _symbol_label(symbol),
        "price": price,
        "change": change,
        "changePct": change_pct,
        "currency": "USD",
        "marketState": "REGULAR",
        "previousClose": prev,
    }


def _cached_symbol_name(symbol):
    key = f"name:{symbol}"
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < SYMBOL_NAME_CACHE_TTL:
        return entry["data"]
    return None


def _store_symbol_name(symbol, name):
    if symbol and name:
        _cache[f"name:{symbol}"] = {"ts": time.time(), "data": name}


def _enrich_quote_names(by_symbol):
    """Attach human-readable names for equities (yfinance shortName/longName)."""
    if not YFINANCE_AVAILABLE or not by_symbol:
        return

    need = [
        sym
        for sym, quote in by_symbol.items()
        if sym and (not quote.get("name") or quote["name"] == sym)
    ]
    if not need:
        return

    still_need = []
    for sym in need:
        cached = _cached_symbol_name(sym)
        if cached:
            by_symbol[sym]["name"] = cached
        else:
            still_need.append(sym)

    if not still_need:
        return

    for sym in still_need:
        try:
            info = yf.Ticker(sym).info or {}
            name = info.get("shortName") or info.get("longName")
            if name:
                by_symbol[sym]["name"] = name
                _store_symbol_name(sym, name)
        except Exception:
            continue


def _enrich_quote_rows(rows):
    by_symbol = {q["symbol"]: q for q in rows if q.get("symbol")}
    _enrich_quote_names(by_symbol)


def _quote_from_ticker_history(symbol):
    try:
        hist = yf.Ticker(symbol).history(period="5d", auto_adjust=True)
        closes = hist["Close"].dropna() if hist is not None and not hist.empty else None
        return _quote_from_closes(symbol, closes)
    except Exception:
        return None


def fetch_yfinance_quotes(symbols):
    if not YFINANCE_AVAILABLE:
        raise RuntimeError("yfinance is not installed — run: pip3 install yfinance")

    unique = [sym for sym in dict.fromkeys(symbols) if sym]
    by_symbol = {}
    chunk_size = 6

    for i in range(0, len(unique), chunk_size):
        chunk = unique[i : i + chunk_size]
        try:
            data = yf.download(
                chunk,
                period="5d",
                group_by="ticker",
                threads=False,
                progress=False,
                auto_adjust=True,
            )
            multi = len(chunk) > 1
            for sym in chunk:
                if sym in by_symbol:
                    continue
                closes = _closes_for_symbol(data, sym, multi)
                quote = _quote_from_closes(sym, closes)
                if quote:
                    by_symbol[sym] = quote
        except Exception:
            pass

    for sym in unique:
        if sym in by_symbol:
            continue
        quote = _quote_from_ticker_history(sym)
        if quote:
            by_symbol[sym] = quote

    _enrich_quote_names(by_symbol)
    return by_symbol


def _index_year(idx):
    if hasattr(idx, "year"):
        return idx.year
    try:
        return int(str(idx)[:4])
    except (TypeError, ValueError):
        return None


def _perf_from_closes(closes):
    if closes is None or closes.empty:
        return None
    closes = closes.dropna()
    count = len(closes)
    if count < 2:
        return None

    current = _as_float(closes.iloc[-1])

    def ret_at(offset):
        pos = count - 1 - offset
        if pos < 0:
            return None
        base = _as_float(closes.iloc[pos])
        if not base:
            return None
        return ((current / base) - 1) * 100

    ytd = None
    last_year = _index_year(closes.index[-1])
    if last_year is not None:
        base = None
        for i in range(count):
            year = _index_year(closes.index[i])
            if year is not None and year >= last_year:
                if i > 0:
                    base = _as_float(closes.iloc[i - 1])
                break
        if base:
            ytd = ((current / base) - 1) * 100

    return {
        "w1": ret_at(5),
        "m1": ret_at(21),
        "m3": ret_at(63),
        "m12": ret_at(252),
        "ytd": ytd,
    }


def _history_points_from_closes(closes, days=90):
    if closes is None or closes.empty:
        return []
    tail = closes.dropna().tail(days)
    points = []
    for idx, close in tail.items():
        date = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
        points.append({"date": date, "close": _as_float(close)})
    return points


def _news_url_from_item(item):
    content = item.get("content") or item
    for key in ("canonicalUrl", "clickThroughUrl", "previewUrl"):
        obj = content.get(key)
        if isinstance(obj, dict) and obj.get("url"):
            return obj["url"]
        if isinstance(obj, str) and obj:
            return obj
    return content.get("link") or content.get("url") or item.get("link") or item.get("url")


def _news_published_at(item):
    content = item.get("content") or item
    raw = (
        content.get("pubDate")
        or content.get("displayTime")
        or item.get("providerPublishTime")
    )
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        try:
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(raw)))
        except (TypeError, ValueError, OSError):
            return None
    return str(raw)


def _news_source_name(item):
    content = item.get("content") or item
    provider = content.get("provider") or item.get("provider")
    if isinstance(provider, dict):
        return provider.get("displayName") or "Yahoo Finance"
    return item.get("publisher") or "Yahoo Finance"


def _fetch_stock_news(symbols, per_symbol=4, max_total=30):
    if not YFINANCE_AVAILABLE:
        return []

    by_key = {}
    for sym in symbols:
        if not sym:
            continue
        try:
            items = yf.Ticker(sym).news or []
        except Exception:
            continue
        for item in items[:per_symbol]:
            content = item.get("content") or item
            link = _news_url_from_item(item)
            key = link or content.get("id") or item.get("id")
            if not key:
                continue
            if key in by_key:
                if sym not in by_key[key]["symbols"]:
                    by_key[key]["symbols"].append(sym)
                continue
            by_key[key] = {
                "title": content.get("title") or item.get("title") or "Untitled",
                "link": link or "#",
                "source": _news_source_name(item),
                "publishedAt": _news_published_at(item),
                "symbols": [sym],
            }

    articles = sorted(
        by_key.values(),
        key=lambda a: a.get("publishedAt") or "",
        reverse=True,
    )
    return articles[:max_total]


def _watchlist_chart_symbols(hero_symbols, table_symbols):
    return list(dict.fromkeys([s for s in hero_symbols + table_symbols if s]))


def _quote_label_from_rows(symbol, heroes, table):
    for row in heroes + table:
        if row.get("symbol") == symbol:
            name = row.get("name")
            if name and name != symbol:
                return name
    return _symbol_label(symbol)


def fetch_yfinance_history_batch(symbols, period="1y"):
    if not YFINANCE_AVAILABLE:
        raise RuntimeError("yfinance is not installed — run: pip3 install yfinance")

    unique = [sym for sym in dict.fromkeys(symbols) if sym]
    by_symbol = {}
    chunk_size = 6

    for i in range(0, len(unique), chunk_size):
        chunk = unique[i : i + chunk_size]
        try:
            data = yf.download(
                chunk,
                period=period,
                group_by="ticker",
                threads=False,
                progress=False,
                auto_adjust=True,
            )
            multi = len(chunk) > 1
            for sym in chunk:
                if sym in by_symbol:
                    continue
                closes = _closes_for_symbol(data, sym, multi)
                if closes is not None and not closes.empty:
                    by_symbol[sym] = closes
        except Exception:
            pass

    for sym in unique:
        if sym in by_symbol:
            continue
        try:
            hist = yf.Ticker(sym).history(period=period, auto_adjust=True)
            closes = hist["Close"].dropna() if hist is not None and not hist.empty else None
            if closes is not None and not closes.empty:
                by_symbol[sym] = closes
        except Exception:
            continue

    return by_symbol


def fetch_yfinance_chart(symbol, range_="3mo"):
    if not YFINANCE_AVAILABLE:
        raise RuntimeError("yfinance is not installed — run: pip3 install yfinance")

    period = "3mo" if range_ == "3mo" else "5d"
    data = yf.download(
        symbol,
        period=period,
        progress=False,
        auto_adjust=True,
    )
    closes = _closes_for_symbol(data, symbol, multi=False)
    points = _history_points_from_closes(closes, days=90 if range_ == "3mo" else 5)
    return {
        "symbol": symbol,
        "label": _symbol_label(symbol),
        "currency": "USD",
        "points": points,
    }


def _normalize_yahoo_quote(raw):
    price = raw.get("regularMarketPrice")
    change = raw.get("regularMarketChange")
    change_pct = raw.get("regularMarketChangePercent")
    if change_pct is None and price and raw.get("regularMarketPreviousClose"):
        prev = raw.get("regularMarketPreviousClose")
        if prev:
            change = price - prev
            change_pct = (change / prev) * 100

    return {
        "symbol": raw.get("symbol"),
        "name": _yahoo_quote_label(raw),
        "price": price,
        "change": change,
        "changePct": change_pct,
        "currency": raw.get("currency"),
        "marketState": raw.get("marketState"),
        "previousClose": raw.get("regularMarketPreviousClose"),
    }


def fetch_yahoo_quotes(symbols):
    return fetch_yfinance_quotes(symbols)


def fetch_yahoo_chart(symbol, range_="3mo"):
    return fetch_yfinance_chart(symbol, range_=range_)


_SYMBOL_RE = re.compile(r"^[A-Za-z0-9.\-=^]{1,12}$")


def _parse_tradfi_symbol_list(raw, max_count=None):
    if not raw:
        return []
    out = []
    seen = set()
    for part in raw.split(","):
        sym = part.strip().upper()
        if not sym or sym in seen:
            continue
        if not _SYMBOL_RE.match(sym):
            continue
        seen.add(sym)
        out.append(sym)
        if max_count and len(out) >= max_count:
            break
    return out


def _quote_or_stub(symbol, quotes):
    if not symbol:
        return {
            "symbol": "",
            "name": "",
            "price": None,
            "change": None,
            "changePct": None,
            "currency": "USD",
            "marketState": "REGULAR",
            "previousClose": None,
        }
    q = quotes.get(symbol)
    if q:
        return q
    cached_name = _cached_symbol_name(symbol)
    return {
        "symbol": symbol,
        "name": cached_name or _symbol_label(symbol),
        "price": None,
        "change": None,
        "changePct": None,
        "currency": "USD",
        "marketState": "REGULAR",
        "previousClose": None,
    }


def _fetch_tradfi_section(section, heroes_override=None, symbols_override=None):
    cfg = TRADFI_SECTIONS.get(section)
    if not cfg:
        raise ValueError(f"Unknown TradFi section: {section}")

    hero_symbols = (
        list(heroes_override)
        if heroes_override is not None
        else list(cfg["heroes"])
    )
    table_symbols = (
        list(symbols_override)
        if symbols_override is not None
        else list(cfg["table"])
    )

    fetch_symbols = list(
        dict.fromkeys([s for s in hero_symbols + table_symbols if s])
    )
    quotes = fetch_yahoo_quotes(fetch_symbols) if fetch_symbols else {}

    heroes = []
    for sym in hero_symbols:
        if not sym:
            heroes.append(_quote_or_stub("", quotes))
            continue
        heroes.append(_quote_or_stub(sym, quotes))

    table = []
    for sym in table_symbols:
        if not sym:
            table.append(_quote_or_stub("", quotes))
            continue
        table.append(_quote_or_stub(sym, quotes))

    if section in ("stocks-companies", "stocks-indices"):
        _enrich_quote_rows(heroes + [row for row in table if row.get("symbol")])

    if section == "sectors":
        table.sort(
            key=lambda x: x.get("changePct") if x.get("changePct") is not None else 0,
            reverse=True,
        )
        heroes = table[:4] if len(table) >= 4 else heroes

    charts = None
    news = None
    if section in ("stocks-indices", "stocks-companies"):
        indices_custom = section == "stocks-indices" and (
            heroes_override is not None or symbols_override is not None
        )
        if section == "stocks-companies" or indices_custom:
            perf_symbols = _watchlist_chart_symbols(hero_symbols, table_symbols)
            chart_symbol_order = perf_symbols
        else:
            charts_cfg = cfg.get("charts") or [
                {"symbol": cfg["chart"], "label": cfg.get("chartLabel", cfg["chart"])}
            ]
            perf_symbols = list(
                dict.fromkeys(
                    [s for s in hero_symbols + table_symbols if s]
                    + [c["symbol"] for c in charts_cfg if c.get("symbol")]
                )
            )
            chart_symbol_order = [c["symbol"] for c in charts_cfg if c.get("symbol")]

        history = fetch_yfinance_history_batch(perf_symbols, period="2y")

        def _attach_perf(row):
            sym = row.get("symbol")
            if sym and sym in history:
                perf = _perf_from_closes(history[sym])
                if perf:
                    row["perf"] = perf
            return row

        heroes = [_attach_perf(row) for row in heroes]
        table = [_attach_perf(row) for row in table]

        charts = []
        for sym in chart_symbol_order:
            if not sym:
                continue
            if section == "stocks-indices" and not indices_custom:
                entry = next(
                    (c for c in charts_cfg if c.get("symbol") == sym),
                    {"symbol": sym},
                )
                label = entry.get("label") or _symbol_label(sym)
            else:
                label = _quote_label_from_rows(sym, heroes, table)
            closes = history.get(sym)
            if closes is None:
                chart_obj = fetch_yahoo_chart(sym)
                charts.append(chart_obj)
                continue
            charts.append(
                {
                    "symbol": sym,
                    "label": label,
                    "currency": "USD",
                    "points": _history_points_from_closes(closes, days=90),
                }
            )
        chart = charts[0] if charts else fetch_yahoo_chart(cfg["chart"])
        if section in ("stocks-companies", "stocks-indices"):
            news = _fetch_stock_news(perf_symbols)
    else:
        chart = fetch_yahoo_chart(cfg["chart"])

    payload = {
        "section": section,
        "title": cfg["title"],
        "priceMode": cfg.get("priceMode", "price"),
        "heroes": heroes,
        "table": table,
        "chart": chart,
        "chartLabel": cfg.get("chartLabel", cfg["chart"]),
        "source": "Yahoo Finance via yfinance",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    if charts is not None:
        payload["charts"] = charts
    if news is not None:
        payload["news"] = news
    return payload


def get_tradfi_payload(section, heroes_override=None, symbols_override=None):
    key = f"tradfi:{section}"
    if section in ("stocks-companies", "stocks-indices") and (
        heroes_override is not None or symbols_override is not None
    ):
        hero_key = ",".join(heroes_override or [])
        sym_key = ",".join(symbols_override or [])
        key = f"tradfi:{section}:heroes={hero_key}:symbols={sym_key}"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]
    data = _fetch_tradfi_section(section, heroes_override, symbols_override)
    _cache[key] = {"ts": now, "data": data}
    return data


MACRO_SECTIONS = {
    "rates": {
        "title": "Rates",
        "heroes": ["^TNX", "^FVX", "^IRX", "^TYX"],
        "table": ["TLT", "IEF", "SHY", "TIP", "AGG", "BND"],
        "chart": "^TNX",
        "chartLabel": "10-Year Treasury Yield",
        "priceMode": "yield",
    },
    "dollar": {
        "title": "US Dollar",
        "heroes": ["DX-Y.NYB", "EURUSD=X", "USDJPY=X", "GBPUSD=X"],
        "table": ["UUP", "FXE", "FXY", "USDCNH=X", "AUDUSD=X", "USDCHF=X"],
        "chart": "DX-Y.NYB",
        "chartLabel": "US Dollar Index (DXY)",
        "priceMode": "fx",
    },
    "liquidity": {
        "title": "Liquidity",
        "heroes": ["TLT", "HYG", "LQD", "^VIX"],
        "table": ["SHY", "IEF", "XLF", "SPY", "QQQ", "GLD"],
        "chart": "TLT",
        "chartLabel": "20+ Year Treasuries (TLT)",
        "priceMode": "price",
    },
    "risk": {
        "title": "Risk Sentiment",
        "heroes": ["^VIX", "^GSPC", "^IXIC", "HYG"],
        "table": ["SPY", "QQQ", "IWM", "XLK", "XLF", "TLT"],
        "chart": "^VIX",
        "chartLabel": "VIX Volatility Index",
        "priceMode": "price",
    },
    "inflation": {
        "title": "Inflation",
        "heroes": ["TIP", "GLD", "^TNX", "USO"],
        "table": ["VTIP", "SCHP", "DBC", "XLE", "CPER", "WEAT"],
        "chart": "TIP",
        "chartLabel": "TIPS ETF (TIP)",
        "priceMode": "price",
    },
    "commodities": {
        "title": "Commodities",
        "heroes": ["GC=F", "SI=F", "CL=F", "HG=F"],
        "table": ["GLD", "SLV", "USO", "UNG", "DBA", "PALL"],
        "chart": "GC=F",
        "chartLabel": "Gold Futures",
        "priceMode": "price",
    },
}


def _fetch_macro_section(section):
    cfg = MACRO_SECTIONS.get(section)
    if not cfg:
        raise ValueError(f"Unknown Macro section: {section}")

    symbols = list(dict.fromkeys(cfg["heroes"] + cfg["table"]))
    quotes = fetch_yahoo_quotes(symbols)

    heroes = []
    for sym in cfg["heroes"]:
        q = quotes.get(sym)
        if q:
            heroes.append(q)

    table = []
    for sym in cfg["table"]:
        q = quotes.get(sym)
        if q:
            table.append(q)

    chart = fetch_yahoo_chart(cfg["chart"])

    return {
        "section": section,
        "title": cfg["title"],
        "priceMode": cfg.get("priceMode", "price"),
        "heroes": heroes,
        "table": table,
        "chart": chart,
        "chartLabel": cfg.get("chartLabel", cfg["chart"]),
        "source": "Yahoo Finance via yfinance",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def get_macro_payload(section):
    key = f"macro:{section}"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]
    data = _fetch_macro_section(section)
    _cache[key] = {"ts": now, "data": data}
    return data


NEWS_FEEDS = [
    ("Bitcoin Magazine", "https://bitcoinmagazine.com/.rss/full/"),
    ("Cointelegraph", "https://cointelegraph.com/rss/tag/bitcoin"),
    ("Decrypt", "https://decrypt.co/feed"),
    ("Bitcoin.com", "https://news.bitcoin.com/feed/"),
]

NEWS_CATEGORIES = {
    "all": {
        "title": "All Headlines",
        "keywords": [],
    },
    "market": {
        "title": "Market",
        "keywords": [
            "price", "trading", "rally", "crash", "surge", "drop", "bull", "bear",
            "volatility", "liquidation", "support", "resistance", "correction",
            "ath", "all-time", "record high", "record low", "market cap",
        ],
    },
    "regulation": {
        "title": "Regulation",
        "keywords": [
            "sec", "regulation", "regulatory", "law", "legal", "ban", "policy",
            "congress", "senate", "court", "lawsuit", "compliance", "cftc",
            "treasury", "legislation", "bill", "hearing",
        ],
    },
    "institutions": {
        "title": "Institutions",
        "keywords": [
            "etf", "institutional", "microstrategy", "strategy", "blackrock",
            "fidelity", "grayscale", "corporate", "fund", "wall street", "bank",
            "public company", "ibit", "custody", "adoption",
        ],
    },
    "mining": {
        "title": "Mining",
        "keywords": [
            "mining", "miner", "hashrate", "hash rate", "halving", "difficulty",
            "asic", "energy", "electricity", "mara", "riot", "core scientific",
            "proof of work", "pow", "block reward", "hash power",
        ],
    },
    "technology": {
        "title": "Technology",
        "keywords": [
            "protocol", "upgrade", "lightning", "taproot", "ordinals", "layer 2",
            "l2", "node", "core", "development", "wallet", "privacy", "soft fork",
            "hard fork", "script", "segwit",
        ],
    },
    "onchain": {
        "title": "On-Chain",
        "keywords": [
            "defi", "on-chain", "onchain", "whale", "exchange flow", "stablecoin",
            "bridge", "wrapped", "staking", "mempool", "utxo", "inscription",
            "runes", "l2", "lightning network", "blockchain", "transfer",
            "wallet", "exchange", "flows", "supply",
        ],
    },
    "x": {
        "title": "X",
        "keywords": [],
    },
}

X_AUTHORS = [
    {
        "handle": "saylor",
        "name": "Michael Saylor",
        "role": "MicroStrategy · BTC treasury",
        "btcFocused": True,
    },
    {
        "handle": "lopp",
        "name": "Jameson Lopp",
        "role": "Casa · Bitcoin security",
        "btcFocused": True,
    },
    {
        "handle": "nic_carter",
        "name": "Nic Carter",
        "role": "Castle Island · Bitcoin research",
        "btcFocused": True,
    },
    {
        "handle": "DocumentingBTC",
        "name": "Documenting Bitcoin",
        "role": "BTC history & culture",
        "btcFocused": True,
    },
    {
        "handle": "BitcoinMagazine",
        "name": "Bitcoin Magazine",
        "role": "Bitcoin media",
        "btcFocused": True,
    },
    {
        "handle": "BitcoinArchives",
        "name": "Bitcoin Archives",
        "role": "Historical BTC content",
        "btcFocused": True,
    },
    {
        "handle": "tier10k",
        "name": "Tier10K",
        "role": "Crypto market wire",
        "btcFocused": True,
    },
    {
        "handle": "ericbalchunas",
        "name": "Eric Balchunas",
        "role": "Bloomberg · BTC ETF analyst",
        "btcFocused": False,
    },
    {
        "handle": "JSeyff",
        "name": "James Seyff",
        "role": "Bloomberg · ETF research",
        "btcFocused": False,
    },
    {
        "handle": "APompliano",
        "name": "Anthony Pompliano",
        "role": "Investor · macro & BTC",
        "btcFocused": False,
    },
    {
        "handle": "CryptoHayes",
        "name": "Arthur Hayes",
        "role": "BitMEX co-founder · macro",
        "btcFocused": False,
    },
    {
        "handle": "lookonchain",
        "name": "Lookonchain",
        "role": "On-chain intelligence",
        "btcFocused": False,
    },
]


def _strip_html(text):
    if not text:
        return ""
    clean = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", clean).strip()


def _parse_rss_date(value):
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None


def _parse_rss_feed(xml_text, source):
    items = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return items

    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_raw = (
            item.findtext("pubDate")
            or item.findtext("{http://purl.org/dc/elements/1.1/}date")
            or ""
        ).strip()
        summary = _strip_html(item.findtext("description") or "")[:320]
        if not title or not link:
            continue
        published = _parse_rss_date(pub_raw)
        items.append({
            "title": title,
            "link": link,
            "source": source,
            "summary": summary,
            "publishedAt": published.isoformat() if published else None,
            "publishedTs": published.timestamp() if published else 0,
        })
    return items


BTC_NEWS_KEYWORDS = [
    "bitcoin", "btc", "satoshi", "sats", "lightning", "halving",
    "microstrategy", "saylor", "etf", "wbtc", "cbbtc",
]

BTC_SENTIMENT_BULLISH_PHRASES = [
    "all-time high", "record high", "new high", "etf inflow", "etf flows",
    "etf approval", "spot etf", "institutional demand", "whale accumulation",
    "good entry", "support holds", "buy signal", "rate cut",
]

BTC_SENTIMENT_BEARISH_PHRASES = [
    "sell-off", "sell off", "all-time low", "record low", "new low",
    "etf outflow", "etf outflows", "death cross", "lower low",
    "rate hike", "hawkish fed", "exchange hack", "rug pull",
]

BTC_SENTIMENT_BULLISH_WORDS = [
    "surge", "surges", "surged", "rally", "rallies", "rallied", "soar", "soars",
    "jump", "jumps", "jumped", "climb", "climbs", "rise", "rises", "rose",
    "gain", "gains", "gained", "bullish", "breakout", "inflow", "inflows",
    "accumulation", "accumulate", "adoption", "approved", "approval",
    "greenlight", "buying", "bought", "purchase", "purchased", "rebound",
    "recovery", "outperform", "demand", "optimistic", "upgrade", "partnership",
    "undervalued", "uptrend", "uptick", "milestone", "halving", "scarcity",
    "accumulating", "hodl", "hodling",
]

BTC_SENTIMENT_BEARISH_WORDS = [
    "drop", "drops", "dropped", "fall", "falls", "fell", "plunge", "plunges",
    "crash", "crashes", "dump", "dumps", "selloff", "decline", "declines",
    "bearish", "liquidation", "liquidations", "outflow", "outflows", "ban",
    "banned", "crackdown", "hack", "hacked", "exploit", "fraud", "scam", "fud",
    "warning", "warns", "lawsuit", "sued", "subpoena", "seized", "collapse",
    "bankrupt", "bankruptcy", "default", "underperform", "fear", "concern",
    "concerns", "selling", "sold", "rejection", "rejected", "denied", "denial",
    "delay", "delayed", "investigation", "probe", "fine", "penalty",
    "restriction", "restrictions", "downtrend", "capitulation", "fails",
    "failure", "overvalued", "bubble", "correction", "tumble", "tumbles",
    "slump", "slumps", "weakness", "weak", "risk-off",
]


def _classify_btc_sentiment(title, summary=""):
    blob = f"{title or ''} {summary or ''}".lower()
    bull_score = 0
    bear_score = 0

    for phrase in BTC_SENTIMENT_BULLISH_PHRASES:
        if phrase in blob:
            bull_score += 2

    for phrase in BTC_SENTIMENT_BEARISH_PHRASES:
        if phrase in blob:
            bear_score += 2

    for word in BTC_SENTIMENT_BULLISH_WORDS:
        if re.search(rf"\b{re.escape(word)}\b", blob):
            bull_score += 1

    for word in BTC_SENTIMENT_BEARISH_WORDS:
        if re.search(rf"\b{re.escape(word)}\b", blob):
            bear_score += 1

    if bull_score > bear_score:
        return "bullish"
    if bear_score > bull_score:
        return "bearish"
    return "neutral"


def _sentiment_summary(articles):
    counts = {"bullish": 0, "bearish": 0, "neutral": 0}
    for art in articles:
        label = art.get("sentiment") or "neutral"
        counts[label] = counts.get(label, 0) + 1
    return counts


def _is_bitcoin_article(article):
    blob = f"{article.get('title', '')} {article.get('summary', '')}".lower()
    return any(kw in blob for kw in BTC_NEWS_KEYWORDS)


def fetch_rss_xml(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": BROWSER_UA,
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_x_rss_xml(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": X_RSS_USER_AGENT,
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _normalize_mirror_url(link):
    if not link:
        return link
    normalized = link.replace("twitter.com", "x.com")
    for host in NITTER_MIRROR_HOSTS:
        normalized = normalized.replace(host, "x.com")
    return normalized


def _is_valid_tweet_link(link):
    if not link:
        return False
    normalized = _normalize_mirror_url(link)
    if normalized.rstrip("/").endswith("/rss"):
        return False
    return "/status/" in normalized


def _clean_tweet_text(title):
    text = (title or "").strip()
    text = re.sub(r"^RT by @\w+:\s*", "", text)
    return _strip_html(text)


def _parse_nitter_feed(xml_text, author):
    tweets = []
    cleaned = (xml_text or "").strip()
    if "<?xml" in cleaned:
        cleaned = cleaned[cleaned.find("<?xml") :]
    try:
        root = ET.fromstring(cleaned)
    except ET.ParseError:
        return tweets

    handle = author["handle"]
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = _normalize_mirror_url((item.findtext("link") or "").strip())
        pub_raw = (item.findtext("pubDate") or "").strip()
        summary = _strip_html(item.findtext("description") or "")[:280]
        text = _clean_tweet_text(title) or summary
        if not text or not link or not _is_valid_tweet_link(link):
            continue
        published = _parse_rss_date(pub_raw)
        is_rt = title.lower().startswith("rt by @")
        tweets.append({
            "title": text[:280],
            "link": link,
            "source": f"@{handle}",
            "authorName": author.get("name"),
            "authorRole": author.get("role"),
            "summary": summary if summary != text else "",
            "publishedAt": published.isoformat() if published else None,
            "publishedTs": published.timestamp() if published else 0,
            "category": "x",
            "isTweet": True,
            "isRetweet": is_rt,
        })
    return tweets


def _fetch_author_tweets(author):
    for mirror in NITTER_MIRRORS:
        url = f"{mirror.rstrip('/')}/{author['handle']}/rss"
        try:
            xml_text = fetch_x_rss_xml(url)
            tweets = _parse_nitter_feed(xml_text, author)
            if tweets:
                return tweets, mirror
        except Exception:
            continue
    return [], None


def _fetch_x_tweets_live():
    seen = set()
    tweets = []
    mirror_used = None
    for index, author in enumerate(X_AUTHORS):
        author_tweets, mirror = _fetch_author_tweets(author)
        if mirror and not mirror_used:
            mirror_used = mirror
        for tweet in author_tweets:
            if not author.get("btcFocused") and not _is_bitcoin_article(tweet):
                continue
            link = tweet["link"]
            if link in seen:
                continue
            seen.add(link)
            tweets.append(tweet)
        if index < len(X_AUTHORS) - 1:
            time.sleep(0.25)

    tweets.sort(key=lambda t: t.get("publishedTs") or 0, reverse=True)
    mirror_host = urlparse(mirror_used).netloc if mirror_used else None
    return tweets, mirror_host


def _load_x_feed_cache():
    try:
        data = json.loads(X_FEED_CACHE_PATH.read_text(encoding="utf-8"))
        tweets = data.get("tweets") or []
        if tweets:
            return {
                "tweets": tweets,
                "fetchedAt": data.get("fetchedAt"),
                "source": data.get("source") or "cache",
            }
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        pass
    return None


def _format_cache_age(fetched_at_iso):
    if not fetched_at_iso:
        return None
    try:
        fetched = datetime.fromisoformat(fetched_at_iso.replace("Z", "+00:00"))
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        age_seconds = max(0, int(time.time() - fetched.timestamp()))
    except (TypeError, ValueError, OverflowError):
        return None

    if age_seconds < 3600:
        minutes = max(1, age_seconds // 60)
        return f"{minutes}m ago"
    if age_seconds < 86400:
        hours = max(1, age_seconds // 3600)
        return f"{hours}h ago"
    days = max(1, age_seconds // 86400)
    return f"{days}d ago"


def _x_feed_bundle(tweets, feed_mode, mirror_source=None, cache_fetched_at=None):
    return {
        "tweets": tweets,
        "feedMode": feed_mode,
        "mirrorSource": mirror_source,
        "cacheFetchedAt": cache_fetched_at,
        "cacheAge": _format_cache_age(cache_fetched_at),
    }


def _fetch_all_x_tweets():
    key = "news:x-tweets"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]

    stale_entry = _cache.get(f"{key}:stale")
    tweets, mirror_host = _fetch_x_tweets_live()
    if tweets:
        bundle = _x_feed_bundle(
            tweets,
            "live",
            mirror_source=mirror_host,
        )
        _cache[key] = {"ts": now, "data": bundle}
        _cache[f"{key}:stale"] = {"ts": now, "data": bundle}
        return bundle

    if stale_entry and now - stale_entry["ts"] < X_FEED_STALE_TTL:
        return stale_entry["data"]

    disk_cache = _load_x_feed_cache()
    if disk_cache:
        bundle = _x_feed_bundle(
            disk_cache["tweets"],
            "cached",
            mirror_source=disk_cache.get("source"),
            cache_fetched_at=disk_cache.get("fetchedAt"),
        )
        _cache[key] = {"ts": now, "data": bundle}
        return bundle

    bundle = _x_feed_bundle([], "empty")
    _cache[key] = {"ts": now, "data": bundle}
    return bundle


def write_x_feed_cache(tweets, mirror_source=None):
    if not tweets:
        return False

    X_FEED_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": mirror_source or NITTER_MIRRORS[0].replace("https://", ""),
        "tweets": tweets,
    }
    X_FEED_CACHE_PATH.write_text(
        json.dumps(payload, indent=2, default=str),
        encoding="utf-8",
    )
    return True


def _build_x_commentary(articles, feed_meta=None):
    lines = []
    feed_meta = feed_meta or {}
    if not articles:
        return [
            "No Bitcoin-related posts available from tracked X accounts. "
            "The Nitter RSS mirror may be temporarily unavailable.",
        ]

    if feed_meta.get("feedMode") == "cached":
        cache_age = feed_meta.get("cacheAge") or "recently"
        lines.append(
            f"Showing cached X posts (last refreshed {cache_age}). "
            "Live Nitter mirrors are unavailable from this server.",
        )

    lines.append(
        f"X wire: {len(articles)} BTC-relevant posts from "
        f"{len(X_AUTHORS)} curated accounts with established reputations "
        "in Bitcoin, ETFs, and on-chain research.",
    )

    authors = {}
    for art in articles:
        authors[art.get("source")] = authors.get(art.get("source"), 0) + 1
    top = sorted(authors.items(), key=lambda x: x[1], reverse=True)[:4]
    if top:
        lines.append(
            "Most active: "
            + " · ".join(f"{src} ({n})" for src, n in top)
            + ".",
        )

    counts = _sentiment_summary(articles)
    lines.append(
        f"BTC price sentiment: {counts['bullish']} bullish · "
        f"{counts['bearish']} bearish · {counts['neutral']} neutral.",
    )

    lead = articles[0]
    lines.append(
        f"Latest from {lead.get('authorName')} ({lead.get('source')}): "
        f"\"{_strip_html(lead.get('title', ''))[:120]}\".",
    )
    lines.append(
        "Posts are sourced via public RSS mirrors and filtered for Bitcoin relevance. "
        "Click through to read the full thread on X.",
    )
    return lines


def _fetch_x_section():
    cfg = NEWS_CATEGORIES["x"]
    feed_bundle = _fetch_all_x_tweets()
    all_tweets = feed_bundle.get("tweets") or []
    feed_mode = feed_bundle.get("feedMode") or "empty"
    articles = []
    for tweet in all_tweets[:25]:
        articles.append({
            "title": tweet.get("title"),
            "link": tweet.get("link"),
            "source": tweet.get("source"),
            "authorName": tweet.get("authorName"),
            "authorRole": tweet.get("authorRole"),
            "summary": tweet.get("summary"),
            "publishedAt": tweet.get("publishedAt"),
            "category": "x",
            "isTweet": True,
            "isRetweet": tweet.get("isRetweet"),
            "sentiment": _classify_btc_sentiment(
                tweet.get("title"), tweet.get("summary")
            ),
        })

    authors = {}
    for art in articles:
        authors[art.get("source")] = authors.get(art.get("source"), 0) + 1
    top_author = max(authors.items(), key=lambda x: x[1])[0] if authors else "—"

    heroes = [
        {"name": "Posts", "value": len(articles), "sub": "BTC-filtered"},
        {"name": "Authors", "value": len(X_AUTHORS), "sub": "Curated voices"},
        {"name": "Top Voice", "value": top_author, "sub": f"{authors.get(top_author, 0)} posts"},
    ]
    if articles:
        heroes.append({
            "name": articles[0].get("authorName") or "Latest",
            "value": articles[0].get("source"),
            "sub": _strip_html(articles[0].get("title", ""))[:72],
        })

    if feed_mode == "cached":
        source = "X cached snapshot · curated BTC accounts"
    elif feed_mode == "live":
        mirror = feed_bundle.get("mirrorSource") or "Nitter RSS"
        source = f"X via {mirror} · curated BTC accounts"
    else:
        source = "X via Nitter RSS · curated BTC accounts"

    return {
        "section": "x",
        "title": cfg["title"],
        "heroes": heroes[:4],
        "articles": articles,
        "commentary": _build_x_commentary(articles, feed_bundle),
        "authors": [
            {"handle": a["handle"], "name": a["name"], "role": a["role"]}
            for a in X_AUTHORS
        ],
        "feeds": [f"@{a['handle']}" for a in X_AUTHORS],
        "source": source,
        "feedMode": feed_mode,
        "cacheAge": feed_bundle.get("cacheAge"),
        "cacheFetchedAt": feed_bundle.get("cacheFetchedAt"),
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _classify_news_article(article):
    blob = f"{article.get('title', '')} {article.get('summary', '')}".lower()
    best_cat = "market"
    best_score = 0
    for cat, cfg in NEWS_CATEGORIES.items():
        if cat in {"all", "x"}:
            continue
        score = sum(1 for kw in cfg["keywords"] if kw in blob)
        if score > best_score:
            best_score = score
            best_cat = cat
    return best_cat


def _fetch_all_news_articles():
    key = "news:all-articles"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]

    seen = set()
    articles = []
    for source, url in NEWS_FEEDS:
        try:
            xml_text = fetch_html(url)
        except Exception:
            continue
        for item in _parse_rss_feed(xml_text, source):
            if not _is_bitcoin_article(item):
                continue
            link = item["link"]
            if link in seen:
                continue
            seen.add(link)
            item["category"] = _classify_news_article(item)
            articles.append(item)

    articles.sort(key=lambda a: a.get("publishedTs") or 0, reverse=True)
    _cache[key] = {"ts": now, "data": articles}
    return articles


def _build_news_commentary(section, articles, cfg):
    lines = []
    if not articles:
        return ["No headlines available for this category."]

    lead = articles[0]
    lines.append(
        f"{cfg['title']}: {len(articles)} Bitcoin-related stories in the feed. "
        f"Latest from {lead.get('source')}: \"{lead.get('title')}\".",
    )

    sources = {}
    for art in articles:
        sources[art.get("source")] = sources.get(art.get("source"), 0) + 1
    top_sources = sorted(sources.items(), key=lambda x: x[1], reverse=True)[:3]
    if top_sources:
        lines.append(
            "Top sources: "
            + " · ".join(f"{name} ({count})" for name, count in top_sources)
            + ".",
        )

    counts = _sentiment_summary(articles)
    lines.append(
        f"BTC price sentiment: {counts['bullish']} bullish · "
        f"{counts['bearish']} bearish · {counts['neutral']} neutral.",
    )

    if section == "regulation":
        lines.append(
            "Regulatory headlines often move BTC risk premia — watch for SEC, "
            "CFTC, and congressional actions affecting custody and spot products.",
        )
    elif section == "institutions":
        lines.append(
            "Institutional flow narratives (ETFs, treasury companies) correlate "
            "with medium-term BTC demand and exchange supply dynamics.",
        )
    elif section == "mining":
        lines.append(
            "Mining news affects hash rate, security budget, and energy policy "
            "debates — relevant for long-horizon supply and network health.",
        )
    elif section == "onchain":
        lines.append(
            "On-chain and DeFi headlines flag whale activity, bridge flows, and "
            "infrastructure shifts that can front-run spot moves.",
        )
    elif section == "market":
        lines.append(
            "Market wires focus on price action, liquidations, and positioning — "
            "useful for near-term volatility and sentiment context.",
        )
    elif section == "technology":
        lines.append(
            "Protocol and wallet upgrades shape Bitcoin's utility layer — "
            "Lightning, ordinals, and core releases affect the L1/L2 stack.",
        )

    return lines


def _fetch_news_section(section):
    cfg = NEWS_CATEGORIES.get(section)
    if not cfg:
        raise ValueError(f"Unknown News section: {section}")

    if section == "x":
        return _fetch_x_section()

    all_articles = _fetch_all_news_articles()
    if section == "all":
        filtered = all_articles
    else:
        filtered = [a for a in all_articles if a.get("category") == section]

    articles = []
    for art in filtered[:25]:
        articles.append({
            "title": art.get("title"),
            "link": art.get("link"),
            "source": art.get("source"),
            "summary": art.get("summary"),
            "publishedAt": art.get("publishedAt"),
            "category": art.get("category"),
            "sentiment": _classify_btc_sentiment(
                art.get("title"), art.get("summary")
            ),
        })

    sources = {}
    for art in articles:
        sources[art.get("source")] = sources.get(art.get("source"), 0) + 1
    top_source = max(sources.items(), key=lambda x: x[1])[0] if sources else "—"

    heroes = [
        {
            "name": "Stories",
            "value": len(articles),
            "sub": cfg["title"],
        },
        {
            "name": "Top Source",
            "value": top_source,
            "sub": f"{sources.get(top_source, 0)} in feed" if sources else "",
        },
    ]
    if articles:
        heroes.append({
            "name": "Latest",
            "value": articles[0].get("source"),
            "sub": _strip_html(articles[0].get("title", ""))[:72],
        })
    if len(articles) >= 2:
        heroes.append({
            "name": "Prior",
            "value": articles[1].get("source"),
            "sub": _strip_html(articles[1].get("title", ""))[:72],
        })

    return {
        "section": section,
        "title": cfg["title"],
        "heroes": heroes[:4],
        "articles": articles,
        "commentary": _build_news_commentary(section, articles, cfg),
        "feeds": [name for name, _ in NEWS_FEEDS],
        "source": "RSS · Bitcoin Magazine · Cointelegraph · Decrypt · Bitcoin.com",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def get_news_payload(section):
    key = f"news:{section}"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]
    data = _fetch_news_section(section)
    _cache[key] = {"ts": now, "data": data}
    return data


DEFILLAMA_API = "https://api.llama.fi"
STABLECOINS_API = "https://stablecoins.llama.fi"
COINS_API = "https://coins.llama.fi"
YIELDS_API = "https://yields.llama.fi"
WRAPPED_BTC_SLUGS = [
    "wbtc",
    "coinbase-bridge",
    "function-fbtc",
    "lombard-lbtc",
    "solvbtc",
    "lorenzo-enzobtc",
    "tbtc",
    "bedrock-unibtc",
    "stacks-sbtc",
    "lombard-btc.b",
    "gtbtc",
]

BRIDGE_BTC_SLUGS = [
    "wbtc",
    "coinbase-bridge",
    "function-fbtc",
    "solvbtc",
    "lorenzo-enzobtc",
    "lombard-lbtc",
    "tbtc",
    "stacks-sbtc",
    "lombard-btc.b",
    "bedrock-unibtc",
    "nexo-btc",
    "exsat-staking-btc",
]

STAKING_BTC_SLUGS = [
    "babylon-protocol",
    "lombard-lbtc",
    "lorenzo-enzobtc",
    "bedrock-unibtc",
    "solvbtc",
    "function-fbtc",
    "gtbtc",
    "solvbtc-lsts",
    "lombard-vaults",
]

BTC_BRIDGE_CATEGORIES = {
    "Bridge",
    "Decentralized BTC",
    "Restaked BTC",
    "Anchor BTC",
}

WRAPPED_BTC_PRICES = {
    "BTC": "coingecko:bitcoin",
    "WBTC": "ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    "cbBTC": "base:0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    "tBTC": "ethereum:0x18084fba233a19d1c4999ca9f9d64e9e4f61e4ec",
}


def fetch_json(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


EXCHANGES_CATEGORIES = {
    "overview": {"title": "Overview"},
    "spot": {"title": "Spot"},
    "perp": {"title": "Perp"},
    "volume": {"title": "Volume"},
}


def _ex_float(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _ex_pct_change(price, open_price):
    if price is None or open_price in (None, 0):
        return None
    return (price - open_price) / open_price * 100


def _fetch_binance_spot():
    data = fetch_json(
        "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"
    )
    price = _ex_float(data.get("lastPrice"))
    open_p = _ex_float(data.get("openPrice"))
    return {
        "exchange": "Binance",
        "pair": "BTC/USDT",
        "type": "spot",
        "price": price,
        "changePct": _ex_float(data.get("priceChangePercent")) or _ex_pct_change(price, open_p),
        "volume": _ex_float(data.get("quoteVolume")),
        "bid": _ex_float(data.get("bidPrice")),
        "ask": _ex_float(data.get("askPrice")),
        "high": _ex_float(data.get("highPrice")),
        "low": _ex_float(data.get("lowPrice")),
    }


def _fetch_binance_perp():
    prem = fetch_json(
        "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT"
    )
    ticker = fetch_json(
        "https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT"
    )
    mark = _ex_float(prem.get("markPrice"))
    index = _ex_float(prem.get("indexPrice"))
    price = mark or _ex_float(ticker.get("lastPrice"))
    open_p = _ex_float(ticker.get("openPrice"))
    basis = (mark - index) if mark is not None and index is not None else None
    basis_pct = (basis / index * 100) if basis is not None and index else None
    return {
        "exchange": "Binance",
        "pair": "BTC/USDT Perp",
        "type": "perp",
        "price": price,
        "mark": mark,
        "index": index,
        "basisPct": basis_pct,
        "changePct": _ex_float(ticker.get("priceChangePercent")) or _ex_pct_change(price, open_p),
        "volume": _ex_float(ticker.get("quoteVolume")),
        "fundingRate": _ex_float(prem.get("lastFundingRate")),
        "nextFundingTime": prem.get("nextFundingTime"),
    }


def _fetch_coinbase_spot():
    ticker = fetch_json(
        "https://api.exchange.coinbase.com/products/BTC-USD/ticker"
    )
    stats = fetch_json(
        "https://api.exchange.coinbase.com/products/BTC-USD/stats"
    )
    price = _ex_float(ticker.get("price"))
    open_p = _ex_float(stats.get("open"))
    vol = _ex_float(stats.get("volume"))
    return {
        "exchange": "Coinbase",
        "pair": "BTC/USD",
        "type": "spot",
        "price": price,
        "changePct": _ex_pct_change(price, open_p),
        "volume": vol * price if vol and price else None,
        "bid": _ex_float(ticker.get("bid")),
        "ask": _ex_float(ticker.get("ask")),
        "high": _ex_float(stats.get("high")),
        "low": _ex_float(stats.get("low")),
    }


def _fetch_kraken_spot():
    data = fetch_json(
        "https://api.kraken.com/0/public/Ticker?pair=XBTUSD"
    )
    result = data.get("result") or {}
    if not result:
        return None
    key = next(iter(result))
    t = result[key]
    price = _ex_float(t.get("c", [None])[0])
    open_p = _ex_float(t.get("o"))
    high = _ex_float(t.get("h", [None])[0])
    low = _ex_float(t.get("l", [None])[0])
    vol = _ex_float(t.get("v", [None, None])[1])
    return {
        "exchange": "Kraken",
        "pair": "BTC/USD",
        "type": "spot",
        "price": price,
        "changePct": _ex_pct_change(price, open_p),
        "volume": vol * price if vol and price else None,
        "bid": _ex_float(t.get("b", [None])[0]),
        "ask": _ex_float(t.get("a", [None])[0]),
        "high": high,
        "low": low,
    }


def _fetch_okx_spot():
    data = fetch_json(
        "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"
    )
    rows = data.get("data") or []
    if not rows:
        return None
    t = rows[0]
    price = _ex_float(t.get("last"))
    open_p = _ex_float(t.get("open24h"))
    return {
        "exchange": "OKX",
        "pair": "BTC/USDT",
        "type": "spot",
        "price": price,
        "changePct": _ex_pct_change(price, open_p),
        "volume": _ex_float(t.get("volCcy24h")),
        "bid": _ex_float(t.get("bidPx")),
        "ask": _ex_float(t.get("askPx")),
        "high": _ex_float(t.get("high24h")),
        "low": _ex_float(t.get("low24h")),
    }


def _fetch_okx_perp():
    ticker_data = fetch_json(
        "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP"
    )
    fund_data = fetch_json(
        "https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP"
    )
    mark_data = fetch_json(
        "https://www.okx.com/api/v5/public/mark-price?instId=BTC-USDT-SWAP"
    )
    index_data = fetch_json(
        "https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USDT"
    )
    rows = ticker_data.get("data") or []
    if not rows:
        return None
    t = rows[0]
    mark_rows = mark_data.get("data") or []
    index_rows = index_data.get("data") or []
    mark = _ex_float(mark_rows[0].get("markPx")) if mark_rows else None
    index = _ex_float(index_rows[0].get("idxPx")) if index_rows else None
    price = mark or _ex_float(t.get("last"))
    open_p = _ex_float(t.get("open24h"))
    basis_pct = None
    if price is not None and index:
        basis_pct = (price - index) / index * 100
    funding = None
    fund_rows = fund_data.get("data") or []
    if fund_rows:
        funding = _ex_float(fund_rows[0].get("fundingRate"))
    return {
        "exchange": "OKX",
        "pair": "BTC/USDT Swap",
        "type": "perp",
        "price": price,
        "index": index,
        "basisPct": basis_pct,
        "changePct": _ex_pct_change(price, open_p),
        "volume": _ex_float(t.get("volCcy24h")),
        "fundingRate": funding,
    }


def _fetch_bybit_spot():
    data = fetch_json(
        "https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT"
    )
    rows = (data.get("result") or {}).get("list") or []
    if not rows:
        return None
    t = rows[0]
    price = _ex_float(t.get("lastPrice"))
    open_p = _ex_float(t.get("prevPrice24h"))
    return {
        "exchange": "Bybit",
        "pair": "BTC/USDT",
        "type": "spot",
        "price": price,
        "changePct": _ex_pct_change(price, open_p),
        "volume": _ex_float(t.get("turnover24h")),
        "bid": _ex_float(t.get("bid1Price")),
        "ask": _ex_float(t.get("ask1Price")),
        "high": _ex_float(t.get("highPrice24h")),
        "low": _ex_float(t.get("lowPrice24h")),
    }


def _fetch_bybit_perp():
    data = fetch_json(
        "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT"
    )
    rows = (data.get("result") or {}).get("list") or []
    if not rows:
        return None
    t = rows[0]
    price = _ex_float(t.get("markPrice")) or _ex_float(t.get("lastPrice"))
    index = _ex_float(t.get("indexPrice"))
    open_p = _ex_float(t.get("prevPrice24h"))
    basis_pct = None
    if price is not None and index:
        basis_pct = (price - index) / index * 100
    return {
        "exchange": "Bybit",
        "pair": "BTC/USDT Perp",
        "type": "perp",
        "price": price,
        "index": index,
        "basisPct": basis_pct,
        "changePct": _ex_pct_change(price, open_p),
        "volume": _ex_float(t.get("turnover24h")),
        "fundingRate": _ex_float(t.get("fundingRate")),
    }


def _fetch_bitfinex_spot():
    data = fetch_json("https://api-pub.bitfinex.com/v2/ticker/tBTCUSD")
    if not isinstance(data, list) or len(data) < 10:
        return None
    price = _ex_float(data[6])
    open_p = price - _ex_float(data[4]) if price is not None else None
    vol_btc = _ex_float(data[7])
    return {
        "exchange": "Bitfinex",
        "pair": "BTC/USD",
        "type": "spot",
        "price": price,
        "changePct": _ex_float(data[5]) * 100 if data[5] is not None else _ex_pct_change(price, open_p),
        "volume": vol_btc * price if vol_btc and price else None,
        "bid": _ex_float(data[0]),
        "ask": _ex_float(data[2]),
        "high": _ex_float(data[8]),
        "low": _ex_float(data[9]),
    }


def _fetch_kucoin_spot():
    data = fetch_json("https://api.kucoin.com/api/v1/market/stats?symbol=BTC-USDT")
    row = data.get("data") or {}
    price = _ex_float(row.get("last"))
    change = _ex_float(row.get("changeRate"))
    return {
        "exchange": "KuCoin",
        "pair": "BTC/USDT",
        "type": "spot",
        "price": price,
        "changePct": change * 100 if change is not None else None,
        "volume": _ex_float(row.get("volValue")),
        "bid": _ex_float(row.get("buy")),
        "ask": _ex_float(row.get("sell")),
        "high": _ex_float(row.get("high")),
        "low": _ex_float(row.get("low")),
    }


def _fetch_htx_spot():
    data = fetch_json("https://api.huobi.pro/market/detail/merged?symbol=btcusdt")
    tick = data.get("tick") or {}
    price = _ex_float(tick.get("close"))
    open_p = _ex_float(tick.get("open"))
    bid = tick.get("bid")
    ask = tick.get("ask")
    return {
        "exchange": "HTX",
        "pair": "BTC/USDT",
        "type": "spot",
        "price": price,
        "changePct": _ex_pct_change(price, open_p),
        "volume": _ex_float(tick.get("amount")),
        "bid": _ex_float(bid[0] if isinstance(bid, list) else bid),
        "ask": _ex_float(ask[0] if isinstance(ask, list) else ask),
        "high": _ex_float(tick.get("high")),
        "low": _ex_float(tick.get("low")),
    }


def _fetch_gemini_spot():
    pub = fetch_json("https://api.gemini.com/v1/pubticker/btcusd")
    price = _ex_float(pub.get("last"))
    open_p = None
    high = None
    low = None

    try:
        ticker = fetch_json("https://api.gemini.com/v2/ticker/btcusd")
        price = _ex_float(ticker.get("close")) or price
        open_p = _ex_float(ticker.get("open"))
        high = _ex_float(ticker.get("high"))
        low = _ex_float(ticker.get("low"))
    except Exception:
        pass

    if open_p is None or high is None or low is None:
        try:
            candles = fetch_json("https://api.gemini.com/v2/candles/btcusd/1day")
            if candles:
                day = candles[0]
                if open_p is None:
                    open_p = _ex_float(day[1])
                if high is None:
                    high = _ex_float(day[2])
                if low is None:
                    low = _ex_float(day[3])
                if price is None:
                    price = _ex_float(day[4])
        except Exception:
            pass

    vol = pub.get("volume") or {}
    quote_vol = _ex_float(vol.get("USD"))
    if quote_vol is None:
        vol_btc = _ex_float(vol.get("BTC"))
        if vol_btc and price:
            quote_vol = vol_btc * price

    return {
        "exchange": "Gemini",
        "pair": "BTC/USD",
        "type": "spot",
        "price": price,
        "changePct": _ex_pct_change(price, open_p),
        "volume": quote_vol,
        "bid": _ex_float(pub.get("bid")),
        "ask": _ex_float(pub.get("ask")),
        "high": high,
        "low": low,
    }


def _fetch_bitstamp_spot():
    data = fetch_json("https://www.bitstamp.net/api/v2/ticker/btcusd/")
    price = _ex_float(data.get("last"))
    open_p = _ex_float(data.get("open"))
    vol_btc = _ex_float(data.get("volume"))
    return {
        "exchange": "Bitstamp",
        "pair": "BTC/USD",
        "type": "spot",
        "price": price,
        "changePct": _ex_pct_change(price, open_p),
        "volume": vol_btc * price if vol_btc and price else None,
        "bid": _ex_float(data.get("bid")),
        "ask": _ex_float(data.get("ask")),
        "high": _ex_float(data.get("high")),
        "low": _ex_float(data.get("low")),
    }


def _fetch_bitget_spot():
    data = fetch_json(
        "https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT"
    )
    rows = data.get("data") or []
    if not rows:
        return None
    t = rows[0]
    price = _ex_float(t.get("lastPr"))
    open_p = _ex_float(t.get("open"))
    change = _ex_float(t.get("change24h"))
    return {
        "exchange": "Bitget",
        "pair": "BTC/USDT",
        "type": "spot",
        "price": price,
        "changePct": change * 100 if change is not None else _ex_pct_change(price, open_p),
        "volume": _ex_float(t.get("quoteVolume")),
        "bid": _ex_float(t.get("bidPr")),
        "ask": _ex_float(t.get("askPr")),
        "high": _ex_float(t.get("high24h")),
        "low": _ex_float(t.get("low24h")),
    }


def _fetch_mexc_spot():
    data = fetch_json("https://api.mexc.com/api/v3/ticker/24hr?symbol=BTCUSDT")
    price = _ex_float(data.get("lastPrice"))
    open_p = _ex_float(data.get("prevClosePrice"))
    return {
        "exchange": "MEXC",
        "pair": "BTC/USDT",
        "type": "spot",
        "price": price,
        "changePct": _ex_float(data.get("priceChangePercent")) or _ex_pct_change(price, open_p),
        "volume": _ex_float(data.get("quoteVolume")),
        "bid": _ex_float(data.get("bidPrice")),
        "ask": _ex_float(data.get("askPrice")),
        "high": _ex_float(data.get("highPrice")),
        "low": _ex_float(data.get("lowPrice")),
    }


def _fetch_cryptocom_spot():
    data = fetch_json(
        "https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name=BTC_USDT"
    )
    rows = (data.get("result") or {}).get("data") or []
    if not rows:
        return None
    t = rows[0]
    price = _ex_float(t.get("a"))
    change = _ex_float(t.get("c"))
    return {
        "exchange": "Crypto.com",
        "pair": "BTC/USDT",
        "type": "spot",
        "price": price,
        "changePct": change * 100 if change is not None else None,
        "volume": _ex_float(t.get("vv")),
        "bid": _ex_float(t.get("b")),
        "ask": _ex_float(t.get("k")),
        "high": _ex_float(t.get("h")),
        "low": _ex_float(t.get("l")),
    }


def _fetch_gate_spot():
    data = fetch_json(
        "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT"
    )
    if isinstance(data, list):
        rows = data
    else:
        rows = [data] if data else []
    if not rows:
        return None
    t = rows[0]
    price = _ex_float(t.get("last"))
    change = _ex_float(t.get("change_percentage"))
    return {
        "exchange": "Gate.io",
        "pair": "BTC/USDT",
        "type": "spot",
        "price": price,
        "changePct": change,
        "volume": _ex_float(t.get("quote_volume")),
        "bid": _ex_float(t.get("highest_bid")),
        "ask": _ex_float(t.get("lowest_ask")),
        "high": _ex_float(t.get("high_24h")),
        "low": _ex_float(t.get("low_24h")),
    }


def _fetch_kucoin_perp():
    contract = fetch_json(
        "https://api-futures.kucoin.com/api/v1/contracts/XBTUSDTM"
    )
    c = contract.get("data") or {}
    price = _ex_float(c.get("markPrice")) or _ex_float(c.get("lastTradePrice"))
    index = _ex_float(c.get("indexPrice"))
    change = _ex_float(c.get("priceChgPct"))
    funding = _ex_float(c.get("fundingFeeRate"))
    basis_pct = None
    if price is not None and index:
        basis_pct = (price - index) / index * 100
    return {
        "exchange": "KuCoin",
        "pair": "BTC/USDT Perp",
        "type": "perp",
        "price": price,
        "index": index,
        "basisPct": basis_pct,
        "changePct": change * 100 if change is not None else None,
        "volume": _ex_float(c.get("turnoverOf24h")),
        "fundingRate": funding,
    }


def _fetch_htx_perp():
    data = fetch_json(
        "https://api.hbdm.com/linear-swap-ex/market/detail/batch_merged?contract_code=BTC-USDT"
    )
    funding_data = fetch_json(
        "https://api.hbdm.com/linear-swap-api/v1/swap_funding_rate?contract_code=BTC-USDT"
    )
    index_data = fetch_json(
        "https://api.hbdm.com/linear-swap-api/v1/swap_index?contract_code=BTC-USDT"
    )
    ticks = data.get("ticks") or []
    if not ticks:
        return None
    t = ticks[0]
    price = _ex_float(t.get("close"))
    open_p = _ex_float(t.get("open"))
    index_rows = index_data.get("data") or []
    index = _ex_float(index_rows[0].get("index_price")) if index_rows else None
    basis_pct = None
    if price is not None and index:
        basis_pct = (price - index) / index * 100
    funding = _ex_float((funding_data.get("data") or {}).get("funding_rate"))
    return {
        "exchange": "HTX",
        "pair": "BTC/USDT Perp",
        "type": "perp",
        "price": price,
        "index": index,
        "basisPct": basis_pct,
        "changePct": _ex_pct_change(price, open_p),
        "volume": _ex_float(t.get("trade_turnover")),
        "fundingRate": funding,
    }


def _fetch_bitget_perp():
    data = fetch_json(
        "https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES"
    )
    rows = data.get("data") or []
    if not rows:
        return None
    t = rows[0]
    price = _ex_float(t.get("markPrice")) or _ex_float(t.get("lastPr"))
    index = _ex_float(t.get("indexPrice"))
    open_p = _ex_float(t.get("open24h"))
    change = _ex_float(t.get("change24h"))
    basis_pct = None
    if price is not None and index:
        basis_pct = (price - index) / index * 100
    return {
        "exchange": "Bitget",
        "pair": "BTC/USDT Perp",
        "type": "perp",
        "price": price,
        "index": index,
        "basisPct": basis_pct,
        "changePct": change * 100 if change is not None else _ex_pct_change(price, open_p),
        "volume": _ex_float(t.get("quoteVolume")),
        "fundingRate": _ex_float(t.get("fundingRate")),
    }


def _fetch_deribit_perp():
    data = fetch_json(
        "https://www.deribit.com/api/v2/public/ticker?instrument_name=BTC-PERPETUAL"
    )
    result = data.get("result") or {}
    stats = result.get("stats") or {}
    price = _ex_float(result.get("mark_price")) or _ex_float(result.get("last_price"))
    index = _ex_float(result.get("index_price"))
    basis_pct = None
    if price is not None and index:
        basis_pct = (price - index) / index * 100
    funding = _ex_float(result.get("current_funding"))
    if funding is None:
        funding = _ex_float(result.get("funding_8h"))
    return {
        "exchange": "Deribit",
        "pair": "BTC Perp",
        "type": "perp",
        "price": price,
        "index": index,
        "basisPct": basis_pct,
        "changePct": _ex_float(stats.get("price_change")),
        "volume": _ex_float(stats.get("volume_usd")),
        "fundingRate": funding,
    }


def _fetch_mexc_perp():
    data = fetch_json("https://contract.mexc.com/api/v1/contract/ticker?symbol=BTC_USDT")
    row = data.get("data") or {}
    if not row:
        return None
    price = _ex_float(row.get("fairPrice")) or _ex_float(row.get("lastPrice"))
    index = _ex_float(row.get("indexPrice"))
    basis_pct = None
    if price is not None and index:
        basis_pct = (price - index) / index * 100
    change = _ex_float(row.get("riseFallRate"))
    return {
        "exchange": "MEXC",
        "pair": "BTC/USDT Perp",
        "type": "perp",
        "price": price,
        "index": index,
        "basisPct": basis_pct,
        "changePct": change * 100 if change is not None else None,
        "volume": _ex_float(row.get("amount24")),
        "fundingRate": _ex_float(row.get("fundingRate")),
    }


def _fetch_gate_perp():
    data = fetch_json(
        "https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=BTC_USDT"
    )
    if isinstance(data, list):
        rows = data
    else:
        rows = [data] if data else []
    if not rows:
        return None
    t = rows[0]
    price = _ex_float(t.get("mark_price")) or _ex_float(t.get("last"))
    index = _ex_float(t.get("index_price"))
    basis_pct = None
    if price is not None and index:
        basis_pct = (price - index) / index * 100
    return {
        "exchange": "Gate.io",
        "pair": "BTC/USDT Perp",
        "type": "perp",
        "price": price,
        "index": index,
        "basisPct": basis_pct,
        "changePct": _ex_float(t.get("change_percentage")),
        "volume": _ex_float(t.get("volume_24h_quote")),
        "fundingRate": _ex_float(t.get("funding_rate")),
    }


def _fetch_all_exchange_data():
    key = "exchanges:raw:v2"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]

    spot_fetchers = [
        _fetch_binance_spot,
        _fetch_coinbase_spot,
        _fetch_kraken_spot,
        _fetch_okx_spot,
        _fetch_bybit_spot,
        _fetch_bitfinex_spot,
        _fetch_kucoin_spot,
        _fetch_htx_spot,
        _fetch_gemini_spot,
        _fetch_bitstamp_spot,
        _fetch_bitget_spot,
        _fetch_mexc_spot,
        _fetch_cryptocom_spot,
        _fetch_gate_spot,
    ]
    perp_fetchers = [
        _fetch_binance_perp,
        _fetch_okx_perp,
        _fetch_bybit_perp,
        _fetch_kucoin_perp,
        _fetch_htx_perp,
        _fetch_bitget_perp,
        _fetch_deribit_perp,
        _fetch_mexc_perp,
        _fetch_gate_perp,
    ]

    spot = []
    perp = []
    errors = []

    for fn in spot_fetchers:
        try:
            row = fn()
            if row and row.get("price") is not None:
                spot.append(row)
        except Exception as exc:
            errors.append(f"{fn.__name__}: {exc}")

    for fn in perp_fetchers:
        try:
            row = fn()
            if row and row.get("price") is not None:
                perp.append(row)
        except Exception as exc:
            errors.append(f"{fn.__name__}: {exc}")

    data = {"spot": spot, "perp": perp, "errors": errors}
    _cache[key] = {"ts": now, "data": data}
    return data


def _fmt_usd(n):
    if n is None:
        return "—"
    if n >= 1e9:
        return f"${n / 1e9:.2f}B"
    if n >= 1e6:
        return f"${n / 1e6:.2f}M"
    if n >= 1e3:
        return f"${n / 1e3:.1f}K"
    return f"${n:,.0f}"


def _median(values):
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    mid = len(vals) // 2
    if len(vals) % 2:
        return vals[mid]
    return (vals[mid - 1] + vals[mid]) / 2


def _build_exchanges_chart(section, table):
    if not table:
        return {"title": "No data", "signed": False, "items": []}

    if section == "overview":
        rows = sorted(
            [r for r in table if r.get("spreadVsMedian") is not None],
            key=lambda x: abs(x["spreadVsMedian"]),
            reverse=True,
        )[:10]
        return {
            "title": "Price vs Median",
            "signed": True,
            "items": [
                {
                    "label": r.get("exchange"),
                    "value": r.get("spreadVsMedian"),
                    "display": f"{r.get('spreadVsMedian'):+.2f}%",
                }
                for r in rows
            ],
        }

    if section == "spot":
        rows = sorted(table, key=lambda x: x.get("volume") or 0, reverse=True)[:10]
        return {
            "title": "Spot 24h Volume",
            "signed": False,
            "items": [
                {
                    "label": r.get("exchange"),
                    "value": r.get("volume") or 0,
                    "display": _fmt_usd(r.get("volume")),
                }
                for r in rows
            ],
        }

    if section == "perp":
        rows = sorted(
            [r for r in table if r.get("fundingPct") is not None],
            key=lambda x: abs(x.get("fundingPct") or 0),
            reverse=True,
        )[:8]
        return {
            "title": "Funding Rates",
            "signed": True,
            "items": [
                {
                    "label": r.get("exchange"),
                    "value": r.get("fundingPct"),
                    "display": f"{r.get('fundingPct'):+.4f}%",
                }
                for r in rows
            ],
        }

    rows = sorted(table, key=lambda x: x.get("sharePct") or 0, reverse=True)[:10]
    return {
        "title": "Volume Share",
        "signed": False,
        "items": [
            {
                "label": f"{r.get('exchange')} {r.get('market', '')}".strip(),
                "value": r.get("sharePct") or 0,
                "display": f"{r.get('sharePct'):.1f}%" if r.get("sharePct") is not None else "—",
            }
            for r in rows
        ],
    }


def _build_exchanges_overview(spot, perp, errors):
    prices = [r["price"] for r in spot if r.get("price") is not None]
    med = _median(prices)
    high_row = max(spot, key=lambda r: r.get("price") or 0) if spot else None
    low_row = min(spot, key=lambda r: r.get("price") or float("inf")) if spot else None
    spread = None
    if high_row and low_row and high_row.get("price") and low_row.get("price"):
        spread = high_row["price"] - low_row["price"]
    total_vol = sum(r.get("volume") or 0 for r in spot)

    table = []
    for r in sorted(spot, key=lambda x: x.get("price") or 0, reverse=True):
        dist = None
        if med and r.get("price") is not None:
            dist = (r["price"] - med) / med * 100
        table.append({
            "exchange": r.get("exchange"),
            "pair": r.get("pair"),
            "price": r.get("price"),
            "changePct": r.get("changePct"),
            "volume": r.get("volume"),
            "spreadVsMedian": dist,
            "type": "spot",
        })

    heroes = [
        {"name": "Median Spot", "value": f"${med:,.2f}" if med else "—", "sub": f"{len(spot)} venues"},
        {"name": "Cross Spread", "value": f"${spread:,.2f}" if spread is not None else "—", "sub": "High − low spot"},
        {"name": "Leader", "value": high_row.get("exchange") if high_row else "—", "sub": f"${high_row.get('price'):,.2f}" if high_row and high_row.get("price") else ""},
        {"name": "24h Spot Vol", "value": _fmt_usd(total_vol), "sub": "Quote volume sum"},
    ]

    lines = []
    if not spot:
        lines.append("No exchange spot data available. Public APIs may be temporarily unreachable.")
    else:
        lines.append(
            f"Cross-exchange spot: {len(spot)} venues reporting · median ${med:,.2f} · "
            f"spread ${spread:,.2f} ({(spread / med * 100):.3f}% of median)." if spread and med else
            f"Cross-exchange spot: {len(spot)} venues reporting.",
        )
        if high_row and low_row:
            lines.append(
                f"Leader {high_row.get('exchange')} (${high_row.get('price'):,.2f}) vs "
                f"laggard {low_row.get('exchange')} (${low_row.get('price'):,.2f}).",
            )
        if perp:
            pos = sum(1 for p in perp if (p.get("fundingRate") or 0) > 0)
            lines.append(
                f"Perp funding: {pos}/{len(perp)} venues positive — "
                f"{'contango / long-biased' if pos >= len(perp) / 2 else 'mixed funding skew'}.",
            )
    if errors:
        lines.append(f"Partial data: {len(errors)} venue fetch(es) failed.")
    lines.append(
        "Roadmap: depth ladders, arb matrix, exchange in/out flows — extend as you build out this hub.",
    )
    return heroes[:4], table, lines


def _build_exchanges_spot(spot, errors):
    table = []
    for r in sorted(spot, key=lambda x: x.get("volume") or 0, reverse=True):
        spread_ba = None
        if r.get("bid") and r.get("ask"):
            spread_ba = r["ask"] - r["bid"]
        table.append({
            "exchange": r.get("exchange"),
            "pair": r.get("pair"),
            "price": r.get("price"),
            "bid": r.get("bid"),
            "ask": r.get("ask"),
            "spread": spread_ba,
            "changePct": r.get("changePct"),
            "high": r.get("high"),
            "low": r.get("low"),
            "volume": r.get("volume"),
            "type": "spot",
        })

    total_vol = sum(r.get("volume") or 0 for r in spot)
    top = table[0] if table else None
    heroes = [
        {"name": "Venues", "value": len(spot), "sub": "Spot BTC pairs"},
        {"name": "Top Volume", "value": top.get("exchange") if top else "—", "sub": _fmt_usd(top.get("volume")) if top else ""},
        {"name": "Aggregate Vol", "value": _fmt_usd(total_vol), "sub": "24h quote vol"},
    ]
    if table:
        tight = [t for t in table if t.get("spread") is not None]
        if tight:
            best = min(tight, key=lambda t: t["spread"])
            heroes.append({
                "name": "Tightest Spread",
                "value": best.get("exchange"),
                "sub": f"${best.get('spread'):,.2f} bid-ask",
            })

    lines = []
    if not spot:
        lines.append("Spot venue data unavailable.")
    else:
        lines.append(f"Spot liquidity across {len(spot)} exchanges · aggregate 24h volume {_fmt_usd(total_vol)}.")
        if top:
            lines.append(f"Highest spot volume: {top.get('exchange')} ({_fmt_usd(top.get('volume'))}).")
    if errors:
        lines.append(f"{len(errors)} fetch error(s) — showing partial venue set.")
    lines.append("Roadmap: depth ladders, arb matrix, exchange in/out flows — extend as needed.")
    return heroes[:4], table, lines


def _build_exchanges_perp(perp, errors):
    table = []
    for r in perp:
        fr = r.get("fundingRate")
        fr_pct = fr * 100 if fr is not None else None
        table.append({
            "exchange": r.get("exchange"),
            "pair": r.get("pair"),
            "price": r.get("price"),
            "mark": r.get("mark"),
            "index": r.get("index"),
            "basisPct": r.get("basisPct"),
            "changePct": r.get("changePct"),
            "fundingRate": fr,
            "fundingPct": fr_pct,
            "volume": r.get("volume"),
            "type": "perp",
        })

    pos = [p for p in perp if (p.get("fundingRate") or 0) > 0]
    avg_fund = None
    rates = [p["fundingRate"] for p in perp if p.get("fundingRate") is not None]
    if rates:
        avg_fund = sum(rates) / len(rates)

    heroes = [
        {"name": "Perp Venues", "value": len(perp), "sub": "BTC linear swaps"},
        {"name": "Avg Funding", "value": f"{avg_fund * 100:.4f}%" if avg_fund is not None else "—", "sub": "Last published rate"},
        {"name": "Positive Funding", "value": f"{len(pos)}/{len(perp)}" if perp else "—", "sub": "Longs pay shorts"},
    ]
    if perp:
        extreme = max(perp, key=lambda p: abs(p.get("fundingRate") or 0))
        heroes.append({
            "name": "Extreme Funding",
            "value": extreme.get("exchange"),
            "sub": f"{(extreme.get('fundingRate') or 0) * 100:.4f}%",
        })

    lines = []
    if not perp:
        lines.append("No perp venue data available.")
    else:
        lines.append(
            f"Perp snapshot: {len(perp)} venues · average funding "
            f"{avg_fund * 100:.4f}%." if avg_fund is not None else
            f"Perp snapshot: {len(perp)} venues.",
        )
        for row in sorted(perp, key=lambda x: abs(x.get("fundingRate") or 0), reverse=True)[:2]:
            fr = row.get("fundingRate")
            if fr is not None:
                lines.append(
                    f"{row.get('exchange')}: funding {(fr * 100):.4f}% · "
                    f"mark ${row.get('price'):,.2f}.",
                )
    if errors:
        lines.append(f"Partial perp data — {len(errors)} spot fetch error(s) in pipeline.")
    lines.append("Roadmap: OI breakdown, basis time series, cross-venue funding arb — extend as needed.")
    return heroes[:4], table, lines


def _build_exchanges_volume(spot, perp, errors):
    combined = []
    for r in spot:
        combined.append({**r, "market": "Spot"})
    for r in perp:
        combined.append({**r, "market": "Perp"})

    total = sum(r.get("volume") or 0 for r in combined)
    ranked = sorted(combined, key=lambda x: x.get("volume") or 0, reverse=True)

    table = []
    for r in ranked:
        vol = r.get("volume") or 0
        share = (vol / total * 100) if total else None
        table.append({
            "exchange": r.get("exchange"),
            "pair": r.get("pair"),
            "market": r.get("market"),
            "volume": vol,
            "sharePct": share,
            "price": r.get("price"),
            "type": r.get("type"),
        })

    heroes = []
    if ranked:
        heroes.append({
            "name": "#1 Venue",
            "value": ranked[0].get("exchange"),
            "sub": f"{ranked[0].get('market')} · {_fmt_usd(ranked[0].get('volume'))}",
        })
    heroes.append({"name": "Total Volume", "value": _fmt_usd(total), "sub": "Spot + perp sum"})
    spot_share = sum(r.get("volume") or 0 for r in spot)
    perp_share = sum(r.get("volume") or 0 for r in perp)
    if total:
        heroes.append({
            "name": "Spot Share",
            "value": f"{spot_share / total * 100:.1f}%",
            "sub": _fmt_usd(spot_share),
        })
        heroes.append({
            "name": "Perp Share",
            "value": f"{perp_share / total * 100:.1f}%",
            "sub": _fmt_usd(perp_share),
        })

    lines = []
    if not ranked:
        lines.append("Volume data unavailable.")
    else:
        lines.append(
            f"Combined 24h volume {_fmt_usd(total)} across {len(ranked)} spot/perp listings.",
        )
        top3 = ranked[:3]
        lines.append(
            "Top venues: "
            + " · ".join(
                f"{r.get('exchange')} {r.get('market')} ({r.get('volume') / total * 100:.1f}%)"
                for r in top3 if total
            )
            + ".",
        )
    if errors:
        lines.append(f"Partial volume picture — {len(errors)} venue error(s).")
    lines.append("Roadmap: historical volume share, venue dominance trends — extend as needed.")
    return heroes[:4], table, lines


def _fetch_exchanges_section(section):
    cfg = EXCHANGES_CATEGORIES.get(section)
    if not cfg:
        raise ValueError(f"Unknown Exchanges section: {section}")

    raw = _fetch_all_exchange_data()
    spot = raw.get("spot") or []
    perp = raw.get("perp") or []
    errors = raw.get("errors") or []

    if section == "overview":
        heroes, table, commentary = _build_exchanges_overview(spot, perp, errors)
        columns = ["exchange", "pair", "price", "changePct", "spreadVsMedian", "volume"]
    elif section == "spot":
        heroes, table, commentary = _build_exchanges_spot(spot, errors)
        columns = ["exchange", "pair", "price", "bid", "ask", "spread", "changePct", "high", "low", "volume"]
    elif section == "perp":
        heroes, table, commentary = _build_exchanges_perp(perp, errors)
        columns = ["exchange", "pair", "price", "basisPct", "fundingPct", "changePct", "volume"]
    else:
        heroes, table, commentary = _build_exchanges_volume(spot, perp, errors)
        columns = ["exchange", "pair", "market", "volume", "sharePct", "price"]

    return {
        "section": section,
        "title": cfg["title"],
        "heroes": heroes,
        "table": table,
        "columns": columns,
        "chart": _build_exchanges_chart(section, table),
        "commentary": commentary,
        "venueCount": len(spot) + len(perp),
        "source": "Public exchange APIs · live scaffold",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def get_exchanges_payload(section):
    key = f"exchanges:{section}"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]
    data = _fetch_exchanges_section(section)
    _cache[key] = {"ts": now, "data": data}
    return data


def _downsample_points(points, max_points=160):
    if len(points) <= max_points:
        return points
    step = max(1, len(points) // max_points)
    sampled = points[::step]
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


def _stable_usd_value(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return _as_float(value.get("peggedUSD"))
    return _as_float(value)


def _stable_circulating(asset):
    return _stable_usd_value(asset.get("circulating"))


def _fmt_usd_short(value):
    if value is None:
        return None
    value = float(value)
    if abs(value) >= 1e12:
        return round(value / 1e12, 2)
    if abs(value) >= 1e9:
        return round(value / 1e9, 2)
    if abs(value) >= 1e6:
        return round(value / 1e6, 2)
    return round(value, 2)


def get_defillama_protocols():
    key = "defillama:protocols"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]

    data = fetch_json(f"{DEFILLAMA_API}/protocols")
    by_slug = {p.get("slug"): p for p in data if p.get("slug")}
    payload = {"list": data, "by_slug": by_slug}
    _cache[key] = {"ts": now, "data": payload}
    return payload


def _protocol_row(protocol):
    chains = protocol.get("chains") or []
    chain_label = ", ".join(chains[:3])
    if len(chains) > 3:
        chain_label += f" +{len(chains) - 3}"
    return {
        "name": protocol.get("name"),
        "slug": protocol.get("slug"),
        "symbol": protocol.get("symbol"),
        "category": protocol.get("category"),
        "tvl": _as_float(protocol.get("tvl")),
        "change1d": _as_float(protocol.get("change_1d")),
        "change7d": _as_float(protocol.get("change_7d")),
        "chains": chain_label or "—",
    }


def _protocols_for_slugs(slugs):
    store = get_defillama_protocols()
    rows = []
    for slug in slugs:
        protocol = store["by_slug"].get(slug)
        if protocol:
            rows.append(_protocol_row(protocol))
    rows.sort(key=lambda r: r.get("tvl") or 0, reverse=True)
    return rows


def _heroes_from_protocol_rows(rows, value_key="tvl"):
    heroes = []
    for row in rows[:4]:
        heroes.append({
            "name": row.get("name"),
            "value": row.get(value_key),
            "changePct": row.get("change1d"),
            "sub": row.get("category") or row.get("chains") or "",
        })
    return heroes


def _protocol_tvl_chart(slug):
    data = fetch_json(f"{DEFILLAMA_API}/protocol/{slug}")
    points = []
    for row in data.get("tvl") or []:
        ts = row.get("date")
        val = row.get("totalLiquidityUSD")
        if ts is None or val is None:
            continue
        points.append({
            "date": time.strftime("%Y-%m-%d", time.gmtime(int(ts))),
            "close": _as_float(val),
        })
    return _downsample_points(points)


def _fetch_wrapped_btc_prices():
    ids = ",".join(WRAPPED_BTC_PRICES.values())
    data = fetch_json(f"{COINS_API}/prices/current/{ids}")
    coins = data.get("coins") or {}
    rows = []
    for label, coin_id in WRAPPED_BTC_PRICES.items():
        quote = coins.get(coin_id) or {}
        rows.append({
            "name": label,
            "symbol": quote.get("symbol") or label,
            "price": _as_float(quote.get("price")),
            "confidence": quote.get("confidence"),
        })
    return rows


def _fetch_defi_wrapped():
    rows = _protocols_for_slugs(WRAPPED_BTC_SLUGS)
    prices = _fetch_wrapped_btc_prices()
    total_tvl = sum(r.get("tvl") or 0 for r in rows)
    chart = _protocol_tvl_chart("wbtc")

    return {
        "section": "wrapped",
        "title": "Wrapped BTC",
        "heroes": [
            {
                "name": "Total Wrapped TVL",
                "value": total_tvl,
                "changePct": None,
                "sub": f"{len(rows)} tracked representations",
            },
            *_heroes_from_protocol_rows(rows),
        ][:4],
        "table": rows,
        "prices": prices,
        "chart": {"points": chart, "label": "WBTC TVL (USD)"},
        "chartLabel": "WBTC TVL (USD)",
        "tableMode": "protocol",
        "source": "DeFi Llama · coins.llama.fi",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _fetch_defi_stables():
    data = fetch_json(f"{STABLECOINS_API}/stablecoins?includePrices=true")
    assets = data.get("peggedAssets") or []
    usd_assets = [
        a for a in assets
        if (a.get("pegType") or "").upper() == "PEGGEDUSD"
    ]
    usd_assets.sort(key=_stable_circulating, reverse=True)

    total_mcap = sum(_stable_circulating(a) or 0 for a in usd_assets)
    top = usd_assets[:15]

    table = []
    for asset in top:
        mcap = _stable_circulating(asset) or 0
        prev_week = _stable_usd_value(asset.get("circulatingPrevWeek"))
        change7d = None
        if prev_week and prev_week > 0:
            change7d = ((mcap - prev_week) / prev_week) * 100
        table.append({
            "name": asset.get("name"),
            "symbol": asset.get("symbol"),
            "mcap": mcap,
            "price": _stable_usd_value(asset.get("price")),
            "change7d": change7d,
            "chains": len(asset.get("chains") or []),
        })

    heroes = []
    for asset in usd_assets[:3]:
        mcap = _stable_circulating(asset) or 0
        share = (mcap / total_mcap * 100) if total_mcap else None
        sub = asset.get("name") or ""
        if share is not None:
            sub = f"{sub} · {share:.1f}% share"
        heroes.append({
            "name": asset.get("symbol") or asset.get("name"),
            "value": mcap,
            "changePct": share,
            "sub": sub,
        })
    heroes.insert(0, {
        "name": "Total Stablecoin MCap",
        "value": total_mcap,
        "changePct": None,
        "sub": f"{len(usd_assets)} USD-pegged assets",
    })
    heroes = heroes[:4]

    history = fetch_json(f"{STABLECOINS_API}/stablecoincharts/all")
    mcap_points = []
    for row in history or []:
        ts = row.get("date")
        circ = row.get("totalCirculatingUSD") or row.get("totalCirculating") or {}
        val = _as_float(circ.get("peggedUSD") if isinstance(circ, dict) else circ)
        if ts is None or val is None:
            continue
        mcap_points.append({
            "date": time.strftime("%Y-%m-%d", time.gmtime(int(ts))),
            "close": val,
        })
    mcap_points = _downsample_points(mcap_points)

    dominance = []
    for asset in usd_assets[:8]:
        mcap = _stable_circulating(asset) or 0
        if not total_mcap:
            continue
        dominance.append({
            "name": asset.get("symbol") or asset.get("name"),
            "share": (mcap / total_mcap) * 100,
            "mcap": mcap,
        })

    return {
        "section": "stables",
        "title": "Stablecoins",
        "heroes": heroes,
        "table": table,
        "chart": {"points": mcap_points, "label": "Total Stablecoin Market Cap"},
        "chartLabel": "Total Stablecoin Market Cap",
        "chart2": {"items": dominance, "label": "Dominance (Top 8)"},
        "chart2Label": "Dominance (Top 8)",
        "tableMode": "stables",
        "source": "DeFi Llama Stablecoins",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _fetch_defi_bridges():
    rows = _protocols_for_slugs(BRIDGE_BTC_SLUGS)
    store = get_defillama_protocols()
    if len(rows) < 8:
        seen = {r["slug"] for r in rows}
        extras = []
        for protocol in store["list"]:
            slug = protocol.get("slug")
            if slug in seen:
                continue
            name = (protocol.get("name") or "").lower()
            category = protocol.get("category") or ""
            if "btc" in name or category in BTC_BRIDGE_CATEGORIES:
                extras.append(_protocol_row(protocol))
        extras.sort(key=lambda r: r.get("tvl") or 0, reverse=True)
        for row in extras:
            if row["slug"] not in seen:
                rows.append(row)
                seen.add(row["slug"])
        rows.sort(key=lambda r: r.get("tvl") or 0, reverse=True)

    total_tvl = sum(r.get("tvl") or 0 for r in rows)
    chart_slug = rows[0]["slug"] if rows else "wbtc"
    chart = _protocol_tvl_chart(chart_slug)

    return {
        "section": "bridges",
        "title": "BTC Bridges",
        "heroes": [
            {
                "name": "Bridge TVL (tracked)",
                "value": total_tvl,
                "changePct": None,
                "sub": f"{len(rows)} BTC bridge protocols",
            },
            *_heroes_from_protocol_rows(rows),
        ][:4],
        "table": rows[:15],
        "chart": {"points": chart, "label": f"{rows[0]['name']} TVL" if rows else "Bridge TVL"},
        "chartLabel": f"{rows[0]['name']} TVL" if rows else "Bridge TVL",
        "tableMode": "protocol",
        "source": "DeFi Llama",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _btc_yield_pools():
    key = "defillama:btc-yields"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]

    data = fetch_json(f"{YIELDS_API}/pools")
    pools = data.get("data") or []
    btc_pools = []
    for pool in pools:
        blob = " ".join([
            str(pool.get("symbol") or ""),
            str(pool.get("project") or ""),
            str(pool.get("poolMeta") or ""),
            " ".join(pool.get("underlyingTokens") or []),
        ]).lower()
        if "btc" in blob or "wbtc" in blob or "cbbtc" in blob or "lbtc" in blob:
            btc_pools.append(pool)

    _cache[key] = {"ts": now, "data": btc_pools}
    return btc_pools


def _fetch_defi_lending():
    pools = _btc_yield_pools()
    lending = [
        p for p in pools
        if (p.get("apy") or 0) >= 0 and "btc" in (p.get("symbol") or "").lower()
    ]
    lending.sort(key=lambda p: p.get("tvlUsd") or 0, reverse=True)

    table = []
    for pool in lending[:15]:
        table.append({
            "name": pool.get("project"),
            "symbol": pool.get("symbol"),
            "tvl": _as_float(pool.get("tvlUsd")),
            "apy": _as_float(pool.get("apy")),
            "chain": pool.get("chain"),
            "change7d": _as_float(pool.get("apyPct7D")),
        })

    heroes = []
    for pool in lending[:3]:
        heroes.append({
            "name": f"{pool.get('project')} {pool.get('symbol')}",
            "value": _as_float(pool.get("tvlUsd")),
            "changePct": _as_float(pool.get("apyPct7D")),
            "sub": f"{pool.get('chain')} · APY {(_as_float(pool.get('apy')) or 0) * 100:.2f}%",
        })
    total_tvl = sum(_as_float(p.get("tvlUsd")) or 0 for p in lending)
    heroes.insert(0, {
        "name": "BTC Lending TVL",
        "value": total_tvl,
        "changePct": None,
        "sub": f"{len(lending)} BTC lending pools",
    })
    heroes = heroes[:4]

    chart_points = []
    top = lending[0] if lending else None
    if top:
        chart_points = [{
            "date": "Now",
            "close": _as_float(top.get("tvlUsd")),
        }]

    return {
        "section": "lending",
        "title": "BTC Lending",
        "heroes": heroes,
        "table": table,
        "chart": {"points": chart_points, "label": "Top pool TVL snapshot"},
        "chartLabel": f"{top.get('project')} {top.get('symbol')} TVL" if top else "Lending TVL",
        "tableMode": "lending",
        "source": "DeFi Llama Yields",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _fetch_defi_liquidity():
    data = fetch_json(
        f"{DEFILLAMA_API}/overview/dexs"
        "?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true"
        "&dataType=dailyVolume"
    )
    protocols = data.get("protocols") or []
    rows = []
    for protocol in protocols:
        rows.append({
            "name": protocol.get("displayName") or protocol.get("name"),
            "slug": protocol.get("slug") or protocol.get("module"),
            "volume24h": _as_float(protocol.get("total24h")),
            "change1d": _as_float(protocol.get("change_1d")),
            "change7d": _as_float(protocol.get("change_7d")),
            "chains": ", ".join((protocol.get("chains") or [])[:3]) or "—",
        })
    rows.sort(key=lambda r: r.get("volume24h") or 0, reverse=True)

    heroes = []
    for row in rows[:3]:
        heroes.append({
            "name": row.get("name"),
            "value": row.get("volume24h"),
            "changePct": row.get("change1d"),
            "sub": "24h DEX volume · WBTC pairs",
        })
    total_vol = sum(r.get("volume24h") or 0 for r in rows[:20])
    heroes.insert(0, {
        "name": "Top-20 DEX Volume",
        "value": total_vol,
        "changePct": None,
        "sub": "BTC liquidity routes via WBTC/cbBTC pools",
    })
    heroes = heroes[:4]

    return {
        "section": "liquidity",
        "title": "DEX Liquidity",
        "heroes": heroes,
        "table": rows[:15],
        "chart": {"points": [], "label": "24h volume snapshot"},
        "chartLabel": "DEX 24h Volume (table)",
        "tableMode": "liquidity",
        "source": "DeFi Llama DEX overview",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _fetch_defi_staking():
    rows = _protocols_for_slugs(STAKING_BTC_SLUGS)
    store = get_defillama_protocols()
    seen = {r["slug"] for r in rows}
    for protocol in store["list"]:
        slug = protocol.get("slug")
        if slug in seen:
            continue
        category = protocol.get("category") or ""
        name = (protocol.get("name") or "").lower()
        if category in {"Restaked BTC", "Anchor BTC"} or (
            "btc" in name and category in {"Liquid Staking", "Restaking"}
        ):
            rows.append(_protocol_row(protocol))
            seen.add(slug)
    rows.sort(key=lambda r: r.get("tvl") or 0, reverse=True)

    pools = _btc_yield_pools()
    stake_pools = sorted(
        [p for p in pools if (p.get("apy") or 0) > 0],
        key=lambda p: p.get("tvlUsd") or 0,
        reverse=True,
    )[:5]

    total_tvl = sum(r.get("tvl") or 0 for r in rows)
    heroes = [{
        "name": "BTC Staking TVL",
        "value": total_tvl,
        "changePct": None,
        "sub": "Restaking · liquid staking · yield",
    }]
    heroes.extend(_heroes_from_protocol_rows(rows))
    heroes = heroes[:4]

    chart_slug = rows[0]["slug"] if rows else "babylon-protocol"
    chart = _protocol_tvl_chart(chart_slug) if rows else []

    table = rows[:12]
    for pool in stake_pools:
        if len(table) >= 15:
            break
        table.append({
            "name": pool.get("project"),
            "symbol": pool.get("symbol"),
            "tvl": _as_float(pool.get("tvlUsd")),
            "apy": _as_float(pool.get("apy")),
            "chain": pool.get("chain"),
            "category": "Yield pool",
        })

    return {
        "section": "staking",
        "title": "BTC Staking",
        "heroes": heroes,
        "table": table[:15],
        "chart": {
            "points": chart,
            "label": f"{rows[0]['name']} TVL" if rows else "Staking TVL",
        },
        "chartLabel": f"{rows[0]['name']} TVL" if rows else "Staking TVL",
        "tableMode": "staking",
        "source": "DeFi Llama · Yields",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


DEFI_FETCHERS = {
    "wrapped": _fetch_defi_wrapped,
    "stables": _fetch_defi_stables,
    "bridges": _fetch_defi_bridges,
    "lending": _fetch_defi_lending,
    "staking": _fetch_defi_staking,
    "liquidity": _fetch_defi_liquidity,
}


def get_defi_payload(section):
    fetcher = DEFI_FETCHERS.get(section)
    if not fetcher:
        raise ValueError(f"Unknown DeFi section: {section}")

    key = f"defi:{section}"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]

    data = fetcher()
    _cache[key] = {"ts": now, "data": data}
    return data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/"):
            from api_dispatch import handle_api

            handle_api(self)
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = 5173
    try:
        server = ThreadingHTTPServer(("", port), Handler)
    except OSError as exc:
        if exc.errno == 48:  # Address already in use
            print(f"Port {port} is already in use — dashboard likely running at http://localhost:{port}")
            raise SystemExit(0)
        raise
    print(f"Serving at http://localhost:{port}")
    server.serve_forever()