/**
 * Misc → Bitcoin — BTC-only indicators dashboard (Macro Drivers pattern).
 */

const MB_SETTINGS_KEY = "misc:bitcoin-settings:v1";

let mbMeta = null;
let mbSnapshot = null;
let mbDistribution = null;
let mbReady = false;
let mbActiveTab = "overview";
let mbSelectedIndicator = "mvrv";
let mbSeriesCache = {};

const mbState = {
  timespan: "1year",
  indicator: "mvrv",
};

const MB_PLOTLY_CONFIG = { responsive: true, displayModeBar: false };

const MB_SOURCE_CLASS = {
  BitInfoCharts: "db",
  "Blockchain.info": "wb",
  BGeometrics: "imf",
  "Alternative.me": "oecd",
  CoinGecko: "est",
  "Binance Futures": "proxy",
  "Exchange APIs": "proxy",
  "Computed · Blockchain.info": "est",
};

const mbEl = (id) => document.getElementById(id);

function mbFmtValue(val, format) {
  if (val == null || Number.isNaN(val)) return "—";
  const n = Number(val);
  if (format === "pct") return `${n.toFixed(2)}%`;
  if (format === "usd") return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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

function mbPlotLayout(title, height = 340, opts = {}) {
  return {
    template: "plotly_dark",
    title: title
      ? { text: title, font: { size: 13, color: "#cbd5e1" }, x: 0.02, xanchor: "left" }
      : undefined,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(255,255,255,0.02)",
    margin: { l: 52, r: 20, t: title ? 40 : 16, b: 44 },
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
      rangeslider: { visible: false },
    },
    yaxis: {
      gridcolor: "rgba(148, 163, 184, 0.08)",
      linecolor: "rgba(148, 163, 184, 0.15)",
      tickfont: { size: 10, color: "#64748b" },
      title: opts.yTitle || "",
      zeroline: opts.zeroLine || false,
      zerolinecolor: "rgba(148, 163, 184, 0.35)",
    },
    showlegend: false,
    hovermode: "x unified",
    shapes: opts.shapes || [],
  };
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

function mbIndicatorMeta(key) {
  return (mbMeta?.indicators || mbSnapshot?.indicators || []).find((i) => i.key === key) || {
    key,
    label: key,
    format: "ratio",
    tab: "overview",
  };
}

async function mbFetchJson(path, force = false) {
  const [base, qs = ""] = path.split("?");
  const params = new URLSearchParams(qs);
  if (force) params.set("refresh", "1");
  const url = `/api/misc/btc/${base}?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `HTTP ${res.status}`);
  return res.json();
}

async function mbLoadMeta(force = false) {
  const swr = window.DashboardSWR;
  if (!swr) return null;
  mbMeta = await swr.runSWR({
    key: "misc:btc:meta:v1",
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
    key: "misc:btc:snapshot:v1",
    l1: "misc",
    source: mbSnapshot?.sourceChain || "Multi-source BTC feed",
    persist: true,
    revalidate: force,
    updateHeader: false,
    fetch: () => mbFetchJson("snapshot", force),
    render: () => mbRenderSnapshot(),
  });
  mbRenderSnapshot();
  return mbSnapshot;
}

async function mbLoadDistribution(force = false) {
  const swr = window.DashboardSWR;
  if (!swr) return null;
  mbDistribution = await swr.runSWR({
    key: "misc:btc:distribution:v1",
    l1: "misc",
    source: "BitInfoCharts",
    persist: true,
    revalidate: force,
    updateHeader: false,
    fetch: () => mbFetchJson("distribution", force),
    render: () => mbRenderDistribution(),
  });
  mbRenderDistribution();
  return mbDistribution;
}

async function mbLoadSeries(indicator, timespan, force = false) {
  const cacheKey = `${indicator}:${timespan}`;
  if (!force && mbSeriesCache[cacheKey]) return mbSeriesCache[cacheKey];
  const data = await mbFetchJson(`series?indicator=${encodeURIComponent(indicator)}&timespan=${encodeURIComponent(timespan)}`, force);
  mbSeriesCache[cacheKey] = data;
  return data;
}

function mbTabIndicators(tab) {
  const all = mbMeta?.indicators || mbSnapshot?.indicators || [];
  if (tab === "overview") return all;
  return all.filter((i) => i.tab === tab);
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
      const val = mbFmtValue(cell.value, ind.format);
      const src = cell.source || ind.source;
      return `<article class="md-kpi-card" data-mb-kpi="${ind.key}" role="button" tabindex="0">
        <span class="md-kpi-label">${ind.label}</span>
        <span class="md-kpi-value mono">${val}</span>
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
      mbRenderMainChart(true);
    };
    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
}

