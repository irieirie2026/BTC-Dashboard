/** Markets → Spot price — multi-timeframe + full-history log chart (Binance BTCUSDT) */

const SPOT_SYMBOL = "BTCUSDT";
const SPOT_REST = "https://api.binance.com/api/v3";

const SPOT_TF = {
  "1m": { interval: "1m", limit: 1000, label: "1m", live: true },
  "5m": { interval: "5m", limit: 1000, label: "5m" },
  "1h": { interval: "1h", limit: 1000, label: "1h" },
  "4h": { interval: "4h", limit: 1000, label: "4h" },
  "1d": { interval: "1d", limit: 1000, label: "1D" },
};

let spotActiveTf = "1m";
let spotMainCtrl = null;
let spotBars = [];
let spotMainControlsBound = false;
let spotMainResizeBound = false;
let spotHistoryPoints = [];
let spotHistoryCtrl = null;
let spotHistoryLoaded = false;
let spotHistoryScale = "log";
let spotHistoryRange = "all";
let spotHistoryControlsBound = false;
let spotPollTimer = null;

const spotEl = (id) => document.getElementById(id);

function spotFmtPrice(n) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function spotFmtDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function spotFmtDateTime(ms) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function spotKlineToBar(k) {
  return {
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  };
}

function spotDedupeBars(bars) {
  const byTime = new Map();
  for (const b of bars) {
    if (b?.time && Number.isFinite(b.close)) byTime.set(b.time, b);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function spotFetchKlines(interval, limit = 1000, endTime) {
  const params = new URLSearchParams({
    symbol: SPOT_SYMBOL,
    interval,
    limit: String(Math.min(limit, 1000)),
  });
  if (endTime) params.set("endTime", String(endTime));
  const res = await fetch(`${SPOT_REST}/klines?${params}`);
  if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);
  const raw = await res.json();
  return spotDedupeBars(raw.map(spotKlineToBar));
}

async function spotFetchAllDaily(maxRequests = 20) {
  const chunks = [];
  let endTime;
  for (let i = 0; i < maxRequests; i++) {
    const params = new URLSearchParams({
      symbol: SPOT_SYMBOL,
      interval: "1d",
      limit: "1000",
    });
    if (endTime) params.set("endTime", String(endTime));
    const res = await fetch(`${SPOT_REST}/klines?${params}`);
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    chunks.unshift(...batch);
    endTime = batch[0][0] - 1;
    if (batch.length < 1000) break;
  }
  return spotDedupeBars(chunks.map(spotKlineToBar));
}

function spotMainTimeLabel(bar) {
  const ms = bar.time * 1000;
  return spotActiveTf === "1d" ? spotFmtDate(ms) : spotFmtDateTime(ms);
}

function spotMainAxisTimeLabel(bar, compact) {
  const ms = bar.time * 1000;
  if (spotActiveTf === "1d") return fmtChartDate(ms, compact);
  return fmtChartTime(ms);
}

function spotResetMainView() {
  if (!spotMainCtrl || !spotBars.length) return;
  window.ChartInteraction.resetChartView(spotMainCtrl.state.view);
  spotMainCtrl.requestDraw();
}

function spotMountMainChart() {
  const canvas = spotEl("spot-chart");
  if (!canvas || !window.ChartInteraction || !spotBars.length) return null;

  const pad = { top: 34, right: 16, bottom: 36, left: 62 };

  spotMainCtrl = ChartInteraction.ensure(canvas, {
    pad,
    minWindow: 16,
    maxPoints: 1200,
    getLength: () => spotBars.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const pts = indices.map((i) => spotBars[i]);
      const drawCount = pts.length;
      if (!drawCount) return;

      const minV = Math.min(...pts.map((p) => p.low));
      const maxV = Math.max(...pts.map((p) => p.high));
      const range = maxV - minV || 1;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const y = api.pad.top + (api.chartH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(api.pad.left, y);
        ctx.lineTo(api.pad.left + api.chartW, y);
        ctx.stroke();
      }

      const barW = drawCount > 1 ? api.chartW / drawCount : api.chartW * 0.5;
      const bodyW = Math.max(barW * 0.65, 2);

      pts.forEach((c, i) => {
        const x = api.xAt(i, drawCount);
        const bullish = c.close >= c.open;
        const color = bullish ? "#0ecb81" : "#f6465d";

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yAt(c.high));
        ctx.lineTo(x, yAt(c.low));
        ctx.stroke();

        const yOpen = yAt(c.open);
        const yClose = yAt(c.close);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(Math.abs(yClose - yOpen), 1);
        ctx.fillStyle = color;
        ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      });

      if (api.hoverGlobal != null) {
        const c = spotBars[api.hoverGlobal];
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yAt(c.close), "#f0b90b");
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`$${spotFmtPrice(maxV)}`, api.pad.left - 6, api.pad.top + 10);
      ctx.fillText(`$${spotFmtPrice(minV)}`, api.pad.left - 6, h - api.pad.bottom);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        spotMainAxisTimeLabel(pts[i], drawCount > 80),
      );
    },
    formatTooltip(globalIdx) {
      const b = spotBars[globalIdx];
      return (
        spotHistoryTipTitle(spotMainTimeLabel(b)) +
        spotHistoryTipRow("Open", `$${spotFmtPrice(b.open)}`) +
        spotHistoryTipRow("High", `$${spotFmtPrice(b.high)}`) +
        spotHistoryTipRow("Low", `$${spotFmtPrice(b.low)}`) +
        spotHistoryTipRow("Close", `$${spotFmtPrice(b.close)}`)
      );
    },
  });

  return spotMainCtrl;
}

