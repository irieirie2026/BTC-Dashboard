/** Cross-Market chart panels: premium timeline, z-time heatmap, propagation graph */

const XMCharts = (() => {
  /** Layout heights (px) — premium at 250% of the 176px chart baseline */
  const PREMIUM_CHART_H = 440;
  const ZMATRIX_CHART_H = 176;

  const WINDOWS = {
    "5s": 5_000,
    "30s": 30_000,
    "5m": 300_000,
    "1h": 3_600_000,
    "1d": 86_400_000,
  };

  const PREM_PALETTE = [
    "#f59e0b", "#38bdf8", "#a78bfa", "#0ecb81", "#94a3b8", "#f472b6",
    "#fb923c", "#c084fc", "#34d399", "#f87171", "#60a5fa", "#e879f9",
    "#fbbf24", "#2dd4bf", "#818cf8", "#fb7185", "#4ade80", "#fcd34d",
  ];

  const PREM_COLOR_OVERRIDES = {
    upbit: "#f59e0b",
    bithumb: "#fb923c",
    coinbase: "#38bdf8",
    bitflyer: "#a78bfa",
    kraken: "#0ecb81",
    bitstamp: "#94a3b8",
    gemini: "#f472b6",
    okx: "#fb923c",
    bybit: "#c084fc",
    htx: "#34d399",
    crypto_com: "#60a5fa",
  };

  const Z_HEAT_COLS = 48;
  const Z_ENGINE_MS = 2_000;

  let windowKey = "5m";
  let controlsBound = false;
  let premiumsMeta = {};
  let premYAxis = null;
  let zHeatRaf = null;
  let zHeatDirty = false;
  let zScrollTimer = null;

  function ensureZScrollClock() {
    if (zScrollTimer) return;
    zScrollTimer = setInterval(() => {
      const screen = document.querySelector(
        '#dashboard-misc .menu-screen[data-l2="cross-market"][data-l3="monitor"]',
      );
      if (!screen || screen.hidden) return;
      renderZHeatmap();
    }, 500);
  }

  function loadWindowKey() {
    try {
      const saved = localStorage.getItem("xm-chart-window");
      if (saved && WINDOWS[saved]) windowKey = saved;
    } catch { /* ignore */ }
  }

  function getWindowMs() {
    return WINDOWS[windowKey] || WINDOWS["5m"];
  }

  /** Fixed sliding window: always [now − window, now]. New points plot on the right. */
  function fixedAxis(windowMs) {
    const now = Date.now();
    return { tStart: now - windowMs, tEnd: now, windowMs };
  }

  function timeToFrac(t, axis) {
    return (t - axis.tStart) / axis.windowMs;
  }

  function timeToX(t, axis, padLeft, chartW) {
    const frac = Math.max(0, Math.min(1, timeToFrac(t, axis)));
    return padLeft + frac * chartW;
  }

  function valueAtTime(series, t) {
    let best = null;
    for (const p of series) {
      if (p.t <= t) best = p;
      else break;
    }
    return best?.v ?? null;
  }

  function chartShell(canvas) {
    if (!canvas) return null;
    return canvas.closest(".xm-chart-shell") || canvas.parentElement;
  }

  function chartDisplayH(canvas) {
    if (canvas?.id === "xm-chart-premium") return PREMIUM_CHART_H;
    if (canvas?.id === "xm-chart-zmatrix") return ZMATRIX_CHART_H;
    return ZMATRIX_CHART_H;
  }

  function ensureChartShells() {
    const premWrap = document.getElementById("xm-chart-premium-wrap");
    const zWrap = document.getElementById("xm-chart-zmatrix-wrap");
    if (premWrap) {
      premWrap.style.setProperty("height", `${PREMIUM_CHART_H}px`, "important");
      premWrap.style.setProperty("min-height", `${PREMIUM_CHART_H}px`, "important");
    }
    if (zWrap) {
      zWrap.style.setProperty("height", `${ZMATRIX_CHART_H}px`, "important");
      zWrap.style.setProperty("min-height", `${ZMATRIX_CHART_H}px`, "important");
    }
  }

  function shellLayout(canvas) {
    const shell = chartShell(canvas);
    const fallbackH = chartDisplayH(canvas);
    const w = Math.max(4, shell?.clientWidth || canvas.parentElement?.clientWidth || 320);
    const h = Math.max(4, shell?.clientHeight || fallbackH);
    return { w, h, shell };
  }

  function applyCanvasSize(canvas, layoutW, layoutH) {
    const displayH = layoutH || chartDisplayH(canvas);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(4, layoutW);
    canvas.style.setProperty("width", "100%", "important");
    canvas.style.setProperty("height", "100%", "important");
    canvas.style.setProperty("position", "absolute", "important");
    canvas.style.setProperty("top", "0", "important");
    canvas.style.setProperty("left", "0", "important");
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(displayH * dpr);
    return { w, h: displayH, dpr };
  }

  function xmScheduleDraw(canvas, drawFn) {
    let tries = 0;
    const run = () => {
      ensureChartShells();
      const { w, h } = shellLayout(canvas);
      if (w < 8 && tries < 24) {
        tries += 1;
        requestAnimationFrame(run);
        return;
      }
      drawFn(w, h);
    };
    requestAnimationFrame(run);
  }

  function premiumColor(id) {
    if (PREM_COLOR_OVERRIDES[id]) return PREM_COLOR_OVERRIDES[id];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PREM_PALETTE[h % PREM_PALETTE.length];
  }

  function premiumLabel(id) {
    return premiumsMeta[id]?.label || premiumsMeta[id]?.exchange || id.replace(/_/g, " ");
  }

  /** Time-bucket downsampling: past buckets stay stable as new ticks arrive on the right. */
  function downsampleTimeBuckets(pts, axis, maxBuckets = 120) {
    if (!pts?.length) return [];
    const sorted = [...pts].sort((a, b) => a.t - b.t);
    if (sorted.length <= maxBuckets) return sorted;
    const bucketMs = axis.windowMs / maxBuckets;
    const buckets = new Map();
    for (const p of sorted) {
      const bi = Math.floor((p.t - axis.tStart) / bucketMs);
      if (bi < 0 || bi >= maxBuckets) continue;
      const prev = buckets.get(bi);
      if (!prev || p.t >= prev.t) buckets.set(bi, p);
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  }

  function resolvePremYBounds(vals) {
    const rawMin = Math.min(0, ...vals);
    const rawMax = Math.max(0, ...vals);
    let span = rawMax - rawMin || 0.5;
    let minV = rawMin - span * 0.12;
    let maxV = rawMax + span * 0.12;

    if (!premYAxis) {
      premYAxis = { minV, maxV, lockedAt: Date.now() };
      return premYAxis;
    }

    const needsExpand = minV < premYAxis.minV || maxV > premYAxis.maxV;
    if (needsExpand) {
      premYAxis.minV = Math.min(premYAxis.minV, minV);
      premYAxis.maxV = Math.max(premYAxis.maxV, maxV);
      premYAxis.lockedAt = Date.now();
    } else if (Date.now() - premYAxis.lockedAt > 20_000) {
      premYAxis.minV = premYAxis.minV * 0.65 + minV * 0.35;
      premYAxis.maxV = premYAxis.maxV * 0.65 + maxV * 0.35;
      premYAxis.lockedAt = Date.now();
    }
    return premYAxis;
  }

  function syncWindowButtons() {
    document.querySelectorAll("[data-xm-chart-window]").forEach((btn) => {
      const key = btn.getAttribute("data-xm-chart-window");
      const on = key === windowKey;
      btn.classList.toggle("xm-chart-window-btn--active", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    const meta = document.getElementById("xm-chart-window-label");
    if (meta) meta.textContent = `Window: ${windowKey}`;
  }

  function setWindow(key) {
    if (!WINDOWS[key]) return;
    windowKey = key;
    premYAxis = null;
    try { localStorage.setItem("xm-chart-window", key); } catch { /* ignore */ }
    syncWindowButtons();
    renderPremiumTimeline();
    renderZHeatmap();
  }

  function bindWindowControls() {
    loadWindowKey();
    ensureChartShells();
    ensureZScrollClock();
    syncWindowButtons();
    if (controlsBound) return;
    const bar = document.querySelector(".xm-chart-window-bar");
    if (!bar) return;
    controlsBound = true;
    bar.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-xm-chart-window]");
      if (!btn) return;
      ev.preventDefault();
      setWindow(btn.getAttribute("data-xm-chart-window"));
    });
  }

  function drawWindowGrid(ctx, axis, pad, chartW, chartH) {
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = pad.left + (i / 4) * chartW;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + chartH);
      ctx.stroke();
    }
  }

  function renderPremiumTimeline() {
    const canvas = document.getElementById("xm-chart-premium");
    if (!canvas || !window.XMEngine?.premiumTimeline) return;

    const windowMs = getWindowMs();
    const axis = fixedAxis(windowMs);
    const series = XMEngine.premiumTimeline(null, windowMs);
    const activeIds = Object.keys(series).filter((id) => series[id]?.length > 0);

    xmScheduleDraw(canvas, (layoutW, layoutH) => {
      const { w, h, dpr } = applyCanvasSize(canvas, layoutW, layoutH);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const pad = { top: 10, right: 8, bottom: 18, left: 36 };
      const chartW = w - pad.left - pad.right;
      if (chartW < 8) return;

      ctx.font = "8px IBM Plex Sans, sans-serif";
      const legendRows = (() => {
        let lx = 0;
        let rows = 1;
        activeIds.forEach((id) => {
          const itemW = 15 + ctx.measureText(premiumLabel(id)).width + 10;
          if (lx + itemW > chartW) { rows += 1; lx = 0; }
          lx += itemW;
        });
        return Math.max(1, rows);
      })();
      pad.top = 6 + legendRows * 12;
      const chartH = h - pad.top - pad.bottom;
      if (chartH < 8) return;

      drawWindowGrid(ctx, axis, pad, chartW, chartH);

      if (!activeIds.length) {
        ctx.fillStyle = "#6b7280";
        ctx.font = "10px IBM Plex Sans, sans-serif";
        ctx.fillText(`Collecting premiums (${windowKey} window)…`, pad.left, pad.top + 14);
        drawAxisLabels(ctx, axis, pad, chartW, h);
        return;
      }

      const inWindow = activeIds.flatMap((id) =>
        series[id].filter((p) => p.t >= axis.tStart && p.t <= axis.tEnd),
      );
      const vals = inWindow.map((p) => p.v);
      const { minV, maxV } = resolvePremYBounds(vals);
      const ySpan = maxV - minV || 1;

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top + chartH / 2);
      ctx.lineTo(pad.left + chartW, pad.top + chartH / 2);
      ctx.stroke();

      let lx = pad.left;
      let ly = 4;
      activeIds.forEach((id) => {
        const label = premiumLabel(id);
        const itemW = 15 + ctx.measureText(label).width + 10;
        if (lx + itemW > pad.left + chartW) { lx = pad.left; ly += 11; }
        ctx.fillStyle = premiumColor(id);
        ctx.fillRect(lx, ly, 6, 6);
        ctx.fillStyle = "#9ca3af";
        ctx.fillText(label, lx + 9, ly + 6);
        lx += itemW;
      });

      activeIds.forEach((id) => {
        const pts = downsampleTimeBuckets(
          series[id].filter((p) => p.t >= axis.tStart && p.t <= axis.tEnd),
          axis,
        );
        if (!pts.length) return;
        const color = premiumColor(id);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        pts.forEach((p, i) => {
          const x = timeToX(p.t, axis, pad.left, chartW);
          const y = pad.top + chartH - ((p.v - minV) / ySpan) * chartH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });

      ctx.fillStyle = "#7d8799";
      ctx.font = "9px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${maxV.toFixed(2)}%`, pad.left - 3, pad.top + 7);
      ctx.fillText(`${minV.toFixed(2)}%`, pad.left - 3, pad.top + chartH);

      drawAxisLabels(ctx, axis, pad, chartW, h);
    });
  }

  /**
   * Wall-clock slots: columns map to fixed absolute time buckets on the epoch
   * grid. Slot boundaries only advance when the window crosses a slot boundary,
   * so past columns stay frozen (no creeping colEnd drift on 5m / 1h / 1d).
   */
  function sampleZHeatRow(series, axis, cols = Z_HEAT_COLS) {
    const values = new Array(cols).fill(null);
    const sorted = [...(series || [])].sort((a, b) => a.t - b.t);
    if (!sorted.length) return values;

    const slotMs = axis.windowMs / cols;
    const endSlot = Math.floor(axis.tEnd / slotMs);
    const firstSlot = endSlot - cols + 1;

    for (let ci = 0; ci < cols; ci++) {
      const slotStart = (firstSlot + ci) * slotMs;
      const slotEnd = slotStart + slotMs;
      if (slotEnd <= axis.tStart || slotStart >= axis.tEnd) continue;

      let v = null;
      for (const p of sorted) {
        if (p.t < axis.tStart) continue;
        if (p.t < slotEnd) v = p.v;
        else break;
      }
      values[ci] = v;
    }
    return values;
  }

  function zHeatColor(z) {
    const heat = Math.min(1, Math.abs(z) / 4);
    const r = Math.round(245 * heat + 30 * (1 - heat));
    const g = Math.round(158 * heat + 40 * (1 - heat));
    const b = Math.round(11 * heat + 60 * (1 - heat));
    return { fill: `rgba(${r},${g},${b},${0.2 + heat * 0.55})`, heat };
  }

  function drawAxisLabels(ctx, axis, pad, chartW, h) {
    if (typeof fmtChartTime !== "function") return;
    ctx.fillStyle = "#7d8799";
    ctx.font = "8px IBM Plex Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(fmtChartTime(axis.tStart), pad.left, h - 4);
    ctx.fillText("now", pad.left + chartW, h - 4);
  }

  function renderZHeatmapNow() {
    const canvas = document.getElementById("xm-chart-zmatrix");
    if (!canvas || !window.XMEngine?.zTimeMatrixTimed) return;

    const windowMs = getWindowMs();

    xmScheduleDraw(canvas, (layoutW, layoutH) => {
      const now = Date.now();
      const axis = { tStart: now - windowMs, tEnd: now, windowMs };
      const matrix = XMEngine.zTimeMatrixTimed(windowMs, now);
      const venues = Object.keys(matrix).sort();
      const { w, h, dpr } = applyCanvasSize(canvas, layoutW, layoutH);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const pad = { top: 4, left: 58, right: 6, bottom: 14 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;

      if (!venues.length) {
        ctx.fillStyle = "#6b7280";
        ctx.font = "10px IBM Plex Sans, sans-serif";
        ctx.fillText(`Collecting z-scores (${windowKey} window)…`, pad.left, pad.top + 12);
        drawAxisLabels(ctx, axis, pad, chartW, h);
        return;
      }

      const rows = venues.length;
      const cellW = chartW / Z_HEAT_COLS;
      const cellH = chartH / rows;

      venues.forEach((venue, ri) => {
        const buckets = sampleZHeatRow(matrix[venue], axis);

        ctx.fillStyle = "#9ca3af";
        ctx.font = "8px IBM Plex Mono, monospace";
        ctx.textAlign = "right";
        ctx.fillText(venue.slice(0, 9), pad.left - 4, pad.top + ri * cellH + cellH * 0.7);

        buckets.forEach((z, ci) => {
          if (z == null) return;
          const { fill } = zHeatColor(z);
          ctx.fillStyle = fill;
          ctx.fillRect(
            pad.left + ci * cellW + 0.5,
            pad.top + ri * cellH + 0.5,
            Math.max(2, cellW - 0.5),
            Math.max(2, cellH - 1),
          );
        });
      });

      drawAxisLabels(ctx, axis, pad, chartW, h);
    });
  }

  function renderZHeatmap() {
    zHeatDirty = true;
    if (zHeatRaf) return;
    const tick = () => {
      zHeatRaf = null;
      if (!zHeatDirty) return;
      zHeatDirty = false;
      renderZHeatmapNow();
      if (zHeatDirty) zHeatRaf = requestAnimationFrame(tick);
    };
    zHeatRaf = requestAnimationFrame(tick);
  }

  const PROP_ORIGIN_H = 48;
  const PROP_NODE_H = 32;
  const PROP_GAP_H = 56;
  const PROP_FOOTER_H = 52;

  function propTruncateLabel(name, max = 15) {
    const s = String(name || "");
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  function propBuildTimeline(p) {
    const sorted = [...p.edges].sort((a, b) => a.delaySec - b.delaySec || String(a.to).localeCompare(b.to));
    const followers = [];
    const seen = new Set();
    sorted.forEach((e) => {
      if (seen.has(e.to)) return;
      seen.add(e.to);
      const prev = followers[followers.length - 1];
      const delayFromOrigin = e.delaySec;
      const hopSec = prev == null ? delayFromOrigin : Math.max(0, delayFromOrigin - prev.delayFromOrigin);
      followers.push({ name: e.to, delayFromOrigin, hopSec });
    });
    return { origin: p.origin, followers };
  }

  function renderPropGraph(propagation) {
    const el = document.getElementById("xm-chart-prop");
    if (!el) return;

    const p = propagation;
    if (!p?.edges?.length) return;

    const { origin, followers } = propBuildTimeline(p);
    const svgW = 300;
    const cx = svgW / 2;
    const boxW = 132;
    const boxX = cx - boxW / 2;
    const originY = 20;
    const nodes = [{ name: origin, y: originY, h: PROP_ORIGIN_H, isOrigin: true, rank: 0 }];
    let y = originY + PROP_ORIGIN_H;
    followers.forEach((f, i) => {
      y += PROP_GAP_H;
      nodes.push({
        name: f.name,
        y,
        h: PROP_NODE_H,
        isOrigin: false,
        rank: i + 1,
        delayFromOrigin: f.delayFromOrigin,
        hopSec: f.hopSec,
      });
      y += PROP_NODE_H;
    });
    const svgH = Math.max(360, y + PROP_FOOTER_H);

    const segmentsSvg = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const upper = nodes[i];
      const lower = nodes[i + 1];
      const y1 = upper.y + upper.h;
      const y2 = lower.y;
      const midY = (y1 + y2) / 2;
      const isFirstHop = i === 0;
      const hopSec = lower.hopSec ?? lower.delayFromOrigin;
      const label = isFirstHop ? `+${hopSec}s` : `+${hopSec}s Δ`;
      const tip = isFirstHop
        ? `${hopSec}s after origin (t₀ → ${lower.name})`
        : `${lower.delayFromOrigin}s after origin · +${hopSec}s catch-up step`;
      const stroke = hopSec <= 20 ? "#0ecb81" : hopSec <= 45 ? "#f59e0b" : "#38bdf8";
      const pillW = isFirstHop ? 40 : 46;
      segmentsSvg.push(`<g class="xm-prop-seg">
        <title>${tip}</title>
        <line x1="${cx}" y1="${y1}" x2="${cx}" y2="${y2}" stroke="${stroke}" stroke-width="2" stroke-dasharray="5 4" opacity="0.75"/>
        <circle cx="${cx}" cy="${y1}" r="2.5" fill="${stroke}"/>
        <circle cx="${cx}" cy="${y2}" r="2.5" fill="${stroke}"/>
        <rect x="${cx - pillW / 2}" y="${midY - 10}" width="${pillW}" height="18" rx="5" fill="rgba(17,24,39,0.97)" stroke="rgba(255,255,255,0.12)"/>
        <text x="${cx}" y="${midY + 4}" text-anchor="middle" fill="#f3f4f6" font-size="10" font-family="IBM Plex Mono, monospace">${label}</text>
      </g>`);
    }

    const nodesSvg = nodes.map((n) => {
      const fill = n.isOrigin ? "rgba(245,158,11,0.22)" : "rgba(56,189,248,0.14)";
      const stroke = n.isOrigin ? "#f59e0b" : "#38bdf8";
      const label = propTruncateLabel(n.name);
      const tip = n.isOrigin
        ? `Origin · first anomaly in cluster (t₀)`
        : `#${n.rank} follower · +${n.delayFromOrigin}s after origin`;
      if (n.isOrigin) {
        return `<g class="xm-prop-node xm-prop-node--origin">
          <title>${tip}</title>
          <rect x="${boxX}" y="${n.y}" width="${boxW}" height="${n.h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
          <text x="${cx}" y="${n.y + 16}" text-anchor="middle" fill="#f59e0b" font-size="8" font-family="IBM Plex Sans, sans-serif" letter-spacing="0.08em">ORIGIN · t₀</text>
          <text x="${cx}" y="${n.y + 34}" text-anchor="middle" fill="#f9fafb" font-size="11" font-family="IBM Plex Sans, sans-serif">${label}</text>
        </g>`;
      }
      return `<g class="xm-prop-node">
        <title>${tip}</title>
        <rect x="${boxX}" y="${n.y}" width="${boxW}" height="${n.h}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="1.25"/>
        <text x="${cx}" y="${n.y + 20}" text-anchor="middle" fill="#e5e7eb" font-size="10" font-family="IBM Plex Sans, sans-serif">#${n.rank} · ${label}</text>
      </g>`;
    }).join("");

    const legendY = svgH - 34;
    const legend = `<text x="${cx}" y="${legendY}" text-anchor="middle" fill="#9ca3af" font-size="8.5" font-family="IBM Plex Sans, sans-serif">Timeline ↓ · delays shown only between boxes · first gap = after origin · Δ = since prior venue</text>
      <text x="${cx}" y="${legendY + 14}" text-anchor="middle" fill="#6b7280" font-size="8" font-family="IBM Plex Mono, monospace">median ${p.spreadVelocity ?? "—"}s · avg ${p.avgDelaySec ?? "—"}s · hover for details</text>`;

    el.innerHTML = `<svg class="xm-prop-svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-label="Propagation timeline (origin at top, followers by arrival time)">${segmentsSvg.join("")}${nodesSvg}${legend}</svg>`;
  }

  function renderAll(data, propagation) {
    premiumsMeta = data?.premiums || {};
    ensureChartShells();
    ensureZScrollClock();
    renderPremiumTimeline();
    renderZHeatmap();
    renderPropGraph(propagation);
  }

  function bindResize() {
    window.addEventListener("resize", () => {
      const screen = document.querySelector(
        '#dashboard-misc .menu-screen[data-l2="cross-market"][data-l3="monitor"]',
      );
      if (!screen || screen.hidden) return;
      renderPremiumTimeline();
      renderZHeatmap();
    });
  }

  loadWindowKey();
  bindResize();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureChartShells);
  } else {
    ensureChartShells();
  }

  return {
    renderAll,
    renderPremiumTimeline,
    renderZHeatmap,
    renderPropGraph,
    bindWindowControls,
    ensureChartShells,
    setWindow,
    getWindowKey: () => windowKey,
  };
})();

window.XMCharts = XMCharts;