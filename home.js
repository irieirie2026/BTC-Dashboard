/** Home — Buccaneers command deck: section cards, highlights, deck jingle + voice. */

const HOME_SOUND_KEY = "btc-home-buccaneers-sound:v1";
const HOME_SOUND_KEY_LEGACY = "btc-home-pirate-sound:v1";
const HOME_JINGLE_COOLDOWN_MS = 8_000;
/** Motto starts while boot stinger is still playing */
const HOME_MOTTO_AFTER_MS = 720;
const HOME_MOTTO = "Fuck the system and dont forget to stack satoshis";
/** Bundled Grok Luna clip — always the same (no live TTS / browser voice). */
const HOME_MOTTO_SRC = "assets/home-motto.mp3";

const HOME_SECTIONS = [
  {
    id: "market",
    label: "Market",
    icon: "₿",
    accent: "#0ecb81",
    accentDim: "rgba(14, 203, 129, 0.18)",
    blurb:
      "Live BTC/USDT spot, multi-TF indicators, chart patterns, order book — plus prediction markets with fee-aware arb desk and Deribit relative value.",
    badge: "Arbs",
  },
  {
    id: "onchain",
    label: "On Chain",
    icon: "⛓",
    accent: "#10b981",
    accentDim: "rgba(16, 185, 129, 0.18)",
    blurb: "Mainnet health — network, mining, fees, supply, addresses, and Lightning.",
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
    blurb: "Perpetuals, delivery futures, and options — funding, OI, vol surfaces, and strategy tools.",
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
    blurb:
      "Returns, correlation matrix & rolling β, risk/VaR, vol models, time series, power law, and Markov regimes.",
    badge: "Expanded",
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
    blurb:
      "On-chain overview, distribution & whales, miner economics, cycles, sentiment, and the 4y cycle board.",
    badge: "L2 menu",
  },
  {
    id: "law",
    label: "The Law",
    icon: "⚖",
    accent: "#94a3b8",
    accentDim: "rgba(148, 163, 184, 0.18)",
    blurb:
      "World map of Bitcoin legal status — 70+ jurisdictions, LatAm & SE Asia, tax headlines, compare & watchlist. Educational only.",
    badge: "New",
  },
  {
    id: "misc",
    label: "Misc",
    icon: "◈",
    accent: "#e879f9",
    accentDim: "rgba(232, 121, 249, 0.18)",
    blurb: "Dominance, Fear & Greed, calendar seasonality, whales, cross-market, and more side metrics.",
  },
];

/** Featured “new cargo” shortcuts under the banner */
const HOME_HIGHLIGHTS = [
  {
    id: "law",
    label: "The Law",
    tag: "New",
    tip: "Bitcoin legal status world map · 70+ countries",
    go: { l1: "law" },
  },
  {
    id: "pm",
    label: "Prediction markets",
    tag: "Arbs",
    tip: "Fee-aware arbs · Deribit relative value",
    go: { l1: "market", l2: "prediction-markets" },
  },
  {
    id: "corr",
    label: "Correlation desk",
    tag: "Stats",
    tip: "Matrix & rolling correlations",
    go: { l1: "stats", l2: "correlation" },
  },
  {
    id: "vol",
    label: "Volatility",
    tag: "Stats",
    tip: "Vol models & surfaces context",
    go: { l1: "stats", l2: "volatility" },
  },
  {
    id: "ts",
    label: "Time series",
    tag: "Stats",
    tip: "Series diagnostics & models",
    go: { l1: "stats", l2: "timeseries" },
  },
  {
    id: "val",
    label: "Valuation L2",
    tag: "Cycles",
    tip: "On-chain, whales, miner, 4y cycle",
    go: { l1: "valuation" },
  },
];

let homeBound = false;
let homeUiSoundsBound = false;
let homeJingleCtx = null;
let homeJingleLastPlay = 0;
let homeBootPlayedThisLoad = false;
let homeAudioUnlockBound = false;
let homeMottoAudio = null;
let homeMottoEl = null; // preloaded HTMLAudioElement for instant play
let homeBootPendingGesture = false;
let homeLastUiClickAt = 0;

