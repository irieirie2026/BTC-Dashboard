const METRIC_HELP = {
  "spot-last-price": {
    title: "Last Price",
    body: "The most recent traded price of BTC/USDT on Binance spot. Each new trade updates this value in real time via WebSocket. It reflects what buyers and sellers actually agreed to, not a quoted bid or ask.",
  },
  "spot-24h-change": {
    title: "24h Price Change",
    body: "How much the last price has moved compared to the opening price 24 hours ago. Shown as both a percentage and an absolute USDT difference. Green means up; red means down.",
  },
  "spot-chart": {
    title: "Spot candlestick chart",
    body: "Interactive canvas candlesticks for Binance BTC/USDT. Use the on-chart 1m–1D tabs to switch interval (up to 1,000 bars each). Scroll to zoom, drag to pan, double-click or Reset to fit. The 1m stream updates live via WebSocket; other intervals refresh every 2 minutes.",
  },
  "spot-history-chart": {
    title: "Full price history",
    body: "Interactive daily close chart of all available Binance BTC/USDT history. Use the on-chart buttons for range (1Y–All) and scale (Log/Linear). Scroll to zoom, drag to pan, double-click or Reset to fit full range.",
  },
  "spot-history-log": {
    title: "Log scale",
    body: "Logarithmic y-axis — better for comparing percentage moves across bull and bear cycles over many years.",
  },
  "spot-history-linear": {
    title: "Linear scale",
    body: "Linear y-axis — dollar distance on the chart matches absolute price change. Useful for recent ranges.",
  },
  "high-24h": {
    title: "24h High",
    body: "The highest price BTC/USDT reached on Binance spot in the rolling past 24 hours. Useful for spotting resistance levels and measuring how far price has pulled back from the day's peak.",
  },
  "low-24h": {
    title: "24h Low",
    body: "The lowest price BTC/USDT reached on Binance spot in the rolling past 24 hours. Often acts as a short-term support reference and helps gauge recovery strength after a dip.",
  },
  "vol-btc": {
    title: "24h Volume (BTC)",
    body: "Total amount of Bitcoin traded on the BTC/USDT spot pair in the last 24 hours, measured in BTC. Higher volume usually means stronger conviction behind price moves and better liquidity.",
  },
  "vol-usdt": {
    title: "24h Volume (USDT)",
    body: "Total notional value traded on BTC/USDT spot in the last 24 hours, in USDT. This is volume in BTC multiplied by price. It shows how much capital flowed through the market.",
  },
  "best-bid": {
    title: "Best Bid",
    body: "The highest price a buyer is currently willing to pay on the order book. This is the best available buy quote — you could sell instantly at this price (minus fees) up to the quoted size.",
  },
  "best-ask": {
    title: "Best Ask",
    body: "The lowest price a seller is currently willing to accept on the order book. This is the best available sell quote — you could buy instantly at this price (minus fees) up to the quoted size.",
  },
  spread: {
    title: "Spread",
    body: "The gap between the best ask and best bid. A tight spread means high liquidity and low immediate trading cost. Shown in USDT and as a percentage of the bid price.",
  },
  "weighted-avg": {
    title: "Weighted Average Price",
    body: "Binance's volume-weighted average price (VWAP-style) over the last 24 hours. Trades at higher volume count more. Useful as a fair-value reference compared to the last traded price.",
  },
  "block-height": {
    title: "Block Height",
    body: "The number of blocks mined since Bitcoin's genesis block. Each block bundles confirmed transactions. A higher height means a longer, more mature chain history.",
  },
  "hash-rate": {
    title: "Hash Rate",
    body: "Estimated total computational power securing the Bitcoin network, measured in exahashes per second (EH/s). More hash rate generally means stronger security and higher mining competition.",
  },
  difficulty: {
    title: "Mining Difficulty",
    body: "A measure of how hard it is to find the next valid block. Bitcoin adjusts difficulty roughly every two weeks to keep block times near 10 minutes. Rising difficulty means miners need more work per block.",
  },
  mempool: {
    title: "Mempool",
    body: "Unconfirmed transactions waiting to be included in a block. A large mempool with high fees often signals network congestion. Size (MB) and pending fee totals show demand for block space.",
  },
  "fee-rate": {
    title: "Recommended Fee Rate",
    body: "Suggested transaction fees in satoshis per virtual byte (sat/vB) for timely confirmation. Fast targets quick inclusion; economy is cheaper but slower. Set by mempool.space based on current congestion.",
  },
  "onchain-overview": {
    title: "On-Chain Overview",
    body: "Glassnode-style network health dashboard: live snapshot metrics plus 30-day hashrate and transaction trends from Mempool.space and Blockchain.info.",
  },
  "onchain-network": {
    title: "Network Metrics",
    body: "Live Bitcoin mainnet statistics from Mempool.space and Blockchain.info: block height, hash rate, difficulty, mempool backlog, fee rates, 24h transaction count, circulating supply, and the next difficulty adjustment.",
  },
  "onchain-analysis": {
    title: "On-Chain Analysis",
    body: "Auto-generated briefing synthesizing current network, mining, fee, and supply conditions. Advanced entity-adjusted metrics (exchange flows, MVRV, SOPR) require a paid analytics API.",
  },
  "onchain-hashrate-chart": {
    title: "Hash Rate Trend",
    body: "Historical network hash rate — total mining compute securing Bitcoin. Rising hashrate signals miner investment; drops can follow price stress or seasonal migration.",
  },
  "onchain-tx-chart": {
    title: "Transaction Trend",
    body: "Confirmed Bitcoin transactions per day. Spikes often coincide with volatility, airdrops, or inscription activity; sustained highs indicate heavy base-layer usage.",
  },
  "onchain-diff-chart": {
    title: "Difficulty Adjustments",
    body: "Percent change at each mining difficulty retarget (~every 2016 blocks). Keeps average block time near 10 minutes as hash rate shifts.",
  },
  "onchain-pools-table": {
    title: "Mining Pool Share",
    body: "Blocks mined per pool over the last week (Mempool.space). Concentration among top pools is a decentralization watch item — no single pool should dominate long-term.",
  },
  "onchain-mempool-blocks": {
    title: "Projected Mempool Blocks",
    body: "How the current mempool backlog is expected to clear across upcoming blocks, including median fee rates and transaction counts per projected block.",
  },
  "onchain-fee-chart": {
    title: "Fee Trend",
    body: "Total transaction fees paid to miners per day. Fee spikes reflect congestion and competition for block space during high-demand periods.",
  },
  "onchain-supply-chart": {
    title: "Supply Trend",
    body: "Circulating BTC over time approaching the 21 million hard cap. Issuance slows at each halving until block subsidies approach zero (~2140).",
  },
  "onchain-addresses-chart": {
    title: "Unique Addresses",
    body: "Distinct addresses active per day — a proxy for network participation. Not equal to unique users (one person may use many addresses).",
  },
  "onchain-addresses-table": {
    title: "Address Activity",
    body: "Summary of on-chain participation metrics. Entity-adjusted cohort analysis (Glassnode-style) is not available via free public APIs.",
  },
  "onchain-network-table": {
    title: "Epoch & Chain",
    body: "Difficulty epoch progress, blocks until the next adjustment, mempool backlog, and supply mined to date.",
  },
  "onchain-lightning-table": {
    title: "Lightning Network",
    body: "Layer-2 payment network statistics: BTC locked in channels, node and channel counts, and routing fee parameters. Moved from DeFi — Lightning is native Bitcoin infrastructure.",
  },
  "onchain-lightning-chart": {
    title: "Lightning Snapshot",
    body: "Normalized view of capacity, nodes, and channels for quick comparison of Lightning network scale.",
  },
  "onchain-txs": {
    title: "On-Chain Transactions (24h)",
    body: "Number of confirmed Bitcoin transactions over the last 24 hours across the entire network (not just Binance). Indicates how actively the base layer is being used for transfers and settlements.",
  },
  "circulating-supply": {
    title: "Circulating Supply",
    body: "Total BTC mined and not provably destroyed, compared to the 21 million hard cap. New coins enter circulation through block rewards; the percentage shows progress toward maximum supply.",
  },
  "avg-block-time": {
    title: "Average Block Time",
    body: "Mean time between blocks over the last 24 hours. Bitcoin targets 10 minutes. Consistently faster blocks can precede a difficulty increase; slower blocks can precede a decrease.",
  },
  "difficulty-adj": {
    title: "Next Difficulty Adjustment",
    body: "Projected change in mining difficulty at the next retarget epoch (~every 2016 blocks). Based on how fast recent blocks were mined. Positive % means difficulty will rise; negative means it will fall.",
  },
  "indicator-rsi": {
    title: "RSI (14)",
    body: "Relative Strength Index over 14 bars measures how fast price has risen vs fallen (0–100). Above 70 often flags overbought conditions where upside may stall or reverse; below 30 flags oversold conditions where bounces are more likely. On 1h it guides intraday exhaustion; on 4h/D it frames swing and weekly momentum. Bull/bear badge is a quick heuristic, not a standalone signal.",
  },
  "indicator-rsi7": {
    title: "RSI (7)",
    body: "A faster RSI using 7 bars — more sensitive to recent price changes than RSI(14). Useful for spotting short-term turns earlier, but also more prone to false extremes. On 1h it reacts to the last few hours; on 4h/D it highlights the latest leg of a swing. Pair with slower oscillators before acting.",
  },
  "indicator-macd": {
    title: "MACD (12, 26, 9)",
    body: "Moving Average Convergence Divergence tracks trend momentum. MACD line = EMA(12) − EMA(26); signal = EMA(9) of MACD; histogram = MACD − signal. A rising positive histogram supports bullish continuation; a falling negative histogram supports bearish continuation. Crossovers and histogram flips matter most on 4h and daily for swing direction.",
  },
  "indicator-ema": {
    title: "EMA 20 / 50",
    body: "Exponential moving averages weight recent closes more heavily. EMA 20 is the short-term trend filter; EMA 50 is the intermediate filter. Price above both with EMA 20 > EMA 50 is constructive structure; the reverse is defensive. Distance from these levels often acts as dynamic support/resistance on the selected timeframe.",
  },
  "indicator-ema9": {
    title: "EMA 9",
    body: "Very responsive short-term EMA. Price above EMA 9 suggests immediate bid control; below suggests sellers dominate the latest bars. On 1h it tracks session micro-trend; on 4h/D it marks the front edge of a swing. Frequent crosses — treat as tactical, not structural alone.",
  },
  "indicator-ema921": {
    title: "EMA 9 / 21 Cross",
    body: "Classic short-term crossover: EMA 9 above EMA 21 (golden) favors upside momentum; below (death) favors downside. Faster than EMA 20/50 — best for timing entries within a broader trend. Confirm with trend (ADX/MACD) and volume on 4h and daily screens.",
  },
  "indicator-ema100": {
    title: "EMA 100",
    body: "Medium-long trend filter spanning roughly 100 bars on the active timeframe (~4 days on 1h, ~17 days on 4h, ~5 months on daily). Price above EMA 100 supports bullish bias; below warns of deeper correction risk. Reclaims and losses often define swing invalidation levels.",
  },
  "indicator-sma50": {
    title: "SMA 50",
    body: "Simple 50-bar average — widely watched intermediate trend line. On daily it approximates the ~10-week trend; on 4h it tracks multi-day structure. Holds above SMA 50 support bullish swings; sustained breaks open room toward SMA 100/200.",
  },
  "indicator-sma100": {
    title: "SMA 100",
    body: "100-bar simple average — a slower swing reference between SMA 50 and SMA 200. Useful for identifying whether pullbacks are shallow (hold above) or structural (break below). Especially relevant on 4h and daily for medium-term BTC direction.",
  },
  "indicator-sma200": {
    title: "SMA 200",
    body: "200-bar simple average — the classic long-term trend benchmark on the selected timeframe (~8 days on 1h, ~33 days on 4h, ~200 days on daily). Price above suggests bull regime; below suggests bearish or corrective conditions. Distance % shows how extended BTC is from this anchor.",
  },
  "indicator-golden-cross": {
    title: "SMA 50 / 200 Cross",
    body: "Golden cross: SMA 50 above SMA 200 — often cited as a medium-term bull regime signal. Death cross: SMA 50 below SMA 200 — defensive longer-term structure. Lags price; most meaningful on daily and 4h for forward weekly outlook, less so for 1h scalping.",
  },
  "indicator-vwma": {
    title: "VWMA (20)",
    body: "Volume-Weighted Moving Average over 20 bars — averages price weighted by volume, so high-participation levels matter more. Price above VWMA suggests buyers paid up on volume; below suggests acceptance lower. Compare with plain EMA/SMA to see if volume agrees with the trend.",
  },
  "indicator-bb": {
    title: "Bollinger %B (20, 2)",
    body: "Bollinger Bands = 20-bar SMA ± 2 standard deviations. %B shows where price sits inside the bands (0 = lower band, 100 = upper). Near 100 can mean strength or overextension; near 0 can mean weakness or overshoot. Band walks in strong trends are common — use with volume and trend tools.",
  },
  "indicator-bb-width": {
    title: "Bollinger Width",
    body: "Band width as % of the middle band — measures volatility compression vs expansion. Narrow width (squeeze) often precedes a sharp breakout; wide width suggests moves may be extended or choppy. Forward outlook: watch for expansion after squeezes on your timeframe (hours on 1h, days on 4h, weeks on D).",
  },
  "indicator-stoch": {
    title: "Stochastic (14, 3)",
    body: "%K compares the close to the recent 14-bar high-low range; %D is a 3-bar average of %K. Above 80 = overbought zone; below 20 = oversold zone. Good for timing turns within a range; in strong trends, can stay extreme for many bars. Crossovers near extremes can flag short-term reversals.",
  },
  "indicator-stoch-rsi": {
    title: "Stoch RSI (14)",
    body: "Stochastic oscillator applied to RSI instead of price — extra sensitivity to momentum shifts. Reaches 0/100 more often than classic Stochastic. Useful for spotting RSI turning points early; confirm with price structure before trading. %D smooths %K.",
  },
  "indicator-willr": {
    title: "Williams %R (14)",
    body: "Measures close vs the 14-bar high-low range on a −100 to 0 scale. Above −20 = overbought; below −80 = oversold. Similar information to Stochastic but inverted scale. Best for identifying short-term exhaustion on 1h/4h; less reliable alone in strong trends.",
  },
  "indicator-roc": {
    title: "ROC (12)",
    body: "Rate of Change — percent difference between the current close and the close 12 bars ago. Positive ROC means price is higher than 12 bars back; negative means lower. Captures momentum speed. Large positive/negative readings can flag extended moves due for pause on the active timeframe.",
  },
  "indicator-cci": {
    title: "CCI (20)",
    body: "Commodity Channel Index measures deviation from a 20-bar average of typical price (H+L+C)/3. Above +100 = extended high; below −100 = extended low. Useful for spotting overbought/oversold vs the recent mean. Mean-reversion tool — trend filters (ADX, MAs) help avoid fading strong moves.",
  },
  "indicator-mfi": {
    title: "MFI (14)",
    body: "Money Flow Index is volume-weighted RSI (0–100). Incorporates whether closes occur on volume near the high (buying) or low (selling) of each bar. Above 60–70 suggests buying pressure; below 30–40 suggests selling pressure. Divergence vs price can warn of weakening moves ahead on the selected timeframe.",
  },
  "indicator-adx": {
    title: "ADX (14)",
    body: "Average Directional Index measures trend strength (not direction). Above 25 = strong trend environment where directional signals carry more weight; below 20 = weak/choppy trend. +DI vs −DI shows whether bulls or bears lead. Rising ADX supports continuation trades; falling ADX warns of range conditions ahead.",
  },
  "indicator-aroon": {
    title: "Aroon (25)",
    body: "Aroon Up/Down track how recently the 25-bar high and low occurred. Oscillator = Aroon Up − Aroon Down. Strongly positive = recent highs dominate (uptrend bias); strongly negative = recent lows dominate (downtrend bias). Helps identify emerging trend direction and whether consolidation is resolving.",
  },
  "indicator-trix": {
    title: "TRIX (15)",
    body: "Triple-smoothed EMA rate of change — filters noise to show underlying momentum direction. Positive TRIX supports bullish bias; negative supports bearish bias. Small absolute values near zero suggest flat momentum. Best combined with MACD/ADX for confirmation on 4h and daily forward views.",
  },
  "indicator-atr": {
    title: "ATR (14)",
    body: "Average True Range — expected bar volatility in USDT (not percent). Higher ATR = wider recent swings; lower ATR = quieter market. ATR % of price helps size stops and set realistic move expectations: e.g. 1h ATR for intraday ranges, daily ATR for weekly swing potential.",
  },
  "indicator-keltner": {
    title: "Keltner Channel",
    body: "EMA(20) channel with bands at ± 2× ATR(10). Shows volatility-adjusted trend envelope. Price near upper band = strong/extended upside; near lower = weak/extended downside. Often compared with Bollinger Bands — Keltner uses ATR, Bollinger uses standard deviation.",
  },
  "indicator-donchian": {
    title: "Donchian Channel (20)",
    body: "20-bar highest high and lowest low — classic breakout channel. Price at the upper edge flags range highs / breakout potential; at the lower edge flags range lows / breakdown risk. % position shows where BTC sits in the recent range — key for swing high/low context on 4h and daily.",
  },
  "indicator-obv": {
    title: "OBV Trend",
    body: "On-Balance Volume cumulates volume on up bars minus volume on down bars. The 14-bar slope shown here tracks whether volume flow is rising (accumulation) or falling (distribution). Rising OBV with flat price can precede upside; falling OBV with flat price can precede downside — confirm with price breaks.",
  },
  "indicator-cmf": {
    title: "CMF (20)",
    body: "Chaikin Money Flow sums volume-weighted close location over 20 bars. Positive CMF (> +0.05) suggests accumulation — closes tend toward bar highs on volume. Negative CMF (< −0.05) suggests distribution. Near zero = balanced flow. Volume confirmation is critical for forward BTC price calls.",
  },
  "indicator-vol-ratio": {
    title: "Volume / SMA(20)",
    body: "Current bar volume divided by the 20-bar average. Above 1.0 = above-average participation; above 1.5 = elevated activity often seen on breakouts/breakdowns. Below 0.8 = thin market where moves may lack follow-through. Use to validate whether technical signals are backed by real flow.",
  },
  "indicator-force": {
    title: "Force Index (13)",
    body: "Alexander Elder's Force Index: price change × volume, smoothed with EMA(13). Positive = buying force dominates; negative = selling force dominates. Captures whether moves have volume conviction. Spikes align with impulsive bars; sustained sign supports directional bias on the active timeframe.",
  },
  "indicators-overview": {
    title: "Technical Indicators",
    body: "Binance BTC/USDT klines (250 bars) on the selected timeframe (1h, 4h, or D). Thirty-plus indicators grouped into Momentum, Trend, Moving Averages, Volatility, and Volume. Sports-car dashboard gauges summarize each category; bull/bear badges are heuristics for scanning — not trade signals alone.",
  },
  "indicators-briefing": {
    title: "Technical Overview",
    body: "Forward-looking BTC price commentary tailored to the active timeframe: 1h focuses on the next 6–24 hours, 4h on the next 2–5 days, D on the next 1–4 weeks. Includes composite gauge read, key drivers (RSI, MACD, bands, volume), base-case scenario, and invalidation levels. Heuristic only — not financial advice.",
  },
  "indicators-timeframe": {
    title: "Indicator Timeframe",
    body: "Candle interval for all indicators and commentary on this screen. 1h = intraday/hourly structure; 4h = short swing (multi-day); D = medium-term weekly positioning. Each timeframe has its own gauges, indicator list, and forward outlook — always match your trade horizon to the selected tab.",
  },
  "chart-patterns-overview": {
    title: "Chart Patterns",
    body: "Classical pattern recognition on Binance BTC/USDT. Only one pattern is drawn on the chart at a time — pick from the sidebar list. Structure uses a bright recycled palette (cyan support, pink resistance, gold structure, green/red targets). Dashed lines after apex or trigger are measured-move projections. Filter the list by category: Reversal, Flags, Triangles, Wedges, Range.",
  },
  "chart-patterns-tf-d": {
    title: "Daily Patterns",
    body: "Uses 1d candles (~5 years of history). Best for swing and position traders — patterns resolve over days to weeks. Measured-move targets project from daily breakouts.",
  },
  "chart-patterns-tf-w": {
    title: "Weekly Patterns",
    body: "Uses 1w candles (~5 years). Filters noise for medium-term structure — ideal for multi-week BTC trend and reversal setups.",
  },
  "chart-patterns-tf-m": {
    title: "Monthly Patterns",
    body: "Uses 1M candles (~10 years). Long-horizon macro chart structure — major reversals and secular trend channels.",
  },
  "chart-patterns-list": {
    title: "Detected Patterns",
    body: "Only one pattern on the chart at a time. Filter by category, click a row to display it. Pattern Detail spans the full panel width below the chart — every chart label explained, plus trigger rules (what close confirms or invalidates the setup).",
  },
  "cross-market-overview": {
    title: "Cross-Market Anomaly Monitor",
    body: "Tracks BTC across 12+ centralized exchanges in parallel. Every venue price is converted to USD (using live FX for KRW, JPY, EUR, etc.), compared to a Binance USDT reference, and scanned for statistical anomalies. Binance trades also stream over WebSocket for sub-second updates. REST snapshots refresh every 5 seconds when server.py (or the Vercel API) is available.",
  },
  "cross-market-how-it-works": {
    title: "How this monitor works",
    body: "Pipeline: (1) fetch venue prices from CEX APIs, (2) normalize to USD, (3) compute regional premiums (Kimchi, Coinbase, Japan…), (4) run a client-side z-score engine on 1m/5m returns, (5) cluster simultaneous anomalies into a propagation graph, (6) optionally match headlines from the app's news feeds. Orange = elevated; red-hot z-scores ≥2σ. Card sparklines show recent premium history.",
  },
  "cross-market-meta": {
    title: "Feed status",
    body: "● Live (browser) = direct fetch from your browser (Binance, Coinbase, Kraken, Bitstamp, Gemini, OKX, Bybit, Upbit, Bithumb, bitFlyer, perps, DEX) merged every poll — no server required. ● Live = cross-market API. ● Live (exchanges) = server bridge. WebSockets overlay Binance, Coinbase, Kraken, OKX, Bitstamp, Gemini, Bybit. Poll every 5s.",
  },
  "cross-market-refresh": {
    title: "Refresh",
    body: "Force an immediate snapshot fetch, bypassing the 5-second poll timer. Use after starting server.py or changing API keys.",
  },
  "cross-market-settings": {
    title: "Settings",
    body: "Tune anomaly sensitivity: z-score threshold (default 2σ) for return shocks, premium move % over 60s for Kimchi/Coinbase spikes, and an optional webhook URL for outbound alerts. Alerts are deduplicated for 5 minutes per venue/event type.",
  },
  "cross-market-global-ref": {
    title: "Global Reference",
    body: "Anchor price — typically Binance BTC/USDT last trade. All premiums and cross-venue spreads are measured relative to this USD-equivalent benchmark. When Binance WS is connected, this updates in real time.",
  },
  "cross-market-kimchi-hero": {
    title: "Kimchi Premium",
    body: "Korea-specific BTC premium: average USD-equivalent price on Upbit and Bithumb (KRW pairs) minus the global reference, as a %. Sustained values above ~2% often reflect strong local demand, capital controls, or Korea-only news. Sharp spikes can precede local regulatory headlines.",
  },
  "cross-market-coinbase-hero": {
    title: "Coinbase Premium",
    body: "Coinbase BTC/USD vs the USDT reference. A positive premium means USD spot on Coinbase trades above Binance USDT — common during US institutional buying or banking-hour flows. Negative = discount.",
  },
  "cross-market-venues-live": {
    title: "Venues Live",
    body: "Count of exchanges reporting a valid price in the current snapshot. Includes spot and perp rows where available. The error count (if any) lists venues whose API failed on the last fetch.",
  },
  "cross-market-premiums-section": {
    title: "Live Premiums",
    body: "Regional and venue-specific premiums vs the global reference. Each card shows local USD price, reference price, current % premium, and a sparkline of recent premium history. Cards turn blue at ≥1% and orange at ≥2% absolute premium.",
  },
  "cross-market-kimchi-premium": {
    title: "Kimchi (KRW)",
    body: "Combined Korea premium from KRW spot venues (Upbit, Bithumb). Converted to USD using the live KRW/USD rate. The Kimchi trade is a well-known arb signal between Korean and offshore BTC markets.",
  },
  "cross-market-coinbase-premium-card": {
    title: "Coinbase USD",
    body: "Coinbase Pro/Exchange BTC-USD premium vs Binance USDT. Often interpreted as a proxy for US spot demand and ETF-related flows.",
  },
  "cross-market-jpy-premium": {
    title: "Japan (JPY)",
    body: "bitFlyer (and other JPY venues when live) vs the global reference. Reflects Japan domestic demand and local exchange liquidity.",
  },
  "cross-market-kraken-premium": {
    title: "Kraken USD",
    body: "Kraken BTC/USD vs reference. Useful for comparing US/EU regulated venue pricing.",
  },
  "cross-market-bitstamp-premium": {
    title: "Bitstamp USD",
    body: "Bitstamp BTC/USD vs reference — one of the longest-running EU USD pairs.",
  },
  "cross-market-gemini-premium": {
    title: "Gemini USD",
    body: "Gemini BTC/USD vs reference — US-regulated exchange often used by institutions.",
  },
  "cross-market-venues": {
    title: "Venues × Crosses",
    body: "Full matrix of tracked exchanges and currency crosses (USDT, USD, KRW, JPY, EUR…). Sorted by |z₁ₘ| so the most anomalous venues float to the top. WS badge = Binance live WebSocket overlay.",
  },
  "cross-market-exchange": {
    title: "Exchange",
    body: "CEX name (Binance, Coinbase, Upbit, Kraken, OKX, Bybit, etc.). Stale tag means the quote is older than the freshness threshold on the last REST fetch.",
  },
  "cross-market-pair": {
    title: "Pair",
    body: "Native trading pair on that exchange, e.g. BTC/USDT, BTC/USD, BTC/KRW. FX conversion to USD uses Frankfurter rates for non-USD quotes.",
  },
  "cross-market-price": {
    title: "USD Price",
    body: "Last venue price in USD (2 decimal places). WebSocket venues (Binance, Coinbase, Kraken, OKX, etc.) update on every tick; others refresh every 3–5s. Z-scores and premiums can move when the Binance reference shifts even if this venue’s price is unchanged — check Premium % and Ref columns too.",
  },
  "cross-market-ref": {
    title: "Reference USD",
    body: "Global anchor used for premium/discount — Binance BTC/USDT spot (USDT ≈ USD). Premium % = (Venue USD − Ref) / Ref × 100. Same reference for every row in the snapshot.",
  },
  "cross-market-premium": {
    title: "Premium %",
    body: "(Venue USD − Global Reference) / Reference × 100. Positive = venue trades above the anchor; negative = discount. Useful for spotting regional dislocations and arb windows.",
  },
  "cross-market-zscore": {
    title: "z₁ₘ (1-minute)",
    body: "Standardized 1-minute return: (r − μ) / σ over the rolling window in the client engine. |z| ≥ 2 (default) flags a short-term price shock at that venue. Highlighted in orange when hot.",
  },
  "cross-market-zscore-5m": {
    title: "z₅ₘ (5-minute)",
    body: "Same z-score logic on 5-minute returns — smoother, catches sustained moves rather than single-tick noise. Both z₁ₘ and z₅ₘ contribute to alerts.",
  },
  "cross-market-market-type": {
    title: "Market",
    body: "spot = deliverable spot market; perp = USD-margined perpetual futures. Perp rows may include basis vs spot when the live API provides it.",
  },
  "cross-market-heatmap": {
    title: "Anomaly Heatmap",
    body: "Combined anomaly score per venue = max(z, premium spike, cross σ). z = max(|z₁ₘ|, |z₅ₘ|). premium spike = |Δpremium₆₀| ÷ threshold (default 1.5%). cross σ = |venue USD − VWAP| ÷ peer σ. Color: calm → warm → hot → extreme. Subtitle shows all three components. Sorted hottest first.",
  },
  "cross-market-alerts": {
    title: "Active Alerts",
    body: "Extreme alerts only (high severity): |z|≥3 return shocks, large premium Δ60s (≥2.5%), or devσ≥3 cross-divergence. Medium events are logged internally but not shown here. Deduped 5 min; toasts fire for the same extreme set.",
  },
  "cross-market-propagation": {
    title: "Propagation",
    body: "Tracks how anomalies spread across venues. When ≥2 exchanges fire shocks within 10–45 seconds, they form a cluster. The earliest event is the origin (t₀); every follower delay is measured from that moment. Use the section tooltips below for how each number is calculated.",
  },
  "cross-market-prop-meta": {
    title: "Cluster status",
    body: "Status line above the stats grid:<ul><li><strong>● Active cluster</strong> — A live cluster with propagation edges on the current tick.</li><li><strong>Last cluster · N ago</strong> — The last observed cluster is kept on screen until a new one appears; N = time since it was last live.</li><li><strong>Timeline · delays measured from origin</strong> — Shown when no cluster has been seen yet; all delays use t₀ as the reference.</li></ul>",
  },
  "cross-market-prop-stats": {
    title: "Cluster stats",
    body: "Summary metrics for the active (or last observed) cluster:<ul><li><strong>Origin</strong> — Venue or premium label of the earliest anomaly (defines t₀).</li><li><strong>Events</strong> — All anomaly events in the last 45s window: z-score shocks, premium spikes, and cross-divergence. Includes the origin; can exceed Followers if one venue fires multiple types.</li><li><strong>Followers</strong> — Venues that reacted ≥10s after origin. Equals the number of edges in the list and chart.</li><li><strong>Avg delay</strong> — Mean seconds from t₀ to each follower, rounded.</li><li><strong>Spread velocity</strong> — Median origin→follower delay (seconds). Lower = faster cross-venue catch-up.</li><li><strong>Delay range</strong> — Shortest and longest origin→follower delay (min–max seconds).</li></ul>",
  },
  "cross-market-prop-edges": {
    title: "Arrival order",
    body: "Followers sorted by when they reacted after the origin:<ul><li><strong>#rank</strong> — Arrival order; #1 = fastest follower after t₀.</li><li><strong>+Ns</strong> — Seconds after origin when that venue fired (cumulative from t₀, not hop time).</li><li><strong>(+Δs)</strong> — Catch-up step since the previous follower in this sorted list: delay[i] − delay[i−1].</li></ul>",
  },
  "cross-market-prop-chart": {
    title: "Propagation timeline",
    body: "Schematic vertical cascade (not geographic). ORIGIN · t₀ is first; followers are ordered by arrival time.<ul><li><strong>Gap +Ns</strong> — First segment only: seconds after origin (same as the first follower’s +Ns).</li><li><strong>Gap +Δs</strong> — Later segments: catch-up seconds since the prior follower in the timeline.</li><li><strong>Footer median / avg</strong> — Same values as Spread velocity and Avg delay in the stats grid.</li><li><strong>Connector color</strong> — Green ≤20s, orange ≤45s, blue slower. Hover a box or gap for full timing.</li></ul>",
  },
  "cross-market-news": {
    title: "News Attribution",
    body: "On high-severity live anomalies, queries the dashboard's RSS + X news cache for matching keywords (Korea, ETF, tariff, regulation, liquidation, etc.). Confidence % is a heuristic text match — not a verdict. Click to open the source article.",
  },
  "cross-market-ws": {
    title: "WebSocket (WS)",
    body: "Multi-venue overlay: Binance, Coinbase, Kraken, and OKX public trade/ticker streams update rows between 5s REST polls. LIVE badge = WebSocket tick; STALE = REST quote older than 30s without a fresh WS tick.",
  },
  "cross-market-basis": {
    title: "Basis %",
    body: "Perp vs spot basis when the server provides it: (perp USD − spot ref) / ref × 100. Positive = perp trading at a premium (contango); negative = discount (backwardation). DEX perps (Hyperliquid, dYdX) include funding context.",
  },
  "cross-market-funding": {
    title: "Funding Rate",
    body: "8h-equivalent perpetual funding rate (%). Positive = longs pay shorts; negative = shorts pay longs. Extreme funding alongside premium spikes can signal crowded positioning.",
  },
  "cross-market-dev-sigma": {
    title: "Cross Deviation σ",
    body: "Threshold for cross-venue divergence alerts: |venue USD − VWAP| / σ_vwap. Default 2σ flags venues trading far from the peer median — useful for arb dislocations independent of return z-scores.",
  },
  "cross-market-charts": {
    title: "Charts",
    body: "Premium timeline (Kimchi, Coinbase, JPY, Kraken % vs ref over recent snapshots), z-score time matrix (venue × time heatmap), and propagation graph (origin → followers with delay seconds and spreadVelocity).",
  },
  "cross-market-premium-chart": {
    title: "Premium Timeline",
    body: "Multi-line chart of regional premium % history from the client engine buffer. Builds over ~4 minutes of polling; sharper slopes indicate accelerating dislocations.",
  },
  "cross-market-zmatrix-chart": {
    title: "Z-Score Time Matrix",
    body: "Heatmap of |z₁ₘ| per venue across recent time buckets. Orange cells = short-term return shocks; scan left-to-right for which exchange moved first.",
  },
  "cross-market-chart-window": {
    title: "Chart Window",
    body: "Fixed sliding window for both charts: axis always spans the full selection (5s → 1d) with “now” on the right. Early on, lines grow in from the right; as history fills, older points scroll left. 1d with only minutes of data still shows a 24h-wide axis — not zoomed to fit.",
  },
  "cross-market-spread-velocity": {
    title: "Spread Velocity",
    body: "Median propagation delay (seconds) from the cluster origin to follower venues. Low spreadVelocity (&lt;45s) = fast cross-venue contagion; high = slow regional catch-up.",
  },
  "cross-market-stale": {
    title: "Stale Quote",
    body: "REST snapshot for this venue is older than 30s and no WebSocket tick has refreshed it. Common for Korea/Japan venues when only browser CEX mode is active.",
  },
  "cross-market-dex": {
    title: "DEX Venues",
    body: "Decentralized quotes (Jupiter wBTC, DefiLlama pools, Hyperliquid/dYdX perps) fetched server-side. Weighted lower in VWAP but included in cross-divergence scans.",
  },
  "prediction-markets-overview": {
    title: "Prediction Markets",
    body: "Live prediction markets from Polymarket (Gamma API) and Kalshi. Filter by Bitcoin, finance, economics, politics, and geopolitics. BTC-related markets are highlighted. Auto-refreshes every 60 seconds with server-side cache.",
  },
  "prediction-markets-question": {
    title: "Market Question",
    body: "The resolution question for the contract. Click any row or card for details; use Trade link for the source platform.",
  },
  "prediction-markets-yes": {
    title: "Yes Probability",
    body: "Implied probability of Yes resolving (0–100%). Green when ≥50%.",
  },
  "prediction-markets-volume": {
    title: "24h Volume",
    body: "Notional traded in the last 24 hours — liquidity and price-discovery signal.",
  },
  "prediction-markets-total-volume": {
    title: "Total Volume",
    body: "Lifetime notional traded on the contract.",
  },
  "prediction-markets-end": {
    title: "End Date",
    body: "Scheduled resolution date for the market.",
  },
  "prediction-markets-platform": {
    title: "Platform",
    body: "Polymarket (crypto-native) or Kalshi (US-regulated). Public APIs with mock fallback.",
  },
  "prediction-markets-category": {
    title: "Category",
    body: "Multi-select topic tags: Bitcoin, Finance, Economics, Politics, Geopolitics. Empty selection shows all.",
  },
  "prediction-markets-outlook": {
    title: "Market Outlook",
    body: "Aggregated sentiment by topic, lead macro contracts, and automated arb scan across Polymarket/Kalshi: cross-venue spreads (>5pp), Yes+No sum discounts, and BTC strike-ladder inconsistencies. Edges are pre-fee; not financial advice.",
  },
  "mm-overview": {
    title: "Misc Metrics",
    body: "Cross-source BTC dashboard metrics from free public APIs only: CoinGecko, Mempool.space, Blockchain.info, and Alternative.me. Server cache refreshes every 5 minutes.",
  },
  "mm-btc-dominance": {
    title: "Bitcoin Dominance",
    body: "BTC share of total crypto market cap from CoinGecko /global. Sparkline uses BTC/ETH market-cap ratio scaled to current dominance when historical global dominance is unavailable on the free tier.",
  },
  "mm-fear-greed": {
    title: "Fear & Greed Index",
    body: "Alternative.me composite sentiment index (0–100). Color-coded zones from Extreme Fear to Extreme Greed. Seven-day sparkline shows recent mood shifts.",
  },
  "mm-mayer-multiple": {
    title: "Mayer Multiple",
    body: "Spot BTC price divided by its 200-day simple moving average (CoinGecko daily prices). Historically <1 suggests undervaluation; >2.4 often coincides with overheated cycles.",
  },
  "mm-puell-multiple": {
    title: "Puell Multiple",
    body: "Daily miner issuance revenue (3.125 BTC × 144 blocks) vs its 365-day average. Elevated readings reflect strong issuance-dollar flows relative to the yearly norm.",
  },
  "mm-nvt-ratio": {
    title: "NVT Ratio (approx)",
    body: "Market cap divided by Blockchain.info estimated daily on-chain USD transfer volume. Higher values imply price is rich relative to on-chain settlement activity.",
  },
  "mm-hashprice": {
    title: "Hashprice",
    body: "Estimated daily miner revenue (block subsidy + fees) per exahash of network hashrate. Combines Mempool.space hashrate and fee estimates with CoinGecko BTC price.",
  },
  "mm-mempool-pressure": {
    title: "Mempool Pressure Score",
    body: "Composite 0–100 score from mempool vsize vs a typical full block (~1.5M vbytes) and recommended fast fee rate. Higher = more congestion and fee urgency.",
  },
  "mm-dom-fg-composite": {
    title: "Dominance × F&G Composite",
    body: "BTC dominance multiplied by Fear & Greed ÷ 50. Weights market-share strength by sentiment — higher when BTC leads in a greedy tape.",
  },
  "mm-about": {
    title: "About these metrics",
    body: "Derived ratios are approximations for dashboard context, not trading signals. Sources are free-tier public endpoints with no API keys; partial failures may leave some cards empty.",
  },
  "mm-whales-overview": {
    title: "Whale Proxies",
    body: "Free Mempool.space-based whale activity proxies: labeled exchange wallet balances/flows, large-transaction scanner (≥100 BTC), dormant-movement spike score, and rich-address snapshots. Not a substitute for paid entity attribution.",
  },
  "mw-exchange-panel": {
    title: "Exchange Address Tracking",
    body: "Configurable list of major exchange hot/cold wallets (public labels). Balance from chain UTXO sums; 24h inflow/outflow parsed from recent confirmed txs.",
  },
  "mw-exchange-label": {
    title: "Wallet Label",
    body: "Best-effort public label (e.g. Binance Cold). Addresses are examples — exchanges rotate wallets.",
  },
  "mw-exchange-venue": {
    title: "Venue",
    body: "Exchange or custodian associated with the address label.",
  },
  "mw-exchange-balance": {
    title: "Balance",
    body: "Current on-chain balance (BTC) from Mempool.space address stats.",
  },
  "mw-exchange-inflow": {
    title: "24h Inflow",
    body: "BTC received by this address in confirmed txs over the last 24 hours.",
  },
  "mw-exchange-outflow": {
    title: "24h Outflow",
    body: "BTC sent from this address in confirmed txs over the last 24 hours.",
  },
  "mw-exchange-txs": {
    title: "24h Transactions",
    body: "Count of confirmed transactions touching this address in the last 24 hours.",
  },
  "mw-large-panel": {
    title: "Large Transaction Proxy",
    body: "Scans mempool recent txs plus the first page of txs from the last 10 blocks for outputs ≥100 BTC. Sample-based, not exhaustive.",
  },
  "mw-large-1h": {
    title: "Large Txs (1h)",
    body: "Count and total BTC volume of ≥100 BTC transactions detected in the last hour.",
  },
  "mw-large-24h": {
    title: "Large Txs (24h)",
    body: "Count and total BTC volume of ≥100 BTC transactions in the last 24 hours (sample window).",
  },
  "mw-large-spark": {
    title: "24h Large-Tx Activity",
    body: "Hourly count of large transactions in the sampled window.",
  },
  "mw-dormant": {
    title: "Dormant Movement Proxy",
    body: "CDD-style approximation: spike score when ≥100 BTC movements in the last hour exceed the 24h hourly average. True coin-age dormancy requires input-age data from paid providers.",
  },
  "mw-rich-100": {
    title: "Addresses >100 BTC",
    body: "Global count from public BitInfoCharts distribution snapshot. Tracked proxy counts how many labeled exchange wallets in this panel exceed 100 BTC.",
  },
  "mw-rich-1k": {
    title: "Addresses >1,000 BTC",
    body: "Global count snapshot plus tracked exchange-wallet proxy count. Live network-wide rich lists need paid labeling APIs.",
  },
  "kg-overview": {
    title: "Knowledge Graph",
    body: "Build RAG charts: knowledge graphs plus ingested documents, queried with retrieval-augmented generation. Start on the Overview tab for the 5-step workflow. Data persists per workspace in localStorage.",
  },
  "kg-rag-chart": {
    title: "What is a RAG chart?",
    body: "A RAG chart joins three pieces: (1) a knowledge graph of entities and relationships, (2) chunked source documents from ingestion, and (3) retrieval that pulls relevant graph paths and text passages when you ask a question. The graph shapes which relationship paths appear in search results — not just keyword matches.",
  },
  "kg-schema-deep": {
    title: "Schema Designer",
    body: "Inventory (left) and inspector (right) for curating nodes and edges. Toolbar adds items and saves. Use the Graph tab for the full visual view — Schema Designer is for editing, not visualization.",
  },
  "kg-schema-instruction": {
    title: "Schema Designer",
    body: "Inventory and inspector side by side. Select items in the list to edit in the inspector. Add nodes/edges via the toolbar. Open the Graph tab for the full interactive visualization.",
  },
  "kg-ingest-merge": {
    title: "Automatic nodes and edges",
    body: "After Ingest & extract, a hybrid LLM + rule pass proposes nodes and edges with labels, typed categories (asset, org, metric, indicator, policy, regulation, …), and short descriptions. For Bulk discover sources, extraction is tuned to your discovery goal. Review mode (recommended) lets you approve, edit, or reject before items join the live graph.",
  },
  "kg-example-flow": {
    title: "Example workflow",
    body: "Template workspace → ingest article → approve extractions in the review panel → curate in Schema Designer → RAG search with grounded paths and snippets. Re-extract any document from the Documents table.",
  },
  "kg-rag-steps": {
    title: "6-step workflow",
    body: "Workspace → Schema → Ingest → Graph → Search → Iterate. Each step builds on the last. Use Go buttons to jump directly to the tab you need.",
  },
  "kg-step-graph": {
    title: "Step 4 — Full graph",
    body: "Open the Graph tab for a maximized vis.js view of your workspace. Fit the view, toggle physics and edge labels, search nodes, and inspect selections in the side panel.",
  },
  "kg-step-workspace": {
    title: "Step 1 — Workspace",
    body: "Pick or create an isolated experiment. Each workspace stores its own graph, documents, ingest log, and RAG history so you can compare setups without overwriting prior work.",
  },
  "kg-step-schema": {
    title: "Step 2 — Seed schema (optional)",
    body: "Manually add anchor nodes/edges or use a workspace template before ingesting. Not required — ingestion can build the graph from documents alone.",
  },
  "kg-step-ingest": {
    title: "Step 3 — Ingest & extract",
    body: "Describe a discovery goal — Grok plans Google searches, you approve pages/videos/images/news, then ingest. Or add URL/text/file manually. Extraction review adds nodes and edges to the graph.",
  },
  "kg-step-rag": {
    title: "Step 5 — RAG search",
    body: "Ask a natural-language question. The server scores document chunks and graph nodes, finds relationship paths, and optionally calls xAI Grok with that context only.",
  },
  "kg-step-iterate": {
    title: "Step 6 — Iterate",
    body: "Duplicate workspaces, adjust schema or sources, re-run the same queries, and compare RAG history entries to see how graph design affects answers.",
  },
  "kg-grok-tip": {
    title: "Grok LLM (optional)",
    body: "Set XAI_API_KEY in Vercel or .env.local (default model grok-3-mini). Powers bulk discover search planning, node/edge extraction after ingest, and RAG answers. For Google results also set GOOGLE_API_KEY + GOOGLE_CSE_ID (Programmable Search Engine).",
  },
  "kg-workspace-select": {
    title: "Workspace selector",
    body: "Switch between saved RAG chart experiments. Saving writes schema, documents, and history to localStorage under the active workspace ID.",
  },
  "kg-ingest-instruction": {
    title: "Ingestion",
    body: "Describe a discovery goal — Grok plans Google search phrases and fetches pages, videos, images, and news (~10 per type per phrase). Approve results, ingest, then review extracted nodes/edges. Or ingest URL/text/file manually. The Documents table lists only approved, extracted sources; items still in review stay in Extraction review until merged.",
  },
  "kg-discover": {
    title: "Bulk discover",
    body: "Write a goal in plain language. Grok (XAI_API_KEY) expands it into search phrases; the server runs Google searches per phrase for web, video, image, and news. Set GOOGLE_API_KEY + GOOGLE_CSE_ID for Custom Search; HTML/fallback used otherwise.",
  },
  "kg-discover-review": {
    title: "Discovery review",
    body: "Pre-ingest approval for discovered URLs and assets. Badges show content type and the Grok search phrase. Approve items, then Ingest approved runs ingest + extraction.",
  },
  "kg-discover-goal": {
    title: "Discovery goal",
    body: "Natural-language brief of what sources you need. Grok turns this into diverse Google search phrases. Example: ETF flows, post-halving miner economics, and SEC regulation articles for a macro BTC graph.",
  },
  "kg-search-instruction": {
    title: "Topic Search + RAG",
    body: "Query the combined graph + document store. Results show an answer, matching nodes, graph paths, and source snippets. History stores each run for comparison.",
  },
  "kg-workspaces-instruction": {
    title: "Workspace management",
    body: "Organize multiple RAG charts. Templates seed common BTC/macro graphs. Import JSON creates a new workspace without replacing the active one.",
  },
  "kg-inspector": {
    title: "Inspector",
    body: "Edit the selected node or edge: label, type, source, target. Changes apply on Save node/edge. Delete removes the item from the graph.",
  },
  "kg-ingest-url": {
    title: "Source URL",
    body: "HTTP(S) link to ingest directly, or a page with many links (YouTube channel, news index). Use Search & filter beside this field to extract and approve child URLs before ingest. Single YouTube videos need captions or an SRT/VTT upload.",
  },
  "kg-ingest-title": {
    title: "Document title",
    body: "Optional display name in search snippets and the ingest log. Defaults to filename or URL if omitted.",
  },
  "kg-ingest-text": {
    title: "Plain text / Markdown",
    body: "Paste content directly when no URL is available. Processed locally if the server is unreachable.",
  },
  "kg-ws-name": {
    title: "Workspace name",
    body: "Short identifier shown in the dropdown and workspace table.",
  },
  "kg-ws-desc": {
    title: "Workspace description",
    body: "Optional notes — e.g. which sources you ingested or what hypothesis you are testing.",
  },
  "kg-ws-template": {
    title: "Workspace template",
    body: "Blank starts empty. BTC basics and Macro links seed starter nodes/edges. Duplicate copies the current workspace including documents.",
  },
  "kg-workspaces": {
    title: "Workspaces",
    body: "Create named snapshots of schema, documents, and RAG history. Use templates (BTC basics, macro links) or duplicate an existing workspace to iterate quickly. Export/import JSON for backup or sharing.",
  },
  "kg-rag-history": {
    title: "RAG History",
    body: "Per-workspace log of past queries with chunk/node counts and LLM vs local mode. Click View to restore a previous answer and compare results across different graph setups.",
  },
  "kg-elements": {
    title: "Graph Inventory",
    body: "Unified inventory with stats, search, type filters, and Nodes/Edges toggle. Check rows to bulk-delete: Select all toggles every visible item in the current filter; Del nodes/edges opens a confirmation dialog before erasing. Graph jumps to the full Graph tab; Edit opens the Schema inspector.",
  },
  "kg-graph-view": {
    title: "Full Graph",
    body: "Maximized interactive graph for the active workspace. Drag nodes, zoom, fit view, toggle physics and edge labels. Click items to inspect; use Schema Designer to edit. Find nodes quickly with the search box.",
  },
  "kg-ingest-log": {
    title: "Ingestion Log",
    body: "Recent ingest jobs with chunk and extracted-node counts. Mode shows server (API) vs local (browser fallback). Extraction runs after each ingest; graph updates happen after review approval (or immediately if review mode is off).",
  },
  "kg-ingest-upload": {
    title: "Bulk upload",
    body: "Drop or browse PDF, TXT, MD, SRT/VTT transcripts, or RSS/XML feeds. Audio/video need a transcript file — speech-to-text is not enabled. Each file is chunked and passed to extraction after ingest.",
  },
  "kg-ingest-run": {
    title: "Ingest & extract",
    body: "Add a new URL, pasted text, or uploaded files here — then run ingest + extraction. For Bulk discover results, use Ingest approved in Discovery review instead. After any ingest, finish in Extraction review (Add approved to graph) when review mode is on.",
  },
  "kg-documents": {
    title: "Documents",
    body: "Ingested sources in this workspace. Extract shows status: extracted = approved into the graph; review = awaiting Extraction review (click Add approved to graph). Discovery sources pre-approve proposed entities. Re-extract opens a fresh review pass.",
  },
  "kg-doc-delete-all": {
    title: "Delete all documents",
    body: "Remove every ingested source in this workspace. Opens a centered confirmation dialog. Prunes graph nodes and edges used only by these documents and clears the ingestion log.",
  },
  "kg-doc-col-title": {
    title: "Title",
    body: "Display name for the document in RAG snippets and the ingest log. Defaults to the page title, filename, or URL if you did not set one.",
  },
  "kg-doc-col-type": {
    title: "Type",
    body: "How the source was classified: url, youtube, pdf, text, rss, image reference, etc. Affects chunking and metadata stored with each chunk.",
  },
  "kg-doc-col-chunks": {
    title: "Chunks",
    body: "Number of text segments stored for RAG retrieval. Longer documents are split into overlapping chunks for search and extraction.",
  },
  "kg-doc-col-source": {
    title: "Source",
    body: "Original URL, filename, or source key. HTTP(S) links open in a new tab. Discover-ingested rows also store the bulk discovery goal used to tune extraction.",
  },
  "kg-doc-col-ingest": {
    title: "Ingest mode",
    body: "Server — parsed via /api/misc/knowledge-graph/ingest (PDF/URL fetch, chunking, optional Grok). Local — browser fallback when the API is unreachable; simpler parsing, no server-side fetch. Both paths still run extraction afterward.",
  },
  "kg-doc-col-extract": {
    title: "Extraction",
    body: "Whether LLM-proposed nodes and edges were approved into the graph. Extracted = merged; failed = extraction error (use Extract to retry). Re-extract sends a new proposal to Extraction review.",
  },
  "kg-doc-col-ingested": {
    title: "Ingested",
    body: "When this document was first parsed and added to the workspace.",
  },
  "kg-doc-col-actions": {
    title: "Actions",
    body: "View — preview chunks and graph entity counts. Extract — re-run LLM extraction (opens review if enabled). Del — remove the document and prune graph items only referenced by it.",
  },
  "kg-doc-action-view": {
    title: "View document",
    body: "Shows title, type, chunk count, extraction status, and how many nodes/edges from this document are in the graph, plus a short text preview.",
  },
  "kg-doc-action-extract": {
    title: "Re-extract",
    body: "Re-run LLM entity extraction on this document. With review mode on, new proposals appear in Extraction review; the document leaves this list until you approve them.",
  },
  "kg-doc-action-del": {
    title: "Delete document",
    body: "Removes the document and its chunks from the workspace. Graph nodes and edges that are only referenced by this document are pruned; shared entities are kept.",
  },
  "kg-ingest-log-col-mode": {
    title: "Ingest mode",
    body: "Server — job ran through the API. Local — browser fallback was used because the server was unavailable or the request failed.",
  },
  "kg-review-mode": {
    title: "Review before merge",
    body: "When enabled (recommended), extracted nodes and edges appear in the review panel for approval before joining the live graph. Disable to auto-merge all extractions immediately.",
  },
  "kg-extract-review": {
    title: "Extraction review",
    body: "Single-column review (like Graph inventory) with Nodes/Edges toggle, search, and type filters. Each node has label, schema.org/FIBO-style type, and description — edit before approving. Meta shows extract version (v3+). Discovery sources pre-approve items. Click Add approved to graph to commit.",
  },
  "exchanges-overview": {
    title: "Cross-Exchange Overview",
    body: "Live BTC spot prices from major exchanges via public APIs. Compare last price, 24h change, volume, and distance from the cross-venue median. Scaffold hub — extend with depth, arb, and flows later.",
  },
  "exchanges-spot": {
    title: "Spot Markets",
    body: "Per-exchange spot BTC tickers: bid/ask, 24h range, and quote volume. Useful for spotting liquidity concentration and tight vs wide markets.",
  },
  "exchanges-perp": {
    title: "Perpetual Markets",
    body: "BTC perpetual swap snapshot: mark/index basis and published funding rates from major venues (Binance, OKX, Bybit, KuCoin, HTX, Bitget, Deribit, MEXC, and others).",
  },
  "exchanges-volume": {
    title: "Volume Rankings",
    body: "24h volume share across spot and perp listings. Shows which venues dominate BTC trading activity on this scaffold feed.",
  },
  "exchanges-briefing": {
    title: "Exchanges Briefing",
    body: "Auto-generated commentary on cross-venue dispersion, funding skew, and volume concentration. Includes roadmap notes for future features.",
  },
  "exchanges-overview-chart": {
    title: "Price vs Median",
    body: "Horizontal bars show how far each spot venue's last price sits from the cross-exchange median. Green = above median, red = below. When one venue dwarfs the rest (≥4× the next), its bar uses a scale break so others stay readable; labels show true values.",
  },
  "exchanges-spot-chart": {
    title: "Spot 24h Volume",
    body: "Ranked quote-volume bars for spot BTC pairs across major exchanges. Highlights where spot liquidity concentrates. Outliers use a scale break (zigzag) so ranks 2+ stay readable; bar length for the leader is illustrative.",
  },
  "exchanges-perp-chart": {
    title: "Funding Rates",
    body: "Published perpetual funding rates by venue. Positive = longs pay shorts; negative = shorts pay longs. Bars diverge from center zero. Extreme funding outliers get a scale break so other venues remain comparable.",
  },
  "exchanges-volume-chart": {
    title: "Volume Share",
    body: "Combined spot and perp 24h volume share by venue listing. Shows dominance across the full exchange scaffold feed. When one venue dominates (≥4× the next), its bar uses a scale break; labels show true share.",
  },

  "fut-last-price": {
    title: "Futures Last Price",
    body: "Most recent traded price on the BTCUSDT perpetual futures contract. Can diverge slightly from spot due to leverage demand, funding flows, and futures-specific liquidity.",
  },
  "fut-mark-price": {
    title: "Mark Price",
    body: "Fair price used by Binance for unrealized PnL and liquidation calculations. Derived from the index price and a moving average of the futures basis. Helps prevent unfair liquidations from short-term manipulation.",
  },
  "fut-index-price": {
    title: "Index Price",
    body: "Composite spot price from major exchanges (including Binance spot). The index anchors futures pricing so perps track underlying spot markets rather than only the futures order book.",
  },
  "fut-basis": {
    title: "Basis",
    body: "Difference between mark price and index price, expressed in USDT and percent. Positive basis (contango) means futures trade above spot; negative (backwardation) means below. Extreme basis can signal leveraged demand or stress.",
  },
  "delivery-oi-chart": {
    title: "Delivery Open Interest",
    body: "Outstanding BTC contracts per delivery future and the perpetual. Compares how much capital is parked in dated futures vs the perp. Rising delivery OI near expiry can signal hedging or roll activity. When perp or one contract dwarfs the rest, its bar uses a scale break so other contracts stay readable.",
  },
  "opt-atm-iv": {
    title: "ATM Implied Volatility",
    body: "Mark implied volatility of the at-the-money option at the nearest expiry. ATM IV is the market's baseline expectation of near-term price movement. Rising ATM IV often precedes larger realized swings.",
  },
  "opt-skew": {
    title: "25Δ Volatility Skew",
    body: "Difference between out-of-the-money put IV and call IV (approximate 25-delta wings). Positive skew means puts are richer — typical in BTC as investors pay for downside protection.",
  },
  "opt-iv-range": {
    title: "IV Range",
    body: "Minimum and maximum mark IV across the entire Deribit BTC options chain. A wide range indicates steep skew or term structure effects; a narrow range suggests a flatter vol surface.",
  },
  "opt-pc-ratio": {
    title: "Put / Call Open Interest Ratio",
    body: "Total put OI divided by call OI across the chain. Above 1 means more put contracts outstanding — often read as defensive positioning, though it can also reflect covered-call selling on the call side.",
  },
  "opt-max-pain": {
    title: "Max Pain",
    body: "Strike where option holders would face the smallest aggregate payout at expiry, weighted by open interest. Markets sometimes gravitate toward max pain into expiry, but it is not a reliable short-term price target.",
  },
  "opt-total-oi": {
    title: "Total Options Open Interest",
    body: "Sum of all open call and put contracts on Deribit BTC options. Rising total OI with rising price can mean new bullish bets; with falling price can mean new hedges or bearish bets.",
  },
  "opt-oi-strike": {
    title: "OI by Strike",
    body: "Largest open-interest strikes across the chain. Concentrated OI at specific levels can act as magnets or barriers as dealers hedge delta exposure around those strikes. When one strike dominates (≥4× the next), its bar uses a scale break; call/put split is preserved.",
  },
  "stat-ann-mean": {
    title: "Annualized Mean Return",
    body: "Average daily simple return multiplied by 252 trading days. A coarse estimate of expected yearly drift if recent daily behavior persisted.",
  },
  "stat-ann-vol": {
    title: "Annualized Volatility",
    body: "Standard deviation of daily returns scaled by √252. Measures typical year-to-year dispersion if daily variance stayed constant.",
  },
  "stat-sharpe": {
    title: "Sharpe Ratio",
    body: "Annualized mean return divided by annualized volatility, assuming zero risk-free rate. Higher values mean more return per unit of risk over the sample.",
  },
  "stat-skew": {
    title: "Skewness",
    body: "Third standardized moment of daily returns. Negative skew means more extreme down-days than a normal distribution; positive skew means fat right tail.",
  },
  "stat-max-dd": {
    title: "Maximum Drawdown",
    body: "Largest peak-to-trough decline in the cumulative return series over the sample. Measures the worst buy-and-hold loss from a local high.",
  },
  "risk-vol-30": {
    title: "30-Day Realized Volatility",
    body: "Annualized standard deviation of daily returns over the last 30 trading days. A short-window measure of current risk regime — spikes during sell-offs.",
  },
  "risk-sortino": {
    title: "Sortino Ratio",
    body: "Annualized return divided by downside semideviation (only negative returns count). Higher than Sharpe when upside volatility is large but downside is controlled.",
  },
  "risk-beta": {
    title: "Beta vs ETH",
    body: "Sensitivity of BTC daily returns to ETH daily returns. Beta above 1 means BTC amplifies ETH moves; below 1 means BTC is less reactive to ETH market swings.",
  },
  "risk-calmar": {
    title: "Calmar Ratio",
    body: "Annualized return divided by the absolute maximum drawdown. Rewards strategies that recover from drawdowns with strong cumulative performance.",
  },
  "risk-downside": {
    title: "Downside Deviation",
    body: "Square root of the mean squared negative daily returns, annualized. Focuses risk measurement on harmful volatility only.",
  },
  "risk-corr": {
    title: "BTC–ETH Correlation",
    body: "Pearson correlation of daily BTC/USD (Bitstamp + Blockchain.info) and ETH/USDT (Binance) returns. Near 1 means both move together; lower values mean more idiosyncratic BTC risk.",
  },
  "risk-vol-90": {
    title: "90-Day Realized Volatility",
    body: "Annualized standard deviation of daily returns over the last 90 trading days. Smoother than 30-day vol; captures medium-term risk regime.",
  },
  "risk-kurt": {
    title: "Excess Kurtosis",
    body: "Fourth standardized moment minus 3. Positive excess kurtosis means fat tails — extreme daily moves occur more often than a normal distribution predicts.",
  },
  "risk-gain-loss": {
    title: "Gain/Loss Ratio",
    body: "Average positive daily return divided by average absolute negative daily return. Above 1 means up-days outperform down-days in magnitude.",
  },
  "risk-worst-day": {
    title: "Worst Single Day",
    body: "Largest one-day loss in the sample. A practical stress point for short-horizon risk and tail-event magnitude.",
  },
  "risk-p95-gain": {
    title: "95th Percentile Daily Gain",
    body: "Return threshold exceeded on only 5% of days to the upside. Illustrates how extreme positive days contribute to skew.",
  },
  "risk-p05-loss": {
    title: "5th Percentile Daily Loss",
    body: "Return threshold breached on the worst 5% of days. Closely related to historical 95% VaR on the loss side.",
  },
  "risk-drawdown-chart": {
    title: "Drawdown History",
    body: "Underwater equity curve from rolling peaks. Shows depth and duration of losses from prior highs — key for tail and recovery risk.",
  },
  "risk-rolling-vol": {
    title: "Rolling Volatility",
    body: "30-day and 90-day realized volatility through time. Rising lines signal escalating short-term risk; divergences highlight regime shifts.",
  },
  "risk-rolling-sharpe": {
    title: "Rolling Sharpe Ratio",
    body: "90-day risk-adjusted return (rf=0) over time. Falling Sharpe often precedes drawdowns; rising Sharpe reflects improving return per unit of risk.",
  },
  "risk-metrics": {
    title: "Risk Metrics",
    body: "Full risk profile from Bitstamp + Blockchain.info BTC/USD daily closes: short- and long-window realized volatility, downside semideviation, risk-adjusted return ratios, ETH beta/correlation (ETH from Binance), and tail statistics (skew, kurtosis, percentiles). Each row has its own definition.",
  },
  "var-95": {
    title: "95% Value at Risk",
    body: "Historical 5th percentile of daily returns — on 95% of days, losses should not exceed this level. 1-day horizon, full sample.",
  },
  "var-99": {
    title: "99% Value at Risk",
    body: "Historical 1st percentile of daily returns — a stricter tail threshold. Breaches are rare but correspond to crash days.",
  },
  "var-cvar-95": {
    title: "Conditional VaR (CVaR)",
    body: "Average return on days at or below the 95% VaR threshold. Expected shortfall — the typical loss when VaR is breached.",
  },
  "var-usd": {
    title: "USD Value at Risk",
    body: "95% historical VaR expressed in USD per 1 BTC at the latest close. Approximate maximum 1-day dollar loss at 95% confidence.",
  },
  "markov-current": {
    title: "Current Regime",
    body: "Latest daily return classified into Bear (bottom tercile), Neutral (middle third), or Bull (top tercile) versus the full sample distribution.",
  },
  "markov-streak": {
    title: "Days in State",
    body: "Consecutive trading days the market has remained in the current regime without crossing a tercile boundary.",
  },
  "markov-persistence": {
    title: "Persistence",
    body: "Average diagonal probability across the transition matrix — how often each state follows itself. Higher values mean stickier regimes.",
  },
  "markov-steady": {
    title: "Steady-State Bull",
    body: "Long-run ergodic share of Bull days implied by the estimated Markov chain. The fraction of time the process spends in the top tercile if transitions persist.",
  },
  "markov-regime-chart": {
    title: "Regime History",
    body: "Daily regime classification over the last year. Color bands show Bear, Neutral, and Bull stretches; the dashed line marks the latest day.",
  },
  "markov-matrix": {
    title: "Transition Matrix",
    body: "Row-stochastic probabilities of moving from one daily regime to the next. Diagonal cells are persistence; off-diagonal cells are regime switches.",
  },
  "markov-occupancy": {
    title: "State Profile",
    body: "Historical time spent in each regime, self-transition probability P(stay), and expected duration 1/(1−P(stay)) in trading days.",
  },
  "pl-spot": {
    title: "Spot Price",
    body: "Latest BTC/USD daily close (Bitstamp, with Blockchain.info pre-2011) used against the Santostasi power-law fair-value line.",
  },
  "pl-fair": {
    title: "Fair Value",
    body: "Model price A × (days since Genesis)^n using Santostasi constants A = 10⁻¹⁶·⁴⁹³ and n = 5.68.",
  },
  "pl-deviation": {
    title: "Deviation",
    body: "Percent difference between spot and fair value. Positive = trading above the PLT line; negative = below.",
  },
  "pl-band-zone": {
    title: "Band Position",
    body: "Whether price sits near empirical support (low historical ratio), the fair corridor, or resistance (high ratio).",
  },
  "pl-band-chart": {
    title: "Power Law Corridor",
    body: "BTC price with Santostasi fair-value line and empirical support/resistance bands derived from historical price/fair ratios.",
  },
  "pl-log-chart": {
    title: "Log–Log Phase Space",
    body: "Log₁₀(price) vs log₁₀(days since Genesis). A straight diagonal confirms power-law scaling across orders of magnitude.",
  },
  "pl-ratio-chart": {
    title: "Price / Fair Ratio",
    body: "Spot divided by fair value over time. 1.0 is equilibrium; support and resistance multipliers mark historical extremes.",
  },
  "pl-params": {
    title: "Model Parameters",
    body: "Published Santostasi constants plus log–log regression fit and empirical band multipliers from the full BTC/USD history sample.",
  },
  "pl-relations": {
    title: "PLT Feedback Loop",
    body: "Linked power laws in Santostasi theory: adoption t³, Metcalfe price ~ addresses², mining hash rate ~ price², consolidated price ~ t⁶.",
  },
  "pl-forecast": {
    title: "Price Forecasts",
    body: "Forward fair values at 1y/5y/10y/25y horizons with bear (−60%) and bull (+50%) scenarios per bitcoinpower.law.",
  },
  "pl-milestone": {
    title: "Price Milestones",
    body: "Dates when the PLT model first crosses selected price levels, inverted from Price = A × days^n.",
  },
  "pl-theory": {
    title: "Power Law Theory",
    body: "Overview of Giovanni Santostasi's Bitcoin Power Law Theory — scale invariance, feedback loops, bubbles, and limitations.",
  },
  "open-interest": {
    title: "Open Interest",
    body: "Total number of outstanding futures contracts (long + short legs, not net). Rising OI with rising price often means new money entering longs; rising OI with falling price can mean new shorts. Measured in BTC and USDT notional.",
  },
  "funding-rate": {
    title: "Funding Rate",
    body: "Periodic payment between longs and shorts to keep perpetual price near spot. Positive rate means longs pay shorts (bullish positioning); negative means shorts pay longs. Settled every 8 hours on Binance. Annualized figure extrapolates the current rate.",
  },
  "next-funding": {
    title: "Next Funding",
    body: "Countdown to the next funding settlement. At settlement, positions pay or receive funding based on the rate and position size. Large positions often adjust before this timestamp to avoid funding costs.",
  },
  "global-ls": {
    title: "Global Long/Short Ratio",
    body: "Ratio of accounts holding long vs short positions across all Binance futures users (1h period). Above 1 means more accounts are long. Sentiment indicator — crowded positioning can precede squeezes.",
  },
  "top-trader-accounts": {
    title: "Top Trader Accounts",
    body: "Long/short ratio among the top 20% of users by margin balance. Reflects positioning of larger accounts rather than the full user base. Often watched as 'smart money' sentiment, though not guaranteed.",
  },
  "top-trader-positions": {
    title: "Top Trader Positions",
    body: "Long/short ratio by position size (not account count) for top traders. Shows where concentrated capital is deployed. Can differ from account ratio when a few large positions dominate.",
  },
  "taker-ratio": {
    title: "Taker Buy/Sell Ratio",
    body: "Ratio of aggressive buy volume to aggressive sell volume over the last hour. Takers hit existing orders (market orders). Above 1 means more market buying; below 1 means more market selling — a short-term flow indicator.",
  },
  "depth-chart": {
    title: "Depth Chart",
    body: "Visualizes cumulative bid and ask liquidity across price levels. Green area shows total buy orders; red shows sell orders. Steeper curves mean more liquidity concentrated near the mid price. The dashed line marks the mid between best bid and ask.",
  },
  "book-best-bid": {
    title: "Order Book — Best Bid",
    body: "Highest buy order in the displayed depth snapshot. The bid side (left ladder) shows prices buyers offer. Depth bars show relative size at each level.",
  },
  "book-mid": {
    title: "Mid Price",
    body: "Average of the best bid and best ask. Often used as a fair reference price between buyers and sellers. Mid is not directly tradable — actual trades occur at bid or ask.",
  },
  "book-best-ask": {
    title: "Order Book — Best Ask",
    body: "Lowest sell order in the depth snapshot. The ask side (right ladder) shows prices sellers want. Together with bids, it defines the spread and immediate liquidity.",
  },
  "book-total": {
    title: "Cumulative Total",
    body: "Running sum of BTC size from the best price outward. For bids, it shows how much you could sell in total as you walk down prices. For asks, how much you could buy walking up. Key for slippage estimation.",
  },
  "book-size": {
    title: "Level Size",
    body: "Amount of BTC available at a single price level. Larger sizes at a level mean more liquidity there. Depth bars visualize each level's size relative to the largest level on that side.",
  },
  "book-price": {
    title: "Level Price",
    body: "The USDT price at which resting limit orders sit. Bids are below mid (green); asks are above mid (red). The ladder shows the top 20 levels on each side updating in real time.",
  },
  "etf-total-aum": {
    title: "Total ETF AUM",
    body: "Combined assets under management across all US spot Bitcoin ETFs, in USD. Calculated from each fund's reported BTC holdings multiplied by the current Bitcoin price. Updated daily from issuer disclosures via Bitbo.",
  },
  "etf-total-btc": {
    title: "Total BTC Held by ETFs",
    body: "Sum of Bitcoin held across all 13 US spot BTC ETFs. This BTC is custodied on behalf of fund shareholders and represents institutional + retail exposure through brokerage accounts.",
  },
  "etf-pct-21m": {
    title: "% of 21 Million Cap",
    body: "ETF-held BTC as a percentage of Bitcoin's maximum supply (21 million). Shows how much of the total future supply is now held in US ETF wrappers. Approaches 6% as adoption grows.",
  },
  "etf-latest-flow": {
    title: "Latest Daily Net Flow",
    body: "Most recent trading day's net inflow or outflow across all US spot BTC ETFs, in USD millions. Positive means more money entered ETFs than left; negative means net redemptions. Flows drive BTC purchases or sales by fund issuers.",
  },
  "etf-flow-chart": {
    title: "Daily Net Flow Chart",
    body: "Bar chart of total daily net flows (USD millions) across all US spot Bitcoin ETFs. Green bars are net inflows; red bars are net outflows. Helps visualize institutional demand trends over recent trading days. Extreme single-day flows use a vertical scale break so neighboring days stay readable.",
  },
  "etf-5d-flow": {
    title: "5-Day Net Flow",
    body: "Sum of daily net flows over the last five trading days. A single number to gauge weekly institutional sentiment — sustained positive flows often correlate with bullish BTC price action.",
  },
  "etf-daily-avg": {
    title: "Daily Average Flow",
    body: "Average net daily flow over the recent measurement window. Smooths day-to-day noise to show typical daily capital moving in or out of the ETF complex.",
  },
  "etf-inflow-days": {
    title: "Inflow Days Total",
    body: "Combined net inflows on days where the aggregate flow was positive. Shows total buying pressure on up-flow days in the measured period.",
  },
  "etf-outflow-days": {
    title: "Outflow Days Total",
    body: "Combined net outflows on days where the aggregate flow was negative. Shows total selling pressure on down-flow days — large outflows can signal risk-off positioning.",
  },
  "etf-entity": {
    title: "ETF Fund",
    body: "US spot Bitcoin exchange-traded fund with its issuer name and ticker. Each ETF holds BTC in custody and issues shares that trade on stock exchanges like NASDAQ, NYSE, or CBOE.",
  },
  "etf-btc-held": {
    title: "BTC Holdings",
    body: "Bitcoin held by this specific ETF as reported in daily issuer updates. The largest holders (IBIT, FBTC, GBTC) dominate total ETF exposure.",
  },
  "etf-aum-value": {
    title: "AUM (USD)",
    body: "Market value of the fund's Bitcoin holdings in US dollars (BTC held × current price). Equivalent to the fund's net asset value attributable to its Bitcoin position.",
  },
  "etf-exchange": {
    title: "Listing Exchange",
    body: "Stock exchange where the ETF shares trade — NASDAQ, NYSE, or CBOE. The underlying BTC is held in custody regardless of where shares are listed.",
  },
  "etf-flow-table": {
    title: "Daily Flow Table",
    body: "Per-ETF net flows in USD millions for each recent trading day. Each cell shows how much capital entered or left that specific fund. The Totals column sums across all 13 ETFs for that day.",
  },
  "trs-total-btc": {
    title: "BTC Held by Public Companies",
    body: "Total Bitcoin on balance sheets across all publicly traded treasury companies tracked by BitcoinTreasuries.net — the same dataset used on bitcointreasuries.net.",
  },
  "trs-total-usd": {
    title: "Total Treasury Value (USD)",
    body: "Combined USD market value of all public company BTC holdings at the current Bitcoin price. Updates with BTC price even when coin balances are unchanged.",
  },
  "trs-company-count": {
    title: "Number of Public Companies",
    body: "Count of publicly traded companies reporting Bitcoin holdings. New entrants are added as filings and disclosures are verified.",
  },
  "trs-btc-price": {
    title: "BTC Price",
    body: "Current Bitcoin USD price used to value treasury holdings, sourced from BitcoinTreasuries.net market metrics.",
  },
  "trs-asset-dominance": {
    title: "Asset Dominance",
    body: "Share of total treasury asset value held in BTC vs other assets (ETH, SOL, BNB, XRP) across public companies that report multi-asset treasuries.",
  },
  "trs-mnav": {
    title: "mNAV (Modified NAV)",
    body: "Modified net asset value: fully diluted market cap divided by the USD value of BTC held. Below 1.0 means the stock trades at a discount to its bitcoin; above 1.0 is a premium.",
  },
  "trs-mnav-dist": {
    title: "mNAV Distribution",
    body: "Histogram of modified NAV across public treasury companies with listed equities. Values below ~0.95 trade at a discount to BTC holdings; above ~1.05 trade at a premium.",
  },
  "trs-btc-change-7d": {
    title: "7-Day BTC Change",
    body: "Change in reported BTC balance over the last 7 days. Positive values indicate net acquisitions; zero means no change reported.",
  },
  "trs-stock-price": {
    title: "Stock Price",
    body: "Latest share price of the company's common stock in USD, used alongside mNAV to gauge how the equity market prices the BTC treasury.",
  },
  "trs-country-chart": {
    title: "Geographic Mix",
    body: "Distribution of corporate BTC holdings by country of incorporation. Shows which jurisdictions dominate the treasury company landscape. When the leading country dwarfs the rest (usually the US), its bar uses a scale break so other countries stay readable.",
  },
  "trs-strategy-btc": {
    title: "Strategy (MSTR) Holdings",
    body: "Bitcoin held by Strategy (formerly MicroStrategy), the largest corporate BTC treasury. Traded as MSTR on NASDAQ. The company issues debt and equity to fund ongoing BTC acquisitions.",
  },
  "trs-strategy-avg-cost": {
    title: "Strategy Average Cost Basis",
    body: "Strategy's self-reported average USD price paid per bitcoin across all acquisitions. Comparing spot price to this figure shows unrealized gain or loss on their treasury.",
  },
  "trs-strategy-total-cost": {
    title: "Strategy Total Acquisition Cost",
    body: "Cumulative USD spent to acquire Strategy's bitcoin stack, in billions. This is historical cost — not current market value.",
  },
  "trs-public-pct": {
    title: "% of 21M Supply",
    body: "Combined BTC held by all public treasury companies as a percentage of Bitcoin's maximum supply of 21 million coins.",
  },
  "trs-public-share": {
    title: "Public Share of All Treasuries",
    body: "Public company BTC as a slice of all tracked treasury categories (ETFs, countries, public, private, miners, DeFi). Shows relative weight of corporate treasuries in the ecosystem.",
  },
  "trs-top-chart": {
    title: "Top Holders Chart",
    body: "Horizontal bar chart of the 15 largest public company BTC balances. When the #1 holder (usually Strategy/MSTR) dwarfs the rest, its bar uses a scale break (zigzag) so ranks 2–15 stay readable on a separate axis. Bar length for the leader is illustrative; the BTC label shows the true balance.",
  },
  "trs-strategy-panel": {
    title: "Strategy Dashboard",
    body: "Dedicated view of Strategy (MicroStrategy) — the pioneer of the BTC treasury model. Includes cumulative holdings history, per-event purchases, and cost basis data from public disclosures.",
  },
  "trs-strategy-history": {
    title: "Strategy Holdings History",
    body: "Line chart of Strategy's total BTC balance over time. Each point reflects holdings after reported purchases. Shows the pace and scale of their accumulation program since 2020.",
  },
  "trs-strategy-purchases": {
    title: "Strategy Purchase Events",
    body: "Bar chart of BTC bought (or sold) in individual disclosed transactions. Green bars are acquisitions; red bars are reductions. The last ~20 events are shown.",
  },
  "trs-purchase-date": {
    title: "Purchase Date",
    body: "Date Strategy disclosed a bitcoin transaction in an SEC filing or press release.",
  },
  "trs-purchase-btc": {
    title: "BTC Purchased",
    body: "Net bitcoin acquired in that event. Negative values indicate sales or transfers out of treasury.",
  },
  "trs-purchase-amount": {
    title: "Purchase Amount (USD)",
    body: "Approximate USD spent (or received) in the transaction, as reported by Strategy.",
  },
  "trs-purchase-total-btc": {
    title: "Cumulative BTC After Purchase",
    body: "Total bitcoin holdings after this transaction completed — the running treasury balance.",
  },
  "trs-purchase-total-usd": {
    title: "Cumulative Cost Basis",
    body: "Total USD spent acquiring bitcoin up to that point, as reported by Strategy.",
  },
  "trs-companies-table": {
    title: "Treasury Companies Table",
    body: "Full ranked list of publicly traded bitcoin treasury companies — matching the Top 100 table on bitcointreasuries.net. Search by name or ticker, filter by country.",
  },
  "trs-company-name": {
    title: "Company",
    body: "Legal or brand name of the publicly traded entity holding BTC, with stock ticker where available.",
  },
  "trs-company-country": {
    title: "Country",
    body: "Country of incorporation or primary listing for the company.",
  },
  "trs-company-btc": {
    title: "BTC Holdings",
    body: "Bitcoin held by this company per latest public filing or disclosure.",
  },
  "trs-company-usd": {
    title: "USD Value",
    body: "Current market value of the company's BTC at the prevailing Bitcoin price.",
  },
  "trs-company-pct": {
    title: "% of 21M Cap",
    body: "Company's BTC as a percentage of total Bitcoin that will ever exist.",
  },
  "trs-company-exchange": {
    title: "Stock Exchange",
    body: "Exchange where the company's shares trade (e.g. NASDAQ, NYSE, TSE).",
  },
  "tradfi-markets-table": {
    title: "TradFi Markets Table",
    body: "Live delayed quotes from Yahoo Finance for the selected asset class. Last is the latest price or yield; Chg and Chg % are versus the prior close. On Global Indices, 1W/1M/3M/12M/YTD are total returns from daily closes (5, 21, 63, and 252 trading days back, and prior year-end for YTD).",
  },
  "tradfi-indices-watchlist": {
    title: "Editable Indices Watchlist",
    body: "Edit index symbols in the hero strip and table (e.g. ^GSPC, ^FTSE). Changes save automatically to this browser. Use + Add index for more rows. Performance columns, charts, and news update when symbols change.",
  },
  "tradfi-indices-news": {
    title: "Index News",
    body: "Recent Yahoo Finance headlines tied to symbols in your indices watchlist. Symbol badges show which index each story relates to.",
  },
  "tradfi-companies-watchlist": {
    title: "Editable Watchlist",
    body: "Edit ticker symbols in the hero strip and table. Changes save automatically to this browser. Use + Add company for more rows (10 by default). Performance columns (1W–YTD) use daily closes; charts and news update when tickers change.",
  },
  "tradfi-companies-news": {
    title: "Company News",
    body: "Recent Yahoo Finance headlines for tickers in your watchlist. Sorted by publish time; symbol badges show which stocks each story relates to.",
  },
  "tradfi-refresh-status": {
    title: "Data freshness",
    body: "Green Live means quotes just loaded from Yahoo Finance. Amber Updating means you are viewing the last saved snapshot from this browser while a fresh fetch runs in the background.",
  },
  "tradfi-benchmark-chart": {
    title: "Benchmark Chart",
    body: "Three-month daily close for the section's primary benchmark (e.g. S&P 500, WTI crude, 10Y yield). Useful for medium-term trend context.",
  },
  "home-page": {
    title: "The Buccaneers — Home",
    body: "Landing page for the full Bitcoin dashboard collection. The banner highlights the Buccaneers command-deck theme; each card below opens a live section — Market, On Chain, Exchanges, Derivatives, ETFs, DATCO treasuries, Stats, TradFi equity insights, DeFi, Macro, and News. Your last visited section is remembered in this browser.",
  },
  "equity-global-insights": {
    title: "Global Equity Insights",
    body: "Editable global index watchlist: four hero quotes, performance table (1W–YTD), an interactive normalized performance chart (1W, 1M, 1Q, 1Y, WTD, MTD, YTD, 3Y, 5Y — rebased to 100), 3-month daily charts per symbol, and Yahoo Finance headlines for your watchlist. Edit tickers in the hero row or table, or use + Add index. Data from Yahoo Finance (~15 min delayed).",
  },
  "equity-global-news": {
    title: "Global Index News",
    body: "Recent Yahoo Finance headlines tied to symbols in your Global Insights watchlist (heroes and table). Symbol badges show which index each story relates to.",
  },
  "equity-company-insights": {
    title: "Company Equity Insights",
    body: "Deep single-stock workspace: editable company watchlist, KPI hero strip with metric hints, 52-week range bar, auto-generated Analysis commentary, peer comparison chips, tabbed charts (overview candlesticks, technicals, financials, valuation, dividends), and Yahoo Finance headlines for the company and peers. Edit tickers in your watchlist or quick-load any symbol; use History to load 3 months through all available daily data; toggle peers to compare valuation and rebased performance.",
  },
  "equity-company-watchlist": {
    title: "Company Watchlist",
    body: "Your customizable list of tickers for Company Insights. Edit symbols inline, press → or Enter to load the overview chart, use + Add company for more slots (up to 24), or × to remove. Saves automatically in this browser. Peer chips are drawn from this watchlist.",
  },
  "equity-company-history": {
    title: "Chart History",
    body: "How many daily bars to load for the overview candlestick chart, technical indicators, period return, and peer performance. Options run from 3 months up to all available Yahoo Finance history (from 1990). Longer ranges need a moment to download. Toolbar and overview selectors stay in sync.",
  },
  "equity-company-commentary": {
    title: "Analysis",
    body: "Plain-language summary generated from price action, 52-week range position, valuation multiples, technical indicators, and peer context. Use alongside your own research — not a trading recommendation.",
  },
  "equity-company-commentary-technicals": {
    title: "Technicals Analysis",
    body: "Tab-specific commentary on RSI, MACD, moving averages, Williams %R, CCI, and ATR — summarizing momentum, trend, and volatility for the selected history range.",
  },
  "equity-company-commentary-financials": {
    title: "Financials Analysis",
    body: "Commentary on quarterly and annual revenue, net income, margins, free cash flow, and balance-sheet ratios drawn from Yahoo Finance filings.",
  },
  "equity-company-commentary-valuation": {
    title: "Valuation Analysis",
    body: "Compares trailing and forward P/E to peer medians and highlights the leader and laggard in rebased relative performance over the selected period.",
  },
  "equity-company-commentary-dividends": {
    title: "Dividend Analysis",
    body: "Summarizes indicated yield, trailing payments, and whether recent dividends are rising, stable, or declining.",
  },
  "equity-company-peers": {
    title: "Compare Peers",
    body: "Toggle tickers from your company watchlist to include in the peer multiples table and relative performance chart. Selections save in this browser session.",
  },
  "equity-company-52w": {
    title: "52-Week Range",
    body: "Shows where the current price sits between the lowest and highest trades over the past year. The marker position is (price − low) ÷ (high − low). Near the top often means momentum; near the bottom can attract value-focused attention.",
  },
  "equity-company-price": {
    title: "Price",
    body: "Last traded price from Yahoo Finance (typically ~15 min delayed). Sub-label shows today's percentage change.",
  },
  "equity-company-mcap": {
    title: "Market Cap",
    body: "Total equity market value — shares outstanding × current price. Useful for size context vs peers.",
  },
  "equity-company-pe": {
    title: "P/E (Trailing)",
    body: "Price divided by trailing twelve-month earnings per share. Higher P/E often implies growth expectations; compare within the same sector.",
  },
  "equity-company-fpe": {
    title: "Forward P/E",
    body: "Price divided by analyst consensus next-year EPS estimates. Often lower than trailing P/E when earnings are expected to grow.",
  },
  "equity-company-eps": {
    title: "EPS",
    body: "Earnings per share over the trailing twelve months — net income allocated to each outstanding share.",
  },
  "equity-company-divyield": {
    title: "Dividend Yield",
    body: "Trailing twelve-month cash dividends divided by current price, expressed as a percentage.",
  },
  "equity-company-beta": {
    title: "Beta",
    body: "Sensitivity of the stock's returns vs the broad market (usually S&P 500). Beta > 1 means historically more volatile than the market.",
  },
  "equity-company-rsi": {
    title: "RSI (14)",
    body: "Relative Strength Index over 14 days — measures recent up vs down closes on a 0–100 scale. Above 70 is often labeled overbought; below 30 oversold. Dotted lines mark those thresholds.",
  },
  "equity-company-macd": {
    title: "MACD",
    body: "Moving Average Convergence Divergence — difference between 12- and 26-day EMAs (blue line) vs its 9-day signal line (orange). Crossovers hint at short-term momentum shifts.",
  },
  "equity-company-stoch": {
    title: "Stochastic",
    body: "Where the close sits within the recent 14-day high/low range. %K (blue) and %D (dotted purple, 3-day average of %K). Above 80 = hot; below 20 = cold.",
  },
  "equity-company-willr": {
    title: "Williams %R",
    body: "14-day momentum oscillator from −100 to 0. Readings above −20 suggest overbought conditions; below −80 suggest oversold. Similar spirit to Stochastic but inverted scale.",
  },
  "equity-company-cci": {
    title: "CCI (20)",
    body: "Commodity Channel Index — measures how far price deviates from its 20-day statistical mean. Above +100 often flags strong upside momentum; below −100 flags weak momentum.",
  },
  "equity-company-atr": {
    title: "ATR (14)",
    body: "Average True Range over 14 sessions — a volatility gauge in price units (not percent). Rising ATR means larger daily swings; falling ATR means quieter trading.",
  },
  "equity-company-signals": {
    title: "Signal Summary",
    body: "Readable interpretation of current RSI, moving-average cross, MACD, and Stochastic states. Color-coded bullish (green), bearish (red), or neutral — combine with price and fundamentals before acting.",
  },
  "equity-company-news": {
    title: "Company News",
    body: "Recent Yahoo Finance headlines for the currently selected company only — updates when you load a different ticker from your watchlist. Sorted by publish time.",
  },
  "defi-protocols-table": {
    title: "BTC Protocols",
    body: "Wrapped and bridged Bitcoin representations tracked by DeFi Llama — wBTC, cbBTC, tBTC, LBTC, and related issuers. TVL is USD value locked in each protocol.",
  },
  "defi-tvl-chart": {
    title: "TVL History",
    body: "Historical total value locked for the leading protocol in this section. Useful for tracking growth of wrapped BTC, bridges, or staking venues over time.",
  },
  "defi-stables-table": {
    title: "Stablecoins",
    body: "USD-pegged stablecoins by market cap from DeFi Llama. Price deviation from $1 and 7-day supply change help gauge peg health and flows.",
  },
  "defi-stables-mcap-chart": {
    title: "Stablecoin Market Cap",
    body: "Aggregate circulating market cap of USD-pegged stablecoins across all chains. Rising supply often reflects DeFi and trading liquidity demand.",
  },
  "defi-stables-dominance": {
    title: "Stablecoin Dominance",
    body: "Market share of the top stablecoins by circulating cap. Concentration in USDT/USDC affects liquidity routing for BTC pairs on DEXs and CEXs. When USDT or USDC dwarfs the rest, its bar uses a scale break so smaller stables stay readable.",
  },
  "defi-lending-table": {
    title: "BTC Lending Pools",
    body: "BTC-denominated lending markets from DeFi Llama Yields — collateral and supply pools for WBTC, cbBTC, and related tokens across chains.",
  },
  "defi-liquidity-table": {
    title: "DEX Liquidity",
    body: "Top decentralized exchanges by 24-hour volume. WBTC and cbBTC pairs trade on these venues; volume shifts signal where BTC on-chain liquidity concentrates.",
  },
  "defi-staking-table": {
    title: "BTC Staking",
    body: "Restaking, liquid staking, and yield protocols for Bitcoin representations — Babylon, Lombard, Solv, and related BTC yield venues.",
  },
  "defi-lightning-table": {
    title: "Lightning Network",
    body: "Latest Lightning Network statistics from mempool.space — channel capacity, node count, and fee metrics for Bitcoin's L2 payment layer.",
  },
  "defi-col-protocol": {
    title: "Protocol",
    body: "DeFi protocol or issuer name for the wrapped BTC representation, bridge, pool, or venue.",
  },
  "defi-col-tvl": {
    title: "TVL",
    body: "Total value locked in USD — capital deposited in the protocol, pool, or bridge.",
  },
  "defi-col-change1d": {
    title: "1d %",
    body: "One-day percentage change in TVL or volume versus the prior day.",
  },
  "defi-col-chains": {
    title: "Chains",
    body: "Blockchains where this protocol or token is deployed.",
  },
  "defi-col-mcap": {
    title: "Market Cap",
    body: "Circulating supply valued at the current peg price — total outstanding stablecoin capitalization.",
  },
  "defi-col-price": {
    title: "Price",
    body: "Latest stablecoin price versus USD. Deviations from $1.00 signal peg stress or arbitrage.",
  },
  "defi-col-change7d": {
    title: "7d %",
    body: "Seven-day percentage change in circulating supply or APY — useful for spotting stablecoin mint/redeem flows.",
  },
  "defi-col-chain": {
    title: "Chain",
    body: "Blockchain network where the lending or staking pool is deployed.",
  },
  "defi-col-apy": {
    title: "APY",
    body: "Annualized yield from supplying or staking BTC representations in the pool.",
  },
  "defi-col-volume24h": {
    title: "24h Volume",
    body: "DEX trading volume over the last 24 hours — proxy for on-chain BTC liquidity activity.",
  },
  "defi-col-change7d-vol": {
    title: "7d % (Volume)",
    body: "Seven-day percentage change in DEX volume.",
  },
  "defi-col-metric": {
    title: "Metric",
    body: "Lightning Network statistic name — capacity, nodes, channels, or fee parameters.",
  },
  "defi-col-value": {
    title: "Value",
    body: "Current reading for the Lightning metric from the latest mempool.space snapshot.",
  },
  "defi-market-analysis": {
    title: "Market Analysis",
    body: "Auto-generated commentary summarizing key levels, movers, and trends for this DeFi section.",
  },
  "defi-network-analysis": {
    title: "Network Analysis",
    body: "Commentary on Lightning Network capacity, topology, and fee environment.",
  },
  "defi-hero-wrapped": {
    title: "Wrapped BTC Hero",
    body: "Headline metric for a wrapped or bridged BTC issuer — TVL shows how much Bitcoin is represented on-chain.",
  },
  "defi-hero-stables": {
    title: "Stablecoin Hero",
    body: "Top stablecoin by market cap or aggregate USD-pegged supply — liquidity backbone for BTC trading pairs.",
  },
  "defi-hero-bridge": {
    title: "Bridge Hero",
    body: "BTC bridge protocol TVL — capital locked moving Bitcoin representations across chains.",
  },
  "defi-hero-lending": {
    title: "Lending Hero",
    body: "BTC lending pool TVL or APY — supply-side yield for WBTC, cbBTC, and related collateral.",
  },
  "defi-hero-liquidity": {
    title: "DEX Hero",
    body: "24-hour decentralized exchange volume — where WBTC and cbBTC pairs concentrate liquidity.",
  },
  "defi-hero-staking": {
    title: "Staking Hero",
    body: "BTC restaking or liquid-staking TVL — capital in yield-bearing Bitcoin representations.",
  },
  "defi-hero-lightning-capacity": {
    title: "Network Capacity",
    body: "Total BTC locked in public Lightning channels — upper bound on routable L2 liquidity.",
  },
  "defi-hero-lightning-nodes": {
    title: "Lightning Nodes",
    body: "Count of public Lightning nodes (Tor, clearnet, and hybrid) on the network.",
  },
  "defi-hero-lightning-channels": {
    title: "Channels",
    body: "Number of public payment channels — more channels generally improve routing options.",
  },
  "defi-hero-lightning-median": {
    title: "Median Channel",
    body: "Median BTC size per channel versus the average — shows how liquidity is distributed.",
  },
  "macro-markets-table": {
    title: "Macro Indicators",
    body: "Delayed quotes for macro drivers that influence Bitcoin — yields, dollar, credit, volatility, and commodities.",
  },
  "macro-benchmark-chart": {
    title: "Macro Benchmark",
    body: "Three-month daily close for the section's primary macro benchmark. Context for BTC's discount-rate and risk backdrop.",
  },
  "macro-analysis": {
    title: "Macro Analysis",
    body: "Bitcoin-centric commentary linking macro indicator moves to typical BTC correlation patterns.",
  },
  "macro-drivers-title": {
    title: "Macro Drivers",
    body: "Unified global macro dashboard — 217 countries and regional aggregates, 13 economy indicators with strict source hierarchy (World Bank → IMF → DBnomics → Proxy). Liquidity tab: global proxy = CB balance sheet + broad money + FX reserves (ex-gold), with choropleth map, BIS credit-to-GDP gap overlay, regional aggregates, country drill-down, true 3m SAR on monthly FRED feeds (US/Japan/Euro area), YoY charts, and optional Yahoo market overlay (TLT, HYG, VIX).",
  },
  "md-year": {
    title: "Year",
    body: "Sets the reference year for table values, KPI medians, world map coloring, and the Charts ranking bar. The multi-country time-series chart still shows full history across years.",
  },
  "md-metric": {
    title: "Map / chart indicator",
    body: "On Overview, colors the world map only — the table above always shows all indicators. On Charts, drives the multi-country line chart and top-20 ranking. Economy tab columns are set by the Growth / Prices / Trade / Labor sub-tabs, not this dropdown.",
  },
  "md-region": {
    title: "Region",
    body: "Filters which countries appear in the Overview and Economy tables, the world map, and Charts ranking. KPI medians recalculate for the filtered country set.",
  },
  "md-income": {
    title: "Income group",
    body: "Same as Region but filters by World Bank income class (e.g. High income, Upper middle income). Affects tables, map, ranking, and KPI medians.",
  },
  "md-search": {
    title: "Country search",
    body: "Narrows table rows and Charts ranking by country name or ISO code. Does not filter the world map — use Region or Income to scope the map.",
  },
  "md-show-aggregates": {
    title: "Regional aggregates",
    body: "Controls rows in the Overview and Economy & Growth tables below (not the choropleth map, which always shows countries). When checked, World Bank regional and income-group totals appear alongside countries — e.g. World, Euro area, East Asia & Pacific, Sub-Saharan Africa — marked with an AGG badge. Uncheck to list sovereign countries only.",
  },
  "md-featured-aggs": {
    title: "Featured aggregates only",
    body: "Narrows which aggregate rows appear in the Overview and Economy & Growth tables. Only applies when Regional aggregates is on. Checked: keeps a short list of major WB groups (World, EU, Euro area, regional blocs like EAS/ECS/NAC/LCN/MEA/SAS, SSA, etc.). Unchecked: also shows niche income and demographic aggregates (e.g. low-income only, IBRD-only, early-demographic dividend). Does not affect the map or Liquidity tab.",
  },
  "md-refresh-data": {
    title: "Refresh data",
    body: "Fetches fresh economy indicators from World Bank and IMF APIs. Normal navigation uses data saved in your browser for up to a few days — no automatic background refresh. Click here only when you want updated numbers. First uncached load can take 30–60 seconds. Does not affect the Liquidity tab.",
  },
  "md-refresh-liquidity": {
    title: "Refresh liquidity",
    body: "Fetches fresh liquidity components (CB balance sheet, broad money, FX reserves) and rebuilds proxies from WB → IMF IFS → DBnomics → Proxy. Cached locally for days until you click this button. If Market overlay is enabled, also refreshes delayed Yahoo quotes (TLT, HYG, VIX). Also refreshes BIS credit-gap bulk data.",
  },
  "md-lq-title": {
    title: "Global Liquidity Proxy",
    body: "42Macro-style liquidity stock estimate for the selected view (global, region, or country). Formula: Central bank balance sheet + broad money supply + FX reserves excluding gold, all in USD. Annual history drives the stacked chart; monthly FRED feeds power true 3m SAR where available. Use the breadcrumb and View selector to drill down.",
  },
  "md-lq-view": {
    title: "View",
    body: "Scope for all charts, KPIs, and the growth series: World (WLD), regional aggregates (Advanced, EM, East Asia, etc.), or a single country. Changing view reloads the liquidity payload and syncs the breadcrumb. Does not change the country table year or map metric.",
  },
  "md-lq-year": {
    title: "Table year",
    body: "Reference year for the country ranking table, map coloring, and KPI proxy-share statistic. Charts above use full available history for the selected view, not only this year.",
  },
  "md-lq-map-metric": {
    title: "Map metric",
    body: "Proxy (USD): total liquidity stock per country for the table year — darker teal = larger stock. YoY %: year-over-year change in that stock — green = faster growth, red = contraction. Click any country on the map to load its charts.",
  },
  "md-lq-overlay": {
    title: "Market overlay",
    body: "Optional delayed Yahoo Finance layer for market-priced liquidity/risk: TLT (long Treasuries), HYG (high yield credit), and VIX (volatility). Useful as a real-time cross-check vs slow-moving official stock data. Not included in the liquidity proxy formula.",
  },
  "md-lq-export": {
    title: "Export CSV",
    body: "Downloads featured-country table rows for the selected table year: proxy total, YoY, each component value, per-component source (WB / IMF / DB / Proxy), aggregate sources, and derived ratios (CB/GDP, money/GDP, liquidity impulse).",
  },
  "md-lq-methodology": {
    title: "Sources & Methodology",
    body: "Opens the full data hierarchy (WB → IMF IFS → DBnomics → Proxy), YoY and 3m SAR definitions, BIS credit-gap notes, market overlay sources, and proxy-coverage statistics for the current build.",
  },
  "md-lq-kpi-proxy": {
    title: "Liquidity proxy",
    body: "Total liquidity stock for the selected view in USD: sum of central bank assets, broad money, and FX reserves (ex-gold) for the latest annual observation. Source badges show which tiers contributed (WB, IMF, DB, Proxy).",
  },
  "md-lq-kpi-yoy": {
    title: "YoY growth",
    body: "Year-over-year % change in the total liquidity proxy using annual World Bank–frequency data: (proxyₜ / proxyₜ₋₁ − 1) × 100. Positive = expanding liquidity stock vs the prior year.",
  },
  "md-lq-kpi-sar": {
    title: "3m SAR",
    body: "Three-month seasonally adjusted annualized rate on monthly FRED feeds where available: ((Lₜ / Lₜ₋₃)⁴ − 1) × 100 on the monthly proxy (US, Japan, Euro area, or their composite). Shows the true uncapped rate. Falls back to annualized YoY approximation when monthly feeds are unavailable.",
  },
  "md-lq-kpi-credit-gap": {
    title: "BIS credit gap",
    body: "BIS credit-to-GDP gap for the selected view: private non-financial sector credit/GDP minus its HP-filter long-term trend (quarterly, percentage points of GDP). Above +10 pp is a BIS early-warning zone; negative = credit below trend. Color hints: amber above trend, red warning, cyan below trend.",
  },
  "md-lq-kpi-cb-gdp": {
    title: "CB / GDP",
    body: "Central bank balance sheet as % of GDP for the latest year in view. High readings mean monetary authorities hold a large share of economic footprint — relevant for QE/QT and policy footprint.",
  },
  "md-lq-kpi-money-gdp": {
    title: "Money / GDP",
    body: "Broad money supply as % of GDP. Tracks how large the monetary stock is relative to economic output — a scale-free way to compare countries and time periods.",
  },
  "md-lq-kpi-impulse": {
    title: "Liquidity impulse",
    body: "Change in broad money divided by GDP, in percentage points: (Mₜ − Mₜ₋₁) / GDP × 100. Measures how much new money was added relative to the economy — a flow-style pulse on top of the stock proxy.",
  },
  "md-lq-kpi-proxy-share": {
    title: "Proxy share",
    body: "Share of component cells in the country table that had to use constructed Proxy tier (vs WB / IMF / DB) for the table year. Lower is better data quality; high % means more estimated CB or money series.",
  },
  "md-lq-map": {
    title: "Global liquidity map",
    body: "Choropleth of all countries with liquidity data for the table year. Color scale depends on Map metric (stock or YoY). Hover for country name, value, proxy size, and data sources. Click a country to set View and reload charts for that economy.",
  },
  "md-lq-global-chart": {
    title: "Liquidity proxy · USD",
    body: "Stacked bars: three components in USD (CB balance sheet, broad money, FX reserves ex-gold). Teal line: total proxy. Hover a bar segment for value and source badge. Shows full history for the selected View — use to see QE expansions and component mix shifts.",
  },
  "md-lq-growth-chart": {
    title: "YoY growth & 3m SAR",
    body: "Annual YoY % (green, filled) on the left axis from WDI-frequency proxy. When monthly FRED feeds exist: solid gold 3m SAR on the right axis (true rate, no clipping); dashed cyan = monthly YoY on the left. Both % axes share a coincident 0% line so you can compare momentum vs structural growth. SAR tracks near-term pulses; annual YoY tracks slower change.",
  },
  "md-lq-credit-gap-chart": {
    title: "BIS credit-to-GDP gap",
    body: "Quarterly private credit cycle vs HP-filter trend (BIS). Zero line = credit on trend; +10 pp dashed red = BIS warning threshold. Complements the liquidity stock proxy: stocks can be high while private credit growth is below trend (or vice versa).",
  },
  "md-lq-regional-chart": {
    title: "Regional aggregates",
    body: "Lines compare liquidity proxy levels (USD) across fixed regional scopes — Global, Advanced, EM, East Asia, Europe, North America — independent of the View selector. Useful for relative scale: which bloc is largest and how paths diverged over time.",
  },
  "md-lq-overlay-chart": {
    title: "Market liquidity overlay",
    body: "Delayed Yahoo prices: TLT and HYG on the left axis (bond/credit demand), VIX on the right axis (fear gauge). Rising TLT often means flight-to-quality; rising HYG reflects risk credit appetite; VIX spikes signal stress. Compare visually against official liquidity stock charts above.",
  },
  "md-lq-country-table": {
    title: "Country liquidity proxies",
    body: "Featured economies ranked by proxy size for the table year. Each row sums CB + broad money + FX reserves (ex-gold) in USD. Component cells show value and source badge. Click a row to drill into that country’s charts. Export CSV for full sources and derived ratios.",
  },
  "md-lq-col-proxy": {
    title: "Proxy (USD)",
    body: "Total liquidity stock for the country in US dollars for the table year.",
  },
  "md-lq-col-yoy": {
    title: "YoY %",
    body: "Year-over-year % change in the country’s total liquidity proxy vs the prior year.",
  },
  "md-lq-col-cb": {
    title: "CB Balance Sheet",
    body: "Central bank total assets in USD. Source badge: WB, IMF IFS, DBnomics (e.g. FRED WALCL), or Proxy (12% of broad money when direct series missing).",
  },
  "md-lq-col-money": {
    title: "Broad Money",
    body: "Broad money supply in USD. From local-currency level ÷ FX, IMF IFS, or GDP × money/GDP ratio (Proxy).",
  },
  "md-lq-col-fx": {
    title: "FX Reserves",
    body: "Official FX reserves excluding gold in USD. Gold is subtracted when World Bank gold line item exists; otherwise total reserves may be used with a methodology note.",
  },
  "md-lq-col-sources": {
    title: "Sources",
    body: "Unique data tiers used for that country’s three components: WB, IMF, DB, and/or Proxy.",
  },
  "news-headlines-feed": {
    title: "All Headlines",
    body: "Aggregated Bitcoin news from RSS feeds — Bitcoin Magazine, Cointelegraph, Decrypt, and Bitcoin.com.",
  },
  "news-market-feed": {
    title: "Market News",
    body: "Price action, trading, liquidations, and volatility headlines for Bitcoin.",
  },
  "news-regulation-feed": {
    title: "Regulation News",
    body: "Policy, legal, and government headlines affecting Bitcoin custody, trading, and adoption.",
  },
  "news-institutions-feed": {
    title: "Institutional News",
    body: "ETF flows, corporate treasuries, fund launches, and Wall Street adoption stories.",
  },
  "news-mining-feed": {
    title: "Mining News",
    body: "Hash rate, miner economics, energy policy, and network security headlines.",
  },
  "news-technology-feed": {
    title: "Technology News",
    body: "Protocol upgrades, wallets, Lightning, and core development stories.",
  },
  "news-onchain-feed": {
    title: "On-Chain News",
    body: "DeFi, whale flows, exchange activity, and on-chain infrastructure headlines.",
  },
  "news-briefing": {
    title: "News Briefing",
    body: "Auto-generated summary of the top stories and sources in this news category.",
  },
  "news-x-feed": {
    title: "X (Twitter)",
    body: "Bitcoin-relevant posts from curated X accounts with established reputations — executives, researchers, ETF analysts, and on-chain voices. Sourced via public RSS mirrors when available; otherwise a cached snapshot refreshed hourly.",
  },
  "news-sentiment": {
    title: "BTC Price Sentiment",
    body: "Keyword-based label for how each headline or post may read for Bitcoin price: Bullish (positive demand/price cues), Bearish (negative risk/price cues), or Neutral when signals are mixed or absent.",
  },
  "mb-title": {
    title: "Bitcoin Indicators",
    body: "BTC-only on-chain, distribution, valuation, and sentiment metrics grouped for macro context. Sources are labeled per cell; BGeometrics data is disk-cached to respect free API limits.",
  },
  "mb-indicator": {
    title: "Chart indicator",
    body: "Select which metric to plot in the overview chart. Click a KPI card or table row to jump directly to that series.",
  },
  "mb-signal-badges": {
    title: "Signal badges",
    body: "Up to three color-coded tags per row summarizing model context. Green = bullish / undervalued; amber = caution; red = bearish / overheated; gray = neutral. Left accent: purple = valuation, gold = sentiment, teal = flow, blue = network/structural. Hover a badge for the full reading. Not investment advice — heuristic labels from published cycle bands.",
  },
  "mb-refresh": {
    title: "Automatic data updates",
    body: "Bitcoin Indicators auto-refresh about every 10 minutes while the page is open, and again when you return to the tab. Updates are store-first (disk cache / prefetch store) so free-tier APIs are not hammered. Charts load full history — zoom/pan to focus. Stale series still need the scheduled prefetch job: <code>python3 scripts/btc_prefetch.py --once</code> or the GitHub Actions workflow. Sources &amp; methodology live under the Sources sub-tab.",
  },
  "mb-updated-col": {
    title: "Updated column",
    body: "<strong>Data</strong> = calendar date of the latest observation in the series.<br><strong>Fetched</strong> = when that series was last pulled into the store.<br><br>Freshness (OK / Stale) is in the separate <strong>Status</strong> column.",
  },
  "mb-status-col": {
    title: "Status column",
    body: "<strong>OK</strong> = within the free-tier refresh window.<br><strong>Stale</strong> = fetch or data age is older than expected (prefetch not run recently, or source lag).<br><br>Not a paywall — run <code>python3 scripts/btc_prefetch.py --once</code> or wait for the scheduled prefetch workflow.",
  },
  "mb-sources-page": {
    title: "Sources",
    body: "Documents real data providers for Valuation Indicators. Core = always used free APIs. Optional = Santiment or Dune only if keys are set (Dune is not required). Computed = local models from free series. Not used = paid Glassnode/CryptoQuant deliberately excluded.",
  },
  "mb-wealth-dist": {
    title: "Wealth concentration",
    body: "Share of circulating BTC held by the richest addresses (top 10 / 100 / 1,000 / 10,000). Address-level data from BitInfoCharts — not entity-adjusted; exchange cold wallets can inflate whale counts.",
  },
  "mb-wallet-cohorts": {
    title: "Wallet size distribution",
    body: "Breakdown of addresses and supply by BTC balance bands. Shows how supply concentrates in larger wallets versus retail cohorts.",
  },
  "mb-rich-top100": {
    title: "Top 100 addresses",
    body: "Percentage of total BTC supply held by the 100 richest addresses. Rising concentration can signal whale accumulation; falling may indicate distribution.",
  },
  "mb-rich-top1000": {
    title: "Top 1,000 addresses",
    body: "Percentage of supply held by the 1,000 richest addresses — broader whale cohort than top 100 alone.",
  },
  "mb-wealth-top10": {
    title: "Top 10 addresses",
    body: "Share of supply in the ten largest addresses. Often dominated by exchange cold storage — interpret with caution.",
  },
  "mb-active-addresses": {
    title: "Active addresses",
    body: "Unique addresses active on the network in the last 24 hours. Proxy for user adoption and network usage.",
  },
  "mb-exchange-netflow": {
    title: "Exchange netflow",
    body: "Daily net BTC flowing into exchanges minus outflows (Coin Metrics Community). Positive: more deposits — potential sell pressure. Negative: net withdrawals — often read as accumulation.",
  },
  "mb-exchange-balance": {
    title: "Exchange balance",
    body: "Total BTC held on tracked exchange wallets. Rising balance means more supply readily available to sell; falling balance suggests coins moving to cold storage.",
  },
  "mb-tx-count": {
    title: "Transaction count",
    body: "Daily on-chain Bitcoin transactions. Higher counts reflect more network usage; sustained drops can mean quieter on-chain activity.",
  },
  "mb-mempool-fees": {
    title: "Mempool fees",
    body: "Recommended sat/vB fees from Mempool.space to confirm in upcoming blocks. Spikes signal congestion; low readings mean cheap block space.",
  },
  "mb-nupl": {
    title: "NUPL",
    body: "Net Unrealized Profit/Loss — network-wide paper profit as a share of market cap. High NUPL often precedes distribution; near zero or negative readings align with capitulation zones.",
  },
  "mb-sopr": {
    title: "SOPR",
    body: "Spent Output Profit Ratio — sale price divided by purchase price for moved coins. Above 1 means profit-taking; below 1 means coins moved at a loss.",
  },
  "mb-supply-profit": {
    title: "Supply in profit",
    body: "Percentage of circulating BTC trading above its on-chain cost basis. Very high readings often precede tops; low readings near bear-market floors.",
  },
  "mb-etf-flow": {
    title: "ETF net flow",
    body: "Daily net BTC flow across US spot Bitcoin ETFs (BGeometrics aggregate). Positive: net creation/buying; negative: net redemptions.",
  },
  "mb-hash-rate": {
    title: "Hash rate",
    body: "Estimated network compute securing Bitcoin. Also available under On Chain → Mining for deeper history.",
  },
  "mb-puell": {
    title: "Puell Multiple",
    body: "Daily miner revenue divided by its 365-day average. Values above ~4 historically coincided with cycle tops; below ~0.5 with bottoms. Computed locally from Blockchain.info miner revenue.",
  },
  "mb-sth-mvrv": {
    title: "STH vs LTH MVRV",
    body: "Dual-cohort market-value-to-realized-value. Short-term holders (<155 days) react quickly to price; long-term holders (155d+) reflect seasoned cost basis. STH spikes often precede near-term tops; LTH extremes lag macro turns.",
  },
  "mb-lth-mvrv": {
    title: "LTH MVRV",
    body: "MVRV for coins held 155+ days. Less noisy than aggregate MVRV — LTH cost basis moves slowly and peaks can persist after spot price rolls over.",
  },
  "mb-sth-nupl": {
    title: "STH vs LTH NUPL",
    body: "Net Unrealized Profit/Loss split by holder age. High STH NUPL means recent buyers sit on large paper gains (sell-pressure risk); LTH NUPL extremes often align with euphoria or capitulation at cycle scale.",
  },
  "mb-lth-nupl": {
    title: "LTH NUPL",
    body: "NUPL for long-term holders only. More stable than network-wide NUPL; deep negative readings historically coincided with bear-market accumulation zones.",
  },
  "mb-asopr": {
    title: "ASOPR",
    body: "Adjusted Spent Output Profit Ratio — SOPR excluding same-block spends. Above 1: profit-taking dominates; below 1: coins moved at a loss. Cleaner than raw SOPR for spotting capitulation.",
  },
  "mb-vdd-multiple": {
    title: "VDD Multiple",
    body: "Value Days Destroyed divided by its yearly average — flags when old, seasoned coins move. High readings (David Puell framework) historically clustered near cycle distribution phases.",
  },
  "mb-nrpl-usd": {
    title: "Net Realized P/L (USD)",
    body: "Daily realized profit minus realized loss in USD. Large positive spikes = distribution and profit-taking; deep negative = capitulation selling hitting the ledger.",
  },
  "mb-utxos-profit": {
    title: "UTXOs in profit %",
    body: "Share of unspent outputs (not supply-weighted) currently in profit. Finer stress gauge than supply-in-profit — drops faster when recent buyers go underwater.",
  },
  "mb-san-active-addresses": {
    title: "Active addresses (Santiment)",
    body: "Santiment daily active addresses for Bitcoin. Cross-check with Blockchain.info; rising trend supports network adoption narrative. Requires SANTIMENT_API_KEY.",
  },
  "mb-san-exchange-inflow": {
    title: "Exchange inflow (Santiment)",
    body: "USD value estimated flowing into exchanges via Santiment. Rising inflows can precede sell pressure. Requires SANTIMENT_API_KEY.",
  },
  "mb-san-exchange-outflow": {
    title: "Exchange outflow (Santiment)",
    body: "USD value leaving exchanges (Santiment estimate). Sustained outflows often align with accumulation and self-custody trends. Requires SANTIMENT_API_KEY.",
  },
  "mb-san-transaction-volume": {
    title: "Transaction volume (Santiment)",
    body: "USD on-chain transfer volume from Santiment. Complements BGeometrics flow metrics. Requires SANTIMENT_API_KEY.",
  },
  "mb-san-mvrv-usd": {
    title: "MVRV USD (Santiment)",
    body: "Santiment MVRV in USD terms — cross-check with BGeometrics MVRV for valuation context. Requires SANTIMENT_API_KEY.",
  },
  "mb-san-price-usd": {
    title: "Price USD (Santiment)",
    body: "Santiment daily BTC/USD reference price. Requires SANTIMENT_API_KEY.",
  },
  "mb-san-social-volume": {
    title: "Social volume (Santiment)",
    body: "Aggregate social mentions volume for Bitcoin from Santiment. Requires SANTIMENT_API_KEY.",
  },
  "mb-hashprice": {
    title: "Hashprice",
    body: "Miner revenue per unit of hash power (USD). Low hashprice stresses miner margins and can precede capitulation; recovery supports network security investment.",
  },
  "mb-hashrate-bg": {
    title: "Hash rate (BGeometrics)",
    body: "Network hashing power from BGeometrics — complements Blockchain.info snapshot. Trending higher = miner confidence; sharp drops may follow price stress or geographic shifts.",
  },
  "mb-difficulty": {
    title: "Mining difficulty",
    body: "Bitcoin difficulty retargets roughly every two weeks. Rising difficulty = more competition; consecutive drops signal miner capitulation and margin stress.",
  },
  "mb-miners-revenue": {
    title: "Miner revenue",
    body: "Daily USD miner revenue (block subsidy + fees) from Blockchain.info. Feeds the Puell Multiple; halving eras step-change the baseline.",
  },
  "mb-mvrv": {
    title: "MVRV",
    body: "Market value to realized value — spot price relative to the average cost basis of the supply. Above 3 often signals overheating; below 1 undervaluation zones.",
  },
  "mb-mvrv-z": {
    title: "MVRV Z-Score",
    body: "Standard-deviation distance of MVRV from its historical mean. Extreme positive readings marked prior cycle tops.",
  },
  "mb-realized-price": {
    title: "Realized price",
    body: "Aggregate cost basis of the circulating supply in USD. Price below realized price means the average coin is underwater.",
  },
  "mb-hodl-waves": {
    title: "HODL waves (1y+)",
    body: "Share of supply last moved more than one year ago. Rising long-term holder supply often aligns with accumulation phases.",
  },
  "mb-fear-greed": {
    title: "Fear & Greed Index",
    body: "Alternative.me composite sentiment score (0–100) blending volatility, momentum, social, surveys, dominance, and trends.",
  },
  "mb-funding-rate": {
    title: "Median funding rate",
    body: "Cross-venue median perpetual funding rate. Positive = longs pay shorts. See Derivatives → Perp for venue-level detail.",
  },
  "mb-open-interest": {
    title: "Open interest",
    body: "Binance BTCUSDT perpetual open interest in BTC. Rising OI with price can signal leveraged trend strength.",
  },
  "mb-btc-dominance": {
    title: "BTC dominance",
    body: "Bitcoin share of total crypto market capitalization. Chart history from BGeometrics free tier (last 4 years); KPI snapshot from CoinGecko.",
  },
  "mb-vm-intro": {
    title: "Bitcoin Valuation Models",
    body: "Educational hub for scarcity, on-chain, miner, network, and composite BTC valuation frameworks. Models are lenses — not trading signals. All data from free public APIs.",
  },
  "mb-vm-s2f": {
    title: "Stock-to-Flow (S2F)",
    body: "Ratio of circulating stock to annual issuance. Scarce assets with high S2F (gold ~62) command premiums; Bitcoin's halvings step S2F higher over time.",
  },
  "mb-vm-s2fx": {
    title: "Stock-to-Flow Cross Asset (S2FX)",
    body: "Extends S2F with halving-era phases, arguing Bitcoin reprices across scarcity clusters like precious metals.",
  },
  "mb-vm-power-law": {
    title: "Power Law Model",
    body: "Santostasi Power Law Theory: price scales as a power of time since Genesis. See Stats → Valuation → Power Law for full corridor charts.",
  },
  "mb-vm-delta-balanced": {
    title: "Delta / Balanced Price",
    body: "David Puell framework: Delta Cap isolates active economic base; Balanced Price estimates long-run equilibrium between bulls and bears.",
  },
  "mb-vm-pi-cycle": {
    title: "Pi Cycle Top",
    body: "Signals when 111-day MA crosses above 2× the 350-day MA — historically within weeks of cycle tops (2013, 2017, 2021).",
  },
  "mb-vm-hash-ribbons": {
    title: "Hash Ribbons",
    body: "Hash-rate moving-average cross indicating miner capitulation (ribbon inversion) and recovery (bullish cross).",
  },
  "mb-vm-difficulty-ribbon": {
    title: "Difficulty Ribbon",
    body: "Stacked SMAs of mining difficulty. Compression signals miner stress; expansion signals network confidence returning.",
  },
  "mb-vm-nvt": {
    title: "NVT Ratio (Signal)",
    body: "Network Value to Transactions — market cap divided by smoothed on-chain transfer volume. High NVT = expensive vs economic throughput.",
  },
  "mb-vm-metcalfe": {
    title: "Metcalfe's Law",
    body: "Network value proportional to n² (users/addresses). Compares price to addresses² to gauge network-effect valuation.",
  },
  "mb-vm-rainbow": {
    title: "Rainbow Chart",
    body: "Log regression color bands on BTC price — meme-educational map of hysteria (red) vs fire-sale (blue) zones.",
  },
  "mb-vm-cost-production": {
    title: "Cost of Production",
    body: "Thermo Price from cumulative miner revenue divided by supply — a thermodynamic production-cost floor proxy.",
  },
  "mb-vm-cdd": {
    title: "Coin Days Destroyed",
    body: "Sum of (BTC moved × days held). Spikes indicate old, seasoned coins changing hands — often distribution.",
  },

  /* ── Valuation · 4y Cycle ── */
  "vc-title": {
    title: "Bitcoin 4-Year Cycle",
    body: "Halving-cycle dashboard: where BTC sits in the current ~4-year era versus prior cycles. Covers days from halvings and cycle peak, drawdown, overlay multiples, spiral/radar structure, ROI by entry rule, bottom-timing window, valuation zones, S2F / Pi Cycle, phases, and full cycle stats.<br><br>A cycle here is one halvings era: bear low → markup → top → markdown → next low. Halvings cut block subsidy ~50% every ~210,000 blocks (~4 years). Peaks and bottoms are max/min closes between cycle anchors.",
  },
  "vc-intro": {
    title: "How to use this page",
    body: "Top to bottom: (1) status clocks, (2) cycle overlays, (3) spiral &amp; radar, (4) drawdown &amp; ROI, (5) bottom timing &amp; valuation zones, (6) full stats &amp; caveats. Toggle C1–C4 on charts. Hover series for day and multiple. Weight several sections together rather than a single chart.",
  },
  "vc-status": {
    title: "Cycle status",
    body: "Headline clocks for Cycle 4 (post–Apr 2024 halvings): days since last halvings, days since cycle ATH (max close since H4), drawdown from that ATH, days to next estimated halvings, and progress through the average C1–C3 peak-to-bottom duration.",
  },
  "vc-stat-days-halving": {
    title: "Days since last halvings",
    body: "Calendar days from the most recent halvings to the series as-of date. Prior cycles often peaked hundreds of days after the cut (~1–1.5 years, wide variance). Early post-halving is usually still bull construction; mid/late is when prior cycles more often saw euphoria. Pair day count with drawdown, liquidity, and on-chain valuation.",
  },
  "vc-stat-days-peak": {
    title: "Days since cycle peak",
    body: "Days since this cycle’s ATH (max close in the post-halving window). Primary markdown-phase clock. Completed cycles (C1–C3) typically took ~363–410 days from peak to final bottom (average ~383). Being deep into that window does not guarantee an imminent low.",
  },
  "vc-stat-drawdown": {
    title: "Drawdown from cycle ATH",
    body: "(ATH − spot) / ATH. Full-cycle max drawdowns historically often ~70–85% peak to bottom. Shallower prints can reverse or deepen; depth and time both matter.",
  },
  "vc-stat-next-halving": {
    title: "Days to next halvings (est.)",
    body: "Estimated days until the next ~50% block-subsidy cut (block-height dependent, not a fixed calendar date). Long-horizon scarcity marker; near-term price is usually driven more by liquidity, ETF flows, and risk appetite.",
  },
  "vc-stat-avg-p2b": {
    title: "Average peak → bottom (C1–C3)",
    body: "Mean peak-to-bottom duration across the three completed post-2012 cycles. Progress % = days since this cycle’s peak ÷ that average. Small sample (n=3); use as a calendar map, not a target. Implied window is in the projection section.",
  },
  "vc-overlay": {
    title: "Cycle overlay — days from halvings",
    body: "Each cycle’s daily close rebased to <strong>1× on its halvings day</strong>. X = days since that halvings; Y = multiple of the halvings close (log). Log scale keeps early-cycle multiples comparable. Vertical line = as-of day for the current cycle. Compare C4 shape to C1–C3 at the same day count.",
  },
  "vc-cycle-toggles": {
    title: "Cycle series toggles",
    body: "Show or hide cycles on the chart.<br><br><strong>C1 (2012):</strong> first post-halving era in this set — extreme multiples, small market.<br><strong>C2 (2016):</strong> through Dec 2017 top.<br><strong>C3 (2020):</strong> through 2021 tops.<br><strong>C4 (2024):</strong> current cycle (dashed) until a new cycle low is confirmed.",
  },
  "vc-bottom-overlay": {
    title: "Cycle-low multiple (from prior bear bottom)",
    body: "Daily close rebased to <strong>1× at the prior cycle’s bear bottom</strong> (min close between prior peak and next halvings). X = days since that bottom; Y = multiple of that low (log). Compares recovery amplitude after capitulation, independent of where halvings sat in the bull.",
  },
  "vc-spiral": {
    title: "Log-price spiral clock",
    body: "Long-horizon polar view of price.<br><br><strong>Angle:</strong> calendar time; one 360° turn ≈ 4 years (1461 days).<br><strong>Radius:</strong> log₁₀(price) — rings at $10, $100, $1k, $10k, $100k.<br><br><strong>Markers:</strong> green = halvings, gold = cycle tops, red = bottoms, blue = as-of. Long-structure view, not a short-term oscillator.",
  },
  "vc-radar": {
    title: "Spider (radar) cycle comparison",
    body: "Six axes, each normalized 0–1 to the max among completed cycles C1–C3:<br>1) Days H→Peak · 2) Peak × from H · 3) Max DD % · 4) Days Peak→Bottom · 5) Recovery × (bottom → next peak) · 6) Days Bottom→next H.<br><br>C4 is dashed/partial where bottom and recovery are still open — unfinished metrics, not “weak cycle.”",
  },
  "vc-drawdown-chart": {
    title: "Drawdown from cycle ATH",
    body: "Daily close drawdown from each cycle’s ATH (max close in window). X = days after that ATH; Y = % below ATH. Vertical line = as-of for the current cycle.",
  },
  "vc-roi": {
    title: "ROI from standardised entry points",
    body: "Returns for simple entry rules to the subsequent cycle peak (C4 also shows “to now”).<br><br>• Prior cycle bottom → peak<br>• Halving day close → peak<br>• +200d / +400d after halvings → peak<br>• Prior cycle peak → next peak<br><br>Historical multiples need not repeat.",
  },
  "vc-roi-prior-bottom": {
    title: "Entry: prior cycle bottom",
    body: "Buy the prior bear low (min close in that window), hold to this cycle’s peak. Typically the highest full-cycle ROIs and the hardest entries psychologically. C4 “to now” is return from that low to the as-of close.",
  },
  "vc-roi-halving": {
    title: "Entry: halvings day",
    body: "Buy the halvings-day close, hold to cycle peak. Objective calendar entry; historically strong but usually inferior to buying the prior bottom. C4 also shows return from H4 to as-of.",
  },
  "vc-roi-200d": {
    title: "Entry: +200 days after halvings",
    body: "Enter at the close ~200 days after halvings; exit at cycle peak. Classic post-halving window — often still early, not guaranteed. If the peak fell before +200d, ROI can be weak or negative.",
  },
  "vc-roi-400d": {
    title: "Entry: +400 days after halvings",
    body: "Enter at the close ~400 days after halvings; exit at cycle peak. Later entry: sometimes still pre-top, sometimes near or after local peaks depending on cycle.",
  },
  "vc-roi-prev-top": {
    title: "Entry: buy previous top",
    body: "Buy prior cycle ATH close, hold to next cycle ATH. Multi-cycle “buy strength” test. C1 has no prior top (—). Inter-cycle drawdowns between peaks were large even when successive ATHs were higher in USD.",
  },
  "vc-projection": {
    title: "Projected bottom timing &amp; phase progress",
    body: "Maps a calendar window for a cycle low from the current ATH using C1–C3 peak→bottom durations (avg and min–max). Progress bar = days since peak ÷ average duration. Also lists avg H→Peak and avg Bottom→next H. Sample n=3; liquidity and macro can shorten or lengthen bears.",
  },
  "vc-progress": {
    title: "Peak → bottom progress",
    body: "Share of the average historical peak-to-bottom window already elapsed by calendar days — not the share of eventual price drawdown completed. Time and price paths often diverge.",
  },
  "vc-valuation-zones": {
    title: "Valuation zone extremes",
    body: "On-chain valuation at the Cycle 4 peak vs as-of, from the same metric store as Valuation → Indicators (MVRV Z, NUPL, MVRV, spot/realized, Puell).<br><br><strong>Historical extremes</strong> = classic cycle bands for context.<br><strong>At cycle peak / Now</strong> = nearest series print to the cycle top date and the as-of date, with a short zone label.<br><br>Series are typically ~4 years deep — values before the window show as —.",
  },
  "vc-mvrv-z": {
    title: "MVRV Z-Score",
    body: "Market cap vs realized cap, standardized as a z-score. Very high readings historically clustered near euphoric tops; deep lows near major bottoms. Post-top, z-scores usually cool for months before deep-value prints.",
  },
  "vc-nupl-zone": {
    title: "NUPL (Net Unrealized Profit/Loss)",
    body: "(Market cap − realized cap) / market cap. High positive = large network paper profits (greed risk). Near zero/negative = widespread unrealized losses (capitulation zones). Post-top, NUPL often falls from euphoria long before true capitulation.",
  },
  "vc-realized": {
    title: "Price vs realized price",
    body: "Spot vs aggregate on-chain cost basis. Large premiums = expensive vs holder basis; near or below realized often marks late-bear value. Premiums can compress in bears while spot stays above realized for long stretches.",
  },
  "vc-puell-zone": {
    title: "Puell Multiple",
    body: "Daily miner revenue ÷ 365-day average. High = miners far above trend (historically near tops); low = miner stress (historically near bottoms). Moderates after price peaks as USD revenue falls.",
  },
  "vc-reserve-risk": {
    title: "Reserve Risk",
    body: "Price incentive to sell vs opportunity cost of holding. High near tops; lower readings improve the opportunity side in bears. Long-term holder conviction gauge, not a day-trade signal.",
  },
  "vc-rhodl": {
    title: "RHODL Ratio",
    body: "Value of recently moved coins vs older bands (realized-cap weighted age). High = young-coin / late-cycle speculation; lower = cooler, more seasoned ownership. Tops often show distribution signatures; mid-bears cool from those extremes.",
  },
  "vc-rainbow": {
    title: "Log growth / power-law corridor",
    body: "Daily close on a log scale with the Santostasi power-law fair-value line used in Stats → Power Law: Price = A × (days since Genesis)^n (A = 10^−16.493, n = 5.68).<br><br>Support/resistance = empirical p10/p90 of historical close÷fair. <strong>▲ green</strong> = cycle tops · <strong>▼ red</strong> = cycle bottoms · <strong>blue</strong> = as-of close.<br><br>Model stats (spot/fair, R²) sit in the note under the chart.",
  },
  "vc-s2f-pi": {
    title: "Stock-to-Flow &amp; Pi Cycle Top",
    body: "<strong>S2F:</strong> scarcity from stock ÷ annual issuance; each halvings roughly doubles S2F. Framing tool; demand and liquidity often dominate issuance math.<br><br><strong>Pi Cycle Top:</strong> 111-DMA crossing above 2× 350-DMA has marked several prior tops (with misses, e.g. 2021 dual tops). Heat/regime flag — pair with drawdown phase and distribution metrics.",
  },
  "vc-s2f": {
    title: "Stock-to-Flow (S2F)",
    body: "Circulating supply ÷ annual new issuance. Higher S2F = scarcer new supply vs stock. Halvings raise S2F by protocol. Strong scarcity narrative; weak as a sole price or timing model when demand shocks dominate.",
  },
  "vc-pi-cycle": {
    title: "Pi Cycle Top indicator",
    body: "111-day MA vs 2× 350-day MA. Cross of 111 above 2×350 has historically appeared near several cycle tops. Known early/false prints; use with phase, distribution, and liquidity — not alone. Full series under Valuation → Indicators.",
  },
  "vc-phases": {
    title: "The four phases",
    body: "1) <strong>Accumulation</strong> — post-capitulation, LT holders absorb.<br>2) <strong>Markup</strong> — trend up through halvings into broader participation.<br>3) <strong>Distribution / Euphoria</strong> — late-cycle heat; tops form.<br>4) <strong>Markdown</strong> — post-ATH bear.<br><br>Current phase is Markdown when price is well off the cycle ATH with peak→bottom time running.",
  },
  "vc-phase-acc": {
    title: "Phase 1 · Accumulation",
    body: "After the deepest prior markdown. Basing or slow rise; low media attention; value metrics often cheap. Hardest phase to buy emotionally.",
  },
  "vc-phase-markup": {
    title: "Phase 2 · Markup",
    body: "Sustained advance from the cycle low through halvings into price discovery. Participation broadens; higher highs dominate. Halvings often sit inside markup, not at day zero.",
  },
  "vc-phase-dist": {
    title: "Phase 3 · Distribution / Euphoria",
    body: "Late-cycle: valuation extremes, retail chase, young-coin activity, blow-off or multi-top. Ends at the cycle ATH. Can last weeks to months.",
  },
  "vc-phase-mark": {
    title: "Phase 4 · Markdown",
    body: "Post-ATH decline. Historical full-cycle drawdowns often ~70–85% and ~1 year average duration (wide variance). Includes sharp bear-market rallies. New accumulation is clear only after a durable low and recovery structure.",
  },
  "vc-full-stats": {
    title: "Full cycle statistics",
    body: "Dates, prices, day counts, multiples, and drawdowns for Cycles 1–4 plus averages of C1–C3.<br><br>Columns: halvings date/price, peak date/price, bottom date/price (or open / now for C4), H→Peak days, peak ×H, max DD, Peak→Bot days, Bot→next H.",
  },
  "vc-stat-h-to-peak": {
    title: "Days halvings → peak",
    body: "Days from that cycle’s halvings to its ATH. Length of the post-cut bull; prior cycles clustered in the mid-hundreds of days with large variance.",
  },
  "vc-stat-peak-mult": {
    title: "Peak multiple from halvings",
    body: "Cycle ATH ÷ halvings-day close. Early cycles printed huge multiples; later cycles compressed as market cap grew. Prefer log overlays when comparing eras.",
  },
  "vc-stat-max-dd": {
    title: "Max drawdown",
    body: "Peak-to-bottom % for completed cycles; peak-to-as-of for open Cycle 4. Full historical bears were often deeper than mid-bear prints.",
  },
  "vc-stat-p2b": {
    title: "Days peak → bottom",
    body: "Markdown length from ATH to cycle low. C1–C3 average ~383 days (range ~363–410). C4 shows days so far until a new low is confirmed.",
  },
  "vc-stat-b2nh": {
    title: "Days bottom → next halvings",
    body: "From cycle low to the following halvings. Early accumulation / early markup window before the next supply cut. Secondary phase reference.",
  },
  "vc-caveats": {
    title: "Important context / caveats",
    body: "• Only three completed post-2012 cycles — averages of duration and multiples are fragile.<br>• ETF / institutional flows and stablecoin liquidity change amplitude and may change duration.<br>• Global liquidity and real rates can dominate pure halvings calendars.<br>• Past performance is not a guarantee of future results.",
  },
  "vc-exec-summary": {
    title: "Executive summary",
    body: "Hybrid desk brief for the 4y Cycle tab (same shape as other Valuation bottom panels): cycle phase, price-path evidence vs C1–C3, valuation prints, combined posture, and forward BTC price framing with confidence drivers. Educational only — not a trade ticket.",
  },
  "vol-section": {
    title: "Volatility",
    body: "ARCH/GARCH family estimation on BTC log returns (√365 annualization). Compare models by AIC/BIC, inspect conditional vol, forecasts, news-impact curves, and desk risk metrics. Prefer <code>pip install arch</code> for full model coverage; otherwise a NumPy GARCH(1,1) fallback is used.",
  },
  "vol-cond": {
    title: "Conditional volatility",
    body: "Model-implied expected volatility given information up to yesterday — not a trailing historical window. Annualized with √365 for crypto.",
  },
  "vol-fcast": {
    title: "Volatility forecast",
    body: "Multi-step-ahead annualized conditional volatility from the selected/best model (1d / 7d / 30d).",
  },
  "vol-best": {
    title: "Best model (AIC)",
    body: "Lowest Akaike Information Criterion among successfully estimated models. BIC is also highlighted in the table when it disagrees.",
  },
  "vol-persist": {
    title: "Persistence & half-life",
    body: "Persistence (e.g. α+β) near 1 means shocks die slowly. Half-life is approximate days until a variance shock decays to half.",
  },
  "vol-unc": {
    title: "Long-run volatility",
    body: "Unconditional / long-run average volatility implied by the model (or sample mean of conditional vol).",
  },
  "vol-regime-garch": {
    title: "Vol regime",
    body: "Heuristic label comparing current conditional vol to the model’s long-run level: Low / Normal / Elevated / Extreme.",
  },
  "vol-compare": {
    title: "Model comparison",
    body: "Sortable desk table of estimated models. Click a row for parameters, charts, and trader insights. Status fallback means arch was missing and a simpler estimator was substituted.",
  },
  "vol-insights": {
    title: "Trading / risk insights",
    body: "Desk-oriented read of the selected model: regime, size multiplier vs a 55% vol target, 1-day VaR/ES under conditional σ, and crypto caveats (jumps, 24/7, breaks).",
  },
  "vol-guide": {
    title: "Model selection guide",
    body: "When to prefer asymmetric (EGARCH/GJR), long-memory (FIGARCH), HAR-RV benchmarks, or plain GARCH(1,1) for communication.",
  },
  "vol-col-model": {
    title: "Model",
    body: "Specification name. AIC / BIC badges mark the information-criteria leaders for this run.",
  },
  "vol-col-family": {
    title: "Family",
    body: "Model class: core (ARCH/GARCH), asymmetric (EGARCH/GJR/APARCH), long_memory (FIGARCH), or benchmark (HAR-RV).",
  },
  "vol-col-ll": {
    title: "Log-likelihood (LL)",
    body: "Maximized log-likelihood of the fitted model. Higher is better, but more parameters can inflate LL — compare with AIC/BIC.",
  },
  "vol-col-aic": {
    title: "AIC",
    body: "Akaike Information Criterion (lower is better) on the model likelihood. <strong>GARCH family:</strong> return likelihood — comparable across those rows. <strong>HAR-RV (†):</strong> Gaussian IC on the RV regression residual — valid for HAR itself but <em>not</em> comparable to GARCH AIC; suite AIC badges exclude HAR. Prefer QLIKE to rank HAR vs GARCH for forecasts.",
  },
  "vol-col-bic": {
    title: "BIC",
    body: "Bayesian Information Criterion (lower is better). Same scope rule as AIC: GARCH-family BIC is comparable across return models; HAR-RV BIC (†) is on the RV residual and is excluded from BIC ranking badges.",
  },
  "vol-col-params": {
    title: "Params",
    body: "Number of estimated coefficients (including mean and distribution shape where applicable).",
  },
  "vol-col-persist": {
    title: "Persistence",
    body: "How slowly variance mean-reverts (e.g. α+β for GARCH). Near 1 ⇒ shocks are long-lived. Missing for models without a simple scalar persistence.",
  },
  "vol-col-halflife": {
    title: "Half-life (days)",
    body: "Approximate days until a variance shock decays to half its impact, derived from persistence. Only defined when 0 &lt; persistence &lt; 1.",
  },
  "vol-col-condvol": {
    title: "Cond. vol (ann.)",
    body: "Latest conditional volatility annualized with √365. Model-implied expected vol given information up to the last sample day.",
  },
  "vol-col-status": {
    title: "Status",
    body: "<strong>ok</strong> = full estimate · <strong>fallback</strong> = simpler estimator substituted · <strong>failed</strong> = optimization or library error.",
  },
  "vol-col-rank": {
    title: "Rank",
    body: "Leaders for this run only: <strong>AIC</strong>/<strong>BIC</strong> = best among return-likelihood (GARCH-family) fits only — HAR is excluded; <strong>QLIKE</strong> = best out-of-sample forecast loss across all models including HAR. Badges sit in this column so they never overlap long model names.",
  },
  "vol-col-deribit": {
    title: "Usable for Deribit RV marks",
    body: "Desk rule from fit quality + OOS QLIKE (same logic as the detail verdict). Label: <strong>Yes</strong> / <strong>Cross-check only</strong> / <strong>No</strong>, plus a <strong>confidence %</strong> (0–100 rule score). Hover for full tier. Not a trade recommendation or implied probability of P&amp;L.",
  },
  "vol-run-commentary": {
    title: "Run commentary",
    body: "Automated desk read of the estimation pass (sample, IC scope, QLIKE mark, regime) plus a structured <strong>Deribit position &amp; trade plan</strong>: stance, structure, IV−RV entry gate, invalidation, sizing, and hedges. Rule-based from this suite only — educational, not a live order ticket. Live DVOL/IV must be checked at the desk.",
  },
  "vol-param-name": {
    title: "Parameter",
    body: "Coefficient name in the fitted specification (e.g. omega, alpha, beta for GARCH; RV_d / RV_w / RV_m for HAR).",
  },
  "vol-param-est": {
    title: "Estimate",
    body: "Point estimate from MLE/QMLE (GARCH family) or OLS (HAR-RV). Stars: * p&lt;0.1, ** p&lt;0.05, *** p&lt;0.01.",
  },
  "vol-param-se": {
    title: "Std. err.",
    body: "Standard error of the estimate (robust where the engine provides it; classical OLS SE for HAR-RV).",
  },
  "vol-param-t": {
    title: "t / z statistic",
    body: "Estimate divided by its standard error. Large absolute values indicate a coefficient distinguishable from zero.",
  },
  "vol-param-p": {
    title: "p-value",
    body: "Two-sided significance of the coefficient under a normal approximation to the t/z statistic.",
  },
  "vol-param-meaning": {
    title: "Meaning",
    body: "Plain-language role of this coefficient in the model equation shown above. Read with the specification so estimates are actionable, not just numbers.",
  },
  "vol-col-qlike": {
    title: "OOS QLIKE (mean)",
    body: "Average QLIKE loss across expanding-window forecast origins and horizons. Lower is better for volatility forecast accuracy — the metric option desks care about most.",
  },
  "vol-col-qlike7": {
    title: "QLIKE 7d",
    body: "Out-of-sample QLIKE for 7-day variance forecasts. Maps roughly to Deribit weekly expiries.",
  },
  "vol-col-qlike30": {
    title: "QLIKE 30d",
    body: "Out-of-sample QLIKE for 30-day variance forecasts. Maps roughly to Deribit monthly expiries.",
  },
  "vol-backtest": {
    title: "Forecast backtest",
    body: "Expanding-window OOS evaluation: re-estimate, forecast multi-day variance, score vs sum of squared returns. Horizons 1/7/14/30d. Primary loss = QLIKE (lower better). Built for Deribit RV vs IV workflow.",
  },
  "vol-bt-n": {
    title: "Origins",
    body: "Number of forecast origins in the expanding-window backtest for that horizon.",
  },
  "vol-bt-qlike": {
    title: "QLIKE",
    body: "Quasi-likelihood loss for volatility: log(f) + RV/f. Lower is better; preferred over MSE for vol forecast ranking.",
  },
  "vol-bt-rmse": {
    title: "RMSE (ann.)",
    body: "Root mean squared error of multi-day variance forecasts, expressed as annualized volatility units for readability.",
  },
  "vol-bt-mae": {
    title: "MAE (var)",
    body: "Mean absolute error on the variance scale (sum of squared returns over the horizon).",
  },
  "vol-bt-bias": {
    title: "Bias (var)",
    body: "Average (forecast variance − realized variance). Positive ⇒ model overstates multi-day variance on average.",
  },
  "vol-verdict": {
    title: "Desk verdict",
    body: "Rule-based fitness score (0–100) from OOS QLIKE, engine quality, and persistence. States whether the model is usable as a Deribit RV mark, a cross-check only, or unfit for option P&amp;L decisions. Not a trade recommendation.",
  },
  "ss-title": {
    title: "Final Report · Super Summary",
    body: "Paid client-style multi-domain report on Home (1 USDT or 1 USDC). After unlock, press Generate to build a fact pack + narrative with charts/tables under each section. Download PDF exports the on-screen report. Wallet addresses via env (SS_PAY_USDT_* / SS_PAY_USDC_*). Not under Valuation.",
  },
  "ss-brief": {
    title: "Client report narrative",
    body: "Institutional IC-memo style prose (xAI when available): executive brief, cycle, valuation, flows, macro/news, outlook, risks, watchlist. Each section is paired with exhibits (charts/tables) from the same fact pack. Use Download PDF for a portable copy.",
  },
  "vc-last-updated": {
    title: "As of / coverage",
    body: "Series end date and day count for the BTC/USD history behind this dashboard. Chart “today” markers use this as-of bar.",
  },
  "vc-subtab": {
    title: "4y Cycle",
    body: "Halving-cycle analysis: status clocks, overlays, spiral &amp; radar, drawdown, ROI, bottom timing, valuation zones, S2F/Pi, phases, and full statistics. Under Valuation → Indicators, next to Sentiment &amp; Market.",
  },
};

