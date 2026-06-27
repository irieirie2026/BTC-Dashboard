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
    title: "1-Minute Candlestick Chart",
    body: "Each candle represents one minute of trading. The body shows open-to-close range; wicks show the high and low. Green candles closed higher than they opened; red candles closed lower. The last 60 minutes are displayed.",
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
    body: "Relative Strength Index over 14 periods measures momentum on a 0–100 scale. Above 70 is often considered overbought; below 30 oversold. It compares the magnitude of recent gains vs losses using Wilder smoothing.",
  },
  "indicator-macd": {
    title: "MACD (12, 26, 9)",
    body: "Moving Average Convergence Divergence tracks trend momentum. The MACD line is EMA(12) minus EMA(26); the signal is EMA(9) of that line. The histogram (shown) is MACD minus signal — positive suggests bullish momentum.",
  },
  "indicator-ema": {
    title: "EMA 20 / 50",
    body: "Exponential moving averages give more weight to recent prices. EMA 20 captures short-term trend; EMA 50 captures medium-term. Price above both with EMA 20 > EMA 50 often signals bullish structure.",
  },
  "indicator-sma200": {
    title: "SMA 200",
    body: "Simple moving average of the last 200 hourly closes — a widely watched long-term trend line. Price above it suggests a bull market regime; below it suggests bearish or corrective conditions. Distance % shows how extended price is.",
  },
  "indicator-bb": {
    title: "Bollinger Bands (20, 2)",
    body: "Bands placed 2 standard deviations around a 20-period SMA. %B shows where price sits within the bands (0 = lower band, 100 = upper). Touches of the upper band can indicate strength or overextension; lower band the opposite.",
  },
  "indicators-overview": {
    title: "Technical Indicators",
    body: "Hourly Binance klines (250 bars). Indicators are grouped into Momentum, Trend, Moving Averages, Volatility, and Volume. Bull/bear badges are heuristic signals for quick scanning — not trade advice.",
  },
  "indicators-briefing": {
    title: "Technical Overview",
    body: "Automated commentary below each indicator category, plus a composite read. On Market Overview, the bottom panel combines Spot price action, On-Chain network context, and the full indicator stack.",
  },
  "indicators-timeframe": {
    title: "Indicator Timeframe",
    body: "Select the candle interval used for all technical indicators on this screen: 1h (hourly), 4h (four-hour), or D (daily). Each timeframe has its own panel and commentary.",
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
  "indicator-adx": {
    title: "ADX (14)",
    body: "Average Directional Index measures trend strength (not direction). Values above 25 suggest a strong trend; +DI vs −DI shows whether bulls or bears dominate.",
  },
  "indicator-stoch": {
    title: "Stochastic (14, 3)",
    body: "Compares the close to the recent high-low range. %K is the fast line; %D is its 3-period average. Above 80 is overbought; below 20 oversold.",
  },
  "indicator-mfi": {
    title: "MFI (14)",
    body: "Money Flow Index is a volume-weighted RSI. Incorporates price and volume to gauge buying vs selling pressure on a 0–100 scale.",
  },
  "indicator-atr": {
    title: "ATR (14)",
    body: "Average True Range measures volatility in price units. Higher ATR means wider recent swings; useful for stop placement and regime context.",
  },
  "indicator-cmf": {
    title: "CMF (20)",
    body: "Chaikin Money Flow accumulates volume-weighted closing location over 20 periods. Positive values suggest accumulation; negative suggests distribution.",
  },
  "indicator-golden-cross": {
    title: "SMA 50 / 200",
    body: "Classic long-term crossover. Golden cross (SMA50 above SMA200) is often cited as a bull regime signal; death cross the opposite.",
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
  "equity-global-insights": {
    title: "Global Equity Insights",
    body: "Editable global index watchlist matching TradFi Indices: four hero quotes, performance table (1W–YTD), an interactive normalized performance chart (1W, 1M, 1Q, 1Y, WTD, MTD, YTD, 3Y, 5Y — rebased to 100), 3-month daily charts per symbol, and Yahoo Finance headlines for your watchlist. Edit tickers in the hero row or table, or use + Add index. Data from Yahoo Finance (~15 min delayed).",
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
    body: "Your customizable list of tickers for Company Insights. Edit symbols inline, press → or Enter to load the overview chart, use + Add company for more slots (up to 24), or × to remove. Saves automatically in this browser. On first visit it may import tickers from TradFi Bellwethers if you already customized that list. Peer chips are drawn from this watchlist.",
  },
  "equity-company-history": {
    title: "Chart History",
    body: "How many daily bars to load for the overview candlestick chart, technical indicators, period return, and peer performance. Options run from 3 months up to all available Yahoo Finance history (from 1990). Longer ranges need a moment to download. Toolbar and overview selectors stay in sync.",
  },
  "equity-company-commentary": {
    title: "Analysis",
    body: "Plain-language summary generated from price action, 52-week range position, valuation multiples, technical indicators, and peer context. Use alongside your own research — not a trading recommendation.",
  },
  "equity-company-peers": {
    title: "Compare Peers",
    body: "Toggle tickers from your company watchlist to include in the peer multiples table, relative performance chart, and news feed. Selections save in this browser session.",
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
    title: "Stochastic %K",
    body: "Where the close sits within the recent 14-day high/low range. %K (blue) and %D (dotted purple, 3-day average of %K). Above 80 = hot; below 20 = cold.",
  },
  "equity-company-signals": {
    title: "Signal Summary",
    body: "Readable interpretation of current RSI, moving-average cross, MACD, and Stochastic states. Color-coded bullish (green), bearish (red), or neutral — combine with price and fundamentals before acting.",
  },
  "equity-company-news": {
    title: "Company News",
    body: "Recent Yahoo Finance headlines for the selected company and active peers. Sorted by publish time; symbol badges show related tickers.",
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
    tooltip.innerHTML = `<p class="tooltip-title">${help.title}</p><p class="tooltip-body">${help.body}</p>`;
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