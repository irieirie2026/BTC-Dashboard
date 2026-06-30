/** Chart Patterns — Binance OHLCV + lightweight-charts + client-side detection */

const CP_SYMBOL = "BTCUSDT";
const CP_REST = "https://api.binance.com/api/v3";

const CP_TF = {
  d: { interval: "1d", label: "D", bars: 1825 },
  w: { interval: "1w", label: "W", bars: 300 },
  m: { interval: "1M", label: "M", bars: 120 },
};

let cpActiveTf = "d";
let cpChart = null;
let cpCandleSeries = null;
let cpLineSeries = [];
let cpTargetLines = [];
let cpBars = [];
let cpPatterns = [];
let cpSelectedId = null;
let cpActiveCategory = "all";
let cpZoomPriceRange = null;
let cpReady = false;
let cpWedgeCanvas = null;
let cpWedgeCtx = null;
let cpWedgeOverlayBound = false;
const CP_DATA_VERSION = 11;

const CP_OVERLAY_SERIES_OPTS = {
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
  autoscaleInfoProvider: () => null,
};
const cpCache = {};

/** Single-pattern palette — bright, recycled roles (only one pattern on chart at a time). */
const CP_ROLE_COLORS = {
  support: "#00ffff",
  resistance: "#ff3388",
  neckline: "#ff77ff",
  shoulder: "#fff200",
  structure: "#fff200",
  wedge_upper: "#ff66b2",
  wedge_lower: "#33eeff",
  wedge_width: "#00ffaa",
  pole: "#44ddff",
  zone: "#99bbff",
  target: "#cc99ff",
};

const CP_TARGET_UP = "#00ff99";
const CP_TARGET_DOWN = "#ff2244";
const CP_TRIGGER_UP = "#00ff88";
const CP_TRIGGER_DOWN = "#ff2244";
const CP_FAILED_COLOR = "#ff4466";
const CP_ACCENT_BRIGHT = "#c4b5fd";
const CP_MARKER_SIZE = 0.62;

const CP_CATEGORIES = {
  all: { label: "All", types: null },
  reversal: {
    label: "Reversal",
    types: ["head_shoulders", "inverse_head_shoulders", "double_top", "double_bottom"],
  },
  continuation: { label: "Flags", types: ["bull_flag", "bear_flag", "pennant"] },
  triangle: {
    label: "Triangles",
    types: ["ascending_triangle", "descending_triangle", "symmetrical_triangle"],
  },
  wedge: { label: "Wedges", types: ["rising_wedge", "falling_wedge"] },
  range: { label: "Range", types: ["rectangle"] },
};

const CP_ZONE_FILL = {
  falling_wedge: { fill: "rgba(0, 255, 170, 0.38)", edge: "rgba(0, 255, 170, 0.9)", bracket: "rgba(0, 255, 170, 1)" },
  rising_wedge: { fill: "rgba(255, 68, 120, 0.36)", edge: "rgba(255, 68, 120, 0.88)", bracket: "rgba(255, 68, 120, 1)" },
  ascending_triangle: { fill: "rgba(0, 255, 170, 0.32)", edge: "rgba(0, 255, 170, 0.82)", bracket: "rgba(0, 255, 170, 0.95)" },
  descending_triangle: { fill: "rgba(255, 68, 100, 0.32)", edge: "rgba(255, 68, 100, 0.82)", bracket: "rgba(255, 68, 100, 0.95)" },
  symmetrical_triangle: { fill: "rgba(255, 230, 0, 0.3)", edge: "rgba(255, 230, 0, 0.85)", bracket: "rgba(255, 230, 0, 0.95)" },
  rectangle: { fill: "rgba(120, 180, 255, 0.3)", edge: "rgba(120, 180, 255, 0.82)", bracket: "rgba(120, 180, 255, 0.95)" },
  bull_flag: { fill: "rgba(0, 255, 200, 0.28)", edge: "rgba(0, 255, 200, 0.8)", bracket: "rgba(0, 255, 200, 0.95)" },
  bear_flag: { fill: "rgba(255, 68, 120, 0.28)", edge: "rgba(255, 68, 120, 0.8)", bracket: "rgba(255, 68, 120, 0.95)" },
  pennant: { fill: "rgba(255, 230, 0, 0.28)", edge: "rgba(255, 230, 0, 0.78)", bracket: "rgba(255, 230, 0, 0.92)" },
};

const CP_LEGEND_SHARED = [
  {
    id: "pattern_tag",
    label: "Pattern tag",
    color: "accent",
    desc: "Square marker naming this pattern (e.g. H&S, Asc Δ).",
    show: (p) => !!p.shortName,
  },
  {
    id: "resistance",
    label: "Resistance",
    color: CP_ROLE_COLORS.resistance,
    desc: "Upper boundary — ceiling where sellers have repeatedly appeared. Break above can signal bullish resolution.",
    show: (p) => p.lines?.some((ln) => ln.role === "resistance"),
  },
  {
    id: "support",
    label: "Support",
    color: CP_ROLE_COLORS.support,
    desc: "Lower boundary — floor where buyers have repeatedly defended. Break below can signal bearish resolution.",
    show: (p) => p.lines?.some((ln) => ln.role === "support"),
  },
  {
    id: "neckline",
    label: "Neckline",
    color: CP_ROLE_COLORS.neckline,
    desc: "Key confirmation level connecting middle pivots. Close beyond the neckline triggers the pattern.",
    show: (p) => p.lines?.some((ln) => ln.role === "neckline"),
  },
  {
    id: "structure",
    label: "Structure line",
    color: CP_ROLE_COLORS.structure,
    desc: "Gold line tracing shoulders, peaks, troughs, or head — the skeleton of the formation.",
    show: (p) => p.lines?.some((ln) => ln.role === "structure"),
  },
  {
    id: "pole",
    label: "Pole",
    color: CP_ROLE_COLORS.pole,
    desc: "Blue impulse leg before the flag/pennant consolidation. Its length sets the measured-move target.",
    show: (p) => p.lines?.some((ln) => ln.role === "pole"),
  },
  {
    id: "zone_fill",
    label: "Shaded zone",
    color: "#00ff88",
    desc: "Translucent fill between boundaries — the consolidation body where price compresses.",
    show: (p) => !!p.zone && ["falling_wedge", "rising_wedge", "ascending_triangle", "descending_triangle", "symmetrical_triangle", "rectangle", "bull_flag", "bear_flag", "pennant"].includes(p.type),
  },
  {
    id: "open_width",
    label: "Open width",
    color: CP_ROLE_COLORS.wedge_width,
    desc: "Green dashed bracket at the left — the opening height of the wedge used for the measured move.",
    show: (p) => p.lines?.some((ln) => ln.role === "wedge_width"),
  },
  {
    id: "pivot_high",
    label: "Pivot highs (H1, H2…)",
    color: "#ff5c9a",
    desc: "Swing highs touching the upper trendline — each labels a resistance pivot.",
    show: (p) => p.markers?.some((m) => m.kind === "pivot" && m.position === "aboveBar"),
  },
  {
    id: "pivot_low",
    label: "Pivot lows (L1, L2…)",
    color: "#00d4ff",
    desc: "Swing lows touching the lower trendline — each labels a support pivot.",
    show: (p) => p.markers?.some((m) => m.kind === "pivot" && m.position === "belowBar"),
  },
  {
    id: "apex",
    label: "Apex",
    color: "#ffd60a",
    desc: "Where converging trendlines meet — compression point. Solid lines stop here; dashed targets project forward.",
    show: (p) => p.apexTime != null,
  },
  {
    id: "trigger",
    label: "▲ / ▼ TRIGGER",
    color: CP_TRIGGER_UP,
    desc: "Highlighted bar where price broke the neckline or boundary. Measured-move projections start here when triggered.",
    show: (p) => p.triggerTime != null,
  },
  {
    id: "target_up",
    label: "↑ Target (dashed)",
    color: CP_TARGET_UP,
    desc: "Green dashed path + horizontal band — upside measured-move projection, not a trendline extension.",
    show: (p) => p.targetUp != null,
  },
  {
    id: "target_down",
    label: "↓ Target (dashed)",
    color: CP_TARGET_DOWN,
    desc: "Red dashed path + horizontal band — downside measured-move projection or failure scenario.",
    show: (p) => p.targetDown != null,
  },
  {
    id: "failed",
    label: "Failed",
    color: CP_FAILED_COLOR,
    desc: "Pattern expired or invalidated — structure broke the wrong way or aged without reaching target.",
    show: (p) => p.status === "failed",
  },
];

