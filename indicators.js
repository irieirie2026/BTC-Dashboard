/* Technical indicators — categorized panels for spot & futures */

function indFmtPrice(n, decimals = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function indLabel(text, helpKey) {
  return window.labelWithHelp ? window.labelWithHelp(text, helpKey) : text;
}

function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

function calcSMA(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcRSISeries(closes, period = 14) {
  const series = [];
  for (let i = period + 1; i <= closes.length; i++) {
    const val = calcRSI(closes.slice(0, i), period);
    if (val !== null) series.push(val);
  }
  return series;
}

function calcMACD(closes) {
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdLine = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null,
  );
  const macdValues = macdLine.filter((v) => v !== null);
  if (macdValues.length < 9) return null;

  const signalSeries = emaSeries(macdValues, 9);
  const macd = macdValues[macdValues.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  return { macd, signal, histogram: macd - signal };
}

function calcBollinger(closes, period = 20, mult = 2) {
  const middle = calcSMA(closes, period);
  if (middle === null) return null;
  const slice = closes.slice(-period);
  const variance =
    slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return { upper: middle + mult * std, middle, lower: middle - mult * std, std };
}

function calcStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  if (closes.length < kPeriod) return null;
  const kValues = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const h = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    const l = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
    const c = closes[i];
    kValues.push(h === l ? 50 : ((c - l) / (h - l)) * 100);
  }
  if (kValues.length < dPeriod) return null;
  const k = kValues[kValues.length - 1];
  const d =
    kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  return { k, d };
}

function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14) {
  const rsiSeries = calcRSISeries(closes, rsiPeriod);
  if (rsiSeries.length < stochPeriod) return null;
  const slice = rsiSeries.slice(-stochPeriod);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const rsi = rsiSeries[rsiSeries.length - 1];
  const k = max === min ? 50 : ((rsi - min) / (max - min)) * 100;
  const recentK = [];
  for (let i = stochPeriod; i <= rsiSeries.length; i++) {
    const s = rsiSeries.slice(i - stochPeriod, i);
    const lo = Math.min(...s);
    const hi = Math.max(...s);
    const r = rsiSeries[i - 1];
    recentK.push(hi === lo ? 50 : ((r - lo) / (hi - lo)) * 100);
  }
  const d =
    recentK.length >= 3
      ? recentK.slice(-3).reduce((a, b) => a + b, 0) / 3
      : k;
  return { k, d };
}

function calcWilliamsR(highs, lows, closes, period = 14) {
  if (closes.length < period) return null;
  const i = closes.length - 1;
  const h = Math.max(...highs.slice(i - period + 1, i + 1));
  const l = Math.min(...lows.slice(i - period + 1, i + 1));
  const c = closes[i];
  if (h === l) return -50;
  return ((h - c) / (h - l)) * -100;
}

function calcROC(closes, period = 12) {
  if (closes.length <= period) return null;
  const prev = closes[closes.length - 1 - period];
  const cur = closes[closes.length - 1];
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function calcCCI(highs, lows, closes, period = 20) {
  if (closes.length < period) return null;
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const slice = tp.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const meanDev =
    slice.reduce((s, v) => s + Math.abs(v - sma), 0) / period;
  if (!meanDev) return 0;
  return (tp[tp.length - 1] - sma) / (0.015 * meanDev);
}

function calcMFI(highs, lows, closes, volumes, period = 14) {
  if (closes.length < period + 1) return null;
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  let pos = 0;
  let neg = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const flow = tp[i] * volumes[i];
    if (tp[i] > tp[i - 1]) pos += flow;
    else if (tp[i] < tp[i - 1]) neg += flow;
  }
  if (neg === 0) return 100;
  const ratio = pos / neg;
  return 100 - 100 / (1 + ratio);
}

function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < closes.length; i++) {
    tr.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      ),
    );
  }
  if (tr.length < period) return null;
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
  }
  return atr;
}

function calcADX(highs, lows, closes, period = 14) {
  if (closes.length < period * 2 + 1) return null;

  let trSum = 0;
  let plusSum = 0;
  let minusSum = 0;

  for (let i = 1; i <= period; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusSum += up > down && up > 0 ? up : 0;
    minusSum += down > up && down > 0 ? down : 0;
    trSum += Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
  }

  let plusDI = trSum ? (100 * plusSum) / trSum : 0;
  let minusDI = trSum ? (100 * minusSum) / trSum : 0;
  let dxSum = 0;
  let adx = 0;

  for (let i = period + 1; i < closes.length; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    const plusDM = up > down && up > 0 ? up : 0;
    const minusDM = down > up && down > 0 ? down : 0;
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );

    trSum = trSum - trSum / period + tr;
    plusSum = plusSum - plusSum / period + plusDM;
    minusSum = minusSum - minusSum / period + minusDM;

    plusDI = trSum ? (100 * plusSum) / trSum : 0;
    minusDI = trSum ? (100 * minusSum) / trSum : 0;
    const diSum = plusDI + minusDI;
    const dx = diSum ? (100 * Math.abs(plusDI - minusDI)) / diSum : 0;

    if (i === period + 1) {
      adx = dx;
      dxSum = dx;
    } else {
      adx = (adx * (period - 1) + dx) / period;
    }
  }

  return { adx, plusDI, minusDI };
}

function calcAroon(highs, lows, period = 25) {
  if (highs.length < period + 1) return null;
  const i = highs.length - 1;
  const sliceH = highs.slice(i - period, i + 1);
  const sliceL = lows.slice(i - period, i + 1);
  const daysSinceHigh = period - sliceH.indexOf(Math.max(...sliceH));
  const daysSinceLow = period - sliceL.indexOf(Math.min(...sliceL));
  const up = ((period - daysSinceHigh) / period) * 100;
  const down = ((period - daysSinceLow) / period) * 100;
  return { up, down, osc: up - down };
}

