const HOME_SECTIONS = [
  {
    id: "market",
    label: "Market",
    icon: "₿",
    accent: "#0ecb81",
    accentDim: "rgba(14, 203, 129, 0.18)",
    blurb: "Live BTC/USDT spot price, order book depth, and multi-timeframe technical indicators.",
  },
  {
    id: "onchain",
    label: "On Chain",
    icon: "⛓",
    accent: "#10b981",
    accentDim: "rgba(16, 185, 129, 0.18)",
    blurb: "Bitcoin mainnet health — network, mining, fees, supply, addresses, and Lightning.",
  },
  {
    id: "exchanges",
    label: "Exchanges",
    icon: "⇄",
    accent: "#6366f1",
    accentDim: "rgba(99, 102, 241, 0.18)",
    blurb: "Cross-venue spot and perpetual markets, volume concentration, and venue dispersion.",
  },
  {
    id: "derivatives",
    label: "Derivatives",
    icon: "ƒ",
    accent: "#f59e0b",
    accentDim: "rgba(245, 158, 11, 0.18)",
    blurb: "Perpetuals, delivery futures, and options — funding, OI, and volatility surfaces.",
  },
  {
    id: "etf",
    label: "ETFs",
    icon: "▤",
    accent: "#3d9ef0",
    accentDim: "rgba(61, 158, 240, 0.18)",
    blurb: "US spot Bitcoin ETF holdings, daily flows, and assets under management.",
  },
  {
    id: "treasury",
    label: "DATCO",
    icon: "🏴",
    accent: "#c084fc",
    accentDim: "rgba(192, 132, 252, 0.18)",
    blurb: "Digital asset treasuries — public companies holding Bitcoin on balance sheet.",
  },
  {
    id: "stats",
    label: "Stats",
    icon: "Σ",
    accent: "#38bdf8",
    accentDim: "rgba(56, 189, 248, 0.18)",
    blurb: "Return statistics, drawdown risk, value-at-risk, power law, and Markov regimes.",
  },
  {
    id: "tradfi",
    label: "TradFi",
    icon: "◎",
    accent: "#94a3b8",
    accentDim: "rgba(148, 163, 184, 0.18)",
    blurb: "Global equity insights, single-stock deep dives, futures, rates, FX, and commodities.",
  },
  {
    id: "defi",
    label: "DeFi",
    icon: "◇",
    accent: "#a855f7",
    accentDim: "rgba(168, 85, 247, 0.18)",
    blurb: "Wrapped BTC, stablecoins, bridges, lending, liquidity pools, and staking yields.",
  },
  {
    id: "macro",
    label: "Macro",
    icon: "🌐",
    accent: "#14b8a6",
    accentDim: "rgba(20, 184, 166, 0.18)",
    blurb: "Rates, dollar strength, global liquidity, risk appetite, and inflation context for BTC.",
  },
  {
    id: "news",
    label: "News",
    icon: "📰",
    accent: "#f97316",
    accentDim: "rgba(249, 115, 22, 0.18)",
    blurb: "Bitcoin-centric headlines filtered by market, regulation, mining, tech, and on-chain.",
  },
  {
    id: "valuation",
    label: "Valuation",
    icon: "◎",
    accent: "#f59e0b",
    accentDim: "rgba(245, 158, 11, 0.18)",
    blurb: "Bitcoin on-chain indicators — distribution, cycles, miner economics, and sentiment.",
  },
];

let homeBound = false;

function renderHomeCards() {
  const grid = document.getElementById("home-section-grid");
  if (!grid) return;

  grid.innerHTML = HOME_SECTIONS.map(
    (section) => `
    <button
      type="button"
      class="home-card"
      data-dashboard="${section.id}"
      style="--home-card-accent: ${section.accent}; --home-card-accent-dim: ${section.accentDim}"
      aria-label="Open ${section.label}"
    >
      <span class="home-card-icon" aria-hidden="true">${section.icon}</span>
      <span class="home-card-label">${section.label}</span>
      <span class="home-card-blurb">${section.blurb}</span>
      <span class="home-card-cta">Chart course →</span>
    </button>`,
  ).join("");
}

function navigateHomeCard(dashboardId) {
  if (!dashboardId || !window.MenuController) return;
  window.MenuController.setLevel1(dashboardId);
}

function bindHomeCards() {
  if (homeBound) return;
  homeBound = true;

  const grid = document.getElementById("home-section-grid");
  if (!grid) return;

  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".home-card");
    if (!card?.dataset.dashboard) return;
    navigateHomeCard(card.dataset.dashboard);
  });

  grid.addEventListener("keydown", (event) => {
    const card = event.target.closest(".home-card");
    if (!card?.dataset.dashboard) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigateHomeCard(card.dataset.dashboard);
    }
  });
}

function initHomePage() {
  renderHomeCards();
  bindHomeCards();
  window.decorateHelpLabels?.(document.getElementById("dashboard-home"));
}

window.initHomePage = initHomePage;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    renderHomeCards();
    bindHomeCards();
  });
} else {
  renderHomeCards();
  bindHomeCards();
}