const BINANCE_KLINES = "https://api.binance.com/api/v3/klines";
const STATS_SYMBOL = "BTCUSDT";
const STATS_INTERVAL = "1d";
const STATS_LIMIT = 1000;
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
  };
}

function buildCommentary(s) {
  const lines = [];

  lines.push(
    `Over ${s.count} trading days (${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}), ` +
      `BTC/USDT posted a cumulative return of ${fmtPct(s.totalReturn)} from ` +
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
    `Over ${s.count} trading days (${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}), BTC/USDT ` +
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

async function fetchKlines(symbol) {
  const url =
    `${BINANCE_KLINES}?symbol=${symbol}&interval=${STATS_INTERVAL}&limit=${STATS_LIMIT}`;
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
}

async function fetchBtcStats() {
  const swr = window.DashboardSWR;
  if (!swr) return;
  const updateEl = stEl("stats-analysis-update");

  try {
    await swr.runSWR({
      key: "stats",
      l1: "stats",
      source: `Binance ${STATS_SYMBOL}`,
      fetch: async () => {
        const [btcDays, ethDays] = await Promise.all([
          fetchKlines(STATS_SYMBOL),
          fetchKlines("ETHUSDT").catch(() => null),
        ]);
        const base = computeStats(btcDays);
        const ethR = ethDays ? ethReturns(ethDays) : null;
        const extended = extendRiskVar(base, ethR);
        base.risk = extended;
        base.var = extended.var;
        base.fetchedAt = new Date().toISOString();
        return base;
      },
      render: (data, opts = {}) => {
        if (opts.loading) {
          if (updateEl) updateEl.textContent = "Loading daily candles…";
          return;
        }
        applyStatsBundle(data);
        if (updateEl) {
          updateEl.textContent =
            `${data.count} days · Binance ${STATS_SYMBOL} · ` +
            swr.formatPanelMeta({
              fetchedAt: data.fetchedAt,
              stale: opts.stale,
              refreshing: opts.refreshing,
              refreshFailed: opts.refreshFailed,
            });
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
      `${s.count} days · Binance ${STATS_SYMBOL} · Updated ` +
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

  scheduleChartDraw(stEl("var-histogram-chart"), (w, h) =>
    paintVarHistogramChart(s, w, h),
  );
  scheduleChartDraw(stEl("var-rolling-chart"), (w, h) =>
    paintVarRollingChart(v, w, h),
  );
}

function drawRiskDrawdownChart(r) {
  const canvas = stEl("risk-drawdown-chart");
  if (!canvas || !r.drawdowns.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 18, right: 20, bottom: 36, left: 56 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const vals = r.drawdowns.map((d) => d.dd);
  const minV = Math.min(...vals, 0);
  const maxV = 0;
  const range = maxV - minV || 0.01;

  ctx.fillStyle = "rgba(246, 70, 93, 0.25)";
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = pad.left + (i / (vals.length - 1)) * chartW;
    const y = pad.top + chartH - ((v - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, pad.top + chartH);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + chartW, pad.top + chartH);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#f6465d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = pad.left + (i / (vals.length - 1)) * chartW;
    const y = pad.top + chartH - ((v - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText("0%", pad.left - 6, pad.top + 10);
  ctx.fillText(fmtPct(minV, 0), pad.left - 6, h - pad.bottom);
  drawTimeAxisLabels(ctx, w, h, pad, r.drawdowns.length, (i) =>
    fmtChartDate(r.drawdowns[i].date, r.drawdowns.length > 180),
  );
}

function drawRiskRollingVolChart(r) {
  const canvas = stEl("risk-rolling-vol-chart");
  if (!canvas || !r.rollVol30.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const n = Math.min(r.rollVol30.length, r.rollVol90.length);
  const vol30 = r.rollVol30.slice(-n);
  const vol90 = r.rollVol90.slice(-n);
  const allV = [
    ...vol30.map((x) => x.vol30),
    ...vol90.map((x) => x.vol90),
  ];
  const minV = Math.min(...allV) * 0.9;
  const maxV = Math.max(...allV) * 1.1;
  const range = maxV - minV || 0.01;

  const drawLine = (data, key, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((pt, i) => {
      const x = pad.left + (i / Math.max(data.length - 1, 1)) * chartW;
      const y = pad.top + chartH - ((pt[key] - minV) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  drawLine(vol30, "vol30", "#0ea5e9");
  drawLine(vol90, "vol90", "#a78bfa");

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(fmtPct(maxV, 0), pad.left - 6, pad.top + 10);
  ctx.textAlign = "left";
  ctx.fillText("30d", pad.left, pad.top + 10);
  ctx.fillText("90d", pad.left + 28, pad.top + 10);
  drawTimeAxisLabels(ctx, w, h, pad, n, (i) =>
    fmtChartDate(vol30[i]?.date, n > 180),
  );
}

function drawRiskRollingSharpeChart(r) {
  const canvas = stEl("risk-rolling-sharpe-chart");
  if (!canvas || !r.rollSharpe90.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const vals = r.rollSharpe90.map((x) => x.sharpe);
  const minV = Math.min(...vals, 0);
  const maxV = Math.max(...vals, 0);
  const range = maxV - minV || 0.01;
  const zeroY = pad.top + chartH - ((0 - minV) / range) * chartH;

  ctx.strokeStyle = "rgba(125, 135, 153, 0.35)";
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(w - pad.right, zeroY);
  ctx.stroke();

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  r.rollSharpe90.forEach((pt, i) => {
    const x = pad.left + (i / (r.rollSharpe90.length - 1)) * chartW;
    const y = pad.top + chartH - ((pt.sharpe - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  drawTimeAxisLabels(ctx, w, h, pad, r.rollSharpe90.length, (i) =>
    fmtChartDate(r.rollSharpe90[i].date, r.rollSharpe90.length > 180),
  );
}

function paintVarHistogramChart(s, w, h) {
  const canvas = stEl("var-histogram-chart");
  if (!canvas || !s.histogram?.length || w < 4) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = { top: 22, right: 12, bottom: 40, left: 44 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const maxCount = Math.max(...s.histogram.map((b) => b.count), 1);
  const barW = chartW / s.histogram.length;
  const v = s.var;

  s.histogram.forEach((b, i) => {
    const barH = (b.count / maxCount) * chartH;
    const x = pad.left + i * barW + 1;
    const y = pad.top + chartH - barH;
    const mid = (b.lo + b.hi) / 2;
    ctx.fillStyle = mid >= 0 ? "rgba(14, 203, 129, 0.7)" : "rgba(246, 70, 93, 0.7)";
    ctx.fillRect(x, y, Math.max(barW - 2, 2), barH);
  });

  if (v) {
    const minR = s.histogram[0].lo;
    const maxR = s.histogram[s.histogram.length - 1].hi;
    const span = maxR - minR || 0.001;
    const mark = (pct, color, label) => {
      const x = pad.left + ((pct - minR) / span) * chartW;
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, h - pad.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "9px IBM Plex Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, x, pad.top + 10);
    };
    mark(v.historical.var95, "rgba(34, 211, 238, 0.9)", "95%");
    mark(v.historical.var99, "rgba(167, 139, 250, 0.9)", "99%");
  }

  const minR = s.histogram[0].lo;
  const maxR = s.histogram[s.histogram.length - 1].hi;
  drawReturnAxisLabels(ctx, w, h, pad, minR, maxR, (v) => fmtPct(v, 1), {
    ticks: 7,
    y: h - 6,
  });
  ctx.fillStyle = "#7d8799";
  ctx.font = "9px IBM Plex Mono, monospace";
  ctx.textAlign = "center";
  ctx.fillText("Daily return", w / 2, h - 22);
}

function paintVarRollingChart(v, w, h) {
  const canvas = stEl("var-rolling-chart");
  if (!canvas || !v.rollingVar95?.length || w < 4) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = { top: 18, right: 12, bottom: 40, left: 48 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const vals = v.rollingVar95.map((x) => x.var95);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals, 0);
  const range = maxV - minV || 0.01;

  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2;
  const denom = Math.max(v.rollingVar95.length - 1, 1);
  ctx.beginPath();
  v.rollingVar95.forEach((pt, i) => {
    const x = pad.left + (i / denom) * chartW;
    const y = pad.top + chartH - ((pt.var95 - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(fmtPct(maxV, 1), pad.left - 6, pad.top + 10);
  ctx.fillText(fmtPct(minV, 1), pad.left - 6, h - pad.bottom);
  drawTimeAxisLabels(ctx, w, h, pad, v.rollingVar95.length, (i) =>
    fmtChartDate(v.rollingVar95[i].date, v.rollingVar95.length > 180),
  );
}

function drawVarHistogramChart(s) {
  scheduleChartDraw(stEl("var-histogram-chart"), (w, h) =>
    paintVarHistogramChart(s, w, h),
  );
}

function drawVarRollingChart(v) {
  scheduleChartDraw(stEl("var-rolling-chart"), (w, h) =>
    paintVarRollingChart(v, w, h),
  );
}

function drawCumulativeChart(s) {
  const canvas = stEl("stats-cumulative-chart");
  if (!canvas || !s.cumulative.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 18, right: 20, bottom: 36, left: 56 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const vals = s.cumulative;
  const minV = Math.min(...vals, 0);
  const maxV = Math.max(...vals, 0);
  const range = maxV - minV || 0.01;
  const zeroY = pad.top + chartH - ((0 - minV) / range) * chartH;

  ctx.strokeStyle = "rgba(125, 135, 153, 0.35)";
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(w - pad.right, zeroY);
  ctx.stroke();

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = pad.left + (i / (vals.length - 1)) * chartW;
    const y = pad.top + chartH - ((v - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(fmtPct(maxV, 0), pad.left - 6, pad.top + 10);
  ctx.fillText(fmtPct(minV, 0), pad.left - 6, h - pad.bottom);
  drawTimeAxisLabels(ctx, w, h, pad, s.cumulative.length, (i) =>
    fmtChartDate(s.days[i + 1]?.date, s.count > 180),
  );
}

function drawHistogramChart(s) {
  const canvas = stEl("stats-histogram-chart");
  if (!canvas || !s.histogram.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 18, right: 16, bottom: 36, left: 48 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const maxCount = Math.max(...s.histogram.map((b) => b.count), 1);
  const barW = chartW / s.histogram.length;

  s.histogram.forEach((b, i) => {
    const barH = (b.count / maxCount) * chartH;
    const x = pad.left + i * barW + 1;
    const y = pad.top + chartH - barH;
    const mid = (b.lo + b.hi) / 2;
    ctx.fillStyle = mid >= 0 ? "rgba(14, 203, 129, 0.7)" : "rgba(246, 70, 93, 0.7)";
    ctx.fillRect(x, y, Math.max(barW - 2, 2), barH);
  });

  const zeroIdx = s.histogram.findIndex((b) => b.lo <= 0 && b.hi >= 0);
  if (zeroIdx >= 0) {
    const zx = pad.left + zeroIdx * barW + barW / 2;
    ctx.strokeStyle = "rgba(240, 185, 11, 0.6)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(zx, pad.top);
    ctx.lineTo(zx, h - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "center";
  ctx.fillText(fmtPct(s.histogram[0].lo, 1), pad.left, h - 8);
  ctx.fillText(fmtPct(s.histogram[s.histogram.length - 1].hi, 1), w - pad.right, h - 8);
}

function drawRollingVolChart(s) {
  const canvas = stEl("stats-rolling-vol-chart");
  if (!canvas || !s.roll30.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const vals = s.roll30.map((r) => r.vol);
  const minV = Math.min(...vals) * 0.9;
  const maxV = Math.max(...vals) * 1.1;
  const range = maxV - minV || 0.01;

  ctx.strokeStyle = "#a78bfa";
  ctx.lineWidth = 2;
  ctx.beginPath();
  s.roll30.forEach((r, i) => {
    const x = pad.left + (i / (s.roll30.length - 1)) * chartW;
    const y = pad.top + chartH - ((r.vol - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(fmtPct(maxV, 0), pad.left - 6, pad.top + 10);
  ctx.fillText(fmtPct(minV, 0), pad.left - 6, h - pad.bottom);
  drawTimeAxisLabels(ctx, w, h, pad, s.roll30.length, (i) =>
    fmtChartDate(s.roll30[i].date, s.roll30.length > 180),
  );
}

function startStatsPoll() {
  if (statsTimer) return;
  statsTimer = setInterval(fetchBtcStats, STATS_POLL_MS);
}

function initStatsModule() {
  if (statsReady) return;
  statsReady = true;
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

window.loadBtcStats = function () {
  fetchBtcStats();
  startStatsPoll();
};

initStatsModule();