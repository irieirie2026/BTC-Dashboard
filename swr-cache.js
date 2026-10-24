const SWR_PERSIST_PREFIX = "swr:payload:v1:";
const SWR_MAX_KEYS = 48;

const SWR_HEADER_MAP = {
  market: "last-update",
  derivatives: "futures-header-update",
  etf: "header-etf-meta",
  treasury: "header-treasury-meta",
  onchain: "header-dashboard-meta",
  exchanges: "header-dashboard-meta",
  stats: "header-dashboard-meta",
  tradfi: "header-dashboard-meta",
  defi: "header-dashboard-meta",
  macro: "header-dashboard-meta",
  news: "header-dashboard-meta",
};

function swrEl(id) {
  return document.getElementById(id);
}

function formatFetchedTime(fetchedAt) {
  if (!fetchedAt) return "—";
  const d = new Date(fetchedAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour12: false });
}

function fetchedAgeMs(fetchedAt) {
  if (!fetchedAt) return null;
  const d = new Date(fetchedAt);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Date.now() - d.getTime());
}

function formatFetchedAge(fetchedAt) {
  const ms = fetchedAgeMs(fetchedAt);
  if (ms == null) return "";
  const sec = Math.round(ms / 1000);
  if (sec < 90) return "";
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} min old`;
  if (sec < 86400) return `${Math.max(1, Math.round(sec / 3600))} h old`;
  return `${Math.max(1, Math.round(sec / 86400))} d old`;
}

function loadPersisted(key) {
  try {
    const raw = localStorage.getItem(SWR_PERSIST_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data) return null;
    return {
      savedAt: parsed.savedAt || 0,
      fetchedAt: parsed.fetchedAt || null,
      data: parsed.data,
    };
  } catch {
    return null;
  }
}

function prunePersisted(keepKey) {
  try {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey?.startsWith(SWR_PERSIST_PREFIX)) continue;
      const cacheKey = storageKey.slice(SWR_PERSIST_PREFIX.length);
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey));
        entries.push({ storageKey, cacheKey, savedAt: parsed?.savedAt || 0 });
      } catch {
        entries.push({ storageKey, cacheKey, savedAt: 0 });
      }
    }
    if (entries.length <= SWR_MAX_KEYS) return;
    entries.sort((a, b) => a.savedAt - b.savedAt);
    for (const entry of entries) {
      if (entries.length <= SWR_MAX_KEYS) break;
      if (entry.cacheKey === keepKey) continue;
      localStorage.removeItem(entry.storageKey);
      entries.length -= 1;
    }
  } catch {
    /* ignore */
  }
}

function persistPayload(key, data, fetchedAt) {
  if (!key || data == null) return;
  const ts = fetchedAt || data.fetchedAt || new Date().toISOString();
  try {
    localStorage.setItem(
      SWR_PERSIST_PREFIX + key,
      JSON.stringify({ savedAt: Date.now(), fetchedAt: ts, data }),
    );
    prunePersisted(key);
  } catch {
    /* quota */
  }
}

function formatPanelMeta(opts = {}) {
  const time = formatFetchedTime(opts.fetchedAt);
  const age = formatFetchedAge(opts.fetchedAt);
  const ageBit = age ? ` · ${age}` : "";
  const staleAfterMs = Number(opts.staleAfterMs) > 0 ? Number(opts.staleAfterMs) : 90_000;
  const ageMs = fetchedAgeMs(opts.fetchedAt);
  const pastThreshold = opts.forceStale === true || (ageMs != null && ageMs >= staleAfterMs);
  const staleBit = pastThreshold ? " · STALE" : "";
  const source = opts.source ? ` · ${opts.source}` : "";
  if (opts.refreshFailed) return `Saved ${time}${ageBit}${staleBit}${source} · update failed`;
  if (opts.refreshing) return `Saved ${time}${ageBit}${staleBit}${source} · updating…`;
  if (opts.state === "loading") return `Loading…${source}`;
  if (opts.state === "error") return `Unavailable${source}`;
  if (opts.fromCache || (opts.stale && pastThreshold)) return `Cached ${time}${ageBit}${staleBit}${source}`;
  if (pastThreshold) return `Updated ${time}${ageBit}${staleBit}${source}`;
  if (age) return `Updated ${time}${ageBit}${source}`;
  return `Updated ${time}${source}`;
}

const viewClocks = new Map();

function clockKey(l1, l2) {
  return `${l1 || ""}|${l2 || ""}`;
}

function formatLiveStamp(opts = {}) {
  const source = opts.source ? ` · ${opts.source}` : "";
  if (opts.state === "loading") return `Loading…${source}`;
  if (opts.state === "error" && !opts.fetchedAt) return `Unavailable${source}`;
  if (!opts.fetchedAt) return "—";
  const time = formatFetchedTime(opts.fetchedAt);
  const ms = fetchedAgeMs(opts.fetchedAt);
  const sec = ms == null ? null : Math.round(ms / 1000);
  const ageBit = sec == null ? "" : ` · ${sec}s`;
  const staleAfter = Number(opts.staleAfterMs) > 0 ? Number(opts.staleAfterMs) : 120_000;
  const staleBit = ms != null && ms >= staleAfter ? " · STALE" : "";
  if (opts.refreshFailed) return `Saved ${time}${ageBit}${staleBit}${source} · update failed`;
  if (opts.refreshing) return `Saved ${time}${ageBit}${staleBit}${source} · updating…`;
  return `Updated ${time}${ageBit}${staleBit}${source}`;
}

function rememberViewClock(l1, opts = {}) {
  if (!l1) return;
  const l2 = opts.l2 || "";
  viewClocks.set(clockKey(l1, l2), {
    l1,
    l2,
    fetchedAt: opts.fetchedAt || null,
    source: opts.source || "",
    staleAfterMs: opts.staleAfterMs,
    cardIds: opts.cardIds || [],
    state: opts.state || null,
    refreshing: !!opts.refreshing,
    refreshFailed: !!opts.refreshFailed,
    stale: !!opts.stale,
  });
  paintViewClocks();
}

function paintViewClocks() {
  const l1 = document.body?.dataset?.l1 || window.MenuController?.l1 || "";
  const l2 = window.MenuController?.l2 || "";
  if (!l1) return;
  const clock = viewClocks.get(clockKey(l1, l2)) || viewClocks.get(clockKey(l1, ""));
  if (!clock || (!clock.fetchedAt && !clock.state)) return;
  const text = formatLiveStamp(clock);
  const headerId = SWR_HEADER_MAP[l1];
  const header = headerId ? swrEl(headerId) : null;
  if (header && !header.hidden && !header.closest?.("[hidden]")) {
    header.textContent = text;
    header.classList.toggle("header-meta--stale", !!(clock.stale && (clock.refreshing || clock.refreshFailed)));
  }
  for (const id of clock.cardIds || []) {
    const el = swrEl(id);
    if (el) el.textContent = text;
  }
}

function setHeaderStamp(l1, opts = {}) {
  const elId = SWR_HEADER_MAP[l1];
  const el = elId ? swrEl(elId) : null;
  if (!el && !opts.cardIds) return;

  const activeL1 = document.body?.dataset?.l1;
  const activeL2 = window.MenuController?.l2 || "";
  const requestedL2 = opts.l2 || (activeL1 === l1 ? activeL2 : "");
  rememberViewClock(l1, { ...opts, l2: requestedL2 });

  // Only stamp the active view so a background revalidate does not overwrite
  // the visible header with another desk's timestamp.
  if (activeL1 && l1 && activeL1 !== l1) return;
  if (opts.l2 && activeL2 && opts.l2 !== activeL2) return;

  // Market Live/Binance stamp lives on #last-update; never write into a hidden bar.
  if (!el || el.hidden || el.closest?.("[hidden]")) return;

  el.textContent = formatLiveStamp({ ...opts, l2: requestedL2 });
  el.classList.toggle(
    "header-meta--stale",
    !!(opts.stale && (opts.refreshing || opts.refreshFailed)),
  );
}

function setViewStatusBar(barId, opts = {}) {
  const bar = swrEl(barId);
  const dot = bar?.querySelector(".dashboard-refresh-dot, .tradfi-refresh-dot");
  const text = bar?.querySelector(".dashboard-refresh-text, .tradfi-refresh-text");
  if (!bar || !text) return;

  const { state, fetchedAt } = opts;
  if (state === "hidden") {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  bar.className = bar.className.split(" ").filter((c) => !c.endsWith("--live") && !c.endsWith("--stale") && !c.endsWith("--failed") && !c.endsWith("--loading")).join(" ");
  if (dot) dot.className = dot.className.split(" ").filter((c) => !c.includes("--pulse")).join(" ");

  switch (state) {
    case "live":
      bar.classList.add("dashboard-refresh-status--live");
      text.textContent = `Live · Updated ${formatFetchedTime(fetchedAt)}`;
      break;
    case "refreshing":
      bar.classList.add("dashboard-refresh-status--stale");
      if (dot) dot.classList.add("dashboard-refresh-dot--pulse");
      text.textContent =
        `Showing saved data from ${formatFetchedTime(fetchedAt)} · Updating…`;
      break;
    case "failed":
      bar.classList.add("dashboard-refresh-status--failed");
      text.textContent =
        `Showing saved data from ${formatFetchedTime(fetchedAt)} · Update failed`;
      break;
    case "loading":
      bar.classList.add("dashboard-refresh-status--loading");
      if (dot) dot.classList.add("dashboard-refresh-dot--pulse");
      text.textContent = "Loading market data…";
      break;
    case "error":
      bar.classList.add("dashboard-refresh-status--failed");
      text.textContent = "Failed to load market data";
      break;
    default:
      break;
  }
}

function stampHeader(l1, opts, updateHeader) {
  if (updateHeader === false || !l1) return;
  setHeaderStamp(l1, opts);
}

async function runSWR({
  key,
  fetch,
  render,
  l1,
  source,
  onError,
  validate,
  updateHeader = true,
  persist = true,
  revalidate = true,
  staleAfterMs,
}) {
  const persisted = loadPersisted(key);
  const stampOpts = { source, staleAfterMs };

  if (persisted?.data && !revalidate) {
    render(persisted.data, {
      stale: true,
      fromCache: true,
      forceStale: true,
      fetchedAt: persisted.fetchedAt,
    });
    stampHeader(
      l1,
      { ...stampOpts, fetchedAt: persisted.fetchedAt, stale: true, forceStale: true },
      updateHeader,
    );
    return persisted.data;
  }

  if (persisted?.data) {
    render(persisted.data, {
      stale: true,
      refreshing: true,
      fetchedAt: persisted.fetchedAt,
    });
    stampHeader(
      l1,
      {
        ...stampOpts,
        fetchedAt: persisted.fetchedAt,
        stale: true,
        refreshing: true,
      },
      updateHeader,
    );
  } else {
    stampHeader(l1, { ...stampOpts, state: "loading" }, updateHeader);
    render(null, { loading: true });
  }

  try {
    const data = await fetch();
    if (validate && !validate(data)) {
      if (persisted?.data) {
        render(persisted.data, {
          stale: true,
          refreshFailed: true,
          fetchedAt: persisted.fetchedAt,
        });
        stampHeader(
          l1,
          {
            ...stampOpts,
            fetchedAt: persisted.fetchedAt,
            stale: true,
            refreshFailed: true,
          },
          updateHeader,
        );
      } else {
        stampHeader(l1, { ...stampOpts, state: "error", refreshFailed: true }, updateHeader);
        render(null, { refreshFailed: true, loading: false });
      }
      return null;
    }
    const fetchedAt = data?.fetchedAt || new Date().toISOString();
    if (data && !data.fetchedAt) data.fetchedAt = fetchedAt;
    if (persist) persistPayload(key, data, fetchedAt);
    render(data, {
      stale: false,
      justUpdated: !!persisted,
      fetchedAt,
    });
    stampHeader(l1, { ...stampOpts, fetchedAt, stale: false }, updateHeader);
    return data;
  } catch (err) {
    if (persisted?.data) {
      render(persisted.data, {
        stale: true,
        refreshFailed: true,
        fetchedAt: persisted.fetchedAt,
      });
      stampHeader(
        l1,
        {
          ...stampOpts,
          fetchedAt: persisted.fetchedAt,
          stale: true,
          refreshFailed: true,
        },
        updateHeader,
      );
    } else {
      stampHeader(l1, { ...stampOpts, state: "error" }, updateHeader);
    }
    onError?.(err);
    throw err;
  }
}

setInterval(paintViewClocks, 1000);

window.DashboardSWR = {
  loadPersisted,
  persistPayload,
  formatFetchedTime,
  formatFetchedAge,
  fetchedAgeMs,
  formatPanelMeta,
  formatLiveStamp,
  rememberViewClock,
  paintViewClocks,
  setHeaderStamp,
  setViewStatusBar,
  runSWR,
};