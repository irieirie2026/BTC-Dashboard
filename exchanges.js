const EXCHANGES_SECTIONS = ["overview", "spot", "perp", "volume"];

const EXCHANGES_POLL_MS = 300_000;
const exchangesCache = {};
let exchangesPollTimer = null;
let exchangesActiveSection = null;
let exchangesReady = false;

const exEl = (id) => document.getElementById(id);

const COLUMN_LABELS = {
  exchange: "Exchange",
  pair: "Pair",
  market: "Market",
  price: "Last",
  bid: "Bid",
  ask: "Ask",
  spread: "Spread",
  changePct: "Chg %",
  spreadVsMedian: "vs Median",
  high: "24h High",
  low: "24h Low",
  volume: "24h Vol",
  sharePct: "Share %",
  basisPct: "Basis %",
  fundingPct: "Funding %",
};

function fmtExPrice(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtExPct(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return prefix + Number(n).toFixed(d) + "%";
}

function fmtExVol(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
}

function isExNumericCol(col) {
  return col !== "exchange" && col !== "pair" && col !== "market";
}

function fmtExCell(col, row) {
  const v = row[col];
  if (v == null || v === "") return "—";
  if (col === "price" || col === "bid" || col === "ask" || col === "high" || col === "low" || col === "spread") {
    return "$" + fmtExPrice(v);
  }
  if (col === "changePct" || col === "spreadVsMedian" || col === "sharePct" || col === "basisPct" || col === "fundingPct") {
    return fmtExPct(v, col === "fundingPct" ? 4 : 2);
  }
  if (col === "volume") return fmtExVol(v);
  return String(v);
}

function changeClass(col, v) {
  if (col !== "changePct" && col !== "spreadVsMedian" && col !== "basisPct" && col !== "fundingPct") {
    return "";
  }
  if (v == null || Number.isNaN(v)) return "";
  if (v > 0) return "positive";
  if (v < 0) return "negative";
  return "";
}

async function fetchExchangesSection(section) {
  const res = await fetch(`/api/exchanges/${section}?_=${Date.now()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Exchanges ${section} ${res.status}`);
  }
  return res.json();
}

function renderExchangesHeroes(section, data) {
  const strip = exEl(`exchanges-${section}-heroes`);
  if (!strip) return;

  strip.innerHTML = (data.heroes || [])
    .slice(0, 4)
    .map(
      (h) => `
      <article class="deriv-hero-block">
        <span class="deriv-hero-label">${h.name}</span>
        <span class="deriv-hero-value">${h.value ?? "—"}</span>
        <span class="deriv-hero-sub">${h.sub || ""}</span>
      </article>`,
    )
    .join("");
}

