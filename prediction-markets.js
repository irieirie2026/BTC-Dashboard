/** Prediction Markets — BTC-centric Polymarket + Kalshi via /api/prediction-markets */

const PM_POLL_MS = 60_000;
const PM_API = "/api/prediction-markets";

const PM_SECTIONS = {
  "btc-price": { label: "BTC Price", short: "price" },
  financial: { label: "Financial Events", short: "financial" },
  geopolitical: { label: "Geopolitical", short: "geo" },
};

let pmReady = false;
let pmPollTimer = null;
let pmData = null;
let pmLoading = false;
let pmError = null;
let pmActiveSection = "btc-price";
let pmFilters = { timeframe: "all", category: "all", platform: "all" };
let pmSelected = null;

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

function pmScreen() {
  return (
    document.querySelector(
      `#dashboard-market .menu-screen[data-l2="prediction-markets"][data-l3="${pmActiveSection}"]`,
    ) ||
    document.querySelector('#dashboard-market .menu-screen[data-l2="prediction-markets"]:not([hidden])')
  );
}

function pmQ(sel) {
  return pmScreen()?.querySelector(sel);
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

function pmTagSection(m) {
  return m.section || (m.category === "macro" ? "financial" : m.category === "regulation" ? "geopolitical" : "btc-price");
}

function pmMockPayload() {
  const markets = [
    {
      id: "mock-poly-btc-100k-2026",
      question: "Will Bitcoin reach $100,000 before 2027?",
      yesOdds: 0.58,
      noOdds: 0.42,
      yesProb: 58,
      noProb: 42,
      volume24h: 284500,
      endDate: "2026-12-31",
      platform: "polymarket",
      category: "price-targets",
      section: "btc-price",
      timeframe: "long-term",
      url: "https://polymarket.com/event/bitcoin-price-before-2027",
      description: "Resolves Yes if BTC trades at or above $100k before Jan 1, 2027.",
      sparkline: [0.52, 0.55, 0.58],
    },
    {
      id: "mock-kalshi-btc-above-week",
      question: "BTC above $108,000 this week?",
      yesProb: 47,
      noProb: 53,
      yesOdds: 0.47,
      noOdds: 0.53,
      volume24h: 86400,
      endDate: "2026-07-04",
      platform: "kalshi",
      category: "price-targets",
      section: "btc-price",
      timeframe: "week",
      url: "https://kalshi.com/markets/kxbtc",
      sparkline: [0.41, 0.44, 0.47],
    },
    {
      id: "mock-poly-fed-cut-jul",
      question: "Will the Fed cut rates at the July 2026 FOMC meeting?",
      yesProb: 62,
      noProb: 38,
      yesOdds: 0.62,
      noOdds: 0.38,
      volume24h: 412000,
      endDate: "2026-07-30",
      platform: "polymarket",
      category: "macro",
      section: "financial",
      timeframe: "y2026",
      url: "https://polymarket.com/event/fed-decision-july-2026",
      description: "Fed funds path drives liquidity and risk appetite — primary macro channel into BTC.",
      sparkline: [0.55, 0.58, 0.62],
    },
    {
      id: "mock-poly-cpi-jun",
      question: "Will June 2026 CPI come in below 2.5% YoY?",
      yesProb: 41,
      noProb: 59,
      yesOdds: 0.41,
      noOdds: 0.59,
      volume24h: 186000,
      endDate: "2026-07-15",
      platform: "polymarket",
      category: "macro",
      section: "financial",
      timeframe: "y2026",
      sparkline: [0.38, 0.4, 0.41],
    },
    {
      id: "mock-poly-ecb-cut-sep",
      question: "Will the ECB cut rates at the September 2026 meeting?",
      yesProb: 48,
      noProb: 52,
      yesOdds: 0.48,
      noOdds: 0.52,
      volume24h: 198000,
      endDate: "2026-09-18",
      platform: "polymarket",
      category: "macro",
      section: "financial",
      timeframe: "y2026",
      sparkline: [0.44, 0.46, 0.48],
    },
    {
      id: "mock-poly-boj-hike",
      question: "Will the Bank of Japan raise rates before end of 2026?",
      yesProb: 39,
      noProb: 61,
      yesOdds: 0.39,
      noOdds: 0.61,
      volume24h: 156000,
      endDate: "2026-12-31",
      platform: "polymarket",
      category: "macro",
      section: "financial",
      timeframe: "long-term",
      sparkline: [0.35, 0.37, 0.39],
    },
    {
      id: "mock-poly-strategic-reserve",
      question: "US Strategic Bitcoin Reserve holds ≥10k BTC by end of 2026?",
      yesProb: 27,
      noProb: 73,
      yesOdds: 0.27,
      noOdds: 0.73,
      volume24h: 67500,
      endDate: "2026-12-31",
      platform: "polymarket",
      category: "regulation",
      section: "geopolitical",
      timeframe: "y2026",
      url: "https://polymarket.com/event/strategic-bitcoin-reserve",
      sparkline: [0.22, 0.25, 0.27],
    },
    {
      id: "mock-poly-crypto-bill",
      question: "US crypto market structure bill signed into law in 2026?",
      yesProb: 35,
      noProb: 65,
      yesOdds: 0.35,
      noOdds: 0.65,
      volume24h: 156000,
      endDate: "2026-12-31",
      platform: "polymarket",
      category: "regulation",
      section: "geopolitical",
      timeframe: "y2026",
      sparkline: [0.3, 0.33, 0.35],
    },
    {
      id: "mock-poly-ukraine-ceasefire",
      question: "Ukraine–Russia ceasefire before end of 2026?",
      yesProb: 31,
      noProb: 69,
      yesOdds: 0.31,
      noOdds: 0.69,
      volume24h: 312000,
      endDate: "2026-12-31",
      platform: "polymarket",
      category: "regulation",
      section: "geopolitical",
      timeframe: "long-term",
      sparkline: [0.28, 0.29, 0.31],
    },
    {
      id: "mock-poly-uk-election",
      question: "Will the UK hold a general election before end of 2026?",
      yesProb: 22,
      noProb: 78,
      yesOdds: 0.22,
      noOdds: 0.78,
      volume24h: 142000,
      endDate: "2026-12-31",
      platform: "polymarket",
      category: "regulation",
      section: "geopolitical",
      timeframe: "long-term",
      sparkline: [0.25, 0.23, 0.22],
    },
  ];
  return {
    updatedAt: new Date().toISOString(),
    source: "client-mock",
    mockOnly: true,
    errors: [],
    markets,
    sectionData: {
      "btc-price": {
        heroes: [
          { name: "BTC > $100k", value: "58%", sub: "Implied probability" },
          { name: "Price markets", value: "2", sub: "Active" },
          { name: "24h volume", value: pmFmtUsd(370900), sub: "Section total" },
          { name: "Bullish bets", value: "1", sub: "Yes ≥ 50%" },
        ],
        outlook: {
          headline: "Market-implied probability BTC > $100k: 58%",
          lines: ["Client mock — deploy API for live Polymarket/Kalshi feed."],
        },
      },
      financial: {
        heroes: [
          { name: "Lead macro", value: "62%", sub: "Highest-volume Yes" },
          { name: "Macro markets", value: "4", sub: "Worldwide" },
          { name: "24h volume", value: pmFmtUsd(952000), sub: "Section total" },
          { name: "Bullish macro", value: "1", sub: "Yes ≥ 50%" },
        ],
        outlook: {
          headline: "Lead macro market: 62% Yes — Will the Fed cut rates at the July 2026 FOMC meeting?",
          lines: [
            "Central bank decisions, inflation, and growth markets from the US, Europe, and Asia-Pacific.",
            "Worldwide financial coverage — no Bitcoin price requirement.",
          ],
        },
      },
      geopolitical: {
        heroes: [
          { name: "Geo / politics", value: "4", sub: "Worldwide" },
          { name: "Bullish odds", value: "0", sub: "Yes ≥ 50%" },
          { name: "24h volume", value: pmFmtUsd(677500), sub: "Section total" },
          { name: "Top Yes", value: "35%", sub: "Highest implied" },
        ],
        outlook: {
          headline: "Top geo/politics market: 31% Yes on Ukraine–Russia ceasefire before end of 2026…",
          lines: [
            "Elections, conflicts, sanctions, and trade policy across major economies worldwide.",
            "Sports and celebrity markets excluded.",
          ],
        },
      },
    },
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
      return pmMockPayload();
    }
    throw new Error(msg);
  } catch (err) {
    if (err instanceof TypeError || /failed to fetch/i.test(err.message || "")) {
      return pmMockPayload();
    }
    throw err;
  }
}

