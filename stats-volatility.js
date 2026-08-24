/**
 * Stats → Volatility — ARCH/GARCH suite UI.
 * Fetches /api/stats/volatility and renders comparison + charts + desk insights.
 */

const VOL_API = "/api/stats/volatility";
const VOL_ANN = 365;
const VOL_PREFS_KEY = "vol-suite-prefs-v4";
/** Desk defaults: 5Y sample + Student-t innovations (see #vol-est-why). */
const VOL_DESK_DAYS = "1825";
const VOL_DESK_DIST = "t";

let volSuite = null;
let volSelectedId = null;
let volBusy = false;
/** Full catalog from /catalog or last suite (for picker UI). */
let volCatalog = [];

const volEl = (id) => document.getElementById(id);

function volDefaultPrefs() {
  return {
    days: VOL_DESK_DAYS,
    dist: VOL_DESK_DIST,
    /** null = use catalog defaultOn flags */
    models: null,
  };
}

function volLoadPrefs() {
  try {
    const raw = localStorage.getItem(VOL_PREFS_KEY);
    if (!raw) return volDefaultPrefs();
    const p = JSON.parse(raw);
    return {
      days: String(p.days || VOL_DESK_DAYS),
      dist: String(p.dist || VOL_DESK_DIST).toLowerCase(),
      models: Array.isArray(p.models) ? p.models.map(String) : null,
    };
  } catch {
    return volDefaultPrefs();
  }
}

function volSavePrefs(partial = {}) {
  const cur = volLoadPrefs();
  const next = {
    days: partial.days != null ? String(partial.days) : cur.days,
    dist: partial.dist != null ? String(partial.dist).toLowerCase() : cur.dist,
    models:
      partial.models !== undefined
        ? partial.models
        : cur.models,
  };
  try {
    localStorage.setItem(VOL_PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

function volApplyPrefsToControls() {
  const p = volLoadPrefs();
  const range = volEl("vol-range");
  const dist = volEl("vol-dist");
  if (range && [...range.options].some((o) => o.value === p.days)) {
    range.value = p.days;
  }
  if (dist && [...dist.options].some((o) => o.value === p.dist)) {
    dist.value = p.dist;
  }
}

function volCheckedModelIds() {
  const grid = volEl("vol-model-picker-grid");
  if (!grid) return [];
  return [...grid.querySelectorAll('input[type="checkbox"][data-vol-model]:checked')].map(
    (el) => el.getAttribute("data-vol-model"),
  );
}

function volSetCheckedModels(ids) {
  const grid = volEl("vol-model-picker-grid");
  if (!grid) return;
  const want = new Set(ids || []);
  grid.querySelectorAll('input[type="checkbox"][data-vol-model]').forEach((el) => {
    const id = el.getAttribute("data-vol-model");
    el.checked = want.has(id);
  });
  volUpdatePickerMeta();
}

function volUpdatePickerMeta() {
  const meta = volEl("vol-model-picker-meta");
  if (!meta) return;
  const n = volCheckedModelIds().length;
  const total = volCatalog.length || n;
  const p = volLoadPrefs();
  meta.textContent = `${n} of ${total} models selected · dist=${p.dist} · range=${p.days}d · prefs saved in this browser`;
}

function volRenderModelPicker(catalog) {
  const grid = volEl("vol-model-picker-grid");
  if (!grid) return;
  volCatalog = Array.isArray(catalog) ? catalog : volCatalog;
  if (!volCatalog.length) {
    grid.innerHTML = `<p class="macro-muted">Catalog unavailable — run once to load models.</p>`;
    return;
  }
  const prefs = volLoadPrefs();
  const defaultIds = volCatalog.filter((m) => m.defaultOn).map((m) => m.id);
  const selected = new Set(
    prefs.models && prefs.models.length ? prefs.models : defaultIds,
  );
  const byFam = {};
  volCatalog.forEach((m) => {
    const f = m.family || "other";
    if (!byFam[f]) byFam[f] = [];
    byFam[f].push(m);
  });
  const famOrder = ["core", "asymmetric", "long_memory", "benchmark", "other"];
  const fams = [
    ...famOrder.filter((f) => byFam[f]),
    ...Object.keys(byFam).filter((f) => !famOrder.includes(f)),
  ];
  grid.innerHTML = fams
    .map((fam) => {
      const items = byFam[fam]
        .map((m) => {
          const checked = selected.has(m.id) ? " checked" : "";
          const arch = m.requiresArch
            ? `<span class="vol-model-tag" title="Needs Python arch package">arch</span>`
            : `<span class="vol-model-tag vol-model-tag--lite" title="No arch MLE required">lite</span>`;
          return `<label class="vol-model-check" title="${volEscape(m.blurb || m.whyBtc || "")}">
            <input type="checkbox" data-vol-model="${volEscape(m.id)}"${checked} />
            <span class="vol-model-check-name">${volEscape(m.name)}</span>
            ${arch}
          </label>`;
        })
        .join("");
      return `<div class="vol-model-fam">
        <div class="vol-model-fam-title">${volEscape(fam.replace(/_/g, " "))}</div>
        <div class="vol-model-fam-items">${items}</div>
      </div>`;
    })
    .join("");

  grid.querySelectorAll('input[type="checkbox"][data-vol-model]').forEach((el) => {
    el.addEventListener("change", () => {
      const ids = volCheckedModelIds();
      volSavePrefs({ models: ids.length ? ids : [] });
      volUpdatePickerMeta();
    });
  });
  volUpdatePickerMeta();
}

async function volLoadCatalog() {
  try {
    const res = await fetch(`${VOL_API}/catalog`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.catalog)) {
      volRenderModelPicker(data.catalog);
      return data.catalog;
    }
  } catch (err) {
    console.warn("[volatility] catalog", err);
  }
  return null;
}

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

/**
 * @param {boolean} force refresh cache
 * @param {{ allModels?: boolean }} opts if allModels, estimate full catalog for current range/dist
 */
async function volFetchSuite(force = false, opts = {}) {
  const days = volEl("vol-range")?.value || VOL_DESK_DAYS;
  const dist = volEl("vol-dist")?.value || VOL_DESK_DIST;
  let models;
  if (opts.allModels) {
    models = volCatalog.length
      ? volCatalog.map((m) => m.id)
      : [];
    if (models.length) volSetCheckedModels(models);
  } else {
    models = volCheckedModelIds();
    if (!models.length && volCatalog.length) {
      // fall back to defaults if user cleared all
      models = volCatalog.filter((m) => m.defaultOn).map((m) => m.id);
      if (models.length) volSetCheckedModels(models);
    }
  }
  volSavePrefs({ days, dist, models: models.length ? models : null });
  let url = `${VOL_API}?days=${encodeURIComponent(days)}&dist=${encodeURIComponent(dist)}`;
  // Empty models list after "all" still omit param → server runs full catalog
  if (models.length && !opts.allModels) {
    url += `&models=${encodeURIComponent(models.join(","))}`;
  }
  // When allModels, pass every id so cache keys stay explicit and server filters correctly
  if (opts.allModels && models.length) {
    url += `&models=${encodeURIComponent(models.join(","))}`;
  }
  if (force) url += "&refresh=1";
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Volatility ${res.status}`);
  if (Array.isArray(data.catalog)) volRenderModelPicker(data.catalog);
  // Re-apply selection after re-render of picker
  if (models.length) volSetCheckedModels(models);
  return data;
}

function volSetKpis(suite) {
  const s = suite?.summary || {};
  const set = (id, text) => {
    const n = volEl(id);
    if (n) n.textContent = text;
  };
  const markName = s.markModelName || s.bestForecastModelName || s.bestModelName;
  set("vol-kpi-cond", volFmtPct(s.currentCondVolAnn, 1));
  set(
    "vol-kpi-cond-sub",
    markName ? `${markName} · last daily close` : "QLIKE mark · last close",
  );
  const t7 =
    s.forecastTerm7d != null ? volFmtPct(s.forecastTerm7d, 1) : volFmtPct(s.forecast7d, 1);
  const t30 =
    s.forecastTerm30d != null ? volFmtPct(s.forecastTerm30d, 1) : volFmtPct(s.forecast30d, 1);
  const f1 = s.forecast1d != null ? volFmtPct(s.forecast1d, 1) : "—";
  set("vol-kpi-fcast", `${t7} / ${t30}`);
  const fcastSub = volEl("vol-kpi-fcast")?.parentElement?.querySelector(".deriv-hero-sub");
  if (fcastSub) {
    fcastSub.textContent = `Option mark · day-1 path ${f1}`;
  }
  set("vol-kpi-best", markName || "—");
  set(
    "vol-kpi-best-sub",
    s.bestForecastModelId || s.markModelId
      ? `QLIKE · ${s.bestForecastModelId || s.markModelId}`
      : "OOS forecast leader",
  );
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

function volSetLiveIvKpis(suite, chain) {
  const s = suite?.summary || {};
  const set = (id, text) => {
    const n = volEl(id);
    if (n) n.textContent = text;
  };
  const asof = volEl("vol-kpi-asof");
  const mark = (suite.models || []).find((m) => m.id === (s.markModelId || suite.bestByQlike));
  const { term7, term30 } = volMarkTermRv(mark || {}, s);
  const spot = chain?.indexPrice != null ? Number(chain.indexPrice) : volSuiteSpot(suite);
  const wExp = volPickListedExpiry(chain, { minDte: 3, maxDte: 12 });
  const mExp = volPickMonthlyExpiry(chain);
  const liveW = wExp && spot ? volAtmIvFromExp(wExp, spot) : null;
  const liveM = mExp && spot ? volAtmIvFromExp(mExp, spot) : null;
  const dvol = chain?.dvol != null && Number.isFinite(Number(chain.dvol)) ? Number(chain.dvol) : null;
  const atm7 = liveW?.iv ?? null;
  const atm30 = liveM?.iv ?? null;
  const ivShow = dvol != null ? dvol : atm7;
  set("vol-kpi-dvol", ivShow != null ? volFmtPct(ivShow, 1) : "—");
  set(
    "vol-kpi-dvol-sub",
    dvol != null
      ? `DVOL${atm7 != null ? ` · ATM 7d ${volFmtPct(atm7, 1)}` : ""}`
      : atm7 != null
        ? `ATM 7d (no DVOL)`
        : "Run to load book",
  );
  const g7 = atm7 != null && term7 != null ? atm7 - term7 : null;
  const g30 = atm30 != null && term30 != null ? atm30 - term30 : null;
  const gapTxt =
    g7 != null || g30 != null
      ? `${g7 != null ? volFmtPct(g7, 1) : "—"} / ${g30 != null ? volFmtPct(g30, 1) : "—"}`
      : "—";
  set("vol-kpi-ivgap", gapTxt);
  set("vol-kpi-ivgap-sub", g7 != null || g30 != null ? "positive = IV rich vs model" : "7d / 30d gap");
  const suiteAsOf = suite?.asOf ? String(suite.asOf).replace("T", " ").slice(0, 16) + " UTC" : "—";
  const chainAsOf = chain?.fetchedAt
    ? new Date(chain.fetchedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : "—";
  if (asof) {
    asof.textContent =
      `RV / GARCH as of ${suiteAsOf}${suite.fromCache ? " (cached)" : ""} · ` +
      `Deribit book ${chainAsOf} · index ${
        spot != null ? `$${Number(spot).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"
      }. Cond. vol is last daily close; IV is live.`;
  }
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
          ? m.fallbackFrom
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
        <td class="vol-td-text"><span class="vol-status vol-status--${status}"${
          m.rvNote && status === "ok" ? ` title="${volEscape(m.rvNote)}"` : ""
        }>${volEscape(status)}</span></td>
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
  const fallback = ok.filter((m) => m.fallbackFrom);
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
  const usedDays = String(suite.daysRequested || volEl("vol-range")?.value || "");
  const usedDist = String(suite.distribution || "").toLowerCase();
  if (usedDays !== VOL_DESK_DAYS || usedDist !== VOL_DESK_DIST) {
    lines.push(
      `Desk default is <strong>5Y + Student-t</strong> (see the note under Range / Distribution). ` +
        `This run used <strong>${usedDays === "3650" ? "10Y" : usedDays === "1825" ? "5Y" : usedDays === "1095" ? "3Y" : usedDays === "730" ? "2Y" : usedDays === "365" ? "1Y" : usedDays === "5000" ? "All" : usedDays + "d"}</strong>` +
        ` and <strong>${volEscape(usedDist || "—")}</strong> — compare QLIKE/term RV against a 5Y-t pass before sizing.`,
    );
  }

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

/** Last spot from suite price series (fallback null). */
function volSuiteSpot(suite) {
  const closes = suite?.series?.close;
  if (!Array.isArray(closes) || !closes.length) return null;
  for (let i = closes.length - 1; i >= 0; i--) {
    const c = Number(closes[i]);
    if (Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

/** Live Deribit option chain from /api/options/chain (same book as Options Strategy). */
let volDeribitChain = null;
/** Ranked tickets for the click-to-expand summary table. */
let volPlanTickets = [];
let volPlanTicketSel = "1";

async function volLoadDeribitChain() {
  try {
    const res = await fetch("/api/options/chain", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Deribit chain ${res.status}`);
    volDeribitChain = data;
    return data;
  } catch (err) {
    console.warn("[vol] Deribit chain", err);
    volDeribitChain = null;
    return null;
  }
}

/** Option-horizon term RV from a path of annualized day-ahead vols. */
function volTermFromPath(forecastAnn, h) {
  const path = (forecastAnn || []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (!path.length || !(h >= 1)) return null;
  const n = Math.min(Math.floor(h), path.length);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (path[i] / Math.sqrt(VOL_ANN)) ** 2;
  return Math.sqrt(acc / n) * Math.sqrt(VOL_ANN);
}

function volExpiryCodeFromMs(ms) {
  return volFmtDeribitExpiry(new Date(ms));
}

function volPickListedExpiry(chain, { minDte = 3, maxDte = 12, preferFriday = true } = {}) {
  const exps = chain?.expirations || [];
  const now = Date.now();
  const scored = [];
  for (const e of exps) {
    const dte =
      e.daysToExpiration != null
        ? Number(e.daysToExpiration)
        : (Number(e.expirationTimestamp) - now) / 86_400_000;
    if (!(dte >= minDte) || dte > maxDte) continue;
    if (!(e.strikes || []).length) continue;
    const day = new Date(e.expirationTimestamp).getUTCDay();
    scored.push({ e, dte, isFri: day === 5 });
  }
  if (!scored.length) return null;
  const fri = preferFriday ? scored.filter((x) => x.isFri) : scored;
  const pool = fri.length ? fri : scored;
  pool.sort((a, b) => a.dte - b.dte);
  return pool[0].e;
}

function volPickExpiryBand(chain, minDte, maxDte) {
  const exps = chain?.expirations || [];
  const now = Date.now();
  const scored = [];
  for (const e of exps) {
    const dte =
      e.daysToExpiration != null
        ? Number(e.daysToExpiration)
        : (Number(e.expirationTimestamp) - now) / 86_400_000;
    if (!(dte >= minDte) || dte > maxDte) continue;
    if (!(e.strikes || []).length) continue;
    const day = new Date(e.expirationTimestamp).getUTCDay();
    scored.push({ e, dte, isFri: day === 5 });
  }
  if (!scored.length) return null;
  const fri = scored.filter((x) => x.isFri);
  const pool = fri.length ? fri : scored;
  pool.sort((a, b) => a.dte - b.dte);
  return pool[pool.length - 1].e;
}

function volCycleFromSuite(suite) {
  const H4 = Date.UTC(2024, 3, 20);
  const nextH = Date.UTC(2028, 3, 20);
  const now = Date.now();
  const daysSinceH = Math.round((now - H4) / 86_400_000);
  const daysToNext = Math.round((nextH - now) / 86_400_000);
  const closes = suite?.series?.close || [];
  const dates = suite?.series?.dates || [];
  let peak = 0;
  let peakI = 0;
  closes.forEach((c, i) => {
    const n = Number(c);
    if (n > peak) {
      peak = n;
      peakI = i;
    }
  });
  const last = volSuiteSpot(suite);
  const dd = peak > 0 && last > 0 ? ((peak - last) / peak) * 100 : null;
  let daysSincePeak = null;
  if (dates[peakI]) {
    const t = Date.parse(String(dates[peakI]).slice(0, 10));
    if (Number.isFinite(t)) daysSincePeak = Math.max(0, Math.round((now - t) / 86_400_000));
  }
  const vc = typeof window !== "undefined" ? window.vcRef : null;
  if (vc?.cycleAthPrice && vc.currentPrice) {
    const vcDd = ((Number(vc.cycleAthPrice) - Number(vc.currentPrice)) / Number(vc.cycleAthPrice)) * 100;
    if (Number.isFinite(vcDd)) {
      dd = vcDd;
      peak = Number(vc.cycleAthPrice);
      last = Number(vc.currentPrice);
      if (vc.cycleAthDate) {
        const t = Date.parse(String(vc.cycleAthDate).slice(0, 10));
        if (Number.isFinite(t)) daysSincePeak = Math.max(0, Math.round((now - t) / 86_400_000));
      }
    }
  }
  let regime = "late_cycle";
  let blurb =
    `${daysSinceH}d after the Apr 2024 halvings, ~${daysToNext}d to the ~Apr 2028 estimate. ` +
    `Past the typical first-year markup window — own some long-dated crash convexity; do not sell LEAPS vol.`;
  if (dd != null && dd < 12 && daysSincePeak != null && daysSincePeak < 60) {
    regime = "late_distribution";
    blurb =
      `Only ~${dd.toFixed(0)}% off the 5Y sample high (${daysSincePeak}d). Distribution may still be resolving — ` +
      `prefer defined risk and longer-dated puts over selling far-dated premium.`;
  } else if (dd != null && dd >= 35) {
    regime = "markdown";
    blurb =
      `Spot is ~${dd.toFixed(0)}% below the 5Y sample high. That is markdown-shaped vs prior cycles — ` +
      `LEAPS put convexity and debit put spreads over selling long-dated vol.`;
  } else if (daysSinceH < 400) {
    regime = "markup";
    blurb =
      `${daysSinceH}d post-halving is still an early-to-mid markup analogue — longer-dated call convexity ` +
      `has historically been the cycle-congruent expression.`;
  } else if (dd != null && dd >= 18) {
    regime = "markdown";
    blurb =
      `~${dd.toFixed(0)}% off the sample peak and ${daysSinceH}d after H4. Treat as late-cycle/markdown for tenor choice: ` +
      `quarterly/LEAPS puts and calendars, not short LEAPS iron condors.`;
  }
  return {
    daysSinceH,
    daysToNext,
    dd,
    daysSincePeak,
    peak,
    last,
    regime,
    blurb,
  };
}

function volPickMonthlyExpiry(chain) {
  const exps = chain?.expirations || [];
  const now = Date.now();
  const cands = [];
  for (const e of exps) {
    const d = new Date(e.expirationTimestamp);
    if (d.getUTCDay() !== 5) continue;
    const dte =
      e.daysToExpiration != null
        ? Number(e.daysToExpiration)
        : (Number(e.expirationTimestamp) - now) / 86_400_000;
    if (dte < 18 || dte > 55) continue;
    const nextWeek = new Date(e.expirationTimestamp + 7 * 86_400_000);
    const lastOfMonth = nextWeek.getUTCMonth() !== d.getUTCMonth();
    cands.push({ e, dte, lastOfMonth });
  }
  const last = cands.filter((x) => x.lastOfMonth);
  const pool = last.length ? last : cands;
  if (!pool.length) return volPickListedExpiry(chain, { minDte: 20, maxDte: 50 });
  pool.sort((a, b) => a.dte - b.dte);
  return pool[0].e;
}

function volNearestStrikeRow(exp, target, needBoth = false) {
  const rows = exp?.strikes || [];
  let best = null;
  let bestDist = Infinity;
  for (const row of rows) {
    if (needBoth && !(row.call && row.put)) continue;
    if (!row.call && !row.put) continue;
    const dist = Math.abs(Number(row.strike) - Number(target));
    if (dist < bestDist) {
      bestDist = dist;
      best = row;
    }
  }
  if (!best && needBoth) return volNearestStrikeRow(exp, target, false);
  return best;
}

function volLiveInstrumentName(exp, strike, isCall) {
  const code = volExpiryCodeFromMs(exp.expirationTimestamp);
  const k = Number(strike);
  const strikeStr = Number.isInteger(k) ? String(k) : String(Math.round(k));
  return `BTC-${code}-${strikeStr}-${isCall ? "C" : "P"}`;
}

function volAtmIvFromExp(exp, indexPx) {
  const row = volNearestStrikeRow(exp, indexPx, true);
  const q = row?.call || row?.put;
  const iv = q?.iv != null ? Number(q.iv) : null;
  if (iv != null && Number.isFinite(iv) && iv > 0) {
    return { iv: iv > 3 ? iv / 100 : iv, strike: Number(row.strike), quote: q, row };
  }
  return null;
}

function volQuoteName(chain, name) {
  if (!name || !chain) return null;
  return chain.quotesByInstrument?.[name] || null;
}

/** Round BTC option strike to liquid Deribit-style grid. */
function volRoundStrike(spot, step) {
  const s = Number(spot);
  if (!Number.isFinite(s) || s <= 0) return null;
  const grid = step || (s >= 100_000 ? 2000 : s >= 20_000 ? 1000 : 500);
  return Math.round(s / grid) * grid;
}

/** Next Deribit-style Friday 08:00 UTC on/after minDays from as-of. */
function volDeribitFriday(minDays = 5, fromMs = Date.now()) {
  const d = new Date(fromMs);
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let t = utc + minDays * 86_400_000;
  // 0=Sun … 5=Fri
  while (new Date(t).getUTCDay() !== 5) t += 86_400_000;
  return new Date(t);
}

function volFmtDeribitExpiry(date) {
  const d = date instanceof Date ? date : new Date(date);
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  // Deribit does NOT zero-pad the day: 4SEP26 exists, 04SEP26 does not.
  const day = String(d.getUTCDate());
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${day}${mon.toUpperCase()}${yy}`;
}

function volFmtExpiryLabel(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }) + " 08:00 UTC";
}

function volDte(date, fromMs = Date.now()) {
  const ms = (date instanceof Date ? date.getTime() : date) - fromMs;
  return Math.max(0, Math.round(ms / 86_400_000));
}

const VOL_MON_IDX = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** Parse Deribit date token (4SEP26 / 28AUG26) or instrument BTC-4SEP26-77000-C → UTC ms. */
function volExpiryMsFromCode(code) {
  let token = String(code || "").trim().toUpperCase();
  if (token.startsWith("BTC-")) {
    const parts = token.split("-");
    if (parts.length >= 2) token = parts[1];
  }
  if (token.includes("/")) return null;
  const m = token.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = VOL_MON_IDX[m[2]];
  const year = 2000 + parseInt(m[3], 10);
  if (mon == null || !(day >= 1 && day <= 31)) return null;
  return Date.UTC(year, mon, day, 8, 0, 0);
}

/** Calendar days to a leg’s own expiry — instrument name first, then expiryCode, then dte. */
function volLegDteDays(L, fallbackDte, fromMs = Date.now()) {
  const ms = volExpiryMsFromCode(L?.instrument) || volExpiryMsFromCode(L?.expiryCode);
  if (ms != null) return (ms - fromMs) / 86_400_000;
  if (L?.dte != null && Number.isFinite(Number(L.dte))) return Number(L.dte);
  const fb = Number(fallbackDte);
  return Number.isFinite(fb) ? fb : 0;
}

function volFmtUsd(n, d = 0) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  const abs = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  if (v < 0) return `−$${abs}`;
  if (v > 0) return `+$${abs}`;
  return `$${abs}`;
}

function volFmtUsdAbs(n, d = 0) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Math.abs(Number(n)).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })}`;
}

/* ── Black–Scholes (r=0) for educational ticket stats ─────────────── */
function volNormPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function volNormCdf(x) {
  // Abramowitz–Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = volNormPdf(x);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** European BS price in USD per 1 BTC notional (linear approx; r=0). */
function volBsPrice(spot, strike, tYears, sigma, isCall) {
  const S = Number(spot);
  const K = Number(strike);
  const T = Math.max(Number(tYears) || 0, 1 / 365);
  const sig = Math.max(Number(sigma) || 0.01, 0.01);
  if (!(S > 0) || !(K > 0)) return 0;
  const volSqrt = sig * Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * sig * sig * T) / volSqrt;
  const d2 = d1 - volSqrt;
  if (isCall) return S * volNormCdf(d1) - K * volNormCdf(d2);
  return K * volNormCdf(-d2) - S * volNormCdf(-d1);
}

function volBsGreeks(spot, strike, tYears, sigma, isCall) {
  const S = Number(spot);
  const K = Number(strike);
  const T = Math.max(Number(tYears) || 0, 1 / 365);
  const sig = Math.max(Number(sigma) || 0.01, 0.01);
  if (!(S > 0) || !(K > 0)) {
    return { delta: 0, gamma: 0, vega: 0, theta: 0 };
  }
  const volSqrt = sig * Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * sig * sig * T) / volSqrt;
  const d2 = d1 - volSqrt;
  const pdf = volNormPdf(d1);
  const delta = isCall ? volNormCdf(d1) : volNormCdf(d1) - 1;
  const gamma = pdf / (S * volSqrt);
  const vega = (S * pdf * Math.sqrt(T)) / 100; // per 1 vol point
  // calendar theta per day (r=0)
  const theta =
    (-(S * pdf * sig) / (2 * Math.sqrt(T)) -
      (isCall ? 0 : 0)) /
    365;
  // put theta same leading term when r=0
  return { delta, gamma, vega, theta };
}

function volIntrinsic(spot, strike, isCall) {
  return isCall ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

/**
 * Price multi-leg structure and build expiry P&L curve + risk stats.
 * Uses model IV (or model RV + premium bump) — labeled as theoretical, not live mids.
 */
function volAnalyzeStructure({ legs, spot, dte, ivAnn, paper = false, ivAnnFront = null }) {
  const S0 = Number(spot);
  const Tdefault = Math.max((Number(dte) || 1) / 365, 1 / 365);
  const iv = Math.max(Number(ivAnn) || 0.4, 0.05);
  const ivFront = Math.max(Number(ivAnnFront) || iv, 0.05);
  const optLegs = (legs || []).filter(
    (L) => L && (L.type === "Call" || L.type === "Put") && L.strike != null && Number(L.qty) > 0,
  );
  if (!(S0 > 0) || !optLegs.length) return null;

  let netPremium = 0; // + = credit received, − = debit paid (USD per structure)
  let delta = 0;
  let gamma = 0;
  let vega = 0;
  let theta = 0;
  const pricedLegs = [];
  const tenorDays = optLegs.map((L) => volLegDteDays(L, dte));
  let minDte = Math.min(...tenorDays);
  if (!Number.isFinite(minDte)) minDte = Number(dte) || 7;

  for (let li = 0; li < optLegs.length; li++) {
    const L = optLegs[li];
    const isCall = L.type === "Call";
    const sign = L.side === "BUY" ? 1 : -1;
    const q = Number(L.qty) || 1;
    const legDte = tenorDays[li];
    const T = Math.max((Number(legDte) || 1) / 365, 1 / 365);
    // Front-week legs use front IV when provided (calendars)
    const sig = L.useFrontIv ? ivFront : iv;
    const px = volBsPrice(S0, L.strike, T, sig, isCall);
    const g = volBsGreeks(S0, L.strike, T, sig, isCall);
    // BUY pays → negative cash; SELL receives → positive cash
    netPremium += -sign * q * px;
    delta += sign * q * g.delta;
    gamma += sign * q * g.gamma;
    vega += sign * q * g.vega;
    theta += sign * q * g.theta;
    pricedLegs.push({
      ...L,
      theoUsd: px,
      cashUsd: -sign * q * px,
      delta: sign * q * g.delta,
      tYears: T,
      ivUsed: sig,
      legDte,
    });
  }

  // P&L at the *nearest* expiry: expired legs → intrinsic; longer-dated legs stay
  // marked with Black–Scholes remaining time (calendars / diagonals).
  const markLegAtHorizon = (L, S) => {
    const isCall = L.type === "Call";
    const legDte = volLegDteDays(L, dte);
    const remainingDays = legDte - minDte;
    if (!(remainingDays > 0.51)) {
      return volIntrinsic(S, L.strike, isCall);
    }
    const sig = L.useFrontIv ? ivFront : iv;
    return volBsPrice(S, L.strike, remainingDays / 365, sig, isCall);
  };
  const markLegIntrinsic = (L, S) => {
    const isCall = L.type === "Call";
    const sign = L.side === "BUY" ? 1 : -1;
    const q = Number(L.qty) || 1;
    return sign * q * volIntrinsic(S, L.strike, isCall);
  };

  const lo = S0 * 0.72;
  const hi = S0 * 1.28;
  const n = 81;
  const points = [];
  let maxProfit = -Infinity;
  let maxLoss = Infinity;
  let maxProfitSpot = S0;
  let maxLossSpot = S0;
  for (let i = 0; i < n; i++) {
    const S = lo + ((hi - lo) * i) / (n - 1);
    let pnl = netPremium; // start from premium cash
    let ghost = netPremium;
    for (const L of optLegs) {
      const sign = L.side === "BUY" ? 1 : -1;
      const q = Number(L.qty) || 1;
      pnl += sign * q * markLegAtHorizon(L, S);
      ghost += markLegIntrinsic(L, S);
    }
    points.push({ S, pnl, ghost });
    if (pnl > maxProfit) {
      maxProfit = pnl;
      maxProfitSpot = S;
    }
    if (pnl < maxLoss) {
      maxLoss = pnl;
      maxLossSpot = S;
    }
  }

  // Breakevens: sign change of pnl along the grid
  const breakevens = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.pnl === 0) breakevens.push(a.S);
    else if (a.pnl * b.pnl < 0) {
      const t = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl));
      breakevens.push(a.S + t * (b.S - a.S));
    }
  }

  const dailySig = iv / Math.sqrt(365);
  const move1Daily = S0 * dailySig;
  const move2Daily = S0 * 2 * dailySig;
  const T = Tdefault;
  const horizonMove1 = S0 * iv * Math.sqrt(T);
  const horizonMove2 = 2 * horizonMove1;
  const pnlAt = (S) => {
    let pnl = netPremium;
    for (const L of optLegs) {
      const sign = L.side === "BUY" ? 1 : -1;
      const q = Number(L.qty) || 1;
      pnl += sign * q * markLegAtHorizon(L, S);
    }
    return pnl;
  };
  const isMultiExpiry = Math.max(...tenorDays) - Math.min(...tenorDays) > 1;
  const pinPnl = pnlAt(S0);
  const wingPnl = pnlAt(S0 * 1.2);

  // Emergency numeric levels
  const stopLossUsd = Math.min(maxLoss * 0.5, netPremium < 0 ? netPremium * 1.25 : -Math.abs(netPremium) * 0.5);
  // For short credit: stop when loss ≈ 2× credit
  const emergencyLoss =
    netPremium > 0
      ? -Math.abs(netPremium) * 2
      : netPremium < 0
        ? netPremium * 1.5
        : maxLoss * 0.6;

  const isLongVol = netPremium < 0 && maxProfit > Math.abs(netPremium) * 2;
  const isShortVol = netPremium > 0;

  return {
    paper,
    ivAnn: iv,
    tYears: T,
    dte: Number.isFinite(minDte) ? Math.round(minDte) : Math.round(T * 365),
    netPremium,
    isCredit: netPremium > 0,
    isDebit: netPremium < 0,
    maxProfit: Number.isFinite(maxProfit) ? maxProfit : null,
    maxLoss: Number.isFinite(maxLoss) ? maxLoss : null,
    maxProfitSpot,
    maxLossSpot,
    breakevens,
    delta,
    gamma,
    vega,
    theta,
    pricedLegs,
    points,
    spot: S0,
    move1: move1Daily,
    move2: move2Daily,
    move1Daily,
    move2Daily,
    horizonMove1,
    horizonMove2,
    pnlDown1: pnlAt(S0 - horizonMove1),
    pnlUp1: pnlAt(S0 + horizonMove1),
    pnlDown2: pnlAt(S0 - horizonMove2),
    pnlUp2: pnlAt(S0 + horizonMove2),
    emergencyLoss,
    stopLossUsd: emergencyLoss,
    isLongVol: isMultiExpiry ? false : isLongVol,
    isShortVol: isMultiExpiry ? false : isShortVol,
    isMultiExpiry,
    horizonDte: Number.isFinite(minDte) ? Math.round(minDte) : Math.round(T * 365),
    pinPnl,
    wingPnl,
    backRemainingDays: isMultiExpiry ? Math.max(...tenorDays) - minDte : 0,
  };
}

/** SVG expiry P&L chart from analyze().points */
function volPayoffChartSvg(analyze, width = 440, height = 200) {
  if (!analyze?.points?.length) return "";
  const pts = analyze.points;
  const multi = !!analyze.isMultiExpiry;
  const pad = { t: 22, r: 10, b: 28, l: 52 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const pnls = pts.map((p) => p.pnl);
  const ghosts = multi ? pts.map((p) => p.ghost).filter((g) => Number.isFinite(g)) : [];
  let minP = Math.min(...pnls, ...ghosts, 0);
  let maxP = Math.max(...pnls, ...ghosts, 0);
  if (minP === maxP) {
    minP -= 1;
    maxP += 1;
  }
  const yPad = (maxP - minP) * 0.1;
  minP -= yPad;
  maxP += yPad;
  const minS = pts[0].S;
  const maxS = pts[pts.length - 1].S;
  const xAt = (S) => pad.l + ((S - minS) / (maxS - minS)) * w;
  const yAt = (pnl) => pad.t + ((maxP - pnl) / (maxP - minP)) * h;

  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(p.S).toFixed(1)},${yAt(p.pnl).toFixed(1)}`)
    .join(" ");
  const ghostPath =
    multi && ghosts.length === pts.length
      ? pts
          .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(p.S).toFixed(1)},${yAt(p.ghost).toFixed(1)}`)
          .join(" ")
      : "";
  const zeroY = yAt(0);
  const spotX = xAt(analyze.spot);
  const pinX = xAt(analyze.maxProfitSpot || analyze.spot);
  const pinY = yAt(analyze.maxProfit || 0);

  const be = (analyze.breakevens || []).slice(0, 3);

  return (
    `<svg class="vol-payoff-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="P&amp;L chart">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>` +
    `<line x1="${pad.l}" y1="${zeroY.toFixed(1)}" x2="${(width - pad.r).toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="rgba(148,163,184,0.35)" stroke-width="1"/>` +
    `<line x1="${spotX.toFixed(1)}" y1="${pad.t}" x2="${spotX.toFixed(1)}" y2="${(height - pad.b).toFixed(1)}" stroke="rgba(56,189,248,0.45)" stroke-width="1" stroke-dasharray="3 3"/>` +
    (ghostPath
      ? `<path d="${ghostPath}" fill="none" stroke="rgba(248,113,113,0.7)" stroke-width="1.5" stroke-dasharray="4 3"/>`
      : "") +
    `<path d="${path}" fill="none" stroke="#2dd4bf" stroke-width="2.4"/>` +
    `<circle cx="${pinX.toFixed(1)}" cy="${pinY.toFixed(1)}" r="4" fill="#fbbf24"/>` +
    be
      .map(
        (b) =>
          `<circle cx="${xAt(b).toFixed(1)}" cy="${zeroY.toFixed(1)}" r="3" fill="#fbbf24"/>`,
      )
      .join("") +
    `<text x="${pad.l}" y="${height - 8}" fill="#64748b" font-size="10" font-family="IBM Plex Mono,monospace">${volFmtUsdAbs(minS, 0)}</text>` +
    `<text x="${width - pad.r}" y="${height - 8}" fill="#64748b" font-size="10" font-family="IBM Plex Mono,monospace" text-anchor="end">${volFmtUsdAbs(maxS, 0)}</text>` +
    `<text x="${pad.l - 4}" y="${(pad.t + 10).toFixed(1)}" fill="#64748b" font-size="10" font-family="IBM Plex Mono,monospace" text-anchor="end">${volFmtUsd(maxP, 0)}</text>` +
    `<text x="${pad.l - 4}" y="${(height - pad.b).toFixed(1)}" fill="#64748b" font-size="10" font-family="IBM Plex Mono,monospace" text-anchor="end">${volFmtUsd(minP, 0)}</text>` +
    `<text x="${spotX.toFixed(1)}" y="${(pad.t + 11).toFixed(1)}" fill="#38bdf8" font-size="9" font-family="IBM Plex Sans,sans-serif" text-anchor="middle">spot</text>` +
    `<text x="${pinX.toFixed(1)}" y="${Math.max(12, pinY - 8).toFixed(1)}" fill="#fbbf24" font-size="9" font-family="IBM Plex Sans,sans-serif" text-anchor="middle">pin ${volFmtUsd(analyze.maxProfit, 0)}</text>` +
    `</svg>`
  );
}