const LABEL_HELP = {
  "24h High": "high-24h",
  "24h Low": "low-24h",
  "24h Volume": "vol-btc",
  Basis: "fut-basis",
  "Funding Rate": "funding-rate",
  "Next Funding": "next-funding",
  "Open Interest": "open-interest",
  "Global L/S Ratio": "global-ls",
  "Top Trader Accounts": "top-trader-accounts",
  "Top Trader Positions": "top-trader-positions",
  "Taker Buy/Sell": "taker-ratio",
  "Block Height": "block-height",
  "Hash Rate": "hash-rate",
  Difficulty: "difficulty",
  Mempool: "mempool",
  "Fee Rate": "fee-rate",
  "On-Chain Txs (24h)": "onchain-txs",
  "Circulating Supply": "circulating-supply",
  "Avg Block Time": "avg-block-time",
  "Next Difficulty Adj.": "difficulty-adj",
  "Total AUM": "etf-total-aum",
  "Total BTC Held": "etf-total-btc",
  "% of 21M Cap": "etf-pct-21m",
  "Latest Net Flow": "etf-latest-flow",
  "5-Day Net Flow": "etf-5d-flow",
  "Daily Average": "etf-daily-avg",
  "Inflow Days Total": "etf-inflow-days",
  "Outflow Days Total": "etf-outflow-days",
};

