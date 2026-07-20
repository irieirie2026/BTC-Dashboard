import type {
  ExpirationChain,
  OptionQuote,
  OptionType,
  StrategyLeg,
} from "@/types/options";

/** Nearest strike in a sorted list */
export function nearestStrike(strikes: number[], target: number): number {
  if (strikes.length === 0) return target;
  return strikes.reduce((best, s) =>
    Math.abs(s - target) < Math.abs(best - target) ? s : best
  );
}

/** Index of nearest strike */
export function nearestStrikeIndex(strikes: number[], target: number): number {
  if (strikes.length === 0) return 0;
  let best = 0;
  for (let i = 1; i < strikes.length; i++) {
    if (Math.abs(strikes[i] - target) < Math.abs(strikes[best] - target)) {
      best = i;
    }
  }
  return best;
}

export function getStrikeList(expiration: ExpirationChain | undefined): number[] {
  if (!expiration) return [];
  return expiration.strikes.map((s) => s.strike).sort((a, b) => a - b);
}

export function getQuoteFromExpiration(
  expiration: ExpirationChain | undefined,
  strike: number,
  type: OptionType
): OptionQuote | null {
  if (!expiration) return null;
  const row = expiration.strikes.find((s) => s.strike === strike);
  if (!row) return null;
  return type === "call" ? row.call : row.put;
}

/** Build partial leg fields from a quote at a new strike */
export function quoteToLegFields(
  quote: OptionQuote,
  strike: number,
  type: OptionType,
  expiration: ExpirationChain
): Pick<
  StrategyLeg,
  | "instrumentName"
  | "strike"
  | "premium"
  | "marketIv"
  | "expirationTimestamp"
  | "expirationDate"
  | "type"
> {
  const premium =
    quote.mark > 0
      ? quote.mark
      : ((quote.bid ?? 0) + (quote.ask ?? 0)) / 2 || 0.001;
  return {
    instrumentName: quote.instrumentName,
    strike,
    type,
    premium,
    marketIv: quote.iv > 0 ? quote.iv : 0.5,
    expirationTimestamp: expiration.expirationTimestamp,
    expirationDate: expiration.expirationDate,
  };
}

/**
 * Shift a strike by N steps in the available strike list.
 * Clamps to ends of the list.
 */
export function shiftStrike(
  strikes: number[],
  current: number,
  steps: number
): number {
  if (strikes.length === 0) return current;
  const idx = nearestStrikeIndex(strikes, current);
  const next = Math.min(strikes.length - 1, Math.max(0, idx + steps));
  return strikes[next];
}

/**
 * For iron condors / butterflies: when moving one wing, move the opposite
 * wing the opposite direction (mirror around center of structure).
 */
export function mirroredStrikeMove(
  legs: StrategyLeg[],
  movedLegId: string,
  newStrike: number,
  strikes: number[]
): Map<string, number> {
  const result = new Map<string, number>();
  const moved = legs.find((l) => l.id === movedLegId);
  if (!moved) return result;

  const oldStrike = moved.strike;
  const oldIdx = nearestStrikeIndex(strikes, oldStrike);
  const newIdx = nearestStrikeIndex(strikes, newStrike);
  const delta = newIdx - oldIdx;
  if (delta === 0) {
    result.set(movedLegId, newStrike);
    return result;
  }

  result.set(movedLegId, strikes[newIdx]);

  // Opposite type + opposite side tends to be the paired wing
  // e.g. short put ↔ short call, long put wing ↔ long call wing
  const partner = legs.find(
    (l) =>
      l.id !== movedLegId &&
      l.type !== moved.type &&
      l.side === moved.side &&
      l.expirationTimestamp === moved.expirationTimestamp
  );

  if (partner) {
    const pIdx = nearestStrikeIndex(strikes, partner.strike);
    // Mirror: if we move call wing higher, move put wing lower
    const mirrorDelta = moved.type === "call" ? -delta : delta;
    // Actually OptionStrat: move opposing option in opposite direction
    // If short call goes up in strike, short put goes down
    const oppIdx = Math.min(
      strikes.length - 1,
      Math.max(0, pIdx - delta)
    );
    void mirrorDelta;
    result.set(partner.id, strikes[oppIdx]);
  }

  return result;
}
