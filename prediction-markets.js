/** Prediction Markets — Polymarket Gamma + Kalshi via /api/prediction-markets */

const PM_POLL_MS = 60_000;
const PM_API = "/api/prediction-markets";

const PM_PLATFORM_LABELS = { polymarket: "Polymarket", kalshi: "Kalshi" };
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
      headline: "Market-implied probability BTC > $100k: 58%",
      lines: ["Client mock — deploy API for live Polymarket/Kalshi feed."],
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

function pmRenderOutlook() {
  const head = pmEl("pm-outlook-head");
  const body = pmEl("pm-outlook-body");
  const outlook = pmData?.outlook;
  if (head) head.textContent = outlook?.headline || "Aggregated outlook";
  if (body) {
    const lines = outlook?.lines || [];
    body.innerHTML = lines.map((p) => `<p>${p}</p>`).join("") || "<p>Loading outlook…</p>";
  }
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
      <div class="pm-filter-group pm-filter-group--search">
        <span class="pm-filter-label">Search</span>
        <input type="search" class="pm-search" id="pm-search" placeholder="Filter questions…" value="${pmFilters.search.replace(/"/g, "&quot;")}" autocomplete="off" />
      </div>
      <div class="pm-filter-group pm-filter-group--sort">
        <span class="pm-filter-label">Sort</span>
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

function pmRenderStatus() {
  const loading = pmEl("pm-loading");
  const errBox = pmEl("pm-error");
  if (loading) loading.hidden = !pmLoading;
  if (errBox) {
    errBox.hidden = !pmError;
    if (pmError) errBox.textContent = pmError;
  }
}

function pmRenderAll() {
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