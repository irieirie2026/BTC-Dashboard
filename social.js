/** BTC Social — LunarCrush via /api/social/btc (10 min cache server-side) */

const SOCIAL_POLL_MS = 600_000;
const SOCIAL_API = "/api/social/btc";

let socialReady = false;
let socialPollTimer = null;
let socialData = null;
let socialLoading = false;
let socialError = null;

const socialEl = (id) => document.getElementById(id);

function socialFmtPct(n, d = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return prefix + Number(n).toFixed(d) + "%";
}

function socialFmtNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
}

function socialChangeClass(n) {
  if (n == null || Number.isNaN(n)) return "";
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "";
}

function socialSparklineSvg(points, width = 120, height = 32) {
  if (!points?.length) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * width;
    const y = height - ((p - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trend = points[points.length - 1] >= points[0] ? "#0ecb81" : "#f6465d";
  return `<svg class="social-spark" width="${width}" height="${height}" aria-hidden="true"><polyline fill="none" stroke="${trend}" stroke-width="2" points="${coords.join(" ")}"/></svg>`;
}

function socialMockPayload() {
  return {
    updatedAt: new Date().toISOString(),
    source: "client-mock",
    mockOnly: true,
    errors: [],
    heroes: [
      { name: "Galaxy Score", value: "72", sub: "Social health" },
      { name: "AltRank", value: "#4", sub: "Lower is better" },
      { name: "Social Volume", value: "1.24M", sub: "+8.4% 24h" },
      { name: "Dominance", value: "38.2%", sub: "Crypto social share" },
    ],
    sentiment: { bullishPct: 64, bearishPct: 36, trendArrow: "↑", trendLabel: "Improving" },
    metrics: {
      galaxyScore: 72,
      altRank: 4,
      socialVolume: 1240000,
      socialVolume24hChangePct: 8.4,
      socialDominancePct: 38.2,
      mentions24h: 89200,
      activeCreators: 4210,
    },
    momentum: { label: "7d social volume", changePct: 12.6, sparkline: [42, 44.5, 41.2, 46.8, 48.1, 45, 49.3, 51] },
    influencers: [
      { rank: 1, name: "PlanB", handle: "100trillionUSD", engagements: 284000, posts: 12, followers: 1900000, platform: "x" },
      { rank: 2, name: "Michael Saylor", handle: "saylor", engagements: 256000, posts: 8, followers: 4200000, platform: "x" },
    ],
    commentary: ["Client mock — deploy API for live LunarCrush feed."],
  };
}

async function socialFetch(refresh = false) {
  const params = new URLSearchParams({ _: String(Date.now()) });
  if (refresh) params.set("refresh", "1");
  try {
    const res = await fetch(`${SOCIAL_API}?${params}`);
    if (res.ok) return res.json();
    const err = await res.json().catch(() => ({}));
    const msg = err.error || `Social API ${res.status}`;
    if (res.status === 404 || /unknown api route/i.test(msg)) return socialMockPayload();
    throw new Error(msg);
  } catch (err) {
    if (err instanceof TypeError || /failed to fetch/i.test(err.message || "")) return socialMockPayload();
    throw err;
  }
}

function socialRenderHeroes() {
  const strip = socialEl("social-heroes");
  if (!strip) return;
  strip.innerHTML = (socialData?.heroes || [])
    .map(
      (h) => `
      <article class="deriv-hero-block social-hero-block">
        <span class="deriv-hero-label">${h.name}</span>
        <span class="deriv-hero-value">${h.value ?? "—"}</span>
        <span class="deriv-hero-sub">${h.sub || ""}</span>
      </article>`,
    )
    .join("");
}

function socialRenderSentiment() {
  const s = socialData?.sentiment || {};
  const bull = socialEl("social-sentiment-bull");
  const bear = socialEl("social-sentiment-bear");
  const arrow = socialEl("social-sentiment-trend");
  const label = socialEl("social-sentiment-label");
  if (bull) bull.textContent = s.bullishPct != null ? `${s.bullishPct.toFixed(1)}%` : "—";
  if (bear) bear.textContent = s.bearishPct != null ? `${s.bearishPct.toFixed(1)}%` : "—";
  if (arrow) {
    arrow.textContent = s.trendArrow || "→";
    arrow.className = "social-sentiment-arrow " + (s.trendArrow === "↑" ? "positive" : s.trendArrow === "↓" ? "negative" : "");
  }
  if (label) label.textContent = s.trendLabel || "—";
}

function socialRenderMetrics() {
  const m = socialData?.metrics || {};
  const set = (id, val) => {
    const el = socialEl(id);
    if (el) el.textContent = val;
  };
  set("social-metric-galaxy", m.galaxyScore != null ? m.galaxyScore.toFixed(0) : "—");
  set("social-metric-altrank", m.altRank != null ? `#${m.altRank}` : "—");
  set("social-metric-volume", socialFmtNum(m.socialVolume));
  const volChg = socialEl("social-metric-volume-chg");
  if (volChg) {
    volChg.textContent = socialFmtPct(m.socialVolume24hChangePct);
    volChg.className = "social-metric-delta mono " + socialChangeClass(m.socialVolume24hChangePct);
  }
  set("social-metric-dominance", m.socialDominancePct != null ? `${m.socialDominancePct.toFixed(1)}%` : "—");
  set("social-metric-mentions", socialFmtNum(m.mentions24h));
  set("social-metric-creators", socialFmtNum(m.activeCreators));
}

function socialRenderMomentum() {
  const mom = socialData?.momentum || {};
  const spark = socialEl("social-momentum-spark");
  const chg = socialEl("social-momentum-chg");
  if (spark) spark.innerHTML = socialSparklineSvg(mom.sparkline, 200, 40);
  if (chg) {
    chg.textContent = mom.changePct != null ? socialFmtPct(mom.changePct) + " vs week start" : "—";
    chg.className = "social-momentum-chg mono " + socialChangeClass(mom.changePct);
  }
}

function socialRenderInfluencers() {
  const tbody = socialEl("social-influencers-body");
  if (!tbody) return;
  const rows = socialData?.influencers || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5">No influencer data available.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((inf) => {
      const tip = [
        inf.handle ? `@${inf.handle}` : null,
        inf.followers != null ? `${socialFmtNum(inf.followers)} followers` : null,
        inf.platform ? `Platform: ${inf.platform}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const name = inf.url
        ? `<a href="${inf.url}" target="_blank" rel="noopener noreferrer" title="${tip}">${inf.name}</a>`
        : `<span title="${tip}">${inf.name}</span>`;
      return `<tr class="social-influencer-row">
        <td class="mono">#${inf.rank}</td>
        <td>${name}</td>
        <td class="mono">${socialFmtNum(inf.engagements)}</td>
        <td class="mono">${inf.posts != null ? inf.posts.toFixed(0) : "—"}</td>
        <td class="mono">${socialFmtNum(inf.followers)}</td>
      </tr>`;
    })
    .join("");
}

function socialRenderCommentary() {
  const box = socialEl("social-commentary");
  if (!box) return;
  const lines = socialData?.commentary || [];
  box.innerHTML = lines.map((p) => `<p>${p}</p>`).join("") || "<p>Loading commentary…</p>";
}

function socialRenderMeta() {
  const meta = socialEl("social-meta");
  if (!meta) return;
  if (socialLoading) {
    meta.textContent = "Loading BTC social metrics…";
    return;
  }
  const src = socialData?.source || "—";
  const updated = socialData?.updatedAt
    ? new Date(socialData.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "—";
  const err = socialError ? " · fallback" : "";
  meta.textContent = `BTC Social · ${src} · updated ${updated}${err}`;
}

function socialRenderStatus() {
  const loading = socialEl("social-loading");
  const errBox = socialEl("social-error");
  if (loading) loading.hidden = !socialLoading;
  if (errBox) {
    errBox.hidden = !socialError;
    if (socialError) errBox.textContent = socialError;
  }
}

function socialRenderAll() {
  socialRenderHeroes();
  socialRenderSentiment();
  socialRenderMetrics();
  socialRenderMomentum();
  socialRenderInfluencers();
  socialRenderCommentary();
  socialRenderMeta();
  socialRenderStatus();
}

async function socialLoad({ refresh = false, silent = false } = {}) {
  if (!silent) {
    socialLoading = true;
    socialRenderStatus();
    socialRenderMeta();
  }
  try {
    socialData = await socialFetch(refresh);
    socialError = socialData.errors?.length ? socialData.errors.join(" · ") : null;
  } catch (err) {
    socialError = err.message || String(err);
    if (!socialData) {
      socialData = socialMockPayload();
      socialError = `${socialError} — showing offline mock data`;
    }
  } finally {
    socialLoading = false;
    socialRenderAll();
  }
}

function socialStartPoll() {
  socialStopPoll();
  socialPollTimer = setInterval(() => socialLoad({ refresh: true, silent: true }), SOCIAL_POLL_MS);
}

function socialStopPoll() {
  if (socialPollTimer) {
    clearInterval(socialPollTimer);
    socialPollTimer = null;
  }
}

function socialBindEvents() {
  if (socialReady) return;
  socialReady = true;
  document.getElementById("dashboard-market")?.addEventListener("click", (e) => {
    if (e.target.closest(".social-refresh-btn")) socialLoad({ refresh: true });
  });
}

function initSocialSection() {
  socialBindEvents();
  if (!socialData) {
    socialLoad();
    if (!socialPollTimer) socialStartPoll();
  } else {
    socialRenderAll();
  }
}

window.initSocialSection = initSocialSection;

function socialBootstrap() {
  const l1 = localStorage.getItem("btc-menu-l1") || window.MenuController?.l1;
  const l2 = localStorage.getItem("btc-menu-l2") || window.MenuController?.l2;
  if (l1 === "market" && l2 === "social") initSocialSection();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", socialBootstrap);
} else {
  socialBootstrap();
}
window.addEventListener("load", socialBootstrap);