function renderExchangesTable(section, data) {
  const body = exEl(`exchanges-${section}-table-body`);
  const head = exEl(`exchanges-${section}-table-head`);
  if (!body) return;

  const cols = data.columns || [];
  if (head) {
    head.innerHTML = cols
      .map((c) => {
        const cls = isExNumericCol(c) ? ' class="mono"' : "";
        return `<th${cls}>${COLUMN_LABELS[c] || c}</th>`;
      })
      .join("");
  }

  const rows = data.table || [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${Math.max(cols.length, 1)}">No venue data available.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((row) => {
      const cells = cols
        .map((col) => {
          const v = row[col];
          const cls = [isExNumericCol(col) ? "mono" : "", changeClass(col, v)]
            .filter(Boolean)
            .join(" ");
          return `<td class="${cls}">${fmtExCell(col, row)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
}

function renderExchangesCommentary(section, data) {
  const node = exEl(`exchanges-${section}-commentary`);
  if (!node) return;
  const lines = data.commentary || [];
  node.innerHTML = lines.map((p) => `<p>${p}</p>`).join("");
}

const EXCHART_COLORS = [
  "#6366f1",
  "#818cf8",
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#a78bfa",
  "#06b6d4",
  "#ef4444",
  "#eab308",
  "#94a3b8",
];

function paintExchangesChart(section, data, w, h) {
  const chart = data.chart || {};
  const items = chart.items || [];
  const canvas = exEl(`exchanges-${section}-chart`);
  if (!canvas || !items.length) return;

  const co = window.ChartOutlier;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 12, right: 16, bottom: 12, left: 76 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const barH = Math.min(18, chartH / items.length - 4);
  const signed = !!chart.signed;

  if (signed) {
    const values = items.map((i) => i.value || 0);
    const outlier = co?.isBarOutlier(values);
    const outlierIdx = outlier
      ? co.findOutlierIndex(items, (i) => i.value || 0)
      : -1;
    const scaleMax = co?.barScaleMax(values, outlier) ?? Math.max(...values.map(Math.abs), 0.001);
    const halfW = chartW / 2 - 8;
    const mid = pad.left + chartW / 2;

    items.forEach((item, idx) => {
      const y = pad.top + idx * (barH + 4);
      const val = item.value || 0;
      const positive = val >= 0;
      let labelX;

      if (outlier && idx === outlierIdx) {
        const edge = co.drawBrokenHBarDiverging(ctx, {
          mid,
          y,
          bodyH: barH,
          halfW,
          positive,
          colorStart: positive ? "rgba(34, 197, 94, 0.75)" : "rgba(239, 68, 68, 0.75)",
          colorEnd: positive ? "rgba(14, 203, 129, 0.9)" : "rgba(246, 70, 93, 0.9)",
        }).edge;
        labelX = positive ? edge + 6 : edge - 6;
      } else {
        const barW = (Math.abs(val) / scaleMax) * halfW;
        ctx.fillStyle = positive ? "rgba(34, 197, 94, 0.75)" : "rgba(239, 68, 68, 0.75)";
        if (positive) {
          ctx.fillRect(mid, y, barW, barH);
          labelX = mid + barW + 6;
        } else {
          ctx.fillRect(mid - barW, y, barW, barH);
          labelX = mid - barW - 6;
        }
      }

      ctx.fillStyle = "#c8d0dc";
      ctx.font = "10px IBM Plex Sans, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(item.label, pad.left - 6, y + barH * 0.72);
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.fillStyle = "#7d8799";
      ctx.textAlign = positive ? "left" : "right";
      ctx.fillText(item.display || String(val), labelX, y + barH * 0.72);
    });

    ctx.strokeStyle = "rgba(125, 135, 153, 0.35)";
    ctx.beginPath();
    ctx.moveTo(mid, pad.top - 4);
    ctx.lineTo(mid, pad.top + chartH + 4);
    ctx.stroke();
    return;
  }

  const values = items.map((i) => i.value || 0);
  const outlier = co?.isBarOutlier(values);
  const outlierIdx = outlier ? co.findOutlierIndex(items, (i) => i.value || 0) : -1;
  const scaleMax = co?.barScaleMax(values, outlier) ?? Math.max(...values, 1);

  items.forEach((item, idx) => {
    const y = pad.top + idx * (barH + 4);
    let valueX;

    if (outlier && idx === outlierIdx) {
      valueX = co.drawBrokenHBar(ctx, {
        x0: pad.left,
        y,
        bodyH: barH,
        chartW,
        colorStart: EXCHART_COLORS[idx % EXCHART_COLORS.length],
        colorEnd: EXCHART_COLORS[idx % EXCHART_COLORS.length],
      });
    } else {
      const barW = ((item.value || 0) / scaleMax) * chartW;
      ctx.fillStyle = EXCHART_COLORS[idx % EXCHART_COLORS.length];
      ctx.fillRect(pad.left, y, barW, barH);
      valueX = pad.left + barW;
    }

    ctx.fillStyle = "#c8d0dc";
    ctx.font = "10px IBM Plex Sans, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(item.label, pad.left - 6, y + barH * 0.72);
    ctx.textAlign = "left";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.fillStyle = "#7d8799";
    ctx.fillText(item.display || String(item.value), valueX + 6, y + barH * 0.72);
  });
}

function renderExchangesChart(section, data) {
  const chart = data.chart || {};
  const titleEl = exEl(`exchanges-${section}-chart-title`);
  if (titleEl) {
    const key = `exchanges-${section}-chart`;
    if (window.labelWithHelp) {
      titleEl.dataset.helpKey = key;
      titleEl.innerHTML = window.labelWithHelp(chart.title || "Chart", key);
      titleEl.dataset.helpDecorated = "true";
    } else {
      titleEl.textContent = chart.title || "Chart";
    }
  }

  scheduleChartDraw(exEl(`exchanges-${section}-chart`), (w, h) =>
    paintExchangesChart(section, data, w, h),
  );
}

function renderExchangesScreen(section, data, opts = {}) {
  if (!data) return;
  exchangesCache[section] = data;

  const updateEl = exEl(`exchanges-${section}-update`);
  if (updateEl) {
    updateEl.textContent = window.DashboardSWR?.formatPanelMeta({
      fetchedAt: data.fetchedAt,
      source: data.source || "Exchange APIs",
      stale: opts.stale,
      refreshing: opts.refreshing,
      refreshFailed: opts.refreshFailed,
    }) || "—";
    updateEl.classList.toggle(
      "header-meta--stale",
      !!(opts.stale && (opts.refreshing || opts.refreshFailed)),
    );
  }

  renderExchangesHeroes(section, data);
  renderExchangesTable(section, data);
  renderExchangesChart(section, data);
  renderExchangesCommentary(section, data);

  const screen = document.querySelector(
    `#dashboard-exchanges .menu-screen[data-l2="${section}"]`,
  );
  window.decorateHelpLabels?.(screen);
}

async function loadExchangesSection(section) {
  if (!EXCHANGES_SECTIONS.includes(section)) return;
  exchangesActiveSection = section;

  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: `exchanges:${section}`,
      l1: "exchanges",
      source: "Exchange APIs",
      fetch: () => fetchExchangesSection(section),
      render: (data, opts = {}) => {
        const body = exEl(`exchanges-${section}-table-body`);
        if (opts.loading) {
          if (body) body.innerHTML = '<tr><td colspan="6">Loading exchange data…</td></tr>';
          return;
        }
        renderExchangesScreen(section, data, opts);
      },
    });
  } catch (err) {
    console.error("Exchanges load failed:", section, err);
    const commentary = exEl(`exchanges-${section}-commentary`);
    if (commentary && !exchangesCache[section]) {
      commentary.innerHTML = `<p>Failed to load ${section} data. Is server.py running?</p>`;
    }
    const body = exEl(`exchanges-${section}-table-body`);
    if (body && !exchangesCache[section]) {
      body.innerHTML = '<tr><td colspan="6">Failed to load exchange data.</td></tr>';
    }
  }
}

function startExchangesPoll() {
  if (exchangesPollTimer) return;
  exchangesPollTimer = setInterval(() => {
    if (exchangesActiveSection) loadExchangesSection(exchangesActiveSection);
  }, EXCHANGES_POLL_MS);
}

function initExchangesModule() {
  if (exchangesReady) return;
  exchangesReady = true;
  window.addEventListener("resize", () => {
    if (!exchangesActiveSection || !exchangesCache[exchangesActiveSection]) return;
    const section = exchangesActiveSection;
    const data = exchangesCache[section];
    scheduleChartDraw(exEl(`exchanges-${section}-chart`), (w, h) =>
      paintExchangesChart(section, data, w, h),
    );
  });
}

window.loadExchangesDashboard = function () {
  initExchangesModule();
  startExchangesPoll();
  window.decorateHelpLabels?.(document.getElementById("dashboard-exchanges"));
};

window.loadExchangesSection = loadExchangesSection;