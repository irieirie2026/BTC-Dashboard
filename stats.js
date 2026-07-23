const BINANCE_KLINES = "https://api.binance.com/api/v3/klines";
const STATS_BTC_HISTORY_API = "/api/stats/btc-history";
const STATS_PAIR = "BTC/USD";
const STATS_SOURCE = "Bitstamp + Blockchain.info";
const STATS_INTERVAL = "1d";
const ETH_STATS_LIMIT = 1000;
const CHART_MAX_POINTS = 1500;
const TRADING_DAYS = 252;
const STATS_POLL_MS = 3_600_000;

let statsData = null;
let statsTimer = null;
let statsReady = false;

const stEl = (id) => document.getElementById(id);

function fmtPct(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return prefix + (n * 100).toFixed(d) + "%";
}

function fmtNum(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(d);
}

function fmtPrice(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr, m = mean(arr)) {
  if (arr.length < 2) return 0;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function skewness(arr, m = mean(arr), s = stdDev(arr, m)) {
  if (!s || arr.length < 3) return 0;
  const n = arr.length;
  const sum = arr.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sum;
}

function kurtosis(arr, m = mean(arr), s = stdDev(arr, m)) {
  if (!s || arr.length < 4) return 0;
  const n = arr.length;
  const sum = arr.reduce((acc, x) => acc + ((x - m) / s) ** 4, 0);
  const g2 = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum;
  const corr = (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return g2 - corr;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function maxDrawdown(cumulative) {
  let peak = cumulative[0];
  let maxDd = 0;
  cumulative.forEach((v) => {
    if (v > peak) peak = v;
    const dd = (v - peak) / (1 + peak);
    if (dd < maxDd) maxDd = dd;
  });
  return maxDd;
}

function covariance(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const sliceA = a.slice(-n);
  const sliceB = b.slice(-n);
  const mA = mean(sliceA);
  const mB = mean(sliceB);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (sliceA[i] - mA) * (sliceB[i] - mB);
  return sum / (n - 1);
}

function correlation(a, b) {
  const cov = covariance(a, b);
  const sA = stdDev(a.slice(-Math.min(a.length, b.length)));
  const sB = stdDev(b.slice(-Math.min(a.length, b.length)));
  return sA && sB ? cov / (sA * sB) : null;
}

function beta(assetReturns, benchReturns) {
  const cov = covariance(assetReturns, benchReturns);
  const n = Math.min(assetReturns.length, benchReturns.length);
  const varB = stdDev(benchReturns.slice(-n)) ** 2;
  return varB ? cov / varB : null;
}

function semideviation(returns) {
  if (!returns.length) return 0;
  const sq = returns.reduce((s, r) => s + Math.min(r, 0) ** 2, 0);
  return Math.sqrt(sq / returns.length);
}

function rollingWindow(series, window, dates, mapper) {
  const out = [];
  for (let i = window - 1; i < series.length; i++) {
    const slice = series.slice(i - window + 1, i + 1);
    out.push({ date: dates[i], ...mapper(slice) });
  }
  return out;
}

function downsampleIndices(length, maxPoints = CHART_MAX_POINTS) {
  if (length <= maxPoints) {
    return Array.from({ length }, (_, i) => i);
  }
  const indices = [];
  const last = length - 1;
  const step = last / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    indices.push(i === maxPoints - 1 ? last : Math.round(i * step));
  }
  return [...new Set(indices)];
}

function downsampleSeries(items, maxPoints = CHART_MAX_POINTS) {
  if (!items?.length || items.length <= maxPoints) return items;
  const indices = downsampleIndices(items.length, maxPoints);
  return indices.map((i) => items[i]);
}

function mountStatsChart(canvasId, options) {
  const canvas = stEl(canvasId);
  if (!canvas || !window.ChartInteraction) return null;
  if (!options.getLength?.()) return null;
  return ChartInteraction.ensure(canvas, {
    maxPoints: CHART_MAX_POINTS,
    minWindow: 30,
    ...options,
  });
}

function chartTipTitle(date) {
  return `<div class="chart-tooltip-title">${fmtDate(date)}</div>`;
}

function chartTipRow(label, value) {
  return `<div class="chart-tooltip-row"><span>${label}</span><span class="mono">${value}</span></div>`;
}

// Expose for Stats → Volatility (and other modules that share chart helpers)
window.mountStatsChart = mountStatsChart;
window.chartTipTitle = chartTipTitle;
window.chartTipRow = chartTipRow;

function drawdownSeries(days) {
  let peak = days[0].close;
  return days.slice(1).map((d) => {
    if (d.close > peak) peak = d.close;
    return { date: d.date, dd: (d.close - peak) / peak };
  });
}

function computeVarBlock(returns) {
  const mu = mean(returns);
  const sigma = stdDev(returns);
  const var95 = percentile(returns, 5);
  const var99 = percentile(returns, 1);
  const tail95 = returns.filter((r) => r <= var95);
  const tail99 = returns.filter((r) => r <= var99);
  const cvar95 = tail95.length ? mean(tail95) : var95;
  const cvar99 = tail99.length ? mean(tail99) : var99;
  const param95 = mu - 1.645 * sigma;
  const param99 = mu - 2.326 * sigma;

  const rollingVar95 = rollingWindow(returns, 252, returns.map((_, i) => i), (slice) => ({
    var95: percentile(slice, 5),
  }));

  const breaches = returns
    .map((ret, i) => ({ ret, idx: i }))
    .filter((x) => x.ret < var95)
    .slice(-12)
    .reverse();

  return {
    mu,
    sigma,
    historical: { var95, var99, cvar95, cvar99 },
    parametric: { var95: param95, var99: param99 },
    rollingVar95,
    breaches,
    fullVar95: var95,
  };
}

const MARKOV_STATE_DEFS = [
  { id: 0, label: "Bear", sub: "≤ 33rd pct", color: "#f6465d", dim: "rgba(246, 70, 93, 0.22)" },
  { id: 1, label: "Neutral", sub: "Middle third", color: "#7d8799", dim: "rgba(125, 135, 153, 0.22)" },
  { id: 2, label: "Bull", sub: "> 67th pct", color: "#0ecb81", dim: "rgba(14, 203, 129, 0.22)" },
];

function classifyMarkovState(ret, thresholds) {
  if (ret <= thresholds[0]) return 0;
  if (ret <= thresholds[1]) return 1;
  return 2;
}

function computeSteadyState(transProb) {
  const n = transProb.length;
  let pi = Array(n).fill(1 / n);
  for (let iter = 0; iter < 128; iter++) {
    const next = Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) next[j] += pi[i] * transProb[i][j];
    }
    pi = next;
  }
  return pi;
}

function computeMarkov(returns, dates) {
  const nStates = MARKOV_STATE_DEFS.length;
  const thresholds = [percentile(returns, 100 / 3), percentile(returns, (200 / 3))];
  const states = returns.map((r) => classifyMarkovState(r, thresholds));
  const counts = Array.from({ length: nStates }, () => Array(nStates).fill(0));

  for (let i = 0; i < states.length - 1; i++) {
    counts[states[i]][states[i + 1]] += 1;
  }

  const transProb = counts.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0);
    return sum ? row.map((c) => c / sum) : row.map(() => 1 / nStates);
  });

  const steadyState = computeSteadyState(transProb);
  const currentState = states[states.length - 1];
  let streak = 1;
  for (let i = states.length - 2; i >= 0; i--) {
    if (states[i] === currentState) streak += 1;
    else break;
  }

  const history = states.map((state, i) => ({
    date: dates[i],
    state,
    ret: returns[i],
  }));

  const occupancy = MARKOV_STATE_DEFS.map(
    (_, s) => states.filter((x) => x === s).length / states.length,
  );
  const persistence =
    transProb.reduce((sum, row, i) => sum + row[i], 0) / nStates;

  const expectedDur = transProb.map((row, i) =>
    row[i] < 1 ? 1 / (1 - row[i]) : Infinity,
  );

  return {
    nStates,
    stateDefs: MARKOV_STATE_DEFS,
    thresholds,
    counts,
    transProb,
    steadyState,
    currentState,
    currentLabel: MARKOV_STATE_DEFS[currentState].label,
    streak,
    occupancy,
    persistence,
    expectedDur,
    history,
    lastReturn: returns[returns.length - 1],
    transitions: states.length - 1,
  };
}

const PL_GENESIS_MS = Date.UTC(2009, 0, 3);
const PL_A = Math.pow(10, -16.493);
const PL_N = 5.68;
const PL_BEAR_MULT = 0.4;
const PL_BULL_MULT = 1.5;

const PL_RELATIONS = [
  { link: "Adoption", relation: "Addresses ∝ t³", note: "Curbing mechanisms shift S-curves to power-law adoption" },
  { link: "Metcalfe", relation: "Price ∝ Addresses²", note: "Network value scales with the square of users (~1.95 empirically)" },
  { link: "Mining", relation: "Hash rate ∝ Price²", note: "Difficulty adjustment keeps miners near breakeven" },
  { link: "Consolidated", relation: "Price ∝ t⁶", note: "Santostasi PLT fair-value line used in this dashboard" },
  { link: "Security loop", relation: "Hash rate ∝ t¹²", note: "Higher security attracts users in the feedback cycle" },
];

const PL_HORIZONS = [
  { key: "1y", days: 365, label: "1 year" },
  { key: "5y", days: 365 * 5, label: "5 years" },
  { key: "10y", days: 365 * 10, label: "10 years" },
  { key: "25y", days: 365 * 25, label: "25 years" },
];

const PL_MILESTONES = [100_000, 250_000, 500_000, 1_000_000, 3_000_000, 10_000_000];

function daysSinceGenesis(ts) {
  return Math.max(1, (ts - PL_GENESIS_MS) / 86_400_000);
}

function powerLawFair(days, a = PL_A, n = PL_N) {
  return a * Math.pow(days, n);
}

function powerLawDaysForPrice(price, a = PL_A, n = PL_N) {
  if (price <= 0) return null;
  return Math.pow(price / a, 1 / n);
}