function homeSoundEnabled() {
  try {
    let v = localStorage.getItem(HOME_SOUND_KEY);
    if (v === null) {
      v = localStorage.getItem(HOME_SOUND_KEY_LEGACY);
    }
    if (v === null) return true;
    return v !== "0";
  } catch (_) {
    return true;
  }
}

function homeSetSoundEnabled(on) {
  try {
    localStorage.setItem(HOME_SOUND_KEY, on ? "1" : "0");
    localStorage.removeItem(HOME_SOUND_KEY_LEGACY);
  } catch (_) {}
  if (!on) homeStopPlaybackOnly();
  homeSyncSoundButton();
}

function homeSyncSoundButton() {
  const btn = document.getElementById("home-sound-toggle");
  if (!btn) return;
  const on = homeSoundEnabled();
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.title = on
    ? "Buccaneers deck sound on — click to mute"
    : "Buccaneers deck sound muted — click to enable";
  btn.setAttribute(
    "aria-label",
    on ? "Mute Buccaneers landing sound and voice" : "Enable Buccaneers landing sound and voice",
  );
  btn.textContent = on ? "🔊 Buccaneers" : "🔇 Mute";
  btn.classList.toggle("is-muted", !on);
}

function homeStopPlaybackOnly() {
  try {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  } catch (_) {}
  try {
    if (homeMottoAudio) {
      homeMottoAudio.pause();
      homeMottoAudio.currentTime = 0;
      homeMottoAudio = null;
    }
  } catch (_) {}
}

function homeStopSpeech() {
  homeStopPlaybackOnly();
}

function homeEnsureAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!homeJingleCtx || homeJingleCtx.state === "closed") {
    homeJingleCtx = new AC();
  }
  return homeJingleCtx;
}

function homeResumeAudioCtx() {
  const ctx = homeEnsureAudioCtx();
  if (!ctx) return Promise.resolve(null);
  if (ctx.state === "suspended") {
    return ctx.resume().then(() => ctx).catch(() => ctx);
  }
  return Promise.resolve(ctx);
}

/** Keep motto element warm so play() is near-instant after unlock. */
function homeWarmMottoElement() {
  if (homeMottoEl) return homeMottoEl;
  try {
    const a = new Audio(HOME_MOTTO_SRC);
    a.preload = "auto";
    a.load();
    homeMottoEl = a;
  } catch (_) {}
  return homeMottoEl;
}

function homePrefetchMotto() {
  homeWarmMottoElement();
  return Promise.resolve(HOME_MOTTO_SRC);
}

/** 8-bit style blip (square pulse). Uses linear ramps for short UI clicks. */
function homeRetroNote(ctx, dest, { f, t, d = 0.08, vol = 0.12, type = "square" }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  const attack = Math.min(0.008, d * 0.25);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.linearRampToValueAtTime(0.0001, t + d);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + d + 0.02);
}

/** Coin / power-up noise chirp (classic arcade). */
function homeRetroNoise(ctx, dest, { t, d = 0.06, vol = 0.1, hi = 4000 }) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * d));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.22));
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.setValueAtTime(hi, t);
  filt.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(filt);
  filt.connect(g);
  g.connect(dest);
  src.start(t);
}

/**
 * UI click — same two-tone arcade blip as production (Vercel home.js?v=17):
 * square 880 Hz then 1320 Hz. Gesture-safe resume so localhost actually plays it.
 */
function homePlayUiClick() {
  if (!homeSoundEnabled()) return;
  const now = Date.now();
  if (now - homeLastUiClickAt < 35) return;
  homeLastUiClickAt = now;

  const ctx = homeEnsureAudioCtx();
  if (!ctx) return;

  const fire = () => {
    if (!homeSoundEnabled()) return;
    try {
      const t0 = ctx.currentTime + 0.001;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.16, t0);
      master.connect(ctx.destination);
      // Match Vercel production click exactly
      homeRetroNote(ctx, master, { f: 880, t: t0, d: 0.035, vol: 0.14, type: "square" });
      homeRetroNote(ctx, master, { f: 1320, t: t0 + 0.02, d: 0.04, vol: 0.1, type: "square" });
    } catch (err) {
      console.warn("[home] UI click SFX failed", err);
    }
  };

  // resume() in the gesture; schedule tones right after (not only in a detached then)
  if (ctx.state === "suspended") {
    try {
      const p = ctx.resume();
      if (p && typeof p.then === "function") p.then(fire).catch(fire);
      else fire();
    } catch (_) {
      fire();
    }
  } else {
    fire();
  }
}

