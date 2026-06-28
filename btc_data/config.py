"""Indicator catalog, tabs, and methodology for Misc → Bitcoin."""

from __future__ import annotations

from typing import Any

TABS = {
    "overview": "Overview",
    "distribution": "Distribution & Whales",
    "onchain": "On-Chain Activity",
    "valuation": "Valuation & Cycles",
    "sentiment": "Sentiment & Market Structure",
    "methodology": "Sources & Methodology",
}

INDICATORS: dict[str, dict[str, Any]] = {
    "rich_top100_pct": {
        "label": "Top 100 addresses",
        "tab": "distribution",
        "unit": "% supply",
        "format": "pct",
        "source": "BitInfoCharts",
        "update": "Daily",
        "help": "mb-rich-top100",
    },
    "rich_top1000_pct": {
        "label": "Top 1,000 addresses",
        "tab": "distribution",
        "unit": "% supply",
        "format": "pct",
        "source": "BitInfoCharts",
        "update": "Daily",
        "help": "mb-rich-top1000",
    },
    "wealth_top10_pct": {
        "label": "Top 10 addresses",
        "tab": "distribution",
        "unit": "% supply",
        "format": "pct",
        "source": "BitInfoCharts",
        "update": "Daily",
        "help": "mb-wealth-top10",
    },
    "active_addresses": {
        "label": "Active addresses (24h)",
        "tab": "onchain",
        "unit": "addresses",
        "format": "large_int",
        "source": "Blockchain.info",
        "update": "Daily",
        "help": "mb-active-addresses",
    },
    "exchange_netflow": {
        "label": "Exchange netflow",
        "tab": "onchain",
        "unit": "BTC",
        "format": "btc",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-exchange-netflow",
        "mayProxy": True,
    },
    "hash_rate": {
        "label": "Hash rate",
        "tab": "onchain",
        "unit": "EH/s",
        "format": "hashrate",
        "source": "Blockchain.info",
        "update": "Daily",
        "help": "mb-hash-rate",
    },
    "puell_multiple": {
        "label": "Puell Multiple",
        "tab": "onchain",
        "unit": "×",
        "format": "ratio",
        "source": "Computed · Blockchain.info",
        "update": "Daily",
        "help": "mb-puell",
        "isEstimate": True,
    },
    "mvrv": {
        "label": "MVRV",
        "tab": "valuation",
        "unit": "×",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-mvrv",
    },
    "mvrv_z_score": {
        "label": "MVRV Z-Score",
        "tab": "valuation",
        "unit": "σ",
        "format": "zscore",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-mvrv-z",
    },
    "realized_price": {
        "label": "Realized price",
        "tab": "valuation",
        "unit": "USD",
        "format": "usd",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-realized-price",
    },
    "hodl_waves_1y_plus": {
        "label": "Supply aged 1y+",
        "tab": "valuation",
        "unit": "% supply",
        "format": "pct",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-hodl-waves",
        "mayProxy": True,
    },
    "fear_greed": {
        "label": "Fear & Greed",
        "tab": "sentiment",
        "unit": "0–100",
        "format": "score",
        "source": "Alternative.me",
        "update": "Daily",
        "help": "mb-fear-greed",
    },
    "funding_rate": {
        "label": "Median funding (perp)",
        "tab": "sentiment",
        "unit": "%",
        "format": "funding",
        "source": "Exchange APIs",
        "update": "8h cycle",
        "help": "mb-funding-rate",
    },
    "open_interest": {
        "label": "Open interest (Binance)",
        "tab": "sentiment",
        "unit": "BTC",
        "format": "btc",
        "source": "Binance Futures",
        "update": "Real-time",
        "help": "mb-open-interest",
    },
    "btc_dominance": {
        "label": "BTC dominance",
        "tab": "sentiment",
        "unit": "%",
        "format": "pct",
        "source": "CoinGecko",
        "update": "5 min",
        "help": "mb-btc-dominance",
    },
}

METHODOLOGY: list[dict[str, str]] = [
    {
        "title": "Source hierarchy",
        "body": (
            "Free public APIs are preferred. BGeometrics community endpoints are disk-cached "
            "(24h TTL) to respect hourly rate limits. Blockchain.info and BitInfoCharts provide "
            "network and distribution snapshots. Exchange perp funding is aggregated from the "
            "same venue scaffold as the Derivatives tab."
        ),
    },
    {
        "title": "Distribution & whales",
        "body": (
            "Rich-list and wealth-band percentages are scraped from BitInfoCharts summary tables. "
            "Wallet cohort breakdown uses the address-balance distribution table on the same site. "
            "These are address-level (not entity-adjusted) and may overstate exchange cold wallets."
        ),
    },
    {
        "title": "On-chain activity",
        "body": (
            "Active addresses and hash rate use Blockchain.info chart APIs. Puell Multiple is "
            "computed locally as daily miner revenue divided by its 365-day moving average. "
            "Exchange netflow uses BGeometrics when available; otherwise marked unavailable."
        ),
    },
    {
        "title": "Valuation & cycles",
        "body": (
            "MVRV, MVRV Z-Score, realized price, and HODL-wave supply bands come from "
            "BGeometrics on-chain models. Set BGEOMETRICS_API_KEY for higher rate limits. "
            "Without API access, cached or stale values may be shown with a clear timestamp."
        ),
    },
    {
        "title": "Sentiment & market structure",
        "body": (
            "Fear & Greed Index from Alternative.me. BTC dominance from CoinGecko global market "
            "cap. Funding rate is the cross-venue median of published perp funding rates. "
            "Open interest is Binance BTCUSDT perpetual open interest in BTC terms."
        ),
    },
    {
        "title": "Proxies & limitations",
        "body": (
            "Entity-adjusted whale metrics (Glassnode/CryptoQuant) require paid API keys — "
            "not included in the free tier. Overlap with On Chain and Derivatives tabs is "
            "intentional; this section groups BTC-centric indicators for macro context."
        ),
    },
]

BGEOMETRICS_TTL = 86_400  # 24h — free tier ~10 req/hour
BITINFO_TTL = 43_200  # 12h
DEFAULT_SERIES_TIMESPAN = "1year"