/**
 * Multi-leg strategy analytics: net premium, Greeks, P&L surfaces,
 * breakevens, max profit/loss, and simple probability of profit.
 */

import {
  blackScholes,
  expirationPayoffBtc,
  normCdf,
  type BsOptionType,
} from "./black-scholes";
import type {
  Greeks,
  PnLPoint,
  ScenarioParams,
  StrategyLeg,
  StrategyMetrics,
} from "@/types/options";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function legSign(side: StrategyLeg["side"]): number {
  return side === "buy" ? 1 : -1;
}

function yearsToExpiry(expirationTimestamp: number, fromMs: number): number {
  return Math.max(0, (expirationTimestamp - fromMs) / YEAR_MS);
}

function effectiveIv(leg: StrategyLeg, ivMultiplier: number): number {
  const base = leg.ivOverride ?? leg.marketIv;
  return Math.max(0.01, base * ivMultiplier);
}

function legEntryCostBtc(leg: StrategyLeg): number {
  // Buy: pay premium; Sell: receive premium
  return legSign(leg.side) * leg.premium * leg.quantity;
}

/** Net debit (positive) / credit (negative) in BTC */
export function netPremiumBtc(legs: StrategyLeg[]): number {
  return legs.reduce((sum, leg) => sum + legEntryCostBtc(leg), 0);
}

/**
 * P&L at a given future spot and time, in BTC.
 * At expiration for each leg we use Deribit inverse settlement payoff.
 * Before expiration we use BS price in BTC (USD price / spot).
 */
export function strategyPnlAt(
  legs: StrategyLeg[],
  spot: number,
  asOfMs: number,
  params: Pick<ScenarioParams, "ivMultiplier" | "riskFreeRate">
): number {
  if (legs.length === 0 || spot <= 0) return 0;

  let pnl = 0;
  for (const leg of legs) {
    const sign = legSign(leg.side);
    const T = yearsToExpiry(leg.expirationTimestamp, asOfMs);
    let valueBtc: number;

    if (T <= 1e-8) {
      valueBtc = expirationPayoffBtc(spot, leg.strike, leg.type as BsOptionType);
    } else {
      const iv = effectiveIv(leg, params.ivMultiplier);
      const bs = blackScholes({
        spot,
        strike: leg.strike,
        timeToExpiryYears: T,
        volatility: iv,
        rate: params.riskFreeRate,
        type: leg.type as BsOptionType,
      });
      valueBtc = bs.priceBtc;
    }

    // Mark-to-market P&L: change in option value vs entry premium
    pnl += sign * leg.quantity * (valueBtc - leg.premium);
  }
  return pnl;
}

/** Pure expiration P&L (all legs treated as expired) */
export function strategyExpirationPnl(
  legs: StrategyLeg[],
  spot: number
): number {
  if (legs.length === 0 || spot <= 0) return 0;
  let pnl = 0;
  for (const leg of legs) {
    const payoff = expirationPayoffBtc(spot, leg.strike, leg.type as BsOptionType);
    pnl += legSign(leg.side) * leg.quantity * (payoff - leg.premium);
  }
  return pnl;
}

export function aggregateGreeks(
  legs: StrategyLeg[],
  spot: number,
  asOfMs: number,
  params: Pick<ScenarioParams, "ivMultiplier" | "riskFreeRate">
): Greeks {
  const g: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  if (legs.length === 0 || spot <= 0) return g;

  for (const leg of legs) {
    const sign = legSign(leg.side);
    const T = yearsToExpiry(leg.expirationTimestamp, asOfMs);
    const iv = effectiveIv(leg, params.ivMultiplier);
    const bs = blackScholes({
      spot,
      strike: leg.strike,
      timeToExpiryYears: T,
      volatility: iv,
      rate: params.riskFreeRate,
      type: leg.type as BsOptionType,
    });
    // Delta of coin-margined option on underlying price is subtle;
    // we report BS delta * quantity * side (USD-delta of notional BS).
    g.delta += sign * leg.quantity * bs.delta;
    g.gamma += sign * leg.quantity * bs.gamma;
    g.theta += sign * leg.quantity * bs.theta;
    g.vega += sign * leg.quantity * bs.vega;
  }
  return g;
}

