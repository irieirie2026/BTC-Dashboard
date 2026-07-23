/**
 * Stats → Volatility — ARCH/GARCH suite UI.
 * Fetches /api/stats/volatility and renders comparison + charts + desk insights.
 */

const VOL_API = "/api/stats/volatility";
const VOL_ANN = 365;

let volSuite = null;
let volSelectedId = null;
let volBusy = false;

const volEl = (id) => document.getElementById(id);

function volFmtPct(x, d = 1) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  return `${(Number(x) * 100).toFixed(d)}%`;
}

function volFmtNum(x, d = 4) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  const n = Number(x);
  if (Math.abs(n) >= 1000) return n.toFixed(2);
  if (Math.abs(n) < 0.0001 && n !== 0) return n.toExponential(2);
  return n.toFixed(d);
}

function volStars(p) {
  if (p == null || !Number.isFinite(p)) return "";
  if (p < 0.01) return "***";
  if (p < 0.05) return "**";
  if (p < 0.1) return "*";
  return "";
}

function volEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function volFetchSuite(force = false) {
  const days = volEl("vol-range")?.value || "1095";
  const dist = volEl("vol-dist")?.value || "t";
  const url = `${VOL_API}?days=${encodeURIComponent(days)}&dist=${encodeURIComponent(dist)}${
    force ? "&refresh=1" : ""
  }`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Volatility ${res.status}`);
  return data;
}

function volSetKpis(suite) {
  const s = suite?.summary || {};
  const set = (id, text) => {
    const n = volEl(id);
    if (n) n.textContent = text;
  };
  set("vol-kpi-cond", volFmtPct(s.currentCondVolAnn, 1));
  set(
    "vol-kpi-cond-sub",
    s.bestModelName ? `${s.bestModelName} · latest` : "Best model · latest",
  );
  const f1 = s.forecast1d != null ? volFmtPct(s.forecast1d, 1) : "—";
  const f7 = s.forecast7d != null ? volFmtPct(s.forecast7d, 1) : "—";
  const f30 = s.forecast30d != null ? volFmtPct(s.forecast30d, 1) : "—";
  set("vol-kpi-fcast", `${f1} / ${f7} / ${f30}`);
  set("vol-kpi-best", s.bestModelName || "—");
  set("vol-kpi-best-sub", s.bestModelId ? `id: ${s.bestModelId}` : "by AIC");
  const pers =
    s.persistence != null ? Number(s.persistence).toFixed(3) : "—";
  const hl =
    s.halfLifeDays != null && Number.isFinite(s.halfLifeDays)
      ? `${Number(s.halfLifeDays).toFixed(1)}d`
      : "—";
  set("vol-kpi-persist", `${pers} · ${hl}`);
  set("vol-kpi-unc", volFmtPct(s.unconditionalVolAnn, 1));
  set("vol-kpi-regime", s.regime || "—");
}

function volRenderTable(suite) {
  const body = volEl("vol-compare-body");
  if (!body) return;
  const models = suite.models || [];
  if (!models.length) {
    body.innerHTML = `<tr><td colspan="15">No models returned.</td></tr>`;
    return;
  }
  const bestAic = suite.bestByAic;
  const bestBic = suite.bestByBic;
  const bestQ = suite.bestByQlike;
  const qlikeFmt = (m) => {
    const q = m.backtest?.meanQlike;
    return q != null && Number.isFinite(Number(q)) ? Number(q).toFixed(3) : "—";
  };
  const qlikeH = (m, h) => {
    const q = m.backtest?.horizons?.[String(h)]?.qlike;
    return q != null && Number.isFinite(Number(q)) ? Number(q).toFixed(3) : "—";
  };
  body.innerHTML = models
    .map((m) => {
      const sel = m.id === volSelectedId ? " vol-row--selected" : "";
      const best =
        m.id === bestAic
          ? " vol-row--best-aic"
          : m.id === bestQ
            ? " vol-row--best-qlike"
            : m.id === bestBic
              ? " vol-row--best-bic"
              : "";
      const status =
        m.status === "ok"
          ? m.warning
            ? "fallback"
            : "ok"
          : "failed";
      // Rank badges live in their own rightmost column (no overlap with long names like GJR-GARCH)
      const rankBits = [];
      if (m.id === bestAic) rankBits.push('<span class="vol-badge">AIC</span>');
      if (m.id === bestBic) rankBits.push('<span class="vol-badge vol-badge--bic">BIC</span>');
      if (m.id === bestQ) rankBits.push('<span class="vol-badge vol-badge--qlike">QLIKE</span>');
      const rankHtml = rankBits.length
        ? `<div class="vol-rank-cell">${rankBits.join("")}</div>`
        : `<span class="vol-rank-empty">—</span>`;

      // Same desk verdict as detail panel: is this fit usable as a Deribit RV mark?
      const verdict = volBuildVerdict(volRowAsDetail(m), suite);
      const deribitHtml = verdict
        ? `<span class="vol-deribit-use ${verdict.tierClass}" title="${volEscape(
            `${verdict.tier} · confidence ${verdict.score}%`,
          )}"><span class="vol-deribit-label">${volEscape(
            verdict.tableLabel || verdict.shortTier,
          )}</span><span class="vol-deribit-conf mono">${verdict.score}%</span></span>`
        : `<span class="vol-deribit-use vol-deribit-use--na">—</span>`;

      const icNote =
        m.icComparable === false
          ? m.icNote ||
            "HAR AIC/BIC are on the RV residual, not returns — not comparable to GARCH ICs."
          : "";
      const aicCell =
        m.aic != null
          ? m.icComparable === false
            ? `<span class="vol-ic-noncmp" title="${volEscape(icNote)}">${volFmtNum(m.aic, 2)}†</span>`
            : volFmtNum(m.aic, 2)
          : "—";
      const bicCell =
        m.bic != null
          ? m.icComparable === false
            ? `<span class="vol-ic-noncmp" title="${volEscape(icNote)}">${volFmtNum(m.bic, 2)}†</span>`
            : volFmtNum(m.bic, 2)
          : "—";

      return `<tr class="vol-row${sel}${best}" data-vol-id="${volEscape(m.id)}" tabindex="0" role="button">
        <td class="vol-td-text vol-td-model">${volEscape(m.name)}</td>
        <td class="vol-td-text">${volEscape(m.family)}</td>
        <td class="mono vol-td-num">${volFmtNum(m.logLikelihood, 2)}</td>
        <td class="mono vol-td-num">${aicCell}</td>
        <td class="mono vol-td-num">${bicCell}</td>
        <td class="mono vol-td-num">${qlikeFmt(m)}</td>
        <td class="mono vol-td-num">${qlikeH(m, 7)}</td>
        <td class="mono vol-td-num">${qlikeH(m, 30)}</td>
        <td class="mono vol-td-num">${m.nParams ?? "—"}</td>
        <td class="mono vol-td-num">${m.persistence != null ? Number(m.persistence).toFixed(3) : "—"}</td>
        <td class="mono vol-td-num">${
          m.halfLifeDays != null && Number.isFinite(m.halfLifeDays)
            ? Number(m.halfLifeDays).toFixed(1)
            : "—"
        }</td>
        <td class="mono vol-td-num">${volFmtPct(m.currentCondVolAnn, 1)}</td>
        <td class="vol-td-text"><span class="vol-status vol-status--${status}">${volEscape(status)}</span></td>
        <td class="vol-td-text vol-td-deribit">${deribitHtml}</td>
        <td class="vol-td-rank">${rankHtml}</td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll(".vol-row").forEach((tr) => {
    const activate = () => {
      const id = tr.getAttribute("data-vol-id");
      if (id) volSelectModel(id);
    };
    tr.addEventListener("click", activate);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });

  const screen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="volatility"]',
  );
  window.decorateHelpLabels?.(screen || volEl("vol-compare-table"));
}