function volInterpPnl(pts, S) {
  if (!pts?.length) return null;
  if (S <= pts[0].S) return pts[0].pnl;
  const last = pts[pts.length - 1];
  if (S >= last.S) return last.pnl;
  for (let i = 1; i < pts.length; i++) {
    if (S <= pts[i].S) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (S - a.S) / (b.S - a.S || 1);
      return a.pnl + t * (b.pnl - a.pnl);
    }
  }
  return last.pnl;
}

function volWinLoseBands(points) {
  const bands = [];
  for (const p of points || []) {
    const zone = p.pnl > 0 ? "win" : p.pnl < 0 ? "lose" : "even";
    const last = bands[bands.length - 1];
    if (last && last.zone === zone) last.hi = p.S;
    else bands.push({ zone, lo: p.S, hi: p.S });
  }
  return bands;
}

function volWinLoseKeyRows(analyze) {
  const S0 = +analyze?.spot;
  const pts = analyze?.points || [];
  if (!(S0 > 0) || !pts.length) return [];
  const lo = pts[0].S;
  const hi = pts[pts.length - 1].S;
  const buckets = new Map();
  const add = (px, tag) => {
    const S = Number(px);
    if (!(S > 0) || !Number.isFinite(S)) return;
    if (S < lo - 1 || S > hi + 1) return;
    const k = Math.round(S);
    let row = buckets.get(k);
    if (!row) {
      row = { S: k, tags: [] };
      buckets.set(k, row);
    }
    if (tag && !row.tags.includes(tag)) row.tags.push(tag);
  };
  add(S0, "now");
  add(S0 * 0.8, "−20%");
  add(S0 * 0.9, "−10%");
  add(S0 * 1.1, "+10%");
  add(S0 * 1.2, "+20%");
  const h1 = +analyze.horizonMove1 || 0;
  const h2 = +analyze.horizonMove2 || 0;
  if (h1 > 0) {
    add(S0 - h1, "−1σ");
    add(S0 + h1, "+1σ");
  }
  if (h2 > 0) {
    add(S0 - h2, "−2σ");
    add(S0 + h2, "+2σ");
  }
  const bes = analyze.breakevens || [];
  bes.forEach((b, i) => add(b, bes.length > 1 ? `BE${i + 1}` : "BE"));
  if (analyze.maxProfitSpot) add(analyze.maxProfitSpot, "pin");
  if (
    analyze.maxLossSpot &&
    Math.abs(analyze.maxLossSpot - S0) > Math.max(50, S0 * 0.004)
  ) {
    add(analyze.maxLossSpot, "worst");
  }

  return [...buckets.values()]
    .sort((a, b) => a.S - b.S)
    .map((r) => {
      const pnl = volInterpPnl(pts, r.S);
      const move = ((r.S - S0) / S0) * 100;
      let zone = "even";
      if (pnl > 5) zone = "win";
      else if (pnl < -5) zone = "lose";
      return { ...r, pnl, move, zone };
    });
}

function volWinLoseStripHtml(analyze, opts = {}) {
  const pts = analyze?.points;
  if (!pts?.length) return "";
  const nCells = opts.cells || 21;
  const mini = !!opts.mini;
  const n = pts.length;
  const maxAbs = Math.max(...pts.map((p) => Math.abs(p.pnl)), 1);
  const cells = [];
  for (let i = 0; i < nCells; i++) {
    const a = Math.floor((i * n) / nCells);
    const b = Math.max(a + 1, Math.floor(((i + 1) * n) / nCells));
    let sum = 0;
    let c = 0;
    for (let j = a; j < b && j < n; j++) {
      sum += pts[j].pnl;
      c++;
    }
    const avg = c ? sum / c : 0;
    const zone = avg > 0 ? "win" : avg < 0 ? "lose" : "even";
    const t = Math.min(1, Math.abs(avg) / maxAbs);
    cells.push({
      zone,
      t,
      lo: pts[a].S,
      hi: pts[Math.min(b, n) - 1].S,
    });
  }
  const minS = pts[0].S;
  const maxS = pts[n - 1].S;
  const span = maxS - minS || 1;
  const spotPct = Math.max(0, Math.min(100, ((analyze.spot - minS) / span) * 100));
  const cellHtml = cells
    .map((c) => {
      const alpha = (0.28 + 0.72 * c.t).toFixed(2);
      const bg =
        c.zone === "win"
          ? `rgba(52, 211, 153, ${alpha})`
          : c.zone === "lose"
            ? `rgba(248, 113, 113, ${alpha})`
            : `rgba(148, 163, 184, 0.38)`;
      const title = `${volFmtUsdAbs(c.lo, 0)}–${volFmtUsdAbs(c.hi, 0)} · ${c.zone.toUpperCase()}`;
      return `<span class="vol-wl-cell vol-wl-cell--${c.zone}" style="background:${bg}" title="${volEscape(title)}"></span>`;
    })
    .join("");
  return (
    `<div class="vol-wl-strip${mini ? " vol-wl-strip--mini" : ""}" role="img" aria-label="Win and lose zones versus spot">` +
    cellHtml +
    `<span class="vol-wl-spot" style="left:${spotPct.toFixed(2)}%" title="spot"></span>` +
    `</div>`
  );
}

function volWinLoseGridHtml(analyze) {
  const pts = analyze?.points;
  if (!pts?.length) return "";
  const rows = volWinLoseKeyRows(analyze);
  const bands = volWinLoseBands(pts);
  const wins = bands.filter((b) => b.zone === "win");
  const horizon = analyze.isMultiExpiry
    ? `front expiry (${analyze.horizonDte}d; back still live)`
    : `expiry (${analyze.dte}d)`;
  const bandText = wins.length
    ? `WIN ${wins
        .map((b) => `${volFmtUsdAbs(b.lo, 0)}–${volFmtUsdAbs(b.hi, 0)}`)
        .join(" · ")} · LOSE elsewhere on this ±28% scan.`
    : "No win zone on the scanned ±28% grid — P&amp;L ≤ 0 at every sampled spot.";
  const tableRows = rows
    .map((r) => {
      const now = r.tags.includes("now");
      const move =
        Math.abs(r.move) < 0.05
          ? "0%"
          : `${r.move > 0 ? "+" : "−"}${Math.abs(r.move).toFixed(1)}%`;
      return (
        `<tr class="vol-wl-row vol-wl-row--${r.zone}${now ? " vol-wl-row--now" : ""}">` +
        `<td class="mono">${volFmtUsdAbs(r.S, 0)}</td>` +
        `<td class="mono">${move}</td>` +
        `<td>${volEscape(r.tags.join(" · ") || "—")}</td>` +
        `<td class="mono">${volFmtUsd(r.pnl, 0)}</td>` +
        `<td class="vol-wl-zone">${r.zone.toUpperCase()}</td>` +
        `</tr>`
      );
    })
    .join("");
  return (
    `<div class="vol-wl-grid">` +
    `<div class="vol-wl-grid-head">` +
    `<span class="vol-wl-grid-label" data-help-key="vol-ticket-wlgrid">Win / lose zone grid</span>` +
    `<span class="vol-wl-legend">` +
    `<span class="vol-wl-chip vol-wl-chip--win">WIN</span>` +
    `<span class="vol-wl-chip vol-wl-chip--lose">LOSE</span>` +
    `<span class="vol-wl-chip vol-wl-chip--even">EVEN</span>` +
    `</span>` +
    `</div>` +
    `<p class="vol-wl-grid-sub">At ${horizon} · green = theo P&amp;L &gt; 0 · cyan tick = spot now · not a live probability</p>` +
    volWinLoseStripHtml(analyze, { cells: 24 }) +
    `<div class="vol-wl-axis">` +
    `<span class="mono">${volFmtUsdAbs(pts[0].S, 0)}</span>` +
    `<span>spot</span>` +
    `<span class="mono">${volFmtUsdAbs(pts[pts.length - 1].S, 0)}</span>` +
    `</div>` +
    `<p class="vol-wl-bands">${bandText}</p>` +
    `<div class="vol-wl-table-wrap">` +
    `<table class="vol-wl-table">` +
    `<thead><tr>` +
    `<th>Spot</th><th>vs now</th><th>Tag</th><th>P&amp;L</th><th>Zone</th>` +
    `</tr></thead>` +
    `<tbody>${tableRows}</tbody>` +
    `</table>` +
    `</div>` +
    `</div>`
  );
}