function calcTRIX(closes, period = 15) {
  const e1 = emaSeries(closes, period).filter((v) => v != null);
  if (e1.length < period + 1) return null;
  const e2 = emaSeries(e1, period).filter((v) => v != null);
  if (e2.length < period + 1) return null;
  const e3 = emaSeries(e2, period).filter((v) => v != null);
  if (e3.length < 2) return null;
  const cur = e3[e3.length - 1];
  const prev = e3[e3.length - 2];
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function calcVWMA(closes, volumes, period) {
  if (closes.length < period) return null;
  let sumPV = 0;
  let sumV = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    sumPV += closes[i] * volumes[i];
    sumV += volumes[i];
  }
  return sumV ? sumPV / sumV : null;
}

function calcKeltner(highs, lows, closes, emaPeriod = 20, atrPeriod = 10, mult = 2) {
  const mid = emaSeries(closes, emaPeriod).at(-1);
  const atr = calcATR(highs, lows, closes, atrPeriod);
  if (mid == null || atr == null) return null;
  return { upper: mid + mult * atr, middle: mid, lower: mid - mult * atr };
}

function calcDonchian(highs, lows, period = 20) {
  if (highs.length < period) return null;
  const upper = Math.max(...highs.slice(-period));
  const lower = Math.min(...lows.slice(-period));
  return { upper, lower, middle: (upper + lower) / 2 };
}

function calcOBVSeries(closes, volumes) {
  const series = [0];
  let obv = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    series.push(obv);
  }
  return series;
}

function calcCMF(highs, lows, closes, volumes, period = 20) {
  if (closes.length < period) return null;
  let sumMFV = 0;
  let sumVol = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const mfm = hl ? ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl : 0;
    const mfv = mfm * volumes[i];
    sumMFV += mfv;
    sumVol += volumes[i];
  }
  return sumVol ? sumMFV / sumVol : 0;
}

function calcForceIndex(closes, volumes, period = 13) {
  if (closes.length < period + 1) return null;
  const raw = [];
  for (let i = 1; i < closes.length; i++) {
    raw.push((closes[i] - closes[i - 1]) * volumes[i]);
  }
  const smoothed = emaSeries(raw, period);
  return smoothed.at(-1);
}

function distPct(price, level) {
  if (level == null || !level) return null;
  return ((price - level) / level) * 100;
}

function signalClass(type) {
  return type === "bull" ? "bull" : type === "bear" ? "bear" : "neutral";
}

function rsiSignal(rsi) {
  if (rsi >= 70) return { signal: "bear", label: "Overbought" };
  if (rsi <= 30) return { signal: "bull", label: "Oversold" };
  return { signal: "neutral", label: "Neutral" };
}

function renderIndicator({ name, desc, value, signal, signalLabel, bar, helpKey }) {
  const barHtml = bar
    ? bar.marker
      ? `<div class="indicator-bar-wrap markers"><div class="indicator-bar" style="left:${bar.pct}%"></div></div>`
      : `<div class="indicator-bar-wrap"><div class="indicator-bar ${bar.color}" style="width:${bar.pct}%"></div></div>`
    : "";

  return `<div class="indicator-row">
    <div>
      <span class="indicator-name">${indLabel(name, helpKey)}</span>
      <span class="indicator-desc">${desc}</span>
    </div>
    <div class="indicator-meta">
      <span class="indicator-value">${value}</span>
      <span class="signal-badge ${signalClass(signal)}">${signalLabel}</span>
    </div>
    ${barHtml}
  </div>`;
}

function createCategory() {
  return { rows: [], counts: { bull: 0, bear: 0, neutral: 0, total: 0 }, ctx: {} };
}

function addIndicator(category, props) {
  category.rows.push(renderIndicator(props));
  const sig = props.signal || "neutral";
  category.counts[sig] = (category.counts[sig] || 0) + 1;
  category.counts.total++;
}

function dominantSignal(counts) {
  const { bull = 0, bear = 0, neutral = 0 } = counts;
  if (bull > bear && bull >= neutral) return "bull";
  if (bear > bull && bear >= neutral) return "bear";
  return "neutral";
}

function dominantLabel(counts) {
  const d = dominantSignal(counts);
  return d === "bull" ? "bullish skew" : d === "bear" ? "bearish skew" : "mixed / neutral";
}

function commentMomentum(cat) {
  const { counts, ctx } = cat;
  const lines = [
    `Momentum: ${counts.bull} bullish · ${counts.bear} bearish · ${counts.neutral} neutral across ${counts.total} oscillators.`,
  ];
  const dom = dominantSignal(counts);
  if (dom === "bull")
    lines.push(
      "Oscillators lean constructive — upside momentum dominates, though stretched readings can still mean short-term pullbacks.",
    );
  else if (dom === "bear")
    lines.push(
      "Momentum gauges skew weak — rallies may face resistance until oscillators reset from oversold.",
    );
  else
    lines.push(
      "No clear momentum extreme — price may chop until RSI, Stochastic, or MFI push into overbought/oversold zones.",
    );
  if (ctx.rsi14 != null)
    lines.push(
      `RSI(14) at ${ctx.rsi14.toFixed(1)} (${ctx.rsi14 >= 70 ? "overbought" : ctx.rsi14 <= 30 ? "oversold" : "mid-range"}).`,
    );
  if (ctx.mfi != null)
    lines.push(
      `MFI at ${ctx.mfi.toFixed(1)} — ${ctx.mfi > 60 ? "buying pressure" : ctx.mfi < 40 ? "selling pressure" : "balanced money flow"}.`,
    );
  return lines;
}

