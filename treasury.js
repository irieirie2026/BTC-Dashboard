const TREASURY_API = "/api/treasury";
const TREASURY_POLL_MS = 900_000;

let treasuryData = null;
let treasuryFilter = { search: "", country: "" };

const DOMINANCE_COLORS = {
  BTC: "trs-dominance-seg--btc",
  ETH: "trs-dominance-seg--eth",
  SOL: "trs-dominance-seg--sol",
  BNB: "trs-dominance-seg--bnb",
  XRP: "trs-dominance-seg--xrp",
};

function formatMnav(n) {
  if (n == null || Number.isNaN(n)) return "";
  return "[" + n.toFixed(2) + "]";
}

function mnavClass(n) {
  if (n == null) return "trs-mnav--empty";
  if (n < 0.95) return "trs-mnav--discount";
  if (n > 1.05) return "trs-mnav--premium";
  return "trs-mnav--parity";
}

function filteredCompanies() {
  if (!treasuryData) return [];
  const q = treasuryFilter.search.trim().toLowerCase();
  return treasuryData.companies.filter((c) => {
    if (treasuryFilter.country && c.countryCode !== treasuryFilter.country) return false;
    if (!q) return true;
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.ticker || "").toLowerCase().includes(q)
    );
  });
}

function renderDominance(dominance) {
  const bar = $("trs-dominance-bar");
  const valEl = $("trs-btc-dominance");
  if (!bar || !valEl || !dominance) return;

  const btcPct = dominance.BTC ?? 100;
  valEl.textContent =
    (treasuryData?.summary?.btcDominanceLabel || btcPct.toFixed(1) + "%");

  const order = ["BTC", "ETH", "SOL", "BNB", "XRP"];
  bar.innerHTML = order
    .filter((k) => dominance[k] > 0)
    .map(
      (k) =>
        `<span class="trs-dominance-seg ${DOMINANCE_COLORS[k] || ""}" style="width:${dominance[k]}%" title="${k} ${dominance[k]}%"></span>`,
    )
    .join("");

  const legend = order
    .filter((k) => dominance[k] > 0)
    .map((k) => {
      const v = dominance[k];
      const label = v < 1 ? v.toFixed(2) : v.toFixed(1);
      return `${k} ${label}%`;
    })
    .join(" · ");

  let legendEl = document.getElementById("trs-dominance-legend");
  if (!legendEl) {
    legendEl = document.createElement("div");
    legendEl.id = "trs-dominance-legend";
    legendEl.className = "trs-dominance-legend";
    bar.after(legendEl);
  }
  legendEl.textContent = legend;
}

function renderHero(summary, btcPrice, btcChange24h) {
  $("trs-total-btc").textContent = summary.totalBtcLabel || "—";
  $("trs-total-usd").textContent = summary.totalUsdLabel || formatUsdCompact(summary.totalUsd);
  $("trs-company-count").textContent = String(summary.count || "—");

  const priceLabel = summary.btcPriceLabel || (btcPrice ? "$" + formatPrice(btcPrice, 0) : "—");
  $("trs-btc-price").textContent = priceLabel;

  const tablePrice = $("trs-table-btc-price");
  if (tablePrice) tablePrice.textContent = priceLabel;

  const chEl = $("trs-btc-change");
  if (chEl) {
    if (btcChange24h != null) {
      const sign = btcChange24h >= 0 ? "+" : "";
      chEl.textContent = sign + btcChange24h.toFixed(2) + "% 24h";
      chEl.className = "trs-stat-sub " + (btcChange24h >= 0 ? "positive" : "negative");
    } else {
      chEl.textContent = "";
    }
  }

  renderDominance(summary.assetDominance);
}

