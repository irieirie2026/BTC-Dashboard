/**
 * Misc → Calendar — BTC return seasonality heatmaps.
 * Months × years, ISO weeks × years, day-of-week × years.
 * Data: /api/stats/btc-history (prefers liquid Bitstamp sample).
 */

const CAL_API = "/api/stats/btc-history";
const CAL_MIN_SAMPLE = 500;
const CAL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CAL_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** JS getUTCDay: 0=Sun … 6=Sat → index in CAL_DOW */
const CAL_DOW_FROM_JS = [6, 0, 1, 2, 3, 4, 5];

let calReady = false;
let calLoading = false;
let calData = null;
let calError = null;
let calTipBound = false;

function calEl(id) {
  return document.getElementById(id);
}

/** Rich floating tooltip (HTML). Prefer over native title for long explanations. */
function calTipShow(html, clientX, clientY) {
  const tip = calEl("cal-tip");
  if (!tip || !html) return;
  tip.innerHTML = html;
  tip.hidden = false;
  const margin = 12;
  const w = tip.offsetWidth || 240;
  const h = tip.offsetHeight || 80;
  let left = clientX + 14;
  let top = clientY + 14;
  if (left + w > window.innerWidth - margin) left = clientX - w - 10;
  if (top + h > window.innerHeight - margin) top = clientY - h - 10;
  tip.style.left = `${Math.max(margin, left)}px`;
  tip.style.top = `${Math.max(margin, top)}px`;
}

function calTipHide() {
  const tip = calEl("cal-tip");
  if (tip) tip.hidden = true;
}

function calTipHtml(title, rows) {
  const body = (rows || [])
    .filter((r) => r && r.v != null && r.v !== "")
    .map(
      (r) =>
        `<div class="cal-tip-row"><span class="cal-tip-k">${calEscape(r.k)}</span><span class="cal-tip-v mono">${calEscape(String(r.v))}</span></div>`,
    )
    .join("");
  const note = rows?.find((r) => r?.note)?.note;
  return (
    `<p class="cal-tip-title">${calEscape(title)}</p>${body}` +
    (note ? `<p class="cal-tip-note">${calEscape(note)}</p>` : "")
  );
}

function calBindTips() {
  if (calTipBound) return;
  calTipBound = true;
  const screen = document.querySelector('#dashboard-misc .menu-screen[data-l2="calendar"]');
  if (!screen) return;

  screen.addEventListener(
    "pointerover",
    (e) => {
      const el = e.target.closest("[data-cal-tip]");
      if (!el) return;
      const raw = el.getAttribute("data-cal-tip");
      if (!raw) return;
      try {
        const payload = JSON.parse(raw);
        calTipShow(calTipHtml(payload.t, payload.r), e.clientX, e.clientY);
      } catch {
        calTipShow(`<p class="cal-tip-title">${calEscape(raw)}</p>`, e.clientX, e.clientY);
      }
    },
    true,
  );
  screen.addEventListener(
    "pointermove",
    (e) => {
      const tip = calEl("cal-tip");
      if (!tip || tip.hidden) return;
      if (!e.target.closest("[data-cal-tip]")) return;
      calTipShow(tip.innerHTML, e.clientX, e.clientY);
    },
    true,
  );
  screen.addEventListener(
    "pointerout",
    (e) => {
      const el = e.target.closest("[data-cal-tip]");
      if (!el) return;
      const rel = e.relatedTarget;
      if (rel && el.contains(rel)) return;
      if (rel && rel.closest?.("[data-cal-tip]")) return;
      calTipHide();
    },
    true,
  );
  screen.addEventListener("scroll", calTipHide, true);
}

function calTipAttr(title, rows) {
  return calEscape(JSON.stringify({ t: title, r: rows }));
}

function calEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function calFmtPct(r, d = 1) {
  if (r == null || !Number.isFinite(Number(r))) return "—";
  const n = Number(r) * 100;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(d)}%`;
}

function calCompound(rets) {
  let acc = 1;
  for (const r of rets) {
    if (r == null || !Number.isFinite(r)) continue;
    acc *= 1 + r;
  }
  return acc - 1;
}

function calMean(arr) {
  const v = arr.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function calMedian(arr) {
  const v = arr.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : 0.5 * (v[mid - 1] + v[mid]);
}

/** Share of observations with return > 0. */
function calHitRate(arr) {
  const v = arr.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  return v.filter((r) => r > 0).length / v.length;
}

/** ISO week number + ISO week-year (UTC). */
function calIsoWeek(ms) {
  const d = new Date(ms);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date - yearStart) / 86_400_000 + 1) / 7);
  return { year: isoYear, week: Math.min(53, Math.max(1, week)) };
}

/**
 * Diverging red/green fill. maxAbs in return units (e.g. 0.25 = 25%).
 * Neutral near zero; stronger |return| → stronger color.
 */
function calHeatStyle(ret, maxAbs) {
  if (ret == null || !Number.isFinite(ret)) {
    return { background: "transparent", color: "#64748b" };
  }
  const cap = maxAbs > 1e-9 ? maxAbs : 0.1;
  const t = Math.min(1, Math.abs(ret) / cap);
  const alpha = 0.1 + t * 0.78;
  if (ret > 0) {
    return {
      background: `rgba(14, 203, 129, ${alpha.toFixed(3)})`,
      color: t > 0.55 ? "#ecfdf5" : "#a7f3d0",
    };
  }
  if (ret < 0) {
    return {
      background: `rgba(246, 70, 93, ${alpha.toFixed(3)})`,
      color: t > 0.55 ? "#fff1f2" : "#fecdd3",
    };
  }
  return { background: "rgba(148, 163, 184, 0.12)", color: "#94a3b8" };
}

function calSelectDays(rawDays) {
  if (!rawDays?.length) return { days: [], label: "—" };
  const bitstamp = rawDays.filter((d) => d.source === "bitstamp");
  if (bitstamp.length >= CAL_MIN_SAMPLE) {
    return { days: bitstamp, label: "Bitstamp daily (liquid)" };
  }
  const observed = rawDays.filter((d) => d.source && d.source !== "interpolated");
  if (observed.length >= CAL_MIN_SAMPLE) {
    return { days: observed, label: "Observed closes" };
  }
  return { days: rawDays, label: "Full stitched history" };
}

/**
 * Build daily simple returns aligned to each day (from previous close).
 * days[i] has return from days[i-1].close → days[i].close
 */
function calDailyReturns(days) {
  const out = [];
  for (let i = 1; i < days.length; i++) {
    const prev = Number(days[i - 1].close);
    const cur = Number(days[i].close);
    if (!(prev > 0) || !(cur > 0)) continue;
    const dt = new Date(days[i].date);
    const iso = calIsoWeek(days[i].date);
    out.push({
      date: days[i].date,
      y: dt.getUTCFullYear(),
      m: dt.getUTCMonth(), // 0-11
      dow: CAL_DOW_FROM_JS[dt.getUTCDay()],
      isoYear: iso.year,
      isoWeek: iso.week,
      ret: cur / prev - 1,
      close: cur,
    });
  }
  return out;
}

function calBuildMatrix(daily) {
  // --- Monthly: year × month (0-11) ---
  const monthBuckets = new Map(); // `${y}-${m}` → rets[]
  // --- Weekly: isoYear × week ---
  const weekBuckets = new Map();
  // --- DOW: year × dow ---
  const dowBuckets = new Map();

  for (const d of daily) {
    const mk = `${d.y}-${d.m}`;
    if (!monthBuckets.has(mk)) monthBuckets.set(mk, []);
    monthBuckets.get(mk).push(d.ret);

    const wk = `${d.isoYear}-${d.isoWeek}`;
    if (!weekBuckets.has(wk)) weekBuckets.set(wk, []);
    weekBuckets.get(wk).push(d.ret);

    const dk = `${d.y}-${d.dow}`;
    if (!dowBuckets.has(dk)) dowBuckets.set(dk, []);
    dowBuckets.get(dk).push(d.ret);
  }

  const monthYears = [...new Set(daily.map((d) => d.y))].sort((a, b) => b - a);
  const weekYears = [...new Set(daily.map((d) => d.isoYear))].sort((a, b) => b - a);
  const dowYears = [...new Set(daily.map((d) => d.y))].sort((a, b) => b - a);

  const months = monthYears.map((y) => {
    const cells = CAL_MONTHS.map((_, m) => {
      const rets = monthBuckets.get(`${y}-${m}`);
      if (!rets?.length) return null;
      return { ret: calCompound(rets), n: rets.length };
    });
    return { year: y, cells };
  });

  const maxWeek = Math.max(52, ...daily.map((d) => d.isoWeek), 52);
  const weekCols = Array.from({ length: maxWeek }, (_, i) => i + 1);
  const weeks = weekYears.map((y) => {
    const cells = weekCols.map((w) => {
      const rets = weekBuckets.get(`${y}-${w}`);
      if (!rets?.length) return null;
      return { ret: calCompound(rets), n: rets.length };
    });
    return { year: y, cells };
  });

  const dows = dowYears.map((y) => {
    const cells = CAL_DOW.map((_, dow) => {
      const rets = dowBuckets.get(`${y}-${dow}`);
      if (!rets?.length) return null;
      return { ret: calMean(rets), n: rets.length, total: calCompound(rets) };
    });
    return { year: y, cells };
  });

  // Column stats (across years) for summary rows + seasonality profile
  const monthCols = CAL_MONTHS.map((_, m) => {
    const vals = months.map((row) => row.cells[m]?.ret).filter((x) => x != null && Number.isFinite(x));
    return {
      avg: calMean(vals),
      median: calMedian(vals),
      hit: calHitRate(vals),
      n: vals.length,
      vals,
    };
  });
  const weekColStats = weekCols.map((w, wi) => {
    const vals = weeks.map((row) => row.cells[wi]?.ret).filter((x) => x != null && Number.isFinite(x));
    return {
      week: w,
      avg: calMean(vals),
      median: calMedian(vals),
      hit: calHitRate(vals),
      n: vals.length,
      vals,
    };
  });
  const monthAvg = monthCols.map((c) => c.avg);
  const monthMedian = monthCols.map((c) => c.median);
  const monthHit = monthCols.map((c) => c.hit);
  const monthN = monthCols.map((c) => c.n);
  const weekAvg = weekColStats.map((c) => c.avg);
  const weekMedian = weekColStats.map((c) => c.median);
  const weekHit = weekColStats.map((c) => c.hit);
  const weekN = weekColStats.map((c) => c.n);

  const dowAvg = CAL_DOW.map((_, di) => {
    const vals = dows.map((row) => row.cells[di]?.ret).filter((x) => x != null);
    return calMean(vals);
  });
  const dowHit = CAL_DOW.map((_, di) => {
    const all = [];
    for (const d of daily) {
      if (d.dow === di) all.push(d.ret);
    }
    return calHitRate(all);
  });
  const dowN = CAL_DOW.map((_, di) => daily.filter((d) => d.dow === di).length);

  // Scale maxAbs per table (percentile-ish: use 95th of abs values, floor)
  function scale(vals) {
    const abs = vals.filter((v) => v != null && Number.isFinite(v)).map(Math.abs).sort((a, b) => a - b);
    if (!abs.length) return 0.1;
    const p = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.92))];
    return Math.max(p, 0.02);
  }

  const monthScale = scale(months.flatMap((r) => r.cells.map((c) => c?.ret)));
  const weekScale = scale(weeks.flatMap((r) => r.cells.map((c) => c?.ret)));
  const dowScale = scale(dows.flatMap((r) => r.cells.map((c) => c?.ret)).concat(dowAvg));

  // Seasonality leaders
  let bestMonth = null;
  let worstMonth = null;
  monthAvg.forEach((r, i) => {
    if (r == null) return;
    if (bestMonth == null || r > bestMonth.ret) {
      bestMonth = { label: CAL_MONTHS[i], ret: r, hit: monthHit[i], median: monthMedian[i], n: monthN[i] };
    }
    if (worstMonth == null || r < worstMonth.ret) {
      worstMonth = { label: CAL_MONTHS[i], ret: r, hit: monthHit[i], median: monthMedian[i], n: monthN[i] };
    }
  });
  let bestDow = null;
  let worstDow = null;
  dowAvg.forEach((r, i) => {
    if (r == null) return;
    if (bestDow == null || r > bestDow.ret) bestDow = { label: CAL_DOW[i], ret: r, hit: dowHit[i] };
    if (worstDow == null || r < worstDow.ret) worstDow = { label: CAL_DOW[i], ret: r, hit: dowHit[i] };
  });
  let bestWeek = null;
  let worstWeek = null;
  weekAvg.forEach((r, i) => {
    if (r == null) return;
    if (bestWeek == null || r > bestWeek.ret) {
      bestWeek = {
        label: `W${weekCols[i]}`,
        ret: r,
        hit: weekHit[i],
        median: weekMedian[i],
        n: weekN[i],
      };
    }
    if (worstWeek == null || r < worstWeek.ret) {
      worstWeek = {
        label: `W${weekCols[i]}`,
        ret: r,
        hit: weekHit[i],
        median: weekMedian[i],
        n: weekN[i],
      };
    }
  });

  // Ranked week seasonality (for chips)
  const weekRanked = weekColStats
    .filter((c) => c.avg != null && c.n >= 3)
    .slice()
    .sort((a, b) => b.avg - a.avg);

  // Quarter seasonality (from monthly compounds averaged)
  const quarters = [
    { id: "Q1", months: [0, 1, 2], label: "Q1 (Jan–Mar)" },
    { id: "Q2", months: [3, 4, 5], label: "Q2 (Apr–Jun)" },
    { id: "Q3", months: [6, 7, 8], label: "Q3 (Jul–Sep)" },
    { id: "Q4", months: [9, 10, 11], label: "Q4 (Oct–Dec)" },
  ].map((q) => {
    // Per-year quarter return = compound of the three monthly returns when all present
    const yearRets = months
      .map((row) => {
        const parts = q.months.map((m) => row.cells[m]?.ret);
        if (parts.some((p) => p == null)) return null;
        return calCompound(parts);
      })
      .filter((x) => x != null);
    return {
      ...q,
      avg: calMean(yearRets),
      median: calMedian(yearRets),
      hit: calHitRate(yearRets),
      n: yearRets.length,
    };
  });

  // Half-year: H1 / H2 from monthly
  const halves = [
    { id: "H1", months: [0, 1, 2, 3, 4, 5], label: "H1 (Jan–Jun)" },
    { id: "H2", months: [6, 7, 8, 9, 10, 11], label: "H2 (Jul–Dec)" },
  ].map((h) => {
    const yearRets = months
      .map((row) => {
        const parts = h.months.map((m) => row.cells[m]?.ret);
        if (parts.filter((p) => p != null).length < 4) return null;
        return calCompound(parts.filter((p) => p != null));
      })
      .filter((x) => x != null);
    return {
      ...h,
      avg: calMean(yearRets),
      median: calMedian(yearRets),
      hit: calHitRate(yearRets),
      n: yearRets.length,
    };
  });

  return {
    months,
    weeks,
    weekCols,
    dows,
    monthAvg,
    monthMedian,
    monthHit,
    monthN,
    monthCols,
    weekAvg,
    weekMedian,
    weekHit,
    weekN,
    weekColStats,
    weekRanked,
    quarters,
    halves,
    dowAvg,
    dowHit,
    dowN,
    monthScale,
    weekScale,
    dowScale,
    bestMonth,
    worstMonth,
    bestDow,
    worstDow,
    bestWeek,
    worstWeek,
    nDays: daily.length,
    start: daily[0]?.date,
    end: daily[daily.length - 1]?.date,
  };
}

function calRenderHeatTable({
  hostId,
  corner,
  colLabels,
  rows,
  avgRow,
  scale,
  cellFmt = (c) => (c ? calFmtPct(c.ret, 1) : "—"),
  avgFmt = (r) => calFmtPct(r, 2),
  /** (year, colLabel, cell) => { t, r: [{k,v,note?}] } */
  tipPayload = null,
  avgLabel = "Avg",
  avgHelpKey = "cal-row-avg",
  compact = false,
  /** Extra summary rows: [{ label, values, fmt, scale, cls, helpKey, tipFor }] */
  extraRows = [],
  periodKind = "period",
}) {
  const host = calEl(hostId);
  if (!host) return;

  const head = colLabels
    .map((lab) => {
      const tip = calTipAttr(String(lab), [
        { k: "Column", v: String(lab) },
        {
          k: "Read as",
          v: periodKind === "weekday"
            ? "Weekday in each year row"
            : periodKind === "week"
              ? "ISO week of year"
              : "Calendar month",
        },
        {
          note:
            periodKind === "weekday"
              ? "Cell values average daily returns on this weekday within the year."
              : "Cell values compound daily returns inside this period for the year.",
        },
      ]);
      return `<th class="cal-th-col" data-cal-tip="${tip}">${calEscape(String(lab))}</th>`;
    })
    .join("");

  const body = rows
    .map((row) => {
      const tds = row.cells
        .map((cell, i) => {
          const ret = cell?.ret;
          const st = calHeatStyle(ret, scale);
          const payload =
            typeof tipPayload === "function"
              ? tipPayload(row.year, colLabels[i], cell)
              : {
                  t: `${colLabels[i]} ${row.year}`,
                  r: cell
                    ? [
                        { k: "Return", v: calFmtPct(cell.ret, 2) },
                        { k: "Days", v: cell.n },
                      ]
                    : [{ k: "Data", v: "No sample" }],
                };
          const tip = calTipAttr(payload.t, payload.r);
          const cls = compact ? "cal-cell cal-cell--compact" : "cal-cell";
          return `<td class="${cls}" style="background:${st.background};color:${st.color}" data-cal-tip="${tip}">${cellFmt(cell)}</td>`;
        })
        .join("");
      const yearTip = calTipAttr(`Year ${row.year}`, [
        { k: "Row", v: String(row.year) },
        {
          note:
            periodKind === "week"
              ? "ISO week-year (may differ from calendar year near 1 Jan)."
              : "Calendar year of the period.",
        },
      ]);
      return `<tr><th class="cal-th-row" scope="row" data-cal-tip="${yearTip}">${row.year}</th>${tds}</tr>`;
    })
    .join("");

  const summaryRows = [];
  if (avgRow) {
    summaryRows.push({
      label: avgLabel,
      helpKey: avgHelpKey,
      values: avgRow,
      fmt: avgFmt,
      useScale: scale,
      cls: "cal-row-avg",
      tipKind: "avg",
    });
  }
  for (const er of extraRows) {
    summaryRows.push({
      label: er.label,
      helpKey: er.helpKey,
      values: er.values,
      fmt: er.fmt || avgFmt,
      useScale: er.heat === false ? null : er.scale != null ? er.scale : scale,
      cls: er.cls || "cal-row-sum",
      heat: er.heat !== false,
      tipKind: er.tipKind || "value",
    });
  }

  const sumHtml = summaryRows
    .map((sr) => {
      const tds = sr.values
        .map((r, i) => {
          const col = colLabels[i];
          let tipRows;
          if (sr.tipKind === "hit") {
            tipRows = [
              { k: "Win rate", v: r == null ? "—" : `${(Number(r) * 100).toFixed(1)}%` },
              { k: "Period", v: String(col) },
              {
                note: "Share of years in which this period’s return was strictly positive.",
              },
            ];
          } else if (sr.tipKind === "med") {
            tipRows = [
              { k: "Median", v: sr.fmt(r) },
              { k: "Period", v: String(col) },
              {
                note: "Median across years — less sensitive to outlier years than Avg.",
              },
            ];
          } else {
            tipRows = [
              { k: "Average", v: sr.fmt(r) },
              { k: "Period", v: String(col) },
              {
                note: "Equal-weight average of yearly values for this column (years with data only).",
              },
            ];
          }
          const tip = calTipAttr(`${sr.label} · ${col}`, tipRows);
          if (sr.heat === false || sr.useScale == null) {
            return `<td class="cal-cell cal-cell--sum" data-cal-tip="${tip}">${sr.fmt(r)}</td>`;
          }
          if (sr.cls?.includes("cal-row-hit") && r != null) {
            const t = Math.min(1, Math.max(0, (Number(r) - 0.35) / 0.35));
            const bg = `rgba(14, 203, 129, ${(0.08 + t * 0.7).toFixed(3)})`;
            const color = t > 0.45 ? "#ecfdf5" : "#a7f3d0";
            return `<td class="cal-cell cal-cell--sum" style="background:${bg};color:${color}" data-cal-tip="${tip}">${sr.fmt(r)}</td>`;
          }
          const st = calHeatStyle(r, sr.useScale);
          return `<td class="cal-cell cal-cell--sum" style="background:${st.background};color:${st.color}" data-cal-tip="${tip}">${sr.fmt(r)}</td>`;
        })
        .join("");
      const labHelp = sr.helpKey
        ? ` data-help-key="${calEscape(sr.helpKey)}"`
        : "";
      return `<tr class="${sr.cls}"><th class="cal-th-row" scope="row"${labHelp}>${calEscape(sr.label)}</th>${tds}</tr>`;
    })
    .join("");

  host.innerHTML = `
    <div class="cal-table-scroll">
      <table class="cal-heat-table${compact ? " cal-heat-table--compact" : ""}">
        <thead>
          <tr>
            <th class="cal-th-corner">${calEscape(corner)}</th>
            ${head}
          </tr>
        </thead>
        <tbody>
          ${body}
          ${sumHtml}
        </tbody>
      </table>
    </div>`;
}

/**
 * Generic seasonality bar strip (month or weekday style).
 * items: [{ label, avg, hit, n, median? }]
 */
function calRenderSeasonBars(hostId, items, opts = {}) {
  const host = calEl(hostId);
  if (!host || !items?.length) return;
  const {
    note = "",
    compact = false,
    valueDigits = 1,
    hitLabel = "%↑ yrs",
    hitIsYears = true,
    kindLabel = "Period",
  } = opts;
  const maxAbs = Math.max(...items.map((it) => (it.avg != null ? Math.abs(it.avg) : 0)), 1e-6);
  const gridClass = compact ? "cal-season-bar-row cal-season-bar-row--compact" : "cal-season-bar-row";
  host.innerHTML = `
    <div class="${gridClass}" style="${compact ? `--cal-n:${items.length}` : ""}">
      ${items
        .map((it) => {
          const r = it.avg;
          const h = r != null ? Math.max(6, (Math.abs(r) / maxAbs) * 100) : 0;
          const up = r != null && r >= 0;
          const hit =
            it.hit != null ? `${(it.hit * 100).toFixed(0)}%` : "—";
          const tip = calTipAttr(`${kindLabel}: ${it.label}`, [
            { k: "Average return", v: calFmtPct(r, valueDigits + 1) },
            {
              k: "Median",
              v: it.median != null ? calFmtPct(it.median, valueDigits + 1) : "—",
            },
            {
              k: hitIsYears ? "Win rate (years green)" : "Up-day rate",
              v: it.hit != null ? `${(it.hit * 100).toFixed(1)}%` : "—",
            },
            { k: hitIsYears ? "Years with data" : "Days in sample", v: it.n ?? "—" },
            {
              note: hitIsYears
                ? "Bar height scales with |average return| across years (equal weight)."
                : "Bar height scales with |average daily return| over the full sample.",
            },
          ]);
          return `
          <div class="cal-season-bar-col" data-cal-tip="${tip}">
            <div class="cal-season-bar-track">
              <div class="cal-season-bar-fill ${up ? "cal-season-bar-fill--up" : "cal-season-bar-fill--down"}" style="height:${h}%"></div>
            </div>
            <span class="cal-season-bar-val mono">${calFmtPct(r, valueDigits)}</span>
            <span class="cal-season-bar-lab">${calEscape(it.label)}</span>
            <span class="cal-season-bar-hit mono">${hit}${compact ? "" : " " + hitLabel}</span>
          </div>`;
        })
        .join("")}
    </div>
    ${note ? `<p class="cal-season-bar-note">${note}</p>` : ""}`;
}

function calRenderMonthSeasonality(mx) {
  const items = CAL_MONTHS.map((lab, i) => ({
    label: lab,
    avg: mx.monthAvg[i],
    median: mx.monthMedian[i],
    hit: mx.monthHit[i],
    n: mx.monthN[i],
  }));
  calRenderSeasonBars("cal-month-bars", items, {
    valueDigits: 1,
    hitLabel: "yrs↑",
    kindLabel: "Month",
    note:
      "Seasonality profile: average monthly return across years (equal weight). % = share of years that month finished green. Hover a bar for median and n.",
  });

  const chips = calEl("cal-month-chips");
  if (chips) {
    const qHtml = (mx.quarters || [])
      .map((q) => {
        const up = q.avg != null && q.avg >= 0;
        const tip = calTipAttr(q.label || q.id, [
          { k: "Average", v: calFmtPct(q.avg, 2) },
          { k: "Median", v: calFmtPct(q.median, 2) },
          { k: "Win rate", v: q.hit != null ? `${(q.hit * 100).toFixed(1)}% of years` : "—" },
          { k: "Years", v: q.n },
          {
            note: "Each year compounds that quarter’s monthly returns, then years are averaged.",
          },
        ]);
        return `<span class="cal-chip ${up ? "cal-chip--up" : "cal-chip--down"}" data-cal-tip="${tip}">
          <strong>${calEscape(q.id)}</strong>
          <span class="mono">${calFmtPct(q.avg, 1)}</span>
          <span class="cal-chip-sub">${q.hit != null ? `${(q.hit * 100).toFixed(0)}%↑` : "—"} · med ${calFmtPct(q.median, 1)}</span>
        </span>`;
      })
      .join("");
    const hHtml = (mx.halves || [])
      .map((h) => {
        const up = h.avg != null && h.avg >= 0;
        const tip = calTipAttr(h.label || h.id, [
          { k: "Average", v: calFmtPct(h.avg, 2) },
          { k: "Median", v: calFmtPct(h.median, 2) },
          { k: "Win rate", v: h.hit != null ? `${(h.hit * 100).toFixed(1)}% of years` : "—" },
          { k: "Years", v: h.n },
          {
            note: "H1 = Jan–Jun, H2 = Jul–Dec. Compounds available months in the half each year.",
          },
        ]);
        return `<span class="cal-chip cal-chip--half ${up ? "cal-chip--up" : "cal-chip--down"}" data-cal-tip="${tip}">
          <strong>${calEscape(h.id)}</strong>
          <span class="mono">${calFmtPct(h.avg, 1)}</span>
          <span class="cal-chip-sub">${h.hit != null ? `${(h.hit * 100).toFixed(0)}%↑` : "—"}</span>
        </span>`;
      })
      .join("");
    chips.innerHTML = `
      <div class="cal-chip-row">
        <span class="cal-chip-label" data-help-key="cal-month-quarters">Quarter seasonality</span>
        ${qHtml}
      </div>
      <div class="cal-chip-row">
        <span class="cal-chip-label" data-help-key="cal-month-halves">Half-year</span>
        ${hHtml}
      </div>`;
  }
}

function calRenderWeekSeasonality(mx) {
  const items = (mx.weekColStats || []).map((c) => ({
    label: String(c.week),
    avg: c.avg,
    median: c.median,
    hit: c.hit,
    n: c.n,
  }));
  calRenderSeasonBars("cal-week-bars", items, {
    compact: true,
    valueDigits: 1,
    hitLabel: "",
    kindLabel: "ISO week",
    note:
      "ISO-week seasonality: average weekly return across years. Bar height = |avg|; % under each week = share of years that week was positive. Hover for median and n. Scroll if needed.",
  });

  const rank = calEl("cal-week-rank");
  if (rank && mx.weekRanked?.length) {
    const top = mx.weekRanked.slice(0, 6);
    const bot = mx.weekRanked.slice(-6).reverse();
    const chip = (c, kind) => {
      const tip = calTipAttr(`ISO week ${c.week}`, [
        { k: "Rank", v: kind === "up" ? "Among strongest" : "Among weakest" },
        { k: "Average return", v: calFmtPct(c.avg, 2) },
        { k: "Median", v: calFmtPct(c.median, 2) },
        { k: "Win rate", v: c.hit != null ? `${(c.hit * 100).toFixed(1)}% of years` : "—" },
        { k: "Years", v: c.n },
        {
          note: "Ranked by multi-year average weekly return (min years of data applied).",
        },
      ]);
      return `<span class="cal-chip ${kind === "up" ? "cal-chip--up" : "cal-chip--down"}" data-cal-tip="${tip}">
        <strong>W${c.week}</strong>
        <span class="mono">${calFmtPct(c.avg, 1)}</span>
        <span class="cal-chip-sub">${c.hit != null ? `${(c.hit * 100).toFixed(0)}%↑` : "—"} · med ${calFmtPct(c.median, 1)}</span>
      </span>`;
    };
    rank.innerHTML = `
      <div class="cal-chip-row">
        <span class="cal-chip-label" data-help-key="cal-week-rank">Strongest weeks</span>
        ${top.map((c) => chip(c, "up")).join("")}
      </div>
      <div class="cal-chip-row">
        <span class="cal-chip-label" data-help-key="cal-week-rank">Weakest weeks</span>
        ${bot.map((c) => chip(c, "down")).join("")}
      </div>`;
  }
}

function calRenderHeroes(mx, meta) {
  const strip = calEl("cal-heroes");
  if (!strip) return;
  const items = [
    {
      label: "Sample",
      helpKey: "cal-sample",
      value: mx.nDays ? `${mx.nDays.toLocaleString()} days` : "—",
      sub: meta?.label || "BTC/USD daily",
      tip: calTipAttr("Sample", [
        { k: "Daily returns", v: mx.nDays?.toLocaleString() ?? "—" },
        { k: "Source", v: meta?.label || "BTC/USD" },
        {
          k: "Range",
          v:
            mx.start && mx.end
              ? `${new Date(mx.start).toISOString().slice(0, 10)} → ${new Date(mx.end).toISOString().slice(0, 10)}`
              : "—",
        },
        { note: "Liquid Bitstamp preferred when the sample is long enough." },
      ]),
    },
    {
      label: "Best avg month",
      helpKey: "cal-best-month",
      value: mx.bestMonth ? calFmtPct(mx.bestMonth.ret, 1) : "—",
      sub: mx.bestMonth?.label || "—",
      pos: true,
      tip: calTipAttr("Best average month", [
        { k: "Month", v: mx.bestMonth?.label ?? "—" },
        { k: "Avg return", v: mx.bestMonth ? calFmtPct(mx.bestMonth.ret, 2) : "—" },
        {
          k: "Win rate",
          v:
            mx.bestMonth?.hit != null
              ? `${(mx.bestMonth.hit * 100).toFixed(0)}% of years`
              : "—",
        },
        { note: "Highest equal-weight average monthly return across years." },
      ]),
    },
    {
      label: "Worst avg month",
      helpKey: "cal-worst-month",
      value: mx.worstMonth ? calFmtPct(mx.worstMonth.ret, 1) : "—",
      sub: mx.worstMonth?.label || "—",
      pos: false,
      tip: calTipAttr("Worst average month", [
        { k: "Month", v: mx.worstMonth?.label ?? "—" },
        { k: "Avg return", v: mx.worstMonth ? calFmtPct(mx.worstMonth.ret, 2) : "—" },
        {
          k: "Win rate",
          v:
            mx.worstMonth?.hit != null
              ? `${(mx.worstMonth.hit * 100).toFixed(0)}% of years`
              : "—",
        },
      ]),
    },
    {
      label: "Best avg weekday",
      helpKey: "cal-best-dow",
      value: mx.bestDow ? calFmtPct(mx.bestDow.ret, 2) : "—",
      sub: mx.bestDow
        ? `${mx.bestDow.label}${mx.bestDow.hit != null ? ` · hit ${(mx.bestDow.hit * 100).toFixed(0)}%` : ""}`
        : "—",
      pos: true,
      tip: calTipAttr("Best average weekday", [
        { k: "Weekday", v: mx.bestDow?.label ?? "—" },
        { k: "Avg daily return", v: mx.bestDow ? calFmtPct(mx.bestDow.ret, 3) : "—" },
        {
          k: "Up-day rate",
          v: mx.bestDow?.hit != null ? `${(mx.bestDow.hit * 100).toFixed(1)}%` : "—",
        },
        { note: "Full-sample average of daily simple returns on this weekday." },
      ]),
    },
    {
      label: "Worst avg weekday",
      helpKey: "cal-worst-dow",
      value: mx.worstDow ? calFmtPct(mx.worstDow.ret, 2) : "—",
      sub: mx.worstDow?.label || "—",
      pos: false,
      tip: calTipAttr("Worst average weekday", [
        { k: "Weekday", v: mx.worstDow?.label ?? "—" },
        { k: "Avg daily return", v: mx.worstDow ? calFmtPct(mx.worstDow.ret, 3) : "—" },
      ]),
    },
    {
      label: "Best avg ISO week",
      helpKey: "cal-best-week",
      value: mx.bestWeek ? calFmtPct(mx.bestWeek.ret, 1) : "—",
      sub: mx.bestWeek?.label || "—",
      pos: true,
      tip: calTipAttr("Best average ISO week", [
        { k: "Week", v: mx.bestWeek?.label ?? "—" },
        { k: "Avg return", v: mx.bestWeek ? calFmtPct(mx.bestWeek.ret, 2) : "—" },
        {
          k: "Win rate",
          v:
            mx.bestWeek?.hit != null
              ? `${(mx.bestWeek.hit * 100).toFixed(0)}% of years`
              : "—",
        },
        { note: "ISO week-of-year with highest multi-year average weekly return." },
      ]),
    },
  ];
  strip.innerHTML = items
    .map(
      (h) => `
    <article class="deriv-hero-block cal-hero-block" ${h.tip ? `data-cal-tip="${h.tip}"` : ""}>
      <span class="deriv-hero-label"${h.helpKey ? ` data-help-key="${h.helpKey}"` : ""}>${calEscape(h.label)}</span>
      <span class="deriv-hero-value"${h.pos === true ? ' style="color:#0ecb81"' : h.pos === false ? ' style="color:#f6465d"' : ""}>${calEscape(h.value)}</span>
      <span class="deriv-hero-sub">${calEscape(h.sub)}</span>
    </article>`,
    )
    .join("");
}

function calRenderDowBars(mx) {
  const items = CAL_DOW.map((lab, i) => ({
    label: lab,
    avg: mx.dowAvg[i],
    hit: mx.dowHit[i],
    n: mx.dowN[i],
  }));
  calRenderSeasonBars("cal-dow-bars", items, {
    valueDigits: 2,
    hitLabel: "days↑",
    hitIsYears: false,
    kindLabel: "Weekday",
    note:
      "Bars = average daily simple return by weekday (full sample). %↑ = share of days with positive return. Hover for exact values and n.",
  });
  // DOW uses 7 columns — mark host for CSS grid
  const host = calEl("cal-dow-bars");
  if (host) {
    const row = host.querySelector(".cal-season-bar-row");
    if (row) row.classList.add("cal-dow-bar-row");
  }
}

function calRenderLegend() {
  const host = calEl("cal-legend");
  if (!host) return;
  const tip = calTipAttr("Color scale", [
    { k: "Green", v: "Positive return" },
    { k: "Red", v: "Negative return" },
    { k: "Intensity", v: "Larger |return| → stronger color" },
    {
      note: "Scale uses ≈92nd percentile of |cells| inside each table, so months and weeks are not forced to the same absolute scale.",
    },
  ]);
  host.innerHTML = `
    <div class="cal-legend-scale" data-cal-tip="${tip}">
      <span class="cal-legend-label" data-help-key="cal-legend">Return color</span>
      <span class="cal-legend-swatch cal-legend-swatch--neg-hi">−</span>
      <span class="cal-legend-swatch cal-legend-swatch--neg-lo"></span>
      <span class="cal-legend-swatch cal-legend-swatch--zero">0</span>
      <span class="cal-legend-swatch cal-legend-swatch--pos-lo"></span>
      <span class="cal-legend-swatch cal-legend-swatch--pos-hi">+</span>
      <span class="cal-legend-hint">Hover cells/bars for exact values. Intensity scales with |return| within each table (≈92nd pct of |cell|).</span>
    </div>`;
}

function calRenderCommentary(mx, meta) {
  const host = calEl("cal-commentary");
  if (!host || !mx) return;
  const fmtD = (ms) =>
    ms
      ? new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
      : "—";
  const lines = [];
  lines.push(
    `Sample: <strong>${mx.nDays.toLocaleString()}</strong> daily returns (${calEscape(meta?.label || "BTC")}), ` +
      `${fmtD(mx.start)} → ${fmtD(mx.end)} UTC.`,
  );
  if (mx.bestMonth && mx.worstMonth) {
    lines.push(
      `Monthly seasonality: strongest average month is <strong>${calEscape(mx.bestMonth.label)}</strong> ` +
        `(${calFmtPct(mx.bestMonth.ret, 1)}` +
        `${mx.bestMonth.hit != null ? `, ${(mx.bestMonth.hit * 100).toFixed(0)}% of years green` : ""}), ` +
        `weakest is <strong>${calEscape(mx.worstMonth.label)}</strong> ` +
        `(${calFmtPct(mx.worstMonth.ret, 1)}` +
        `${mx.worstMonth.hit != null ? `, ${(mx.worstMonth.hit * 100).toFixed(0)}% green` : ""}). ` +
        `Bars, median row, and win-rate row summarize the multi-year profile.`,
    );
  }
  if (mx.quarters?.length) {
    const qBits = mx.quarters
      .filter((q) => q.avg != null)
      .map((q) => `${q.id} ${calFmtPct(q.avg, 1)} (${q.hit != null ? (q.hit * 100).toFixed(0) + "%↑" : "—"})`)
      .join(" · ");
    if (qBits) lines.push(`Quarter seasonality (avg of yearly Q compounds): ${qBits}.`);
  }
  if (mx.bestWeek && mx.worstWeek) {
    lines.push(
      `Weekly seasonality: best average ISO week is <strong>${calEscape(mx.bestWeek.label)}</strong> ` +
        `(${calFmtPct(mx.bestWeek.ret, 1)}` +
        `${mx.bestWeek.hit != null ? `, ${(mx.bestWeek.hit * 100).toFixed(0)}% of years green` : ""}), ` +
        `worst is <strong>${calEscape(mx.worstWeek.label)}</strong> ` +
        `(${calFmtPct(mx.worstWeek.ret, 1)}). ` +
        `See the week bar strip and strongest/weakest chips above the heatmap.`,
    );
  }
  if (mx.bestDow && mx.worstDow) {
    lines.push(
      `By <strong>weekday</strong>, average daily return is highest on <strong>${calEscape(mx.bestDow.label)}</strong> ` +
        `(${calFmtPct(mx.bestDow.ret, 3)}) and lowest on <strong>${calEscape(mx.worstDow.label)}</strong> ` +
        `(${calFmtPct(mx.worstDow.ret, 3)}). Crypto trades 24/7 — weekend cells are real, not holiday gaps.`,
    );
  }
  lines.push(
    `Caveats: historical seasonality is not a trading edge by itself — regimes change, sample lengths differ by cell, ` +
      `and large outliers (e.g. 2011–2013) dominate early years. Prefer <strong>Avg / Med / Win%</strong> rows and multi-year patterns over single red/green cells.`,
  );
  host.innerHTML = lines.map((p) => `<p>${p}</p>`).join("");
}

function calRenderAll(bundle) {
  const { matrix: mx, meta } = bundle;
  calRenderHeroes(mx, meta);
  calRenderLegend();

  calRenderMonthSeasonality(mx);
  calRenderHeatTable({
    hostId: "cal-month-table",
    corner: "Year",
    colLabels: CAL_MONTHS,
    rows: mx.months,
    avgRow: mx.monthAvg,
    scale: mx.monthScale,
    periodKind: "month",
    cellFmt: (c) => (c ? calFmtPct(c.ret, 1) : "—"),
    avgFmt: (r) => calFmtPct(r, 1),
    tipPayload: (y, mon, cell) => ({
      t: `${mon} ${y}`,
      r: cell
        ? [
            { k: "Compounded return", v: calFmtPct(cell.ret, 2) },
            { k: "Trading days", v: cell.n },
            {
              note: "Product of daily simple returns in this calendar month (close-to-close).",
            },
          ]
        : [{ k: "Data", v: "No sample for this month-year" }],
    }),
    extraRows: [
      {
        label: "Med",
        helpKey: "cal-row-med",
        values: mx.monthMedian,
        fmt: (r) => calFmtPct(r, 1),
        cls: "cal-row-sum cal-row-med",
        tipKind: "med",
      },
      {
        label: "Win%",
        helpKey: "cal-row-win",
        values: mx.monthHit,
        fmt: (r) => (r == null ? "—" : `${(r * 100).toFixed(0)}%`),
        cls: "cal-row-sum cal-row-hit",
        heat: true,
        tipKind: "hit",
      },
    ],
  });

  calRenderWeekSeasonality(mx);
  calRenderHeatTable({
    hostId: "cal-week-table",
    corner: "Year",
    colLabels: mx.weekCols.map((w) => String(w)),
    rows: mx.weeks,
    avgRow: mx.weekAvg,
    scale: mx.weekScale,
    periodKind: "week",
    compact: true,
    cellFmt: (c) => {
      if (!c) return "";
      const p = c.ret * 100;
      if (Math.abs(p) >= 10) return p.toFixed(0);
      return p.toFixed(1);
    },
    avgFmt: (r) => (r == null ? "" : (r * 100).toFixed(1)),
    tipPayload: (y, w, cell) => ({
      t: `ISO W${w} · ${y}`,
      r: cell
        ? [
            { k: "Compounded return", v: calFmtPct(cell.ret, 2) },
            { k: "Days in week", v: cell.n },
            {
              note: "ISO week (Mon-based). Row year is ISO week-year near 1 Jan.",
            },
          ]
        : [{ k: "Data", v: "No sample for this ISO week" }],
    }),
    extraRows: [
      {
        label: "Med",
        helpKey: "cal-row-med",
        values: mx.weekMedian,
        fmt: (r) => (r == null ? "" : (r * 100).toFixed(1)),
        cls: "cal-row-sum cal-row-med",
        tipKind: "med",
      },
      {
        label: "Win%",
        helpKey: "cal-row-win",
        values: mx.weekHit,
        fmt: (r) => (r == null ? "" : `${(r * 100).toFixed(0)}`),
        cls: "cal-row-sum cal-row-hit",
        heat: true,
        tipKind: "hit",
      },
    ],
  });

  calRenderDowBars(mx);
  calRenderHeatTable({
    hostId: "cal-dow-table",
    corner: "Year",
    colLabels: CAL_DOW,
    rows: mx.dows,
    avgRow: mx.dowAvg,
    scale: mx.dowScale,
    periodKind: "weekday",
    cellFmt: (c) => (c ? calFmtPct(c.ret, 2) : "—"),
    avgFmt: (r) => calFmtPct(r, 3),
    tipPayload: (y, dow, cell) => ({
      t: `${dow} · ${y}`,
      r: cell
        ? [
            { k: "Avg daily return", v: calFmtPct(cell.ret, 3) },
            { k: "Days (n)", v: cell.n },
            { k: "Year compound (same days)", v: calFmtPct(cell.total, 1) },
            {
              note: "Average of daily simple returns on this weekday within the year — not a full-year compound of all days.",
            },
          ]
        : [{ k: "Data", v: "No sample" }],
    }),
  });

  calRenderCommentary(mx, meta);

  const metaEl = calEl("cal-meta");
  if (metaEl) {
    metaEl.textContent = [
      meta?.label,
      mx.nDays ? `${mx.nDays} days` : "",
      meta?.source || "",
      meta?.stale ? "stale cache" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const screen = document.querySelector('#dashboard-misc .menu-screen[data-l2="calendar"]');
  // Re-bind help on freshly rendered labels (Avg/Med/Win%, chips, heroes)
  if (screen) {
    screen.querySelectorAll("[data-help-key]").forEach((el) => {
      if (el.classList.contains("help-trigger")) return;
      el.dataset.helpDecorated = "false";
    });
    window.decorateHelpLabels?.(screen);
  }
}

function calSetStatus({ loading, error }) {
  const loadEl = calEl("cal-loading");
  const errEl = calEl("cal-error");
  if (loadEl) loadEl.hidden = !loading;
  if (errEl) {
    if (error) {
      errEl.hidden = false;
      errEl.textContent = error;
    } else {
      errEl.hidden = true;
      errEl.textContent = "";
    }
  }
}

async function calFetch(force = false) {
  if (calLoading) return;
  if (calData && !force) {
    calRenderAll(calData);
    calSetStatus({ loading: false, error: null });
    return;
  }
  calLoading = true;
  calSetStatus({ loading: true, error: null });
  try {
    const res = await fetch(CAL_API + (force ? "?refresh=1" : ""), {
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
    if (!payload.days?.length) throw new Error("No daily history returned");

    const rawDays = payload.days.map((d) => ({
      date: d.date,
      close: Number(d.close),
      source: d.source || "",
    }));
    const selected = calSelectDays(rawDays);
    if (selected.days.length < 60) {
      throw new Error("Not enough daily closes for calendar seasonality");
    }
    const daily = calDailyReturns(selected.days);
    const matrix = calBuildMatrix(daily);
    calData = {
      matrix,
      meta: {
        label: selected.label,
        source: payload.source || "BTC history",
        stale: !!payload.stale,
        pair: payload.pair || "BTC/USD",
      },
    };
    calError = null;
    calRenderAll(calData);
    calSetStatus({ loading: false, error: null });
  } catch (err) {
    console.error("[misc calendar]", err);
    calError = err.message || String(err);
    calSetStatus({ loading: false, error: calError });
  } finally {
    calLoading = false;
  }
}

function initMiscCalendar() {
  const screen = document.querySelector('#dashboard-misc .menu-screen[data-l2="calendar"]');
  if (!screen) return;
  if (!calReady) {
    calReady = true;
    calEl("cal-refresh")?.addEventListener("click", () => calFetch(true));
    calBindTips();
  }
  calFetch(false);
}

window.initMiscCalendar = initMiscCalendar;