function pmSectionMarkets() {
  const rows = pmData?.markets || [];
  return rows.filter((m) => pmTagSection(m) === pmActiveSection);
}

function pmFilteredMarkets() {
  return pmSectionMarkets().filter((m) => {
    if (pmFilters.timeframe !== "all" && m.timeframe !== pmFilters.timeframe) return false;
    if (pmFilters.category !== "all" && m.category !== pmFilters.category) return false;
    if (pmFilters.platform !== "all" && m.platform !== pmFilters.platform) return false;
    return true;
  });
}

function pmSectionBundle() {
  return pmData?.sectionData?.[pmActiveSection] || {};
}

function pmRenderHeroes() {
  const strip = pmQ(".pm-heroes");
  if (!strip) return;
  const heroes = pmSectionBundle().heroes || pmData?.heroes || [];
  strip.innerHTML = heroes
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
  const head = pmQ(".pm-outlook-head");
  const body = pmQ(".pm-outlook-body");
  const outlook = pmSectionBundle().outlook || pmData?.outlook;
  if (head) head.textContent = outlook?.headline || "Aggregated outlook";
  if (body) {
    const lines = outlook?.lines || [];
    body.innerHTML = lines.map((p) => `<p>${p}</p>`).join("") || "<p>Loading outlook…</p>";
  }
}

