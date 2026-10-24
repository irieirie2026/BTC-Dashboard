const SYMBOL = "BTCUSDT";

const INDICATOR_POLL_MS = 300_000;
const FUTURES_POLL_MS = 5_000;
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
let heldQuote = { bid: null, ask: null };
let lastSpotFetchedAt = null;
let lastSpotQuotedAt = null;
let lastSpotSourceLabel = "";
let spotLiveInflight = false;
const SPOT_POLL_MS = 20_000;
let lastBookFetchedAt = null;
let lastBookVenue = "";
let bookRefreshFailed = false;
let lastFuturesFetchedAt = null;
let lastFuturesSource = "";
let futuresLoadInflight = false;
let perpPollInflight = false;

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

function formatBookQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs > 0 && abs < 0.0001) {
    return Math.round(v * 1e8).toLocaleString("en-US") + " sats";
  }
  const digits = abs < 1 ? 6 : 4;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: digits,
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
      : state === "stale"
        ? "STALE"
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
  for (const id of ["futures-update", "futures-sentiment-update", "futures-header-update"]) {
    const panel = $(id);
    if (panel) panel.textContent = text;
  }
}

function perpViewOpen() {
  return document.body?.dataset?.l1 === "derivatives" && window.MenuController?.l2 === "perp";
}

function perpQuoteShouldApply(previousFetchedAt, incomingFetchedAt) {
  if (!incomingFetchedAt) return false;
  if (!previousFetchedAt) return true;
  const incoming = Date.parse(incomingFetchedAt);
  const current = Date.parse(previousFetchedAt);
  if (!Number.isFinite(incoming) || !Number.isFinite(current)) {
    return String(incomingFetchedAt) !== String(previousFetchedAt);
  }
  return incoming > current;
}

function perpAgeIsStale(fetchedAt, nowMs) {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= 120_000;
}

