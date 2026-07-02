/** Cross-Market Anomaly Monitor — multi-venue premiums, anomalies, propagation, news attribution */

const XM_POLL_MS = 5_000;
const XM_BINANCE_REST = "https://api.binance.com/api/v3";
const XM_API = "/api/cross-market/snapshot";
const XM_NEWS_API = "/api/cross-market/news";
const XM_ALERT_API = "/api/cross-market/alert";
const XM_HISTORY_API = "/api/cross-market/history";

const XM_DEMO_REF = 94250;

/** Public CEX endpoints (same pattern as app.js — works from the browser). */
const XM_BROWSER_SOURCES = [
  {
    exchange: "Binance", pair: "BTC/USDT", market: "spot",
    url: `${XM_BINANCE_REST}/ticker/24hr?symbol=BTCUSDT`,
    parse: (d) => parseFloat(d.lastPrice),
  },
  {
    exchange: "Coinbase", pair: "BTC/USD", market: "spot",
    url: "https://api.exchange.coinbase.com/products/BTC-USD/ticker",
    parse: (d) => parseFloat(d.price),
  },
  {
    exchange: "Kraken", pair: "BTC/USD", market: "spot",
    url: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
    parse: (d) => {
      const key = Object.keys(d?.result || {})[0];
      return key ? parseFloat(d.result[key].c[0]) : NaN;
    },
  },
  {
    exchange: "Bitstamp", pair: "BTC/USD", market: "spot",
    url: "https://www.bitstamp.net/api/v2/ticker/btcusd/",
    parse: (d) => parseFloat(d.last),
  },
  {
    exchange: "Gemini", pair: "BTC/USD", market: "spot",
    url: "https://api.gemini.com/v1/pubticker/btcusd",
    parse: (d) => parseFloat(d.last),
  },
  {
    exchange: "OKX", pair: "BTC/USDT", market: "spot",
    url: "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
    parse: (d) => parseFloat(d?.data?.[0]?.last),
  },
  {
    exchange: "Bybit", pair: "BTC/USDT", market: "spot",
    url: "https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT",
    parse: (d) => parseFloat(d?.result?.list?.[0]?.lastPrice),
  },
  {
    exchange: "Bitfinex", pair: "BTC/USD", market: "spot",
    url: "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD",
    parse: (d) => (Array.isArray(d) ? parseFloat(d[6]) : NaN),
  },
  {
    exchange: "KuCoin", pair: "BTC/USDT", market: "spot",
    url: "https://api.kucoin.com/api/v1/market/stats?symbol=BTC-USDT",
    parse: (d) => parseFloat(d?.data?.last),
  },
  {
    exchange: "HTX", pair: "BTC/USDT", market: "spot",
    url: "https://api.huobi.pro/market/detail/merged?symbol=btcusdt",
    parse: (d) => parseFloat(d?.tick?.close),
  },
  {
    exchange: "Gate.io", pair: "BTC/USDT", market: "spot",
    url: "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT",
    parse: (d) => parseFloat(Array.isArray(d) ? d[0]?.last : NaN),
  },
  {
    exchange: "MEXC", pair: "BTC/USDT", market: "spot",
    url: "https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT",
    parse: (d) => parseFloat(d?.price),
  },
];

const XM_BROWSER_PERP = [
  {
    exchange: "Binance", pair: "BTC/USDT Perp", market: "perp",
    url: "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",
    parse: (d) => {
      const mark = parseFloat(d?.markPrice);
      const index = parseFloat(d?.indexPrice);
      if (!Number.isFinite(mark)) return null;
      return {
        price: mark,
        basisPct: mark && index ? ((mark - index) / index) * 100 : null,
        fundingRate: Number.isFinite(parseFloat(d?.lastFundingRate))
          ? parseFloat(d.lastFundingRate) * 100 : null,
      };
    },
  },
  {
    exchange: "Bybit", pair: "BTC/USDT Perp", market: "perp",
    url: "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT",
    parse: (d) => {
      const row = d?.result?.list?.[0];
      const mark = parseFloat(row?.lastPrice);
      if (!Number.isFinite(mark)) return null;
      return {
        price: mark,
        fundingRate: Number.isFinite(parseFloat(row?.fundingRate))
          ? parseFloat(row.fundingRate) * 100 : null,
      };
    },
  },
  {
    exchange: "OKX", pair: "BTC/USDT Perp", market: "perp",
    url: "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP",
    parse: (d) => {
      const mark = parseFloat(d?.data?.[0]?.last);
      if (!Number.isFinite(mark)) return null;
      return {
        price: mark,
        fundingRate: Number.isFinite(parseFloat(d?.data?.[0]?.fundingRate))
          ? parseFloat(d.data[0].fundingRate) * 100 : null,
      };
    },
  },
  {
    exchange: "Hyperliquid", pair: "BTC Perp", market: "perp",
    url: "https://api.hyperliquid.xyz/info",
    method: "POST",
    body: { type: "metaAndAssetCtxs" },
    parse: (d) => {
      if (!Array.isArray(d) || d.length < 2) return null;
      const universe = d[0]?.universe || [];
      const idx = universe.findIndex((u) => u?.name === "BTC");
      const ctx = idx >= 0 ? d[1]?.[idx] : null;
      const mark = parseFloat(ctx?.markPx || ctx?.midPx);
      if (!Number.isFinite(mark)) return null;
      return {
        price: mark,
        fundingRate: Number.isFinite(parseFloat(ctx?.funding))
          ? parseFloat(ctx.funding) * 100 : null,
      };
    },
  },
  {
    exchange: "dYdX", pair: "BTC-USD Perp", market: "perp",
    url: "https://indexer.dydx.trade/v4/perpetualMarkets?ticker=BTC-USD",
    parse: (d) => {
      const m = d?.markets?.["BTC-USD"];
      const px = parseFloat(m?.oraclePrice || m?.price);
      if (!Number.isFinite(px)) return null;
      return {
        price: px,
        fundingRate: Number.isFinite(parseFloat(m?.nextFundingRate))
          ? parseFloat(m.nextFundingRate) * 100 : null,
      };
    },
  },
];

