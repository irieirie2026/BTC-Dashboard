/**
 * Global Macro Drivers Dashboard — WB primary, IMF fallback.
 */

const GM_SETTINGS_KEY = "global-macro:settings:v1";
const GM_POLL_MS = 6 * 3600_000;

let gmData = null;
let gmReady = false;
let gmInflight = null;
let gmActiveTab = "overview";
let gmSelected = new Set();
let gmChartsKey = "";

const gmState = {
  year: null,
  metric: "gdp_growth",
  region: "",
  income: "",
  search: "",
  showAggregates: true,
  onlyFeaturedAggs: false,
};

const gmEl = (id) => document.getElementById(id);

function gmFmtValue(val, format) {
  if (val == null || Number.isNaN(val)) return "—";
  const n = Number(val);
  if (format === "large_usd") {
    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (format === "large_int") {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (format === "usd") return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

function gmSourceBadge(source) {
  if (!source) return '<span class="gm-source gm-source--na">—</span>';
  const cls = source === "WB" ? "gm-source--wb" : "gm-source--imf";
  return `<span class="gm-source ${cls}">${source}</span>`;
}

function gmLoadSettings() {
  try {
    const raw = localStorage.getItem(GM_SETTINGS_KEY);
    if (raw) return { ...gmState, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...gmState };
}

function gmSaveSettings() {
  localStorage.setItem(GM_SETTINGS_KEY, JSON.stringify(gmState));
}

function gmIndicatorMeta(key) {
  return (gmData?.indicators || []).find((i) => i.key === key) || { label: key, format: "pct" };
}

function gmCell(countryId, indKey, year) {
  return gmData?.cells?.[countryId]?.[indKey]?.[String(year)] || null;
}

function gmFilteredCountries() {
  if (!gmData?.countries) return [];
  const q = gmState.search.trim().toLowerCase();
  return gmData.countries.filter((c) => {
    if (!gmState.showAggregates && c.isAggregate) return false;
    if (gmState.onlyFeaturedAggs && c.isAggregate && !c.featured) return false;
    if (gmState.region && c.region !== gmState.region) return false;
    if (gmState.income && c.income !== gmState.income) return false;
    if (q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q) && !c.iso3.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

async function gmFetch(force = false) {
  const params = new URLSearchParams();
  if (force) params.set("refresh", "1");
  if (gmState.year) params.set("year", String(gmState.year));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  try {
    const res = await fetch(`/api/macro/global?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function gmBindFilters() {
  gmEl("gm-year")?.addEventListener("change", (e) => {
    gmState.year = Number(e.target.value);
    gmSaveSettings();
    gmRenderAll();
  });
  gmEl("gm-metric")?.addEventListener("change", (e) => {
    gmState.metric = e.target.value;
    gmSaveSettings();
    gmRenderCharts();
  });
  gmEl("gm-region")?.addEventListener("change", (e) => {
    gmState.region = e.target.value;
    gmSaveSettings();
    gmRenderAll();
  });
  gmEl("gm-income")?.addEventListener("change", (e) => {
    gmState.income = e.target.value;
    gmSaveSettings();
    gmRenderAll();
  });
  gmEl("gm-search")?.addEventListener("input", (e) => {
    gmState.search = e.target.value;
    gmRenderTable();
    gmRenderCharts();
  });
  gmEl("gm-show-aggregates")?.addEventListener("change", (e) => {
    gmState.showAggregates = e.target.checked;
    gmSaveSettings();
    gmRenderAll();
  });
  gmEl("gm-featured-aggs")?.addEventListener("change", (e) => {
    gmState.onlyFeaturedAggs = e.target.checked;
    gmSaveSettings();
    gmRenderAll();
  });
  gmEl("gm-refresh")?.addEventListener("click", () => loadGlobalMacro(true));
  gmEl("gm-export")?.addEventListener("click", gmExportCsv);

  document.querySelectorAll(".gm-subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      gmActiveTab = btn.dataset.gmTab;
      document.querySelectorAll(".gm-subtab").forEach((b) => b.classList.toggle("active", b.dataset.gmTab === gmActiveTab));
      const tableTabs = new Set(["overview", "growth", "prices", "trade", "labor"]);
      document.querySelectorAll(".gm-panel").forEach((p) => {
        if (p.classList.contains("gm-panel--table")) {
          p.hidden = !tableTabs.has(gmActiveTab);
        } else {
          p.hidden = p.dataset.gmTab !== gmActiveTab;
        }
      });
      const titles = {
        overview: "Global snapshot",
        growth: "Growth & Income",
        prices: "Prices & Stability",
        trade: "Trade & Investment",
        labor: "Labor Market",
      };
      const titleEl = gmEl("gm-table-title");
      if (titleEl) titleEl.textContent = titles[gmActiveTab] || "Global data table";
      gmRenderTable();
      gmRenderCharts();
    });
  });
}

function gmPopulateFilterOptions() {
  const yearSel = gmEl("gm-year");
  if (yearSel && gmData?.years?.length) {
    yearSel.innerHTML = [...gmData.years].reverse().map((y) => `<option value="${y}">${y}</option>`).join("");
    yearSel.value = String(gmState.year || gmData.defaultYear);
    gmState.year = Number(yearSel.value);
  }
  const metricSel = gmEl("gm-metric");
  if (metricSel) {
    metricSel.innerHTML = (gmData?.indicators || [])
      .map((i) => `<option value="${i.key}">${i.label}</option>`)
      .join("");
    metricSel.value = gmState.metric;
  }
  const regionSel = gmEl("gm-region");
  if (regionSel) {
    const regions = [...new Set((gmData?.countries || []).map((c) => c.region).filter(Boolean))].sort();
    regionSel.innerHTML = '<option value="">All regions</option>' + regions.map((r) => `<option value="${r}">${r}</option>`).join("");
    regionSel.value = gmState.region;
  }
  const incomeSel = gmEl("gm-income");
  if (incomeSel) {
    const incomes = [...new Set((gmData?.countries || []).map((c) => c.income).filter(Boolean))].sort();
    incomeSel.innerHTML = '<option value="">All income groups</option>' + incomes.map((r) => `<option value="${r}">${r}</option>`).join("");
    incomeSel.value = gmState.income;
  }
}

function gmRenderKpis() {
  const el = gmEl("gm-kpis");
  if (!el || !gmData) return;
  const year = gmState.year || gmData.defaultYear;
  const picks = ["gdp_growth", "cpi_inflation", "unemployment", "current_account"];
  el.innerHTML = picks
    .map((key) => {
      const meta = gmIndicatorMeta(key);
      const kpi = gmData.kpis?.[key];
      const med = kpi ? gmFmtValue(kpi.median, meta.format) : "—";
      return `<article class="gm-kpi-card"><span class="gm-kpi-label">${meta.label}</span><span class="gm-kpi-value">${med}</span><span class="gm-kpi-meta">Global median · ${year} · n=${kpi?.count || 0}</span></article>`;
    })
    .join("");
}

function gmRenderTable() {
  const body = gmEl("gm-table-body");
  if (!body || !gmData) return;
  const year = gmState.year || gmData.defaultYear;
  const tabIndicators = (gmData.indicators || []).filter((i) => {
    if (gmActiveTab === "overview") return true;
    if (gmActiveTab === "map" || gmActiveTab === "charts") return false;
    return i.tab === gmActiveTab;
  });
  const cols = tabIndicators;

  const head = gmEl("gm-table-head");
  if (head) {
    head.innerHTML = `<tr><th>Country</th><th>Region</th>${cols.map((c) => `<th>${c.label}</th>`).join("")}<th>Sources (${year})</th></tr>`;
  }

  const rows = gmFilteredCountries();
  body.innerHTML = rows
    .map((c) => {
      const selected = gmSelected.has(c.id) ? " gm-row-selected" : "";
      const cells = cols
        .map((ind) => {
          const cell = gmCell(c.id, ind.key, year);
          const val = gmFmtValue(cell?.value, ind.format);
          const badge = gmSourceBadge(cell?.source);
          return `<td class="mono">${val} ${badge}</td>`;
        })
        .join("");
      const sources = [...new Set(cols.map((ind) => gmCell(c.id, ind.key, year)?.source).filter(Boolean))].join(", ") || "—";
      const agg = c.isAggregate ? '<span class="gm-agg-badge">AGG</span> ' : "";
      return `<tr class="gm-row${selected}" data-country-id="${c.id}"><td>${agg}${c.name}</td><td>${c.region || "—"}</td>${cells}<td class="gm-sources-col">${sources}</td></tr>`;
    })
    .join("");

  body.querySelectorAll(".gm-row").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.countryId;
      if (gmSelected.has(id)) gmSelected.delete(id);
      else gmSelected.add(id);
      gmRenderTable();
      gmRenderCharts();
    });
  });
}

async function gmRenderMap() {
  const el = gmEl("gm-map");
  if (!el || !window.Plotly || !gmData) return;
  const year = gmState.year || gmData.defaultYear;
  const meta = gmIndicatorMeta(gmState.metric);
  const locations = [];
  const z = [];
  const text = [];

  gmFilteredCountries()
    .filter((c) => !c.isAggregate && c.iso3 && c.iso3.length === 3)
    .forEach((c) => {
      const cell = gmCell(c.id, gmState.metric, year);
      if (cell?.value == null) return;
      locations.push(c.iso3);
      z.push(cell.value);
      text.push(`${c.name}<br>${gmFmtValue(cell.value, meta.format)} ${meta.unit || ""}<br>${cell.source || "—"}`);
    });

  await Plotly.react(
    el,
    [
      {
        type: "choropleth",
        locationmode: "ISO-3",
        locations,
        z,
        text,
        hovertemplate: "%{text}<extra></extra>",
        colorscale: "RdYlGn",
        zmid: meta.format === "pct" ? 0 : undefined,
        colorbar: { title: meta.unit || "" },
      },
    ],
    {
      template: "plotly_dark",
      title: `${meta.label} · ${year}`,
      geo: { showframe: false, showcoastlines: true, projection: { type: "natural earth" } },
      paper_bgcolor: "rgba(0,0,0,0)",
      height: 460,
      margin: { l: 0, r: 0, t: 50, b: 0 },
    },
    { responsive: true, displayModeBar: false },
  );
}

async function gmRenderCharts() {
  if (!gmData || !window.Plotly) return;
  const year = gmState.year || gmData.defaultYear;
  const meta = gmIndicatorMeta(gmState.metric);
  const selected = [...gmSelected];
  const compare = selected.length ? selected : ["US", "CN", "DE", "JP", "IN", "GB"].filter((id) => gmData.cells[id]);

  // Time series
  const tsEl = gmEl("gm-timeseries");
  if (tsEl) {
    const traces = compare.slice(0, 8).map((cid) => {
      const c = gmData.countries.find((x) => x.id === cid);
      const series = gmData.cells[cid]?.[gmState.metric] || {};
      const years = Object.keys(series).sort();
      return {
        x: years,
        y: years.map((y) => series[y]?.value),
        name: c?.name || cid,
        type: "scatter",
        mode: "lines+markers",
      };
    });
    await Plotly.react(
      tsEl,
      traces,
      {
        template: "plotly_dark",
        title: `${meta.label} — multi-country`,
        paper_bgcolor: "rgba(0,0,0,0)",
        height: 360,
        margin: { l: 50, r: 20, t: 50, b: 40 },
        legend: { orientation: "h", y: 1.12 },
      },
      { responsive: true },
    );
  }

  // Ranking bars
  const rankEl = gmEl("gm-ranking");
  if (rankEl) {
    const rows = gmFilteredCountries()
      .filter((c) => !c.isAggregate)
      .map((c) => {
        const cell = gmCell(c.id, gmState.metric, year);
        return { name: c.name, value: cell?.value, source: cell?.source };
      })
      .filter((r) => r.value != null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
    await Plotly.react(
      rankEl,
      [
        {
          type: "bar",
          x: rows.map((r) => r.value),
          y: rows.map((r) => r.name),
          orientation: "h",
          marker: { color: "#14b8a6" },
          text: rows.map((r) => r.source || ""),
          hovertemplate: "%{y}: %{x}<br>Source: %{text}<extra></extra>",
        },
      ],
      {
        template: "plotly_dark",
        title: `Top 20 · ${meta.label} · ${year}`,
        paper_bgcolor: "rgba(0,0,0,0)",
        height: 520,
        margin: { l: 140, r: 20, t: 50, b: 40 },
      },
      { responsive: true, displayModeBar: false },
    );
  }

  await gmRenderMap();
}

function gmRenderMeta() {
  const el = gmEl("gm-update");
  if (!el || !gmData) return;
  const s = gmData.stats || {};
  el.textContent =
    window.DashboardSWR?.formatPanelMeta({
      fetchedAt: gmData.fetchedAt,
      source: gmData.source,
    }) || gmData.source;
  const stats = gmEl("gm-stats");
  if (stats) {
    stats.textContent = `${s.countryCount || 0} countries · ${s.aggregateCount || 0} regional aggregates · ${s.totalEntities || 0} total entities`;
  }
}

function gmRenderAll() {
  if (!gmData) return;
  gmRenderMeta();
  gmPopulateFilterOptions();
  gmRenderKpis();
  gmRenderTable();
  void gmRenderCharts();
}

function gmExportCsv() {
  if (!gmData) return;
  const year = gmState.year || gmData.defaultYear;
  const indicators = gmData.indicators || [];
  const header = ["country", "iso3", "region", "income", "is_aggregate", ...indicators.flatMap((i) => [`${i.key}_${year}`, `${i.key}_${year}_source`])];
  const lines = [header.join(",")];
  gmFilteredCountries().forEach((c) => {
    const row = [c.name, c.iso3, c.region, c.income, c.isAggregate ? "1" : "0"];
    indicators.forEach((ind) => {
      const cell = gmCell(c.id, ind.key, year);
      row.push(cell?.value ?? "", cell?.source ?? "");
    });
    lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `global-macro-${year}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function loadGlobalMacro(force = false) {
  const swr = window.DashboardSWR;
  if (!swr) return;

  if (gmInflight) return gmInflight;

  const run = swr.runSWR({
    key: "macro:global:v1",
    l1: "macro",
    source: "World Bank + IMF",
    persist: true,
    updateHeader: false,
    fetch: () => gmFetch(force),
    render: (data, opts = {}) => {
      if (opts.loading) {
        const body = gmEl("gm-table-body");
        if (body) body.innerHTML = '<tr><td colspan="12">Loading global macro data… first load may take 1–2 min.</td></tr>';
        const upd = gmEl("gm-update");
        if (upd) upd.textContent = "Loading…";
        return;
      }
      Object.assign(gmState, gmLoadSettings());
      gmData = data;
      if (!gmState.year) gmState.year = data.defaultYear;
      gmRenderAll();
    },
    onError: (err) => {
      const body = gmEl("gm-table-body");
      if (body) body.innerHTML = `<tr><td colspan="12">${err?.message || "Load failed"}</td></tr>`;
    },
  });

  gmInflight = run.finally(() => {
    gmInflight = null;
  });
  return gmInflight;
}

function initGlobalMacro() {
  if (gmReady) return;
  gmReady = true;
  Object.assign(gmState, gmLoadSettings());
  gmBindFilters();
}

window.initGlobalMacro = initGlobalMacro;
window.loadGlobalMacro = loadGlobalMacro;