function renderTreasuryCompaniesTable(companies) {
  const body = $("trs-companies-body");
  const countEl = $("trs-table-count");
  if (!body) return;

  const total = treasuryData?.companies?.length || 0;
  if (countEl) {
    countEl.textContent =
      companies.length === total
        ? total + " companies · data from BitcoinTreasuries.net"
        : companies.length + " of " + total + " companies";
  }

  if (!companies.length) {
    body.innerHTML =
      '<tr><td colspan="6" class="etf-error">No companies match your filters.</td></tr>';
    return;
  }

  body.innerHTML = companies
    .map((c) => {
      const rowClass = c.slug === "strategy" ? "trs-row-strategy" : "";
      const nameHtml = c.url
        ? `<a class="trs-company-link" href="${c.url}" target="_blank" rel="noopener noreferrer">${c.name}</a>`
        : `<span class="trs-company-name">${c.name}</span>`;
      const mnavHtml = c.mnav != null
        ? `<span class="trs-mnav ${mnavClass(c.mnav)}">${formatMnav(c.mnav)}</span>`
        : "";
      return `
    <tr class="${rowClass}">
      <td class="mono">${c.rank}</td>
      <td class="trs-col-company">${nameHtml}</td>
      <td class="trs-col-flag" title="${c.countryName || ""}">${c.countryFlag || "—"}</td>
      <td>${c.ticker ? `<span class="trs-ticker-badge">${c.ticker}</span>` : ""}</td>
      <td class="mono">${c.btc.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
      <td class="mono">${mnavHtml}</td>
    </tr>`;
    })
    .join("");
}

function populateCountryFilter(companies) {
  const select = $("trs-country-filter");
  if (!select) return;
  const current = treasuryFilter.country;
  const countries = {};
  companies.forEach((c) => {
    if (c.countryCode) countries[c.countryCode] = c.countryName || c.countryCode;
  });
  const sorted = Object.entries(countries).sort((a, b) => a[1].localeCompare(b[1]));
  select.innerHTML =
    '<option value="">All countries</option>' +
    sorted.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
  select.value = current;
}

function fmtBtcCompact(n) {
  const v = Number(n);
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M BTC";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K BTC";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " BTC";
}

function buildTopHolders(companies, limit = 15) {
  return [...companies]
    .filter((c) => c.btc > 0)
    .sort((a, b) => b.btc - a.btc)
    .slice(0, limit)
    .map((c) => ({
      label: c.ticker || c.name?.slice(0, 12) || "—",
      btc: c.btc,
      name: c.name,
    }));
}

function aggregateByCountry(companies, topN = 8) {
  const totals = new Map();
  for (const c of companies) {
    if (!c.btc) continue;
    const code = c.countryCode || "—";
    const entry = totals.get(code) || {
      code,
      name: c.countryName || code,
      flag: c.countryFlag || "",
      btc: 0,
    };
    entry.btc += c.btc;
    totals.set(code, entry);
  }
  const sorted = [...totals.values()].sort((a, b) => b.btc - a.btc);
  const top = sorted.slice(0, topN);
  const restBtc = sorted.slice(topN).reduce((s, r) => s + r.btc, 0);
  if (restBtc > 0) {
    top.push({ code: "OTHER", name: "Other", flag: "🌐", btc: restBtc });
  }
  return top;
}

const MNAV_BINS = [
  { label: "<0.8", lo: 0, hi: 0.8, color: "rgba(246, 70, 93, 0.8)" },
  { label: "0.8–0.95", lo: 0.8, hi: 0.95, color: "rgba(246, 70, 93, 0.55)" },
  { label: "0.95–1.05", lo: 0.95, hi: 1.05, color: "rgba(148, 163, 184, 0.75)" },
  { label: "1.05–1.25", lo: 1.05, hi: 1.25, color: "rgba(14, 203, 129, 0.55)" },
  { label: ">1.25", lo: 1.25, hi: Infinity, color: "rgba(14, 203, 129, 0.8)" },
];

function buildMnavHistogram(companies) {
  const withMnav = companies.filter((c) => c.mnav != null && !Number.isNaN(c.mnav));
  return MNAV_BINS.map((bin) => ({
    ...bin,
    count: withMnav.filter((c) => {
      if (bin.hi === Infinity) return c.mnav >= bin.lo;
      if (bin.lo === 0) return c.mnav < bin.hi;
      return c.mnav >= bin.lo && c.mnav < bin.hi;
    }).length,
  }));
}

