/**
 * Classic options strategy library (OptionStrat-style catalog).
 * Pure option structures only — works with Deribit BTC (no stock legs).
 */

import type {
  ExpirationChain,
  OptionQuote,
  OptionType,
  PayoffShape,
  PresetContext,
  StrategyLeg,
  StrategyPreset,
  StrategyProficiency,
  StrategySentiment,
  ProfitLossTag,
} from "@/types/options";

function pickStrike(
  strikes: number[],
  target: number,
  mode: "nearest" | "otm_call" | "otm_put" | "itm_call" | "itm_put"
): number {
  const sorted = [...strikes].sort((a, b) => a - b);
  if (sorted.length === 0) return target;
  if (mode === "nearest") {
    return sorted.reduce((best, s) =>
      Math.abs(s - target) < Math.abs(best - target) ? s : best
    );
  }
  if (mode === "otm_call") {
    const otm = sorted.filter((s) => s >= target);
    return otm[0] ?? sorted[sorted.length - 1];
  }
  if (mode === "otm_put") {
    const otm = sorted.filter((s) => s <= target);
    return otm[otm.length - 1] ?? sorted[0];
  }
  if (mode === "itm_call") {
    const itm = sorted.filter((s) => s <= target);
    return itm[itm.length - 1] ?? sorted[0];
  }
  const itm = sorted.filter((s) => s >= target);
  return itm[0] ?? sorted[sorted.length - 1];
}

function strikeAbove(strikes: number[], base: number, steps: number): number {
  const sorted = [...strikes].sort((a, b) => a - b);
  const idx = sorted.findIndex((s) => s >= base);
  const start = idx === -1 ? sorted.length - 1 : idx;
  return sorted[Math.min(sorted.length - 1, Math.max(0, start + steps))];
}

function strikeBelow(strikes: number[], base: number, steps: number): number {
  const sorted = [...strikes].sort((a, b) => a - b);
  let idx = sorted.findIndex((s) => s >= base);
  if (idx === -1) idx = sorted.length - 1;
  if (sorted[idx] > base && idx > 0) idx -= 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, idx - steps))];
}

function makeLeg(
  ctx: PresetContext,
  side: StrategyLeg["side"],
  type: OptionType,
  strike: number,
  quantity = 1,
  exp?: ExpirationChain
): Omit<StrategyLeg, "id"> | null {
  const expiration = exp ?? ctx.expiration;
  const q = ctx.getQuote(strike, type, expiration);
  if (!q) return null;
  return {
    side,
    type,
    instrumentName: q.instrumentName,
    expirationTimestamp: expiration.expirationTimestamp,
    expirationDate: expiration.expirationDate,
    strike,
    quantity,
    premium:
      q.mark > 0
        ? q.mark
        : ((q.bid ?? 0) + (q.ask ?? 0)) / 2 || 0.01,
    ivOverride: null,
    marketIv: q.iv > 0 ? q.iv : 0.5,
  };
}

function compact<T>(arr: (T | null)[]): T[] {
  return arr.filter((x): x is T => x !== null);
}

function strikesOf(ctx: PresetContext, exp?: ExpirationChain): number[] {
  return (exp ?? ctx.expiration).strikes.map((s) => s.strike);
}

