/** Misc — Knowledge Graph + RAG (multi-workspace localStorage + optional server ingest/RAG) */

const KG_LEGACY_STORE_KEY = "misc:kg:store:v1";
const KG_INDEX_KEY = "misc:kg:index:v2";
const KG_WS_PREFIX = "misc:kg:ws:";
const KG_RAG_HISTORY_MAX = 30;
const KG_API_INGEST = "/api/misc/knowledge-graph/ingest";
const KG_API_EXTRACT = "/api/misc/knowledge-graph/extract";
const KG_API_DISCOVER = "/api/misc/knowledge-graph/discover";
const KG_API_RAG = "/api/misc/knowledge-graph/rag";
const KG_REVIEW_MODE_KEY = "misc:kg:review-mode:v1";

// schema.org / FIBO-inspired taxonomy for BTC + macro + on-chain research graphs
const KG_NODE_TYPES = [
  "asset", "org", "financial_institution", "government_body", "person",
  "product", "derivative", "stablecoin", "metric", "indicator", "market_index",
  "policy", "regulation", "legal_instrument", "event", "protocol", "jurisdiction",
  "concept", "price_level", "entity",
];

const KG_EXTRACT_VERSION = 5;
const KG_TYPE_CONFIDENT = 0.8;
const KG_TYPE_REVIEW_THRESHOLD = 0.65;
const KG_EDGE_CONFIDENT = 0.75;

const KG_ENTITY_IDENTITIES = [
  { id: "bitcoin", canonical: "Bitcoin", type: "asset", aliases: ["bitcoin", "btc", "xbt"] },
  { id: "ethereum", canonical: "Ethereum", type: "asset", aliases: ["ethereum", "eth"] },
  { id: "federal-reserve", canonical: "Federal Reserve", type: "government_body", aliases: ["federal reserve", "fed", "fomc"] },
  { id: "sec", canonical: "SEC", type: "government_body", aliases: ["sec"] },
  { id: "blackrock", canonical: "BlackRock", type: "financial_institution", aliases: ["blackrock"] },
  { id: "michael-saylor", canonical: "Michael Saylor", type: "person", aliases: ["michael saylor", "saylor michael", "saylor"] },
  { id: "gary-gensler", canonical: "Gary Gensler", type: "person", aliases: ["gary gensler", "gensler"] },
  { id: "jerome-powell", canonical: "Jerome Powell", type: "person", aliases: ["jerome powell", "jay powell", "powell"] },
  { id: "hash-rate", canonical: "Hash Rate", type: "metric", aliases: ["hash rate", "hashrate"] },
  { id: "spot-bitcoin-etf", canonical: "Spot Bitcoin ETF", type: "product", aliases: ["spot bitcoin etf", "bitcoin etf", "etf"] },
];

const KG_IDENTITY_ALIAS_MAP = (() => {
  const m = new Map();
  for (const rec of KG_ENTITY_IDENTITIES) {
    for (const a of rec.aliases) m.set(a.toLowerCase(), rec);
    m.set(rec.canonical.toLowerCase(), rec);
    m.set(rec.id, rec);
  }
  return m;
})();

const KG_ENTITY_CATALOG = {
  bitcoin: ["Bitcoin", "asset", "Primary cryptocurrency / digital asset"],
  btc: ["Bitcoin", "asset", "Primary cryptocurrency / digital asset"],
  ethereum: ["Ethereum", "asset", "Smart-contract blockchain and ETH asset"],
  halving: ["Halving", "event", "Bitcoin block subsidy reduction event"],
  "hash rate": ["Hash Rate", "metric", "Mining network compute power"],
  hashrate: ["Hash Rate", "metric", "Mining network compute power"],
  etf: ["Spot ETF", "product", "Exchange-traded fund holding spot Bitcoin"],
  sopr: ["SOPR", "metric", "Spent Output Profit Ratio on-chain indicator"],
  mvrv: ["MVRV", "metric", "Market value to realized value ratio"],
  fed: ["Federal Reserve", "government_body", "US central bank"],
  "federal reserve": ["Federal Reserve", "government_body", "US central bank"],
  sec: ["SEC", "government_body", "US Securities and Exchange Commission"],
  treasury: ["US Treasury", "government_body", "US federal finance department"],
  blackrock: ["BlackRock", "financial_institution", "Asset manager issuing spot Bitcoin ETF"],
  grayscale: ["Grayscale", "financial_institution", "Crypto asset manager (GBTC issuer)"],
  fidelity: ["Fidelity", "financial_institution", "Asset manager with Bitcoin products"],
  coinbase: ["Coinbase", "financial_institution", "US-listed crypto exchange"],
  binance: ["Binance", "financial_institution", "Global crypto exchange"],
  cpi: ["CPI", "indicator", "Consumer Price Index inflation gauge"],
  dxy: ["US Dollar Index", "market_index", "DXY dollar strength index"],
  "interest rates": ["Interest Rates", "indicator", "Benchmark borrowing costs"],
  inflation: ["Inflation", "indicator", "General price level increase"],
  mining: ["Mining", "concept", "Proof-of-work block production securing Bitcoin"],
  lightning: ["Lightning Network", "protocol", "Bitcoin layer-2 payment network"],
  stablecoin: ["Stablecoin", "stablecoin", "Token pegged to fiat or collateral"],
  "gary gensler": ["Gary Gensler", "person", "Former SEC chair referenced in crypto regulation coverage"],
  "jerome powell": ["Jerome Powell", "person", "Federal Reserve chair"],
  "michael saylor": ["Michael Saylor", "person", "MicroStrategy executive and Bitcoin advocate"],
  "cathie wood": ["Cathie Wood", "person", "ARK Invest CEO and macro/crypto commentator"],
  "larry fink": ["Larry Fink", "person", "BlackRock CEO"],
  "brian armstrong": ["Brian Armstrong", "person", "Coinbase CEO"],
  microstrategy: ["MicroStrategy", "org", "Public company holding Bitcoin treasury"],
  gbtc: ["GBTC", "product", "Grayscale Bitcoin Trust product"],
  usdt: ["USDT", "stablecoin", "Tether USD stablecoin"],
  usdc: ["USDC", "stablecoin", "Circle USD stablecoin"],
  adoption: ["Adoption", "concept", "Broader uptake of Bitcoin or crypto"],
  volatility: ["Volatility", "concept", "Price variability and risk theme"],
};

let kgReady = false;
let kgIndex = null;
let kgStore = null;
let kgActiveId = null;
let kgNetworkFull = null;
let kgNodesFull = null;
let kgEdgesFull = null;
let kgFullPhysics = true;
let kgFullShowLabels = true;
let kgSelected = null;
let kgTab = "overview";
let kgInventoryView = "nodes";
let kgInventoryTypeFilter = "";
let kgInventorySort = "label";
let kgInventorySelectedNodes = new Set();
let kgInventorySelectedEdges = new Set();
let kgConfirmResolve = null;
let kgLastSearchResult = null;
let kgPendingReview = null;
let kgPendingReviewQueue = [];
let kgPendingDiscover = null;
let kgIngestBusy = false;
let kgReviewView = "nodes";
let kgReviewTypeFilter = "";
let kgReviewNeedsOnly = false;
let kgExtractionProgress = null;

const kgEl = (id) => document.getElementById(id);

function kgNormAlias(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function kgPersonDedupeKey(label) {
  const norm = kgNormAlias(label);
  const tokens = norm.split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 2) return `person:${tokens.slice().sort().join(" ")}`;
  return null;
}

function kgResolveEntityIdentity(label) {
  const low = kgNormAlias(label);
  if (!low) return null;
  let hit = KG_IDENTITY_ALIAS_MAP.get(low);
  if (!hit) {
    const pk = kgPersonDedupeKey(label);
    if (pk) {
      for (const rec of KG_ENTITY_IDENTITIES) {
        if (rec.type === "person" && rec.aliases.some((a) => kgPersonDedupeKey(a) === pk)) return rec;
      }
    }
  }
  return hit || null;
}

function kgApplyIdentityToNode(node) {
  const label = (node.label || node.id || "").trim();
  const ident = kgResolveEntityIdentity(label);
  if (!ident) return { ...node, label };
  return {
    ...node,
    id: ident.id,
    label: ident.canonical,
    type: node.type && node.type !== "entity" ? node.type : ident.type,
    identityId: ident.id,
  };
}

function kgEntityDedupeKey(label, type = "") {
  const ident = kgResolveEntityIdentity(label);
  if (ident) return `id:${ident.id}`;
  const pk = kgPersonDedupeKey(label);
  if (pk) return pk;
  return type ? `${kgNormAlias(label)}|${type}` : kgNormAlias(label);
}

