const ONCHAIN_SECTIONS = [
  "overview",
  "network",
  "mining",
  "fees",
  "transactions",
  "supply",
  "addresses",
  "lightning",
];

const ONCHAIN_POLL_MS = 300_000;
const NEXT_HALVING_HEIGHT = 1_050_000;
const MEMPOOL_BASE = "https://mempool.space/api";
const CHAIN_STATS_URL = "https://api.blockchain.info/stats";
const CHAIN_CHARTS = "https://api.blockchain.info/charts";

const onchainCache = {};
let onchainPollTimer = null;
let onchainActiveSection = null;
let onchainReady = false;
let chainSnapshot = {};

const ocEl = (id) => document.getElementById(id);

function fmtLarge(n) {
  const v = Number(n);
  if (v == null || Number.isNaN(v)) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toLocaleString("en-US");
}

function fmtHashrateGhs(ghs) {
  const eh = Number(ghs) / 1e9;
  if (Number.isNaN(eh)) return "—";
  return eh >= 100 ? eh.toFixed(1) + " EH/s" : eh.toFixed(2) + " EH/s";
}

function fmtDifficulty(n) {
  return (Number(n) / 1e12).toFixed(2) + "T";
}

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 48) return Math.floor(h / 24) + "d " + (h % 24) + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

function fmtBtc(n, digits = 4) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return prefix + Number(n).toFixed(d) + "%";
}

async function fetchJson(url, asText = false) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return asText ? res.text() : res.json();
}

async function fetchBlockchainChart(name, timespan = "30days") {
  let data;
  try {
    data = await fetchJson(
      `/api/onchain/chart?name=${encodeURIComponent(name)}&timespan=${encodeURIComponent(timespan)}`,
    );
  } catch (_) {
    data = await fetchJson(
      `${CHAIN_CHARTS}/${name}?timespan=${timespan}&format=json`,
    );
  }
  return (data.values || []).map((v) => ({
    date: new Date(v.x * 1000).toISOString().slice(0, 10),
    close: v.y,
    ts: v.x,
  }));
}

async function fetchNetworkSnapshot() {
  const [mempool, fees, diffAdj, height, stats] = await Promise.all([
    fetchJson(`${MEMPOOL_BASE}/mempool`),
    fetchJson(`${MEMPOOL_BASE}/v1/fees/recommended`),
    fetchJson(`${MEMPOOL_BASE}/v1/difficulty-adjustment`),
    fetchJson(`${MEMPOOL_BASE}/blocks/tip/height`, true),
    fetchJson(CHAIN_STATS_URL),
  ]);

  const supplyBtc = stats.totalbc / 1e8;
  const mempoolMb = mempool.vsize / 1e6;
  const feeTotalBtc = mempool.total_fee / 1e8;
  const adjSign = diffAdj.difficultyChange >= 0 ? "+" : "";
  const heightNum = Number(String(height).trim());

  const snapshot = {
    height: String(height).trim(),
    heightNum,
    hashrate: fmtHashrateGhs(stats.hash_rate),
    hashrateGhs: stats.hash_rate,
    difficulty: stats.difficulty,
    mempoolCount: mempool.count,
    mempoolMb,
    mempoolFeeBtc: feeTotalBtc,
    fastFee: fees.fastestFee,
    hourFee: fees.hourFee,
    economyFee: fees.economyFee,
    diffChange: diffAdj.difficultyChange,
    remainingBlocks: diffAdj.remainingBlocks,
    remainingTime: diffAdj.remainingTime,
    epochProgress: diffAdj.progressPercent,
    nTx: stats.n_tx,
    supplyBtc,
    supplyPct: (supplyBtc / 21e6) * 100,
    blockTimeMin: stats.minutes_between_blocks,
  };

  chainSnapshot = snapshot;
  window.chainSnapshot = snapshot;

  const items = [
    { label: "Block Height", helpKey: "block-height", value: fmtLarge(heightNum), sub: "Bitcoin mainnet" },
    { label: "Hash Rate", helpKey: "hash-rate", value: fmtHashrateGhs(stats.hash_rate), sub: "Network compute power" },
    { label: "Difficulty", helpKey: "difficulty", value: fmtDifficulty(stats.difficulty), sub: "Mining difficulty" },
    {
      label: "Mempool",
      helpKey: "mempool",
      value: fmtLarge(mempool.count) + " txs",
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
      value: fmtLarge(stats.n_tx),
      sub: "Confirmed transactions",
    },
    {
      label: "Circulating Supply",
      helpKey: "circulating-supply",
      value: supplyBtc.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " BTC",
      sub: snapshot.supplyPct.toFixed(2) + "% of 21M cap",
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
        fmtDuration(Math.floor(diffAdj.remainingTime / 1000)) +
        " · " +
        diffAdj.progressPercent.toFixed(1) +
        "% through epoch",
      wide: true,
    },
  ];

  return { mempool, fees, diffAdj, height: heightNum, stats, snapshot, items };
}

