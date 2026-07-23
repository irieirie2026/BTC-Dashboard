/**
 * Misc → Bitcoin → Valuation Models — educational model cards with charts.
 */

let mbVmMeta = null;
let mbVmBundles = {};

const MB_VM_TAB_MODELS = {
  valuation: [
    "stock_to_flow",
    "stock_to_flow_cross",
    "power_law",
    "delta_balanced_price",
    "pi_cycle_top",
    "rainbow_chart",
  ],
  onchain: ["nvt_ratio", "metcalfe", "coin_days_destroyed"],
  miner: ["difficulty_ribbon"],
};

const MB_VM_SERIES_TYPE = {
  stock_to_flow: "line",
  stock_to_flow_cross: "line",
  power_law: "line",
  delta_balanced_price: "overlay",
  pi_cycle_top: "multi",
  rainbow_chart: "rainbow",
  nvt_ratio: "line",
  metcalfe: "line",
  coin_days_destroyed: "line",
  difficulty_ribbon: "ribbon",
};

function mbVmTabModelIds(tab) {
  return mbVmMeta?.tabModels?.[tab] || MB_VM_TAB_MODELS[tab] || [];
}

function mbVmModelStub(id) {
  const catalog = mbVmMeta?.models || [];
  const fromMeta = catalog.find((m) => m.id === id);
  if (fromMeta) return fromMeta;
  const ind = (window.mbMeta?.indicators || []).find((i) => i.key === id);
  if (!ind) return null;
  return {
    id,
    title: ind.label,
    tagline: "",
    source: ind.source,
    format: ind.format,
    unit: ind.unit,
    helpKey: ind.help,
    seriesType: MB_VM_SERIES_TYPE[id] || "line",
    chartColor: "#f59e0b",
    content: {
      explanation: [],
      howItWorks: "",
      interpretation: [],
      history: [],
      limitations: [],
    },
  };
}

function mbVmModelsForTab(tab) {
  const ids = mbVmTabModelIds(tab);
  const catalog = mbVmMeta?.models || [];
  const byId = new Map(catalog.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id) || mbVmModelStub(id)).filter(Boolean);
}

const MB_VM_PLOTLY = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
};
const MB_VM_CHART_HEIGHT = 340;

const MB_VM_SOURCE_CLASS = {
  BGeometrics: "imf",
  "Blockchain.info": "wb",
  "Computed · halving schedule": "est",
  "Computed · Santostasi PLT": "est",
  "Computed · daily price": "est",
  "Computed · log regression bands": "est",
  "Computed · BGeometrics difficulty": "est",
  "Computed · addresses² vs price": "est",
  "Computed · realized & delta cap": "est",
  "BGeometrics + computed": "imf",
};

function mbVmEl(id) {
  return document.getElementById(id);
}