function labelWithHelp(text, helpKey) {
  const clean = String(text).trim().replace(/\?+$/g, "");
  const key = helpKey || LABEL_HELP[clean];
  if (!key || !METRIC_HELP[key]) {
    return `<span class="metric-label-text">${clean}</span>`;
  }
  return `<span class="metric-label-text">${clean}</span><button type="button" class="help-trigger" data-help-key="${key}" aria-label="Explain ${clean}">?</button>`;
}

function decorateHelpLabels(root = document) {
  root.querySelectorAll("[data-help-key]").forEach((el) => {
    if (el.classList.contains("help-trigger")) return;
    if (el.dataset.helpDecorated === "true" && !el.querySelector(".help-trigger")) {
      el.dataset.helpDecorated = "false";
    }
    if (el.dataset.helpDecorated === "true") return;

    const key = el.dataset.helpKey;
    const labelEl = el.querySelector(":scope > .metric-label-text");
    const text = (labelEl ? labelEl.textContent : el.textContent)
      .trim()
      .replace(/\?+$/g, "");

    el.innerHTML = labelWithHelp(text, key);
    el.dataset.helpDecorated = "true";
  });
}

window.labelWithHelp = labelWithHelp;

let helpListenersReady = false;

function initMetricHelp() {
  const tooltip = document.getElementById("metric-tooltip");
  if (!tooltip) return;

  if (!helpListenersReady) {
    helpListenersReady = true;
    bindHelpListeners();
  }

  decorateHelpLabels();
}

