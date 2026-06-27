const EQ_COLOR_POS = "#00C853";
const EQ_COLOR_NEG = "#FF1744";
const EQ_POLL_MS = 300_000;
const EQ_PERIODS = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "YTD", "Max"];

const GLOBAL_WATCHLIST_STORAGE_KEY = "equity:global:watchlist:v1";
const GLOBAL_HERO_SLOTS = 4;
const GLOBAL_TABLE_MIN = 8;
const GLOBAL_TABLE_MAX = 20;
const GLOBAL_REFETCH_MS = 400;

const DEFAULT_GLOBAL_HEROES = ["^GSPC", "^DJI", "^IXIC", "^RUT"];

const GLOBAL_PERF_COLORS = [
  "#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185",
  "#2dd4bf", "#60a5fa", "#c084fc", "#4ade80", "#f472b6",
];

const GLOBAL_INDEX_CHART_UP = { line: "#4ade80", fill: "rgba(74, 222, 128, 0.22)" };
const GLOBAL_INDEX_CHART_DOWN = { line: "#fb7185", fill: "rgba(251, 113, 133, 0.22)" };
const GLOBAL_INDEX_CHART_FLAT = { line: "#38bdf8", fill: "rgba(56, 189, 248, 0.2)" };

const GLOBAL_PERF_PERIODS = ["1W", "1M", "1Q", "1Y", "WTD", "MTD", "YTD", "3Y", "5Y"];
const GLOBAL_PERF_PERIOD_STORAGE_KEY = "equity:global:perf-period:v1";
const GLOBAL_PERF_FETCH_PERIOD = "5Y";

const DEFAULT_GLOBAL_WATCHLIST = [
  "^GSPC", "^DJI", "^IXIC", "^FTSE", "^GDAXI", "^FCHI", "^N225", "^HSI",
  "000001.SS", "^KS11", "^NSEI", "^AXJO", "^GSPTSE", "ACWI", "EEM",
];

const equityCache = {};
const equityRenderedTabs = new Set();
let equityActive = null;
let equityReady = false;
let equityDataKey = null;
let globalWatchlist = null;
let globalRefetchTimer = null;
let globalWatchlistEventsBound = false;


const eqEl = (id) => document.getElementById(id);

function eqFmtPct(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${Number(n).toFixed(d)}%`;
}

function eqFmtNum(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function eqFmtLarge(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return eqFmtNum(v, 0);
}

function eqChangeClass(n) {
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "";
}

function eqFmtPrice(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1000) {
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return eqFmtNum(n, 2);
}

function eqFmtChange(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}`;
}

function eqFmtPerf(n) {
  return eqFmtPct(n, 1);
}

function getEquityPeriod() {
  return sessionStorage.getItem("equity:period") || "1Y";
}

function setEquityPeriod(p) {
  sessionStorage.setItem("equity:period", p);
}

function normalizeEqTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function padGlobalHeroSlots(heroes) {
  const slots = heroes.map((sym) => normalizeEqTicker(sym));
  while (slots.length < GLOBAL_HERO_SLOTS) slots.push("");
  return slots.slice(0, GLOBAL_HERO_SLOTS);
}

function defaultGlobalTableSlots() {
  const slots = DEFAULT_GLOBAL_WATCHLIST.map((sym) => normalizeEqTicker(sym));
  while (slots.length < GLOBAL_TABLE_MIN) slots.push("");
  return slots.slice(0, GLOBAL_TABLE_MAX);
}

function normalizeGlobalTableSlots(table, isDefault = false) {
  const slots = table.map((sym) => normalizeEqTicker(sym));
  if (isDefault) {
    while (slots.length < GLOBAL_TABLE_MIN) slots.push("");
  } else if (!slots.length) {
    slots.push("");
  }
  return slots.slice(0, GLOBAL_TABLE_MAX);
}

