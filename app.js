const SYMBOL = "BTCUSDT";

const INDICATOR_POLL_MS = 300_000;
const FUTURES_POLL_MS = 60_000;
const DEPTH_POLL_MS = 15_000;

const MARKET_INDICATOR_TF = {
  "1h": { interval: "1h", limit: 250, label: "1h" },
  "4h": { interval: "4h", limit: 250, label: "4h" },
  d: { interval: "1d", limit: 250, label: "D" },
};

let activeIndicatorTf = "1h";
const marketIndicatorCache = {};

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
let futuresVenue = "okx";

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
  const text = window.DashboardSWR?.formatPanelMeta(opts) || opts.fallback || "—";
  for (const id of ["futures-update", "futures-sentiment-update"]) {
    const panel = $(id);
    if (panel) panel.textContent = text;
  }
}

function formatPct(n, decimals = 2) {
  const v = Number(n);
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}

function formatFundingRate(rate) {
  return (Number(rate) * 100).toFixed(4) + "%";
}

function formatRatio(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
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

  window.btcSpotPrice = price;
  window.dispatchEvent(new CustomEvent("btc-spot-price", { detail: { price } }));

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
  const clean = (rows) =>
    (rows || [])
      .map(([p, q]) => [parseFloat(p), parseFloat(q)])
      .filter(([p, q]) => Number.isFinite(p) && p > 0 && Number.isFinite(q) && q > 0);
  lastBids = clean(data?.bids).sort((a, b) => b[0] - a[0]);
  lastAsks = clean(data?.asks).sort((a, b) => a[0] - b[0]);

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
  window.SpotCharts?.onLiveKline?.(data.k);
}

function handleMessage(event) {
  const msg = JSON.parse(event.data);
  const { stream, data } = msg;

  if (stream === "btcusdt@ticker") updateTicker(data);
  else if (stream === "btcusdt@kline_1m") updateKline(data);
  else if (stream === "btcusdt@depth20@100ms") updateDepth(data);
}

let spotVenue = "binance";
let binanceWsFails = 0;

function mapCoinbaseTicker(msg) {
  if (!msg || msg.type !== "ticker") return;
  updateTicker({
    c: msg.price,
    o: msg.open_24h || msg.price,
    h: msg.high_24h || msg.price,
    l: msg.low_24h || msg.price,
    v: msg.volume_24h || 0,
    q: (parseFloat(msg.volume_24h) || 0) * (parseFloat(msg.price) || 0),
    w: msg.price,
  });
  // A ticker print is one level. Leave a full ladder from /api/market/depth alone.
  if (msg.best_bid && msg.best_ask && lastBids.length < 5) {
    updateDepth({
      bids: [[parseFloat(msg.best_bid), parseFloat(msg.best_bid_size) || 0]],
      asks: [[parseFloat(msg.best_ask), parseFloat(msg.best_ask_size) || 0]],
    });
  }
}

function connectCoinbase() {
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  spotVenue = "coinbase";
  setConnectionStatus("connecting");
  ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
  ws.onopen = () => {
    binanceWsFails = 0;
    setConnectionStatus("connected");
    ws.send(JSON.stringify({
      type: "subscribe",
      product_ids: ["BTC-USD"],
      channels: ["ticker"],
    }));
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };
  ws.onmessage = (event) => {
    try {
      mapCoinbaseTicker(JSON.parse(event.data));
    } catch (_) {}
  };
  ws.onclose = () => {
    setConnectionStatus("disconnected");
    reconnectTimer = setTimeout(connect, 4000);
  };
  ws.onerror = () => ws.close();
}