const CP_LEGEND_BY_TYPE = {
  head_shoulders: [
    { id: "l_sh", label: "L Sh", color: "#ffe600", desc: "Left shoulder — first peak, similar height to right shoulder.", show: () => true },
    { id: "head", label: "Head", color: "#ffe600", desc: "Center peak — highest high of the three, defines pattern height.", show: () => true },
    { id: "r_sh", label: "R Sh", color: "#ffe600", desc: "Right shoulder — final peak before neckline break.", show: () => true },
  ],
  inverse_head_shoulders: [
    { id: "l_sh", label: "L Sh", color: "#ffe600", desc: "Left shoulder trough — first low of the three.", show: () => true },
    { id: "head", label: "Head", color: "#ffe600", desc: "Center trough — deepest low; depth sets measured move.", show: () => true },
    { id: "r_sh", label: "R Sh", color: "#ffe600", desc: "Right shoulder trough — final low before neckline break.", show: () => true },
  ],
  double_top: [
    { id: "peak1", label: "Peak 1", color: "#ffe600", desc: "First high of the double top.", show: () => true },
    { id: "peak2", label: "Peak 2", color: "#ffe600", desc: "Second high — should match Peak 1 closely.", show: () => true },
  ],
  double_bottom: [
    { id: "trough1", label: "Trough 1", color: "#ffe600", desc: "First low of the double bottom.", show: () => true },
    { id: "trough2", label: "Trough 2", color: "#ffe600", desc: "Second low — should match Trough 1 closely.", show: () => true },
  ],
  bull_flag: [
    { id: "pole_start", label: "Pole ▶", color: CP_ROLE_COLORS.pole, desc: "Start of the impulse rally.", show: () => true },
    { id: "flag", label: "Flag", color: "#94c5ff", desc: "Consolidation channel after the pole — downward-sloping flag.", show: () => true },
  ],
  bear_flag: [
    { id: "pole_start", label: "Pole ▶", color: CP_ROLE_COLORS.pole, desc: "Start of the impulse decline.", show: () => true },
    { id: "flag", label: "Flag", color: "#94c5ff", desc: "Consolidation channel after the pole — upward-sloping flag.", show: () => true },
  ],
  pennant: [
    { id: "pole_start", label: "Pole ▶", color: CP_ROLE_COLORS.pole, desc: "Impulse move before the pennant.", show: () => true },
    { id: "flag", label: "Pennant", color: "#94c5ff", desc: "Tight symmetrical consolidation after the pole.", show: () => true },
  ],
  falling_wedge: [
    { id: "r_apex", label: "R @ apex", color: "#ff5c9a", desc: "Resistance price at the apex — anchor for upside measured move.", show: () => true },
    { id: "s_apex", label: "S @ apex", color: "#00d4ff", desc: "Support price at the apex — break below invalidates bullish bias.", show: () => true },
    { id: "width_marker", label: "W ####", color: "#00ff88", desc: "Opening wedge width in dollars at the left edge.", show: (p) => p.wedgeOpenHeight != null },
  ],
  rising_wedge: [
    { id: "r_apex", label: "R @ apex", color: "#ff5c9a", desc: "Resistance at apex — break above is alternate (failed-bearish) scenario.", show: () => true },
    { id: "s_apex", label: "S @ apex", color: "#00d4ff", desc: "Support at apex — anchor for primary downside measured move.", show: () => true },
    { id: "width_marker", label: "W ####", color: "#00ff88", desc: "Opening wedge width in dollars at the left edge.", show: (p) => p.wedgeOpenHeight != null },
  ],
  ascending_triangle: [
    { id: "res_flat", label: "Res 1 / Res 2", color: "#ff5c9a", desc: "Two highs at similar price forming flat resistance.", show: () => true },
  ],
  descending_triangle: [
    { id: "sup_flat", label: "Sup 1 / Sup 2", color: "#00d4ff", desc: "Two lows at similar price forming flat support.", show: () => true },
  ],
};

const CP_LEGEND_CHART = {
  pattern_tag: (p) => p.shortName,
  resistance: "Resist",
  support: "Sup",
  neckline: "Neck",
  structure: "L Sh / Head / R Sh · Pk1 / Pk2",
  pole: "Pole",
  zone_fill: "(shaded area)",
  open_width: "Width",
  pivot_high: "H1, H2…",
  pivot_low: "L1, L2…",
  apex: "Apex",
  trigger: "▲Trig / ▼Trig",
  target_up: "↑ Tgt / ↑ Pri / ↑ Brk",
  target_down: "↓ Tgt / ↓ Pri / ↓ Fail",
  failed: "Failed",
  l_sh: "L Sh",
  head: "Head",
  r_sh: "R Sh",
  peak1: "Pk1",
  peak2: "Pk2",
  trough1: "Tr1",
  trough2: "Tr2",
  pole_start: "Pole",
  flag: "Flag / Pennant",
  r_apex: "R",
  s_apex: "S",
  width_marker: "W####",
  res_flat: "R1, R2",
  sup_flat: "S1, S2",
};

const CP_LEGEND_WHEN = {
  pattern_tag: "Always shown on the selected pattern at the label bar.",
  resistance:
    "Drawn along the upper boundary. For triangles/wedges it slopes; for ascending triangle and rectangle it is flat.",
  support:
    "Drawn along the lower boundary. For triangles/wedges it slopes; for descending triangle and rectangle it is flat.",
  neckline:
    "Connects the middle troughs (H&S) or peaks (inverse H&S) or the valley between double top/bottom pivots.",
  structure: "Links the key pivot points that define the pattern skeleton.",
  pole: "Spans the impulse leg before flag/pennant consolidation begins.",
  zone_fill: "Filled between support and resistance while the pattern is selected.",
  open_width: "Vertical bracket at the left edge of a wedge — used for the measured move.",
  pivot_high: "Placed at each swing high that touches the upper trendline.",
  pivot_low: "Placed at each swing low that touches the lower trendline.",
  apex: "Placed where the two boundary lines converge (end of solid lines).",
  trigger:
    "Appears only after a confirming candle close beyond the boundary — not on intrabar wicks alone.",
  target_up:
    "Shown once the pattern geometry is complete; dashed line projects the upside measured move forward.",
  target_down:
    "Shown once the pattern geometry is complete; dashed line projects the downside measured move or failure path.",
  failed: "Shown when the pattern is classified Failed in the scan.",
  l_sh: "Marks the left shoulder pivot.",
  head: "Marks the head pivot (highest high or deepest low).",
  r_sh: "Marks the right shoulder pivot.",
  peak1: "First peak of a double top.",
  peak2: "Second peak of a double top.",
  trough1: "First trough of a double bottom.",
  trough2: "Second trough of a double bottom.",
  pole_start: "Start of the impulse pole.",
  flag: "Marks where the flag/pennant consolidation begins after the pole.",
  r_apex: "Resistance level at the wedge apex (right end).",
  s_apex: "Support level at the wedge apex (right end).",
  width_marker: "Opening wedge height in dollars at the left edge.",
  res_flat: "Marks pivot highs on flat resistance.",
  sup_flat: "Marks pivot lows on flat support.",
};

function cpEl(id) {
  return document.getElementById(id);
}