function kgContentHash(text) {
  const s = String(text || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function kgSyncPendingToStore() {
  if (!kgStore) return;
  kgStore.pendingExtractions = (kgPendingReviewQueue || []).map((p) => ({
    docId: p.docId,
    docTitle: p.docTitle,
    nodes: p.nodes,
    edges: p.edges,
    usedLlm: p.usedLlm,
    method: p.method,
    fallback: p.fallback,
    extractVersion: p.extractVersion,
    createdAt: p.createdAt || new Date().toISOString(),
  }));
  kgSaveStore();
}

function kgHydratePendingFromStore() {
  const list = kgStore?.pendingExtractions || [];
  if (!list.length) return;
  kgPendingReviewQueue = list.map((p) => ({ ...p, createdAt: p.createdAt || new Date().toISOString() }));
  kgPendingReview = kgPendingReviewQueue[0] || null;
}

function kgUpdateReviewTabBadge() {
  const badge = kgEl("kg-review-tab-badge");
  const n = kgPendingReviewQueue.length;
  if (badge) {
    badge.textContent = n ? String(n) : "";
    badge.hidden = !n;
  }
  const banner = kgEl("kg-ingest-pending-banner");
  if (banner) {
    if (n) {
      banner.hidden = false;
      banner.innerHTML = `<span>${n} extraction${n === 1 ? "" : "s"} pending review.</span> <button type="button" class="kg-btn kg-btn--secondary kg-btn--inline" data-kg-goto="review">Open Review</button>`;
      banner.querySelector("[data-kg-goto]")?.addEventListener("click", () => kgSetTab("review"));
    } else {
      banner.hidden = true;
    }
  }
}

function kgSetExtractionProgress(msg) {
  kgExtractionProgress = msg;
  for (const id of ["kg-extract-progress", "kg-extract-progress-review"]) {
    const el = kgEl(id);
    if (el) el.textContent = msg || "";
  }
}

function kgNormalizeConfidence(raw, fallback = 0.55) {
  if (typeof raw !== "number" || Number.isNaN(raw)) return fallback;
  return raw > 1 ? raw / 100 : raw;
}

function kgNodeTypeConfidence(n) {
  const raw = n?.confidence ?? n?.typeConfidence;
  if (typeof raw === "number" && !Number.isNaN(raw)) return kgNormalizeConfidence(raw);
  const label = n?.label || "";
  if (kgCatalogEntry(label)) return 0.9;
  const type = n?.type || "entity";
  if (type === "entity") return 0.28;
  if (["person", "government_body", "financial_institution", "asset", "metric", "indicator"].includes(type)) {
    return 0.58;
  }
  return 0.5;
}

function kgNodeNeedsReview(n) {
  const type = n?.type || "entity";
  return type === "entity" || kgNodeTypeConfidence(n) < KG_TYPE_REVIEW_THRESHOLD;
}

function kgTypeConfidenceBadge(n) {
  const conf = kgNodeTypeConfidence(n);
  const pct = Math.round(conf * 100);
  if (conf >= KG_TYPE_CONFIDENT) {
    return `<span class="kg-type-conf kg-type-conf--high" title="${kgEsc(n.typeReason || "High-confidence type")}">${pct}%</span>`;
  }
  if (conf >= KG_TYPE_REVIEW_THRESHOLD) {
    return `<span class="kg-type-conf kg-type-conf--mid" title="${kgEsc(n.typeReason || "Moderate confidence")}">${pct}%</span>`;
  }
  return `<span class="kg-type-conf kg-type-conf--low" title="${kgEsc(n.typeReason || "Needs review")}">${pct}% · check type</span>`;
}

function kgAutoApproveConfidentItems(pending) {
  if (!pending) return;
  for (const n of pending.nodes || []) {
    if (!kgNodeNeedsReview(n) && kgNodeTypeConfidence(n) >= KG_TYPE_CONFIDENT) {
      n.status = "approved";
    }
  }
  kgCascadeApproveEdges(pending);
}

function kgEsc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const KG_MAX_RAG_CHUNKS = 120;
const KG_INVENTORY_PAGE = 150;

function kgFmtTimestamp(ts, metadata = {}) {
  if (ts == null || ts === "") return "";
  const raw = String(ts).trim();
  const sec = Number(raw);
  if (Number.isFinite(sec)) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const label = h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
    const vid = metadata.videoId;
    if (vid) {
      const seek = Math.max(0, Math.floor(sec));
      return `<a class="kg-ts-link" href="https://www.youtube.com/watch?v=${kgEsc(vid)}&t=${seek}s" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return label;
  }
  if (/^\d{1,2}:\d{2}:\d{2}/.test(raw) || /^\d{1,2}:\d{2}/.test(raw)) return raw;
  return raw;
}

function kgNormalizeSourceKey(key) {
  return String(key || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 512);
}

function kgSourceKey({ url = "", text = "", file = null, result = null } = {}) {
  if (result?.metadata?.sourceKey) return result.metadata.sourceKey;
  const src = kgNormalizeSourceKey(url || file?.name || "");
  if (src) return src;
  const t = (text || "").trim();
  if (!t) return "";
  let h = 0;
  for (let i = 0; i < Math.min(t.length, 4000); i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
  return `text:${Math.abs(h).toString(36)}`;
}

function kgFindDocumentBySource(sourceKey) {
  if (!sourceKey) return null;
  const norm = kgNormalizeSourceKey(sourceKey);
  return (kgStore.documents || []).find((d) => {
    const keys = [d.sourceKey, d.metadata?.sourceKey, d.source].filter(Boolean);
    return keys.some((k) => kgNormalizeSourceKey(k) === norm);
  });
}

function kgSetIngestBusy(busy) {
  kgIngestBusy = busy;
  for (const id of ["kg-run-ingest", "kg-discover-ingest"]) {
    const btn = kgEl(id);
    if (btn) btn.disabled = busy;
  }
}

function kgIngestErrorMessage(err) {
  return err?.message || String(err || "Unknown error");
}

async function kgConfirmReingest(existing) {
  const title = existing?.title || "Untitled";
  return kgConfirmDialog({
    title: "Source already ingested",
    body: `<p><strong>${kgEsc(title)}</strong> was already ingested from this source.</p><p>Ingest again anyway? This creates a new document and re-runs extraction.</p>`,
    confirmLabel: "Ingest again",
    danger: false,
  });
}

function kgIngestIdleHint() {
  const approvedDiscover = kgPendingDiscover?.candidates?.filter((c) => c.status === "approved").length || 0;
  const reviewQ = kgPendingReviewQueue.length;
  if (approvedDiscover) {
    return `${approvedDiscover} approved discover source(s) waiting — click Ingest approved in Discovery review above.`;
  }
  if (reviewQ > 1) {
    return `${reviewQ} extractions in review — click Add approved to graph or Next above.`;
  }
  if (reviewQ || kgPendingReview) {
    return "Extraction review is open — click Add approved to graph above.";
  }
  return "Add a URL, text, or files.";
}

function kgEdgeKey(edge) {
  if (edge?.id) return edge.id;
  const lbl = edge?.label || "relates_to";
  return `${edge?.source}->${edge?.target}:${lbl}`;
}

function kgRelEdgeId(rel) {
  return rel?.id || `${rel.source}->${rel.target}:${rel.label || "relates_to"}`;
}

const KG_TEMPLATES = {
  blank() {
    return { schema: { nodes: [], edges: [] }, documents: [], ingestLog: [], ragHistory: [] };
  },
  btc_basics() {
    return {
      schema: {
        nodes: [
          { id: "bitcoin", label: "Bitcoin", type: "asset" },
          { id: "halving", label: "Halving", type: "event" },
          { id: "mining", label: "Mining", type: "concept" },
          { id: "etf", label: "Spot ETF", type: "product" },
          { id: "hash-rate", label: "Hash Rate", type: "metric" },
        ],
        edges: [
          { id: "bitcoin->halving", source: "bitcoin", target: "halving", label: "has_event" },
          { id: "bitcoin->mining", source: "bitcoin", target: "mining", label: "secured_by" },
          { id: "etf->bitcoin", source: "etf", target: "bitcoin", label: "tracks" },
          { id: "mining->hash-rate", source: "mining", target: "hash-rate", label: "measured_by" },
        ],
      },
      documents: [],
      ingestLog: [],
      ragHistory: [],
    };
  },
  macro() {
    return {
      schema: {
        nodes: [
          { id: "bitcoin", label: "Bitcoin", type: "asset" },
          { id: "fed", label: "Federal Reserve", type: "org" },
          { id: "cpi", label: "CPI", type: "indicator" },
          { id: "dxy", label: "US Dollar Index", type: "indicator" },
          { id: "rates", label: "Interest Rates", type: "indicator" },
        ],
        edges: [
          { id: "fed->rates", source: "fed", target: "rates", label: "sets" },
          { id: "rates->bitcoin", source: "rates", target: "bitcoin", label: "influences" },
          { id: "cpi->fed", source: "cpi", target: "fed", label: "informs" },
          { id: "dxy->bitcoin", source: "dxy", target: "bitcoin", label: "correlates" },
        ],
      },
      documents: [],
      ingestLog: [],
      ragHistory: [],
    };
  },
};

function kgDefaultWorkspace(id, name = "Untitled", description = "") {
  return {
    version: 1,
    id,
    name,
    description,
    schema: { nodes: [], edges: [] },
    documents: [],
    pendingExtractions: [],
    ingestLog: [],
    ragHistory: [],
    lastSearch: null,
    updatedAt: new Date().toISOString(),
  };
}

function kgDefaultIndex() {
  return { version: 2, activeId: null, workspaces: [] };
}

function kgWorkspaceKey(id) {
  return `${KG_WS_PREFIX}${id}`;
}

function kgLoadIndex() {
  try {
    const raw = localStorage.getItem(KG_INDEX_KEY);
    if (!raw) return kgDefaultIndex();
    const parsed = JSON.parse(raw);
    return { ...kgDefaultIndex(), ...parsed };
  } catch {
    return kgDefaultIndex();
  }
}

function kgSaveIndex() {
  try {
    localStorage.setItem(KG_INDEX_KEY, JSON.stringify(kgIndex));
  } catch (err) {
    if (err?.name === "QuotaExceededError") {
      alert("Storage quota exceeded. Export workspaces and delete unused documents.");
    }
    throw err;
  }
}

function kgPersistWorkspace(id, store) {
  try {
    localStorage.setItem(kgWorkspaceKey(id), JSON.stringify(store));
  } catch (err) {
    if (err?.name === "QuotaExceededError") {
      alert(
        "Workspace storage is full. Export JSON, delete old documents, or create a new workspace.",
      );
    }
    throw err;
  }
}

function kgReadWorkspace(id) {
  try {
    const raw = localStorage.getItem(kgWorkspaceKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...kgDefaultWorkspace(id, parsed.name || "Untitled"), ...parsed, id };
  } catch {
    return null;
  }
}

function kgWorkspaceStats(store) {
  return {
    nodeCount: (store.schema?.nodes || []).length,
    docCount: (store.documents || []).length,
    ragCount: (store.ragHistory || []).length,
    updatedAt: store.updatedAt || new Date().toISOString(),
  };
}

function kgSyncIndexEntry(id) {
  const store = id === kgActiveId ? kgStore : kgReadWorkspace(id);
  if (!store) return;
  const stats = kgWorkspaceStats(store);
  const entry = kgIndex.workspaces.find((w) => w.id === id);
  const row = {
    id,
    name: store.name || "Untitled",
    description: store.description || "",
    ...stats,
  };
  if (entry) Object.assign(entry, row);
  else kgIndex.workspaces.push(row);
  kgIndex.workspaces.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function kgMigrateLegacyStore() {
  const legacy = localStorage.getItem(KG_LEGACY_STORE_KEY);
  if (!legacy) return;
  const index = kgLoadIndex();
  if (index.workspaces.length) return;
  try {
    const parsed = JSON.parse(legacy);
    const id = kgUid("ws");
    const ws = {
      ...kgDefaultWorkspace(id, "Default (migrated)"),
      ...parsed,
      id,
      name: "Default (migrated)",
      ragHistory: parsed.ragHistory || [],
      lastSearch: null,
    };
    kgPersistWorkspace(id, ws);
    index.workspaces.push({ id, name: ws.name, description: "", ...kgWorkspaceStats(ws) });
    index.activeId = id;
    localStorage.setItem(KG_INDEX_KEY, JSON.stringify(index));
  } catch {
    /* ignore corrupt legacy */
  }
}

function kgEnsureActiveWorkspace() {
  kgIndex = kgLoadIndex();
  kgMigrateLegacyStore();
  kgIndex = kgLoadIndex();

  if (!kgIndex.workspaces.length) {
    const id = kgUid("ws");
    const ws = kgDefaultWorkspace(id, "Default");
    kgPersistWorkspace(id, ws);
    kgIndex.workspaces.push({ id, name: ws.name, description: "", ...kgWorkspaceStats(ws) });
    kgIndex.activeId = id;
    kgSaveIndex();
  }

  if (!kgIndex.activeId || !kgIndex.workspaces.some((w) => w.id === kgIndex.activeId)) {
    kgIndex.activeId = kgIndex.workspaces[0].id;
    kgSaveIndex();
  }

  kgActiveId = kgIndex.activeId;
  kgStore = kgReadWorkspace(kgActiveId) || kgDefaultWorkspace(kgActiveId, "Default");
}

function kgLoadStore() {
  kgEnsureActiveWorkspace();
  if (!kgStore.pendingExtractions) kgStore.pendingExtractions = [];
  kgHydratePendingFromStore();
  kgUpdateReviewTabBadge();
  return kgStore;
}

function kgSaveStore() {
  if (!kgStore || !kgActiveId) return;
  kgStore.updatedAt = new Date().toISOString();
  kgPersistWorkspace(kgActiveId, kgStore);
  kgSyncIndexEntry(kgActiveId);
  kgSaveIndex();
  kgUpdateMeta();
  kgRenderWorkspaceSelect();
}

function kgUpdateMeta() {
  const meta = kgEl("kg-meta");
  if (meta && kgStore) {
    const ragN = (kgStore.ragHistory || []).length;
    meta.textContent = `${kgStore.name} · ${kgStore.schema.nodes.length} nodes · ${kgStore.documents.length} docs · ${ragN} RAG`;
  }
}

function kgCloneStoreData(store) {
  return JSON.parse(JSON.stringify(store));
}

function kgApplyWorkspace(store, id) {
  kgActiveId = id;
  kgStore = store;
  kgIndex.activeId = id;
  kgSaveIndex();
  kgSelected = null;
  kgPendingReview = null;
  kgPendingReviewQueue = [];
  kgPendingDiscover = null;
  kgNetworkFull = null;
  kgNodesFull = null;
  kgEdgesFull = null;
  kgLastSearchResult = kgStore.lastSearch || null;
  kgUpdateMeta();
  kgRenderWorkspaceSelect();
  kgRefreshGraph();
  kgRenderSidebar();
  kgRenderIngestLog();
  kgRenderDocumentList();
  kgRenderReviewPanel();
  kgRenderDiscoverPanel();
  kgRenderRagHistory();
  if (kgLastSearchResult) kgRenderSearchResults(kgLastSearchResult);
  else if (kgEl("kg-search-results")) {
    kgEl("kg-search-results").innerHTML =
      '<p class="kg-sidebar-hint">Search returns graph paths, document snippets (with timestamps when available), and an LLM answer when configured.</p>';
  }
  if (kgEl("kg-search-input") && kgStore.lastSearch?.query) {
    kgEl("kg-search-input").value = kgStore.lastSearch.query;
  }
  if (kgTab === "workspaces") kgRenderWorkspaceList();
}

function kgSwitchWorkspace(id) {
  if (!id || id === kgActiveId) return;
  kgSaveStore();
  const next = kgReadWorkspace(id);
  if (!next) return;
  kgApplyWorkspace(next, id);
}

function kgCreateWorkspace({ name, description = "", template = "blank", data = null }) {
  const id = kgUid("ws");
  let base;
  if (data) {
    base = { ...kgDefaultWorkspace(id, name, description), ...data, id, name, description };
  } else if (template === "duplicate") {
    base = { ...kgCloneStoreData(kgStore), id, name, description, updatedAt: new Date().toISOString() };
    base.ragHistory = [];
    base.lastSearch = null;
  } else {
    const tpl = KG_TEMPLATES[template]?.() || KG_TEMPLATES.blank();
    base = { ...kgDefaultWorkspace(id, name, description), ...tpl, id, name, description };
  }
  if (!base.ragHistory) base.ragHistory = [];
  kgPersistWorkspace(id, base);
  kgIndex.workspaces.push({ id, name, description, ...kgWorkspaceStats(base) });
  kgSaveIndex();
  kgApplyWorkspace(base, id);
  kgRenderWorkspaceList();
  return id;
}

function kgRenameWorkspace(id, name, description) {
  const store = id === kgActiveId ? kgStore : kgReadWorkspace(id);
  if (!store || !name?.trim()) return;
  store.name = name.trim();
  if (description !== undefined) store.description = description.trim();
  store.updatedAt = new Date().toISOString();
  kgPersistWorkspace(id, store);
  kgSyncIndexEntry(id);
  kgSaveIndex();
  if (id === kgActiveId) kgUpdateMeta();
  kgRenderWorkspaceSelect();
  kgRenderWorkspaceList();
}

function kgDeleteWorkspace(id) {
  if (kgIndex.workspaces.length <= 1) {
    alert("Keep at least one workspace.");
    return;
  }
  const entry = kgIndex.workspaces.find((w) => w.id === id);
  if (!entry) return;
  if (!confirm(`Delete workspace "${entry.name}"? This cannot be undone.`)) return;
  localStorage.removeItem(kgWorkspaceKey(id));
  kgIndex.workspaces = kgIndex.workspaces.filter((w) => w.id !== id);
  if (kgIndex.activeId === id) {
    const next = kgIndex.workspaces[0];
    const ws = kgReadWorkspace(next.id);
    kgApplyWorkspace(ws, next.id);
  }
  kgSaveIndex();
  kgRenderWorkspaceSelect();
  kgRenderWorkspaceList();
}

function kgDuplicateWorkspace(id) {
  const src = id === kgActiveId ? kgStore : kgReadWorkspace(id);
  if (!src) return;
  const copyName = `${src.name} (copy)`;
  kgCreateWorkspace({ name: copyName, description: src.description || "", data: kgCloneStoreData(src) });
}

function kgUid(prefix = "n") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function kgDetectType({ url, text, file }) {
  const name = (file?.name || "").toLowerCase();
  const u = (url || "").toLowerCase();
  if (file) {
    if (name.endsWith(".pdf")) return "pdf";
    if (name.endsWith(".srt") || name.endsWith(".vtt")) return "transcript";
    if (/\.(mp3|wav|m4a|ogg|flac)$/.test(name)) return "media";
    if (/\.(mp4|webm|mov|mkv)$/.test(name)) return "media";
    if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
    if (name.endsWith(".txt")) return "text";
    if (name.endsWith(".rss") || name.endsWith(".xml")) return "rss";
  }
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("playlist")) return "youtube";
  if (u && (u.endsWith(".rss") || u.includes("/feed") || u.includes("podcast"))) return "rss";
  if (u.startsWith("http")) return "url";
  if (text?.trim()) return "text";
  return "text";
}

function kgFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result || "";
      const b64 = String(res).split(",")[1] || "";
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function kgReadTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function kgMergeGraph(entities, relationships) {
  return kgMergeGraphTracked(entities, relationships);
}

function kgReviewModeEnabled() {
  const stored = localStorage.getItem(KG_REVIEW_MODE_KEY);
  if (stored === "0" || stored === "false") return false;
  if (stored === "1" || stored === "true") return true;
  const cb = kgEl("kg-review-mode");
  return cb ? cb.checked : true;
}

function kgSetReviewMode(enabled) {
  localStorage.setItem(KG_REVIEW_MODE_KEY, enabled ? "1" : "0");
  const cb = kgEl("kg-review-mode");
  if (cb) cb.checked = enabled;
}

function kgDocExtractionStatus(doc) {
  return doc?.extractionStatus || (doc?.extracted?.nodeIds?.length ? "done" : "pending");
}

function kgDocListEligible(doc) {
  const st = kgDocExtractionStatus(doc);
  return st !== "pending";
}

function kgDocFromDiscover(doc) {
  return Boolean(doc?.metadata?.discoverType || doc?.metadata?.searchPhrase);
}

function kgFindDocumentForPending(pending) {
  if (!pending) return null;
  const docs = kgStore.documents || [];
  if (pending.docId) {
    const byId = docs.find((d) => d.id === pending.docId);
    if (byId) return byId;
    const logRow = (kgStore.ingestLog || []).find((r) => r.docId === pending.docId);
    if (logRow?.docId) {
      const byLog = docs.find((d) => d.id === logRow.docId);
      if (byLog) return byLog;
    }
  }
  const title = (pending.docTitle || "").trim();
  if (title) {
    const matches = docs.filter((d) => (d.title || "").trim() === title);
    const inReview = matches.find((d) => kgDocExtractionStatus(d) === "review");
    if (inReview) return inReview;
    if (matches.length === 1) return matches[0];
  }
  return null;
}

function kgCommitDocumentSkipped(pending) {
  const doc = kgFindDocumentForPending(pending);
  if (doc) {
    doc.extractionStatus = "skipped";
    doc.extractionMeta = {
      ...(doc.extractionMeta || {}),
      skippedAt: new Date().toISOString(),
      approvedNodes: 0,
      approvedEdges: 0,
    };
  }
  kgPendingReviewQueue = kgPendingReviewQueue.filter((p) => p.docId !== pending?.docId);
  if (kgPendingReview?.docId === pending?.docId) {
    kgPendingReview = kgPendingReviewQueue[0] || null;
  }
  kgSaveStore();
  kgRenderReviewPanel();
  kgRenderDocumentList();
  kgRenderIngestLog();
  return doc;
}



function kgExtractionStatusLabel(doc) {
  const st = kgDocExtractionStatus(doc);
  if (st === "review") return '<span class="kg-badge kg-badge--warn">review</span>';
  if (st === "done") return '<span class="kg-badge">extracted</span>';
  if (st === "failed") return '<span class="kg-badge kg-badge--danger">failed</span>';
  if (st === "skipped") return '<span class="kg-badge kg-badge--secondary">skipped</span>';
  return '<span class="kg-badge kg-badge--secondary">pending</span>';
}

function kgFmtIngestedAt(ts) {
  const d = new Date(ts || Date.now());
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kgIngestModeBadge(fallback) {
  return fallback
    ? '<span class="kg-badge kg-badge--warn" title="Local — parsed in the browser (API unavailable)">local</span>'
    : '<span class="kg-badge" title="Server — parsed via knowledge-graph API">server</span>';
}

function kgDecorateIngestHelp(root) {
  if (!root) return;
  window.decorateHelpLabels?.(root);
}

async function kgServerExtract(payload) {
  const res = await fetch(KG_API_EXTRACT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function kgGoalKeywords(goal = "", searchPhrase = "") {
  const stop = new Set([
    "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "my", "need",
    "sources", "about", "graph", "macro", "this", "that", "from", "into", "your", "want",
    "research", "describe", "what", "find", "pages", "news", "videos", "images", "after",
    "flows", "flow", "inflows", "outflows", "miner", "miners", "bitcoin", "btc",
  ]);
  const blob = `${goal} ${searchPhrase}`.toLowerCase();
  const words = blob.match(/[a-z]{3,}/g) || [];
  const out = [];
  for (const w of words) {
    if (stop.has(w) || out.includes(w)) continue;
    out.push(w);
  }
  const sp = (searchPhrase || "").trim().toLowerCase();
  if (sp.length >= 4 && !out.includes(sp)) out.unshift(sp);
  return out.slice(0, 36);
}

function kgNodeGoalScore(label, id, description, goalTerms) {
  const blob = `${label} ${id} ${description}`.toLowerCase().replace(/-/g, " ");
  let score = 0;
  for (const gt of goalTerms) {
    if (gt.includes(" ") ? blob.includes(gt) : new RegExp(`\\b${gt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(blob)) {
      score += gt.includes(" ") ? 4 : 3;
    }
  }
  return score;
}

function kgFilterExtractionByGoal(entities, relationships, goal = "", searchPhrase = "") {
  const goalTerms = kgGoalKeywords(goal, searchPhrase);
  if (!goalTerms.length || !entities.length) {
    return { entities, relationships };
  }
  const scored = entities.map((n) => ({
    n,
    s: kgNodeGoalScore(n.label || "", n.id || "", n.description || "", goalTerms)
      + (/^(bitcoin|btc)$/i.test(n.label || "") ? 2 : 0),
  })).filter((x) => x.s > 0);
  if (!scored.length) return { entities: entities.slice(0, 28), relationships: relationships.slice(0, 40) };
  scored.sort((a, b) => b.s - a.s);
  const keep = new Set(scored.slice(0, 28).map((x) => x.n.id));
  const rels = [];
  for (const r of relationships) {
    if (keep.has(r.source) && keep.has(r.target)) rels.push(r);
    else if (keep.has(r.source) || keep.has(r.target)) {
      rels.push(r);
      keep.add(r.source);
      keep.add(r.target);
    }
  }
  const entitiesOut = entities.filter((n) => keep.has(n.id));
  return { entities: entitiesOut.slice(0, 28), relationships: rels.slice(0, 40) };
}

function kgDocSourceLink(doc) {
  const full = String(doc.source || doc.metadata?.source || doc.metadata?.url || "").trim();
  const display = full.length > 48 ? `${full.slice(0, 45)}…` : (full || "—");
  if (/^https?:\/\//i.test(full)) {
    return `<a class="kg-doc-source-link mono" href="${kgEsc(full)}" target="_blank" rel="noopener noreferrer" title="Open source in new tab">${kgEsc(display)}</a>`;
  }
  return `<span class="mono kg-doc-source-cell" title="${kgEsc(full)}">${kgEsc(display)}</span>`;
}

function kgClientExtractForDocument(text, { docId = "", title = "", discoveryGoal = "", searchPhrase = "" } = {}) {
  let { entities, relationships } = kgClientExtract(text, { discoveryGoal, searchPhrase });
  entities = entities
    .map((ent) => kgEnrichExtractedNode(ent, text))
    .filter(Boolean)
    .filter((ent) => (ent.description || "").length >= 12 || ent.type !== "entity");
  let entityN = 0;
  entities = entities.filter((ent) => {
    if (ent.type !== "entity") return true;
    entityN += 1;
    return entityN <= 2;
  });
  if (discoveryGoal || searchPhrase) {
    ({ entities, relationships } = kgFilterExtractionByGoal(entities, relationships, discoveryGoal, searchPhrase));
  }
  relationships = relationships.filter((r) => r.label !== "mentioned_with");
  const existingNodes = kgStore.schema.nodes || [];
  const existingEdges = kgStore.schema.edges || [];
  const existingById = Object.fromEntries(existingNodes.map((n) => [n.id, n]));
  const byNorm = {};
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const nodes = [];
  const seen = new Set();
  for (const ent of entities) {
    const applied = kgApplyIdentityToNode(ent);
    const label = applied.label || applied.id;
    let nid = applied.id || ent.id;
    let mergeTargetId = null;
    const ekey = kgEntityDedupeKey(label, applied.type);
    for (const ex of existingNodes) {
      const xkey = kgEntityDedupeKey(ex.label || ex.id, ex.type);
      if (ekey === xkey || ex.id === nid) {
        mergeTargetId = ex.id;
        nid = ex.id;
        break;
      }
    }
    const nkey = nid;
    if (seen.has(nkey)) continue;
    seen.add(nkey);
    nodes.push({
      id: nid,
      label,
      type: ent.type || kgInferNodeType(label),
      description: ent.description || kgExtractContextDescription(label, text, ent.type),
      sourceDocId: docId,
      mergeTargetId,
      isNew: !existingById[nid],
      status: "pending",
      tempId: `n-${nodes.length}`,
    });
    byNorm[norm(label)] = nid;
  }

  const edges = [];
  const edgeKeys = new Set();
  for (const rel of relationships) {
    const src = rel.source;
    const tgt = rel.target;
    const key = `${src}->${tgt}:${rel.label || "relates_to"}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({
      id: rel.id || `${src}->${tgt}`,
      source: src,
      target: tgt,
      label: rel.label || "relates_to",
      description: "",
      sourceDocId: docId,
      status: "pending",
      tempId: `e-${edges.length}`,
    });
  }

  return {
    docId,
    title,
    nodes,
    edges,
    usedLlm: false,
    method: "rules-local",
    fallback: true,
  };
}

function kgPrepareReviewItems(result, doc) {
  const nodes = (result.nodes || []).map((n, i) => {
    const applied = kgApplyIdentityToNode(n);
    const label = applied.label || applied.id || "";
    const type = applied.type || kgInferNodeType(label);
    const description = applied.description || kgExtractContextDescription(label, doc?.fullText || "", type);
    const conf = kgNormalizeConfidence(applied.confidence ?? applied.typeConfidence, 0.55);
    return {
      ...applied,
      label,
      type,
      description,
      confidence: conf,
      typeConfidence: conf,
      id: applied.id || applied.mergeTargetId || label,
      tempId: applied.tempId || `n-${i}`,
      status: applied.status || "pending",
      sourceDocId: applied.sourceDocId || doc?.id,
    };
  });
  const edges = (result.edges || []).map((e, i) => ({
    ...e,
    confidence: kgNormalizeConfidence(e.confidence, 0.55),
    tempId: e.tempId || `e-${i}`,
    status: e.status || "pending",
    sourceDocId: e.sourceDocId || doc?.id,
  }));
  const pending = {
    docId: doc?.id || result.docId,
    docTitle: doc?.title || result.title || "Document",
    nodes,
    edges,
    usedLlm: Boolean(result.usedLlm),
    method: result.method || "hybrid",
    fallback: Boolean(result.fallback),
    extractVersion: result.extractVersion || KG_EXTRACT_VERSION,
    createdAt: new Date().toISOString(),
    extractMeta: result.extractMeta || null,
  };
  kgAutoApproveConfidentItems(pending);
  return pending;
}

async function kgRunExtractForDoc(doc, { force = false, statusEl = null } = {}) {
  if (!doc) return null;

  let fullText = doc.fullText || "";
  if (!fullText && doc.chunks?.length) {
    fullText = doc.chunks.map((c) => c.text || "").join("\n\n");
  }
  if (!fullText) fullText = doc.textPreview || "";
  const contentHash = kgContentHash(fullText);
  if (doc.extractionStatus === "done" && !force && doc.contentHash === contentHash) return null;

  kgSetExtractionProgress(`Extracting "${doc.title}"…`);
  if (statusEl) statusEl.textContent = `Extracting entities from "${doc.title}"…`;

  if (!fullText.trim()) {
    doc.extractionStatus = "failed";
    doc.extractionMeta = {
      ...(doc.extractionMeta || {}),
      at: new Date().toISOString(),
      emptyText: true,
    };
    if (statusEl) {
      statusEl.textContent = `No extractable text in "${doc.title}" — article fetch may have failed. Re-ingest after restarting server.py.`;
    }
    kgRenderDocumentList();
    return null;
  }

  const discoveryGoal = doc.metadata?.discoveryGoal
    || kgEl("kg-discover-goal")?.value?.trim()
    || "";
  const searchPhrase = doc.metadata?.searchPhrase || "";

  const payload = {
    text: fullText,
    title: doc.title,
    docId: doc.id,
    chunks: doc.chunks || [],
    existingNodes: kgStore.schema.nodes || [],
    existingEdges: kgStore.schema.edges || [],
    discoveryGoal,
    searchPhrase,
    force,
  };

  let result;
  try {
    result = await kgServerExtract(payload);
  } catch {
    result = kgClientExtractForDocument(fullText, {
      docId: doc.id,
      title: doc.title,
      discoveryGoal,
      searchPhrase,
    });
  }

  const pending = kgPrepareReviewItems(result, doc);
  const emptyExtraction = !pending.nodes.length && !pending.edges.length;
  if (emptyExtraction && statusEl) {
    const hint = result.usedLlm
      ? "Try re-extract or add XAI_API_KEY for richer LLM extraction."
      : "Text was ingested but no entities matched — article may be thin or heavily paywalled.";
    statusEl.textContent = `No nodes/edges proposed for "${doc.title}" (${(fullText || "").length} chars). ${hint}`;
  }
  if (kgDocFromDiscover(doc) && (pending.nodes.length || pending.edges.length)) {
    for (const n of pending.nodes) n.status = "approved";
    for (const e of pending.edges) e.status = "approved";
    kgCascadeApproveEdges(pending);
  }
  doc.extractionStatus = "review";
  doc.contentHash = contentHash;
  doc.extractionMeta = {
    usedLlm: pending.usedLlm,
    method: pending.method,
    fallback: pending.fallback,
    extractVersion: result.extractVersion || pending.extractVersion || KG_EXTRACT_VERSION,
    at: new Date().toISOString(),
    sampledChars: result.sampledChars,
    extractMeta: result.extractMeta || null,
    ...(emptyExtraction ? { emptyExtraction: true } : {}),
  };

  kgSetExtractionProgress(result.extractMeta?.chunkTotal
    ? `Mapped ${result.extractMeta.chunkDone}/${result.extractMeta.chunkTotal} chunks — ready for review`
    : "Ready for review");

  if (kgReviewModeEnabled()) {
    const existingIdx = kgPendingReviewQueue.findIndex((p) => p.docId === pending.docId);
    if (existingIdx >= 0) kgPendingReviewQueue[existingIdx] = pending;
    else kgPendingReviewQueue.push(pending);
    kgPendingReview = pending;
    kgSyncPendingToStore();
    kgUpdateReviewTabBadge();
    kgRenderReviewPanel();
    kgRenderDocumentList();
    const qn = kgPendingReviewQueue.length;
    if (statusEl) {
      statusEl.textContent = `Review ${pending.nodes.length} nodes and ${pending.edges.length} edges from "${doc.title}"${qn > 1 ? ` (${qn} in queue)` : ""}.`;
    }
    if (pending.nodes.length || pending.edges.length) kgSetTab("review");
    else kgUpdateReviewTabBadge();
    return pending;
  }

  kgApplyApprovedExtraction(pending, { approveAll: true });
  if (statusEl) statusEl.textContent = `Added ${pending.nodes.length} nodes and ${pending.edges.length} edges from "${doc.title}".`;
  kgRenderDocumentList();
  return pending;
}

function kgEdgeConfidence(e) {
  return kgNormalizeConfidence(e?.confidence, 0.55);
}

function kgCascadeApproveEdges(pending) {
  if (!pending) return;
  const graphNodeIds = new Set((kgStore.schema.nodes || []).map((n) => n.id));
  const approvedNodeIds = new Set(
    (pending.nodes || [])
      .filter((n) => n.status === "approved")
      .map((n) => n.mergeTargetId || n.id),
  );
  for (const e of pending.edges || []) {
    if (e.status === "approved" || e.status === "rejected") continue;
    const src = e.source;
    const tgt = e.target;
    const srcOk = approvedNodeIds.has(src) || graphNodeIds.has(src);
    const tgtOk = approvedNodeIds.has(tgt) || graphNodeIds.has(tgt);
    if (srcOk && tgtOk && kgEdgeConfidence(e) >= KG_EDGE_CONFIDENT) e.status = "approved";
    else if (srcOk && tgtOk && e.autoApprove) e.status = "approved";
  }
}

function kgApplyApprovedExtraction(pending, { approveAll = false } = {}) {
  if (!pending) return { addedNodeIds: [], addedEdgeIds: [] };

  const doc = kgFindDocumentForPending(pending);
  const nodes = (pending.nodes || []).map((n) =>
    approveAll ? { ...n, status: "approved" } : n,
  );
  const edges = (pending.edges || []).map((e) =>
    approveAll ? { ...e, status: "approved" } : e,
  );
  pending.nodes = nodes;
  pending.edges = edges;
  if (!approveAll) kgCascadeApproveEdges(pending);

  const approvedNodes = nodes.filter((n) => n.status === "approved");
  let approvedEdges = edges.filter((e) => e.status === "approved");

  const entities = [];
  const entityIds = new Set((kgStore.schema.nodes || []).map((n) => n.id));
  for (const n of approvedNodes) {
    const targetId = n.mergeTargetId || n.id;
    const existing = (kgStore.schema.nodes || []).find((x) => x.id === targetId);
    entities.push({
      id: targetId,
      label: n.label || existing?.label || targetId,
      type: n.type || existing?.type || "entity",
      description: n.description || existing?.description || "",
      sourceDocId: n.sourceDocId || pending.docId,
    });
    entityIds.add(targetId);
  }

  const idMap = {};
  for (const n of approvedNodes) {
    idMap[n.id] = n.mergeTargetId || n.id;
    if (n.label) {
      idMap[n.label.toLowerCase()] = n.mergeTargetId || n.id;
      idMap[n.label] = n.mergeTargetId || n.id;
    }
  }
  for (const n of kgStore.schema.nodes || []) {
    idMap[n.id] = n.id;
    if (n.label) {
      idMap[n.label.toLowerCase()] = n.id;
      idMap[n.label] = n.id;
    }
  }

  const ensureEndpoint = (nodeId, fallbackLabel) => {
    const resolved = idMap[nodeId] || nodeId;
    if (entityIds.has(resolved)) return resolved;
    const existing = (kgStore.schema.nodes || []).find((x) => x.id === resolved);
    if (existing) {
      entityIds.add(resolved);
      return resolved;
    }
    entities.push({
      id: resolved,
      label: fallbackLabel || resolved,
      type: "entity",
      description: "",
      sourceDocId: pending.docId,
    });
    entityIds.add(resolved);
    idMap[nodeId] = resolved;
    return resolved;
  };

  const relationships = [];
  for (const e of approvedEdges) {
    const src = ensureEndpoint(e.source, e.sourceLabel || e.source);
    const tgt = ensureEndpoint(e.target, e.targetLabel || e.target);
    if (!src || !tgt || src === tgt) continue;
    relationships.push({
      id: kgRelEdgeId({ ...e, source: src, target: tgt }),
      source: src,
      target: tgt,
      label: e.label || "relates_to",
      description: e.description || "",
      sourceDocId: e.sourceDocId || pending.docId,
    });
  }

  const extracted = kgMergeGraphTracked(entities, relationships);

  if (doc) {
    doc.extractionStatus = "done";
    doc.extracted = {
      nodeIds: [...new Set([...(doc.extracted?.nodeIds || []), ...extracted.nodeIds])],
      edgeIds: [...new Set([...(doc.extracted?.edgeIds || []), ...extracted.edgeIds])],
      addedNodeIds: [...new Set([...(doc.extracted?.addedNodeIds || []), ...extracted.addedNodeIds])],
      addedEdgeIds: [...new Set([...(doc.extracted?.addedEdgeIds || []), ...extracted.addedEdgeIds])],
    };
    doc.extractionMeta = {
      ...(doc.extractionMeta || {}),
      approvedAt: new Date().toISOString(),
      approvedNodes: approvedNodes.length,
      approvedEdges: approvedEdges.length,
    };
  }

  kgPendingReviewQueue = kgPendingReviewQueue.filter((p) => p.docId !== pending.docId);
  if (kgPendingReview?.docId === pending.docId) {
    kgPendingReview = kgPendingReviewQueue[0] || null;
    kgRenderReviewPanel();
  }
  kgSyncPendingToStore();
  kgUpdateReviewTabBadge();

  kgSaveStore();
  kgRefreshGraph();
  kgRenderDocumentList();
  kgRenderIngestLog();
  return extracted;
}

function kgReviewFilterText() {
  return (kgEl("kg-review-filter")?.value || "").trim().toLowerCase();
}

function kgGetReviewVisibleItems() {
  const p = kgPendingReview;
  if (!p) return { showingNodes: true, items: [], visible: [] };
  const filter = kgReviewFilterText();
  const showingNodes = kgReviewView === "nodes";
  const labels = kgNodeLabelMap();
  let items = showingNodes ? (p.nodes || []).slice() : (p.edges || []).slice();

  if (showingNodes && kgReviewNeedsOnly) {
    items = items.filter((n) => kgNodeNeedsReview(n));
  } else if (showingNodes && kgReviewTypeFilter) {
    items = items.filter((n) => (n.type || "entity") === kgReviewTypeFilter);
  }

  if (filter) {
    items = items.filter((item) => {
      if (showingNodes) {
        const blob = `${item.label || ""} ${item.type || ""} ${item.description || ""} ${item.id || ""}`.toLowerCase();
        return blob.includes(filter);
      }
      const blob = `${item.source || ""} ${item.target || ""} ${item.label || ""} ${labels[item.source] || ""} ${labels[item.target] || ""} ${item.description || ""}`.toLowerCase();
      return blob.includes(filter);
    });
  }

  if (showingNodes) {
    items.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
  } else {
    items.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
  }

  return { showingNodes, items, visible: items };
}

function kgReviewStatusBadge(status) {
  const st = status || "pending";
  const stCls = st === "approved" ? "kg-badge" : st === "rejected" ? "kg-badge kg-badge--danger" : "kg-badge kg-badge--secondary";
  return `<span class="${stCls} kg-review-status">${kgEsc(st)}</span>`;
}

function kgRenderReviewPanel() {
  const panel = kgEl("kg-review-panel");
  if (!panel) return;

  if (!kgPendingReview) {
    if (kgTab === "review") {
      panel.hidden = false;
      const listEl = kgEl("kg-review-list");
      if (listEl) listEl.innerHTML = '<p class="mm-empty">No pending extractions. Ingest documents to populate this queue.</p>';
      const meta = kgEl("kg-review-meta");
      if (meta) meta.textContent = `${kgPendingReviewQueue.length} in queue`;
    } else {
      panel.hidden = true;
    }
    kgUpdateReviewTabBadge();
    return;
  }

  panel.hidden = false;
  const p = kgPendingReview;
  const meta = kgEl("kg-review-meta");
  const titleEl = kgEl("kg-review-doc-title");
  const reviewDoc = (kgStore.documents || []).find((d) => d.id === p.docId);
  const approvedN = p.nodes.filter((n) => n.status === "approved").length;
  const approvedE = p.edges.filter((e) => e.status === "approved").length;
  const extractVer = p.extractVersion || reviewDoc?.extractionMeta?.extractVersion || "—";

  if (meta) {
    const mode = p.method || (p.usedLlm ? "llm" : "rules");
    const fb = p.fallback ? " · local" : "";
    const goal = reviewDoc?.metadata?.discoveryGoal ? " · goal" : "";
    const qn = kgPendingReviewQueue.length;
    meta.textContent = `${approvedN}/${p.nodes.length} nodes · ${approvedE}/${p.edges.length} edges · ${mode}${goal}${fb} · v${extractVer}${qn > 1 ? ` · ${qn} queued` : ""}`;
  }
  if (titleEl) {
    const sp = reviewDoc?.metadata?.searchPhrase;
    titleEl.textContent = sp
      ? `From: ${p.docTitle} · search: “${sp}”`
      : `From: ${p.docTitle}`;
  }

  const statsEl = kgEl("kg-review-stats");
  if (statsEl) {
    const types = {};
    for (const n of p.nodes || []) {
      const t = n.type || "entity";
      types[t] = (types[t] || 0) + 1;
    }
    const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    const needsReview = (p.nodes || []).filter((n) => kgNodeNeedsReview(n)).length;
    statsEl.innerHTML = `
      <div class="kg-inv-stat"><strong>${p.nodes.length}</strong><span>Nodes</span></div>
      <div class="kg-inv-stat"><strong>${p.edges.length}</strong><span>Edges</span></div>
      <div class="kg-inv-stat"><strong>${approvedN}</strong><span>Approved N</span></div>
      <div class="kg-inv-stat"><strong>${approvedE}</strong><span>Approved E</span></div>
      <div class="kg-inv-stat"><strong>${needsReview}</strong><span>Needs review</span></div>
      ${topType ? `<div class="kg-inv-stat"><strong>${topType[1]}</strong><span>${kgEsc(topType[0])}</span></div>` : ""}`;
  }

  document.querySelectorAll("#kg-review-view .kg-inv-seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.reviewView === kgReviewView);
  });

  const typeBar = kgEl("kg-review-type-filters");
  if (typeBar) {
    if (kgReviewView === "nodes" && p.nodes.length) {
      const types = [...new Set(p.nodes.map((n) => n.type || "entity"))].sort();
      typeBar.innerHTML = `
        <button type="button" class="kg-inv-type-chip${!kgReviewNeedsOnly && kgReviewTypeFilter === "" ? " active" : ""}" data-review-type="">All types</button>
        <button type="button" class="kg-inv-type-chip kg-inv-type-chip--warn${kgReviewNeedsOnly ? " active" : ""}" data-review-needs="1">Needs review</button>
        ${types.map((t) => `
          <button type="button" class="kg-inv-type-chip${!kgReviewNeedsOnly && kgReviewTypeFilter === t ? " active" : ""}" data-review-type="${kgEsc(t)}">${kgEsc(t)}</button>`).join("")}`;
      typeBar.hidden = false;
    } else {
      typeBar.innerHTML = "";
      typeBar.hidden = true;
    }
  }

  const { showingNodes, items, visible } = kgGetReviewVisibleItems();
  const listEl = kgEl("kg-review-list");
  const foot = kgEl("kg-review-footnote");
  if (foot) {
    foot.textContent = visible.length < items.length
      ? `Showing ${visible.length} of ${items.length} — narrow with search or type filters.`
      : showingNodes
        ? "High-confidence types (≥80%) auto-approve. Use Needs review to fix person/org/concept mistakes — only those rows need edits."
        : "Approve edges after nodes — matching edges auto-approve when both endpoints are approved.";
  }

  if (!listEl) return;

  if (!visible.length) {
    listEl.innerHTML = `<p class="mm-empty">${kgReviewFilterText() || kgReviewTypeFilter || kgReviewNeedsOnly ? "No matches." : showingNodes ? "No nodes extracted." : "No edges extracted."}</p>`;
    return;
  }

  const labels = kgNodeLabelMap();
  if (showingNodes) {
    listEl.innerHTML = visible.map((n) => {
      const merge = n.mergeTargetId
        ? `<span class="kg-badge kg-badge--warn" title="Merges into existing node">→ ${kgEsc(n.mergeTargetId)}</span>`
        : n.isNew === false ? '<span class="kg-badge">existing</span>' : '<span class="kg-badge">new</span>';
      const typeOpts = KG_NODE_TYPES.map((t) =>
        `<option value="${t}" ${n.type === t ? "selected" : ""}>${t}</option>`).join("");
      return `<article class="kg-inv-card kg-review-card" data-review-kind="node" data-temp-id="${kgEsc(n.tempId)}" role="listitem">
        <div class="kg-inv-card-check"><input type="checkbox" class="kg-review-item-cb" data-kind="node" data-temp-id="${kgEsc(n.tempId)}" ${n.status === "approved" ? "checked" : ""} aria-label="Approve ${kgEsc(n.label || "")}"></div>
        <div class="kg-inv-card-body kg-review-card-body">
          <div class="kg-review-card-head">
            <input class="kg-review-input kg-review-input--label" data-field="label" data-temp-id="${kgEsc(n.tempId)}" value="${kgEsc(n.label || "")}" title="Node label">
            <select class="kg-review-select" data-field="type" data-temp-id="${kgEsc(n.tempId)}" title="Node type">${typeOpts}</select>
            ${kgTypeConfidenceBadge(n)}
            ${kgReviewStatusBadge(n.status)}
          </div>
          <input class="kg-review-input kg-review-input--desc" data-field="description" data-temp-id="${kgEsc(n.tempId)}" value="${kgEsc(n.description || "")}" placeholder="Description from source text…" title="Factual description">
          <div class="kg-inv-card-meta">${merge}${n.typeReason ? ` <span class="kg-review-type-reason" title="Type rationale">${kgEsc(n.typeReason)}</span>` : ""}</div>
        </div>
        <div class="kg-inv-card-actions">
          <button type="button" class="kg-btn kg-btn--secondary kg-review-approve-one" data-kind="node" data-temp-id="${kgEsc(n.tempId)}">✓</button>
          <button type="button" class="kg-btn kg-btn--danger kg-review-reject-one" data-kind="node" data-temp-id="${kgEsc(n.tempId)}">✕</button>
        </div>
      </article>`;
    }).join("");
  } else {
    listEl.innerHTML = visible.map((e) => `
      <article class="kg-inv-card kg-review-card" data-review-kind="edge" data-temp-id="${kgEsc(e.tempId)}" role="listitem">
        <div class="kg-inv-card-check"><input type="checkbox" class="kg-review-item-cb" data-kind="edge" data-temp-id="${kgEsc(e.tempId)}" ${e.status === "approved" ? "checked" : ""} aria-label="Approve edge"></div>
        <div class="kg-inv-card-body kg-review-card-body">
          <div class="kg-inv-edge-flow">
            <strong class="mono">${kgEsc(labels[e.source] || e.source)}</strong>
            <input class="kg-review-input kg-review-input--rel" data-field="label" data-temp-id="${kgEsc(e.tempId)}" value="${kgEsc(e.label || "")}" title="Relation">
            <strong class="mono">→ ${kgEsc(labels[e.target] || e.target)}</strong>
            ${kgReviewStatusBadge(e.status)}
          </div>
          <input class="kg-review-input kg-review-input--desc" data-field="description" data-temp-id="${kgEsc(e.tempId)}" value="${kgEsc(e.description || "")}" placeholder="Evidence from source…">
          <div class="kg-inv-card-meta">${kgTypeConfidenceBadge({ confidence: kgEdgeConfidence(e), typeReason: "edge confidence" })}</div>
        </div>
        <div class="kg-inv-card-actions">
          <button type="button" class="kg-btn kg-btn--secondary kg-review-approve-one" data-kind="edge" data-temp-id="${kgEsc(e.tempId)}">✓</button>
          <button type="button" class="kg-btn kg-btn--danger kg-review-reject-one" data-kind="edge" data-temp-id="${kgEsc(e.tempId)}">✕</button>
        </div>
      </article>`).join("");
  }
}

function kgReviewFindItem(kind, tempId) {
  if (!kgPendingReview) return null;
  const list = kind === "node" ? kgPendingReview.nodes : kgPendingReview.edges;
  return list.find((x) => x.tempId === tempId) || null;
}

function kgReviewSetStatus(kind, tempId, status) {
  const item = kgReviewFindItem(kind, tempId);
  if (!item) return;
  item.status = status;
  kgRenderReviewPanel();
}

function kgReviewSyncField(kind, tempId, field, value) {
  const item = kgReviewFindItem(kind, tempId);
  if (!item) return;
  item[field] = value;
}

async function kgReviewApplyToGraph() {
  if (!kgPendingReview) return;
  kgCascadeApproveEdges(kgPendingReview);
  const approvedN = kgPendingReview.nodes.filter((n) => n.status === "approved").length;
  const approvedE = kgPendingReview.edges.filter((e) => e.status === "approved").length;
  const status = kgEl("kg-ingest-status");
  if (!approvedN && !approvedE) {
    const ok = await kgConfirmDialog({
      title: "No entities approved",
      body: "<p>No nodes or edges are approved for this source.</p><p>Commit it to <strong>Documents</strong> anyway without adding graph entities?</p>",
      confirmLabel: "Commit source",
      danger: false,
    });
    if (!ok) return;
    const doc = kgCommitDocumentSkipped(kgPendingReview);
    const qn = kgPendingReviewQueue.length;
    if (status) {
      status.textContent = doc
        ? `Committed "${doc.title}" to Documents (no graph entities).${qn ? ` ${qn} more in review queue.` : ""}`
        : "Committed source to Documents.";
    }
    return;
  }
  kgApplyApprovedExtraction(kgPendingReview);
  const qn = kgPendingReviewQueue.length;
  if (status) {
    status.textContent = `Added ${approvedN} nodes and ${approvedE} edges to the graph.${qn ? ` ${qn} more in review queue — use Next.` : ""}`;
  }
}

function kgBindReviewPanelEvents() {
  const panel = kgEl("kg-review-panel");
  if (!panel || panel.dataset.bound === "1") return;
  panel.dataset.bound = "1";

  kgEl("kg-review-filter")?.addEventListener("input", () => kgRenderReviewPanel());

  kgEl("kg-review-view")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-review-view]");
    if (!btn) return;
    kgReviewView = btn.dataset.reviewView || "nodes";
    if (kgReviewView === "edges") {
      kgReviewTypeFilter = "";
      kgReviewNeedsOnly = false;
    }
    kgRenderReviewPanel();
  });

  kgEl("kg-review-type-filters")?.addEventListener("click", (e) => {
    const needsChip = e.target.closest("[data-review-needs]");
    if (needsChip) {
      kgReviewNeedsOnly = !kgReviewNeedsOnly;
      if (kgReviewNeedsOnly) kgReviewTypeFilter = "";
      kgRenderReviewPanel();
      return;
    }
    const chip = e.target.closest("[data-review-type]");
    if (!chip) return;
    kgReviewTypeFilter = chip.dataset.reviewType || "";
    kgReviewNeedsOnly = false;
    kgRenderReviewPanel();
  });

  panel.addEventListener("change", (e) => {
    const t = e.target;
    if (t.classList.contains("kg-review-item-cb")) {
      kgReviewSetStatus(t.dataset.kind, t.dataset.tempId, t.checked ? "approved" : "pending");
    }
  });

  panel.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.dataset?.field || !t.dataset?.tempId) return;
    const row = t.closest("[data-review-kind]");
    const kind = row?.dataset?.reviewKind;
    if (!kind) return;
    kgReviewSyncField(kind, t.dataset.tempId, t.dataset.field, t.value);
  });

  panel.addEventListener("click", (e) => {
    const approve = e.target.closest(".kg-review-approve-one");
    const reject = e.target.closest(".kg-review-reject-one");
    if (approve) {
      kgReviewSetStatus(approve.dataset.kind, approve.dataset.tempId, "approved");
      return;
    }
    if (reject) {
      kgReviewSetStatus(reject.dataset.kind, reject.dataset.tempId, "rejected");
    }
  });

  kgEl("kg-review-approve-confident")?.addEventListener("click", () => {
    if (!kgPendingReview) return;
    for (const n of kgPendingReview.nodes) {
      if (!kgNodeNeedsReview(n) && kgNodeTypeConfidence(n) >= KG_TYPE_CONFIDENT) {
        n.status = "approved";
      }
    }
    kgCascadeApproveEdges(kgPendingReview);
    kgSyncPendingToStore();
    kgRenderReviewPanel();
  });
  kgEl("kg-review-approve-all")?.addEventListener("click", () => {
    if (!kgPendingReview) return;
    for (const n of kgPendingReview.nodes) n.status = "approved";
    for (const e of kgPendingReview.edges) e.status = "approved";
    kgSyncPendingToStore();
    kgRenderReviewPanel();
  });
  kgEl("kg-review-reject-all")?.addEventListener("click", () => {
    if (!kgPendingReview) return;
    for (const n of kgPendingReview.nodes) n.status = "rejected";
    for (const e of kgPendingReview.edges) e.status = "rejected";
    kgRenderReviewPanel();
  });
  kgEl("kg-review-reject-low")?.addEventListener("click", () => {
    if (!kgPendingReview) return;
    for (const n of kgPendingReview.nodes) {
      if (kgNodeNeedsReview(n) || kgNodeTypeConfidence(n) < 0.5) n.status = "rejected";
    }
    for (const e of kgPendingReview.edges) {
      if (kgEdgeConfidence(e) < 0.5) e.status = "rejected";
    }
    kgRenderReviewPanel();
  });
  kgEl("kg-review-apply")?.addEventListener("click", () => {
    kgReviewApplyToGraph().catch(() => {});
  });
  kgEl("kg-review-dismiss")?.addEventListener("click", () => {
    if (!kgPendingReview) return;
    const doc = (kgStore.documents || []).find((d) => d.id === kgPendingReview.docId);
    if (doc) doc.extractionStatus = "review";
    kgPendingReviewQueue = kgPendingReviewQueue.filter((p) => p.docId !== kgPendingReview.docId);
    kgPendingReview = kgPendingReviewQueue[0] || null;
    kgSyncPendingToStore();
    kgUpdateReviewTabBadge();
    kgRenderReviewPanel();
  });
  kgEl("kg-review-next")?.addEventListener("click", () => {
    if (kgPendingReviewQueue.length < 2) return;
    const idx = kgPendingReviewQueue.findIndex((p) => p.docId === kgPendingReview?.docId);
    const next = kgPendingReviewQueue[(idx + 1) % kgPendingReviewQueue.length];
    kgPendingReview = next;
    kgRenderReviewPanel();
  });
}

function kgExistingSourceKeys() {
  const keys = new Set();
  for (const doc of kgStore.documents || []) {
    if (doc.sourceKey) keys.add(doc.sourceKey);
    if (doc.metadata?.sourceKey) keys.add(doc.metadata.sourceKey);
    if (doc.source) keys.add(doc.source.trim().toLowerCase());
  }
  return [...keys];
}


async function kgServerDiscover(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(KG_API_DISCOVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("Discovery timed out (120s)");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function kgDiscoverBadgeClass(badge, resultType) {
  const t = String(badge || "").toLowerCase();
  if (t === "web" || t === "page") return "kg-discover-badge--web";
  if (t === "video") return "kg-discover-badge--video";
  if (t === "image") return "kg-discover-badge--image";
  if (t === "news") return "kg-discover-badge--news";
  if (t === "fallback") return "kg-discover-badge--fallback";
  return "kg-discover-badge--phrase";
}

function kgRenderDiscoverBadges(c) {
  const badges = c.badges?.length ? c.badges : [c.resultType || "web"];
  const seen = new Set();
  return badges
    .filter((b) => {
      const k = String(b);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((b) => `<span class="kg-discover-badge ${kgDiscoverBadgeClass(b, c.resultType)}">${kgEsc(b)}</span>`)
    .join("");
}

function kgUpdateDiscoverMeta() {
  const meta = kgEl("kg-discover-meta");
  const p = kgPendingDiscover;
  if (!meta || !p) return;
  const st = p.stats || {};
  const approved = p.candidates.filter((c) => c.status === "approved").length;
  const llm = p.usedLlm ? "Grok plan" : "local plan";
  meta.textContent = `${p.candidates.length} results · ${approved} approved · ${st.searches ?? "?"} searches · ${llm}`;
}

function kgRenderDiscoverList() {
  const list = kgEl("kg-discover-list");
  const p = kgPendingDiscover;
  if (!list || !p?.candidates?.length) {
    if (list) list.innerHTML = "";
    return;
  }

  const selectable = p.candidates.filter((c) => c.status !== "rejected" && c.status !== "ingested");
  const approvedN = selectable.filter((c) => c.status === "approved").length;
  const pendingN = selectable.filter((c) => c.status === "pending").length;

  list.innerHTML = `
    <div class="kg-discover-list-toolbar">
      <label class="kg-discover-select-all"><input type="checkbox" id="kg-discover-all" title="Select all"> Select all</label>
    </div>
    ${p.candidates.map((c) => {
      const st = c.status || "pending";
      const stCls = st === "approved" ? "kg-badge" : st === "rejected" ? "kg-badge kg-badge--danger" : "kg-badge kg-badge--secondary";
      const thumb = c.imageUrl && c.resultType === "image"
        ? `<img class="kg-discover-thumb" src="${kgEsc(c.imageUrl)}" alt="" loading="lazy">`
        : "";
      return `
        <article class="kg-discover-card ${st === "rejected" ? "kg-discover-card--rejected" : ""}">
          <div class="kg-discover-card-head">
            <div class="kg-discover-card-check">
              <input type="checkbox" class="kg-discover-cb" data-id="${kgEsc(c.id)}" ${st === "approved" ? "checked" : ""} ${st === "rejected" ? "disabled" : ""}>
            </div>
            ${thumb}
            <div class="kg-discover-card-title">
              <a class="kg-discover-link" href="${kgEsc(c.url)}" target="_blank" rel="noopener noreferrer">${kgEsc(c.title || c.url)}</a>
              ${c.snippet ? `<p class="kg-discover-snippet">${kgEsc((c.snippet || "").slice(0, 240))}</p>` : ""}
              <div class="kg-discover-badges">${kgRenderDiscoverBadges(c)}</div>
            </div>
            <div class="kg-discover-card-actions">
              <button type="button" class="kg-btn kg-btn--secondary kg-discover-approve-one" data-id="${kgEsc(c.id)}" title="Approve">✓</button>
              <button type="button" class="kg-btn kg-btn--danger kg-discover-reject-one" data-id="${kgEsc(c.id)}" title="Reject">✕</button>
            </div>
          </div>
          <div class="kg-discover-card-meta">
            <span class="${stCls} kg-review-status">${kgEsc(st)}</span>
            ${c.engine === "fallback" ? '<span class="kg-badge kg-badge--warn">search fallback</span>' : ""}
          </div>
        </article>`;
    }).join("")}`;

  const allCb = kgEl("kg-discover-all");
  if (allCb) {
    allCb.checked = pendingN === 0 && approvedN > 0;
    allCb.indeterminate = approvedN > 0 && pendingN > 0;
  }
}

function kgRenderDiscoverPanel() {
  const panel = kgEl("kg-discover-panel");
  const planEl = kgEl("kg-discover-plan");
  if (!panel) return;

  if (!kgPendingDiscover?.candidates?.length) {
    panel.hidden = true;
    kgEl("kg-discover-list") && (kgEl("kg-discover-list").innerHTML = "");
    return;
  }

  panel.hidden = false;
  if (planEl) {
    const summary = kgPendingDiscover.plan?.summary || "";
    const phrases = (kgPendingDiscover.plan?.phrases || []).map((p) => p.phrase).filter(Boolean);
    if (summary || phrases.length) {
      planEl.hidden = false;
      planEl.innerHTML = `<strong>Search plan:</strong> ${kgEsc(summary)}${phrases.length ? `<span class="kg-discover-plan-phrases">${phrases.map((p) => `<span class="kg-discover-badge kg-discover-badge--phrase">${kgEsc(p)}</span>`).join("")}</span>` : ""}`;
    } else {
      planEl.hidden = true;
      planEl.textContent = "";
    }
  }
  kgUpdateDiscoverMeta();
  kgRenderDiscoverList();
}

function kgFindDiscoverCandidate(id) {
  return kgPendingDiscover?.candidates?.find((c) => c.id === id) || null;
}

function kgSetDiscoverCandidateStatus(id, status) {
  const c = kgFindDiscoverCandidate(id);
  if (!c) return;
  c.status = status;
  kgRenderDiscoverList();
  kgUpdateDiscoverMeta();
}

async function kgRunDiscover() {
  const goal = kgEl("kg-discover-goal")?.value?.trim() || "";
  const status = kgEl("kg-discover-status");
  const planEl = kgEl("kg-discover-plan");
  if (!goal) {
    if (status) status.textContent = "Describe your discovery goal first.";
    return;
  }
  if (status) status.textContent = "Grok is planning searches, then Google fetches results…";
  if (planEl) {
    planEl.hidden = true;
    planEl.textContent = "";
  }

  try {
    const result = await kgServerDiscover({
      goal,
      query: goal,
      prompt: goal,
      perType: 10,
      existingSourceKeys: kgExistingSourceKeys(),
    });
    const candidates = (result.candidates || []).map((c) => ({
      ...c,
      status: c.status || "pending",
    }));
    if (!candidates.length) {
      kgPendingDiscover = null;
      kgRenderDiscoverPanel();
      const st = result.stats || {};
      if (status) {
        status.textContent = `No results (${st.searches ?? 0} searches). Try a more specific goal or set GOOGLE_API_KEY + GOOGLE_CSE_ID.`;
      }
      return;
    }
    kgPendingDiscover = {
      goal: result.goal || goal,
      plan: result.plan || {},
      candidates,
      usedLlm: Boolean(result.usedLlm),
      stats: result.stats || {},
    };
    kgRenderDiscoverPanel();
    if (status) {
      status.textContent = `Found ${candidates.length} result(s) from ${result.stats?.searches ?? "?"} Google searches. Approve, then Ingest approved.`;
    }
  } catch (err) {
    kgPendingDiscover = null;
    kgRenderDiscoverPanel();
    const msg = err?.message || "Unknown error";
    const hint = /missing search query/i.test(msg)
      ? " Restart the server (python3 server.py) or deploy the latest API — this build expects a discovery goal, not the old query field."
      : "";
    if (status) status.textContent = `Discover failed: ${msg}${hint}`;
  }
}

async function kgIngestApprovedDiscover() {
  if (kgIngestBusy) {
    const ingestStatus = kgEl("kg-ingest-status");
    if (ingestStatus) ingestStatus.textContent = "Ingest already in progress…";
    return;
  }
  if (!kgPendingDiscover?.candidates?.length) {
    const status = kgEl("kg-discover-status");
    if (status) status.textContent = "No discovery results — run Discover sources first.";
    return;
  }
  const approved = kgPendingDiscover.candidates.filter((c) => c.status === "approved");
  if (!approved.length) {
    const status = kgEl("kg-discover-status");
    if (status) status.textContent = "Approve at least one candidate first.";
    return;
  }

  const status = kgEl("kg-discover-status");
  const ingestStatus = kgEl("kg-ingest-status");
  let ok = 0;
  let failed = 0;
  kgSetIngestBusy(true);
  try {
  for (let i = 0; i < approved.length; i++) {
    const item = approved[i];
    const url = item.url?.trim();
    if (!url) continue;
    const preKey = kgSourceKey({ url });
    if (preKey && kgFindDocumentBySource(preKey)) {
      item.status = "rejected";
      continue;
    }
    if (status) status.textContent = `Ingesting ${i + 1}/${approved.length}: ${item.title || url}…`;
    if (ingestStatus) ingestStatus.textContent = status.textContent;

    try {
      let result;
      if (item.resultType === "image") {
        const note = `Image reference: ${item.title || "Image"}\nURL: ${url}\nSearch phrase: ${item.searchPhrase || ""}`;
        result = await kgClientIngest({
          type: "text",
          url: "",
          text: note,
          title: item.title || "Image reference",
          file: null,
        });
      } else {
        const type = /youtube\.com|youtu\.be/i.test(url) ? "youtube" : "url";
        result = await kgClientIngest({
          type,
          url,
          title: item.title || "",
          file: null,
        });
      }
      const sourceKey = result.metadata?.sourceKey || kgSourceKey({ url, result });
      const docId = kgUid("doc");
      const doc = {
        id: docId,
        title: result.title || item.title || url,
        type: result.metadata?.type || item.resultType || "url",
        source: result.metadata?.source || url,
        sourceKey,
        chunks: result.chunks || [],
        segments: result.segments || [],
        metadata: {
          ...result.metadata,
          discoverType: item.resultType,
          searchPhrase: item.searchPhrase || "",
          discoveryGoal: kgPendingDiscover?.goal || "",
        },
        fullText: result.text || "",
        textPreview: (result.text || "").slice(0, 400),
        ingestedAt: new Date().toISOString(),
        extractionStatus: "pending",
        extracted: { nodeIds: [], edgeIds: [], addedNodeIds: [], addedEdgeIds: [] },
      };
      kgStore.documents.push(doc);
      kgStore.ingestLog.push({
        title: doc.title,
        type: doc.type,
        chunks: (doc.chunks || []).length,
        entities: 0,
        fallback: Boolean(result.metadata?.fallback),
        docId,
        at: new Date().toISOString(),
      });

      try {
        const pending = await kgRunExtractForDoc(doc, { statusEl: ingestStatus || status });
        if (pending) {
          const logRow = kgStore.ingestLog[kgStore.ingestLog.length - 1];
          if (logRow) logRow.entities = pending.nodes.length;
        }
      } catch (err) {
        doc.extractionStatus = "failed";
        if (ingestStatus) ingestStatus.textContent = `Ingested but extraction failed: ${err.message}`;
      }
      item.status = "ingested";
      ok += 1;
    } catch (err) {
      failed += 1;
      const msg = `Failed on "${item.title || url}": ${kgIngestErrorMessage(err)}`;
      if (status) status.textContent = msg;
      if (ingestStatus) ingestStatus.textContent = msg;
    }
  }
  } finally {
    kgSetIngestBusy(false);
  }

  kgPendingDiscover.candidates = kgPendingDiscover.candidates.filter(
    (c) => c.status !== "ingested" && c.status !== "rejected",
  );
  if (!kgPendingDiscover.candidates.length) kgPendingDiscover = null;

  kgSaveStore();
  kgRefreshGraph();
  kgRenderIngestLog();
  kgRenderDocumentList();
  kgRenderDiscoverPanel();
  const qn = kgPendingReviewQueue.length;
  if (status) {
    if (ok) {
      status.textContent = `Ingested ${ok} source(s).${qn ? ` ${qn} in extraction review${qn > 1 ? " — use Next between sources" : ""}.` : ""}${failed ? ` (${failed} failed)` : ""}`;
    } else if (failed) {
      status.textContent = `No sources ingested (${failed} failed). Check status above and retry.`;
    } else {
      status.textContent = "No sources ingested — duplicates were skipped or already ingested.";
    }
  }
  if (ingestStatus) {
    ingestStatus.textContent = status?.textContent || ingestStatus.textContent || "";
  }
  if (ok && kgPendingReview) {
    kgEl("kg-review-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (kgDocFromDiscover((kgStore.documents || []).find((d) => d.id === kgPendingReview.docId))) {
      const preApproved = kgPendingReview.nodes.every((n) => n.status === "approved")
        && (!kgPendingReview.edges.length || kgPendingReview.edges.every((e) => e.status === "approved"));
      if (preApproved && ingestStatus) {
        ingestStatus.textContent += " Discovery sources are pre-approved — click Add approved to graph.";
      }
    }
  }
}

function kgBindDiscoverPanelEvents() {
  kgEl("kg-run-discover")?.addEventListener("click", () => kgRunDiscover().catch(() => {}));
  kgEl("kg-discover-approve-all")?.addEventListener("click", () => {
    if (!kgPendingDiscover) return;
    for (const c of kgPendingDiscover.candidates) {
      if (c.status !== "rejected" && c.status !== "ingested") c.status = "approved";
    }
    kgRenderDiscoverList();
    kgUpdateDiscoverMeta();
  });
  kgEl("kg-discover-reject-all")?.addEventListener("click", () => {
    if (!kgPendingDiscover) return;
    for (const c of kgPendingDiscover.candidates) {
      if (c.status !== "ingested") c.status = "rejected";
    }
    kgRenderDiscoverPanel();
  });
  kgEl("kg-discover-ingest")?.addEventListener("click", () => {
    kgIngestApprovedDiscover().catch((err) => {
      kgSetIngestBusy(false);
      const status = kgEl("kg-discover-status");
      const ingestStatus = kgEl("kg-ingest-status");
      const msg = `Discover ingest failed: ${kgIngestErrorMessage(err)}`;
      if (status) status.textContent = msg;
      if (ingestStatus) ingestStatus.textContent = msg;
    });
  });
  kgEl("kg-discover-dismiss")?.addEventListener("click", () => {
    kgPendingDiscover = null;
    kgRenderDiscoverPanel();
    const status = kgEl("kg-discover-status");
    if (status) status.textContent = "";
  });

  const list = kgEl("kg-discover-list");
  list?.addEventListener("click", (e) => {
    const t = e.target;
    if (t.id === "kg-discover-all") {
      if (!kgPendingDiscover) return;
      for (const c of kgPendingDiscover.candidates) {
        if (c.status !== "rejected" && c.status !== "ingested") {
          c.status = t.checked ? "approved" : "pending";
        }
      }
      kgRenderDiscoverList();
      kgUpdateDiscoverMeta();
      return;
    }
    if (t.classList.contains("kg-discover-cb")) {
      kgSetDiscoverCandidateStatus(t.dataset.id, t.checked ? "approved" : "pending");
      return;
    }
    const approve = e.target.closest(".kg-discover-approve-one");
    const reject = e.target.closest(".kg-discover-reject-one");
    if (approve) kgSetDiscoverCandidateStatus(approve.dataset.id, "approved");
    else if (reject) kgSetDiscoverCandidateStatus(reject.dataset.id, "rejected");
  });
}

function kgMergeGraphTracked(entities, relationships) {
  const beforeNodes = new Set((kgStore.schema.nodes || []).map((n) => n.id));
  const beforeEdges = new Set((kgStore.schema.edges || []).map((e) => kgEdgeKey(e)));
  const byId = Object.fromEntries((kgStore.schema.nodes || []).map((n) => [n.id, n]));

  const appendSource = (item, docId, title) => {
    if (!docId) return item;
    const sources = [...(item.sources || [])];
    if (!sources.some((s) => s.docId === docId)) {
      sources.push({ docId, title: title || docId, extractedAt: new Date().toISOString() });
    }
    return { ...item, sources, sourceDocId: docId };
  };

  for (const ent of entities || []) {
    if (!ent?.id) continue;
    const merged = appendSource(ent, ent.sourceDocId, ent.sourceTitle);
    const prev = byId[ent.id] || {};
    byId[ent.id] = {
      ...prev,
      ...merged,
      sources: [...(prev.sources || []), ...(merged.sources || [])].filter(
        (s, i, arr) => arr.findIndex((x) => x.docId === s.docId) === i,
      ),
    };
  }
  kgStore.schema.nodes = Object.values(byId);

  const edgeKeys = new Set((kgStore.schema.edges || []).map((e) => kgEdgeKey(e)));
  for (const rel of relationships || []) {
    const key = kgRelEdgeId(rel);
    if (!edgeKeys.has(key)) {
      const withSrc = appendSource(rel, rel.sourceDocId, rel.sourceTitle);
      kgStore.schema.edges.push({ ...withSrc, id: key });
      edgeKeys.add(key);
    } else {
      const idx = kgStore.schema.edges.findIndex((e) => kgEdgeKey(e) === key);
      if (idx >= 0) {
        const prev = kgStore.schema.edges[idx];
        const merged = appendSource(rel, rel.sourceDocId, rel.sourceTitle);
        kgStore.schema.edges[idx] = {
          ...prev,
          ...merged,
          sources: [...(prev.sources || []), ...(merged.sources || [])].filter(
            (s, i, arr) => arr.findIndex((x) => x.docId === s.docId) === i,
          ),
        };
      }
    }
  }

  const addedNodeIds = (entities || []).map((e) => e.id).filter((id) => id && !beforeNodes.has(id));
  const addedEdgeIds = (relationships || [])
    .map((r) => kgRelEdgeId(r))
    .filter((id) => id && !beforeEdges.has(id));
  const touchedNodeIds = (entities || []).map((e) => e.id).filter(Boolean);
  const touchedEdgeIds = (relationships || [])
    .map((r) => kgRelEdgeId(r))
    .filter(Boolean);

  return {
    addedNodeIds,
    addedEdgeIds,
    nodeIds: [...new Set(touchedNodeIds)],
    edgeIds: [...new Set(touchedEdgeIds)],
  };
}

function kgCatalogEntry(label) {
  const ident = kgResolveEntityIdentity(label);
  if (ident) return [ident.canonical, ident.type, ""];
  const low = String(label || "").trim().toLowerCase();
  return KG_ENTITY_CATALOG[low] || null;
}

function kgInferNodeType(label) {
  const entry = kgCatalogEntry(label);
  if (entry) return entry[1];
  const low = String(label || "").toLowerCase();
  if (/\bstablecoin\b|usdt|usdc|dai\b/i.test(low)) return "stablecoin";
  if (/\betf\b|exchange-traded|spot\s+(?:bitcoin|btc)\s+fund/i.test(low)) return "product";
  if (/\bfutures\b|\boptions\b|\bperpetual\b/i.test(low)) return "derivative";
  if (/hash\s*rate|hashrate|\bsopr\b|\bmvrv\b|puell|vdd|active\s+address|exchange\s+(?:inflow|outflow)/i.test(low)) return "metric";
  if (/\bdxy\b|s&p|nasdaq|vix\b/i.test(low)) return "market_index";
  if (/\bcpi\b|\bppi\b|unemployment|pmi\b|\bgdp\b|interest\s+rates?|inflation/i.test(low)) return "indicator";
  if (/rate\s+(?:cut|hike|hold)|fomc|quantitative\s+easing|\bqe\b/i.test(low)) return "policy";
  if (/\bact\b|\bbill\b|executive\s+order/i.test(low)) return "legal_instrument";
  if (/regulat|approval|approved|framework/i.test(low)) return "regulation";
  if (/halving|fork|launch|conference|summit|meeting/i.test(low)) return "event";
  if (/lightning|layer\s*2|protocol/i.test(low)) return "protocol";
  if (/united states|european union|\beu\b|jurisdiction/i.test(low)) return "jurisdiction";
  if (/^\$[\d,]+/.test(label || "")) return "price_level";
  if (/\b(sec|cftc|treasury|federal reserve|fed|ecb)\b/i.test(low)) return "government_body";
  if (/\b(blackrock|grayscale|fidelity|coinbase|binance|exchange|bank)\b/i.test(low)) return "financial_institution";
  if (/\b(inc|llc|corp|fund|committee)\b/i.test(low)) return "org";
  if (/\b(bitcoin|btc|ethereum|eth)\b/i.test(low)) return "asset";
  return "entity";
}

function kgExtractContextDescription(label, text, ntype = "entity") {
  if (!label || !text) return "";
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`[^.!?\\n]{0,180}\\b${esc}\\b[^.!?\\n]{0,180}[.!?]?`, "i"));
  if (m && m[0].trim().length >= 16) return m[0].replace(/\s+/g, " ").trim().slice(0, 500);
  const entry = kgCatalogEntry(label);
  if (entry?.[2]) return entry[2];
  return `${label} — referenced in source document`;
}

function kgEnrichExtractedNode(raw, text) {
  const entry = kgCatalogEntry(raw.label);
  const label = entry ? entry[0] : String(raw.label || "").trim();
  if (!label || label.length < 2 || label.length > 72) return null;
  const type = kgInferNodeType(label);
  let description = String(raw.description || "").trim();
  if (!description || description.length < 12) {
    description = kgExtractContextDescription(label, text, type);
  }
  return { ...raw, label, type, description };
}

function kgClientExtract(text, { discoveryGoal = "", searchPhrase = "" } = {}) {
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const nodes = {};
  const edges = [];
  const edgeKeys = new Set();

  const addNode = (label) => {
    const enriched = kgEnrichExtractedNode({ label }, text);
    if (!enriched) return null;
    const id = slug(enriched.label);
    if (!id) return null;
    if (!nodes[id]) nodes[id] = { id, ...enriched };
    return id;
  };
  const addEdge = (src, tgt, label = "relates_to") => {
    if (!src || !tgt || src === tgt) return;
    const key = `${src}->${tgt}:${label}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ id: `${src}->${tgt}`, source: src, target: tgt, label });
  };

  const btcTerms = [
    "bitcoin", "btc", "etf", "halving", "mining", "fed", "sec", "regulation",
    "exchange", "inflation", "hashrate", "hash rate", "sopr", "mvrv", "blackrock",
    "grayscale", "fidelity", "coinbase", "cpi", "dxy", "fomc",
  ];
  for (const term of btcTerms) {
    if (new RegExp(`\\b${term.replace(/\s+/g, "\\s*")}\\b`, "i").test(text)) {
      const entry = kgCatalogEntry(term);
      addNode(entry ? entry[0] : term);
    }
  }

  const patterns = [
    [/(\b(?:Bitcoin|BTC)\b).{0,120}?\b(ETF|halving|mining|regulation|hash\s*rate|hashrate)\b/gi, "relates_to"],
    [/\b(Federal Reserve|Fed)\b.{0,100}?\b(rates?|interest rates?)\b/gi, "sets"],
    [/\b(rates?|interest rates?)\b.{0,100}?\b(Bitcoin|BTC)\b/gi, "influences"],
    [/\b(SEC)\b.{0,100}?\b(ETF|Bitcoin ETF|spot ETF)\b/gi, "approved"],
    [/\b(BlackRock|Fidelity|Grayscale)\b.{0,100}?\b(ETF|Bitcoin ETF)\b/gi, "issues"],
    [/\b(ETF)\b.{0,80}?\b(Bitcoin|BTC)\b/gi, "tracks"],
    [/\b(mining|miners?)\b.{0,80}?\b(hash\s*rate|hashrate)\b/gi, "measured_by"],
  ];
  for (const [re, label] of patterns) {
    for (const m of text.matchAll(re)) {
      const a = addNode(m[1]);
      const b = addNode(m[2]);
      addEdge(a, b, label);
    }
  }

  const sentences = text.split(/[.!?\n]+/);
  const nodeIds = Object.keys(nodes);
  for (const sent of sentences) {
    if (sent.trim().length < 24) continue;
    const present = nodeIds.filter((id) => {
      const lbl = nodes[id].label;
      return new RegExp(`\\b${lbl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sent);
    });
    if (present.length < 2) continue;
    const hub = present[0];
    for (const other of present.slice(1, 3)) addEdge(hub, other, "mentioned_with");
    if (edges.length >= 30) break;
  }

  for (const gt of kgGoalKeywords(discoveryGoal, searchPhrase)) {
    if (gt.length < 4) continue;
    const re = new RegExp(`\\b${gt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!re.test(text)) continue;
    const label = gt.includes(" ") ? gt.replace(/\b\w/g, (c) => c.toUpperCase()) : gt.charAt(0).toUpperCase() + gt.slice(1);
    addNode(label);
  }

  let entities = Object.values(nodes);
  const entityCap = 3;
  let entityCount = 0;
  entities = entities.filter((n) => {
    if (n.type !== "entity") return true;
    entityCount += 1;
    return entityCount <= entityCap;
  });

  return { entities, relationships: edges };
}

async function kgServerIngest(payload) {
  const res = await fetch(KG_API_INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skipExtract: true, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function kgClientParseTranscript(raw) {
  const segments = [];
  const blocks = raw.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [start, end] = timeLine.split("-->").map((s) => s.trim());
    const text = lines.filter((l) => l !== timeLine && !/^\d+$/.test(l)).join(" ");
    if (text) segments.push({ start, end, text });
  }
  return { text: segments.map((s) => s.text).join("\n"), segments };
}

async function kgClientIngest({ type, url, text, title, file }) {
  if (type === "media") {
    throw new Error("Audio/video requires an SRT/VTT transcript or pasted text — speech-to-text is not enabled.");
  }

  let body = { type, url, text, title, filename: file?.name || "" };
  if (file && type === "pdf") {
    if (file.size > 12 * 1024 * 1024) throw new Error("PDF exceeds 12MB limit");
    body.base64 = await kgFileToBase64(file);
  } else if (file && (type === "transcript" || type === "text" || type === "markdown")) {
    body.text = await kgReadTextFile(file);
  } else if (file) {
    body.text = await kgReadTextFile(file);
  }

  try {
    return await kgServerIngest(body);
  } catch (err) {
    const raw = body.text || text || "";
    if (url && !raw) {
      throw new Error(
        `${err?.message || "Server ingest failed"} — article URLs must be fetched by the server (python3 server.py). Browser fallback cannot download page text.`,
      );
    }
    if (!raw && !url) throw err;

    let segments = [];
    let chunks = [];
    if (type === "transcript" && raw) {
      const parsed = kgClientParseTranscript(raw);
      segments = parsed.segments;
      let buf = "";
      let bufStart = null;
      let bufEnd = null;
      for (const seg of segments) {
        const line = seg.text;
        if (buf && buf.length + line.length > 900) {
          chunks.push({ text: buf.trim(), timestamp: bufStart, end: bufEnd });
          buf = line;
          bufStart = seg.start;
          bufEnd = seg.end;
        } else {
          if (!buf) bufStart = seg.start;
          buf = buf ? `${buf} ${line}` : line;
          bufEnd = seg.end;
        }
      }
      if (buf) chunks.push({ text: buf.trim(), timestamp: bufStart, end: bufEnd });
    } else {
      for (let i = 0; i < raw.length; i += 900) {
        chunks.push({ text: raw.slice(i, i + 900), offset: i });
      }
    }

    const source = url || file?.name || "paste";
    return {
      title: title || file?.name || url || "Document",
      text: raw,
      chunks,
      segments,
      metadata: {
        type,
        source,
        sourceKey: kgSourceKey({ url, text: raw, file }),
        ingestedAt: new Date().toISOString(),
        fallback: true,
      },
      entities: [],
      relationships: [],
    };
  }
}

function kgIsSchemaVisible() {
  const panel = document.querySelector('.kg-tab-panel[data-kg-tab="schema"]');
  return Boolean(panel && !panel.hidden);
}

const KG_GRAPH_ACCENT = "#f0b90b";

const KG_TYPE_VIS = {
  asset: { bg: "#261a30", bgHi: "#352445", border: "#e879f9", glow: "rgba(232, 121, 249, 0.42)", shape: "diamond" },
  concept: { bg: "#152238", bgHi: "#1c2d4a", border: "#60a5fa", glow: "rgba(96, 165, 250, 0.38)", shape: "ellipse" },
  org: { bg: "#132820", bgHi: "#1a352c", border: "#34d399", glow: "rgba(52, 211, 153, 0.36)", shape: "box" },
  event: { bg: "#2a2418", bgHi: "#3a321f", border: "#f0b90b", glow: "rgba(240, 185, 11, 0.4)", shape: "diamond" },
  product: { bg: "#1c1f38", bgHi: "#252a4a", border: "#818cf8", glow: "rgba(129, 140, 248, 0.36)", shape: "box" },
  price_level: { bg: "#122a28", bgHi: "#183836", border: "#2dd4bf", glow: "rgba(45, 212, 191, 0.34)", shape: "dot" },
  metric: { bg: "#2a1824", bgHi: "#3a2130", border: "#f472b6", glow: "rgba(244, 114, 182, 0.34)", shape: "ellipse" },
  indicator: { bg: "#152238", bgHi: "#1c2d4a", border: "#38bdf8", glow: "rgba(56, 189, 248, 0.34)", shape: "ellipse" },
  market_index: { bg: "#122430", bgHi: "#183040", border: "#38bdf8", glow: "rgba(56, 189, 248, 0.34)", shape: "triangle" },
  policy: { bg: "#221a35", bgHi: "#2d2345", border: "#a78bfa", glow: "rgba(167, 139, 250, 0.36)", shape: "hexagon" },
  regulation: { bg: "#2a1e14", bgHi: "#3a291c", border: "#fb923c", glow: "rgba(251, 146, 60, 0.34)", shape: "hexagon" },
  legal_instrument: { bg: "#2a2218", bgHi: "#3a2f22", border: "#fdba74", glow: "rgba(253, 186, 116, 0.32)", shape: "box" },
  protocol: { bg: "#122a30", bgHi: "#183840", border: "#22d3ee", glow: "rgba(34, 211, 238, 0.36)", shape: "hexagon" },
  person: { bg: "#2a2818", bgHi: "#3a3722", border: "#facc15", glow: "rgba(250, 204, 21, 0.34)", shape: "dot" },
  financial_institution: { bg: "#122a28", bgHi: "#183836", border: "#2dd4bf", glow: "rgba(45, 212, 191, 0.34)", shape: "box" },
  government_body: { bg: "#142818", bgHi: "#1a3520", border: "#4ade80", glow: "rgba(74, 222, 128, 0.34)", shape: "box" },
  derivative: { bg: "#221a30", bgHi: "#2d2340", border: "#c084fc", glow: "rgba(192, 132, 252, 0.36)", shape: "triangle" },
  stablecoin: { bg: "#122830", bgHi: "#183840", border: "#67e8f9", glow: "rgba(103, 232, 249, 0.34)", shape: "dot" },
  jurisdiction: { bg: "#1e2814", bgHi: "#28361a", border: "#a3e635", glow: "rgba(163, 230, 53, 0.32)", shape: "hexagon" },
  entity: { bg: "#1a1f2b", bgHi: "#242b3a", border: "#7d8799", glow: "rgba(125, 135, 153, 0.28)", shape: "dot" },
};

function kgTypeVis(type) {
  return KG_TYPE_VIS[type] || KG_TYPE_VIS.entity;
}

function kgNodeVisColor(type, { dimmed = false, selected = false } = {}) {
  const s = kgTypeVis(type);
  if (dimmed) {
    return {
      background: "#141820",
      border: "#2a3142",
      highlight: { background: s.bgHi, border: KG_GRAPH_ACCENT },
      hover: { background: s.bgHi, border: s.border },
    };
  }
  const border = selected ? KG_GRAPH_ACCENT : s.border;
  const background = selected ? s.bgHi : s.bg;
  return {
    background,
    border,
    highlight: { background: s.bgHi, border: KG_GRAPH_ACCENT },
    hover: { background: s.bgHi, border: KG_GRAPH_ACCENT },
  };
}

function kgNodeVisSize(degree, { large = false } = {}) {
  const base = large ? 16 : 12;
  const hub = Math.min(Math.max(degree - 1, 0) * 1.8, 14);
  return base + hub;
}

function kgBuildVisNode(n, { large = false, dimmed = false, selected = false, degree = null } = {}) {
  const type = n.type || "entity";
  const vis = kgTypeVis(type);
  const deg = degree ?? kgNodeDegree(n.id);
  const size = kgNodeVisSize(deg, { large });
  const desc = n.description ? `\n${n.description}` : "";
  return {
    id: n.id,
    label: n.label || n.id,
    title: `${type} · ${n.label || n.id}${desc}`,
    shape: vis.shape,
    size,
    color: kgNodeVisColor(type, { dimmed, selected }),
    borderWidth: selected ? 3 : dimmed ? 1 : 2,
    borderWidthSelected: 3,
    shadow: dimmed
      ? { enabled: false }
      : {
          enabled: true,
          color: vis.glow,
          size: large ? Math.min(8 + deg * 1.2, 18) : 6,
          x: 0,
          y: 0,
        },
    font: {
      color: dimmed ? "#5a6270" : "#e8ecf4",
      size: large ? (deg >= 4 ? 13 : 12) : 11,
      face: "IBM Plex Sans, system-ui, sans-serif",
      background: "rgba(11, 14, 17, 0.78)",
      strokeWidth: 0,
    },
  };
}

function kgBuildVisEdge(e, { showLabels = true, dimmed = false, emphasized = false } = {}) {
  const label = showLabels ? (e.label || "") : "";
  const baseColor = dimmed ? "#252b38" : "#3d4a5c";
  const hoverColor = dimmed ? "#4a5568" : KG_GRAPH_ACCENT;
  return {
    id: kgEdgeKey(e),
    from: e.source,
    to: e.target,
    label,
    arrows: { to: { enabled: true, scaleFactor: emphasized ? 0.85 : 0.65, type: "arrow" } },
    font: {
      color: dimmed ? "#4a5568" : "#8b95a8",
      size: 10,
      align: "middle",
      background: "rgba(11, 14, 17, 0.72)",
      strokeWidth: 0,
      face: "IBM Plex Sans, system-ui, sans-serif",
    },
    color: {
      color: emphasized ? "#6b7a90" : baseColor,
      highlight: hoverColor,
      hover: hoverColor,
      opacity: dimmed ? 0.35 : emphasized ? 0.92 : 0.72,
    },
    width: emphasized ? 2.25 : dimmed ? 0.75 : 1.25,
    smooth: { type: "continuous", roundness: 0.22 },
  };
}

function kgNodeLabelMap() {
  return Object.fromEntries(
    (kgStore.schema.nodes || []).map((n) => [n.id, n.label || n.id]),
  );
}

function kgVisNodeItems({ large = false, dimNodeIds = null, selectedId = null } = {}) {
  const dimSet = dimNodeIds instanceof Set ? dimNodeIds : null;
  return (kgStore.schema.nodes || []).map((n) =>
    kgBuildVisNode(n, {
      large,
      dimmed: dimSet ? !dimSet.has(n.id) : false,
      selected: selectedId === n.id,
    }),
  );
}

function kgVisEdgeItems(nodeIds, { showLabels = true, dimEdgeIds = null, emphasizeEdgeIds = null } = {}) {
  const ids = nodeIds || new Set((kgStore.schema.nodes || []).map((n) => n.id));
  const dimSet = dimEdgeIds instanceof Set ? dimEdgeIds : null;
  const emphSet = emphasizeEdgeIds instanceof Set ? emphasizeEdgeIds : null;
  return (kgStore.schema.edges || [])
    .filter((e) => e.source && e.target && ids.has(e.source) && ids.has(e.target))
    .map((e) => {
      const id = kgEdgeKey(e);
      return kgBuildVisEdge(e, {
        showLabels,
        dimmed: dimSet ? dimSet.has(id) : false,
        emphasized: emphSet ? emphSet.has(id) : false,
      });
    });
}

function kgGraphOptions(nodeCount, { physics = null } = {}) {
  const usePhysics = physics ?? nodeCount < 120;
  const dense = nodeCount > 80;
  return {
    autoResize: true,
    layout: { improvedLayout: nodeCount > 0 && nodeCount <= 80 },
    physics: {
      enabled: usePhysics,
      stabilization: {
        enabled: true,
        iterations: dense ? 90 : 160,
        fit: true,
        updateInterval: 25,
      },
      barnesHut: {
        gravitationalConstant: dense ? -5200 : -8800,
        centralGravity: 0.12,
        springLength: dense ? 110 : 155,
        springConstant: 0.045,
        damping: 0.52,
        avoidOverlap: 0.18,
      },
    },
    interaction: {
      hover: true,
      hoverConnectedEdges: true,
      multiselect: false,
      navigationButtons: false,
      keyboard: true,
      tooltipDelay: 120,
      zoomView: true,
      dragView: true,
    },
    edges: {
      smooth: { enabled: true, type: "continuous", roundness: 0.22 },
      selectionWidth: 2,
    },
    nodes: {
      borderWidth: 2,
      borderWidthSelected: 3,
      chosen: {
        node(values) {
          values.borderWidth = 3;
          values.shadow = true;
          values.shadowSize = 16;
        },
        edge(values) {
          values.width = 2.5;
        },
      },
    },
  };
}

function kgApplyGraphHover(network, nodesDs, edgesDs, hoverNodeId) {
  if (!network || !nodesDs || !edgesDs) return;
  if (!hoverNodeId) {
    kgSyncNetworkData(nodesDs, edgesDs, { large: true, showLabels: kgFullShowLabels });
    return;
  }
  const focus = new Set([hoverNodeId, ...network.getConnectedNodes(hoverNodeId)]);
  const edgeFocus = new Set(network.getConnectedEdges(hoverNodeId));
  const allEdgeIds = new Set((kgStore.schema.edges || []).map((e) => kgEdgeKey(e)));
  const dimEdges = new Set([...allEdgeIds].filter((id) => !edgeFocus.has(id)));
  const nodeItems = kgVisNodeItems({ large: true, dimNodeIds: focus, selectedId: hoverNodeId });
  const nodeIds = new Set(nodeItems.map((n) => n.id));
  const edgeItems = kgVisEdgeItems(nodeIds, {
    showLabels: kgFullShowLabels,
    dimEdgeIds: dimEdges,
    emphasizeEdgeIds: edgeFocus,
  });
  nodesDs.update(nodeItems);
  edgesDs.update(edgeItems);
}

function kgBindNetworkHover(network, nodesDs, edgesDs) {
  if (!network || network.__kgHoverBound) return;
  network.__kgHoverBound = true;
  network.on("hoverNode", (params) => {
    kgApplyGraphHover(network, nodesDs, edgesDs, params.node);
  });
  network.on("blurNode", () => {
    kgApplyGraphHover(network, nodesDs, edgesDs, null);
  });
}

function kgNetworkRedrawOne(network, containerId) {
  if (!network) return;
  const container = kgEl(containerId);
  requestAnimationFrame(() => {
    if (!network) return;
    if (container) {
      const w = container.offsetWidth || container.clientWidth;
      const h = container.offsetHeight || container.clientHeight;
      if (w > 0 && h > 0) network.setSize(`${w}px`, `${h}px`);
    }
    network.redraw();
    network.stabilize(150);
  });
}

function kgNetworkRedraw() {
  kgNetworkRedrawOne(kgNetworkFull, "kg-graph-canvas-full");
}

function kgSyncNetworkData(nodesDs, edgesDs, { large = false, showLabels = true } = {}) {
  if (!nodesDs || !edgesDs) return;
  const nodeItems = kgVisNodeItems({ large });
  const nodeIds = new Set(nodeItems.map((n) => n.id));
  const edgeItems = kgVisEdgeItems(nodeIds, { showLabels });
  nodesDs.clear();
  edgesDs.clear();
  if (nodeItems.length) nodesDs.add(nodeItems);
  if (edgeItems.length) edgesDs.add(edgeItems);
}

function kgBindNetworkSelection(network, { full = false } = {}) {
  if (!network) return;
  network.off("click");
  network.on("click", (params) => {
    if (params.edges?.length) {
      const id = params.edges[0];
      const data = kgStore.schema.edges.find((e) => kgEdgeKey(e) === id);
      kgApplySelection(data ? { kind: "edge", id, data } : null, { focusCanvas: false });
      if (full) kgFocusNetworkSelection(kgNetworkFull);
      return;
    }
    if (params.nodes?.length) {
      const id = params.nodes[0];
      const data = kgStore.schema.nodes.find((n) => n.id === id);
      kgApplySelection(data ? { kind: "node", id, data } : null, { focusCanvas: false });
      if (full) kgFocusNetworkSelection(kgNetworkFull);
      return;
    }
    kgApplySelection(null);
  });
}

function kgFocusNetworkSelection(network) {
  if (!network || !kgSelected) return;
  if (kgSelected.kind === "edge") {
    network.selectNodes([]);
    network.selectEdges([kgSelected.id]);
    const edge = kgSelected.data || kgStore.schema.edges.find((e) => kgEdgeKey(e) === kgSelected.id);
    const focusId = edge?.source || edge?.target;
    if (focusId) network.focus(focusId, { scale: 1.15, animation: { duration: 280 } });
  } else if (kgSelected.kind === "node") {
    network.selectEdges([]);
    network.selectNodes([kgSelected.id]);
    network.focus(kgSelected.id, { scale: 1.2, animation: { duration: 280 } });
  }
}

function kgEnsureFullGraph() {
  if (kgNetworkFull) return true;
  const container = kgEl("kg-graph-canvas-full");
  if (!container || typeof vis === "undefined") return false;

  const nodeItems = kgVisNodeItems({ large: true });
  const nodeIds = new Set(nodeItems.map((n) => n.id));
  kgNodesFull = new vis.DataSet(nodeItems);
  kgEdgesFull = new vis.DataSet(kgVisEdgeItems(nodeIds, { showLabels: kgFullShowLabels }));

  const nodeCount = (kgStore.schema.nodes || []).length;
  kgNetworkFull = new vis.Network(
    container,
    { nodes: kgNodesFull, edges: kgEdgesFull },
    kgGraphOptions(nodeCount, { physics: kgFullPhysics }),
  );
  kgBindNetworkSelection(kgNetworkFull, { full: true });
  kgBindNetworkHover(kgNetworkFull, kgNodesFull, kgEdgesFull);
  kgNetworkRedrawOne(kgNetworkFull, "kg-graph-canvas-full");
  kgUpdateFullGraphMeta();
  return true;
}

function kgUpdateFullGraphMeta() {
  const meta = kgEl("kg-fullgraph-meta");
  if (!meta || !kgStore) return;
  const n = (kgStore.schema.nodes || []).length;
  const e = (kgStore.schema.edges || []).length;
  meta.textContent = `${n} node${n === 1 ? "" : "s"} · ${e} edge${e === 1 ? "" : "s"}`;
}

function kgFitFullGraph() {
  if (!kgNetworkFull) return;
  kgNetworkFull.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
}

function kgRenderFullGraphInspector() {
  const el = kgEl("kg-fullgraph-inspector-body");
  if (!el) return;
  if (!kgSelected) {
    el.innerHTML = '<p class="kg-sidebar-hint">Click a node or edge on the graph to inspect it here.</p>';
    return;
  }
  const labels = kgNodeLabelMap();
  if (kgSelected.kind === "node") {
    const n = kgSelected.data || {};
    el.innerHTML = `
      <dl>
        <div class="kg-fullgraph-detail-row"><dt>Label</dt><dd>${kgEsc(n.label || n.id)}</dd></div>
        <div class="kg-fullgraph-detail-row"><dt>ID</dt><dd class="mono">${kgEsc(n.id)}</dd></div>
        <div class="kg-fullgraph-detail-row"><dt>Type</dt><dd>${kgTypePill(n.type || "entity")}</dd></div>
        <div class="kg-fullgraph-detail-row"><dt>Connections</dt><dd>${kgNodeDegree(n.id)}</dd></div>
        ${n.description ? `<div class="kg-fullgraph-detail-row"><dt>Description</dt><dd>${kgEsc(n.description)}</dd></div>` : ""}
      </dl>
      <button type="button" class="kg-btn kg-btn--secondary" id="kg-fullgraph-edit-node" style="margin-top:0.5rem">Edit in Schema</button>`;
    kgEl("kg-fullgraph-edit-node")?.addEventListener("click", () => kgSetTab("schema"));
    return;
  }
  const e = kgSelected.data || {};
  el.innerHTML = `
    <dl>
      <div class="kg-fullgraph-detail-row"><dt>Relation</dt><dd>${kgEsc(e.label || "—")}</dd></div>
      <div class="kg-fullgraph-detail-row"><dt>Source</dt><dd>${kgEsc(labels[e.source] || e.source)} <span class="mono">(${kgEsc(e.source)})</span></dd></div>
      <div class="kg-fullgraph-detail-row"><dt>Target</dt><dd>${kgEsc(labels[e.target] || e.target)} <span class="mono">(${kgEsc(e.target)})</span></dd></div>
      ${e.description ? `<div class="kg-fullgraph-detail-row"><dt>Description</dt><dd>${kgEsc(e.description)}</dd></div>` : ""}
    </dl>
    <button type="button" class="kg-btn kg-btn--secondary" id="kg-fullgraph-edit-edge" style="margin-top:0.5rem">Edit in Schema</button>`;
  kgEl("kg-fullgraph-edit-edge")?.addEventListener("click", () => kgSetTab("schema"));
}

function kgApplySelection(sel, { focusCanvas = false } = {}) {
  kgSelected = sel;
  if (kgNetworkFull) {
    if (sel?.kind === "edge") {
      kgNetworkFull.selectNodes([]);
      kgNetworkFull.selectEdges([sel.id]);
      if (focusCanvas) {
        const edge = sel.data || kgStore.schema.edges.find((e) => kgEdgeKey(e) === sel.id);
        const focusId = edge?.source || edge?.target;
        if (focusId) kgNetworkFull.focus(focusId, { scale: 1.1, animation: { duration: 280 } });
      }
    } else if (sel?.kind === "node") {
      kgNetworkFull.selectEdges([]);
      kgNetworkFull.selectNodes([sel.id]);
      if (focusCanvas) kgNetworkFull.focus(sel.id, { scale: 1.15, animation: { duration: 280 } });
    } else {
      kgNetworkFull.selectNodes([]);
      kgNetworkFull.selectEdges([]);
    }
  }
  kgRenderSidebar();
  kgRenderFullGraphInspector();
  kgRenderElementLists();
}

function kgRefreshGraph() {
  if (kgNodesFull && kgEdgesFull) {
    kgSyncNetworkData(kgNodesFull, kgEdgesFull, { large: true, showLabels: kgFullShowLabels });
    kgNetworkRedrawOne(kgNetworkFull, "kg-graph-canvas-full");
  }
  kgUpdateFullGraphMeta();
  kgRenderElementLists();
  kgRenderFullGraphInspector();
}

function kgNodeDegree(nodeId) {
  return (kgStore.schema.edges || []).filter((e) => e.source === nodeId || e.target === nodeId).length;
}

function kgDeleteNode(id, { skipConfirm = false } = {}) {
  if (!id) return false;
  const node = kgStore.schema.nodes.find((x) => x.id === id);
  if (!node) return false;
  const edgeCount = kgNodeDegree(id);
  const msg = edgeCount
    ? `Delete node "${node.label || id}" and its ${edgeCount} connected edge(s)?`
    : `Delete node "${node.label || id}"?`;
  if (!skipConfirm && !confirm(msg)) return false;
  kgStore.schema.nodes = kgStore.schema.nodes.filter((x) => x.id !== id);
  kgStore.schema.edges = kgStore.schema.edges.filter((e) => e.source !== id && e.target !== id);
  if (kgSelected?.kind === "node" && kgSelected.id === id) kgSelected = null;
  kgInventorySelectedNodes.delete(id);
  kgSaveStore();
  kgRefreshGraph();
  kgRenderSidebar();
  return true;
}

function kgDeleteEdge(id, { skipConfirm = false } = {}) {
  if (!id) return false;
  const edge = kgStore.schema.edges.find((x) => kgEdgeKey(x) === id);
  if (!edge) return false;
  const msg = `Delete edge ${edge.source} → ${edge.target}${edge.label ? ` (${edge.label})` : ""}?`;
  if (!skipConfirm && !confirm(msg)) return false;
  kgStore.schema.edges = kgStore.schema.edges.filter((x) => kgEdgeKey(x) !== id);
  if (kgSelected?.kind === "edge" && kgSelected.id === id) kgSelected = null;
  kgInventorySelectedEdges.delete(id);
  kgSaveStore();
  kgRefreshGraph();
  kgRenderSidebar();
  return true;
}

function kgSelectNode(id, { focusCanvas = false, goGraph = false } = {}) {
  const node = kgStore.schema.nodes.find((n) => n.id === id);
  if (!node) return;
  if (goGraph) {
    kgSetTab("graph");
    kgApplySelection({ kind: "node", id, data: node }, { focusCanvas: true });
    return;
  }
  kgApplySelection({ kind: "node", id, data: node }, { focusCanvas: focusCanvas && kgTab === "graph" });
}

function kgSelectEdge(id, { focusCanvas = false, goGraph = false } = {}) {
  const edge = kgStore.schema.edges.find((e) => kgEdgeKey(e) === id);
  if (!edge) return;
  if (goGraph) {
    kgSetTab("graph");
    kgApplySelection({ kind: "edge", id: kgEdgeKey(edge), data: edge }, { focusCanvas: true });
    return;
  }
  kgApplySelection({ kind: "edge", id: kgEdgeKey(edge), data: edge }, { focusCanvas: focusCanvas && kgTab === "graph" });
}

function kgTypePill(type) {
  const t = type || "entity";
  const cls = KG_NODE_TYPES.filter((x) => x !== "entity").includes(t)
    ? `kg-inv-type-pill--${t}`
    : "kg-inv-type-pill--entity";
  return `<span class="kg-inv-type-pill ${cls}">${kgEsc(t)}</span>`;
}

function kgSortInventoryNodes(nodes) {
  const sort = kgInventorySort;
  return nodes.slice().sort((a, b) => {
    if (sort === "type") return String(a.type || "").localeCompare(String(b.type || ""));
    if (sort === "degree") return kgNodeDegree(b.id) - kgNodeDegree(a.id);
    if (sort === "recent") return String(b.id).localeCompare(String(a.id));
    return String(a.label || a.id).localeCompare(String(b.label || b.id));
  });
}

function kgSortInventoryEdges(edges) {
  const labels = kgNodeLabelMap();
  const sort = kgInventorySort;
  return edges.slice().sort((a, b) => {
    if (sort === "type" || sort === "degree") {
      return String(a.label || "").localeCompare(String(b.label || ""));
    }
    const as = `${labels[a.source] || a.source} ${a.label || ""}`;
    const bs = `${labels[b.source] || b.source} ${b.label || ""}`;
    return as.localeCompare(bs);
  });
}

function kgInventoryFilter() {
  return (kgEl("kg-inventory-filter")?.value || "").trim().toLowerCase();
}

function kgMatchesFilter(text, filter) {
  if (!filter) return true;
  return String(text || "").toLowerCase().includes(filter);
}

function kgGetInventoryVisibleItems() {
  const filter = kgInventoryFilter();
  const labels = kgNodeLabelMap();
  const showingNodes = kgInventoryView === "nodes";

  let nodes = (kgStore.schema.nodes || []).filter((n) =>
    kgMatchesFilter(n.id, filter)
    || kgMatchesFilter(n.label, filter)
    || kgMatchesFilter(n.type, filter)
    || kgMatchesFilter(n.description, filter),
  );
  if (kgInventoryTypeFilter && showingNodes) {
    nodes = nodes.filter((n) => (n.type || "entity") === kgInventoryTypeFilter);
  }
  nodes = kgSortInventoryNodes(nodes);

  let edges = (kgStore.schema.edges || []).filter((e) =>
    kgMatchesFilter(e.source, filter)
    || kgMatchesFilter(e.target, filter)
    || kgMatchesFilter(e.label, filter)
    || kgMatchesFilter(labels[e.source], filter)
    || kgMatchesFilter(labels[e.target], filter)
    || kgMatchesFilter(kgEdgeKey(e), filter),
  );
  edges = kgSortInventoryEdges(edges);

  const items = showingNodes ? nodes : edges;
  const pageLimit = filter || showingNodes ? items.length : KG_INVENTORY_PAGE;
  return { showingNodes, items, visible: items.slice(0, pageLimit) };
}

function kgConfirmDialog({ title = "Confirm", body = "", confirmLabel = "Confirm", danger = true } = {}) {
  return new Promise((resolve) => {
    const dlg = kgEl("kg-confirm-dialog");
    const titleEl = kgEl("kg-confirm-title");
    const bodyEl = kgEl("kg-confirm-body");
    const okBtn = kgEl("kg-confirm-ok");
    if (!dlg || !titleEl || !bodyEl || !okBtn) {
      resolve(window.confirm(String(body || title).replace(/<[^>]+>/g, "")));
      return;
    }
    kgConfirmResolve = resolve;
    titleEl.textContent = title;
    bodyEl.innerHTML = body;
    okBtn.textContent = confirmLabel;
    okBtn.classList.toggle("kg-btn--danger", danger);
    dlg.showModal();
  });
}

function kgCloseConfirmDialog(result) {
  kgEl("kg-confirm-dialog")?.close();
  if (kgConfirmResolve) {
    const resolve = kgConfirmResolve;
    kgConfirmResolve = null;
    resolve(result);
  }
}

function kgPruneInventorySelection() {
  const nodeIds = new Set((kgStore.schema.nodes || []).map((n) => n.id));
  const edgeIds = new Set((kgStore.schema.edges || []).map((e) => kgEdgeKey(e)));
  kgInventorySelectedNodes = new Set([...kgInventorySelectedNodes].filter((id) => nodeIds.has(id)));
  kgInventorySelectedEdges = new Set([...kgInventorySelectedEdges].filter((id) => edgeIds.has(id)));
}

function kgUpdateInventoryActions() {
  kgPruneInventorySelection();
  const { showingNodes, visible } = kgGetInventoryVisibleItems();
  const selected = showingNodes ? kgInventorySelectedNodes : kgInventorySelectedEdges;
  const visibleIds = showingNodes
    ? visible.map((n) => n.id)
    : visible.map((e) => kgEdgeKey(e));
  const visibleSel = visibleIds.filter((id) => selected.has(id)).length;

  const delNodes = kgEl("kg-del-nodes-sel");
  const delEdges = kgEl("kg-del-edges-sel");
  const toggleAll = kgEl("kg-inv-toggle-all");
  const nodeSel = kgInventorySelectedNodes.size;
  const edgeSel = kgInventorySelectedEdges.size;

  if (delNodes) {
    delNodes.disabled = nodeSel === 0;
    delNodes.textContent = nodeSel ? `Del nodes (${nodeSel})` : "Del nodes";
  }
  if (delEdges) {
    delEdges.disabled = edgeSel === 0;
    delEdges.textContent = edgeSel ? `Del edges (${edgeSel})` : "Del edges";
  }
  if (toggleAll) {
    toggleAll.hidden = false;
    toggleAll.disabled = visible.length === 0;
    const kind = showingNodes ? "nodes" : "edges";
    if (!visible.length) {
      toggleAll.textContent = "Select all";
      toggleAll.title = `Select all visible ${kind}`;
    } else if (visibleSel === visible.length) {
      toggleAll.textContent = "Deselect all";
      toggleAll.title = `Deselect all visible ${kind}`;
    } else {
      toggleAll.textContent = "Select all";
      toggleAll.title = `Select all ${visible.length} visible ${kind}`;
    }
  }
}

function kgToggleInventorySelectAll() {
  const { showingNodes, visible } = kgGetInventoryVisibleItems();
  if (!visible.length) return;
  const selected = showingNodes ? kgInventorySelectedNodes : kgInventorySelectedEdges;
  const visibleIds = showingNodes
    ? visible.map((n) => n.id)
    : visible.map((e) => kgEdgeKey(e));
  const allSelected = visibleIds.every((id) => selected.has(id));
  if (allSelected) {
    for (const id of visibleIds) selected.delete(id);
  } else {
    for (const id of visibleIds) selected.add(id);
  }
  kgRenderElementLists();
}

function kgRenderElementLists() {
  const filter = kgInventoryFilter();
  const labels = kgNodeLabelMap();
  const totalN = (kgStore.schema.nodes || []).length;
  const totalE = (kgStore.schema.edges || []).length;
  const { showingNodes, items, visible } = kgGetInventoryVisibleItems();

  const meta = kgEl("kg-inventory-meta");
  const truncNote = !filter && items.length > visible.length ? ` · first ${KG_INVENTORY_PAGE}` : "";
  if (meta) {
    meta.textContent = `${totalN} node${totalN === 1 ? "" : "s"} · ${totalE} edge${totalE === 1 ? "" : "s"}${truncNote}`;
  }

  const statsEl = kgEl("kg-inv-stats");
  if (statsEl) {
    const types = {};
    for (const n of kgStore.schema.nodes || []) {
      const t = n.type || "entity";
      types[t] = (types[t] || 0) + 1;
    }
    const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    const avgDeg = totalN
      ? ((kgStore.schema.edges || []).length * 2 / totalN).toFixed(1)
      : "0";
    statsEl.innerHTML = `
      <div class="kg-inv-stat"><strong>${totalN}</strong><span>Nodes</span></div>
      <div class="kg-inv-stat"><strong>${totalE}</strong><span>Edges</span></div>
      <div class="kg-inv-stat"><strong>${avgDeg}</strong><span>Avg degree</span></div>
      ${topType ? `<div class="kg-inv-stat"><strong>${topType[1]}</strong><span>${kgEsc(topType[0])}</span></div>` : ""}`;
  }

  const typeBar = kgEl("kg-inv-type-filters");
  if (typeBar) {
    if (showingNodes && totalN > 0) {
      const types = [...new Set((kgStore.schema.nodes || []).map((n) => n.type || "entity"))].sort();
      typeBar.innerHTML = `
        <button type="button" class="kg-inv-type-chip${kgInventoryTypeFilter === "" ? " active" : ""}" data-type="">All types</button>
        ${types.map((t) => `
          <button type="button" class="kg-inv-type-chip${kgInventoryTypeFilter === t ? " active" : ""}" data-type="${kgEsc(t)}">${kgEsc(t)}</button>`).join("")}`;
    } else {
      typeBar.innerHTML = "";
    }
  }

  document.querySelectorAll(".kg-inv-seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.invView === kgInventoryView);
  });
  const sortSel = kgEl("kg-inventory-sort");
  if (sortSel && sortSel.value !== kgInventorySort) sortSel.value = kgInventorySort;

  const delNodes = kgEl("kg-del-nodes-sel");
  const delEdges = kgEl("kg-del-edges-sel");
  if (delNodes) delNodes.hidden = !showingNodes;
  if (delEdges) delEdges.hidden = showingNodes;

  const listEl = kgEl("kg-inv-list");
  const foot = kgEl("kg-inv-footnote");
  if (foot) {
    foot.textContent = visible.length < items.length
      ? `Showing ${visible.length} of ${items.length} — use search to narrow results.`
      : showingNodes && !visible.length
        ? "No nodes yet. Ingest documents or add nodes manually."
        : !showingNodes && !visible.length
          ? "No edges yet. Ingest documents or connect nodes in Schema Designer."
          : "";
  }

  if (!listEl) return;

  if (!visible.length) {
    listEl.innerHTML = `<p class="mm-empty">${filter ? "No matches." : showingNodes ? "No nodes yet." : "No edges yet."}</p>`;
    kgUpdateInventoryActions();
    return;
  }

  if (showingNodes) {
    listEl.innerHTML = visible.map((n) => {
      const active = kgSelected?.kind === "node" && kgSelected.id === n.id;
      const desc = n.description ? kgEsc(n.description.slice(0, 120)) : "";
      const checked = kgInventorySelectedNodes.has(n.id) ? " checked" : "";
      return `<article class="kg-inv-card kg-inv-card--node${active ? " kg-inv-card--active" : ""}" data-node-id="${kgEsc(n.id)}" role="listitem" tabindex="0">
        <div class="kg-inv-card-check"><input type="checkbox" class="kg-node-check" data-node-id="${kgEsc(n.id)}" aria-label="Select ${kgEsc(n.label || n.id)}"${checked}></div>
        <div class="kg-inv-card-body">
          <div class="kg-inv-card-title"><strong>${kgEsc(n.label || n.id)}</strong>${kgTypePill(n.type)}</div>
          <div class="kg-inv-card-meta"><span class="mono">${kgEsc(n.id)}</span> · ${kgNodeDegree(n.id)} connection${kgNodeDegree(n.id) === 1 ? "" : "s"}${desc ? ` · ${desc}` : ""}</div>
        </div>
        <div class="kg-inv-card-actions">
          <button type="button" class="kg-btn kg-btn--secondary kg-node-graph" data-node-id="${kgEsc(n.id)}">Graph</button>
          <button type="button" class="kg-btn kg-btn--secondary kg-node-edit" data-node-id="${kgEsc(n.id)}">Edit</button>
          <button type="button" class="kg-btn kg-btn--danger kg-node-del" data-node-id="${kgEsc(n.id)}">Del</button>
        </div>
      </article>`;
    }).join("");
  } else {
    listEl.innerHTML = visible.map((e) => {
      const eid = kgEdgeKey(e);
      const active = kgSelected?.kind === "edge" && kgSelected.id === eid;
      const checked = kgInventorySelectedEdges.has(eid) ? " checked" : "";
      return `<article class="kg-inv-card kg-inv-card--edge${active ? " kg-inv-card--active" : ""}" data-edge-id="${kgEsc(eid)}" role="listitem" tabindex="0">
        <div class="kg-inv-card-check"><input type="checkbox" class="kg-edge-check" data-edge-id="${kgEsc(eid)}" aria-label="Select edge"${checked}></div>
        <div class="kg-inv-card-body">
          <div class="kg-inv-edge-flow">
            <strong>${kgEsc(labels[e.source] || e.source)}</strong>
            <span class="kg-inv-edge-arrow">${kgEsc(e.label || "relates_to")} →</span>
            <strong>${kgEsc(labels[e.target] || e.target)}</strong>
          </div>
          <div class="kg-inv-card-meta"><span class="mono">${kgEsc(e.source)}</span> → <span class="mono">${kgEsc(e.target)}</span></div>
        </div>
        <div class="kg-inv-card-actions">
          <button type="button" class="kg-btn kg-btn--secondary kg-edge-graph" data-edge-id="${kgEsc(eid)}">Graph</button>
          <button type="button" class="kg-btn kg-btn--secondary kg-edge-edit" data-edge-id="${kgEsc(eid)}">Edit</button>
          <button type="button" class="kg-btn kg-btn--danger kg-edge-del" data-edge-id="${kgEsc(eid)}">Del</button>
        </div>
      </article>`;
    }).join("");
  }

  document.querySelectorAll(".kg-node-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) kgInventorySelectedNodes.add(cb.dataset.nodeId);
      else kgInventorySelectedNodes.delete(cb.dataset.nodeId);
      kgUpdateInventoryActions();
    });
  });
  document.querySelectorAll(".kg-edge-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) kgInventorySelectedEdges.add(cb.dataset.edgeId);
      else kgInventorySelectedEdges.delete(cb.dataset.edgeId);
      kgUpdateInventoryActions();
    });
  });
  document.querySelectorAll(".kg-node-edit").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); kgSelectNode(btn.dataset.nodeId); });
  });
  document.querySelectorAll(".kg-node-graph").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); kgSelectNode(btn.dataset.nodeId, { goGraph: true }); });
  });
  document.querySelectorAll(".kg-node-del").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); kgDeleteNode(btn.dataset.nodeId); });
  });
  document.querySelectorAll(".kg-edge-edit").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); kgSelectEdge(btn.dataset.edgeId); });
  });
  document.querySelectorAll(".kg-edge-graph").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); kgSelectEdge(btn.dataset.edgeId, { goGraph: true }); });
  });
  document.querySelectorAll(".kg-edge-del").forEach((btn) => {
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); kgDeleteEdge(btn.dataset.edgeId); });
  });
  document.querySelectorAll(".kg-inv-card--node").forEach((card) => {
    card.addEventListener("click", (ev) => {
      if (ev.target.closest("button, input")) return;
      kgSelectNode(card.dataset.nodeId);
    });
  });
  document.querySelectorAll(".kg-inv-card--edge").forEach((card) => {
    card.addEventListener("click", (ev) => {
      if (ev.target.closest("button, input")) return;
      kgSelectEdge(card.dataset.edgeId);
    });
  });

  const activeCard = document.querySelector(".kg-inv-card--active");
  if (activeCard) {
    requestAnimationFrame(() => activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
  kgUpdateInventoryActions();
}

async function kgDeleteSelectedNodes() {
  const ids = [...kgInventorySelectedNodes];
  if (!ids.length) return;
  const edgeCount = (kgStore.schema.edges || []).filter(
    (e) => ids.includes(e.source) || ids.includes(e.target),
  ).length;
  const edgeNote = edgeCount
    ? `<p>This will also remove <strong>${edgeCount}</strong> connected edge${edgeCount === 1 ? "" : "s"}.</p>`
    : "";
  const ok = await kgConfirmDialog({
    title: `Delete ${ids.length} node${ids.length === 1 ? "" : "s"}?`,
    body: `<p>Permanently erase <strong>${ids.length}</strong> selected node${ids.length === 1 ? "" : "s"} from this workspace.</p>${edgeNote}<p class="kg-confirm-warn">This cannot be undone.</p>`,
    confirmLabel: `Delete ${ids.length} node${ids.length === 1 ? "" : "s"}`,
  });
  if (!ok) return;
  for (const id of ids) {
    kgStore.schema.nodes = kgStore.schema.nodes.filter((x) => x.id !== id);
    kgStore.schema.edges = kgStore.schema.edges.filter((e) => e.source !== id && e.target !== id);
    if (kgSelected?.kind === "node" && kgSelected.id === id) kgSelected = null;
    kgInventorySelectedNodes.delete(id);
  }
  kgSaveStore();
  kgRefreshGraph();
  kgRenderSidebar();
}

async function kgDeleteSelectedEdges() {
  const ids = [...kgInventorySelectedEdges];
  if (!ids.length) return;
  const ok = await kgConfirmDialog({
    title: `Delete ${ids.length} edge${ids.length === 1 ? "" : "s"}?`,
    body: `<p>Permanently erase <strong>${ids.length}</strong> selected edge${ids.length === 1 ? "" : "s"} from this workspace.</p><p class="kg-confirm-warn">This cannot be undone.</p>`,
    confirmLabel: `Delete ${ids.length} edge${ids.length === 1 ? "" : "s"}`,
  });
  if (!ok) return;
  kgStore.schema.edges = kgStore.schema.edges.filter((e) => !ids.includes(kgEdgeKey(e)));
  if (kgSelected?.kind === "edge" && ids.includes(kgSelected.id)) kgSelected = null;
  for (const id of ids) kgInventorySelectedEdges.delete(id);
  kgSaveStore();
  kgRefreshGraph();
  kgRenderSidebar();
}

function kgRenderSidebar() {
  const el = kgEl("kg-sidebar-body");
  if (!el) return;
  if (!kgSelected) {
    el.innerHTML = `<p class="kg-sidebar-hint">Select a node or edge from the inventory list, or open the <strong>Graph</strong> tab to explore visually.</p>`;
    kgRenderElementLists();
    return;
  }
  if (kgSelected.kind === "node") {
    const n = kgSelected.data || {};
    el.innerHTML = `
      <label class="kg-field">ID<input id="kg-f-id" value="${kgEsc(n.id || "")}" readonly></label>
      <label class="kg-field">Label<input id="kg-f-label" value="${kgEsc(n.label || "")}"></label>
      <label class="kg-field">Type
        <select id="kg-f-type">
          ${KG_NODE_TYPES.map((t) =>
            `<option value="${t}"${n.type === t ? " selected" : ""}>${t}</option>`,
          ).join("")}
        </select>
      </label>
      <div class="kg-sidebar-actions">
        <button type="button" class="kg-btn" id="kg-save-node">Save node</button>
        <button type="button" class="kg-btn kg-btn--danger" id="kg-del-node">Delete</button>
      </div>`;
    kgEl("kg-save-node")?.addEventListener("click", () => {
      const node = kgStore.schema.nodes.find((x) => x.id === n.id);
      if (!node) return;
      node.label = kgEl("kg-f-label")?.value || node.label;
      node.type = kgEl("kg-f-type")?.value || node.type;
      kgSaveStore();
      kgRefreshGraph();
    });
    kgEl("kg-del-node")?.addEventListener("click", () => kgDeleteNode(n.id));
    kgRenderElementLists();
    return;
  }
  const e = kgSelected.data || {};
  el.innerHTML = `
    <label class="kg-field">Source<input id="kg-f-src" value="${kgEsc(e.source || "")}"></label>
    <label class="kg-field">Target<input id="kg-f-tgt" value="${kgEsc(e.target || "")}"></label>
    <label class="kg-field">Label<input id="kg-f-elabel" value="${kgEsc(e.label || "")}"></label>
    <div class="kg-sidebar-actions">
      <button type="button" class="kg-btn" id="kg-save-edge">Save edge</button>
      <button type="button" class="kg-btn kg-btn--danger" id="kg-del-edge">Delete</button>
    </div>`;
  kgEl("kg-save-edge")?.addEventListener("click", () => {
    const edge = kgStore.schema.edges.find((x) => kgEdgeKey(x) === kgSelected.id);
    if (!edge) return;
    const src = (kgEl("kg-f-src")?.value || edge.source).trim();
    const tgt = (kgEl("kg-f-tgt")?.value || edge.target).trim();
    const nodeIds = new Set((kgStore.schema.nodes || []).map((n) => n.id));
    if (!nodeIds.has(src) || !nodeIds.has(tgt)) {
      alert("Source and target must match existing node IDs.");
      return;
    }
    edge.source = src;
    edge.target = tgt;
    edge.label = kgEl("kg-f-elabel")?.value || edge.label;
    kgSaveStore();
    kgRefreshGraph();
  });
  kgEl("kg-del-edge")?.addEventListener("click", () => kgDeleteEdge(kgSelected.id));
  kgRenderElementLists();
}

function kgAddNode() {
  const id = kgUid("node");
  kgStore.schema.nodes.push({ id, label: "New node", type: "entity" });
  kgSaveStore();
  kgRefreshGraph();
  kgApplySelection({ kind: "node", id, data: kgStore.schema.nodes.at(-1) }, { focusCanvas: true });
}

function kgAddEdge() {
  const nodes = kgStore.schema.nodes;
  if (nodes.length < 2) return;
  let source = nodes[0].id;
  let target = nodes[1].id;
  if (kgSelected?.kind === "node") {
    source = kgSelected.id;
    const other = nodes.find((n) => n.id !== source);
    if (!other) return;
    target = other.id;
  }
  const edge = { id: kgUid("edge"), source, target, label: "relates_to" };
  kgStore.schema.edges.push(edge);
  kgSaveStore();
  kgRefreshGraph();
  kgApplySelection({ kind: "edge", id: kgEdgeKey(edge), data: edge }, { focusCanvas: true });
}

function kgExportJson(store = kgStore, filename) {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const safe = (store?.name || "workspace").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 40);
  a.download = filename || `btc-kg-${safe}-${Date.now()}.json`;
  a.click();
}