function commentTrend(cat) {
  const { counts, ctx } = cat;
  const lines = [
    `Trend: ${counts.bull} bullish · ${counts.bear} bearish · ${counts.neutral} neutral across ${counts.total} trend tools.`,
  ];
  const dom = dominantSignal(counts);
  if (ctx.adx != null && ctx.adx >= 25)
    lines.push(
      `ADX ${ctx.adx.toFixed(1)} flags a strong trend — ${ctx.plusDI > ctx.minusDI ? "+DI leads (bullish structure)" : "−DI leads (bearish structure)"}.`,
    );
  else if (ctx.adx != null)
    lines.push(`ADX ${ctx.adx.toFixed(1)} — trend strength is modest; directional signals carry less weight.`);
  if (ctx.macdHist != null)
    lines.push(
      `MACD histogram ${ctx.macdHist >= 0 ? "positive" : "negative"} (${ctx.macdHist >= 0 ? "+" : ""}${ctx.macdHist.toFixed(2)}) — ${ctx.macdHist > 0 ? "bullish" : "bearish"} momentum bias.`,
    );
  if (dom === "bull") lines.push("Trend stack favors the upside — pullbacks may be shallow while MACD/ADX align up.");
  else if (dom === "bear") lines.push("Trend tools point down — bounces risk failing at moving resistance.");
  else lines.push("Trend signals are mixed — wait for MACD or ADX to confirm direction.");
  return lines;
}

function commentMovingAverages(cat) {
  const { counts, ctx } = cat;
  const lines = [
    `Moving averages: ${counts.bull} bullish · ${counts.bear} bearish · ${counts.neutral} neutral across ${counts.total} MA readings.`,
  ];
  if (ctx.above200 != null)
    lines.push(
      `Price is ${ctx.above200 ? "above" : "below"} SMA 200 (${ctx.dist200 != null ? (ctx.dist200 >= 0 ? "+" : "") + ctx.dist200.toFixed(2) + "% away" : "long-term baseline"}).`,
    );
  if (ctx.golden != null)
    lines.push(
      ctx.golden
        ? "SMA 50/200 golden cross intact — classic long-term bull regime signal."
        : "SMA 50 below SMA 200 (death cross) — longer-term structure remains cautious.",
    );
  const dom = dominantSignal(counts);
  if (dom === "bull") lines.push("Short and intermediate MAs support price — structure is constructive on pullbacks.");
  else if (dom === "bear") lines.push("Price trades under key MAs — rallies may be sold until reclaim of EMA 20/50.");
  else lines.push("MA picture is fragmented — no clean alignment across timeframes.");
  return lines;
}

function commentVolatility(cat) {
  const { counts, ctx } = cat;
  const lines = [
    `Volatility: ${counts.bull} bullish · ${counts.bear} bearish · ${counts.neutral} neutral across ${counts.total} band/range tools.`,
  ];
  if (ctx.bbWidth != null)
    lines.push(
      ctx.bbWidth < 4
        ? `Bollinger width ${ctx.bbWidth.toFixed(2)}% — squeeze conditions; breakout risk elevated.`
        : ctx.bbWidth > 8
          ? `Bollinger width ${ctx.bbWidth.toFixed(2)}% — expanded bands; moves may be extended.`
          : `Bollinger width ${ctx.bbWidth.toFixed(2)}% — normal volatility regime.`,
    );
  if (ctx.atrPct != null)
    lines.push(`ATR ${ctx.atrPct.toFixed(2)}% of price — ${ctx.atrPct > 2 ? "elevated" : "subdued"} hourly swing environment.`);
  if (ctx.pctB != null)
    lines.push(`Price at ${ctx.pctB.toFixed(0)}%B within Bollinger bands — ${ctx.pctB >= 80 ? "upper-band test" : ctx.pctB <= 20 ? "lower-band test" : "mid-band"}.`);
  const dom = dominantSignal(counts);
  if (dom === "bull") lines.push("Volatility context supports upside attempts — breakouts may follow compression.");
  else if (dom === "bear") lines.push("Upper-band / range-high signals dominate — mean-reversion risk rises.");
  else lines.push("Volatility neutral — neither squeeze nor blow-off clearly indicated.");
  return lines;
}

function commentVolume(cat) {
  const { counts, ctx } = cat;
  const lines = [
    `Volume: ${counts.bull} bullish · ${counts.bear} bearish · ${counts.neutral} neutral across ${counts.total} flow tools.`,
  ];
  if (ctx.volRatio != null)
    lines.push(
      `Current volume ${ctx.volRatio.toFixed(2)}× the 20-bar average — ${ctx.volRatio > 1.2 ? "participation is elevated" : ctx.volRatio < 0.8 ? "activity is light" : "in line with recent norms"}.`,
    );
  if (ctx.cmf != null)
    lines.push(
      `CMF ${ctx.cmf.toFixed(3)} — ${ctx.cmf > 0.05 ? "accumulation tone" : ctx.cmf < -0.05 ? "distribution tone" : "neutral flow"}.`,
    );
  if (ctx.obvSlope != null)
    lines.push(
      `OBV 14-bar slope ${ctx.obvSlope >= 0 ? "positive" : "negative"} — ${ctx.obvSlope > 0 ? "buyers absorbing supply" : "sellers pressing"}.`,
    );
  const dom = dominantSignal(counts);
  if (dom === "bull") lines.push("Volume confirms bid — rallies have flow support.");
  else if (dom === "bear") lines.push("Volume leans risk-off — weak participation on upside attempts.");
  else lines.push("Volume picture inconclusive — wait for CMF or OBV to align with price.");
  return lines;
}