function cpFmtPrice(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function cpShortChartText(text) {
  if (!text) return text;
  const map = {
    Resistance: "Resist",
    Support: "Sup",
    Neckline: "Neck",
    "Open width": "Width",
    "▼ TRIGGER": "▼Trig",
    "▲ TRIGGER": "▲Trig",
    "Apex ▲": "Apex",
    "Apex ▼": "Apex",
    "Peak 1": "Pk1",
    "Peak 2": "Pk2",
    "Trough 1": "Tr1",
    "Trough 2": "Tr2",
    "Pole ▶": "Pole",
    "↑ Breakout tgt": "↑ Brk",
    "↓ Failure tgt": "↓ Fail",
    "↑ Primary tgt": "↑ Pri",
    "↓ Primary tgt": "↓ Pri",
    "↑ Inverse tgt": "↑ Inv",
    "↓ Breakdown tgt": "↓ Brk",
    "↑ Alt tgt": "↑ Alt",
    "↓ Alt tgt": "↓ Alt",
    "↑ Pole tgt": "↑ Pole",
    "↓ Pole tgt": "↓ Pole",
    "↑ Target": "↑ Tgt",
    "↓ Target": "↓ Tgt",
    "Res 1": "R1",
    "Res 2": "R2",
    "Sup 1": "S1",
    "Sup 2": "S2",
  };
  if (map[text]) return map[text];
  if (text.startsWith("W ")) {
    const n = parseFloat(text.slice(2));
    if (Number.isFinite(n)) return n >= 1000 ? `W${Math.round(n / 1000)}k` : `W${Math.round(n)}`;
  }
  return text.length > 8 ? text.slice(0, 7) + "…" : text;
}

function cpMkMarker({ time, position, color, shape, text }) {
  return {
    time,
    position,
    color,
    shape,
    text: text ? cpShortChartText(text) : undefined,
    size: CP_MARKER_SIZE,
  };
}

function cpBrightLineColor(role, fallback) {
  return CP_ROLE_COLORS[role] || fallback || CP_ACCENT_BRIGHT;
}

function cpFilteredPatterns() {
  const cat = CP_CATEGORIES[cpActiveCategory];
  if (!cat?.types) return cpPatterns;
  return cpPatterns.filter((p) => cat.types.includes(p.type));
}

function cpEnsureSelection() {
  const filtered = cpFilteredPatterns();
  if (!filtered.length) {
    cpSelectedId = null;
    return null;
  }
  if (!filtered.some((p) => p.id === cpSelectedId)) cpSelectedId = filtered[0].id;
  return cpPatterns.find((p) => p.id === cpSelectedId) ?? null;
}

function cpSelectPattern(id) {
  cpSelectedId = id ?? null;
  const p = id ? (cpPatterns.find((x) => x.id === id) ?? null) : null;
  cpUpdateChartBadge(p);
  cpRenderPatternList();
  cpRenderDetail(p);
  cpDrawPatterns();
  if (p) cpZoomToPattern(p);
  else cpClearZoomPrice();
}

function cpUpdateChartBadge(pattern) {
  const badge = cpEl("cp-chart-badge");
  if (!badge) return;
  if (!pattern) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.textContent = `Showing: ${pattern.name}`;
}

function cpBarIndexAt(time) {
  return cpBars.findIndex((b) => b.time === time);
}

function cpBarTimeAt(idx) {
  return cpBars[Math.max(0, Math.min(cpBars.length - 1, idx))]?.time;
}

function cpLineLabelTime(ln, role) {
  const fromIdx = cpBarIndexAt(ln.from.time);
  const toIdx = cpBarIndexAt(ln.to.time);
  if (fromIdx < 0 || toIdx < 0) return ln.to.time;
  const frac = role === "neckline" || role === "pole" ? 0.5 : role === "resistance" ? 0.28 : 0.32;
  const idx = fromIdx + Math.round((toIdx - fromIdx) * frac);
  return cpBarTimeAt(idx) ?? ln.to.time;
}

function cpSpreadMarkers(markers) {
  if (!cpBars.length) return markers;

  const buckets = new Map();
  markers.forEach((m, index) => {
    const key = `${m.time}|${m.position}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ m, index });
  });

  buckets.forEach((group) => {
    if (group.length <= 1) return;
    const baseIdx = cpBarIndexAt(group[0].m.time);
    if (baseIdx < 0) return;

    group.forEach((entry, i) => {
      if (i === 0) return;
      const step = Math.ceil(i / 2);
      const dir = i % 2 === 1 ? 1 : -1;
      entry.m.time = cpBarTimeAt(baseIdx + dir * step);
    });
  });

  const atTime = new Map();
  markers.forEach((m) => {
    if (!atTime.has(m.time)) atTime.set(m.time, []);
    atTime.get(m.time).push(m);
  });

  atTime.forEach((group, time) => {
    const baseIdx = cpBarIndexAt(time);
    if (baseIdx < 0) return;
    const byPos = { aboveBar: [], inBar: [], belowBar: [] };
    group.forEach((m) => {
      if (byPos[m.position]) byPos[m.position].push(m);
    });
    ["aboveBar", "inBar", "belowBar"].forEach((pos) => {
      byPos[pos].forEach((m, i) => {
        if (i === 0) return;
        m.time = cpBarTimeAt(baseIdx + i);
      });
    });
  });

  return markers;
}

async function cpFetchKlines(tfKey) {
  const cfg = CP_TF[tfKey];
  if (!cfg) throw new Error("Unknown timeframe");

  const all = [];
  let endTime;
  const chunk = 1000;

  while (all.length < cfg.bars) {
    const remain = cfg.bars - all.length;
    const limit = Math.min(chunk, remain);
    let url = `${CP_REST}/klines?symbol=${CP_SYMBOL}&interval=${cfg.interval}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch)) {
      throw new Error(batch?.msg || "Invalid kline response");
    }
    if (!batch.length) break;
    all.unshift(...batch);
    endTime = batch[0][0] - 1;
    if (batch.length < limit) break;
  }

  return all.slice(-cfg.bars);
}

function cpSetLoading(on, msg) {
  const el = cpEl("cp-chart-loading");
  if (el) {
    el.hidden = !on;
    if (msg) el.textContent = msg;
  }
}

function cpSetError(msg) {
  const empty = cpEl("cp-chart-empty");
  const wrap = cpEl("cp-chart");
  if (empty) {
    empty.hidden = !msg;
    empty.textContent = msg || "";
  }
  if (wrap) wrap.style.visibility = msg ? "hidden" : "visible";
}

function cpChartHeight(container) {
  return Math.max(360, container?.clientHeight || 420);
}

function cpResizeChart() {
  const container = cpEl("cp-chart");
  if (!cpChart || !container) return;
  const width = container.clientWidth;
  if (width <= 0) return;
  cpChart.applyOptions({ width, height: cpChartHeight(container) });
  cpRedrawWedgeOverlays();
}

function cpInitChart() {
  if (!window.LightweightCharts) return false;
  const container = cpEl("cp-chart");
  if (!container) return false;

  if (cpChart) {
    cpResizeChart();
    return true;
  }

  cpChart = LightweightCharts.createChart(container, {
    layout: {
      background: { color: "#0b0e11" },
      textColor: "#7d8799",
      fontFamily: "IBM Plex Sans, system-ui, sans-serif",
      fontSize: 10,
    },
    grid: {
      vertLines: { color: "rgba(42, 49, 66, 0.45)" },
      horzLines: { color: "rgba(42, 49, 66, 0.45)" },
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: "rgba(42, 49, 66, 0.6)" },
    timeScale: {
      borderColor: "rgba(42, 49, 66, 0.6)",
      timeVisible: true,
      secondsVisible: false,
    },
    width: container.clientWidth,
    height: cpChartHeight(container),
  });

  cpCandleSeries = cpChart.addCandlestickSeries({
    upColor: "#0ecb81",
    downColor: "#f6465d",
    borderUpColor: "#0ecb81",
    borderDownColor: "#f6465d",
    wickUpColor: "#0ecb81",
    wickDownColor: "#f6465d",
  });

  cpEnsureWedgeOverlay();
  cpBindWedgeOverlay();

  const ro = new ResizeObserver(() => {
    if (!cpChart || !container) return;
    cpChart.applyOptions({ width: container.clientWidth, height: cpChartHeight(container) });
    cpRedrawWedgeOverlays();
  });
  ro.observe(container);
  return true;
}