function loadGlobalWatchlist() {
  let saved = null;
  try {
    const raw = localStorage.getItem(GLOBAL_WATCHLIST_STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    saved = null;
  }

  if (!Array.isArray(saved?.table)) {
    try {
      const legacy = sessionStorage.getItem("equity:global:tickers");
      if (legacy) {
        const tickers = JSON.parse(legacy);
        if (Array.isArray(tickers) && tickers.length) {
          globalWatchlist = {
            heroes: padGlobalHeroSlots(DEFAULT_GLOBAL_HEROES),
            table: normalizeGlobalTableSlots(tickers, false),
          };
          persistGlobalWatchlist();
          return globalWatchlist;
        }
      }
    } catch {
      /* ignore */
    }
  }

  globalWatchlist = {
    heroes: padGlobalHeroSlots(
      Array.isArray(saved?.heroes) ? saved.heroes : DEFAULT_GLOBAL_HEROES,
    ),
    table: Array.isArray(saved?.table)
      ? normalizeGlobalTableSlots(saved.table, false)
      : defaultGlobalTableSlots(),
  };
  return globalWatchlist;
}

function persistGlobalWatchlist() {
  if (!globalWatchlist) return;
  localStorage.setItem(GLOBAL_WATCHLIST_STORAGE_KEY, JSON.stringify(globalWatchlist));
}

function getActiveGlobalSymbols() {
  loadGlobalWatchlist();
  const syms = globalWatchlist.table.map(normalizeEqTicker).filter(Boolean);
  return syms.length ? syms : ["^GSPC"];
}

function globalWatchlistCacheKey() {
  if (!globalWatchlist) return "global:watchlist";
  return `global:${globalWatchlist.heroes.join("|")}:${globalWatchlist.table.join("|")}`;
}

function lookupGlobalQuote(symbol, data) {
  const sym = normalizeEqTicker(symbol);
  if (!sym) return null;
  const row = (data?.overview || []).find((r) => r.ticker === sym);
  if (row) return row;
  return {
    ticker: sym,
    name: sym,
    price: null,
    change: null,
    changePct: null,
  };
}

function globalIndexName(ticker, overviewRow, indicesMap) {
  if (overviewRow?.name) return overviewRow.name;
  const entry = Object.entries(indicesMap || {}).find(([, sym]) => sym === ticker);
  return entry ? entry[0] : "—";
}

function captureEqTickerFocus() {
  const active = document.activeElement;
  if (
    active &&
    active.classList?.contains("tradfi-ticker-input") &&
    active.dataset.equityFocus
  ) {
    return {
      key: active.dataset.equityFocus,
      start: active.selectionStart,
      end: active.selectionEnd,
    };
  }
  return null;
}

function restoreEqTickerFocus(focus) {
  if (!focus) return;
  const input = document.querySelector(
    `.tradfi-ticker-input[data-equity-focus="${focus.key}"]`,
  );
  if (!input) return;
  input.focus();
  try {
    input.setSelectionRange(focus.start, focus.end);
  } catch {
    /* ignore */
  }
}

function getCompanySymbol() {
  return sessionStorage.getItem("equity:company:symbol") || "AAPL";
}

function getCompanyPeers() {
  try {
    const raw = sessionStorage.getItem("equity:company:peers");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return ["MSFT", "GOOGL", "AMZN"];
}

function plotLayout(title, height = 420, opts = {}) {
  return {
    template: "plotly_dark",
    title: { text: title, font: { size: 14 } },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 48, r: 24, t: 48, b: 40 },
    height,
    legend: opts.compactLegend
      ? { orientation: "h", y: 1.04, font: { size: 9 }, tracegroupgap: 2 }
      : { orientation: "h", y: 1.12 },
    font: { family: "IBM Plex Sans, sans-serif", size: 11 },
  };
}

function viewportChartHeight(el, opts = {}) {
  const {
    min = 320,
    max = 760,
    bottomPad = 40,
    panelEl = null,
    chartCount = 1,
    gap = 10,
  } = opts;
  const anchor = panelEl || el;
  if (!anchor) return 440;
  const top = anchor.getBoundingClientRect().top;
  const available = window.innerHeight - top - bottomPad;
  const totalGap = Math.max(0, chartCount - 1) * gap;
  const perChart = (available - totalGap) / Math.max(1, chartCount);
  return Math.round(Math.max(min, Math.min(max, perChart)));
}

function resolvePlotlyHeight(el, opts = {}, fallback = 420) {
  if (!opts.fillViewport) return fallback;
  const height = viewportChartHeight(el, opts);
  el.style.height = `${height}px`;
  el.classList.add("equity-plotly-chart--fill");
  return height;
}

function getGlobalPerfPeriod() {
  const saved = sessionStorage.getItem(GLOBAL_PERF_PERIOD_STORAGE_KEY);
  return GLOBAL_PERF_PERIODS.includes(saved) ? saved : "1Y";
}

function setGlobalPerfPeriod(period) {
  if (!GLOBAL_PERF_PERIODS.includes(period)) return;
  sessionStorage.setItem(GLOBAL_PERF_PERIOD_STORAGE_KEY, period);
}

const GLOBAL_PERF_PERIOD_LABELS = {
  "1W": "1 Week",
  "1M": "1 Month",
  "1Q": "1 Quarter",
  "1Y": "1 Year",
  WTD: "Week to date",
  MTD: "Month to date",
  YTD: "Year to date",
  "3Y": "3 Years",
  "5Y": "5 Years",
};

function syncGlobalPerfPeriodSelect() {
  const period = getGlobalPerfPeriod();
  const sel = eqEl("equity-global-perf-period-select");
  if (sel) sel.value = period;
  const meta = eqEl("equity-global-perf-meta");
  if (meta) {
    const label = GLOBAL_PERF_PERIOD_LABELS[period] || period;
    meta.textContent = `${label} · normalized · rebased to 100`;
  }
}

function bindGlobalPerfPeriodSelect() {
  const sel = eqEl("equity-global-perf-period-select");
  if (!sel || sel.dataset.bound) return;
  sel.dataset.bound = "true";
  sel.value = getGlobalPerfPeriod();
  sel.addEventListener("change", () => {
    setGlobalPerfPeriod(sel.value);
    syncGlobalPerfPeriodSelect();
    loadEquityGlobal();
  });
}

function globalPerfChartHeight(el) {
  if (!el) return 480;
  const top = el.getBoundingClientRect().top;
  return Math.round(Math.max(440, Math.min(560, window.innerHeight - top - 80)));
}

function renderGlobalPerformanceChart(el, performance) {
  if (!window.Plotly || !performance?.dates?.length || !el) return;
  const data = performance;
  const series = Object.entries(data.series || {});
  if (!series.length || !data.dates.length) return;
  syncGlobalPerfPeriodSelect();

  const height = globalPerfChartHeight(el);
  el.style.height = `${height}px`;

  const traces = series.map(([name, vals], i) => ({
    x: data.dates,
    y: vals,
    name,
    type: "scatter",
    mode: "lines",
    line: { width: 2.5, color: GLOBAL_PERF_COLORS[i % GLOBAL_PERF_COLORS.length] },
    connectgaps: true,
  }));

  Plotly.newPlot(
    el,
    traces,
    {
      template: "plotly_dark",
      title: { text: "", font: { size: 1 } },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.025)",
      margin: { l: 52, r: 20, t: 12, b: 72 },
      height,
      hovermode: "x unified",
      hoverlabel: {
        bgcolor: "#1e293b",
        bordercolor: "rgba(148, 163, 184, 0.35)",
        font: { family: "IBM Plex Sans, sans-serif", size: 12, color: "#e2e8f0" },
      },
      legend: {
        orientation: "h",
        y: -0.18,
        x: 0,
        font: { size: 11, color: "#cbd5e1" },
        bgcolor: "rgba(0,0,0,0)",
        tracegroupgap: 10,
      },
      xaxis: {
        showgrid: true,
        gridcolor: "rgba(148, 163, 184, 0.16)",
        gridwidth: 1,
        tickfont: { size: 10, color: "#94a3b8" },
        linecolor: "rgba(148, 163, 184, 0.3)",
      },
      yaxis: {
        title: { text: "Rebased (100)", font: { size: 11, color: "#94a3b8" } },
        showgrid: true,
        gridcolor: "rgba(148, 163, 184, 0.16)",
        gridwidth: 1,
        tickfont: { size: 10, color: "#94a3b8" },
        linecolor: "rgba(148, 163, 184, 0.3)",
        zeroline: false,
      },
      font: { family: "IBM Plex Sans, sans-serif", size: 11 },
    },
    { responsive: true, displayModeBar: false },
  );
}

