"""Indicator catalog, tabs, and methodology for Misc → Bitcoin."""

from __future__ import annotations

from typing import Any

TABS = {
    "overview": "Overview",
    "distribution": "Distribution & Whales",
    "onchain": "On-Chain Activity",
    "intelligence": "On-Chain Intelligence",
    "miner": "Miner & Network Health",
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
    "exchange_netflow": {
        "label": "Exchange netflow",
        "tab": "onchain",
        "unit": "BTC",
        "format": "btc",
        "source": "Coin Metrics Community",
        "update": "Daily",
        "help": "mb-exchange-netflow",
    },
    "exchange_balance": {
        "label": "Exchange balance",
        "tab": "onchain",
        "unit": "BTC",
        "format": "btc",
        "source": "Coin Metrics Community",
        "update": "Daily",
        "help": "mb-exchange-balance",
    },
    "tx_count": {
        "label": "Transaction count",
        "tab": "onchain",
        "unit": "tx/day",
        "format": "large_int",
        "source": "Coin Metrics Community",
        "update": "Daily",
        "help": "mb-tx-count",
    },
    "mempool_fees": {
        "label": "Fast fee (mempool)",
        "tab": "onchain",
        "unit": "sat/vB",
        "format": "fee_sat",
        "source": "Mempool.space",
        "update": "Real-time",
        "help": "mb-mempool-fees",
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
    "nupl": {
        "label": "NUPL",
        "tab": "valuation",
        "unit": "ratio",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-nupl",
    },
    "sopr": {
        "label": "SOPR",
        "tab": "valuation",
        "unit": "×",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-sopr",
    },
    "supply_in_profit": {
        "label": "Supply in profit",
        "tab": "valuation",
        "unit": "% supply",
        "format": "pct",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-supply-profit",
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
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-btc-dominance",
    },
    "etf_flow_btc": {
        "label": "ETF net flow",
        "tab": "sentiment",
        "unit": "BTC",
        "format": "btc",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-etf-flow",
    },
    "sth_mvrv": {
        "label": "STH MVRV",
        "tab": "intelligence",
        "unit": "×",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-sth-mvrv",
    },
    "lth_mvrv": {
        "label": "LTH MVRV",
        "tab": "intelligence",
        "unit": "×",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-lth-mvrv",
    },
    "sth_nupl": {
        "label": "STH NUPL",
        "tab": "intelligence",
        "unit": "ratio",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-sth-nupl",
    },
    "lth_nupl": {
        "label": "LTH NUPL",
        "tab": "intelligence",
        "unit": "ratio",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-lth-nupl",
    },
    "asopr": {
        "label": "ASOPR",
        "tab": "intelligence",
        "unit": "×",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-asopr",
    },
    "vdd_multiple": {
        "label": "VDD Multiple",
        "tab": "intelligence",
        "unit": "×",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-vdd-multiple",
    },
    "nrpl_usd": {
        "label": "Net realized P/L",
        "tab": "intelligence",
        "unit": "USD",
        "format": "usd",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-nrpl-usd",
    },
    "utxos_in_profit_pct": {
        "label": "UTXOs in profit",
        "tab": "intelligence",
        "unit": "%",
        "format": "pct",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-utxos-profit",
    },
    "san_daily_active_addresses": {
        "label": "Active addresses (Santiment)",
        "tab": "intelligence",
        "unit": "addresses",
        "format": "large_int",
        "source": "Santiment",
        "update": "Daily",
        "help": "mb-san-active-addresses",
        "mayProxy": True,
    },
    "san_exchange_inflow": {
        "label": "Exchange inflow (Santiment)",
        "tab": "intelligence",
        "unit": "USD",
        "format": "usd",
        "source": "Santiment",
        "update": "Daily",
        "help": "mb-san-exchange-inflow",
        "mayProxy": True,
    },
    "san_exchange_outflow": {
        "label": "Exchange outflow (Santiment)",
        "tab": "intelligence",
        "unit": "USD",
        "format": "usd",
        "source": "Santiment",
        "update": "Daily",
        "help": "mb-san-exchange-outflow",
        "mayProxy": True,
    },
    "san_transaction_volume": {
        "label": "Transaction volume (Santiment)",
        "tab": "intelligence",
        "unit": "USD",
        "format": "usd",
        "source": "Santiment",
        "update": "Daily",
        "help": "mb-san-transaction-volume",
        "mayProxy": True,
    },
    "san_mvrv_usd": {
        "label": "MVRV USD (Santiment)",
        "tab": "intelligence",
        "unit": "×",
        "format": "ratio",
        "source": "Santiment",
        "update": "Daily",
        "help": "mb-san-mvrv-usd",
        "mayProxy": True,
    },
    "san_price_usd": {
        "label": "Price USD (Santiment)",
        "tab": "sentiment",
        "unit": "USD",
        "format": "usd",
        "source": "Santiment",
        "update": "Daily",
        "help": "mb-san-price-usd",
        "mayProxy": True,
    },
    "san_social_volume_total": {
        "label": "Social volume (Santiment)",
        "tab": "sentiment",
        "unit": "posts",
        "format": "large_int",
        "source": "Santiment",
        "update": "Daily",
        "help": "mb-san-social-volume",
        "mayProxy": True,
    },
    "hashprice": {
        "label": "Hashprice",
        "tab": "miner",
        "unit": "USD",
        "format": "usd_precise",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-hashprice",
    },
    "hashrate_bg": {
        "label": "Hash rate",
        "tab": "miner",
        "unit": "EH/s",
        "format": "hashrate",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-hashrate-bg",
    },
    "hashribbons": {
        "label": "Hash ribbons",
        "tab": "miner",
        "unit": "signal",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-vm-hash-ribbons",
    },
    "difficulty": {
        "label": "Difficulty",
        "tab": "miner",
        "unit": "difficulty",
        "format": "large_int",
        "source": "BGeometrics",
        "update": "~2 weeks",
        "help": "mb-difficulty",
    },
    "thermo_price": {
        "label": "Thermo price",
        "tab": "miner",
        "unit": "USD",
        "format": "usd",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-vm-cost-production",
    },
    "miners_revenue": {
        "label": "Miner revenue",
        "tab": "miner",
        "unit": "USD",
        "format": "usd",
        "source": "Blockchain.info",
        "update": "Daily",
        "help": "mb-miners-revenue",
    },
    "stock_to_flow": {
        "label": "Stock-to-Flow (S2F)",
        "tab": "valuation",
        "unit": "×",
        "format": "ratio",
        "source": "Computed · halving schedule",
        "update": "Daily",
        "help": "mb-vm-s2f",
        "isEstimate": True,
    },
    "stock_to_flow_cross": {
        "label": "Stock-to-Flow Cross (S2FX)",
        "tab": "valuation",
        "unit": "×",
        "format": "ratio",
        "source": "Computed · S2FX phases",
        "update": "Daily",
        "help": "mb-vm-s2fx",
        "isEstimate": True,
    },
    "power_law": {
        "label": "Power Law ratio",
        "tab": "valuation",
        "unit": "×",
        "format": "ratio",
        "source": "Computed · Santostasi PLT",
        "update": "Daily",
        "help": "mb-vm-power-law",
        "isEstimate": True,
    },
    "delta_balanced_price": {
        "label": "Delta / Balanced price",
        "tab": "valuation",
        "unit": "USD",
        "format": "usd",
        "source": "BGeometrics + computed",
        "update": "Daily",
        "help": "mb-vm-delta-balanced",
        "isEstimate": True,
    },
    "pi_cycle_top": {
        "label": "Pi Cycle Top",
        "tab": "valuation",
        "unit": "signal",
        "format": "signal",
        "source": "Computed · daily price",
        "update": "Daily",
        "help": "mb-vm-pi-cycle",
        "isEstimate": True,
    },
    "rainbow_chart": {
        "label": "Rainbow chart",
        "tab": "valuation",
        "unit": "USD",
        "format": "usd",
        "source": "Computed · log regression",
        "update": "Daily",
        "help": "mb-vm-rainbow",
        "isEstimate": True,
    },
    "nvt_ratio": {
        "label": "NVT Signal",
        "tab": "onchain",
        "unit": "×",
        "format": "ratio",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-vm-nvt",
    },
    "metcalfe": {
        "label": "Metcalfe ratio",
        "tab": "onchain",
        "unit": "×",
        "format": "ratio",
        "source": "Computed · addresses²",
        "update": "Daily",
        "help": "mb-vm-metcalfe",
        "isEstimate": True,
    },
    "coin_days_destroyed": {
        "label": "Coin days destroyed",
        "tab": "onchain",
        "unit": "CDD",
        "format": "large_int",
        "source": "BGeometrics",
        "update": "Daily",
        "help": "mb-vm-cdd",
    },
    "difficulty_ribbon": {
        "label": "Difficulty ribbon",
        "tab": "miner",
        "unit": "difficulty",
        "format": "large_int",
        "source": "Computed · difficulty",
        "update": "Daily",
        "help": "mb-vm-difficulty-ribbon",
        "isEstimate": True,
    },
}

METHODOLOGY: list[dict[str, str]] = [
    {
        "title": "Source hierarchy",
        "body": (
            "Only free public APIs are used. BGeometrics (8 req/hr, 4yr history), Coin Metrics "
            "Community (exchange flows, tx count), Mempool.space (fees), BitInfoCharts, "
            "Blockchain.info, Alternative.me, and exchange APIs. BGeometrics calls are sequential "
            "with 24h disk cache."
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
            "Active addresses and hash rate use Blockchain.info. Exchange netflow, balance, and "
            "transaction count come from Coin Metrics Community. Mempool fees from Mempool.space. "
            "Puell Multiple is computed locally from miner revenue."
        ),
    },
    {
        "title": "Valuation & cycles",
        "body": (
            "MVRV, NUPL, SOPR, realized price, supply-in-profit, and HODL waves from BGeometrics "
            "free tier (bitcoin-data.com/v1, last 4 years). Loaded via tab bundle to save API quota."
        ),
    },
    {
        "title": "Valuation models",
        "body": (
            "Educational hub for 19 valuation frameworks across scarcity, on-chain, miner, network, "
            "and composite models. Category bundles fetch sequentially; computed models use price/difficulty "
            "math. Reuses Valuation & Cycles cache when available. See Stats → Power Law for full PLT."
        ),
    },
    {
        "title": "Sentiment & market structure",
        "body": (
            "Fear & Greed from Alternative.me. BTC dominance and ETF net flows from BGeometrics. "
            "Funding rate is cross-venue median perp funding; open interest from Binance Futures."
        ),
    },
    {
        "title": "Proxies & limitations",
        "body": (
            "Glassnode and CryptoQuant paid tiers are not used. Coin Metrics Community provides "
            "free exchange-flow proxies. Overlap with On Chain and Derivatives tabs is intentional."
        ),
    },
    {
        "title": "Prefetch & series store",
        "body": (
            "Background prefetch (scripts/btc_prefetch.py) writes normalized series to data/btc-series/. "
            "BGeometrics limited to ~8 req/hr; scheduler spreads fetches across the day. Santiment requires "
            "SANTIMENT_API_KEY (free plan, 1k calls/mo). Dune requires DUNE_API_KEY + BTC_DUNE_QUERY_IDS. "
            "Status: GET /api/misc/btc/prefetch/status"
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
        "source": "BGeometrics · bitcoin-data.com",
    },
    "wealth_concentration": {
        "title": "Wealth concentration",
        "description": "Share of circulating BTC held by the richest address cohorts (top 10 through top 10,000).",
        "readings": (
            "Address-level data from BitInfoCharts — not entity-adjusted. Exchange cold wallets "
            "can inflate whale counts."
        ),
        "source": "BitInfoCharts",
    },
    "wallet_cohorts": {
        "title": "Wallet size distribution",
        "description": "Breakdown of addresses and supply by BTC balance bands.",
        "readings": (
            "Shows how supply concentrates in larger wallets versus retail cohorts."
        ),
        "source": "BitInfoCharts",
    },
    "fear_greed_history": {
        "title": "Fear & Greed history",
        "description": (
            "Twelve-month daily history of the Crypto Fear & Greed Index (0–100) from Alternative.me."
        ),
        "readings": (
            "Sustained extreme readings matter more than single-day spikes; use with the live gauge "
            "for context on sentiment persistence."
        ),
        "source": "Alternative.me",
    },
    "fear_greed": {
        "title": "Fear & Greed",
        "description": "Composite sentiment score (0–100) from volatility, momentum, social, surveys, and dominance.",
        "readings": (
            "0–24 Extreme Fear; 25–44 Fear; 45–55 Neutral; 56–74 Greed; 75–100 Extreme Greed."
        ),
        "hoverBands": [
            {"gte": 75, "label": "Extreme Greed — euphoria risk"},
            {"gte": 56, "label": "Greed — bullish sentiment"},
            {"lte": 24, "label": "Extreme Fear — capitulation zone"},
            {"lte": 44, "label": "Fear — cautious market"},
        ],
        "source": "Alternative.me",
    },
    "funding_rate": {
        "title": "Median funding rate",
        "description": "Cross-venue median perpetual funding rate — cost of holding long positions.",
        "readings": "Positive: longs pay shorts (bullish positioning). Negative: shorts pay longs.",
        "hoverBands": [
            {"gte": 0.05, "label": "Elevated positive funding — crowded longs"},
            {"lte": -0.01, "label": "Negative funding — short squeeze risk"},
        ],
        "source": "Exchange APIs",
    },
    "open_interest": {
        "title": "Open interest",
        "description": "Binance BTCUSDT perpetual open interest in BTC terms.",
        "readings": "Rising OI with price can signal leveraged trend; falling OI may mean deleveraging.",
        "source": "Binance Futures",
    },
    "nupl": {
        "title": "NUPL",
        "description": "Net Unrealized Profit/Loss — aggregate paper profit of the network as a ratio of market cap.",
        "readings": "High NUPL: holders in large unrealized profit; low/negative: capitulation zones.",
        "hoverBands": [
            {"gte": 0.75, "label": "Euphoria — historically near tops"},
            {"gte": 0.5, "label": "Belief/optimism zone"},
            {"lte": 0, "label": "Capitulation — holders underwater on average"},
        ],
        "source": "BGeometrics · bitcoin-data.com",
    },
    "sopr": {
        "title": "SOPR",
        "description": "Spent Output Profit Ratio — ratio of sale price to purchase price for moved coins.",
        "readings": "Above 1: coins moved at profit; below 1: at loss. 1.0 is breakeven equilibrium.",
        "hoverBands": [
            {"gte": 1.05, "label": "Profit-taking dominates"},
            {"lte": 0.98, "label": "Loss-selling / capitulation"},
        ],
        "source": "BGeometrics · bitcoin-data.com",
    },
    "supply_in_profit": {
        "title": "Supply in profit",
        "description": "Percentage of circulating BTC whose market price exceeds its last-move cost basis.",
        "readings": "Very high readings often precede distribution; low readings near bear-market floors.",
        "hoverBands": [
            {"gte": 95, "label": "Nearly all supply in profit — top risk"},
            {"lte": 50, "label": "Majority underwater — stress zone"},
        ],
        "source": "BGeometrics · bitcoin-data.com",
    },
    "exchange_netflow": {
        "title": "Exchange netflow",
        "description": "Daily net BTC flowing into exchanges minus outflows (Coin Metrics Community).",
        "readings": "Positive: net deposits (potential sell pressure). Negative: net withdrawals (accumulation).",
        "hoverBands": [
            {"gte": 5000, "label": "Large net inflow — sell pressure risk"},
            {"lte": -5000, "label": "Large net outflow — accumulation signal"},
        ],
        "source": "Coin Metrics Community",
    },
    "exchange_balance": {
        "title": "Exchange balance",
        "description": "Total BTC held on tracked exchange wallets.",
        "readings": "Rising balance: more supply on exchanges; falling: coins moving to cold storage.",
        "source": "Coin Metrics Community",
    },
    "tx_count": {
        "title": "Transaction count",
        "description": "Daily on-chain Bitcoin transactions.",
        "readings": "Higher counts reflect more network usage; drops can mean quieter on-chain activity.",
        "source": "Coin Metrics Community",
    },
    "mempool_fees": {
        "title": "Mempool fees",
        "description": "Recommended fee rates (sat/vB) to confirm in the next blocks.",
        "readings": "Spikes indicate mempool congestion and urgent block space demand.",
        "hoverBands": [
            {"gte": 50, "label": "High congestion — urgent fees"},
            {"lte": 5, "label": "Low congestion — cheap block space"},
        ],
        "source": "Mempool.space",
    },
    "etf_flow_btc": {
        "title": "ETF net flow",
        "description": "Daily net BTC flow across US spot Bitcoin ETFs (aggregated).",
        "readings": "Positive: net ETF buying; negative: net redemptions / outflows.",
        "hoverBands": [
            {"gte": 1000, "label": "Strong ETF inflows"},
            {"lte": -1000, "label": "Heavy ETF outflows"},
        ],
        "source": "BGeometrics · bitcoin-data.com",
    },
    "rich_top100_pct": {
        "title": "Top 100 addresses",
        "description": "Share of BTC supply held by the 100 richest addresses.",
        "readings": "Rising: concentration; falling: broader distribution (address-level, not entity-adjusted).",
        "source": "BitInfoCharts",
    },
    "rich_top1000_pct": {
        "title": "Top 1,000 addresses",
        "description": "Share of supply in the top 1,000 addresses.",
        "readings": "Broader whale cohort than top 100 alone.",
        "source": "BitInfoCharts",
    },
    "wealth_top10_pct": {
        "title": "Top 10 addresses",
        "description": "Share of supply in the ten largest addresses.",
        "readings": "Often exchange cold wallets — interpret with caution.",
        "source": "BitInfoCharts",
    },
    "sth_lth_mvrv": {
        "title": "STH vs LTH MVRV",
        "description": "Dual cohort MVRV — short-term holders (<155d) vs long-term holders (155d+).",
        "readings": "STH spikes first in rallies; LTH extremes often lag macro cycle turns.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "sth_lth_nupl": {
        "title": "STH vs LTH NUPL",
        "description": "Net unrealized P/L split by holder cohort — recent buyers vs seasoned holders.",
        "readings": "High STH NUPL = near-term profit-taking risk; LTH NUPL extremes mark cycle psychology.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "puell_multiple_miner": {
        "title": "Puell Multiple",
        "description": "Daily miner revenue divided by its 365-day average.",
        "readings": "Values above ~4 historically coincided with cycle tops; below ~0.5 with bottoms.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "sth_mvrv": {
        "title": "STH MVRV",
        "description": "MVRV for short-term holders (<155 days) — more sensitive to recent price action.",
        "readings": "Elevated STH MVRV often signals near-term overheating and profit-taking.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "lth_mvrv": {
        "title": "LTH MVRV",
        "description": "MVRV for long-term holders (155d+) — reflects seasoned holder cost basis.",
        "readings": "LTH MVRV peaks can lag spot tops; low readings often align with bear accumulation.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "sth_nupl": {
        "title": "STH NUPL",
        "description": "Net unrealized P/L for short-term holders.",
        "readings": "High STH NUPL = recent buyers in large paper profits (sell pressure risk).",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "lth_nupl": {
        "title": "LTH NUPL",
        "description": "Net unrealized P/L for long-term holders.",
        "readings": "LTH NUPL extremes often mark macro cycle turns.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "asopr": {
        "title": "ASOPR (Adjusted SOPR)",
        "description": "SOPR excluding same-block spends — cleaner profit-taking signal.",
        "readings": "Above 1: profit moves dominate; below 1: capitulation selling.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "vdd_multiple": {
        "title": "VDD Multiple",
        "description": "Value Days Destroyed vs its yearly average — old-coin movement detector.",
        "readings": "High readings historically near cycle tops (David Puell framework).",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "nrpl_usd": {
        "title": "Net Realized P/L (USD)",
        "description": "Daily realized profit minus realized loss in USD.",
        "readings": "Large positive spikes = distribution; deep negative = capitulation.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "utxos_in_profit_pct": {
        "title": "UTXOs in profit %",
        "description": "Percentage of UTXOs (not supply weight) currently in profit.",
        "readings": "Finer granularity than supply-in-profit for short-term stress.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "san_daily_active_addresses": {
        "title": "Active addresses (Santiment)",
        "description": "Santiment daily active addresses for Bitcoin.",
        "readings": "Cross-check with Blockchain.info; useful for network adoption trends.",
        "source": "Santiment",
    },
    "san_exchange_inflow": {
        "title": "Exchange inflow (Santiment)",
        "description": "USD value flowing into exchanges (Santiment estimate).",
        "readings": "Rising inflows can signal sell pressure.",
        "source": "Santiment",
    },
    "san_exchange_outflow": {
        "title": "Exchange outflow (Santiment)",
        "description": "USD value leaving exchanges (Santiment estimate).",
        "readings": "Outflows often align with accumulation.",
        "source": "Santiment",
    },
    "san_transaction_volume": {
        "title": "Transaction volume (Santiment)",
        "description": "On-chain transfer volume in USD (Santiment).",
        "readings": "Rising volume can reflect more economic activity on-chain.",
        "source": "Santiment",
    },
    "san_mvrv_usd": {
        "title": "MVRV USD (Santiment)",
        "description": "Santiment MVRV in USD terms for Bitcoin.",
        "readings": "Cross-check with BGeometrics MVRV; elevated readings = richer vs cost basis.",
        "source": "Santiment",
    },
    "san_price_usd": {
        "title": "Price USD (Santiment)",
        "description": "Santiment daily BTC price in USD.",
        "readings": "Reference price series from Santiment catalog.",
        "source": "Santiment",
    },
    "san_social_volume_total": {
        "title": "Social volume (Santiment)",
        "description": "Aggregate social media volume mentioning Bitcoin.",
        "readings": "Spikes can coincide with narrative-driven moves.",
        "source": "Santiment",
    },
    "hashprice": {
        "title": "Hashprice",
        "description": "Miner revenue per unit of hash power.",
        "readings": "Low hashprice stresses miners; recovery supports network security.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "hashrate_bg": {
        "title": "Hash rate",
        "description": "Network hashing power from BGeometrics.",
        "readings": "Trending higher = miner investment; drops may follow price stress.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "hashribbons": {
        "title": "Hash ribbons",
        "description": "Miner capitulation / recovery signal from hash-rate MAs.",
        "readings": "Capitulation inversions often near bottoms; recovery crosses bullish.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "difficulty": {
        "title": "Mining difficulty",
        "description": "Bitcoin difficulty adjustment (~every 2 weeks).",
        "readings": "Rising difficulty = more competition; drops = miner capitulation.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "thermo_price": {
        "title": "Thermo price",
        "description": "Cumulative miner revenue per BTC — production cost proxy.",
        "readings": "Spot below thermo price stresses miners historically.",
        "source": "BGeometrics · bitcoin-data.com",
    },
    "miners_revenue": {
        "title": "Miner revenue",
        "description": "Daily USD miner revenue (subsidy + fees).",
        "readings": "Feeds Puell Multiple; spikes at halving eras.",
        "source": "Blockchain.info",
    },
    "blockchair_stats": {
        "title": "Network snapshot",
        "description": "Live Blockchair network stats — fees, mempool, hashrate, CDD.",
        "readings": "Snapshot KPIs complement historical charts.",
        "source": "Blockchair",
    },
    "stock_to_flow": {
        "title": "Stock-to-Flow (S2F)",
        "description": (
            "Scarcity ratio of circulating supply to annual issuance. Compares how much Bitcoin "
            "already exists (stock) to how much is mined per year (flow)."
        ),
        "readings": (
            "Price above model = rich vs scarcity-implied value; below model = discount to the "
            "halving-driven scarcity regression."
        ),
        "source": "Computed · halving schedule",
    },
    "stock_to_flow_cross": {
        "title": "Stock-to-Flow Cross (S2FX)",
        "description": "S2F tagged by halving-era scarcity phase.",
        "readings": "Phase transitions often align with multi-year cycles.",
        "source": "Computed · S2FX phases",
    },
    "power_law": {
        "title": "Power Law ratio",
        "description": "Spot price vs long-run power-law fair value.",
        "readings": "High ratio = bubble territory vs PLT corridor.",
        "source": "Computed · Santostasi PLT",
    },
    "delta_balanced_price": {
        "title": "Delta / Balanced price",
        "description": "David Puell on-chain equilibrium framework.",
        "readings": "Spot far above balanced = overheated vs on-chain equilibrium.",
        "source": "BGeometrics + computed",
    },
    "pi_cycle_top": {
        "title": "Pi Cycle Top",
        "description": "111DMA crossing 2× 350DMA — late-cycle top signal.",
        "readings": "Cross historically within weeks of cycle tops.",
        "source": "Computed · daily price",
    },
    "rainbow_chart": {
        "title": "Rainbow chart",
        "description": "Log regression color bands on long-run price.",
        "readings": "Red zone = maximum bubble territory historically.",
        "source": "Computed · log regression",
    },
    "nvt_ratio": {
        "title": "NVT Signal",
        "description": "Network value relative to on-chain transfer volume.",
        "readings": "High NVT = price rich vs on-chain utility.",
        "source": "BGeometrics",
    },
    "metcalfe": {
        "title": "Metcalfe ratio",
        "description": "Price vs active-addresses-squared fair value.",
        "readings": "High ratio = speculative premium vs network growth.",
        "source": "Computed · addresses²",
    },
    "coin_days_destroyed": {
        "title": "Coin days destroyed",
        "description": "Weighted measure of old coins moving on-chain.",
        "readings": "Spikes often signal seasoned-holder distribution.",
        "source": "BGeometrics",
    },
    "difficulty_ribbon": {
        "title": "Difficulty ribbon",
        "description": "Mining difficulty SMA compression and expansion.",
        "readings": "Compressed ribbon = miner capitulation risk.",
        "source": "Computed · difficulty",
    },
}

VALUATION_SERIES_KEYS = (
    "mvrv",
    "mvrv_z_score",
    "realized_price",
    "hodl_waves",
    "nupl",
    "sopr",
    "supply_in_profit",
)
FLOWS_SERIES_KEYS = ("exchange_inflow", "exchange_outflow", "exchange_balance", "etf_flow_btc")
NETWORK_SERIES_KEYS = ("tx_count",)
INTELLIGENCE_SERIES_KEYS = (
    "sth_mvrv",
    "lth_mvrv",
    "sth_nupl",
    "lth_nupl",
    "asopr",
    "vdd_multiple",
    "nrpl_usd",
    "utxos_in_profit_pct",
    "san_daily_active_addresses",
    "san_exchange_inflow",
    "san_exchange_outflow",
    "san_transaction_volume",
    "san_mvrv_usd",
)
MINER_SERIES_KEYS = (
    "puell_multiple",
    "hashprice",
    "hashrate_bg",
    "hashribbons",
    "difficulty",
    "thermo_price",
    "miners_revenue",
    "blockchair_stats",
)