function cpEnsureWedgeOverlay() {
  const area = cpEl("cp-chart-area");
  if (!area || cpWedgeCanvas) return;

  cpWedgeCanvas = document.createElement("canvas");
  cpWedgeCanvas.className = "cp-wedge-overlay";
  cpWedgeCanvas.setAttribute("aria-hidden", "true");
  area.appendChild(cpWedgeCanvas);
  cpWedgeCtx = cpWedgeCanvas.getContext("2d");
}

function cpBindWedgeOverlay() {
  if (cpWedgeOverlayBound || !cpChart) return;
  cpWedgeOverlayBound = true;
  cpChart.timeScale().subscribeVisibleLogicalRangeChange(() => cpRedrawWedgeOverlays());
}

function cpSyncWedgeOverlaySize() {
  if (!cpWedgeCanvas) return;
  const chartEl = cpEl("cp-chart");
  if (!chartEl) return;

  const rect = chartEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cpWedgeCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  cpWedgeCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  cpWedgeCanvas.style.width = `${rect.width}px`;
  cpWedgeCanvas.style.height = `${rect.height}px`;
  if (cpWedgeCtx) cpWedgeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function cpRedrawWedgeOverlays() {
  if (!cpWedgeCtx || !cpWedgeCanvas || !cpChart || !cpCandleSeries) return;

  cpSyncWedgeOverlaySize();
  const w = cpWedgeCanvas.clientWidth;
  const h = cpWedgeCanvas.clientHeight;
  cpWedgeCtx.clearRect(0, 0, w, h);

  cpPatterns.forEach((p) => {
    if (!cpIsVisible(p) || !p.zone) return;
    const resLn = p.lines?.find((ln) => ln.role === "resistance");
    const supLn = p.lines?.find((ln) => ln.role === "support");
    if (!resLn || !supLn) return;
    cpPaintZoneOnCanvas(p, resLn, supLn, p.status === "failed");
  });
}

function cpPaintZoneOnCanvas(p, resLn, supLn, failed) {
  if (!cpWedgeCtx) return;

  const startIdx = p.startIdx;
  const endIdx = p.drawEndIdx ?? p.endIdx;
  const topPts = [];
  const botPts = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const bar = cpBars[i];
    if (!bar) continue;
    const x = cpChart.timeScale().timeToCoordinate(bar.time);
    if (x == null) continue;
    const yTop = cpCandleSeries.priceToCoordinate(cpInterpSeg(resLn, i));
    const yBot = cpCandleSeries.priceToCoordinate(cpInterpSeg(supLn, i));
    if (yTop == null || yBot == null) continue;
    topPts.push({ x, y: yTop });
    botPts.push({ x, y: yBot });
  }

  if (topPts.length < 2) return;

  const palette = CP_ZONE_FILL[p.type] || CP_ZONE_FILL.symmetrical_triangle;
  const ctx = cpWedgeCtx;
  const fill = failed ? "rgba(255, 68, 100, 0.28)" : palette.fill;
  const edge = failed ? "rgba(255, 68, 100, 0.75)" : palette.edge;
  const bracket = failed ? "rgba(255, 68, 100, 0.9)" : palette.bracket;

  ctx.beginPath();
  ctx.moveTo(topPts[0].x, topPts[0].y);
  topPts.forEach((pt) => ctx.lineTo(pt.x, pt.y));
  for (let i = botPts.length - 1; i >= 0; i--) ctx.lineTo(botPts[i].x, botPts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.stroke();

  if (p.lines?.some((ln) => ln.role === "wedge_width")) {
    const startBar = cpBars[startIdx];
    if (startBar) {
      const x0 = cpChart.timeScale().timeToCoordinate(startBar.time);
      const yRes0 = cpCandleSeries.priceToCoordinate(cpInterpSeg(resLn, startIdx));
      const ySup0 = cpCandleSeries.priceToCoordinate(cpInterpSeg(supLn, startIdx));
      if (x0 != null && yRes0 != null && ySup0 != null) {
        const cap = 7;
        ctx.strokeStyle = bracket;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, yRes0);
        ctx.lineTo(x0, ySup0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x0 - cap, yRes0);
        ctx.lineTo(x0 + cap, yRes0);
        ctx.moveTo(x0 - cap, ySup0);
        ctx.lineTo(x0 + cap, ySup0);
        ctx.stroke();
      }
    }
  }
}

function cpClearOverlays() {
  cpLineSeries.forEach((s) => {
    try {
      cpChart?.removeSeries(s);
    } catch {
      /* ignore */
    }
  });
  cpLineSeries = [];
  cpTargetLines.forEach((pl) => {
    try {
      cpCandleSeries?.removePriceLine(pl);
    } catch {
      /* ignore */
    }
  });
  cpTargetLines = [];
}

function cpIsVisible(pattern) {
  return pattern.id === cpSelectedId;
}

function cpTargetHorizon(p, direction) {
  const anchorIdx = p.breakoutIdx ?? p.drawEndIdx ?? p.endIdx;
  const endIdx = Math.min(cpBars.length - 1, anchorIdx + Math.max(18, Math.floor(cpBars.length * 0.09)));
  const bar = cpBars[anchorIdx];
  let anchorPrice = p.breakoutPrice;
  if (direction === "up" && p.targetUpAnchor != null) anchorPrice = p.targetUpAnchor;
  else if (direction === "down" && p.targetDownAnchor != null) anchorPrice = p.targetDownAnchor;
  else if (anchorPrice == null) {
    const neck = p.lines?.find((ln) => ln.role === "neckline");
    if (neck) anchorPrice = neck.to.price;
    else if (direction === "up") anchorPrice = p.zone?.top ?? bar?.high ?? p.labelPrice;
    else anchorPrice = p.zone?.bottom ?? bar?.low ?? p.labelPrice;
  }
  const projStart = p.breakoutTime ?? p.endTime;
  return {
    startTime: projStart,
    endTime: cpBars[endIdx]?.time ?? p.endTime,
    anchorPrice,
  };
}

function cpDrawTargetGraphic(p, direction, price, failed) {
  if (price == null || !Number.isFinite(price)) return;

  const { startTime, endTime, anchorPrice } = cpTargetHorizon(p, direction);
  const baseColor = direction === "up" ? CP_TARGET_UP : CP_TARGET_DOWN;
  const color = failed ? CP_FAILED_COLOR : baseColor;
  let alpha = "ff";
  const primaryDir = p.primaryTargetDir;
  if (primaryDir === "up" && direction === "down") alpha = "66";
  if (primaryDir === "down" && direction === "up") alpha = "66";
  const lineColor = `${color}${alpha}`;
  const label = cpShortChartText(cpTargetChartLabel(p, direction));
  const primaryUp =
    (p.type === "inverse_head_shoulders" || p.type === "falling_wedge" || p.type === "ascending_triangle" || p.type === "double_bottom" || p.type === "bull_flag") &&
    direction === "up";
  const primaryDown =
    (p.type === "head_shoulders" || p.type === "rising_wedge" || p.type === "descending_triangle" || p.type === "double_top" || p.type === "bear_flag") &&
    direction === "down";
  const lineWidth = primaryUp || primaryDown ? 4 : 3;

  const proj = cpChart.addLineSeries({
    ...CP_OVERLAY_SERIES_OPTS,
    color: lineColor,
    lineWidth,
    lineStyle: LightweightCharts.LineStyle.Dashed,
  });
  proj.setData([
    { time: startTime, value: anchorPrice ?? price },
    { time: endTime, value: price },
  ]);
  cpLineSeries.push(proj);

  const band = cpChart.addLineSeries({
    ...CP_OVERLAY_SERIES_OPTS,
    color: lineColor,
    lineWidth: 2,
    lineStyle: LightweightCharts.LineStyle.LargeDashed,
  });
  band.setData([
    { time: startTime, value: price },
    { time: endTime, value: price },
  ]);
  cpLineSeries.push(band);

  const pl = cpCandleSeries.createPriceLine({
    price,
    color: lineColor,
    lineWidth: failed ? 1 : 2,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    axisLabelVisible: true,
    title: failed ? `${label} (failed)` : label,
  });
  cpTargetLines.push(pl);
}