function mbVmFmt(val, format) {
  if (val == null || Number.isNaN(Number(val))) return "—";
  const n = Number(val);
  if (format === "usd") return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (format === "pct") return `${n.toFixed(2)}%`;
  if (format === "zscore") return `${n.toFixed(2)}σ`;
  if (format === "large_int") {
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (format === "ratio") return `${n.toFixed(3)}×`;
  if (format === "signal") return n >= 1 ? "Cross active" : "No cross";
  if (format === "text") return String(val);
  return n.toFixed(3);
}

function mbVmSourceBadge(source) {
  if (!source) return "";
  const cls = MB_VM_SOURCE_CLASS[source] || "na";
  const short = source.split(" ·")[0];
  return `<span class="md-source md-source--${cls}" title="${source}">${short}</span>`;
}

function mbVmPlotLayout(title, height = MB_VM_CHART_HEIGHT, opts = {}) {
  // Prefer shared layout so framework charts match main On-Chain series charts.
  if (typeof window.mbPlotLayout === "function") {
    return window.mbPlotLayout(title, height, {
      yTitle: opts.yTitle,
      rangeSlider: opts.rangeSlider,
      showLegend: opts.showLegend,
      zeroLine: opts.zeroLine,
      shapes: opts.shapes,
      compact: opts.compact,
    });
  }
  const compact = !!opts.compact;
  const slider = !!opts.rangeSlider;
  return {
    template: "plotly_dark",
    title: title ? { text: title, font: { size: 12, color: "#cbd5e1" }, x: 0.02 } : undefined,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(255,255,255,0.02)",
    margin: {
      l: 48,
      r: 12,
      t: title ? 32 : 8,
      b: slider ? (compact ? 44 : 68) : 28,
    },
    height,
    font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 10, color: "#94a3b8" },
    hoverlabel: {
      bgcolor: "#1e2433",
      bordercolor: "rgba(148, 163, 184, 0.35)",
      font: { size: 10, color: "#e2e8f0" },
    },
    xaxis: {
      type: "date",
      gridcolor: "rgba(148, 163, 184, 0.08)",
      linecolor: "rgba(148, 163, 184, 0.15)",
      tickfont: { size: 10, color: "#64748b" },
      rangeslider: slider
        ? {
            visible: true,
            thickness: compact ? 0.03 : 0.05,
            bgcolor: "rgba(15, 23, 42, 0.55)",
            bordercolor: "rgba(148, 163, 184, 0.15)",
            borderwidth: 1,
          }
        : { visible: false },
    },
    yaxis: {
      gridcolor: "rgba(148, 163, 184, 0.08)",
      linecolor: "rgba(148, 163, 184, 0.15)",
      tickfont: { size: 10, color: "#64748b" },
      title: opts.yTitle
        ? { text: opts.yTitle, font: { size: 10, color: "#64748b" }, standoff: 6 }
        : undefined,
      zeroline: opts.zeroLine || false,
    },
    showlegend: opts.showLegend || false,
    legend: opts.showLegend
      ? { orientation: "h", y: 1.08, yanchor: "bottom", font: { size: 10 }, bgcolor: "rgba(0,0,0,0)" }
      : undefined,
    hovermode: "x unified",
    shapes: opts.shapes || [],
  };
}

function mbVmOnchainChartOpts(extra = {}) {
  const h = window.MB_ONCHAIN_CHART_HEIGHT || MB_VM_CHART_HEIGHT;
  return {
    height: h,
    rangeSlider: mbVmUsesRangeSlider(),
    compact: true,
    ...extra,
  };
}

function mbVmFilterSeries(series, timespan) {
  // Full history by default ("all"); only trim for explicit short windows.
  const days = {
    "30days": 30,
    "90days": 90,
    "1year": 365,
    "2years": 730,
    "4years": 1460,
    all: null,
  }[timespan || window.MB_FULL_TIMESPAN || "all"];
  if (!days || !series?.length) return series || [];
  const cutoff = Date.now() / 1000 - days * 86400;
  return series.filter((p) => !p.timestamp || p.timestamp >= cutoff);
}

function mbVmUsesRangeSlider() {
  // Full history always loaded — use rangeslider + Plotly zoom.
  return true;
}

