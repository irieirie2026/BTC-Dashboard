/**
 * Misc → Bitcoin — BTC-only indicators dashboard (Macro Drivers pattern).
 */

const MB_SETTINGS_KEY = "misc:bitcoin-settings:v1";

let mbMeta = null;
let mbSnapshot = null;
let mbDistribution = null;
let mbReady = false;
let mbActiveTab = "overview";
let mbSelectedIndicator = "fear_greed";
let mbSeriesCache = {};
let mbValuationBundle = null;
let mbFlowsBundle = null;
let mbNetworkBundle = null;
let mbIntelligenceBundle = null;
let mbMinerBundle = null;
let mbMainChartRequest = 0;
let mbOverviewSummaryRequest = 0;
const mbTabCyclePhases = {};

const mbState = {
  timespan: "1year",
  indicator: "fear_greed",
};
window.mbState = mbState;

const MB_PLOTLY_CONFIG = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
};
const MB_CHART_HEIGHT = 420;

const MB_SOURCE_CLASS = {
  BitInfoCharts: "db",
  "Blockchain.info": "wb",
  BGeometrics: "imf",
  "Alternative.me": "oecd",
  CoinGecko: "est",
  "Coin Metrics Community": "wb",
  "Mempool.space": "proxy",
  "Binance Futures": "proxy",
  "Exchange APIs": "proxy",
  "Computed · Blockchain.info": "est",
  Santiment: "oecd",
  "Dune Analytics": "db",
  Blockchair: "wb",
  "BGeometrics · bitcoin-data.com": "imf",
};

const mbEl = (id) => document.getElementById(id);

function mbFmtValue(val, format) {
  if (val == null || Number.isNaN(val)) return "—";
  const n = Number(val);
  if (format === "pct") return `${n.toFixed(2)}%`;
  if (format === "usd") return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (format === "usd_precise") {
    if (n > 0 && n < 1) return `$${n.toFixed(4)}`;
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
  }
  if (format === "btc") return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} BTC`;
  if (format === "large_int") {
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (format === "hashrate") return `${n.toFixed(1)} EH/s`;
  if (format === "funding") return `${n >= 0 ? "+" : ""}${n.toFixed(4)}%`;
  if (format === "score") return String(Math.round(n));
  if (format === "zscore") return n.toFixed(2);
  if (format === "ratio") return n.toFixed(3);
  if (format === "signal") return n >= 1 ? "Cross active" : "No cross";
  if (format === "fee_sat") return `${Math.round(n)} sat/vB`;
  return n.toFixed(2);
}

function mbSourceBadge(source, extra = {}) {
  if (!source) return '<span class="md-source md-source--na">—</span>';
  const cls = MB_SOURCE_CLASS[source] || "na";
  let label = source;
  if (extra.stale) label += " · stale";
  if (extra.isEstimate) label += " · est";
  if (extra.mayProxy) label += " · proxy";
  return `<span class="md-source md-source--${cls}" title="${label}">${source.split(" ·")[0]}</span>`;
}

function mbPlotLayoutCategory(title, height = 340, opts = {}) {
  const layout = mbPlotLayout(title, height, opts);
  layout.xaxis = {
    ...layout.xaxis,
    type: "category",
  };
  layout.hovermode = "closest";
  return layout;
}

function mbPlotLayoutPie(title, height = 380) {
  return {
    template: "plotly_dark",
    title: title
      ? { text: title, font: { size: 13, color: "#cbd5e1" }, x: 0.02, xanchor: "left" }
      : undefined,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(255,255,255,0.02)",
    margin: { l: 20, r: 20, t: title ? 40 : 16, b: 20 },
    height,
    font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 11, color: "#94a3b8" },
    hoverlabel: {
      bgcolor: "#1e2433",
      bordercolor: "rgba(148, 163, 184, 0.35)",
      font: { family: "IBM Plex Sans, sans-serif", size: 11, color: "#e2e8f0" },
    },
    showlegend: false,
  };
}

function mbPlotLayout(title, height = MB_CHART_HEIGHT, opts = {}) {
  return {
    template: "plotly_dark",
    title: title
      ? { text: title, font: { size: 13, color: "#cbd5e1" }, x: 0.02, xanchor: "left" }
      : undefined,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(255,255,255,0.02)",
    margin: { l: 52, r: 20, t: title ? 40 : 16, b: opts.rangeSlider ? 72 : 44 },
    height,
    font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 11, color: "#94a3b8" },
    hoverlabel: {
      bgcolor: "#1e2433",
      bordercolor: "rgba(148, 163, 184, 0.35)",
      font: { family: "IBM Plex Sans, sans-serif", size: 11, color: "#e2e8f0" },
    },
    xaxis: {
      type: "date",
      gridcolor: "rgba(148, 163, 184, 0.08)",
      linecolor: "rgba(148, 163, 184, 0.15)",
      tickfont: { size: 10, color: "#64748b" },
      rangeslider: opts.rangeSlider ? { visible: true, thickness: 0.05 } : { visible: false },
    },
    yaxis: {
      gridcolor: "rgba(148, 163, 184, 0.08)",
      linecolor: "rgba(148, 163, 184, 0.15)",
      tickfont: { size: 10, color: "#64748b" },
      title: opts.yTitle || "",
      zeroline: opts.zeroLine || false,
      zerolinecolor: "rgba(148, 163, 184, 0.35)",
    },
    showlegend: opts.showLegend || false,
    legend: opts.showLegend ? { orientation: "h", y: 1.1, font: { size: 10 } } : undefined,
    hovermode: "x unified",
    shapes: opts.shapes || [],
  };
}

function mbChartUsesRangeSlider(el) {
  return el?.classList?.contains("mb-plotly--tall")
    && (mbState.timespan === "2years" || mbState.timespan === "4years");
}

function mbLoadSettings() {
  try {
    const raw = localStorage.getItem(MB_SETTINGS_KEY);
    if (raw) return { ...mbState, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...mbState };
}

function mbSaveSettings() {
  localStorage.setItem(MB_SETTINGS_KEY, JSON.stringify(mbState));
}

function mbMergedIndicators() {
  const byKey = new Map();
  (mbMeta?.indicators || []).forEach((i) => byKey.set(i.key, i));
  (mbSnapshot?.indicators || []).forEach((i) => byKey.set(i.key, i));
  return [...byKey.values()];
}

function mbIndicatorMeta(key) {
  return mbMergedIndicators().find((i) => i.key === key) || {
    key,
    label: key,
    format: "ratio",
    tab: "overview",
  };
}

function mbChartInfo(key) {
  const info =
    mbMeta?.chartInfo?.[key]
    || mbValuationBundle?.chartInfo?.[key]
    || mbFlowsBundle?.chartInfo?.[key]
    || mbNetworkBundle?.chartInfo?.[key]
    || mbIntelligenceBundle?.chartInfo?.[key]
    || mbMinerBundle?.chartInfo?.[key];
  if (info) return info;
  const ind = mbIndicatorMeta(key);
  return {
    title: ind.label,
    description: ind.help ? "" : "",
    readings: "",
    source: ind.source,
  };
}

function mbReadingFor(key, val) {
  const info = mbChartInfo(key);
  const bands = info.hoverBands;
  const n = Number(val);
  if (bands?.length && Number.isFinite(n)) {
    for (const band of bands) {
      if (band.gte != null && n >= band.gte) return band.label;
      if (band.gt != null && n > band.gt) return band.label;
    }
    for (const band of [...bands].reverse()) {
      if (band.lte != null && n <= band.lte) return band.label;
      if (band.lt != null && n < band.lt) return band.label;
    }
  }
  return mbInterpretValue(key, val);
}

function mbShortReading(key) {
  const info = mbChartInfo(key);
  const text = info.readings || info.description || "";
  const first = text.split(";")[0].trim();
  const sentence = first.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || first.split(".")[0].trim();
  return sentence;
}

function mbHelpTooltip(key) {
  const ind = mbIndicatorMeta(key);
  const help = ind.help ? window.getMetricHelp?.(ind.help) : null;
  return help?.body?.trim() || "";
}

function mbRowTooltip(key, val) {
  const info = mbChartInfo(key);
  const reading = mbReadingFor(key, val);
  const helpBody = mbHelpTooltip(key);
  const parts = [];
  if (reading) parts.push(reading);
  if (info.description) parts.push(info.description);
  else if (helpBody) parts.push(helpBody);
  else if (info.readings) parts.push(mbShortReading(key));
  return parts.filter(Boolean).join(" — ").slice(0, 360);
}

function mbCombinedRowTooltip(spec, vals) {
  const info = mbChartInfo(spec.key);
  const cohort = spec.keys
    .map((k, i) => {
      const r = mbReadingFor(k, vals[i]);
      if (!r) return "";
      return `${i === 0 ? "STH" : "LTH"}: ${r}`;
    })
    .filter(Boolean)
    .join(" · ");
  const parts = [];
  if (cohort) parts.push(cohort);
  if (info.description) parts.push(info.description);
  else if (info.readings) parts.push(mbShortReading(spec.key));
  return parts.filter(Boolean).join(" — ").slice(0, 360);
}

function mbInterpretValue(key, val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return "";
  switch (key) {
    case "mvrv":
      if (n >= 3.5) return "Overheated zone (≥3.5×) — prior cycle tops";
      if (n >= 2) return "Elevated — watch for distribution";
      if (n < 1) return "Below cost basis — deep value zone";
      return "Neutral range (1–2×)";
    case "mvrv_z_score":
      if (n >= 7) return "Extreme top zone (≥7σ)";
      if (n >= 3) return "Overheated vs history";
      if (n <= -0.5) return "Undervalued / accumulation zone";
      return "Within historical norm";
    case "realized_price":
      return "Compare spot price to this cost-basis line";
    case "hodl_waves":
    case "hodl_waves_1y_plus":
      if (n >= 65) return "High long-term holder share";
      if (n <= 55) return "More short-term supply active";
      return "Moderate HODL conviction";
    case "puell_multiple":
      if (n >= 4) return "Miner revenue extreme — cycle top risk";
      if (n <= 0.5) return "Depressed miner income — bottom zone";
      return "Normal miner revenue band";
    case "fear_greed":
      if (n >= 75) return "Extreme Greed";
      if (n >= 56) return "Greed";
      if (n <= 24) return "Extreme Fear";
      if (n <= 44) return "Fear";
      return "Neutral sentiment";
    case "btc_dominance":
      if (n >= 55) return "BTC leading crypto market";
      if (n <= 45) return "Alts gaining share";
      return "Balanced dominance";
    case "nupl":
      if (n >= 0.75) return "Euphoria zone";
      if (n >= 0.5) return "Optimism / belief";
      if (n <= 0) return "Capitulation zone";
      return "Hope / recovery";
    case "sopr":
      if (n >= 1.05) return "Profit-taking dominates";
      if (n < 1) return "Coins moved at a loss";
      return "Near breakeven (1.0)";
    case "supply_in_profit":
      if (n >= 95) return "Nearly all supply in profit";
      if (n <= 50) return "Majority underwater";
      return "Mixed profit/loss supply";
    case "exchange_netflow":
      if (n >= 5000) return "Large net inflow — sell pressure risk";
      if (n <= -5000) return "Large net outflow — accumulation";
      return n > 0 ? "Net deposits to exchanges" : "Net withdrawals from exchanges";
    case "etf_flow_btc":
      if (n >= 1000) return "Strong ETF inflows";
      if (n <= -1000) return "Heavy ETF outflows";
      return n > 0 ? "Net ETF buying" : "Net ETF redemptions";
    case "mempool_fees":
      if (n >= 50) return "High mempool congestion";
      if (n <= 5) return "Low fee environment";
      return "Moderate block-space demand";
    case "asopr":
      if (n >= 1.03) return "Adjusted profit-taking dominates";
      if (n < 0.98) return "Capitulation moves (ASOPR < 1)";
      return "Near breakeven equilibrium";
    case "vdd_multiple":
      if (n >= 2.5) return "Old coins moving — elevated VDD";
      if (n <= 0.5) return "Quiet coin-days destroyed";
      return "Typical VDD band";
    case "sth_mvrv":
      if (n >= 1.5) return "Short-term holders richly in profit";
      if (n < 1) return "Recent buyers underwater";
      return "STH MVRV in equilibrium";
    case "lth_mvrv":
      if (n >= 3) return "Long-term holders very profitable";
      if (n < 1) return "Seasoned holders underwater";
      return "LTH MVRV in equilibrium";
    case "sth_nupl":
      if (n >= 0.6) return "Recent buyers euphoric";
      if (n <= 0) return "Short-term holder capitulation";
      return "STH NUPL balanced";
    case "lth_nupl":
      if (n >= 0.7) return "Long-term holder euphoria";
      if (n <= 0) return "Long-term holder capitulation";
      return "LTH NUPL balanced";
    case "san_mvrv_usd":
      if (n >= 3.5) return "Santiment MVRV overheated";
      if (n < 1) return "Below cost basis (Santiment)";
      return "Santiment MVRV neutral";
    case "open_interest":
      return "Perp leverage gauge — compare with funding";
    case "hashprice":
      return "Miner revenue per unit of hash power";
    case "difficulty":
      return "Mining competition / security adjustment";
    case "hashribbons":
      if (n >= 1) return "Hash ribbon recovery cross";
      if (n <= -1) return "Miner capitulation signal";
      return "No active ribbon signal";
    case "stock_to_flow":
    case "stock_to_flow_cross":
      if (n >= 100) return "Far above scarcity-implied value";
      if (n >= 50) return "Rich vs S2F model";
      if (n <= 1) return "Below model fair value";
      return "Near scarcity-implied band";
    case "power_law":
      if (n >= 2) return "Bubble vs power-law corridor";
      if (n >= 1.2) return "Above fair value band";
      if (n <= 0.5) return "Deep discount vs PLT";
      return "Within power-law range";
    case "pi_cycle_top":
      return n >= 1 ? "Pi Cycle cross active — late-cycle signal" : "No Pi Cycle cross";
    case "nvt_ratio":
      if (n >= 150) return "Very high NVT — price rich vs utility";
      if (n >= 90) return "Elevated NVT";
      if (n <= 45) return "Low NVT — utility supports price";
      return "Typical NVT band";
    case "metcalfe":
      if (n >= 2) return "Speculative premium vs network growth";
      if (n >= 1.2) return "Above Metcalfe fair value";
      if (n <= 0.6) return "Discount vs network fair value";
      return "Near Metcalfe equilibrium";
    case "coin_days_destroyed":
      if (n >= 5e6) return "Heavy old-coin movement";
      if (n <= 5e5) return "Quiet coin-days destroyed";
      return "Typical CDD activity";
    case "difficulty_ribbon":
      if (n >= 1e14) return "Difficulty elevated — strong miner competition";
      return "Difficulty ribbon reading";
    case "delta_balanced_price":
      return "Compare spot to on-chain equilibrium";
    case "rainbow_chart":
      return "Log-regression band position";
    default:
      return "";
  }
}

function mbReadingBadgeLabel(reading) {
  const short = reading.split("—")[0].split("(")[0].trim();
  if (short.length <= 20) return short;
  return `${short.slice(0, 18)}…`;
}

function mbInfoSignalBadge(key, val) {
  const reading = mbReadingFor(key, val);
  const info = mbChartInfo(key);
  const context = reading || mbShortReading(key) || info.description?.split(".")[0]?.trim() || "Latest snapshot reading";
  const label = reading ? mbReadingBadgeLabel(reading) : "Context";
  const tone = /undervalu|accumulation|bottom|bull|inflow|contrarian|capitulation|deep value|fear/.test(context.toLowerCase())
    ? (/deep|extreme fear|bottom|capitulation/.test(context.toLowerCase()) ? "bull2" : "bull")
    : /extreme|overheat|euphoria|top|bear|sell|distribution|crowded/.test(context.toLowerCase())
      ? (/extreme|euphoria|top/.test(context.toLowerCase()) ? "bear2" : "bear")
      : /elevated|watch|profit-taking|greed|cautious/.test(context.toLowerCase())
        ? "warn"
        : "info";
  return mbSignalBadge(label, tone, `${context}. Compare with the chart tab for full history and thresholds.`, "signal");
}

function mbCombinedSignalBadges(spec, cells) {
  const merged = [];
  const seen = new Set();
  for (const k of spec.keys) {
    const v = mbCellLatestValue(k, cells[k] || {});
    const badges = mbSignalBadges(k, v, cells[k] || {}, cells);
    for (const b of badges) {
      const id = `${b.label}:${b.tone}`;
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(b);
    }
  }
  return merged.slice(0, MB_SIGNAL_BADGE_LIMIT);
}

const MB_SIGNAL_BADGE_LIMIT = 4;

const MB_TREND_BADGE_KEYS = new Set([
  "active_addresses",
  "hash_rate",
  "hashrate_bg",
  "exchange_balance",
  "tx_count",
  "miners_revenue",
  "hashprice",
  "difficulty",
  "san_daily_active_addresses",
  "san_exchange_inflow",
  "san_exchange_outflow",
  "san_transaction_volume",
  "san_social_volume_total",
  "open_interest",
]);

const MB_FRAMEWORK_SNAPSHOT_KEYS = [
  "delta_balanced_price",
  "difficulty_ribbon",
  "stock_to_flow",
  "stock_to_flow_cross",
  "power_law",
  "pi_cycle_top",
  "rainbow_chart",
  "nvt_ratio",
  "metcalfe",
  "coin_days_destroyed",
];

const MB_DISTRIBUTION_SNAPSHOT_KEYS = {
  wealth_top10_pct: "top10_pct",
  rich_top100_pct: "top100_pct",
  rich_top1000_pct: "top1000_pct",
};

const MB_SAN_SERIES_KEYS = [
  "san_daily_active_addresses",
  "san_exchange_inflow",
  "san_exchange_outflow",
  "san_transaction_volume",
  "san_mvrv_usd",
  "san_price_usd",
  "san_social_volume_total",
];

const MB_TAB_ORDER = {
  valuation: 0,
  intelligence: 1,
  onchain: 2,
  sentiment: 3,
  miner: 4,
  distribution: 5,
};

const MB_TABLE_SECTIONS = [
  { key: "valuation", label: "Valuation & cycles" },
  { key: "intelligence", label: "On-chain intelligence" },
  { key: "onchain", label: "On-chain activity" },
  { key: "sentiment", label: "Sentiment & market structure" },
  { key: "miner", label: "Miner & network health" },
  { key: "distribution", label: "Distribution & whales" },
];

const MB_TABLE_COMBINED_ROWS = [
  {
    key: "sth_lth_mvrv",
    label: "STH vs LTH MVRV",
    tab: "intelligence",
    keys: ["sth_mvrv", "lth_mvrv"],
    format: "ratio",
    source: "BGeometrics",
    navigateTab: "intelligence",
    badgeKey: "sth_mvrv",
  },
  {
    key: "sth_lth_nupl",
    label: "STH vs LTH NUPL",
    tab: "intelligence",
    keys: ["sth_nupl", "lth_nupl"],
    format: "ratio",
    source: "BGeometrics",
    navigateTab: "intelligence",
    badgeKey: "sth_nupl",
  },
];

const MB_COMBINED_HIDE_KEYS = new Set([
  "sth_mvrv",
  "lth_mvrv",
  "sth_nupl",
  "lth_nupl",
]);

function mbSeriesLatestFromCache(key) {
  for (const ts of [mbState.timespan, "1year", "90days", "30days", "all"]) {
    const series = mbSeriesCache[`${key}:${ts}`]?.series;
    if (!series?.length) continue;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const v = Number(series[i]?.value);
      if (Number.isFinite(v)) return v;
    }
  }
  return mbSeriesLatestValue(mbCachedSeries(key, 1));
}

function mbIsValidSnapshotValue(key, val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return false;
  if (key === "hashprice") return n > 0.0001;
  if (key === "difficulty" || key === "difficulty_ribbon") return n > 1;
  if (key.endsWith("_pct")) return n > 0;
  return true;
}

function mbSanitizeMetricValue(key, val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  if (key === "hash_rate") {
    if (n >= 50) return n;
    if (n > 0 && n < 50) {
      const scaled = n * 1e6;
      if (scaled >= 50 && scaled <= 5000) return scaled;
    }
    const fromSeries = mbSeriesLatestFromCache(key);
    if (fromSeries != null && fromSeries >= 50) return fromSeries;
  }
  if (!mbIsValidSnapshotValue(key, n)) return null;
  return n;
}

function mbBlockchairDifficultyLatest() {
  const body = mbSeriesCache["blockchair_stats:1year"]
    || mbSeriesCache["blockchair_stats:90days"]
    || mbSeriesCache["blockchair_stats:30days"];
  const latest = body?.latest || body?.series?.[body.series.length - 1];
  const snap = latest?.snapshot;
  const d = snap?.difficulty != null ? Number(snap.difficulty) : null;
  return Number.isFinite(d) && d > 1 ? d : null;
}

function mbVmLatestForModel(modelId) {
  const bundles = window.mbVmBundles || {};
  for (const tab of ["valuation", "onchain", "miner"]) {
    const chart = bundles[tab]?.charts?.[modelId];
    if (!chart) continue;
    const direct = chart.latest?.value ?? chart.latest?.label ?? chart.latest;
    if (direct != null && mbIsValidSnapshotValue(modelId, direct)) return Number(direct);
    const series = chart.series || [];
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const v = Number(series[i]?.value);
      if (mbIsValidSnapshotValue(modelId, v)) return v;
    }
  }
  return null;
}

function mbDistributionWealthValue(key) {
  const field = MB_DISTRIBUTION_SNAPSHOT_KEYS[key];
  if (!field || !mbDistribution?.wealth) return null;
  const v = Number(mbDistribution.wealth[field]);
  return mbIsValidSnapshotValue(key, v) ? v : null;
}

function mbCellLatestValue(key, cell) {
  const fromSeries = mbSeriesLatestFromCache(key);
  const fromVm = mbVmLatestForModel(key);
  const fromWealth = mbDistributionWealthValue(key);
  const fromBlockchair = (key === "difficulty" || key === "difficulty_ribbon")
    ? mbBlockchairDifficultyLatest()
    : null;

  const pick = (...candidates) => {
    for (const c of candidates) {
      if (c != null && mbIsValidSnapshotValue(key, c)) return c;
    }
    return null;
  };

  if (key === "hash_rate") {
    const cellVal = cell?.value != null ? mbSanitizeMetricValue(key, cell.value) : null;
    return pick(fromSeries, cellVal);
  }

  if (MB_TREND_BADGE_KEYS.has(key)) {
    const cellVal = cell?.value != null ? mbSanitizeMetricValue(key, cell.value) : null;
    return pick(fromSeries, fromVm, fromBlockchair, fromWealth, cellVal);
  }

  const cellVal = cell?.value != null ? mbSanitizeMetricValue(key, cell.value) : null;
  return pick(fromSeries, fromVm, fromBlockchair, fromWealth, cellVal);
}

function mbChartDataWithFallback(indicator, data) {
  const series = data?.series || [];
  const hasPoints = series.some((p) => p.value != null && Number.isFinite(Number(p.value)));
  if (hasPoints) return data;
  const cachedSeries = mbCachedSeries(indicator, 7);
  if (!cachedSeries?.length) return data;
  return {
    ...(data || {}),
    series: cachedSeries,
    stale: true,
    error: null,
    source: data?.source || "Cached series",
  };
}

function mbCachedSeries(key, minPoints = 14) {
  const bundleSeries = {
    active_addresses: mbNetworkBundle?.charts?.active_addresses?.series,
    hash_rate: mbNetworkBundle?.charts?.hash_rate?.series,
    tx_count: mbNetworkBundle?.charts?.tx_count?.series,
    exchange_balance: mbFlowsBundle?.charts?.exchange_balance?.series,
    miners_revenue: mbMinerBundle?.charts?.miners_revenue?.series,
    puell_multiple: mbMinerBundle?.charts?.puell_multiple?.series,
    hashprice: mbMinerBundle?.charts?.hashprice?.series,
    hashrate_bg: mbMinerBundle?.charts?.hashrate_bg?.series,
    hashribbons: mbMinerBundle?.charts?.hashribbons?.series,
    difficulty: mbMinerBundle?.charts?.difficulty?.series,
    difficulty_ribbon: mbMinerBundle?.charts?.difficulty?.series,
    thermo_price: mbMinerBundle?.charts?.thermo_price?.series,
    mvrv: mbIntelligenceBundle?.charts?.mvrv?.series,
    mvrv_z_score: mbIntelligenceBundle?.charts?.mvrv_z_score?.series,
    realized_price: mbIntelligenceBundle?.charts?.realized_price?.series,
    nupl: mbIntelligenceBundle?.charts?.nupl?.series,
    sopr: mbIntelligenceBundle?.charts?.sopr?.series,
    supply_in_profit: mbIntelligenceBundle?.charts?.supply_in_profit?.series,
    hodl_waves: mbIntelligenceBundle?.charts?.hodl_waves?.series,
  }[key];
  if (bundleSeries?.length >= 7) return bundleSeries;

  const spans = ["1year", "90days", "30days", mbState.timespan, "all"];
  const seen = new Set();
  for (const ts of spans) {
    if (!ts || seen.has(ts)) continue;
    seen.add(ts);
    const series = mbSeriesCache[`${key}:${ts}`]?.series;
    if (series?.length >= minPoints) return series;
  }
  for (const ts of spans) {
    if (!ts || seen.has(ts)) continue;
    const series = mbSeriesCache[`${key}:${ts}`]?.series;
    if (series?.length >= 7) return series;
  }
  return null;
}

function mbSeriesAvgLastDays(series, days, excludeLatest = true) {
  if (!series?.length) return null;
  const cutoffMs = Date.now() - days * 86400000;
  const vals = [];
  for (let i = 0; i < series.length; i += 1) {
    if (excludeLatest && i === series.length - 1) continue;
    const p = series[i];
    const ms = mbSeriesPointMs(p);
    const v = Number(p?.value);
    if (ms == null || ms < cutoffMs || !Number.isFinite(v)) continue;
    vals.push(v);
  }
  if (!vals.length) return null;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
}

function mbSeriesLatestValue(series) {
  if (!series?.length) return null;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const v = Number(series[i]?.value);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

const MB_TREND_FLOW_SEMANTICS = {
  san_exchange_inflow: {
    rising: { label: "Rising inflow", tone: "bear", detail: "More USD is hitting exchanges than the 90-day average — deposits often precede sell-side pressure." },
    falling: { label: "Falling inflow", tone: "bull", detail: "Exchange deposits are cooling versus recent norms — less immediate sell pressure from inflows." },
    stable: { label: "Stable inflow", tone: "neutral", detail: "Exchange inflow is near its 90-day average — no strong directional flow signal." },
  },
  san_exchange_outflow: {
    rising: { label: "Rising outflow", tone: "bull", detail: "More USD is leaving exchanges than usual — often aligns with accumulation and self-custody." },
    falling: { label: "Falling outflow", tone: "warn", detail: "Outflows are softer than the 90-day average — less evidence of coins moving off exchanges." },
    stable: { label: "Stable outflow", tone: "neutral", detail: "Exchange outflow is near its 90-day average — balanced withdrawal activity." },
  },
  open_interest: {
    rising: { label: "Rising OI", tone: "warn", detail: "Open interest is above its 90-day average — more leverage in the system; watch for flush risk on reversals." },
    falling: { label: "Falling OI", tone: "neutral", detail: "Open interest is below recent norms — deleveraging or quieter speculative positioning." },
    stable: { label: "Stable OI", tone: "neutral", detail: "Perp open interest is near its 90-day average — leverage neither crowded nor washed out." },
  },
  difficulty: {
    rising: { label: "Rising diff.", tone: "bull", detail: "Mining difficulty is climbing — miners are competing harder, reflecting network security investment." },
    falling: { label: "Falling diff.", tone: "warn", detail: "Difficulty is dropping versus recent norms — can signal miner capitulation or margin stress." },
    stable: { label: "Stable diff.", tone: "neutral", detail: "Difficulty is near its 90-day average — typical post-adjustment equilibrium." },
  },
  hashprice: {
    rising: { label: "Rising hashprice", tone: "bull", detail: "Miner revenue per hash is improving — healthier margins support network security." },
    falling: { label: "Falling hashprice", tone: "warn", detail: "Hashprice is below recent norms — compresses miner margins and can precede capitulation." },
    stable: { label: "Stable hashprice", tone: "neutral", detail: "Hashprice is near its 90-day average — miners in a typical revenue band." },
  },
};

function mbTrendBadges(key, latest) {
  const series = mbCachedSeries(key);
  if (!series?.length) return [];
  const seriesLatest = mbSeriesLatestValue(series);
  const value = seriesLatest != null ? seriesLatest : latest;
  if (!Number.isFinite(value)) return [];
  const avg90 = mbSeriesAvgLastDays(series, 90);
  const avg30 = mbSeriesAvgLastDays(series, 30);
  if (avg90 == null || !Number.isFinite(avg90) || avg90 === 0) return [];
  const ratio = value / avg90;
  const pct = ((value - avg90) / Math.abs(avg90)) * 100;
  const pctLabel = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs 90d avg`;
  const short30 = avg30 != null && avg30 > 0 ? value / avg30 : null;
  const flowSem = MB_TREND_FLOW_SEMANTICS[key];

  if (key === "exchange_balance") {
    if (ratio >= 1.05) {
      return [
        mbSignalBadge("Building", "bear", `${pctLabel}. Exchange BTC balance is above its 90-day average — more supply sitting on venues, which can raise near-term sell pressure.`, "flow"),
        mbSignalBadge("Cautious", "warn", "Rising exchange inventory often coincides with distribution or profit-taking phases.", "signal"),
      ];
    }
    if (ratio <= 0.95) {
      return [
        mbSignalBadge("Draining", "bull", `${pctLabel}. Coins are leaving exchanges faster than usual — a classic accumulation / cold-storage pattern.`, "flow"),
        mbSignalBadge("Bullish", "bull", "Sustained outflows reduce immediately liquid sell-side supply on exchanges.", "signal"),
      ];
    }
    return [mbSignalBadge("Stable", "neutral", `${pctLabel}. Exchange balance is flat versus its 90-day average — no strong inventory signal.`, "flow")];
  }

  if (key === "miners_revenue") {
    if (ratio >= 1.25) {
      return [
        mbSignalBadge("Elevated", "warn", `${pctLabel}. Miner revenue is well above its 90-day norm — check Puell Multiple for cycle-extreme risk.`, "network"),
        mbSignalBadge("Cautious", "warn", "Revenue spikes historically clustered near halving eras and distribution phases.", "signal"),
      ];
    }
    if (ratio <= 0.8) {
      return [
        mbSignalBadge("Depressed", "bull2", `${pctLabel}. Miner income is materially below recent averages — margin stress and capitulation risk rise.`, "network"),
        mbSignalBadge("Bullish", "bull", "Depressed miner revenue often coincides with historical accumulation zones.", "signal"),
      ];
    }
    if (ratio >= 1.05) return [mbSignalBadge("Rising", "bull", `${pctLabel}. Miner revenue is improving versus the 90-day average.`, "network")];
    if (ratio <= 0.95) return [mbSignalBadge("Soft", "warn", `${pctLabel}. Miner revenue is cooling from recent norms.`, "network")];
    return [mbSignalBadge("Normal", "neutral", `${pctLabel}. Miner revenue sits in a typical band versus the last 90 days.`, "network")];
  }

  const kind = /hash|difficulty|hashprice/.test(key)
    ? "network"
    : key === "active_addresses" || key.startsWith("san_daily")
      ? "structural"
      : key.startsWith("san_social")
        ? "sentiment"
        : "network";

  const pickFlow = (slot) => {
    const sem = flowSem?.[slot];
    if (!sem) return null;
    return [
      mbSignalBadge(sem.label, sem.tone, `${pctLabel}. ${sem.detail}`, kind),
      slot === "rising" && key === "san_exchange_inflow"
        ? mbSignalBadge("Cautious", "warn", "Heavy inflows can foreshadow exchange deposits ahead of selling.", "signal")
        : slot === "rising" && key === "san_exchange_outflow"
          ? mbSignalBadge("Accumulation", "bull", "Sustained outflows support the self-custody / HODL narrative.", "signal")
          : null,
    ].filter(Boolean);
  };

  if (flowSem) {
    if (ratio >= 1.08 || (short30 != null && short30 >= 1.06 && ratio >= 1.02)) {
      const picked = pickFlow("rising");
      if (picked?.length) return picked;
    }
    if (ratio >= 1.02) {
      const picked = pickFlow("rising");
      if (picked?.length) return [picked[0]];
    }
    if (ratio <= 0.92 || (short30 != null && short30 <= 0.94 && ratio <= 0.98)) {
      const picked = pickFlow("falling");
      if (picked?.length) return picked;
    }
    if (ratio <= 0.98) {
      const picked = pickFlow("falling");
      if (picked?.length) return [picked[0]];
    }
    const picked = pickFlow("stable");
    if (picked?.length) return picked;
  }

  if (ratio >= 1.08 || (short30 != null && short30 >= 1.06 && ratio >= 1.02)) {
    return [
      mbSignalBadge("Rising", "bull", `${pctLabel}. Reading is clearly above its 90-day average — momentum is building on this metric.`, kind),
      mbSignalBadge("Strong", "bull", "Sustained strength versus recent history — trend is supportive.", "signal"),
    ];
  }
  if (ratio >= 1.02) {
    return [mbSignalBadge("Rising", "bull", `${pctLabel}. Above the 90-day average with positive short-term momentum.`, kind)];
  }
  if (ratio <= 0.92 || (short30 != null && short30 <= 0.94 && ratio <= 0.98)) {
    return [
      mbSignalBadge("Falling", "warn", `${pctLabel}. Below the 90-day average — activity or demand is softening.`, kind),
      mbSignalBadge("Soft", "neutral", "Weaker than recent norms; not necessarily bearish in isolation.", "signal"),
    ];
  }
  if (ratio <= 0.98) {
    return [mbSignalBadge("Soft", "neutral", `${pctLabel}. Slightly under its 90-day average — muted but not collapsing.`, kind)];
  }
  return [mbSignalBadge("Stable", "neutral", `${pctLabel}. Near the 90-day average — no strong trend signal.`, kind)];
}

