/**
 * Valuation → 4y Cycle
 * Daily BTC/USD from /api/stats/btc-history. Peaks/bottoms detected from the series.
 */

const VC_HISTORY_API = "/api/stats/btc-history";
const VC_NEXT_HALVING_EST = "2028-04-20";
const VC_GENESIS = "2009-01-03";
const VC_SPIRAL_T0 = "2011-01-01";
const VC_MAX_TRACE_PTS = 480;

/** Halving anchors; prices and extrema from the price series. */
const VC_HALVINGS = [
  { id: "c1", label: "Cycle 1", year: 2012, color: "#38bdf8", dash: "solid", date: "2012-11-28" },
  { id: "c2", label: "Cycle 2", year: 2016, color: "#a78bfa", dash: "solid", date: "2016-07-09" },
  { id: "c3", label: "Cycle 3", year: 2020, color: "#34d399", dash: "solid", date: "2020-05-11" },
  { id: "c4", label: "Cycle 4", year: 2024, color: "#f0b90b", dash: "dash", date: "2024-04-20", current: true },
];

const VC_PLOTLY = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
  displaylogo: false,
};

const VC_CHART_H = 420;

let vcSeries = []; // { t, date, close, high, low }
let vcMeta = null;
let vcCycles = []; // derived cycle objects
let vcRef = null; // as-of snapshot from last bar
let vcReady = false;
let vcLoading = false;
let vcVisible = { c1: true, c2: true, c3: true, c4: true };

const vcEl = (id) => document.getElementById(id);

