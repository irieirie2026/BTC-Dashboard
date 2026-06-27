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

const tradfiCache = {};
let tradfiPollTimer = null;
let tradfiActiveSection = null;
let tradfiReady = false;
let companiesWatchlist = null;
let companiesRefetchTimer = null;
let companiesEventsBound = false;
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

function tradfiSectionCacheKey(section) {
  return section === "stocks-companies" ? companiesCacheKey() : section;
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

async function fetchTradfiSection(section, opts = {}) {
  let url = `/api/tradfi/${section}`;
  if (section === "stocks-companies" && companiesWatchlist) {
    const params = new URLSearchParams();
    const heroes = companiesWatchlist.heroes.filter(Boolean);
    const symbols = companiesWatchlist.table.filter(Boolean);
    if (heroes.length) params.set("heroes", heroes.join(","));
    if (symbols.length) params.set("symbols", symbols.join(","));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    cache: section === "stocks-companies" ? "no-store" : "default",
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

function renderTradfiTable(section, data) {
  const body = tfEl(`tradfi-${section}-table-body`);
  if (!body) return;
  const mode = data.priceMode || "price";

  if (section === "stocks-indices") {
    body.innerHTML = (data.table || [])
      .map((q) => {
        const perf = q.perf || {};
        return `
      <tr>
        <td>${q.name}<span class="tradfi-symbol-tag">${q.symbol}</span></td>
        <td class="mono">${tfFmtPrice(q, mode)}</td>
        <td class="mono ${tfChangeClass(q.change)}">${tfFmtChange(q.change, mode)}</td>
        <td class="mono ${tfChangeClass(q.changePct)}">${tfFmtPct(q.changePct)}</td>
        <td class="mono ${tfChangeClass(perf.w1)}">${tfFmtPerf(perf.w1)}</td>
        <td class="mono ${tfChangeClass(perf.m1)}">${tfFmtPerf(perf.m1)}</td>
        <td class="mono ${tfChangeClass(perf.m3)}">${tfFmtPerf(perf.m3)}</td>
        <td class="mono ${tfChangeClass(perf.m12)}">${tfFmtPerf(perf.m12)}</td>
        <td class="mono ${tfChangeClass(perf.ytd)}">${tfFmtPerf(perf.ytd)}</td>
      </tr>`;
      })
      .join("");
    return;
  }

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
      `<tr><td colspan="6">Loading market data…</td></tr>`;
    return;
  }

  body.innerHTML = companiesWatchlist.table
    .map((sym, i) => {
      const q = lookupQuote(sym, data);
      const name = companyDisplayName(q, sym);
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

function paintTradfiChart(data, w, h, canvasOverride) {
  const pts = data.chart?.points || [];
  if (!pts.length) return;

  const canvas =
    canvasOverride || tfEl(`tradfi-${data.section}-chart`);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 18, right: 20, bottom: 36, left: 56 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const closes = pts.map((p) => p.close);
  const minV = Math.min(...closes);
  const maxV = Math.max(...closes);
  const range = maxV - minV || 0.01;
  const mode = data.priceMode || "price";

  const fmtY = (v) => {
    if (mode === "yield") return tfFmtNum(v, 2) + "%";
    if (mode === "fx") return tfFmtNum(v, 2);
    return tfFmtNum(v, 0);
  };

  ctx.fillStyle = "rgba(148, 163, 184, 0.15)";
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

  ctx.strokeStyle = "#94a3b8";
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
    scheduleChartDraw(canvas, (w, h) =>
      paintTradfiChart({ ...data, chart: ch }, w, h, canvas),
    );
  });

  return true;
}

function repaintTradfiCharts(section, data) {
  if (section === "stocks-indices" && data.charts?.length) {
    data.charts.forEach((ch, i) => {
      const canvas = tfEl(`tradfi-${section}-chart-${i}`);
      scheduleChartDraw(canvas, (w, h) =>
        paintTradfiChart({ ...data, chart: ch }, w, h, canvas),
      );
    });
    return;
  }
  scheduleChartDraw(tfEl(`tradfi-${section}-chart`), (w, h) =>
    paintTradfiChart(data, w, h),
  );
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
  } else {
    renderTradfiHeroes(section, data);
    renderTradfiTable(section, data);
  }
  renderTradfiCommentary(section, data);

  if (!renderTradfiCharts(section, data)) {
    repaintTradfiCharts(section, data);
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

  const swr = window.DashboardSWR;
  if (!swr) return;

  const cacheKey = tradfiSectionCacheKey(section);
  const fetchKey = cacheKey;

  try {
    await swr.runSWR({
      key: `tradfi:${cacheKey}`,
      l1: "tradfi",
      source: "Yahoo Finance",
      validate: () =>
        section !== "stocks-companies" || companiesCacheKey() === fetchKey,
      fetch: () => fetchTradfiSection(section),
      render: (data, opts = {}) => {
        if (opts.loading) {
          swr.setViewStatusBar("tradfi-refresh-status", { state: "loading" });
          const body = tfEl(`tradfi-${section}-table-body`);
          if (section === "stocks-companies") {
            renderTradfiCompaniesTable(section, { priceMode: "price" });
          } else if (body) {
            const cols = section === "stocks-indices" ? 9 : 4;
            body.innerHTML =
              `<tr><td colspan="${cols}">Loading market data…</td></tr>`;
          }
          if (section === "stocks-indices") {
            const chartsEl = tfEl("tradfi-stocks-indices-charts");
            if (chartsEl) chartsEl.innerHTML = "";
          }
          return;
        }
        if (
          section === "stocks-companies" &&
          companiesCacheKey() !== fetchKey
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