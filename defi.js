const DEFI_SECTIONS = [
  "strategies",
  "wrapped",
  "stables",
  "bridges",
  "lending",
  "borrowing",
  "liquidity",
  "staking",
];

const DEFI_POLL_MS = 300_000;
const defiCache = {};
let defiPollTimer = null;
let defiActiveSection = null;
let defiReady = false;
let defiPlanTicketSel = "1";

const dfEl = (id) => document.getElementById(id);

function defiEsc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtUsd(n, compact = true) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (compact) {
    if (Math.abs(v) >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (Math.abs(v) >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  }
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtNum(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(d);
}

function fmtPct(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return prefix + Number(n).toFixed(d) + "%";
}

function defiIsRestake(row) {
  const blob = `${row?.project || ""} ${row?.name || ""} ${row?.symbol || ""} ${row?.venue || ""} ${row?.title || ""} ${row?.family || ""}`.toLowerCase();
  return /lombard|babylon|lbtc|solv|enzo|unibtc|veda|restak/.test(blob);
}

function apyFraction(n, row) {
  if (n == null || Number.isNaN(Number(n))) return null;
  let x = Number(n);
  if (x > 1) x = x / 100;
  if (defiIsRestake(row) && x >= 0.04) x = x / 100;
  if (defiIsRestake(row) && x > 0.04) x = 0.01;
  return x;
}

function fmtApy(n, row) {
  const x = apyFraction(n, row);
  if (x == null) return "—";
  return (x * 100).toFixed(2) + "%";
}

function fmtApyCell(row) {
  const v = row?.apyView;
  const cash = v?.cash ?? row?.apyCash ?? row?.apy;
  if (v?.inflated || row?.apyInflated || defiIsRestake(row)) {
    return `<span class="mono" title="${defiEsc(v?.note || row?.apyNote || "Restaked BTC cash yield, not points")}">${fmtApy(cash, row)}</span><span class="defi-apy-head"> cash</span>`;
  }
  return `<span class="mono">${fmtApy(cash, row)}</span>`;
}

function fmtBps(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  const prefix = v >= 0 ? "+" : "−";
  return prefix + Math.abs(v).toFixed(0) + " bps";
}

function changeClass(n) {
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "";
}

function heroHelpKey(section, name) {
  const n = (name || "").toLowerCase();
  if (n.includes("risk") || n.includes("peg") || n.includes("hack")) return "defi-hero-risk";
  if (section === "stables") return "defi-hero-stables";
  if (section === "lending") return "defi-hero-lending";
  if (section === "borrowing") return "defi-hero-borrow";
  if (section === "liquidity") return "defi-hero-liquidity";
  if (section === "staking") return "defi-hero-staking";
  if (section === "bridges") return "defi-hero-bridge";
  if (section === "wrapped") return "defi-hero-wrapped";
  if (section === "strategies") return "defi-hero-strategy";
  return `defi-hero-${section}`;
}

function setHelpTitle(el, text, helpKey) {
  if (!el) return;
  const key = helpKey || el.dataset.helpKey;
  if (key && window.labelWithHelp) {
    el.dataset.helpKey = key;
    el.innerHTML = window.labelWithHelp(text, key);
    el.dataset.helpDecorated = "true";
  } else {
    el.textContent = text;
  }
}

function defiScreenRoot(section) {
  return document.querySelector(
    `#dashboard-defi .menu-screen[data-l2="${section}"]`,
  );
}

function heroValue(hero, section) {
  if (hero?.kind === "risk" || hero?.kind === "score") {
    return hero.value == null ? "—" : fmtNum(hero.value, 0);
  }
  if (hero?.kind === "apy") return fmtApy(hero.value, hero);
  if (hero?.kind === "ltv") {
    const x = Number(hero.value);
    if (!Number.isFinite(x)) return "—";
    return (x <= 1 ? x * 100 : x).toFixed(0) + "%";
  }
  if (hero?.kind === "bps") return fmtBps(Math.abs(hero.value));
  if (hero?.kind === "count") {
    return hero.value == null ? "—" : String(Math.round(Number(hero.value)));
  }
  if (section === "stables" && hero.name === "Total Stablecoin MCap") {
    return fmtUsd(hero.value);
  }
  if (typeof hero.value === "number" && hero.value < 100 && hero.name?.includes("APY")) {
    return fmtApy(hero.value);
  }
  if (typeof hero.value === "number" && Math.abs(hero.value) > 1000) {
    return fmtUsd(hero.value);
  }
  if (typeof hero.value === "number") {
    return fmtNum(hero.value, hero.value < 10 ? 4 : 0);
  }
  return hero.value ?? "—";
}

async function fetchDefiSection(section) {
  const res = await fetch(`/api/defi/${section}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `DeFi ${section} ${res.status}`);
  }
  return res.json();
}

function defiRiskMini(risk) {
  if (!risk) return "—";
  const grade = risk.grade || "—";
  const score = risk.score;
  const gCls =
    grade === "A" || grade === "B+"
      ? "defi-risk-grade--hi"
      : grade === "D" || grade === "C"
        ? "defi-risk-grade--lo"
        : "defi-risk-grade--mid";
  const layers = risk.layers || {};
  const cells = Object.entries(layers)
    .map(([k, v]) => {
      const t = Math.max(0, Math.min(1, Number(v) / 10));
      const bg = `rgba(${Math.round(239 * t + 16 * (1 - t))}, ${Math.round(68 * t + 185 * (1 - t))}, ${Math.round(68 * t + 129 * (1 - t))}, 0.85)`;
      return `<span class="defi-risk-cell" title="${defiEsc(k)} ${Number(v).toFixed(1)}/10" style="background:${bg}"></span>`;
    })
    .join("");
  return `<div class="defi-risk-mini"><span class="defi-risk-grade ${gCls}">${defiEsc(grade)}</span><span class="defi-risk-strip">${cells}</span><span class="mono">${score != null ? fmtNum(score, 0) : "—"}</span></div>`;
}

function defiRiskStackHtml(risk) {
  if (!risk?.layers) return "";
  const rows = Object.entries(risk.layers)
    .map(([k, v]) => {
      const pct = Math.max(4, Math.min(100, (Number(v) / 10) * 100));
      return `<div class="defi-risk-layer"><span class="defi-risk-layer-k">${defiEsc(k)}</span><span class="defi-risk-layer-bar"><span style="width:${pct.toFixed(0)}%"></span></span><span class="mono">${Number(v).toFixed(1)}</span></div>`;
    })
    .join("");
  return (
    `<div class="defi-risk-stack">` +
    `<div class="defi-risk-stack-head"><span data-help-key="defi-risk-stack">Risk stack</span> · grade <strong>${defiEsc(risk.grade || "—")}</strong> · score <span class="mono">${fmtNum(risk.score, 0)}</span> <em>(higher = more fragile)</em></div>` +
    rows +
    (risk.hack
      ? `<p class="defi-risk-hack">Hack flag: ${defiEsc(risk.hack.name || "match")} · ${fmtUsd(risk.hack.amount)} · ${defiEsc(risk.hack.classification || "")}</p>`
      : "") +
    `</div>`
  );
}

function defiKindLabel(kind) {
  return (
    {
      custodial: "Custodial",
      threshold: "Threshold",
      native_l2: "Native L2",
      yield_wrap: "Yield wrap",
      movement: "Movement",
      lending: "Lending",
      dex: "DEX",
      staking: "Staking",
      stable: "Stable",
    }[kind] || kind || "—"
  );
}

function buildDefiCommentary(data) {
  const lines = [];
  const heroes = data.heroes || [];
  const table = data.table || [];
  if (!heroes.length && !table.length) return ["Data unavailable."];

  const lead = heroes[0];
  if (lead) {
    lines.push(
      `${data.title}: ${lead.name} at ${heroValue(lead, data.section)}` +
        (lead.sub ? ` (${lead.sub})` : "") +
        `. Source: ${data.source}.`,
    );
  }

  const risks = table.map((r) => r.risk).filter(Boolean);
  if (risks.length) {
    const med = [...risks].sort((a, b) => a.score - b.score)[Math.floor(risks.length / 2)];
    const worst = [...table].sort((a, b) => (b.risk?.score || 0) - (a.risk?.score || 0))[0];
    lines.push(
      `Desk risk: median fragility ${fmtNum(med.score, 0)} (${med.grade}). ` +
        `Weakest on this list: ${worst?.name || "—"} (${worst?.risk?.grade || "—"}). ` +
        `Score is a heuristic, not a rating agency.`,
    );
  }

  if (data.section === "wrapped" && data.prices?.length) {
    const spot = data.prices.find((p) => p.name === "BTC");
    const pegs = data.prices.filter((p) => p.name !== "BTC" && p.pegBps != null);
    if (spot?.price && pegs.length) {
      const bits = pegs
        .map((p) => `${p.name} ${fmtUsd(p.price, false)} (${fmtBps(p.pegBps)})`)
        .join(" · ");
      lines.push(`Spot BTC ${fmtUsd(spot.price, false)}. Pegs: ${bits}.`);
    }
  }

  if (data.section === "stables") {
    const top = table[0];
    if (top) {
      lines.push(
        `Largest stable: ${top.name} (${top.symbol}) at ${fmtUsd(top.mcap)}, price ${fmtNum(top.price, 4)} (${fmtBps(top.pegBps)} vs $1). ` +
          `USDT/USDC share still sets BTC pair routing.`,
      );
    }
    if (data.pegAlerts) {
      lines.push(`${data.pegAlerts} name(s) ≥ 50 bps from $1 on this cut — treat as peg stress, not noise.`);
    }
  }

  if (data.section === "bridges") {
    lines.push(
      "This page is movement venues (THORChain, Across, Stargate, …), not WBTC/cbBTC issuers — those live under Wrapped BTC.",
    );
  }

  if (data.section === "borrowing") {
    const top = table[0];
    if (top) {
      lines.push(
        `Most borrowed: ${top.name} ${top.symbol || ""} on ${top.chain || "—"} — borrowed ${fmtUsd(top.totalBorrow)} · util ${top.util != null ? (top.util * 100).toFixed(0) + "%" : "—"} · LTV ${top.ltv != null ? (top.ltv * 100).toFixed(0) + "%" : "—"} · borrow APY ${fmtApy(top.apyBorrow, top)}.`,
      );
    }
  }

  if (data.section === "lending" || data.section === "staking") {
    const top = table[0];
    if (top?.apy != null) {
      lines.push(
        `Top row: ${top.name || top.project} ${top.symbol || ""} on ${top.chain || "—"} — TVL ${fmtUsd(top.tvl)} · APY ${fmtApy(top.apy, top)}` +
          (top.apyBase != null ? ` (base ${fmtApy(top.apyBase, top)} / reward ${fmtApy(top.apyReward, top)})` : "") +
          `.`,
      );
    }
    if (data.section === "staking") {
      lines.push("This is a wrapped + restaked stack, not native yield on L1 Bitcoin.");
    }
  }

  if (data.section === "liquidity") {
    const top = table[0];
    if (top) {
      lines.push(
        `Highest BTC-pair activity: ${top.name} ${top.symbol || ""} · 24h vol ${fmtUsd(top.volume24h)} · IL ${top.ilRisk || "—"}.`,
      );
    }
  }

  if (data.section === "strategies") {
    const live = (data.tickets || []).filter((t) => !t.paper);
    const top = live[0] || (data.tickets || [])[0];
    if (top) {
      lines.push(
        `Top composite: ${top.title} (${top.score?.grade || "—"}). Tickets snap to live Llama pools where listed. Paper rows are warnings, not orders.`,
      );
    }
  }

  const pts = data.chart?.points || [];
  if (pts.length >= 2) {
    const first = pts[0].close;
    const last = pts[pts.length - 1].close;
    const ret = first ? ((last - first) / first) * 100 : 0;
    lines.push(
      `${data.chartLabel || "Series"}: ${fmtPct(ret)} (${pts[0].date} → ${pts[pts.length - 1].date}).`,
    );
  }

  if (data.disclaimer) lines.push(data.disclaimer);
  return lines;
}

function renderDefiPrimer(section, data) {
  const host = dfEl(`defi-${section}-primer`);
  if (!host) return;
  const intro = data.intro;
  if (!intro) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  const bullets = (intro.bullets || []).map((b) => `<li>${defiEsc(b)}</li>`).join("");
  host.innerHTML =
    `<p class="vol-plan-stance"><span class="vol-plan-kicker">${defiEsc(intro.kicker || "What this page is")}</span> ${defiEsc(intro.lede || "")}</p>` +
    (bullets ? `<ul class="vol-plan-list">${bullets}</ul>` : "") +
    `<p class="vol-plan-disclaimer">${defiEsc(data.disclaimer || "")}</p>`;
}

function renderDefiHeroes(section, data) {
  const strip = dfEl(`defi-${section}-heroes`);
  if (!strip) return;
  const items = (data.heroes || []).slice(0, 4);
  strip.innerHTML = items
    .map((h) => {
      const label = window.labelWithHelp
        ? window.labelWithHelp(h.name, heroHelpKey(section, h.name))
        : h.name;
      return `
      <article class="deriv-hero-block">
        <span class="deriv-hero-label">${label}</span>
        <span class="deriv-hero-value ${changeClass(h.changePct)}">${heroValue(h, section)}</span>
        <span class="deriv-hero-sub">${h.sub || (h.changePct != null ? fmtPct(h.changePct) : "")}</span>
      </article>`;
    })
    .join("");
}

function renderDefiRiskKpis(section, data) {
  const strip = dfEl(`defi-${section}-riskkpis`);
  if (!strip) return;
  const kpis = data.riskKpis || [];
  if (!kpis.length) {
    strip.hidden = true;
    strip.innerHTML = "";
    return;
  }
  strip.hidden = false;
  strip.innerHTML = kpis
    .map((h) => {
      const label = window.labelWithHelp
        ? window.labelWithHelp(h.name, "defi-hero-risk")
        : h.name;
      return `
      <article class="deriv-hero-block defi-risk-kpi">
        <span class="deriv-hero-label">${label}</span>
        <span class="deriv-hero-value">${heroValue(h, section)}</span>
        <span class="deriv-hero-sub">${h.sub || ""}</span>
      </article>`;
    })
    .join("");
}

function theadHtml(cols) {
  return `<tr>${cols
    .map(([key, label]) => `<th data-help-key="${key}">${label}</th>`)
    .join("")}</tr>`;
}

function renderDefiTable(section, data) {
  const head = dfEl(`defi-${section}-table-head`);
  const body = dfEl(`defi-${section}-table-body`);
  if (!body) return;
  const mode = data.tableMode || "protocol";
  const rows = data.table || [];

  const setHead = (cols) => {
    if (head) head.innerHTML = theadHtml(cols);
  };

  if (mode === "stables") {
    setHead([
      ["defi-col-protocol", "Name"],
      ["defi-col-mcap", "Market cap"],
      ["defi-col-price", "Price"],
      ["defi-col-peg", "Peg"],
      ["defi-col-change7d", "7d %"],
      ["defi-col-chains", "Chains"],
      ["defi-col-risk", "Risk"],
    ]);
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${defiEsc(r.name)}<span class="defi-symbol-tag">${defiEsc(r.symbol)}</span></td>
        <td class="mono">${fmtUsd(r.mcap)}</td>
        <td class="mono">${fmtNum(r.price, 4)}</td>
        <td class="mono ${Math.abs(r.pegBps || 0) >= 50 ? "negative" : ""}">${fmtBps(r.pegBps)}</td>
        <td class="mono ${changeClass(r.change7d)}">${fmtPct(r.change7d)}</td>
        <td class="mono">${r.chains ?? "—"}</td>
        <td>${defiRiskMini(r.risk)}</td>
      </tr>`,
      )
      .join("");
    return;
  }

  if (mode === "lending" || mode === "stakingPools") {
    setHead([
      ["defi-col-protocol", "Protocol"],
      ["defi-col-chain", "Chain"],
      ["defi-col-tvl", "TVL"],
      ["defi-col-apy", "APY"],
      ["defi-col-apy-split", "Base / reward"],
      ["defi-col-apy-mean", "30d mean"],
      ["defi-col-il", "IL"],
      ["defi-col-risk", "Risk"],
    ]);
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${defiEsc(r.name)}<span class="defi-symbol-tag">${defiEsc(r.symbol || r.category || "")}</span></td>
        <td class="mono">${defiEsc(r.chain || r.chains || "—")}</td>
        <td class="mono">${fmtUsd(r.tvl)}</td>
        <td>${fmtApyCell(r)}</td>
        <td class="mono">${fmtApy(r.apyBase, r)} / ${fmtApy(r.apyReward, r)}</td>
        <td class="mono">${fmtApy(r.apyMean30d, r)}</td>
        <td class="mono">${defiEsc(r.ilRisk || "no")}</td>
        <td>${defiRiskMini(r.risk)}</td>
      </tr>`,
      )
      .join("");
    return;
  }

  if (mode === "borrowing") {
    setHead([
      ["defi-col-protocol", "Market"],
      ["defi-col-chain", "Chain"],
      ["defi-col-borrowed", "Borrowed"],
      ["defi-col-supply", "Supplied"],
      ["defi-col-util", "Util"],
      ["defi-col-ltv", "LTV"],
      ["defi-col-borrow-apy", "Borrow APY"],
      ["defi-col-risk", "Risk"],
    ]);
    body.innerHTML = rows
      .map((r) => {
        const net = (r.apyBorrow || 0) - (r.apyBorrowReward || 0);
        return `
      <tr>
        <td>${defiEsc(r.name)}<span class="defi-symbol-tag">${defiEsc(r.symbol || "")}${r.borrowable === false ? " · not borrowable" : ""}</span></td>
        <td class="mono">${defiEsc(r.chain || "—")}</td>
        <td class="mono">${fmtUsd(r.totalBorrow)}</td>
        <td class="mono">${fmtUsd(r.totalSupply || r.tvl)}</td>
        <td class="mono">${r.util != null ? (r.util * 100).toFixed(0) + "%" : "—"}</td>
        <td class="mono">${r.ltv != null ? (r.ltv * 100).toFixed(0) + "%" : "—"}</td>
        <td class="mono">${fmtApy(r.apyBorrow, r)}${r.apyBorrowReward ? ` <span class="defi-apy-head">net ${fmtApy(net, r)}</span>` : ""}</td>
        <td>${defiRiskMini(r.risk)}</td>
      </tr>`;
      })
      .join("");
    return;
  }

  if (mode === "liquidity") {
    setHead([
      ["defi-col-protocol", "Pool"],
      ["defi-col-chain", "Chain"],
      ["defi-col-tvl", "TVL"],
      ["defi-col-volume24h", "24h vol"],
      ["defi-col-apy", "APY"],
      ["defi-col-il", "IL"],
      ["defi-col-risk", "Risk"],
    ]);
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${defiEsc(r.name)}<span class="defi-symbol-tag">${defiEsc(r.symbol || "")}${r.poolMeta ? " · " + defiEsc(r.poolMeta) : ""}</span></td>
        <td class="mono">${defiEsc(r.chain || "—")}</td>
        <td class="mono">${fmtUsd(r.tvl)}</td>
        <td class="mono">${fmtUsd(r.volume24h)}</td>
        <td>${fmtApyCell(r)}</td>
        <td class="mono">${defiEsc(r.ilRisk || "—")} · ${defiEsc(r.exposure || "")}</td>
        <td>${defiRiskMini(r.risk)}</td>
      </tr>`,
      )
      .join("");
    return;
  }

  if (mode === "wrapped") {
    setHead([
      ["defi-col-protocol", "Wrapper"],
      ["defi-col-kind", "Model"],
      ["defi-col-tvl", "TVL"],
      ["defi-col-peg", "Peg vs spot"],
      ["defi-col-change7d", "7d %"],
      ["defi-col-audit", "Audits"],
      ["defi-col-chains", "Chains"],
      ["defi-col-risk", "Risk"],
    ]);
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${defiEsc(r.name)}<span class="defi-symbol-tag">${defiEsc(r.issuer || "")} · ${defiEsc(r.path || "")}</span></td>
        <td>${defiEsc(defiKindLabel(r.kind))}</td>
        <td class="mono">${fmtUsd(r.tvl)}</td>
        <td class="mono ${Math.abs(r.pegBps || 0) >= 40 ? "negative" : "positive"}">${fmtBps(r.pegBps)}</td>
        <td class="mono ${changeClass(r.change7d)}">${fmtPct(r.change7d)}</td>
        <td class="mono">${r.audits ?? "—"}</td>
        <td>${defiEsc(r.chains || "—")}</td>
        <td>${defiRiskMini(r.risk)}</td>
      </tr>`,
      )
      .join("");
    return;
  }

  if (mode === "bridges" || mode === "staking") {
    setHead([
      ["defi-col-protocol", "Protocol"],
      ["defi-col-kind", mode === "bridges" ? "Flavor" : "Category"],
      ["defi-col-tvl", "TVL"],
      ["defi-col-change7d", "7d %"],
      ["defi-col-audit", "Audits"],
      ["defi-col-chains", "Chains"],
      ["defi-col-risk", "Risk"],
    ]);
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${defiEsc(r.name)}<span class="defi-symbol-tag">${defiEsc(r.category || r.slug || "")}</span></td>
        <td>${defiEsc(r.bridgeFlavor || defiKindLabel(r.kind) || r.category || "—")}</td>
        <td class="mono">${fmtUsd(r.tvl)}</td>
        <td class="mono ${changeClass(r.change7d)}">${fmtPct(r.change7d)}</td>
        <td class="mono">${r.audits ?? "—"}</td>
        <td>${defiEsc(r.chains || "—")}</td>
        <td>${defiRiskMini(r.risk)}</td>
      </tr>`,
      )
      .join("");
    return;
  }

  if (mode === "strategies") {
    setHead([
      ["defi-sum-rank", "Rank"],
      ["defi-sum-trade", "Strategy"],
      ["defi-sum-family", "Family"],
      ["defi-sum-style", "Style"],
      ["defi-sum-grade", "Grade"],
      ["defi-col-apy", "Cash APY"],
      ["defi-col-tvl", "TVL"],
      ["defi-col-risk", "Risk"],
      ["defi-sum-score", "Score"],
    ]);
    const showAdv = dfEl("defi-show-advanced") ? !!dfEl("defi-show-advanced").checked : true;
    const vis = rows.filter((t) => showAdv || t.sophistication === "Core");
    body.innerHTML = vis
      .map((t) => {
        const s = t.score || {};
        const gradeCls =
          s.grade === "A" || s.grade === "B+"
            ? "defi-rank-hi"
            : s.grade === "D"
              ? "defi-rank-lo"
              : "";
        return `<tr class="vol-summary-row defi-summary-row${t.rank === 1 ? " vol-summary-row--best defi-summary-row--best" : ""}${String(t.id) === String(defiPlanTicketSel) ? " vol-summary-row--sel defi-summary-row--sel" : ""}" data-defi-ticket-id="${defiEsc(String(t.id))}" tabindex="0" role="button">
        <td class="mono"><strong>${t.rank}</strong></td>
        <td>${defiEsc(t.title)}${t.paper ? ' <span class="vol-ticket-badge vol-ticket-badge--paper">PAPER</span>' : ""}</td>
        <td>${defiEsc(t.family || "—")}</td>
        <td>${defiEsc(t.sophistication || "—")}</td>
        <td class="mono ${gradeCls}"><strong>${defiEsc(s.grade || "—")}</strong></td>
        <td>${fmtApyCell(t)}</td>
        <td class="mono">${fmtUsd(t.tvl)}</td>
        <td>${defiRiskMini(t.risk)}</td>
        <td class="mono">${s.composite != null ? s.composite : "—"}</td>
      </tr>`;
      })
      .join("");
    return;
  }

  setHead([
    ["defi-col-protocol", "Protocol"],
    ["defi-col-tvl", "TVL"],
    ["defi-col-change1d", "1d %"],
    ["defi-col-chains", "Chains"],
    ["defi-col-risk", "Risk"],
  ]);
  body.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${defiEsc(r.name)}<span class="defi-symbol-tag">${defiEsc(r.category || r.slug || "")}</span></td>
        <td class="mono">${fmtUsd(r.tvl)}</td>
        <td class="mono ${changeClass(r.change1d)}">${fmtPct(r.change1d)}</td>
        <td>${defiEsc(r.chains || "—")}</td>
        <td>${defiRiskMini(r.risk)}</td>
      </tr>`,
    )
    .join("");
}

function renderDefiPegPanel(data) {
  const host = dfEl("defi-wrapped-pegs");
  if (!host) return;
  const prices = (data.prices || []).filter((p) => p.name !== "BTC");
  if (!prices.length) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const body = dfEl("defi-wrapped-pegs-body");
  if (!body) return;
  body.innerHTML = prices
    .map(
      (p) => `<tr>
      <td>${defiEsc(p.name)}</td>
      <td class="mono">${p.price != null ? fmtUsd(p.price, false) : "—"}</td>
      <td class="mono ${Math.abs(p.pegBps || 0) >= 40 ? "negative" : "positive"}">${fmtBps(p.pegBps)}</td>
    </tr>`,
    )
    .join("");
}

function renderDefiStakingPools(data) {
  const wrap = dfEl("defi-staking-pools-wrap");
  const head = dfEl("defi-staking-pools-head");
  const body = dfEl("defi-staking-pools-body");
  if (!wrap || !body) return;
  const rows = data.pools || [];
  if (!rows.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  if (head) {
    head.innerHTML = theadHtml([
      ["defi-col-protocol", "Yield pool"],
      ["defi-col-chain", "Chain"],
      ["defi-col-tvl", "TVL"],
      ["defi-col-apy", "APY"],
      ["defi-col-apy-split", "Base / reward"],
      ["defi-col-risk", "Risk"],
    ]);
  }
  body.innerHTML = rows
    .map(
      (r) => `<tr>
      <td>${defiEsc(r.name)}<span class="defi-symbol-tag">${defiEsc(r.symbol || "")}</span></td>
      <td class="mono">${defiEsc(r.chain || "—")}</td>
      <td class="mono">${fmtUsd(r.tvl)}</td>
      <td>${fmtApyCell(r)}</td>
      <td class="mono">${fmtApy(r.apyBase, r)} / ${fmtApy(r.apyReward, r)}</td>
      <td>${defiRiskMini(r.risk)}</td>
    </tr>`,
    )
    .join("");
}

function defiTicketHtml(ticket) {
  const risk = ticket.risk || {};
  const legs = (ticket.legs || [])
    .map(
      (L) => `<tr>
      <td class="mono">${defiEsc(L.side)}</td>
      <td>${defiEsc(L.asset || "—")}</td>
      <td>${defiEsc(L.venue || "—")}</td>
      <td>${defiEsc(L.chain || ticket.chain || "—")}</td>
      <td>${defiEsc(L.note || "")}</td>
    </tr>`,
    )
    .join("");
  const sc = ticket.score || {};
  return (
    `<article class="vol-ticket${ticket.rank === 1 ? " vol-ticket--best" : ""}" data-trade-id="${defiEsc(String(ticket.id))}">` +
    `<header class="vol-ticket-head">` +
    `<span class="vol-ticket-badge vol-ticket-badge--rank${ticket.rank === 1 ? " vol-ticket-badge--rank1" : ""}">#${ticket.rank}</span>` +
    `<span class="vol-ticket-title">${defiEsc(ticket.title)}</span>` +
    (ticket.family ? `<span class="vol-ticket-badge">${defiEsc(ticket.family)}</span>` : "") +
    `<span class="vol-ticket-badge vol-ticket-badge--soph">${defiEsc(ticket.sophistication || "")}</span>` +
    (ticket.paper ? `<span class="vol-ticket-badge vol-ticket-badge--paper">PAPER</span>` : "") +
    `</header>` +
    `<p class="vol-ticket-scoreline">Attract <span class="mono">${sc.attract ?? "—"}</span> · Process <span class="mono">${sc.process ?? "—"}</span> · Composite <span class="mono">${sc.composite ?? "—"}</span> · Grade <strong>${defiEsc(sc.grade || "—")}</strong></p>` +
    `<p class="vol-ticket-intent"><strong>Idea in plain English:</strong> ${defiEsc(ticket.intent || "")}</p>` +
    `<ul class="vol-ticket-meta">` +
    `<li><strong>Family:</strong> ${defiEsc(ticket.family || "—")} · <strong>Venue:</strong> ${defiEsc(ticket.venue || "—")} · ${defiEsc(ticket.chain || "—")}</li>` +
    `<li><strong>Cash APY (used to rank):</strong> ${fmtApyCell(ticket)}` +
    (ticket.apyBase != null ? ` · Llama base ${fmtApy(ticket.apyBase, ticket)} / reward ${fmtApy(ticket.apyReward, ticket)}` : "") +
    `</li>` +
    (ticket.apyNote ? `<li><strong>APY note:</strong> ${defiEsc(ticket.apyNote)}</li>` : "") +
    `<li><strong>TVL:</strong> ${fmtUsd(ticket.tvl)}</li>` +
    `<li><strong>What must be true (entry gate):</strong> ${defiEsc(ticket.gate || "—")}</li>` +
    `<li><strong>Planned exit:</strong> ${defiEsc(ticket.exit || "—")}</li>` +
    `<li><strong>Max loss path:</strong> ${defiEsc(ticket.maxLoss || "—")}</li>` +
    `</ul>` +
    (ticket.how?.length
      ? `<h3 class="vol-plan-h">How it works (plain steps)</h3><ol class="vol-plan-list">${ticket.how.map((s) => `<li>${defiEsc(s)}</li>`).join("")}</ol>`
      : "") +
    (ticket.assumptions?.length
      ? `<h3 class="vol-plan-h">${ticket.paper ? "Assumptions we use on this paper example" : "Assumptions on this desk"}</h3><ul class="vol-plan-list">${ticket.assumptions.map((s) => `<li>${defiEsc(s)}</li>`).join("")}</ul>`
      : "") +
    defiRiskStackHtml(risk) +
    `<div class="vol-ticket-legs-wrap"><table class="vol-ticket-legs"><thead><tr><th>Side</th><th>Asset</th><th>Venue</th><th>Chain</th><th>Note</th></tr></thead><tbody>${legs}</tbody></table></div>` +
    `<div class="vol-ticket-actions">` +
    `<button type="button" class="vol-execute-btn" data-defi-dryrun="1" data-trade-id="${defiEsc(String(ticket.id))}" data-trade-title="${defiEsc(ticket.title)}">Log dry-run</button>` +
    `<span class="vol-execute-hint">Does not send a transaction. Logs a checklist in this browser only.</span>` +
    `</div>` +
    `<div class="vol-em-log" id="defi-em-log"></div>` +
    `</article>`
  );
}

