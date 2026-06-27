const TRADFI_SECTIONS = [
  "stocks-indices",
  "stocks-companies",
  "futures",
  "rates",
  "currencies",
  "commodities",
  "sectors",
  "energy",
];

const TRADFI_POLL_MS = 300_000;
const COMPANIES_STORAGE_KEY = "tradfi:stocks-companies:v1";
const COMPANIES_HERO_SLOTS = 4;
const COMPANIES_TABLE_MIN = 10;
const COMPANIES_TABLE_MAX = 50;
const COMPANIES_REFETCH_MS = 400;

const DEFAULT_COMPANIES = {
  heroes: ["AAPL", "MSFT", "NVDA", "AMZN"],
  table: [
    "GOOGL", "META", "TSLA", "BRK-B", "JPM", "V", "UNH", "XOM", "WMT", "LLY",
  ],
};

const INDICES_STORAGE_KEY = "tradfi:stocks-indices:v1";
const INDICES_HERO_SLOTS = 4;
const INDICES_TABLE_MIN = 11;
const INDICES_TABLE_MAX = 50;
const INDICES_REFETCH_MS = 400;

const DEFAULT_INDICES = {
  heroes: ["^GSPC", "^DJI", "^IXIC", "^RUT"],
  table: [
    "^VIX", "^STOXX50E", "^FTSE", "^GDAXI", "^FCHI",
    "^N225", "^HSI", "^AXJO", "^BSESN", "^KS11", "^TWII",
  ],
};

const tradfiCache = {};
let tradfiPollTimer = null;
let tradfiActiveSection = null;
let tradfiReady = false;
let companiesWatchlist = null;
let companiesRefetchTimer = null;
let companiesEventsBound = false;
let indicesWatchlist = null;
let indicesRefetchTimer = null;
let indicesEventsBound = false;
const tfEl = (id) => document.getElementById(id);

function tfFmtNum(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(d);
}

function tfFmtPct(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return prefix + Number(n).toFixed(d) + "%";
}

function tfFmtChange(n, mode) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  if (mode === "yield") return prefix + Number(n).toFixed(3) + " bp";
  if (mode === "fx") return prefix + Number(n).toFixed(4);
  return prefix + Number(n).toFixed(2);
}