function pmRenderMeta() {
  const meta = pmQ(".pm-meta");
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
  const sec = PM_SECTIONS[pmActiveSection]?.label || pmActiveSection;
  meta.textContent = `${sec} · ${count} markets · ${src} · updated ${updated}`;
}

function pmRenderFilters() {
  const wrap = pmQ(".pm-filters");
  if (!wrap || !pmData?.filters) return;

  const catItems =
    pmActiveSection === "financial"
      ? pmData.filters.categories.filter((c) => c.id === "all" || c.id === "macro")
      : pmActiveSection === "geopolitical"
        ? pmData.filters.categories.filter((c) => c.id === "all" || c.id === "regulation")
        : pmData.filters.categories.filter((c) => c.id === "all" || c.id === "price-targets");

  const groups = [
    { key: "timeframe", label: "Timeframe", items: pmData.filters.timeframes },
    { key: "category", label: "Category", items: catItems },
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
  const tbody = pmQ(".pm-table-body");
  const cards = pmQ(".pm-cards");
  const empty = pmQ(".pm-empty");
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
  const loading = pmQ(".pm-loading");
  const errBox = pmQ(".pm-error");
  if (loading) loading.hidden = !pmLoading;
  if (errBox) {
    errBox.hidden = !pmError;
    if (pmError) errBox.textContent = pmError;
  }
}

function pmRenderAllScreens() {
  const prev = pmActiveSection;
  Object.keys(PM_SECTIONS).forEach((sec) => {
    pmActiveSection = sec;
    pmRenderHeroes();
    pmRenderOutlook();
    pmRenderMeta();
    pmRenderFilters();
    pmRenderTable();
    pmRenderStatus();
  });
  pmActiveSection = prev;
}

function pmRenderActiveScreen() {
  pmRenderHeroes();
  pmRenderOutlook();
  pmRenderMeta();
  pmRenderFilters();
  pmRenderTable();
  pmRenderStatus();
}

function pmOpenModal(market) {
  const dlg = document.getElementById("pm-detail-dialog");
  if (!dlg || !market) return;
  pmSelected = market;
  const title = document.getElementById("pm-detail-title");
  const body = document.getElementById("pm-detail-body");
  const link = document.getElementById("pm-detail-link");
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
        <span class="pm-cat-tag">${PM_SECTIONS[pmTagSection(market)]?.label || pmTagSection(market)}</span>
        <span class="pm-cat-tag">${PM_TF_LABELS[market.timeframe] || market.timeframe}</span>
      </div>
      ${market.sparkline?.length ? `<div class="pm-detail-spark">${pmSparklineSvg(market.sparkline, 200, 36)}<span class="pm-detail-spark-label">7d implied prob trend (approx)</span></div>` : ""}`;
  }
  if (typeof dlg.showModal === "function") dlg.showModal();
}

function pmCloseModal() {
  document.getElementById("pm-detail-dialog")?.close();
  pmSelected = null;
}

function pmSelectById(id) {
  const market = (pmData?.markets || []).find((m) => m.id === id);
  if (market) pmOpenModal(market);
}

async function pmLoad({ refresh = false, silent = false } = {}) {
  if (!silent) {
    pmLoading = true;
    pmRenderActiveScreen();
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
    pmRenderAllScreens();
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
    const filterBtn = e.target.closest("[data-pm-filter]");
    if (filterBtn && root.contains(filterBtn)) {
      const key = filterBtn.dataset.pmFilter;
      const value = filterBtn.dataset.pmValue;
      if (key && value) {
        pmFilters[key] = value;
        pmRenderAllScreens();
      }
      return;
    }

    const refreshBtn = e.target.closest(".pm-refresh-btn");
    if (refreshBtn && root.contains(refreshBtn)) {
      pmLoad({ refresh: true });
      return;
    }

    const row = e.target.closest("[data-pm-id]");
    if (row && root.contains(row)) {
      pmSelectById(row.dataset.pmId);
    }
  });

  document.getElementById("pm-detail-close")?.addEventListener("click", pmCloseModal);
  document.getElementById("pm-detail-dialog")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("pm-detail-dialog")) pmCloseModal();
  });
}

function initPredictionMarkets(section = "btc-price") {
  pmActiveSection = PM_SECTIONS[section] ? section : "btc-price";
  pmFilters = { timeframe: "all", category: "all", platform: "all" };
  pmBindEvents();
  if (!pmData) {
    pmLoad();
    pmStartPoll();
  } else {
    pmRenderAllScreens();
  }
}

window.initPredictionMarkets = initPredictionMarkets;