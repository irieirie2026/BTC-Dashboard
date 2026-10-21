const OPTIONS_API = "/api/options";

const DELIVERY_POLL_MS = 60_000;
const OPTIONS_POLL_MS = 120_000;

let deliveryData = null;
let optionsData = null;
let deliveryTimer = null;
let optionsTimer = null;
let derivativesExtraReady = false;

const dxEl = (id) => document.getElementById(id);

function dxFmtPrice(n, d = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function fmtStrike(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  return "$" + Math.round(v).toLocaleString("en-US");
}

function fmtPct(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return prefix + Number(n).toFixed(d) + "%";
}

function fmtVol(n) {
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(2);
}

function fmtIv(iv) {
  if (iv == null || iv <= 0 || iv > 5) return "—";
  return (iv * 100).toFixed(1) + "%";
}

function daysToExpiry(ts) {
  return Math.max((ts - Date.now()) / 86400000, 0.5);
}

function expiryDayKey(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function markIvDecimal(raw) {
  const iv = parseFloat(raw);
  if (!Number.isFinite(iv) || iv <= 0) return null;
  if (iv > 3 && iv < 500) return iv / 100;
  if (iv <= 3) return iv;
  return null;
}

function expiryLabel(ts) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

const MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseOptionSymbol(symbol) {
  const deribit = String(symbol || "").toUpperCase().match(/^BTC-(\d{1,2})([A-Z]{3})(\d{2,4})-(\d+(?:\.\d+)?)-(C|P)$/);
  if (deribit) {
    const mon = MONTHS[deribit[2]];
    if (mon == null) return null;
    let year = parseInt(deribit[3], 10);
    if (year < 100) year += 2000;
    return {
      symbol,
      expiry: Date.UTC(year, mon, parseInt(deribit[1], 10), 8, 0, 0),
      strike: parseFloat(deribit[4]),
      side: deribit[5],
    };
  }
  const binance = symbol.match(/^BTC-(\d{6})-(\d+)-(C|P)$/);
  if (binance) {
    const yy = parseInt(binance[1].slice(0, 2), 10);
    const mm = parseInt(binance[1].slice(2, 4), 10) - 1;
    const dd = parseInt(binance[1].slice(4, 6), 10);
    return {
      symbol,
      expiry: Date.UTC(2000 + yy, mm, dd),
      strike: parseInt(binance[2], 10),
      side: binance[3],
    };
  }
  return null;
}

async function dxFetchJson(url, ms = 8000) {
  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ac.signal });
    if (!res.ok) throw new Error(url + " " + res.status);
    return await res.json();
  } finally {
    clearTimeout(kill);
  }
}

function deliveryMapContract(c, index) {
  const cLast = Number(c.last);
  const cMark = Number(c.mark || cLast);
  const cIndex = Number(c.index || index);
  const basisPct = Number.isFinite(Number(c.basisPct))
    ? Number(c.basisPct)
    : (cIndex ? ((cMark - cIndex) / cIndex) * 100 : 0);
  const days = Number(c.daysToExpiry);
  const ann = Number.isFinite(Number(c.annBasisPct))
    ? Number(c.annBasisPct)
    : (Number.isFinite(days) && days > 0.05 ? (basisPct / days) * 365 : basisPct);
  return {
    symbol: c.symbol,
    margin: c.margin || "USDT",
    type: c.type || "Dated",
    last: cLast,
    mark: cMark,
    index: Number.isFinite(cIndex) ? cIndex : null,
    basisPct,
    annBasisPct: ann,
    openInterest: c.openInterest,
    volume: c.volume,
    deliveryDate: c.deliveryDate ?? null,
    daysToExpiry: Number.isFinite(days) ? days : null,
  };
}

function deliveryFromFallback(snap) {
  const perp = snap.perp || snap;
  const last = Number(perp.lastPrice || perp.last);
  const mark = Number(perp.markPrice || perp.mark || last);
  const index = Number(snap.indexPrice || perp.indexPrice || perp.index);
  const contracts = (snap.contracts || []).map((c) => deliveryMapContract(c, index));
  const coinContracts = (snap.coinContracts || []).map((c) => deliveryMapContract(c, index));
  const venue = snap.venue || perp.venue || "OKX";
  const curvePoints = Array.isArray(snap.curvePoints) && snap.curvePoints.length
    ? snap.curvePoints
    : [
        { label: "Perp", days: 0, basis: 0, annBasis: 0 },
        ...[...contracts, ...coinContracts]
          .filter((c) => Number.isFinite(c.daysToExpiry))
          .map((c) => ({
            label: c.symbol,
            days: c.daysToExpiry,
            basis: c.basisPct,
            annBasis: c.annBasisPct,
          })),
      ];
  return {
    indexPrice: Number.isFinite(index) ? index : null,
    perp: {
      symbol: "BTC-USDT-SWAP",
      margin: "USDT",
      type: "Perpetual",
      last,
      mark,
      index: Number.isFinite(index) ? index : null,
      basisPct: Number.isFinite(index) && index ? ((mark - index) / index) * 100 : 0,
      annBasisPct: 0,
      openInterest: perp.openInterest,
      volume: perp.volume || perp.quoteVolume,
      deliveryDate: null,
      daysToExpiry: 0,
    },
    contracts,
    coinContracts,
    curvePoints,
    curveMargin: snap.curveMargin || null,
    curveLabel: snap.curveLabel || null,
    indexSource: snap.indexSource || (perp.venue ? `${perp.venue} index` : "Index"),
    fetchedAt: snap.fetchedAt || new Date().toISOString(),
    venue,
    venueLabel: venue,
  };
}