function tfFmtPrice(q, mode) {
  const p = q?.price;
  if (p == null || Number.isNaN(p)) return "—";
  if (mode === "yield") return tfFmtNum(p, 2) + "%";
  if (mode === "fx") return tfFmtNum(p, 4);
  if (p >= 1000) {
    return Number(p).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return tfFmtNum(p, 2);
}

function tfChangeClass(n) {
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "";
}

function normalizeTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function padHeroSlots(heroes) {
  const slots = heroes.map((sym) => normalizeTicker(sym));
  while (slots.length < COMPANIES_HERO_SLOTS) slots.push("");
  return slots.slice(0, COMPANIES_HERO_SLOTS);
}

function defaultTableSlots() {
  const slots = DEFAULT_COMPANIES.table.map((sym) => normalizeTicker(sym));
  while (slots.length < COMPANIES_TABLE_MIN) slots.push("");
  return slots.slice(0, COMPANIES_TABLE_MAX);
}

function normalizeTableSlots(table, isDefault = false) {
  const slots = table.map((sym) => normalizeTicker(sym));
  if (isDefault) {
    while (slots.length < COMPANIES_TABLE_MIN) slots.push("");
  } else if (!slots.length) {
    slots.push("");
  }
  return slots.slice(0, COMPANIES_TABLE_MAX);
}

function loadSavedCompanies() {
  let saved = null;
  try {
    const raw = localStorage.getItem(COMPANIES_STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    saved = null;
  }

  const heroes = padHeroSlots(
    Array.isArray(saved?.heroes) ? saved.heroes : DEFAULT_COMPANIES.heroes,
  );
  const table = Array.isArray(saved?.table)
    ? normalizeTableSlots(saved.table, false)
    : defaultTableSlots();

  companiesWatchlist = { heroes, table };
  return companiesWatchlist;
}

function persistCompaniesWatchlist() {
  if (!companiesWatchlist) return;
  localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(companiesWatchlist));
}

function companiesCacheKey() {
  if (!companiesWatchlist) return "stocks-companies";
  return `stocks-companies:${companiesWatchlist.heroes.join("|")}:${companiesWatchlist.table.join("|")}`;
}

function defaultIndicesTableSlots() {
  const slots = DEFAULT_INDICES.table.map((sym) => normalizeTicker(sym));
  while (slots.length < INDICES_TABLE_MIN) slots.push("");
  return slots.slice(0, INDICES_TABLE_MAX);
}

function padIndicesHeroSlots(heroes) {
  const slots = heroes.map((sym) => normalizeTicker(sym));
  while (slots.length < INDICES_HERO_SLOTS) slots.push("");
  return slots.slice(0, INDICES_HERO_SLOTS);
}

function normalizeIndicesTableSlots(table, isDefault = false) {
  const slots = table.map((sym) => normalizeTicker(sym));
  if (isDefault) {
    while (slots.length < INDICES_TABLE_MIN) slots.push("");
  } else if (!slots.length) {
    slots.push("");
  }
  return slots.slice(0, INDICES_TABLE_MAX);
}

function loadSavedIndices() {
  let saved = null;
  try {
    const raw = localStorage.getItem(INDICES_STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    saved = null;
  }

  const heroes = padIndicesHeroSlots(
    Array.isArray(saved?.heroes) ? saved.heroes : DEFAULT_INDICES.heroes,
  );
  const table = Array.isArray(saved?.table)
    ? normalizeIndicesTableSlots(saved.table, false)
    : defaultIndicesTableSlots();

  indicesWatchlist = { heroes, table };
  return indicesWatchlist;
}

function persistIndicesWatchlist() {
  if (!indicesWatchlist) return;
  localStorage.setItem(INDICES_STORAGE_KEY, JSON.stringify(indicesWatchlist));
}

function indicesCacheKey() {
  if (!indicesWatchlist) return "stocks-indices";
  return `stocks-indices:${indicesWatchlist.heroes.join("|")}:${indicesWatchlist.table.join("|")}`;
}

function tradfiSectionCacheKey(section) {
  if (section === "stocks-companies") return companiesCacheKey();
  if (section === "stocks-indices") return indicesCacheKey();
  return section;
}

function getTradfiScreen(section) {
  return (
    document.querySelector(
      `#dashboard-tradfi .menu-screen[data-tradfi-section="${section}"]`,
    ) ||
    document.querySelector(`#dashboard-tradfi .menu-screen[data-l2="${section}"]`)
  );
}

function applyTradfiScreenState(section, opts = {}) {
  const screen = getTradfiScreen(section);
  if (!screen) return;

  const isStale = !!(
    opts.stale &&
    (opts.refreshing || opts.refreshFailed)
  );
  screen.classList.toggle("tradfi-screen--stale", isStale);

  if (opts.justUpdated) {
    screen.classList.add("tradfi-screen--just-updated");
    clearTimeout(screen._tradfiFlashTimer);
    screen._tradfiFlashTimer = setTimeout(() => {
      screen.classList.remove("tradfi-screen--just-updated");
    }, 1000);
  }
}

function quoteMapFromData(data) {
  const map = new Map();
  for (const q of [...(data?.heroes || []), ...(data?.table || [])]) {
    const sym = normalizeTicker(q?.symbol);
    if (sym) map.set(sym, q);
  }
  return map;
}

function quoteFromApiData(symbol, data) {
  const sym = normalizeTicker(symbol);
  if (!sym || !data) return null;
  const quoteMap = quoteMapFromData(data);
  return quoteMap.get(sym) || null;
}

function lookupQuote(symbol, dataOrMap) {
  const sym = normalizeTicker(symbol);
  if (!sym) return null;

  if (dataOrMap && typeof dataOrMap.get === "function") {
    return (
      dataOrMap.get(sym) || {
        symbol: sym,
        name: sym,
        price: null,
        change: null,
        changePct: null,
      }
    );
  }

  const fromApi = quoteFromApiData(sym, dataOrMap);
  if (fromApi) return fromApi;

  return {
    symbol: sym,
    name: sym,
    price: null,
    change: null,
    changePct: null,
  };
}

function companyDisplayName(quote, symbol) {
  if (!symbol) return "—";
  if (!quote?.name) return "—";
  const sym = normalizeTicker(symbol);
  if (quote.name === sym && quote.price == null) return "—";
  return quote.name;
}

function captureTickerFocus() {
  const active = document.activeElement;
  if (
    active &&
    active.classList?.contains("tradfi-ticker-input") &&
    active.dataset.tradfiFocus
  ) {
    return {
      key: active.dataset.tradfiFocus,
      start: active.selectionStart,
      end: active.selectionEnd,
    };
  }
  return null;
}

function restoreTickerFocus(focus) {
  if (!focus) return;
  const input = document.querySelector(
    `.tradfi-ticker-input[data-tradfi-focus="${focus.key}"]`,
  );
  if (!input) return;
  input.focus();
  try {
    input.setSelectionRange(focus.start, focus.end);
  } catch {
    /* ignore */
  }
}

function watchlistQueryParams(section) {
  const watchlist =
    section === "stocks-companies"
      ? companiesWatchlist
      : section === "stocks-indices"
        ? indicesWatchlist
        : null;
  if (!watchlist) return "";
  const params = new URLSearchParams();
  const heroes = watchlist.heroes.filter(Boolean);
  const symbols = watchlist.table.filter(Boolean);
  if (heroes.length) params.set("heroes", heroes.join(","));
  if (symbols.length) params.set("symbols", symbols.join(","));
  return params.toString();
}

async function fetchTradfiSection(section, opts = {}) {
  let url = `/api/tradfi/${section}`;
  const qs = watchlistQueryParams(section);
  if (qs) url += `?${qs}`;

  const res = await fetch(url, {
    cache:
      section === "stocks-companies" || section === "stocks-indices"
        ? "no-store"
        : "default",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `TradFi ${section} ${res.status}`);
  }
  return res.json();
}

function scheduleCompaniesRefetch(immediate = false) {
  if (companiesRefetchTimer) clearTimeout(companiesRefetchTimer);
  if (immediate) {
    loadTradfiSection("stocks-companies");
    return;
  }
  companiesRefetchTimer = setTimeout(() => {
    companiesRefetchTimer = null;
    if (tradfiActiveSection === "stocks-companies") {
      loadTradfiSection("stocks-companies");
    }
  }, COMPANIES_REFETCH_MS);
}

function updateCompaniesFromInputs() {
  if (!companiesWatchlist) loadSavedCompanies();

  const heroInputs = document.querySelectorAll(
    "#tradfi-stocks-companies-heroes .tradfi-ticker-input",
  );
  heroInputs.forEach((input, i) => {
    companiesWatchlist.heroes[i] = normalizeTicker(input.value);
  });

  const rowInputs = document.querySelectorAll(
    "#tradfi-stocks-companies-table-body .tradfi-ticker-input",
  );
  const table = [];
  rowInputs.forEach((input) => {
    table.push(normalizeTicker(input.value));
  });
  companiesWatchlist.table = normalizeTableSlots(table, false);
  persistCompaniesWatchlist();
}

function bindCompaniesEvents() {
  if (companiesEventsBound) return;
  companiesEventsBound = true;

  const heroes = tfEl("tradfi-stocks-companies-heroes");
  const tableBody = tfEl("tradfi-stocks-companies-table-body");
  const addBtn = tfEl("tradfi-stocks-companies-add-row");

  const onTickerInput = () => {
    updateCompaniesFromInputs();
    scheduleCompaniesRefetch(false);
  };

  const onTickerCommit = () => {
    updateCompaniesFromInputs();
    scheduleCompaniesRefetch(true);
  };

  heroes?.addEventListener("input", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerInput();
  });
  heroes?.addEventListener("change", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerCommit();
  });
  heroes?.addEventListener("keydown", (e) => {
    if (
      e.target.classList.contains("tradfi-ticker-input") &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      e.target.blur();
      onTickerCommit();
    }
  });

  tableBody?.addEventListener("input", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerInput();
  });
  tableBody?.addEventListener("change", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerCommit();
  });
  tableBody?.addEventListener("keydown", (e) => {
    if (
      e.target.classList.contains("tradfi-ticker-input") &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      e.target.blur();
      onTickerCommit();
    }
  });

  tableBody?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tradfi-row-remove");
    if (!btn || btn.disabled) return;
    const row = btn.closest("tr");
    const idx = Number(row?.dataset.rowIndex);
    if (!Number.isFinite(idx)) return;
    if (!companiesWatchlist) loadSavedCompanies();
    if (companiesWatchlist.table.length <= 1) return;
    companiesWatchlist.table.splice(idx, 1);
    if (!companiesWatchlist.table.length) companiesWatchlist.table.push("");
    persistCompaniesWatchlist();
    scheduleCompaniesRefetch(true);
  });

  addBtn?.addEventListener("click", () => {
    if (!companiesWatchlist) loadSavedCompanies();
    if (companiesWatchlist.table.length >= COMPANIES_TABLE_MAX) return;
    companiesWatchlist.table.push("");
    persistCompaniesWatchlist();
    const focus = { key: `table-${companiesWatchlist.table.length - 1}`, start: 0, end: 0 };
    const cached = tradfiCache[companiesCacheKey()];
    if (cached) {
      renderCompaniesEditable("stocks-companies", cached);
    } else {
      renderTradfiCompaniesTable("stocks-companies", { priceMode: "price" });
    }
    restoreTickerFocus(focus);
  });
}