function fmtPriceCompact(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function computePowerLaw(dayRows) {
  const points = dayRows.map((d) => {
    const ds = daysSinceGenesis(d.date);
    const fair = powerLawFair(ds);
    return {
      date: d.date,
      close: d.close,
      days: ds,
      fair,
      support: fair * PL_BEAR_MULT,
      resistance: fair * PL_BULL_MULT,
      ratio: d.close / fair,
      logDays: Math.log10(ds),
      logPrice: Math.log10(d.close),
    };
  });

  const xs = points.map((p) => Math.log(p.days));
  const ys = points.map((p) => Math.log(p.close));
  const meanX = mean(xs);
  const meanY = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < points.length; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const fitN = den ? num / den : PL_N;
  const fitLogA = meanY - fitN * meanX;
  const fitA = Math.exp(fitLogA);
  const ssRes = ys.reduce((s, y, i) => s + (y - (fitLogA + fitN * xs[i])) ** 2, 0);
  const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;

  const ratios = points.map((p) => p.ratio).filter((r) => r > 0 && Number.isFinite(r));
  const supportMult = Math.max(0.25, Math.min(0.55, percentile(ratios, 10)));
  const resistMult = Math.max(1.6, Math.min(4.5, percentile(ratios, 90)));

  points.forEach((p) => {
    p.support = p.fair * supportMult;
    p.resistance = p.fair * resistMult;
  });

  const last = points[points.length - 1];
  const deviationPct = (last.ratio - 1) * 100;
  let bandZone = "Fair-value corridor";
  let bandClass = "";
  if (last.ratio <= supportMult * 1.08) {
    bandZone = "Near support";
    bandClass = "negative";
  } else if (last.ratio >= resistMult * 0.92) {
    bandZone = "Near resistance";
    bandClass = "positive";
  }

  const forecasts = PL_HORIZONS.map((h) => {
    const futureDays = last.days + h.days;
    const fair = powerLawFair(futureDays);
    return {
      ...h,
      date: last.date + h.days * 86_400_000,
      neutral: fair,
      bear: fair * PL_BEAR_MULT,
      bull: fair * PL_BULL_MULT,
    };
  });

  const milestones = PL_MILESTONES.map((price) => {
    const d = powerLawDaysForPrice(price);
    const date = d ? PL_GENESIS_MS + d * 86_400_000 : null;
    return {
      price,
      days: d,
      date,
      reached: last.close >= price,
    };
  });

  return {
    genesisMs: PL_GENESIS_MS,
    constants: { A: PL_A, n: PL_N, formula: "Price = A × (days since Genesis)^n" },
    fit: { A: fitA, n: fitN, r2 },
    supportMult,
    resistMult,
    points,
    last,
    deviationPct,
    bandZone,
    bandClass,
    forecasts,
    milestones,
    relations: PL_RELATIONS,
    sampleDays: points.length,
  };
}

function extendRiskVar(base, ethReturns) {
  const { returns, days } = base;
  const vol30 =
    returns.length >= 30
      ? stdDev(returns.slice(-30)) * Math.sqrt(TRADING_DAYS)
      : base.annStd;
  const vol90 =
    returns.length >= 90
      ? stdDev(returns.slice(-90)) * Math.sqrt(TRADING_DAYS)
      : base.annStd;

  const downDev = semideviation(returns);
  const annDownDev = downDev * Math.sqrt(TRADING_DAYS);
  const sortino = annDownDev ? base.annMean / annDownDev : null;
  const calmar =
    base.maxDrawdown < 0 ? base.annMean / Math.abs(base.maxDrawdown) : null;
  const btcBeta = ethReturns?.length ? beta(returns, ethReturns) : null;
  const btcCorr = ethReturns?.length ? correlation(returns, ethReturns) : null;

  const drawdowns = drawdownSeries(days);
  const rollVol30 = rollingWindow(returns, 30, days.slice(1).map((d) => d.date), (s) => ({
    vol30: stdDev(s) * Math.sqrt(TRADING_DAYS),
  }));
  const rollVol90 = rollingWindow(returns, 90, days.slice(1).map((d) => d.date), (s) => ({
    vol90: stdDev(s) * Math.sqrt(TRADING_DAYS),
  }));
  const rollSharpe90 = rollingWindow(returns, 90, days.slice(1).map((d) => d.date), (s) => {
    const m = mean(s) * TRADING_DAYS;
    const v = stdDev(s) * Math.sqrt(TRADING_DAYS);
    return { sharpe: v ? m / v : 0 };
  });

  const varBlock = computeVarBlock(returns);
  const varDates = days.slice(1).map((d) => d.date);
  const rollingVar95 = rollingWindow(returns, 252, varDates, (s) => ({
    var95: percentile(s, 5),
  }));

  const breachRows = varBlock.breaches.map((b) => ({
    date: days[b.idx + 1]?.date,
    ret: b.ret,
    var95: varBlock.fullVar95,
  }));

  return {
    vol30,
    vol90,
    downDev,
    annDownDev,
    sortino,
    calmar,
    beta: btcBeta,
    corr: btcCorr,
    drawdowns,
    rollVol30,
    rollVol90,
    rollSharpe90,
    var: {
      ...varBlock,
      rollingVar95,
      breachRows,
      usd95: Math.abs(varBlock.historical.var95) * base.lastClose,
      usd99: Math.abs(varBlock.historical.var99) * base.lastClose,
      usdCvar95: Math.abs(varBlock.historical.cvar95) * base.lastClose,
    },
  };
}

function computeStats(days) {
  const closes = days.map((d) => d.close);
  const returns = days.slice(1).map((d, i) => (d.close - closes[i]) / closes[i]);
  const logReturns = days.slice(1).map((d, i) => Math.log(d.close / closes[i]));

  const mu = mean(returns);
  const sigma = stdDev(returns);
  const muLog = mean(logReturns);
  const sigmaLog = stdDev(logReturns);
  const annMu = mu * TRADING_DAYS;
  const annSigma = sigma * Math.sqrt(TRADING_DAYS);
  const sharpe = annSigma ? annMu / annSigma : null;

  const positive = returns.filter((r) => r > 0);
  const negative = returns.filter((r) => r < 0);
  const winRate = returns.length ? positive.length / returns.length : 0;

  const cumulative = [];
  let cum = 0;
  returns.forEach((r) => {
    cum = (1 + cum) * (1 + r) - 1;
    cumulative.push(cum);
  });

  const roll30 = [];
  for (let i = 29; i < returns.length; i++) {
    const slice = returns.slice(i - 29, i + 1);
    roll30.push({
      date: days[i + 1].date,
      vol: stdDev(slice) * Math.sqrt(TRADING_DAYS),
    });
  }

  const histBins = 24;
  const minR = Math.min(...returns);
  const maxR = Math.max(...returns);
  const span = maxR - minR || 0.001;
  const histogram = Array.from({ length: histBins }, (_, i) => ({
    lo: minR + (span * i) / histBins,
    hi: minR + (span * (i + 1)) / histBins,
    count: 0,
  }));
  returns.forEach((r) => {
    const idx = Math.min(histBins - 1, Math.floor(((r - minR) / span) * histBins));
    histogram[idx].count += 1;
  });

  const monthly = {};
  days.slice(1).forEach((d, i) => {
    const dt = new Date(d.date);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthly[key]) monthly[key] = { first: closes[i], last: d.close, days: 0 };
    monthly[key].last = d.close;
    monthly[key].days += 1;
  });
  const monthlyRows = Object.entries(monthly)
    .map(([key, m]) => ({
      key,
      label: new Date(key + "-01").toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      }),
      return: (m.last - m.first) / m.first,
      days: m.days,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const bestIdx = returns.indexOf(Math.max(...returns));
  const worstIdx = returns.indexOf(Math.min(...returns));

  return {
    days,
    returns,
    cumulative,
    roll30,
    histogram,
    monthlyRows,
    count: returns.length,
    startDate: days[1]?.date,
    endDate: days[days.length - 1]?.date,
    lastClose: closes[closes.length - 1],
    mean: mu,
    median: percentile(returns, 50),
    std: sigma,
    annMean: annMu,
    annStd: annSigma,
    logMean: muLog,
    logStd: sigmaLog,
    skew: skewness(returns),
    kurt: kurtosis(returns),
    sharpe,
    winRate,
    avgGain: positive.length ? mean(positive) : 0,
    avgLoss: negative.length ? mean(negative.map(Math.abs)) : 0,
    gainLossRatio:
      negative.length && positive.length
        ? mean(positive) / mean(negative.map(Math.abs))
        : null,
    min: Math.min(...returns),
    max: Math.max(...returns),
    p01: percentile(returns, 1),
    p05: percentile(returns, 5),
    p25: percentile(returns, 25),
    p75: percentile(returns, 75),
    p95: percentile(returns, 95),
    p99: percentile(returns, 99),
    maxDrawdown: maxDrawdown(cumulative),
    totalReturn: cumulative[cumulative.length - 1] ?? 0,
    bestDay: { date: days[bestIdx + 1]?.date, ret: returns[bestIdx] },
    worstDay: { date: days[worstIdx + 1]?.date, ret: returns[worstIdx] },
    recent: days
      .slice(-31)
      .slice(1)
      .map((d, i, arr) => {
        const prev = days[days.length - 31 + i];
        return {
          date: d.date,
          close: d.close,
          ret: (d.close - prev.close) / prev.close,
        };
      })
      .reverse(),
    risk: null,
    var: null,
    markov: null,
    powerlaw: null,
  };
}

function buildCommentary(s) {
  const lines = [];

  lines.push(
    `Over ${s.count} trading days (${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}), ` +
      `${STATS_PAIR} posted a cumulative return of ${fmtPct(s.totalReturn)} from ` +
      `roughly $${fmtPrice(s.days[0]?.close)} to $${fmtPrice(s.lastClose)}.`,
  );

  lines.push(
    `Daily returns average ${fmtPct(s.mean, 3)} (${fmtPct(s.annMean, 1)} annualized) ` +
      `with ${fmtPct(s.std, 2)} daily volatility (${fmtPct(s.annStd, 1)} annualized). ` +
      `The Sharpe ratio (rf=0) is ${fmtNum(s.sharpe, 2)}.`,
  );

  const skewDir =
    s.skew > 0.3
      ? "positively skewed — large up-days occur more often than a normal distribution implies"
      : s.skew < -0.3
        ? "negatively skewed — fat left tail; crash days dominate the distribution"
        : "approximately symmetric";
  lines.push(
    `Distribution shape: ${skewDir} (skew ${fmtNum(s.skew, 2)}, excess kurtosis ${fmtNum(s.kurt, 2)}). ` +
      `Median daily return is ${fmtPct(s.median, 3)} vs mean ${fmtPct(s.mean, 3)}.`,
  );

  lines.push(
    `${(s.winRate * 100).toFixed(1)}% of days closed green. ` +
      `Average up-day: ${fmtPct(s.avgGain, 2)} · average down-day: ${fmtPct(-s.avgLoss, 2)} · ` +
      `gain/loss ratio: ${s.gainLossRatio != null ? fmtNum(s.gainLossRatio, 2) : "—"}. ` +
      `Best: ${fmtPct(s.bestDay.ret)} on ${fmtDate(s.bestDay.date)} · ` +
      `worst: ${fmtPct(s.worstDay.ret)} on ${fmtDate(s.worstDay.date)}.`,
  );

  const roll = s.roll30[s.roll30.length - 1];
  lines.push(
    `Tail risk (1-day): 5th percentile ${fmtPct(s.p05)} · 1st percentile ${fmtPct(s.p01)}. ` +
      `Peak-to-trough drawdown over the sample: ${fmtPct(s.maxDrawdown)}. ` +
      (roll
        ? `30-day realized vol as of ${fmtDate(roll.date)}: ${fmtPct(roll.vol, 1)}.`
        : ""),
  );

  const last3 = s.monthlyRows.slice(-3);
  if (last3.length) {
    lines.push(
      `Recent calendar months: ${last3
        .map((m) => `${m.label} ${fmtPct(m.return)}`)
        .join(" · ")}.`,
    );
  }

  return lines;
}

function buildRiskCommentary(s) {
  const r = s.risk;
  if (!r) return ["Risk metrics unavailable."];
  const lines = [];

  lines.push(
    `Over ${s.count} trading days (${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}), ${STATS_PAIR} ` +
      `returned ${fmtPct(s.totalReturn)} with ${fmtPct(s.annStd, 1)} full-sample realized volatility ` +
      `($${fmtPrice(s.days[0]?.close)} → $${fmtPrice(s.lastClose)}).`,
  );

  const volRegime =
    r.vol30 > r.vol90 * 1.1
      ? "Short-term vol is elevated — recent turbulence exceeds the 90-day baseline."
      : r.vol30 < r.vol90 * 0.9
        ? "Short-term vol has compressed — the market is calmer than its 90-day average."
        : "Short- and medium-term vol are aligned — no major regime shift in the last month.";
  lines.push(
    `Volatility regime: 30-day ${fmtPct(r.vol30, 1)} · 90-day ${fmtPct(r.vol90, 1)} · ` +
      `full sample ${fmtPct(s.annStd, 1)}. ${volRegime} Downside semideviation is ` +
      `${fmtPct(r.annDownDev, 1)} annualized.`,
  );

  lines.push(
    `Risk-adjusted metrics: Sharpe ${fmtNum(s.sharpe, 2)} · Sortino ${fmtNum(r.sortino, 2)} · ` +
      `Calmar ${fmtNum(r.calmar, 2)}. Max drawdown ${fmtPct(s.maxDrawdown)} is the worst ` +
      `peak-to-trough loss over the sample.`,
  );

  const lastRv30 = r.rollVol30[r.rollVol30.length - 1];
  const lastRv90 = r.rollVol90[r.rollVol90.length - 1];
  const lastRs = r.rollSharpe90[r.rollSharpe90.length - 1];
  if (lastRv30 && lastRs) {
    const sharpeNote =
      lastRs.sharpe < 0
        ? "Rolling Sharpe is negative — recent return has not compensated for realized risk."
        : lastRs.sharpe > 1
          ? "Rolling Sharpe above 1 — favorable short-horizon risk/reward."
          : "Rolling Sharpe is modest — returns roughly match risk taken recently.";
    lines.push(
      `Latest rolling readings (${fmtDate(lastRv30.date)}): 30-day vol ${fmtPct(lastRv30.vol30, 1)}, ` +
        `90-day vol ${fmtPct(lastRv90?.vol90, 1)}, 90-day Sharpe ${fmtNum(lastRs.sharpe, 2)}. ${sharpeNote}`,
    );
  }

  if (r.beta != null) {
    lines.push(
      `BTC beta to ETH is ${fmtNum(r.beta, 2)} with correlation ${fmtNum(r.corr, 2)}. ` +
        (r.beta > 1.1
          ? "BTC amplifies ETH moves — higher systematic crypto sensitivity."
          : r.beta < 0.9
            ? "BTC has been less reactive than ETH — relatively defensive within crypto."
            : "BTC and ETH daily moves are broadly aligned in magnitude."),
    );
  }

  const lastDd = r.drawdowns[r.drawdowns.length - 1];
  const minDd = r.drawdowns.reduce(
    (worst, d) => (d.dd < worst.dd ? d : worst),
    r.drawdowns[0],
  );
  if (lastDd) {
    lines.push(
      `Drawdown state: currently ${fmtPct(lastDd.dd)} underwater from peak (${fmtDate(lastDd.date)}). ` +
        `Largest drawdown in sample: ${fmtPct(minDd.dd)} (${fmtDate(minDd.date)}).`,
    );
  }

  const tailNote =
    s.kurt > 1
      ? "Fat tails imply crash risk beyond Gaussian vol estimates."
      : "Tail thickness is moderate relative to a normal benchmark.";
  lines.push(
    `Distribution shape: skew ${fmtNum(s.skew, 2)}, excess kurtosis ${fmtNum(s.kurt, 2)} — ${tailNote} ` +
      `Daily percentiles: 5th ${fmtPct(s.p05)} · 95th ${fmtPct(s.p95)}. ` +
      `Worst day ${fmtPct(s.worstDay.ret)} (${fmtDate(s.worstDay.date)}).`,
  );

  lines.push(
    `${(s.winRate * 100).toFixed(1)}% of days closed positive. Gain/loss ratio ` +
      `${s.gainLossRatio != null ? fmtNum(s.gainLossRatio, 2) : "—"} ` +
      `(avg up-day ${fmtPct(s.avgGain, 2)} vs avg down-day ${fmtPct(-s.avgLoss, 2)}).`,
  );

  if (r.var) {
    lines.push(
      `1-day historical VaR at 95% is ${fmtPct(r.var.historical.var95, 2)}; CVaR ` +
        `${fmtPct(r.var.historical.cvar95, 2)}. Parametric (normal) 95% VaR is ` +
        `${fmtPct(r.var.parametric.var95, 2)} — ` +
        (r.var.parametric.var95 > r.var.historical.var95
          ? "the normal model understates left-tail risk."
          : "historical and parametric estimates are broadly aligned.") +
        ` See the VaR tab for breach history and rolling VaR.`,
    );
  }

  return lines;
}

function buildVarCommentary(s) {
  const v = s.risk?.var;
  if (!v) return ["VaR metrics unavailable."];
  const lines = [];

  lines.push(
    `Historical 1-day VaR at 95% / 99% confidence is ${fmtPct(v.historical.var95, 2)} / ` +
      `${fmtPct(v.historical.var99, 2)}. On a $${fmtPrice(s.lastClose)} BTC price, that implies ` +
      `roughly $${fmtPrice(v.usd95)} / $${fmtPrice(v.usd99)} maximum expected loss per coin (1-day, historical).`,
  );

  lines.push(
    `Expected shortfall (CVaR) at 95% / 99% is ${fmtPct(v.historical.cvar95, 2)} / ` +
      `${fmtPct(v.historical.cvar99, 2)} — the average loss on the worst ${v.historical.var95 < 0 ? "5%" : "tail"} ` +
      `of days, worse than VaR alone suggests.`,
  );

  lines.push(
    `Parametric (normal) VaR: 95% ${fmtPct(v.parametric.var95, 2)} · 99% ${fmtPct(v.parametric.var99, 2)}. ` +
      (v.parametric.var95 > v.historical.var95
        ? "Normal model understates left-tail risk — historical VaR is more conservative."
        : "Historical and parametric VaR are broadly aligned — tail risk near Gaussian assumptions."),
  );

  const breachCount = s.returns.filter((r) => r < v.fullVar95).length;
  const breachPct = ((breachCount / s.returns.length) * 100).toFixed(1);
  lines.push(
    `${breachCount} days (${breachPct}%) breached the full-sample 95% VaR threshold — ` +
      `expect ~5% under a well-calibrated model. ` +
      (parseFloat(breachPct) > 6
        ? "Exceedance rate is elevated; tail events cluster in crypto drawdowns."
        : "Exceedance rate is near the theoretical 5% rate."),
  );

  return lines;
}

async function fetchBtcHistory() {
  const res = await fetch(STATS_BTC_HISTORY_API);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || "BTC history " + res.status);
  }
  if (!payload.days?.length) {
    throw new Error(payload.error || "BTC history returned no daily rows");
  }
  return {
    days: payload.days.map((d) => ({
      date: d.date,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    })),
    meta: {
      pair: payload.pair || STATS_PAIR,
      source: payload.source || STATS_SOURCE,
      count: payload.count,
      startDate: payload.startDate,
      endDate: payload.endDate,
      stale: !!payload.stale,
      warnings: payload.warnings || [],
      interpolatedDays: payload.interpolatedDays || 0,
      fetchedAt: payload.fetchedAt,
    },
  };
}

