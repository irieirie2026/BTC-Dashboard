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

const EDITABLE_TRADFI = {
  futures: {
    storageKey: "tradfi:futures:v1",
    defaults: {
      heroes: ["ES=F", "NQ=F", "YM=F", "RTY=F"],
      table: [
        "CL=F", "GC=F", "SI=F", "NG=F", "ZB=F", "ZN=F", "ZF=F", "6E=F", "6J=F",
      ],
    },
    tableMin: 9,
    placeholder: "Contract",
  },
  rates: {
    storageKey: "tradfi:rates:v1",
    defaults: {
      heroes: ["^TNX", "^FVX", "^TYX", "^IRX"],
      table: ["TLT", "IEF", "SHY", "LQD", "HYG", "TIP", "AGG", "BND"],
    },
    tableMin: 8,
    placeholder: "Symbol",
  },
  currencies: {
    storageKey: "tradfi:currencies:v1",
    defaults: {
      heroes: ["DX-Y.NYB", "EURUSD=X", "USDJPY=X", "GBPUSD=X"],
      table: [
        "AUDUSD=X", "USDCAD=X", "USDCHF=X", "USDCNH=X",
        "EURJPY=X", "EURGBP=X", "NZDUSD=X",
      ],
    },
    tableMin: 7,
    placeholder: "Pair",
  },
  commodities: {
    storageKey: "tradfi:commodities:v1",
    defaults: {
      heroes: ["CL=F", "BZ=F", "GC=F", "SI=F"],
      table: ["HG=F", "NG=F", "ZC=F", "ZS=F", "KC=F", "CT=F", "PL=F", "PA=F"],
    },
    tableMin: 8,
    placeholder: "Contract",
  },
  sectors: {
    storageKey: "tradfi:sectors:v1",
    defaults: {
      heroes: ["XLK", "XLF", "XLE", "XLV"],
      table: [
        "XLK", "XLF", "XLE", "XLV", "XLI", "XLP", "XLY", "XLU",
        "XLRE", "XLB", "XLC",
      ],
    },
    tableMin: 11,
    placeholder: "ETF",
  },
  energy: {
    storageKey: "tradfi:energy:v1",
    defaults: {
      heroes: ["CL=F", "BZ=F", "NG=F", "XLE"],
      table: ["USO", "UNG", "XOM", "CVX", "COP", "OXY", "SLB", "HAL"],
    },
    tableMin: 8,
    placeholder: "Symbol",
  },
};
const EDITABLE_TRADFI_SECTIONS = Object.keys(EDITABLE_TRADFI);
const EDITABLE_REFETCH_MS = 400;
const EDITABLE_HERO_SLOTS = 4;
const EDITABLE_TABLE_MAX = 50;

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
const editableState = {};
const tfEl = (id) => document.getElementById(id);

function getEditableCfg(section) {
  return EDITABLE_TRADFI[section] || null;
}

function isEditableTradfiSection(section) {
  return !!getEditableCfg(section);
}

function ensureEditableState(section) {
  if (!editableState[section]) {
    editableState[section] = {
      watchlist: null,
      refetchTimer: null,
      eventsBound: false,
    };
  }
  return editableState[section];
}

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

function defaultEditableTableSlots(section) {
  const cfg = getEditableCfg(section);
  const slots = cfg.defaults.table.map((sym) => normalizeTicker(sym));
  while (slots.length < cfg.tableMin) slots.push("");
  return slots.slice(0, EDITABLE_TABLE_MAX);
}

function padEditableHeroSlots(heroes) {
  const slots = heroes.map((sym) => normalizeTicker(sym));
  while (slots.length < EDITABLE_HERO_SLOTS) slots.push("");
  return slots.slice(0, EDITABLE_HERO_SLOTS);
}

function normalizeEditableTableSlots(section, table, isDefault = false) {
  const cfg = getEditableCfg(section);
  const slots = table.map((sym) => normalizeTicker(sym));
  if (isDefault) {
    while (slots.length < cfg.tableMin) slots.push("");
  } else if (!slots.length) {
    slots.push("");
  }
  return slots.slice(0, EDITABLE_TABLE_MAX);
}

