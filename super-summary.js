/**
 * Super Summary — single Home-only final multi-domain report.
 * Hybrid: server fact pack + optional xAI prose; client builds charts/tables/visuals.
 */

const SS_API = "/api/ai/super-summary";
const SS_PAYWALL_API = "/api/ai/super-summary/paywall";
const SS_UNLOCK_API = "/api/ai/super-summary/unlock";
const SS_CACHE_KEY = "ss:last:v2";
const SS_TOKEN_KEY = "ss:access:v1";

/** Last rendered report payload (for PDF / chrome). */
let ssLastPayload = null;

const ssEl = (id) => document.getElementById(id);

function ssGetAccessToken() {
  try {
    const raw = localStorage.getItem(SS_TOKEN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.exp && data.exp * 1000 < Date.now()) {
      localStorage.removeItem(SS_TOKEN_KEY);
      return null;
    }
    return data?.token || null;
  } catch {
    return null;
  }
}

function ssSaveAccessToken(token, expiresAt) {
  try {
    localStorage.setItem(
      SS_TOKEN_KEY,
      JSON.stringify({ token, exp: expiresAt || 0, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

function ssClearAccessToken() {
  try {
    localStorage.removeItem(SS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function ssEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal markdown → HTML for trusted server markdown. */
function ssMarkdownToHtml(md) {
  if (!md) return "";
  const lines = String(md).split("\n");
  const out = [];
  let inList = false;
  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      out.push(`<h3 class="ss-h3">${ssInline(line.slice(3))}</h3>`);
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      out.push(`<h3 class="ss-h3">${ssInline(line.slice(2))}</h3>`);
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        out.push('<ul class="ss-list">');
        inList = true;
      }
      out.push(`<li>${ssInline(line.slice(2))}</li>`);
      continue;
    }
    flushList();
    out.push(`<p>${ssInline(line)}</p>`);
  }
  flushList();
  return out.join("\n");
}

function ssInline(s) {
  let t = ssEscape(s);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  return t;
}

function ssFmtNum(v, digits = 2) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3 && digits <= 2) {
    return n.toLocaleString("en-US", { maximumFractionDigits: digits });
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function ssFmtUsd(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function ssFmtPct(v, signed = false) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const s = signed && n > 0 ? "+" : "";
  return `${s}${n.toFixed(1)}%`;
}

function ssSaveLocal(payload) {
  try {
    localStorage.setItem(SS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function ssLoadLocal() {
  try {
    const raw = localStorage.getItem(SS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function ssFetchPaywall() {
  const res = await fetch(SS_PAYWALL_API, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Paywall ${res.status}`);
  return data;
}

async function ssFetch(force = false) {
  const token = ssGetAccessToken();
  const url = force ? `${SS_API}?refresh=1` : SS_API;
  const ctrl = new AbortController();
  // Domains (warm) + xAI narrative (~70s). Give the browser enough headroom.
  const timer = setTimeout(() => ctrl.abort(), 200000);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: !!force, unlockToken: token }),
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e?.name === "AbortError") {
      throw new Error(
        "Report generation timed out after ~2.5 minutes. " +
          "The server should fall back to rules prose if xAI is slow — restart server.py and try again.",
      );
    }
    throw e;
  }
  clearTimeout(timer);
  const data = await res.json().catch(() => ({}));
  if (data.error === "payment_required" || res.status === 402) {
    const err = new Error(data.message || "Payment required");
    err.code = "payment_required";
    err.paywall = data.paywall;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || data.message || `Super Summary ${res.status}`);
  return data;
}

/**
 * Estimated pipeline (server refreshes every domain inside one request).
 * Progress advances by elapsed time so the UI never freezes during the long call.
 * You do not need to visit other tabs first — the server pulls fresh data for all domains.
 */
const SS_PIPELINE = [
  {
    id: "access",
    label: "Checking unlock access",
    detail: "Validating your payment token",
    pctStart: 0,
    pctEnd: 3,
    estSec: 1,
  },
  {
    id: "domains",
    label: "Loading domain data (parallel)",
    detail: "Valuation, cycle, F&G, ETF, treasury, news, macro, spot",
    pctStart: 3,
    pctEnd: 50,
    estSec: 25,
  },
  {
    id: "pack",
    label: "Assembling multi-domain fact pack",
    detail: "Coverage, cycle phase, KPIs from live payloads",
    pctStart: 50,
    pctEnd: 62,
    estSec: 5,
  },
  {
    id: "narrative",
    label: "Writing desk narrative",
    detail: "xAI desk narrative (~70s max; rules only if the API call fails)",
    pctStart: 62,
    pctEnd: 96,
    estSec: 55,
  },
  {
    id: "render",
    label: "Rendering report visuals",
    detail: "KPIs, charts, and tables",
    pctStart: 96,
    pctEnd: 100,
    estSec: 2,
    clientOnly: true,
  },
];

/** Server-side stages only (used for live estimate while the POST is in flight). */
function ssServerPipeline() {
  return SS_PIPELINE.filter((s) => !s.clientOnly);
}

function ssPipelineTotalEstSec() {
  return ssServerPipeline().reduce((s, st) => s + (st.estSec || 0), 0);
}

function ssStageAtElapsed(elapsedSec) {
  const stages = ssServerPipeline();
  const totalEst = stages.reduce((s, st) => s + (st.estSec || 0), 0);
  let acc = 0;
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    const span = st.estSec || 1;
    const end = acc + span;
    const isLast = i === stages.length - 1;
    if (elapsedSec < end || isLast) {
      let pct;
      if (isLast && elapsedSec >= totalEst) {
        // Past estimate: crawl 96% → 99% so the bar never looks frozen
        const over = elapsedSec - totalEst;
        pct = Math.min(99, 96 + Math.min(3, over / 30));
      } else {
        const frac = Math.min(1, Math.max(0, (elapsedSec - acc) / span));
        pct = st.pctStart + (st.pctEnd - st.pctStart) * frac;
        pct = Math.min(pct, isLast ? 99 : st.pctEnd);
      }
      return {
        stage: st,
        pct,
        doneIds: stages.slice(0, i).map((s) => s.id),
      };
    }
    acc = end;
  }
  const last = stages[stages.length - 1];
  return { stage: last, pct: 99, doneIds: stages.slice(0, -1).map((s) => s.id) };
}

function ssRenderProgress(state) {
  const body = ssEl("ss-page-body");
  const head = ssEl("ss-page-head");
  const meta = ssEl("ss-page-meta");
  if (!body) return;

  const totalEst = ssPipelineTotalEstSec();
  const pct = Math.max(0, Math.min(100, Math.round(state.pct || 0)));
  const stage = state.stage || {};
  const elapsed = state.elapsedSec != null ? Math.round(state.elapsedSec) : 0;
  const remRaw = Math.round(totalEst - elapsed);
  const remainingLabel =
    remRaw > 0
      ? `~${remRaw}s remaining (estimate)`
      : elapsed > totalEst
        ? "taking longer than usual…"
        : "finishing up…";
  const steps = SS_PIPELINE.map((st) => {
    let cls = "ss-progress-step";
    if (st.id === stage.id) cls += " ss-progress-step--active";
    else if ((state.doneIds || []).includes(st.id)) cls += " ss-progress-step--done";
    return `<li class="${cls}"><span class="ss-progress-step-label">${ssEscape(st.label)}</span></li>`;
  }).join("");

  if (head) {
    head.innerHTML = `<span class="vc-exec-phase">Generating report</span>
      <span class="vc-confidence-pill">${pct}%</span>
      <span class="vc-confidence-pill">${remRaw > 0 ? `~${remRaw}s left` : "finishing…"}</span>`;
  }
  if (meta) {
    meta.textContent = `Est. total ~${totalEst}s · elapsed ${elapsed}s · ${stage.label || "Working"}`;
  }

  body.innerHTML = `
    <section class="panel ss-report-block ss-progress-panel">
      <div class="ss-progress-inner">
        <h3 class="ss-progress-title">Building Final Report</h3>
        <p class="ss-progress-sub">
          The server refreshes every domain used in the report first (valuation, cycle, sentiment, ETF,
          treasury, news, macro, spot), then writes the multi-domain brief.
          You do <strong>not</strong> need to open other tabs first.
          Typical total: <strong>~${totalEst} seconds</strong>
          (domains in parallel, then xAI prose with a ~40s cap — falls back to rules prose if the model is slow).
        </p>
        <div class="ss-progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Report generation progress">
          <div class="ss-progress-fill${pct < 100 ? " ss-progress-fill--pulse" : ""}" style="width:${pct}%"></div>
        </div>
        <div class="ss-progress-meta-row">
          <span class="ss-progress-pct mono">${pct}%</span>
          <span class="ss-progress-eta">${remainingLabel} · ${elapsed}s elapsed</span>
        </div>
        <p class="ss-progress-current"><strong>${ssEscape(stage.label || "Starting…")}</strong>
          ${stage.detail ? ` — ${ssEscape(stage.detail)}` : ""}</p>
        <ul class="ss-progress-steps">${steps}</ul>
        ${state.note ? `<p class="ss-progress-note">${ssEscape(state.note)}</p>` : ""}
      </div>
    </section>`;
}

function ssCopyText(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

function ssRenderPaywall(cfg, statusMsg) {
  const host = ssEl("ss-paywall");
  const unlocked = ssEl("ss-report-unlocked");
  const genBtn = ssEl("ss-page-gen");
  if (!host) return;

  host.hidden = false;
  if (unlocked) unlocked.hidden = true;
  if (genBtn) genBtn.hidden = true;

  if (!cfg) {
    host.innerHTML = `<p class="macro-muted ss-report-status">${ssEscape(statusMsg || "Loading paywall…")}</p>`;
    return;
  }

  const amount = cfg.amount ?? 1;
  const options = (cfg.options || []).filter((o) => o.available);
  const allOpts = cfg.options || [];

  let optionsHtml;
  if (!cfg.walletsReady || !options.length) {
    optionsHtml = `
      <div class="ss-pay-pending">
        <p><strong>Price:</strong> <span class="mono">${amount}</span> USDT or <span class="mono">${amount}</span> USDC</p>
        <p>Receiving wallet addresses are not configured yet. The Final Report stays locked until the owner adds USDT/USDC addresses.</p>
        <p class="ss-pay-hint">Env keys: <code>SS_PAY_USDT_ERC20</code>, <code>SS_PAY_USDC_ERC20</code>, <code>SS_PAY_USDT_TRC20</code>, <code>SS_PAY_USDC_SOLANA</code></p>
      </div>`;
  } else {
    optionsHtml = `
      <p class="ss-pay-lead">Send exactly <strong class="mono">${amount}</strong> of one of the following, then paste the transaction hash to unlock for ${cfg.accessDays || 30} days.</p>
      <div class="ss-pay-options" id="ss-pay-options">
        ${options
          .map(
            (o, i) => `
          <label class="ss-pay-option">
            <input type="radio" name="ss-pay-opt" value="${ssEscape(o.id)}" ${i === 0 ? "checked" : ""} />
            <span class="ss-pay-option-body">
              <span class="ss-pay-option-title">${ssEscape(o.asset)} · ${ssEscape(o.network)} <span class="ss-pay-std">${ssEscape(o.tokenStandard || "")}</span></span>
              <span class="ss-pay-addr mono" data-addr="${ssEscape(o.address)}">${ssEscape(o.address)}</span>
              <button type="button" class="md-btn md-btn--secondary ss-btn ss-copy-addr" data-addr="${ssEscape(o.address)}">Copy address</button>
            </span>
          </label>`,
          )
          .join("")}
      </div>
      <div class="ss-pay-form">
        <label class="ss-pay-label" for="ss-tx-hash">Transaction hash / ID</label>
        <input type="text" id="ss-tx-hash" class="ss-pay-input mono" placeholder="0x… or network tx id" autocomplete="off" spellcheck="false" />
        <button type="button" class="md-btn ss-btn" id="ss-unlock-btn">I've paid — unlock report</button>
        <p class="ss-pay-status" id="ss-pay-status" hidden></p>
      </div>`;
  }

  // Always include status nodes — previously missing when wallets were not configured,
  // so dev unlock appeared to do nothing (setStatus was a no-op).
  const devReady = !!cfg.devUnlockAvailable;
  const devHtml = `
    <details class="ss-pay-dev" id="ss-pay-dev" open>
      <summary>Developer unlock</summary>
      <p class="ss-pay-hint">
        Local testing only.
        ${
          devReady
            ? "Server has <code>SS_PAYWALL_DEV_CODE</code> configured."
            : "Server is missing <code>SS_PAYWALL_DEV_CODE</code> — add it to <code>.env.local</code> and restart <code>server.py</code>."
        }
      </p>
      <div class="ss-pay-dev-row">
        <input type="password" id="ss-dev-code" class="ss-pay-input mono" placeholder="Dev unlock code" autocomplete="off" ${devReady ? "" : "disabled"} />
        <button type="button" class="md-btn md-btn--secondary ss-btn" id="ss-dev-unlock-btn" ${devReady ? "" : "disabled"}>Unlock with dev code</button>
      </div>
      <p class="ss-pay-status" id="ss-dev-status" role="status" aria-live="polite" hidden></p>
    </details>`;

  host.innerHTML = `
    <div class="ss-paywall-inner">
      <div class="ss-paywall-badge">Paid access</div>
      <h3 class="ss-paywall-title">Unlock the Final Report</h3>
      <p class="ss-paywall-price mono"><span class="ss-paywall-amount">${amount}</span> USDT <span class="ss-paywall-or">or</span> <span class="ss-paywall-amount">${amount}</span> USDC</p>
      <p class="ss-paywall-copy">${ssEscape(cfg.message || "One-time payment unlocks this multi-domain desk report.")}</p>
      ${optionsHtml}
      ${!cfg.walletsReady || !options.length ? `<p class="ss-pay-status" id="ss-pay-status" role="status" aria-live="polite" hidden></p>` : ""}
      ${devHtml}
      ${statusMsg ? `<p class="ss-pay-status ss-pay-status--err" role="status">${ssEscape(statusMsg)}</p>` : ""}
    </div>`;

  host.querySelectorAll(".ss-copy-addr").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      ssCopyText(btn.dataset.addr);
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = "Copy address";
      }, 1200);
    });
  });

  ssEl("ss-unlock-btn")?.addEventListener("click", () => ssSubmitUnlock(false));
  ssEl("ss-dev-unlock-btn")?.addEventListener("click", () => ssSubmitUnlock(true));
  ssEl("ss-dev-code")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ssSubmitUnlock(true);
    }
  });
}

function ssSetUnlockStatus(msg, isErr, asDev) {
  const status =
    (asDev ? ssEl("ss-dev-status") : null) ||
    ssEl("ss-pay-status") ||
    ssEl("ss-dev-status");
  if (!status) {
    // Last resort: surface something so unlock never fails silently
    console.warn("[super-summary unlock]", msg);
    window.alert?.(msg);
    return;
  }
  status.hidden = false;
  status.textContent = msg;
  status.classList.toggle("ss-pay-status--err", !!isErr);
  status.classList.toggle("ss-pay-status--ok", !isErr);
  status.classList.toggle("ss-pay-status--busy", !isErr && /verif|unlock|building|loading/i.test(msg));
}

async function ssSubmitUnlock(asDev) {
  const btn = asDev ? ssEl("ss-dev-unlock-btn") : ssEl("ss-unlock-btn");
  if (btn?.disabled && asDev) {
    ssSetUnlockStatus(
      "Developer unlock is not configured on the server. Set SS_PAYWALL_DEV_CODE in .env.local and restart.",
      true,
      true,
    );
    return;
  }

  const prevLabel = btn?.textContent;
  try {
    let body;
    if (asDev) {
      const code = ssEl("ss-dev-code")?.value?.trim();
      if (!code) {
        ssSetUnlockStatus("Enter the developer unlock code.", true, true);
        ssEl("ss-dev-code")?.focus();
        return;
      }
      body = { optionId: "dev", txHash: "dev", devCode: code };
    } else {
      const opt = document.querySelector('input[name="ss-pay-opt"]:checked')?.value;
      const tx = ssEl("ss-tx-hash")?.value?.trim();
      if (!opt || !tx) {
        ssSetUnlockStatus("Select a payment option and paste the transaction hash.", true, false);
        return;
      }
      body = { optionId: opt, txHash: tx };
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = asDev ? "Checking code…" : "Verifying…";
    }
    ssSetUnlockStatus(asDev ? "Checking developer code…" : "Verifying payment…", false, asDev);

    const res = await fetch(SS_UNLOCK_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      ssSetUnlockStatus(
        data.message || data.error || `Unlock failed (HTTP ${res.status})`,
        true,
        asDev,
      );
      return;
    }
    ssSaveAccessToken(data.token, data.expiresAt);
    ssSetUnlockStatus(
      data.message || "Unlocked. Press Generate / Regenerate to build the report.",
      false,
      asDev,
    );
    // Do not auto-generate — user asked for an explicit Generate press
    ssShowUnlockedUi();
    ssRenderIdlePrompt({
      reason: "Payment / developer unlock succeeded. Click Generate when you are ready.",
    });
  } catch (err) {
    ssSetUnlockStatus(err.message || "Unlock failed — is server.py running?", true, asDev);
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
  }
}

function ssShowLockedUi(statusMsg) {
  const host = ssEl("ss-paywall");
  const unlocked = ssEl("ss-report-unlocked");
  const genBtn = ssEl("ss-page-gen");
  const body = ssEl("ss-page-body");
  const head = ssEl("ss-page-head");
  if (unlocked) unlocked.hidden = true;
  if (genBtn) genBtn.hidden = true;
  ssSetPdfButtonVisible(false);
  ssLastPayload = null;
  if (body) body.innerHTML = "";
  if (head) head.innerHTML = "";
  if (host) {
    host.hidden = false;
    if (statusMsg) {
      host.innerHTML = `<p class="macro-muted ss-report-status">${ssEscape(statusMsg)}</p>`;
    }
  }
}

function ssShowUnlockedUi() {
  const host = ssEl("ss-paywall");
  const unlocked = ssEl("ss-report-unlocked");
  const genBtn = ssEl("ss-page-gen");
  if (host) host.hidden = true;
  if (unlocked) unlocked.hidden = false;
  if (genBtn) genBtn.hidden = false;
  // PDF only after a report exists (ssRenderFullPage enables it)
  if (!ssLastPayload) ssSetPdfButtonVisible(false);
}

/** Idle state after unlock: report shell visible, no auto-fetch. */
function ssRenderIdlePrompt(opts = {}) {
  const body = ssEl("ss-page-body");
  const head = ssEl("ss-page-head");
  const meta = ssEl("ss-page-meta");
  if (meta) meta.textContent = "Unlocked · press Generate to build the report";
  if (head) {
    head.innerHTML = `<span class="vc-exec-phase">Ready</span>
      <span class="vc-confidence-pill">Access granted</span>
      <button type="button" class="md-btn md-btn--secondary ss-btn ss-lock-btn" id="ss-lock-btn">Lock again</button>`;
    ssEl("ss-lock-btn")?.addEventListener("click", () => ssLockAgain());
  }
  if (body) {
    const reason = opts.reason
      ? `<p class="ss-progress-note">${ssEscape(opts.reason)}</p>`
      : "";
    body.innerHTML = `
      <section class="panel ss-report-block ss-idle-panel">
        <div class="ss-progress-inner">
          <h3 class="ss-progress-title">Final Report unlocked</h3>
          <p class="ss-progress-sub">
            Access is active. The multi-domain brief is <strong>not</strong> built until you press
            <strong>Generate / Regenerate</strong> — so landing on Home never burns API time.
          </p>
          <p class="ss-progress-current">
            When you generate, the server loads valuation, cycle, ETF, treasury, sentiment, macro, spot, and news,
            then writes the desk narrative (xAI when available).
          </p>
          <button type="button" class="md-btn ss-btn" id="ss-idle-gen">Generate report now</button>
          ${reason}
        </div>
      </section>`;
    ssEl("ss-idle-gen")?.addEventListener("click", () => ssGenerate(true));
  }
}

async function ssLockAgain() {
  ssClearAccessToken();
  ssLastPayload = null;
  ssSetPdfButtonVisible(false);
  try {
    localStorage.removeItem(SS_CACHE_KEY);
    localStorage.removeItem("ss:last:v1");
  } catch {
    /* ignore */
  }
  ssStopProgressTicker();
  ssBusy = false;
  try {
    const cfg = await ssFetchPaywall();
    ssRenderPaywall(cfg);
  } catch (err) {
    ssRenderPaywall(null, err.message || "Could not load paywall");
  }
}

function ssDomainPresence(pack) {
  const d = pack?.domains || {};
  const keys = [
    ["valuation", "Valuation"],
    ["cycle", "4y Cycle"],
    ["sentiment", "Sentiment"],
    ["etf", "ETF"],
    ["treasury", "Treasury"],
    ["macro", "Macro"],
    ["news", "News"],
    ["spot", "Spot"],
    ["price", "Price hist."],
  ];
  return keys.map(([k, label]) => ({
    key: k,
    label,
    present: !!(d[k] && (typeof d[k] !== "object" || Object.keys(d[k]).length)),
  }));
}

function ssKpiCardsHtml(payload) {
  const pack = payload.factPack || {};
  const d = pack.domains || {};
  const cycle = d.cycle || payload.cycle || {};
  const val = (d.valuation || {}).cells || {};
  const sent = d.sentiment || {};
  const etf = d.etf || {};
  const spot = d.spot || {};

  const cards = [
    {
      label: "Spot",
      value: spot.price != null ? ssFmtUsd(spot.price) : cycle.spot != null ? ssFmtUsd(cycle.spot) : "—",
      sub: spot.change24hPct != null ? `${ssFmtPct(spot.change24hPct, true)} 24h` : "Reference",
    },
    {
      label: "Cycle phase",
      value: payload.phase || cycle.phase || "—",
      sub:
        cycle.drawdownFromAthPct != null
          ? `${ssFmtPct(-Math.abs(cycle.drawdownFromAthPct), true)} from ATH`
          : "4y structure",
    },
    {
      label: "Days since peak",
      value: cycle.daysSincePeak != null ? String(cycle.daysSincePeak) : "—",
      sub: cycle.daysSinceHalving != null ? `${cycle.daysSinceHalving}d since halvings` : "C4 clock",
    },
    {
      label: "MVRV Z",
      value: val.mvrv_z_score?.value != null ? Number(val.mvrv_z_score.value).toFixed(2) : "—",
      sub: "Valuation heat",
    },
    {
      label: "Fear & Greed",
      value:
        sent.fearGreed != null
          ? String(Math.round(sent.fearGreed))
          : val.fear_greed?.value != null
            ? String(Math.round(val.fear_greed.value))
            : "—",
      sub: sent.classification || "Sentiment",
    },
    {
      label: "ETF BTC",
      value: etf.totalBtc != null ? ssFmtNum(etf.totalBtc, 0) : "—",
      sub: etf.latestNetFlow != null ? `Flow ${ssFmtNum(etf.latestNetFlow, 0)}` : "US spot holdings",
    },
  ];

  return `
    <div class="ss-kpi-strip">
      ${cards
        .map(
          (c) => `
        <article class="ss-kpi-card">
          <span class="ss-kpi-label">${ssEscape(c.label)}</span>
          <span class="ss-kpi-value mono">${ssEscape(c.value)}</span>
          <span class="ss-kpi-sub">${ssEscape(c.sub)}</span>
        </article>`,
        )
        .join("")}
    </div>`;
}

function ssValuationTableHtml(payload) {
  const cells = ((payload.factPack || {}).domains || {}).valuation?.cells || {};
  const keys = [
    ["mvrv", "MVRV"],
    ["mvrv_z_score", "MVRV Z"],
    ["nupl", "NUPL"],
    ["sopr", "SOPR"],
    ["supply_in_profit", "Supply in profit"],
    ["puell_multiple", "Puell"],
    ["realized_price", "Realized price"],
    ["fear_greed", "Fear & Greed"],
  ];
  const rows = keys
    .map(([k, label]) => {
      const c = cells[k];
      if (!c || c.value == null) return null;
      const stale = c.stale ? ' class="ss-td-stale"' : "";
      return `<tr${stale}>
        <td>${ssEscape(label)}</td>
        <td class="mono">${ssEscape(String(c.value))}</td>
        <td>${ssEscape(c.source || "—")}</td>
        <td class="mono">${ssEscape((c.dataAsOf || c.fetchedAt || "—").toString().slice(0, 16))}</td>
      </tr>`;
    })
    .filter(Boolean)
    .join("");

  if (!rows) {
    return `<p class="macro-muted">Valuation snapshot cells unavailable in this fact pack.</p>`;
  }
  return `
    <div class="deriv-table-wrap md-table-wrap ss-table-wrap">
      <table class="deriv-table md-table ss-table">
        <thead><tr><th>Metric</th><th>Value</th><th>Source</th><th>As of</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function ssNewsTableHtml(payload) {
  const items = ((payload.factPack || {}).domains || {}).news?.headlines || [];
  if (!items.length) {
    return `<p class="macro-muted">No news headlines in the current fact pack.</p>`;
  }
  const rows = items
    .slice(0, 8)
    .map(
      (it) => `<tr>
        <td>${ssEscape(it.title || "—")}</td>
        <td>${ssEscape(it.source || "—")}</td>
        <td>${ssEscape(it.sentiment || "—")}</td>
      </tr>`,
    )
    .join("");
  return `
    <div class="deriv-table-wrap md-table-wrap ss-table-wrap">
      <table class="deriv-table md-table ss-table">
        <thead><tr><th>Headline</th><th>Source</th><th>Tone</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function ssFearGreedBarHtml(payload) {
  const sent = ((payload.factPack || {}).domains || {}).sentiment || {};
  const valCells = ((payload.factPack || {}).domains || {}).valuation?.cells || {};
  const v =
    sent.fearGreed != null
      ? Number(sent.fearGreed)
      : valCells.fear_greed?.value != null
        ? Number(valCells.fear_greed.value)
        : null;
  if (v == null || !Number.isFinite(v)) {
    return `<p class="macro-muted">Fear &amp; Greed unavailable.</p>`;
  }
  const pct = Math.max(0, Math.min(100, v));
  const label =
    sent.classification ||
    (pct >= 75
      ? "Extreme Greed"
      : pct >= 56
        ? "Greed"
        : pct <= 24
          ? "Extreme Fear"
          : pct <= 44
            ? "Fear"
            : "Neutral");
  return `
    <div class="ss-fng-visual">
      <div class="ss-fng-scale">
        <span>Fear</span><span>Neutral</span><span>Greed</span>
      </div>
      <div class="ss-fng-track" role="img" aria-label="Fear and Greed ${pct}">
        <div class="ss-fng-marker" style="left:${pct}%"></div>
      </div>
      <p class="ss-fng-readout mono"><strong>${Math.round(pct)}</strong> · ${ssEscape(label)}</p>
    </div>`;
}

const SS_PLOTLY_LAYOUT = {
  template: "plotly_dark",
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(255,255,255,0.02)",
  font: { family: "IBM Plex Sans, system-ui, sans-serif", color: "#94a3b8", size: 11 },
  margin: { l: 52, r: 18, t: 28, b: 48 },
  showlegend: false,
};

function ssPlotlyBase(height = 280) {
  return {
    ...SS_PLOTLY_LAYOUT,
    height,
    yaxis: { gridcolor: "rgba(148,163,184,0.12)", tickfont: { size: 10, color: "#64748b" } },
    xaxis: { gridcolor: "rgba(148,163,184,0.08)", tickfont: { size: 10, color: "#94a3b8" } },
  };
}

function ssDrawCoverageChart(el, payload) {
  if (!el || !window.Plotly) {
    if (el) el.innerHTML = "";
    return;
  }
  const rows = ssDomainPresence(payload.factPack || {});
  const colors = rows.map((r) => (r.present ? "#34d399" : "#475569"));
  Plotly.react(
    el,
    [
      {
        type: "bar",
        orientation: "h",
        y: rows.map((r) => r.label),
        x: rows.map((r) => (r.present ? 1 : 0.15)),
        marker: { color: colors },
        hovertemplate: "%{y}: %{customdata}<extra></extra>",
        customdata: rows.map((r) => (r.present ? "In pack" : "Missing")),
        text: rows.map((r) => (r.present ? "✓" : "—")),
        textposition: "inside",
      },
    ],
    {
      ...ssPlotlyBase(280),
      margin: { l: 96, r: 16, t: 12, b: 28 },
      xaxis: { visible: false, range: [0, 1.15] },
      yaxis: { automargin: true, tickfont: { size: 11, color: "#94a3b8" } },
    },
    { displayModeBar: false, responsive: true },
  );
}

function ssDrawCycleBars(el, payload) {
  if (!el || !window.Plotly) return;
  const cycle = ((payload.factPack || {}).domains || {}).cycle || payload.cycle || {};
  if (!cycle || cycle.available === false) {
    el.innerHTML = `<p class="macro-muted">Cycle metrics unavailable.</p>`;
    return;
  }
  const labels = ["Days since peak", "Days since halvings", "Drawdown from ATH %"];
  const values = [
    Number(cycle.daysSincePeak) || 0,
    Number(cycle.daysSinceHalving) || 0,
    Math.abs(Number(cycle.drawdownFromAthPct) || 0),
  ];
  Plotly.react(
    el,
    [
      {
        type: "bar",
        x: labels,
        y: values,
        marker: { color: ["#f59e0b", "#38bdf8", "#f472b6"] },
        hovertemplate: "%{x}: %{y:.1f}<extra></extra>",
      },
    ],
    { ...ssPlotlyBase(280), margin: { l: 48, r: 16, t: 12, b: 72 } },
    { displayModeBar: false, responsive: true },
  );
}

function ssDrawValuationBars(el, payload) {
  if (!el || !window.Plotly) return;
  const cells = ((payload.factPack || {}).domains || {}).valuation?.cells || {};
  const specs = [
    { k: "mvrv_z_score", label: "MVRV Z", color: "#f59e0b" },
    { k: "nupl", label: "NUPL", color: "#38bdf8" },
    { k: "mvrv", label: "MVRV", color: "#a78bfa" },
    { k: "puell_multiple", label: "Puell", color: "#34d399" },
    { k: "sopr", label: "SOPR", color: "#f472b6" },
  ];
  const labels = [];
  const values = [];
  const colors = [];
  for (const s of specs) {
    const v = cells[s.k]?.value;
    if (v == null || !Number.isFinite(Number(v))) continue;
    labels.push(s.label);
    values.push(Number(v));
    colors.push(s.color);
  }
  if (!labels.length) {
    el.innerHTML = `<p class="macro-muted">Valuation chart unavailable.</p>`;
    return;
  }
  Plotly.react(
    el,
    [
      {
        type: "bar",
        x: labels,
        y: values,
        marker: { color: colors },
        hovertemplate: "%{x}: %{y:.3f}<extra></extra>",
      },
    ],
    {
      ...ssPlotlyBase(300),
      title: { text: "On-chain valuation prints", font: { size: 12, color: "#cbd5e1" } },
    },
    { displayModeBar: false, responsive: true },
  );
}

function ssDrawCycleProgress(el, payload) {
  if (!el || !window.Plotly) return;
  const cycle = ((payload.factPack || {}).domains || {}).cycle || {};
  const prog = Number(cycle.peakToBottomProgressPct);
  if (!Number.isFinite(prog)) {
    el.innerHTML = `<p class="macro-muted">Peak→bottom progress unavailable.</p>`;
    return;
  }
  const p = Math.max(0, Math.min(100, prog));
  Plotly.react(
    el,
    [
      {
        type: "indicator",
        mode: "gauge+number",
        value: p,
        number: { suffix: "%", font: { size: 28, color: "#f8fafc" } },
        title: { text: "Peak→bottom progress (hist. avg)", font: { size: 12, color: "#94a3b8" } },
        gauge: {
          axis: { range: [0, 100], tickcolor: "#64748b" },
          bar: { color: "#f59e0b" },
          bgcolor: "rgba(15,23,42,0.4)",
          borderwidth: 0,
          steps: [
            { range: [0, 33], color: "rgba(52,211,153,0.15)" },
            { range: [33, 66], color: "rgba(245,158,11,0.12)" },
            { range: [66, 100], color: "rgba(248,113,113,0.12)" },
          ],
        },
      },
    ],
    {
      ...ssPlotlyBase(260),
      margin: { l: 28, r: 28, t: 48, b: 12 },
    },
    { displayModeBar: false, responsive: true },
  );
}

function ssFlowsTableHtml(payload) {
  const d = (payload.factPack || {}).domains || {};
  const etf = d.etf || {};
  const trs = d.treasury || {};
  const val = (d.valuation || {}).cells || {};
  const rows = [
    ["ETF total BTC", etf.totalBtc != null ? ssFmtNum(etf.totalBtc, 0) : "—", "US spot holdings"],
    ["ETF AUM", etf.totalAum != null ? ssFmtUsd(etf.totalAum) : "—", "Aggregate AUM"],
    ["Latest ETF net flow", etf.latestNetFlow != null ? String(etf.latestNetFlow) : "—", "Most recent print"],
    ["Treasury BTC", trs.totalBtc != null ? ssFmtNum(trs.totalBtc, 0) : "—", "Corporate tracker"],
    ["Treasury names", trs.companyCount != null ? String(trs.companyCount) : "—", "Count in pack"],
    ["Funding rate", val.funding_rate?.value != null ? String(val.funding_rate.value) : "—", "Perps tilt"],
    ["Open interest", val.open_interest?.value != null ? ssFmtNum(val.open_interest.value, 0) : "—", "Derivatives size"],
    ["Exchange netflow", val.exchange_netflow?.value != null ? String(val.exchange_netflow.value) : "—", "On-chain inventory"],
  ];
  return `
    <div class="deriv-table-wrap md-table-wrap ss-table-wrap">
      <table class="deriv-table md-table ss-table">
        <thead><tr><th>Flow / positioning</th><th>Value</th><th>Note</th></tr></thead>
        <tbody>
          ${rows
            .map(
              ([a, b, c]) =>
                `<tr><td>${ssEscape(a)}</td><td class="mono">${ssEscape(b)}</td><td>${ssEscape(c)}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function ssCycleTableHtml(payload) {
  const cycle = ((payload.factPack || {}).domains || {}).cycle || payload.cycle || {};
  if (!cycle || cycle.available === false) {
    return `<p class="macro-muted">Cycle table unavailable.</p>`;
  }
  const rows = [
    ["Phase", cycle.phase || payload.phase || "—"],
    ["Spot (pack)", cycle.spot != null ? ssFmtUsd(cycle.spot) : "—"],
    ["Cycle ATH", cycle.cycleAthPrice != null ? ssFmtUsd(cycle.cycleAthPrice) : "—"],
    ["Drawdown from ATH", cycle.drawdownFromAthPct != null ? `${cycle.drawdownFromAthPct}%` : "—"],
    ["Days since peak", cycle.daysSincePeak != null ? String(cycle.daysSincePeak) : "—"],
    ["Days since halvings", cycle.daysSinceHalving != null ? String(cycle.daysSinceHalving) : "—"],
    [
      "Peak→bottom progress",
      cycle.peakToBottomProgressPct != null
        ? `${cycle.peakToBottomProgressPct}% of ~${cycle.avgPeakToBottomDays || "n/a"}d avg`
        : "—",
    ],
  ];
  return `
    <div class="deriv-table-wrap md-table-wrap ss-table-wrap">
      <table class="deriv-table md-table ss-table">
        <thead><tr><th>Cycle metric</th><th>Value</th></tr></thead>
        <tbody>
          ${rows
            .map(([a, b]) => `<tr><td>${ssEscape(a)}</td><td class="mono">${ssEscape(b)}</td></tr>`)
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function ssMacroTableHtml(payload) {
  const macro = ((payload.factPack || {}).domains || {}).macro || {};
  const heroes = Array.isArray(macro.heroes) ? macro.heroes : [];
  const rows = [];
  if (macro.regime) rows.push(["Regime", String(macro.regime)]);
  if (macro.riskScore != null) rows.push(["Risk score", String(macro.riskScore)]);
  for (const k of ["dxy", "us10y", "vix", "m2", "fedFunds", "liquidity"]) {
    if (macro[k] != null) rows.push([k.toUpperCase(), String(macro[k])]);
  }
  for (const h of heroes.slice(0, 6)) {
    if (h && (h.name || h.value != null)) {
      rows.push([String(h.name || "Metric"), String(h.value ?? "—") + (h.sub ? ` · ${h.sub}` : "")]);
    }
  }
  if (!rows.length) {
    return `<p class="macro-muted">Macro snapshot thin in this pack.</p>`;
  }
  return `
    <div class="deriv-table-wrap md-table-wrap ss-table-wrap">
      <table class="deriv-table md-table ss-table">
        <thead><tr><th>Macro</th><th>Print</th></tr></thead>
        <tbody>
          ${rows
            .map(([a, b]) => `<tr><td>${ssEscape(a)}</td><td class="mono">${ssEscape(b)}</td></tr>`)
            .join("")}
        </tbody>
      </table>
    </div>`;
}

/** Split narrative markdown into ## sections for interleaving with exhibits. */
function ssSplitNarrative(md) {
  const text = String(md || "").trim();
  if (!text) return [];
  const parts = text.split(/\n(?=##\s+)/);
  return parts
    .map((block) => {
      const lines = block.trim().split("\n");
      const first = lines[0] || "";
      const m = first.match(/^##\s+(.+)/);
      if (m) {
        return { title: m[1].trim(), body: lines.slice(1).join("\n").trim() };
      }
      return { title: "Overview", body: block.trim() };
    })
    .filter((s) => s.body || s.title);
}

function ssSectionKey(title) {
  const t = String(title || "").toLowerCase();
  if (/executive|overview|brief/.test(t)) return "exec";
  if (/cycle/.test(t)) return "cycle";
  if (/valuation|market structure|on-chain/.test(t)) return "valuation";
  if (/flow|etf|position|treasury|deriv/.test(t)) return "flows";
  if (/macro|news/.test(t)) return "macro";
  if (/outlook|price/.test(t)) return "outlook";
  if (/risk|invalid/.test(t)) return "risks";
  if (/watch/.test(t)) return "watch";
  return "other";
}

function ssExhibitForSection(key, payload) {
  switch (key) {
    case "cycle":
      return `
        <div class="ss-exhibit">
          <p class="ss-exhibit-label">Exhibit · Cycle clocks &amp; peak→bottom progress</p>
          <div class="ss-report-grid ss-report-grid--2">
            <div id="ss-chart-cycle" class="ss-plotly"></div>
            <div id="ss-chart-cycle-gauge" class="ss-plotly"></div>
          </div>
          ${ssCycleTableHtml(payload)}
        </div>`;
    case "valuation":
      return `
        <div class="ss-exhibit">
          <p class="ss-exhibit-label">Exhibit · Valuation prints (fact pack)</p>
          <div id="ss-chart-valuation" class="ss-plotly"></div>
          ${ssValuationTableHtml(payload)}
        </div>`;
    case "flows":
      return `
        <div class="ss-exhibit">
          <p class="ss-exhibit-label">Exhibit · Flows &amp; positioning table</p>
          ${ssFlowsTableHtml(payload)}
        </div>`;
    case "macro":
      return `
        <div class="ss-exhibit">
          <p class="ss-exhibit-label">Exhibit · Macro snapshot &amp; news tape</p>
          <div class="ss-report-grid ss-report-grid--2">
            <div>${ssMacroTableHtml(payload)}</div>
            <div>
              <div class="ss-report-pad">${ssFearGreedBarHtml(payload)}</div>
              ${ssNewsTableHtml(payload)}
            </div>
          </div>
        </div>`;
    case "exec":
      return `
        <div class="ss-exhibit">
          <p class="ss-exhibit-label">Exhibit · Domain coverage (what fed this report)</p>
          <div id="ss-chart-coverage" class="ss-plotly"></div>
        </div>`;
    default:
      return "";
  }
}

function ssSynthBannerHtml(payload) {
  const llmErr = String(payload.llmError || "");
  const llmBilling =
    /permission-denied|spending limit|used all available credits|purchase more credits|insufficient.?credit/i.test(
      llmErr,
    );
  const llmTimeout = /timed out|timeout/i.test(llmErr);
  let rulesExplain;
  if (!payload.llmConfigured) {
    rulesExplain =
      " — <code>XAI_API_KEY</code> is not visible to this server process. Restart <code>server.py</code> after setting it.";
  } else if (llmBilling) {
    rulesExplain =
      " — <strong>xAI billing block</strong>: credits or spending limit. Fix at " +
      '<a href="https://console.x.ai" target="_blank" rel="noopener">console.x.ai</a>, then regenerate.';
  } else if (llmTimeout) {
    rulesExplain = ` — xAI timed out${llmErr ? ` (<code>${ssEscape(llmErr)}</code>)` : ""}.`;
  } else if (llmErr) {
    rulesExplain = ` — chat call failed: <code>${ssEscape(llmErr)}</code>`;
  } else {
    rulesExplain = ".";
  }
  if (payload.usedLlm) {
    return `<div class="ss-synth-banner ss-synth-banner--ok">
      <strong>Client report narrative:</strong> xAI hybrid
      (${ssEscape(payload.model || "grok")}${
        payload.usage?.totalTokens ? ` · ~${ssEscape(String(payload.usage.totalTokens))} tokens` : ""
      }). Charts/tables below are computed from the same fact pack.
    </div>`;
  }
  return `<div class="ss-synth-banner ss-synth-banner--warn">
    <strong>Client report narrative:</strong> rules engine${rulesExplain}
  </div>`;
}

function ssSetPdfButtonVisible(on) {
  const btn = ssEl("ss-page-pdf");
  if (btn) btn.hidden = !on;
}

function ssBindReportChrome(payload) {
  const head = ssEl("ss-page-head");
  const meta = ssEl("ss-page-meta");
  const confClass = String(payload.confidenceLabel || "low")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-");
  const mode = payload.usedLlm
    ? `Client report · ${payload.model || "xAI"}`
    : payload.llmConfigured
      ? "Client report · rules (LLM failed)"
      : "Client report · rules (no XAI key)";
  if (head) {
    head.innerHTML = `
      <span class="vc-exec-phase">Phase · ${ssEscape(payload.phase || "—")}</span>
      <span class="vc-confidence-pill vc-confidence-pill--${confClass}">
        Confidence ${ssEscape(payload.confidenceLabel || "—")} (${ssEscape(String(payload.confidence ?? "—"))}/100)
      </span>
      <span class="vc-confidence-pill">Coverage ${ssEscape(String(payload.coveragePct ?? "—"))}%</span>
      <span class="vc-confidence-pill">${ssEscape(mode)}</span>
      <button type="button" class="md-btn md-btn--secondary ss-btn" id="ss-dl-pdf-inline">Download PDF</button>
      <button type="button" class="md-btn md-btn--secondary ss-btn ss-lock-btn" id="ss-lock-btn">Lock again</button>
    `;
    ssEl("ss-lock-btn")?.addEventListener("click", () => ssLockAgain());
    ssEl("ss-dl-pdf-inline")?.addEventListener("click", () => ssDownloadPdf());
  }
  if (meta) {
    const t = payload.timing || {};
    meta.textContent = [
      payload.generatedAt ? new Date(payload.generatedAt).toLocaleString() : "",
      payload.fromCache ? "cached" : "fresh",
      payload.usedLlm ? `xAI · ${payload.model || "ok"}` : "rules narrative",
      t.totalSec != null ? `${t.totalSec}s` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  ssSetPdfButtonVisible(true);
  const pdfToolbar = ssEl("ss-page-pdf");
  if (pdfToolbar && !pdfToolbar.dataset.bound) {
    pdfToolbar.dataset.bound = "true";
    pdfToolbar.addEventListener("click", () => ssDownloadPdf());
  }
}

function ssDrawAllExhibits(payload) {
  ssDrawCoverageChart(ssEl("ss-chart-coverage"), payload);
  ssDrawCycleBars(ssEl("ss-chart-cycle"), payload);
  ssDrawCycleProgress(ssEl("ss-chart-cycle-gauge"), payload);
  ssDrawValuationBars(ssEl("ss-chart-valuation"), payload);
}

function ssRenderFullPage(payload, statusMsg) {
  const body = ssEl("ss-page-body");
  if (!body) return;

  if (statusMsg && !payload) {
    body.innerHTML = `<p class="macro-muted ss-report-status">${ssEscape(statusMsg)}</p>`;
    ssSetPdfButtonVisible(false);
    ssLastPayload = null;
    return;
  }

  if (!payload) {
    body.innerHTML = `<p class="macro-muted ss-report-status">Click Generate / Regenerate to build the final multi-domain report.</p>`;
    ssSetPdfButtonVisible(false);
    ssLastPayload = null;
    return;
  }

  ssLastPayload = payload;
  ssBindReportChrome(payload);

  const pack = payload.factPack || {};
  const sources = (pack.sources || payload.sources || []).join(" · ") || "multi-source fact pack";
  const stale =
    payload.staleFlags?.length > 0
      ? `<p class="ss-stale-note"><strong>Data quality:</strong> ${ssEscape(payload.staleFlags.slice(0, 12).join(", "))}${payload.staleFlags.length > 12 ? "…" : ""}</p>`
      : "";
  const asOf = pack.asOf || payload.generatedAt || "";
  const sections = ssSplitNarrative(payload.markdown);
  const usedKeys = new Set();
  let narrativeBlocks = "";
  for (const sec of sections) {
    const key = ssSectionKey(sec.title);
    const exhibit = !usedKeys.has(key) ? ssExhibitForSection(key, payload) : "";
    if (exhibit) usedKeys.add(key);
    narrativeBlocks += `
      <section class="panel ss-report-block ss-client-section" data-ss-section="${ssEscape(key)}">
        <div class="panel-header">
          <h2>${ssEscape(sec.title)}</h2>
          <span class="panel-meta">Narrative + supporting exhibits</span>
        </div>
        <div class="ss-markdown stats-commentary ss-client-prose">${ssMarkdownToHtml(sec.body)}</div>
        ${exhibit}
      </section>`;
  }
  // Orphan exhibits if narrative headings differed
  for (const key of ["exec", "cycle", "valuation", "flows", "macro"]) {
    if (usedKeys.has(key)) continue;
    const exhibit = ssExhibitForSection(key, payload);
    if (!exhibit) continue;
    usedKeys.add(key);
    narrativeBlocks += `
      <section class="panel ss-report-block ss-client-section">
        <div class="panel-header"><h2>Supporting exhibits</h2><span class="panel-meta">${ssEscape(key)}</span></div>
        ${exhibit}
      </section>`;
  }

  body.innerHTML = `
    <div id="ss-report-print-root" class="ss-client-report">
      <header class="panel ss-report-block ss-client-cover ss-bucc-banner">
        <div class="ss-bucc-banner-scrim" aria-hidden="true"></div>
        <div class="ss-bucc-banner-body">
          <div class="ss-bucc-crest" aria-hidden="true">${ssBuccaneersCrestSvg(56)}</div>
          <div class="ss-bucc-copy">
            <p class="ss-bucc-eyebrow">The Buccaneers · Command deck · Final multi-domain report</p>
            <h1 class="ss-client-title ss-bucc-title">Bitcoin Client Report</h1>
            <p class="ss-client-sub ss-bucc-lead">
              Institutional-style synthesis across valuation, 4y cycle, ETF/treasury flows, sentiment, macro, spot, and news.
              As of <strong class="mono">${ssEscape(String(asOf).replace("T", " ").slice(0, 19))} UTC</strong>
              · Confidence <strong>${ssEscape(payload.confidenceLabel || "—")}</strong>
              · Coverage <strong>${ssEscape(String(payload.coveragePct ?? "—"))}%</strong>
            </p>
            <ul class="ss-bucc-chips" aria-hidden="true">
              <li class="ss-bucc-chip"><span class="ss-bucc-chip-val">Live</span><span class="ss-bucc-chip-lbl">Fact pack</span></li>
              <li class="ss-bucc-chip"><span class="ss-bucc-chip-val">${ssEscape(String(payload.coveragePct ?? "—"))}%</span><span class="ss-bucc-chip-lbl">Coverage</span></li>
              <li class="ss-bucc-chip"><span class="ss-bucc-chip-val">${ssEscape(payload.usedLlm ? "xAI" : "Rules")}</span><span class="ss-bucc-chip-lbl">Narrative</span></li>
              <li class="ss-bucc-chip"><span class="ss-bucc-chip-val">${ssEscape(payload.confidenceLabel || "—")}</span><span class="ss-bucc-chip-lbl">Confidence</span></li>
            </ul>
          </div>
        </div>
        ${ssSynthBannerHtml(payload)}
        <div class="ss-client-actions no-print">
          <button type="button" class="md-btn ss-btn" id="ss-dl-pdf-main">Download PDF</button>
          <button type="button" class="md-btn md-btn--secondary ss-btn" id="ss-regen-inline">Regenerate</button>
        </div>
      </header>

      <section class="panel ss-report-block">
        <div class="panel-header"><h2>1 · Dashboard strip</h2><span class="panel-meta">Key levels from the fact pack</span></div>
        ${ssKpiCardsHtml(payload)}
      </section>

      ${narrativeBlocks}

      <section class="panel ss-report-block">
        <div class="panel-header"><h2>Appendix · Sources &amp; method</h2><span class="panel-meta">Transparency</span></div>
        <p class="ss-sources-line">${ssEscape(sources)}</p>
        ${stale}
        <p class="ss-report-footer">
          Educational client report for research — not financial advice or a solicitation.
          Numbers are taken from dashboard domain payloads at generation time; charts and tables are rendered from the same fact pack as the narrative.
          Prefer multi-week evidence over single-session noise.
        </p>
      </section>
    </div>
  `;

  ssEl("ss-dl-pdf-main")?.addEventListener("click", () => ssDownloadPdf());
  ssEl("ss-regen-inline")?.addEventListener("click", () => ssGenerate(true));

  requestAnimationFrame(() => {
    ssDrawAllExhibits(payload);
  });
}

function ssLoadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.html2pdf) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function ssBuccaneersCrestSvg(size = 48) {
  return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" style="display:block;color:#b1b3b3;filter:drop-shadow(0 0 10px rgba(213,10,10,0.45))">
    <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
    <circle cx="40" cy="40" r="28" fill="rgba(213,10,10,0.12)" stroke="currentColor" stroke-width="1"/>
    <path d="M40 14 L44 36 L40 32 L36 36 Z" fill="currentColor"/>
    <path d="M40 66 L36 44 L40 48 L44 44 Z" fill="currentColor" opacity="0.35"/>
    <path d="M14 40 L36 36 L32 40 L36 44 Z" fill="currentColor" opacity="0.55"/>
    <path d="M66 40 L44 44 L48 40 L44 36 Z" fill="currentColor" opacity="0.55"/>
    <circle cx="40" cy="40" r="4" fill="currentColor"/>
  </svg>`;
}

/** Capture live Plotly charts as PNG data URLs for PDF embedding. */
async function ssCaptureReportCharts() {
  const ids = [
    "ss-chart-coverage",
    "ss-chart-cycle",
    "ss-chart-cycle-gauge",
    "ss-chart-valuation",
  ];
  const out = {};
  if (!window.Plotly) return out;
  for (const id of ids) {
    const host = document.getElementById(id);
    if (!host) continue;
    const plot =
      host.classList?.contains("js-plotly-plot") && host.data
        ? host
        : host.querySelector?.(".js-plotly-plot") || host;
    if (!plot?.data) continue;
    try {
      out[id] = await Plotly.toImage(plot, {
        format: "png",
        width: 720,
        height: id.includes("gauge") ? 260 : 300,
        scale: 2,
      });
    } catch (e) {
      console.warn("[ss pdf chart]", id, e);
    }
  }
  return out;
}

function ssWaitForImages(root) {
  const imgs = [...(root.querySelectorAll("img") || [])];
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 4000);
        }),
    ),
  );
}

/** PDF content width in px — fits A4 content column with safe chrome gutters. */
const SS_PDF_WIDTH_PX = 680;
const SS_PDF_BG = { r: 11, g: 14, b: 17 }; // #0b0e11

/**
 * Elegant Buccaneers-themed PDF body (inline CSS).
 * Pieces are captured separately and packed with reserved header/footer gutters
 * so chrome never overlaps titles or body text.
 */
function ssBuildPdfDocumentHtml(payload, charts) {
  const pack = payload.factPack || {};
  const asOf = String(pack.asOf || payload.generatedAt || "").replace("T", " ").slice(0, 19);
  const sections = ssSplitNarrative(payload.markdown);
  const mode = payload.usedLlm
    ? `xAI · ${payload.model || "grok"}`
    : "Rules narrative";
  const conf = payload.confidenceLabel || "—";
  const cov = payload.coveragePct != null ? `${payload.coveragePct}%` : "—";
  const phase = payload.phase || "—";

  const kpi = ssKpiCardsHtml(payload);
  const sectionHtml = sections
    .map((sec, idx) => {
      const key = ssSectionKey(sec.title);
      let exhibit = "";
      if (key === "exec" && charts["ss-chart-coverage"]) {
        exhibit = `<div class="pdf-exhibit"><p class="pdf-exhibit-lbl">Exhibit A · Domain coverage</p><img src="${charts["ss-chart-coverage"]}" alt="Coverage" class="pdf-chart"/></div>`;
      }
      if (key === "cycle") {
        const imgs = [charts["ss-chart-cycle"], charts["ss-chart-cycle-gauge"]].filter(Boolean);
        exhibit = `<div class="pdf-exhibit"><p class="pdf-exhibit-lbl">Exhibit · Cycle structure</p>
          ${imgs.map((u) => `<img src="${u}" alt="Cycle" class="pdf-chart"/>`).join("")}
          ${ssCycleTableHtml(payload)}
        </div>`;
      }
      if (key === "valuation") {
        exhibit = `<div class="pdf-exhibit"><p class="pdf-exhibit-lbl">Exhibit · Valuation prints</p>
          ${charts["ss-chart-valuation"] ? `<img src="${charts["ss-chart-valuation"]}" alt="Valuation" class="pdf-chart"/>` : ""}
          ${ssValuationTableHtml(payload)}
        </div>`;
      }
      if (key === "flows") {
        exhibit = `<div class="pdf-exhibit"><p class="pdf-exhibit-lbl">Exhibit · Flows &amp; positioning</p>${ssFlowsTableHtml(payload)}</div>`;
      }
      if (key === "macro") {
        exhibit = `<div class="pdf-exhibit"><p class="pdf-exhibit-lbl">Exhibit · Macro &amp; tape</p>
          ${ssMacroTableHtml(payload)}
          ${ssNewsTableHtml(payload)}
        </div>`;
      }
      const num = String(idx + 2).padStart(2, "0");
      return `<section class="pdf-card pdf-piece" data-pdf-role="section">
        <div class="pdf-sec-head">
          <span class="pdf-sec-num">${num}</span>
          <h2 class="pdf-h2">${ssEscape(sec.title)}</h2>
        </div>
        <div class="pdf-prose">${ssMarkdownToHtml(sec.body)}</div>
        ${exhibit}
      </section>`;
    })
    .join("");

  const sources = (pack.sources || payload.sources || []).join(" · ") || "multi-source fact pack";
  const w = SS_PDF_WIDTH_PX;
  const narrNote = payload.usedLlm
    ? `Hybrid narrative via ${ssEscape(payload.model || "xAI")}. Exhibits computed from the same fact pack.`
    : `Rules narrative${payload.llmError ? " — " + ssEscape(String(payload.llmError).slice(0, 120)) : ""}.`;

  return `
<div class="pdf-root" id="ss-pdf-export-root" style="width:${w}px;max-width:${w}px;margin:0;padding:0;">
  <style>
    html, body {
      margin: 0 !important; padding: 0 !important;
      width: ${w}px !important; max-width: ${w}px !important;
      background: #0b0e11 !important; overflow-x: hidden !important;
    }
    .pdf-root {
      box-sizing: border-box; width: ${w}px !important; max-width: ${w}px !important;
      margin: 0 !important; padding: 0 !important;
      background: #0b0e11; color: #e8ecf4;
      font-family: "IBM Plex Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 11px; line-height: 1.55; overflow: hidden;
    }
    .pdf-root *, .pdf-root *::before, .pdf-root *::after { box-sizing: border-box; max-width: 100%; }
    .pdf-piece { width: 100%; display: block; }

    /* —— Cover masthead (elegant, not busy) —— */
    .pdf-mast {
      width: 100%;
      background: #0b0e11;
      border: 1px solid rgba(177,179,179,0.14);
      border-radius: 4px;
      overflow: hidden;
    }
    .pdf-mast-rule {
      height: 2px;
      background: linear-gradient(90deg, #d50a0a 0%, #d50a0a 28%, rgba(213,10,10,0.15) 100%);
    }
    .pdf-mast-body { padding: 18px 18px 16px; }
    .pdf-mast-top {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    .pdf-mast-crest { flex: 0 0 40px; padding-top: 4px; }
    .pdf-mast-copy { flex: 1; min-width: 0; }
    .pdf-kicker {
      margin: 0 0 5px;
      font-size: 8px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #c45c5c;
      font-weight: 600;
      line-height: 1.2;
    }
    .pdf-brand {
      margin: 0 0 4px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #b1b3b3;
      line-height: 1.2;
    }
    .pdf-title {
      margin: 0 0 8px;
      font-size: 19px;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: #ffffff;
      line-height: 1.28;
    }
    .pdf-dek {
      margin: 0;
      font-size: 10.5px;
      color: rgba(232,236,244,0.72);
      line-height: 1.5;
    }
    .pdf-stats {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(177,179,179,0.12);
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .pdf-stat {
      min-width: 0;
      padding: 0 8px 0 0;
      border-right: 1px solid rgba(177,179,179,0.1);
    }
    .pdf-stat:last-child { border-right: 0; }
    .pdf-stat-lbl {
      display: block;
      font-size: 7.5px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #7a8088;
      margin-bottom: 3px;
    }
    .pdf-stat-val {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #f1f5f9;
      font-family: ui-monospace, "IBM Plex Mono", monospace;
      word-break: break-word;
      line-height: 1.3;
    }
    .pdf-stat-val.accent { color: #ff8a8a; }

    .pdf-note {
      margin: 0;
      padding: 9px 12px;
      border-left: 2px solid #d50a0a;
      background: rgba(20, 24, 30, 0.9);
      color: #a8b0bc;
      font-size: 10px;
      line-height: 1.45;
    }
    .pdf-note.warn { border-left-color: #d97706; color: #e7c07a; }

    /* —— Section cards —— */
    .pdf-card {
      margin: 0;
      padding: 12px 14px 14px;
      border: 1px solid rgba(148,163,184,0.12);
      border-radius: 4px;
      background: #10141a;
      width: 100%;
      overflow: hidden;
    }
    .pdf-sec-head {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin: 0 0 10px;
      padding: 0 0 8px;
      border-bottom: 1px solid rgba(213,10,10,0.28);
    }
    .pdf-sec-num {
      flex: 0 0 auto;
      font-family: ui-monospace, monospace;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: #d50a0a;
      line-height: 1.2;
    }
    .pdf-h2 {
      margin: 0;
      padding: 0;
      border: 0;
      font-size: 12.5px;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: #f8fafc;
      line-height: 1.3;
    }
    .pdf-prose p {
      margin: 0 0 8px;
      color: #d5dbe6;
      font-size: 10.5px;
      line-height: 1.58;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .pdf-prose p:last-child { margin-bottom: 0; }
    .pdf-prose ul { margin: 0 0 8px; padding-left: 15px; color: #c5ccd6; }
    .pdf-prose li { margin: 3px 0; font-size: 10.5px; line-height: 1.5; }
    .pdf-prose strong { color: #f1f5f9; font-weight: 600; }
    .pdf-prose h3, .pdf-prose h2 { display: none; }

    .pdf-exhibit {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid rgba(148,163,184,0.1);
    }
    .pdf-exhibit-lbl {
      margin: 0 0 8px;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .pdf-chart {
      display: block; width: 100% !important; max-width: 100% !important;
      height: auto !important; margin: 0 0 8px; border-radius: 3px;
      background: #0b0e11;
    }

    .pdf-root .ss-kpi-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
    }
    .pdf-root .ss-kpi-card {
      padding: 8px 9px;
      border-radius: 3px;
      border: 1px solid rgba(148,163,184,0.12);
      background: #0b0e11;
      min-width: 0;
    }
    .pdf-root .ss-kpi-label {
      display: block; font-size: 7.5px; color: #6b7280;
      text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px;
    }
    .pdf-root .ss-kpi-value {
      display: block; font-size: 12px; font-weight: 600; color: #f8fafc;
      font-family: ui-monospace, monospace; line-height: 1.25; word-break: break-word;
    }
    .pdf-root .ss-kpi-sub { display: block; font-size: 8.5px; color: #64748b; margin-top: 2px; }

    .pdf-root .ss-table-wrap, .pdf-root .md-table-wrap, .pdf-root .deriv-table-wrap {
      width: 100%; overflow: hidden; margin: 0;
    }
    .pdf-root table {
      width: 100% !important; max-width: 100% !important;
      border-collapse: collapse; font-size: 9px; table-layout: fixed;
    }
    .pdf-root th, .pdf-root td {
      border-bottom: 1px solid rgba(148,163,184,0.12);
      padding: 5px 4px; text-align: left; color: #c5ccd6;
      word-wrap: break-word; overflow-wrap: anywhere; vertical-align: top;
    }
    .pdf-root th {
      color: #6b7280; font-weight: 600; font-size: 7.5px;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .pdf-root .mono { font-family: ui-monospace, monospace; }

    .pdf-colophon {
      margin: 0;
      padding: 12px 14px;
      border: 1px solid rgba(148,163,184,0.1);
      border-radius: 4px;
      background: #0b0e11;
      font-size: 9px;
      line-height: 1.5;
      color: #7a8088;
    }
    .pdf-colophon strong { color: #c45c5c; font-weight: 600; letter-spacing: 0.06em; }
  </style>

  <header class="pdf-mast pdf-piece" data-pdf-role="cover">
    <div class="pdf-mast-rule"></div>
    <div class="pdf-mast-body">
      <div class="pdf-mast-top">
        <div class="pdf-mast-crest">${ssBuccaneersCrestSvg(40)}</div>
        <div class="pdf-mast-copy">
          <p class="pdf-kicker">Confidential research note</p>
          <p class="pdf-brand">The Buccaneers</p>
          <h1 class="pdf-title">Bitcoin Client Report</h1>
          <p class="pdf-dek">
            Multi-domain synthesis across valuation, cycle structure, flows, sentiment, macro, and spot.
            As of ${ssEscape(asOf || "—")} UTC.
          </p>
        </div>
      </div>
      <div class="pdf-stats">
        <div class="pdf-stat"><span class="pdf-stat-lbl">Phase</span><span class="pdf-stat-val">${ssEscape(phase)}</span></div>
        <div class="pdf-stat"><span class="pdf-stat-lbl">Confidence</span><span class="pdf-stat-val">${ssEscape(conf)}</span></div>
        <div class="pdf-stat"><span class="pdf-stat-lbl">Coverage</span><span class="pdf-stat-val accent">${ssEscape(cov)}</span></div>
        <div class="pdf-stat"><span class="pdf-stat-lbl">Narrative</span><span class="pdf-stat-val">${ssEscape(mode)}</span></div>
      </div>
    </div>
  </header>

  <div class="pdf-note pdf-piece${payload.usedLlm ? "" : " warn"}" data-pdf-role="meta">${narrNote}</div>

  <div class="pdf-card pdf-piece" data-pdf-role="kpi">
    <div class="pdf-sec-head">
      <span class="pdf-sec-num">01</span>
      <h2 class="pdf-h2">Key levels</h2>
    </div>
    ${kpi}
  </div>

  ${sectionHtml}

  <footer class="pdf-colophon pdf-piece" data-pdf-role="colophon">
    <strong>THE BUCCANEERS</strong> · Educational research only — not financial advice or a solicitation.<br/>
    Sources: ${ssEscape(sources)}. Prefer multi-week evidence over single-session noise.
  </footer>
</div>`;
}

/** Full-bleed dark page + minimal chrome outside the content column. */
function ssPdfPaintPageBase(pdf, pageW, pageH) {
  const { r, g, b } = SS_PDF_BG;
  pdf.setFillColor(r, g, b);
  pdf.rect(0, 0, pageW, pageH, "F");
  // Hairline red top accent only
  pdf.setFillColor(213, 10, 10);
  pdf.rect(0, 0, pageW, 0.7, "F");
}

function ssPdfPaintPageChrome(pdf, pageW, pageH, pageIndex, pageCount, isCover) {
  // Footer — reserved zone (content never drawn here)
  const footY = pageH - 9;
  pdf.setDrawColor(40, 44, 52);
  pdf.setLineWidth(0.15);
  pdf.line(8, footY, pageW - 8, footY);

  pdf.setTextColor(120, 125, 135);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.text("The Buccaneers", 8, pageH - 4.2);
  pdf.setTextColor(90, 95, 105);
  pdf.text("Confidential", pageW / 2, pageH - 4.2, { align: "center" });
  pdf.setTextColor(160, 165, 175);
  pdf.text(`${pageIndex}  /  ${pageCount}`, pageW - 8, pageH - 4.2, { align: "right" });

  // Continuation header — only when not cover, and only in the top gutter
  if (!isCover) {
    pdf.setTextColor(100, 105, 115);
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "normal");
    pdf.text("The Buccaneers", 8, 6.5);
    pdf.setTextColor(70, 74, 82);
    pdf.text("Bitcoin Client Report", pageW - 8, 6.5, { align: "right" });
    pdf.setDrawColor(45, 48, 54);
    pdf.setLineWidth(0.12);
    pdf.line(8, 8.2, pageW - 8, 8.2);
  }
}

/**
 * Capture each report piece, pack onto dark A4 pages with smart breaks,
 * running headers, and page numbers (no white margins).
 */
async function ssRenderPdfViaIframe(htmlBodyInner) {
  const w = SS_PDF_WIDTH_PX;

  await Promise.all([
    ssLoadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
    ssLoadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
  ]);
  const h2c = window.html2canvas;
  const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
  if (!h2c) throw new Error("html2canvas failed to load (CDN blocked?)");
  if (!JsPDF) throw new Error("jsPDF failed to load (CDN blocked?)");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "PDF export");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${w}px`,
    height: "1200px",
    border: "0",
    margin: "0",
    padding: "0",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
    background: "#0b0e11",
  });
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${w}px !important;
          max-width: ${w}px !important;
          background: #0b0e11 !important;
          overflow-x: hidden !important;
        }
      </style>
    </head><body>${htmlBodyInner}</body></html>`);
    idoc.close();

    await new Promise((r) => setTimeout(r, 60));
    const root = idoc.querySelector(".pdf-root") || idoc.body;
    await ssWaitForImages(root);

    const fullH = Math.ceil(
      Math.max(root.scrollHeight, idoc.body.scrollHeight, 900),
    );
    iframe.style.height = `${fullH + 40}px`;
    await new Promise((r) => setTimeout(r, 100));

    const pieceEls = [...root.querySelectorAll(".pdf-piece")];
    if (!pieceEls.length) pieceEls.push(root);

    const captureOpts = {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#0b0e11",
      logging: false,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width: w,
      windowWidth: w,
      foreignObjectRendering: false,
    };

    /** Crop a source canvas to a vertical band (pixel rows). */
    const cropCanvas = (src, y0, y1) => {
      const top = Math.max(0, Math.floor(y0));
      const bot = Math.min(src.height, Math.ceil(y1));
      const h = Math.max(1, bot - top);
      const c = document.createElement("canvas");
      c.width = src.width;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#0b0e11";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, top, src.width, h, 0, 0, src.width, h);
      return c;
    };

    // Rasterize each logical block (sections stay atomic → smarter breaks)
    const pieces = [];
    for (const el of pieceEls) {
      // Neutralize outer margins so capture isn't sparse
      const prevMargin = el.style.margin;
      el.style.margin = "0 0 0 0";
      const hPx = Math.ceil(Math.max(el.scrollHeight, el.offsetHeight, 1));
      const canvas = await h2c(el, {
        ...captureOpts,
        height: hPx,
        windowHeight: hPx + 8,
      });
      el.style.margin = prevMargin;
      pieces.push({
        role: el.getAttribute("data-pdf-role") || "block",
        canvas,
      });
    }

    const pdf = new JsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
      compress: true,
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    // Content column — large gutters so chrome never collides with titles
    const marginX = 12;
    const marginTopCover = 8;
    const marginTopCont = 14; // below running header
    const marginBottom = 14; // above footer line
    const gapMm = 3.2;
    const contentW = pageW - marginX * 2;
    const maxBodyH = pageH - marginTopCont - marginBottom;

    const bands = [];
    for (const p of pieces) {
      const fullH = (p.canvas.height * contentW) / p.canvas.width;
      if (fullH <= maxBodyH + 0.5) {
        bands.push({
          role: p.role,
          data: p.canvas.toDataURL("image/jpeg", 0.94),
          imgW: contentW,
          imgH: fullH,
          preferBreakBefore: p.role === "section" || p.role === "colophon",
        });
      } else {
        const pxPerMm = p.canvas.height / fullH;
        let yMm = 0;
        let first = true;
        while (yMm < fullH - 0.4) {
          const sliceMm = Math.min(maxBodyH, fullH - yMm);
          const cropped = cropCanvas(p.canvas, yMm * pxPerMm, (yMm + sliceMm) * pxPerMm);
          bands.push({
            role: p.role,
            data: cropped.toDataURL("image/jpeg", 0.94),
            imgW: contentW,
            imgH: sliceMm,
            preferBreakBefore: first && (p.role === "section" || p.role === "colophon"),
          });
          yMm += sliceMm;
          first = false;
        }
      }
    }

    const pages = [];
    let cur = { bands: [], y: marginTopCover, isCover: true };

    const flush = () => {
      if (cur.bands.length) pages.push(cur);
    };
    const newPage = () => {
      flush();
      cur = { bands: [], y: marginTopCont, isCover: false };
    };
    const pageBottom = () => pageH - marginBottom;

    // Cover stack on page 1 when it fits
    if (
      bands[0]?.role === "cover" &&
      bands[1]?.role === "meta" &&
      bands[2]?.role === "kpi"
    ) {
      const stackH =
        bands[0].imgH + gapMm + bands[1].imgH + gapMm + bands[2].imgH;
      if (stackH <= pageH - marginTopCover - marginBottom) {
        let y = marginTopCover;
        for (let k = 0; k < 3; k++) {
          cur.bands.push({ ...bands[k], y });
          y += bands[k].imgH + gapMm;
        }
        cur.y = y;
        bands.splice(0, 3);
      }
    }

    for (const band of bands) {
      const avail = pageBottom() - cur.y;
      if (
        band.preferBreakBefore &&
        cur.bands.length > 0 &&
        (avail < maxBodyH * 0.35 || band.imgH > avail)
      ) {
        newPage();
      } else if (band.imgH > avail && cur.bands.length > 0) {
        newPage();
      }
      cur.bands.push({ ...band, y: cur.y });
      cur.y += band.imgH + gapMm;
    }
    flush();

    // Single paint pass: dark base → content → chrome (chrome last, outside content box)
    pages.forEach((pg, idx) => {
      if (idx > 0) pdf.addPage();
      ssPdfPaintPageBase(pdf, pageW, pageH);
      for (const b of pg.bands) {
        pdf.addImage(b.data, "JPEG", marginX, b.y, b.imgW, b.imgH, undefined, "FAST");
      }
      ssPdfPaintPageChrome(pdf, pageW, pageH, idx + 1, pages.length, pg.isCover);
    });

    const asOf = (ssLastPayload?.generatedAt || new Date().toISOString()).slice(0, 10);
    pdf.save(`Buccaneers-BTC-Client-Report-${asOf}.pdf`);
  } finally {
    iframe.remove();
  }
}

async function ssDownloadPdf() {
  const payload = ssLastPayload;
  if (!payload?.markdown && !payload?.factPack) {
    window.alert("Generate the report first, then download PDF.");
    return;
  }
  const btn = ssEl("ss-page-pdf") || ssEl("ss-dl-pdf-main") || ssEl("ss-dl-pdf-inline");
  const prev = btn?.textContent;
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Preparing PDF…";
    }

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const charts = await ssCaptureReportCharts();
    const html = ssBuildPdfDocumentHtml(payload, charts);
    await ssRenderPdfViaIframe(html);
  } catch (err) {
    console.error("[super-summary pdf]", err);
    window.alert(
      `${err.message || "PDF export failed"}. Opening print dialog — choose “Save as PDF”.`,
    );
    document.body.classList.add("ss-printing");
    window.print();
    setTimeout(() => document.body.classList.remove("ss-printing"), 800);
  } finally {
    document.getElementById("ss-pdf-host")?.remove();
    document.querySelector('iframe[title="PDF export"]')?.remove();
    if (btn) {
      btn.disabled = false;
      if (prev) btn.textContent = prev;
    }
  }
}

window.ssDownloadPdf = ssDownloadPdf;

let ssBusy = false;
let ssProgressTimer = null;

function ssStopProgressTicker() {
  if (ssProgressTimer) {
    clearInterval(ssProgressTimer);
    ssProgressTimer = null;
  }
}

function ssStartProgressTicker(t0, note) {
  ssStopProgressTicker();
  const paint = () => {
    const elapsedSec = (Date.now() - t0) / 1000;
    const snap = ssStageAtElapsed(elapsedSec);
    ssRenderProgress({
      stage: snap.stage,
      pct: snap.pct,
      elapsedSec,
      doneIds: snap.doneIds,
      note:
        note ||
        "Server is refreshing domain data and building the brief — progress is estimated from typical run times.",
    });
  };
  paint();
  ssProgressTimer = setInterval(paint, 400);
}

async function ssGenerate(force = false) {
  if (ssBusy) return;

  // Gate only when paywall is enabled — never show the report shell until unlocked
  if (!ssGetAccessToken()) {
    try {
      const cfg = await ssFetchPaywall();
      if (cfg?.enabled) {
        ssRenderPaywall(cfg);
        return;
      }
    } catch (err) {
      // Continue — server returns 402 if payment is required
    }
  }

  ssBusy = true;
  const pageBtn = ssEl("ss-page-gen");
  if (pageBtn) pageBtn.disabled = true;

  if (force) {
    try {
      localStorage.removeItem(SS_CACHE_KEY);
      localStorage.removeItem("ss:last:v1");
    } catch {
      /* ignore */
    }
  }

  // Reveal report shell only now (after unlock / paywall off), then show live progress
  ssShowUnlockedUi();
  const t0 = Date.now();
  const note = force
    ? "Force regenerate: refreshing all domains, then rewriting the narrative…"
    : "Refreshing all domains, then assembling the multi-domain brief…";

  // Paint progress immediately (before await) so the UI never sits on a blank "Loading…"
  ssStartProgressTicker(t0, note);

  // Always force server rebuild so domain data is fresh even if other tabs were never opened.
  const doForce = true;

  try {
    const data = await ssFetch(doForce);

    ssStopProgressTicker();
    const renderStage = SS_PIPELINE.find((s) => s.id === "render");
    ssRenderProgress({
      stage: renderStage,
      pct: 100,
      elapsedSec: (Date.now() - t0) / 1000,
      doneIds: SS_PIPELINE.filter((s) => s.id !== "render").map((s) => s.id),
      note: "Drawing charts and tables…",
    });

    ssSaveLocal(data);
    ssShowUnlockedUi();
    ssRenderFullPage(data);
  } catch (err) {
    ssStopProgressTicker();
    console.error("[super-summary]", err);
    if (err.code === "payment_required") {
      ssClearAccessToken();
      ssRenderPaywall(err.paywall || (await ssFetchPaywall().catch(() => null)), err.message);
    } else {
      ssShowUnlockedUi();
      ssRenderFullPage(
        null,
        `${err.message || "Generate failed"} — try Generate / Regenerate again.`,
      );
    }
  } finally {
    ssStopProgressTicker();
    ssBusy = false;
    if (pageBtn) pageBtn.disabled = false;
  }
}

async function initSuperSummaryHome() {
  const section = ssEl("ss-report-section");
  if (!section) return;

  const gen = ssEl("ss-page-gen");
  if (gen && !gen.dataset.bound) {
    gen.dataset.bound = "true";
    gen.addEventListener("click", () => ssGenerate(true));
  }

  // Always start locked — never flash report or auto-generate before paywall / unlock
  ssShowLockedUi("Checking access…");

  try {
    const cfg = await ssFetchPaywall();

    // Paywall off (explicit env) — still never auto-generate on landing
    if (!cfg.enabled) {
      ssShowUnlockedUi();
      const cached = ssLoadLocal();
      if (cached?.markdown || cached?.factPack) ssRenderFullPage(cached);
      else ssRenderIdlePrompt({ reason: "Paywall is disabled on this server." });
      window.decorateHelpLabels?.(section);
      return;
    }

    const token = ssGetAccessToken();
    if (!token) {
      // Payment / dev code required — only the paywall is visible
      ssRenderPaywall(cfg);
      window.decorateHelpLabels?.(section);
      return;
    }

    // Has unlock token — show last report if any, else idle. Never auto-generate.
    ssShowUnlockedUi();
    const cached = ssLoadLocal();
    if (cached?.markdown || cached?.factPack) {
      ssRenderFullPage(cached);
      // Ensure lock control is available on cached view
      const head = ssEl("ss-page-head");
      if (head && !ssEl("ss-lock-btn")) {
        const lock = document.createElement("button");
        lock.type = "button";
        lock.className = "md-btn md-btn--secondary ss-btn ss-lock-btn";
        lock.id = "ss-lock-btn";
        lock.textContent = "Lock again";
        lock.addEventListener("click", () => ssLockAgain());
        head.appendChild(lock);
      }
    } else {
      ssRenderIdlePrompt();
    }
  } catch (err) {
    ssRenderPaywall(null, err.message || "Could not load paywall");
  }

  window.decorateHelpLabels?.(section);
}

function initSuperSummaryPage() {
  initSuperSummaryHome();
}

function ssOpenFullReport() {
  window.MenuController?.setLevel1?.("home");
  initSuperSummaryHome();
  ssEl("ss-report-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.initSuperSummaryPage = initSuperSummaryPage;
window.initSuperSummaryHome = initSuperSummaryHome;
window.ssGenerate = ssGenerate;
window.ssOpenFullReport = ssOpenFullReport;