async function fetchKlines(symbol) {
  const url =
    `${BINANCE_KLINES}?symbol=${symbol}&interval=${STATS_INTERVAL}&limit=${ETH_STATS_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Binance klines " + symbol + " " + res.status);
  const raw = await res.json();
  return raw.map((k) => ({
    date: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

function ethReturns(days) {
  const closes = days.map((d) => d.close);
  return days.slice(1).map((d, i) => (d.close - closes[i]) / closes[i]);
}

function applyStatsBundle(bundle) {
  statsData = bundle;
  renderStatsScreen();
  renderRiskScreen();
  renderVarScreen();
  // GARCH suite lives in stats-volatility.js
  if (typeof window.refreshVolatilityCharts === "function") {
    /* suite auto-loads on show; avoid double fetch on every stats poll */
  }
  renderMarkovScreen();
  renderPowerLawScreen();
}

async function fetchBtcStats() {
  const swr = window.DashboardSWR;
  if (!swr) return;
  const updateEl = stEl("stats-analysis-update");

  try {
    await swr.runSWR({
      key: "stats-btcusd-v2",
      l1: "stats",
      source: STATS_SOURCE,
      persist: false,
      validate: (d) =>
        d?.count > 4000 &&
        d?.pair === STATS_PAIR &&
        (d?.source || "").includes("Bitstamp"),
      fetch: async () => {
        const [btcHistory, ethDays] = await Promise.all([
          fetchBtcHistory(),
          fetchKlines("ETHUSDT").catch(() => null),
        ]);
        const base = computeStats(btcHistory.days);
        const meta = btcHistory.meta;
        base.pair = meta.pair || STATS_PAIR;
        base.source = meta.source || STATS_SOURCE;
        base.historyMeta = meta;
        const ethR = ethDays ? ethReturns(ethDays) : null;
        const extended = extendRiskVar(base, ethR);
        base.risk = extended;
        base.var = extended.var;
        base.markov = computeMarkov(
          base.returns,
          base.days.slice(1).map((d) => d.date),
        );
        base.powerlaw = computePowerLaw(base.days);
        base.fetchedAt = meta.fetchedAt || new Date().toISOString();
        base.stale = meta.stale;
        base.warnings = meta.warnings;
        return base;
      },
      render: (data, opts = {}) => {
        if (opts.loading) {
          if (updateEl) updateEl.textContent = "Loading Bitstamp + Blockchain.info daily history…";
          return;
        }
        applyStatsBundle(data);
        if (updateEl) {
          const warn =
            data.warnings?.length && (opts.refreshFailed || data.stale)
              ? ` · ${data.warnings[0]}`
              : "";
          updateEl.textContent =
            `${data.count} days · ${data.pair || STATS_PAIR} · ${data.source || STATS_SOURCE} · ` +
            swr.formatPanelMeta({
              fetchedAt: data.fetchedAt,
              stale: opts.stale || data.stale,
              refreshing: opts.refreshing,
              refreshFailed: opts.refreshFailed,
            }) +
            warn;
        }
      },
    });
  } catch (err) {
    console.error("BTC stats load failed:", err);
    if (updateEl && !statsData) updateEl.textContent = "Unavailable";
  }
}

function renderStatsScreen() {
  if (!statsData) return;
  const s = statsData;

  const set = (id, text, cls) => {
    const node = stEl(id);
    if (!node) return;
    node.textContent = text;
    if (cls) node.className = cls;
  };

  set("stat-ann-mean", fmtPct(s.annMean, 1));
  set("stat-ann-vol", fmtPct(s.annStd, 1));
  set(
    "stat-sharpe",
    s.sharpe != null ? fmtNum(s.sharpe, 2) : "—",
    "deriv-hero-value " + (s.sharpe >= 0 ? "positive" : "negative"),
  );
  set("stat-skew", fmtNum(s.skew, 2));
  set("stat-win-rate", (s.winRate * 100).toFixed(1) + "%");
  set("stat-total-ret", fmtPct(s.totalReturn), "deriv-hero-value " + (s.totalReturn >= 0 ? "positive" : "negative"));
  set("stat-max-dd", fmtPct(s.maxDrawdown), "deriv-hero-value negative");
  set("stat-sample", s.count + " days");

  const metricsBody = stEl("stats-metrics-body");
  if (metricsBody) {
    const rows = [
      ["Mean (daily)", fmtPct(s.mean, 4)],
      ["Median (daily)", fmtPct(s.median, 4)],
      ["Std deviation (daily)", fmtPct(s.std, 4)],
      ["Annualized mean", fmtPct(s.annMean, 2)],
      ["Annualized volatility", fmtPct(s.annStd, 2)],
      ["Sharpe ratio (rf=0)", fmtNum(s.sharpe, 3)],
      ["Skewness", fmtNum(s.skew, 3)],
      ["Excess kurtosis", fmtNum(s.kurt, 3)],
      ["Win rate", (s.winRate * 100).toFixed(2) + "%"],
      ["Avg gain / avg loss", `${fmtPct(s.avgGain, 2)} / ${fmtPct(-s.avgLoss, 2)}`],
      ["Gain/loss ratio", s.gainLossRatio != null ? fmtNum(s.gainLossRatio, 2) : "—"],
      ["Min daily return", fmtPct(s.min, 2)],
      ["Max daily return", fmtPct(s.max, 2)],
      ["1st percentile", fmtPct(s.p01, 2)],
      ["5th percentile", fmtPct(s.p05, 2)],
      ["95th percentile", fmtPct(s.p95, 2)],
      ["99th percentile", fmtPct(s.p99, 2)],
      ["Max drawdown", fmtPct(s.maxDrawdown, 2)],
      ["Total return (sample)", fmtPct(s.totalReturn, 2)],
      ["Log-return mean", fmtPct(s.logMean, 4)],
      ["Log-return std", fmtPct(s.logStd, 4)],
    ];
    metricsBody.innerHTML = rows
      .map(
        ([label, val]) =>
          `<tr><td>${label}</td><td class="mono">${val}</td></tr>`,
      )
      .join("");
  }

  const recentBody = stEl("stats-recent-body");
  if (recentBody) {
    recentBody.innerHTML = s.recent
      .map((r) => {
        const cls = r.ret >= 0 ? "positive" : "negative";
        return `<tr>
          <td>${fmtDate(r.date)}</td>
          <td class="mono">$${fmtPrice(r.close)}</td>
          <td class="mono ${cls}">${fmtPct(r.ret, 2)}</td>
        </tr>`;
      })
      .join("");
  }

  const monthlyBody = stEl("stats-monthly-body");
  if (monthlyBody) {
    monthlyBody.innerHTML = s.monthlyRows
      .slice(-24)
      .reverse()
      .map((m) => {
        const cls = m.return >= 0 ? "positive" : "negative";
        return `<tr>
          <td>${m.label}</td>
          <td class="mono ${cls}">${fmtPct(m.return, 2)}</td>
          <td class="mono">${m.days}</td>
        </tr>`;
      })
      .join("");
  }

  const commentary = stEl("stats-commentary");
  if (commentary) {
    commentary.innerHTML = buildCommentary(s)
      .map((p) => `<p>${p}</p>`)
      .join("");
  }

  drawCumulativeChart(s);
  drawHistogramChart(s);
  drawRollingVolChart(s);
}

function renderRiskScreen() {
  if (!statsData?.risk) return;
  const s = statsData;
  const r = s.risk;

  const set = (id, text, cls) => {
    const node = stEl(id);
    if (!node) return;
    node.textContent = text;
    if (cls) node.className = cls;
  };

  set("risk-vol-30", fmtPct(r.vol30, 1));
  set(
    "risk-sortino",
    r.sortino != null ? fmtNum(r.sortino, 2) : "—",
    "deriv-hero-value " + (r.sortino >= 0 ? "positive" : "negative"),
  );
  set("risk-beta", r.beta != null ? fmtNum(r.beta, 2) : "—");
  set("risk-max-dd", fmtPct(s.maxDrawdown), "deriv-hero-value negative");
  set(
    "risk-sharpe",
    s.sharpe != null ? fmtNum(s.sharpe, 2) : "—",
    "deriv-hero-value " + (s.sharpe >= 0 ? "positive" : "negative"),
  );
  set("risk-calmar", r.calmar != null ? fmtNum(r.calmar, 2) : "—");
  set("risk-downside", fmtPct(r.annDownDev, 1));
  set("risk-corr", r.corr != null ? fmtNum(r.corr, 2) : "—");

  const updateEl = stEl("risk-update");
  if (updateEl) {
    updateEl.textContent =
      `${s.count} days · ${s.pair || STATS_PAIR} · ${s.source || STATS_SOURCE} · Updated ` +
      new Date().toLocaleTimeString("en-US", { hour12: false });
  }

  const body = stEl("risk-metrics-body");
  if (body) {
    const rows = [
      { label: "30-day volatility (ann.)", key: "risk-vol-30", val: fmtPct(r.vol30, 2) },
      { label: "90-day volatility (ann.)", key: "risk-vol-90", val: fmtPct(r.vol90, 2) },
      { label: "Full-sample volatility (ann.)", key: "stat-ann-vol", val: fmtPct(s.annStd, 2) },
      { label: "Downside semideviation (ann.)", key: "risk-downside", val: fmtPct(r.annDownDev, 2) },
      { label: "Sharpe ratio (rf=0)", key: "stat-sharpe", val: fmtNum(s.sharpe, 3) },
      { label: "Sortino ratio", key: "risk-sortino", val: fmtNum(r.sortino, 3) },
      { label: "Calmar ratio", key: "risk-calmar", val: fmtNum(r.calmar, 3) },
      { label: "Max drawdown", key: "stat-max-dd", val: fmtPct(s.maxDrawdown, 2) },
      { label: "Beta vs ETH/USDT", key: "risk-beta", val: r.beta != null ? fmtNum(r.beta, 3) : "—" },
      { label: "Correlation vs ETH", key: "risk-corr", val: r.corr != null ? fmtNum(r.corr, 3) : "—" },
      { label: "Skewness", key: "stat-skew", val: fmtNum(s.skew, 3) },
      { label: "Excess kurtosis", key: "risk-kurt", val: fmtNum(s.kurt, 3) },
      {
        label: "Gain/loss ratio",
        key: "risk-gain-loss",
        val: s.gainLossRatio != null ? fmtNum(s.gainLossRatio, 2) : "—",
      },
      { label: "Worst single day", key: "risk-worst-day", val: fmtPct(s.worstDay.ret, 2) },
      { label: "95th pct daily gain", key: "risk-p95-gain", val: fmtPct(s.p95, 2) },
      { label: "5th pct daily loss", key: "risk-p05-loss", val: fmtPct(s.p05, 2) },
    ];
    body.innerHTML = rows
      .map(
        (row) =>
          `<tr><td>${labelWithHelp(row.label, row.key)}</td><td class="mono">${row.val}</td></tr>`,
      )
      .join("");
  }

  const riskScreen = document.querySelector('.menu-screen[data-l1="stats"][data-l2="risk"]');
  window.decorateHelpLabels?.(riskScreen || stEl("dashboard-stats"));

  const commentary = stEl("risk-commentary");
  if (commentary) {
    commentary.innerHTML = buildRiskCommentary(s)
      .map((p) => `<p>${p}</p>`)
      .join("");
  }

  drawRiskDrawdownChart(r);
  drawRiskRollingVolChart(r);
  drawRiskRollingSharpeChart(r);
}

function renderVarScreen() {
  if (!statsData?.var) return;
  const s = statsData;
  const v = s.var;

  const set = (id, text, cls) => {
    const node = stEl(id);
    if (!node) return;
    node.textContent = text;
    if (cls) node.className = cls;
  };

  set("var-95", fmtPct(v.historical.var95, 2), "deriv-hero-value negative");
  set("var-99", fmtPct(v.historical.var99, 2), "deriv-hero-value negative");
  set("var-cvar-95", fmtPct(v.historical.cvar95, 2), "deriv-hero-value negative");
  set("var-usd-95", "$" + fmtPrice(v.usd95), "deriv-hero-value negative");
  const usdSub = stEl("var-usd-sub");
  if (usdSub) usdSub.textContent = `Per 1 BTC @ $${fmtPrice(s.lastClose)} · 95%`;

  const updateEl = stEl("var-update");
  if (updateEl) {
    updateEl.textContent =
      `Historical & parametric · ${s.count} days · Updated ` +
      new Date().toLocaleTimeString("en-US", { hour12: false });
  }

  const methodsBody = stEl("var-methods-body");
  if (methodsBody) {
    methodsBody.innerHTML = `<tr>
      <td>Historical</td>
      <td class="mono negative">${fmtPct(v.historical.var95, 2)}</td>
      <td class="mono negative">${fmtPct(v.historical.var99, 2)}</td>
      <td class="mono negative">${fmtPct(v.historical.cvar95, 2)}</td>
      <td class="mono negative">${fmtPct(v.historical.cvar99, 2)}</td>
    </tr>
    <tr>
      <td>Parametric (normal)</td>
      <td class="mono negative">${fmtPct(v.parametric.var95, 2)}</td>
      <td class="mono negative">${fmtPct(v.parametric.var99, 2)}</td>
      <td class="mono">—</td>
      <td class="mono">—</td>
    </tr>`;
  }

  const breachesBody = stEl("var-breaches-body");
  if (breachesBody) {
    breachesBody.innerHTML = (v.breachRows || [])
      .map(
        (row) => `<tr>
          <td>${fmtDate(row.date)}</td>
          <td class="mono negative">${fmtPct(row.ret, 2)}</td>
          <td class="mono">${fmtPct(row.var95, 2)}</td>
        </tr>`,
      )
      .join("") || '<tr><td colspan="3">No breaches in recent tail</td></tr>';
  }

  const commentary = stEl("var-commentary");
  if (commentary) {
    commentary.innerHTML = buildVarCommentary(s)
      .map((p) => `<p>${p}</p>`)
      .join("");
  }

  drawVarHistogramChart(s);
  drawVarRollingChart(v);
}

function buildVolCommentary(s) {
  const r = s.risk;
  if (!r) return ["Volatility metrics unavailable."];
  const v30 = r.vol30;
  const v90 = r.vol90;
  const regime =
    v30 > v90 * 1.15
      ? "elevated relative to the 90-day baseline (short-horizon stress)"
      : v30 < v90 * 0.85
        ? "compressed relative to the 90-day baseline (quiet tape)"
        : "broadly aligned with the 90-day baseline";
  const pct =
    r.rollVol30?.length > 20
      ? (() => {
          const series = r.rollVol30.map((x) => x.vol30);
          const last = series[series.length - 1];
          const below = series.filter((v) => v <= last).length;
          return Math.round((100 * below) / series.length);
        })()
      : null;
  return [
    `Realized volatility (annualized from daily returns): 30-day ${fmtPct(v30, 1)}, 90-day ${fmtPct(v90, 1)}, full sample ${fmtPct(s.annStd, 1)}.`,
    `Short-horizon regime is ${regime}.`,
    pct != null
      ? `Current 30-day vol sits at about the ${pct}th percentile of its own history in this sample — ${
          pct >= 80 ? "a high-vol cluster" : pct <= 20 ? "a low-vol cluster" : "a mid-range print"
        }.`
      : "Percentile context needs a longer rolling series.",
    "Use realized vol as path risk context, not a forecast of the next session. Pair with VaR for tail loss and with Risk for drawdown structure.",
  ];
}

function renderVolatilityScreen() {
  const r = statsData?.risk;
  if (!r) return;
  const s = statsData;

  const set = (id, text, cls) => {
    const node = stEl(id);
    if (!node) return;
    node.textContent = text;
    if (cls) node.className = cls;
  };

  set("vol-realized", fmtPct(r.vol30, 1));
  set("vol-realized-90", fmtPct(r.vol90, 1));

  let pctLabel = "—";
  let regime = "—";
  if (r.rollVol30?.length > 20) {
    const series = r.rollVol30.map((x) => x.vol30);
    const last = series[series.length - 1];
    const below = series.filter((v) => v <= last).length;
    const pct = Math.round((100 * below) / series.length);
    pctLabel = `${pct}th`;
    regime =
      r.vol30 > r.vol90 * 1.15
        ? "Elevated"
        : r.vol30 < r.vol90 * 0.85
          ? "Compressed"
          : "Balanced";
  }
  set("vol-percentile", pctLabel);
  set(
    "vol-regime",
    regime,
    regime === "Elevated"
      ? "deriv-hero-value negative"
      : regime === "Compressed"
        ? "deriv-hero-value positive"
        : "deriv-hero-value",
  );

  const updateEl = stEl("vol-update");
  if (updateEl) {
    updateEl.textContent =
      `30d / 90d realized · ${s.count} days · Updated ` +
      new Date().toLocaleTimeString("en-US", { hour12: false });
  }

  const commentary = stEl("vol-commentary");
  if (commentary) {
    commentary.innerHTML = buildVolCommentary(s)
      .map((p) => `<p>${p}</p>`)
      .join("");
  }

  drawVolRollingChart(r);
  drawVolAbsReturnChart(s);

  const screen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="volatility"]',
  );
  window.decorateHelpLabels?.(screen);
}

function drawVolRollingChart(r) {
  if (!r?.rollVol30?.length) return;
  const n = Math.min(r.rollVol30.length, r.rollVol90?.length || r.rollVol30.length);
  const vol30 = r.rollVol30.slice(-n);
  const vol90 = (r.rollVol90 || []).slice(-n);
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  mountStatsChart("vol-rolling-chart", {
    pad,
    getLength: () => n,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const drawCount = indices.length;
      const slice30 = indices.map((i) => vol30[i]);
      const slice90 = vol90.length
        ? indices.map((i) => vol90[i])
        : null;
      const allV = [
        ...slice30.map((x) => x.vol30),
        ...(slice90 ? slice90.map((x) => x.vol90) : []),
      ];
      const minV = Math.min(...allV) * 0.9;
      const maxV = Math.max(...allV) * 1.1;
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      const drawLine = (data, key, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((pt, i) => {
          const x = api.xAt(i, drawCount);
          const y = yAt(pt[key]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };

      drawLine(slice30, "vol30", "#2dd4bf");
      if (slice90) drawLine(slice90, "vol90", "#38bdf8");

      if (api.hoverGlobal != null) {
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(
          api.xAtGlobal(api.hoverGlobal),
          yAt(vol30[api.hoverGlobal].vol30),
          "#2dd4bf",
        );
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtPct(maxV, 0), api.pad.left - 6, api.pad.top + 10);
      ctx.textAlign = "left";
      ctx.fillStyle = "#2dd4bf";
      ctx.fillText("30d", api.pad.left, api.pad.top + 10);
      if (slice90) {
        ctx.fillStyle = "#38bdf8";
        ctx.fillText("90d", api.pad.left + 32, api.pad.top + 10);
      }
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(vol30[indices[i]]?.date, drawCount > 180),
      );
    },
    formatTooltip(globalIdx) {
      const v30 = vol30[globalIdx];
      const v90 = vol90[globalIdx];
      return (
        chartTipTitle(v30.date) +
        chartTipRow("30d vol", fmtPct(v30.vol30, 1)) +
        (v90 ? chartTipRow("90d vol", fmtPct(v90.vol90, 1)) : "")
      );
    },
  });
}

function drawVolAbsReturnChart(s) {
  if (!s?.returns?.length) return;
  const n = Math.min(s.returns.length, 365);
  const rets = s.returns.slice(-n);
  const dates = s.days.slice(1).slice(-n).map((d) => d.date);
  const abs = rets.map((r) => Math.abs(r));
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  mountStatsChart("vol-abs-return-chart", {
    pad,
    getLength: () => n,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const drawCount = indices.length;
      const maxV = Math.max(...indices.map((i) => abs[i]), 0.001) * 1.1;
      const yAt = (v) => api.pad.top + api.chartH - (v / maxV) * api.chartH;

      ctx.strokeStyle = "rgba(45, 212, 191, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      indices.forEach((gi, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(abs[gi]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null) {
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(
          api.xAtGlobal(api.hoverGlobal),
          yAt(abs[api.hoverGlobal]),
          "#2dd4bf",
        );
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtPct(maxV, 1), api.pad.left - 6, api.pad.top + 10);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(dates[indices[i]], drawCount > 180),
      );
    },
    formatTooltip(globalIdx) {
      return (
        chartTipTitle(dates[globalIdx]) +
        chartTipRow("|return|", fmtPct(abs[globalIdx], 2)) +
        chartTipRow("signed", fmtPct(rets[globalIdx], 2))
      );
    },
  });
}

function buildMarkovCommentary(s) {
  const m = s.markov;
  if (!m) return ["Markov regime data unavailable."];
  const lines = [];
  const cur = m.stateDefs[m.currentState];

  lines.push(
    `${STATS_PAIR} daily returns are classified into ${m.nStates} tercile states ` +
      `(Bear ≤ ${fmtPct(m.thresholds[0], 2)}, Neutral, Bull > ${fmtPct(m.thresholds[1], 2)}) ` +
      `over ${s.count} trading days (${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}). ` +
      `${m.transitions} observed transitions inform the matrix below.`,
  );

  lines.push(
    `Current regime: ${cur.label} (${fmtPct(m.lastReturn, 2)} on the latest day) — ` +
      `${m.streak} consecutive day${m.streak === 1 ? "" : "s"} in this state. ` +
      `Average diagonal persistence is ${(m.persistence * 100).toFixed(1)}%, meaning regimes ` +
      `tend to ${m.persistence > 0.55 ? "cluster rather than flip daily" : "shift frequently"}.`,
  );

  const topSteady = m.steadyState
    .map((p, i) => ({ label: m.stateDefs[i].label, p }))
    .sort((a, b) => b.p - a.p)[0];
  lines.push(
    `Long-run steady-state distribution: ${m.stateDefs
      .map((d, i) => `${d.label} ${(m.steadyState[i] * 100).toFixed(1)}%`)
      .join(" · ")}. ` +
      `${topSteady.label} dominates the ergodic mix (${(topSteady.p * 100).toFixed(1)}%).`,
  );

  const bullOcc = m.occupancy[2];
  const bearOcc = m.occupancy[0];
  const occNote =
    bullOcc > bearOcc + 0.08
      ? "Bull days outnumber bear days in the sample — upward drift in daily classification."
      : bearOcc > bullOcc + 0.08
        ? "Bear days dominate — the sample skews toward weak daily closes."
        : "Bear and bull occupancy are balanced — no strong directional bias in daily regimes.";
  lines.push(
    `Historical occupancy: Bear ${(bearOcc * 100).toFixed(1)}% · Neutral ` +
      `${(m.occupancy[1] * 100).toFixed(1)}% · Bull ${(bullOcc * 100).toFixed(1)}%. ${occNote}`,
  );

  const bestExit = m.transProb
    .map((row, i) => ({
      from: m.stateDefs[i].label,
      to: m.stateDefs[row.indexOf(Math.max(...row))].label,
      p: Math.max(...row),
    }))
    .sort((a, b) => b.p - a.p)[0];
  lines.push(
    `Strongest single-step transition: ${bestExit.from} → ${bestExit.to} ` +
      `(${(bestExit.p * 100).toFixed(1)}%). Expected duration in current ${cur.label} state ` +
      `is ~${Number.isFinite(m.expectedDur[m.currentState]) ? fmtNum(m.expectedDur[m.currentState], 1) : "∞"} days ` +
      `if the estimated chain persists.`,
  );

  return lines;
}

function markovCellBg(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderMarkovMatrix(m) {
  const head = stEl("markov-matrix-head");
  const body = stEl("markov-matrix-body");
  if (!head || !body) return;

  head.innerHTML =
    `<th>From \\ To</th>` +
    m.stateDefs.map((d) => `<th>${d.label}</th>`).join("");

  body.innerHTML = m.transProb
    .map((row, i) => {
      const from = m.stateDefs[i];
      return `<tr>
        <td class="markov-matrix-from" style="color:${from.color}">${from.label}</td>
        ${row
          .map((p, j) => {
            const alpha = 0.1 + p * 0.75;
            const diag = i === j ? " markov-matrix-diag" : "";
            return `<td class="mono markov-matrix-cell${diag}" style="background:${markovCellBg(m.stateDefs[j].color, alpha)}">${(p * 100).toFixed(1)}%</td>`;
          })
          .join("")}
      </tr>`;
    })
    .join("");
}

function drawMarkovRegimeChart(m) {
  const pad = { top: 14, right: 16, bottom: 32, left: 12 };
  mountStatsChart("markov-regime-chart", {
    pad,
    getLength: () => m.history.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const bandH = api.chartH / m.nStates;
      const indices = api.indices;
      const drawCount = indices.length;

      indices.forEach((globalIdx, i) => {
        const pt = m.history[globalIdx];
        const x = api.xAt(i, drawCount);
        const barW = Math.max(api.chartW / drawCount, 1.5);
        const y = api.pad.top + pt.state * bandH;
        ctx.fillStyle = m.stateDefs[pt.state].dim;
        ctx.fillRect(x, y, barW, bandH - 1);
      });

      const lastGlobal = m.history.length - 1;
      const lx = api.xAtGlobal(lastGlobal);
      ctx.strokeStyle = "rgba(240, 185, 11, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(lx, api.pad.top);
      ctx.lineTo(lx, h - api.pad.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      if (api.hoverGlobal != null) {
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
      }

      ctx.font = "10px IBM Plex Mono, monospace";
      m.stateDefs.forEach((d, i) => {
        ctx.fillStyle = d.color;
        ctx.textAlign = "left";
        ctx.fillText(d.label, api.pad.left + 2, api.pad.top + i * bandH + bandH / 2 + 3);
      });

      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(m.history[indices[i]]?.date, drawCount > 120),
      );
    },
    formatTooltip(globalIdx) {
      const pt = m.history[globalIdx];
      const def = m.stateDefs[pt.state];
      return (
        chartTipTitle(pt.date) +
        chartTipRow("Regime", def.label) +
        chartTipRow("Return", fmtPct(pt.ret, 2))
      );
    },
  });
}

function buildPowerLawCommentary(s) {
  const pl = s.powerlaw;
  if (!pl) return ["Power Law data unavailable."];
  const lines = [];
  const dev = pl.deviationPct;
  const devWord =
    Math.abs(dev) < 8
      ? "roughly aligned with"
      : dev > 0
        ? "trading above"
        : "trading below";

  lines.push(
    `Giovanni Santostasi's Bitcoin Power Law Theory (PLT) models long-run price as ` +
      `A × (days since the Jan 3, 2009 Genesis Block)^n with A ≈ 10⁻¹⁶·⁴⁹³ and n ≈ 5.68 ` +
      `(source: bitcoinpower.law). Over ${pl.sampleDays} daily closes (${fmtDate(s.startDate)} → ` +
      `${fmtDate(s.endDate)}), log–log regression R² is ${(pl.fit.r2 * 100).toFixed(2)}%.`,
  );

  lines.push(
    `Spot $${fmtPrice(pl.last.close)} is ${devWord} the fair-value line at ` +
      `${fmtPriceCompact(pl.last.fair)} (${dev >= 0 ? "+" : ""}${dev.toFixed(1)}% deviation). ` +
      `Empirical support/resistance multipliers: ${pl.supportMult.toFixed(2)}× fair ` +
      `(${fmtPriceCompact(pl.last.support)}) · ${pl.resistMult.toFixed(2)}× fair ` +
      `(${fmtPriceCompact(pl.last.resistance)}). Current read: ${pl.bandZone}.`,
  );

  lines.push(
    `PLT treats Bitcoin as a scale-invariant system: price, hash rate, and adoption interlock ` +
      `through feedback loops (users → price → mining → security → users). Bubbles punctuate ` +
      `the trend but historically revert toward the power-law corridor — not exponential forever.`,
  );

  const next = pl.forecasts[0];
  if (next) {
    lines.push(
      `Neutral 1-year fair value: ${fmtPriceCompact(next.neutral)} (${fmtDate(next.date)}). ` +
        `Scenario band: bear ${fmtPriceCompact(next.bear)} (−60%) · bull ${fmtPriceCompact(next.bull)} (+50%), ` +
        `matching bitcoinpower.law calculator assumptions.`,
    );
  }

  const pending = pl.milestones.filter((m) => !m.reached).slice(0, 2);
  if (pending.length) {
    lines.push(
      `Next model milestones: ${pending
        .map((m) => `${fmtPriceCompact(m.price)} ~${fmtDate(m.date)}`)
        .join(" · ")}. Past performance of the curve is not a guarantee.`,
    );
  }

  return lines;
}

