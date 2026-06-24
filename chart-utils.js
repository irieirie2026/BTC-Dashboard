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