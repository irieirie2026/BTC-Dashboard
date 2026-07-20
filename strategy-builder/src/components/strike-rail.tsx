"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExpiryStrip } from "@/components/expiry-strip";
import { useStrategyStore } from "@/store/strategy-store";
import { getStrikeList, nearestStrikeIndex } from "@/lib/strike-utils";
import { cn, formatPrice, shortExpiry, dteLabel } from "@/lib/utils";
import type { OptionType, Side, StrategyLeg } from "@/types/options";

const COL_W = 60;
/** How many strikes each side of ATM to show (keeps rail compact) */
const WINDOW = 10;

interface DragState {
  legId: string;
  originStrike: number;
  originSide: Side;
  previewStrike: number;
  previewSide: Side;
  shiftKey: boolean;
  altKey: boolean;
}

function chipLabel(leg: StrategyLeg, side: Side): string {
  return `${side === "buy" ? "+" : "−"}${leg.type === "call" ? "C" : "P"}`;
}

export function StrikeRail() {
  const chain = useStrategyStore((s) => s.chain);
  const legs = useStrategyStore((s) => s.legs);
  const selectedExpiryTs = useStrategyStore((s) => s.selectedExpiryTs);
  const selectedLegId = useStrategyStore((s) => s.selectedLegId);
  const setSelectedLegId = useStrategyStore((s) => s.setSelectedLegId);
  const moveLegPosition = useStrategyStore((s) => s.moveLegPosition);
  const addLegAtStrike = useStrategyStore((s) => s.addLegAtStrike);
  const removeLeg = useStrategyStore((s) => s.removeLeg);
  const toggleLegSide = useStrategyStore((s) => s.toggleLegSide);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOrigins, setDragOrigins] = useState<Record<string, number>>({});
  const [windowCenter, setWindowCenter] = useState<number | null>(null);

  const expiration = useMemo(
    () =>
      chain?.expirations.find(
        (e) => e.expirationTimestamp === selectedExpiryTs
      ) ?? chain?.expirations[0],
    [chain, selectedExpiryTs]
  );

  const allStrikes = useMemo(() => getStrikeList(expiration), [expiration]);
  const indexPrice = chain?.indexPrice ?? 0;

  const atmIndex = useMemo(() => {
    if (!allStrikes.length) return 0;
    if (!indexPrice) return Math.floor(allStrikes.length / 2);
    return nearestStrikeIndex(allStrikes, indexPrice);
  }, [allStrikes, indexPrice]);

  // Visible window of strikes (compact — no multi-thousand-px tracks)
  const { strikes, viewStart } = useMemo(() => {
    if (!allStrikes.length) return { strikes: [] as number[], viewStart: 0 };
    const center =
      windowCenter != null
        ? nearestStrikeIndex(allStrikes, windowCenter)
        : atmIndex;
    // Expand window to include all leg strikes
    let lo = Math.max(0, center - WINDOW);
    let hi = Math.min(allStrikes.length - 1, center + WINDOW);
    for (const leg of legs) {
      const i = nearestStrikeIndex(allStrikes, leg.strike);
      lo = Math.min(lo, Math.max(0, i - 2));
      hi = Math.max(hi, Math.min(allStrikes.length - 1, i + 2));
    }
    return {
      strikes: allStrikes.slice(lo, hi + 1),
      viewStart: lo,
    };
  }, [allStrikes, atmIndex, windowCenter, legs]);

  const localAtm = useMemo(() => {
    if (!strikes.length || !indexPrice) return Math.floor(strikes.length / 2);
    return nearestStrikeIndex(strikes, indexPrice);
  }, [strikes, indexPrice]);

  const strikeFromClientX = useCallback(
    (clientX: number) => {
      const scroller = scrollerRef.current;
      if (!scroller || !strikes.length) return strikes[0] ?? 0;
      const rect = scroller.getBoundingClientRect();
      const x = clientX - rect.left + scroller.scrollLeft;
      const idx = Math.round(x / COL_W - 0.5);
      return strikes[Math.min(strikes.length - 1, Math.max(0, idx))];
    },
    [strikes]
  );

  const sideFromClientY = useCallback((clientY: number): Side => {
    const track = trackRef.current ?? scrollerRef.current;
    if (!track) return "buy";
    const rect = track.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? "buy" : "sell";
  }, []);

  // Center scroller on ATM when expiry changes
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !strikes.length) return;
    const target = localAtm * COL_W - el.clientWidth / 2 + COL_W / 2;
    el.scrollLeft = Math.max(0, target);
  }, [selectedExpiryTs, localAtm, strikes.length]);

  const onChipPointerDown = (e: ReactPointerEvent, leg: StrategyLeg) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedLegId(leg.id);
    setDrag({
      legId: leg.id,
      originStrike: leg.strike,
      originSide: leg.side,
      previewStrike: leg.strike,
      previewSide: leg.side,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      setDrag((d) =>
        d
          ? {
              ...d,
              previewStrike: strikeFromClientX(e.clientX),
              previewSide: sideFromClientY(e.clientY),
              shiftKey: e.shiftKey,
              altKey: e.altKey,
            }
          : null
      );
    };
    const onUp = (e: PointerEvent) => {
      moveLegPosition(drag.legId, strikeFromClientX(e.clientX), {
        side: sideFromClientY(e.clientY),
        shiftAll: e.shiftKey && !e.altKey,
        mirror: e.altKey,
      });
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, moveLegPosition, strikeFromClientX, sideFromClientY]);

  useEffect(() => {
    if (drag) {
      setDragOrigins((prev) => {
        if (Object.keys(prev).length) return prev;
        const o: Record<string, number> = {};
        for (const l of legs) o[l.id] = l.strike;
        return o;
      });
    } else setDragOrigins({});
  }, [drag, legs]);

  const previewStrikeFor = useCallback(
    (leg: StrategyLeg): number => {
      if (!drag || !strikes.length) return leg.strike;
      if (drag.legId === leg.id) return drag.previewStrike;
      const origin = dragOrigins[leg.id] ?? leg.strike;
      if (drag.shiftKey && !drag.altKey) {
        const moved = legs.find((l) => l.id === drag.legId);
        if (moved && leg.expirationTimestamp !== moved.expirationTimestamp)
          return leg.strike;
        const fromIdx = nearestStrikeIndex(
          allStrikes,
          dragOrigins[drag.legId] ?? drag.originStrike
        );
        const toIdx = nearestStrikeIndex(allStrikes, drag.previewStrike);
        const delta = toIdx - fromIdx;
        const baseIdx = nearestStrikeIndex(allStrikes, origin);
        return allStrikes[
          Math.min(allStrikes.length - 1, Math.max(0, baseIdx + delta))
        ];
      }
      return leg.strike;
    },
    [drag, dragOrigins, legs, strikes, allStrikes]
  );

  const previewSideFor = useCallback(
    (leg: StrategyLeg): Side =>
      drag?.legId === leg.id ? drag.previewSide : leg.side,
    [drag]
  );

  const chipsByStrike = useMemo(() => {
    const map = new Map<number, { leg: StrategyLeg; side: Side }[]>();
    for (const leg of legs) {
      const s = previewStrikeFor(leg);
      const side = previewSideFor(leg);
      const arr = map.get(s) ?? [];
      arr.push({ leg, side });
      map.set(s, arr);
    }
    return map;
  }, [legs, previewStrikeFor, previewSideFor]);

  const quickAdd = (type: OptionType, side: Side) => {
    const atm = allStrikes[atmIndex] ?? indexPrice;
    addLegAtStrike(atm, type, side);
  };

  const shiftWindow = (dir: -1 | 1) => {
    if (!allStrikes.length) return;
    const cur =
      windowCenter != null
        ? nearestStrikeIndex(allStrikes, windowCenter)
        : atmIndex;
    const next = Math.min(
      allStrikes.length - 1,
      Math.max(0, cur + dir * WINDOW)
    );
    setWindowCenter(allStrikes[next]);
  };

  const multiExpiry =
    new Set(legs.map((l) => l.expirationTimestamp)).size > 1;

  return (
    <Card className="bos-strike-card">
      <CardHeader>
        <div style={{ minWidth: 0 }}>
          <CardTitle>Build on strikes</CardTitle>
          <CardDescription>
            Pick expiry → add legs at ATM or drag chips (top = long · bottom =
            short · green = call · red = put)
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {/* Full-width tools above the equal-height columns */}
        <div className="bos-leg-toolbar">
          <div className="bos-leg-toolbar-btns">
            <span className="bos-leg-toolbar-label">Add at ATM</span>
            <Button
              size="sm"
              variant="buy"
              onClick={() => quickAdd("call", "buy")}
              disabled={!allStrikes.length}
              title="Long call at ATM"
            >
              <Plus size={12} /> Call
            </Button>
            <Button
              size="sm"
              variant="buy"
              onClick={() => quickAdd("put", "buy")}
              disabled={!allStrikes.length}
              title="Long put at ATM"
            >
              <Plus size={12} /> Put
            </Button>
            <Button
              size="sm"
              variant="sell"
              onClick={() => quickAdd("call", "sell")}
              disabled={!allStrikes.length}
              title="Short call at ATM"
            >
              −Call
            </Button>
            <Button
              size="sm"
              variant="sell"
              onClick={() => quickAdd("put", "sell")}
              disabled={!allStrikes.length}
              title="Short put at ATM"
            >
              −Put
            </Button>
          </div>
          {strikes.length > 0 && (
            <div className="bos-window-nav">
              <button
                type="button"
                className="bos-nav-btn"
                onClick={() => shiftWindow(-1)}
              >
                ← Lower
              </button>
              <span className="bos-window-meta">
                {strikes[0]}–{strikes[strikes.length - 1]}
                {viewStart > 0 ||
                viewStart + strikes.length < allStrikes.length
                  ? ` / ${allStrikes.length}`
                  : ""}
                {multiExpiry ? " · multi-exp" : ""}
              </span>
              <button
                type="button"
                className="bos-nav-btn"
                onClick={() => shiftWindow(1)}
              >
                Higher →
              </button>
            </div>
          )}
        </div>

        {/* Equal-height: expiry list | strike rail only */}
        <div className="bos-strike-layout">
          <aside className="bos-strike-expiry">
            <ExpiryStrip orientation="vertical" />
          </aside>

          <div className="bos-strike-main">
            {!strikes.length ? (
              <div className="bos-rail-empty">
                {chain ? "No strikes" : "Loading market…"}
              </div>
            ) : (
              <>
                <div
                  ref={scrollerRef}
                  className="scroll-x bos-rail-scroller"
                >
                  <div
                    ref={trackRef}
                    className="rail-track"
                    style={{
                      width: strikes.length * COL_W,
                      minWidth: strikes.length * COL_W,
                    }}
                  >
                    {strikes.map((strike, i) => {
                      const isAtm = i === localAtm;
                      const column = chipsByStrike.get(strike) ?? [];
                      const longLegs = column.filter((c) => c.side === "buy");
                      const shortLegs = column.filter((c) => c.side === "sell");

                      return (
                        <div
                          key={strike}
                          className={cn("rail-col", isAtm && "is-atm")}
                        >
                          <div className="rail-long">
                            {longLegs.map(({ leg, side }) => (
                              <Chip
                                key={leg.id}
                                leg={leg}
                                strike={strike}
                                side={side}
                                selected={
                                  selectedLegId === leg.id ||
                                  drag?.legId === leg.id
                                }
                                dragging={drag?.legId === leg.id}
                                multiExpiry={multiExpiry}
                                onPointerDown={onChipPointerDown}
                                onSelect={() => setSelectedLegId(leg.id)}
                                onToggleSide={() => toggleLegSide(leg.id)}
                                onRemove={() => removeLeg(leg.id)}
                                onNudge={(dir, shift, alt) => {
                                  const idx = nearestStrikeIndex(
                                    allStrikes,
                                    leg.strike
                                  );
                                  const next = idx + dir;
                                  if (next < 0 || next >= allStrikes.length)
                                    return;
                                  moveLegPosition(leg.id, allStrikes[next], {
                                    shiftAll: shift && !alt,
                                    mirror: alt,
                                  });
                                }}
                              />
                            ))}
                          </div>

                          <div className="rail-axis">
                            <button
                              type="button"
                              className="mono"
                              onClick={() =>
                                addLegAtStrike(strike, "call", "buy")
                              }
                              style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 10,
                                color: isAtm ? "#f0b90b" : "#7d8799",
                                fontWeight: isAtm ? 700 : 400,
                                padding: "2px 4px",
                              }}
                              title={`Add long call @ ${strike}`}
                            >
                              {strike >= 1000
                                ? `${(strike / 1000).toFixed(strike % 1000 === 0 ? 0 : 1)}k`
                                : formatPrice(strike, 0)}
                            </button>
                          </div>

                          <div className="rail-short">
                            {shortLegs.map(({ leg, side }) => (
                              <Chip
                                key={leg.id}
                                leg={leg}
                                strike={strike}
                                side={side}
                                selected={
                                  selectedLegId === leg.id ||
                                  drag?.legId === leg.id
                                }
                                dragging={drag?.legId === leg.id}
                                multiExpiry={multiExpiry}
                                onPointerDown={onChipPointerDown}
                                onSelect={() => setSelectedLegId(leg.id)}
                                onToggleSide={() => toggleLegSide(leg.id)}
                                onRemove={() => removeLeg(leg.id)}
                                onNudge={(dir, shift, alt) => {
                                  const idx = nearestStrikeIndex(
                                    allStrikes,
                                    leg.strike
                                  );
                                  const next = idx + dir;
                                  if (next < 0 || next >= allStrikes.length)
                                    return;
                                  moveLegPosition(leg.id, allStrikes[next], {
                                    shiftAll: shift && !alt,
                                    mirror: alt,
                                  });
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {drag && (
                  <p
                    className="mono"
                    style={{
                      margin: "8px 0 0",
                      textAlign: "center",
                      fontSize: 12,
                      color: "#a8b0c0",
                    }}
                  >
                    <span
                      style={{
                        color:
                          drag.previewSide === "buy" ? "#0ecb81" : "#f6465d",
                      }}
                    >
                      {drag.previewSide === "buy" ? "LONG" : "SHORT"}
                    </span>
                    {" · "}${formatPrice(drag.previewStrike, 0)}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Chip({
  leg,
  strike,
  side,
  selected,
  dragging,
  multiExpiry,
  onPointerDown,
  onSelect,
  onToggleSide,
  onRemove,
  onNudge,
}: {
  leg: StrategyLeg;
  strike: number;
  side: Side;
  selected: boolean;
  dragging: boolean;
  multiExpiry: boolean;
  onPointerDown: (e: ReactPointerEvent, leg: StrategyLeg) => void;
  onSelect: () => void;
  onToggleSide: () => void;
  onRemove: () => void;
  onNudge: (dir: -1 | 1, shift: boolean, alt: boolean) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "rail-chip",
        leg.type === "call" ? "call" : "put",
        selected && "selected",
        dragging && "dragging"
      )}
      onPointerDown={(e) => onPointerDown(e, leg)}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onToggleSide();
      }}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") onRemove();
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onNudge(-1, e.shiftKey, e.altKey);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onNudge(1, e.shiftKey, e.altKey);
        }
        if (e.key === "ArrowUp" && side === "sell") onToggleSide();
        if (e.key === "ArrowDown" && side === "buy") onToggleSide();
      }}
      title={`${side} ${leg.type} ${strike} · ${leg.expirationDate}`}
    >
      <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1 }}>
        {chipLabel(leg, side)}
      </div>
      <div className="mono" style={{ fontSize: 9, opacity: 0.85 }}>
        {formatPrice(strike, 0)}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 8,
          marginTop: 2,
          color: multiExpiry ? "#7dd3fc" : "#71717a",
          fontWeight: 600,
        }}
      >
        {shortExpiry(leg.expirationDate)} · {dteLabel(leg.expirationTimestamp)}
      </div>
    </div>
  );
}
