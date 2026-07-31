/** Prediction Markets — Polymarket Gamma + Kalshi via /api/prediction-markets */

const PM_POLL_MS = 60_000;
const PM_API = "/api/prediction-markets";

const PM_PLATFORM_LABELS = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  deribit: "Deribit",
};
const PM_TOPIC_LABELS = {
  bitcoin: "Bitcoin",
  finance: "Finance",
  economics: "Economics",
  politics: "Politics",
  geopolitics: "Geopolitics",
};

let pmReady = false;
let pmPollTimer = null;
let pmData = null;
let pmLoading = false;
let pmError = null;
let pmSelected = null;

const pmDefaultFilters = () => ({
  topics: new Set(),
  platform: "all",
  status: "active",
  search: "",
  sort: "volume24h",
  view: "table",
});

let pmFilters = pmDefaultFilters();

function pmEl(id) {
  return document.getElementById(id);
}

function pmFmtUsd(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
}

function pmFmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function pmFmtPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(1) + "%";
}

function pmSparklineSvg(points, width = 56, height = 20) {
  if (!points?.length) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 0.01;
  const coords = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * width;
    const y = height - ((p - min) / span) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trend = points[points.length - 1] >= points[0] ? "#0ecb81" : "#f6465d";
  return `<svg class="pm-spark" width="${width}" height="${height}" aria-hidden="true"><polyline fill="none" stroke="${trend}" stroke-width="1.5" points="${coords.join(" ")}"/></svg>`;
}

function pmPlatformBadge(platform) {
  const label = PM_PLATFORM_LABELS[platform] || platform;
  return `<span class="pm-badge pm-badge--${platform}">${label}</span>`;
}

function pmTopicTags(topics) {
  return (topics || [])
    .slice(0, 2)
    .map((t) => `<span class="pm-cat-tag">${PM_TOPIC_LABELS[t] || t}</span>`)
    .join("");
}

function pmMockPayload() {
  const markets = [
    {
      id: "mock-poly-btc-100k-2026",
      question: "Will Bitcoin reach $100,000 before 2027?",
      yesProb: 58,
      noProb: 42,
      yesOdds: 0.58,
      noOdds: 0.42,
      volume24h: 284500,
      volumeTotal: 4200000,
      liquidity: 412000,
      endDate: "2026-12-31",
      platform: "polymarket",
      topics: ["bitcoin"],
      url: "https://polymarket.com/event/bitcoin-price-before-2027",
      description: "Resolves Yes if BTC trades at or above $100k before Jan 1, 2027.",
      sparkline: [0.52, 0.55, 0.58],
      active: true,
      resolved: false,
      btcHighlight: true,
    },
    {
      id: "mock-kalshi-btc-above-week",
      question: "BTC above $108,000 this week?",
      yesProb: 47,
      noProb: 53,
      yesOdds: 0.47,
      noOdds: 0.53,
      volume24h: 86400,
      volumeTotal: 980000,
      liquidity: 124000,
      endDate: "2026-07-04",
      platform: "kalshi",
      topics: ["bitcoin"],
      url: "https://kalshi.com/markets/kxbtc",
      sparkline: [0.41, 0.44, 0.47],
      active: true,
      resolved: false,
      btcHighlight: true,
    },
    {
      id: "mock-poly-fed-cut-jul",
      question: "Will the Fed cut rates at the July 2026 FOMC meeting?",
      yesProb: 62,
      noProb: 38,
      yesOdds: 0.62,
      noOdds: 0.38,
      volume24h: 412000,
      volumeTotal: 8900000,
      liquidity: 520000,
      endDate: "2026-07-30",
      platform: "polymarket",
      topics: ["finance", "economics"],
      url: "https://polymarket.com/event/fed-decision-july-2026",
      description: "Fed funds path drives liquidity and risk appetite.",
      sparkline: [0.55, 0.58, 0.62],
      active: true,
      resolved: false,
      btcHighlight: false,
    },
    {
      id: "mock-poly-ukraine-ceasefire",
      question: "Ukraine–Russia ceasefire before end of 2026?",
      yesProb: 31,
      noProb: 69,
      yesOdds: 0.31,
      noOdds: 0.69,
      volume24h: 312000,
      volumeTotal: 5100000,
      endDate: "2026-12-31",
      platform: "polymarket",
      topics: ["geopolitics"],
      url: "https://polymarket.com/event/ukraine-ceasefire-2026",
      sparkline: [0.28, 0.29, 0.31],
      active: true,
      resolved: false,
      btcHighlight: false,
    },
  ];
  return {
    updatedAt: new Date().toISOString(),
    source: "client-mock",
    mockOnly: true,
    errors: [],
    markets,
    heroes: [
      { name: "BTC > $100k", value: "58%", sub: "Implied probability" },
      { name: "Active markets", value: String(markets.filter((m) => m.active).length), sub: "Filtered universe" },
      { name: "24h volume", value: pmFmtUsd(markets.reduce((s, m) => s + (m.volume24h || 0), 0)), sub: "Combined" },
      { name: "Platforms", value: "2", sub: "Polymarket + Kalshi" },
    ],
    outlook: {
      headline: "1 arb opportunity · max spread 10pp",
      arbCount: 1,
      maxArbEdge: 10,
      signals: [
        { topic: "bitcoin", label: "Bitcoin", avgYes: 53, count: 2, volume24h: 370900, bias: "neutral" },
      ],
      arbitrage: [
        {
          type: "sum-discount",
          typeLabel: "Yes+No lock",
          edgePct: 2.4,
          grossEdgePct: 4.0,
          feesPct: 1.6,
          locked: true,
          confidence: "high",
          title: "Yes+No locked arb · 2.4% net",
          summary: "Mids 48¢ + 48¢ = 96¢ · all-in $0.976 incl. fees/slip → lock $1",
          action: "Buy Yes + Buy No on Kalshi — payout $1 either way; net edge 2.4% after fees",
          plainEnglish:
            "On one market, buying both Yes and No costs less than $1 after fees. One side always pays $1 — lock the difference.",
          deskNotes:
            "Binary completeness arb. Edge = 1 − (yes + no + fees + slip). Confirm simultaneous fills.",
          risks: ["Wide books", "Partial fill", "Resolution dispute"],
          checklist: ["Both sides available", "Size to min liquidity"],
          economics: {
            allInCost: 0.976,
            midSum: 0.96,
            feesSlip: 0.016,
            netEdge: 0.024,
            roiOnCapitalPct: 2.5,
            exampleNotional: 1000,
            exampleCapital: 976,
            exampleProfit: 24,
            costStack: { midsPct: 96, feesPct: 1.6, edgePct: 2.4, allInPct: 97.6, payoutPct: 100 },
          },
          legs: [
            {
              side: "buy_yes",
              platform: "kalshi",
              mid: 0.48,
              allIn: 0.488,
              fee: 0.008,
              slip: 0.006,
              label: "Buy Yes",
              role: "Collects $1 if event happens",
            },
            {
              side: "buy_no",
              platform: "kalshi",
              mid: 0.48,
              allIn: 0.488,
              fee: 0.008,
              slip: 0.006,
              label: "Buy No",
              role: "Collects $1 if event fails",
            },
          ],
          payoffStates: [
            { state: "Event Yes", payoff: 1, note: "Yes leg wins" },
            { state: "Event No", payoff: 1, note: "No leg wins" },
          ],
          markets: [
            {
              platform: "kalshi",
              question: "BTC above $108,000 this week?",
              yesProb: 48,
              noProb: 48,
              url: "https://kalshi.com/markets/kxbtc",
              volume24h: 120000,
            },
          ],
        },
      ],
      lines: [
        "Client mock — fee-aware arb scan (locked vs relative value). Live API adds Deribit digital basis.",
      ],
    },
    filters: {
      topics: Object.entries(PM_TOPIC_LABELS).map(([id, label]) => ({ id, label })),
      platforms: [
        { id: "all", label: "All" },
        { id: "polymarket", label: "Polymarket" },
        { id: "kalshi", label: "Kalshi" },
      ],
      statuses: [
        { id: "active", label: "Active" },
        { id: "resolved", label: "Resolved" },
        { id: "all", label: "All" },
      ],
      sorts: [
        { id: "volume24h", label: "24h Volume" },
        { id: "volumeTotal", label: "Total Volume" },
        { id: "probability", label: "Probability" },
        { id: "endDate", label: "End Date" },
        { id: "liquidity", label: "Liquidity" },
      ],
    },
  };
}

