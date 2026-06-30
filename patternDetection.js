/**
 * Classical chart pattern detection — modular, rule-based.
 * Extend by adding detectors to PATTERN_DETECTORS[].
 */

const PATTERN_TYPES = {
  ASCENDING_TRIANGLE: "ascending_triangle",
  DESCENDING_TRIANGLE: "descending_triangle",
  SYMMETRICAL_TRIANGLE: "symmetrical_triangle",
  HEAD_SHOULDERS: "head_shoulders",
  INVERSE_HEAD_SHOULDERS: "inverse_head_shoulders",
  DOUBLE_TOP: "double_top",
  DOUBLE_BOTTOM: "double_bottom",
  BULL_FLAG: "bull_flag",
  BEAR_FLAG: "bear_flag",
  PENNANT: "pennant",
  RISING_WEDGE: "rising_wedge",
  FALLING_WEDGE: "falling_wedge",
  RECTANGLE: "rectangle",
};

const PATTERN_CATALOG = {
  [PATTERN_TYPES.ASCENDING_TRIANGLE]: {
    name: "Ascending Triangle",
    description:
      "Flat resistance with rising support — bullish consolidation. Breakout above resistance targets measured move (triangle height).",
    bullish: true,
    color: "#00ff88",
    chartGuide:
      "Cyan rising support + pink flat resistance converge at the Apex marker. Dashed lines after the apex are ↑/↓ measured-move targets (triangle height projected forward) — not extensions of the triangle sides.",
  },
  [PATTERN_TYPES.DESCENDING_TRIANGLE]: {
    name: "Descending Triangle",
    description:
      "Flat support with falling resistance — bearish consolidation. Breakdown below support targets measured move downward.",
    bullish: false,
    color: "#ff3355",
    chartGuide:
      "Pink falling resistance + cyan flat support meet at Apex. Dashed lines after apex = measured-move targets if price breaks up or down.",
  },
  [PATTERN_TYPES.SYMMETRICAL_TRIANGLE]: {
    name: "Symmetrical Triangle",
    description:
      "Converging highs and lows — compression before directional resolution. Target = widest part of triangle projected from breakout.",
    bullish: null,
    color: "#ffd60a",
    chartGuide:
      "Pink resistance and cyan support converge at Apex. Dashed green/red lines beyond the apex show dual measured-move targets from a breakout — they are projections, not trendline extensions.",
  },
  [PATTERN_TYPES.HEAD_SHOULDERS]: {
    name: "Head & Shoulders",
    description:
      "Three peaks with a higher middle (head) — classic top reversal. Neckline break confirms; target = head-to-neckline distance projected below.",
    bullish: false,
    color: "#ff3355",
    chartGuide:
      "Gold structure lines connect shoulders → head. Magenta = neckline. ▼ TRIGGER marks the neckline breakdown bar. Dashed green/red lines after the trigger are upside/downside measured-move targets (not trend extensions).",
  },
  [PATTERN_TYPES.INVERSE_HEAD_SHOULDERS]: {
    name: "Inverse Head & Shoulders",
    description:
      "Three troughs with a lower middle — classic bottom reversal. Neckline break confirms; target projected above neckline.",
    bullish: true,
    color: "#00ff88",
    chartGuide:
      "Gold structure lines connect troughs → head. Magenta = neckline. ▲ TRIGGER marks neckline breakout. Dashed lines project measured-move targets from the trigger.",
  },
  [PATTERN_TYPES.DOUBLE_TOP]: {
    name: "Double Top",
    description:
      "Two similar highs with an intervening trough — bearish reversal. Break below neckline (middle low) confirms; target = peak-to-neckline height.",
    bullish: false,
    color: "#ff4d6d",
    chartGuide:
      "Gold line links the two peaks (Peak 1 → Peak 2). Magenta = neckline through the middle trough. ▼ TRIGGER = close below neckline. Dashed lines = measured-move targets.",
  },
  [PATTERN_TYPES.DOUBLE_BOTTOM]: {
    name: "Double Bottom",
    description:
      "Two similar lows with an intervening peak — bullish reversal. Break above neckline confirms; target = neckline-to-low height projected up.",
    bullish: true,
    color: "#00e5a0",
    chartGuide:
      "Gold line links the two troughs (Trough 1 → Trough 2). Magenta = neckline through the middle peak. ▲ TRIGGER = close above neckline. Dashed lines = measured-move targets.",
  },
  [PATTERN_TYPES.BULL_FLAG]: {
    name: "Bull Flag",
    description:
      "Sharp rally (pole) followed by downward-sloping consolidation — continuation pattern. Target = pole height added to breakout.",
    bullish: true,
    color: "#00e5a0",
    chartGuide:
      "Blue Pole = sharp impulse rally. Dotted zone = flag consolidation. ▲ TRIGGER = breakout above flag top. Green dashed ↑ = pole height projected from break.",
  },
  [PATTERN_TYPES.BEAR_FLAG]: {
    name: "Bear Flag",
    description:
      "Sharp decline (pole) followed by upward-sloping consolidation — bearish continuation. Target = pole length projected down.",
    bullish: false,
    color: "#ff4d6d",
    chartGuide:
      "Blue Pole = sharp impulse decline. Dotted zone = flag consolidation. ▼ TRIGGER = breakdown below flag bottom. Red dashed ↓ = pole length projected from break.",
  },
  [PATTERN_TYPES.PENNANT]: {
    name: "Pennant",
    description:
      "Strong impulse move then small symmetrical triangle — brief consolidation before trend continuation.",
    bullish: null,
    color: "#ffd60a",
    chartGuide:
      "Blue Pole = impulse move. Pink/cyan lines = converging pennant. Dotted zone = tight consolidation. Dashed ↑/↓ = pole length projected from breakout direction.",
  },
  [PATTERN_TYPES.RISING_WEDGE]: {
    name: "Rising Wedge",
    description:
      "Both support and resistance rise, but converge — often bearish reversal or exhaustion. Breakdown targets wedge base width.",
    bullish: false,
    color: "#ff4d6d",
    chartGuide:
      "Pink = rising resistance. Cyan = rising support. Red fill = wedge body. Open width bracket at left; Apex where lines meet. Primary ↓ target = apex support − opening width.",
  },
  [PATTERN_TYPES.FALLING_WEDGE]: {
    name: "Falling Wedge",
    description:
      "Both trendlines slope down and converge — bullish reversal / continuation. Breakout above the upper (resistance) line targets the opening wedge width projected upward.",
    bullish: true,
    color: "#00ff88",
    chartGuide:
      "Pink = falling resistance (upper). Cyan = falling support (lower). Gold dots = pivot highs/lows. Green fill = wedge body. Opening width at the left; Apex where lines meet. Primary ↑ target = apex resistance + opening width.",
  },
  [PATTERN_TYPES.RECTANGLE]: {
    name: "Rectangle",
    description:
      "Horizontal support and resistance — trading range. Breakout direction sets bias; target = range height projected from break.",
    bullish: null,
    color: "#94c5ff",
    chartGuide:
      "Pink = range resistance (ceiling). Cyan = range support (floor). Dotted zone = trading range. Dashed ↑/↓ = range height projected from breakout.",
  },
};

const CP_LINE_COLORS = {
  support: "#00e5ff",
  resistance: "#ff3d6e",
  neckline: "#ff66ff",
  shoulder: "#ffe600",
  structure: "#ffe600",
  wedge_upper: "#ff5c9a",
  wedge_lower: "#00d4ff",
  wedge_width: "#00ff88",
  pole: "#38bdf8",
  zone: "#94a3b8",
  target: "#a78bfa",
  default: "#e2e8f0",
};

const CP_CHART_GUIDE_DEFAULT =
  "Solid lines = pattern structure. Dashed green/red beyond the apex or trigger = measured-move price targets (projection paths), not continued trendlines.";

const CP_SHORT_NAMES = {
  "Head & Shoulders": "H&S",
  "Inverse Head & Shoulders": "Inv H&S",
  "Ascending Triangle": "Asc Δ",
  "Descending Triangle": "Desc Δ",
  "Symmetrical Triangle": "Sym Δ",
  "Double Top": "Dbl Top",
  "Double Bottom": "Dbl Bot",
  "Rising Wedge": "Rise Wedge",
  "Falling Wedge": "Fall Wedge",
};

