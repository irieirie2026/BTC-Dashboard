/** Misc Metrics — free public APIs via /api/misc/metrics */

const MM_POLL_MS = 300_000;
const MM_API = "/api/misc/metrics";

const MM_HELP_KEYS = {
  "btc-dominance": "mm-btc-dominance",
  "fear-greed": "mm-fear-greed",
  "mayer-multiple": "mm-mayer-multiple",
  "puell-multiple": "mm-puell-multiple",
  "nvt-ratio": "mm-nvt-ratio",
  hashprice: "mm-hashprice",
  "mempool-pressure": "mm-mempool-pressure",
  "dom-fg-composite": "mm-dom-fg-composite",
};

let mmReady = false;
let mmPollTimer = null;
let mmData = null;
let mmLoading = false;
let mmError = null;

function mmEl(id) {
  return document.getElementById(id);
}

function mmFmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function mmSparklineSvg(points, width = 120, height = 36, color) {
  if (!points?.length) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 0.01;
  const coords = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * width;
    const y = height - ((p - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trend =
    color ||
    (points[points.length - 1] >= points[0] ? "#0ecb81" : "#f6465d");
  return `<svg class="mm-spark" width="${width}" height="${height}" aria-hidden="true" viewBox="0 0 ${width} ${height}"><polyline fill="none" stroke="${trend}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(" ")}"/></svg>`;
}

function mmFmtSubChange(pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${Number(pct).toFixed(2)}%`;
}

function mmRenderHeroes(data) {
  const strip = mmEl("mm-heroes");
  if (!strip) return;
  const heroes = data?.heroes || [];
  strip.innerHTML = heroes
    .map(
      (h) => `
      <article class="deriv-hero-block mm-hero-block">
        <span class="deriv-hero-label">${h.name}</span>
        <span class="deriv-hero-value"${h.color ? ` style="color:${h.color}"` : ""}>${h.value}</span>
        <span class="deriv-hero-sub">${h.sub || ""}</span>
      </article>`,
    )
    .join("");
}

function mmMetricCard(m) {
  const helpKey = MM_HELP_KEYS[m.id] || "";
  const titleAttr = helpKey ? ` data-help-key="${helpKey}"` : "";
  const valueStyle = m.color ? ` style="color:${m.color}"` : "";
  const spark = m.sparkline?.length ? mmSparklineSvg(m.sparkline, 120, 36, m.color) : "";
  let subHtml = "";
  if (typeof m.sub === "number") {
    const pct = mmFmtSubChange(m.sub);
    subHtml = `<p class="mm-card__sub"><span class="mm-card__change${m.sub >= 0 ? " positive" : " negative"}">${pct}</span>${m.subLabel ? ` <span class="mm-card__sub-label">${m.subLabel}</span>` : ""}</p>`;
  } else if (m.sub != null && m.sub !== "") {
    subHtml = `<p class="mm-card__sub">${m.sub}${m.subLabel ? ` <span class="mm-card__sub-label">${m.subLabel}</span>` : ""}</p>`;
  }

  return `
  <article class="mm-card" data-mm-id="${m.id}">
    <div class="mm-card__head">
      <h3 class="mm-card__title"${titleAttr}>${m.title}</h3>
      ${spark ? `<div class="mm-card__spark">${spark}</div>` : ""}
    </div>
    <p class="mm-card__value"${valueStyle}>${m.value}</p>
    ${subHtml}
    <p class="mm-card__desc">${m.description || ""}</p>
    <footer class="mm-card__foot">
      <span class="mm-card__source">${m.source || ""}</span>
      <time class="mm-card__time" datetime="${m.updatedAt || ""}">${mmFmtTime(m.updatedAt)}</time>
    </footer>
  </article>`;
}

function mmRenderGrid(data) {
  const grid = mmEl("mm-grid");
  if (!grid) return;
  const metrics = data?.metrics || [];
  if (!metrics.length) {
    grid.innerHTML = '<p class="mm-empty">No metrics available.</p>';
    return;
  }
  grid.innerHTML = metrics.map(mmMetricCard).join("");
}

function mmRenderAbout(data) {
  const body = mmEl("mm-about-body");
  if (!body) return;
  const lines = data?.about || [];
  if (!lines.length) {
    body.innerHTML = "<p>Context notes unavailable.</p>";
    return;
  }
  body.innerHTML = `<ul class="mm-about-list">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
}

function mmRenderMeta(data) {
  const meta = mmEl("mm-meta");
  if (!meta) return;
  const parts = [];
  if (data?.updatedAt) parts.push(`Updated ${mmFmtTime(data.updatedAt)}`);
  if (data?.fromCache) parts.push("cached");
  if (data?.source === "live+partial") parts.push("partial data");
  meta.textContent = parts.join(" · ") || "—";
}

function mmSetLoading(on) {
  const loading = mmEl("mm-loading");
  const grid = mmEl("mm-grid");
  if (loading) loading.hidden = !on;
  if (grid && on) grid.innerHTML = "";
}

function mmSetError(msg) {
  const err = mmEl("mm-error");
  if (!err) return;
  if (msg) {
    err.hidden = false;
    err.textContent = msg;
  } else {
    err.hidden = true;
    err.textContent = "";
  }
}

async function mmFetchMetrics(refresh = false) {
  if (mmLoading) return mmData;
  mmLoading = true;
  mmSetError(null);
  if (!mmData) mmSetLoading(true);

  try {
    const url = refresh ? `${MM_API}?refresh=1` : MM_API;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    mmData = json;
    mmRenderHeroes(json);
    mmRenderGrid(json);
    mmRenderAbout(json);
    mmRenderMeta(json);
    if (json.errors?.length) {
      mmSetError(`Some sources failed: ${json.errors.slice(0, 2).join("; ")}`);
    }
    return json;
  } catch (err) {
    mmError = err;
    mmSetError(`Failed to load metrics — ${err.message || "try again"}`);
    if (!mmData) {
      const heroes = mmEl("mm-heroes");
      const grid = mmEl("mm-grid");
      if (heroes) heroes.innerHTML = "";
      if (grid) grid.innerHTML = '<p class="mm-empty">Unable to load metrics.</p>';
    }
    throw err;
  } finally {
    mmLoading = false;
    mmSetLoading(false);
  }
}

function mmStartPoll() {
  if (mmPollTimer) clearInterval(mmPollTimer);
  mmPollTimer = setInterval(() => mmFetchMetrics(false).catch(() => {}), MM_POLL_MS);
}

function mmBindControls() {
  const btn = document.querySelector(".mm-refresh-btn");
  if (!btn || btn.dataset.mmBound) return;
  btn.dataset.mmBound = "1";
  btn.addEventListener("click", () => {
    mmFetchMetrics(true).catch(() => {});
  });
}

function initMiscMetrics() {
  if (!mmReady) {
    mmReady = true;
    mmBindControls();
    mmStartPoll();
  }
  mmFetchMetrics(false)
    .then(() => {
      window.decorateHelpLabels?.(
        document.querySelector('#dashboard-misc .menu-screen[data-l2="metrics"]'),
      );
    })
    .catch(() => {});
}

window.initMiscMetrics = initMiscMetrics;