function loadEditableWatchlist(section) {
  const cfg = getEditableCfg(section);
  if (!cfg) return null;
  const state = ensureEditableState(section);

  let saved = null;
  try {
    const raw = localStorage.getItem(cfg.storageKey);
    if (raw) saved = JSON.parse(raw);
  } catch {
    saved = null;
  }

  const heroes = padEditableHeroSlots(
    Array.isArray(saved?.heroes) ? saved.heroes : cfg.defaults.heroes,
  );
  const table = Array.isArray(saved?.table)
    ? normalizeEditableTableSlots(section, saved.table, false)
    : defaultEditableTableSlots(section);

  state.watchlist = { heroes, table };
  return state.watchlist;
}

function getEditableWatchlist(section) {
  const state = ensureEditableState(section);
  return state.watchlist || loadEditableWatchlist(section);
}

function persistEditableWatchlist(section) {
  const cfg = getEditableCfg(section);
  const state = ensureEditableState(section);
  if (!cfg || !state.watchlist) return;
  localStorage.setItem(cfg.storageKey, JSON.stringify(state.watchlist));
}

function editableCacheKey(section) {
  const watchlist = getEditableWatchlist(section);
  if (!watchlist) return section;
  return `${section}:${watchlist.heroes.join("|")}:${watchlist.table.join("|")}`;
}

function tradfiSectionCacheKey(section) {
  if (section === "stocks-companies") return companiesCacheKey();
  if (section === "stocks-indices") return indicesCacheKey();
  if (isEditableTradfiSection(section)) return editableCacheKey(section);
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
        : isEditableTradfiSection(section)
          ? getEditableWatchlist(section)
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
      section === "stocks-companies" ||
      section === "stocks-indices" ||
      isEditableTradfiSection(section)
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

function scheduleEditableRefetch(section, immediate = false) {
  const state = ensureEditableState(section);
  if (state.refetchTimer) clearTimeout(state.refetchTimer);
  if (immediate) {
    loadTradfiSection(section);
    return;
  }
  state.refetchTimer = setTimeout(() => {
    state.refetchTimer = null;
    if (tradfiActiveSection === section) {
      loadTradfiSection(section);
    }
  }, EDITABLE_REFETCH_MS);
}

function updateEditableFromInputs(section) {
  const watchlist = getEditableWatchlist(section);
  if (!watchlist) return;

  const heroInputs = document.querySelectorAll(
    `#tradfi-${section}-heroes .tradfi-ticker-input`,
  );
  heroInputs.forEach((input, i) => {
    watchlist.heroes[i] = normalizeTicker(input.value);
  });

  const rowInputs = document.querySelectorAll(
    `#tradfi-${section}-table-body .tradfi-ticker-input`,
  );
  const table = [];
  rowInputs.forEach((input) => {
    table.push(normalizeTicker(input.value));
  });
  watchlist.table = normalizeEditableTableSlots(section, table, false);
  persistEditableWatchlist(section);
}

function bindEditableEvents(section) {
  const state = ensureEditableState(section);
  if (state.eventsBound) return;
  state.eventsBound = true;

  const heroes = tfEl(`tradfi-${section}-heroes`);
  const tableBody = tfEl(`tradfi-${section}-table-body`);
  const addBtn = tfEl(`tradfi-${section}-add-row`);

  const onTickerInput = () => {
    updateEditableFromInputs(section);
    scheduleEditableRefetch(section, false);
  };

  const onTickerCommit = () => {
    updateEditableFromInputs(section);
    scheduleEditableRefetch(section, true);
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
    const watchlist = getEditableWatchlist(section);
    if (watchlist.table.length <= 1) return;
    watchlist.table.splice(idx, 1);
    if (!watchlist.table.length) watchlist.table.push("");
    persistEditableWatchlist(section);
    scheduleEditableRefetch(section, true);
  });

  addBtn?.addEventListener("click", () => {
    const watchlist = getEditableWatchlist(section);
    if (watchlist.table.length >= EDITABLE_TABLE_MAX) return;
    watchlist.table.push("");
    persistEditableWatchlist(section);
    const focus = {
      key: `table-${watchlist.table.length - 1}`,
      start: 0,
      end: 0,
    };
    const cached = tradfiCache[editableCacheKey(section)];
    if (cached) {
      renderEditableSection(section, cached);
    } else {
      renderEditableTable(section, {
        priceMode:
          section === "rates"
            ? "yield"
            : section === "currencies"
              ? "fx"
              : "price",
      });
    }
    restoreTickerFocus(focus);
  });
}