/**
 * Build a junior-readable “ticket card” for one multi-leg Deribit idea.
 * legs: [{ side: "BUY"|"SELL", type: "Call"|"Put"|"Perp", strike?: number, qty: number, note?: string }]
 */
function volTradeTicketHtml(ticket) {
  const legs = ticket.legs || [];
  const a = ticket.analyze;
  const missingLegs = legs.filter((L) => L.type !== "Perp" && L.listed === false);
  const legRows = legs
    .map((L) => {
      const sideCls = L.side === "BUY" ? "vol-ticket-buy" : "vol-ticket-sell";
      const strike =
        L.type === "Perp"
          ? "—"
          : L.strike != null
            ? `$${Number(L.strike).toLocaleString("en-US")}`
            : "—";
      const expCode = L.expiryCode || ticket.expiryCode;
      const inst =
        L.instrument ||
        (L.type === "Perp"
          ? "BTC-PERPETUAL"
          : `BTC-${expCode}-${L.strike}-${L.type === "Call" ? "C" : "P"}`);
      const listed = L.type === "Perp" ? true : L.listed !== false;
      const instHtml = listed
        ? volEscape(inst)
        : `<span class="vol-inst-missing" title="Not on the live Deribit instrument list">${volEscape(inst)}</span>`;
      const priced = a?.pricedLegs?.find(
        (p) =>
          p.type === L.type &&
          p.strike === L.strike &&
          p.side === L.side &&
          (p.expiryCode || ticket.expiryCode) === expCode,
      );
      const theo =
        L.type === "Perp"
          ? "—"
          : priced
            ? volFmtUsdAbs(priced.theoUsd, 0)
            : "—";
      const liveIv =
        L.liveIv != null && Number.isFinite(Number(L.liveIv))
          ? volFmtPct(Number(L.liveIv), 1)
          : "—";
      const listedCell = L.type === "Perp"
        ? `<span class="vol-listed vol-listed--ok">listed</span>`
        : listed
          ? `<span class="vol-listed vol-listed--ok">listed</span>`
          : `<span class="vol-listed vol-listed--miss">MISSING</span>`;
      return `<tr class="${listed ? "" : "vol-leg-row--missing"}">
        <td class="mono ${sideCls}"><strong>${volEscape(L.side)}</strong></td>
        <td class="mono">${instHtml}</td>
        <td>${listedCell}</td>
        <td>${volEscape(L.type)}</td>
        <td class="mono">${strike}</td>
        <td class="mono">${L.qty != null ? L.qty : 1}</td>
        <td class="mono">${theo}</td>
        <td class="mono">${liveIv}</td>
        <td>${volEscape(L.note || "")}</td>
      </tr>`;
    })
    .join("");

  const statsGrid = a
    ? `<div class="vol-ticket-stats">` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-iv">Theo IV used</span><span class="vol-ticket-stat-v mono">${volFmtPct(a.ivAnn, 1)}</span></div>` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-premium">Net premium</span><span class="vol-ticket-stat-v mono ${a.isCredit ? "vol-ticket-buy" : "vol-ticket-sell"}">${
        a.isCredit ? "Credit " : "Debit "
      }${volFmtUsdAbs(a.netPremium, 0)}</span></div>` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-maxprofit">Max profit (expiry)</span><span class="vol-ticket-stat-v mono vol-ticket-buy">${
        a.maxProfitDisplay
          ? volEscape(a.maxProfitDisplay)
          : !Number.isFinite(a.maxProfit)
            ? "Unlimited*"
            : volFmtUsd(a.maxProfit, 0)
      }</span></div>` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-maxloss">Max loss (expiry)</span><span class="vol-ticket-stat-v mono vol-ticket-sell">${volFmtUsd(a.maxLoss, 0)}</span></div>` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-be">Breakeven(s)</span><span class="vol-ticket-stat-v mono">${
        a.breakevens?.length
          ? a.breakevens.map((b) => volFmtUsdAbs(b, 0)).join(" · ")
          : "—"
      }</span></div>` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-greeks">Net Δ / Γ / ν / Θ</span><span class="vol-ticket-stat-v mono">${a.delta.toFixed(2)} / ${a.gamma.toFixed(5)} / ${a.vega.toFixed(1)} / ${a.theta.toFixed(1)}</span></div>` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-sigma1">P&amp;L if −1σ / +1σ at expiry</span><span class="vol-ticket-stat-v mono">${volFmtUsd(a.pnlDown1, 0)} / ${volFmtUsd(a.pnlUp1, 0)}</span></div>` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-sigma2">P&amp;L if −2σ / +2σ at expiry</span><span class="vol-ticket-stat-v mono">${volFmtUsd(a.pnlDown2, 0)} / ${volFmtUsd(a.pnlUp2, 0)}</span></div>` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-bands">Intraday 1σ / 2σ (stops)</span><span class="vol-ticket-stat-v mono">${volFmtUsdAbs(a.spot - a.move1Daily, 0)}–${volFmtUsdAbs(a.spot + a.move1Daily, 0)} · ${volFmtUsdAbs(a.spot - a.move2Daily, 0)}–${volFmtUsdAbs(a.spot + a.move2Daily, 0)}</span></div>` +
      `<div class="vol-ticket-stat"><span class="vol-ticket-stat-l" data-help-key="vol-ticket-dte">DTE / T (years)</span><span class="vol-ticket-stat-v mono">${a.dte}d · ${a.tYears.toFixed(3)}</span></div>` +
      `</div>` +
      `<p class="vol-ticket-pricing-note">Pricing: Black–Scholes (r=0) <strong>USD-linear proxy</strong> — Deribit BTC options are <strong>inverse</strong> (premium in BTC). These USD figures will not match the Deribit UI. IV = <strong>${volFmtPct(a.ivAnn, 1)}</strong>` +
      (ticket.ivSource === "live"
        ? ` from <strong>live Deribit ATM mark IV</strong>`
        : ` from model term RV` +
          (ticket.ivBumpPts
            ? ` with <strong>+${ticket.ivBumpPts.toFixed(0)} vol pt</strong> entry premium assumption`
            : "")) +
      `. Expiry ±1σ/±2σ uses <em>horizon</em> move S×IV×√T. Greeks: Δ unitless, Γ per $1, ν per 1 vol pt, Θ $/day.</p>`
    : "";

  const chartHtml = a
    ? `<div class="vol-payoff-wrap">` +
      `<div class="vol-payoff-label" data-help-key="vol-ticket-payoff">${
        a.isMultiExpiry
          ? `Teal = P&amp;L when the weekly expires (${a.horizonDte}d) and the monthly still has ~${Math.round(a.backRemainingDays || 0)}d left. Red dashed = old (wrong) chart that expired both months — a flat debit. Yellow = pin.`
          : `Expiry P&amp;L vs spot (USD) · yellow dots = breakevens · dashed = spot`
      }</div>` +
      (a.isMultiExpiry
        ? `<p class="vol-payoff-readout"><strong>Pin (spot still here at Friday):</strong> ${volFmtUsd(a.pinPnl, 0)}` +
          ` · <strong>If BTC is ±20% away:</strong> ${volFmtUsd(a.wingPnl, 0)}` +
          ` · Net debit to put on: ${volFmtUsd(a.netPremium, 0)}. You do <em>not</em> lose the debit at the pin if the monthly is still live.</p>`
        : "") +
      volPayoffChartSvg(a) +
      `</div>` +
      volWinLoseGridHtml(a)
    : "";

  // Emergency actions with real numbers + preliminary action buttons
  const tradeId = String(ticket.id);
  const em = a
    ? (() => {
        const lossCap = a.stopLossUsd;
        const low = a.spot - a.move2;
        const high = a.spot + a.move2;
        const iv = a.ivAnn;
        const lines = [];
        lines.push(
          `<strong>STOP — flatten all option legs immediately</strong> if open P&amp;L reaches ` +
            `<span class="mono vol-ticket-sell">${volFmtUsd(lossCap, 0)}</span> ` +
            `(≈ ${a.isCredit ? "2× credit received" : "1.5× debit paid"}). Do not “hope”.`,
        );
        lines.push(
          `<strong>STOP — flatten</strong> if spot trades outside ` +
            `<span class="mono">${volFmtUsdAbs(low, 0)} – ${volFmtUsdAbs(high, 0)}</span> ` +
            `(±2σ one-day band at theo IV ${volFmtPct(iv, 1)}) in a single session without a pre-approved hedge plan.`,
        );
        if (a.isShortVol) {
          lines.push(
            `<strong>STOP — cover shorts</strong> if DVOL / ATM IV jumps <span class="mono">+8 vol pts</span> from your entry IV in &lt;24h, or if liquidations cascade and funding flips violently.`,
          );
        }
        if (a.isLongVol || a.isDebit) {
          lines.push(
            `<strong>STOP — sell the long premium</strong> if IV collapses ` +
              `<span class="mono">≥ 8 vol pts</span> toward model RV while spot is quiet for 3 sessions, or if mark-to-market loss hits the cap above.`,
          );
        }
        lines.push(
          `<strong>HEDGE emergency:</strong> if |net Δ| exceeds <span class="mono">±0.35</span> per structure after a gap, trade <span class="mono">BTC-PERPETUAL</span> first to flatten delta, then decide on options. Do not add naked short legs.`,
        );
        lines.push(
          `<strong>WHO / HOW:</strong> use Deribit close / reduce-only; market-reduce if book is stressed. Log time, spot, IV, and reason. ` +
            (a.paper
              ? "This ticket is PAPER — do not send live orders."
              : "Escalate to senior if loss &gt; stop or margin warning appears."),
        );

        const btn = (action, label, cls, detail) =>
          `<button type="button" class="vol-em-btn ${cls}" ` +
          `data-vol-em-action="${volEscape(action)}" ` +
          `data-trade-id="${volEscape(tradeId)}" ` +
          `data-trade-title="${volEscape(ticket.title)}" ` +
          `data-loss-cap="${Number.isFinite(lossCap) ? lossCap.toFixed(2) : ""}" ` +
          `data-spot-low="${low.toFixed(0)}" data-spot-high="${high.toFixed(0)}" ` +
          `data-iv="${(iv * 100).toFixed(1)}" ` +
          `data-detail="${volEscape(detail)}">` +
          `${volEscape(label)}` +
          `</button>`;

        const actions =
          `<div class="vol-emergency-actions">` +
          btn(
            "flatten",
            "Flatten all legs",
            "vol-em-btn--stop",
            `Close every option leg on Trade ${tradeId} reduce-only. Loss cap ${volFmtUsd(lossCap, 0)}.`,
          ) +
          btn(
            "hedge_delta",
            "Hedge delta (perp)",
            "vol-em-btn--hedge",
            `Trade BTC-PERPETUAL to drive net Δ → 0 on Trade ${tradeId} (target |Δ| &lt; 0.05).`,
          ) +
          btn(
            "cut_half",
            "Cut size 50%",
            "vol-em-btn--warn",
            `Reduce all option qtys on Trade ${tradeId} by half, keep wings, re-hedge delta.`,
          ) +
          (a.isShortVol
            ? btn(
                "cover_shorts",
                "Cover short premium",
                "vol-em-btn--stop",
                `Buy back short option legs on Trade ${tradeId}; leave long wings on if still needed for protection, then reassess.`,
              )
            : "") +
          (a.isLongVol && !a.isMultiExpiry
            ? btn(
                "dump_longs",
                "Dump long premium",
                "vol-em-btn--stop",
                `Sell long option legs on Trade ${tradeId} at market/reduce-only; stop bleeding theta/IV crush.`,
              )
            : "") +
          btn(
            "log_escalate",
            "Log & escalate",
            "vol-em-btn--info",
            `Write incident note for Trade ${tradeId} (time, spot, IV, P&amp;L) and page senior — no new risk.`,
          ) +
          `</div>` +
          `<p class="vol-emergency-btn-note">Buttons are <strong>preliminary</strong>: they confirm intent and log a dry-run checklist. Live Deribit routing is not connected yet.</p>`;

        return (
          `<div class="vol-emergency" role="region" aria-label="Emergency actions">` +
          `<div class="vol-emergency-title" data-help-key="vol-ticket-emergency">Emergency actions (do these first)</div>` +
          `<ol class="vol-emergency-list">${lines.map((x) => `<li>${x}</li>`).join("")}</ol>` +
          actions +
          `</div>`
        );
      })()
    : "";

  const executeDisabled = missingLegs.length > 0;
  const executeBtn =
    `<div class="vol-ticket-actions">` +
    `<button type="button" class="vol-execute-btn" data-vol-em-action="execute" ` +
    `data-trade-id="${volEscape(tradeId)}" data-trade-title="${volEscape(ticket.title)}" ` +
    `${executeDisabled ? "disabled" : ""} ` +
    `title="${executeDisabled ? "Blocked: a leg is not on the live Deribit list" : "Does not send to Deribit — logs a dry-run only"}">` +
    `Log dry-run` +
    `</button>` +
    `<span class="vol-execute-hint">${
      executeDisabled
        ? `Blocked — ${missingLegs.length} leg(s) not listed. Do not type the name by hand.`
        : "Does not send orders. Click only logs a dry-run checklist in this browser."
    }</span>` +
    `</div>`;

  const sophBadge = ticket.sophistication
    ? `<span class="vol-ticket-badge vol-ticket-badge--soph">${volEscape(ticket.sophistication)}</span>`
    : "";
  const sc = ticket.score;
  const rankBadge =
    ticket.rank != null
      ? `<span class="vol-ticket-badge vol-ticket-badge--rank${ticket.rank === 1 ? " vol-ticket-badge--rank1" : ""}">#${ticket.rank}</span>`
      : "";
  const scoreLine = sc
    ? `<p class="vol-ticket-scoreline">` +
      `<span data-help-key="vol-ticket-score">Desk scores</span> · ` +
      `<strong>Rank #${ticket.rank}</strong>` +
      (ticket.rank === 1 ? " · <strong>top composite in this list</strong>" : "") +
      ` · Attract <span class="mono">${sc.attract}</span>` +
      ` · Composite <span class="mono">${sc.composite}</span>` +
      ` · Grade <span class="mono">${volEscape(sc.grade)}</span>` +
      (sc.winPct != null
        ? ` · Win-zone on grid <span class="mono">${(sc.winPct * 100).toFixed(0)}%</span> of scanned spots (not a live win rate)`
        : "") +
      (sc.rr != null && Number.isFinite(sc.rr)
        ? ` · R:R <span class="mono">${sc.rr.toFixed(2)}</span>`
        : "") +
      `</p>`
    : "";

  return (
    `<article class="vol-ticket${ticket.rank === 1 ? " vol-ticket--best" : ""}" data-trade-id="${volEscape(tradeId)}">` +
    `<header class="vol-ticket-head">` +
    rankBadge +
    `<span class="vol-ticket-id">Trade ${volEscape(tradeId)}</span>` +
    `<span class="vol-ticket-title">${volEscape(ticket.title)}</span>` +
    sophBadge +
    (a?.paper ? `<span class="vol-ticket-badge vol-ticket-badge--paper">PAPER</span>` : "") +
    (missingLegs.length
      ? `<span class="vol-ticket-badge vol-ticket-badge--miss">${missingLegs.length} missing contract${missingLegs.length > 1 ? "s" : ""}</span>`
      : legs.some((L) => L.type !== "Perp" && L.listed === true)
        ? `<span class="vol-ticket-badge vol-ticket-badge--listed">all legs listed</span>`
        : `<span class="vol-ticket-badge vol-ticket-badge--unverified">book not checked</span>`) +
    (a?.isCredit ? `<span class="vol-ticket-badge vol-ticket-badge--credit">CREDIT</span>` : "") +
    (a?.isDebit ? `<span class="vol-ticket-badge vol-ticket-badge--debit">DEBIT</span>` : "") +
    `</header>` +
    scoreLine +
    `<p class="vol-ticket-intent"><strong>Idea in plain English:</strong> ${ticket.intent}</p>` +
    `<ul class="vol-ticket-meta">` +
    `<li><strong>Venue:</strong> Deribit · BTC options${ticket.hedge ? " + BTC-PERPETUAL hedge" : ""}</li>` +
    `<li><strong>Expiry:</strong> ${volEscape(ticket.expiryLabel)} · <strong>~${ticket.dte} DTE</strong> · code <span class="mono">${volEscape(ticket.expiryCode)}</span></li>` +
    `<li><strong>Spot ref:</strong> ${
      ticket.spot != null
        ? `$${Number(ticket.spot).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
        : "—"
    } · strikes on liquid grid — re-center ATM on the live book</li>` +
    `<li><strong>What must be true (entry gate):</strong> ${ticket.gate}</li>` +
    `<li><strong>Planned exit (non-emergency):</strong> ${ticket.exit}</li>` +
    `</ul>` +
    statsGrid +
    chartHtml +
    `<div class="vol-ticket-legs-wrap">` +
    `<table class="vol-ticket-legs">` +
    `<thead><tr><th>Side</th><th>Instrument</th><th>Book</th><th>Type</th><th>Strike</th><th>Qty</th><th>Theo $</th><th>Live IV</th><th>Role</th></tr></thead>` +
    `<tbody>${legRows}</tbody>` +
    `</table>` +
    `</div>` +
    em +
    (ticket.juniorNote
      ? `<p class="vol-ticket-junior"><strong>Junior tip:</strong> ${ticket.juniorNote}</p>`
      : "") +
    executeBtn +
    `</article>`
  );
}

/** Attach BS analysis to each ticket (mutates tickets). */
function volEnrichTickets(tickets, ctx) {
  const { spot, rv7, rv30, bias, chain, liveIv7, liveIv30 } = ctx;
  return (tickets || []).map((t) => {
    const dte = t.dte || 7;
    // IV for pricing: live ATM mark IV if we have it, else model term RV + bump
    let baseIv = dte >= 20 ? rv30 : rv7;
    if (baseIv == null || !Number.isFinite(baseIv)) baseIv = 0.45;
    const baseIvFront =
      rv7 != null && Number.isFinite(rv7) ? rv7 : baseIv;
    let ivBumpPts = 0;
    let ivSource = "model";
    const liveForTicket = dte >= 20 ? liveIv30 : liveIv7;
    if (liveForTicket != null && Number.isFinite(liveForTicket) && liveForTicket > 0.05) {
      baseIv = liveForTicket;
      ivBumpPts = 0;
      ivSource = "live";
    } else if (bias === "short") ivBumpPts = 6;
    else if (bias === "long") ivBumpPts = 0;
    else if (bias === "neutral") ivBumpPts = 3;
    const ivAnn = Math.max(0.08, baseIv + ivBumpPts / 100);
    const ivAnnFront = Math.max(
      0.08,
      (liveIv7 != null && Number.isFinite(liveIv7) ? liveIv7 : baseIvFront) +
        (ivSource === "live" ? 0 : bias === "neutral" ? 5 : ivBumpPts) / 100,
    );
    let gateFailed = false;
    if (
      t.frontExpiryCode &&
      t.backExpiryCode &&
      liveIv7 != null &&
      liveIv30 != null &&
      rv7 != null &&
      rv30 != null &&
      /calendar/i.test(t.title || "")
    ) {
      const frontEdge = liveIv7 - rv7 - (liveIv30 - rv30);
      if (!(frontEdge >= 0.025)) gateFailed = true;
    }
    const paper = bias === "none" || t.paper === true || gateFailed;
    // Tag calendar front legs + bind to live book
    const expFor = (code) => {
      if (!chain?.expirations || !code) return null;
      return (
        chain.expirations.find(
          (e) => volExpiryCodeFromMs(e.expirationTimestamp) === String(code),
        ) || null
      );
    };
    const legs = (t.legs || []).map((L0) => {
      let L = { ...L0 };
      if (L.dte == null && !L.useFrontIv) {
        if (L.expiryCode && t.frontExpiryCode && L.expiryCode === t.frontExpiryCode) {
          L = { ...L, useFrontIv: true, dte: t.frontDte ?? dte };
        } else if (L.expiryCode && t.backExpiryCode && L.expiryCode === t.backExpiryCode) {
          L = { ...L, dte: t.backDte ?? dte };
        }
      }
      return volBindLegToBook(
        chain,
        L,
        expFor(L.expiryCode || t.expiryCode),
        t.expiryCode,
      );
    });
    const analyze = volAnalyzeStructure({
      legs,
      spot: t.spot ?? spot,
      dte,
      ivAnn,
      ivAnnFront,
      paper,
    });
    // Cap "unlimited" display for long naked call/put wings on grid edge
    if (
      analyze &&
      Number.isFinite(analyze.maxProfit) &&
      Math.abs(analyze.netPremium) > 0 &&
      analyze.maxProfit > Math.abs(analyze.netPremium) * 40
    ) {
      analyze.maxProfitDisplay = "large / uncapped on grid";
    }
    if (gateFailed && analyze) {
      t = {
        ...t,
        paper: true,
        juniorNote:
          (t.juniorNote || "") +
          " LIVE GATE FAILED: front IV is not ≥ ~3 vol pts richer than back vs the model. Do not run this calendar live — the chart would still show a pin peak, but you are selling the cheap tenor.",
      };
    }
    return { ...t, legs, analyze, ivBumpPts, paper, ivSource, gateFailed };
  });
}

/**
 * Score ticket for desk ranking: attractiveness (edge / R:R) vs chance of success
 * (win-zone, defined risk, simplicity). Composite ranks the list.
 */
function volScoreTicket(t, ctx) {
  const a = t.analyze;
  const bias = ctx?.bias || "neutral";
  let attract = 48;
  let success = 48;
  const notes = [];

  if (t.paper || bias === "none") {
    attract -= 22;
    success -= 18;
    notes.push("paper / no-trade regime");
  }
  if (t.sophistication === "Core") {
    success += 14;
    attract += 4;
    notes.push("core structure");
  } else if (t.sophistication === "Genius") {
    success -= 12;
    attract += 14;
    notes.push("genius / high ops load");
  } else if (t.sophistication === "Advanced") {
    success -= 10;
    attract += 10;
    notes.push("advanced ops load");
  }

  let winPct = null;
  let rr = null;
  let creditEdge = null;

  if (a) {
    const pts = a.points || [];
    if (pts.length) {
      winPct = pts.filter((p) => p.pnl > 0).length / pts.length;
      // Map win-zone to success (centered at 50%)
      success += (winPct - 0.5) * 48;
    }

    const maxL = Math.abs(a.maxLoss);
    const maxP = Number.isFinite(a.maxProfit)
      ? Math.max(a.maxProfit, 0)
      : maxL > 0
        ? maxL * 2.5
        : 0;
    if (maxL > 1e-6) {
      rr = maxP / maxL;
      attract += Math.min(22, rr * 12);
      if (rr >= 1.2) notes.push("favorable R:R");
      if (rr < 0.4 && a.isDebit) {
        attract -= 8;
        notes.push("debit R:R tight");
      }
    }

    if (a.isCredit && maxL > 1e-6) {
      creditEdge = a.netPremium / maxL;
      attract += Math.min(16, creditEdge * 55);
      success += Math.min(12, creditEdge * 40);
      if (creditEdge >= 0.25) notes.push("solid credit vs max loss");
    }

    // Defined risk (finite, not pathologically large vs premium)
    if (Number.isFinite(a.maxLoss) && maxL < Math.abs(a.netPremium) * 25 + 1) {
      success += 10;
      notes.push("defined risk");
    } else {
      success -= 12;
      attract -= 4;
      notes.push("open-ended / heavy tail risk");
    }

    // Prefer near-flat delta for pure vol tickets
    const absD = Math.abs(a.delta);
    if (absD < 0.15) success += 8;
    else if (absD < 0.35) success += 3;
    else {
      success -= 8;
      attract -= 3;
      notes.push("directional Δ");
    }

    // Carry alignment
    if (bias === "short" && a.theta > 0) {
      success += 6;
      attract += 3;
    }
    if (bias === "long" && a.vega > 0) attract += 5;
    if (bias === "short" && a.vega < 0) attract += 4;

    // Scenario symmetry: average of ±1σ P&L as soft quality
    const avg1 = (a.pnlDown1 + a.pnlUp1) / 2;
    if (bias === "short" && avg1 > 0) success += 5;
    if (bias === "long" && (a.pnlDown2 > 0 || a.pnlUp2 > 0)) attract += 4;
  } else {
    success -= 15;
    attract -= 10;
    notes.push("unpriced");
  }

  // Ops complexity: more option legs → lower success for juniors
  const nOpt = (t.legs || []).filter((L) => L.type === "Call" || L.type === "Put").length;
  if (nOpt >= 5) {
    success -= 10;
    notes.push("many legs");
  } else if (nOpt === 4) success -= 4;
  else if (nOpt === 2) success += 4;

  // Multi-expiry harder
  const expCodes = new Set(
    (t.legs || [])
      .filter((L) => L.type === "Call" || L.type === "Put")
      .map((L) => L.expiryCode || t.expiryCode),
  );
  if (expCodes.size > 1) {
    success -= 7;
    attract += 5;
    notes.push("multi-expiry");
  }

  attract = Math.round(Math.max(8, Math.min(96, attract)));
  success = Math.round(Math.max(8, Math.min(94, success)));
  const composite = Math.round(0.42 * attract + 0.58 * success);

  let grade = "C";
  if (composite >= 78) grade = "A";
  else if (composite >= 68) grade = "B+";
  else if (composite >= 58) grade = "B";
  else if (composite >= 48) grade = "C+";
  else if (composite >= 38) grade = "C";
  else grade = "D";

  return {
    attract,
    success,
    composite,
    grade,
    winPct,
    rr,
    creditEdge,
    notes: notes.slice(0, 4),
  };
}

/** Sort enriched tickets by composite score; assign rank 1..n (best first). */
function volRankTickets(tickets, ctx) {
  const scored = (tickets || []).map((t) => {
    const score = volScoreTicket(t, ctx);
    return { ...t, score, origId: t.id };
  });
  scored.sort((a, b) => {
    const dc = (b.score?.composite ?? 0) - (a.score?.composite ?? 0);
    if (dc !== 0) return dc;
    return (b.score?.success ?? 0) - (a.score?.success ?? 0);
  });
  return scored.map((t, i) => ({
    ...t,
    rank: i + 1,
    id: String(i + 1), // display / emergency ids follow rank order
    rankLabel: `#${i + 1}`,
  }));
}