/** Desk commentary for the full estimation run (bottom of page). */
function volBuildRunCommentary(suite) {
  const models = suite.models || [];
  const ok = models.filter((m) => m.status === "ok");
  const failed = models.filter((m) => m.status === "failed");
  const fallback = ok.filter((m) => m.warning);
  const s = suite.summary || {};
  const lines = [];

  const range =
    suite.startDate && suite.endDate
      ? `${suite.startDate} → ${suite.endDate}`
      : "selected sample";
  lines.push(
    `This run covers <strong>${suite.nObs ?? "—"}</strong> daily log returns on ` +
      `<strong>${volEscape(suite.pair || "BTC")}</strong> (${volEscape(range)}), ` +
      `error distribution <strong>${volEscape(suite.distribution || "t")}</strong>, ` +
      `annualization <strong>${volEscape(suite.annualization || "√365")}</strong>. ` +
      `Engine: <strong>${suite.archAvailable ? "arch (full suite)" : "NumPy fallback"}</strong>` +
      `${suite.fromCache ? " · served from cache" : " · freshly estimated"}.`,
  );

  lines.push(
    `<strong>${ok.length}</strong> of <strong>${models.length}</strong> specifications converged` +
      (failed.length
        ? `; <strong>${failed.length}</strong> failed (${failed
            .map((m) => volEscape(m.name))
            .join(", ")}).`
        : ".") +
      (fallback.length
        ? ` <strong>${fallback.length}</strong> used a GARCH(1,1) fallback because the preferred engine was unavailable for that family.`
        : ""),
  );

  const har = ok.find((m) => m.id === "har_rv" || m.engine === "har-numpy");
  if (har && har.aic != null) {
    lines.push(
      `<strong>HAR-RV AIC/BIC look very different from GARCH models — that is expected and correct for the math, but not comparable.</strong> ` +
        `GARCH-family AIC/BIC are information criteria on the <em>return</em> likelihood (arch / NumPy GARCH). ` +
        `HAR-RV’s AIC/BIC are Gaussian criteria on the <em>realized-variance regression residual</em> (Parkinson or squared-return RV). ` +
        `Different dependent variable and residual scale ⇒ HAR numbers can sit far below (or off-scale vs) GARCH. ` +
        `They remain valid for describing the HAR fit itself (and R² ${
          har.rSquared != null ? Number(har.rSquared).toFixed(2) : "—"
        }), but <strong>suite AIC/BIC badges exclude HAR</strong>. Rank HAR against peers with <strong>QLIKE</strong> and forecast paths only.` +
        (suite.icRankingNote ? ` ${volEscape(suite.icRankingNote)}` : ""),
    );
  }

  if (s.bestModelName) {
    const bestRow = ok.find((m) => m.id === s.bestModelId || m.name === s.bestModelName);
    const aic = bestRow?.aic != null ? volFmtNum(bestRow.aic, 2) : "—";
    const bicBest = suite.bestByBic;
    const bicRow = ok.find((m) => m.id === bicBest);
    const agree =
      suite.bestByAic && suite.bestByBic && suite.bestByAic === suite.bestByBic
        ? "AIC and BIC agree on the same GARCH-family specification"
        : bicRow
          ? `BIC prefers <strong>${volEscape(bicRow.name)}</strong> instead — treat IC ranking as informative, not absolute`
          : "BIC ranking unavailable";
    lines.push(
      `Among return-likelihood models, information criteria pick <strong>${volEscape(s.bestModelName)}</strong> as the AIC leader (AIC ${aic}). ${agree}.`,
    );
  } else {
    lines.push(
      "No successful GARCH-family AIC ranking this run — check failed models and re-estimate after installing <code>arch</code> if needed.",
    );
  }

  if (s.bestForecastModelName) {
    lines.push(
      `For <strong>forecast accuracy</strong> (expanding-window OOS, QLIKE ↓), the leader is ` +
        `<strong>${volEscape(s.bestForecastModelName)}</strong>` +
        (s.bestForecastQlike != null
          ? ` (mean QLIKE ${Number(s.bestForecastQlike).toFixed(3)})`
          : "") +
        `. This is the preferred <strong>physical RV mark</strong> for Deribit (vs DVOL / mid IV). ` +
        `Use AIC only for in-sample description among GARCH specs.`,
    );
  }

  const markName = s.markModelName || s.bestForecastModelName || s.bestModelName;
  if (s.persistence != null || s.halfLifeDays != null || s.regime) {
    const pers =
      s.persistence != null ? Number(s.persistence).toFixed(3) : "—";
    const hl =
      s.halfLifeDays != null && Number.isFinite(Number(s.halfLifeDays))
        ? `${Number(s.halfLifeDays).toFixed(1)} days`
        : "—";
    const tone =
      s.persistence != null && s.persistence > 0.97
        ? "Very high persistence implies shocks die slowly — risk limits should not assume a quick mean-revert."
        : s.persistence != null && s.persistence > 0.9
          ? "Elevated persistence: multi-day risk budgets matter more than single-session moves."
          : "Moderate persistence: volatility shocks decay on a shorter horizon.";
    lines.push(
      `Mark model (${volEscape(markName || "—")}) persistence ≈ <strong>${pers}</strong>, half-life ≈ <strong>${hl}</strong>, ` +
        `latest cond. vol <strong>${volFmtPct(s.currentCondVolAnn, 1)}</strong>` +
        (s.unconditionalVolAnn != null
          ? ` vs long-run <strong>${volFmtPct(s.unconditionalVolAnn, 1)}</strong>`
          : "") +
        (s.regime ? ` → regime <strong>${volEscape(s.regime)}</strong>. ` : ". ") +
        tone,
    );
  }

  const f1 = s.forecast1d;
  const f7 = s.forecast7d;
  const f30 = s.forecast30d;
  if (f1 != null || f7 != null || f30 != null) {
    lines.push(
      `Multi-step annualized RV forecasts (mark model): ` +
        `1d <strong>${volFmtPct(f1, 1)}</strong>, 7d <strong>${volFmtPct(f7, 1)}</strong>, 30d <strong>${volFmtPct(f30, 1)}</strong>. ` +
        `Map 7d ≈ Deribit weekly, 30d ≈ monthly when comparing to option IV.`,
    );
  }

  // Family spread among successful fits
  const families = {};
  ok.forEach((m) => {
    families[m.family] = (families[m.family] || 0) + 1;
  });
  const famBits = Object.entries(families)
    .map(([k, v]) => `${v}× ${k}`)
    .join(", ");
  if (famBits) {
    lines.push(
      `Successful fits by family: ${volEscape(famBits)}. ` +
        `Asymmetric (EGARCH/GJR/APARCH) and long-memory (FIGARCH) specs are most relevant when BTC shows crash leverage or slow vol decay; HAR-RV is the OHLC forecast benchmark.`,
    );
  }

  return lines;
}

/**
 * Structured Deribit trade plan from suite marks (rule-based, educational).
 * Live DVOL/IV is not in this payload — plan is gated on IV − model_RV.
 */