function kgImportJson(file, asNew = false) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (asNew) {
        const name = parsed.name ? `${parsed.name} (import)` : `Imported ${new Date().toLocaleDateString()}`;
        kgCreateWorkspace({ name, description: parsed.description || "", data: parsed });
        kgRenderWorkspaceList();
        return;
      }
      kgStore = { ...kgDefaultWorkspace(kgActiveId, kgStore.name), ...parsed, id: kgActiveId };
      if (!kgStore.ragHistory) kgStore.ragHistory = [];
      kgSaveStore();
      kgRefreshGraph();
      kgRenderIngestLog();
      kgRenderDocumentList();
      kgRenderSidebar();
      kgRenderRagHistory();
    } catch {
      alert("Invalid JSON");
    }
  };
  reader.readAsText(file);
}

function kgEntityRefCounts(excludeDocId = null) {
  const nodeRefs = {};
  const edgeRefs = {};
  for (const doc of kgStore.documents || []) {
    if (excludeDocId && doc.id === excludeDocId) continue;
    for (const nid of doc.extracted?.nodeIds || []) nodeRefs[nid] = (nodeRefs[nid] || 0) + 1;
    for (const eid of doc.extracted?.edgeIds || []) edgeRefs[eid] = (edgeRefs[eid] || 0) + 1;
  }
  return { nodeRefs, edgeRefs };
}

