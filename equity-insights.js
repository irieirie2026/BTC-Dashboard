const EQ_COLOR_POS = "#00C853";
const EQ_COLOR_NEG = "#FF1744";
const EQ_POLL_MS = 300_000;
const EQ_PERIODS = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "YTD", "Max"];
const EQ_MOVERS = ["1D", "WTD", "MTD", "YTD", "1Y"];

const DEFAULT_GLOBAL_TICKERS = [
  "^GSPC", "^DJI", "^IXIC", "^FTSE", "^GDAXI", "^N225", "^HSI", "ACWI",
];

const equityCache = {};
const equityRenderedTabs = new Set();
let equityActive = null;
let equityReady = false;
let equityDataKey = null;

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

function getEquityPeriod() {
  return sessionStorage.getItem("equity:period") || "1Y";
}

function setEquityPeriod(p) {
  sessionStorage.setItem("equity:period", p);
}

function getSelectedGlobalTickers() {
  try {
    const raw = sessionStorage.getItem("equity:global:tickers");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [...DEFAULT_GLOBAL_TICKERS];
}

function setSelectedGlobalTickers(tickers) {
  sessionStorage.setItem("equity:global:tickers", JSON.stringify(tickers));
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

function viewportChartHeight(el, min = 380, max = 720, bottomPad = 28) {
  if (!el) return 440;
  const top = el.getBoundingClientRect().top;
  return Math.round(Math.max(min, Math.min(max, window.innerHeight - top - bottomPad)));
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
  const height = opts.fillViewport ? viewportChartHeight(el) : 440;
  const layout = plotLayout("Normalized Performance (Rebased to 100)", height, opts);
  if (opts.compactLegend) {
    layout.margin = { l: 48, r: 24, t: 52, b: 40 };
  }
  el.style.height = `${height}px`;
  Plotly.newPlot(el, traces, layout, {
    responsive: true,
    displayModeBar: false,
  });
}

function renderCorrelationChart(el, data) {
  if (!window.Plotly || !data?.matrix?.length) return;
  Plotly.newPlot(
    el,
    [{
      z: data.matrix,
      x: data.labels,
      y: data.labels,
      type: "heatmap",
      colorscale: "RdBu",
      zmid: 0,
    }],
    { ...plotLayout("Return Correlation", 400), xaxis: { side: "bottom" } },
    { responsive: true, displayModeBar: false },
  );
}

function renderVolChart(el, data) {
  if (!window.Plotly || !data?.dates?.length) return;
  const traces = Object.entries(data.series || {}).map(([name, vals]) => ({
    x: data.dates.slice(-vals.length),
    y: vals,
    name,
    type: "scatter",
    mode: "lines",
  }));
  Plotly.newPlot(el, traces, plotLayout("Rolling Annualized Volatility (%)", 360), {
    responsive: true,
    displayModeBar: false,
  });
}

function renderGeoChart(el, rows) {
  if (!window.Plotly || !rows?.length) return;
  Plotly.newPlot(
    el,
    [{
      type: "scattergeo",
      lat: rows.map((r) => r.lat),
      lon: rows.map((r) => r.lon),
      text: rows.map((r) => `${r.name}: ${eqFmtPct(r.returnPct)}`),
      marker: {
        size: rows.map((r) => Math.max(8, Math.min(28, r.absReturn * 2))),
        color: rows.map((r) => r.returnPct ?? 0),
        colorscale: [[0, EQ_COLOR_NEG], [0.5, "#888"], [1, EQ_COLOR_POS]],
        cmin: -10,
        cmax: 10,
        colorbar: { title: "Return %" },
      },
    }],
    {
      ...plotLayout("Global Performance Map", 480),
      geo: {
        projection: { type: "natural earth" },
        showland: true,
        landcolor: "#1a1f2b",
        oceancolor: "#0e1117",
        showcountries: true,
      },
    },
    { responsive: true, displayModeBar: false },
  );
}

function renderMoversChart(el, rows, title) {
  if (!window.Plotly || !rows?.length) return;
  const colors = rows.map((r) => (r.returnPct >= 0 ? EQ_COLOR_POS : EQ_COLOR_NEG));
  Plotly.newPlot(
    el,
    [{
      type: "bar",
      orientation: "h",
      y: rows.map((r) => r.name),
      x: rows.map((r) => r.returnPct),
      marker: { color: colors },
    }],
    { ...plotLayout(title, Math.max(280, rows.length * 36)), xaxis: { ticksuffix: "%" } },
    { responsive: true, displayModeBar: false },
  );
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

function renderGlobalTab(tab, data) {
  const key = `global:${tab}`;
  if (equityRenderedTabs.has(key)) return;
  equityRenderedTabs.add(key);

  switch (tab) {
    case "overview":
      renderGlobalOverview(data);
      break;
    case "performance":
      renderPerformanceChart(eqEl("equity-global-perf-chart"), data.performance, {
        fillViewport: true,
        compactLegend: true,
      });
      break;
    case "risk":
      renderCorrelationChart(eqEl("equity-global-corr-chart"), data.correlation);
      renderVolChart(eqEl("equity-global-vol-chart"), data.volatility);
      break;
    case "map":
      renderGeoChart(eqEl("equity-global-geo-chart"), data.geo);
      break;
    case "movers":
      renderMoversChart(
        eqEl("equity-global-movers-top"),
        data.movers?.top || [],
        `Top (${data.movers?.period || "YTD"})`,
      );
      renderMoversChart(
        eqEl("equity-global-movers-bottom"),
        data.movers?.bottom || [],
        `Bottom (${data.movers?.period || "YTD"})`,
      );
      break;
    default:
      break;
  }
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
    if (data) {
      if (screenKind === "global") renderGlobalTab(tab, data);
      else renderCompanyTab(tab, data);
    }

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

function renderGlobalOverview(data) {
  const body = eqEl("equity-global-overview-body");
  if (!body) return;
  body.innerHTML = (data.overview || [])
    .map((r) => `
    <tr>
      <td>${r.name}<span class="tradfi-symbol-tag">${r.ticker}</span></td>
      <td class="mono">${eqFmtNum(r.price)}</td>
      <td class="mono ${eqChangeClass(r["1D"])}">${eqFmtPct(r["1D"])}</td>
      <td class="mono ${eqChangeClass(r.WTD)}">${eqFmtPct(r.WTD)}</td>
      <td class="mono ${eqChangeClass(r.MTD)}">${eqFmtPct(r.MTD)}</td>
      <td class="mono ${eqChangeClass(r.YTD)}">${eqFmtPct(r.YTD)}</td>
      <td class="mono ${eqChangeClass(r["1Y"])}">${eqFmtPct(r["1Y"])}</td>
      <td class="mono">${r.volume != null ? eqFmtNum(r.volume, 0) : "—"}</td>
    </tr>`)
    .join("");
}

function globalDataKey() {
  return `global:${getSelectedGlobalTickers().join(",")}:${getEquityPeriod()}:${sessionStorage.getItem("equity:movers") || "YTD"}`;
}

function companyDataKey() {
  return `company:${getCompanySymbol()}:${getCompanyPeers().join(",")}:${getEquityPeriod()}`;
}

function renderGlobalScreen(data) {
  equityCache.global = data;
  resetEquityRenderedTabs(globalDataKey());
  renderGlobalTab("overview", data);

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
  const tickers = getSelectedGlobalTickers();
  const period = getEquityPeriod();
  const movers = sessionStorage.getItem("equity:movers") || "YTD";
  const params = new URLSearchParams({
    symbols: tickers.join(","),
    period,
    movers,
  });
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

function buildGlobalTickerPicker() {
  const wrap = eqEl("equity-global-ticker-picker");
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = "true";
  const selected = new Set(getSelectedGlobalTickers());
  const indices = equityCache.global?.indices || {};
  wrap.innerHTML = Object.entries(indices)
    .map(([name, ticker]) => {
      const on = selected.has(ticker) ? "checked" : "";
      return `<label class="equity-ticker-chip"><input type="checkbox" value="${ticker}" ${on}/> ${name}</label>`;
    })
    .join("");
  wrap.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const tickers = [...wrap.querySelectorAll("input:checked")].map((i) => i.value);
      if (tickers.length) {
        setSelectedGlobalTickers(tickers);
        loadEquityGlobal();
      }
    });
  });
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
      if (equityActive === "global") loadEquityGlobal();
      if (equityActive === "company") loadEquityCompany();
    });
  });
  const moversSel = eqEl("equity-movers-select");
  if (moversSel && !moversSel.dataset.bound) {
    moversSel.dataset.bound = "true";
    moversSel.value = sessionStorage.getItem("equity:movers") || "YTD";
    moversSel.addEventListener("change", () => {
      sessionStorage.setItem("equity:movers", moversSel.value);
      if (equityActive === "global") loadEquityGlobal();
    });
  }
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
  bindEquityControls();

  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: `equity:global:${getSelectedGlobalTickers().join(",")}:${getEquityPeriod()}`,
      l1: "tradfi",
      source: "Yahoo Finance",
      fetch: fetchEquityGlobal,
      render: (data, opts = {}) => {
        if (opts.loading) return;
        renderGlobalScreen(data);
        buildGlobalTickerPicker();
        bindEquitySubtabs("equity-global-subtabs", "global");
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
}

window.equityClearActive = () => {
  equityActive = null;
};

window.loadEquityGlobal = loadEquityGlobal;
window.loadEquityCompany = loadEquityCompany;