function chartReturnPct(points) {
  if (!points || points.length < 2) return null;
  const first = points[0].close;
  const last = points[points.length - 1].close;
  if (!first) return null;
  return ((last - first) / first) * 100;
}

async function fetchOnchainSectionData(section) {
  const base = await fetchNetworkSnapshot();
  const { snapshot, items, mempool, fees, diffAdj, stats } = base;
  const fetchedAt = new Date().toISOString();
  const blocksToHalving = Math.max(0, NEXT_HALVING_HEIGHT - snapshot.heightNum);
  const halvingDays = (blocksToHalving * 10) / (60 * 24);

  const titles = {
    overview: "Overview",
    network: "Network",
    mining: "Mining",
    fees: "Fees & Mempool",
    transactions: "Transactions",
    supply: "Supply",
    addresses: "Addresses",
    lightning: "Lightning",
  };

  if (section === "overview") {
    const [hashChart, txChart] = await Promise.all([
      fetchBlockchainChart("hash-rate", "30days"),
      fetchBlockchainChart("n-transactions", "30days"),
    ]);
    return {
      section,
      title: titles.overview,
      heroes: [
        { name: "Block Height", value: fmtLarge(snapshot.heightNum), sub: "Mainnet tip" },
        { name: "Hash Rate", value: snapshot.hashrate, sub: "Live network power" },
        { name: "Mempool", value: fmtLarge(snapshot.mempoolCount) + " txs", sub: snapshot.mempoolMb.toFixed(1) + " MB pending" },
        { name: "Fast Fee", value: snapshot.fastFee + " sat/vB", sub: "Recommended inclusion" },
      ],
      items,
      chart: { points: hashChart, label: "Hash Rate (30d)" },
      chart2: { points: txChart, label: "Confirmed Txs / Day (30d)" },
      source: "Mempool.space · Blockchain.info",
      fetchedAt,
      snapshot,
    };
  }

  if (section === "network") {
    const diffAdjHistory = await fetchJson(
      `${MEMPOOL_BASE}/v1/mining/difficulty-adjustments/90d`,
    );
    const adjPoints = (diffAdjHistory || [])
      .filter((row) => row && row[3] > 0)
      .map((row) => ({
        date: new Date(row[0] * 1000).toISOString().slice(0, 10),
        close: (row[3] - 1) * 100,
        ts: row[0],
      }));
    return {
      section,
      title: titles.network,
      heroes: [
        { name: "Block Height", value: fmtLarge(snapshot.heightNum), sub: "Chain tip" },
        { name: "Difficulty", value: fmtDifficulty(snapshot.difficulty), sub: "Current epoch" },
        { name: "Block Time", value: snapshot.blockTimeMin.toFixed(1) + " min", sub: "24h average" },
        { name: "Next Adj.", value: fmtPct(snapshot.diffChange), sub: snapshot.remainingBlocks + " blocks remaining" },
      ],
      items,
      table: [
        { name: "Epoch progress", value: snapshot.epochProgress.toFixed(1) + "%", sub: "Current difficulty epoch" },
        { name: "Blocks to adjustment", value: fmtLarge(snapshot.remainingBlocks), sub: "~" + fmtDuration(Math.floor(snapshot.remainingTime / 1000)) },
        { name: "Mempool backlog", value: fmtLarge(snapshot.mempoolCount), sub: snapshot.mempoolMb.toFixed(1) + " MB" },
        { name: "Supply mined", value: snapshot.supplyPct.toFixed(2) + "%", sub: fmtBtc(snapshot.supplyBtc, 0) + " BTC" },
      ],
      tableMode: "metrics",
      chart: { points: adjPoints, label: "Difficulty Change % (90d)" },
      source: "Mempool.space · Blockchain.info",
      fetchedAt,
      snapshot,
    };
  }

  if (section === "mining") {
    const [hashWeek, poolsData, minerRev] = await Promise.all([
      fetchJson(`${MEMPOOL_BASE}/v1/mining/hashrate/1w`),
      fetchJson(`${MEMPOOL_BASE}/v1/mining/pools/1w`),
      fetchBlockchainChart("miners-revenue", "30days"),
    ]);
    const hashPoints = (hashWeek.hashrates || []).map((h) => ({
      date: new Date(h.timestamp * 1000).toISOString().slice(0, 10),
      close: h.avgHashrate / 1e18,
      ts: h.timestamp,
    }));
    const poolRows = poolsData.pools || [];
    const totalBlocks = poolRows.reduce((s, p) => s + (p.blockCount || 0), 0);
    const pools = poolRows
      .map((p) => ({
        name: p.name,
        value: p.blockCount,
        share: totalBlocks ? ((p.blockCount || 0) / totalBlocks) * 100 : 0,
        sub: (p.blockCount || 0) + " blocks · 1w",
      }))
      .sort((a, b) => b.share - a.share);
    const leader = pools[0];
    const revLast = minerRev.length ? minerRev[minerRev.length - 1].close : null;
    return {
      section,
      title: titles.mining,
      heroes: [
        { name: "Hash Rate", value: snapshot.hashrate, sub: "Network compute" },
        { name: "Pool Leader", value: leader?.name || "—", sub: leader ? leader.share.toFixed(1) + "% block share" : "—" },
        { name: "Miner Revenue", value: revLast != null ? revLast.toFixed(1) + " BTC/day" : "—", sub: "Latest daily estimate" },
        { name: "Adj. ETA", value: fmtDuration(Math.floor(snapshot.remainingTime / 1000)), sub: fmtPct(snapshot.diffChange) + " projected" },
      ],
      table: pools.slice(0, 12),
      tableMode: "pools",
      chart: { points: hashPoints, label: "Hash Rate EH/s (1w)" },
      source: "Mempool.space · Blockchain.info",
      fetchedAt,
      snapshot,
    };
  }

  if (section === "fees") {
    const [mempoolBlocks, feeChart] = await Promise.all([
      fetchJson(`${MEMPOOL_BASE}/v1/fees/mempool-blocks`),
      fetchBlockchainChart("transaction-fees", "30days"),
    ]);
    const blocks = (mempoolBlocks || []).slice(0, 8).map((b, i) => ({
      name: "Block +" + i,
      value: (b.medianFee ?? b.feeRange?.[0] ?? 0) + " sat/vB",
      sub: (b.nTx || 0) + " txs · " + ((b.blockVSize || 0) / 1e6).toFixed(2) + " MVB",
      share: Math.min(100, ((b.blockVSize || 0) / (mempool.vsize || 1)) * 100),
    }));
    return {
      section,
      title: titles.fees,
      heroes: [
        { name: "Fast", value: fees.fastestFee + " sat/vB", sub: "Next block target" },
        { name: "Hour", value: fees.hourFee + " sat/vB", sub: "~1 hour" },
        { name: "Economy", value: fees.economyFee + " sat/vB", sub: "Low priority" },
        { name: "Pending Fees", value: snapshot.mempoolFeeBtc.toFixed(3) + " BTC", sub: snapshot.mempoolMb.toFixed(1) + " MB mempool" },
      ],
      table: blocks,
      tableMode: "mempool-blocks",
      chart: { points: feeChart, label: "Total Tx Fees BTC (30d)" },
      source: "Mempool.space · Blockchain.info",
      fetchedAt,
      snapshot,
    };
  }

  if (section === "transactions") {
    const [txChart, addrChart, volChart, blockSizeChart] = await Promise.all([
      fetchBlockchainChart("n-transactions", "90days"),
      fetchBlockchainChart("n-unique-addresses", "90days"),
      fetchBlockchainChart("estimated-transaction-volume", "90days"),
      fetchBlockchainChart("avg-block-size", "30days"),
    ]);
    const volLast = volChart.length ? volChart[volChart.length - 1].close : null;
    const blockSize = blockSizeChart.length ? blockSizeChart[blockSizeChart.length - 1].close : null;
    return {
      section,
      title: titles.transactions,
      heroes: [
        { name: "Txs (24h)", value: fmtLarge(snapshot.nTx), sub: "Confirmed on-chain" },
        { name: "Unique Addresses", value: addrChart.length ? fmtLarge(addrChart[addrChart.length - 1].close) : "—", sub: "Latest daily count" },
        { name: "Est. Volume", value: volLast != null ? fmtLarge(volLast) + " BTC" : "—", sub: "Daily transfer volume" },
        { name: "Avg Block Size", value: blockSize != null ? blockSize.toFixed(2) + " MB" : "—", sub: "Recent blocks" },
      ],
      chart: { points: txChart, label: "Confirmed Txs / Day (90d)" },
      chart2: { points: addrChart, label: "Unique Addresses (90d)" },
      source: "Blockchain.info",
      fetchedAt,
      snapshot,
    };
  }

  if (section === "supply") {
    const supplyChart = await fetchBlockchainChart("total-bitcoins", "2years");
    const dailyIssuance = 450;
    return {
      section,
      title: titles.supply,
      heroes: [
        { name: "Circulating", value: fmtBtc(snapshot.supplyBtc, 0) + " BTC", sub: snapshot.supplyPct.toFixed(2) + "% of 21M" },
        { name: "Blocks to Halving", value: fmtLarge(blocksToHalving), sub: "~" + Math.round(halvingDays) + " days at 10 min/blk" },
        { name: "Next Halving", value: "Block " + fmtLarge(NEXT_HALVING_HEIGHT), sub: "Subsidy 3.125 → 1.5625 BTC" },
        { name: "Daily Issuance", value: "~" + dailyIssuance + " BTC", sub: "Current block reward era" },
      ],
      halving: {
        currentHeight: snapshot.heightNum,
        targetHeight: NEXT_HALVING_HEIGHT,
        blocksRemaining: blocksToHalving,
        pct: (snapshot.heightNum / NEXT_HALVING_HEIGHT) * 100,
      },
      chart: { points: supplyChart, label: "Circulating Supply (2y)" },
      source: "Blockchain.info · Mempool.space",
      fetchedAt,
      snapshot,
    };
  }

  if (section === "addresses") {
    const addrChart = await fetchBlockchainChart("n-unique-addresses", "90days");
    const txChart = await fetchBlockchainChart("n-transactions", "90days");
    const latestAddr = addrChart.length ? addrChart[addrChart.length - 1].close : null;
    const prevAddr = addrChart.length > 7 ? addrChart[addrChart.length - 8].close : null;
    const addrChg = latestAddr && prevAddr ? ((latestAddr - prevAddr) / prevAddr) * 100 : null;
    return {
      section,
      title: titles.addresses,
      heroes: [
        { name: "Unique Addresses", value: latestAddr != null ? fmtLarge(latestAddr) : "—", sub: "Latest daily active" },
        { name: "7d Change", value: addrChg != null ? fmtPct(addrChg) : "—", sub: "Address activity trend" },
        { name: "Tx Count (24h)", value: fmtLarge(snapshot.nTx), sub: "Network throughput" },
        { name: "Mempool Txs", value: fmtLarge(snapshot.mempoolCount), sub: "Pending confirmations" },
      ],
      table: [
        { name: "Receiving activity proxy", value: latestAddr != null ? fmtLarge(latestAddr) : "—", sub: "Unique addresses / day" },
        { name: "Transaction throughput", value: fmtLarge(snapshot.nTx), sub: "Confirmed txs (24h)" },
        { name: "Advanced cohort metrics", value: "N/A", sub: "Entity-adjusted data requires paid analytics API" },
      ],
      tableMode: "metrics",
      chart: { points: addrChart, label: "Unique Addresses (90d)" },
      chart2: { points: txChart, label: "Transactions / Day (90d)" },
      source: "Blockchain.info",
      fetchedAt,
      snapshot,
    };
  }

  if (section === "lightning") {
    const ln = await fetchJson(`${MEMPOOL_BASE}/v1/lightning/statistics/latest`);
    const latest = ln.latest || {};
    const capacityBtc = (latest.total_capacity || 0) / 1e8;
    const avgCapBtc = (latest.avg_capacity || 0) / 1e8;
    const medCapBtc = (latest.med_capacity || 0) / 1e8;
    return {
      section,
      title: titles.lightning,
      heroes: [
        { name: "Network Capacity", value: fmtBtc(capacityBtc, 2) + " BTC", sub: "Total channel liquidity" },
        { name: "Nodes", value: fmtLarge(latest.node_count), sub: (latest.tor_nodes || 0) + " Tor · " + (latest.clearnet_nodes || 0) + " clearnet" },
        { name: "Channels", value: fmtLarge(latest.channel_count), sub: "Avg fee " + (latest.avg_fee_rate || 0) + " ppm" },
        { name: "Median Channel", value: fmtBtc(medCapBtc, 4) + " BTC", sub: "Avg " + fmtBtc(avgCapBtc, 4) + " BTC" },
      ],
      table: [
        { name: "Total capacity", value: fmtBtc(capacityBtc, 2) + " BTC", sub: "Public network" },
        { name: "Node count", value: fmtLarge(latest.node_count), sub: "Routing nodes" },
        { name: "Channel count", value: fmtLarge(latest.channel_count), sub: "Open channels" },
        { name: "Tor nodes", value: fmtLarge(latest.tor_nodes), sub: "Privacy-preserving" },
        { name: "Clearnet nodes", value: fmtLarge(latest.clearnet_nodes), sub: "Public IP" },
        { name: "Avg capacity", value: fmtBtc(avgCapBtc, 4) + " BTC", sub: "Per channel" },
        { name: "Median capacity", value: fmtBtc(medCapBtc, 4) + " BTC", sub: "Per channel" },
        { name: "Avg fee rate", value: (latest.avg_fee_rate || 0) + " ppm", sub: "Routing fees" },
      ],
      tableMode: "lightning",
      chart: {
        points: [
          { date: "Capacity", close: capacityBtc },
          { date: "Nodes", close: (latest.node_count || 0) / 1000 },
          { date: "Channels", close: (latest.channel_count || 0) / 10000 },
        ],
        label: "Lightning snapshot (normalized)",
      },
      source: "Mempool.space",
      fetchedAt,
      snapshot,
      updated: latest.added,
    };
  }

  throw new Error(`Unknown on-chain section: ${section}`);
}