function mbRenderHeroes() {
  const strip = mbEl("mb-heroes");
  if (!strip || !mbSnapshot?.cells) return;
  const cells = mbSnapshot.cells;
  const fng = cells.fear_greed;
  const mvrv = cells.mvrv;
  const dom = cells.btc_dominance;
  const blocks = [
    { label: "Fear & Greed", value: fng?.value, fmt: "score", sub: fng?.classification || "Sentiment", cls: fng?.value >= 56 ? "positive" : fng?.value <= 44 ? "negative" : "" },
    { label: "MVRV", value: mvrv?.value, fmt: "ratio", sub: "Market vs realized cap" },
    { label: "BTC dominance", value: dom?.value, fmt: "pct", sub: "Global crypto mcap" },
    { label: "Hash rate", value: cells.hash_rate?.value, fmt: "hashrate", sub: "Network security" },
  ];
  strip.innerHTML = blocks
    .map(
      (b) => `<div class="deriv-hero-block">
      <span class="deriv-hero-label">${b.label}</span>
      <span class="deriv-hero-value mono ${b.cls || ""}">${mbFmtValue(b.value, b.fmt)}</span>
      <span class="deriv-hero-sub">${b.sub}</span>
    </div>`,
    )
    .join("");
}

function mbRenderTable() {
  const body = mbEl("mb-table-body");
  if (!body) return;
  const indicators = mbMeta?.indicators || mbSnapshot?.indicators || [];
  const cells = mbSnapshot?.cells || {};
  if (!indicators.length) {
    body.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    return;
  }
  body.innerHTML = indicators
    .map((ind) => {
      const cell = cells[ind.key] || {};
      const updated = cell.fetchedAt ? new Date(cell.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
      return `<tr data-mb-row="${ind.key}" class="mb-table-row" tabindex="0">
        <td>${ind.label}</td>
        <td class="mono">${mbFmtValue(cell.value, ind.format)}</td>
        <td>${mbSourceBadge(cell.source || ind.source, cell)}</td>
        <td class="macro-muted">${updated}</td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll("[data-mb-row]").forEach((row) => {
    const go = () => {
      mbState.indicator = row.dataset.mbRow;
      mbSelectedIndicator = mbState.indicator;
      const sel = mbEl("mb-indicator");
      if (sel) sel.value = mbState.indicator;
      mbSaveSettings();
      mbRenderMainChart(true);
    };
    row.addEventListener("click", go);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
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
    stats.textContent = errCount
      ? `${mbSnapshot.indicators?.length || 0} indicators · ${errCount} source warning(s)`
      : `${mbSnapshot.indicators?.length || 0} indicators · multi-source snapshot`;
  }
  mbRenderKpis();
  mbRenderHeroes();
  mbRenderTable();
}

function mbSeriesToPlotly(series, color = "#f59e0b") {
  const pts = (series || []).filter((p) => p.value != null && Number.isFinite(Number(p.value)));
  const x = pts.map((p) => new Date((p.timestamp || 0) * 1000));
  const y = pts.map((p) => Number(p.value));
  return {
    x,
    y,
    type: "scatter",
    mode: "lines",
    line: { color, width: 2 },
    fill: "tozeroy",
    fillcolor: `${color}22`,
    hovertemplate: "%{y}<br>%{x|%b %d, %Y}<extra></extra>",
  };
}

async function mbRenderMainChart(force = false) {
  const el = mbEl("mb-main-chart");
  const titleEl = mbEl("mb-chart-title");
  const metaEl = mbEl("mb-chart-meta");
  if (!el || !window.Plotly) return;

  const ind = mbIndicatorMeta(mbState.indicator);
  if (titleEl) titleEl.textContent = ind.label;
  el.innerHTML = '<p class="misc-fng-empty">Loading chart…</p>';

  try {
    const data = await mbLoadSeries(mbState.indicator, mbState.timespan, force);
    if (metaEl) {
      metaEl.textContent = `${data.source || ind.source}${data.note ? ` · ${data.note}` : ""}${data.stale ? " · cached" : ""}`;
    }
    const series = data.series || [];
    if (!series.length || series.every((p) => p.value == null)) {
      el.innerHTML = `<p class="misc-fng-empty">No series data — ${data.error || "try Refresh or check API limits"}</p>`;
      return;
    }
    const trace = mbSeriesToPlotly(series, "#e879f9");
    const layout = mbPlotLayout(ind.label, 360, { yTitle: ind.unit });
    Plotly.react(el, [trace], layout, MB_PLOTLY_CONFIG);
  } catch (err) {
    el.innerHTML = `<p class="misc-fng-empty">Chart failed — ${err.message || "error"}</p>`;
  }
}

function mbRenderDistribution() {
  if (!mbDistribution || !window.Plotly) return;
  const wealth = mbDistribution.wealth || {};
  const wealthEl = mbEl("mb-wealth-chart");
  const cohortEl = mbEl("mb-cohort-chart");
  const table = mbEl("mb-cohort-table");
  const meta = mbEl("mb-wealth-meta");
  if (meta) meta.textContent = `${mbDistribution.source || "BitInfoCharts"} · ${mbDistribution.note || ""}`.slice(0, 120);

  if (wealthEl) {
    const labels = ["Top 10", "Top 100", "Top 1,000", "Top 10,000"];
    const values = [wealth.top10_pct, wealth.top100_pct, wealth.top1000_pct, wealth.top10000_pct].map(Number);
    if (values.some((v) => v > 0)) {
      Plotly.react(
        wealthEl,
        [{
          x: labels,
          y: values,
          type: "bar",
          marker: { color: ["#f59e0b", "#e879f9", "#38bdf8", "#14b8a6"] },
          hovertemplate: "%{y:.2f}% supply<extra></extra>",
        }],
        mbPlotLayout("Wealth concentration (% of supply)", 320, { yTitle: "%" }),
        MB_PLOTLY_CONFIG,
      );
    } else {
      wealthEl.innerHTML = '<p class="misc-fng-empty">Wealth data unavailable</p>';
    }
  }

  const cohorts = mbDistribution.cohorts || [];
  if (cohortEl && cohorts.length) {
    const labels = cohorts.map((c) => c.range);
    const supply = cohorts.map((c) => c.supply_pct);
    Plotly.react(
      cohortEl,
      [{
        labels,
        values: supply,
        type: "pie",
        hole: 0.45,
        textinfo: "label+percent",
        textposition: "outside",
        marker: { colors: supply.map((_, i) => `hsl(${(i * 37) % 360}, 65%, 55%)`) },
        hovertemplate: "%{label}<br>%{percent}<extra></extra>",
      }],
      {
        ...mbPlotLayout("Wallet cohorts · % of supply", 380),
        showlegend: false,
      },
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
}

async function mbRenderTabCharts(tab, force = false) {
  if (!window.Plotly) return;
  const chartMap = {
    onchain: [
      ["mb-chart-active", "active_addresses", "#38bdf8"],
      ["mb-chart-hash", "hash_rate", "#14b8a6"],
      ["mb-chart-netflow", "exchange_netflow", "#f472b6"],
      ["mb-chart-puell", "puell_multiple", "#fbbf24"],
    ],
    valuation: [
      ["mb-chart-mvrv", "mvrv", "#e879f9"],
      ["mb-chart-mvrvz", "mvrv_z_score", "#a78bfa"],
      ["mb-chart-realized", "realized_price", "#34d399"],
      ["mb-chart-hodl", "hodl_waves_1y_plus", "#60a5fa"],
    ],
    sentiment: [["mb-chart-dominance", "btc_dominance", "#f59e0b"]],
  };
  const jobs = chartMap[tab] || [];
  await Promise.all(
    jobs.map(async ([elId, indicator, color]) => {
      const el = mbEl(elId);
      if (!el) return;
      try {
        const indKey = indicator === "hodl_waves_1y_plus" ? "hodl_waves" : indicator;
        const data = await mbLoadSeries(indKey, mbState.timespan, force);
        const series = data.series || [];
        if (!series.length) {
          el.innerHTML = `<p class="misc-fng-empty">${data.error || "No data"}</p>`;
          return;
        }
        const trace = mbSeriesToPlotly(series, color);
        const meta = mbIndicatorMeta(indicator);
        Plotly.react(el, [trace], mbPlotLayout(meta.label, 300, { yTitle: meta.unit }), MB_PLOTLY_CONFIG);
      } catch (err) {
        el.innerHTML = `<p class="misc-fng-empty">${err.message || "Load failed"}</p>`;
      }
    }),
  );
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

  if (tab === "distribution") mbLoadDistribution();
  if (tab === "sentiment") {
    window.setFngElementPrefix?.("mb-fng");
    window.loadMiscGreedFear?.();
    window.initMiscGreedFearPoll?.();
    mbRenderTabCharts("sentiment");
  }
  if (tab === "onchain" || tab === "valuation") mbRenderTabCharts(tab);
  if (tab === "methodology") mbRenderMethodologyInline();
  if (tab === "overview") mbRenderMainChart();
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
  const indicators = mbMeta?.indicators || mbSnapshot?.indicators || [];
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
    await Promise.all([mbLoadMeta(true), mbLoadSnapshot(true), mbLoadDistribution(true)]);
    mbRenderTabCharts(mbActiveTab, true);
    if (mbActiveTab === "overview") mbRenderMainChart(true);
    if (mbActiveTab === "sentiment") window.loadMiscGreedFear?.(true);
  });

  mbEl("mb-export")?.addEventListener("click", mbExportCsv);
  mbEl("mb-methodology-btn")?.addEventListener("click", mbOpenMethodology);
  mbEl("mb-methodology-close")?.addEventListener("click", () => mbEl("mb-methodology-dialog")?.close());

  mbEl("mb-indicator")?.addEventListener("change", (e) => {
    mbState.indicator = e.target.value;
    mbSelectedIndicator = mbState.indicator;
    mbSaveSettings();
    mbRenderMainChart();
  });

  mbEl("mb-timespan")?.addEventListener("change", (e) => {
    mbState.timespan = e.target.value;
    mbSaveSettings();
    mbRenderMainChart(true);
    if (mbActiveTab === "onchain" || mbActiveTab === "valuation" || mbActiveTab === "sentiment") {
      mbRenderTabCharts(mbActiveTab, true);
    }
  });
}

async function loadMiscBitcoin(force = false) {
  Object.assign(mbState, mbLoadSettings());
  mbBindUi();
  mbSyncFilterVisibility();

  const body = mbEl("mb-table-body");
  if (body && !mbSnapshot) body.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';

  try {
    await mbLoadMeta(force);
    await mbLoadSnapshot(force);
    mbPopulateIndicatorSelect();
    mbSetTab(mbActiveTab);
    window.decorateHelpLabels?.(
      document.querySelector('#dashboard-misc .menu-screen[data-l2="bitcoin"]'),
    );
  } catch (err) {
    if (body) body.innerHTML = `<tr><td colspan="4">Load failed — ${err.message || "error"}</td></tr>`;
  }
}

window.loadMiscBitcoin = loadMiscBitcoin;