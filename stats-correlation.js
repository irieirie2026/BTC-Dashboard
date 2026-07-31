/**
 * Stats → Statistics → Correlation
 * BTC multi-asset correlation matrix + rolling ρ chart.
 */

const CORR_API = "/api/stats/correlation";

let corrReady = false;
let corrLoading = false;
let corrData = null;
let corrSelectedAsset = null;
let corrWindow = "365";
let corrMatrixSample = "all";

const CORR_WINDOW_LABELS = {
  365: "1 year",
  730: "2 years",
  1095: "3 years",
  1825: "5 years",
  all: "All (expanding)",
};

const CORR_MATRIX_SAMPLE_LABELS = {
  365: "1 year",
  730: "2 years",
  1095: "3 years",
  1825: "5 years",
  all: "All",
};

function corrWindowLabel(w) {
  return CORR_WINDOW_LABELS[String(w)] || `${w}d`;
}

function corrMatrixSampleLabel(s) {
  return CORR_MATRIX_SAMPLE_LABELS[String(s)] || String(s);
}

/** Active matrix + pairs for the selected sample length. */
function corrActiveSample(data) {
  const by = data?.matrixSamples?.bySample || {};
  const sid = corrMatrixSample || data?.matrixSamples?.default || "all";
  const block = by[sid] || by.all || null;
  return {
    id: sid,
    label: corrMatrixSampleLabel(sid),
    matrix: block?.matrix || data?.matrix || [],
    nObsMatrix: block?.nObsMatrix || data?.nObsMatrix || [],
    btcPairs: block?.btcPairs || data?.btcPairs || [],
  };
}

function corrEl(id) {
  return document.getElementById(id);
}

function corrEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function corrFmtRho(v, d = 2) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(d)}`;
}

/** Diverging color: −1 red → 0 slate → +1 teal */
function corrCellStyle(rho) {
  if (rho == null || !Number.isFinite(rho)) {
    return { background: "transparent", color: "#64748b" };
  }
  const t = Math.min(1, Math.abs(rho));
  const a = 0.12 + t * 0.72;
  if (rho >= 0) {
    return {
      background: `rgba(45, 212, 191, ${a.toFixed(3)})`,
      color: t > 0.55 ? "#ecfdf5" : "#99f6e4",
    };
  }
  return {
    background: `rgba(248, 113, 113, ${a.toFixed(3)})`,
    color: t > 0.55 ? "#fff1f2" : "#fecaca",
  };
}

function corrMountChart(id, opts) {
  if (typeof window.mountStatsChart === "function") {
    return window.mountStatsChart(id, opts);
  }
  return null;
}

function corrRenderKpis(data) {
  const set = (id, v) => {
    const el = corrEl(id);
    if (el) el.textContent = v;
  };
  const sample = corrActiveSample(data);
  set(
    "corr-kpi-sample",
    data.nBtcObs != null ? `${Number(data.nBtcObs).toLocaleString()}` : "—",
  );
  const sub = corrEl("corr-kpi-sample-sub");
  if (sub) {
    sub.textContent = [
      data.startDate && data.endDate ? `${data.startDate} → ${data.endDate}` : "",
      `matrix: ${sample.label}`,
      data.fromCache ? "cached" : "fresh",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const pairs = (sample.btcPairs || []).filter((p) => p.corr != null);
  const top = pairs.length
    ? pairs.reduce((a, b) => (Number(b.corr) > Number(a.corr) ? b : a))
    : null;
  const low = pairs.length
    ? pairs.reduce((a, b) => (Number(b.corr) < Number(a.corr) ? b : a))
    : null;

  set("corr-kpi-top", top ? corrFmtRho(top.corr) : "—");
  const topSub = corrEl("corr-kpi-top-sub");
  if (topSub) topSub.textContent = top ? `${top.name} · ${sample.label}` : "—";

  set("corr-kpi-low", low ? corrFmtRho(low.corr) : "—");
  const lowSub = corrEl("corr-kpi-low-sub");
  if (lowSub) lowSub.textContent = low ? `${low.name} · ${sample.label}` : "—";

  set("corr-kpi-engine", data.yfinanceAvailable ? "yfinance" : "n/a");
  const meta = corrEl("corr-meta");
  if (meta) {
    meta.textContent = data.method
      ? String(data.method).slice(0, 48)
      : "Pearson · log returns";
  }
}

function corrRenderMatrix(data) {
  const host = corrEl("corr-matrix-host");
  if (!host) return;
  const ids = data.ids || [];
  const labels = data.labels || ids;
  const sample = corrActiveSample(data);
  const matrix = sample.matrix || [];
  const nObs = sample.nObsMatrix || [];
  if (!ids.length || !matrix.length) {
    host.innerHTML = '<p class="mm-empty">No matrix — install yfinance and refresh.</p>';
    return;
  }

  const head = labels
    .map(
      (lab, i) =>
        `<th class="corr-th-col" title="${corrEscape(ids[i])}">${corrEscape(
          String(lab).length > 10 ? ids[i] : lab,
        )}</th>`,
    )
    .join("");

  const body = labels
    .map((lab, i) => {
      const cells = (matrix[i] || [])
        .map((rho, j) => {
          const st = corrCellStyle(rho);
          const n = nObs[i]?.[j];
          const tip = `${labels[i]} × ${labels[j]}: ρ=${corrFmtRho(rho, 3)}${
            n != null ? ` · n=${n}` : ""
          } · sample ${sample.label}`;
          return `<td class="corr-cell mono" style="background:${st.background};color:${st.color}" title="${corrEscape(tip)}">${corrFmtRho(rho, 2)}</td>`;
        })
        .join("");
      return `<tr><th class="corr-th-row" scope="row" title="${corrEscape(ids[i])}">${corrEscape(lab)}</th>${cells}</tr>`;
    })
    .join("");

  host.innerHTML = `
    <div class="corr-matrix-scroll-inner">
      <table class="corr-matrix-table">
        <thead><tr><th class="corr-th-corner"></th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  const mmeta = corrEl("corr-matrix-meta");
  if (mmeta) {
    mmeta.textContent = [
      `${ids.length} assets`,
      `sample ${sample.label}`,
      data.startDate && data.endDate ? `history ${data.startDate} → ${data.endDate}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
}

function corrRenderPairs(data) {
  const body = corrEl("corr-pairs-body");
  if (!body) return;
  const sample = corrActiveSample(data);
  const pairs = sample.btcPairs || [];
  if (!pairs.length) {
    body.innerHTML = `<tr><td colspan="4">No pairs available.</td></tr>`;
    return;
  }
  body.innerHTML = pairs
    .map((p) => {
      const st = corrCellStyle(p.corr);
      const st90 = corrCellStyle(p.corr90);
      return `<tr class="corr-pair-row" data-corr-id="${corrEscape(p.id)}" tabindex="0" role="button">
        <td class="vol-td-text">${corrEscape(p.name)}
          <span class="corr-group-tag">${corrEscape(p.group || "")}</span>
        </td>
        <td class="mono vol-td-num" style="background:${st.background};color:${st.color}">${corrFmtRho(p.corr)}</td>
        <td class="mono vol-td-num" style="background:${st90.background};color:${st90.color}">${corrFmtRho(p.corr90)}</td>
        <td class="mono vol-td-num">${p.nObs ?? "—"}</td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll(".corr-pair-row").forEach((tr) => {
    const go = () => {
      const id = tr.getAttribute("data-corr-id");
      if (!id) return;
      corrSelectedAsset = id;
      const sel = corrEl("corr-asset-select");
      if (sel) sel.value = id;
      corrDrawRolling(corrData);
    };
    tr.addEventListener("click", go);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
}

function corrFillAssetSelect(data) {
  const sel = corrEl("corr-asset-select");
  if (!sel) return;
  const pairs = data.btcPairs || [];
  const rolling = data.rolling?.byAsset || {};
  const opts = pairs.filter((p) => rolling[p.id]);
  const list = opts.length ? opts : pairs;
  sel.innerHTML = list
    .map(
      (p) =>
        `<option value="${corrEscape(p.id)}">${corrEscape(p.name)}</option>`,
    )
    .join("");
  if (!corrSelectedAsset || !list.some((p) => p.id === corrSelectedAsset)) {
    corrSelectedAsset =
      list.find((p) => p.id === "QQQ")?.id ||
      list.find((p) => p.id === "SPY")?.id ||
      list[0]?.id ||
      null;
  }
  if (corrSelectedAsset) sel.value = corrSelectedAsset;
}

function corrDrawRolling(data) {
  if (!data) return;
  const aid = corrSelectedAsset;
  const w = String(corrWindow || "365");
  const series = data.rolling?.byAsset?.[aid]?.[w];
  const name =
    data.btcPairs?.find((p) => p.id === aid)?.name ||
    data.assets?.find((a) => a.id === aid)?.name ||
    aid ||
    "—";
  const wLabel = corrWindowLabel(w);

  const meta = corrEl("corr-roll-meta");
  if (meta) {
    if (series?.dates?.length) {
      const span =
        series.startDate && series.endDate
          ? `${series.startDate} → ${series.endDate}`
          : `${series.dates[0]} → ${series.dates[series.dates.length - 1]}`;
      meta.textContent = `${name} · ${wLabel} · ${span} · ${series.dates.length} pts`;
    } else {
      meta.textContent = `${name} · ${wLabel} · no series (need more overlapping history)`;
    }
  }

  if (!series?.dates?.length) {
    const canvas = corrEl("corr-rolling-chart");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const cw = canvas.width || canvas.clientWidth || 800;
        const ch = canvas.height || 360;
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = "#64748b";
        ctx.font = "13px system-ui";
        ctx.fillText(
          `No rolling series for ${name} · ${wLabel}. Try a shorter window or another asset.`,
          16,
          36,
        );
      }
    }
    return;
  }

  const dates = series.dates;
  const vals = series.values.map((v) => (v == null ? null : Number(v)));
  const finite = vals.filter((v) => v != null && Number.isFinite(v));
  // Scale Y to the data (not forced to ±1) so multi-year ρ variation is visible
  const dataMin = Math.min(...finite);
  const dataMax = Math.max(...finite);
  const span = dataMax - dataMin;
  const pad = Math.max(0.02, span * 0.12 || 0.05);
  let minV = dataMin - pad;
  let maxV = dataMax + pad;
  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || minV >= maxV) {
    minV = -0.1;
    maxV = 0.1;
  }
  // Soft clamp only if outside ρ domain
  minV = Math.max(-1.02, minV);
  maxV = Math.min(1.02, maxV);

  corrMountChart("corr-rolling-chart", {
    pad: { top: 12, right: 12, bottom: 26, left: 44 },
    maxPoints: Math.min(dates.length, 900),
    getLength: () => dates.length,
    minWindow: Math.min(40, dates.length),
    onDraw(ctx, chartW, chartH, api) {
      ctx.clearRect(0, 0, chartW, chartH);
      const indices = api.indices;
      const range = maxV - minV || 1;
      const yAt = (v) => api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      // zero line only if 0 is in view
      if (minV < 0 && maxV > 0) {
        ctx.strokeStyle = "rgba(148,163,184,0.4)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(api.pad.left, yAt(0));
        ctx.lineTo(chartW - api.pad.right, yAt(0));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let started = false;
      indices.forEach((gi, li) => {
        const v = vals[gi];
        if (v == null || !Number.isFinite(v)) {
          started = false;
          return;
        }
        const x = api.xAt(li, indices.length);
        const y = yAt(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null && vals[api.hoverGlobal] != null) {
        api.drawCrosshair?.(api.xAtGlobal(api.hoverGlobal));
        api.drawDot?.(
          api.xAtGlobal(api.hoverGlobal),
          yAt(vals[api.hoverGlobal]),
          "#c4b5fd",
        );
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(maxV.toFixed(2), api.pad.left - 6, api.pad.top + 10);
      if (minV < 0 && maxV > 0) {
        ctx.fillText("0", api.pad.left - 6, yAt(0) + 3);
      }
      ctx.fillText(minV.toFixed(2), api.pad.left - 6, api.pad.top + api.chartH);

      if (dates.length) {
        ctx.textAlign = "left";
        ctx.fillText(String(dates[0]), api.pad.left, chartH - 8);
        ctx.textAlign = "right";
        ctx.fillText(String(dates[dates.length - 1]), chartW - api.pad.right, chartH - 8);
      }
    },
    formatTooltip(globalIdx) {
      const d = dates[globalIdx];
      const v = vals[globalIdx];
      const titleFn = window.chartTipTitle || ((x) => `<div>${x}</div>`);
      const rowFn =
        window.chartTipRow ||
        ((a, b) => `<div>${a}: ${b}</div>`);
      return (
        titleFn(d) +
        rowFn("Pair", `${name} vs BTC`) +
        rowFn("Input", "Daily log returns") +
        rowFn("Window", wLabel) +
        rowFn("ρ", corrFmtRho(v, 3)) +
        rowFn(
          "Read as",
          v != null && Math.abs(v) < 0.2
            ? "Weak linear link"
            : v != null && v > 0.5
              ? "Strong co-movement"
              : v != null && v < -0.3
                ? "Inverse tendency"
                : "Moderate",
        )
      );
    },
  });
}

function corrRenderCommentary(data) {
  const host = corrEl("corr-commentary");
  if (!host) return;
  if (!data?.ok && data?.error) {
    host.innerHTML = `<p class="vol-warn">${corrEscape(data.error)}</p>`;
    return;
  }
  const sample = corrActiveSample(data);
  const pairs = (sample.btcPairs || []).filter((p) => p.corr != null);
  const lines = [];
  lines.push(
    `History: <strong>${data.nBtcObs ?? "—"}</strong> BTC daily log returns` +
      (data.startDate && data.endDate
        ? ` (${corrEscape(data.startDate)} → ${corrEscape(data.endDate)})`
        : "") +
      `. Matrix sample: <strong>${corrEscape(sample.label)}</strong>. ` +
      `Method: ${corrEscape(data.method || "Pearson on log returns")}. ` +
      `${data.fromCache ? "Cached. " : "Fresh download. "}` +
      `Assets: <strong>${(data.ids || []).length}</strong>.`,
  );
  if (pairs.length) {
    const top = pairs.reduce((a, b) => (Number(b.corr) > Number(a.corr) ? b : a));
    const low = pairs.reduce((a, b) => (Number(b.corr) < Number(a.corr) ? b : a));
    lines.push(
      `Strongest full-sample link to BTC: <strong>${corrEscape(top.name)}</strong> ` +
        `(${corrFmtRho(top.corr)})` +
        (top.corr90 != null ? `; last 90d ${corrFmtRho(top.corr90)}` : "") +
        `. Weakest: <strong>${corrEscape(low.name)}</strong> (${corrFmtRho(low.corr)}).`,
    );
    const eq = pairs.filter((p) => p.group === "equity" || p.group === "stock");
    const eqMean =
      eq.length > 0
        ? eq.reduce((s, p) => s + Number(p.corr), 0) / eq.length
        : null;
    if (eqMean != null) {
      lines.push(
        `Average ρ of equity/stock book vs BTC: <strong>${corrFmtRho(eqMean)}</strong> — ` +
          (eqMean > 0.4
            ? "BTC is behaving more like a risk asset in this sample."
            : eqMean > 0.15
              ? "moderate equity beta; idiosyncratic crypto risk still large."
              : "weak equity co-movement on average (or short sample)."),
      );
    }
    const gld = pairs.find((p) => p.id === "GLD");
    if (gld?.corr != null) {
      lines.push(
        `Gold (GLD) ρ vs BTC: <strong>${corrFmtRho(gld.corr)}</strong>` +
          (gld.corr90 != null ? ` (90d ${corrFmtRho(gld.corr90)})` : "") +
          `. Near zero is common outside crisis hedges.`,
      );
    }
  }
  (data.guide || []).forEach((g) => lines.push(corrEscape(g)));
  host.innerHTML = lines.map((p) => `<p>${p}</p>`).join("");
}

function corrApply(data) {
  corrData = data;
  if (data?.matrixSamples?.default && !data.matrixSamples?.bySample?.[corrMatrixSample]) {
    corrMatrixSample = data.matrixSamples.default || "all";
  }
  const mSel = corrEl("corr-matrix-sample");
  if (mSel && mSel.value !== corrMatrixSample) mSel.value = corrMatrixSample;
  corrRenderKpis(data);
  corrRenderMatrix(data);
  corrRenderPairs(data);
  corrFillAssetSelect(data);
  corrDrawRolling(data);
  corrRenderCommentary(data);

  const screen = document.querySelector(
    '.menu-screen[data-l1="stats"][data-l2="correlation"]',
  );
  if (screen) {
    screen.querySelectorAll("[data-help-key]").forEach((el) => {
      if (!el.classList.contains("help-trigger")) el.dataset.helpDecorated = "false";
    });
    window.decorateHelpLabels?.(screen);
  }
}

function corrSetStatus({ loading, error }) {
  const loadEl = corrEl("corr-loading");
  const errEl = corrEl("corr-error");
  if (loadEl) loadEl.hidden = !loading;
  if (errEl) {
    if (error) {
      errEl.hidden = false;
      errEl.textContent = error;
    } else {
      errEl.hidden = true;
      errEl.textContent = "";
    }
  }
}

async function corrFetch(force = false) {
  if (corrLoading) return;
  if (corrData && !force) {
    corrApply(corrData);
    corrSetStatus({ loading: false, error: null });
    return;
  }
  corrLoading = true;
  corrSetStatus({ loading: true, error: null });
  try {
    const q = new URLSearchParams({ period: "max" });
    if (force) q.set("refresh", "1");
    const res = await fetch(`${CORR_API}?${q}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    corrApply(data);
    corrSetStatus({ loading: false, error: null });
  } catch (err) {
    console.error("[stats correlation]", err);
    corrSetStatus({ loading: false, error: err.message || String(err) });
    const host = corrEl("corr-commentary");
    if (host) {
      host.innerHTML = `<p class="vol-warn">Failed to load correlations: ${corrEscape(err.message)}</p>`;
    }
  } finally {
    corrLoading = false;
  }
}

function corrBind() {
  corrEl("corr-refresh")?.addEventListener("click", () => corrFetch(true));
  corrEl("corr-asset-select")?.addEventListener("change", (e) => {
    corrSelectedAsset = e.target.value;
    corrDrawRolling(corrData);
  });
  corrEl("corr-window-select")?.addEventListener("change", (e) => {
    corrWindow = e.target.value;
    corrDrawRolling(corrData);
  });
  corrEl("corr-matrix-sample")?.addEventListener("change", (e) => {
    corrMatrixSample = e.target.value || "all";
    if (!corrData) return;
    corrRenderKpis(corrData);
    corrRenderMatrix(corrData);
    corrRenderPairs(corrData);
    corrRenderCommentary(corrData);
  });
  const wSel = corrEl("corr-window-select");
  if (wSel) corrWindow = wSel.value || "365";
  const mSel = corrEl("corr-matrix-sample");
  if (mSel) corrMatrixSample = mSel.value || "all";
}

function refreshCorrelationCharts() {
  if (!corrReady) {
    corrReady = true;
    corrBind();
  }
  return corrFetch(false);
}

window.refreshCorrelationCharts = refreshCorrelationCharts;
window.initStatsCorrelation = refreshCorrelationCharts;
