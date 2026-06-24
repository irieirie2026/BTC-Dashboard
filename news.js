const NEWS_SECTIONS = [
  "all",
  "market",
  "regulation",
  "institutions",
  "mining",
  "technology",
  "onchain",
  "x",
];

const NEWS_POLL_MS = 600_000;
const newsCache = {};
let newsPollTimer = null;
let newsActiveSection = null;
let newsReady = false;

const nwEl = (id) => document.getElementById(id);

const CATEGORY_LABELS = {
  market: "Market",
  regulation: "Regulation",
  institutions: "Institutions",
  mining: "Mining",
  technology: "Technology",
  onchain: "On-Chain",
};

const SENTIMENT_LABELS = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
};

function sentimentBadge(sentiment) {
  const label = SENTIMENT_LABELS[sentiment];
  if (!label) return "";
  return `<span class="news-card-sentiment news-card-sentiment--${sentiment}" data-help-key="news-sentiment">${label}</span>`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function heroDisplay(hero) {
  if (hero.value == null) return "—";
  if (typeof hero.value === "number") return String(hero.value);
  return String(hero.value);
}

async function fetchNewsSection(section) {
  const res = await fetch(`/api/news/${section}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `News ${section} ${res.status}`);
  }
  return res.json();
}

function renderNewsHeroes(section, data) {
  const strip = nwEl(`news-${section}-heroes`);
  if (!strip) return;

  strip.innerHTML = (data.heroes || [])
    .slice(0, 4)
    .map(
      (h) => `
      <article class="deriv-hero-block">
        <span class="deriv-hero-label">${h.name}</span>
        <span class="deriv-hero-value">${heroDisplay(h)}</span>
        <span class="deriv-hero-sub">${h.sub || ""}</span>
      </article>`,
    )
    .join("");
}

function renderNewsFeed(section, data) {
  const feed = nwEl(`news-${section}-feed`);
  if (!feed) return;

  const articles = data.articles || [];
  if (!articles.length) {
    feed.innerHTML = '<p class="news-empty">No headlines in this category.</p>';
    return;
  }

  feed.innerHTML = articles
    .map((art) => {
      const cat = CATEGORY_LABELS[art.category] || art.category || "";
      const catBadge =
        section === "all" && cat
          ? `<span class="news-card-category">${cat}</span>`
          : "";
      const isTweet = art.isTweet || section === "x";
      const rtBadge = art.isRetweet
        ? `<span class="news-card-rt">RT</span>`
        : "";
      const authorLine = isTweet
        ? `<span class="news-card-author">${art.authorName || art.source}</span>
           ${art.authorRole ? `<span class="news-card-role">${art.authorRole}</span>` : ""}`
        : "";
      const sentBadge = sentimentBadge(art.sentiment || "neutral");
      return `
      <article class="news-card${isTweet ? " news-card--tweet" : ""}">
        <div class="news-card-head">
          <a class="news-card-title" href="${art.link}" target="_blank" rel="noopener noreferrer">${art.title}</a>
          <div class="news-card-badges">${sentBadge}${rtBadge}${catBadge}</div>
        </div>
        <div class="news-card-meta">
          <span class="news-card-source">${art.source}</span>
          ${authorLine}
          <span class="news-card-time">${fmtTime(art.publishedAt)}</span>
        </div>
        ${art.summary && !isTweet ? `<p class="news-card-summary">${art.summary}</p>` : ""}
      </article>`;
    })
    .join("");
}

function renderNewsCommentary(section, data) {
  const node = nwEl(`news-${section}-commentary`);
  if (!node) return;
  const lines = data.commentary || [];
  node.innerHTML = lines.map((p) => `<p>${p}</p>`).join("");
}

function renderNewsScreen(section, data, opts = {}) {
  if (!data) return;
  newsCache[section] = data;

  const updateEl = nwEl(`news-${section}-update`);
  if (updateEl) {
    updateEl.textContent = window.DashboardSWR?.formatPanelMeta({
      fetchedAt: data.fetchedAt,
      source: data.source || "RSS",
      stale: opts.stale,
      refreshing: opts.refreshing,
      refreshFailed: opts.refreshFailed,
    }) || "—";
    updateEl.classList.toggle(
      "header-meta--stale",
      !!(opts.stale && (opts.refreshing || opts.refreshFailed)),
    );
  }

  renderNewsHeroes(section, data);
  renderNewsFeed(section, data);
  renderNewsCommentary(section, data);

  const screen = document.querySelector(
    `#dashboard-news .menu-screen[data-l2="${section}"]`,
  );
  window.decorateHelpLabels?.(screen);
}

async function loadNewsSection(section) {
  if (!NEWS_SECTIONS.includes(section)) return;
  newsActiveSection = section;

  const swr = window.DashboardSWR;
  if (!swr) return;

  try {
    await swr.runSWR({
      key: `news:${section}`,
      l1: "news",
      source: "RSS",
      fetch: () => fetchNewsSection(section),
      render: (data, opts = {}) => {
        const feed = nwEl(`news-${section}-feed`);
        if (opts.loading) {
          if (feed) feed.innerHTML = '<p class="news-empty">Loading headlines…</p>';
          return;
        }
        renderNewsScreen(section, data, opts);
      },
    });
  } catch (err) {
    console.error("News load failed:", section, err);
    const commentary = nwEl(`news-${section}-commentary`);
    if (commentary && !newsCache[section]) {
      commentary.innerHTML = `<p>Failed to load ${section} news. Is server.py running?</p>`;
    }
    const feed = nwEl(`news-${section}-feed`);
    if (feed && !newsCache[section]) {
      feed.innerHTML = '<p class="news-empty">Failed to load headlines.</p>';
    }
  }
}

function startNewsPoll() {
  if (newsPollTimer) return;
  newsPollTimer = setInterval(() => {
    if (newsActiveSection) loadNewsSection(newsActiveSection);
  }, NEWS_POLL_MS);
}

function initNewsModule() {
  if (newsReady) return;
  newsReady = true;
}

window.loadNewsDashboard = function () {
  initNewsModule();
  startNewsPoll();
  window.decorateHelpLabels?.(document.getElementById("dashboard-news"));
};

window.loadNewsSection = loadNewsSection;