/**
 * Build P&L series over a price range for charting.
 */
export function buildPnLSeries(
  legs: StrategyLeg[],
  params: ScenarioParams,
  options?: {
    points?: number;
    rangePct?: number;
    asOfMs?: number;
  }
): PnLPoint[] {
  const points = options?.points ?? 120;
  const rangePct = options?.rangePct ?? 0.45;
  const asOfMs = options?.asOfMs ?? Date.now();
  const S = params.underlyingPrice;
  if (S <= 0 || legs.length === 0) return [];

  const minP = S * (1 - rangePct);
  const maxP = S * (1 + rangePct);
  const theoAsOf = asOfMs + params.daysFromNow * 24 * 60 * 60 * 1000;

  const series: PnLPoint[] = [];
  for (let i = 0; i <= points; i++) {
    const price = minP + ((maxP - minP) * i) / points;
    series.push({
      price,
      expirationPnl: strategyExpirationPnl(legs, price),
      theoreticalPnl: strategyPnlAt(legs, price, theoAsOf, params),
    });
  }
  return series;
}

/**
 * Find breakeven underlying prices (where expiration P&L ≈ 0).
 * Scans a wide range and linearly interpolates sign changes.
 */
export function findBreakevens(
  legs: StrategyLeg[],
  spotHint: number,
  samples = 400
): number[] {
  if (legs.length === 0 || spotHint <= 0) return [];

  const strikes = legs.map((l) => l.strike);
  const lo = Math.min(spotHint * 0.3, ...strikes) * 0.5;
  const hi = Math.max(spotHint * 1.7, ...strikes) * 1.5;

  const breakevens: number[] = [];
  let prevPrice = lo;
  let prevPnl = strategyExpirationPnl(legs, lo);

  for (let i = 1; i <= samples; i++) {
    const price = lo + ((hi - lo) * i) / samples;
    const pnl = strategyExpirationPnl(legs, price);
    if (prevPnl === 0) {
      breakevens.push(prevPrice);
    } else if (pnl === 0) {
      breakevens.push(price);
    } else if (prevPnl * pnl < 0) {
      // Linear interpolate root
      const t = Math.abs(prevPnl) / (Math.abs(prevPnl) + Math.abs(pnl));
      breakevens.push(prevPrice + t * (price - prevPrice));
    }
    prevPrice = price;
    prevPnl = pnl;
  }

  // Deduplicate close roots
  const merged: number[] = [];
  for (const b of breakevens) {
    if (merged.every((m) => Math.abs(m - b) / spotHint > 0.002)) {
      merged.push(b);
    }
  }
  return merged;
}

/**
 * Max profit / max loss over a wide price grid at expiration.
 * Returns null for effectively unlimited sides.
 */
export function maxProfitLoss(
  legs: StrategyLeg[],
  spotHint: number
): { maxProfit: number | null; maxLoss: number | null } {
  if (legs.length === 0) return { maxProfit: null, maxLoss: null };

  const strikes = legs.map((l) => l.strike);
  const lo = Math.min(spotHint * 0.2, ...strikes) * 0.4;
  const hi = Math.max(spotHint * 2, ...strikes) * 1.6;
  const samples = 500;

  let maxP = -Infinity;
  let minP = Infinity;
  for (let i = 0; i <= samples; i++) {
    const price = lo + ((hi - lo) * i) / samples;
    const pnl = strategyExpirationPnl(legs, price);
    if (pnl > maxP) maxP = pnl;
    if (pnl < minP) minP = pnl;
  }

  // Inverse asymptotics: put payoff → ∞ as S→0 (long put unlimited profit; short put unlimited loss).
  // Calls are bounded (payoff → 1 BTC as S→∞).
  let netPutQty = 0;
  for (const l of legs) {
    if (l.type === "put") netPutQty += legSign(l.side) * l.quantity;
  }

  const putUnlimitedProfit = netPutQty > 1e-9;
  const putUnlimitedLoss = netPutQty < -1e-9;

  return {
    maxProfit: putUnlimitedProfit ? null : maxP,
    maxLoss: putUnlimitedLoss ? null : minP,
  };
}