function drawPowerLawBandChart(pl) {
  const pad = { top: 18, right: 20, bottom: 36, left: 62 };
  mountStatsChart("pl-band-chart", {
    pad,
    getLength: () => pl.points.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const pts = indices.map((i) => pl.points[i]);
      const drawCount = pts.length;
      const yMax = Math.max(...pts.map((p) => Math.max(p.close, p.resistance)));
      const yMin = Math.min(...pts.map((p) => Math.min(p.close, p.support)));
      const ySpan = Math.log10(yMax) - Math.log10(Math.max(yMin, 1));
      const yMap = (v) =>
        api.pad.top +
        api.chartH -
        ((Math.log10(v) - Math.log10(yMin)) / ySpan) * api.chartH;

      ctx.fillStyle = "rgba(56, 189, 248, 0.08)";
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = api.xAt(i, drawCount);
        const y = yMap(p.resistance);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (let i = pts.length - 1; i >= 0; i--) {
        ctx.lineTo(api.xAt(i, drawCount), yMap(pts[i].support));
      }
      ctx.closePath();
      ctx.fill();

      const drawLine = (key, color, width = 1.5) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        pts.forEach((p, i) => {
          const x = api.xAt(i, drawCount);
          const y = yMap(p[key]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };

      drawLine("support", "rgba(14, 203, 129, 0.65)", 1);
      drawLine("fair", "rgba(240, 185, 11, 0.9)", 2);
      drawLine("resistance", "rgba(246, 70, 93, 0.65)", 1);

      ctx.strokeStyle = "#e8eaed";
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = api.xAt(i, drawCount);
        const y = yMap(p.close);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null) {
        const p = pl.points[api.hoverGlobal];
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yMap(p.close));
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtPriceCompact(yMax), api.pad.left - 6, api.pad.top + 10);
      ctx.fillText(fmtPriceCompact(yMin), api.pad.left - 6, h - api.pad.bottom);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(pts[i]?.date, drawCount > 120),
      );
    },
    formatTooltip(globalIdx) {
      const p = pl.points[globalIdx];
      return (
        chartTipTitle(p.date) +
        chartTipRow("Close", "$" + fmtPrice(p.close)) +
        chartTipRow("Fair", fmtPriceCompact(p.fair)) +
        chartTipRow("Support", fmtPriceCompact(p.support)) +
        chartTipRow("Resistance", fmtPriceCompact(p.resistance))
      );
    },
  });
}

