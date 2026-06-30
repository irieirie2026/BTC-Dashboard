/** Misc — Whale Proxies (Mempool.space free API) */

const MW_POLL_MS = 180_000;
const MW_API = "/api/misc/whales";
const MW_MEMPOOL = "https://mempool.space/api";
const MW_LARGE_BTC = 100;
const MW_LARGE_SATS = MW_LARGE_BTC * 1e8;
const MW_DAY_SEC = 86_400;
const MW_HOUR_SEC = 3_600;

const MW_EXCHANGE_ADDRESSES = [
  { label: "Binance Cold", exchange: "Binance", address: "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo" },
  { label: "Binance Cold 2", exchange: "Binance", address: "3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6" },
  { label: "Robinhood Cold", exchange: "Robinhood", address: "bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2" },
  { label: "Bitfinex Cold", exchange: "Bitfinex", address: "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97" },
  { label: "Binance BTCB", exchange: "Binance", address: "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb" },
  { label: "OKX", exchange: "OKX", address: "3MgEAFWu1HKSnZ5ZsC8qf61ZW18xrP5pgd" },
  { label: "Crypto.com Cold", exchange: "Crypto.com", address: "bc1qr4dl5wa7kl8yu792dceg9z5knl2gkn220lk7a9" },
  { label: "Binance Pool", exchange: "Binance", address: "bc1qx9t2l3pyny2spqpqlye8svce70nppwtaxwdrp4" },
];

const MW_RICH_SNAPSHOT = {
  gt100btc: { count: 17981, source: "BitInfoCharts snapshot" },
  gt1000btc: { count: 1947, source: "BitInfoCharts snapshot" },
};

let mwReady = false;
let mwPollTimer = null;
let mwData = null;
let mwLoading = false;

function mwEl(id) {
  return document.getElementById(id);
}

function mwFmtBtc(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function mwFmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "—";
  }
}