function scheduleIndicesRefetch(immediate = false) {
  if (indicesRefetchTimer) clearTimeout(indicesRefetchTimer);
  if (immediate) {
    loadTradfiSection("stocks-indices");
    return;
  }
  indicesRefetchTimer = setTimeout(() => {
    indicesRefetchTimer = null;
    if (tradfiActiveSection === "stocks-indices") {
      loadTradfiSection("stocks-indices");
    }
  }, INDICES_REFETCH_MS);
}

function updateIndicesFromInputs() {
  if (!indicesWatchlist) loadSavedIndices();

  const heroInputs = document.querySelectorAll(
    "#tradfi-stocks-indices-heroes .tradfi-ticker-input",
  );
  heroInputs.forEach((input, i) => {
    indicesWatchlist.heroes[i] = normalizeTicker(input.value);
  });

  const rowInputs = document.querySelectorAll(
    "#tradfi-stocks-indices-table-body .tradfi-ticker-input",
  );
  const table = [];
  rowInputs.forEach((input) => {
    table.push(normalizeTicker(input.value));
  });
  indicesWatchlist.table = normalizeIndicesTableSlots(table, false);
  persistIndicesWatchlist();
}

function bindIndicesEvents() {
  if (indicesEventsBound) return;
  indicesEventsBound = true;

  const heroes = tfEl("tradfi-stocks-indices-heroes");
  const tableBody = tfEl("tradfi-stocks-indices-table-body");
  const addBtn = tfEl("tradfi-stocks-indices-add-row");

  const onTickerInput = () => {
    updateIndicesFromInputs();
    scheduleIndicesRefetch(false);
  };

  const onTickerCommit = () => {
    updateIndicesFromInputs();
    scheduleIndicesRefetch(true);
  };

  heroes?.addEventListener("input", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerInput();
  });
  heroes?.addEventListener("change", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerCommit();
  });
  heroes?.addEventListener("keydown", (e) => {
    if (
      e.target.classList.contains("tradfi-ticker-input") &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      e.target.blur();
      onTickerCommit();
    }
  });

  tableBody?.addEventListener("input", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerInput();
  });
  tableBody?.addEventListener("change", (e) => {
    if (e.target.classList.contains("tradfi-ticker-input")) onTickerCommit();
  });
  tableBody?.addEventListener("keydown", (e) => {
    if (
      e.target.classList.contains("tradfi-ticker-input") &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      e.target.blur();
      onTickerCommit();
    }
  });

  tableBody?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tradfi-row-remove");
    if (!btn || btn.disabled) return;
    const row = btn.closest("tr");
    const idx = Number(row?.dataset.rowIndex);
    if (!Number.isFinite(idx)) return;
    if (!indicesWatchlist) loadSavedIndices();
    if (indicesWatchlist.table.length <= 1) return;
    indicesWatchlist.table.splice(idx, 1);
    if (!indicesWatchlist.table.length) indicesWatchlist.table.push("");
    persistIndicesWatchlist();
    scheduleIndicesRefetch(true);
  });

  addBtn?.addEventListener("click", () => {
    if (!indicesWatchlist) loadSavedIndices();
    if (indicesWatchlist.table.length >= INDICES_TABLE_MAX) return;
    indicesWatchlist.table.push("");
    persistIndicesWatchlist();
    const focus = { key: `table-${indicesWatchlist.table.length - 1}`, start: 0, end: 0 };
    const cached = tradfiCache[indicesCacheKey()];
    if (cached) {
      renderIndicesEditable("stocks-indices", cached);
    } else {
      renderTradfiIndicesTable("stocks-indices", { priceMode: "price" });
    }
    restoreTickerFocus(focus);
  });
}