function defiSelectPlanTicket(id, tickets, { scroll = false } = {}) {
  const list = tickets || [];
  if (!list.length) return;
  const wanted = String(id || defiPlanTicketSel || list[0].id);
  const ticket = list.find((t) => String(t.id) === wanted) || list[0];
  defiPlanTicketSel = String(ticket.id);
  const host = dfEl("defi-trade-plan-host");
  host?.querySelectorAll(".defi-summary-row").forEach((tr) => {
    tr.classList.toggle("defi-summary-row--sel", tr.getAttribute("data-defi-ticket-id") === defiPlanTicketSel);
  });
  const detail = dfEl("defi-ticket-detail");
  if (!detail) return;
  detail.innerHTML = defiTicketHtml(ticket);
  detail.querySelector("[data-defi-dryrun]")?.addEventListener("click", () => {
    const log = dfEl("defi-em-log");
    if (!log) return;
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    const entry = {
      t: stamp,
      id: ticket.id,
      title: ticket.title,
      live: false,
    };
    try {
      const prev = JSON.parse(localStorage.getItem("defi-em-dryrun-log") || "[]");
      prev.unshift(entry);
      localStorage.setItem("defi-em-dryrun-log", JSON.stringify(prev.slice(0, 40)));
    } catch {
      /* ignore */
    }
    log.insertAdjacentHTML(
      "afterbegin",
      `<div class="defi-em-log-line"><span class="mono">${stamp}</span> <strong>${defiEsc(ticket.title)}</strong> · dry-run logged (not sent)</div>`,
    );
  });
  window.decorateHelpLabels?.(defiScreenRoot("strategies"));
  if (scroll) detail.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function defiBindTicketPicker(tickets) {
  const host = dfEl("defi-trade-plan-host");
  if (!host) return;
  host.querySelectorAll("tr.defi-summary-row[data-defi-ticket-id]").forEach((tr) => {
    if (tr.dataset.defiPickBound === "1") return;
    tr.dataset.defiPickBound = "1";
    const open = () => defiSelectPlanTicket(tr.getAttribute("data-defi-ticket-id"), tickets, { scroll: true });
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function renderDefiStrategies(data) {
  const host = dfEl("defi-trade-plan-host");
  if (!host) return;
  const showAdv = dfEl("defi-show-advanced") ? !!dfEl("defi-show-advanced").checked : true;
  const tickets = (data.tickets || []).filter((t) => showAdv || t.sophistication === "Core");
  if (!tickets.some((t) => String(t.id) === String(defiPlanTicketSel))) {
    defiPlanTicketSel = tickets[0] ? String(tickets[0].id) : "1";
  }
  renderDefiTable("strategies", { ...data, table: tickets, tableMode: "strategies" });
  defiBindTicketPicker(tickets);
  defiSelectPlanTicket(defiPlanTicketSel, tickets);
}

function paintDefiLineChart(canvasId, data, w, h, options = {}) {
  const pts = data?.points || [];
  if (!pts.length) return;

  const canvas = dfEl(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 18, right: 20, bottom: 36, left: 64 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const raw = pts.map((p) => p.close);
  const asApy = options.asApy || Math.max(...raw) <= 2;
  const closes = asApy ? raw.map((v) => apyFraction(v) ?? v) : raw;
  const minV = Math.min(...closes);
  const maxV = Math.max(...closes);
  const range = maxV - minV || 0.01;
  const color = options.color || "#a855f7";
  const fmtY = (v) => (asApy ? fmtApy(v) : fmtUsd(v));

  ctx.fillStyle = "rgba(168, 85, 247, 0.12)";
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
  ctx.fillText(fmtY(maxV), pad.left - 6, pad.top + 10);
  ctx.fillText(fmtY(minV), pad.left - 6, h - pad.bottom);

  drawTimeAxisLabels(ctx, w, h, pad, pts.length, (i) =>
    fmtChartDate(pts[i]?.date, pts.length > 120),
  );
}

function paintDefiDominanceChart(data, w, h) {
  const items = data?.items || [];
  if (!items.length) return;

  const canvas = dfEl("defi-stables-dominance-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 16, right: 16, bottom: 28, left: 72 };
  const barH = Math.min(22, (h - pad.top - pad.bottom) / items.length - 6);
  const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#eab308", "#94a3b8"];
  const chartW = w - pad.left - pad.right;
  const co = window.ChartOutlier;
  const values = items.map((i) => i.share || 0);
  const outlier = co?.isBarOutlier(values);
  const outlierIdx = outlier ? co.findOutlierIndex(items, (i) => i.share || 0) : -1;
  const scaleMax = co?.barScaleMax(values, outlier) ?? Math.max(...values, 1);

  items.forEach((item, idx) => {
    const y = pad.top + idx * (barH + 8);
    const color = colors[idx % colors.length];
    let valueX;

    if (outlier && idx === outlierIdx) {
      valueX = co.drawBrokenHBar(ctx, {
        x0: pad.left,
        y,
        bodyH: barH,
        chartW,
        colorStart: color,
        colorEnd: color,
      });
    } else {
      const barW = ((item.share || 0) / scaleMax) * chartW;
      ctx.fillStyle = color;
      ctx.fillRect(pad.left, y, barW, barH);
      valueX = pad.left + barW;
    }

    ctx.fillStyle = "#c8d0dc";
    ctx.font = "11px IBM Plex Sans, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(item.name, pad.left - 8, y + barH * 0.72);
    ctx.textAlign = "left";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.fillStyle = "#7d8799";
    ctx.fillText(`${fmtNum(item.share, 1)}% · ${fmtUsd(item.mcap)}`, valueX + 8, y + barH * 0.72);
  });
}

function renderDefiCommentary(section, data) {
  const node = dfEl(`defi-${section}-commentary`);
  if (!node) return;
  node.innerHTML = buildDefiCommentary(data)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function renderDefiCharts(section, data) {
  const chartTitle = dfEl(`defi-${section}-chart-title`);
  if (chartTitle) {
    setHelpTitle(
      chartTitle,
      data.chartLabel || "Chart",
      chartTitle.dataset.helpKey || "defi-tvl-chart",
    );
  }

  const chartWrap = dfEl(`defi-${section}-chart-wrap`);
  const chart2Wrap = dfEl(`defi-${section}-chart2-wrap`);

  const hasChart = (data.chart?.points || []).length >= 2;
  if (chartWrap) chartWrap.hidden = !hasChart;

  if (section === "stables") {
    if (hasChart) {
      scheduleChartDraw(dfEl(`defi-${section}-chart`), (w, h) =>
        paintDefiLineChart(`defi-${section}-chart`, data.chart, w, h, { color: "#22c55e", asApy: false }),
      );
    }
    const hasDom = (data.chart2?.items || []).length > 0;
    if (chart2Wrap) chart2Wrap.hidden = !hasDom;
    if (hasDom) {
      scheduleChartDraw(dfEl("defi-stables-dominance-chart"), (w, h) =>
        paintDefiDominanceChart(data.chart2, w, h),
      );
    }
    return;
  }

  if (hasChart) {
    const asApy = section === "lending" || section === "liquidity" || section === "borrowing";
    scheduleChartDraw(dfEl(`defi-${section}-chart`), (w, h) =>
      paintDefiLineChart(`defi-${section}-chart`, data.chart, w, h, { asApy }),
    );
  }
}

function renderDefiScreen(section, data, opts = {}) {
  if (!data) return;
  defiCache[section] = data;

  const updateEl = dfEl(`defi-${section}-update`);
  if (updateEl) {
    updateEl.textContent = window.DashboardSWR?.formatPanelMeta({
      fetchedAt: data.fetchedAt,
      source: data.source || "DeFi Llama",
      stale: opts.stale,
      refreshing: opts.refreshing,
      refreshFailed: opts.refreshFailed,
    }) || "—";
    updateEl.classList.toggle(
      "header-meta--stale",
      !!(opts.stale && (opts.refreshing || opts.refreshFailed)),
    );
  }

  renderDefiHeroes(section, data);
  renderDefiRiskKpis(section, data);
  renderDefiPrimer(section, data);
  if (section === "strategies") {
    renderDefiStrategies(data);
  } else {
    renderDefiTable(section, data);
  }
  if (section === "wrapped") renderDefiPegPanel(data);
  if (section === "staking") renderDefiStakingPools(data);
  renderDefiCommentary(section, data);
  renderDefiCharts(section, data);
  window.decorateHelpLabels?.(defiScreenRoot(section));
}

async function loadDefiSection(section) {
  if (!DEFI_SECTIONS.includes(section)) return;
  defiActiveSection = section;

  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: `defi:v5:${section}`,
      l1: "defi",
      source: "DeFi Llama",
      fetch: () => fetchDefiSection(section),
      render: (data, opts = {}) => {
        if (opts.loading) {
          const body = dfEl(`defi-${section}-table-body`);
          if (body) body.innerHTML = '<tr><td colspan="8">Loading DeFi data…</td></tr>';
          return;
        }
        renderDefiScreen(section, data, opts);
      },
    });
  } catch (err) {
    console.error("DeFi load failed:", section, err);
    const commentary = dfEl(`defi-${section}-commentary`);
    if (commentary && !defiCache[section]) {
      commentary.innerHTML = `<p>Failed to load ${section} data. Is server.py running?</p>`;
    }
  }
}

function startDefiPoll() {
  if (defiPollTimer) return;
  defiPollTimer = setInterval(() => {
    if (defiActiveSection) loadDefiSection(defiActiveSection);
  }, DEFI_POLL_MS);
}

function initDefiModule() {
  if (defiReady) return;
  defiReady = true;
  window.addEventListener("resize", () => {
    if (!defiActiveSection || !defiCache[defiActiveSection]) return;
    renderDefiCharts(defiActiveSection, defiCache[defiActiveSection]);
  });
  dfEl("defi-show-advanced")?.addEventListener("change", () => {
    if (defiCache.strategies) renderDefiStrategies(defiCache.strategies);
  });
}

window.loadDefiDashboard = function () {
  initDefiModule();
  startDefiPoll();
  window.decorateHelpLabels?.(document.getElementById("dashboard-defi"));
};

window.loadDefiSection = loadDefiSection;