function buildOnchainCommentary(data) {
  const s = data.snapshot || {};
  const lines = [];

  if (data.section === "overview") {
    const hrChg = chartReturnPct(data.chart?.points);
    lines.push(
      `On-chain overview: block ${fmtLarge(s.heightNum)} · hashrate ${s.hashrate}` +
        (hrChg != null ? ` (${fmtPct(hrChg)} vs 30d start)` : "") +
        `. Mempool holds ${fmtLarge(s.mempoolCount)} txs (${s.mempoolMb?.toFixed(1)} MB). Fast fee ${s.fastFee} sat/vB.`,
    );
    lines.push(
      `Supply ${fmtBtc(s.supplyBtc, 0)} BTC (${s.supplyPct?.toFixed(2)}% of 21M). Next difficulty adjustment ${fmtPct(s.diffChange)} in ${s.remainingBlocks} blocks.`,
    );
  } else if (data.section === "network") {
    lines.push(
      `Network: difficulty ${fmtDifficulty(s.difficulty)} with ${s.blockTimeMin?.toFixed(1)} min average block time. Epoch ${s.epochProgress?.toFixed(1)}% complete; adjustment expected in ~${fmtDuration(Math.floor(s.remainingTime / 1000))}.`,
    );
  } else if (data.section === "mining") {
    const leader = data.table?.[0];
    lines.push(
      `Mining: ${s.hashrate} aggregate hashrate. ${leader ? leader.name + " leads pool share at " + leader.share.toFixed(1) + "% (1w blocks)." : "Pool data unavailable."}`,
    );
    lines.push(`Projected difficulty change ${fmtPct(s.diffChange)} after ${s.remainingBlocks} blocks.`);
  } else if (data.section === "fees") {
    lines.push(
      `Fees: fast ${s.fastFee} · hour ${s.hourFee} · economy ${s.economyFee} sat/vB. ${fmtLarge(s.mempoolCount)} txs (${s.mempoolMb?.toFixed(1)} MB) waiting with ~${s.mempoolFeeBtc?.toFixed(3)} BTC in pending fees.`,
    );
  } else if (data.section === "transactions") {
    const txChg = chartReturnPct(data.chart?.points);
    lines.push(
      `Transactions: ${fmtLarge(s.nTx)} confirmed in the last 24h` +
        (txChg != null ? `; 90d tx trend ${fmtPct(txChg)}.` : "."),
    );
  } else if (data.section === "supply") {
    const h = data.halving;
    lines.push(
      `Supply: ${fmtBtc(s.supplyBtc, 0)} BTC circulating (${s.supplyPct?.toFixed(2)}% of cap). Halving at block ${fmtLarge(NEXT_HALVING_HEIGHT)} — ${fmtLarge(h?.blocksRemaining)} blocks (~${Math.round((h?.blocksRemaining || 0) * 10 / 1440)} days) remaining.`,
    );
  } else if (data.section === "addresses") {
    lines.push(
      `Addresses: daily unique address counts track network participation. Advanced Glassnode-style cohort metrics (HODL waves, entity-adjusted flows) are not available via free APIs.`,
    );
  } else if (data.section === "lightning") {
    lines.push(
      `Lightning: ${data.heroes?.[0]?.value} public capacity across ${data.heroes?.[2]?.value} channels. L2 liquidity complements on-chain settlement for micropayments.`,
    );
  }

  lines.push("Data: " + (data.source || "public APIs") + ". Advanced exchange-flow and realized-cap metrics require a paid analytics provider.");
  return lines;
}

