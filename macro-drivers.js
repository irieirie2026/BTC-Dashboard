/**
 * Macro Drivers v2 — chunked WB → IMF → DBnomics hierarchy, global economy dashboard.
 */

const MD_SETTINGS_KEY = "macro:drivers-settings:v3";
const MD_LQ_SETTINGS_KEY = "macro:drivers-lq:v2";
const MD_COMMENTARY_KEY = "macro:drivers-commentary:v1";

let mdMeta = null;
let mdSnapshot = null;
let mdMapData = null;
let mdLiquidity = null;
let mdLqMapData = null;
let mdSnapshotFromCache = false;
let mdReady = false;
let mdInflight = null;
let mdSnapshotInflight = null;
let mdSearchTimer = null;
let mdLqLoadGen = 0;
let mdLqInflight = null;
const MD_LQ_REGIONAL_ENTITIES = new Set(["WLD", "ADV", "EM", "EAS", "ECS", "NAC"]);
let mdActiveTab = "overview";
let mdEconomyTab = "growth";
let mdSelected = new Set();

const mdState = {
  year: null,
  metric: "gdp_growth",
  region: "",
  income: "",
  search: "",
  showAggregates: true,
  onlyFeaturedAggs: false,
};

const mdLqState = {
  entity: "WLD",
  year: null,
  overlay: false,
  mapMetric: "proxy",
};

const MD_LQ_SCOPE_ENTITIES = new Set(["WLD", "ADV", "EM", "EAS", "ECS", "NAC"]);

const MD_DEFAULT_COMMENTARY = `# Macro Outlook — {date}

## Base case
- Growth:
- Inflation:
- Policy:

## BTC / risk assets
- Liquidity & real yields:
- USD backdrop:

## Personal notes
`;

const mdEl = (id) => document.getElementById(id);

