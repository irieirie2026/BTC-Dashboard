function fmtChartDate(value, compact = false) {
  if (value == null || value === "") return "";
  if (typeof value === "string" && /[A-Za-z]{3}\s+\d/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  if (compact) {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function fmtChartTime(value) {
  if (value == null) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function chartDimensions(canvas) {
  const rect = canvas.getBoundingClientRect();
  const parentW = canvas.parentElement?.clientWidth || 0;
  const attrH = parseInt(canvas.getAttribute("height"), 10) || 200;
  const width = rect.width > 4 ? rect.width : parentW > 4 ? parentW : 0;
  const height = rect.height > 4 ? rect.height : attrH;
  return { width, height };
}

function scheduleChartDraw(canvas, drawFn) {
  if (!canvas) return;
  let attempts = 0;
  const run = () => {
    const { width, height } = chartDimensions(canvas);
    if (width < 4 && attempts < 12) {
      attempts += 1;
      requestAnimationFrame(run);
      return;
    }
    if (width < 4) return;
    drawFn(width, height);
  };
  requestAnimationFrame(run);
}

function drawReturnAxisLabels(ctx, w, h, pad, minVal, maxVal, formatter, options = {}) {
  const ticks = options.ticks ?? 5;
  const y = options.y ?? h - 8;
  const chartW = w - pad.left - pad.right;
  const span = maxVal - minVal || 0.001;

  ctx.fillStyle = options.color || "#7d8799";
  ctx.font = options.font || "10px IBM Plex Mono, monospace";
  ctx.textAlign = "center";

  for (let t = 0; t < ticks; t++) {
    const frac = ticks === 1 ? 0.5 : t / (ticks - 1);
    const val = minVal + frac * span;
    const x = pad.left + frac * chartW;
    const label = formatter(val);
    if (label) ctx.fillText(label, x, y);
  }
}

function drawTimeAxisLabels(ctx, w, h, pad, count, getLabel, options = {}) {
  const ticks = options.ticks ?? 5;
  const y = options.y ?? h - 8;
  const chartW = w - pad.left - pad.right;
  const n = count;

  ctx.fillStyle = options.color || "#7d8799";
  ctx.font = options.font || "10px IBM Plex Mono, monospace";
  ctx.textAlign = "center";

  if (n <= 0) return;

  if (n === 1) {
    const label = getLabel(0);
    if (label) ctx.fillText(label, pad.left + chartW / 2, y);
    return;
  }

  const tickCount = Math.min(ticks, n);
  for (let t = 0; t < tickCount; t++) {
    const idx =
      tickCount === 1 ? 0 : Math.round((t / (tickCount - 1)) * (n - 1));
    const x = pad.left + (idx / (n - 1)) * chartW;
    const label = getLabel(idx);
    if (label) ctx.fillText(label, x, y);
  }
}

const BAR_OUTLIER_THRESHOLD = 4;

function absSortedDesc(values) {
  return values
    .map((v) => Math.abs(Number(v) || 0))
    .sort((a, b) => b - a);
}

function isBarOutlier(values, threshold = BAR_OUTLIER_THRESHOLD) {
  const sorted = absSortedDesc(values);
  if (sorted.length < 2) return false;
  return sorted[0] / Math.max(sorted[1], 1e-9) >= threshold;
}

function barScaleMax(values, outlierActive) {
  const sorted = absSortedDesc(values);
  if (!sorted.length) return 1;
  if (!outlierActive) return Math.max(sorted[0], 1e-9);
  return Math.max(...sorted.slice(1), 1e-9);
}

function findOutlierIndex(items, getValue, threshold = BAR_OUTLIER_THRESHOLD) {
  if (!items?.length) return -1;
  const ranked = items
    .map((item, index) => ({
      index,
      value: Math.abs(Number(getValue(item)) || 0),
    }))
    .sort((a, b) => b.value - a.value);
  if (ranked.length < 2) return -1;
  if (ranked[0].value / Math.max(ranked[1].value, 1e-9) >= threshold) {
    return ranked[0].index;
  }
  return -1;
}

function drawAxisBreakZigzag(ctx, x, y, size, vertical = false) {
  const amp = Math.min(size * 0.22, 4);
  const w = 7;
  ctx.strokeStyle = "#7d8799";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  if (vertical) {
    const mid = x + size / 2;
    ctx.moveTo(mid - amp, y);
    ctx.lineTo(mid + amp, y + w * 0.35);
    ctx.lineTo(mid - amp, y + w * 0.65);
    ctx.lineTo(mid + amp, y + w);
  } else {
    const mid = y + size / 2;
    ctx.moveTo(x, mid - amp);
    ctx.lineTo(x + w * 0.35, mid + amp);
    ctx.lineTo(x + w * 0.65, mid - amp);
    ctx.lineTo(x + w, mid + amp);
  }
  ctx.stroke();
}

function drawBreakSlashMarks(ctx, gapStart, gapEnd, y, bodyH, vertical = false) {
  ctx.strokeStyle = "rgba(125, 135, 153, 0.45)";
  ctx.lineWidth = 1;
  if (vertical) {
    const mid = gapStart + (gapEnd - gapStart) / 2;
    ctx.beginPath();
    ctx.moveTo(gapStart + 2, mid - 3);
    ctx.lineTo(gapEnd - 2, mid + 3);
    ctx.moveTo(gapStart + 5, mid - 3);
    ctx.lineTo(gapEnd + 1, mid + 3);
    ctx.stroke();
    return;
  }
  const mid = y + bodyH / 2;
  ctx.beginPath();
  ctx.moveTo(gapStart + 2, mid - bodyH * 0.28);
  ctx.lineTo(gapEnd - 2, mid + bodyH * 0.28);
  ctx.moveTo(gapStart + 5, mid - bodyH * 0.28);
  ctx.lineTo(gapEnd + 1, mid + bodyH * 0.28);
  ctx.stroke();
}

function drawBrokenHBar(ctx, opts) {
  const {
    x0,
    y,
    bodyH,
    chartW,
    colorStart = "rgba(148, 163, 184, 0.7)",
    colorEnd = "rgba(148, 163, 184, 0.95)",
  } = opts;
  const stubW = chartW * 0.12;
  const gapStart = x0 + stubW;
  const gapEnd = gapStart + chartW * 0.1;
  const segEnd = x0 + chartW * 0.9;

  const gradA = ctx.createLinearGradient(x0, y, x0 + stubW, y);
  gradA.addColorStop(0, colorStart);
  gradA.addColorStop(1, colorEnd);
  ctx.fillStyle = gradA;
  ctx.fillRect(x0, y, stubW, bodyH);

  const gradB = ctx.createLinearGradient(gapEnd, y, segEnd, y);
  gradB.addColorStop(0, colorEnd);
  gradB.addColorStop(1, colorStart);
  ctx.fillStyle = gradB;
  ctx.fillRect(gapEnd, y, segEnd - gapEnd, bodyH);

  drawAxisBreakZigzag(ctx, gapStart + 1, y, bodyH, false);
  drawBreakSlashMarks(ctx, gapStart, gapEnd, y, bodyH, false);
  return segEnd;
}

function drawBrokenHBarDiverging(ctx, opts) {
  const {
    mid,
    y,
    bodyH,
    halfW,
    positive,
    colorStart,
    colorEnd,
  } = opts;
  const chartW = halfW * 2;
  const stubW = halfW * 0.24;
  const gapLen = halfW * 0.2;
  const tailW = halfW * 0.88;

  if (positive) {
    const gapStart = mid + stubW;
    const gapEnd = gapStart + gapLen;
    const segEnd = mid + stubW + gapLen + tailW;
    ctx.fillStyle = colorStart;
    ctx.fillRect(mid, y, stubW, bodyH);
    ctx.fillStyle = colorEnd;
    ctx.fillRect(gapEnd, y, tailW, bodyH);
    drawAxisBreakZigzag(ctx, gapStart + 1, y, bodyH, false);
    drawBreakSlashMarks(ctx, gapStart, gapEnd, y, bodyH, false);
    return { edge: segEnd, side: "right" };
  }

  const segStart = mid - stubW - gapLen - tailW;
  const gapEnd = mid - stubW;
  const gapStart = gapEnd - gapLen;
  ctx.fillStyle = colorEnd;
  ctx.fillRect(segStart, y, tailW, bodyH);
  ctx.fillStyle = colorStart;
  ctx.fillRect(mid - stubW, y, stubW, bodyH);
  drawAxisBreakZigzag(ctx, gapEnd - 8, y, bodyH, false);
  drawBreakSlashMarks(ctx, gapStart, gapEnd, y, bodyH, false);
  return { edge: segStart, side: "left" };
}

function drawBrokenVBar(ctx, opts) {
  const {
    x,
    bodyW,
    zeroY,
    chartH,
    upward,
    colorStart = "rgba(148, 163, 184, 0.7)",
    colorEnd = "rgba(148, 163, 184, 0.95)",
  } = opts;
  const stubH = chartH * 0.12;
  const gapLen = chartH * 0.1;
  const tailH = chartH * 0.78;

  if (upward) {
    const yStubTop = zeroY - stubH;
    const gapEnd = yStubTop - gapLen;
    const yTailTop = gapEnd - tailH;
    ctx.fillStyle = colorStart;
    ctx.fillRect(x - bodyW / 2, yStubTop, bodyW, stubH);
    ctx.fillStyle = colorEnd;
    ctx.fillRect(x - bodyW / 2, yTailTop, bodyW, tailH);
    drawAxisBreakZigzag(ctx, x - bodyW / 2, yStubTop - gapLen, bodyW, true);
    drawBreakSlashMarks(ctx, yTailTop + tailH, yStubTop, x, bodyW, true);
    return yTailTop;
  }

  const yStubTop = zeroY;
  const gapStart = zeroY + stubH;
  const gapEnd = gapStart + gapLen;
  const yTailEnd = gapEnd + tailH;
  ctx.fillStyle = colorStart;
  ctx.fillRect(x - bodyW / 2, yStubTop, bodyW, stubH);
  ctx.fillStyle = colorEnd;
  ctx.fillRect(x - bodyW / 2, gapEnd, bodyW, tailH);
  drawAxisBreakZigzag(ctx, x - bodyW / 2, gapStart, bodyW, true);
  drawBreakSlashMarks(ctx, gapStart, gapEnd, x, bodyW, true);
  return yTailEnd;
}

window.ChartOutlier = {
  THRESHOLD: BAR_OUTLIER_THRESHOLD,
  isBarOutlier,
  barScaleMax,
  findOutlierIndex,
  drawAxisBreakZigzag,
  drawBrokenHBar,
  drawBrokenHBarDiverging,
  drawBrokenVBar,
};

const _chartControllers = new WeakMap();

function chartTooltipEl() {
  let el = document.getElementById("chart-tooltip");
  if (!el) {
    el = document.createElement("div");
    el.id = "chart-tooltip";
    el.className = "chart-tooltip";
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

function showChartTooltip(html, x, y) {
  const el = chartTooltipEl();
  el.innerHTML = html;
  el.hidden = false;
  const margin = 12;
  const rect = el.getBoundingClientRect();
  let left = x + 14;
  let top = y - rect.height - 10;
  if (left + rect.width > window.innerWidth - margin) {
    left = x - rect.width - 14;
  }
  if (top < margin) top = y + 14;
  el.style.left = `${Math.max(margin, left)}px`;
  el.style.top = `${Math.max(margin, top)}px`;
}

function hideChartTooltip() {
  const el = chartTooltipEl();
  if (el) el.hidden = true;
}

function createChartView(length, minWindow = 24) {
  return {
    start: 0,
    end: Math.max(0, length - 1),
    length,
    minWindow,
  };
}

function syncChartView(view, length) {
  view.length = length;
  if (length <= 0) {
    view.start = 0;
    view.end = 0;
    return;
  }
  if (view.end >= length) {
    view.start = 0;
    view.end = length - 1;
  }
}

function resetChartView(view) {
  view.start = 0;
  view.end = Math.max(0, view.length - 1);
}

function chartViewSize(view) {
  return Math.max(1, view.end - view.start + 1);
}

function zoomChartView(view, anchorFrac, zoomIn) {
  const size = chartViewSize(view);
  const factor = zoomIn ? 1.22 : 1 / 1.22;
  let newSize = Math.round(size / factor);
  newSize = Math.max(view.minWindow, Math.min(view.length, newSize));
  if (newSize >= view.length) {
    resetChartView(view);
    return;
  }
  const anchor = view.start + Math.round(anchorFrac * (size - 1));
  let newStart = anchor - Math.round(anchorFrac * (newSize - 1));
  let newEnd = newStart + newSize - 1;
  if (newStart < 0) {
    newEnd -= newStart;
    newStart = 0;
  }
  if (newEnd > view.length - 1) {
    newStart -= newEnd - (view.length - 1);
    newEnd = view.length - 1;
  }
  view.start = Math.max(0, newStart);
  view.end = Math.min(view.length - 1, newEnd);
}

function panChartView(view, delta) {
  const size = chartViewSize(view);
  if (size >= view.length) return;
  let newStart = view.start + delta;
  newStart = Math.max(0, Math.min(newStart, view.length - size));
  view.start = newStart;
  view.end = newStart + size - 1;
}

function chartLocalIndexAtX(clientX, canvas, pad, count) {
  const rect = canvas.getBoundingClientRect();
  const chartW = rect.width - pad.left - pad.right;
  if (chartW <= 0 || count < 1) return null;
  const x = clientX - rect.left;
  const frac = (x - pad.left) / chartW;
  if (frac < 0 || frac > 1) return null;
  return count === 1 ? 0 : Math.round(frac * (count - 1));
}

function drawChartCrosshair(ctx, pad, chartH, x) {
  ctx.save();
  ctx.strokeStyle = "rgba(240, 185, 11, 0.85)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, pad.top);
  ctx.lineTo(x, pad.top + chartH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawChartHoverDot(ctx, x, y, color = "#f0b90b") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function indicesInChartView(view, maxPoints = 1500) {
  const size = chartViewSize(view);
  if (size <= maxPoints) {
    return Array.from({ length: size }, (_, i) => view.start + i);
  }
  const indices = [];
  const last = size - 1;
  const step = last / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    indices.push(view.start + Math.round(i === maxPoints - 1 ? last : i * step));
  }
  return [...new Set(indices)];
}

function ensureChartController(canvas, options) {
  let ctrl = _chartControllers.get(canvas);
  if (ctrl) {
    ctrl.state.opts = options;
    syncChartView(ctrl.state.view, options.getLength());
    ctrl.requestDraw();
    return ctrl;
  }

  const state = {
    opts: options,
    view: createChartView(options.getLength(), options.minWindow || 24),
    hoverLocal: null,
    drag: null,
    lastMouse: null,
  };

  const requestDraw = () => {
    scheduleChartDraw(canvas, (w, h) => {
      const opts = state.opts;
      const len = opts.getLength();
      if (!len) return;
      syncChartView(state.view, len);
      const pad = opts.pad;
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;
      const viewSize = chartViewSize(state.view);
      const hoverGlobal =
        state.hoverLocal != null ? state.view.start + state.hoverLocal : null;

      const api = {
        pad,
        chartW,
        chartH,
        view: state.view,
        hoverGlobal,
        hoverLocal: state.hoverLocal,
        indices: indicesInChartView(state.view, opts.maxPoints || 1500),
        xAt(localIdx, count = viewSize) {
          return pad.left + (localIdx / Math.max(count - 1, 1)) * chartW;
        },
        xAtGlobal(globalIdx) {
          const local = globalIdx - state.view.start;
          return pad.left + (local / Math.max(viewSize - 1, 1)) * chartW;
        },
        drawCrosshair(x) {
          drawChartCrosshair(ctx, pad, chartH, x);
        },
        drawDot(x, y, color) {
          drawChartHoverDot(ctx, x, y, color);
        },
      };

      opts.onDraw(ctx, w, h, api);

      if (
        hoverGlobal != null &&
        state.lastMouse &&
        opts.formatTooltip
      ) {
        showChartTooltip(
          opts.formatTooltip(hoverGlobal),
          state.lastMouse.x,
          state.lastMouse.y,
        );
      } else {
        hideChartTooltip();
      }
    });
  };

  canvas.classList.add("chart-canvas--interactive");
  const wrap = canvas.parentElement;
  if (wrap) wrap.classList.add("deriv-chart-wrap--interactive");

  if (options.zoom !== false) {
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        syncChartView(state.view, state.opts.getLength());
        const rect = canvas.getBoundingClientRect();
        const chartW = rect.width - state.opts.pad.left - state.opts.pad.right;
        const frac =
          chartW > 0
            ? (e.clientX - rect.left - state.opts.pad.left) / chartW
            : 0.5;
        zoomChartView(
          state.view,
          Math.max(0, Math.min(1, frac)),
          e.deltaY < 0,
        );
        requestDraw();
      },
      { passive: false },
    );

    canvas.addEventListener("mousedown", (e) => {
      state.drag = { x: e.clientX, view: { ...state.view } };
      canvas.style.cursor = "grabbing";
    });

    canvas.addEventListener("dblclick", () => {
      resetChartView(state.view);
      syncChartView(state.view, state.opts.getLength());
      requestDraw();
    });
  }

  canvas.style.cursor = options.zoom === false ? "crosshair" : "grab";

  canvas.addEventListener("mousemove", (e) => {
    state.lastMouse = { x: e.clientX, y: e.clientY };
    syncChartView(state.view, state.opts.getLength());
    const viewSize = chartViewSize(state.view);

    if (state.drag && options.zoom !== false) {
      const rect = canvas.getBoundingClientRect();
      const chartW = rect.width - state.opts.pad.left - state.opts.pad.right;
      const size = chartViewSize(state.drag.view);
      const deltaPx = e.clientX - state.drag.x;
      const deltaIdx = -Math.round((deltaPx / Math.max(chartW, 1)) * size);
      state.view.start = state.drag.view.start;
      state.view.end = state.drag.view.end;
      panChartView(state.view, deltaIdx);
      requestDraw();
      return;
    }

    const local = chartLocalIndexAtX(
      e.clientX,
      canvas,
      state.opts.pad,
      viewSize,
    );
    if (local !== state.hoverLocal) {
      state.hoverLocal = local;
      requestDraw();
    } else if (local != null && state.opts.formatTooltip) {
      showChartTooltip(
        state.opts.formatTooltip(state.view.start + local),
        e.clientX,
        e.clientY,
      );
    }
  });

  window.addEventListener("mouseup", () => {
    if (!state.drag) return;
    state.drag = null;
    canvas.style.cursor = state.opts.zoom === false ? "crosshair" : "grab";
  });

  canvas.addEventListener("mouseleave", () => {
    state.hoverLocal = null;
    state.drag = null;
    hideChartTooltip();
    requestDraw();
  });

  ctrl = { requestDraw, state };
  _chartControllers.set(canvas, ctrl);
  requestDraw();
  return ctrl;
}

window.ChartInteraction = {
  ensure: ensureChartController,
  hideChartTooltip,
  showChartTooltip,
  drawChartCrosshair,
  drawChartHoverDot,
  indicesInChartView,
  resetChartView,
  chartViewSize,
};