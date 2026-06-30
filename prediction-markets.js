/** Prediction Markets — BTC-centric Polymarket + Kalshi via /api/prediction-markets */

const PM_POLL_MS = 60_000;
const PM_API = "/api/prediction-markets";

let pmReady = false;
let pmPollTimer = null;
let pmData = null;
let pmLoading = false;
let pmError = null;
let pmFilters = { timeframe: "all", category: "all", platform: "all" };
let pmSelected = null;

const pmEl = (id) => document.getElementById(id);

const PM_PLATFORM_LABELS = { polymarket: "Polymarket", kalshi: "Kalshi" };
const PM_CATEGORY_LABELS = {
  "price-targets": "Price Targets",
  regulation: "Regulation",
  macro: "Macro",
};
const PM_TF_LABELS = {
  today: "Today",
  week: "This week",
  y2026: "2026",
  "long-term": "Long-term",
};

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

function pmMockPayload() {
  const markets = [
    {
      id: "mock-poly-btc-100k-2026",
      question: "Will Bitcoin reach $100,000 before 2027?",
      eventTitle: "Bitcoin price before 2027",
      yesOdds: 0.58,
      noOdds: 0.42,
      yesProb: 58,
      noProb: 42,
      volume24h: 284500,
      liquidity: 412000,
      endDate: "2026-12-31",
      platform: "polymarket",
      category: "price-targets",
      timeframe: "long-term",
      url: "https://polymarket.com/event/bitcoin-price-before-2027",
      description: "Resolves Yes if BTC trades at or above $100k on Binance BTC/USDT before Jan 1, 2027.",
      sparkline: [0.52, 0.55, 0.58],
      active: true,
    },
    {
      id: "mock-poly-btc-120k-2026",
      question: "Will Bitcoin reach $120,000 before 2027?",
      eventTitle: "Bitcoin price before 2027",
      yesOdds: 0.34,
      noOdds: 0.66,
      yesProb: 34,
      noProb: 66,
      volume24h: 198200,
      endDate: "2026-12-31",
      platform: "polymarket",
      category: "price-targets",
      timeframe: "long-term",
      url: "https://polymarket.com/event/bitcoin-price-before-2027",
      description: "Resolves Yes if BTC trades at or above $120k before Jan 1, 2027.",
      sparkline: [0.29, 0.31, 0.34],
      active: true,
    },
    {
      id: "mock-kalshi-btc-above-week",
      question: "BTC above $108,000 this week?",
      yesOdds: 0.47,
      noOdds: 0.53,
      yesProb: 47,
      noProb: 53,
      volume24h: 86400,
      endDate: "2026-07-04",
      platform: "kalshi",
      category: "price-targets",
      timeframe: "week",
      url: "https://kalshi.com/markets/kxbtc",
      description: "Kalshi short-term binary on Binance BTC/USDT close above strike.",
      sparkline: [0.41, 0.44, 0.47],
      active: true,
    },
    {
      id: "mock-poly-etf-flow",
      question: "US spot Bitcoin ETF net inflows positive every week in Q3 2026?",
      yesOdds: 0.44,
      noOdds: 0.56,
      yesProb: 44,
      noProb: 56,
      volume24h: 38900,
      endDate: "2026-09-30",
      platform: "polymarket",
      category: "regulation",
      timeframe: "y2026",
      url: "https://polymarket.com/event/bitcoin-etf",
      description: "Tracks sustained spot ETF demand — a key BTC flow driver.",
      sparkline: [0.48, 0.46, 0.44],
      active: true,
    },
    {
      id: "mock-poly-fed-cut-btc",
      question: "Fed cuts rates at least once before BTC retests $100k?",
      yesOdds: 0.52,
      noOdds: 0.48,
      yesProb: 52,
      noProb: 48,
      volume24h: 29100,
      endDate: "2026-12-31",
      platform: "polymarket",
      category: "macro",
      timeframe: "long-term",
      url: "https://polymarket.com/event/fed-btc",
      description: "Macro linkage: liquidity easing coinciding with BTC $100k retest.",
      sparkline: [0.46, 0.49, 0.52],
      active: true,
    },
  ];
  const outlook = {
    headline: "Market-implied probability BTC > $100k: 58%",
    btc100kProb: 58,
    bullishCount: 2,
    activeMarkets: markets.length,
    totalVolume24h: markets.reduce((s, m) => s + (m.volume24h || 0), 0),
    lines: [
      "Showing client-side mock data — API route unavailable. Deploy latest backend or run python3 server.py locally.",
      "Polymarket/Kalshi live feed loads via GET /api/prediction-markets when the serverless handler includes prediction_markets_api.py.",
    ],
  };
  return {
    updatedAt: new Date().toISOString(),
    source: "client-mock",
    mockOnly: true,
    errors: [],
    heroes: [
      { name: "BTC > $100k", value: "58%", sub: "Implied probability" },
      { name: "Active markets", value: String(markets.length), sub: "BTC-relevant" },
      { name: "24h volume", value: pmFmtUsd(outlook.totalVolume24h), sub: "Combined" },
      { name: "Bullish price bets", value: "2", sub: "Yes ≥ 50%" },
    ],
    outlook,
    markets,
    filters: {
      timeframes: [
        { id: "all", label: "All" },
        { id: "today", label: "Today" },
        { id: "week", label: "This week" },
        { id: "y2026", label: "2026" },
        { id: "long-term", label: "Long-term" },
      ],
      categories: [
        { id: "all", label: "All" },
        { id: "price-targets", label: "Price Targets" },
        { id: "regulation", label: "Regulation" },
        { id: "macro", label: "Macro" },
      ],
      platforms: [
        { id: "all", label: "All" },
        { id: "polymarket", label: "Polymarket" },
        { id: "kalshi", label: "Kalshi" },
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
    if (res.status === 404 || /unknown api route/i.test(msg)) {
      console.warn("Prediction markets API unavailable, using client mock:", msg);
      return pmMockPayload();
    }
    throw new Error(msg);
  } catch (err) {
    if (err instanceof TypeError || /failed to fetch/i.test(err.message || "")) {
      console.warn("Prediction markets fetch failed, using client mock:", err);
      return pmMockPayload();
    }
    throw err;
  }
}

function pmFilteredMarkets() {
  const rows = pmData?.markets || [];
  return rows.filter((m) => {
    if (pmFilters.timeframe !== "all" && m.timeframe !== pmFilters.timeframe) return false;
    if (pmFilters.category !== "all" && m.category !== pmFilters.category) return false;
    if (pmFilters.platform !== "all" && m.platform !== pmFilters.platform) return false;
    return true;
  });
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
  if (head) head.textContent = outlook?.headline || "BTC prediction outlook";
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
  if (pmError) {
    meta.textContent = "Error — showing cached/mock data";
    return;
  }
  const src = pmData?.source || "—";
  const updated = pmData?.updatedAt
    ? new Date(pmData.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "—";
  const count = pmFilteredMarkets().length;
  meta.textContent = `${count} markets · ${src} · updated ${updated} · refreshes every 60s`;
}

function pmRenderFilters() {
  const wrap = pmEl("pm-filters");
  if (!wrap || !pmData?.filters) return;

  const groups = [
    { key: "timeframe", label: "Timeframe", items: pmData.filters.timeframes },
    { key: "category", label: "Category", items: pmData.filters.categories },
    { key: "platform", label: "Platform", items: pmData.filters.platforms },
  ];

  wrap.innerHTML = groups
    .map(
      (g) => `
      <div class="pm-filter-group">
        <span class="pm-filter-label">${g.label}</span>
        <div class="pm-filter-chips" role="group" aria-label="${g.label}">
          ${(g.items || [])
            .map(
              (item) => `
            <button type="button" class="pm-chip${pmFilters[g.key] === item.id ? " active" : ""}"
              data-pm-filter="${g.key}" data-pm-value="${item.id}">${item.label}</button>`,
            )
            .join("")}
        </div>
      </div>`,
    )
    .join("");
}

function pmPlatformBadge(platform) {
  const label = PM_PLATFORM_LABELS[platform] || platform;
  return `<span class="pm-badge pm-badge--${platform}">${label}</span>`;
}

function pmRenderTable() {
  const tbody = pmEl("pm-table-body");
  const cards = pmEl("pm-cards");
  const empty = pmEl("pm-empty");
  const rows = pmFilteredMarkets();

  if (empty) empty.hidden = rows.length > 0;

  if (tbody) {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8">No markets match the current filters.</td></tr>`;
    } else {
      tbody.innerHTML = rows
        .map((m) => {
          const yesCls = m.yesProb >= 50 ? "positive" : "";
          const noCls = m.noProb >= 50 ? "negative" : "";
          return `<tr class="pm-row" data-pm-id="${m.id}" tabindex="0" role="button">
            <td class="pm-q">${m.question}</td>
            <td class="mono ${yesCls}">${pmFmtPct(m.yesProb)}</td>
            <td class="mono ${noCls}">${pmFmtPct(m.noProb)}</td>
            <td class="mono">${pmSparklineSvg(m.sparkline)}</td>
            <td class="mono">${pmFmtUsd(m.volume24h)}</td>
            <td class="mono">${pmFmtDate(m.endDate)}</td>
            <td>${pmPlatformBadge(m.platform)}</td>
            <td><span class="pm-cat-tag">${PM_CATEGORY_LABELS[m.category] || m.category}</span></td>
          </tr>`;
        })
        .join("");
    }
  }

  if (cards) {
    cards.innerHTML = rows
      .map(
        (m) => `
      <article class="pm-card" data-pm-id="${m.id}" tabindex="0" role="button">
        <div class="pm-card__head">
          ${pmPlatformBadge(m.platform)}
          <span class="pm-cat-tag">${PM_CATEGORY_LABELS[m.category] || m.category}</span>
        </div>
        <h3 class="pm-card__q">${m.question}</h3>
        <div class="pm-card__odds">
          <div class="pm-odds-cell positive"><span>Yes</span><strong>${pmFmtPct(m.yesProb)}</strong></div>
          <div class="pm-odds-cell negative"><span>No</span><strong>${pmFmtPct(m.noProb)}</strong></div>
        </div>
        <div class="pm-card__meta">
          <span>24h vol ${pmFmtUsd(m.volume24h)}</span>
          <span>Ends ${pmFmtDate(m.endDate)}</span>
        </div>
        ${pmSparklineSvg(m.sparkline, 120, 24)}
      </article>`,
      )
      .join("");
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
  pmRenderFilters();
  pmRenderTable();
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
          <span class="pm-detail-stat__sub">odds ${(market.yesOdds * 100).toFixed(1)}¢</span>
        </div>
        <div class="pm-detail-stat negative">
          <span class="pm-detail-stat__label">No (implied)</span>
          <span class="pm-detail-stat__value">${pmFmtPct(market.noProb)}</span>
          <span class="pm-detail-stat__sub">odds ${(market.noOdds * 100).toFixed(1)}¢</span>
        </div>
        <div class="pm-detail-stat">
          <span class="pm-detail-stat__label">24h volume</span>
          <span class="pm-detail-stat__value">${pmFmtUsd(market.volume24h)}</span>
        </div>
        <div class="pm-detail-stat">
          <span class="pm-detail-stat__label">End date</span>
          <span class="pm-detail-stat__value">${pmFmtDate(market.endDate)}</span>
        </div>
      </div>
      ${market.eventTitle ? `<p class="pm-detail-event"><strong>Event:</strong> ${market.eventTitle}</p>` : ""}
      <p class="pm-detail-desc">${market.description || "No additional description."}</p>
      <div class="pm-detail-tags">
        ${pmPlatformBadge(market.platform)}
        <span class="pm-cat-tag">${PM_CATEGORY_LABELS[market.category] || market.category}</span>
        <span class="pm-cat-tag">${PM_TF_LABELS[market.timeframe] || market.timeframe}</span>
      </div>
      ${market.sparkline?.length ? `<div class="pm-detail-spark">${pmSparklineSvg(market.sparkline, 200, 36)}<span class="pm-detail-spark-label">7d implied prob trend (approx)</span></div>` : ""}`;
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
    pmRenderStatus();
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

  pmEl("pm-filters")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pm-filter]");
    if (!btn) return;
    const key = btn.dataset.pmFilter;
    const value = btn.dataset.pmValue;
    if (key && value) {
      pmFilters[key] = value;
      pmRenderFilters();
      pmRenderTable();
      pmRenderMeta();
    }
  });

  pmEl("pm-table-body")?.addEventListener("click", (e) => {
    const row = e.target.closest("[data-pm-id]");
    if (row) pmSelectById(row.dataset.pmId);
  });

  pmEl("pm-cards")?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-pm-id]");
    if (card) pmSelectById(card.dataset.pmId);
  });

  pmEl("pm-refresh")?.addEventListener("click", () => pmLoad({ refresh: true }));

  pmEl("pm-detail-close")?.addEventListener("click", pmCloseModal);
  pmEl("pm-detail-dialog")?.addEventListener("click", (e) => {
    if (e.target === pmEl("pm-detail-dialog")) pmCloseModal();
  });
}

function initPredictionMarkets() {
  pmBindEvents();
  pmLoad();
  pmStartPoll();
}

window.initPredictionMarkets = initPredictionMarkets;