const XM_BROWSER_DEX = [
  {
    exchange: "Jupiter", pair: "wBTC/SOL", market: "dex",
    url: "https://price.jup.ag/v6/price?ids=3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
    parse: (d) => parseFloat(d?.data?.["3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh"]?.price),
  },
  {
    exchange: "Uniswap/Curve", pair: "wBTC/USD", market: "dex",
    url: "https://coins.llama.fi/prices/current/ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    parse: (d) => parseFloat(d?.coins?.["ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"]?.price),
  },
];

let xmReady = false;
let xmPollTimer = null;
let xmData = null;
let xmLoading = false;
let xmError = null;
let xmPropagation = null;
let xmSettings = null;
let xmLiveOk = false;
let xmDataSource = "embedded";
let xmLastFetchNote = "";
let xmLastTickAt = new Map();
let xmVenueFilter = { cex: true, dex: true, perp: true };

const XM_WS_PAIRS = {
  Binance: { pair: "BTC/USDT", market: "spot" },
  Coinbase: { pair: "BTC/USD", market: "spot" },
  Kraken: { pair: "BTC/USD", market: "spot" },
  OKX: { pair: "BTC/USDT", market: "spot" },
};

const XM_PREM_HELP = {
  kimchi: "cross-market-kimchi-premium",
  coinbase: "cross-market-coinbase-premium-card",
  jpy: "cross-market-jpy-premium",
  kraken: "cross-market-kraken-premium",
  bitstamp: "cross-market-bitstamp-premium",
  gemini: "cross-market-gemini-premium",
};

const XM_HERO_HELP = {
  "Global Ref": "cross-market-global-ref",
  Kimchi: "cross-market-kimchi-hero",
  Coinbase: "cross-market-coinbase-hero",
  "Venues Live": "cross-market-venues-live",
};

function xmDecorateHelp(...roots) {
  roots.filter(Boolean).forEach((root) => window.decorateHelpLabels?.(root));
}

function xmEl(id) {
  return document.getElementById(id);
}

function xmDefaultSettings() {
  return window.XMEngine?.getSettings?.() || {
    zThreshold: 2,
    premMoveThreshold: 1.5,
    devSigmaThreshold: 2,
    webhookUrl: "",
  };
}

function xmLoadSettings() {
  const base = xmDefaultSettings();
  try {
    const raw = localStorage.getItem("xm-settings");
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...base };
}

function xmSaveSettings() {
  localStorage.setItem("xm-settings", JSON.stringify(xmSettings));
  XMEngine.setSettings(xmSettings);
}