function renderCategoryComment(lines) {
  if (!lines?.length) return "";
  return `<div class="indicator-category-comment">${lines.map((l) => `<p>${l}</p>`).join("")}</div>`;
}

function renderIndicatorCategory(title, category, commentFn) {
  const rows = category.rows.filter(Boolean);
  if (!rows.length) return "";
  const comment = commentFn ? renderCategoryComment(commentFn(category)) : "";
  return `<section class="indicator-category">
    <h3 class="indicator-category-title">${title}</h3>
    <div class="indicator-category-list">${rows.join("")}</div>
    ${comment}
  </section>`;
}

function tallyAll(categories) {
  const total = { bull: 0, bear: 0, neutral: 0, total: 0 };
  Object.values(categories).forEach((cat) => {
    total.bull += cat.counts.bull || 0;
    total.bear += cat.counts.bear || 0;
    total.neutral += cat.counts.neutral || 0;
    total.total += cat.counts.total || 0;
  });
  return total;
}

function buildTechnicalOverview(categories, spot, chain, timeframeLabel = "1h") {
  const all = tallyAll(categories);
  const tf = timeframeLabel || "1h";
  const lines = [];

  if (spot?.price) {
    const ch = spot.changePct != null ? (spot.changePct >= 0 ? "+" : "") + spot.changePct.toFixed(2) + "%" : "—";
    const range =
      spot.rangePos != null
        ? `positioned ${spot.rangePos.toFixed(0)}% through the 24h range`
        : "mid-range on the session";
    lines.push(
      `Spot: BTC ${indFmtPrice(spot.price)} (${ch} 24h), ${range}` +
        (spot.spreadPct != null ? ` · spread ${spot.spreadPct.toFixed(3)}%` : "") +
        ".",
    );
  }

  if (chain?.height) {
    const mempool =
      chain.mempoolCount != null
        ? `${chain.mempoolCount.toLocaleString()} pending txs (${chain.mempoolMb?.toFixed(1) ?? "—"} MB)`
        : "mempool data available";
    const fee =
      chain.fastFee != null ? `${chain.fastFee} sat/vB fast` : "fees stable";
    const diff =
      chain.diffChange != null
        ? `${chain.diffChange >= 0 ? "+" : ""}${chain.diffChange.toFixed(2)}% next difficulty`
        : "difficulty steady";
    lines.push(`On-chain: ${mempool} · ${fee} · ${diff} · hashrate ${chain.hashrate || "—"}.`);
  }

  const dom = dominantSignal(all);
  lines.push(
    `Indicators (${tf}): ${all.bull} bullish · ${all.bear} bearish · ${all.neutral} neutral (${all.total} ${tf} readings) — composite ${dominantLabel(all)}.`,
  );

  const catNames = {
    momentum: "Momentum",
    trend: "Trend",
    movingAverages: "Moving Averages",
    volatility: "Volatility",
    volume: "Volume",
  };
  Object.entries(categories).forEach(([key, cat]) => {
    if (cat.counts.total)
      lines.push(`${catNames[key]}: ${dominantLabel(cat.counts)} (${cat.counts.bull}↑ ${cat.counts.bear}↓).`);
  });

  if (spot?.price && all.total) {
    const spotUp = (spot.changePct ?? 0) >= 0;
    const techBull = dom === "bull";
    const techBear = dom === "bear";
    if (spotUp && techBull)
      lines.push(
        "Overall: Spot and technicals align bullish — trend, momentum, and flow reinforce the 24h bid.",
      );
    else if (!spotUp && techBear)
      lines.push(
        "Overall: Spot weakness matches bearish technicals — caution on longs until structure improves.",
      );
    else if (spotUp && techBear)
      lines.push(
        "Overall: Price is green on the day but indicators lag — rally may be fragile or mean-reverting.",
      );
    else if (!spotUp && techBull)
      lines.push(
        "Overall: Technicals constructive despite soft 24h tape — watch for spot to catch up to indicators.",
      );
    else
      lines.push(
        "Overall: Mixed spot and technical signals — no high-conviction directional read; range tactics favored.",
      );
  } else if (all.total) {
    lines.push(
      `Overall: Technical composite is ${dominantLabel(all)} — use category comments above for detail.`,
    );
  }

  lines.push(
    "Heuristic scan only — not financial advice. Cross-check with order book, macro, and risk limits before trading.",
  );

  return lines.map((l) => `<p>${l}</p>`).join("");
}

function buildIndicatorsOnlyOverview(categories, timeframeLabel = "1h") {
  const all = tallyAll(categories);
  const dom = dominantSignal(all);
  const tf = timeframeLabel || "1h";
  const lines = [
    `Composite (${tf}): ${all.bull} bullish · ${all.bear} bearish · ${all.neutral} neutral across ${all.total} perp readings — ${dominantLabel(all)}.`,
  ];
  Object.entries({
    momentum: "Momentum",
    trend: "Trend",
    movingAverages: "Moving Averages",
    volatility: "Volatility",
    volume: "Volume",
  }).forEach(([key, label]) => {
    const cat = categories[key];
    if (cat?.counts.total)
      lines.push(`${label}: ${dominantLabel(cat.counts)}.`);
  });
  lines.push(
    dom === "bull"
      ? "Perp technicals favor the long side on this timeframe."
      : dom === "bear"
        ? "Perp technicals lean short-biased on this timeframe."
        : "Perp technicals are inconclusive — wait for category alignment.",
  );
  lines.push("Automated commentary — not financial advice.");
  return lines.map((l) => `<p>${l}</p>`).join("");
}