function cpInterpSeg(ln, idx) {
  const fromIdx = cpBars.findIndex((b) => b.time === ln.from.time);
  const toIdx = cpBars.findIndex((b) => b.time === ln.to.time);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return ln.from.price;
  const t = (idx - fromIdx) / (toIdx - fromIdx);
  return ln.from.price + t * (ln.to.price - ln.from.price);
}

function cpDrawTriggerHighlight(p, failed) {
  if (!p.triggerTime || p.triggerPrice == null) return;

  const isDown = p.breakoutDirection === "down";
  const color = failed ? CP_FAILED_COLOR : isDown ? CP_TRIGGER_DOWN : CP_TRIGGER_UP;
  const lineColor = color;
  const tailIdx = Math.min(cpBars.length - 1, (p.breakoutIdx ?? p.drawEndIdx ?? p.endIdx) + 6);
  const tailTime = cpBars[tailIdx]?.time ?? p.triggerTime;

  const level = cpChart.addLineSeries({
    ...CP_OVERLAY_SERIES_OPTS,
    color: lineColor,
    lineWidth: 4,
    lineStyle: LightweightCharts.LineStyle.Solid,
  });
  level.setData([
    { time: p.endTime, value: p.triggerPrice },
    { time: p.triggerTime, value: p.triggerPrice },
    { time: tailTime, value: p.triggerPrice },
  ]);
  cpLineSeries.push(level);

  const brkIdx = p.breakoutIdx ?? -1;
  const bar = cpBars[brkIdx];
  if (bar) {
    const spike = cpChart.addLineSeries({
      ...CP_OVERLAY_SERIES_OPTS,
      color: lineColor,
      lineWidth: 3,
      lineStyle: LightweightCharts.LineStyle.Solid,
    });
    const extreme = isDown ? bar.high : bar.low;
    const nextTime = cpBars[Math.min(brkIdx + 1, cpBars.length - 1)]?.time ?? p.triggerTime;
    spike.setData([
      { time: p.triggerTime, value: p.triggerPrice },
      { time: nextTime, value: extreme },
    ]);
    cpLineSeries.push(spike);
  }

  const pl = cpCandleSeries.createPriceLine({
    price: p.triggerPrice,
    color: lineColor,
    lineWidth: 3,
    lineStyle: LightweightCharts.LineStyle.Solid,
    axisLabelVisible: true,
    title: failed ? (isDown ? "▼Trig fail" : "▲Trig fail") : isDown ? "▼Trig" : "▲Trig",
  });
  cpTargetLines.push(pl);
}

function cpApplyZoomPrice() {
  if (!cpCandleSeries || !cpChart) return;

  if (!cpZoomPriceRange) {
    cpCandleSeries.applyOptions({ autoscaleInfoProvider: undefined });
    cpChart.priceScale("right").applyOptions({ autoScale: true });
    return;
  }

  const { min, max } = cpZoomPriceRange;
  cpCandleSeries.applyOptions({
    autoscaleInfoProvider: () => ({
      priceRange: { minValue: min, maxValue: max },
    }),
  });
  cpChart.priceScale("right").applyOptions({ autoScale: true });
  cpRedrawWedgeOverlays();
}

function cpClearZoomPrice() {
  cpZoomPriceRange = null;
  cpApplyZoomPrice();
}

function cpZoomToPattern(p) {
  if (!cpChart || !p || !cpBars.length) return;

  const startIdx = Math.max(0, p.startIdx);
  let focusEnd = p.breakoutIdx ?? p.drawEndIdx ?? p.endIdx;
  const span = Math.max(8, focusEnd - startIdx);
  const postPad = Math.max(6, Math.floor(span * 0.2));
  const prePad = Math.max(4, Math.floor(span * 0.12));
  focusEnd = Math.min(cpBars.length - 1, focusEnd + postPad);

  const from = cpBars[Math.max(0, startIdx - prePad)]?.time;
  const to = cpBars[focusEnd]?.time;
  if (from && to) cpChart.timeScale().setVisibleRange({ from, to });

  let minP = Infinity;
  let maxP = -Infinity;
  const lo = Math.max(0, startIdx - prePad);
  for (let i = lo; i <= focusEnd; i++) {
    minP = Math.min(minP, cpBars[i].low);
    maxP = Math.max(maxP, cpBars[i].high);
  }
  p.lines?.forEach((ln) => {
    minP = Math.min(minP, ln.from.price, ln.to.price);
    maxP = Math.max(maxP, ln.from.price, ln.to.price);
  });
  if (p.targetUp != null) maxP = Math.max(maxP, p.targetUp);
  if (p.targetDown != null) minP = Math.min(minP, p.targetDown);
  if (p.triggerPrice != null) {
    minP = Math.min(minP, p.triggerPrice);
    maxP = Math.max(maxP, p.triggerPrice);
  }

  if (Number.isFinite(minP) && Number.isFinite(maxP) && maxP > minP) {
    const margin = (maxP - minP) * 0.1;
    cpZoomPriceRange = { min: minP - margin, max: maxP + margin };
  } else {
    cpZoomPriceRange = null;
  }
  cpApplyZoomPrice();
}

function cpDrawPatterns() {
  if (!cpChart || !cpCandleSeries) return;
  cpClearOverlays();

  const markers = [];
  const p = cpPatterns.find((x) => x.id === cpSelectedId);
  if (!p) {
    cpCandleSeries.setMarkers([]);
    cpRedrawWedgeOverlays();
    return;
  }

  const failed = p.status === "failed";
  const color = failed ? CP_FAILED_COLOR : CP_ACCENT_BRIGHT;

  p.lines?.forEach((ln) => {
      const lineColor = cpBrightLineColor(ln.role, color);
      const drawColor = failed && ln.role !== "structure" ? `${lineColor}cc` : lineColor;
      const isHs =
        p.type === "head_shoulders" || p.type === "inverse_head_shoulders";
      const isWedge = p.type === "falling_wedge" || p.type === "rising_wedge";
      const isKey = ["neckline", "resistance", "support", "structure", "wedge_upper", "wedge_lower", "wedge_width", "pole"].includes(
        ln.role,
      );
      let lineWidth = ln.role === "structure" && isHs ? 5 : ln.role === "neckline" && isHs ? 4 : isKey ? 4 : 3;
      if (isWedge && ln.role === "resistance") lineWidth = 5;
      if (isWedge && ln.role === "support") lineWidth = 5;
      if (isWedge && ln.role === "wedge_width") lineWidth = 3;
      if (isWedge && (ln.role === "wedge_upper" || ln.role === "wedge_lower")) lineWidth = 2;
      if (ln.role === "pole") lineWidth = 5;
      if (ln.role === "resistance" || ln.role === "support" || ln.role === "neckline") {
        lineWidth = Math.max(lineWidth, ln.role === "neckline" ? 4 : 5);
      }
      const lineStyle =
        ln.role === "zone"
          ? LightweightCharts.LineStyle.Dotted
          : ln.role === "wedge_width"
            ? LightweightCharts.LineStyle.Dashed
            : LightweightCharts.LineStyle.Solid;
      const series = cpChart.addLineSeries({
        ...CP_OVERLAY_SERIES_OPTS,
        color: drawColor,
        lineWidth,
        lineStyle,
      });
      series.setData([
        { time: ln.from.time, value: ln.from.price },
        { time: ln.to.time, value: ln.to.price },
      ]);
      cpLineSeries.push(series);
    });

  cpDrawTargetGraphic(p, "up", p.targetUp, failed);
  cpDrawTargetGraphic(p, "down", p.targetDown, failed);
  cpDrawTriggerHighlight(p, failed);

  if (p.apexTime && p.lines?.some((ln) => ln.role === "resistance" || ln.role === "support")) {
    const apexLn = p.lines.find((ln) => ln.role === "resistance" || ln.role === "support");
    const apexPrice = apexLn ? (apexLn.to.price + (p.lines.find((l) => l.role !== apexLn.role && (l.role === "resistance" || l.role === "support"))?.to.price ?? apexLn.to.price)) / 2 : null;
    if (apexPrice != null) {
      const apexColor =
        p.type === "falling_wedge" ? "#00ffaa" : p.type === "rising_wedge" ? "#ff4488" : "#ffe600";
      const apexText =
        p.type === "falling_wedge" ? "Apex ▲" : p.type === "rising_wedge" ? "Apex ▼" : "Apex";
      markers.push(
        cpMkMarker({
          time: p.apexTime,
          position: "inBar",
          color: apexColor,
          shape: "circle",
          text: apexText,
        }),
      );
    }
  }

  if (p.labelTime) {
    markers.push(
      cpMkMarker({
        time: p.labelTime,
        position: p.labelPosition || "aboveBar",
        color: CP_ACCENT_BRIGHT,
        shape: "square",
        text: p.shortName || p.name,
      }),
    );
  }

  p.markers?.forEach((m) => {
    if (m.kind === "label") return;
    let mColor = CP_ACCENT_BRIGHT;
    if (m.kind === "failed") mColor = CP_FAILED_COLOR;
    else if (m.kind === "structure" || m.kind === "pivot") {
      mColor =
        m.position === "aboveBar" ? CP_ROLE_COLORS.resistance : m.position === "belowBar" ? CP_ROLE_COLORS.support : CP_ROLE_COLORS.structure;
    } else if (m.kind === "width") mColor = CP_ROLE_COLORS.wedge_width;
    else if (m.kind === "endpoint") mColor = m.text === "R" ? CP_ROLE_COLORS.resistance : CP_ROLE_COLORS.support;
    else if (m.kind === "pole") mColor = CP_ROLE_COLORS.pole;
    else if (m.kind === "trigger") mColor = m.text?.includes("▼") ? CP_TRIGGER_DOWN : CP_TRIGGER_UP;
    markers.push(
      cpMkMarker({
        time: m.time,
        position: m.position,
        color: mColor,
        shape: m.shape,
        text: m.text,
      }),
    );
  });

  cpPushLineRoleLabels(p, markers, failed);

  cpCandleSeries.setMarkers(cpSpreadMarkers(markers));
  cpRedrawWedgeOverlays();
}