function kgPruneGraphForRemovedDocs(removedDocs) {
  if (!removedDocs.length) return;
  const removedIds = new Set(removedDocs.map((d) => d.id));
  const nodeRefs = {};
  const edgeRefs = {};
  for (const doc of kgStore.documents || []) {
    if (removedIds.has(doc.id)) continue;
    for (const nid of doc.extracted?.nodeIds || []) nodeRefs[nid] = (nodeRefs[nid] || 0) + 1;
    for (const eid of doc.extracted?.edgeIds || []) edgeRefs[eid] = (edgeRefs[eid] || 0) + 1;
  }
  const removeNodes = new Set();
  const removeEdges = new Set();
  for (const doc of removedDocs) {
    for (const nid of doc.extracted?.nodeIds || []) {
      if (!nodeRefs[nid]) removeNodes.add(nid);
    }
    for (const eid of doc.extracted?.edgeIds || []) {
      if (!edgeRefs[eid]) removeEdges.add(eid);
    }
  }
  if (removeNodes.size) {
    kgStore.schema.nodes = kgStore.schema.nodes.filter((n) => !removeNodes.has(n.id));
    kgStore.schema.edges = kgStore.schema.edges.filter(
      (e) => !removeNodes.has(e.source) && !removeNodes.has(e.target),
    );
  }
  if (removeEdges.size) {
    kgStore.schema.edges = kgStore.schema.edges.filter((e) => !removeEdges.has(kgEdgeKey(e)));
  }
  if (kgSelected?.kind === "node" && removeNodes.has(kgSelected.id)) kgSelected = null;
  if (kgSelected?.kind === "edge" && removeEdges.has(kgSelected.id)) kgSelected = null;
}