function paintFuturesStamp() {
  const ts = lastFuturesFetchedAt;
  if (!ts) return;
  const src = lastFuturesSource || "perp";
  const ms = window.DashboardSWR?.fetchedAgeMs?.(ts);
  const sec = ms == null || !Number.isFinite(ms) ? null : Math.max(0, Math.round(ms / 1000));
  const stale = perpAgeIsStale(ts, Date.now());
  const text = window.DashboardSWR?.formatLiveStamp?.({
    fetchedAt: ts,
    source: `${src} lastPrice`,
    staleAfterMs: 120_000,
  });
  if (perpViewOpen() && text) {
    for (const id of ["futures-update", "futures-sentiment-update", "futures-header-update"]) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }
  }
  window.DashboardSWR?.rememberViewClock?.("derivatives", {
    l2: "perp",
    fetchedAt: ts,
    source: `${src} lastPrice`,
    cardIds: ["futures-update", "futures-sentiment-update"],
    staleAfterMs: 120_000,
  });
  const srcEl = document.getElementById("fut-price-source");
  if (srcEl) {
    srcEl.textContent = sec == null
      ? `${src} lastPrice`
      : `${src} lastPrice · ${sec}s${stale ? " · STALE" : ""}`;
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
  const explicit = data.changePct != null ? Number(data.changePct) : null;
  const openIs24h = data.openIs24h === true || data.openIs24h === "true";
  const hasOpen = openIs24h && Number.isFinite(open) && open > 0 && Number.isFinite(price);

  window.btcSpotPrice = price;
  window.dispatchEvent(new CustomEvent("btc-spot-price", { detail: { price } }));

  $("price").textContent = Number.isFinite(price) ? formatPrice(price) : "—";

  if (prevPrice !== null && Number.isFinite(price) && price !== prevPrice) {
    flashPrice(price > prevPrice ? "up" : "down");
  }
  if (Number.isFinite(price)) prevPrice = price;

  const changeEl = $("price-change");
  let changePct = null;
  let change = null;
  if (hasOpen && explicit != null && Number.isFinite(explicit)) {
    changePct = explicit;
    change = price - open;
  } else if (hasOpen) {
    change = price - open;
    changePct = (change / open) * 100;
  }
  if (changePct == null || !Number.isFinite(changePct)) {
    changeEl.className = "price-change";
    changeEl.querySelector(".change-pct").textContent = "—";
    changeEl.querySelector(".change-abs").textContent = "—";
  } else {
    const isPositive = changePct >= 0;
    changeEl.className = "price-change " + (isPositive ? "positive" : "negative");
    changeEl.querySelector(".change-pct").textContent =
      (isPositive ? "+" : "") + changePct.toFixed(2) + "%";
    changeEl.querySelector(".change-abs").textContent =
      change != null && Number.isFinite(change)
        ? (isPositive ? "+" : "") + formatPrice(change) + " USDT"
        : "—";
  }

  $("high-24h").textContent = formatPrice(data.h);
  $("low-24h").textContent = formatPrice(data.l);
  $("vol-btc").textContent = formatBtc(data.v) + " BTC";
  $("vol-usdt").textContent = formatVolume(data.q) + " USDT";
  $("weighted-avg").textContent = formatPrice(data.w);

  // The card shows the API median. A missing print keeps the last number.
  let bid = parseFloat(data.bid);
  let ask = parseFloat(data.ask);
  if (Number.isFinite(bid) && bid > 0) heldQuote.bid = bid;
  else bid = heldQuote.bid;
  if (Number.isFinite(ask) && ask > 0) heldQuote.ask = ask;
  else ask = heldQuote.ask;
  const bidEl = $("best-bid");
  const askEl = $("best-ask");
  if (bidEl) {
    if (Number.isFinite(bid) && bid > 0) bidEl.textContent = formatPrice(bid);
    else if (!bidEl.textContent) bidEl.textContent = "—";
  }
  if (askEl) {
    if (Number.isFinite(ask) && ask > 0) askEl.textContent = formatPrice(ask);
    else if (!askEl.textContent) askEl.textContent = "—";
  }
  const venueNote = document.getElementById("spot-venue-count");
  if (venueNote && window.spotCompositeLabel) venueNote.textContent = window.spotCompositeLabel;
  if (Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0) {
    const spread = ask - bid;
    $("spread").textContent = formatPrice(spread) + " (" + ((spread / bid) * 100).toFixed(4) + "%)";
  } else {
    $("spread").textContent = "—";
  }
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
  const mid = (bestBid + bestAsk) / 2;

  $("book-mid").textContent = formatPrice(mid);
  if (data?.fetchedAt) {
    lastBookFetchedAt = data.fetchedAt;
    bookRefreshFailed = false;
  }
  if (data?.venue) lastBookVenue = String(data.venue);
  paintBookMeta();
  refreshMarketLiveBadge();
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
  if (rect.width < 2 || rect.height < 2) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 16, right: 16, bottom: 36, left: 72 };
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
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillText(formatPrice(minPrice), pad.left, h - 6);
  ctx.textAlign = "center";
  const midLabelX = Math.min(Math.max(midX, pad.left + 48), w - 48);
  ctx.fillText(formatPrice(mid), midLabelX, h - 6);
  ctx.textAlign = "right";
  ctx.fillText(formatPrice(maxPrice), w - 6, h - 6);

  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(formatBtc(maxCum), pad.left - 6, pad.top);
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
        <span>${formatBookQty(level.total)}</span>
        <span>${formatBookQty(level.qty)}</span>
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
        <span>${formatBookQty(level.qty)}</span>
        <span>${formatBookQty(level.total)}</span>
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

function bookAgeSuffix(fetchedAt, failed) {
  const age = window.DashboardSWR?.formatFetchedAge?.(fetchedAt) || "";
  const ms = window.DashboardSWR?.fetchedAgeMs?.(fetchedAt);
  const stale = failed || (ms != null && ms >= 90_000);
  return `${age ? ` · ${age}` : ""}${stale ? " · STALE" : ""}`;
}

