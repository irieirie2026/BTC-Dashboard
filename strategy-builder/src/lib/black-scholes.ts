/**
 * Black–Scholes–Merton pricing for European options.
 *
 * Deribit BTC options are European and coin-margined (premium quoted in BTC).
 * We price in USD (standard BS) then convert to BTC by dividing by spot:
 *   premium_btc ≈ premium_usd / S
 *
 * This is the common approximation used by retail crypto options tools.
 * True inverse-option formulas exist but add little for an MVP visualizer.
 *
 * Conventions:
 * - S: spot (USD)
 * - K: strike (USD)
 * - T: time to expiry in years
 * - r: continuous risk-free rate (decimal)
 * - sigma: volatility (decimal, e.g. 0.55)
 * - Theta is per calendar day (not per year)
 * - Vega is per 1 percentage point IV change (0.01 absolute)
 */

export type BsOptionType = "call" | "put";

export interface BsInputs {
  spot: number;
  strike: number;
  timeToExpiryYears: number;
  volatility: number;
  rate: number;
  type: BsOptionType;
}

export interface BsResult {
  priceUsd: number;
  priceBtc: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  d1: number;
  d2: number;
}

/** Standard normal CDF via Abramowitz & Stegun approximation */
export function normCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp((-absX * absX) / 2);
  return 0.5 * (1 + sign * y);
}

/** Standard normal PDF */
export function normPdf(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

function safeVol(sigma: number): number {
  return Math.max(sigma, 1e-8);
}

function safeTime(T: number): number {
  return Math.max(T, 1e-10);
}

export function blackScholes(inputs: BsInputs): BsResult {
  const { spot: S, strike: K, rate: r, type } = inputs;
  const sigma = safeVol(inputs.volatility);
  const T = inputs.timeToExpiryYears;

  // Deep at-expiry / expired: intrinsic only
  if (T <= 1e-10 || !Number.isFinite(T)) {
    const intrinsicUsd =
      type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const priceBtc = S > 0 ? intrinsicUsd / S : 0;
    const delta =
      type === "call" ? (S > K ? 1 : S === K ? 0.5 : 0) : S < K ? -1 : S === K ? -0.5 : 0;
    return {
      priceUsd: intrinsicUsd,
      priceBtc,
      delta,
      gamma: 0,
      theta: 0,
      vega: 0,
      d1: 0,
      d2: 0,
    };
  }

  const sqrtT = Math.sqrt(safeTime(T));
  const d1 =
    (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const Nmd1 = normCdf(-d1);
  const Nmd2 = normCdf(-d2);
  const pdfD1 = normPdf(d1);
  const disc = Math.exp(-r * T);

  let priceUsd: number;
  let delta: number;

  if (type === "call") {
    priceUsd = S * Nd1 - K * disc * Nd2;
    delta = Nd1;
  } else {
    priceUsd = K * disc * Nmd2 - S * Nmd1;
    delta = -Nmd1;
  }

  // Gamma same for call/put
  const gamma = pdfD1 / (S * sigma * sqrtT);

  // Theta (per year), then convert to per calendar day
  // Call: -S n(d1) σ / (2√T) - r K e^{-rT} N(d2)
  // Put:  -S n(d1) σ / (2√T) + r K e^{-rT} N(-d2)
  const commonTheta = (-S * pdfD1 * sigma) / (2 * sqrtT);
  const thetaYear =
    type === "call"
      ? commonTheta - r * K * disc * Nd2
      : commonTheta + r * K * disc * Nmd2;
  const theta = thetaYear / 365;

  // Vega per 1 vol point (1% absolute): ∂V/∂σ / 100, σ in decimal
  const vegaPerUnitVol = S * pdfD1 * sqrtT; // ∂V/∂σ where σ is decimal
  const vega = vegaPerUnitVol / 100;

  const priceBtc = S > 0 ? priceUsd / S : 0;

  return {
    priceUsd: Math.max(priceUsd, 0),
    priceBtc: Math.max(priceBtc, 0),
    delta,
    gamma,
    theta: S > 0 ? theta / S : 0, // express theta in BTC terms for consistency
    vega: S > 0 ? vega / S : 0, // vega in BTC per vol point
    d1,
    d2,
  };
}

/**
 * Expiration payoff in BTC (inverse / coin-margined convention used by Deribit):
 * Call settles to max(S-K, 0) / S  BTC
 * Put  settles to max(K-S, 0) / S  BTC
 */
export function expirationPayoffBtc(
  spot: number,
  strike: number,
  type: BsOptionType
): number {
  if (spot <= 0) return 0;
  if (type === "call") return Math.max(spot - strike, 0) / spot;
  return Math.max(strike - spot, 0) / spot;
}

/**
 * Linear (USD-style) payoff converted to BTC at given spot.
 * Useful for charting; not identical to Deribit settlement.
 */
export function expirationPayoffLinearBtc(
  spot: number,
  strike: number,
  type: BsOptionType,
  premiumRefSpot: number
): number {
  const payoffUsd =
    type === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  const ref = premiumRefSpot > 0 ? premiumRefSpot : spot;
  return payoffUsd / ref;
}

/**
 * Approximate probability of finishing ITM under lognormal dynamics:
 * Call: N(d2), Put: N(-d2)  (risk-neutral, r included)
 */
export function probabilityItm(inputs: Omit<BsInputs, "type"> & { type: BsOptionType }): number {
  const sigma = safeVol(inputs.volatility);
  const T = inputs.timeToExpiryYears;
  if (T <= 1e-10) {
    if (inputs.type === "call") return inputs.spot > inputs.strike ? 1 : 0;
    return inputs.spot < inputs.strike ? 1 : 0;
  }
  const sqrtT = Math.sqrt(T);
  const d2 =
    (Math.log(inputs.spot / inputs.strike) +
      (inputs.rate - (sigma * sigma) / 2) * T) /
    (sigma * sqrtT);
  return inputs.type === "call" ? normCdf(d2) : normCdf(-d2);
}