function volTicketsSummaryTableHtml(tickets) {
  if (!tickets?.length) return "";
  const rows = tickets
    .map((t) => {
      const a = t.analyze;
      const s = t.score || {};
      const winPctTxt =
        s.winPct != null ? `${(s.winPct * 100).toFixed(0)}%` : "—";
      const winCell = a
        ? `<div class="vol-wl-mini">${volWinLoseStripHtml(a, { cells: 17, mini: true })}<span class="mono">${winPctTxt}</span></div>`
        : winPctTxt;
      const rr =
        s.rr != null && Number.isFinite(s.rr) ? s.rr.toFixed(2) : "—";
      const prem = a
        ? `${a.isCredit ? "Cr " : "Db "}${volFmtUsdAbs(a.netPremium, 0)}`
        : "—";
      const maxL = a ? volFmtUsd(a.maxLoss, 0) : "—";
      const maxP = a
        ? a.maxProfitDisplay
          ? a.maxProfitDisplay
          : !Number.isFinite(a.maxProfit)
            ? "Uncapped"
            : volFmtUsd(a.maxProfit, 0)
        : "—";
      const nLegs = (t.legs || []).filter(
        (L) => L.type === "Call" || L.type === "Put",
      ).length;
      const gradeCls =
        s.grade === "A" || s.grade === "B+"
          ? "vol-rank-hi"
          : s.grade === "D"
            ? "vol-rank-lo"
            : "";
      return `<tr class="vol-summary-row${t.rank === 1 ? " vol-summary-row--best" : ""}${String(t.id) === String(volPlanTicketSel) ? " vol-summary-row--sel" : ""}" data-vol-ticket-id="${volEscape(String(t.id))}" tabindex="0" role="button">
        <td class="mono"><strong>${t.rank}</strong></td>
        <td>${volEscape(t.title)}${t.paper ? ' <span class="vol-ticket-badge vol-ticket-badge--paper">PAPER</span>' : ""}</td>
        <td>${volEscape(t.sophistication || "—")}</td>
        <td class="mono ${gradeCls}"><strong>${volEscape(s.grade || "—")}</strong></td>
        <td class="mono">${s.attract != null ? s.attract : "—"}</td>
        <td>${winCell}</td>
        <td class="mono">${s.composite != null ? s.composite : "—"}</td>
        <td class="mono">${prem}</td>
        <td class="mono vol-ticket-sell">${maxL}</td>
        <td class="mono vol-ticket-buy">${volEscape(String(maxP))}</td>
        <td class="mono">${rr}</td>
        <td class="mono">${nLegs}</td>
        <td class="mono">${t.dte != null ? t.dte + "d" : "—"}</td>
      </tr>`;
    })
    .join("");

  return (
    `<h3 class="vol-plan-h" data-help-key="vol-plan-summary">Suggested trades — ranked summary</h3>` +
    `<p class="vol-plan-why">Ordered by <strong>composite desk score</strong> = 42% attractiveness (edge, R:R, structure fit) + ` +
    `58% process score (defined risk, delta neutrality, simplicity, grid win-zone). ` +
    `<strong>Win-zone</strong> = share of a uniform spot grid with theo P&amp;L &gt; 0 — not a live probability of profit. ` +
    `The green/red strip on each row is that same grid (left = −28%, right = +28%, cyan = spot). ` +
    `Click a row to open that ticket below (legs, payoff, win/lose zone table, dry-run). <strong>#1</strong> is selected by default.</p>` +
    `<div class="vol-summary-wrap">` +
    `<table class="vol-summary-table">` +
    `<thead><tr>` +
    `<th data-help-key="vol-sum-rank">Rank</th>` +
    `<th data-help-key="vol-sum-trade">Trade</th>` +
    `<th data-help-key="vol-sum-style">Style</th>` +
    `<th data-help-key="vol-sum-grade">Grade</th>` +
    `<th data-help-key="vol-sum-attract">Attract</th>` +
    `<th data-help-key="vol-sum-winzone">Win-zone (grid)</th>` +
    `<th data-help-key="vol-sum-score">Score</th>` +
    `<th data-help-key="vol-sum-premium">Premium</th>` +
    `<th data-help-key="vol-sum-maxloss">Max loss</th>` +
    `<th data-help-key="vol-sum-maxprofit">Max profit</th>` +
    `<th data-help-key="vol-sum-rr">R:R</th>` +
    `<th data-help-key="vol-sum-legs">Legs</th>` +
    `<th data-help-key="vol-sum-dte">DTE</th>` +
    `</tr></thead>` +
    `<tbody>${rows}</tbody>` +
    `</table>` +
    `</div>`
  );
}

/**
 * Concrete example tickets from suite marks + spot (educational, not live quotes).
 */
function volExpiryFromListed(exp) {
  if (!exp?.expirationTimestamp) return null;
  const d = new Date(exp.expirationTimestamp);
  return {
    date: d,
    code: volExpiryCodeFromMs(exp.expirationTimestamp),
    label: volFmtExpiryLabel(d),
    dte: Math.max(0, Math.round(Number(exp.daysToExpiration) || volDte(d))),
    exp,
  };
}

function volSnapStrike(exp, target, needBoth = false) {
  if (!exp) return volRoundStrike(target, Number(target) >= 100_000 ? 2000 : 1000);
  const row = volNearestStrikeRow(exp, target, needBoth);
  return row ? Number(row.strike) : volRoundStrike(target, Number(target) >= 100_000 ? 2000 : 1000);
}

function volBindLegToBook(chain, L, fallbackExp, ticketExpCode) {
  if (!L || L.type === "Perp") {
    if (L) L.listed = true;
    return L;
  }
  if (!chain?.quotesByInstrument && !chain?.expirations?.length) {
    return L;
  }
  const code = L.expiryCode || ticketExpCode;
  const isCall = L.type === "Call";
  let exp = fallbackExp;
  if (chain?.expirations && code && !String(code).includes("/")) {
    const hit = chain.expirations.find(
      (e) => volExpiryCodeFromMs(e.expirationTimestamp) === String(code),
    );
    if (hit) exp = hit;
  }
  const target = Number(L.strike);
  const snapped = volSnapStrike(exp, target, false);
  if (snapped != null) L.strike = snapped;
  const name = exp
    ? volLiveInstrumentName(exp, L.strike, isCall)
    : `BTC-${code}-${L.strike}-${isCall ? "C" : "P"}`;
  L.instrument = name;
  const q = volQuoteName(chain, name);
  if (q) {
    L.listed = true;
    L.liveIv = q.iv != null ? (Number(q.iv) > 3 ? Number(q.iv) / 100 : Number(q.iv)) : null;
    L.liveMark = q.mark;
    L.liveOi = q.openInterest;
    L.liveVolume = q.volume;
  } else if (exp) {
    const row = volNearestStrikeRow(exp, L.strike, false);
    const side = isCall ? row?.call : row?.put;
    if (side?.instrumentName) {
      L.instrument = side.instrumentName;
      L.strike = Number(row.strike);
      L.listed = true;
      L.liveIv = side.iv != null ? (Number(side.iv) > 3 ? Number(side.iv) / 100 : Number(side.iv)) : null;
      L.liveMark = side.mark;
    } else {
      L.listed = false;
    }
  } else {
    L.listed = false;
  }
  return L;
}

/**
 * Extra tickets from Derivatives → Options → Strategy builder catalog
 * plus longer-dated (quarterly / LEAPS) structures sized to the 4y cycle lens.
 */