function setupCanvas(canvas, w, h) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const co = () => window.ChartOutlier;

function drawHolderBarLabels(ctx, row, y, bodyH, pad, valueX) {
  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(row.label, pad.left - 8, y + bodyH / 2);
  ctx.textAlign = "left";
  ctx.fillStyle = "#e8eaed";
  ctx.fillText(fmtBtcCompact(row.btc), valueX + 6, y + bodyH / 2);
}

function drawLinearHolderBar(ctx, row, y, bodyH, barW, pad, accent = false) {
  const grad = ctx.createLinearGradient(pad.left, y, pad.left + barW, y);
  if (accent) {
    grad.addColorStop(0, "rgba(192, 132, 252, 0.7)");
    grad.addColorStop(1, "rgba(167, 139, 250, 1)");
  } else {
    grad.addColorStop(0, "rgba(192, 132, 252, 0.55)");
    grad.addColorStop(1, "rgba(192, 132, 252, 0.9)");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(pad.left, y, barW, bodyH);
  drawHolderBarLabels(ctx, row, y, bodyH, pad, pad.left + barW);
}

function drawTreasuryTopHoldersChart(rows, w, h) {
  const canvas = document.getElementById("trs-top-holders-chart");
  if (!canvas || !rows.length || w < 4) return;

  const ctx = setupCanvas(canvas, w, h);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 12, right: 16, bottom: 12, left: 108 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const ordered = [...rows].reverse();
  const values = rows.map((r) => r.btc);
  const outlier = co()?.isBarOutlier(values);
  const outlierRow = outlier ? rows[0] : null;
  const scaleMax = co()?.barScaleMax(values, outlier) ?? Math.max(...values, 1);
  const barH = chartH / ordered.length;
  const bodyH = Math.max(barH * 0.68, 10);

  ordered.forEach((r, i) => {
    const y = pad.top + i * barH + (barH - bodyH) / 2;
    if (outlier && r === outlierRow && co()?.drawBrokenHBar) {
      const segEnd = co().drawBrokenHBar(ctx, {
        x0: pad.left,
        y,
        bodyH,
        chartW,
        colorStart: "rgba(192, 132, 252, 0.7)",
        colorEnd: "rgba(167, 139, 250, 1)",
      });
      drawHolderBarLabels(ctx, r, y, bodyH, pad, segEnd);
      return;
    }
    const barW = (r.btc / scaleMax) * chartW;
    drawLinearHolderBar(ctx, r, y, bodyH, barW, pad);
  });
}

function drawTreasuryCountryChart(rows, w, h) {
  const canvas = document.getElementById("trs-country-chart");
  if (!canvas || !rows.length || w < 4) return;

  const ctx = setupCanvas(canvas, w, h);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 12, right: 16, bottom: 12, left: 132 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const ordered = [...rows].reverse();
  const values = rows.map((r) => r.btc);
  const outlier = co()?.isBarOutlier(values);
  const outlierRow = outlier ? rows[0] : null;
  const scaleMax = co()?.barScaleMax(values, outlier) ?? Math.max(...values, 1);
  const barH = chartH / ordered.length;
  const bodyH = Math.max(barH * 0.68, 10);
  const palette = [
    "rgba(192, 132, 252, 0.85)",
    "rgba(167, 139, 250, 0.8)",
    "rgba(244, 114, 182, 0.75)",
    "rgba(251, 191, 36, 0.75)",
    "rgba(96, 165, 250, 0.75)",
    "rgba(14, 203, 129, 0.7)",
    "rgba(248, 113, 113, 0.7)",
    "rgba(129, 140, 248, 0.7)",
    "rgba(125, 135, 153, 0.65)",
  ];

  ordered.forEach((r, i) => {
    const y = pad.top + i * barH + (barH - bodyH) / 2;
    const label = (r.flag ? r.flag + " " : "") + (r.name || r.code);
    const labelText = label.length > 16 ? label.slice(0, 15) + "…" : label;
    const color = palette[i % palette.length];

    if (outlier && r === outlierRow && co()?.drawBrokenHBar) {
      const segEnd = co().drawBrokenHBar(ctx, {
        x0: pad.left,
        y,
        bodyH,
        chartW,
        colorStart: color,
        colorEnd: color,
      });
      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, pad.left - 8, y + bodyH / 2);
      ctx.textAlign = "left";
      ctx.fillStyle = "#e8eaed";
      ctx.fillText(fmtBtcCompact(r.btc), segEnd + 6, y + bodyH / 2);
      return;
    }

    const barW = (r.btc / scaleMax) * chartW;
    ctx.fillStyle = color;
    ctx.fillRect(pad.left, y, barW, bodyH);
    ctx.fillStyle = "#7d8799";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, pad.left - 8, y + bodyH / 2);
    ctx.textAlign = "left";
    ctx.fillText(fmtBtcCompact(r.btc), pad.left + barW + 6, y + bodyH / 2);
  });
}