function tradfiQuoteBySymbol(symbol, data) {
  const sym = normalizeTicker(symbol);
  const heroes = data?.heroes || [];
  const table = data?.table || [];
  return (
    heroes.find((r) => normalizeTicker(r?.symbol) === sym) ||
    table.find((r) => normalizeTicker(r?.symbol) === sym)
  );
}

function appendTradfiMovers(lines, rows) {
  const sorted = [...rows].sort(
    (a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity),
  );
  const gainers = sorted.filter((r) => (r.changePct ?? 0) > 0).slice(0, 3);
  const losers = sorted.filter((r) => (r.changePct ?? 0) < 0).slice(-3).reverse();
  if (gainers.length) {
    lines.push(
      `Strongest: ${gainers
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }
  if (losers.length) {
    lines.push(
      `Weakest: ${losers
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }
}

function appendTradfiChartMoves(lines, data) {
  const charts = data.charts?.length
    ? data.charts
    : data.chart?.points?.length
      ? [data.chart]
      : [];
  if (!charts.length) return;
  const moves = charts
    .map((ch) => {
      const pts = ch.points || [];
      if (pts.length < 2) return null;
      const first = pts[0].close;
      const last = pts[pts.length - 1].close;
      if (!first) return null;
      return {
        label: ch.label || ch.symbol,
        ret: ((last - first) / first) * 100,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret))
    .slice(0, 3);
  if (moves.length) {
    lines.push(
      `3-month leaders: ${moves
        .map((m) => `${m.label} ${tfFmtPct(m.ret)}`)
        .join(" · ")}.`,
    );
  }
}

function appendTradfiW1Momentum(lines, rows) {
  const w1Leaders = rows
    .filter((r) => r.perf?.w1 != null)
    .sort((a, b) => (b.perf.w1 ?? 0) - (a.perf.w1 ?? 0))
    .slice(0, 2);
  if (w1Leaders.length >= 2) {
    lines.push(
      `1-week momentum: ${w1Leaders
        .map((r) => `${r.name || r.symbol} ${tfFmtPerf(r.perf.w1)}`)
        .join(" vs ")}.`,
    );
  }
}

function appendEditableFooter(lines) {
  lines.push(
    "Edit hero symbols and table rows — changes save locally and refresh quotes automatically.",
  );
}

function buildFuturesCommentary(data) {
  const lines = [];
  const mode = data.priceMode || "price";
  const heroes = (data.heroes || []).filter((h) => h.symbol && h.price != null);
  const table = (data.table || []).filter((r) => r.symbol && r.price != null);

  if (!heroes.length && !table.length) {
    return ["Futures data unavailable — check tickers (Yahoo suffix =F)."];
  }

  const equitySyms = new Set(["ES=F", "NQ=F", "YM=F", "RTY=F", "MES=F", "MNQ=F"]);
  const commoditySyms = new Set([
    "CL=F", "BZ=F", "GC=F", "SI=F", "NG=F", "HG=F", "ZC=F", "ZS=F",
  ]);
  const ratesSyms = new Set(["ZB=F", "ZN=F", "ZF=F", "ZT=F", "TN=F"]);
  const fxSyms = new Set(["6E=F", "6J=F", "6B=F", "6A=F", "6C=F", "6S=F"]);

  const bucket = (sym) => {
    if (equitySyms.has(sym)) return "equity";
    if (commoditySyms.has(sym)) return "commodity";
    if (ratesSyms.has(sym)) return "rates";
    if (fxSyms.has(sym)) return "fx";
    return "other";
  };

  const es = tradfiQuoteBySymbol("ES=F", data);
  const nq = tradfiQuoteBySymbol("NQ=F", data);
  const lead = es || nq || heroes[0] || table[0];

  lines.push(
    `${data.title}: ${lead.name || lead.symbol} at ${tfFmtPrice(lead, mode)} ` +
      `(${tfFmtChange(lead.change, mode)}, ${tfFmtPct(lead.changePct)}). ` +
      `Front-month CME contracts via Yahoo Finance · delayed.`,
  );

  const equityRows = [...heroes, ...table].filter(
    (r) => bucket(r.symbol) === "equity" && r.price != null,
  );
  if (equityRows.length >= 2) {
    const avgPct =
      equityRows.reduce((s, r) => s + (r.changePct ?? 0), 0) / equityRows.length;
    const tone =
      avgPct > 0.15 ? "risk-on" : avgPct < -0.15 ? "risk-off" : "mixed";
    lines.push(
      `Equity index complex (${equityRows.map((r) => r.symbol).join(", ")}): ` +
        `avg session ${tfFmtPct(avgPct)} — ${tone} tone across US benchmarks.`,
    );
  } else if (es && nq && es.changePct != null && nq.changePct != null) {
    const spread = nq.changePct - es.changePct;
    if (Math.abs(spread) >= 0.1) {
      lines.push(
        `Nasdaq vs S&P spread ${tfFmtPct(spread)} — ` +
          `${spread > 0 ? "growth/tech leading" : "defensive large-cap tone"}.`,
      );
    }
  }

  const commodityRows = [...heroes, ...table].filter(
    (r) => bucket(r.symbol) === "commodity" && r.price != null,
  );
  if (commodityRows.length) {
    const cl = commodityRows.find((r) => r.symbol === "CL=F");
    const gc = commodityRows.find((r) => r.symbol === "GC=F");
    const parts = commodityRows
      .slice(0, 4)
      .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`);
    let extra = "";
    if (cl && gc) {
      const inflationRead =
        cl.changePct > 0 && gc.changePct > 0
          ? "inflation-hedge bid"
          : cl.changePct < 0 && gc.changePct < 0
            ? "growth scare / USD firmness"
            : "divergent commodity signals";
      extra = ` (${inflationRead})`;
    }
    lines.push(`Commodities: ${parts.join(" · ")}${extra}.`);
  }

  const ratesRows = [...heroes, ...table].filter(
    (r) => bucket(r.symbol) === "rates" && r.price != null,
  );
  if (ratesRows.length) {
    const zn = ratesRows.find((r) => r.symbol === "ZN=F");
    const zb = ratesRows.find((r) => r.symbol === "ZB=F");
    const note = zn || ratesRows[0];
    let curveHint = "";
    if (zn && zb && zn.changePct != null && zb.changePct != null) {
      const durLead = zb.changePct - zn.changePct;
      if (Math.abs(durLead) >= 0.05) {
        curveHint =
          durLead > 0
            ? " Long end outperforming — duration bid."
            : " Front-end firmer — policy-path repricing.";
      }
    }
    lines.push(
      `Rates futures: ${note.name || note.symbol} ${tfFmtPct(note.changePct)}` +
        `${curveHint}`,
    );
  }

  const fxRows = [...heroes, ...table].filter(
    (r) => bucket(r.symbol) === "fx" && r.price != null,
  );
  if (fxRows.length) {
    lines.push(
      `FX futures: ${fxRows
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")} — dollar cross-asset anchor.`,
    );
  }

  const allRows = [...heroes, ...table];
  appendTradfiMovers(lines, allRows);
  appendTradfiChartMoves(lines, data);
  appendTradfiW1Momentum(lines, allRows);
  appendEditableFooter(lines);
  return lines;
}

function buildRatesCommentary(data) {
  const lines = [];
  const mode = data.priceMode || "yield";
  const heroes = (data.heroes || []).filter((h) => h.symbol && h.price != null);
  const table = (data.table || []).filter((r) => r.symbol && r.price != null);
  const allRows = [...heroes, ...table];

  if (!allRows.length) {
    return ["Rates data unavailable — try ^TNX, ^FVX, TLT, IEF."];
  }

  const tnx = tradfiQuoteBySymbol("^TNX", data);
  const fvx = tradfiQuoteBySymbol("^FVX", data);
  const tyx = tradfiQuoteBySymbol("^TYX", data);
  const irx = tradfiQuoteBySymbol("^IRX", data);
  const lead = tnx || heroes[0] || table[0];

  lines.push(
    `${data.title}: ${lead.name || lead.symbol} at ${tfFmtPrice(lead, mode)} ` +
      `(${tfFmtChange(lead.change, mode)}, ${tfFmtPct(lead.changePct)}). ` +
      `Treasury yields and bond ETF proxies · delayed.`,
  );

  if (tnx && irx && tnx.price != null && irx.price != null) {
    const slope = tnx.price - irx.price;
    lines.push(
      `Curve snapshot: 10Y ${tfFmtNum(tnx.price, 2)}% vs 13-week ${tfFmtNum(irx.price, 2)}% ` +
        `(10Y–bill spread ${tfFmtNum(slope, 2)} pp).`,
    );
  }
  if (tnx && fvx && tyx) {
    const belly = fvx.changePct ?? 0;
    const longEnd = tyx.changePct ?? 0;
    if (Math.abs(longEnd - belly) >= 0.05) {
      lines.push(
        longEnd > belly
          ? "Long end moving more than belly — duration-sensitive ETFs (TLT) in focus."
          : "Front/middle of curve leading — front-end policy repricing tone.",
      );
    }
  }

  const tlt = tradfiQuoteBySymbol("TLT", data);
  const ief = tradfiQuoteBySymbol("IEF", data);
  const hyg = tradfiQuoteBySymbol("HYG", data);
  const lqd = tradfiQuoteBySymbol("LQD", data);
  if (tlt && ief) {
    lines.push(
      `Duration ETFs: TLT ${tfFmtPct(tlt.changePct)} · IEF ${tfFmtPct(ief.changePct)}.`,
    );
  }
  if (hyg && lqd) {
    const spread = (hyg.changePct ?? 0) - (lqd.changePct ?? 0);
    lines.push(
      `Credit: HYG ${tfFmtPct(hyg.changePct)} vs LQD ${tfFmtPct(lqd.changePct)} ` +
        `(${spread > 0 ? "risk-on credit" : "defensive IG tone"}).`,
    );
  }

  appendTradfiMovers(lines, allRows);
  appendTradfiChartMoves(lines, data);
  appendTradfiW1Momentum(lines, allRows);
  appendEditableFooter(lines);
  return lines;
}

function buildCurrenciesCommentary(data) {
  const lines = [];
  const mode = data.priceMode || "fx";
  const heroes = (data.heroes || []).filter((h) => h.symbol && h.price != null);
  const table = (data.table || []).filter((r) => r.symbol && r.price != null);
  const allRows = [...heroes, ...table];

  if (!allRows.length) {
    return ["FX data unavailable — try DX-Y.NYB, EURUSD=X, USDJPY=X."];
  }

  const dxy = tradfiQuoteBySymbol("DX-Y.NYB", data);
  const eur = tradfiQuoteBySymbol("EURUSD=X", data);
  const jpy = tradfiQuoteBySymbol("USDJPY=X", data);
  const lead = dxy || eur || heroes[0];

  lines.push(
    `${data.title}: ${lead.name || lead.symbol} at ${tfFmtPrice(lead, mode)} ` +
      `(${tfFmtChange(lead.change, mode)}, ${tfFmtPct(lead.changePct)}). ` +
      `G10 and dollar index quotes · delayed.`,
  );

  if (dxy) {
    const tone =
      (dxy.changePct ?? 0) > 0.1
        ? "firm dollar"
        : (dxy.changePct ?? 0) < -0.1
          ? "soft dollar"
          : "range-bound dollar";
    lines.push(
      `Dollar tone: ${tfFmtPct(dxy.changePct)} — ${tone}; often pressures commodities and EM FX when firm.`,
    );
  }

  const g10 = [eur, jpy, tradfiQuoteBySymbol("GBPUSD=X", data)].filter(Boolean);
  if (g10.length >= 2) {
    lines.push(
      `G10: ${g10
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }

  const cnh = tradfiQuoteBySymbol("USDCNH=X", data);
  const aud = tradfiQuoteBySymbol("AUDUSD=X", data);
  if (cnh || aud) {
    const parts = [cnh, aud].filter(Boolean).map(
      (r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`,
    );
    lines.push(`Risk-sensitive crosses: ${parts.join(" · ")}.`);
  }

  appendTradfiMovers(lines, allRows);
  appendTradfiChartMoves(lines, data);
  appendTradfiW1Momentum(lines, allRows);
  appendEditableFooter(lines);
  return lines;
}

function buildCommoditiesCommentary(data) {
  const lines = [];
  const mode = data.priceMode || "price";
  const heroes = (data.heroes || []).filter((h) => h.symbol && h.price != null);
  const table = (data.table || []).filter((r) => r.symbol && r.price != null);
  const allRows = [...heroes, ...table];

  if (!allRows.length) {
    return ["Commodity data unavailable — try CL=F, GC=F, SI=F."];
  }

  const cl = tradfiQuoteBySymbol("CL=F", data);
  const gc = tradfiQuoteBySymbol("GC=F", data);
  const lead = cl || gc || heroes[0];

  lines.push(
    `${data.title}: ${lead.name || lead.symbol} at ${tfFmtPrice(lead, mode)} ` +
      `(${tfFmtChange(lead.change, mode)}, ${tfFmtPct(lead.changePct)}). ` +
      `Energy, metals, and ag futures · delayed.`,
  );

  const energy = allRows.filter((r) =>
    ["CL=F", "BZ=F", "NG=F"].includes(r.symbol),
  );
  const metals = allRows.filter((r) =>
    ["GC=F", "SI=F", "HG=F", "PL=F", "PA=F"].includes(r.symbol),
  );
  if (energy.length) {
    lines.push(
      `Energy: ${energy
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }
  if (metals.length) {
    lines.push(
      `Metals: ${metals
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }
  if (cl && gc) {
    const read =
      cl.changePct > 0 && gc.changePct > 0
        ? "inflation-hedge bid across energy and gold"
        : cl.changePct < 0 && gc.changePct < 0
          ? "growth/USD headwinds on real assets"
          : "mixed commodity signals";
    lines.push(`Cross-asset read: ${read}.`);
  }

  appendTradfiMovers(lines, allRows);
  appendTradfiChartMoves(lines, data);
  appendTradfiW1Momentum(lines, allRows);
  appendEditableFooter(lines);
  return lines;
}

function buildSectorsCommentary(data) {
  const lines = [];
  const mode = data.priceMode || "price";
  const heroes = (data.heroes || []).filter((h) => h.symbol && h.price != null);
  const table = (data.table || []).filter((r) => r.symbol && r.price != null);
  const allRows = [...heroes, ...table];

  if (!allRows.length) {
    return ["Sector data unavailable — try XLK, XLF, XLE, SPY."];
  }

  const spy = tradfiQuoteBySymbol("SPY", data);
  const xlk = tradfiQuoteBySymbol("XLK", data);
  const xlu = tradfiQuoteBySymbol("XLU", data);
  const lead = spy || heroes[0] || table[0];

  lines.push(
    `${data.title}: ${lead.name || lead.symbol} at ${tfFmtPrice(lead, mode)} ` +
      `(${tfFmtChange(lead.change, mode)}, ${tfFmtPct(lead.changePct)}). ` +
      `US sector ETF performance · delayed.`,
  );

  const cyclical = ["XLK", "XLF", "XLY", "XLI", "XLE"];
  const defensive = ["XLU", "XLP", "XLV"];
  const cycRows = allRows.filter((r) => cyclical.includes(r.symbol));
  const defRows = allRows.filter((r) => defensive.includes(r.symbol));
  if (cycRows.length && defRows.length) {
    const cycAvg =
      cycRows.reduce((s, r) => s + (r.changePct ?? 0), 0) / cycRows.length;
    const defAvg =
      defRows.reduce((s, r) => s + (r.changePct ?? 0), 0) / defRows.length;
    const rot = cycAvg - defAvg;
    lines.push(
      `Rotation: cyclicals avg ${tfFmtPct(cycAvg)} vs defensives ${tfFmtPct(defAvg)} ` +
        `(${rot > 0.1 ? "risk-on sector tilt" : rot < -0.1 ? "defensive leadership" : "balanced"}).`,
    );
  }

  const ranked = [...allRows]
    .filter((r) => r.changePct != null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  if (ranked.length >= 3) {
    lines.push(
      `Leaders: ${ranked
        .slice(0, 3)
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
    lines.push(
      `Laggards: ${ranked
        .slice(-3)
        .reverse()
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }

  if (xlk && xlu && xlk.changePct != null && xlu.changePct != null) {
    const growthDef = xlk.changePct - xlu.changePct;
    if (Math.abs(growthDef) >= 0.1) {
      lines.push(
        `Tech vs Utilities spread ${tfFmtPct(growthDef)} — ` +
          `${growthDef > 0 ? "growth bid" : "bond-proxy bid"}.`,
      );
    }
  }

  appendTradfiChartMoves(lines, data);
  appendTradfiW1Momentum(lines, allRows);
  appendEditableFooter(lines);
  return lines;
}

function buildEnergyCommentary(data) {
  const lines = [];
  const mode = data.priceMode || "price";
  const heroes = (data.heroes || []).filter((h) => h.symbol && h.price != null);
  const table = (data.table || []).filter((r) => r.symbol && r.price != null);
  const allRows = [...heroes, ...table];

  if (!allRows.length) {
    return ["Energy data unavailable — try CL=F, NG=F, XLE, XOM."];
  }

  const cl = tradfiQuoteBySymbol("CL=F", data);
  const ng = tradfiQuoteBySymbol("NG=F", data);
  const xle = tradfiQuoteBySymbol("XLE", data);
  const lead = cl || xle || heroes[0];

  lines.push(
    `${data.title}: ${lead.name || lead.symbol} at ${tfFmtPrice(lead, mode)} ` +
      `(${tfFmtChange(lead.change, mode)}, ${tfFmtPct(lead.changePct)}). ` +
      `Crude, gas, and energy equities · delayed.`,
  );

  if (cl && ng) {
    lines.push(
      `Futures: WTI ${tfFmtPct(cl.changePct)} · Nat Gas ${tfFmtPct(ng.changePct)}.`,
    );
  }

  const oils = allRows.filter((r) =>
    ["XOM", "CVX", "COP", "OXY"].includes(r.symbol),
  );
  const services = allRows.filter((r) =>
    ["SLB", "HAL"].includes(r.symbol),
  );
  if (oils.length) {
    lines.push(
      `Integrated oils: ${oils
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }
  if (services.length) {
    lines.push(
      `Services: ${services
        .map((r) => `${r.name || r.symbol} ${tfFmtPct(r.changePct)}`)
        .join(" · ")}.`,
    );
  }

  const uso = tradfiQuoteBySymbol("USO", data);
  if (cl && uso && cl.changePct != null && uso.changePct != null) {
    const etfLag = uso.changePct - cl.changePct;
    if (Math.abs(etfLag) >= 0.15) {
      lines.push(
        `USO vs WTI spread ${tfFmtPct(etfLag)} — ETF tracking/roll dynamics.`,
      );
    }
  }
  if (xle && cl) {
    lines.push(
      `Equity beta: XLE ${tfFmtPct(xle.changePct)} vs crude ${tfFmtPct(cl.changePct)}.`,
    );
  }

  appendTradfiMovers(lines, allRows);
  appendTradfiChartMoves(lines, data);
  appendTradfiW1Momentum(lines, allRows);
  appendEditableFooter(lines);
  return lines;
}

const TRADFI_COMMENTARY_BUILDERS = {
  futures: buildFuturesCommentary,
  rates: buildRatesCommentary,
  currencies: buildCurrenciesCommentary,
  commodities: buildCommoditiesCommentary,
  sectors: buildSectorsCommentary,
  energy: buildEnergyCommentary,
};

function buildTradfiCommentary(data) {
  const builder = TRADFI_COMMENTARY_BUILDERS[data.section];
  if (builder) return builder(data);

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

  if (data.section === "stocks-indices") {
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

function renderEditableHeroes(section, data) {
  const cfg = getEditableCfg(section);
  const watchlist = getEditableWatchlist(section);
  const strip = tfEl(`tradfi-${section}-heroes`);
  if (!strip || !cfg || !watchlist) return;
  const mode = data.priceMode || "price";
  const focus = captureTickerFocus();
  const placeholder = cfg.placeholder || "Symbol";

  if (!data?.fetchedAt) {
    strip.innerHTML = watchlist.heroes
      .map(
        (sym, i) => `
      <article class="deriv-hero-block tradfi-hero-editable">
        <input
          type="text"
          class="tradfi-ticker-input tradfi-ticker-input--hero"
          value="${sym}"
          placeholder="${placeholder}"
          spellcheck="false"
          autocomplete="off"
          aria-label="Hero symbol ${i + 1}"
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

  strip.innerHTML = watchlist.heroes
    .map((sym, i) => {
      const q = lookupQuote(sym, data);
      const name = companyDisplayName(q, sym);
      return `
      <article class="deriv-hero-block tradfi-hero-editable">
        <input
          type="text"
          class="tradfi-ticker-input tradfi-ticker-input--hero"
          value="${sym}"
          placeholder="${placeholder}"
          spellcheck="false"
          autocomplete="off"
          aria-label="Hero symbol ${i + 1}"
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

function renderEditableTable(section, data) {
  const cfg = getEditableCfg(section);
  const watchlist = getEditableWatchlist(section);
  const body = tfEl(`tradfi-${section}-table-body`);
  if (!body || !cfg || !watchlist) return;
  const mode = data.priceMode || "price";
  const focus = captureTickerFocus();
  const canRemove = watchlist.table.length > 1;
  const loading = !data?.fetchedAt;
  const placeholder = cfg.placeholder || "Symbol";

  if (loading) {
    body.innerHTML = `<tr><td colspan="11">Loading market data…</td></tr>`;
    return;
  }

  body.innerHTML = watchlist.table
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
            placeholder="${placeholder}"
            spellcheck="false"
            autocomplete="off"
            aria-label="Row symbol ${i + 1}"
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

function renderEditableSection(section, data) {
  renderEditableHeroes(section, data);
  renderEditableTable(section, data);
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

function mountTradfiChart(canvas, chart, priceMode, styleOpts = {}) {
  const pts = chart?.points || [];
  if (!canvas || !pts.length || !window.ChartInteraction) return null;

  const pad = styleOpts.pad || { top: 18, right: 20, bottom: 36, left: 56 };
  const mode = priceMode || "price";
  const lineColor = styleOpts.lineColor || "#94a3b8";
  const fillColor = styleOpts.fillColor || "rgba(148, 163, 184, 0.15)";
  const showGrid = Boolean(styleOpts.showGrid);
  const lineWidth = styleOpts.lineWidth || 2;
  const axisColor = styleOpts.axisColor || "#7d8799";

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

      if (showGrid) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i += 1) {
          const y = api.pad.top + (api.chartH * i) / 4;
          ctx.beginPath();
          ctx.moveTo(api.pad.left, y);
          ctx.lineTo(api.pad.left + api.chartW, y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = fillColor;
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

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = api.xAt(i, drawCount);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      const lastIdx = drawCount - 1;
      const lastX = api.xAt(lastIdx, drawCount);
      const lastY = yAt(vals[lastIdx]);
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (api.hoverGlobal != null) {
        const v = pts[api.hoverGlobal].close;
        api.drawCrosshair(api.xAtGlobal(api.hoverGlobal));
        api.drawDot(api.xAtGlobal(api.hoverGlobal), yAt(v));
      }

      ctx.fillStyle = axisColor;
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
    const emptyMsg =
      section === "stocks-indices"
        ? "No recent headlines for these indices."
        : "No recent headlines for this watchlist.";
    feed.innerHTML = `<p class="news-empty">${emptyMsg}</p>`;
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
  } else if (isEditableTradfiSection(section)) {
    bindEditableEvents(section);
    renderEditableSection(section, data);
  } else {
    renderTradfiHeroes(section, data);
    renderTradfiTable(section, data);
  }
  renderTradfiCommentary(section, data);

  if (!renderTradfiCharts(section, data)) {
    repaintTradfiCharts(section, data);
  }

  if (section === "stocks-companies" || section === "stocks-indices") {
    renderTradfiCompaniesNews(section, data);
  }

  applyTradfiScreenState(section, opts);

  const screen = getTradfiScreen(section);
  window.decorateHelpLabels?.(screen);
}

async function loadTradfiSection(section) {
  if (!TRADFI_SECTIONS.includes(section)) return;
  window.equityClearActive?.();
  tradfiActiveSection = section;

  if (section === "stocks-companies") {
    loadSavedCompanies();
    bindCompaniesEvents();
  }
  if (section === "stocks-indices") {
    loadSavedIndices();
    bindIndicesEvents();
  }
  if (isEditableTradfiSection(section)) {
    loadEditableWatchlist(section);
    bindEditableEvents(section);
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
        if (isEditableTradfiSection(section)) {
          return editableCacheKey(section) === fetchKey;
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
          } else if (isEditableTradfiSection(section)) {
            const priceMode =
              data?.priceMode ||
              (section === "rates"
                ? "yield"
                : section === "currencies"
                  ? "fx"
                  : "price");
            renderEditableTable(section, { priceMode });
          } else if (body) {
            body.innerHTML =
              '<tr><td colspan="4">Loading market data…</td></tr>';
          }
          if (
            section === "stocks-indices" ||
            section === "stocks-companies" ||
            isEditableTradfiSection(section)
          ) {
            const chartsEl = tfEl(`tradfi-${section}-charts`);
            if (chartsEl) chartsEl.innerHTML = "";
          }
          if (section === "stocks-companies" || section === "stocks-indices") {
            const newsEl = tfEl(`tradfi-${section}-news`);
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
        if (isEditableTradfiSection(section) && editableCacheKey(section) !== fetchKey) {
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

window.tradfiClearActiveSection = function () {
  tradfiActiveSection = null;
};

window.loadTradfiDashboard = function () {
  initTradfiModule();
  startTradfiPoll();
  window.decorateHelpLabels?.(document.getElementById("dashboard-tradfi"));
};

window.loadTradfiSection = loadTradfiSection;
window.mountTradfiChart = mountTradfiChart;