function xmFmtUsd(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function xmFmtPct(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  return (v >= 0 ? "+" : "") + v.toFixed(digits) + "%";
}

function xmSparklineSvg(points, w = 72, h = 22) {
  if (!points?.length) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 0.01;
  const coords = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * w;
    const y = h - ((p - min) / span) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trend = points[points.length - 1] >= points[0] ? "#f59e0b" : "#38bdf8";
  return `<svg class="xm-spark" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="${trend}" stroke-width="1.5" points="${coords.join(" ")}"/></svg>`;
}

function xmSeverityClass(sev) {
  if (sev === "high") return "xm-sev--high";
  if (sev === "medium") return "xm-sev--medium";
  return "xm-sev--low";
}

function xmShowToast(alert) {
  const box = xmEl("xm-toast-stack");
  if (!box || !alert) return;
  const el = document.createElement("div");
  el.className = `xm-toast ${xmSeverityClass(alert.severity)}`;
  el.innerHTML = `<strong>${alert.title}</strong><span>${alert.body || ""}</span>`;
  box.appendChild(el);
  setTimeout(() => el.classList.add("xm-toast--out"), 4200);
  setTimeout(() => el.remove(), 4800);
}

function xmReadDomSpotPrice() {
  if (Number.isFinite(window.btcSpotPrice) && window.btcSpotPrice > 1000) {
    return window.btcSpotPrice;
  }
  const el = xmEl("price");
  if (!el) return null;
  const raw = String(el.textContent || "").replace(/,/g, "");
  const price = parseFloat(raw);
  return Number.isFinite(price) && price > 1000 ? price : null;
}

async function xmFetchJson(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith("<")) return null;
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function xmValidSnapshot(data) {
  return data && Array.isArray(data.venues) && data.venues.length > 0 && !data.error;
}

function xmLooksLikeDemo(data) {
  if (!data) return true;
  if (data.demo || data.source === "embedded" || data.source === "static") return true;
  const ref = Number(data.referenceUsd);
  if (Number.isFinite(ref) && Math.abs(ref - XM_DEMO_REF) < 400) return true;
  const bin = (data.venues || []).find((v) => v.exchange === "Binance");
  const px = Number(bin?.priceUsd ?? bin?.price);
  return Number.isFinite(px) && Math.abs(px - XM_DEMO_REF) < 400;
}

function xmMedian(nums) {
  const arr = nums.filter((n) => n > 0).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function xmMapVenue(exchange, pair, price, market, source, extra = {}) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const ccy = /KRW/i.test(pair) ? "KRW" : /JPY/i.test(pair) ? "JPY" : /EUR/i.test(pair) ? "EUR" : "USD";
  return {
    exchange, pair, price, priceUsd: price, ccy,
    market: market || "spot", source, ...extra,
  };
}

function xmVenueSpotUsd(venues, exchange) {
  const row = (venues || []).find((v) => v.exchange === exchange && xmVenueKind(v) === "cex");
  const px = row?.priceUsd ?? row?.price;
  return Number.isFinite(px) && px > 0 ? px : null;
}

function xmPremEntry(label, localUsd, refUsd) {
  if (!localUsd || !refUsd) return null;
  return {
    label,
    pct: ((localUsd - refUsd) / refUsd) * 100,
    localUsd,
    refUsd,
  };
}

/** All premium series tracked for cards, engine history, and charts. */
const XM_PREMIUM_IDS = ["kimchi", "coinbase", "jpy", "kraken", "bitstamp", "gemini", "okx", "bybit"];

function xmComputePremiums(venues, refUsd) {
  if (!refUsd) return {};
  const out = {};
  const krPrices = ["Upbit", "Bithumb"].map((ex) => xmVenueSpotUsd(venues, ex)).filter(Number.isFinite);
  const kimchiUsd = krPrices.length ? xmMedian(krPrices) : null;
  if (kimchiUsd) out.kimchi = xmPremEntry("Kimchi (KRW)", kimchiUsd, refUsd);

  const singles = [
    ["coinbase", "Coinbase USD", "Coinbase"],
    ["jpy", "Japan (JPY)", "bitFlyer"],
    ["kraken", "Kraken USD", "Kraken"],
    ["bitstamp", "Bitstamp USD", "Bitstamp"],
    ["gemini", "Gemini USD", "Gemini"],
    ["okx", "OKX USDT", "OKX"],
    ["bybit", "Bybit USDT", "Bybit"],
  ];
  singles.forEach(([id, label, exchange]) => {
    const entry = xmPremEntry(label, xmVenueSpotUsd(venues, exchange), refUsd);
    if (entry) out[id] = entry;
  });
  return out;
}

function xmPackSnapshot(venues, source, opts = {}) {
  const clean = (venues || []).filter(Boolean);
  if (!clean.length) return null;
  const refRow = clean.find((v) => v.exchange === "Binance" && v.market === "spot") || clean[0];
  const ref = refRow?.priceUsd || null;
  const vwap = xmMedian(clean.filter((v) => v.market === "spot").map((v) => v.priceUsd));
  const premiums = { ...xmComputePremiums(clean, ref), ...(opts.premiums || {}) };

  return {
    updatedAt: opts.updatedAt || new Date().toISOString(),
    crosses: ["BTC/USDT", "BTC/USD", "BTC/KRW", "BTC/JPY", "BTC/EUR", "BTC/GBP", "BTC/AUD", "BTC/CAD"],
    fx: opts.fx || {},
    referenceUsd: ref,
    vwapUsd: vwap,
    venues: clean,
    premiums,
    errors: opts.errors || [],
    fallback: false,
    demo: false,
    partial: Boolean(opts.partial),
    source,
  };
}

function xmMapExchangeRow(r, market = "spot", source = "exchanges") {
  const extra = {};
  if (r.basisPct != null) extra.basisPct = Number(r.basisPct);
  if (r.fundingPct != null) extra.fundingRate = Number(r.fundingPct);
  else if (r.fundingRate != null) {
    const fr = Number(r.fundingRate);
    extra.fundingRate = Math.abs(fr) < 0.05 ? fr * 100 : fr;
  }
  return xmMapVenue(
    r.exchange || "?",
    r.pair || "BTC/USDT",
    Number(r.price),
    market,
    source,
    extra,
  );
}

function xmBuildFromExchanges(spotPayload, perpPayload) {
  const spotRows = (spotPayload?.table || []).map((r) => ({ ...r, _xmMarket: "spot" }));
  const perpRows = (perpPayload?.table || []).map((r) => ({ ...r, _xmMarket: "perp" }));
  const rows = [...spotRows, ...perpRows];
  const venues = rows
    .map((r) => xmMapExchangeRow(
      r,
      r._xmMarket || r.market || r.type || (String(r.pair || "").includes("Perp") ? "perp" : "spot"),
      "exchanges",
    ))
    .filter(Boolean);
  if (!venues.length) return null;
  return xmPackSnapshot(venues, "exchanges", {
    updatedAt: spotPayload?.fetchedAt || perpPayload?.fetchedAt,
    partial: venues.length < 4,
  });
}

async function xmFetchBinanceRest() {
  const data = await xmFetchJson(`${XM_BINANCE_REST}/ticker/price?symbol=BTCUSDT`);
  const px = parseFloat(data?.price);
  return Number.isFinite(px) && px > 0 ? px : null;
}

async function xmBrowserFetchVenue(def) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const opts = { cache: "no-store", signal: ctrl.signal };
    if (def.method === "POST") {
      opts.method = "POST";
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(def.body || {});
    }
    const res = await fetch(def.url, opts);
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = def.parse(data);
    if (parsed && typeof parsed === "object" && parsed.price != null) {
      const { price, basisPct, fundingRate } = parsed;
      return xmMapVenue(def.exchange, def.pair, price, def.market || "spot", "browser", {
        basisPct, fundingRate,
      });
    }
    const price = typeof parsed === "number" ? parsed : parseFloat(parsed);
    return xmMapVenue(def.exchange, def.pair, price, def.market || "spot", "browser");
  } catch {
    return null;
  }
}

