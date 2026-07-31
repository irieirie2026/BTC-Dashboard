/** Home — Buccaneers command deck: section cards, highlights, deck jingle + voice. */

const HOME_SOUND_KEY = "btc-home-buccaneers-sound:v1";
const HOME_SOUND_KEY_LEGACY = "btc-home-pirate-sound:v1";
const HOME_JINGLE_COOLDOWN_MS = 12_000;
const HOME_MOTTO =
  "Fuck the system, and don't forget to stack satoshis.";

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
  if (!on) homeStopSpeech();
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
let homeMottoObjectUrl = null;

function homeStopSpeech() {
  try {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  } catch (_) {}
  try {
    if (homeMottoAudio) {
      homeMottoAudio.pause();
      homeMottoAudio.src = "";
      homeMottoAudio = null;
    }
    if (homeMottoObjectUrl) {
      URL.revokeObjectURL(homeMottoObjectUrl);
      homeMottoObjectUrl = null;
    }
  } catch (_) {}
}

/** Prefer a deeper English male voice when the OS exposes one (browser fallback). */
function homePickVoice() {
  try {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    if (!voices.length) return null;
    const score = (v) => {
      let s = 0;
      const name = `${v.name} ${v.lang}`.toLowerCase();
      if (/en[-_]?(us|gb|au|ie|nz)/i.test(v.lang) || name.includes("english")) s += 4;
      if (/en/i.test(v.lang)) s += 2;
      if (/daniel|fred|alex|male|david|james|george|thomas|bruce|rishi|arthur|aaron/i.test(name))
        s += 3;
      if (/female|samantha|karen|moira|zira|susan|victoria|siri/i.test(name)) s -= 2;
      if (v.default) s += 1;
      return s;
    };
    return [...voices].sort((a, b) => score(b) - score(a))[0] || null;
  } catch (_) {
    return null;
  }
}

function homeSpeakMottoBrowser() {
  if (!homeSoundEnabled()) return;
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;

  const speak = () => {
    if (!homeSoundEnabled()) return;
    const u = new SpeechSynthesisUtterance(HOME_MOTTO);
    u.lang = "en-US";
    u.rate = 1.05; // fluid
    u.pitch = 0.88;
    u.volume = 1;
    const voice = homePickVoice();
    if (voice) u.voice = voice;
    try {
      synth.speak(u);
    } catch (_) {}
  };

  const run = () => setTimeout(speak, 280);
  if ((synth.getVoices?.() || []).length) run();
  else {
    const once = () => {
      synth.removeEventListener("voiceschanged", once);
      run();
    };
    synth.addEventListener("voiceschanged", once);
    setTimeout(run, 500);
  }
}

/** Grok TTS via server (xAI) — falls back to browser SpeechSynthesis. */
async function homeSpeakMotto() {
  if (!homeSoundEnabled()) return;
  homeStopSpeech();

  try {
    const res = await fetch(`/api/home/motto-tts?_=${Date.now()}`);
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok || ctype.includes("application/json")) {
      throw new Error("tts json/error");
    }
    const blob = await res.blob();
    if (!blob || blob.size < 100) throw new Error("empty audio");
    if (homeMottoObjectUrl) URL.revokeObjectURL(homeMottoObjectUrl);
    homeMottoObjectUrl = URL.createObjectURL(blob);
    const audio = new Audio(homeMottoObjectUrl);
    homeMottoAudio = audio;
    audio.volume = 1;
    // Start shortly after jingle kicks in
    await new Promise((r) => setTimeout(r, 380));
    if (!homeSoundEnabled()) return;
    await audio.play();
  } catch (_) {
    homeSpeakMottoBrowser();
  }
}

/**
 * Original short Buccaneers deck fanfare (not a copyrighted tune).
 * Brass-ish square waves + light drum hits + Grok TTS motto.
 */
function homePlayBuccaneersJingle({ force = false } = {}) {
  if (!force && !homeSoundEnabled()) return;
  const now = Date.now();
  if (!force && now - homeJingleLastPlay < HOME_JINGLE_COOLDOWN_MS) return;
  homeJingleLastPlay = Date.now();

  homeSpeakMotto();

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
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(0.18, t0 + 0.06);
      master.gain.setValueAtTime(0.14, t0 + 2.6);
      master.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.5);
      master.connect(ctx.destination);

      // Low drone (ship hull)
      const drone = ctx.createOscillator();
      const droneG = ctx.createGain();
      drone.type = "triangle";
      drone.frequency.setValueAtTime(73.42, t0); // D2
      droneG.gain.setValueAtTime(0.055, t0);
      droneG.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
      drone.connect(droneG);
      droneG.connect(master);
      drone.start(t0);
      drone.stop(t0 + 3.3);

      // Melody — original minor “yo-ho” flourish (D minor-ish)
      const notes = [
        { f: 293.66, t: 0.0, d: 0.22 },
        { f: 440.0, t: 0.2, d: 0.2 },
        { f: 587.33, t: 0.38, d: 0.28 },
        { f: 523.25, t: 0.66, d: 0.18 },
        { f: 440.0, t: 0.84, d: 0.18 },
        { f: 349.23, t: 1.02, d: 0.22 },
        { f: 392.0, t: 1.24, d: 0.18 },
        { f: 440.0, t: 1.42, d: 0.28 },
        { f: 587.33, t: 1.78, d: 0.45 },
        { f: 440.0, t: 2.28, d: 0.35 },
        { f: 293.66, t: 2.7, d: 0.55 },
      ];

      for (const n of notes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(n.f, t0 + n.t);
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(n.f * 1.003, t0 + n.t);
        g2.gain.value = 0.35;

        const at = t0 + n.t;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.11, at + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, at + n.d);

        osc.connect(g);
        osc2.connect(g2);
        g2.connect(g);
        g.connect(master);
        osc.start(at);
        osc.stop(at + n.d + 0.02);
        osc2.start(at);
        osc2.stop(at + n.d + 0.02);
      }

      // Cannon / drum thump (noise burst)
      const thumps = [0.05, 1.75, 2.65];
      for (const tt of thumps) {
        const len = Math.floor(ctx.sampleRate * 0.12);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const ng = ctx.createGain();
        const filt = ctx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 420;
        ng.gain.setValueAtTime(0.22, t0 + tt);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + tt + 0.14);
        src.connect(filt);
        filt.connect(ng);
        ng.connect(master);
        src.start(t0 + tt);
      }
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
  });
} else {
  renderHomeCards();
  renderHomeHighlights();
  bindHomeCards();
  homeSyncSoundButton();
}
