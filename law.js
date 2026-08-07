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
/** Default Focus hubs shortlist (relocate browser ids). User can pin/unpin; stored in localStorage. */
const LAW_DEFAULT_FOCUS_HUBS = [
  "panama",
  "uae",
  "el-salvador",
  "paraguay",
  "georgia",
  "costa-rica",
  "kazakhstan",
  "guatemala",
  "japan",
];

let lawPrefs = {
  favorites: [],
  lastViewed: [],
  focusHubs: [...LAW_DEFAULT_FOCUS_HUBS],
  filters: { status: "", region: "", q: "", chips: [], favoritesOnly: false },
};

function lawEl(id) {
  return document.getElementById(id);
}

function lawLoadPrefs() {
  try {
    const raw = localStorage.getItem(LAW_PREF_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    const focusHubs = Array.isArray(p.focusHubs)
      ? p.focusHubs.filter((id) => typeof id === "string" && id)
      : [...LAW_DEFAULT_FOCUS_HUBS];
    lawPrefs = {
      favorites: Array.isArray(p.favorites) ? p.favorites : [],
      lastViewed: Array.isArray(p.lastViewed) ? p.lastViewed : [],
      focusHubs: focusHubs.length ? focusHubs : [...LAW_DEFAULT_FOCUS_HUBS],
      filters: {
        status: p.filters?.status || "",
        region: p.filters?.region || "",
        q: p.filters?.q || "",
        chips: Array.isArray(p.filters?.chips) ? p.filters.chips : [],
        favoritesOnly: Boolean(p.filters?.favoritesOnly),
      },
    };
  } catch (_) {}
}

function lawGetFocusHubIds() {
  const ids = Array.isArray(lawPrefs.focusHubs) ? lawPrefs.focusHubs.filter(Boolean) : [];
  return ids.length ? ids : [...LAW_DEFAULT_FOCUS_HUBS];
}

function lawIsFocusHub(relocateId) {
  if (!relocateId) return false;
  return lawGetFocusHubIds().includes(relocateId);
}

/** Pin or unpin a relocate destination from Focus hubs (persisted locally). */
function lawToggleFocusHub(relocateId) {
  if (!relocateId) return false;
  const set = new Set(lawGetFocusHubIds());
  if (set.has(relocateId)) set.delete(relocateId);
  else set.add(relocateId);
  lawPrefs.focusHubs = [...set];
  // Keep browser `priority` flag in sync for filters / badges
  LAW_RELOCATE_BROWSER.forEach((c) => {
    c.priority = set.has(c.id);
    if (c.priority && !(c.tags || []).includes("priority")) {
      c.tags = [...(c.tags || []), "priority"];
    } else if (!c.priority && c.tags) {
      c.tags = c.tags.filter((t) => t !== "priority");
    }
  });
  lawSavePrefs();
  return set.has(relocateId);
}

function lawResetFocusHubs() {
  lawPrefs.focusHubs = [...LAW_DEFAULT_FOCUS_HUBS];
  const set = new Set(lawPrefs.focusHubs);
  LAW_RELOCATE_BROWSER.forEach((c) => {
    c.priority = set.has(c.id);
  });
  lawSavePrefs();
}

/** Apply stored focus hubs onto browser priority flags (call after prefs + browser load). */
function lawApplyFocusHubFlags() {
  const set = new Set(lawGetFocusHubIds());
  LAW_RELOCATE_BROWSER.forEach((c) => {
    c.priority = set.has(c.id);
  });
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
  // data-tip only — never set title= (browser native tooltip doubles the styled box)
  return `<span class="law-tip" tabindex="0" data-tip="${t}" aria-label="${t}">${label}<span class="law-tip__mark" aria-hidden="true">?</span></span>`;
}

/** Tooltip data attrs only — add class="law-has-tip" on the element yourself when needed */
function lawTipAttrs(tip) {
  const t = lawEsc(tip);
  return `tabindex="0" data-tip="${t}" aria-label="${t}"`;
}

/**
 * Acronym / term glossary for The Law (tooltips + per-page legend of terms actually used).
 * Keys matched case-insensitively as whole tokens; longest keys win first.
 */
const LAW_GLOSSARY = {
  // EU / product law
  MiCA: "Markets in Crypto-Assets — EU regulation for crypto-asset issuance and service providers.",
  CASP: "Crypto-Asset Service Provider — a firm authorised under MiCA to offer crypto services in the EU.",
  EMT: "E-Money Token — MiCA category of crypto-asset that aims to maintain a stable value by referencing one fiat currency.",
  ART: "Asset-Referenced Token — MiCA category referencing multiple assets/currencies (not a single fiat).",
  ESMA: "European Securities and Markets Authority — EU financial markets supervisor; publishes MiCA guidance and registers.",
  EBA: "European Banking Authority — EU banking supervisor; relevant for e-money and some crypto-asset rules.",
  TFR: "Transfer of Funds Regulation (EU) — “Travel Rule” for crypto transfers: originator/beneficiary info between VASPs/CASPs.",
  "Travel Rule": "Requirement for crypto service providers to share sender/receiver information on transfers (EU TFR and FATF-style rules).",
  NCA: "National Competent Authority — a country’s supervisor that licenses/supervises CASPs under MiCA.",
  CONSOB: "Commissione Nazionale per le Società e la Borsa — Italy’s securities markets authority.",
  CNMV: "Comisión Nacional del Mercado de Valores — Spain’s securities markets authority.",
  BaFin: "Bundesanstalt für Finanzdienstleistungsaufsicht — Germany’s financial supervisor.",
  AMF: "Autorité des Marchés Financiers — France’s financial markets authority.",
  ACPR: "Autorité de Contrôle Prudentiel et de Résolution — France’s prudential supervisor (banks/insurers).",
  FCA: "Financial Conduct Authority — UK financial markets regulator (cryptoasset registration and promotions).",
  FINMA: "Swiss Financial Market Supervisory Authority.",
  MAS: "Monetary Authority of Singapore — Singapore’s central bank and financial regulator.",
  FSA: "Financial Services Agency (Japan) — or, depending on country, another financial services authority; check local context.",
  SFC: "Securities and Futures Commission — Hong Kong’s securities regulator (virtual asset platforms).",
  SEC: "Securities and Exchange Commission — US (or local) securities regulator; context-dependent.",
  CFTC: "Commodity Futures Trading Commission — US derivatives/commodities regulator.",
  FinCEN: "Financial Crimes Enforcement Network — US AML authority; MSB registration.",
  MSB: "Money Services Business — US AML category for many money transmitters and crypto exchanges.",
  MTL: "Money Transmitter License — US state licence often needed for crypto exchange/transfer businesses.",
  BCB: "Banco Central do Brasil — Brazil’s central bank (virtual-asset service provider rules).",
  CVM: "Comissão de Valores Mobiliários — Brazil’s securities commission.",
  FSCA: "Financial Sector Conduct Authority — South Africa’s market conduct regulator.",
  FAIS: "Financial Advisory and Intermediary Services Act (South Africa) — licensing perimeter that can cover crypto products.",
  AUSTRAC: "Australian Transaction Reports and Analysis Centre — Australia’s AML/CTF regulator; DCE registration.",
  DCE: "Digital Currency Exchange — Australian AUSTRAC registration category for crypto exchanges.",
  ASIC: "Australian Securities and Investments Commission.",
  VARA: "Virtual Assets Regulatory Authority — Dubai free-zone crypto regulator.",
  ADGM: "Abu Dhabi Global Market — Abu Dhabi financial free zone.",
  FSRA: "Financial Services Regulatory Authority — ADGM’s regulator.",
  AIFC: "Astana International Financial Centre — Kazakhstan’s English-law special financial zone.",
  CNBV: "Comisión Nacional Bancaria y de Valores — Mexico’s banking/securities commission.",
  BSP: "Bangko Sentral ng Pilipinas — Philippines central bank (VASP licensing).",
  VAITOS: "Virtual Asset and Initial Token Offering Services Act — Mauritius VASP framework.",
  PSAN: "Prestataire de Services sur Actifs Numériques — France’s pre-MiCA digital-asset service provider registration.",
  // AML / banking
  KYC: "Know Your Customer — identity checks banks/VASPs run before opening accounts or services.",
  AML: "Anti-Money Laundering — laws and controls against laundering criminal proceeds.",
  CTF: "Counter-Terrorist Financing — controls against financing terrorism (often paired with AML).",
  CDD: "Customer Due Diligence — standard KYC/AML checks on a customer.",
  EDD: "Enhanced Due Diligence — deeper AML checks for higher-risk customers (e.g. crypto wealth).",
  SOF: "Source of Funds — where the money for a specific transfer or deposit came from.",
  SOW: "Source of Wealth — how the customer built their overall wealth (broader than SOF).",
  UBO: "Ultimate Beneficial Owner — the natural person who ultimately owns/controls a company.",
  CRS: "Common Reporting Standard — automatic exchange of financial account information between tax authorities.",
  FATCA: "Foreign Account Tax Compliance Act (US) — reporting of foreign accounts held by US persons.",
  FATF: "Financial Action Task Force — international AML/CFT standard-setter (Travel Rule recommendations).",
  SEPA: "Single Euro Payments Area — euro bank transfer scheme across participating European countries.",
  EMI: "Electronic Money Institution — regulated e-money / payment firm (often used as multi-rail banking).",
  PSP: "Payment Service Provider — firm that processes payments for merchants or platforms.",
  VASP: "Virtual Asset Service Provider — FATF term for businesses exchanging, transferring, or custodising virtual assets.",
  DPT: "Digital Payment Token — Singapore MAS term for certain crypto payment tokens.",
  VATP: "Virtual Asset Trading Platform — Hong Kong SFC-licensed trading platform category.",
  // Tax / corporate
  PE: "Permanent Establishment — a taxable presence of a foreign company in a country (e.g. fixed place or dependent agent).",
  CFC: "Controlled Foreign Company — anti-avoidance rules that can tax a foreign subsidiary’s profits on the resident shareholder.",
  PIT: "Personal Income Tax — tax on an individual’s income.",
  CIT: "Corporate Income Tax — tax on company profits.",
  CGT: "Capital Gains Tax — tax on gains from disposing of assets (including often crypto).",
  TP: "Transfer Pricing — rules for pricing transactions between related companies.",
  HoldCo: "Holding Company — entity that holds shares or assets of other companies rather than operating day-to-day trade.",
  OpCo: "Operating Company — the entity that runs the business operations.",
  GTM: "Go-To-Market — how a product is launched and sold into a market.",
  HQ: "Headquarters — main office / management centre of a company.",
  SA: "Sociedad Anónima (or Société Anonyme) — a common limited company form in LatAm/Europe; context-dependent.",
  SRL: "Società a Responsabilità Limitata / Sociedad de Responsabilidad Limitada — limited liability company form (IT/ES/LatAm).",
  GmbH: "Gesellschaft mit beschränkter Haftung — German/Austrian private limited company.",
  LLC: "Limited Liability Company — common US (and some other) company form.",
  "Pte Ltd": "Private Limited Company — common Singapore company form.",
  // Residence / lifestyle
  CoL: "Cost of Living — rough band for rent, food, and day-to-day expenses.",
  DNV: "Digital Nomad Visa — residence permit for remote workers (rules vary by country).",
  NHR: "Non-Habitual Resident — Portugal’s former special tax regime (largely reformed; do not assume old benefits).",
  LTR: "Long-Term Resident / Long-Term Residence — longer-stay residence programmes (e.g. Thailand LTR); rules change often.",
  MM2H: "Malaysia My Second Home — long-stay residence programme (terms change frequently).",
  "e-Residency": "Estonia’s digital identity for company admin online — not the same as tax residence or a visa.",
  // Founder stack
  ICO: "Initial Coin Offering — public sale of tokens to raise funds.",
  TGE: "Token Generation Event — creation/distribution of a new token (often with a sale).",
  NFT: "Non-Fungible Token — unique on-chain token (collectibles, tickets, etc.).",
  OTC: "Over-The-Counter — private off-exchange trades, often large block size.",
  CEX: "Centralised Exchange — custodial trading venue run by a company.",
  DEX: "Decentralised Exchange — on-chain trading protocol, usually non-custodial.",
  FX: "Foreign Exchange — currency conversion and related controls/risks.",
  EEA: "European Economic Area — EU plus Iceland, Liechtenstein, and Norway for many financial rules.",
  UAE: "United Arab Emirates.",
  // Other
  IRAS: "Inland Revenue Authority of Singapore — Singapore tax authority.",
  NTA: "National Tax Agency — Japan’s tax authority.",
  SAT: "Servicio de Administración Tributaria — Mexico’s tax authority.",
  AFIP: "Administración Federal de Ingresos Públicos — Argentina’s (former name) tax authority; practice may cite ARCA.",
  DIAN: "Dirección de Impuestos y Aduanas Nacionales — Colombia’s tax authority.",
  SUNAT: "Superintendencia Nacional de Aduanas y de Administración Tributaria — Peru’s tax authority.",
  SARS: "South African Revenue Service.",
  CRA: "Canada Revenue Agency.",
  ATO: "Australian Taxation Office.",
  HMRC: "His Majesty’s Revenue & Customs — UK tax authority.",
  IRS: "Internal Revenue Service — US federal tax authority.",
  OFAC: "Office of Foreign Assets Control — US sanctions authority.",
  IVIE: "Imposta sul valore degli immobili situati all’estero — Italian tax on foreign real estate (often discussed with crypto monitoring).",
  IVAFE: "Imposta sul valore delle attività finanziarie all’estero — Italian tax on foreign financial assets.",
  RW: "Quadro RW — Italian tax return schedule for monitoring foreign assets (including often crypto).",
  "Title II": "MiCA Title II — rules on public offers and admission to trading of crypto-assets (white paper duties).",
  Howey: "Howey test — US case-law test for whether an arrangement is an investment contract (securities).",
};

/**
 * Obvious terms we never auto-tooltip or put in the page legend
 * (currencies, Bitcoin, common country codes, everyday words).
 */
const LAW_GLOSSARY_SKIP = new Set([
  "USD",
  "EUR",
  "BTC",
  "HQ",
  "NFT",
  "EU",
  "UK",
  "US",
  "IT",
  "JP",
  "SG",
  "HK",
  "CH",
  "BR",
  "MX",
  "AR",
  "ZA",
  "KR",
  "AU",
  "CA",
  "DE",
  "FR",
  "ES",
  "PT",
  "NL",
  "IE",
  "LU",
  "PL",
  "CZ",
  "UAE",
]);

/** 2-letter keys that are safe to auto-detect (jargon only). */
const LAW_GLOSSARY_SHORT_ALLOW = new Set(["PE", "FX", "TP"]);

const LAW_GLOSSARY_KEYS = Object.keys(LAW_GLOSSARY)
  .filter((k) => !LAW_GLOSSARY_SKIP.has(k))
  .filter((k) => k.length > 2 || LAW_GLOSSARY_SHORT_ALLOW.has(k))
  .sort((a, b) => b.length - a.length);

function lawGlossaryEscapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Which glossary keys appear in free text (case-insensitive whole tokens). */
function lawScanGlossaryKeys(text) {
  const t = String(text || "");
  if (!t.trim()) return [];
  const found = [];
  for (const key of LAW_GLOSSARY_KEYS) {
    let re;
    if (/\s/.test(key) || key.includes("-") || key.includes(".")) {
      re = new RegExp(`(?:^|[^A-Za-z0-9])${lawGlossaryEscapeRe(key)}(?=[^A-Za-z0-9]|$)`, "i");
    } else if (key.length <= 2) {
      // Short allow-list: match exact case tokens only (PE, EU, UK, US, FX, TP)
      re = new RegExp(`(?:^|[^A-Za-z0-9])${lawGlossaryEscapeRe(key)}(?=[^A-Za-z0-9]|$)`);
    } else {
      re = new RegExp(`(?:^|[^A-Za-z0-9])${lawGlossaryEscapeRe(key)}(?=[^A-Za-z0-9]|$)`, "i");
    }
    if (re.test(t)) found.push(key);
  }
  return found.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function lawGlossaryLegendHtml(fromText) {
  const keys = lawScanGlossaryKeys(fromText);
  if (!keys.length) return "";
  return `<aside class="law-glossary" aria-label="Acronym legend for this page">
    <h3 class="law-glossary__title">${lawTip("Acronyms on this page", "Only terms that appear in the content above. Hover underlined abbreviations in the text for the same definitions.")}</h3>
    <p class="law-glossary__hint law-muted">Hover any term in the text (dotted underline) or read the short definitions below. Educational plain-English — not legal definitions.</p>
    <dl class="law-glossary__list">
      ${keys
        .map((k) => {
          const def = LAW_GLOSSARY[k];
          return `<div class="law-glossary__item">
            <dt><abbr class="law-abbr law-has-tip" ${lawTipAttrs(def)}>${lawEsc(k)}</abbr></dt>
            <dd>${lawEsc(def)}</dd>
          </div>`;
        })
        .join("")}
    </dl>
  </aside>`;
}

/**
 * Wrap glossary acronyms in text nodes with hover tooltips.
 * Skips existing tips, glossary, buttons, code, and script/style.
 */
function lawDecorateAcronymsInRoot(root) {
  if (!root || !root.querySelectorAll) return;
  const skipSel = "script,style,code,pre,.law-abbr,.law-tip,.law-glossary,.law-has-tip,.mono,button,input,select,textarea,a,svg,title";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest(skipSel)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  // Build alternation of keys (longest first already in LAW_GLOSSARY_KEYS)
  const alt = LAW_GLOSSARY_KEYS.map(lawGlossaryEscapeRe).join("|");
  if (!alt) return;
  const re = new RegExp(`(^|[^A-Za-z0-9])(${alt})(?=[^A-Za-z0-9]|$)`, "gi");

  for (const textNode of nodes) {
    const text = textNode.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const full = m[0];
      const lead = m[1] || "";
      const token = m[2];
      const start = m.index;
      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
      if (lead) frag.appendChild(document.createTextNode(lead));
      // Resolve canonical key casing from glossary
      const canon =
        LAW_GLOSSARY_KEYS.find((k) => k.toLowerCase() === token.toLowerCase()) || token;
      const def = LAW_GLOSSARY[canon];
      if (def) {
        const span = document.createElement("abbr");
        span.className = "law-abbr law-has-tip";
        span.textContent = token;
        span.setAttribute("data-tip", def);
        span.setAttribute("aria-label", def);
        span.setAttribute("tabindex", "0");
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(token));
      }
      last = start + full.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }
}

/** Decorate acronym tooltips and append a legend of terms used on this page. */
function lawAttachGlossary(root) {
  if (!root) return;
  root.querySelectorAll(":scope > .law-glossary, .law-glossary").forEach((el) => {
    // Only remove glossaries that are direct children or final legends we added
    if (el.parentElement === root || el.classList.contains("law-glossary--auto")) el.remove();
  });
  lawDecorateAcronymsInRoot(root);
  const plain = root.innerText || root.textContent || "";
  const legend = lawGlossaryLegendHtml(plain);
  if (legend) {
    const wrap = document.createElement("div");
    wrap.innerHTML = legend;
    const aside = wrap.firstElementChild;
    if (aside) {
      aside.classList.add("law-glossary--auto");
      root.appendChild(aside);
    }
  }
}

const LAW_META_TIPS = {
  col: "Cost of living band for a lean founder lifestyle (rent, food, coworking). Bands are rough and city-dependent — not a full budget model.",
  company: "Relative ease of forming a local operating company (forms, language, foreign ownership, speed). Not legal advice on structure.",
  banking: "How hard crypto founders typically find personal/business banking and payment rails (KYC/AML, SOF/SOW, crypto industry flags).",
  crypto: "Local regulatory posture for holding/trading/building crypto products — not a licence grant.",
  visa: "Relative difficulty of residence or long-stay pathways for founders. Visa days ≠ tax residence.",
};

const LAW_LAUNCH_AUDIENCE_TIPS = {
  local: "Marketing or selling the token primarily to residents of that country under local consumer/securities rules.",
  region: "Nearby regional markets (e.g. LatAm neighbours, GCC, ASEAN) — still multi-jurisdiction risk.",
  world: "Global marketing outside a single region, excluding dedicated EU retail campaigns.",
  eu: "EU retail public offers / services — MiCA Title II white paper duties and/or CASP perimeter typically apply. Not a local loophole.",
};

const LAW_LAUNCH_KIND_TIPS = {
  meme: "Viral / community meme coin: often easy to deploy on-chain, but coordinated promo, influencer marketing, and listings can create offeror or financial-promotion liability.",
  ico: "Public ICO / TGE / token sale with identifiable offeror — usually prospectus-style, licensed venue, or exemption analysis; higher formal friction than a silent deploy.",
};

const LAW_EASE_LEVEL_TIPS = {
  easy: "Relatively low formal friction for a careful launch — still not zero risk. Counsel recommended for any public promo.",
  medium: "Doable with local counsel and a compliance plan; expect filings, KYC on buyers, or marketing limits.",
  hard: "Heavy licensing, securities, or promotion rules. Casual meme/ICO stacks are a poor fit.",
  "very hard": "High multi-agency or enforcement risk. Treat as unsuitable for casual public launches.",
  restricted: "Effectively not a viable token-launch venue for foreign founders under current posture.",
  "—": "No relative score yet — verify with local counsel.",
};

const LAW_LAYER_EXPLAIN = {
  tax: "Layer 1 is where YOU are tax-resident as a person. A foreign company does not by itself change Italian/EU personal tax if you stay resident.",
  company: "Layer 2 is where the legal entity is formed and managed. Can differ from your home — then you need substance, PE analysis, and dual counsel.",
  banking: "Layer 3 is where money actually moves. Often the real bottleneck: bank onboarding, PSP rails, and AML packs.",
  life: "Layer 4 is visas, quality of life, and cost of living. A tourist visa is not tax residence — track both calendars.",
};

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
  const { status, region, q, chips, favoritesOnly } = lawPrefs.filters;
  const qq = (q || "").trim().toLowerCase();
  return list.filter((j) => {
    if (favoritesOnly && !lawPrefs.favorites.includes(j.id)) return false;
    if (status && j.status !== status) return false;
    if (region && j.region !== region) return false;
    if (chips?.length) {
      const ok = chips.every((c) => {
        if (c === "starred" || c === "favorites") return lawPrefs.favorites.includes(j.id);
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

function lawParseMdTableRow(line) {
  let t = String(line || "").trim();
  // Normalize fancy dashes often pasted from docs
  t = t.replace(/[–—]/g, "-");
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

/** True for markdown table separator rows: | --- | :---: | --- | */
function lawIsMdTableSep(line) {
  const cells = lawParseMdTableRow(line);
  if (!cells.length) return false;
  // Every cell must be only hyphens with optional alignment colons (no letters)
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function lawLooksLikeTableRow(line) {
  const t = String(line || "").trim();
  return t.startsWith("|") && t.includes("|", 1);
}

/** Trusted static markdown → HTML (guides). */
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

    // Tables: header + separator (---), then body rows
    if (
      lawLooksLikeTableRow(trimmed) &&
      i + 1 < lines.length &&
      lawIsMdTableSep(lines[i + 1])
    ) {
      flushList();
      const rows = [];
      while (i < lines.length && lawLooksLikeTableRow(lines[i])) {
        if (lawIsMdTableSep(lines[i])) {
          i += 1;
          continue;
        }
        rows.push(lawParseMdTableRow(lines[i]));
        i += 1;
      }
      if (rows.length) {
        const colN = Math.max(...rows.map((r) => r.length), 1);
        const pad = (r) => {
          const x = r.slice(0, colN);
          while (x.length < colN) x.push("");
          return x;
        };
        const head = pad(rows[0]);
        const body = rows.slice(1).map(pad);
        out.push('<div class="law-guide-table-wrap"><table class="law-guide-table"><thead><tr>');
        head.forEach((c) => out.push(`<th>${inline(c)}</th>`));
        out.push("</tr></thead><tbody>");
        if (!body.length) {
          out.push('<tr><td colspan="' + colN + '" class="law-muted">—</td></tr>');
        } else {
          body.forEach((r) => {
            out.push("<tr>");
            r.forEach((c) => out.push(`<td>${inline(c)}</td>`));
            out.push("</tr>");
          });
        }
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

const lawGuideCache = Object.create(null);

async function lawLoadGuide(path, cacheKey) {
  const key = cacheKey || path;
  if (lawGuideCache[key]) return lawGuideCache[key];
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Guide HTTP ${res.status}`);
  const md = await res.text();
  lawGuideCache[key] = lawMarkdownToHtml(md);
  return lawGuideCache[key];
}

async function lawLoadMicaGuide() {
  return lawLoadGuide("/law-eu-mica-guide.md?v=3", "eu-mica-v3");
}

async function lawLoadGlobalFoundersGuide() {
  return lawLoadGuide("/law-global-founders-guide.md?v=10", "global-founders-v10");
}

/**
 * Curated relocate browser: company seat + life base for EU-resident crypto founders.
 * `lawId` links into jurisdiction legal-status cards when present in the dataset.
 */
const LAW_RELOCATE_BROWSER = [
  // Priority focus set (Cuba kept but not priority)
  { id: "panama", lawId: "panama", name: "Panama", region: "LatAm", priority: true, tags: ["priority", "latam", "territorial", "usd"], col: "mid", company: "easy", banking: "hard", crypto: "legal", visa: "medium", blurb: "USD hub, SA companies, territorial tax themes — KYC-heavy banks." },
  { id: "uae", lawId: "united-arab-emirates", name: "UAE", region: "MENA", priority: true, tags: ["priority", "hub", "tax", "travel"], col: "high", company: "fast-fz", banking: "good-if-licensed", crypto: "regulated-zones", visa: "medium", blurb: "Free-zone cos, travel hub; VARA/ADGM/FSRA lanes for crypto." },
  { id: "el-salvador", lawId: "el-salvador", name: "El Salvador", region: "LatAm", priority: true, tags: ["priority", "btc", "latam"], col: "low", company: "fast", banking: "selective", crypto: "btc-tender-history", visa: "medium", blurb: "BTC-native brand; legal-tender history evolved — verify live policy." },
  { id: "paraguay", lawId: "paraguay", name: "Paraguay", region: "LatAm", priority: true, tags: ["priority", "low-col", "mining", "latam"], col: "low", company: "medium", banking: "selective", crypto: "mining-interest", visa: "medium", blurb: "Low CoL + hydro mining narrative; territorial tax themes — verify." },
  { id: "georgia", lawId: "georgia", name: "Georgia", region: "Europe-adjacent", priority: true, tags: ["priority", "low-col", "lean", "mining"], col: "low", company: "easy", banking: "selective", crypto: "friendly-history", visa: "easy-tourist", blurb: "Lean ops, EU proximity, mining history; re-check tax yearly." },
  { id: "costa-rica", lawId: "costa-rica", name: "Costa Rica", region: "LatAm", priority: true, tags: ["priority", "lifestyle", "latam"], col: "mid", company: "medium", banking: "mixed", crypto: "permissive-hold", visa: "medium", blurb: "Lifestyle + Americas TZ; generally permissive holding; no blanket ban." },
  { id: "kazakhstan", lawId: "kazakhstan", name: "Kazakhstan", region: "Asia-Central", priority: true, tags: ["priority", "aifc", "mining"], col: "low-mid", company: "aifc", banking: "selective", crypto: "mining-history", visa: "medium", blurb: "AIFC English-law hub experiments; mining history; verify current rules." },
  { id: "guatemala", lawId: "guatemala", name: "Guatemala", region: "LatAm", priority: true, tags: ["priority", "latam", "low-col"], col: "low", company: "medium", banking: "harder", crypto: "legal-thin", visa: "medium", blurb: "Low CoL Spanish base; thinner crypto framework and conservative banks." },
  { id: "japan", lawId: "japan", name: "Japan", region: "Asia", priority: true, tags: ["priority", "asia", "regulated", "high-col"], col: "high", company: "formal", banking: "after-residence", crypto: "regulated", visa: "hard", blurb: "Regulated exchanges, high trust; high personal tax if resident." },
  { id: "cuba", lawId: "cuba", name: "Cuba", region: "LatAm", priority: false, tags: ["latam"], col: "n/a", company: "restricted", banking: "hard", crypto: "restricted", visa: "medium", blurb: "Restricted crypto posture and limited foreign-founder company paths — verify local rules." },
  { id: "singapore", lawId: "singapore", name: "Singapore", region: "Asia", priority: false, tags: ["hub", "asia", "mas"], col: "very-high", company: "efficient", banking: "excellent", crypto: "mas", visa: "medium", blurb: "Asia HQ default; excellent banks; high CoL." },
  { id: "switzerland", lawId: "switzerland", name: "Switzerland", region: "Europe-non-EU", priority: false, tags: ["institutional", "high-col"], col: "very-high", company: "formal", banking: "excellent", crypto: "finma", visa: "hard", blurb: "Institutional custody/funds adjacency; expensive." },
  { id: "uk", lawId: "united-kingdom", name: "United Kingdom", region: "Europe-non-EU", priority: false, tags: ["english", "fca"], col: "high", company: "easy", banking: "good", crypto: "fca", visa: "medium", blurb: "English law + talent; FCA cryptoasset regime." },
  { id: "usa", lawId: "united-states", name: "United States", region: "N. America", priority: false, tags: ["market", "complex"], col: "varies", company: "easy", banking: "good", crypto: "patchwork", visa: "hard", blurb: "Huge GTM; state/federal patchwork — not a casual tax move for EU persons." },
  { id: "mexico", lawId: "mexico", name: "Mexico", region: "LatAm", priority: false, tags: ["latam", "scale"], col: "low-mid", company: "medium", banking: "mixed", crypto: "fintech-law", visa: "medium", blurb: "Spanish LatAm scale; fintech law, not MiCA." },
  { id: "argentina", lawId: "argentina", name: "Argentina", region: "LatAm", priority: false, tags: ["latam", "fx"], col: "low-usd", company: "medium", banking: "complex", crypto: "high-usage", visa: "medium", blurb: "High practical crypto usage; macro/FX complexity." },
  { id: "uruguay", lawId: "uruguay", name: "Uruguay", region: "LatAm", priority: false, tags: ["latam", "residence"], col: "mid", company: "medium", banking: "selective", crypto: "evolving", visa: "programmes", blurb: "Residence programmes; smaller market." },
  { id: "thailand", lawId: "thailand", name: "Thailand", region: "Asia", priority: false, tags: ["nomad", "lifestyle"], col: "low-mid", company: "medium", banking: "hard", crypto: "regulated", visa: "ltr-evolving", blurb: "Nomad lifestyle; company often elsewhere." },
  { id: "malaysia", lawId: "malaysia", name: "Malaysia", region: "Asia", priority: false, tags: ["nomad", "asia"], col: "low-mid", company: "medium", banking: "mixed", crypto: "sc-regulated", visa: "mm2h-changes", blurb: "SC digital-asset regime; MM2H-style programmes change often." },
  { id: "indonesia", lawId: "indonesia", name: "Indonesia", region: "Asia", priority: false, tags: ["nomad", "bali"], col: "low-mid", company: "ownership-limits", banking: "hard", crypto: "regulated-exchange", visa: "tourist-vs-business", blurb: "Bali lifestyle; foreign ownership limits for cos." },
  { id: "hong-kong", lawId: "hong-kong", name: "Hong Kong", region: "Asia", priority: false, tags: ["hub", "high-col"], col: "very-high", company: "efficient", banking: "excellent", crypto: "reopened-va", visa: "medium", blurb: "Re-opened VA regime; expensive hub." },
  { id: "portugal", lawId: "portugal", name: "Portugal", region: "EU", priority: false, tags: ["eu", "caution-nhr", "map-legal"], col: "mid", company: "eu", banking: "good", crypto: "mica", visa: "dnv", blurb: "NHR largely reformed — do not assume old NHR; still EU/MiCA." },
  { id: "spain", lawId: "spain", name: "Spain", region: "EU", priority: false, tags: ["eu", "dnv", "map-legal"], col: "mid", company: "eu", banking: "medium", crypto: "mica", visa: "dnv", blurb: "Digital nomad visa; tax residence traps for Italians." },
  { id: "estonia", lawId: "estonia", name: "Estonia", region: "EU", priority: false, tags: ["eu", "e-residency", "map-legal"], col: "mid", company: "e-residency", banking: "harder", crypto: "mica", visa: "eu", blurb: "e-Residency ≠ tax residence; still EU for many purposes." },
  { id: "cayman", lawId: null, name: "Cayman / BVI", region: "Offshore", priority: false, tags: ["fund", "holdco"], col: "n/a", company: "fund-style", banking: "substance", crypto: "fund", visa: "n/a", blurb: "Fund HoldCos — substance/CRS; not a casual place to “move”." },
];

/**
 * Relative ease of launching a meme coin vs a public ICO/TGE for four audiences.
 * Educational only — not legal advice. EU column assumes MiCA Title II / CASP perimeter for EU retail.
 * Scale: Easy · Medium · Hard · Very hard · Restricted
 */
const LAW_LAUNCH_EASE = {
  panama: {
    meme: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "Chain deploy is easy; LatAm marketing less MiCA-like. World/EU public promo can recreate offeror liability." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "No local MiCA white paper; EU-targeted raise needs EU CASP / Title II path, not a Panama-only story." },
  },
  uae: {
    meme: { local: "Hard", region: "Medium", world: "Hard", eu: "Very hard", note: "VARA/ADGM/FSRA marketing rules bite fast; free-zone licence lanes exist but are not a free meme stack." },
    ico: { local: "Hard", region: "Medium", world: "Hard", eu: "Very hard", note: "Serious offerings often need zone licensing + prospectus-style docs. EU buyers still sit under MiCA." },
  },
  "el-salvador": {
    meme: { local: "Easy", region: "Medium", world: "Hard", eu: "Very hard", note: "BTC-native brand + tech deploy easy; still securities/consumer risk for coordinated promos." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "Local raise possible with counsel; world/EU public offers need multi-jurisdiction packaging." },
  },
  paraguay: {
    meme: { local: "Easy", region: "Medium", world: "Hard", eu: "Very hard", note: "Thin retail framework ≠ zero risk; mining narrative ≠ token offering licence." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "Public sale to foreigners quickly hits foreign securities / MiCA rules." },
  },
  georgia: {
    meme: { local: "Easy", region: "Medium", world: "Hard", eu: "Very hard", note: "Lean tech deploy; re-check annual tax and VASP rules. EU marketing is not “Georgia-easy”." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "Local/regional raise with counsel; EU/world need proper offer docs and target-market filters." },
  },
  "costa-rica": {
    meme: { local: "Easy", region: "Medium", world: "Hard", eu: "Very hard", note: "Permissive holding culture; promo still consumer/securities-sensitive." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "No EU passport from CR; MiCA for EU investors." },
  },
  kazakhstan: {
    meme: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "AIFC / national rules can apply; mining history ≠ open meme lane." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "AIFC English-law structures for serious raises; still not an EU public-offer shortcut." },
  },
  guatemala: {
    meme: { local: "Easy", region: "Medium", world: "Hard", eu: "Very hard", note: "Thin framework; banking and AML often harder than the deploy." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Limited market infrastructure; serious ICO usually structured elsewhere + local counsel." },
  },
  japan: {
    meme: { local: "Very hard", region: "Hard", world: "Hard", eu: "Very hard", note: "FSA / PSA crypto regime — retail meme promos are high friction." },
    ico: { local: "Very hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Exchange listing and public offers are heavily regulated; not a casual TGE venue." },
  },
  cuba: {
    meme: { local: "Restricted", region: "Restricted", world: "Restricted", eu: "Restricted", note: "Restricted crypto posture and limited foreign-founder rails — not a token-launch venue." },
    ico: { local: "Restricted", region: "Restricted", world: "Restricted", eu: "Restricted", note: "Same — treat as non-starter without specialist local advice." },
  },
  singapore: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "MAS digital token rules + marketing restrictions; Asia HQ ≠ free meme." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "DTSP / prospectus-style paths for public offers; EU still MiCA." },
  },
  switzerland: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Hard", note: "FINMA token categories; pure meme retail less common than utility/security framing." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Hard", note: "Institutional / fund-style raises stronger than viral meme ICOs; EU marketing still constrained." },
  },
  uk: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "FCA cryptoasset promotions regime — influencer/meme marketing tightly controlled." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Public offers / financial promotions need authorised paths; post-Brexit ≠ MiCA passport." },
  },
  usa: {
    meme: { local: "Very hard", region: "Very hard", world: "Very hard", eu: "Very hard", note: "SEC / CFTC / state securities + Howey risk on coordinated meme launches." },
    ico: { local: "Very hard", region: "Very hard", world: "Very hard", eu: "Very hard", note: "Registered or exempt offerings only; not a casual global ICO base." },
  },
  mexico: {
    meme: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "Fintech law / CNBV adjacency; retail promo still risky." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Scale market but not a light-touch ICO venue." },
  },
  argentina: {
    meme: { local: "Easy", region: "Medium", world: "Hard", eu: "Very hard", note: "High practical crypto usage; FX/macro + consumer rules still matter." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "Local raise possible with counsel; world/EU need multi-jurisdiction packaging." },
  },
  uruguay: {
    meme: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "Evolving framework; smaller retail base." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "Serious offers need local counsel; no EU passport." },
  },
  thailand: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "SEC Thailand digital-asset rules; lifestyle ≠ free meme." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Licensed offering paths for public sales; company often seated elsewhere." },
  },
  malaysia: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "SC digital-asset regime — approved venues dominate." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Public offerings through regulated channels only." },
  },
  indonesia: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Bappebti / exchange rails for crypto; foreign ownership limits on cos." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Not a free public-ICO venue for foreigners." },
  },
  "hong-kong": {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Re-opened VA regime with licensing; retail meme promos constrained." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Licensed platforms / prospectus paths; expensive hub." },
  },
  portugal: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Hard", note: "EU MiCA — Title II white paper / offeror duties for public offers; CASP for services." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Hard", note: "MiCA is the EU path (not a loophole). NHR reformed — tax separate from token law." },
  },
  spain: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Hard", note: "MiCA + CNMV culture on retail crypto promotions." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Hard", note: "EU public offer → MiCA white paper / CASP stack." },
  },
  estonia: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Hard", note: "e-Residency ≠ token licence; still MiCA for EU activity." },
    ico: { local: "Hard", region: "Hard", world: "Hard", eu: "Hard", note: "EU entity can be useful for CASP packaging — not a meme free pass." },
  },
  cayman: {
    meme: { local: "Hard", region: "Hard", world: "Hard", eu: "Very hard", note: "Fund HoldCo venue — substance/CRS; not for casual retail memes." },
    ico: { local: "Medium", region: "Medium", world: "Hard", eu: "Very hard", note: "Fund-style raises with counsel; marketing into EU/US still local law of target markets." },
  },
};

/** 4-layer country finder — pick a goal per layer, get hub links */
const LAW_LAYER_FINDER = [
  {
    id: "tax",
    num: "01",
    title: "Tax residence (you)",
    subtitle: "Where you live and pay personal tax",
    tip: "If you stay Italian/EU tax resident, foreign cos do not “fix” worldwide tax.",
    options: [
      { id: "territorial", label: "Territorial / foreign-income themes", why: "Personal tax often focuses on local-source income — verify yearly.", ids: ["panama", "paraguay", "georgia", "costa-rica", "guatemala"] },
      { id: "zero-low", label: "0% PIT themes / free-zone lifestyle", why: "Often cited for low personal rates — substance & residence tests still bite.", ids: ["uae", "paraguay", "georgia"] },
      { id: "btc-brand", label: "BTC-native brand country", why: "Policy brand + lifestyle, not a tax free pass alone.", ids: ["el-salvador"] },
      { id: "eu-stay", label: "Stay in EU (later exit)", why: "Still MiCA + home tax; useful if product is EU-first.", ids: ["portugal", "spain", "estonia", "germany", "france", "netherlands", "ireland", "italy", "poland", "czech-republic"] },
      { id: "high-trust", label: "High trust — accept high personal tax", why: "Banks, talent, reputation over rate.", ids: ["japan", "singapore", "switzerland", "uk", "usa", "canada", "australia", "germany", "norway"] },
      { id: "africa-mena-legal", label: "Africa / MENA regulated base", why: "Map-green markets with growing VASP rules.", ids: ["south-africa", "mauritius", "uae", "kenya", "israel", "ghana"] },
    ],
  },
  {
    id: "company",
    num: "02",
    title: "Company seat",
    subtitle: "Where the operating / HoldCo lives",
    tip: "Can differ from your tax residence — then you need substance, PE, and dual counsel.",
    options: [
      { id: "easy-local", label: "Easy local co (SA / LLC style)", why: "Formation speed and founder familiarity.", ids: ["panama", "georgia", "uk", "usa", "el-salvador", "canada", "australia"] },
      { id: "freezone", label: "Free zone / licensed crypto lane", why: "VARA / ADGM / FSRA-style stacks.", ids: ["uae"] },
      { id: "aifc", label: "English-law special zone", why: "AIFC experiments for structured entities.", ids: ["kazakhstan"] },
      { id: "asia-hq", label: "Asia HQ efficiency", why: "MAS / HK / JP regulated credibility.", ids: ["singapore", "hong-kong", "japan", "south-korea", "australia"] },
      { id: "eu-entity", label: "EU company (MiCA perimeter)", why: "For EU clients / CASP packaging.", ids: ["portugal", "spain", "estonia", "germany", "france", "netherlands", "ireland", "luxembourg", "italy"] },
      { id: "offshore", label: "Fund / HoldCo (Cayman-style)", why: "Institutional HoldCo — substance required.", ids: ["cayman", "mauritius", "seychelles", "belize"] },
      { id: "latam-scale", label: "LatAm scale market co", why: "Larger Southern Cone / Brazil GTM.", ids: ["brazil", "chile", "colombia", "mexico", "argentina"] },
    ],
  },
  {
    id: "banking",
    num: "03",
    title: "Banking & payments",
    subtitle: "Where money moves day-to-day",
    tip: "Often the bottleneck. SOF/SOW pack before you arrive.",
    options: [
      { id: "excellent", label: "Excellent traditional banks", why: "Depth of rails; KYC still serious for crypto founders.", ids: ["singapore", "switzerland", "hong-kong", "uk", "usa", "japan", "canada", "luxembourg", "germany"] },
      { id: "licensed", label: "Good if licensed / free-zone", why: "Banking opens after licence + substance.", ids: ["uae", "singapore", "mauritius"] },
      { id: "selective", label: "Selective but doable", why: "Possible with clean KYC pack and patience.", ids: ["georgia", "paraguay", "el-salvador", "costa-rica", "kazakhstan", "mexico", "uruguay", "brazil", "chile", "south-africa"] },
      { id: "hard", label: "Expect hard KYC / thin rails", why: "Plan multi-bank and longer timelines.", ids: ["panama", "guatemala", "thailand", "indonesia", "argentina", "israel", "ukraine"] },
      { id: "eu-rails", label: "EU SEPA / MiCA payment stack", why: "Euro rails + CASP adjacency.", ids: ["portugal", "spain", "estonia", "germany", "france", "netherlands", "ireland", "italy"] },
    ],
  },
  {
    id: "life",
    num: "04",
    title: "Lifestyle · visas · CoL",
    subtitle: "Where life and ops feel sustainable",
    tip: "Visa length ≠ tax residence. Track both calendars.",
    options: [
      { id: "low-col", label: "Lowest CoL · lean ops", why: "Runway extension for small teams.", ids: ["paraguay", "georgia", "guatemala", "el-salvador", "kazakhstan", "argentina", "kenya", "ghana", "uganda"] },
      { id: "lifestyle", label: "Lifestyle / nature / QoL", why: "Quality of life as primary filter.", ids: ["costa-rica", "thailand", "portugal", "uruguay", "indonesia", "new-zealand", "greece"] },
      { id: "travel", label: "Travel hub · flights", why: "Hub airports and connectivity.", ids: ["uae", "singapore", "panama", "hong-kong", "uk", "germany", "france", "netherlands"] },
      { id: "latam", label: "Spanish LatAm base", why: "Language + Americas timezone.", ids: ["panama", "mexico", "costa-rica", "guatemala", "paraguay", "argentina", "uruguay", "el-salvador", "chile", "colombia", "peru"] },
      { id: "nomad", label: "Nomad / LTR programmes", why: "Residence products — rules change often.", ids: ["spain", "portugal", "thailand", "malaysia", "costa-rica", "uae"] },
      { id: "hard-visa", label: "Hard visa OK long-term", why: "Accept multi-year path for stability.", ids: ["japan", "usa", "switzerland", "singapore", "canada", "australia", "south-korea"] },
    ],
  },
];

function lawLaunchEaseFor(id) {
  return (
    LAW_LAUNCH_EASE[id] || {
      meme: { local: "—", region: "—", world: "—", eu: "—", note: "No score yet — verify local counsel." },
      ico: { local: "—", region: "—", world: "—", eu: "—", note: "No score yet — verify local counsel." },
    }
  );
}

/** HTML table of local crypto industry startups / scale-ups. */
function lawCryptoStartupsTableHtml(startups, { compact = false } = {}) {
  if (!startups || !Array.isArray(startups.rows) || !startups.rows.length) {
    return compact
      ? ""
      : `<p class="law-muted">No startup table yet — check local incubators and the national VASP/CASP register.</p>`;
  }
  if (compact) {
    const n = startups.rows.length;
    const names = startups.rows
      .slice(0, 3)
      .map((r) => r[0])
      .filter(Boolean)
      .join(", ");
    return `<p class="law-relocate-card__startups" ${lawTipAttrs("Illustrative local crypto startups / scale-ups. Open hub for the full table. Not complete or endorsed.")}><span class="law-relocate-card__startups-label">Crypto startups</span> ${lawEsc(String(n))} listed${names ? ` · e.g. ${lawEsc(names)}` : ""}</p>`;
  }
  const body = startups.rows
    .map((r) => {
      const [name, cat, focus, note] = r;
      return `<tr>
        <td><strong>${lawEsc(name || "—")}</strong></td>
        <td>${lawEsc(cat || "—")}</td>
        <td>${lawEsc(focus || "—")}</td>
        <td>${lawEsc(note || "—")}</td>
      </tr>`;
    })
    .join("");
  return `
    <div class="law-startups-wrap">
      ${startups.scene ? `<p class="law-startups-scene">${lawEsc(startups.scene)}</p>` : ""}
      <div class="law-guide-table-wrap">
        <table class="law-guide-table law-startups-table">
          <thead>
            <tr>
              <th>${lawTip("Company", "Illustrative name — may be a startup, scale-up, or listed crypto company with local roots or major local presence.")}</th>
              <th>${lawTip("Category", "Exchange, custody, wallet, payments, mining, regtech, etc.")}</th>
              <th>${lawTip("Focus", "Main product or market slice.")}</th>
              <th>${lawTip("Note", "Context only — not due diligence. Verify HQ, licence, and status live.")}</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="law-muted law-startups-disclaimer">Educational sample of the local crypto industry — <strong>not complete, not ranked, not an endorsement or investment recommendation</strong>. Brands move HQ, rebrand, or shut down; always verify regulator registers and corporate filings.</p>
    </div>`;
}

/** HTML block for local / authorized crypto services (exchanges, banks, ATM, merchants). */
function lawLocalServicesHtml(services, { compact = false } = {}) {
  if (!services || typeof services !== "object") {
    return compact
      ? ""
      : `<p class="law-muted">Local service map not yet filled — open the BTC legal-status card and verify national VASP/exchange registers.</p>`;
  }
  if (compact) {
    const sum = services.summary || "";
    if (!sum) return "";
    return `<p class="law-relocate-card__services" ${lawTipAttrs("Local / authorized crypto landscape: exchanges & CASPs, banking access, ATMs, merchant acceptance. Open hub for full detail.")}><span class="law-relocate-card__services-label">Local services</span> ${lawEsc(sum)}</p>`;
  }
  const row = (label, tip, text) => {
    if (!text) return "";
    return `<div class="law-services-row">
      <dt>${lawTip(label, tip)}</dt>
      <dd>${lawEsc(text)}</dd>
    </div>`;
  };
  return `
    <div class="law-services-wrap">
      ${services.summary ? `<p class="law-services-summary">${lawEsc(services.summary)}</p>` : ""}
      <dl class="law-services-dl">
        ${row("Exchanges / CASPs", "Local or locally authorized trading platforms, VASPs, CASPs — verify live regulator registers before depositing.", services.exchanges)}
        ${row("Banks", "How traditional banks and EMIs treat crypto users and crypto companies for fiat rails and accounts.", services.banks)}
        ${row("ATMs", "Bitcoin ATM density and practicality as an on/off-ramp (usually secondary to exchange bank transfer).", services.atm)}
        ${row("Merchants", "Whether shops/services accept crypto; almost always voluntary and not legal tender.", services.merchants)}
        ${row("Fiat rails", "How money moves between bank accounts, EMIs, and licensed platforms (SEPA, Pix, real-name, Travel Rule, etc.).", services.rails)}
      </dl>
      ${services.vaspLicensing ? `<p class="law-services-meta"><strong>Licensing note:</strong> ${lawEsc(services.vaspLicensing)}</p>` : ""}
      ${services.regulators ? `<p class="law-services-meta">${lawEsc(services.regulators)}</p>` : ""}
      <p class="law-muted law-services-disclaimer">Educational snapshot — not a directory or endorsement. Brand availability changes; always check the live national / ESMA register and terms of service (geo-blocks, promotions rules).</p>
    </div>`;
}

function lawEaseClass(level) {
  const t = String(level || "").toLowerCase();
  if (t === "easy") return "law-ease--easy";
  if (t === "medium") return "law-ease--medium";
  if (t === "hard") return "law-ease--hard";
  if (t === "very hard") return "law-ease--vhard";
  if (t === "restricted") return "law-ease--restricted";
  return "law-ease--na";
}

function lawEaseBadgeHtml(level, kind, audience) {
  const lv = level || "—";
  const levelTip = LAW_EASE_LEVEL_TIPS[String(lv).toLowerCase()] || LAW_EASE_LEVEL_TIPS["—"];
  const audTip = LAW_LAUNCH_AUDIENCE_TIPS[audience] || "";
  const kindLabel = kind === "meme" ? "Meme coin" : "ICO / public TGE";
  const full = `${kindLabel} · ${audience}: ${lv}. ${levelTip} ${audTip}`;
  return `<span class="law-ease ${lawEaseClass(lv)} law-has-tip" tabindex="0" data-tip="${lawEsc(full)}" aria-label="${lawEsc(full)}">${lawEsc(lv)}</span>`;
}

function lawLaunchEaseTableHtml(id, compact = false) {
  const L = lawLaunchEaseFor(id);
  const thAud = (key, label) =>
    `<th><span class="law-has-tip" tabindex="0" data-tip="${lawEsc(LAW_LAUNCH_AUDIENCE_TIPS[key])}" aria-label="${lawEsc(LAW_LAUNCH_AUDIENCE_TIPS[key])}">${lawEsc(label)}</span></th>`;
  const row = (kind, label) => {
    const o = L[kind] || {};
    const kindTip = LAW_LAUNCH_KIND_TIPS[kind] || "";
    return `<tr>
      <th scope="row"><span class="law-has-tip" tabindex="0" data-tip="${lawEsc(kindTip)}" aria-label="${lawEsc(kindTip)}">${lawEsc(label)}</span></th>
      <td>${lawEaseBadgeHtml(o.local, kind, "local")}</td>
      <td>${lawEaseBadgeHtml(o.region, kind, "region")}</td>
      <td>${lawEaseBadgeHtml(o.world, kind, "world")}</td>
      <td>${lawEaseBadgeHtml(o.eu, kind, "eu")}</td>
    </tr>`;
  };
  const notes = compact
    ? `<p class="law-launch-mini">${lawTip("What this means", "Relative educational scores for launching/marketing a meme coin or public ICO to four audiences. Hover any badge or column header. Not legal advice — EU retail almost always means MiCA analysis.")}</p>`
    : `<p class="law-launch-note"><strong>Meme:</strong> ${lawEsc(L.meme?.note || "")}</p>
       <p class="law-launch-note"><strong>ICO / TGE:</strong> ${lawEsc(L.ico?.note || "")}</p>
       <p class="law-muted law-launch-disclaimer">${lawTip("Local", LAW_LAUNCH_AUDIENCE_TIPS.local)} · ${lawTip("Region", LAW_LAUNCH_AUDIENCE_TIPS.region)} · ${lawTip("World", LAW_LAUNCH_AUDIENCE_TIPS.world)} · ${lawTip("EU", LAW_LAUNCH_AUDIENCE_TIPS.eu)}. Scale: ${lawTip("Easy", LAW_EASE_LEVEL_TIPS.easy)} · ${lawTip("Medium", LAW_EASE_LEVEL_TIPS.medium)} · ${lawTip("Hard", LAW_EASE_LEVEL_TIPS.hard)} · ${lawTip("Very hard", LAW_EASE_LEVEL_TIPS["very hard"])} · ${lawTip("Restricted", LAW_EASE_LEVEL_TIPS.restricted)}. Educational only — not legal advice.</p>`;
  return `
    <div class="law-launch-wrap${compact ? " law-launch-wrap--compact" : ""}">
      <div class="law-guide-table-wrap">
        <table class="law-guide-table law-launch-table">
          <thead>
            <tr>
              <th>${lawTip("Type", "Meme = community/viral token deploy + marketing risk. ICO = public sale / TGE with identifiable offeror.")}</th>
              ${thAud("local", "Local")}
              ${thAud("region", "Region")}
              ${thAud("world", "World")}
              ${thAud("eu", "EU")}
            </tr>
          </thead>
          <tbody>
            ${row("meme", "Meme coin")}
            ${row("ico", "ICO / public TGE")}
          </tbody>
        </table>
      </div>
      ${notes}
    </div>`;
}

function lawLayerCountryPills(ids) {
  return (ids || [])
    .map((id) => {
      const c = LAW_RELOCATE_BROWSER.find((x) => x.id === id);
      if (!c) return "";
      const hub = LAW_RELOCATE_HUBS[id] || {};
      const tip = `${c.name}: ${c.blurb} Click to open the full hub page (tax, KYC, visas, meme/ICO ease).`;
      return `<button type="button" class="law-layer-pill law-has-tip" data-layer-hub="${lawEsc(id)}" data-tip="${lawEsc(tip)}" aria-label="${lawEsc(tip)}">
        <span class="law-layer-pill__flag" aria-hidden="true">${hub.flag || "🌐"}</span>
        <span class="law-layer-pill__name">${lawEsc(c.name)}</span>
        <span class="law-layer-pill__meta">${lawEsc(c.region)} · CoL ${lawEsc(c.col)}</span>
      </button>`;
    })
    .filter(Boolean)
    .join("");
}

/**
 * Interactive 4-layer country finder (replaces Y/N decision trees).
 * Each layer: pick a goal → country hub pills.
 */
function lawRelocateTreesHtml() {
  const layers = LAW_LAYER_FINDER.map((layer) => {
    const layerExplain = LAW_LAYER_EXPLAIN[layer.id] || layer.tip;
    const opts = layer.options
      .map((o, i) => {
        const optTip = `${o.label}: ${o.why} Suggested: ${(o.ids || []).join(", ")}.`;
        return `<button type="button" class="law-layer-opt law-has-tip${i === 0 ? " is-active" : ""}" data-layer="${lawEsc(layer.id)}" data-opt="${lawEsc(o.id)}" aria-pressed="${i === 0 ? "true" : "false"}" data-tip="${lawEsc(optTip)}" aria-label="${lawEsc(optTip)}">
            ${lawEsc(o.label)}
          </button>`;
      })
      .join("");
    const first = layer.options[0];
    return `<article class="law-layer-card" data-layer-card="${lawEsc(layer.id)}">
      <header class="law-layer-card__head">
        <span class="law-layer-card__num law-has-tip" ${lawTipAttrs(layerExplain)}>${lawEsc(layer.num)}</span>
        <div>
          <h4 class="law-layer-card__title">${lawTip(layer.title, layerExplain)}</h4>
          <p class="law-layer-card__sub">${lawEsc(layer.subtitle)}</p>
        </div>
      </header>
      <p class="law-layer-card__tip">${lawEsc(layer.tip)}</p>
      <div class="law-layer-opts" role="group" aria-label="${lawEsc(layer.title)} goals">${opts}</div>
      <div class="law-layer-result" data-layer-result="${lawEsc(layer.id)}">
        <p class="law-layer-why" data-layer-why>${lawEsc(first.why)}</p>
        <p class="law-layer-result-label">${lawTip("Suggested countries", "Educational shortlist for this goal only — not a recommendation. Click a pill for the full hub page.")}</p>
        <div class="law-layer-pills" data-layer-pills>${lawLayerCountryPills(first.ids)}</div>
      </div>
    </article>`;
  }).join("");

  return `
    <section class="law-relocate-trees law-layer-finder" aria-label="Four-layer country finder">
      <div class="law-relocate-browser__head">
        <h3 class="law-subhead">${lawTip("Find a country · 4 layers", "Design your stack independently: (1) personal tax residence, (2) company seat, (3) banking rails, (4) lifestyle/visas/CoL. Countries can differ across layers.")}</h3>
        <p class="law-muted">Hover any <strong>?</strong> or goal chip for explanations. Pick <strong>one goal per layer</strong> — shortlists are starting points. Open a hub for tax, KYC, visas, and meme/ICO ease. Stacks can mix countries (e.g. live in Georgia, bank in Singapore, EU CASP entity). Educational only — not legal advice.</p>
        <div class="law-layer-legend">
          <span class="law-layer-legend__item">${lawTip("Layer 1 · Tax", LAW_LAYER_EXPLAIN.tax)}</span>
          <span class="law-layer-legend__item">${lawTip("Layer 2 · Company", LAW_LAYER_EXPLAIN.company)}</span>
          <span class="law-layer-legend__item">${lawTip("Layer 3 · Banking", LAW_LAYER_EXPLAIN.banking)}</span>
          <span class="law-layer-legend__item">${lawTip("Layer 4 · Life", LAW_LAYER_EXPLAIN.life)}</span>
        </div>
      </div>
      <div class="law-layer-grid">${layers}</div>
      <div class="law-layer-stack" data-layer-stack>
        <h4 class="law-layer-stack__title">${lawTip("Your stack (selected goals)", "Countries that appear in more of your four selected goals rank higher (e.g. 3/4 layers). Multi-country stacks are normal — same country is not required.")}</h4>
        <p class="law-layer-stack__summary" data-layer-stack-summary>Select options above — a combined shortlist appears here.</p>
        <div class="law-layer-pills law-layer-pills--stack" data-layer-stack-pills></div>
        <p class="law-muted" style="margin-top:0.5rem">
          <button type="button" class="law-btn law-btn--ghost" data-layer-mica title="Open the EU MiCA founders guide for CASP, white papers, and EU token offers">EU product → MiCA guide</button>
          <button type="button" class="law-btn law-btn--ghost" data-layer-focus title="Open the priority destination gallery">All focus hubs</button>
        </p>
      </div>
    </section>`;
}

/**
 * Hub country pages — full founder brief lives HERE (not on the long Global guide).
 * Fields are educational indications only; tax on arrival for BTC/stables is highly fact-specific.
 */
const LAW_RELOCATE_HUBS = {
  panama: {
    flag: "🇵🇦",
    accent: "#34d399",
    headline: "USD LatAm HQ · territorial tax themes · SA companies",
    fit: "Founders who want a Spanish/English LatAm base with USD rails and a serious company form.",
    colBands: [
      ["Lean solo", "USD 1.2–2.0k", "Panama City"],
      ["Comfortable couple", "USD 2.5–4.5k", "City"],
      ["Family + intl school", "USD 4.5–8k+", "School-driven"],
    ],
    pros: ["USD economy", "Company formation ecosystem", "Regional flights / logistics", "Territorial tax narratives (verify)"],
    cons: ["Bank KYC is hard for pure crypto", "Spanish admin", "Substance needed for credibility"],
    company: "Sociedad Anónima (SA) via local lawyer + resident agent. Budget ~USD 1.5–5k setup + annual maintenance.",
    visa: "Tourist scouting first; Friendly Nations / professional / investment-style residence categories — use immigration counsel (rules change).",
    banking: "Multi-bank + EMI stack. Prepare Italian exit story, source-of-funds, crypto policy. SEPA via EU CASP partners for EU users.",
    crypto: "Generally legal to hold/trade (see BTC status card). Not legal tender. EU clients still need MiCA-compliant rails.",
    kycAml:
      "Banks and VASPs apply full CDD: passport, proof of address, source of funds/wealth, UBO chart, business plan. Expect enhanced due diligence for crypto founders and Italian-exit stories. CRS reporting applies. No EU Travel Rule on pure local rails — but EU CASP partners will still apply Travel Rule on EU legs.",
    taxPersonal:
      "Often marketed as territorial: foreign-source income themes for non-local activity — anti-abuse, local-source rules, and actual residence facts matter. Do not DIY. Confirm with Panamanian tax counsel + Italian commercialista on dual-residence / exit.",
    taxCompany:
      "SA taxation depends on operations and territorial concepts; annual franchise/maintenance fees and accounting apply. Substance and management location affect PE risk for other countries (including Italy if managed from IT).",
    wealthOnArrival:
      "Becoming tax resident typically does not create an automatic “entry tax” on worldwide net wealth in the classic European wealth-tax sense — but banking will demand origin of wealth documentation for BTC/stables/cash. Gift/inheritance and local asset rules are separate. Always map Italy exit year vs Panama start year.",
    cryptoTaxOnResidency:
      "Common planning narrative: foreign-source crypto gains may sit outside local territorial tax if you are a genuine non-local operator — this is not a free pass. Disposals after residency, local trading, mining in-country, or “Panama-source” characterisation can change the outcome. Stablecoins treated as crypto/financial assets under bank/VASP policies; tax characterisation needs a written memo. Document cost basis before move (Italy LIFO/exit year).",
    next: ["Lawyer shortlist for SA", "Bank intro pack + SOF/SOW file for BTC", "Italy exit memo if relocating personally", "Check live Superintendencia / MEF crypto bills"],
  },
  uae: {
    flag: "🇦🇪",
    accent: "#38bdf8",
    headline: "Global travel hub · free-zone cos · zoned crypto licences",
    fit: "Founders who fly EU↔Asia constantly and will run a real free-zone establishment.",
    colBands: [
      ["Lean solo", "USD 2.2–3.5k", "Dubai"],
      ["Comfortable couple", "USD 4–7k", "Dubai"],
      ["Family + intl school", "USD 7–14k+", "School-driven"],
    ],
    pros: ["0% PIT marketing (verify CT/substance)", "Fast free-zone setup", "Crypto licensing zones (VARA/ADGM/FSRA)", "Airport hub"],
    cons: ["High CoL", "Licence ≠ marketing story", "Enhanced DD for crypto"],
    company: "Free-zone LLC/FZCO — choose zone by activity (crypto licence vs pure software). Mainland if needed for local contracts.",
    visa: "Employment / investor / free-zone linked residence. Not a tourist workaround for full-time founding.",
    banking: "Strong once narrative is licensed/clean. Keep EU CASP for EU users.",
    crypto: "Operate only inside licensed perimeter or partner with licensed VASPs. Check Overview UAE card.",
    kycAml:
      "UAE banks and licensed VASPs apply strict KYC/AML aligned with FATF expectations: passport, Emirates ID after residency, UBO, SOF/SOW, sanctions screening. Crypto activity usually requires a clear licensed business model. CRS applies. Travel Rule applies for in-scope VASPs.",
    taxPersonal:
      "Generally no personal income tax on salary/business profits for most individuals — confirm current rules and any specific regimes. Corporate tax (CT) exists for companies above thresholds. Free-zone incentives are activity- and substance-dependent.",
    taxCompany:
      "UAE CT (headline 9% themes with free-zone 0% pockets under conditions) — verify Free Zone Person / Qualifying Income tests. Economic substance regulations apply to relevant activities.",
    wealthOnArrival:
      "No classic EU-style wealth tax on worldwide assets solely because you become resident. Banks/VASPs still require origin-of-wealth proof for large BTC/stablecoin balances. Italy exit year remains critical for Italian capital gains timing.",
    cryptoTaxOnResidency:
      "Personal crypto gains are often outside a domestic PIT charge if no PIT applies — but this depends on your exact residence status and any future law changes. Corporate holdings of BTC/stables can fall under CT if inside a taxable person. AED-pegged EMTs/stables still need basis tracking for other countries (Italy if dual issues). Get a written UAE tax memo before moving large bags.",
    next: ["Pick free zone + activity licence path", "Corporate service provider quotes", "Bank shortlist + SOF file", "MiCA plan if EU clients"],
  },
  "el-salvador": {
    flag: "🇸🇻",
    accent: "#fbbf24",
    headline: "BTC-native brand · dollarized · low CoL vs EU",
    fit: "BTC-branded products and LatAm GTM; accept policy evolution risk.",
    colBands: [
      ["Lean solo", "USD 0.9–1.6k", "Hubs"],
      ["Comfortable couple", "USD 1.8–3.2k", ""],
      ["Family + private school", "USD 3–6k+", ""],
    ],
    pros: ["BTC brand association", "USD economy", "Lower CoL", "Fast company setup stories"],
    cons: ["Smaller professional services market", "Policy volatility", "Banking selective"],
    company: "Local incorporation with counsel; verify current foreign investment programmes.",
    visa: "Temporary residence / investment paths — counsel required.",
    banking: "Selective; dollarization helps once onboarded.",
    crypto: "Legal-tender history evolved — verify live. EU clients still need MiCA.",
    kycAml:
      "Banks and exchanges apply CDD/EDD; Bitcoin-branded activity attracts extra questions. Expect SOF/SOW, UBO, and sanctions screening. CRS participation — assume transparency.",
    taxPersonal:
      "Personal tax rules for residents must be confirmed with local counsel; do not assume “BTC legal tender = zero tax forever.” Policy has moved over time.",
    taxCompany:
      "Corporate income tax and municipal taxes apply depending on activity; tech/investment incentives change — verify current law.",
    wealthOnArrival:
      "No automatic European-style wealth tax on global net worth solely on day-one residency is commonly assumed — still document acquisition cost of crypto before arrival. Banking onboarding is the practical gate.",
    cryptoTaxOnResidency:
      "Holding BTC/stables as a new resident: check whether disposals after residency are taxed as capital gains/income under current SV rules. Legal-tender-era rules and later reforms must be read together. Stablecoins may be treated like foreign currency/crypto depending on instrument — get a local tax letter before large transfers.",
    next: ["Live BTC legal-status card", "Local tax letter on crypto disposals", "EU CASP partner if EU users", "Bank pack"],
  },
  paraguay: {
    flag: "🇵🇾",
    accent: "#a3e635",
    headline: "Low CoL · hydro/mining narrative · territorial themes",
    fit: "Cost-sensitive teams, energy/mining adjacency, Spanish LatAm ops.",
    colBands: [
      ["Lean solo", "USD 0.7–1.3k", "Asunción"],
      ["Comfortable couple", "USD 1.4–2.6k", ""],
      ["Family", "USD 2.2–4.5k", ""],
    ],
    pros: ["Very competitive CoL", "Energy/mining interest", "Budget company setup"],
    cons: ["Banking bottleneck", "Thinner institutional optics", "Verify territorial tax claims"],
    company: "SA/SRL via local counsel — typically cheaper than Panama/US.",
    visa: "Temporary residence / investment — immigration counsel.",
    banking: "Plan multi-rail (local + EMI) early.",
    crypto: "Mining-friendly narratives; retail VASP depth thinner — see Overview.",
    kycAml:
      "Local banks are conservative; crypto founders need strong SOF/SOW and often local references. Mining operations trigger energy-contract and source documentation. CRS applies via banking channels.",
    taxPersonal:
      "Territorial / foreign-source themes are often marketed — confirm resident vs non-resident tests and what counts as Paraguayan-source. Italian dual-residence risk if days/ties remain in IT.",
    taxCompany:
      "Corporate tax on local companies; incentives for certain investments/energy — case-by-case. PE risk if management stays in Italy.",
    wealthOnArrival:
      "No classic EU wealth tax on worldwide assets solely for becoming resident is a common planning assumption — still prepare cost-basis files. Large inbound crypto transfers will face bank questions, not a formal “entry wealth tax” in most practitioner narratives.",
    cryptoTaxOnResidency:
      "Gains on BTC/stables after residency: map whether territorial rules exclude foreign-exchange disposals. Mining rewards may be income when received. Document pre-residency holdings (Italy exit year). Do not rely on social-media “PY = 0% crypto” claims without a written memo.",
    next: ["Residence path quote", "Tax memo on territorial + crypto", "Banking pre-check", "Italy exit if moving"],
  },
  georgia: {
    flag: "🇬🇪",
    accent: "#f472b6",
    headline: "Lean EU-adjacent base · low CoL · crypto history",
    fit: "Remote teams wanting Europe-adjacent life without EU tax residence.",
    colBands: [
      ["Lean solo", "USD 0.8–1.4k", "Tbilisi"],
      ["Comfortable couple", "USD 1.6–2.8k", ""],
      ["Family", "USD 2.5–4.5k", ""],
    ],
    pros: ["Low CoL", "Easy short stays for many EU passports", "Active crypto community", "Mining history"],
    cons: ["Re-verify tax narratives yearly", "Banking selective", "Not MiCA passport"],
    company: "Fast LLC-style setup; English-friendly advisors available.",
    visa: "Easy tourism for many EU passports; long-term categories exist — counsel.",
    banking: "Clean source-of-funds pack required.",
    crypto: "Friendly history ≠ EU licence. Pair with EU CASP for EU users.",
    kycAml:
      "Banks apply standard FATF-style CDD; crypto wealth requires exchange statements, wallet history, and SOF narrative. Mining income needs contracts/power bills. CRS reporting through banks.",
    taxPersonal:
      "Historically marketed individual crypto-friendly outcomes — rules and Revenue Service practice evolve. Confirm current treatment of individuals vs IE/small business. Do not assume multi-year grandfathering without counsel.",
    taxCompany:
      "Corporate tax can be distribution-based / special regimes depending on status — verify current Georgian tax code with a local advisor.",
    wealthOnArrival:
      "Becoming resident usually focuses on income/gains after residency rather than a one-off wealth levy on global net assets — still document acquisition of crypto before arrival. Banking is the practical checkpoint.",
    cryptoTaxOnResidency:
      "Confirm whether personal disposal of BTC/stables after residency is taxed, exempt under a specific regime, or depends on trading frequency. Mining rewards timing matters. Stablecoins: treat as crypto assets unless counsel says otherwise. Re-check annually — Georgia’s crypto tax story has shifted in public debate.",
    next: ["Days calendar vs Italy", "Local tax letter on crypto 2026", "EU CASP if needed", "Residence plan"],
  },
  "costa-rica": {
    flag: "🇨🇷",
    accent: "#2dd4bf",
    headline: "Lifestyle · Americas timezone · permissive holding",
    fit: "Quality-of-life base covering US/LatAm hours; not max tax aggression.",
    colBands: [
      ["Lean solo", "USD 1.2–2.0k", "Central Valley"],
      ["Comfortable couple", "USD 2.2–3.8k", ""],
      ["Family + school", "USD 3.5–7k", "School-driven"],
    ],
    pros: ["Lifestyle", "Americas TZ", "Spanish", "Generally permissive BTC holding"],
    cons: ["Not cheapest", "Banking mixed", "Thinner VASP depth than big hubs"],
    company: "SA/SRL with local counsel.",
    visa: "Rentista / pensionado / nomad-style paths evolve — verify.",
    banking: "Need product story for crypto founders.",
    crypto: "No famous comprehensive ban — see Overview Costa Rica.",
    kycAml:
      "Banks under SUGEF perimeter apply full KYC; crypto SOF questions common. Expect Spanish documentation. CRS applies.",
    taxPersonal:
      "Residents generally taxed on Costa Rican-source income; worldwide vs territorial nuances and reforms must be confirmed with a local tax advisor (do not assume pure territorial forever).",
    taxCompany:
      "Corporate tax on local entities; free-trade zone / incentive regimes only if you qualify. PE risk if managed from Italy.",
    wealthOnArrival:
      "No automatic EU-style wealth tax on global portfolio solely for new residency is typical in practitioner discussions — banks still want origin of wealth. Italy exit gains timing remains separate.",
    cryptoTaxOnResidency:
      "Map whether BTC/stable disposals after residency are Costa Rican-source or foreign-source under current rules. Frequent trading may look like business income. Keep pre-move cost basis. Confirm VAT/FX angles for stables with counsel.",
    next: ["Scout trip", "Tax memo on source rules + crypto", "Residence category", "Bank intro"],
  },
  kazakhstan: {
    flag: "🇰🇿",
    accent: "#a78bfa",
    headline: "AIFC English-law hub · mining/energy · lower CoL",
    fit: "Central Asia structuring, mining adjacency, AIFC participants.",
    colBands: [
      ["Lean solo", "USD 0.9–1.6k", "Almaty / Astana"],
      ["Comfortable couple", "USD 1.7–3.0k", ""],
      ["Family", "USD 2.5–5.0k", ""],
    ],
    pros: ["AIFC framework option", "Lower CoL", "Mining/energy context"],
    cons: ["Winter/ops planning", "Language outside AIFC bubble", "Rules change"],
    company: "AIFC participant vs ordinary Kazakhstan companies — choose with counsel.",
    visa: "Business/investment categories — not automatic.",
    banking: "Selective; AIFC may help institutional narrative.",
    crypto: "Mining history + regulatory experiments — verify national + AIFC rules.",
    kycAml:
      "Banks and AIFC firms apply CDD/EDD; mining and crypto SOF files are detailed (contracts, wallets, exchange exports). Sanctions screening important given regional corridors. CRS via banks.",
    taxPersonal:
      "Personal income tax applies to residents under national rules; AIFC participants may have special regimes for certain activities — confirm which box you sit in. Do not mix AIFC marketing with ordinary residence tax.",
    taxCompany:
      "AIFC tax preferences vs standard Kazakh corporate tax differ sharply. Substance and licensed activity drive outcomes.",
    wealthOnArrival:
      "Residency does not typically impose a one-off wealth tax on global crypto holdings in standard narratives — onboarding banks will still demand SOF. Mining equipment imported may have customs angles.",
    cryptoTaxOnResidency:
      "After becoming tax resident, disposals of BTC/stables may be taxable personal income/capital gains under the applicable regime (national vs AIFC). Mining rewards often income when earned. Get a dual memo: national tax + AIFC if relevant. Track basis from Italy exit.",
    next: ["AIFC vs ordinary path memo", "Tax letter on crypto as resident", "Visa quote", "Bank shortlist"],
  },
  guatemala: {
    flag: "🇬🇹",
    accent: "#94a3b8",
    headline: "Low CoL Spanish base · thinner formal crypto stack",
    fit: "Cost-sensitive Central America life; not prestige HQ.",
    colBands: [
      ["Lean solo", "USD 0.7–1.3k", "City / Antigua"],
      ["Comfortable couple", "USD 1.5–2.8k", ""],
      ["Family", "USD 2.5–5k", ""],
    ],
    pros: ["Low CoL", "Spanish", "Growing remote interest"],
    cons: ["Security variance by area", "Conservative banks", "Thin VASP framework"],
    company: "SA/SRL via local counsel.",
    visa: "Tourist + temporary residence paths — counsel.",
    banking: "Harder crypto narrative than Panama.",
    crypto: "Generally legal hold; formal framework thin — Overview card.",
    kycAml:
      "Conservative banking KYC; crypto SOF often difficult without clear exchange paper trail. Expect Spanish docs and enhanced questions for foreign founders.",
    taxPersonal:
      "Confirm resident tax base (territorial vs worldwide elements) with Guatemalan counsel; Italian dual-residence risk if ties remain in IT.",
    taxCompany:
      "Corporate tax on local companies; PE risk if managed from abroad/Italy.",
    wealthOnArrival:
      "No automatic EU-style wealth entry tax is typically assumed — practical barrier is bank acceptance of crypto-derived wealth.",
    cryptoTaxOnResidency:
      "Confirm taxation of post-residency disposals of BTC/stables and whether foreign-source gains are in scope. Thin formal guidance → written memo essential. Keep pre-move basis from Italy.",
    next: ["Security/lifestyle due diligence", "Tax memo", "Residence path", "EMI backup rails"],
  },
  japan: {
    flag: "🇯🇵",
    accent: "#fb7185",
    headline: "Regulated market · high trust · high tax if resident",
    fit: "Japan GTM and Asia credibility — not a low-tax move for most full-time residents.",
    colBands: [
      ["Lean solo", "USD 1.8–2.8k", "Central Tokyo"],
      ["Comfortable couple", "USD 3.5–6k", "Tokyo"],
      ["Family + intl school", "USD 6–12k+", "School-driven"],
    ],
    pros: ["Safety", "Infrastructure", "Clear exchange regulation", "Huge market"],
    cons: ["High marginal tax possible on crypto", "Visa substance", "Language", "Bank after residence"],
    company: "GK/KK via judicial scrivener; Business Manager visa often needs real office.",
    visa: "Business Manager / HSP / Engineer paths — capital & office tests.",
    banking: "Excellent once resident; slow for non-residents.",
    crypto: "Legal/regulated exchanges — local registration to serve JP users.",
    kycAml:
      "Extremely thorough bank/exchange KYC (My Number after residency, seal/signature practices, SOF). Registered exchanges apply strict AML. Travel Rule applies for VASPs. Expect multi-week account opening.",
    taxPersonal:
      "Residents face progressive national tax + inhabitants tax. Crypto gains for individuals are often treated as miscellaneous income (high effective rates possible) — confirm current NTA practice with a zeirishi. Not a low-tax relocation story for most.",
    taxCompany:
      "National corporate tax + local taxes; crypto treasury accounting is specialist. Exchange business needs registration capital and systems.",
    wealthOnArrival:
      "Japan does not generally impose a one-off “wealth entry tax” on foreign crypto bags solely for becoming resident — but subsequent disposals can be heavily taxed. Inheritance tax exposure can be significant for long-term residents with worldwide assets — estate planning required.",
    cryptoTaxOnResidency:
      "Critical: once Japanese tax resident, selling BTC or stables can trigger high effective tax under miscellaneous-income style treatment (confirm live rules). There is typically no free step-up just for arriving — basis and FX to JPY matter. Stablecoin redemptions/swaps can be taxable events. Model tax before you move large holdings; consider timing disposals in Italy exit year with Italian counsel.",
    next: ["Visa path selection", "Zeirishi crypto tax model before move", "Office + capital plan", "Local exchange perimeter"],
  },
  singapore: {
    flag: "🇸🇬",
    accent: "#38bdf8",
    headline: "Asia HQ · MAS perimeter · excellent banks · high CoL",
    fit: "Regional HQ, funds adjacency, English common-law style ops.",
    colBands: [
      ["Lean solo", "USD 2.5–4k", ""],
      ["Comfortable couple", "USD 4.5–8k", ""],
      ["Family + school", "USD 8–15k+", ""],
    ],
    pros: ["Banks", "Rule of law optics", "Asia flights", "Pte Ltd speed"],
    cons: ["Very high CoL", "MAS compliance bar for crypto services"],
    company: "Pte Ltd via corporate service provider.",
    visa: "Employment / EntrePass-style paths.",
    banking: "Excellent with clean story.",
    crypto: "MAS DPT/payment regimes — licence if you provide services.",
    kycAml:
      "Top-tier bank KYC; crypto SOF/SOW packages standard. MAS-licensed entities apply Travel Rule and strict AML. Expect source-of-wealth interviews for large crypto.",
    taxPersonal:
      "Tax resident individuals taxed on Singapore-sourced income; foreign-sourced income may be exempt under conditions (remittance rules matter). Confirm with Singapore tax advisor — not automatic “zero on all crypto forever.”",
    taxCompany:
      "Corporate tax on companies; incentives possible for qualifying activities. Crypto businesses need correct licensing before revenue claims.",
    wealthOnArrival:
      "No general wealth tax on worldwide net assets solely for new residency. Remittance of foreign income/gains can have tax consequences — structure how you bring money in.",
    cryptoTaxOnResidency:
      "Personal crypto: often turns on whether gains are Singapore-sourced, trading business, or foreign-sourced and remitted. Stablecoin trades can be taxable if characterised as trading. Get IRAS-facing advice before large post-move disposals. Italy exit timing still matters for Italian tax year.",
    next: ["Activity licence map", "Tax memo on remittance + crypto", "CSP quotes", "Bank intro"],
  },
  cuba: {
    flag: "🇨🇺",
    accent: "#94a3b8",
    headline: "Restricted crypto posture · limited foreign-founder paths",
    fit: "Only with specialist local counsel; not a typical first-choice founder hub.",
    colBands: [
      ["Tourist-facing costs", "Variable", "Dual economy dynamics"],
      ["Global remote ops", "Often impractical", "Connectivity / banking limits"],
    ],
    pros: ["Regional interest for specific projects"],
    cons: ["Banking limits", "Restricted company paths for foreigners", "Crypto framework constrained"],
    company: "Foreign investment structures are specialised — use local counsel; not a simple SA path.",
    visa: "Tourist and other categories — confirm what work/entrepreneurship is allowed.",
    banking: "International rails are limited; many foreign banks apply heightened scrutiny.",
    crypto: "Restricted posture — see Overview legal-status card.",
    kycAml:
      "Expect heightened scrutiny from foreign banks/VASPs if Cuba appears in your profile. Local KYC rules must be confirmed on the ground. CRS/sanctions screening still applies to your wider stack.",
    taxPersonal:
      "Confirm resident tax base with Cuban and Italian counsel; not a mainstream personal-tax planning destination for EU crypto founders.",
    taxCompany:
      "Company taxation depends on the investment vehicle available to foreigners — specialist advice only.",
    wealthOnArrival:
      "Document origin of wealth as for any move. Practical banking access is often harder than formal tax theory.",
    cryptoTaxOnResidency:
      "Map post-residency treatment of BTC/stable disposals with local counsel; restricted market access may dominate. Coordinate any Italy exit year separately.",
    next: ["Overview legal-status card", "Specialist local counsel if pursuing", "Banking feasibility check"],
  },
  mexico: {
    flag: "🇲🇽",
    accent: "#f97316",
    headline: "LatAm scale · Spanish · fintech law (not MiCA)",
    fit: "Spanish LatAm market access with larger economy than CA peers.",
    colBands: [
      ["Lean solo", "USD 1.0–1.8k", "CDMX mid"],
      ["Comfortable couple", "USD 2.0–3.8k", ""],
      ["Family", "USD 3.5–7k", ""],
    ],
    pros: ["Large market", "Spanish", "Fintech ecosystem"],
    cons: ["Tax complexity", "Banking mixed for crypto", "Security variance"],
    company: "SA de CV / SAPI etc. via local counsel.",
    visa: "Temporary resident / work — counsel.",
    banking: "Mixed; fintechs help but crypto SOF hard.",
    crypto: "Fintech law; exchanges regulated — Overview MX.",
    kycAml: "Full bank/fintech KYC; CNBV-perimeter entities; CRS; crypto SOF scrutiny high.",
    taxPersonal: "Residents generally taxed on worldwide income — major difference vs territorial marketing hubs. Confirm with Mexican tax advisor.",
    taxCompany: "Corporate tax on Mexican entities; PE rules matter.",
    wealthOnArrival: "Worldwide tax residence can bring foreign crypto into scope going forward; no automatic free step-up — basis tracking essential. Italy exit year planning critical.",
    cryptoTaxOnResidency:
      "As a Mexican tax resident, gains on BTC/stables may be taxable (capital gains / other income — confirm live SAT rules). Entering residency does not erase past Italian tax; future disposals likely in MX scope if worldwide. Model before you move bags.",
    next: ["Tax residency model MX vs IT", "Company type", "Bank/fintech pack"],
  },
  switzerland: {
    flag: "🇨🇭",
    accent: "#e2e8f0",
    headline: "Institutional · cantonal tax competition · high CoL",
    fit: "Custody, funds, institutional crypto — expensive substance.",
    colBands: [
      ["Lean solo", "USD 3.5–5k", "ZH/GE high"],
      ["Comfortable couple", "USD 6–10k", ""],
      ["Family + school", "USD 10–18k+", ""],
    ],
    pros: ["Banks (selective)", "FINMA clarity paths", "Talent", "Reputation"],
    cons: ["Very high CoL", "Hard immigration", "High bar for banks"],
    company: "AG/GmbH; association self-reg history for some crypto — counsel.",
    visa: "Work/permit quotas — hard for non-EU without employer.",
    banking: "Excellent if accepted; crypto SOF extreme DD.",
    crypto: "FINMA supervisory perimeter for many activities.",
    kycAml: "World-class AML; beneficial ownership transparency; Travel Rule for VASPs; expect multi-month bank onboarding for crypto wealth.",
    taxPersonal: "Cantonal competition; progressive federal + cantonal/communal. Crypto often wealth-taxed and gains rules depend on private vs commercial classification.",
    taxCompany: "Federal + cantonal corporate tax; status regimes reformed — current law only.",
    wealthOnArrival:
      "Switzerland often taxes net wealth (including crypto) at cantonal level for residents — moving in can create annual wealth tax on BTC/stables, not just tax on disposal. Valuation methods matter.",
    cryptoTaxOnResidency:
      "Private wealth: capital gains on movable private assets often tax-free federally, but wealth tax and “professional trader” reclassification risk are real. Stables and BTC count toward wealth tax base. Commercial trading = income tax. Get cantonal ruling culture advice before relocating large portfolios.",
    next: ["Canton choice", "Immigration feasibility", "Tax classification memo private vs commercial", "Bank intro"],
  },
  usa: {
    flag: "🇺🇸",
    accent: "#60a5fa",
    headline: "Huge GTM · federal+state patchwork · not a casual tax move",
    fit: "US market GTM with counsel — EU persons must watch tax residency and estate rules.",
    colBands: [
      ["Lean solo", "USD 2–4k", "Varies hugely by city"],
      ["Comfortable couple", "USD 4–8k", ""],
      ["Family", "USD 7–15k+", ""],
    ],
    pros: ["Market size", "Capital", "Talent"],
    cons: ["Worldwide tax if US tax resident/citizen", "Complex crypto tax", "Visa hard"],
    company: "DE/WY LLC or C-Corp — US tax classification elections matter for foreign owners.",
    visa: "E-2/O-1/L-1/H-1B etc. — specialist immigration.",
    banking: "Good once identity/ITIN path clear; crypto SOF still hard.",
    crypto: "Federal agencies + state money-transmitter / bitlicense-style regimes.",
    kycAml: "BSA/AML for MSB/exchanges; banks apply CIP/CDD; Travel Rule; OFAC sanctions screening strict.",
    taxPersonal: "US tax residents taxed on worldwide income including crypto. Becoming a resident alien can pull global gains into US scope. Expatriation rules if later leaving as long-term resident.",
    taxCompany: "C-Corp 21% federal + state; pass-through LLC complexity for foreign owners — withholding and treaties.",
    wealthOnArrival:
      "No federal wealth tax, but worldwide income tax from residency start can hit unrealised planning poorly if you sell after arrival. Estate/gift tax exposure for US persons/domiciliaries is a major wealth issue — plan before large transfers.",
    cryptoTaxOnResidency:
      "From residency, BTC/stable disposals generally capital gains (short/long) with wash-sale nuances evolving; income inclusion for certain rewards. No free basis step-up merely for becoming resident. Coordinate Italy exit year vs US start date. Stables may be treated as property/currency hybrids — IRS guidance evolves.",
    next: ["Immigration counsel", "Cross-border tax model IT→US", "Entity election memo", "State choice"],
  },
  uk: {
    flag: "🇬🇧",
    accent: "#818cf8",
    headline: "English law · talent hub · FCA cryptoasset promotions regime",
    fit: "Founders who need London talent/capital access and accept high CoL + promotion rules — not a casual tax cut for Italians.",
    colBands: [
      ["Lean solo", "USD 2.5–4k", "Outer London / other cities lower"],
      ["Comfortable couple", "USD 4.5–8k", "London"],
      ["Family + school", "USD 8–16k+", "School-driven"],
    ],
    pros: ["English common-law stack", "Deep talent & VCs", "Time zone bridge EU–US", "Clearer crypto promotions rules than many hubs"],
    cons: ["High CoL in London", "FCA financial-promotion friction for crypto", "Personal tax can be high if UK resident", "Post-Brexit ≠ MiCA passport"],
    company: "Ltd via Companies House is fast; directors/PSC register transparency. Crypto product often needs FCA registration/authorisation path depending on activity.",
    visa: "Skilled Worker, Innovator Founder, Global Talent, etc. — immigration counsel. Short visits ≠ tax residence.",
    banking: "Strong once identity and SOF clear; pure crypto founders still face enhanced DD. EMI/fintech rails common.",
    crypto: "FCA cryptoasset regime (registration, promotions, financial crime). Marketing memecoins/ICOs to UK retail is tightly controlled.",
    kycAml:
      "UK banks and crypto firms apply full CDD/EDD under MLR; PSC/UBO transparency; Travel Rule for in-scope firms; sanctions screening. Expect detailed SOF/SOW for crypto wealth and Italian-exit narratives. CRS applies.",
    taxPersonal:
      "UK tax residents generally taxed on worldwide income/gains (with remittance-basis nuances for some non-doms — rules reformed; do not assume old non-dom playbook). Confirm residence tests (days/ties) with UK tax counsel + Italian commercialista.",
    taxCompany:
      "Corporation tax on UK companies; substance and management/control matter for non-UK owners. PE risk if managed from Italy. Crypto accounting and VAT angles are specialist.",
    wealthOnArrival:
      "No classic annual wealth tax like some EU states, but becoming UK resident can bring worldwide gains into scope going forward. Inheritance tax domicile/residence concepts are complex — estate planning before large gifts/moves.",
    cryptoTaxOnResidency:
      "From UK tax residence, BTC/stable disposals often capital gains (or income if trading business). No free step-up merely for arriving — basis and sterling FX matter. Stables may be capital assets or currency-like depending on facts. Model Italy exit year vs UK start date before moving bags.",
    next: ["UK tax residence memo vs Italy", "FCA perimeter map for product", "Visa path selection", "Bank SOF pack"],
  },
  argentina: {
    flag: "🇦🇷",
    accent: "#fbbf24",
    headline: "High practical crypto usage · macro/FX complexity · low USD CoL themes",
    fit: "Founders targeting Spanish LatAm users who can operate through FX/macro volatility — not a simple low-tax HQ story.",
    colBands: [
      ["Lean solo (USD terms)", "USD 0.8–1.6k", "Highly FX-dependent"],
      ["Comfortable couple", "USD 1.6–3.2k", ""],
      ["Family", "USD 2.5–5.5k", ""],
    ],
    pros: ["Huge retail crypto familiarity", "Spanish talent pool", "Large domestic market", "Competitive USD-equivalent CoL for many lifestyles"],
    cons: ["FX / capital-control history", "Tax and reporting complexity", "Banking can be bureaucratic", "Macro policy risk"],
    company: "SRL/SA via local counsel; foreign ownership common with proper registration. Accounting/FX reporting is part of ops cost.",
    visa: "Temporary residence / work / rentista-style paths — immigration counsel; rules evolve with economic programmes.",
    banking: "Complex for crypto-linked flows; many founders use multi-rail (local bank + foreign EMI). SOF in local currency and USD both matter.",
    crypto: "High practical usage; regulatory and tax frameworks evolve — see Overview card. Not MiCA.",
    kycAml:
      "Banks apply CDD with strong FX-control sensitivity; crypto SOF often scrutinised. UIF-style AML perimeter for obliged entities. CRS via banking channels. Expect Spanish documentation and detailed origin-of-wealth files.",
    taxPersonal:
      "Residents generally face personal income tax on relevant worldwide or Argentine-source categories depending on status — confirm current AFIP/ARCA practice with local counsel. Do not assume crypto is invisible.",
    taxCompany:
      "Corporate tax on local entities; inflation accounting and FX rules can dominate. PE risk if managed from Italy.",
    wealthOnArrival:
      "No automatic EU-style wealth entry tax is typically the planning frame — practical issues are FX conversion, banking onboarding, and personal tax residence start. Document pre-move crypto cost basis (Italy exit year).",
    cryptoTaxOnResidency:
      "Post-residency disposals of BTC/stables may be taxable under personal income / capital gains style rules — confirm live characterisation (including stables as FX-like instruments). Frequent trading can look like business income. Coordinate Italian exit-year disposals before Argentine residence day-one.",
    next: ["FX + tax memo with local counsel", "Residence category quote", "Multi-rail banking plan", "Italy exit timing"],
  },
  uruguay: {
    flag: "🇺🇾",
    accent: "#38bdf8",
    headline: "Residence programmes · smaller market · mid CoL LatAm",
    fit: "Founders wanting a quieter LatAm residence base with stronger institutional optics than some neighbours — not max tax aggression.",
    colBands: [
      ["Lean solo", "USD 1.2–2.0k", "Montevideo"],
      ["Comfortable couple", "USD 2.2–3.8k", ""],
      ["Family", "USD 3.5–7k", ""],
    ],
    pros: ["Relative institutional stability in LatAm", "Residence pathways marketed to foreigners", "Spanish", "Smaller, manageable market"],
    cons: ["Higher CoL than PY/GT", "Smaller talent/VASP depth", "Crypto framework evolving"],
    company: "SA/SRL via local counsel; foreign investors common with proper setup.",
    visa: "Temporary/permanent residence and investment-linked paths — verify current income/asset thresholds with immigration counsel.",
    banking: "Selective but often more approachable than harder LatAm rails if SOF is clean; still enhanced DD for crypto.",
    crypto: "Evolving formal framework; generally no blanket ban on holding — Overview card for status.",
    kycAml:
      "Banks apply FATF-style CDD; crypto SOF/SOW standard. CRS applies. Expect passport, proof of funds, and business narrative in Spanish or English depending on bank.",
    taxPersonal:
      "Uruguay has been associated with territorial / foreign-source themes for certain residents — reforms and residence tests matter. Confirm current IRPF/IRNR treatment with Uruguayan tax counsel; do not rely on blog “0% forever” claims.",
    taxCompany:
      "Corporate tax (IRAE) on local companies; free-zone / incentive regimes only if you truly qualify. PE risk if managed from Italy.",
    wealthOnArrival:
      "Becoming resident typically focuses on income taxation rules rather than a one-off wealth levy on global bags — banks still demand origin of wealth. Italy exit year remains critical.",
    cryptoTaxOnResidency:
      "Map whether post-residency BTC/stable disposals are foreign-source under current territorial-style rules or taxable. Trading frequency and local activity characterisation matter. Written memo + basis file before move.",
    next: ["Residence programme eligibility letter", "Tax memo territorial vs worldwide facts", "Bank intro pack", "Italy dual-residence calendar"],
  },
  thailand: {
    flag: "🇹🇭",
    accent: "#f472b6",
    headline: "Nomad lifestyle · SEC digital-asset rules · company often elsewhere",
    fit: "Lifestyle / remote-ops base in Asia; crypto product licences and company seat frequently sit outside pure tourist Thailand.",
    colBands: [
      ["Lean solo", "USD 0.9–1.6k", "Chiang Mai / secondary"],
      ["Comfortable couple", "USD 1.8–3.5k", "Bangkok mid"],
      ["Family + intl school", "USD 3.5–8k+", "Bangkok / Phuket school-driven"],
    ],
    pros: ["Lifestyle & food", "Strong digital nomad ecosystem", "Regional flights", "Competitive CoL outside luxury Bangkok"],
    cons: ["Banking hard for non-residents", "Tourist ≠ business rights", "Digital-asset offers regulated", "LTR / visa rules change"],
    company: "Thai co possible but foreign ownership limits and BOI/incentive paths matter — many founders keep OpCo in SG/HK/elsewhere and live in TH with correct visa.",
    visa: "Tourist, education, Elite/LTR-style, employment — do not run a business on a pure tourist stamp. Immigration counsel required.",
    banking: "Hard without proper residence/work status; crypto SOF scrutinised. Foreign EMI common as backup.",
    crypto: "SEC Thailand digital-asset framework; licensed exchanges/offerings dominate public sales. Lifestyle ≠ free meme ICO lane.",
    kycAml:
      "Banks and licensed digital-asset operators apply strict KYC; expect passport, work permit/residence evidence, SOF. CRS applies. Travel Rule for in-scope VASPs.",
    taxPersonal:
      "Thai tax residence (days) can pull foreign income into scope under remittance / worldwide reforms — rules have tightened for foreign-sourced income remitted by residents. Confirm current Revenue Department practice with Thai tax counsel before assuming “live in TH, tax nothing.”",
    taxCompany:
      "Thai corporate tax on local entities; foreign-owned structures need correct licences. PE risk if you manage foreign cos from Thailand without planning.",
    wealthOnArrival:
      "No classic EU wealth tax on day-one bags is the usual frame — remittance of foreign income/gains after becoming resident can create tax. Banking acceptance of crypto wealth is the practical gate.",
    cryptoTaxOnResidency:
      "Post-residence disposals and remittances of crypto gains may be taxable under current foreign-income remittance themes — confirm live rules. Stables treated as digital assets under SEC perimeter for offering/trading venues. Italy exit year still matters.",
    next: ["Visa path that matches real work", "Thai tax memo on remittance + crypto", "Decide company seat (TH vs SG/HK)", "Bank feasibility check"],
  },
  malaysia: {
    flag: "🇲🇾",
    accent: "#34d399",
    headline: "SC digital-asset regime · mid CoL Asia · MM2H-style programmes evolve",
    fit: "Founders wanting SE Asia base with English-friendly business culture; public crypto offers sit under SC rules.",
    colBands: [
      ["Lean solo", "USD 0.9–1.5k", "KL mid / Penang lower"],
      ["Comfortable couple", "USD 1.8–3.2k", ""],
      ["Family + school", "USD 3–7k", "Intl school-driven"],
    ],
    pros: ["Competitive CoL vs SG", "English widely used in business", "SC regulatory clarity for digital assets", "Food & regional connectivity"],
    cons: ["MM2H / residence programmes change often", "Banking mixed for pure crypto", "Public token offers not light-touch"],
    company: "Sdn Bhd via company secretary; foreign ownership generally allowed with sector limits. Labuan / MSC-style options only if you truly qualify.",
    visa: "Employment pass, MM2H-style, dependent passes — thresholds and rules change; immigration counsel.",
    banking: "Doable with residence + clean SOF; crypto founders still face enhanced questions. Multi-rail common.",
    crypto: "Securities Commission digital-asset framework — approved venues and offering rules. Not a free ICO jurisdiction.",
    kycAml:
      "Banks and SC-regulated entities apply CDD/EDD; beneficial ownership; sanctions. CRS applies. Prepare exchange history and business plan for crypto wealth.",
    taxPersonal:
      "Tax residents generally taxed on Malaysian-source income; foreign-source income remittance rules have evolved — confirm current LHDN practice. Do not assume zero on remitted crypto gains.",
    taxCompany:
      "Corporate tax on Sdn Bhd; incentives only if criteria met. PE risk if foreign OpCo managed from MY without planning.",
    wealthOnArrival:
      "No automatic wealth entry tax narrative like some EU states — remittance and residence start dates drive tax. Banks want SOF/SOW for inbound crypto cash-outs.",
    cryptoTaxOnResidency:
      "Map post-residency disposals and remittances of BTC/stable gains under current personal tax rules. SC rules govern offerings/trading venues separately from personal tax. Coordinate Italy exit year.",
    next: ["SC perimeter map for product", "Residence programme quote (live rules)", "Tax memo remittance + crypto", "Company seat decision"],
  },
  indonesia: {
    flag: "🇮🇩",
    accent: "#fb923c",
    headline: "Bali lifestyle · foreign ownership limits · regulated exchange rails",
    fit: "Lifestyle base (often Bali) with careful separation of tourist stay vs business rights; company ownership rules are non-trivial for foreigners.",
    colBands: [
      ["Lean solo", "USD 0.8–1.5k", "Bali mid / secondary cities"],
      ["Comfortable couple", "USD 1.6–3.2k", ""],
      ["Family", "USD 2.8–6k", "Intl school options limited"],
    ],
    pros: ["Strong lifestyle brand", "Growing tech scenes (Jakarta/Bali)", "Competitive CoL", "Regional crypto retail interest"],
    cons: ["Foreign ownership / PT PMA complexity", "Tourist visa ≠ work", "Banking hard", "Crypto trading on regulated venues"],
    company: "PT PMA (foreign investment company) with minimum capital and sector rules — not a casual one-day LLC. Many keep OpCo offshore and only live in ID with correct visa.",
    visa: "Tourist, B211A, KITAS work/investor paths — business activity on tourist status is a classic compliance fail. Immigration counsel.",
    banking: "Hard for foreigners without proper status; crypto SOF difficult. Foreign EMI backup common.",
    crypto: "Crypto trading historically via commodity/exchange-style regulators (framework evolves) — public offerings not free-for-all. See Overview.",
    kycAml:
      "Banks apply strict KYC; expect KITAS/passport, tax ID (NPWP) when resident, SOF. CRS applies. Enhanced scrutiny for crypto-linked wealth.",
    taxPersonal:
      "Indonesian tax residents generally taxed on worldwide income (with treaty relief). Days tests matter. Confirm with local tax advisor before assuming lifestyle = low tax.",
    taxCompany:
      "Corporate tax on PT; PMA compliance and BKPM/OSS registration matter. PE risk for foreign cos managed from Indonesia.",
    wealthOnArrival:
      "Worldwide tax residence can pull foreign crypto gains into scope going forward — plan Italy exit year carefully. Banking onboarding is often harder than formal tax theory.",
    cryptoTaxOnResidency:
      "As tax resident, disposals of BTC/stables may be taxable income/capital gains under Indonesian rules (confirm live DGT practice). No free step-up on arrival alone. Stables characterisation needs a memo. Model before moving bags.",
    next: ["Visa that matches real work", "PT PMA vs offshore OpCo memo", "Tax residence model ID vs IT", "Bank feasibility"],
  },
  "hong-kong": {
    flag: "🇭🇰",
    accent: "#f43f5e",
    headline: "Re-opened VA regime · Asia finance hub · very high CoL",
    fit: "Founders needing HK capital-markets adjacency and licensed VA rails — expensive substance, not a meme playground.",
    colBands: [
      ["Lean solo", "USD 2.8–4.5k", "Tiny flat reality"],
      ["Comfortable couple", "USD 5–9k", ""],
      ["Family + school", "USD 9–18k+", "School-driven"],
    ],
    pros: ["Deep finance ecosystem", "English + Chinese markets bridge", "VA licensing path reopened", "Excellent banks if accepted"],
    cons: ["Very high rent", "Licence bar for VA activities", "Immigration not automatic", "Retail meme marketing constrained"],
    company: "Limited company formation is efficient; crypto services often need SFC VA licence depending on activity.",
    visa: "Employment, investment, top-talent schemes — immigration counsel. Short trips ≠ residence.",
    banking: "Excellent once onboarded; crypto founders face multi-month DD. Expect detailed SOF/SOW.",
    crypto: "SFC virtual-asset regime for trading platforms and related activities; public offers/marketing heavily policed.",
    kycAml:
      "World-class bank AML; beneficial ownership; Travel Rule for licensed platforms; sanctions screening. CRS applies. Prepare institutional-grade crypto wealth files.",
    taxPersonal:
      "Hong Kong generally taxes Hong Kong-sourced profits/income; foreign-source income exemption regimes have been refined — confirm current IRD practice for investment gains and employment. Not automatic zero on all crypto forever.",
    taxCompany:
      "Profits tax on HK-sourced profits; substance and central management matter. VA businesses need correct licences before revenue claims.",
    wealthOnArrival:
      "No classic EU-style wealth tax on global net assets solely for becoming resident is common framing — sourcing of gains and employment income still matter. Banks demand origin of wealth.",
    cryptoTaxOnResidency:
      "Personal crypto often turns on whether gains are HK-sourced trading profits vs offshore capital. Frequent trading can be taxable profits. Stables under VA perimeter for platforms. Get IRD-facing advice + Italy exit coordination before large post-move disposals.",
    next: ["SFC perimeter map", "Tax memo sourcing + crypto", "Visa path", "Bank intro with SOF pack"],
  },
  portugal: {
    flag: "🇵🇹",
    accent: "#22c55e",
    headline: "EU / MiCA · NHR largely reformed · lifestyle + DNV paths",
    fit: "EU base for founders who need MiCA perimeter and Atlantic lifestyle — do not plan on old NHR crypto myths.",
    colBands: [
      ["Lean solo", "USD 1.4–2.2k", "Secondary cities lower"],
      ["Comfortable couple", "USD 2.5–4.5k", "Lisbon/Porto higher"],
      ["Family + school", "USD 4–9k", "Intl school-driven"],
    ],
    pros: ["EU membership / SEPA", "Lifestyle & climate", "English-friendly expat stacks", "MiCA CASP packaging possible"],
    cons: ["NHR golden-era assumptions mostly dead", "Personal tax can be material", "Housing pressure in Lisbon", "Still full EU tax-residence discipline"],
    company: "Lda via local counsel; crypto services need MiCA CASP authorisation or reverse solicitation discipline for EU clients.",
    visa: "D7, digital nomad / D8-style, work, Golden Visa reforms — immigration counsel. Days in PT can create tax residence.",
    banking: "Good SEPA access once resident; crypto SOF still enhanced DD.",
    crypto: "MiCA applies for crypto-asset services and public offers to EU — Title II white papers / CASP. Not a meme free pass.",
    kycAml:
      "EU AMLD-style CDD; UBO registers; Travel Rule for CASPs; CRS. Italian founders should present clean Italy exit or dual-residence analysis to banks.",
    taxPersonal:
      "Portuguese tax residents generally taxed on worldwide income. Former NHR regimes were reformed — do not assume historic crypto exemptions. Confirm current IRS code and any residual regimes with Portuguese tax counsel + Italian commercialista.",
    taxCompany:
      "Corporate tax on Portuguese companies; MiCA CASP is a regulated business with capital/governance costs. PE risk if Italian management without substance.",
    wealthOnArrival:
      "No classic Italian-style IVIE/wealth package clone, but worldwide income tax from residence start can hit post-move disposals. Stamp/property taxes on local real estate are separate. Document crypto basis before day-one.",
    cryptoTaxOnResidency:
      "As PT tax resident, BTC/stable disposals may be capital gains or other income under current Portuguese rules (confirm live law — crypto tax has been politically active). EU token offerings still need MiCA packaging regardless of personal tax. Coordinate Italy exit year carefully.",
    next: ["Kill old NHR assumptions with written memo", "Tax residence days calendar IT↔PT", "MiCA CASP vs partner path", "Visa category"],
  },
  spain: {
    flag: "🇪🇸",
    accent: "#f59e0b",
    headline: "EU / MiCA · digital nomad visa · tax residence traps for Italians",
    fit: "EU Spanish-language base and DNV lifestyle — watch Beckham-style regimes and worldwide tax if you become resident.",
    colBands: [
      ["Lean solo", "USD 1.3–2.2k", "Secondary cities"],
      ["Comfortable couple", "USD 2.4–4.5k", "Madrid/BCN higher"],
      ["Family + school", "USD 4–10k", "School-driven"],
    ],
    pros: ["EU / SEPA", "Digital nomad visa path", "Large Spanish-speaking market", "Lifestyle cities"],
    cons: ["Tax residence easy to trigger", "Personal tax can be high", "Housing in big cities", "CNMV culture on retail crypto promos"],
    company: "SL via local counsel; crypto services under MiCA CASP if serving EU. Autónomo for very small ops — often wrong for token businesses.",
    visa: "Digital nomad / telework, work, non-lucrative — immigration counsel. 183-day and centre-of-interests tests create tax residence risk.",
    banking: "SEPA banks once NIE/residence clear; crypto SOF enhanced DD common.",
    crypto: "MiCA + CNMV supervisory culture on promotions. Public meme/ICO marketing to EU retail is hard by design.",
    kycAml:
      "EU AML stack; UBO; Travel Rule for CASPs; CRS. Expect Spanish documentation (NIE, empadronamiento) for serious banking.",
    taxPersonal:
      "Spanish tax residents generally worldwide income tax. Special regimes (e.g. impatriate / “Beckham”-style) are narrow and condition-heavy — model with Spanish tax counsel. Italians must avoid accidental dual residence.",
    taxCompany:
      "Corporate tax on SL; MiCA CASP costs if licensed. PE risk if managed from Italy.",
    wealthOnArrival:
      "Spain has wealth tax (Impuesto sobre el Patrimonio) themes at state/regional level for residents — large BTC/stable portfolios can face annual wealth tax depending on region and exemptions. Critical planning item before becoming resident.",
    cryptoTaxOnResidency:
      "Post-residence disposals of BTC/stables generally capital gains under IRPF (confirm rates/holding periods). Wealth tax may apply to holdings even without sale. Stables as crypto assets in most practical filings. Italy exit year + Spanish start date must be modelled together.",
    next: ["Wealth tax + IRPF model before move", "DNV vs work visa choice", "Days calendar vs Italy", "MiCA product perimeter"],
  },
  estonia: {
    flag: "🇪🇪",
    accent: "#67e8f9",
    headline: "e-Residency ≠ tax residence · EU company rails · MiCA still applies",
    fit: "Remote-friendly EU company formation and digital admin — not a magic tax residence or crypto licence by itself.",
    colBands: [
      ["Lean solo", "USD 1.2–2.0k", "Tallinn"],
      ["Comfortable couple", "USD 2.2–3.8k", ""],
      ["Family", "USD 3.5–7k", ""],
    ],
    pros: ["e-Residency admin UX", "EU company with digital tools", "Tech-forward culture", "MiCA packaging possible with real substance"],
    cons: ["e-Residency does not make you Estonian tax resident", "Banking harder post-cleanup eras", "Crypto licence history reformed under MiCA", "Cold winters / small market"],
    company: "OÜ via e-Residency is famous for speed — still need real directors, accounting, and substance if you claim non-Italian PE outcomes. Crypto services need MiCA CASP path.",
    visa: "EU free movement if you are EU citizen; third-country founders need proper residence. e-Residency is not a visa.",
    banking: "Historically harder for pure e-Residency cos; fintech EMIs common. Clean UBO and activity narrative required.",
    crypto: "Former VASP licence era evolved into MiCA CASP — verify current FIU/FSA perimeter. EU retail offers still Title II / CASP.",
    kycAml:
      "EU AML; UBO transparency; banks/EMIs apply enhanced DD to crypto and non-resident boards. CRS applies. Travel Rule for CASPs.",
    taxPersonal:
      "You become Estonian tax resident only under residence tests (days/ties) — e-Residency alone does not trigger it. If you remain Italian tax resident, Italy worldwide tax continues. Confirm both sides.",
    taxCompany:
      "Estonian corporate tax is often distribution-based (tax on distributed profits) — powerful for retaining earnings but not a free pass for Italian CFC/PE. Substance and management location matter.",
    wealthOnArrival:
      "If you never become Estonian tax resident, Estonian personal wealth/tax rules may barely apply — Italian rules still do. If you do move, map income tax start; no classic wealth tax like Spain is the usual comparison frame — still verify.",
    cryptoTaxOnResidency:
      "Only if you are actually Estonian tax resident do local personal crypto rules bite; otherwise Italian (or other) residence dominates. Company-level crypto treasury still needs accounting. EU token sales need MiCA regardless of e-Residency.",
    next: ["Separate e-Residency vs tax residence clearly", "CFC/PE memo if Italian resident + EE OÜ", "Banking/EMI shortlist", "MiCA CASP if serving EU"],
  },
  cayman: {
    flag: "🇰🇾",
    accent: "#94a3b8",
    headline: "Fund / HoldCo venue · substance & CRS · not a casual place to move",
    fit: "Fund managers and multi-entity stacks needing Cayman (or BVI) HoldCos — not a lifestyle relocation or retail meme HQ.",
    colBands: [
      ["Physical presence", "Very high if living on-island", "Not a low-CoL base"],
      ["Remote HoldCo only", "Admin/legal fees dominate", "No “move” required for paper entity"],
    ],
    pros: ["Familiar fund/HoldCo law", "Investor and counsel ecosystem", "Flexible company limited by shares", "English law adjacency"],
    cons: ["Substance/economic substance regimes", "CRS / transparency", "Banking needs real story", "Not for tourist “tax residence hacks”"],
    company: "Exempted company / LLC via licensed corporate service provider. Annual fees, registered office, and economic substance filings for relevant activities.",
    visa: "Work/residence for on-island life is a separate immigration path — most founders never “move” to Cayman for lifestyle.",
    banking: "Substance and UBO drive access; pure paper cos struggle. Crypto treasury banking is specialist.",
    crypto: "Fund/token structures via counsel; retail meme launches are a poor cultural fit. Marketing into EU/US still local law of target markets.",
    kycAml:
      "CSP and bank CDD are institutional-grade; UBO, source of wealth, sanctions. CRS reporting. Expect fund-style documentation packs.",
    taxPersonal:
      "Cayman has no personal income tax in the classic sense — but your real tax residence (Italy/EU/elsewhere) still taxes you. A Cayman co does not change Italian personal tax if you live in Italy.",
    taxCompany:
      "No corporate income tax in the classic Cayman marketing frame for many exempted cos — economic substance, FATCA/CRS, and investor reporting still apply. PE/management in Italy can re-attribute profits elsewhere.",
    wealthOnArrival:
      "If you physically become resident, immigration and banking dominate; most stacks never create Cayman personal residence. Italy exit rules still apply to you as a person.",
    cryptoTaxOnResidency:
      "Cayman entity holding BTC/stables is an entity-level accounting and investor disclosure problem; your personal disposals are taxed where you are tax resident. EU public offers still need MiCA packaging for EU retail.",
    next: ["Substance memo for activity", "CSP + annual cost quote", "Banking feasibility", "Italy CFC/PE analysis if you remain IT resident"],
  },
};

function lawGetRelocateEntry(id) {
  return LAW_RELOCATE_BROWSER.find((c) => c.id === id || c.lawId === id) || null;
}

/**
 * Enrich a hub brief to Focus-hub parity: services, startups, and full tax/KYC fields.
 */
function lawEnrichHubParity(entry, hub) {
  const h = hub && typeof hub === "object" ? { ...hub } : {};
  const j =
    entry?.lawId && lawData?.jurisdictions
      ? lawData.jurisdictions.find((x) => x.id === entry.lawId)
      : null;
  const jProxy = j || {
    id: entry?.lawId || entry?.id,
    name: entry?.name,
    region: entry?.region,
    tags: entry?.tags,
    summary: entry?.blurb,
    vaspLicensing: "",
    regulators: [],
    trading: {},
    payments: {},
  };
  if (!h.localServices && typeof lawBuildLocalServices === "function") {
    h.localServices = lawBuildLocalServices(jProxy, {});
  }
  if ((!h.cryptoStartups || !h.cryptoStartups.rows?.length) && typeof lawBuildCryptoStartups === "function") {
    h.cryptoStartups = lawBuildCryptoStartups(jProxy, {});
  }
  if (!h.kycAml) {
    h.kycAml =
      "Banks and VASPs apply CDD/EDD, SOF/SOW, sanctions screening, and CRS. Crypto founders should prepare exchange exports and wallet history. Verify local obliged-entity rules.";
  }
  if (!h.taxPersonal) {
    h.taxPersonal = j?.taxHeadline
      ? `${j.taxHeadline} ${j.taxNote || ""} Confirm resident tests with local + Italian counsel.`.trim()
      : "Confirm resident vs non-resident tests and worldwide vs territorial base with local + Italian counsel.";
  }
  if (!h.taxCompany) {
    h.taxCompany =
      "Corporate tax depends on entity type, substance, and activity. PE risk if managed from Italy.";
  }
  if (!h.wealthOnArrival) {
    h.wealthOnArrival =
      "Map whether residency creates wealth tax, remittance tax, or only future income tax. Banking origin-of-wealth checks are separate from formal tax.";
  }
  if (!h.cryptoTaxOnResidency) {
    h.cryptoTaxOnResidency =
      "Confirm whether disposals after day-one residency are taxed, whether there is a step-up, and how stables are characterised. Coordinate Italy exit-year timing. Not advice — written local memo required.";
  }
  if (!h.colBands?.length) {
    h.colBands = [["CoL band", entry?.col || "—", "Indicative — verify local costs"]];
  }
  if (!h.pros?.length) h.pros = [entry?.blurb || "See legal-status card and local counsel."];
  if (!h.cons?.length) h.cons = ["Verify live rules; this brief is educational only."];
  if (!h.company) h.company = `Company ease (browser): ${entry?.company || "—"}`;
  if (!h.visa) h.visa = `Visa vibe (browser): ${entry?.visa || "—"}`;
  if (!h.banking) h.banking = `Banking (browser): ${entry?.banking || "—"}`;
  if (!h.crypto) h.crypto = j?.framework || entry?.crypto || entry?.blurb || "—";
  if (!h.next?.length) {
    h.next = [
      entry?.lawId ? "Open BTC legal-status card" : "Map legal status",
      "Local tax + immigration counsel",
      "Bank SOF/SOW pack",
      "Italy exit memo if relocating",
    ];
  }
  if (!h.headline) h.headline = entry?.blurb || entry?.name || "";
  if (!h.fit) h.fit = entry?.blurb || "";
  if (!h.flag) h.flag = "🌐";
  if (!h.accent) h.accent = "#34d399";
  h._deep = true;
  return h;
}

/** Full hub brief for a browser entry — every destination has Focus-hub parity depth. */
function lawGetRelocateHub(entryOrId) {
  const entry = typeof entryOrId === "string" ? lawGetRelocateEntry(entryOrId) : entryOrId;
  if (!entry) return null;
  const base = LAW_RELOCATE_HUBS[entry.id];
  if (base) return lawEnrichHubParity(entry, base);
  // Try builder from legal dataset
  const j = entry.lawId && lawData?.jurisdictions?.find((x) => x.id === entry.lawId);
  if (j && typeof lawBuildHubForLegal === "function") {
    try {
      const built = lawBuildHubForLegal(j, {}, {
        col: entry.col,
        company: entry.company,
        banking: entry.banking,
        visa: entry.visa,
      });
      LAW_RELOCATE_HUBS[entry.id] = built;
      return lawEnrichHubParity(entry, built);
    } catch (_) {}
  }
  return lawEnrichHubParity(entry, {
    flag: "🌐",
    accent: "#94a3b8",
    headline: entry.blurb,
    fit: entry.blurb,
  });
}

/**
 * Expanded founder-facing commentary: teaches newcomers and sharpens intermediate founders.
 * Built from jurisdiction status + hub fields — educational, not advice.
 */
function lawFounderTeachBlocks(entry, hub, j) {
  const name = entry?.name || j?.name || "this country";
  const status = j?.status || (entry?.mapLegal || (entry?.tags || []).includes("map-legal") ? "legal" : "unclear");
  const tags = j?.tags || entry?.tags || [];
  const isMica = tags.includes("mica") || j?.region === "eu-mica" || entry?.region === "EU";
  const isLegal = status === "legal";
  const isRestricted = status === "restricted";
  const isBanned = status === "banned";
  const h = hub || {};
  const holding = j?.holding?.note || j?.holding?.status || "";
  const trading = j?.trading?.note || j?.trading?.status || "";
  const payments = j?.payments?.note || j?.payments?.status || "";
  const mining = j?.mining?.note || j?.mining?.status || "";
  const framework = j?.framework || h.crypto || "";
  const vasp = j?.vaspLicensing || "";
  const taxHead = j?.taxHeadline || "";
  const taxNote = j?.taxNote || "";
  const regs = (j?.regulators || []).join(", ");
  const services = h.localServices || {};
  const launch = typeof lawLaunchEaseFor === "function" ? lawLaunchEaseFor(entry?.id) : null;

  const n = lawEsc(name);
  // —— Big picture for beginners ——
  let statusStory = "";
  if (isLegal) {
    statusStory = `On our map, ${n} is coloured <strong>green (legal / regulated)</strong>. In plain language: you are usually allowed to <em>own</em> Bitcoin as private property, and trading often happens through supervised platforms rather than a total free-for-all. “Legal” does <strong>not</strong> mean “no paperwork,” “no tax,” or “any token sale is fine.” It means the baseline activity of holding and using licensed rails is not treated like a crime the way it is in ban jurisdictions.`;
  } else if (isRestricted) {
    statusStory = `On our map, ${n} is <strong>amber (restricted / partial)</strong>. Founders should expect walls: banks may refuse crypto-linked clients, exchanges may be limited, advertising may be tight, or only certain activities are allowed. Holding might still be legal while building a public product is hard. Read every section below as “permission is incomplete.”`;
  } else if (isBanned) {
    statusStory = `On our map, ${n} is <strong>red (banned / prohibited)</strong> for core crypto activity in our heuristic. Treat public product launches, local exchanges, and banking as high-risk or off-limits until specialist counsel says otherwise. This page is still useful for understanding <em>why</em> the stack fails — not as a playbook to operate there casually.`;
  } else {
    statusStory = `On our map, ${n} is <strong>grey (unclear / thin framework)</strong>. That often means “not clearly banned,” but also “not clearly safe to build.” Founders should assume extra diligence: thin law can still produce bank freezes, tax surprises, or sudden new rules.`;
  }

  const fourLayers = `Tech founders often mix four decisions that are <em>not</em> the same thing:
    <ol class="law-guide-ol law-teach-ol">
      <li><strong>Where you live (tax residence)</strong> — which country taxes you as a person.</li>
      <li><strong>Where the company sits</strong> — incorporation and management of the OpCo/HoldCo.</li>
      <li><strong>Where money moves</strong> — banks, EMIs, exchange on/off ramps.</li>
      <li><strong>Where life is sustainable</strong> — visas, cost of living, internet, safety, schools.</li>
    </ol>
    You can split these (e.g. live in one place, company in another, bank elsewhere) — but splits need substance, transfer pricing, and dual counsel. A foreign company alone does <strong>not</strong> fix personal tax if you still live in Italy or another high-tax home.`;

  // —— Intermediate sharpeners ——
  const intermediateBits = [];
  if (isMica) {
    intermediateBits.push(
      `${name} sits in the EU MiCA perimeter for crypto-asset services and many public offers. If you serve EU retail users, you generally need a licensed CASP path (or a careful reverse-solicitation / partner model) — incorporating outside the EU does not magic-away MiCA when the clients are EU residents.`,
    );
  }
  if (vasp) {
    intermediateBits.push(`Service-provider licensing note from our dataset: ${vasp}`);
  }
  if (framework) {
    intermediateBits.push(`Regulatory frame (headline): ${framework}`);
  }
  if (regs) {
    intermediateBits.push(`Who to watch on the public register side: ${regs}. Intermediate founders should bookmark the live register before depositing client or treasury funds.`);
  }
  intermediateBits.push(
    `When banks ask for SOF/SOW, they want a coherent story: exchange CSV exports, wallet history, company invoices, and (if you left Italy) an exit-year tax narrative. “I mined in 2017” without documents often fails enhanced due diligence.`,
  );
  if (taxHead || h.taxPersonal) {
    intermediateBits.push(
      `Tax headline for individuals: ${taxHead || "see personal tax section below"}. ${taxNote || ""} Intermediate trap: becoming tax resident can tax future disposals even if you bought BTC years earlier — basis and day-one timing matter more than Twitter memes.`,
    );
  }

  // —— Holding / product / banking stories ——
  const practiceHolding = `For a founder who just holds BTC personally: look at holding status first (${holding || "see status grid above"}). For most green jurisdictions, private holding is allowed, but tax on disposal is separate. Keeping records (cost basis, dates, wallets) is part of the job even if you never open a local company.`;

  const practiceBuild = isMica
    ? `If you build a product (wallet, exchange, brokerage, staking front-end, card, OTC desk): assume you are near a <strong>CASP</strong> or white-paper perimeter when EU users are in scope. “We’re just software” rarely survives if you custody assets, execute orders, or market tokens to retail.`
    : `If you build a product for locals: map whether you need a ${isLegal ? "VASP / exchange / payment licence" : "special licence or whether the activity is even open"}. Many founders keep pure software offshore and use licensed local partners for custody and on/off ramps — that only works if marketing and client contracts match the real perimeter. Trading note from our dataset: ${trading || "see status grid"}.`;

  const practiceBank = `Banking is often harder than the crypto statute. ${h.banking || services.banks || "Expect enhanced questions for crypto founders."} Practical stack for non-experts: (1) personal account after residence, (2) company account after incorporation + UBO pack, (3) licensed exchange for treasury, (4) EMI backup. ATMs are usually expensive side doors, not a treasury plan.`;

  const practiceTokens = launch
    ? `Token launches: our relative scores for ${name} treat meme coins and public ICOs separately across local / region / world / EU audiences. Even where chain deploy is easy, coordinated marketing and influencer armies can recreate “offeror” or financial-promotion liability. EU retail is almost always a MiCA analysis, not a local loophole.`
    : `Token launches: separate the tech (deploy a contract) from the law (public offer, marketing, exchange listing). Intermediate founders should write down target audience geography before any TGE.`;

  const paymentsStory = payments
    ? `Merchant payments: ${payments} National currency is usually still legal tender; BTC pay is almost always voluntary.`
    : `Merchant acceptance of BTC is usually voluntary and niche; do not plan a GTM that requires every café to take Lightning.`;

  const miningStory = mining
    ? `Mining: ${mining}`
    : "";

  // —— Paths by experience ——
  const pathNew = [
    `Read the status grid (holding / trading / payments / mining) and the summary at the top — that is the “is this even a place to touch crypto?” filter.`,
    `If you only hold BTC: focus on personal tax residence and bank SOF packs, not company law.`,
    `If you want to incorporate: read Company formation + Visas first; book a scout trip before wiring capital.`,
    `Ignore “0% tax forever” social posts; use the tax sections as questions for a local advisor + Italian commercialista.`,
    `Pin ${name} to Focus hubs only if it is a serious shortlist candidate — the pin is a personal bookmark, not a recommendation.`,
  ].map((p) => lawEsc(p));
  const pathMid = [
    `Draw the four-layer diagram for your real stack (you / OpCo / bank / life) and mark which layer sits in ${name}.`,
    `Pull the live VASP/CASP/exchange register for ${name} before any treasury or client funds move.`,
    `Model Italy exit year vs day-one residency for crypto disposals; document cost basis before the move.`,
    `If EU clients exist, run a separate MiCA workstream — do not assume a non-EU seat deletes EU perimeter.`,
    `For token marketing: write audience geography (local / region / world / EU) and kill channels that hit harder perimeters.`,
  ].map((p) => lawEsc(p));

  const fitLine = h.fit || entry?.blurb || "";
  const headline = h.headline || entry?.blurb || "";

  return `
    <div class="law-teach">
      <div class="law-teach__hero law-hub-block">
        <h3>For tech founders — how to read ${n}</h3>
        <p class="law-teach__lead">${statusStory}</p>
        ${headline ? `<p><strong>One-line hub read:</strong> ${lawEsc(headline)}</p>` : ""}
        ${fitLine ? `<p><strong>Who this is usually for:</strong> ${lawEsc(fitLine)}</p>` : ""}
        <div class="law-teach__layers">${fourLayers}</div>
      </div>

      <div class="law-teach__grid">
        <article class="law-hub-block law-teach-card law-teach-card--new">
          <h4>If you are learning this topic</h4>
          <p>You do not need to become a lawyer. You need a clear mental model: <em>legal to hold</em>, <em>licensed to serve customers</em>, <em>taxed as a resident</em>, and <em>banked as a customer</em> are four different questions. Start with the status grid on this page, then the “practice” sections below, then the detailed tax/KYC blocks.</p>
          <p>${lawEsc(practiceHolding)}</p>
          <p>${lawEsc(paymentsStory)}</p>
          <h5>Your first five moves</h5>
          <ol class="law-guide-ol">${pathNew.map((p) => `<li>${p}</li>`).join("")}</ol>
        </article>
        <article class="law-hub-block law-teach-card law-teach-card--mid">
          <h4>If you already know the basics</h4>
          <p>You already know green ≠ free pass. Use this page to pressure-test perimeter, substance, and sequencing — not to collect flags.</p>
          <ul class="law-guide-ul">${intermediateBits.map((p) => `<li>${lawEsc(p)}</li>`).join("")}</ul>
          <h5>Intermediate checklist</h5>
          <ol class="law-guide-ol">${pathMid.map((p) => `<li>${p}</li>`).join("")}</ol>
        </article>
      </div>

      <div class="law-hub-block law-teach-card">
        <h4>Building, banking, and tokens in practice</h4>
        <p>${lawEsc(practiceBuild)}</p>
        <p>${lawEsc(practiceBank)}</p>
        <p>${lawEsc(practiceTokens)}</p>
        ${miningStory ? `<p>${lawEsc(miningStory)}</p>` : ""}
        ${services.summary ? `<p><strong>Local rails snapshot:</strong> ${lawEsc(services.summary)}</p>` : ""}
      </div>
    </div>`;
}

function lawTeachSection(title, why, bodyHtml) {
  return `<div class="law-hub-block">
    <h3>${title}</h3>
    <p class="law-teach-why"><strong>Why founders care:</strong> ${why}</p>
    ${bodyHtml}
  </div>`;
}

/** Shared founder deep-dive body (Focus hub parity + teaching commentary). */
function lawFounderDeepDiveHtml(entry, hub) {
  const h = lawEnrichHubParity(entry, hub || {});
  const j =
    entry?.lawId && lawData?.jurisdictions
      ? lawData.jurisdictions.find((x) => x.id === entry.lawId)
      : null;
  const services =
    h.localServices ||
    (typeof lawBuildLocalServices === "function"
      ? lawBuildLocalServices(
          j || {
            id: entry.lawId || entry.id,
            name: entry.name,
            tags: entry.tags,
          },
          {},
        )
      : null);
  const startups =
    h.cryptoStartups ||
    (typeof lawBuildCryptoStartups === "function"
      ? lawBuildCryptoStartups(
          j || {
            id: entry.lawId || entry.id,
            name: entry.name,
            region: entry.region,
            tags: entry.tags,
          },
          {},
        )
      : null);

  const teach = lawFounderTeachBlocks(entry, h, j);

  return `
    ${teach}
    <div class="law-hub-grid">
      <div class="law-hub-block">
        <h3>Cost of living</h3>
        <p class="law-teach-why"><strong>Why founders care:</strong> Runway math. A “cheap” jurisdiction that forces expensive schools or failed banking is not cheap.</p>
        <div class="law-guide-table-wrap"><table class="law-guide-table">
          <thead><tr><th>Lifestyle</th><th>Band</th><th>Note</th></tr></thead>
          <tbody>
            ${(h.colBands || [])
              .map(
                (r) =>
                  `<tr><td>${lawEsc(r[0])}</td><td class="mono">${lawEsc(r[1])}</td><td>${lawEsc(r[2] || "")}</td></tr>`,
              )
              .join("")}
          </tbody>
        </table></div>
        <dl class="law-hub-meta">
          <div><dt>Company</dt><dd>${lawEsc(entry.company || "—")}</dd></div>
          <div><dt>Banking</dt><dd>${lawEsc(entry.banking || "—")}</dd></div>
          <div><dt>Visa</dt><dd>${lawEsc(entry.visa || "—")}</dd></div>
          <div><dt>Crypto</dt><dd>${lawEsc(entry.crypto || "—")}</dd></div>
        </dl>
      </div>
      <div class="law-hub-block">
        <h3>Pros &amp; cons (founder lens)</h3>
        <p class="law-teach-why"><strong>Why founders care:</strong> Pros are marketing; cons are usually where deals die (banks, visas, tax surprises).</p>
        <h4 class="law-teach-sub">Pros</h4>
        <ul class="law-guide-ul">${(h.pros || []).map((p) => `<li>${lawEsc(p)}</li>`).join("") || "<li>—</li>"}</ul>
        <h4 class="law-teach-sub">Cons / watch-outs</h4>
        <ul class="law-guide-ul">${(h.cons || []).map((p) => `<li>${lawEsc(p)}</li>`).join("") || "<li>—</li>"}</ul>
      </div>
    </div>
    <div class="law-hub-blocks-stack">
      ${lawTeachSection(
        "KYC / AML",
        "Without a clean identity and wealth story, you cannot open bank or exchange accounts — the product never ships.",
        `<p>${lawEsc(h.kycAml || "")}</p>
         <p class="law-teach-note">Beginner tip: collect passport, proof of address, exchange history, and company ownership chart before you fly. Intermediate tip: align SOF narrative with Italian tax returns and wallet clusters.</p>`,
      )}
      ${lawTeachSection(
        "Personal tax (indicative)",
        "Your personal tax residence can tax crypto gains even if the company is elsewhere.",
        `<p>${lawEsc(h.taxPersonal || "")}</p>
         <p class="law-teach-note">Beginner tip: “I incorporated abroad” ≠ “I left my home tax system.” Intermediate tip: map dual-residence risk (days, home, family, economic ties) before the move year.</p>`,
      )}
      ${lawTeachSection(
        "Company tax (indicative)",
        "Entity tax and permanent establishment rules decide whether profits stick in the company seat you chose.",
        `<p>${lawEsc(h.taxCompany || "")}</p>
         <p class="law-teach-note">Beginner tip: pick a real company form with local counsel; avoid anonymous “offshore in a weekend” kits. Intermediate tip: document management location — PE risk if decisions stay in Italy.</p>`,
      )}
      ${lawTeachSection(
        "Personal wealth when becoming resident",
        "Some countries tax net wealth yearly; others only tax income. Day-one residency can change how large BTC bags are treated going forward.",
        `<p>${lawEsc(h.wealthOnArrival || "")}</p>
         <p class="law-teach-note">Beginner tip: banks will still ask where wealth came from even if there is no formal wealth tax. Intermediate tip: model wealth tax / remittance / step-up myths with written local advice before moving bags.</p>`,
      )}
      ${lawTeachSection(
        "BTC & stablecoins on residency",
        "The year you change tax residence is when disposal timing can create or destroy a large tax bill.",
        `<p>${lawEsc(h.cryptoTaxOnResidency || "")}</p>
         <p class="law-teach-note">Beginner tip: export cost basis before you move. Intermediate tip: coordinate Italy exit-year disposals with the new country’s start date; stables can be taxed like crypto or FX depending on local rules.</p>`,
      )}
      ${lawTeachSection(
        "Company formation",
        "Speed and foreign-ownership rules decide whether you can ship as a local entity or must keep OpCo elsewhere.",
        `<p>${lawEsc(h.company || "")}</p>`,
      )}
      ${lawTeachSection(
        "Visas & residence",
        "Tourist stamps are not work rights and not tax residence — mixing them is a classic founder failure mode.",
        `<p>${lawEsc(h.visa || "")}</p>
         <p class="law-teach-note">Beginner tip: match visa type to what you will actually do (build, hire, invoice). Intermediate tip: track days calendars for both immigration and tax simultaneously.</p>`,
      )}
      ${lawTeachSection(
        "Banking & payments",
        "If you cannot receive salary, client funds, or pay contractors, the jurisdiction is theoretical only.",
        `<p>${lawEsc(h.banking || "")}</p>`,
      )}
      ${lawTeachSection(
        "Crypto / product notes",
        "This is the bridge between “BTC is legal to hold” and “my app can legally serve customers.”",
        `<p>${lawEsc(h.crypto || "")}</p>`,
      )}
      <div class="law-hub-block law-hub-block--services">
        <h3>${lawTip("Local crypto services", "Authorized exchanges/CASPs, banks, ATMs, merchants, fiat rails.")}</h3>
        <p class="law-teach-why"><strong>Why founders care:</strong> This is your on/off-ramp map. Prefer official registers over app-store screenshots.</p>
        <p class="law-muted" style="margin:0 0 0.65rem">Local or locally authorized infrastructure. Verify live registers.</p>
        ${lawLocalServicesHtml(services)}
      </div>
      <div class="law-hub-block law-hub-block--startups">
        <h3>${lawTip("Local crypto startups", "Illustrative industry table — not complete or endorsed.")}</h3>
        <p class="law-teach-why"><strong>Why founders care:</strong> Ecosystem density signals talent, counsel familiarity, and competitive pressure — not a buy list.</p>
        <p class="law-muted" style="margin:0 0 0.65rem">Sample of the domestic crypto industry landscape.</p>
        ${lawCryptoStartupsTableHtml(startups)}
      </div>
      <div class="law-hub-block law-hub-block--accent">
        <h3>${lawTip("Meme coin & ICO ease", "Relative scores for local · region · world · EU. Educational only.")}</h3>
        <p class="law-teach-why"><strong>Why founders care:</strong> Deploying a token is easy; marketing it into regulated retail markets is the hard part.</p>
        <p class="law-muted" style="margin:0 0 0.65rem">Hover badges and headers for explanations. Intermediate founders: write target geography before any TGE.</p>
        ${lawLaunchEaseTableHtml(entry.id, false)}
      </div>
      <div class="law-hub-block">
        <h3>Founder next steps</h3>
        <p class="law-teach-why"><strong>Why founders care:</strong> Sequencing beats perfection. Do the evidence pack and counsel memos before the flight.</p>
        <ol class="law-guide-ol">${(h.next || []).map((p) => `<li>${lawEsc(p)}</li>`).join("")}</ol>
      </div>
    </div>`;
}

function lawRelocateBrowserHtml() {
  const regions = [...new Set(LAW_RELOCATE_BROWSER.map((c) => c.region))];
  return `
    ${lawRelocateTreesHtml()}
    <section class="law-relocate-browser" aria-label="Relocate country browser">
      <div class="law-relocate-browser__head">
        <h3 class="law-subhead">Country browser</h3>
        <p class="law-muted"><strong>Deep-dive hubs cover all map-green jurisdictions</strong> (status <em>Legal / regulated</em> on The Law map) plus priority/offshore extras. Auto-synced from the legal-status dataset when the map loads. Priority shortlist remains a curated filter. Hover <strong>?</strong> for explanations.</p>
        <div class="law-browser-legend">
          <span>${lawTip("Map green", "Countries coloured green on The Law overview map: status Legal / regulated. Holding/trading is generally legal under a formal or recognised framework — not a tax or banking free pass.")}</span>
          <span>${lawTip("CoL", LAW_META_TIPS.col)}</span>
          <span>${lawTip("Company", LAW_META_TIPS.company)}</span>
          <span>${lawTip("Banking", LAW_META_TIPS.banking)}</span>
          <span>${lawTip("Crypto", LAW_META_TIPS.crypto)}</span>
          <span>${lawTip("Visa", LAW_META_TIPS.visa)}</span>
          <span>${lawTip("Ease scale", "Easy = lower formal friction · Medium = counsel expected · Hard / Very hard = heavy regulation · Restricted = not a viable launch venue. Educational relative scores only.")}</span>
        </div>
      </div>
      <div class="law-relocate-toolbar">
        <input type="search" id="law-relocate-search" class="law-search" placeholder="Search country…" aria-label="Search relocate countries" autocomplete="off" />
        <select id="law-relocate-region" class="law-select" aria-label="Filter by region">
          <option value="">All regions</option>
          ${regions.map((r) => `<option value="${lawEsc(r)}">${lawEsc(r)}</option>`).join("")}
        </select>
        <select id="law-relocate-col" class="law-select" aria-label="Filter by cost of living">
          <option value="">All CoL</option>
          <option value="low">Low CoL</option>
          <option value="mid">Mid CoL</option>
          <option value="high">High / very high</option>
        </select>
        <label class="law-relocate-check" title="Only destinations that are Legal / regulated (green) on the overview map"><input type="checkbox" id="law-relocate-map-legal" checked /> Map green only</label>
        <label class="law-relocate-check" title="Only destinations you pinned to Focus hubs"><input type="checkbox" id="law-relocate-priority" /> Focus hubs only</label>
      </div>
      <div class="law-relocate-grid" id="law-relocate-grid"></div>
      <p class="law-muted law-relocate-count" id="law-relocate-count"></p>
    </section>`;
}

function lawRelocateColMatch(col, filter) {
  if (!filter) return true;
  const c = String(col || "").toLowerCase();
  if (filter === "low") return c.includes("low");
  if (filter === "mid") return c === "mid" || c.includes("mid");
  if (filter === "high") return c.includes("high") || c.includes("very");
  return true;
}

function lawRenderRelocateGrid() {
  const grid = lawEl("law-relocate-grid");
  const countEl = lawEl("law-relocate-count");
  if (!grid) return;
  const q = (lawEl("law-relocate-search")?.value || "").trim().toLowerCase();
  const region = lawEl("law-relocate-region")?.value || "";
  const col = lawEl("law-relocate-col")?.value || "";
  lawApplyFocusHubFlags();
  const priorityOnly = Boolean(lawEl("law-relocate-priority")?.checked);
  const mapLegalOnly = Boolean(lawEl("law-relocate-map-legal")?.checked);

  const list = LAW_RELOCATE_BROWSER.filter((c) => {
    if (priorityOnly && !lawIsFocusHub(c.id)) return false;
    if (mapLegalOnly && !(c.mapLegal || (c.tags || []).includes("map-legal"))) return false;
    if (region && c.region !== region) return false;
    if (!lawRelocateColMatch(c.col, col)) return false;
    if (q) {
      const hay = `${c.name} ${c.region} ${(c.tags || []).join(" ")} ${c.blurb}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const hasLaw = (id) => (lawData?.jurisdictions || []).some((j) => j.id === id);

  grid.innerHTML = list
    .map((c) => {
      const lawOk = c.lawId && hasLaw(c.lawId);
      const isMapLegal = c.mapLegal || (c.tags || []).includes("map-legal");
      const isFocus = lawIsFocusHub(c.id);
      return `<article class="law-relocate-card${isFocus ? " law-relocate-card--priority" : ""}${isMapLegal ? " law-relocate-card--map-legal" : ""}" data-relocate-id="${lawEsc(c.id)}" title="${lawEsc("Click card or Open hub for full founder brief")}">
        <header class="law-relocate-card__head">
          <h4 class="law-relocate-card__name">${lawEsc(c.name)}${isFocus ? ` <span class="law-relocate-priority-badge law-has-tip" ${lawTipAttrs("Pinned on your Focus hubs shortlist (editable).")}>Focus</span>` : ""}${isMapLegal ? ` <span class="law-relocate-map-legal-badge law-has-tip" ${lawTipAttrs("Legal / regulated (green) on The Law overview map.")}>Map green</span>` : ""}</h4>
          <span class="law-relocate-card__region law-has-tip" ${lawTipAttrs(`Region grouping for filters: ${c.region}.`)}>${lawEsc(c.region)}</span>
        </header>
        <p class="law-relocate-card__blurb">${lawEsc(c.blurb)}</p>
        <dl class="law-relocate-card__meta">
          <div><dt>${lawTip("CoL", LAW_META_TIPS.col)}</dt><dd class="law-has-tip" ${lawTipAttrs(`${c.name} CoL band: ${c.col}. ${LAW_META_TIPS.col}`)}>${lawEsc(c.col)}</dd></div>
          <div><dt>${lawTip("Company", LAW_META_TIPS.company)}</dt><dd class="law-has-tip" ${lawTipAttrs(`${c.name} company: ${c.company}. ${LAW_META_TIPS.company}`)}>${lawEsc(c.company)}</dd></div>
          <div><dt>${lawTip("Banking", LAW_META_TIPS.banking)}</dt><dd class="law-has-tip" ${lawTipAttrs(`${c.name} banking: ${c.banking}. ${LAW_META_TIPS.banking}`)}>${lawEsc(c.banking)}</dd></div>
          <div><dt>${lawTip("Crypto", LAW_META_TIPS.crypto)}</dt><dd class="law-has-tip" ${lawTipAttrs(`${c.name} crypto: ${c.crypto}. ${LAW_META_TIPS.crypto}`)}>${lawEsc(c.crypto)}</dd></div>
          <div><dt>${lawTip("Visa", LAW_META_TIPS.visa)}</dt><dd class="law-has-tip" ${lawTipAttrs(`${c.name} visa: ${c.visa}. ${LAW_META_TIPS.visa}`)}>${lawEsc(c.visa)}</dd></div>
        </dl>
        ${c.servicesSummary || (LAW_RELOCATE_HUBS[c.id] && LAW_RELOCATE_HUBS[c.id].localServices)
          ? lawLocalServicesHtml(
              (LAW_RELOCATE_HUBS[c.id] && LAW_RELOCATE_HUBS[c.id].localServices) || { summary: c.servicesSummary },
              { compact: true },
            )
          : ""}
        ${
          LAW_RELOCATE_HUBS[c.id]?.cryptoStartups
            ? lawCryptoStartupsTableHtml(LAW_RELOCATE_HUBS[c.id].cryptoStartups, { compact: true })
            : c.startupsCount
              ? `<p class="law-relocate-card__startups"><span class="law-relocate-card__startups-label">Crypto startups</span> ${lawEsc(String(c.startupsCount))} on hub page</p>`
              : ""
        }
        <div class="law-relocate-card__launch">
          <span class="law-relocate-card__launch-label">${lawTip("Meme / ICO (local → EU)", "Relative ease of launching or marketing a meme coin or public ICO to locals, the region, the world, and EU retail. Hover column headers and badges. Educational only.")}</span>
          ${lawLaunchEaseTableHtml(c.id, true)}
        </div>
        <div class="law-relocate-card__tags">${(c.tags || [])
          .map((t) => `<span class="law-relocate-tag law-has-tip" ${lawTipAttrs(`Tag: ${t}. Used for search and filters only.`)}>${lawEsc(t)}</span>`)
          .join("")}</div>
        <div class="law-relocate-card__actions">
          <button type="button" class="law-btn" data-relocate-hub="${lawEsc(c.id)}" title="Full hub: tax, KYC/AML, visas, CoL, meme/ICO notes">Open hub page</button>
          <button type="button" class="law-btn law-btn--ghost" data-relocate-focus="${lawEsc(c.id)}" title="Pin or unpin Focus hubs">${isFocus ? "★ Focus" : "☆ Focus"}</button>
          ${
            lawOk
              ? `<button type="button" class="law-btn law-btn--ghost" data-relocate-law="${lawEsc(c.lawId)}" title="BTC legal status from The Law dataset">BTC legal status</button>`
              : ""
          }
          <button type="button" class="law-btn law-btn--ghost" data-relocate-guide="${lawEsc(c.name)}" title="Scroll the Global guide to this country section if present">Guide §</button>
        </div>
      </article>`;
    })
    .join("");

  if (countEl) {
    const legalN = LAW_RELOCATE_BROWSER.filter((c) => c.mapLegal || (c.tags || []).includes("map-legal")).length;
    countEl.textContent = `${list.length} shown · ${legalN} map-green · ${lawGetFocusHubIds().length} focus · educational only`;
  }

  grid.querySelectorAll("[data-relocate-hub]").forEach((btn) => {
    btn.addEventListener("click", () => void lawShowRelocateHub(btn.getAttribute("data-relocate-hub")));
  });
  grid.querySelectorAll("[data-relocate-focus]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-relocate-focus");
      lawToggleFocusHub(id);
      lawRenderRelocateGrid();
    });
  });
  grid.querySelectorAll("[data-relocate-law]").forEach((btn) => {
    btn.addEventListener("click", () => lawOpenCountry(btn.getAttribute("data-relocate-law")));
  });
  grid.querySelectorAll("[data-relocate-guide]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-relocate-guide") || "";
      const root = lawEl("law-guide-root");
      if (!root) return;
      const headings = [...root.querySelectorAll("h2, h3, h4")];
      const hit = headings.find((h) => h.textContent.toLowerCase().includes(name.toLowerCase()));
      if (hit) {
        hit.scrollIntoView({ behavior: "smooth", block: "start" });
        hit.classList.add("law-guide-flash");
        setTimeout(() => hit.classList.remove("law-guide-flash"), 1600);
      } else {
        root.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
  // whole card click (except action buttons) → hub
  grid.querySelectorAll(".law-relocate-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const id = card.getAttribute("data-relocate-id");
      if (id) void lawShowRelocateHub(id);
    });
  });
}

function lawApplyTreeFilter(action) {
  const search = lawEl("law-relocate-search");
  const region = lawEl("law-relocate-region");
  const col = lawEl("law-relocate-col");
  const pri = lawEl("law-relocate-priority");
  if (search) search.value = "";
  if (region) region.value = "";
  if (col) col.value = "";
  if (pri) pri.checked = false;

  if (action === "filter-latam") {
    if (region) region.value = "LatAm";
  } else if (action === "filter-hubs") {
    if (search) search.value = "";
    if (pri) pri.checked = true;
    // show priority + classic hubs
    if (search) search.value = "UAE Singapore Japan Switzerland";
    if (pri) pri.checked = false;
  } else if (action === "filter-low-col" || action === "filter-lowcol-latam") {
    if (col) col.value = "low";
  } else if (action === "filter-priority") {
    if (pri) pri.checked = true;
  } else if (action === "filter-lean") {
    if (search) search.value = "Georgia Kazakhstan Paraguay";
  } else if (action === "filter-mining") {
    if (search) search.value = "Paraguay Georgia Kazakhstan";
  } else if (action === "focus-hubs") {
    void lawShowFocusHubs();
    return;
  }
  lawRenderRelocateGrid();
  lawEl("law-relocate-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function lawLayerSelectedOptions() {
  const out = {};
  LAW_LAYER_FINDER.forEach((layer) => {
    const active = document.querySelector(`.law-layer-opt.is-active[data-layer="${layer.id}"]`);
    const optId = active?.getAttribute("data-opt");
    const opt = layer.options.find((o) => o.id === optId) || layer.options[0];
    out[layer.id] = opt;
  });
  return out;
}

function lawLayerUpdateStack() {
  const summaryEl = document.querySelector("[data-layer-stack-summary]");
  const pillsEl = document.querySelector("[data-layer-stack-pills]");
  if (!summaryEl || !pillsEl) return;
  const sel = lawLayerSelectedOptions();
  const parts = LAW_LAYER_FINDER.map((l) => {
    const o = sel[l.id];
    return `<strong>${lawEsc(l.title.split("·")[0].trim() || l.title)}:</strong> ${lawEsc(o?.label || "—")}`;
  });
  summaryEl.innerHTML = parts.join(" · ");
  const counts = {};
  Object.values(sel).forEach((o) => {
    (o?.ids || []).forEach((id) => {
      counts[id] = (counts[id] || 0) + 1;
    });
  });
  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, n]) => {
      const c = LAW_RELOCATE_BROWSER.find((x) => x.id === id);
      if (!c) return "";
      const hub = LAW_RELOCATE_HUBS[id] || {};
      const tip = `${c.name} matches ${n} of your 4 selected goals. ${c.blurb} Click for hub page.`;
      return `<button type="button" class="law-layer-pill law-layer-pill--ranked law-has-tip" data-layer-hub="${lawEsc(id)}" data-hits="${n}" data-tip="${lawEsc(tip)}" aria-label="${lawEsc(tip)}">
        <span class="law-layer-pill__flag" aria-hidden="true">${hub.flag || "🌐"}</span>
        <span class="law-layer-pill__name">${lawEsc(c.name)}</span>
        <span class="law-layer-pill__meta">${n}/4 layers · ${lawEsc(c.region)}</span>
      </button>`;
    })
    .filter(Boolean)
    .join("");
  pillsEl.innerHTML =
    ranked ||
    `<span class="law-muted">No overlapping countries — mix layers freely (multi-country stacks are normal).</span>`;
  pillsEl.querySelectorAll("[data-layer-hub]").forEach((btn) => {
    btn.addEventListener("click", () => void lawShowRelocateHub(btn.getAttribute("data-layer-hub")));
  });
}

function lawBindRelocateTrees() {
  const root = document.querySelector(".law-layer-finder") || document.querySelector(".law-relocate-trees");
  if (!root) return;

  root.querySelectorAll(".law-layer-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const layerId = btn.getAttribute("data-layer");
      const optId = btn.getAttribute("data-opt");
      const layer = LAW_LAYER_FINDER.find((l) => l.id === layerId);
      const opt = layer?.options.find((o) => o.id === optId);
      if (!layer || !opt) return;
      root.querySelectorAll(`.law-layer-opt[data-layer="${layerId}"]`).forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      const card = root.querySelector(`[data-layer-card="${layerId}"]`);
      const why = card?.querySelector("[data-layer-why]");
      const pills = card?.querySelector("[data-layer-pills]");
      if (why) why.textContent = opt.why;
      if (pills) {
        pills.innerHTML = lawLayerCountryPills(opt.ids);
        pills.querySelectorAll("[data-layer-hub]").forEach((p) => {
          p.addEventListener("click", () => void lawShowRelocateHub(p.getAttribute("data-layer-hub")));
        });
      }
      lawLayerUpdateStack();
    });
  });

  root.querySelectorAll("[data-layer-hub]").forEach((btn) => {
    btn.addEventListener("click", () => void lawShowRelocateHub(btn.getAttribute("data-layer-hub")));
  });
  root.querySelector("[data-layer-mica]")?.addEventListener("click", () => void lawShowPanel("eu-mica"));
  root.querySelector("[data-layer-focus]")?.addEventListener("click", () => void lawShowFocusHubs());
  lawLayerUpdateStack();
}