function renderPerformanceChart(el, data, opts = {}) {
  if (!window.Plotly || !data?.dates?.length || !el) return;
  const traces = Object.entries(data.series || {}).map(([name, vals]) => ({
    x: data.dates,
    y: vals,
    name,
    type: "scatter",
    mode: "lines",
  }));
  const height = resolvePlotlyHeight(el, opts, 440);
  const layout = plotLayout("Normalized Performance (Rebased to 100)", height, opts);
  if (opts.compactLegend) {
    layout.margin = { l: 48, r: 24, t: 52, b: 40 };
  }
  Plotly.newPlot(el, traces, layout, {
    responsive: true,
    displayModeBar: false,
  });
}

function eqFmtNewsTime(iso, publishedAtMs) {
  const ms = publishedAtMs || (iso ? Date.parse(iso) : NaN);
  if (!Number.isFinite(ms)) return "Latest available";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "Latest available";

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (d >= startToday) return `Today · ${time}`;
  if (d >= startYesterday) return `Yesterday · ${time}`;

  const ageHours = (now.getTime() - d.getTime()) / 3_600_000;
  if (ageHours < 48) {
    const hrs = Math.max(1, Math.round(ageHours));
    return `${hrs}h ago`;
  }

  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function sortNewsArticles(articles) {
  return [...(articles || [])].sort(
    (a, b) => (b.publishedAtMs || Date.parse(b.publishedAt || 0) || 0)
      - (a.publishedAtMs || Date.parse(a.publishedAt || 0) || 0),
  );
}

function renderGlobalNews(data) {
  const feed = eqEl("equity-global-news");
  if (!feed) return;

  const articles = sortNewsArticles(data?.news || []);
  if (!data?.fetchedAt) {
    feed.innerHTML = '<p class="news-empty">Loading headlines…</p>';
    return;
  }
  if (!articles.length) {
    feed.innerHTML = '<p class="news-empty">No recent headlines for these indices.</p>';
    return;
  }

  const latest = articles[0];
  const latestMeta = eqEl("equity-global-news-latest");
  if (latestMeta) {
    latestMeta.textContent = `Latest: ${eqFmtNewsTime(latest.publishedAt, latest.publishedAtMs)}`;
  }

  feed.innerHTML = articles
    .map((art) => {
      const symbols = (art.symbols || [])
        .map((s) => `<span class="news-card-symbol">${s}</span>`)
        .join("");
      return `
      <article class="news-card">
        <div class="news-card-head">
          <a class="news-card-title" href="${art.link}" target="_blank" rel="noopener noreferrer">${art.title}</a>
          <div class="news-card-badges">${symbols}</div>
        </div>
        <div class="news-card-meta">
          <span class="news-card-source">${art.source || "Yahoo Finance"}</span>
          <span class="news-card-time">${eqFmtNewsTime(art.publishedAt, art.publishedAtMs)}</span>
        </div>
      </article>`;
    })
    .join("");
}

function globalIndexChartStyle(points) {
  const vals = (points || []).map((p) => p.close).filter((v) => v != null);
  if (vals.length < 2) return GLOBAL_INDEX_CHART_FLAT;
  const delta = vals[vals.length - 1] - vals[0];
  if (delta > 0) return GLOBAL_INDEX_CHART_UP;
  if (delta < 0) return GLOBAL_INDEX_CHART_DOWN;
  return GLOBAL_INDEX_CHART_FLAT;
}

function renderCandlestick(el, ohlcv) {
  if (!window.Plotly || !ohlcv?.length) return;
  const dates = ohlcv.map((p) => p.date);
  const traces = [
    {
      type: "candlestick",
      x: dates,
      open: ohlcv.map((p) => p.open),
      high: ohlcv.map((p) => p.high),
      low: ohlcv.map((p) => p.low),
      close: ohlcv.map((p) => p.close),
      name: "Price",
      increasing: { line: { color: EQ_COLOR_POS } },
      decreasing: { line: { color: EQ_COLOR_NEG } },
    },
  ];
  const overlays = [
    ["sma20", "#38bdf8", "SMA 20"],
    ["sma50", "#f59e0b", "SMA 50"],
    ["sma200", "#a78bfa", "SMA 200"],
    ["bbUpper", "#7d8799", "BB Upper"],
    ["bbLower", "#7d8799", "BB Lower"],
  ];
  overlays.forEach(([key, color, name]) => {
    if (ohlcv[0][key] != null) {
      traces.push({
        type: "scatter",
        mode: "lines",
        x: dates,
        y: ohlcv.map((p) => p[key]),
        name,
        line: { width: 1, color },
      });
    }
  });
  if (ohlcv[0].volume != null) {
    traces.push({
      type: "bar",
      x: dates,
      y: ohlcv.map((p) => p.volume),
      name: "Volume",
      yaxis: "y2",
      marker: {
        color: ohlcv.map((p, i) =>
          p.close >= (p.open ?? p.close) ? EQ_COLOR_POS : EQ_COLOR_NEG,
        ),
        opacity: 0.5,
      },
    });
  }
  Plotly.newPlot(el, traces, {
    ...plotLayout("Price & Volume", 520),
    xaxis: { rangeslider: { visible: false } },
    yaxis2: { overlaying: "y", side: "right", showgrid: false },
  }, { responsive: true, displayModeBar: false });
}

function renderIndicatorChart(el, ohlcv, field, title, upper, lower) {
  if (!window.Plotly || !ohlcv?.length || ohlcv[0][field] == null) return;
  const shapes = [];
  if (upper != null) shapes.push({ type: "line", y0: upper, y1: upper, line: { dash: "dot", color: EQ_COLOR_NEG } });
  if (lower != null) shapes.push({ type: "line", y0: lower, y1: lower, line: { dash: "dot", color: EQ_COLOR_POS } });
  Plotly.newPlot(
    el,
    [{ x: ohlcv.map((p) => p.date), y: ohlcv.map((p) => p[field]), type: "scatter", mode: "lines" }],
    { ...plotLayout(title, 200), shapes },
    { responsive: true, displayModeBar: false },
  );
}

function renderBarFinancial(el, rows, field, title) {
  if (!window.Plotly || !rows?.length) return;
  const periods = [];
  const vals = [];
  rows.forEach((r) => {
    if (r.p0 != null) {
      periods.push(r.period_0 || "P0");
      vals.push(r.p0);
    }
  });
  if (!vals.length) return;
  Plotly.newPlot(
    el,
    [{ x: periods, y: vals, type: "bar", marker: { color: "#94a3b8" } }],
    plotLayout(title, 320),
    { responsive: true, displayModeBar: false },
  );
}

function resetEquityRenderedTabs(key) {
  if (key !== equityDataKey) {
    equityDataKey = key;
    equityRenderedTabs.clear();
  }
}

function resizeEquityChartsIn(el) {
  if (!window.Plotly || !el) return;
  requestAnimationFrame(() => {
    el.querySelectorAll(".equity-plotly-chart").forEach((chart) => {
      if (chart.querySelector(".plotly")) Plotly.Plots.resize(chart);
    });
  });
}

function getActiveEquityTab(panel) {
  const active = panel?.querySelector(".equity-subtab.active");
  return active?.dataset.tab || "overview";
}

function renderCompanyTab(tab, data) {
  const key = `company:${tab}`;
  if (equityRenderedTabs.has(key)) return;
  equityRenderedTabs.add(key);

  switch (tab) {
    case "overview":
      renderCandlestick(eqEl("equity-company-candle"), data.ohlcv);
      break;
    case "technicals":
      renderIndicatorChart(eqEl("equity-company-rsi"), data.ohlcv, "rsi", "RSI (14)", 70, 30);
      renderIndicatorChart(eqEl("equity-company-macd"), data.ohlcv, "macd", "MACD", null, null);
      renderIndicatorChart(eqEl("equity-company-stoch"), data.ohlcv, "stochK", "Stochastic %K", 80, 20);
      {
        const signals = eqEl("equity-company-signals");
        if (signals) {
          signals.innerHTML = (data.signals || [])
            .map((s) => `<p class="equity-signal equity-signal--${s.level}">${s.text}</p>`)
            .join("") || "<p class=\"news-empty\">No strong signals at current levels.</p>";
        }
      }
      break;
    case "financials": {
      const rev = (data.financials?.income || []).find((r) => /revenue/i.test(r.line));
      if (rev) renderBarFinancial(eqEl("equity-company-revenue"), [rev], "p0", "Revenue");
      const ratios = eqEl("equity-company-ratios-body");
      if (ratios) {
        ratios.innerHTML = (data.financials?.ratios || [])
          .map((r) => `<tr><td>${r.period}</td><td class="mono">${eqFmtNum(r.debtEquity, 2)}</td><td class="mono">${eqFmtNum(r.currentRatio, 2)}</td></tr>`)
          .join("") || "<tr><td colspan=\"3\">No balance sheet ratios available</td></tr>";
      }
      break;
    }
    case "valuation": {
      const peers = eqEl("equity-company-peers-body");
      if (peers) {
        peers.innerHTML = (data.peersTable || [])
          .map((r) => `<tr><td>${r.ticker}</td><td class="mono">${eqFmtLarge(r.marketCap)}</td><td class="mono">${r.pe ?? "—"}</td><td class="mono">${r.forwardPe ?? "—"}</td><td class="mono">${r.priceToBook ?? "—"}</td></tr>`)
          .join("");
      }
      renderPerformanceChart(eqEl("equity-company-peer-chart"), data.peerPerformance);
      break;
    }
    case "dividends":
      if (data.dividends?.length && window.Plotly) {
        Plotly.newPlot(
          eqEl("equity-company-div-chart"),
          [{ x: data.dividends.map((d) => d.date), y: data.dividends.map((d) => d.amount), type: "bar" }],
          plotLayout("Dividend History", 320),
          { responsive: true, displayModeBar: false },
        );
      }
      break;
    default:
      break;
  }
}

function bindEquitySubtabs(containerId, screenKind) {
  const container = eqEl(containerId);
  if (!container) return;
  const panel = container.closest(".equity-panel");
  if (!panel) return;

  const onTabSelect = (tab) => {
    panel.querySelectorAll(".equity-subtab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    panel.querySelectorAll(".equity-subpanel").forEach((p) => {
      p.hidden = p.dataset.tab !== tab;
    });

    const data = equityCache[screenKind];
    if (data) renderCompanyTab(tab, data);

    const visiblePanel = panel.querySelector(`.equity-subpanel[data-tab="${tab}"]`);
    resizeEquityChartsIn(visiblePanel);
  };

  if (!container.dataset.bound) {
    container.dataset.bound = "true";
    container.querySelectorAll(".equity-subtab").forEach((btn) => {
      btn.addEventListener("click", () => onTabSelect(btn.dataset.tab));
    });
  }

  onTabSelect(getActiveEquityTab(panel));
}

