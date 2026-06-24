const FAPI = "https://fapi.binance.com";
const DAPI = "https://dapi.binance.com";
const OPTIONS_API = "/api/options";

const DELIVERY_POLL_MS = 60_000;
const OPTIONS_POLL_MS = 120_000;

let deliveryData = null;
let optionsData = null;
let deliveryTimer = null;
let optionsTimer = null;
let derivativesExtraReady = false;

const dxEl = (id) => document.getElementById(id);

function fmtPrice(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
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
  const deribit = symbol.match(/^BTC-(\d{1,2})([A-Z]{3})(\d{2})-(\d+)-(C|P)$/);
  if (deribit) {
    const mon = MONTHS[deribit[2]];
    if (mon == null) return null;
    return {
      symbol,
      expiry: Date.UTC(2000 + parseInt(deribit[3], 10), mon, parseInt(deribit[1], 10)),
      strike: parseInt(deribit[4], 10),
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

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.json();
}

async function fetchDeliveryBundle() {
    const [exchange, tickers, marks, perpTicker] = await Promise.all([
      fetchJson(`${FAPI}/fapi/v1/exchangeInfo`),
      fetchJson(`${FAPI}/fapi/v1/ticker/24hr`),
      fetchJson(`${FAPI}/fapi/v1/premiumIndex`),
      fetchJson(`${FAPI}/fapi/v1/ticker/24hr?symbol=BTCUSDT`),
    ]);

    const tickerMap = Object.fromEntries(tickers.map((t) => [t.symbol, t]));
    const markMap = Object.fromEntries(marks.map((m) => [m.symbol, m]));

    const perpMark = markMap.BTCUSDT;
    const indexPrice = perpMark ? parseFloat(perpMark.indexPrice) : null;

    const contracts = exchange.symbols
      .filter(
        (s) =>
          s.pair === "BTCUSDT" &&
          s.status === "TRADING" &&
          s.contractType !== "PERPETUAL",
      )
      .map((s) => {
        const t = tickerMap[s.symbol] || {};
        const m = markMap[s.symbol] || {};
        const mark = parseFloat(m.markPrice || t.lastPrice || 0);
        const index = parseFloat(m.indexPrice || indexPrice || mark);
        const basis = index ? ((mark - index) / index) * 100 : 0;
        const dte = daysToExpiry(s.deliveryDate);
        return {
          symbol: s.symbol,
          type: s.contractType.replace(/_/g, " "),
          deliveryDate: s.deliveryDate,
          daysToExpiry: dte,
          last: parseFloat(t.lastPrice || mark),
          mark,
          index,
          basisPct: basis,
          annBasisPct: (basis / dte) * 365,
          volume: parseFloat(t.volume || 0),
          quoteVolume: parseFloat(t.quoteVolume || 0),
          margin: "USDT-M",
        };
      })
      .sort((a, b) => a.deliveryDate - b.deliveryDate);

    let coinContracts = [];
    try {
      const [dEx, dTickers, dMarks] = await Promise.all([
        fetchJson(`${DAPI}/dapi/v1/exchangeInfo`),
        fetchJson(`${DAPI}/dapi/v1/ticker/24hr`),
        fetchJson(`${DAPI}/dapi/v1/premiumIndex`),
      ]);
      const dTickerMap = Object.fromEntries(dTickers.map((t) => [t.symbol, t]));
      const dMarkMap = Object.fromEntries(dMarks.map((m) => [m.symbol, m]));
      coinContracts = dEx.symbols
        .filter(
          (s) =>
            s.pair === "BTCUSD" &&
            s.status === "TRADING" &&
            s.contractType !== "PERPETUAL",
        )
        .map((s) => {
          const t = dTickerMap[s.symbol] || {};
          const m = dMarkMap[s.symbol] || {};
          const mark = parseFloat(m.markPrice || t.lastPrice || 0);
          const index = parseFloat(m.indexPrice || indexPrice || mark);
          const basis = index ? ((mark - index) / index) * 100 : 0;
          const dte = daysToExpiry(s.deliveryDate);
          return {
            symbol: s.symbol,
            type: s.contractType.replace(/_/g, " "),
            deliveryDate: s.deliveryDate,
            daysToExpiry: dte,
            last: parseFloat(t.lastPrice || mark),
            mark,
            index,
            basisPct: basis,
            annBasisPct: (basis / dte) * 365,
            volume: parseFloat(t.volume || 0),
            quoteVolume: parseFloat(t.baseVolume || 0) * mark,
            margin: "COIN-M",
          };
        });
    } catch (_) {
      coinContracts = [];
    }

    const oiSymbols = ["BTCUSDT", ...contracts.map((c) => c.symbol)];
    const oiRows = await Promise.all(
      oiSymbols.map(async (sym) => {
        try {
          const oi = await fetchJson(
            `${FAPI}/fapi/v1/openInterest?symbol=${sym}`,
          );
          return { symbol: sym, oi: parseFloat(oi.openInterest) };
        } catch {
          return { symbol: sym, oi: null };
        }
      }),
    );
    const oiMap = Object.fromEntries(oiRows.map((r) => [r.symbol, r.oi]));

    contracts.forEach((c) => {
      c.openInterest = oiMap[c.symbol];
    });

    const perp = {
      symbol: "BTCUSDT",
      type: "PERPETUAL",
      deliveryDate: null,
      daysToExpiry: 0,
      last: parseFloat(perpTicker.lastPrice),
      mark: parseFloat(perpMark?.markPrice || perpTicker.lastPrice),
      index: indexPrice,
      basisPct: 0,
      annBasisPct: 0,
      volume: parseFloat(perpTicker.volume),
      quoteVolume: parseFloat(perpTicker.quoteVolume),
      openInterest: oiMap.BTCUSDT ?? null,
      margin: "USDT-M",
    };

    return {
      indexPrice,
      perp,
      contracts,
      coinContracts,
      curvePoints: [
        { label: "Perp", days: 0, basis: 0, annBasis: 0 },
        ...contracts.map((c) => ({
          label: c.symbol.replace("BTCUSDT_", ""),
          days: c.daysToExpiry,
          basis: c.basisPct,
          annBasis: c.annBasisPct,
        })),
      ],
      fetchedAt: new Date().toISOString(),
    };
}

async function loadDeliveryFutures() {
  const swr = window.DashboardSWR;
  if (!swr) return;
  const updateEl = dxEl("delivery-update");

  try {
    await swr.runSWR({
      key: "derivatives:delivery",
      l1: "derivatives",
      source: "Binance",
      fetch: fetchDeliveryBundle,
      render: (data, opts = {}) => {
        if (opts.loading) {
          if (updateEl) updateEl.textContent = "Loading…";
          return;
        }
        deliveryData = data;
        renderDeliveryScreen();
        if (updateEl) {
          updateEl.textContent = swr.formatPanelMeta({
            fetchedAt: data.fetchedAt,
            source: "Binance",
            stale: opts.stale,
            refreshing: opts.refreshing,
            refreshFailed: opts.refreshFailed,
          });
        }
      },
    });
  } catch (err) {
    console.error("Delivery futures load failed:", err);
    if (updateEl && !deliveryData) updateEl.textContent = "Unavailable";
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

  set("delivery-index", indexPrice ? "$" + fmtPrice(indexPrice) : "—");
  set("delivery-perp", "$" + fmtPrice(perp.last));
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
    const rows = [perp, ...contracts, ...deliveryData.coinContracts];
    tbody.innerHTML = rows
      .map((c) => {
        const basisCls = c.basisPct >= 0 ? "positive" : "negative";
        const exp = c.deliveryDate
          ? expiryLabel(c.deliveryDate) + " (" + c.daysToExpiry.toFixed(0) + "d)"
          : "—";
        return `<tr>
          <td class="mono">${c.symbol}</td>
          <td>${c.margin}</td>
          <td>${c.type}</td>
          <td>${exp}</td>
          <td class="mono">$${fmtPrice(c.last)}</td>
          <td class="mono">$${fmtPrice(c.mark)}</td>
          <td class="mono ${basisCls}">${fmtPct(c.basisPct, 3)}</td>
          <td class="mono ${basisCls}">${c.daysToExpiry ? fmtPct(c.annBasisPct, 2) : "—"}</td>
          <td class="mono">${c.openInterest != null ? fmtVol(c.openInterest) + " BTC" : "—"}</td>
          <td class="mono">${fmtVol(c.volume)}</td>
        </tr>`;
      })
      .join("");
  }

  drawDeliveryCurveChart(curvePoints);
  drawDeliveryOiChart([perp, ...contracts]);
}

function drawDeliveryCurveChart(points) {
  const canvas = dxEl("delivery-curve-chart");
  if (!canvas || !points.length) return;

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

  const curvePts = points.filter((p) => p.days >= 0);
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
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(fmtPct(maxAbs, 1), pad.left - 6, pad.top + 10);
  ctx.fillText(fmtPct(-maxAbs, 1), pad.left - 6, h - pad.bottom);
  ctx.textAlign = "center";
  curvePts.forEach((p) => {
    const x = pad.left + (p.days / maxDays) * chartW;
    ctx.fillText(p.label, x, h - 8);
  });
}

async function fetchOptionsBundle() {
    const payload = await fetchJson(OPTIONS_API);
    const contracts = payload.contracts || [];
    const indexPrice = parseFloat(
      payload.index?.index_price || payload.index?.indexPrice || 0,
    );

    const chain = contracts
      .map((c) => {
        const parsed = parseOptionSymbol(c.instrument_name || c.symbol || "");
        if (!parsed) return null;
        const iv = parseFloat(c.mark_iv);
        return {
          ...parsed,
          markIv: iv > 0 && iv < 300 ? iv / 100 : null,
          markPrice: parseFloat(c.mark_price || 0),
          volume: parseFloat(c.volume || 0),
          openInterest: parseFloat(c.open_interest || 0),
        };
      })
      .filter(Boolean);

    const byExpiry = {};
    chain.forEach((o) => {
      if (!byExpiry[o.expiry]) byExpiry[o.expiry] = [];
      byExpiry[o.expiry].push(o);
    });

    const expiries = Object.keys(byExpiry)
      .map(Number)
      .sort((a, b) => a - b)
      .filter((e) => e > Date.now());

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

    const nearestExpiry = expiries[0];
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
    const painOpts = byExpiry[nearestExpiry] || [];
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

    const topStrikes = strikes
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

    const topOiStrikes = [...topStrikes]
      .sort((a, b) => b.totalOi - a.totalOi)
      .slice(0, 10);

    return {
      indexPrice,
      atmIv,
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
    spotSub.textContent = d.indexPrice
      ? "Spot $" + fmtPrice(d.indexPrice, 0) + " · Deribit"
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
    d.maxPainStrike ? "$" + fmtPrice(d.maxPainStrike, 0) : "—",
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
    tbody.innerHTML = d.topStrikes
      .map(
        (r) => `<tr>
        <td class="mono">$${fmtPrice(r.strike, 0)}</td>
        <td class="mono positive">${fmtVol(r.callOi)}</td>
        <td class="mono negative">${fmtVol(r.putOi)}</td>
        <td class="mono">${fmtVol(r.totalOi)}</td>
        <td class="mono">${fmtVol(r.total)}</td>
      </tr>`,
      )
      .join("");
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
  ctx.fillText(fmtPrice(minK, 0), pad.left, h - 8);
  ctx.fillText(fmtPrice(maxK, 0), w - pad.right, h - 8);
}

function drawDeliveryOiChart(contracts) {
  const canvas = dxEl("delivery-oi-chart");
  if (!canvas) return;

  const rows = contracts
    .filter((c) => c.openInterest != null && c.openInterest > 0)
    .map((c) => ({
      label: c.type === "PERPETUAL" ? "Perp" : c.symbol.replace(/BTCUSDT_|BTCUSD_/g, ""),
      oi: c.openInterest,
      margin: c.margin,
    }))
    .sort((a, b) => b.oi - a.oi);

  if (!rows.length) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 16, right: 16, bottom: 32, left: 56 };
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
    const color = r.margin === "COIN-M" ? "rgba(251, 191, 36, 0.75)" : "rgba(14, 203, 129, 0.75)";
    let valueX;

    if (outlier && i === outlierIdx) {
      valueX = co.drawBrokenHBar(ctx, {
        x0: pad.left,
        y,
        bodyH,
        chartW,
        colorStart: color,
        colorEnd: color,
      });
    } else {
      const barW = (r.oi / scaleMax) * chartW;
      ctx.fillStyle = color;
      ctx.fillRect(pad.left, y, barW, bodyH);
      valueX = pad.left + barW;
    }

    ctx.fillStyle = "#7d8799";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.textAlign = "right";
    ctx.fillText(r.label, pad.left - 6, y + bodyH / 2 + 3);
    ctx.textAlign = "left";
    ctx.fillText(fmtVol(r.oi) + " BTC", valueX + 6, y + bodyH / 2 + 3);
  });
}