function drawTreasurySupplyChart(pct21m, totalBtcLabel, w, h) {
  const canvas = document.getElementById("trs-supply-chart");
  if (!canvas || pct21m == null || w < 4) return;

  const ctx = setupCanvas(canvas, w, h);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.72;
  const radius = Math.min(w * 0.32, h * 0.55, 72);
  const start = Math.PI;
  const end = 2 * Math.PI;
  const filled = start + (pct21m / 100) * Math.PI;

  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(125, 135, 153, 0.2)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();

  ctx.strokeStyle = "#c084fc";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, filled);
  ctx.stroke();

  ctx.fillStyle = "#e8eaed";
  ctx.font = "600 18px IBM Plex Sans, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pct21m.toFixed(2) + "%", cx, cy - 6);

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.fillText("of 21M BTC supply", cx, cy + 14);
  if (totalBtcLabel) {
    ctx.fillText(totalBtcLabel + " held", cx, cy + 28);
  }
}

function drawTreasuryMnavChart(bins, w, h) {
  const canvas = document.getElementById("trs-mnav-chart");
  if (!canvas || !bins.length || w < 4) return;

  const ctx = setupCanvas(canvas, w, h);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 18, right: 16, bottom: 36, left: 40 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const barW = chartW / bins.length;

  bins.forEach((b, i) => {
    const barH = (b.count / maxCount) * chartH;
    const x = pad.left + i * barW + 2;
    const y = pad.top + chartH - barH;
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, Math.max(barW - 4, 4), barH);

    ctx.fillStyle = "#7d8799";
    ctx.font = "9px IBM Plex Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(b.label, x + (barW - 4) / 2, h - 10);
    if (b.count > 0) {
      ctx.fillStyle = "#e8eaed";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.fillText(String(b.count), x + (barW - 4) / 2, y - 4);
    }
  });

  const parityIdx = bins.findIndex((b) => b.lo <= 1 && b.hi > 1);
  if (parityIdx >= 0) {
    const px = pad.left + parityIdx * barW + barW / 2;
    ctx.strokeStyle = "rgba(240, 185, 11, 0.45)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, h - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function renderTreasurySummaryCharts() {
  if (!treasuryData) return;
  const { companies, summary } = treasuryData;
  const topHolders = buildTopHolders(companies);
  const byCountry = aggregateByCountry(companies);
  const mnavBins = buildMnavHistogram(companies);

  const supplyMeta = document.getElementById("trs-supply-pct-meta");
  if (supplyMeta && summary?.pct21m != null) {
    supplyMeta.textContent =
      summary.pct21m.toFixed(2) + "% of max supply · " + (summary.totalBtcLabel || "");
  }

  const topMeta = document.getElementById("trs-top-holders-meta");
  if (topMeta) {
    topMeta.textContent = co()?.isBarOutlier(topHolders.map((r) => r.btc))
      ? `${topHolders[0].label} scale break · ranks 2–15 on separate axis`
      : "Top 15 public companies by BTC balance";
  }

  const countryMeta = document.getElementById("trs-country-chart-meta");
  if (countryMeta) {
    const countryVals = byCountry.map((r) => r.btc);
    countryMeta.textContent = co()?.isBarOutlier(countryVals)
      ? `${byCountry[0].name || byCountry[0].code} scale break · others on separate axis`
      : "Corporate BTC by country of incorporation";
  }

  scheduleChartDraw(document.getElementById("trs-top-holders-chart"), (w, h) =>
    drawTreasuryTopHoldersChart(topHolders, w, h),
  );
  scheduleChartDraw(document.getElementById("trs-country-chart"), (w, h) =>
    drawTreasuryCountryChart(byCountry, w, h),
  );
  scheduleChartDraw(document.getElementById("trs-supply-chart"), (w, h) =>
    drawTreasurySupplyChart(summary?.pct21m, summary?.totalBtcLabel, w, h),
  );
  scheduleChartDraw(document.getElementById("trs-mnav-chart"), (w, h) =>
    drawTreasuryMnavChart(mnavBins, w, h),
  );
}

