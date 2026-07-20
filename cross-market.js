/** Cross-Market Anomaly Monitor — multi-venue premiums, anomalies, propagation, news attribution */

const XM_POLL_MS = 5_000;
const XM_REST_POLL_MS = 3_000;
const XM_REST_STALE_MS = 15_000;
const XM_BINANCE_REST = "https://api.binance.com/api/v3";
const XM_API = "/api/cross-market/snapshot";
const XM_NEWS_API = "/api/cross-market/news";
const XM_ALERT_API = "/api/cross-market/alert";
const XM_HISTORY_API = "/api/cross-market/history";

const XM_DEMO_REF = 94250;
const XM_TOASTS_ENABLED = false;

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
    urls: [
      "https://www.bitstamp.net/api/v2/ticker/btcusd/",
      "https://bitstamp.net/api/v2/ticker/btcusd/",
    ],
    parse: (d) => parseFloat(d.last),
  },
  {
    exchange: "Gemini", pair: "BTC/USD", market: "spot",
    urls: [
      "https://api.gemini.com/v1/pubticker/btcusd",
      "https://api.gemini.com/v2/ticker/BTCUSD",
    ],
    parse: (d) => parseFloat(d.last ?? d.close ?? d.mark_price),
  },
  {
    exchange: "Upbit", pair: "BTC/KRW", market: "spot", ccy: "KRW",
    url: "https://api.upbit.com/v1/ticker?markets=KRW-BTC",
    parse: (d) => parseFloat(Array.isArray(d) ? d[0]?.trade_price : NaN),
  },
  {
    exchange: "Bithumb", pair: "BTC/KRW", market: "spot", ccy: "KRW",
    url: "https://api.bithumb.com/public/ticker/BTC_KRW",
    parse: (d) => parseFloat(d?.data?.closing_price),
  },
  {
    exchange: "bitFlyer", pair: "BTC/JPY", market: "spot", ccy: "JPY",
    url: "https://api.bitflyer.com/v1/ticker?product_code=BTC_JPY",
    parse: (d) => parseFloat(d?.ltp),
  },
  {
    exchange: "Crypto.com", pair: "BTC/USDT", market: "spot",
    urls: [
      "https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name=BTC_USDT",
      "https://api.crypto.com/v2/public/get-ticker?instrument_name=BTC_USDT",
    ],
    parse: (d) => {
      const row = d?.result?.data?.[0] ?? d?.result;
      if (!row) return NaN;
      const ask = parseFloat(row.a);
      const bid = parseFloat(row.b);
      const last = parseFloat(row.k ?? row.last ?? row.price);
      if (Number.isFinite(last) && last > 10_000) return last;
      if (Number.isFinite(ask) && Number.isFinite(bid)) return (ask + bid) / 2;
      return ask;
    },
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
    urls: [
      "https://api.htx.com/market/detail/merged?symbol=btcusdt",
      "https://api.huobi.pro/market/detail/merged?symbol=btcusdt",
      "https://api.htx.com/market/trade?symbol=btcusdt",
    ],
    parse: (d) => {
      const close = parseFloat(d?.tick?.close);
      if (Number.isFinite(close) && close > 0) return close;
      const trade = parseFloat(d?.tick?.data?.[0]?.price);
      if (Number.isFinite(trade) && trade > 0) return trade;
      return NaN;
    },
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
let xmRestPollTimer = null;
let xmData = null;
let xmLoading = false;
let xmError = null;
let xmPropagation = null;
let xmLastPropagation = null;
let xmSettings = null;
let xmLiveOk = false;
let xmDataSource = "embedded";
let xmLastFetchNote = "";
let xmLastTickAt = new Map();
let xmLastPollAt = new Map();
let xmVenueFilter = { cex: true, dex: true, perp: true };
let xmFxCache = { USD: 1 };
let xmCanonicalSeed = null;

const XM_WS_PAIRS = {
  Binance: { pair: "BTC/USDT", market: "spot", ccy: "USDT" },
  Coinbase: { pair: "BTC/USD", market: "spot", ccy: "USD" },
  Kraken: { pair: "BTC/USD", market: "spot", ccy: "USD" },
  OKX: { pair: "BTC/USDT", market: "spot", ccy: "USDT" },
  Bitstamp: { pair: "BTC/USD", market: "spot", ccy: "USD" },
  Gemini: { pair: "BTC/USD", market: "spot", ccy: "USD" },
  Bybit: { pair: "BTC/USDT", market: "spot", ccy: "USDT" },
  Upbit: { pair: "BTC/KRW", market: "spot", ccy: "KRW" },
  Bithumb: { pair: "BTC/KRW", market: "spot", ccy: "KRW" },
  HTX: { pair: "BTC/USDT", market: "spot", ccy: "USDT" },
  "Crypto.com": { pair: "BTC/USDT", market: "spot", ccy: "USDT" },
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

function xmFmtUsd(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return "$" + Number(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function xmFmtPct(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  return (v >= 0 ? "+" : "") + v.toFixed(digits) + "%";
}

function xmSeverityClass(sev) {
  if (sev === "high") return "xm-sev--high";
  if (sev === "medium") return "xm-sev--medium";
  return "xm-sev--low";
}

function xmShowToast(alert) {
  if (!XM_TOASTS_ENABLED) return;
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

function xmInferCcy(pair, ccy) {
  if (ccy) return ccy;
  if (/KRW/i.test(pair)) return "KRW";
  if (/JPY/i.test(pair)) return "JPY";
  if (/EUR/i.test(pair)) return "EUR";
  return "USD";
}

function xmToUsd(price, ccy, fx) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const c = xmInferCcy("", ccy);
  if (c === "USD" || c === "USDT") return price;
  const perUsd = fx?.[c];
  if (!perUsd || perUsd <= 0) return null;
  return price / perUsd;
}

async function xmFetchFxRates() {
  const out = { USD: 1, USDT: 1 };

  const er = await xmFetchJson("https://open.er-api.com/v6/latest/USD");
  if (er?.rates) {
    for (const c of ["KRW", "JPY", "EUR", "GBP", "AUD", "CAD"]) {
      if (er.rates[c] > 0) out[c] = er.rates[c];
    }
  }

  const upbitUsdt = await xmFetchJson("https://api.upbit.com/v1/ticker?markets=KRW-USDT");
  const krwPerUsdt = parseFloat(upbitUsdt?.[0]?.trade_price);
  if (krwPerUsdt > 500) out.KRW = krwPerUsdt;

  if (Object.keys(out).length > 2) {
    xmFxCache = { ...xmFxCache, ...out };
    return xmFxCache;
  }

  const frank = await xmFetchJson(
    "https://api.frankfurter.app/latest?from=USD&to=JPY,EUR,GBP,AUD,CAD",
  );
  if (frank?.rates) Object.assign(out, frank.rates);

  if (Object.keys(out).length > 2) {
    xmFxCache = { ...xmFxCache, ...out };
    return xmFxCache;
  }

  return xmFxCache;
}

function xmVenueNativeUsd(v, fx) {
  if (!v) return null;
  const ccy = xmInferCcy(v.pair, v.ccy);
  if (ccy === "USD" || ccy === "USDT") return v.price;
  const rates = fx || xmData?.fx || xmFxCache;
  const converted = xmToUsd(v.price, ccy, rates);
  if (converted) return converted;
  const px = v.priceUsd;
  if (!Number.isFinite(px)) return null;
  if (ccy === "KRW" && px > 500_000) return null;
  if (ccy === "JPY" && px > 500_000) return null;
  return px;
}

function xmApplyFxToVenues(venues, fx) {
  const rates = fx || xmFxCache;
  return (venues || []).map((v) => {
    if (!v) return v;
    const ccy = xmInferCcy(v.pair, v.ccy);
    const usd = xmVenueNativeUsd({ ...v, ccy }, rates);
    if (usd) return { ...v, ccy, priceUsd: usd };
    if (ccy === "USD" || ccy === "USDT") return { ...v, ccy, priceUsd: v.price };
    return { ...v, ccy, priceUsd: null };
  });
}

function xmVenueKey(v) {
  return `${v.exchange}|${v.market || "spot"}|${v.pair || ""}`;
}

/** Full venue roster — table always shows every row (alphabetical), even when feeds are stale. */
function xmCanonicalVenues() {
  if (xmCanonicalSeed) return xmCanonicalSeed;
  const defs = [...XM_BROWSER_SOURCES, ...XM_BROWSER_PERP, ...XM_BROWSER_DEX];
  xmCanonicalSeed = defs.map((d) => {
    const pair = d.pair || "BTC/USDT";
    const ccy = d.ccy || xmInferCcy(pair);
    return {
      exchange: d.exchange,
      pair,
      market: d.market || "spot",
      ccy,
      price: null,
      priceUsd: null,
      source: "pending",
      z1m: null,
      z5m: null,
    };
  });
  return xmCanonicalSeed;
}

function xmVenueSourceRank(source) {
  if (source === "ws") return 4;
  if (source === "browser") return 3;
  if (source === "live" || source === "live-partial" || source === "exchanges") return 2;
  return 1;
}

function xmPickVenueRow(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming?.price && !incoming?.priceUsd) return existing;
  if (!existing?.price && !existing?.priceUsd) return incoming;
  const rIn = xmVenueSourceRank(incoming.source);
  const rEx = xmVenueSourceRank(existing.source);
  if (rIn > rEx) return incoming;
  if (rIn < rEx) return existing;
  const tIn = xmLastTickAt.get(incoming.exchange) || 0;
  const tEx = xmLastTickAt.get(existing.exchange) || 0;
  if (tIn > tEx) return incoming;
  if (tEx > tIn) return existing;
  return incoming;
}

function xmMergeVenueRegistry(incoming, existing, fx) {
  const map = new Map();
  for (const v of xmCanonicalVenues()) {
    map.set(xmVenueKey(v), v);
  }
  for (const v of existing || []) {
    if (!v?.exchange) continue;
    const [refreshed] = xmApplyFxToVenues([v], fx);
    if (refreshed) {
      const key = xmVenueKey(refreshed);
      map.set(key, xmPickVenueRow(map.get(key), refreshed));
    }
  }
  for (const v of incoming || []) {
    if (!v?.exchange) continue;
    const [refreshed] = xmApplyFxToVenues([v], fx);
    if (refreshed) {
      const key = xmVenueKey(refreshed);
      map.set(key, xmPickVenueRow(map.get(key), refreshed));
    }
  }
  return [...map.values()];
}

function xmMergeVenues(primary, supplemental) {
  const map = new Map();
  for (const v of primary || []) {
    if (v) map.set(xmVenueKey(v), v);
  }
  for (const v of supplemental || []) {
    if (!v) continue;
    const key = xmVenueKey(v);
    const existing = map.get(key);
    const preferNew = !existing
      || v.source === "browser"
      || v.source === "ws"
      || (existing.source !== "browser" && existing.source !== "ws");
    if (preferNew) map.set(key, v);
  }
  return [...map.values()];
}

function xmMapVenue(exchange, pair, price, market, source, extra = {}) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const ccy = xmInferCcy(pair, extra.ccy);
  const priceUsd = extra.priceUsd ?? (ccy === "USD" || ccy === "USDT" ? price : null);
  return {
    exchange, pair, price, priceUsd, ccy,
    market: market || "spot", source, ...extra,
  };
}

function xmVenueSpotUsd(venues, exchange, fx) {
  const row = (venues || []).find((v) => v.exchange === exchange && xmVenueKind(v) === "cex");
  const px = xmVenueNativeUsd(row, fx);
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

function xmPremiumId(exchange) {
  return String(exchange || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Per-venue spot premiums vs Binance reference (all CEX spot venues except anchor). */
function xmComputePremiums(venues, refUsd, fx) {
  if (!refUsd) return {};
  const out = {};
  for (const v of venues || []) {
    if (!v || xmVenueKind(v) !== "cex") continue;
    if (v.market && v.market !== "spot") continue;
    if (v.exchange === "Binance") continue;
    const localUsd = xmVenueNativeUsd(v, fx);
    const entry = xmPremEntry(v.exchange, localUsd, refUsd);
    if (!entry) continue;
    out[xmPremiumId(v.exchange)] = { ...entry, exchange: v.exchange };
  }
  return out;
}

function xmPackSnapshot(venues, source, opts = {}) {
  const fx = opts.fx || xmFxCache;
  const clean = xmApplyFxToVenues((venues || []).filter(Boolean), fx);
  if (!clean.length) return null;
  const refRow = clean.find((v) => v.exchange === "Binance" && v.market === "spot") || clean[0];
  const ref = refRow?.priceUsd || null;
  const vwap = xmMedian(
    clean.filter((v) => v.market === "spot").map((v) => v.priceUsd).filter(Number.isFinite),
  );
  const premiums = { ...xmComputePremiums(clean, ref, fx), ...(opts.premiums || {}) };

  return {
    updatedAt: opts.updatedAt || new Date().toISOString(),
    crosses: ["BTC/USDT", "BTC/USD", "BTC/KRW", "BTC/JPY", "BTC/EUR", "BTC/GBP", "BTC/AUD", "BTC/CAD"],
    fx,
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
  const pair = r.pair || "BTC/USDT";
  const extra = { ccy: r.ccy };
  if (/KRW/i.test(pair)) extra.ccy = "KRW";
  else if (/JPY/i.test(pair)) extra.ccy = "JPY";
  else if (/EUR/i.test(pair)) extra.ccy = "EUR";
  else if (!extra.ccy) extra.ccy = "USD";
  if (r.basisPct != null) extra.basisPct = Number(r.basisPct);
  if (r.fundingPct != null) extra.fundingRate = Number(r.fundingPct);
  else if (r.fundingRate != null) {
    const fr = Number(r.fundingRate);
    extra.fundingRate = Math.abs(fr) < 0.05 ? fr * 100 : fr;
  }
  return xmMapVenue(
    r.exchange || "?",
    pair,
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
  const urls = def.urls || (def.url ? [def.url] : []);
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const opts = { cache: "no-store", signal: ctrl.signal, mode: "cors" };
      if (def.method === "POST") {
        opts.method = "POST";
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify(def.body || {});
      }
      const res = await fetch(url, opts);
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const parsed = def.parse(data);
      const extra = { ccy: def.ccy };
      if (parsed && typeof parsed === "object" && parsed.price != null) {
        const { price, basisPct, fundingRate } = parsed;
        const row = xmMapVenue(def.exchange, def.pair, price, def.market || "spot", "browser", {
          ...extra, basisPct, fundingRate,
        });
        if (row) {
          xmLastPollAt.set(def.exchange, Date.now());
          return row;
        }
        continue;
      }
      const price = typeof parsed === "number" ? parsed : parseFloat(parsed);
      const row = xmMapVenue(def.exchange, def.pair, price, def.market || "spot", "browser", extra);
      if (row) {
        xmLastPollAt.set(def.exchange, Date.now());
        return row;
      }
    } catch {
      /* try next URL */
    }
  }
  return null;
}

function xmBrowserFeedNote(venues) {
  const cexN = venues.filter((v) => xmVenueKind(v) === "cex").length;
  const perpN = venues.filter((v) => xmVenueKind(v) === "perp").length;
  const dexN = venues.filter((v) => xmVenueKind(v) === "dex").length;
  return `${cexN} CEX · ${perpN} perp · ${dexN} DEX (browser)`;
}

async function xmTryBrowserVenues() {
  const allDefs = [...XM_BROWSER_SOURCES, ...XM_BROWSER_PERP, ...XM_BROWSER_DEX];
  const [results, fx] = await Promise.all([
    Promise.all(allDefs.map(xmBrowserFetchVenue)),
    xmFetchFxRates(),
  ]);
  let venues = xmApplyFxToVenues(results.filter(Boolean), fx);

  if (!venues.some((v) => v.exchange === "Binance")) {
    const anchor = xmReadDomSpotPrice() || await xmFetchBinanceRest();
    if (anchor) venues.unshift(xmMapVenue("Binance", "BTC/USDT", anchor, "spot", "anchor"));
  }

  if (venues.length < 2) return null;

  const snap = xmPackSnapshot(venues, "browser", { fx });
  if (!xmValidSnapshot(snap)) return null;
  const note = xmBrowserFeedNote(venues);
  return { data: snap, live: true, source: "browser", note, venueCount: venues.length };
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

function xmFinalizeSnapshot(snap, source, live, browserMeta) {
  if (!snap || !xmValidSnapshot(snap)) return null;
  if (xmLooksLikeDemo(snap) && !browserMeta?.venueCount) return null;
  if (browserMeta?.note) {
    xmLastFetchNote = browserMeta.note;
  }
  return { data: snap, live: live || Boolean(browserMeta?.venueCount), source };
}

async function xmFetchSnapshot() {
  const [browser, apiLive, bridged] = await Promise.all([
    xmTryBrowserVenues(),
    xmTryCrossMarketApi(),
    xmTryExchangesBridge(),
  ]);

  let snap = null;
  let live = false;
  let source = "embedded";
  const browserMeta = browser ? { note: browser.note, venueCount: browser.venueCount } : null;

  if (apiLive?.data && xmValidSnapshot(apiLive.data) && !xmLooksLikeDemo(apiLive.data)) {
    snap = apiLive.data;
    live = apiLive.live;
    source = apiLive.source;
    xmLastFetchNote = "cross-market API";
  } else if (bridged?.data && xmValidSnapshot(bridged.data) && !xmLooksLikeDemo(bridged.data)) {
    snap = bridged.data;
    live = bridged.live;
    source = bridged.source;
    xmLastFetchNote = "exchanges API";
  } else if (browser?.data) {
    snap = browser.data;
    live = browser.live;
    source = browser.source;
  }

  const fx = browser?.data?.fx || snap?.fx || xmFxCache;
  if (snap?.venues?.length && fx) {
    snap = { ...snap, venues: xmApplyFxToVenues(snap.venues, fx), fx };
  }

  if (browser?.data?.venues?.length) {
    const merged = xmMergeVenues(snap?.venues, browser.data.venues);
    const repacked = xmPackSnapshot(merged, snap ? `${source}+browser` : "browser", {
      updatedAt: browser.data.updatedAt || snap?.updatedAt,
      fx,
      errors: [...(snap?.errors || []), ...(browser.data.errors || [])],
      partial: Boolean(snap && merged.length > (snap.venues || []).length),
    });
    if (repacked) {
      snap = repacked;
      live = true;
      if (!snap?.venues?.length || browser.data.venues.length >= 4) source = "browser";
      else if (source === "embedded") source = "browser";
    }
  }

  const finalized = xmFinalizeSnapshot(snap, source, live, browserMeta);
  if (finalized) return finalized;

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
  const fx = xmData.fx || xmFxCache;
  xmData.venues = xmApplyFxToVenues(xmData.venues, fx);
  const refRow = xmData.venues.find((v) => v.exchange === "Binance" && v.market === "spot") || xmData.venues[0];
  const ref = refRow?.priceUsd || xmData.referenceUsd;
  if (!ref) return;
  xmData.referenceUsd = ref;
  xmData.vwapUsd = xmMedian(
    xmData.venues.filter((v) => v.market === "spot").map((v) => v.priceUsd).filter(Number.isFinite),
  );
  xmData.premiums = xmComputePremiums(xmData.venues, ref, fx);
}

function xmApplySnapshot(snap, live, source) {
  if (!window.XMEngine?.ingestSnapshot) {
    throw new Error("Engine not loaded — hard refresh (Cmd+Shift+R)");
  }
  if (snap.fx) xmFxCache = { ...xmFxCache, ...snap.fx };
  const fx = snap.fx || xmFxCache;
  const incoming = snap.venues || [];
  const mergedVenues = xmMergeVenueRegistry(incoming, xmData?.venues, fx);
  const ref = snap.referenceUsd;
  const engineSnap = { ...snap, venues: mergedVenues };
  engineSnap.premiums = { ...xmComputePremiums(mergedVenues, ref, fx), ...(snap.premiums || {}) };
  const engine = XMEngine.ingestSnapshot(engineSnap);
  const venues = xmMergeVenueRegistry(engine.venues || mergedVenues, mergedVenues, fx);
  xmData = { ...snap, venues, fx };
  xmPropagation = engine.propagation;
  xmUpdateLastPropagation(xmPropagation);
  xmDataSource = source || (live ? "live" : "embedded");
  xmSetLiveFeed(live);
  xmError = live ? null : "Live feeds unavailable — showing last known data";
  xmHandleEngineOutput(engine);
}

function xmStatusLabel() {
  if (xmLiveOk && (xmDataSource === "browser" || String(xmDataSource).includes("browser"))) {
    return { text: "● Live (browser)", cls: "xm-status--live", title: `Direct CEX fetch: ${xmLastFetchNote}` };
  }
  if (xmLiveOk && xmDataSource === "live") {
    return { text: "● Live", cls: "xm-status--live", title: "Cross-market API" };
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

const XM_REST_POLL_VENUES = ["Upbit", "Bithumb", "bitFlyer"];

function xmSetLiveFeed(live) {
  const wasLive = xmLiveOk;
  xmLiveOk = live;
  if (!live) {
    window.XMWS?.stop?.();
    xmStopRestPoll();
    return;
  }
  if (!wasLive) {
    xmStartWs();
    xmStartRestPoll();
  }
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
  const { exchange, price, at, ccy, source } = tick;
  if (!exchange || !Number.isFinite(price)) return;
  const tickAt = at || Date.now();
  xmLastTickAt.set(exchange, tickAt);
  xmPatchVenuePrice(exchange, price, { ccy, source: source || "ws", at: tickAt });
}

function xmPatchVenuePrice(exchange, px, opts = {}) {
  if (!Number.isFinite(px) || px <= 0) return;
  const meta = XM_WS_PAIRS[exchange] || { pair: "BTC/USD", market: "spot", ccy: "USD" };
  const ccy = opts.ccy || meta.ccy || "USD";
  const feedSource = opts.source || "ws";
  const fx = xmData?.fx || xmFxCache;
  const priceUsd = ccy === "USD" || ccy === "USDT" ? px : xmToUsd(px, ccy, fx);

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

  const tickAt = opts.at || Date.now();
  const prevPx = xmData.venues?.find((v) => v.exchange === exchange && v.market === meta.market)?.priceUsd;
  const priceChanged = !Number.isFinite(prevPx) || Math.abs(prevPx - (priceUsd ?? px)) > Math.max(0.05, prevPx * 1e-7);

  let row = xmData.venues?.find((v) => v.exchange === exchange && v.market === meta.market);
  if (row) {
    row.price = px;
    row.ccy = ccy;
    row.priceUsd = priceUsd ?? row.priceUsd;
    row.source = feedSource;
    row.tickAt = tickAt;
  } else {
    xmData.venues = [
      xmMapVenue(exchange, meta.pair, px, meta.market, feedSource, { ccy, priceUsd: priceUsd ?? undefined }),
      ...(xmData.venues || []),
    ];
  }

  if (exchange === "Binance") xmData.referenceUsd = px;
  xmRecomputePremiums();

  const refChanged = exchange === "Binance" && priceChanged;
  if (window.XMEngine?.ingestSnapshot && (priceChanged || refChanged)) {
    const engine = XMEngine.ingestSnapshot(xmData, { changedVenue: exchange });
    xmData.venues = engine.venues || xmData.venues;
    xmPropagation = engine.propagation;
    xmUpdateLastPropagation(xmPropagation);
    xmHandleEngineOutput(engine);
  }

  xmRenderTable();
  xmRenderHeatmap();
  xmRenderMeta();
  xmRenderPropagation();
  window.XMCharts?.renderAll?.(xmData, xmPropagationForDisplay());
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

function xmVenueFeedBadge(v) {
  const src = v.source || "sync";
  const ex = v.exchange;
  const tickAt = xmLastTickAt.get(ex);
  const pollAt = xmLastPollAt.get(ex);
  const pollAgeSec = pollAt ? Math.round((Date.now() - pollAt) / 1000) : null;
  const wsCapable = Boolean(XM_WS_PAIRS[ex]);

  if (src === "pending") {
    return { label: "WAIT", cls: "xm-feed-badge--sync", title: "Awaiting first quote" };
  }
  if (src === "anchor") {
    return { label: "ANCHOR", cls: "xm-feed-badge--anchor", title: "Dashboard Binance anchor" };
  }
  if (src === "ws") {
    if (window.XMWS?.isStale?.(tickAt)) {
      return { label: "STALE", cls: "xm-feed-badge--stale", title: "No WebSocket tick in 30s" };
    }
    return { label: "LIVE", cls: "xm-feed-badge--live", title: "Live WebSocket feed" };
  }
  if (src === "browser") {
    const stale = !pollAt || Date.now() - pollAt > XM_REST_STALE_MS;
    return {
      label: stale ? "REST·" : "REST",
      cls: stale ? "xm-feed-badge--stale" : "xm-feed-badge--rest",
      title: pollAgeSec != null ? `Browser REST · ${pollAgeSec}s ago` : "Browser REST poll",
    };
  }
  if (src === "live" || src === "exchanges") {
    if (wsCapable) {
      return { label: "API·", cls: "xm-feed-badge--stale", title: "Server API — WebSocket not connected" };
    }
    return { label: "API", cls: "xm-feed-badge--api", title: "Server API feed" };
  }
  if (wsCapable && window.XMWS?.isStale?.(tickAt)) {
    return { label: "POLL", cls: "xm-feed-badge--poll", title: "Waiting for WebSocket" };
  }
  return { label: "SYNC", cls: "xm-feed-badge--sync", title: `Feed: ${src}` };
}

function xmVenueBadges(v) {
  const badge = xmVenueFeedBadge(v);
  return `<span class="xm-feed-badge ${badge.cls}" title="${badge.title}">${badge.label}</span>`;
}

async function xmRefreshPollVenues() {
  if (!xmLiveOk || !xmData) return;
  const defs = XM_BROWSER_SOURCES.filter((d) => XM_REST_POLL_VENUES.includes(d.exchange));
  if (!defs.length) return;
  const fx = xmData.fx || xmFxCache;
  const results = await Promise.all(defs.map(xmBrowserFetchVenue));
  for (const row of results.filter(Boolean)) {
    const [applied] = xmApplyFxToVenues([row], fx);
    if (!applied) continue;
    xmPatchVenuePrice(applied.exchange, applied.price, { ccy: applied.ccy, source: "browser" });
  }
}

function xmSortVenuesAlpha(venues) {
  return [...(venues || [])].sort((a, b) => {
    const ex = String(a.exchange || "").localeCompare(String(b.exchange || ""), undefined, { sensitivity: "base" });
    if (ex !== 0) return ex;
    return String(a.pair || "").localeCompare(String(b.pair || ""), undefined, { sensitivity: "base" });
  });
}

function xmRenderTable() {
  const tbody = xmEl("xm-table-body");
  if (!tbody || !xmData) return;
  const ref = xmData.referenceUsd;
  const filtered = xmFilterVenues(xmData.venues);
  const rows = xmSortVenuesAlpha(filtered);
  if (!rows.length) {
    const label = xmActiveFilterLabel() || "matching";
    tbody.innerHTML = `<tr><td colspan="10">No ${label} venues in current feed.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((v) => {
    const usdPx = Number.isFinite(v.priceUsd) ? v.priceUsd : xmVenueNativeUsd(v, xmData.fx);
    const prem = usdPx && ref ? ((usdPx - ref) / ref * 100) : null;
    const zCls = Math.abs(v.z1m || 0) >= 2 ? "xm-z--hot" : "";
    const badges = xmVenueBadges(v);
    return `<tr>
      <td>${v.exchange}${badges}</td>
      <td class="mono">${v.pair || "—"}</td>
      <td class="mono">${xmFmtUsd(usdPx, 2)}</td>
      <td class="mono" title="Binance USDT anchor">${xmFmtUsd(ref, 2)}</td>
      <td class="mono">${xmFmtPct(prem)}</td>
      <td class="mono ${zCls}">${v.z1m != null ? v.z1m.toFixed(2) : "—"}</td>
      <td class="mono">${v.z5m != null ? v.z5m.toFixed(2) : "—"}</td>
      <td>${v.market || "spot"}</td>
      <td class="mono">${xmFmtBasis(v.basisPct)}</td>
      <td class="mono">${xmFmtFunding(v.fundingRate)}</td>
    </tr>`;
  }).join("");
}

function xmUpdateLastPropagation(p) {
  if (!p?.edges?.length) return;
  xmLastPropagation = { ...p, observedAt: Date.now() };
}

function xmPropagationForDisplay() {
  if (xmPropagation?.edges?.length) return xmPropagation;
  return xmLastPropagation;
}

function xmIsLivePropagation() {
  return Boolean(xmPropagation?.edges?.length);
}

function xmFormatPropAge(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

function xmRenderPropMeta() {
  const el = xmEl("xm-prop-meta");
  if (!el) return;
  el.classList.remove("xm-prop-meta--stale", "xm-prop-meta--live");
  if (xmIsLivePropagation()) {
    el.textContent = "● Active cluster";
    el.classList.add("xm-prop-meta--live");
    return;
  }
  if (xmLastPropagation?.edges?.length) {
    const age = Date.now() - (xmLastPropagation.observedAt || Date.now());
    el.textContent = `Last cluster · ${xmFormatPropAge(age)} ago`;
    el.classList.add("xm-prop-meta--stale");
    return;
  }
  el.textContent = "Timeline · delays measured from origin (t₀)";
}

function xmPropStat(label, value, extraCls = "") {
  return `<div class="xm-prop-stat ${extraCls}"><span class="xm-prop-stat-label">${label}</span><span class="xm-prop-stat-value mono">${value}</span></div>`;
}

function xmPropagationStats(p) {
  if (!p?.edges?.length) {
    return {
      origin: "—",
      events: "—",
      followers: "—",
      avgDelay: "—",
      spreadVelocity: "—",
      delayRange: "—",
    };
  }
  const delays = p.edges.map((e) => e.delaySec).filter((d) => d > 0);
  const minD = delays.length ? Math.min(...delays) : null;
  const maxD = delays.length ? Math.max(...delays) : null;
  return {
    origin: p.origin || "—",
    events: String(p.eventCount ?? p.edges.length + 1),
    followers: String(p.edges.length),
    avgDelay: p.avgDelaySec != null ? `${p.avgDelaySec}s` : "—",
    spreadVelocity: p.spreadVelocity != null ? `${p.spreadVelocity}s` : "—",
    delayRange: minD != null && maxD != null ? `${minD}–${maxD}s` : "—",
  };
}

function xmRenderPropagation() {
  const statsEl = xmEl("xm-prop-stats");
  const edgesEl = xmEl("xm-prop-edges");
  if (!statsEl && !edgesEl) return;
  const p = xmPropagationForDisplay();
  const stats = xmPropagationStats(p);

  xmRenderPropMeta();

  if (statsEl) {
    statsEl.innerHTML = `<div class="xm-prop-stats-grid">
      ${xmPropStat("Origin", stats.origin, "xm-prop-stat--origin")}
      ${xmPropStat("Events", stats.events)}
      ${xmPropStat("Followers", stats.followers)}
      ${xmPropStat("Avg delay", stats.avgDelay)}
      ${xmPropStat("Spread velocity", stats.spreadVelocity)}
      ${xmPropStat("Delay range", stats.delayRange)}
    </div>`;
  }

  if (edgesEl && p?.edges?.length) {
    const sorted = [...p.edges].sort((a, b) => a.delaySec - b.delaySec || String(a.to).localeCompare(b.to));
    edgesEl.innerHTML = sorted.map((e, i) => {
      const prev = i > 0 ? sorted[i - 1].delaySec : 0;
      const hop = Math.max(0, e.delaySec - prev);
      const hopNote = i === 0 ? "" : ` <span class="xm-prop-hop mono">(+${hop}s Δ)</span>`;
      return `<div class="xm-prop-edge" title="${e.delaySec}s after origin${i > 0 ? ` · +${hop}s since ${sorted[i - 1].to}` : ""}"><span class="xm-prop-rank mono">#${i + 1}</span><span class="xm-prop-from">${e.from}</span><span class="xm-prop-arrow">→</span><span class="xm-prop-to">${e.to}</span><span class="xm-prop-delay mono">+${e.delaySec}s</span>${hopNote}</div>`;
    }).join("");
  }

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
  const meta = xmEl("xm-news-meta");
  if (meta) {
    meta.textContent = matches.length
      ? `${matches.length} headline${matches.length === 1 ? "" : "s"} · updated ${new Date().toLocaleTimeString()}`
      : "No scored headlines yet";
  }
  if (!matches.length) {
    el.innerHTML = "<p class=\"xm-muted\">Loading BTC headlines from RSS feeds — refreshes on extreme alerts or when you open this tab.</p>";
    return;
  }
  el.innerHTML = matches.map((m) => `<a class="xm-news-item" href="${m.link || "#"}" target="_blank" rel="noopener"><span class="xm-news-conf mono">${Math.round((m.confidence || 0) * 100)}%</span><strong>${m.title}</strong><span class="xm-news-src">${m.source || ""}</span></a>`).join("");
}

function xmVenueAnomalyBreakdown(v) {
  const z = Math.max(Math.abs(v?.z1m || 0), Math.abs(v?.z5m || 0));
  const settings = window.XMEngine?.getSettings?.() || {};
  const premMove = settings.premMoveThreshold || xmSettings?.premMoveThreshold || 1.5;
  const prem = Math.abs(v?.premDelta60 || 0) / premMove;
  const cross = Math.abs(v?.devSigma || 0);
  const score = Number.isFinite(v?.anomalyScore) ? v.anomalyScore : Math.max(z, prem, cross);
  return {
    z: Math.round(z * 100) / 100,
    prem: Math.round(prem * 100) / 100,
    cross: Math.round(cross * 100) / 100,
    score: Math.round(score * 100) / 100,
  };
}

function xmHeatColor(z) {
  const heat = Math.min(1, Math.abs(z) / 4);
  const r = Math.round(245 * heat + 30 * (1 - heat));
  const g = Math.round(158 * heat + 40 * (1 - heat));
  const b = Math.round(11 * heat + 60 * (1 - heat));
  const alpha = 0.14 + heat * 0.62;
  const tier = heat >= 0.75 ? "extreme" : heat >= 0.5 ? "hot" : heat >= 0.25 ? "warm" : "calm";
  return {
    bg: `rgba(${r},${g},${b},${alpha})`,
    border: `rgba(${r},${g},${b},${0.25 + heat * 0.55})`,
    tier,
    heat,
  };
}

function xmFmtZ(v) {
  return v != null && Number.isFinite(v) ? v.toFixed(1) : "—";
}

function xmFmtSigma(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}σ`;
}

function xmFmtPremDelta(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function xmHeatDrivers(score, z, prem, cross) {
  if (score <= 0) return new Set();
  const eps = 0.005;
  const drivers = new Set();
  if (Math.abs(z - score) < eps) drivers.add("z");
  if (Math.abs(prem - score) < eps) drivers.add("prem");
  if (Math.abs(cross - score) < eps) drivers.add("cross");
  return drivers;
}

function xmHeatTipRow(label, value, sub) {
  const subCls = sub ? " xm-heat-tip-row--sub" : "";
  return `<div class="xm-heat-tip-row${subCls}"><span>${label}</span><span class="mono">${value}</span></div>`;
}

function xmHeatTipSection(title, rows, isDriver) {
  const driverCls = isDriver ? " xm-heat-tip-section--driver" : "";
  const badge = isDriver ? '<span class="xm-heat-tip-badge">max</span>' : "";
  return `<div class="xm-heat-tip-section${driverCls}">
    <div class="xm-heat-tip-section-title"><span>${title}</span>${badge}</div>
    ${rows}
  </div>`;
}

function xmBuildHeatTooltipHtml(v) {
  const { z, prem, cross, score } = xmVenueAnomalyBreakdown(v);
  const { tier } = xmHeatColor(score);
  const settings = window.XMEngine?.getSettings?.() || {};
  const premThresh = settings.premMoveThreshold || xmSettings?.premMoveThreshold || 1.5;
  const drivers = xmHeatDrivers(score, z, prem, cross);
  const scoreCls = tier !== "calm" ? ` xm-heat-tip-score-val--${tier}` : "";

  return `<div class="xm-heat-tip">
    <div class="xm-heat-tip-head">
      <span class="xm-heat-tip-venue">${v.exchange}</span>
      <span class="xm-heat-tip-tier xm-heat-tip-tier--${tier}">${tier}</span>
    </div>
    <div class="xm-heat-tip-score">
      <span class="xm-heat-tip-score-label">Anomaly score</span>
      <span class="xm-heat-tip-score-val mono${scoreCls}">${score > 0 ? score.toFixed(2) : "—"}</span>
    </div>
    <div class="xm-heat-tip-sections">
      ${xmHeatTipSection(
        "Return shock",
        xmHeatTipRow("z₁ₘ (1m)", xmFmtSigma(v.z1m))
          + xmHeatTipRow("z₅ₘ (5m)", xmFmtSigma(v.z5m))
          + xmHeatTipRow("Combined z", z.toFixed(2), true),
        drivers.has("z"),
      )}
      ${xmHeatTipSection(
        "Premium spike",
        xmHeatTipRow("Δ₆₀", xmFmtPremDelta(v.premDelta60))
          + xmHeatTipRow(`Score (÷${premThresh}%)`, prem.toFixed(2), true),
        drivers.has("prem"),
      )}
      ${xmHeatTipSection(
        "Cross divergence",
        xmHeatTipRow("vs VWAP peers", xmFmtSigma(v.devSigma))
          + xmHeatTipRow("Score", cross.toFixed(2), true),
        drivers.has("cross"),
      )}
    </div>
    <div class="xm-heat-tip-formula">score = max(z, premium, σ)</div>
  </div>`;
}

let xmHeatTooltipReady = false;
let xmHeatTooltipActiveCell = null;
let xmHeatTooltipPinnedExchange = null;
let xmHeatTooltipLastHtml = "";

function xmHeatTooltipEl() {
  return document.getElementById("xm-heat-tooltip");
}

function xmHideHeatTooltip() {
  const tooltip = xmHeatTooltipEl();
  if (tooltip) tooltip.hidden = true;
  xmHeatTooltipActiveCell = null;
  xmHeatTooltipPinnedExchange = null;
  xmHeatTooltipLastHtml = "";
}

function xmHeatTooltipVenue(exchange) {
  if (!exchange || !xmData) return null;
  return xmFilterVenues(xmData.venues).find((vn) => vn.exchange === exchange) || null;
}

function xmSetHeatTooltipContent(tooltip, html) {
  if (html === xmHeatTooltipLastHtml) return false;
  tooltip.innerHTML = html;
  xmHeatTooltipLastHtml = html;
  return true;
}

function xmUpdateHeatTooltipPosition(tooltip, trigger) {
  const rect = trigger.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const margin = 8;

  let top = rect.bottom + margin;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

  if (top + tipRect.height > window.innerHeight - margin) {
    top = rect.top - tipRect.height - margin;
  }

  tooltip.style.top = `${Math.max(margin, top)}px`;
  tooltip.style.left = `${left}px`;
}

function xmPositionHeatTooltip(tooltip, trigger, { reveal = false } = {}) {
  const needsMeasure = reveal || tooltip.hidden || tooltip.offsetWidth === 0;
  if (needsMeasure) {
    tooltip.hidden = false;
    tooltip.style.visibility = "hidden";
    tooltip.style.display = "block";
    xmUpdateHeatTooltipPosition(tooltip, trigger);
    tooltip.style.visibility = "visible";
    return;
  }
  xmUpdateHeatTooltipPosition(tooltip, trigger);
}

function xmShowHeatTooltip(cell, { reveal = false } = {}) {
  const tooltip = xmHeatTooltipEl();
  if (!tooltip || !cell) return;
  const exchange = cell.dataset.exchange;
  const venue = xmHeatTooltipVenue(exchange);
  if (!venue) return;

  const html = xmBuildHeatTooltipHtml(venue);
  const sameCell = xmHeatTooltipActiveCell === cell && xmHeatTooltipPinnedExchange === exchange;
  xmHeatTooltipActiveCell = cell;
  xmHeatTooltipPinnedExchange = exchange;
  xmSetHeatTooltipContent(tooltip, html);
  xmPositionHeatTooltip(tooltip, cell, { reveal: reveal || !sameCell || tooltip.hidden });
  tooltip.hidden = false;
}

function xmRefreshHeatTooltipAfterRender() {
  if (!xmHeatTooltipPinnedExchange) return;
  const tooltip = xmHeatTooltipEl();
  const grid = xmEl("xm-heatmap")?.querySelector(".xm-heatmap-grid");
  if (!tooltip || !grid) return;

  const cell = grid.querySelector(
    `.xm-heat-cell[data-exchange="${CSS.escape(xmHeatTooltipPinnedExchange)}"]`,
  );
  const venue = xmHeatTooltipVenue(xmHeatTooltipPinnedExchange);
  if (!cell || !venue) {
    xmHideHeatTooltip();
    return;
  }

  xmHeatTooltipActiveCell = cell;
  const html = xmBuildHeatTooltipHtml(venue);
  const contentChanged = xmSetHeatTooltipContent(tooltip, html);
  if (contentChanged) xmUpdateHeatTooltipPosition(tooltip, cell);
  tooltip.hidden = false;
}

function xmInitHeatTooltip() {
  if (xmHeatTooltipReady) return;
  const tooltip = xmHeatTooltipEl();
  const heatmap = xmEl("xm-heatmap");
  if (!tooltip || !heatmap) return;
  xmHeatTooltipReady = true;

  let hideTimer = null;

  heatmap.addEventListener("mouseover", (e) => {
    const cell = e.target.closest(".xm-heat-cell[data-exchange]");
    if (!cell) return;
    clearTimeout(hideTimer);
    const reveal = xmHeatTooltipPinnedExchange !== cell.dataset.exchange || tooltip.hidden;
    xmShowHeatTooltip(cell, { reveal });
  });

  heatmap.addEventListener("mouseleave", (e) => {
    const related = e.relatedTarget;
    if (related && (heatmap.contains(related) || tooltip.contains(related))) return;
    hideTimer = setTimeout(xmHideHeatTooltip, 100);
  });

  window.addEventListener("scroll", () => {
    if (xmHeatTooltipActiveCell && !tooltip.hidden) {
      xmUpdateHeatTooltipPosition(tooltip, xmHeatTooltipActiveCell);
    }
  }, true);
}

function xmEnsureHeatmapLegend(el) {
  let legend = el.querySelector(".xm-heatmap-legend");
  if (legend) return legend;
  legend = document.createElement("div");
  legend.className = "xm-heatmap-legend";
  legend.setAttribute("aria-hidden", "true");
  legend.innerHTML = `<span class="xm-heatmap-legend-label">Anomaly</span>
    <span class="xm-heat-legend-swatch xm-heat-cell--calm">calm</span>
    <span class="xm-heat-legend-swatch xm-heat-cell--warm">warm</span>
    <span class="xm-heat-legend-swatch xm-heat-cell--hot">hot</span>
    <span class="xm-heat-legend-swatch xm-heat-cell--extreme">extreme</span>`;
  el.appendChild(legend);
  return legend;
}

function xmUpdateHeatCell(cell, v) {
  const { z, prem, cross, score } = xmVenueAnomalyBreakdown(v);
  const { bg, border, tier } = xmHeatColor(score);
  cell.className = `xm-heat-cell xm-heat-cell--${tier}`;
  cell.style.background = bg;
  cell.style.borderColor = border;
  cell.querySelector(".xm-heat-name").textContent = v.exchange;
  cell.querySelector(".xm-heat-z").textContent = score > 0 ? score.toFixed(1) : "—";
  cell.querySelector(".xm-heat-sub").textContent = `z ${z.toFixed(1)} · prem ${prem.toFixed(1)} · σ ${cross.toFixed(1)}`;
}

function xmRenderHeatmap() {
  const el = xmEl("xm-heatmap");
  if (!el || !xmData) return;
  const venues = xmFilterVenues(xmData.venues)
    .slice()
    .sort((a, b) => xmVenueAnomalyBreakdown(b).score - xmVenueAnomalyBreakdown(a).score
      || String(a.exchange).localeCompare(b.exchange));

  xmEnsureHeatmapLegend(el);
  let grid = el.querySelector(".xm-heatmap-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.className = "xm-heatmap-grid";
    el.insertBefore(grid, el.firstChild);
  }

  if (!venues.length) {
    grid.innerHTML = '<p class="xm-muted">No venues match filters.</p>';
    xmHideHeatTooltip();
    return;
  }

  const empty = grid.querySelector(".xm-muted");
  if (empty) empty.remove();

  const seen = new Set();
  venues.forEach((v, idx) => {
    let cell = grid.querySelector(`.xm-heat-cell[data-exchange="${CSS.escape(v.exchange)}"]`);
    if (!cell) {
      cell = document.createElement("div");
      cell.className = "xm-heat-cell";
      cell.dataset.exchange = v.exchange;
      cell.innerHTML = '<span class="xm-heat-name"></span><span class="xm-heat-z mono"></span><span class="xm-heat-sub mono"></span>';
    }
    xmUpdateHeatCell(cell, v);
    const ref = grid.children[idx];
    if (ref !== cell) grid.insertBefore(cell, ref || null);
    seen.add(v.exchange);
  });

  grid.querySelectorAll(".xm-heat-cell[data-exchange]").forEach((cell) => {
    if (!seen.has(cell.dataset.exchange)) cell.remove();
  });

  xmRefreshHeatTooltipAfterRender();
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
  xmRenderTable();
  xmRenderHeatmap();
  xmRenderPropagation();
  xmRenderAlerts();
  xmRenderNews();
  xmRenderStatus();
  window.XMCharts?.renderAll?.(xmData, xmPropagationForDisplay());
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
  xmEl("xm-news-refresh")?.addEventListener("click", () => xmLoadNews("market", true));
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

function xmStartRestPoll() {
  if (xmRestPollTimer) return;
  xmRefreshPollVenues();
  xmRestPollTimer = setInterval(xmRefreshPollVenues, XM_REST_POLL_MS);
}

function xmStopRestPoll() {
  if (xmRestPollTimer) clearInterval(xmRestPollTimer);
  xmRestPollTimer = null;
}

function initCrossMarket() {
  if (!xmSettings) xmSettings = xmLoadSettings();
  if (!xmReady) {
    xmReady = true;
    XMEngine.setSettings(xmSettings);
    xmBindEvents();
    xmInitHeatTooltip();
    window.XMCharts?.bindWindowControls?.();
    window.XMCharts?.ensureChartShells?.();
    xmStartPoll();
    const root = document.querySelector(
      '#dashboard-misc .menu-screen[data-l2="cross-market"][data-l3="monitor"]',
    );
    xmDecorateHelp(root);
    window.initMetricHelp?.();
  }
  if (!xmData) {
    xmData = { venues: xmCanonicalVenues(), fx: xmFxCache, referenceUsd: null };
    xmRenderTable();
    xmRenderMeta();
  }
  xmLoad();
}

window.initCrossMarket = initCrossMarket;

function initCrossMarketNews() {
  initCrossMarket();
  const root = document.querySelector(
    '#dashboard-misc .menu-screen[data-l2="cross-market"][data-l3="news-attribution"]',
  );
  xmDecorateHelp(root);
  xmLoadNews("market", true);
}

window.initCrossMarketNews = initCrossMarketNews;

function xmBootstrap() {
  const l1 = localStorage.getItem("btc-menu-l1") || window.MenuController?.l1;
  const l2 = localStorage.getItem("btc-menu-l2") || window.MenuController?.l2;
  const l3 = localStorage.getItem("btc-menu-l3") || window.MenuController?.l3;
  if (l1 !== "misc" || l2 !== "cross-market") return;
  if (l3 === "news-attribution") initCrossMarketNews();
  else initCrossMarket();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", xmBootstrap);
} else {
  xmBootstrap();
}
window.addEventListener("load", xmBootstrap);