function mbSignalBadge(label, tone, title, kind = "signal") {
  return { label, tone, title: title || label, kind };
}

function mbEscapeAttr(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function mbSignalBadges(key, val, cell = {}, cells = {}) {
  const n = Number(val);
  if (!Number.isFinite(n) || !mbIsValidSnapshotValue(key, n)) return [];

  const rules = {
    mvrv: () => {
      if (n >= 3.5) return [mbSignalBadge("Overheated", "bear2", "MVRV ≥3.5× — price is far above aggregate holder cost; this band historically marked prior cycle tops.", "valuation"), mbSignalBadge("Bearish", "bear", "Distribution risk is elevated when most of the network sits in large unrealized profit.", "signal")];
      if (n >= 2) return [mbSignalBadge("Rich", "bear", "MVRV is elevated versus realized cap — holders broadly in profit above typical mid-cycle norms.", "valuation"), mbSignalBadge("Cautious", "warn", "Watch for profit-taking as spot pulls away from cost basis.", "signal")];
      if (n < 1) return [mbSignalBadge("Deep value", "bull2", "MVRV below 1× — spot trades under average on-chain cost basis.", "valuation"), mbSignalBadge("Bullish", "bull", "Historically favorable accumulation zone when the network is underwater on average.", "signal")];
      if (n < 1.5) return [mbSignalBadge("Fair", "neutral", "MVRV in a neutral 1–2× band — neither deeply discounted nor overheated.", "valuation")];
      return [mbSignalBadge("Neutral", "neutral", "Mid-cycle valuation band — price modestly above holder cost without extreme overheating.", "valuation")];
    },
    mvrv_z_score: () => {
      if (n >= 7) return [mbSignalBadge("Extreme top", "bear2", "≥7σ vs history", "valuation"), mbSignalBadge("Bearish", "bear", "Statistical overheating", "signal")];
      if (n >= 3) return [mbSignalBadge("Overheated", "bear", "Above historical norm", "valuation"), mbSignalBadge("Cautious", "warn", "Elevated z-score", "signal")];
      if (n <= -0.5) return [mbSignalBadge("Undervalued", "bull2", "Below mean — value zone", "valuation"), mbSignalBadge("Bullish", "bull", "Accumulation-friendly", "signal")];
      return [mbSignalBadge("Neutral", "neutral", "Within historical norm", "valuation")];
    },
    realized_price: () => {
      const mvrv = Number(cells.mvrv?.value);
      if (!Number.isFinite(mvrv)) return [mbSignalBadge("Cost basis", "info", "Compare spot to realized price", "structural")];
      if (mvrv < 1) return [mbSignalBadge("Below spot", "bull2", "Spot under aggregate cost basis", "valuation"), mbSignalBadge("Value zone", "bull", "Bear-market support area", "signal")];
      if (mvrv >= 2.5) return [mbSignalBadge("Above spot", "bear", "Network in large profit", "valuation"), mbSignalBadge("Rich", "warn", "Aggregate holders profitable", "signal")];
      return [mbSignalBadge("In profit", "neutral", "Spot above realized price", "valuation")];
    },
    hodl_waves_1y_plus: () => {
      if (n >= 65) return [mbSignalBadge("Strong HODL", "bull", "High 1y+ supply share", "structural"), mbSignalBadge("Low supply pressure", "bull", "Less short-term supply", "signal")];
      if (n <= 55) return [mbSignalBadge("Weak HODL", "warn", "More young supply active", "structural"), mbSignalBadge("Cautious", "warn", "Distribution risk rising", "signal")];
      return [mbSignalBadge("Moderate", "neutral", "Balanced holder ages", "structural")];
    },
    nupl: () => {
      if (n >= 0.75) return [mbSignalBadge("Euphoria", "bear2", "Extreme unrealized profit", "valuation"), mbSignalBadge("Bearish", "bear", "Top-risk psychology", "signal")];
      if (n >= 0.5) return [mbSignalBadge("Optimism", "warn", "Belief / optimism zone", "valuation"), mbSignalBadge("Cautious", "warn", "Profit-taking likely", "signal")];
      if (n <= 0) return [mbSignalBadge("Capitulation", "bull2", "Holders underwater on average", "valuation"), mbSignalBadge("Bullish", "bull", "Contrarian bottom zone", "signal")];
      return [mbSignalBadge("Hope", "neutral", "Recovery phase", "valuation")];
    },
    sopr: () => {
      if (n >= 1.05) return [mbSignalBadge("Profit-taking", "bear", "Coins moved at profit", "flow"), mbSignalBadge("Cautious", "warn", "SOPR above 1.05", "signal")];
      if (n < 1) return [mbSignalBadge("Loss selling", "bull2", "Capitulation moves", "flow"), mbSignalBadge("Bullish", "bull", "Washout signal", "signal")];
      return [mbSignalBadge("Breakeven", "neutral", "Near equilibrium (1.0)", "flow")];
    },
    asopr: () => {
      if (n >= 1.03) return [mbSignalBadge("Profit-taking", "bear", "Adjusted SOPR elevated", "flow"), mbSignalBadge("Cautious", "warn", "Cleaner profit signal", "signal")];
      if (n < 0.98) return [mbSignalBadge("Capitulation", "bull2", "Loss-driven moves", "flow"), mbSignalBadge("Bullish", "bull", "Seller exhaustion risk", "signal")];
      return [mbSignalBadge("Neutral", "neutral", "Near 1.0 equilibrium", "flow")];
    },
    supply_in_profit: () => {
      if (n >= 95) return [mbSignalBadge("Overheated", "bear2", "Nearly all supply in profit", "valuation"), mbSignalBadge("Bearish", "bear", "Distribution risk", "signal")];
      if (n <= 50) return [mbSignalBadge("Oversold", "bull2", "Majority underwater", "valuation"), mbSignalBadge("Bullish", "bull", "Stress / bottom zone", "signal")];
      return [mbSignalBadge("Mixed", "neutral", "Balanced profit/loss", "valuation")];
    },
    utxos_in_profit_pct: () => {
      if (n >= 90) return [mbSignalBadge("Broad profit", "bear", "Most UTXOs profitable", "valuation"), mbSignalBadge("Cautious", "warn", "Short-term top risk", "signal")];
      if (n <= 40) return [mbSignalBadge("Broad loss", "bull2", "UTXOs mostly underwater", "valuation"), mbSignalBadge("Bullish", "bull", "Capitulation breadth", "signal")];
      return [mbSignalBadge("Mixed", "neutral", "UTXO profit mix", "valuation")];
    },
    puell_multiple: () => {
      if (n >= 4) return [mbSignalBadge("Miner top", "bear2", "Revenue extreme vs 1y avg", "valuation"), mbSignalBadge("Bearish", "bear", "Cycle top risk", "signal")];
      if (n <= 0.5) return [mbSignalBadge("Miner bottom", "bull2", "Depressed miner income", "valuation"), mbSignalBadge("Bullish", "bull", "Historical bottom zone", "signal")];
      return [mbSignalBadge("Normal", "neutral", "Miner revenue in band", "valuation")];
    },
    sth_mvrv: () => {
      if (n >= 1.5) return [mbSignalBadge("STH rich", "bear", "Recent buyers in profit", "valuation"), mbSignalBadge("Cautious", "warn", "Near-term overheating", "signal")];
      if (n < 1) return [mbSignalBadge("STH underwater", "bull2", "Short-term holders at loss", "valuation"), mbSignalBadge("Bullish", "bull", "Local accumulation zone", "signal")];
      return [mbSignalBadge("STH fair", "neutral", "Recent buyer equilibrium", "valuation")];
    },
    lth_mvrv: () => {
      if (n >= 3) return [mbSignalBadge("LTH rich", "bear", "Seasoned holders very profitable", "valuation"), mbSignalBadge("Cautious", "warn", "Macro distribution risk", "signal")];
      if (n < 1) return [mbSignalBadge("LTH value", "bull2", "Long-term holders underwater", "valuation"), mbSignalBadge("Bullish", "bull", "Bear accumulation", "signal")];
      return [mbSignalBadge("LTH fair", "neutral", "Long-term holder norm", "valuation")];
    },
    sth_nupl: () => {
      if (n >= 0.6) return [mbSignalBadge("STH euphoria", "bear", "Recent buyers euphoric", "sentiment"), mbSignalBadge("Cautious", "warn", "Sell pressure risk", "signal")];
      if (n <= 0) return [mbSignalBadge("STH fear", "bull2", "Recent buyers capitulating", "sentiment"), mbSignalBadge("Bullish", "bull", "Local bottom signal", "signal")];
      return [mbSignalBadge("STH neutral", "neutral", "Short-term holder balance", "sentiment")];
    },
    lth_nupl: () => {
      if (n >= 0.7) return [mbSignalBadge("LTH euphoria", "bear", "Seasoned holders euphoric", "sentiment"), mbSignalBadge("Cautious", "warn", "Macro top psychology", "signal")];
      if (n <= 0) return [mbSignalBadge("LTH capitulation", "bull2", "Long-term holder stress", "sentiment"), mbSignalBadge("Bullish", "bull", "Cycle low psychology", "signal")];
      return [mbSignalBadge("LTH neutral", "neutral", "Long-term holder balance", "sentiment")];
    },
    vdd_multiple: () => {
      if (n >= 2.5) return [mbSignalBadge("Old coins moving", "bear2", "Elevated VDD vs yearly avg", "flow"), mbSignalBadge("Bearish", "bear", "Historical top marker", "signal")];
      if (n <= 0.5) return [mbSignalBadge("Quiet destruction", "bull", "Low old-coin movement", "flow"), mbSignalBadge("Bullish", "bull", "HODLing dominates", "signal")];
      return [mbSignalBadge("Normal VDD", "neutral", "Typical coin-days destroyed", "flow")];
    },
    fear_greed: () => {
      const zone = cell.classification || mbReadingFor(key, n);
      if (n >= 75) return [mbSignalBadge("Extreme greed", "bear2", zone, "sentiment"), mbSignalBadge("Cautious", "warn", "Euphoria risk", "signal")];
      if (n >= 56) return [mbSignalBadge("Greed", "warn", zone, "sentiment"), mbSignalBadge("Risk-on", "neutral", "Bullish sentiment", "signal")];
      if (n <= 24) return [mbSignalBadge("Extreme fear", "bull2", zone, "sentiment"), mbSignalBadge("Contrarian", "bull", "Capitulation zone", "signal")];
      if (n <= 44) return [mbSignalBadge("Fear", "bull", zone, "sentiment"), mbSignalBadge("Cautious market", "neutral", "Risk-off sentiment", "signal")];
      return [mbSignalBadge("Neutral", "neutral", zone || "Balanced sentiment", "sentiment")];
    },
    funding_rate: () => {
      if (n >= 0.05) return [mbSignalBadge("Crowded longs", "bear", "Elevated positive funding", "sentiment"), mbSignalBadge("Cautious", "warn", "Leverage flush risk", "signal")];
      if (n <= -0.01) return [mbSignalBadge("Short squeeze", "bull2", "Negative funding", "sentiment"), mbSignalBadge("Bullish", "bull", "Shorts pay longs", "signal")];
      if (n > 0.01) return [mbSignalBadge("Long bias", "warn", "Positive funding", "sentiment")];
      return [mbSignalBadge("Balanced", "neutral", "Funding near zero", "sentiment")];
    },
    btc_dominance: () => {
      if (n >= 55) return [mbSignalBadge("BTC leading", "bull", "Flight to BTC quality", "sentiment"), mbSignalBadge("Risk-off alts", "neutral", "Dominance rising", "signal")];
      if (n <= 45) return [mbSignalBadge("Alt season", "warn", "Alts gaining share", "sentiment"), mbSignalBadge("Risk-on", "neutral", "Dominance falling", "signal")];
      return [mbSignalBadge("Balanced", "neutral", "Neutral dominance", "sentiment")];
    },
    exchange_netflow: () => {
      if (n >= 5000) return [mbSignalBadge("Inflow", "bear", "Net deposits to exchanges", "flow"), mbSignalBadge("Bearish", "bear", "Sell pressure risk", "signal")];
      if (n <= -5000) return [mbSignalBadge("Outflow", "bull2", "Net withdrawals", "flow"), mbSignalBadge("Bullish", "bull", "Accumulation signal", "signal")];
      if (n > 0) return [mbSignalBadge("Mild inflow", "warn", "Net positive flow", "flow")];
      if (n < 0) return [mbSignalBadge("Mild outflow", "bull", "Net negative flow", "flow")];
      return [mbSignalBadge("Flat", "neutral", "Balanced exchange flow", "flow")];
    },
    etf_flow_btc: () => {
      if (n >= 1000) return [mbSignalBadge("Strong inflow", "bull2", "Heavy ETF buying", "flow"), mbSignalBadge("Bullish", "bull", "Institutional demand", "signal")];
      if (n <= -1000) return [mbSignalBadge("Heavy outflow", "bear2", "ETF redemptions", "flow"), mbSignalBadge("Bearish", "bear", "Institutional selling", "signal")];
      if (n > 0) return [mbSignalBadge("Inflow", "bull", "Net ETF buying", "flow")];
      if (n < 0) return [mbSignalBadge("Outflow", "bear", "Net ETF selling", "flow")];
      return [mbSignalBadge("Flat", "neutral", "Neutral ETF flow", "flow")];
    },
    mempool_fees: () => {
      if (n >= 50) return [mbSignalBadge("Congested", "warn", "High mempool demand", "network"), mbSignalBadge("Hot network", "neutral", "Urgent block space", "signal")];
      if (n <= 5) return [mbSignalBadge("Cheap fees", "bull", "Low congestion", "network"), mbSignalBadge("Quiet", "neutral", "Low block-space demand", "signal")];
      return [mbSignalBadge("Moderate", "neutral", "Normal fee environment", "network")];
    },
    thermo_price: () => {
      const mvrv = Number(cells.mvrv?.value);
      if (!Number.isFinite(mvrv)) return [mbSignalBadge("Production cost", "info", "Miner thermo price proxy", "structural")];
      const rp = Number(cells.realized_price?.value);
      const spot = Number.isFinite(rp) ? rp * mvrv : null;
      if (spot != null && spot < n * 0.9) return [mbSignalBadge("Below thermo", "bear", "Spot under production cost", "valuation"), mbSignalBadge("Miner stress", "warn", "Capitulation risk", "signal")];
      if (spot != null && spot > n * 1.5) return [mbSignalBadge("Above thermo", "bull", "Miners profitable", "valuation")];
      return [mbSignalBadge("Near thermo", "neutral", "Spot near production cost", "valuation")];
    },
    hashribbons: () => {
      if (n >= 1) return [mbSignalBadge("Recovery", "bull2", "Hash ribbon recovery", "signal"), mbSignalBadge("Bullish", "bull", "Miner recovery cross", "signal")];
      if (n <= -1) return [mbSignalBadge("Capitulation", "bear2", "Miner capitulation", "signal"), mbSignalBadge("Bearish", "bear", "Hash stress", "signal")];
      return [mbSignalBadge("Neutral", "neutral", "No ribbon signal", "signal")];
    },
    rich_top100_pct: () => (n >= 18
      ? [mbSignalBadge("High concentration", "warn", "Top-100 addresses hold an elevated share of supply — whale-heavy, but address-level data can overstate exchanges.", "structural"), mbSignalBadge("Cautious", "warn", "Rising concentration can mean fewer hands control liquid supply.", "signal")]
      : [mbSignalBadge("Moderate", "neutral", "Top-100 concentration is within a typical band — not extreme whale dominance by this metric.", "structural")]),
    rich_top1000_pct: () => (n >= 40
      ? [mbSignalBadge("High concentration", "warn", "Top-1,000 addresses control a large supply share — broader whale cohort than top-100 alone.", "structural"), mbSignalBadge("Cautious", "warn", "Entity-adjusted whale data would refine this reading.", "signal")]
      : [mbSignalBadge("Moderate", "neutral", "Top-1k concentration looks balanced — no extreme cohort dominance flagged.", "structural")]),
    wealth_top10_pct: () => (n >= 6
      ? [mbSignalBadge("Extreme top-10", "warn", "Top-10 addresses hold a very large share — often inflated by exchange cold wallets; interpret with caution.", "structural"), mbSignalBadge("Cautious", "warn", "Not entity-adjusted — exchange custody can skew whale counts.", "signal")]
      : [mbSignalBadge("Moderate", "neutral", "Top-10 concentration is not at an extreme — typical for address-level rich lists.", "structural")]),
    nrpl_usd: () => {
      if (n >= 5e9) return [mbSignalBadge("Realized profit", "bear", "Heavy profit taking", "flow"), mbSignalBadge("Distribution", "warn", "Large positive NRPL", "signal")];
      if (n <= -5e9) return [mbSignalBadge("Realized loss", "bull2", "Capitulation selling", "flow"), mbSignalBadge("Washout", "bull", "Large negative NRPL", "signal")];
      if (n > 0) return [mbSignalBadge("Net profit", "warn", "Positive realized P/L", "flow")];
      if (n < 0) return [mbSignalBadge("Net loss", "bull", "Negative realized P/L", "flow")];
      return [mbSignalBadge("Flat", "neutral", "Balanced realized P/L", "flow")];
    },
    active_addresses: () => mbTrendBadges(key, n),
    hash_rate: () => mbTrendBadges(key, n),
    hashrate_bg: () => mbTrendBadges(key, n),
    hashprice: () => mbTrendBadges(key, n),
    difficulty: () => mbTrendBadges(key, n),
    exchange_balance: () => mbTrendBadges(key, n),
    tx_count: () => mbTrendBadges(key, n),
    miners_revenue: () => mbTrendBadges(key, n),
    san_daily_active_addresses: () => mbTrendBadges(key, n),
    san_exchange_inflow: () => mbTrendBadges(key, n),
    san_exchange_outflow: () => mbTrendBadges(key, n),
    san_transaction_volume: () => mbTrendBadges(key, n),
    san_social_volume_total: () => mbTrendBadges(key, n),
    open_interest: () => {
      const trend = mbTrendBadges(key, n);
      if (trend.length) return trend;
      return [
        mbSignalBadge("Leverage", "info", "Binance BTCUSDT perp open interest — rising OI with price can signal leveraged trend strength; falling OI often means deleveraging.", "sentiment"),
        mbSignalBadge("Cross-check", "neutral", "Pair with funding rate and derivatives tab for full positioning context.", "signal"),
      ];
    },
    san_mvrv_usd: () => {
      if (n >= 3.5) return [mbSignalBadge("Overheated", "bear2", "Santiment MVRV ≥3.5× — network richly above cost basis; cross-check BGeometrics MVRV.", "valuation"), mbSignalBadge("Cautious", "warn", "Elevated Santiment valuation often precedes distribution.", "signal")];
      if (n >= 2) return [mbSignalBadge("Rich", "bear", "Santiment MVRV is elevated versus holder cost basis.", "valuation"), mbSignalBadge("Watch", "warn", "Compare with aggregate MVRV for confirmation.", "signal")];
      if (n < 1) return [mbSignalBadge("Deep value", "bull2", "Santiment MVRV below 1× — price under average on-chain cost.", "valuation"), mbSignalBadge("Bullish", "bull", "Historically favorable accumulation zone.", "signal")];
      return [mbSignalBadge("Fair", "neutral", "Santiment MVRV in a neutral 1–2× band versus realized cap.", "valuation")];
    },
    san_price_usd: () => {
      const trend = mbTrendBadges(key, n);
      if (trend.length) return trend;
      return [mbSignalBadge("Reference", "info", "Santiment daily BTC/USD reference — use alongside spot feeds for cross-check.", "structural")];
    },
  };

  if (rules[key]) {
    const badges = rules[key]().slice(0, MB_SIGNAL_BADGE_LIMIT);
    if (badges.length) return badges;
  }

  if (MB_TREND_BADGE_KEYS.has(key)) {
    const trend = mbTrendBadges(key, n);
    if (trend.length) return trend.slice(0, MB_SIGNAL_BADGE_LIMIT);
  }

  const reading = mbReadingFor(key, n);
  if (reading) {
    const lower = reading.toLowerCase();
    let tone = "neutral";
    if (/extreme|overheat|euphoria|top|bear|sell|distribution|crowded|outflow|fear.*risk|cautious/.test(lower)) tone = /extreme|euphoria|top/.test(lower) ? "bear2" : "bear";
    else if (/undervalu|accumulation|bottom|bull|inflow|contrarian|capitulation|deep value|fear/.test(lower)) tone = /deep|extreme fear|bottom|capitulation/.test(lower) ? "bull2" : "bull";
    else if (/elevated|watch|profit-taking|greed/.test(lower)) tone = "warn";
    return [mbSignalBadge(mbReadingBadgeLabel(reading), tone, `${reading}. Threshold-based read from catalog bands and metric rules.`, "signal")];
  }

  return [mbInfoSignalBadge(key, n)];
}

function mbSignalBadgesHtml(badges) {
  if (!badges?.length) {
    return '<span class="mb-signal-badges mb-signal-badges--na" title="No value available — signal badges appear once a reading is loaded">—</span>';
  }
  return `<span class="mb-signal-badges">${badges
    .map(
      (b) =>
        `<span class="mb-signal-badge mb-signal-badge--${b.tone} mb-signal-badge--kind-${b.kind}" title="${mbEscapeAttr(b.title)}">${b.label}</span>`,
    )
    .join("")}</span>`;
}

function mbSeriesPointMs(point) {
  const ts = Number(point?.timestamp);
  if (Number.isFinite(ts) && ts > 1e9) {
    return ts < 1e12 ? ts * 1000 : ts;
  }
  const date = point?.date;
  if (date) {
    const ms = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function mbFilterSeriesByTimespan(series, timespan) {
  const daysBySpan = {
    "30days": 30,
    "90days": 90,
    "1year": 365,
    "2years": 730,
    "4years": 1460,
    all: null,
  };
  const days = daysBySpan[timespan];
  if (!days || !series?.length) return series || [];
  const cutoffMs = Date.now() - days * 86400000;
  return series.filter((p) => {
    const ms = mbSeriesPointMs(p);
    return ms == null || ms >= cutoffMs;
  });
}

function mbFormatSeriesError(raw) {
  const msg = String(raw || "");
  if (/rate limit|429/i.test(msg)) {
    return "BGeometrics rate limit (8 req/hr on free tier) — cached data is used when available. Try again shortly or use the dedicated tab.";
  }
  if (/timed out|timeout/i.test(msg)) {
    return "Provider timed out — try Refresh or pick this metric on its dedicated tab.";
  }
  return msg || "try Refresh or check API limits";
}

function mbRenderChartDescription(indicator, containerId) {
  const descEl = mbEl(`mb-desc-${indicator}`)
    || mbEl(`mb-vm-desc-${indicator}`)
    || mbEl(containerId?.replace("mb-chart-", "mb-desc-"));
  if (!descEl) return;
  const info = mbChartInfo(indicator);
  const parts = [info.description, info.readings].filter(Boolean);
  descEl.textContent = parts.join(" ");
  descEl.title = info.readings || info.description || "";
}

function mbChartEducationContent(key) {
  return mbMeta?.chartEducation?.[key] || mbChartEducationFallback(key);
}

function mbChartEducationFallback(key) {
  const ind = mbIndicatorMeta(key);
  const help = ind.help ? window.getMetricHelp?.(ind.help) : null;
  const info = mbChartInfo(key);
  const explanation = [info.description, help?.body].filter(Boolean);
  if (!explanation.length && !info.readings) return null;
  return {
    explanation,
    howItWorks: info.readings || "",
    interpretation: (info.hoverBands || []).map((b) => ({
      zone: String(b.label || "").split("—")[0].trim(),
      meaning: String(b.label || "").split("—").slice(1).join("—").trim() || String(b.label || ""),
    })),
    history: [],
    limitations: [],
  };
}

const MB_CHART_EL_BY_KEY = {
  mvrv: "mb-chart-mvrv",
  mvrv_z_score: "mb-chart-mvrvz",
  realized_price: "mb-chart-realized",
  hodl_waves_1y_plus: "mb-chart-hodl",
  nupl: "mb-chart-nupl",
  sopr: "mb-chart-sopr",
  supply_in_profit: "mb-chart-supply-profit",
  active_addresses: "mb-chart-active",
  hash_rate: "mb-chart-hash",
  puell_multiple: "mb-chart-puell",
  exchange_netflow: "mb-chart-netflow",
  exchange_balance: "mb-chart-ex-balance",
  tx_count: "mb-chart-tx",
  sth_lth_mvrv: "mb-chart-sth-lth-mvrv",
  sth_lth_nupl: "mb-chart-sth-lth-nupl",
  asopr: "mb-chart-asopr",
  vdd_multiple: "mb-chart-vdd",
  nrpl_usd: "mb-chart-nrpl",
  utxos_in_profit_pct: "mb-chart-utxos-profit",
  san_exchange_inflow: "mb-chart-san-inflow",
  san_exchange_outflow: "mb-chart-san-outflow",
  san_daily_active_addresses: "mb-chart-san-active",
  puell_multiple_miner: "mb-chart-puell-miner",
  hashprice: "mb-chart-hashprice",
  hashrate_bg: "mb-chart-hashrate-bg",
  hashribbons: "mb-chart-hashribbons",
  difficulty: "mb-chart-difficulty",
  thermo_price: "mb-chart-thermo",
  miners_revenue: "mb-chart-miners-rev",
  btc_dominance: "mb-chart-dominance",
  etf_flow_btc: "mb-chart-etf",
  wealth_concentration: "mb-wealth-chart",
  wallet_cohorts: "mb-cohort-chart",
};

function mbEnsureChartEducationSlot(key) {
  const existing = mbEl(`mb-edu-${key}`);
  if (existing) return existing;
  const commentary = mbEl(`mb-commentary-${key}`) || mbEl(`mb-vm-commentary-${key}`);
  let block = commentary?.closest(".mb-chart-block");
  if (!block) {
    const chartId = MB_CHART_EL_BY_KEY[key];
    if (chartId) block = mbEl(chartId)?.closest(".mb-chart-block") || mbEl(chartId)?.closest(".panel");
  }
  if (!block) {
    block = mbEl(`mb-desc-${key}`)?.closest(".mb-chart-block") || mbEl(`mb-desc-${key}`)?.closest(".panel");
  }
  if (!block) return null;
  const edu = document.createElement("div");
  edu.id = `mb-edu-${key}`;
  edu.className = "mb-chart-education";
  const below = block.querySelector(`#mb-commentary-${key}, #mb-vm-commentary-${key}`);
  if (below?.closest(".mb-chart-copy")) {
    below.closest(".mb-chart-copy").after(edu);
  } else {
    block.appendChild(edu);
  }
  return edu;
}

function mbEducationDetailsHtml(content) {
  if (!content) return "";
  const explanation = (content.explanation || []).map((p) => `<p class="mb-vm-prose">${p}</p>`).join("");
  const formula = content.formula
    ? `<div class="mb-vm-formula"><code>${content.formula}</code></div>`
    : "";
  const howItWorks = content.howItWorks
    ? `<p class="mb-vm-prose">${content.howItWorks}</p>${formula}`
    : formula;
  const interpretation = content.interpretation || [];
  const interpTable = interpretation.length
    ? `<table class="deriv-table md-table mb-vm-zone-table"><thead><tr><th>Zone</th><th>Meaning</th></tr></thead><tbody>${
      interpretation.map((r) => `<tr><td>${r.zone}</td><td>${r.meaning}</td></tr>`).join("")
    }</tbody></table>`
    : "";
  const history = (content.history || []).map((h) => `<li>${h}</li>`).join("");
  const limitations = (content.limitations || []).map((l) => `<li>${l}</li>`).join("");
  const section = (title, body, open = false) => (body
    ? `<details class="mb-vm-details mb-chart-edu-details" ${open ? "open" : ""}>
      <summary class="mb-vm-details-summary">${title}</summary>
      <div class="mb-vm-details-body">${body}</div>
    </details>`
    : "");
  return [
    section("What this measures", explanation, true),
    section("How it works", howItWorks),
    section("How to read the zones", interpTable),
    section("Historical context", history ? `<ul class="mb-vm-bullets">${history}</ul>` : ""),
    section("Limitations & caveats", limitations ? `<ul class="mb-vm-bullets">${limitations}</ul>` : ""),
  ].filter(Boolean).join("");
}

function mbRenderChartEducation(key) {
  const el = mbEnsureChartEducationSlot(key) || mbEl(`mb-edu-${key}`);
  if (!el) return;
  const html = mbEducationDetailsHtml(mbChartEducationContent(key));
  if (html) {
    el.innerHTML = html;
    el.removeAttribute("hidden");
  }
}

function mbRenderAllChartEducation(keys) {
  (keys || []).forEach((k) => mbRenderChartEducation(k));
}

function mbBuildFrameworkChartCommentary(key, chartData) {
  const ctx = mbIntelSeriesContext(key, chartData);
  const label = mbIndicatorMeta(key).label;
  if (!ctx) {
    return [chartData?.error
      ? `${label}: data unavailable (${String(chartData.error).slice(0, 120)}).`
      : `${label}: waiting for series — try Refresh.`];
  }
  const { latest, fmt, reading, trend } = ctx;
  const info = mbChartInfo(key);
  const lines = [`${label} is ${mbFmtValue(latest, fmt)}${trend}.${reading ? ` ${reading}.` : ""}`];
  if (info.readings) {
    const first = info.readings.split(";")[0].trim();
    if (first) lines.push(first.endsWith(".") ? first : `${first}.`);
  }
  if (key === "stock_to_flow" || key === "stock_to_flow_cross") {
    const modelPrice = chartData?.latest?.model_price;
    const spot = chartData?.latest?.price;
    if (modelPrice != null && spot != null) {
      lines.push(
        `Spot $${Number(spot).toLocaleString("en-US", { maximumFractionDigits: 0 })} vs model-implied `
        + `$${Number(modelPrice).toLocaleString("en-US", { maximumFractionDigits: 0 })} `
        + `(${spot >= modelPrice ? "above" : "below"} scarcity-implied value).`,
      );
    }
  }
  if (key === "power_law") {
    const fair = chartData?.latest?.fair;
    if (fair != null) {
      lines.push(`Power-law fair value ≈ $${Number(fair).toLocaleString("en-US", { maximumFractionDigits: 0 })}.`);
    }
  }
  if (key === "pi_cycle_top") {
    lines.push(latest >= 1
      ? "Pi Cycle cross is active — historically a late-cycle top warning within weeks of prior peaks."
      : "No Pi Cycle cross — moving averages have not triggered the terminal signal.");
  }
  return lines.filter(Boolean);
}

const mbTabOutlookState = {
  valuation: null,
  onchain: null,
  miner: null,
};

function mbFrameworkChartEntries(vmBundle, models) {
  if (!vmBundle?.charts || !models?.length) return [];
  return models.map((model) => {
    const chartData = vmBundle.charts[model.id] || {};
    const latest = chartData?.latest?.value ?? chartData?.latest?.label ?? chartData?.latest;
    const forwardExtra = {
      spot: chartData?.latest?.price,
      modelPrice: chartData?.latest?.model_price,
      fair: chartData?.latest?.fair,
      band: chartData?.latest?.band,
      spotAbove: chartData?.latest?.price != null && chartData?.latest?.balanced != null
        && chartData.latest.price > chartData.latest.balanced,
    };
    return {
      label: model.title || mbIndicatorMeta(model.id).label,
      lines: mbBuildFrameworkChartCommentary(model.id, chartData),
      forwardOpts: { key: model.id, latest, extra: forwardExtra },
    };
  });
}

function mbRefreshTabOutlookAfterFrameworks(tab, vmBundle, models) {
  const extra = mbFrameworkChartEntries(vmBundle, models);
  if (tab === "valuation" && mbTabOutlookState.valuation) {
    mbRenderTabOutlook(
      "mb-valuation-outlook-head",
      "mb-valuation-commentary",
      mbBuildValuationOutlook(mbTabOutlookState.valuation, extra),
    );
  }
  if (tab === "onchain" && mbTabOutlookState.onchain) {
    const { charts, mempool } = mbTabOutlookState.onchain;
    mbRenderTabOutlook(
      "mb-onchain-outlook-head",
      "mb-onchain-commentary",
      mbBuildOnchainOutlook(charts, mempool, extra),
    );
  }
  if (tab === "miner" && mbTabOutlookState.miner) {
    mbRenderTabOutlook(
      "mb-miner-outlook-head",
      "mb-miner-commentary",
      mbBuildMinerOutlook(mbTabOutlookState.miner, extra),
    );
  }
}
window.mbRefreshTabOutlookAfterFrameworks = mbRefreshTabOutlookAfterFrameworks;

const MB_EDU_KEYS = [
  "mvrv", "mvrv_z_score", "realized_price", "hodl_waves_1y_plus", "nupl", "sopr", "supply_in_profit",
  "stock_to_flow", "stock_to_flow_cross", "power_law", "delta_balanced_price", "pi_cycle_top", "rainbow_chart",
  "active_addresses", "hash_rate", "puell_multiple", "exchange_netflow", "exchange_balance", "tx_count", "mempool_fees",
  "nvt_ratio", "metcalfe", "coin_days_destroyed",
  "sth_lth_mvrv", "sth_lth_nupl", "asopr", "vdd_multiple", "nrpl_usd", "utxos_in_profit_pct",
  "san_exchange_inflow", "san_exchange_outflow", "san_daily_active_addresses",
  "puell_multiple_miner", "hashprice", "hashrate_bg", "hashribbons", "difficulty", "thermo_price", "miners_revenue",
  "difficulty_ribbon",
  "fear_greed", "fear_greed_history", "btc_dominance", "etf_flow_btc", "market_structure",
  "wealth_concentration", "wallet_cohorts",
];

function mbInitChartEducationSlots() {
  MB_EDU_KEYS.forEach((key) => mbEnsureChartEducationSlot(key));
}

function mbBtcPriceForward(key, latest, extra = {}) {
  const n = Number(latest);
  if (!Number.isFinite(n) && key !== "mempool_fees" && key !== "market_structure") return "";
  switch (key) {
    case "mvrv":
      if (n >= 3.5) return "<strong>BTC price ahead:</strong> Extreme overvaluation vs cost basis — historically limits upside and raises drawdown risk until MVRV mean-reverts.";
      if (n >= 2) return "<strong>BTC price ahead:</strong> Rich vs holder cost — rallies need accelerating demand; upside may shorten without fresh liquidity.";
      if (n < 1) return "<strong>BTC price ahead:</strong> Below aggregate cost basis — historically a favorable zone for multi-month recovery once macro headwinds fade.";
      return "<strong>BTC price ahead:</strong> Neutral valuation band — price can trend with liquidity; watch MVRV 2× as a ceiling signal.";
    case "mvrv_z_score":
      if (n >= 7) return "<strong>BTC price ahead:</strong> Sigma extreme — prior cycle tops formed here; expect volatility and mean-reversion pressure on spot.";
      if (n >= 3) return "<strong>BTC price ahead:</strong> Statistically stretched — trend extension possible but asymmetric downside risk rises.";
      if (n <= -0.5) return "<strong>BTC price ahead:</strong> Below historical norm — conducive to accumulation-led rebounds over quarters.";
      return "<strong>BTC price ahead:</strong> No sigma extreme — price direction likely driven by flows and macro rather than valuation alone.";
    case "realized_price":
      return extra.spotBelow
        ? "<strong>BTC price ahead:</strong> Spot under realized price — bears often exhaust here; reclaiming cost basis is the first bullish repair milestone."
        : "<strong>BTC price ahead:</strong> Spot above realized price — network in profit; sustained upside requires demand to absorb incremental profit-taking.";
    case "hodl_waves_1y_plus":
      if (n >= 65) return "<strong>BTC price ahead:</strong> Strong HODL structure — less mobile old supply supports tighter float and sharper upside if demand returns.";
      if (n <= 55) return "<strong>BTC price ahead:</strong> Young supply active — more coins available to sell into rallies; choppier path higher.";
      return "<strong>BTC price ahead:</strong> Balanced holder age — no strong supply-lock or distribution signal from HODL waves alone.";
    case "nupl":
      if (n >= 0.75) return "<strong>BTC price ahead:</strong> Euphoria zone — cycle tops often form as unrealized gains peak; tighten risk on extended rallies.";
      if (n >= 0.5) return "<strong>BTC price ahead:</strong> Broad paper profits — profit-taking can cap rallies unless ETF/spot demand accelerates.";
      if (n <= 0) return "<strong>BTC price ahead:</strong> Capitulation psychology — historically where long-horizon entries have had the best asymmetry.";
      return "<strong>BTC price ahead:</strong> Recovery phase — NUPL rebuilding supports markup if liquidity and flows cooperate.";
    case "sopr":
      if (n >= 1.05) return "<strong>BTC price ahead:</strong> Profit-taking dominates — expect resistance on rips until SOPR cools toward 1.0.";
      if (n < 1) return "<strong>BTC price ahead:</strong> Loss-selling active — often marks late-stage selloffs; watch for seller exhaustion and basing.";
      return "<strong>BTC price ahead:</strong> Breakeven spending — neither aggressive distribution nor capitulation; trend can continue.";
    case "supply_in_profit":
      if (n >= 95) return "<strong>BTC price ahead:</strong> Nearly all supply profitable — distribution risk high; new highs need exceptional demand.";
      if (n <= 50) return "<strong>BTC price ahead:</strong> Majority underwater — historically aligned with bear-market floors and reversal setups.";
      return "<strong>BTC price ahead:</strong> Mixed profit breadth — no extreme cap on upside or floor on downside from this lens.";
    case "stock_to_flow":
    case "stock_to_flow_cross": {
      const spot = extra.spot;
      const model = extra.modelPrice;
      if (spot != null && model != null && spot < model * 0.7) {
        return "<strong>BTC price ahead:</strong> Spot trades well below scarcity-implied value — halving-driven scarcity thesis suggests upside if demand normalizes.";
      }
      if (spot != null && model != null && spot > model * 1.3) {
        return "<strong>BTC price ahead:</strong> Spot rich vs S2F model — scarcity premium stretched; mean-reversion or consolidation risk rises.";
      }
      return "<strong>BTC price ahead:</strong> Near scarcity-implied band — halving schedule supports medium-term scarcity bid if macro liquidity holds.";
    }
    case "power_law":
      if (n >= 1.5) return "<strong>BTC price ahead:</strong> Above power-law resistance — bubble territory; expect sharper corrections or sideways digestion.";
      if (n <= 0.5) return "<strong>BTC price ahead:</strong> Deep discount vs long-run trend — historically favorable for multi-year appreciation.";
      return "<strong>BTC price ahead:</strong> Within PLT corridor — trend continuation plausible without blow-off extremes.";
    case "pi_cycle_top":
      return n >= 1
        ? "<strong>BTC price ahead:</strong> Pi Cycle cross active — historically within weeks of cycle tops; upside time horizon likely short."
        : "<strong>BTC price ahead:</strong> No Pi cross — terminal top signal not fired; trend can extend but confirm with other overheating metrics.";
    case "delta_balanced_price":
      return extra.spotAbove
        ? "<strong>BTC price ahead:</strong> Spot extended above on-chain equilibrium — overheated vs fair value; pullbacks toward balanced price are common."
        : "<strong>BTC price ahead:</strong> Spot near or below equilibrium — less overhead from on-chain fair-value gravity.";
    case "rainbow_chart":
      if (extra.band >= 5) return "<strong>BTC price ahead:</strong> Maximum bubble band — historically preceded major drawdowns; risk-reward skews cautious.";
      if (extra.band <= 1) return "<strong>BTC price ahead:</strong> Lower rainbow bands — historically accumulation zones with strong long-run upside.";
      return "<strong>BTC price ahead:</strong> Mid-corridor — neither fire-sale nor euphoria; follow trend and liquidity.";
    case "nvt_ratio":
      if (n >= 120) return "<strong>BTC price ahead:</strong> Price rich vs on-chain utility — rallies may stall until volume catches up or price resets.";
      if (n <= 50) return "<strong>BTC price ahead:</strong> Cheap vs transfer activity — supportive for spot if usage persists.";
      return "<strong>BTC price ahead:</strong> Typical NVT — price can follow macro liquidity with moderate on-chain support.";
    case "metcalfe":
      if (n >= 2) return "<strong>BTC price ahead:</strong> Speculative premium vs network growth — vulnerable to corrections if addresses stall.";
      if (n <= 0.7) return "<strong>BTC price ahead:</strong> Price lags network expansion — catch-up rallies possible if adoption continues.";
      return "<strong>BTC price ahead:</strong> Near Metcalfe equilibrium — network growth and price are roughly aligned.";
    case "coin_days_destroyed":
      if (n >= 3e6) return "<strong>BTC price ahead:</strong> Old-coin movement elevated — seasoned holders distributing; near-term headwind for spot.";
      return "<strong>BTC price ahead:</strong> Quiet old-coin flows — less macro distribution pressure from seasoned supply.";
    case "difficulty_ribbon":
      return "<strong>BTC price ahead:</strong> Ribbon compression often precedes miner capitulation bottoms; expansion supports medium-term bullish repair.";
    case "active_addresses":
      if (extra.pct90 >= 5) return "<strong>BTC price ahead:</strong> Rising usage supports adoption-led demand — constructive for spot over quarters.";
      if (extra.pct90 <= -5) return "<strong>BTC price ahead:</strong> Cooling activity — softer organic demand; rallies rely more on financial flows.";
      return "<strong>BTC price ahead:</strong> Stable usage — price likely follows liquidity and positioning more than network activity.";
    case "hash_rate":
      if (extra.pct90 >= 3) return "<strong>BTC price ahead:</strong> Rising security investment — miners betting on higher future price; medium-term confidence signal.";
      if (extra.pct90 <= -3) return "<strong>BTC price ahead:</strong> Hash drawdown — often coincides with price stress; recovery can lag spot.";
      return "<strong>BTC price ahead:</strong> Stable hash rate — neutral security signal for price.";
    case "puell_multiple":
    case "puell_multiple_miner":
      if (n >= 4) return "<strong>BTC price ahead:</strong> Miner revenue extreme — historically near cycle tops; upside may be time-limited.";
      if (n <= 0.5) return "<strong>BTC price ahead:</strong> Depressed miner income — often marks bottoms; spot recovery frequently follows by months.";
      return "<strong>BTC price ahead:</strong> Normal Puell — miner economics neither cap nor floor price decisively.";
    case "exchange_netflow":
      if (n <= -5000) return "<strong>BTC price ahead:</strong> Heavy outflows — supply leaving venues tightens float; medium-term tailwind for spot.";
      if (n >= 5000) return "<strong>BTC price ahead:</strong> Heavy inflows — more sell-side liquidity on exchanges; near-term headwind.";
      return "<strong>BTC price ahead:</strong> Balanced flows — no strong inventory signal for direction.";
    case "exchange_balance":
      if (extra.pct90 >= 5) return "<strong>BTC price ahead:</strong> Rising exchange inventory — more liquid supply available to sell into strength.";
      if (extra.pct90 <= -5) return "<strong>BTC price ahead:</strong> Draining exchange balances — historically supportive for spot appreciation.";
      return "<strong>BTC price ahead:</strong> Exchange supply near average — neutral inventory pressure.";
    case "tx_count":
      if (extra.pct90 >= 5) return "<strong>BTC price ahead:</strong> Busier settlement layer — economic activity supports higher fair-value narratives.";
      return "<strong>BTC price ahead:</strong> Typical throughput — price driven by financial demand more than tx volume.";
    case "mempool_fees": {
      const fast = Number(extra.fast ?? latest);
      if (fast >= 50) return "<strong>BTC price ahead:</strong> High fee congestion — often coincides with on-chain mania; can mark local tops or volatile continuation.";
      if (fast <= 5) return "<strong>BTC price ahead:</strong> Cheap fees — quiet on-chain demand; spot moves may be led by off-chain/ETF flows.";
      return "<strong>BTC price ahead:</strong> Normal fees — no congestion signal for price direction.";
    }
    case "sth_lth_mvrv":
      return extra.sthElevated
        ? "<strong>BTC price ahead:</strong> Short-term holders richly in profit — near-term pullback risk even if long-term holders remain patient."
        : extra.sthUnderwater
          ? "<strong>BTC price ahead:</strong> Recent buyers underwater — rallies may face resistance until STHs break even."
          : "<strong>BTC price ahead:</strong> Cohort MVRV balanced — no acute short-term vs long-term valuation tension.";
    case "sth_lth_nupl":
      return extra.sthEuphoric
        ? "<strong>BTC price ahead:</strong> Short-term holder euphoria — fast money may take profits into strength."
        : "<strong>BTC price ahead:</strong> Cohort NUPL not extreme — psychology supports trend continuation.";
    case "asopr":
      if (n >= 1.03) return "<strong>BTC price ahead:</strong> Adjusted profit-taking — expect choppy upside until spending motives cool.";
      if (n < 0.98) return "<strong>BTC price ahead:</strong> Capitulation spending — seller exhaustion can set up medium-term reversals.";
      return "<strong>BTC price ahead:</strong> Orderly spending — trend can persist without aggressive distribution.";
    case "vdd_multiple":
      if (n >= 2.5) return "<strong>BTC price ahead:</strong> Old coins moving heavily — distribution risk; rallies need strong fresh demand.";
      if (n <= 0.5) return "<strong>BTC price ahead:</strong> Quiet coin-days destroyed — less seasoned-holder selling pressure ahead.";
      return "<strong>BTC price ahead:</strong> Typical VDD — no extreme old-coin distribution signal.";
    case "nrpl_usd":
      if (n >= 3e9) return "<strong>BTC price ahead:</strong> Large realized profits hitting the ledger — distribution day; upside may pause.";
      if (n <= -3e9) return "<strong>BTC price ahead:</strong> Realized losses at scale — capitulation often marks local bottoms.";
      return "<strong>BTC price ahead:</strong> Moderate realized P/L — no extreme daily distribution or capitulation.";
    case "utxos_in_profit_pct":
      if (n >= 90) return "<strong>BTC price ahead:</strong> Broad UTXO profitability — many holders can sell; overhead supply risk on rips.";
      if (n <= 40) return "<strong>BTC price ahead:</strong> Many UTXOs underwater — stress breadth consistent with accumulation zones.";
      return "<strong>BTC price ahead:</strong> Mixed UTXO profitability — no breadth extreme for price.";
    case "san_exchange_inflow":
      if (extra.pct90 >= 8) return "<strong>BTC price ahead:</strong> Elevated USD inflows to exchanges — near-term sell pressure risk on spot.";
      return "<strong>BTC price ahead:</strong> Inflows not extreme — limited exchange-deposit headwind.";
    case "san_exchange_outflow":
      if (extra.pct90 >= 8) return "<strong>BTC price ahead:</strong> Strong withdrawals — accumulation pattern; medium-term tailwind if sustained.";
      return "<strong>BTC price ahead:</strong> Outflows typical — neutral Santiment flow signal.";
    case "san_daily_active_addresses":
      if (extra.pct90 >= 5) return "<strong>BTC price ahead:</strong> Growing participation — adoption narrative can support higher prices over time.";
      return "<strong>BTC price ahead:</strong> Address activity stable — price likely follows financial flows.";
    case "hashprice":
      if (extra.pct90 <= -8) return "<strong>BTC price ahead:</strong> Weak miner revenue per hash — capitulation risk; bottoms often form as hashprice recovers.";
      return "<strong>BTC price ahead:</strong> Hashprice stable — neutral miner P&L signal for spot.";
    case "hashrate_bg":
      if (extra.pct90 >= 3) return "<strong>BTC price ahead:</strong> Expanding hash rate — miners pricing in higher future BTC; security confidence supportive.";
      if (extra.pct90 <= -3) return "<strong>BTC price ahead:</strong> Contracting hash rate — often lags price drops; recovery signals medium-term repair.";
      return "<strong>BTC price ahead:</strong> Stable hash rate — neutral for price outlook.";
    case "hashribbons":
      if (n >= 1) return "<strong>BTC price ahead:</strong> Ribbon recovery cross — historically bullish medium-term signal after miner capitulation.";
      if (n <= -1) return "<strong>BTC price ahead:</strong> Capitulation signal — miner stress often clusters near local price lows.";
      return "<strong>BTC price ahead:</strong> No ribbon extreme — miners in transition; no strong directional signal.";
    case "difficulty":
      if (extra.pct90 <= -4) return "<strong>BTC price ahead:</strong> Falling difficulty eases miner pain — often coincides with late bear phases and eventual basing.";
      return "<strong>BTC price ahead:</strong> Difficulty stable or rising — miners committed; neutral-to-supportive for medium-term price.";
    case "thermo_price":
      return extra.spotBelowThermo
        ? "<strong>BTC price ahead:</strong> Spot below thermo floor — miner margin stress; historically pressure resolves via price recovery or further hash drop."
        : "<strong>BTC price ahead:</strong> Spot above production-cost proxy — miners profitable; less forced-selling pressure from operations.";
    case "miners_revenue":
      if (extra.pct90 >= 20) return "<strong>BTC price ahead:</strong> Elevated miner revenue — check Puell; income extremes often coincide with cycle tops.";
      if (extra.pct90 <= -15) return "<strong>BTC price ahead:</strong> Depressed revenue — miner stress historically precedes spot bottoms.";
      return "<strong>BTC price ahead:</strong> Revenue in normal band — neutral miner-cycle signal for price.";
    case "fear_greed":
      if (n >= 75) return "<strong>BTC price ahead:</strong> Extreme greed — sentiment stretched; historically vulnerable to sharp corrections.";
      if (n <= 24) return "<strong>BTC price ahead:</strong> Extreme fear — contrarian setup; patient entries have historically outperformed over 6–12 months.";
      return "<strong>BTC price ahead:</strong> Neutral sentiment — price likely follows flows and macro more than crowd psychology.";
    case "fear_greed_history":
      return "<strong>BTC price ahead:</strong> Sustained fear clusters often mark accumulation windows; sustained greed clusters often precede stalls — watch persistence not single prints.";
    case "btc_dominance":
      if (n >= 55) return "<strong>BTC price ahead:</strong> BTC leading — flight-to-quality within crypto; alt outperformance less likely near term.";
      if (n <= 45) return "<strong>BTC price ahead:</strong> Alts gaining share — risk-on rotation; BTC can lag even in up markets.";
      return "<strong>BTC price ahead:</strong> Balanced dominance — BTC and alts may move together with macro.";
    case "etf_flow_btc":
      if (n >= 1000) return "<strong>BTC price ahead:</strong> Strong ETF inflows — institutional bid supports spot; outflow days are the risk to watch.";
      if (n <= -1000) return "<strong>BTC price ahead:</strong> Heavy ETF outflows — institutional headwind; spot needs retail/whale offset.";
      return "<strong>BTC price ahead:</strong> Modest ETF flows — not the primary driver of price near term.";
    case "market_structure": {
      const funding = extra.funding;
      if (funding != null && funding >= 0.04) return "<strong>BTC price ahead:</strong> Crowded longs — positive funding raises squeeze-down risk on spot.";
      if (funding != null && funding <= -0.01) return "<strong>BTC price ahead:</strong> Shorts paying longs — short-squeeze fuel if spot stabilizes.";
      return "<strong>BTC price ahead:</strong> Leverage not extreme — perp positioning is not the dominant price driver today.";
    }
    case "wealth_concentration":
      return "<strong>BTC price ahead:</strong> High whale concentration can amplify volatility on large-wallet moves — not a direct directional signal.";
    case "wallet_cohorts":
      return "<strong>BTC price ahead:</strong> Retail vs whale cohort shifts affect float — large-wallet accumulation is supportive; exchange-wallet growth is cautious.";
    default:
      return "";
  }
}

function mbSectionPriceForward(tab, phase, score) {
  const label = phase?.label || "Markup";
  const byTab = {
    valuation: {
      Accumulation: "<strong>BTC price outlook (valuation):</strong> Models point to asymmetric upside — spot near/below holder cost basis; multi-month recovery historically follows once capitulation exhausts.",
      Markup: "<strong>BTC price outlook (valuation):</strong> Constructive but not euphoric — trend can continue if liquidity holds; tighten risk if MVRV and NUPL push into overheated bands.",
      Distribution: "<strong>BTC price outlook (valuation):</strong> Rich vs cost basis with broad profits — upside likely needs exceptional demand; drawdown risk rises as holders harvest gains.",
      Capitulation: "<strong>BTC price outlook (valuation):</strong> Network underwater on average — historically one of the better risk/reward zones for long-horizon BTC exposure.",
    },
    onchain: {
      Accumulation: "<strong>BTC price outlook (on-chain):</strong> Coins leaving exchanges and inventory draining — medium-term tailwind for spot as float tightens.",
      Markup: "<strong>BTC price outlook (on-chain):</strong> Healthy network activity without flow extremes — supports continued price discovery in the trend direction.",
      Distribution: "<strong>BTC price outlook (on-chain):</strong> Exchange deposits and rising inventory — overhead liquid supply can cap rallies until absorbed.",
      Capitulation: "<strong>BTC price outlook (on-chain):</strong> Stress flows and depressed miner income — seller exhaustion often builds here before the next markup leg.",
    },
    intelligence: {
      Accumulation: "<strong>BTC price outlook (intelligence):</strong> Cohorts and flows favor absorption — smart-money patterns historically precede 3–12 month spot recoveries.",
      Markup: "<strong>BTC price outlook (intelligence):</strong> Constructive cohort metrics — trend extension likely unless distribution signals intensify.",
      Distribution: "<strong>BTC price outlook (intelligence):</strong> Seasoned supply and profit-taking active — expect choppy or capped upside until flows flip.",
      Capitulation: "<strong>BTC price outlook (intelligence):</strong> Loss-driven spending and stressed breadth — historically where medium-term bottoms form.",
    },
    miner: {
      Capitulation: "<strong>BTC price outlook (miners):</strong> Miner capitulation phases often mark local spot lows — hash recovery historically leads price repair.",
      Recovery: "<strong>BTC price outlook (miners):</strong> Miner healing underway — medium-term supportive backdrop for spot as security budget stabilizes.",
      Healthy: "<strong>BTC price outlook (miners):</strong> Sustainable miner economics — neither a floor nor a ceiling for price; follow valuation and flows.",
      Euphoria: "<strong>BTC price outlook (miners):</strong> Extreme miner income — historically clustered near cycle tops; upside time horizon may shorten.",
    },
    sentiment: {
      Accumulation: "<strong>BTC price outlook (sentiment):</strong> Fear with improving flows — classic contrarian setup; spot often repairs over quarters when greed is absent.",
      Markup: "<strong>BTC price outlook (sentiment):</strong> Balanced-to-positive tone without euphoria — risk-on but room for trend continuation.",
      Distribution: "<strong>BTC price outlook (sentiment):</strong> Greed and crowded positioning — sentiment stretch raises correction risk on spot.",
      Capitulation: "<strong>BTC price outlook (sentiment):</strong> Extreme fear — panic historically marks better forward returns for patient BTC holders.",
    },
  };
  const tabMap = byTab[tab] || byTab.valuation;
  return tabMap[label] || `<strong>BTC price outlook:</strong> ${phase?.blurb || "Mixed tab signals — combine with other tabs for a full forward view."}`;
}

window.mbChartInfo = mbChartInfo;
window.mbChartEducationContent = mbChartEducationContent;
window.mbEducationDetailsHtml = mbEducationDetailsHtml;
window.mbBtcPriceForward = mbBtcPriceForward;
window.mbBuildFrameworkChartCommentary = mbBuildFrameworkChartCommentary;
window.mbRenderChartEducation = mbRenderChartEducation;
window.mbRenderAllChartEducation = mbRenderAllChartEducation;

function mbParseApiError(text, status) {
  const raw = String(text || "").trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return String(parsed.error);
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 200) || `HTTP ${status}`;
}

async function mbFetchJson(path, force = false) {
  const [base, qs = ""] = path.split("?");
  const params = new URLSearchParams(qs);
  if (force) params.set("refresh", "1");
  const url = `/api/misc/btc/${base}?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(mbParseApiError(text, res.status));
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response");
  }
}

async function mbLoadMeta(force = false) {
  const swr = window.DashboardSWR;
  if (!swr) return null;
  mbMeta = await swr.runSWR({
    key: "misc:btc:meta:v13",
    l1: "misc",
    source: "BTC indicator catalog",
    persist: true,
    revalidate: force,
    updateHeader: false,
    fetch: () => mbFetchJson("meta", force),
    render: () => {},
  });
  return mbMeta;
}

async function mbLoadSnapshot(force = false) {
  const swr = window.DashboardSWR;
  if (!swr) return null;
  mbSnapshot = await swr.runSWR({
    key: "misc:btc:snapshot:v16",
    l1: "misc",
    source: mbSnapshot?.sourceChain || "Multi-source BTC feed",
    persist: true,
    revalidate: force,
    updateHeader: false,
    fetch: () => mbFetchJson("snapshot", force),
    render: () => {},
  });
  await Promise.all([
    mbPrefetchTableSeries(),
    mbLoadDistribution(false).catch(() => null),
  ]);
  mbRenderSnapshot();
  return mbSnapshot;
}

async function mbPrefetchTableSeries() {
  const indicators = mbMergedIndicators();
  const cells = mbSnapshot?.cells || {};
  const keys = new Set([
    ...MB_TREND_BADGE_KEYS,
    ...MB_SAN_SERIES_KEYS,
    ...MB_FRAMEWORK_SNAPSHOT_KEYS,
    ...Object.keys(MB_DISTRIBUTION_SNAPSHOT_KEYS),
    "funding_rate",
    "blockchair_stats",
  ]);
  ["sth_mvrv", "lth_mvrv", "sth_nupl", "lth_nupl", "vdd_multiple", "asopr", "nrpl_usd"].forEach((k) => keys.add(k));
  indicators
    .filter((ind) => ind.chartable && mbCellLatestValue(ind.key, cells[ind.key] || {}) == null)
    .slice(0, 24)
    .forEach((ind) => keys.add(ind.key));
  if (!keys.size) return;
  await Promise.all([
    ...[...keys].map(async (key) => {
      try {
        await mbLoadSeries(key, "1year", false);
      } catch {
        /* ignore */
      }
    }),
    ...["valuation", "onchain", "miner"].map(async (tab) => {
      try {
        await window.mbVmLoadTab?.(tab, false);
      } catch {
        /* ignore */
      }
    }),
  ]);
}

async function mbLoadDistribution(force = false) {
  const swr = window.DashboardSWR;
  if (!swr) return null;
  mbDistribution = await swr.runSWR({
    key: "misc:btc:distribution:v3",
    l1: "misc",
    source: "BitInfoCharts",
    persist: true,
    revalidate: force,
    updateHeader: false,
    fetch: () => mbFetchJson("distribution", force),
    render: () => mbRenderDistribution(),
  });
  mbRenderDistribution();
  if (mbSnapshot) mbRenderTable();
  return mbDistribution;
}

async function mbLoadSeries(indicator, timespan, force = false) {
  const cacheKey = `${indicator}:${timespan}`;
  if (!force && mbSeriesCache[cacheKey]) return mbSeriesCache[cacheKey];
  const data = await mbFetchJson(`series?indicator=${encodeURIComponent(indicator)}&timespan=${encodeURIComponent(timespan)}`, force);
  mbSeriesCache[cacheKey] = data;
  return data;
}

async function mbLoadFlowsBundle(timespan, force = false) {
  if (!force && mbFlowsBundle?.charts) return mbFlowsBundle;
  const data = await mbFetchJson(`flows?timespan=${encodeURIComponent(timespan)}`, force);
  mbFlowsBundle = data;
  for (const [key, chart] of Object.entries(data.charts || {})) {
    mbSeriesCache[`${key}:${timespan}`] = { indicator: key, ...chart };
  }
  return data;
}

async function mbLoadNetworkBundle(timespan, force = false) {
  if (!force && mbNetworkBundle?.charts) return mbNetworkBundle;
  const data = await mbFetchJson(`network?timespan=${encodeURIComponent(timespan)}`, force);
  mbNetworkBundle = data;
  for (const [key, chart] of Object.entries(data.charts || {})) {
    mbSeriesCache[`${key}:${timespan}`] = { indicator: key, ...chart };
  }
  return data;
}

async function mbLoadIntelligenceBundle(timespan, force = false) {
  if (!force && mbIntelligenceBundle?.timespan === timespan && mbIntelligenceBundle?.charts) {
    return mbIntelligenceBundle;
  }
  const data = await mbFetchJson(`intelligence?timespan=${encodeURIComponent(timespan)}`, force);
  mbIntelligenceBundle = { ...data, timespan };
  for (const [key, chart] of Object.entries(data.charts || {})) {
    mbSeriesCache[`${key}:${timespan}`] = { indicator: key, ...chart };
  }
  return mbIntelligenceBundle;
}

async function mbLoadMinerBundle(timespan, force = false) {
  if (!force && mbMinerBundle?.timespan === timespan && mbMinerBundle?.charts) {
    return mbMinerBundle;
  }
  const data = await mbFetchJson(`miner?timespan=${encodeURIComponent(timespan)}`, force);
  mbMinerBundle = { ...data, timespan };
  for (const [key, chart] of Object.entries(data.charts || {})) {
    mbSeriesCache[`${key}:${timespan}`] = { indicator: key, ...chart };
  }
  return mbMinerBundle;
}

async function mbLoadPrefetchStatus(force = false) {
  return mbFetchJson("prefetch/status", force);
}

async function mbLoadValuationBundle(timespan, force = false) {
  const cacheKey = `valuation:${timespan}`;
  if (!force && mbValuationBundle?.timespan === timespan && mbValuationBundle?.charts) {
    return mbValuationBundle;
  }
  const data = await mbFetchJson(`valuation?timespan=${encodeURIComponent(timespan)}`, force);
  mbValuationBundle = data;
  const charts = data.charts || {};
  for (const [key, chart] of Object.entries(charts)) {
    mbSeriesCache[`${key}:${timespan}`] = { indicator: key, ...chart };
  }
  return data;
}

function mbTabIndicators(tab) {
  const all = mbMergedIndicators();
  if (tab === "overview") {
    const chartable = all.filter((i) => i.chartable);
    return chartable.length ? chartable : all;
  }
  return all.filter((i) => i.tab === tab);
}

function mbPrepareChartEl(el) {
  if (!el) return;
  if (window.Plotly) {
    try {
      Plotly.purge(el);
    } catch {
      /* ignore */
    }
  }
  el.innerHTML = "";
}

function mbSetChartMessage(el, message) {
  if (!el) return;
  if (window.Plotly) {
    try {
      Plotly.purge(el);
    } catch {
      /* ignore */
    }
  }
  el.innerHTML = `<p class="misc-fng-empty">${message}</p>`;
}

function mbRenderKpis() {
  const el = mbEl("mb-kpis");
  const section = mbEl("mb-kpi-section");
  if (!el) return;
  if (mbActiveTab === "methodology") {
    section?.setAttribute("hidden", "");
    return;
  }
  section?.removeAttribute("hidden");

  const indicators = mbTabIndicators(mbActiveTab).slice(0, 6);
  const cells = mbSnapshot?.cells || {};
  el.innerHTML = indicators
    .map((ind) => {
      const cell = cells[ind.key] || {};
      const val = mbFmtValue(mbCellLatestValue(ind.key, cell), ind.format);
      const src = cell.source || ind.source;
      const hint = mbShortReading(ind.key);
      const helpAttr = ind.help ? ` data-help-key="${ind.help}"` : "";
      return `<article class="md-kpi-card" data-mb-kpi="${ind.key}" role="button" tabindex="0" title="${hint}">
        <span class="md-kpi-label"${helpAttr}>${ind.label}${ind.help ? '<button type="button" class="help-trigger help-trigger--inline" data-help-key="' + ind.help + '" aria-label="Explain ' + ind.label + '">?</button>' : ""}</span>
        <span class="md-kpi-value mono">${val}</span>
        <span class="md-kpi-hint">${mbReadingFor(ind.key, cell.value) || hint}</span>
        <span class="md-kpi-meta">${mbSourceBadge(src, cell)}</span>
      </article>`;
    })
    .join("");

  el.querySelectorAll("[data-mb-kpi]").forEach((card) => {
    const go = () => {
      mbState.indicator = card.dataset.mbKpi;
      mbSelectedIndicator = mbState.indicator;
      mbEl("mb-indicator") && (mbEl("mb-indicator").value = mbState.indicator);
      mbSaveSettings();
      if (mbActiveTab === "overview") mbRenderMainChart(true);
    };
    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
  window.decorateHelpLabels?.(mbEl("mb-kpi-section"));
}

function mbRenderHeroes() {
  const strip = mbEl("mb-heroes");
  if (!strip || !mbSnapshot?.cells) return;
  const cells = mbSnapshot.cells;
  const fng = cells.fear_greed;
  const mvrv = cells.mvrv;
  const dom = cells.btc_dominance;
  const blocks = [
    { label: "Fear & Greed", value: fng?.value, fmt: "score", sub: fng?.classification || "Sentiment", hint: mbReadingFor("fear_greed", fng?.value), cls: fng?.value >= 56 ? "positive" : fng?.value <= 44 ? "negative" : "" },
    { label: "MVRV", value: mvrv?.value, fmt: "ratio", sub: "Market vs realized cap", hint: mbReadingFor("mvrv", mvrv?.value) },
    { label: "BTC dominance", value: dom?.value, fmt: "pct", sub: "Global crypto mcap", hint: mbReadingFor("btc_dominance", dom?.value) },
    { label: "Hash rate", value: mbCellLatestValue("hash_rate", cells.hash_rate || {}), fmt: "hashrate", sub: "Network security", hint: mbShortReading("hash_rate") },
  ];
  strip.innerHTML = blocks
    .map(
      (b) => `<div class="deriv-hero-block" title="${b.hint || b.sub}">
      <span class="deriv-hero-label">${b.label}</span>
      <span class="deriv-hero-value mono ${b.cls || ""}">${mbFmtValue(b.value, b.fmt)}</span>
      <span class="deriv-hero-sub">${b.sub}</span>
    </div>`,
    )
    .join("");
}

function mbSortIndicators(indicators) {
  return [...indicators].sort((a, b) => {
    const ta = MB_TAB_ORDER[a.tab] ?? 99;
    const tb = MB_TAB_ORDER[b.tab] ?? 99;
    if (ta !== tb) return ta - tb;
    return a.label.localeCompare(b.label);
  });
}

function mbFormatElapsed(fetchedAt) {
  if (!fetchedAt) return "";
  const d = new Date(fetchedAt);
  if (Number.isNaN(d.getTime())) return "";
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return `${Math.floor(sec / 604800)}w ago`;
}

function mbFormatUpdatedHtml(fetchedAt) {
  if (!fetchedAt) return "—";
  const d = new Date(fetchedAt);
  if (Number.isNaN(d.getTime())) return "—";
  const abs = d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const rel = mbFormatElapsed(fetchedAt);
  return `<span class="mb-updated-abs">${abs}</span><span class="mb-updated-elapsed">${rel}</span>`;
}

function mbCombinedValueHtml(spec, cells) {
  return spec.keys
    .map((k, i) => {
      const v = mbCellLatestValue(k, cells[k] || {});
      const tag = i === 0 ? "STH" : "LTH";
      return `<span class="mb-combined-val"><span class="mb-combined-tag">${tag}</span><span class="mb-combined-num">${mbFmtValue(v, spec.format)}</span></span>`;
    })
    .join("");
}

function mbCacheTabCyclePhase(tabKey, cyclePhase) {
  if (!tabKey || !cyclePhase?.label) return;
  mbTabCyclePhases[tabKey] = cyclePhase;
}

function mbRefreshTabCyclePhasesFromContext(ctx) {
  if (!ctx) return;
  mbCacheTabCyclePhase("valuation", mbDetectValuationPhase(ctx.valuation?.charts || {}));
  mbCacheTabCyclePhase("intelligence", mbDetectCyclePhase(ctx.intelligence));
  mbCacheTabCyclePhase("onchain", mbDetectOnchainPhase(ctx.onchainCharts, ctx.mempool));
  mbCacheTabCyclePhase("sentiment", mbDetectSentimentPhase(ctx.sentimentCtx));
  mbCacheTabCyclePhase("miner", mbDetectMinerPhase(ctx.miner));
}

function mbTableSectionPhaseHtml(phaseInfo) {
  if (!phaseInfo?.label) return "";
  const confLabel = phaseInfo.confidence === "high"
    ? "High confidence"
    : phaseInfo.confidence === "moderate"
      ? "Moderate confidence"
      : "Low confidence";
  return `<span class="mb-table-section-phase" title="${mbEscapeAttr(phaseInfo.blurb || "")}">
    <span class="mb-cycle-phase-badge mb-cycle-phase-badge--${phaseInfo.tone}">${phaseInfo.label}</span>
    <span class="mb-table-section-conf">${confLabel}</span>
  </span>`;
}

function mbRefreshTableSectionBadges() {
  if (!mbEl("mb-table-body")) return;
  mbRenderTable();
}

function mbTableRowHtml(row, cells) {
  if (row.kind === "section") {
    const phase = row.sectionKey ? mbTabCyclePhases[row.sectionKey] : null;
    const badge = phase ? mbTableSectionPhaseHtml(phase) : "";
    return `<tr class="mb-table-section" data-mb-section="${row.sectionKey || ""}">
      <td colspan="5">
        <div class="mb-table-section-inner">
          <span class="mb-table-section-label">${row.label}</span>
          ${badge}
        </div>
      </td>
    </tr>`;
  }
  if (row.kind === "combined") {
    const spec = row.spec;
    const vals = spec.keys.map((k) => mbCellLatestValue(k, cells[k] || {}));
    const badges = mbCombinedSignalBadges(spec, cells);
    const badgeTitle = badges.map((b) => b.title).join(" · ");
    const times = spec.keys.map((k) => cells[k]?.fetchedAt).filter(Boolean);
    const latestFetched = times.length ? times.sort().reverse()[0] : null;
    const hint = mbCombinedRowTooltip(spec, vals);
    const helpKey = spec.key === "sth_lth_mvrv" ? "mb-sth-mvrv" : spec.key === "sth_lth_nupl" ? "mb-sth-nupl" : "";
    return `<tr data-mb-row="${spec.key}" data-mb-nav-tab="${spec.navigateTab}" class="mb-table-row mb-table-row--combined" tabindex="0" title="${mbEscapeAttr(hint)}">
      <td class="mb-col-indicator"${helpKey ? ` data-help-key="${helpKey}"` : ""}>${spec.label}${helpKey ? '<button type="button" class="help-trigger help-trigger--inline" data-help-key="' + helpKey + '" aria-label="Explain">?</button>' : ""}</td>
      <td class="mono mb-col-value mb-col-value--combined">${mbCombinedValueHtml(spec, cells)}</td>
      <td class="mb-signal-col mb-col-signal" title="${mbEscapeAttr(badgeTitle)}">${mbSignalBadgesHtml(badges)}</td>
      <td class="mb-col-source">${mbSourceBadge(spec.source)}</td>
      <td class="macro-muted mb-col-updated">${mbFormatUpdatedHtml(latestFetched)}</td>
    </tr>`;
  }

  const ind = row.ind;
  const cell = cells[ind.key] || {};
  const latest = mbCellLatestValue(ind.key, cell);
  const rawCell = Number(cell.value);
  const cellUsable = cell.value != null && mbIsValidSnapshotValue(ind.key, rawCell);
  const fromCache = latest != null && (
    !cellUsable
    || (ind.key === "hash_rate" && Number.isFinite(rawCell) && rawCell > 0 && rawCell < 50)
    || (MB_TREND_BADGE_KEYS.has(ind.key) && mbSeriesLatestFromCache(ind.key) != null)
    || MB_FRAMEWORK_SNAPSHOT_KEYS.includes(ind.key)
    || MB_DISTRIBUTION_SNAPSHOT_KEYS[ind.key]
  );
  const updated = mbFormatUpdatedHtml(cell.fetchedAt);
  const hint = mbRowTooltip(ind.key, latest);
  const badges = mbSignalBadges(ind.key, latest, cell, cells);
  const badgeTitle = badges.map((b) => b.title).join(" · ");
  const helpAttr = ind.help ? ` data-help-key="${ind.help}"` : "";
  const valueTitle = fromCache ? "Latest from chart series cache" : hint;
  return `<tr data-mb-row="${ind.key}" class="mb-table-row" tabindex="0" title="${mbEscapeAttr(hint)}">
    <td class="mb-col-indicator"${helpAttr} title="${mbEscapeAttr(hint)}">${ind.label}${ind.help ? '<button type="button" class="help-trigger help-trigger--inline" data-help-key="' + ind.help + '" aria-label="Explain">?</button>' : ""}</td>
    <td class="mono mb-col-value${fromCache ? " mb-table-value--cached" : ""}" title="${mbEscapeAttr(valueTitle)}">${mbFmtValue(latest, ind.format)}</td>
    <td class="mb-signal-col mb-col-signal" title="${mbEscapeAttr(badgeTitle)}">${mbSignalBadgesHtml(badges)}</td>
    <td class="mb-col-source">${mbSourceBadge(cell.source || ind.source, cell)}</td>
    <td class="macro-muted mb-col-updated">${updated}</td>
  </tr>`;
}

function mbSnapshotTableRows(indicators) {
  const sorted = mbSortIndicators(indicators);
  const byTab = new Map();
  for (const ind of sorted) {
    if (MB_COMBINED_HIDE_KEYS.has(ind.key)) continue;
    const tab = ind.tab || "overview";
    if (!byTab.has(tab)) byTab.set(tab, []);
    byTab.get(tab).push(ind);
  }
  const rows = [];
  for (const section of MB_TABLE_SECTIONS) {
    const tabRows = byTab.get(section.key);
    const combined = MB_TABLE_COMBINED_ROWS.filter((r) => r.tab === section.key);
    if (!tabRows?.length && !combined.length) continue;
    rows.push({ kind: "section", label: section.label, sectionKey: section.key });
    for (const spec of combined) rows.push({ kind: "combined", spec });
    for (const ind of tabRows || []) rows.push({ kind: "indicator", ind });
  }
  return rows;
}

function mbRenderTable() {
  const body = mbEl("mb-table-body");
  if (!body) return;
  const indicators = mbMergedIndicators();
  const cells = mbSnapshot?.cells || {};
  if (!indicators.length) {
    body.innerHTML = '<tr><td colspan="5">Loading…</td></tr>';
    return;
  }
  const rows = mbSnapshotTableRows(indicators);
  body.innerHTML = rows.map((row) => mbTableRowHtml(row, cells)).join("");

  body.querySelectorAll("[data-mb-row]").forEach((row) => {
    const go = () => {
      const key = row.dataset.mbRow;
      const navTab = row.dataset.mbNavTab;
      if (navTab) {
        mbSetTab(navTab);
        return;
      }
      const chartable = mbMergedIndicators().find((i) => i.key === key);
      if (chartable && chartable.chartable === false) {
        const tabBtn = document.querySelector(`.mb-subtab[data-mb-sub="${chartable.tab}"]`);
        if (tabBtn) {
          mbSetTab(chartable.tab);
          return;
        }
      }
      mbState.indicator = key;
      mbSelectedIndicator = mbState.indicator;
      const sel = mbEl("mb-indicator");
      if (sel) sel.value = mbState.indicator;
      mbSaveSettings();
      if (mbActiveTab === "overview") mbRenderMainChart(true);
    };
    row.addEventListener("click", go);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
  window.decorateHelpLabels?.(mbEl("mb-table-body")?.closest(".panel"));
}

function mbRenderSnapshot() {
  if (!mbSnapshot) return;
  const meta = mbEl("mb-update");
  if (meta) {
    meta.textContent = window.DashboardSWR?.formatPanelMeta({
      source: mbSnapshot.sourceChain,
      fetchedAt: mbSnapshot.fetchedAt,
    }) || mbSnapshot.sourceChain;
  }
  const stats = mbEl("mb-stats");
  if (stats) {
    const errCount = (mbSnapshot.errors || []).length;
    const indCount = mbMergedIndicators().length;
    const filled = Object.values(mbSnapshot.cells || {}).filter((c) => c?.value != null).length;
    stats.textContent = errCount
      ? `${filled}/${indCount} indicators live · free APIs only · ${errCount} warning(s)`
      : `${indCount} indicators · free APIs · BGeometrics cached 24h`;
    stats.classList.toggle("md-stats--warn", errCount > 0);
  }
  mbRenderKpis();
  mbRenderHeroes();
  mbRenderTable();
}

function mbSeriesToPlotly(series, color = "#f59e0b", indicator = "", opts = {}) {
  const ind = mbIndicatorMeta(indicator);
  const info = mbChartInfo(indicator);
  const pts = (series || [])
    .map((p) => ({ p, ms: mbSeriesPointMs(p) }))
    .filter(({ p, ms }) => p.value != null && Number.isFinite(Number(p.value)) && ms != null);
  if (!pts.length) return null;
  const x = pts.map(({ ms }) => new Date(ms));
  const y = pts.map(({ p }) => Number(p.value));
  const customdata = pts.map(({ p }) => {
    const val = Number(p.value);
    return [
      mbFmtValue(val, ind.format),
      mbReadingFor(indicator, val),
      opts.source || info.source || ind.source || "",
      opts.stale ? " · cached" : "",
    ];
  });
  const title = info.title || ind.label || indicator;
  return {
    x,
    y,
    customdata,
    type: "scatter",
    mode: "lines",
    line: { color, width: 2 },
    fill: opts.fill === false ? undefined : "tozeroy",
    fillcolor: opts.fill === false ? undefined : `${color}22`,
    hovertemplate:
      `<b>${title}</b><br>` +
      "Value: %{customdata[0]}<br>" +
      "Date: %{x|%b %d, %Y}<br>" +
      "%{customdata[1]}<br>" +
      "<span style='font-size:10px;color:#94a3b8'>Source: %{customdata[2]}%{customdata[3]}</span>" +
      "<extra></extra>",
  };
}

function mbMinerPhaseForOverview(minerPhase) {
  const canonical = {
    capitulation: "capitulation",
    recovery: "accumulation",
    healthy: "markup",
    euphoria: "distribution",
  };
  const phase = canonical[minerPhase?.phase] || "markup";
  return { ...minerPhase, canonicalPhase: phase };
}

function mbAggregateOverviewCyclePhase(sections) {
  const scores = { accumulation: 0, markup: 0, distribution: 0, capitulation: 0 };
  const confWeight = { high: 3, moderate: 2, low: 1 };
  for (const s of sections) {
    const phase = s.canonicalPhase || s.cyclePhase?.phase;
    if (!phase || scores[phase] == null) continue;
    scores[phase] += confWeight[s.cyclePhase?.confidence] || 1;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topPhase, topScore] = ranked[0];
  const [, secondScore] = ranked[1] || ["", 0];
  const phase = topScore > 0 && topScore >= secondScore ? topPhase : "markup";
  const copy = {
    accumulation: {
      label: "Accumulation",
      tone: "accumulation",
      blurb: "Cross-tab signals lean toward smart-money absorption, constructive flows, and fear without euphoria — a basing / early-markup environment where patient positioning has historically been rewarded.",
    },
    markup: {
      label: "Markup",
      tone: "markup",
      blurb: "Most tabs show constructive trend metrics without blow-off extremes — healthy price discovery with manageable profit-taking and no single lens at a terminal top signal.",
    },
    distribution: {
      label: "Distribution",
      tone: "distribution",
      blurb: "Valuation richness, cohort profit-taking, miner-income extremes, and sentiment stretch cluster toward late-cycle characteristics — overhead supply risk rises into strength.",
    },
    capitulation: {
      label: "Capitulation",
      tone: "capitulation",
      blurb: "Loss-driven spending, extreme fear, miner stress, and stressed breadth dominate — historically where medium-term bottoms form after seller exhaustion.",
    },
  };
  const meta = copy[phase] || copy.markup;
  const conf = topScore >= 10 ? "high" : topScore >= 6 ? "moderate" : "low";
  return { phase, label: meta.label, tone: meta.tone, blurb: meta.blurb, confidence: conf, scores };
}

function mbOverviewPriceForward(aggregatePhase, sections) {
  const netScore = sections.reduce((sum, s) => sum + (s.outlook?.score || 0), 0);
  const byPhase = {
    accumulation:
      "<strong>BTC price outlook (executive):</strong> Cross-tab evidence favors asymmetric upside over 3–12 months — spot is in a historically favorable accumulation zone once macro liquidity stabilizes; forced selling often exhausts here before the next markup leg.",
    markup:
      "<strong>BTC price outlook (executive):</strong> Trend can extend if ETF inflows and on-chain absorption hold — tighten risk if valuation, cohort profit-taking, and greed align simultaneously.",
    distribution:
      "<strong>BTC price outlook (executive):</strong> Multiple tabs flag late-cycle risk — rallies need exceptional demand to absorb supply; drawdown risk rises as holders, miners, and sentiment stretch together.",
    capitulation:
      "<strong>BTC price outlook (executive):</strong> Stress across valuation, cohorts, miners, and sentiment historically marks better forward risk/reward for multi-quarter BTC exposure — watch for flow repair and valuation mean-reversion as confirmation.",
  };
  let line = byPhase[aggregatePhase.phase] || byPhase.markup;
  if (netScore >= 6) line += " Net tab scores are constructive.";
  else if (netScore <= -6) line += " Net tab scores are cautious.";
  else line += " Tab scores are mixed — macro liquidity and ETF flows remain the swing factors.";
  return line;
}

function mbOverviewSectionBullet(section) {
  const phase = section.cyclePhase;
  const forward = mbSectionPriceForward(section.tab, phase, section.outlook?.score || 0);
  const forwardText = mbStripHtml(forward).replace(/^BTC price outlook \([^)]+\):\s*/i, "");
  return `<strong>${section.name} — ${phase.label}</strong> (${phase.confidence} confidence): ${forwardText}`;
}

async function mbLoadOverviewContext(force = false) {
  const timespan = mbState.timespan;
  const cells = mbSnapshot?.cells || {};
  const mfCell = cells.mempool_fees;
  const mempoolFallback = mfCell
    ? {
        value: mfCell.value,
        fast_fee: mfCell.fastFee,
        hour_fee: mfCell.hourFee,
        economy_fee: mfCell.economyFee,
        mempool_count: mfCell.mempoolCount,
      }
    : null;

  try {
    await window.loadMiscGreedFear?.(force);
  } catch {
    /* F&G optional for overview synthesis */
  }

  const [
    valuation,
    intelligence,
    miner,
    flows,
    network,
    domData,
    addrData,
    hashData,
    puellData,
  ] = await Promise.all([
    mbLoadValuationBundle(timespan, force),
    mbLoadIntelligenceBundle(timespan, force),
    mbLoadMinerBundle(timespan, force),
    mbLoadFlowsBundle(timespan, force),
    mbLoadNetworkBundle(timespan, force),
    mbLoadSeries("btc_dominance", timespan, force).catch(() => null),
    mbLoadSeries("active_addresses", timespan, force).catch(() => null),
    mbLoadSeries("hash_rate", timespan, force).catch(() => null),
    mbLoadSeries("puell_multiple", timespan, force).catch(() => null),
  ]);

  const onchainCharts = {
    exchange_netflow: flows.charts?.exchange_netflow,
    exchange_balance: flows.charts?.exchange_balance,
    tx_count: network.charts?.tx_count,
    active_addresses: addrData,
    hash_rate: hashData,
    puell_multiple: puellData,
  };
  const mempool = network.mempool || mempoolFallback;
  const fngData = window.mbGetFngData?.();
  const sentimentCtx = {
    charts: {
      btc_dominance: domData,
      etf_flow_btc: flows.charts?.etf_flow_btc,
    },
    fngVal: fngData?.latest?.value ?? cells.fear_greed?.value,
    funding: cells.funding_rate?.value != null ? Number(cells.funding_rate.value) : null,
    oi: cells.open_interest?.value != null ? Number(cells.open_interest.value) : null,
  };

  return { valuation, intelligence, miner, onchainCharts, mempool, sentimentCtx };
}

function mbBuildOverviewExecutiveSummary(ctx) {
  const valuationPhase = mbDetectValuationPhase(ctx.valuation?.charts || {});
  const onchainPhase = mbDetectOnchainPhase(ctx.onchainCharts, ctx.mempool);
  const intelligencePhase = mbDetectCyclePhase(ctx.intelligence);
  const minerPhaseRaw = mbDetectMinerPhase(ctx.miner);
  const minerPhase = mbMinerPhaseForOverview(minerPhaseRaw);
  const sentimentPhase = mbDetectSentimentPhase(ctx.sentimentCtx);

  const valuationOutlook = mbBuildValuationOutlook(ctx.valuation);
  const onchainOutlook = mbBuildOnchainOutlook(ctx.onchainCharts, ctx.mempool);
  const intelligenceOutlook = mbBuildIntelligenceOutlook(ctx.intelligence);
  const minerOutlook = mbBuildMinerOutlook(ctx.miner);
  const sentimentOutlook = mbBuildSentimentOutlook(ctx.sentimentCtx);

  const sections = [
    {
      name: "Valuation & Cycles",
      tab: "valuation",
      cyclePhase: valuationPhase,
      canonicalPhase: valuationPhase.phase,
      outlook: valuationOutlook,
    },
    {
      name: "On-Chain Activity",
      tab: "onchain",
      cyclePhase: onchainPhase,
      canonicalPhase: onchainPhase.phase,
      outlook: onchainOutlook,
    },
    {
      name: "On-Chain Intelligence",
      tab: "intelligence",
      cyclePhase: intelligencePhase,
      canonicalPhase: intelligencePhase.phase,
      outlook: intelligenceOutlook,
    },
    {
      name: "Miner & Network",
      tab: "miner",
      cyclePhase: minerPhaseRaw,
      canonicalPhase: minerPhase.canonicalPhase,
      outlook: minerOutlook,
    },
    {
      name: "Sentiment & Market",
      tab: "sentiment",
      cyclePhase: sentimentPhase,
      canonicalPhase: sentimentPhase.phase,
      outlook: sentimentOutlook,
    },
  ];

  const aggregatePhase = mbAggregateOverviewCyclePhase(sections);
  const constructiveTabs = sections.filter((s) => (s.outlook?.score || 0) >= 2).length;
  const cautiousTabs = sections.filter((s) => (s.outlook?.score || 0) <= -2).length;

  const lines = [
    "This executive summary aggregates the cycle-phase estimates and forward conclusions from all five analytical tabs below. "
    + "It is designed as a single read on where BTC sits in the accumulation → markup → distribution → capitulation cycle.",
    `<strong>Where we are in the cycle:</strong> ${aggregatePhase.blurb}`,
    "Section consensus — each row mirrors that tab's bottom-panel conclusion:",
    ...sections.map((s) => mbOverviewSectionBullet(s)),
    `Tab score tilt: ${constructiveTabs} of ${sections.length} tabs lean constructive (score ≥ +2), ${cautiousTabs} cautious (score ≤ −2).`,
    mbOverviewPriceForward(aggregatePhase, sections),
    `Automated synthesis from BGeometrics, Blockchain.info, Coin Metrics, Santiment, and Alternative.me — educational only. Timespan: ${mbState.timespan}.`,
  ];

  return { lines, cyclePhase: aggregatePhase, sections };
}

async function mbRenderOverviewExecutiveSummary(force = false) {
  if (mbActiveTab !== "overview") return;
  const headEl = mbEl("mb-overview-outlook-head");
  const commEl = mbEl("mb-overview-commentary");
  if (!commEl) return;

  const requestId = ++mbOverviewSummaryRequest;
  if (headEl) headEl.innerHTML = "";
  commEl.innerHTML = "<p class=\"macro-muted\">Building executive summary from all tabs…</p>";

  try {
    const ctx = await mbLoadOverviewContext(force);
    if (requestId !== mbOverviewSummaryRequest) return;
    mbRefreshTabCyclePhasesFromContext(ctx);
    const summary = mbBuildOverviewExecutiveSummary(ctx);
    if (requestId !== mbOverviewSummaryRequest) return;
    if (headEl) headEl.innerHTML = mbCyclePhaseBadgeHtml(summary.cyclePhase);
    mbRenderCommentaryEl("mb-overview-commentary", summary.lines);
    mbRefreshTableSectionBadges();
  } catch (err) {
    if (requestId !== mbOverviewSummaryRequest) return;
    if (headEl) headEl.innerHTML = "";
    mbRenderCommentaryEl("mb-overview-commentary", [
      `Executive summary unavailable — ${err.message || "error"}. Press Refresh or open each tab to load data.`,
    ]);
  }
}

async function mbRenderMainChart(force = false) {
  if (mbActiveTab !== "overview") return;

  const el = mbEl("mb-main-chart");
  const titleEl = mbEl("mb-chart-title");
  const metaEl = mbEl("mb-chart-meta");
  if (!el || !window.Plotly) return;

  const indicator = mbState.indicator;
  const ind = mbIndicatorMeta(indicator);
  const requestId = ++mbMainChartRequest;

  if (titleEl) titleEl.textContent = ind.label;
  mbSetChartMessage(el, "Loading chart…");

  try {
    const data = await mbLoadSeries(indicator, mbState.timespan, force);
    if (requestId !== mbMainChartRequest) return;

    if (metaEl) {
      metaEl.textContent = `${data.source || ind.source}${data.note ? ` · ${data.note}` : ""}${data.stale ? " · cached" : ""}`;
    }
    const series = mbFilterSeriesByTimespan(data.series || [], mbState.timespan);
    const valid = series.filter((p) => p.value != null && Number.isFinite(Number(p.value)));
    if (!valid.length) {
      mbSetChartMessage(el, `No series data — ${mbFormatSeriesError(data.error)}`);
      return;
    }
    if (valid.length < 2) {
      const note = data.note || "This metric is a live snapshot only.";
      const val = mbFmtValue(valid[0].value, ind.format);
      mbSetChartMessage(el, `${ind.label}: ${val} — ${note} Open the ${ind.tab ? ind.tab.replace("_", " ") : "dedicated"} tab for full context.`);
      return;
    }
    const trace = mbSeriesToPlotly(series, "#e879f9", indicator, {
      source: data.source || ind.source,
      stale: data.stale,
    });
    if (!trace) {
      mbSetChartMessage(el, `Chart data has invalid dates — ${mbFormatSeriesError(data.error)}`);
      return;
    }
    const staleNote = data.stale ? " · cached" : "";
    const layout = mbPlotLayout(`${ind.label}${staleNote}`, 360, { yTitle: ind.unit });
    mbPrepareChartEl(el);
    await Plotly.react(el, [trace], layout, MB_PLOTLY_CONFIG);
  } catch (err) {
    if (requestId !== mbMainChartRequest) return;
    mbSetChartMessage(el, `Chart failed — ${err.message || "error"}`);
  }
}

function mbRenderDistribution() {
  if (!mbDistribution || !window.Plotly) return;
  const wealth = mbDistribution.wealth || {};
  const wealthEl = mbEl("mb-wealth-chart");
  const cohortEl = mbEl("mb-cohort-chart");
  const table = mbEl("mb-cohort-table");
  const meta = mbEl("mb-wealth-meta");
  const wealthInfo = mbChartInfo("wealth_concentration");
  const cohortInfo = mbChartInfo("wallet_cohorts");
  mbRenderChartDescription("wealth_concentration");
  mbRenderChartDescription("wallet_cohorts");
  const wealthDesc = mbEl("mb-desc-wealth_concentration");
  const cohortDesc = mbEl("mb-desc-wallet_cohorts");
  if (wealthDesc && !wealthDesc.textContent) {
    wealthDesc.textContent = [wealthInfo.description, wealthInfo.readings].filter(Boolean).join(" ");
  }
  if (cohortDesc && !cohortDesc.textContent) {
    cohortDesc.textContent = [cohortInfo.description, cohortInfo.readings].filter(Boolean).join(" ");
  }
  if (meta) meta.textContent = `${mbDistribution.source || "BitInfoCharts"} · ${mbDistribution.note || ""}`.slice(0, 120);

  if (wealthEl) {
    const labels = ["Top 10", "Top 100", "Top 1,000", "Top 10,000"];
    const values = [wealth.top10_pct, wealth.top100_pct, wealth.top1000_pct, wealth.top10000_pct].map(Number);
    if (values.some((v) => Number.isFinite(v) && v > 0)) {
      const customdata = values.map((v, i) => [
        `${labels[i]} addresses`,
        mbFmtValue(v, "pct"),
        wealthInfo.readings || "",
        wealthInfo.source || "BitInfoCharts",
      ]);
      Plotly.react(
        wealthEl,
        [{
          x: labels,
          y: values,
          customdata,
          type: "bar",
          marker: { color: ["#f59e0b", "#e879f9", "#38bdf8", "#14b8a6"] },
          hovertemplate:
            "<b>%{customdata[0]}</b><br>" +
            "Supply share: %{customdata[1]}<br>" +
            "%{customdata[2]}<br>" +
            "<span style='font-size:10px;color:#94a3b8'>Source: %{customdata[3]}</span>" +
            "<extra></extra>",
        }],
        mbPlotLayoutCategory("Wealth concentration (% of supply)", 320, { yTitle: "%" }),
        MB_PLOTLY_CONFIG,
      );
    } else {
      const err = (mbDistribution.errors || []).join("; ") || "BitInfoCharts scrape returned no wealth bands";
      wealthEl.innerHTML = `<p class="misc-fng-empty">Wealth data unavailable — ${err}</p>`;
    }
  }

  const cohorts = mbDistribution.cohorts || [];
  if (cohortEl && cohorts.length) {
    const labels = cohorts.map((c) => c.range);
    const supply = cohorts.map((c) => c.supply_pct);
    const customdata = cohorts.map((c) => [
      (c.addresses || 0).toLocaleString(),
      c.addresses_pct != null ? `${c.addresses_pct.toFixed(2)}%` : "—",
      c.btc != null ? `${c.btc.toLocaleString()} BTC` : "—",
      cohortInfo.source || "BitInfoCharts",
    ]);
    Plotly.react(
      cohortEl,
      [{
        labels,
        values: supply,
        customdata,
        type: "pie",
        hole: 0.45,
        textinfo: "label+percent",
        textposition: "outside",
        marker: { colors: supply.map((_, i) => `hsl(${(i * 37) % 360}, 65%, 55%)`) },
        hovertemplate:
          "<b>%{label}</b><br>" +
          "Supply: %{percent}<br>" +
          "Addresses: %{customdata[0]} (%{customdata[1]})<br>" +
          "BTC held: %{customdata[2]}<br>" +
          "<span style='font-size:10px;color:#94a3b8'>Source: %{customdata[3]}</span>" +
          "<extra></extra>",
      }],
      mbPlotLayoutPie("Wallet cohorts · % of supply", 380),
      MB_PLOTLY_CONFIG,
    );
  } else if (cohortEl) {
    cohortEl.innerHTML = '<p class="misc-fng-empty">Cohort data unavailable</p>';
  }

  if (table) {
    table.innerHTML = cohorts
      .map(
        (c) => `<tr>
        <td class="mono">${c.range}</td>
        <td class="mono">${(c.addresses || 0).toLocaleString()}</td>
        <td class="mono">${c.addresses_pct?.toFixed(2) ?? "—"}%</td>
        <td class="mono">${c.btc?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—"}</td>
        <td class="mono">${c.supply_pct?.toFixed(2) ?? "—"}%</td>
      </tr>`,
      )
      .join("");
  }

  const top10 = Number(wealth.top10_pct);
  const top100 = Number(wealth.top100_pct);
  mbRenderCommentaryEl(
    "mb-commentary-wealth_concentration",
    [
      Number.isFinite(top100) && top100 > 0
        ? `Top 100 addresses hold ${mbFmtValue(top100, "pct")} of supply; top 10 hold ${mbFmtValue(top10, "pct")}. `
          + (top100 >= 15
            ? "Concentration remains elevated — exchange cold wallets inflate address-level whale counts."
            : "Concentration is moderate on this address-level snapshot.")
        : "Wealth concentration data unavailable from BitInfoCharts.",
    ],
    { key: "wealth_concentration", latest: top100 },
  );
  const topCohort = cohorts.reduce((best, c) => ((c.supply_pct || 0) > (best?.supply_pct || 0) ? c : best), null);
  mbRenderCommentaryEl(
    "mb-commentary-wallet_cohorts",
    [
      topCohort
        ? `Largest supply cohort: ${topCohort.range} (${topCohort.supply_pct?.toFixed(1)}% of supply). `
          + "Address-level bands — not entity-adjusted; exchange wallets can dominate large buckets."
        : "Wallet cohort breakdown unavailable.",
    ],
    { key: "wallet_cohorts", latest: topCohort?.supply_pct },
  );
  mbRenderAllChartEducation(["wealth_concentration", "wallet_cohorts"]);
}

function mbRenderDualChart(elId, keyA, keyB, dataA, dataB, colors, displayKey) {
  const el = mbEl(elId);
  if (!el) return;
  const showKey = displayKey || keyA;
  mbRenderChartDescription(showKey, elId);
  const seriesA = mbFilterSeriesByTimespan(dataA?.series || [], mbState.timespan);
  const seriesB = mbFilterSeriesByTimespan(dataB?.series || [], mbState.timespan);
  const hasA = seriesA.some((p) => p.value != null);
  const hasB = seriesB.some((p) => p.value != null);
  if (!hasA && !hasB) {
    const raw = dataA?.error || dataB?.error || "No data";
    const msg = String(raw).replace(/^HTTP Error 429.*$/i, "Rate limited — BGeometrics free tier (8/hr); cached data used when available");
    mbSetChartMessage(el, msg);
    return;
  }
  const metaA = mbIndicatorMeta(keyA);
  const metaB = mbIndicatorMeta(keyB);
  const traces = [];
  if (hasA) {
    const traceA = mbSeriesToPlotly(seriesA, colors[0], keyA, {
      source: dataA?.source || metaA.source,
      stale: dataA?.stale,
      fill: false,
    });
    if (traceA) traces.push({ ...traceA, name: metaA.label });
  }
  if (hasB) {
    const traceB = mbSeriesToPlotly(seriesB, colors[1], keyB, {
      source: dataB?.source || metaB.source,
      stale: dataB?.stale,
      fill: false,
    });
    if (traceB) traces.push({ ...traceB, name: metaB.label });
  }
  if (!traces.length) {
    mbSetChartMessage(el, mbFormatSeriesError(dataA?.error || dataB?.error || "No data"));
    return;
  }
  const staleNote = (dataA?.stale || dataB?.stale) ? " · cached" : "";
  const tall = el.classList.contains("mb-plotly--tall");
  mbPrepareChartEl(el);
  Plotly.react(
    el,
    traces,
    mbPlotLayout(staleNote ? `Dual cohort view${staleNote}` : "", tall ? MB_CHART_HEIGHT : 300, {
      yTitle: metaA.unit || metaB.unit || "",
      showLegend: true,
      rangeSlider: mbChartUsesRangeSlider(el),
    }),
    MB_PLOTLY_CONFIG,
  );
  mbRenderChartEducation(showKey);
}

function mbRenderSingleChart(elId, indicator, color, data, displayKey) {
  const el = mbEl(elId);
  if (!el) return;
  const showKey = displayKey || indicator;
  mbRenderChartDescription(showKey, elId);
  data = mbChartDataWithFallback(indicator, data);
  const series = mbFilterSeriesByTimespan(data?.series || [], mbState.timespan);
  const valid = series.filter((p) => p.value != null && Number.isFinite(Number(p.value)));
  if (!valid.length) {
    mbSetChartMessage(el, mbFormatSeriesError(data?.error || "No data"));
    return;
  }
  const meta = mbIndicatorMeta(showKey);
  const trace = mbSeriesToPlotly(series, color, showKey, {
    source: data.source || meta.source,
    stale: data.stale,
  });
  if (!trace) {
    mbSetChartMessage(el, `Chart data has invalid dates — ${mbFormatSeriesError(data?.error)}`);
    return;
  }
  const staleNote = data.stale ? " · cached" : "";
  const rateNote = data.note && /rate limit|429/i.test(String(data.note)) ? " · rate-limited" : "";
  const tall = el.classList.contains("mb-plotly--tall");
  mbPrepareChartEl(el);
  Plotly.react(
    el,
    [trace],
    mbPlotLayout(`${meta.label}${staleNote}${rateNote}`, tall ? MB_CHART_HEIGHT : 300, {
      yTitle: meta.unit,
      rangeSlider: mbChartUsesRangeSlider(el),
    }),
    MB_PLOTLY_CONFIG,
  );
  mbRenderChartEducation(showKey);
}

function mbBuildValuationChartCommentary(key, chartData, charts = {}) {
  const seriesKey = key === "hodl_waves_1y_plus" ? "hodl_waves" : key;
  const ctx = mbIntelSeriesContext(key === "hodl_waves_1y_plus" ? "hodl_waves_1y_plus" : key, chartData);
  if (!ctx) {
    return [chartData?.error
      ? `Data unavailable (${String(chartData.error).slice(0, 100)}).`
      : "Waiting for series data — run Refresh or check BGeometrics limits."];
  }
  const { latest, fmt, reading, trend, series } = ctx;
  const pct90 = mbIntelPctVs90(series);
  const trendPhrase = mbIntelTrendPhrase(pct90);
  const cells = mbSnapshot?.cells || {};
  const mvrvCtx = mbIntelSeriesContext("mvrv", charts.mvrv);
  const mvrv = mvrvCtx?.latest ?? Number(cells.mvrv?.value);

  switch (key) {
    case "mvrv":
      return [
        `MVRV is ${mbFmtValue(latest, fmt)}${trend}. `
        + (latest >= 3.5
          ? "Price is far above aggregate holder cost — this band historically marked prior cycle tops and heavy distribution risk."
          : latest >= 2
            ? "Network is richly valued vs realized cap — profit-taking pressure tends to build in this zone."
            : latest < 1
              ? "Spot trades below average on-chain cost basis — historically a deep-value / accumulation zone."
              : latest < 1.5
                ? "Fair-value band — price modestly above holder cost without extreme overheating."
                : "Mid-cycle valuation — elevated but not yet in blow-off territory."),
        reading || "Market cap ÷ realized cap — the core BTC cycle valuation ratio.",
      ];
    case "mvrv_z_score":
      return [
        `MVRV Z-Score: ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (latest >= 7
          ? "Statistically extreme versus history — prior cycle tops often printed in this zone."
          : latest >= 3
            ? "Overheated vs long-run mean — valuation is stretched on a sigma basis."
            : latest <= -0.5
              ? "Below historical mean — statistically cheap; accumulation-friendly context."
              : "Within normal historical deviation — no sigma extreme."),
        "Normalizes MVRV across eras — useful when raw MVRV alone is ambiguous.",
      ];
    case "realized_price": {
      const spot = Number.isFinite(mvrv) && latest != null ? latest * mvrv : null;
      const spotNote = spot != null
        ? (mvrv < 1
          ? ` Implied spot ~${mbFmtValue(spot, "usd")} is under realized price — aggregate network underwater.`
          : mvrv >= 2.5
            ? ` Implied spot ~${mbFmtValue(spot, "usd")} sits well above cost basis — broad holder profit.`
            : ` Implied spot ~${mbFmtValue(spot, "usd")} is above realized price — network in aggregate profit.`)
        : "";
      return [
        `Realized price: ${mbFmtValue(latest, fmt)}${trend}.${spotNote}`,
        "Volume-weighted average cost basis of circulating BTC — a long-term support/resistance anchor in bear markets.",
      ];
    }
    case "hodl_waves_1y_plus":
      return [
        `Supply aged 1y+: ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (latest >= 65
          ? "High long-term holder share — less short-term supply likely to hit market; HODL conviction strong."
          : latest <= 55
            ? "Younger supply is active — more coins moved recently; distribution or rotation risk rises."
            : "Balanced holder-age mix — neither extreme HODL nor heavy young-supply activation."),
        "Sharp drops can signal old coins waking up; rises often align with accumulation phases.",
      ];
    case "nupl":
      return [
        `NUPL: ${mbFmtValue(latest, fmt)}${trend}. `
        + (latest >= 0.75
          ? "Euphoria zone — extreme unrealized profit; psychology and sell pressure risk are elevated."
          : latest >= 0.5
            ? "Optimism / belief zone — holders broadly profitable; profit-taking becomes more likely."
            : latest <= 0
              ? "Capitulation zone — network underwater on average; contrarian bottoming context."
              : "Hope / recovery — paper profits rebuilding but not yet euphoric."),
        reading || "Net unrealized P/L as a share of market cap — maps market psychology across cycles.",
      ];
    case "sopr":
      return [
        `SOPR: ${mbFmtValue(latest, fmt)}${trend}. `
        + (latest >= 1.05
          ? "Coins are moving at a profit — profit-taking dominates on-chain spends."
          : latest < 1
            ? "Loss-driven moves — capitulation selling; historically clusters near local lows."
            : "Near breakeven (1.0) — neither aggressive profit-taking nor loss selling."),
        "Spent Output Profit Ratio — whether moved coins sold above or below their cost basis.",
      ];
    case "supply_in_profit":
      return [
        `Supply in profit: ${mbFmtValue(latest, fmt)}${trend}. `
        + (latest >= 95
          ? "Nearly all supply is profitable — distribution risk rises as every holder can take gains."
          : latest <= 50
            ? "Majority underwater — stress breadth consistent with bear-market floors."
            : "Mixed profit/loss supply — no extreme breadth signal."),
        "Complements MVRV/NUPL — measures how much supply can theoretically sell at a gain today.",
      ];
    default:
      return [`${mbIndicatorMeta(key).label}: ${mbFmtValue(latest, fmt)}${trend}. ${reading || mbShortReading(seriesKey)}`];
  }
}

function mbDetectValuationPhase(charts) {
  const scores = { accumulation: 0, markup: 0, distribution: 0, capitulation: 0 };
  const mvrv = mbIntelSeriesContext("mvrv", charts.mvrv);
  const mvrvZ = mbIntelSeriesContext("mvrv_z_score", charts.mvrv_z_score);
  const nupl = mbIntelSeriesContext("nupl", charts.nupl);
  const sopr = mbIntelSeriesContext("sopr", charts.sopr);
  const supply = mbIntelSeriesContext("supply_in_profit", charts.supply_in_profit);
  const hodl = mbIntelSeriesContext("hodl_waves_1y_plus", charts.hodl_waves);

  if (mvrv?.latest != null && mvrv.latest < 1) scores.capitulation += 4;
  if (nupl?.latest != null && nupl.latest <= 0) scores.capitulation += 3;
  if (sopr?.latest != null && sopr.latest < 0.98) scores.capitulation += 2;
  if (supply?.latest != null && supply.latest <= 52) scores.capitulation += 2;
  if (mvrvZ?.latest != null && mvrvZ.latest <= -0.5) scores.capitulation += 2;

  if (mvrv?.latest != null && mvrv.latest >= 1 && mvrv.latest < 1.4) scores.accumulation += 2;
  if (hodl?.latest != null) {
    const h = mbIntelPctVs90(hodl.series);
    if (h != null && h >= 2) scores.accumulation += 2;
    if (hodl.latest >= 62) scores.accumulation += 1;
  }
  if (sopr?.latest != null && sopr.latest >= 0.99 && sopr.latest <= 1.02) scores.accumulation += 1;
  if (nupl?.latest != null && nupl.latest > 0 && nupl.latest < 0.35) scores.accumulation += 1;

  if (mvrv?.latest != null && mvrv.latest >= 1.2 && mvrv.latest < 2.5) scores.markup += 2;
  if (nupl?.latest != null && nupl.latest >= 0.2 && nupl.latest < 0.55) scores.markup += 2;
  if (mvrv?.latest != null) {
    const m = mbIntelPctVs90(mvrv.series);
    if (m != null && m >= 2 && mvrv.latest < 2.8) scores.markup += 2;
  }
  if (sopr?.latest != null && sopr.latest >= 1 && sopr.latest < 1.05) scores.markup += 1;

  if (mvrv?.latest != null && mvrv.latest >= 2.5) scores.distribution += 3;
  if (mvrv?.latest != null && mvrv.latest >= 3.5) scores.distribution += 2;
  if (nupl?.latest != null && nupl.latest >= 0.55) scores.distribution += 3;
  if (nupl?.latest != null && nupl.latest >= 0.75) scores.distribution += 2;
  if (sopr?.latest != null && sopr.latest >= 1.05) scores.distribution += 2;
  if (supply?.latest != null && supply.latest >= 92) scores.distribution += 2;
  if (mvrvZ?.latest != null && mvrvZ.latest >= 3) scores.distribution += 2;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topPhase, topScore] = ranked[0];
  const [, secondScore] = ranked[1] || ["", 0];
  const phase = topScore > 0 && topScore >= secondScore ? topPhase : "markup";
  const copy = {
    accumulation: { label: "Accumulation", tone: "accumulation", blurb: "Price near or below cost basis with improving HODL structure — classic smart-money absorption before markup." },
    markup: { label: "Markup", tone: "markup", blurb: "Valuation is constructive without blow-off extremes — trend-friendly zone with manageable profit-taking." },
    distribution: { label: "Distribution", tone: "distribution", blurb: "Rich MVRV/NUPL and broad in-profit supply — overhead risk rises as holders can harvest large gains." },
    capitulation: { label: "Capitulation", tone: "capitulation", blurb: "Network underwater on average with loss-driven spending — historically where seller exhaustion builds." },
  };
  const conf = topScore >= 6 ? "high" : topScore >= 4 ? "moderate" : "low";
  const meta = copy[phase] || copy.markup;
  return { phase, label: meta.label, tone: meta.tone, blurb: meta.blurb, confidence: conf, scores };
}

function mbValuationChartEntries(bundle, extraEntries = []) {
  const charts = bundle?.charts || {};
  const mvrvLatest = mbIntelSeriesContext("mvrv", charts.mvrv)?.latest;
  const specs = [
    { elId: "mb-commentary-mvrv", label: "MVRV", displayKey: "mvrv", seriesKey: "mvrv" },
    { elId: "mb-commentary-mvrv_z_score", label: "MVRV Z-Score", displayKey: "mvrv_z_score", seriesKey: "mvrv_z_score" },
    { elId: "mb-commentary-realized_price", label: "Realized price", displayKey: "realized_price", seriesKey: "realized_price" },
    { elId: "mb-commentary-hodl_waves_1y_plus", label: "HODL waves (1y+)", displayKey: "hodl_waves_1y_plus", seriesKey: "hodl_waves" },
    { elId: "mb-commentary-nupl", label: "NUPL", displayKey: "nupl", seriesKey: "nupl" },
    { elId: "mb-commentary-sopr", label: "SOPR", displayKey: "sopr", seriesKey: "sopr" },
    { elId: "mb-commentary-supply_in_profit", label: "Supply in profit", displayKey: "supply_in_profit", seriesKey: "supply_in_profit" },
  ];
  const core = specs.map(({ elId, label, displayKey, seriesKey }) => {
    const chartData = charts[seriesKey];
    const ctxKey = displayKey === "hodl_waves_1y_plus" ? "hodl_waves_1y_plus" : displayKey;
    const ctx = mbIntelSeriesContext(ctxKey, chartData);
    return {
      elId,
      label,
      lines: mbBuildValuationChartCommentary(displayKey, chartData, charts),
      forwardOpts: {
        key: displayKey,
        latest: ctx?.latest,
        extra: { spotBelow: displayKey === "realized_price" && mvrvLatest != null && mvrvLatest < 1 },
      },
    };
  });
  return [...core, ...(extraEntries || [])];
}

function mbBuildValuationOutlook(bundle, extraEntries = []) {
  const charts = bundle?.charts || {};
  const cells = mbSnapshot?.cells || {};
  const signals = [];
  const keys = ["mvrv", "mvrv_z_score", "nupl", "sopr", "supply_in_profit", "hodl_waves_1y_plus"];

  keys.forEach((k) => {
    const seriesKey = k === "hodl_waves_1y_plus" ? "hodl_waves" : k;
    const ctx = mbIntelSeriesContext(k, charts[seriesKey]);
    const val = ctx?.latest ?? mbCellLatestValue(k, cells[k] || {});
    mbSignalBadges(k, val, cells[k] || {}, cells).forEach((b) => signals.push(mbIntelSignalScore(b.label, b.tone)));
  });

  const score = signals.reduce((sum, s) => sum + s.score, 0);
  const cyclePhase = mbDetectValuationPhase(charts);
  const posture = score >= 4
    ? "rich / cautious for spot"
    : score <= -4
      ? "undervalued / constructive"
      : score >= 1
        ? "mildly constructive"
        : score <= -1
          ? "mildly cautious"
          : "neutral valuation";
  const chartEntries = mbValuationChartEntries(bundle, extraEntries);

  return mbSynthesizeSectionOutlook({
    tab: "valuation",
    intro:
      "Valuation & Cycles tracks how far spot sits above aggregate holder cost (MVRV, realized price), "
      + "how profitable the network is on paper (NUPL, supply in profit), and whether coins move at a profit or loss (SOPR). "
      + "The synthesis below reflects each chart's live conclusion.",
    chartEntries,
    cyclePhase,
    score,
    posture,
    footer: `Automated commentary from BGeometrics — educational only. Timespan: ${mbState.timespan}. Pair with On-Chain Intelligence for cohort-level confirmation.`,
  });
}

function mbRenderValuationCommentary(bundle, extraEntries = []) {
  mbTabOutlookState.valuation = bundle;
  const entries = mbValuationChartEntries(bundle, extraEntries);
  for (const entry of entries) {
    if (entry.elId) {
      mbRenderCommentaryEl(entry.elId, entry.lines, entry.forwardOpts);
    }
  }
  mbRenderAllChartEducation([
    "mvrv", "mvrv_z_score", "realized_price", "hodl_waves_1y_plus", "nupl", "sopr", "supply_in_profit",
  ]);
  mbRenderTabOutlook("mb-valuation-outlook-head", "mb-valuation-commentary", mbBuildValuationOutlook(bundle, extraEntries));
}

async function mbRenderValuationCharts(force = false) {
  if (!window.Plotly) return;
  const chartMap = [
    ["mb-chart-mvrv", "mvrv", "mvrv", "#e879f9"],
    ["mb-chart-mvrvz", "mvrv_z_score", "mvrv_z_score", "#a78bfa"],
    ["mb-chart-realized", "realized_price", "realized_price", "#34d399"],
    ["mb-chart-hodl", "hodl_waves", "hodl_waves_1y_plus", "#60a5fa"],
    ["mb-chart-nupl", "nupl", "nupl", "#f472b6"],
    ["mb-chart-sopr", "sopr", "sopr", "#fb923c"],
    ["mb-chart-supply-profit", "supply_in_profit", "supply_in_profit", "#4ade80"],
  ];
  for (const [elId] of chartMap) {
    mbSetChartMessage(mbEl(elId), "Loading chart…");
  }
  try {
    const bundle = await mbLoadValuationBundle(mbState.timespan, force);
    for (const [elId, seriesKey, displayKey, color] of chartMap) {
      mbRenderSingleChart(elId, seriesKey, color, bundle.charts?.[seriesKey], displayKey);
    }
    mbRenderValuationCommentary(bundle);
  } catch (err) {
    for (const [elId] of chartMap) {
      mbSetChartMessage(mbEl(elId), err.message || "Load failed");
    }
    const head = mbEl("mb-valuation-outlook-head");
    if (head) head.innerHTML = "";
    mbRenderCommentaryEl("mb-valuation-commentary", [`Valuation bundle failed — ${err.message || "error"}.`]);
  } finally {
    await window.mbVmRenderTab?.("valuation", "mb-valuation-frameworks-root", force);
  }
}

function mbRenderTabOutlook(headId, commentaryId, outlook) {
  const head = mbEl(headId);
  if (head) head.innerHTML = mbCyclePhaseBadgeHtml(outlook.cyclePhase);
  mbRenderCommentaryEl(commentaryId, outlook.lines);
  const tabKey = headId?.replace(/^mb-/, "").replace(/-outlook-head$/, "");
  if (tabKey && outlook?.cyclePhase) {
    mbCacheTabCyclePhase(tabKey, outlook.cyclePhase);
    mbRefreshTableSectionBadges();
  }
}

function mbBuildOnchainChartCommentary(key, chartData, mempool = null) {
  if (key === "mempool_fees") {
    const fast = mempool?.fast_fee ?? mempool?.value;
    if (fast == null) return ["Mempool fee snapshot unavailable — Mempool.space may be unreachable."];
    const reading = mbReadingFor("mempool_fees", fast);
    const count = mempool?.mempool_count;
    return [
      `Fast confirmation fee is ${mbFmtValue(fast, "fee_sat")}${count != null ? ` with ${Number(count).toLocaleString()} pending txs` : ""}. `
      + (fast >= 50
        ? "Congested mempool — urgent block-space demand; often coincides with on-chain activity spikes or NFT/mint waves."
        : fast <= 5
          ? "Cheap fees — low congestion; quieter on-chain settlement demand."
          : "Moderate fee environment — normal block-space pricing."),
      reading ? `${reading} Hour and economy tiers show cheaper patience-based options.` : "",
    ];
  }

  const ctx = mbIntelSeriesContext(key, chartData);
  if (!ctx) {
    return [chartData?.error
      ? `Data unavailable (${String(chartData.error).slice(0, 100)}).`
      : "Waiting for series data — run Refresh or check API limits."];
  }
  const { latest, fmt, reading, trend, series } = ctx;
  const pct90 = mbIntelPctVs90(series);
  const trendPhrase = mbIntelTrendPhrase(pct90);

  switch (key) {
    case "active_addresses":
      return [
        `Active addresses: ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 5
          ? "Broader on-chain participation — supportive for network adoption narratives (note: L2 activity is off-chain)."
          : pct90 != null && pct90 <= -5
            ? "Participation is cooling versus recent norms — quieter base-layer usage."
            : "Address activity is near its 90-day average."),
        reading || "Unique addresses active in 24h — a coarse usage proxy, not unique users.",
      ];
    case "hash_rate":
      return [
        `Hash rate: ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 3
          ? "Miners are investing in more compute — network security and confidence are expanding."
          : pct90 != null && pct90 <= -3
            ? "Hashing power is softening — can follow price stress, energy costs, or geographic shifts."
            : "Hash rate is stable versus recent history."),
        "Compare with Miner & Network tab for BGeometrics hash-rate history and ribbon signals.",
      ];
    case "puell_multiple":
      return [
        `Puell Multiple: ${mbFmtValue(latest, fmt)}${trend}. `
        + (latest >= 4
          ? "Miner revenue is extreme versus its 1y average — historically clustered near cycle tops."
          : latest <= 0.5
            ? "Depressed miner income — often seen near bear-market floors and miner capitulation zones."
            : "Miner revenue is in a normal band relative to the past year."),
        reading || "Daily miner revenue ÷ 365d average — ties network health to cycle extremes.",
      ];
    case "exchange_netflow":
      return [
        `Exchange netflow: ${mbFmtValue(latest, fmt)}${trend}. `
        + (latest >= 5000
          ? "Large net inflow — more BTC deposited than withdrawn; near-term sell-pressure risk rises."
          : latest <= -5000
            ? "Large net outflow — accumulation / self-custody pattern as coins leave venues."
            : latest > 0
              ? "Mild net inflow — slightly more deposits than withdrawals."
              : latest < 0
                ? "Mild net outflow — slight bias toward withdrawals."
                : "Flows are roughly balanced today."),
        "Coin Metrics Community proxy — pair with exchange balance trend for inventory context.",
      ];
    case "exchange_balance":
      return [
        `Exchange balance: ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 5
          ? "More BTC sitting on exchanges than usual — liquid sell-side supply may be building."
          : pct90 != null && pct90 <= -5
            ? "Exchange inventory is draining — historically constructive for medium-term supply tightness."
            : "Exchange supply is near its 90-day average."),
        reading || "Total BTC on tracked exchange wallets — rising inventory can foreshadow distribution.",
      ];
    case "tx_count":
      return [
        `Transaction count: ${mbFmtValue(latest, fmt)}/day${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 5
          ? "Higher on-chain throughput — more economic activity settling on base layer."
          : pct90 != null && pct90 <= -5
            ? "Quieter transaction activity — softer network usage on this lens."
            : "Tx count is near recent averages."),
        "Not all economic activity appears on-chain (Lightning and L2s are excluded).",
      ];
    default:
      return [`${mbIndicatorMeta(key).label}: ${mbFmtValue(latest, fmt)}${trend}. ${reading || mbShortReading(key)}`];
  }
}

function mbDetectOnchainPhase(charts, mempool) {
  const scores = { accumulation: 0, markup: 0, distribution: 0, capitulation: 0 };
  const netflow = mbIntelSeriesContext("exchange_netflow", charts.exchange_netflow);
  const balance = mbIntelSeriesContext("exchange_balance", charts.exchange_balance);
  const addresses = mbIntelSeriesContext("active_addresses", charts.active_addresses);
  const hashRate = mbIntelSeriesContext("hash_rate", charts.hash_rate);
  const tx = mbIntelSeriesContext("tx_count", charts.tx_count);
  const puell = mbIntelSeriesContext("puell_multiple", charts.puell_multiple);
  const fast = mempool?.fast_fee ?? mempool?.value;

  if (netflow?.latest != null && netflow.latest <= -3000) scores.accumulation += 3;
  if (balance?.latest != null) {
    const balPct = mbIntelPctVs90(balance.series);
    if (balPct != null && balPct <= -4) scores.accumulation += 3;
    if (balPct != null && balPct >= 4) scores.distribution += 3;
  }
  if (netflow?.latest != null && netflow.latest >= 3000) scores.distribution += 3;
  if (puell?.latest != null && puell.latest >= 3.5) scores.distribution += 2;
  if (puell?.latest != null && puell.latest <= 0.55) scores.capitulation += 2;

  const addrPct = addresses ? mbIntelPctVs90(addresses.series) : null;
  const txPct = tx ? mbIntelPctVs90(tx.series) : null;
  const hrPct = hashRate ? mbIntelPctVs90(hashRate.series) : null;
  if (addrPct != null && addrPct >= 3) scores.markup += 2;
  if (txPct != null && txPct >= 3) scores.markup += 1;
  if (hrPct != null && hrPct >= 2) scores.markup += 2;
  if (addrPct != null && addrPct <= -5 && txPct != null && txPct <= -5) scores.capitulation += 2;
  if (fast != null && fast >= 45) scores.distribution += 1;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topPhase, topScore] = ranked[0];
  const [, secondScore] = ranked[1] || ["", 0];
  const phase = topScore > 0 && topScore >= secondScore ? topPhase : "markup";
  const copy = {
    accumulation: { label: "Accumulation", tone: "accumulation", blurb: "Coins leaving exchanges, inventory draining, and flows favor self-custody — classic smart-money absorption on base-layer rails." },
    markup: { label: "Markup", tone: "markup", blurb: "Network usage and security metrics are constructive without flow extremes — healthy activity supporting price discovery." },
    distribution: { label: "Distribution", tone: "distribution", blurb: "Exchange deposits, rising inventory, or miner-income extremes suggest overhead supply risk as liquidity is tested." },
    capitulation: { label: "Capitulation", tone: "capitulation", blurb: "Depressed miner income and fading on-chain activity — stress phase where seller exhaustion often builds before repair." },
  };
  const conf = topScore >= 5 ? "high" : topScore >= 3 ? "moderate" : "low";
  const meta = copy[phase] || copy.markup;
  return { phase, label: meta.label, tone: meta.tone, blurb: meta.blurb, confidence: conf, scores };
}

function mbOnchainChartEntries(charts, mempool, extraEntries = []) {
  const fast = mempool?.fast_fee ?? mempool?.value;
  const specs = [
    { elId: "mb-commentary-active_addresses", label: "Active addresses", key: "active_addresses" },
    { elId: "mb-commentary-hash_rate", label: "Hash rate", key: "hash_rate" },
    { elId: "mb-commentary-puell_multiple", label: "Puell Multiple", key: "puell_multiple" },
    { elId: "mb-commentary-exchange_netflow", label: "Exchange netflow", key: "exchange_netflow" },
    { elId: "mb-commentary-exchange_balance", label: "Exchange balance", key: "exchange_balance" },
    { elId: "mb-commentary-tx_count", label: "Transaction count", key: "tx_count" },
    { elId: "mb-commentary-mempool_fees", label: "Mempool fees", key: "mempool_fees" },
  ];
  const core = specs.map(({ elId, label, key }) => {
    const data = key === "mempool_fees" ? null : charts[key];
    const ctx = key === "mempool_fees" ? null : mbIntelSeriesContext(key, data);
    return {
      elId,
      label,
      lines: mbBuildOnchainChartCommentary(key, data, mempool),
      forwardOpts: {
        key,
        latest: key === "mempool_fees" ? fast : ctx?.latest,
        extra: {
          fast,
          pct90: ctx ? mbIntelPctVs90(ctx.series) : null,
        },
      },
    };
  });
  return [...core, ...(extraEntries || [])];
}

function mbBuildOnchainOutlook(charts, mempool, extraEntries = []) {
  const signals = [];
  const keys = ["active_addresses", "hash_rate", "puell_multiple", "exchange_netflow", "exchange_balance", "tx_count"];
  const cells = mbSnapshot?.cells || {};

  keys.forEach((k) => {
    const ctx = mbIntelSeriesContext(k, charts[k]);
    const val = ctx?.latest ?? mbCellLatestValue(k, cells[k] || {});
    mbSignalBadges(k, val, cells[k] || {}, cells).forEach((b) => signals.push(mbIntelSignalScore(b.label, b.tone)));
  });

  const score = signals.reduce((sum, s) => sum + s.score, 0);
  const cyclePhase = mbDetectOnchainPhase(charts, mempool);
  const posture = score >= 3
    ? "constructive for spot"
    : score <= -3
      ? "cautious — flow/valuation headwinds"
      : "mixed — no dominant network signal";
  const chartEntries = mbOnchainChartEntries(charts, mempool, extraEntries);

  return mbSynthesizeSectionOutlook({
    tab: "onchain",
    intro:
      "On-Chain Activity combines usage (addresses, transactions), security (hash rate, Puell), and exchange-flow proxies. "
      + "The synthesis below reflects each chart's live conclusion.",
    chartEntries,
    cyclePhase,
    score,
    posture,
    footer: `Automated commentary from Blockchain.info, Coin Metrics Community, and Mempool.space — educational only. Timespan: ${mbState.timespan}.`,
  });
}

function mbRenderOnchainCommentary(charts, mempool, extraEntries = []) {
  mbTabOutlookState.onchain = { charts, mempool };
  const entries = mbOnchainChartEntries(charts, mempool, extraEntries);
  for (const entry of entries) {
    if (entry.elId) {
      mbRenderCommentaryEl(entry.elId, entry.lines, entry.forwardOpts);
    }
  }
  mbRenderAllChartEducation([
    "active_addresses", "hash_rate", "puell_multiple", "exchange_netflow", "exchange_balance", "tx_count", "mempool_fees",
    "nvt_ratio", "metcalfe", "coin_days_destroyed",
  ]);
  mbRenderTabOutlook("mb-onchain-outlook-head", "mb-onchain-commentary", mbBuildOnchainOutlook(charts, mempool, extraEntries));
}

function mbBuildMinerChartCommentary(key, chartData, ctx = {}) {
  const seriesKey = key === "puell_multiple_miner" ? "puell_multiple" : key;
  const chartCtx = mbIntelSeriesContext(seriesKey, chartData);
  if (!chartCtx && key !== "mempool_fees") {
    return [chartData?.error
      ? `Data unavailable (${String(chartData.error).slice(0, 100)}).`
      : "Waiting for series data — run Refresh or check BGeometrics limits."];
  }

  const { latest, fmt, reading, trend, series } = chartCtx || {};
  const pct90 = series ? mbIntelPctVs90(series) : null;
  const trendPhrase = mbIntelTrendPhrase(pct90);

  switch (key) {
    case "puell_multiple_miner":
      return [
        `Puell Multiple: ${mbFmtValue(latest, fmt)}${trend}. `
        + (latest >= 4
          ? "Miner revenue is in an extreme top band — historically coincided with cycle highs; watch for hash-rate stress if price stalls."
          : latest <= 0.5
            ? "Revenue deeply depressed vs 1y average — classic miner capitulation / bottoming zone signal."
            : latest >= 1.2
              ? "Above-average miner income — healthy margins supporting network security."
              : "Puell in a normal mid-cycle band."),
        "Feeds hashprice, thermo price, and ribbon signals — miner stress often leads spot reversals by weeks to months.",
      ];
    case "hashprice":
      return [
        `Hashprice: ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 <= -8
          ? "Revenue per hash is weak — margin compression raises capitulation and hash-rate drawdown risk."
          : pct90 != null && pct90 >= 8
            ? "Hashprice is strong — miners are earning well per unit of compute."
            : "Hashprice is near recent norms."),
        reading || "USD earned per unit of hash power — the miner P&L lens for network security investment.",
      ];
    case "hashrate_bg":
      return [
        `Hash rate (BGeometrics): ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 3
          ? "Compute is climbing — miners committing capital to secure the chain."
          : pct90 != null && pct90 <= -3
            ? "Hash rate is rolling over — often follows price drops or unprofitable mining conditions."
            : "Hash rate is stable versus the 90-day average."),
        "Cross-check Blockchain.info hash rate on On-Chain Activity for a second source.",
      ];
    case "hashribbons":
      return [
        `Hash ribbons signal: ${mbFmtValue(latest, fmt)}. `
        + (latest >= 1
          ? "Recovery cross active — miner capitulation phase may be ending; historically a medium-term bullish network signal."
          : latest <= -1
            ? "Capitulation signal active — hash-rate stress and miner shutdowns often cluster near local price lows."
            : "No active ribbon cross — miners neither in clear capitulation nor recovery."),
        "Derived from hash-rate moving averages — a slower, higher-conviction miner cycle indicator.",
      ];
    case "difficulty":
      return [
        `Difficulty: ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 4
          ? "Difficulty rising — more competition for blocks; miners investing despite higher bar."
          : pct90 != null && pct90 <= -4
            ? "Difficulty falling — miner capitulation or margin stress; retarget easing mining economics."
            : "Difficulty near recent equilibrium after last adjustment."),
        "Retargets ~every two weeks — lags spot but confirms miner participation.",
      ];
    case "thermo_price": {
      const spot = ctx.spotUsd ?? mbSnapshot?.cells?.san_price_usd?.value ?? mbSnapshot?.cells?.mvrv?.value != null
        ? Number(mbSnapshot?.cells?.realized_price?.value) * Number(mbSnapshot?.cells?.mvrv?.value)
        : null;
      const spotNote = spot != null && latest != null
        ? (spot < latest * 0.92
          ? ` Spot (~${mbFmtValue(spot, "usd")}) is below thermo price — miners under water on production-cost proxy.`
          : spot > latest * 1.35
            ? ` Spot (~${mbFmtValue(spot, "usd")}) is well above thermo — miners profitable.`
            : ` Spot (~${mbFmtValue(spot, "usd")}) is near thermo — balanced miner economics.`)
        : "";
      return [
        `Thermo price: ${mbFmtValue(latest, fmt)}${trend}.${spotNote}`,
        "Cumulative miner revenue per BTC — a long-run production cost floor proxy, not a precise breakeven.",
      ];
    }
    case "miners_revenue":
      return [
        `Miner revenue: ${mbFmtValue(latest, fmt)}/day${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 20
          ? "Daily income is elevated — subsidy + fees outpacing recent norms; check Puell for cycle context."
          : pct90 != null && pct90 <= -15
            ? "Revenue is depressed — fee + subsidy income under pressure."
            : "Revenue in a typical band for this halving era."),
        "Subsidy + fees in USD — halvings step-change the baseline every ~4 years.",
      ];
    default:
      return [`${mbIndicatorMeta(key).label}: ${mbFmtValue(latest, fmt)}${trend}. ${reading || mbShortReading(seriesKey)}`];
  }
}

function mbDetectMinerPhase(bundle) {
  const charts = bundle?.charts || {};
  const scores = { capitulation: 0, recovery: 0, healthy: 0, euphoria: 0 };
  const puell = mbIntelSeriesContext("puell_multiple", charts.puell_multiple);
  const hashprice = mbIntelSeriesContext("hashprice", charts.hashprice);
  const ribbons = mbIntelSeriesContext("hashribbons", charts.hashribbons);
  const hashrate = mbIntelSeriesContext("hashrate_bg", charts.hashrate_bg);
  const difficulty = mbIntelSeriesContext("difficulty", charts.difficulty);
  const revenue = mbIntelSeriesContext("miners_revenue", charts.miners_revenue);

  if (ribbons?.latest != null && ribbons.latest <= -1) scores.capitulation += 4;
  if (puell?.latest != null && puell.latest <= 0.5) scores.capitulation += 3;
  if (hashprice?.latest != null) {
    const hp = mbIntelPctVs90(hashprice.series);
    if (hp != null && hp <= -10) scores.capitulation += 2;
  }
  if (difficulty?.latest != null) {
    const d = mbIntelPctVs90(difficulty.series);
    if (d != null && d <= -5) scores.capitulation += 2;
  }

  if (ribbons?.latest != null && ribbons.latest >= 1) scores.recovery += 4;
  if (puell?.latest != null && puell.latest > 0.5 && puell.latest < 1.2) scores.recovery += 2;
  if (hashrate?.latest != null) {
    const hr = mbIntelPctVs90(hashrate.series);
    if (hr != null && hr >= 2) scores.recovery += 1;
  }

  if (puell?.latest != null && puell.latest >= 0.8 && puell.latest <= 2) scores.healthy += 2;
  if (revenue?.latest != null) {
    const rev = mbIntelPctVs90(revenue.series);
    if (rev != null && rev >= -5 && rev <= 15) scores.healthy += 2;
  }
  if (hashrate?.latest != null) {
    const hr = mbIntelPctVs90(hashrate.series);
    if (hr != null && hr >= -2 && hr <= 5) scores.healthy += 1;
  }

  if (puell?.latest != null && puell.latest >= 4) scores.euphoria += 4;
  if (puell?.latest != null && puell.latest >= 2.5) scores.euphoria += 2;
  if (revenue?.latest != null) {
    const rev = mbIntelPctVs90(revenue.series);
    if (rev != null && rev >= 25) scores.euphoria += 2;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topPhase, topScore] = ranked[0];
  const [, secondScore] = ranked[1] || ["", 0];
  const phase = topScore > 0 && topScore >= secondScore ? topPhase : "healthy";
  const copy = {
    capitulation: { label: "Capitulation", tone: "capitulation", blurb: "Hash ribbons, Puell, or hashprice point to miner stress — shutdowns and hash drawdowns often mark late-stage selloffs." },
    recovery: { label: "Recovery", tone: "accumulation", blurb: "Ribbon recovery and normalizing Puell suggest miners are healing — historically supportive for medium-term price basing." },
    healthy: { label: "Healthy", tone: "markup", blurb: "Miner economics are in a sustainable band — security investment and revenue neither depressed nor euphoric." },
    euphoria: { label: "Euphoria", tone: "distribution", blurb: "Elevated Puell and revenue vs norms — miner income extremes historically clustered near cycle tops." },
  };
  const conf = topScore >= 5 ? "high" : topScore >= 3 ? "moderate" : "low";
  const meta = copy[phase] || copy.healthy;
  return { phase, label: meta.label, tone: meta.tone, blurb: meta.blurb, confidence: conf, scores };
}

function mbMinerChartEntries(bundle, extraEntries = []) {
  const charts = bundle?.charts || {};
  const spot = bundle?.snapshot?.market_price_usd;
  const thermo = mbIntelSeriesContext("thermo_price", charts.thermo_price);
  const specs = [
    { elId: "mb-commentary-puell_multiple_miner", label: "Puell Multiple", key: "puell_multiple_miner", seriesKey: "puell_multiple" },
    { elId: "mb-commentary-hashprice", label: "Hashprice", key: "hashprice", seriesKey: "hashprice" },
    { elId: "mb-commentary-hashrate_bg", label: "Hash rate", key: "hashrate_bg", seriesKey: "hashrate_bg" },
    { elId: "mb-commentary-hashribbons", label: "Hash ribbons", key: "hashribbons", seriesKey: "hashribbons" },
    { elId: "mb-commentary-difficulty", label: "Difficulty", key: "difficulty", seriesKey: "difficulty" },
    { elId: "mb-commentary-thermo_price", label: "Thermo price", key: "thermo_price", seriesKey: "thermo_price" },
    { elId: "mb-commentary-miners_revenue", label: "Miner revenue", key: "miners_revenue", seriesKey: "miners_revenue" },
  ];
  const core = specs.map(({ elId, label, key, seriesKey }) => {
    const chartData = charts[seriesKey];
    const ctx = mbIntelSeriesContext(seriesKey, chartData);
    return {
      elId,
      label,
      lines: mbBuildMinerChartCommentary(key, chartData, { spotUsd: spot }),
      forwardOpts: {
        key,
        latest: ctx?.latest,
        extra: {
          pct90: ctx ? mbIntelPctVs90(ctx.series) : null,
          spotBelowThermo: spot != null && thermo?.latest != null && spot < thermo.latest * 0.92,
        },
      },
    };
  });
  return [...core, ...(extraEntries || [])];
}

function mbBuildMinerOutlook(bundle, extraEntries = []) {
  const charts = bundle?.charts || {};
  const cells = mbSnapshot?.cells || {};
  const signals = [];
  const keys = [
    ["puell_multiple", "puell_multiple_miner"],
    ["hashprice", "hashprice"],
    ["hashrate_bg", "hashrate_bg"],
    ["hashribbons", "hashribbons"],
    ["difficulty", "difficulty"],
    ["thermo_price", "thermo_price"],
    ["miners_revenue", "miners_revenue"],
  ];

  keys.forEach(([seriesKey, badgeKey]) => {
    const ctx = mbIntelSeriesContext(seriesKey, charts[seriesKey]);
    const val = ctx?.latest ?? mbCellLatestValue(seriesKey, cells[seriesKey] || {});
    mbSignalBadges(badgeKey === "puell_multiple_miner" ? "puell_multiple" : badgeKey, val, cells[seriesKey] || {}, cells)
      .forEach((b) => signals.push(mbIntelSignalScore(b.label, b.tone)));
  });

  const score = signals.reduce((sum, s) => sum + s.score, 0);
  const cyclePhase = mbDetectMinerPhase(bundle);
  const posture = score >= 3
    ? "supportive for medium-term spot"
    : score <= -3
      ? "miner stress — caution on security / supply"
      : "neutral miner backdrop";
  const chartEntries = mbMinerChartEntries(bundle, extraEntries);

  return mbSynthesizeSectionOutlook({
    tab: "miner",
    intro:
      "Miner & Network health links hash rate, difficulty, revenue, and production-cost proxies to BTC's security budget. "
      + "The synthesis below reflects each chart's live conclusion.",
    chartEntries,
    cyclePhase,
    score,
    posture,
    footer: `Automated commentary from BGeometrics and Blockchain.info — educational only. Timespan: ${mbState.timespan}.`,
  });
}

function mbRenderMinerCommentary(bundle, extraEntries = []) {
  mbTabOutlookState.miner = bundle;
  const entries = mbMinerChartEntries(bundle, extraEntries);
  for (const entry of entries) {
    if (entry.elId) {
      mbRenderCommentaryEl(entry.elId, entry.lines, entry.forwardOpts);
    }
  }
  mbRenderAllChartEducation([
    "puell_multiple_miner", "hashprice", "hashrate_bg", "hashribbons", "difficulty", "thermo_price", "miners_revenue",
    "difficulty_ribbon",
  ]);
  mbRenderTabOutlook("mb-miner-outlook-head", "mb-miner-commentary", mbBuildMinerOutlook(bundle, extraEntries));
}

async function mbRenderOnchainCharts(force = false) {
  if (!window.Plotly) return;
  const blockchainCharts = [
    ["mb-chart-active", "active_addresses", "#38bdf8"],
    ["mb-chart-hash", "hash_rate", "#14b8a6"],
    ["mb-chart-puell", "puell_multiple", "#fbbf24"],
  ];
  const flowCharts = [
    ["mb-chart-netflow", "exchange_netflow", "exchange_netflow", "#f472b6"],
    ["mb-chart-ex-balance", "exchange_balance", "exchange_balance", "#a78bfa"],
    ["mb-chart-tx", "tx_count", "tx_count", "#38bdf8"],
  ];
  for (const [elId] of [...blockchainCharts, ...flowCharts]) {
    mbSetChartMessage(mbEl(elId), "Loading chart…");
  }
  const mfCell = mbSnapshot?.cells?.mempool_fees;
  const mfFallback = mfCell
    ? {
        value: mfCell.value,
        fast_fee: mfCell.fastFee,
        hour_fee: mfCell.hourFee,
        economy_fee: mfCell.economyFee,
        mempool_count: mfCell.mempoolCount,
      }
    : null;
  mbRenderMempoolPanel(mfFallback);
  const charts = {};
  let mempool = mfFallback;
  try {
    const [flows, network] = await Promise.all([
      mbLoadFlowsBundle(mbState.timespan, force),
      mbLoadNetworkBundle(mbState.timespan, force),
    ]);
    mempool = network.mempool || mempool;
    mbRenderMempoolPanel(mempool);
    charts.exchange_netflow = flows.charts?.exchange_netflow;
    charts.exchange_balance = flows.charts?.exchange_balance;
    charts.tx_count = network.charts?.tx_count;
    for (const [elId, seriesKey, displayKey, color] of flowCharts) {
      if (seriesKey === "tx_count") continue;
      mbRenderSingleChart(elId, seriesKey, color, charts[seriesKey], displayKey);
    }
    mbRenderSingleChart("mb-chart-tx", "tx_count", "#38bdf8", charts.tx_count, "tx_count");
    await Promise.all(
      blockchainCharts.map(async ([elId, indicator, color]) => {
        const el = mbEl(elId);
        if (!el) return;
        try {
          const data = await mbLoadSeries(indicator, mbState.timespan, force);
          charts[indicator] = data;
          mbRenderSingleChart(elId, indicator, color, data, indicator);
        } catch (err) {
          mbSetChartMessage(el, err.message || "Load failed");
        }
      }),
    );
    mbRenderOnchainCommentary(charts, mempool);
  } catch (err) {
    for (const [elId] of [...blockchainCharts, ...flowCharts]) {
      mbSetChartMessage(mbEl(elId), err.message || "Load failed");
    }
    const head = mbEl("mb-onchain-outlook-head");
    if (head) head.innerHTML = "";
    mbRenderCommentaryEl("mb-onchain-commentary", [`On-chain bundle failed — ${err.message || "error"}.`]);
  } finally {
    await window.mbVmRenderTab?.("onchain", "mb-onchain-frameworks-root", force);
  }
}

function mbRenderMempoolPanel(mempool) {
  const el = mbEl("mb-mempool-panel");
  if (!el) return;
  const info = mbChartInfo("mempool_fees");
  mbRenderChartDescription("mempool_fees");
  if (!mempool?.value && !mempool?.fast_fee) {
    el.innerHTML = '<p class="misc-fng-empty">Mempool fee data unavailable</p>';
    return;
  }
  const fast = mempool.fast_fee ?? mempool.value;
  const hour = mempool.hour_fee;
  const econ = mempool.economy_fee;
  const count = mempool.mempool_count;
  el.innerHTML = `<div class="mb-mempool-stats">
    <div class="deriv-hero-block" title="${mbReadingFor("mempool_fees", fast)}">
      <span class="deriv-hero-label">Fast fee</span>
      <span class="deriv-hero-value mono">${mbFmtValue(fast, "fee_sat")}</span>
      <span class="deriv-hero-sub">${count != null ? count.toLocaleString() + " pending txs" : "Mempool.space"}</span>
    </div>
    <div class="deriv-hero-block"><span class="deriv-hero-label">Hour target</span><span class="deriv-hero-value mono">${hour != null ? mbFmtValue(hour, "fee_sat") : "—"}</span></div>
    <div class="deriv-hero-block"><span class="deriv-hero-label">Economy</span><span class="deriv-hero-value mono">${econ != null ? mbFmtValue(econ, "fee_sat") : "—"}</span></div>
  </div>`;
}

function mbFmtHashrate(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const eh = n >= 1e15 ? n / 1e18 : n;
  return `${eh.toFixed(1)} EH/s`;
}

function mbRenderMinerSnapshot(snapshot) {
  const el = mbEl("mb-miner-snapshot");
  if (!el) return;
  if (!snapshot || typeof snapshot !== "object") {
    el.innerHTML = '<p class="misc-fng-empty">Blockchair snapshot unavailable — run prefetch or check network</p>';
    return;
  }
  const blocks = [
    {
      label: "Spot price",
      value: snapshot.market_price_usd,
      fmt: "usd",
      sub: "Blockchair live",
    },
    {
      label: "Hash rate (24h)",
      value: snapshot.hashrate_24h,
      fmt: "hashrate",
      sub: "Network security",
      customFmt: mbFmtHashrate(snapshot.hashrate_24h),
    },
    {
      label: "Difficulty",
      value: snapshot.difficulty,
      fmt: "large_int",
      sub: "Mining competition",
    },
    {
      label: "Mempool txs",
      value: snapshot.mempool_transactions,
      fmt: "large_int",
      sub: snapshot.mempool_size ? `${Number(snapshot.mempool_size).toLocaleString()} bytes` : "Pending",
    },
    {
      label: "CDD (24h)",
      value: snapshot.cdd_24h,
      fmt: "large_int",
      sub: "Old coin movement",
    },
    {
      label: "Avg fee (24h)",
      value: snapshot.average_transaction_fee_usd_24h,
      fmt: "usd",
      sub: "Miner fee revenue",
    },
  ];
  el.innerHTML = blocks
    .map((b) => {
      const val = b.customFmt || mbFmtValue(b.value, b.fmt);
      return `<div class="deriv-hero-block" title="${b.sub}">
        <span class="deriv-hero-label">${b.label}</span>
        <span class="deriv-hero-value mono">${val}</span>
        <span class="deriv-hero-sub">${b.sub}</span>
      </div>`;
    })
    .join("");
}

function mbStripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, "").trim();
}

function mbChartForwardLine(forwardOpts) {
  if (!forwardOpts?.key) return "";
  const latest = forwardOpts.latest ?? forwardOpts.extra?.fast ?? forwardOpts.extra?.value;
  return mbBtcPriceForward(forwardOpts.key, latest, forwardOpts.extra || {});
}

function mbSynthesizeChartBullet(label, lines, forwardOpts) {
  const body = (lines || []).filter(Boolean);
  const primary = body[0] || "";
  const forward = mbChartForwardLine(forwardOpts);
  const forwardText = forward
    ? mbStripHtml(forward).replace(/^BTC price ahead:\s*/i, "")
    : "";
  let bullet = `<strong>${label}:</strong> ${primary}`;
  if (forwardText) bullet += ` <em>Forward:</em> ${forwardText}`;
  return bullet;
}

function mbClassifyForwardTone(forwardOpts) {
  const fwd = mbChartForwardLine(forwardOpts);
  if (!fwd) return 0;
  const t = mbStripHtml(fwd).toLowerCase();
  if (/favorable|constructive|supportive|tailwind|accumulation|bottom|recovery|rebound|contrarian|bullish|repair|outperformed|catch-up|squeeze fuel|tightens float|asymmetric upside/.test(t)) {
    return 1;
  }
  if (/cautious|headwind|drawdown|risk|correction|distribution|cap rallies|squeeze-down|stall|mean-revert|overheated|extreme|top|vulnerable|flush|redemptions|underperform/.test(t)) {
    return -1;
  }
  return 0;
}

function mbSynthesizeSectionOutlook({
  tab,
  intro,
  chartEntries,
  cyclePhase,
  score,
  posture,
  footer,
}) {
  const lines = [];
  if (intro) lines.push(intro);

  const bullets = [];
  let constructive = 0;
  let cautious = 0;
  for (const entry of chartEntries || []) {
    const bullet = mbSynthesizeChartBullet(entry.label, entry.lines, entry.forwardOpts);
    if (!bullet) continue;
    bullets.push(bullet);
    const tone = mbClassifyForwardTone(entry.forwardOpts);
    if (tone > 0) constructive += 1;
    else if (tone < 0) cautious += 1;
  }

  if (bullets.length) {
    lines.push("Synthesis from the charts above — each line mirrors the live commentary under that chart:");
    bullets.forEach((b) => lines.push(b));
  }

  const total = chartEntries?.length || 0;
  if (total > 0 && (constructive > 0 || cautious > 0)) {
    lines.push(
      `Forward tilt across ${total} charts: ${constructive} constructive, ${cautious} cautious`
      + (constructive > cautious
        ? " — net constructive bias."
        : cautious > constructive
          ? " — net cautious bias."
          : " — balanced."),
    );
  }

  lines.push(
    `Composite read: ${posture}. Cycle phase: <strong>${cyclePhase.label}</strong> (${cyclePhase.confidence} confidence) — ${cyclePhase.blurb}`,
  );
  lines.push(mbSectionPriceForward(tab, cyclePhase, score));
  if (footer) lines.push(footer);
  return { lines, cyclePhase, score };
}

function mbRenderCommentaryEl(id, lines, forwardOpts = null) {
  const el = mbEl(id);
  if (!el) return;
  let paras = (lines || []).filter(Boolean);
  const fwd = mbChartForwardLine(forwardOpts);
  if (fwd) paras.push(fwd);
  el.innerHTML = paras.length
    ? paras.map((p) => `<p>${p}</p>`).join("")
    : '<p class="macro-muted">Commentary unavailable — waiting for chart data.</p>';
}

function mbIntelSeriesContext(key, chartData, opts = {}) {
  const series = mbFilterSeriesByTimespan(chartData?.series || [], mbState.timespan);
  const latest = mbSeriesLatestValue(series);
  if (latest == null) return null;
  const meta = mbIndicatorMeta(key);
  const fmt = opts.format || meta.format;
  const reading = mbReadingFor(key, latest);
  const avg90 = mbSeriesAvgLastDays(series, 90);
  let trend = "";
  if (avg90 != null && avg90 !== 0) {
    const pct = ((latest - avg90) / Math.abs(avg90)) * 100;
    trend = ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs 90d avg)`;
  }
  return { latest, fmt, reading, trend, series, error: chartData?.error };
}