function paintBookMeta() {
  const when = lastBookFetchedAt
    ? String(lastBookFetchedAt).replace("T", " ").replace(/\.\d+Z$/, "Z")
    : "";
  const suffix = bookAgeSuffix(lastBookFetchedAt, bookRefreshFailed);
  const ladderMeta = document.getElementById("book-ladder-meta");
  if (ladderMeta) {
    ladderMeta.textContent = ["Depth · 20 levels", lastBookVenue || null, when || null]
      .filter(Boolean)
      .join(" · ") + suffix;
  }
  const depthMeta = document.getElementById("book-depth-meta");
  if (depthMeta) {
    depthMeta.textContent = ["Cumulative volume · 20 levels", lastBookVenue || null, when || null]
      .filter(Boolean)
      .join(" · ") + suffix;
  }
}

function refreshMarketLiveBadge() {
  const age = window.DashboardSWR?.fetchedAgeMs?.(lastBookFetchedAt);
  if (!lastBookFetchedAt || bookRefreshFailed || (age != null && age >= 90_000)) {
    setConnectionStatus(lastBookFetchedAt ? "stale" : "connecting");
    return;
  }
  setConnectionStatus("connected");
}

function mapCoinbaseTicker(msg) {
  if (!msg || msg.type !== "ticker") return;
  // Coinbase BTC-USD is one venue. Last and weighted avg stay on the API median lastPrice.
  refreshMarketLiveBadge();
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
    refreshMarketLiveBadge();
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
  $("fut-price").textContent = Number.isFinite(price) ? formatPrice(price) : "—";
  const changeEl = $("fut-change");
  if (!Number.isFinite(price) || !Number.isFinite(open) || !(open > 0)) {
    changeEl.className = "futures-change";
    changeEl.textContent = "—";
    return;
  }
  const change = price - open;
  const changePct = (change / open) * 100;
  const isPositive = change >= 0;
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
  const indexSub = document.getElementById("fut-index-sub");
  if (indexSub) indexSub.textContent = bundle.indexSource || "Index";
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
      openPrice: finiteNum(perp.openPrice),
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
        label: venue + " open interest",
        helpKey: "open-interest",
        value: perp.openInterest != null ? formatBtc(perp.openInterest) : "—",
        sub: venue + " swap",
      },
      {
        label: venue + " funding 8h",
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
    fetchedAt: perp.fetchedAt || null,
    venue,
    venueLabel: venue,
    priceSource: venue,
    indexSource: perp.indexSource || (venue ? `${venue} index` : "Index"),
  };
}

