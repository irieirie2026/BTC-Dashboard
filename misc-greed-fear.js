/** Misc — BTC Crypto Fear & Greed Index (Alternative.me). */

const FNG_API = "/api/misc/fear-greed";
const FNG_POLL_MS = 3_600_000;
const FNG_HISTORY_DAYS = 365;

const FNG_ZONES = [
  { max: 24, label: "Extreme Fear", color: "#ea3943" },
  { max: 44, label: "Fear", color: "#ea8c00" },
  { max: 55, label: "Neutral", color: "#f3d42f" },
  { max: 75, label: "Greed", color: "#93d900" },
  { max: 100, label: "Extreme Greed", color: "#16c784" },
];

let fngData = null;
let fngTimer = null;
let fngReady = false;
let fngIdPrefix = "misc-fng";

function setFngElementPrefix(prefix) {
  fngIdPrefix = prefix || "misc-fng";
}

const fngEl = (suffix) => document.getElementById(`${fngIdPrefix}-${suffix}`);

function fngZone(value) {
  const v = Number(value);
  for (const z of FNG_ZONES) {
    if (v <= z.max) return z;
  }
  return FNG_ZONES[FNG_ZONES.length - 1];
}

function fngFmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fngFmtDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fngPlotLayout(title, height = 360, opts = {}) {
  return {
    template: "plotly_dark",
    title: title
      ? { text: title, font: { size: 13, color: "#cbd5e1" }, x: 0.02, xanchor: "left" }
      : undefined,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(255,255,255,0.02)",
    margin: { l: 48, r: 16, t: title ? 40 : 12, b: 44 },
    height,
    font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 11, color: "#94a3b8" },
    hoverlabel: {
      bgcolor: "#1e2433",
      bordercolor: "rgba(148, 163, 184, 0.35)",
      font: { family: "IBM Plex Sans, sans-serif", size: 11, color: "#e2e8f0" },
    },
    xaxis: {
      type: opts.xType || "date",
      gridcolor: "rgba(148, 163, 184, 0.08)",
      linecolor: "rgba(148, 163, 184, 0.15)",
      tickfont: { size: 10, color: "#64748b" },
      rangeslider: { visible: false },
    },
    yaxis: {
      range: opts.yRange || [0, 100],
      gridcolor: "rgba(148, 163, 184, 0.08)",
      linecolor: "rgba(148, 163, 184, 0.15)",
      tickfont: { size: 10, color: "#64748b" },
      title: opts.yTitle || "",
      zeroline: false,
    },
    showlegend: false,
    hovermode: "x unified",
  };
}

function fngGaugeSteps() {
  let prev = 0;
  return FNG_ZONES.map((z) => {
    const step = { range: [prev, z.max], color: z.color };
    prev = z.max;
    return step;
  });
}

function fngRenderHero(latest) {
  const strip = fngEl("heroes");
  if (!strip) return;
  if (!latest) {
    strip.innerHTML = "";
    return;
  }
  const zone = fngZone(latest.value);
  const cls = latest.value >= 56 ? "positive" : latest.value <= 44 ? "negative" : "";
  strip.innerHTML = `
    <div class="deriv-hero-block">
      <span class="deriv-hero-label">Index</span>
      <span class="deriv-hero-value ${cls}" style="color:${zone.color}">${latest.value}</span>
      <span class="deriv-hero-sub">${zone.label}</span>
    </div>
    <div class="deriv-hero-block">
      <span class="deriv-hero-label">Reading</span>
      <span class="deriv-hero-value" style="font-size:1.05rem;color:${zone.color}">${latest.classification || zone.label}</span>
      <span class="deriv-hero-sub">0 = max fear · 100 = max greed</span>
    </div>
    <div class="deriv-hero-block">
      <span class="deriv-hero-label">As of</span>
      <span class="deriv-hero-value" style="font-size:0.95rem">${fngFmtDate(latest.timestamp)}</span>
      <span class="deriv-hero-sub">Daily update</span>
    </div>`;

  const meta = fngEl("update");
  if (meta && fngData?.fetchedAt) {
    const fetched = new Date(fngData.fetchedAt);
    const stamp = Number.isNaN(fetched.getTime())
      ? fngData.fetchedAt
      : fetched.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
    meta.textContent = `Alternative.me · fetched ${stamp}`;
  }
}

function fngRenderZones() {
  const el = fngEl("zones");
  if (!el) return;
  el.innerHTML = FNG_ZONES.map(
    (z, i) => {
      const lo = i === 0 ? 0 : FNG_ZONES[i - 1].max + 1;
      return `<span class="misc-fng-zone" style="--fng-zone-color:${z.color}"><i></i>${lo}–${z.max} ${z.label}</span>`;
    },
  ).join("");
}

function fngRenderGauge(latest) {
  const el = fngEl("gauge");
  if (!el || !window.Plotly) return;
  if (!latest) {
    el.innerHTML = '<p class="misc-fng-empty">Unable to load index</p>';
    return;
  }

  const zone = fngZone(latest.value);
  const trace = {
    type: "indicator",
    mode: "gauge+number",
    value: latest.value,
    number: {
      font: { size: 42, color: zone.color, family: "IBM Plex Mono, monospace" },
      suffix: "",
    },
    title: {
      text: latest.classification || zone.label,
      font: { size: 14, color: "#cbd5e1" },
    },
    gauge: {
      shape: "angular",
      axis: { range: [0, 100], tickwidth: 1, tickcolor: "#475569", tickfont: { color: "#64748b", size: 10 } },
      bar: { color: zone.color, thickness: 0.22 },
      bgcolor: "rgba(15, 23, 42, 0.6)",
      borderwidth: 0,
      steps: fngGaugeSteps(),
      threshold: {
        line: { color: "#f8fafc", width: 2 },
        thickness: 0.75,
        value: latest.value,
      },
    },
  };

  const layout = {
    template: "plotly_dark",
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 24, r: 24, t: 48, b: 8 },
    height: 280,
    font: { family: "IBM Plex Sans, system-ui, sans-serif", color: "#94a3b8" },
  };

  Plotly.react(el, [trace], layout, { responsive: true, displayModeBar: false });
}