function homeEventElement(target) {
  if (!target) return null;
  // Clicks often land on text nodes or SVG children inside buttons
  if (target.nodeType === 3) return target.parentElement;
  if (target.nodeType === 1) return target;
  return target.parentElement || null;
}

function homeIsUiClickTarget(el) {
  el = homeEventElement(el);
  if (!el) return false;
  if (el.closest?.("[data-no-ui-sfx]")) return false;
  // Broad: any real button / tab / card control in the dashboard chrome
  return Boolean(
    el.closest?.(
      [
        "button",
        "a[href]",
        "[role='button']",
        "[role='tab']",
        ".dash-tab",
        ".home-card",
        ".home-highlight",
        ".home-sound-toggle",
        ".law-chip",
        ".law-btn",
        ".law-bc-btn",
        ".law-link-btn",
        ".md-btn",
        ".ss-btn",
        ".spot-chart-btn",
        ".spot-history-btn",
        ".spot-tf-btn",
        ".help-trigger",
        "input[type='button']",
        "input[type='submit']",
        "input[type='reset']",
        "input[type='checkbox']",
        "input[type='radio']",
        "select",
        "summary",
        "label",
        "[data-dashboard]",
        "[data-menu-id]",
        "[data-law-chip]",
        "[data-home-go]",
        "[data-spot-tf]",
        "[data-spot-range]",
      ].join(","),
    ),
  );
}

function homeOnUiActivate(e) {
  if (e.type === "pointerdown" && e.button != null && e.button !== 0) return;
  if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
  // Prefer composedPath for nested SVG / icon fonts
  const path = typeof e.composedPath === "function" ? e.composedPath() : [];
  let hit = null;
  for (const n of path) {
    if (n && n.nodeType === 1 && homeIsUiClickTarget(n)) {
      hit = n;
      break;
    }
  }
  if (!hit && !homeIsUiClickTarget(e.target)) return;
  homePlayUiClick();
}

function homeBindGlobalUiSounds() {
  if (homeUiSoundsBound) return;
  homeUiSoundsBound = true;
  // Capture phase so we hear the click even if handlers stopPropagation
  document.addEventListener("pointerdown", homeOnUiActivate, true);
  document.addEventListener("click", homeOnUiActivate, true);
  document.addEventListener("keydown", homeOnUiActivate, true);
}

/** Retro load stinger only (plays immediately while app boots). */
function homePlayLoadStinger(ctx) {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.16, t0);
  master.gain.setValueAtTime(0.14, t0 + 0.7);
  master.gain.exponentialRampToValueAtTime(0.03, t0 + 1.4);
  master.connect(ctx.destination);

  const bus = ctx.createBiquadFilter();
  bus.type = "lowpass";
  bus.frequency.value = 3400;
  bus.Q.value = 0.7;
  bus.connect(master);

  // Instant “power on” blip
  homeRetroNoise(ctx, bus, { t: t0, d: 0.04, vol: 0.15, hi: 3200 });
  homeRetroNote(ctx, bus, { f: 523.25, t: t0, d: 0.05, vol: 0.14 });
  homeRetroNote(ctx, bus, { f: 784, t: t0 + 0.05, d: 0.06, vol: 0.13 });
  homeRetroNote(ctx, bus, { f: 1046.5, t: t0 + 0.11, d: 0.08, vol: 0.14 });

  // Power-up arpeggio while loading
  const arp = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1046.5];
  arp.forEach((f, i) => {
    homeRetroNote(ctx, bus, {
      f,
      t: t0 + 0.22 + i * 0.05,
      d: 0.06,
      vol: 0.11,
      type: i % 2 ? "square" : "triangle",
    });
  });

  // Coin cascade
  for (let i = 0; i < 4; i++) {
    homeRetroNoise(ctx, bus, {
      t: t0 + 0.55 + i * 0.06,
      d: 0.04,
      vol: 0.09,
      hi: 2400 + i * 300,
    });
    homeRetroNote(ctx, bus, {
      f: 1100 + i * 160,
      t: t0 + 0.55 + i * 0.06,
      d: 0.045,
      vol: 0.08,
    });
  }

  // Short fanfare tail under the voice
  const fanfare = [
    { f: 392.0, t: 0.85, d: 0.08 },
    { f: 523.25, t: 0.93, d: 0.08 },
    { f: 659.25, t: 1.01, d: 0.1 },
    { f: 784.0, t: 1.12, d: 0.16 },
  ];
  for (const n of fanfare) {
    homeRetroNote(ctx, bus, { f: n.f, t: t0 + n.t, d: n.d, vol: 0.12, type: "square" });
  }
}

