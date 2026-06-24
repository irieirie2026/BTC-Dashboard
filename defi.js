const DEFI_SECTIONS = [
  "wrapped",
  "stables",
  "bridges",
  "lending",
  "liquidity",
  "staking",
];

const DEFI_POLL_MS = 300_000;
const defiCache = {};
let defiPollTimer = null;
let defiActiveSection = null;
let defiReady = false;

const dfEl = (id) => document.getElementById(id);

function fmtUsd(n, compact = true) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (compact) {
    if (Math.abs(v) >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (Math.abs(v) >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  }
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtBtc(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(4) + " BTC";
  return v.toFixed(8) + " BTC";
}

function fmtNum(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(d);
}

function fmtPct(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return prefix + Number(n).toFixed(d) + "%";
}

function fmtApy(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return (Number(n) * 100).toFixed(2) + "%";
}

function changeClass(n) {
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "";
}

function heroHelpKey(section, name) {
  const n = (name || "").toLowerCase();
  if (section === "stables") return "defi-hero-stables";
  if (section === "lending") return "defi-hero-lending";
  if (section === "liquidity") return "defi-hero-liquidity";
  if (section === "staking") return "defi-hero-staking";
  if (section === "bridges") return "defi-hero-bridge";
  if (section === "wrapped") return "defi-hero-wrapped";
  return `defi-hero-${section}`;
}

function setHelpTitle(el, text, helpKey) {
  if (!el) return;
  const key = helpKey || el.dataset.helpKey;
  if (key && window.labelWithHelp) {
    el.dataset.helpKey = key;
    el.innerHTML = window.labelWithHelp(text, key);
    el.dataset.helpDecorated = "true";
  } else {
    el.textContent = text;
  }
}

function defiScreenRoot(section) {
  return document.querySelector(
    `#dashboard-defi .menu-screen[data-l2="${section}"]`,
  );
}

function heroValue(hero, section) {
  if (section === "stables" && hero.name === "Total Stablecoin MCap") {
    return fmtUsd(hero.value);
  }
  if (typeof hero.value === "number" && hero.value < 100 && hero.name?.includes("APY")) {
    return fmtApy(hero.value);
  }
  if (typeof hero.value === "number" && hero.value > 1000) {
    return fmtUsd(hero.value);
  }
  if (typeof hero.value === "number") {
    return fmtNum(hero.value, hero.value < 10 ? 4 : 0);
  }
  return hero.value ?? "—";
}

async function fetchDefiSection(section) {
  const res = await fetch(`/api/defi/${section}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `DeFi ${section} ${res.status}`);
  }
  return res.json();
}

function buildDefiCommentary(data) {
  const lines = [];
  const heroes = data.heroes || [];
  const table = data.table || [];

  if (!heroes.length) return ["Data unavailable."];

  const lead = heroes[0];
  lines.push(
    `${data.title}: ${lead.name} at ${heroValue(lead, data.section)}` +
      (lead.sub ? ` (${lead.sub})` : "") +
      `. Source: ${data.source}.`,
  );

  if (data.section === "wrapped" && data.prices?.length) {
    const spot = data.prices.find((p) => p.name === "BTC");
    const wbtc = data.prices.find((p) => p.name === "WBTC");
    const cb = data.prices.find((p) => p.name === "cbBTC");
    if (spot?.price && wbtc?.price) {
      const prem = ((wbtc.price - spot.price) / spot.price) * 100;
      lines.push(
        `Spot BTC ${fmtUsd(spot.price, false)} · WBTC ${fmtUsd(wbtc.price, false)} ` +
          `(${fmtPct(prem)} vs spot).` +
          (cb?.price ? ` cbBTC ${fmtUsd(cb.price, false)}.` : ""),
      );
    }
  }

  if (data.section === "stables") {
    const top = table[0];
    if (top) {
      lines.push(
        `Largest stable: ${top.name} (${top.symbol}) at ${fmtUsd(top.mcap)} market cap, ` +
          `price ${fmtNum(top.price, 4)}.`,
      );
    }
    const dom = data.chart2?.items || [];
    if (dom.length >= 2) {
      lines.push(
        `Dominance: ${dom
          .slice(0, 3)
          .map((d) => `${d.name} ${fmtNum(d.share, 1)}%`)
          .join(" · ")}.`,
      );
    }
  }

  if (data.section === "lending" || data.section === "staking") {
    const top = table[0];
    if (top?.apy != null) {
      lines.push(
        `Top pool: ${top.name || top.project} ${top.symbol} on ${top.chain || "—"} — ` +
          `TVL ${fmtUsd(top.tvl)} · APY ${fmtApy(top.apy)}.`,
      );
    }
  }

  if (data.section === "liquidity") {
    const top = table[0];
    if (top) {
      lines.push(
        `Highest 24h DEX volume: ${top.name} at ${fmtUsd(top.volume24h)} ` +
          `(${fmtPct(top.change1d)} 1d). WBTC/cbBTC pairs trade across these venues.`,
      );
    }
  }

  const pts = data.chart?.points || [];
  if (pts.length >= 2) {
    const first = pts[0].close;
    const last = pts[pts.length - 1].close;
    const ret = first ? ((last - first) / first) * 100 : 0;
    lines.push(
      `${data.chartLabel || "TVL"} trend: ${fmtPct(ret)} ` +
        `(${pts[0].date} → ${pts[pts.length - 1].date}).`,
    );
  }

  return lines;
}

function renderDefiHeroes(section, data) {
  const strip = dfEl(`defi-${section}-heroes`);
  if (!strip) return;

  strip.innerHTML = (data.heroes || [])
    .slice(0, 4)
    .map((h) => {
      const label = window.labelWithHelp
        ? window.labelWithHelp(h.name, heroHelpKey(section, h.name))
        : h.name;
      return `
      <article class="deriv-hero-block">
        <span class="deriv-hero-label">${label}</span>
        <span class="deriv-hero-value ${changeClass(h.changePct)}">${heroValue(h, section)}</span>
        <span class="deriv-hero-sub">${h.sub || (h.changePct != null ? fmtPct(h.changePct) : "")}</span>
      </article>`;
    })
    .join("");
}

function renderDefiTable(section, data) {
  const body = dfEl(`defi-${section}-table-body`);
  if (!body) return;
  const mode = data.tableMode || "protocol";
  const rows = data.table || [];

  if (mode === "stables") {
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${r.name}<span class="defi-symbol-tag">${r.symbol}</span></td>
        <td class="mono">${fmtUsd(r.mcap)}</td>
        <td class="mono">${fmtNum(r.price, 4)}</td>
        <td class="mono ${changeClass(r.change7d)}">${fmtPct(r.change7d)}</td>
        <td class="mono">${r.chains ?? "—"}</td>
      </tr>`,
      )
      .join("");
    return;
  }

  if (mode === "lending" || mode === "staking") {
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${r.name}<span class="defi-symbol-tag">${r.symbol || r.category || ""}</span></td>
        <td class="mono">${r.chain || r.chains || "—"}</td>
        <td class="mono">${fmtUsd(r.tvl)}</td>
        <td class="mono">${r.apy != null ? fmtApy(r.apy) : "—"}</td>
        <td class="mono ${changeClass(r.change1d ?? r.change7d)}">${r.change7d != null ? fmtPct(r.change7d) : r.change1d != null ? fmtPct(r.change1d) : "—"}</td>
      </tr>`,
      )
      .join("");
    return;
  }

  if (mode === "liquidity") {
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${r.name}</td>
        <td class="mono">${fmtUsd(r.volume24h)}</td>
        <td class="mono ${changeClass(r.change1d)}">${fmtPct(r.change1d)}</td>
        <td class="mono ${changeClass(r.change7d)}">${fmtPct(r.change7d)}</td>
        <td>${r.chains || "—"}</td>
      </tr>`,
      )
      .join("");
    return;
  }



  body.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${r.name}<span class="defi-symbol-tag">${r.category || r.slug || ""}</span></td>
        <td class="mono">${fmtUsd(r.tvl)}</td>
        <td class="mono ${changeClass(r.change1d)}">${fmtPct(r.change1d)}</td>
        <td>${r.chains || "—"}</td>
      </tr>`,
    )
    .join("");
}

function paintDefiLineChart(canvasId, data, w, h, options = {}) {
  const pts = data?.points || [];
  if (!pts.length) return;

  const canvas = dfEl(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 18, right: 20, bottom: 36, left: 64 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const closes = pts.map((p) => p.close);
  const minV = Math.min(...closes);
  const maxV = Math.max(...closes);
  const range = maxV - minV || 0.01;
  const color = options.color || "#a855f7";

  const fmtY = (v) => fmtUsd(v);

  ctx.fillStyle = color.replace(")", ", 0.12)").replace("rgb", "rgba").replace("#a855f7", "rgba(168, 85, 247, 0.12)");
  if (color.startsWith("#")) {
    ctx.fillStyle = "rgba(168, 85, 247, 0.12)";
  }
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

  ctx.strokeStyle = color;
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

function paintDefiDominanceChart(data, w, h) {
  const items = data?.items || [];
  if (!items.length) return;

  const canvas = dfEl("defi-stables-dominance-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 16, right: 16, bottom: 28, left: 72 };
  const barH = Math.min(22, (h - pad.top - pad.bottom) / items.length - 6);
  const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#eab308", "#94a3b8"];
  const chartW = w - pad.left - pad.right;
  const co = window.ChartOutlier;
  const values = items.map((i) => i.share || 0);
  const outlier = co?.isBarOutlier(values);
  const outlierIdx = outlier ? co.findOutlierIndex(items, (i) => i.share || 0) : -1;
  const scaleMax = co?.barScaleMax(values, outlier) ?? Math.max(...values, 1);

  items.forEach((item, idx) => {
    const y = pad.top + idx * (barH + 8);
    const color = colors[idx % colors.length];
    let valueX;

    if (outlier && idx === outlierIdx) {
      valueX = co.drawBrokenHBar(ctx, {
        x0: pad.left,
        y,
        bodyH: barH,
        chartW,
        colorStart: color,
        colorEnd: color,
      });
    } else {
      const barW = ((item.share || 0) / scaleMax) * chartW;
      ctx.fillStyle = color;
      ctx.fillRect(pad.left, y, barW, barH);
      valueX = pad.left + barW;
    }

    ctx.fillStyle = "#c8d0dc";
    ctx.font = "11px IBM Plex Sans, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(item.name, pad.left - 8, y + barH * 0.72);
    ctx.textAlign = "left";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.fillStyle = "#7d8799";
    ctx.fillText(`${fmtNum(item.share, 1)}% · ${fmtUsd(item.mcap)}`, valueX + 8, y + barH * 0.72);
  });
}

function renderDefiCommentary(section, data) {
  const node = dfEl(`defi-${section}-commentary`);
  if (!node) return;
  node.innerHTML = buildDefiCommentary(data)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function renderDefiCharts(section, data) {
  const chartTitle = dfEl(`defi-${section}-chart-title`);
  if (chartTitle) {
    setHelpTitle(
      chartTitle,
      data.chartLabel || "Chart",
      chartTitle.dataset.helpKey || "defi-tvl-chart",
    );
  }

  const chartWrap = dfEl(`defi-${section}-chart-wrap`);
  const chart2Wrap = dfEl(`defi-${section}-chart2-wrap`);

  const hasChart = (data.chart?.points || []).length >= 2;
  if (chartWrap) chartWrap.hidden = !hasChart;

  if (section === "stables") {
    if (hasChart) {
      scheduleChartDraw(dfEl(`defi-${section}-chart`), (w, h) =>
        paintDefiLineChart(`defi-${section}-chart`, data.chart, w, h, { color: "#22c55e" }),
      );
    }
    const hasDom = (data.chart2?.items || []).length > 0;
    if (chart2Wrap) chart2Wrap.hidden = !hasDom;
    if (hasDom) {
      scheduleChartDraw(dfEl("defi-stables-dominance-chart"), (w, h) =>
        paintDefiDominanceChart(data.chart2, w, h),
      );
    }
    return;
  }

  if (hasChart) {
    scheduleChartDraw(dfEl(`defi-${section}-chart`), (w, h) =>
      paintDefiLineChart(`defi-${section}-chart`, data.chart, w, h),
    );
  }
}

function renderDefiScreen(section, data, opts = {}) {
  if (!data) return;
  defiCache[section] = data;

  const updateEl = dfEl(`defi-${section}-update`);
  if (updateEl) {
    updateEl.textContent = window.DashboardSWR?.formatPanelMeta({
      fetchedAt: data.fetchedAt,
      source: data.source || "DeFi Llama",
      stale: opts.stale,
      refreshing: opts.refreshing,
      refreshFailed: opts.refreshFailed,
    }) || "—";
    updateEl.classList.toggle(
      "header-meta--stale",
      !!(opts.stale && (opts.refreshing || opts.refreshFailed)),
    );
  }

  renderDefiHeroes(section, data);
  renderDefiTable(section, data);
  renderDefiCommentary(section, data);
  renderDefiCharts(section, data);
  window.decorateHelpLabels?.(defiScreenRoot(section));
}

async function loadDefiSection(section) {
  if (!DEFI_SECTIONS.includes(section)) return;
  defiActiveSection = section;

  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: `defi:${section}`,
      l1: "defi",
      source: "DeFi Llama",
      fetch: () => fetchDefiSection(section),
      render: (data, opts = {}) => {
        if (opts.loading) {
          const body = dfEl(`defi-${section}-table-body`);
          if (body) body.innerHTML = '<tr><td colspan="5">Loading DeFi data…</td></tr>';
          return;
        }
        renderDefiScreen(section, data, opts);
      },
    });
  } catch (err) {
    console.error("DeFi load failed:", section, err);
    const commentary = dfEl(`defi-${section}-commentary`);
    if (commentary && !defiCache[section]) {
      commentary.innerHTML = `<p>Failed to load ${section} data. Is server.py running?</p>`;
    }
  }
}

function startDefiPoll() {
  if (defiPollTimer) return;
  defiPollTimer = setInterval(() => {
    if (defiActiveSection) loadDefiSection(defiActiveSection);
  }, DEFI_POLL_MS);
}

function initDefiModule() {
  if (defiReady) return;
  defiReady = true;
  window.addEventListener("resize", () => {
    if (!defiActiveSection || !defiCache[defiActiveSection]) return;
    renderDefiCharts(defiActiveSection, defiCache[defiActiveSection]);
  });
}

window.loadDefiDashboard = function () {
  initDefiModule();
  startDefiPoll();
  window.decorateHelpLabels?.(document.getElementById("dashboard-defi"));
};

window.loadDefiSection = loadDefiSection;