function buildTradfiCommentary(data) {
  const lines = [];
  const mode = data.priceMode || "price";
  const heroes = data.heroes || [];
  const table = data.table || [];

  if (!heroes.length) return ["Market data unavailable."];

  const lead = heroes.find((h) => h.symbol && h.price != null) || heroes[0];
  lines.push(
    `${data.title}: ${lead.name || lead.symbol || "—"} at ${tfFmtPrice(lead, mode)} ` +
      `(${tfFmtChange(lead.change, mode)}, ${tfFmtPct(lead.changePct)}). ` +
      `Source: ${data.source} · delayed quotes.`,
  );

  const sorted = [...table].sort(
    (a, b) => (b.changePct ?? 0) - (a.changePct ?? 0),
  );
  const gainers = sorted.filter((r) => (r.changePct ?? 0) > 0).slice(0, 3);
  const losers = sorted.filter((r) => (r.changePct ?? 0) < 0).slice(-3).reverse();

  if (gainers.length) {
    lines.push(
      `Top movers: ${gainers
        .map((r) => `${r.name} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }
  if (losers.length) {
    lines.push(
      `Weakest: ${losers
        .map((r) => `${r.name} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }

  const pts = data.chart?.points || [];
  if (pts.length >= 2) {
    const first = pts[0].close;
    const last = pts[pts.length - 1].close;
    const ret = first ? (last - first) / first : 0;
    lines.push(
      `${data.chartLabel} 3-month move: ${tfFmtPct(ret)} ` +
        `(${pts[0].date} → ${pts[pts.length - 1].date}).`,
    );
  }

  if (data.section === "rates") {
    const tnx = heroes.find((h) => h.symbol === "^TNX");
    const irx = heroes.find((h) => h.symbol === "^IRX");
    if (tnx && irx) {
      lines.push(
        `Curve snapshot: 10Y ${tfFmtNum(tnx.price, 2)}% vs 13-week ${tfFmtNum(irx.price, 2)}%. ` +
          `Watch TLT/IEF for duration risk.`,
      );
    }
  } else if (data.section === "currencies") {
    lines.push(
      `Dollar tone sets the cross-asset backdrop — firm DXY often pressures commodities and EM FX.`,
    );
  } else if (data.section === "energy") {
    lines.push(
      `Energy complex led by crude and nat gas; equity beta via XLE and supermajors in the table.`,
    );
  } else if (data.section === "stocks-indices") {
    const vix = table.find((r) => r.symbol === "^VIX");
    if (vix) {
      lines.push(
        `Global risk gauge: VIX at ${tfFmtPrice(vix, mode)} (${tfFmtPct(vix.changePct)}). ` +
          `Cross-region breadth via Stoxx, FTSE, Nikkei, and Hang Seng in the table.`,
      );
    }
  } else if (data.section === "stocks-companies") {
    lines.push(
      `Custom watchlist — edit tickers in the hero strip and table; changes save automatically.`,
    );
  }

  return lines;
}

function renderTradfiHeroes(section, data) {
  const strip = tfEl(`tradfi-${section}-heroes`);
  if (!strip) return;
  const mode = data.priceMode || "price";

  strip.innerHTML = (data.heroes || [])
    .slice(0, 4)
    .map(
      (q) => `
      <article class="deriv-hero-block">
        <span class="deriv-hero-label">${q.name}</span>
        <span class="deriv-hero-value ${tfChangeClass(q.changePct)}">${tfFmtPrice(q, mode)}</span>
        <span class="deriv-hero-sub">${tfFmtChange(q.change, mode)} · ${tfFmtPct(q.changePct)}</span>
      </article>`,
    )
    .join("");
}

function renderIndicesHeroes(section, data) {
  const strip = tfEl(`tradfi-${section}-heroes`);
  if (!strip || !indicesWatchlist) return;
  const mode = data.priceMode || "price";
  const focus = captureTickerFocus();

  if (!data?.fetchedAt) {
    strip.innerHTML = indicesWatchlist.heroes
      .map(
        (sym, i) => `
      <article class="deriv-hero-block tradfi-hero-editable">
        <input
          type="text"
          class="tradfi-ticker-input tradfi-ticker-input--hero"
          value="${sym}"
          placeholder="Symbol"
          spellcheck="false"
          autocomplete="off"
          aria-label="Hero index ${i + 1}"
          data-tradfi-focus="hero-${i}"
        />
        <span class="deriv-hero-value">—</span>
        <span class="deriv-hero-sub">Loading…</span>
      </article>`,
      )
      .join("");
    restoreTickerFocus(focus);
    return;
  }

  strip.innerHTML = indicesWatchlist.heroes
    .map((sym, i) => {
      const q = lookupQuote(sym, data);
      const name = companyDisplayName(q, sym);
      return `
      <article class="deriv-hero-block tradfi-hero-editable">
        <input
          type="text"
          class="tradfi-ticker-input tradfi-ticker-input--hero"
          value="${sym}"
          placeholder="Symbol"
          spellcheck="false"
          autocomplete="off"
          aria-label="Hero index ${i + 1}"
          data-tradfi-focus="hero-${i}"
        />
        ${name ? `<span class="deriv-hero-label">${name}</span>` : ""}
        <span class="deriv-hero-value ${tfChangeClass(q?.changePct)}">${tfFmtPrice(q, mode)}</span>
        <span class="deriv-hero-sub">${tfFmtChange(q?.change, mode)} · ${tfFmtPct(q?.changePct)}</span>
      </article>`;
    })
    .join("");

  restoreTickerFocus(focus);
}

function renderCompaniesHeroes(section, data) {
  const strip = tfEl(`tradfi-${section}-heroes`);
  if (!strip || !companiesWatchlist) return;
  const mode = data.priceMode || "price";
  const focus = captureTickerFocus();

  if (!data?.fetchedAt) {
    strip.innerHTML = companiesWatchlist.heroes
      .map(
        (sym, i) => `
      <article class="deriv-hero-block tradfi-hero-editable">
        <input
          type="text"
          class="tradfi-ticker-input tradfi-ticker-input--hero"
          value="${sym}"
          placeholder="Ticker"
          spellcheck="false"
          autocomplete="off"
          aria-label="Hero ticker ${i + 1}"
          data-tradfi-focus="hero-${i}"
        />
        <span class="deriv-hero-value">—</span>
        <span class="deriv-hero-sub">Loading…</span>
      </article>`,
      )
      .join("");
    restoreTickerFocus(focus);
    return;
  }

  strip.innerHTML = companiesWatchlist.heroes
    .map((sym, i) => {
      const q = lookupQuote(sym, data);
      const name = companyDisplayName(q, sym);
      return `
      <article class="deriv-hero-block tradfi-hero-editable">
        <input
          type="text"
          class="tradfi-ticker-input tradfi-ticker-input--hero"
          value="${sym}"
          placeholder="Ticker"
          spellcheck="false"
          autocomplete="off"
          aria-label="Hero ticker ${i + 1}"
          data-tradfi-focus="hero-${i}"
        />
        ${name ? `<span class="deriv-hero-label">${name}</span>` : ""}
        <span class="deriv-hero-value ${tfChangeClass(q?.changePct)}">${tfFmtPrice(q, mode)}</span>
        <span class="deriv-hero-sub">${tfFmtChange(q?.change, mode)} · ${tfFmtPct(q?.changePct)}</span>
      </article>`;
    })
    .join("");

  restoreTickerFocus(focus);
}

function tfFmtPerf(n) {
  return tfFmtPct(n, 1);
}

function renderTradfiIndicesTable(section, data) {
  const body = tfEl(`tradfi-${section}-table-body`);
  if (!body || !indicesWatchlist) return;
  const mode = data.priceMode || "price";
  const focus = captureTickerFocus();
  const canRemove = indicesWatchlist.table.length > 1;
  const loading = !data?.fetchedAt;

  if (loading) {
    body.innerHTML =
      `<tr><td colspan="11">Loading market data…</td></tr>`;
    return;
  }

  body.innerHTML = indicesWatchlist.table
    .map((sym, i) => {
      const q = lookupQuote(sym, data);
      const name = companyDisplayName(q, sym);
      const perf = q?.perf || {};
      return `
      <tr data-row-index="${i}">
        <td>
          <input
            type="text"
            class="tradfi-ticker-input"
            value="${sym}"
            placeholder="Symbol"
            spellcheck="false"
            autocomplete="off"
            aria-label="Index symbol ${i + 1}"
            data-tradfi-focus="table-${i}"
          />
        </td>
        <td class="tradfi-company-name">${name}</td>
        <td class="mono">${tfFmtPrice(q, mode)}</td>
        <td class="mono ${tfChangeClass(q?.change)}">${tfFmtChange(q?.change, mode)}</td>
        <td class="mono ${tfChangeClass(q?.changePct)}">${tfFmtPct(q?.changePct)}</td>
        <td class="mono ${tfChangeClass(perf.w1)}">${tfFmtPerf(perf.w1)}</td>
        <td class="mono ${tfChangeClass(perf.m1)}">${tfFmtPerf(perf.m1)}</td>
        <td class="mono ${tfChangeClass(perf.m3)}">${tfFmtPerf(perf.m3)}</td>
        <td class="mono ${tfChangeClass(perf.m12)}">${tfFmtPerf(perf.m12)}</td>
        <td class="mono ${tfChangeClass(perf.ytd)}">${tfFmtPerf(perf.ytd)}</td>
        <td class="tradfi-row-actions">
          <button
            type="button"
            class="tradfi-row-remove"
            aria-label="Remove row ${i + 1}"
            ${canRemove ? "" : "disabled"}
          >×</button>
        </td>
      </tr>`;
    })
    .join("");

  restoreTickerFocus(focus);
}

function renderIndicesEditable(section, data) {
  renderIndicesHeroes(section, data);
  renderTradfiIndicesTable(section, data);
}

function renderTradfiTable(section, data) {
  const body = tfEl(`tradfi-${section}-table-body`);
  if (!body) return;
  const mode = data.priceMode || "price";

  body.innerHTML = (data.table || [])
    .map(
      (q) => `
      <tr>
        <td>${q.name}<span class="tradfi-symbol-tag">${q.symbol}</span></td>
        <td class="mono">${tfFmtPrice(q, mode)}</td>
        <td class="mono ${tfChangeClass(q.change)}">${tfFmtChange(q.change, mode)}</td>
        <td class="mono ${tfChangeClass(q.changePct)}">${tfFmtPct(q.changePct)}</td>
      </tr>`,
    )
    .join("");
}

function renderTradfiCompaniesTable(section, data) {
  const body = tfEl(`tradfi-${section}-table-body`);
  if (!body || !companiesWatchlist) return;
  const mode = data.priceMode || "price";
  const focus = captureTickerFocus();
  const canRemove = companiesWatchlist.table.length > 1;
  const loading = !data?.fetchedAt;

  if (loading) {
    body.innerHTML =
      `<tr><td colspan="11">Loading market data…</td></tr>`;
    return;
  }

  body.innerHTML = companiesWatchlist.table
    .map((sym, i) => {
      const q = lookupQuote(sym, data);
      const name = companyDisplayName(q, sym);
      const perf = q?.perf || {};
      return `
      <tr data-row-index="${i}">
        <td>
          <input
            type="text"
            class="tradfi-ticker-input"
            value="${sym}"
            placeholder="Ticker"
            spellcheck="false"
            autocomplete="off"
            aria-label="Company ticker ${i + 1}"
            data-tradfi-focus="table-${i}"
          />
        </td>
        <td class="tradfi-company-name">${name}</td>
        <td class="mono">${tfFmtPrice(q, mode)}</td>
        <td class="mono ${tfChangeClass(q?.change)}">${tfFmtChange(q?.change, mode)}</td>
        <td class="mono ${tfChangeClass(q?.changePct)}">${tfFmtPct(q?.changePct)}</td>
        <td class="mono ${tfChangeClass(perf.w1)}">${tfFmtPerf(perf.w1)}</td>
        <td class="mono ${tfChangeClass(perf.m1)}">${tfFmtPerf(perf.m1)}</td>
        <td class="mono ${tfChangeClass(perf.m3)}">${tfFmtPerf(perf.m3)}</td>
        <td class="mono ${tfChangeClass(perf.m12)}">${tfFmtPerf(perf.m12)}</td>
        <td class="mono ${tfChangeClass(perf.ytd)}">${tfFmtPerf(perf.ytd)}</td>
        <td class="tradfi-row-actions">
          <button
            type="button"
            class="tradfi-row-remove"
            aria-label="Remove row ${i + 1}"
            ${canRemove ? "" : "disabled"}
          >×</button>
        </td>
      </tr>`;
    })
    .join("");

  restoreTickerFocus(focus);
}

function renderCompaniesEditable(section, data) {
  renderCompaniesHeroes(section, data);
  renderTradfiCompaniesTable(section, data);
}

function tfChartTipTitle(date) {
  return `<div class="chart-tooltip-title">${fmtChartDate(date, false)}</div>`;
}

function tfChartTipRow(label, value) {
  return `<div class="chart-tooltip-row"><span>${label}</span><span class="mono">${value}</span></div>`;
}

function tfFmtChartPrice(v, mode) {
  if (v == null || Number.isNaN(v)) return "—";
  if (mode === "yield") return tfFmtNum(v, 2) + "%";
  if (mode === "fx") return tfFmtNum(v, 4);
  return tfFmtNum(v, 2);
}

function mountTradfiChart(canvas, chart, priceMode) {
  const pts = chart?.points || [];
  if (!canvas || !pts.length || !window.ChartInteraction) return null;

  const pad = { top: 18, right: 20, bottom: 36, left: 56 };
  const mode = priceMode || "price";

  const fmtY = (v) => {
    if (mode === "yield") return tfFmtNum(v, 2) + "%";
    if (mode === "fx") return tfFmtNum(v, 2);
    return tfFmtNum(v, 0);
  };

  return ChartInteraction.ensure(canvas, {
    pad,
    minWindow: 20,
    maxPoints: 1500,
    getLength: () => pts.length,
    onDraw(ctx, w, h, api) {
      ctx.clearRect(0, 0, w, h);
      const indices = api.indices;
      const vals = indices.map((i) => pts[i].close);
      const drawCount = vals.length;
      if (!drawCount) return;

      const minV = Math.min(...vals);
      const maxV = Math.max(...vals);
      const range = maxV - minV || 0.01;
      const yAt = (v) =>
        api.pad.top + api.chartH - ((v - minV) / range) * api.chartH;

      ctx.fillStyle = "rgba(148, 163, 184, 0.15)";
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, api.pad.top + api.chartH);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(api.pad.left + api.chartW, api.pad.top + api.chartH);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (api.hoverGlobal != null) {
        const v = pts[api.hoverGlobal].close;
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yAt(v));
      }

      ctx.fillStyle = "#7d8799";
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtY(maxV), api.pad.left - 6, api.pad.top + 10);
      ctx.fillText(fmtY(minV), api.pad.left - 6, h - api.pad.bottom);
      drawTimeAxisLabels(ctx, w, h, api.pad, drawCount, (i) =>
        fmtChartDate(pts[indices[i]]?.date, drawCount > 120),
      );
    },
    formatTooltip(globalIdx) {
      const pt = pts[globalIdx];
      return (
        tfChartTipTitle(pt?.date) +
        tfChartTipRow("Close", tfFmtChartPrice(pt?.close, mode))
      );
    },
  });
}

