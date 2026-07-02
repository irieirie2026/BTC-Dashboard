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

  const PREM_COLORS = {
    kimchi: "#f59e0b",
    coinbase: "#38bdf8",
    jpy: "#a78bfa",
    kraken: "#0ecb81",
    bitstamp: "#94a3b8",
    gemini: "#f472b6",
    okx: "#fb923c",
    bybit: "#c084fc",
  };

  const PREM_LABELS = {
    kimchi: "Kimchi",
    coinbase: "Coinbase",
    jpy: "Japan",
    kraken: "Kraken",
    bitstamp: "Bitstamp",
    gemini: "Gemini",
    okx: "OKX",
    bybit: "Bybit",
  };

  let windowKey = "5m";
  let controlsBound = false;

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

  function downsamplePts(pts, maxPts = 280) {
    if (!pts?.length || pts.length <= maxPts) return pts || [];
    const out = [];
    const step = (pts.length - 1) / (maxPts - 1);
    for (let i = 0; i < maxPts; i++) {
      out.push(pts[Math.min(pts.length - 1, Math.round(i * step))]);
    }
    return out;
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
    try { localStorage.setItem("xm-chart-window", key); } catch { /* ignore */ }
    syncWindowButtons();
    renderPremiumTimeline();
    renderZHeatmap();
  }

  function bindWindowControls() {
    loadWindowKey();
    ensureChartShells();
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
      const chartH = h - pad.top - pad.bottom;
      if (chartW < 8 || chartH < 8) return;

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
      let minV = Math.min(...vals);
      let maxV = Math.max(...vals);
      const span = maxV - minV || 0.5;
      minV -= span * 0.12;
      maxV += span * 0.12;
      const ySpan = maxV - minV || 1;

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top + chartH / 2);
      ctx.lineTo(pad.left + chartW, pad.top + chartH / 2);
      ctx.stroke();

      activeIds.forEach((id) => {
        const pts = downsamplePts(
          series[id].filter((p) => p.t >= axis.tStart && p.t <= axis.tEnd),
        );
        if (!pts.length) return;
        const color = PREM_COLORS[id] || "#e5e7eb";
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

      ctx.textAlign = "left";
      let lx = pad.left;
      ctx.font = "8px IBM Plex Sans, sans-serif";
      activeIds.forEach((id) => {
        const label = PREM_LABELS[id] || id;
        ctx.fillStyle = PREM_COLORS[id] || "#e5e7eb";
        ctx.fillRect(lx, pad.top + 2, 6, 6);
        ctx.fillStyle = "#9ca3af";
        ctx.fillText(label, lx + 9, pad.top + 8);
        lx += ctx.measureText(label).width + 14;
      });
    });
  }

  function drawAxisLabels(ctx, axis, pad, chartW, h) {
    if (typeof fmtChartTime !== "function") return;
    ctx.fillStyle = "#7d8799";
    ctx.font = "8px IBM Plex Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(fmtChartTime(axis.tStart), pad.left, h - 4);
    ctx.fillText("now", pad.left + chartW, h - 4);
  }

  function renderZHeatmap() {
    const canvas = document.getElementById("xm-chart-zmatrix");
    if (!canvas || !window.XMEngine?.zTimeMatrixTimed) return;

    const windowMs = getWindowMs();
    const axis = fixedAxis(windowMs);
    const matrix = XMEngine.zTimeMatrixTimed(windowMs);
    const venues = Object.keys(matrix).sort();
    const COLS = 48;

    xmScheduleDraw(canvas, (layoutW, layoutH) => {
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
      const cellW = chartW / COLS;
      const cellH = chartH / rows;

      const slotTimes = Array.from({ length: COLS }, (_, ci) =>
        axis.tStart + (ci / Math.max(COLS - 1, 1)) * axis.windowMs,
      );

      venues.forEach((venue, ri) => {
        const sorted = [...matrix[venue]].sort((a, b) => a.t - b.t);
        const dataStart = sorted[0]?.t ?? axis.tEnd;

        ctx.fillStyle = "#9ca3af";
        ctx.font = "8px IBM Plex Mono, monospace";
        ctx.textAlign = "right";
        ctx.fillText(venue.slice(0, 9), pad.left - 4, pad.top + ri * cellH + cellH * 0.7);

        slotTimes.forEach((t, ci) => {
          const x = timeToX(t, axis, pad.left, chartW) - cellW * 0.5;
          if (t < dataStart) return;

          let z = valueAtTime(sorted, t);
          if (z == null) return;

          const heat = Math.min(1, Math.abs(z) / 4);
          const r = Math.round(245 * heat + 30 * (1 - heat));
          const g = Math.round(158 * heat + 40 * (1 - heat));
          const b = Math.round(11 * heat + 60 * (1 - heat));
          ctx.fillStyle = `rgba(${r},${g},${b},${0.2 + heat * 0.55})`;
          ctx.fillRect(
            x,
            pad.top + ri * cellH + 0.5,
            Math.max(2, cellW - 0.5),
            Math.max(2, cellH - 1),
          );
        });
      });

      drawAxisLabels(ctx, axis, pad, chartW, h);
    });
  }

  function renderPropGraph(propagation) {
    const el = document.getElementById("xm-chart-prop");
    if (!el) return;

    const p = propagation;
    if (!p?.edges?.length) {
      el.innerHTML = "<p class=\"xm-muted\">Propagation graph appears when ≥2 venues cluster within 10–45s.</p>";
      return;
    }

    const nodes = new Set([p.origin]);
    p.edges.forEach((e) => { nodes.add(e.from); nodes.add(e.to); });
    const nodeList = [p.origin, ...[...nodes].filter((n) => n !== p.origin)];
    const svgW = 280;
    const svgH = Math.max(120, nodeList.length * 36 + 24);
    const cx = svgW / 2;
    const originY = 28;
    const followerY = (i) => 56 + i * 32;

    const edgesSvg = p.edges.map((e) => {
      const toIdx = nodeList.indexOf(e.to);
      const y2 = toIdx <= 0 ? originY + 20 : followerY(toIdx - 1);
      const delay = e.delaySec;
      const stroke = delay <= 45 ? "#0ecb81" : delay <= 90 ? "#f59e0b" : "#38bdf8";
      return `<line x1="${cx}" y1="${originY + 10}" x2="${cx}" y2="${y2 - 6}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>
        <text x="${cx + 8}" y="${(originY + y2) / 2}" fill="#6b7280" font-size="9" font-family="IBM Plex Mono, monospace">${delay}s</text>`;
    }).join("");

    const nodesSvg = nodeList.map((n, i) => {
      const y = i === 0 ? originY : followerY(i - 1);
      const isOrigin = i === 0;
      const fill = isOrigin ? "rgba(245,158,11,0.25)" : "rgba(56,189,248,0.15)";
      const stroke = isOrigin ? "#f59e0b" : "#38bdf8";
      return `<rect x="${cx - 52}" y="${y - 12}" width="104" height="22" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
        <text x="${cx}" y="${y + 3}" text-anchor="middle" fill="#e5e7eb" font-size="10" font-family="IBM Plex Sans, sans-serif">${n}</text>`;
    }).join("");

    const vel = p.spreadVelocity != null
      ? `<text x="${cx}" y="${svgH - 6}" text-anchor="middle" fill="#9ca3af" font-size="9" font-family="IBM Plex Mono, monospace">spreadVelocity median ${p.spreadVelocity}s · avg ${p.avgDelaySec}s</text>`
      : "";

    el.innerHTML = `<svg class="xm-prop-svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" aria-label="Propagation graph">${edgesSvg}${nodesSvg}${vel}</svg>`;
  }

  function renderAll(data, propagation) {
    ensureChartShells();
    renderPremiumTimeline();
    renderZHeatmap();
    renderPropGraph(propagation);
  }

  function bindResize() {
    window.addEventListener("resize", () => {
      const screen = document.querySelector('#dashboard-misc .menu-screen[data-l2="cross-market"]');
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