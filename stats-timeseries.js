/**
 * Stats → Time Series — price forecasting suite UI.
 * Fetches /api/stats/timeseries
 */

const TS_API = "/api/stats/timeseries";

let tsSuite = null;
let tsSelectedId = null;
let tsBusy = false;

const tsEl = (id) => document.getElementById(id);

function tsEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tsFmtPx(x, d = 0) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  const n = Number(x);
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: d });
  return n.toFixed(Math.max(d, 2));
}

function tsFmtRet(x, d = 2) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  return `${(Number(x) * 100).toFixed(d)}%`;
}

function tsFmtNum(x, d = 4) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  const n = Number(x);
  if (Math.abs(n) >= 1000) return n.toFixed(2);
  if (Math.abs(n) < 1e-4 && n !== 0) return n.toExponential(2);
  return n.toFixed(d);
}

function tsTipTitle(t) {
  return window.chartTipTitle?.(t) || `<div class="chart-tip-title">${tsEscape(t)}</div>`;
}
function tsTipRow(k, v) {
  return window.chartTipRow?.(k, v) || `<div>${tsEscape(k)}: ${tsEscape(v)}</div>`;
}
function tsMountChart(id, opts) {
  if (typeof window.mountStatsChart === "function") {
    return window.mountStatsChart(id, opts);
  }
  return null;
}