async function xmTryBrowserVenues() {
  const allDefs = [...XM_BROWSER_SOURCES, ...XM_BROWSER_PERP, ...XM_BROWSER_DEX];
  const results = await Promise.all(allDefs.map(xmBrowserFetchVenue));
  let venues = results.filter(Boolean);

  if (!venues.some((v) => v.exchange === "Binance")) {
    const anchor = xmReadDomSpotPrice() || await xmFetchBinanceRest();
    if (anchor) venues.unshift(xmMapVenue("Binance", "BTC/USDT", anchor, "spot", "anchor"));
  }

  const snap = xmPackSnapshot(venues, "browser");
  if (!xmValidSnapshot(snap) || xmLooksLikeDemo(snap)) return null;
  const cexN = venues.filter((v) => xmVenueKind(v) === "cex").length;
  const perpN = venues.filter((v) => xmVenueKind(v) === "perp").length;
  const dexN = venues.filter((v) => xmVenueKind(v) === "dex").length;
  xmLastFetchNote = `${cexN} CEX · ${perpN} perp · ${dexN} DEX`;
  return { data: snap, live: true, source: "browser" };
}

async function xmTryCrossMarketApi() {
  for (const url of [`${XM_API}?refresh=1`, XM_API]) {
    const data = await xmFetchJson(url);
    if (xmValidSnapshot(data) && !xmLooksLikeDemo(data)) {
      xmLastFetchNote = "cross-market API";
      const source = data.partial ? "live-partial" : "live";
      return { data, live: true, source };
    }
  }
  return null;
}

async function xmTryExchangesBridge() {
  const pairs = [
    ["/api/exchanges/spot?refresh=1", "/api/exchanges/perp?refresh=1"],
    ["/api/exchanges/spot?refresh=1", "/api/exchanges/perp"],
    ["/api/exchanges/spot", "/api/exchanges/perp"],
  ];
  for (const [spotUrl, perpUrl] of pairs) {
    const [spot, perp] = await Promise.all([xmFetchJson(spotUrl), xmFetchJson(perpUrl)]);
    const bridged = xmBuildFromExchanges(spot, perp);
    if (xmValidSnapshot(bridged) && !xmLooksLikeDemo(bridged)) {
      xmLastFetchNote = "exchanges API";
      return { data: bridged, live: true, source: "exchanges" };
    }
  }
  return null;
}

async function xmTryAnchorOnly() {
  const anchor = xmReadDomSpotPrice() || await xmFetchBinanceRest();
  if (!anchor || Math.abs(anchor - XM_DEMO_REF) < 400) return null;
  const snap = xmPackSnapshot(
    [xmMapVenue("Binance", "BTC/USDT", anchor, "spot", "anchor")],
    "anchor",
  );
  xmLastFetchNote = "dashboard spot anchor";
  return { data: snap, live: true, source: "anchor" };
}

async function xmFetchSnapshot() {
  const apiLive = await xmTryCrossMarketApi();
  if (apiLive) return apiLive;

  const browser = await xmTryBrowserVenues();
  if (browser) return browser;

  const bridged = await xmTryExchangesBridge();
  if (bridged) return bridged;

  const anchor = await xmTryAnchorOnly();
  if (anchor) return anchor;

  xmLastFetchNote = "all sources failed";
  return null;
}

const XM_NEWS_KEYWORDS = {
  kimchi_premium: ["korea", "kimchi", "upbit", "bithumb", "krw", "bitcoin"],
  coinbase_premium: ["coinbase", "institutional", "etf", "tariff", "bitcoin", "btc"],
  premium_spike: ["premium", "arbitrage", "spread", "bitcoin", "btc"],
  return_1m: ["bitcoin", "btc", "surge", "crash", "liquidation", "volatility"],
  return_5m: ["bitcoin", "btc", "rally", "selloff", "liquidation"],
  volume_burst: ["bitcoin", "btc", "volume", "liquidation", "whale"],
  cross_divergence: ["bitcoin", "btc", "arbitrage", "exchange", "spread"],
  market: ["bitcoin", "btc", "crypto", "etf", "regulation"],
};

function xmNewsKeywords(anomalyType) {
  const t = String(anomalyType || "market").toLowerCase();
  for (const [key, words] of Object.entries(XM_NEWS_KEYWORDS)) {
    if (t.includes(key.replace("_", "")) || t.includes(key)) return words;
  }
  return XM_NEWS_KEYWORDS.market;
}

function xmScoreNewsArticles(articles, keywords) {
  const blobKw = keywords.map((k) => k.toLowerCase());
  const scored = [];
  for (const art of (articles || []).slice(0, 80)) {
    const title = String(art.title || "").toLowerCase();
    const summary = String(art.summary || art.description || "").toLowerCase();
    const text = `${title} ${summary}`;
    let score = 0;
    for (const kw of blobKw) {
      if (text.includes(kw)) score += kw.length > 4 ? 2 : 1;
    }
    if (/\b(korea|kimchi|etf|tariff|liquidation|regulation|institutional)\b/.test(text)) score += 1.5;
    if (score > 0) {
      scored.push({
        title: art.title,
        link: art.link || art.url,
        source: art.source,
        confidence: Math.min(0.95, 0.35 + score * 0.1),
      });
    }
  }
  scored.sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, 6);
}

