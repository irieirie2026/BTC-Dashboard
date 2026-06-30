/** Misc — Knowledge Graph + RAG (localStorage + optional server ingest/RAG) */

const KG_STORE_KEY = "misc:kg:store:v1";
const KG_API_INGEST = "/api/misc/knowledge-graph/ingest";
const KG_API_RAG = "/api/misc/knowledge-graph/rag";

let kgReady = false;
let kgStore = null;
let kgNetwork = null;
let kgNodes = null;
let kgEdges = null;
let kgSelected = null;
let kgTab = "schema";

const kgEl = (id) => document.getElementById(id);

function kgDefaultStore() {
  return {
    version: 1,
    schema: { nodes: [], edges: [] },
    documents: [],
    ingestLog: [],
    updatedAt: new Date().toISOString(),
  };
}

function kgLoadStore() {
  try {
    const raw = localStorage.getItem(KG_STORE_KEY);
    if (!raw) return kgDefaultStore();
    const parsed = JSON.parse(raw);
    return { ...kgDefaultStore(), ...parsed };
  } catch {
    return kgDefaultStore();
  }
}

function kgSaveStore() {
  kgStore.updatedAt = new Date().toISOString();
  localStorage.setItem(KG_STORE_KEY, JSON.stringify(kgStore));
  const meta = kgEl("kg-meta");
  if (meta) {
    meta.textContent = `Saved · ${kgStore.schema.nodes.length} nodes · ${kgStore.documents.length} docs`;
  }
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
  const byId = Object.fromEntries((kgStore.schema.nodes || []).map((n) => [n.id, n]));
  for (const ent of entities || []) {
    if (!ent?.id) continue;
    byId[ent.id] = { ...byId[ent.id], ...ent };
  }
  kgStore.schema.nodes = Object.values(byId);

  const edgeKeys = new Set((kgStore.schema.edges || []).map((e) => e.id || `${e.source}->${e.target}`));
  for (const rel of relationships || []) {
    const key = rel.id || `${rel.source}->${rel.target}`;
    if (!edgeKeys.has(key)) {
      kgStore.schema.edges.push({ ...rel, id: key });
      edgeKeys.add(key);
    }
  }
}

function kgClientExtract(text) {
  const tokens = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|bitcoin|BTC|ETF|halving)\b/g) || [];
  const nodes = [];
  const edges = [];
  const seen = new Set();
  for (const t of tokens.slice(0, 40)) {
    const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    nodes.push({ id, label: t, type: /btc|bitcoin/i.test(t) ? "asset" : "entity" });
  }
  if (seen.has("bitcoin") && seen.has("halving")) {
    edges.push({ id: "bitcoin->halving", source: "bitcoin", target: "halving", label: "has_event" });
  }
  return { entities: nodes, relationships: edges };
}