function updateGlobalWatchlistFromInputs() {
  if (!globalWatchlist) loadGlobalWatchlist();

  const heroInputs = document.querySelectorAll(
    "#equity-global-heroes .tradfi-ticker-input",
  );
  heroInputs.forEach((input, i) => {
    globalWatchlist.heroes[i] = normalizeEqTicker(input.value);
  });

  const rowInputs = document.querySelectorAll(
    "#equity-global-overview-body .tradfi-ticker-input",
  );
  const table = [];
  rowInputs.forEach((input) => {
    table.push(normalizeEqTicker(input.value));
  });
  globalWatchlist.table = normalizeGlobalTableSlots(table, false);
  persistGlobalWatchlist();
}

function scheduleGlobalRefetch(immediate = false) {
  if (globalRefetchTimer) clearTimeout(globalRefetchTimer);
  if (immediate) {
    loadEquityGlobal();
    return;
  }
  globalRefetchTimer = setTimeout(() => {
    globalRefetchTimer = null;
    if (equityActive === "global") loadEquityGlobal();
  }, GLOBAL_REFETCH_MS);
}

function bindGlobalWatchlistEvents() {
  if (globalWatchlistEventsBound) return;
  globalWatchlistEventsBound = true;

  const heroes = eqEl("equity-global-heroes");
  const tableBody = eqEl("equity-global-overview-body");
  const addBtn = eqEl("equity-global-add-row");

  const onTickerInput = () => {
    updateGlobalWatchlistFromInputs();
    scheduleGlobalRefetch(false);
  };

  const onTickerCommit = () => {
    updateGlobalWatchlistFromInputs();
    scheduleGlobalRefetch(true);
  };

  heroes?.addEventListener("input", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerInput();
  });
  heroes?.addEventListener("change", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerCommit();
  });
  heroes?.addEventListener("keydown", (e) => {
    if (
      e.target.classList.contains("tradfi-ticker-input") &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      e.target.blur();
      onTickerCommit();
    }
  });

  tableBody?.addEventListener("input", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerInput();
  });
  tableBody?.addEventListener("change", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerCommit();
  });
  tableBody?.addEventListener("keydown", (e) => {
    if (
      e.target.classList.contains("tradfi-ticker-input") &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      e.target.blur();
      onTickerCommit();
    }
  });

  tableBody?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tradfi-row-remove");
    if (!btn || btn.disabled) return;
    const row = btn.closest("tr");
    const idx = Number(row?.dataset.rowIndex);
    if (!Number.isFinite(idx)) return;
    if (!globalWatchlist) loadGlobalWatchlist();
    if (globalWatchlist.table.length <= 1) return;
    globalWatchlist.table.splice(idx, 1);
    if (!globalWatchlist.table.length) globalWatchlist.table.push("");
    persistGlobalWatchlist();
    scheduleGlobalRefetch(true);
  });

  addBtn?.addEventListener("click", () => {
    if (!globalWatchlist) loadGlobalWatchlist();
    if (globalWatchlist.table.length >= GLOBAL_TABLE_MAX) return;
    globalWatchlist.table.push("");
    persistGlobalWatchlist();
    const focus = {
      key: `global-table-${globalWatchlist.table.length - 1}`,
      start: 0,
      end: 0,
    };
    const cached = equityCache.global;
    if (cached) {
      renderGlobalOverview(cached);
    }
    restoreEqTickerFocus(focus);
    scheduleGlobalRefetch(false);
  });
}