async function fetchDeliveryBundle() {
  // Binance fapi/dapi is blocked in the browser. Dated futures come from the server proxy.
  try {
    const snap = await dxFetchJson("/api/market/futures", 12000);
    if (!snap || (!snap.perp?.lastPrice && !(snap.contracts || []).length && !(snap.coinContracts || []).length)) {
      throw new Error(snap?.error || "Futures venues failed");
    }
    return deliveryFromFallback(snap);
  } catch (err) {
    throw err;
  }
}

async function loadDeliveryFutures() {
  const swr = window.DashboardSWR;
  if (!swr) return;
  const updateEl = dxEl("delivery-update");

  try {
    await swr.runSWR({
      key: "derivatives:delivery",
      l1: "derivatives",
      source: "Futures venues",
      updateHeader: false,
      fetch: fetchDeliveryBundle,
      render: (data, opts = {}) => {
        const src = data?.venue || data?.venueLabel || "Futures venues";
        if (opts.loading) {
          if (updateEl) updateEl.textContent = "Loading… · " + src;
          return;
        }
        deliveryData = data;
        renderDeliveryScreen();
        if (updateEl) {
          updateEl.textContent = swr.formatPanelMeta({
            fetchedAt: data.fetchedAt,
            source: src,
            stale: opts.stale,
            refreshing: opts.refreshing,
            refreshFailed: opts.refreshFailed,
          });
        }
      },
    });
  } catch (err) {
    console.error("Delivery futures load failed:", err);
    if (updateEl && !deliveryData) updateEl.textContent = "Unavailable · OKX";
  }
}

function renderDeliveryScreen() {
  if (!deliveryData) return;
  const { indexPrice, perp, contracts, curvePoints } = deliveryData;

  const nearest = contracts[0];
  const curveShape =
    contracts.length >= 2
      ? contracts[contracts.length - 1].basisPct > contracts[0].basisPct
        ? "Contango"
        : contracts[contracts.length - 1].basisPct < contracts[0].basisPct
          ? "Backwardation"
          : "Flat"
      : nearest
        ? nearest.basisPct >= 0
          ? "Contango"
          : "Backwardation"
        : "—";

  const set = (id, text, cls) => {
    const node = dxEl(id);
    if (!node) return;
    node.textContent = text;
    if (cls) node.className = cls;
  };

  set("delivery-index", indexPrice ? "$" + dxFmtPrice(indexPrice) : "—");
  const indexSub = dxEl("delivery-index-sub");
  if (indexSub) indexSub.textContent = deliveryData.indexSource || "Index";
  const curveMeta = dxEl("delivery-curve-meta");
  if (curveMeta) {
    const kind = deliveryData.curveLabel || "USDT margin";
    curveMeta.textContent = kind + " · annualized basis % · days to expiry";
  }
  set("delivery-perp", "$" + dxFmtPrice(perp.last));
  set("delivery-curve-shape", curveShape);
  set(
    "delivery-nearest-basis",
    nearest ? fmtPct(nearest.basisPct, 3) : "—",
    nearest
      ? "deriv-hero-value " + (nearest.basisPct >= 0 ? "positive" : "negative")
      : "deriv-hero-value",
  );
  const nearestSub = dxEl("delivery-nearest-sub");
  if (nearestSub) {
    nearestSub.textContent = nearest
      ? nearest.symbol.replace("BTCUSDT_", "") +
        " · " +
        expiryLabel(nearest.deliveryDate)
      : "—";
  }

  const tbody = dxEl("delivery-contracts-body");
  if (tbody) {
    const dated = dxDedupeContracts([...(contracts || []), ...(deliveryData.coinContracts || [])]);
    const rows = [perp, ...dated];
    tbody.innerHTML = rows
      .map((c) => {
        const basisCls = c.basisPct >= 0 ? "positive" : "negative";
        const exp = c.deliveryDate
          ? expiryLabel(c.deliveryDate) + " (" + c.daysToExpiry.toFixed(0) + "d)"
          : "—";
        return `<tr>
          <td class="mono">${c.symbol}</td>
          <td>${dxMarginLabel(c.margin)}</td>
          <td>${c.type}</td>
          <td>${exp}</td>
          <td class="mono">$${dxFmtPrice(c.last)}</td>
          <td class="mono">$${dxFmtPrice(c.mark)}</td>
          <td class="mono ${basisCls}">${fmtPct(c.basisPct, 3)}</td>
          <td class="mono ${basisCls}">${c.daysToExpiry ? fmtPct(c.annBasisPct, 2) : "—"}</td>
          <td class="mono">${c.openInterest != null ? fmtVol(c.openInterest) + " BTC" : "—"}</td>
          <td class="mono">${fmtVol(c.volume)}</td>
        </tr>`;
      })
      .join("");
  }

  drawDeliveryCurveChart(curvePoints);
  drawDeliveryOiChart([perp, ...dxDedupeContracts([...(contracts || []), ...(deliveryData.coinContracts || [])])]);
}