function kgDeleteDocument(docId, { pruneGraph = true, skipConfirm = false } = {}) {
  const doc = (kgStore.documents || []).find((d) => d.id === docId);
  if (!doc) return;
  const msg = pruneGraph
    ? `Delete "${doc.title}" and remove graph entities only used by this document?`
    : `Delete "${doc.title}" (keep extracted graph nodes/edges)?`;
  if (!skipConfirm && !confirm(msg)) return;

  kgStore.documents = kgStore.documents.filter((d) => d.id !== docId);
  if (pruneGraph) kgPruneGraphForRemovedDocs([doc]);

  kgPendingReviewQueue = kgPendingReviewQueue.filter((p) => p.docId !== docId);
  if (kgPendingReview?.docId === docId) {
    kgPendingReview = kgPendingReviewQueue[0] || null;
    kgRenderReviewPanel();
  }

  kgSaveStore();
  kgRefreshGraph();
  kgRenderDocumentList();
  kgRenderIngestLog();
}

async function kgDeleteAllDocuments() {
  const allDocs = (kgStore.documents || []).slice();
  if (!allDocs.length) return;

  const inReview = allDocs.filter((d) => {
    const st = kgDocExtractionStatus(d);
    return st === "review" || st === "pending";
  }).length;
  const reviewNote = inReview
    ? `<p><strong>${inReview}</strong> source${inReview === 1 ? "" : "s"} still in extraction review will also be removed.</p>`
    : "";
  const ok = await kgConfirmDialog({
    title: `Delete all ${allDocs.length} document${allDocs.length === 1 ? "" : "s"}?`,
    body: `<p>Permanently remove <strong>every ingested source</strong> in this workspace (${allDocs.length} document${allDocs.length === 1 ? "" : "s"}).</p>${reviewNote}<p>Graph nodes and edges referenced only by these documents will be pruned. The ingestion log will be cleared.</p><p class="kg-confirm-warn">This cannot be undone.</p>`,
    confirmLabel: `Delete all ${allDocs.length}`,
  });
  if (!ok) return;

  kgPruneGraphForRemovedDocs(allDocs);
  const removedIds = new Set(allDocs.map((d) => d.id));
  kgStore.documents = [];
  kgStore.ingestLog = [];
  kgPendingReviewQueue = kgPendingReviewQueue.filter((p) => !removedIds.has(p.docId));
  kgPendingReview = kgPendingReview?.docId && removedIds.has(kgPendingReview.docId)
    ? (kgPendingReviewQueue[0] || null)
    : kgPendingReview;
  if (!kgPendingReview) kgRenderReviewPanel();

  kgSaveStore();
  kgRefreshGraph();
  kgRenderDocumentList();
  kgRenderIngestLog();
  kgRenderSidebar();
  const status = kgEl("kg-ingest-status");
  if (status) status.textContent = `Removed ${allDocs.length} document${allDocs.length === 1 ? "" : "s"}.`;
}

