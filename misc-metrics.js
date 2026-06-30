/** Misc Metrics — free public APIs via /api/misc/metrics */

const MM_POLL_MS = 300_000;
const MM_API = "/api/misc/metrics";

const MM_HELP_KEYS = {
  "btc-dominance": "mm-btc-dominance",
  "fear-greed": "mm-fear-greed",
  "mayer-multiple": "mm-mayer-multiple",
  "puell-multiple": "mm-puell-multiple",
  "nvt-ratio": "mm-nvt-ratio",
  hashprice: "mm-hashprice",
  "mempool-pressure": "mm-mempool-pressure",
  "dom-fg-composite": "mm-dom-fg-composite",
};

let mmReady = false;
let mmPollTimer = null;
let mmData = null;
let mmLoading = false;
let mmError = null;

function mmEl(id) {
  return document.getElementById(id);
}

function mmFmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function mmSparklineSvg(points, width = 120, height = 36, color) {
  if (!points?.length) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 0.01;
  const coords = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * width;
    const y = height - ((p - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trend =
    color ||
    (points[points.length - 1] >= points[0] ? "#0ecb81" : "#f6465d");
  return `<svg class="mm-spark" width="${width}" height="${height}" aria-hidden="true" viewBox="0 0 ${width} ${height}"><polyline fill="none" stroke="${trend}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(" ")}"/></svg>`;
}

function mmFmtSubChange(pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${Number(pct).toFixed(2)}%`;
}

function mmRenderHeroes(data) {
  const strip = mmEl("mm-heroes");
  if (!strip) return;
  const heroes = data?.heroes || [];
  strip.innerHTML = heroes
    .map(
      (h) => `
      <article class="deriv-hero-block mm-hero-block">
        <span class="deriv-hero-label">${h.name}</span>
        <span class="deriv-hero-value"${h.color ? ` style="color:${h.color}"` : ""}>${h.value}</span>
        <span class="deriv-hero-sub">${h.sub || ""}</span>
      </article>`,
    )
    .join("");
}

function mmMetricCard(m) {
  const helpKey = MM_HELP_KEYS[m.id] || "";
  const titleAttr = helpKey ? ` data-help-key="${helpKey}"` : "";
  const valueStyle = m.color ? ` style="color:${m.color}"` : "";
  const spark = m.sparkline?.length ? mmSparklineSvg(m.sparkline, 120, 36, m.color) : "";
  let subHtml = "";
  if (typeof m.sub === "number") {
    const pct = mmFmtSubChange(m.sub);
    subHtml = `<p class="mm-card__sub"><span class="mm-card__change${m.sub >= 0 ? " positive" : " negative"}">${pct}</span>${m.subLabel ? ` <span class="mm-card__sub-label">${m.subLabel}</span>` : ""}</p>`;
  } else if (m.sub != null && m.sub !== "") {
    subHtml = `<p class="mm-card__sub">${m.sub}${m.subLabel ? ` <span class="mm-card__sub-label">${m.subLabel}</span>` : ""}</p>`;
  }

  return `
  <article class="mm-card" data-mm-id="${m.id}">
    <div class="mm-card__head">
      <h3 class="mm-card__title"${titleAttr}>${m.title}</h3>
      ${spark ? `<div class="mm-card__spark">${spark}</div>` : ""}
    </div>
    <p class="mm-card__value"${valueStyle}>${m.value}</p>
    ${subHtml}
    <p class="mm-card__desc">${m.description || ""}</p>
    <footer class="mm-card__foot">
      <span class="mm-card__source">${m.source || ""}</span>
      <time class="mm-card__time" datetime="${m.updatedAt || ""}">${mmFmtTime(m.updatedAt)}</time>
    </footer>
  </article>`;
}

function mmRenderGrid(data) {
  const grid = mmEl("mm-grid");
  if (!grid) return;
  const metrics = data?.metrics || [];
  if (!metrics.length) {
    grid.innerHTML = '<p class="mm-empty">No metrics available.</p>';
    return;
  }
  grid.innerHTML = metrics.map(mmMetricCard).join("");
}

function mmRenderAbout(data) {
  const body = mmEl("mm-about-body");
  if (!body) return;
  const lines = data?.about || [];
  if (!lines.length) {
    body.innerHTML = "<p>Context notes unavailable.</p>";
    return;
  }
  body.innerHTML = `<ul class="mm-about-list">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
}

function mmRenderMeta(data) {
  const meta = mmEl("mm-meta");
  if (!meta) return;
  const parts = [];
  if (data?.updatedAt) parts.push(`Updated ${mmFmtTime(data.updatedAt)}`);
  if (data?.fromCache) parts.push("cached");
  if (data?.source === "live+partial" || data?.source === "client+partial") parts.push("partial data");
  if (data?.source === "client" || data?.source === "client+partial") parts.push("client fetch");
  meta.textContent = parts.join(" · ") || "—";
}

function mmSetLoading(on) {
  const loading = mmEl("mm-loading");
  const grid = mmEl("mm-grid");
  if (loading) loading.hidden = !on;
  if (grid && on) grid.innerHTML = "";
}

function mmSetError(msg) {
  const err = mmEl("mm-error");
  if (!err) return;
  if (msg) {
    err.hidden = false;
    err.textContent = msg;
  } else {
    err.hidden = true;
    err.textContent = "";
  }
}

const MM_BLOCK_SUBSIDY = 3.125;
const MM_BLOCKS_PER_DAY = 144;
const MM_DAILY_ISSUANCE = MM_BLOCK_SUBSIDY * MM_BLOCKS_PER_DAY;
const MM_AVG_BLOCK_VBYTES = 1_500_000;

async function mmFetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

/** Blockchain.info charts block browser CORS on localhost — proxy via server when available. */
async function mmFetchBlockchainChart(name, timespan = "1year") {
  const proxyUrl = `/api/onchain/chart?name=${encodeURIComponent(name)}&timespan=${encodeURIComponent(timespan)}`;
  const directUrl = `https://api.blockchain.info/charts/${name}?timespan=${timespan}&format=json`;
  try {
    return await mmFetchJson(proxyUrl);
  } catch (_) {
    return await mmFetchJson(directUrl);
  }
}

function mmFngZone(value) {
  const zones = [
    [24, "Extreme Fear", "#ea3943"],
    [44, "Fear", "#ea8c00"],
    [54, "Neutral", "#f3d42f"],
    [74, "Greed", "#93d900"],
    [100, "Extreme Greed", "#16c784"],
  ];
  for (const [cap, label, color] of zones) {
    if (value <= cap) return { label, color };
  }
  return { label: "Extreme Greed", color: "#16c784" };
}

function mmPctChange(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function mmSparkTail(values, maxPts = 30) {
  if (!values?.length) return [];
  return values.slice(-maxPts).map((v) => Math.round(v * 10000) / 10000);
}

function mmAlignMcaps(btcChart, ethChart) {
  const btcM = Object.fromEntries(
    (btcChart.market_caps || []).filter((p) => p?.length >= 2).map((p) => [p[0], p[1]]),
  );
  const ethM = Object.fromEntries(
    (ethChart.market_caps || []).filter((p) => p?.length >= 2).map((p) => [p[0], p[1]]),
  );
  return Object.keys(btcM)
    .filter((k) => ethM[k] > 0)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => [Number(k), btcM[k], ethM[k]]);
}

async function mmBuildClientPayload() {
  const errors = [];
  const updatedAt = new Date().toISOString();
  const safe = async (label, fn) => {
    try {
      return await fn();
    } catch (err) {
      errors.push(`${label}: ${err.message || err}`);
      return null;
    }
  };

  const [globalRaw, btcCoin, marketChart, ethChart, fngRaw, txChart, volChart, mempoolRaw, feesRec, hashrate3d] =
    await Promise.all([
      safe("coingecko global", () => mmFetchJson("https://api.coingecko.com/api/v3/global")),
      safe("coingecko bitcoin", () => mmFetchJson("https://api.coingecko.com/api/v3/coins/bitcoin")),
      safe("coingecko market_chart", () =>
        mmFetchJson(
          "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily",
        ),
      ),
      safe("coingecko eth chart", () =>
        mmFetchJson(
          "https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=30&interval=daily",
        ),
      ),
      safe("fear-greed", () => mmFetchJson("https://api.alternative.me/fng/?limit=10")),
      safe("blockchain tx", () => mmFetchBlockchainChart("n-transactions", "1year")),
      safe("blockchain vol", () => mmFetchBlockchainChart("estimated-transaction-volume", "1year")),
      safe("mempool", () => mmFetchJson("https://mempool.space/api/mempool")),
      safe("fees", () => mmFetchJson("https://mempool.space/api/v1/fees/recommended")),
      safe("hashrate", () => mmFetchJson("https://mempool.space/api/v1/mining/hashrate/3d")),
    ]);

  const domPct = globalRaw?.data?.market_cap_percentage?.btc ?? null;
  const price = btcCoin?.market_data?.current_price?.usd ?? null;
  const mcap = btcCoin?.market_data?.market_cap?.usd ?? null;
  const prices = (marketChart?.prices || []).map((p) => p[1]).filter((v) => v != null);

  let domSpark = [];
  const aligned = marketChart && ethChart ? mmAlignMcaps(marketChart, ethChart) : [];
  if (domPct && aligned.length) {
    const ratios = aligned.map(([, b, e]) => (b / (b + e)) * 100);
    const scale = domPct / Math.max(...ratios, 0.01);
    domSpark = ratios.slice(-30).map((r) => Math.round(r * scale * 100) / 100);
  } else if (domPct != null) {
    domSpark = [Math.round(domPct * 100) / 100];
  }

  let mayer = null;
  const mayerSeries = [];
  if (prices.length >= 200) {
    for (let i = 199; i < prices.length; i++) {
      const s = prices.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200;
      if (s > 0) mayerSeries.push(Math.round((prices[i] / s) * 1000) / 1000);
    }
    const sma200 = prices.slice(-200).reduce((a, b) => a + b, 0) / 200;
    if (price && sma200) mayer = price / sma200;
  }

  let puell = null;
  const puellSeries = [];
  if (prices.length) {
    const dailyRev = prices.map((p) => p * MM_DAILY_ISSUANCE);
    for (let i = 364; i < dailyRev.length; i++) {
      const ma = dailyRev.slice(i - 364, i + 1).reduce((a, b) => a + b, 0) / 365;
      if (ma > 0) puellSeries.push(Math.round((dailyRev[i] / ma) * 1000) / 1000);
    }
    if (dailyRev.length >= 365) {
      const ma365 = dailyRev.slice(-365).reduce((a, b) => a + b, 0) / 365;
      if (ma365 > 0) puell = dailyRev[dailyRev.length - 1] / ma365;
    }
  }

  let fngLatest = null;
  let fngSpark = [];
  let fngColor = "#94a3b8";
  let fngLabel = "—";
  if (fngRaw?.data?.length) {
    const pts = fngRaw.data
      .map((row) => ({ value: Number(row.value), ts: Number(row.timestamp) }))
      .filter((p) => !Number.isNaN(p.value))
      .sort((a, b) => a.ts - b.ts);
    if (pts.length) {
      fngLatest = pts[pts.length - 1].value;
      const zone = mmFngZone(fngLatest);
      fngColor = zone.color;
      fngLabel = zone.label;
      fngSpark = pts.slice(-7).map((p) => p.value);
    }
  }

  let nvt = null;
  const nvtSpark = [];
  if (mcap && txChart?.values?.length && volChart?.values?.length) {
    const txByDate = Object.fromEntries(
      txChart.values.map((v) => [
        new Date(v.x * 1000).toISOString().slice(0, 10),
        v.y,
      ]),
    );
    const volByDate = Object.fromEntries(
      volChart.values.map((v) => [
        new Date(v.x * 1000).toISOString().slice(0, 10),
        v.y,
      ]),
    );
    const common = Object.keys(txByDate)
      .filter((d) => volByDate[d])
      .sort()
      .slice(-90);
    for (const d of common) {
      const txN = txByDate[d];
      const volUsd = volByDate[d];
      if (txN > 0 && volUsd > 0) nvtSpark.push(Math.round((mcap / volUsd) * 100) / 100);
    }
    if (common.length) {
      const d = common[common.length - 1];
      const volUsd = volByDate[d];
      if (volUsd > 0) nvt = mcap / volUsd;
    }
  }

  const vsize = mempoolRaw?.vsize ?? null;
  const hrList = hashrate3d?.hashrates || [];
  const hashrateHs = hrList.length ? hrList[hrList.length - 1].avgHashrate : null;
  const hashrateEh = hashrateHs ? hashrateHs / 1e18 : null;
  const feeSatVb = feesRec?.fastestFee ?? feesRec?.halfHourFee ?? null;
  const feeBtcPerBlock = ((feeSatVb || 0) * MM_AVG_BLOCK_VBYTES) / 1e8;
  const dailyRevBtc = MM_DAILY_ISSUANCE + feeBtcPerBlock * MM_BLOCKS_PER_DAY;
  const hashprice = price && hashrateEh ? (dailyRevBtc * price) / hashrateEh : null;

  let mempoolPressure = null;
  if (vsize != null) {
    const blockRatio = Math.min(vsize / MM_AVG_BLOCK_VBYTES, 5) / 5;
    const feeNorm = Math.min((feeSatVb || 0) / 100, 1);
    mempoolPressure = Math.round(blockRatio * 50 + feeNorm * 50);
  }

  const domFgComposite =
    domPct != null && fngLatest != null ? Math.round(domPct * (fngLatest / 50) * 100) / 100 : null;

  return {
    updatedAt,
    source: errors.length ? "client+partial" : "client",
    errors,
    fromCache: false,
    heroes: [
      { name: "BTC Price", value: price ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—", sub: "CoinGecko" },
      { name: "Dominance", value: domPct != null ? `${domPct.toFixed(1)}%` : "—", sub: "Market share" },
      { name: "Fear & Greed", value: fngLatest != null ? String(fngLatest) : "—", sub: fngLabel },
      { name: "Mayer Multiple", value: mayer != null ? mayer.toFixed(2) : "—", sub: "Price / 200d SMA" },
    ],
    metrics: [
      {
        id: "btc-dominance",
        title: "Bitcoin Dominance",
        value: domPct != null ? `${domPct.toFixed(1)}%` : "—",
        sub: mmPctChange(domSpark.at(-1), domSpark[0]),
        subLabel: "30d change (BTC+ETH proxy)",
        sparkline: domSpark,
        description:
          "BTC share of total crypto market cap (CoinGecko). Sparkline uses BTC/ETH mcap ratio scaled to current dominance.",
        source: "CoinGecko /global",
        updatedAt,
      },
      {
        id: "fear-greed",
        title: "Fear & Greed Index",
        value: fngLatest != null ? String(fngLatest) : "—",
        sub: fngLabel,
        subLabel: "Zone",
        color: fngColor,
        sparkline: fngSpark,
        description: "Alternative.me composite sentiment (0–100). Higher = greedier market mood.",
        source: "Alternative.me",
        updatedAt,
      },
      {
        id: "mayer-multiple",
        title: "Mayer Multiple",
        value: mayer != null ? mayer.toFixed(2) : "—",
        sub: "< 1 historically cheap · > 2.4 overheated",
        sparkline: mmSparkTail(mayerSeries, 90),
        description: "Spot price divided by 200-day simple moving average (CoinGecko daily prices).",
        source: "CoinGecko market_chart",
        updatedAt,
      },
      {
        id: "puell-multiple",
        title: "Puell Multiple",
        value: puell != null ? puell.toFixed(2) : "—",
        sub: `Issuance ${MM_DAILY_ISSUANCE.toFixed(0)} BTC/day`,
        sparkline: mmSparkTail(puellSeries, 90),
        description:
          "Daily miner issuance revenue vs its 365-day average. Issuance = 3.125 × 144 blocks/day.",
        source: "CoinGecko + issuance model",
        updatedAt,
      },
      {
        id: "nvt-ratio",
        title: "NVT Ratio (approx)",
        value: nvt != null ? nvt.toFixed(1) : "—",
        sub: "Mcap / daily on-chain transfer volume",
        sparkline: mmSparkTail(nvtSpark, 60),
        description: "Market cap divided by Blockchain.info estimated daily USD transaction volume.",
        source: "CoinGecko + Blockchain.info",
        updatedAt,
      },
      {
        id: "hashprice",
        title: "Hashprice",
        value: hashprice != null ? `$${hashprice.toLocaleString("en-US", { maximumFractionDigits: 0 })}/EH/day` : "—",
        sub: hashrateEh != null ? `HR ${hashrateEh.toFixed(1)} EH/s` : null,
        sparkline: [],
        description: "Estimated daily miner revenue (subsidy + fees) per exahash of hashrate.",
        source: "Mempool.space + CoinGecko",
        updatedAt,
      },
      {
        id: "mempool-pressure",
        title: "Mempool Pressure Score",
        value: mempoolPressure != null ? String(mempoolPressure) : "—",
        sub: `${((vsize || 0) / 1e6).toFixed(2)}M vbytes · ${feeSatVb || 0} sat/vB fast`,
        sparkline: [],
        description:
          "Composite 0–100 score from mempool vsize vs typical block size and recommended fee pressure.",
        source: "Mempool.space",
        updatedAt,
      },
      {
        id: "dom-fg-composite",
        title: "Dominance × F&G Composite",
        value: domFgComposite != null ? domFgComposite.toFixed(1) : "—",
        sub: domPct != null && fngLatest != null ? `Dom ${domPct.toFixed(1)}% × F&G ${fngLatest}` : null,
        sparkline: [],
        description:
          "BTC dominance weighted by Fear & Greed (÷50). Higher = strong BTC share in a greedy tape.",
        source: "Derived",
        updatedAt,
      },
    ],
    about: [
      "Misc metrics use only free public APIs — no keys required.",
      "Derived ratios (Mayer, Puell, NVT, hashprice, mempool pressure) are approximations for dashboard context, not trading signals.",
      "Dominance trend uses a BTC+ETH mcap proxy when historical global dominance is unavailable on the free tier.",
    ],
  };
}

function mmApplyPayload(json) {
  mmData = json;
  mmRenderHeroes(json);
  mmRenderGrid(json);
  mmRenderAbout(json);
  mmRenderMeta(json);
  if (json.errors?.length) {
    mmSetError(`Some sources failed: ${json.errors.slice(0, 2).join("; ")}`);
  } else {
    mmSetError(null);
  }
}

async function mmFetchMetrics(refresh = false) {
  if (mmLoading) return mmData;
  mmLoading = true;
  mmSetError(null);
  if (!mmData) mmSetLoading(true);

  try {
    const url = refresh ? `${MM_API}?refresh=1` : MM_API;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) {
      const json = await mmBuildClientPayload();
      mmApplyPayload(json);
      return json;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(json.error);
    mmApplyPayload(json);
    return json;
  } catch (err) {
    try {
      const json = await mmBuildClientPayload();
      mmApplyPayload(json);
      return json;
    } catch (clientErr) {
      mmError = clientErr;
      mmSetError(`Failed to load metrics — ${err.message || "try again"}`);
      if (!mmData) {
        const heroes = mmEl("mm-heroes");
        const grid = mmEl("mm-grid");
        if (heroes) heroes.innerHTML = "";
        if (grid) grid.innerHTML = '<p class="mm-empty">Unable to load metrics.</p>';
      }
      throw clientErr;
    }
  } finally {
    mmLoading = false;
    mmSetLoading(false);
  }
}

function mmStartPoll() {
  if (mmPollTimer) clearInterval(mmPollTimer);
  mmPollTimer = setInterval(() => mmFetchMetrics(false).catch(() => {}), MM_POLL_MS);
}

function mmBindControls() {
  const btn = document.querySelector(".mm-refresh-btn");
  if (!btn || btn.dataset.mmBound) return;
  btn.dataset.mmBound = "1";
  btn.addEventListener("click", () => {
    mmFetchMetrics(true).catch(() => {});
  });
}

function initMiscMetrics() {
  if (!mmReady) {
    mmReady = true;
    mmBindControls();
    mmStartPoll();
  }
  mmFetchMetrics(false)
    .then(() => {
      window.decorateHelpLabels?.(
        document.querySelector('#dashboard-misc .menu-screen[data-l2="metrics"]'),
      );
    })
    .catch(() => {});
}

window.initMiscMetrics = initMiscMetrics;