function renderTradfiCharts(section, data) {
  const container = tfEl(`tradfi-${section}-charts`);
  if (!container) return false;

  const charts = data.charts?.length
    ? data.charts
    : data.chart?.points?.length
      ? [data.chart]
      : [];

  container.innerHTML = charts
    .map(
      (ch, i) => `
    <section class="panel tradfi-chart-panel">
      <div class="panel-header">
        <h2>${ch.label || ch.symbol || "Benchmark"}</h2>
        <span class="panel-meta">3-month · daily</span>
      </div>
      <div class="deriv-chart-wrap tradfi-chart-wrap">
        <canvas id="tradfi-${section}-chart-${i}" height="200"></canvas>
      </div>
    </section>`,
    )
    .join("");

  charts.forEach((ch, i) => {
    const canvas = tfEl(`tradfi-${section}-chart-${i}`);
    mountTradfiChart(canvas, ch, data.priceMode);
  });

  return true;
}

function repaintTradfiCharts(section, data) {
  if (data.charts?.length && tfEl(`tradfi-${section}-charts`)) {
    data.charts.forEach((ch, i) => {
      const canvas = tfEl(`tradfi-${section}-chart-${i}`);
      mountTradfiChart(canvas, ch, data.priceMode);
    });
    return;
  }
  const canvas = tfEl(`tradfi-${section}-chart`);
  if (canvas && data.chart) {
    mountTradfiChart(canvas, data.chart, data.priceMode);
  }
}

