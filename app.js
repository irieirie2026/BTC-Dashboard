const SYMBOL = "BTCUSDT";
const REST_BASE = "https://api.binance.com/api/v3";
const FUTURES_REST = "https://fapi.binance.com";
const MEMPOOL_BASE = "https://mempool.space/api";
const CHAIN_STATS_URL = "https://api.blockchain.info/stats";
const WS_URL =
  "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/btcusdt@kline_1m/btcusdt@depth20@100ms";
const FUTURES_WS_URL =
  "wss://fstream.binance.com/stream?streams=btcusdt@ticker/btcusdt@markPrice@1s";

const CHAIN_POLL_MS = 60_000;
const INDICATOR_POLL_MS = 300_000;
const FUTURES_POLL_MS = 60_000;

const MARKET_INDICATOR_TF = {
  "1h": { interval: "1h", limit: 250, label: "1h" },
  "4h": { interval: "4h", limit: 250, label: "4h" },
  d: { interval: "1d", limit: 250, label: "D" },
};

let activeIndicatorTf = "1h";
const marketIndicatorCache = {};

const candles = [];
let lastBids = [];
let lastAsks = [];

let prevPrice = null;
let ws = null;
let reconnectTimer = null;
let futuresWs = null;
let futuresReconnectTimer = null;
let nextFundingTime = null;
let futuresSentimentItems = [];
let futuresMarketState = {};
let chainSnapshot = {};

const $ = (id) => document.getElementById(id);

function formatPrice(n, decimals = 2) {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatVolume(n) {
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(2);
}

function formatBtc(n) {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatHashrate(ghs) {
  const eh = ghs / 1e9;
  return eh >= 100 ? eh.toFixed(1) + " EH/s" : eh.toFixed(2) + " EH/s";
}

function formatLargeNum(n) {
  const v = Number(n);
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toLocaleString("en-US");
}

function formatDifficulty(n) {
  const t = Number(n) / 1e12;
  return t.toFixed(2) + "T";
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 48) return Math.floor(h / 24) + "d " + (h % 24) + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

function setConnectionStatus(state, elId = "connection-status") {
  const ids =
    elId === "futures-status"
      ? ["futures-status", "futures-status-header"]
      : [elId];

  const label =
    state === "connected"
      ? "Live"
      : state === "disconnected"
        ? "Disconnected"
        : "Connecting…";

  ids.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.className = "status " + state;
    const textEl = el.querySelector(".status-text");
    if (textEl) textEl.textContent = label;
  });
}

function setFuturesPanelMeta(opts = {}) {
  const panel = $("futures-update");
  if (!panel) return;
  panel.textContent =
    window.DashboardSWR?.formatPanelMeta(opts) || opts.fallback || "—";
}

function formatPct(n, decimals = 2) {
  const v = Number(n);
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}

function formatFundingRate(rate) {
  return (Number(rate) * 100).toFixed(4) + "%";
}

function formatRatio(ratio) {
  return Number(ratio).toFixed(2);
}

function flashPrice(direction) {
  const el = $("price");
  el.classList.remove("flash-up", "flash-down");
  void el.offsetWidth;
  el.classList.add(direction === "up" ? "flash-up" : "flash-down");
  setTimeout(() => el.classList.remove("flash-up", "flash-down"), 400);
}

function updateTicker(data) {
  const price = parseFloat(data.c);
  const open = parseFloat(data.o);
  const change = price - open;
  const changePct = (change / open) * 100;
  const isPositive = change >= 0;

  $("price").textContent = formatPrice(price);

  if (prevPrice !== null && price !== prevPrice) {
    flashPrice(price > prevPrice ? "up" : "down");
  }
  prevPrice = price;

  const changeEl = $("price-change");
  changeEl.className = "price-change " + (isPositive ? "positive" : "negative");
  changeEl.querySelector(".change-pct").textContent =
    (isPositive ? "+" : "") + changePct.toFixed(2) + "%";
  changeEl.querySelector(".change-abs").textContent =
    (isPositive ? "+" : "") + formatPrice(change) + " USDT";

  $("high-24h").textContent = formatPrice(data.h);
  $("low-24h").textContent = formatPrice(data.l);
  $("vol-btc").textContent = formatBtc(data.v) + " BTC";
  $("vol-usdt").textContent = formatVolume(data.q) + " USDT";
  $("weighted-avg").textContent = formatPrice(data.w);
}

