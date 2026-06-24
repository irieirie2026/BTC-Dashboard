const ETF_API = "/api/etf";
const ETF_POLL_MS = 900_000;
let etfData = null;
let etfPollTimer = null;

function formatUsdCompact(n) {
  const v = Number(n);
  if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatFlowUsdM(n) {
  const v = Number(n);
  const prefix = v >= 0 ? "+$" : "-$";
  return prefix + Math.abs(v).toFixed(1) + "M";
}

function flowClass(n) {
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "";
}

function renderEtfHero(holdings, latestFlow) {
  $("etf-total-aum").textContent = formatUsdCompact(holdings.totalUsd);
  $("etf-total-btc").textContent =
    holdings.totalBtc.toLocaleString("en-US", { maximumFractionDigits: 0 }) +
    " BTC";
  $("etf-pct-21m").textContent = holdings.pct21m
    ? holdings.pct21m.toFixed(3) + "%"
    : "—";

  const flowEl = $("etf-latest-flow");
  if (latestFlow) {
    flowEl.textContent = formatFlowUsdM(latestFlow.totalUsdM);
    flowEl.className = "etf-hero-value " + flowClass(latestFlow.totalUsdM);
    $("etf-latest-flow-date").textContent = latestFlow.date;
  } else {
    flowEl.textContent = "—";
    flowEl.className = "etf-hero-value";
    $("etf-latest-flow-date").textContent = "No flow data";
  }

  $("etf-holdings-updated").textContent = holdings.updated
    ? "Holdings · " + holdings.updated
    : "—";
}

function computeFlowSummaries(rows) {
  if (!rows.length) return [];

  const last5 = rows.slice(0, 5);
  const fiveDayTotal = last5.reduce((s, r) => s + r.totalUsdM, 0);
  const dailyAvg = rows.reduce((s, r) => s + r.totalUsdM, 0) / rows.length;
  const inflowTotal = rows
    .filter((r) => r.totalUsdM > 0)
    .reduce((s, r) => s + r.totalUsdM, 0);
  const outflowTotal = rows
    .filter((r) => r.totalUsdM < 0)
    .reduce((s, r) => s + r.totalUsdM, 0);

  return [
    { label: "5 trading days", totalUsdM: fiveDayTotal },
    { label: "Daily average", totalUsdM: dailyAvg },
    { label: "Inflow days total", totalUsdM: inflowTotal },
    { label: "Outflow days total", totalUsdM: outflowTotal },
  ];
}

function renderEtfSummaryCards(flows) {
  let summaries = flows.summaries || [];
  if (summaries.length < 4 && flows.rows?.length) {
    summaries = computeFlowSummaries(flows.rows);
  }
  const cards = [
    {
      label: "5-Day Net Flow",
      helpKey: "etf-5d-flow",
      value: summaries[0] ? formatFlowUsdM(summaries[0].totalUsdM) : "—",
      valueClass: summaries[0] ? flowClass(summaries[0].totalUsdM) : "",
      sub: "Last 5 trading days",
    },
    {
      label: "Daily Average",
      helpKey: "etf-daily-avg",
      value: summaries[1] ? formatFlowUsdM(summaries[1].totalUsdM) : "—",
      valueClass: summaries[1] ? flowClass(summaries[1].totalUsdM) : "",
      sub: "Average per trading day",
    },
    {
      label: "Inflow Days Total",
      helpKey: "etf-inflow-days",
      value: summaries[2] ? formatFlowUsdM(summaries[2].totalUsdM) : "—",
      valueClass: "positive",
      sub: "Sum on positive flow days",
    },
    {
      label: "Outflow Days Total",
      helpKey: "etf-outflow-days",
      value: summaries[3] ? formatFlowUsdM(summaries[3].totalUsdM) : "—",
      valueClass: "negative",
      sub: "Sum on negative flow days",
    },
  ];

  renderDataGrid(cards, "etf-summary-grid");
}

function renderHoldingsTable(etfs) {
  const body = $("etf-holdings-body");
  if (!body) return;

  body.innerHTML = etfs
    .map(
      (etf) => `
    <tr>
      <td>
        <span class="etf-ticker">${etf.ticker}</span>
        <span class="etf-name">${etf.name}</span>
      </td>
      <td class="mono">${etf.btc.toLocaleString("en-US", { maximumFractionDigits: 1 })}</td>
      <td class="mono">${formatUsdCompact(etf.usd)}</td>
      <td class="mono">${etf.pct21m.toFixed(3)}%</td>
      <td class="etf-exchange">${etf.exchange}</td>
    </tr>`,
    )
    .join("");
}

function renderFlowsTable(flows) {
  const body = $("etf-flows-body");
  const head = $("etf-flows-head");
  if (!body || !head) return;

  const tickers = flows.tickers;
  head.innerHTML =
    `<tr><th>Date</th>` +
    tickers.map((t) => `<th>${t}</th>`).join("") +
    `<th>Total</th></tr>`;

  body.innerHTML = flows.rows
    .map((row) => {
      const cells = tickers
        .map((t) => {
          const v = row.flows[t] ?? 0;
          return `<td class="mono ${flowClass(v)}">${v.toFixed(1)}</td>`;
        })
        .join("");
      return `<tr>
        <td>${row.date}</td>
        ${cells}
        <td class="mono ${flowClass(row.totalUsdM)}"><strong>${row.totalUsdM.toFixed(1)}</strong></td>
      </tr>`;
    })
    .join("");
}

function drawEtfFlowChart(rows) {
  const canvas = $("etf-flow-chart");
  if (!canvas || !rows.length) return;

  const ordered = [...rows].reverse();
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 16, right: 16, bottom: 32, left: 48 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const values = ordered.map((r) => r.totalUsdM);
  const absValues = values.map((v) => Math.abs(v));
  const co = window.ChartOutlier;
  const outlier = co?.isBarOutlier(absValues);
  const outlierIdx = outlier ? co.findOutlierIndex(ordered, (r) => r.totalUsdM) : -1;
  const scaleMax = co?.barScaleMax(absValues, outlier) ?? Math.max(...absValues, 1);
  const zeroY = pad.top + chartH / 2;
  const barW = chartW / values.length;
  const bodyW = Math.max(barW * 0.55, 4);
  const halfH = chartH / 2 - 4;

  ctx.strokeStyle = "rgba(125, 135, 153, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(w - pad.right, zeroY);
  ctx.stroke();

  ordered.forEach((row, i) => {
    const v = row.totalUsdM;
    const x = pad.left + i * barW + barW / 2;
    const color = v >= 0 ? "#0ecb81" : "#f6465d";
    const upward = v >= 0;

    if (outlier && i === outlierIdx) {
      co.drawBrokenVBar(ctx, {
        x,
        bodyW,
        zeroY,
        chartH: halfH,
        upward,
        colorStart: color,
        colorEnd: color,
      });
    } else {
      const barH = (Math.abs(v) / scaleMax) * halfH;
      ctx.fillStyle = color;
      if (upward) {
        ctx.fillRect(x - bodyW / 2, zeroY - barH, bodyW, barH);
      } else {
        ctx.fillRect(x - bodyW / 2, zeroY, bodyW, barH);
      }
    }
  });

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(formatFlowUsdM(scaleMax), pad.left - 6, pad.top + 10);
  ctx.fillText(formatFlowUsdM(-scaleMax), pad.left - 6, h - pad.bottom);
  drawTimeAxisLabels(
    ctx,
    w,
    h,
    pad,
    ordered.length,
    (i) => ordered[i].date,
    { ticks: Math.min(ordered.length, 6), y: h - 10 },
  );
}

function renderEtfDashboardData(data) {
  etfData = data;
  const { holdings, flows } = data;
  const latestFlow = flows.rows[0];
  renderEtfHero(holdings, latestFlow);
  renderEtfSummaryCards(flows);
  renderHoldingsTable(holdings.etfs);
  renderFlowsTable(flows);
  drawEtfFlowChart(flows.rows);
}

async function loadEtfDashboard() {
  const swr = window.DashboardSWR;
  if (!swr) return;
  const updateEl = $("etf-update");

  try {
    await swr.runSWR({
      key: "etf",
      l1: "etf",
      source: "Bitbo",
      fetch: async () => {
        const res = await fetch(ETF_API);
        if (!res.ok) throw new Error("API " + res.status);
        const data = await res.json();
        data.fetchedAt = new Date().toISOString();
        return data;
      },
      render: (data, opts = {}) => {
        if (opts.loading) {
          if (updateEl) updateEl.textContent = "Loading…";
          return;
        }
        renderEtfDashboardData(data);
        const stamp = swr.formatPanelMeta({
          fetchedAt: data.fetchedAt,
          source: "Bitbo",
          stale: opts.stale,
          refreshing: opts.refreshing,
          refreshFailed: opts.refreshFailed,
        });
        if (updateEl) updateEl.textContent = stamp;
      },
    });
  } catch (err) {
    console.error("ETF dashboard error:", err);
    if (!etfData) {
      $("etf-holdings-body").innerHTML =
        '<tr><td colspan="5" class="etf-error">Could not load ETF data. Start the app with <code>python3 server.py</code>.</td></tr>';
    }
  }
}

window.refreshEtfFlowChart = function () {
  if (etfData?.flows?.rows) drawEtfFlowChart(etfData.flows.rows);
};

function initEtfDashboard() {
  window.addEventListener("resize", () => {
    window.refreshEtfFlowChart();
  });

  if (!etfPollTimer) {
    etfPollTimer = setInterval(() => {
      const etfView = document.getElementById("dashboard-etf");
      if (etfView && !etfView.hidden) loadEtfDashboard();
    }, ETF_POLL_MS);
  }
}