function dxMarginLabel(margin) {
  const s = String(margin || "").toUpperCase();
  if (s.startsWith("COIN")) return "COIN-M";
  if (s.startsWith("USDT")) return "USDT-M";
  return margin || "—";
}

function dxDedupeContracts(rows) {
  const best = new Map();
  for (const c of rows || []) {
    if (!c) continue;
    const key = `${c.margin}|${c.deliveryDate || c.symbol}`;
    const prev = best.get(key);
    if (!prev || (Number(c.openInterest) || 0) > (Number(prev.openInterest) || 0)) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => (Number(a.deliveryDate) || 0) - (Number(b.deliveryDate) || 0));
}

function dxShortOiLabel(c) {
  const margin = String(c.margin || "").toUpperCase().startsWith("COIN") ? "COIN" : "USDT";
  if (!c.deliveryDate || c.type === "Perpetual" || c.type === "PERPETUAL") return margin + " perp";
  const days = Number(c.daysToExpiry);
  return Number.isFinite(days) ? `${margin} ${Math.round(days)}d` : margin;
}

function drawDeliveryCurveChart(points) {
  const canvas = dxEl("delivery-curve-chart");
  if (!canvas || !points.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 18, right: 28, bottom: 56, left: 104 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const curvePts = points.filter((p) => p.days >= 0).slice().sort((a, b) => a.days - b.days);
  const maxDays = Math.max(...curvePts.map((p) => p.days), 1);
  const values = curvePts.map((p) => p.annBasis);
  const maxAbs = Math.max(...values.map(Math.abs), 0.5);
  const zeroY = pad.top + chartH / 2;

  ctx.strokeStyle = "rgba(125, 135, 153, 0.35)";
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(w - pad.right, zeroY);
  ctx.stroke();

  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  curvePts.forEach((p, i) => {
    const x = pad.left + (p.days / maxDays) * chartW;
    const y = zeroY - (p.annBasis / maxAbs) * (chartH / 2 - 8);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  curvePts.forEach((p) => {
    const x = pad.left + (p.days / maxDays) * chartW;
    const y = zeroY - (p.annBasis / maxAbs) * (chartH / 2 - 8);
    ctx.fillStyle = p.annBasis >= 0 ? "#0ecb81" : "#f6465d";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#7d8799";
  ctx.font = "12px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(fmtPct(maxAbs, 1), pad.left - 8, pad.top + 12);
  ctx.fillText(fmtPct(-maxAbs, 1), pad.left - 8, h - pad.bottom);
  ctx.textAlign = "center";
  curvePts.forEach((p) => {
    const x = pad.left + (p.days / maxDays) * chartW;
    const label = String(p.label || "");
    ctx.fillText(label, x, h - 18);
  });
}

async function fetchOptionsBundle() {
    const payload = await dxFetchJson(OPTIONS_API);
    const contracts = payload.contracts || [];
    const underlying = (payload.contracts || []).map((c) =>
      parseFloat(c.underlying_price || c.estimated_delivery_price),
    ).find((n) => Number.isFinite(n) && n > 1000);
    const indexPrice = [
      payload.indexPrice,
      payload.index?.index_price,
      payload.index?.indexPrice,
      underlying,
    ].map((n) => parseFloat(n)).find((n) => Number.isFinite(n) && n > 0) || null;

    const chain = contracts
      .map((c) => {
        const parsed = parseOptionSymbol(c.instrument_name || c.symbol || "") || (
          c.strike != null
            ? {
                symbol: c.instrument_name || c.symbol,
                expiry: c.expiration_timestamp || c.expirationTimestamp,
                strike: parseFloat(c.strike),
                side: (c.option_type || c.type || "").toString().charAt(0).toUpperCase() === "P" ? "P" : "C",
              }
            : null
        );
        if (!parsed || !Number.isFinite(Number(parsed.strike))) return null;
        let expiry = Number(parsed.expiry);
        if (Number.isFinite(expiry) && expiry > 0 && expiry < 1e12) expiry *= 1000;
        parsed.expiry = expiry;
        parsed.strike = Number(parsed.strike);
        return {
          ...parsed,
          markIv: markIvDecimal(c.mark_iv ?? c.markIv ?? c.iv),
          markPrice: parseFloat(c.mark_price || 0),
          volume: parseFloat(c.volume || 0),
          openInterest: parseFloat(c.open_interest || 0),
        };
      })
      .filter(Boolean);

    const byExpiry = {};
    chain.forEach((o) => {
      const key = expiryDayKey(o.expiry) || o.expiry;
      o.expiry = key;
      if (!byExpiry[key]) byExpiry[key] = [];
      byExpiry[key].push(o);
    });

    const expiries = Object.keys(byExpiry)
      .map(Number)
      .sort((a, b) => a - b)
      .filter((e) => Number.isFinite(e) && e + 36 * 3600 * 1000 > Date.now());

    function atmIvForExpiry(expiry) {
      const opts = byExpiry[expiry] || [];
      if (!opts.length || !indexPrice) return null;
      let best = null;
      let bestDist = Infinity;
      opts.forEach((o) => {
        if (!o.markIv) return;
        const dist = Math.abs(o.strike - indexPrice);
        if (dist < bestDist) {
          bestDist = dist;
          best = o;
        }
      });
      return best?.markIv ?? null;
    }

    const ivTerm = expiries.slice(0, 8).map((exp) => ({
      expiry: exp,
      label: expiryLabel(exp),
      days: daysToExpiry(exp),
      atmIv: atmIvForExpiry(exp),
    }));

    const nearestExpiry =
      expiries[0] ||
      Object.keys(byExpiry)
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
        .pop();
    const smileExpiry =
      expiries.find((e) => {
        const opts = byExpiry[e];
        return opts.filter((o) => o.markIv && o.volume > 0).length >= 6;
      }) || nearestExpiry;

    const smileOpts = (byExpiry[smileExpiry] || [])
      .filter((o) => o.markIv)
      .sort((a, b) => a.strike - b.strike);

    const atmIv = atmIvForExpiry(nearestExpiry);
    const allIv = chain.filter((o) => o.markIv).map((o) => o.markIv);
    const ivHigh = allIv.length ? Math.max(...allIv) : null;
    const ivLow = allIv.length ? Math.min(...allIv) : null;

    const putWing = chain.filter(
      (o) =>
        o.side === "P" &&
        o.markIv &&
        indexPrice &&
        o.strike <= indexPrice * 0.88 &&
        o.strike >= indexPrice * 0.75,
    );
    const callWing = chain.filter(
      (o) =>
        o.side === "C" &&
        o.markIv &&
        indexPrice &&
        o.strike >= indexPrice * 1.12 &&
        o.strike <= indexPrice * 1.28,
    );
    const avg = (arr) =>
      arr.length ? arr.reduce((s, o) => s + o.markIv, 0) / arr.length : null;
    const skew25 =
      avg(putWing) != null && avg(callWing) != null
        ? (avg(putWing) - avg(callWing)) * 100
        : null;

    const volByStrike = {};
    chain.forEach((o) => {
      if (!volByStrike[o.strike]) {
        volByStrike[o.strike] = { call: 0, put: 0, callOi: 0, putOi: 0 };
      }
      if (o.side === "C") {
        volByStrike[o.strike].call += o.volume;
        volByStrike[o.strike].callOi += o.openInterest || 0;
      } else {
        volByStrike[o.strike].put += o.volume;
        volByStrike[o.strike].putOi += o.openInterest || 0;
      }
    });

    const strikes = Object.keys(volByStrike)
      .map(Number)
      .sort((a, b) => a - b);

    let maxPainStrike = null;
    let minPain = Infinity;
    let painOpts = byExpiry[nearestExpiry] || [];
    if (painOpts.length < 4) {
      const richest = Object.values(byExpiry).sort(
        (a, b) =>
          b.reduce((s, o) => s + (o.openInterest || 0), 0) -
          a.reduce((s, o) => s + (o.openInterest || 0), 0),
      )[0];
      if (richest?.length) painOpts = richest;
    }
    const painStrikes = [...new Set(painOpts.map((o) => o.strike))].sort(
      (a, b) => a - b,
    );

    painStrikes.forEach((test) => {
      let pain = 0;
      painOpts.forEach((o) => {
        const w = o.openInterest || o.volume || 0.001;
        if (o.side === "C") pain += w * Math.max(0, test - o.strike);
        else pain += w * Math.max(0, o.strike - test);
      });
      if (pain < minPain) {
        minPain = pain;
        maxPainStrike = test;
      }
    });

    const callOi = chain
      .filter((o) => o.side === "C")
      .reduce((s, o) => s + (o.openInterest || 0), 0);
    const putOi = chain
      .filter((o) => o.side === "P")
      .reduce((s, o) => s + (o.openInterest || 0), 0);
    const callVol = chain
      .filter((o) => o.side === "C")
      .reduce((s, o) => s + o.volume, 0);
    const putVol = chain
      .filter((o) => o.side === "P")
      .reduce((s, o) => s + o.volume, 0);
    const pcRatio = callOi > 0 ? putOi / callOi : callVol > 0 ? putVol / callVol : null;

    let topStrikes = strikes
      .map((s) => ({
        strike: s,
        call: volByStrike[s].call,
        put: volByStrike[s].put,
        callOi: volByStrike[s].callOi,
        putOi: volByStrike[s].putOi,
        totalOi: volByStrike[s].callOi + volByStrike[s].putOi,
        total: volByStrike[s].call + volByStrike[s].put,
      }))
      .sort((a, b) => b.totalOi - a.totalOi)
      .slice(0, 12);

    if (Array.isArray(payload.topStrikes) && payload.topStrikes.length) {
      const serverTop = payload.topStrikes
        .map((r) => ({
          strike: Number(r.strike),
          call: Number(r.call) || 0,
          put: Number(r.put) || 0,
          callOi: Number(r.callOi) || 0,
          putOi: Number(r.putOi) || 0,
          totalOi: Number(r.totalOi) || 0,
          total: Number(r.total) || 0,
        }))
        .filter((r) => Number.isFinite(r.strike) && r.strike > 0);
      if (serverTop.length) topStrikes = serverTop;
    }
    if (Number.isFinite(Number(payload.maxPainStrike)) && Number(payload.maxPainStrike) > 0) {
      maxPainStrike = Number(payload.maxPainStrike);
    }

    const topOiStrikes = [...topStrikes]
      .sort((a, b) => b.totalOi - a.totalOi)
      .slice(0, 10);

    const dvolRaw = parseFloat(payload.dvol);
    const dvol = Number.isFinite(dvolRaw) && dvolRaw > 0
      ? (dvolRaw > 3 ? dvolRaw / 100 : dvolRaw)
      : null;
    const atmDte = nearestExpiry ? daysToExpiry(nearestExpiry) : null;
    return {
      indexPrice,
      atmIv,
      atmIvLabel: nearestExpiry
        ? `Deribit ATM mark IV · nearest expiry ${expiryLabel(nearestExpiry)} · ${atmDte.toFixed(0)}d`
        : "Deribit ATM mark IV · nearest expiry",
      dvol,
      dvolLabel: "Deribit DVOL · 30d vol index",
      ivHigh,
      ivLow,
      skew25,
      nearestExpiry,
      smileExpiry,
      ivTerm,
      smileOpts,
      topStrikes,
      topOiStrikes,
      maxPainStrike,
      pcRatio,
      callVol,
      putVol,
      callOi,
      putOi,
      totalOi: callOi + putOi,
      fetchedAt: new Date().toISOString(),
      source: payload.source || "Deribit",
    };
}

async function loadOptionsData() {
  const swr = window.DashboardSWR;
  if (!swr) return;
  const volUpdate = dxEl("options-vol-update");
  const oiUpdate = dxEl("options-oi-update");

  try {
    await swr.runSWR({
      key: "derivatives:options",
      l1: "derivatives",
      source: "Deribit BTC",
      fetch: fetchOptionsBundle,
      render: (data, opts = {}) => {
        if (opts.loading) {
          if (volUpdate) volUpdate.textContent = "Loading…";
          if (oiUpdate) oiUpdate.textContent = "Loading…";
          return;
        }
        optionsData = data;
        renderOptionsVolScreen();
        renderOptionsOiScreen();
        const stamp = swr.formatPanelMeta({
          fetchedAt: data.fetchedAt,
          source: "Deribit BTC",
          stale: opts.stale,
          refreshing: opts.refreshing,
          refreshFailed: opts.refreshFailed,
        });
        if (volUpdate) volUpdate.textContent = stamp;
        if (oiUpdate) oiUpdate.textContent = stamp;
        const optionsVisible = document.querySelector(
          '#dashboard-derivatives .menu-screen[data-l2="options"]:not([hidden])',
        );
        if (optionsVisible) {
          swr.setHeaderStamp("derivatives", {
            fetchedAt: data.fetchedAt,
            source: data.source || "Deribit",
            stale: opts.stale,
            refreshing: opts.refreshing,
            refreshFailed: opts.refreshFailed,
          });
        }
      },
    });
  } catch (err) {
    console.error("Options load failed:", err);
    if (!optionsData) {
      if (volUpdate) volUpdate.textContent = "Unavailable";
      if (oiUpdate) oiUpdate.textContent = "Unavailable";
    }
  }
}

function renderOptionsVolScreen() {
  if (!optionsData) return;
  const d = optionsData;

  const set = (id, val) => {
    const node = dxEl(id);
    if (node) node.textContent = val;
  };

  set("opt-iv-index", fmtIv(d.atmIv));
  const atmSub = dxEl("opt-iv-atm-sub") || document.querySelector('[data-help-key="opt-atm-iv"]')?.parentElement?.querySelector(".deriv-hero-sub");
  if (atmSub) atmSub.textContent = d.atmIvLabel || "Deribit ATM mark IV · nearest expiry";
  const dvolEl = dxEl("opt-dvol");
  if (dvolEl) dvolEl.textContent = fmtIv(d.dvol);
  const dvolSub = dxEl("opt-dvol-sub");
  if (dvolSub) dvolSub.textContent = d.dvolLabel || "Deribit DVOL · 30d";
  set(
    "opt-iv-skew",
    d.skew25 != null
      ? (d.skew25 >= 0 ? "+" : "") + d.skew25.toFixed(1) + " vol pts"
      : "—",
  );
  set(
    "opt-iv-range",
    d.ivLow && d.ivHigh ? fmtIv(d.ivLow) + " – " + fmtIv(d.ivHigh) : "—",
  );
  set("opt-iv-expiry", d.nearestExpiry ? expiryLabel(d.nearestExpiry) : "—");

  const spotSub = dxEl("opt-iv-spot-sub");
  if (spotSub) {
    const spotPx = Number(d.indexPrice);
    spotSub.textContent = Number.isFinite(spotPx) && spotPx > 0
      ? "Spot $" + dxFmtPrice(spotPx, 0) + " · Deribit"
      : "Deribit BTC";
  }

  const smileMeta = dxEl("options-smile-meta");
  if (smileMeta && d.smileExpiry) {
    smileMeta.textContent =
      expiryLabel(d.smileExpiry) +
      " · mark IV · calls green · puts red";
  }

  drawIvTermChart(d.ivTerm);
  drawVolSmileChart(d.smileOpts, d.indexPrice);
}

function renderOptionsOiScreen() {
  if (!optionsData) return;
  const d = optionsData;

  const set = (id, val, cls) => {
    const node = dxEl(id);
    if (!node) return;
    node.textContent = val;
    if (cls) node.className = cls;
  };

  set(
    "opt-pc-ratio",
    d.pcRatio != null ? d.pcRatio.toFixed(2) : "—",
    d.pcRatio > 1 ? "deriv-hero-value negative" : "deriv-hero-value positive",
  );
  set(
    "opt-max-pain",
    fmtStrike(d.maxPainStrike),
  );
  set("opt-total-oi", fmtVol(d.totalOi) + " contracts");
  set("opt-total-vol", fmtVol(d.callVol + d.putVol) + " contracts");

  const pcSub = dxEl("opt-pc-sub");
  if (pcSub) {
    pcSub.textContent =
      "OI P " +
      fmtVol(d.putOi) +
      " · C " +
      fmtVol(d.callOi) +
      " · vol " +
      fmtVol(d.putVol + d.callVol);
  }
  const painSub = dxEl("opt-max-pain-sub");
  if (painSub) {
    painSub.textContent = d.nearestExpiry
      ? expiryLabel(d.nearestExpiry) + " · OI-weighted"
      : "—";
  }

  const tbody = dxEl("options-strikes-body");
  if (tbody) {
    if (!d.topStrikes?.length) {
      tbody.innerHTML = '<tr><td colspan="5">No strike OI in this snapshot</td></tr>';
    } else {
      tbody.innerHTML = d.topStrikes
        .map(
          (r) => `<tr>
        <td class="mono">${fmtStrike(r.strike)}</td>
        <td class="mono positive">${fmtVol(r.callOi)}</td>
        <td class="mono negative">${fmtVol(r.putOi)}</td>
        <td class="mono">${fmtVol(r.totalOi)}</td>
        <td class="mono">${fmtVol(r.total)}</td>
      </tr>`,
        )
        .join("");
    }
  }

  drawStrikeVolChart(d.topStrikes, d.indexPrice);
  drawOiStrikeChart(d.topOiStrikes, d.indexPrice);
}

function drawIvTermChart(term) {
  const canvas = dxEl("options-iv-term-chart");
  if (!canvas) return;
  const valid = term.filter((t) => t.atmIv);
  if (!valid.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 18, right: 20, bottom: 36, left: 48 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const maxDays = Math.max(...valid.map((t) => t.days), 1);
  const ivVals = valid.map((t) => t.atmIv * 100);
  const minIv = Math.min(...ivVals) * 0.9;
  const maxIv = Math.max(...ivVals) * 1.1;
  const range = maxIv - minIv || 1;

  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2;
  ctx.beginPath();
  valid.forEach((t, i) => {
    const x = pad.left + (t.days / maxDays) * chartW;
    const y = pad.top + chartH - ((t.atmIv * 100 - minIv) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  valid.forEach((t) => {
    const x = pad.left + (t.days / maxDays) * chartW;
    const y = pad.top + chartH - ((t.atmIv * 100 - minIv) / range) * chartH;
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.textAlign = "right";
  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.fillText(maxIv.toFixed(0) + "%", pad.left - 6, pad.top + 10);
  ctx.fillText(minIv.toFixed(0) + "%", pad.left - 6, h - pad.bottom);
  drawTimeAxisLabels(ctx, w, h, pad, valid.length, (i) =>
    fmtChartDate(valid[i].expiry),
  );
}

function drawVolSmileChart(opts, spot) {
  const canvas = dxEl("options-smile-chart");
  if (!canvas || !opts.length) return;

  const step = Math.max(1, Math.floor(opts.length / 50));
  const sampled = opts.filter((_, i) => i % step === 0);
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 18, right: 20, bottom: 36, left: 52 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const strikes = sampled.map((o) => o.strike);
  const minK = Math.min(...strikes);
  const maxK = Math.max(...strikes);
  const ivVals = sampled.map((o) => o.markIv * 100);
  const minIv = Math.min(...ivVals) * 0.95;
  const maxIv = Math.max(...ivVals) * 1.05;
  const range = maxIv - minIv || 1;

  if (spot && maxK > minK) {
    const spotX = pad.left + ((spot - minK) / (maxK - minK)) * chartW;
    ctx.strokeStyle = "rgba(240, 185, 11, 0.4)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(spotX, pad.top);
    ctx.lineTo(spotX, h - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  sampled.forEach((o) => {
    const x = pad.left + ((o.strike - minK) / (maxK - minK)) * chartW;
    const y = pad.top + chartH - ((o.markIv * 100 - minIv) / range) * chartH;
    ctx.fillStyle =
      o.side === "C" ? "rgba(14, 203, 129, 0.7)" : "rgba(246, 70, 93, 0.7)";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#7d8799";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "center";
  ctx.fillText(fmtStrike(minK), pad.left, h - 8);
  ctx.fillText(fmtStrike(maxK), w - pad.right, h - 8);
}

function drawDeliveryOiChart(contracts) {
  const canvas = dxEl("delivery-oi-chart");
  if (!canvas) return;

  const rows = contracts
    .filter((c) => c.openInterest != null && c.openInterest > 0)
    .map((c) => ({
      label: dxShortOiLabel(c),
      oi: c.openInterest,
      margin: c.margin,
    }))
    .sort((a, b) => b.oi - a.oi);

  if (!rows.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 16, right: 72, bottom: 28, left: 128 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const co = window.ChartOutlier;
  const values = rows.map((r) => r.oi);
  const outlier = co?.isBarOutlier(values);
  const outlierIdx = outlier ? co.findOutlierIndex(rows, (r) => r.oi) : -1;
  const scaleMax = co?.barScaleMax(values, outlier) ?? Math.max(...values, 0.001);
  const barH = chartH / rows.length;
  const bodyH = Math.max(barH * 0.65, 8);

  rows.forEach((r, i) => {
    const y = pad.top + i * barH + (barH - bodyH) / 2;
    const color = String(r.margin || "").toUpperCase().startsWith("COIN")
      ? "rgba(251, 191, 36, 0.75)"
      : "rgba(14, 203, 129, 0.75)";
    let valueX;

    const barW = outlier && i === outlierIdx ? chartW * 0.92 : (r.oi / scaleMax) * chartW;
    ctx.fillStyle = color;
    ctx.fillRect(pad.left, y, barW, bodyH);
    valueX = pad.left + barW;

    ctx.fillStyle = "#7d8799";
    ctx.font = "12px IBM Plex Mono, monospace";
    ctx.textAlign = "right";
    ctx.fillText(r.label, pad.left - 8, y + bodyH / 2 + 4);
    ctx.textAlign = "left";
    ctx.fillText(fmtVol(r.oi) + " BTC", Math.min(valueX + 6, w - pad.right), y + bodyH / 2 + 4);
  });
}

function drawStrikeVolChart(topStrikes, spot) {
  const canvas = dxEl("options-strike-chart");
  if (!canvas || !topStrikes.length) return;

  const ordered = [...topStrikes].sort((a, b) => Number(a.strike) - Number(b.strike));
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 16, right: 16, bottom: 32, left: 88 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const co = window.ChartOutlier;
  const totals = ordered.map((r) => r.total);
  const outlier = co?.isBarOutlier(totals);
  const outlierIdx = outlier ? co.findOutlierIndex(ordered, (r) => r.total) : -1;
  const scaleMax = co?.barScaleMax(totals, outlier) ?? Math.max(...totals, 0.001);
  const barH = chartH / ordered.length;
  const bodyH = Math.max(barH * 0.7, 6);
  const halfW = chartW * 0.45;
  const mid = pad.left + chartW / 2;

  ordered.forEach((r, i) => {
    const y = pad.top + i * barH + (barH - bodyH) / 2;

    if (outlier && i === outlierIdx) {
      const span = halfW * 2 * 0.92;
      const callW = r.total > 0 ? (r.call / r.total) * span * 0.5 : 0;
      const putW = r.total > 0 ? (r.put / r.total) * span * 0.5 : 0;
      ctx.fillStyle = "rgba(14, 203, 129, 0.75)";
      ctx.fillRect(mid - callW, y, callW, bodyH);
      ctx.fillStyle = "rgba(246, 70, 93, 0.75)";
      ctx.fillRect(mid, y, putW, bodyH);
      drawAxisBreakOnDivergingWing(ctx, mid - callW, mid + putW, y, bodyH, callW >= putW);
    } else {
      const callW = (r.call / scaleMax) * halfW;
      const putW = (r.put / scaleMax) * halfW;
      ctx.fillStyle = "rgba(14, 203, 129, 0.75)";
      ctx.fillRect(mid - callW, y, callW, bodyH);
      ctx.fillStyle = "rgba(246, 70, 93, 0.75)";
      ctx.fillRect(mid, y, putW, bodyH);
    }

    ctx.fillStyle = "#7d8799";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.textAlign = "right";
    ctx.fillText(fmtStrike(r.strike), pad.left - 6, y + bodyH / 2 + 3);
  });
}

function drawAxisBreakOnDivergingWing(ctx, left, right, y, bodyH, breakOnCall) {
  const co = window.ChartOutlier;
  if (!co) return;
  if (breakOnCall) {
    co.drawAxisBreakZigzag(ctx, left + 4, y, bodyH, false);
  } else {
    co.drawAxisBreakZigzag(ctx, right - 10, y, bodyH, false);
  }
}

function drawOiStrikeChart(topStrikes, spot) {
  const canvas = dxEl("options-oi-strike-chart");
  if (!canvas || !topStrikes.length) return;

  const ordered = [...topStrikes].sort((a, b) => Number(a.strike) - Number(b.strike));
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  // A hidden panel reports 0×0. Writing that onto the canvas clears its height attribute.
  if (rect.width < 2 || rect.height < 2) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 16, right: 16, bottom: 32, left: 88 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const co = window.ChartOutlier;
  const totals = ordered.map((r) => r.totalOi);
  const outlier = co?.isBarOutlier(totals);
  const outlierIdx = outlier ? co.findOutlierIndex(ordered, (r) => r.totalOi) : -1;
  const scaleMax = co?.barScaleMax(totals, outlier) ?? Math.max(...totals, 0.001);
  const barH = chartH / ordered.length;
  const bodyH = Math.max(barH * 0.7, 6);
  const halfW = chartW * 0.45;
  const mid = pad.left + chartW / 2;

  ordered.forEach((r, i) => {
    const y = pad.top + i * barH + (barH - bodyH) / 2;

    if (outlier && i === outlierIdx) {
      const span = halfW * 2 * 0.92;
      const callW = r.totalOi > 0 ? (r.callOi / r.totalOi) * span * 0.5 : 0;
      const putW = r.totalOi > 0 ? (r.putOi / r.totalOi) * span * 0.5 : 0;
      ctx.fillStyle = "rgba(14, 203, 129, 0.75)";
      ctx.fillRect(mid - callW, y, callW, bodyH);
      ctx.fillStyle = "rgba(246, 70, 93, 0.75)";
      ctx.fillRect(mid, y, putW, bodyH);
      drawAxisBreakOnDivergingWing(ctx, mid - callW, mid + putW, y, bodyH, callW >= putW);
    } else {
      const callW = (r.callOi / scaleMax) * halfW;
      const putW = (r.putOi / scaleMax) * halfW;
      ctx.fillStyle = "rgba(14, 203, 129, 0.75)";
      ctx.fillRect(mid - callW, y, callW, bodyH);
      ctx.fillStyle = "rgba(246, 70, 93, 0.75)";
      ctx.fillRect(mid, y, putW, bodyH);
    }

    ctx.fillStyle = "#7d8799";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.textAlign = "right";
    ctx.fillText(fmtStrike(r.strike), pad.left - 6, y + bodyH / 2 + 3);
  });
}

function startDeliveryPoll() {
  if (deliveryTimer) return;
  deliveryTimer = setInterval(loadDeliveryFutures, DELIVERY_POLL_MS);
}

function startOptionsPoll() {
  if (optionsTimer) return;
  optionsTimer = setInterval(loadOptionsData, OPTIONS_POLL_MS);
}

function loadDerivativesExtra() {
  loadDeliveryFutures();
  loadOptionsData();
  startDeliveryPoll();
  startOptionsPoll();
}

function initDerivativesExtra() {
  if (derivativesExtraReady) return;
  derivativesExtraReady = true;
  window.addEventListener("resize", () => {
    if (deliveryData) {
      drawDeliveryCurveChart(deliveryData.curvePoints);
      drawDeliveryOiChart([deliveryData.perp, ...deliveryData.contracts, ...(deliveryData.coinContracts || [])]);
    }
    if (optionsData) {
      drawIvTermChart(optionsData.ivTerm);
      drawVolSmileChart(optionsData.smileOpts, optionsData.indexPrice);
      drawStrikeVolChart(optionsData.topStrikes, optionsData.indexPrice);
      drawOiStrikeChart(optionsData.topOiStrikes, optionsData.indexPrice);
    }
  });
}

window.refreshDeliveryCurve = function () {
  if (deliveryData) {
    drawDeliveryCurveChart(deliveryData.curvePoints);
    drawDeliveryOiChart([deliveryData.perp, ...deliveryData.contracts, ...(deliveryData.coinContracts || [])]);
  } else loadDeliveryFutures();
};

window.refreshOptionsVolCharts = function () {
  if (optionsData) {
    drawIvTermChart(optionsData.ivTerm);
    drawVolSmileChart(optionsData.smileOpts, optionsData.indexPrice);
  } else loadOptionsData();
};

async function loadLiquidations() {
  const body = document.getElementById("liq-body");
  const meta = document.getElementById("liq-update");
  try {
    const res = await fetch("/api/market/liquidations", { cache: "no-store" });
    const data = await res.json();
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (meta) {
      meta.textContent = `${data.venue || "OKX"}${data.fetchedAt ? " · " + data.fetchedAt : ""}`;
    }
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6">${data.error || "No recent filled liquidations."}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((r) => {
      const t = r.time ? new Date(r.time).toISOString().slice(5, 16).replace("T", " ") : "—";
      const side = [r.side, r.posSide].filter(Boolean).join(" · ");
      const btc = Number.isFinite(Number(r.btc)) ? Number(r.btc).toFixed(4) : "—";
      const notional = Number.isFinite(Number(r.notional)) ? "$" + dxFmtPrice(r.notional, 0) : "—";
      return `<tr>
        <td class="mono">${t}</td>
        <td>${r.instId || "—"}</td>
        <td>${side || "—"}</td>
        <td class="mono">${dxFmtPrice(r.price)}</td>
        <td class="mono">${btc}</td>
        <td class="mono">${notional}</td>
      </tr>`;
    }).join("");
  } catch (_) {
    if (body) body.innerHTML = '<tr><td colspan="6">Liquidations unavailable</td></tr>';
  }
}

window.loadLiquidations = loadLiquidations;

window.refreshOptionsOiCharts = function () {
  if (optionsData) {
    drawStrikeVolChart(optionsData.topStrikes, optionsData.indexPrice);
    drawOiStrikeChart(optionsData.topOiStrikes, optionsData.indexPrice);
  } else loadOptionsData();
};

initDerivativesExtra();