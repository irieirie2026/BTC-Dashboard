const MACRO_SECTIONS = [
  "rates",
  "dollar",
  "liquidity",
  "risk",
  "inflation",
  "commodities",
];

const macroCache = {};
let macroActiveSection = null;
let macroReady = false;

const mcEl = (id) => document.getElementById(id);

function fmtNum(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(d);
}

function fmtPct(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return prefix + Number(n).toFixed(d) + "%";
}

function fmtChange(n, mode) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  if (mode === "yield") return prefix + Number(n).toFixed(3) + " bp";
  if (mode === "fx") return prefix + Number(n).toFixed(4);
  return prefix + Number(n).toFixed(2);
}

function fmtPrice(q, mode) {
  const p = q?.price;
  if (p == null || Number.isNaN(p)) return "—";
  if (mode === "yield") return fmtNum(p, 2) + "%";
  if (mode === "fx") return fmtNum(p, 4);
  if (p >= 1000) {
    return Number(p).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return fmtNum(p, 2);
}

function changeClass(n) {
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "";
}

async function fetchMacroSection(section) {
  const res = await fetch(`/api/macro/${section}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Macro ${section} ${res.status}`);
  }
  return res.json();
}

function buildMacroCommentary(data) {
  const lines = [];
  const mode = data.priceMode || "price";
  const heroes = data.heroes || [];
  const table = data.table || [];

  if (!heroes.length) return ["Macro data unavailable."];

  const lead = heroes[0];
  lines.push(
    `BTC Macro · ${data.title}: ${lead.name} at ${fmtPrice(lead, mode)} ` +
      `(${fmtChange(lead.change, mode)}, ${fmtPct(lead.changePct)}). ` +
      `Delayed quotes via ${data.source}.`,
  );

  const sorted = [...table].sort(
    (a, b) => (b.changePct ?? 0) - (a.changePct ?? 0),
  );
  const gainers = sorted.filter((r) => (r.changePct ?? 0) > 0).slice(0, 3);
  if (gainers.length) {
    lines.push(
      `Firm today: ${gainers.map((r) => `${r.name} ${fmtPct(r.changePct)}`).join(" · ")}.`,
    );
  }

  const pts = data.chart?.points || [];
  if (pts.length >= 2) {
    const first = pts[0].close;
    const last = pts[pts.length - 1].close;
    const ret = first ? (last - first) / first : 0;
    lines.push(
      `${data.chartLabel} 3-month move: ${fmtPct(ret)} ` +
        `(${pts[0].date} → ${pts[pts.length - 1].date}).`,
    );
  }

  const notes = {
    rates:
      "Higher real yields raise the opportunity cost of holding non-yielding BTC; watch the 10Y and TLT for discount-rate shocks.",
    dollar:
      "A stronger dollar (DXY) often weighs on BTC and risk assets priced in USD — inverse correlation is common in risk-off regimes.",
    liquidity:
      "Financial conditions drive crypto liquidity cycles — tight credit and falling TLT often coincide with BTC drawdowns.",
    risk:
      "VIX and credit spreads flag risk appetite; BTC trades as a high-beta asset during macro stress and recovery phases.",
    inflation:
      "Inflation breakevens and TIPS matter for the digital-store-of-value narrative — gold and TIP moves are BTC macro comps.",
    commodities:
      "Gold is the closest TradFi analogue to BTC; energy and industrial metals reflect growth and geopolitical risk premia.",
  };
  if (notes[data.section]) lines.push(notes[data.section]);

  return lines;
}

function renderMacroHeroes(section, data) {
  const strip = mcEl(`macro-${section}-heroes`);
  if (!strip) return;
  const mode = data.priceMode || "price";

  strip.innerHTML = (data.heroes || [])
    .slice(0, 4)
    .map(
      (q) => `
      <article class="deriv-hero-block">
        <span class="deriv-hero-label">${q.name}</span>
        <span class="deriv-hero-value ${changeClass(q.changePct)}">${fmtPrice(q, mode)}</span>
        <span class="deriv-hero-sub">${fmtChange(q.change, mode)} · ${fmtPct(q.changePct)}</span>
      </article>`,
    )
    .join("");
}

function renderMacroTable(section, data) {
  const body = mcEl(`macro-${section}-table-body`);
  if (!body) return;
  const mode = data.priceMode || "price";

  body.innerHTML = (data.table || [])
    .map(
      (q) => `
      <tr>
        <td>${q.name}<span class="macro-symbol-tag">${q.symbol}</span></td>
        <td class="mono">${fmtPrice(q, mode)}</td>
        <td class="mono ${changeClass(q.change)}">${fmtChange(q.change, mode)}</td>
        <td class="mono ${changeClass(q.changePct)}">${fmtPct(q.changePct)}</td>
      </tr>`,
    )
    .join("");
}