function renderOnchainHeroes(section, data) {
  const strip = ocEl(`onchain-${section}-heroes`);
  if (!strip) return;
  strip.innerHTML = (data.heroes || [])
    .slice(0, 4)
    .map(
      (h) => `
      <article class="deriv-hero-block">
        <span class="deriv-hero-label">${h.name}</span>
        <span class="deriv-hero-value">${h.value ?? "—"}</span>
        <span class="deriv-hero-sub">${h.sub || ""}</span>
      </article>`,
    )
    .join("");
}

function renderOnchainGrid(section, data) {
  const grid = ocEl(`onchain-${section}-grid`);
  if (!grid || !data.items?.length) return;
  const labelFn = window.labelWithHelp || ((l) => l);
  grid.innerHTML = data.items
    .map(
      ({ label, value, sub, wide, helpKey }) => `
    <article class="chain-card${wide ? " wide" : ""}">
      <span class="chain-label">${labelFn(label, helpKey)}</span>
      <span class="chain-value">${value}</span>
      ${sub ? `<span class="chain-sub">${sub}</span>` : ""}
    </article>`,
    )
    .join("");
}

function renderOnchainTable(section, data) {
  const body = ocEl(`onchain-${section}-table-body`);
  if (!body) return;
  const rows = data.table || [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="3">No data</td></tr>';
    return;
  }

  if (data.tableMode === "pools") {
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${r.name}</td>
        <td class="mono">${r.value}</td>
        <td>
          <div class="onchain-share-cell">
            <span class="onchain-share-bar" style="width:${Math.min(100, r.share).toFixed(1)}%"></span>
            <span class="onchain-share-pct">${r.share.toFixed(1)}%</span>
          </div>
        </td>
      </tr>`,
      )
      .join("");
    return;
  }

  if (data.tableMode === "mempool-blocks") {
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${r.name}</td>
        <td class="mono">${r.value}</td>
        <td>${r.sub || ""}</td>
      </tr>`,
      )
      .join("");
    return;
  }

  body.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${r.name}</td>
      <td class="mono">${r.value}</td>
      <td>${r.sub || ""}</td>
    </tr>`,
    )
    .join("");
}

function renderHalvingCard(section, data) {
  const el = ocEl(`onchain-${section}-halving`);
  if (!el || !data.halving) return;
  const h = data.halving;
  el.innerHTML = `
    <article class="onchain-halving-card">
      <span class="onchain-halving-label">Progress to next halving (block ${fmtLarge(NEXT_HALVING_HEIGHT)})</span>
      <div class="onchain-halving-track"><div class="onchain-halving-fill" style="width:${Math.min(100, h.pct).toFixed(2)}%"></div></div>
      <span class="onchain-halving-sub">${fmtLarge(h.blocksRemaining)} blocks remaining · current height ${fmtLarge(h.currentHeight)}</span>
    </article>`;
}

function chartYLabel(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

function paintOnchainChart(data, chartKey, color, w, h) {
  const chart = chartKey === 2 ? data.chart2 : data.chart;
  const pts = (chart?.points || []).filter((p) => Number.isFinite(p.close));
  const canvas = ocEl(`onchain-${data.section}-chart${chartKey === 2 ? "2" : ""}`);
  if (!canvas || pts.length < 2) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 18, right: 20, bottom: 36, left: 56 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const closes = pts.map((p) => p.close);
  const minV = Math.min(...closes);
  const maxV = Math.max(...closes);
  const range = maxV - minV || 0.01;

  ctx.fillStyle = color === "#10b981" ? "rgba(16, 185, 129, 0.12)" : "rgba(52, 211, 153, 0.12)";
  ctx.beginPath();
  closes.forEach((v, i) => {
    const x = pad.left + (i / Math.max(closes.length - 1, 1)) * chartW;
    const y = pad.top + chartH - ((v - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, pad.top + chartH);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + chartW, pad.top + chartH);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  closes.forEach((v, i) => {
    const x = pad.left + (i / Math.max(closes.length - 1, 1)) * chartW;
    const y = pad.top + chartH - ((v - minV) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(chartYLabel(maxV), pad.left - 6, pad.top + 10);
  ctx.fillText(chartYLabel(minV), pad.left - 6, h - pad.bottom);

  if (pts[0]?.date && /^\d{4}-\d{2}-\d{2}/.test(pts[0].date)) {
    drawTimeAxisLabels(ctx, w, h, pad, pts.length, (i) =>
      fmtChartDate(pts[i]?.date, pts.length > 120),
    );
  }
}

function drawOnchainCharts(section, data) {
  if (!data) return;
  const accent = "#10b981";
  const run = () => {
    scheduleChartDraw(ocEl(`onchain-${section}-chart`), (w, h) =>
      paintOnchainChart(data, 1, accent, w, h),
    );
    if (data.chart2?.points?.length) {
      scheduleChartDraw(ocEl(`onchain-${section}-chart2`), (w, h) =>
        paintOnchainChart(data, 2, "#34d399", w, h),
      );
    }
  };
  run();
  requestAnimationFrame(run);
  setTimeout(run, 120);
  setTimeout(run, 350);
  setTimeout(run, 600);
}

function renderOnchainCommentary(section, data) {
  const node = ocEl(`onchain-${section}-commentary`);
  if (!node) return;
  node.innerHTML = buildOnchainCommentary(data)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function renderOnchainScreen(section, data, opts = {}) {
  if (!data) return;
  onchainCache[section] = data;

  const updateEl = ocEl(`onchain-${section}-update`);
  if (updateEl) {
    updateEl.textContent = window.DashboardSWR?.formatPanelMeta({
      fetchedAt: data.fetchedAt,
      source: data.source,
      stale: opts.stale,
      refreshing: opts.refreshing,
      refreshFailed: opts.refreshFailed,
    }) || "—";
  }

  const chartTitle = ocEl(`onchain-${section}-chart-title`);
  if (chartTitle) {
    chartTitle.textContent = data.chart?.label || "Trend";
  }
  const chartTitle2 = ocEl(`onchain-${section}-chart2-title`);
  if (chartTitle2) {
    chartTitle2.textContent = data.chart2?.label || "";
    chartTitle2.closest(".panel")?.toggleAttribute("hidden", !data.chart2?.points?.length);
  }

  renderOnchainHeroes(section, data);
  renderOnchainGrid(section, data);
  renderOnchainTable(section, data);
  renderHalvingCard(section, data);
  renderOnchainCommentary(section, data);

  drawOnchainCharts(section, data);

  const screen = document.querySelector(
    `#dashboard-onchain .menu-screen[data-l2="${section}"]`,
  );
  window.decorateHelpLabels?.(screen);
}