function S(
  id: string,
  name: string,
  opts: {
    description: string;
    education: string;
    legsSummary: string[];
    proficiency: StrategyProficiency;
    family: string;
    sentiment: StrategySentiment[];
    tags: ProfitLossTag[];
    payoff: PayoffShape;
    aliases?: string[];
    needsSecondExpiry?: boolean;
    build: StrategyPreset["build"];
  }
): StrategyPreset {
  return { id, name, ...opts };
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  // ─── Novice / Basic ─────────────────────────────────────
  S("long-call", "Long Call", {
    description: "Buy a call — simple bullish leverage",
    education:
      "A call gives the right to buy BTC at strike A. Value rises if price climbs; max loss is the premium paid. Time decay and IV crush work against you.",
    legsSummary: ["Buy a call at strike A"],
    proficiency: "novice",
    family: "Basic",
    sentiment: ["bullish"],
    tags: ["unlimited-profit", "limited-loss"],
    payoff: "long-call",
    build: (ctx) => compact([makeLeg(ctx, "buy", "call", ctx.atmCallStrike)]),
  }),
  S("long-put", "Long Put", {
    description: "Buy a put — simple bearish leverage",
    education:
      "A put gains when BTC falls. Max loss is the premium. Useful for hedging or directional shorts without shorting spot.",
    legsSummary: ["Buy a put at strike A"],
    proficiency: "novice",
    family: "Basic",
    sentiment: ["bearish"],
    tags: ["nearly-unlimited-profit", "limited-loss"],
    payoff: "long-put",
    build: (ctx) => compact([makeLeg(ctx, "buy", "put", ctx.atmPutStrike)]),
  }),

  // ─── Intermediate / Credit & Debit Spreads ──────────────
  S("bull-put-spread", "Bull Put Spread", {
    description: "Put credit spread — mildly bullish income",
    education:
      "Sell a higher-strike put and buy a lower-strike put for protection. Profit if BTC stays above the short strike. Defined risk credit trade.",
    legsSummary: ["Buy put at A", "Sell put at B (A < B)"],
    proficiency: "intermediate",
    family: "Credit Spreads",
    sentiment: ["bullish", "income"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "bull-put",
    aliases: ["Put Credit Spread"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const shortK = ctx.atmPutStrike;
      const longK = strikeBelow(s, shortK, 2);
      if (longK >= shortK) return [];
      return compact([
        makeLeg(ctx, "buy", "put", longK),
        makeLeg(ctx, "sell", "put", shortK),
      ]);
    },
  }),
  S("bear-call-spread", "Bear Call Spread", {
    description: "Call credit spread — mildly bearish income",
    education:
      "Sell a lower-strike call and buy a higher call wing. Profit if BTC stays below the short strike. Defined risk credit trade.",
    legsSummary: ["Sell call at A", "Buy call at B (A < B)"],
    proficiency: "intermediate",
    family: "Credit Spreads",
    sentiment: ["bearish", "income"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "bear-call",
    aliases: ["Call Credit Spread"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const shortK = ctx.atmCallStrike;
      const longK = strikeAbove(s, shortK, 2);
      if (longK <= shortK) return [];
      return compact([
        makeLeg(ctx, "sell", "call", shortK),
        makeLeg(ctx, "buy", "call", longK),
      ]);
    },
  }),
  S("bull-call-spread", "Bull Call Spread", {
    description: "Call debit spread — bullish, capped risk",
    education:
      "Buy a call and sell a higher call to reduce cost. Max profit if BTC is above the short strike at expiry. Almost vega-neutral vs a naked call.",
    legsSummary: ["Buy call at A", "Sell call at B (A < B)"],
    proficiency: "intermediate",
    family: "Debit Spreads",
    sentiment: ["bullish"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "bull-call",
    aliases: ["Call Debit Spread"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const longK = ctx.atmCallStrike;
      const shortK = strikeAbove(s, longK, 2);
      if (shortK <= longK) return [];
      return compact([
        makeLeg(ctx, "buy", "call", longK),
        makeLeg(ctx, "sell", "call", shortK),
      ]);
    },
  }),
  S("bear-put-spread", "Bear Put Spread", {
    description: "Put debit spread — bearish, capped risk",
    education:
      "Buy a put and sell a lower put. Profits if BTC falls below the short strike. Cheaper than a naked long put.",
    legsSummary: ["Sell put at A", "Buy put at B (A < B)"],
    proficiency: "intermediate",
    family: "Debit Spreads",
    sentiment: ["bearish"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "bear-put",
    aliases: ["Put Debit Spread"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const longK = ctx.atmPutStrike;
      const shortK = strikeBelow(s, longK, 2);
      if (shortK >= longK) return [];
      return compact([
        makeLeg(ctx, "sell", "put", shortK),
        makeLeg(ctx, "buy", "put", longK),
      ]);
    },
  }),

  // ─── Neutral ────────────────────────────────────────────
  S("iron-butterfly", "Iron Butterfly", {
    description: "Short ATM straddle + long wings — tight neutral",
    education:
      "Credit structure: short ATM call & put, long OTM wings. Max profit if BTC pins the body. IV crush helps; big moves hurt.",
    legsSummary: [
      "Buy put at A",
      "Sell put at B",
      "Sell call at B",
      "Buy call at C",
    ],
    proficiency: "intermediate",
    family: "Neutral",
    sentiment: ["neutral", "income"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "iron-butterfly",
    aliases: ["Short Iron Butterfly"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const body = pickStrike(s, ctx.indexPrice, "nearest");
      const longPut = strikeBelow(s, body, 2);
      const longCall = strikeAbove(s, body, 2);
      if (longPut >= body || longCall <= body) return [];
      return compact([
        makeLeg(ctx, "buy", "put", longPut),
        makeLeg(ctx, "sell", "put", body),
        makeLeg(ctx, "sell", "call", body),
        makeLeg(ctx, "buy", "call", longCall),
      ]);
    },
  }),
  S("iron-condor", "Iron Condor", {
    description: "Short OTM strangle + wings — wide neutral",
    education:
      "Wider profit zone than an iron fly, smaller max credit. Best when you expect BTC to stay in a range and IV is elevated.",
    legsSummary: [
      "Buy put at A",
      "Sell put at B",
      "Sell call at C",
      "Buy call at D",
    ],
    proficiency: "intermediate",
    family: "Neutral",
    sentiment: ["neutral", "income"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "iron-condor",
    aliases: ["Short Iron Condor"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const shortCall = strikeAbove(s, ctx.atmCallStrike, 1);
      const longCall = strikeAbove(s, shortCall, 2);
      const shortPut = strikeBelow(s, ctx.atmPutStrike, 1);
      const longPut = strikeBelow(s, shortPut, 2);
      if (longPut >= shortPut || shortCall >= longCall) return [];
      return compact([
        makeLeg(ctx, "buy", "put", longPut),
        makeLeg(ctx, "sell", "put", shortPut),
        makeLeg(ctx, "sell", "call", shortCall),
        makeLeg(ctx, "buy", "call", longCall),
      ]);
    },
  }),
  S("long-call-butterfly", "Long Call Butterfly", {
    description: "Debit call fly — pin the middle strike",
    education:
      "Buy 1 low call, sell 2 middle, buy 1 high. Cheap defined-risk bet that BTC finishes near the body. IV drop helps near expiry.",
    legsSummary: ["Buy call A", "Sell 2× call B", "Buy call C"],
    proficiency: "intermediate",
    family: "Neutral",
    sentiment: ["neutral"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "long-butterfly",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const mid = pickStrike(s, ctx.indexPrice, "nearest");
      const low = strikeBelow(s, mid, 2);
      const high = strikeAbove(s, mid, 2);
      if (low >= mid || high <= mid) return [];
      return compact([
        makeLeg(ctx, "buy", "call", low),
        makeLeg(ctx, "sell", "call", mid, 2),
        makeLeg(ctx, "buy", "call", high),
      ]);
    },
  }),
  S("long-put-butterfly", "Long Put Butterfly", {
    description: "Debit put fly — pin the middle strike",
    education:
      "Same idea as call butterfly using puts. Attractive risk/reward if you expect price to settle near a strike.",
    legsSummary: ["Buy put A", "Sell 2× put B", "Buy put C"],
    proficiency: "intermediate",
    family: "Neutral",
    sentiment: ["neutral"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "long-butterfly",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const mid = pickStrike(s, ctx.indexPrice, "nearest");
      const low = strikeBelow(s, mid, 2);
      const high = strikeAbove(s, mid, 2);
      if (low >= mid || high <= mid) return [];
      return compact([
        makeLeg(ctx, "buy", "put", low),
        makeLeg(ctx, "sell", "put", mid, 2),
        makeLeg(ctx, "buy", "put", high),
      ]);
    },
  }),
  S("long-call-condor", "Long Call Condor", {
    description: "Wide call fly with two body strikes",
    education:
      "Like a butterfly but body strikes are split — wider profit zone, smaller peak profit.",
    legsSummary: ["Buy call A", "Sell B", "Sell C", "Buy D"],
    proficiency: "advanced",
    family: "Neutral",
    sentiment: ["neutral"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "iron-condor",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const a = strikeBelow(s, ctx.atmCallStrike, 2);
      const b = strikeAbove(s, a, 1);
      const c = strikeAbove(s, b, 1);
      const d = strikeAbove(s, c, 1);
      if (!(a < b && b < c && c < d)) return [];
      return compact([
        makeLeg(ctx, "buy", "call", a),
        makeLeg(ctx, "sell", "call", b),
        makeLeg(ctx, "sell", "call", c),
        makeLeg(ctx, "buy", "call", d),
      ]);
    },
  }),
  S("long-put-condor", "Long Put Condor", {
    description: "Wide put fly with two body strikes",
    education:
      "Put version of the long condor — profits in a band, defined risk.",
    legsSummary: ["Buy put A", "Sell B", "Sell C", "Buy D"],
    proficiency: "advanced",
    family: "Neutral",
    sentiment: ["neutral"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "iron-condor",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const d = strikeAbove(s, ctx.atmPutStrike, 2);
      const c = strikeBelow(s, d, 1);
      const b = strikeBelow(s, c, 1);
      const a = strikeBelow(s, b, 1);
      if (!(a < b && b < c && c < d)) return [];
      return compact([
        makeLeg(ctx, "buy", "put", a),
        makeLeg(ctx, "sell", "put", b),
        makeLeg(ctx, "sell", "put", c),
        makeLeg(ctx, "buy", "put", d),
      ]);
    },
  }),

  // ─── Directional / Volatility ───────────────────────────
  S("straddle", "Long Straddle", {
    description: "Buy ATM call + put — big move either way",
    education:
      "Expensive long-vol trade. Needs a large move or IV rise. Popular around events — watch for IV crush after the move.",
    legsSummary: ["Buy put at A", "Buy call at A"],
    proficiency: "intermediate",
    family: "Directional",
    sentiment: ["volatile"],
    tags: ["unlimited-profit", "limited-loss"],
    payoff: "straddle",
    build: (ctx) => {
      const k = pickStrike(strikesOf(ctx), ctx.indexPrice, "nearest");
      return compact([
        makeLeg(ctx, "buy", "put", k),
        makeLeg(ctx, "buy", "call", k),
      ]);
    },
  }),
  S("strangle", "Long Strangle", {
    description: "Buy OTM put + OTM call — cheaper long vol",
    education:
      "Cheaper than a straddle but needs a larger move to break even. Long vega / short theta.",
    legsSummary: ["Buy put at A", "Buy call at B"],
    proficiency: "intermediate",
    family: "Directional",
    sentiment: ["volatile"],
    tags: ["unlimited-profit", "limited-loss"],
    payoff: "strangle",
    build: (ctx) => {
      const s = strikesOf(ctx);
      return compact([
        makeLeg(ctx, "buy", "put", strikeBelow(s, ctx.atmPutStrike, 1)),
        makeLeg(ctx, "buy", "call", strikeAbove(s, ctx.atmCallStrike, 1)),
      ]);
    },
  }),
  S("inverse-iron-condor", "Inverse Iron Condor", {
    description: "Long OTM strangle, short wings — long vol",
    education:
      "Debit version of the iron condor. Profits from a large move beyond the outer strikes.",
    legsSummary: [
      "Sell put A",
      "Buy put B",
      "Buy call C",
      "Sell call D",
    ],
    proficiency: "intermediate",
    family: "Directional",
    sentiment: ["volatile"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "inverse-condor",
    aliases: ["Long Iron Condor"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const longPut = strikeBelow(s, ctx.atmPutStrike, 1);
      const shortPut = strikeBelow(s, longPut, 2);
      const longCall = strikeAbove(s, ctx.atmCallStrike, 1);
      const shortCall = strikeAbove(s, longCall, 2);
      if (!(shortPut < longPut && longCall < shortCall)) return [];
      return compact([
        makeLeg(ctx, "sell", "put", shortPut),
        makeLeg(ctx, "buy", "put", longPut),
        makeLeg(ctx, "buy", "call", longCall),
        makeLeg(ctx, "sell", "call", shortCall),
      ]);
    },
  }),
  S("inverse-iron-butterfly", "Inverse Iron Butterfly", {
    description: "Long ATM straddle + short wings",
    education:
      "Debit iron fly — profit from a strong move away from the body. Tighter than long condor.",
    legsSummary: [
      "Sell put A",
      "Buy put B",
      "Buy call B",
      "Sell call C",
    ],
    proficiency: "intermediate",
    family: "Directional",
    sentiment: ["volatile"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "inverse-condor",
    aliases: ["Long Iron Butterfly"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const body = pickStrike(s, ctx.indexPrice, "nearest");
      const shortPut = strikeBelow(s, body, 2);
      const shortCall = strikeAbove(s, body, 2);
      if (shortPut >= body || shortCall <= body) return [];
      return compact([
        makeLeg(ctx, "sell", "put", shortPut),
        makeLeg(ctx, "buy", "put", body),
        makeLeg(ctx, "buy", "call", body),
        makeLeg(ctx, "sell", "call", shortCall),
      ]);
    },
  }),
  S("short-call-butterfly", "Short Call Butterfly", {
    description: "Credit call fly — profit from a move",
    education:
      "Opposite of long call butterfly. Needs a move away from the body; defined risk.",
    legsSummary: ["Sell call A", "Buy 2× call B", "Sell call C"],
    proficiency: "intermediate",
    family: "Directional",
    sentiment: ["volatile"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "short-butterfly",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const mid = pickStrike(s, ctx.indexPrice, "nearest");
      const low = strikeBelow(s, mid, 2);
      const high = strikeAbove(s, mid, 2);
      if (low >= mid || high <= mid) return [];
      return compact([
        makeLeg(ctx, "sell", "call", low),
        makeLeg(ctx, "buy", "call", mid, 2),
        makeLeg(ctx, "sell", "call", high),
      ]);
    },
  }),
  S("short-put-butterfly", "Short Put Butterfly", {
    description: "Credit put fly — profit from a move",
    education:
      "Opposite of long put butterfly. Benefits from volatility / large displacement from the body.",
    legsSummary: ["Sell put A", "Buy 2× put B", "Sell put C"],
    proficiency: "intermediate",
    family: "Directional",
    sentiment: ["volatile"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "short-butterfly",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const mid = pickStrike(s, ctx.indexPrice, "nearest");
      const low = strikeBelow(s, mid, 2);
      const high = strikeAbove(s, mid, 2);
      if (low >= mid || high <= mid) return [];
      return compact([
        makeLeg(ctx, "sell", "put", low),
        makeLeg(ctx, "buy", "put", mid, 2),
        makeLeg(ctx, "sell", "put", high),
      ]);
    },
  }),
  S("short-call-condor", "Short Call Condor", {
    description: "Credit wide call fly — long vol band",
    education:
      "Wider unprofitable middle than short butterfly; better payoff if price escapes the zone.",
    legsSummary: ["Sell A", "Buy B", "Buy C", "Sell D"],
    proficiency: "advanced",
    family: "Directional",
    sentiment: ["volatile"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "inverse-condor",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const a = strikeBelow(s, ctx.atmCallStrike, 2);
      const b = strikeAbove(s, a, 1);
      const c = strikeAbove(s, b, 1);
      const d = strikeAbove(s, c, 1);
      if (!(a < b && b < c && c < d)) return [];
      return compact([
        makeLeg(ctx, "sell", "call", a),
        makeLeg(ctx, "buy", "call", b),
        makeLeg(ctx, "buy", "call", c),
        makeLeg(ctx, "sell", "call", d),
      ]);
    },
  }),
  S("short-put-condor", "Short Put Condor", {
    description: "Credit wide put fly — long vol band",
    education:
      "Put version of short condor — profits outside a range.",
    legsSummary: ["Sell A", "Buy B", "Buy C", "Sell D"],
    proficiency: "advanced",
    family: "Directional",
    sentiment: ["volatile"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "inverse-condor",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const d = strikeAbove(s, ctx.atmPutStrike, 2);
      const c = strikeBelow(s, d, 1);
      const b = strikeBelow(s, c, 1);
      const a = strikeBelow(s, b, 1);
      if (!(a < b && b < c && c < d)) return [];
      return compact([
        makeLeg(ctx, "sell", "put", a),
        makeLeg(ctx, "buy", "put", b),
        makeLeg(ctx, "buy", "put", c),
        makeLeg(ctx, "sell", "put", d),
      ]);
    },
  }),
  S("strip", "Strip", {
    description: "Straddle with 2× puts — bearish long vol",
    education:
      "Like a straddle but double the puts. Larger payoff if BTC dumps than if it rips.",
    legsSummary: ["Buy call at A", "Buy 2× puts at A"],
    proficiency: "expert",
    family: "Directional",
    sentiment: ["bearish", "volatile"],
    tags: ["unlimited-profit", "limited-loss"],
    payoff: "strip",
    build: (ctx) => {
      const k = pickStrike(strikesOf(ctx), ctx.indexPrice, "nearest");
      return compact([
        makeLeg(ctx, "buy", "call", k),
        makeLeg(ctx, "buy", "put", k, 2),
      ]);
    },
  }),
  S("strap", "Strap", {
    description: "Straddle with 2× calls — bullish long vol",
    education:
      "Like a straddle but double the calls. Larger payoff on a sharp rally.",
    legsSummary: ["Buy 2× calls at A", "Buy put at A"],
    proficiency: "expert",
    family: "Directional",
    sentiment: ["bullish", "volatile"],
    tags: ["unlimited-profit", "limited-loss"],
    payoff: "strap",
    build: (ctx) => {
      const k = pickStrike(strikesOf(ctx), ctx.indexPrice, "nearest");
      return compact([
        makeLeg(ctx, "buy", "call", k, 2),
        makeLeg(ctx, "buy", "put", k),
      ]);
    },
  }),
  S("guts", "Guts", {
    description: "ITM strangle — expensive long vol",
    education:
      "Buy ITM call and ITM put. Same idea as a strangle but pricier; usually prefer OTM strangle for liquidity.",
    legsSummary: ["Buy ITM call at A", "Buy ITM put at B"],
    proficiency: "expert",
    family: "Directional",
    sentiment: ["volatile"],
    tags: ["unlimited-profit", "limited-loss"],
    payoff: "strangle",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const callK = strikeBelow(s, ctx.indexPrice, 1);
      const putK = strikeAbove(s, ctx.indexPrice, 1);
      return compact([
        makeLeg(ctx, "buy", "call", callK),
        makeLeg(ctx, "buy", "put", putK),
      ]);
    },
  }),

  // ─── Calendars ──────────────────────────────────────────
  S("calendar-call", "Calendar Call Spread", {
    description: "Sell near call, buy same strike further out",
    education:
      "Profits if BTC is near the strike when the front expires. Long the back month captures residual value. Needs two expiries.",
    legsSummary: [
      "Sell call A (near expiry)",
      "Buy call A (further expiry)",
    ],
    proficiency: "intermediate",
    family: "Calendar Spreads",
    sentiment: ["neutral"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "calendar",
    aliases: ["Horizontal Call Spread"],
    needsSecondExpiry: true,
    build: (ctx) => {
      if (!ctx.farExpiration) return [];
      const k = pickStrike(strikesOf(ctx), ctx.indexPrice, "nearest");
      return compact([
        makeLeg(ctx, "sell", "call", k, 1, ctx.expiration),
        makeLeg(ctx, "buy", "call", k, 1, ctx.farExpiration),
      ]);
    },
  }),
  S("calendar-put", "Calendar Put Spread", {
    description: "Sell near put, buy same strike further out",
    education:
      "Put calendar — same thesis as call calendar around a strike at front expiry.",
    legsSummary: [
      "Sell put A (near expiry)",
      "Buy put A (further expiry)",
    ],
    proficiency: "intermediate",
    family: "Calendar Spreads",
    sentiment: ["neutral"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "calendar",
    aliases: ["Horizontal Put Spread"],
    needsSecondExpiry: true,
    build: (ctx) => {
      if (!ctx.farExpiration) return [];
      const k = pickStrike(strikesOf(ctx), ctx.indexPrice, "nearest");
      return compact([
        makeLeg(ctx, "sell", "put", k, 1, ctx.expiration),
        makeLeg(ctx, "buy", "put", k, 1, ctx.farExpiration),
      ]);
    },
  }),
  S("diagonal-call", "Diagonal Call Spread", {
    description: "Long further ITM call, short near OTM call",
    education:
      "Often called a poor man's covered call. Mildly bullish with defined risk; two expiries.",
    legsSummary: [
      "Buy call A further expiry",
      "Sell call B near expiry",
    ],
    proficiency: "intermediate",
    family: "Calendar Spreads",
    sentiment: ["bullish"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "bull-call",
    aliases: ["Poor Man's Covered Call"],
    needsSecondExpiry: true,
    build: (ctx) => {
      if (!ctx.farExpiration) return [];
      const sNear = strikesOf(ctx);
      const sFar = strikesOf(ctx, ctx.farExpiration);
      const longK = pickStrike(sFar, ctx.indexPrice, "itm_call");
      const shortK = strikeAbove(sNear, ctx.atmCallStrike, 1);
      return compact([
        makeLeg(ctx, "buy", "call", longK, 1, ctx.farExpiration),
        makeLeg(ctx, "sell", "call", shortK, 1, ctx.expiration),
      ]);
    },
  }),
  S("diagonal-put", "Diagonal Put Spread", {
    description: "Long further ITM put, short near OTM put",
    education:
      "Mildly bearish diagonal. Long back-month put financed partly by short near OTM put.",
    legsSummary: [
      "Sell put A near expiry",
      "Buy put B further expiry",
    ],
    proficiency: "intermediate",
    family: "Calendar Spreads",
    sentiment: ["bearish"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "bear-put",
    needsSecondExpiry: true,
    build: (ctx) => {
      if (!ctx.farExpiration) return [];
      const sNear = strikesOf(ctx);
      const sFar = strikesOf(ctx, ctx.farExpiration);
      const longK = pickStrike(sFar, ctx.indexPrice, "itm_put");
      const shortK = strikeBelow(sNear, ctx.atmPutStrike, 1);
      return compact([
        makeLeg(ctx, "sell", "put", shortK, 1, ctx.expiration),
        makeLeg(ctx, "buy", "put", longK, 1, ctx.farExpiration),
      ]);
    },
  }),
  S("double-diagonal", "Double Diagonal", {
    description: "Diagonal call + diagonal put wings",
    education:
      "Expert neutral structure: short near OTM strangle, long further wings. Profit zone can expand as front expires.",
    legsSummary: [
      "Buy far put A",
      "Sell near put B",
      "Sell near call C",
      "Buy far call D",
    ],
    proficiency: "expert",
    family: "Calendar Spreads",
    sentiment: ["neutral"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "iron-condor",
    needsSecondExpiry: true,
    build: (ctx) => {
      if (!ctx.farExpiration) return [];
      const sn = strikesOf(ctx);
      const sf = strikesOf(ctx, ctx.farExpiration);
      const shortPut = strikeBelow(sn, ctx.atmPutStrike, 1);
      const shortCall = strikeAbove(sn, ctx.atmCallStrike, 1);
      const longPut = strikeBelow(sf, shortPut, 2);
      const longCall = strikeAbove(sf, shortCall, 2);
      return compact([
        makeLeg(ctx, "buy", "put", longPut, 1, ctx.farExpiration),
        makeLeg(ctx, "sell", "put", shortPut, 1, ctx.expiration),
        makeLeg(ctx, "sell", "call", shortCall, 1, ctx.expiration),
        makeLeg(ctx, "buy", "call", longCall, 1, ctx.farExpiration),
      ]);
    },
  }),

  // ─── Advanced / Naked ───────────────────────────────────
  S("short-put", "Short Put", {
    description: "Sell put — bullish credit, large risk",
    education:
      "Collect premium; obligation if price crashes (inverse puts can hurt in BTC terms). Only if you accept the risk.",
    legsSummary: ["Sell put at A"],
    proficiency: "advanced",
    family: "Naked",
    sentiment: ["bullish", "income"],
    tags: ["limited-profit", "nearly-unlimited-loss"],
    payoff: "short-put",
    aliases: ["Naked Put"],
    build: (ctx) => compact([makeLeg(ctx, "sell", "put", ctx.atmPutStrike)]),
  }),
  S("short-call", "Short Call", {
    description: "Sell call — bearish credit, large risk",
    education:
      "Keep premium if BTC stays below strike. Upside risk is severe on a squeeze.",
    legsSummary: ["Sell call at A"],
    proficiency: "advanced",
    family: "Naked",
    sentiment: ["bearish", "income"],
    tags: ["limited-profit", "unlimited-loss"],
    payoff: "short-call",
    aliases: ["Naked Call"],
    build: (ctx) => compact([makeLeg(ctx, "sell", "call", ctx.atmCallStrike)]),
  }),
  S("short-straddle", "Short Straddle", {
    description: "Sell ATM call + put — short vol",
    education:
      "High credit, unlimited risk both ways. Theta positive; needs tight range and risk management.",
    legsSummary: ["Sell put at A", "Sell call at A"],
    proficiency: "advanced",
    family: "Neutral",
    sentiment: ["neutral", "income"],
    tags: ["limited-profit", "unlimited-loss"],
    payoff: "short-straddle",
    build: (ctx) => {
      const k = pickStrike(strikesOf(ctx), ctx.indexPrice, "nearest");
      return compact([
        makeLeg(ctx, "sell", "put", k),
        makeLeg(ctx, "sell", "call", k),
      ]);
    },
  }),
  S("short-strangle", "Short Strangle", {
    description: "Sell OTM put + call — wider short vol",
    education:
      "Less credit than short straddle, wider cushion. Still undefined risk on a big move.",
    legsSummary: ["Sell put at A", "Sell call at B"],
    proficiency: "advanced",
    family: "Neutral",
    sentiment: ["neutral", "income"],
    tags: ["limited-profit", "unlimited-loss"],
    payoff: "short-strangle",
    build: (ctx) => {
      const s = strikesOf(ctx);
      return compact([
        makeLeg(ctx, "sell", "put", strikeBelow(s, ctx.atmPutStrike, 1)),
        makeLeg(ctx, "sell", "call", strikeAbove(s, ctx.atmCallStrike, 1)),
      ]);
    },
  }),
  S("short-guts", "Short Guts", {
    description: "Sell ITM call + ITM put",
    education:
      "Like short strangle with ITM options — higher credit, similar risk profile.",
    legsSummary: ["Sell ITM call", "Sell ITM put"],
    proficiency: "expert",
    family: "Neutral",
    sentiment: ["neutral", "income"],
    tags: ["limited-profit", "unlimited-loss"],
    payoff: "short-strangle",
    build: (ctx) => {
      const s = strikesOf(ctx);
      return compact([
        makeLeg(ctx, "sell", "call", strikeBelow(s, ctx.indexPrice, 1)),
        makeLeg(ctx, "sell", "put", strikeAbove(s, ctx.indexPrice, 1)),
      ]);
    },
  }),

  // ─── Ladders ────────────────────────────────────────────
  S("bull-call-ladder", "Bull Call Ladder", {
    description: "Bull call + extra short call — neutral/bull",
    education:
      "Extends bull call with another short call. Unlimited upside risk despite the 'bull' name — actually neutral/slightly bullish.",
    legsSummary: ["Buy call A", "Sell call B", "Sell call C"],
    proficiency: "advanced",
    family: "Ladders",
    sentiment: ["neutral"],
    tags: ["limited-profit", "unlimited-loss"],
    payoff: "ladder-bull",
    aliases: ["Long Call Ladder"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const a = ctx.atmCallStrike;
      const b = strikeAbove(s, a, 1);
      const c = strikeAbove(s, b, 1);
      if (!(a < b && b < c)) return [];
      return compact([
        makeLeg(ctx, "buy", "call", a),
        makeLeg(ctx, "sell", "call", b),
        makeLeg(ctx, "sell", "call", c),
      ]);
    },
  }),
  S("bear-call-ladder", "Bear Call Ladder", {
    description: "Bear call + long upside call",
    education:
      "Short lower call, long two higher — can profit on dump or huge rally.",
    legsSummary: ["Sell call A", "Buy call B", "Buy call C"],
    proficiency: "advanced",
    family: "Ladders",
    sentiment: ["volatile", "bearish"],
    tags: ["unlimited-profit", "limited-loss"],
    payoff: "ladder-bear",
    aliases: ["Short Call Ladder"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const a = ctx.atmCallStrike;
      const b = strikeAbove(s, a, 1);
      const c = strikeAbove(s, b, 1);
      if (!(a < b && b < c)) return [];
      return compact([
        makeLeg(ctx, "sell", "call", a),
        makeLeg(ctx, "buy", "call", b),
        makeLeg(ctx, "buy", "call", c),
      ]);
    },
  }),
  S("bull-put-ladder", "Bull Put Ladder", {
    description: "Bull put + extra long put",
    education:
      "Profits on big dump or mild rally; capped upside, large downside gain potential.",
    legsSummary: ["Buy put A", "Buy put B", "Sell put C"],
    proficiency: "advanced",
    family: "Ladders",
    sentiment: ["volatile", "bullish"],
    tags: ["nearly-unlimited-profit", "limited-loss"],
    payoff: "ladder-bear",
    aliases: ["Short Put Ladder"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const c = ctx.atmPutStrike;
      const b = strikeBelow(s, c, 1);
      const a = strikeBelow(s, b, 1);
      if (!(a < b && b < c)) return [];
      return compact([
        makeLeg(ctx, "buy", "put", a),
        makeLeg(ctx, "buy", "put", b),
        makeLeg(ctx, "sell", "put", c),
      ]);
    },
  }),
  S("bear-put-ladder", "Bear Put Ladder", {
    description: "Bear put + extra short put",
    education:
      "Neutral/slightly bearish; nearly uncapped downside risk from short lower puts.",
    legsSummary: ["Sell put A", "Sell put B", "Buy put C"],
    proficiency: "advanced",
    family: "Ladders",
    sentiment: ["neutral"],
    tags: ["limited-profit", "nearly-unlimited-loss"],
    payoff: "ladder-bull",
    aliases: ["Long Put Ladder"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const c = ctx.atmPutStrike;
      const b = strikeBelow(s, c, 1);
      const a = strikeBelow(s, b, 1);
      if (!(a < b && b < c)) return [];
      return compact([
        makeLeg(ctx, "sell", "put", a),
        makeLeg(ctx, "sell", "put", b),
        makeLeg(ctx, "buy", "put", c),
      ]);
    },
  }),

  // ─── Ratios / Backspreads ───────────────────────────────
  S("call-ratio-backspread", "Call Ratio Backspread", {
    description: "Sell 1 call, buy 2 higher — extreme bull",
    education:
      "Explosive upside if BTC rips. Small loss on mild rise; can credit if IV high.",
    legsSummary: ["Sell call A", "Buy 2× call B"],
    proficiency: "advanced",
    family: "Ratio Spreads",
    sentiment: ["bullish", "volatile"],
    tags: ["unlimited-profit", "limited-loss"],
    payoff: "ratio-back",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const a = ctx.atmCallStrike;
      const b = strikeAbove(s, a, 2);
      if (b <= a) return [];
      return compact([
        makeLeg(ctx, "sell", "call", a),
        makeLeg(ctx, "buy", "call", b, 2),
      ]);
    },
  }),
  S("put-ratio-backspread", "Put Ratio Backspread", {
    description: "Buy 2 puts, sell 1 higher — extreme bear",
    education:
      "Pays on a crash. Mild downside can lose; high IV helps entry.",
    legsSummary: ["Buy 2× put A", "Sell put B"],
    proficiency: "advanced",
    family: "Ratio Spreads",
    sentiment: ["bearish", "volatile"],
    tags: ["nearly-unlimited-profit", "limited-loss"],
    payoff: "ratio-back",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const b = ctx.atmPutStrike;
      const a = strikeBelow(s, b, 2);
      if (a >= b) return [];
      return compact([
        makeLeg(ctx, "buy", "put", a, 2),
        makeLeg(ctx, "sell", "put", b),
      ]);
    },
  }),
  S("call-ratio-spread", "Call Ratio Spread", {
    description: "Buy 1, sell 2 higher — mild bull, upside risk",
    education:
      "Front-ratio call: theta friendly if range-bound; unlimited risk if squeezes through shorts.",
    legsSummary: ["Buy call A", "Sell 2× call B"],
    proficiency: "expert",
    family: "Ratio Spreads",
    sentiment: ["bullish", "neutral"],
    tags: ["limited-profit", "unlimited-loss"],
    payoff: "ratio-front",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const a = ctx.atmCallStrike;
      const b = strikeAbove(s, a, 2);
      if (b <= a) return [];
      return compact([
        makeLeg(ctx, "buy", "call", a),
        makeLeg(ctx, "sell", "call", b, 2),
      ]);
    },
  }),
  S("put-ratio-spread", "Put Ratio Spread", {
    description: "Sell 2 puts, buy 1 higher — mild bear risk",
    education:
      "Front-ratio put: income if stable/mildly down; heavy risk on crash.",
    legsSummary: ["Sell 2× put A", "Buy put B"],
    proficiency: "expert",
    family: "Ratio Spreads",
    sentiment: ["bearish", "neutral"],
    tags: ["limited-profit", "nearly-unlimited-loss"],
    payoff: "ratio-front",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const b = ctx.atmPutStrike;
      const a = strikeBelow(s, b, 2);
      if (a >= b) return [];
      return compact([
        makeLeg(ctx, "sell", "put", a, 2),
        makeLeg(ctx, "buy", "put", b),
      ]);
    },
  }),
  S("call-broken-wing", "Call Broken Wing", {
    description: "Skewed call butterfly — bearish bias",
    education:
      "Skip-strike butterfly: higher probability, risk shifted to one side.",
    legsSummary: ["Buy call A", "Sell 2× B", "Buy C (wider wing)"],
    proficiency: "advanced",
    family: "Ratio Spreads",
    sentiment: ["bearish", "neutral"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "long-butterfly",
    aliases: ["Skip Strike Butterfly"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const mid = pickStrike(s, ctx.indexPrice, "nearest");
      const low = strikeBelow(s, mid, 1);
      const high = strikeAbove(s, mid, 3);
      if (low >= mid || high <= mid) return [];
      return compact([
        makeLeg(ctx, "buy", "call", low),
        makeLeg(ctx, "sell", "call", mid, 2),
        makeLeg(ctx, "buy", "call", high),
      ]);
    },
  }),
  S("put-broken-wing", "Put Broken Wing", {
    description: "Skewed put butterfly — bullish bias",
    education:
      "Skip-strike put fly with risk skewed; higher chance of small win.",
    legsSummary: ["Buy put A", "Sell 2× B", "Buy C"],
    proficiency: "advanced",
    family: "Ratio Spreads",
    sentiment: ["bullish", "neutral"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "long-butterfly",
    aliases: ["Skip Strike Butterfly"],
    build: (ctx) => {
      const s = strikesOf(ctx);
      const mid = pickStrike(s, ctx.indexPrice, "nearest");
      const high = strikeAbove(s, mid, 1);
      const low = strikeBelow(s, mid, 3);
      if (low >= mid || high <= mid) return [];
      return compact([
        makeLeg(ctx, "buy", "put", low),
        makeLeg(ctx, "sell", "put", mid, 2),
        makeLeg(ctx, "buy", "put", high),
      ]);
    },
  }),
  S("inverse-call-broken-wing", "Inverse Call Broken Wing", {
    description: "Short skewed call fly",
    education:
      "Opposite of call broken wing — lower probability, higher max profit if correct.",
    legsSummary: ["Sell A", "Buy 2× B", "Sell C"],
    proficiency: "advanced",
    family: "Ratio Spreads",
    sentiment: ["bullish", "volatile"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "short-butterfly",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const mid = pickStrike(s, ctx.indexPrice, "nearest");
      const low = strikeBelow(s, mid, 1);
      const high = strikeAbove(s, mid, 3);
      if (low >= mid || high <= mid) return [];
      return compact([
        makeLeg(ctx, "sell", "call", low),
        makeLeg(ctx, "buy", "call", mid, 2),
        makeLeg(ctx, "sell", "call", high),
      ]);
    },
  }),
  S("inverse-put-broken-wing", "Inverse Put Broken Wing", {
    description: "Short skewed put fly",
    education:
      "Opposite of put broken wing.",
    legsSummary: ["Sell A", "Buy 2× B", "Sell C"],
    proficiency: "advanced",
    family: "Ratio Spreads",
    sentiment: ["bearish", "volatile"],
    tags: ["limited-profit", "limited-loss"],
    payoff: "short-butterfly",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const mid = pickStrike(s, ctx.indexPrice, "nearest");
      const high = strikeAbove(s, mid, 1);
      const low = strikeBelow(s, mid, 3);
      if (low >= mid || high <= mid) return [];
      return compact([
        makeLeg(ctx, "sell", "put", low),
        makeLeg(ctx, "buy", "put", mid, 2),
        makeLeg(ctx, "sell", "put", high),
      ]);
    },
  }),

  // ─── Specialty ──────────────────────────────────────────
  S("jade-lizard", "Jade Lizard", {
    description: "Short put + short call spread — bullish",
    education:
      "OTM short put + bear call spread. Sized so total credit removes upside risk if done properly. Best in high IV.",
    legsSummary: ["Sell put A", "Sell call B", "Buy call C"],
    proficiency: "advanced",
    family: "Other",
    sentiment: ["bullish", "income"],
    tags: ["limited-profit", "nearly-unlimited-loss"],
    payoff: "jade-lizard",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const putK = strikeBelow(s, ctx.atmPutStrike, 1);
      const shortCall = strikeAbove(s, ctx.atmCallStrike, 1);
      const longCall = strikeAbove(s, shortCall, 2);
      if (shortCall >= longCall) return [];
      return compact([
        makeLeg(ctx, "sell", "put", putK),
        makeLeg(ctx, "sell", "call", shortCall),
        makeLeg(ctx, "buy", "call", longCall),
      ]);
    },
  }),
  S("reverse-jade-lizard", "Reverse Jade Lizard", {
    description: "Short call + bull put spread — bearish",
    education:
      "Mirror jade lizard: short call + put credit spread. Aims to remove downside risk when credit is large enough.",
    legsSummary: ["Buy put A", "Sell put B", "Sell call C"],
    proficiency: "advanced",
    family: "Other",
    sentiment: ["bearish", "income"],
    tags: ["limited-profit", "unlimited-loss"],
    payoff: "jade-lizard",
    build: (ctx) => {
      const s = strikesOf(ctx);
      const callK = strikeAbove(s, ctx.atmCallStrike, 1);
      const shortPut = strikeBelow(s, ctx.atmPutStrike, 1);
      const longPut = strikeBelow(s, shortPut, 2);
      if (longPut >= shortPut) return [];
      return compact([
        makeLeg(ctx, "buy", "put", longPut),
        makeLeg(ctx, "sell", "put", shortPut),
        makeLeg(ctx, "sell", "call", callK),
      ]);
    },
  }),
  S("risk-reversal", "Risk Reversal", {
    description: "Buy OTM call, sell OTM put — synthetic long bias",
    education:
      "Finances a long call by selling a put. Bullish skew trade; put side carries crash risk.",
    legsSummary: ["Buy OTM call", "Sell OTM put"],
    proficiency: "intermediate",
    family: "Other",
    sentiment: ["bullish"],
    tags: ["unlimited-profit", "nearly-unlimited-loss"],
    payoff: "risk-reversal",
    build: (ctx) => {
      const s = strikesOf(ctx);
      return compact([
        makeLeg(ctx, "buy", "call", strikeAbove(s, ctx.atmCallStrike, 1)),
        makeLeg(ctx, "sell", "put", strikeBelow(s, ctx.atmPutStrike, 1)),
      ]);
    },
  }),
  S("long-synthetic", "Long Synthetic Future", {
    description: "Long call + short put ATM — synthetic long",
    education:
      "Mimics long spot with options. Near-zero debit/credit; assignment risk on the short put.",
    legsSummary: ["Sell put A", "Buy call A"],
    proficiency: "expert",
    family: "Synthetic",
    sentiment: ["bullish"],
    tags: ["unlimited-profit", "nearly-unlimited-loss"],
    payoff: "synthetic-long",
    build: (ctx) => {
      const k = pickStrike(strikesOf(ctx), ctx.indexPrice, "nearest");
      return compact([
        makeLeg(ctx, "sell", "put", k),
        makeLeg(ctx, "buy", "call", k),
      ]);
    },
  }),
  S("short-synthetic", "Short Synthetic Future", {
    description: "Short call + long put ATM — synthetic short",
    education:
      "Mimics short spot. Assignment risk on the short call if price rips.",
    legsSummary: ["Buy put A", "Sell call A"],
    proficiency: "expert",
    family: "Synthetic",
    sentiment: ["bearish"],
    tags: ["nearly-unlimited-profit", "unlimited-loss"],
    payoff: "synthetic-short",
    build: (ctx) => {
      const k = pickStrike(strikesOf(ctx), ctx.indexPrice, "nearest");
      return compact([
        makeLeg(ctx, "buy", "put", k),
        makeLeg(ctx, "sell", "call", k),
      ]);
    },
  }),
  S("long-combo", "Long Combo", {
    description: "Short put + long higher call",
    education:
      "Like synthetic long with a gap between strikes — flat between A and B at expiry.",
    legsSummary: ["Sell put A", "Buy call B"],
    proficiency: "expert",
    family: "Synthetic",
    sentiment: ["bullish"],
    tags: ["unlimited-profit", "nearly-unlimited-loss"],
    payoff: "synthetic-long",
    build: (ctx) => {
      const s = strikesOf(ctx);
      return compact([
        makeLeg(ctx, "sell", "put", strikeBelow(s, ctx.indexPrice, 1)),
        makeLeg(ctx, "buy", "call", strikeAbove(s, ctx.indexPrice, 1)),
      ]);
    },
  }),
  S("short-combo", "Short Combo", {
    description: "Long put + short higher call",
    education:
      "Like synthetic short with a gap — flat between strikes at expiry.",
    legsSummary: ["Buy put A", "Sell call B"],
    proficiency: "expert",
    family: "Synthetic",
    sentiment: ["bearish"],
    tags: ["nearly-unlimited-profit", "unlimited-loss"],
    payoff: "synthetic-short",
    build: (ctx) => {
      const s = strikesOf(ctx);
      return compact([
        makeLeg(ctx, "buy", "put", strikeBelow(s, ctx.indexPrice, 1)),
        makeLeg(ctx, "sell", "call", strikeAbove(s, ctx.indexPrice, 1)),
      ]);
    },
  }),
];

export function buildContext(
  indexPrice: number,
  expiration: ExpirationChain,
  farExpiration?: ExpirationChain
): PresetContext {
  const strikes = expiration.strikes.map((s) => s.strike);
  const getQuote = (
    strike: number,
    type: OptionType,
    exp?: ExpirationChain
  ): OptionQuote | null => {
    const e = exp ?? expiration;
    const row = e.strikes.find((s) => s.strike === strike);
    if (!row) return null;
    return type === "call" ? row.call : row.put;
  };

  return {
    indexPrice,
    expiration,
    farExpiration,
    atmCallStrike: pickStrike(strikes, indexPrice, "otm_call"),
    atmPutStrike: pickStrike(strikes, indexPrice, "otm_put"),
    getQuote,
  };
}

export function applyPreset(
  presetId: string,
  indexPrice: number,
  expiration: ExpirationChain,
  farExpiration?: ExpirationChain
): Omit<StrategyLeg, "id">[] {
  const preset = STRATEGY_PRESETS.find((p) => p.id === presetId);
  if (!preset) return [];
  const ctx = buildContext(indexPrice, expiration, farExpiration);
  return preset.build(ctx);
}

export function getPresetById(id: string): StrategyPreset | undefined {
  return STRATEGY_PRESETS.find((p) => p.id === id);
}

export const PROFICIENCY_ORDER: StrategyProficiency[] = [
  "novice",
  "intermediate",
  "advanced",
  "expert",
];

export const PROFICIENCY_LABEL: Record<StrategyProficiency, string> = {
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};