function renderGlobalHeroes(data) {
  const strip = eqEl("equity-global-heroes");
  if (!strip || !globalWatchlist) return;
  const focus = captureEqTickerFocus();
  const loading = !data?.fetchedAt;

  if (loading) {
    strip.innerHTML = globalWatchlist.heroes
      .map(
        (sym, i) => `
      <article class="deriv-hero-block tradfi-hero-editable">
        <input
          type="text"
          class="tradfi-ticker-input tradfi-ticker-input--hero"
          value="${sym}"
          placeholder="Symbol"
          spellcheck="false"
          autocomplete="off"
          aria-label="Hero index ${i + 1}"
          data-equity-focus="global-hero-${i}"
        />
        <span class="deriv-hero-value">—</span>
        <span class="deriv-hero-sub">Loading…</span>
      </article>`,
      )
      .join("");
    restoreEqTickerFocus(focus);
    return;
  }

  strip.innerHTML = globalWatchlist.heroes
    .map((sym, i) => {
      const q = lookupGlobalQuote(sym, data);
      const name = globalIndexName(sym, q, data.indices);
      return `
      <article class="deriv-hero-block tradfi-hero-editable">
        <input
          type="text"
          class="tradfi-ticker-input tradfi-ticker-input--hero"
          value="${sym}"
          placeholder="Symbol"
          spellcheck="false"
          autocomplete="off"
          aria-label="Hero index ${i + 1}"
          data-equity-focus="global-hero-${i}"
        />
        ${name && name !== "—" ? `<span class="deriv-hero-label">${name}</span>` : ""}
        <span class="deriv-hero-value ${eqChangeClass(q?.changePct)}">${eqFmtPrice(q?.price)}</span>
        <span class="deriv-hero-sub">${eqFmtChange(q?.change)} · ${eqFmtPct(q?.changePct)}</span>
      </article>`;
    })
    .join("");

  restoreEqTickerFocus(focus);
}