function cpRenderCategoryFilter() {
  const wrap = cpEl("cp-category-filter");
  if (!wrap) return;

  let html = "";
  Object.entries(CP_CATEGORIES).forEach(([key, cat]) => {
    const count =
      key === "all" ? cpPatterns.length : cpPatterns.filter((p) => cat.types.includes(p.type)).length;
    const active = cpActiveCategory === key;
    html += `<button type="button" class="cp-cat-btn${active ? " active" : ""}" data-cp-cat="${key}"${count ? "" : ' disabled title="None in this category"'}>${cat.label}${count ? ` (${count})` : ""}</button>`;
  });
  wrap.innerHTML = html;

  wrap.querySelectorAll("[data-cp-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      cpActiveCategory = btn.dataset.cpCat;
      cpRenderCategoryFilter();
      const p = cpEnsureSelection();
      cpSelectPattern(p?.id ?? null);
    });
  });
}

function cpStatusLabel(status) {
  if (status === "confirmed") return "Confirmed";
  if (status === "target_reached") return "Target reached";
  if (status === "failed") return "Failed";
  return "Forming";
}

function cpBiasLabel(pattern) {
  if (pattern.bullish === true) return "Bullish bias";
  if (pattern.bullish === false) return "Bearish bias";
  return "Neutral — either direction";
}

function cpTargetChartLabel(p, direction) {
  const up = {
    falling_wedge: "↑ Breakout tgt",
    rising_wedge: "↑ Alt tgt",
    head_shoulders: "↑ Inverse tgt",
    inverse_head_shoulders: "↑ Primary tgt",
    ascending_triangle: "↑ Breakout tgt",
    descending_triangle: "↑ Alt tgt",
    double_bottom: "↑ Primary tgt",
    bull_flag: "↑ Pole tgt",
    bear_flag: "↑ Alt tgt",
    default: "↑ Target",
  };
  const down = {
    falling_wedge: "↓ Failure tgt",
    rising_wedge: "↓ Breakdown tgt",
    head_shoulders: "↓ Primary tgt",
    inverse_head_shoulders: "↓ Failure tgt",
    descending_triangle: "↓ Breakdown tgt",
    ascending_triangle: "↓ Failure tgt",
    double_top: "↓ Primary tgt",
    bear_flag: "↓ Pole tgt",
    bull_flag: "↓ Alt tgt",
    default: "↓ Target",
  };
  const map = direction === "up" ? up : down;
  return map[p.type] || map.default;
}

function cpBuildLegendItems(pattern) {
  const accent = pattern.status === "failed" ? CP_FAILED_COLOR : pattern.color;
  const items = CP_LEGEND_SHARED.filter((item) => item.show(pattern)).map((item) => ({
    ...item,
    color: item.color === "accent" ? accent : item.color,
  }));
  const typeItems = (CP_LEGEND_BY_TYPE[pattern.type] || []).filter((item) => item.show(pattern));
  return [...items, ...typeItems];
}

function cpLegendChartText(item, pattern) {
  const raw = CP_LEGEND_CHART[item.id];
  if (typeof raw === "function") return raw(pattern);
  return raw || item.label;
}

function cpLegendHtml(pattern) {
  const items = cpBuildLegendItems(pattern);
  if (!items.length) return "";
  return `<ul class="cp-detail-legend">${items
    .map((item) => {
      const chartText = cpLegendChartText(item, pattern);
      const when = CP_LEGEND_WHEN[item.id];
      return `<li class="cp-detail-legend__item">
        <span class="cp-detail-legend__swatch" style="background:${item.color}"></span>
        <div class="cp-detail-legend__body">
          <strong class="cp-detail-legend__label">${item.label}</strong>
          <span class="cp-detail-legend__chart">On chart: “${chartText}”</span>
          <span class="cp-detail-legend__desc">${item.desc}</span>
          ${when ? `<span class="cp-detail-legend__when"><strong>When shown:</strong> ${when}</span>` : ""}
        </div>
      </li>`;
    })
    .join("")}</ul>`;
}

function cpPatternLevels(pattern) {
  const neck = pattern.lines?.find((ln) => ln.role === "neckline");
  const res = pattern.lines?.find((ln) => ln.role === "resistance");
  const sup = pattern.lines?.find((ln) => ln.role === "support");
  const resPrice = pattern.wedgeResApex ?? pattern.zone?.top ?? res?.to.price ?? null;
  const supPrice = pattern.wedgeSupApex ?? pattern.zone?.bottom ?? sup?.to.price ?? null;
  const neckPrice = neck?.to.price ?? null;
  return { resPrice, supPrice, neckPrice };
}

function cpFmtLevel(price) {
  return price != null ? `$${cpFmtPrice(price)}` : "the boundary";
}