function drawPowerLawLogChart(pl) {
  const pad = { top: 18, right: 20, bottom: 40, left: 52 };
  mountStatsChart("pl-log-chart", {
    pad,
    getLength: () => pl.points.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const pts = indices.map((i) => pl.points[i]);
      const xMin = Math.min(...pts.map((p) => p.logDays));
      const xMax = Math.max(...pts.map((p) => p.logDays));
      const yMin = Math.min(...pts.map((p) => p.logPrice));
      const yMax = Math.max(...pts.map((p) => p.logPrice));
      const xSpan = xMax - xMin || 1;
      const ySpan = yMax - yMin || 1;
      const xMap = (v) => api.pad.left + ((v - xMin) / xSpan) * api.chartW;
      const yMap = (v) => api.pad.top + api.chartH - ((v - yMin) / ySpan) * api.chartH;

      ctx.strokeStyle = "rgba(240, 185, 11, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = xMap(p.logDays);
        const y = yMap(Math.log10(p.fair));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      pts.forEach((p, i) => {
        const x = xMap(p.logDays);
        const y = yMap(p.logPrice);
        const isLast = indices[i] === pl.points.length - 1;
        ctx.fillStyle = isLast ? "#f0b90b" : "rgba(56, 189, 248, 0.55)";
        ctx.beginPath();
        ctx.arc(x, y, isLast ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fill();
      });

      if (api.hoverGlobal != null) {
        const p = pl.points[api.hoverGlobal];
        api.drawDot(xMap(p.logDays), yMap(p.logPrice), "#f0b90b");
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("log₁₀(days since Genesis)", api.pad.left + api.chartW / 2, h - 8);
      ctx.save();
      ctx.translate(12, api.pad.top + api.chartH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("log₁₀(price)", 0, 0);
      ctx.restore();
    },
    formatTooltip(globalIdx) {
      const p = pl.points[globalIdx];
      return (
        chartTipTitle(p.date) +
        chartTipRow("log₁₀(days)", p.logDays.toFixed(2)) +
        chartTipRow("log₁₀(price)", p.logPrice.toFixed(2)) +
        chartTipRow("Fair line", fmtPriceCompact(p.fair))
      );
    },
  });
}

function drawPowerLawRatioChart(pl) {
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  mountStatsChart("pl-ratio-chart", {
    pad,
    getLength: () => pl.points.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const pts = indices.map((i) => pl.points[i]);
      const drawCount = pts.length;
      const ratios = pts.map((p) => p.ratio);
      const yMax = Math.max(...ratios, pl.resistMult * 1.05, 1.2);
      const yMin = Math.min(...ratios, pl.supportMult * 0.95, 0.8);
      const ySpan = yMax - yMin || 0.1;
      const yMap = (v) => api.pad.top + api.chartH - ((v - yMin) / ySpan) * api.chartH;

      ctx.fillStyle = "rgba(14, 203, 129, 0.06)";
      ctx.fillRect(
        api.pad.left,
        yMap(pl.resistMult),
        api.chartW,
        yMap(pl.supportMult) - yMap(pl.resistMult),
      );

      [pl.supportMult, 1, pl.resistMult].forEach((lvl, idx) => {
        const y = yMap(lvl);
        ctx.strokeStyle =
          idx === 1 ? "rgba(240, 185, 11, 0.75)" : "rgba(125, 135, 153, 0.45)";
        ctx.setLineDash(idx === 1 ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(api.pad.left, y);
        ctx.lineTo(api.pad.left + api.chartW, y);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = api.xAt(i, drawCount);
        const y = yMap(p.ratio);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null) {
        const p = pl.points[api.hoverGlobal];
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yMap(p.ratio));
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(yMax.toFixed(2) + "×", api.pad.left - 6, api.pad.top + 10);
      ctx.fillText(yMin.toFixed(2) + "×", api.pad.left - 6, h - api.pad.bottom);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(pts[i]?.date, drawCount > 120),
      );
    },
    formatTooltip(globalIdx) {
      const p = pl.points[globalIdx];
      return (
        chartTipTitle(p.date) +
        chartTipRow("Price / Fair", p.ratio.toFixed(2) + "×") +
        chartTipRow("Close", "$" + fmtPrice(p.close))
      );
    },
  });
}

function renderPowerLawScreen() {
  if (!statsData?.powerlaw) return;
  const s = statsData;
  const pl = s.powerlaw;

  const set = (id, text, cls) => {
    const node = stEl(id);
    if (!node) return;
    node.textContent = text;
    if (cls) node.className = cls;
  };

  set("pl-spot", "$" + fmtPrice(pl.last.close), "deriv-hero-value");
  set("pl-fair", fmtPriceCompact(pl.last.fair), "deriv-hero-value");
  const devPrefix = pl.deviationPct >= 0 ? "+" : "";
  set(
    "pl-deviation",
    devPrefix + pl.deviationPct.toFixed(1) + "%",
    "deriv-hero-value " + (pl.deviationPct >= 0 ? "positive" : "negative"),
  );
  set("pl-band-zone", pl.bandZone, "deriv-hero-value " + pl.bandClass);

  const updateEl = stEl("pl-update");
  if (updateEl) {
    updateEl.textContent =
      `Santostasi PLT · R² ${(pl.fit.r2 * 100).toFixed(1)}% · Updated ` +
      new Date().toLocaleTimeString("en-US", { hour12: false });
  }

  const paramsBody = stEl("pl-params-body");
  if (paramsBody) {
    paramsBody.innerHTML = `
      <tr><td>Genesis Block</td><td class="mono">2009-01-03</td></tr>
      <tr><td>Days since Genesis</td><td class="mono">${Math.round(pl.last.days).toLocaleString()}</td></tr>
      <tr><td>Constant A</td><td class="mono">10⁻¹⁶·⁴⁹³ (${pl.constants.A.toExponential(3)})</td></tr>
      <tr><td>Exponent n</td><td class="mono">${pl.constants.n}</td></tr>
      <tr><td>Empirical fit n</td><td class="mono">${pl.fit.n.toFixed(3)}</td></tr>
      <tr><td>Log–log R²</td><td class="mono">${(pl.fit.r2 * 100).toFixed(2)}%</td></tr>
      <tr><td>Support multiplier</td><td class="mono">${pl.supportMult.toFixed(2)}× fair</td></tr>
      <tr><td>Resistance multiplier</td><td class="mono">${pl.resistMult.toFixed(2)}× fair</td></tr>`;
  }

  const relBody = stEl("pl-relations-body");
  if (relBody) {
    relBody.innerHTML = pl.relations
      .map(
        (r) => `<tr>
          <td>${r.link}</td>
          <td class="mono">${r.relation}</td>
          <td>${r.note}</td>
        </tr>`,
      )
      .join("");
  }

  const forecastBody = stEl("pl-forecast-body");
  if (forecastBody) {
    forecastBody.innerHTML = pl.forecasts
      .map(
        (f) => `<tr>
          <td>${f.label}</td>
          <td class="mono">${fmtDate(f.date)}</td>
          <td class="mono">${fmtPriceCompact(f.bear)}</td>
          <td class="mono">${fmtPriceCompact(f.neutral)}</td>
          <td class="mono">${fmtPriceCompact(f.bull)}</td>
        </tr>`,
      )
      .join("");
  }

  const milestoneBody = stEl("pl-milestone-body");
  if (milestoneBody) {
    milestoneBody.innerHTML = pl.milestones
      .map((m) => {
        const status = m.reached
          ? '<span class="positive">Reached</span>'
          : m.date
            ? fmtDate(m.date)
            : "—";
        return `<tr>
          <td class="mono">${fmtPriceCompact(m.price)}</td>
          <td class="mono">${m.days ? Math.round(m.days).toLocaleString() : "—"}</td>
          <td class="mono">${status}</td>
        </tr>`;
      })
      .join("");
  }

  const commentary = stEl("pl-commentary");
  if (commentary) {
    commentary.innerHTML = buildPowerLawCommentary(s)
      .map((p) => `<p>${p}</p>`)
      .join("");
  }

  const screen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="valuation"][data-l3="powerlaw"]',
  );
  window.decorateHelpLabels?.(screen);

  drawPowerLawBandChart(pl);
  drawPowerLawLogChart(pl);
  drawPowerLawRatioChart(pl);
}