async function xmFetchNews(anomalyType) {
  const keywords = xmNewsKeywords(anomalyType);
  try {
    const res = await fetch(XM_NEWS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: anomalyType, keywords }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.matches?.length) return data.matches;
    }
  } catch { /* fall through */ }

  for (const url of ["/api/news/all", "/api/news/market"]) {
    const payload = await xmFetchJson(url);
    const articles = payload?.articles || [];
    const scored = xmScoreNewsArticles(articles, keywords);
    if (scored.length) return scored;
    if (articles.length) {
      return articles.slice(0, 4).map((a) => ({
        title: a.title,
        link: a.link || a.url,
        source: a.source,
        confidence: 0.4,
      }));
    }
  }
  return [];
}

let xmLastNewsFetch = 0;

async function xmLoadNews(anomalyType = "market", force = false) {
  if (!force && Date.now() - xmLastNewsFetch < 60_000 && xmData?.newsMatches?.length) return;
  xmLastNewsFetch = Date.now();
  const news = await xmFetchNews(anomalyType);
  if (!xmData) xmData = {};
  xmData.newsMatches = news;
  xmRenderNews();
}

function xmVenueKind(v) {
  const market = typeof v === "string" ? v : v?.market;
  const m = (market || "spot").toLowerCase();
  if (m === "dex" || v?.source === "dex") return "dex";
  if (m === "perp" || v?.type === "perp") return "perp";
  const pair = typeof v === "object" ? v?.pair : "";
  if (/perp|swap|futures/i.test(pair || "")) return "perp";
  return "cex";
}

function xmFilterVenues(venues) {
  return (venues || []).filter((v) => xmVenueFilter[xmVenueKind(v)] !== false);
}

function xmActiveFilterLabel() {
  const on = Object.entries(xmVenueFilter).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  return on.length === 3 ? "" : on.join(" + ");
}

async function xmPostAlert(alert) {
  try {
    await fetch(XM_ALERT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert, settings: xmSettings }),
    });
  } catch { /* optional server dispatch */ }
}