function fngHistorySlice(series) {
  if (!series?.length) return [];
  const cutoff = Date.now() / 1000 - FNG_HISTORY_DAYS * 86400;
  const sliced = series.filter((p) => p.timestamp >= cutoff);
  return sliced.length ? sliced : series.slice(-FNG_HISTORY_DAYS);
}

function fngRenderHistory(series) {
  const el = fngEl("history");
  if (!el || !window.Plotly) return;
  const hist = fngHistorySlice(series);
  if (!hist.length) {
    el.innerHTML = '<p class="misc-fng-empty">No history available</p>';
    return;
  }

  const x = hist.map((p) => new Date(p.timestamp * 1000));
  const y = hist.map((p) => p.value);
  const colors = hist.map((p) => fngZone(p.value).color);

  const trace = {
    x,
    y,
    type: "scatter",
    mode: "lines",
    name: "Fear & Greed",
    line: { color: "#e879f9", width: 2 },
    fill: "tozeroy",
    fillcolor: "rgba(232, 121, 249, 0.12)",
    customdata: hist.map((p) => {
      const zone = fngZone(p.value);
      const reading =
        p.value >= 75 ? "Extreme greed — euphoria risk"
        : p.value >= 56 ? "Greed — bullish sentiment"
        : p.value <= 24 ? "Extreme fear — capitulation zone"
        : p.value <= 44 ? "Fear — cautious market"
        : "Neutral sentiment";
      return [zone.label, p.classification || zone.label, reading];
    }),
    hovertemplate:
      "<b>Fear & Greed</b><br>" +
      "Score: %{y}<br>" +
      "Zone: %{customdata[0]}<br>" +
      "%{customdata[2]}<br>" +
      "Date: %{x|%b %d, %Y}<br>" +
      "<span style='font-size:10px;color:#94a3b8'>Source: Alternative.me</span>" +
      "<extra></extra>",
  };

  const markers = {
    x,
    y,
    type: "scatter",
    mode: "markers",
    marker: { size: 5, color: colors, opacity: 0.85, line: { width: 0 } },
    hoverinfo: "skip",
    showlegend: false,
  };

  const shapes = [];
  const bands = [
    [0, 25, "rgba(234, 57, 67, 0.06)"],
    [25, 45, "rgba(234, 140, 0, 0.06)"],
    [45, 56, "rgba(243, 212, 47, 0.05)"],
    [56, 76, "rgba(147, 217, 0, 0.06)"],
    [76, 100, "rgba(22, 199, 132, 0.06)"],
  ];
  for (const [y0, y1, fill] of bands) {
    shapes.push({
      type: "rect",
      xref: "paper",
      yref: "y",
      x0: 0,
      x1: 1,
      y0,
      y1,
      fillcolor: fill,
      line: { width: 0 },
      layer: "below",
    });
  }

  const layout = fngPlotLayout(`Last ${hist.length} daily readings`, 340, { yRange: [0, 100] });
  layout.shapes = shapes;

  Plotly.react(el, [trace, markers], layout, { responsive: true, displayModeBar: false });
}

function fngRenderAll() {
  if (!fngData) return;
  fngRenderHero(fngData.latest);
  fngRenderZones();
  fngRenderGauge(fngData.latest);
  fngRenderHistory(fngData.series);
}

async function fngFetch(force = false) {
  const params = new URLSearchParams();
  if (force) params.set("refresh", "1");
  const res = await fetch(`${FNG_API}?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `HTTP ${res.status}`);
  return res.json();
}

async function loadMiscGreedFear(force = false) {
  const gauge = fngEl("gauge");
  const history = fngEl("history");
  if (gauge && !fngData) gauge.innerHTML = '<p class="misc-fng-empty">Loading index…</p>';
  if (history && !fngData) history.innerHTML = '<p class="misc-fng-empty">Loading history…</p>';

  try {
    fngData = await fngFetch(force);
    fngReady = true;
    fngRenderAll();
    window.mbRefreshSentimentFngCommentary?.();
    window.decorateHelpLabels?.(
      document.querySelector('#dashboard-valuation .menu-screen[data-l2="indicators"]'),
    );
  } catch (err) {
    if (gauge) gauge.innerHTML = `<p class="misc-fng-empty">Load failed — ${err.message || "try again"}</p>`;
    if (history) history.innerHTML = "";
  }
}

function initMiscGreedFearPoll() {
  clearInterval(fngTimer);
  fngTimer = setInterval(() => loadMiscGreedFear(false), FNG_POLL_MS);
}

window.loadMiscGreedFear = loadMiscGreedFear;
window.initMiscGreedFearPoll = initMiscGreedFearPoll;
window.setFngElementPrefix = setFngElementPrefix;
window.mbGetFngData = () => fngData;