function renderMarkovScreen() {
  if (!statsData?.markov) return;
  const s = statsData;
  const m = s.markov;

  const set = (id, text, cls) => {
    const node = stEl(id);
    if (!node) return;
    node.textContent = text;
    if (cls) node.className = cls;
  };

  set("markov-current", m.currentLabel, `deriv-hero-value markov-hero--${m.currentState}`);
  set("markov-streak", String(m.streak), "deriv-hero-value");
  set("markov-persistence", (m.persistence * 100).toFixed(1) + "%", "deriv-hero-value");
  set(
    "markov-steady-bull",
    (m.steadyState[2] * 100).toFixed(1) + "%",
    "deriv-hero-value positive",
  );

  const updateEl = stEl("markov-update");
  if (updateEl) {
    updateEl.textContent =
      `Tercile states · ${m.history.length}d history · Updated ` +
      new Date().toLocaleTimeString("en-US", { hour12: false });
  }

  const occBody = stEl("markov-occupancy-body");
  if (occBody) {
    occBody.innerHTML = m.stateDefs
      .map((d, i) => {
        const exp =
          Number.isFinite(m.expectedDur[i]) && m.expectedDur[i] < 100
            ? fmtNum(m.expectedDur[i], 1) + "d"
            : "—";
        return `<tr>
          <td style="color:${d.color}">${d.label}</td>
          <td class="mono">${(m.occupancy[i] * 100).toFixed(1)}%</td>
          <td class="mono">${(m.transProb[i][i] * 100).toFixed(1)}%</td>
          <td class="mono">${exp}</td>
        </tr>`;
      })
      .join("");
  }

  renderMarkovMatrix(m);

  const commentary = stEl("markov-commentary");
  if (commentary) {
    commentary.innerHTML = buildMarkovCommentary(s)
      .map((p) => `<p>${p}</p>`)
      .join("");
  }

  const markovScreen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="valuation"][data-l3="markov"]',
  );
  window.decorateHelpLabels?.(markovScreen);

  drawMarkovRegimeChart(m);
}