/** Bundled motto MP3 only. */
async function homePlayMottoClip({ force = false } = {}) {
  if (!force && !homeSoundEnabled()) return;
  homeStopPlaybackOnly();
  try {
    // Reuse preloaded element when possible (faster first play)
    let audio = homeMottoEl;
    if (!audio) {
      audio = new Audio(HOME_MOTTO_SRC);
      homeMottoEl = audio;
      audio.preload = "auto";
    }
    // Clone via new element if previous play already used this node
    if (!audio.paused && !audio.ended) {
      audio = new Audio(HOME_MOTTO_SRC);
    }
    homeMottoAudio = audio;
    audio.volume = 1;
    audio.currentTime = 0;
    if (audio.readyState < 2) {
      await new Promise((resolve) => {
        const done = () => {
          audio.removeEventListener("canplay", done);
          resolve();
        };
        audio.addEventListener("canplay", done);
        audio.load();
        setTimeout(done, 800);
      });
    }
    if (!homeSoundEnabled() && !force) return;
    await audio.play();
  } catch (_) {
    homeArmBootOnGesture();
  }
}

async function homeSpeakMotto() {
  return homePlayMottoClip();
}

/**
 * Boot sequence: load SFX immediately → motto while stinger still rings.
 * Called as early as possible when Home is active.
 */
function homePlayBuccaneersJingle({ force = false } = {}) {
  if (!force && !homeSoundEnabled()) return;
  const now = Date.now();
  if (!force && now - homeJingleLastPlay < HOME_JINGLE_COOLDOWN_MS) return;
  homeJingleLastPlay = now;
  homeBootPlayedThisLoad = true;

  homeWarmMottoElement();

  // Motto overlaps the tail of the load stinger
  setTimeout(() => {
    if (homeSoundEnabled()) void homePlayMottoClip();
  }, HOME_MOTTO_AFTER_MS);

  void homeResumeAudioCtx().then((ctx) => {
    if (!ctx) {
      homeArmBootOnGesture();
      return;
    }
    try {
      homePlayLoadStinger(ctx);
    } catch (_) {
      homeArmBootOnGesture();
    }
  });
}