function connect() {
  connectCoinbase();
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

  if (options.gaugesId && window.renderIndicatorGauges) {
    window.renderIndicatorGauges(options.gaugesId, result.categories, {
      timeframeLabel: options.timeframeLabel,
    });
  }

  const overviewId = options.overviewId;
  if (overviewId) {
    const overviewEl = $(overviewId);
    if (overviewEl) {
      if (options.mode === "market" && window.buildTechnicalOverview) {
        overviewEl.innerHTML = window.buildTechnicalOverview(
          result.categories,
          getSpotContext(),
          window.chainSnapshot || {},
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
    gaugesId: `indicators-gauges-${tf}`,
  };
}

function renderCachedMarketIndicators(tf) {
  const cached = marketIndicatorCache[tf];
  if (!cached) return false;
  const cfg = MARKET_INDICATOR_TF[tf];
  const ids = marketIndicatorIds(tf);
  renderIndicatorsList(ids.listId, cached.klines, {
    overviewId: ids.overviewId,
    gaugesId: ids.gaugesId,
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
      source: "Binance / Coinbase",
      updateHeader,
      fetch: async () => {
        const bundled = await window.marketFetchKlines(cfg.interval, cfg.limit);
        return {
          klines: bundled.klines,
          fetchedAt: new Date().toISOString(),
          venue: bundled.venue,
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

function finiteNum(n) {
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function updateFuturesBasis(mark, index) {
  const basisEl = $("fut-basis");
  const subEl = $("fut-basis-sub");
  if (!basisEl) return;
  if (!Number.isFinite(mark) || !Number.isFinite(index) || !index) {
    basisEl.textContent = "—";
    basisEl.className = "futures-value";
    if (subEl) subEl.textContent = "Mark − Index";
    return;
  }
  const basis = mark - index;
  const basisPct = (basis / index) * 100;
  basisEl.textContent = formatPct(basisPct, 4);
  basisEl.className =
    "futures-value " + (basisPct >= 0 ? "positive" : "negative");
  if (subEl) {
    subEl.textContent = (basis >= 0 ? "+" : "") + formatPrice(basis) + " USDT";
  }
}

function buildFuturesMarketItems() {
  const s = futuresMarketState;
  if (!s.price) return [];

  const markOk = Number.isFinite(s.mark);
  const indexOk = Number.isFinite(s.index) && s.index;
  const basis = markOk && indexOk ? s.mark - s.index : null;
  const basisPct = basis != null ? (basis / s.index) * 100 : null;
  const annualized = s.fundingRate * 3 * 365 * 100;
  const fundingSignal =
    s.fundingRate > 0.0001
      ? "positive"
      : s.fundingRate < -0.00005
        ? "negative"
        : "";
  const countdown = $("fut-funding-countdown")?.textContent || "—";
  const fundingTime = s.nextFundingTime
    ? new Date(s.nextFundingTime).toLocaleTimeString("en-US", {
        hour12: false,
        timeZone: "UTC",
      }) + " UTC"
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
      value: basisPct == null ? "—" : formatPct(basisPct, 4),
      sub: basis == null ? "Mark − Index" : (basis >= 0 ? "+" : "") + formatPrice(basis) + " USDT",
      valueClass: basisPct == null ? "" : basisPct >= 0 ? "positive" : "negative",
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
      sub: [fundingTime !== "—" ? fundingTime : null, (futuresVenue || "").toUpperCase() || null]
        .filter(Boolean)
        .join(" · ") || "—",
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
  $("fut-mark").textContent = Number.isFinite(state.mark) ? formatPrice(state.mark) : "—";
  $("fut-index").textContent = Number.isFinite(state.index) ? formatPrice(state.index) : "—";
  updateFuturesBasis(state.mark, state.index);
  updateFundingCountdown();
  refreshFuturesGrid();
}

async function fetchJsonTimeout(url, ms = 3500) {
  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ac.signal });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(kill);
  }
}

function perpBundleFromSnapshot(perp) {
  const venue = perp.venue || "OKX";
  const ls = perp.longShortRatio;
  return {
    marketState: {
      price: finiteNum(perp.lastPrice),
      openPrice: finiteNum(perp.lastPrice),
      high: finiteNum(perp.highPrice),
      low: finiteNum(perp.lowPrice),
      volume: finiteNum(perp.volume),
      quoteVolume: finiteNum(perp.quoteVolume),
      openInterest: finiteNum(perp.openInterest),
      mark: finiteNum(perp.markPrice),
      index: finiteNum(perp.indexPrice),
      fundingRate: finiteNum(perp.fundingRate),
      nextFundingTime: finiteNum(perp.nextFundingTime),
    },
    sentimentItems: [
      {
        label: "Open Interest",
        helpKey: "open-interest",
        value: perp.openInterest != null ? formatBtc(perp.openInterest) : "—",
        sub: venue + " swap",
      },
      {
        label: "Funding 8h",
        helpKey: "funding-rate",
        value: perp.fundingRate != null ? formatFundingRate(perp.fundingRate) : "—",
        sub: venue,
      },
      {
        label: "Long/Short",
        helpKey: "global-ls",
        value: ls != null ? formatRatio(ls) : "—",
        sub: "Account ratio",
        valueClass: ls > 1 ? "positive" : ls < 1 ? "negative" : "",
      },
    ],
    fetchedAt: perp.fetchedAt || new Date().toISOString(),
    venue,
    venueLabel: venue + " fallback",
  };
}

async function loadFuturesData() {
  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: "derivatives:futures",
      l1: "derivatives",
      source: "OKX",
      updateHeader: false,
      fetch: async () => {
        const perp = await fetchJsonTimeout("/api/market/perp", 12000);
        if (!perp?.lastPrice) throw new Error(perp?.error || "Perp feed unavailable");
        futuresVenue = String(perp.venue || "OKX").toLowerCase();
        return perpBundleFromSnapshot(perp);
      },
      render: (data, opts = {}) => {
        const src = data?.venueLabel || data?.venue || "OKX";
        if (opts.loading) {
          setFuturesPanelMeta({ state: "loading", source: src });
          return;
        }
        applyFuturesBundle(data);
        futuresVenue = (data.venue || futuresVenue || "okx").toLowerCase();
        if (data.marketState?.price) setConnectionStatus("connected", "futures-status");
        setFuturesPanelMeta({
          fetchedAt: data.fetchedAt,
          source: src,
          stale: opts.stale,
          refreshing: opts.refreshing,
          refreshFailed: opts.refreshFailed,
        });
        window.DashboardSWR?.setHeaderStamp?.("derivatives", {
          fetchedAt: data.fetchedAt,
          source: src,
          stale: opts.stale,
          refreshing: opts.refreshing,
          refreshFailed: opts.refreshFailed,
        });
      },
    });
  } catch (err) {
    console.error("Failed to load futures data:", err);
    if (futuresMarketState.price) {
      const v = (futuresVenue || "okx").toUpperCase();
      setFuturesPanelMeta({ fetchedAt: new Date().toISOString(), source: v });
      return;
    }
    setConnectionStatus("disconnected", "futures-status");
    setFuturesPanelMeta({
      state: "error",
      source: (futuresVenue || "okx").toUpperCase(),
    });
  }
}

async function loadFuturesIndicators() {
  try {
    const bundled = await window.marketFetchKlines("1h", 250);
    renderIndicatorsList("futures-indicators-list", bundled.klines, {
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
  // Perp quotes are polled from /api/market/perp. The Binance futures socket is blocked in the browser.
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

  window.SpotCharts?.applyInitialKlines?.(klines);
  updateDepth(depth);
}

async function loadInitialData() {
  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: "market:spot",
      l1: "market",
      source: "Spot proxy",
      fetch: async () => {
        const [bundle, depth] = await Promise.all([
          fetch("/api/market/spot", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/market/depth?limit=20", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        if (!bundle?.ticker?.lastPrice) throw new Error(bundle?.error || "Spot feed unavailable");
        const book = depth?.bids?.length >= 5 && depth?.asks?.length >= 5
          ? depth
          : (bundle.depth || { bids: [], asks: [] });
        return {
          ticker: bundle.ticker,
          klines: bundle.klines || [],
          depth: book,
          fetchedAt: bundle.fetchedAt || new Date().toISOString(),
          venue: bundle.venue || depth?.venue || "proxy",
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
  window.SpotCharts?.onShow?.();
};

window.loadMarketIndicators = loadMarketIndicators;
window.setActiveIndicatorTimeframe = (tf) => {
  if (MARKET_INDICATOR_TF[tf]) activeIndicatorTf = tf;
};
window.getActiveIndicatorTimeframe = () => activeIndicatorTf;

window.addEventListener("resize", () => {
  window.refreshPriceChart();
  window.refreshDepthChart();
});
initMetricHelp();
initDashboardSwitcher();
initEtfDashboard();
initTreasuryDashboard();
loadInitialData();
if (typeof window.loadOnchainSection === "function") {
  window.loadOnchainSection("overview");
}
prefetchMarketIndicators();
loadFuturesData();
loadFuturesIndicators();
connect();

async function refreshProxiedDepth() {
  try {
    const depth = await fetch("/api/market/depth?limit=20", { cache: "no-store" }).then((r) => r.json());
    if (depth?.bids?.length >= 5 && depth?.asks?.length >= 5) updateDepth(depth);
  } catch (_) {
    /* keep the last ladder */
  }
}

setInterval(() => {
  loadMarketIndicators(activeIndicatorTf);
}, INDICATOR_POLL_MS);
setInterval(loadFuturesData, FUTURES_POLL_MS);
setInterval(loadFuturesIndicators, INDICATOR_POLL_MS);
setInterval(updateFundingCountdown, 1000);
setInterval(refreshProxiedDepth, DEPTH_POLL_MS);