function volBuildDeribitTradePlan(suite) {
  const models = suite.models || [];
  const ok = models.filter((m) => m.status === "ok");
  const s = suite.summary || {};
  const markId = s.markModelId || suite.bestByQlike || suite.bestByAic;
  const mark =
    ok.find((m) => m.id === markId) ||
    ok.find((m) => m.id === suite.bestByQlike) ||
    ok.find((m) => m.id === suite.bestByAic) ||
    ok[0];
  if (!mark) {
    return {
      stance: "No trade",
      html: `<p class="vol-plan-empty">No converged models — cannot draft a Deribit plan. Fix estimation and re-run.</p>`,
    };
  }

  const verdict = volBuildVerdict(volRowAsDetail(mark), suite);
  const f = mark.forecastAnn || [];
  const rv1 = f[0] != null ? Number(f[0]) : s.forecast1d != null ? Number(s.forecast1d) : null;
  const rv7 = f[6] != null ? Number(f[6]) : s.forecast7d != null ? Number(s.forecast7d) : null;
  const rv30 =
    f[29] != null ? Number(f[29]) : s.forecast30d != null ? Number(s.forecast30d) : null;
  const cur =
    mark.currentCondVolAnn != null
      ? Number(mark.currentCondVolAnn)
      : s.currentCondVolAnn != null
        ? Number(s.currentCondVolAnn)
        : null;
  const unc =
    mark.unconditionalVolAnn != null
      ? Number(mark.unconditionalVolAnn)
      : s.unconditionalVolAnn != null
        ? Number(s.unconditionalVolAnn)
        : null;
  const pers = mark.persistence != null ? Number(mark.persistence) : s.persistence;
  const conf = verdict?.score ?? 0;
  const usable = verdict?.tableLabel === "Yes";
  const crossOnly = verdict?.tableLabel === "Cross-check only";

  // Term-structure slope of model RV (ann.)
  let slope = "flat";
  if (rv7 != null && rv30 != null) {
    const d = rv30 - rv7;
    if (d > 0.03) slope = "upward";
    else if (d < -0.03) slope = "downward";
  }

  let pathBias = "neutral";
  if (rv1 != null && rv30 != null) {
    if (rv30 > rv1 * 1.08) pathBias = "rising RV path";
    else if (rv30 < rv1 * 0.92) pathBias = "falling RV path";
  }

  let regime = s.regime || "unknown";
  if (!s.regime && cur != null && unc != null && unc > 0) {
    if (cur > unc * 1.15) regime = "elevated vs long-run";
    else if (cur < unc * 0.85) regime = "subdued vs long-run";
    else regime = "near long-run";
  }

  // Suggested primary stance (always conditional on live IV gate)
  let stance;
  let structure;
  let why;
  let entryGate;
  let invalidation;
  let altStructure;

  if (!usable && !crossOnly) {
    stance = "No trade (model not fit for marks)";
    structure = "Flat — do not open a new Deribit options book from this run.";
    why =
      "Desk confidence is below the usable threshold (or OOS is missing). Trading IV vs a weak RV mark is how books bleed slowly.";
    entryGate = "N/A — re-run with arch installed, longer sample, and a usable QLIKE leader first.";
    invalidation = "N/A";
    altStructure = "If you must express a view, use only liquid DVOL futures / listed vol products with your own RV source.";
  } else if (conf < 55) {
    stance = "No new risk / paper only";
    structure = "Watchlist only — optional 1-lot paper straddle to track IV−RV, not live size.";
    why = `Confidence ${conf}% is marginal. Edge after fees, funding, and jump risk is unreliable.`;
    entryGate = "Do not enter live until confidence ≥ 70% with a clean QLIKE leader.";
    invalidation = "Any live fill under this confidence is self-invalidating for process.";
    altStructure = "Prefer reducing existing vol exposure if already short premium into event risk.";
  } else if (regime.toLowerCase().includes("elevat") || (cur != null && unc != null && cur > unc * 1.2)) {
    stance = "Long vol bias (buy premium) — conditional";
    structure =
      "Primary: long 7d–14d ATM straddle (or 25Δ strangle) on BTC options, delta-hedged 1×/day. " +
      "Secondary: long risk-reversal (long 25Δ put / short 25Δ call) if you also want crash convexity.";
    why =
      `Mark RV is in an elevated regime (${volFmtPct(cur, 1)} vs long-run ${volFmtPct(unc, 1)}). ` +
      `High realized/conditional vol clusters often underprice left-tail convexity when IV has not fully caught up, ` +
      `and short-vol into elevated regimes has poor skew/jump asymptotics. Path bias: ${pathBias}, term slope ${slope}.`;
    entryGate =
      `Enter long premium only if Deribit mid IV (matching tenor) ≤ model RV + 2 vol pts ` +
      `(use 7d mark ${volFmtPct(rv7, 1)} for weeklies, 30d mark ${volFmtPct(rv30, 1)} for monthlies). ` +
      `If IV already ≫ model RV by ≥ 8–10 pts, skip long vol — premium is rich; stand aside or consider defined-risk short structures only with hard stops.`;
    invalidation =
      "Exit long premium if: (1) IV−RV compresses to flat while spot is quiet for 3+ sessions, " +
      "(2) you lose > 1.5× initial debit, (3) FOMC/ETF/ macro event is inside 24h and you are not paid for it, " +
      "or (4) mark model QLIKE leader flips and new RV is ≥ 5 pts lower.";
    altStructure =
      "If IV is very rich vs mark (IV − RV ≥ 10 pts): short 30d iron condor / iron butterfly with wings ≥ 1.5× weekly ATR, " +
      "size small, buy crash puts as budgeted hedge (do not naked short wings).";
  } else if (regime.toLowerCase().includes("subdu") || (cur != null && unc != null && cur < unc * 0.85)) {
    stance = "Short vol bias (sell premium) — conditional, defined risk";
    structure =
      "Primary: short 14d–30d iron condor (sell 16Δ / buy 5–8Δ wings) or short iron fly around ATM, delta-hedged. " +
      "Avoid naked short straddles. Prefer monthly over weekly if persistence is high.";
    why =
      `Mark RV is subdued (${volFmtPct(cur, 1)} vs long-run ${volFmtPct(unc, 1)}). ` +
      `When IV still prices a high vol risk premium over model RV, selective premium selling has a statistical edge — ` +
      `but BTC jump risk means wings and size matter more than the point forecast. Path: ${pathBias}, slope ${slope}.`;
    entryGate =
      `Sell premium only if Deribit mid IV − model RV ≥ 5 vol pts on the trade tenor ` +
      `(weekly vs ${volFmtPct(rv7, 1)}, monthly vs ${volFmtPct(rv30, 1)}). ` +
      `Require DVOL term structure not in backwardation crash mode, and no major event inside 48h unless wings are paid.`;
    invalidation =
      "Cover / flip if: (1) spot 1d move > 2.5× model daily vol, (2) IV−RV collapses below 2 pts, " +
      "(3) cond. vol jumps > 20% relative in one day, (4) funding/liquidation cascade, " +
      "or (5) loss > 50% of credit received.";
    altStructure =
      "If IV is already cheap (IV ≤ model RV): do not short vol — stand aside or buy cheap 30d 25Δ strangle as lottery convexity with small debit.";
  } else {
    stance = "Neutral / relative-value vol — conditional";
    structure =
      "Calendar: short front weekly straddle / long back monthly straddle (or reverse if front IV is cheap), " +
      "delta-hedged. Aim to monetize term-structure mispricing vs 7d vs 30d model marks.";
    why =
      `Mark RV is near long-run (${volFmtPct(cur, 1)} vs ${volFmtPct(unc, 1)}). ` +
      `No strong absolute long/short vol edge from regime alone. Edge is in IV vs model_RV and in 7d/30d slope (${slope}, path ${pathBias}).`;
    entryGate =
      `Long the side of the calendar that is cheap vs model: if front IV − ${volFmtPct(rv7, 1)} is much larger than back IV − ${volFmtPct(rv30, 1)}, ` +
      `prefer short front / long back. Reverse if the front is cheap. Minimum edge 3+ vol pts after bid/ask.`;
    invalidation =
      "Unwind if both tenors reprice to within 1 vol pt of model marks, or if total calendar P&L < −1× net debit/credit cap.";
    altStructure =
      "If no calendar edge: flat. Optional 1-lot ATM straddle as a volatility observation position only.";
  }

  // Sizing from conf + vol level
  const dailyVol =
    cur != null && Number.isFinite(cur) ? cur / Math.sqrt(365) : null;
  const notionalHint =
    conf >= 75 ? "0.25–0.5% of options book NAV risk (defined max loss)" : "0.1–0.25% of NAV risk (defined max loss)";
  const maxLossHint =
    dailyVol != null
      ? `Cap max loss ≈ ${notionalHint}; rough 1d spot move at 1σ ≈ ${volFmtPct(dailyVol, 2)} of spot.`
      : `Cap max loss ≈ ${notionalHint}.`;

  const greeks =
    stance.startsWith("Long")
      ? "Target near-zero delta (±5%); long vega; long gamma; short theta. Hedge delta at least once per day or on 1σ spot moves."
      : stance.startsWith("Short")
        ? "Target near-zero delta (±5%); short vega; short gamma; long theta. Hard vega budget; buy wings. Hedge delta intraday on large moves."
        : "Calendar: net vega depends on weights — keep net delta flat; watch weekend theta on weeklies.";

  const checks = [
    `Primary mark model: <strong>${volEscape(mark.name)}</strong> (QLIKE preferred; conf <strong>${conf}%</strong> · ${volEscape(verdict?.tableLabel || "—")})`,
    `RV anchors (ann.): 1d <strong>${volFmtPct(rv1, 1)}</strong> · 7d <strong>${volFmtPct(rv7, 1)}</strong> · 30d <strong>${volFmtPct(rv30, 1)}</strong>`,
    `Regime: <strong>${volEscape(String(regime))}</strong> · persistence <strong>${pers != null ? Number(pers).toFixed(3) : "—"}</strong> · slope <strong>${slope}</strong>`,
    `Venue / underlying: <strong>Deribit BTC options</strong> (settle vs Deribit index; use BTC-PERPETUAL only for delta hedge, not as the vol view)`,
    `Compare live: DVOL + option mid IV for the chosen expiry vs model RV for matching calendar days (premium ≈ IV − model_RV)`,
  ];

  const steps = [
    `<strong>Stance:</strong> ${volEscape(stance)}`,
    `<strong>Why:</strong> ${why}`,
    `<strong>Structure:</strong> ${structure}`,
    `<strong>Alternate:</strong> ${altStructure}`,
    `<strong>Entry gate (must pass):</strong> ${entryGate}`,
    `<strong>Invalidation / exit:</strong> ${invalidation}`,
    `<strong>Tenors:</strong> Prefer weeklies for 7d mark, monthlies for 30d mark; avoid holding short premium through known high-impact events unless wings are paid.`,
    `<strong>Delta / Greeks:</strong> ${greeks}`,
    `<strong>Sizing:</strong> ${maxLossHint} Scale down if arch fallback models dominate or multi-model disagreement on RV &gt; 8 vol pts.`,
    `<strong>Hedge book:</strong> Delta-hedge with Deribit BTC perpetual or inverse futures; do not let residual delta become the P&amp;L driver.`,
    `<strong>Operational checklist:</strong> (1) pull DVOL + smile, (2) compute IV−RV for 7d and 30d, (3) check event calendar, (4) set wing strikes / max loss in UI, (5) log thesis and kill criteria before click.`,
    `<strong>Do not:</strong> size from AIC alone; rank HAR AIC vs GARCH; hold naked short options; treat this plan as a guaranteed edge.`,
  ];

  const html =
    `<div class="vol-trade-plan">` +
    `<p class="vol-plan-stance"><span class="vol-plan-kicker">Suggested Deribit position</span> ` +
    `<strong>${volEscape(stance)}</strong></p>` +
    `<p class="vol-plan-why">${why}</p>` +
    `<h3 class="vol-plan-h">Marks &amp; setup</h3>` +
    `<ul class="vol-plan-list">${checks.map((c) => `<li>${c}</li>`).join("")}</ul>` +
    `<h3 class="vol-plan-h">Trade plan</h3>` +
    `<ol class="vol-plan-list vol-plan-steps">${steps.map((c) => `<li>${c}</li>`).join("")}</ol>` +
    `<p class="vol-plan-disclaimer">Educational research template from this suite’s fits only — not investment advice, not a Deribit order ticket, and not a promise of profit. Live IV/DVOL must be checked at the desk before any fill.</p>` +
    `</div>`;

  return { stance, html, conf, mark: mark.name };
}