function lawBindRelocateBrowser() {
  if (typeof lawSyncLegalRelocateDestinations === "function") {
    try {
      lawSyncLegalRelocateDestinations();
    } catch (e) {
      console.warn("lawSyncLegalRelocateDestinations", e);
    }
  }
  const rerender = () => lawRenderRelocateGrid();
  lawEl("law-relocate-search")?.addEventListener("input", rerender);
  lawEl("law-relocate-region")?.addEventListener("change", rerender);
  lawEl("law-relocate-col")?.addEventListener("change", rerender);
  lawEl("law-relocate-priority")?.addEventListener("change", rerender);
  lawEl("law-relocate-map-legal")?.addEventListener("change", rerender);
  // Rebuild toolbar region options after sync (new regions may appear)
  const regionSel = lawEl("law-relocate-region");
  if (regionSel) {
    const cur = regionSel.value;
    const regions = [...new Set(LAW_RELOCATE_BROWSER.map((c) => c.region))].sort();
    regionSel.innerHTML =
      `<option value="">All regions</option>` +
      regions.map((r) => `<option value="${lawEsc(r)}">${lawEsc(r)}</option>`).join("");
    if (cur && regions.includes(cur)) regionSel.value = cur;
  }
  lawRenderRelocateGrid();
  lawBindRelocateTrees();
}