function cpBusinessDay(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function cpBarsFromKlines(klines) {
  if (!Array.isArray(klines)) return [];
  return klines.map((k) => ({
    time: cpBusinessDay(k[0]),
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
  }));
}

function cpFlatReg(price) {
  return { slope: 0, intercept: price };
}

function cpIntersectionIdx(regA, regB) {
  const denom = regA.slope - regB.slope;
  if (Math.abs(denom) < 1e-12) return null;
  return (regB.intercept - regA.intercept) / denom;
}

/** Clip pattern drawing to apex / last relevant pivot — never extend past convergence */
function cpDrawEnd(bars, startIdx, endIdx, apexIdx) {
  let drawEnd = endIdx;
  if (apexIdx != null && Number.isFinite(apexIdx)) {
    drawEnd = Math.min(drawEnd, Math.max(startIdx, Math.ceil(apexIdx)));
  }
  return Math.min(Math.max(drawEnd, startIdx), bars.length - 1);
}

/** Extend triangle/wedge trendlines to their intersection (apex) */
function cpApexDrawEnd(bars, startIdx, apexIdx) {
  if (apexIdx == null || !Number.isFinite(apexIdx)) return bars.length - 1;
  const apex = Math.ceil(apexIdx);
  return Math.min(Math.max(apex, startIdx), bars.length - 1);
}

function cpResolveLevel(level, idx, bar) {
  if (level == null) return null;
  return typeof level === "function" ? level(idx, bar) : level;
}

function cpSeg(bars, role, fromIdx, toIdx, priceFrom, priceTo) {
  const a = Math.max(0, Math.min(Math.round(fromIdx), bars.length - 1));
  const b = Math.max(a, Math.min(Math.round(toIdx), bars.length - 1));
  return {
    role,
    color: CP_LINE_COLORS[role] || CP_LINE_COLORS.default,
    from: { time: bars[a].time, price: priceFrom },
    to: { time: bars[b].time, price: priceTo },
  };
}

function cpFindPivots(bars, left = 3, right = 3) {
  const highs = [];
  const lows = [];
  for (let i = left; i < bars.length - right; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
    }
    if (isHigh) highs.push({ idx: i, time: bars[i].time, price: bars[i].high });
    if (isLow) lows.push({ idx: i, time: bars[i].time, price: bars[i].low });
  }
  return { highs, lows };
}