window.decorateHelpLabels = decorateHelpLabels;
window.getMetricHelp = (key) => METRIC_HELP[key] || null;

function bindHelpListeners() {
  const tooltip = document.getElementById("metric-tooltip");
  if (!tooltip) return;

  let hideTimer = null;
  let activeKey = null;

  function hideTooltip() {
    tooltip.hidden = true;
    activeKey = null;
  }

  function positionTooltip(trigger) {
    tooltip.hidden = false;
    tooltip.style.visibility = "hidden";
    tooltip.style.display = "block";

    const rect = trigger.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const margin = 8;

    let top = rect.bottom + margin;
    let left = rect.left + rect.width / 2 - tipRect.width / 2;

    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

    if (top + tipRect.height > window.innerHeight - margin) {
      top = rect.top - tipRect.height - margin;
    }

    tooltip.style.top = `${Math.max(margin, top)}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.visibility = "visible";
  }

  function showTooltip(trigger) {
    clearTimeout(hideTimer);
    const key = trigger.dataset.helpKey;
    const help = METRIC_HELP[key];
    if (!help) return;

    activeKey = key;
    tooltip.innerHTML = `<p class="tooltip-title">${help.title}</p><div class="tooltip-body">${help.body}</div>`;
    positionTooltip(trigger);
    tooltip.hidden = false;
  }

  document.addEventListener(
    "mouseover",
    (e) => {
      const trigger = e.target.closest(".help-trigger");
      if (trigger) showTooltip(trigger);
    },
    true,
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      const trigger = e.target.closest(".help-trigger");
      if (!trigger) return;
      const related = e.relatedTarget;
      if (related && (trigger.contains(related) || tooltip.contains(related))) return;
      hideTimer = setTimeout(hideTooltip, 100);
    },
    true,
  );

  document.addEventListener("focusin", (e) => {
    const trigger = e.target.closest(".help-trigger");
    if (trigger) showTooltip(trigger);
  });

  document.addEventListener("focusout", (e) => {
    const trigger = e.target.closest(".help-trigger");
    if (trigger) hideTimer = setTimeout(hideTooltip, 100);
  });

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest(".help-trigger");
    if (trigger) {
      e.preventDefault();
      if (activeKey === trigger.dataset.helpKey && !tooltip.hidden) {
        hideTooltip();
      } else {
        showTooltip(trigger);
      }
      return;
    }
    if (!tooltip.contains(e.target)) hideTooltip();
  });

  window.addEventListener(
    "scroll",
    () => {
      const trigger = document.querySelector(
        `.help-trigger[data-help-key="${activeKey}"]`,
      );
      if (trigger && !tooltip.hidden) positionTooltip(trigger);
    },
    true,
  );
}