async function lawShowRelocateHub(hubId) {
  const entry = lawGetRelocateEntry(hubId);
  if (!entry) {
    void lawShowPanel("global-founders");
    return;
  }
  if (!lawData) {
    try {
      await lawLoad("global-founders");
    } catch (_) {}
  }
  const hub = lawGetRelocateHub(entry);

  const util = lawEl("law-panel-utility");
  if (!util) return;
  lawView = `hub-${entry.id}`;
  lawCountryId = null;
  lawSetPanel("utility");
  util.hidden = false;
  lawBreadcrumb([
    { label: "The Law", action: "overview" },
    { label: "Global / Relocate", action: "global-founders" },
    { label: entry.name },
  ]);
  lawSetPath(`/law/hub-${entry.id}`);
  try {
    if (window.MenuController?.l1 === "law") {
      localStorage.setItem("btc-menu-l2", "global-founders");
      window.MenuController.l2 = "global-founders";
      document.querySelectorAll("#menu-l2-slot .dash-tab--l2").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.menuId === "global-founders");
      });
    }
  } catch (_) {}

  const hasLaw = entry.lawId && (lawData?.jurisdictions || []).some((j) => j.id === entry.lawId);
  const isFocus = lawIsFocusHub(entry.id);
  // Peers: same region first, then focus hubs, then fill from browser
  const peers = (() => {
    const rest = LAW_RELOCATE_BROWSER.filter((c) => c.id !== entry.id);
    const same = rest.filter((c) => c.region === entry.region);
    const pri = rest.filter((c) => lawIsFocusHub(c.id) && c.region !== entry.region);
    const other = rest.filter((c) => !lawIsFocusHub(c.id) && c.region !== entry.region);
    const seen = new Set();
    const out = [];
    for (const c of [...same, ...pri, ...other]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
      if (out.length >= 8) break;
    }
    return out;
  })();

  util.innerHTML = `
    <section class="panel law-hub-page" style="--hub-accent:${lawEsc(hub.accent || "#34d399")}">
      <div class="law-hub-hero">
        <div class="law-hub-hero__flag" aria-hidden="true">${hub.flag || "🌐"}</div>
        <div class="law-hub-hero__copy">
          <p class="law-hub-kicker">${lawEsc(entry.region)}${isFocus ? " · Focus hub" : ""}${entry.mapLegal || (entry.tags || []).includes("map-legal") ? " · Map green (legal / regulated)" : " · Full deep dive"}</p>
          <h2 class="law-hub-title">${lawEsc(entry.name)}</h2>
          <p class="law-hub-headline">${lawEsc(hub.headline || entry.blurb)}</p>
          <p class="law-hub-fit"><strong>Best fit:</strong> ${lawEsc(hub.fit || entry.blurb)}</p>
        </div>
      </div>
      <div class="law-hub-actions">
        <button type="button" class="law-btn" data-hub-back>← Country browser</button>
        <button type="button" class="law-btn${isFocus ? "" : " law-btn--ghost"}" data-hub-focus-toggle title="Pin or unpin this destination on your Focus hubs gallery (saved on this device)">
          ${isFocus ? "★ In Focus hubs" : "☆ Add to Focus hubs"}
        </button>
        ${hasLaw ? `<button type="button" class="law-btn law-btn--ghost" data-hub-law="${lawEsc(entry.lawId)}">BTC legal status</button>` : ""}
        <button type="button" class="law-btn law-btn--ghost" data-hub-guide>Scroll guide §</button>
        <button type="button" class="law-btn law-btn--ghost" data-hub-trees>Layer finder</button>
      </div>
      ${lawFounderDeepDiveHtml(entry, hub)}
      <div class="law-hub-block">
        <h3>Related destinations</h3>
        <p class="law-muted" style="margin:0 0 0.55rem">Same region first, then focus hubs — each has a full deep-dive.</p>
        <div class="law-hub-peers">
          ${peers
            .map(
              (p) =>
                `<button type="button" class="law-hub-peer" data-hub-peer="${lawEsc(p.id)}">
                  <span class="law-hub-peer__name">${lawEsc(p.name)}</span>
                  <span class="law-hub-peer__meta">${lawEsc(p.region)} · CoL ${lawEsc(p.col)}${lawIsFocusHub(p.id) ? " · Focus" : ""}</span>
                </button>`,
            )
            .join("")}
        </div>
      </div>
      <p class="law-muted" style="margin-top:0.75rem">Educational only — not immigration, tax, or legal advice. Verify local counsel and live rules.</p>
    </section>`;

  lawAttachGlossary(util);
  util.querySelector("[data-hub-back]")?.addEventListener("click", () => void lawShowPanel("global-founders"));
  util.querySelector("[data-hub-focus-toggle]")?.addEventListener("click", (e) => {
    const on = lawToggleFocusHub(entry.id);
    e.currentTarget.textContent = on ? "★ In Focus hubs" : "☆ Add to Focus hubs";
    e.currentTarget.classList.toggle("law-btn--ghost", !on);
    const kick = util.querySelector(".law-hub-kicker");
    if (kick) {
      kick.textContent = `${entry.region}${on ? " · Focus hub" : ""}${entry.mapLegal || (entry.tags || []).includes("map-legal") ? " · Map green (legal / regulated)" : " · Full deep dive"}`;
    }
  });
  util.querySelector("[data-hub-law]")?.addEventListener("click", (e) => {
    lawOpenCountry(e.currentTarget.getAttribute("data-hub-law"));
  });
  util.querySelector("[data-hub-guide]")?.addEventListener("click", async () => {
    await lawShowPanel("global-founders");
    setTimeout(() => {
      const root = lawEl("law-guide-root");
      const headings = [...(root?.querySelectorAll("h2, h3, h4") || [])];
      const hit = headings.find((h) => h.textContent.toLowerCase().includes(entry.name.toLowerCase()));
      (hit || root)?.scrollIntoView({ behavior: "smooth", block: "start" });
      hit?.classList.add("law-guide-flash");
    }, 200);
  });
  util.querySelector("[data-hub-trees]")?.addEventListener("click", async () => {
    await lawShowPanel("global-founders");
    setTimeout(() => {
      document.querySelector(".law-relocate-trees")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  });
  util.querySelectorAll("[data-hub-peer]").forEach((btn) => {
    btn.addEventListener("click", () => void lawShowRelocateHub(btn.getAttribute("data-hub-peer")));
  });
}

async function lawShowFocusHubs() {
  if (!lawData) {
    try {
      await lawLoad("focus-hubs");
    } catch (_) {}
  }
  const util = lawEl("law-panel-utility");
  if (!util) return;
  lawView = "focus-hubs";
  lawSetPanel("utility");
  util.hidden = false;
  lawBreadcrumb([
    { label: "The Law", action: "overview" },
    { label: "Focus hubs" },
  ]);
  lawSetPath("/law/focus-hubs");
  try {
    if (window.MenuController?.l1 === "law") {
      localStorage.setItem("btc-menu-l2", "focus-hubs");
      window.MenuController.l2 = "focus-hubs";
      document.querySelectorAll("#menu-l2-slot .dash-tab--l2").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.menuId === "focus-hubs");
      });
    }
  } catch (_) {}

  lawApplyFocusHubFlags();
  if (typeof lawSyncLegalRelocateDestinations === "function") {
    try {
      lawSyncLegalRelocateDestinations();
      lawApplyFocusHubFlags();
    } catch (_) {}
  }
  const focusIds = lawGetFocusHubIds();
  const hubs = focusIds.map((id) => lawGetRelocateEntry(id)).filter(Boolean);
  const addable = LAW_RELOCATE_BROWSER.filter((c) => !focusIds.includes(c.id)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  util.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h2>Focus hubs</h2>
        <span class="panel-meta">${hubs.length} pinned · full deep dives · editable shortlist</span>
      </div>
      <div class="law-panel-body">
        <p class="law-muted">Your personal shortlist of founder destinations (saved on this device). Every map-green country has the <strong>same deep-dive depth</strong> under Global / Relocate — pin any of them here. Remove with ✕ or open a hub and use <strong>Add to Focus hubs</strong>.</p>
        <div class="law-focus-hubs-grid">
          ${
            hubs.length
              ? hubs
                  .map((c) => {
                    const h = lawGetRelocateHub(c) || {};
                    return `<div class="law-focus-hub-card-wrap" style="--hub-accent:${lawEsc(h.accent || "#34d399")}">
                      <button type="button" class="law-focus-hub-card" data-focus-hub="${lawEsc(c.id)}">
                        <span class="law-focus-hub-card__flag">${h.flag || "🌐"}</span>
                        <span class="law-focus-hub-card__name">${lawEsc(c.name)}</span>
                        <span class="law-focus-hub-card__region">${lawEsc(c.region)}</span>
                        <span class="law-focus-hub-card__blurb">${lawEsc(h.headline || c.blurb)}</span>
                        <span class="law-focus-hub-card__meta">CoL ${lawEsc(c.col)} · ${lawEsc(c.company)}</span>
                      </button>
                      <button type="button" class="law-focus-hub-remove" data-focus-remove="${lawEsc(c.id)}" title="Remove from Focus hubs" aria-label="Remove ${lawEsc(c.name)} from Focus hubs">✕</button>
                    </div>`;
                  })
                  .join("")
              : `<p class="law-empty">No focus hubs pinned. Add destinations below or from a hub page.</p>`
          }
        </div>
        <div class="law-focus-manage">
          <h3 class="law-subhead">Add a country to Focus hubs</h3>
          <div class="law-focus-add-row">
            <select id="law-focus-add-select" class="law-select" aria-label="Choose destination to pin">
              <option value="">Select destination…</option>
              ${addable.map((c) => `<option value="${lawEsc(c.id)}">${lawEsc(c.name)} · ${lawEsc(c.region)}</option>`).join("")}
            </select>
            <button type="button" class="law-btn" data-focus-add>Add to Focus hubs</button>
            <button type="button" class="law-btn law-btn--ghost" data-focus-reset title="Restore default shortlist (Panama, UAE, El Salvador, …)">Reset defaults</button>
          </div>
        </div>
        <p style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
          <button type="button" class="law-btn" data-hub-all>Full Global / Relocate</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-back>← Overview</button>
        </p>
      </div>
    </section>`;
  util.querySelectorAll("[data-focus-hub]").forEach((btn) => {
    btn.addEventListener("click", () => void lawShowRelocateHub(btn.getAttribute("data-focus-hub")));
  });
  util.querySelectorAll("[data-focus-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-focus-remove");
      if (lawIsFocusHub(id)) lawToggleFocusHub(id);
      void lawShowFocusHubs();
    });
  });
  util.querySelector("[data-focus-add]")?.addEventListener("click", () => {
    const sel = util.querySelector("#law-focus-add-select");
    const id = sel?.value;
    if (!id) return;
    if (!lawIsFocusHub(id)) lawToggleFocusHub(id);
    void lawShowFocusHubs();
  });
  util.querySelector("[data-focus-reset]")?.addEventListener("click", () => {
    if (confirm("Restore the default Focus hubs shortlist?")) {
      lawResetFocusHubs();
      void lawShowFocusHubs();
    }
  });
  util.querySelector("[data-hub-all]")?.addEventListener("click", () => void lawShowPanel("global-founders"));
  util.querySelector("[data-law-back]")?.addEventListener("click", () => lawShowOverview());
  lawAttachGlossary(util);
}

function lawRenderHero() {
  const el = lawEl("law-hero-text");
  if (el) {
    const base = lawData?.hero || "";
    el.innerHTML = `${lawEsc(base)}
      <span class="law-hero-cta"> ·
        <button type="button" class="law-link-btn" data-law-open-mica>EU MiCA / Founders</button>
        ·
        <button type="button" class="law-link-btn" data-law-open-global>Global / Relocate</button>
        (company seat, visas, CoL — UAE · SV · PY · GE · CR · KZ + more)
      </span>`;
    el.querySelector("[data-law-open-mica]")?.addEventListener("click", () => {
      void lawShowPanel("eu-mica");
    });
    el.querySelector("[data-law-open-global]")?.addEventListener("click", () => {
      void lawShowPanel("global-founders");
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
  const favOn = Boolean(lawPrefs.filters.favoritesOnly);
  const favN = (lawPrefs.favorites || []).length;
  const starChip = `<button type="button" class="law-chip law-chip--star${favOn ? " active" : ""}" data-law-fav-filter aria-pressed="${favOn ? "true" : "false"}" title="Show only jurisdictions you starred (favorites)">★ Starred${favN ? ` (${favN})` : ""}</button>`;
  el.innerHTML =
    starChip +
    chips
      .map((c) => {
        const on = (lawPrefs.filters.chips || []).includes(c.id);
        return `<button type="button" class="law-chip${on ? " active" : ""}" data-law-chip="${lawEsc(c.id)}">${lawEsc(c.label)}</button>`;
      })
      .join("");
  el.querySelector("[data-law-fav-filter]")?.addEventListener("click", () => {
    lawPrefs.filters.favoritesOnly = !lawPrefs.filters.favoritesOnly;
    lawSavePrefs();
    lawRenderList();
    lawRenderMap();
    lawRenderChips();
    const chk = lawEl("law-filter-starred");
    if (chk) chk.checked = lawPrefs.filters.favoritesOnly;
  });
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
      else if (a === "global-founders") void lawShowPanel("global-founders");
      else if (a === "focus-hubs") void lawShowFocusHubs();
      else if (a === "simulator") void lawShowPanel("simulator");
      else if (a === "eu-mica") void lawShowPanel("eu-mica");
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
    if (typeof lawSyncLegalRelocateDestinations === "function") {
      try {
        lawSyncLegalRelocateDestinations();
        lawApplyFocusHubFlags();
      } catch (_) {}
    }
    let relocateEntry = lawGetRelocateEntry(j.id);
    // Ensure legal jurisdictions get a browser + hub row for deep-dive parity
    if (!relocateEntry && j.status === "legal" && j.id !== "european-union") {
      const stub = {
        id: j.id,
        lawId: j.id,
        name: j.name,
        region: j.region || "Other",
        priority: false,
        tags: ["map-legal", ...(j.tags || [])],
        col: "mid",
        company: "medium",
        banking: "selective",
        crypto: "legal",
        visa: "medium",
        blurb: (j.summary || "").slice(0, 160),
        mapLegal: true,
      };
      LAW_RELOCATE_BROWSER.push(stub);
      relocateEntry = stub;
    }
    const hub = relocateEntry ? lawGetRelocateHub(relocateEntry) : null;
    const isFocus = relocateEntry ? lawIsFocusHub(relocateEntry.id) : false;
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
          ${
            relocateEntry
              ? `<button type="button" class="law-btn${isFocus ? "" : " law-btn--ghost"}" data-law-focus-hub="${lawEsc(relocateEntry.id)}">${isFocus ? "★ In Focus hubs" : "☆ Add to Focus hubs"}</button>
                 <button type="button" class="law-btn law-btn--ghost" data-law-open-hub="${lawEsc(relocateEntry.id)}">Open founder hub</button>`
              : ""
          }
          <button type="button" class="law-btn law-btn--ghost" data-law-share>Share</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-export>Export text</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-compare-add="${lawEsc(j.id)}">Add to compare</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-feedback>Report outdated info</button>
          <button type="button" class="law-btn law-btn--ghost" data-law-back>← All jurisdictions</button>
        </div>
      </header>

      <section class="law-status-teach law-panel" aria-label="How to read this status">
        <h3>How tech founders should read this status</h3>
        <div class="law-teach__grid law-teach__grid--compact">
          <div class="law-teach-card law-teach-card--new">
            <h4>If you are learning</h4>
            <p>Each box below answers a different question. <strong>Holding</strong> = can a person own BTC. <strong>Trading</strong> = can exchanges/brokers operate under rules. <strong>Payments</strong> = can shops accept BTC. <strong>Mining</strong> = industrial or home hashing. <strong>Legal tender</strong> = must people accept BTC as money (almost never, except rare policy experiments). Green overall status does not merge these into “anything goes.”</p>
          </div>
          <div class="law-teach-card law-teach-card--mid">
            <h4>If you already know the basics</h4>
            <p>Use the grid to spot product perimeter: a legal-hold / restricted-trading mix often means “treasury OK, public app hard.” Pair this with the founder deep dive (tax residence, CASP/VASP, banking) before you spend on incorporation.</p>
          </div>
        </div>
      </section>

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

      ${
        relocateEntry && hub
          ? `<section class="law-panel law-country-founder-dive" aria-label="Founder deep dive">
          <div class="law-country-founder-dive__head">
            <h3>Founder deep dive · learning + intermediate tracks</h3>
            <p class="law-muted">Written for tech founders: newcomers get plain-English framing; intermediate founders get perimeter and sequencing checks. Same depth as Focus hubs (tax, KYC, services, startups, tokens). Educational only — not legal advice. Pin to Focus hubs to keep this destination on your shortlist.</p>
          </div>
          ${lawFounderDeepDiveHtml(relocateEntry, hub)}
        </section>`
          : j.status === "legal"
            ? `<section class="law-panel"><p class="law-muted">Founder deep-dive data is syncing — open <strong>Global / Relocate</strong> or refresh once the map dataset is loaded.</p></section>`
            : ""
      }
    `;

    panel.querySelector("[data-law-back]")?.addEventListener("click", () => lawShowOverview());
    panel.querySelector("[data-law-fav]")?.addEventListener("click", (e) => {
      lawToggleFavorite(j.id);
      e.currentTarget.textContent = lawPrefs.favorites.includes(j.id) ? "★ Favorited" : "☆ Add to favorites";
      lawRenderList();
      lawRenderMap();
    });
    panel.querySelector("[data-law-focus-hub]")?.addEventListener("click", (e) => {
      const rid = e.currentTarget.getAttribute("data-law-focus-hub");
      const on = lawToggleFocusHub(rid);
      e.currentTarget.textContent = on ? "★ In Focus hubs" : "☆ Add to Focus hubs";
      e.currentTarget.classList.toggle("law-btn--ghost", !on);
    });
    panel.querySelector("[data-law-open-hub]")?.addEventListener("click", (e) => {
      void lawShowRelocateHub(e.currentTarget.getAttribute("data-law-open-hub"));
    });
    lawAttachGlossary(panel);
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
  if (name === "focus-hubs") {
    await lawShowFocusHubs();
    return;
  }
  if (name === "simulator") {
    if (typeof lawShowSimulator === "function") {
      if (!lawData) {
        try {
          await lawLoad("simulator");
        } catch (_) {}
      }
      lawShowSimulator();
      return;
    }
    lawShowOverview();
    return;
  }
  if (String(name || "").startsWith("hub-")) {
    await lawShowRelocateHub(String(name).slice(4));
    return;
  }
  const allowed = ["watchlist", "compare", "changes", "sources", "eu-mica", "global-founders"];
  if (!allowed.includes(name)) {
    lawShowOverview();
    return;
  }
  const isGuide = name === "eu-mica" || name === "global-founders";
  if (!lawData && !isGuide) {
    await lawLoad(name);
    return;
  }
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
    "global-founders": "Global / Relocate",
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

  if (name === "eu-mica" || name === "global-founders") {
    const isGlobal = name === "global-founders";
    util.innerHTML = `
      <section class="panel law-guide-panel">
        <div class="panel-header">
          <h2>${isGlobal ? "Global / Relocate" : "EU MiCA / Founders"}</h2>
          <span class="panel-meta">${
            isGlobal
              ? "Deep dives for all map-green (legal/regulated) countries · priority shortlist · 4-layer finder"
              : "Italy-first · post–1 Jul 2026 · educational"
          }</span>
        </div>
        <div class="law-panel-body">
          <p class="law-muted">${
            isGlobal
              ? "For Italian/EU-resident crypto founders choosing where to live and incorporate worldwide. Hubs include every <strong>map-green</strong> jurisdiction (Legal / regulated on The Law map), plus priority and offshore extras. Four layers: tax residence · company · banking · lifestyle. Not immigration or tax advice."
              : "Comprehensive founder guide for Italian and EU crypto startups under fully in-force MiCA. Not legal advice — verify the live ESMA register and local counsel."
          }</p>
          <div class="law-guide-nav">
            <button type="button" class="law-btn law-btn--ghost${isGlobal ? "" : " active"}" data-law-guide="eu-mica">EU MiCA</button>
            <button type="button" class="law-btn law-btn--ghost${isGlobal ? " active" : ""}" data-law-guide="global-founders">Global / Relocate</button>
            <button type="button" class="law-btn law-btn--ghost" data-law-guide="focus-hubs">Focus hubs</button>
            <button type="button" class="law-btn law-btn--ghost" data-law-guide-overview>Jurisdiction map</button>
          </div>
          ${isGlobal ? (typeof lawSyncLegalRelocateDestinations === "function" && lawSyncLegalRelocateDestinations(), lawRelocateBrowserHtml()) : ""}
          <div id="law-guide-root" class="law-guide-root"><p class="law-loading">Loading guide…</p></div>
          <p style="margin-top:1rem"><button type="button" class="law-btn" data-law-back>← Overview</button></p>
        </div>
      </section>`;
    util.querySelectorAll("[data-law-guide]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-law-guide");
        if (id === "focus-hubs") void lawShowFocusHubs();
        else void lawShowPanel(id);
      });
    });
    util.querySelector("[data-law-guide-overview]")?.addEventListener("click", () => lawShowOverview());
    if (isGlobal) lawBindRelocateBrowser();
    const root = lawEl("law-guide-root");
    try {
      const html = isGlobal ? await lawLoadGlobalFoundersGuide() : await lawLoadMicaGuide();
      if (root) root.innerHTML = html;
    } catch (err) {
      if (root) {
        root.innerHTML = `<p class="law-error">Could not load guide — ${lawEsc(err.message || "error")}. Ensure the guide markdown file is deployed.</p>`;
      }
    }
    lawAttachGlossary(util);
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
    lawPrefs.filters = { status: "", region: "", q: "", chips: [], favoritesOnly: false };
    lawSavePrefs();
    const s = lawEl("law-search");
    if (s) s.value = "";
    const st = lawEl("law-filter-status");
    if (st) st.value = "";
    const rg = lawEl("law-filter-region");
    if (rg) rg.value = "";
    const starred = lawEl("law-filter-starred");
    if (starred) starred.checked = false;
    lawRenderChips();
    lawRenderList();
    lawRenderMap();
  });
  lawEl("law-filter-starred")?.addEventListener("change", (e) => {
    lawPrefs.filters.favoritesOnly = Boolean(e.target.checked);
    lawSavePrefs();
    lawRenderList();
    lawRenderMap();
    lawRenderChips();
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
    if (typeof lawSyncLegalRelocateDestinations === "function") {
      try {
        const sync = lawSyncLegalRelocateDestinations();
        if (sync?.added) console.info(`[The Law] relocate hubs: +${sync.added} map-legal destinations (total legal ${sync.totalLegal})`);
      } catch (e) {
        console.warn("lawSyncLegalRelocateDestinations", e);
      }
    }
    lawApplyFocusHubFlags();
    await lawEnsureWorldMap();
    lawFillFilterSelects();
    const starredChk = lawEl("law-filter-starred");
    if (starredChk) starredChk.checked = Boolean(lawPrefs.filters.favoritesOnly);
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

    const utilityTabs = [
      "compare",
      "watchlist",
      "changes",
      "sources",
      "eu-mica",
      "global-founders",
      "focus-hubs",
      "simulator",
    ];
    const path = (location.pathname || "").replace(/\/$/, "");
    const m = path.match(/^\/law\/([a-z0-9-]+)$/i);
    let pathSlug = m ? m[1].toLowerCase() : "";
    if (pathSlug === "mica" || pathSlug === "founders") pathSlug = "eu-mica";
    if (["global", "relocate", "relocation", "expat"].includes(pathSlug)) pathSlug = "global-founders";
    if (pathSlug === "focus" || pathSlug === "hubs") pathSlug = "focus-hubs";
    if (pathSlug === "sim" || pathSlug === "structure") pathSlug = "simulator";
    const sessionCountry = sessionStorage.getItem("law-open-country");
    if (sessionCountry) sessionStorage.removeItem("law-open-country");

    // Explicit menu tab always wins (fixes sticky /law/compare overriding Overview)
    const tab = preferredTab || null;
    if (tab && (utilityTabs.includes(tab) || String(tab).startsWith("hub-"))) {
      await lawShowPanel(tab);
    } else if (tab && tab !== "overview") {
      await lawOpenCountry(tab);
    } else if (tab === "overview") {
      lawShowOverview();
    } else if (pathSlug && (utilityTabs.includes(pathSlug) || pathSlug.startsWith("hub-"))) {
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
  const utilityTabs = [
    "compare",
    "watchlist",
    "changes",
    "sources",
    "eu-mica",
    "global-founders",
    "focus-hubs",
    "simulator",
  ];

  // Data already loaded — switch panels immediately (L2 tab clicks)
  if (lawData) {
    if (utilityTabs.includes(t) || String(t).startsWith("hub-")) {
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
window.lawShowOverview = lawShowOverview;