function renderGlobalOverviewCharts(data) {
  const container = eqEl("equity-global-charts");
  if (!container) return false;

  const charts = data.charts?.length
    ? data.charts
    : data.chart?.points?.length
      ? [data.chart]
      : [];
  const mode = data.priceMode || "price";

  container.innerHTML = charts
    .map(
      (ch, i) => `
    <section class="panel tradfi-chart-panel">
      <div class="panel-header">
        <h2>${ch.label || ch.symbol || "Benchmark"}</h2>
        <span class="panel-meta">3-month · daily</span>
      </div>
      <div class="deriv-chart-wrap tradfi-chart-wrap">
        <canvas id="equity-global-chart-${i}" height="280"></canvas>
      </div>
    </section>`,
    )
    .join("");

  charts.forEach((ch, i) => {
    const canvas = eqEl(`equity-global-chart-${i}`);
    const trend = globalIndexChartStyle(ch.points);
    window.mountTradfiChart?.(canvas, ch, mode, {
      ...trend,
      showGrid: true,
      lineWidth: 2.5,
      axisColor: "#a8b4c8",
    });
  });

  return charts.length > 0;
}

function repaintGlobalOverviewCharts(data) {
  if (data?.performance) {
    renderGlobalPerformanceChart(eqEl("equity-global-perf-chart"), data.performance);
  }
  if (!data?.charts?.length) return;
  const mode = data.priceMode || "price";
  data.charts.forEach((ch, i) => {
    const canvas = eqEl(`equity-global-chart-${i}`);
    const trend = globalIndexChartStyle(ch.points);
    window.mountTradfiChart?.(canvas, ch, mode, {
      ...trend,
      showGrid: true,
      lineWidth: 2.5,
      axisColor: "#a8b4c8",
    });
  });
}