async function pmFetch(refresh = false) {
  const params = new URLSearchParams({ _: String(Date.now()) });
  if (refresh) params.set("refresh", "1");
  try {
    const res = await fetch(`${PM_API}?${params}`);
    if (res.ok) return res.json();
    const err = await res.json().catch(() => ({}));
    const msg = err.error || `Prediction markets ${res.status}`;
    if (res.status === 404 || /unknown api route/i.test(msg)) return pmMockPayload();
    throw new Error(msg);
  } catch (err) {
    if (err instanceof TypeError || /failed to fetch/i.test(err.message || "")) return pmMockPayload();
    throw err;
  }
}

function pmFiltersActive() {
  return (
    pmFilters.topics.size > 0 ||
    pmFilters.platform !== "all" ||
    pmFilters.status !== "active" ||
    pmFilters.search.trim() !== ""
  );
}

function pmSortMarkets(rows) {
  const key = pmFilters.sort;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (key === "probability") return (b.yesProb || 0) - (a.yesProb || 0);
    if (key === "endDate") {
      const da = a.endDate ? new Date(a.endDate).getTime() : Infinity;
      const db = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      return da - db;
    }
    if (key === "liquidity") return (b.liquidity || 0) - (a.liquidity || 0);
    if (key === "volumeTotal") return (b.volumeTotal || 0) - (a.volumeTotal || 0);
    return (b.volume24h || 0) - (a.volume24h || 0);
  });
  return sorted;
}