function buildIndicators(ohlcv, price) {
  const { closes, highs, lows, volumes } = ohlcv;
  const momentum = createCategory();
  const trend = createCategory();
  const movingAverages = createCategory();
  const volatility = createCategory();
  const volumeCat = createCategory();

  const rsi14 = calcRSI(closes, 14);
  if (rsi14 !== null) {
    const rs = rsiSignal(rsi14);
    addIndicator(momentum, {
        name: "RSI (14)",
        helpKey: "indicator-rsi",
        desc: "Relative strength · momentum",
        value: rsi14.toFixed(1),
        signal: rs.signal,
        signalLabel: rs.label,
        bar: { pct: rsi14, color: rsi14 >= 50 ? "green" : "red" },
    });
    momentum.ctx.rsi14 = rsi14;
  }

  const rsi7 = calcRSI(closes, 7);
  if (rsi7 !== null) {
    const rs = rsiSignal(rsi7);
    addIndicator(momentum, {
        name: "RSI (7)",
        helpKey: "indicator-rsi7",
        desc: "Fast momentum oscillator",
        value: rsi7.toFixed(1),
        signal: rs.signal,
        signalLabel: rs.label,
        bar: { pct: rsi7, color: rsi7 >= 50 ? "green" : "red" },
    });
  }

  const stoch = calcStochastic(highs, lows, closes);
  if (stoch) {
    const stSig =
      stoch.k >= 80 ? "bear" : stoch.k <= 20 ? "bull" : "neutral";
    const stLab =
      stoch.k >= 80 ? "Overbought" : stoch.k <= 20 ? "Oversold" : "Neutral";
    addIndicator(momentum, {
        name: "Stochastic (14, 3)",
        helpKey: "indicator-stoch",
        desc: `%K ${stoch.k.toFixed(1)} · %D ${stoch.d.toFixed(1)}`,
        value: stoch.k.toFixed(1),
        signal: stSig,
        signalLabel: stLab,
        bar: { pct: stoch.k, color: stoch.k >= 50 ? "green" : "red" },
    });
  }

  const stochRsi = calcStochRSI(closes);
  if (stochRsi) {
    const srSig =
      stochRsi.k >= 80 ? "bear" : stochRsi.k <= 20 ? "bull" : "neutral";
    addIndicator(momentum, {
        name: "Stoch RSI (14)",
        helpKey: "indicator-stoch-rsi",
        desc: `RSI smoothed stochastic · %D ${stochRsi.d.toFixed(1)}`,
        value: stochRsi.k.toFixed(1),
        signal: srSig,
        signalLabel:
          stochRsi.k >= 80 ? "Overbought" : stochRsi.k <= 20 ? "Oversold" : "Neutral",
        bar: { pct: stochRsi.k, color: stochRsi.k >= 50 ? "green" : "red" },
    });
  }

  const willR = calcWilliamsR(highs, lows, closes);
  if (willR !== null) {
    const wrSig = willR >= -20 ? "bear" : willR <= -80 ? "bull" : "neutral";
    addIndicator(momentum, {
        name: "Williams %R (14)",
        helpKey: "indicator-willr",
        desc: "Overbought / oversold oscillator",
        value: willR.toFixed(1),
        signal: wrSig,
        signalLabel:
          willR >= -20 ? "Overbought" : willR <= -80 ? "Oversold" : "Neutral",
        bar: { pct: Math.max(0, 100 + willR), color: willR >= -50 ? "green" : "red" },
    });
  }

  const roc = calcROC(closes, 12);
  if (roc !== null) {
    addIndicator(momentum, {
        name: "ROC (12)",
        helpKey: "indicator-roc",
        desc: "Rate of change · 12-period momentum",
        value: (roc >= 0 ? "+" : "") + roc.toFixed(2) + "%",
        signal: roc > 1 ? "bull" : roc < -1 ? "bear" : "neutral",
        signalLabel: roc > 0 ? "Positive" : roc < 0 ? "Negative" : "Flat",
        bar: {
          pct: Math.min(Math.abs(roc) * 10, 100),
          color: roc >= 0 ? "green" : "red",
        },
    });
  }

  const cci = calcCCI(highs, lows, closes);
  if (cci !== null) {
    const cciSig = cci > 100 ? "bear" : cci < -100 ? "bull" : "neutral";
    addIndicator(momentum, {
        name: "CCI (20)",
        helpKey: "indicator-cci",
        desc: "Commodity Channel Index",
        value: cci.toFixed(1),
        signal: cciSig,
        signalLabel:
          cci > 100 ? "Extended high" : cci < -100 ? "Extended low" : "Neutral",
        bar: {
          pct: Math.min(Math.abs(cci), 100),
          color: cci >= 0 ? "green" : "red",
        },
    });
  }

  const mfi = calcMFI(highs, lows, closes, volumes);
  if (mfi !== null) {
    const mf = rsiSignal(mfi);
    addIndicator(momentum, {
        name: "MFI (14)",
        helpKey: "indicator-mfi",
        desc: "Money Flow Index · volume-weighted RSI",
        value: mfi.toFixed(1),
        signal: mf.signal,
        signalLabel: mf.label,
        bar: { pct: mfi, color: mfi >= 50 ? "green" : "red" },
    });
    momentum.ctx.mfi = mfi;
  }

  const macd = calcMACD(closes);
  if (macd) {
    const macdSignal = macd.histogram > 0 ? "bull" : macd.histogram < 0 ? "bear" : "neutral";
    addIndicator(trend, {
        name: "MACD (12, 26, 9)",
        helpKey: "indicator-macd",
        desc: `Line ${macd.macd.toFixed(2)} · Signal ${macd.signal.toFixed(2)}`,
        value:
          macd.histogram >= 0
            ? "+" + macd.histogram.toFixed(2)
            : macd.histogram.toFixed(2),
        signal: macdSignal,
        signalLabel:
          macd.histogram > 0 ? "Bullish" : macd.histogram < 0 ? "Bearish" : "Flat",
        bar: {
          pct: Math.min(Math.abs(macd.histogram) * 10, 100),
          color: macd.histogram >= 0 ? "green" : "red",
        },
    });
    trend.ctx.macdHist = macd.histogram;
  }

  const adx = calcADX(highs, lows, closes);
  if (adx) {
    const adxSig =
      adx.adx >= 25
        ? adx.plusDI > adx.minusDI
          ? "bull"
          : "bear"
        : "neutral";
    addIndicator(trend, {
        name: "ADX (14)",
        helpKey: "indicator-adx",
        desc: `+DI ${adx.plusDI.toFixed(1)} · −DI ${adx.minusDI.toFixed(1)}`,
        value: adx.adx.toFixed(1),
        signal: adxSig,
        signalLabel:
          adx.adx >= 25
            ? adx.plusDI > adx.minusDI
              ? "Strong uptrend"
              : "Strong downtrend"
            : "Weak trend",
        bar: { pct: Math.min(adx.adx, 100), color: adx.plusDI >= adx.minusDI ? "green" : "red" },
    });
    trend.ctx.adx = adx.adx;
    trend.ctx.plusDI = adx.plusDI;
    trend.ctx.minusDI = adx.minusDI;
  }

  const aroon = calcAroon(highs, lows);
  if (aroon) {
    const arSig =
      aroon.osc > 50 ? "bull" : aroon.osc < -50 ? "bear" : "neutral";
    addIndicator(trend, {
        name: "Aroon (25)",
        helpKey: "indicator-aroon",
        desc: `Up ${aroon.up.toFixed(0)} · Down ${aroon.down.toFixed(0)}`,
        value: (aroon.osc >= 0 ? "+" : "") + aroon.osc.toFixed(0),
        signal: arSig,
        signalLabel:
          aroon.osc > 0 ? "Up dominant" : aroon.osc < 0 ? "Down dominant" : "Balanced",
        bar: {
          pct: Math.min(Math.abs(aroon.osc), 100),
          color: aroon.osc >= 0 ? "green" : "red",
        },
    });
  }

  const trix = calcTRIX(closes);
  if (trix !== null) {
    addIndicator(trend, {
        name: "TRIX (15)",
        helpKey: "indicator-trix",
        desc: "Triple-smoothed EMA rate of change",
        value: (trix >= 0 ? "+" : "") + trix.toFixed(4) + "%",
        signal: trix > 0 ? "bull" : trix < 0 ? "bear" : "neutral",
        signalLabel: trix > 0 ? "Rising" : trix < 0 ? "Falling" : "Flat",
        bar: {
          pct: Math.min(Math.abs(trix) * 200, 100),
          color: trix >= 0 ? "green" : "red",
        },
    });
  }

  const ema9 = emaSeries(closes, 9).at(-1);
  const ema21 = emaSeries(closes, 21).at(-1);
  const ema20 = emaSeries(closes, 20).at(-1);
  const ema50 = emaSeries(closes, 50).at(-1);
  const ema100 = emaSeries(closes, 100).at(-1);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const sma100 = calcSMA(closes, 100);
  const sma200 = calcSMA(closes, 200);

  if (ema9 != null) {
    const d = distPct(price, ema9);
    addIndicator(movingAverages, {
        name: "EMA 9",
        helpKey: "indicator-ema9",
        desc: `Level ${indFmtPrice(ema9)}`,
        value: (d >= 0 ? "+" : "") + d.toFixed(2) + "%",
        signal: d > 0.5 ? "bull" : d < -0.5 ? "bear" : "neutral",
        signalLabel: price >= ema9 ? "Above" : "Below",
        bar: {
          pct: Math.min(Math.abs(d) * 10, 100),
          color: d >= 0 ? "green" : "red",
        },
    });
  }

  if (ema9 != null && ema21 != null) {
    const cross = ema9 >= ema21;
    addIndicator(movingAverages, {
        name: "EMA 9 / 21",
        helpKey: "indicator-ema921",
        desc: `EMA9 ${indFmtPrice(ema9)} · EMA21 ${indFmtPrice(ema21)}`,
        value: cross ? "Golden" : "Death",
        signal: cross && price >= ema9 ? "bull" : !cross && price < ema9 ? "bear" : "neutral",
        signalLabel: cross ? "EMA9 > EMA21" : "EMA9 < EMA21",
    });
  }

  if (ema20 != null && ema50 != null) {
    const above20 = price >= ema20;
    const above50 = price >= ema50;
    const cross = ema20 >= ema50;
    const emaSignal =
      above20 && above50 && cross ? "bull" : !above20 && !above50 && !cross ? "bear" : "neutral";
    addIndicator(movingAverages, {
        name: "EMA 20 / 50",
        helpKey: "indicator-ema",
        desc: `EMA20 ${indFmtPrice(ema20)} · EMA50 ${indFmtPrice(ema50)}`,
        value: (above20 ? "Above" : "Below") + " 20",
        signal: emaSignal,
        signalLabel: cross ? "EMA20 > EMA50" : "EMA20 < EMA50",
    });
  }

  if (ema100 != null) {
    const d = distPct(price, ema100);
    addIndicator(movingAverages, {
        name: "EMA 100",
        helpKey: "indicator-ema100",
        desc: "Medium-long trend filter",
        value: (d >= 0 ? "+" : "") + d.toFixed(2) + "%",
        signal: d > 2 ? "bull" : d < -2 ? "bear" : "neutral",
        signalLabel: price >= ema100 ? "Above 100" : "Below 100",
        bar: {
          pct: Math.min(Math.abs(d) * 5, 100),
          color: d >= 0 ? "green" : "red",
        },
    });
  }

  if (sma50 != null) {
    const d = distPct(price, sma50);
    addIndicator(movingAverages, {
        name: "SMA 50",
        helpKey: "indicator-sma50",
        desc: "Intermediate trend baseline",
        value: (d >= 0 ? "+" : "") + d.toFixed(2) + "%",
        signal: d > 2 ? "bull" : d < -2 ? "bear" : "neutral",
        signalLabel: price >= sma50 ? "Above 50" : "Below 50",
        bar: {
          pct: Math.min(Math.abs(d) * 5, 100),
          color: d >= 0 ? "green" : "red",
        },
    });
  }

  if (sma100 != null) {
    const d = distPct(price, sma100);
    addIndicator(movingAverages, {
        name: "SMA 100",
        helpKey: "indicator-sma100",
        desc: "Swing trend reference",
        value: (d >= 0 ? "+" : "") + d.toFixed(2) + "%",
        signal: d > 2 ? "bull" : d < -2 ? "bear" : "neutral",
        signalLabel: price >= sma100 ? "Above 100" : "Below 100",
        bar: {
          pct: Math.min(Math.abs(d) * 5, 100),
          color: d >= 0 ? "green" : "red",
        },
    });
  }

  if (sma200 !== null) {
    const dist = distPct(price, sma200);
    movingAverages.ctx.above200 = price >= sma200;
    movingAverages.ctx.dist200 = dist;
    const smaSignal = dist > 2 ? "bull" : dist < -2 ? "bear" : "neutral";
    addIndicator(movingAverages, {
        name: "SMA 200",
        helpKey: "indicator-sma200",
        desc: "Long-term trend baseline",
        value: (dist >= 0 ? "+" : "") + dist.toFixed(2) + "%",
        signal: smaSignal,
        signalLabel: price >= sma200 ? "Above 200" : "Below 200",
        bar: {
          pct: Math.min(Math.abs(dist) * 5, 100),
          color: dist >= 0 ? "green" : "red",
        },
    });
  }

  if (sma50 != null && sma200 != null) {
    const golden = sma50 >= sma200;
    movingAverages.ctx.golden = golden;
    addIndicator(movingAverages, {
        name: "SMA 50 / 200",
        helpKey: "indicator-golden-cross",
        desc: "Golden cross / death cross",
        value: golden ? "Golden" : "Death",
        signal: golden ? "bull" : "bear",
        signalLabel: golden ? "SMA50 > SMA200" : "SMA50 < SMA200",
    });
  }

  const vwma20 = calcVWMA(closes, volumes, 20);
  if (vwma20 != null) {
    const d = distPct(price, vwma20);
    addIndicator(movingAverages, {
        name: "VWMA (20)",
        helpKey: "indicator-vwma",
        desc: "Volume-weighted moving average",
        value: (d >= 0 ? "+" : "") + d.toFixed(2) + "%",
        signal: d > 0.5 ? "bull" : d < -0.5 ? "bear" : "neutral",
        signalLabel: price >= vwma20 ? "Above VWMA" : "Below VWMA",
        bar: {
          pct: Math.min(Math.abs(d) * 10, 100),
          color: d >= 0 ? "green" : "red",
        },
    });
  }

  const bb = calcBollinger(closes);
  if (bb) {
    const pctB = ((price - bb.lower) / (bb.upper - bb.lower)) * 100;
    const bandwidth = bb.middle ? ((bb.upper - bb.lower) / bb.middle) * 100 : 0;
    volatility.ctx.pctB = pctB;
    volatility.ctx.bbWidth = bandwidth;
    const bbSignal = pctB >= 80 ? "bear" : pctB <= 20 ? "bull" : "neutral";
    const bbLabel =
      pctB >= 100
        ? "Above upper"
        : pctB <= 0
          ? "Below lower"
          : pctB >= 80
            ? "Near upper"
            : pctB <= 20
              ? "Near lower"
              : "Mid-band";
    addIndicator(volatility, {
        name: "Bollinger %B (20, 2)",
        helpKey: "indicator-bb",
        desc: `${indFmtPrice(bb.lower)} – ${indFmtPrice(bb.upper)}`,
        value: pctB.toFixed(0) + "%B",
        signal: bbSignal,
        signalLabel: bbLabel,
        bar: { pct: Math.max(0, Math.min(pctB, 100)), marker: true },
    });

    addIndicator(volatility, {
        name: "Bollinger Width",
        helpKey: "indicator-bb-width",
        desc: "Band compression / expansion",
        value: bandwidth.toFixed(2) + "%",
        signal: bandwidth < 4 ? "neutral" : bandwidth > 8 ? "bear" : "neutral",
        signalLabel:
          bandwidth < 4 ? "Squeeze" : bandwidth > 8 ? "Expanded" : "Normal",
        bar: { pct: Math.min(bandwidth * 10, 100), color: "accent" },
    });
  }

  const atr = calcATR(highs, lows, closes);
  if (atr != null) {
    const atrPct = (atr / price) * 100;
    volatility.ctx.atrPct = atrPct;
    addIndicator(volatility, {
        name: "ATR (14)",
        helpKey: "indicator-atr",
        desc: "Average True Range · volatility",
        value: indFmtPrice(atr),
        signal: atrPct > 2 ? "bear" : "neutral",
        signalLabel: atrPct.toFixed(2) + "% of price",
        bar: { pct: Math.min(atrPct * 25, 100), color: "accent" },
    });
  }

  const keltner = calcKeltner(highs, lows, closes);
  if (keltner) {
    const kPct = ((price - keltner.lower) / (keltner.upper - keltner.lower)) * 100;
    addIndicator(volatility, {
        name: "Keltner Channel",
        helpKey: "indicator-keltner",
        desc: `EMA20 ± 2×ATR10`,
        value: kPct.toFixed(0) + "% pos",
        signal: kPct >= 85 ? "bear" : kPct <= 15 ? "bull" : "neutral",
        signalLabel:
          kPct >= 100 ? "Above upper" : kPct <= 0 ? "Below lower" : "In channel",
        bar: { pct: Math.max(0, Math.min(kPct, 100)), marker: true },
    });
  }

  const donchian = calcDonchian(highs, lows);
  if (donchian) {
    const dPct = ((price - donchian.lower) / (donchian.upper - donchian.lower)) * 100;
    addIndicator(volatility, {
        name: "Donchian (20)",
        helpKey: "indicator-donchian",
        desc: `${indFmtPrice(donchian.lower)} – ${indFmtPrice(donchian.upper)}`,
        value: dPct.toFixed(0) + "%",
        signal: dPct >= 95 ? "bull" : dPct <= 5 ? "bear" : "neutral",
        signalLabel:
          dPct >= 100 ? "At high" : dPct <= 0 ? "At low" : "Mid-range",
        bar: { pct: Math.max(0, Math.min(dPct, 100)), marker: true },
    });
  }

  const obv = calcOBVSeries(closes, volumes);
  if (obv.length >= 14) {
    const slope = obv[obv.length - 1] - obv[obv.length - 14];
    volumeCat.ctx.obvSlope = slope;
    addIndicator(volumeCat, {
        name: "OBV Trend",
        helpKey: "indicator-obv",
        desc: "On-Balance Volume · 14-bar slope",
        value: (slope >= 0 ? "+" : "") + slope.toFixed(0),
        signal: slope > 0 ? "bull" : slope < 0 ? "bear" : "neutral",
        signalLabel: slope > 0 ? "Accumulation" : slope < 0 ? "Distribution" : "Flat",
        bar: {
          pct: Math.min(Math.abs(slope) / 1000, 100),
          color: slope >= 0 ? "green" : "red",
        },
    });
  }

  const cmf = calcCMF(highs, lows, closes, volumes);
  if (cmf !== null) {
    volumeCat.ctx.cmf = cmf;
    addIndicator(volumeCat, {
        name: "CMF (20)",
        helpKey: "indicator-cmf",
        desc: "Chaikin Money Flow",
        value: cmf.toFixed(3),
        signal: cmf > 0.05 ? "bull" : cmf < -0.05 ? "bear" : "neutral",
        signalLabel: cmf > 0 ? "Buying pressure" : cmf < 0 ? "Selling pressure" : "Balanced",
        bar: {
          pct: Math.min(Math.abs(cmf) * 500, 100),
          color: cmf >= 0 ? "green" : "red",
        },
    });
  }

  const volSma = calcSMA(volumes, 20);
  if (volSma != null) {
    const curVol = volumes[volumes.length - 1];
    const ratio = curVol / volSma;
    volumeCat.ctx.volRatio = ratio;
    addIndicator(volumeCat, {
        name: "Volume / SMA(20)",
        helpKey: "indicator-vol-ratio",
        desc: "Current bar vs 20-period average",
        value: ratio.toFixed(2) + "×",
        signal: ratio > 1.5 ? "bull" : ratio < 0.6 ? "bear" : "neutral",
        signalLabel: ratio > 1 ? "Above avg" : "Below avg",
        bar: {
          pct: Math.min(ratio * 50, 100),
          color: ratio >= 1 ? "green" : "red",
        },
    });
  }

  const force = calcForceIndex(closes, volumes);
  if (force != null) {
    addIndicator(volumeCat, {
        name: "Force Index (13)",
        helpKey: "indicator-force",
        desc: "Price change × volume · EMA smoothed",
        value: (force >= 0 ? "+" : "") + force.toFixed(0),
        signal: force > 0 ? "bull" : force < 0 ? "bear" : "neutral",
        signalLabel: force > 0 ? "Buying force" : force < 0 ? "Selling force" : "Flat",
        bar: {
          pct: Math.min(Math.abs(force) / 5000, 100),
          color: force >= 0 ? "green" : "red",
        },
    });
  }

  const categories = {
    momentum,
    trend,
    movingAverages,
    volatility,
    volume: volumeCat,
  };

  const html = [
    renderIndicatorCategory("Momentum", momentum, commentMomentum),
    renderIndicatorCategory("Trend", trend, commentTrend),
    renderIndicatorCategory("Moving Averages", movingAverages, commentMovingAverages),
    renderIndicatorCategory("Volatility", volatility, commentVolatility),
    renderIndicatorCategory("Volume", volumeCat, commentVolume),
  ].join("");

  return { html, categories, price };
}

window.buildIndicators = buildIndicators;
window.buildTechnicalOverview = buildTechnicalOverview;
window.buildIndicatorsOnlyOverview = buildIndicatorsOnlyOverview;