function mbIntelTrendPhrase(pct, risingWord = "rising", fallingWord = "falling") {
  if (pct == null) return "";
  if (pct >= 8) return `trending higher with ${risingWord} momentum`;
  if (pct >= 2) return `modestly ${risingWord}`;
  if (pct <= -8) return `trending lower with ${fallingWord} momentum`;
  if (pct <= -2) return `modestly ${fallingWord}`;
  return "stable versus recent history";
}

function mbIntelPctVs90(series) {
  const latest = mbSeriesLatestValue(series);
  const avg90 = mbSeriesAvgLastDays(series, 90);
  if (latest == null || avg90 == null || avg90 === 0) return null;
  return ((latest - avg90) / Math.abs(avg90)) * 100;
}

function mbBuildDualCohortCommentary(keyA, keyB, dataA, dataB, cohortLabel) {
  const ctxA = mbIntelSeriesContext(keyA, dataA);
  const ctxB = mbIntelSeriesContext(keyB, dataB);
  if (!ctxA && !ctxB) {
    return [
      `${cohortLabel} data is unavailable — BGeometrics free tier may be rate-limited; cached series will appear when ready.`,
    ];
  }
  const lines = [];
  if (ctxA && ctxB) {
    const sth = ctxA.latest;
    const lth = ctxB.latest;
    const spread = sth - lth;
    lines.push(
      `STH reads ${mbFmtValue(sth, ctxA.fmt)}${ctxA.trend}; LTH reads ${mbFmtValue(lth, ctxB.fmt)}${ctxB.trend}. `
      + (spread > 0.15
        ? "Short-term holders are stretched further above cost basis than seasoned holders — near-term profit-taking risk tends to rise first in this configuration."
        : spread < -0.15
          ? "Long-term holders carry more paper profit than recent buyers — macro distribution psychology can dominate even if spot looks calm."
          : "Cohorts are aligned — no extreme divergence between recent buyers and seasoned holders on this lens."),
    );
    if (ctxA.reading || ctxB.reading) {
      lines.push(
        `STH: ${ctxA.reading || "equilibrium band"}. LTH: ${ctxB.reading || "equilibrium band"}. `
        + "STH reacts quickly to rallies and pullbacks; LTH extremes often lag macro cycle turns.",
      );
    }
  } else {
    const ctx = ctxA || ctxB;
    lines.push(`${ctx.reading || mbShortReading(keyA)} Latest: ${mbFmtValue(ctx.latest, ctx.fmt)}${ctx.trend}.`);
  }
  return lines;
}

