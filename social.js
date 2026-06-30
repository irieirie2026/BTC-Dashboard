/** BTC Social — LunarCrush (when subscribed) + Santiment/Fear&Greed fallback via /api/social/btc */

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
  if (!points?.length) return '<span class="social-spark-empty">No trend data</span>';
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

function socialOfflinePayload(errMsg) {
  return {
    updatedAt: new Date().toISOString(),
    source: "offline",
    mockOnly: true,
    dataMode: "offline",
    errors: [errMsg],
    heroes: [
      { name: "Social Health", value: "—", sub: "API unreachable" },
      { name: "Social Volume", value: "—", sub: "—" },
      { name: "Fear & Greed", value: "—", sub: "—" },
      { name: "7d Momentum", value: "—", sub: "—" },
    ],
    sentiment: { bullishPct: null, bearishPct: null, trendArrow: "→", trendLabel: "—" },
    metrics: {},
    momentum: { label: "7d social volume", changePct: null, sparkline: [] },
    influencers: [],
    influencersNote: "Could not reach /api/social/btc — check deployment and refresh.",
    commentary: [`Social API unreachable: ${errMsg}`],
  };
}

async function socialFetch(refresh = false) {
  const params = new URLSearchParams({ _: String(Date.now()) });
  if (refresh) params.set("refresh", "1");
  const res = await fetch(`${SOCIAL_API}?${params}`);
  const data = await res.json().catch(() => null);
  if (data && typeof data === "object" && (res.ok || data.heroes || data.metrics)) {
    return data;
  }
  const msg = data?.error || `Social API ${res.status}`;
  throw new Error(msg);
}

function socialRenderHeroes() {
  const strip = socialEl("social-heroes");
  if (!strip) return;
  const heroes = socialData?.heroes || [];
  if (!heroes.length) {
    strip.innerHTML = "";
    return;
  }
  strip.innerHTML = heroes
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
  if (bull) bull.textContent = s.bullishPct != null ? `${Number(s.bullishPct).toFixed(1)}%` : "—";
  if (bear) bear.textContent = s.bearishPct != null ? `${Number(s.bearishPct).toFixed(1)}%` : "—";
  if (arrow) {
    arrow.textContent = s.trendArrow || "→";
    arrow.className =
      "social-sentiment-arrow " + (s.trendArrow === "↑" ? "positive" : s.trendArrow === "↓" ? "negative" : "");
  }
  if (label) label.textContent = s.trendLabel || "—";
}

function socialRenderMetrics() {
  const m = socialData?.metrics || {};
  const fallback = socialData?.dataMode === "fallback";
  const set = (id, val) => {
    const el = socialEl(id);
    if (el) el.textContent = val;
  };
  set("social-metric-galaxy", m.galaxyScore != null ? Number(m.galaxyScore).toFixed(0) : "—");
  set("social-metric-altrank", m.altRank != null ? `#${m.altRank}` : "—");
  set("social-metric-volume", socialFmtNum(m.socialVolume));
  const volChg = socialEl("social-metric-volume-chg");
  if (volChg) {
    volChg.textContent = socialFmtPct(m.socialVolume24hChangePct);
    volChg.className = "social-metric-delta mono " + socialChangeClass(m.socialVolume24hChangePct);
  }
  set("social-metric-dominance", m.socialDominancePct != null ? `${Number(m.socialDominancePct).toFixed(1)}%` : "—");
  set("social-metric-mentions", socialFmtNum(m.mentions24h));
  set("social-metric-creators", socialFmtNum(m.activeCreators));

  const galaxySub = document.querySelector('[data-l2="social"] .social-card[data-help-key="social-galaxy"] .social-card__sub');
  if (galaxySub && fallback) {
    galaxySub.textContent = "Proxy score (Fear & Greed + volume) — LunarCrush for official Galaxy Score";
  }
  const domSub = document.querySelector('[data-l2="social"] .social-card[data-help-key="social-dominance"] .social-card__sub');
  if (domSub && fallback && m.socialDominancePct == null) {
    domSub.textContent = "Requires LunarCrush Individual plan";
  }
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
  const note = socialEl("social-influencers-note");
  if (!tbody) return;
  const rows = socialData?.influencers || [];
  const infNote = socialData?.influencersNote;

  if (note) {
    if (infNote && !rows.length) {
      note.hidden = false;
      note.textContent = infNote;
    } else {
      note.hidden = true;
      note.textContent = "";
    }
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr class="social-influencer-empty"><td colspan="5">${infNote || "No influencer data available."}</td></tr>`;
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
        <td class="mono">${inf.posts != null ? Number(inf.posts).toFixed(0) : "—"}</td>
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
  const mode = socialData?.dataMode === "fallback" ? " · Santiment fallback" : "";
  const updated = socialData?.updatedAt
    ? new Date(socialData.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "—";
  meta.textContent = `BTC Social · ${src}${mode} · updated ${updated}`;
}

function socialRenderStatus() {
  const loading = socialEl("social-loading");
  const errBox = socialEl("social-error");
  if (loading) loading.hidden = !socialLoading;
  if (errBox) {
    const errs = socialData?.errors || [];
    const showErr = socialError || (errs.length > 0 && socialData?.dataMode === "fallback");
    errBox.hidden = !showErr;
    if (showErr) {
      const parts = [];
      if (socialError) parts.push(socialError);
      if (errs.length) parts.push(...errs.slice(0, 2));
      errBox.textContent = parts.join(" · ");
    }
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
    socialError =
      socialData.mockOnly && socialData.source === "mock"
        ? socialData.errors?.join(" · ") || "Showing seeded mock data"
        : null;
    if (socialData.errors?.length && socialData.dataMode === "fallback") {
      socialError = null;
    }
  } catch (err) {
    socialError = err.message || String(err);
    if (!socialData || socialData.source === "offline") {
      socialData = socialOfflinePayload(socialError);
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