function drawRiskDrawdownChart(r) {
  const pad = { top: 18, right: 20, bottom: 36, left: 56 };
  mountStatsChart("risk-drawdown-chart", {
    pad,
    getLength: () => r.drawdowns.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const vals = indices.map((i) => r.drawdowns[i].dd);
      const drawCount = vals.length;
      const minV = Math.min(...vals, 0);
      const maxV = 0;
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      ctx.fillStyle = "rgba(246, 70, 93, 0.25)";
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, api.pad.top + api.chartH);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(api.pad.left + api.chartW, api.pad.top + api.chartH);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#f6465d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null) {
        const v = r.drawdowns[api.hoverGlobal].dd;
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yAt(v), "#f6465d");
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText("0%", api.pad.left - 6, api.pad.top + 10);
      ctx.fillText(fmtPct(minV, 0), api.pad.left - 6, h - api.pad.bottom);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(r.drawdowns[indices[i]].date, drawCount > 180),
      );
    },
    formatTooltip(globalIdx) {
      const pt = r.drawdowns[globalIdx];
      return chartTipTitle(pt.date) + chartTipRow("Drawdown", fmtPct(pt.dd, 2));
    },
  });
}

function drawRiskRollingVolChart(r) {
  const n = Math.min(r.rollVol30.length, r.rollVol90.length);
  const vol30 = r.rollVol30.slice(-n);
  const vol90 = r.rollVol90.slice(-n);
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  mountStatsChart("risk-rolling-vol-chart", {
    pad,
    getLength: () => n,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const drawCount = indices.length;
      const slice30 = indices.map((i) => vol30[i]);
      const slice90 = indices.map((i) => vol90[i]);
      const allV = [
        ...slice30.map((x) => x.vol30),
        ...slice90.map((x) => x.vol90),
      ];
      const minV = Math.min(...allV) * 0.9;
      const maxV = Math.max(...allV) * 1.1;
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      const drawLine = (data, key, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((pt, i) => {
          const x = api.xAt(i, drawCount);
          const y = yAt(pt[key]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };

      drawLine(slice30, "vol30", "#0ea5e9");
      drawLine(slice90, "vol90", "#a78bfa");

      if (api.hoverGlobal != null) {
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(
          api.xAtGlobal(api.hoverGlobal),
          yAt(vol30[api.hoverGlobal].vol30),
          "#0ea5e9",
        );
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtPct(maxV, 0), api.pad.left - 6, api.pad.top + 10);
      ctx.textAlign = "left";
      ctx.fillText("30d", api.pad.left, api.pad.top + 10);
      ctx.fillText("90d", api.pad.left + 28, api.pad.top + 10);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(vol30[indices[i]]?.date, drawCount > 180),
      );
    },
    formatTooltip(globalIdx) {
      const v30 = vol30[globalIdx];
      const v90 = vol90[globalIdx];
      return (
        chartTipTitle(v30.date) +
        chartTipRow("30d vol", fmtPct(v30.vol30, 1)) +
        chartTipRow("90d vol", fmtPct(v90.vol90, 1))
      );
    },
  });
}

function drawRiskRollingSharpeChart(r) {
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  mountStatsChart("risk-rolling-sharpe-chart", {
    pad,
    getLength: () => r.rollSharpe90.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const drawCount = indices.length;
      const vals = indices.map((i) => r.rollSharpe90[i].sharpe);
      const minV = Math.min(...vals, 0);
      const maxV = Math.max(...vals, 0);
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;
      const zeroY = yAt(0);

      ctx.strokeStyle = "rgba(125, 135, 153, 0.35)";
      ctx.beginPath();
      ctx.moveTo(api.pad.left, zeroY);
      ctx.lineTo(w - api.pad.right, zeroY);
      ctx.stroke();

      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null) {
        const v = r.rollSharpe90[api.hoverGlobal].sharpe;
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yAt(v));
      }

      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(r.rollSharpe90[indices[i]].date, drawCount > 180),
      );
    },
    formatTooltip(globalIdx) {
      const pt = r.rollSharpe90[globalIdx];
      return chartTipTitle(pt.date) + chartTipRow("90d Sharpe", fmtNum(pt.sharpe, 2));
    },
  });
}