function kgRenderDocumentList() {
  const el = kgEl("kg-doc-list");
  const meta = kgEl("kg-doc-count");
  const foot = kgEl("kg-doc-footnote");
  const allDocs = (kgStore.documents || []).slice().reverse();
  const pendingReview = allDocs.filter((d) => {
    const st = kgDocExtractionStatus(d);
    return st === "review" || st === "pending";
  }).length;
  const docs = allDocs.filter(kgDocListEligible);

  if (meta) {
    let label = `${docs.length} doc${docs.length === 1 ? "" : "s"}`;
    if (pendingReview) label += ` · ${pendingReview} in review`;
    meta.textContent = label;
  }
  if (foot) {
    const awaiting = docs.filter((d) => kgDocExtractionStatus(d) === "review").length;
    foot.textContent = awaiting
      ? `${awaiting} source${awaiting === 1 ? "" : "s"} in review — open Extraction review above and click Add approved to graph (use Next if queued).`
      : docs.length
        ? "Ingested sources in this workspace. Hover column headers or action buttons for help."
        : "";
  }
  const delAllBtn = kgEl("kg-doc-delete-all");
  if (delAllBtn) delAllBtn.disabled = allDocs.length === 0;

  if (!el) return;
  if (!docs.length) {
    el.innerHTML = allDocs.length
      ? '<p class="mm-empty">No committed documents yet — approve extractions in the review panel above.</p>'
      : '<p class="mm-empty">No documents yet. Ingest a URL, text, or file above.</p>';
    return;
  }
  el.innerHTML = `
    <table class="deriv-table kg-table kg-doc-table">
      <thead><tr>
        <th data-help-key="kg-doc-col-title">Title</th>
        <th data-help-key="kg-doc-col-type">Type</th>
        <th class="mono" data-help-key="kg-doc-col-chunks">Chunks</th>
        <th data-help-key="kg-doc-col-source">Source</th>
        <th data-help-key="kg-doc-col-ingest">Ingest</th>
        <th data-help-key="kg-doc-col-extract">Extract</th>
        <th class="mono kg-doc-ingested-col" data-help-key="kg-doc-col-ingested">Ingested</th>
        <th class="kg-doc-actions-col" data-help-key="kg-doc-col-actions">Actions</th>
      </tr></thead>
      <tbody>
        ${docs.map((d) => {
          const entN = (d.extracted?.nodeIds || []).length;
          const edgeN = (d.extracted?.edgeIds || []).length;
          const ingestedAt = d.ingestedAt || d.metadata?.ingestedAt;
          const titleTip = d.metadata?.discoveryGoal
            ? `${d.title || "Untitled"} — discovery goal: ${d.metadata.discoveryGoal}`
            : (d.title || "Untitled");
          return `<tr>
            <td class="kg-doc-title-cell" title="${kgEsc(titleTip)}"><strong>${kgEsc(d.title || "Untitled")}</strong></td>
            <td><span class="mw-venue-tag">${kgEsc(d.type || "—")}</span></td>
            <td class="mono">${(d.chunks || []).length}</td>
            <td class="kg-doc-source-cell">${kgDocSourceLink(d)}</td>
            <td>${kgIngestModeBadge(Boolean(d.metadata?.fallback))}</td>
            <td>${kgExtractionStatusLabel(d)} <span class="mono" title="${edgeN} edges in graph">${entN ? `(${entN})` : ""}</span></td>
            <td class="mono kg-doc-ingested-col" title="${kgEsc(new Date(ingestedAt || Date.now()).toLocaleString())}">${kgFmtIngestedAt(ingestedAt)}</td>
            <td class="kg-doc-actions-col">
              <div class="kg-doc-actions">
                <button type="button" class="kg-btn kg-btn--secondary kg-doc-view" data-doc-id="${kgEsc(d.id)}" title="Preview chunks, ingest mode, and graph entity counts">View</button>
                <button type="button" class="kg-btn kg-btn--secondary kg-doc-extract" data-doc-id="${kgEsc(d.id)}" title="Re-run LLM extraction (opens review if enabled)">Extract</button>
                <button type="button" class="kg-btn kg-btn--danger kg-doc-del" data-doc-id="${kgEsc(d.id)}" title="Delete document and prune graph items only used by it">Del</button>
              </div>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".kg-doc-del").forEach((btn) => {
    btn.addEventListener("click", () => kgDeleteDocument(btn.dataset.docId, { pruneGraph: true }));
  });
  el.querySelectorAll(".kg-doc-view").forEach((btn) => {
    btn.addEventListener("click", () => {
      const doc = kgStore.documents.find((d) => d.id === btn.dataset.docId);
      if (!doc) return;
      const chunkN = (doc.chunks || []).length;
      const entN = (doc.extracted?.nodeIds || []).length;
      const edgeN = (doc.extracted?.edgeIds || []).length;
      const mode = doc.metadata?.fallback ? "local (browser)" : "server (API)";
      const approvedAt = doc.extractionMeta?.approvedAt
        ? kgFmtIngestedAt(doc.extractionMeta.approvedAt)
        : "—";
      alert(
        `${doc.title}\nType: ${doc.type}\nIngest: ${mode}\nChunks: ${chunkN}\nExtraction: ${kgDocExtractionStatus(doc)}\nApproved: ${approvedAt}\nGraph entities: ${entN} nodes · ${edgeN} edges\n\nPreview:\n${doc.textPreview || "—"}`,
      );
    });
  });
  el.querySelectorAll(".kg-doc-extract").forEach((btn) => {
    btn.addEventListener("click", () => {
      const doc = kgStore.documents.find((d) => d.id === btn.dataset.docId);
      if (!doc) return;
      btn.disabled = true;
      kgRunExtractForDoc(doc, { force: true, statusEl: kgEl("kg-ingest-status") })
        .catch((err) => {
          doc.extractionStatus = "failed";
          const status = kgEl("kg-ingest-status");
          if (status) status.textContent = `Extraction failed: ${err.message}`;
        })
        .finally(() => {
          btn.disabled = false;
          kgRenderDocumentList();
        });
    });
  });

  kgDecorateIngestHelp(el);
}