function mdFmtValue(val, format) {
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

function mdSourceBadge(source) {
  if (!source) return '<span class="md-source md-source--na">—</span>';
  const map = { WB: "wb", IMF: "imf", OECD: "oecd", EST: "est", DB: "db", Proxy: "proxy", Proj: "proj" };
  const cls = map[source] || "na";
  return `<span class="md-source md-source--${cls}">${source}</span>`;
}

const MD_LQ_COLORS = {
  cb: "rgba(20, 184, 166, 0.88)",
  money: "rgba(6, 182, 212, 0.82)",
  reserves: "rgba(139, 92, 246, 0.78)",
  total: "#5eead4",
  yoy: "#34d399",
  momentum: "#fbbf24",
  regional: ["#14b8a6", "#06b6d4", "#38bdf8", "#8b5cf6", "#a78bfa", "#f472b6"],
};

const MD_LQ_REGIONAL_ENTITY_COLORS = {
  WLD: "#5eead4",
  ADV: "#14b8a6",
  EM: "#06b6d4",
  EAS: "#38bdf8",
  ECS: "#8b5cf6",
  NAC: "#a78bfa",
};

const MD_LQ_MAP_SCALE_PROXY = [
  [0, "#0c1220"],
  [0.15, "#0f2a2a"],
  [0.35, "#134e4a"],
  [0.55, "#0f766e"],
  [0.75, "#14b8a6"],
  [1, "#5eead4"],
];

const MD_LQ_MAP_SCALE_YOY = [
  [0, "#7f1d1d"],
  [0.2, "#450a0a"],
  [0.4, "#1e2433"],
  [0.5, "#334155"],
  [0.6, "#1a2e2a"],
  [0.8, "#065f46"],
  [1, "#34d399"],
];

const MD_LQ_GEO_DARK = {
  showframe: false,
  showcoastlines: true,
  coastlinecolor: "rgba(148, 163, 184, 0.3)",
  showland: true,
  landcolor: "#1a2332",
  showocean: true,
  oceancolor: "#0c1220",
  showlakes: true,
  lakecolor: "#0c1220",
  showcountries: true,
  countrycolor: "rgba(148, 163, 184, 0.12)",
  bgcolor: "rgba(0,0,0,0)",
  projection: { type: "natural earth" },
};

const MD_PLOTLY_CONFIG = { responsive: true, displayModeBar: false };
const MD_LQ_CHART_HEIGHT = 340;

function mdLqPctExtent(values) {
  const v = values.filter((x) => x != null && Number.isFinite(Number(x))).map(Number);
  if (!v.length) return { min: -1, max: 1 };
  return { min: Math.min(0, ...v), max: Math.max(0, ...v) };
}

/** Coincident 0% on dual % axes — returns [min, max] per extent. */
function mdLqZeroAlignedPctRanges(extents, pad = 0.08) {
  const padded = extents.map(({ min, max }) => {
    const span = Math.max(max - min, 2);
    const p = span * pad;
    return { min: min - p, max: max + p };
  });
  const belowFrac = Math.max(
    ...padded.map(({ min, max }) => {
      const span = max - min;
      return span > 0 ? Math.max(0, -min) / span : 0.5;
    }),
  );
  const aboveFrac = Math.max(
    ...padded.map(({ min, max }) => {
      const span = max - min;
      return span > 0 ? Math.max(0, max) / span : 0.5;
    }),
  );
  return padded.map(({ min, max }) => {
    const below = Math.max(0, -min);
    const above = Math.max(0, max);
    const total = Math.max(below / belowFrac, above / aboveFrac, 2);
    return [-total * belowFrac, total * aboveFrac];
  });
}

function mdPlotAxis() {
  return {
    showgrid: true,
    gridcolor: "rgba(148, 163, 184, 0.1)",
    zeroline: false,
    tickfont: { size: 10, color: "#94a3b8" },
    linecolor: "rgba(148, 163, 184, 0.2)",
    titlefont: { size: 10, color: "#94a3b8" },
  };
}

function mdLqQuarterEnd(period) {
  const m = String(period).match(/^(\d{4})-Q([1-4])$/);
  if (!m) return period;
  const ends = { 1: [3, 31], 2: [6, 30], 3: [9, 30], 4: [12, 31] };
  const [mo, day] = ends[+m[2]];
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mdLqMonthEnd(monthKey) {
  const m = String(monthKey).match(/^(\d{4})-(\d{2})$/);
  if (!m) return monthKey;
  const yr = +m[1];
  const mo = +m[2];
  const day = new Date(yr, mo, 0).getDate();
  return `${m[1]}-${m[2]}-${String(day).padStart(2, "0")}`;
}

function mdLqYearMid(year) {
  const y = Number(year);
  return Number.isFinite(y) ? `${y}-07-01` : year;
}

function mdLqBuildXaxis(opts = {}) {
  const base = mdPlotAxis();
  const xType = opts.xType || "year";
  if (xType === "date") {
    return {
      ...base,
      type: "date",
      tickmode: opts.tickmode || "auto",
      nticks: opts.xNticks || 8,
      tickformat: opts.xTickFormat || "%Y",
      dtick: opts.xDtick || "M12",
      rangeslider: { visible: false },
    };
  }
  return {
    ...base,
    type: "linear",
    tickmode: opts.tickmode || "linear",
    dtick: opts.xDtick ?? 2,
    tickformat: opts.xTickFormat || "d",
  };
}

function mdPlotLayout(title, height = 380, opts = {}) {
  const layout = {
    template: "plotly_dark",
    title: title ? { text: title, font: { size: 13, color: "#cbd5e1" }, x: 0.02, xanchor: "left" } : undefined,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(255,255,255,0.02)",
    margin: { l: 56, r: opts.y2 ? 58 : 20, t: title ? 40 : 16, b: 48 },
    height,
    font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 11, color: "#94a3b8" },
    hoverlabel: {
      bgcolor: "#1e2433",
      bordercolor: "rgba(148, 163, 184, 0.35)",
      font: { family: "IBM Plex Sans, sans-serif", size: 11, color: "#e2e8f0" },
    },
    legend: {
      orientation: "h",
      y: 1.1,
      x: 0,
      font: { size: 10, color: "#94a3b8" },
      bgcolor: "rgba(0,0,0,0)",
    },
    xaxis: mdLqBuildXaxis(opts),
    yaxis: { ...mdPlotAxis(), title: opts.yTitle || "" },
  };
  if (opts.yRange) layout.yaxis.range = opts.yRange;
  if (opts.zeroAlign) {
    layout.yaxis.zeroline = true;
    layout.yaxis.zerolinecolor = "rgba(148, 163, 184, 0.35)";
    layout.yaxis.zerolinewidth = 1;
  }
  if (opts.y2) {
    layout.yaxis2 = {
      ...mdPlotAxis(),
      title: opts.y2Title || "",
      overlaying: "y",
      side: "right",
      showgrid: false,
      tickfont: { size: 10, color: MD_LQ_COLORS.momentum },
      titlefont: { size: 10, color: MD_LQ_COLORS.momentum },
    };
    if (opts.y2Range) layout.yaxis2.range = opts.y2Range;
    if (opts.zeroAlign) {
      layout.yaxis2.zeroline = true;
      layout.yaxis2.zerolinecolor = "rgba(148, 163, 184, 0.35)";
      layout.yaxis2.zerolinewidth = 1;
    }
  }
  if (opts.hover) layout.hovermode = opts.hover;
  return layout;
}

function mdFmtHoverUsd(val) {
  if (val == null || Number.isNaN(val)) return "—";
  const n = Number(val);
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function mdLoadSettings() {
  try {
    const raw = localStorage.getItem(MD_SETTINGS_KEY);
    if (raw) return { ...mdState, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...mdState };
}

function mdSaveSettings() {
  localStorage.setItem(MD_SETTINGS_KEY, JSON.stringify(mdState));
}

function mdIndicatorMeta(key) {
  return (mdMeta?.indicators || []).find((i) => i.key === key) || { label: key, format: "pct" };
}

function mdRowIndicators(row, tab) {
  const all = mdMeta?.indicators || [];
  if (tab === "overview") return all;
  return all.filter((i) => i.tab === tab);
}

function mdFilteredRows() {
  return mdSnapshot?.rows || [];
}

function mdSnapshotParams() {
  const p = new URLSearchParams();
  if (mdState.year) p.set("year", String(mdState.year));
  if (mdState.region) p.set("region", mdState.region);
  if (mdState.income) p.set("income", mdState.income);
  if (mdState.search) p.set("search", mdState.search);
  if (!mdState.showAggregates) p.set("aggregates", "0");
  if (mdState.onlyFeaturedAggs) p.set("featuredAggs", "1");
  return p;
}

async function mdFetchJson(path, force = false) {
  const params = new URLSearchParams(path.split("?")[1] || "");
  if (force) params.set("refresh", "1");
  const url = `/api/macro/drivers/${path.split("?")[0]}?${params}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function mdLoadMeta(force = false) {
  const swr = window.DashboardSWR;
  if (!swr) return null;
  const result = await swr.runSWR({
    key: "macro:drivers:meta:v7",
    l1: "macro",
    source: "WB → IMF WEO → OECD EO → Eurostat → DBnomics",
    persist: true,
    revalidate: force,
    updateHeader: false,
    fetch: () => mdFetchJson("meta", force),
    render: () => {},
  });
  mdMeta = result;
  if (!mdState.year && mdMeta?.defaultYear) mdState.year = mdMeta.defaultYear;
  return mdMeta;
}

async function mdLoadSnapshot(force = false) {
  const swr = window.DashboardSWR;
  if (!swr) return null;
  mdSnapshotFromCache = false;
  const key = `macro:drivers:snapshot:v9:${mdSnapshotParams().toString()}`;
  const result = await swr.runSWR({
    key,
    l1: "macro",
    source: "WB → IMF WEO → OECD EO → Eurostat → DBnomics",
    persist: true,
    revalidate: force,
    updateHeader: false,
    fetch: () => mdFetchJson(`snapshot?${mdSnapshotParams()}`, force),
    render: (data, opts = {}) => {
      if (opts.fromCache) mdSnapshotFromCache = true;
      if (opts.loading) {
        const body = mdEl("md-table-body");
        if (body) body.innerHTML = '<tr><td colspan="12">Loading snapshot…</td></tr>';
      }
    },
  });
  mdSnapshot = result;
  return mdSnapshot;
}

async function mdLoadMap(force = false) {
  const p = new URLSearchParams();
  p.set("metric", mdState.metric);
  if (mdState.year) p.set("year", String(mdState.year));
  if (mdState.region) p.set("region", mdState.region);
  if (mdState.income) p.set("income", mdState.income);
  const swr = window.DashboardSWR;
  const key = `macro:drivers:map:v4:${p.toString()}`;
  if (swr) {
    mdMapData = await swr.runSWR({
      key,
      l1: "macro",
      persist: true,
      revalidate: force,
      updateHeader: false,
      fetch: () => mdFetchJson(`map?${p}`, force),
      render: () => {},
    });
  } else {
    mdMapData = await mdFetchJson(`map?${p}`, force);
  }
  return mdMapData;
}

async function mdLoadSeries(entities, force = false) {
  const p = new URLSearchParams();
  p.set("indicator", mdState.metric);
  p.set("entities", entities.join(","));
  const swr = window.DashboardSWR;
  const key = `macro:drivers:series:v3:${p.toString()}`;
  if (swr) {
    return swr.runSWR({
      key,
      l1: "macro",
      persist: true,
      revalidate: force,
      updateHeader: false,
      fetch: () => mdFetchJson(`series?${p}`, force),
      render: () => {},
    });
  }
  return mdFetchJson(`series?${p}`, force);
}

function mdRegimeBadge(regime) {
  if (!regime?.label) return "";
  const colors = {
    danger: "#ef4444",
    warning: "#f59e0b",
    success: "#22c55e",
    info: "#38bdf8",
    primary: "#14b8a6",
    secondary: "#64748b",
    dark: "#94a3b8",
  };
  const c = colors[regime.color] || colors.primary;
  return `<span class="md-regime-badge" style="border-color:${c};color:${c}">${regime.label}</span>`;
}

function mdPopulateFilters() {
  const yearSel = mdEl("md-year");
  if (yearSel && mdMeta?.years?.length) {
    const savedYear = mdState.year;
    yearSel.innerHTML = [...mdMeta.years].reverse().map((y) => `<option value="${y}">${y}</option>`).join("");
    const years = mdMeta.years.map(Number);
    const pick =
      savedYear && years.includes(savedYear)
        ? savedYear
        : years.includes(mdMeta.defaultYear)
          ? mdMeta.defaultYear
          : years[years.length - 1];
    yearSel.value = String(pick);
    mdState.year = Number(pick);
  }
  const metricSel = mdEl("md-metric");
  if (metricSel && mdMeta?.indicators) {
    metricSel.innerHTML = mdMeta.indicators.map((i) => `<option value="${i.key}">${i.label}</option>`).join("");
    metricSel.value = mdState.metric;
  }
  const regionSel = mdEl("md-region");
  if (regionSel) {
    const regions = [...new Set((mdMeta?.countries || []).map((c) => c.region).filter(Boolean))].sort();
    regionSel.innerHTML = '<option value="">All regions</option>' + regions.map((r) => `<option value="${r}">${r}</option>`).join("");
    regionSel.value = mdState.region;
  }
  const incomeSel = mdEl("md-income");
  if (incomeSel) {
    const incomes = [...new Set((mdMeta?.countries || []).map((c) => c.income).filter(Boolean))].sort();
    incomeSel.innerHTML = '<option value="">All income groups</option>' + incomes.map((r) => `<option value="${r}">${r}</option>`).join("");
    incomeSel.value = mdState.income;
  }
  const stats = mdEl("md-stats");
  if (stats && mdMeta?.stats) {
    const s = mdMeta.stats;
    stats.textContent = `${s.countryCount} countries · ${s.aggregateCount} aggregates · ${s.totalEntities} entities`;
  }
}

function mdRenderMeta(opts = {}) {
  const el = mdEl("macro-drivers-update");
  if (!el) return;
  el.textContent =
    window.DashboardSWR?.formatPanelMeta({
      fetchedAt: mdSnapshot?.fetchedAt || mdMeta?.fetchedAt,
      source: mdMeta?.source || "WB → IMF WEO → OECD EO → Eurostat → DBnomics",
      fromCache: opts.fromCache,
    }) || mdMeta?.source || "—";
}

function mdRenderKpis() {
  const el = mdEl("md-kpis");
  if (!el || !mdSnapshot) return;
  const year = mdState.year || mdSnapshot.year;
  const picks = ["gdp_growth", "cpi_inflation", "unemployment", "current_account"];
  el.innerHTML = picks
    .map((key) => {
      const meta = mdIndicatorMeta(key);
      const kpi = mdSnapshot.kpis?.[key];
      const med = kpi ? mdFmtValue(kpi.median, meta.format) : "—";
      return `<article class="md-kpi-card"><span class="md-kpi-label">${meta.label}</span><span class="md-kpi-value">${med}</span><span class="md-kpi-meta">Median · ${year} · n=${kpi?.count || 0}</span></article>`;
    })
    .join("");
}

function mdRenderTableBody(bodyId, headId, cols, year) {
  const body = mdEl(bodyId);
  if (!body || !mdSnapshot) return;

  const head = mdEl(headId);
  if (head) {
    head.innerHTML = `<tr><th>Country</th><th>Region</th>${cols.map((c) => `<th class="mono">${c.label}</th>`).join("")}<th class="md-col-sources">Sources (${year})</th></tr>`;
  }

  const rows = mdFilteredRows();
  body.innerHTML = rows
    .map((r) => {
      const selected = mdSelected.has(r.id) ? " md-row-selected" : "";
      const cells = cols
        .map((ind) => {
          const cell = r.indicators?.[ind.key];
          const val = mdFmtValue(cell?.value, ind.format);
          const badge = mdSourceBadge(cell?.source);
          const proj = cell?.projection ? '<span class="md-proj-tag">proj</span>' : "";
          return `<td class="mono">${val} ${badge}${proj}</td>`;
        })
        .join("");
      const sources = r.sources?.join(", ") || "—";
      const agg = r.isAggregate ? '<span class="md-agg-badge">AGG</span> ' : "";
      return `<tr class="md-row${selected}" data-country-id="${r.id}"><td>${agg}${r.name}</td><td>${r.region || "—"}</td>${cells}<td class="md-sources-col">${sources}</td></tr>`;
    })
    .join("");

  body.querySelectorAll(".md-row").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.countryId;
      if (mdSelected.has(id)) mdSelected.delete(id);
      else mdSelected.add(id);
      mdRenderTable();
      void mdRenderCharts();
    });
  });
}

function mdRenderTable() {
  if (!mdSnapshot) return;
  const year = mdState.year || mdSnapshot.year;
  mdRenderTableBody(
    "md-table-body",
    "md-table-head",
    mdRowIndicators(null, "overview"),
    year,
  );
  mdRenderTableBody(
    "md-table-body-eco",
    "md-table-head-eco",
    mdRowIndicators(null, mdEconomyTab),
    year,
  );
}

async function mdRenderMap() {
  const el = mdEl("md-map");
  if (!el || !window.Plotly) return;
  if (!mdMapData) await mdLoadMap();
  const meta = mdIndicatorMeta(mdState.metric);
  const year = mdState.year || mdMapData?.year;
  const locations = [];
  const z = [];
  const text = [];

  (mdMapData?.points || []).forEach((p) => {
    locations.push(p.iso3);
    z.push(p.value);
    text.push(`${p.name}<br>${mdFmtValue(p.value, meta.format)} ${meta.unit || ""}<br>${p.source || "—"} · ${year}`);
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

async function mdRenderCharts() {
  if (!mdMeta || !window.Plotly) return;
  const year = mdState.year || mdSnapshot?.year;
  const meta = mdIndicatorMeta(mdState.metric);
  const selected = [...mdSelected];
  const compare = selected.length
    ? selected
    : ["US", "CN", "DE", "JP", "IN", "GB"].filter((id) => mdSnapshot?.rows?.some((r) => r.id === id));

  const seriesData = await mdLoadSeries(compare.slice(0, 8), false);

  const tsEl = mdEl("md-timeseries");
  if (tsEl) {
    const traces = Object.entries(seriesData.series || {}).map(([cid, s]) => ({
      x: s.points.map((p) => p.year),
      y: s.points.map((p) => p.value),
      name: s.name || cid,
      type: "scatter",
      mode: "lines+markers",
    }));
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

  const rankEl = mdEl("md-ranking");
  if (rankEl && mdSnapshot) {
    const rows = mdSnapshot.rows
      .filter((r) => !r.isAggregate)
      .map((r) => {
        const cell = r.indicators?.[mdState.metric];
        return { name: r.name, value: cell?.value, source: cell?.source };
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
}

function mdRenderCommentary() {
  const regimeEl = mdEl("macro-drivers-regime-commentary");
  if (regimeEl && mdSnapshot?.regime) regimeEl.innerHTML = mdRegimeBadge(mdSnapshot.regime);
  const obs = mdEl("macro-drivers-observations");
  if (obs) obs.innerHTML = (mdSnapshot?.observations || []).map((t) => `<li>${t}</li>`).join("");
  const eq = mdEl("macro-drivers-equity-implications");
  if (eq) eq.innerHTML = (mdSnapshot?.equityImplications || []).map((t) => `<li>${t}</li>`).join("");
  const ta = mdEl("macro-drivers-commentary-text");
  if (ta && !ta.dataset.hydrated) {
    const saved = localStorage.getItem(MD_COMMENTARY_KEY);
    ta.value = saved || MD_DEFAULT_COMMENTARY.replace("{date}", new Date().toISOString().slice(0, 10));
    ta.dataset.hydrated = "1";
  }
}

function mdUpdateControlVisibility() {
  const tab = mdActiveTab;
  const economyTabs = new Set(["overview", "economy", "charts"]);

  document.querySelectorAll("[data-md-control-group]").forEach((el) => {
    const forTabs = (el.dataset.mdControlGroup || "").split(",").map((t) => t.trim());
    el.hidden = !forTabs.includes(tab);
  });

  const filtersPanel = mdEl("md-filters-panel");
  if (filtersPanel) filtersPanel.hidden = !economyTabs.has(tab);

  const kpiSection = document.querySelector(".md-kpi-section");
  if (kpiSection) kpiSection.hidden = !economyTabs.has(tab);

  const metricLabelText = mdEl("md-metric-label-text");
  if (metricLabelText) {
    metricLabelText.textContent = tab === "charts" ? "Chart indicator" : "Map indicator";
  }
}

function mdShowTab(tab) {
  mdActiveTab = tab;
  document.querySelectorAll(".macro-drivers-subtab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mdSub === tab);
  });
  document.querySelectorAll(".macro-drivers-panel").forEach((p) => {
    p.hidden = p.dataset.mdSub !== tab;
  });
  document.querySelectorAll(".md-economy-subtab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mdEco === mdEconomyTab);
  });
  const titles = {
    overview: "Global snapshot",
    growth: "Growth & Income",
    prices: "Prices & Stability",
    trade: "Trade & Investment",
    labor: "Labor Market",
  };
  const titleEl = mdEl("md-table-title");
  if (titleEl) {
    titleEl.textContent =
      tab === "economy" ? titles[mdEconomyTab] || "Economy" : tab === "overview" ? "Global snapshot" : titleEl.textContent;
  }
  mdUpdateControlVisibility();
  window.decorateHelpLabels?.(mdEl("md-filters-panel"));
}

function mdRenderAll(opts = {}) {
  if (!mdMeta || !mdSnapshot) return;
  mdRenderMeta(opts);
  mdPopulateFilters();
  mdRenderKpis();
  mdRenderTable();
  mdRenderCommentary();
  if (mdActiveTab === "overview") void mdRenderMap();
  if (mdActiveTab === "charts") void mdRenderCharts();
}

function mdExportCsv() {
  if (!mdSnapshot || !mdMeta) return;
  const year = mdState.year || mdSnapshot.year;
  const indicators = mdMeta.indicators || [];
  const header = ["country", "iso3", "region", "income", "is_aggregate", ...indicators.flatMap((i) => [`${i.key}_${year}`, `${i.key}_${year}_source`])];
  const lines = [header.join(",")];
  mdFilteredRows().forEach((r) => {
    const row = [r.name, r.iso3, r.region, r.income, r.isAggregate ? "1" : "0"];
    indicators.forEach((ind) => {
      const cell = r.indicators?.[ind.key];
      row.push(cell?.value ?? "", cell?.source ?? "");
    });
    lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `macro-drivers-${year}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function mdLqLoadSettings() {
  try {
    const raw = localStorage.getItem(MD_LQ_SETTINGS_KEY);
    if (raw) {
      return { ...mdLqState, ...JSON.parse(raw) };
    }
  } catch {
    /* ignore */
  }
  return { ...mdLqState };
}

function mdLqValidatePayload(data) {
  if (!data?.global?.series?.length) return false;
  return true;
}

async function mdLqClearChart(el, message) {
  if (!el) return;
  if (window.Plotly) {
    try {
      Plotly.purge(el);
    } catch {
      /* ignore */
    }
  }
  el.innerHTML = `<p class="md-lq-chart-empty">${message}</p>`;
}

function mdLqPrepareChartEl(el) {
  if (!el) return;
  if (el.querySelector(".md-lq-chart-empty")) el.innerHTML = "";
}

function mdLqSaveSettings() {
  localStorage.setItem(MD_LQ_SETTINGS_KEY, JSON.stringify(mdLqState));
}

function mdLqCompCell(comp) {
  if (!comp || comp.value == null) return "—";
  return `${mdFmtValue(comp.value, "large_usd")} ${mdSourceBadge(comp.source)}`;
}

async function mdFetchLiquidity(force = false) {
  const p = new URLSearchParams();
  p.set("entity", mdLqState.entity || "WLD");
  if (mdLqState.year) p.set("year", String(mdLqState.year));
  if (mdLqState.overlay) p.set("overlay", "1");
  return mdFetchJson(`liquidity?${p}`, force);
}

async function mdFetchLiquidityMap(force = false) {
  const p = new URLSearchParams();
  p.set("metric", mdLqState.mapMetric || "proxy");
  if (mdLqState.year) p.set("year", String(mdLqState.year));
  return mdFetchJson(`liquidity/map?${p}`, force);
}

function mdLqEntityLabel(entityId) {
  return mdLiquidity?.entities?.find((e) => e.id === entityId)?.label || entityId;
}

function mdLqBreadcrumbItems(entityId) {
  if (entityId === "WLD") return [{ id: "WLD", label: "Global" }];
  if (MD_LQ_SCOPE_ENTITIES.has(entityId)) {
    return [
      { id: "WLD", label: "Global" },
      { id: entityId, label: mdLqEntityLabel(entityId) },
    ];
  }
  return [
    { id: "WLD", label: "Global" },
    { id: entityId, label: mdLqEntityLabel(entityId) },
  ];
}

function mdLqSelectEntity(entityId) {
  if (!entityId || entityId === mdLqState.entity) return;
  mdLqState.entity = entityId;
  const entSel = mdEl("md-lq-entity");
  if (entSel) entSel.value = entityId;
  mdLqSaveSettings();
  mdLqRenderBreadcrumb();
  void loadMacroLiquidity();
}

function mdLqRenderBreadcrumb() {
  const nav = mdEl("md-lq-breadcrumb");
  if (!nav) return;
  const items = mdLqBreadcrumbItems(mdLqState.entity || "WLD");
  nav.innerHTML = items
    .map((item, i) => {
      const isLast = i === items.length - 1;
      const btn = isLast
        ? `<button type="button" aria-current="page">${item.label}</button>`
        : `<button type="button" data-lq-crumb="${item.id}">${item.label}</button>`;
      const sep = isLast ? "" : '<span class="md-lq-breadcrumb-sep" aria-hidden="true">›</span>';
      return `${btn}${sep}`;
    })
    .join("");
  nav.querySelectorAll("[data-lq-crumb]").forEach((btn) => {
    btn.addEventListener("click", () => mdLqSelectEntity(btn.dataset.lqCrumb));
  });
}

async function mdLqLoadMap(force = false) {
  mdLqMapData = await mdFetchLiquidityMap(force);
  return mdLqMapData;
}

async function mdLqRenderMap() {
  const el = mdEl("md-lq-map");
  if (!el || !window.Plotly) return;
  if (!mdLqMapData) await mdLqLoadMap(false);
  const metric = mdLqState.mapMetric || "proxy";
  const year = mdLqState.year || mdLqMapData?.year;
  const fmt = metric === "yoy" ? "pct" : "large_usd";
  const unit = metric === "yoy" ? "%" : "USD";
  const locations = [];
  const z = [];
  const text = [];
  const customIds = [];

  (mdLqMapData?.points || []).forEach((p) => {
    if (!p.iso3 || p.value == null) return;
    locations.push(p.iso3);
    z.push(p.value);
    customIds.push(p.id);
    text.push(
      `${p.name}<br>${mdFmtValue(p.value, fmt)} ${unit}<br>Proxy: ${mdFmtValue(p.proxy, "large_usd")}<br>Sources: ${(p.sources || []).join(", ") || "—"} · ${year}`,
    );
  });

  if (!locations.length) {
    await mdLqClearChart(el, "No map data for this year. Try Refresh liquidity.");
    return;
  }
  mdLqPrepareChartEl(el);
  const mapTitle = metric === "yoy" ? "YoY growth" : "Liquidity proxy";
  await Plotly.react(
    el,
    [
      {
        type: "choropleth",
        locationmode: "ISO-3",
        locations,
        z,
        text,
        customdata: customIds,
        hovertemplate: "%{text}<extra></extra>",
        colorscale: metric === "yoy" ? MD_LQ_MAP_SCALE_YOY : MD_LQ_MAP_SCALE_PROXY,
        zmid: metric === "yoy" ? 0 : undefined,
        colorbar: {
          title: { text: unit, font: { color: "#94a3b8", size: 10 } },
          tickfont: { color: "#94a3b8", size: 10 },
          bgcolor: "rgba(30, 36, 51, 0.9)",
          bordercolor: "rgba(148, 163, 184, 0.2)",
          borderwidth: 1,
          len: 0.55,
          thickness: 14,
        },
      },
    ],
    {
      template: "plotly_dark",
      title: { text: `${mapTitle} · ${year}`, font: { size: 13, color: "#cbd5e1" }, x: 0.02, xanchor: "left" },
      geo: MD_LQ_GEO_DARK,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.02)",
      height: 420,
      margin: { l: 0, r: 0, t: 44, b: 0 },
      font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 11, color: "#94a3b8" },
    },
    MD_PLOTLY_CONFIG,
  );
  if (!el.dataset.lqMapBound) {
    el.dataset.lqMapBound = "1";
    el.on("plotly_click", (ev) => {
      const id = ev?.points?.[0]?.customdata;
      if (id) mdLqSelectEntity(id);
    });
  }
}

function mdLqExportCsv() {
  if (!mdLiquidity) return;
  const year = mdLqState.year || mdLiquidity.year;
  const header = [
    "country",
    "iso3",
    "proxy_usd",
    "yoy_pct",
    "cb_balance_sheet",
    "cb_source",
    "broad_money",
    "money_source",
    "fx_reserves",
    "fx_source",
    "sources",
    "cb_to_gdp",
    "money_to_gdp",
    "liquidity_impulse",
  ];
  const lines = [header.join(",")];
  (mdLiquidity.countries || []).forEach((r) => {
    const c = r.components || {};
    const d = r.derived || {};
    const row = [
      r.name,
      r.iso3 || "",
      r.proxy ?? "",
      r.yoy ?? "",
      c.cb_balance_sheet?.value ?? "",
      c.cb_balance_sheet?.source ?? "",
      c.broad_money?.value ?? "",
      c.broad_money?.source ?? "",
      c.fx_reserves?.value ?? "",
      c.fx_reserves?.source ?? "",
      (r.sources || []).join(";"),
      d.cb_to_gdp ?? "",
      d.money_to_gdp ?? "",
      d.liquidity_impulse ?? "",
    ];
    lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `liquidity-proxies-${year}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function mdOpenLqMethodology() {
  const dlg = mdEl("md-lq-methodology-dialog");
  if (!dlg) return;
  const body = mdEl("md-lq-methodology-body");
  const m = mdLiquidity?.methodology;
  if (body && m) {
    const cov = mdLiquidity.coverageStats;
    body.innerHTML = `
      <p><strong>Formula:</strong> ${mdLiquidity.formula || m.formula || ""}</p>
      <ol>${(m.hierarchy || []).map((h) => `<li>${h}</li>`).join("")}</ol>
      <p><strong>YoY:</strong> ${m.yoy || ""}</p>
      <p><strong>3m SAR (monthly):</strong> ${m.momentumMonthly || ""}</p>
      <p><strong>3m momentum (fallback):</strong> ${m.momentum || ""}</p>
      <p><strong>Market overlay:</strong> ${m.marketOverlay || ""}</p>
      <p><strong>Credit gap:</strong> ${m.creditGap || ""}</p>
      ${mdLiquidity.creditGap?.methodology ? `<p>${mdLiquidity.creditGap.methodology}</p>` : ""}
      ${cov ? `<p><strong>Data quality (${mdLiquidity.year}):</strong> ${cov.proxySharePct}% proxy cells · ${cov.componentCells} component observations · ${Object.entries(cov.bySource || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>` : ""}
      <p class="md-methodology-updated">Last built: ${mdLiquidity.fetchedAt || "—"}</p>
    `;
  }
  if (typeof dlg.showModal === "function") dlg.showModal();
}

function mdLqGapKpiClass(signal) {
  if (signal === "above_trend_warning") return "md-lq-kpi-value--hot";
  if (signal === "above_trend") return "md-lq-kpi-value--warn";
  if (signal === "below_trend" || signal === "well_below_trend") return "md-lq-kpi-value--cool";
  return "";
}

function mdLqPopulateFilters() {
  const entSel = mdEl("md-lq-entity");
  if (entSel && mdLiquidity?.entities) {
    entSel.innerHTML = mdLiquidity.entities.map((e) => `<option value="${e.id}">${e.label}</option>`).join("");
    const ids = mdLiquidity.entities.map((e) => e.id);
    if (!ids.includes(mdLqState.entity)) {
      mdLqState.entity = ids.includes("WLD") ? "WLD" : ids[0];
      mdLqSaveSettings();
    }
    entSel.value = mdLqState.entity;
  }
  const yearSel = mdEl("md-lq-year");
  const years = (mdLiquidity?.global?.series || []).map((p) => p.year);
  if (yearSel && years.length) {
    const savedYear = mdLqState.year;
    const yearNums = years.map(Number);
    yearSel.innerHTML = [...years].reverse().map((y) => `<option value="${y}">${y}</option>`).join("");
    const pick =
      savedYear && yearNums.includes(savedYear)
        ? savedYear
        : yearNums.includes(Number(mdLiquidity?.year))
          ? Number(mdLiquidity.year)
          : yearNums[yearNums.length - 1];
    yearSel.value = String(pick);
    mdLqState.year = Number(pick);
  }
  const formula = mdEl("md-lq-formula");
  if (formula) formula.textContent = mdLiquidity?.formula || "";
  const ov = mdEl("md-lq-overlay");
  if (ov) ov.checked = !!mdLqState.overlay;
  const mapMetric = mdEl("md-lq-map-metric");
  if (mapMetric) mapMetric.value = mdLqState.mapMetric || "proxy";
}

function mdLqKpiArticle(labelKey, labelText, value, meta = "", valueClass = "") {
  return `<article class="md-lq-kpi">
    <span class="md-lq-kpi-label" data-help-key="${labelKey}">${labelText}</span>
    <span class="md-lq-kpi-value ${valueClass}">${value}</span>
    ${meta ? `<span class="md-lq-kpi-meta">${meta}</span>` : ""}
  </article>`;
}

function mdLqRenderKpis() {
  const el = mdEl("md-lq-kpis");
  const latest = mdLiquidity?.global?.latest;
  if (!el || !latest) return;
  const derived = latest.derived || mdLiquidity.derived || {};
  const cov = mdLiquidity.coverageStats;
  const yoy = latest.yoy != null ? `${latest.yoy.toFixed(2)}%` : "—";
  const sar = latest.momentum3mSar;
  const mom = sar != null ? `${sar.toFixed(2)}%` : latest.momentum3m != null ? `${latest.momentum3m.toFixed(2)}%` : "—";
  const momMeta =
    sar != null
      ? `FRED monthly · ${latest.momentum3mMonth || mdLiquidity.monthly?.latest?.month || ""}`
      : latest.momentum3m != null
        ? "annual approx"
        : "";
  const cbGdp = derived.cb_to_gdp != null ? `${derived.cb_to_gdp.toFixed(1)}%` : "—";
  const moneyGdp = derived.money_to_gdp != null ? `${derived.money_to_gdp.toFixed(1)}%` : "—";
  const impulse = derived.liquidity_impulse != null ? `${derived.liquidity_impulse.toFixed(2)}% GDP` : "—";
  const proxyPct = cov?.proxySharePct != null ? `${cov.proxySharePct}%` : "—";
  const cg = mdLiquidity.creditGap?.latest;
  const cgVal = cg?.gap != null ? `${cg.gap >= 0 ? "+" : ""}${cg.gap.toFixed(1)} pp` : null;
  const cgCls = cg ? mdLqGapKpiClass(cg.signal) : "";
  const cgMetaText = cg
    ? `BIS · ${cg.period || ""}${mdLiquidity.creditGap?.hasProjection ? " · proj. flat" : ""}`
    : "";
  const cgKpi = cgVal
    ? mdLqKpiArticle("md-lq-kpi-credit-gap", "BIS credit gap", cgVal, cgMetaText, cgCls)
    : "";
  el.innerHTML = [
    mdLqKpiArticle(
      "md-lq-kpi-proxy",
      `Proxy (${latest.year})`,
      mdFmtValue(latest.proxy, "large_usd"),
      `${(latest.sources || []).join(" · ")}${latest.projected ? " · projected" : ""}`,
    ),
    mdLqKpiArticle("md-lq-kpi-yoy", "YoY growth", yoy),
    mdLqKpiArticle("md-lq-kpi-sar", "3m SAR", mom, momMeta || "—"),
    cgKpi,
    mdLqKpiArticle("md-lq-kpi-cb-gdp", "CB / GDP", cbGdp),
    mdLqKpiArticle("md-lq-kpi-money-gdp", "Money / GDP", moneyGdp),
    mdLqKpiArticle("md-lq-kpi-impulse", "Liquidity impulse", impulse),
    mdLqKpiArticle("md-lq-kpi-proxy-share", "Proxy share", proxyPct, "component cells · table year"),
  ]
    .filter(Boolean)
    .join("");
}

function mdLqRenderTable() {
  const body = mdEl("md-lq-table-body");
  if (!body || !mdLiquidity) return;
  const rows = mdLiquidity.countries || [];
  body.innerHTML = rows.length
    ? rows
        .map((r) => {
          const c = r.components || {};
          return `<tr class="md-lq-row" data-lq-id="${r.id}"><td>${r.name}</td><td class="mono">${mdFmtValue(r.proxy, "large_usd")}</td><td class="mono">${r.yoy != null ? r.yoy.toFixed(2) + "%" : "—"}</td><td class="mono">${mdLqCompCell(c.cb_balance_sheet)}</td><td class="mono">${mdLqCompCell(c.broad_money)}</td><td class="mono">${mdLqCompCell(c.fx_reserves)}</td><td class="md-sources-col">${(r.sources || []).join(", ") || "—"}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="7">No liquidity data for selected year</td></tr>';

  body.querySelectorAll(".md-lq-row").forEach((row) => {
    const id = row.dataset.lqId;
    row.classList.toggle("md-lq-row--active", id === mdLqState.entity);
    row.addEventListener("click", () => {
      const r = rows.find((x) => x.id === id);
      const detail = mdEl("md-lq-country-detail");
      if (!detail || !r) return;
      const c = r.components || {};
      const d = r.derived || {};
      detail.hidden = false;
      detail.innerHTML = `
        <h3 class="macro-drivers-h3">${r.name} · component breakdown</h3>
        <ul class="macro-drivers-bullets">
          <li><strong>CB Balance Sheet:</strong> ${mdLqCompCell(c.cb_balance_sheet)} ${c.cb_balance_sheet?.methodology ? `<em>${c.cb_balance_sheet.methodology}</em>` : ""}</li>
          <li><strong>Broad Money:</strong> ${mdLqCompCell(c.broad_money)} ${c.broad_money?.methodology ? `<em>${c.broad_money.methodology}</em>` : ""}</li>
          <li><strong>FX Reserves:</strong> ${mdLqCompCell(c.fx_reserves)} ${c.fx_reserves?.methodology ? `<em>${c.fx_reserves.methodology}</em>` : ""}</li>
          <li><strong>CB / GDP:</strong> ${d.cb_to_gdp != null ? `${d.cb_to_gdp.toFixed(1)}%` : "—"} · <strong>Money / GDP:</strong> ${d.money_to_gdp != null ? `${d.money_to_gdp.toFixed(1)}%` : "—"} · <strong>Impulse:</strong> ${d.liquidity_impulse != null ? `${d.liquidity_impulse.toFixed(2)}%` : "—"}</li>
        </ul>
      `;
      mdLqSelectEntity(id);
    });
  });
}

function mdLqCompHoverData(series, years, key) {
  return years.map((y) => {
    const cell = series.find((p) => p.year === y)?.components?.[key];
    return [mdFmtHoverUsd(cell?.value), cell?.source || "—"];
  });
}

function mdLqYearDtick(years) {
  if (!years.length) return 2;
  const span = years[years.length - 1] - years[0];
  if (span > 40) return 5;
  if (span > 20) return 2;
  return 1;
}

/** Split a line into solid (actual) + dashed (projected) at first projected point. */
function mdLqProjectionLineTraces(x, y, points, { name, line, hovertemplate, customdata }) {
  const idx = (points || []).findIndex((p) => p?.projected);
  if (idx < 0) {
    return [{ x, y, name, type: "scatter", mode: "lines", line, customdata, hovertemplate }];
  }
  const bridge = Math.max(0, idx - 1);
  const projLine = { ...line, dash: "dash", width: (line?.width || 2) - 0.5 };
  return [
    {
      x: x.slice(0, idx),
      y: y.slice(0, idx),
      name,
      type: "scatter",
      mode: "lines",
      line,
      customdata: customdata?.slice(0, idx),
      hovertemplate,
    },
    {
      x: x.slice(bridge),
      y: y.slice(bridge),
      name: `${name} (proj.)`,
      type: "scatter",
      mode: "lines",
      line: projLine,
      customdata: customdata?.slice(bridge),
      hovertemplate: hovertemplate?.replace("<extra>", " · projected<extra>") || hovertemplate,
      opacity: 0.82,
    },
  ];
}

async function mdLqRenderCharts() {
  if (!mdLiquidity || !window.Plotly) return;
  const series = mdLiquidity.global?.series || [];
  const label = mdLiquidity.global?.label || mdLqState.entity;
  const years = series.map((p) => p.year);

  const compKeys = [
    { key: "cb_balance_sheet", name: "CB Balance Sheet", color: MD_LQ_COLORS.cb },
    { key: "broad_money", name: "Broad Money", color: MD_LQ_COLORS.money },
    { key: "fx_reserves", name: "FX Reserves", color: MD_LQ_COLORS.reserves },
  ];

  const globalEl = mdEl("md-lq-global-chart");
  if (globalEl) {
    if (!years.length) {
      await mdLqClearChart(globalEl, "No liquidity data for this view. Try Refresh liquidity.");
    } else {
    mdLqPrepareChartEl(globalEl);
    const traces = compKeys.map((ck) => ({
      x: years,
      y: years.map((y) => series.find((p) => p.year === y)?.components?.[ck.key]?.value ?? null),
      name: ck.name,
      type: "bar",
      marker: { color: ck.color, line: { width: 0 } },
      customdata: mdLqCompHoverData(series, years, ck.key),
      hovertemplate: `Year %{x}<br>${ck.name}: %{customdata[0]}<br>Source: %{customdata[1]}<extra></extra>`,
    }));
    traces.push(
      ...mdLqProjectionLineTraces(
        years,
        series.map((p) => p.proxy),
        series,
        {
          name: "Total proxy",
          line: { color: MD_LQ_COLORS.total, width: 2.5, shape: "spline" },
          hovertemplate: "Year %{x}<br>Total: %{y:$,.0f}<extra></extra>",
        },
      ).map((t) => ({ ...t, yaxis: "y2" })),
    );
    await Plotly.react(
      globalEl,
      traces,
      {
        ...mdPlotLayout(`${label} · Liquidity Proxy`, 400, {
          yTitle: "Components (USD)",
          y2: true,
          y2Title: "Total",
          xType: "year",
          xDtick: mdLqYearDtick(years),
        }),
        barmode: "stack",
        bargap: 0.28,
        bargroupgap: 0.08,
      },
      MD_PLOTLY_CONFIG,
    );
    }
  }

  const growthEl = mdEl("md-lq-growth-chart");
  if (growthEl) {
    const monthly = mdLiquidity.monthly?.points || [];
    const hasAnnual = years.length > 0;
    const hasMonthly = monthly.length > 0;
    if (!hasAnnual && !hasMonthly) {
      await mdLqClearChart(growthEl, "No growth data for this view.");
    } else {
      mdLqPrepareChartEl(growthEl);
      const traces = [];
      const growthXOpts = hasMonthly
        ? { xType: "date", xTickFormat: "%Y", xDtick: "M12", xNticks: 8 }
        : { xType: "year", xDtick: mdLqYearDtick(years) };
      if (hasAnnual) {
        const annualX = hasMonthly ? years.map(mdLqYearMid) : years;
        traces.push({
          x: annualX,
          y: series.map((p) => p.yoy),
          name: "YoY % (annual)",
          type: "scatter",
          mode: "lines",
          line: { color: MD_LQ_COLORS.yoy, width: 2.5, shape: "spline" },
          fill: "tozeroy",
          fillcolor: "rgba(52, 211, 153, 0.12)",
          customdata: years,
          hovertemplate: "Year %{customdata}<br>YoY: %{y:.2f}%<extra></extra>",
        });
        if (!hasMonthly) {
          traces.push({
            x: years,
            y: series.map((p) => p.momentum3m),
            name: "3m momentum (annual approx)",
            type: "scatter",
            mode: "lines",
            line: { color: MD_LQ_COLORS.momentum, width: 2, dash: "dot", shape: "spline" },
            hovertemplate: "Year %{x}<br>Momentum: %{y:.2f}%<extra></extra>",
          });
        }
      }
      if (hasMonthly) {
        const sarX = monthly.map((p) => mdLqMonthEnd(p.month));
        const sarY = monthly.map((p) => p.sar3m);
        traces.push(
          ...mdLqProjectionLineTraces(sarX, sarY, monthly, {
            name: "3m SAR (monthly)",
            line: { color: MD_LQ_COLORS.momentum, width: 2.5, shape: "spline" },
            customdata: monthly.map((p) => p.month),
            hovertemplate: "%{customdata}<br>3m SAR: %{y:.2f}%<extra></extra>",
          }).map((t) => ({ ...t, yaxis: "y2" })),
        );
        traces.push({
          x: monthly.map((p) => mdLqMonthEnd(p.month)),
          y: monthly.map((p) => p.yoy),
          name: "YoY % (monthly)",
          type: "scatter",
          mode: "lines",
          line: { color: "#67e8f9", width: 1.5, dash: "dash", shape: "spline" },
          customdata: monthly.map((p) => p.month),
          hovertemplate: "%{customdata}<br>YoY: %{y:.2f}%<extra></extra>",
        });
      }
      const sub = mdLiquidity.monthly?.label ? ` · ${mdLiquidity.monthly.label}` : "";
      const growthLayoutOpts = { yTitle: "YoY %", ...growthXOpts };
      if (hasMonthly) {
        const yoyVals = [];
        if (hasAnnual) yoyVals.push(...series.map((p) => p.yoy));
        yoyVals.push(...monthly.map((p) => p.yoy));
        const sarVals = monthly.map((p) => p.sar3m);
        const [yRange, y2Range] = mdLqZeroAlignedPctRanges([mdLqPctExtent(yoyVals), mdLqPctExtent(sarVals)]);
        Object.assign(growthLayoutOpts, {
          y2: true,
          y2Title: "3m SAR %",
          yRange,
          y2Range,
          zeroAlign: true,
        });
      } else {
        growthLayoutOpts.yTitle = "%";
      }
      await Plotly.react(
        growthEl,
        traces,
        mdPlotLayout(`${label} · Growth & 3m SAR${sub}`, MD_LQ_CHART_HEIGHT, growthLayoutOpts),
        MD_PLOTLY_CONFIG,
      );
    }
  }

  const cgPanel = mdEl("md-lq-credit-gap-panel");
  const cg = mdLiquidity.creditGap;
  if (cgPanel) cgPanel.hidden = !cg?.points?.length;
  const cgEl = mdEl("md-lq-credit-gap-chart");
  const cgMeta = mdEl("md-lq-credit-gap-meta");
  if (cgMeta && cg) {
    const projNote = cg.hasProjection ? " · dashed = flat proj." : "";
    cgMeta.textContent = `${cg.label} · ${cg.method || "BIS"} · private NFC${projNote}`;
  }
  if (cgEl && cg?.points?.length) {
    const periods = cg.points.map((p) => p.period);
    const xDates = periods.map(mdLqQuarterEnd);
    const gaps = cg.points.map((p) => p.gap);
    const x0 = xDates[0];
    const x1 = xDates[xDates.length - 1];
    const cgTraces = mdLqProjectionLineTraces(xDates, gaps, cg.points, {
      name: "Credit gap",
      line: { color: "#fbbf24", width: 2.5, shape: "spline" },
      customdata: periods,
      hovertemplate: "%{customdata}<br>Gap: %{y:.1f} pp GDP<extra></extra>",
    }).map((trace, i) =>
      i === 0
        ? { ...trace, fill: "tozeroy", fillcolor: "rgba(251, 191, 36, 0.1)" }
        : trace,
    );
    await Plotly.react(
      cgEl,
      cgTraces,
      {
        ...mdPlotLayout(`${label} · BIS credit-to-GDP gap`, MD_LQ_CHART_HEIGHT, {
          yTitle: "pp GDP",
          xType: "date",
          xTickFormat: "%Y",
          xDtick: "M12",
          xNticks: 8,
        }),
        shapes: [
          { type: "line", xref: "x", yref: "y", x0, x1, y0: 0, y1: 0, line: { color: "rgba(148,163,184,0.5)", width: 1, dash: "dot" } },
          { type: "line", xref: "x", yref: "y", x0, x1, y0: 10, y1: 10, line: { color: "rgba(248,113,113,0.45)", width: 1, dash: "dash" } },
          { type: "line", xref: "x", yref: "y", x0, x1, y0: -10, y1: -10, line: { color: "rgba(103,232,249,0.35)", width: 1, dash: "dash" } },
        ],
        annotations: [
          {
            x: xDates[Math.max(0, xDates.length - 8)],
            y: 10,
            xref: "x",
            yref: "y",
            text: "BIS warning +10 pp",
            showarrow: false,
            font: { size: 9, color: "#f87171" },
            yanchor: "bottom",
          },
        ],
      },
      MD_PLOTLY_CONFIG,
    );
  } else if (cgEl) {
    await mdLqClearChart(cgEl, "No BIS credit gap series for this view.");
  }

  const regionalEl = mdEl("md-lq-regional-chart");
  if (regionalEl) {
    const regional = mdLiquidity.regional || [];
    const traces = regional
      .filter((r) => r.series?.length)
      .map((r, i) => {
        const color =
          MD_LQ_REGIONAL_ENTITY_COLORS[r.id] || MD_LQ_COLORS.regional[i % MD_LQ_COLORS.regional.length];
        return {
          x: r.series.map((p) => p.year),
          y: r.series.map((p) => p.proxy),
          name: r.label,
          type: "scatter",
          mode: "lines",
          line: { color, width: 2.5, shape: "spline" },
          connectgaps: true,
          hovertemplate: `Year %{x}<br>${r.label}: %{y:$,.0f}<extra></extra>`,
        };
      });
    const regYears = regional.flatMap((r) => r.series?.map((p) => p.year) || []);
    const regMin = regYears.length ? Math.min(...regYears) : 2010;
    const regMax = regYears.length ? Math.max(...regYears) : 2024;
    if (!traces.length) {
      await mdLqClearChart(regionalEl, "No regional data for this view.");
    } else {
      mdLqPrepareChartEl(regionalEl);
      await Plotly.react(
        regionalEl,
        traces,
        mdPlotLayout("Regional liquidity proxies", MD_LQ_CHART_HEIGHT, {
          yTitle: "USD",
          hover: "x unified",
          xType: "year",
          xDtick: mdLqYearDtick([regMin, regMax]),
        }),
        MD_PLOTLY_CONFIG,
      );
    }
  }

  const overlayPanel = mdEl("md-lq-overlay-panel");
  const overlay = mdLiquidity.marketOverlay;
  if (overlayPanel) overlayPanel.hidden = !mdLqState.overlay || !overlay;
  if (mdLqState.overlay && overlay) {
    const heroes = mdEl("md-lq-overlay-heroes");
    if (heroes) {
      heroes.innerHTML = (overlay.heroes || [])
        .map(
          (h) =>
            `<div class="md-lq-hero"><span class="md-lq-hero-name">${h.name}</span><span class="md-lq-hero-val">${h.price?.toFixed(2) ?? "—"}</span><span class="md-lq-hero-chg ${h.changePct >= 0 ? "positive" : "negative"}">${h.changePct != null ? `${h.changePct >= 0 ? "+" : ""}${h.changePct.toFixed(2)}%` : ""}</span></div>`,
        )
        .join("");
    }
    const chartEl = mdEl("md-lq-overlay-chart");
    const charts = overlay.charts?.length
      ? overlay.charts
      : overlay.chart?.points?.length
        ? [{ symbol: overlay.chartLabel || "TLT", label: overlay.chartLabel || "TLT", color: "#38bdf8", points: overlay.chart.points }]
        : [];
    if (chartEl && charts.length) {
      const traces = charts
        .filter((c) => c.points?.length)
        .map((c) => ({
          x: c.points.map((p) => p.date),
          y: c.points.map((p) => p.close),
          type: "scatter",
          mode: "lines",
          name: c.label || c.symbol,
          yaxis: c.symbol === "^VIX" ? "y2" : "y",
          line: { color: c.color || "#38bdf8", width: 2, shape: "spline" },
          hovertemplate: "%{x}<br>%{y:.2f}<extra></extra>",
        }));
      await Plotly.react(
        chartEl,
        traces,
        mdPlotLayout("Market liquidity overlay · TLT · HYG · VIX", MD_LQ_CHART_HEIGHT, {
          y2: traces.some((t) => t.yaxis === "y2"),
          y2Title: "VIX",
          xType: "date",
          xTickFormat: "%b %Y",
          xNticks: 6,
        }),
        MD_PLOTLY_CONFIG,
      );
    }
  }
}

function mdLqShowError(message) {
  const body = mdEl("md-lq-table-body");
  if (body) body.innerHTML = `<tr><td colspan="7">${message}</td></tr>`;
  const upd = mdEl("md-lq-update");
  if (upd) upd.textContent = message;
}

function mdLqRenderAll(opts = {}) {
  if (!mdLiquidity?.global?.series?.length) return;
  const upd = mdEl("md-lq-update");
  if (upd) {
    upd.textContent =
      window.DashboardSWR?.formatPanelMeta({
        fetchedAt: mdLiquidity.fetchedAt,
        source: mdLiquidity.source,
        fromCache: opts.fromCache,
      }) || mdLiquidity.source;
  }
  mdLqPopulateFilters();
  mdLqRenderBreadcrumb();
  mdLqRenderKpis();
  mdLqRenderTable();
  window.decorateHelpLabels?.(document.querySelector('.macro-drivers-panel[data-md-sub="liquidity"]'));
  void mdLqRenderMap();
  void mdLqRenderCharts().catch((err) => {
    console.error("mdLqRenderCharts", err);
  });
}

async function mdLqReloadYearView() {
  const entity = mdLqState.entity;
  const year = mdLqState.year;
  const body = mdEl("md-lq-table-body");
  if (body) body.innerHTML = '<tr><td colspan="7">Updating table year…</td></tr>';
  try {
    const data = await mdFetchLiquidity(false);
    if (!data?.global?.series?.length) throw new Error("No liquidity data for selected year");
    if (mdLqState.entity !== entity || mdLqState.year !== year) return mdLiquidity;
    if (mdLiquidity) {
      Object.assign(mdLiquidity, {
        year: data.year,
        countries: data.countries,
        coverageStats: data.coverageStats,
        creditGap: data.creditGap,
      });
    } else {
      mdLiquidity = data;
    }
    mdLqMapData = null;
    mdLqPopulateFilters();
    mdLqRenderTable();
    mdLqRenderKpis();
    try {
      await mdLqLoadMap(false);
      void mdLqRenderMap();
    } catch {
      /* map optional */
    }
  } catch (err) {
    mdLqShowError(err?.message || "Table year update failed");
  }
  return mdLiquidity;
}

async function loadMacroLiquidity(force = false) {
  if (mdLqInflight) return mdLqInflight;

  mdLqInflight = (async () => {
    const swr = window.DashboardSWR;
    Object.assign(mdLqState, mdLqLoadSettings());
    const loadGen = ++mdLqLoadGen;
    let lqFromCache = false;

    const key = `macro:drivers:liquidity:v9:${mdLqState.entity}:${mdLqState.overlay}`;
    const fetcher = async () => {
      const data = await mdFetchLiquidity(force);
      if (!mdLqValidatePayload(data)) throw new Error("Invalid liquidity payload");
      return data;
    };

    let result = null;
    try {
      if (swr) {
        result = await swr.runSWR({
          key,
          l1: "macro",
          source: "WB → IMF IFS → DBnomics → Proxy",
          persist: true,
          revalidate: force,
          updateHeader: false,
          validate: mdLqValidatePayload,
          fetch: fetcher,
          render: (data, opts = {}) => {
            if (opts.fromCache) lqFromCache = true;
            if (opts.loading) {
              const body = mdEl("md-lq-table-body");
              if (body) body.innerHTML = '<tr><td colspan="7">Loading liquidity data…</td></tr>';
            }
          },
        });
      } else {
        result = await fetcher();
      }
    } catch (err) {
      if (!mdLiquidity?.global?.series?.length) {
        mdLqShowError(err?.message || "Liquidity load failed — try Refresh liquidity");
      }
      throw err;
    }

    if (result) mdLiquidity = result;
    else if (!mdLiquidity?.global?.series?.length) {
      mdLqShowError("Liquidity load failed — try Refresh liquidity");
      return null;
    }

    if (loadGen !== mdLqLoadGen) return mdLiquidity;

    const wantYear = mdLqState.year;
    if (wantYear && mdLiquidity.year !== wantYear) {
      await mdLqReloadYearView();
      if (loadGen !== mdLqLoadGen) return mdLiquidity;
    }

    if (force) mdLqMapData = null;
    try {
      await mdLqLoadMap(force);
    } catch {
      /* map is optional; table/charts still render */
    }
    if (loadGen !== mdLqLoadGen) return mdLiquidity;
    mdLqRenderAll({ fromCache: lqFromCache });
    return mdLiquidity;
  })()
    .catch((err) => {
      console.error("loadMacroLiquidity", err);
      throw err;
    })
    .finally(() => {
      mdLqInflight = null;
    });

  return mdLqInflight;
}

function mdOpenMethodology() {
  const dlg = mdEl("md-methodology-dialog");
  if (!dlg) return;
  const body = mdEl("md-methodology-body");
  if (body && mdMeta?.methodology) {
    const m = mdMeta.methodology;
    body.innerHTML = `
      <ol>${(m.hierarchy || []).map((h) => `<li>${h}</li>`).join("")}</ol>
      <p><strong>Primary:</strong> ${m.primary || ""}</p>
      <p><strong>Fallback:</strong> ${m.fallback || ""}</p>
      <p><strong>Tertiary:</strong> ${m.tertiary || ""}</p>
      <p><strong>Proxy:</strong> ${m.proxy || ""}</p>
      <p>${m.rule || ""}</p>
      <p class="md-methodology-updated">Last built: ${mdMeta.fetchedAt || "—"}</p>
    `;
  }
  if (typeof dlg.showModal === "function") dlg.showModal();
}

function mdBindUi() {
  mdEl("md-year")?.addEventListener("change", (e) => {
    mdState.year = Number(e.target.value);
    mdSaveSettings();
    mdMapData = null;
    void mdReloadSnapshot();
  });
  mdEl("md-metric")?.addEventListener("change", (e) => {
    mdState.metric = e.target.value;
    mdSaveSettings();
    mdMapData = null;
    if (mdActiveTab === "overview") void mdRenderMap();
    if (mdActiveTab === "charts") void mdRenderCharts();
  });
  mdEl("md-region")?.addEventListener("change", (e) => {
    mdState.region = e.target.value;
    mdSaveSettings();
    mdMapData = null;
    void mdReloadSnapshot();
  });
  mdEl("md-income")?.addEventListener("change", (e) => {
    mdState.income = e.target.value;
    mdSaveSettings();
    mdMapData = null;
    void mdReloadSnapshot();
  });
  mdEl("md-search")?.addEventListener("input", (e) => {
    mdState.search = e.target.value;
    mdSaveSettings();
    clearTimeout(mdSearchTimer);
    mdSearchTimer = setTimeout(() => void mdReloadSnapshot(), 300);
  });
  mdEl("md-show-aggregates")?.addEventListener("change", (e) => {
    mdState.showAggregates = e.target.checked;
    mdSaveSettings();
    void mdReloadSnapshot();
  });
  mdEl("md-featured-aggs")?.addEventListener("change", (e) => {
    mdState.onlyFeaturedAggs = e.target.checked;
    mdSaveSettings();
    void mdReloadSnapshot();
  });
  mdEl("md-refresh")?.addEventListener("click", () => loadMacroDrivers(true));
  mdEl("md-export")?.addEventListener("click", mdExportCsv);
  mdEl("md-methodology-btn")?.addEventListener("click", mdOpenMethodology);
  mdEl("md-methodology-close")?.addEventListener("click", () => mdEl("md-methodology-dialog")?.close());

  document.querySelectorAll(".macro-drivers-subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      mdShowTab(btn.dataset.mdSub);
      if (btn.dataset.mdSub === "overview") {
        mdRenderTable();
        void mdRenderMap();
      }
      if (btn.dataset.mdSub === "economy") mdRenderTable();
      if (btn.dataset.mdSub === "charts") void mdRenderCharts();
      if (btn.dataset.mdSub === "liquidity") {
        if (mdLiquidity?.global?.series?.length) mdLqRenderAll();
        else void loadMacroLiquidity();
      }
      window.decorateHelpLabels?.(document.getElementById("dashboard-macro"));
    });
  });

  mdEl("md-lq-entity")?.addEventListener("change", (e) => {
    mdLqState.entity = e.target.value;
    mdLqSaveSettings();
    void loadMacroLiquidity();
  });
  mdEl("md-lq-year")?.addEventListener("change", (e) => {
    mdLqState.year = Number(e.target.value);
    mdLqSaveSettings();
    mdLqMapData = null;
    if (mdLiquidity?.global?.series?.length) void mdLqReloadYearView();
    else void loadMacroLiquidity();
  });
  mdEl("md-lq-overlay")?.addEventListener("change", (e) => {
    mdLqState.overlay = e.target.checked;
    mdLqSaveSettings();
    void loadMacroLiquidity();
  });
  mdEl("md-lq-refresh")?.addEventListener("click", () => loadMacroLiquidity(true));
  mdEl("md-lq-export")?.addEventListener("click", mdLqExportCsv);
  mdEl("md-lq-methodology-btn")?.addEventListener("click", mdOpenLqMethodology);
  mdEl("md-lq-methodology-close")?.addEventListener("click", () => mdEl("md-lq-methodology-dialog")?.close());
  mdEl("md-lq-map-metric")?.addEventListener("change", (e) => {
    mdLqState.mapMetric = e.target.value;
    mdLqSaveSettings();
    mdLqMapData = null;
    void mdLqRenderMap();
  });

  document.querySelectorAll(".md-economy-subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      mdEconomyTab = btn.dataset.mdEco;
      mdShowTab("economy");
      mdRenderTable();
    });
  });

  mdEl("macro-drivers-save-commentary")?.addEventListener("click", () => {
    const text = mdEl("macro-drivers-commentary-text")?.value || "";
    localStorage.setItem(MD_COMMENTARY_KEY, text);
    const st = mdEl("macro-drivers-commentary-status");
    if (st) st.textContent = "Saved locally.";
  });

  mdEl("macro-drivers-download-commentary")?.addEventListener("click", () => {
    const text = mdEl("macro-drivers-commentary-text")?.value || "";
    const blob = new Blob([text], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `macro-outlook-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function mdReloadSnapshot(force = false) {
  if (mdSnapshotInflight) return mdSnapshotInflight;

  mdSnapshotInflight = (async () => {
    await mdLoadSnapshot(force);
    mdRenderAll({ fromCache: mdSnapshotFromCache });
  })()
    .catch((err) => {
      const body = mdEl("md-table-body");
      if (body) body.innerHTML = `<tr><td colspan="12">${err?.message || "Load failed"}</td></tr>`;
      throw err;
    })
    .finally(() => {
      mdSnapshotInflight = null;
    });

  return mdSnapshotInflight;
}

async function loadMacroDrivers(force = false) {
  if (mdInflight) return mdInflight;

  mdInflight = (async () => {
    Object.assign(mdState, mdLoadSettings());
    await mdLoadMeta(force);
    await mdLoadSnapshot(force);
    mdShowTab(mdActiveTab);
    mdRenderAll({ fromCache: mdSnapshotFromCache });
  })()
    .catch((err) => {
      const body = mdEl("md-table-body");
      if (body) body.innerHTML = `<tr><td colspan="12">${err?.message || "Load failed"}</td></tr>`;
      const upd = mdEl("macro-drivers-update");
      if (upd) upd.textContent = "Load failed";
      throw err;
    })
    .finally(() => {
      mdInflight = null;
    });

  return mdInflight;
}

function initMacroDrivers() {
  if (mdReady) return;
  mdReady = true;
  Object.assign(mdState, mdLoadSettings());
  Object.assign(mdLqState, mdLqLoadSettings());
  mdBindUi();
  mdUpdateControlVisibility();
  window.decorateHelpLabels?.(document.getElementById("dashboard-macro"));
}

window.initMacroDrivers = initMacroDrivers;
window.loadMacroDrivers = loadMacroDrivers;
window.loadMacroLiquidity = loadMacroLiquidity;