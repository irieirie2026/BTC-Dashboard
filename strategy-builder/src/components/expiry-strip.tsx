"use client";

import { useEffect, useRef } from "react";
import { useStrategyStore } from "@/store/strategy-store";
import { cn, shortExpiry } from "@/lib/utils";

/**
 * Expiration selector (vertical panel matches strike rail height).
 * - Click: expiry for *new* legs
 * - Shift+click: move *selected* leg here
 */
export function ExpiryStrip({
  orientation = "horizontal",
}: {
  orientation?: "horizontal" | "vertical";
}) {
  const chain = useStrategyStore((s) => s.chain);
  const selectedExpiryTs = useStrategyStore((s) => s.selectedExpiryTs);
  const setSelectedExpiry = useStrategyStore((s) => s.setSelectedExpiry);
  const selectedLegId = useStrategyStore((s) => s.selectedLegId);
  const legs = useStrategyStore((s) => s.legs);
  const setLegExpiration = useStrategyStore((s) => s.setLegExpiration);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const selectedLeg = legs.find((l) => l.id === selectedLegId);
  const legExpiryTs = selectedLeg?.expirationTimestamp;
  const usedExpiries = new Set(legs.map((l) => l.expirationTimestamp));
  const vertical = orientation === "vertical";

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !selectedExpiryTs) return;
    const active = el.querySelector<HTMLElement>(
      `[data-exp="${selectedExpiryTs}"]`
    );
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [selectedExpiryTs]);

  if (!chain?.expirations.length) {
    return (
      <div className="bos-expiry-loading">Loading expirations…</div>
    );
  }

  return (
    <div className="bos-expiry" data-orientation={orientation}>
      <div className="bos-expiry-hd">
        <div className="bos-expiry-title">Expiration</div>
        <p className="bos-expiry-hint">
          <strong>Click</strong> = new legs use this date.
          <br />
          <strong>Shift+click</strong> = move selected leg here
          {selectedLeg
            ? ` (${selectedLeg.side[0].toUpperCase()}${selectedLeg.type[0].toUpperCase()} ${selectedLeg.strike})`
            : " (select a leg first)"}.
        </p>
      </div>

      <div
        ref={scrollerRef}
        className={vertical ? "scroll-xy bos-expiry-list" : "scroll-x bos-expiry-list"}
      >
        {chain.expirations.map((exp) => {
          const active = exp.expirationTimestamp === selectedExpiryTs;
          const onSelectedLeg =
            legExpiryTs === exp.expirationTimestamp && !!selectedLeg;
          const inStrategy = usedExpiries.has(exp.expirationTimestamp);
          const dte = Math.round(exp.daysToExpiration);

          return (
            <button
              key={exp.expirationTimestamp}
              type="button"
              data-exp={exp.expirationTimestamp}
              className={cn(
                "bos-exp-btn",
                active && "is-active",
                onSelectedLeg && "is-leg-exp",
                inStrategy && "is-used"
              )}
              onClick={(e) => {
                if (e.shiftKey && selectedLegId) {
                  setLegExpiration(selectedLegId, exp.expirationTimestamp);
                  return;
                }
                setSelectedExpiry(exp.expirationTimestamp);
              }}
              title={
                selectedLegId
                  ? `${exp.expirationDate}: click for new legs · Shift+click to move selected leg`
                  : `${exp.expirationDate}: click so new legs use this expiry`
              }
            >
              <span className="mono bos-exp-date">
                {shortExpiry(exp.expirationDate)}
              </span>
              <span className="mono bos-exp-dte">
                {dte}d
                {inStrategy && <span className="bos-exp-dot" title="Used in strategy">●</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