async function loadFuturesData() {
  const swr = window.DashboardSWR;
  if (!swr || futuresLoadInflight) return;
  futuresLoadInflight = true;

  try {
    await swr.runSWR({
      key: "derivatives:futures",
      l1: "derivatives",
      source: "OKX",
      updateHeader: false,
      fetch: async () => {
        // Idle polls read the warm cache. refresh=1 live-fetches and the abort kept the old stamp.
        const perp = await fetchJsonTimeout("/api/market/perp", 8000);
        if (!perp?.lastPrice) throw new Error(perp?.error || "Perp feed unavailable");
        futuresVenue = String(perp.venue || "OKX").toLowerCase();
        return perpBundleFromSnapshot(perp);
      },
      render: (data, opts = {}) => {
        const src = data?.priceSource || data?.venueLabel || data?.venue || "OKX";
        if (opts.loading) {
          setFuturesPanelMeta({ state: "loading", source: src });
          return;
        }
        applyFuturesBundle(data);
        futuresVenue = (data.venue || futuresVenue || "okx").toLowerCase();
        const incoming = data?.fetchedAt ? Date.parse(data.fetchedAt) : NaN;
        const current = lastFuturesFetchedAt ? Date.parse(lastFuturesFetchedAt) : 0;
        const newer = !Number.isFinite(incoming) || !Number.isFinite(current) || incoming >= current;
        if (newer) {
          if (data?.fetchedAt) lastFuturesFetchedAt = data.fetchedAt;
          lastFuturesSource = src;
        }
        const persisted = !!(opts.stale || opts.refreshing || opts.refreshFailed || opts.fromCache);
        if (data.marketState?.price) {
          setConnectionStatus(persisted ? "stale" : "connected", "futures-status");
        }
        paintFuturesStamp();
      },
    });
  } catch (err) {
    console.error("Failed to load futures data:", err);
    if (futuresMarketState.price) {
      const v = (futuresVenue || "okx").toUpperCase();
      setConnectionStatus("stale", "futures-status");
      paintFuturesStamp();
      return;
    }
    setConnectionStatus("disconnected", "futures-status");
    setFuturesPanelMeta({
      state: "error",
      source: (futuresVenue || "okx").toUpperCase(),
    });
  } finally {
    futuresLoadInflight = false;
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

function alignBookToTicker(depth, ticker) {
  if (!depth || !ticker) return depth;
  const bookVenue = String(depth.venue || "").toLowerCase();
  const tickVenue = String(ticker.venue || "").toLowerCase();
  if (!bookVenue || !tickVenue || bookVenue !== tickVenue) return depth;
  const bid = parseFloat(ticker.bidPrice);
  const ask = parseFloat(ticker.askPrice);
  if (!(bid > 0) || !(ask > 0)) return depth;
  const bids = (depth.bids || []).map((row) => [parseFloat(row[0]), parseFloat(row[1])]);
  const asks = (depth.asks || []).map((row) => [parseFloat(row[0]), parseFloat(row[1])]);
  if (bids.length < 20 || asks.length < 20) return depth;
  const bestBid = bids[0][0];
  const bestAsk = asks[0][0];
  if (!(bestBid > 0) || !(bestAsk > 0)) return depth;
  if (Math.abs(bid - bestBid) / bestBid > 0.002) return depth;
  if (Math.abs(ask - bestAsk) / bestAsk > 0.002) return depth;
  const bidQty = Number.isFinite(bids[0][1]) ? bids[0][1] : 0;
  const askQty = Number.isFinite(asks[0][1]) ? asks[0][1] : 0;
  const pinnedBids = [[bid, bidQty], ...bids.slice(1).filter((row) => row[0] < bid && row[0] > 0 && row[1] > 0)];
  const pinnedAsks = [[ask, askQty], ...asks.slice(1).filter((row) => row[0] > ask && row[1] > 0)];
  if (pinnedBids.length < 20 || pinnedAsks.length < 20) return depth;
  rememberBookAnchor(bid, ask, depth.venue);
  return { ...depth, bids: pinnedBids.slice(0, 20), asks: pinnedAsks.slice(0, 20) };
}

function spotQuoteAgeBit(fetchedAt) {
  const ms = window.DashboardSWR?.fetchedAgeMs?.(fetchedAt);
  if (ms == null || !Number.isFinite(ms)) return "";
  return ` · ${Math.max(0, Math.round(ms / 1000))}s`;
}

function spotVenueBase(bundle) {
  const venueCount = Number(bundle?.venueCount) || (Array.isArray(bundle?.venues) ? bundle.venues.length : 0);
  if (venueCount > 0) return `Median · ${venueCount} venues`;
  return bundle?.venue || bundle?.ticker?.venue || "Median spot composite";
}

function spotSourceBase(bundle) {
  const venueCount = Number(bundle?.venueCount) || (Array.isArray(bundle?.venues) ? bundle.venues.length : 0);
  return venueCount > 0 ? `Median last · ${venueCount} venues` : "Median last";
}

function spotHeldAt(bundle) {
  return bundle?.quotedAt || bundle?.fetchedAt || lastSpotQuotedAt || lastSpotFetchedAt;
}

function spotVenueLabel(bundle) {
  return spotVenueBase(bundle) + spotQuoteAgeBit(spotHeldAt(bundle));
}

function paintSpotSourceLabels() {
  const at = lastSpotQuotedAt || lastSpotFetchedAt;
  const ms = window.DashboardSWR?.fetchedAgeMs?.(at);
  const sec = ms == null || !Number.isFinite(ms) ? null : Math.max(0, Math.round(ms / 1000));
  const age = sec == null ? "" : ` · ${sec}s`;
  const text = `${lastSpotSourceLabel || "Median last"}${age}`;
  for (const id of ["spot-last-source", "weighted-avg-source"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  if (window.spotCompositeLabel) {
    const base = String(window.spotCompositeLabel).replace(/ · \d+s$/, "");
    const next = base + age;
    window.spotCompositeLabel = next;
    const venueNote = document.getElementById("spot-venue-count");
    if (venueNote) venueNote.textContent = next;
    const spotSub = document.getElementById("spot-subtitle");
    if (spotSub && (document.body.dataset.l1 === "market" || !document.body.dataset.l1)) {
      spotSub.textContent = next;
    }
  }
}

function applySpotBundle(bundle) {
  const { ticker, klines, depth } = bundle;
  const venueLabel = spotVenueLabel(bundle);
  window.spotCompositeLabel = venueLabel;
  lastSpotSourceLabel = spotSourceBase(bundle);
  if (bundle.quotedAt || bundle.fetchedAt) lastSpotQuotedAt = bundle.quotedAt || bundle.fetchedAt;
  const chartLabel = document.getElementById("spot-chart-label");
  if (chartLabel && bundle.klineVenue) {
    const text = `1m candles · ${bundle.klineVenue}`;
    if (chartLabel.dataset.helpDecorated && window.labelWithHelp) {
      chartLabel.innerHTML = window.labelWithHelp(text, "spot-chart");
    } else {
      chartLabel.textContent = text;
    }
  }

  const spotSub = document.getElementById("spot-subtitle");
  if (spotSub && (document.body.dataset.l1 === "market" || !document.body.dataset.l1)) {
    spotSub.textContent = venueLabel;
  }
  const venueNote = document.getElementById("spot-venue-count");
  if (venueNote) venueNote.textContent = venueLabel;
  updateTicker({
    c: ticker.lastPrice,
    o: ticker.openPrice,
    openIs24h: ticker.openIs24h,
    changePct: ticker.priceChangePercent ?? ticker.changePct,
    bid: ticker.bidPrice,
    ask: ticker.askPrice,
    h: ticker.highPrice,
    l: ticker.lowPrice,
    v: ticker.volume,
    q: ticker.quoteVolume,
    w: ticker.weightedAvgPrice || ticker.lastPrice,
  });

  window.SpotCharts?.applyInitialKlines?.(klines, bundle.klineVenue, bundle.klineStale);
  // The median last is not pinned onto another venue's book.
  updateDepth({
    bids: (depth?.bids || []).slice(0, 20),
    asks: (depth?.asks || []).slice(0, 20),
    venue: bundle.depthVenue || depth?.venue || null,
    fetchedAt: depth?.fetchedAt || bundle.fetchedAt || null,
  });
  if (bundle.depthVenue) rememberBookAnchor(depth?.bids?.[0]?.[0], depth?.asks?.[0]?.[0], bundle.depthVenue);
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
        const bundleBook = bundle.depth || { bids: [], asks: [] };
        const depthBook =
          depth?.bids?.length >= 20 && depth?.asks?.length >= 20 ? depth : null;
        const bundled =
          bundleBook.bids?.length >= 20 && bundleBook.asks?.length >= 20
            ? { ...bundleBook, venue: bundle.depthVenue || bundleBook.venue }
            : null;
        const book = depthBook || bundled || bundleBook;
        return {
          ticker: bundle.ticker,
          klines: bundle.klines || [],
          depth: book,
          depthVenue: book.venue || bundle.depthVenue || null,
          klineVenue: bundle.klineVenue || null,
          klineStale: !!bundle.klineStale,
          fetchedAt: bundle.fetchedAt || new Date().toISOString(),
          venue: bundle.venue || "Median spot composite",
          venues: bundle.venues || [],
          venueCount: bundle.venueCount || (bundle.venues || []).length,
          quotedAt: bundle.quotedAt || bundle.fetchedAt || null,
          priceSource: bundle.priceSource || bundle.ticker?.priceSource || "median last",
        };
      },
      render: (data, opts = {}) => {
        if (opts.loading) return;
        applySpotBundle(data);
        if (data?.fetchedAt && !opts.stale && !opts.refreshing && !opts.refreshFailed) {
          lastSpotFetchedAt = data.quotedAt || data.fetchedAt;
          lastSpotQuotedAt = data.quotedAt || data.fetchedAt;
        }
        paintSpotSourceLabels();
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

let bookAnchor = null;

function rememberBookAnchor(bid, ask, venue) {
  const b = parseFloat(bid);
  const a = parseFloat(ask);
  if (b > 0 && a > 0) bookAnchor = { bid: b, ask: a, venue: venue || bookAnchor?.venue || null };
}

function persistSpotBook(depth) {
  const swr = window.DashboardSWR;
  if (!swr?.loadPersisted || !swr.persistPayload || !depth) return;
  const saved = swr.loadPersisted("market:spot");
  if (!saved?.data) return;
  const next = {
    ...saved.data,
    depth: {
      bids: (depth.bids || []).slice(0, 20),
      asks: (depth.asks || []).slice(0, 20),
      venue: depth.venue || saved.data.depthVenue,
      fetchedAt: depth.fetchedAt || null,
    },
    depthVenue: depth.venue || saved.data.depthVenue,
    fetchedAt: depth.fetchedAt || saved.data.fetchedAt,
  };
  swr.persistPayload("market:spot", next, next.fetchedAt);
}

async function refreshSpotLive() {
  if (spotLiveInflight) return;
  spotLiveInflight = true;
  try {
    const bundle = await fetch("/api/market/spot", { cache: "no-store" }).then((r) => r.json());
    if (!bundle?.ticker?.lastPrice) return;
    const bid = parseFloat(bundle.ticker.bidPrice);
    const ask = parseFloat(bundle.ticker.askPrice);
    const venueCount = Number(bundle.venueCount) || (Array.isArray(bundle.venues) ? bundle.venues.length : 0);
    const venueLabel = spotVenueLabel(bundle);
    window.spotCompositeLabel = venueLabel;
    lastSpotSourceLabel = spotSourceBase(bundle);
    const venueNote = document.getElementById("spot-venue-count");
    if (venueNote) venueNote.textContent = venueLabel;
    const spotSub = document.getElementById("spot-subtitle");
    if (spotSub && (document.body.dataset.l1 === "market" || !document.body.dataset.l1)) {
      spotSub.textContent = venueLabel;
    }
    updateTicker({
      c: bundle.ticker.lastPrice,
      o: bundle.ticker.openPrice,
      openIs24h: bundle.ticker.openIs24h,
      changePct: bundle.ticker.priceChangePercent ?? bundle.ticker.changePct,
      bid,
      ask,
      h: bundle.ticker.highPrice,
      l: bundle.ticker.lowPrice,
      v: bundle.ticker.volume,
      q: bundle.ticker.quoteVolume,
      w: bundle.ticker.weightedAvgPrice || bundle.ticker.lastPrice,
    });
    const book = bundle.depth || {};
    if (book.bids?.length >= 20 && book.asks?.length >= 20) {
      updateDepth({
        bids: book.bids.slice(0, 20),
        asks: book.asks.slice(0, 20),
        venue: bundle.depthVenue || book.venue,
        fetchedAt: book.fetchedAt || bundle.fetchedAt,
      });
    }
    if (bundle.quotedAt || bundle.fetchedAt) {
      lastSpotQuotedAt = bundle.quotedAt || bundle.fetchedAt;
      lastSpotFetchedAt = lastSpotQuotedAt;
    }
    paintSpotSourceLabels();
    const persisted = {
      ticker: bundle.ticker,
      klines: bundle.klines || [],
      depth: book,
      depthVenue: bundle.depthVenue || book.venue || null,
      klineVenue: bundle.klineVenue || null,
      klineStale: !!bundle.klineStale,
      fetchedAt: lastSpotFetchedAt,
      venue: venueLabel,
      venues: bundle.venues || [],
      venueCount,
    };
    window.DashboardSWR?.persistPayload?.("market:spot", persisted, lastSpotFetchedAt);
    const spotAt = lastSpotQuotedAt || lastSpotFetchedAt;
    window.DashboardSWR?.rememberViewClock?.("market", {
      l2: "spot",
      fetchedAt: spotAt,
      source: lastSpotSourceLabel || venueLabel,
      staleAfterMs: 120_000,
    });
    window.DashboardSWR?.rememberViewClock?.("market", {
      l2: "orderbook",
      fetchedAt: spotAt,
      source: lastSpotSourceLabel || venueLabel,
      staleAfterMs: 120_000,
    });
  } catch (_) {
    // Keep the last bid and ask. The venue note still shows how old they are.
    paintSpotSourceLabels();
  } finally {
    spotLiveInflight = false;
  }
}

async function refreshProxiedDepth() {
  try {
    const bookAge = window.DashboardSWR?.fetchedAgeMs?.(lastBookFetchedAt);
    const refresh = bookAge == null || bookAge > 30_000 ? "&refresh=1" : "";
    const depth = await fetch(`/api/market/depth?limit=40${refresh}`, { cache: "no-store" }).then((r) => r.json());
    if (!(depth?.bids?.length >= 20 && depth?.asks?.length >= 20)) return;
    const sameVenue =
      bookAnchor?.venue &&
      depth.venue &&
      String(bookAnchor.venue).toLowerCase() === String(depth.venue).toLowerCase();
    const aligned = sameVenue
      ? alignBookToTicker(depth, {
          bidPrice: bookAnchor.bid,
          askPrice: bookAnchor.ask,
          venue: bookAnchor.venue,
        })
      : depth;
    updateDepth({
      bids: (aligned.bids || []).slice(0, 20),
      asks: (aligned.asks || []).slice(0, 20),
      venue: depth.venue,
      fetchedAt: depth.fetchedAt || null,
    });
    rememberBookAnchor(aligned.bids?.[0]?.[0], aligned.asks?.[0]?.[0], depth.venue);
    persistSpotBook({
      bids: (aligned.bids || []).slice(0, 20),
      asks: (aligned.asks || []).slice(0, 20),
      venue: depth.venue,
      fetchedAt: depth.fetchedAt || null,
    });
  } catch (_) {
    bookRefreshFailed = true;
    paintBookMeta();
    refreshMarketLiveBadge();
  }
}

setInterval(() => {
  loadMarketIndicators(activeIndicatorTf);
}, INDICATOR_POLL_MS);
async function pollPerpWhileOpen() {
  if (!perpViewOpen() || perpPollInflight) return;
  perpPollInflight = true;
  try {
    const perp = await fetchJsonTimeout("/api/market/perp", 12000);
    if (perp?.lastPrice && perp.fetchedAt && perpQuoteShouldApply(lastFuturesFetchedAt, perp.fetchedAt)) {
      const bundle = perpBundleFromSnapshot(perp);
      applyFuturesBundle(bundle);
      lastFuturesFetchedAt = perp.fetchedAt;
      lastFuturesSource = bundle.priceSource || bundle.venue || "OKX";
      futuresVenue = String(perp.venue || futuresVenue || "okx").toLowerCase();
      window.DashboardSWR?.persistPayload?.("derivatives:futures", bundle, perp.fetchedAt);
      setConnectionStatus("connected", "futures-status");
    }
    paintFuturesStamp();
  } catch (_) {
    paintFuturesStamp();
  } finally {
    perpPollInflight = false;
  }
}

window.pollPerpWhileOpen = pollPerpWhileOpen;
setInterval(pollPerpWhileOpen, FUTURES_POLL_MS);
setInterval(loadFuturesIndicators, INDICATOR_POLL_MS);
setInterval(updateFundingCountdown, 1000);
setInterval(refreshProxiedDepth, DEPTH_POLL_MS);
setInterval(refreshSpotLive, SPOT_POLL_MS);
setTimeout(refreshSpotLive, 1500);
setInterval(paintFuturesStamp, 1000);
setInterval(paintSpotSourceLabels, 1000);
setInterval(() => {
  paintBookMeta();
  refreshMarketLiveBadge();
}, DEPTH_POLL_MS);