function mwShortAddr(addr) {
  if (!addr || addr.length < 16) return addr || "—";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function mwSparklineSvg(points, width = 140, height = 36, color = "#e879f9") {
  if (!points?.length) return "";
  const max = Math.max(...points, 1);
  const coords = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * width;
    const y = height - (p / max) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg class="mm-spark mw-spark" width="${width}" height="${height}" aria-hidden="true" viewBox="0 0 ${width} ${height}"><polyline fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" points="${coords.join(" ")}"/></svg>`;
}

async function mwFetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function mwBalanceBtc(chainStats) {
  const funded = chainStats?.funded_txo_sum || 0;
  const spent = chainStats?.spent_txo_sum || 0;
  return (funded - spent) / 1e8;
}

function mwTxOutputBtc(tx) {
  return (tx.vout || []).reduce((s, v) => s + (v.value || 0), 0) / 1e8;
}

function mwAddressFlows(txs, address, cutoff) {
  let inflow = 0;
  let outflow = 0;
  let txCount24h = 0;
  for (const tx of txs || []) {
    const t = tx.status?.block_time;
    if (!t || t < cutoff) continue;
    txCount24h += 1;
    for (const vout of tx.vout || []) {
      if (vout.scriptpubkey_address === address) inflow += (vout.value || 0) / 1e8;
    }
    for (const vin of tx.vin || []) {
      if (vin.is_coinbase) continue;
      const po = vin.prevout;
      if (po?.scriptpubkey_address === address) outflow += (po.value || 0) / 1e8;
    }
  }
  return { inflowBtc: inflow, outflowBtc: outflow, txCount24h };
}

function mwScanLargeTxs(txs, source, blockTime) {
  const found = [];
  for (const tx of txs || []) {
    const valueBtc = mwTxOutputBtc(tx);
    if (valueBtc < MW_LARGE_BTC) continue;
    found.push({
      txid: tx.txid,
      valueBtc,
      source,
      time: blockTime || tx.status?.block_time || Math.floor(Date.now() / 1000),
    });
  }
  return found;
}

async function mwBuildClientPayload() {
  const errors = [];
  const updatedAt = new Date().toISOString();
  const now = Math.floor(Date.now() / 1000);
  const cutoff24h = now - MW_DAY_SEC;
  const cutoff1h = now - MW_HOUR_SEC;

  const safe = async (label, fn) => {
    try {
      return await fn();
    } catch (err) {
      errors.push(`${label}: ${err.message || err}`);
      return null;
    }
  };

  const exchanges = await Promise.all(
    MW_EXCHANGE_ADDRESSES.map(async (entry) => {
      const row = { ...entry, balanceBtc: null, inflow24hBtc: null, outflow24hBtc: null, txCount24h: null, updatedAt };
      try {
        const summary = await mwFetchJson(`${MW_MEMPOOL}/address/${entry.address}`);
        row.balanceBtc = mwBalanceBtc(summary.chain_stats);
        const txs = await mwFetchJson(`${MW_MEMPOOL}/address/${entry.address}/txs/chain`);
        const flows = mwAddressFlows(txs, entry.address, cutoff24h);
        row.inflow24hBtc = flows.inflowBtc;
        row.outflow24hBtc = flows.outflowBtc;
        row.txCount24h = flows.txCount24h;
      } catch (err) {
        errors.push(`${entry.label}: ${err.message || err}`);
      }
      return row;
    }),
  );

  let largeTxs = [];
  const recent = await safe("mempool recent", () => mwFetchJson(`${MW_MEMPOOL}/mempool/recent`));
  if (Array.isArray(recent)) {
    for (const item of recent) {
      const valueBtc = (item.value || 0) / 1e8;
      if (valueBtc >= MW_LARGE_BTC) {
        largeTxs.push({ txid: item.txid, valueBtc, source: "mempool", time: now });
      }
    }
  }

  const blocks = await safe("blocks", () => mwFetchJson(`${MW_MEMPOOL}/blocks`));
  if (Array.isArray(blocks)) {
    const blockPages = await Promise.all(
      blocks.slice(0, 10).map((block) =>
        safe(`block ${block.height}`, () => mwFetchJson(`${MW_MEMPOOL}/block/${block.id}/txs/0`)).then((page) => ({
          page,
          blockTime: block.timestamp,
        })),
      ),
    );
    for (const { page, blockTime } of blockPages) {
      if (Array.isArray(page)) largeTxs = largeTxs.concat(mwScanLargeTxs(page, "block", blockTime));
    }
  }

  const seen = new Set();
  const uniqueLarge = [];
  for (const tx of largeTxs.sort((a, b) => (b.time || 0) - (a.time || 0))) {
    if (!tx.txid || seen.has(tx.txid)) continue;
    seen.add(tx.txid);
    uniqueLarge.push(tx);
  }

  const count1h = uniqueLarge.filter((t) => (t.time || 0) >= cutoff1h).length;
  const count24h = uniqueLarge.filter((t) => (t.time || 0) >= cutoff24h).length;
  const vol1h = uniqueLarge.filter((t) => (t.time || 0) >= cutoff1h).reduce((s, t) => s + t.valueBtc, 0);
  const vol24h = uniqueLarge.filter((t) => (t.time || 0) >= cutoff24h).reduce((s, t) => s + t.valueBtc, 0);

  const hourly = Array(24).fill(0);
  for (const tx of uniqueLarge) {
    if ((tx.time || 0) < cutoff24h) continue;
    const ageH = Math.min(23, Math.max(0, Math.floor((now - tx.time) / MW_HOUR_SEC)));
    hourly[23 - ageH] += 1;
  }
  hourly.reverse();

  let dormantScore = null;
  let dormantLabel = "Normal";
  if (count24h > 0) {
    dormantScore = Math.round(Math.min(100, (count1h / Math.max(count24h / 24, 0.05)) * 25) * 10) / 10;
    if (dormantScore >= 70) dormantLabel = "Spike — large-value burst";
    else if (dormantScore >= 40) dormantLabel = "Elevated activity";
    if (count1h >= 2 && uniqueLarge.length >= 3) dormantLabel = "Possible old-coin movement (proxy)";
  }

  const trackedGt100 = exchanges.filter((e) => (e.balanceBtc || 0) >= 100).length;
  const trackedGt1000 = exchanges.filter((e) => (e.balanceBtc || 0) >= 1000).length;
  const trackedBalance = exchanges.reduce((s, e) => s + (e.balanceBtc || 0), 0);

  return {
    updatedAt,
    source: errors.length ? "client+partial" : "client",
    errors,
    fromCache: false,
    exchanges,
    largeTx: {
      thresholdBtc: MW_LARGE_BTC,
      count1h,
      count24h,
      volume1hBtc: Math.round(vol1h * 100) / 100,
      volume24hBtc: Math.round(vol24h * 100) / 100,
      sparkline: hourly,
      recent: uniqueLarge.slice(0, 12),
    },
    dormant: {
      score: dormantScore,
      label: dormantLabel,
      description:
        "CDD-style proxy: spikes in ≥100 BTC movements vs 24h baseline. Full coin-age labeling needs paid analytics.",
    },
    richAddresses: {
      gt100btc: { ...MW_RICH_SNAPSHOT.gt100btc, trackedProxy: trackedGt100 },
      gt1000btc: { ...MW_RICH_SNAPSHOT.gt1000btc, trackedProxy: trackedGt1000 },
      trackedBalanceBtc: Math.round(trackedBalance * 100) / 100,
      note: "Global counts are public snapshots; tracked row counts labeled exchange wallets in this panel.",
    },
    heroes: [
      { name: "Large txs (1h)", value: String(count1h), sub: `${Math.round(vol1h).toLocaleString()} BTC moved` },
      { name: "Large txs (24h)", value: String(count24h), sub: `${Math.round(vol24h).toLocaleString()} BTC moved` },
      { name: "Dormant proxy", value: dormantScore != null ? String(dormantScore) : "—", sub: dormantLabel },
      { name: "Tracked balance", value: `${Math.round(trackedBalance).toLocaleString()} BTC`, sub: `${MW_EXCHANGE_ADDRESSES.length} exchange wallets` },
    ],
    about: [
      "Whale proxies use Mempool.space free APIs — no keys. Exchange labels are best-effort public hot/cold examples.",
      "Large-tx scan samples mempool recent + first page of txs from the last 10 blocks (not exhaustive).",
      "Full entity attribution, precise CDD, and live rich-list counts require paid Glassnode/Chainalysis-class data.",
    ],
  };
}

function mwRenderHeroes(data) {
  const strip = mwEl("mw-heroes");
  if (!strip) return;
  strip.innerHTML = (data.heroes || [])
    .map(
      (h) => `
    <article class="deriv-hero-block mw-hero-block">
      <span class="deriv-hero-label">${h.name}</span>
      <span class="deriv-hero-value">${h.value}</span>
      <span class="deriv-hero-sub">${h.sub || ""}</span>
    </article>`,
    )
    .join("");
}

function mwRenderExchangeTable(data) {
  const el = mwEl("mw-exchange-table");
  if (!el) return;
  const rows = data.exchanges || [];
  if (!rows.length) {
    el.innerHTML = '<p class="mm-empty">No exchange address data.</p>';
    return;
  }
  el.innerHTML = `
    <table class="deriv-table mw-table" aria-label="Exchange address tracking">
      <thead><tr>
        <th data-help-key="mw-exchange-label">Wallet</th>
        <th data-help-key="mw-exchange-venue">Venue</th>
        <th class="mono" data-help-key="mw-exchange-balance">Balance</th>
        <th class="mono" data-help-key="mw-exchange-inflow">24h In</th>
        <th class="mono" data-help-key="mw-exchange-outflow">24h Out</th>
        <th class="mono" data-help-key="mw-exchange-txs">24h Txs</th>
        <th>Address</th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${r.label}</td>
            <td><span class="mw-venue-tag">${r.exchange}</span></td>
            <td class="mono">${r.balanceBtc != null ? mwFmtBtc(r.balanceBtc, 1) : "—"}</td>
            <td class="mono positive">${r.inflow24hBtc != null ? mwFmtBtc(r.inflow24hBtc, 3) : "—"}</td>
            <td class="mono negative">${r.outflow24hBtc != null ? mwFmtBtc(r.outflow24hBtc, 3) : "—"}</td>
            <td class="mono">${r.txCount24h ?? "—"}</td>
            <td class="mono"><a class="mw-addr-link" href="https://mempool.space/address/${r.address}" target="_blank" rel="noopener noreferrer">${mwShortAddr(r.address)}</a></td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function mwRenderLargeTx(data) {
  const el = mwEl("mw-large-tx-body");
  if (!el) return;
  const lt = data.largeTx || {};
  const spark = mwSparklineSvg(lt.sparkline || []);
  const recent = (lt.recent || [])
    .map(
      (t) => `
      <li class="mw-large-tx-item">
        <span class="mw-large-tx-val">${mwFmtBtc(t.valueBtc, 0)} BTC</span>
        <span class="mw-large-tx-src">${t.source}</span>
        <a class="mw-addr-link mono" href="https://mempool.space/tx/${t.txid}" target="_blank" rel="noopener noreferrer">${t.txid?.slice(0, 12)}…</a>
      </li>`,
    )
    .join("");
  el.innerHTML = `
    <div class="mw-large-tx-kpis">
      <div class="mm-card mw-mini-card">
        <h4 class="mm-card__title" data-help-key="mw-large-1h">Last 1 hour</h4>
        <p class="mm-card__value">${lt.count1h ?? "—"}</p>
        <p class="mm-card__sub">${lt.volume1hBtc != null ? `${mwFmtBtc(lt.volume1hBtc, 0)} BTC` : "—"} volume</p>
      </div>
      <div class="mm-card mw-mini-card">
        <h4 class="mm-card__title" data-help-key="mw-large-24h">Last 24 hours</h4>
        <p class="mm-card__value">${lt.count24h ?? "—"}</p>
        <p class="mm-card__sub">${lt.volume24hBtc != null ? `${mwFmtBtc(lt.volume24hBtc, 0)} BTC` : "—"} volume</p>
      </div>
      <div class="mm-card mw-mini-card mw-mini-card--spark">
        <h4 class="mm-card__title" data-help-key="mw-large-spark">24h activity</h4>
        <div class="mw-large-spark">${spark || '<span class="mm-card__sub">No large txs in sample</span>'}</div>
        <p class="mm-card__sub">≥ ${lt.thresholdBtc || MW_LARGE_BTC} BTC threshold</p>
      </div>
    </div>
    <ul class="mw-large-tx-list" aria-label="Recent large transactions">${recent || '<li class="mm-empty">No large transactions in sample window.</li>'}</ul>`;
}

function mwRenderProxyCards(data) {
  const el = mwEl("mw-proxy-cards");
  if (!el) return;
  const d = data.dormant || {};
  const r = data.richAddresses || {};
  el.innerHTML = `
    <article class="mm-card mw-proxy-card">
      <h3 class="mm-card__title" data-help-key="mw-dormant">Dormant Movement Proxy</h3>
      <p class="mm-card__value">${d.score != null ? d.score : "—"}</p>
      <p class="mm-card__sub">${d.label || "—"}</p>
      <p class="mm-card__desc">${d.description || ""}</p>
    </article>
    <article class="mm-card mw-proxy-card">
      <h3 class="mm-card__title" data-help-key="mw-rich-100">Addresses &gt;100 BTC</h3>
      <p class="mm-card__value">${r.gt100btc?.count?.toLocaleString() ?? "—"}</p>
      <p class="mm-card__sub">Tracked proxies: ${r.gt100btc?.trackedProxy ?? "—"} · ${r.gt100btc?.source || ""}</p>
      <p class="mm-card__desc">Global rich-list snapshot; live network-wide counts need paid labeling APIs.</p>
    </article>
    <article class="mm-card mw-proxy-card">
      <h3 class="mm-card__title" data-help-key="mw-rich-1k">Addresses &gt;1,000 BTC</h3>
      <p class="mm-card__value">${r.gt1000btc?.count?.toLocaleString() ?? "—"}</p>
      <p class="mm-card__sub">Tracked proxies: ${r.gt1000btc?.trackedProxy ?? "—"} · ${r.gt1000btc?.source || ""}</p>
      <p class="mm-card__desc">Sum of tracked exchange wallets: ${r.trackedBalanceBtc != null ? `${mwFmtBtc(r.trackedBalanceBtc, 0)} BTC` : "—"}.</p>
    </article>`;
}

function mwRenderAbout(data) {
  const el = mwEl("mw-about-body");
  if (!el) return;
  const lines = data.about || [];
  el.innerHTML = lines.length
    ? `<ul class="mm-about-list">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
    : "<p>—</p>";
}

function mwRenderMeta(data) {
  const meta = mwEl("mw-meta");
  if (!meta) return;
  const parts = [];
  if (data?.updatedAt) parts.push(`Updated ${mwFmtTime(data.updatedAt)}`);
  if (data?.fromCache) parts.push("cached");
  if (data?.source?.includes("partial")) parts.push("partial");
  if (data?.source?.startsWith("client")) parts.push("client fetch");
  meta.textContent = parts.join(" · ") || "—";
}

function mwSetError(msg) {
  const err = mwEl("mw-error");
  if (!err) return;
  if (msg) {
    err.hidden = false;
    err.textContent = msg;
  } else {
    err.hidden = true;
    err.textContent = "";
  }
}

function mwApplyPayload(data) {
  mwData = data;
  mwRenderHeroes(data);
  mwRenderExchangeTable(data);
  mwRenderLargeTx(data);
  mwRenderProxyCards(data);
  mwRenderAbout(data);
  mwRenderMeta(data);
  if (data.errors?.length) {
    mwSetError(`Some sources failed: ${data.errors.slice(0, 2).join("; ")}`);
  } else {
    mwSetError(null);
  }
}

async function mwFetchWhales(refresh = false) {
  if (mwLoading) return mwData;
  mwLoading = true;
  mwSetError(null);
  const loading = mwEl("mw-loading");
  if (loading && !mwData) loading.hidden = false;

  try {
    const url = refresh ? `${MW_API}?refresh=1` : MW_API;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) {
      const json = await mwBuildClientPayload();
      mwApplyPayload(json);
      return json;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(json.error);
    mwApplyPayload(json);
    return json;
  } catch (err) {
    try {
      const json = await mwBuildClientPayload();
      mwApplyPayload(json);
      return json;
    } catch (clientErr) {
      mwSetError(`Failed to load whale proxies — ${err.message || "try again"}`);
      throw clientErr;
    }
  } finally {
    mwLoading = false;
    if (loading) loading.hidden = true;
  }
}

function mwStartPoll() {
  if (mwPollTimer) clearInterval(mwPollTimer);
  mwPollTimer = setInterval(() => mwFetchWhales(false).catch(() => {}), MW_POLL_MS);
}

function mwBindControls() {
  const btn = document.querySelector(".mw-refresh-btn");
  if (!btn || btn.dataset.mwBound) return;
  btn.dataset.mwBound = "1";
  btn.addEventListener("click", () => mwFetchWhales(true).catch(() => {}));
}

function initMiscWhales() {
  if (!mwReady) {
    mwReady = true;
    mwBindControls();
    mwStartPoll();
  }
  return mwFetchWhales(false).then(() => {
    window.decorateHelpLabels?.(
      document.querySelector("#dashboard-misc .mm-whales-panel"),
    );
  });
}

window.initMiscWhales = initMiscWhales;
window.MW_EXCHANGE_ADDRESSES = MW_EXCHANGE_ADDRESSES;