function tsBtH(m, h, key) {
  const v = m?.backtest?.horizons?.[String(h)]?.[key];
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

function tsHitLeaderName(suite, h) {
  const s = suite.summary || {};
  const key = h === 1 ? "bestHit1Name" : h === 7 ? "bestHit7Name" : "bestHit30Name";
  const idKey = h === 1 ? "bestByHit1d" : h === 7 ? "bestByHit7d" : "bestByHit30d";
  return s[key] || suite.models?.find((m) => m.id === suite[idKey])?.name || null;
}

function tsEnsureSelection(suite) {
  if (!suite || suite.selection?.selectedId || suite.selection?.selectedName) return suite;
  const ok = (suite.models || []).filter((m) => m.status === "ok");
  if (!ok.length) return suite;
  const scored = ok
    .map((m) => ({
      m,
      hit7: tsBtH(m, 7, "dirHitRate"),
      hit1: tsBtH(m, 1, "dirHitRate"),
      hit30: tsBtH(m, 30, "dirHitRate"),
      rmse7: tsBtH(m, 7, "rmseRet"),
      mae7: tsBtH(m, 7, "maeRet"),
      aic: m.aic != null ? Number(m.aic) : null,
      bic: m.bic != null ? Number(m.bic) : null,
    }))
    .filter((x) => x.hit7 != null || x.hit1 != null || x.hit30 != null);
  scored.sort((a, b) => {
    const keys = (x) => [
      -(x.hit7 ?? -1),
      -(x.hit1 ?? -1),
      -(x.hit30 ?? -1),
      x.rmse7 ?? 1e9,
      x.mae7 ?? 1e9,
      x.aic ?? 1e18,
      x.bic ?? 1e18,
    ];
    const ka = keys(a);
    const kb = keys(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  });
  const pick = scored[0]?.m || ok.find((m) => m.id === suite.bestByHit7d) || ok[0];
  if (!pick) return suite;
  const reasons = [
    "Client fallback selection (refresh suite for full server rationale).",
    "Primary: highest 7d OOS directional hit rate; ties → 1d/30d hit, RMSE, MAE, AIC, BIC.",
  ];
  const h7 = tsBtH(pick, 7, "dirHitRate");
  if (h7 != null) reasons.push(`Selected ${pick.name} with 7d hit ${(h7 * 100).toFixed(1)}%.`);
  const badges = [];
  if (pick.id === suite.bestByHit7d) badges.push("HIT7");
  if (pick.id === suite.bestByRmse7d) badges.push("RMSE7");
  if (pick.id === suite.bestByAic) badges.push("AIC");
  if (pick.id === suite.bestByBic) badges.push("BIC");
  suite.selection = {
    primaryCriterion: "dirHitRate",
    primaryHorizon: 7,
    rule: "Maximize OOS directional hit rate at 7d; break ties with 1d/30d hit, then lower 7d RMSE, MAE, AIC, BIC.",
    selectedId: pick.id,
    selectedName: pick.name,
    reasons,
    badges,
    metrics: {
      hit1: tsBtH(pick, 1, "dirHitRate"),
      hit7: h7,
      hit30: tsBtH(pick, 30, "dirHitRate"),
      rmse7: tsBtH(pick, 7, "rmseRet"),
      mae7: tsBtH(pick, 7, "maeRet"),
      aic: pick.aic,
      bic: pick.bic,
    },
    leaders: {
      hit1: suite.summary?.bestHit1Name,
      hit7: suite.summary?.bestHit7Name,
      hit30: suite.summary?.bestHit30Name,
      rmse7: suite.summary?.bestRmse7Name,
      aic: suite.summary?.bestAicName,
      bic: suite.summary?.bestBicName,
    },
  };
  if (!suite.summary) suite.summary = {};
  if (!suite.summary.bestModelId) suite.summary.bestModelId = pick.id;
  if (!suite.summary.bestModelName) suite.summary.bestModelName = pick.name;
  return suite;
}

function tsRenderSelectionWhy(suite) {
  const host = tsEl("ts-selection-why");
  const meta = tsEl("ts-selection-why-meta");
  if (!host) return;
  suite = tsEnsureSelection(suite);
  const sel = suite?.selection;
  const s = suite?.summary || {};
  if (!sel?.selectedName && !s.bestModelName) {
    host.innerHTML =
      `<p class="ts-selection-empty">Press <strong>Run all models</strong> to rank by directional hit rate and see why a model is selected.</p>`;
    if (meta) meta.textContent = "After estimation";
    return;
  }
  const name = sel?.selectedName || s.bestModelName || "—";
  const badges = (sel?.badges || []).map(
    (b) => `<span class="vol-badge ${tsBadgeClass(b)}">${tsEscape(b)}</span>`,
  );
  const reasons = sel?.reasons || [];
  const m = sel?.metrics || {};
  const leaders = sel?.leaders || {};
  const hitLine = [
    m.hit1 != null ? `1d ${(Number(m.hit1) * 100).toFixed(1)}%` : null,
    m.hit7 != null ? `7d ${(Number(m.hit7) * 100).toFixed(1)}%` : null,
    m.hit30 != null ? `30d ${(Number(m.hit30) * 100).toFixed(1)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  host.innerHTML = `
    <div class="ts-selection-head">
      <div class="ts-selection-pick">
        <span class="ts-selection-label">Selected desk mark</span>
        <strong class="ts-selection-name">${tsEscape(name)}</strong>
        ${badges.length ? `<div class="ts-selection-badges">${badges.join(" ")}</div>` : ""}
      </div>
      <div class="ts-selection-metrics mono">
        <div><span class="ts-sel-k">Hit rates</span> ${hitLine || "—"}</div>
        <div><span class="ts-sel-k">7d RMSE</span> ${m.rmse7 != null ? Number(m.rmse7).toFixed(4) : "—"}
          · <span class="ts-sel-k">MAE</span> ${m.mae7 != null ? Number(m.mae7).toFixed(4) : "—"}</div>
        <div><span class="ts-sel-k">AIC</span> ${m.aic != null ? Number(m.aic).toFixed(1) : "—"}
          · <span class="ts-sel-k">BIC</span> ${m.bic != null ? Number(m.bic).toFixed(1) : "—"}</div>
      </div>
    </div>
    <p class="ts-selection-rule"><strong>Rule:</strong> ${tsEscape(sel?.rule || s.selectionRule || "Maximize 7d OOS directional hit rate; ties → RMSE / MAE / AIC / BIC.")}</p>
    <ol class="ts-selection-reasons">
      ${reasons.map((r) => `<li>${tsEscape(r)}</li>`).join("")}
    </ol>
    <p class="ts-selection-leaders">
      <strong>Leaders by criterion:</strong>
      HIT 1d ${tsEscape(leaders.hit1 || "—")} ·
      HIT 7d ${tsEscape(leaders.hit7 || "—")} ·
      HIT 30d ${tsEscape(leaders.hit30 || "—")} ·
      RMSE 7d ${tsEscape(leaders.rmse7 || "—")} ·
      MAE 7d ${tsEscape(leaders.mae7 || "—")} ·
      AIC ${tsEscape(leaders.aic || "—")} ·
      BIC ${tsEscape(leaders.bic || "—")}.
    </p>`;
  if (meta) {
    meta.textContent = [
      sel?.primaryCriterion ? `primary: ${sel.primaryCriterion}@${sel.primaryHorizon || 7}d` : "",
      suite.asOf ? String(suite.asOf).replace("T", " ").slice(0, 16) + " UTC" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
}

function tsBadgeClass(code) {
  const c = String(code || "").toUpperCase();
  if (c.startsWith("HIT")) return "vol-badge--hit";
  if (c.startsWith("RMSE")) return "vol-badge--qlike";
  if (c.startsWith("MAE") || c.startsWith("MAPE")) return "vol-badge--mae";
  if (c === "AIC") return "vol-badge--aic";
  if (c === "BIC") return "vol-badge--bic";
  if (c === "BEST") return "vol-badge--best";
  return "";
}

function tsRenderKpis(suite) {
  const s = suite.summary || {};
  const set = (id, v) => {
    const el = tsEl(id);
    if (el) el.textContent = v;
  };
  set("ts-kpi-last", tsFmtPx(suite.lastPrice ?? s.lastPrice, 0));
  const sub = tsEl("ts-kpi-last-sub");
  if (sub) sub.textContent = suite.endDate ? `as of ${suite.endDate}` : "Sample end";

  set(
    "ts-kpi-fcast",
    `${tsFmtPx(s.forecast1d, 0)} / ${tsFmtPx(s.forecast7d, 0)} / ${tsFmtPx(s.forecast30d, 0)}`,
  );
  const fsub = tsEl("ts-kpi-fcast-sub");
  if (fsub) fsub.textContent = s.bestModelName ? s.bestModelName : "Hit-rate mark model";

  set(
    "ts-kpi-ret",
    `${tsFmtRet(s.return1d)} / ${tsFmtRet(s.return7d)} / ${tsFmtRet(s.return30d)}`,
  );

  // Best = directional hit leaders (primary accuracy focus)
  const mark = suite.selection?.selectedName || s.bestModelName || s.bestHit7Name || "—";
  set("ts-kpi-best", mark);
  const bsub = tsEl("ts-kpi-best-sub");
  if (bsub) {
    const h1 = tsHitLeaderName(suite, 1);
    const h7 = tsHitLeaderName(suite, 7);
    const h30 = tsHitLeaderName(suite, 30);
    const parts = [];
    if (h1) parts.push(`HIT1: ${h1}`);
    if (h7) parts.push(`HIT7: ${h7}`);
    if (h30) parts.push(`HIT30: ${h30}`);
    if (s.bestAicName) parts.push(`AIC: ${s.bestAicName}`);
    if (s.bestBicName) parts.push(`BIC: ${s.bestBicName}`);
    bsub.textContent = parts.length ? parts.join(" · ") : "OOS hit-rate leaders";
  }
  tsRenderSelectionWhy(suite);
  set("ts-kpi-macro", suite.macroAvailable ? "OK" : "Failed");
  const macroSub = document.querySelector("#ts-kpi-strip .deriv-hero-block:nth-child(5) .deriv-hero-sub");
  if (macroSub) {
    macroSub.textContent = suite.macroAvailable
      ? "SPX · DXY aligned"
      : (suite.macroError || "macro unavailable").slice(0, 48);
  }
  set(
    "ts-kpi-engine",
    `${suite.statsmodelsAvailable ? "sm" : "numpy"} · ${suite.yfinanceAvailable ? "yf" : "no-yf"}`,
  );

  const meta = tsEl("ts-suite-meta");
  if (meta) {
    meta.textContent = [
      suite.pair || "BTC/USD",
      suite.nObs != null ? `${suite.nObs} obs` : "",
      suite.fromCache ? "cached" : "fresh",
      suite.statsmodelsAvailable ? "statsmodels" : "numpy core",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const note = tsEl("ts-engine-note");
  if (note) {
    const warns = [];
    const info = [];
    if (!suite.statsmodelsAvailable) {
      warns.push(
        "statsmodels not installed — ARIMA/SARIMA/Holt-Winters use NumPy fallbacks. Install: pip install statsmodels",
      );
    }
    if (!suite.macroAvailable) {
      warns.push(
        suite.macroError ||
          suite.macroNote ||
          "Macro series unavailable — VAR/SVAR cannot run without SPX/DXY (yfinance).",
      );
    } else {
      info.push(
        suite.macroNote ||
          "VAR/SVAR loaded: BTC + equity + dollar daily log returns (OK).",
      );
    }
    if (suite.adfReturns?.pvalue != null) {
      const p = Number(suite.adfReturns.pvalue);
      const st = tsFmtNum(suite.adfReturns.stat, 2);
      if (p < 0.05) {
        // Good: reject unit root → returns are stationary (expected for BTC log returns)
        info.push(
          `ADF on returns: stat ${st}, p≈${tsFmtNum(p, 3)} — stationary at 5% (OK, not an error).`,
        );
      } else {
        warns.push(
          `ADF on returns: stat ${st}, p≈${tsFmtNum(p, 3)} — weak stationarity; prefer differenced/return models carefully.`,
        );
      }
    }
    // Explain N OOS if any model has backtest origin meta
    const anyBt = (suite.models || []).find(
      (m) => m.backtest?.originNote || m.backtest?.originStepDays != null,
    );
    if (anyBt?.backtest?.originNote) {
      info.push(String(anyBt.backtest.originNote));
    } else {
      info.push(
        "N OOS = number of thinned expanding-window origin dates (not calendar days in the sample). Longer ranges increase N OOS up to a speed cap.",
      );
    }
    const parts = [...warns, ...info];
    note.hidden = !parts.length;
    note.textContent = parts.join(" ");
    note.classList.toggle("vol-engine-note--warn", warns.length > 0);
    note.classList.toggle("vol-engine-note--ok", warns.length === 0 && info.length > 0);
  }
}

function tsHitPct(m, h) {
  const v = tsBtH(m, h, "dirHitRate");
  return v != null ? `${(v * 100).toFixed(0)}%` : "—";
}

function tsRmse(m, h) {
  const v = tsBtH(m, h, "rmseRet");
  return v != null ? v.toFixed(4) : "—";
}

function tsMae(m, h) {
  const v = tsBtH(m, h, "maeRet");
  return v != null ? v.toFixed(4) : "—";
}

function tsMape(m, h) {
  const v = tsBtH(m, h, "mapePct");
  return v != null ? v.toFixed(1) : "—";
}

const TS_HORIZONS = [
  {
    h: 1,
    bodyId: "ts-compare-body-1d",
    metaId: "ts-h1-meta",
    fcKey: "forecast1d",
    retKey: "return1d",
    bestRmse: "bestByRmse1d",
    bestMae: "bestByMae1d",
    bestMape: "bestByMape1d",
    bestHit: "bestByHit1d",
    label: "1d",
  },
  {
    h: 7,
    bodyId: "ts-compare-body-7d",
    metaId: "ts-h7-meta",
    fcKey: "forecast7d",
    retKey: "return7d",
    bestRmse: "bestByRmse7d",
    bestMae: "bestByMae7d",
    bestMape: "bestByMape7d",
    bestHit: "bestByHit7d",
    label: "7d",
  },
  {
    h: 30,
    bodyId: "ts-compare-body-30d",
    metaId: "ts-h30-meta",
    fcKey: "forecast30d",
    retKey: "return30d",
    bestRmse: "bestByRmse30d",
    bestMae: "bestByMae30d",
    bestMape: "bestByMape30d",
    bestHit: "bestByHit30d",
    label: "30d",
  },
];

function tsHorizonRankHtml(m, suite, hz) {
  const bits = [];
  const isHitBest = m.id === suite[hz.bestHit];
  const isRmseBest = m.id === suite[hz.bestRmse];
  const isMaeBest = m.id === suite[hz.bestMae];
  const isMapeBest = m.id === suite[hz.bestMape];
  const isDesk = m.id === (suite.selection?.selectedId || suite.summary?.bestModelId);
  if (isHitBest) {
    bits.push(`<span class="vol-badge vol-badge--best">BEST</span>`);
    bits.push(`<span class="vol-badge vol-badge--hit">HIT</span>`);
  }
  if (isRmseBest) {
    bits.push(`<span class="vol-badge vol-badge--qlike">RMSE</span>`);
  }
  if (isMaeBest) {
    bits.push(`<span class="vol-badge vol-badge--mae">MAE</span>`);
  }
  if (isMapeBest) {
    bits.push(`<span class="vol-badge vol-badge--mae">MAPE</span>`);
  }
  // In-sample fit criteria (suite-wide; shown on every horizon table)
  if (m.id === suite.bestByAic) {
    bits.push(`<span class="vol-badge vol-badge--aic">AIC</span>`);
  }
  if (m.id === suite.bestByBic) {
    bits.push(`<span class="vol-badge vol-badge--bic">BIC</span>`);
  }
  if (isDesk && hz.h === 7) {
    bits.push(`<span class="vol-badge vol-badge--mark">MARK</span>`);
  }
  return bits.length
    ? `<div class="vol-rank-cell ts-rank-cell">${bits.join("")}</div>`
    : `<span class="vol-rank-empty">—</span>`;
}

/** Build 80/95% path bands (API or client RW fallback). */
function tsEnsureForecastBands(m) {
  if (!m || !Array.isArray(m.forecastPath) || !m.forecastPath.length) {
    return m;
  }
  const path = m.forecastPath.map(Number);
  const n = path.length;
  const has =
    Array.isArray(m.forecastPathLo95) &&
    m.forecastPathLo95.length === n &&
    Array.isArray(m.forecastPathHi95) &&
    m.forecastPathHi95.length === n;
  if (has) return m;

  const last = Number(m.lastPrice ?? path[0]);
  let sig = Number(m.forecastSigmaDaily);
  if (!Number.isFinite(sig) || sig <= 0) {
    const resid = (m.residuals || []).map(Number).filter((x) => Number.isFinite(x));
    if (resid.length >= 20) {
      const mean = resid.reduce((a, b) => a + b, 0) / resid.length;
      const v =
        resid.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, resid.length - 1);
      sig = Math.sqrt(Math.max(v, 1e-12));
    } else {
      sig = 0.02;
    }
  }
  const z80 = 1.28155156554;
  const z95 = 1.95996398454;
  const lo80 = [];
  const hi80 = [];
  const lo95 = [];
  const hi95 = [];
  for (let i = 0; i < n; i++) {
    const h = i + 1;
    const se = sig * Math.sqrt(h);
    const mid = path[i];
    // log-space around point: mid * exp(±z·se)
    lo80.push(mid * Math.exp(-z80 * se));
    hi80.push(mid * Math.exp(z80 * se));
    lo95.push(mid * Math.exp(-z95 * se));
    hi95.push(mid * Math.exp(z95 * se));
  }
  m.forecastPathLo80 = lo80;
  m.forecastPathHi80 = hi80;
  m.forecastPathLo95 = lo95;
  m.forecastPathHi95 = hi95;
  m.forecastSigmaDaily = sig;
  m.forecastSigmaAnn = sig * Math.sqrt(365);
  m.forecastBandNote =
    m.forecastBandNote ||
    `Client RW bands: ±z·σ·√h, σ=${sig.toFixed(5)}/day (illustrative).`;
  for (const [h, label] of [
    [1, "1d"],
    [7, "7d"],
    [30, "30d"],
  ]) {
    if (h <= n) {
      m[`forecast${label}Lo80`] = lo80[h - 1];
      m[`forecast${label}Hi80`] = hi80[h - 1];
      m[`forecast${label}Lo95`] = lo95[h - 1];
      m[`forecast${label}Hi95`] = hi95[h - 1];
    }
  }
  return m;
}

function tsDrawBandFill(ctx, api, indices, loArr, hiArr, yAt, fillStyle, splitOffset) {
  if (!loArr?.length || !hiArr?.length) return;
  const pts = [];
  indices.forEach((gi, li) => {
    if (splitOffset != null && gi < splitOffset) return;
    const lo = loArr[gi - (splitOffset || 0)];
    const hi = hiArr[gi - (splitOffset || 0)];
    if (lo == null || hi == null || !Number.isFinite(lo) || !Number.isFinite(hi)) return;
    pts.push({ li, lo, hi });
  });
  if (pts.length < 2) return;
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = api.xAt(p.li, indices.length);
    const y = yAt(p.hi);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    ctx.lineTo(api.xAt(p.li, indices.length), yAt(p.lo));
  }
  ctx.closePath();
  ctx.fill();
}

function tsRmsePx(m, h) {
  const v = tsBtH(m, h, "rmsePx");
  return v != null ? tsFmtPx(v, 0) : "—";
}

function tsNOos(m, h) {
  const v = m?.backtest?.horizons?.[String(h)]?.n;
  return v != null && Number.isFinite(Number(v)) ? String(v) : "—";
}

function tsDeltaVsLast(m, suite, fcKey) {
  const last = suite?.lastPrice ?? suite?.summary?.lastPrice ?? m?.lastPrice;
  const fc = m?.[fcKey];
  if (last == null || fc == null || !Number.isFinite(Number(last)) || !Number.isFinite(Number(fc)) || Number(last) === 0) {
    return "—";
  }
  const d = ((Number(fc) - Number(last)) / Number(last)) * 100;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(2)}%`;
}

function tsFamilyAbbr(family) {
  const f = String(family || "").toLowerCase();
  if (f.includes("exog") || f === "with_exog" || f === "arimax") {
    return { short: "X", title: family || "with exogenous drivers" };
  }
  if (f.startsWith("multi") || f === "var" || f === "svar" || f === "vecm") {
    return { short: "M", title: family || "multivariate" };
  }
  if (f.startsWith("uni") || !f) {
    return { short: "U", title: family || "univariate" };
  }
  return { short: (family || "?").slice(0, 1).toUpperCase(), title: family || "—" };
}

function tsHorizonRow(m, suite, hz) {
  const isBest = m.id === suite[hz.bestHit];
  const isDesk =
    m.id === (suite.selection?.selectedId || suite.summary?.bestModelId);
  const sel = m.id === tsSelectedId ? " vol-row--selected" : "";
  const bestCls = isBest ? " vol-row--best-hit ts-row--best" : "";
  const deskCls = isDesk && !isBest ? " vol-row--desk-mark" : "";
  const status = m.status === "ok" ? (m.warning ? "fallback" : "ok") : "failed";
  const errTitle = m.error ? ` title="${tsEscape(m.error)}"` : "";
  const nOrig = m.backtest?.horizons?.[String(hz.h)]?.n;
  const fam = tsFamilyAbbr(m.family);
  const hit = tsBtH(m, hz.h, "dirHitRate");
  const hitCls =
    hit != null && hit >= 0.55
      ? " ts-hit--good"
      : hit != null && hit < 0.5
        ? " ts-hit--weak"
        : "";
  const bestLabel = isBest
    ? ` <span class="ts-best-inline" title="Best OOS directional hit at ${hz.label}">BEST HIT ${hz.label}</span>`
    : isDesk && hz.h === 7
      ? ` <span class="ts-best-inline ts-best-inline--mark" title="Suite desk mark (hit-primary selection)">MARK</span>`
      : "";
  return `<tr class="vol-row${sel}${bestCls}${deskCls}" data-ts-id="${tsEscape(m.id)}" tabindex="0" role="button">
    <td class="vol-td-text ts-td-model" title="${tsEscape(m.name)}">${tsEscape(m.name)}${bestLabel}</td>
    <td class="vol-td-text ts-td-family" title="${tsEscape(fam.title)}"><span class="ts-fam-abbr">${tsEscape(fam.short)}</span></td>
    <td class="mono vol-td-num ts-td-num">${tsFmtPx(m[hz.fcKey], 0)}</td>
    <td class="mono vol-td-num ts-td-num">${tsFmtRet(m[hz.retKey], 2)}</td>
    <td class="mono vol-td-num ts-td-num">${tsDeltaVsLast(m, suite, hz.fcKey)}</td>
    <td class="mono vol-td-num ts-td-num ts-td-hit${hitCls}" title="Directional hit rate (primary accuracy metric)">${tsHitPct(m, hz.h)}</td>
    <td class="mono vol-td-num ts-td-num">${tsRmse(m, hz.h)}</td>
    <td class="mono vol-td-num ts-td-num">${tsMae(m, hz.h)}</td>
    <td class="mono vol-td-num ts-td-num">${tsRmsePx(m, hz.h)}</td>
    <td class="mono vol-td-num ts-td-num">${tsMape(m, hz.h)}</td>
    <td class="mono vol-td-num ts-td-num">${tsNOos(m, hz.h)}</td>
    <td class="mono vol-td-num ts-td-num">${tsFmtNum(m.aic, 1)}</td>
    <td class="mono vol-td-num ts-td-num">${tsFmtNum(m.bic, 1)}</td>
    <td class="mono vol-td-num ts-td-num">${m.nParams ?? "—"}</td>
    <td class="vol-td-text ts-td-status"${errTitle}><span class="vol-status vol-status--${status}">${tsEscape(status)}</span></td>
    <td class="vol-td-rank ts-td-rank" title="${nOrig != null ? `${nOrig} OOS origins` : ""}">${tsHorizonRankHtml(m, suite, hz)}</td>
  </tr>`;
}

function tsBindTableRows(root) {
  root?.querySelectorAll(".vol-row").forEach((tr) => {
    const activate = () => {
      const id = tr.getAttribute("data-ts-id");
      if (id) tsSelectModel(id);
    };
    tr.addEventListener("click", activate);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
}

function tsRenderTable(suite) {
  const models = suite.models || [];
  const empty = !models.length;

  TS_HORIZONS.forEach((hz) => {
    const body = tsEl(hz.bodyId);
    if (!body) return;
    if (empty) {
      body.innerHTML = `<tr><td colspan="16">No models returned.</td></tr>`;
      return;
    }
    // Sort by directional hit (desc), then RMSE (asc) — accuracy first
    const sorted = models.slice().sort((a, b) => {
      const ha = tsBtH(a, hz.h, "dirHitRate");
      const hb = tsBtH(b, hz.h, "dirHitRate");
      if (ha == null && hb == null) {
        /* fall through */
      } else if (ha == null) return 1;
      else if (hb == null) return -1;
      else if (hb !== ha) return hb - ha;
      const ra = tsBtH(a, hz.h, "rmseRet");
      const rb = tsBtH(b, hz.h, "rmseRet");
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    });
    body.innerHTML = sorted.map((m) => tsHorizonRow(m, suite, hz)).join("");
    tsBindTableRows(body);

    const hMeta = tsEl(hz.metaId);
    if (hMeta) {
      const hitId = suite[hz.bestHit];
      const hitM = models.find((m) => m.id === hitId);
      const rmseId = suite[hz.bestRmse];
      const rmseM = models.find((m) => m.id === rmseId);
      const hitPct = hitM ? tsHitPct(hitM, hz.h) : null;
      const parts = [];
      if (hitM) parts.push(`★ BEST HIT ${hz.label}: ${hitM.name}${hitPct ? ` (${hitPct})` : ""}`);
      if (rmseM && rmseM.id !== hitM?.id) parts.push(`RMSE: ${rmseM.name}`);
      if (suite.bestByAic && hz.h === 7) {
        const aicM = models.find((m) => m.id === suite.bestByAic);
        if (aicM) parts.push(`AIC: ${aicM.name}`);
      }
      if (suite.bestByBic && hz.h === 7) {
        const bicM = models.find((m) => m.id === suite.bestByBic);
        if (bicM) parts.push(`BIC: ${bicM.name}`);
      }
      hMeta.textContent = parts.length ? parts.join(" · ") : `≈ ${hz.label}`;
      hMeta.classList.toggle("ts-h-meta--best", !!hitM);
    }
  });

  const meta = tsEl("ts-compare-meta");
  if (meta) {
    const ok = models.filter((m) => m.status === "ok").length;
    meta.textContent = empty
      ? "Run models to populate"
      : `${ok}/${models.length} ok · sorted by OOS hit % · badges: HIT · RMSE · MAE · MAPE · AIC · BIC · MARK`;
  }
  window.decorateHelpLabels?.(
    document.querySelector('.menu-screen[data-l1="stats"][data-l2="timeseries"]'),
  );
}

function tsSelectedModel(suite) {
  const models = suite.models || [];
  return (
    models.find((m) => m.id === tsSelectedId) ||
    models.find((m) => m.id === suite.selection?.selectedId) ||
    models.find((m) => m.id === suite.bestByHit7d) ||
    models.find((m) => m.id === suite.summary?.bestModelId) ||
    models.find((m) => m.id === suite.bestByRmse7d) ||
    models.find((m) => m.status === "ok") ||
    null
  );
}

function tsRenderDetail(m, suite) {
  if (m) tsEnsureForecastBands(m);
  const eq = tsEl("ts-equation");
  if (eq) {
    eq.innerHTML = m
      ? `<div class="vol-eq-main">${tsEscape(m.equation || m.name)}</div>
         <p class="vol-eq-note">${tsEscape(m.blurb || "")}</p>
         ${m.whyBtc ? `<p class="vol-eq-note"><strong>BTC:</strong> ${tsEscape(m.whyBtc)}</p>` : ""}
         ${m.warning ? `<p class="vol-warn">${tsEscape(m.warning)}</p>` : ""}
         ${m.error ? `<p class="vol-warn">${tsEscape(m.error)}</p>` : ""}`
      : "—";
  }
  const pb = tsEl("ts-params-body");
  if (pb) {
    const params = m?.params || [];
    pb.innerHTML = params.length
      ? params
          .slice(0, 24)
          .map(
            (p) =>
              `<tr><td class="vol-td-text">${tsEscape(p.name)}</td>
               <td class="mono vol-td-num ts-td-num">${tsFmtNum(p.estimate, 5)}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="2">${m?.status === "failed" ? "Failed" : "No parameters"}</td></tr>`;
  }
  const dmeta = tsEl("ts-detail-meta");
  if (dmeta) dmeta.textContent = m ? `${m.name} · ${m.engine || "—"}` : "—";

  // Backtest table
  const btBody = tsEl("ts-bt-body");
  if (btBody) {
    const hs = m?.backtest?.horizons || {};
    const rows = ["1", "7", "30"].map((h) => {
      const b = hs[h] || {};
      if (!b.n) return `<tr><td>${h}d</td><td colspan="6">—</td></tr>`;
      return `<tr>
        <td class="vol-td-text">${h}d</td>
        <td class="mono vol-td-num ts-td-num">${b.n}</td>
        <td class="mono vol-td-num ts-td-num">${b.rmseRet != null ? Number(b.rmseRet).toFixed(4) : "—"}</td>
        <td class="mono vol-td-num ts-td-num">${b.maeRet != null ? Number(b.maeRet).toFixed(4) : "—"}</td>
        <td class="mono vol-td-num ts-td-num">${b.rmsePx != null ? tsFmtPx(b.rmsePx, 0) : "—"}</td>
        <td class="mono vol-td-num ts-td-num">${b.mapePct != null ? Number(b.mapePct).toFixed(1) : "—"}</td>
        <td class="mono vol-td-num ts-td-num">${b.dirHitRate != null ? `${(Number(b.dirHitRate) * 100).toFixed(0)}%` : "—"}</td>
      </tr>`;
    });
    btBody.innerHTML = rows.join("");
  }
  const btMeta = tsEl("ts-bt-table-meta");
  if (btMeta) {
    btMeta.textContent = m
      ? `${m.name} · expanding window · 1 / 7 / 30`
      : "Expanding window · select a model";
  }
  const capBtTable = tsEl("ts-cap-bt-table");
  if (capBtTable && m) {
    capBtTable.innerHTML =
      `Numeric OOS metrics for <strong>${tsEscape(m.name)}</strong> at each horizon. ` +
      `Same definitions as the comparison tables (RMSE/MAE on log returns; RMSE $ and MAPE on price; hit = sign accuracy).`;
  }

  const insights = tsEl("ts-insights");
  if (insights && m) {
    const r1 = m.return1d;
    const r7 = m.return7d;
    const r30 = m.return30d;
    const hit = tsBtH(m, 7, "dirHitRate");
    const rmse7 = tsBtH(m, 7, "rmseRet");
    insights.innerHTML = `
      <p><strong>${tsEscape(m.name)}</strong> (${tsEscape(m.family)} / ${tsEscape(m.kind || "—")}).</p>
      <p>Point forecasts: 1d <strong>${tsFmtPx(m.forecast1d, 0)}</strong> (${tsFmtRet(r1)}),
         7d <strong>${tsFmtPx(m.forecast7d, 0)}</strong> (${tsFmtRet(r7)}),
         30d <strong>${tsFmtPx(m.forecast30d, 0)}</strong> (${tsFmtRet(r30)}).</p>
      ${
        m.forecast7dLo95 != null
          ? `<p>Approx. 95% bands (σ√h): 1d <strong>${tsFmtPx(m.forecast1dLo95, 0)}–${tsFmtPx(m.forecast1dHi95, 0)}</strong>;
             7d <strong>${tsFmtPx(m.forecast7dLo95, 0)}–${tsFmtPx(m.forecast7dHi95, 0)}</strong>;
             30d <strong>${tsFmtPx(m.forecast30dLo95, 0)}–${tsFmtPx(m.forecast30dHi95, 0)}</strong>.</p>`
          : ""
      }
      <p>OOS 7d: directional hit <strong>${hit != null ? `${(hit * 100).toFixed(1)}%` : "—"}</strong>
         ${hit != null && hit < 0.52 ? " — near coin-flip; treat as no edge." : ""},
         RMSE(ret) <strong>${rmse7 != null ? rmse7.toFixed(4) : "—"}</strong>.
         AIC <strong>${m.aic != null ? Number(m.aic).toFixed(1) : "—"}</strong>,
         BIC <strong>${m.bic != null ? Number(m.bic).toFixed(1) : "—"}</strong>.</p>
      <p>Primary accuracy is <strong>hit rate</strong>; RMSE/MAE measure magnitude error; AIC/BIC are in-sample fit only. Always compare against <strong>Naive (RW)</strong>.</p>
      ${
        m.id === "svar" || m.irf
          ? `<p>SVAR uses recursive identification ${tsEscape((m.ordering || []).join(" → ") || "DXY → SPX → BTC")}. IRF chart shows orthogonalized responses.</p>`
          : ""
      }
      <p class="vol-caveat">Not investment advice. Crypto is jump-prone; linear Gaussian TS models understate tail risk.</p>`;
  }
}

function tsRenderGuide(suite) {
  const host = tsEl("ts-guide-body");
  if (!host) return;
  const guide = suite.guide || [];
  const gloss = suite.glossary || {};
  host.innerHTML =
    guide
      .map(
        (g) =>
          `<p><strong>${tsEscape(g.prefer)}:</strong> ${tsEscape(g.when)}</p>`,
      )
      .join("") +
    Object.entries(gloss)
      .map(([k, v]) => `<p><strong>${tsEscape(k)}:</strong> ${tsEscape(v)}</p>`)
      .join("");
}

function tsBuildCommentary(suite) {
  const models = suite.models || [];
  const ok = models.filter((m) => m.status === "ok");
  const failed = models.filter((m) => m.status === "failed");
  const s = suite.summary || {};
  const lines = [];
  lines.push(
    `Sample: <strong>${suite.nObs ?? "—"}</strong> daily closes on <strong>${tsEscape(suite.pair || "BTC")}</strong> ` +
      `(${tsEscape(suite.startDate || "?")} → ${tsEscape(suite.endDate || "?")}). ` +
      `Engines: statsmodels <strong>${suite.statsmodelsAvailable ? "yes" : "no"}</strong>, ` +
      `macro (SPX/DXY) <strong>${suite.macroAvailable ? "yes" : "no"}</strong>` +
      `${suite.fromCache ? " · cached" : " · fresh"}.`,
  );
  lines.push(
    `<strong>${ok.length}</strong>/${models.length} models ok` +
      (failed.length
        ? `; failed: ${failed.map((m) => tsEscape(m.name)).join(", ")}.`
        : "."),
  );
  {
    const markName = suite.selection?.selectedName || s.bestModelName;
    if (markName) {
      lines.push(
        `Desk mark (hit-primary): <strong>${tsEscape(markName)}</strong>. ` +
          `Rule: maximize <strong>7d OOS directional hit</strong>; ties break on 1d/30d hit, then RMSE, MAE, AIC, BIC. ` +
          `See <strong>Why this model</strong> for the full rationale.`,
      );
    }
    const h1 = s.bestHit1Name || models.find((m) => m.id === suite.bestByHit1d)?.name;
    const h7 = s.bestHit7Name || models.find((m) => m.id === suite.bestByHit7d)?.name;
    const h30 = s.bestHit30Name || models.find((m) => m.id === suite.bestByHit30d)?.name;
    if (h1 || h7 || h30) {
      lines.push(
        `Best OOS <strong>hit rate</strong> by horizon: ` +
          (h1 ? `<strong>1d</strong> ${tsEscape(h1)}` : "") +
          (h1 && h7 ? " · " : "") +
          (h7 ? `<strong>7d</strong> ${tsEscape(h7)}` : "") +
          ((h1 || h7) && h30 ? " · " : "") +
          (h30 ? `<strong>30d</strong> ${tsEscape(h30)}` : "") +
          `. Rank column shows <strong>BEST + HIT</strong> (and RMSE / MAE / MAPE / AIC / BIC when earned).`,
      );
    }
    const r1 = s.bestRmse1Name;
    const r7 = s.bestRmse7Name;
    const r30 = s.bestRmse30Name;
    if (r1 || r7 || r30) {
      lines.push(
        `Best OOS <strong>RMSE</strong> (magnitude): ` +
          [r1 && `1d ${tsEscape(r1)}`, r7 && `7d ${tsEscape(r7)}`, r30 && `30d ${tsEscape(r30)}`]
            .filter(Boolean)
            .join(" · ") +
          `. ` +
          (s.bestAicName ? `AIC: <strong>${tsEscape(s.bestAicName)}</strong>. ` : "") +
          (s.bestBicName ? `BIC: <strong>${tsEscape(s.bestBicName)}</strong>.` : ""),
      );
    }
    if (markName) {
      lines.push(
        `Mark path: 1d <strong>${tsFmtPx(s.forecast1d, 0)}</strong> (${tsFmtRet(s.return1d)}), ` +
          `7d <strong>${tsFmtPx(s.forecast7d, 0)}</strong> (${tsFmtRet(s.return7d)}), ` +
          `30d <strong>${tsFmtPx(s.forecast30d, 0)}</strong> (${tsFmtRet(s.return30d)}).`,
      );
    }
  }
  const naive = ok.find((m) => m.id === "naive");
  const markM =
    ok.find((m) => m.id === suite.selection?.selectedId) ||
    ok.find((m) => m.id === suite.bestByHit7d) ||
    ok.find((m) => m.id === suite.bestByRmse7d);
  if (naive && markM) {
    const nHit = tsBtH(naive, 7, "dirHitRate");
    const mHit = tsBtH(markM, 7, "dirHitRate");
    const n7 = tsBtH(naive, 7, "rmseRet");
    const b7 = tsBtH(markM, 7, "rmseRet");
    if (nHit != null && mHit != null) {
      lines.push(
        mHit > nHit + 1e-9
          ? `<strong>${tsEscape(markM.name)}</strong> beats Naive on 7d hit (${(mHit * 100).toFixed(1)}% vs ${(nHit * 100).toFixed(1)}%).`
          : `No directional edge vs Naive on 7d hit (${markM.name}: ${(mHit * 100).toFixed(1)}%, Naive: ${(nHit * 100).toFixed(1)}%). Size small or stay flat on pure TS direction.`,
      );
    }
    if (n7 != null && b7 != null) {
      lines.push(
        b7 < n7 * 0.98
          ? `Also beats Naive 7d RMSE (${b7.toFixed(4)} vs ${n7.toFixed(4)}).`
          : `7d RMSE vs Naive: ${b7.toFixed(4)} vs ${n7.toFixed(4)} (no clear magnitude win).`,
      );
    }
  }
  lines.push(
    `Caveats: BTC daily direction is hard; hit rates near 50% mean no edge. ` +
      `AIC/BIC are in-sample fit badges only — they never outrank OOS hit. ` +
      `Prefer models that beat <strong>Naive (RW)</strong> on hit first, then RMSE.`,
  );
  return lines;
}

function tsRenderCommentary(suite) {
  const host = tsEl("ts-run-commentary");
  const meta = tsEl("ts-run-commentary-meta");
  if (!host) return;
  host.innerHTML = tsBuildCommentary(suite)
    .map((p) => `<p>${p}</p>`)
    .join("");
  if (meta) {
    meta.textContent = [
      suite.asOf ? String(suite.asOf).replace("T", " ").slice(0, 16) + " UTC" : "",
      suite.summary?.bestModelName ? `mark: ${suite.summary.bestModelName}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  tsRenderTraderMemo(suite);
}

/**
 * Desk memo for junior + senior traders:
 * multi-model combined reading + quality + trade plan scaffold.
 * Rule-based from this suite only — educational, not investment advice.
 */
function tsBuildTraderMemo(suite) {
  const models = suite.models || [];
  const ok = models.filter((m) => m.status === "ok");
  const failed = models.filter((m) => m.status === "failed");
  const s = suite.summary || {};
  const last = suite.lastPrice ?? s.lastPrice;
  const lastN = last != null ? Number(last) : null;
  const mark =
    ok.find((m) => m.id === suite.selection?.selectedId) ||
    ok.find((m) => m.id === suite.bestByHit7d) ||
    ok.find((m) => m.id === s.bestModelId) ||
    ok.find((m) => m.id === suite.bestByRmse7d) ||
    ok[0] ||
    null;
  const mark1 = ok.find((m) => m.id === suite.bestByHit1d) || mark;
  const mark30 = ok.find((m) => m.id === suite.bestByHit30d) || mark;
  const naive = ok.find((m) => m.id === "naive");

  if (!mark) {
    return `<p class="ts-trader-memo-empty">Nothing finished cleanly this run, so we can’t write a combined forecast. Fix the failed models and hit <strong>Run all models</strong> again.</p>`;
  }

  // ---------- Multi-model consensus (combined forecast) ----------
  function horizonStats(retKey, fcKey, h) {
    const rows = ok
      .map((m) => {
        const ret = m[retKey] != null ? Number(m[retKey]) : null;
        const fc = m[fcKey] != null ? Number(m[fcKey]) : null;
        const rmse = tsBtH(m, h, "rmseRet");
        return { m, ret, fc, rmse };
      })
      .filter((x) => x.ret != null && Number.isFinite(x.ret));
    if (!rows.length) return null;
    const rets = rows.map((x) => x.ret).sort((a, b) => a - b);
    const fcs = rows
      .map((x) => x.fc)
      .filter((x) => x != null && Number.isFinite(x))
      .sort((a, b) => a - b);
    const median = (arr) => {
      if (!arr.length) return null;
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 ? arr[mid] : 0.5 * (arr[mid - 1] + arr[mid]);
    };
    // Inverse-RMSE weights (better OOS → more voice); floor so weak models still count a little
    let wSum = 0;
    let wRet = 0;
    let wFc = 0;
    rows.forEach((x) => {
      const w =
        x.rmse != null && x.rmse > 1e-8 ? 1 / x.rmse : x.rmse === 0 ? 50 : 1;
      wSum += w;
      wRet += w * x.ret;
      if (x.fc != null) wFc += w * x.fc;
    });
    const up = rows.filter((x) => x.ret > 0.002).length;
    const down = rows.filter((x) => x.ret < -0.002).length;
    const flat = rows.length - up - down;
    const bullNames = rows
      .filter((x) => x.ret > 0.002)
      .sort((a, b) => b.ret - a.ret)
      .slice(0, 4)
      .map((x) => x.m.name);
    const bearNames = rows
      .filter((x) => x.ret < -0.002)
      .sort((a, b) => a.ret - b.ret)
      .slice(0, 4)
      .map((x) => x.m.name);
    return {
      n: rows.length,
      up,
      down,
      flat,
      pctUp: (100 * up) / rows.length,
      pctDown: (100 * down) / rows.length,
      medRet: median(rets),
      meanRet: rets.reduce((a, b) => a + b, 0) / rets.length,
      wRet: wSum > 0 ? wRet / wSum : null,
      medFc: median(fcs),
      wFc: wSum > 0 && fcs.length ? wFc / wSum : null,
      loFc: fcs[0] ?? null,
      hiFc: fcs[fcs.length - 1] ?? null,
      loRet: rets[0],
      hiRet: rets[rets.length - 1],
      bullNames,
      bearNames,
      spreadRet: rets[rets.length - 1] - rets[0],
    };
  }

  const h1 = horizonStats("return1d", "forecast1d", 1);
  const h7 = horizonStats("return7d", "forecast7d", 7);
  const h30 = horizonStats("return30d", "forecast30d", 30);

  function agreeLabel(hs) {
    if (!hs) return "n/a";
    if (hs.pctUp >= 70) return "most models lean up";
    if (hs.pctDown >= 70) return "most models lean down";
    if (hs.pctUp >= 55) return "slight majority up";
    if (hs.pctDown >= 55) return "slight majority down";
    return "models are split / mostly flat";
  }

  // Combined story in plain English
  const comboParas = [];
  comboParas.push(
    `Think of this section as a <strong>team meeting of every model that finished</strong> (${ok.length} ok` +
      (failed.length ? `, ${failed.length} didn’t finish` : "") +
      `). Instead of trusting one shiny forecast, we ask: do they roughly agree? Where do they fight? ` +
      `What’s a sensible middle path?`,
  );

  if (h7) {
    comboParas.push(
      `<strong>Over the next week (7d)</strong> — ${agreeLabel(h7)}: ` +
        `<strong>${h7.up}</strong> models up, <strong>${h7.down}</strong> down, <strong>${h7.flat}</strong> basically flat. ` +
        `Simple average move ≈ <strong>${tsFmtRet(h7.meanRet)}</strong>; middle model (median) ≈ <strong>${tsFmtRet(h7.medRet)}</strong>; ` +
        `skill-weighted blend (better OOS RMSE talks louder) ≈ <strong>${tsFmtRet(h7.wRet)}</strong>. ` +
        (h7.medFc != null
          ? `That maps to a ballpark price around <strong>${tsFmtPx(h7.wFc ?? h7.medFc, 0)}</strong> ` +
            `(range across models ${tsFmtPx(h7.loFc, 0)} → ${tsFmtPx(h7.hiFc, 0)}).`
          : ""),
    );
    if (h7.bullNames.length) {
      comboParas.push(
        `More bullish voices this week: <em>${h7.bullNames.map(tsEscape).join(", ")}</em>.`,
      );
    }
    if (h7.bearNames.length) {
      comboParas.push(
        `More bearish voices this week: <em>${h7.bearNames.map(tsEscape).join(", ")}</em>.`,
      );
    }
  }

  if (h1) {
    comboParas.push(
      `<strong>Tomorrow (1d)</strong> — ${agreeLabel(h1)} ` +
        `(${h1.up} up / ${h1.down} down / ${h1.flat} flat). ` +
        `Blended move ≈ <strong>${tsFmtRet(h1.wRet ?? h1.medRet)}</strong>. ` +
        `Junior tip: <em>don’t day-trade this</em>. One-day BTC moves are mostly noise; use 1d only as “is the desk leaning slightly green or red overnight?”`,
    );
  }

  if (h30) {
    comboParas.push(
      `<strong>About a month (30d)</strong> — ${agreeLabel(h30)} ` +
        `(${h30.up} up / ${h30.down} down). ` +
        `Blended move ≈ <strong>${tsFmtRet(h30.wRet ?? h30.medRet)}</strong>` +
        (h30.wFc != null || h30.medFc != null
          ? `, price cluster near <strong>${tsFmtPx(h30.wFc ?? h30.medFc, 0)}</strong> ` +
            `(wide band ${tsFmtPx(h30.loFc, 0)}–${tsFmtPx(h30.hiFc, 0)} — models disagree a lot on levels).`
          : "."),
    );
  }

  // Agreement quality
  let agreementScore = 50;
  let agreementPlain = "Mixed picture.";
  if (h7 && h30) {
    const sameSign =
      (h7.wRet ?? h7.medRet) * (h30.wRet ?? h30.medRet) > 0 ||
      (Math.abs(h7.wRet ?? h7.medRet) < 0.005 && Math.abs(h30.wRet ?? h30.medRet) < 0.008);
    const strong7 = h7.pctUp >= 65 || h7.pctDown >= 65;
    const strong30 = h30.pctUp >= 65 || h30.pctDown >= 65;
    if (sameSign && strong7 && strong30) {
      agreementScore = 78;
      agreementPlain =
        "Pretty clear story: week and month point the same way, and a solid majority of models agree. Still not a crystal ball — but this is as clean as this suite usually gets.";
    } else if (sameSign && (strong7 || strong30)) {
      agreementScore = 62;
      agreementPlain =
        "Somewhat aligned: the blended week and month lean the same direction, but not every model is on board. Fine for a small, careful idea — not for max size.";
    } else if (!sameSign) {
      agreementScore = 28;
      agreementPlain =
        "Week and month disagree (or the crowd is split). When models fight each other, juniors should usually <strong>sit on their hands</strong> or only hedge existing risk — not open a fresh hero trade.";
    } else {
      agreementScore = 45;
      agreementPlain =
        "Soft / flat consensus. Markets might chop. Better for “don’t force a trade” than for a big directional bet.";
    }
    // Wide dispersion = less confidence
    if (h7.spreadRet > 0.08) {
      agreementScore -= 8;
      agreementPlain +=
        " Also: the 7d forecast spread across models is wide — treat the number as a zone, not a pin.";
    }
  }

  // Best vs pack
  comboParas.push(
    `<strong>Who “won” the backtest?</strong> ` +
      `Best 1d RMSE: <strong>${tsEscape(mark1?.name || "—")}</strong>. ` +
      `Best 7d RMSE (our main weekly mark): <strong>${tsEscape(mark.name)}</strong>. ` +
      `Best 30d RMSE: <strong>${tsEscape(mark30?.name || "—")}</strong>. ` +
      `If those three names are totally different families, the market is hard to pin down with one story — lean harder on the <em>blend</em> and on agreement, not on a single champion.`,
  );

  if (naive) {
    const nRmse = tsBtH(naive, 7, "rmseRet");
    const bRmse = tsBtH(mark, 7, "rmseRet");
    if (nRmse != null && bRmse != null) {
      comboParas.push(
        bRmse < nRmse * 0.98
          ? `<strong>Vs the dumb benchmark:</strong> the 7d leader beats Naive (random walk). That’s the minimum bar. If you can’t beat “tomorrow’s price ≈ today’s,” you don’t have an edge — you have a story.`
          : `<strong>Vs the dumb benchmark:</strong> even the best 7d model is <em>not</em> clearly better than Naive. Translation for juniors: the combined forecast is still worth reading for context, but it’s a weak reason to put real risk on.`,
      );
    }
  }

  const blend7 = h7?.wRet ?? h7?.medRet ?? mark.return7d;
  const blend30 = h30?.wRet ?? h30?.medRet ?? mark.return30d;
  const blend1 = h1?.wRet ?? h1?.medRet ?? mark.return1d;
  const blendFc7 = h7?.wFc ?? h7?.medFc ?? mark.forecast7d;
  const blendFc30 = h30?.wFc ?? h30?.medFc ?? mark.forecast30d;
  const blendFc1 = h1?.wFc ?? h1?.medFc ?? mark.forecast1d;

  comboParas.push(
    `<strong>Combined working forecast (plain English):</strong> ` +
      `using a skill-weighted blend of all finished models, the desk’s working numbers are roughly ` +
      `<strong>1d ${tsFmtRet(blend1)}</strong> → ~${tsFmtPx(blendFc1, 0)}, ` +
      `<strong>7d ${tsFmtRet(blend7)}</strong> → ~${tsFmtPx(blendFc7, 0)}, ` +
      `<strong>30d ${tsFmtRet(blend30)}</strong> → ~${tsFmtPx(blendFc30, 0)} ` +
      `(last close ${tsFmtPx(last, 0)}). ` +
      `Agreement vibe: <em>${tsEscape(agreementPlain)}</em>`,
  );

  // ---------- Single-mark quality (existing logic, colloquial reasons) ----------
  const r1 = mark.return1d;
  const r7 = mark.return7d;
  const r30 = mark.return30d;
  const f1 = mark.forecast1d;
  const f7 = mark.forecast7d;
  const f30 = mark.forecast30d;
  const hit1 = tsBtH(mark, 1, "dirHitRate");
  const hit7 = tsBtH(mark, 7, "dirHitRate");
  const hit30 = tsBtH(mark, 30, "dirHitRate");
  const rmse1 = tsBtH(mark, 1, "rmseRet");
  const rmse7 = tsBtH(mark, 7, "rmseRet");
  const rmse30 = tsBtH(mark, 30, "rmseRet");
  const mape7 = tsBtH(mark, 7, "mapePct");
  const mape30 = tsBtH(mark, 30, "mapePct");
  const n7 = mark.backtest?.horizons?.["7"]?.n;
  const n30 = mark.backtest?.horizons?.["30"]?.n;

  let beatNaive7 = null;
  let naiveRmse7 = null;
  if (naive) {
    naiveRmse7 = tsBtH(naive, 7, "rmseRet");
    if (naiveRmse7 != null && rmse7 != null) beatNaive7 = rmse7 < naiveRmse7 * 0.98;
  }

  let quality = 35;
  const qReasons = [];
  if (rmse7 != null && Number.isFinite(rmse7)) {
    quality += 12;
    qReasons.push("We have a real out-of-sample error number for the weekly mark (good — not just a pretty in-sample fit).");
  }
  if (beatNaive7 === true) {
    quality += 18;
    qReasons.push("Weekly mark beats Naive — rare and useful. Still not a license to size up like a hedge fund.");
  } else if (beatNaive7 === false) {
    quality -= 12;
    qReasons.push("Weekly mark loses to Naive — treat forecasts as background music, not a trade ticket.");
  }
  if (hit7 != null) {
    if (hit7 >= 0.56) {
      quality += 12;
      qReasons.push(`Direction was right about ${(hit7 * 100).toFixed(0)}% of the time on 7d OOS — a bit better than a coin flip.`);
    } else if (hit7 >= 0.52) {
      quality += 4;
      qReasons.push(`7d hit rate ${(hit7 * 100).toFixed(0)}% — barely above chance. Don’t get cocky.`);
    } else {
      quality -= 8;
      qReasons.push(`7d hit rate ${(hit7 * 100).toFixed(0)}% — basically a coin flip on direction.`);
    }
  }
  if (hit1 != null && hit1 < 0.51) {
    quality -= 4;
    qReasons.push("Next-day direction skill is weak — skip day-trading off this suite.");
  }
  if (hit30 != null && hit30 >= 0.55) {
    quality += 6;
    qReasons.push(`Monthly direction hit ~${(hit30 * 100).toFixed(0)}% — swing horizon is a bit more interesting than the day trade.`);
  }
  if (n7 != null && n7 >= 60) {
    quality += 6;
    qReasons.push(`Backtest used ~${n7} checkpoints on 7d — enough to not be pure noise.`);
  } else if (n7 != null && n7 < 30) {
    quality -= 6;
    qReasons.push(`Only ~${n7} OOS checkpoints — small sample, big grain of salt.`);
  }
  if (agreementScore >= 70) {
    quality += 6;
    qReasons.push("Models mostly agree with each other on week + month — that raises confidence a notch.");
  } else if (agreementScore <= 35) {
    quality -= 6;
    qReasons.push("Models disagree a lot — confidence goes down even if one model looks pretty.");
  }
  if (failed.length > ok.length * 0.4) {
    quality -= 5;
    qReasons.push("Lots of models failed this run — something’s off with data or engines.");
  }
  if (suite.macroAvailable) {
    quality += 3;
    qReasons.push("SPX/DXY macro series loaded, so VAR-style models had real fuel.");
  }
  quality = Math.max(8, Math.min(88, Math.round(0.85 * quality + 0.15 * agreementScore)));

  let qualityTier;
  let qualityClass;
  if (quality >= 62) {
    qualityTier = "OK as a side input — not your whole strategy";
    qualityClass = "ts-memo-tier--good";
  } else if (quality >= 45) {
    qualityTier = "Research / double-check only";
    qualityClass = "ts-memo-tier--mid";
  } else {
    qualityTier = "Don’t use this run to put real money on";
    qualityClass = "ts-memo-tier--bad";
  }

  // Direction from blend + mark
  const ret7 = blend7 != null ? Number(blend7) : r7 != null ? Number(r7) : null;
  const ret30 = blend30 != null ? Number(blend30) : r30 != null ? Number(r30) : null;
  let bias = "stay flat / no new trade";
  let biasWhy =
    "Either the path is mushy or the models don’t deserve a strong call. Doing nothing is a valid trade.";
  if (quality < 40) {
    bias = "flat — stand aside";
    biasWhy =
      "Quality is too low. Juniors: protecting capital beats “being active.” Skip the hero trade.";
  } else if (ret7 != null && ret30 != null) {
    if (ret7 > 0.01 && ret30 > 0.015 && agreementScore >= 50) {
      bias = "mild long bias (only if the rest of your book agrees)";
      biasWhy =
        "Combined week + month lean higher and the pack isn’t totally split. Still use a stop. Still check the weekly chart.";
    } else if (ret7 < -0.01 && ret30 < -0.015 && agreementScore >= 50) {
      bias = "mild short / trim-longs bias";
      biasWhy =
        "Combined path leans down. Shorting BTC is scary (squeezes) — prefer reducing longs or buying puts over naked short leverage.";
    } else if (Math.abs(ret7) < 0.008 && Math.abs(ret30) < 0.012) {
      bias = "range / wait-and-see";
      biasWhy = "Blended path is basically “price hangs around.” Good time to practice patience.";
    } else if (ret7 * ret30 < 0) {
      bias = "mixed signals — no clean trade";
      biasWhy =
        "Week and month point different ways. When that happens, the market is confusing the models too — wait.";
    } else if (ret7 > 0.005) {
      bias = "soft long (weekly only)";
      biasWhy = "Week looks a bit up, month not fully on board — keep any idea small and short-dated.";
    } else if (ret7 < -0.005) {
      bias = "soft defensive (weekly only)";
      biasWhy = "Week looks a bit soft — think hedge / smaller long, not a huge short campaign.";
    }
  }

  let posHorizon = "No new risk";
  let posHorizonDetail =
    "If you’re learning, paper-trade the idea. Live size stays tiny until quality improves.";
  if (quality >= 45 && hit7 != null && hit7 >= 0.52) {
    if (hit30 != null && hit30 >= hit7 && Math.abs(ret30 || 0) > Math.abs(ret7 || 0)) {
      posHorizon = "About 1–4 weeks (swing)";
      posHorizonDetail =
        "You’re playing the weekly-to-monthly story. Check the position every few days. Don’t forget big event days.";
    } else {
      posHorizon = "About 3–10 sessions (short swing)";
      posHorizonDetail =
        "Not a day trade. Give it a few sessions, but don’t marry it. If it’s wrong quickly, get out.";
    }
  } else if (quality >= 40) {
    posHorizon = "At most a few sessions";
    posHorizonDetail = "Edge is thin — time is not your friend. If nothing happens in a week, flatten.";
  }

  const sigma7 = rmse7 != null && rmse7 > 0 ? rmse7 : 0.04;
  const sigma1 = rmse1 != null && rmse1 > 0 ? rmse1 : sigma7 / Math.sqrt(7);
  const sigma30 = rmse30 != null && rmse30 > 0 ? rmse30 : sigma7 * Math.sqrt(30 / 7);

  function pxFromMove(logMove) {
    if (lastN == null || !Number.isFinite(lastN)) return "—";
    return tsFmtPx(lastN * Math.exp(logMove), 0);
  }
  function pctFromMove(logMove) {
    return `${(logMove * 100).toFixed(1)}%`;
  }

  const isLong = bias.includes("long");
  const isShort = bias.includes("short") || bias.includes("defensive");
  let entry = "No entry — stay flat.";
  let stop = "N/A";
  let tp1 = "N/A";
  let tp2 = "N/A";
  let invalidation = "If quality is low, any live entry is already a process fail — don’t force it.";
  let rr = "—";

  if (quality >= 40 && lastN != null && (isLong || isShort)) {
    const stopMove = Math.max(1.25 * sigma7, 1.75 * sigma7);
    const tp1Move = Math.max(0.9 * sigma7, Math.abs(ret7 || sigma7));
    const tp2Move = Math.max(1.4 * sigma7, Math.abs(ret30 || sigma7 * 1.2));
    entry = isLong
      ? `Buy near last (${tsFmtPx(lastN, 0)}) or a small dip toward ${pxFromMove(-0.5 * sigma1)}. Don’t chase a vertical spike.`
      : `Trim / short near last (${tsFmtPx(lastN, 0)}) or a small bounce toward ${pxFromMove(0.5 * sigma1)}. Don’t short the absolute low of a crash candle.`;
    stop = isLong
      ? `Hard stop around ${pxFromMove(-stopMove)} (about −${pctFromMove(stopMove)}). If price tags it, you’re out — no “hope.”`
      : `Hard stop around ${pxFromMove(stopMove)} (about +${pctFromMove(stopMove)}). Cover if tagged.`;
    tp1 = isLong
      ? `First target ~${pxFromMove(tp1Move)} (+${pctFromMove(tp1Move)}). Bank part of the trade, move stop to entry.`
      : `First cover ~${pxFromMove(-tp1Move)} (−${pctFromMove(tp1Move)}). Take some profit, tighten stop.`;
    tp2 = isLong
      ? `Stretch target ~${pxFromMove(tp2Move)} or trail under strength; be flat by the end of your planned horizon.`
      : `Stretch cover ~${pxFromMove(-tp2Move)} or trail; don’t let a winner turn into a long-term short religion.`;
    invalidation =
      "Kill the idea if: stop hits, a re-run flips the combined week/month story, models split badly, or a huge news bomb lands and you have no hedge.";
    rr = `Rough reward:risk to first target ≈ ${(tp1Move / stopMove).toFixed(2)}× (using error-based stops — approximate only).`;
  }

  let sizing = "Zero new risk, or paper only.";
  if (quality >= 62 && beatNaive7) {
    sizing =
      "Risk about 0.25–0.5% of your account to the hard stop (not 0.5% margin with 20× leverage). If the stop hits, you lose that slice — not the account.";
  } else if (quality >= 45) {
    sizing = "Tiny: ~0.1–0.25% of account to the stop. This is “learning with skin in the game,” not a career-maker.";
  } else if (quality >= 40) {
    sizing = "≤0.1% or paper. Seriously.";
  }

  let investSuit;
  if (quality >= 62 && beatNaive7) {
    investSuit =
      "You can use this as a <strong>tactical helper</strong> (when to add a little, when to trim) — <strong>not</strong> as your whole investment process. " +
      "Long-term BTC ownership still comes from thesis and risk budget, not from ARIMA saying “+2% next week.”";
  } else if (quality >= 45) {
    investSuit =
      "Fine for <strong>homework and cross-checks</strong>. Weak as the only reason to buy or sell a big bag. Juniors: if your PM asks “why are we long?”, “the VAR said so” is not enough.";
  } else {
    investSuit =
      "This run is <strong>not good enough to drive investment decisions</strong>. Use it to learn how models behave, then size real risk from better processes.";
  }

  const checklist = [
    `Combined blend: 1d ${tsFmtRet(blend1)} · 7d ${tsFmtRet(blend7)} · 30d ${tsFmtRet(blend30)} (prices ~${tsFmtPx(blendFc1, 0)} / ${tsFmtPx(blendFc7, 0)} / ${tsFmtPx(blendFc30, 0)})`,
    `Best RMSE models: 1d <strong>${tsEscape(mark1?.name || "—")}</strong> · 7d <strong>${tsEscape(mark.name)}</strong> · 30d <strong>${tsEscape(mark30?.name || "—")}</strong>`,
    `Single-mark path (7d leader): ${tsFmtPx(f1, 0)} / ${tsFmtPx(f7, 0)} / ${tsFmtPx(f30, 0)}`,
    `7d pack vote: ${h7 ? `${h7.up} up / ${h7.down} down / ${h7.flat} flat` : "—"} · agreement score ~${agreementScore}/100`,
    `OOS RMSE (7d leader) 1d/7d/30d: ${rmse1 != null ? rmse1.toFixed(4) : "—"} / ${rmse7 != null ? rmse7.toFixed(4) : "—"} / ${rmse30 != null ? rmse30.toFixed(4) : "—"}` +
      (naiveRmse7 != null ? ` · Naive 7d ${naiveRmse7.toFixed(4)}` : ""),
    `Hit rates (7d leader) 1d/7d/30d: ${hit1 != null ? `${(hit1 * 100).toFixed(0)}%` : "—"} / ${hit7 != null ? `${(hit7 * 100).toFixed(0)}%` : "—"} / ${hit30 != null ? `${(hit30 * 100).toFixed(0)}%` : "—"}`,
    `MAPE 7d/30d: ${mape7 != null ? mape7.toFixed(1) : "—"}% / ${mape30 != null ? mape30.toFixed(1) : "—"}% · N OOS 7d/30d ≈ ${n7 ?? "—"} / ${n30 ?? "—"}`,
  ];

  const ops = [
    "After a huge candle or crash, re-run the suite before you trust yesterday’s numbers.",
    "If you trade options, this page is about price path — not implied vol. Check the Volatility tab / DVOL separately.",
    "Don’t fight a clear weekly downtrend just because a 7d AR says “+1%.” Zoom out first.",
    "Big events (FOMC, major ETF headlines): cut size or hedge. These models don’t know the calendar.",
    "Perp funding can eat a correct direction if you over-leverage. Size for the stop, not for the dream.",
    "Write it down before you click: idea, entry, stop, targets, why you’re wrong.",
  ];

  const html = `
    <p class="ts-memo-disclaimer">
      Plain-language desk note from <em>this</em> model run only.
      <strong>Not investment advice.</strong> Crypto can gap through stops.
      Beating a random walk in a backtest does <em>not</em> mean next week is free money.
    </p>

    <div class="ts-memo-score ${qualityClass}">
      <div class="ts-memo-score-kicker">How much should you trust this run?</div>
      <div class="ts-memo-score-val">${quality}<span>/100</span></div>
      <div class="ts-memo-score-tier">${tsEscape(qualityTier)}</div>
    </div>

    <h3 class="ts-memo-h">0 · Combined reading of all models (start here)</h3>
    ${comboParas.map((p) => `<p>${p}</p>`).join("")}
    <div class="ts-memo-blend-box">
      <div class="ts-memo-blend-title">Working combined forecast</div>
      <div class="ts-memo-blend-grid">
        <div><span class="ts-memo-blend-k">1 day</span><strong>${tsFmtRet(blend1)}</strong><span class="ts-memo-blend-px">${tsFmtPx(blendFc1, 0)}</span></div>
        <div><span class="ts-memo-blend-k">7 days</span><strong>${tsFmtRet(blend7)}</strong><span class="ts-memo-blend-px">${tsFmtPx(blendFc7, 0)}</span></div>
        <div><span class="ts-memo-blend-k">30 days</span><strong>${tsFmtRet(blend30)}</strong><span class="ts-memo-blend-px">${tsFmtPx(blendFc30, 0)}</span></div>
      </div>
      <p class="ts-memo-note" style="margin:0.55rem 0 0">
        Blend = average of finished models with more weight on lower OOS RMSE.
        Last close ${tsFmtPx(last, 0)}. Agreement: ${tsEscape(agreementPlain)}
      </p>
    </div>

    <h3 class="ts-memo-h">1 · Quality — is this good enough?</h3>
    <p>
      We still pick a <strong>weekly champion</strong> for charts (<strong>${tsEscape(mark.name)}</strong>),
      but the combined section above is the multi-model view.
      ${ok.length} models finished · ${failed.length} failed · sample ~${suite.nObs ?? "—"} days.
    </p>
    <ul class="ts-memo-list">${qReasons.map((r) => `<li>${tsEscape(r)}</li>`).join("")}</ul>
    <p><strong>Junior cheat-sheet for “good”:</strong> (1) beats Naive, (2) hit rate not stuck at 50%, (3) models don’t all scream different directions, (4) enough OOS checkpoints. Pretty equations without those four are just decoration.</p>

    <h3 class="ts-memo-h">2 · Can you invest off this?</h3>
    <p>${investSuit}</p>
    <ul class="ts-memo-list">
      <li><strong>Long-term hold of BTC:</strong> not decided by this page. Use your investment policy.</li>
      <li><strong>Tactical add/trim (days–weeks):</strong> only if score is decent and Naive is beaten — always with a written stop.</li>
      <li><strong>Day trading / scalping:</strong> no. One-day skill is usually trash here.</li>
      <li><strong>Options:</strong> path context only; vol surface lives elsewhere.</li>
    </ul>

    <h3 class="ts-memo-h">3 · What the desk would actually do</h3>
    <p class="ts-memo-stance"><span class="ts-memo-kicker">Stance</span> <strong>${tsEscape(bias)}</strong></p>
    <p>${tsEscape(biasWhy)}</p>
    <p><strong>How long to hold the idea:</strong> ${tsEscape(posHorizon)}. ${tsEscape(posHorizonDetail)}</p>
    <p><strong>Simple product ideas:</strong>
      ${
        isLong
          ? "Spot or a defined-risk call spread if you want upside without unlimited stress. Avoid max-leverage perps until you know funding."
          : isShort
            ? "Trim spot first. If you need downside, prefer puts / put spreads over naked short perps (squeezes hurt)."
            : "No new directional bet. Watching is free. Chop markets punish overtrading."
      }
    </p>

    <h3 class="ts-memo-h">4 · Rough trade plan (entry, stop, targets)</h3>
    <p class="ts-memo-note">
      These levels are training wheels — built from the combined path and how wrong the models were in the backtest (RMSE).
      They are not “holy grail” prices. Slippage and gaps are real.
    </p>
    <ul class="ts-memo-list">
      <li><strong>Entry:</strong> ${entry}</li>
      <li><strong>Stop-loss:</strong> ${stop}</li>
      <li><strong>Take-profit 1:</strong> ${tp1}</li>
      <li><strong>Take-profit 2:</strong> ${tp2}</li>
      <li><strong>Risk vs reward:</strong> ${rr}</li>
      <li><strong>When the idea is dead:</strong> ${invalidation}</li>
      <li><strong>How big:</strong> ${sizing}</li>
      <li><strong>Noise yardstick:</strong> typical OOS error scale 1d / 7d / 30d ≈ ${sigma1.toFixed(4)} / ${sigma7.toFixed(4)} / ${sigma30.toFixed(4)} in log-return units (bigger number = models were wronger historically).</li>
    </ul>

    <h3 class="ts-memo-h">5 · Numbers to keep on one sticky note</h3>
    <ul class="ts-memo-list">${checklist.map((c) => `<li>${c}</li>`).join("")}</ul>

    <h3 class="ts-memo-h">6 · Risk checklist (don’t skip)</h3>
    <ul class="ts-memo-list">${ops.map((c) => `<li>${tsEscape(c)}</li>`).join("")}</ul>

    <h3 class="ts-memo-h">7 · Honest limits</h3>
    <ul class="ts-memo-list">
      <li>Won’t see liquidations, exchange outages, or black-swan tweets.</li>
      <li>Won’t replace order flow, options skew, or on-chain work.</li>
      <li>Won’t tell you the true probability of hitting TP before SL.</li>
      <li>Won’t stay good forever — edges rot; re-run and re-read.</li>
    </ul>

    <p class="ts-memo-footer">
      Written ${suite.asOf ? tsEscape(String(suite.asOf).replace("T", " ").slice(0, 16)) + " UTC" : "after this run"}
      · combined blend + weekly mark <strong>${tsEscape(mark.name)}</strong>
      · if price just did something insane, re-run before you trade the old memo.
    </p>
  `;
  return html;
}

function tsRenderTraderMemo(suite) {
  const host = tsEl("ts-trader-memo");
  const meta = tsEl("ts-trader-memo-meta");
  if (!host) return;
  if (!suite?.models?.length) {
    host.innerHTML =
      `<p class="ts-trader-memo-empty">Press <strong>Run all models</strong> to generate the trader memo.</p>`;
    if (meta) meta.textContent = "After estimation";
    return;
  }
  host.innerHTML = tsBuildTraderMemo(suite);
  if (meta) {
    const markName =
      suite.summary?.bestRmse7Name ||
      suite.summary?.bestModelName ||
      "suite";
    meta.textContent = [
      suite.asOf ? String(suite.asOf).replace("T", " ").slice(0, 16) + " UTC" : "",
      `mark: ${markName}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  window.decorateHelpLabels?.(
    document.querySelector('.menu-screen[data-l1="stats"][data-l2="timeseries"]'),
  );
}

function tsDrawPriceChart(suite, m) {
  const closes = suite.series?.close || [];
  const dates = suite.series?.dates || [];
  m = tsEnsureForecastBands(m);
  const path = m?.forecastPath || [];
  const lo95 = m?.forecastPathLo95 || [];
  const hi95 = m?.forecastPathHi95 || [];
  const lo80 = m?.forecastPathLo80 || [];
  const hi80 = m?.forecastPathHi80 || [];
  const n = closes.length;
  if (n < 5) return;
  const histN = Math.min(n, 120);
  const hist = closes.slice(-histN);
  const histDates = dates.slice(-histN);
  const last = hist[hist.length - 1];
  const fc = path.length ? path : [];
  const all = hist.concat(fc);
  const nAll = all.length;
  const split = hist.length;

  tsMountChart("ts-price-chart", {
    pad: { top: 16, right: 16, bottom: 28, left: 54 },
    getLength: () => nAll,
    minWindow: Math.min(40, nAll),
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const bandVals = [];
      indices.forEach((gi) => {
        if (gi < split) {
          bandVals.push(all[gi]);
        } else {
          const fi = gi - split;
          bandVals.push(all[gi], lo95[fi], hi95[fi], lo80[fi], hi80[fi]);
        }
      });
      const finite = bandVals.filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
      const minV = Math.min(...finite) * 0.995;
      const maxV = Math.max(...finite) * 1.005;
      const range = maxV - minV || 1;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      // Align band arrays to global index (history + forecast)
      const padLo = (arr) => {
        const out = new Array(split).fill(null);
        for (let i = 0; i < arr.length; i++) out.push(arr[i]);
        return out;
      };
      tsDrawBandFill(
        ctx,
        api,
        indices,
        padLo(lo95),
        padLo(hi95),
        yAt,
        "rgba(251, 191, 36, 0.12)",
        null,
      );
      tsDrawBandFill(
        ctx,
        api,
        indices,
        padLo(lo80),
        padLo(hi80),
        yAt,
        "rgba(251, 191, 36, 0.22)",
        null,
      );

      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      indices.forEach((gi, li) => {
        if (gi >= split) return;
        const x = api.xAt(li, indices.length);
        const y = yAt(all[gi]);
        if (li === 0 || indices[li - 1] >= split) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.strokeStyle = "#fbbf24";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      let started = false;
      indices.forEach((gi, li) => {
        if (gi < split - 1) return;
        const x = api.xAt(li, indices.length);
        const y = yAt(all[gi]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      if (api.hoverGlobal != null && all[api.hoverGlobal] != null) {
        api.drawCrosshair?.(api.xAtGlobal(api.hoverGlobal));
        api.drawDot?.(api.xAtGlobal(api.hoverGlobal), yAt(all[api.hoverGlobal]), "#38bdf8");
      }
      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(tsFmtPx(maxV, 0), api.pad.left - 6, api.pad.top + 10);
    },
    formatTooltip(globalIdx) {
      const isFc = globalIdx >= hist.length;
      const label = isFc
        ? `Forecast +${globalIdx - hist.length + 1}d`
        : histDates[globalIdx] || `t-${hist.length - 1 - globalIdx}`;
      const px = all[globalIdx];
      const fi = globalIdx - hist.length;
      const vsLast =
        last != null && px != null && Number(last) !== 0
          ? `${(((Number(px) - Number(last)) / Number(last)) * 100).toFixed(2)}%`
          : "—";
      let html =
        tsTipTitle(label) +
        tsTipRow("Model", m?.name || "—") +
        tsTipRow("Price (USD)", tsFmtPx(px, 0)) +
        tsTipRow("Series", isFc ? "Forecast path" : "History (close)") +
        (isFc ? tsTipRow("vs last close", vsLast) : "");
      if (isFc && lo80[fi] != null) {
        html +=
          tsTipRow("80% band", `${tsFmtPx(lo80[fi], 0)} – ${tsFmtPx(hi80[fi], 0)}`) +
          tsTipRow("95% band", `${tsFmtPx(lo95[fi], 0)} – ${tsFmtPx(hi95[fi], 0)}`);
      }
      return html;
    },
  });
  const meta = tsEl("ts-chart-price-meta");
  if (meta) {
    meta.textContent = m?.name
      ? `${m.name} · history + forecast + bands`
      : "Select a model";
  }
  const cap = tsEl("ts-cap-price");
  if (cap && m) {
    const sigNote =
      m.forecastSigmaAnn != null
        ? `σ≈${(Number(m.forecastSigmaAnn) * 100).toFixed(0)}% ann.`
        : "RW σ";
    cap.innerHTML =
      `<strong>Model:</strong> ${tsEscape(m.name)}. ` +
      `<strong>What:</strong> last ~120 daily closes (blue), multi-step USD forecast (amber dashed), ` +
      `and 80% / 95% confidence bands (amber fills; ${tsEscape(sigNote)}). ` +
      `<strong>How:</strong> hover for date or +Nd horizon, point price, and band bounds. ` +
      `Bands use SE≈σ√h on log-price — illustrative, not a full model density.`;
  }
}

function tsDrawForecastChart(m) {
  m = tsEnsureForecastBands(m);
  const path = m?.forecastPath || [];
  if (!path.length) return;
  const n = path.length;
  const last = m?.lastPrice;
  const lo95 = m.forecastPathLo95 || [];
  const hi95 = m.forecastPathHi95 || [];
  const lo80 = m.forecastPathLo80 || [];
  const hi80 = m.forecastPathHi80 || [];
  tsMountChart("ts-forecast-chart", {
    pad: { top: 16, right: 12, bottom: 28, left: 54 },
    getLength: () => n,
    minWindow: Math.min(n, 30),
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const ys = indices.map((i) => path[i]);
      const extras = indices.flatMap((i) => [lo95[i], hi95[i], lo80[i], hi80[i], last]);
      const finite = [...ys, ...extras]
        .filter((v) => v != null && Number.isFinite(Number(v)))
        .map(Number);
      const minV = Math.min(...finite) * 0.995;
      const maxV = Math.max(...finite) * 1.005;
      const range = maxV - minV || 1;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      tsDrawBandFill(ctx, api, indices, lo95, hi95, yAt, "rgba(251, 191, 36, 0.12)", null);
      tsDrawBandFill(ctx, api, indices, lo80, hi80, yAt, "rgba(251, 191, 36, 0.22)", null);

      if (last != null) {
        const y0 = yAt(last);
        ctx.strokeStyle = "rgba(148,163,184,0.35)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(api.pad.left, y0);
        ctx.lineTo(w - api.pad.right, y0);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ys.forEach((v, i) => {
        const x = api.xAt(i, indices.length);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // mark 1,7,30
      [0, 6, 29].forEach((gi) => {
        if (gi >= n) return;
        const li = indices.indexOf(gi);
        if (li < 0) return;
        api.drawDot?.(api.xAt(li, indices.length), yAt(path[gi]), "#2dd4bf");
      });
    },
    formatTooltip(globalIdx) {
      const px = path[globalIdx];
      const h = globalIdx + 1;
      const ret =
        last != null && px != null && Number(last) > 0
          ? Math.log(Number(px) / Number(last))
          : null;
      return (
        tsTipTitle(`${m?.name || "Model"} · +${h}d`) +
        tsTipRow("Forecast USD", tsFmtPx(px, 0)) +
        tsTipRow("80% band", lo80[globalIdx] != null
          ? `${tsFmtPx(lo80[globalIdx], 0)} – ${tsFmtPx(hi80[globalIdx], 0)}`
          : "—") +
        tsTipRow("95% band", lo95[globalIdx] != null
          ? `${tsFmtPx(lo95[globalIdx], 0)} – ${tsFmtPx(hi95[globalIdx], 0)}`
          : "—") +
        tsTipRow("Last close", last != null ? tsFmtPx(last, 0) : "—") +
        tsTipRow("Implied log ret", ret != null ? tsFmtRet(ret, 2) : "—") +
        tsTipRow("Read as", "Point + RW-style CI (σ√h on log-price)")
      );
    },
  });
  const meta = tsEl("ts-chart-fcast-meta");
  if (meta) {
    meta.textContent = m?.name
      ? `${m.name} · 1…${n}d + 80/95% bands`
      : "1 … 30 days ahead";
  }
  const cap = tsEl("ts-cap-fcast");
  if (cap && m) {
    cap.innerHTML =
      `<strong>Model:</strong> ${tsEscape(m.name)}. ` +
      `<strong>What:</strong> USD path for horizons 1–${n}d with 80% (darker) and 95% (lighter) confidence bands. ` +
      `Grey dashed = last sample close; green dots mark 1d / 7d / 30d. ` +
      `<strong>How:</strong> X = days ahead, Y = USD. Hover for point forecast and band bounds. ` +
      (m.forecastBandNote ? `<em>${tsEscape(m.forecastBandNote)}</em>` : "");
  }
}

function tsDrawBacktestChart(m) {
  const labels = [1, 7, 30];
  const vals = labels.map((h) => tsBtH(m, h, "rmseRet") ?? 0);
  const hits = labels.map((h) => tsBtH(m, h, "dirHitRate"));
  const ns = labels.map((h) => m?.backtest?.horizons?.[String(h)]?.n);
  if (!vals.some((v) => v > 0)) return;
  tsMountChart("ts-backtest-chart", {
    pad: { top: 16, right: 12, bottom: 28, left: 48 },
    getLength: () => labels.length,
    minWindow: labels.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const maxV = Math.max(...vals, 1e-6);
      const slot = (w - api.pad.left - api.pad.right) / labels.length;
      vals.forEach((v, i) => {
        const bh = (v / maxV) * api.chartH;
        const x = api.pad.left + i * slot + slot * 0.2;
        const y = api.pad.top + api.chartH - bh;
        ctx.fillStyle =
          api.hoverGlobal === i ? "rgba(56,189,248,0.95)" : "rgba(56,189,248,0.65)";
        ctx.fillRect(x, y, slot * 0.6, bh);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px IBM Plex Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${labels[i]}d`, x + slot * 0.3, api.pad.top + api.chartH + 14);
      });
    },
    formatTooltip(i) {
      const hit = hits[i];
      return (
        tsTipTitle(`${m?.name || "Model"} · ${labels[i]}d OOS`) +
        tsTipRow("RMSE (log return)", vals[i] ? vals[i].toFixed(4) : "—") +
        tsTipRow("Dir. hit rate", hit != null ? `${(hit * 100).toFixed(0)}%` : "—") +
        tsTipRow("Origins (N)", ns[i] != null ? String(ns[i]) : "—") +
        tsTipRow("Read as", "Lower RMSE better · hit ~50% ≈ no edge")
      );
    },
  });
  const meta = tsEl("ts-chart-bt-meta");
  if (meta) {
    meta.textContent = m?.name
      ? `${m.name} · OOS log-return RMSE`
      : "OOS log-return RMSE";
  }
  const cap = tsEl("ts-cap-bt");
  if (cap && m) {
    cap.innerHTML =
      `<strong>Model:</strong> ${tsEscape(m.name)}. ` +
      `<strong>What:</strong> expanding-window OOS RMSE of cumulative log returns at 1d / 7d / 30d. ` +
      `<strong>How:</strong> shorter bar = better skill for that horizon. Compare to Naive in the tables above.`;
  }
}

function tsDrawResidChart(m) {
  const r = (m?.residuals || []).filter((x) => Number.isFinite(Number(x))).map(Number);
  if (r.length < 15) return;
  const bins = 20;
  const minR = Math.min(...r);
  const maxR = Math.max(...r);
  const span = maxR - minR || 1;
  const counts = new Array(bins).fill(0);
  const edges = [];
  for (let i = 0; i <= bins; i++) edges.push(minR + (span * i) / bins);
  r.forEach((v) => {
    const idx = Math.min(bins - 1, Math.floor(((v - minR) / span) * bins));
    counts[idx] += 1;
  });
  const mean =
    r.reduce((a, b) => a + b, 0) / r.length;
  tsMountChart("ts-resid-chart", {
    pad: { top: 12, right: 10, bottom: 24, left: 36 },
    getLength: () => bins,
    minWindow: bins,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const maxC = Math.max(...counts, 1);
      const slot = (w - api.pad.left - api.pad.right) / bins;
      counts.forEach((c, i) => {
        const x = api.pad.left + i * slot;
        const bh = (c / maxC) * api.chartH;
        const y = api.pad.top + api.chartH - bh;
        ctx.fillStyle =
          api.hoverGlobal === i ? "rgba(167,139,250,0.95)" : "rgba(167,139,250,0.65)";
        ctx.fillRect(x + 1, y, Math.max(1, slot - 2), bh);
      });
    },
    formatTooltip(i) {
      const lo = edges[i];
      const hi = edges[i + 1];
      return (
        tsTipTitle(`${m?.name || "Model"} · residual bin`) +
        tsTipRow("Range", `${lo.toFixed(4)} … ${hi.toFixed(4)}`) +
        tsTipRow("Count", String(counts[i])) +
        tsTipRow("Share", `${((100 * counts[i]) / r.length).toFixed(1)}%`) +
        tsTipRow("Sample mean resid", mean.toFixed(5))
      );
    },
  });
  const meta = tsEl("ts-chart-resid-meta");
  if (meta) {
    meta.textContent = m?.name
      ? `${m.name} · 1-step residual hist`
      : "1-step fit residuals";
  }
  const cap = tsEl("ts-cap-resid");
  if (cap && m) {
    cap.innerHTML =
      `<strong>Model:</strong> ${tsEscape(m.name)}. ` +
      `<strong>What:</strong> histogram of approximate 1-step residuals (actual − fitted return). ` +
      `<strong>How:</strong> centered near 0 and roughly symmetric is healthier; fat tails mean understated jump risk.`;
  }
}

function tsDrawIrfChart(m) {
  const irf = m?.irf || [];
  const canvas = tsEl("ts-irf-chart");
  if (!canvas) return;
  if (!irf.length) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const w = canvas.width || canvas.clientWidth;
      const h = canvas.height || 160;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#64748b";
      ctx.font = "12px system-ui";
      ctx.fillText("Select SVAR (or a model with IRFs) to plot impulse responses.", 12, 28);
    }
    return;
  }
  // Plot BTC response to each shock over h
  const shocks = [...new Set(irf.map((r) => r.shock))];
  const maxH = Math.max(...irf.map((r) => r.h)) + 1;
  const series = shocks.map((sh) => {
    const pts = [];
    for (let h = 0; h < maxH; h++) {
      const row = irf.find((r) => r.shock === sh && r.h === h);
      pts.push(row?.BTC != null ? Number(row.BTC) : row?.btc != null ? Number(row.btc) : 0);
    }
    return { name: sh, pts };
  });
  const colors = ["#38bdf8", "#fbbf24", "#f472b6", "#2dd4bf"];
  const allY = series.flatMap((s) => s.pts);
  const minV = Math.min(...allY, 0);
  const maxV = Math.max(...allY, 0);
  tsMountChart("ts-irf-chart", {
    pad: { top: 14, right: 12, bottom: 26, left: 48 },
    getLength: () => maxH,
    minWindow: maxH,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const range = maxV - minV || 1e-6;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;
      // zero line
      ctx.strokeStyle = "rgba(148,163,184,0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(api.pad.left, yAt(0));
      ctx.lineTo(w - api.pad.right, yAt(0));
      ctx.stroke();
      ctx.setLineDash([]);
      series.forEach((s, si) => {
        ctx.strokeStyle = colors[si % colors.length];
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        s.pts.forEach((v, i) => {
          const x = api.xAt(i, maxH);
          const y = yAt(v);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
      ctx.font = "10px system-ui";
      series.forEach((s, si) => {
        ctx.fillStyle = colors[si % colors.length];
        ctx.fillText(s.name + "→BTC", api.pad.left + 8 + si * 72, api.pad.top + 10);
      });
    },
    formatTooltip(h) {
      let html =
        tsTipTitle(`SVAR · day ${h} after shock`) +
        tsTipRow("Model", m?.name || "SVAR") +
        tsTipRow("Order", (m?.ordering || []).join(" → ") || "DXY → SPX → BTC");
      series.forEach((s) => {
        html += tsTipRow(`${s.name} shock → BTC`, tsFmtNum(s.pts[h], 5));
      });
      html += tsTipRow("Read as", "Y = BTC log-return response (not price level)");
      return html;
    },
  });
  const meta = tsEl("ts-irf-meta");
  if (meta) {
    meta.textContent = m?.name
      ? `${m.name} · ${(m.ordering || []).join(" → ") || "Cholesky"}`
      : "When SVAR is selected";
  }
  const cap = tsEl("ts-cap-irf");
  if (cap && m) {
    if (irf.length) {
      cap.innerHTML =
        `<strong>Model:</strong> ${tsEscape(m.name)}. ` +
        `<strong>What:</strong> orthogonalized impulse responses of BTC returns to DXY / SPX / BTC shocks. ` +
        `<strong>How:</strong> X = days after shock; Y = BTC return response. Zero line = no effect. Recursive order: ${tsEscape((m.ordering || ["DXY", "SPX", "BTC"]).join(" → "))}.`;
    } else {
      cap.innerHTML =
        `<strong>Model:</strong> ${tsEscape(m.name)} has no IRF panel. Select <strong>SVAR</strong> in a comparison table to plot structural impulse responses.`;
    }
  }
}

function tsDrawAll(suite) {
  const m = tsSelectedModel(suite);
  tsDrawPriceChart(suite, m);
  tsDrawForecastChart(m);
  tsDrawBacktestChart(m);
  tsDrawResidChart(m);
  tsDrawIrfChart(m);
}

function tsSelectModel(id) {
  if (!tsSuite) return;
  tsSelectedId = id;
  tsRenderTable(tsSuite);
  const m = tsSelectedModel(tsSuite);
  tsRenderDetail(m, tsSuite);
  tsDrawAll(tsSuite);
}

function tsExportCsv(suite) {
  const models = suite?.models || [];
  const header = [
    "id",
    "name",
    "family",
    "status",
    "forecast1d",
    "forecast7d",
    "forecast30d",
    "return1d",
    "return7d",
    "return30d",
    "rmse1",
    "rmse7",
    "rmse30",
    "mae7",
    "hit1",
    "hit7",
    "hit30",
    "mape7",
    "mape30",
    "aic",
    "nParams",
  ];
  const lines = [header.join(",")];
  models.forEach((m) => {
    const row = {
      id: m.id,
      name: m.name,
      family: m.family,
      status: m.status,
      forecast1d: m.forecast1d,
      forecast7d: m.forecast7d,
      forecast30d: m.forecast30d,
      return1d: m.return1d,
      return7d: m.return7d,
      return30d: m.return30d,
      rmse1: tsBtH(m, 1, "rmseRet"),
      rmse7: tsBtH(m, 7, "rmseRet"),
      rmse30: tsBtH(m, 30, "rmseRet"),
      mae7: tsBtH(m, 7, "maeRet"),
      hit1: tsBtH(m, 1, "dirHitRate"),
      hit7: tsBtH(m, 7, "dirHitRate"),
      hit30: tsBtH(m, 30, "dirHitRate"),
      mape7: tsBtH(m, 7, "mapePct"),
      mape30: tsBtH(m, 30, "mapePct"),
      aic: m.aic,
      nParams: m.nParams,
    };
    lines.push(
      header
        .map((k) => {
          const v = row[k];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") ? `"${s}"` : s;
        })
        .join(","),
    );
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `btc-timeseries-models-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Matches server thinning: warm-up, then spaced origins (not daily). */
const TS_N_MODELS = 24; // keep in sync with MODEL_CATALOG length
const TS_BT_MIN_TRAIN = 365;
const TS_BT_TARGET_ORIGINS = 96;
const TS_BT_MAX_ORIGINS = 120;
const TS_BT_MIN_STEP = 7;
const TS_BT_HOLD = 30;

let tsProgressTimer = null;
let tsProgressStartedAt = 0;
let tsProgressEstSec = 45;

function tsRangeDays() {
  const v = Number(tsEl("ts-range")?.value || 3650);
  return Number.isFinite(v) && v > 0 ? v : 3650;
}

function tsRangeLabel(days) {
  const map = {
    365: "1Y",
    730: "2Y",
    1095: "3Y",
    1825: "5Y",
    2555: "7Y",
    3650: "10Y",
    5475: "15Y",
    8000: "All",
  };
  return map[days] || `${days}d`;
}

function tsEstimateOrigins(days) {
  const n = Math.max(180, Math.min(Math.floor(days), 8000));
  const minTrain = Math.min(TS_BT_MIN_TRAIN, Math.max(120, Math.floor(n / 3)));
  const lastOrigin = n - TS_BT_HOLD - 1;
  if (lastOrigin <= minTrain) {
    return { nEst: 0, step: null, minTrain, span: 0, n };
  }
  const span = lastOrigin - minTrain;
  let step = Math.max(TS_BT_MIN_STEP, Math.ceil(span / TS_BT_TARGET_ORIGINS));
  let nEst = Math.floor(span / step) + 1;
  if (nEst > TS_BT_MAX_ORIGINS) {
    step = Math.max(TS_BT_MIN_STEP, Math.ceil(span / TS_BT_MAX_ORIGINS));
    nEst = Math.floor(span / step) + 1;
  }
  return { nEst, step, minTrain, span, n };
}

/** Rough wall-clock seconds for full suite (fit + backtest). Calibrated loosely. */
function tsEstimateRuntimeSec(days) {
  const { nEst, n } = tsEstimateOrigins(days);
  // fixed overhead (history + macro yfinance) + per model×origin re-fit cost
  const overhead = n > 2500 ? 18 : n > 1000 ? 12 : 8;
  const perFit = 0.028; // seconds per model-origin (numpy-heavy path)
  const smBump = 1.35; // statsmodels ARIMA/ETS slower when available
  return Math.max(12, Math.round(overhead + TS_N_MODELS * nEst * perFit * smBump));
}

function tsFmtDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `~${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `~${m}m ${r}s` : `~${m}m`;
}

function tsUpdateRangeInfo() {
  const days = tsRangeDays();
  const label = tsRangeLabel(days);
  const { nEst, step, minTrain, n } = tsEstimateOrigins(days);
  const estSec = tsEstimateRuntimeSec(days);
  const body = tsEl("ts-range-info-body");
  const list = tsEl("ts-range-info-list");
  if (body) {
    body.innerHTML =
      `Range <strong>${tsEscape(label)}</strong> (~${n.toLocaleString()} daily observations). ` +
      `Estimation does <strong>not</strong> start until you press <strong>Run all models</strong>.`;
  }
  if (list) {
    list.innerHTML = [
      `<li><strong>Warm-up (not scored):</strong> first ~${minTrain} days are used only to start the expanding window.</li>`,
      `<li><strong>Expected N OOS:</strong> about <strong>${nEst}</strong> origin dates` +
        (step != null
          ? ` (one origin every ~${step} days after warm-up — not every calendar day)`
          : "") +
        `. Longer ranges raise N OOS up to ~${TS_BT_MAX_ORIGINS} for speed.</li>`,
      `<li><strong>What N OOS is not:</strong> it is not equal to ${n.toLocaleString()} (sample length). It is the number of re-fit / forecast checkpoints in the backtest.</li>`,
      `<li><strong>Rough runtime:</strong> ${tsFmtDuration(estSec)} for ~${TS_N_MODELS} models × ~${nEst} origins (depends on machine and whether statsmodels is installed).</li>`,
      `<li><strong>After run:</strong> tables sort by OOS RMSE; click a row for charts. KPIs use the best 7d RMSE model by default.</li>`,
    ].join("");
  }
  const meta = tsEl("ts-suite-meta");
  if (meta && !tsBusy) {
    meta.textContent = tsSuite
      ? [
          tsSuite.pair || "BTC/USD",
          tsSuite.nObs != null ? `${tsSuite.nObs} obs` : "",
          `range ${label}`,
          tsSuite.fromCache ? "cached" : "last run",
        ]
          .filter(Boolean)
          .join(" · ")
      : `Range ${label} · press Run all models`;
  }
}

function tsSetProgress(pct, title, detail, etaText) {
  const wrap = tsEl("ts-progress");
  const fill = tsEl("ts-progress-fill");
  const bar = tsEl("ts-progress-bar");
  const titleEl = tsEl("ts-progress-title");
  const etaEl = tsEl("ts-progress-eta");
  const detailEl = tsEl("ts-progress-detail");
  if (!wrap) return;
  wrap.hidden = false;
  const p = Math.max(0, Math.min(99.5, pct));
  if (fill) fill.style.width = `${p}%`;
  if (bar) bar.setAttribute("aria-valuenow", String(Math.round(p)));
  if (titleEl && title) titleEl.textContent = title;
  if (etaEl && etaText != null) etaEl.textContent = etaText;
  if (detailEl && detail) detailEl.textContent = detail;
}

function tsStartProgress(days) {
  tsProgressEstSec = tsEstimateRuntimeSec(days);
  tsProgressStartedAt = Date.now();
  const { nEst, step } = tsEstimateOrigins(days);
  const label = tsRangeLabel(days);
  if (tsProgressTimer) clearInterval(tsProgressTimer);
  tsSetProgress(
    2,
    `Estimating · ${label}`,
    `Loading history, fitting ~${TS_N_MODELS} models, OOS backtest (~${nEst} origins` +
      (step != null ? `, every ~${step}d` : "") +
      `)…`,
    `Est. total ${tsFmtDuration(tsProgressEstSec)}`,
  );
  tsProgressTimer = setInterval(() => {
    if (!tsBusy) return;
    const elapsed = (Date.now() - tsProgressStartedAt) / 1000;
    // Asymptotic curve toward ~92% until the request finishes
    const t = elapsed / Math.max(8, tsProgressEstSec);
    const pct = 4 + 88 * (1 - Math.exp(-1.6 * t));
    const remain = Math.max(0, tsProgressEstSec - elapsed);
    const phase =
      elapsed < 4
        ? "Fetching BTC history / macro series…"
        : elapsed < tsProgressEstSec * 0.35
          ? "Fitting univariate models…"
          : elapsed < tsProgressEstSec * 0.75
            ? "Expanding-window backtests (slowest step)…"
            : "Multivariate / wrapping up…";
    tsSetProgress(
      pct,
      `Estimating · ${label}`,
      phase,
      remain > 2
        ? `~${tsFmtDuration(remain)} remaining (rough)`
        : "Finishing soon…",
    );
  }, 400);
}

function tsFinishProgress(ok, message) {
  if (tsProgressTimer) {
    clearInterval(tsProgressTimer);
    tsProgressTimer = null;
  }
  const elapsed = (Date.now() - tsProgressStartedAt) / 1000;
  const wrap = tsEl("ts-progress");
  const fill = tsEl("ts-progress-fill");
  const bar = tsEl("ts-progress-bar");
  if (fill) fill.style.width = "100%";
  if (bar) bar.setAttribute("aria-valuenow", "100");
  tsSetProgress(
    100,
    ok ? "Estimation complete" : "Estimation failed",
    message || (ok ? "Rendering tables and charts…" : "See error below."),
    ok ? `Done in ${tsFmtDuration(elapsed)}` : "—",
  );
  if (wrap) {
    wrap.classList.toggle("ts-progress--done", !!ok);
    wrap.classList.toggle("ts-progress--fail", !ok);
  }
  // Hide progress after a short beat when successful
  if (ok) {
    setTimeout(() => {
      if (wrap && !tsBusy) wrap.hidden = true;
      if (wrap) {
        wrap.classList.remove("ts-progress--done", "ts-progress--fail");
      }
      if (fill) fill.style.width = "0%";
    }, 2200);
  }
}

async function tsRun(force = true) {
  if (tsBusy) return;
  tsBusy = true;
  const btn = tsEl("ts-run-all");
  const prev = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Running…";
  }
  const days = String(tsRangeDays());
  tsUpdateRangeInfo();
  tsStartProgress(Number(days));
  const q = new URLSearchParams({ days });
  // Always refresh on explicit button press so range changes are honored
  if (force) q.set("refresh", "1");
  try {
    const res = await fetch(`${TS_API}?${q}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    tsFinishProgress(
      true,
      `${data.models?.length || 0} models · ${data.nObs ?? "—"} obs · rendering…`,
    );
    tsSuite = data;
    tsSelectedId =
      data.selection?.selectedId ||
      data.bestByHit7d ||
      data.summary?.bestModelId ||
      data.bestByRmse7d ||
      data.models?.[0]?.id ||
      null;
    tsRenderKpis(data);
    tsRenderTable(data);
    const m = tsSelectedModel(data);
    tsRenderDetail(m, data);
    tsRenderGuide(data);
    tsRenderCommentary(data);
    tsDrawAll(data);
    tsUpdateRangeInfo();
  } catch (err) {
    console.error("[ts suite]", err);
    tsFinishProgress(false, err.message || "Request failed");
    const host = tsEl("ts-run-commentary");
    if (host) {
      host.innerHTML = `<p class="vol-warn">Failed to run suite: ${tsEscape(err.message)}</p>`;
    }
    TS_HORIZONS.forEach((hz) => {
      const b = tsEl(hz.bodyId);
      if (b) {
        b.innerHTML = `<tr><td colspan="16">Error: ${tsEscape(err.message)}</td></tr>`;
      }
    });
  } finally {
    tsBusy = false;
    if (btn) {
      btn.disabled = false;
      if (prev) btn.textContent = prev;
    }
  }
}

function initTimeSeriesModule() {
  const screen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="timeseries"]',
  );
  if (!screen || screen.dataset.tsBound) return;
  screen.dataset.tsBound = "true";
  tsEl("ts-run-all")?.addEventListener("click", () => tsRun(true));
  tsEl("ts-export-csv")?.addEventListener("click", () => {
    if (tsSuite) tsExportCsv(tsSuite);
  });
  // Range change only updates the explanation — does not estimate
  tsEl("ts-range")?.addEventListener("change", () => {
    tsUpdateRangeInfo();
    if (tsSuite) {
      const meta = tsEl("ts-suite-meta");
      if (meta) {
        meta.textContent = `${meta.textContent.split("·")[0]?.trim() || "BTC/USD"} · range changed — press Run all models`;
      }
    }
  });
  tsUpdateRangeInfo();
  window.decorateHelpLabels?.(screen);
}

window.refreshTimeSeriesCharts = function () {
  initTimeSeriesModule();
  tsUpdateRangeInfo();
  // Never auto-estimate on navigation — only redraw if a suite already exists
  if (tsSuite) {
    tsDrawAll(tsSuite);
  }
};

window.loadTimeSeriesSuite = () => tsRun(true);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTimeSeriesModule);
} else {
  initTimeSeriesModule();
}