function updateDepth(data) {
  lastBids = data.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]);
  lastAsks = data.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)]);

  if (lastBids.length === 0 || lastAsks.length === 0) return;

  const bestBid = lastBids[0][0];
  const bestAsk = lastAsks[0][0];
  const spread = bestAsk - bestBid;
  const spreadPct = (spread / bestBid) * 100;
  const mid = (bestBid + bestAsk) / 2;

  $("best-bid").textContent = formatPrice(bestBid);
  $("best-ask").textContent = formatPrice(bestAsk);
  $("spread").textContent =
    formatPrice(spread) + " (" + spreadPct.toFixed(4) + "%)";
  $("book-mid").textContent = formatPrice(mid);
  $("spread-bid").textContent = formatPrice(bestBid);
  $("spread-ask").textContent = formatPrice(bestAsk);

  drawDepthChart(lastBids, lastAsks, mid);
  renderOrderBookLadder(lastBids, lastAsks);
}

function buildCumulative(levels) {
  let total = 0;
  return levels.map(([price, qty]) => {
    total += qty;
    return { price, qty, total };
  });
}

function drawDepthChart(bids, asks, mid) {
  const canvas = $("depth-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 16, right: 16, bottom: 28, left: 16 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const bidLevels = buildCumulative(bids);
  const askLevels = buildCumulative(asks);
  const maxCum = Math.max(
    bidLevels[bidLevels.length - 1]?.total ?? 0,
    askLevels[askLevels.length - 1]?.total ?? 0,
  );
  if (maxCum === 0) return;

  const minPrice = bidLevels[bidLevels.length - 1].price;
  const maxPrice = askLevels[askLevels.length - 1].price;
  const priceRange = maxPrice - minPrice || 1;

  const x = (price) => pad.left + ((price - minPrice) / priceRange) * chartW;
  const y = (cum) => pad.top + chartH - (cum / maxCum) * chartH;

  const midX = x(mid);

  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(125, 135, 153, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(midX, pad.top);
  ctx.lineTo(midX, pad.top + chartH);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(x(bidLevels[0].price), y(0));
  bidLevels.forEach((level, i) => {
    ctx.lineTo(x(level.price), y(level.total));
    if (i < bidLevels.length - 1) {
      ctx.lineTo(x(bidLevels[i + 1].price), y(level.total));
    }
  });
  ctx.lineTo(x(minPrice), pad.top + chartH);
  ctx.lineTo(x(bidLevels[0].price), pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = "rgba(14, 203, 129, 0.22)";
  ctx.fill();
  ctx.strokeStyle = "rgba(14, 203, 129, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(bidLevels[0].price), y(0));
  bidLevels.forEach((level, i) => {
    ctx.lineTo(x(level.price), y(level.total));
    if (i < bidLevels.length - 1) {
      ctx.lineTo(x(bidLevels[i + 1].price), y(level.total));
    }
  });
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x(askLevels[0].price), y(0));
  askLevels.forEach((level, i) => {
    ctx.lineTo(x(level.price), y(level.total));
    if (i < askLevels.length - 1) {
      ctx.lineTo(x(askLevels[i + 1].price), y(level.total));
    }
  });
  ctx.lineTo(x(maxPrice), pad.top + chartH);
  ctx.lineTo(x(askLevels[0].price), pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = "rgba(246, 70, 93, 0.22)";
  ctx.fill();
  ctx.strokeStyle = "rgba(246, 70, 93, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(askLevels[0].price), y(0));
  askLevels.forEach((level, i) => {
    ctx.lineTo(x(level.price), y(level.total));
    if (i < askLevels.length - 1) {
      ctx.lineTo(x(askLevels[i + 1].price), y(level.total));
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "center";
  ctx.fillText(formatPrice(minPrice), x(minPrice), h - 8);
  ctx.fillText(formatPrice(mid), midX, h - 8);
  ctx.fillText(formatPrice(maxPrice), x(maxPrice), h - 8);

  ctx.textAlign = "right";
  ctx.fillText(formatBtc(maxCum), pad.left - 4, pad.top + 10);
}

function renderOrderBookLadder(bids, asks) {
  const bidLevels = buildCumulative(bids);
  const askLevels = buildCumulative(asks);
  const maxBidQty = Math.max(...bidLevels.map((l) => l.qty), 0.0001);
  const maxAskQty = Math.max(...askLevels.map((l) => l.qty), 0.0001);

  $("book-bids").innerHTML = bidLevels
    .map((level) => {
      const pct = (level.qty / maxBidQty) * 100;
      return `<div class="book-row bid">
        <div class="depth-bar" style="width:${pct}%"></div>
        <span>${formatBtc(level.total)}</span>
        <span>${formatBtc(level.qty)}</span>
        <span class="price">${formatPrice(level.price)}</span>
      </div>`;
    })
    .join("");

  $("book-asks").innerHTML = askLevels
    .map((level) => {
      const pct = (level.qty / maxAskQty) * 100;
      return `<div class="book-row ask">
        <div class="depth-bar" style="width:${pct}%"></div>
        <span class="price">${formatPrice(level.price)}</span>
        <span>${formatBtc(level.qty)}</span>
        <span>${formatBtc(level.total)}</span>
      </div>`;
    })
    .join("");
}

function updateKline(data) {
  const k = data.k;
  const candle = {
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    time: k.t,
  };

  const idx = candles.findIndex((c) => c.time === candle.time);
  if (idx >= 0) {
    candles[idx] = candle;
  } else {
    candles.push(candle);
    candles.sort((a, b) => a.time - b.time);
    if (candles.length > 60) candles.shift();
  }

  drawChart();
}

function drawChart() {
  const canvas = $("price-chart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 12, right: 12, bottom: 32, left: 12 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  if (candles.length < 2) return;

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || 1;

  const barW = chartW / candles.length;
  const bodyW = Math.max(barW * 0.6, 2);

  candles.forEach((c, i) => {
    const x = pad.left + i * barW + barW / 2;
    const bullish = c.close >= c.open;

    const yHigh = pad.top + ((max - c.high) / range) * chartH;
    const yLow = pad.top + ((max - c.low) / range) * chartH;
    const yOpen = pad.top + ((max - c.open) / range) * chartH;
    const yClose = pad.top + ((max - c.close) / range) * chartH;

    const color = bullish ? "#0ecb81" : "#f6465d";

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(Math.abs(yClose - yOpen), 1);
    ctx.fillStyle = color;
    ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
  });

  const first = candles[0];
  const last = candles[candles.length - 1];
  const trendUp = last.close >= first.open;

  ctx.strokeStyle = trendUp ? "rgba(14,203,129,0.35)" : "rgba(246,70,93,0.35)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  const lineY = pad.top + ((max - last.close) / range) * chartH;
  ctx.moveTo(pad.left, lineY);
  ctx.lineTo(w - pad.right, lineY);
  ctx.stroke();
  ctx.setLineDash([]);

  drawTimeAxisLabels(
    ctx,
    w,
    h,
    pad,
    candles.length,
    (i) => fmtChartTime(candles[i].time),
    { ticks: Math.min(candles.length, 5), y: h - 6 },
  );
}

function handleMessage(event) {
  const msg = JSON.parse(event.data);
  const { stream, data } = msg;

  if (stream === "btcusdt@ticker") updateTicker(data);
  else if (stream === "btcusdt@kline_1m") updateKline(data);
  else if (stream === "btcusdt@depth20@100ms") updateDepth(data);
}

function connect() {
  if (ws) {
    ws.onclose = null;
    ws.close();
  }

  setConnectionStatus("connecting");
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setConnectionStatus("connected");
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = handleMessage;

  ws.onclose = () => {
    setConnectionStatus("disconnected");
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();
}

function renderDataGrid(items, gridId) {
  const grid = $(gridId);
  if (!grid) return;
  grid.innerHTML = items
    .map(
      ({ label, value, sub, wide, valueClass, valueId, helpKey }) => `
    <article class="chain-card${wide ? " wide" : ""}">
      <span class="chain-label">${labelWithHelp(label, helpKey)}</span>
      <span class="chain-value${valueClass ? " " + valueClass : ""}"${valueId ? ` id="${valueId}"` : ""}>${value}</span>
      ${sub ? `<span class="chain-sub">${sub}</span>` : ""}
    </article>`,
    )
    .join("");
}

function renderChainGrid(items) {
  renderDataGrid(items, "chain-grid");
}

function buildChainBundle(mempool, fees, diffAdj, height, stats) {
  const supplyBtc = stats.totalbc / 1e8;
  const mempoolMb = mempool.vsize / 1e6;
  const feeTotalBtc = mempool.total_fee / 1e8;
  const adjSign = diffAdj.difficultyChange >= 0 ? "+" : "";
  const adjDays = formatDuration(Math.floor(diffAdj.remainingTime / 1000));

  const snapshot = {
    height: String(height).trim(),
    hashrate: formatHashrate(stats.hash_rate),
    mempoolCount: mempool.count,
    mempoolMb: mempool.vsize / 1e6,
    fastFee: fees.fastestFee,
    diffChange: diffAdj.difficultyChange,
    nTx: stats.n_tx,
    supplyBtc,
  };

  const items = [
    {
      label: "Block Height",
      helpKey: "block-height",
      value: formatLargeNum(height),
      sub: "Bitcoin mainnet",
    },
    {
      label: "Hash Rate",
      helpKey: "hash-rate",
      value: formatHashrate(stats.hash_rate),
      sub: "Network compute power",
    },
    {
      label: "Difficulty",
      helpKey: "difficulty",
      value: formatDifficulty(stats.difficulty),
      sub: "Mining difficulty",
    },
    {
      label: "Mempool",
      helpKey: "mempool",
      value: formatLargeNum(mempool.count) + " txs",
      sub: mempoolMb.toFixed(1) + " MB · " + feeTotalBtc.toFixed(3) + " BTC fees",
    },
    {
      label: "Fee Rate",
      helpKey: "fee-rate",
      value: fees.fastestFee + " sat/vB",
      sub: "Fast · " + fees.hourFee + " hr · " + fees.economyFee + " economy",
    },
    {
      label: "On-Chain Txs (24h)",
      helpKey: "onchain-txs",
      value: formatLargeNum(stats.n_tx),
      sub: "Confirmed transactions",
    },
    {
      label: "Circulating Supply",
      helpKey: "circulating-supply",
      value: supplyBtc.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " BTC",
      sub: ((supplyBtc / 21e6) * 100).toFixed(2) + "% of 21M cap",
    },
    {
      label: "Avg Block Time",
      helpKey: "avg-block-time",
      value: stats.minutes_between_blocks.toFixed(1) + " min",
      sub: "Last 24h average",
    },
    {
      label: "Next Difficulty Adj.",
      helpKey: "difficulty-adj",
      value: adjSign + diffAdj.difficultyChange.toFixed(2) + "%",
      sub:
        diffAdj.remainingBlocks +
        " blocks · ~" +
        adjDays +
        " · " +
        diffAdj.progressPercent.toFixed(1) +
        "% through epoch",
      wide: true,
    },
  ];

  return { chainSnapshot: snapshot, items };
}

function applyChainBundle(bundle) {
  chainSnapshot = bundle.chainSnapshot;
  window.chainSnapshot = chainSnapshot;
  renderChainGrid(bundle.items);
}

async function loadBlockchainData() {
  const swr = window.DashboardSWR;
  if (!swr) return;
  const chainUpdateEl = $("chain-update");

  try {
    await swr.runSWR({
      key: "market:chain",
      l1: "market",
      source: "Mempool.space",
      fetch: async () => {
        const [mempoolRes, feesRes, diffRes, heightRes, statsRes] =
          await Promise.all([
            fetch(`${MEMPOOL_BASE}/mempool`),
            fetch(`${MEMPOOL_BASE}/v1/fees/recommended`),
            fetch(`${MEMPOOL_BASE}/v1/difficulty-adjustment`),
            fetch(`${MEMPOOL_BASE}/blocks/tip/height`),
            fetch(CHAIN_STATS_URL),
          ]);

        const mempool = await mempoolRes.json();
        const fees = await feesRes.json();
        const diffAdj = await diffRes.json();
        const height = await heightRes.text();
        const stats = await statsRes.json();
        const bundle = buildChainBundle(mempool, fees, diffAdj, height, stats);
        return {
          ...bundle,
          fetchedAt: new Date().toISOString(),
        };
      },
      render: (data, opts = {}) => {
        if (opts.loading) {
          if (chainUpdateEl) chainUpdateEl.textContent = "Loading…";
          return;
        }
        applyChainBundle(data);
        if (chainUpdateEl) {
          chainUpdateEl.textContent = swr.formatPanelMeta({
            fetchedAt: data.fetchedAt,
            source: "Mempool.space",
            stale: opts.stale,
            refreshing: opts.refreshing,
            refreshFailed: opts.refreshFailed,
          });
        }
        if (activeIndicatorTf && marketIndicatorCache[activeIndicatorTf]) {
          renderCachedMarketIndicators(activeIndicatorTf);
        }
      },
    });
  } catch (err) {
    console.error("Failed to load blockchain data:", err);
    if (chainUpdateEl && !chainSnapshot.height) {
      chainUpdateEl.textContent = "Unavailable";
    }
  }
}

function parseKlinesOHLCV(klines) {
  return {
    opens: klines.map((k) => parseFloat(k[1])),
    highs: klines.map((k) => parseFloat(k[2])),
    lows: klines.map((k) => parseFloat(k[3])),
    closes: klines.map((k) => parseFloat(k[4])),
    volumes: klines.map((k) => parseFloat(k[5])),
  };
}

function getSpotContext() {
  const priceText = $("price")?.textContent?.replace(/,/g, "") ?? "";
  const price = parseFloat(priceText) || null;
  const pctText =
    document.querySelector("#price-change .change-pct")?.textContent ?? "";
  const changePct = parseFloat(pctText.replace(/[^0-9.-]/g, "")) || 0;
  const highText = $("high-24h")?.textContent?.replace(/,/g, "") ?? "";
  const lowText = $("low-24h")?.textContent?.replace(/,/g, "") ?? "";
  const high = parseFloat(highText) || null;
  const low = parseFloat(lowText) || null;
  const spreadText = $("spread")?.textContent ?? "";
  const spreadPct = parseFloat(spreadText.replace(/[^0-9.-]/g, "")) || null;
  const rangePos =
    price != null && high != null && low != null && high > low
      ? ((price - low) / (high - low)) * 100
      : null;
  return { price, changePct, high, low, spreadPct, rangePos };
}

function renderIndicatorsList(containerId, klines, options = {}) {
  const el = $(containerId);
  if (!el || !window.buildIndicators) return null;
  const ohlcv = parseKlinesOHLCV(klines);
  const price = ohlcv.closes[ohlcv.closes.length - 1];
  const result = window.buildIndicators(ohlcv, price);
  el.innerHTML = result.html;
  window.decorateHelpLabels?.(el);

  const overviewId = options.overviewId;
  if (overviewId) {
    const overviewEl = $(overviewId);
    if (overviewEl) {
      if (options.mode === "market" && window.buildTechnicalOverview) {
        overviewEl.innerHTML = window.buildTechnicalOverview(
          result.categories,
          getSpotContext(),
          chainSnapshot,
          options.timeframeLabel,
        );
      } else if (window.buildIndicatorsOnlyOverview) {
        overviewEl.innerHTML = window.buildIndicatorsOnlyOverview(
          result.categories,
          options.timeframeLabel,
        );
      }
      window.decorateHelpLabels?.(overviewEl.closest(".menu-screen"));
    }
  }

  return result;
}

function marketIndicatorIds(tf) {
  return {
    listId: `indicators-list-${tf}`,
    overviewId: `indicators-overview-${tf}`,
    metaId: `indicators-meta-${tf}`,
  };
}

function renderCachedMarketIndicators(tf) {
  const cached = marketIndicatorCache[tf];
  if (!cached) return false;
  const cfg = MARKET_INDICATOR_TF[tf];
  const ids = marketIndicatorIds(tf);
  renderIndicatorsList(ids.listId, cached.klines, {
    overviewId: ids.overviewId,
    mode: "market",
    timeframeLabel: cfg?.label,
  });
  const metaEl = $(ids.metaId);
  if (metaEl && cfg) {
    metaEl.textContent = `${cfg.label} · 30+ indicators · 5 categories`;
  }
  return true;
}

async function loadMarketIndicators(tf, options = {}) {
  const cfg = MARKET_INDICATOR_TF[tf];
  if (!cfg) return;

  const swr = window.DashboardSWR;
  if (!swr) return;

  if (options.setActive !== false) activeIndicatorTf = tf;
  const ids = marketIndicatorIds(tf);
  const listEl = $(ids.listId);
  const updateHeader =
    options.updateHeader !== false && options.setActive !== false;

  try {
    await swr.runSWR({
      key: `market:indicators:${tf}`,
      l1: "market",
      source: "Binance",
      updateHeader,
      fetch: async () => {
        const res = await fetch(
          `${REST_BASE}/klines?symbol=${SYMBOL}&interval=${cfg.interval}&limit=${cfg.limit}`,
        );
        const klines = await res.json();
        return {
          klines,
          fetchedAt: new Date().toISOString(),
        };
      },
      render: (data, opts = {}) => {
        if (opts.loading) {
          if (listEl && !marketIndicatorCache[tf]) {
            listEl.innerHTML =
              '<div class="indicator-row"><span class="indicator-desc">Loading indicators…</span></div>';
          }
          return;
        }
        marketIndicatorCache[tf] = data;
        renderCachedMarketIndicators(tf);
      },
    });
  } catch (err) {
    console.error("Failed to load indicators:", tf, err);
    if (listEl && !marketIndicatorCache[tf]) {
      listEl.innerHTML =
        '<div class="indicator-row"><span class="indicator-desc">Indicators unavailable</span></div>';
    }
  }
}

async function prefetchMarketIndicators() {
  await Promise.all(
    Object.keys(MARKET_INDICATOR_TF).map((tf) =>
      loadMarketIndicators(tf, { setActive: false, updateHeader: false }),
    ),
  );
}

function updateFuturesBasis(mark, index) {
  const basis = mark - index;
  const basisPct = (basis / index) * 100;
  const basisEl = $("fut-basis");
  basisEl.textContent = formatPct(basisPct, 4);
  basisEl.className =
    "futures-value " + (basisPct >= 0 ? "positive" : "negative");
  $("fut-basis-sub").textContent =
    (basis >= 0 ? "+" : "") + formatPrice(basis) + " USDT";
}

function buildFuturesMarketItems() {
  const s = futuresMarketState;
  if (!s.price) return [];

  const basis = s.mark - s.index;
  const basisPct = s.index ? (basis / s.index) * 100 : 0;
  const annualized = s.fundingRate * 3 * 365 * 100;
  const fundingSignal =
    s.fundingRate > 0.0001
      ? "positive"
      : s.fundingRate < -0.00005
        ? "negative"
        : "";
  const countdown = $("fut-funding-countdown")?.textContent || "—";
  const fundingTime = s.nextFundingTime
    ? new Date(s.nextFundingTime).toLocaleTimeString("en-US", { hour12: false }) +
      " UTC"
    : "—";

  return [
    {
      label: "24h High",
      helpKey: "high-24h",
      value: s.high ? formatPrice(s.high) : "—",
    },
    {
      label: "24h Low",
      helpKey: "low-24h",
      value: s.low ? formatPrice(s.low) : "—",
    },
    {
      label: "24h Volume",
      helpKey: "vol-btc",
      value: s.volume ? formatBtc(s.volume) + " BTC" : "—",
      sub: s.quoteVolume ? formatVolume(s.quoteVolume) + " USDT" : "",
    },
    {
      label: "Open Interest",
      helpKey: "open-interest",
      value: s.openInterest ? formatBtc(s.openInterest) + " BTC" : "—",
      sub: s.openInterest
        ? formatVolume(s.openInterest * s.price) + " USDT notional"
        : "",
    },
    {
      label: "Basis",
      helpKey: "fut-basis",
      value: formatPct(basisPct, 4),
      sub: (basis >= 0 ? "+" : "") + formatPrice(basis) + " USDT",
      valueClass: basisPct >= 0 ? "positive" : "negative",
    },
    {
      label: "Funding Rate",
      helpKey: "funding-rate",
      value: formatFundingRate(s.fundingRate),
      sub: annualized.toFixed(2) + "% annualized · 8h",
      valueClass: fundingSignal,
    },
    {
      label: "Next Funding",
      helpKey: "next-funding",
      value: countdown,
      valueId: "fut-funding-countdown-value",
      sub: fundingTime,
    },
  ];
}

function refreshFuturesGrid() {
  renderDataGrid(
    [...buildFuturesMarketItems(), ...futuresSentimentItems],
    "futures-grid",
  );
}

function updateFuturesHero(price, open) {
  const change = price - open;
  const changePct = (change / open) * 100;
  const isPositive = change >= 0;

  $("fut-price").textContent = formatPrice(price);
  const changeEl = $("fut-change");
  changeEl.className = "futures-change " + (isPositive ? "positive" : "negative");
  changeEl.textContent =
    formatPct(changePct) + " · " + (isPositive ? "+" : "") + formatPrice(change);
}

function updateFuturesMark(data) {
  const mark = parseFloat(data.p);
  const index = parseFloat(data.i);

  futuresMarketState.mark = mark;
  futuresMarketState.index = index;
  futuresMarketState.fundingRate = parseFloat(data.r);
  if (data.T) {
    nextFundingTime = data.T;
    futuresMarketState.nextFundingTime = data.T;
  }

  $("fut-mark").textContent = formatPrice(mark);
  $("fut-index").textContent = formatPrice(index);
  updateFuturesBasis(mark, index);
  updateFundingCountdown();
  refreshFuturesGrid();
}

function updateFuturesTicker(data) {
  const price = parseFloat(data.c);
  const open = parseFloat(data.o);

  futuresMarketState.price = price;
  futuresMarketState.high = parseFloat(data.h);
  futuresMarketState.low = parseFloat(data.l);
  futuresMarketState.volume = parseFloat(data.v);
  futuresMarketState.quoteVolume = parseFloat(data.q);

  updateFuturesHero(price, open);
  refreshFuturesGrid();
}

function updateFundingCountdown() {
  const el = $("fut-funding-countdown");
  if (!el || !nextFundingTime) return;

  const remaining = nextFundingTime - Date.now();
  if (remaining <= 0) {
    el.textContent = "Imminent";
  } else {
    const h = Math.floor(remaining / 3_600_000);
    const m = Math.floor((remaining % 3_600_000) / 60_000);
    const s = Math.floor((remaining % 60_000) / 1000);
    el.textContent = `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  }

  const card = $("fut-funding-countdown-value");
  if (card) card.textContent = el.textContent;
}

function applyFuturesBundle(bundle) {
  const state = bundle.marketState;
  futuresMarketState = { ...state };
  futuresSentimentItems = bundle.sentimentItems;
  nextFundingTime = state.nextFundingTime;

  updateFuturesHero(state.price, state.openPrice);
  $("fut-mark").textContent = formatPrice(state.mark);
  $("fut-index").textContent = formatPrice(state.index);
  updateFuturesBasis(state.mark, state.index);
  updateFundingCountdown();
  refreshFuturesGrid();
}

async function loadFuturesData() {
  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: "derivatives:futures",
      l1: "derivatives",
      source: "Binance",
      fetch: async () => {
        const [tickerRes, premiumRes, oiRes, globalLsRes, topAccRes, topPosRes, takerRes] =
          await Promise.all([
            fetch(`${FUTURES_REST}/fapi/v1/ticker/24hr?symbol=${SYMBOL}`),
            fetch(`${FUTURES_REST}/fapi/v1/premiumIndex?symbol=${SYMBOL}`),
            fetch(`${FUTURES_REST}/fapi/v1/openInterest?symbol=${SYMBOL}`),
            fetch(
              `${FUTURES_REST}/futures/data/globalLongShortAccountRatio?symbol=${SYMBOL}&period=1h&limit=1`,
            ),
            fetch(
              `${FUTURES_REST}/futures/data/topLongShortAccountRatio?symbol=${SYMBOL}&period=1h&limit=1`,
            ),
            fetch(
              `${FUTURES_REST}/futures/data/topLongShortPositionRatio?symbol=${SYMBOL}&period=1h&limit=1`,
            ),
            fetch(
              `${FUTURES_REST}/futures/data/takerlongshortRatio?symbol=${SYMBOL}&period=1h&limit=1`,
            ),
          ]);

        const ticker = await tickerRes.json();
        const premium = await premiumRes.json();
        const oi = await oiRes.json();
        const globalLs = (await globalLsRes.json())[0];
        const topAcc = (await topAccRes.json())[0];
        const topPos = (await topPosRes.json())[0];
        const taker = (await takerRes.json())[0];

        const price = parseFloat(ticker.lastPrice);
        const mark = parseFloat(premium.markPrice);
        const index = parseFloat(premium.indexPrice);
        const fundingRate = parseFloat(premium.lastFundingRate);

        const globalLongPct = (parseFloat(globalLs.longAccount) * 100).toFixed(1);
        const topAccLongPct = (parseFloat(topAcc.longAccount) * 100).toFixed(1);
        const topPosLongPct = (parseFloat(topPos.longAccount) * 100).toFixed(1);
        const takerRatio = parseFloat(taker.buySellRatio);
        const takerSignal =
          takerRatio > 1.05 ? "positive" : takerRatio < 0.95 ? "negative" : "";

        return {
          marketState: {
            price,
            openPrice: parseFloat(ticker.openPrice),
            high: parseFloat(ticker.highPrice),
            low: parseFloat(ticker.lowPrice),
            volume: parseFloat(ticker.volume),
            quoteVolume: parseFloat(ticker.quoteVolume),
            openInterest: parseFloat(oi.openInterest),
            mark,
            index,
            fundingRate,
            nextFundingTime: premium.nextFundingTime,
          },
          sentimentItems: [
            {
              label: "Global L/S Ratio",
              helpKey: "global-ls",
              value: formatRatio(globalLs.longShortRatio),
              sub: globalLongPct + "% long accounts",
              valueClass:
                parseFloat(globalLs.longShortRatio) > 1 ? "positive" : "negative",
            },
            {
              label: "Top Trader Accounts",
              helpKey: "top-trader-accounts",
              value: formatRatio(topAcc.longShortRatio),
              sub: topAccLongPct + "% long",
            },
            {
              label: "Top Trader Positions",
              helpKey: "top-trader-positions",
              value: formatRatio(topPos.longShortRatio),
              sub: topPosLongPct + "% long",
            },
            {
              label: "Taker Buy/Sell",
              helpKey: "taker-ratio",
              value: formatRatio(takerRatio),
              sub:
                formatBtc(taker.buyVol) +
                " buy · " +
                formatBtc(taker.sellVol) +
                " sell",
              valueClass: takerSignal,
              wide: true,
            },
          ],
          fetchedAt: new Date().toISOString(),
        };
      },
      render: (data, opts = {}) => {
        if (opts.loading) {
          setFuturesPanelMeta({ state: "loading", source: "Binance" });
          return;
        }
        applyFuturesBundle(data);
        setFuturesPanelMeta({
          fetchedAt: data.fetchedAt,
          source: "Binance",
          stale: opts.stale,
          refreshing: opts.refreshing,
          refreshFailed: opts.refreshFailed,
        });
      },
    });
  } catch (err) {
    console.error("Failed to load futures data:", err);
    if (!futuresMarketState.price) {
      setFuturesPanelMeta({ state: "error", source: "Binance" });
    }
  }
}

async function loadFuturesIndicators() {
  try {
    const res = await fetch(
      `${FUTURES_REST}/fapi/v1/klines?symbol=${SYMBOL}&interval=1h&limit=250`,
    );
    const klines = await res.json();
    renderIndicatorsList("futures-indicators-list", klines, {
      overviewId: "futures-indicators-overview-commentary",
      mode: "futures",
    });
  } catch (err) {
    console.error("Failed to load futures indicators:", err);
    $("futures-indicators-list").innerHTML =
      '<div class="indicator-row"><span class="indicator-desc">Indicators unavailable</span></div>';
  }
}

function handleFuturesMessage(event) {
  const msg = JSON.parse(event.data);
  const { stream, data } = msg;

  if (stream === "btcusdt@ticker") updateFuturesTicker(data);
  else if (stream === "btcusdt@markPrice@1s") updateFuturesMark(data);
}

function connectFutures() {
  if (futuresWs) {
    futuresWs.onclose = null;
    futuresWs.close();
  }

  setConnectionStatus("connecting", "futures-status");
  futuresWs = new WebSocket(FUTURES_WS_URL);

  futuresWs.onopen = () => {
    setConnectionStatus("connected", "futures-status");
    if (futuresReconnectTimer) {
      clearTimeout(futuresReconnectTimer);
      futuresReconnectTimer = null;
    }
  };

  futuresWs.onmessage = handleFuturesMessage;

  futuresWs.onclose = () => {
    setConnectionStatus("disconnected", "futures-status");
    futuresReconnectTimer = setTimeout(connectFutures, 3000);
  };

  futuresWs.onerror = () => futuresWs.close();
}

function applySpotBundle(bundle) {
  const { ticker, klines, depth } = bundle;

  updateTicker({
    c: ticker.lastPrice,
    o: ticker.openPrice,
    h: ticker.highPrice,
    l: ticker.lowPrice,
    v: ticker.volume,
    q: ticker.quoteVolume,
    w: ticker.weightedAvgPrice,
  });

  candles.length = 0;
  klines.forEach(([time, o, h, l, c]) => {
    candles.push({
      time,
      open: parseFloat(o),
      high: parseFloat(h),
      low: parseFloat(l),
      close: parseFloat(c),
    });
  });
  drawChart();
  updateDepth(depth);
}

async function loadInitialData() {
  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: "market:spot",
      l1: "market",
      source: "Binance",
      fetch: async () => {
        const [tickerRes, klinesRes, depthRes] = await Promise.all([
          fetch(`${REST_BASE}/ticker/24hr?symbol=${SYMBOL}`),
          fetch(`${REST_BASE}/klines?symbol=${SYMBOL}&interval=1m&limit=60`),
          fetch(`${REST_BASE}/depth?symbol=${SYMBOL}&limit=20`),
        ]);

        const ticker = await tickerRes.json();
        const klines = await klinesRes.json();
        const depth = await depthRes.json();
        return {
          ticker,
          klines,
          depth,
          fetchedAt: new Date().toISOString(),
        };
      },
      render: (data, opts = {}) => {
        if (opts.loading) return;
        applySpotBundle(data);
      },
    });
  } catch (err) {
    console.error("Failed to load initial data:", err);
  }
}

window.refreshDepthChart = function () {
  if (lastBids.length && lastAsks.length) {
    const mid = (lastBids[0][0] + lastAsks[0][0]) / 2;
    drawDepthChart(lastBids, lastAsks, mid);
  }
};

window.refreshPriceChart = function () {
  drawChart();
};

window.loadMarketIndicators = loadMarketIndicators;
window.setActiveIndicatorTimeframe = (tf) => {
  if (MARKET_INDICATOR_TF[tf]) activeIndicatorTf = tf;
};
window.getActiveIndicatorTimeframe = () => activeIndicatorTf;

window.addEventListener("resize", () => {
  drawChart();
  window.refreshDepthChart();
});
initMetricHelp();
initDashboardSwitcher();
initEtfDashboard();
initTreasuryDashboard();
loadInitialData();
loadBlockchainData();
prefetchMarketIndicators();
loadFuturesData();
loadFuturesIndicators();
connect();
connectFutures();

setInterval(loadBlockchainData, CHAIN_POLL_MS);
setInterval(() => {
  loadMarketIndicators(activeIndicatorTf);
}, INDICATOR_POLL_MS);
setInterval(loadFuturesData, FUTURES_POLL_MS);
setInterval(loadFuturesIndicators, INDICATOR_POLL_MS);
setInterval(updateFundingCountdown, 1000);