async function xmPostHistory(events) {
  if (!events?.length) return;
  try {
    await fetch(XM_HISTORY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
  } catch { /* optional persistence */ }
}

function xmIsExtremeAlert(a) {
  return a?.severity === "high";
}

function xmHandleEngineOutput(engine) {
  const alerts = (engine?.newAlerts || []).filter(xmIsExtremeAlert);
  alerts.forEach((a) => xmShowToast(a));
  alerts.forEach((a) => xmPostAlert(a));

  const events = engine?.newEvents || [];
  if (events.length) xmPostHistory(events);

  if (alerts.length) {
    const top = alerts[alerts.length - 1];
    xmLoadNews(top?.type || "market", true);
  }
}

function xmRecomputePremiums() {
  if (!xmData?.venues?.length) return;
  const refRow = xmData.venues.find((v) => v.exchange === "Binance" && v.market === "spot") || xmData.venues[0];
  const ref = refRow?.priceUsd || xmData.referenceUsd;
  if (!ref) return;
  xmData.referenceUsd = ref;
  xmData.vwapUsd = xmMedian(xmData.venues.filter((v) => v.market === "spot").map((v) => v.priceUsd));
  xmData.premiums = xmComputePremiums(xmData.venues, ref);
}

function xmApplySnapshot(snap, live, source) {
  if (!window.XMEngine?.ingestSnapshot) {
    throw new Error("Engine not loaded — hard refresh (Cmd+Shift+R)");
  }
  const ref = snap.referenceUsd;
  snap.premiums = { ...xmComputePremiums(snap.venues, ref), ...(snap.premiums || {}) };
  const engine = XMEngine.ingestSnapshot(snap);
  xmData = { ...snap, venues: engine.venues || snap.venues || [] };
  xmPropagation = engine.propagation;
  xmDataSource = source || (live ? "live" : "embedded");
  xmSetLiveFeed(live);
  xmError = live ? null : "Live feeds unavailable — showing last known data";
  xmHandleEngineOutput(engine);
}

function xmStatusLabel() {
  if (xmLiveOk && xmDataSource === "live") {
    return { text: "● Live", cls: "xm-status--live", title: "Cross-market API" };
  }
  if (xmLiveOk && xmDataSource === "browser") {
    return { text: "● Live (browser)", cls: "xm-status--live", title: `Direct CEX fetch: ${xmLastFetchNote}` };
  }
  if (xmLiveOk && xmDataSource === "exchanges") {
    return { text: "● Live (exchanges)", cls: "xm-status--live", title: "Server exchange bridge" };
  }
  if (xmLiveOk && xmDataSource === "anchor") {
    return { text: "● Live (Binance)", cls: "xm-status--bridge", title: "Binance spot from dashboard — add server.py for all venues" };
  }
  if (xmLiveOk && xmDataSource === "live-partial") {
    return { text: "● Live (partial)", cls: "xm-status--bridge", title: "Some venue APIs failed" };
  }
  return { text: "○ Waiting for data", cls: "xm-status--demo", title: xmLastFetchNote || "No live feed yet" };
}

function xmSetLiveFeed(live) {
  const wasLive = xmLiveOk;
  xmLiveOk = live;
  if (!live) {
    window.XMWS?.stop?.();
    return;
  }
  if (!wasLive) xmStartWs();
}

function xmStartWs() {
  if (!window.XMWS) return;
  XMWS.setHandler(xmOnWsTick);
  XMWS.start();
}

function xmOnWsTick(tick) {
  if (!xmLiveOk) return;
  if (tick?.type === "stale-check") {
    xmRenderTable();
    xmRenderHeatmap();
    return;
  }
  const { exchange, price, at } = tick;
  if (!exchange || !Number.isFinite(price)) return;
  xmLastTickAt.set(exchange, at || Date.now());
  xmPatchVenuePrice(exchange, price);
}

function xmPatchVenuePrice(exchange, px) {
  if (!Number.isFinite(px) || px <= 0) return;
  const meta = XM_WS_PAIRS[exchange] || { pair: "BTC/USD", market: "spot" };

  if (!xmData) {
    if (exchange !== "Binance") return;
    const snap = xmPackSnapshot([xmMapVenue("Binance", "BTC/USDT", px, "spot", "ws")], "anchor");
    if (snap && window.XMEngine?.ingestSnapshot) {
      try {
        xmApplySnapshot(snap, true, "anchor");
        xmRenderAll();
      } catch { /* engine not ready */ }
    }
    return;
  }

  let row = xmData.venues?.find((v) => v.exchange === exchange && v.market === meta.market);
  if (row) {
    row.price = px;
    row.priceUsd = px;
    row.source = "ws";
  } else {
    xmData.venues = [
      xmMapVenue(exchange, meta.pair, px, meta.market, "ws"),
      ...(xmData.venues || []),
    ];
  }

  if (exchange === "Binance") xmData.referenceUsd = px;
  xmRecomputePremiums();

  if (window.XMEngine?.ingestSnapshot) {
    const engine = XMEngine.ingestSnapshot(xmData);
    xmData.venues = engine.venues || xmData.venues;
    xmPropagation = engine.propagation;
    xmHandleEngineOutput(engine);
  }

  xmRenderTable();
  xmRenderPremiums();
  xmRenderHeroes();
  xmRenderHeatmap();
  xmRenderMeta();
  xmRenderPropagation();
  window.XMCharts?.renderAll?.(xmData, xmPropagation);
}

function xmPatchBinancePrice(px) {
  xmPatchVenuePrice("Binance", px);
}

async function xmLoad() {
  if (xmLoading) return;
  const firstLoad = !xmData;
  xmLoading = firstLoad;
  if (firstLoad) xmRenderStatus();

  try {
    const result = await xmFetchSnapshot();
    if (!result) {
      xmError = "Could not fetch live prices — check network connection";
      if (!xmData) {
        const anchor = xmReadDomSpotPrice() || await xmFetchBinanceRest();
        if (anchor) xmPatchBinancePrice(anchor);
      }
      xmRenderStatus();
      return;
    }

    const { data: snap, live, source } = result;
    xmApplySnapshot(snap, live, source);

    xmRenderAll();
    xmLoadNews("market", true);
  } catch (err) {
    xmError = err.message || "Failed to load cross-market data";
    const anchor = xmReadDomSpotPrice() || await xmFetchBinanceRest();
    if (anchor) xmPatchBinancePrice(anchor);
    xmRenderStatus();
  } finally {
    xmLoading = false;
    xmRenderStatus();
  }
}

function xmFmtBasis(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + Number(n).toFixed(3) + "%";
}

function xmFmtFunding(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + Number(n).toFixed(4) + "%";
}

function xmVenueBadges(v) {
  const parts = [];
  if (v.source === "ws" || v.source === "anchor") {
    parts.push('<span class="xm-ws-badge" title="Live WebSocket">LIVE</span>');
  }
  if (XM_WS_PAIRS[v.exchange] && v.source !== "ws" && v.source !== "anchor") {
    const tickAt = xmLastTickAt.get(v.exchange);
    if (window.XMWS?.isStale?.(tickAt)) {
      parts.push('<span class="xm-stale" title="No WS tick in 30s">STALE</span>');
    }
  }
  return parts.join("");
}

function xmRenderHeroes() {
  const el = xmEl("xm-heroes");
  if (!el || !xmData) return;
  const ref = xmData.referenceUsd;
  const kim = xmData.premiums?.kimchi;
  const cb = xmData.premiums?.coinbase;
  el.innerHTML = [
    { label: "Global Ref", value: xmFmtUsd(ref), sub: "Binance USDT anchor" },
    { label: "Kimchi", value: kim ? xmFmtPct(kim.pct) : "—", sub: kim?.localUsd ? `KRW venues · ${xmFmtUsd(kim.localUsd)}` : "Needs server.py", cls: kim && Math.abs(kim.pct) > 1 ? "xm-hero--warn" : "" },
    { label: "Coinbase", value: cb ? xmFmtPct(cb.pct) : "—", sub: "USD vs USDT", cls: cb && Math.abs(cb.pct) > 0.5 ? "xm-hero--accent" : "" },
    { label: "Venues Live", value: String((xmData.venues || []).length), sub: xmData.errors?.length ? `${xmData.errors.length} errors` : xmLastFetchNote || "CEX" },
  ].map((h) => {
    const helpKey = XM_HERO_HELP[h.label] || "";
    const labelHtml = helpKey
      ? `<span class="deriv-hero-label" data-help-key="${helpKey}">${h.label}</span>`
      : `<span class="deriv-hero-label">${h.label}</span>`;
    return `<div class="deriv-hero-card ${h.cls || ""}">${labelHtml}<span class="deriv-hero-value mono">${h.value}</span><span class="deriv-hero-sub">${h.sub}</span></div>`;
  }).join("");
  xmDecorateHelp(el);
}

function xmPremiumCard(id, prem) {
  if (!prem) return "";
  const spark = XMEngine.premiumSparkline(id);
  const abs = Math.abs(prem.pct || 0);
  const status = abs >= 2 ? "anomaly" : abs >= 1 ? "elevated" : "normal";
  const helpKey = XM_PREM_HELP[id] || "";
  const h3 = helpKey
    ? `<h3 data-help-key="${helpKey}">${prem.label || id}</h3>`
    : `<h3>${prem.label || id}</h3>`;
  return `<article class="xm-prem-card xm-prem-card--${status}" data-prem="${id}">
    <header>${h3}<span class="xm-prem-pct mono">${xmFmtPct(prem.pct)}</span></header>
    <div class="xm-prem-meta mono"><span>Local ${xmFmtUsd(prem.localUsd)}</span><span>Ref ${xmFmtUsd(prem.refUsd)}</span></div>
    ${xmSparklineSvg(spark, 120, 28)}
  </article>`;
}

function xmRenderPremiums() {
  const el = xmEl("xm-premiums");
  if (!el || !xmData) return;
  const p = xmData.premiums || {};
  const order = XM_PREMIUM_IDS;
  el.innerHTML = order.map((id) => xmPremiumCard(id, p[id])).filter(Boolean).join("")
    || "<p class=\"xm-empty\">Premium cards appear when multiple USD venues are live.</p>";
  xmDecorateHelp(el);
}

function xmRenderTable() {
  const tbody = xmEl("xm-table-body");
  if (!tbody || !xmData) return;
  const ref = xmData.referenceUsd;
  const filtered = xmFilterVenues(xmData.venues);
  const rows = filtered.sort((a, b) => Math.abs(b.z1m || 0) - Math.abs(a.z1m || 0));
  if (!rows.length) {
    const label = xmActiveFilterLabel() || "matching";
    tbody.innerHTML = `<tr><td colspan="10">No ${label} venues in current feed.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((v) => {
    const prem = v.priceUsd && ref ? ((v.priceUsd - ref) / ref * 100) : null;
    const zCls = Math.abs(v.z1m || 0) >= 2 ? "xm-z--hot" : "";
    const badges = xmVenueBadges(v);
    return `<tr>
      <td>${v.exchange}${badges}</td>
      <td class="mono">${v.pair || "—"}</td>
      <td class="mono">${xmFmtUsd(v.priceUsd || v.price)}</td>
      <td class="mono" title="Binance USDT anchor">${xmFmtUsd(ref)}</td>
      <td class="mono">${xmFmtPct(prem)}</td>
      <td class="mono ${zCls}">${v.z1m != null ? v.z1m.toFixed(2) : "—"}</td>
      <td class="mono">${v.z5m != null ? v.z5m.toFixed(2) : "—"}</td>
      <td>${v.market || "spot"}</td>
      <td class="mono">${xmFmtBasis(v.basisPct)}</td>
      <td class="mono">${xmFmtFunding(v.fundingRate)}</td>
    </tr>`;
  }).join("");
}

function xmRenderPropagation() {
  const el = xmEl("xm-propagation");
  if (!el) return;
  const p = xmPropagation;
  if (!p || !p.edges?.length) {
    el.innerHTML = "<p class=\"xm-muted\">No active propagation cluster. Anomalies within 10–45s will map origin → followers.</p>";
    return;
  }
  const edges = p.edges.map((e) => `<div class="xm-prop-edge"><span class="xm-prop-from">${e.from}</span><span class="xm-prop-arrow">→</span><span class="xm-prop-to">${e.to}</span><span class="xm-prop-delay mono">${e.delaySec}s</span></div>`).join("");
  const vel = p.spreadVelocity != null ? ` · spreadVelocity <span class="mono">${p.spreadVelocity}s</span>` : "";
  el.innerHTML = `<div class="xm-prop-origin">Origin: <strong>${p.origin}</strong> · avg delay <span class="mono">${p.avgDelaySec}s</span>${vel} · ${p.eventCount} events</div>${edges}`;
  window.XMCharts?.renderPropGraph?.(p);
}

function xmRenderAlerts() {
  const el = xmEl("xm-alerts");
  if (!el) return;
  const alerts = XMEngine.getAlerts().filter(xmIsExtremeAlert).slice(0, 8);
  if (!alerts.length) {
    el.innerHTML = "<p class=\"xm-muted\">No extreme alerts. Only high-severity shocks (|z|≥3, large premium Δ, devσ≥3) appear here.</p>";
    return;
  }
  el.innerHTML = alerts.map((a) => `<div class="xm-alert ${xmSeverityClass(a.severity)}"><time class="mono">${new Date(a.ts).toLocaleTimeString()}</time><strong>${a.title}</strong><span>${a.body || ""}</span></div>`).join("");
}

function xmRenderNews() {
  const el = xmEl("xm-news");
  if (!el) return;
  const matches = xmData?.newsMatches || [];
  if (!matches.length) {
    el.innerHTML = "<p class=\"xm-muted\">Loading BTC headlines from RSS feeds — refreshes on extreme alerts.</p>";
    return;
  }
  el.innerHTML = matches.map((m) => `<a class="xm-news-item" href="${m.link || "#"}" target="_blank" rel="noopener"><span class="xm-news-conf mono">${Math.round((m.confidence || 0) * 100)}%</span><strong>${m.title}</strong><span class="xm-news-src">${m.source || ""}</span></a>`).join("");
}

function xmRenderHeatmap() {
  const el = xmEl("xm-heatmap");
  if (!el || !xmData) return;
  el.innerHTML = xmFilterVenues(xmData.venues).map((v) => {
    const heat = Math.min(100, Math.abs(v.z1m || 0) * 25);
    const bg = heat > 60 ? "rgba(245,158,11,0.55)" : heat > 30 ? "rgba(56,189,248,0.35)" : "rgba(255,255,255,0.06)";
    return `<div class="xm-heat-cell" style="background:${bg}" title="${v.exchange} z=${v.z1m}"><span>${v.exchange}</span><span class="mono">${v.z1m?.toFixed(1) || "—"}</span></div>`;
  }).join("");
}

function xmRenderMeta() {
  const el = xmEl("xm-meta");
  if (!el) return;
  if (!xmData) {
    el.textContent = "Fetching live prices…";
    return;
  }
  const t = xmData.updatedAt ? new Date(xmData.updatedAt).toLocaleTimeString() : "—";
  const status = xmStatusLabel();
  el.innerHTML = `Updated ${t} · ${(xmData.venues || []).length} venues · <span class="xm-status ${status.cls}" title="${status.title}">${status.text}</span>`;
}

function xmRenderStatus() {
  const loading = xmEl("xm-loading");
  const err = xmEl("xm-error");
  if (loading) loading.hidden = !xmLoading || Boolean(xmData);
  if (err) {
    const showErr = Boolean(xmError) && !xmLiveOk;
    err.hidden = !showErr;
    if (showErr) {
      err.textContent = xmError;
      err.classList.add("xm-error--warn");
    }
  }
}

function xmRenderAll() {
  xmRenderMeta();
  xmRenderHeroes();
  xmRenderPremiums();
  xmRenderTable();
  xmRenderHeatmap();
  xmRenderPropagation();
  xmRenderAlerts();
  xmRenderNews();
  xmRenderStatus();
  window.XMCharts?.renderAll?.(xmData, xmPropagation);
}

function xmOpenSettings() {
  const dlg = xmEl("xm-settings-dialog");
  if (!dlg) return;
  xmEl("xm-set-z").value = xmSettings.zThreshold;
  xmEl("xm-set-prem").value = xmSettings.premMoveThreshold;
  xmEl("xm-set-dev").value = xmSettings.devSigmaThreshold ?? 2;
  xmEl("xm-set-webhook").value = xmSettings.webhookUrl || "";
  xmDecorateHelp(dlg);
  dlg.showModal();
}

function xmSaveSettingsModal() {
  xmSettings.zThreshold = parseFloat(xmEl("xm-set-z")?.value) || 2;
  xmSettings.premMoveThreshold = parseFloat(xmEl("xm-set-prem")?.value) || 1.5;
  xmSettings.devSigmaThreshold = parseFloat(xmEl("xm-set-dev")?.value) || 2;
  xmSettings.webhookUrl = (xmEl("xm-set-webhook")?.value || "").trim();
  xmSaveSettings();
  xmEl("xm-settings-dialog")?.close();
}

function xmSyncFilterButtons() {
  document.querySelectorAll("[data-xm-filter]").forEach((btn) => {
    const kind = btn.getAttribute("data-xm-filter");
    const on = xmVenueFilter[kind] !== false;
    btn.classList.toggle("xm-filter--active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function xmToggleVenueFilter(kind) {
  const active = Object.entries(xmVenueFilter).filter(([, v]) => v).map(([k]) => k);
  const exclusive = active.length === 1 && active[0] === kind;
  if (exclusive) {
    xmVenueFilter = { cex: true, dex: true, perp: true };
  } else {
    xmVenueFilter = { cex: kind === "cex", dex: kind === "dex", perp: kind === "perp" };
  }
  xmSyncFilterButtons();
  xmRenderTable();
  xmRenderHeatmap();
}

function xmBindEvents() {
  xmEl("xm-refresh")?.addEventListener("click", () => xmLoad());
  xmEl("xm-settings-btn")?.addEventListener("click", xmOpenSettings);
  xmEl("xm-settings-save")?.addEventListener("click", xmSaveSettingsModal);
  xmEl("xm-settings-cancel")?.addEventListener("click", () => xmEl("xm-settings-dialog")?.close());
  document.querySelectorAll("[data-xm-filter]").forEach((btn) => {
    btn.addEventListener("click", () => xmToggleVenueFilter(btn.getAttribute("data-xm-filter")));
  });
  xmSyncFilterButtons();
  window.addEventListener("btc-spot-price", (ev) => {
    if (!xmReady) return;
    const px = ev.detail?.price;
    if (xmLiveOk && px > 0) xmPatchBinancePrice(px);
    else if (!xmData && px > 0) xmPatchBinancePrice(px);
  });
}

function xmStartPoll() {
  if (xmPollTimer) return;
  xmPollTimer = setInterval(xmLoad, XM_POLL_MS);
}

function initCrossMarket() {
  if (!xmSettings) xmSettings = xmLoadSettings();
  if (!xmReady) {
    xmReady = true;
    XMEngine.setSettings(xmSettings);
    xmBindEvents();
    window.XMCharts?.bindWindowControls?.();
    window.XMCharts?.ensureChartShells?.();
    xmStartPoll();
    const root = document.querySelector('#dashboard-misc .menu-screen[data-l2="cross-market"]');
    xmDecorateHelp(root);
    window.initMetricHelp?.();
  }
  xmLoad();
}

window.initCrossMarket = initCrossMarket;

function xmBootstrap() {
  const l1 = localStorage.getItem("btc-menu-l1") || window.MenuController?.l1;
  const l2 = localStorage.getItem("btc-menu-l2") || window.MenuController?.l2;
  if (l1 === "misc" && l2 === "cross-market") initCrossMarket();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", xmBootstrap);
} else {
  xmBootstrap();
}
window.addEventListener("load", xmBootstrap);