function kgRenderIngestLog() {
  const el = kgEl("kg-ingest-log");
  if (!el) return;
  const rows = (kgStore.ingestLog || []).slice().reverse().slice(0, 20);
  if (!rows.length) {
    el.innerHTML = '<p class="mm-empty">No ingestions yet.</p>';
    return;
  }
  el.innerHTML = `
    <table class="deriv-table kg-table kg-ingest-log-table">
      <thead><tr>
        <th>Title</th><th>Type</th><th class="mono">Chunks</th><th class="mono">Entities</th>
        <th data-help-key="kg-ingest-log-col-mode">Mode</th>
        <th class="mono kg-doc-ingested-col">When</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${kgEsc(r.title)}</td>
            <td><span class="mw-venue-tag">${kgEsc(r.type)}</span></td>
            <td class="mono">${r.chunks}</td>
            <td class="mono">${r.entities}</td>
            <td>${kgIngestModeBadge(Boolean(r.fallback))}</td>
            <td class="mono kg-doc-ingested-col" title="${kgEsc(new Date(r.at).toLocaleString())}">${kgFmtIngestedAt(r.at)}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  kgDecorateIngestHelp(el);
}

async function kgRunIngest() {
  const url = kgEl("kg-ingest-url")?.value?.trim() || "";
  const text = kgEl("kg-ingest-text")?.value?.trim() || "";
  const title = kgEl("kg-ingest-title")?.value?.trim() || "";
  const fileInput = kgEl("kg-ingest-files");
  const files = [...(fileInput?.files || [])];
  const status = kgEl("kg-ingest-status");
  if (kgIngestBusy) {
    if (status) status.textContent = "Ingest already in progress…";
    return;
  }
  if (!url && !text && !files.length) {
    if (status) status.textContent = kgIngestIdleHint();
    return;
  }
  if (status) status.textContent = "Processing…";

  const batch = files.length ? files : [null];
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const discoveryGoal = kgEl("kg-discover-goal")?.value?.trim() || "";
  kgSetIngestBusy(true);
  try {
  for (let i = 0; i < batch.length; i++) {
    const file = batch[i];
    const type = kgDetectType({ url: file ? "" : url, text, file });
    if (type === "media") {
      if (status) {
        status.textContent = `Skipped ${file?.name || "media"}: upload SRT/VTT transcript instead.`;
      }
      continue;
    }
    if (status) status.textContent = `Processing ${i + 1}/${batch.length}…`;

    const preKey = kgSourceKey({ url: file ? "" : url, text: file ? "" : text, file });
    const existing = kgFindDocumentBySource(preKey);
    if (preKey && existing) {
      const again = await kgConfirmReingest(existing);
      if (!again) {
        skipped += 1;
        continue;
      }
    }

    try {
      const result = await kgClientIngest({
        type,
        url: file ? "" : url,
        text: file ? "" : text,
        title,
        file,
      });
      const sourceKey = result.metadata?.sourceKey || kgSourceKey({
        url: file ? "" : url,
        text: file ? "" : text,
        file,
        result,
      });
      const docId = kgUid("doc");
      const doc = {
        id: docId,
        title: result.title || title || file?.name || url || "Document",
        type: result.metadata?.type || type,
        source: result.metadata?.source,
        sourceKey,
        chunks: result.chunks || [],
        segments: result.segments || [],
        metadata: {
          ...result.metadata,
          ...(discoveryGoal ? { discoveryGoal } : {}),
        },
        fullText: result.text || "",
        textPreview: (result.text || "").slice(0, 400),
        ingestedAt: new Date().toISOString(),
        extractionStatus: "pending",
        extracted: { nodeIds: [], edgeIds: [], addedNodeIds: [], addedEdgeIds: [] },
      };
      kgStore.documents.push(doc);
      kgStore.ingestLog.push({
        title: doc.title,
        type: result.metadata?.type || type,
        chunks: (result.chunks || []).length,
        entities: 0,
        fallback: Boolean(result.metadata?.fallback),
        docId,
        at: new Date().toISOString(),
      });

      try {
        const pending = await kgRunExtractForDoc(doc, { statusEl: status });
        if (pending) {
          const logRow = kgStore.ingestLog[kgStore.ingestLog.length - 1];
          if (logRow) logRow.entities = pending.nodes.length;
        }
      } catch (err) {
        doc.extractionStatus = "failed";
        if (status) status.textContent = `Ingested but extraction failed: ${kgIngestErrorMessage(err)}`;
      }
      ok += 1;
    } catch (err) {
      failed += 1;
      if (status) status.textContent = `Failed (${i + 1}/${batch.length}): ${kgIngestErrorMessage(err)}`;
    }
  }
  } finally {
    kgSetIngestBusy(false);
  }

  if (fileInput) fileInput.value = "";
  if (kgEl("kg-ingest-text")) kgEl("kg-ingest-text").value = "";
  if (kgEl("kg-ingest-url")) kgEl("kg-ingest-url").value = "";
  kgSaveStore();
  kgRefreshGraph();
  kgRenderIngestLog();
  kgRenderDocumentList();
  if (status) {
    if (ok > 0) {
      const qn = kgPendingReviewQueue.length;
      const reviewHint = kgReviewModeEnabled()
        ? (qn || kgPendingReview)
          ? ` ${qn || 1} in extraction review — use Add approved to graph${qn > 1 ? " or Next" : ""}.`
          : " Review extractions above."
        : " Graph updated.";
      status.textContent = `Ingested ${ok} source(s).${reviewHint}`;
    } else if (failed > 0) {
      status.textContent = `No sources ingested (${failed} failed). See error above.`;
    } else if (skipped > 0) {
      status.textContent = `Skipped ${skipped} duplicate source(s) — already in Documents. Add a new URL, text, or file.`;
    } else {
      status.textContent = "No sources ingested.";
    }
  }
}

function kgAllChunks() {
  const out = [];
  for (const doc of kgStore.documents || []) {
    for (const ch of doc.chunks || []) {
      out.push({
        ...ch,
        docTitle: doc.title,
        docId: doc.id,
        docMetadata: doc.metadata || {},
      });
    }
  }
  return out;
}

function kgSelectChunksForRag(query, maxChunks = KG_MAX_RAG_CHUNKS) {
  const chunks = kgAllChunks();
  if (chunks.length <= maxChunks) return chunks;
  const q = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const scored = chunks
    .map((c) => {
      const text = (c.text || "").toLowerCase();
      const score = q.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length >= 8) return scored.slice(0, maxChunks);
  return chunks.slice(0, maxChunks);
}

function kgRenderSearchResults(result) {
  const out = kgEl("kg-search-results");
  if (!out || !result) return;

  const paths = (result.paths || [])
    .map((p) => `<li class="kg-path-item">${kgEsc(Array.isArray(p) ? p.join(" ") : p)}</li>`)
    .join("");
  const snippets = (result.chunks || [])
    .map((c) => {
      const meta = c.docMetadata || {};
      const ts = c.timestamp
        ? `<span class="kg-ts">${kgFmtTimestamp(c.timestamp, meta)}</span>`
        : "";
      const doc = c.docTitle ? `<span class="kg-doc">${kgEsc(c.docTitle)}</span>` : "";
      return `<article class="kg-snippet">${doc}${ts}<p>${kgEsc((c.text || "").slice(0, 420))}</p></article>`;
    })
    .join("");
  const nodes = (result.nodes || [])
    .map((n) => `<span class="kg-node-pill">${kgEsc(n.label || n.id)}</span>`)
    .join("");

  out.innerHTML = `
    <section class="kg-answer-panel">
      <h4>Answer</h4>
      <div class="kg-answer">${kgEsc(result.answer || "—")}</div>
    </section>
    ${nodes ? `<section class="kg-hit-nodes"><h4>Graph nodes</h4>${nodes}</section>` : ""}
    ${paths ? `<section class="kg-paths"><h4>Graph paths</h4><ul>${paths}</ul></section>` : ""}
    <section class="kg-snippets"><h4>Document snippets</h4>${snippets || '<p class="mm-empty">No snippets.</p>'}</section>`;
}

function kgPushRagHistory(result) {
  if (!result?.query) return;
  const entry = {
    id: kgUid("rag"),
    query: result.query,
    at: new Date().toISOString(),
    answer: (result.answer || "").slice(0, 2000),
    chunkCount: (result.chunks || []).length,
    nodeCount: (result.nodes || []).length,
    usedLlm: Boolean(result.used_llm ?? result.usedLlm),
    snapshot: {
      query: result.query,
      answer: result.answer,
      chunks: (result.chunks || []).slice(0, 8),
      nodes: result.nodes || [],
      paths: result.paths || [],
    },
  };
  kgStore.ragHistory = [entry, ...(kgStore.ragHistory || [])].slice(0, KG_RAG_HISTORY_MAX);
  kgStore.lastSearch = entry.snapshot;
  kgLastSearchResult = entry.snapshot;
  kgSaveStore();
  kgRenderRagHistory();
}

function kgRenderRagHistory() {
  const el = kgEl("kg-rag-history");
  const meta = kgEl("kg-rag-history-meta");
  const rows = (kgStore.ragHistory || []);
  if (meta) meta.textContent = `${rows.length} saved`;
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p class="mm-empty">No RAG queries yet for this workspace.</p>';
    return;
  }
  el.innerHTML = `
    <table class="deriv-table kg-table">
      <thead><tr><th>Query</th><th>Chunks</th><th>Nodes</th><th>LLM</th><th>When</th><th></th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${kgEsc((r.query || "").slice(0, 80))}</td>
            <td class="mono">${r.chunkCount ?? "—"}</td>
            <td class="mono">${r.nodeCount ?? "—"}</td>
            <td>${r.usedLlm ? '<span class="mw-venue-tag">Grok</span>' : '<span class="kg-ts">local</span>'}</td>
            <td class="mono">${new Date(r.at).toLocaleString()}</td>
            <td><button type="button" class="kg-btn kg-btn--secondary kg-rag-replay" data-rag-id="${r.id}">View</button></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
  el.querySelectorAll(".kg-rag-replay").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = kgStore.ragHistory.find((x) => x.id === btn.dataset.ragId);
      if (!row?.snapshot) return;
      kgLastSearchResult = row.snapshot;
      kgStore.lastSearch = row.snapshot;
      if (kgEl("kg-search-input")) kgEl("kg-search-input").value = row.query || "";
      kgRenderSearchResults(row.snapshot);
      kgSaveStore();
    });
  });
}

