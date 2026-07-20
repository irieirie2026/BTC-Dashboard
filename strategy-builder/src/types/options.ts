/** Shared domain types for BTC OptionStrat */

export type OptionType = "call" | "put";
export type Side = "buy" | "sell";

/** Raw instrument from Deribit get_instruments */
export interface DeribitInstrument {
  instrument_name: string;
  kind: string;
  option_type: OptionType;
  strike: number;
  expiration_timestamp: number;
  is_active: boolean;
  base_currency: string;
  quote_currency: string;
  settlement_currency: string;
  contract_size: number;
  tick_size: number;
  min_trade_amount: number;
  creation_timestamp: number;
  instrument_id?: number;
}

/** Raw book summary from Deribit get_book_summary_by_currency */
export interface DeribitBookSummary {
  instrument_name: string;
  base_currency: string;
  quote_currency: string;
  mark_price: number;
  bid_price: number | null;
  ask_price: number | null;
  mid_price: number | null;
  last: number | null;
  open_interest: number;
  volume: number;
  volume_usd?: number;
  /** Mark IV in percent (e.g. 55.2 = 55.2%) */
  mark_iv: number;
  underlying_price: number;
  underlying_index: string;
  interest_rate?: number;
  estimated_delivery_price?: number;
  creation_timestamp?: number;
  price_change?: number | null;
  high?: number | null;
  low?: number | null;
}

/** One side (call or put) of a strike row */
export interface OptionQuote {
  instrumentName: string;
  bid: number | null;
  ask: number | null;
  mark: number;
  /** IV as decimal (0.55 = 55%) */
  iv: number;
  openInterest: number;
  volume: number;
}

/** Strike row with both call and put */
export interface StrikeRow {
  strike: number;
  call: OptionQuote | null;
  put: OptionQuote | null;
}

/** Expiration group in the chain */
export interface ExpirationChain {
  /** YYYY-MM-DD label */
  expirationDate: string;
  expirationTimestamp: number;
  /** Days to expiration (calendar, from now) */
  daysToExpiration: number;
  strikes: StrikeRow[];
}

/** Full options chain payload returned to the client */
export interface OptionsChainData {
  indexPrice: number;
  /** Unix ms when data was fetched */
  fetchedAt: number;
  expirations: ExpirationChain[];
  /** Flat map instrument_name → quote for quick lookups */
  quotesByInstrument: Record<string, OptionQuote & { type: OptionType; strike: number; expirationTimestamp: number }>;
}

/** A single strategy leg */
export interface StrategyLeg {
  id: string;
  side: Side;
  type: OptionType;
  /** instrument_name when known, else synthetic */
  instrumentName: string;
  expirationTimestamp: number;
  expirationDate: string;
  strike: number;
  quantity: number;
  /** Entry premium in BTC per contract (mark or mid used when added) */
  premium: number;
  /** IV as decimal; null = use market / global override */
  ivOverride: number | null;
  /** Market IV at time of add (decimal) */
  marketIv: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface StrategyMetrics {
  /** Net premium paid (positive = debit) or received (negative = credit), BTC */
  netPremiumBtc: number;
  netPremiumUsd: number;
  maxProfitBtc: number | null;
  maxLossBtc: number | null;
  maxProfitUsd: number | null;
  maxLossUsd: number | null;
  breakevens: number[];
  probabilityOfProfit: number | null;
  greeks: Greeks;
  theoreticalValueBtc: number;
  theoreticalPnlBtc: number;
}

export interface PnLPoint {
  price: number;
  expirationPnl: number;
  theoreticalPnl: number;
}

export interface ScenarioParams {
  /** Underlying price for scenario (USD) */
  underlyingPrice: number;
  /** Calendar days from now for theoretical curve */
  daysFromNow: number;
  /** Global IV multiplier: 1 = no change, 1.1 = +10% relative */
  ivMultiplier: number;
  /** Risk-free rate (decimal) */
  riskFreeRate: number;
}

export type StrategyProficiency =
  | "novice"
  | "intermediate"
  | "advanced"
  | "expert";

export type StrategySentiment =
  | "bullish"
  | "bearish"
  | "neutral"
  | "volatile"
  | "income";

export type ProfitLossTag =
  | "unlimited-profit"
  | "limited-profit"
  | "unlimited-loss"
  | "limited-loss"
  | "nearly-unlimited-profit"
  | "nearly-unlimited-loss";

/** Qualitative payoff shape for mini diagrams */
export type PayoffShape =
  | "long-call"
  | "long-put"
  | "short-call"
  | "short-put"
  | "bull-call"
  | "bear-put"
  | "bull-put"
  | "bear-call"
  | "straddle"
  | "strangle"
  | "short-straddle"
  | "short-strangle"
  | "iron-condor"
  | "iron-butterfly"
  | "long-butterfly"
  | "short-butterfly"
  | "inverse-condor"
  | "calendar"
  | "risk-reversal"
  | "jade-lizard"
  | "ladder-bull"
  | "ladder-bear"
  | "ratio-back"
  | "ratio-front"
  | "synthetic-long"
  | "synthetic-short"
  | "strip"
  | "strap";

export interface StrategyPreset {
  id: string;
  name: string;
  /** Short one-liner for cards */
  description: string;
  /** Longer educational blurb */
  education: string;
  /** Construction steps for UI */
  legsSummary: string[];
  proficiency: StrategyProficiency;
  /** Primary grouping in the library */
  family: string;
  sentiment: StrategySentiment[];
  tags: ProfitLossTag[];
  aliases?: string[];
  payoff: PayoffShape;
  /** Needs a second (further) expiry from the chain */
  needsSecondExpiry?: boolean;
  /** Build legs from chain context; returns empty if not enough data */
  build: (ctx: PresetContext) => Omit<StrategyLeg, "id">[];
}

export interface PresetContext {
  indexPrice: number;
  expiration: ExpirationChain;
  /** Further expiration when available (calendars / diagonals) */
  farExpiration?: ExpirationChain;
  /** Nearest OTM call strike >= index */
  atmCallStrike: number;
  atmPutStrike: number;
  getQuote: (
    strike: number,
    type: OptionType,
    exp?: ExpirationChain
  ) => OptionQuote | null;
}
