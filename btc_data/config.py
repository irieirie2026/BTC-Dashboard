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
            "BGeometrics on-chain models via bitcoin-data.com/v1. Set BGEOMETRICS_API_KEY "
            "(portal token) as a Bearer token for Advanced metrics (exchange flows) and "
            "higher rate limits. Free-tier endpoints work without a token (last 4 years)."
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

# Rich chart copy for Misc → Bitcoin panels (descriptions + hover context).
CHART_INFO: dict[str, dict[str, Any]] = {
    "mvrv": {
        "title": "MVRV",
        "description": (
            "Market Value to Realized Value — spot market cap divided by the aggregate "
            "cost basis of circulating BTC. Compares what the market pays today versus "
            "what holders paid on average when coins last moved."
        ),
        "readings": (
            "≥3.5× historically marked overheated tops; 2–3× elevated; 1–2× neutral; "
            "<1× means price sits below average holder cost (often near cycle lows)."
        ),
        "source": "BGeometrics · bitcoin-data.com",
    },
    "mvrv_z_score": {
        "title": "MVRV Z-Score",
        "description": (
            "Standard-deviation distance of MVRV from its long-run mean. Normalizes "
            "valuation extremes across cycles so you can compare how unusual today's "
            "reading is versus history."
        ),
        "readings": (
            "≥7σ extreme top zone; 3–7σ overheated; around 0 neutral; negative readings "
            "often coincide with accumulation and undervaluation phases."
        ),
        "source": "BGeometrics · bitcoin-data.com",
    },
    "realized_price": {
        "title": "Realized price",
        "description": (
            "Aggregate USD cost basis of the circulating supply — effectively the "
            "volume-weighted average price at which coins last transacted on-chain."
        ),
        "readings": (
            "Spot above realized price: network in aggregate profit. Spot below: average "
            "coin underwater — a support zone bulls often defend in bear markets."
        ),
        "source": "BGeometrics · bitcoin-data.com",
    },
    "hodl_waves_1y_plus": {
        "title": "HODL waves (1y+ supply)",
        "description": (
            "Share of circulating BTC whose last on-chain move was more than one year ago. "
            "Proxy for long-term holder conviction versus short-term speculative supply."
        ),
        "readings": (
            "Rising 1y+ share often aligns with accumulation and reduced sell pressure; "
            "sharp drops can signal old coins waking up (distribution or profit-taking)."
        ),
        "source": "BGeometrics · bitcoin-data.com",
    },
    "hodl_waves": {
        "title": "HODL waves (1y+ supply)",
        "description": (
            "Share of circulating BTC whose last on-chain move was more than one year ago. "
            "Proxy for long-term holder conviction versus short-term speculative supply."
        ),
        "readings": (
            "Rising 1y+ share often aligns with accumulation and reduced sell pressure; "
            "sharp drops can signal old coins waking up (distribution or profit-taking)."
        ),
        "source": "BGeometrics · bitcoin-data.com",
    },
    "active_addresses": {
        "title": "Active addresses",
        "description": "Unique addresses active on the Bitcoin network in the selected window.",
        "readings": (
            "Rising activity suggests broader usage; sustained declines can mean quieter "
            "on-chain participation (not always bearish — L2 activity is off-chain)."
        ),
        "source": "Blockchain.info",
    },
    "hash_rate": {
        "title": "Hash rate",
        "description": "Estimated network hashing power securing Bitcoin (exahashes per second).",
        "readings": (
            "Trending higher reflects miner investment and security; sharp drops may follow "
            "price stress, energy costs, or difficulty adjustments."
        ),
        "source": "Blockchain.info",
    },
    "exchange_netflow": {
        "title": "Exchange netflow",
        "description": "Net BTC flowing into minus out of tracked exchange wallets.",
        "readings": (
            "Positive netflow: more BTC arriving at exchanges (potential sell pressure). "
            "Negative: net withdrawals (often interpreted as accumulation)."
        ),
        "source": "BGeometrics · Advanced token",
    },
    "puell_multiple": {
        "title": "Puell Multiple",
        "description": "Daily miner revenue divided by its 365-day moving average.",
        "readings": (
            ">4 historically near cycle tops (miners earning unusually high); <0.5 often "
            "near bottoms when miner income is depressed."
        ),
        "source": "Computed · Blockchain.info",
    },
    "btc_dominance": {
        "title": "BTC dominance",
        "description": "Bitcoin share of total crypto market capitalization.",
        "readings": (
            "Rising dominance often accompanies flight-to-quality into BTC; falling "
            "dominance can coincide with alt-season risk-on rotations."
        ),
        "source": "CoinGecko",
    },
    "fear_greed": {
        "title": "Fear & Greed",
        "description": "Composite sentiment score (0–100) from volatility, momentum, social, surveys, and dominance.",
        "readings": (
            "0–24 Extreme Fear; 25–44 Fear; 45–55 Neutral; 56–74 Greed; 75–100 Extreme Greed."
        ),
        "source": "Alternative.me",
    },
}

VALUATION_SERIES_KEYS = ("mvrv", "mvrv_z_score", "realized_price", "hodl_waves")