function pmFilteredMarkets() {
  const q = pmFilters.search.trim().toLowerCase();
  const rows = (pmData?.markets || []).filter((m) => {
    if (pmFilters.topics.size > 0) {
      const topics = m.topics || [];
      if (!topics.some((t) => pmFilters.topics.has(t))) return false;
    }
    if (pmFilters.platform !== "all" && m.platform !== pmFilters.platform) return false;
    if (pmFilters.status === "active" && m.resolved) return false;
    if (pmFilters.status === "resolved" && !m.resolved) return false;
    if (q) {
      const hay = `${m.question || ""} ${m.description || ""} ${m.eventTitle || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return pmSortMarkets(rows);
}

function pmRenderHeroes() {
  const strip = pmEl("pm-heroes");
  if (!strip) return;
  strip.innerHTML = (pmData?.heroes || [])
    .map(
      (h) => `
      <article class="deriv-hero-block pm-hero-block">
        <span class="deriv-hero-label">${h.name}</span>
        <span class="deriv-hero-value">${h.value ?? "—"}</span>
        <span class="deriv-hero-sub">${h.sub || ""}</span>
      </article>`,
    )
    .join("");
}

function pmArbTypeLabel(type) {
  return (
    {
      "cross-platform": "Cross-venue lock",
      "sum-discount": "Yes + No lock",
      monotonicity: "Strike ladder lock",
      "deribit-basis": "Prediction market vs Deribit",
    }[type] || type
  );
}

function pmArbConfClass(c) {
  const x = String(c || "").toLowerCase();
  if (x === "high") return "high";
  if (x === "low") return "low";
  return "medium";
}

/** Escape text for HTML attributes / tooltip content. */
function pmEscAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Label with a hover/focus tooltip (also sets native title for accessibility).
 * Prefer full words; only shorten when the full phrase is already in the tip.
 */
function pmTip(label, tip) {
  const t = pmEscAttr(tip);
  return `<span class="pm-tip" tabindex="0" data-tip="${t}" title="${t}">${label}<span class="pm-tip__mark" aria-hidden="true">?</span></span>`;
}

/** Stacked cost bar: mid prices + fees + edge → $1 (locked) or prediction market vs Deribit. */
function pmArbCostStackSvg(a) {
  const e = a.economics || {};
  const stack = e.costStack || {};
  if (a.type === "deribit-basis" && stack.pmPct != null && stack.deribitPct != null) {
    const pm = Math.max(0, Math.min(100, Number(stack.pmPct) || 0));
    const dr = Math.max(0, Math.min(100, Number(stack.deribitPct) || 0));
    const maxV = Math.max(pm, dr, 1);
    const wPm = (pm / maxV) * 100;
    const wDr = (dr / maxV) * 100;
    return `
      <div class="pm-arb-chart">
        <div class="pm-arb-chart__title">${pmTip(
          "Implied probability · prediction market vs Deribit",
          "Two estimates of the chance Bitcoin finishes above the strike by the matched expiry. Prediction market = Yes mid price. Deribit = Black–Scholes risk-neutral digital probability from option mark implied volatility (not “BS” as slang).",
        )}</div>
        <div class="pm-arb-cmp-bars">
          <div class="pm-arb-cmp-row">
            <span class="pm-arb-cmp-label">${pmTip("Pred. mkt Yes", "Yes contract mid price on Polymarket or Kalshi, shown as a probability (50¢ ≈ 50%).")}</span>
            <div class="pm-arb-cmp-track"><span class="pm-arb-cmp-fill pm-arb-cmp-fill--pm" style="width:${wPm}%"></span></div>
            <span class="pm-arb-cmp-val mono">${pm.toFixed(1)}%</span>
          </div>
          <div class="pm-arb-cmp-row">
            <span class="pm-arb-cmp-label">${pmTip("Deribit digital", "Black–Scholes cash-or-nothing digital probability: chance spot ends above the strike under the risk-neutral measure, using Deribit mark implied volatility. Formula uses N(d₂) from the standard Black–Scholes model.")}</span>
            <div class="pm-arb-cmp-track"><span class="pm-arb-cmp-fill pm-arb-cmp-fill--dr" style="width:${wDr}%"></span></div>
            <span class="pm-arb-cmp-val mono">${dr.toFixed(1)}%</span>
          </div>
        </div>
        <div class="pm-arb-chart__legend">
          <span><i class="pm-arb-dot pm-arb-dot--pm"></i> Prediction market Yes</span>
          <span><i class="pm-arb-dot pm-arb-dot--dr"></i> Deribit Black–Scholes digital</span>
        </div>
      </div>`;
  }
  const mids = Math.max(0, Number(stack.midsPct) || 0);
  const fees = Math.max(0, Number(stack.feesPct) || 0);
  const edge = Math.max(0, Number(stack.edgePct) || 0);
  const total = mids + fees + edge || 100;
  const pM = (mids / total) * 100;
  const pF = (fees / total) * 100;
  const pE = (edge / total) * 100;
  return `
    <div class="pm-arb-chart">
      <div class="pm-arb-chart__title">${pmTip(
        "Cost stack per $1 contract face",
        "Think of each contract as paying $1.00 if it wins. This bar shows: (1) mid prices you pay for the legs, (2) estimated fees + slippage buffer, (3) remaining net edge. For a locked structure those three pieces add up to $1.00.",
      )}</div>
      <div class="pm-arb-stack" ${`title="${pmEscAttr("Mid prices + fees/slippage + net edge = $1.00 face when locked")}"`}>
        <span class="pm-arb-stack__seg pm-arb-stack__seg--mids" style="width:${pM}%"></span>
        <span class="pm-arb-stack__seg pm-arb-stack__seg--fees" style="width:${pF}%"></span>
        <span class="pm-arb-stack__seg pm-arb-stack__seg--edge" style="width:${pE}%"></span>
      </div>
      <div class="pm-arb-chart__legend">
        <span>${pmTip(`Mid prices ${mids.toFixed(1)}¢`, "Sum of Yes/No (or other leg) mid prices in cents. Mid = halfway between bid and ask when we only have a single print; live books can be worse.")}</span>
        <span>${pmTip(`Fees + slippage ${fees.toFixed(1)}¢`, "Modelled trading fees (e.g. Kalshi) plus a conservative slippage buffer so we do not treat mid prices as free fills.")}</span>
        <span>${pmTip(`Net edge ${edge.toFixed(1)}¢`, "What is left after mids and cost buffers — your estimated locked profit per $1 face if rules match and you get filled.")}</span>
        ${a.locked ? `<span class="mono">→ payout 100¢</span>` : ""}
      </div>
    </div>`;
}

function pmArbPayoffStrip(a) {
  const states = a.payoffStates || [];
  if (!states.length) return "";
  return `
    <div class="pm-arb-payoffs">
      <div class="pm-arb-chart__title">${pmTip(
        "Payoff by outcome",
        "What the combined position pays when the event resolves, before your entry cost. A locked structure aims for at least $1.00 in every relevant outcome so profit = $1 − all-in cost.",
      )}</div>
      <div class="pm-arb-payoff-grid">
        ${states
          .map((s) => {
            const p = s.payoff;
            const pTxt = p == null ? "Not locked" : `$${Number(p).toFixed(0)}`;
            return `
          <div class="pm-arb-payoff-cell" title="${pmEscAttr(s.note || s.state || "")}">
            <span class="pm-arb-payoff-state">${s.state || "—"}</span>
            <span class="pm-arb-payoff-val mono">${pTxt}</span>
            <span class="pm-arb-payoff-note">${s.note || ""}</span>
          </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function pmArbMetricsGrid(a) {
  const e = a.economics || {};
  const sz = a.sizing || {};
  const edge = Number(a.edgePct) || 0;
  const gross = a.grossEdgePct != null ? Number(a.grossEdgePct) : null;
  const fees = a.feesPct != null ? Number(a.feesPct) : null;
  const roi = e.roiOnCapitalPct != null ? Number(e.roiOnCapitalPct) : null;
  const cap = e.exampleCapital != null ? Number(e.exampleCapital) : null;
  const profit = e.exampleProfit != null ? Number(e.exampleProfit) : null;
  const isDeribit = a.type === "deribit-basis" || sz.mode === "deribit_min_match";
  const cells = [
    {
      k: "Net edge",
      v: `+${edge.toFixed(1)}%`,
      tip: "Estimated profit after fees and the slippage buffer, as a percent of the $1.00 contract face. Example: +2.4% ≈ 2.4¢ locked profit per $1 face if everything fills as modelled.",
    },
    {
      k: "Gross edge",
      v: gross != null ? `+${gross.toFixed(1)}%` : "—",
      tip: "Edge before fee and slippage haircuts — usually larger than net edge. Useful to see how much of the print is “real” vs cost buffer.",
    },
    {
      k: "Fees + slippage",
      v: fees != null ? `${fees.toFixed(1)}%` : "—",
      tip: "Sum of modelled venue fees and a conservative slippage buffer. Slippage = extra cost if you cannot buy exactly at the mid price (wide book or market order).",
    },
    {
      k: "Return on capital",
      v: roi != null ? `${roi.toFixed(0)}%` : "—",
      tip: "Net edge ÷ all-in capital you put up for the legs. Different from net edge vs $1 face: if you only put up 90¢, a 2¢ profit is about 2.2% on capital.",
    },
    {
      k: isDeribit ? "Min-size capital" : "$1,000 example",
      v:
        cap != null
          ? profit != null
            ? `$${cap.toFixed(0)} → ~$${profit.toFixed(0)}`
            : `~$${cap.toFixed(0)}`
          : "—",
      tip: isDeribit
        ? "Rough total capital at the Deribit minimum of 0.1 BTC, with prediction-market face scaled to match. Edge column is model gap × face — not locked profit. See Trade size guide below."
        : "Scaled to about $1,000 of contract face: capital you deploy → estimated locked profit if the structure pays $1 per face and rules match.",
    },
    {
      k: "Confidence",
      v: (a.confidence || "—").toString(),
      tip: "How much we trust the match/model: high = same event / clear lock math; medium = good but check rules; low = expiry mismatch, model-heavy Deribit comparison, or thin match.",
      cls: `pm-arb-metric--conf-${pmArbConfClass(a.confidence)}`,
    },
  ];
  if (isDeribit && sz.minDeribitBtc != null) {
    cells.splice(4, 0, {
      k: "Deribit min size",
      v: `${Number(sz.minDeribitBtc).toFixed(1)} BTC`,
      tip: `Deribit inverse Bitcoin options minimum order size is ${Number(sz.minDeribitBtc).toFixed(1)} BTC. You cannot hedge with a smaller options clip. Prediction-market size is scaled so $ face ≈ 0.1 × Bitcoin index.`,
    });
  }
  return `
    <div class="pm-arb-metrics">
      ${cells
        .map(
          (c) => `
        <div class="pm-arb-metric ${c.cls || ""}">
          <span class="pm-arb-metric__k">${pmTip(c.k, c.tip)}</span>
          <span class="pm-arb-metric__v mono">${c.v}</span>
        </div>`,
        )
        .join("")}
    </div>`;
}

function pmArbSummaryTable(arbs) {
  if (!arbs?.length) return "";
  const lockedN = arbs.filter((a) => a.locked).length;
  const rvN = arbs.length - lockedN;
  const maxEdge = Math.max(...arbs.map((a) => Number(a.edgePct) || 0), 0);
  const rows = arbs
    .map((a, i) => {
      const edge = Number(a.edgePct) || 0;
      const gross = a.grossEdgePct != null ? Number(a.grossEdgePct) : null;
      const fees = a.feesPct != null ? Number(a.feesPct) : null;
      const typeLabel = a.typeLabel || pmArbTypeLabel(a.type);
      const econ = a.economics || {};
      const sz = a.sizing || {};
      const title = (a.title || a.summary || typeLabel).replace(/</g, "&lt;");
      const shortTitle =
        title.length > 72 ? `${title.slice(0, 70)}…` : title;
      const venues = [
        ...new Set(
          (a.markets || [])
            .map((m) => PM_PLATFORM_LABELS[m.platform] || m.platform)
            .filter(Boolean),
        ),
      ].join(" · ");
      const cap =
        econ.exampleCapital != null
          ? `$${Number(econ.exampleCapital).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
          : "—";
      const edgeUsd =
        sz.estimatedEdgeUsd != null
          ? `~$${Number(sz.estimatedEdgeUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
          : econ.exampleProfit != null
            ? `~$${Number(econ.exampleProfit).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
            : "—";
      const lockCell = a.locked
        ? `<span class="pm-arb-sum-lock pm-arb-sum-lock--yes">Locked</span>`
        : `<span class="pm-arb-sum-lock pm-arb-sum-lock--rv">Relative value</span>`;
      const conf = (a.confidence || "—").toString();
      return `<tr class="pm-arb-sum-row" data-pm-arb-jump="${i}">
        <td class="mono pm-arb-sum-rank">${i + 1}</td>
        <td>${typeLabel}</td>
        <td>${lockCell}</td>
        <td class="mono pm-arb-sum-edge">+${edge.toFixed(1)}%</td>
        <td class="mono">${gross != null ? `+${gross.toFixed(1)}%` : "—"}</td>
        <td class="mono">${fees != null ? `${fees.toFixed(1)}%` : "—"}</td>
        <td class="pm-arb-sum-conf pm-arb-confidence--${pmArbConfClass(conf)}">${conf}</td>
        <td class="mono">${cap}</td>
        <td class="mono">${edgeUsd}</td>
        <td class="pm-arb-sum-venues">${venues || "—"}</td>
        <td class="pm-arb-sum-title" title="${pmEscAttr(title)}">${shortTitle}</td>
        <td><a class="pm-arb-sum-jump" href="#pm-arb-card-${i}">Detail →</a></td>
      </tr>`;
    })
    .join("");

  return `
    <div class="pm-arb-summary">
      <div class="pm-arb-summary__head">
        <h5>${pmTip(
          "Summary table",
          "All scanner prints in one grid, sorted as returned (typically best net edge first). Click Detail to jump to the full card with sizing, legs, and risks.",
        )}</h5>
        <span class="pm-arb-summary__meta mono">
          ${arbs.length} total · ${lockedN} locked · ${rvN} relative value · max net +${maxEdge.toFixed(1)}%
        </span>
      </div>
      <div class="pm-arb-summary__wrap">
        <table class="pm-arb-summary-table" aria-label="Arbitrage opportunities summary">
          <thead>
            <tr>
              <th class="mono">#</th>
              <th>${pmTip("Type", "Structure class: Yes+No lock, cross-venue, strike ladder, or prediction market vs Deribit.")}</th>
              <th>${pmTip("Kind", "Locked = cash structure if rules match. Relative value = model disagreement, not a free lunch.")}</th>
              <th class="mono">${pmTip("Net", "Edge after fees and slippage buffer (% of $1 face).")}</th>
              <th class="mono">${pmTip("Gross", "Edge before cost haircuts.")}</th>
              <th class="mono">${pmTip("Fees", "Modelled fees + slippage buffer.")}</th>
              <th>${pmTip("Conf.", "Scanner confidence: high / medium / low.")}</th>
              <th class="mono">${pmTip("Capital", "Example or min-size capital (Deribit packages use 0.1 BTC-matched size).")}</th>
              <th class="mono">${pmTip("Edge $", "Illustrative dollar edge at that capital/face scale. Locked = modelled profit; relative value = model gap only.")}</th>
              <th>${pmTip("Venues", "Platforms involved in the legs.")}</th>
              <th>${pmTip("Title", "Short description of the opportunity.")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function pmArbSizingPanel(a) {
  const sz = a.sizing;
  if (!sz) return "";
  const isD = sz.mode === "deribit_min_match";
  const steps = sz.steps || [];
  const rows = sz.rows || [];
  const rules = sz.rules || [];

  let table = "";
  if (isD && rows.length) {
    table = `
      <div class="pm-arb-size-table-wrap">
        <table class="pm-arb-size-table">
          <thead>
            <tr>
              <th>${pmTip("Clip", "Deribit size in BTC. Only whole multiples of 0.1 BTC.")}</th>
              <th class="mono">${pmTip("Deribit", "Options size on Deribit (Bitcoin contracts).")}</th>
              <th class="mono">${pmTip("Pred. mkt face", "Dollar face of prediction-market contracts ($1 payout each) matched to 0.1 BTC × index.")}</th>
              <th class="mono">${pmTip("Pred. capital", "All-in cost × face for the prediction-market leg.")}</th>
              <th class="mono">${pmTip("Options capital", "Rough options premium or margin estimate — not Deribit portfolio margin.")}</th>
              <th class="mono">${pmTip("Total capital", "Prediction-market capital + options capital estimate.")}</th>
              <th class="mono">${pmTip("Model gap $", "Net edge × prediction-market face. Illustrative only for relative value — not locked P&L.")}</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr class="${r.deribitBtc === 0.1 ? "pm-arb-size-row--min" : ""}">
                <td>${r.label || "—"}</td>
                <td class="mono">${r.deribitBtc != null ? r.deribitBtc.toFixed(1) : "—"} BTC</td>
                <td class="mono">${r.pmFaceUsd != null ? `$${Number(r.pmFaceUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}</td>
                <td class="mono">${r.pmCapitalUsd != null ? `$${Number(r.pmCapitalUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}</td>
                <td class="mono">${r.optionsCapitalUsd != null ? `$${Number(r.optionsCapitalUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}</td>
                <td class="mono">${r.totalCapitalUsd != null ? `$${Number(r.totalCapitalUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}</td>
                <td class="mono">${r.illustrativeEdgeUsd != null ? `~$${Number(r.illustrativeEdgeUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  } else if (rows.length) {
    table = `
      <div class="pm-arb-size-table-wrap">
        <table class="pm-arb-size-table">
          <thead>
            <tr>
              <th>Face</th>
              <th class="mono">Capital (all-in)</th>
              <th class="mono">Locked profit (if rules match)</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
                <td>${r.label || "—"}</td>
                <td class="mono">${r.capitalUsd != null ? `$${Number(r.capitalUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}</td>
                <td class="mono">${r.edgeUsd != null ? `+$${Number(r.edgeUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}</td>
                <td class="pm-arb-size-note">${r.note || ""}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  const stepsHtml = steps.length
    ? `<ol class="pm-arb-size-steps">
        ${steps
          .map(
            (s) => `<li>
            <strong>${s.venue || "Leg"}:</strong> ${s.action || ""}
            <span class="mono pm-arb-size-step-size">${s.size || ""}</span>
            ${s.capitalUsd != null ? `<span class="mono"> · capital ~$${Number(s.capitalUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>` : ""}
            ${s.note ? `<div class="pm-arb-size-step-note">${s.note}</div>` : ""}
          </li>`,
          )
          .join("")}
      </ol>`
    : "";

  return `
    <div class="pm-arb-sizing">
      <div class="pm-arb-sizing__head">
        <h5>${pmTip(
          sz.title || "Trade size guide",
          isD
            ? "Sizes the package so Deribit’s 0.1 BTC options minimum is respected, and the prediction market is scaled to the same dollar notional."
            : "Suggested face amounts for locked prediction-market structures (no Deribit minimum).",
        )}</h5>
        ${sz.subtitle ? `<p class="pm-arb-sizing__sub">${sz.subtitle}</p>` : ""}
      </div>
      ${
        isD
          ? `<div class="pm-arb-sizing__callout">
        <strong>Rule:</strong> Deribit inverse Bitcoin options minimum = <span class="mono">${Number(sz.minDeribitBtc || 0.1).toFixed(1)} BTC</span>
        ${sz.btcIndexUsd != null ? ` · index <span class="mono">$${Number(sz.btcIndexUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>` : ""}
        ${sz.minUnderlyingUsd != null ? ` → <span class="mono">~$${Number(sz.minUnderlyingUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span> underlying notional` : ""}.
        Match prediction-market face to that dollar amount; scale only in 0.1 BTC steps.
      </div>`
          : ""
      }
      ${stepsHtml}
      ${table}
      ${sz.edgeNote ? `<p class="pm-arb-sizing__edge-note">${sz.edgeNote}</p>` : ""}
      ${
        rules.length
          ? `<ul class="pm-arb-sizing__rules">${rules.map((r) => `<li>${r}</li>`).join("")}</ul>`
          : ""
      }
    </div>`;
}

function pmArbLegsTable(a) {
  const legs = a.legs || [];
  if (!legs.length) return "";
  return `
    <div class="pm-arb-legs-wrap">
      <div class="pm-arb-chart__title">${pmTip(
        "Legs (trade ticket)",
        "Each row is one contract you would buy. Mid = modelled mid price. All-in = mid + fee + slippage buffer. Role explains why that leg is in the structure.",
      )}</div>
      <table class="pm-arb-legs-table">
        <thead>
          <tr>
            <th>${pmTip("Leg", "Which contract to buy (Yes, No, or options-side exposure).")}</th>
            <th>${pmTip("Venue", "Where the contract trades: Polymarket, Kalshi, or Deribit.")}</th>
            <th class="mono">${pmTip("Mid", "Mid price of the contract in cents (0–100¢). For Yes, 40¢ means about 40% implied probability.")}</th>
            <th class="mono">${pmTip("All-in", "Mid price plus estimated fee and slippage buffer — what we assume you pay to get filled.")}</th>
            <th class="mono">${pmTip("Fee", "Venue trading fee estimate for this leg (Kalshi-style model or near-zero on many Polymarket markets).")}</th>
            <th class="mono">${pmTip("Slippage", "Buffer for buying above mid (or selling below) when the book is thin. Not a live depth quote.")}</th>
            <th>${pmTip("Role", "Why this leg is in the package (collect $1 if event happens, hedge, etc.).")}</th>
          </tr>
        </thead>
        <tbody>
          ${legs
            .map((L) => {
              const mid = L.mid != null ? `${(Number(L.mid) * 100).toFixed(1)}¢` : "—";
              const allIn = L.allIn != null ? `${(Number(L.allIn) * 100).toFixed(1)}¢` : "—";
              const fee = L.fee != null ? `${(Number(L.fee) * 100).toFixed(2)}¢` : "—";
              const slip = L.slip != null ? `${(Number(L.slip) * 100).toFixed(2)}¢` : "—";
              return `<tr>
                <td>${L.label || L.side || "—"}</td>
                <td>${PM_PLATFORM_LABELS[L.platform] || L.platform || "—"}</td>
                <td class="mono">${mid}</td>
                <td class="mono">${allIn}</td>
                <td class="mono">${fee}</td>
                <td class="mono">${slip}</td>
                <td class="pm-arb-leg-role">${L.role || L.instrument || "—"}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function pmArbMarketLinks(a) {
  const mkts = a.markets || [];
  if (!mkts.length) return "";
  return `
    <div class="pm-arb-legs">
      <div class="pm-arb-chart__title" style="margin-bottom:0.35rem">${pmTip(
        "Linked markets",
        "Open the live market pages. Check the full question text and resolution rules yourself — the scanner can pair similar-looking events that are not identical.",
      )}</div>
      ${mkts
        .map((m) => {
          const vol =
            m.volume24h != null
              ? `<span class="pm-arb-leg-meta mono" title="Traded volume in the last 24 hours">${pmFmtUsd(m.volume24h)} volume (24h)</span>`
              : "";
          const liq =
            m.liquidity != null
              ? `<span class="pm-arb-leg-meta mono" title="Reported liquidity / depth proxy from the venue feed">${pmFmtUsd(m.liquidity)} liquidity</span>`
              : "";
          return `
        <a class="pm-arb-leg" href="${m.url || "#"}" target="_blank" rel="noopener noreferrer" ${m.url ? "" : 'aria-disabled="true"'}>
          <span class="pm-arb-leg-platform">${PM_PLATFORM_LABELS[m.platform] || m.platform || "—"}</span>
          <span class="pm-arb-leg-q">${m.question || ""}</span>
          <span class="pm-arb-leg-odds mono" title="Yes mid price as percent (50% ≈ 50¢)">${pmTip("Yes", "Yes contract mid, shown as a probability.")} ${pmFmtPct(m.yesProb)}</span>
          ${vol}${liq}
        </a>`;
        })
        .join("")}
    </div>`;
}

function pmArbCardHtml(a, idx) {
  const edge = Number(a.edgePct) || 0;
  const lockCls = a.locked ? " pm-arb-card--locked" : " pm-arb-card--rv";
  const lockBadge = a.locked
    ? `<span class="pm-arb-lock-badge">${pmTip(
        "Locked · cash structure",
        "If resolution rules match and both legs fill, the package is designed to pay at least $1.00 face in every outcome — so profit ≈ $1 − all-in cost. Still not risk-free: fills, rules, and venue risk remain.",
      )}</span>`
    : `<span class="pm-arb-lock-badge pm-arb-lock-badge--rv">${pmTip(
        "Relative value · not locked",
        "Prices disagree (e.g. prediction market vs Deribit options), but the products are not the same. You can still lose money — this is a research flag, not a free lunch.",
      )}</span>`;
  const typeLabel = a.typeLabel || pmArbTypeLabel(a.type);
  const typeTips = {
    "sum-discount":
      "Buy Yes and No on the same market when the combined all-in cost is under $1. Exactly one side pays $1 at resolution.",
    "cross-platform":
      "Buy Yes on the cheaper venue and No on the richer venue when both markets resolve the same event.",
    monotonicity:
      "Strike ladder: a higher Bitcoin target priced more likely than a lower one — buy low-strike Yes and high-strike No if rules nest.",
    "deribit-basis":
      "Prediction-market odds vs Deribit Black–Scholes digital probability for a similar strike and expiry. Relative value only.",
  };
  const risks = (a.risks || []).slice(0, 4);
  const checks = (a.checklist || []).slice(0, 4);
  const id = `pm-arb-detail-${idx}`;

  return `
    <article class="pm-arb-card pm-arb-card--${a.type}${lockCls}" id="pm-arb-card-${idx}">
      <div class="pm-arb-card__head">
        <span class="pm-arb-sum-rank-badge mono">#${idx + 1}</span>
        <span class="pm-arb-type">${pmTip(typeLabel, typeTips[a.type] || "Arbitrage / relative-value structure from the scanner.")}</span>
        ${lockBadge}
        <span class="pm-arb-edge mono" title="Net edge after fees and slippage buffer">+${edge.toFixed(1)}%</span>
        <span class="pm-arb-confidence pm-arb-confidence--${pmArbConfClass(a.confidence)}">${pmTip(
          `${a.confidence || "—"} confidence`,
          "Scanner trust level for this print: high = clear lock math or tight event match; low = model-heavy or weak match — read the desk notes.",
        )}</span>
      </div>
      <h4 class="pm-arb-card__title">${a.title || typeLabel}</h4>
      <p class="pm-arb-summary">${a.summary || ""}</p>

      ${pmArbMetricsGrid(a)}

      <div class="pm-arb-visuals">
        ${pmArbCostStackSvg(a)}
        ${pmArbPayoffStrip(a)}
      </div>

      <div class="pm-arb-copy-grid">
        <div class="pm-arb-copy-block pm-arb-copy-block--plain">
          <h5>${pmTip("In plain English", "Short explanation for anyone new to prediction-market arbitrage. No jargon required.")}</h5>
          <p>${a.plainEnglish || "Buy the cheap side(s), hedge the rich side — profit if the structure pays more than it costs."}</p>
        </div>
        <div class="pm-arb-copy-block pm-arb-copy-block--desk">
          <h5>${pmTip("Desk notes", "Senior-trader detail: fee models, completeness math, Black–Scholes digitals, residual risks. “Black–Scholes” is the option pricing model — never abbreviated as “BS” here.")}</h5>
          <p>${a.deskNotes || a.description || ""}</p>
        </div>
      </div>

      <p class="pm-arb-action"><strong>${pmTip("Ticket", "Concrete legs the scanner suggests you work. Always re-check live quotes and rules before trading.")}:</strong> ${a.action || ""}</p>

      ${pmArbSizingPanel(a)}
      ${pmArbLegsTable(a)}
      ${pmArbMarketLinks(a)}

      <details class="pm-arb-details" id="${id}">
        <summary>${pmTip("Risks &amp; pre-trade checklist", "What can go wrong, and what to verify before size. Open this before treating a print as real.")}</summary>
        <div class="pm-arb-details__body">
          ${
            risks.length
              ? `<div><h6>Risks</h6><ul>${risks.map((r) => `<li>${r}</li>`).join("")}</ul></div>`
              : ""
          }
          ${
            checks.length
              ? `<div><h6>Checklist</h6><ul>${checks.map((r) => `<li>${r}</li>`).join("")}</ul></div>`
              : ""
          }
          ${
            a.matchQuality
              ? `<p class="pm-arb-match">${pmTip(
                  "Match quality",
                  "How the scanner paired the legs: strike+date is strongest; text-only matches need a careful rulebook read.",
                )}: <span class="mono">${a.matchQuality}${
                  a.similarity != null ? ` · similarity ${(Number(a.similarity) * 100).toFixed(0)}%` : ""
                }</span></p>`
              : ""
          }
        </div>
      </details>
    </article>`;
}

function pmRenderOutlook() {
  const head = pmEl("pm-outlook-head");
  const body = pmEl("pm-outlook-body");
  const outlook = pmData?.outlook;
  if (head) head.textContent = outlook?.headline || "Aggregated outlook";
  if (!body) return;

  const lines = outlook?.lines || [];
  const signals = outlook?.signals || [];
  const arbs = outlook?.arbitrage || [];

  let html = lines.map((p) => `<p>${p}</p>`).join("");

  if (signals.length) {
    html += `<div class="pm-signals"><h4 class="pm-outlook-subhead">Topic sentiment</h4><div class="pm-signal-grid">`;
    html += signals
      .slice(0, 5)
      .map(
        (s) => `
      <article class="pm-signal-card pm-signal-card--${s.bias}">
        <span class="pm-signal-label">${s.label}</span>
        <span class="pm-signal-value mono">${s.avgYes.toFixed(0)}% Yes</span>
        <span class="pm-signal-sub">${s.count} mkts · ${pmFmtUsd(s.volume24h)} 24h</span>
      </article>`,
      )
      .join("");
    html += `</div></div>`;
  }

  if (arbs.length) {
    const lockedN = arbs.filter((a) => a.locked).length;
    html += `<div class="pm-arb-section">
      <h4 class="pm-outlook-subhead">Arbitrage opportunities <span class="mono">${arbs.length}</span>${
        lockedN ? ` · <span class="pm-arb-locked-count">${lockedN} locked</span>` : ""
      }</h4>
      <p class="pm-arb-intro">
        <strong>New here:</strong> a green ${pmTip("locked", "Designed to pay at least $1 face if rules match and both legs fill — profit is roughly $1 minus what you paid.")}
        badge means the package aims to pay more than it costs if resolution rules match —
        like buying a $1 voucher for 90¢. Hover any <span class="pm-tip__mark" aria-hidden="true">?</span> for definitions.<br/>
        <strong>Experienced:</strong> edges use mid prices with fee and slippage haircuts; verify live books, rulebooks, and simultaneous fills before size.
        “Black–Scholes” is always written in full (option pricing model — not slang).
      </p>
      <div class="pm-arb-glossary">
        <span>${pmTip("Mid price", "Reference price used by the scanner (often halfway between bid and ask). Live market orders can be worse.")}</span>
        <span>${pmTip("All-in cost", "Mid price + estimated venue fee + slippage buffer.")}</span>
        <span>${pmTip("Slippage", "Extra cost assumed when you cannot trade exactly at mid (thin books, market orders).")}</span>
        <span>${pmTip("Net edge", "Estimated profit after costs, vs $1 contract face.")}</span>
        <span>${pmTip("Black–Scholes digital", "Risk-neutral probability that spot finishes above a strike, from the Black–Scholes option model using Deribit mark implied volatility. We never shorten this to “BS”.")}</span>
        <span>${pmTip("Relative value", "Two related prices disagree, but products differ — not a guaranteed lock.")}</span>
      </div>
      ${pmArbSummaryTable(arbs)}
      <h5 class="pm-arb-detail-heading">${pmTip("Full cards", "Expanded view of each row: charts, plain English, desk notes, size guide, legs, and checklist.")}</h5>
      <div class="pm-arb-list">`;
    html += arbs.map((a, i) => pmArbCardHtml(a, i)).join("");
    html += `</div>
      <p class="pm-arb-disclaimer">
        <strong>Locked</strong> = fee-adjusted structure that still pays at least $1 face if resolution rules match
        (Yes + No on one market, cross-venue identical event, or nested strike ladder).
        <strong>Relative value</strong> = prediction market vs Deribit
        ${pmTip("Black–Scholes digital", "Cash-or-nothing style probability from the Black–Scholes model (N(d₂) with Deribit mark implied volatility). Optional blend with a call-spread synthetic digital when liquid.")}
        — residual volatility, liquidity, and rule risk remain.
        Educational scan only — not a trade ticket or financial advice.
      </p>
    </div>`;
  } else if (!pmLoading) {
    const ds = outlook?.deribitScan;
    let clear = "No fee-adjusted locked arbs or material PM↔Deribit digital gaps in the current universe.";
    if (ds?.status === "no_live_pm") {
      clear =
        "No PM↔Deribit gaps shown: live Polymarket/Kalshi BTC price markets are unavailable (blocked, empty, or mock-only). Deribit is up but is not compared to seed mock prices — empty is expected until a live PM feed is reachable.";
    } else if (ds?.status === "deribit_down") {
      clear = "No Deribit surface — PM↔Deribit scan skipped. Locked PM arbs would still appear if present.";
    } else if (ds?.status === "no_expiry_match") {
      clear = ds.detail || clear;
    } else if (ds?.status === "scanned") {
      clear =
        "Prediction market vs Deribit: scanned live contracts against Black–Scholes digitals — no gap above the fee-adjusted threshold.";
    }
    html += `<p class="pm-arb-clear">${clear}</p>`;
  }

  body.innerHTML = html || "<p>Loading outlook…</p>";
}

function pmRenderMeta() {
  const meta = pmEl("pm-meta");
  if (!meta) return;
  if (pmLoading) {
    meta.textContent = "Loading markets…";
    return;
  }
  const src = pmData?.source || "—";
  const updated = pmData?.updatedAt
    ? new Date(pmData.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "—";
  const count = pmFilteredMarkets().length;
  const err = pmError ? " · fallback" : "";
  meta.textContent = `Prediction Markets · ${count} shown · ${src} · updated ${updated}${err}`;
}

function pmRenderToolbar() {
  const wrap = pmEl("pm-toolbar");
  if (!wrap || !pmData?.filters) return;
  const f = pmData.filters;
  const topicChips = (f.topics || [])
    .map(
      (t) => `
    <button type="button" class="pm-chip${pmFilters.topics.has(t.id) ? " active" : ""}"
      data-pm-topic="${t.id}">${t.label}</button>`,
    )
    .join("");
  const platformChips = (f.platforms || [])
    .map(
      (p) => `
    <button type="button" class="pm-chip${pmFilters.platform === p.id ? " active" : ""}"
      data-pm-platform="${p.id}">${p.label}</button>`,
    )
    .join("");
  const statusChips = (f.statuses || [])
    .map(
      (s) => `
    <button type="button" class="pm-chip${pmFilters.status === s.id ? " active" : ""}"
      data-pm-status="${s.id}">${s.label}</button>`,
    )
    .join("");
  const sortOpts = (f.sorts || [])
    .map((s) => `<option value="${s.id}"${pmFilters.sort === s.id ? " selected" : ""}>${s.label}</option>`)
    .join("");
  const resetCls = pmFiltersActive() ? "" : " hidden";
  const total = pmData?.markets?.length || 0;

  wrap.innerHTML = `
    <div class="pm-filter-toolbar">
      <span class="pm-filter-scope">${total} markets · Polymarket Gamma + Kalshi</span>
      <button type="button" class="pm-reset-filters${resetCls}" id="pm-reset-filters">Reset filters</button>
    </div>
    <div class="pm-filters">
      <div class="pm-filter-group">
        <span class="pm-filter-label">Category</span>
        <div class="pm-filter-chips" role="group" aria-label="Category">${topicChips}</div>
      </div>
      <div class="pm-filter-group">
        <span class="pm-filter-label">Platform</span>
        <div class="pm-filter-chips" role="group" aria-label="Platform">${platformChips}</div>
      </div>
      <div class="pm-filter-group">
        <span class="pm-filter-label">Status</span>
        <div class="pm-filter-chips" role="group" aria-label="Status">${statusChips}</div>
      </div>
      <div class="pm-filter-group pm-filter-group--tools">
        <label class="pm-filter-label" for="pm-search">Search</label>
        <input type="search" class="pm-search" id="pm-search" placeholder="Filter questions…" value="${pmFilters.search.replace(/"/g, "&quot;")}" autocomplete="off" />
        <label class="pm-filter-label" for="pm-sort">Sort</label>
        <select class="pm-sort" id="pm-sort">${sortOpts}</select>
      </div>
    </div>
    <div class="pm-view-bar">
      <span class="pm-view-count mono">${pmFilteredMarkets().length} markets</span>
      <div class="pm-view-toggle" role="group" aria-label="View mode">
        <button type="button" class="pm-view-btn${pmFilters.view === "table" ? " active" : ""}" data-pm-view="table">Table</button>
        <button type="button" class="pm-view-btn${pmFilters.view === "cards" ? " active" : ""}" data-pm-view="cards">Cards</button>
      </div>
    </div>`;
}

function pmRowHtml(m) {
  const yesCls = m.yesProb >= 50 ? "positive" : "";
  const btcCls = m.btcHighlight ? " pm-row--btc" : "";
  const resolvedBadge = m.resolved ? `<span class="pm-status-badge resolved">Resolved</span>` : "";
  const tradeLink = m.url
    ? `<a href="${m.url}" class="pm-trade-link" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Trade →</a>`
    : "";
  return `<tr class="pm-row${btcCls}" data-pm-id="${m.id}" tabindex="0" role="button">
    <td class="pm-q">${resolvedBadge}${m.question}${m.btcHighlight ? '<span class="pm-btc-pin" title="BTC-related">₿</span>' : ""}</td>
    <td class="mono ${yesCls}">${pmFmtPct(m.yesProb)}</td>
    <td class="mono">${pmSparklineSvg(m.sparkline)}</td>
    <td class="mono">${pmFmtUsd(m.volume24h)}</td>
    <td class="mono">${pmFmtUsd(m.volumeTotal)}</td>
    <td class="mono">${pmFmtDate(m.endDate)}</td>
    <td>${pmPlatformBadge(m.platform)}</td>
    <td>${pmTopicTags(m.topics)}</td>
    <td>${tradeLink}</td>
  </tr>`;
}

function pmCardHtml(m) {
  const btcCls = m.btcHighlight ? " pm-card--btc" : "";
  const tradeLink = m.url
    ? `<a href="${m.url}" class="pm-card__trade" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Trade on ${PM_PLATFORM_LABELS[m.platform] || m.platform} →</a>`
    : "";
  return `
  <article class="pm-card${btcCls}" data-pm-id="${m.id}" tabindex="0" role="button">
    <div class="pm-card__head">
      ${pmPlatformBadge(m.platform)}
      ${pmTopicTags(m.topics)}
      ${m.btcHighlight ? '<span class="pm-btc-pin" title="BTC-related">₿</span>' : ""}
      ${m.resolved ? '<span class="pm-status-badge resolved">Resolved</span>' : ""}
    </div>
    <h3 class="pm-card__q">${m.question}</h3>
    <div class="pm-card__odds">
      <div class="pm-odds-cell positive"><span>Yes</span><strong>${pmFmtPct(m.yesProb)}</strong></div>
      <div class="pm-odds-cell negative"><span>No</span><strong>${pmFmtPct(m.noProb)}</strong></div>
    </div>
    <div class="pm-card__meta">
      <span>24h ${pmFmtUsd(m.volume24h)}</span>
      <span>Total ${pmFmtUsd(m.volumeTotal)}</span>
      <span>Ends ${pmFmtDate(m.endDate)}</span>
      ${m.liquidity != null ? `<span>Liq ${pmFmtUsd(m.liquidity)}</span>` : ""}
    </div>
    ${pmSparklineSvg(m.sparkline, 120, 24)}
    ${tradeLink}
  </article>`;
}

function pmRenderMarkets() {
  const rows = pmFilteredMarkets();
  const tbody = pmEl("pm-table-body");
  const cards = pmEl("pm-cards");
  const tableWrap = pmEl("pm-table-wrap");
  const empty = pmEl("pm-empty");

  if (empty) empty.hidden = rows.length > 0;
  if (tableWrap) tableWrap.hidden = pmFilters.view !== "table";
  if (cards) {
    cards.hidden = pmFilters.view !== "cards";
    cards.style.display = pmFilters.view === "cards" ? "grid" : "none";
  }

  if (tbody) {
    tbody.innerHTML = rows.length
      ? rows.map(pmRowHtml).join("")
      : `<tr><td colspan="9">No markets match the current filters.</td></tr>`;
  }
  if (cards) {
    cards.innerHTML = rows.map(pmCardHtml).join("");
  }
}

function pmRenderCensorshipBanner() {
  const banner = pmEl("pm-censorship-banner");
  if (!banner) return;
  const block = pmData?.networkBlock || pmData?.outlook?.networkBlock;
  if (!block?.blocked) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }
  const host = block.blockHost || "sito-inibito-giochi.adm.gov.it";
  const page = block.blockPage || `https://${host}/`;
  const affected = (block.affected || []).map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" + ") || "Polymarket + Kalshi";
  banner.hidden = false;
  banner.innerHTML = `
    <div class="pm-censorship-banner__inner">
      <div class="pm-censorship-banner__kicker">Network censorship · Italian ADM</div>
      <h3 class="pm-censorship-banner__title">Blocked: <a href="${page}" target="_blank" rel="noopener noreferrer">${host}</a></h3>
      <p class="pm-censorship-banner__msg">${block.message || ""}</p>
      <p class="pm-censorship-banner__affect"><strong>Affected:</strong> ${affected} live APIs · showing seed/mock markets only · PM↔Deribit arb idle</p>
      <p class="pm-censorship-banner__fix"><strong>What to do:</strong> ${block.suggestion || "Switch on a VPN outside Italy, then hard-refresh."}</p>
      <p class="pm-censorship-banner__rant">${block.rant || ""}</p>
      <p class="pm-censorship-banner__link">Block page: <a href="${page}" target="_blank" rel="noopener noreferrer">${page}</a></p>
    </div>`;
}

function pmRenderStatus() {
  const loading = pmEl("pm-loading");
  const errBox = pmEl("pm-error");
  if (loading) loading.hidden = !pmLoading;
  if (errBox) {
    const block = pmData?.networkBlock || pmData?.outlook?.networkBlock;
    // Censorship has its own banner — don't double-print ADM noise in the error strip
    const showErr = pmError && !block?.blocked;
    errBox.hidden = !showErr;
    if (showErr) errBox.textContent = pmError;
  }
}

function pmRenderAll() {
  pmRenderCensorshipBanner();
  pmRenderHeroes();
  pmRenderOutlook();
  pmRenderMeta();
  pmRenderToolbar();
  pmRenderMarkets();
  pmRenderStatus();
}

function pmOpenModal(market) {
  const dlg = pmEl("pm-detail-dialog");
  if (!dlg || !market) return;
  pmSelected = market;
  const title = pmEl("pm-detail-title");
  const body = pmEl("pm-detail-body");
  const link = pmEl("pm-detail-link");
  if (title) title.textContent = market.question;
  if (link) {
    if (market.url) {
      link.href = market.url;
      link.hidden = false;
      link.textContent = `Open on ${PM_PLATFORM_LABELS[market.platform] || market.platform}`;
    } else {
      link.hidden = true;
    }
  }
  if (body) {
    body.innerHTML = `
      <div class="pm-detail-grid">
        <div class="pm-detail-stat positive">
          <span class="pm-detail-stat__label">Yes (implied)</span>
          <span class="pm-detail-stat__value">${pmFmtPct(market.yesProb)}</span>
        </div>
        <div class="pm-detail-stat negative">
          <span class="pm-detail-stat__label">No (implied)</span>
          <span class="pm-detail-stat__value">${pmFmtPct(market.noProb)}</span>
        </div>
        <div class="pm-detail-stat">
          <span class="pm-detail-stat__label">24h volume</span>
          <span class="pm-detail-stat__value">${pmFmtUsd(market.volume24h)}</span>
        </div>
        <div class="pm-detail-stat">
          <span class="pm-detail-stat__label">Total volume</span>
          <span class="pm-detail-stat__value">${pmFmtUsd(market.volumeTotal)}</span>
        </div>
        <div class="pm-detail-stat">
          <span class="pm-detail-stat__label">Liquidity</span>
          <span class="pm-detail-stat__value">${pmFmtUsd(market.liquidity)}</span>
        </div>
        <div class="pm-detail-stat">
          <span class="pm-detail-stat__label">End date</span>
          <span class="pm-detail-stat__value">${pmFmtDate(market.endDate)}</span>
        </div>
      </div>
      <p class="pm-detail-desc">${market.description || "No additional description."}</p>
      <div class="pm-detail-tags">
        ${pmPlatformBadge(market.platform)}
        ${pmTopicTags(market.topics)}
        ${market.resolved ? '<span class="pm-status-badge resolved">Resolved</span>' : '<span class="pm-status-badge active">Active</span>'}
      </div>
      ${market.sparkline?.length ? `<div class="pm-detail-spark">${pmSparklineSvg(market.sparkline, 200, 36)}</div>` : ""}`;
  }
  if (typeof dlg.showModal === "function") dlg.showModal();
}

function pmCloseModal() {
  pmEl("pm-detail-dialog")?.close();
  pmSelected = null;
}

function pmSelectById(id) {
  const market = (pmData?.markets || []).find((m) => m.id === id);
  if (market) pmOpenModal(market);
}

async function pmLoad({ refresh = false, silent = false } = {}) {
  if (!silent) {
    pmLoading = true;
    pmRenderAll();
  }
  try {
    pmData = await pmFetch(refresh);
    pmError = pmData.errors?.length ? pmData.errors.join(" · ") : null;
  } catch (err) {
    pmError = err.message || String(err);
    if (!pmData) {
      pmData = pmMockPayload();
      pmError = `${pmError} — showing offline mock data`;
    }
  } finally {
    pmLoading = false;
    pmRenderAll();
  }
}

function pmStartPoll() {
  pmStopPoll();
  pmPollTimer = setInterval(() => pmLoad({ refresh: true, silent: true }), PM_POLL_MS);
}

function pmStopPoll() {
  if (pmPollTimer) {
    clearInterval(pmPollTimer);
    pmPollTimer = null;
  }
}

function pmBindEvents() {
  if (pmReady) return;
  pmReady = true;

  const root = document.getElementById("dashboard-market");
  root?.addEventListener("click", (e) => {
    const topicBtn = e.target.closest("[data-pm-topic]");
    if (topicBtn && root.contains(topicBtn)) {
      const id = topicBtn.dataset.pmTopic;
      if (pmFilters.topics.has(id)) pmFilters.topics.delete(id);
      else pmFilters.topics.add(id);
      pmRenderAll();
      return;
    }

    const platBtn = e.target.closest("[data-pm-platform]");
    if (platBtn && root.contains(platBtn)) {
      pmFilters.platform = platBtn.dataset.pmPlatform;
      pmRenderAll();
      return;
    }

    const statusBtn = e.target.closest("[data-pm-status]");
    if (statusBtn && root.contains(statusBtn)) {
      pmFilters.status = statusBtn.dataset.pmStatus;
      pmRenderAll();
      return;
    }

    const viewBtn = e.target.closest("[data-pm-view]");
    if (viewBtn && root.contains(viewBtn)) {
      pmFilters.view = viewBtn.dataset.pmView;
      pmRenderAll();
      return;
    }

    if (e.target.id === "pm-reset-filters") {
      pmFilters = pmDefaultFilters();
      pmRenderAll();
      return;
    }

    if (e.target.closest(".pm-refresh-btn")) {
      pmLoad({ refresh: true });
      return;
    }

    const row = e.target.closest("[data-pm-id]");
    if (row && root.contains(row) && !e.target.closest("a")) {
      pmSelectById(row.dataset.pmId);
    }
  });

  root?.addEventListener("input", (e) => {
    if (e.target.id === "pm-search") {
      pmFilters.search = e.target.value;
      pmRenderMeta();
      pmRenderMarkets();
      pmRenderToolbar();
    }
  });

  root?.addEventListener("change", (e) => {
    if (e.target.id === "pm-sort") {
      pmFilters.sort = e.target.value;
      pmRenderMarkets();
    }
  });

  pmEl("pm-detail-close")?.addEventListener("click", pmCloseModal);
  pmEl("pm-detail-dialog")?.addEventListener("click", (e) => {
    if (e.target === pmEl("pm-detail-dialog")) pmCloseModal();
  });
}

function initPredictionMarkets() {
  pmBindEvents();
  if (!pmData) {
    pmLoad();
    if (!pmPollTimer) pmStartPoll();
  } else {
    pmRenderAll();
  }
}

window.initPredictionMarkets = initPredictionMarkets;

function pmBootstrap() {
  const l1 = localStorage.getItem("btc-menu-l1") || window.MenuController?.l1;
  const l2 = localStorage.getItem("btc-menu-l2") || window.MenuController?.l2;
  if (l1 === "market" && l2 === "prediction-markets") initPredictionMarkets();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", pmBootstrap);
} else {
  pmBootstrap();
}
window.addEventListener("load", pmBootstrap);