function renderGlobalOverview(data) {
  renderGlobalHeroes(data);
  const body = eqEl("equity-global-overview-body");
  if (!body) return;
  if (!globalWatchlist) loadGlobalWatchlist();

  const focus = captureEqTickerFocus();
  const overviewByTicker = Object.fromEntries((data.overview || []).map((r) => [r.ticker, r]));
  const indicesMap = data.indices || equityCache.global?.indices || {};
  const loading = !data?.fetchedAt;
  const canRemove = globalWatchlist.table.length > 1;

  if (loading) {
    body.innerHTML = `<tr><td colspan="11">Loading market data…</td></tr>`;
    return;
  }

  body.innerHTML = globalWatchlist.table
    .map((sym, i) => {
      const ticker = normalizeEqTicker(sym);
      const r = ticker ? overviewByTicker[ticker] : null;
      const name = globalIndexName(ticker, r, indicesMap);
      const perf = r?.perf || {};
      return `
      <tr data-row-index="${i}">
        <td>
          <input
            type="text"
            class="tradfi-ticker-input"
            value="${sym}"
            placeholder="Symbol"
            spellcheck="false"
            autocomplete="off"
            aria-label="Index symbol ${i + 1}"
            data-equity-focus="global-table-${i}"
          />
        </td>
        <td class="tradfi-company-name">${name}</td>
        <td class="mono">${r ? eqFmtPrice(r.price) : "—"}</td>
        <td class="mono ${r ? eqChangeClass(r.change) : ""}">${r ? eqFmtChange(r.change) : "—"}</td>
        <td class="mono ${r ? eqChangeClass(r.changePct) : ""}">${r ? eqFmtPct(r.changePct) : "—"}</td>
        <td class="mono ${eqChangeClass(perf.w1)}">${eqFmtPerf(perf.w1)}</td>
        <td class="mono ${eqChangeClass(perf.m1)}">${eqFmtPerf(perf.m1)}</td>
        <td class="mono ${eqChangeClass(perf.m3)}">${eqFmtPerf(perf.m3)}</td>
        <td class="mono ${eqChangeClass(perf.m12)}">${eqFmtPerf(perf.m12)}</td>
        <td class="mono ${eqChangeClass(perf.ytd)}">${eqFmtPerf(perf.ytd)}</td>
        <td class="tradfi-row-actions">
          <button
            type="button"
            class="tradfi-row-remove"
            aria-label="Remove row ${i + 1}"
            ${canRemove ? "" : "disabled"}
          >×</button>
        </td>
      </tr>`;
    })
    .join("");

  restoreEqTickerFocus(focus);

  renderGlobalPerformanceChart(eqEl("equity-global-perf-chart"), data.performance);

  if (!renderGlobalOverviewCharts(data)) {
    repaintGlobalOverviewCharts(data);
  }

  renderGlobalNews(data);
}

function companyDataKey() {
  return `company:${getCompanySymbol()}:${getCompanyPeers().join(",")}:${getEquityPeriod()}`;
}

function renderGlobalScreen(data) {
  equityCache.global = data;
  renderGlobalOverview(data);

  const meta = eqEl("equity-global-update");
  const swr = window.DashboardSWR;
  if (meta && swr) {
    meta.textContent = swr.formatPanelMeta({
      fetchedAt: data.fetchedAt,
      source: data.source,
    });
  }
}

function renderCompanyScreen(data) {
  equityCache.company = data;
  resetEquityRenderedTabs(companyDataKey());
  const info = data.info || {};
  const grid = eqEl("equity-company-metrics");
  if (grid) {
    grid.innerHTML = `
      <article class="deriv-hero-block"><span class="deriv-hero-label">Price</span>
        <span class="deriv-hero-value ${eqChangeClass(info.changePct)}">${eqFmtNum(info.price)}</span>
        <span class="deriv-hero-sub">${eqFmtPct(info.changePct)}</span></article>
      <article class="deriv-hero-block"><span class="deriv-hero-label">Market Cap</span>
        <span class="deriv-hero-value">${eqFmtLarge(info.marketCap)}</span></article>
      <article class="deriv-hero-block"><span class="deriv-hero-label">P/E</span>
        <span class="deriv-hero-value">${info.pe ?? "—"}</span></article>
      <article class="deriv-hero-block"><span class="deriv-hero-label">EPS</span>
        <span class="deriv-hero-value">${info.eps ?? "—"}</span></article>
      <article class="deriv-hero-block"><span class="deriv-hero-label">Div Yield</span>
        <span class="deriv-hero-value">${info.divYield != null ? eqFmtPct(info.divYield) : "—"}</span></article>
      <article class="deriv-hero-block"><span class="deriv-hero-label">Beta</span>
        <span class="deriv-hero-value">${info.beta ?? "—"}</span></article>`;
  }
  const sector = eqEl("equity-company-sector");
  if (sector) {
    sector.textContent = `${info.name || data.symbol} · ${info.sector || "—"} / ${info.industry || "—"}`;
  }

  renderCompanyTab("overview", data);

  const ret = eqEl("equity-company-return");
  if (ret && data.priceReturn != null) {
    ret.innerHTML = `<span class="mono ${eqChangeClass(data.priceReturn)}">${eqFmtPct(data.priceReturn)}</span> over selected period`;
  }

  const meta = eqEl("equity-company-update");
  const swr = window.DashboardSWR;
  if (meta && swr) {
    meta.textContent = swr.formatPanelMeta({ fetchedAt: data.fetchedAt, source: data.source });
  }
}