function renderTreasuryDashboard() {
  if (!treasuryData?.summary || !Array.isArray(treasuryData.companies)) return;
  renderHero(treasuryData.summary, treasuryData.btcPrice, treasuryData.btcChange24h);
  renderTreasurySummaryCharts();
  populateCountryFilter(treasuryData.companies);
  renderTreasuryCompaniesTable(filteredCompanies());
}

window.loadTreasuryDashboard = async function loadTreasuryDashboard() {
  const swr = window.DashboardSWR;
  if (!swr) return;
  const updateEl = $("trs-update");

  try {
    await swr.runSWR({
      key: "treasury",
      l1: "treasury",
      source: "BitcoinTreasuries.net",
      fetch: async () => {
        const res = await fetch(TREASURY_API);
        if (!res.ok) throw new Error("API " + res.status);
        const data = await res.json();
        data.fetchedAt = new Date().toISOString();
        return data;
      },
      render: (data, opts = {}) => {
        if (opts.loading) {
          if (updateEl) updateEl.textContent = "Loading from BitcoinTreasuries.net…";
          const body = document.getElementById("trs-companies-body");
          if (body) {
            body.innerHTML =
              '<tr><td colspan="6" class="etf-error">Loading companies…</td></tr>';
          }
          return;
        }
        treasuryData = data;
        renderTreasuryDashboard();
        const stamp = swr.formatPanelMeta({
          fetchedAt: data.fetchedAt,
          source: "BitcoinTreasuries.net",
          stale: opts.stale,
          refreshing: opts.refreshing,
          refreshFailed: opts.refreshFailed,
        });
        if (updateEl) updateEl.textContent = stamp;
      },
    });
  } catch (err) {
    console.error("Treasury dashboard error:", err);
    const body = $("trs-companies-body");
    if (body && !treasuryData) {
      body.innerHTML =
        '<tr><td colspan="6" class="etf-error">Could not load treasury data. Start with <code>python3 server.py</code>.</td></tr>';
    }
  }
}

window.refreshTreasurySummaryCharts = function () {
  renderTreasurySummaryCharts();
};

function initTreasuryDashboard() {
  const search = $("trs-search");
  const country = $("trs-country-filter");

  window.addEventListener("resize", () => {
    if (treasuryData) renderTreasurySummaryCharts();
  });

  if (search) {
    search.addEventListener("input", () => {
      treasuryFilter.search = search.value;
      renderTreasuryCompaniesTable(filteredCompanies());
    });
  }
  if (country) {
    country.addEventListener("change", () => {
      treasuryFilter.country = country.value;
      renderTreasuryCompaniesTable(filteredCompanies());
    });
  }

  setInterval(() => {
    const view = document.getElementById("dashboard-treasury");
    if (view && !view.hidden) loadTreasuryDashboard();
  }, TREASURY_POLL_MS);
}