function drawStrikeVolChart(topStrikes, spot) {
  const canvas = dxEl("options-strike-chart");
  if (!canvas || !topStrikes.length) return;

  const ordered = [...topStrikes].reverse();
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 16, right: 16, bottom: 32, left: 56 };
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
    ctx.fillText("$" + fmtPrice(r.strike, 0), pad.left - 6, y + bodyH / 2 + 3);
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

  const ordered = [...topStrikes].reverse();
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 16, right: 16, bottom: 32, left: 56 };
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
    ctx.fillText("$" + fmtPrice(r.strike, 0), pad.left - 6, y + bodyH / 2 + 3);
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
      drawDeliveryOiChart([deliveryData.perp, ...deliveryData.contracts]);
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
    drawDeliveryOiChart([deliveryData.perp, ...deliveryData.contracts]);
  } else loadDeliveryFutures();
};

window.refreshOptionsVolCharts = function () {
  if (optionsData) {
    drawIvTermChart(optionsData.ivTerm);
    drawVolSmileChart(optionsData.smileOpts, optionsData.indexPrice);
  } else loadOptionsData();
};

window.refreshOptionsOiCharts = function () {
  if (optionsData) {
    drawStrikeVolChart(optionsData.topStrikes, optionsData.indexPrice);
    drawOiStrikeChart(optionsData.topOiStrikes, optionsData.indexPrice);
  } else loadOptionsData();
};

initDerivativesExtra();