function cpTriggerRules(pattern) {
  const { resPrice, supPrice, neckPrice } = cpPatternLevels(pattern);
  const R = cpFmtLevel(resPrice);
  const S = cpFmtLevel(supPrice);
  const N = cpFmtLevel(neckPrice);
  const closeAbove = (lvl) => `Candle close above ${lvl} (≈ +0.2% buffer).`;
  const closeBelow = (lvl) => `Candle close below ${lvl} (≈ −0.2% buffer).`;

  const rules = {
    head_shoulders: {
      primary: `▼ Bearish confirmation: ${closeBelow(N)} Primary measured move targets neckline minus head height.`,
      fail: `Invalid if price closes back above the neckline after breakdown, never triggers while reclaiming ${N}, or breaks above the head before neckline breaks.`,
      alt: `Alternate bullish (failed-bearish): ${closeAbove(N)} projects neckline plus head height (↑ inverse target).`,
    },
    inverse_head_shoulders: {
      primary: `▲ Bullish confirmation: ${closeAbove(N)} Primary target = neckline plus head depth.`,
      fail: `Invalid if price closes back below ${N} after breakout, or never triggers while staying under the neckline.`,
      alt: null,
    },
    ascending_triangle: {
      primary: `▲ Bullish confirmation: ${closeAbove(R)} (flat resistance). Target = triangle height projected up.`,
      fail: `Invalid if price closes below rising support ${S} before resistance breaks.`,
      alt: `▼ Bearish failure: ${closeBelow(S)} targets triangle height projected down.`,
    },
    descending_triangle: {
      primary: `▼ Bearish confirmation: ${closeBelow(S)} (flat support). Target = triangle height projected down.`,
      fail: `Invalid if price closes above falling resistance ${R} before support breaks.`,
      alt: `▲ Alternate: ${closeAbove(R)} targets triangle height projected up.`,
    },
    symmetrical_triangle: {
      primary: `Either direction: ${closeAbove(R)} (bullish) or ${closeBelow(S)} (bearish). First confirmed close sets bias.`,
      fail: `No trigger while price remains inside the triangle. Whichever boundary breaks second becomes the alternate scenario.`,
      alt: null,
    },
    double_top: {
      primary: `▼ Bearish confirmation: ${closeBelow(N)} (neckline through middle trough).`,
      fail: `Invalid if price reclaims above ${N} or makes a higher high above both peaks before neckline breaks.`,
      alt: null,
    },
    double_bottom: {
      primary: `▲ Bullish confirmation: ${closeAbove(N)} (neckline through middle peak).`,
      fail: `Invalid if price falls back below ${N} or makes a lower low below both troughs before neckline breaks.`,
      alt: null,
    },
    falling_wedge: {
      primary: `▲ Bullish confirmation: ${closeAbove(R)} (falling resistance at apex). Target = opening width projected up.`,
      fail: `Invalid if price closes below ${S} (support) before upside breakout — failure target projects opening width down.`,
      alt: null,
    },
    rising_wedge: {
      primary: `▼ Bearish confirmation: ${closeBelow(S)} (rising support at apex). Target = opening width projected down.`,
      fail: `Invalid if price closes above ${R} before breakdown — alternate upside target projects opening width up.`,
      alt: `▲ Alternate: ${closeAbove(R)} if bearish wedge fails.`,
    },
    bull_flag: {
      primary: `▲ Continuation: ${closeAbove(R)} (top of flag channel). Target = pole height added from breakout.`,
      fail: `Invalid if price closes below flag support ${S} before upside break.`,
      alt: null,
    },
    bear_flag: {
      primary: `▼ Continuation: ${closeBelow(S)} (bottom of flag channel). Target = pole length projected down.`,
      fail: `Invalid if price closes above flag resistance ${R} before downside break.`,
      alt: null,
    },
    pennant: {
      primary: `Breakout either way: ${closeAbove(R)} or ${closeBelow(S)} after the pennant forms. Target = pole length in breakout direction.`,
      fail: `No trigger while price compresses inside the pennant without a closing break.`,
      alt: null,
    },
    rectangle: {
      primary: `Break above ${R} (bullish) or below ${S} (bearish). Target = range height projected from break.`,
      fail: `No trigger while price oscillates inside the range without a closing break beyond ${R} or ${S}.`,
      alt: null,
    },
  };

  return (
    rules[pattern.type] || {
      primary: `Confirmation requires a candle close beyond the pattern boundary (≈0.2% buffer).`,
      fail: `Failure if price breaks the opposite boundary before the primary trigger fires.`,
      alt: null,
    }
  );
}

function cpTriggerStatusNow(pattern) {
  const rules = cpTriggerRules(pattern);
  if (pattern.status === "confirmed") {
    return `Triggered on ${pattern.triggerTime || "—"} at ${pattern.triggerPrice != null ? `$${cpFmtPrice(pattern.triggerPrice)}` : "boundary"}. ${pattern.breakoutDirection === "up" ? "Upside" : "Downside"} breakout confirmed — watch dashed target lines.`;
  }
  if (pattern.status === "target_reached") {
    return `Price reached the projected target after the ${pattern.breakoutDirection === "up" ? "upside" : "downside"} trigger.`;
  }
  if (pattern.status === "failed") {
    return pattern.failedReason || "Pattern invalidated — see failure rules above.";
  }
  return `Still forming — awaiting a confirming close per the primary rule above. ${rules.primary.split(".")[0]}.`;
}

function cpTriggerGuideHtml(pattern) {
  const rules = cpTriggerRules(pattern);
  return `
    <section class="cp-detail-section cp-detail-section--full">
      <h5 class="cp-detail-section__title">When does it trigger?</h5>
      <div class="cp-trigger-grid">
        <div class="cp-trigger-card cp-trigger-card--primary">
          <h6>Primary confirmation</h6>
          <p>${rules.primary}</p>
        </div>
        <div class="cp-trigger-card cp-trigger-card--fail">
          <h6>Invalidation / failure</h6>
          <p>${rules.fail}</p>
        </div>
        ${rules.alt ? `<div class="cp-trigger-card cp-trigger-card--alt"><h6>Alternate scenario</h6><p>${rules.alt}</p></div>` : ""}
        <div class="cp-trigger-card cp-trigger-card--status">
          <h6>Current status — ${cpStatusLabel(pattern.status)}</h6>
          <p>${cpTriggerStatusNow(pattern)}</p>
        </div>
      </div>
      <p class="cp-detail-guide cp-detail-guide--tip">Triggers use candle <strong>close</strong> beyond the level (with ~0.2% buffer), not intrabar wicks. Status is heuristic on this timeframe.</p>
    </section>`;
}

function cpLineRoleChartLabel(role) {
  const map = {
    resistance: "Resist",
    support: "Sup",
    neckline: "Neck",
    pole: "Pole",
    wedge_width: "Width",
  };
  return map[role] || null;
}

function cpPushLineRoleLabels(p, markers, failed) {
  const seen = new Set();
  p.lines?.forEach((ln) => {
    const text = cpLineRoleChartLabel(ln.role);
    if (!text || seen.has(ln.role)) return;
    seen.add(ln.role);
    const color = cpBrightLineColor(ln.role, CP_ACCENT_BRIGHT);
    const position =
      ln.role === "support" || ln.role === "wedge_width" ? "belowBar" : ln.role === "resistance" ? "aboveBar" : "inBar";
    markers.push(
      cpMkMarker({
        time: cpLineLabelTime(ln, ln.role),
        position,
        color: failed ? `${CP_FAILED_COLOR}cc` : color,
        shape: "circle",
        text,
      }),
    );
  });
}

function cpLevelsHtml(pattern) {
  const rows = [];
  const add = (label, value, cls) => {
    if (value == null) return;
    rows.push(`<dt>${label}</dt><dd${cls ? ` class="${cls}"` : ""}>${value}</dd>`);
  };

  if (pattern.wedgeResOpen != null) {
    add("Resistance @ open", `$${cpFmtPrice(pattern.wedgeResOpen)}`);
    add("Support @ open", `$${cpFmtPrice(pattern.wedgeSupOpen)}`);
    add("Resistance @ apex", `$${cpFmtPrice(pattern.wedgeResApex)}`);
    add("Support @ apex", `$${cpFmtPrice(pattern.wedgeSupApex)}`);
    if (pattern.wedgeOpenHeight != null) add("Opening width", `$${cpFmtPrice(pattern.wedgeOpenHeight)}`);
    if (pattern.wedgeApexHeight != null) add("Width at apex", `$${cpFmtPrice(pattern.wedgeApexHeight)}`);
    if (pattern.wedgeCompressionPct != null) add("Compression", `${pattern.wedgeCompressionPct.toFixed(0)}% narrower`);
  } else if (pattern.zone) {
    add("Zone top", `$${cpFmtPrice(pattern.zone.top)}`);
    add("Zone bottom", `$${cpFmtPrice(pattern.zone.bottom)}`);
    if (pattern.zone.top != null && pattern.zone.bottom != null) {
      add("Zone height", `$${cpFmtPrice(pattern.zone.top - pattern.zone.bottom)}`);
    }
  }

  if (pattern.apexTime) {
    add("Apex", `${pattern.apexTime}${pattern.apexPrice != null ? ` @ $${cpFmtPrice(pattern.apexPrice)}` : ""}`);
  }

  add("Upside target", pattern.targetUp != null ? `↑ $${cpFmtPrice(pattern.targetUp)}` : null, "cp-detail-target cp-detail-target--up");
  add("Downside target", pattern.targetDown != null ? `↓ $${cpFmtPrice(pattern.targetDown)}` : null, "cp-detail-target cp-detail-target--down");
  add("Breakout close", pattern.breakoutPrice != null ? `$${cpFmtPrice(pattern.breakoutPrice)}` : null);

  if (!rows.length) return "";
  return `<dl class="cp-detail-grid cp-detail-grid--levels">${rows.join("")}</dl>`;
}