function cpLinReg(points) {
  if (points.length < 2) return { slope: 0, intercept: points[0]?.price ?? 0 };
  const n = points.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sx2 = 0;
  points.forEach((p) => {
    sx += p.idx;
    sy += p.price;
    sxy += p.idx * p.price;
    sx2 += p.idx * p.idx;
  });
  const denom = n * sx2 - sx * sx;
  if (denom === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function cpPriceAt(reg, idx) {
  return reg.slope * idx + reg.intercept;
}

function cpNearPct(a, b, pct = 1.5) {
  const mid = (a + b) / 2;
  return mid > 0 && Math.abs(a - b) / mid <= pct / 100;
}

function cpShortName(name) {
  return CP_SHORT_NAMES[name] || name;
}

function cpIdxAtTime(bars, time) {
  const idx = bars.findIndex((b) => b.time === time);
  return idx >= 0 ? idx : bars.length - 1;
}

function cpMakePattern(type, fields) {
  const meta = PATTERN_CATALOG[type] || { name: type, description: "", color: "#94a3b8" };
  const targetUp = fields.targetUp ?? null;
  const targetDown = fields.targetDown ?? null;
  let targetPrice = fields.targetPrice ?? null;
  if (targetPrice == null) {
    if (meta.bullish === true) targetPrice = targetUp;
    else if (meta.bullish === false) targetPrice = targetDown;
    else targetPrice = targetUp ?? targetDown;
  }

  return {
    id: `${type}-${fields.startIdx}-${fields.endIdx}`,
    type,
    name: meta.name,
    shortName: cpShortName(meta.name),
    description: meta.description,
    color: meta.color,
    bullish: meta.bullish,
    startIdx: fields.startIdx,
    endIdx: fields.endIdx,
    drawEndIdx: fields.drawEndIdx ?? fields.endIdx,
    startTime: fields.startTime,
    endTime: fields.endTime,
    labelTime: fields.labelTime ?? fields.endTime,
    labelPrice: fields.labelPrice ?? null,
    labelPosition: fields.labelPosition ?? "aboveBar",
    status: fields.status || "forming",
    lines: fields.lines || [],
    zone: fields.zone || null,
    breakoutPrice: fields.breakoutPrice ?? null,
    breakoutDirection: fields.breakoutDirection ?? null,
    breakoutIdx: fields.breakoutIdx ?? null,
    targetPrice,
    targetUp,
    targetDown,
    targetUpAnchor: fields.targetUpAnchor ?? null,
    targetDownAnchor: fields.targetDownAnchor ?? null,
    targetUpNote: fields.targetUpNote ?? null,
    targetDownNote: fields.targetDownNote ?? null,
    stopPrice: fields.stopPrice ?? null,
    riskReward: fields.riskReward ?? null,
    failedReason: fields.failedReason ?? null,
    triggerTime: fields.triggerTime ?? null,
    triggerPrice: fields.triggerPrice ?? null,
    apexTime: fields.apexTime ?? null,
    apexPrice: fields.apexPrice ?? null,
    chartGuide: fields.chartGuide ?? meta.chartGuide ?? CP_CHART_GUIDE_DEFAULT,
    projectionNote: fields.projectionNote ?? null,
    wedgeOpenHeight: fields.wedgeOpenHeight ?? null,
    wedgeApexHeight: fields.wedgeApexHeight ?? null,
    wedgeResOpen: fields.wedgeResOpen ?? null,
    wedgeSupOpen: fields.wedgeSupOpen ?? null,
    wedgeResApex: fields.wedgeResApex ?? null,
    wedgeSupApex: fields.wedgeSupApex ?? null,
    wedgeCompressionPct: fields.wedgeCompressionPct ?? null,
    wedgePivotHighs: fields.wedgePivotHighs ?? null,
    wedgePivotLows: fields.wedgePivotLows ?? null,
    primaryTargetDir: fields.primaryTargetDir ?? null,
    markers: fields.markers || [],
  };
}

function cpIsInsidePattern(bars, pattern, idx) {
  const bar = bars[idx];
  if (!bar) return false;

  if (pattern.zone) {
    const pad = (pattern.zone.top - pattern.zone.bottom) * 0.06;
    return bar.close <= pattern.zone.top + pad && bar.close >= pattern.zone.bottom - pad;
  }

  let hi = -Infinity;
  let lo = Infinity;
  pattern.lines?.forEach((ln) => {
    if (["resistance", "structure", "neckline", "pole"].includes(ln.role)) {
      hi = Math.max(hi, ln.from.price, ln.to.price);
    }
    if (["support", "structure", "neckline"].includes(ln.role)) {
      lo = Math.min(lo, ln.from.price, ln.to.price);
    }
  });

  if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return true;
  const pad = (hi - lo) * 0.08;
  return bar.close <= hi + pad && bar.close >= lo - pad;
}

function cpProjectionNote(pattern) {
  if (pattern.type === PATTERN_TYPES.FALLING_WEDGE) {
    return "Green dashed ↑ from apex resistance = primary bullish measured move (opening wedge width). Red dashed ↓ = bearish failure if support breaks.";
  }
  if (pattern.type === PATTERN_TYPES.HEAD_SHOULDERS && pattern.targetUpNote) {
    return `${pattern.targetUpNote} Dashed ↑ line on chart projects this from the neckline. ↓ target = neckline − same height (primary breakdown).`;
  }
  if (pattern.type === PATTERN_TYPES.INVERSE_HEAD_SHOULDERS && pattern.targetDownNote) {
    return `${pattern.targetDownNote} Dashed ↓ line projects failure scenario from neckline.`;
  }
  if (pattern.triggerTime) {
    return `Dashed ↑/↓ lines project measured moves from the trigger bar (${pattern.triggerTime}), not from the apex.`;
  }
  if (pattern.apexTime) {
    return `Dashed ↑/↓ lines after apex (${pattern.apexTime}) show dual breakout targets (triangle/wedge height). Solid lines stop at the apex.`;
  }
  return "Dashed ↑/↓ lines are measured-move targets projected forward from the pattern boundary.";
}

function cpScanOutcome(bars, pattern, evalCfg) {
  const {
    confirmUp = null,
    confirmDown = null,
    neckline = null,
    primaryBias = null,
    invalidateUp = null,
    invalidateDown = null,
  } = evalCfg;

  let status = pattern.status;
  let breakoutDirection = pattern.breakoutDirection;
  let breakoutIdx = pattern.breakoutIdx;
  let breakoutPrice = pattern.breakoutPrice;
  let triggerPrice = null;
  let failedReason = null;

  const scanFrom = Math.max(pattern.drawEndIdx ?? pattern.startIdx, pattern.startIdx);

  for (let i = scanFrom; i < bars.length; i++) {
    const b = bars[i];
    const upLevel = cpResolveLevel(confirmUp, i, b);
    const downLevel = cpResolveLevel(confirmDown, i, b);
    const neckLevel = cpResolveLevel(neckline, i, b);

    if (pattern.targetUp != null && b.high >= pattern.targetUp) {
      return {
        status: "target_reached",
        breakoutDirection: breakoutDirection || "up",
        breakoutIdx,
        breakoutPrice,
        triggerPrice,
        failedReason: null,
      };
    }
    if (pattern.targetDown != null && b.low <= pattern.targetDown) {
      return {
        status: "target_reached",
        breakoutDirection: breakoutDirection || "down",
        breakoutIdx,
        breakoutPrice,
        triggerPrice,
        failedReason: null,
      };
    }

    if (status === "forming") {
      if (upLevel != null && b.close > upLevel) {
        status = "confirmed";
        breakoutDirection = "up";
        breakoutIdx = i;
        breakoutPrice = b.close;
        triggerPrice = neckLevel ?? upLevel;
      } else if (downLevel != null && b.close < downLevel) {
        status = "confirmed";
        breakoutDirection = "down";
        breakoutIdx = i;
        breakoutPrice = b.close;
        triggerPrice = neckLevel ?? downLevel;
      } else if (primaryBias === "up" && downLevel != null && b.close < downLevel) {
        return {
          status: "failed",
          breakoutDirection: "down",
          breakoutIdx: i,
          breakoutPrice: b.close,
          triggerPrice: downLevel,
          failedReason: "Broke support before resistance breakout",
        };
      } else if (primaryBias === "down" && upLevel != null && b.close > upLevel) {
        return {
          status: "failed",
          breakoutDirection: "up",
          breakoutIdx: i,
          breakoutPrice: b.close,
          triggerPrice: upLevel,
          failedReason: "Broke resistance before support breakdown",
        };
      } else if (invalidateUp != null && b.close > invalidateUp) {
        return {
          status: "failed",
          breakoutDirection: "up",
          breakoutIdx: i,
          breakoutPrice: b.close,
          triggerPrice: invalidateUp,
          failedReason: "Invalidated — broke above pattern ceiling",
        };
      } else if (invalidateDown != null && b.close < invalidateDown) {
        return {
          status: "failed",
          breakoutDirection: "down",
          breakoutIdx: i,
          breakoutPrice: b.close,
          triggerPrice: invalidateDown,
          failedReason: "Invalidated — broke below pattern floor",
        };
      }
    }

    if (status === "confirmed" && breakoutIdx != null) {
      const reclaimLevel = cpResolveLevel(neckline, i, b) ?? triggerPrice;
      if (breakoutDirection === "down" && reclaimLevel != null && b.close > reclaimLevel * 1.003) {
        return {
          status: "failed",
          breakoutDirection,
          breakoutIdx,
          breakoutPrice,
          triggerPrice,
          failedReason: "Reclaimed neckline after breakdown",
        };
      }
      if (breakoutDirection === "up" && reclaimLevel != null && b.close < reclaimLevel * 0.997) {
        return {
          status: "failed",
          breakoutDirection,
          breakoutIdx,
          breakoutPrice,
          triggerPrice,
          failedReason: "Lost neckline after breakout",
        };
      }
    }
  }

  return { status, breakoutDirection, breakoutIdx, breakoutPrice, triggerPrice, failedReason };
}

function cpApplyRelevance(bars, pattern, evalCfg) {
  const lastIdx = bars.length - 1;
  const lastBar = bars[lastIdx];
  const patternEnd = pattern.drawEndIdx ?? pattern.endIdx;
  const barsAfterPattern = lastIdx - patternEnd;
  const recentWindow = Math.max(40, Math.floor(bars.length * 0.22));
  const staleThreshold = Math.max(60, Math.floor(bars.length * 0.2));
  const agedThreshold = Math.max(50, Math.floor(bars.length * 0.2));
  const inside = cpIsInsidePattern(bars, pattern, lastIdx);

  if (pattern.status === "forming") {
    if (barsAfterPattern <= recentWindow || inside) return null;

    const neck = cpResolveLevel(evalCfg.neckline, lastIdx, lastBar);
    if (
      pattern.type === PATTERN_TYPES.HEAD_SHOULDERS &&
      neck != null &&
      lastBar.close > neck * 1.01
    ) {
      return {
        status: "failed",
        failedReason: "Never triggered — price reclaimed above neckline",
      };
    }

    if (barsAfterPattern >= staleThreshold && !inside) {
      return {
        status: "failed",
        failedReason: "Setup expired — price left pattern without triggering",
      };
    }
    return null;
  }

  if (pattern.status === "confirmed" && pattern.breakoutIdx != null) {
    const barsSinceBreak = lastIdx - pattern.breakoutIdx;
    const reclaim = cpResolveLevel(evalCfg.neckline, pattern.breakoutIdx, bars[pattern.breakoutIdx]);

    if (pattern.breakoutDirection === "down" && reclaim != null && lastBar.close > reclaim * 1.008) {
      return {
        status: "failed",
        failedReason: "Outdated — bullish reclaim after breakdown",
      };
    }
    if (pattern.breakoutDirection === "up" && reclaim != null && lastBar.close < reclaim * 0.992) {
      return {
        status: "failed",
        failedReason: "Outdated — bearish loss after breakout",
      };
    }

    if (barsSinceBreak >= agedThreshold && pattern.status !== "target_reached") {
      const primaryTarget = pattern.breakoutDirection === "down" ? pattern.targetDown : pattern.targetUp;
      const missedTarget =
        primaryTarget != null &&
        (pattern.breakoutDirection === "down"
          ? lastBar.low > primaryTarget * 1.02
          : lastBar.high < primaryTarget * 0.98);

      if (missedTarget) {
        return {
          status: "failed",
          failedReason: "Outdated — trigger aged without reaching target",
        };
      }
    }
  }

  return null;
}

function cpFinalize(bars, type, fields, evalCfg = {}) {
  const drawEndIdx =
    fields.drawEndIdx ??
    (fields.endTime ? cpIdxAtTime(bars, fields.endTime) : fields.endIdx ?? bars.length - 1);

  const pattern = cpMakePattern(type, { ...fields, drawEndIdx });
  const outcome = cpScanOutcome(bars, pattern, evalCfg);
  Object.assign(pattern, outcome);

  const relevance = cpApplyRelevance(bars, pattern, evalCfg);
  if (relevance) Object.assign(pattern, relevance);

  if (outcome.breakoutIdx != null) {
    pattern.breakoutTime = bars[outcome.breakoutIdx].time;
    pattern.triggerTime = bars[outcome.breakoutIdx].time;
    pattern.triggerPrice =
      outcome.triggerPrice ??
      cpResolveLevel(evalCfg.neckline, outcome.breakoutIdx, bars[outcome.breakoutIdx]) ??
      outcome.breakoutPrice;
  }

  const hasLabel = pattern.markers.some((m) => m.kind === "label");
  if (!hasLabel) {
    pattern.markers.unshift({
      kind: "label",
      time: pattern.labelTime,
      position: pattern.labelPosition,
      text: pattern.shortName,
      shape: "square",
    });
  }

  if (pattern.status === "failed") {
    const failIdx = outcome.breakoutIdx ?? drawEndIdx;
    pattern.markers.push({
      kind: "failed",
      time: bars[failIdx]?.time ?? pattern.endTime,
      position: pattern.bullish === false ? "aboveBar" : "belowBar",
      text: "Failed",
      shape: "circle",
    });
  }

  if (pattern.triggerTime && pattern.breakoutDirection) {
    const isDown = pattern.breakoutDirection === "down";
    pattern.markers.push({
      kind: "trigger",
      time: pattern.triggerTime,
      position: isDown ? "aboveBar" : "belowBar",
      text: isDown ? "▼ TRIGGER" : "▲ TRIGGER",
      shape: isDown ? "arrowDown" : "arrowUp",
    });
  }

  pattern.projectionNote = cpProjectionNote(pattern);
  if (pattern.primaryTargetDir == null && evalCfg.primaryBias) {
    pattern.primaryTargetDir = evalCfg.primaryBias;
  }
  return pattern;
}

/* ── Ascending Triangle ─────────────────────────────────────────────
   Flat resistance (2+ similar highs) + rising support (3+ higher lows).
   Extend: tighten cpNearPct tolerance or require volume contraction.
*/
function detectAscendingTriangle(bars, pivots) {
  const patterns = [];
  const { highs, lows } = pivots;
  if (highs.length < 2 || lows.length < 3) return patterns;

  for (let hi = highs.length - 1; hi >= 1; hi--) {
    for (let hj = hi - 1; hj >= 0; hj--) {
      const h1 = highs[hi];
      const h2 = highs[hj];
      if (h2.idx >= h1.idx - 8) continue;
      if (!cpNearPct(h1.price, h2.price, 2)) continue;

      const resistance = (h1.price + h2.price) / 2;
      const betweenLows = lows.filter((l) => l.idx >= h2.idx && l.idx <= h1.idx + 15);
      if (betweenLows.length < 3) continue;

      const rising = betweenLows.every((l, i) => i === 0 || l.price >= betweenLows[i - 1].price * 0.995);
      if (!rising) continue;

      const supReg = cpLinReg(betweenLows);
      if (supReg.slope <= 0) continue;

      const startIdx = Math.min(h2.idx, betweenLows[0].idx);
      const endIdx = bars.length - 1;
      const height = resistance - cpPriceAt(supReg, startIdx);
      if (height <= 0) continue;

      const apexIdx = cpIntersectionIdx(supReg, cpFlatReg(resistance));
      const drawEnd = cpApexDrawEnd(bars, startIdx, apexIdx);
      const supportAtEnd = cpPriceAt(supReg, drawEnd);
      const targetUp = resistance + height;
      const targetDown = supportAtEnd - height;
      const stopPrice = supportAtEnd * 0.99;
      const reward = targetUp - resistance;
      const risk = resistance - stopPrice;
      const rr = risk > 0 ? `~${(reward / risk).toFixed(1)}:1 measured move` : "N/A";

      patterns.push(
        cpFinalize(
          bars,
          PATTERN_TYPES.ASCENDING_TRIANGLE,
          {
            startIdx,
            endIdx,
            drawEndIdx: drawEnd,
            startTime: bars[startIdx].time,
            endTime: bars[drawEnd].time,
            apexTime: bars[drawEnd].time,
            apexPrice: (resistance + supportAtEnd) / 2,
            labelTime: bars[h1.idx].time,
            labelPrice: resistance,
            labelPosition: "aboveBar",
            targetUp,
            targetDown,
            stopPrice,
            riskReward: rr,
            lines: [
              cpSeg(bars, "resistance", h2.idx, drawEnd, resistance, resistance),
              cpSeg(
                bars,
                "support",
                betweenLows[0].idx,
                drawEnd,
                cpPriceAt(supReg, betweenLows[0].idx),
                supportAtEnd,
              ),
            ],
            markers: [
              { kind: "pivot", time: h2.time, position: "aboveBar", text: "Res 1", shape: "circle" },
              { kind: "pivot", time: h1.time, position: "aboveBar", text: "Res 2", shape: "circle" },
            ],
            zone: {
              top: resistance,
              bottom: supportAtEnd,
              startTime: bars[startIdx].time,
              endTime: bars[drawEnd].time,
            },
          },
          {
            confirmUp: resistance * 1.002,
            confirmDown: supportAtEnd * 0.998,
            primaryBias: "up",
            neckline: resistance,
          },
        ),
      );
    }
  }
  return patterns;
}

/* ── Head & Shoulders ───────────────────────────────────────────────
   Three pivot highs: middle (head) highest, shoulders similar height.
*/
function detectHeadAndShoulders(bars, pivots) {
  const patterns = [];
  const highs = pivots.highs;
  const lows = pivots.lows;
  if (highs.length < 3) return patterns;

  for (let i = highs.length - 3; i >= 0; i--) {
    const left = highs[i];
    const head = highs[i + 1];
    const right = highs[i + 2];
    if (head.price <= left.price * 1.01 || head.price <= right.price * 1.01) continue;
    if (!cpNearPct(left.price, right.price, 4)) continue;

    const troughs = lows.filter((l) => l.idx > left.idx && l.idx < right.idx);
    if (troughs.length < 1) continue;
    const neckPts = [
      lows.find((l) => l.idx > left.idx && l.idx < head.idx),
      lows.find((l) => l.idx > head.idx && l.idx < right.idx),
    ].filter(Boolean);
    if (neckPts.length < 2) continue;

    const neckReg = cpLinReg(neckPts);
    const startIdx = left.idx;
    const endIdx = bars.length - 1;
    const necklineEnd = cpPriceAt(neckReg, endIdx);
    const height = head.price - cpPriceAt(neckReg, head.idx);

    const neckDrawEnd = cpDrawEnd(bars, neckPts[0].idx, right.idx + 2, null);
    const neckAtLeft = cpPriceAt(neckReg, neckPts[0].idx);
    const neckAtRight = cpPriceAt(neckReg, neckPts[1].idx);
    const neckAtDrawEnd = cpPriceAt(neckReg, neckDrawEnd);
    const targetDown = neckAtDrawEnd - height;
    const targetUp = neckAtDrawEnd + height;

    patterns.push(
      cpFinalize(
        bars,
        PATTERN_TYPES.HEAD_SHOULDERS,
        {
          startIdx,
          endIdx,
          drawEndIdx: neckDrawEnd,
          startTime: bars[startIdx].time,
          endTime: bars[neckDrawEnd].time,
          labelTime: bars[head.idx].time,
          labelPrice: head.price,
          labelPosition: "aboveBar",
          targetUp,
          targetDown,
          targetUpAnchor: neckAtDrawEnd,
          targetDownAnchor: neckAtDrawEnd,
          targetUpNote: `Neckline $${neckAtDrawEnd.toFixed(0)} + head height $${height.toFixed(0)} — upside target if neckline breaks upward (failed-bearish / inverse scenario).`,
          targetDownNote: `Neckline $${neckAtDrawEnd.toFixed(0)} − head height $${height.toFixed(0)} — primary bearish measured move.`,
          targetPrice: targetDown,
          stopPrice: head.price,
          riskReward: `↓ $${height.toFixed(0)} primary · ↑ $${height.toFixed(0)} inverse from neckline`,
          lines: [
            cpSeg(
              bars,
              "neckline",
              neckPts[0].idx,
              neckDrawEnd,
              neckAtLeft,
              cpPriceAt(neckReg, neckDrawEnd),
            ),
            cpSeg(bars, "structure", left.idx, neckPts[0].idx, left.price, neckAtLeft),
            cpSeg(bars, "structure", neckPts[0].idx, head.idx, neckAtLeft, head.price),
            cpSeg(bars, "structure", head.idx, neckPts[1].idx, head.price, neckAtRight),
            cpSeg(bars, "structure", neckPts[1].idx, right.idx, neckAtRight, right.price),
          ],
          markers: [
            { kind: "structure", time: left.time, position: "aboveBar", text: "L Sh", shape: "circle" },
            { kind: "structure", time: head.time, position: "aboveBar", text: "Head", shape: "circle" },
            { kind: "structure", time: right.time, position: "aboveBar", text: "R Sh", shape: "circle" },
          ],
        },
        {
          confirmDown: (idx) => cpPriceAt(neckReg, idx) * 0.998,
          confirmUp: Math.max(left.price, right.price) * 1.002,
          primaryBias: "down",
          neckline: (idx) => cpPriceAt(neckReg, idx),
          invalidateUp: head.price * 1.005,
        },
      ),
    );
  }
  return patterns;
}

function detectDescendingTriangle(bars, pivots) {
  const patterns = [];
  const { highs, lows } = pivots;
  if (highs.length < 3 || lows.length < 2) return patterns;

  for (let li = lows.length - 1; li >= 1; li--) {
    for (let lj = li - 1; lj >= 0; lj--) {
      const l1 = lows[li];
      const l2 = lows[lj];
      if (l2.idx >= l1.idx - 8) continue;
      if (!cpNearPct(l1.price, l2.price, 2)) continue;

      const support = (l1.price + l2.price) / 2;
      const betweenHighs = highs.filter((h) => h.idx >= l2.idx && h.idx <= l1.idx + 15);
      if (betweenHighs.length < 3) continue;

      const falling = betweenHighs.every((h, i) => i === 0 || h.price <= betweenHighs[i - 1].price * 1.005);
      if (!falling) continue;

      const resReg = cpLinReg(betweenHighs);
      if (resReg.slope >= 0) continue;

      const startIdx = Math.min(l2.idx, betweenHighs[0].idx);
      const endIdx = bars.length - 1;
      const height = cpPriceAt(resReg, startIdx) - support;
      if (height <= 0) continue;

      const apexIdx = cpIntersectionIdx(cpFlatReg(support), resReg);
      const drawEnd = cpApexDrawEnd(bars, startIdx, apexIdx);
      const resistanceAtEnd = cpPriceAt(resReg, drawEnd);
      const targetDown = support - height;
      const targetUp = resistanceAtEnd + height;

      patterns.push(
        cpFinalize(
          bars,
          PATTERN_TYPES.DESCENDING_TRIANGLE,
          {
            startIdx,
            endIdx,
            drawEndIdx: drawEnd,
            startTime: bars[startIdx].time,
            endTime: bars[drawEnd].time,
            apexTime: bars[drawEnd].time,
            apexPrice: (resistanceAtEnd + support) / 2,
            labelTime: bars[l1.idx].time,
            labelPrice: support,
            labelPosition: "belowBar",
            targetUp,
            targetDown,
            zone: { top: resistanceAtEnd, bottom: support, startTime: bars[startIdx].time, endTime: bars[drawEnd].time },
            lines: [
              cpSeg(bars, "support", l2.idx, drawEnd, support, support),
              cpSeg(
                bars,
                "resistance",
                betweenHighs[0].idx,
                drawEnd,
                cpPriceAt(resReg, betweenHighs[0].idx),
                resistanceAtEnd,
              ),
            ],
            markers: [
              { kind: "pivot", time: l2.time, position: "belowBar", text: "Sup 1", shape: "circle" },
              { kind: "pivot", time: l1.time, position: "belowBar", text: "Sup 2", shape: "circle" },
            ],
          },
          {
            confirmDown: support * 0.998,
            confirmUp: resistanceAtEnd * 1.002,
            primaryBias: "down",
            neckline: support,
          },
        ),
      );
    }
  }
  return patterns;
}

function detectSymmetricalTriangle(bars, pivots) {
  const patterns = [];
  const { highs, lows } = pivots;
  const seen = new Set();

  for (const pivotCount of [5, 4, 6, 3]) {
    const recentHighs = highs.slice(-pivotCount);
    const recentLows = lows.slice(-pivotCount);
    if (recentHighs.length < 2 || recentLows.length < 2) continue;

    const hiReg = cpLinReg(recentHighs);
    const loReg = cpLinReg(recentLows);
    if (hiReg.slope >= 0 || loReg.slope <= 0) continue;

    const startIdx = Math.min(recentHighs[0].idx, recentLows[0].idx);
    const endIdx = bars.length - 1;
    const topStart = cpPriceAt(hiReg, startIdx);
    const botStart = cpPriceAt(loReg, startIdx);
    const height = topStart - botStart;
    if (height / topStart < 0.008) continue;

    const apexIdx = cpIntersectionIdx(hiReg, loReg);
    const drawEnd = cpApexDrawEnd(bars, startIdx, apexIdx);
    const key = `${startIdx}-${drawEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const resistanceAtEnd = cpPriceAt(hiReg, drawEnd);
    const supportAtEnd = cpPriceAt(loReg, drawEnd);
    const midPrice = (resistanceAtEnd + supportAtEnd) / 2;
    const targetUp = resistanceAtEnd + height;
    const targetDown = supportAtEnd - height;

    patterns.push(
      cpFinalize(
        bars,
        PATTERN_TYPES.SYMMETRICAL_TRIANGLE,
        {
          startIdx,
          endIdx,
          drawEndIdx: drawEnd,
          startTime: bars[startIdx].time,
          endTime: bars[drawEnd].time,
          apexTime: bars[drawEnd].time,
          apexPrice: midPrice,
          labelTime: bars[Math.min(drawEnd, endIdx)].time,
          labelPrice: midPrice,
          labelPosition: "aboveBar",
          targetUp,
          targetDown,
          zone: { top: resistanceAtEnd, bottom: supportAtEnd, startTime: bars[startIdx].time, endTime: bars[drawEnd].time },
          lines: [
            cpSeg(
              bars,
              "resistance",
              recentHighs[0].idx,
              drawEnd,
              cpPriceAt(hiReg, recentHighs[0].idx),
              resistanceAtEnd,
            ),
            cpSeg(
              bars,
              "support",
              recentLows[0].idx,
              drawEnd,
              cpPriceAt(loReg, recentLows[0].idx),
              supportAtEnd,
            ),
          ],
          riskReward: `↑/↓ ${height.toFixed(0)} USDT measured moves from apex`,
        },
        {
          confirmUp: resistanceAtEnd * 1.002,
          confirmDown: supportAtEnd * 0.998,
        },
      ),
    );
  }
  return patterns;
}

function detectInverseHeadAndShoulders(bars, pivots) {
  const patterns = [];
  const lows = pivots.lows;
  const highs = pivots.highs;
  if (lows.length < 3) return patterns;

  for (let i = 0; i < lows.length - 2; i++) {
    const left = lows[i];
    const head = lows[i + 1];
    const right = lows[i + 2];
    if (head.price >= left.price * 0.99 || head.price >= right.price * 0.99) continue;
    if (!cpNearPct(left.price, right.price, 4)) continue;

    const peak1 = highs.find((h) => h.idx > left.idx && h.idx < head.idx);
    const peak2 = highs.find((h) => h.idx > head.idx && h.idx < right.idx);
    if (!peak1 || !peak2) continue;

    const neckReg = cpLinReg([peak1, peak2]);
    const endIdx = bars.length - 1;
    const neckline = cpPriceAt(neckReg, endIdx);
    const height = cpPriceAt(neckReg, head.idx) - head.price;
    const neckDrawEnd = cpDrawEnd(bars, peak1.idx, right.idx + 2, null);
    const neckAtLeft = cpPriceAt(neckReg, peak1.idx);
    const neckAtRight = cpPriceAt(neckReg, peak2.idx);
    const neckAtDrawEnd = cpPriceAt(neckReg, neckDrawEnd);
    const targetUp = neckAtDrawEnd + height;
    const targetDown = neckAtDrawEnd - height;

    patterns.push(
      cpFinalize(
        bars,
        PATTERN_TYPES.INVERSE_HEAD_SHOULDERS,
        {
          startIdx: left.idx,
          endIdx,
          drawEndIdx: neckDrawEnd,
          startTime: bars[left.idx].time,
          endTime: bars[neckDrawEnd].time,
          labelTime: bars[head.idx].time,
          labelPrice: head.price,
          labelPosition: "belowBar",
          targetUp,
          targetDown,
          targetUpAnchor: neckAtDrawEnd,
          targetDownAnchor: neckAtDrawEnd,
          targetUpNote: `Neckline $${neckAtDrawEnd.toFixed(0)} + head depth $${height.toFixed(0)} — primary bullish measured move.`,
          targetDownNote: `Neckline $${neckAtDrawEnd.toFixed(0)} − head depth $${height.toFixed(0)} — downside if neckline fails.`,
          targetPrice: targetUp,
          lines: [
            cpSeg(
              bars,
              "neckline",
              peak1.idx,
              neckDrawEnd,
              neckAtLeft,
              cpPriceAt(neckReg, neckDrawEnd),
            ),
            cpSeg(bars, "structure", left.idx, peak1.idx, left.price, neckAtLeft),
            cpSeg(bars, "structure", peak1.idx, head.idx, neckAtLeft, head.price),
            cpSeg(bars, "structure", head.idx, peak2.idx, head.price, neckAtRight),
            cpSeg(bars, "structure", peak2.idx, right.idx, neckAtRight, right.price),
          ],
          markers: [
            { kind: "structure", time: left.time, position: "belowBar", text: "L Sh", shape: "circle" },
            { kind: "structure", time: head.time, position: "belowBar", text: "Head", shape: "circle" },
            { kind: "structure", time: right.time, position: "belowBar", text: "R Sh", shape: "circle" },
          ],
        },
        {
          confirmUp: (idx) => cpPriceAt(neckReg, idx) * 1.002,
          confirmDown: Math.min(left.price, right.price) * 0.998,
          primaryBias: "up",
          neckline: (idx) => cpPriceAt(neckReg, idx),
          invalidateDown: head.price * 0.995,
        },
      ),
    );
  }
  return patterns;
}

function detectDoubleTopBottom(bars, pivots, type) {
  const patterns = [];
  const isTop = type === PATTERN_TYPES.DOUBLE_TOP;
  const pts = isTop ? pivots.highs : pivots.lows;
  if (pts.length < 2) return patterns;

  for (let i = pts.length - 1; i >= 1; i--) {
    const p1 = pts[i];
    const p2 = pts[i - 1];
    if (p1.idx - p2.idx < 8) continue;
    if (!cpNearPct(p1.price, p2.price, 2.5)) continue;

    const mid = (isTop ? pivots.lows : pivots.highs).find(
      (x) => x.idx > p2.idx && x.idx < p1.idx,
    );
    if (!mid) continue;

    const neckline = mid.price;
    const height = Math.abs(p1.price - neckline);
    const endIdx = bars.length - 1;
    const peakPrice = Math.max(p1.price, p2.price);
    const troughPrice = Math.min(p1.price, p2.price);
    const targetDown = neckline - height;
    const targetUp = neckline + height;
    const drawEnd = cpDrawEnd(bars, p2.idx, p1.idx + 2, null);

    patterns.push(
      cpFinalize(
        bars,
        type,
        {
          startIdx: p2.idx,
          endIdx,
          drawEndIdx: drawEnd,
          startTime: bars[p2.idx].time,
          endTime: bars[drawEnd].time,
          labelTime: bars[p1.idx].time,
          labelPrice: isTop ? p1.price : p1.price,
          labelPosition: isTop ? "aboveBar" : "belowBar",
          targetUp: isTop ? peakPrice + height : targetUp,
          targetDown: isTop ? targetDown : troughPrice - height,
          lines: [
            cpSeg(bars, "neckline", mid.idx, drawEnd, neckline, neckline),
            cpSeg(bars, "structure", p2.idx, p1.idx, p2.price, p1.price),
          ],
          markers: [
            {
              kind: "structure",
              time: p2.time,
              position: isTop ? "aboveBar" : "belowBar",
              text: isTop ? "Peak 1" : "Trough 1",
              shape: "circle",
            },
            {
              kind: "structure",
              time: p1.time,
              position: isTop ? "aboveBar" : "belowBar",
              text: isTop ? "Peak 2" : "Trough 2",
              shape: "circle",
            },
          ],
          riskReward: `Height ≈ ${height.toFixed(0)} USDT · dual breakout targets`,
        },
        {
          confirmDown: isTop ? neckline * 0.998 : null,
          confirmUp: isTop ? null : neckline * 1.002,
          primaryBias: isTop ? "down" : "up",
          neckline,
          invalidateUp: isTop ? peakPrice * 1.005 : null,
          invalidateDown: isTop ? null : troughPrice * 0.995,
        },
      ),
    );
  }
  return patterns;
}

function detectFlagPennant(bars, pivots) {
  const patterns = [];
  if (bars.length < 35) return patterns;

  for (const lookback of [24, 30, 38]) {
    if (bars.length < lookback) continue;
    const slice = bars.slice(-lookback);
    const baseIdx = bars.length - lookback;
    const poleStart = slice[0];
    const poleEndIdx = baseIdx + Math.floor(lookback * 0.35);
    const poleEnd = bars[poleEndIdx];
    const poleMove = poleEnd.close - poleStart.close;
    const polePct = (poleMove / poleStart.close) * 100;
    if (Math.abs(polePct) < 4) continue;

    const cons = bars.slice(poleEndIdx);
    const consHighs = cons.map((b) => b.high);
    const consLows = cons.map((b) => b.low);
    const range = (Math.max(...consHighs) - Math.min(...consLows)) / poleEnd.close;
    if (range > 0.1) continue;

    const bullish = polePct > 0;
    const type =
      range < 0.045 && Math.abs(polePct) > 7
        ? PATTERN_TYPES.PENNANT
        : bullish
          ? PATTERN_TYPES.BULL_FLAG
          : PATTERN_TYPES.BEAR_FLAG;
    const endIdx = bars.length - 1;
    const consTop = Math.max(...consHighs);
    const consBot = Math.min(...consLows);
    const targetUp = poleEnd.close + Math.abs(poleMove);
    const targetDown = poleEnd.close - Math.abs(poleMove);

    patterns.push(
      cpFinalize(
        bars,
        type,
        {
          startIdx: baseIdx,
          endIdx,
          drawEndIdx: endIdx,
          startTime: bars[baseIdx].time,
          endTime: bars[endIdx].time,
          labelTime: bars[poleEndIdx].time,
          labelPrice: poleEnd.close,
          labelPosition: bullish ? "aboveBar" : "belowBar",
          targetUp,
          targetDown,
          targetPrice: bullish ? targetUp : targetDown,
          zone: { top: consTop, bottom: consBot, startTime: bars[poleEndIdx].time, endTime: bars[endIdx].time },
          riskReward: `Pole ${polePct >= 0 ? "+" : ""}${polePct.toFixed(1)}% · ↑/↓ measured pole`,
          lines: [
            cpSeg(bars, "pole", baseIdx, poleEndIdx, poleStart.close, poleEnd.close),
            cpSeg(bars, "resistance", poleEndIdx, endIdx, consTop, consTop),
            cpSeg(bars, "support", poleEndIdx, endIdx, consBot, consBot),
          ],
          markers: [
            { kind: "pole", time: bars[baseIdx].time, position: "inBar", text: "Pole ▶", shape: "square" },
            { kind: "pole", time: bars[poleEndIdx].time, position: bullish ? "aboveBar" : "belowBar", text: "Flag", shape: "square" },
          ],
        },
        {
          confirmUp: consTop * 1.002,
          confirmDown: consBot * 0.998,
          primaryBias: bullish ? "up" : "down",
        },
      ),
    );
  }
  return patterns;
}

function cpBuildWedgeFields(bars, type, highs, lows, hiReg, loReg, startIdx, drawEnd) {
  const endIdx = bars.length - 1;
  const bullish = type === PATTERN_TYPES.FALLING_WEDGE;
  const resistanceAtStart = cpPriceAt(hiReg, startIdx);
  const supportAtStart = cpPriceAt(loReg, startIdx);
  const resistanceAtEnd = cpPriceAt(hiReg, drawEnd);
  const supportAtEnd = cpPriceAt(loReg, drawEnd);
  const openHeight = resistanceAtStart - supportAtStart;
  const apexHeight = resistanceAtEnd - supportAtEnd;
  const midPrice = (resistanceAtEnd + supportAtEnd) / 2;
  const openMid = (resistanceAtStart + supportAtStart) / 2;

  const lines = [
    cpSeg(bars, "resistance", highs[0].idx, drawEnd, cpPriceAt(hiReg, highs[0].idx), resistanceAtEnd),
    cpSeg(bars, "support", lows[0].idx, drawEnd, cpPriceAt(loReg, lows[0].idx), supportAtEnd),
  ];

  const markers = [];

  for (let i = 0; i < highs.length - 1; i++) {
    lines.push(
      cpSeg(bars, "wedge_upper", highs[i].idx, highs[i + 1].idx, highs[i].price, highs[i + 1].price),
    );
  }
  for (let i = 0; i < lows.length - 1; i++) {
    lines.push(
      cpSeg(bars, "wedge_lower", lows[i].idx, lows[i + 1].idx, lows[i].price, lows[i + 1].price),
    );
  }
  const widthEndIdx = Math.min(startIdx + 3, drawEnd);
  lines.push(cpSeg(bars, "wedge_width", startIdx, widthEndIdx, supportAtStart, resistanceAtStart));

  highs.forEach((h, i) => {
    markers.push({
      kind: "pivot",
      time: h.time,
      position: "aboveBar",
      text: `H${i + 1}`,
      shape: "circle",
    });
  });
  lows.forEach((l, i) => {
    markers.push({
      kind: "pivot",
      time: l.time,
      position: "belowBar",
      text: `L${i + 1}`,
      shape: "circle",
    });
  });
  markers.push({
    kind: "width",
    time: bars[startIdx].time,
    position: "inBar",
    text: `W ${openHeight.toFixed(0)}`,
    shape: "square",
  });
  markers.push({
    kind: "endpoint",
    time: bars[drawEnd].time,
    position: "aboveBar",
    text: "R",
    shape: "circle",
  });
  markers.push({
    kind: "endpoint",
    time: bars[drawEnd].time,
    position: "belowBar",
    text: "S",
    shape: "circle",
  });

  return {
    startIdx,
    endIdx,
    drawEndIdx: drawEnd,
    startTime: bars[startIdx].time,
    endTime: bars[drawEnd].time,
    apexTime: bars[drawEnd].time,
    apexPrice: midPrice,
    labelTime: bullish ? bars[startIdx].time : bars[drawEnd].time,
    labelPrice: bullish ? openMid : midPrice,
    labelPosition: bullish ? "belowBar" : "aboveBar",
    targetUp: bullish ? resistanceAtEnd + openHeight : resistanceAtEnd + openHeight,
    targetDown: bullish ? supportAtEnd - openHeight : supportAtEnd - openHeight,
    targetUpAnchor: resistanceAtEnd,
    targetDownAnchor: supportAtEnd,
    targetUpNote: bullish
      ? `Primary ↑: apex resistance $${resistanceAtEnd.toFixed(0)} + opening width $${openHeight.toFixed(0)}`
      : `Alternate ↑: apex resistance $${resistanceAtEnd.toFixed(0)} + opening width $${openHeight.toFixed(0)} (failed-bearish scenario)`,
    targetDownNote: bullish
      ? `Failure ↓: apex support $${supportAtEnd.toFixed(0)} − opening width $${openHeight.toFixed(0)}`
      : `Primary ↓: apex support $${supportAtEnd.toFixed(0)} − opening width $${openHeight.toFixed(0)}`,
    primaryTargetDir: bullish ? "up" : "down",
    wedgeOpenHeight: openHeight,
    wedgeApexHeight: apexHeight,
    wedgeResOpen: resistanceAtStart,
    wedgeSupOpen: supportAtStart,
    wedgeResApex: resistanceAtEnd,
    wedgeSupApex: supportAtEnd,
    wedgeCompressionPct: openHeight > 0 ? (1 - apexHeight / openHeight) * 100 : null,
    wedgePivotHighs: highs.length,
    wedgePivotLows: lows.length,
    zone: {
      top: resistanceAtEnd,
      bottom: supportAtEnd,
      topStart: resistanceAtStart,
      bottomStart: supportAtStart,
      startTime: bars[startIdx].time,
      endTime: bars[drawEnd].time,
    },
    lines,
    markers,
    riskReward: bullish
      ? `Open $${openHeight.toFixed(0)} → apex $${apexHeight.toFixed(0)} · bullish ↑ $${openHeight.toFixed(0)}`
      : `Wedge width $${openHeight.toFixed(0)} · bearish ↓ bias`,
  };
}

function detectWedge(bars, pivots) {
  const patterns = [];
  const seen = new Set();

  for (const pivotCount of [5, 4, 6]) {
    const highs = pivots.highs.slice(-pivotCount);
    const lows = pivots.lows.slice(-pivotCount);
    if (highs.length < 2 || lows.length < 2) continue;

    const hiReg = cpLinReg(highs);
    const loReg = cpLinReg(lows);
    const bothUp = hiReg.slope > 0 && loReg.slope > 0 && hiReg.slope < loReg.slope;
    const bothDown = hiReg.slope < 0 && loReg.slope < 0 && hiReg.slope > loReg.slope;
    if (!bothUp && !bothDown) continue;

    const type = bothUp ? PATTERN_TYPES.RISING_WEDGE : PATTERN_TYPES.FALLING_WEDGE;
    const startIdx = Math.min(highs[0].idx, lows[0].idx);
    const apexIdx = cpIntersectionIdx(hiReg, loReg);
    const drawEnd = cpApexDrawEnd(bars, startIdx, apexIdx);
    const key = `${type}-${startIdx}-${drawEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bullish = type === PATTERN_TYPES.FALLING_WEDGE;
    const fields = cpBuildWedgeFields(bars, type, highs, lows, hiReg, loReg, startIdx, drawEnd);
    const resistanceAtEnd = cpPriceAt(hiReg, drawEnd);
    const supportAtEnd = cpPriceAt(loReg, drawEnd);

    patterns.push(
      cpFinalize(
        bars,
        type,
        fields,
        {
          confirmUp: resistanceAtEnd * 1.002,
          confirmDown: supportAtEnd * 0.998,
          primaryBias: bullish ? "up" : "down",
        },
      ),
    );
  }
  return patterns;
}

function detectRectangle(bars, pivots) {
  const patterns = [];
  const highs = pivots.highs.slice(-3);
  const lows = pivots.lows.slice(-3);
  if (highs.length < 2 || lows.length < 2) return patterns;

  const res = highs.reduce((s, h) => s + h.price, 0) / highs.length;
  const sup = lows.reduce((s, l) => s + l.price, 0) / lows.length;
  if (!highs.every((h) => cpNearPct(h.price, res, 2)) || !lows.every((l) => cpNearPct(l.price, sup, 2))) return patterns;

  const height = res - sup;
  if (height / res < 0.02 || height / res > 0.15) return patterns;

  const startIdx = Math.min(highs[0].idx, lows[0].idx);
  const endIdx = bars.length - 1;
  const lastTouch = Math.max(highs[highs.length - 1].idx, lows[lows.length - 1].idx);
  const drawEnd = cpDrawEnd(bars, startIdx, lastTouch + 2, null);
  const targetUp = res + height;
  const targetDown = sup - height;

  patterns.push(
    cpFinalize(
      bars,
      PATTERN_TYPES.RECTANGLE,
      {
        startIdx,
        endIdx,
        drawEndIdx: drawEnd,
        startTime: bars[startIdx].time,
        endTime: bars[drawEnd].time,
        labelTime: bars[drawEnd].time,
        labelPrice: (res + sup) / 2,
        labelPosition: "aboveBar",
        targetUp,
        targetDown,
        zone: { top: res, bottom: sup, startTime: bars[startIdx].time, endTime: bars[drawEnd].time },
        lines: [
          cpSeg(bars, "resistance", startIdx, drawEnd, res, res),
          cpSeg(bars, "support", startIdx, drawEnd, sup, sup),
        ],
        riskReward: `Range ${height.toFixed(0)} USDT · ↑/↓ measured moves`,
      },
      {
        confirmUp: res * 1.002,
        confirmDown: sup * 0.998,
      },
    ),
  );
  return patterns;
}

/** Loose scan for recent developing compression (forming triangles/wedges) */
function detectDevelopingCompression(bars, pivots) {
  const patterns = [];
  const { highs, lows } = pivots;
  const seen = new Set();

  for (const pivotCount of [6, 5, 4]) {
    const recentHighs = highs.slice(-pivotCount);
    const recentLows = lows.slice(-pivotCount);
    if (recentHighs.length < 3 || recentLows.length < 3) continue;

    const hiReg = cpLinReg(recentHighs);
    const loReg = cpLinReg(recentLows);
    const startIdx = Math.min(recentHighs[0].idx, recentLows[0].idx);
    if (bars.length - 1 - startIdx < 12) continue;

    const topStart = cpPriceAt(hiReg, startIdx);
    const botStart = cpPriceAt(loReg, startIdx);
    const height = topStart - botStart;
    if (height / topStart < 0.005) continue;

    const converging = hiReg.slope < 0 && loReg.slope > 0;
    const hiFlatLoUp = Math.abs(hiReg.slope) < topStart * 0.00002 && loReg.slope > 0;
    const loFlatHiDown = Math.abs(loReg.slope) < topStart * 0.00002 && hiReg.slope < 0;
    if (!converging && !hiFlatLoUp && !loFlatHiDown) continue;

    let type = PATTERN_TYPES.SYMMETRICAL_TRIANGLE;
    if (hiFlatLoUp) type = PATTERN_TYPES.ASCENDING_TRIANGLE;
    else if (loFlatHiDown) type = PATTERN_TYPES.DESCENDING_TRIANGLE;

    const apexIdx = cpIntersectionIdx(hiReg, loReg);
    const drawEnd = cpApexDrawEnd(bars, startIdx, apexIdx);
    const key = `dev-${type}-${startIdx}-${drawEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const resistanceAtEnd = cpPriceAt(hiReg, drawEnd);
    const supportAtEnd = cpPriceAt(loReg, drawEnd);
    const midPrice = (resistanceAtEnd + supportAtEnd) / 2;
    const targetUp = resistanceAtEnd + height;
    const targetDown = supportAtEnd - height;

    patterns.push(
      cpFinalize(
        bars,
        type,
        {
          startIdx,
          endIdx: bars.length - 1,
          drawEndIdx: drawEnd,
          startTime: bars[startIdx].time,
          endTime: bars[drawEnd].time,
          apexTime: bars[drawEnd].time,
          apexPrice: midPrice,
          labelTime: bars[Math.min(drawEnd, bars.length - 1)].time,
          labelPrice: midPrice,
          labelPosition: "aboveBar",
          targetUp,
          targetDown,
          zone: { top: resistanceAtEnd, bottom: supportAtEnd, startTime: bars[startIdx].time, endTime: bars[drawEnd].time },
          lines: [
            cpSeg(bars, "resistance", recentHighs[0].idx, drawEnd, cpPriceAt(hiReg, recentHighs[0].idx), resistanceAtEnd),
            cpSeg(bars, "support", recentLows[0].idx, drawEnd, cpPriceAt(loReg, recentLows[0].idx), supportAtEnd),
          ],
          riskReward: `Developing · ${height.toFixed(0)} USDT range`,
        },
        {
          confirmUp: resistanceAtEnd * 1.002,
          confirmDown: supportAtEnd * 0.998,
        },
      ),
    );
  }
  return patterns;
}

/** Registry — add new detectors here */
const PATTERN_DETECTORS = [
  detectDevelopingCompression,
  detectAscendingTriangle,
  detectHeadAndShoulders,
  detectDescendingTriangle,
  detectSymmetricalTriangle,
  detectInverseHeadAndShoulders,
  (bars, pivots) => detectDoubleTopBottom(bars, pivots, PATTERN_TYPES.DOUBLE_TOP),
  (bars, pivots) => detectDoubleTopBottom(bars, pivots, PATTERN_TYPES.DOUBLE_BOTTOM),
  detectFlagPennant,
  detectWedge,
  detectRectangle,
];

function cpRankPatterns(found, bars) {
  const lastIdx = bars.length - 1;
  const scored = found
    .map((p) => ({
      ...p,
      recency: p.drawEndIdx ?? p.endIdx,
      freshness: lastIdx - (p.drawEndIdx ?? p.endIdx),
    }))
    .sort((a, b) => {
      const statusOrder = { forming: 0, confirmed: 1, target_reached: 2, failed: 3 };
      const sa = statusOrder[a.status] ?? 4;
      const sb = statusOrder[b.status] ?? 4;
      if (sa !== sb) return sa - sb;
      return b.recency - a.recency;
    });

  const picked = [];
  const seen = new Set();
  const statusCount = { forming: 0, confirmed: 0, failed: 0, target_reached: 0 };
  const statusCap = { forming: 8, confirmed: 6, failed: 6, target_reached: 3 };

  for (const status of ["forming", "confirmed", "failed", "target_reached"]) {
    for (const p of scored) {
      if (p.status !== status || statusCount[status] >= statusCap[status]) continue;
      const key = `${p.type}-${p.startIdx}-${p.drawEndIdx}`;
      if (seen.has(key)) continue;
      picked.push(p);
      seen.add(key);
      statusCount[status]++;
    }
  }

  for (const p of scored.sort((a, b) => b.recency - a.recency)) {
    if (picked.length >= 18) break;
    const key = `${p.type}-${p.startIdx}-${p.drawEndIdx}`;
    if (seen.has(key)) continue;
    picked.push(p);
    seen.add(key);
  }

  const statusOrder = { forming: 0, confirmed: 1, target_reached: 2, failed: 3 };
  return picked.sort((a, b) => {
    const sa = statusOrder[a.status] ?? 4;
    const sb = statusOrder[b.status] ?? 4;
    if (sa !== sb) return sa - sb;
    return b.recency - a.recency;
  });
}

function cpRunDetectors(windowBars, offset, pivotSpanOverride) {
  const found = [];
  const seen = new Set();
  const pivotSpan =
    pivotSpanOverride ??
    (windowBars.length < 80 ? 2 : windowBars.length < 150 ? 3 : windowBars.length < 350 ? 4 : 5);
  const pivots = cpFindPivots(windowBars, pivotSpan, pivotSpan);

  PATTERN_DETECTORS.forEach((fn) => {
    fn(windowBars, pivots).forEach((p) => {
      const adj = {
        ...p,
        startIdx: p.startIdx + offset,
        endIdx: p.endIdx + offset,
        drawEndIdx: (p.drawEndIdx ?? p.endIdx) + offset,
        breakoutIdx: p.breakoutIdx != null ? p.breakoutIdx + offset : null,
        lines: p.lines.map((ln) => ({ ...ln })),
      };
      const key = `${adj.type}-${adj.startIdx}-${adj.drawEndIdx}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push(adj);
    });
  });
  return found;
}

function detectChartPatterns(bars) {
  if (!bars?.length) return [];

  const found = [];
  const globalSeen = new Set();

  const passLengths = [...new Set([bars.length, 600, 450, 300, 180, 90].filter((l) => l <= bars.length))].sort(
    (a, b) => b - a,
  );

  passLengths.forEach((len) => {
    const windowBars = bars.length > len ? bars.slice(-len) : bars;
    const offset = bars.length - windowBars.length;
    const pivotSpan = len >= 450 ? 5 : len >= 300 ? 4 : len >= 150 ? 3 : 2;
    const batch = cpRunDetectors(windowBars, offset, pivotSpan);
    batch.forEach((p) => {
      const key = `${p.type}-${p.startIdx}-${p.drawEndIdx}`;
      if (globalSeen.has(key)) return;
      globalSeen.add(key);
      found.push(p);
    });
  });

  return cpRankPatterns(found, bars);
}

window.PATTERN_TYPES = PATTERN_TYPES;
window.PATTERN_CATALOG = PATTERN_CATALOG;
window.cpBarsFromKlines = cpBarsFromKlines;
window.detectChartPatterns = detectChartPatterns;