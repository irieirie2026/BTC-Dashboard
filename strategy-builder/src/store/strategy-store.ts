"use client";

import { create } from "zustand";
import type {
  ExpirationChain,
  OptionQuote,
  OptionType,
  OptionsChainData,
  Side,
  StrategyLeg,
} from "@/types/options";
import { applyPreset } from "@/lib/presets";
import { uid } from "@/lib/utils";
import {
  getQuoteFromExpiration,
  getStrikeList,
  mirroredStrikeMove,
  nearestStrike,
  quoteToLegFields,
  shiftStrike,
} from "@/lib/strike-utils";

interface StrategyState {
  legs: StrategyLeg[];
  chain: OptionsChainData | null;
  chainError: string | null;
  chainLoading: boolean;
  /** Expiry used when adding new legs / rail strike grid */
  selectedExpiryTs: number | null;
  selectedLegId: string | null;
  chainPanelOpen: boolean;

  scenarioSpot: number;
  daysFromNow: number;
  ivMultiplier: number;
  riskFreeRate: number;
  spotSliderTouched: boolean;

  setChainLoading: (v: boolean) => void;
  setChain: (data: OptionsChainData | null, error?: string | null) => void;
  /** Change active expiry for *new* legs only — does not rebind existing legs */
  setSelectedExpiry: (ts: number) => void;
  setSelectedLegId: (id: string | null) => void;
  setChainPanelOpen: (open: boolean) => void;

  setScenarioSpot: (spot: number) => void;
  setDaysFromNow: (days: number) => void;
  setIvMultiplier: (m: number) => void;
  setRiskFreeRate: (r: number) => void;

  addLegFromQuote: (
    quote: OptionQuote,
    type: OptionType,
    strike: number,
    expirationTimestamp: number,
    expirationDate: string,
    side?: Side
  ) => void;
  addLeg: (leg: Omit<StrategyLeg, "id">) => void;
  addLegAtStrike: (
    strike: number,
    type: OptionType,
    side: Side,
    quantity?: number
  ) => void;
  updateLeg: (id: string, patch: Partial<StrategyLeg>) => void;
  removeLeg: (id: string) => void;
  clearLegs: () => void;
  toggleLegSide: (id: string) => void;
  setLegSide: (id: string, side: Side) => void;
  toggleLegType: (id: string) => void;
  /** Change a single leg's expiration (calendar spreads) */
  setLegExpiration: (id: string, expirationTimestamp: number) => void;
  applyPresetById: (presetId: string, expiration?: ExpirationChain) => void;

  /**
   * Move leg strike (and optional side). Uses the leg's own expiry for quotes.
   * shiftAll / mirror only affect other legs on the same expiry.
   */
  moveLegPosition: (
    id: string,
    targetStrike: number,
    opts?: {
      side?: Side;
      shiftAll?: boolean;
      mirror?: boolean;
    }
  ) => void;

  /** @deprecated use moveLegPosition */
  moveLegStrike: (
    id: string,
    targetStrike: number,
    opts?: { shiftAll?: boolean; mirror?: boolean }
  ) => void;

  getSelectedExpiration: () => ExpirationChain | undefined;
  getExpirationByTs: (ts: number) => ExpirationChain | undefined;
}

function findExpiration(
  chain: OptionsChainData | null,
  ts: number | null
): ExpirationChain | undefined {
  if (!chain || ts == null) return undefined;
  return (
    chain.expirations.find((e) => e.expirationTimestamp === ts) ??
    chain.expirations[0]
  );
}

function applyStrikeToLeg(
  leg: StrategyLeg,
  strike: number,
  expiration: ExpirationChain
): StrategyLeg {
  const quote = getQuoteFromExpiration(expiration, strike, leg.type);
  if (!quote) {
    return {
      ...leg,
      strike,
      expirationTimestamp: expiration.expirationTimestamp,
      expirationDate: expiration.expirationDate,
    };
  }
  return {
    ...leg,
    ...quoteToLegFields(quote, strike, leg.type, expiration),
  };
}