function cpTargetSummary(p) {
  const parts = [];
  if (p.targetUp != null) parts.push(`↑ $${cpFmtPrice(p.targetUp)}`);
  if (p.targetDown != null) parts.push(`↓ $${cpFmtPrice(p.targetDown)}`);
  return parts.length ? parts.join(" · ") : "Forming";
}

function cpDetailTrigger(pattern) {
  if (pattern.triggerPrice == null) {
    return pattern.status === "forming" ? "Developing — awaiting neckline/boundary break" : "Not triggered";
  }
  const dir = pattern.breakoutDirection === "up" ? "↑" : pattern.breakoutDirection === "down" ? "▼" : "";
  return `${dir} $${cpFmtPrice(pattern.triggerPrice)}${pattern.triggerTime ? ` on ${pattern.triggerTime}` : ""}`;
}

function cpRenderDetail(pattern) {
  const el = cpEl("cp-pattern-detail");
  if (!el) return;
  if (!pattern) {
    el.innerHTML = '<p class="cp-detail-empty">Select a pattern to see every chart label explained, key prices, and target math.</p>';
    return;
  }

  const accent = pattern.status === "failed" ? CP_FAILED_COLOR : pattern.color;
  const calcNotes = [
    pattern.targetUpNote ? `<li class="cp-detail-calc cp-detail-calc--up">${pattern.targetUpNote}</li>` : "",
    pattern.targetDownNote ? `<li class="cp-detail-calc cp-detail-calc--down">${pattern.targetDownNote}</li>` : "",
  ]
    .filter(Boolean)
    .join("");

  el.innerHTML = `
    <div class="cp-detail-card" style="--cp-accent:${accent}">
      <header class="cp-detail-header cp-detail-section--full">
        <div class="cp-detail-header__row">
          <h4>${pattern.name}</h4>
          <span class="cp-status cp-status--${pattern.status}">${cpStatusLabel(pattern.status)}</span>
        </div>
        <p class="cp-detail-bias">${cpBiasLabel(pattern)}</p>
        <p class="cp-detail-desc">${pattern.description}</p>
      </header>

      <div class="cp-detail-card__grid">
        ${cpTriggerGuideHtml(pattern)}

        <section class="cp-detail-section cp-detail-section--full">
          <h5 class="cp-detail-section__title">Every label on the chart</h5>
          <p class="cp-detail-guide">Each row lists the chart text, what it means, and when that label appears.</p>
          ${cpLegendHtml(pattern)}
        </section>

        <section class="cp-detail-section">
          <h5 class="cp-detail-section__title">How to read this chart</h5>
          <p class="cp-detail-guide">${pattern.chartGuide || "Solid lines trace live structure. Dashed green/red lines are measured-move targets — projections, not trend extensions."}</p>
        </section>

        <section class="cp-detail-section">
          <h5 class="cp-detail-section__title">Key prices</h5>
          ${cpLevelsHtml(pattern)}
          <dl class="cp-detail-grid cp-detail-grid--meta">
            <dt>Pattern period</dt><dd>${pattern.startTime} → ${pattern.endTime}</dd>
            <dt>Trigger level</dt><dd>${cpDetailTrigger(pattern)}</dd>
            <dt>Risk / reward</dt><dd>${pattern.riskReward || "—"}</dd>
          </dl>
        </section>

        <section class="cp-detail-section cp-detail-section--full">
          <h5 class="cp-detail-section__title">Target projections</h5>
          <p class="cp-detail-guide">${pattern.projectionNote || "Dashed ↑/↓ segments project measured moves forward from the apex or trigger — they are not extensions of the pattern lines."}</p>
          ${calcNotes ? `<ul class="cp-detail-calcs">${calcNotes}</ul>` : ""}
        </section>
      </div>
    </div>`;
}

function cpRenderPatternList() {
  const list = cpEl("cp-pattern-list");
  if (!list) return;

  const filtered = cpFilteredPatterns();
  if (!cpPatterns.length) {
    list.innerHTML = '<p class="cp-list-empty">No classical patterns detected on this timeframe. Try W or M for longer structure.</p>';
    cpRenderDetail(null);
    cpUpdateChartBadge(null);
    return;
  }

  if (!filtered.length) {
    list.innerHTML = '<p class="cp-list-empty">No patterns in this category. Pick another filter above.</p>';
    return;
  }

  list.innerHTML = filtered
    .map((p) => {
      const sel = cpSelectedId === p.id;
      return `<article class="cp-pattern-item${sel ? " cp-pattern-item--selected" : ""}" data-cp-id="${p.id}" aria-pressed="${sel}">
        <div class="cp-pattern-item__head">
          <span class="cp-pattern-item__dot" style="background:${p.status === "failed" ? CP_FAILED_COLOR : CP_ACCENT_BRIGHT}"></span>
          <strong>${p.name}</strong>
          ${sel ? '<span class="cp-pattern-item__live">On chart</span>' : ""}
          <span class="cp-status cp-status--${p.status}">${cpStatusLabel(p.status)}</span>
        </div>
        <p class="cp-pattern-item__meta">${p.startTime}–${p.endTime} · ${cpTargetSummary(p)}</p>
      </article>`;
    })
    .join("");

  list.querySelectorAll(".cp-pattern-item").forEach((item) => {
    item.addEventListener("click", () => {
      cpSelectPattern(item.dataset.cpId);
    });
  });
}

async function cpLoadTimeframe(tfKey) {
  cpActiveTf = tfKey;
  const cfg = CP_TF[tfKey];
  cpSetError(null);
  cpSetLoading(true, `Loading ${cfg.label} BTC/USDT…`);

  const meta = cpEl("cp-meta");
  if (meta) meta.textContent = `${cfg.label} · Binance BTC/USDT · pattern scan`;

  try {
    if (!window.LightweightCharts) throw new Error("Chart library not loaded");
    if (!cpInitChart()) throw new Error("Chart container unavailable");

    let klines;
    const cached = cpCache[tfKey];
    if (cached?.v === CP_DATA_VERSION && cached.klines?.length) {
      klines = cached.klines;
    } else {
      klines = await cpFetchKlines(tfKey);
      cpCache[tfKey] = { v: CP_DATA_VERSION, klines };
    }

    cpBars = window.cpBarsFromKlines(klines);
    if (!cpBars.length) throw new Error("No candle data returned");

    cpPatterns = window.detectChartPatterns(cpBars);

    const candleData = cpBars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    cpCandleSeries.setData(candleData);
    cpChart.timeScale().fitContent();
    cpRenderCategoryFilter();

    const first = cpEnsureSelection();
    if (first) {
      cpSelectPattern(first.id);
    } else {
      cpRenderPatternList();
      cpRenderDetail(null);
      cpDrawPatterns();
      cpClearZoomPrice();
    }

    cpSetLoading(false);
  } catch (err) {
    console.error("Chart patterns load failed:", err);
    cpSetLoading(false);
    cpSetError(err.message || "Failed to load chart data");
  }
}

function cpBindToolbar() {
  const switcher = cpEl("cp-tf-switch");
  if (!switcher || switcher.dataset.bound) return;
  switcher.dataset.bound = "1";

  switcher.querySelectorAll("[data-cp-tf]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switcher.querySelectorAll("[data-cp-tf]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      cpLoadTimeframe(btn.dataset.cpTf);
    });
  });
}

function initChartPatterns() {
  if (!cpReady) {
    cpBindToolbar();
    cpReady = true;
  }
  cpLoadTimeframe(cpActiveTf);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cpResizeChart();
      if (cpChart && cpBars.length) {
        cpChart.timeScale().fitContent();
        cpDrawPatterns();
      }
    });
  });
  window.decorateHelpLabels?.(
    document.querySelector('#dashboard-market .menu-screen[data-l2="chart-patterns"]'),
  );
}

window.initChartPatterns = initChartPatterns;
window.cpLoadChartPatterns = cpLoadTimeframe;