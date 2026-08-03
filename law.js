/** The Law — Bitcoin legal status by jurisdiction (educational). */

const LAW_API = "/api/law";
const LAW_PREF_KEY = "btc-law-prefs:v1";
const LAW_CACHE_KEY = "btc-law-cache:v1";
const LAW_WORLD_MAP_URL = "/data/law-world-map.json";

const LAW_STATUS_COLORS = {
  legal: "#10b981",
  restricted: "#f59e0b",
  banned: "#ef4444",
  unclear: "#64748b",
};

let lawData = null;
let lawReady = false;
let lawView = "overview"; // overview | country | compare | watchlist | changes | sources
let lawCountryId = null;
let lawCompareIds = [];
/** @type {{ w:number, h:number, latMin:number, latMax:number, land:string, countries: Array<{iso2:string,name:string,d:string}> } | null} */
let lawWorldMap = null;
let lawWorldMapPromise = null;
let lawPrefs = {
  favorites: [],
  lastViewed: [],
  filters: { status: "", region: "", q: "", chips: [] },
};

function lawEl(id) {
  return document.getElementById(id);
}

function lawLoadPrefs() {
  try {
    const raw = localStorage.getItem(LAW_PREF_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    lawPrefs = {
      favorites: Array.isArray(p.favorites) ? p.favorites : [],
      lastViewed: Array.isArray(p.lastViewed) ? p.lastViewed : [],
      filters: {
        status: p.filters?.status || "",
        region: p.filters?.region || "",
        q: p.filters?.q || "",
        chips: Array.isArray(p.filters?.chips) ? p.filters.chips : [],
      },
    };
  } catch (_) {}
}

function lawSavePrefs() {
  try {
    localStorage.setItem(LAW_PREF_KEY, JSON.stringify(lawPrefs));
  } catch (_) {}
}

function lawEsc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lawTip(label, tip) {
  const t = lawEsc(tip);
  return `<span class="law-tip" tabindex="0" data-tip="${t}" title="${t}">${label}<span class="law-tip__mark" aria-hidden="true">?</span></span>`;
}

function lawStatusLabel(status) {
  return lawData?.statusMeta?.[status]?.label || status || "—";
}

function lawStatusBadge(status) {
  const s = status || "unclear";
  const label = lawData?.statusMeta?.[s]?.short || s;
  return `<span class="law-badge law-badge--${lawEsc(s)}">${lawEsc(label)}</span>`;
}

function lawFieldBadge(status) {
  const map = {
    legal: "Legal",
    allowed: "Allowed",
    restricted: "Restricted",
    banned: "Banned / no",
    no: "No",
    yes: "Yes",
    unclear: "Unclear",
  };
  const cls = ["legal", "allowed", "yes"].includes(status)
    ? "ok"
    : status === "restricted"
      ? "warn"
      : status === "banned" || status === "no"
        ? "bad"
        : "muted";
  return `<span class="law-field-badge law-field-badge--${cls}">${lawEsc(map[status] || status || "—")}</span>`;
}

function lawMapDims() {
  const w = lawWorldMap?.w || 960;
  const h = lawWorldMap?.h || 440;
  const latMin = lawWorldMap?.latMin ?? -58;
  const latMax = lawWorldMap?.latMax ?? 84;
  return { w, h, latMin, latMax };
}

/** Equirectangular projection matching data/law-world-map.json */
function lawProject(lat, lon, w, h, pad = 0) {
  const { latMin, latMax } = lawMapDims();
  const latN = Math.max(latMin, Math.min(latMax, Number(lat)));
  const lonN = Number(lon);
  const x = pad + ((lonN + 180) / 360) * (w - pad * 2);
  const y = pad + ((latMax - latN) / (latMax - latMin)) * (h - pad * 2);
  return [x, y];
}

async function lawEnsureWorldMap() {
  if (lawWorldMap) return lawWorldMap;
  if (lawWorldMapPromise) return lawWorldMapPromise;
  lawWorldMapPromise = (async () => {
    try {
      const res = await fetch(`${LAW_WORLD_MAP_URL}?v=1`);
      if (!res.ok) throw new Error(`map HTTP ${res.status}`);
      lawWorldMap = await res.json();
    } catch (err) {
      console.warn("[law] world basemap failed", err);
      lawWorldMap = {
        w: 960,
        h: 440,
        latMin: -58,
        latMax: 84,
        land: "",
        countries: [],
      };
    }
    return lawWorldMap;
  })();
  return lawWorldMapPromise;
}

function lawFilteredList() {
  const list = lawData?.jurisdictions || [];
  const { status, region, q, chips } = lawPrefs.filters;
  const qq = (q || "").trim().toLowerCase();
  return list.filter((j) => {
    if (status && j.status !== status) return false;
    if (region && j.region !== region) return false;
    if (chips?.length) {
      const ok = chips.every((c) => {
        if (["legal", "restricted", "banned", "unclear"].includes(c)) return j.status === c;
        if (c === "mica") return (j.tags || []).includes("mica") || j.region === "eu-mica";
        return (j.tags || []).includes(c);
      });
      if (!ok) return false;
    }
    if (qq) {
      const hay = `${j.name} ${j.iso2} ${j.summary} ${(j.tags || []).join(" ")}`.toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  });
}

function lawDisclaimerHtml(compact = false) {
  const d = lawData?.disclaimer || {};
  if (compact) {
    return `<aside class="law-disclaimer law-disclaimer--compact" role="note">
      <strong>Disclaimer.</strong> ${lawEsc(d.short || "Educational only — not legal, tax, or financial advice.")}
      <button type="button" class="law-link-btn" data-law-expand-disclaimer>Full disclaimer</button>
    </aside>`;
  }
  return `<aside class="law-disclaimer" role="note">
    <strong>Disclaimer — not legal, tax, or financial advice.</strong>
    <p>${lawEsc(d.full || d.short || "")}</p>
    <p class="law-disclaimer__source">${lawEsc(lawData?.sourcing || "")}</p>
  </aside>`;
}

/** Trusted static markdown → HTML (EU MiCA founder guide). */
function lawMarkdownToHtml(md) {
  if (!md) return "";
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let inList = false;
  let inCode = false;
  let codeBuf = [];

  const flushList = () => {
    if (inList === "ol") out.push("</ol>");
    else if (inList) out.push("</ul>");
    inList = false;
  };
  const flushCode = () => {
    if (!inCode) return;
    out.push(`<pre class="law-guide-pre"><code>${lawEsc(codeBuf.join("\n"))}</code></pre>`);
    codeBuf = [];
    inCode = false;
  };
  const inline = (s) => {
    let t = lawEsc(s);
    t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    return t;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) flushCode();
      else {
        flushList();
        inCode = true;
        codeBuf = [];
      }
      i += 1;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i += 1;
      continue;
    }

    // Tables
    if (trimmed.startsWith("|") && i + 1 < lines.length && /^\|[\s:-|]+\|$/.test(lines[i + 1].trim())) {
      flushList();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i]
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        if (!/^[\s:-]+$/.test(cells.join(""))) rows.push(cells);
        i += 1;
      }
      if (rows.length) {
        const head = rows[0];
        const body = rows.slice(1);
        out.push('<div class="law-guide-table-wrap"><table class="law-guide-table"><thead><tr>');
        head.forEach((c) => out.push(`<th>${inline(c)}</th>`));
        out.push("</tr></thead><tbody>");
        body.forEach((r) => {
          out.push("<tr>");
          r.forEach((c) => out.push(`<td>${inline(c)}</td>`));
          out.push("</tr>");
        });
        out.push("</tbody></table></div>");
      }
      continue;
    }

    if (!trimmed) {
      flushList();
      i += 1;
      continue;
    }
    if (trimmed === "---") {
      flushList();
      out.push('<hr class="law-guide-hr" />');
      i += 1;
      continue;
    }
    if (trimmed.startsWith("> ")) {
      flushList();
      out.push(`<blockquote class="law-guide-callout">${inline(trimmed.slice(2))}</blockquote>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("#### ")) {
      flushList();
      out.push(`<h4 class="law-guide-h4">${inline(trimmed.slice(5))}</h4>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      out.push(`<h3 class="law-guide-h3">${inline(trimmed.slice(4))}</h3>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      out.push(`<h2 class="law-guide-h2">${inline(trimmed.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      out.push(`<h1 class="law-guide-h1">${inline(trimmed.slice(2))}</h1>`);
      i += 1;
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      // render ordered as bullets for simplicity
      if (!inList) {
        out.push('<ol class="law-guide-ol">');
        inList = "ol";
      } else if (inList === true) {
        out.push("</ul>");
        out.push('<ol class="law-guide-ol">');
        inList = "ol";
      }
      out.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (inList === "ol") {
        out.push("</ol>");
        inList = false;
      }
      if (!inList) {
        out.push('<ul class="law-guide-ul">');
        inList = true;
      }
      out.push(`<li>${inline(trimmed.slice(2))}</li>`);
      i += 1;
      continue;
    }

    if (inList === "ol") {
      out.push("</ol>");
      inList = false;
    } else flushList();
    out.push(`<p class="law-guide-p">${inline(trimmed)}</p>`);
    i += 1;
  }
  if (inList === "ol") out.push("</ol>");
  else flushList();
  flushCode();
  return out.join("\n");
}

let lawMicaGuideHtml = null;

async function lawLoadMicaGuide() {
  if (lawMicaGuideHtml) return lawMicaGuideHtml;
  const res = await fetch(`/law-eu-mica-guide.md?v=1`);
  if (!res.ok) throw new Error(`Guide HTTP ${res.status}`);
  const md = await res.text();
  lawMicaGuideHtml = lawMarkdownToHtml(md);
  return lawMicaGuideHtml;
}

function lawRenderHero() {
  const el = lawEl("law-hero-text");
  if (el) {
    const base = lawData?.hero || "";
    el.innerHTML = `${lawEsc(base)}
      <span class="law-hero-cta"> · <button type="button" class="law-link-btn" data-law-open-mica>EU MiCA / Founders guide</button> (Italy-first, post–1 Jul 2026)</span>`;
    el.querySelector("[data-law-open-mica]")?.addEventListener("click", () => {
      void lawShowPanel("eu-mica");
    });
  }
  const meta = lawEl("law-data-meta");
  if (meta) {
    meta.textContent = `Dataset ${lawData?.dataVersion || "—"} · Updated ${
      lawData?.updatedAt ? new Date(lawData.updatedAt).toLocaleString() : "—"
    }`;
  }
}

function lawRenderStats() {
  const el = lawEl("law-stats");
  if (!el || !lawData) return;
  const c = lawData.counts || {};
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  el.innerHTML = [
    { k: "Jurisdictions", v: total, s: "In this dataset" },
    { k: "Legal / regulated", v: c.legal || 0, s: "Green on map" },
    { k: "Restricted", v: c.restricted || 0, s: "Amber" },
    { k: "Banned", v: c.banned || 0, s: "Red" },
    { k: "Unclear", v: c.unclear || 0, s: "Gray" },
  ]
    .map(
      (x) => `<article class="law-stat-card">
      <span class="law-stat-card__k">${x.k}</span>
      <span class="law-stat-card__v mono">${x.v}</span>
      <span class="law-stat-card__s">${x.s}</span>
    </article>`,
    )
    .join("");
}

function lawStatusByIso2() {
  const map = new Map();
  for (const j of lawData?.jurisdictions || []) {
    if (j.iso2) map.set(String(j.iso2).toUpperCase(), j);
  }
  return map;
}

function lawRenderMap() {
  const svg = lawEl("law-map-svg");
  if (!svg || !lawData) return;
  const { w, h, latMin, latMax } = lawMapDims();
  const list = lawFilteredList();
  const filteredIds = new Set(list.map((j) => j.id));
  const byIso = lawStatusByIso2();

  // Graticule
  const grid = [];
  for (let lon = -150; lon <= 150; lon += 30) {
    const [x] = lawProject(0, lon, w, h, 0);
    grid.push(
      `<line class="law-map-grid" x1="${x}" y1="0" x2="${x}" y2="${h}" />`,
    );
  }
  for (let lat = -30; lat <= 60; lat += 30) {
    if (lat < latMin || lat > latMax) continue;
    const [, y] = lawProject(lat, 0, w, h, 0);
    grid.push(
      `<line class="law-map-grid" x1="0" y1="${y}" x2="${w}" y2="${y}" />`,
    );
  }

  // Country polygons: status-colored when in dataset; muted land otherwise
  const countries = lawWorldMap?.countries || [];
  const landFallback = lawWorldMap?.land || "";
  let countryPaths = "";
  if (countries.length) {
    countryPaths = countries
      .map((c) => {
        const iso = (c.iso2 || "").toUpperCase();
        const j = iso ? byIso.get(iso) : null;
        const inFilter = j && filteredIds.has(j.id);
        let fill = "rgba(51, 65, 85, 0.55)";
        let stroke = "rgba(15, 23, 42, 0.75)";
        let cls = "law-map-land";
        let title = lawEsc(c.name || iso || "—");
        let dataId = "";
        if (j) {
          const color = LAW_STATUS_COLORS[j.status] || LAW_STATUS_COLORS.unclear;
          fill = inFilter ? color : "rgba(71, 85, 105, 0.35)";
          stroke = inFilter ? "rgba(15, 23, 42, 0.9)" : "rgba(15, 23, 42, 0.5)";
          cls = inFilter ? `law-map-country law-map-country--${j.status}` : "law-map-country law-map-country--dim";
          title = `${lawEsc(j.name)} — ${lawEsc(lawStatusLabel(j.status))}`;
          dataId = j.id;
        }
        const opacity = j && inFilter ? "0.78" : j ? "0.28" : "0.55";
        const clickable = dataId
          ? ` data-law-id="${lawEsc(dataId)}" role="button" tabindex="0" class="${cls}"`
          : ` class="${cls}"`;
        return `<path${clickable} d="${c.d}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="0.6"><title>${title}</title></path>`;
      })
      .join("");
  } else if (landFallback) {
    countryPaths = `<path class="law-map-land" d="${landFallback}" fill="rgba(51,65,85,0.7)" stroke="rgba(15,23,42,0.8)" stroke-width="0.5"/>`;
  }

  // Markers for all filtered jurisdictions (incl. tiny ones without polygons e.g. SG/HK)
  const dots = list
    .map((j) => {
      const [x, y] = lawProject(j.lat, j.lon, w, h, 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
      const color = LAW_STATUS_COLORS[j.status] || LAW_STATUS_COLORS.unclear;
      const fav = lawPrefs.favorites.includes(j.id) ? " law-map-dot--fav" : "";
      return `<g class="law-map-dot${fav}" data-law-id="${lawEsc(j.id)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" role="button" tabindex="0" aria-label="${lawEsc(j.name)}: ${lawEsc(j.status)}">
        <circle r="5.5" fill="${color}" fill-opacity="0.95" stroke="rgba(15,23,42,0.95)" stroke-width="1.4"/>
        <title>${lawEsc(j.name)} — ${lawEsc(lawStatusLabel(j.status))}</title>
      </g>`;
    })
    .join("");

  const basemapNote = lawWorldMap?.countries?.length
    ? "Click a country or marker · "
    : "Markers only (basemap loading…) · ";

  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.innerHTML = `
    <defs>
      <linearGradient id="law-ocean" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0b1220"/>
        <stop offset="100%" stop-color="#0a1628"/>
      </linearGradient>
      <filter id="law-soft" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="0.5" stdDeviation="0.6" flood-color="#000" flood-opacity="0.35"/>
      </filter>
    </defs>
    <rect class="law-map-ocean" width="${w}" height="${h}" fill="url(#law-ocean)" rx="8"/>
    ${grid.join("")}
    <g class="law-map-countries" filter="url(#law-soft)">${countryPaths}</g>
    <g class="law-map-markers">${dots}</g>
    <text x="14" y="18" class="law-map-caption">${basemapNote}${list.length} shown</text>
  `;
  svg.querySelectorAll("[data-law-id]").forEach((g) => {
    const go = () => lawOpenCountry(g.getAttribute("data-law-id"));
    g.addEventListener("click", go);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
}

function lawRenderChips() {
  const el = lawEl("law-filter-chips");
  if (!el || !lawData) return;
  const chips = lawData.filters || [];
  el.innerHTML = chips
    .map((c) => {
      const on = (lawPrefs.filters.chips || []).includes(c.id);
      return `<button type="button" class="law-chip${on ? " active" : ""}" data-law-chip="${lawEsc(c.id)}">${lawEsc(c.label)}</button>`;
    })
    .join("");
  el.querySelectorAll("[data-law-chip]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-law-chip");
      const set = new Set(lawPrefs.filters.chips || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      lawPrefs.filters.chips = [...set];
      lawSavePrefs();
      lawRenderList();
      lawRenderMap();
      lawRenderChips();
    });
  });
}

function lawRenderList() {
  const el = lawEl("law-list");
  if (!el) return;
  const list = lawFilteredList().sort((a, b) => a.name.localeCompare(b.name));
  const empty = lawEl("law-list-empty");
  if (empty) empty.hidden = list.length > 0;
  const count = lawEl("law-list-count");
  if (count) count.textContent = `${list.length} shown · click a card for detail`;
  if (!list.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = list
    .map((j) => {
      const fav = lawPrefs.favorites.includes(j.id);
      return `<button type="button" class="law-list-card" data-law-open="${lawEsc(j.id)}">
        <span class="law-list-card__top">
          <span class="law-list-flag mono">${lawEsc(j.iso2)}</span>
          ${lawStatusBadge(j.status)}
          <span class="law-list-fav${fav ? " is-fav" : ""}" aria-hidden="true">${fav ? "★" : "☆"}</span>
        </span>
        <span class="law-list-name">${lawEsc(j.name)}</span>
        <span class="law-list-blurb">${lawEsc((j.summary || "").slice(0, 110))}${(j.summary || "").length > 110 ? "…" : ""}</span>
      </button>`;
    })
    .join("");
  el.querySelectorAll("[data-law-open]").forEach((btn) => {
    btn.addEventListener("click", () => lawOpenCountry(btn.getAttribute("data-law-open")));
  });
}

function lawRenderFeatured() {
  const el = lawEl("law-featured");
  if (!el || !lawData) return;
  const items = lawData.featured || [];
  const updates = (lawData.recentUpdates || []).slice(0, 5);
  el.innerHTML = `
    <div class="law-featured-grid">
      ${(items || [])
        .map(
          (f) => `<button type="button" class="law-featured-card" data-law-open="${lawEsc(f.id)}">
          <span class="law-featured-card__head">${lawStatusBadge(f.status)}</span>
          <span class="law-featured-card__title">${lawEsc(f.name)}</span>
          <span class="law-featured-card__sum">${lawEsc((f.summary || "").slice(0, 140))}${(f.summary || "").length > 140 ? "…" : ""}</span>
          <span class="law-featured-meta">Verified ${lawEsc(f.lastVerified || "—")}</span>
        </button>`,
        )
        .join("")}
    </div>
    <div class="law-updates">
      <h3 class="law-subhead">Recent changes</h3>
      <ul class="law-updates-list">
        ${updates
          .map(
            (u) => `<li>
            <span class="mono law-updates-date">${lawEsc(u.date || "—")}</span>
            <button type="button" class="law-link-btn" data-law-open="${lawEsc(u.jurisdictionId)}">${lawEsc(u.jurisdictionName)}</button>
            — ${lawEsc(u.text || "")}
          </li>`,
          )
          .join("") || "<li>No changelog entries in dataset.</li>"}
      </ul>
    </div>`;
  el.querySelectorAll("[data-law-open]").forEach((n) => {
    n.addEventListener("click", () => lawOpenCountry(n.getAttribute("data-law-open")));
  });
}

function lawRememberView(id) {
  lawPrefs.lastViewed = [id, ...lawPrefs.lastViewed.filter((x) => x !== id)].slice(0, 12);
  lawSavePrefs();
}

function lawToggleFavorite(id) {
  const set = new Set(lawPrefs.favorites);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  lawPrefs.favorites = [...set];
  lawSavePrefs();
}

async function lawFetchCountry(id) {
  const cacheKey = `${LAW_CACHE_KEY}:${id}`;
  try {
    const res = await fetch(`${LAW_API}?jurisdiction=${encodeURIComponent(id)}&_=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (_) {}
    return data;
  } catch (err) {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    throw err;
  }
}

function lawBreadcrumb(parts) {
  const el = lawEl("law-breadcrumb");
  if (!el) return;
  el.innerHTML = parts
    .map((p, i) => {
      if (p.action) {
        return `<button type="button" class="law-bc-btn" data-law-bc="${lawEsc(p.action)}">${lawEsc(p.label)}</button>`;
      }
      return `<span class="law-bc-current">${lawEsc(p.label)}</span>`;
    })
    .join(` <span class="law-bc-sep">›</span> `);
  el.querySelectorAll("[data-law-bc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = btn.getAttribute("data-law-bc");
      const mc = window.MenuController;
      if (mc?.l1 === "law" && ["overview", "watchlist", "compare", "changes", "sources"].includes(a)) {
        mc.setLevel2(a);
        return;
      }
      if (a === "overview") lawShowOverview();
      else if (a === "watchlist") void lawShowPanel("watchlist");
      else if (a === "compare") void lawShowPanel("compare");
      else if (a === "changes") void lawShowPanel("changes");
      else if (a === "sources") void lawShowPanel("sources");
    });
  });
}

function lawSetPath(path) {
  try {
    if (window.history?.replaceState) {
      window.history.replaceState({}, "", path);
    }
  } catch (_) {}
}

function lawShowOverview() {
  lawView = "overview";
  lawCountryId = null;
  lawSetPanel("overview");
  lawBreadcrumb([{ label: "The Law", action: "overview" }, { label: "Overview" }]);
  lawSetPath("/law");
  // Keep top L2 tab in sync when returning via in-page breadcrumb
  try {
    if (window.MenuController?.l1 === "law" && window.MenuController.l2 !== "overview") {
      localStorage.setItem("btc-menu-l2", "overview");
      window.MenuController.l2 = "overview";
      document.querySelectorAll("#menu-l2-slot .dash-tab--l2").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.menuId === "overview");
      });
    }
  } catch (_) {}
  if (lawData) {
    lawRenderList();
    lawRenderMap();
    lawRenderFeatured();
    lawRenderStats();
    lawRenderHero();
  }
}

async function lawOpenCountry(id) {
  if (!id) return;
  const panel = lawEl("law-panel-country");
  if (!panel) return;
  lawSetPanel("country");
  panel.hidden = false;
  panel.innerHTML = `<p class="law-loading">Loading jurisdiction…</p>`;
  lawView = "country";
  lawCountryId = id;
  lawRememberView(id);
  lawSetPath(`/law/${id}`);
  try {
    const data = await lawFetchCountry(id);
    const j = data.jurisdiction;
    if (!j) throw new Error("Missing jurisdiction");
    const regionLabel = (lawData?.regions || []).find((r) => r.id === j.region)?.label || j.region;
    lawBreadcrumb([
      { label: "The Law", action: "overview" },
      { label: regionLabel, action: "overview" },
      { label: j.name },
    ]);
    const fav = lawPrefs.favorites.includes(j.id);
    const lt = j.legalTender || {};
    const prev = lt.previous;
    panel.innerHTML = `
      <header class="law-country-header">
        <div class="law-country-header__main">
          <span class="law-country-iso mono">${lawEsc(j.iso2)}</span>
          <h2>${lawEsc(j.name)}</h2>
          ${lawStatusBadge(j.status)}
          <p class="law-country-summary">${lawEsc(j.summary)}</p>
          <p class="law-country-meta">Last verified <strong>${lawEsc(j.lastVerified || "—")}</strong>
            · Confidence <strong>${lawEsc(j.confidence || "—")}</strong></p>
        </div>
        <div class="law-country-actions">
          <button type="button" class="law-btn" data-law-fav="${lawEsc(j.id)}">${fav ? "★ Favorited" : "☆ Add to favorites"}</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-share>Share</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-export>Export text</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-compare-add="${lawEsc(j.id)}">Add to compare</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-feedback>Report outdated info</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-back>← All jurisdictions</button>
        </div>
      </header>

      <section class="law-grid-status" aria-label="Key status">
        ${[
          ["Holding BTC", j.holding],
          ["Trading / exchanges", j.trading],
          ["Payments", j.payments],
          ["Mining", j.mining],
          ["Legal tender", { status: lt.status, note: lt.note }],
        ]
          .map(
            ([label, field]) => `<article class="law-status-cell">
            <h3>${lawEsc(label)}</h3>
            ${lawFieldBadge(field?.status)}
            <p>${lawEsc(field?.note || "")}</p>
          </article>`,
          )
          .join("")}
      </section>

      ${
        prev
          ? `<section class="law-panel law-panel--amber">
          <h3>Legal-tender history</h3>
          <p>Previously: <strong>${lawEsc(prev.status)}</strong>
          ${prev.from ? ` from ${lawEsc(prev.from)}` : ""}${prev.until ? ` until ${lawEsc(prev.until)}` : ""}.
          ${lawEsc(prev.note || "")}</p>
        </section>`
          : ""
      }

      <div class="law-two-col">
        <section class="law-panel">
          <h3>${lawTip("Regulatory framework", "High-level laws and supervisors for BTC intermediaries — not a full securities or DeFi treatise.")}</h3>
          <p><strong>Regulators:</strong> ${lawEsc((j.regulators || []).join(" · ") || "—")}</p>
          <p>${lawEsc(j.framework || "")}</p>
          <p><strong>Service-provider licensing:</strong> ${lawEsc(j.vaspLicensing || "—")}</p>
        </section>
        <section class="law-panel">
          <h3>${lawTip("Tax (individuals)", "Headline only. Full tax law is fact-specific and changes often.")}</h3>
          <p class="law-tax-headline">${lawEsc(j.taxHeadline || "—")}</p>
          <p class="law-muted">${lawEsc(j.taxNote || "Consult a qualified tax professional in this jurisdiction.")}</p>
        </section>
      </div>

      <section class="law-panel">
        <h3>Additional notes</h3>
        <p>${lawEsc(j.notes || "—")}</p>
        ${(j.changelog || []).length ? `<h4 class="law-subhead">Change log</h4><ul class="law-changelog">${(j.changelog || [])
          .map((c) => `<li><span class="mono">${lawEsc(c.date)}</span> — ${lawEsc(c.text)}</li>`)
          .join("")}</ul>` : ""}
      </section>

      <section class="law-panel">
        <h3>Sources</h3>
        <ul class="law-sources">
          ${(j.sources || [])
            .map(
              (s) => `<li><a href="${lawEsc(s.url)}" target="_blank" rel="noopener noreferrer">${lawEsc(s.title || s.url)}</a></li>`,
            )
            .join("") || "<li>No primary links recorded.</li>"}
        </ul>
      </section>
    `;

    panel.querySelector("[data-law-back]")?.addEventListener("click", () => lawShowOverview());
    panel.querySelector("[data-law-fav]")?.addEventListener("click", (e) => {
      lawToggleFavorite(j.id);
      e.currentTarget.textContent = lawPrefs.favorites.includes(j.id) ? "★ Favorited" : "☆ Add to favorites";
      lawRenderList();
      lawRenderMap();
    });
    panel.querySelector("[data-law-share]")?.addEventListener("click", async () => {
      const url = `${location.origin}/law/${j.id}`;
      try {
        if (navigator.share) await navigator.share({ title: `Bitcoin law: ${j.name}`, url });
        else {
          await navigator.clipboard.writeText(url);
          alert("Link copied.");
        }
      } catch (_) {}
    });
    panel.querySelector("[data-law-export]")?.addEventListener("click", () => lawExportCountry(j));
    panel.querySelector("[data-law-compare-add]")?.addEventListener("click", () => {
      if (!lawCompareIds.includes(j.id)) {
        lawCompareIds = [...lawCompareIds, j.id].slice(-3);
      }
      lawShowPanel("compare");
    });
    panel.querySelector("[data-law-feedback]")?.addEventListener("click", () => lawOpenFeedback(j.id));
  } catch (err) {
    panel.innerHTML = `<p class="law-error">Could not load jurisdiction — ${lawEsc(err.message || "error")}.
      <button type="button" class="law-btn" data-law-back>Back</button></p>`;
    panel.querySelector("[data-law-back]")?.addEventListener("click", () => lawShowOverview());
  }
}

function lawExportCountry(j) {
  const lt = j.legalTender || {};
  const text = [
    `Bitcoin legal status — ${j.name} (${j.iso2})`,
    `Overall: ${j.status}`,
    j.summary,
    "",
    `Holding: ${j.holding?.status} — ${j.holding?.note || ""}`,
    `Trading: ${j.trading?.status} — ${j.trading?.note || ""}`,
    `Payments: ${j.payments?.status} — ${j.payments?.note || ""}`,
    `Mining: ${j.mining?.status} — ${j.mining?.note || ""}`,
    `Legal tender: ${lt.status} — ${lt.note || ""}`,
    "",
    `Tax (headline): ${j.taxHeadline || ""}`,
    `Framework: ${j.framework || ""}`,
    `Last verified: ${j.lastVerified || ""}`,
    "",
    "DISCLAIMER: Educational only — not legal, tax, or financial advice. Verify official sources.",
  ].join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `btc-law-${j.id}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function lawOpenFeedback(id) {
  const msg = window.prompt(
    "Describe what looks outdated (jurisdiction, field, and a source URL if you have one):",
    id ? `Jurisdiction: ${id}\n` : "",
  );
  if (msg == null) return;
  try {
    const key = "btc-law-feedback:v1";
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    prev.push({ at: new Date().toISOString(), id, msg });
    localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
    alert("Thanks — feedback saved locally for the product team.");
  } catch (_) {
    alert("Could not save feedback locally.");
  }
}

function lawCardBtn(j) {
  return `<button type="button" class="law-list-card" data-law-open="${lawEsc(j.id)}">
    <span class="law-list-card__top">
      <span class="law-list-flag mono">${lawEsc(j.iso2)}</span>
      ${lawStatusBadge(j.status)}
    </span>
    <span class="law-list-name">${lawEsc(j.name)}</span>
    <span class="law-list-blurb">${lawEsc((j.summary || "").slice(0, 100))}${(j.summary || "").length > 100 ? "…" : ""}</span>
  </button>`;
}

function lawSetPanel(which) {
  /** @type {"overview"|"country"|"utility"} */
  const mode = which;
  const overview = lawEl("law-panel-overview");
  const country = lawEl("law-panel-country");
  const utility = lawEl("law-panel-utility");
  if (overview) {
    overview.hidden = mode !== "overview";
    if (mode !== "overview") {
      /* keep DOM for fast return; only clear country/utility content when leaving them */
    }
  }
  if (country) {
    country.hidden = mode !== "country";
    if (mode !== "country") country.innerHTML = "";
  }
  if (utility) {
    utility.hidden = mode !== "utility";
    if (mode !== "utility") utility.innerHTML = "";
  }
}

async function lawShowPanel(name) {
  const allowed = ["watchlist", "compare", "changes", "sources", "eu-mica"];
  if (!allowed.includes(name)) {
    lawShowOverview();
    return;
  }
  if (!lawData && name !== "eu-mica") {
    await lawLoad(name);
    return;
  }
  // Guide can load even if jurisdiction payload is slow; still prefer full load for chrome
  if (!lawData) {
    try {
      await lawLoad(name);
    } catch (_) {
      /* guide-only fallback below */
    }
  }

  lawView = name;
  lawCountryId = null;
  const util = lawEl("law-panel-utility");
  if (!util) {
    console.error("[The Law] missing #law-panel-utility");
    return;
  }
  lawSetPanel("utility");
  util.hidden = false;

  const titles = {
    watchlist: "Watchlist",
    compare: "Compare",
    changes: "Changes",
    sources: "Sources",
    "eu-mica": "EU MiCA / Founders",
  };
  lawBreadcrumb([
    { label: "The Law", action: "overview" },
    { label: titles[name] || name },
  ]);
  lawSetPath(`/law/${name}`);

  try {
    if (window.MenuController?.l1 === "law") {
      localStorage.setItem("btc-menu-l2", name);
      window.MenuController.l2 = name;
      document.querySelectorAll("#menu-l2-slot .dash-tab--l2").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.menuId === name);
      });
    }
  } catch (_) {}

  if (name === "eu-mica") {
    util.innerHTML = `
      <section class="panel law-guide-panel">
        <div class="panel-header">
          <h2>EU MiCA / Founders</h2>
          <span class="panel-meta">Italy-first · post–1 Jul 2026 · educational</span>
        </div>
        <div class="law-panel-body">
          <p class="law-muted">Comprehensive founder guide for Italian and EU crypto startups under fully in-force MiCA. Not legal advice — verify the live ESMA register and local counsel.</p>
          <div id="law-mica-guide-root" class="law-guide-root"><p class="law-loading">Loading guide…</p></div>
          <p style="margin-top:1rem"><button type="button" class="law-btn" data-law-back>← Overview</button></p>
        </div>
      </section>`;
    const root = lawEl("law-mica-guide-root");
    try {
      const html = await lawLoadMicaGuide();
      if (root) root.innerHTML = html;
    } catch (err) {
      if (root) {
        root.innerHTML = `<p class="law-error">Could not load guide — ${lawEsc(err.message || "error")}. Ensure <code>law-eu-mica-guide.md</code> is deployed.</p>`;
      }
    }
  } else if (name === "watchlist") {
    const favs = (lawPrefs.favorites || [])
      .map((id) => (lawData?.jurisdictions || []).find((j) => j.id === id))
      .filter(Boolean);
    const recent = (lawPrefs.lastViewed || [])
      .map((id) => (lawData?.jurisdictions || []).find((j) => j.id === id))
      .filter(Boolean);
    util.innerHTML = `
      <section class="panel">
        <div class="panel-header">
          <h2>Watchlist</h2>
          <span class="panel-meta">Saved on this device only</span>
        </div>
        <div class="law-panel-body">
          <p class="law-muted">Favorites stay in local browser storage — they are not synced to an account.</p>
          <div class="law-list">${
            favs.length
              ? favs.map(lawCardBtn).join("")
              : `<p class="law-empty">No favorites yet — open a country and tap <strong>Add to favorites</strong>.</p>`
          }</div>
          <h3 class="law-subhead">Recently viewed</h3>
          <div class="law-list">${
            recent.length ? recent.map(lawCardBtn).join("") : `<p class="law-muted">None yet.</p>`
          }</div>
          <p style="margin-top:0.75rem"><button type="button" class="law-btn" data-law-back>← Overview</button></p>
        </div>
      </section>`;
  } else if (name === "compare") {
    util.innerHTML = `
      <section class="panel">
        <div class="panel-header">
          <h2>Compare jurisdictions</h2>
          <span class="panel-meta">Select up to 3 countries</span>
        </div>
        <div class="law-panel-body">
          <p class="law-muted">Tick 2–3 countries below, or add from a country page with <strong>Add to compare</strong>.</p>
          <div class="law-compare-pick" id="law-compare-pick"></div>
          <div class="law-compare-grid" id="law-compare-grid"><p class="law-loading">Select countries to compare…</p></div>
          <p style="margin-top:0.75rem"><button type="button" class="law-btn" data-law-back>← Overview</button></p>
        </div>
      </section>`;
    await lawRenderCompare();
  } else if (name === "changes") {
    const updates = lawData?.recentUpdates || [];
    util.innerHTML = `
      <section class="panel">
        <div class="panel-header">
          <h2>What changed recently</h2>
          <span class="panel-meta">From curated change logs</span>
        </div>
        <div class="law-panel-body">
          <ul class="law-updates-list law-updates-list--full">
            ${
              updates
                .map(
                  (u) => `<li>
              <span class="mono">${lawEsc(u.date)}</span>
              <button type="button" class="law-link-btn" data-law-open="${lawEsc(u.jurisdictionId)}">${lawEsc(u.jurisdictionName)}</button>
              — ${lawEsc(u.text)}
            </li>`,
                )
                .join("") || "<li>No entries.</li>"
            }
          </ul>
          <p style="margin-top:0.75rem"><button type="button" class="law-btn" data-law-back>← Overview</button></p>
        </div>
      </section>`;
  } else if (name === "sources") {
    util.innerHTML = `
      <section class="panel">
        <div class="panel-header">
          <h2>How we source and update this data</h2>
          <span class="panel-meta">Dataset ${lawEsc(lawData?.dataVersion || "—")}</span>
        </div>
        <div class="law-panel-body">
          <p>${lawEsc(lawData?.sourcing || "")}</p>
          <p class="law-muted">${lawEsc(lawData?.processNote || "")}</p>
          <p>Content freshness process: <strong>${lawEsc(lawData?.contentFreshness || "—")}</strong></p>
          <h3 class="law-subhead">Reference trackers (secondary)</h3>
          <ul class="law-sources">
            <li>CryptoSlate Crypto Laws tracker</li>
            <li>CryptoLawMap</li>
            <li>Cryptowisser Regulation Map</li>
            <li>Industry 2025–2026 country legality surveys</li>
            <li>Primary: EU MiCA EUR-Lex, national regulators, central banks</li>
          </ul>
          <p style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.4rem">
            <button type="button" class="law-btn" data-law-feedback>Report outdated information</button>
            <button type="button" class="law-btn law-btn--ghost" data-law-back>← Overview</button>
          </p>
        </div>
      </section>`;
  }

  util.querySelector("[data-law-back]")?.addEventListener("click", () => {
    if (window.MenuController?.l1 === "law") {
      window.MenuController.setLevel2("overview");
    } else {
      lawShowOverview();
    }
  });
  util.querySelectorAll("[data-law-open]").forEach((n) => {
    n.addEventListener("click", () => lawOpenCountry(n.getAttribute("data-law-open")));
  });
  util.querySelector("[data-law-feedback]")?.addEventListener("click", () => lawOpenFeedback(null));
}

async function lawRenderCompare() {
  const pick = lawEl("law-compare-pick");
  const grid = lawEl("law-compare-grid");
  if (!pick || !grid) return;
  const all = (lawData?.jurisdictions || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  pick.innerHTML = all
    .map((j) => {
      const on = lawCompareIds.includes(j.id);
      return `<label class="law-compare-check"><input type="checkbox" data-law-cmp="${lawEsc(j.id)}" ${on ? "checked" : ""} ${!on && lawCompareIds.length >= 3 ? "disabled" : ""}/> ${lawEsc(j.name)}</label>`;
    })
    .join("");
  pick.querySelectorAll("input[data-law-cmp]").forEach((inp) => {
    inp.addEventListener("change", async () => {
      const id = inp.getAttribute("data-law-cmp");
      if (inp.checked) {
        if (lawCompareIds.length >= 3) {
          inp.checked = false;
          return;
        }
        lawCompareIds.push(id);
      } else {
        lawCompareIds = lawCompareIds.filter((x) => x !== id);
      }
      await lawRenderCompare();
    });
  });

  if (!lawCompareIds.length) {
    grid.innerHTML = `<p class="law-empty">Select 2–3 jurisdictions to compare.</p>`;
    return;
  }
  grid.innerHTML = `<p class="law-loading">Loading comparison…</p>`;
  try {
    const rows = await Promise.all(lawCompareIds.map((id) => lawFetchCountry(id)));
    const js = rows.map((r) => r.jurisdiction).filter(Boolean);
    const fields = [
      ["Status", (j) => j.status],
      ["Holding", (j) => j.holding?.status],
      ["Trading", (j) => j.trading?.status],
      ["Payments", (j) => j.payments?.status],
      ["Mining", (j) => j.mining?.status],
      ["Legal tender", (j) => j.legalTender?.status],
      ["Tax headline", (j) => j.taxHeadline],
      ["Regulators", (j) => (j.regulators || []).join(", ")],
    ];
    grid.innerHTML = `<div class="law-compare-table-wrap"><table class="law-compare-table">
      <thead><tr><th>Field</th>${js.map((j) => `<th>${lawEsc(j.name)}</th>`).join("")}</tr></thead>
      <tbody>
        ${fields
          .map(
            ([label, fn]) => `<tr>
            <th scope="row">${lawEsc(label)}</th>
            ${js.map((j) => `<td>${lawEsc(String(fn(j) || "—"))}</td>`).join("")}
          </tr>`,
          )
          .join("")}
      </tbody>
    </table></div>`;
  } catch (err) {
    grid.innerHTML = `<p class="law-error">${lawEsc(err.message || "Compare failed")}</p>`;
  }
}

function lawBindChrome() {
  if (lawReady) return;
  lawReady = true;
  lawEl("law-search")?.addEventListener("input", (e) => {
    lawPrefs.filters.q = e.target.value || "";
    lawSavePrefs();
    lawRenderList();
    lawRenderMap();
    lawRenderAutocomplete();
  });
  lawEl("law-filter-status")?.addEventListener("change", (e) => {
    lawPrefs.filters.status = e.target.value || "";
    lawSavePrefs();
    lawRenderList();
    lawRenderMap();
  });
  lawEl("law-filter-region")?.addEventListener("change", (e) => {
    lawPrefs.filters.region = e.target.value || "";
    lawSavePrefs();
    lawRenderList();
    lawRenderMap();
  });
  lawEl("law-clear-filters")?.addEventListener("click", () => {
    lawPrefs.filters = { status: "", region: "", q: "", chips: [] };
    lawSavePrefs();
    const s = lawEl("law-search");
    if (s) s.value = "";
    const st = lawEl("law-filter-status");
    if (st) st.value = "";
    const rg = lawEl("law-filter-region");
    if (rg) rg.value = "";
    lawRenderChips();
    lawRenderList();
    lawRenderMap();
  });
}

function lawRenderAutocomplete() {
  const box = lawEl("law-search-suggest");
  if (!box) return;
  const q = (lawPrefs.filters.q || "").trim().toLowerCase();
  if (q.length < 1) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const hits = (lawData?.jurisdictions || [])
    .filter((j) => j.name.toLowerCase().includes(q) || j.iso2.toLowerCase().includes(q))
    .slice(0, 8);
  if (!hits.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = hits
    .map(
      (j) => `<button type="button" class="law-suggest-item" data-law-open="${lawEsc(j.id)}">
      <span class="mono">${lawEsc(j.iso2)}</span> ${lawEsc(j.name)} ${lawStatusBadge(j.status)}
    </button>`,
    )
    .join("");
  box.querySelectorAll("[data-law-open]").forEach((b) => {
    b.addEventListener("click", () => {
      box.hidden = true;
      lawOpenCountry(b.getAttribute("data-law-open"));
    });
  });
}

function lawFillFilterSelects() {
  const st = lawEl("law-filter-status");
  if (st && lawData?.statusMeta) {
    st.innerHTML =
      `<option value="">All statuses</option>` +
      Object.entries(lawData.statusMeta)
        .map(([id, m]) => `<option value="${lawEsc(id)}">${lawEsc(m.label)}</option>`)
        .join("");
    st.value = lawPrefs.filters.status || "";
  }
  const rg = lawEl("law-filter-region");
  if (rg && lawData?.regions) {
    rg.innerHTML =
      `<option value="">All regions</option>` +
      lawData.regions.map((r) => `<option value="${lawEsc(r.id)}">${lawEsc(r.label)}</option>`).join("");
    rg.value = lawPrefs.filters.region || "";
  }
  const search = lawEl("law-search");
  if (search) search.value = lawPrefs.filters.q || "";
}

/** @param {string} [preferredTab] explicit L2 tab / country slug wins over URL path */
async function lawLoad(preferredTab) {
  lawLoadPrefs();
  const loading = lawEl("law-loading");
  const err = lawEl("law-error");
  if (loading) loading.hidden = false;
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  try {
    let data = null;
    try {
      const res = await fetch(`${LAW_API}?_=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (fetchErr) {
      const cached = sessionStorage.getItem(LAW_CACHE_KEY);
      if (cached) data = JSON.parse(cached);
      else throw fetchErr;
    }
    lawData = data;
    try {
      sessionStorage.setItem(LAW_CACHE_KEY, JSON.stringify(data));
    } catch (_) {}
    await lawEnsureWorldMap();
    lawFillFilterSelects();
    lawRenderHero();
    lawRenderStats();
    lawRenderChips();
    lawRenderFeatured();
    lawRenderList();
    lawRenderMap();
    lawBindChrome();
    const disc = lawEl("law-disclaimer-bar");
    if (disc) {
      disc.innerHTML = lawDisclaimerHtml(true);
      disc.querySelector("[data-law-expand-disclaimer]")?.addEventListener("click", () => {
        alert(lawData?.disclaimer?.full || "");
      });
    }

    const utilityTabs = ["compare", "watchlist", "changes", "sources", "eu-mica"];
    const path = (location.pathname || "").replace(/\/$/, "");
    const m = path.match(/^\/law\/([a-z0-9-]+)$/i);
    let pathSlug = m ? m[1].toLowerCase() : "";
    if (pathSlug === "mica" || pathSlug === "founders") pathSlug = "eu-mica";
    const sessionCountry = sessionStorage.getItem("law-open-country");
    if (sessionCountry) sessionStorage.removeItem("law-open-country");

    // Explicit menu tab always wins (fixes sticky /law/compare overriding Overview)
    const tab = preferredTab || null;
    if (tab && utilityTabs.includes(tab)) {
      await lawShowPanel(tab);
    } else if (tab && tab !== "overview") {
      await lawOpenCountry(tab);
    } else if (tab === "overview") {
      lawShowOverview();
    } else if (pathSlug && utilityTabs.includes(pathSlug)) {
      await lawShowPanel(pathSlug);
    } else if (pathSlug && pathSlug !== "overview") {
      await lawOpenCountry(pathSlug);
    } else if (sessionCountry) {
      await lawOpenCountry(sessionCountry);
    } else {
      lawShowOverview();
    }

    const meta = document.getElementById("header-dashboard-meta");
    if (meta && document.body.dataset.l1 === "law") {
      meta.textContent = `The Law · ${data.dataVersion || "—"} · ${(data.jurisdictions || []).length} jurisdictions`;
    }
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = `Could not load The Law — ${e.message || e}`;
    }
  } finally {
    if (loading) loading.hidden = true;
  }
}

function initLaw(tab) {
  const t = tab || "overview";
  const utilityTabs = ["compare", "watchlist", "changes", "sources", "eu-mica"];

  // Data already loaded — switch panels immediately (L2 tab clicks)
  if (lawData) {
    if (utilityTabs.includes(t)) {
      void lawShowPanel(t);
      return;
    }
    if (t === "overview") {
      lawShowOverview();
      return;
    }
    void lawOpenCountry(t);
    return;
  }

  // First visit — load then open the requested tab
  void lawLoad(t);
}

window.initLaw = initLaw;
window.lawOpenCountry = lawOpenCountry;
window.lawShowPanel = lawShowPanel;
