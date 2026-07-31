/** Misc — Whale / large-transfer tracker (Mempool.space free API) */

const MW_POLL_MS = 120_000;
const MW_API = "/api/misc/whales";
const MW_MEMPOOL = "https://mempool.space/api";
const MW_NOTABLE_BTC = 10;
const MW_WHALE_BTC = 100;
const MW_DAY_SEC = 86_400;
const MW_HOUR_SEC = 3_600;

const MW_EXCHANGE_ADDRESSES = [
  { label: "Binance Cold", exchange: "Binance", address: "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo" },
  { label: "Binance Cold 2", exchange: "Binance", address: "3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6" },
  { label: "Binance BTCB", exchange: "Binance", address: "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb" },
  { label: "Binance Pool", exchange: "Binance", address: "bc1qx9t2l3pyny2spqpqlye8svce70nppwtaxwdrp4" },
  { label: "Robinhood Cold", exchange: "Robinhood", address: "bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2" },
  { label: "Bitfinex Cold", exchange: "Bitfinex", address: "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97" },
  { label: "OKX", exchange: "OKX", address: "3MgEAFWu1HKSnZ5ZsC8qf61ZW18xrP5pgd" },
  { label: "Crypto.com Cold", exchange: "Crypto.com", address: "bc1qr4dl5wa7kl8yu792dceg9z5knl2gkn220lk7a9" },
  { label: "Bitfinex Cold 2", exchange: "Bitfinex", address: "3JZq4atUahhuA9rLhXLMhhTo133J9rF97j" },
];

const MW_LABEL_MAP = Object.fromEntries(
  MW_EXCHANGE_ADDRESSES.map((e) => [e.address, { label: e.label, exchange: e.exchange }]),
);

const MW_RICH_SNAPSHOT = {
  gt100btc: { count: 17981, source: "BitInfoCharts snapshot" },
  gt1000btc: { count: 1947, source: "BitInfoCharts snapshot" },
};

let mwReady = false;
let mwPollTimer = null;
let mwData = null;
let mwLoading = false;
let mwFilter = "all"; // all | unknown | identified | mempool | whale | to_ex | from_ex

function mwEl(id) {
  return document.getElementById(id);
}

function mwEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mwFmtBtc(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function mwFmtUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const v = Number(n);
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function mwFmtTime(isoOrSec) {
  if (isoOrSec == null) return "—";
  try {
    const d =
      typeof isoOrSec === "number"
        ? new Date(isoOrSec * 1000)
        : new Date(isoOrSec);
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

function mwRelTime(sec) {
  if (sec == null) return "—";
  const age = Math.max(0, Math.floor(Date.now() / 1000 - sec));
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / 86400)}d ago`;
}

function mwShortAddr(addr) {
  if (!addr || addr.length < 16) return addr || "—";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function mwSizeTier(v) {
  if (v >= 1000) return "leviathan";
  if (v >= 500) return "mega";
  if (v >= MW_WHALE_BTC) return "whale";
  if (v >= 50) return "large";
  if (v >= MW_NOTABLE_BTC) return "notable";
  return "small";
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

function mwLookup(addr) {
  return addr ? MW_LABEL_MAP[addr] || null : null;
}

function mwAddrMeta(addr) {
  const hit = mwLookup(addr);
  if (hit) return { address: addr, label: hit.label, exchange: hit.exchange, known: true };
  return { address: addr || null, label: null, exchange: null, known: false };
}

function mwEnrichTx(tx, source, blockTime, blockHeight) {
  const vouts = tx.vout || [];
  const vins = tx.vin || [];
  const outSum = vouts.reduce((s, v) => s + (v.value || 0), 0);
  const valueBtc = outSum / 1e8;
  if (valueBtc < MW_NOTABLE_BTC) return null;

  const outs = vouts
    .filter((v) => v.scriptpubkey_address)
    .map((v) => ({
      address: v.scriptpubkey_address,
      valueBtc: (v.value || 0) / 1e8,
    }))
    .sort((a, b) => b.valueBtc - a.valueBtc);
  const ins = vins
    .filter((v) => !v.is_coinbase && v.prevout?.scriptpubkey_address)
    .map((v) => ({
      address: v.prevout.scriptpubkey_address,
      valueBtc: (v.prevout.value || 0) / 1e8,
    }))
    .sort((a, b) => b.valueBtc - a.valueBtc);

  const fromAddr = ins[0]?.address || null;
  const toAddr = outs[0]?.address || null;
  const knownIn = ins.some((i) => mwLookup(i.address));
  const knownOut = outs.some((o) => mwLookup(o.address));
  let direction = "unknown";
  let directionLabel = "Unidentified (P2P / unlabeled)";
  if (knownIn && knownOut) {
    direction = "exchange_internal";
    directionLabel = "Exchange → exchange";
  } else if (knownIn) {
    direction = "from_exchange";
    directionLabel = "Exchange → unknown";
  } else if (knownOut) {
    direction = "to_exchange";
    directionLabel = "Unknown → exchange";
  } else if (vins.some((v) => v.is_coinbase)) {
    direction = "coinbase";
    directionLabel = "Coinbase / miner";
  }

  const status = tx.status || {};
  return {
    txid: tx.txid || "",
    valueBtc: Math.round(valueBtc * 10000) / 10000,
    feeSat: tx.fee,
    feeBtc: tx.fee != null ? tx.fee / 1e8 : null,
    source,
    confirmed: !!status.confirmed,
    time: blockTime || status.block_time || Math.floor(Date.now() / 1000),
    blockHeight: blockHeight || status.block_height,
    tier: mwSizeTier(valueBtc),
    direction,
    directionLabel,
    identified: !!(knownIn || knownOut),
    from: mwAddrMeta(fromAddr),
    to: mwAddrMeta(toAddr),
    inputCount: ins.length,
    outputCount: outs.length,
  };
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

  let btcUsd = null;
  const prices = await safe("prices", () => mwFetchJson(`${MW_MEMPOOL}/v1/prices`));
  if (prices?.USD != null) btcUsd = Number(prices.USD);

  const exchanges = await Promise.all(
    MW_EXCHANGE_ADDRESSES.map(async (entry) => {
      const row = {
        ...entry,
        balanceBtc: null,
        inflow24hBtc: null,
        outflow24hBtc: null,
        net24hBtc: null,
        txCount24h: null,
        updatedAt,
      };
      try {
        const summary = await mwFetchJson(`${MW_MEMPOOL}/address/${entry.address}`);
        row.balanceBtc = mwBalanceBtc(summary.chain_stats);
        const txs = await mwFetchJson(`${MW_MEMPOOL}/address/${entry.address}/txs/chain`);
        const flows = mwAddressFlows(txs, entry.address, cutoff24h);
        row.inflow24hBtc = flows.inflowBtc;
        row.outflow24hBtc = flows.outflowBtc;
        row.net24hBtc = flows.inflowBtc - flows.outflowBtc;
        row.txCount24h = flows.txCount24h;
      } catch (err) {
        errors.push(`${entry.label}: ${err.message || err}`);
      }
      return row;
    }),
  );

  let feed = [];
  const recent = await safe("mempool recent", () => mwFetchJson(`${MW_MEMPOOL}/mempool/recent`));
  if (Array.isArray(recent)) {
    const ids = recent
      .filter((x) => (x.value || 0) / 1e8 >= MW_NOTABLE_BTC && x.txid)
      .map((x) => x.txid)
      .slice(0, 30);
    for (const tid of ids) {
      const tx = await safe(`tx ${tid.slice(0, 8)}`, () => mwFetchJson(`${MW_MEMPOOL}/tx/${tid}`));
      if (tx) {
        const row = mwEnrichTx(tx, "mempool", now, null);
        if (row) {
          row.time = now;
          feed.push(row);
        }
      }
    }
  }

  const blocks = await safe("blocks", () => mwFetchJson(`${MW_MEMPOOL}/blocks`));
  if (Array.isArray(blocks)) {
    for (const block of blocks.slice(0, 12)) {
      for (const page of [0, 25]) {
        const txs = await safe(`block ${block.height}/${page}`, () =>
          mwFetchJson(`${MW_MEMPOOL}/block/${block.id}/txs/${page}`),
        );
        if (!Array.isArray(txs)) break;
        for (const tx of txs) {
          const row = mwEnrichTx(tx, "block", block.timestamp, block.height);
          if (row) feed.push(row);
        }
        if (txs.length < 25) break;
      }
    }
  }

  const seen = new Set();
  const unique = [];
  for (const tx of feed.sort((a, b) => (b.time || 0) - (a.time || 0) || (b.valueBtc || 0) - (a.valueBtc || 0))) {
    if (!tx.txid || seen.has(tx.txid)) continue;
    seen.add(tx.txid);
    if (btcUsd) tx.valueUsd = Math.round(tx.valueBtc * btcUsd);
    unique.push(tx);
  }

  const r24 = unique.filter((t) => (t.time || 0) >= cutoff24h);
  const r1h = unique.filter((t) => (t.time || 0) >= cutoff1h);
  const whale24 = r24.filter((t) => (t.valueBtc || 0) >= MW_WHALE_BTC);
  const unk24 = r24.filter((t) => !t.identified);
  const vol1h = r1h.reduce((s, t) => s + t.valueBtc, 0);
  const vol24h = r24.reduce((s, t) => s + t.valueBtc, 0);
  const unkVol = unk24.reduce((s, t) => s + t.valueBtc, 0);

  const hourly = Array(24).fill(0);
  for (const tx of r24) {
    const ageH = Math.min(23, Math.max(0, Math.floor((now - tx.time) / MW_HOUR_SEC)));
    hourly[23 - ageH] += 1;
  }
  hourly.reverse();

  const netIn = exchanges.reduce((s, e) => s + (e.inflow24hBtc || 0), 0);
  const netOut = exchanges.reduce((s, e) => s + (e.outflow24hBtc || 0), 0);
  const trackedBalance = exchanges.reduce((s, e) => s + (e.balanceBtc || 0), 0);

  return {
    updatedAt,
    source: errors.length ? "client+partial" : "client",
    errors,
    fromCache: false,
    btcUsd,
    thresholds: { notableBtc: MW_NOTABLE_BTC, whaleBtc: MW_WHALE_BTC },
    exchanges,
    exchangeNet: {
      inflow24hBtc: netIn,
      outflow24hBtc: netOut,
      net24hBtc: netIn - netOut,
    },
    largeTx: {
      thresholdBtc: MW_NOTABLE_BTC,
      whaleThresholdBtc: MW_WHALE_BTC,
      count1h: r1h.length,
      count24h: r24.length,
      volume1hBtc: Math.round(vol1h * 100) / 100,
      volume24hBtc: Math.round(vol24h * 100) / 100,
      whaleCount24h: whale24.length,
      whaleVolume24hBtc: Math.round(whale24.reduce((s, t) => s + t.valueBtc, 0) * 100) / 100,
      unknownCount24h: unk24.length,
      unknownVolume24hBtc: Math.round(unkVol * 100) / 100,
      toExchangeCount24h: r24.filter((t) => t.direction === "to_exchange").length,
      fromExchangeCount24h: r24.filter((t) => t.direction === "from_exchange").length,
      sparkline: hourly,
      buckets: {
        notable: r24.filter((t) => t.tier === "notable").length,
        large: r24.filter((t) => t.tier === "large").length,
        whale: r24.filter((t) => t.tier === "whale").length,
        mega: r24.filter((t) => t.tier === "mega").length,
        leviathan: r24.filter((t) => t.tier === "leviathan").length,
      },
      recent: unique.slice(0, 48),
      top: unique.reduce((best, t) => (!best || (t.valueBtc || 0) > (best.valueBtc || 0) ? t : best), null),
    },
    dormant: {
      score:
        r24.length > 0
          ? Math.round(Math.min(100, (r1h.length / Math.max(r24.length / 24, 0.05)) * 25) * 10) / 10
          : null,
      label: "Activity proxy",
      description: "1h vs 24h rate of ≥10 BTC transfers in the sample window.",
    },
    richAddresses: {
      gt100btc: { ...MW_RICH_SNAPSHOT.gt100btc, trackedProxy: exchanges.filter((e) => (e.balanceBtc || 0) >= 100).length },
      gt1000btc: { ...MW_RICH_SNAPSHOT.gt1000btc, trackedProxy: exchanges.filter((e) => (e.balanceBtc || 0) >= 1000).length },
      trackedBalanceBtc: Math.round(trackedBalance * 100) / 100,
    },
    heroes: [
      { name: "Transfers (1h)", value: String(r1h.length), sub: `${Math.round(vol1h).toLocaleString()} BTC · ≥${MW_NOTABLE_BTC}` },
      { name: "Transfers (24h)", value: String(r24.length), sub: `${Math.round(vol24h).toLocaleString()} BTC sample vol` },
      { name: "Unidentified (24h)", value: String(unk24.length), sub: `${Math.round(unkVol).toLocaleString()} BTC · no label` },
      { name: "Tracked net flow", value: `${(netIn - netOut >= 0 ? "+" : "")}${Math.round(netIn - netOut).toLocaleString()} BTC`, sub: `In ${Math.round(netIn)} · Out ${Math.round(netOut)}` },
    ],
    about: [
      `Scans mempool + recent blocks for ≥${MW_NOTABLE_BTC} BTC transfers — sample-based, not exhaustive.`,
      "Unidentified transfers still appear: no match to this panel’s public exchange labels.",
      "Direction tags use labeled wallets only.",
    ],
  };
}

function mwPartyHtml(party) {
  if (!party?.address && !party?.label) {
    return `<span class="mw-party mw-party--unknown">Unknown</span>`;
  }
  if (party.known) {
    return `<span class="mw-party mw-party--known" title="${mwEscape(party.address || "")}">
      <span class="mw-venue-tag">${mwEscape(party.exchange || party.label)}</span>
      <span class="mw-party-sub">${mwEscape(party.label || "")}</span>
    </span>`;
  }
  const href = party.address ? `https://mempool.space/address/${party.address}` : "#";
  return `<a class="mw-party mw-party--unknown mono mw-addr-link" href="${href}" target="_blank" rel="noopener noreferrer" title="${mwEscape(party.address || "")}">${mwEscape(mwShortAddr(party.address))}</a>`;
}

function mwTierBadge(tier) {
  const t = tier || "notable";
  return `<span class="mw-tier mw-tier--${mwEscape(t)}">${mwEscape(t)}</span>`;
}

function mwDirBadge(direction, label) {
  const map = {
    to_exchange: "mw-dir--in",
    from_exchange: "mw-dir--out",
    exchange_internal: "mw-dir--int",
    unknown: "mw-dir--unk",
    coinbase: "mw-dir--cb",
  };
  const cls = map[direction] || "mw-dir--unk";
  return `<span class="mw-dir ${cls}" title="${mwEscape(label || direction)}">${mwEscape(label || direction || "—")}</span>`;
}

function mwRenderHeroes(data) {
  const strip = mwEl("mw-heroes");
  if (!strip) return;
  strip.innerHTML = (data.heroes || [])
    .map(
      (h) => `
    <article class="deriv-hero-block mw-hero-block">
      <span class="deriv-hero-label">${mwEscape(h.name)}</span>
      <span class="deriv-hero-value">${mwEscape(h.value)}</span>
      <span class="deriv-hero-sub">${mwEscape(h.sub || "")}</span>
    </article>`,
    )
    .join("");
}

function mwRenderExchangeTable(data) {
  const el = mwEl("mw-exchange-table");
  if (!el) return;
  const rows = (data.exchanges || []).slice().sort((a, b) => (b.balanceBtc || 0) - (a.balanceBtc || 0));
  if (!rows.length) {
    el.innerHTML = '<p class="mm-empty">No exchange address data.</p>';
    return;
  }
  const net = data.exchangeNet || {};
  el.innerHTML = `
    <div class="mw-ex-summary">
      <span data-help-key="mw-ex-net">Tracked 24h net</span>
      <strong class="mono ${(net.net24hBtc || 0) >= 0 ? "positive" : "negative"}">${net.net24hBtc != null ? `${net.net24hBtc >= 0 ? "+" : ""}${mwFmtBtc(net.net24hBtc, 1)} BTC` : "—"}</strong>
      <span class="mw-ex-summary-sub mono">In ${mwFmtBtc(net.inflow24hBtc, 1)} · Out ${mwFmtBtc(net.outflow24hBtc, 1)}</span>
    </div>
    <table class="deriv-table mw-table" aria-label="Exchange address tracking">
      <thead><tr>
        <th data-help-key="mw-exchange-label">Wallet</th>
        <th data-help-key="mw-exchange-venue">Venue</th>
        <th class="mono" data-help-key="mw-exchange-balance">Balance</th>
        <th class="mono" data-help-key="mw-exchange-inflow">24h In</th>
        <th class="mono" data-help-key="mw-exchange-outflow">24h Out</th>
        <th class="mono" data-help-key="mw-ex-net-row">Net</th>
        <th class="mono" data-help-key="mw-exchange-txs">24h Txs</th>
        <th>Address</th>
      </tr></thead>
      <tbody>
        ${rows
          .map((r) => {
            const netR = r.net24hBtc != null ? r.net24hBtc : (r.inflow24hBtc || 0) - (r.outflow24hBtc || 0);
            return `
          <tr>
            <td>${mwEscape(r.label)}</td>
            <td><span class="mw-venue-tag">${mwEscape(r.exchange)}</span></td>
            <td class="mono">${r.balanceBtc != null ? mwFmtBtc(r.balanceBtc, 1) : "—"}</td>
            <td class="mono positive">${r.inflow24hBtc != null ? mwFmtBtc(r.inflow24hBtc, 3) : "—"}</td>
            <td class="mono negative">${r.outflow24hBtc != null ? mwFmtBtc(r.outflow24hBtc, 3) : "—"}</td>
            <td class="mono ${netR >= 0 ? "positive" : "negative"}">${Number.isFinite(netR) ? `${netR >= 0 ? "+" : ""}${mwFmtBtc(netR, 3)}` : "—"}</td>
            <td class="mono">${r.txCount24h ?? "—"}</td>
            <td class="mono"><a class="mw-addr-link" href="https://mempool.space/address/${mwEscape(r.address)}" target="_blank" rel="noopener noreferrer">${mwEscape(mwShortAddr(r.address))}</a></td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function mwFilterFeed(list) {
  return (list || []).filter((t) => {
    if (mwFilter === "all") return true;
    if (mwFilter === "unknown") return !t.identified;
    if (mwFilter === "identified") return !!t.identified;
    if (mwFilter === "mempool") return t.source === "mempool" || t.confirmed === false;
    if (mwFilter === "whale") return (t.valueBtc || 0) >= MW_WHALE_BTC || t.tier === "whale" || t.tier === "mega" || t.tier === "leviathan";
    if (mwFilter === "to_ex") return t.direction === "to_exchange";
    if (mwFilter === "from_ex") return t.direction === "from_exchange";
    return true;
  });
}

function mwRenderFeed(data) {
  const el = mwEl("mw-feed-body");
  if (!el) return;
  const lt = data.largeTx || {};
  const thr = data.thresholds || {};
  const notable = thr.notableBtc ?? lt.thresholdBtc ?? MW_NOTABLE_BTC;
  const all = lt.recent || [];
  const filtered = mwFilterFeed(all);
  const btcUsd = data.btcUsd;

  const buckets = lt.buckets || {};
  const bucketHtml = ["notable", "large", "whale", "mega", "leviathan"]
    .map((k) => {
      const n = buckets[k] ?? 0;
      return `<span class="mw-bucket mw-tier--${k}" title="24h sample count">${k} <strong>${n}</strong></span>`;
    })
    .join("");

  const filters = [
    { id: "all", label: "All" },
    { id: "unknown", label: "Unidentified" },
    { id: "identified", label: "Labeled" },
    { id: "mempool", label: "Mempool" },
    { id: "whale", label: "≥100 BTC" },
    { id: "to_ex", label: "→ Exchange" },
    { id: "from_ex", label: "Exchange →" },
  ];

  const top = lt.top;
  const topHtml = top
    ? `<div class="mw-top-tx" data-help-key="mw-top-tx">
        <span class="mw-top-tx-lab">Largest in sample</span>
        <span class="mw-top-tx-val mono">${mwFmtBtc(top.valueBtc, 1)} BTC</span>
        ${top.valueUsd ? `<span class="mw-top-tx-usd mono">${mwFmtUsd(top.valueUsd)}</span>` : ""}
        ${mwTierBadge(top.tier)}
        ${mwDirBadge(top.direction, top.directionLabel)}
        <a class="mw-addr-link mono" href="https://mempool.space/tx/${mwEscape(top.txid)}" target="_blank" rel="noopener noreferrer">${mwEscape((top.txid || "").slice(0, 14))}…</a>
      </div>`
    : "";

  const rows = filtered
    .map((t) => {
      const usd =
        t.valueUsd != null
          ? t.valueUsd
          : btcUsd != null
            ? Math.round(t.valueBtc * btcUsd)
            : null;
      const conf = t.confirmed === false || t.source === "mempool" ? "mempool" : "confirmed";
      return `
      <article class="mw-feed-item mw-feed-item--${mwEscape(t.tier || "notable")}" data-txid="${mwEscape(t.txid)}">
        <div class="mw-feed-main">
          <div class="mw-feed-amount">
            <span class="mw-feed-btc mono">${mwFmtBtc(t.valueBtc, t.valueBtc >= 100 ? 1 : 2)} <small>BTC</small></span>
            ${usd != null ? `<span class="mw-feed-usd mono">${mwFmtUsd(usd)}</span>` : ""}
            ${mwTierBadge(t.tier)}
          </div>
          <div class="mw-feed-path">
            ${mwPartyHtml(t.from)}
            <span class="mw-feed-arrow" aria-hidden="true">→</span>
            ${mwPartyHtml(t.to)}
          </div>
          <div class="mw-feed-meta">
            ${mwDirBadge(t.direction, t.directionLabel)}
            <span class="mw-feed-src mw-feed-src--${conf}">${conf === "mempool" ? "unconfirmed" : "confirmed"}</span>
            <span class="mw-feed-time" title="${mwEscape(mwFmtTime(t.time))}">${mwEscape(mwRelTime(t.time))}</span>
            ${t.blockHeight != null ? `<span class="mw-feed-block mono">#${t.blockHeight}</span>` : ""}
            <a class="mw-addr-link mono" href="https://mempool.space/tx/${mwEscape(t.txid)}" target="_blank" rel="noopener noreferrer">tx ${mwEscape((t.txid || "").slice(0, 10))}…</a>
          </div>
        </div>
      </article>`;
    })
    .join("");

  el.innerHTML = `
    <div class="mw-feed-kpis">
      <div class="mm-card mw-mini-card">
        <h4 class="mm-card__title" data-help-key="mw-large-1h">Last 1 hour</h4>
        <p class="mm-card__value">${lt.count1h ?? "—"}</p>
        <p class="mm-card__sub">${lt.volume1hBtc != null ? `${mwFmtBtc(lt.volume1hBtc, 0)} BTC` : "—"} · ≥${notable} BTC</p>
      </div>
      <div class="mm-card mw-mini-card">
        <h4 class="mm-card__title" data-help-key="mw-large-24h">Last 24 hours</h4>
        <p class="mm-card__value">${lt.count24h ?? "—"}</p>
        <p class="mm-card__sub">${lt.volume24hBtc != null ? `${mwFmtBtc(lt.volume24hBtc, 0)} BTC` : "—"} sample vol</p>
      </div>
      <div class="mm-card mw-mini-card">
        <h4 class="mm-card__title" data-help-key="mw-unknown">Unidentified</h4>
        <p class="mm-card__value">${lt.unknownCount24h ?? "—"}</p>
        <p class="mm-card__sub">${lt.unknownVolume24hBtc != null ? `${mwFmtBtc(lt.unknownVolume24hBtc, 0)} BTC` : "—"} no label</p>
      </div>
      <div class="mm-card mw-mini-card mw-mini-card--spark">
        <h4 class="mm-card__title" data-help-key="mw-large-spark">24h activity</h4>
        <div class="mw-large-spark">${mwSparklineSvg(lt.sparkline || []) || '<span class="mm-card__sub">No transfers in sample</span>'}</div>
        <p class="mm-card__sub">Hourly count in sample</p>
      </div>
    </div>
    <div class="mw-buckets" data-help-key="mw-buckets">${bucketHtml}</div>
    ${topHtml}
    <div class="mw-feed-filters" role="tablist" aria-label="Filter transfers">
      ${filters
        .map(
          (f) =>
            `<button type="button" class="mw-filter-btn${mwFilter === f.id ? " active" : ""}" data-mw-filter="${f.id}">${mwEscape(f.label)}</button>`,
        )
        .join("")}
    </div>
    <p class="mw-feed-count mono">${filtered.length} shown · ${all.length} in sample · ≥${notable} BTC (identified + unidentified)</p>
    <div class="mw-feed-list" aria-label="Large transfer feed">
      ${rows || '<p class="mm-empty">No transfers match this filter in the current sample window.</p>'}
    </div>`;

  el.querySelectorAll("[data-mw-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mwFilter = btn.getAttribute("data-mw-filter") || "all";
      mwRenderFeed(mwData || data);
      window.decorateHelpLabels?.(
        document.querySelector('#dashboard-misc .menu-screen[data-l2="whale-proxies"]'),
      );
    });
  });
}

function mwRenderProxyCards(data) {
  const el = mwEl("mw-proxy-cards");
  if (!el) return;
  const d = data.dormant || {};
  const r = data.richAddresses || {};
  const lt = data.largeTx || {};
  el.innerHTML = `
    <article class="mm-card mw-proxy-card">
      <h3 class="mm-card__title" data-help-key="mw-dormant">Activity spike proxy</h3>
      <p class="mm-card__value">${d.score != null ? d.score : "—"}</p>
      <p class="mm-card__sub">${mwEscape(d.label || "—")}</p>
      <p class="mm-card__desc">${mwEscape(d.description || "")}</p>
    </article>
    <article class="mm-card mw-proxy-card">
      <h3 class="mm-card__title" data-help-key="mw-flow-dir">Exchange flow (sample)</h3>
      <p class="mm-card__value mono">→ex ${lt.toExchangeCount24h ?? "—"} · ex→ ${lt.fromExchangeCount24h ?? "—"}</p>
      <p class="mm-card__sub">Labeled wallet touches · 24h sample</p>
      <p class="mm-card__desc">Counts transfers whose dominant side hits a wallet in this panel’s label set. Not full exchange coverage.</p>
    </article>
    <article class="mm-card mw-proxy-card">
      <h3 class="mm-card__title" data-help-key="mw-rich-100">Addresses &gt;100 BTC</h3>
      <p class="mm-card__value">${r.gt100btc?.count?.toLocaleString() ?? "—"}</p>
      <p class="mm-card__sub">Tracked proxies: ${r.gt100btc?.trackedProxy ?? "—"} · ${mwEscape(r.gt100btc?.source || "")}</p>
      <p class="mm-card__desc">Global rich-list snapshot. Tracked balance: ${r.trackedBalanceBtc != null ? `${mwFmtBtc(r.trackedBalanceBtc, 0)} BTC` : "—"}.</p>
    </article>
    <article class="mm-card mw-proxy-card">
      <h3 class="mm-card__title" data-help-key="mw-rich-1k">Addresses &gt;1,000 BTC</h3>
      <p class="mm-card__value">${r.gt1000btc?.count?.toLocaleString() ?? "—"}</p>
      <p class="mm-card__sub">Tracked proxies: ${r.gt1000btc?.trackedProxy ?? "—"}</p>
      <p class="mm-card__desc">Whale tier ≥100 BTC in feed: ${lt.whaleCount24h ?? "—"} txs · ${lt.whaleVolume24hBtc != null ? mwFmtBtc(lt.whaleVolume24hBtc, 0) : "—"} BTC (sample).</p>
    </article>`;
}

function mwRenderAbout(data) {
  const el = mwEl("mw-about-body");
  if (!el) return;
  const lines = data.about || [];
  const price =
    data.btcUsd != null ? `<li>BTC mark used for USD: <strong>$${Number(data.btcUsd).toLocaleString()}</strong>.</li>` : "";
  el.innerHTML =
    `<ul class="mm-about-list">${price}${lines.map((l) => `<li>${mwEscape(l)}</li>`).join("")}</ul>`;
}

function mwRenderMeta(data) {
  const meta = mwEl("mw-meta");
  if (!meta) return;
  const parts = [];
  if (data?.updatedAt) parts.push(`Updated ${mwFmtTime(data.updatedAt)}`);
  if (data?.btcUsd) parts.push(`$${Number(data.btcUsd).toLocaleString()} mark`);
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
  mwRenderFeed(data);
  mwRenderProxyCards(data);
  mwRenderAbout(data);
  mwRenderMeta(data);
  const screen = document.querySelector('#dashboard-misc .menu-screen[data-l2="whale-proxies"]');
  if (screen) {
    screen.querySelectorAll("[data-help-key]").forEach((el) => {
      if (!el.classList.contains("help-trigger")) el.dataset.helpDecorated = "false";
    });
    window.decorateHelpLabels?.(screen);
  }
  if (data.errors?.length) {
    mwSetError(`Some sources failed: ${data.errors.slice(0, 3).join("; ")}`);
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
      mwSetError(`Failed to load whale tracker — ${err.message || "try again"}`);
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
  return mwFetchWhales(false);
}

window.initMiscWhales = initMiscWhales;
window.MW_EXCHANGE_ADDRESSES = MW_EXCHANGE_ADDRESSES;
