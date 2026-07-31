/** Home — Buccaneers command deck: section cards, highlights, deck jingle + voice. */

const HOME_SOUND_KEY = "btc-home-buccaneers-sound:v1";
const HOME_SOUND_KEY_LEGACY = "btc-home-pirate-sound:v1";
const HOME_JINGLE_COOLDOWN_MS = 12_000;
const HOME_MOTTO = "Fuck the system and dont forget to stack satoshis";

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
let homeJingleCtx = null;
let homeJingleLastPlay = 0;
let homeJinglePendingGesture = false;

function homeSoundEnabled() {
  try {
    let v = localStorage.getItem(HOME_SOUND_KEY);
    if (v === null) {
      // migrate prior mute pref
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

let homeMottoAudio = null;
let homeMottoPlayPending = false;

/**
 * Static app asset — same Grok Luna clip every time (localhost + Vercel).
 * No live TTS API, no browser SpeechSynthesis (those caused 1st-vs-2nd voice mismatch).
 */
const HOME_MOTTO_SRC = "assets/home-motto.mp3";

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

function homePrefetchMotto() {
  // Browser will cache the static file; hint via hidden Audio preload
  try {
    const a = new Audio();
    a.preload = "auto";
    a.src = HOME_MOTTO_SRC;
  } catch (_) {}
  return Promise.resolve(HOME_MOTTO_SRC);
}

function homeArmMottoPlayOnGesture() {
  if (homeMottoPlayPending) return;
  homeMottoPlayPending = true;
  const unlock = () => {
    homeMottoPlayPending = false;
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
    if (document.body?.dataset?.l1 === "home" && homeSoundEnabled()) {
      void homePlayMottoClip({ force: true });
    }
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}

/** Play the bundled motto MP3 only — never OS / API TTS. */
async function homePlayMottoClip({ force = false } = {}) {
  if (!force && !homeSoundEnabled()) return;
  homeStopPlaybackOnly();
  try {
    const audio = new Audio(HOME_MOTTO_SRC);
    homeMottoAudio = audio;
    audio.preload = "auto";
    audio.volume = 1;
    await new Promise((resolve, reject) => {
      let settled = false;
      const ok = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const bad = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("audio error"));
      };
      const cleanup = () => {
        audio.removeEventListener("canplaythrough", ok);
        audio.removeEventListener("error", bad);
      };
      audio.addEventListener("canplaythrough", ok);
      audio.addEventListener("error", bad);
      audio.load();
      if (audio.readyState >= 3) ok();
      setTimeout(ok, 2000);
    });
    if (!homeSoundEnabled() && !force) return;
    await audio.play();
  } catch (err) {
    // Autoplay block → same file on next gesture (never browser TTS)
    homeArmMottoPlayOnGesture();
  }
}

async function homeSpeakMotto() {
  return homePlayMottoClip();
}

/** 8-bit style blip (square pulse). */
function homeRetroNote(ctx, dest, { f, t, d = 0.08, vol = 0.12, type = "square" }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
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
 * Retro arcade insert-coin / level-up stinger (original, not a copyrighted tune)
 * + Grok TTS rebellious girl shout.
 */
function homePlayBuccaneersJingle({ force = false } = {}) {
  if (!force && !homeSoundEnabled()) return;
  const now = Date.now();
  if (!force && now - homeJingleLastPlay < HOME_JINGLE_COOLDOWN_MS) return;
  homeJingleLastPlay = Date.now();

  // Short retro sting, then bundled motto MP3 (same file every time)
  setTimeout(() => {
    if (homeSoundEnabled()) void homePlayMottoClip();
  }, 900);

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    homeArmJingleOnGesture();
    return;
  }

  try {
    if (!homeJingleCtx || homeJingleCtx.state === "closed") {
      homeJingleCtx = new AC();
    }
    const ctx = homeJingleCtx;
    const start = () => {
      const t0 = ctx.currentTime + 0.02;
      const master = ctx.createGain();
      // Keep SFX under the spoken line
      master.gain.setValueAtTime(0.14, t0);
      master.gain.setValueAtTime(0.14, t0 + 0.85);
      master.gain.exponentialRampToValueAtTime(0.04, t0 + 1.1);
      master.connect(ctx.destination);

      // Soft bitcrush feel via mild lowpass on master bus
      const bus = ctx.createBiquadFilter();
      bus.type = "lowpass";
      bus.frequency.value = 3200;
      bus.Q.value = 0.7;
      bus.connect(master);

      // --- Arcade "insert coin" triple blip ---
      homeRetroNoise(ctx, bus, { t: t0, d: 0.05, vol: 0.14, hi: 2800 });
      homeRetroNote(ctx, bus, { f: 880, t: t0 + 0.02, d: 0.06, vol: 0.13 });
      homeRetroNote(ctx, bus, { f: 1175, t: t0 + 0.09, d: 0.06, vol: 0.13 });
      homeRetroNote(ctx, bus, { f: 1568, t: t0 + 0.16, d: 0.09, vol: 0.14 });

      // --- Power-up arpeggio (C major 8-bit) ---
      const arp = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
      arp.forEach((f, i) => {
        homeRetroNote(ctx, bus, {
          f,
          t: t0 + 0.32 + i * 0.055,
          d: 0.07,
          vol: 0.11,
          type: i % 2 ? "square" : "triangle",
        });
      });

      // --- Coin cascade ---
      for (let i = 0; i < 5; i++) {
        homeRetroNoise(ctx, bus, {
          t: t0 + 0.75 + i * 0.07,
          d: 0.045,
          vol: 0.09,
          hi: 2200 + i * 350,
        });
        homeRetroNote(ctx, bus, {
          f: 1200 + i * 180,
          t: t0 + 0.75 + i * 0.07,
          d: 0.05,
          vol: 0.08,
        });
      }

      // --- Level-clear fanfare (short original 8-bit) ---
      const fanfare = [
        { f: 392.0, t: 1.15, d: 0.1 },
        { f: 523.25, t: 1.25, d: 0.1 },
        { f: 659.25, t: 1.35, d: 0.1 },
        { f: 783.99, t: 1.45, d: 0.18 },
        { f: 1046.5, t: 1.65, d: 0.28 },
      ];
      for (const n of fanfare) {
        homeRetroNote(ctx, bus, {
          f: n.f,
          t: t0 + n.t,
          d: n.d,
          vol: 0.13,
          type: "square",
        });
        // detuned triangle layer for thicker NES-ish tone
        homeRetroNote(ctx, bus, {
          f: n.f * 2,
          t: t0 + n.t,
          d: n.d * 0.85,
          vol: 0.04,
          type: "triangle",
        });
      }

      // Final boom-bloop under the shout
      homeRetroNoise(ctx, bus, { t: t0 + 2.0, d: 0.12, vol: 0.12, hi: 900 });
      homeRetroNote(ctx, bus, { f: 196, t: t0 + 2.0, d: 0.2, vol: 0.1, type: "square" });
      homeRetroNote(ctx, bus, { f: 784, t: t0 + 2.15, d: 0.15, vol: 0.09 });
    };

    if (ctx.state === "suspended") {
      ctx
        .resume()
        .then(start)
        .catch(() => {
          homeArmJingleOnGesture();
        });
    } else {
      start();
    }
  } catch (_) {
    homeArmJingleOnGesture();
  }
}

function homeArmJingleOnGesture() {
  if (homeJinglePendingGesture || !homeSoundEnabled()) return;
  homeJinglePendingGesture = true;
  const unlock = () => {
    homeJinglePendingGesture = false;
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
    if (document.body?.dataset?.l1 === "home") {
      homePlayBuccaneersJingle({ force: false });
    }
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
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

  // Warm the good server motto immediately so first play never uses OS TTS
  if (homeSoundEnabled()) {
    void homePrefetchMotto().catch(() => {});
  }

  // Landing fanfare + motto (respects mute; first gesture if autoplay blocked)
  if (homeSoundEnabled()) {
    setTimeout(() => {
      if (document.body?.dataset?.l1 === "home") {
        homePlayBuccaneersJingle();
        if (homeJingleCtx?.state === "suspended") homeArmJingleOnGesture();
      }
    }, 280);
  }
}

window.initHomePage = initHomePage;
window.homePlayBuccaneersJingle = homePlayBuccaneersJingle;
// back-compat alias
window.homePlayPirateJingle = homePlayBuccaneersJingle;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    renderHomeCards();
    renderHomeHighlights();
    bindHomeCards();
    homeSyncSoundButton();
    if (homeSoundEnabled()) void homePrefetchMotto().catch(() => {});
  });
} else {
  renderHomeCards();
  renderHomeHighlights();
  bindHomeCards();
  homeSyncSoundButton();
  if (homeSoundEnabled()) void homePrefetchMotto().catch(() => {});
}
