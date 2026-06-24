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
  const source = opts.source ? ` · ${opts.source}` : "";
  if (opts.refreshFailed) return `Saved ${time}${source} · update failed`;
  if (opts.stale && opts.refreshing) return `Saved ${time}${source} · updating…`;
  if (opts.state === "loading") return `Loading…${source}`;
  if (opts.state === "error") return `Unavailable${source}`;
  return `Updated ${time}${source}`;
}

function setHeaderStamp(l1, opts = {}) {
  const elId = SWR_HEADER_MAP[l1];
  const el = elId ? swrEl(elId) : null;
  if (!el) return;

  el.textContent = formatPanelMeta(opts);
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
}) {
  const persisted = loadPersisted(key);
  const stampOpts = { source };

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
    if (validate && !validate(data)) return null;
    const fetchedAt = data?.fetchedAt || new Date().toISOString();
    if (data && !data.fetchedAt) data.fetchedAt = fetchedAt;
    persistPayload(key, data, fetchedAt);
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

window.DashboardSWR = {
  loadPersisted,
  persistPayload,
  formatFetchedTime,
  formatPanelMeta,
  setHeaderStamp,
  setViewStatusBar,
  runSWR,
};