function kgRenderWorkspaceSelect() {
  const sel = kgEl("kg-ws-select");
  if (!sel) return;
  sel.innerHTML = kgIndex.workspaces
    .map((w) => `<option value="${w.id}"${w.id === kgActiveId ? " selected" : ""}>${w.name}</option>`)
    .join("");
}

function kgRenderWorkspaceList() {
  const el = kgEl("kg-ws-list");
  if (!el) return;
  const rows = kgIndex.workspaces || [];
  if (!rows.length) {
    el.innerHTML = '<p class="mm-empty">No workspaces.</p>';
    return;
  }
  el.innerHTML = `
    <table class="deriv-table kg-table">
      <thead><tr><th>Name</th><th>Nodes</th><th>Docs</th><th>RAG</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${rows.map((w) => `
          <tr class="${w.id === kgActiveId ? "kg-ws-row--active" : ""}">
            <td>
              <strong>${w.name}</strong>
              ${w.id === kgActiveId ? '<span class="kg-ws-active-tag">active</span>' : ""}
              ${w.description ? `<div class="kg-ws-desc">${w.description}</div>` : ""}
            </td>
            <td class="mono">${w.nodeCount ?? 0}</td>
            <td class="mono">${w.docCount ?? 0}</td>
            <td class="mono">${w.ragCount ?? 0}</td>
            <td class="mono">${new Date(w.updatedAt).toLocaleString()}</td>
            <td class="kg-ws-actions">
              ${w.id !== kgActiveId ? `<button type="button" class="kg-btn kg-btn--secondary kg-ws-load" data-ws-id="${w.id}">Load</button>` : ""}
              <button type="button" class="kg-btn kg-btn--secondary kg-ws-rename" data-ws-id="${w.id}">Rename</button>
              <button type="button" class="kg-btn kg-btn--secondary kg-ws-dup" data-ws-id="${w.id}">Duplicate</button>
              <button type="button" class="kg-btn kg-btn--secondary kg-ws-export" data-ws-id="${w.id}">Export</button>
              <button type="button" class="kg-btn kg-btn--danger kg-ws-del" data-ws-id="${w.id}">Delete</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".kg-ws-load").forEach((btn) => {
    btn.addEventListener("click", () => kgSwitchWorkspace(btn.dataset.wsId));
  });
  el.querySelectorAll(".kg-ws-rename").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ws = kgIndex.workspaces.find((x) => x.id === btn.dataset.wsId);
      const store = btn.dataset.wsId === kgActiveId ? kgStore : kgReadWorkspace(btn.dataset.wsId);
      const name = prompt("Workspace name", store?.name || ws?.name || "");
      if (!name?.trim()) return;
      const description = prompt("Description (optional)", store?.description || ws?.description || "");
      kgRenameWorkspace(btn.dataset.wsId, name, description ?? "");
    });
  });
  el.querySelectorAll(".kg-ws-dup").forEach((btn) => {
    btn.addEventListener("click", () => kgDuplicateWorkspace(btn.dataset.wsId));
  });
  el.querySelectorAll(".kg-ws-export").forEach((btn) => {
    btn.addEventListener("click", () => {
      const store = btn.dataset.wsId === kgActiveId ? kgStore : kgReadWorkspace(btn.dataset.wsId);
      if (store) kgExportJson(store);
    });
  });
  el.querySelectorAll(".kg-ws-del").forEach((btn) => {
    btn.addEventListener("click", () => kgDeleteWorkspace(btn.dataset.wsId));
  });
}

async function kgRunSearch() {
  const query = kgEl("kg-search-input")?.value?.trim();
  const out = kgEl("kg-search-results");
  if (!query || !out) return;
  out.innerHTML = '<p class="kg-loading">Searching…</p>';

  const ragChunks = kgSelectChunksForRag(query);
  const payload = {
    query,
    graph: kgStore.schema,
    chunks: ragChunks,
  };

  let result;
  try {
    const res = await fetch(KG_API_RAG, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    result = await res.json();
  } catch {
    result = kgClientRag(query);
  }

  kgRenderSearchResults(result);
  kgPushRagHistory(result);
}

function kgClientRag(query) {
  const chunks = kgAllChunks();
  const q = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const scored = chunks
    .map((c) => {
      const text = (c.text || "").toLowerCase();
      const score = q.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const hitNodes = (kgStore.schema.nodes || []).filter((n) =>
    q.some((w) => (n.label || "").toLowerCase().includes(w)),
  );

  const answer = scored.length
    ? `Local RAG: ${scored.length} passage(s) match "${query}". Top: "${(scored[0].text || "").slice(0, 240)}…" (Set XAI_API_KEY on server for Grok LLM answers.)`
    : `No local matches for "${query}". Ingest more sources or extend the schema.`;

  return { query, answer, chunks: scored, nodes: hitNodes, paths: [] };
}

function kgSetTab(tab) {
  kgTab = tab;
  document.querySelectorAll(".kg-tab-panel").forEach((p) => {
    p.hidden = p.dataset.kgTab !== tab;
  });
  document.querySelectorAll(".kg-subtab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.kgTab === tab);
  });
  kgEl("kg-panel")?.classList.toggle("kg-panel--graph-mode", tab === "graph");
  if (tab === "schema") {
    kgRenderElementLists();
    kgRenderSidebar();
  }
  if (tab === "graph") {
    kgEnsureFullGraph();
    kgRefreshGraph();
    kgRenderFullGraphInspector();
    requestAnimationFrame(() => {
      kgNetworkRedrawOne(kgNetworkFull, "kg-graph-canvas-full");
      if ((kgStore.schema.nodes || []).length) kgFitFullGraph();
    });
  }
  if (tab === "workspaces") kgRenderWorkspaceList();
  if (tab === "search") kgRenderRagHistory();
  if (tab === "review") kgRenderReviewPanel();
  kgUpdateReviewTabBadge();
}

function kgBindUi() {
  if (kgReady) return;
  kgReady = true;

  document.querySelectorAll(".kg-subtab").forEach((btn) => {
    btn.addEventListener("click", () => kgSetTab(btn.dataset.kgTab));
  });
  document.querySelectorAll("[data-kg-goto]").forEach((btn) => {
    btn.addEventListener("click", () => kgSetTab(btn.dataset.kgGoto));
  });

  kgEl("kg-add-node")?.addEventListener("click", kgAddNode);
  kgEl("kg-add-edge")?.addEventListener("click", kgAddEdge);
  kgEl("kg-save-store")?.addEventListener("click", () => {
    kgSaveStore();
    const status = kgEl("kg-ingest-status");
    if (status) status.textContent = `Workspace "${kgStore.name}" saved.`;
  });
  kgEl("kg-export-json")?.addEventListener("click", () => kgExportJson());
  kgEl("kg-import-json")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) kgImportJson(f, false);
    e.target.value = "";
  });

  kgEl("kg-ws-select")?.addEventListener("change", (e) => kgSwitchWorkspace(e.target.value));
  kgEl("kg-ws-save")?.addEventListener("click", () => kgSaveStore());
  kgEl("kg-ws-new")?.addEventListener("click", () => {
    const name = prompt("New workspace name", `Workspace ${kgIndex.workspaces.length + 1}`);
    if (!name?.trim()) return;
    kgCreateWorkspace({ name: name.trim(), template: "blank" });
    kgSetTab("schema");
  });
  kgEl("kg-ws-create-btn")?.addEventListener("click", () => {
    const name = kgEl("kg-ws-create-name")?.value?.trim();
    if (!name) {
      alert("Enter a workspace name.");
      return;
    }
    const description = kgEl("kg-ws-create-desc")?.value?.trim() || "";
    const template = kgEl("kg-ws-create-template")?.value || "blank";
    kgCreateWorkspace({ name, description, template });
    if (kgEl("kg-ws-create-name")) kgEl("kg-ws-create-name").value = "";
    if (kgEl("kg-ws-create-desc")) kgEl("kg-ws-create-desc").value = "";
    kgRenderWorkspaceList();
    kgSetTab("schema");
  });
  kgEl("kg-ws-export-active")?.addEventListener("click", () => kgExportJson());
  kgEl("kg-ws-import-file")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) kgImportJson(f, true);
    e.target.value = "";
  });
  kgEl("kg-inventory-filter")?.addEventListener("input", kgRenderElementLists);
  kgEl("kg-inventory-sort")?.addEventListener("change", (e) => {
    kgInventorySort = e.target.value || "label";
    kgRenderElementLists();
  });
  kgEl("kg-inv-view")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-inv-view]");
    if (!btn) return;
    kgInventoryView = btn.dataset.invView || "nodes";
    if (kgInventoryView === "edges") kgInventoryTypeFilter = "";
    kgRenderElementLists();
  });
  kgEl("kg-inv-type-filters")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-type]");
    if (!chip) return;
    kgInventoryTypeFilter = chip.dataset.type || "";
    kgRenderElementLists();
  });
  kgEl("kg-inv-toggle-all")?.addEventListener("click", kgToggleInventorySelectAll);
  kgEl("kg-del-nodes-sel")?.addEventListener("click", () => { kgDeleteSelectedNodes(); });
  kgEl("kg-del-edges-sel")?.addEventListener("click", () => { kgDeleteSelectedEdges(); });
  kgEl("kg-doc-delete-all")?.addEventListener("click", () => { kgDeleteAllDocuments().catch(() => {}); });
  kgEl("kg-confirm-ok")?.addEventListener("click", () => kgCloseConfirmDialog(true));
  kgEl("kg-confirm-cancel")?.addEventListener("click", () => kgCloseConfirmDialog(false));
  kgEl("kg-confirm-cancel-x")?.addEventListener("click", () => kgCloseConfirmDialog(false));
  kgEl("kg-confirm-dialog")?.addEventListener("cancel", (e) => {
    e.preventDefault();
    kgCloseConfirmDialog(false);
  });
  kgEl("kg-confirm-dialog")?.addEventListener("click", (e) => {
    if (e.target === kgEl("kg-confirm-dialog")) kgCloseConfirmDialog(false);
  });

  kgEl("kg-fullgraph-fit")?.addEventListener("click", kgFitFullGraph);
  kgEl("kg-fullgraph-physics")?.addEventListener("click", () => {
    kgFullPhysics = !kgFullPhysics;
    const btn = kgEl("kg-fullgraph-physics");
    if (btn) btn.textContent = `Physics: ${kgFullPhysics ? "on" : "off"}`;
    if (kgNetworkFull) {
      kgNetworkFull.setOptions({ physics: { enabled: kgFullPhysics } });
      if (kgFullPhysics) kgNetworkFull.stabilize(200);
    }
  });
  kgEl("kg-fullgraph-labels")?.addEventListener("click", () => {
    kgFullShowLabels = !kgFullShowLabels;
    const btn = kgEl("kg-fullgraph-labels");
    if (btn) btn.textContent = kgFullShowLabels ? "Edge labels" : "Edge labels off";
    if (kgNodesFull && kgEdgesFull) {
      kgSyncNetworkData(kgNodesFull, kgEdgesFull, { large: true, showLabels: kgFullShowLabels });
      kgNetworkRedrawOne(kgNetworkFull, "kg-graph-canvas-full");
    }
  });
  kgEl("kg-fullgraph-search")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const hit = (kgStore.schema.nodes || []).find(
      (n) => n.id.toLowerCase().includes(q) || (n.label || "").toLowerCase().includes(q),
    );
    if (hit) kgSelectNode(hit.id, { focusCanvas: true });
  });

  if (!window.__kgFullGraphResizeBound) {
    window.__kgFullGraphResizeBound = true;
    window.addEventListener("resize", () => {
      if (kgTab === "graph") kgNetworkRedrawOne(kgNetworkFull, "kg-graph-canvas-full");
    });
  }

  kgEl("kg-run-ingest")?.addEventListener("click", () => {
    kgRunIngest().catch((err) => {
      kgSetIngestBusy(false);
      const status = kgEl("kg-ingest-status");
      if (status) status.textContent = `Ingest failed: ${kgIngestErrorMessage(err)}`;
    });
  });
  const reviewCb = kgEl("kg-review-mode");
  if (reviewCb) {
    reviewCb.checked = kgReviewModeEnabled();
    reviewCb.addEventListener("change", () => kgSetReviewMode(reviewCb.checked));
  }
  kgBindReviewPanelEvents();
  kgBindDiscoverPanelEvents();
  kgEl("kg-run-search")?.addEventListener("click", () => kgRunSearch());
  kgEl("kg-search-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") kgRunSearch();
  });

  const drop = kgEl("kg-drop-zone");
  const fileInput = kgEl("kg-ingest-files");
  if (drop && fileInput) {
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("kg-drop-zone--over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("kg-drop-zone--over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("kg-drop-zone--over");
      fileInput.files = e.dataTransfer.files;
    });
    drop.addEventListener("click", () => fileInput.click());
  }
}

function initMiscKnowledgeGraph() {
  kgLoadStore();
  kgBindUi();
  kgRenderWorkspaceSelect();
  kgSetTab("overview");
  kgRenderSidebar();
  kgRenderElementLists();
  kgRenderIngestLog();
  kgRenderDocumentList();
  kgRenderReviewPanel();
  kgRenderDiscoverPanel();
  kgRenderRagHistory();
  kgUpdateMeta();
  requestAnimationFrame(() => {
    kgRefreshGraph();
  });
  window.decorateHelpLabels?.(
    document.querySelector('#dashboard-misc .menu-screen[data-l2="knowledge-graph"]'),
  );
}

window.initMiscKnowledgeGraph = initMiscKnowledgeGraph;