function volBuilderCycleExtras(p) {
  const {
    bias,
    spot,
    qty,
    atm,
    hedgeNote,
    rv7s,
    rv30s,
    wCode,
    mCode,
    qCode,
    leapCode,
    wLabel,
    mLabel,
    qLabel,
    leapLabel,
    wDte,
    mDte,
    qDte,
    leapDte,
    putWing,
    callWing,
    putFar,
    callFar,
    put25,
    call25,
    put15,
    call15,
    put10,
    call10,
    itmCall,
    itmPut,
    cycle,
    leapExp,
    qExp,
    mExp,
  } = p;
  if (bias === "none") return [];
  const rows = [];
  const qOk = qCode && qDte >= 80;
  const leapOk = leapCode && leapDte >= 170;
  const longDated = leapOk ? leapCode : qOk ? qCode : mCode;
  const longLabel = leapOk ? leapLabel : qOk ? qLabel : mLabel;
  const longDte = leapOk ? leapDte : qOk ? qDte : mDte;
  const longExp = leapExp || qExp || mExp;
  const late = cycle?.regime === "markdown" || cycle?.regime === "late_cycle" || cycle?.regime === "late_distribution";
  const early = cycle?.regime === "markup";
  const snapL = (target) => volSnapStrike(longExp || mExp, target);

  const base = (partial) => ({
    spot,
    hedge: true,
    ...partial,
  });

  // Strategy-builder catalog gaps (same-expiry vanilla / defined)
  if (bias === "long") {
    rows.push(
      base({
        id: "SB-LC",
        sophistication: "Core",
        title: "Long call (strategy builder)",
        intent: "Vanilla upside from the Options Strategy library. Use when IV is cheap and you want a simple directional long.",
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Monthly IV ≤ ${rv30s} + 2 pts. Cycle: prefer this more in markup; in markdown size tiny.`,
        exit: "Take profit on a squeeze; cut if IV crush + no trend.",
        juniorNote: hedgeNote + " Same structure as Strategy Builder → Long Call.",
        legs: [{ side: "BUY", type: "Call", strike: atm, qty, note: "ATM call" }],
      }),
      base({
        id: "SB-BCS",
        sophistication: "Core",
        title: "Bull call spread (debit vertical)",
        intent: "Buy ATM call, sell higher call. Defined-risk upside from the builder catalog — cheaper than a naked long call.",
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `IV not rich vs ${rv30s}. You will accept capped upside.`,
        exit: "Hold to expiry if thesis intact; cut if debit is lost ~1.5×.",
        juniorNote: "Strategy Builder → Bull Call Spread. Max profit = width − debit.",
        legs: [
          { side: "BUY", type: "Call", strike: atm, qty, note: "Long ATM call" },
          { side: "SELL", type: "Call", strike: call25, qty, note: "Short OTM call (cap)" },
        ],
      }),
      base({
        id: "SB-STRAP",
        sophistication: "Advanced",
        title: "Strap (2× call + 1× put — squeeze-biased long vol)",
        intent: "Builder strap: extra call vs a straddle. Cheap-IV long vol with upside weight.",
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Weekly IV ≤ ${rv7s} + 2 pts.`,
        exit: "Same as straddle; extra call is the squeeze kicker.",
        juniorNote: "Strategy Builder → Strap. Hedge residual delta.",
        legs: [
          { side: "BUY", type: "Call", strike: atm, qty: qty * 2, note: "2× ATM call" },
          { side: "BUY", type: "Put", strike: atm, qty, note: "ATM put" },
        ],
      }),
      base({
        id: "SB-GUTS",
        sophistication: "Genius",
        title: "Guts (ITM strangle — expensive long vol)",
        intent: "Buy ITM call + ITM put. Very expensive, very long gamma. Builder guts. Only if options are genuinely cheap vs term RV.",
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `IV well below ${rv7s}. If IV is even slightly rich, skip — you overpay for both sides.`,
        exit: "Take profit on a large move; theta is brutal.",
        juniorNote: "ITM call strike below spot, ITM put above spot. Confirm both listed.",
        legs: [
          { side: "BUY", type: "Call", strike: itmCall, qty, note: "ITM call" },
          { side: "BUY", type: "Put", strike: itmPut, qty, note: "ITM put" },
        ],
      }),
      base({
        id: "SB-IIB",
        sophistication: "Advanced",
        title: "Inverse iron butterfly (long ATM straddle, short wings)",
        intent: "Builder inverse fly: long ATM vol, short further wings to cut debit. Defined-risk long vol.",
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Weekly IV ≤ ${rv7s} + 2 pts on the ATM.`,
        exit: "Take profit if ATM vol pays; max loss is the debit.",
        juniorNote: "Strategy Builder → Inverse Iron Butterfly.",
        legs: [
          { side: "BUY", type: "Put", strike: atm, qty, note: "Long ATM put" },
          { side: "BUY", type: "Call", strike: atm, qty, note: "Long ATM call" },
          { side: "SELL", type: "Put", strike: putWing, qty, note: "Short put wing" },
          { side: "SELL", type: "Call", strike: callWing, qty, note: "Short call wing" },
        ],
      }),
      base({
        id: "SB-LCB",
        sophistication: "Advanced",
        title: "Long call butterfly",
        intent: "Builder long call fly: buy 1 / sell 2 / buy 1. You want a pin at the body, with a cheap IV entry.",
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Use when you want defined-risk long gamma around a level and IV ≤ ${rv30s} + 2 pts.`,
        exit: "Take profit if the body pays; this is not a trend trade.",
        juniorNote: "Strategy Builder → Long Call Butterfly.",
        legs: [
          { side: "BUY", type: "Call", strike: putWing, qty, note: "Long lower call" },
          { side: "SELL", type: "Call", strike: atm, qty: qty * 2, note: "Short 2× ATM" },
          { side: "BUY", type: "Call", strike: callWing, qty, note: "Long higher call" },
        ],
      }),
    );
  }

  if (bias === "short") {
    rows.push(
      base({
        id: "SB-SCB",
        sophistication: "Advanced",
        title: "Short call butterfly (defined short vol)",
        intent: "Builder short call fly — the inverse of a long fly. Credit if IV is rich; defined if wings are on.",
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Monthly IV − ${rv30s} ≥ 5 pts.`,
        exit: "Cover if the wings get tested; never pull the longs.",
        juniorNote: "Strategy Builder → Short Call Butterfly. We keep the long wings.",
        legs: [
          { side: "SELL", type: "Call", strike: putWing, qty, note: "Short lower call" },
          { side: "BUY", type: "Call", strike: atm, qty: qty * 2, note: "Long 2× ATM (body)" },
          { side: "SELL", type: "Call", strike: callWing, qty, note: "Short higher call" },
          { side: "BUY", type: "Call", strike: callFar, qty, note: "Extra far long (cap)" },
        ],
      }),
      base({
        id: "SB-RJL",
        sophistication: "Genius",
        title: "Reverse jade lizard (put credit + short call)",
        intent: "Builder reverse jade: bullish? No — short call plus put credit spread. Bearish/income. We add a long call wing so upside is defined.",
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `IV rich vs ${rv30s}. You can tolerate mild downside; you cannot tolerate a moonshot without the far call.`,
        exit: "Cover if the short call is tested or put spread maxes.",
        juniorNote: "Strategy Builder → Reverse Jade Lizard, with a long call cap (we will not suggest naked short calls).",
        legs: [
          { side: "BUY", type: "Put", strike: putFar, qty, note: "Long lower put" },
          { side: "SELL", type: "Put", strike: putWing, qty, note: "Short put" },
          { side: "SELL", type: "Call", strike: call25, qty, note: "Short OTM call" },
          { side: "BUY", type: "Call", strike: callFar, qty, note: "Long far call (cap)" },
        ],
      }),
    );
  }

  if (bias === "neutral") {
    rows.push(
      base({
        id: "SB-CCAL",
        sophistication: "Advanced",
        title: "Calendar call spread (builder)",
        intent: "Long back ATM call, short front ATM call. Strategy Builder calendar call — harvest front theta, keep back upside.",
        expiryCode: `${wCode} / ${mCode}`,
        expiryLabel: `Front ${wLabel} · Back ${mLabel}`,
        dte: wDte,
        frontExpiryCode: wCode,
        backExpiryCode: mCode,
        frontDte: wDte,
        backDte: mDte,
        gate: `Front call IV rich vs ${rv7s} relative to back vs ${rv30s}.`,
        exit: "Unwind after Friday or if tenors reprice together.",
        juniorNote: "Strategy Builder → Calendar Call Spread.",
        legs: [
          { side: "SELL", type: "Call", strike: atm, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front ${wCode}` },
          { side: "BUY", type: "Call", strike: atm, qty, expiryCode: mCode, dte: mDte, note: `Long back ${mCode}` },
        ],
      }),
      base({
        id: "SB-PCAL",
        sophistication: "Advanced",
        title: "Calendar put spread (builder)",
        intent: "Mirror calendar on puts. Front put theta vs back crash convexity.",
        expiryCode: `${wCode} / ${mCode}`,
        expiryLabel: `Front ${wLabel} · Back ${mLabel}`,
        dte: wDte,
        frontExpiryCode: wCode,
        backExpiryCode: mCode,
        frontDte: wDte,
        backDte: mDte,
        gate: `Front put IV rich vs ${rv7s} vs back vs ${rv30s}.`,
        exit: "Cover front if tested; keep back put if crash thesis remains.",
        juniorNote: "Strategy Builder → Calendar Put Spread.",
        legs: [
          { side: "SELL", type: "Put", strike: atm, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front ${wCode}` },
          { side: "BUY", type: "Put", strike: atm, qty, expiryCode: mCode, dte: mDte, note: `Long back ${mCode}` },
        ],
      }),
    );
  }

  // Longer-dated / 4y-cycle
  if (!qCode && !leapCode) return rows;

  const leapPut = snapL(put15);
  const leapCall = snapL(call15);
  const leapAtm = snapL(atm);

  if (late && (bias === "long" || bias === "neutral")) {
    if (leapOk || qOk) {
      rows.push(
        base({
          id: "CY-LP",
          sophistication: "Genius",
          title: `Cycle LEAPS put (${longDated})`,
          intent:
            `4y lens: ${cycle.regime.replace(/_/g, " ")} — ${daysLine(cycle)} Own far-dated crash convexity instead of selling it. This is the cycle-congruent long-vol expression when you are years after a halvings and off the highs.`,
          expiryCode: longDated,
          expiryLabel: longLabel,
          dte: longDte,
          gate: `Long-dated IV not already screaming vs 30d term RV ${rv30s}. You can hold through noise. Do not sell this put to “yield”.`,
          exit: "Hold as a cycle hedge; take profit if markdown deepens and IV rips; roll if DTE < 60.",
          juniorNote:
            `Listed long expiry ${longDated} (~${longDte}d). Same idea as Strategy Builder long put, on the furthest liquid Deribit date.`,
          legs: [{ side: "BUY", type: "Put", strike: leapPut, qty, note: `Long ${longDated} ~15Δ put` }],
        }),
        base({
          id: "CY-BPS",
          sophistication: "Advanced",
          title: `Cycle bear put spread (${longDated})`,
          intent: "Defined-risk markdown expression: long far put, short a lower put to cut debit. Builder bear put on a quarterly/LEAPS expiry.",
          expiryCode: longDated,
          expiryLabel: longLabel,
          dte: longDte,
          gate: "You want crash convexity but not a full LEAPS debit. Cap is the lower strike.",
          exit: "Hold as a hedge; take profit on a flush.",
          juniorNote: "Strategy Builder → Bear Put Spread, mapped to the long-dated listed expiry.",
          legs: [
            { side: "BUY", type: "Put", strike: snapL(put25), qty, note: `Long ${longDated} put` },
            { side: "SELL", type: "Put", strike: snapL(put10), qty, note: `Short lower ${longDated} put` },
          ],
        }),
      );
    }
    if (leapOk && mCode) {
      rows.push(
        base({
          id: "CY-PDC",
          sophistication: "Genius",
          title: `LEAPS put diagonal (short ${mCode} / long ${leapCode})`,
          intent:
            "The cycle trade: sell near-month put premium, keep LEAPS crash convexity. You are not selling the cycle — you are financing the hedge with front-month theta.",
          expiryCode: `${mCode} / ${leapCode}`,
          expiryLabel: `Front ${mLabel} · Back ${leapLabel}`,
          dte: mDte,
          frontExpiryCode: mCode,
          backExpiryCode: leapCode,
          frontDte: mDte,
          backDte: leapDte,
          gate: `Front monthly put IV rich vs ${rv30s}; LEAPS put not already vertical. If front puts are cheap, skip.`,
          exit: "Roll or cover the monthly before expiry; keep the LEAPS put as the cycle hedge.",
          juniorNote: "Strategy Builder → Diagonal Put, using the furthest listed back month.",
          legs: [
            { side: "SELL", type: "Put", strike: putWing, qty, expiryCode: mCode, dte: mDte, note: `Short monthly ${mCode}` },
            { side: "BUY", type: "Put", strike: leapPut, qty, expiryCode: leapCode, dte: leapDte, note: `Long LEAPS ${leapCode}` },
          ],
        }),
      );
    }
  }

  if (early && (bias === "long" || bias === "neutral") && (leapOk || qOk)) {
    rows.push(
      base({
        id: "CY-LC",
        sophistication: "Genius",
        title: `Cycle LEAPS call (${longDated})`,
        intent: `Post-halving markup analogue (${cycle.daysSinceH}d since H4). Own far-dated upside instead of short-dated lotto tickets.`,
        expiryCode: longDated,
        expiryLabel: longLabel,
        dte: longDte,
        gate: `Long-dated IV ≤ ${rv30s} + 4 pts. This is a multi-month hold.`,
        exit: "Trail as the cycle marks up; do not sell the LEAPS to fund weekly shorts without a plan.",
        juniorNote: "Strategy Builder → Long Call on the furthest liquid expiry.",
        legs: [{ side: "BUY", type: "Call", strike: leapAtm, qty, note: `Long ${longDated} ATM call` }],
      }),
      base({
        id: "CY-BCS",
        sophistication: "Advanced",
        title: `Cycle bull call spread (${longDated})`,
        intent: "Defined-risk markup: long ATM LEAPS call, short a higher LEAPS call.",
        expiryCode: longDated,
        expiryLabel: longLabel,
        dte: longDte,
        gate: "You accept capped upside to cut the debit.",
        exit: "Hold through the cycle window; take profit if the spread maxes.",
        juniorNote: "Strategy Builder → Bull Call Spread on LEAPS/quarterly.",
        legs: [
          { side: "BUY", type: "Call", strike: leapAtm, qty, note: `Long ${longDated} ATM` },
          { side: "SELL", type: "Call", strike: leapCall, qty, note: `Short ${longDated} OTM` },
        ],
      }),
    );
  }

  if (bias === "short" && (leapOk || qOk)) {
    rows.push(
      base({
        id: "CY-NOSHORT",
        sophistication: "Genius",
        paper: late,
        title: late
          ? `Do not sell LEAPS vol (${longDated}) — cycle warning`
          : `Quarterly iron condor (${longDated}) only if IV is rich`,
        intent: late
          ? `Cycle lens says ${cycle.regime.replace(/_/g, " ")}. Selling ${longDated} premium is how books blow up in markdown. This ticket is paper: map the condor, do not send it.`
          : `If you must sell longer-dated vol, use a defined quarterly condor — never naked — and only if IV − term RV is fat.`,
        expiryCode: longDated,
        expiryLabel: longLabel,
        dte: longDte,
        gate: late
          ? "PAPER. Cycle regime argues against short LEAPS vol."
          : `Long-dated IV − 30d term RV ${rv30s} ≥ 8 pts. Still defined wings only.`,
        exit: late ? "N/A live" : "Cover if IV−RV collapses or a wing is tested.",
        hedge: !late,
        juniorNote: late
          ? "The genius trade in late cycle is often *not* selling the far dated condor."
          : "Same iron condor as monthly, on a longer listed expiry.",
        legs: [
          { side: "BUY", type: "Put", strike: snapL(putFar), qty, note: "Long put wing" },
          { side: "SELL", type: "Put", strike: snapL(putWing), qty, note: "Short put" },
          { side: "SELL", type: "Call", strike: snapL(callWing), qty, note: "Short call" },
          { side: "BUY", type: "Call", strike: snapL(callFar), qty, note: "Long call wing" },
        ],
      }),
    );
  }

  return rows;

  function daysLine(c) {
    const bits = [`${c.daysSinceH}d since Apr 2024 halvings`, `~${c.daysToNext}d to ~Apr 2028`];
    if (c.dd != null) bits.push(`${c.dd.toFixed(0)}% off sample/cycle high`);
    return bits.join(" · ") + ".";
  }
}

function volBuildExampleTickets(ctx) {
  const { bias, spot, rv7, rv30, dailyVol, conf, chain } = ctx;
  if (!spot || spot < 1000) return [];

  const wListed = volExpiryFromListed(volPickListedExpiry(chain, { minDte: 3, maxDte: 12 }));
  const mListed = volExpiryFromListed(volPickMonthlyExpiry(chain));
  const bListed = volExpiryFromListed(
    volPickListedExpiry(chain, { minDte: 10, maxDte: 18 }),
  );

  const weekly = wListed?.date || volDeribitFriday(5);
  const monthly = mListed?.date || volDeribitFriday(26);
  const biweekly = bListed?.date || volDeribitFriday(12);
  const wExp = wListed?.exp || null;
  const mExp = mListed?.exp || null;
  const bExp = bListed?.exp || null;

  const step = spot >= 100_000 ? 2000 : 1000;
  const atm = volSnapStrike(wExp || mExp, spot, true) || volRoundStrike(spot, step);
  const wing = step * 2;
  const farWing = step * 4;
  const putWing = volSnapStrike(mExp || wExp, atm - wing);
  const callWing = volSnapStrike(mExp || wExp, atm + wing);
  const putFar = volSnapStrike(mExp || wExp, atm - farWing);
  const callFar = volSnapStrike(mExp || wExp, atm + farWing);
  const put25 = volSnapStrike(wExp || mExp, spot * 0.92);
  const call25 = volSnapStrike(wExp || mExp, spot * 1.08);

  const wCode = wListed?.code || volFmtDeribitExpiry(weekly);
  const mCode = mListed?.code || volFmtDeribitExpiry(monthly);
  const wLabel = wListed?.label || volFmtExpiryLabel(weekly);
  const mLabel = mListed?.label || volFmtExpiryLabel(monthly);
  const wDte = wListed?.dte != null ? wListed.dte : volDte(weekly);
  const mDte = mListed?.dte != null ? mListed.dte : volDte(monthly);

  const qty = conf >= 75 ? 2 : 1;
  const hedgeNote =
    dailyVol != null
      ? `After fill, delta-hedge with BTC-PERPETUAL so net delta ≈ 0. Rough 1σ daily move ≈ ${volFmtPct(dailyVol, 2)} of spot.`
      : "After fill, delta-hedge with BTC-PERPETUAL so net delta ≈ 0.";

  const rv7s = volFmtPct(rv7, 1);
  const rv30s = volFmtPct(rv30, 1);

  const put15 = volSnapStrike(mExp || wExp, spot * 0.88);
  const call15 = volSnapStrike(mExp || wExp, spot * 1.12);
  const put10 = volSnapStrike(mExp || wExp, spot * 0.85);
  const call10 = volSnapStrike(mExp || wExp, spot * 1.15);
  const itmCall = volSnapStrike(wExp || mExp, atm - step);
  const itmPut = volSnapStrike(wExp || mExp, atm + step);
  const bCode = bListed?.code || volFmtDeribitExpiry(biweekly);
  const bLabel = bListed?.label || volFmtExpiryLabel(biweekly);
  const bDte = bListed?.dte != null ? bListed.dte : volDte(biweekly);

  const cycle = volCycleFromSuite(ctx.suite);
  const qListed = volExpiryFromListed(volPickExpiryBand(chain, 85, 170));
  const leapListed = volExpiryFromListed(volPickExpiryBand(chain, 175, 420));
  const qExp = qListed?.exp || null;
  const leapExp = leapListed?.exp || null;
  const qCode = qListed?.code || "";
  const leapCode = leapListed?.code || "";
  const qLabel = qListed?.label || "";
  const leapLabel = leapListed?.label || "";
  const qDte = qListed?.dte != null ? qListed.dte : 0;
  const leapDte = leapListed?.dte != null ? leapListed.dte : 0;
  const pack = {
    bias,
    spot,
    qty,
    atm,
    hedgeNote,
    rv7s,
    rv30s,
    wCode,
    mCode,
    bCode,
    qCode,
    leapCode,
    wLabel,
    mLabel,
    qLabel,
    leapLabel,
    wDte,
    mDte,
    qDte,
    leapDte,
    putWing,
    callWing,
    putFar,
    callFar,
    put25,
    call25,
    put15,
    call15,
    put10,
    call10,
    itmCall,
    itmPut,
    cycle,
    qExp,
    leapExp,
    mExp,
    wExp,
  };
  const finish = (rows) => rows.concat(volBuilderCycleExtras(pack));

  if (bias === "long") {
    return finish([
      {
        id: "A",
        sophistication: "Core",
        title: "Long ATM straddle (buy vol)",
        intent:
          "You think realized moves will be large or options are cheap vs our model. You pay premium up front; you want big spot swings or IV to rise.",
        spot,
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Live weekly ATM mid IV ≤ model 7d RV (${rv7s}) + 2 vol pts. If IV is already much higher, skip — options are expensive.`,
        exit: "Take profit if IV rises ≥ 5–8 pts or you make ~50–100% of debit; cut if you lose ~1–1.5× debit or spot goes dead-quiet for 3 days.",
        hedge: true,
        juniorNote: hedgeNote + " A straddle = long call + long put, same strike/expiry. You are long gamma and vega, short theta (time hurts you).",
        legs: [
          { side: "BUY", type: "Call", strike: atm, qty, note: "ATM call" },
          { side: "BUY", type: "Put", strike: atm, qty, note: "ATM put" },
        ],
      },
      {
        id: "B",
        sophistication: "Core",
        title: "Long 25Δ strangle (cheaper vol / wider wings)",
        intent:
          "Same long-vol view as Trade A, but you buy OTM options so the debit is smaller. Needs a larger move to pay off.",
        spot,
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Same IV gate as Trade A vs ${rv7s}. Prefer when you want cheaper convexity and accept a wider “dead zone”.`,
        exit: "Same as Trade A; also exit if both wings go deep OTM with IV crush.",
        hedge: true,
        juniorNote:
          "Strangle = OTM call + OTM put. More “lottery-like” than a straddle. Still delta-hedge; do not leave large residual delta.",
        legs: [
          { side: "BUY", type: "Call", strike: call25, qty, note: "~OTM call (≈25Δ proxy)" },
          { side: "BUY", type: "Put", strike: put25, qty, note: "~OTM put (≈25Δ proxy)" },
        ],
      },
      {
        id: "C",
        sophistication: "Core",
        title: "Risk-reversal (long put / short call)",
        intent:
          "You want long downside convexity and will fund it by selling an OTM call. Net can be near zero premium. You are still directionally sensitive.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Use when 30d mark ${rv30s} is elevated and put skew looks underpriced vs calls. Check live 25Δ RR before clicking.`,
        exit: "Cut if short call deltas blow out and you cannot hedge; take profit on put after a dump.",
        hedge: true,
        juniorNote:
          "This is NOT pure vol. Short call can lose a lot if BTC moons. Prefer only with delta hedge and a clear max pain.",
        legs: [
          { side: "BUY", type: "Put", strike: put25, qty, note: "Long crash put" },
          { side: "SELL", type: "Call", strike: call25, qty, note: "Short OTM call (finances the put)" },
        ],
      },
      {
        id: "D",
        sophistication: "Advanced",
        title: "Call ratio backspread (1×2 long vol upside)",
        intent:
          "Sell 1 near ATM call and buy 2 further OTM calls. Debit or small credit; profits if BTC rips higher. Sophisticated long-vol / long-skew structure.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Live call skew not already vertical; monthly IV still ≤ ${rv30s} + 3 pts on the long strikes. Avoid if you cannot tolerate a mid-range max pain.`,
        exit: "Take profit on a vertical melt-up; cut if spot pins between strikes into expiry with rising IV on the short.",
        hedge: true,
        juniorNote:
          "You are short 1 call, long 2 higher calls (net +1 OTM call convexity). There is a valley of losses if spot dies near the short strike. Size small until you can draw the payoff from memory.",
        legs: [
          { side: "SELL", type: "Call", strike: atm, qty, note: "Short ATM call (finances longs)" },
          { side: "BUY", type: "Call", strike: call25, qty: qty * 2, note: "Long 2× OTM calls (upside convexity)" },
        ],
      },
      {
        id: "E",
        sophistication: "Advanced",
        title: "Reverse iron condor (buy wings — long vol, defined risk)",
        intent:
          "Buy the OTM put and call, finance partly by selling further OTM wings. Defined max loss, long vol with a capped debit.",
        spot,
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Weekly IV ≤ ${rv7s} + 2 pts on the long strikes. Prefer when you want long vol without paying full strangle debit.`,
        exit: "Take profit if either wing pays; cut at ~1.5× debit if tape goes dead.",
        hedge: true,
        juniorNote:
          "Opposite of a short iron condor: you want a large move. Max loss ≈ net debit. Cleaner risk than naked long strangle if wings are tight.",
        legs: [
          { side: "BUY", type: "Put", strike: put25, qty, note: "Long put" },
          { side: "SELL", type: "Put", strike: putFar, qty, note: "Short further put (reduce debit)" },
          { side: "BUY", type: "Call", strike: call25, qty, note: "Long call" },
          { side: "SELL", type: "Call", strike: callFar, qty, note: "Short further call (reduce debit)" },
        ],
      },
      {
        id: "F",
        sophistication: "Advanced",
        title: "Put diagonal (long back-month put / short front put)",
        intent:
          "Own longer-dated crash convexity and sell a nearer put against it to lower carry. Term-structure + vol expression.",
        spot,
        expiryCode: `${wCode} / ${mCode}`,
        expiryLabel: `Front ${wLabel} · Back ${mLabel}`,
        dte: wDte,
        frontExpiryCode: wCode,
        backExpiryCode: mCode,
        frontDte: wDte,
        backDte: mDte,
        gate: `Front put IV rich vs ${rv7s}; back put not expensive vs ${rv30s}. Skip if front is already cheap.`,
        exit: "Cover front after expiry or if short put is tested; keep/roll long put if crash thesis remains.",
        hedge: true,
        juniorNote:
          "Two expiries: short weekly put, long monthly lower or same put. Manage the short first in a dump.",
        legs: [
          { side: "SELL", type: "Put", strike: putWing, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front put ${wCode}` },
          { side: "BUY", type: "Put", strike: put25, qty, expiryCode: mCode, dte: mDte, note: `Long back put ${mCode}` },
        ],
      },
      {
        id: "G",
        sophistication: "Genius",
        title: "Put ratio backspread (1×2 crash convexity)",
        intent:
          "Sell 1 ATM put to finance 2 further OTM puts. Small debit/credit; you want a crash, not a grind. The “genius” is owning extra crash gamma while the tape is still bid.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Put skew not already vertical; monthly IV ≤ ${rv30s} + 3 pts on the long puts. Skip if you need the market to go up.`,
        exit: "Take profit on a flush; cut if spot pins at the short put into expiry.",
        hedge: true,
        juniorNote:
          "Short 1 ATM put, long 2 lower puts. Valley of pain if BTC dies exactly at the short strike. Size tiny until you can sketch the payoff.",
        legs: [
          { side: "SELL", type: "Put", strike: atm, qty, note: "Short ATM put (finances longs)" },
          { side: "BUY", type: "Put", strike: put15, qty: qty * 2, note: "Long 2× crash puts" },
        ],
      },
      {
        id: "H",
        sophistication: "Genius",
        title: "Strip (2× put + 1× call — crash-biased long vol)",
        intent:
          "A straddle with an extra put. Same cheap-IV thesis as the ATM straddle, but you are willing to be more long downside. Classic when BTC vol is cheap and skew is not yet bid.",
        spot,
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Same cheap-IV gate vs ${rv7s}. Prefer when 25Δ RR is not already screaming puts.`,
        exit: "Same as the ATM straddle; the extra put is the crash kicker — do not strip the hedge.",
        hedge: true,
        juniorNote: "Two ATM puts + one ATM call. You are net short delta unless you hedge the perp. Not a symmetric straddle.",
        legs: [
          { side: "BUY", type: "Put", strike: atm, qty: qty * 2, note: "2× ATM put (crash weight)" },
          { side: "BUY", type: "Call", strike: atm, qty, note: "ATM call" },
        ],
      },
      {
        id: "I",
        sophistication: "Advanced",
        title: "Call Christmas tree (1×2×1 cheap upside convexity)",
        intent:
          "Buy 1 ATM call, sell 2 slightly OTM, buy 1 far OTM. Defined risk, cheap debit, pays on a melt-up that does not pin the short body.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Call wing IV not already vertical; monthly IV ≤ ${rv30s} + 3 pts. Avoid if you expect a slow grind that dies on the short strikes.`,
        exit: "Take profit on a vertical squeeze; cut if spot lodges between ATM and the short cluster.",
        hedge: true,
        juniorNote:
          "1–2–1 call tree. Max pain is a pin at the double-short strike. Draw it before live.",
        legs: [
          { side: "BUY", type: "Call", strike: atm, qty, note: "Long ATM call" },
          { side: "SELL", type: "Call", strike: call25, qty: qty * 2, note: "Short 2× OTM calls" },
          { side: "BUY", type: "Call", strike: callFar, qty, note: "Long far call (caps the shorts)" },
        ],
      },
      {
        id: "J",
        sophistication: "Advanced",
        title: "Skip-strike call butterfly (uneven fly, defined)",
        intent:
          "Long 1 ATM call, short 2 at a nearby wing, long 1 much further. The skipped spacing tilts payoff toward a squeeze without a naked short.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `IV still ≤ ${rv30s} + 3 pts on the longs. Use when you want defined-risk upside more than a vanilla call.`,
        exit: "Take profit if the short body decays or spot rips through; cut if the tape pins the double short.",
        hedge: true,
        juniorNote: "Buy K, sell 2× (K+w), buy (K+far). Spacing is the whole trade. Confirm strikes exist on the book.",
        legs: [
          { side: "BUY", type: "Call", strike: atm, qty, note: "Long ATM" },
          { side: "SELL", type: "Call", strike: callWing, qty: qty * 2, note: "Short 2× near wing" },
          { side: "BUY", type: "Call", strike: call10, qty, note: "Long skipped far call" },
        ],
      },
    ]);
  }

  if (bias === "short") {
    return finish([
      {
        id: "A",
        sophistication: "Core",
        title: "Short iron condor (sell vol, defined risk)",
        intent:
          "You think realized vol stays calm and options are rich vs the model. You collect credit. Max loss is the width of a wing minus credit — never naked short.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Live monthly mid IV − model 30d RV (${rv30s}) ≥ 5 vol pts. No major event in 48h unless wings are wide. Do not sell if IV ≤ model RV.`,
        exit: "Cover if spot gaps > ~2.5× model daily vol, IV−RV collapses below ~2 pts, or loss > ~50% of credit.",
        hedge: true,
        juniorNote:
          hedgeNote +
          " Iron condor = short OTM put + short OTM call, each protected by a further OTM long. You want spot to finish between the short strikes.",
        legs: [
          { side: "BUY", type: "Put", strike: putFar, qty, note: "Long put wing (crash protection)" },
          { side: "SELL", type: "Put", strike: putWing, qty, note: "Short put (collect premium)" },
          { side: "SELL", type: "Call", strike: callWing, qty, note: "Short call (collect premium)" },
          { side: "BUY", type: "Call", strike: callFar, qty, note: "Long call wing (melt-up protection)" },
        ],
      },
      {
        id: "B",
        sophistication: "Core",
        title: "Short iron butterfly (tighter short vol)",
        intent:
          "Same short-vol thesis as Trade A, but short strikes sit at ATM so you earn more credit if spot is glued near the pin. Tighter range — higher chance of being tested.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Same rich-IV gate vs ${rv30s}. Prefer when you expect a quiet pin near spot for ~1 month.`,
        exit: "Same as Trade A; respect wings — never remove long hedges to “make more”.",
        hedge: true,
        juniorNote:
          "Butterfly shorts ATM call+put and buys wings. Delta-hedge; pin risk into expiry is real on BTC.",
        legs: [
          { side: "BUY", type: "Put", strike: putWing, qty, note: "Long lower wing" },
          { side: "SELL", type: "Put", strike: atm, qty, note: "Short ATM put" },
          { side: "SELL", type: "Call", strike: atm, qty, note: "Short ATM call" },
          { side: "BUY", type: "Call", strike: callWing, qty, note: "Long upper wing" },
        ],
      },
      {
        id: "C",
        sophistication: "Core",
        title: "Credit put spread (mild short vol / mild bullish)",
        intent:
          "Simpler 2-leg book if a full condor feels heavy. You sell a put and buy a lower put — defined risk, fewer legs to manage.",
        spot,
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Weekly IV still rich vs 7d mark ${rv7s} by ≥ 5 pts; you can tolerate mild upside drift.`,
        exit: "Buy back at 50% of credit or if spot threatens the short put with rising IV.",
        hedge: true,
        juniorNote:
          "This is not pure vol — short put is short vol and mildly long spot. Keep size small until you are comfortable with the full condor.",
        legs: [
          { side: "SELL", type: "Put", strike: atm, qty, note: "Short ATM put" },
          { side: "BUY", type: "Put", strike: putWing, qty, note: "Long lower put (cap loss)" },
        ],
      },
      {
        id: "D",
        sophistication: "Advanced",
        title: "Defined-risk lizard (put spread + call credit spread)",
        intent:
          "Same idea as a jade lizard, but the short put is protected by a further long put. Defined max loss on both sides — required for live size on this desk.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: `Monthly IV − ${rv30s} ≥ 5 pts. Classic naked-put lizard is not suggested live.`,
        exit: "Cover if either short strike is tested or loss > ~50% of credit.",
        hedge: true,
        juniorNote:
          "Short OTM put + long further put (put credit spread) plus short call + long further call. No naked short put.",
        legs: [
          { side: "BUY", type: "Put", strike: putFar, qty, note: "Long lower put (caps put loss)" },
          { side: "SELL", type: "Put", strike: putWing, qty, note: "Short OTM put" },
          { side: "SELL", type: "Call", strike: callWing, qty, note: "Short call" },
          { side: "BUY", type: "Call", strike: callFar, qty, note: "Long further call (call credit spread)" },
        ],
      },
      {
        id: "E",
        sophistication: "Advanced",
        title: "Broken-wing put butterfly (short vol, skewed risk)",
        intent:
          "Sell a put butterfly but skip/widen one wing so the debit/credit and risk skew toward a preferred side. More surgical than a symmetric fly.",
        spot,
        expiryCode: bCode,
        expiryLabel: bLabel,
        dte: bDte,
        gate: `IV rich vs model on ~2w tenor; you prefer defined risk with a bias that a mild dip is OK but deep crash is hedged.`,
        exit: "Take profit if short body decays; cut if spot drives into the long lower put with expanding IV.",
        hedge: true,
        juniorNote:
          "Long put at higher strike, short 2× middle, long lower put further away (asymmetric). Draw the strikes on paper before live.",
        legs: [
          { side: "BUY", type: "Put", strike: atm, qty, note: "Long higher put" },
          { side: "SELL", type: "Put", strike: putWing, qty: qty * 2, note: "Short 2× mid put" },
          { side: "BUY", type: "Put", strike: putFar, qty, note: "Long lower put (broken wing)" },
        ],
      },
      {
        id: "F",
        sophistication: "Advanced",
        title: "Call credit spread only (mild short vol / mild bearish)",
        intent:
          "Mirror of the put credit spread: sell a call, buy a higher call. Defined risk if you think upside is capped and IV is rich.",
        spot,
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Weekly IV − ${rv7s} ≥ 5 pts; you accept mild downside drift.`,
        exit: "Buy back at 50% credit or if spot squeezes into the short call.",
        hedge: true,
        juniorNote: "Short call spread = short vol + mild short delta. Still not a naked call.",
        legs: [
          { side: "SELL", type: "Call", strike: atm, qty, note: "Short ATM call" },
          { side: "BUY", type: "Call", strike: callWing, qty, note: "Long higher call (cap loss)" },
        ],
      },
      {
        id: "G",
        sophistication: "Core",
        title: "Weekly iron condor (faster theta, defined)",
        intent:
          "Same defined-risk short vol as the monthly condor, but on the front Friday so theta is faster and the test comes sooner.",
        spot,
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Weekly IV − ${rv7s} ≥ 5 pts. No event inside the week. Do not sell the weekly if IV ≤ model.`,
        exit: "Cover at 50% of credit, or if spot threatens a short wing, or if IV−RV collapses.",
        hedge: true,
        juniorNote: "Shorter DTE = more gamma against you. Flatten into Friday; do not “see what happens” on expiry.",
        legs: [
          { side: "BUY", type: "Put", strike: putFar, qty, note: "Long put wing" },
          { side: "SELL", type: "Put", strike: putWing, qty, note: "Short put" },
          { side: "SELL", type: "Call", strike: callWing, qty, note: "Short call" },
          { side: "BUY", type: "Call", strike: callFar, qty, note: "Long call wing" },
        ],
      },
      {
        id: "H",
        sophistication: "Genius",
        title: "Call broken-wing butterfly (short vol, squeeze-skewed)",
        intent:
          "Sell a call fly but skip/widen the upper wing so you collect more if BTC drifts up a bit, while a moonshot is still defined. Surgical short-vol with a bullish tilt.",
        spot,
        expiryCode: bCode,
        expiryLabel: bLabel,
        dte: bDte,
        gate: `IV rich vs model on ~2w tenor. You can tolerate a mild squeeze; you cannot tolerate a melt-up through the far call.`,
        exit: "Take profit if the body decays; cut if spot drives into the long far call with expanding IV.",
        hedge: true,
        juniorNote:
          "Long ATM call, short 2× mid call, long a further call that is not equally spaced. Confirm the skip on the live grid.",
        legs: [
          { side: "BUY", type: "Call", strike: atm, qty, note: "Long lower call" },
          { side: "SELL", type: "Call", strike: callWing, qty: qty * 2, note: "Short 2× mid call" },
          { side: "BUY", type: "Call", strike: call10, qty, note: "Long far call (broken wing)" },
        ],
      },
      {
        id: "I",
        sophistication: "Advanced",
        title: "Call ladder (short vol + mild bearish, defined-ish)",
        intent:
          "Buy a lower call, sell a middle, sell a higher. You want IV rich and upside capped. The far short is the risk — we cap it with the long below only on the first step; treat the extra short as needing the far long from the tree if you size up.",
        spot,
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: `Weekly IV − ${rv7s} ≥ 5 pts. Prefer replacing the naked-feeling far short with a long call10 if size is not tiny.`,
        exit: "Buy back if spot squeezes into the shorts; take 50% of credit when available.",
        hedge: true,
        juniorNote:
          "This ladder still has open-ended upside above the highest short unless you add a long wing. We add call10 as the cap — check it is listed.",
        legs: [
          { side: "BUY", type: "Call", strike: itmCall, qty, note: "Long lower call" },
          { side: "SELL", type: "Call", strike: atm, qty, note: "Short ATM call" },
          { side: "SELL", type: "Call", strike: call25, qty, note: "Short OTM call" },
          { side: "BUY", type: "Call", strike: call10, qty, note: "Long far call (cap)" },
        ],
      },
    ]);
  }

  // neutral / calendar / relative value
  if (bias === "neutral") {
    return finish([
      {
        id: "A",
        sophistication: "Core",
        title: "Long calendar: short weekly / long monthly ATM straddle",
        intent:
          "Not a bet that BTC goes up or down. You sell this week’s ATM straddle (fast theta) and buy next month’s ATM straddle (keeps time value after Friday). You want a quiet pin into the weekly and the monthly still worth something. A big trend is the loss case — both straddles go equally ITM and you paid extra for the back month.",
        spot,
        expiryCode: `${wCode} / ${mCode}`,
        expiryLabel: `Front ${wLabel} · Back ${mLabel}`,
        dte: wDte,
        frontExpiryCode: wCode,
        backExpiryCode: mCode,
        frontDte: wDte,
        backDte: mDte,
        gate: `Front IV − ${rv7s} should be clearly richer than back IV − ${rv30s} (about ≥ 3 vol pts after spreads). If front is cheap, reverse the calendar.`,
        exit: "Unwind after front expiry or if both tenors reprice to within ~1 vol pt of model marks.",
        hedge: true,
        juniorNote:
          "Win = spot near the strike when the weekly expires (front ~worthless) while the monthly still has weeks of premium. Lose = a large trend, or the monthly IV crushes. The chart is P&amp;L at Friday, with the monthly still marked — it is not “both expire today.” If front IV is not richer than back, skip or reverse.",
        legs: [
          { side: "SELL", type: "Call", strike: atm, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front ${wCode} call` },
          { side: "SELL", type: "Put", strike: atm, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front ${wCode} put` },
          { side: "BUY", type: "Call", strike: atm, qty, expiryCode: mCode, dte: mDte, note: `Long back ${mCode} call` },
          { side: "BUY", type: "Put", strike: atm, qty, expiryCode: mCode, dte: mDte, note: `Long back ${mCode} put` },
        ],
      },
      {
        id: "B",
        sophistication: "Core",
        title: "1-lot observation straddle (learn the book)",
        intent:
          "No strong edge — trade is for process practice: watch IV−RV, delta hedge, and journal P&L. Tiny size only.",
        spot,
        expiryCode: wCode,
        expiryLabel: wLabel,
        dte: wDte,
        gate: "Only if desk allows a micro “training” risk budget; not for P&L targets.",
        exit: "Close before expiry weekend or after 3–5 sessions of journaling.",
        hedge: true,
        juniorNote: "Goal is skill, not edge. If you skip journaling, skip the trade.",
        legs: [
          { side: "BUY", type: "Call", strike: atm, qty: 1, note: "ATM call" },
          { side: "BUY", type: "Put", strike: atm, qty: 1, note: "ATM put" },
        ],
      },
      {
        id: "C",
        sophistication: "Advanced",
        title: "Double diagonal (short weekly strangle / long monthly wider)",
        intent:
          "Short near-term OTM vol, long further-dated wider OTM vol. Harvest front theta while keeping longer convexity. Classic relative-value structure.",
        spot,
        expiryCode: `${wCode} / ${mCode}`,
        expiryLabel: `Front ${wLabel} · Back ${mLabel}`,
        dte: wDte,
        frontExpiryCode: wCode,
        backExpiryCode: mCode,
        frontDte: wDte,
        backDte: mDte,
        gate: `Front strangle IV rich vs ${rv7s}; back wings not rich vs ${rv30s}. Minimum ~3 vol pts relative edge after spreads.`,
        exit: "Cover front if tested; roll or close after front expiry; do not leave short front naked past expiry.",
        hedge: true,
        juniorNote:
          "Four legs, two expiries. Map each instrument before clicking. Short weekly put/call, long monthly further OTM put/call.",
        legs: [
          { side: "SELL", type: "Put", strike: put25, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front put ${wCode}` },
          { side: "SELL", type: "Call", strike: call25, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front call ${wCode}` },
          { side: "BUY", type: "Put", strike: put15, qty, expiryCode: mCode, dte: mDte, note: `Long back put ${mCode}` },
          { side: "BUY", type: "Call", strike: call15, qty, expiryCode: mCode, dte: mDte, note: `Long back call ${mCode}` },
        ],
      },
      {
        id: "D",
        sophistication: "Advanced",
        title: "Delta-hedged risk-reversal (pure skew RV)",
        intent:
          "Long put / short call with active perp hedge so residual delta stays near zero. Express skew/vol-of-vol without a big directional bet.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: "Live 25Δ risk-reversal looks cheap on puts vs calls; you can hedge delta intraday.",
        exit: "Flatten if RR reverts or hedge costs eat the edge; cut if short call gamma spikes.",
        hedge: true,
        juniorNote:
          "Without the hedge this is directional. With the hedge you still have vega/skew risk. Advanced ops — practice on paper first.",
        legs: [
          { side: "BUY", type: "Put", strike: put25, qty, note: "Long put (skew)" },
          { side: "SELL", type: "Call", strike: call25, qty, note: "Short call (finances / RR)" },
        ],
      },
      {
        id: "E",
        sophistication: "Advanced",
        title: "Seagull (put spread financed by short call)",
        intent:
          "Long put spread for crash protection, financed by a short OTM call. Often near-zero debit. Hybrid hedge / mild short upside vol.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: "You want defined crash cover and can accept capped upside; short call IV not too cheap.",
        exit: "Let expire if quiet; manage short call on a squeeze; take profit on put spread after a dump.",
        hedge: true,
        juniorNote:
          "Standard seagull: buy a put, sell a further OTM put (put spread), sell an OTM call to finance. Crash is defined; upside is capped by the short call.",
        legs: [
          { side: "BUY", type: "Put", strike: putWing, qty, note: "Long put" },
          { side: "SELL", type: "Put", strike: putFar, qty, note: "Short lower put (defines put spread)" },
          { side: "SELL", type: "Call", strike: call25, qty, note: "Short OTM call (finances)" },
        ],
      },
      {
        id: "F",
        sophistication: "Advanced",
        title: "Box / conversion watch (structure arb — paper)",
        paper: true,
        intent:
          "Educational only: synthetic long (long call + short put) vs short underlying should pin near forward. Live box arb on Deribit is crowded and fee-sensitive — paper the parity check.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: "Do not run live for edge without a formal arb desk process. This ticket is for learning put-call parity.",
        exit: "N/A live",
        hedge: false,
        juniorNote:
          "Long call + short put ≈ long forward. Compare to BTC-PERPETUAL fair. If you do not know parity cold, do not trade boxes.",
        legs: [
          { side: "BUY", type: "Call", strike: atm, qty: 1, note: "Long ATM call" },
          { side: "SELL", type: "Put", strike: atm, qty: 1, note: "Short ATM put" },
        ],
      },
      {
        id: "G",
        sophistication: "Genius",
        title: "Skew calendar (short front RR / long back RR)",
        intent:
          "The desk trade when the weekly crash premium is rich and the monthly has not caught up: sell this week’s 25Δ risk-reversal, buy next month’s. You harvest front skew/theta and keep back-month crash convexity. Not a direction bet if you delta-hedge.",
        spot,
        expiryCode: `${wCode} / ${mCode}`,
        expiryLabel: `Front ${wLabel} · Back ${mLabel}`,
        dte: wDte,
        frontExpiryCode: wCode,
        backExpiryCode: mCode,
        frontDte: wDte,
        backDte: mDte,
        gate: `Front 25Δ RR (put−call) richer than back by ≳ 3 vol pts after spreads. If weekly skew is cheap, skip — you would be selling the wrong tenor.`,
        exit: "Cover the front RR before Friday if tested; hold/roll the back RR if skew term structure normalizes.",
        hedge: true,
        juniorNote:
          "Front: short put / long call (you sold the rich weekly crash). Back: long put / short call. Four names, two expiries. Hedge residual delta with BTC-PERPETUAL. This is the closest thing on this list to a “genius” relative-value trade.",
        legs: [
          { side: "SELL", type: "Put", strike: put25, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front put ${wCode} (sell rich weekly skew)` },
          { side: "BUY", type: "Call", strike: call25, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Long front call ${wCode}` },
          { side: "BUY", type: "Put", strike: put25, qty, expiryCode: mCode, dte: mDte, note: `Long back put ${mCode} (keep crash)` },
          { side: "SELL", type: "Call", strike: call25, qty, expiryCode: mCode, dte: mDte, note: `Short back call ${mCode}` },
        ],
      },
      {
        id: "H",
        sophistication: "Genius",
        title: "25Δ double calendar (strangle calendar, same strikes)",
        intent:
          "Short this week’s OTM strangle, long next month’s same strikes. Like the ATM calendar but you need a larger move to hurt you, and you collect OTM theta. Pin can be wider.",
        spot,
        expiryCode: `${wCode} / ${mCode}`,
        expiryLabel: `Front ${wLabel} · Back ${mLabel}`,
        dte: wDte,
        frontExpiryCode: wCode,
        backExpiryCode: mCode,
        frontDte: wDte,
        backDte: mDte,
        gate: `Front 25Δ IV rich vs ${rv7s} relative to back vs ${rv30s} (≥ 3 vol pts). If front is cheap, reverse or skip.`,
        exit: "Unwind after front expiry or if both tenors reprice near the model.",
        hedge: true,
        juniorNote:
          "Same idea as the ATM calendar, OTM. Chart should peak if spot stays between the strikes through Friday, with the monthly still live.",
        legs: [
          { side: "SELL", type: "Put", strike: put25, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front put ${wCode}` },
          { side: "SELL", type: "Call", strike: call25, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front call ${wCode}` },
          { side: "BUY", type: "Put", strike: put25, qty, expiryCode: mCode, dte: mDte, note: `Long back put ${mCode}` },
          { side: "BUY", type: "Call", strike: call25, qty, expiryCode: mCode, dte: mDte, note: `Long back call ${mCode}` },
        ],
      },
      {
        id: "I",
        sophistication: "Genius",
        title: "Zebra (RR + long ATM call — crash + squeeze)",
        intent:
          "Long 25Δ put, short 25Δ call, long ATM call. You own crash convexity and a squeeze kicker, financed by the short OTM call. Near-zero debit if skew is well behaved. The clever bit is not dying on a grind-up through the short call without the ATM long.",
        spot,
        expiryCode: mCode,
        expiryLabel: mLabel,
        dte: mDte,
        gate: "25Δ RR not already extreme; you can hedge delta. Skip if the short call is the only cheap option on the board.",
        exit: "Flatten if the short call gamma explodes and the ATM long is not enough; take profit after a dump or a squeeze.",
        hedge: true,
        juniorNote:
          "Three legs, same expiry. Still directional without the perp hedge. Not a free lunch — map the three strikes first.",
        legs: [
          { side: "BUY", type: "Put", strike: put25, qty, note: "Long crash put" },
          { side: "SELL", type: "Call", strike: call25, qty, note: "Short OTM call (finances)" },
          { side: "BUY", type: "Call", strike: atm, qty, note: "Long ATM call (squeeze kicker)" },
        ],
      },
      {
        id: "J",
        sophistication: "Advanced",
        title: "Poor man’s covered call (long back ATM call / short front OTM call)",
        intent:
          "Own monthly upside, sell this week’s OTM call against it to cheapen carry. Classic when front call IV is rich vs back.",
        spot,
        expiryCode: `${wCode} / ${mCode}`,
        expiryLabel: `Front ${wLabel} · Back ${mLabel}`,
        dte: wDte,
        frontExpiryCode: wCode,
        backExpiryCode: mCode,
        frontDte: wDte,
        backDte: mDte,
        gate: `Front call IV rich vs ${rv7s}; back call not expensive vs ${rv30s}. Skip if weekly calls are already cheap.`,
        exit: "Let the weekly expire if OTM; roll or close if it goes ITM. Keep the monthly if the upside thesis remains.",
        hedge: true,
        juniorNote: "Short weekly call, long monthly ATM call. If BTC rips through the short, you still have the back call — manage the short first.",
        legs: [
          { side: "SELL", type: "Call", strike: call25, qty, expiryCode: wCode, dte: wDte, useFrontIv: true, note: `Short front call ${wCode}` },
          { side: "BUY", type: "Call", strike: atm, qty, expiryCode: mCode, dte: mDte, note: `Long back ATM call ${mCode}` },
        ],
      },
    ]);
  }

  // no-trade / paper
  return finish([
    {
      id: "A",
      sophistication: "Core",
      title: "Paper ATM straddle (no live risk)",
      paper: true,
      intent:
        "Model confidence is too low for live options risk. Simulate Trade A on paper: track mid IV vs model RV daily without sending orders.",
      spot,
      expiryCode: wCode,
      expiryLabel: wLabel,
      dte: wDte,
      gate: "Do not lift to live until confidence and QLIKE leader are clean.",
      exit: "N/A live",
      hedge: false,
      juniorNote:
        "Write down each day: DVOL, ATM IV, model 7d RV, and theoretical P&L. That habit matters more than any structure right now.",
      legs: [
        { side: "BUY", type: "Call", strike: atm, qty: 1, note: "Paper call" },
        { side: "BUY", type: "Put", strike: atm, qty: 1, note: "Paper put" },
      ],
    },
    {
      id: "B",
      sophistication: "Core",
      title: "Paper iron condor (process drill)",
      paper: true,
      intent: "Practice reading a 4-leg credit structure and emergency flatten logic without capital at risk.",
      spot,
      expiryCode: mCode,
      expiryLabel: mLabel,
      dte: mDte,
      gate: "Paper only until suite confidence recovers.",
      exit: "N/A live",
      hedge: false,
      juniorNote: "Each day: mark theo max loss, distance to short strikes, and whether emergency buttons would fire.",
      legs: [
        { side: "BUY", type: "Put", strike: putFar, qty: 1, note: "Long put wing" },
        { side: "SELL", type: "Put", strike: putWing, qty: 1, note: "Short put" },
        { side: "SELL", type: "Call", strike: callWing, qty: 1, note: "Short call" },
        { side: "BUY", type: "Call", strike: callFar, qty: 1, note: "Long call wing" },
      ],
    },
  ]);
}

/**
 * Structured Deribit trade plan from suite marks (rule-based, educational).
 * Model product = annualized RV forecast path. Live trades snap to listed Deribit
 * instruments and prefer live ATM IV − model term RV as the edge, not AIC.
 */
function volMarkTermRv(mark, s) {
  const path = mark?.forecastAnn || [];
  const term = mark?.forecastTermAnn || [];
  const rv1 = path[0] != null ? Number(path[0]) : s.forecast1d != null ? Number(s.forecast1d) : null;
  const day7 = path[6] != null ? Number(path[6]) : s.forecast7d != null ? Number(s.forecast7d) : null;
  const day30 =
    path[29] != null ? Number(path[29]) : s.forecast30d != null ? Number(s.forecast30d) : null;
  const term7 =
    term[6] != null
      ? Number(term[6])
      : s.forecastTerm7d != null
        ? Number(s.forecastTerm7d)
        : volTermFromPath(path, 7);
  const term30 =
    term[29] != null
      ? Number(term[29])
      : s.forecastTerm30d != null
        ? Number(s.forecastTerm30d)
        : volTermFromPath(path, 30);
  return { rv1, day7, day30, term7: term7 ?? day7, term30: term30 ?? day30 };
}

function volDeriveTradeBias({
  usable,
  crossOnly,
  conf,
  cur,
  unc,
  regime,
  liveGap7,
  liveGap30,
  hasLiveIv,
}) {
  if (!usable && !crossOnly) {
    return { bias: "none", reason: "model not usable" };
  }
  if (conf < 55) {
    return { bias: "none", reason: "confidence < 55%" };
  }
  if (hasLiveIv && (liveGap7 != null || liveGap30 != null)) {
    const gap = liveGap30 != null ? liveGap30 : liveGap7;
    if (gap >= 0.05) return { bias: "short", reason: "live IV − term RV ≥ 5 pts" };
    if (gap <= -0.02) return { bias: "long", reason: "live IV − term RV ≤ −2 pts (options cheap vs model)" };
    return { bias: "neutral", reason: "live IV near model term RV" };
  }
  const reg = String(regime || "").toLowerCase();
  if (reg.includes("elevat") || (cur != null && unc != null && cur > unc * 1.2)) {
    return { bias: "long", reason: "regime fallback: cond. vol elevated vs long-run (no live IV)" };
  }
  if (reg.includes("subdu") || (cur != null && unc != null && cur < unc * 0.85)) {
    return { bias: "short", reason: "regime fallback: cond. vol subdued vs long-run (no live IV)" };
  }
  return { bias: "neutral", reason: "regime fallback: near long-run (no live IV)" };
}

function volModelProductHtml({
  mark,
  rv1,
  day7,
  day30,
  term7,
  term30,
  liveIv7,
  liveIv30,
  liveGap7,
  liveGap30,
  chain,
  wExp,
  mExp,
}) {
  const wCode = wExp ? volExpiryCodeFromMs(wExp.expirationTimestamp) : "—";
  const mCode = mExp ? volExpiryCodeFromMs(mExp.expirationTimestamp) : "—";
  const nExp = chain?.expirations?.length || 0;
  const nInst = chain?.quotesByInstrument
    ? Object.keys(chain.quotesByInstrument).length
    : 0;
  return (
    `<div class="vol-product" data-help-key="vol-model-product">` +
    `<h3 class="vol-plan-h">What model selection produces</h3>` +
    `<p class="vol-plan-why">Checking models does <strong>not</strong> pick a trade. It estimates a <strong>conditional volatility path</strong> on BTC log returns (√365 annualized). ` +
    `The QLIKE leader (else AIC) is the <strong>mark model</strong> used as an RV forecast. Suggested Deribit tickets are a separate mapping: term RV vs live IV, then structures on listed contracts.</p>` +
    `<ul class="vol-plan-list">` +
    `<li><strong>Input:</strong> daily BTC log returns (estimation range + error distribution you selected).</li>` +
    `<li><strong>Output (mark = ${volEscape(mark.name)}):</strong> ` +
    `day-ahead vol 1d ${volFmtPct(rv1, 1)} · day-7 ${volFmtPct(day7, 1)} · day-30 ${volFmtPct(day30, 1)}. ` +
    `Those are E[σ] for <em>that future day</em>, not an option’s average vol.</li>` +
    `<li><strong>Term RV (used vs options):</strong> 7d ${volFmtPct(term7, 1)} · 30d ${volFmtPct(term30, 1)} = ` +
    `√(mean of daily variances over the horizon) × √365. Compare this to Deribit ATM IV for ~that DTE.</li>` +
    `<li><strong>Live book:</strong> ${
      nInst
        ? `${nInst} BTC option instruments · ${nExp} expiries · weekly ${volEscape(wCode)} · monthly ${volEscape(mCode)}`
        : "not loaded — tickets fall back to synthesized Friday names (higher error risk)"
    }</li>` +
    `<li><strong>Live ATM IV vs term RV:</strong> ${
      liveIv7 != null || liveIv30 != null
        ? `7d IV ${volFmtPct(liveIv7, 1)} − RV ${volFmtPct(term7, 1)} = <strong>${volFmtPct(liveGap7, 1)}</strong>` +
          ` · 30d IV ${volFmtPct(liveIv30, 1)} − RV ${volFmtPct(term30, 1)} = <strong>${volFmtPct(liveGap30, 1)}</strong>`
        : "unavailable"
    }</li>` +
    `</ul></div>`
  );
}

function volForecastSensitivityHtml(ctx) {
  const {
    usable,
    crossOnly,
    conf,
    cur,
    unc,
    regime,
    term7,
    term30,
    liveIv7,
    liveIv30,
    hasLiveIv,
    spot,
    chain,
    dailyVol,
    mark,
  } = ctx;
  const shocks = [-0.1, -0.05, 0, 0.05, 0.1];
  const rows = shocks
    .map((d) => {
      const t7 = term7 != null ? term7 + d : null;
      const t30 = term30 != null ? term30 + d : null;
      const c = cur != null ? cur + d : null;
      const gap7 = liveIv7 != null && t7 != null ? liveIv7 - t7 : null;
      const gap30 = liveIv30 != null && t30 != null ? liveIv30 - t30 : null;
      const der = volDeriveTradeBias({
        usable,
        crossOnly,
        conf,
        cur: c,
        unc,
        regime,
        liveGap7: gap7,
        liveGap30: gap30,
        hasLiveIv,
      });
      const label =
        d === 0 ? "Base" : `${d > 0 ? "+" : "−"}${Math.round(Math.abs(d) * 100)} vol pts`;
      const flip = d !== 0 && der.bias !== volDeriveTradeBias({
        usable,
        crossOnly,
        conf,
        cur,
        unc,
        regime,
        liveGap7: liveIv7 != null && term7 != null ? liveIv7 - term7 : null,
        liveGap30: liveIv30 != null && term30 != null ? liveIv30 - term30 : null,
        hasLiveIv,
      }).bias;
      return `<tr class="${d === 0 ? "vol-summary-row--best" : flip ? "vol-sens-flip" : ""}">
        <td>${label}${flip ? " · <strong>stance flips</strong>" : ""}</td>
        <td class="mono">${volFmtPct(t7, 1)}</td>
        <td class="mono">${volFmtPct(t30, 1)}</td>
        <td class="mono">${volFmtPct(gap7, 1)} / ${volFmtPct(gap30, 1)}</td>
        <td>${volEscape(der.bias)}</td>
      </tr>`;
    })
    .join("");

  return (
    `<h3 class="vol-plan-h" data-help-key="vol-plan-sensitivity">How forecast error changes the book</h3>` +
    `<p class="vol-plan-why">If the mark model’s term RV is off by 5–10 vol points, the IV−RV gap (and sometimes the long/short/neutral stance) changes. ` +
    `OOS RMSE on this suite is the right scale for “how wrong could we be.” A flip means <strong>do not size as if the base ticket is robust</strong>.</p>` +
    `<div class="vol-summary-wrap">` +
    `<table class="vol-summary-table vol-sens-table">` +
    `<thead><tr>` +
    `<th>RV shock</th><th>Term 7d</th><th>Term 30d</th><th>IV−RV 7d / 30d</th><th>Stance</th>` +
    `</tr></thead><tbody>${rows}</tbody></table></div>` +
    `<p class="vol-plan-why">Mark model: ${volEscape(mark?.name || "—")}. ` +
    `Shocks are added to term RV (and cond. vol for regime fallback). Live IV is held fixed.</p>`
  );
}

function volBuildDeribitTradePlan(suite, chain = null) {
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
      html: `<p class="vol-plan-empty">No models finished successfully — we cannot draft a Deribit plan. Fix estimation (install <code>arch</code> if needed) and re-run.</p>`,
    };
  }

  const verdict = volBuildVerdict(volRowAsDetail(mark), suite);
  const { rv1, day7, day30, term7, term30 } = volMarkTermRv(mark, s);
  const rv7 = term7;
  const rv30 = term30;
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
  const indexPx = chain?.indexPrice != null ? Number(chain.indexPrice) : null;
  const spot = indexPx > 0 ? indexPx : volSuiteSpot(suite);
  const dailyVol =
    cur != null && Number.isFinite(cur) ? cur / Math.sqrt(365) : null;

  const wExp = volPickListedExpiry(chain, { minDte: 3, maxDte: 12 });
  const mExp = volPickMonthlyExpiry(chain);
  const qExpPlan = volPickExpiryBand(chain, 85, 170);
  const leapExpPlan = volPickExpiryBand(chain, 175, 420);
  const cycleLens = volCycleFromSuite(suite);
  const liveW = wExp && spot ? volAtmIvFromExp(wExp, spot) : null;
  const liveM = mExp && spot ? volAtmIvFromExp(mExp, spot) : null;
  const liveIv7 = liveW?.iv ?? null;
  const liveIv30 = liveM?.iv ?? null;
  const liveGap7 =
    liveIv7 != null && rv7 != null ? liveIv7 - rv7 : null;
  const liveGap30 =
    liveIv30 != null && rv30 != null ? liveIv30 - rv30 : null;
  const hasLiveIv = liveIv7 != null || liveIv30 != null;

  let slope = "flat";
  if (rv7 != null && rv30 != null) {
    const d = rv30 - rv7;
    if (d > 0.03) slope = "upward (30d mark &gt; 7d)";
    else if (d < -0.03) slope = "downward (30d mark &lt; 7d)";
  }

  let pathBias = "stable";
  if (rv1 != null && rv30 != null) {
    if (rv30 > rv1 * 1.08) pathBias = "model sees higher vol further out";
    else if (rv30 < rv1 * 0.92) pathBias = "model sees vol cooling over the month";
  }

  let regime = s.regime || "unknown";
  if (!s.regime && cur != null && unc != null && unc > 0) {
    if (cur > unc * 1.15) regime = "elevated vs long-run";
    else if (cur < unc * 0.85) regime = "subdued vs long-run";
    else regime = "near long-run";
  }

  const derived = volDeriveTradeBias({
    usable,
    crossOnly,
    conf,
    cur,
    unc,
    regime,
    liveGap7,
    liveGap30,
    hasLiveIv,
  });
  let bias = derived.bias;
  let stanceShort;
  let stancePlain;
  let whyJunior;
  let entryGate;
  let invalidation;
  let greeksPlain;

  if (bias === "none" && !usable && !crossOnly) {
    stanceShort = "No live trade";
    stancePlain =
      "Do not open a new Deribit options position from this run. The model is not good enough to mark physical vol.";
    whyJunior =
      "Desk score is too low or the out-of-sample backtest is missing. If you trade options against a bad RV number, you are guessing — juniors get fired for that, not for sitting flat.";
    entryGate = "N/A until the suite has a usable QLIKE leader and higher confidence.";
    invalidation = "N/A";
    greeksPlain = "N/A — stay flat.";
  } else if (bias === "none") {
    stanceShort = "Paper only — no new live risk";
    stancePlain =
      "Treat this as a watchlist. You may paper-trade one micro structure, but do not send live size.";
    whyJunior = `Confidence is only ${conf}%. After fees, bid/ask, and BTC jump risk, there is not enough edge to justify real capital.`;
    entryGate = "Live trading only if confidence later reaches ~70%+ with a stable QLIKE leader.";
    invalidation = "Any live fill at this confidence breaks process — close and review.";
    greeksPlain = "If papering: practice keeping delta near zero with the perpetual.";
  } else if (bias === "long") {
    stanceShort = hasLiveIv
      ? "Long volatility (buy options) — live IV is cheap vs model term RV"
      : "Long volatility (buy options premium) — regime fallback, live IV missing";
    stancePlain =
      "Prefer owning defined-risk long-vol structures so you benefit if realized vol stays high or IV re-rates up. Do not sell naked premium.";
    whyJunior =
      `Driver: ${volEscape(derived.reason)}. Cond. vol ${volFmtPct(cur, 1)} vs long-run ${volFmtPct(unc, 1)}. ` +
      `Term RV (option mark): 7d ${volFmtPct(rv7, 1)} · 30d ${volFmtPct(rv30, 1)}` +
      (hasLiveIv
        ? ` · live ATM IV 7d ${volFmtPct(liveIv7, 1)} (gap ${volFmtPct(liveGap7, 1)}) · 30d ${volFmtPct(liveIv30, 1)} (gap ${volFmtPct(liveGap30, 1)}).`
        : ".") +
      ` Path: ${pathBias}. Term slope: ${slope}.`;
    entryGate =
      `Only buy if live ATM IV ≤ term RV + 2 pts (weekly vs ${volFmtPct(rv7, 1)}, monthly vs ${volFmtPct(rv30, 1)}). ` +
      `If IV is already ≥ model + 8–10 pts, options are expensive — stand aside.`;
    invalidation =
      "Exit longs if: (1) IV falls back to the model while spot is quiet for 3+ days, (2) you lose ~1–1.5× the debit, (3) a major event is &lt;24h away and you are not paid for it.";
    greeksPlain =
      "You want ≈0 delta (±5%), positive vega, positive gamma, negative theta. Hedge delta with BTC-PERPETUAL at least once per day or on ~1σ spot moves.";
  } else if (bias === "short") {
    stanceShort = hasLiveIv
      ? "Short volatility (sell premium with wings) — live IV rich vs model term RV"
      : "Short volatility (sell premium with wings) — regime fallback, live IV missing";
    stancePlain =
      "Selling options can work when the market prices high IV vs the model — only with defined-risk structures. Never naked short straddles on BTC.";
    whyJunior =
      `Driver: ${volEscape(derived.reason)}. Cond. vol ${volFmtPct(cur, 1)} vs long-run ${volFmtPct(unc, 1)}. ` +
      `Term RV 7d ${volFmtPct(rv7, 1)} · 30d ${volFmtPct(rv30, 1)}` +
      (hasLiveIv
        ? ` · live ATM IV gap 7d ${volFmtPct(liveGap7, 1)} · 30d ${volFmtPct(liveGap30, 1)}.`
        : ".") +
      ` Path: ${pathBias}. Term slope: ${slope}.`;
    entryGate =
      `Sell only if live mid IV − model term RV ≥ 5 vol pts (weekly vs ${volFmtPct(rv7, 1)}, monthly vs ${volFmtPct(rv30, 1)}). ` +
      `Skip if IV ≤ model, or a big event is inside 48h without extra wing width.`;
    invalidation =
      "Cover if: (1) 1-day spot move &gt; ~2.5× model daily vol, (2) IV−RV shrinks below ~2 pts, (3) loss &gt; ~50% of credit, (4) cascade/funding stress.";
    greeksPlain =
      "Target ≈0 delta, negative vega, negative gamma, positive theta. Hard max loss = wing width − credit. Hedge delta on large moves; never remove long wings.";
  } else {
    stanceShort = "Neutral / relative-value (calendar) — no strong long/short vol call";
    stancePlain =
      "Do not force a big long-vol or short-vol bet. If you trade, look for term-structure mispricing (front week vs next month) versus the 7d and 30d model term RV.";
    whyJunior =
      `Driver: ${volEscape(derived.reason)}. Cond. vol ${volFmtPct(cur, 1)} vs long-run ${volFmtPct(unc, 1)}. ` +
      `Path: ${pathBias}; slope: ${slope}.`;
    entryGate =
      `Compare live front IV vs ${volFmtPct(rv7, 1)} and back IV vs ${volFmtPct(rv30, 1)}. ` +
      `Prefer short the rich tenor / long the cheap tenor if the gap is ≥ ~3 vol pts after spreads.`;
    invalidation =
      "Flatten if both tenors reprice near the model (±1 vol pt) or you hit your pre-set calendar loss cap.";
    greeksPlain =
      "Keep net delta flat. Net vega depends on which leg is larger — check the risk panel on Deribit before clicking.";
  }

  const notionalHint =
    conf >= 75
      ? "risk only ~0.25–0.5% of options book NAV (max loss), not notional"
      : "risk only ~0.1–0.25% of NAV (max loss)";

  const enrichCtx = {
    spot,
    rv7,
    rv30,
    bias,
    conf,
    chain,
    liveIv7,
    liveIv30,
    suite,
  };
  const showAdvanced = volEl("vol-show-advanced") ? !!volEl("vol-show-advanced").checked : true;
  let rawTickets = volBuildExampleTickets({
    ...enrichCtx,
    dailyVol,
    showAdvanced,
  });
  if (!showAdvanced) {
    rawTickets = rawTickets.filter((t) => t.sophistication === "Core");
  }
  const enriched = volEnrichTickets(rawTickets, enrichCtx);
  const tickets = volRankTickets(enriched, enrichCtx);
  const listedN = tickets.reduce(
    (n, t) => n + (t.legs || []).filter((L) => L.listed === true).length,
    0,
  );
  const missN = tickets.reduce(
    (n, t) => n + (t.legs || []).filter((L) => L.listed === false).length,
    0,
  );

  const ticketsHtml = tickets.length
    ? `<h3 class="vol-plan-h" data-help-key="vol-plan-tickets">Example Deribit tickets (ranked · live-book checked)</h3>` +
      `<p class="vol-plan-why">Shown <strong>best first</strong> by composite score. ` +
      `Each leg is snapped to the <strong>live Deribit instrument list</strong> (same book as Options Strategy). ` +
      `Pricing is a <strong>USD-linear BS proxy</strong> (Deribit BTC options are inverse). ` +
      `Missing names are blocked from dry-run. Book: <strong>${listedN} listed</strong>` +
      (missN ? ` · <strong class="vol-ticket-sell">${missN} missing</strong>` : "") +
      `${chain?.indexPrice ? ` · index $${Number(chain.indexPrice).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : " · chain unavailable — names are estimates"}.</p>` +
      volTicketsSummaryTableHtml(tickets) +
      `<div id="vol-ticket-detail" class="vol-ticket-detail" aria-live="polite"></div>`
    : "";

  const productHtml = volModelProductHtml({
    mark,
    rv1,
    day7,
    day30,
    term7,
    term30,
    liveIv7,
    liveIv30,
    liveGap7,
    liveGap30,
    chain,
    wExp,
    mExp,
  });
  const sensitivityHtml = volForecastSensitivityHtml({
    usable,
    crossOnly,
    conf,
    cur,
    unc,
    regime,
    term7,
    term30,
    liveIv7,
    liveIv30,
    hasLiveIv,
    spot,
    chain,
    dailyVol,
    mark,
  });

  const html =
    `<div class="vol-trade-plan">` +
    `<p class="vol-plan-stance"><span class="vol-plan-kicker">Suggested Deribit position</span> ` +
    `<strong>${volEscape(stanceShort)}</strong></p>` +
    `<p class="vol-plan-why">${stancePlain}</p>` +
    productHtml +
    `<h3 class="vol-plan-h" data-help-key="vol-plan-primer">1 · Read this first (junior)</h3>` +
    `<ul class="vol-plan-list">` +
    `<li><strong>What “long vol” means:</strong> you buy options (pay premium). You want big moves or higher IV. Time decay hurts you.</li>` +
    `<li><strong>What “short vol” means:</strong> you sell options (collect premium). You want a quiet market. Jumps and IV spikes hurt you — always use wings.</li>` +
    `<li><strong>The model’s product is a volatility forecast</strong> (annualized RV), not a trade. Trades are a second step: compare that forecast to live Deribit ATM IV on a matching expiry.</li>` +
    `<li><strong>Edge ≈ live IV − model term RV</strong> for the same tenor. Rich IV (positive gap) favors selective short vol; cheap IV favors long vol.</li>` +
    `<li><strong>Contracts:</strong> every suggested name is checked against the live Deribit book. Missing = do not type it in by hand.</li>` +
    `</ul>` +
    `<h3 class="vol-plan-h" data-help-key="vol-plan-why">2 · Why this stance</h3>` +
    `<p class="vol-plan-why">${whyJunior}</p>` +
    `<ul class="vol-plan-list">` +
    `<li><strong>Mark model:</strong> ${volEscape(mark.name)} · desk conf <strong>${conf}%</strong> · usable: <strong>${volEscape(verdict?.tableLabel || "—")}</strong></li>` +
    `<li><strong>4y cycle lens:</strong> ${volEscape(String(cycleLens.regime).replace(/_/g, " "))} — ${volEscape(cycleLens.blurb)} ` +
    `Longer-dated tickets use listed ${
      leapExpPlan
        ? volExpiryCodeFromMs(leapExpPlan.expirationTimestamp)
        : qExpPlan
          ? volExpiryCodeFromMs(qExpPlan.expirationTimestamp)
          : "monthly (no quarterly/LEAPS on book)"
    }.</li>` +
    `<li><strong>Day-ahead path (ann.):</strong> 1d ${volFmtPct(rv1, 1)} · day-7 ${volFmtPct(day7, 1)} · day-30 ${volFmtPct(day30, 1)}</li>` +
    `<li><strong>Term RV (option mark):</strong> 7d ${volFmtPct(term7, 1)} · 30d ${volFmtPct(term30, 1)} — this is what you compare to IV</li>` +
    `<li><strong>Live ATM IV:</strong> ${
      hasLiveIv
        ? `7d ${volFmtPct(liveIv7, 1)} (gap ${volFmtPct(liveGap7, 1)}) · 30d ${volFmtPct(liveIv30, 1)} (gap ${volFmtPct(liveGap30, 1)})`
        : "chain unavailable — stance used regime fallback, not a priced IV−RV edge"
    }</li>` +
    `<li><strong>Regime:</strong> ${volEscape(String(regime))} · persistence ${pers != null ? Number(pers).toFixed(3) : "—"}</li>` +
    `<li><strong>Spot:</strong> ${
      spot != null ? `$${Number(spot).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "unavailable"
    }${indexPx > 0 ? " (Deribit index)" : " (sample close)"}</li>` +
    `</ul>` +
    sensitivityHtml +
    `<h3 class="vol-plan-h" data-help-key="vol-plan-rules">3 · Rules before you click</h3>` +
    `<ol class="vol-plan-list vol-plan-steps">` +
    `<li><strong>Entry gate:</strong> ${entryGate}</li>` +
    `<li><strong>Exit / kill:</strong> ${invalidation}</li>` +
    `<li><strong>Greeks:</strong> ${greeksPlain}</li>` +
    `<li><strong>Size:</strong> ${notionalHint}. ` +
    `${
      dailyVol != null
        ? `Model 1σ daily move ≈ <strong>${volFmtPct(dailyVol, 2)}</strong> of spot.`
        : ""
    } Cut size if models disagree on RV by &gt; ~8 vol pts.</li>` +
    `<li><strong>Hedge:</strong> Use <span class="mono">BTC-PERPETUAL</span> only to flatten delta — the vol view lives in the options, not the perp.</li>` +
    `<li><strong>Checklist:</strong> (1) DVOL + ATM IV for chosen expiry, (2) IV − model RV, (3) event calendar, (4) max loss in USD, (5) write thesis + kill criteria, (6) then order.</li>` +
    `<li><strong>Never:</strong> naked short straddles; size from AIC alone; ignore wings; treat this as a guaranteed edge.</li>` +
    `</ol>` +
    ticketsHtml +
    `<p class="vol-plan-disclaimer">Educational template from this suite’s fits plus a live Deribit book snapshot — not investment advice, not a Deribit order, and not a promise of profit. ` +
    `Theo premiums are a <strong>USD-linear Black–Scholes proxy</strong>; Deribit BTC options are inverse (BTC). ` +
    `A listed name can still be illiquid. Always re-check mark IV, bid/ask, open interest, and portfolio margin on Deribit before any fill.</p>` +
    `</div>`;

  return { stance: stanceShort, html, conf, mark: mark.name, bias, tickets };
}

/**
 * Preliminary emergency / execute buttons: confirm + dry-run log.
 * Live Deribit routing is intentionally not connected yet.
 */
function volBindTicketActionButtons(root) {
  if (!root) return;
  const logElId = "vol-em-action-log";
  let log = document.getElementById(logElId);
  if (!log) {
    log = document.createElement("div");
    log.id = logElId;
    log.className = "vol-em-action-log";
    log.setAttribute("aria-live", "polite");
    root.appendChild(log);
  }

  const stamp = () =>
    new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  root.querySelectorAll("[data-vol-em-action]").forEach((btn) => {
    if (btn.dataset.volEmBound === "1") return;
    btn.dataset.volEmBound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const action = btn.getAttribute("data-vol-em-action") || "unknown";
      const tradeId = btn.getAttribute("data-trade-id") || "?";
      const title = btn.getAttribute("data-trade-title") || "";
      const detail = btn.getAttribute("data-detail") || "";
      const lossCap = btn.getAttribute("data-loss-cap");
      const low = btn.getAttribute("data-spot-low");
      const high = btn.getAttribute("data-spot-high");

      const labels = {
        flatten: "FLATTEN ALL LEGS",
        hedge_delta: "HEDGE DELTA (PERP)",
        cut_half: "CUT SIZE 50%",
        cover_shorts: "COVER SHORT PREMIUM",
        dump_longs: "DUMP LONG PREMIUM",
        log_escalate: "LOG & ESCALATE",
        execute: "LOG DRY-RUN",
      };
      const headline = labels[action] || action.toUpperCase();

      const confirmMsg =
        action === "execute"
          ? `DRY-RUN only — nothing is sent to Deribit.\n\nTrade ${tradeId}: ${title}\n\nClick OK to log a draft ticket in this browser.`
          : `EMERGENCY ACTION (preliminary)\n\n${headline}\nTrade ${tradeId}: ${title}\n\n${detail}\n\n` +
            (lossCap ? `Loss cap ref: ${lossCap}\n` : "") +
            (low && high ? `2σ band ref: ${low} – ${high}\n` : "") +
            `\nThis will NOT send orders to Deribit yet.\nOK = log dry-run checklist.`;

      if (!window.confirm(confirmMsg)) {
        log.insertAdjacentHTML(
          "afterbegin",
          `<div class="vol-em-log-line vol-em-log-line--cancel"><span class="mono">${stamp()}</span> cancelled ${volEscape(headline)} · Trade ${volEscape(tradeId)}</div>`,
        );
        return;
      }

      const entry = {
        t: stamp(),
        action,
        tradeId,
        title,
        detail,
        lossCap,
        band: low && high ? `${low}-${high}` : null,
        live: false,
      };
      try {
        const key = "vol-em-dryrun-log";
        const prev = JSON.parse(localStorage.getItem(key) || "[]");
        prev.unshift(entry);
        localStorage.setItem(key, JSON.stringify(prev.slice(0, 40)));
      } catch {
        /* ignore quota */
      }
      console.info("[vol emergency dry-run]", entry);

      log.insertAdjacentHTML(
        "afterbegin",
        `<div class="vol-em-log-line vol-em-log-line--ok">` +
          `<span class="mono">${stamp()}</span> ` +
          `<strong>${volEscape(headline)}</strong> · Trade ${volEscape(tradeId)}` +
          (title ? ` · ${volEscape(title)}` : "") +
          ` · <em>dry-run logged</em> (not sent to Deribit)` +
          (detail ? `<div class="vol-em-log-detail">${volEscape(detail)}</div>` : "") +
          `</div>`,
      );
    });
  });
}

function volSelectPlanTicket(id, { scroll = false } = {}) {
  const tickets = volPlanTickets || [];
  if (!tickets.length) return;
  const wanted = String(id || volPlanTicketSel || tickets[0].id);
  const ticket = tickets.find((t) => String(t.id) === wanted) || tickets[0];
  volPlanTicketSel = String(ticket.id);
  const host = volEl("vol-trade-plan-host");
  host?.querySelectorAll(".vol-summary-row").forEach((tr) => {
    tr.classList.toggle("vol-summary-row--sel", tr.getAttribute("data-vol-ticket-id") === volPlanTicketSel);
  });
  const detail = volEl("vol-ticket-detail");
  if (!detail) return;
  detail.innerHTML = volTradeTicketHtml(ticket);
  volBindTicketActionButtons(detail);
  const screen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="volatility"]',
  );
  window.decorateHelpLabels?.(screen);
  if (scroll) detail.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function volBindTicketPicker(root) {
  if (!root) return;
  root.querySelectorAll("tr.vol-summary-row[data-vol-ticket-id]").forEach((tr) => {
    if (tr.dataset.volPickBound === "1") return;
    tr.dataset.volPickBound = "1";
    const open = () => volSelectPlanTicket(tr.getAttribute("data-vol-ticket-id"), { scroll: true });
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function volPaintTradePlan(suite, chain) {
  const host = volEl("vol-trade-plan-host");
  const meta = volEl("vol-trade-plan-meta");
  if (!host) return null;
  const plan = volBuildDeribitTradePlan(suite, chain);
  volPlanTickets = plan?.tickets || [];
  const keep = volPlanTickets.some((t) => String(t.id) === String(volPlanTicketSel));
  if (!keep) volPlanTicketSel = volPlanTickets[0] ? String(volPlanTickets[0].id) : "1";
  host.innerHTML = plan?.html || "";
  if (meta) {
    meta.textContent = [
      plan?.mark ? `mark ${plan.mark}` : "",
      plan?.stance ? plan.stance.split("—")[0].trim() : "",
      `${volPlanTickets.length} strategies`,
      chain?.indexPrice
        ? `index $${Number(chain.indexPrice).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
        : "book n/a",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  volBindTicketPicker(host);
  volSelectPlanTicket(volPlanTicketSel);
  return plan;
}

async function volRenderRunCommentary(suite) {
  const host = volEl("vol-run-commentary");
  const meta = volEl("vol-run-commentary-meta");
  const planHost = volEl("vol-trade-plan-host");
  if (host && !suite?.models?.length) {
    host.innerHTML = `<p>Run selected models to generate a desk read of this estimation pass.</p>`;
    if (meta) meta.textContent = "After estimation";
  }
  if (planHost && !suite?.models?.length) {
    planHost.innerHTML = `<p class="macro-muted">Run selected models to draft a plan. Tickets snap to listed Deribit contracts. Nothing here sends an order.</p>`;
    return;
  }
  if (planHost) {
    planHost.innerHTML = `<p class="macro-muted">Loading live Deribit book to verify contracts…</p>`;
  }
  const chain = await volLoadDeribitChain();
  volDeribitChain = chain;
  volSetLiveIvKpis(suite, chain);
  const plan = volPaintTradePlan(suite, chain);
  if (host) {
    const lines = volBuildRunCommentary(suite);
    host.innerHTML = lines.map((p) => `<p>${p}</p>`).join("");
  }
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
    rvNote: m.rvNote,
    fallbackFrom: m.fallbackFrom,
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
    detail.fallbackFrom ||
    (detail.warning && /fallback|not installed|GARCH\(1,1\)/i.test(detail.warning))
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
    const nOrig = bt.origins != null ? Number(bt.origins) : null;
    reasons.push(
      nOrig != null
        ? `OOS backtest available (expanding window, n=${nOrig} origins — modest, not a full walk-forward).`
        : "OOS backtest available (expanding window).",
    );
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
      ? `Score ${score}/100 · mean QLIKE ${meanQ != null ? Number(meanQ).toFixed(3) : "—"} · OOS n=${bt.origins != null ? bt.origins : "—"} · ${nOk} models`
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

/** Map arch param names → Greek symbol + short role + fallback meaning (client-side). */
function volParamMeta(p) {
  const name = String(p?.name || "");
  const base = name.includes("[") ? name.split("[")[0].toLowerCase() : name.toLowerCase();
  let idx = null;
  if (name.includes("[") && name.endsWith("]")) {
    idx = name.slice(name.indexOf("[") + 1, -1).trim();
  }
  const symMap = {
    omega: "ω",
    const: "μ",
    mu: "μ",
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    nu: "ν",
    eta: "η",
    lambda: "λ",
    phi: "φ",
    d: "d",
    theta: "θ",
  };
  const roleMap = {
    omega: "Variance floor",
    const: "Mean return",
    mu: "Mean return",
    alpha: "News / shock reaction",
    beta: "Vol memory / clustering",
    gamma: "Asymmetry / leverage",
    delta: "Power on volatility",
    nu: "Tail thickness",
    eta: "GED shape",
    lambda: "Decay / skew",
    phi: "Short-run AR filter",
    d: "Long memory",
  };
  const meaningMap = {
    omega:
      "Baseline level of conditional variance (must stay positive). Higher ω lifts the long-run floor of volatility when shocks die out.",
    const:
      "Constant mean of daily log returns (drift). Usually near zero for BTC; not the volatility used for Deribit RV marks.",
    mu:
      "Constant mean of daily log returns (drift). Usually near zero for BTC; not the volatility used for Deribit RV marks.",
    alpha:
      "How strongly a recent squared return shock raises today’s variance (ARCH news effect). Larger α ⇒ vol jumps more after a large move.",
    beta:
      "How much past conditional variance carries forward (GARCH clustering). Larger β ⇒ vol stays elevated longer; persistence often ≈ α+β.",
    gamma:
      "Asymmetry / leverage: extra weight on negative-return days (GJR) or signed news (EGARCH). In GJR, γ>0 means dumps lift next-day vol more than pumps.",
    delta:
      "Power transform in APARCH. δ=2 is variance-like; other values reshape the news-impact curve.",
    nu:
      "Student-t degrees of freedom for residual tails. Lower ν ⇒ fatter tails (extreme days more likely than Normal) — matters for VaR/ES.",
    eta: "GED shape parameter controlling residual tail thickness relative to Normal.",
    lambda:
      "Skew (skewed-t) or fixed EWMA decay depending on model. For RiskMetrics, λ close to 1 means slow variance decay.",
    phi: "Short-run AR coefficient in the FIGARCH filter — how recent shocks enter the long-memory structure.",
    d: "Fractional integration order in FIGARCH (0–1). Higher d ⇒ variance shocks die out more slowly (long memory).",
  };
  let symbol = p.symbol || symMap[base];
  if (!symbol) {
    if (base.startsWith("rv")) symbol = "RV";
    else symbol = name || "—";
  } else if (idx != null && ["alpha", "beta", "gamma", "phi", "theta"].includes(base)) {
    const subMap = "₀₁₂₃₄₅₆₇₈₉";
    const sub = [...idx].map((c) => (/[0-9]/.test(c) ? subMap[Number(c)] : c)).join("");
    symbol = `${symbol}${sub}`;
  }
  let role = p.role || roleMap[base] || (base.startsWith("rv") ? "Realized-vol lag" : "Model coefficient");
  let meaning =
    p.meaning ||
    meaningMap[base] ||
    "Coefficient in the fitted specification — match this name to the equation above.";
  if (idx != null && ["alpha", "beta", "gamma"].includes(base) && !meaning.includes(`lag ${idx}`)) {
    const lagNote =
      base === "alpha"
        ? ` This is lag ${idx} on the squared residual (ε²).`
        : base === "beta"
          ? ` This is lag ${idx} on past conditional variance (σ²).`
          : ` This is lag ${idx} on the asymmetry / leverage term.`;
    if (!meaning.includes(lagNote.trim())) meaning = meaning.replace(/\s+$/, "") + lagNote;
  }
  return { symbol, role, meaning };
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
    // Name + Greek symbol + short role + plain-language meaning
    paramsBody.innerHTML = rows.length
      ? rows
          .map((p) => {
            const stars = volStars(p.pValue);
            const meta = volParamMeta(p);
            const sigNote =
              p.pValue != null && Number.isFinite(Number(p.pValue))
                ? Number(p.pValue) < 0.01
                  ? "Highly significant"
                  : Number(p.pValue) < 0.05
                    ? "Significant at 5%"
                    : Number(p.pValue) < 0.1
                      ? "Marginal (10%)"
                      : "Not significant at 10%"
                : "";
            return `<tr>
              <td class="vol-td-text vol-param-cell">
                <div class="vol-param-head">
                  <span class="vol-param-symbol" title="Symbol in the model equation">${volEscape(meta.symbol)}</span>
                  <span class="vol-param-name" title="Software / arch coefficient name">${volEscape(p.name)}</span>
                  <span class="vol-param-role">${volEscape(meta.role)}</span>
                </div>
                <div class="vol-param-meaning">${volEscape(meta.meaning)}</div>
                ${sigNote ? `<div class="vol-param-sig">${volEscape(sigNote)}${stars ? ` <span class="vol-stars">${stars}</span>` : ""}</div>` : ""}
              </td>
              <td class="mono vol-td-num">${volFmtNum(p.estimate, 5)}</td>
              <td class="mono vol-td-num">${volFmtNum(p.stdError, 5)}</td>
              <td class="mono vol-td-num">${volFmtNum(p.tStat, 3)}</td>
              <td class="mono vol-td-num">${volFmtNum(p.pValue, 4)}${stars ? ` <span class="vol-stars">${stars}</span>` : ""}</td>
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
      detail.rvNote ? `<p class="vol-engine-note">${volEscape(detail.rvNote)}</p>` : "",
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
  const term = (detail?.forecastTermAnn || []).map(Number);
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
      const termSlice = indices.map((i) => (i < term.length ? term[i] : NaN));
      const both = [...slice, ...termSlice].filter(Number.isFinite);
      const minV = Math.min(...both) * 0.95;
      const maxV = Math.max(...both) * 1.05;
      const range = maxV - minV || 0.01;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      const stroke = (vals, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        let started = false;
        vals.forEach((v, i) => {
          if (!Number.isFinite(v)) return;
          const x = api.xAt(i, drawCount);
          const y = yAt(v);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        });
        if (started) ctx.stroke();
      };
      stroke(slice, "#38bdf8", 2);
      if (termSlice.some(Number.isFinite)) stroke(termSlice, "#fbbf24", 2);

      if (api.hoverGlobal != null && Number.isFinite(f[api.hoverGlobal])) {
        api.drawCrosshair?.(api.xAtGlobal(api.hoverGlobal));
        api.drawDot?.(api.xAtGlobal(api.hoverGlobal), yAt(f[api.hoverGlobal]), "#38bdf8");
        if (Number.isFinite(term[api.hoverGlobal])) {
          api.drawDot?.(api.xAtGlobal(api.hoverGlobal), yAt(term[api.hoverGlobal]), "#fbbf24");
        }
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${(maxV * 100).toFixed(0)}%`, api.pad.left - 6, api.pad.top + 10);
      ctx.textAlign = "center";
      ctx.fillText("horizon (days) · cyan = vol on that day · gold = term RV to that day", w / 2, h - 8);
    },
    formatTooltip(globalIdx) {
      const h = globalIdx + 1;
      const v = f[globalIdx];
      const tv = term[globalIdx];
      return (
        volTipTitle(`Horizon ${h}d`) +
        volTipRow("Vol on day h (ann.)", Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : "—") +
        volTipRow("Term RV to day h", Number.isFinite(tv) ? `${(tv * 100).toFixed(2)}%` : "—") +
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
  const days = volEl("vol-range")?.value || VOL_DESK_DAYS;
  const dist = volEl("vol-dist")?.value || VOL_DESK_DIST;
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
      forecastTermAnn: fit.forecastTermAnn || [],
      condVol: fit.condVol || [],
      stdResid: fit.stdResid || [],
      newsImpact: fit.newsImpact || [],
      risk: fit.risk || {},
      backtest: fit.backtest || {},
      regime: fit.regime,
      sizingMultiplier: fit.sizingMultiplier,
      warning: fit.warning,
      rvNote: fit.rvNote,
      fallbackFrom: fit.fallbackFrom,
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

/**
 * @param {boolean} force
 * @param {{ allModels?: boolean }} opts
 */
async function volRun(force = false, opts = {}) {
  if (volBusy) return;
  volBusy = true;
  const btnSel = volEl("vol-run-selected");
  const btnAll = volEl("vol-run-all");
  const meta = volEl("vol-suite-meta");
  const prevSel = btnSel?.textContent;
  const prevAll = btnAll?.textContent;
  try {
    if (btnSel) {
      btnSel.disabled = true;
      if (opts.allModels) btnSel.textContent = "Estimating…";
      else btnSel.textContent = "Estimating…";
    }
    if (btnAll) {
      btnAll.disabled = true;
      btnAll.textContent = opts.allModels ? "Estimating all…" : "Estimating…";
    }
    if (meta) {
      meta.textContent = opts.allModels
        ? "Running full catalog…"
        : "Running selected models…";
    }
    const suite = await volFetchSuite(force, opts);
    volSuite = suite;
    volSelectedId =
      suite.bestByQlike ||
      suite.summary?.markModelId ||
      suite.bestByAic ||
      suite.models?.find((m) => m.status === "ok")?.id ||
      null;
    volSetKpis(suite);
    volRenderTable(suite);
    volRenderGuide(suite);
    volRenderGlossary(suite);
    volRenderDetail(suite.detail);
    await volRenderRunCommentary(suite);
    volDrawAll(suite);
    if (meta) {
      const nSel = (suite.selectedModelIds || suite.models || []).length;
      meta.textContent = [
        suite.pair || "BTC",
        suite.startDate && suite.endDate ? `${suite.startDate} → ${suite.endDate}` : "",
        `${suite.nObs || "—"} obs`,
        `${nSel} models`,
        `dist=${suite.distribution || "t"}`,
        suite.archAvailable ? "engine: arch" : "engine: numpy fallback",
        suite.fromCache ? "cached" : "fresh",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    volUpdatePickerMeta();
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
    const volScreen = document.querySelector(
      '.menu-screen[data-l1="stats"][data-l2="volatility"]',
    );
    window.decorateHelpLabels?.(volScreen);
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
    if (btnSel) {
      btnSel.disabled = false;
      btnSel.textContent = prevSel || "Run selected";
    }
    if (btnAll) {
      btnAll.disabled = false;
      btnAll.textContent = prevAll || "Run all";
    }
  }
}

function initVolatilityModule() {
  const screen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="volatility"]',
  );
  if (!screen) return;
  window.decorateHelpLabels?.(screen);
  if (screen.dataset.volBound) return;
  screen.dataset.volBound = "true";

  volApplyPrefsToControls();
  volLoadCatalog();

  volEl("vol-run-selected")?.addEventListener("click", () => volRun(true, { allModels: false }));
  volEl("vol-run-all")?.addEventListener("click", () => volRun(true, { allModels: true }));
  volEl("vol-export-csv")?.addEventListener("click", () => {
    if (volSuite) volExportCsv(volSuite);
  });
  // Range/dist: save prefs only — re-run when user clicks Run selected / Run all
  volEl("vol-range")?.addEventListener("change", () => {
    volSavePrefs({ days: volEl("vol-range")?.value });
    volUpdatePickerMeta();
  });
  volEl("vol-dist")?.addEventListener("change", () => {
    volSavePrefs({ dist: volEl("vol-dist")?.value });
    volUpdatePickerMeta();
  });
  volEl("vol-show-advanced")?.addEventListener("change", () => {
    if (volSuite && volDeribitChain !== undefined) {
      volPaintTradePlan(volSuite, volDeribitChain);
      const screen = document.querySelector(
        '.menu-screen[data-l1="stats"][data-l2="volatility"]',
      );
      window.decorateHelpLabels?.(screen);
    }
  });

  volEl("vol-models-all")?.addEventListener("click", () => {
    volSetCheckedModels(volCatalog.map((m) => m.id));
    volSavePrefs({ models: volCatalog.map((m) => m.id) });
  });
  volEl("vol-models-defaults")?.addEventListener("click", () => {
    const ids = volCatalog.filter((m) => m.defaultOn).map((m) => m.id);
    volSetCheckedModels(ids.length ? ids : volCatalog.map((m) => m.id));
    volSavePrefs({ models: ids.length ? ids : null });
  });
  volEl("vol-models-core")?.addEventListener("click", () => {
    const ids = volCatalog.filter((m) => m.family === "core").map((m) => m.id);
    volSetCheckedModels(ids);
    volSavePrefs({ models: ids });
  });
  volEl("vol-models-asym")?.addEventListener("click", () => {
    const ids = volCatalog
      .filter((m) => m.family === "asymmetric")
      .map((m) => m.id);
    volSetCheckedModels(ids);
    volSavePrefs({ models: ids });
  });
  volEl("vol-models-none")?.addEventListener("click", () => {
    volSetCheckedModels([]);
    volSavePrefs({ models: [] });
  });
}

window.refreshVolatilityCharts = function () {
  initVolatilityModule();
  volApplyPrefsToControls();
  if (!volCatalog.length) volLoadCatalog();
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