async function mbVmFetch(path, force = false) {
  const [base, qs = ""] = path.split("?");
  const params = new URLSearchParams(qs);
  if (force) params.set("refresh", "1");
  const res = await fetch(`/api/misc/btc/${base}?${params}`, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  return JSON.parse(text);
}

async function mbVmLoadMeta(force = false) {
  const swr = window.DashboardSWR;
  if (swr) {
    mbVmMeta = await swr.runSWR({
      key: "misc:btc:vm:meta:v5",
      l1: "misc",
      source: "Valuation models catalog",
      persist: true,
      revalidate: force,
      updateHeader: false,
      fetch: () => mbVmFetch("valuation-models/meta", force),
      render: () => {},
    });
  } else {
    mbVmMeta = await mbVmFetch("valuation-models/meta", force);
  }
  return mbVmMeta;
}

async function mbVmLoadTab(tab, force = false) {
  if (!force && mbVmBundles[tab]?.charts) return mbVmBundles[tab];
  const data = await mbVmFetch(`valuation-models/bundle?tab=${encodeURIComponent(tab)}`, force);
  mbVmBundles[tab] = data;
  return data;
}

function mbVmInterpretationTable(rows) {
  if (!rows?.length) return "";
  return `<table class="deriv-table md-table mb-vm-zone-table">
    <thead><tr><th>Zone</th><th>Meaning</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${r.zone}</td><td>${r.meaning}</td></tr>`).join("")}</tbody>
  </table>`;
}

function mbVmDetailsSection(title, bodyHtml, open = false) {
  return `<details class="mb-vm-details" ${open ? "open" : ""}>
    <summary class="mb-vm-details-summary">${title}</summary>
    <div class="mb-vm-details-body">${bodyHtml}</div>
  </details>`;
}

function mbVmModelCard(model, chartData, opts = {}) {
  const consolidate = !!opts.consolidate;
  const latest = chartData?.latest?.label ?? chartData?.latest?.value;
  const fmt = chartData?.latest?.label ? "text" : (model.format || "ratio");
  const updated = chartData?.fetchedAt || "—";
  const err = chartData?.error && !chartData?.series?.length ? chartData.error : "";

  const helpKey = model.helpKey || `mb-vm-${model.id}`;
  const chartId = `mb-vm-chart-${model.id}`;
  const above = consolidate
    ? ""
    : `<div class="mb-chart-copy mb-chart-copy--above"><p class="mb-chart-desc" id="mb-vm-desc-${model.id}"></p></div>`;
  const edu = consolidate
    ? ""
    : `<div class="mb-chart-education" id="mb-edu-${model.id}"></div>`;
  const copyClass = consolidate
    ? "mb-chart-copy mb-chart-copy--below mb-chart-copy--unified"
    : "mb-chart-copy mb-chart-copy--below";

  return `<article class="panel mb-vm-model-card" data-mb-vm-model="${model.id}">
    <div class="panel-header mb-vm-card-header">
      <div class="mb-vm-card-titles">
        <h2 data-help-key="${helpKey}">${model.title}</h2>
        <p class="mb-vm-tagline">${model.tagline}</p>
      </div>
      <div class="mb-vm-card-meta">
        ${mbVmSourceBadge(chartData?.source || model.source)}
        <span class="panel-meta">Updated ${updated}</span>
      </div>
    </div>
    <div class="mb-vm-kpi-row">
      <div class="md-kpi-card mb-vm-kpi">
        <span class="md-kpi-label">Current value</span>
        <span class="md-kpi-value">${mbVmFmt(latest, fmt)}</span>
        <span class="md-kpi-meta">${model.unit || ""}${err ? ` · ${err}` : ""}</span>
      </div>
    </div>
    <div class="mb-chart-block mb-vm-chart-block">
      ${above}
      <div id="${chartId}" class="md-plotly mb-plotly mb-vm-chart" aria-label="${model.title} chart"></div>
      <div class="${copyClass}"><div class="mb-chart-commentary" id="mb-vm-commentary-${model.id}"></div></div>
      ${edu}
    </div>
  </article>`;
}

function mbVmRenderModelCopy(model, chartData, opts = {}) {
  const consolidate = !!opts.consolidate
    || window.MB_CONSOLIDATED_COPY_KEYS?.has?.(model.id);
  const latest = chartData?.latest?.value ?? chartData?.latest?.label ?? chartData?.latest;
  const forwardExtra = {
    spot: chartData?.latest?.price,
    modelPrice: chartData?.latest?.model_price,
    fair: chartData?.latest?.fair,
    band: chartData?.latest?.band,
    spotAbove: chartData?.latest?.price != null && chartData?.latest?.balanced != null
      && chartData.latest.price > chartData.latest.balanced,
  };
  const commentary = window.mbBuildFrameworkChartCommentary?.(model.id, chartData) || [];
  const fwd = window.mbBtcPriceForward?.(model.id, latest, forwardExtra);
  const live = fwd ? [...commentary, fwd] : commentary;
  const commEl = mbVmEl(`mb-vm-commentary-${model.id}`);

  if (consolidate && commEl && window.mbRenderConsolidatedCommentaryEl) {
    window.mbRenderConsolidatedCommentaryEl(
      `mb-vm-commentary-${model.id}`,
      model.id,
      live,
      null,
    );
    // Fold model content (what it measures / how it works) into the same block without dropdowns.
    const content = model.content || {};
    const extra = [];
    (content.explanation || []).forEach((p) => extra.push(p));
    if (content.howItWorks) extra.push(content.howItWorks);
    if (content.formula) extra.push(`Formula: ${content.formula}`);
    if (extra.length) {
      const existing = Array.from(commEl.querySelectorAll("p")).map((p) => p.innerHTML);
      const seen = new Set(existing.map((t) => t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase()));
      extra.forEach((t) => {
        const plain = String(t).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
        if (!plain || seen.has(plain)) return;
        seen.add(plain);
        commEl.insertAdjacentHTML("beforeend", `<p>${t}</p>`);
      });
    }
    return;
  }

  const descEl = mbVmEl(`mb-vm-desc-${model.id}`);
  if (descEl && window.mbChartInfo) {
    const info = window.mbChartInfo(model.id);
    const parts = [info.description, info.readings].filter(Boolean);
    if (parts.length) {
      descEl.textContent = parts.join(" ");
      descEl.title = info.readings || info.description || "";
    }
  }
  if (commEl) {
    commEl.innerHTML = live.length
      ? live.map((p) => `<p>${p}</p>`).join("")
      : '<p class="macro-muted">Commentary unavailable — waiting for chart data.</p>';
  }
  const eduEl = mbVmEl(`mb-edu-${model.id}`);
  if (eduEl && window.mbEducationDetailsHtml) {
    eduEl.innerHTML = window.mbEducationDetailsHtml(model.content || window.mbChartEducationContent?.(model.id));
  }
}

function mbVmDrawLineChart(el, series, model, chartData) {
  const pts = mbVmFilterSeries(series, window.mbState?.timespan || window.MB_FULL_TIMESPAN || "all").filter(
    (p) => p.value != null && Number.isFinite(Number(p.value)),
  );
  if (!pts.length) {
    el.innerHTML = `<p class="misc-fng-empty">${chartData?.error || "No data available"}</p>`;
    return;
  }
  const color = model.chartColor || "#f59e0b";
  const trace = {
    x: pts.map((p) => new Date((p.timestamp || 0) * 1000)),
    y: pts.map((p) => Number(p.value)),
    type: "scatter",
    mode: "lines",
    line: { color, width: 2 },
    fill: "tozeroy",
    fillcolor: `${color}22`,
    name: model.title,
    hovertemplate: "<b>%{x|%b %d, %Y}</b><br>Value: %{y:.4f}<extra></extra>",
  };
  const panel = el.closest?.(".mb-bitcoin-panel[data-mb-sub]");
  const unified = panel && ["onchain", "valuation", "miner"].includes(panel.dataset.mbSub);
  const opts = unified
    ? mbVmOnchainChartOpts({ yTitle: model.unit || "" })
    : { yTitle: model.unit || "", rangeSlider: mbVmUsesRangeSlider() };
  const height = opts.height || MB_VM_CHART_HEIGHT;
  el.classList.toggle("mb-plotly--onchain", !!unified);
  Plotly.react(el, [trace], mbVmPlotLayout("", height, opts), MB_VM_PLOTLY);
}

function mbVmDrawOverlayChart(el, chartData, model) {
  const overlay = chartData.overlay || [];
  const series = mbVmFilterSeries(overlay, window.mbState?.timespan || window.MB_FULL_TIMESPAN || "all");
  if (!series.length) {
    mbVmDrawLineChart(el, chartData.series || [], model, chartData);
    return;
  }
  const traces = [
    {
      x: series.map((p) => new Date((p.timestamp || 0) * 1000)),
      y: series.map((p) => p.price),
      name: "Price",
      type: "scatter",
      mode: "lines",
      line: { color: "#f59e0b", width: 2 },
    },
    {
      x: series.map((p) => new Date((p.timestamp || 0) * 1000)),
      y: series.map((p) => p.ma111),
      name: "111 DMA",
      type: "scatter",
      mode: "lines",
      line: { color: "#38bdf8", width: 1.5 },
    },
    {
      x: series.map((p) => new Date((p.timestamp || 0) * 1000)),
      y: series.map((p) => p.ma350x2),
      name: "350 DMA × 2",
      type: "scatter",
      mode: "lines",
      line: { color: "#e879f9", width: 1.5, dash: "dot" },
    },
  ];
  {
    const panel = el.closest?.(".mb-bitcoin-panel[data-mb-sub]");
    const unified = panel && ["onchain", "valuation", "miner"].includes(panel.dataset.mbSub);
    const opts = unified
      ? mbVmOnchainChartOpts({ showLegend: true })
      : { showLegend: true, rangeSlider: mbVmUsesRangeSlider() };
    el.classList.toggle("mb-plotly--onchain", !!unified);
    Plotly.react(
      el,
      traces,
      mbVmPlotLayout(unified ? "" : "Pi Cycle — price & moving averages", opts.height || MB_VM_CHART_HEIGHT, opts),
      MB_VM_PLOTLY,
    );
  }
}

function mbVmDrawMultiChart(el, chartData, model) {
  const overlay = chartData.overlay || {};
  const span = window.mbState?.timespan || window.MB_FULL_TIMESPAN || "all";
  const price = mbVmFilterSeries(overlay.price || [], span);
  const realized = mbVmFilterSeries(overlay.realized || [], span);
  const balanced = mbVmFilterSeries(chartData.series || [], span);
  const traces = [];
  if (price.length) {
    traces.push({
      x: price.map((p) => new Date((p.timestamp || 0) * 1000)),
      y: price.map((p) => Number(p.value)),
      name: "Spot price",
      type: "scatter",
      mode: "lines",
      line: { color: "#f59e0b", width: 2 },
    });
  }
  if (realized.length) {
    traces.push({
      x: realized.map((p) => new Date((p.timestamp || 0) * 1000)),
      y: realized.map((p) => Number(p.value)),
      name: "Realized price",
      type: "scatter",
      mode: "lines",
      line: { color: "#94a3b8", width: 1.5, dash: "dash" },
    });
  }
  if (balanced.length) {
    traces.push({
      x: balanced.map((p) => new Date((p.timestamp || 0) * 1000)),
      y: balanced.map((p) => Number(p.value)),
      name: "Balanced (proxy)",
      type: "scatter",
      mode: "lines",
      line: { color: "#38bdf8", width: 1.5 },
    });
  }
  if (!traces.length) {
    mbVmDrawLineChart(el, chartData.series || [], model, chartData);
    return;
  }
  {
    const panel = el.closest?.(".mb-bitcoin-panel[data-mb-sub]");
    const unified = panel && ["onchain", "valuation", "miner"].includes(panel.dataset.mbSub);
    const opts = unified
      ? mbVmOnchainChartOpts({ showLegend: true, yTitle: "USD" })
      : { showLegend: true, yTitle: "USD", rangeSlider: mbVmUsesRangeSlider() };
    el.classList.toggle("mb-plotly--onchain", !!unified);
    Plotly.react(
      el,
      traces,
      mbVmPlotLayout(unified ? "" : "Delta / Balanced framework", opts.height || MB_VM_CHART_HEIGHT, opts),
      MB_VM_PLOTLY,
    );
  }
}

function mbVmDrawBandChart(el, chartData, model) {
  const series = mbVmFilterSeries(chartData.series || [], window.mbState?.timespan || window.MB_FULL_TIMESPAN || "all");
  if (!series.length) {
    el.innerHTML = `<p class="misc-fng-empty">${chartData?.error || "No data"}</p>`;
    return;
  }
  const traces = [
    {
      x: series.map((p) => new Date((p.timestamp || 0) * 1000)),
      y: series.map((p) => Number(p.value)),
      name: "Price/Fair ratio",
      type: "scatter",
      mode: "lines",
      line: { color: "#e879f9", width: 2 },
    },
  ];
  const shapes = [
    { type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 0.4, y1: 0.4, line: { color: "#22c55e55", width: 1, dash: "dot" } },
    { type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 1.5, y1: 1.5, line: { color: "#ef444455", width: 1, dash: "dot" } },
  ];
  {
    const panel = el.closest?.(".mb-bitcoin-panel[data-mb-sub]");
    const unified = panel && ["onchain", "valuation", "miner"].includes(panel.dataset.mbSub);
    const opts = unified
      ? mbVmOnchainChartOpts({ yTitle: "×", shapes })
      : { yTitle: "×", shapes, rangeSlider: mbVmUsesRangeSlider() };
    el.classList.toggle("mb-plotly--onchain", !!unified);
    Plotly.react(
      el,
      traces,
      mbVmPlotLayout(unified ? "" : "Power law ratio", opts.height || MB_VM_CHART_HEIGHT, opts),
      MB_VM_PLOTLY,
    );
  }
}

function mbVmDrawRibbonChart(el, chartData, model) {
  const series = mbVmFilterSeries(chartData.series || [], window.mbState?.timespan || window.MB_FULL_TIMESPAN || "all");
  const smas = chartData.smas || {};
  if (!series.length) {
    el.innerHTML = `<p class="misc-fng-empty">${chartData?.error || "No data"}</p>`;
    return;
  }
  const traces = [{
    x: series.map((p) => new Date((p.timestamp || 0) * 1000)),
    y: series.map((p) => Number(p.value)),
    name: "Difficulty",
    type: "scatter",
    mode: "lines",
    line: { color: "#a855f7", width: 2 },
  }];
  const colors = ["#64748b44", "#94a3b844", "#cbd5e144"];
  Object.entries(smas).slice(0, 3).forEach(([w, pts], i) => {
    const filtered = mbVmFilterSeries(pts, window.mbState?.timespan || window.MB_FULL_TIMESPAN || "all");
    if (!filtered.length) return;
    traces.push({
      x: filtered.map((p) => new Date((p.timestamp || 0) * 1000)),
      y: filtered.map((p) => Number(p.value)),
      name: `SMA ${w}`,
      type: "scatter",
      mode: "lines",
      line: { color: colors[i] || "#64748b", width: 1 },
    });
  });
  {
    const panel = el.closest?.(".mb-bitcoin-panel[data-mb-sub]");
    const unified = panel && ["onchain", "valuation", "miner"].includes(panel.dataset.mbSub);
    const opts = unified
      ? mbVmOnchainChartOpts({ showLegend: true })
      : { showLegend: true, rangeSlider: mbVmUsesRangeSlider() };
    el.classList.toggle("mb-plotly--onchain", !!unified);
    Plotly.react(
      el,
      traces,
      mbVmPlotLayout(unified ? "" : "Difficulty ribbon", opts.height || MB_VM_CHART_HEIGHT, opts),
      MB_VM_PLOTLY,
    );
  }
}

function mbVmDrawRainbowChart(el, chartData, model) {
  const series = mbVmFilterSeries(chartData.series || [], window.mbState?.timespan || window.MB_FULL_TIMESPAN || "all");
  if (!series.length) {
    el.innerHTML = `<p class="misc-fng-empty">${chartData?.error || "No data"}</p>`;
    return;
  }
  const trace = {
    x: series.map((p) => new Date((p.timestamp || 0) * 1000)),
    y: series.map((p) => Number(p.value)),
    type: "scatter",
    mode: "lines",
    line: { color: "#22c55e", width: 2 },
    marker: {
      color: series.map((p) => {
        const bands = chartData.bands || [];
        const idx = p.band != null ? p.band : 4;
        return bands[idx]?.[1] || "#22c55e";
      }),
      size: 3,
    },
    name: "Price",
  };
  {
    const panel = el.closest?.(".mb-bitcoin-panel[data-mb-sub]");
    const unified = panel && ["onchain", "valuation", "miner"].includes(panel.dataset.mbSub);
    const opts = unified
      ? mbVmOnchainChartOpts({ yTitle: "USD" })
      : { yTitle: "USD", rangeSlider: mbVmUsesRangeSlider() };
    el.classList.toggle("mb-plotly--onchain", !!unified);
    Plotly.react(
      el,
      [trace],
      mbVmPlotLayout(unified ? "" : "Rainbow chart (log regression)", opts.height || MB_VM_CHART_HEIGHT, opts),
      MB_VM_PLOTLY,
    );
  }
}

function mbVmDrawChart(model, chartData) {
  const el = mbVmEl(`mb-vm-chart-${model.id}`);
  if (!el || !window.Plotly) return;
  const type = model.seriesType || "line";
  if (type === "overlay") return mbVmDrawOverlayChart(el, chartData, model);
  if (type === "multi") return mbVmDrawMultiChart(el, chartData, model);
  if (type === "band") return mbVmDrawBandChart(el, chartData, model);
  if (type === "ribbon") return mbVmDrawRibbonChart(el, chartData, model);
  if (type === "rainbow") return mbVmDrawRainbowChart(el, chartData, model);
  mbVmDrawLineChart(el, chartData.series || [], model, chartData);
}

async function mbVmRenderTab(tab, rootId, force = false) {
  const root = mbVmEl(rootId);
  if (!root) return;
  root.innerHTML = '<p class="misc-fng-empty">Loading frameworks…</p>';

  try {
    if (!mbVmMeta) await mbVmLoadMeta(force);
    const ids = mbVmTabModelIds(tab);
    if (!ids.length) {
      root.innerHTML = "";
      return;
    }
    let models = mbVmModelsForTab(tab);
    if (!models.length) {
      await mbVmLoadMeta(true);
      models = mbVmModelsForTab(tab);
    }
    if (!models.length) {
      root.innerHTML = '<p class="misc-fng-empty">Valuation frameworks unavailable — refresh or check API</p>';
      return;
    }
    const bundle = await mbVmLoadTab(tab, force);

    const consolidate = tab === "onchain" || tab === "valuation" || tab === "miner";
    root.innerHTML = models.map((m) => mbVmModelCard(m, bundle.charts?.[m.id] || {}, { consolidate })).join("");
    models.forEach((m) => {
      const chartData = bundle.charts?.[m.id] || {};
      mbVmDrawChart(m, chartData);
      mbVmRenderModelCopy(m, chartData, { consolidate });
    });
    window.mbRefreshTabOutlookAfterFrameworks?.(tab, bundle, models);

    const panel = root.closest(".mb-bitcoin-panel");
    window.decorateHelpLabels?.(panel);
  } catch (err) {
    root.innerHTML = `<p class="misc-fng-empty">Frameworks failed to load — ${err.message || "error"}</p>`;
  }
}

function mbVmRefreshTab(tab, force = false) {
  delete mbVmBundles[tab];
  const rootByTab = {
    valuation: "mb-valuation-frameworks-root",
    onchain: "mb-onchain-frameworks-root",
    miner: "mb-miner-frameworks-root",
  };
  const rootId = rootByTab[tab];
  if (rootId) return mbVmRenderTab(tab, rootId, force);
  return Promise.resolve();
}

function mbVmRefreshAll(force = false) {
  mbVmBundles = {};
  return Promise.all([
    mbVmRenderTab("valuation", "mb-valuation-frameworks-root", force),
    mbVmRenderTab("onchain", "mb-onchain-frameworks-root", force),
    mbVmRenderTab("miner", "mb-miner-frameworks-root", force),
  ]);
}

function mbVmOnTimespanChange(activeTab) {
  const rootByTab = {
    valuation: "mb-valuation-frameworks-root",
    onchain: "mb-onchain-frameworks-root",
    miner: "mb-miner-frameworks-root",
  };
  const rootId = rootByTab[activeTab];
  if (rootId && mbVmMeta) mbVmRenderTab(activeTab, rootId, false);
}

window.mbVmBundles = mbVmBundles;
window.mbVmLoadMeta = mbVmLoadMeta;
window.mbVmLoadTab = mbVmLoadTab;
window.mbVmRenderTab = mbVmRenderTab;
window.mbVmRefreshTab = mbVmRefreshTab;
window.mbVmRefreshAll = mbVmRefreshAll;
window.mbVmOnTimespanChange = mbVmOnTimespanChange;