/**
 * Probability of profit approximation:
 * Assume lognormal terminal price with vol = avg IV of legs, drift = r - σ²/2.
 * Integrate P(pnl(S_T) > 0) via discrete CDF between breakevens / profitable regions.
 */
export function probabilityOfProfit(
  legs: StrategyLeg[],
  spot: number,
  params: Pick<ScenarioParams, "ivMultiplier" | "riskFreeRate">
): number | null {
  if (legs.length === 0 || spot <= 0) return null;

  // Use nearest expiration and average IV
  const now = Date.now();
  const nearestExp = Math.min(...legs.map((l) => l.expirationTimestamp));
  const T = yearsToExpiry(nearestExp, now);
  if (T <= 1e-8) {
    const pnl = strategyExpirationPnl(legs, spot);
    return pnl > 0 ? 1 : pnl < 0 ? 0 : 0.5;
  }

  const avgIv =
    legs.reduce((s, l) => s + effectiveIv(l, params.ivMultiplier), 0) /
    legs.length;

  const samples = 300;
  const lo = spot * Math.exp(-3 * avgIv * Math.sqrt(T));
  const hi = spot * Math.exp(3 * avgIv * Math.sqrt(T));

  // Risk-neutral lognormal density via change of variable
  let profitMass = 0;
  let totalMass = 0;
  const mu = Math.log(spot) + (params.riskFreeRate - 0.5 * avgIv * avgIv) * T;
  const std = avgIv * Math.sqrt(T);

  for (let i = 0; i <= samples; i++) {
    const price = lo + ((hi - lo) * i) / samples;
    const pnl = strategyExpirationPnl(legs, price);
    // Approximate density weight using CDF buckets
    const z0 = (Math.log(Math.max(price - (hi - lo) / samples / 2, 1e-12)) - mu) / std;
    const z1 = (Math.log(price + (hi - lo) / samples / 2) - mu) / std;
    const mass = Math.max(0, normCdf(z1) - normCdf(z0));
    totalMass += mass;
    if (pnl > 0) profitMass += mass;
  }

  if (totalMass <= 0) return null;
  return Math.min(1, Math.max(0, profitMass / totalMass));
}

export function computeStrategyMetrics(
  legs: StrategyLeg[],
  params: ScenarioParams,
  asOfMs = Date.now()
): StrategyMetrics {
  const index = params.underlyingPrice;
  const netPrem = netPremiumBtc(legs);
  const { maxProfit, maxLoss } = maxProfitLoss(legs, index);
  const breakevens = findBreakevens(legs, index);
  const greeks = aggregateGreeks(legs, index, asOfMs, params);
  const theoAsOf = asOfMs + params.daysFromNow * 24 * 60 * 60 * 1000;

  // Theoretical value of open options (mark) vs entry
  let theoValue = 0;
  for (const leg of legs) {
    const T = yearsToExpiry(leg.expirationTimestamp, theoAsOf);
    const iv = effectiveIv(leg, params.ivMultiplier);
    const bs = blackScholes({
      spot: index,
      strike: leg.strike,
      timeToExpiryYears: T,
      volatility: iv,
      rate: params.riskFreeRate,
      type: leg.type,
    });
    theoValue += legSign(leg.side) * leg.quantity * bs.priceBtc;
  }

  const theoPnl = strategyPnlAt(legs, index, theoAsOf, params);
  const pop = probabilityOfProfit(legs, index, params);

  return {
    netPremiumBtc: netPrem,
    netPremiumUsd: netPrem * index,
    maxProfitBtc: maxProfit,
    maxLossBtc: maxLoss,
    maxProfitUsd: maxProfit !== null ? maxProfit * index : null,
    maxLossUsd: maxLoss !== null ? maxLoss * index : null,
    breakevens,
    probabilityOfProfit: pop,
    greeks,
    theoreticalValueBtc: theoValue,
    theoreticalPnlBtc: theoPnl,
  };
}