function drawVarHistogramChart(s) {
  const pad = { top: 22, right: 12, bottom: 40, left: 44 };
  mountStatsChart("var-histogram-chart", {
    pad,
    zoom: false,
    getLength: () => s.histogram.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const hist = s.histogram;
      const maxCount = Math.max(...hist.map((b) => b.count), 1);
      const barW = api.chartW / hist.length;
      const v = s.var;

      hist.forEach((b, i) => {
        const barH = (b.count / maxCount) * api.chartH;
        const x = api.pad.left + i * barW + 1;
        const y = api.pad.top + api.chartH - barH;
        const mid = (b.lo + b.hi) / 2;
        ctx.fillStyle = mid >= 0 ? "rgba(14, 203, 129, 0.7)" : "rgba(246, 70, 93, 0.7)";
        ctx.fillRect(x, y, Math.max(barW - 2, 2), barH);
      });

      if (v) {
        const minR = hist[0].lo;
        const maxR = hist[hist.length - 1].hi;
        const span = maxR - minR || 0.001;
        const mark = (pct, color, label) => {
          const x = api.pad.left + ((pct - minR) / span) * api.chartW;
          ctx.strokeStyle = color;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, api.pad.top);
          ctx.lineTo(x, h - api.pad.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = color;
          ctx.font = "9px IBM Plex Mono, monospace";
          ctx.textAlign = "center";
          ctx.fillText(label, x, api.pad.top + 10);
        };
        mark(v.historical.var95, "rgba(34, 211, 238, 0.9)", "95%");
        mark(v.historical.var99, "rgba(167, 139, 250, 0.9)", "99%");
      }

      if (api.hoverGlobal != null) {
        const b = hist[api.hoverGlobal];
        const x = api.pad.left + api.hoverGlobal * barW + barW / 2;
        api.drawCrosshair(x);
      }

      const minR = hist[0].lo;
      const maxR = hist[hist.length - 1].hi;
      drawReturnAxisLabels(ctx, w, h, api.pad, minR, maxR, (val) => fmtPct(val, 1), {
        ticks: 7,
        y: h - 6,
      });
      ctx.fillStyle = "#7d8799";
      ctx.font = "9px IBM Plex Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Daily return", w / 2, h - 22);
    },
    formatTooltip(globalIdx) {
      const b = s.histogram[globalIdx];
      return (
        `<div class="chart-tooltip-title">${fmtPct(b.lo, 2)} → ${fmtPct(b.hi, 2)}</div>` +
        chartTipRow("Days in bin", String(b.count))
      );
    },
  });
}

function drawVarRollingChart(v) {
  const pad = { top: 18, right: 12, bottom: 40, left: 48 };
  mountStatsChart("var-rolling-chart", {
    pad,
    getLength: () => v.rollingVar95.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const drawCount = indices.length;
      const vals = indices.map((i) => v.rollingVar95[i].var95);
      const minV = Math.min(...vals);
      const maxV = Math.max(...vals, 0);
      const range = maxV - minV || 0.01;
      const yAt = (val) => api.pad.top + api.chartH - ((val - minV) / range) * api.chartH;

      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2;
      ctx.beginPath();
      vals.forEach((val, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(val);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null) {
        const val = v.rollingVar95[api.hoverGlobal].var95;
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yAt(val), "#22d3ee");
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtPct(maxV, 1), api.pad.left - 6, api.pad.top + 10);
      ctx.fillText(fmtPct(minV, 1), api.pad.left - 6, h - api.pad.bottom);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(v.rollingVar95[indices[i]].date, drawCount > 180),
      );
    },
    formatTooltip(globalIdx) {
      const pt = v.rollingVar95[globalIdx];
      return chartTipTitle(pt.date) + chartTipRow("Rolling 95% VaR", fmtPct(pt.var95, 2));
    },
  });
}

function drawCumulativeChart(s) {
  const pad = { top: 18, right: 20, bottom: 36, left: 56 };
  mountStatsChart("stats-cumulative-chart", {
    pad,
    getLength: () => s.cumulative.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const vals = indices.map((i) => s.cumulative[i]);
      const drawCount = vals.length;
      const minV = Math.min(...vals, 0);
      const maxV = Math.max(...vals, 0);
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;
      const zeroY = yAt(0);

      ctx.strokeStyle = "rgba(125, 135, 153, 0.35)";
      ctx.beginPath();
      ctx.moveTo(api.pad.left, zeroY);
      ctx.lineTo(w - api.pad.right, zeroY);
      ctx.stroke();

      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null) {
        const v = s.cumulative[api.hoverGlobal];
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yAt(v));
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtPct(maxV, 0), api.pad.left - 6, api.pad.top + 10);
      ctx.fillText(fmtPct(minV, 0), api.pad.left - 6, h - api.pad.bottom);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(s.days[indices[i] + 1]?.date, drawCount > 180),
      );
    },
    formatTooltip(globalIdx) {
      const date = s.days[globalIdx + 1]?.date;
      const close = s.days[globalIdx + 1]?.close;
      return (
        chartTipTitle(date) +
        chartTipRow("Cumulative", fmtPct(s.cumulative[globalIdx])) +
        chartTipRow("Close", "$" + fmtPrice(close))
      );
    },
  });
}

function drawHistogramChart(s) {
  const pad = { top: 18, right: 16, bottom: 36, left: 48 };
  mountStatsChart("stats-histogram-chart", {
    pad,
    zoom: false,
    getLength: () => s.histogram.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const hist = s.histogram;
      const maxCount = Math.max(...hist.map((b) => b.count), 1);
      const barW = api.chartW / hist.length;

      hist.forEach((b, i) => {
        const barH = (b.count / maxCount) * api.chartH;
        const x = api.pad.left + i * barW + 1;
        const y = api.pad.top + api.chartH - barH;
        const mid = (b.lo + b.hi) / 2;
        ctx.fillStyle = mid >= 0 ? "rgba(14, 203, 129, 0.7)" : "rgba(246, 70, 93, 0.7)";
        ctx.fillRect(x, y, Math.max(barW - 2, 2), barH);
      });

      const zeroIdx = hist.findIndex((b) => b.lo <= 0 && b.hi >= 0);
      if (zeroIdx >= 0) {
        const zx = api.pad.left + zeroIdx * barW + barW / 2;
        ctx.strokeStyle = "rgba(240, 185, 11, 0.6)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(zx, api.pad.top);
        ctx.lineTo(zx, h - api.pad.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (api.hoverGlobal != null) {
        const barW2 = api.chartW / hist.length;
        api.drawCrosshair(api.pad.left + api.hoverGlobal * barW2 + barW2 / 2);
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(fmtPct(hist[0].lo, 1), api.pad.left, h - 8);
      ctx.fillText(fmtPct(hist[hist.length - 1].hi, 1), w - api.pad.right, h - 8);
    },
    formatTooltip(globalIdx) {
      const b = s.histogram[globalIdx];
      return (
        `<div class="chart-tooltip-title">${fmtPct(b.lo, 2)} → ${fmtPct(b.hi, 2)}</div>` +
        chartTipRow("Days", String(b.count))
      );
    },
  });
}

function drawRollingVolChart(s) {
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  mountStatsChart("stats-rolling-vol-chart", {
    pad,
    getLength: () => s.roll30.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const drawCount = indices.length;
      const vals = indices.map((i) => s.roll30[i].vol);
      const minV = Math.min(...vals) * 0.9;
      const maxV = Math.max(...vals) * 1.1;
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null) {
        const v = s.roll30[api.hoverGlobal].vol;
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yAt(v), "#a78bfa");
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtPct(maxV, 0), api.pad.left - 6, api.pad.top + 10);
      ctx.fillText(fmtPct(minV, 0), api.pad.left - 6, h - api.pad.bottom);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(s.roll30[indices[i]].date, drawCount > 180),
      );
    },
    formatTooltip(globalIdx) {
      const pt = s.roll30[globalIdx];
      return chartTipTitle(pt.date) + chartTipRow("30d vol (ann.)", fmtPct(pt.vol, 1));
    },
  });
}

function startStatsPoll() {
  if (statsTimer) return;
  statsTimer = setInterval(fetchBtcStats, STATS_POLL_MS);
}

function initStatsModule() {
  if (statsReady) return;
  statsReady = true;
  try {
    localStorage.removeItem("swr:payload:v1:stats");
    localStorage.removeItem("swr:payload:v1:stats-btcusd-v2");
  } catch {
    /* ignore */
  }
  window.addEventListener("resize", () => {
    if (!statsData) return;
    drawCumulativeChart(statsData);
    drawHistogramChart(statsData);
    drawRollingVolChart(statsData);
    if (statsData.risk) {
      drawRiskDrawdownChart(statsData.risk);
      drawRiskRollingVolChart(statsData.risk);
      drawRiskRollingSharpeChart(statsData.risk);
    }
    if (statsData.var) {
      drawVarHistogramChart(statsData);
      drawVarRollingChart(statsData.var);
    }
    if (statsData.markov) drawMarkovRegimeChart(statsData.markov);
    if (statsData.powerlaw) {
      const pl = statsData.powerlaw;
      drawPowerLawBandChart(pl);
      drawPowerLawLogChart(pl);
      drawPowerLawRatioChart(pl);
    }
  });
}

window.refreshStatsCharts = function () {
  if (statsData) {
    drawCumulativeChart(statsData);
    drawHistogramChart(statsData);
    drawRollingVolChart(statsData);
  } else {
    fetchBtcStats();
  }
};

window.refreshRiskCharts = function () {
  if (statsData?.risk) {
    const riskScreen = document.querySelector('.menu-screen[data-l1="stats"][data-l2="risk"]');
    window.decorateHelpLabels?.(riskScreen);
    drawRiskDrawdownChart(statsData.risk);
    drawRiskRollingVolChart(statsData.risk);
    drawRiskRollingSharpeChart(statsData.risk);
  } else {
    fetchBtcStats();
  }
};

window.refreshVarCharts = function () {
  if (statsData?.var) {
    renderVarScreen();
  } else {
    fetchBtcStats();
  }
};

// refreshVolatilityCharts is defined in stats-volatility.js (GARCH suite)

window.refreshMarkovCharts = function () {
  if (statsData?.markov) {
    renderMarkovScreen();
  } else {
    fetchBtcStats();
  }
};

window.refreshPowerLawCharts = function () {
  if (statsData?.powerlaw) {
    renderPowerLawScreen();
  } else {
    fetchBtcStats();
  }
};

window.loadBtcStats = function () {
  fetchBtcStats();
  startStatsPoll();
};

initStatsModule();