function volRenderRunCommentary(suite) {
  const host = volEl("vol-run-commentary");
  const meta = volEl("vol-run-commentary-meta");
  if (!host) return;
  if (!suite?.models?.length) {
    host.innerHTML = `<p>Run all models to generate a desk read of this estimation pass.</p>`;
    if (meta) meta.textContent = "After estimation";
    return;
  }
  const lines = volBuildRunCommentary(suite);
  const plan = volBuildDeribitTradePlan(suite);
  host.innerHTML =
    lines.map((p) => `<p>${p}</p>`).join("") +
    `<h3 class="vol-plan-section-title">Deribit position &amp; trade plan</h3>` +
    (plan?.html || "");
  if (meta) {
    meta.textContent = [
      suite.asOf ? `as of ${String(suite.asOf).replace("T", " ").slice(0, 16)} UTC` : "",
      suite.fromCache ? "cached" : "fresh",
      suite.summary?.bestForecastModelName
        ? `QLIKE: ${suite.summary.bestForecastModelName}`
        : suite.summary?.bestModelName
          ? `AIC: ${suite.summary.bestModelName}`
          : "",
      plan?.stance ? `Plan: ${plan.stance.split("—")[0].trim()}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const screen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="volatility"]',
  );
  window.decorateHelpLabels?.(screen);
}

function volRenderGuide(suite) {
  const body = volEl("vol-guide-body");
  if (!body) return;
  const guide = suite.guide || [];
  body.innerHTML = guide
    .map(
      (g) =>
        `<tr><td><strong>${volEscape(g.prefer)}</strong></td><td>${volEscape(g.when)}</td></tr>`,
    )
    .join("");
}

function volRenderGlossary(suite) {
  const host = volEl("vol-glossary");
  if (!host) return;
  const g = suite.glossary || {};
  host.innerHTML = Object.entries(g)
    .map(
      ([k, v]) =>
        `<p><strong>${volEscape(k)}</strong> — ${volEscape(v)}</p>`,
    )
    .join("");
}

function volDrawBacktestCharts(detail) {
  const bt = detail?.backtest;
  const hs = ["1", "7", "14", "30"];
  const labels = hs.map((h) => `${h}d`);
  const qlikes = hs.map((h) => {
    const v = bt?.horizons?.[h]?.qlike;
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  });
  const rmses = hs.map((h) => {
    const v = bt?.horizons?.[h]?.rmseAnn;
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  });

  const drawBars = (canvasId, values, color, asPct) => {
    const valid = values.filter((v) => v != null);
    if (!valid.length) {
      const c = volEl(canvasId);
      if (c) {
        const ctx = c.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        const rect = c.getBoundingClientRect();
        c.width = Math.max(1, Math.floor(rect.width * dpr));
        c.height = Math.max(1, Math.floor(150 * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, 150);
        ctx.fillStyle = "#64748b";
        ctx.font = "12px IBM Plex Sans, sans-serif";
        ctx.fillText("No OOS points to chart", 16, 72);
      }
      return;
    }
    volMountChart(canvasId, {
      pad: { top: 16, right: 12, bottom: 28, left: 44 },
      getLength: () => hs.length,
      minWindow: hs.length,
      onDraw(ctx, w, h, api) {
        ctx.clearRect(0, 0, w, h);
        const maxV = Math.max(...valid) * 1.15 || 1;
        const slot = (w - api.pad.left - api.pad.right) / hs.length;
        values.forEach((v, i) => {
          if (v == null) return;
          const bh = (v / maxV) * api.chartH;
          const x = api.pad.left + i * slot + slot * 0.18;
          const bw = slot * 0.64;
          const y = api.pad.top + api.chartH - bh;
          const hover = api.hoverGlobal === i;
          ctx.fillStyle = hover ? "#5eead4" : color;
          ctx.globalAlpha = hover ? 1 : 0.82;
          ctx.fillRect(x, y, bw, bh);
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#94a3b8";
          ctx.font = "10px IBM Plex Mono, monospace";
          ctx.textAlign = "center";
          ctx.fillText(labels[i], x + bw / 2, h - 10);
        });
        ctx.fillStyle = "#7d8799";
        ctx.textAlign = "right";
        ctx.font = "10px IBM Plex Mono, monospace";
        const topLab = asPct ? `${(maxV * 100).toFixed(0)}%` : maxV.toFixed(2);
        ctx.fillText(topLab, api.pad.left - 6, api.pad.top + 10);
      },
      formatTooltip(i) {
        const v = values[i];
        if (v == null) return volTipTitle(labels[i]) + volTipRow("Value", "—");
        return (
          volTipTitle(`Horizon ${labels[i]}`) +
          volTipRow(asPct ? "RMSE (ann.)" : "QLIKE", asPct ? volFmtPct(v, 2) : v.toFixed(4)) +
          volTipRow("Model", detail?.name || "—")
        );
      },
    });
  };

  drawBars("vol-bt-qlike-chart", qlikes, "#2dd4bf", false);
  drawBars("vol-bt-rmse-chart", rmses, "#38bdf8", true);
}

/** Normalize suite table row → shape expected by volBuildVerdict. */
function volRowAsDetail(m) {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    warning: m.warning,
    engine: m.engine,
    backtest: m.backtest || {},
    metrics: {
      persistence: m.persistence,
      rSquared: m.rSquared,
      currentCondVolAnn: m.currentCondVolAnn,
      unconditionalVolAnn: m.unconditionalVolAnn,
    },
    status: m.status,
  };
}

/**
 * Honest desk verdict for fitness + Deribit option use.
 * Works for full detail objects and slim comparison-table rows.
 * Not a trade recommendation — structured opinion for filters.
 */
function volBuildVerdict(detail, suite) {
  if (!detail) return null;
  if (detail.status === "failed") {
    return {
      score: 0,
      tier: "Not fit for option P&L decisions",
      shortTier: "Not fit",
      tableLabel: "No",
      tierClass: "vol-verdict--bad",
      reasons: ["Estimation failed for this specification."],
      profitLine: "No usable RV mark from a failed fit.",
      summary: "Failed",
    };
  }
  const bt = detail.backtest || {};
  const m = detail.metrics || {};
  const pers = m.persistence;
  const meanQ = bt.meanQlike;
  const bestQ = suite?.bestByQlike;
  const isBestQ = bestQ && detail.id === bestQ;
  const isFallback = !!(
    detail.warning && /fallback|not installed|GARCH\(1,1\)/i.test(detail.warning)
  );
  // Suite stores backtest.ok; tolerate meanQlike alone
  const hasBt =
    (bt.ok === true || bt.ok === undefined) &&
    meanQ != null &&
    Number.isFinite(Number(meanQ));
  const q7 = bt.horizons?.["7"]?.qlike;
  const q30 = bt.horizons?.["30"]?.qlike;
  const nOk = (suite?.models || []).filter((x) => x.status === "ok").length;

  let score = 40;
  const reasons = [];
  if (hasBt) {
    score += 18;
    reasons.push("OOS backtest available (expanding window).");
    if (isBestQ) {
      score += 18;
      reasons.push("Best mean QLIKE in this suite — strongest forecast rank among peers.");
    } else if (meanQ != null && suite?.summary?.bestForecastQlike != null) {
      const gap = meanQ - suite.summary.bestForecastQlike;
      if (gap < 0.05) {
        score += 10;
        reasons.push("QLIKE close to the suite leader (within 0.05).");
      } else if (gap > 0.25) {
        score -= 12;
        reasons.push("QLIKE materially worse than the suite leader — prefer the QLIKE badge model for marks.");
      }
    }
    if (q7 != null && q30 != null && q30 < q7 * 1.15) {
      score += 6;
      reasons.push("30d QLIKE does not blow up vs 7d — usable for monthly Deribit tenors.");
    }
  } else {
    score -= 15;
    reasons.push("No reliable OOS backtest — do not treat in-sample AIC alone as forecast skill.");
  }

  if (isFallback) {
    score -= 14;
    reasons.push("Engine fallback (not full EGARCH/GJR/etc.) — specification is approximate.");
  } else if (detail.engine === "arch" || detail.engine === "har-numpy") {
    score += 8;
    reasons.push(
      detail.engine === "har-numpy"
        ? "HAR-RV OLS path is a solid RV benchmark."
        : "Full arch MLE engine.",
    );
  }

  if (pers != null) {
    if (pers > 0.995) {
      score -= 8;
      reasons.push("Near-unit persistence — shock half-life is extreme; fragile for sizing.");
    } else if (pers > 0.85 && pers < 0.99) {
      score += 6;
      reasons.push("Persistence in a plausible clustering band for BTC.");
    }
  }

  if (m.rSquared != null && m.rSquared > 0.15) {
    score += 4;
    reasons.push(`HAR R² ≈ ${Number(m.rSquared).toFixed(2)} on RV equation.`);
  }

  score = Math.max(5, Math.min(92, score));

  let tier;
  let shortTier;
  let tableLabel;
  let tierClass;
  let profitLine;
  if (score >= 70 && hasBt && !isFallback) {
    tier = "Usable for Deribit RV marks";
    shortTier = "Usable (RV marks)";
    tableLabel = "Yes";
    tierClass = "vol-verdict--good";
    profitLine =
      "Fitness is good enough to use as a physical-vol anchor on Deribit: compare model 7d/30d RV to mid IV / DVOL. " +
      "A stable positive IV−RV may support selective vol selling only with defined risk, skew hedges, and jump budgets — " +
      "it is not a free edge. Do not size from this model alone.";
  } else if (score >= 50 && hasBt) {
    tier = "Cross-check only";
    shortTier = "Cross-check only";
    tableLabel = "Cross-check only";
    tierClass = "vol-verdict--mid";
    profitLine =
      "Use as a second opinion next to DVOL and the smile, not as a primary signal. " +
      "Chasing IV−RV with this spec is unlikely to be systematically profitable after fees, funding, and gap risk. " +
      "Prefer the suite’s QLIKE leader if it differs.";
  } else {
    tier = "Not fit for option P&L decisions";
    shortTier = "Not fit";
    tableLabel = "No";
    tierClass = "vol-verdict--bad";
    profitLine =
      "Do not use this run to decide long/short vol on Deribit. Fix data/engine (install arch, longer sample, re-run) " +
      "or switch to a better OOS model. Treating weak GARCH marks as an edge is how books bleed slowly.";
  }

  return {
    score,
    tier,
    shortTier,
    tableLabel,
    tierClass,
    reasons,
    profitLine,
    summary: hasBt
      ? `Score ${score}/100 · mean QLIKE ${meanQ != null ? Number(meanQ).toFixed(3) : "—"} · ${nOk} models in suite`
      : `Score ${score}/100 · no OOS · ${nOk} models in suite`,
  };
}

function volRenderVerdict(detail, suite) {
  const host = volEl("vol-verdict");
  const meta = volEl("vol-verdict-meta");
  if (!host) return;
  const v = volBuildVerdict(detail, suite);
  if (!v) {
    host.innerHTML = `<p class="macro-muted">Select a model after running the suite…</p>`;
    if (meta) meta.textContent = "Fitness · Deribit use";
    return;
  }
  if (meta) meta.textContent = v.summary;
  host.innerHTML = `
    <div class="vol-verdict-banner ${v.tierClass}">
      <div class="vol-verdict-score mono">${v.score}<span class="vol-verdict-score-max">/100</span></div>
      <div class="vol-verdict-tier">${v.tier}</div>
    </div>
    <p class="vol-verdict-profit"><strong>Deribit P&amp;L stance:</strong> ${v.profitLine}</p>
    <ul class="vol-verdict-reasons">
      ${v.reasons.map((r) => `<li>${volEscape(r)}</li>`).join("")}
    </ul>
    <p class="vol-caveat">Opinion is rule-based from this suite’s in-sample fit + OOS QLIKE only — not investment advice and not a Deribit order ticket.</p>
  `;
}

function volRenderBacktest(detail) {
  const body = volEl("vol-backtest-body");
  const meta = volEl("vol-backtest-meta");
  const note = volEl("vol-backtest-note");
  if (!body) return;
  const bt = detail?.backtest;
  if (!bt || !bt.ok) {
    body.innerHTML = `<tr><td colspan="6">${
      bt?.error
        ? volEscape(bt.error)
        : "No OOS backtest for this model (need longer sample or successful origins)."
    }</td></tr>`;
    if (note) note.textContent = "";
    if (meta) meta.textContent = "Horizons 1d · 7d · 14d · 30d · QLIKE primary";
    volDrawBacktestCharts(null);
    return;
  }
  const horizons = bt.horizons || {};
  body.innerHTML = ["1", "7", "14", "30"]
    .map((h) => {
      const r = horizons[h];
      if (!r?.ok) {
        return `<tr>
          <td class="vol-td-text">${h}d</td>
          <td class="mono vol-td-num" colspan="5">insufficient origins</td>
        </tr>`;
      }
      return `<tr>
        <td class="vol-td-text">${h}d</td>
        <td class="mono vol-td-num">${r.n ?? "—"}</td>
        <td class="mono vol-td-num">${r.qlike != null ? Number(r.qlike).toFixed(4) : "—"}</td>
        <td class="mono vol-td-num">${volFmtPct(r.rmseAnn, 1)}</td>
        <td class="mono vol-td-num">${r.mae != null ? Number(r.mae).toExponential(2) : "—"}</td>
        <td class="mono vol-td-num">${r.bias != null ? Number(r.bias).toExponential(2) : "—"}</td>
      </tr>`;
    })
    .join("");
  if (meta) {
    meta.textContent = [
      detail.name || "",
      bt.meanQlike != null ? `mean QLIKE ${Number(bt.meanQlike).toFixed(3)}` : "",
      bt.origins != null ? `${bt.origins} origins` : "",
      bt.stepDays != null ? `step ${bt.stepDays}d` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (note) {
    note.textContent =
      bt.note ||
      "Lower QLIKE is better. Map 7d/30d to Deribit weekly/monthly when comparing to IV.";
  }
  volDrawBacktestCharts(detail);
  window.decorateHelpLabels?.(volEl("vol-backtest-table"));
}

function volRenderDetail(detail) {
  const title = volEl("vol-detail-title");
  const sub = volEl("vol-detail-sub");
  const blurb = volEl("vol-detail-blurb");
  const why = volEl("vol-detail-why");
  const eqBox = volEl("vol-equation-box");
  const eqEl = volEl("vol-equation");
  const eqNote = volEl("vol-equation-note");
  const paramsBody = volEl("vol-params-body");
  const insights = volEl("vol-insights");
  if (!detail) {
    if (title) title.textContent = "Model detail";
    if (sub) sub.textContent = "Select a row";
    if (blurb) blurb.textContent = "";
    if (why) why.textContent = "";
    if (eqBox) eqBox.hidden = true;
    if (paramsBody) paramsBody.innerHTML = `<tr><td colspan="5">—</td></tr>`;
    if (insights) insights.innerHTML = `<p>Select a model to see desk insights.</p>`;
    volRenderBacktest(null);
    volRenderVerdict(null, volSuite);
    return;
  }
  if (title) title.textContent = detail.name || "Model detail";
  if (sub) {
    sub.textContent = [
      detail.engine || "",
      detail.distribution || "",
      detail.regime ? `regime ${detail.regime}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (blurb) blurb.textContent = detail.blurb || "";
  if (why) {
    why.innerHTML = detail.whyBtc
      ? `<strong>Why for BTC / Deribit:</strong> ${volEscape(detail.whyBtc)}`
      : "";
  }
  if (eqBox && eqEl) {
    if (detail.equation) {
      eqBox.hidden = false;
      eqEl.textContent = detail.equation;
      if (eqNote) eqNote.textContent = detail.equationNote || "";
    } else {
      eqBox.hidden = true;
    }
  }
  if (paramsBody) {
    const rows = detail.params || [];
    // Single stacked column for name+meaning avoids header/value overlap
    paramsBody.innerHTML = rows.length
      ? rows
          .map((p) => {
            const stars = volStars(p.pValue);
            const meaning = p.meaning || "See equation above.";
            return `<tr>
              <td class="vol-td-text vol-param-cell">
                <div class="vol-param-name">${volEscape(p.name)}</div>
                <div class="vol-param-meaning">${volEscape(meaning)}</div>
              </td>
              <td class="mono vol-td-num">${volFmtNum(p.estimate, 5)}${stars ? ` <span class="vol-stars">${stars}</span>` : ""}</td>
              <td class="mono vol-td-num">${volFmtNum(p.stdError, 5)}</td>
              <td class="mono vol-td-num">${volFmtNum(p.tStat, 3)}</td>
              <td class="mono vol-td-num">${volFmtNum(p.pValue, 4)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5">No parameters</td></tr>`;
  }
  window.decorateHelpLabels?.(volEl("vol-params-table") || document);
  volRenderBacktest(detail);
  volRenderVerdict(detail, volSuite);

  if (insights) {
    const m = detail.metrics || {};
    const risk = detail.risk || {};
    const f = detail.forecastAnn || [];
    const bt = detail.backtest || {};
    const q1 = bt.horizons?.["1"]?.qlike;
    const q7 = bt.horizons?.["7"]?.qlike;
    const q30 = bt.horizons?.["30"]?.qlike;
    const lines = [
      `<p><strong>Regime:</strong> ${volEscape(detail.regime || "—")} vs long-run. Pair with Deribit DVOL / smile for the same tenor.</p>`,
      `<p><strong>Model RV (ann.):</strong> now ${volFmtPct(m.currentCondVolAnn ?? detail.currentCondVolAnn, 1)} · ` +
        `long-run ${volFmtPct(m.unconditionalVolAnn, 1)} · ` +
        `1d / 7d / 30d ${volFmtPct(f[0], 1)} / ${volFmtPct(f[6], 1)} / ${volFmtPct(f[29], 1)}</p>`,
      `<p><strong>Deribit map:</strong> 7d ≈ weekly, 30d ≈ monthly. Premium ≈ <span class="mono">IV − model_RV</span>.</p>`,
      detail.deribitNote
        ? `<p class="vol-deribit">${volEscape(detail.deribitNote)}</p>`
        : "",
      bt.ok
        ? `<p><strong>OOS QLIKE ↓:</strong> 1d ${q1 != null ? Number(q1).toFixed(3) : "—"}, 7d ${
            q7 != null ? Number(q7).toFixed(3) : "—"
          }, 30d ${q30 != null ? Number(q30).toFixed(3) : "—"}` +
          `${bt.meanQlike != null ? ` · mean ${Number(bt.meanQlike).toFixed(3)}` : ""}.</p>`
        : `<p><strong>OOS backtest:</strong> not available.</p>`,
      detail.sizingMultiplier != null
        ? `<p><strong>Notional vs 55% vol target:</strong> <span class="mono">${volFmtNum(
            detail.sizingMultiplier,
            2,
          )}×</span>.</p>`
        : "",
      `<p><strong>1-day under cond. σ:</strong> VaR95 ${volFmtPct(risk.var95, 2)} · VaR99 ${volFmtPct(
        risk.var99,
        2,
      )} · ES95 ${volFmtPct(risk.es95, 2)} · ES99 ${volFmtPct(risk.es99, 2)}</p>`,
      detail.warning ? `<p class="vol-warn">${volEscape(detail.warning)}</p>` : "",
    ];
    insights.innerHTML = lines.filter(Boolean).join("");
  }
}

/* ——— Charts (ChartInteraction + tooltips) ——— */

function volTipTitle(text) {
  if (typeof window.chartTipTitle === "function" && text != null && String(text).match(/^\d{10,}$/)) {
    // ms timestamp
    return window.chartTipTitle(Number(text));
  }
  if (typeof window.chartTipTitle === "function" && text) {
    try {
      return window.chartTipTitle(text);
    } catch {
      /* fall through */
    }
  }
  return `<div class="chart-tooltip-title">${volEscape(text ?? "")}</div>`;
}

function volTipRow(label, value) {
  if (typeof window.chartTipRow === "function") return window.chartTipRow(label, value);
  return `<div class="chart-tooltip-row"><span>${volEscape(label)}</span><span class="mono">${volEscape(value)}</span></div>`;
}

function volFmtAxisDate(d, compact) {
  if (d == null) return "";
  if (typeof window.fmtChartDate === "function") {
    try {
      return window.fmtChartDate(d, compact);
    } catch {
      /* fall through */
    }
  }
  if (typeof d === "number" && d > 1e11) {
    return new Date(d).toLocaleDateString("en-US", { month: "short", year: compact ? "2-digit" : "numeric" });
  }
  return String(d).slice(0, 10);
}

function volMountChart(canvasId, options) {
  const canvas = volEl(canvasId);
  if (!canvas) return null;
  const pad = options.pad || { top: 16, right: 16, bottom: 32, left: 48 };
  const opts = {
    maxPoints: 1500,
    minWindow: 20,
    pad,
    ...options,
  };
  if (typeof window.mountStatsChart === "function") {
    return window.mountStatsChart(canvasId, opts);
  }
  if (window.ChartInteraction?.ensure) {
    if (!opts.getLength?.()) return null;
    return window.ChartInteraction.ensure(canvas, opts);
  }
  return null;
}

function volDrawCondChart(suite) {
  const detail = suite.detail;
  const series = suite.series || {};
  const dates = series.dates || [];
  const cond = (detail?.condVol || []).map(Number).filter((v) => Number.isFinite(v));
  // Align lengths: use min of series and cond (HAR pads to full n)
  const n = Math.min(
    (detail?.condVol || []).length,
    dates.length || (detail?.condVol || []).length,
  );
  if (n < 5) return;
  const rawCond = (detail.condVol || []).slice(-n).map(Number);
  const dts = dates.slice(-n);
  const ann = rawCond.map((v) => (Number.isFinite(v) ? v * Math.sqrt(VOL_ANN) : NaN));

  volMountChart("vol-cond-chart", {
    pad: { top: 18, right: 16, bottom: 34, left: 52 },
    getLength: () => n,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const drawCount = indices.length;
      const slice = indices.map((i) => ann[i]).filter((v) => Number.isFinite(v));
      if (!slice.length) return;
      const minV = Math.min(...indices.map((i) => ann[i]).filter(Number.isFinite)) * 0.9;
      const maxV = Math.max(...indices.map((i) => ann[i]).filter(Number.isFinite)) * 1.1;
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      let started = false;
      indices.forEach((gi, i) => {
        const v = ann[gi];
        if (!Number.isFinite(v)) return;
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null && Number.isFinite(ann[api.hoverGlobal])) {
        api.drawCrosshair?.(api.xAtGlobal(api.hoverGlobal));
        api.drawDot?.(api.xAtGlobal(api.hoverGlobal), yAt(ann[api.hoverGlobal]), "#2dd4bf");
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${(maxV * 100).toFixed(0)}%`, api.pad.left - 6, api.pad.top + 10);
      if (typeof drawTimeAxisLabels === "function") {
        drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
          volFmtAxisDate(dts[indices[i]], drawCount > 180),
        );
      }
    },
    formatTooltip(globalIdx) {
      const d = dts[globalIdx];
      const v = ann[globalIdx];
      return (
        volTipTitle(d) +
        volTipRow("Cond. vol (ann.)", Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : "—") +
        volTipRow("Model", detail?.name || "—")
      );
    },
  });
}

function volDrawForecastChart(detail) {
  const f = (detail?.forecastAnn || []).map(Number);
  if (!f.length) return;
  const n = f.length;
  volMountChart("vol-forecast-chart", {
    pad: { top: 18, right: 16, bottom: 34, left: 52 },
    getLength: () => n,
    minWindow: Math.min(10, n),
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const drawCount = indices.length;
      const slice = indices.map((i) => f[i]);
      const minV = Math.min(...slice.filter(Number.isFinite)) * 0.95;
      const maxV = Math.max(...slice.filter(Number.isFinite)) * 1.05;
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      slice.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null && Number.isFinite(f[api.hoverGlobal])) {
        api.drawCrosshair?.(api.xAtGlobal(api.hoverGlobal));
        api.drawDot?.(api.xAtGlobal(api.hoverGlobal), yAt(f[api.hoverGlobal]), "#38bdf8");
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${(maxV * 100).toFixed(0)}%`, api.pad.left - 6, api.pad.top + 10);
      ctx.textAlign = "center";
      ctx.fillText("horizon (days)", w / 2, h - 8);
    },
    formatTooltip(globalIdx) {
      const h = globalIdx + 1;
      const v = f[globalIdx];
      return (
        volTipTitle(`Horizon ${h}d`) +
        volTipRow("Forecast vol (ann.)", Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : "—") +
        volTipRow("Model", detail?.name || "—")
      );
    },
  });
}

function volDrawNicChart(detail) {
  const nic = detail?.newsImpact || [];
  if (!nic.length) return;
  const n = nic.length;
  volMountChart("vol-nic-chart", {
    pad: { top: 18, right: 16, bottom: 34, left: 52 },
    getLength: () => n,
    minWindow: Math.min(15, n),
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const drawCount = indices.length;
      const ys = indices.map((i) => nic[i].nextVolAnn);
      const minV = Math.min(...ys) * 0.95;
      const maxV = Math.max(...ys) * 1.05;
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      const zeroIdx = nic.findIndex((p) => Math.abs(p.shockPct) < 1e-9);
      if (zeroIdx >= 0) {
        const local = indices.indexOf(zeroIdx);
        if (local >= 0) {
          const zx = api.xAt(local, drawCount);
          ctx.strokeStyle = "rgba(148,163,184,0.35)";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(zx, api.pad.top);
          ctx.lineTo(zx, api.pad.top + api.chartH);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.strokeStyle = "#f472b6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ys.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null && nic[api.hoverGlobal]) {
        api.drawCrosshair?.(api.xAtGlobal(api.hoverGlobal));
        api.drawDot?.(
          api.xAtGlobal(api.hoverGlobal),
          yAt(nic[api.hoverGlobal].nextVolAnn),
          "#f472b6",
        );
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${(maxV * 100).toFixed(0)}%`, api.pad.left - 6, api.pad.top + 10);
      ctx.textAlign = "center";
      ctx.fillText("return shock (%)", w / 2, h - 8);
    },
    formatTooltip(globalIdx) {
      const p = nic[globalIdx];
      if (!p) return "";
      return (
        volTipTitle(`Shock ${p.shockPct >= 0 ? "+" : ""}${Number(p.shockPct).toFixed(1)}%`) +
        volTipRow("Next-day vol (ann.)", volFmtPct(p.nextVolAnn, 2)) +
        volTipRow("Model", detail?.name || "—")
      );
    },
  });
}

function volDrawResidChart(detail) {
  const r = (detail?.stdResid || []).filter((x) => Number.isFinite(Number(x))).map(Number);
  if (r.length < 20) return;
  const bins = 24;
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
  volMountChart("vol-resid-chart", {
    pad: { top: 16, right: 12, bottom: 28, left: 40 },
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
        const hover = api.hoverGlobal === i;
        ctx.fillStyle = hover ? "rgba(56, 189, 248, 0.95)" : "rgba(56, 189, 248, 0.7)";
        ctx.fillRect(x + 1, y, Math.max(1, slot - 2), bh);
      });
    },
    formatTooltip(globalIdx) {
      const lo = edges[globalIdx];
      const hi = edges[globalIdx + 1];
      return (
        volTipTitle("Std. residual bin") +
        volTipRow("Range", `${lo.toFixed(2)} … ${hi.toFixed(2)}`) +
        volTipRow("Count", String(counts[globalIdx] ?? 0)) +
        volTipRow("Share", `${((100 * (counts[globalIdx] || 0)) / r.length).toFixed(1)}%`)
      );
    },
  });
}

function volDrawAll(suite) {
  const detail = suite.detail;
  volDrawCondChart(suite);
  volDrawForecastChart(detail);
  volDrawNicChart(detail);
  volDrawResidChart(detail);
  const meta = volEl("vol-chart-meta");
  if (meta) meta.textContent = detail?.name || "Selected / best model";
}

async function volSelectModel(id) {
  if (!volSuite) return;
  volSelectedId = id;
  volRenderTable(volSuite);
    // Prefer embedded detail if same model; else fetch single model
  if (volSuite.detail?.id === id && volSuite.detail?.params?.length) {
    volRenderDetail(volSuite.detail);
    volDrawAll({ ...volSuite, detail: volSuite.detail });
    return;
  }
  const days = volEl("vol-range")?.value || "1095";
  const dist = volEl("vol-dist")?.value || "t";
  try {
    const res = await fetch(
      `${VOL_API}/${encodeURIComponent(id)}?days=${encodeURIComponent(days)}&dist=${encodeURIComponent(dist)}`,
      { cache: "no-store" },
    );
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Model load failed");
    const fit = data.fit || {};
    const mod = data.model || {};
    const detail = {
      id: mod.id,
      name: mod.name,
      blurb: mod.blurb,
      whyBtc: mod.whyBtc,
      equation: mod.equation || fit.equation,
      equationNote: mod.equationNote || fit.equationNote,
      params: fit.params || [],
      metrics: {
        persistence: fit.persistence,
        halfLifeDays: fit.halfLifeDays,
        unconditionalVolAnn: fit.unconditionalVolAnn,
        currentCondVolAnn: fit.currentCondVolAnn,
        logLikelihood: fit.logLikelihood,
        aic: fit.aic,
        bic: fit.bic,
        rSquared: fit.rSquared,
      },
      forecastAnn: fit.forecastAnn || [],
      condVol: fit.condVol || [],
      stdResid: fit.stdResid || [],
      newsImpact: fit.newsImpact || [],
      risk: fit.risk || {},
      backtest: fit.backtest || {},
      regime: fit.regime,
      sizingMultiplier: fit.sizingMultiplier,
      warning: fit.warning,
      engine: fit.engine,
      distribution: data.distribution,
      currentCondVolAnn: fit.currentCondVolAnn,
      deribitNote: fit.deribitNote,
    };
    // Patch suite series if needed
    const local = {
      ...volSuite,
      detail,
      series: data.series || volSuite.series,
    };
    volRenderDetail(detail);
    volDrawAll(local);
  } catch (err) {
    console.error("[vol select]", err);
    const insights = volEl("vol-insights");
    if (insights) insights.innerHTML = `<p class="vol-warn">${volEscape(err.message)}</p>`;
  }
}

function volExportCsv(suite) {
  const models = suite?.models || [];
  const header = [
    "id",
    "name",
    "family",
    "status",
    "logLikelihood",
    "aic",
    "bic",
    "nParams",
    "persistence",
    "halfLifeDays",
    "currentCondVolAnn",
    "usableForDeribitRvMarks",
    "deribitTier",
    "deribitScore",
  ];
  const lines = [header.join(",")];
  models.forEach((m) => {
    const verdict = volBuildVerdict(volRowAsDetail(m), suite);
    const row = {
      ...m,
      usableForDeribitRvMarks: verdict?.tableLabel || "",
      deribitTier: verdict?.tier || "",
      deribitScore: verdict?.score != null ? verdict.score : "",
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
  a.download = `btc-volatility-models-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function volRun(force = false) {
  if (volBusy) return;
  volBusy = true;
  const btn = volEl("vol-run-all");
  const meta = volEl("vol-suite-meta");
  const prev = btn?.textContent;
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Estimating…";
    }
    if (meta) meta.textContent = "Running model suite…";
    const suite = await volFetchSuite(force);
    volSuite = suite;
    volSelectedId = suite.bestByAic || suite.models?.find((m) => m.status === "ok")?.id || null;
    volSetKpis(suite);
    volRenderTable(suite);
    volRenderGuide(suite);
    volRenderGlossary(suite);
    volRenderDetail(suite.detail);
    volRenderRunCommentary(suite);
    volDrawAll(suite);
    if (meta) {
      meta.textContent = [
        suite.pair || "BTC",
        suite.startDate && suite.endDate ? `${suite.startDate} → ${suite.endDate}` : "",
        `${suite.nObs || "—"} obs`,
        suite.archAvailable ? "engine: arch" : "engine: numpy fallback",
        suite.fromCache ? "cached" : "fresh",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    const note = volEl("vol-engine-note");
    if (note) {
      if (!suite.archAvailable) {
        note.hidden = false;
        note.textContent =
          "Python package `arch` is not installed. Install with `pip install arch` for EGARCH, GJR, APARCH, FIGARCH, etc. Currently using pure-NumPy GARCH(1,1) fallbacks where needed.";
      } else {
        note.hidden = true;
      }
    }
    const compareMeta = volEl("vol-compare-meta");
    if (compareMeta) {
      compareMeta.textContent = [
        suite.summary?.bestModelName ? `AIC: ${suite.summary.bestModelName}` : "",
        suite.summary?.bestForecastModelName
          ? `QLIKE: ${suite.summary.bestForecastModelName}`
          : "",
        "click row for equation + backtest",
      ]
        .filter(Boolean)
        .join(" · ");
    }
  } catch (err) {
    console.error("[volatility]", err);
    if (meta) meta.textContent = err.message || "Estimation failed";
    const insights = volEl("vol-insights");
    if (insights) {
      insights.innerHTML = `<p class="vol-warn">${volEscape(err.message || "Failed to estimate models. Is server.py running?")}</p>`;
    }
    const runC = volEl("vol-run-commentary");
    if (runC) {
      runC.innerHTML = `<p class="vol-warn">${volEscape(err.message || "Estimation failed.")}</p>`;
    }
  } finally {
    volBusy = false;
    if (btn) {
      btn.disabled = false;
      if (prev) btn.textContent = prev;
    }
  }
}

function initVolatilityModule() {
  const screen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="volatility"]',
  );
  if (!screen || screen.dataset.volBound) return;
  screen.dataset.volBound = "true";

  volEl("vol-run-all")?.addEventListener("click", () => volRun(true));
  volEl("vol-export-csv")?.addEventListener("click", () => {
    if (volSuite) volExportCsv(volSuite);
  });
  volEl("vol-range")?.addEventListener("change", () => volRun(true));
  volEl("vol-dist")?.addEventListener("change", () => volRun(true));
}

window.refreshVolatilityCharts = function () {
  initVolatilityModule();
  if (volSuite) {
    volDrawAll(volSuite);
  } else {
    volRun(false);
  }
};

window.loadVolatilitySuite = () => volRun(true);

// Auto-bind when stats module loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVolatilityModule);
} else {
  initVolatilityModule();
}