function tfFmtNewsTime(iso) {
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

function renderTradfiCompaniesNews(section, data) {
  const feed = tfEl(`tradfi-${section}-news`);
  if (!feed) return;

  const articles = data.news || [];
  if (!data?.fetchedAt) {
    feed.innerHTML = '<p class="news-empty">Loading headlines…</p>';
    return;
  }
  if (!articles.length) {
    feed.innerHTML =
      '<p class="news-empty">No recent headlines for this watchlist.</p>';
    return;
  }

  feed.innerHTML = articles
    .map((art) => {
      const symbols = (art.symbols || [])
        .map((s) => `<span class="news-card-symbol">${s}</span>`)
        .join("");
      return `
      <article class="news-card">
        <div class="news-card-head">
          <a class="news-card-title" href="${art.link}" target="_blank" rel="noopener noreferrer">${art.title}</a>
          <div class="news-card-badges">${symbols}</div>
        </div>
        <div class="news-card-meta">
          <span class="news-card-source">${art.source || "Yahoo Finance"}</span>
          <span class="news-card-time">${tfFmtNewsTime(art.publishedAt)}</span>
        </div>
      </article>`;
    })
    .join("");
}

function renderTradfiCommentary(section, data) {
  const node = tfEl(`tradfi-${section}-commentary`);
  if (!node) return;
  node.innerHTML = buildTradfiCommentary(data)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function renderTradfiScreen(section, data, opts = {}) {
  const cacheKey = tradfiSectionCacheKey(section);
  if (data?.fetchedAt) {
    tradfiCache[cacheKey] = data;
  }

  const swr = window.DashboardSWR;
  const panelSource = `${data?.source || "Yahoo Finance"} · delayed`;

  const updateEl = tfEl(`tradfi-${section}-update`);
  if (updateEl) {
    updateEl.textContent =
      swr?.formatPanelMeta({
        fetchedAt: data?.fetchedAt,
        source: panelSource,
        stale: opts.stale,
        refreshing: opts.refreshing,
        refreshFailed: opts.refreshFailed,
      }) || "—";
    updateEl.classList.toggle(
      "tradfi-meta--stale",
      !!(opts.stale && (opts.refreshing || opts.refreshFailed)),
    );
  }

  if (opts.refreshFailed) {
    swr?.setViewStatusBar("tradfi-refresh-status", {
      state: "failed",
      fetchedAt: data?.fetchedAt,
    });
  } else if (opts.stale && opts.refreshing) {
    swr?.setViewStatusBar("tradfi-refresh-status", {
      state: "refreshing",
      fetchedAt: data?.fetchedAt,
    });
  } else if (data?.fetchedAt) {
    swr?.setViewStatusBar("tradfi-refresh-status", {
      state: "live",
      fetchedAt: data.fetchedAt,
    });
  }

  const chartTitle = tfEl(`tradfi-${section}-chart-title`);
  if (chartTitle && window.labelWithHelp) {
    chartTitle.dataset.helpKey = "tradfi-benchmark-chart";
    chartTitle.innerHTML = window.labelWithHelp(
      data.chartLabel || "Benchmark",
      "tradfi-benchmark-chart",
    );
    chartTitle.dataset.helpDecorated = "true";
  } else if (chartTitle) {
    chartTitle.textContent = data.chartLabel || "Benchmark";
  }

  if (section === "stocks-companies") {
    bindCompaniesEvents();
    renderCompaniesEditable(section, data);
  } else if (section === "stocks-indices") {
    bindIndicesEvents();
    renderIndicesEditable(section, data);
  } else {
    renderTradfiHeroes(section, data);
    renderTradfiTable(section, data);
  }
  renderTradfiCommentary(section, data);

  if (!renderTradfiCharts(section, data)) {
    repaintTradfiCharts(section, data);
  }

  if (section === "stocks-companies") {
    renderTradfiCompaniesNews(section, data);
  }

  applyTradfiScreenState(section, opts);

  const screen = getTradfiScreen(section);
  window.decorateHelpLabels?.(screen);
}

async function loadTradfiSection(section) {
  if (!TRADFI_SECTIONS.includes(section)) return;
  tradfiActiveSection = section;

  if (section === "stocks-companies") {
    loadSavedCompanies();
    bindCompaniesEvents();
  }
  if (section === "stocks-indices") {
    loadSavedIndices();
    bindIndicesEvents();
  }

  const swr = window.DashboardSWR;
  if (!swr) return;

  const cacheKey = tradfiSectionCacheKey(section);
  const fetchKey = cacheKey;

  try {
    await swr.runSWR({
      key: `tradfi:${cacheKey}`,
      l1: "tradfi",
      source: "Yahoo Finance",
      validate: () => {
        if (section === "stocks-companies") {
          return companiesCacheKey() === fetchKey;
        }
        if (section === "stocks-indices") {
          return indicesCacheKey() === fetchKey;
        }
        return true;
      },
      fetch: () => fetchTradfiSection(section),
      render: (data, opts = {}) => {
        if (opts.loading) {
          swr.setViewStatusBar("tradfi-refresh-status", { state: "loading" });
          const body = tfEl(`tradfi-${section}-table-body`);
          if (section === "stocks-companies") {
            renderTradfiCompaniesTable(section, { priceMode: "price" });
          } else if (section === "stocks-indices") {
            renderTradfiIndicesTable(section, { priceMode: "price" });
          } else if (body) {
            body.innerHTML =
              '<tr><td colspan="4">Loading market data…</td></tr>';
          }
          if (section === "stocks-indices" || section === "stocks-companies") {
            const chartsEl = tfEl(`tradfi-${section}-charts`);
            if (chartsEl) chartsEl.innerHTML = "";
          }
          if (section === "stocks-companies") {
            const newsEl = tfEl("tradfi-stocks-companies-news");
            if (newsEl) {
              newsEl.innerHTML = '<p class="news-empty">Loading headlines…</p>';
            }
          }
          return;
        }
        if (
          section === "stocks-companies" &&
          companiesCacheKey() !== fetchKey
        ) {
          return;
        }
        if (
          section === "stocks-indices" &&
          indicesCacheKey() !== fetchKey
        ) {
          return;
        }
        renderTradfiScreen(section, data, opts);
      },
    });
  } catch (err) {
    console.error("TradFi load failed:", section, err);
    const commentary = tfEl(`tradfi-${section}-commentary`);
    if (commentary && !tradfiCache[cacheKey]) {
      commentary.innerHTML =
        `<p>Failed to load ${section} data. Is server.py running?</p>`;
    }
  }
}

function startTradfiPoll() {
  if (tradfiPollTimer) return;
  tradfiPollTimer = setInterval(() => {
    if (tradfiActiveSection) loadTradfiSection(tradfiActiveSection);
  }, TRADFI_POLL_MS);
}

function initTradfiModule() {
  if (tradfiReady) return;
  tradfiReady = true;
  window.addEventListener("resize", () => {
    if (!tradfiActiveSection) return;
    const cacheKey = tradfiSectionCacheKey(tradfiActiveSection);
    if (!tradfiCache[cacheKey]) return;
    repaintTradfiCharts(tradfiActiveSection, tradfiCache[cacheKey]);
  });
}

window.loadTradfiDashboard = function () {
  initTradfiModule();
  startTradfiPoll();
  window.decorateHelpLabels?.(document.getElementById("dashboard-tradfi"));
};

window.loadTradfiSection = loadTradfiSection;