async function kgServerIngest(payload) {
  const res = await fetch(KG_API_INGEST, {
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

async function kgClientIngest({ type, url, text, title, file }) {
  let body = { type, url, text, title, filename: file?.name || "" };
  if (file && type === "pdf") {
    body.base64 = await kgFileToBase64(file);
  } else if (file && (type === "transcript" || type === "text" || type === "markdown")) {
    body.text = await kgReadTextFile(file);
  } else if (file && type !== "media") {
    body.text = await kgReadTextFile(file);
  }
  try {
    return await kgServerIngest(body);
  } catch (err) {
    const raw = body.text || text || "";
    if (!raw && !url) throw err;
    const chunks = [];
    for (let i = 0; i < raw.length; i += 900) {
      chunks.push({ text: raw.slice(i, i + 900), offset: i });
    }
    const { entities, relationships } = kgClientExtract(raw);
    return {
      title: title || file?.name || url || "Document",
      text: raw,
      chunks,
      metadata: { type, source: url || file?.name, ingestedAt: new Date().toISOString(), fallback: true },
      entities,
      relationships,
    };
  }
}

function kgInitGraph() {
  const container = kgEl("kg-graph-canvas");
  if (!container || typeof vis === "undefined") return;

  kgNodes = new vis.DataSet((kgStore.schema.nodes || []).map((n) => ({
    id: n.id,
    label: n.label || n.id,
    title: `${n.type || "node"} · ${n.label || n.id}`,
    color: n.type === "asset" ? "#e879f9" : n.type === "concept" ? "#93c5fd" : "#34d399",
    font: { color: "#e2e8f0", size: 14 },
  })));

  kgEdges = new vis.DataSet((kgStore.schema.edges || []).map((e) => ({
    id: e.id || `${e.source}-${e.target}`,
    from: e.source,
    to: e.target,
    label: e.label || "",
    arrows: "to",
    font: { color: "#94a3b8", size: 11, align: "middle" },
    color: { color: "#64748b", highlight: "#e879f9" },
  })));

  const options = {
    physics: { stabilization: true, barnesHut: { gravitationalConstant: -8000 } },
    interaction: { hover: true, multiselect: false },
    edges: { smooth: { type: "dynamic" } },
  };

  kgNetwork = new vis.Network(container, { nodes: kgNodes, edges: kgEdges }, options);

  kgNetwork.on("click", (params) => {
    if (!params.nodes.length) {
      kgSelected = null;
      kgRenderSidebar();
      return;
    }
    const id = params.nodes[0];
    kgSelected = { kind: "node", id, data: kgStore.schema.nodes.find((n) => n.id === id) };
    kgRenderSidebar();
  });

  kgNetwork.on("selectEdge", (params) => {
    if (!params.edges.length) return;
    const id = params.edges[0];
    kgSelected = { kind: "edge", id, data: kgStore.schema.edges.find((e) => (e.id || `${e.source}-${e.target}`) === id) };
    kgRenderSidebar();
  });
}

function kgRefreshGraph() {
  if (!kgNodes || !kgEdges) {
    kgInitGraph();
    return;
  }
  kgNodes.clear();
  kgEdges.clear();
  kgNodes.add((kgStore.schema.nodes || []).map((n) => ({
    id: n.id,
    label: n.label || n.id,
    title: `${n.type || "node"} · ${n.label || n.id}`,
    color: n.type === "asset" ? "#e879f9" : n.type === "concept" ? "#93c5fd" : "#34d399",
    font: { color: "#e2e8f0", size: 14 },
  })));
  kgEdges.add((kgStore.schema.edges || []).map((e) => ({
    id: e.id || `${e.source}-${e.target}`,
    from: e.source,
    to: e.target,
    label: e.label || "",
    arrows: "to",
    font: { color: "#94a3b8", size: 11, align: "middle" },
    color: { color: "#64748b", highlight: "#e879f9" },
  })));
}

function kgRenderSidebar() {
  const el = kgEl("kg-sidebar-body");
  if (!el) return;
  if (!kgSelected) {
    el.innerHTML = `<p class="kg-sidebar-hint">Click a node or edge to edit. Use toolbar to add nodes/edges.</p>`;
    return;
  }
  if (kgSelected.kind === "node") {
    const n = kgSelected.data || {};
    el.innerHTML = `
      <label class="kg-field">ID<input id="kg-f-id" value="${n.id || ""}" readonly></label>
      <label class="kg-field">Label<input id="kg-f-label" value="${n.label || ""}"></label>
      <label class="kg-field">Type
        <select id="kg-f-type">
          ${["entity", "asset", "concept", "person", "org", "event", "price_level"].map((t) =>
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
    kgEl("kg-del-node")?.addEventListener("click", () => {
      kgStore.schema.nodes = kgStore.schema.nodes.filter((x) => x.id !== n.id);
      kgStore.schema.edges = kgStore.schema.edges.filter((e) => e.source !== n.id && e.target !== n.id);
      kgSelected = null;
      kgSaveStore();
      kgRefreshGraph();
      kgRenderSidebar();
    });
    return;
  }
  const e = kgSelected.data || {};
  el.innerHTML = `
    <label class="kg-field">Source<input id="kg-f-src" value="${e.source || ""}"></label>
    <label class="kg-field">Target<input id="kg-f-tgt" value="${e.target || ""}"></label>
    <label class="kg-field">Label<input id="kg-f-elabel" value="${e.label || ""}"></label>
    <div class="kg-sidebar-actions">
      <button type="button" class="kg-btn" id="kg-save-edge">Save edge</button>
      <button type="button" class="kg-btn kg-btn--danger" id="kg-del-edge">Delete</button>
    </div>`;
  kgEl("kg-save-edge")?.addEventListener("click", () => {
    const edge = kgStore.schema.edges.find((x) => (x.id || `${x.source}-${x.target}`) === kgSelected.id);
    if (!edge) return;
    edge.source = kgEl("kg-f-src")?.value || edge.source;
    edge.target = kgEl("kg-f-tgt")?.value || edge.target;
    edge.label = kgEl("kg-f-elabel")?.value || edge.label;
    kgSaveStore();
    kgRefreshGraph();
  });
  kgEl("kg-del-edge")?.addEventListener("click", () => {
    kgStore.schema.edges = kgStore.schema.edges.filter((x) => (x.id || `${x.source}-${x.target}`) !== kgSelected.id);
    kgSelected = null;
    kgSaveStore();
    kgRefreshGraph();
    kgRenderSidebar();
  });
}

function kgAddNode() {
  const id = kgUid("node");
  kgStore.schema.nodes.push({ id, label: "New node", type: "entity" });
  kgSaveStore();
  kgRefreshGraph();
  kgSelected = { kind: "node", id, data: kgStore.schema.nodes.at(-1) };
  kgRenderSidebar();
}

function kgAddEdge() {
  const nodes = kgStore.schema.nodes;
  if (nodes.length < 2) return;
  const id = kgUid("edge");
  const edge = { id, source: nodes[0].id, target: nodes[1].id, label: "relates_to" };
  kgStore.schema.edges.push(edge);
  kgSaveStore();
  kgRefreshGraph();
  kgSelected = { kind: "edge", id, data: edge };
  kgRenderSidebar();
}

function kgExportJson() {
  const blob = new Blob([JSON.stringify(kgStore, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `btc-kg-${Date.now()}.json`;
  a.click();
}

function kgImportJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      kgStore = { ...kgDefaultStore(), ...JSON.parse(reader.result) };
      kgSaveStore();
      kgRefreshGraph();
      kgRenderIngestLog();
      kgRenderSidebar();
    } catch {
      alert("Invalid JSON");
    }
  };
  reader.readAsText(file);
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
    <table class="deriv-table kg-table">
      <thead><tr><th>Title</th><th>Type</th><th>Chunks</th><th>Entities</th><th>When</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${r.title}</td>
            <td><span class="mw-venue-tag">${r.type}</span></td>
            <td class="mono">${r.chunks}</td>
            <td class="mono">${r.entities}</td>
            <td class="mono">${new Date(r.at).toLocaleString()}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function kgRunIngest() {
  const url = kgEl("kg-ingest-url")?.value?.trim() || "";
  const text = kgEl("kg-ingest-text")?.value?.trim() || "";
  const title = kgEl("kg-ingest-title")?.value?.trim() || "";
  const fileInput = kgEl("kg-ingest-files");
  const files = [...(fileInput?.files || [])];
  const status = kgEl("kg-ingest-status");
  if (!url && !text && !files.length) {
    if (status) status.textContent = "Add a URL, text, or files.";
    return;
  }
  if (status) status.textContent = "Processing…";

  const batch = files.length ? files : [null];
  for (const file of batch) {
    const type = kgDetectType({ url: file ? "" : url, text, file });
    try {
      const result = await kgClientIngest({
        type,
        url: file ? "" : url,
        text: file ? "" : text,
        title,
        file,
      });
      const docId = kgUid("doc");
      kgStore.documents.push({
        id: docId,
        title: result.title,
        type: result.metadata?.type || type,
        source: result.metadata?.source,
        chunks: result.chunks || [],
        metadata: result.metadata,
        textPreview: (result.text || "").slice(0, 400),
      });
      kgMergeGraph(result.entities, result.relationships);
      kgStore.ingestLog.push({
        title: result.title,
        type: result.metadata?.type || type,
        chunks: (result.chunks || []).length,
        entities: (result.entities || []).length,
        at: new Date().toISOString(),
      });
    } catch (err) {
      if (status) status.textContent = `Failed: ${err.message}`;
      return;
    }
  }

  if (fileInput) fileInput.value = "";
  if (kgEl("kg-ingest-text")) kgEl("kg-ingest-text").value = "";
  if (kgEl("kg-ingest-url")) kgEl("kg-ingest-url").value = "";
  kgSaveStore();
  kgRefreshGraph();
  kgRenderIngestLog();
  if (status) status.textContent = `Ingested ${batch.length} source(s). Graph updated.`;
}

function kgAllChunks() {
  const out = [];
  for (const doc of kgStore.documents || []) {
    for (const ch of doc.chunks || []) {
      out.push({ ...ch, docTitle: doc.title, docId: doc.id });
    }
  }
  return out;
}

async function kgRunSearch() {
  const query = kgEl("kg-search-input")?.value?.trim();
  const out = kgEl("kg-search-results");
  if (!query || !out) return;
  out.innerHTML = '<p class="kg-loading">Searching…</p>';

  const payload = {
    query,
    graph: kgStore.schema,
    chunks: kgAllChunks(),
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

  const paths = (result.paths || [])
    .map((p) => `<li class="kg-path-item">${Array.isArray(p) ? p.join(" ") : p}</li>`)
    .join("");
  const snippets = (result.chunks || [])
    .map((c) => {
      const ts = c.timestamp ? `<span class="kg-ts">${c.timestamp}</span>` : "";
      const doc = c.docTitle ? `<span class="kg-doc">${c.docTitle}</span>` : "";
      return `<article class="kg-snippet">${doc}${ts}<p>${(c.text || "").slice(0, 420)}</p></article>`;
    })
    .join("");
  const nodes = (result.nodes || [])
    .map((n) => `<span class="kg-node-pill">${n.label || n.id}</span>`)
    .join("");

  out.innerHTML = `
    <section class="kg-answer-panel">
      <h4>Answer</h4>
      <div class="kg-answer">${result.answer || "—"}</div>
    </section>
    ${nodes ? `<section class="kg-hit-nodes"><h4>Graph nodes</h4>${nodes}</section>` : ""}
    ${paths ? `<section class="kg-paths"><h4>Graph paths</h4><ul>${paths}</ul></section>` : ""}
    <section class="kg-snippets"><h4>Document snippets</h4>${snippets || '<p class="mm-empty">No snippets.</p>'}</section>`;
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
    ? `Local RAG: ${scored.length} passage(s) match "${query}". Top: "${(scored[0].text || "").slice(0, 240)}…" (Set OPENAI_API_KEY on server for LLM answers.)`
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
  if (tab === "schema" && kgNetwork) {
    setTimeout(() => kgNetwork.redraw(), 50);
  }
}

function kgBindUi() {
  if (kgReady) return;
  kgReady = true;

  document.querySelectorAll(".kg-subtab").forEach((btn) => {
    btn.addEventListener("click", () => kgSetTab(btn.dataset.kgTab));
  });

  kgEl("kg-add-node")?.addEventListener("click", kgAddNode);
  kgEl("kg-add-edge")?.addEventListener("click", kgAddEdge);
  kgEl("kg-save-store")?.addEventListener("click", kgSaveStore);
  kgEl("kg-export-json")?.addEventListener("click", kgExportJson);
  kgEl("kg-import-json")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) kgImportJson(f);
  });
  kgEl("kg-run-ingest")?.addEventListener("click", () => kgRunIngest().catch(() => {}));
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
  kgStore = kgLoadStore();
  kgBindUi();
  kgSetTab("schema");
  kgInitGraph();
  kgRenderSidebar();
  kgRenderIngestLog();
  kgSaveStore();
  window.decorateHelpLabels?.(
    document.querySelector('#dashboard-misc .menu-screen[data-l2="knowledge-graph"]'),
  );
}

window.initMiscKnowledgeGraph = initMiscKnowledgeGraph;