function spotBindMainControls() {
  if (spotMainControlsBound) return;
  spotMainControlsBound = true;

  document.querySelectorAll(".spot-tf-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tf = btn.dataset.spotTf;
      if (tf) spotLoadTimeframe(tf);
    });
  });

  spotEl("spot-main-reset")?.addEventListener("click", () => {
    spotResetMainView();
  });
}

function spotBindMainResize() {
  if (spotMainResizeBound) return;
  const wrap = document.querySelector(".spot-main-wrap");
  if (!wrap) return;
  spotMainResizeBound = true;
  const ro = new ResizeObserver(() => spotMainCtrl?.requestDraw());
  ro.observe(wrap);
}

function spotFmtPriceCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${spotFmtPrice(v)}`;
}

function spotHistoryTipTitle(date) {
  return `<div class="chart-tooltip-title">${date}</div>`;
}

function spotHistoryTipRow(label, value) {
  return `<div class="chart-tooltip-row"><span>${label}</span><span class="mono">${value}</span></div>`;
}

function spotHistoryYMap(v, minV, maxV, chartH, padTop, logScale) {
  if (logScale) {
    const yMin = Math.max(minV, 1);
    const yMax = Math.max(maxV, yMin * 1.001);
    const span = Math.log10(yMax) - Math.log10(yMin) || 0.001;
    return padTop + chartH - ((Math.log10(v) - Math.log10(yMin)) / span) * chartH;
  }
  const span = maxV - minV || 0.01;
  return padTop + chartH - ((v - minV) / span) * chartH;
}

function spotHistoryFmtAxis(v, logScale) {
  return logScale ? spotFmtPriceCompact(v) : `$${spotFmtPrice(v)}`;
}

function spotSetHistoryRangeActive(range) {
  document.querySelectorAll("[data-spot-range]").forEach((btn) => {
    const active = btn.dataset.spotRange === range;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function spotSetHistoryScaleActive(scale) {
  document.querySelectorAll("[data-spot-scale]").forEach((btn) => {
    const active = btn.dataset.spotScale === scale;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function spotApplyHistoryRange(range) {
  if (!spotHistoryCtrl || !spotHistoryPoints.length) return;
  spotHistoryRange = range;
  spotSetHistoryRangeActive(range);
  const view = spotHistoryCtrl.state.view;
  const len = spotHistoryPoints.length;
  view.length = len;

  if (range === "all") {
    window.ChartInteraction.resetChartView(view);
  } else {
    const years = { "1y": 1, "3y": 3, "5y": 5 }[range] || 1;
    const cutoff = Date.now() - years * 365.25 * 86_400_000;
    let startIdx = spotHistoryPoints.findIndex(
      (p) => new Date(p.date).getTime() >= cutoff,
    );
    if (startIdx < 0) startIdx = 0;
    view.start = startIdx;
    view.end = len - 1;
  }
  spotHistoryCtrl.requestDraw();
  spotUpdateHistoryMeta();
}

function spotMountHistoryChart() {
  const canvas = spotEl("spot-history-chart");
  if (!canvas || !window.ChartInteraction || !spotHistoryPoints.length) return null;

  const pad = { top: 34, right: 16, bottom: 36, left: 62 };
  const lineColor = "#a78bfa";
  const fillColor = "rgba(167, 139, 250, 0.22)";

  spotHistoryCtrl = ChartInteraction.ensure(canvas, {
    pad,
    minWindow: 30,
    maxPoints: 2000,
    getLength: () => spotHistoryPoints.length,
    onDraw(ctx, w, h, api) {
      const logScale = spotHistoryScale === "log";
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const pts = indices.map((i) => spotHistoryPoints[i]);
      const drawCount = pts.length;
      if (!drawCount) return;

      const vals = pts.map((p) => p.close);
      const minV = Math.min(...vals);
      const maxV = Math.max(...vals);

      ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const frac = i / 4;
        const v = logScale
          ? 10 ** (Math.log10(Math.max(minV, 1)) + frac * (Math.log10(Math.max(maxV, minV * 1.001)) - Math.log10(Math.max(minV, 1))))
          : minV + frac * (maxV - minV || 0.01);
        const y = spotHistoryYMap(v, minV, maxV, api.chartH, api.pad.top, logScale);
        ctx.beginPath();
        ctx.moveTo(api.pad.left, y);
        ctx.lineTo(api.pad.left + api.chartW, y);
        ctx.stroke();
      }

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = spotHistoryYMap(v, minV, maxV, api.chartH, api.pad.top, logScale);
        if (i === 0) ctx.moveTo(x, api.pad.top + api.chartH);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(api.pad.left + api.chartW, api.pad.top + api.chartH);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = spotHistoryYMap(v, minV, maxV, api.chartH, api.pad.top, logScale);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      const lastIdx = drawCount - 1;
      const lastX = api.xAt(lastIdx, drawCount);
      const lastY = spotHistoryYMap(
        vals[lastIdx],
        minV,
        maxV,
        api.chartH,
        api.pad.top,
        logScale,
      );
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (api.hoverGlobal != null) {
        const v = spotHistoryPoints[api.hoverGlobal].close;
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(
          api.xAtGlobal(api.hoverGlobal),
          spotHistoryYMap(v, minV, maxV, api.chartH, api.pad.top, logScale),
        );
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(
        spotHistoryFmtAxis(maxV, logScale),
        api.pad.left - 6,
        api.pad.top + 10,
      );
      ctx.fillText(
        spotHistoryFmtAxis(minV, logScale),
        api.pad.left - 6,
        h - api.pad.bottom,
      );
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(pts[i]?.date, drawCount > 120),
      );
    },
    formatTooltip(globalIdx) {
      const pt = spotHistoryPoints[globalIdx];
      return (
        spotHistoryTipTitle(spotFmtDate(new Date(pt.date).getTime())) +
        spotHistoryTipRow("Close", `$${spotFmtPrice(pt.close)}`)
      );
    },
  });

  return spotHistoryCtrl;
}

function spotBindHistoryControls() {
  if (spotHistoryControlsBound) return;
  spotHistoryControlsBound = true;

  document.querySelectorAll("[data-spot-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const range = btn.dataset.spotRange;
      if (range) spotApplyHistoryRange(range);
    });
  });

  document.querySelectorAll("[data-spot-scale]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scale = btn.dataset.spotScale;
      if (!scale || scale === spotHistoryScale) return;
      spotHistoryScale = scale;
      spotSetHistoryScaleActive(scale);
      spotHistoryCtrl?.requestDraw();
      spotUpdateHistoryMeta();
    });
  });

  spotEl("spot-history-reset")?.addEventListener("click", () => {
    spotApplyHistoryRange("all");
  });
}

let spotHistoryResizeBound = false;

function spotBindHistoryResize() {
  if (spotHistoryResizeBound) return;
  const wrap = document.querySelector(".spot-history-wrap");
  if (!wrap) return;
  spotHistoryResizeBound = true;
  const ro = new ResizeObserver(() => spotHistoryCtrl?.requestDraw());
  ro.observe(wrap);
}

function spotUpdateHistoryMeta() {
  const meta = spotEl("spot-history-meta");
  if (!meta || !spotHistoryPoints.length) return;
  const len = spotHistoryPoints.length;
  const view = spotHistoryCtrl?.state?.view;
  const startIdx = view?.start ?? 0;
  const endIdx = view?.end ?? len - 1;
  const first = spotHistoryPoints[startIdx];
  const last = spotHistoryPoints[endIdx];
  const firstMs = new Date(first.date).getTime();
  const lastMs = new Date(last.date).getTime();
  const years = (lastMs - firstMs) / (365.25 * 86_400_000);
  const scaleLabel = spotHistoryScale === "log" ? "Log" : "Linear";
  const rangeLabel =
    spotHistoryRange === "all"
      ? `${len.toLocaleString()} days`
      : `${spotHistoryRange.toUpperCase()} window`;
  meta.textContent = `${scaleLabel} · ${rangeLabel} · ${spotFmtDate(firstMs)} → ${spotFmtDate(lastMs)} (${years.toFixed(1)} yr) · scroll/drag/dbl-click reset`;
}

function spotUpdateMeta(tf, bars) {
  const cfg = SPOT_TF[tf];
  const meta = spotEl("spot-chart-meta");
  const label = spotEl("spot-chart-label");
  if (!bars.length) {
    if (meta) meta.textContent = "No data";
    if (label) label.textContent = `${cfg?.label || tf} · Binance BTC/USDT`;
    return;
  }
  const firstMs = bars[0].time * 1000;
  const lastMs = bars[bars.length - 1].time * 1000;
  const span = lastMs - firstMs;
  const days = span / 86_400_000;
  const range =
    days >= 365
      ? `${(days / 365).toFixed(1)} yr`
      : days >= 2
        ? `${days.toFixed(0)} days`
        : days >= 1
          ? `${days.toFixed(1)} days`
          : `${(span / 3_600_000).toFixed(1)} hr`;
  if (meta) {
    meta.textContent = `${bars.length.toLocaleString()} bars · ${spotFmtDate(firstMs)} → ${spotFmtDate(lastMs)} (${range})`;
  }
  if (label) {
    label.textContent = `${cfg?.label || tf} candles · Binance BTC/USDT`;
  }
}

function spotSetTfActive(tf) {
  document.querySelectorAll(".spot-tf-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.spotTf === tf);
  });
}

async function spotLoadTimeframe(tf, options = {}) {
  const cfg = SPOT_TF[tf];
  if (!cfg) return;
  spotActiveTf = tf;
  spotSetTfActive(tf);

  const meta = spotEl("spot-chart-meta");
  if (meta && !options.silent) meta.textContent = "Loading…";

  try {
    const bars = await spotFetchKlines(cfg.interval, cfg.limit);
    spotBars = bars;
    spotMountMainChart();
    spotBindMainControls();
    spotBindMainResize();
    spotResetMainView();
    spotUpdateMeta(tf, bars);
  } catch (err) {
    if (meta) meta.textContent = `Failed: ${err.message}`;
    console.error("spotLoadTimeframe", err);
  }
}

function spotApplyInitialKlines(klines) {
  if (!Array.isArray(klines) || !klines.length) return;
  const bars = spotDedupeBars(klines.map(spotKlineToBar));
  spotBars = bars;
  spotMountMainChart();
  spotBindMainControls();
  spotBindMainResize();
  spotResetMainView();
  spotUpdateMeta(spotActiveTf, bars);
}

function spotOnLiveKline(k) {
  if (spotActiveTf !== "1m") return;
  const bar = {
    time: Math.floor(k.t / 1000),
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
  };
  const idx = spotBars.findIndex((b) => b.time === bar.time);
  if (idx >= 0) spotBars[idx] = bar;
  else {
    spotBars.push(bar);
    spotBars.sort((a, b) => a.time - b.time);
    if (spotBars.length > 1000) spotBars.shift();
  }
  if (!spotMainCtrl && spotBars.length) {
    spotMountMainChart();
    spotBindMainControls();
    spotBindMainResize();
  }
  spotMainCtrl?.requestDraw();
  const meta = spotEl("spot-chart-meta");
  if (meta && spotBars.length) {
    const firstMs = spotBars[0].time * 1000;
    const lastMs = spotBars[spotBars.length - 1].time * 1000;
    meta.textContent = `${spotBars.length.toLocaleString()} bars · ${spotFmtDateTime(firstMs)} → ${spotFmtDateTime(lastMs)} (live)`;
  }
}

async function spotLoadHistory() {
  if (spotHistoryLoaded) return;
  const meta = spotEl("spot-history-meta");
  if (meta) meta.textContent = "Loading full daily history…";

  try {
    const bars = await spotFetchAllDaily();
    if (!bars.length) {
      if (meta) meta.textContent = "No history";
      return;
    }
    spotHistoryPoints = bars.map((b) => ({
      date: new Date(b.time * 1000).toISOString().slice(0, 10),
      close: b.close,
    }));
    spotMountHistoryChart();
    spotBindHistoryControls();
    spotBindHistoryResize();
    spotUpdateHistoryMeta();
    spotHistoryLoaded = true;
  } catch (err) {
    if (meta) meta.textContent = `Failed: ${err.message}`;
    console.error("spotLoadHistory", err);
  }
}

function spotStartPolling() {
  if (spotPollTimer) clearInterval(spotPollTimer);
  spotPollTimer = setInterval(() => {
    const cfg = SPOT_TF[spotActiveTf];
    if (!cfg || cfg.live) return;
    spotLoadTimeframe(spotActiveTf, { silent: true });
  }, 120_000);
}

function spotOnShow() {
  if (spotBars.length) {
    spotMountMainChart();
    spotBindMainControls();
    spotBindMainResize();
    spotMainCtrl?.requestDraw();
  } else {
    spotLoadTimeframe(spotActiveTf, { silent: true });
  }
  if (!spotHistoryLoaded) spotLoadHistory();
  else if (spotHistoryPoints.length) {
    spotMountHistoryChart();
    spotBindHistoryControls();
    spotBindHistoryResize();
    spotUpdateHistoryMeta();
  }
  requestAnimationFrame(() => {
    spotMainCtrl?.requestDraw();
    spotHistoryCtrl?.requestDraw();
  });
}

function spotInit() {
  spotOnShow();
  spotStartPolling();
}

window.SpotCharts = {
  init: spotInit,
  onShow: spotOnShow,
  loadTimeframe: spotLoadTimeframe,
  applyInitialKlines: spotApplyInitialKlines,
  onLiveKline: spotOnLiveKline,
  resize: () => {
    spotMainCtrl?.requestDraw();
    spotHistoryCtrl?.requestDraw();
  },
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => spotInit());
} else {
  spotInit();
}