async function loadOnchainSection(section) {
  if (!ONCHAIN_SECTIONS.includes(section)) return;
  onchainActiveSection = section;

  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: `onchain:${section}`,
      l1: "onchain",
      source: "Mempool.space",
      fetch: () => fetchOnchainSectionData(section),
      render: (data, opts = {}) => {
        if (opts.loading) {
          const body = ocEl(`onchain-${section}-table-body`);
          if (body) body.innerHTML = '<tr><td colspan="3">Loading on-chain data…</td></tr>';
          return;
        }
        renderOnchainScreen(section, data, opts);
      },
    });
  } catch (err) {
    console.error("On-chain load failed:", section, err);
    const commentary = ocEl(`onchain-${section}-commentary`);
    if (commentary && !onchainCache[section]) {
      commentary.innerHTML = `<p>Failed to load ${section} data. Check network connectivity.</p>`;
    }
  }
}

function startOnchainPoll() {
  if (onchainPollTimer) return;
  onchainPollTimer = setInterval(() => {
    if (onchainActiveSection) loadOnchainSection(onchainActiveSection);
  }, ONCHAIN_POLL_MS);
}

function initOnchainModule() {
  if (onchainReady) return;
  onchainReady = true;
  window.addEventListener("resize", () => {
    if (!onchainActiveSection || !onchainCache[onchainActiveSection]) return;
    drawOnchainCharts(onchainActiveSection, onchainCache[onchainActiveSection]);
  });
}

window.loadOnchainDashboard = function () {
  initOnchainModule();
  startOnchainPoll();
  window.decorateHelpLabels?.(document.getElementById("dashboard-onchain"));
};

window.loadOnchainSection = loadOnchainSection;

window.refreshOnchainData = function () {
  if (onchainActiveSection) {
    loadOnchainSection(onchainActiveSection);
  } else {
    loadOnchainSection("overview");
  }
};

window.refreshOnchainCharts = function (section) {
  const active = section || onchainActiveSection;
  if (active && onchainCache[active]) {
    drawOnchainCharts(active, onchainCache[active]);
  }
};