function paintMacroChart(data, w, h) {
  const pts = data.chart?.points || [];
  if (!pts.length) return;

  const canvas = mcEl(`macro-${data.section}-chart`);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 18, right: 20, bottom: 36, left: 56 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const closes = pts.map((p) => p.close);
  const minV = Math.min(...closes);
  const maxV = Math.max(...closes);
  const range = maxV - minV || 0.01;
  const mode = data.priceMode || "price";

  const fmtY = (v) => {
    if (mode === "yield") return fmtNum(v, 2) + "%";
    if (mode === "fx") return fmtNum(v, 2);
    return fmtNum(v, 0);
  };

  ctx.fillStyle = "rgba(20, 184, 166, 0.12)";
  ctx.beginPath();
  closes.forEach((v, i) => {
    const x = pad.left + (i / Math.max(closes.length - 1, 1)) * chartW;
    const y = pad.top + chartH - ((v - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, pad.top + chartH);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + chartW, pad.top + chartH);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#14b8a6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  closes.forEach((v, i) => {
    const x = pad.left + (i / Math.max(closes.length - 1, 1)) * chartW;
    const y = pad.top + chartH - ((v - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(fmtY(maxV), pad.left - 6, pad.top + 10);
  ctx.fillText(fmtY(minV), pad.left - 6, h - pad.bottom);

  drawTimeAxisLabels(ctx, w, h, pad, pts.length, (i) =>
    fmtChartDate(pts[i]?.date, pts.length > 120),
  );
}

function renderMacroCommentary(section, data) {
  const node = mcEl(`macro-${section}-commentary`);
  if (!node) return;
  node.innerHTML = buildMacroCommentary(data)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function renderMacroScreen(section, data, opts = {}) {
  if (!data) return;
  macroCache[section] = data;

  const updateEl = mcEl(`macro-${section}-update`);
  if (updateEl) {
    updateEl.textContent = window.DashboardSWR?.formatPanelMeta({
      fetchedAt: data.fetchedAt,
      source: `${data.source || "Yahoo Finance"} · delayed`,
      stale: opts.stale,
      refreshing: opts.refreshing,
      refreshFailed: opts.refreshFailed,
    }) || "—";
    updateEl.classList.toggle(
      "header-meta--stale",
      !!(opts.stale && (opts.refreshing || opts.refreshFailed)),
    );
  }

  const chartTitle = mcEl(`macro-${section}-chart-title`);
  if (chartTitle && window.labelWithHelp) {
    chartTitle.dataset.helpKey = "macro-benchmark-chart";
    chartTitle.innerHTML = window.labelWithHelp(
      data.chartLabel || "Benchmark",
      "macro-benchmark-chart",
    );
    chartTitle.dataset.helpDecorated = "true";
  } else if (chartTitle) {
    chartTitle.textContent = data.chartLabel || "Benchmark";
  }

  renderMacroHeroes(section, data);
  renderMacroTable(section, data);
  renderMacroCommentary(section, data);

  scheduleChartDraw(mcEl(`macro-${section}-chart`), (w, h) =>
    paintMacroChart(data, w, h),
  );

  const screen = document.querySelector(
    `#dashboard-macro .menu-screen[data-l2="${section}"]`,
  );
  window.decorateHelpLabels?.(screen);
}

async function loadMacroSection(section) {
  if (!MACRO_SECTIONS.includes(section)) return;
  macroActiveSection = section;

  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: `macro:${section}`,
      l1: "macro",
      source: "Yahoo Finance",
      persist: true,
      revalidate: false,
      fetch: () => fetchMacroSection(section),
      render: (data, opts = {}) => {
        if (opts.loading) {
          const body = mcEl(`macro-${section}-table-body`);
          if (body) body.innerHTML = '<tr><td colspan="4">Loading macro data…</td></tr>';
          return;
        }
        renderMacroScreen(section, data, opts);
      },
    });
  } catch (err) {
    console.error("Macro load failed:", section, err);
    const commentary = mcEl(`macro-${section}-commentary`);
    if (commentary && !macroCache[section]) {
      commentary.innerHTML = `<p>Failed to load ${section} data. Is server.py running?</p>`;
    }
  }
}

function initMacroModule() {
  if (macroReady) return;
  macroReady = true;
  window.addEventListener("resize", () => {
    if (!macroActiveSection || !macroCache[macroActiveSection]) return;
    scheduleChartDraw(mcEl(`macro-${macroActiveSection}-chart`), (w, h) =>
      paintMacroChart(macroCache[macroActiveSection], w, h),
    );
  });
}

window.loadMacroDashboard = function () {
  initMacroModule();
  window.initMacroDrivers?.();
  window.decorateHelpLabels?.(document.getElementById("dashboard-macro"));
};

window.loadMacroSection = loadMacroSection;