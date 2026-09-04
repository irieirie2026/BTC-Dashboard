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
  "law-overview": {
    title: "The Law",
    body: "Educational map of Bitcoin legal status by jurisdiction: holding, trading, payments, mining, legal-tender history, and headline individual tax notes. Color codes: green = legal/regulated, amber = restricted, red = banned, gray = unclear. Not legal, tax, or financial advice — always verify official sources. Data versioned with last-verified dates and primary links on each country card.",
  },
  "prediction-markets-outlook": {
    title: "Market Outlook",
    body: "Topic sentiment plus fee-aware arb cards. Hover any <strong>?</strong> for tooltips.<br><br>Each card: metrics (net edge, gross edge, fees + slippage, return on capital, $1,000 example, confidence), cost-stack or prediction-market-vs-Deribit chart, payoff strip, plain English + desk notes, leg table, linked markets, risks/checklist.<br><br><strong>Locked</strong> = still pays at least $1 face after fees/slippage if rules match.<br><strong>Relative value</strong> = prediction market vs Deribit <strong>Black–Scholes</strong> digital probability (option model — never abbreviated “BS” here).<br>Educational only.",
  },
  "mm-overview": {
    title: "Misc Metrics",
    body: "Cross-source BTC dashboard metrics from free public APIs only: CoinGecko, Mempool.space, Blockchain.info, and Alternative.me. Server cache refreshes every 5 minutes.",
  },
  "cal-overview": {
    title: "Calendar seasonality",
    body: "BTC/USD daily returns rearranged by <strong>calendar month</strong>, <strong>ISO week of year</strong>, and <strong>weekday</strong>. Green = positive, red = negative; stronger color = larger |return|. Same long daily history as Stats (prefers liquid Bitstamp). Hover cells and bars for detail; click <strong>?</strong> for definitions. Patterns are descriptive — not a trading edge.",
  },
  "cal-howto": {
    title: "How to read this page",
    body: "1) Color = sign and intensity of return. 2) Bars/chips = multi-year seasonality (prefer these over one hot cell). 3) Heatmap = year × period grid. 4) Footer Avg / Med / Win% summarize columns across years. 5) Hover any cell or bar for exact numbers and sample size.",
  },
  "cal-legend": {
    title: "Color scale",
    body: "Diverging palette: green positive, red negative, grey near zero. Intensity is scaled to about the 92nd percentile of |returns| <em>within that table</em>, so months and weeks are not forced onto the same absolute scale.",
  },
  "cal-sample": {
    title: "Sample",
    body: "Number of daily simple returns used after selecting the liquid history (Bitstamp when long enough). Longer samples give more year columns in the heatmaps.",
  },
  "cal-best-month": {
    title: "Best avg month",
    body: "Calendar month with the highest equal-weight average return across years (from the monthly seasonality profile). Compare to Win% — a high average with a low win rate is outlier-driven.",
  },
  "cal-worst-month": {
    title: "Worst avg month",
    body: "Calendar month with the lowest multi-year average return. Often a historically weak month for BTC, but regimes change.",
  },
  "cal-best-dow": {
    title: "Best avg weekday",
    body: "Weekday with the highest average daily simple return over the full sample. Hit rate (up-days) is shown when available. Crypto trades 24/7 — weekends count.",
  },
  "cal-worst-dow": {
    title: "Worst avg weekday",
    body: "Weekday with the lowest average daily return in the full sample.",
  },
  "cal-best-week": {
    title: "Best avg ISO week",
    body: "ISO week-of-year (1–53) with the highest multi-year average weekly return. Week numbering follows the ISO calendar (Monday-based).",
  },
  "cal-months": {
    title: "Monthly returns & seasonality",
    body: "Bars = multi-year average return by month and win rate (% of years green). Quarter/half chips compound months in each block per year, then average. Heatmap: rows = years, columns = Jan–Dec; cell = that month’s compounded return. Footer: Avg, Med, Win%. Hover cells/bars for details.",
  },
  "cal-month-bars": {
    title: "Monthly seasonality bars",
    body: "One bar per calendar month. Height ∝ |average return| across years (equal weight). Label shows average return; percentage is the share of years that month finished positive. Hover for median and year count.",
  },
  "cal-month-quarters": {
    title: "Quarter seasonality",
    body: "For each year, compounds Jan–Mar / Apr–Jun / Jul–Sep / Oct–Dec monthly returns into a quarterly return, then averages across years. Win% = share of years that quarter was green. More stable than single months when months are noisy.",
  },
  "cal-month-halves": {
    title: "Half-year seasonality",
    body: "H1 = Jan–Jun, H2 = Jul–Dec. Compounds available months in the half for each year, then averages. Useful for “first half vs second half” tape reads.",
  },
  "cal-month-heat": {
    title: "Monthly heatmap",
    body: "Each cell is the compounded simple return of all daily moves in that calendar month for that year. Empty = no data. Prefer footer Avg/Med/Win% over one extreme early-year cell.",
  },
  "cal-weeks": {
    title: "Weekly returns & seasonality (ISO)",
    body: "Bar strip = average return by ISO week of year; chips rank strongest/weakest weeks. Heatmap: ISO week-year × weeks 1–53; cell = compounded week return. Footer: Avg, Med, Win%. ISO week-year can differ from calendar year near 1 Jan.",
  },
  "cal-week-bars": {
    title: "ISO-week seasonality bars",
    body: "One thin bar per ISO week (1–53). Height ∝ |multi-year average weekly return|. Percentage under the bar ≈ share of years that week was positive. Scroll horizontally on small screens. Hover for median and n.",
  },
  "cal-week-rank": {
    title: "Strongest / weakest weeks",
    body: "Ranks ISO weeks by multi-year average return (requires enough year observations). Useful to spot recurring week-of-year strength or weakness without scanning all 52 columns.",
  },
  "cal-week-heat": {
    title: "Weekly heatmap",
    body: "Rows = ISO week-year; columns = ISO week number. Cell = compounded return of days in that week. Near year-end, a day may belong to week 52/53 of the prior ISO year — that is intentional ISO behaviour.",
  },
  "cal-dow": {
    title: "Day-of-week seasonality",
    body: "Bars = average daily return and up-day hit rate by weekday over the full sample. Heatmap cells = average daily return for that weekday within each year (not a full-year compound). BTC trades weekends.",
  },
  "cal-dow-bars": {
    title: "Weekday seasonality bars",
    body: "Height ∝ |average daily simple return| for that weekday across all days in the sample. %↑ = share of days with positive return (not years). Hover for n and exact average.",
  },
  "cal-dow-heat": {
    title: "Weekday heatmap",
    body: "Rows = calendar years; columns = Mon–Sun. Each cell averages that year’s daily simple returns on that weekday. Differs from the monthly table, which compounds a full month.",
  },
  "cal-row-avg": {
    title: "Avg row",
    body: "Equal-weight average of the column’s year values (only years with data). For months/weeks this is the average of yearly period returns; for weekdays it is the average of yearly weekday averages.",
  },
  "cal-row-med": {
    title: "Med row",
    body: "Median across years for that column. More robust than Avg when a few early high-vol years dominate the mean.",
  },
  "cal-row-win": {
    title: "Win% row",
    body: "Share of years in which that period’s return was strictly positive. 50% ≈ coin-flip by year; well above/below 50% is a stronger seasonal hint (still not a guarantee).",
  },
  "cal-compounded": {
    title: "Compounded return",
    body: "Product of (1 + daily simple returns) − 1 over the days in the period. Equivalent to last close vs first close of the period when using contiguous daily closes.",
  },
  "cal-simple-return": {
    title: "Simple return",
    body: "Close-to-close: (P_t − P_{t−1}) / P_{t−1}. Daily averages use this; monthly/weekly cells compound a sequence of them.",
  },
  "cal-iso-week": {
    title: "ISO week",
    body: "Week numbering from the ISO calendar: weeks start Monday; week 1 is the week with the year’s first Thursday. The ISO week-year of a day near 1 Jan can be the previous or next calendar year.",
  },
  "cal-commentary": {
    title: "Seasonality read",
    body: "Automated summary of strongest/weakest average months, quarters, weeks, and weekdays from this sample. Descriptive only — not investment advice and not a live trading signal.",
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
    title: "Whale tracker",
    body: "Large on-chain BTC transfers from Mempool.space (free): feed of ≥10 BTC moves <strong>including unidentified</strong> addresses, plus labeled exchange wallet balances/flows. Tiers: notable 10 · large 50 · whale 100 · mega 500 · leviathan 1000+. Sample-based (mempool + recent blocks), not a full-chain indexer or paid entity graph.",
  },
  "mw-unknown": {
    title: "Unidentified transfers",
    body: "Transfers in the sample where neither the dominant input nor output matches this panel’s public exchange labels. Still real on-chain volume — often OTC, self-custody, mixers, or unlabeled exchange wallets.",
  },
  "mw-buckets": {
    title: "Size buckets",
    body: "Count of 24h sample transfers by size tier. Helps see whether the tape is many mid-size moves or a few leviathan txs.",
  },
  "mw-top-tx": {
    title: "Largest in sample",
    body: "Biggest single transfer currently in the scanned window (by BTC). Links to Mempool.space for full vin/vout detail.",
  },
  "mw-flow-dir": {
    title: "Exchange flow (sample)",
    body: "How many sample transfers touch a labeled wallet as unknown→exchange vs exchange→unknown. Only this panel’s address book — not all exchanges.",
  },
  "mw-ex-net": {
    title: "Tracked 24h net",
    body: "Sum of 24h inflow minus outflow across labeled wallets in this panel. Positive ≈ net deposits into tracked addresses; not a complete CEX flow metric.",
  },
  "mw-ex-net-row": {
    title: "Net (row)",
    body: "24h inflow − outflow for that labeled wallet.",
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
    title: "Transfer feed",
    body: "Whale Alert–style list of large transfers (≥10 BTC) from mempool + recent blocks. Shows from → to, size tier, direction (to/from exchange when labeled), confirmed vs unconfirmed. Unidentified rows are included on purpose. Filters: All · Unidentified · Labeled · Mempool · ≥100 BTC · exchange direction.",
  },
  "mw-large-1h": {
    title: "Transfers (1h)",
    body: "Count and total BTC volume of ≥10 BTC transfers in the last hour within the sample window (not full mempool).",
  },
  "mw-large-24h": {
    title: "Transfers (24h)",
    body: "Count and total BTC volume of ≥10 BTC transfers in the last 24 hours within the sample window.",
  },
  "mw-large-spark": {
    title: "24h activity",
    body: "Hourly count of sampled large transfers over the last 24 hours.",
  },
  "mw-dormant": {
    title: "Activity spike proxy",
    body: "Compares last-hour transfer rate to the 24h hourly average for ≥10 BTC sample moves. High score = bursty large-value tape. Not true coin-days-destroyed.",
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
    body: "Set XAI_API_KEY in Vercel or .env.local (default model grok-4.5). Powers bulk discover search planning, node/edge extraction after ingest, and RAG answers. For Google results also set GOOGLE_API_KEY + GOOGLE_CSE_ID (Programmable Search Engine).",
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
    title: "CAGR (Compound Annual Growth Rate)",
    body: "Geometric annualized return over the <strong>liquid return sample</strong> (Bitstamp daily closes): (end ÷ start)^(1/years) − 1. This is the constant yearly rate that compounds to the observed total return. Early sparse Blockchain.info prints and linear gap-fills are excluded so CAGR is not inflated by unreliable ~$0.07 era prices. The metrics table also lists arithmetic mean × 365 for comparison.",
  },
  "stat-ann-vol": {
    title: "Annualized Volatility",
    body: "Sample standard deviation of daily simple returns scaled by √365. Crypto trades every calendar day, so the series is annualized with 365 (not the equity-market 252 convention). Computed on the same liquid Bitstamp sample as the other headline KPIs.",
  },
  "stat-sharpe": {
    title: "Sharpe Ratio",
    body: "Arithmetic annualized mean (daily mean × 365) divided by annualized volatility (σ × √365), assuming zero risk-free rate. Uses the standard arithmetic Sharpe definition — not CAGR in the numerator. Higher values mean more return per unit of risk over the liquid sample.",
  },
  "stat-skew": {
    title: "Skewness",
    body: "Third standardized moment of daily returns. Negative skew means more extreme down-days than a normal distribution; positive skew means fat right tail.",
  },
  "stat-max-dd": {
    title: "Maximum Drawdown",
    body: "Largest peak-to-trough decline in the cumulative return series over the liquid sample. Measures the worst buy-and-hold loss from a local high (e.g. cycle tops to cycle bottoms).",
  },
  "stat-win-rate": {
    title: "Win Rate",
    body: "Share of days with a positive simple close-to-close return. Near 50% is normal for BTC; long-term edge shows up more in average win size and CAGR than in win rate alone.",
  },
  "stat-total-ret": {
    title: "Total Return",
    body: "End price ÷ start price − 1 over the liquid sample. When the multiple is ≥10×, the hero shows capital multiple (e.g. 5,873×) instead of a huge percentage. Subtitle shows sample length in days and years.",
  },
  "stat-pair": {
    title: "Pair & sample",
    body: "BTC/USD return statistics use continuous <strong>Bitstamp</strong> daily closes (liquid venue). A longer Blockchain.info + interpolated stitch exists for power-law / long-horizon tools, but is not used for CAGR, vol, or Sharpe — those early fills from pennies overstate long-run returns.",
  },
  "stat-cumulative-chart": {
    title: "Cumulative Return chart",
    body: "Growth of $1 invested at the start of the liquid sample, compounding daily simple returns. Hover for date and cumulative %. Path includes full bull/bear cycles in the Bitstamp window.",
  },
  "stat-histogram-chart": {
    title: "Return Distribution",
    body: "Histogram of daily simple returns over the liquid sample. Shows how often small moves vs extreme up/down days occur. Fat tails (heavy extremes) are typical for BTC versus a normal bell curve.",
  },
  "stat-rolling-vol-chart": {
    title: "Rolling Volatility",
    body: "30-day trailing standard deviation of daily returns, annualized with √365. Spikes mark stress regimes (e.g. crashes); compression marks quieter markets.",
  },
  "corr-sample": {
    title: "Sample",
    body: "Number of BTC daily log-return observations in the downloaded window (Yahoo BTC-USD). Cross-asset ρ only uses days both series trade.",
  },
  "corr-top": {
    title: "Highest ρ vs BTC",
    body: "Asset with the largest full-sample Pearson correlation against Bitcoin daily log returns.",
  },
  "corr-low": {
    title: "Lowest ρ vs BTC",
    body: "Asset with the smallest (most negative or least positive) full-sample ρ vs BTC.",
  },
  "corr-engine": {
    title: "Engine",
    body: "Prices from Yahoo Finance via yfinance. Correlations are Pearson on close-to-close log returns.",
  },
  "corr-matrix": {
    title: "BTC correlation matrix",
    body: "Pearson correlation matrix among Bitcoin and flagship assets. Use Sample size (1y–5y or All) to set how many trailing overlapping days enter each ρ. Cell color scales with ρ (− red, + teal). Hover for pair and n.",
  },
  "corr-matrix-sample": {
    title: "Matrix sample size",
    body: "Trailing window of overlapping daily log returns used for every cell in the matrix (and the ρ vs Bitcoin table). All = full history; 1y–5y = last N calendar days of overlap per pair.",
  },
  "corr-btc-pairs": {
    title: "ρ vs Bitcoin",
    body: "Each asset’s full-sample and trailing 90-day correlation with BTC, sorted by |full ρ|. Click a row to load that asset on the rolling chart.",
  },
  "corr-col-asset": { title: "Asset", body: "Instrument name and group tag (crypto, equity, commodity, rates, fx, vol, stock)." },
  "corr-col-full": { title: "ρ full", body: "Pearson correlation over the full overlapping sample with BTC." },
  "corr-col-90": { title: "ρ 90d", body: "Same Pearson ρ using only the last ~90 overlapping return days." },
  "corr-col-n": { title: "N days", body: "Number of overlapping daily return observations used for the full-sample ρ." },
  "corr-rolling": {
    title: "Rolling correlation vs BTC",
    body: "Pearson ρ of <strong>daily log returns</strong> (close-to-close), not price levels. Chart Y-axis auto-scales to the series range. Windows: 1y–5y fixed, or All = expanding ρ. Long windows look smoother than short ones — that is normal.",
  },
  "corr-asset-sel": {
    title: "Asset",
    body: "Which instrument’s rolling correlation vs Bitcoin to plot.",
  },
  "corr-window-sel": {
    title: "Window",
    body: "1y–5y = fixed trailing window on aligned daily returns. All = expanding correlation using every day from the start of the overlap (min ~90 days). Longer windows are smoother; All shows the long-run co-movement path.",
  },
  "corr-commentary": {
    title: "Correlation read",
    body: "Automated summary of strongest/weakest links to BTC and a note on average equity co-movement. Descriptive only — not a trading signal.",
  },
  "stat-metrics-table": {
    title: "Descriptive Statistics table",
    body: "Full set of sample moments and percentiles on daily simple returns (liquid Bitstamp window). Use the ? next to each metric for the formula. Values match the hero strip where labels overlap.",
  },
  "stat-metrics-col-metric": {
    title: "Metric",
    body: "Name of the descriptive statistic. Hover the ? on each row for how it is calculated.",
  },
  "stat-metrics-col-value": {
    title: "Value",
    body: "Computed value for the liquid return sample. Percents are daily or annualized as stated in the metric name.",
  },
  "stat-recent-table": {
    title: "Recent Daily Returns",
    body: "Last ~30 calendar days: UTC date, Bitstamp close (USD), and day-over-day simple return. Green = up day, red = down day.",
  },
  "stat-recent-col-date": {
    title: "Date",
    body: "Calendar day of the close (UTC session for the daily bar).",
  },
  "stat-recent-col-close": {
    title: "Close",
    body: "Daily closing price in USD for BTC/USD on Bitstamp.",
  },
  "stat-recent-col-return": {
    title: "Return",
    body: "Simple return vs prior close: (close − prev) / prev.",
  },
  "stat-monthly-table": {
    title: "Monthly Returns",
    body: "Calendar-month simple returns for the last 24 months in the sample: month-end close vs prior month-end close, plus count of daily bars in that month.",
  },
  "stat-monthly-col-month": {
    title: "Month",
    body: "Calendar month label (UTC).",
  },
  "stat-monthly-col-return": {
    title: "Month return",
    body: "Simple return from the last close of the previous month to the last close of this month.",
  },
  "stat-monthly-col-days": {
    title: "Days",
    body: "Number of daily bars included in that calendar month.",
  },
  "stat-analysis": {
    title: "Analysis commentary",
    body: "Auto-generated narrative summarizing sample length, CAGR, vol, Sharpe, skew, win rate, tails, and recent months. Refresh when the price history updates.",
  },
  "stat-mean-daily": {
    title: "Mean (daily)",
    body: "Arithmetic average of daily simple returns. Annualized as mean × 365 for the arithmetic ann. mean and Sharpe numerator.",
  },
  "stat-median-daily": {
    title: "Median (daily)",
    body: "50th percentile of daily returns. Less sensitive to extreme crash/pump days than the mean.",
  },
  "stat-std-daily": {
    title: "Std deviation (daily)",
    body: "Sample standard deviation (n−1) of daily simple returns. Annualized vol = this value × √365.",
  },
  "stat-arith-ann": {
    title: "Arithmetic annualized mean",
    body: "Daily mean × 365. Not path-correct for multi-year buy-and-hold (use CAGR for that). Used in the standard Sharpe ratio.",
  },
  "stat-kurtosis": {
    title: "Excess kurtosis",
    body: "Fourth standardized moment minus 3. Positive values mean fatter tails than a normal distribution — large daily moves are more common than Gaussian models imply.",
  },
  "stat-avg-gain-loss": {
    title: "Avg gain / avg loss",
    body: "Mean of positive daily returns and mean of absolute negative daily returns. Shows whether up-days or down-days are larger on average.",
  },
  "stat-min-day": {
    title: "Min daily return",
    body: "Worst single-day simple return in the liquid sample.",
  },
  "stat-max-day": {
    title: "Max daily return",
    body: "Best single-day simple return in the liquid sample.",
  },
  "stat-p01": {
    title: "1st percentile",
    body: "Daily return exceeded only 1% of the time to the downside — extreme left-tail threshold.",
  },
  "stat-p05": {
    title: "5th percentile",
    body: "Daily return threshold for the worst 5% of days — related to historical 95% VaR on the loss side.",
  },
  "stat-p95": {
    title: "95th percentile",
    body: "Daily return exceeded only 5% of the time to the upside — large green-day threshold.",
  },
  "stat-p99": {
    title: "99th percentile",
    body: "Daily return threshold for the best 1% of days — extreme right tail.",
  },
  "stat-log-mean": {
    title: "Log-return mean",
    body: "Average of ln(close_t / close_{t−1}). Closely tied to geometric growth; exp(mean × 365) − 1 approximates CAGR when sampling is continuous.",
  },
  "stat-log-std": {
    title: "Log-return std",
    body: "Sample standard deviation of daily log returns. Often used for continuous-time vol; similar magnitude to simple-return std for BTC.",
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
    body: "Landing page for the full Bitcoin dashboard collection (14 decks). Highlights include The Law (global BTC legal status map), Market → Prediction Markets (fee-aware arbs & Deribit relative value), Stats (correlation, volatility, time series), and Valuation (on-chain cycles & 4y board). Super Summary is the paid multi-domain final report. A short original Buccaneers fanfare plus Grok TTS motto plays on home land (mute with Buccaneers). Cards below open each live section; your last visit is remembered in this browser.",
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
    title: "Wrapped BTC",
    body: "Bitcoin <strong>representations</strong> you hold as collateral — custodial (WBTC, cbBTC), threshold (tBTC), native L2 (sBTC), and yield-bearing receipts (LBTC, SolvBTC). Not the same as movement bridges. TVL is USD locked in each issuer. Peg vs spot is in basis points.",
  },
  "defi-bridges-table": {
    title: "BTC Bridges",
    body: "Cross-chain <strong>movement</strong> venues (THORChain, Across, Stargate, …). Wrap issuers are listed under Wrapped BTC, not here. TVL is capital sitting in the router, not 24h volume (Llama’s volume API is paid).",
  },
  "defi-peg-panel": {
    title: "Peg vs spot",
    body: "Wrapper price minus BTC spot, in basis points, from coins.llama.fi. Tight peg is necessary but not sufficient — you still take issuer and contract risk.",
  },
  "defi-plan-section": {
    title: "BTC DeFi strategies",
    body: "Beginner recipes for bitcoin on DeFi. Click a row for plain-English steps. Paper rows are worked examples with our numbers (loop 1.0→1.4 WBTC, three-hop bridge, fake-farm checklist) — not live size. Cash APY ranks the list; restaked bitcoin is not a 32% coupon.",
  },
  "defi-sum-family": {
    title: "Family",
    body: "Inventory = hold a wrap. Lending = supply. LP = AMM fees and IL. Restake = Babylon/LBTC stack. Leverage = borrow or loop. Warning = do not.",
  },
  "defi-risk-stack": {
    title: "Risk stack",
    body: "Heuristic 0–10 marks on peg, contract, oracle, liquidity, yield quality, IL, chain, bridge hop, admin/custody, and hack history (Llama). Weighted to a 0–100 fragility score. Higher = more fragile. Not a rating agency.",
  },
  "defi-col-risk": {
    title: "Risk",
    body: "Letter band and mini stack of the ten risk layers. Hover a cell for the layer name. Score is fragility (higher is worse).",
  },
  "defi-col-peg": {
    title: "Peg",
    body: "Distance from the reference (BTC spot or $1) in basis points. ≥40–50 bps is stress, not noise.",
  },
  "defi-col-kind": {
    title: "Model",
    body: "How the asset or venue is designed: custodial, threshold, native L2, yield wrap, or movement router.",
  },
  "defi-col-audit": {
    title: "Audits",
    body: "DeFi Llama audit count (0–3). Zero means unknown or unaudited in their schema — verify yourself.",
  },
  "defi-col-apy-split": {
    title: "Base / reward",
    body: "Organic supply/swap APY vs token emissions. If rewards dominate, you are farming emissions.",
  },
  "defi-col-apy-mean": {
    title: "30d mean APY",
    body: "Llama trailing 30-day average. A live APY far above this is often farm heat.",
  },
  "defi-col-il": {
    title: "IL",
    body: "Impermanent-loss flag from Llama (yes/no) and single vs multi-asset exposure.",
  },
  "defi-apy-chart": {
    title: "APY history",
    body: "DeFi Llama yield chart for the leading pool on this screen.",
  },
  "defi-staking-pools": {
    title: "Staking yield pools",
    body: "Live Llama yield pools tagged to Babylon/Lombard/Solv-style projects — separate from protocol TVL so the two are not mixed.",
  },
  "defi-hero-risk": {
    title: "Protocol risk KPI",
    body: "Median or worst fragility on the current list, peg stress in bps, or count of historical hack name-matches.",
  },
  "defi-hero-strategy": {
    title: "Strategy hero",
    body: "Count of live tickets, top composite, or median risk across non-paper strategies.",
  },
  "defi-sum-rank": {
    title: "Rank",
    body: "1 = best composite in this suggestion list.",
  },
  "defi-sum-trade": {
    title: "Strategy",
    body: "Structure name. PAPER means warning / process-only — do not size from it.",
  },
  "defi-sum-style": {
    title: "Style",
    body: "Core = junior-sized, defined risk. Advanced = leverage, isolated markets, Pendle. Genius = loops and do-nots.",
  },
  "defi-sum-grade": {
    title: "Grade",
    body: "Letter band on composite score (A … D).",
  },
  "defi-sum-score": {
    title: "Composite",
    body: "45% attractiveness (APY/structure) + 55% process (defined risk, lower fragility). Sorts the list.",
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
    body: "Supply-side money markets for WBTC / cbBTC / tBTC. APY is cash supply yield. Restaked LBTC is under Staking — we do not print Llama’s 0.32 field as 32%.",
  },
  "defi-borrowing-table": {
    title: "BTC Borrow markets",
    body: "Same venues, borrow side: borrowed USD, utilization, LTV, and borrow APY (what you pay). From DeFi Llama lend/borrow. Stay well below LTV; liquidation is the risk.",
  },
  "defi-hero-borrow": {
    title: "Borrow hero",
    body: "Total BTC-collateral borrowed, cheapest borrow APY, or median LTV on the current list.",
  },
  "defi-col-borrowed": {
    title: "Borrowed",
    body: "USD currently borrowed of this asset on the market.",
  },
  "defi-col-supply": {
    title: "Supplied",
    body: "USD supplied as collateral/liquidity in the market.",
  },
  "defi-col-util": {
    title: "Utilization",
    body: "Borrowed ÷ supplied. High util pushes borrow rates up and makes exits harder.",
  },
  "defi-col-ltv": {
    title: "LTV",
    body: "Maximum loan-to-value. A 73% LTV means $73 borrow per $100 collateral at the cap — do not sit there.",
  },
  "defi-col-borrow-apy": {
    title: "Borrow APY",
    body: "Interest you pay to borrow. Net = borrow APY minus borrow rewards if any.",
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
    body: "Lightning lives under <strong>On-chain → Lightning</strong>, not DeFi. DeFi here is wrapped BTC, bridges, lending, and strategies.",
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
    title: "Cash APY",
    body: "Yield used to rank. For Aave-style pools this is supply APY. If Llama prints a large ‘base’ on a restaked receipt (e.g. 32% on LBTC), we show a cash stub (~1%) and keep the headline as a footnote — that is points/emissions, not a BTC coupon. Uni v3 high APY is fee APY, path-dependent.",
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
    body: "On-chain valuation at the Cycle 4 peak vs as-of, from the same metric store as Valuation (MVRV Z, NUPL, MVRV, spot/realized, Puell).<br><br><strong>Historical extremes</strong> = classic cycle bands for context.<br><strong>At cycle peak / Now</strong> = nearest series print to the cycle top date and the as-of date, with a short zone label.<br><br>Series are typically ~4 years deep — values before the window show as —.",
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
    body: "111-day MA vs 2× 350-day MA. Cross of 111 above 2×350 has historically appeared near several cycle tops. Known early/false prints; use with phase, distribution, and liquidity — not alone. Full series under Valuation → Valuation &amp; Cycles.",
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
    body: "ARCH/GARCH family estimation on BTC log returns (√365 annualization). <strong>Model selection produces a volatility forecast</strong> (conditional σ path + term RV), not a Deribit order. Suggested trades are a second mapping: term RV vs live ATM IV, using only listed contracts. Prefer <code>pip install arch</code>; otherwise a NumPy GARCH(1,1) fallback is used.",
  },
  "ts-section": {
    title: "Time Series",
    body: "Univariate, with-exog, and multivariate models for BTC/USD at 1d / 7d / 30d: baselines, ARIMA/SARIMA, ETS, Prophet, ARIMAX (SPX/DXY/rates + hashrate/stablecoins/ETF flow when available), Kalman local level/trend and UC+cycle, ridge lags, VAR/SVAR, VECM. Prefer <code>pip install statsmodels</code>; optional <code>pip install prophet</code>. OOS backtest: RMSE, MAPE, hit rate.",
  },
  "ts-col-family": {
    title: "Family (Fam)",
    body: "<strong>U</strong> = univariate · <strong>M</strong> = multivariate (VAR/SVAR/VECM) · <strong>X</strong> = with exogenous drivers (ARIMAX). Hover the cell for the full label.",
  },
  "ts-howto": {
    title: "How to read this page",
    body: "Workflow: (1) Choose a range — estimation does not start yet. (2) Press <strong>Run all models</strong> and wait for the progress bar. (3) Use the three horizon tables (sorted by RMSE). (4) Click a row for charts. Educational only.",
  },
  "ts-range-info": {
    title: "Selected estimation period",
    body: "Updates when you change the Range control. Explains sample length, warm-up days, expected <strong>N OOS</strong> (thinned expanding-window origins — not calendar days), and a rough runtime. Press <strong>Run all models</strong> to start estimation.",
  },
  "ts-col-fcst": {
    title: "Forecast $",
    body: "Point forecast of BTC/USD at this table’s horizon (1d, 7d, or 30d) for the model row.",
  },
  "ts-col-ret": {
    title: "Ret %",
    body: "Implied cumulative log return from last sample close to the horizon forecast, shown as a percent.",
  },
  "ts-col-rmse-ret": {
    title: "RMSE ret",
    body: "Out-of-sample root mean squared error of log-return forecasts at this horizon (expanding window). Lower is better.",
  },
  "ts-col-param-name": {
    title: "Parameter",
    body: "Coefficient name in the selected model (e.g. AR lags, intercept, VAR matrix entries).",
  },
  "ts-col-param-est": {
    title: "Estimate",
    body: "Point estimate of that coefficient from the full-sample fit (not the OOS backtest).",
  },
  "ts-col-bt-h": {
    title: "Horizon",
    body: "Forecast horizon in calendar days used for the expanding-window backtest row.",
  },
  "ts-last": {
    title: "Last price",
    body: "Latest close in the estimation sample (not necessarily live spot).",
  },
  "ts-fcast": {
    title: "Price forecasts",
    body: "Point forecasts of BTC/USD at 1, 7, and 30 calendar days from the desk mark model (selected primarily by 7d OOS directional hit rate).",
  },
  "ts-ret": {
    title: "Implied log returns",
    body: "Cumulative log-return path implied by the selected model’s multi-step forecast to each horizon.",
  },
  "ts-best": {
    title: "Desk mark (hit-primary)",
    body: "Suite selection maximizes 7d OOS directional hit rate; ties use 1d/30d hit, then RMSE, MAE, AIC, BIC. Subtitle lists HIT/AIC/BIC leaders by criterion.",
  },
  "ts-engine": {
    title: "Engines",
    body: "sm = statsmodels (ARIMA/ETS/UC/VECM/SARIMAX); yf = yfinance macro; optional prophet. NumPy baselines always run.",
  },
  "ts-macro": {
    title: "Macro / exog",
    body: "SPX, DXY, rates (TNX/TLT), and on-chain series (hashrate, stablecoin supply, ETF flow when BGeometrics cache has them) for ARIMAX / VAR / VECM.",
  },
  "ts-col-model": { title: "Model", body: "Specification name." },
  "ts-col-f1": { title: "Forecast 1d", body: "1-day ahead point price forecast." },
  "ts-col-f7": { title: "Forecast 7d", body: "1-week ahead point price forecast." },
  "ts-col-f30": { title: "Forecast 30d", body: "1-month ahead point price forecast." },
  "ts-col-rmse1": {
    title: "RMSE 1d",
    body: "OOS root mean squared error of 1-day log-return forecasts (lower better).",
  },
  "ts-col-rmse7": {
    title: "RMSE 7d",
    body: "OOS RMSE of 7-day cumulative log-return forecasts — primary weekly ranking metric.",
  },
  "ts-col-rmse30": {
    title: "RMSE 30d",
    body: "OOS RMSE of 30-day cumulative log-return forecasts.",
  },
  "ts-col-r1": {
    title: "Return 1d",
    body: "Model-implied 1-day log return (percent).",
  },
  "ts-col-r7": {
    title: "Return 7d",
    body: "Model-implied 7-day cumulative log return (percent).",
  },
  "ts-col-r30": {
    title: "Return 30d",
    body: "Model-implied 30-day cumulative log return (percent).",
  },
  "ts-col-mae7": {
    title: "MAE 7d",
    body: "OOS mean absolute error of 7-day log-return forecasts (lower better).",
  },
  "ts-col-hit1": {
    title: "Hit rate 1d",
    body: "Share of backtest origins where the sign of the 1d predicted return matches realized.",
  },
  "ts-col-hit7": {
    title: "Hit rate 7d",
    body: "Share of backtest origins where the sign of the 7d predicted return matches realized.",
  },
  "ts-col-hit30": {
    title: "Hit rate 30d",
    body: "Share of backtest origins where the sign of the 30d predicted return matches realized.",
  },
  "ts-col-mape7": {
    title: "MAPE 7d",
    body: "Mean absolute percentage error on 7d price-level forecasts.",
  },
  "ts-col-mape30": {
    title: "MAPE 30d",
    body: "Mean absolute percentage error on 30d price-level forecasts.",
  },
  "ts-col-aic": {
    title: "AIC",
    body: "Akaike information criterion (in-sample). Lower is better. Measures fit vs complexity on the estimation sample — not the same as OOS accuracy. Secondary badge only.",
  },
  "ts-col-params": { title: "Params", body: "Number of estimated coefficients (approx)." },
  "ts-col-status": {
    title: "Status",
    body: "ok · fallback (simpler engine substituted) · failed. Hover for error detail when failed.",
  },
  "ts-col-rank": {
    title: "Rank",
    body: "Criterion badges for this run: <strong>BEST + HIT</strong> (top directional hit at this horizon), <strong>RMSE</strong>, <strong>MAE</strong>, <strong>MAPE</strong>, suite-wide <strong>AIC</strong> / <strong>BIC</strong>, and <strong>MARK</strong> on the 7d table for the desk selection. Badges wrap so they do not overlap names.",
  },
  "ts-col-hit": {
    title: "Hit %",
    body: "Directional hit rate: share of expanding-window OOS origins where the sign of the predicted h-day log return matches realized. Primary accuracy metric for ranking and desk mark selection. ~50% ≈ coin-flip.",
  },
  "ts-col-bic": {
    title: "BIC",
    body: "Bayesian information criterion (in-sample). Lower is better; penalizes parameters more than AIC. Secondary badge only — does not outrank OOS hit rate.",
  },
  "ts-selection-why": {
    title: "Why this model",
    body: "Explains the suite desk mark: maximize 7d OOS directional hit; break ties with 1d/30d hit, then lower RMSE, MAE, AIC, BIC. Lists criterion badges earned and leaders by metric. Always compare to Naive (RW).",
  },
  "ts-compare": {
    title: "Model comparison by horizon",
    body: "Three full-width tables (1d → 7d → 30d), each sorted by OOS <strong>hit %</strong> then RMSE. Hit is first among accuracy columns. Rank badges: BEST/HIT, RMSE, MAE, MAPE, AIC, BIC, MARK. Click a row for charts.",
  },
  "ts-h1": {
    title: "1-day horizon",
    body: "Next-day forecast and 1-day OOS metrics. Sorted by directional hit; BEST marks the hit leader.",
  },
  "ts-h7": {
    title: "7-day horizon",
    body: "One-week ahead — primary desk horizon. Suite MARK is chosen mainly on 7d hit (ties → RMSE/MAE/AIC/BIC).",
  },
  "ts-h30": {
    title: "30-day horizon",
    body: "One-month ahead forecast and monthly OOS metrics (hit-primary sort).",
  },
  "ts-col-delta": {
    title: "Δ vs last",
    body: "Forecast price minus last sample close, as a percent of last close (same information as Ret % when the model is pure log-return based).",
  },
  "ts-col-mae": {
    title: "MAE ret",
    body: "Mean absolute error of OOS log-return forecasts at this horizon (lower better).",
  },
  "ts-col-rmse-px": {
    title: "RMSE $",
    body: "Root mean squared error of OOS price-level forecasts in dollars (lower better).",
  },
  "ts-col-mape": {
    title: "MAPE %",
    body: "Mean absolute percentage error on OOS price forecasts at this horizon.",
  },
  "ts-col-n": {
    title: "N OOS",
    body: "Number of <strong>expanding-window origin dates</strong> used for this horizon — <em>not</em> the length of the estimation sample. The suite warms up ~1 year, then places origins every few weeks across the rest of the history (thinned for speed). A 10Y sample therefore does not produce ~3650 OOS points; it produces on the order of ~80–120 origins. Longer ranges increase N OOS up to a hard cap so the full model suite stays runnable.",
  },

  "ts-chart-price": {
    title: "Price + forecast path",
    body: "Always the <strong>selected</strong> model. Blue = recent daily closes; amber dashed = multi-step USD forecast path. Hover for date/horizon and price. Point path only — no confidence band.",
  },
  "ts-chart-fcast": {
    title: "Horizon forecast fan",
    body: "Selected model’s USD forecast for days 1…30 ahead. Grey dashed line = last close; green dots = 1d / 7d / 30d. Hover for exact USD and implied log return.",
  },
  "ts-chart-bt": {
    title: "Backtest RMSE by horizon",
    body: "Selected model only. Bars = expanding-window OOS RMSE of log returns at 1d, 7d, 30d. Shorter is better. Hover for RMSE, hit rate, and N origins.",
  },
  "ts-chart-resid": {
    title: "Residual histogram",
    body: "Selected model’s approximate 1-step residuals (actual − fitted return). Hover a bin for range and count. Centered near zero is healthier; fat tails mean understated extremes.",
  },
  "ts-irf": {
    title: "SVAR impulse responses",
    body: "Only when <strong>SVAR</strong> is selected. Plots BTC return response to structural shocks (DXY / SPX / BTC) under recursive Cholesky identification. Empty for other models.",
  },
  "ts-detail": {
    title: "Model detail",
    body: "Equation, fitted parameters, and desk notes for the selected model. Updates when you click a comparison-table row.",
  },
  "ts-bt-table": {
    title: "Backtest detail",
    body: "Full numeric OOS metrics for the selected model at 1d / 7d / 30d (N, RMSE ret, MAE ret, RMSE $, MAPE, directional hit). Same definitions as the horizon comparison tables.",
  },
  "ts-guide": {
    title: "Selection guide",
    body: "When to prefer baselines, ARIMA, ETS, ridge, or VAR/SVAR.",
  },
  "ts-run-commentary": {
    title: "Run commentary",
    body: "Automated desk read of the forecasting pass, including whether the OOS leader beats the Naive random walk.",
  },
  "ts-trader-memo": {
    title: "Trader memo",
    body: "Plain-language memo after estimation. Starts with a <strong>combined reading of all finished models</strong> (votes counts, skill-weighted blend, agreement). Then quality, investment suitability, stance, hold length, stop/TP scaffolding, sizing, and a junior-friendly checklist. Educational only — not investment advice.",
  },
  "vol-cond": {
    title: "Conditional volatility",
    body: "Model-implied expected volatility given information up to the last sample day — not a trailing historical window. Annualized with √365 for crypto. For the selected model, the chart’s last point is the same quantity as that model’s table “Cond. vol” cell (last fitted σ × √365).",
  },
  "vol-fcast": {
    title: "Term RV (option mark)",
    body: "Option-horizon realized-vol forecast: √(mean of the next 7 or 30 daily variance forecasts) × √365. This is what you compare to Deribit ATM IV. The 1d figure is the day-ahead path vol (E[σ tomorrow]), which is <em>not</em> the same as a 7-day option’s average vol.",
  },
  "vol-best": {
    title: "Mark model (QLIKE)",
    body: "The model used as the physical RV mark for tickets and KPIs: lowest expanding-window OOS QLIKE on <strong>term</strong> h-day variance (same quantity compared to Deribit IV). AIC/BIC remain table badges only and exclude HAR.",
  },
  "vol-dvol": {
    title: "DVOL / ATM IV",
    body: "Live Deribit DVOL when the index feed is available, otherwise nearest-weekly ATM mark IV from the option book. Not the GARCH forecast.",
  },
  "vol-ivgap": {
    title: "IV − term RV",
    body: "Live ATM mark IV minus the mark model’s term RV at 7d and 30d. Positive = options rich vs the model (short-vol gate). Negative = options cheap (long-vol gate). Cond. vol is yesterday’s close; IV is the live book.",
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
    body: "Latest fitted conditional volatility for that row’s model, annualized with √365: σ_t from the last in-sample day × √365. Same definition as the last point on the Conditional volatility chart when that model is selected (the chart plots the full σ path; the table only shows the endpoint).",
  },
  "vol-col-status": {
    title: "Status",
    body: "<strong>ok</strong> = the intended estimator ran (including HAR-RV OLS on Parkinson RV, which does not use <code>arch</code>) · <strong>fallback</strong> = a GARCH(1,1) substitute because <code>arch</code> was missing · <strong>failed</strong> = optimization or library error.",
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
    body: "Automated desk read of the estimation pass (sample, IC scope, QLIKE mark, regime) plus a junior-friendly <strong>Deribit position &amp; trade plan</strong>: plain-English long/short vol stance, IV−RV entry gate, kill rules, sizing, and <strong>example multi-leg tickets</strong> (strikes, Friday expiries, BUY/SELL legs). Rule-based from this suite only — educational, not a live order ticket. Always re-check live DVOL/IV and instrument codes on Deribit before any fill.",
  },
  "vol-param-name": {
    title: "Parameter & role",
    body: "Each row shows the <strong>Greek symbol</strong> from the model equation (e.g. α₁, β, ω), the software name (e.g. alpha[1]), a short <strong>role</strong> tag (news reaction, vol memory, leverage…), and a plain-language description of what that coefficient does for BTC volatility.",
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
  "vol-dist": {
    title: "Error distribution",
    body: "Assumed distribution of standardized residuals in the GARCH likelihood. Desk default is <strong>Student-t</strong> (fat tails). Normal understates crash days; GED is similar to t; skewed-t adds return skew (use as a robustness check — EGARCH/GJR already capture crash asymmetry in variance).",
  },
  "vol-run-all": {
    title: "Run selected · Run all · Export",
    body: "<strong>Run selected</strong> estimates only the checked models for the current range and distribution (faster). <strong>Run all</strong> checks every catalog model and estimates them for the same range and distribution, then saves that selection. <strong>Export CSV</strong> downloads the last comparison table. Prefs persist in this browser.",
  },
  "vol-model-picker": {
    title: "Models to estimate",
    body: "Multi-select catalog of ARCH/GARCH candidates. Only checked models are estimated when you press Run selected — prefs (models + distribution + range) persist in <code>localStorage</code>. Desk defaults: <strong>5Y</strong> range and <strong>Student-t</strong> errors. Presets: All, Defaults, Core, Asymmetric, None. Tags: <strong>arch</strong> needs the Python package; <strong>lite</strong> runs without it (EWMA/HAR or GARCH fallback).",
  },
  "vol-range": {
    title: "Sample range",
    body: "How many calendar days of BTC history to estimate on. Desk default is <strong>5Y</strong> (1825 days): enough for stable GARCH and QLIKE, still inside the post-2020/ETF vol regime. 10Y/All mix older illiquid crashes into today’s DVOL world; 1–2Y is too short for tails and OOS.",
  },
  "vol-est-why": {
    title: "Why 5Y + Student-t",
    body: "Recommended estimation setup for Deribit RV marks. 5Y balances sample size against structural breaks; Student-t matches fat tails without extra skew parameters. Change only with a reason and compare to this baseline.",
  },
  "vol-chart-cond": {
    title: "Conditional volatility chart",
    body: "Time series of model-implied expected volatility (√365 ann.) for the selected/detail model. Last point matches that model’s table Cond. vol when the series is not thinned away from the endpoint.",
  },
  "vol-chart-forecast": {
    title: "Multi-step forecast",
    body: "Cyan: annualized vol <em>on</em> day h. Gold: term RV from day 1 through h (the option mark). Tickets and the KPI use the gold line at 7d/30d.",
  },
  "vol-chart-nic": {
    title: "News impact curve",
    body: "How next-period variance responds to a same-day return shock (±%). Asymmetric curves (EGARCH/GJR) load more on negative shocks — relevant for crash premium on Deribit.",
  },
  "vol-chart-resid": {
    title: "Standardized residuals",
    body: "Histogram of (return ÷ conditional σ). Should look roughly like the chosen error distribution if the model is well specified; heavy tails or skew residual patterns flag misspecification.",
  },
  "vol-detail": {
    title: "Model detail",
    body: "Equation, plain-language why-for-BTC blurb, and coefficient table for the selected comparison row. Click a different row to switch charts and this panel.",
  },
  "vol-bt-horizon": {
    title: "Horizon",
    body: "Forecast length in calendar days for the expanding-window OOS evaluation (1, 7, 14, 30).",
  },
  "vol-guide-prefer": {
    title: "Prefer",
    body: "Model family the desk would lean on under the scenario in the When column.",
  },
  "vol-guide-when": {
    title: "When",
    body: "Market or data condition that favors that family (e.g. strong leverage effect → GJR/EGARCH; multi-scale RV → HAR).",
  },
  "vol-glossary": {
    title: "Glossary",
    body: "Short definitions of core suite terms (AIC, QLIKE, persistence, etc.) returned with the estimation payload.",
  },
  "vol-plan-section": {
    title: "Deribit position &amp; trade plan",
    body: "Own panel under the KPIs. Maps term RV to live ATM IV, snaps legs to listed Deribit names. Default list is Core structures; enable Show advanced for diagonals/ratios. Premiums are a USD-linear BS proxy — Deribit BTC options are inverse. Log dry-run does not send orders.",
  },
  "vol-plan-primer": {
    title: "Read this first (junior)",
    body: "Plain-English long vol vs short vol, and how to use IV − model RV before clicking anything on Deribit.",
  },
  "vol-plan-why": {
    title: "Why this stance",
    body: "Links the suite regime (cond. vol vs long-run), 1d/7d/30d RV anchors, and desk confidence to the long / short / neutral / paper stance.",
  },
  "vol-plan-rules": {
    title: "Rules before you click",
    body: "Entry gate, kill criteria, greeks intent, sizing, hedge with BTC-PERPETUAL, and hard don’ts (naked shorts, AIC-only sizing).",
  },
  "vol-plan-tickets": {
    title: "Example Deribit tickets",
    body: "Ranked multi-leg sketches snapped to the live Deribit instrument list (correct expiry codes such as 4SEP26, not 04SEP26, and listed strikes). Book column = listed vs missing. Pricing uses live ATM mark IV when available. Always re-check bid/ask and OI on Deribit.",
  },
  "vol-plan-summary": {
    title: "Ranked summary table",
    body: "Tickets sorted by composite (42% attract + 58% process). Win-zone is the share of a uniform spot grid with theo P&amp;L &gt; 0 — not a live probability of profit.",
  },
  "vol-model-product": {
    title: "What model selection produces",
    body: "Inputs: BTC log returns + distribution. Output: a volatility forecast path. Term RV averages that path over 7d/30d for option comparison. Trades are not the model output — they are a mapping of term RV vs live IV onto listed Deribit contracts.",
  },
  "vol-plan-sensitivity": {
    title: "Forecast-error sensitivity",
    body: "Recomputes long/short/neutral stance if term RV is shocked ±5 and ±10 vol points (live IV held fixed). A stance flip means the suggestion is not robust to plausible forecast error.",
  },
  "vol-ticket-score": {
    title: "Desk rank &amp; scores",
    body: "<strong>Attract</strong> = edge / R:R / structure fit. <strong>Win-zone</strong> = share of a uniform spot grid with theo P&amp;L &gt; 0 (not a live win rate). <strong>Composite</strong> ranks the list.",
  },
  "vol-ticket-stats": {
    title: "Ticket theo stats",
    body: "Black–Scholes (r=0) summary for the multi-leg book at model IV (with optional vol-pt bump). Premium, max P/L, breakevens, greeks, and ±1σ/±2σ expiry scenarios.",
  },
  "vol-ticket-iv": {
    title: "Theo IV used",
    body: "Implied vol fed into BS for this ticket: model 7d or 30d RV, plus any entry premium assumption (e.g. +6 vol pts for short-vol thesis).",
  },
  "vol-ticket-premium": {
    title: "Net premium",
    body: "Sum of signed Black–Scholes prices as a USD-linear proxy (credit or debit). Deribit BTC options are inverse (BTC). This will not match the Deribit UI.",
  },
  "vol-ticket-maxprofit": {
    title: "Max profit (expiry)",
    body: "Best expiry P&amp;L on the scanned spot grid (or uncapped for some long-wing structures).",
  },
  "vol-ticket-maxloss": {
    title: "Max loss (expiry)",
    body: "Worst expiry P&amp;L on the scanned spot grid — use as structure risk, then apply tighter emergency stops.",
  },
  "vol-ticket-be": {
    title: "Breakeven(s)",
    body: "Spot levels where expiry P&amp;L crosses zero on the theo payoff curve (yellow dots on the chart).",
  },
  "vol-ticket-greeks": {
    title: "Net Greeks",
    body: "Aggregate Δ (unitless), Γ (per $1 spot), ν (per 1 vol point), Θ ($/day) for the option legs at theo IV. Perp hedges are not included in these numbers.",
  },
  "vol-ticket-sigma1": {
    title: "±1σ expiry P&amp;L",
    body: "Theo expiry P&amp;L if spot finishes one <em>horizon</em> σ away: S × IV × √T (T = years to expiry). Not a 1-day move.",
  },
  "vol-ticket-sigma2": {
    title: "±2σ expiry P&amp;L",
    body: "Same as ±1σ at two horizon standard deviations — expiry stress, not the intraday stop band.",
  },
  "vol-ticket-bands": {
    title: "Intraday 1σ / 2σ (stops)",
    body: "Spot intervals using daily σ = IV/√365. Used in emergency “leave the band in a single session” rules — different from expiry ±1σ.",
  },
  "vol-ticket-dte": {
    title: "DTE / T",
    body: "Calendar days to the ticket expiry (or front expiry for multi-expiry books) and year fraction used in BS.",
  },
  "vol-ticket-payoff": {
    title: "Payoff chart",
    body: "P&amp;L vs spot at the <strong>nearest expiry</strong>. Single-expiry books use intrinsic. Calendars/diagonals mark the back month with remaining Black–Scholes value (it has not expired). A long calendar should peak near ATM (pin) and lose on a large trend — if the line is flat at −debit, the chart is wrong.",
  },
  "vol-ticket-wlgrid": {
    title: "Win / lose zone grid",
    body: "Same theo P&amp;L as the payoff chart, sampled on a ±28% spot grid at the analysis horizon (front expiry for calendars). Green = WIN (P&amp;L &gt; 0), red = LOSE, grey = even. The strip is the full scan; the table lists now, ±10/20%, ±1σ/±2σ horizon moves, breakevens, and pin/worst. Not a live probability of profit.",
  },
  "vol-ticket-emergency": {
    title: "Emergency actions",
    body: "Numeric kill rules (loss cap, ±2σ band, IV jump/crush) plus preliminary buttons that log a dry-run checklist. Live Deribit routing is not connected yet — confirm dialogs do not send orders.",
  },
  "vol-sum-rank": {
    title: "Rank",
    body: "1 = best composite desk score in this suggestion list.",
  },
  "vol-sum-trade": {
    title: "Trade",
    body: "Structure name. PAPER means process-only / no live risk from the suite stance.",
  },
  "vol-sum-style": {
    title: "Style",
    body: "Core = standard junior-friendly structures. Advanced = more legs, multi-expiry, or path-dependent risk.",
  },
  "vol-sum-grade": {
    title: "Grade",
    body: "Letter band on composite score (A … D). Prefer A/B+ for first live size if any.",
  },
  "vol-sum-attract": {
    title: "Attractiveness",
    body: "0–100 score for edge and structure appeal (R:R, credit vs max loss, bias fit).",
  },
  "vol-sum-success": {
    title: "Win-zone (grid)",
    body: "Share of a uniform spot grid with theo P&amp;L &gt; 0 at the analysis horizon. Not a live probability of profit.",
  },
  "vol-sum-score": {
    title: "Composite score",
    body: "0.42 × Attract + 0.58 × process (defined risk, delta, simplicity, grid win-zone). Sorts the ticket list.",
  },
  "vol-sum-winzone": {
    title: "Win zone",
    body: "Share of a uniform ±28% spot grid with theo P&amp;L &gt; 0 at the analysis horizon, plus a green/red strip of those same cells (left = down, right = up, cyan = spot). Not a live probability of profit. Open the ticket for the full win/lose table.",
  },
  "vol-sum-premium": {
    title: "Premium",
    body: "Theo net credit (Cr) or debit (Db) in USD.",
  },
  "vol-sum-maxloss": {
    title: "Max loss",
    body: "Worst theo expiry P&amp;L on the scanned grid.",
  },
  "vol-sum-maxprofit": {
    title: "Max profit",
    body: "Best theo expiry P&amp;L on the scanned grid (or uncapped note).",
  },
  "vol-sum-rr": {
    title: "R:R",
    body: "max profit ÷ |max loss| on the theo grid (capped constructions only).",
  },
  "vol-sum-legs": {
    title: "Legs",
    body: "Count of option legs (calls/puts). More legs ⇒ higher operational load.",
  },
  "vol-sum-dte": {
    title: "DTE",
    body: "Days to expiry used for ranking (front expiry if multi-expiry).",
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
    body: "Halving-cycle analysis: status clocks, overlays, spiral &amp; radar, drawdown, ROI, bottom timing, valuation zones, S2F/Pi, phases, and full statistics. Under Valuation → 4y Cycle, next to Sentiment &amp; Market.",
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