async function fetchEquityGlobal() {
  loadGlobalWatchlist();
  const heroes = globalWatchlist.heroes.filter(Boolean);
  const symbols = globalWatchlist.table.filter(Boolean);
  const params = new URLSearchParams({
    period: GLOBAL_PERF_FETCH_PERIOD,
    perfPeriod: getGlobalPerfPeriod(),
  });
  if (heroes.length) params.set("heroes", heroes.join(","));
  if (symbols.length) params.set("symbols", symbols.join(","));
  else if (!heroes.length) params.set("symbols", "^GSPC");
  const res = await fetch(`/api/equity/global?${params}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
  return res.json();
}

async function fetchEquityCompany() {
  const symbol = getCompanySymbol();
  const peers = getCompanyPeers();
  const period = getEquityPeriod();
  const params = new URLSearchParams({ symbol, peers: peers.join(","), period });
  const res = await fetch(`/api/equity/company?${params}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
  return res.json();
}



function bindEquityControls() {
  document.querySelectorAll(".equity-period-select").forEach((periodSel) => {
    if (periodSel.dataset.bound) return;
    periodSel.dataset.bound = "true";
    periodSel.value = getEquityPeriod();
    periodSel.addEventListener("change", () => {
      setEquityPeriod(periodSel.value);
      document.querySelectorAll(".equity-period-select").forEach((s) => {
        if (s !== periodSel) s.value = periodSel.value;
      });
      if (equityActive === "company") loadEquityCompany();
    });
  });
  const symSel = eqEl("equity-company-symbol");
  if (symSel && !symSel.dataset.bound) {
    symSel.dataset.bound = "true";
    const companies = equityCache.company?.defaultCompanies || ["AAPL", "MSFT", "NVDA", "GOOGL"];
    symSel.innerHTML = companies.map((c) => `<option value="${c}">${c}</option>`).join("");
    symSel.value = getCompanySymbol();
    symSel.addEventListener("change", () => {
      sessionStorage.setItem("equity:company:symbol", symSel.value);
      loadEquityCompany();
    });
  }
  const customSym = eqEl("equity-company-custom");
  if (customSym && !customSym.dataset.bound) {
    customSym.dataset.bound = "true";
    customSym.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && customSym.value.trim()) {
        sessionStorage.setItem("equity:company:symbol", customSym.value.trim().toUpperCase());
        loadEquityCompany();
      }
    });
  }
  const peerSel = eqEl("equity-company-peers");
  if (peerSel && !peerSel.dataset.bound) {
    peerSel.dataset.bound = "true";
    const companies = equityCache.company?.defaultCompanies || ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META"];
    peerSel.innerHTML = companies.map((c) => `<option value="${c}">${c}</option>`).join("");
    [...peerSel.options].forEach((o) => {
      o.selected = getCompanyPeers().includes(o.value);
    });
    peerSel.addEventListener("change", () => {
      const peers = [...peerSel.selectedOptions].map((o) => o.value);
      sessionStorage.setItem("equity:company:peers", JSON.stringify(peers));
      loadEquityCompany();
    });
  }
}

async function loadEquityGlobal() {
  equityActive = "global";
  window.tradfiClearActiveSection?.();
  initEquityModule();
  loadGlobalWatchlist();
  bindGlobalWatchlistEvents();
  bindGlobalPerfPeriodSelect();
  bindEquityControls();

  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    const fetchKey = `${globalWatchlistCacheKey()}:${getGlobalPerfPeriod()}`;
    await swr.runSWR({
      key: `equity:global:${fetchKey}`,
      l1: "tradfi",
      source: "Yahoo Finance",
      validate: () => `${globalWatchlistCacheKey()}:${getGlobalPerfPeriod()}` === fetchKey,
      fetch: fetchEquityGlobal,
      render: (data, opts = {}) => {
        if (opts.loading) return;
        if (`${globalWatchlistCacheKey()}:${getGlobalPerfPeriod()}` !== fetchKey) return;
        renderGlobalScreen(data);
        syncGlobalPerfPeriodSelect();
        bindEquityControls();
        window.decorateHelpLabels?.(eqEl("equity-global-screen"));
      },
    });
  } catch (err) {
    console.error("Equity global load failed:", err);
  }
}

async function loadEquityCompany() {
  equityActive = "company";
  window.tradfiClearActiveSection?.();
  initEquityModule();
  bindEquityControls();

  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: `equity:company:${getCompanySymbol()}:${getEquityPeriod()}`,
      l1: "tradfi",
      source: "Yahoo Finance",
      fetch: fetchEquityCompany,
      render: (data, opts = {}) => {
        if (opts.loading) return;
        renderCompanyScreen(data);
        bindEquitySubtabs("equity-company-subtabs", "company");
        bindEquityControls();
        window.decorateHelpLabels?.(eqEl("equity-company-screen"));
      },
    });
  } catch (err) {
    console.error("Equity company load failed:", err);
  }
}

function initEquityModule() {
  if (equityReady) return;
  equityReady = true;
  window.addEventListener("resize", () => {
    if (equityActive !== "global") return;
    const data = equityCache.global;
    if (data) repaintGlobalOverviewCharts(data);
  });
}

window.equityClearActive = () => {
  equityActive = null;
};

window.loadEquityGlobal = loadEquityGlobal;
window.loadEquityCompany = loadEquityCompany;