export const useStrategyStore = create<StrategyState>((set, get) => ({
  legs: [],
  chain: null,
  chainError: null,
  chainLoading: true,
  selectedExpiryTs: null,
  selectedLegId: null,
  // Always start expanded so the chain is visible in the dashboard embed
  chainPanelOpen: true,

  scenarioSpot: 0,
  daysFromNow: 0,
  ivMultiplier: 1,
  riskFreeRate: 0.045,
  spotSliderTouched: false,

  setChainLoading: (v) => set({ chainLoading: v }),

  setChain: (data, error = null) => {
    const state = get();
    const selectedExpiryTs =
      state.selectedExpiryTs &&
      data?.expirations.some(
        (e) => e.expirationTimestamp === state.selectedExpiryTs
      )
        ? state.selectedExpiryTs
        : (data?.expirations[0]?.expirationTimestamp ?? null);

    const scenarioSpot =
      !state.spotSliderTouched && data
        ? data.indexPrice
        : state.scenarioSpot || data?.indexPrice || 0;

    let daysFromNow = state.daysFromNow;
    if (data && selectedExpiryTs) {
      const exp = data.expirations.find(
        (e) => e.expirationTimestamp === selectedExpiryTs
      );
      if (exp && daysFromNow > exp.daysToExpiration) {
        daysFromNow = Math.floor(exp.daysToExpiration);
      }
    }

    set({
      chain: data,
      chainError: error,
      chainLoading: false,
      selectedExpiryTs,
      scenarioSpot,
      daysFromNow,
    });
  },

  // Only switches the "active" expiry for new legs — keeps multi-expiry strategies intact
  setSelectedExpiry: (ts) => set({ selectedExpiryTs: ts }),

  setSelectedLegId: (id) => set({ selectedLegId: id }),
  setChainPanelOpen: (open) => set({ chainPanelOpen: open }),

  setScenarioSpot: (spot) =>
    set({ scenarioSpot: spot, spotSliderTouched: true }),
  setDaysFromNow: (days) => set({ daysFromNow: Math.max(0, days) }),
  setIvMultiplier: (m) => set({ ivMultiplier: Math.max(0.1, m) }),
  setRiskFreeRate: (r) => set({ riskFreeRate: Math.max(0, r) }),

  getSelectedExpiration: () => {
    const { chain, selectedExpiryTs } = get();
    return findExpiration(chain, selectedExpiryTs);
  },

  getExpirationByTs: (ts) => findExpiration(get().chain, ts),

  addLegFromQuote: (
    quote,
    type,
    strike,
    expirationTimestamp,
    expirationDate,
    side = "buy"
  ) => {
    const premium =
      quote.mark > 0
        ? quote.mark
        : ((quote.bid ?? 0) + (quote.ask ?? 0)) / 2 || 0.001;

    const id = uid();
    set((s) => ({
      legs: [
        ...s.legs,
        {
          id,
          side,
          type,
          instrumentName: quote.instrumentName,
          expirationTimestamp,
          expirationDate,
          strike,
          quantity: 1,
          premium,
          ivOverride: null,
          marketIv: quote.iv > 0 ? quote.iv : 0.5,
        },
      ],
      selectedLegId: id,
      selectedExpiryTs: expirationTimestamp,
    }));
  },

  addLeg: (leg) => {
    const id = uid();
    set((s) => ({
      legs: [...s.legs, { ...leg, id }],
      selectedLegId: id,
    }));
  },

  addLegAtStrike: (strike, type, side, quantity = 1) => {
    const exp = get().getSelectedExpiration();
    if (!exp) return;
    const strikes = getStrikeList(exp);
    const snapped = nearestStrike(strikes, strike);
    const quote = getQuoteFromExpiration(exp, snapped, type);
    if (!quote) return;
    const fields = quoteToLegFields(quote, snapped, type, exp);
    const id = uid();
    set((s) => ({
      legs: [
        ...s.legs,
        {
          id,
          side,
          quantity,
          ivOverride: null,
          ...fields,
        },
      ],
      selectedLegId: id,
    }));
  },

  updateLeg: (id, patch) =>
    set((s) => ({
      legs: s.legs.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),

  removeLeg: (id) =>
    set((s) => ({
      legs: s.legs.filter((l) => l.id !== id),
      selectedLegId: s.selectedLegId === id ? null : s.selectedLegId,
    })),

  clearLegs: () => set({ legs: [], selectedLegId: null }),

  toggleLegSide: (id) =>
    set((s) => ({
      legs: s.legs.map((l) =>
        l.id === id ? { ...l, side: l.side === "buy" ? "sell" : "buy" } : l
      ),
    })),

  setLegSide: (id, side) =>
    set((s) => ({
      legs: s.legs.map((l) => (l.id === id ? { ...l, side } : l)),
    })),

  toggleLegType: (id) => {
    const { legs, chain } = get();
    const leg = legs.find((l) => l.id === id);
    if (!leg || !chain) return;
    const exp = findExpiration(chain, leg.expirationTimestamp);
    if (!exp) return;
    const nextType: OptionType = leg.type === "call" ? "put" : "call";
    const quote = getQuoteFromExpiration(exp, leg.strike, nextType);
    if (!quote) return;
    const fields = quoteToLegFields(quote, leg.strike, nextType, exp);
    set((s) => ({
      legs: s.legs.map((l) => (l.id === id ? { ...l, ...fields } : l)),
    }));
  },

  setLegExpiration: (id, expirationTimestamp) => {
    const { chain, legs } = get();
    if (!chain) return;
    const leg = legs.find((l) => l.id === id);
    if (!leg) return;
    const exp = findExpiration(chain, expirationTimestamp);
    if (!exp) return;
    const strikes = getStrikeList(exp);
    const strike = nearestStrike(strikes, leg.strike);
    set((s) => ({
      legs: s.legs.map((l) =>
        l.id === id ? applyStrikeToLeg(l, strike, exp) : l
      ),
      selectedExpiryTs: expirationTimestamp,
    }));
  },

  applyPresetById: (presetId, expiration) => {
    const { chain, selectedExpiryTs } = get();
    if (!chain) return;
    const exp =
      expiration ??
      chain.expirations.find(
        (e) => e.expirationTimestamp === selectedExpiryTs
      ) ??
      chain.expirations[0];
    if (!exp) return;

    // Next later expiry for calendars / diagonals
    const far =
      chain.expirations.find(
        (e) => e.expirationTimestamp > exp.expirationTimestamp
      ) ?? undefined;

    const built = applyPreset(presetId, chain.indexPrice, exp, far);
    if (built.length === 0) return;

    const withIds = built.map((l) => ({ ...l, id: uid() }));
    set({
      legs: withIds,
      selectedExpiryTs: exp.expirationTimestamp,
      daysFromNow: 0,
      selectedLegId: withIds[0]?.id ?? null,
    });
  },

  moveLegPosition: (id, targetStrike, opts = {}) => {
    const { legs, chain } = get();
    if (!chain) return;

    const leg = legs.find((l) => l.id === id);
    if (!leg) return;

    // Use the leg's own expiry for quote refresh (multi-expiry safe)
    const legExp =
      findExpiration(chain, leg.expirationTimestamp) ??
      findExpiration(chain, get().selectedExpiryTs);
    if (!legExp) return;

    const strikes = getStrikeList(legExp);
    if (strikes.length === 0) return;

    const fromIdx = strikes.indexOf(nearestStrike(strikes, leg.strike));
    const toStrike = nearestStrike(strikes, targetStrike);
    const toIdx = strikes.indexOf(toStrike);
    const delta = toIdx - fromIdx;
    const nextSide = opts.side ?? leg.side;

    if (opts.shiftAll && delta !== 0) {
      set((s) => ({
        legs: s.legs.map((l) => {
          // Only shift legs on the same expiry
          if (l.expirationTimestamp !== leg.expirationTimestamp) return l;
          const exp =
            findExpiration(chain, l.expirationTimestamp) ?? legExp;
          const next = shiftStrike(getStrikeList(exp), l.strike, delta);
          const moved = applyStrikeToLeg(l, next, exp);
          return l.id === id ? { ...moved, side: nextSide } : moved;
        }),
        selectedLegId: id,
      }));
      return;
    }

    if (opts.mirror) {
      const sameExpLegs = legs.filter(
        (l) => l.expirationTimestamp === leg.expirationTimestamp
      );
      const moves = mirroredStrikeMove(sameExpLegs, id, toStrike, strikes);
      set((s) => ({
        legs: s.legs.map((l) => {
          const ns = moves.get(l.id);
          if (ns === undefined) {
            return l.id === id ? { ...l, side: nextSide } : l;
          }
          const exp =
            findExpiration(chain, l.expirationTimestamp) ?? legExp;
          const moved = applyStrikeToLeg(l, ns, exp);
          return l.id === id ? { ...moved, side: nextSide } : moved;
        }),
        selectedLegId: id,
      }));
      return;
    }

    set((s) => ({
      legs: s.legs.map((l) => {
        if (l.id !== id) return l;
        return { ...applyStrikeToLeg(l, toStrike, legExp), side: nextSide };
      }),
      selectedLegId: id,
    }));
  },

  moveLegStrike: (id, targetStrike, opts = {}) => {
    get().moveLegPosition(id, targetStrike, opts);
  },
}));