function mbBuildIntelChartCommentary(key, chartData, charts = {}) {
  const ctx = mbIntelSeriesContext(key, chartData);
  if (!ctx) {
    const err = chartData?.error;
    return [
      err
        ? `Data unavailable (${String(err).slice(0, 100)}). Commentary will populate when the series loads.`
        : "Waiting for series data — run Refresh or check BGeometrics / Santiment API limits.",
    ];
  }

  const { latest, fmt, reading, trend, series } = ctx;
  const pct90 = mbIntelPctVs90(series);
  const trendPhrase = mbIntelTrendPhrase(pct90);

  switch (key) {
    case "sth_lth_mvrv":
      return mbBuildDualCohortCommentary("sth_mvrv", "lth_mvrv", charts.sth_mvrv, charts.lth_mvrv, "Cohort MVRV");
    case "sth_lth_nupl":
      return mbBuildDualCohortCommentary("sth_nupl", "lth_nupl", charts.sth_nupl, charts.lth_nupl, "Cohort NUPL");
    case "asopr":
      return [
        `ASOPR is ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (latest >= 1.03
          ? "Adjusted profit-taking dominates: coins are moving at a profit after stripping same-block noise, a cleaner sell-pressure signal than raw SOPR."
          : latest < 0.98
            ? "Capitulation selling shows up in ASOPR — holders are crystallizing losses, which historically clusters near local washouts."
            : "Moves are near breakeven — neither aggressive profit-taking nor loss-driven capitulation on this cleaner lens."),
        reading ? `${reading} Watch for sustained breaks above 1.03 or below 0.98 as confirmation.` : "",
      ];
    case "vdd_multiple":
      return [
        `VDD Multiple is ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (latest >= 2.5
          ? "Old, seasoned coins are moving in size relative to the yearly norm — historically associated with distribution phases and cycle tops."
          : latest <= 0.5
            ? "Coin-days destroyed are quiet — HODLing dominates and long-term supply is not waking up to sell."
            : "Old-coin movement is in a normal band — no extreme destruction signal from seasoned supply."),
        "Pair with cohort MVRV/NUPL: VDD spikes often coincide with LTH taking profits into strength.",
      ];
    case "nrpl_usd": {
      const abs = Math.abs(latest);
      const billions = abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : mbFmtValue(abs, "usd");
      return [
        `Net realized P/L is ${latest >= 0 ? "+" : "−"}$${billions}${trend}. `
        + (latest >= 5e9
          ? "Heavy realized profit is hitting the ledger — distribution and profit-taking are actively flowing through on-chain settlement."
          : latest <= -5e9
            ? "Large realized losses are being crystallized — capitulation selling is showing up in USD terms, often seen near local bottoms."
            : latest > 0
              ? "The network is booking net realized profit, but not at an extreme daily spike — orderly profit-taking rather than a blow-off."
              : latest < 0
                ? "Net realized loss is modest — some underwater coins are moving, but not at capitulation scale."
                : "Realized P/L is near flat — moved coins are roughly breaking even in aggregate."),
        "NRPL leads spot: sustained positive spikes can precede stalls; deep negative prints often mark seller exhaustion.",
      ];
    }
    case "utxos_in_profit_pct":
      return [
        `${mbFmtValue(latest, fmt)} of UTXOs are in profit${trend} — ${trendPhrase}. `
        + (latest >= 90
          ? "Breadth is very high — most individual outputs are profitable, which raises the odds of incremental selling as holders have gains to harvest."
          : latest <= 40
            ? "A large share of UTXOs are underwater — stress is broad at the output level, often seen in bear-market accumulation zones."
            : "Profit breadth is mixed — neither euphoric nor capitulatory by UTXO count."),
        "UTXO profit % moves faster than supply-in-profit and is useful for spotting short-term holder stress.",
      ];
    case "san_exchange_inflow":
      return [
        `Santiment exchange inflow is ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 8
          ? "USD deposits to exchanges are elevated — historically a headwind for spot as liquid supply on venues builds."
          : pct90 != null && pct90 <= -8
            ? "Inflows are subdued versus recent norms — less immediate sell pressure from fresh exchange deposits."
            : "Inflows are not at an extreme — monitor alongside outflow for net positioning."),
        "Cross-check Coin Metrics exchange netflow on the On-chain Activity tab for a second free-source read.",
      ];
    case "san_exchange_outflow":
      return [
        `Santiment exchange outflow is ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 8
          ? "Withdrawals are strong — coins leaving exchanges support accumulation and self-custody narratives."
          : pct90 != null && pct90 <= -8
            ? "Outflows have softened — less evidence of coins moving to cold storage right now."
            : "Outflows are in a typical range — no strong accumulation or distribution signal from this lens alone."),
        "Sustained outflow > inflow is constructive for medium-term supply tightness on exchanges.",
      ];
    case "san_daily_active_addresses":
      return [
        `Santiment active addresses: ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
        + (pct90 != null && pct90 >= 5
          ? "Network participation is expanding — more unique addresses transacted, supportive of adoption and usage narratives."
          : pct90 != null && pct90 <= -5
            ? "On-chain participation is cooling — quieter address activity; not always bearish (L2 volume is off-chain)."
            : "Address activity is near recent averages."),
        "Compare with Blockchain.info active addresses on the On-chain Activity tab for confirmation.",
      ];
    default:
      return [
        `${mbIndicatorMeta(key).label} is ${mbFmtValue(latest, fmt)}${trend}. ${reading || mbShortReading(key)}`,
      ];
  }
}

function mbIntelSignalScore(label, tone) {
  const map = { bull2: 2, bull: 1, neutral: 0, info: 0, warn: -1, bear: -2, bear2: -3 };
  return { label, tone, score: map[tone] ?? 0 };
}

function mbDetectCyclePhase(bundle) {
  const charts = bundle?.charts || {};
  const scores = { accumulation: 0, markup: 0, distribution: 0, capitulation: 0 };
  const sthMvrv = mbIntelSeriesContext("sth_mvrv", charts.sth_mvrv)?.latest;
  const lthMvrv = mbIntelSeriesContext("lth_mvrv", charts.lth_mvrv)?.latest;
  const sthNupl = mbIntelSeriesContext("sth_nupl", charts.sth_nupl)?.latest;
  const lthNupl = mbIntelSeriesContext("lth_nupl", charts.lth_nupl)?.latest;
  const asopr = mbIntelSeriesContext("asopr", charts.asopr)?.latest;
  const vdd = mbIntelSeriesContext("vdd_multiple", charts.vdd_multiple)?.latest;
  const nrpl = mbIntelSeriesContext("nrpl_usd", charts.nrpl_usd)?.latest;
  const utxo = mbIntelSeriesContext("utxos_in_profit_pct", charts.utxos_in_profit_pct)?.latest;
  const sanIn = mbIntelSeriesContext("san_exchange_inflow", charts.san_exchange_inflow)?.latest;
  const sanOut = mbIntelSeriesContext("san_exchange_outflow", charts.san_exchange_outflow)?.latest;

  if (asopr != null && asopr < 0.98) scores.capitulation += 3;
  if (sthNupl != null && sthNupl <= 0) scores.capitulation += 2;
  if (sthMvrv != null && sthMvrv < 0.95) scores.capitulation += 2;
  if (nrpl != null && nrpl <= -3e9) scores.capitulation += 3;
  if (utxo != null && utxo <= 42) scores.capitulation += 2;

  if (lthMvrv != null && lthMvrv >= 2.5) scores.distribution += 2;
  if (sthMvrv != null && sthMvrv >= 1.45) scores.distribution += 2;
  if (lthNupl != null && lthNupl >= 0.65) scores.distribution += 2;
  if (asopr != null && asopr >= 1.03) scores.distribution += 2;
  if (vdd != null && vdd >= 2) scores.distribution += 3;
  if (nrpl != null && nrpl >= 3e9) scores.distribution += 2;
  if (utxo != null && utxo >= 88) scores.distribution += 1;
  if (sanIn != null && sanOut != null && sanIn > sanOut * 1.08) scores.distribution += 2;

  if (sanIn != null && sanOut != null && sanOut > sanIn * 1.08) scores.accumulation += 3;
  if (vdd != null && vdd <= 0.65) scores.accumulation += 2;
  if (sthMvrv != null && sthMvrv >= 0.85 && sthMvrv < 1.15) scores.accumulation += 1;
  if (asopr != null && asopr >= 0.99 && asopr <= 1.02) scores.accumulation += 1;
  if (nrpl != null && nrpl < 0 && nrpl > -2e9) scores.accumulation += 1;

  const sthPct = mbIntelPctVs90(mbFilterSeriesByTimespan(charts.sth_mvrv?.series || [], mbState.timespan));
  const asoprPct = mbIntelPctVs90(mbFilterSeriesByTimespan(charts.asopr?.series || [], mbState.timespan));
  if (sthPct != null && sthPct >= 3) scores.markup += 2;
  if (asoprPct != null && asoprPct >= 2 && asopr != null && asopr >= 1 && asopr < 1.03) scores.markup += 2;
  if (sthMvrv != null && sthMvrv >= 1.05 && sthMvrv < 1.4) scores.markup += 2;
  if (lthMvrv != null && lthMvrv >= 1.1 && lthMvrv < 2.2) scores.markup += 1;
  if (vdd != null && vdd >= 0.7 && vdd < 1.8) scores.markup += 1;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topPhase, topScore] = ranked[0];
  const [, secondScore] = ranked[1] || ["", 0];
  const phase = topScore > 0 && topScore >= secondScore ? topPhase : "markup";

  const copy = {
    accumulation: {
      label: "Accumulation",
      tone: "accumulation",
      blurb: "Coins are moving off exchanges, old supply is quiet, and recent buyers are not overstretched — classic basing / smart-money absorption.",
    },
    markup: {
      label: "Markup",
      tone: "markup",
      blurb: "Trend and cohort metrics lean constructive without blow-off extremes — price discovery with manageable profit-taking.",
    },
    distribution: {
      label: "Distribution",
      tone: "distribution",
      blurb: "Seasoned supply, profit-taking, and exchange deposits are active — overhead supply risk rises into strength.",
    },
    capitulation: {
      label: "Capitulation",
      tone: "capitulation",
      blurb: "Loss-driven spending and stressed breadth dominate — seller exhaustion often builds in this phase before trend repair.",
    },
  };

  const conf = topScore >= 5 ? "high" : topScore >= 3 ? "moderate" : "low";
  const meta = copy[phase] || copy.markup;
  return { phase, label: meta.label, tone: meta.tone, blurb: meta.blurb, confidence: conf, scores };
}

function mbCyclePhaseBadgeHtml(phaseInfo) {
  if (!phaseInfo?.label) return "";
  const confLabel = phaseInfo.confidence === "high" ? "High confidence" : phaseInfo.confidence === "moderate" ? "Moderate confidence" : "Low confidence";
  return `<div class="mb-cycle-phase-wrap" title="${mbEscapeAttr(phaseInfo.blurb)}">
    <span class="mb-cycle-phase-badge mb-cycle-phase-badge--${phaseInfo.tone}">${phaseInfo.label}</span>
    <span class="mb-cycle-phase-conf">${confLabel}</span>
    <span class="mb-cycle-phase-blurb">${phaseInfo.blurb}</span>
  </div>`;
}

function mbIntelligenceChartEntries(bundle) {
  const charts = bundle?.charts || {};
  const sthMvrv = mbIntelSeriesContext("sth_mvrv", charts.sth_mvrv);
  const sthNupl = mbIntelSeriesContext("sth_nupl", charts.sth_nupl);
  const specs = [
    { elId: "mb-commentary-sth_lth_mvrv", label: "Cohort MVRV", key: "sth_lth_mvrv" },
    { elId: "mb-commentary-sth_lth_nupl", label: "Cohort NUPL", key: "sth_lth_nupl" },
    { elId: "mb-commentary-asopr", label: "ASOPR", key: "asopr" },
    { elId: "mb-commentary-vdd_multiple", label: "VDD Multiple", key: "vdd_multiple" },
    { elId: "mb-commentary-nrpl_usd", label: "NRPL (USD)", key: "nrpl_usd" },
    { elId: "mb-commentary-utxos_in_profit_pct", label: "UTXOs in profit", key: "utxos_in_profit_pct" },
    { elId: "mb-commentary-san_exchange_inflow", label: "Santiment inflow", key: "san_exchange_inflow" },
    { elId: "mb-commentary-san_exchange_outflow", label: "Santiment outflow", key: "san_exchange_outflow" },
    { elId: "mb-commentary-san_daily_active_addresses", label: "Santiment active addresses", key: "san_daily_active_addresses" },
  ];
  return specs.map(({ elId, label, key }) => {
    const data = key.startsWith("sth_lth") ? null : charts[key];
    const ctx = key.startsWith("sth_lth") ? null : mbIntelSeriesContext(key, data);
    let extra = { pct90: ctx ? mbIntelPctVs90(ctx.series) : null };
    if (key === "sth_lth_mvrv") {
      extra = {
        sthElevated: sthMvrv?.latest >= 1.45,
        sthUnderwater: sthMvrv?.latest < 1,
        latest: sthMvrv?.latest,
      };
    }
    if (key === "sth_lth_nupl") {
      extra = { sthEuphoric: sthNupl?.latest >= 0.6, latest: sthNupl?.latest };
    }
    return {
      elId,
      label,
      lines: mbBuildIntelChartCommentary(key, data, charts),
      forwardOpts: { key, latest: ctx?.latest ?? extra.latest, extra },
    };
  });
}

function mbBuildIntelligenceOutlook(bundle) {
  const charts = bundle?.charts || {};
  const cells = mbSnapshot?.cells || {};
  const signals = [];
  const cyclePhase = mbDetectCyclePhase(bundle);

  const addFromKey = (key, valOverride = null) => {
    const val = valOverride ?? mbCellLatestValue(key, cells[key] || {});
    const badges = mbSignalBadges(key, val, cells[key] || {}, cells);
    for (const b of badges) signals.push(mbIntelSignalScore(b.label, b.tone));
  };

  ["sth_mvrv", "lth_mvrv", "sth_nupl", "lth_nupl", "asopr", "vdd_multiple", "nrpl_usd", "utxos_in_profit_pct"].forEach((k) => {
    const ctx = mbIntelSeriesContext(k, charts[k]);
    addFromKey(k, ctx?.latest ?? null);
  });

  ["san_exchange_inflow", "san_exchange_outflow", "san_daily_active_addresses"].forEach((k) => {
    const ctx = mbIntelSeriesContext(k, charts[k]);
    if (ctx) addFromKey(k, ctx.latest);
  });

  const score = signals.reduce((sum, s) => sum + s.score, 0);
  const posture = score >= 4
    ? "constructive / accumulation-leaning"
    : score >= 1
      ? "mildly constructive with mixed signals"
      : score <= -4
        ? "distribution-leaning / elevated top risk"
        : score <= -1
          ? "cautious — profit-taking and overhead supply dominate"
          : "neutral — no strong cohort or flow extreme";
  const chartEntries = mbIntelligenceChartEntries(bundle);

  return mbSynthesizeSectionOutlook({
    tab: "intelligence",
    intro:
      "On-Chain Intelligence splits holder behavior into cohorts (STH vs LTH), realized versus unrealized profit, old-coin movement, and exchange-flow proxies. "
      + "The synthesis below reflects each chart's live conclusion.",
    chartEntries,
    cyclePhase,
    score,
    posture,
    footer:
      "Automated commentary from free APIs (BGeometrics, Santiment) — educational context only, not financial advice. "
      + `Timespan: ${mbState.timespan}. Refresh updates cohort charts and this synthesis.`,
  });
}

function mbRenderIntelligenceCommentary(bundle) {
  const entries = mbIntelligenceChartEntries(bundle);
  for (const entry of entries) {
    mbRenderCommentaryEl(entry.elId, entry.lines, entry.forwardOpts);
  }
  mbRenderAllChartEducation([
    "sth_lth_mvrv", "sth_lth_nupl", "asopr", "vdd_multiple", "nrpl_usd", "utxos_in_profit_pct",
    "san_exchange_inflow", "san_exchange_outflow", "san_daily_active_addresses",
  ]);
  mbRenderTabOutlook("mb-intelligence-outlook-head", "mb-intelligence-commentary", mbBuildIntelligenceOutlook(bundle));
}

async function mbRenderIntelligenceCharts(force = false) {
  if (!window.Plotly) return;
  const dualCharts = [
    ["mb-chart-sth-lth-mvrv", "sth_mvrv", "lth_mvrv", "sth_lth_mvrv", ["#38bdf8", "#a78bfa"]],
    ["mb-chart-sth-lth-nupl", "sth_nupl", "lth_nupl", "sth_lth_nupl", ["#f472b6", "#818cf8"]],
  ];
  const singleCharts = [
    ["mb-chart-asopr", "asopr", "#fb923c"],
    ["mb-chart-vdd", "vdd_multiple", "#e879f9"],
    ["mb-chart-nrpl", "nrpl_usd", "#34d399"],
    ["mb-chart-utxos-profit", "utxos_in_profit_pct", "#4ade80"],
  ];
  const sanCharts = [
    ["mb-chart-san-inflow", "san_exchange_inflow", "#f472b6"],
    ["mb-chart-san-outflow", "san_exchange_outflow", "#38bdf8"],
    ["mb-chart-san-active", "san_daily_active_addresses", "#fbbf24"],
  ];
  for (const [elId] of [...dualCharts, ...singleCharts, ...sanCharts]) {
    mbSetChartMessage(mbEl(elId), "Loading chart…");
  }
  try {
    const bundle = await mbLoadIntelligenceBundle(mbState.timespan, force);
    const charts = bundle.charts || {};
    for (const [elId, keyA, keyB, displayKey, colors] of dualCharts) {
      mbRenderDualChart(elId, keyA, keyB, charts[keyA], charts[keyB], colors, displayKey);
    }
    for (const [elId, seriesKey, color] of singleCharts) {
      mbRenderSingleChart(elId, seriesKey, color, charts[seriesKey], seriesKey);
    }
    for (const [elId, seriesKey, color] of sanCharts) {
      mbRenderSingleChart(elId, seriesKey, color, charts[seriesKey], seriesKey);
    }
    const sanMeta = mbEl("mb-santiment-meta");
    if (sanMeta) {
      const hasSan = ["san_exchange_inflow", "san_exchange_outflow", "san_daily_active_addresses"]
        .some((k) => (charts[k]?.series || []).some((p) => p.value != null));
      const err = charts.san_exchange_inflow?.error || charts.san_daily_active_addresses?.error;
      sanMeta.textContent = hasSan
        ? "Santiment · free API"
        : (err ? `Santiment — ${String(err).slice(0, 80)}` : "Requires SANTIMENT_API_KEY");
    }
    mbRenderIntelligenceCommentary(bundle);
  } catch (err) {
    for (const [elId] of [...dualCharts, ...singleCharts, ...sanCharts]) {
      mbSetChartMessage(mbEl(elId), err.message || "Load failed");
    }
    const head = mbEl("mb-intelligence-outlook-head");
    if (head) head.innerHTML = "";
    mbRenderCommentaryEl("mb-intelligence-commentary", [
      `Intelligence bundle failed to load — ${err.message || "error"}. Commentary will appear after a successful refresh.`,
    ]);
  }
}

async function mbRenderMinerCharts(force = false) {
  if (!window.Plotly) return;
  const chartMap = [
    ["mb-chart-puell-miner", "puell_multiple", "puell_multiple_miner", "#fbbf24"],
    ["mb-chart-hashprice", "hashprice", "hashprice", "#34d399"],
    ["mb-chart-hashrate-bg", "hashrate_bg", "hashrate_bg", "#14b8a6"],
    ["mb-chart-hashribbons", "hashribbons", "hashribbons", "#a78bfa"],
    ["mb-chart-difficulty", "difficulty", "difficulty", "#60a5fa"],
    ["mb-chart-thermo", "thermo_price", "thermo_price", "#f472b6"],
    ["mb-chart-miners-rev", "miners_revenue", "miners_revenue", "#fb923c"],
  ];
  for (const [elId] of chartMap) {
    mbSetChartMessage(mbEl(elId), "Loading chart…");
  }
  try {
    const bundle = await mbLoadMinerBundle(mbState.timespan, force);
    mbRenderMinerSnapshot(bundle.snapshot);
    for (const [elId, seriesKey, displayKey, color] of chartMap) {
      mbRenderSingleChart(elId, seriesKey, color, bundle.charts?.[seriesKey], displayKey);
    }
    mbRenderMinerCommentary(bundle);
  } catch (err) {
    mbRenderMinerSnapshot(null);
    for (const [elId] of chartMap) {
      mbSetChartMessage(mbEl(elId), err.message || "Load failed");
    }
    const head = mbEl("mb-miner-outlook-head");
    if (head) head.innerHTML = "";
    mbRenderCommentaryEl("mb-miner-commentary", [`Miner bundle failed — ${err.message || "error"}.`]);
  } finally {
    await window.mbVmRenderTab?.("miner", "mb-miner-frameworks-root", force);
  }
}

async function mbRenderPrefetchStatus(force = false) {
  const el = mbEl("mb-prefetch-status");
  const metaEl = mbEl("mb-prefetch-meta");
  if (!el) return;
  el.innerHTML = '<p class="misc-fng-empty">Loading prefetch status…</p>';
  try {
    const data = await mbLoadPrefetchStatus(force);
    const reg = data.registry || {};
    const env = data.env || {};
    const inv = data.inventory || [];
    const stale = data.staleQueue || [];
    if (metaEl) {
      metaEl.textContent = `${reg.stored || 0}/${reg.enabled || 0} metrics stored · data/btc-series/`;
    }
    const envFlags = [
      ["Santiment", env.santiment],
      ["Dune", env.dune],
      ["BGeometrics key", env.bgeometrics],
      ["Dune queries", env.duneQueries ? `${env.duneQueries} configured` : "0 configured"],
    ];
    const invRows = inv
      .slice(0, 40)
      .map((row) => {
        const staleMark = row.stale ? " · stale" : "";
        const err = row.error ? ` · ${String(row.error).slice(0, 40)}` : "";
        return `<tr>
          <td class="mono">${row.metricId}</td>
          <td class="mono">${row.pointCount ?? "—"}</td>
          <td>${mbSourceBadge(row.source || "—")}</td>
          <td class="macro-muted">${row.fetchedAt || row.storedAt || "—"}${staleMark}${err}</td>
        </tr>`;
      })
      .join("");
    const staleList = stale.length
      ? `<ul class="mb-prefetch-stale">${stale.slice(0, 12).map((s) => `<li><span class="mono">${s.id}</span> · ${s.source} · ${s.label}</li>`).join("")}</ul>`
      : '<p class="mb-prefetch-empty">No stale metrics in queue</p>';
    el.innerHTML = `
      <div class="mb-prefetch-summary">
        <div class="deriv-hero-block"><span class="deriv-hero-label">Stored</span><span class="deriv-hero-value mono">${reg.stored ?? 0}</span><span class="deriv-hero-sub">of ${reg.enabled ?? 0} enabled</span></div>
        <div class="deriv-hero-block"><span class="deriv-hero-label">Stale queue</span><span class="deriv-hero-value mono">${reg.stale ?? stale.length}</span><span class="deriv-hero-sub">awaiting refresh</span></div>
        <div class="deriv-hero-block"><span class="deriv-hero-label">Catalog</span><span class="deriv-hero-value mono">${reg.total ?? 0}</span><span class="deriv-hero-sub">registry metrics</span></div>
      </div>
      <div class="mb-prefetch-env">
        ${envFlags.map(([label, on]) => `<span class="mb-prefetch-flag${on ? " mb-prefetch-flag--on" : ""}">${label}: ${on ? "✓" : "—"}</span>`).join("")}
      </div>
      <h3 class="macro-drivers-h3">Local series inventory</h3>
      <div class="mb-prefetch-table-wrap">
        <table class="deriv-table md-table mb-prefetch-table">
          <thead><tr><th>Metric</th><th>Points</th><th>Source</th><th>Updated</th></tr></thead>
          <tbody>${invRows || '<tr><td colspan="4">No stored series yet — run scripts/btc_prefetch.py</td></tr>'}</tbody>
        </table>
      </div>
      <h3 class="macro-drivers-h3">Stale prefetch queue</h3>
      ${staleList}
      <p class="mb-prefetch-hint macro-muted">Server warms prefetch on startup. CLI: <code>python scripts/btc_prefetch.py --status</code></p>`;
  } catch (err) {
    el.innerHTML = `<p class="misc-fng-empty">Prefetch status failed — ${err.message || "error"}</p>`;
  }
}

function mbFngSeriesAvg(series, days = 30) {
  if (!series?.length) return null;
  const cutoff = Date.now() / 1000 - days * 86400;
  const vals = series
    .map((p) => ({ v: Number(p.value), ts: Number(p.timestamp) }))
    .filter(({ v, ts }) => Number.isFinite(v) && Number.isFinite(ts) && ts >= cutoff)
    .map(({ v }) => v);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function mbBuildFearGreedCommentary(fngData, history = false) {
  const latest = fngData?.latest;
  const cell = mbSnapshot?.cells?.fear_greed || {};
  const val = latest?.value ?? cell.value;
  if (val == null) return ["Fear & Greed data unavailable — Alternative.me may be unreachable."];
  const reading = mbReadingFor("fear_greed", val);
  const zone = latest?.classification || reading;

  if (!history) {
    return [
      `Fear & Greed reads <strong>${Math.round(val)}</strong> (${zone || "—"}). `
      + (val >= 75
        ? "Extreme Greed — euphoria and FOMO risk elevated; historically a zone where corrections catch overcrowded longs."
        : val >= 56
          ? "Greed — risk-on positioning; bullish sentiment but less contrarian edge than extreme fear."
          : val <= 24
            ? "Extreme Fear — capitulation psychology; historically where contrarian accumulators step in."
            : val <= 44
              ? "Fear — cautious market; participants defensive but not at panic extremes."
              : "Neutral — balanced sentiment without a strong fear or greed tilt."),
      "Composite of volatility, momentum, social, surveys, and dominance — a sentiment overlay, not a timing signal alone.",
    ];
  }

  const series = fngData?.series || [];
  const avg30 = mbFngSeriesAvg(series, 30);
  const trend = avg30 != null ? val - avg30 : null;
  return [
    `12-month history: latest ${Math.round(val)}`
    + (trend != null ? ` (${trend >= 0 ? "+" : ""}${trend.toFixed(0)} vs 30d avg of ${avg30.toFixed(0)})` : "")
    + ". "
    + (trend != null && trend >= 8
      ? "Sentiment is warming quickly — greed building from a higher baseline."
      : trend != null && trend <= -8
        ? "Sentiment is cooling — fear building; watch for capitulation clusters."
        : "Sentiment is evolving gradually versus the last month."),
    "Sustained extremes (>2 weeks above 75 or below 25) historically mattered more than single-day spikes.",
  ];
}

function mbBuildSentimentChartCommentary(key, chartData) {
  const ctx = mbIntelSeriesContext(key, chartData);
  if (!ctx) {
    return [chartData?.error
      ? `Data unavailable (${String(chartData.error).slice(0, 100)}).`
      : "Waiting for series data."];
  }
  const { latest, fmt, reading, trend, series } = ctx;
  const pct90 = mbIntelPctVs90(series);
  const trendPhrase = mbIntelTrendPhrase(pct90);

  if (key === "btc_dominance") {
    return [
      `BTC dominance: ${mbFmtValue(latest, fmt)}${trend} — ${trendPhrase}. `
      + (latest >= 55
        ? "Bitcoin is leading crypto — flight-to-quality into BTC; alts often underperform."
        : latest <= 45
          ? "Alts gaining share — risk-on rotation; BTC may lag in relative terms."
          : "Dominance balanced — neither strong BTC leadership nor alt-season momentum."),
      reading || "BTC share of total crypto market cap — macro risk-appetite gauge.",
    ];
  }
  if (key === "etf_flow_btc") {
    return [
      `ETF net flow: ${mbFmtValue(latest, fmt)}${trend}. `
      + (latest >= 1000
        ? "Heavy institutional inflow via US spot ETFs — strong structured demand tailwind."
        : latest <= -1000
          ? "Heavy redemptions — institutional selling pressure through ETF wrappers."
          : latest > 0
            ? "Net positive ETF flow — incremental institutional buying."
            : latest < 0
              ? "Net negative ETF flow — redemptions outpacing creations."
              : "Flat ETF flow — no strong institutional impulse today."),
      "Aggregated US spot Bitcoin ETF daily net flow — a key post-2024 demand channel.",
    ];
  }
  return [`${mbIndicatorMeta(key).label}: ${mbFmtValue(latest, fmt)}${trend}. ${reading || ""}`];
}

function mbBuildMarketStructureCommentary() {
  const cells = mbSnapshot?.cells || {};
  const funding = cells.funding_rate;
  const oi = cells.open_interest;
  const fVal = funding?.value != null ? Number(funding.value) : null;
  const oiVal = oi?.value != null ? Number(oi.value) : null;
  const lines = [];

  if (fVal == null && oiVal == null) {
    return ["Funding and open interest snapshots unavailable — refresh overview or check exchange APIs."];
  }

  if (fVal != null) {
    lines.push(
      `Median funding: ${mbFmtValue(fVal, "funding")}. `
      + (fVal >= 0.05
        ? "Elevated positive funding — longs are crowded and paying shorts; leverage flush risk on reversals."
        : fVal <= -0.01
          ? "Negative funding — shorts pay longs; squeeze fuel if price rips higher."
          : fVal > 0.01
            ? "Mild long bias — positive but not extreme carry."
            : "Funding near zero — balanced perpetual positioning."),
    );
  }

  if (oiVal != null) {
    const oiTrend = mbTrendBadges("open_interest", oiVal);
    const oiHint = oiTrend[0]?.title?.split(".")[0] || "Perp leverage gauge";
    lines.push(
      `Open interest: ${mbFmtValue(oiVal, "btc")} (Binance BTCUSDT). ${oiHint}. `
      + "Rising OI with price can mean leveraged trend; falling OI often signals deleveraging.",
    );
  }

  lines.push("Snapshot only on this tab — see Derivatives → Perp for venue-level funding and OI history.");
  return lines;
}

function mbRenderSentimentMarketKpis() {
  const el = mbEl("mb-sentiment-market-kpis");
  if (!el) return;
  const cells = mbSnapshot?.cells || {};
  const funding = cells.funding_rate;
  const oi = cells.open_interest;
  const blocks = [
    {
      label: "Median funding",
      value: funding?.value,
      fmt: "funding",
      sub: funding?.source || "Perp carry",
      hint: mbReadingFor("funding_rate", funding?.value),
    },
    {
      label: "Open interest",
      value: oi?.value,
      fmt: "btc",
      sub: oi?.source || "Binance perp",
      hint: mbShortReading("open_interest"),
    },
  ];
  el.innerHTML = blocks
    .map((b) => `<div class="deriv-hero-block" title="${mbEscapeAttr(b.hint || "")}">
      <span class="deriv-hero-label">${b.label}</span>
      <span class="deriv-hero-value mono">${b.value != null ? mbFmtValue(b.value, b.fmt) : "—"}</span>
      <span class="deriv-hero-sub">${b.sub}</span>
    </div>`)
    .join("");
}

function mbDetectSentimentPhase(ctx) {
  const scores = { accumulation: 0, markup: 0, distribution: 0, capitulation: 0 };
  const fng = ctx.fngVal;
  const etf = mbIntelSeriesContext("etf_flow_btc", ctx.charts?.etf_flow_btc);
  const dom = mbIntelSeriesContext("btc_dominance", ctx.charts?.btc_dominance);
  const funding = ctx.funding;
  const oi = ctx.oi;

  if (fng != null && fng <= 24) scores.capitulation += 4;
  if (fng != null && fng <= 44 && fng > 24) scores.accumulation += 2;
  if (etf?.latest != null && etf.latest <= -800) scores.capitulation += 2;
  if (funding != null && funding <= -0.01) scores.accumulation += 1;

  if (fng != null && fng >= 25 && fng <= 55) scores.accumulation += 2;
  if (etf?.latest != null && etf.latest >= 300) scores.accumulation += 3;
  if (fng != null && fng <= 35 && etf?.latest != null && etf.latest > 0) scores.accumulation += 2;

  if (fng != null && fng >= 45 && fng < 70) scores.markup += 2;
  if (dom?.latest != null && dom.latest >= 52 && dom.latest <= 58) scores.markup += 1;
  if (etf?.latest != null && etf.latest > 0 && etf.latest < 800) scores.markup += 2;
  if (funding != null && funding >= 0 && funding < 0.03) scores.markup += 1;

  if (fng != null && fng >= 75) scores.distribution += 4;
  if (fng != null && fng >= 60) scores.distribution += 2;
  if (etf?.latest != null && etf.latest <= -500) scores.distribution += 3;
  if (funding != null && funding >= 0.04) scores.distribution += 3;
  if (dom?.latest != null && dom.latest >= 58) scores.distribution += 1;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topPhase, topScore] = ranked[0];
  const [, secondScore] = ranked[1] || ["", 0];
  const phase = topScore > 0 && topScore >= secondScore ? topPhase : "markup";
  const copy = {
    accumulation: { label: "Accumulation", tone: "accumulation", blurb: "Fearful sentiment with improving institutional flows — classic contrarian setup when greed is absent and ETFs absorb supply." },
    markup: { label: "Markup", tone: "markup", blurb: "Balanced-to-positive sentiment with constructive dominance and flows — risk-on but not yet euphoric." },
    distribution: { label: "Distribution", tone: "distribution", blurb: "Greed, crowded longs, or ETF outflows dominate — overhead risk as positioning and sentiment stretch." },
    capitulation: { label: "Capitulation", tone: "capitulation", blurb: "Extreme fear and risk-off positioning — panic sentiment where contrarian bids historically emerge." },
  };
  const conf = topScore >= 5 ? "high" : topScore >= 3 ? "moderate" : "low";
  const meta = copy[phase] || copy.markup;
  return { phase, label: meta.label, tone: meta.tone, blurb: meta.blurb, confidence: conf, scores };
}

function mbSentimentChartEntries(ctx) {
  const fngData = window.mbGetFngData?.();
  const cells = mbSnapshot?.cells || {};
  const fngVal = ctx.fngVal ?? fngData?.latest?.value ?? cells.fear_greed?.value;
  const domCtx = mbIntelSeriesContext("btc_dominance", ctx.charts?.btc_dominance);
  const etfCtx = mbIntelSeriesContext("etf_flow_btc", ctx.charts?.etf_flow_btc);
  return [
    {
      elId: "mb-commentary-fear_greed",
      label: "Fear & Greed",
      lines: mbBuildFearGreedCommentary(fngData, false),
      forwardOpts: { key: "fear_greed", latest: fngVal },
    },
    {
      elId: "mb-commentary-fear_greed_history",
      label: "Fear & Greed history",
      lines: mbBuildFearGreedCommentary(fngData, true),
      forwardOpts: { key: "fear_greed_history", latest: fngVal },
    },
    {
      elId: "mb-commentary-btc_dominance",
      label: "BTC dominance",
      lines: mbBuildSentimentChartCommentary("btc_dominance", ctx.charts?.btc_dominance),
      forwardOpts: { key: "btc_dominance", latest: domCtx?.latest },
    },
    {
      elId: "mb-commentary-etf_flow_btc",
      label: "ETF net flow",
      lines: mbBuildSentimentChartCommentary("etf_flow_btc", ctx.charts?.etf_flow_btc),
      forwardOpts: { key: "etf_flow_btc", latest: etfCtx?.latest },
    },
    {
      elId: "mb-commentary-market_structure",
      label: "Market structure",
      lines: mbBuildMarketStructureCommentary(),
      forwardOpts: { key: "market_structure", latest: ctx.funding, extra: { funding: ctx.funding } },
    },
  ];
}

function mbBuildSentimentOutlook(ctx) {
  const cells = mbSnapshot?.cells || {};
  const signals = [];
  const fngVal = ctx.fngVal ?? cells.fear_greed?.value;
  const keys = ["fear_greed", "btc_dominance", "etf_flow_btc", "funding_rate", "open_interest"];

  keys.forEach((k) => {
    let val;
    if (k === "fear_greed") val = fngVal;
    else if (k === "btc_dominance") val = mbIntelSeriesContext(k, ctx.charts?.btc_dominance)?.latest ?? cells[k]?.value;
    else if (k === "etf_flow_btc") val = mbIntelSeriesContext(k, ctx.charts?.etf_flow_btc)?.latest ?? cells[k]?.value;
    else val = cells[k]?.value;
    mbSignalBadges(k, val, cells[k] || {}, cells).forEach((b) => signals.push(mbIntelSignalScore(b.label, b.tone)));
  });

  const score = signals.reduce((sum, s) => sum + s.score, 0);
  const cyclePhase = mbDetectSentimentPhase(ctx);
  const posture = score >= 3 ? "risk-on / constructive" : score <= -3 ? "risk-off / cautious" : "mixed market tone";
  const chartEntries = mbSentimentChartEntries(ctx);

  return mbSynthesizeSectionOutlook({
    tab: "sentiment",
    intro:
      "Sentiment & Market combines crowd psychology (Fear & Greed), BTC vs alt leadership (dominance), "
      + "institutional ETF flows, and perpetual leverage (funding, OI). The synthesis below reflects each chart's live conclusion.",
    chartEntries,
    cyclePhase,
    score,
    posture,
    footer: `Automated commentary from Alternative.me, BGeometrics, and exchange APIs — educational only. Timespan: ${mbState.timespan}.`,
  });
}

function mbRefreshSentimentFngCommentary() {
  if (mbActiveTab !== "sentiment") return;
  const fngData = window.mbGetFngData?.();
  const cells = mbSnapshot?.cells || {};
  const fngVal = fngData?.latest?.value ?? cells.fear_greed?.value;
  const ctx = {
    charts: {},
    fngVal,
    funding: cells.funding_rate?.value != null ? Number(cells.funding_rate.value) : null,
    oi: cells.open_interest?.value != null ? Number(cells.open_interest.value) : null,
  };
  const entries = mbSentimentChartEntries(ctx);
  for (const entry of entries) {
    if (entry.elId === "mb-commentary-fear_greed" || entry.elId === "mb-commentary-fear_greed_history") {
      mbRenderCommentaryEl(entry.elId, entry.lines, entry.forwardOpts);
    }
  }
  mbRenderTabOutlook("mb-sentiment-outlook-head", "mb-sentiment-commentary", mbBuildSentimentOutlook(ctx));
}
window.mbRefreshSentimentFngCommentary = mbRefreshSentimentFngCommentary;

function mbRenderSentimentCommentary(ctx) {
  const entries = mbSentimentChartEntries(ctx);
  for (const entry of entries) {
    mbRenderCommentaryEl(entry.elId, entry.lines, entry.forwardOpts);
  }
  mbRenderAllChartEducation(["fear_greed", "fear_greed_history", "btc_dominance", "etf_flow_btc", "market_structure"]);
  mbRenderTabOutlook("mb-sentiment-outlook-head", "mb-sentiment-commentary", mbBuildSentimentOutlook(ctx));
}

async function mbRenderSentimentCharts(force = false) {
  if (!window.Plotly) return;
  window.setFngElementPrefix?.("mb-fng");
  const chartJobs = [
    ["mb-chart-dominance", "btc_dominance", "#f59e0b"],
    ["mb-chart-etf", "etf_flow_btc", "etf_flow_btc", "#34d399"],
  ];
  for (const [elId] of chartJobs) {
    mbSetChartMessage(mbEl(elId), "Loading chart…");
  }
  mbRenderSentimentMarketKpis();

  const ctx = { charts: {}, fngVal: null, funding: null, oi: null };
  const cells = mbSnapshot?.cells || {};
  ctx.funding = cells.funding_rate?.value != null ? Number(cells.funding_rate.value) : null;
  ctx.oi = cells.open_interest?.value != null ? Number(cells.open_interest.value) : null;

  try {
    await window.loadMiscGreedFear?.(force);
    const fngData = window.mbGetFngData?.();
    ctx.fngVal = fngData?.latest?.value ?? cells.fear_greed?.value;

    const [domData, flows] = await Promise.all([
      mbLoadSeries("btc_dominance", mbState.timespan, force),
      mbLoadFlowsBundle(mbState.timespan, force),
    ]);
    ctx.charts.btc_dominance = domData;
    ctx.charts.etf_flow_btc = flows.charts?.etf_flow_btc;

    mbRenderSingleChart("mb-chart-dominance", "btc_dominance", "#f59e0b", domData, "btc_dominance");
    mbRenderSingleChart("mb-chart-etf", "etf_flow_btc", "#34d399", flows.charts?.etf_flow_btc, "etf_flow_btc");
    mbRenderSentimentMarketKpis();
    mbRenderSentimentCommentary(ctx);
  } catch (err) {
    for (const [elId] of chartJobs) {
      mbSetChartMessage(mbEl(elId), err.message || "Load failed");
    }
    const head = mbEl("mb-sentiment-outlook-head");
    if (head) head.innerHTML = "";
    mbRenderCommentaryEl("mb-sentiment-commentary", [`Sentiment data failed — ${err.message || "error"}.`]);
    mbRenderSentimentCommentary(ctx);
  }
}

async function mbRenderTabCharts(tab, force = false) {
  if (!window.Plotly) return;
  if (tab === "valuation") {
    await mbRenderValuationCharts(force);
    return;
  }
  if (tab === "onchain") {
    await mbRenderOnchainCharts(force);
    return;
  }
  if (tab === "intelligence") {
    await mbRenderIntelligenceCharts(force);
    return;
  }
  if (tab === "miner") {
    await mbRenderMinerCharts(force);
    return;
  }
  if (tab === "sentiment") {
    await mbRenderSentimentCharts(force);
  }
}

function mbPopulateIndicatorSelect() {
  const sel = mbEl("mb-indicator");
  if (!sel) return;
  const indicators = mbTabIndicators(mbActiveTab === "methodology" ? "overview" : mbActiveTab);
  const list = indicators.length ? indicators : mbMeta?.indicators || [];
  sel.innerHTML = list
    .map((i) => `<option value="${i.key}">${i.label}</option>`)
    .join("");
  if (!list.find((i) => i.key === mbState.indicator) && list[0]) {
    mbState.indicator = list[0].key;
  }
  sel.value = mbState.indicator;
}

function mbSyncFilterVisibility() {
  const panel = mbEl("mb-filters-panel");
  if (!panel) return;
  if (mbActiveTab === "methodology") {
    panel.setAttribute("hidden", "");
    return;
  }
  panel.removeAttribute("hidden");
  panel.querySelectorAll("[data-mb-control-group]").forEach((group) => {
    const tabs = (group.dataset.mbControlGroup || "").split(",");
    group.hidden = !tabs.includes(mbActiveTab);
  });
  const indField = mbEl("mb-indicator")?.closest(".md-field");
  if (indField) {
    indField.hidden = mbActiveTab === "intelligence" || mbActiveTab === "miner";
  }
}

function mbSetTab(tab) {
  mbActiveTab = tab;
  document.querySelectorAll(".mb-subtab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mbSub === tab);
  });
  document.querySelectorAll(".mb-bitcoin-panel").forEach((panel) => {
    panel.hidden = panel.dataset.mbSub !== tab;
  });
  mbSyncFilterVisibility();
  mbPopulateIndicatorSelect();
  mbRenderKpis();

  if (tab === "distribution") {
    mbLoadDistribution().then(() => mbRenderDistribution());
  }
  if (tab === "sentiment") {
    window.initMiscGreedFearPoll?.();
    mbRenderTabCharts("sentiment");
  }
  if (tab === "onchain" || tab === "valuation" || tab === "intelligence" || tab === "miner") {
    mbRenderTabCharts(tab);
  }
  if (tab === "methodology") {
    mbRenderMethodologyInline();
    mbRenderPrefetchStatus();
  }
  if (tab === "overview") {
    mbRenderMainChart();
    mbRenderOverviewExecutiveSummary();
  }

  const kpiSection = mbEl("mb-kpi-section");
  if (kpiSection) kpiSection.hidden = tab === "methodology";
}

function mbRenderMethodologyInline() {
  const el = mbEl("mb-methodology-inline");
  if (!el || !mbMeta?.methodology) return;
  el.innerHTML = mbMeta.methodology
    .map(
      (m) => `<article class="mb-methodology-block">
      <h3 class="macro-drivers-h3">${m.title}</h3>
      <p>${m.body}</p>
    </article>`,
    )
    .join("");
}

function mbOpenMethodology() {
  const dlg = mbEl("mb-methodology-dialog");
  const body = mbEl("mb-methodology-body");
  if (!dlg || !body) return;
  body.innerHTML = (mbMeta?.methodology || [])
    .map(
      (m) => `<section><h3>${m.title}</h3><p>${m.body}</p></section>`,
    )
    .join("");
  const indList = (mbMeta?.indicators || [])
    .map(
      (i) =>
        `<tr><td>${i.label}</td><td>${i.source}</td><td>${i.update}</td><td>${i.unit}</td></tr>`,
    )
    .join("");
  body.innerHTML += `<h3>Indicator catalog</h3><table class="deriv-table md-table"><thead><tr><th>Metric</th><th>Source</th><th>Update</th><th>Unit</th></tr></thead><tbody>${indList}</tbody></table>`;
  body.innerHTML += `<p class="md-methodology-updated">Last built: ${mbMeta?.fetchedAt || mbSnapshot?.fetchedAt || "—"}</p>`;
  dlg.showModal();
}

function mbExportCsv() {
  const indicators = mbMergedIndicators();
  const cells = mbSnapshot?.cells || {};
  const rows = [["indicator", "value", "source", "updated"]];
  for (const ind of indicators) {
    const c = cells[ind.key] || {};
    rows.push([ind.label, c.value ?? "", c.source ?? "", c.fetchedAt ?? ""]);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `btc-indicators-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function mbBindUi() {
  if (mbReady) return;
  mbReady = true;

  document.querySelectorAll(".mb-subtab").forEach((btn) => {
    btn.addEventListener("click", () => mbSetTab(btn.dataset.mbSub));
  });

  mbEl("mb-refresh")?.addEventListener("click", async () => {
    mbSeriesCache = {};
    mbValuationBundle = null;
    mbFlowsBundle = null;
    mbNetworkBundle = null;
    mbIntelligenceBundle = null;
    mbMinerBundle = null;
    await Promise.all([mbLoadMeta(true), mbLoadSnapshot(true), mbLoadDistribution(true)]);
    mbRenderTabCharts(mbActiveTab, true);
    if (mbActiveTab === "overview") {
      mbRenderMainChart(true);
      mbRenderOverviewExecutiveSummary(true);
    }
    if (mbActiveTab === "sentiment") mbRenderSentimentCharts(true);
    if (["valuation", "onchain", "miner"].includes(mbActiveTab)) {
      window.mbVmRefreshTab?.(mbActiveTab, true);
    }
    if (mbActiveTab === "methodology") mbRenderPrefetchStatus(true);
  });

  mbEl("mb-export")?.addEventListener("click", mbExportCsv);
  mbEl("mb-methodology-btn")?.addEventListener("click", mbOpenMethodology);
  mbEl("mb-methodology-close")?.addEventListener("click", () => mbEl("mb-methodology-dialog")?.close());

  mbEl("mb-indicator")?.addEventListener("change", (e) => {
    mbState.indicator = e.target.value;
    mbSelectedIndicator = mbState.indicator;
    mbSaveSettings();
    if (mbActiveTab === "overview") mbRenderMainChart();
  });

  mbEl("mb-timespan")?.addEventListener("change", (e) => {
    mbState.timespan = e.target.value;
    mbSaveSettings();
    mbRenderMainChart(true);
    if (mbActiveTab === "overview") mbRenderOverviewExecutiveSummary(true);
    if (["onchain", "valuation", "sentiment", "intelligence", "miner"].includes(mbActiveTab)) {
      mbRenderTabCharts(mbActiveTab, true);
    }
    if (["valuation", "onchain", "miner"].includes(mbActiveTab)) {
      window.mbVmOnTimespanChange?.(mbActiveTab);
    }
  });
}

async function loadMiscBitcoin(force = false) {
  Object.assign(mbState, mbLoadSettings());
  mbBindUi();
  mbSyncFilterVisibility();

  const body = mbEl("mb-table-body");
  if (body && !mbSnapshot) body.innerHTML = '<tr><td colspan="5">Loading…</td></tr>';

  let loadError = null;
  try {
    await Promise.all([
      mbLoadMeta(force),
      window.mbVmLoadMeta?.(force),
    ]);
  } catch (err) {
    loadError = err;
  }

  try {
    await mbLoadSnapshot(force);
  } catch (err) {
    loadError = err;
    if (body && !mbSnapshot?.cells) {
      body.innerHTML = `<tr><td colspan="5">Snapshot unavailable — ${err.message || "error"}</td></tr>`;
    }
  }

  if (mbMeta || mbSnapshot) {
    mbInitChartEducationSlots();
    mbRenderAllChartEducation(MB_EDU_KEYS);
    [
      "mvrv", "mvrv_z_score", "realized_price", "hodl_waves_1y_plus", "nupl", "sopr", "supply_in_profit",
      "active_addresses", "hash_rate", "puell_multiple", "exchange_netflow", "exchange_balance", "tx_count", "mempool_fees",
      "btc_dominance", "etf_flow_btc", "wealth_concentration", "wallet_cohorts", "funding_rate", "open_interest", "fear_greed",
      "sth_lth_mvrv", "sth_lth_nupl", "asopr", "vdd_multiple", "nrpl_usd", "utxos_in_profit_pct",
      "san_exchange_inflow", "san_exchange_outflow", "san_daily_active_addresses", "san_transaction_volume", "san_mvrv_usd",
      "puell_multiple_miner", "hashprice", "hashrate_bg", "hashribbons", "difficulty", "thermo_price", "miners_revenue",
      "stock_to_flow", "stock_to_flow_cross", "power_law", "delta_balanced_price", "pi_cycle_top", "rainbow_chart",
      "nvt_ratio", "metcalfe", "coin_days_destroyed", "difficulty_ribbon",
      "fear_greed_history", "wealth_concentration", "wallet_cohorts",
    ].forEach((k) => mbRenderChartDescription(k));
    mbPopulateIndicatorSelect();
    mbSetTab(mbActiveTab);
    const mbScreen = document.querySelector('#dashboard-valuation .menu-screen[data-l2="indicators"]');
    window.decorateHelpLabels?.(mbScreen);
    mbScreen?.querySelectorAll(".md-kpi-card .help-trigger, .mb-table-row .help-trigger").forEach((btn) => {
      btn.addEventListener("click", (e) => e.stopPropagation());
    });
  } else if (body) {
    body.innerHTML = `<tr><td colspan="5">Load failed — ${loadError?.message || "error"}</td></tr>`;
  }
}

window.loadMiscBitcoin = loadMiscBitcoin;