function vcParseDate(s) {
  if (typeof s === "number") return s;
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function vcDateStr(t) {
  const d = new Date(typeof t === "number" ? t : vcParseDate(t));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function vcDaysBetween(a, b) {
  return Math.round((vcParseDate(b) - vcParseDate(a)) / 86400000);
}

function vcAddDays(dateStr, days) {
  return vcDateStr(vcParseDate(dateStr) + days * 86400000);
}

function vcFmtDate(s) {
  const d = new Date(vcParseDate(s));
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function vcFmtUsd(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${Math.round(n).toLocaleString("en-US")}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function vcFmtMult(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 100) return `${Math.round(n)}×`;
  if (n >= 10) return `${n.toFixed(1)}×`;
  return `${n.toFixed(2)}×`;
}

function vcFmtPct(n, signed = false) {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = signed && n > 0 ? "+" : "";
  return `${s}${n.toFixed(0)}%`;
}

function vcNearestBar(dateStr) {
  if (!vcSeries.length) return null;
  const t = vcParseDate(dateStr);
  let lo = 0;
  let hi = vcSeries.length - 1;
  if (t <= vcSeries[0].t) return vcSeries[0];
  if (t >= vcSeries[hi].t) return vcSeries[hi];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (vcSeries[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const a = vcSeries[Math.max(0, lo - 1)];
  const b = vcSeries[lo];
  return Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b;
}

function vcPriceOn(dateStr) {
  const b = vcNearestBar(dateStr);
  return b?.close ?? null;
}

function vcSlice(startDate, endDateInclusive) {
  const t0 = vcParseDate(startDate);
  const t1 = endDateInclusive ? vcParseDate(endDateInclusive) : vcSeries[vcSeries.length - 1].t;
  const out = [];
  for (const d of vcSeries) {
    if (d.t < t0) continue;
    if (d.t > t1) break;
    out.push(d);
  }
  return out;
}

function vcArgMaxClose(slice) {
  if (!slice.length) return null;
  let best = slice[0];
  for (const d of slice) {
    if (d.close > best.close) best = d;
  }
  return best;
}

function vcArgMinClose(slice) {
  if (!slice.length) return null;
  let best = slice[0];
  for (const d of slice) {
    if (d.close < best.close) best = d;
  }
  return best;
}

/** Prefer daily high for cycle tops when available. */
function vcArgMaxHigh(slice) {
  if (!slice.length) return null;
  let best = slice[0];
  let bestPx = Number.isFinite(best.high) ? best.high : best.close;
  for (const d of slice) {
    const px = Number.isFinite(d.high) && d.high > 0 ? d.high : d.close;
    if (px > bestPx) {
      best = d;
      bestPx = px;
    }
  }
  return { ...best, peakPrice: bestPx };
}

/** Prefer daily low for cycle bottoms when available. */
function vcArgMinLow(slice) {
  if (!slice.length) return null;
  let best = slice[0];
  let bestPx = Number.isFinite(best.low) && best.low > 0 ? best.low : best.close;
  for (const d of slice) {
    const px = Number.isFinite(d.low) && d.low > 0 ? d.low : d.close;
    if (px < bestPx) {
      best = d;
      bestPx = px;
    }
  }
  return { ...best, bottomPrice: bestPx };
}

/** Downsample keeping first/last; maxPts inclusive. */
function vcDownsample(points, maxPts = VC_MAX_TRACE_PTS) {
  if (points.length <= maxPts) return points;
  const out = [];
  const last = points.length - 1;
  const step = last / (maxPts - 1);
  for (let i = 0; i < maxPts; i++) {
    out.push(points[Math.round(i * step)]);
  }
  // ensure unique last
  out[out.length - 1] = points[last];
  return out;
}

async function vcFetchHistory(force = false) {
  const url = force ? `${VC_HISTORY_API}?refresh=1` : VC_HISTORY_API;
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `BTC history ${res.status}`);
  if (!payload.days?.length) throw new Error(payload.error || "BTC history returned no daily rows");

  vcSeries = payload.days
    .map((d) => {
      const t = typeof d.date === "number" ? d.date : vcParseDate(d.date);
      return {
        t,
        date: vcDateStr(t),
        close: Number(d.close),
        high: Number(d.high ?? d.close),
        low: Number(d.low ?? d.close),
      };
    })
    .filter((d) => Number.isFinite(d.close) && d.close > 0)
    .sort((a, b) => a.t - b.t);

  vcMeta = {
    pair: payload.pair || "BTC/USD",
    source: payload.source || "Bitstamp + Blockchain.info",
    count: vcSeries.length,
    startDate: vcSeries[0]?.date,
    endDate: vcSeries[vcSeries.length - 1]?.date,
    stale: !!payload.stale,
    warnings: payload.warnings || [],
    fetchedAt: payload.fetchedAt,
  };

  vcBuildCyclesFromSeries();
}

function vcBuildCyclesFromSeries() {
  if (!vcSeries.length) {
    vcCycles = [];
    vcRef = null;
    return;
  }

  const last = vcSeries[vcSeries.length - 1];
  const cycles = [];

  // Seed prior-bottom for C1: min close in 2011 before first halvings
  let priorBottomBar = vcArgMinClose(vcSlice("2011-01-01", "2012-11-27"));

  for (let i = 0; i < VC_HALVINGS.length; i++) {
    const h = VC_HALVINGS[i];
    const nextH = VC_HALVINGS[i + 1];
    const partial = !!h.current;

    const halvingBar = vcNearestBar(h.date);
    if (!halvingBar) continue;

    // Peak = max high (fallback close) from halvings until next halvings / series end.
    // Cap search at ~1100d after H so a later cycle's early action can't steal the top.
    const peakSearchCap = vcAddDays(halvingBar.date, 1100);
    const peakEndRaw = nextH ? nextH.date : last.date;
    const peakEnd =
      vcParseDate(peakEndRaw) < vcParseDate(peakSearchCap) ? peakEndRaw : peakSearchCap;
    const peakSlice = vcSlice(halvingBar.date, peakEnd);
    const peakBar = vcArgMaxHigh(peakSlice) || vcArgMaxClose(peakSlice);
    if (!peakBar) continue;

    // Bottom = min low (fallback close) after peak until next halvings (closed cycles)
    let bottomBar = null;
    if (!partial && nextH) {
      const botStart = vcAddDays(peakBar.date, 1);
      const botSlice = vcSlice(botStart, nextH.date);
      bottomBar = vcArgMinLow(botSlice) || vcArgMinClose(botSlice);
    }

    const priorBottom = priorBottomBar
      ? { date: priorBottomBar.date, price: priorBottomBar.close }
      : { date: halvingBar.date, price: halvingBar.close };

    const peakPrice =
      peakBar.peakPrice != null
        ? peakBar.peakPrice
        : Number.isFinite(peakBar.high) && peakBar.high > 0
          ? peakBar.high
          : peakBar.close;
    const bottomPrice = bottomBar
      ? bottomBar.bottomPrice != null
        ? bottomBar.bottomPrice
        : Number.isFinite(bottomBar.low) && bottomBar.low > 0
          ? bottomBar.low
          : bottomBar.close
      : null;

    const cycle = {
      id: h.id,
      label: h.label,
      year: h.year,
      color: h.color,
      dash: h.dash,
      partial,
      current: !!h.current,
      // Halving still uses close (settlement-style). Tops/bottoms use high/low when present.
      halving: { date: halvingBar.date, price: halvingBar.close },
      peak: { date: peakBar.date, price: peakPrice },
      bottom: bottomBar ? { date: bottomBar.date, price: bottomPrice } : null,
      priorBottom,
      now: partial ? { date: last.date, price: last.close } : null,
    };
    cycles.push(cycle);

    if (bottomBar) priorBottomBar = bottomBar;
  }

  vcCycles = cycles;

  const c4 = cycles.find((c) => c.current) || cycles[cycles.length - 1];
  const closed = cycles.filter((c) => !c.partial && c.bottom);
  const peakToBot = closed.map((c) => vcDaysBetween(c.peak.date, c.bottom.date));
  const hToPeak = closed.map((c) => vcDaysBetween(c.halving.date, c.peak.date));
  const botToNextH = closed.map((c, idx) => {
    const next = cycles[cycles.indexOf(c) + 1];
    return next ? vcDaysBetween(c.bottom.date, next.halving.date) : null;
  }).filter((v) => v != null);

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  vcRef = {
    asOf: last.date,
    asOfLabel: vcFmtDate(last.date),
    lastHalving: c4?.halving.date || VC_HALVINGS[3].date,
    lastHalvingPrice: c4?.halving.price ?? null,
    cycleAthDate: c4?.peak.date || last.date,
    cycleAthPrice: c4?.peak.price ?? last.close,
    currentPrice: last.close,
    nextHalvingEst: VC_NEXT_HALVING_EST,
    avgPeakToBottomDays: Math.round(avg(peakToBot) || 383),
    peakToBottomRange: peakToBot.length
      ? [Math.min(...peakToBot), Math.max(...peakToBot)]
      : [363, 410],
    avgHalvingToPeakDays: Math.round(avg(hToPeak) || 480),
    avgBottomToNextHalvingDays: Math.round(avg(botToNextH) || 518),
    source: vcMeta?.source,
    pair: vcMeta?.pair,
    seriesCount: vcSeries.length,
  };
}

function vcDaysFrom(dateStr, asOf = vcRef?.asOf) {
  if (!asOf) return 0;
  return vcDaysBetween(dateStr, asOf);
}

function vcCycleEndDate(c) {
  if (c.bottom) {
    // extend a bit past bottom for recovery context on overlays
    const next = vcCycles[vcCycles.indexOf(c) + 1];
    if (next) return next.halving.date;
    return c.bottom.date;
  }
  return vcRef?.asOf || c.now?.date;
}

/** Real daily path: days from baseDate, multiple of basePrice. */
function vcSeriesPath(baseDate, basePrice, endDate, maxPts = VC_MAX_TRACE_PTS) {
  if (!basePrice || !Number.isFinite(basePrice) || basePrice <= 0) {
    return { x: [0], y: [1] };
  }
  const slice = vcSlice(baseDate, endDate);
  if (!slice.length) return { x: [0], y: [1] };
  const t0 = vcParseDate(baseDate);
  const pts = slice.map((d) => ({
    day: Math.round((d.t - t0) / 86400000),
    mult: d.close / basePrice,
    close: d.close,
    date: d.date,
  }));
  const ds = vcDownsample(pts, maxPts);
  return {
    x: ds.map((p) => p.day),
    y: ds.map((p) => p.mult),
    dates: ds.map((p) => p.date),
    closes: ds.map((p) => p.close),
  };
}

function vcHalvingPath(c) {
  return vcSeriesPath(c.halving.date, c.halving.price, vcCycleEndDate(c));
}

function vcBottomPath(c) {
  return vcSeriesPath(c.priorBottom.date, c.priorBottom.price, vcCycleEndDate(c));
}

function vcDrawdownPath(c) {
  const peak = c.peak.price;
  const endDate = c.bottom ? c.bottom.date : c.now?.date || vcRef.asOf;
  const slice = vcSlice(c.peak.date, endDate);
  if (!slice.length || !peak) return { x: [0], y: [0] };
  const t0 = vcParseDate(c.peak.date);
  const pts = slice.map((d) => ({
    day: Math.round((d.t - t0) / 86400000),
    dd: ((d.close - peak) / peak) * 100,
  }));
  const ds = vcDownsample(pts, VC_MAX_TRACE_PTS);
  return { x: ds.map((p) => p.day), y: ds.map((p) => p.dd) };
}

function vcPriceAtOffset(baseDate, offsetDays) {
  return vcPriceOn(vcAddDays(baseDate, offsetDays));
}

function vcPlotLayout(opts = {}) {
  return {
    template: "plotly_dark",
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(255,255,255,0.02)",
    margin: { l: 56, r: 24, t: 28, b: 48 },
    height: opts.height || VC_CHART_H,
    font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 11, color: "#94a3b8" },
    hoverlabel: {
      bgcolor: "#1e2433",
      bordercolor: "rgba(148, 163, 184, 0.35)",
      font: { family: "IBM Plex Sans, sans-serif", size: 11, color: "#e2e8f0" },
    },
    xaxis: {
      title: opts.xTitle || "",
      gridcolor: "rgba(148, 163, 184, 0.08)",
      linecolor: "rgba(148, 163, 184, 0.15)",
      tickfont: { size: 10, color: "#64748b" },
      zeroline: false,
    },
    yaxis: {
      title: opts.yTitle || "",
      type: opts.logY ? "log" : "linear",
      gridcolor: "rgba(148, 163, 184, 0.08)",
      linecolor: "rgba(148, 163, 184, 0.15)",
      tickfont: { size: 10, color: "#64748b" },
      zeroline: opts.zeroLine || false,
      zerolinecolor: "rgba(148, 163, 184, 0.35)",
    },
    showlegend: opts.showLegend !== false,
    legend: {
      orientation: "h",
      y: 1.12,
      x: 0,
      font: { size: 10, color: "#94a3b8" },
      bgcolor: "rgba(0,0,0,0)",
    },
    hovermode: "x unified",
    shapes: opts.shapes || [],
    annotations: opts.annotations || [],
  };
}

function vcShowStatus(msg, isError = false) {
  const meta = vcEl("vc-page-meta");
  if (meta) {
    meta.textContent = msg;
    meta.style.color = isError ? "#f87171" : "";
  }
}

function vcStatusCards() {
  const host = vcEl("vc-status-cards");
  if (!host || !vcRef) return;

  const daysSinceH = vcDaysFrom(vcRef.lastHalving);
  const daysSincePeak = vcDaysFrom(vcRef.cycleAthDate);
  const dd =
    ((vcRef.cycleAthPrice - vcRef.currentPrice) / vcRef.cycleAthPrice) * 100;
  const daysToNext = vcDaysBetween(vcRef.asOf, vcRef.nextHalvingEst);
  const avg = vcRef.avgPeakToBottomDays;

  const cards = [
    {
      label: "Days since last halvings",
      helpKey: "vc-stat-days-halving",
      value: String(daysSinceH),
      sub: `Halving ${vcFmtDate(vcRef.lastHalving)} · ${vcFmtUsd(vcRef.lastHalvingPrice)}`,
      tone: "neutral",
    },
    {
      label: "Days since cycle peak",
      helpKey: "vc-stat-days-peak",
      value: String(daysSincePeak),
      sub: `ATH ${vcFmtUsd(vcRef.cycleAthPrice)} · ${vcFmtDate(vcRef.cycleAthDate)}`,
      tone: "warn",
    },
    {
      label: "Drawdown from cycle ATH",
      helpKey: "vc-stat-drawdown",
      value: vcFmtPct(-dd, true),
      sub: `Spot ${vcFmtUsd(vcRef.currentPrice)} · ${vcRef.pair || "BTC/USD"}`,
      tone: "neg",
    },
    {
      label: "Days to next halvings (est.)",
      helpKey: "vc-stat-next-halving",
      value: String(Math.max(0, daysToNext)),
      sub: `~${vcFmtDate(vcRef.nextHalvingEst)}`,
      tone: "neutral",
    },
    {
      label: "Avg peak → bottom (C1–C3)",
      helpKey: "vc-stat-avg-p2b",
      value: `${avg}d`,
      sub: `Now ${daysSincePeak}d · ${Math.round((daysSincePeak / avg) * 100)}% of avg`,
      tone: "muted",
    },
  ];

  host.innerHTML = cards
    .map(
      (c) => `
    <article class="vc-stat-card vc-stat-card--${c.tone}">
      <span class="vc-stat-label" data-help-key="${c.helpKey}">${c.label}</span>
      <span class="vc-stat-value mono">${c.value}</span>
      <span class="vc-stat-sub">${c.sub}</span>
    </article>`
    )
    .join("");
}

function vcSyncToggleButtons() {
  document.querySelectorAll("[data-vc-cycle]").forEach((btn) => {
    const id = btn.dataset.vcCycle;
    const on = !!vcVisible[id];
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function vcBindToggles(rootId, onChange) {
  const root = vcEl(rootId);
  if (!root || root.dataset.bound) return;
  root.dataset.bound = "true";
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-vc-cycle]");
    if (!btn) return;
    const id = btn.dataset.vcCycle;
    if (!id || !(id in vcVisible)) return;
    vcVisible[id] = !vcVisible[id];
    vcSyncToggleButtons();
    onChange();
  });
}

function vcRenderCycleOverlay(elId, mode) {
  const el = vcEl(elId);
  if (!el || !window.Plotly || !vcCycles.length) return;

  const fromHalving = mode === "halving";
  const traces = [];
  for (const c of vcCycles) {
    if (!vcVisible[c.id]) continue;
    const path = fromHalving ? vcHalvingPath(c) : vcBottomPath(c);
    traces.push({
      x: path.x,
      y: path.y,
      name: `${c.label} (${c.year})`,
      type: "scatter",
      mode: "lines",
      line: {
        color: c.color,
        width: c.current ? 2.8 : 2,
        dash: c.dash === "dash" ? "dash" : "solid",
      },
      customdata: path.dates || path.x.map(() => ""),
      hovertemplate:
        `${c.label}<br>Day %{x:.0f}<br>%{y:.2f}×` +
        (path.dates ? `<br>%{customdata}` : "") +
        `<extra></extra>`,
    });
  }

  const c4 = vcCycles.find((c) => c.current);
  const todayX = fromHalving
    ? vcDaysFrom(vcRef.lastHalving)
    : c4
      ? vcDaysFrom(c4.priorBottom.date)
      : 0;

  const shapes = [
    {
      type: "line",
      x0: todayX,
      x1: todayX,
      y0: 0,
      y1: 1,
      yref: "paper",
      line: { color: "rgba(240,185,11,0.85)", width: 1.5, dash: "dot" },
    },
  ];
  const annotations = [
    {
      x: todayX,
      y: 1,
      yref: "paper",
      text: `Today · d${todayX}`,
      showarrow: false,
      yanchor: "bottom",
      font: { size: 10, color: "#f0b90b" },
      bgcolor: "rgba(11,14,17,0.75)",
    },
  ];

  Plotly.react(
    el,
    traces,
    vcPlotLayout({
      logY: true,
      xTitle: fromHalving
        ? "Days since that cycle’s halvings"
        : "Days since that cycle’s prior bear bottom",
      yTitle: fromHalving
        ? "Multiple of price at halvings (log)"
        : "Multiple of prior cycle bottom (log)",
      shapes,
      annotations,
      height: VC_CHART_H,
    }),
    VC_PLOTLY
  );
}

function vcRenderOverlayChart() {
  vcRenderCycleOverlay("vc-chart-overlay", "halving");
  const note = vcEl("vc-overlay-note");
  if (note && vcRef) {
    note.innerHTML = `Each series rebased to <strong>1× on that cycle’s halvings day</strong>. X = days since that halvings; Y = multiple (log). Vertical line = as-of (day ${vcDaysFrom(vcRef.lastHalving)} since ${vcFmtDate(vcRef.lastHalving)}). Toggle cycles to isolate analogues.`;
  }
}

function vcRenderBottomChart() {
  vcRenderCycleOverlay("vc-chart-bottom", "bottom");
}

function vcRenderDrawdownChart() {
  const el = vcEl("vc-chart-drawdown");
  if (!el || !window.Plotly || !vcCycles.length) return;
  const traces = [];
  for (const c of vcCycles) {
    if (!vcVisible[c.id]) continue;
    const path = vcDrawdownPath(c);
    traces.push({
      x: path.x,
      y: path.y,
      name: `${c.label} (${c.year})`,
      type: "scatter",
      mode: "lines",
      line: {
        color: c.color,
        width: c.current ? 2.8 : 2,
        dash: c.dash === "dash" ? "dash" : "solid",
      },
      hovertemplate: `${c.label}<br>Day %{x:.0f}<br>%{y:.1f}%<extra></extra>`,
    });
  }
  const todayX = vcDaysFrom(vcRef.cycleAthDate);
  Plotly.react(
    el,
    traces,
    vcPlotLayout({
      xTitle: "Days after cycle ATH",
      yTitle: "Drawdown from that cycle’s ATH (%)",
      zeroLine: true,
      shapes: [
        {
          type: "line",
          x0: todayX,
          x1: todayX,
          y0: 0,
          y1: 1,
          yref: "paper",
          line: { color: "rgba(240,185,11,0.85)", width: 1.5, dash: "dot" },
        },
      ],
      annotations: [
        {
          x: todayX,
          y: 1,
          yref: "paper",
          text: `Today · d${todayX}`,
          showarrow: false,
          yanchor: "bottom",
          font: { size: 10, color: "#f0b90b" },
        },
      ],
    }),
    VC_PLOTLY
  );
}

function vcRenderSpiral() {
  const el = vcEl("vc-chart-spiral");
  if (!el || !window.Plotly || !vcSeries.length || !vcRef) return;

  const t0 = vcParseDate(VC_SPIRAL_T0);
  const period = 1461;
  const toPolar = (t, price) => {
    const days = (t - t0) / 86400000;
    const turns = days / period;
    const theta = ((turns % 1) + 1) % 1 * 360;
    const r = Math.log10(Math.max(price, 1e-6));
    return { theta, r };
  };

  const slice = vcSlice(VC_SPIRAL_T0, vcRef.asOf);
  const weekly = [];
  let lastWeek = -1;
  for (const d of slice) {
    const w = Math.floor((d.t - t0) / (7 * 86400000));
    if (w !== lastWeek) {
      weekly.push(d);
      lastWeek = w;
    }
  }
  if (weekly[weekly.length - 1] !== slice[slice.length - 1]) {
    weekly.push(slice[slice.length - 1]);
  }
  const path = vcDownsample(weekly, 600);
  const pathTheta = [];
  const pathR = [];
  for (const d of path) {
    const p = toPolar(d.t, d.close);
    pathTheta.push(p.theta);
    pathR.push(p.r);
  }

  const events = [];
  for (const c of vcCycles) {
    events.push({ date: c.halving.date, price: c.halving.price, kind: "halving", label: `H${c.year}` });
    events.push({ date: c.peak.date, price: c.peak.price, kind: "top", label: `${c.label} top` });
    if (c.bottom) {
      events.push({ date: c.bottom.date, price: c.bottom.price, kind: "bottom", label: `${c.label} bot` });
    }
  }
  events.push({ date: vcRef.asOf, price: vcRef.currentPrice, kind: "now", label: "Now" });

  const kindColor = {
    halving: "#0ecb81",
    top: "#f0b90b",
    bottom: "#f6465d",
    now: "#38bdf8",
  };

  const traces = [
    {
      type: "scatterpolar",
      mode: "lines",
      r: pathR,
      theta: pathTheta,
      name: "log₁₀(close) · weekly",
      line: { color: "rgba(148,163,184,0.55)", width: 1.5 },
      hoverinfo: "skip",
    },
  ];

  for (const kind of ["halving", "top", "bottom", "now"]) {
    const subset = events.filter((e) => e.kind === kind);
    if (!subset.length) continue;
    const rs = [];
    const th = [];
    const text = [];
    for (const e of subset) {
      const p = toPolar(vcParseDate(e.date), e.price);
      rs.push(p.r);
      th.push(p.theta);
      text.push(`${e.label}<br>${vcFmtDate(e.date)}<br>${vcFmtUsd(e.price)}`);
    }
    traces.push({
      type: "scatterpolar",
      mode: "markers+text",
      r: rs,
      theta: th,
      text: subset.map((e) => e.label),
      textposition: "top center",
      textfont: { size: 9, color: kindColor[kind] },
      marker: {
        size: kind === "now" ? 12 : 9,
        color: kindColor[kind],
        line: { width: 1, color: "#0b0e11" },
      },
      name:
        kind === "halving"
          ? "Halvings"
          : kind === "top"
            ? "Cycle tops"
            : kind === "bottom"
              ? "Cycle bottoms"
              : "Current",
      hovertext: text,
      hoverinfo: "text",
    });
  }

  Plotly.react(
    el,
    traces,
    {
      template: "plotly_dark",
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      height: 480,
      margin: { l: 40, r: 40, t: 24, b: 40 },
      font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 11, color: "#94a3b8" },
      showlegend: true,
      legend: {
        orientation: "h",
        y: 1.08,
        x: 0,
        font: { size: 10 },
        bgcolor: "rgba(0,0,0,0)",
      },
      polar: {
        bgcolor: "rgba(255,255,255,0.02)",
        radialaxis: {
          range: [0, 5.5],
          tickvals: [1, 2, 3, 4, 5],
          ticktext: ["$10", "$100", "$1k", "$10k", "$100k"],
          gridcolor: "rgba(148,163,184,0.12)",
          linecolor: "rgba(148,163,184,0.2)",
          tickfont: { size: 9, color: "#64748b" },
          title: { text: "log₁₀(price)", font: { size: 10, color: "#64748b" } },
        },
        angularaxis: {
          rotation: 90,
          direction: "clockwise",
          tickvals: [0, 90, 180, 270],
          ticktext: ["0y", "1y", "2y", "3y"],
          gridcolor: "rgba(148,163,184,0.1)",
          linecolor: "rgba(148,163,184,0.2)",
          tickfont: { size: 9, color: "#64748b" },
        },
      },
    },
    VC_PLOTLY
  );
}

function vcRenderRadar() {
  const el = vcEl("vc-chart-radar");
  if (!el || !window.Plotly || !vcCycles.length) return;

  const axes = [
    "Days H→Peak",
    "Peak × from H",
    "Max DD %",
    "Days Peak→Bottom",
    "Recovery × (bot→next peak)",
    "Days Bot→Next H",
  ];

  const raw = {};
  for (let i = 0; i < vcCycles.length; i++) {
    const c = vcCycles[i];
    const next = vcCycles[i + 1];
    const daysHToPeak = vcDaysBetween(c.halving.date, c.peak.date);
    const peakMult = c.peak.price / c.halving.price;
    const endPrice = c.bottom ? c.bottom.price : c.now?.price || vcRef.currentPrice;
    const maxDd = ((c.peak.price - endPrice) / c.peak.price) * 100;
    const daysP2B = c.bottom
      ? vcDaysBetween(c.peak.date, c.bottom.date)
      : vcDaysBetween(c.peak.date, vcRef.asOf);
    const recovery =
      c.bottom && next ? next.peak.price / c.bottom.price : null;
    const botToNextH =
      c.bottom && next ? vcDaysBetween(c.bottom.date, next.halving.date) : null;
    raw[c.id] = [daysHToPeak, peakMult, maxDd, daysP2B, recovery, botToNextH];
  }

  const closedIds = vcCycles.filter((c) => !c.partial).map((c) => c.id);
  const maxes = axes.map((_, i) => {
    const vals = closedIds.map((id) => raw[id][i]).filter((v) => v != null && Number.isFinite(v));
    return vals.length ? Math.max(...vals) : 1;
  });

  const traces = [];
  for (const c of vcCycles) {
    if (!vcVisible[c.id]) continue;
    const n = raw[c.id].map((v, i) => (v == null ? null : v / (maxes[i] || 1)));
    const r = n.map((v) => (v == null ? 0 : v));
    const theta = [...axes, axes[0]];
    const rr = [...r, r[0]];
    traces.push({
      type: "scatterpolar",
      r: rr,
      theta,
      fill: c.partial ? "none" : "toself",
      fillcolor: c.partial ? undefined : c.color + "22",
      name: c.label + (c.partial ? " (partial)" : ""),
      line: {
        color: c.color,
        width: c.partial ? 2.5 : 2,
        dash: c.partial ? "dash" : "solid",
      },
      hovertemplate: "%{theta}: %{r:.2f} (norm)<extra>" + c.label + "</extra>",
    });
  }

  Plotly.react(
    el,
    traces,
    {
      template: "plotly_dark",
      paper_bgcolor: "rgba(0,0,0,0)",
      height: 460,
      margin: { l: 60, r: 60, t: 40, b: 40 },
      font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 11, color: "#94a3b8" },
      showlegend: true,
      legend: { orientation: "h", y: 1.12, font: { size: 10 }, bgcolor: "rgba(0,0,0,0)" },
      polar: {
        bgcolor: "rgba(255,255,255,0.02)",
        radialaxis: {
          visible: true,
          range: [0, 1.05],
          tickfont: { size: 9, color: "#64748b" },
          gridcolor: "rgba(148,163,184,0.12)",
        },
        angularaxis: {
          tickfont: { size: 9, color: "#94a3b8" },
          gridcolor: "rgba(148,163,184,0.1)",
        },
      },
    },
    VC_PLOTLY
  );
}

function vcRenderRoiTable() {
  const host = vcEl("vc-roi-table");
  if (!host || !vcCycles.length || !vcRef) return;

  const roi = (entry, exit) => {
    if (entry == null || exit == null || entry <= 0) return null;
    return (exit / entry - 1) * 100;
  };

  const rows = [
    {
      label: "Prior cycle bottom",
      helpKey: "vc-roi-prior-bottom",
      vals: vcCycles.map((c) => roi(c.priorBottom.price, c.peak.price)),
      note: "Buy prior bear low → hold to cycle peak",
    },
    {
      label: "Halving day",
      helpKey: "vc-roi-halving",
      vals: vcCycles.map((c) => roi(c.halving.price, c.peak.price)),
      note: "Buy halvings day → hold to cycle peak",
    },
    {
      label: "+200d after halvings",
      helpKey: "vc-roi-200d",
      vals: vcCycles.map((c) => {
        const entry = vcPriceAtOffset(c.halving.date, 200);
        return roi(entry, c.peak.price);
      }),
      note: "Entry ~200d after halvings → peak",
    },
    {
      label: "+400d after halvings",
      helpKey: "vc-roi-400d",
      vals: vcCycles.map((c) => {
        const entry = vcPriceAtOffset(c.halving.date, 400);
        return roi(entry, c.peak.price);
      }),
      note: "Entry ~400d after halvings → peak",
    },
    {
      label: "Buy previous top",
      helpKey: "vc-roi-prev-top",
      vals: vcCycles.map((c, idx) => {
        if (idx === 0) return null;
        return roi(vcCycles[idx - 1].peak.price, c.peak.price);
      }),
      note: "Prior cycle ATH → next cycle ATH",
    },
  ];

  const c4 = vcCycles.find((c) => c.current);
  const c4NowFromH = c4 ? roi(c4.halving.price, vcRef.currentPrice) : null;
  const c4NowFromBot = c4 ? roi(c4.priorBottom.price, vcRef.currentPrice) : null;

  host.innerHTML = `
    <table class="deriv-table md-table vc-table">
      <thead>
        <tr>
          <th>Entry rule</th>
          <th class="mono">Cycle 1</th>
          <th class="mono">Cycle 2</th>
          <th class="mono">Cycle 3</th>
          <th class="mono">Cycle 4</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const cells = row.vals
              .map((v, i) => {
                if (v == null) return `<td class="mono">—</td>`;
                let extra = "";
                if (i === 3 && row.label === "Halving day" && c4NowFromH != null) {
                  extra = `<div class="vc-cell-note">to now ${vcFmtPct(c4NowFromH, true)}</div>`;
                }
                if (i === 3 && row.label === "Prior cycle bottom" && c4NowFromBot != null) {
                  extra = `<div class="vc-cell-note">to now ${vcFmtPct(c4NowFromBot, true)}</div>`;
                }
                const cls = v >= 0 ? "positive" : "negative";
                return `<td class="mono ${cls}">${vcFmtPct(v, true)}${extra}</td>`;
              })
              .join("");
            return `<tr>
              <td><strong data-help-key="${row.helpKey}">${row.label}</strong><div class="vc-row-note">${row.note}</div></td>
              ${cells}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <p class="vc-note">Cycle 4 main columns = return to cycle peak (${vcFmtDate(vcRef.cycleAthDate)} · ${vcFmtUsd(vcRef.cycleAthPrice)}); “to now” = ${vcFmtUsd(vcRef.currentPrice)} as of ${vcRef.asOfLabel}.</p>
  `;
}

function vcRenderProjection() {
  const host = vcEl("vc-projection");
  if (!host || !vcRef) return;
  const days = vcDaysFrom(vcRef.cycleAthDate);
  const avg = vcRef.avgPeakToBottomDays;
  const [lo, hi] = vcRef.peakToBottomRange;
  const pct = Math.min(100, Math.round((days / avg) * 100));
  const dateLo = vcAddDays(vcRef.cycleAthDate, lo);
  const dateHi = vcAddDays(vcRef.cycleAthDate, hi);
  const dateAvg = vcAddDays(vcRef.cycleAthDate, avg);

  host.innerHTML = `
    <div class="vc-progress-block">
      <div class="vc-progress-meta">
        <span data-help-key="vc-progress">Peak → bottom progress (vs ${avg}d average)</span>
        <span class="mono">${days} / ${avg} days · ${pct}%</span>
      </div>
      <div class="vc-progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Peak to bottom time progress">
        <div class="vc-progress-fill" style="width:${pct}%"></div>
      </div>
      <p class="vc-note">C1–C3 peak→bottom: <strong>${lo}–${hi} days</strong> (avg ${avg}). From the ${vcFmtDate(vcRef.cycleAthDate)} ATH that maps to <strong>${vcFmtDate(dateLo)}</strong> → <strong>${vcFmtDate(dateHi)}</strong> (avg ~${vcFmtDate(dateAvg)}).</p>
    </div>
    <div class="deriv-table-wrap md-table-wrap">
      <table class="deriv-table md-table vc-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th class="mono">Value</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-help-key="vc-stat-days-peak">Days since cycle ATH</td>
            <td class="mono">${days}</td>
            <td>${vcFmtDate(vcRef.cycleAthDate)} → ${vcRef.asOfLabel}</td>
          </tr>
          <tr>
            <td data-help-key="vc-stat-avg-p2b">Avg peak → bottom (C1–C3)</td>
            <td class="mono">${avg}d</td>
            <td>Range ${lo}–${hi}d</td>
          </tr>
          <tr>
            <td data-help-key="vc-projection">Implied bottom (avg)</td>
            <td class="mono">${vcFmtDate(dateAvg)}</td>
            <td>ATH + ${avg}d</td>
          </tr>
          <tr>
            <td data-help-key="vc-projection">Implied bottom window</td>
            <td class="mono">${vcFmtDate(dateLo)} – ${vcFmtDate(dateHi)}</td>
            <td>Historical min–max duration</td>
          </tr>
          <tr>
            <td data-help-key="vc-stat-h-to-peak">Avg halvings → peak (C1–C3)</td>
            <td class="mono">${vcRef.avgHalvingToPeakDays}d</td>
            <td>C4 peaked ~${vcDaysBetween(vcRef.lastHalving, vcRef.cycleAthDate)}d after H4</td>
          </tr>
          <tr>
            <td data-help-key="vc-stat-b2nh">Avg bottom → next halvings</td>
            <td class="mono">${vcRef.avgBottomToNextHalvingDays}d</td>
            <td>Secondary cycle-phase reference</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

/** Fetch a BTC metric series from the same misc/btc API as Indicators. */
async function vcFetchMetricSeries(indicator, timespan = "4years") {
  const url = `/api/misc/btc/series?indicator=${encodeURIComponent(indicator)}&timespan=${encodeURIComponent(timespan)}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `metric ${indicator} ${res.status}`);
  const series = (data.series || [])
    .map((p) => ({
      date: p.date || (p.timestamp != null ? vcDateStr(Number(p.timestamp) * 1000) : null),
      value: Number(p.value),
    }))
    .filter((p) => p.date && Number.isFinite(p.value));
  return { series, source: data.source, unit: data.unit, latest: data.latest };
}

function vcSeriesValueNear(series, dateStr, maxDays = 7) {
  if (!series?.length || !dateStr) return null;
  const t = vcParseDate(dateStr);
  let best = null;
  let bestAbs = Infinity;
  for (const p of series) {
    const dt = Math.abs(vcParseDate(p.date) - t);
    if (dt < bestAbs) {
      bestAbs = dt;
      best = p;
    }
  }
  if (!best || bestAbs > maxDays * 86400000) return null;
  return best;
}

function vcFmtZoneVal(key, v) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (key === "nupl") return v.toFixed(2);
  if (key === "mvrv" || key === "puell_multiple") return v.toFixed(2) + "×";
  if (key === "mvrv_z_score") return v.toFixed(2) + "σ";
  if (key === "realized_premium") return (v >= 0 ? "+" : "") + (v * 100).toFixed(0) + "%";
  if (key === "spot_vs_realized") return v.toFixed(2) + "×";
  return v.toFixed(2);
}

function vcZoneLabel(key, v) {
  if (v == null || !Number.isFinite(v)) return "";
  if (key === "mvrv_z_score") {
    if (v >= 7) return "euphoria";
    if (v >= 3) return "elevated";
    if (v >= 1) return "mid";
    if (v >= 0) return "cool";
    return "deep value";
  }
  if (key === "nupl") {
    if (v >= 0.75) return "euphoria";
    if (v >= 0.5) return "belief / greed";
    if (v >= 0.25) return "optimism";
    if (v >= 0) return "hope / fear";
    return "capitulation";
  }
  if (key === "mvrv" || key === "spot_vs_realized") {
    if (v >= 3.5) return "rich";
    if (v >= 2) return "elevated";
    if (v >= 1) return "above cost";
    return "below cost";
  }
  if (key === "puell_multiple") {
    if (v >= 4) return "miner euphoria";
    if (v >= 1.5) return "elevated";
    if (v >= 0.5) return "neutral";
    return "miner stress";
  }
  return "";
}

function vcZoneCell(key, point) {
  if (!point || !Number.isFinite(point.value)) {
    return `<td class="mono">—</td>`;
  }
  const zone = vcZoneLabel(key, point.value);
  return `<td class="mono">
    <strong>${vcFmtZoneVal(key, point.value)}</strong>
    ${zone ? `<div class="vc-cell-note">${zone} · ${vcFmtDate(point.date)}</div>` : `<div class="vc-cell-note">${vcFmtDate(point.date)}</div>`}
  </td>`;
}

async function vcLoadValuationMetrics() {
  const keys = ["mvrv_z_score", "nupl", "mvrv", "realized_price", "puell_multiple"];
  const out = {};
  await Promise.all(
    keys.map(async (k) => {
      try {
        out[k] = await vcFetchMetricSeries(k, "4years");
      } catch (err) {
        console.warn("[4y-cycle] metric", k, err);
        out[k] = { series: [], error: err.message };
      }
    })
  );
  return out;
}

function vcRenderValuationZones(metrics = null) {
  const host = vcEl("vc-valuation-zones");
  if (!host || !vcRef) return;

  const c4 = vcCycles.find((c) => c.current);
  const peakDate = c4?.peak?.date || vcRef.cycleAthDate;
  const nowDate = vcRef.asOf;

  const pick = (key) => {
    const s = metrics?.[key]?.series;
    if (!s?.length) return { peak: null, now: null, source: metrics?.[key]?.source };
    return {
      peak: vcSeriesValueNear(s, peakDate),
      now: vcSeriesValueNear(s, nowDate) || (s.length ? s[s.length - 1] : null),
      source: metrics?.[key]?.source,
    };
  };

  const mvrvZ = pick("mvrv_z_score");
  const nupl = pick("nupl");
  const mvrv = pick("mvrv");
  const realized = pick("realized_price");
  const puell = pick("puell_multiple");

  // Spot / realized at peak and now from price series + realized_price series
  const spotPeak = c4?.peak?.price ?? vcPriceOn(peakDate);
  const spotNow = vcRef.currentPrice;
  const realPeak = realized.peak?.value;
  const realNow = realized.now?.value;
  const premPeak =
    spotPeak != null && realPeak > 0
      ? { value: spotPeak / realPeak, date: realized.peak?.date || peakDate }
      : null;
  const premNow =
    spotNow != null && realNow > 0
      ? { value: spotNow / realNow, date: realized.now?.date || nowDate }
      : null;

  const hasNums = !!(
    mvrvZ.now ||
    nupl.now ||
    mvrv.now ||
    premNow ||
    puell.now
  );

  const rows = [
    {
      metric: "MVRV Z-Score",
      helpKey: "vc-mvrv-z",
      key: "mvrv_z_score",
      histTop: ">7σ typical euphoria",
      histBot: "<0σ deep value",
      peak: mvrvZ.peak,
      now: mvrvZ.now,
    },
    {
      metric: "NUPL",
      helpKey: "vc-nupl-zone",
      key: "nupl",
      histTop: ">0.75 euphoria",
      histBot: "<0 capitulation",
      peak: nupl.peak,
      now: nupl.now,
    },
    {
      metric: "MVRV",
      helpKey: "vc-mvrv-z",
      key: "mvrv",
      histTop: ">3.5× rich",
      histBot: "<1× below cost",
      peak: mvrv.peak,
      now: mvrv.now,
    },
    {
      metric: "Spot / realized",
      helpKey: "vc-realized",
      key: "spot_vs_realized",
      histTop: "Wide premium to realized",
      histBot: "≤1× at deep bottoms",
      peak: premPeak,
      now: premNow,
    },
    {
      metric: "Puell Multiple",
      helpKey: "vc-puell-zone",
      key: "puell_multiple",
      histTop: ">4 miner euphoria",
      histBot: "<0.5 miner stress",
      peak: puell.peak,
      now: puell.now,
    },
  ];

  const sources = [
    mvrvZ.source,
    nupl.source,
    mvrv.source,
    realized.source,
    puell.source,
  ]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

  host.innerHTML = `
    <table class="deriv-table md-table vc-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Historical extremes</th>
          <th class="mono">At cycle peak</th>
          <th class="mono">Now</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
          <td><strong data-help-key="${r.helpKey}">${r.metric}</strong>
            <div class="vc-cell-note">${r.histBot}</div>
          </td>
          <td>${r.histTop}</td>
          ${vcZoneCell(r.key, r.peak)}
          ${vcZoneCell(r.key, r.now)}
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="vc-note">${
      hasNums
        ? `Values from on-chain series (${sources.join(" · ") || "Indicators store"}). Peak column uses nearest print to the Cycle 4 top (${vcFmtDate(peakDate)}); Now uses as-of ${vcFmtDate(nowDate)}. Series coverage is typically ~4y — pre-window tops fall back to “—”. Full charts under Valuation → Indicators.`
        : `Loading on-chain series… If values stay blank, open Valuation → Indicators once to warm the store, or check the server metric API.`
    }</p>
  `;
}

/** Percentile of a sorted ascending array (p in 0–100). */
function vcPercentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Power-law corridor aligned with Stats → Power Law (Santostasi PLT):
 * Price = A × (days since Genesis)^n, A = 10^-16.493, n = 5.68.
 * Support/resistance multipliers from historical close/fair quantiles on this series.
 */
function vcPowerLawCorridor(slice) {
  const genesis = vcParseDate(VC_GENESIS);
  // Same published constants as stats.js PL_A / PL_N
  const A = Math.pow(10, -16.493);
  const n = 5.68;

  const points = [];
  const ratios = [];
  for (const d of slice) {
    const days = Math.max(1, (d.t - genesis) / 86400000);
    const fair = A * Math.pow(days, n);
    if (!(fair > 0) || !(d.close > 0)) continue;
    const ratio = d.close / fair;
    if (Number.isFinite(ratio) && ratio > 0) ratios.push(ratio);
    points.push({ date: d.date, t: d.t, close: d.close, fair, days });
  }

  ratios.sort((a, b) => a - b);
  // Match stats.js style: empirical support / resistance envelope around fair value
  let supportMult = vcPercentile(ratios, 10);
  let resistMult = vcPercentile(ratios, 90);
  if (supportMult == null || resistMult == null) {
    supportMult = 0.4;
    resistMult = 1.5;
  }
  supportMult = Math.max(0.2, Math.min(0.7, supportMult));
  resistMult = Math.max(1.4, Math.min(5, resistMult));

  // OLS fit on log(price) ~ log(A) + n*log(days) for R² readout (optional annotation)
  let fitN = n;
  let fitA = A;
  let r2 = 0;
  if (points.length > 10) {
    const xs = points.map((p) => Math.log(p.days));
    const ys = points.map((p) => Math.log(p.close));
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    if (den > 0) {
      fitN = num / den;
      fitA = Math.exp(my - fitN * mx);
      const ssRes = ys.reduce(
        (s, y, i) => s + (y - (Math.log(fitA) + fitN * xs[i])) ** 2,
        0
      );
      const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
      r2 = ssTot ? 1 - ssRes / ssTot : 0;
    }
  }

  return {
    points: points.map((p) => ({
      date: p.date,
      close: p.close,
      fair: p.fair,
      support: p.fair * supportMult,
      resistance: p.fair * resistMult,
    })),
    supportMult,
    resistMult,
    A,
    n,
    fitA,
    fitN,
    r2,
  };
}

/** Keep key event dates in a downsampled path so markers sit on the line. */
function vcDownsampleKeepDates(points, maxPts, keepDates) {
  if (!points.length) return points;
  const keep = new Set((keepDates || []).filter(Boolean));
  const forced = points.filter((p) => keep.has(p.date));
  const base = vcDownsample(points, Math.max(40, maxPts - forced.length));
  const byDate = new Map();
  for (const p of base) byDate.set(p.date, p);
  for (const p of forced) byDate.set(p.date, p);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function vcRenderRainbow() {
  const el = vcEl("vc-chart-rainbow");
  if (!el || !window.Plotly || !vcSeries.length || !vcRef) return;

  // Full daily series for fit quantiles; downsample only for drawing
  const slice = vcSlice("2011-01-01", vcRef.asOf);
  if (slice.length < 30) return;

  const corridor = vcPowerLawCorridor(slice);

  const peakMarks = vcCycles.map((c) => ({
    date: c.peak.date,
    price: c.peak.price,
    label: `${c.label} top`,
  }));
  const bottomMarks = vcCycles
    .filter((c) => c.bottom)
    .map((c) => ({
      date: c.bottom.date,
      price: c.bottom.price,
      label: `${c.label} bottom`,
    }));
  const asOfMark = { date: vcRef.asOf, price: vcRef.currentPrice, label: "As-of" };

  const keepDates = [
    ...peakMarks.map((m) => m.date),
    ...bottomMarks.map((m) => m.date),
    asOfMark.date,
  ];
  const ds = vcDownsampleKeepDates(corridor.points, 500, keepDates);

  const xs = ds.map((p) => p.date);
  const price = ds.map((p) => p.close);
  const fair = ds.map((p) => p.fair);
  const support = ds.map((p) => p.support);
  const resistance = ds.map((p) => p.resistance);

  const last = corridor.points[corridor.points.length - 1];
  const ratio = last.close / last.fair;
  const ratioPct = (ratio - 1) * 100;

  const traces = [
    {
      x: xs,
      y: support,
      name: `Support (p10 · ${corridor.supportMult.toFixed(2)}× fair)`,
      type: "scatter",
      mode: "lines",
      line: { color: "rgba(14,203,129,0.75)", width: 1.4, dash: "dot" },
      hovertemplate: "%{x}<br>Support %{y:$,.0f}<extra></extra>",
    },
    {
      x: xs,
      y: resistance,
      name: `Resistance (p90 · ${corridor.resistMult.toFixed(2)}× fair)`,
      type: "scatter",
      mode: "lines",
      line: { color: "rgba(246,70,93,0.7)", width: 1.4, dash: "dot" },
      fill: "tonexty",
      fillcolor: "rgba(148,163,184,0.08)",
      hovertemplate: "%{x}<br>Resistance %{y:$,.0f}<extra></extra>",
    },
    {
      x: xs,
      y: fair,
      name: "Power-law fair (Santostasi PLT)",
      type: "scatter",
      mode: "lines",
      line: { color: "rgba(148,163,184,0.9)", width: 1.8 },
      hovertemplate: "%{x}<br>Fair %{y:$,.0f}<extra></extra>",
    },
    {
      x: xs,
      y: price,
      name: "BTC close",
      type: "scatter",
      mode: "lines",
      line: { color: "#f0b90b", width: 2.2 },
      hovertemplate: "%{x}<br>%{y:$,.0f}<extra>Close</extra>",
    },
    {
      x: peakMarks.map((m) => m.date),
      y: peakMarks.map((m) => m.price),
      text: peakMarks.map((m) => m.label),
      name: "Cycle tops",
      type: "scatter",
      mode: "markers",
      marker: {
        size: 11,
        color: "#0ecb81",
        symbol: "triangle-up",
        line: { width: 1.5, color: "#0b0e11" },
      },
      hovertemplate: "%{text}<br>%{x}<br>%{y:$,.0f}<extra>Cycle top</extra>",
    },
    {
      x: bottomMarks.map((m) => m.date),
      y: bottomMarks.map((m) => m.price),
      text: bottomMarks.map((m) => m.label),
      name: "Cycle bottoms",
      type: "scatter",
      mode: "markers",
      marker: {
        size: 10,
        color: "#f6465d",
        symbol: "triangle-down",
        line: { width: 1.5, color: "#0b0e11" },
      },
      hovertemplate: "%{text}<br>%{x}<br>%{y:$,.0f}<extra>Cycle bottom</extra>",
    },
    {
      x: [asOfMark.date],
      y: [asOfMark.price],
      name: "As-of",
      type: "scatter",
      mode: "markers",
      marker: {
        size: 11,
        color: "#38bdf8",
        symbol: "circle",
        line: { width: 1.5, color: "#0b0e11" },
      },
      hovertemplate: `As-of<br>%{x}<br>%{y:$,.0f}<extra></extra>`,
    },
  ];

  const layout = vcPlotLayout({
    logY: true,
    xTitle: "Time",
    yTitle: "BTC price (log)",
    height: 440,
  });
  layout.xaxis.type = "date";
  // Legend below plot — avoids collision with formula strip
  layout.legend = {
    orientation: "h",
    y: -0.18,
    x: 0,
    xanchor: "left",
    yanchor: "top",
    font: { size: 10, color: "#94a3b8" },
    bgcolor: "rgba(0,0,0,0)",
  };
  layout.margin = { l: 56, r: 24, t: 20, b: 88 };
  layout.annotations = [];

  Plotly.react(el, traces, layout, VC_PLOTLY);

  const note = el.closest("section")?.querySelector(".vc-note");
  if (note) {
    const topList = peakMarks
      .map((m) => `${m.label} ${vcFmtDate(m.date)} ${vcFmtUsd(m.price)}`)
      .join(" · ");
    note.innerHTML =
      `<strong>Fair = A·tⁿ</strong> (Santostasi PLT, same as Stats → Power Law) · ` +
      `A=${corridor.A.toExponential(2)} · n=${corridor.n.toFixed(2)} · ` +
      `spot/fair <strong>${ratio.toFixed(2)}×</strong> (${ratioPct >= 0 ? "+" : ""}${ratioPct.toFixed(0)}%) · ` +
      `sample R² ${(corridor.r2 * 100).toFixed(1)}%.<br>` +
      `Gold line = close · grey = fair · green/red dashes = p10/p90 close÷fair corridor · ` +
      `▲ green cycle tops · ▼ red cycle bottoms · blue = as-of.<br>` +
      `<span class="vc-row-note">Tops: ${topList || "—"}</span>`;
  }
}

function vcRenderS2FPi() {
  const host = vcEl("vc-s2f-pi");
  if (!host || !vcRef) return;
  host.innerHTML = `
    <div class="vc-two-col">
      <article class="panel vc-inner-panel">
        <div class="panel-header">
          <h2 data-help-key="vc-s2f">Stock-to-Flow (S2F)</h2>
          <span class="panel-meta">Narrative · not a sole timer</span>
        </div>
        <div class="vc-prose">
          <p><strong>What it is:</strong> S2F = circulating supply ÷ annual new issuance. Each halvings cuts issuance ~50% and roughly doubles S2F.</p>
          <p><strong>Why people use it:</strong> Rules-based scarcity story tied to the protocol schedule.</p>
          <p><strong>Limits:</strong> Parameter-sensitive as a price model; demand (ETFs, liquidity, rates) often dominates issuance math. Context, not a target engine.</p>
          <p class="vc-note">Post-2024 issuance is already low vs stock; further halvings have smaller absolute supply impact.</p>
        </div>
      </article>
      <article class="panel vc-inner-panel">
        <div class="panel-header">
          <h2 data-help-key="vc-pi-cycle">Pi Cycle Top</h2>
          <span class="panel-meta">111-DMA vs 2× 350-DMA</span>
        </div>
        <div class="vc-prose">
          <p>When the <strong>111-day MA</strong> crosses above <strong>2 × 350-day MA</strong>, prior cycles often sat near major tops. Regime flag, not a guaranteed high. Full Pi series is available under Valuation → Indicators (valuation models).</p>
          <p class="vc-note">As of ${vcRef.asOfLabel}: ${vcFmtUsd(vcRef.currentPrice)} vs cycle ATH ${vcFmtUsd(vcRef.cycleAthPrice)} (${vcFmtPct(-((vcRef.cycleAthPrice - vcRef.currentPrice) / vcRef.cycleAthPrice) * 100, true)}). Pair Pi with drawdown phase and on-chain distribution.</p>
        </div>
      </article>
    </div>
  `;
}

function vcRenderPhases() {
  const host = vcEl("vc-phases");
  if (!host || !vcRef) return;
  const daysSincePeak = vcDaysFrom(vcRef.cycleAthDate);
  const dd = ((vcRef.cycleAthPrice - vcRef.currentPrice) / vcRef.cycleAthPrice) * 100;
  const phases = [
    {
      helpKey: "vc-phase-acc",
      title: "1 · Accumulation",
      body: "Post-capitulation basing. Long-term holders absorb supply; value metrics often deep. Hardest phase to buy emotionally.",
      active: false,
    },
    {
      helpKey: "vc-phase-markup",
      title: "2 · Markup",
      body: "Sustained advance from the cycle low through halvings into broader participation. Higher highs dominate.",
      active: false,
    },
    {
      helpKey: "vc-phase-dist",
      title: "3 · Distribution / Euphoria",
      body: "Late-cycle heat and tops. Ends at the cycle ATH measured on the daily series.",
      active: false,
    },
    {
      helpKey: "vc-phase-mark",
      title: "4 · Markdown",
      body: `Post-ATH decline. Currently active: ${vcFmtPct(-dd, true)} from ${vcFmtDate(vcRef.cycleAthDate)} ATH after ${daysSincePeak} days (as of ${vcRef.asOfLabel}).`,
      active: true,
    },
  ];
  host.innerHTML = phases
    .map(
      (p) => `
    <article class="vc-phase-card ${p.active ? "vc-phase-card--active" : ""}">
      <h3><span data-help-key="${p.helpKey}">${p.title}</span>${p.active ? ' <span class="vc-phase-badge">Current</span>' : ""}</h3>
      <p>${p.body}</p>
    </article>`
    )
    .join("");
}

function vcRenderFullStats() {
  const host = vcEl("vc-full-stats");
  if (!host || !vcCycles.length) return;

  const rows = vcCycles.map((c) => {
    const hToPeak = vcDaysBetween(c.halving.date, c.peak.date);
    const peakMult = c.peak.price / c.halving.price;
    const endPrice = c.bottom ? c.bottom.price : c.now?.price || vcRef.currentPrice;
    const maxDd = ((c.peak.price - endPrice) / c.peak.price) * 100;
    const p2b = c.bottom
      ? vcDaysBetween(c.peak.date, c.bottom.date)
      : vcDaysBetween(c.peak.date, vcRef.asOf);
    const idx = vcCycles.indexOf(c);
    const next = vcCycles[idx + 1];
    const botToNextH =
      c.bottom && next ? String(vcDaysBetween(c.bottom.date, next.halving.date)) : "—";
    return {
      label: c.label,
      hDate: vcFmtDate(c.halving.date),
      hPrice: vcFmtUsd(c.halving.price),
      peakDate: vcFmtDate(c.peak.date),
      peakPrice: vcFmtUsd(c.peak.price),
      botDate: c.bottom ? vcFmtDate(c.bottom.date) : "Open",
      botPrice: c.bottom
        ? vcFmtUsd(c.bottom.price)
        : vcFmtUsd(c.now?.price) + " (now)",
      hToPeak: String(hToPeak),
      peakMult: vcFmtMult(peakMult),
      maxDd: vcFmtPct(-maxDd, true),
      p2b: c.bottom ? String(p2b) : `${p2b} (so far)`,
      botToNextH,
    };
  });

  const closed = vcCycles.filter((c) => !c.partial && c.bottom);
  const avg = (fn) => {
    const vals = closed.map(fn);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const avgRow = {
    label: "Avg C1–C3",
    hDate: "—",
    hPrice: "—",
    peakDate: "—",
    peakPrice: "—",
    botDate: "—",
    botPrice: "—",
    hToPeak: String(Math.round(avg((c) => vcDaysBetween(c.halving.date, c.peak.date)))),
    peakMult: vcFmtMult(avg((c) => c.peak.price / c.halving.price)),
    maxDd: vcFmtPct(
      -avg((c) => ((c.peak.price - c.bottom.price) / c.peak.price) * 100),
      true
    ),
    p2b: String(Math.round(avg((c) => vcDaysBetween(c.peak.date, c.bottom.date)))),
    botToNextH: String(
      Math.round(
        avg((c) => {
          const next = vcCycles[vcCycles.indexOf(c) + 1];
          return vcDaysBetween(c.bottom.date, next.halving.date);
        })
      )
    ),
  };

  const all = [...rows, avgRow];
  host.innerHTML = `
    <table class="deriv-table md-table vc-table vc-table--compact">
      <thead>
        <tr>
          <th>Cycle</th>
          <th>Halvings</th>
          <th class="mono">H price</th>
          <th>Peak</th>
          <th class="mono">Peak $</th>
          <th>Bottom</th>
          <th class="mono">Bottom $</th>
          <th class="mono" data-help-key="vc-stat-h-to-peak">H→Peak d</th>
          <th class="mono" data-help-key="vc-stat-peak-mult">Peak ×H</th>
          <th class="mono" data-help-key="vc-stat-max-dd">Max DD</th>
          <th class="mono" data-help-key="vc-stat-p2b">Peak→Bot d</th>
          <th class="mono" data-help-key="vc-stat-b2nh">Bot→Next H</th>
        </tr>
      </thead>
      <tbody>
        ${all
          .map(
            (r) => `<tr class="${r.label.startsWith("Avg") ? "vc-row-avg" : ""}">
          <td><strong>${r.label}</strong></td>
          <td>${r.hDate}</td>
          <td class="mono">${r.hPrice}</td>
          <td>${r.peakDate}</td>
          <td class="mono">${r.peakPrice}</td>
          <td>${r.botDate}</td>
          <td class="mono">${r.botPrice}</td>
          <td class="mono">${r.hToPeak}</td>
          <td class="mono">${r.peakMult}</td>
          <td class="mono negative">${r.maxDd}</td>
          <td class="mono">${r.p2b}</td>
          <td class="mono">${r.botToNextH}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="vc-note">Peaks/bottoms = max/min closes between cycle anchors. Cycle 4 bottom open as of ${vcRef.asOfLabel}.</p>
  `;
}

function vcRenderCaveats() {
  const host = vcEl("vc-caveats");
  if (!host) return;
  host.innerHTML = `
    <ul class="vc-caveat-list">
      <li><strong>Tiny sample size.</strong> Only three completed post-2012 halvings cycles — averages of durations and multiples are fragile.</li>
      <li><strong>Amplitude is changing.</strong> ETF / institutional flows, stablecoin liquidity, and macro rates can dominate pure issuance narratives.</li>
      <li><strong>Liquidity regimes matter.</strong> Global M2, real yields, and risk appetite can override day-count templates.</li>
      <li><strong>Past ≠ future.</strong> Historical multiples and drawdowns need not repeat.</li>
    </ul>
  `;
}

function vcPickMetricNow(metrics, key) {
  const s = metrics?.[key]?.series;
  if (!s?.length || !vcRef) return null;
  const p = vcSeriesValueNear(s, vcRef.asOf) || s[s.length - 1];
  return p && Number.isFinite(p.value) ? p : null;
}

/**
 * Hybrid executive synthesis for the 4y Cycle tab — same desk-brief shape as other Valuation tabs:
 * intro → cycle phase → evidence → combined posture → price implications → method footer.
 * Returns { html, confidence, confidenceLabel, phase }.
 */
function vcBuildExecutiveSummary(metrics = null) {
  if (!vcRef || !vcCycles.length) {
    return {
      html: "<p>Insufficient cycle data to build a summary.</p>",
      confidence: 0,
      confidenceLabel: "None",
      phase: "—",
    };
  }

  const c4 = vcCycles.find((c) => c.current) || vcCycles[vcCycles.length - 1];
  const closed = vcCycles.filter((c) => !c.partial && c.bottom);
  const daysSinceH = vcDaysFrom(vcRef.lastHalving);
  const daysSincePeak = vcDaysFrom(vcRef.cycleAthDate);
  const dd =
    ((vcRef.cycleAthPrice - vcRef.currentPrice) / vcRef.cycleAthPrice) * 100;
  const avgP2B = vcRef.avgPeakToBottomDays;
  const p2bPct = Math.min(100, Math.round((daysSincePeak / avgP2B) * 100));
  const [lo, hi] = vcRef.peakToBottomRange || [363, 410];
  const daysToNextH = Math.max(0, vcDaysBetween(vcRef.asOf, vcRef.nextHalvingEst));

  const avgMaxDd =
    closed.length > 0
      ? closed.reduce(
          (s, c) => s + ((c.peak.price - c.bottom.price) / c.peak.price) * 100,
          0
        ) / closed.length
      : 80;

  const mvrvZ = vcPickMetricNow(metrics, "mvrv_z_score");
  const nupl = vcPickMetricNow(metrics, "nupl");
  const mvrv = vcPickMetricNow(metrics, "mvrv");
  const puell = vcPickMetricNow(metrics, "puell_multiple");
  const realized = vcPickMetricNow(metrics, "realized_price");
  const spotReal =
    realized && realized.value > 0 && vcRef.currentPrice
      ? vcRef.currentPrice / realized.value
      : null;

  // --- Phase call ---
  let phase = "Markdown";
  let phaseBlurb =
    "Post-ATH decline is the dominant regime: price is below the cycle high with peak-to-bottom time still open.";
  let phaseExplain =
    "Markdown regimes describe the period after a cycle high when residual distribution and time can still do damage. "
    + "Prior cycles eventually recovered, but depth and duration varied widely — day-count alone is not a bottom timer.";
  if (dd < 12 && daysSincePeak < 45) {
    phase = "Late distribution / early markdown";
    phaseBlurb =
      "Only a shallow drawdown so far after the cycle high — distribution may still be resolving into a fuller markdown.";
    phaseExplain =
      "Early after an ATH, shallow drawdowns often still sit in distribution: holders remain profitable and supply can meet demand on rallies. "
      + "Historical full-cycle bears typically went deeper and/or longer before durable accumulation.";
  } else if (dd >= avgMaxDd * 0.85 && p2bPct >= 90) {
    phase = "Late markdown / early accumulation watch";
    phaseBlurb =
      "Drawdown depth and calendar progress both approach historical full-bear norms — conditions where prior cycles often transitioned toward accumulation, though confirmation still requires a durable low.";
    phaseExplain =
      "When both depth and time approach prior peak→bottom norms, multi-quarter forward risk/reward has often improved — "
      + "but that is a regime statement. A durable low still needs confirmation from price structure and capital flows.";
  }

  // --- On-chain cooling ---
  const onchainBits = [];
  if (mvrvZ) onchainBits.push(`MVRV Z ${mvrvZ.value.toFixed(2)}σ`);
  if (nupl) onchainBits.push(`NUPL ${nupl.value.toFixed(2)}`);
  if (mvrv) onchainBits.push(`MVRV ${mvrv.value.toFixed(2)}×`);
  if (spotReal) onchainBits.push(`spot/realized ${spotReal.toFixed(2)}×`);
  if (puell) onchainBits.push(`Puell ${puell.value.toFixed(2)}×`);

  let onchainRead =
    "On-chain valuation prints for this cycle window are limited or still loading from the series store.";
  let valuationPosture = "incomplete valuation evidence";
  if (mvrvZ || nupl || mvrv) {
    const hot =
      (mvrvZ && mvrvZ.value >= 3) ||
      (nupl && nupl.value >= 0.5) ||
      (mvrv && mvrv.value >= 2.5);
    const cold =
      (mvrvZ && mvrvZ.value < 0.5) ||
      (nupl && nupl.value < 0.25) ||
      (mvrv && mvrv.value < 1.2);
    if (hot) {
      valuationPosture = "valuation still relatively elevated versus deep-bear prints";
      onchainRead =
        `Valuation metrics remain relatively elevated (${onchainBits.join(", ")}) versus deep-bear history. `
        + "Cooling from the cycle top is incomplete: many holders still sit on gains, so rallies can still meet supply.";
    } else if (cold) {
      valuationPosture = "valuation has cooled toward historically friendlier multi-quarter zones";
      onchainRead =
        `Valuation metrics have cooled materially (${onchainBits.join(", ")}) toward zones that have historically improved multi-quarter risk/reward. `
        + "Not every deep-value band is necessarily tagged — treat this as constructive context, not a precise bottom clock.";
    } else {
      valuationPosture = "mid-range post-top valuation (neither euphoria nor classic capitulation)";
      onchainRead =
        `Valuation metrics sit in a mid-range post-top regime (${onchainBits.join(", ")}) — neither euphoria nor classic capitulation. `
        + "The price path can still chop while the market works through residual distribution.";
    }
  }

  // --- Overlay / structure ---
  const hToPeakC4 = vcDaysBetween(c4.halving.date, c4.peak.date);
  const peakMultC4 = c4.peak.price / c4.halving.price;
  const avgHToPeak = vcRef.avgHalvingToPeakDays;
  const structureRead =
    `Cycle 4 peaked ${hToPeakC4} days after the ${vcFmtDate(c4.halving.date)} halvings at ${vcFmtMult(peakMultC4)} the halvings-day close `
    + `(C1–C3 average halvings→peak ≈ ${avgHToPeak} days). From the ATH of ${vcFmtUsd(vcRef.cycleAthPrice)} on ${vcFmtDate(vcRef.cycleAthDate)}, `
    + `spot is ${vcFmtUsd(vcRef.currentPrice)} — a ${vcFmtPct(-dd, true)} drawdown over ${daysSincePeak} days `
    + `(${p2bPct}% of the ${avgP2B}-day average peak→bottom window; historical range ${lo}–${hi} days). `
    + `As of ${vcRef.asOfLabel}, the market is ${daysSinceH} days after the last halvings, with roughly ${daysToNextH} days to the next estimated halvings (${vcFmtDate(vcRef.nextHalvingEst)}).`;

  // --- Forward BTC price framing ---
  let forward =
    "Base case while markdown remains open: path-dependent chop with elevated downside risk versus the cycle high until a durable low forms. "
    + "Prior cycles eventually delivered large recoveries from full bears, but timing and depth varied widely.";
  let combinedPosture = "markdown open — residual downside and time risk remain live";
  if (dd < 25) {
    combinedPosture = "early/shallow markdown — historical path often included further depth or duration";
    forward =
      "With drawdown still modest versus historical full-cycle maxes (~"
      + vcFmtPct(-avgMaxDd, true)
      + " average C1–C3 peak-to-trough), the historical path of least resistance included further downside or extended time before a final low. "
      + "Sharp upside rallies can still occur as bear-market bounces without ending the markdown phase. "
      + "Liquidity, ETF flows, and exchange inventory will matter more than pure day-count for near-term direction.";
  } else if (dd >= 45 && p2bPct >= 70) {
    combinedPosture = "advanced markdown — multi-quarter risk/reward historically improved once similar conditions matured";
    forward =
      "Calendar progress through the historical peak→bottom window is advanced and drawdown is already severe. "
      + "Forward returns over multi-quarter horizons historically improved once similar conditions matured into accumulation — "
      + "that is a regime statement, not a timing signal for a bottom this week. "
      + `Next halvings is still ~${daysToNextH} days away (${vcFmtDate(vcRef.nextHalvingEst)}), so scarcity is a longer-horizon backdrop rather than a near-term catalyst.`;
  } else if (dd >= 30) {
    combinedPosture = "mid-markdown — contest between residual distribution and early accumulation";
    forward =
      "Mid-markdown: meaningful damage from the ATH is already done, but historical bears often went deeper and/or longer. "
      + "Looking ahead, expect a contest between residual distribution and emerging accumulation — "
      + "spot direction will hinge more on liquidity and capital flows than on day-count alone.";
  }

  // --- Confidence ---
  let confidence = 42; // base: n=3 cycles
  const factors = ["Only three completed post-2012 cycles (fragile averages)"];
  if (vcSeries.length > 2000) {
    confidence += 12;
    factors.push("Long daily price history available for overlays and extrema");
  }
  if (mvrvZ || nupl) {
    confidence += 10;
    factors.push("On-chain valuation series available for peak vs now");
  } else {
    confidence -= 8;
    factors.push("On-chain valuation series missing or incomplete");
  }
  if (daysSincePeak > 30 && dd > 15) {
    confidence += 8;
    factors.push("Markdown regime is clear (time + drawdown from ATH)");
  }
  if (p2bPct > 100) {
    confidence -= 5;
    factors.push("Past average peak→bottom duration — late-sample uncertainty rises");
  }
  confidence = Math.max(15, Math.min(78, confidence));
  let confidenceLabel = "Low";
  if (confidence >= 60) confidenceLabel = "Moderate–high";
  else if (confidence >= 45) confidenceLabel = "Moderate";
  else if (confidence >= 30) confidenceLabel = "Low–moderate";

  const paras = [
    `<p>This 4y Cycle brief is a hybrid synthesis of calendar structure (halvings→peak, peak→bottom windows), `
      + `price-path evidence (drawdown depth and time since ATH), and live valuation prints when available (MVRV, NUPL, Puell, spot/realized). `
      + `It is meant as a desk memo for risk discussion across multi-week to multi-quarter horizons — not a trade ticket.</p>`,

    `<p><strong>Cycle phase — ${phase}</strong> `
      + `(confidence ${confidenceLabel}, ${confidence}/100). ${phaseBlurb} ${phaseExplain}</p>`,

    `<p><strong>Evidence from the cycle path.</strong> ${structureRead} `
      + `Use the halvings and cycle-low overlays above to compare C4’s shape against C1–C3; the drawdown chart shows depth versus prior bears; `
      + `ROI and power-law panels frame historical entry rules and long-run fair-value context.</p>`,

    `<p><strong>Evidence from valuation / on-chain zones.</strong> ${onchainRead}</p>`,

    `<p><strong>Combined posture:</strong> ${combinedPosture}; ${valuationPosture}. `
      + `Confidence drivers: ${factors.join("; ")}. `
      + `A single day-count template should not override multi-lens confirmation from valuation, flows, and liquidity.</p>`,

    `<p><strong>Implications for BTC price</strong> (educational context for risk discussions, not a trade ticket): ${forward}</p>`,

    `<p>Educational synthesis from this page’s cycle clocks and free public valuation series — not financial advice. `
      + `Prefer multi-week evidence over single-day noise. Only three completed post-2012 cycles exist, so averages of duration and multiples are fragile; `
      + `ETF flows, stablecoin liquidity, and macro rates can dominate pure issuance narratives.</p>`,
  ];

  return {
    html: paras.join(""),
    confidence,
    confidenceLabel,
    phase,
  };
}

function vcRenderExecutiveSummary(metrics = null) {
  const host = vcEl("vc-exec-summary");
  const head = vcEl("vc-exec-head");
  const meta = vcEl("vc-exec-meta");
  if (!host) return;

  if (!vcRef) {
    host.innerHTML = `<p class="macro-muted">Load price history to build the executive summary.</p>`;
    return;
  }

  const summary = vcBuildExecutiveSummary(metrics);
  if (head) {
    head.innerHTML = `
      <span class="vc-exec-phase">Phase · ${summary.phase}</span>
      <span class="vc-confidence-pill vc-confidence-pill--${summary.confidenceLabel.toLowerCase().replace(/[^a-z]+/g, "-")}">
        Confidence ${summary.confidenceLabel} (${summary.confidence}/100)
      </span>`;
  }
  if (meta) {
    meta.textContent = `As of ${vcRef.asOfLabel} · hybrid cycle & valuation synthesis · not financial advice`;
  }
  host.innerHTML = summary.html;
}

function vcRenderAllCharts() {
  if (!vcCycles.length) return;
  vcRenderOverlayChart();
  vcRenderBottomChart();
  vcRenderDrawdownChart();
  vcRenderSpiral();
  vcRenderRadar();
  vcRenderRainbow();
}

function vcUpdateMeta() {
  const meta = vcEl("vc-page-meta");
  if (meta && vcRef) {
    meta.style.color = "";
    meta.textContent = `${vcMeta?.pair || "BTC/USD"} · as of ${vcRef.asOfLabel}${vcMeta?.stale ? " · delayed" : ""}`;
  }
  const updated = vcEl("vc-last-updated");
  if (updated && vcRef) {
    updated.textContent = `As of ${vcRef.asOfLabel}`;
  }
  const statusMeta = document.querySelector(
    '#dashboard-valuation .mb-bitcoin-panel[data-mb-sub="4y-cycle"] .vc-status-panel .panel-meta'
  );
  if (statusMeta && vcRef) {
    statusMeta.textContent = `As of ${vcRef.asOfLabel}`;
  }
}

function vcDecorateHelp(root) {
  root?.querySelectorAll("[data-help-key]").forEach((el) => {
    if (el.classList.contains("help-trigger")) return;
    if (!el.querySelector(":scope > .help-trigger")) {
      el.dataset.helpDecorated = "false";
    }
  });
  window.decorateHelpLabels?.(root || document);
}

function vcRenderStaticTables(metrics = null) {
  vcStatusCards();
  vcRenderRoiTable();
  vcRenderProjection();
  vcRenderValuationZones(metrics);
  vcRenderS2FPi();
  vcRenderPhases();
  vcRenderFullStats();
  vcRenderCaveats();
  vcRenderExecutiveSummary(metrics);
  vcUpdateMeta();
}

let vcMetricsCache = null;

async function initValuationCycle(force = false) {
  const screen = document.querySelector(
    '#dashboard-valuation .mb-bitcoin-panel[data-mb-sub="4y-cycle"]'
  );
  if (!screen) return;

  vcSyncToggleButtons();
  vcBindToggles("vc-cycle-toggles", vcRenderAllCharts);
  vcBindToggles("vc-cycle-toggles-bottom", vcRenderAllCharts);
  vcBindToggles("vc-cycle-toggles-dd", vcRenderAllCharts);
  vcBindToggles("vc-cycle-toggles-radar", vcRenderAllCharts);

  if (vcReady && vcSeries.length && !force) {
    vcRenderStaticTables(vcMetricsCache);
    vcDecorateHelp(screen);
    requestAnimationFrame(() => vcRenderAllCharts());
    return;
  }

  if (vcLoading) return;
  vcLoading = true;
  vcShowStatus("Loading…");

  try {
    await vcFetchHistory(force);
    // Render price-driven UI first, then fill valuation numbers
    vcRenderStaticTables(null);
    vcDecorateHelp(screen);
    requestAnimationFrame(() => vcRenderAllCharts());

    vcMetricsCache = await vcLoadValuationMetrics();
    vcRenderValuationZones(vcMetricsCache);
    vcRenderExecutiveSummary(vcMetricsCache);
    vcDecorateHelp(screen);

    vcReady = true;
    vcShowStatus(`${vcMeta?.pair || "BTC/USD"} · as of ${vcRef?.asOfLabel || ""}`);
  } catch (err) {
    console.error("[4y-cycle]", err);
    vcShowStatus(err.message || "Failed to load price history", true);
    const host = vcEl("vc-status-cards");
    if (host) {
      host.innerHTML = `<p class="vc-note" style="padding:1rem">Price history unavailable. ${err.message || ""}</p>`;
    }
  } finally {
    vcLoading = false;
  }
}

window.initValuationCycle = initValuationCycle;
window.loadValuationCycle = initValuationCycle;