function homeArmBootOnGesture() {
  if (homeBootPendingGesture || !homeSoundEnabled()) return;
  homeBootPendingGesture = true;
  const unlock = () => {
    homeBootPendingGesture = false;
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
    void homeResumeAudioCtx().then(() => {
      if (homeSoundEnabled()) {
        // Always re-run boot after unlock so first real gesture gets SFX + voice
        homeJingleLastPlay = 0;
        homePlayBuccaneersJingle({ force: true });
      }
    });
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}

/** Unlock AudioContext on first user gesture app-wide (enables SFX + click sounds). */
function homeBindAudioUnlock() {
  if (homeAudioUnlockBound) return;
  homeAudioUnlockBound = true;
  const unlock = () => {
    void homeResumeAudioCtx();
    homeWarmMottoElement();
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}

/**
 * Start audio as soon as scripts run — SFX while app loads, then motto.
 * If autoplay is blocked, first interaction unlocks and plays the same sequence.
 */
function homeBootAudioEarly() {
  homeBindGlobalUiSounds();
  homeBindAudioUnlock();
  homeWarmMottoElement();
  if (!homeSoundEnabled()) return;

  // Try immediately (works after prior unlock / some browsers)
  const tryBoot = () => {
    if (homeBootPlayedThisLoad) return;
    if (document.body?.dataset?.l1 && document.body.dataset.l1 !== "home") return;
    homePlayBuccaneersJingle({ force: false });
    // If still silent, arm gesture
    setTimeout(() => {
      if (homeJingleCtx?.state === "suspended" || homeBootPendingGesture) {
        homeArmBootOnGesture();
      }
    }, 100);
  };

  tryBoot();
  // Retry after dashboard sets body.dataset.l1 = home
  setTimeout(tryBoot, 50);
  setTimeout(tryBoot, 200);
  setTimeout(tryBoot, 500);
}

function homeEsc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHomeHighlights() {
  const el = document.getElementById("home-highlights");
  if (!el) return;
  el.innerHTML = HOME_HIGHLIGHTS.map(
    (h) => `
    <button type="button" class="home-highlight" data-home-go="${homeEsc(h.id)}" title="${homeEsc(h.tip)}">
      <span class="home-highlight-tag">${homeEsc(h.tag)}</span>
      <span class="home-highlight-label">${homeEsc(h.label)}</span>
      <span class="home-highlight-tip">${homeEsc(h.tip)}</span>
    </button>`,
  ).join("");
}

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
      ${section.badge ? `<span class="home-card-badge">${homeEsc(section.badge)}</span>` : ""}
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

function navigateHomeHighlight(id) {
  const h = HOME_HIGHLIGHTS.find((x) => x.id === id);
  if (!h?.go || !window.MenuController) return;
  const { l1, l2 } = h.go;
  window.MenuController.setLevel1(l1);
  if (l2) {
    // L1 apply is sync; open the target L2 after paint so L2 nav exists
    requestAnimationFrame(() => {
      try {
        window.MenuController.setLevel2?.(l2);
      } catch (_) {}
    });
  }
}

function bindHomeCards() {
  if (homeBound) return;
  homeBound = true;

  const grid = document.getElementById("home-section-grid");
  if (grid) {
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

  const highlights = document.getElementById("home-highlights");
  if (highlights) {
    highlights.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-home-go]");
      if (!btn) return;
      navigateHomeHighlight(btn.getAttribute("data-home-go"));
    });
  }

  const soundBtn = document.getElementById("home-sound-toggle");
  if (soundBtn) {
    soundBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const next = !homeSoundEnabled();
      homeSetSoundEnabled(next);
      if (next) homePlayBuccaneersJingle({ force: true });
    });
  }
}

function initHomePage() {
  renderHomeCards();
  renderHomeHighlights();
  bindHomeCards();
  homeSyncSoundButton();
  window.initSuperSummaryHome?.();
  window.decorateHelpLabels?.(document.getElementById("dashboard-home"));

  homeWarmMottoElement();
  homeBindGlobalUiSounds();
  homeBindAudioUnlock();

  // Boot SFX + voice as soon as Home is shown (skip if early boot already ran)
  if (homeSoundEnabled()) {
    if (!homeBootPlayedThisLoad) {
      homePlayBuccaneersJingle({ force: true });
    }
    if (homeJingleCtx?.state === "suspended") homeArmBootOnGesture();
  }
}

window.initHomePage = initHomePage;
window.homePlayBuccaneersJingle = homePlayBuccaneersJingle;
window.homePlayUiClick = homePlayUiClick;
window.homeBootAudioEarly = homeBootAudioEarly;
// back-compat alias
window.homePlayPirateJingle = homePlayBuccaneersJingle;

// Start UI click sounds + early boot immediately when this script loads
homeBindGlobalUiSounds();
homeBindAudioUnlock();
homeWarmMottoElement();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    renderHomeCards();
    renderHomeHighlights();
    bindHomeCards();
    homeSyncSoundButton();
    homeBootAudioEarly();
  });
} else {
  renderHomeCards();
  renderHomeHighlights();
  bindHomeCards();
  homeSyncSoundButton();
  homeBootAudioEarly();
}
