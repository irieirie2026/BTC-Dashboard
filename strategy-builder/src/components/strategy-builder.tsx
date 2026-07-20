"use client";

import { Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useStrategyStore } from "@/store/strategy-store";
import {
  formatBtc,
  formatIv,
  formatPrice,
  cn,
  shortExpiry,
  dteLabel,
} from "@/lib/utils";
import { netPremiumBtc } from "@/lib/strategy-analytics";
import { StrategyLibrary } from "@/components/strategy-library";
import { HelpTip, TooltipProvider } from "@/components/ui/tooltip";

/**
 * Top strategy area — logical order:
 * 1) Open legs + net premium + clear
 * 2) Edit selected leg
 * 3) Preset library (optional starters)
 */
export function StrategyBuilder() {
  const legs = useStrategyStore((s) => s.legs);
  const chain = useStrategyStore((s) => s.chain);
  const selectedLegId = useStrategyStore((s) => s.selectedLegId);
  const setSelectedLegId = useStrategyStore((s) => s.setSelectedLegId);
  const updateLeg = useStrategyStore((s) => s.updateLeg);
  const removeLeg = useStrategyStore((s) => s.removeLeg);
  const clearLegs = useStrategyStore((s) => s.clearLegs);
  const toggleLegSide = useStrategyStore((s) => s.toggleLegSide);
  const toggleLegType = useStrategyStore((s) => s.toggleLegType);
  const setLegExpiration = useStrategyStore((s) => s.setLegExpiration);
  const indexPrice = chain?.indexPrice ?? 0;

  const netPrem = netPremiumBtc(legs);
  const isDebit = netPrem > 0;
  const selected =
    legs.find((l) => l.id === selectedLegId) ?? legs[0] ?? null;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="bos-strategy-stack">
      {/* 1. Open position */}
      <Card>
        <CardHeader>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <CardTitle>
                <HelpTip
                  label="Open strategy"
                  tip="Live legs in your book. Click a leg chip to edit qty, premium, IV, or expiry. Use Clear all to wipe the structure."
                />
              </CardTitle>
              <CardDescription>
                Your legs · select one to edit · build more on the strike rail
                below
              </CardDescription>
            </div>
            {legs.length > 0 && (
              <button
                type="button"
                className="bos-clear-btn"
                onClick={clearLegs}
                title="Remove all legs"
              >
                <Trash2 size={11} strokeWidth={2} />
                <span>Clear all</span>
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Net + legs */}
          <div className="bos-open-bar">
            <div className="bos-net-box">
              <span className="bos-net-label">
                Net {isDebit ? "debit" : netPrem < 0 ? "credit" : "premium"}
              </span>
              <span
                className="mono bos-net-value"
                style={{
                  color: isDebit
                    ? "#f6465d"
                    : netPrem < 0
                      ? "#0ecb81"
                      : "#e8ecf4",
                }}
              >
                {legs.length === 0 ? "—" : formatBtc(Math.abs(netPrem))}
                {legs.length > 0 && (
                  <span className="bos-net-unit">
                    {isDebit ? " paid" : netPrem < 0 ? " recv" : ""}
                  </span>
                )}
              </span>
              {legs.length > 0 && indexPrice > 0 && (
                <span className="bos-net-usd">
                  ≈ $
                  {(Math.abs(netPrem) * indexPrice).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </span>
              )}
            </div>

            <div className="bos-leg-pills">
              {legs.length === 0 ? (
                <p className="bos-empty-legs">
                  No legs yet — use ATM buttons or the rail below, or load a
                  preset.
                </p>
              ) : (
                legs.map((leg, idx) => (
                  <button
                    key={leg.id}
                    type="button"
                    onClick={() => setSelectedLegId(leg.id)}
                    className={cn(
                      "bos-leg-pill",
                      selected?.id === leg.id && "is-selected",
                      leg.type === "call" ? "is-call" : "is-put"
                    )}
                  >
                    <span className="bos-leg-idx">#{idx + 1}</span>
                    {leg.side === "buy" ? "+" : "−"}
                    {leg.type === "call" ? "C" : "P"}{" "}
                    {formatPrice(leg.strike, 0)}
                    <span className="bos-leg-exp">
                      {shortExpiry(leg.expirationDate)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 2. Selected leg editor */}
          {selected && (
            <div className="bos-leg-editor">
              <div className="bos-leg-editor-top">
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span className="bos-editor-label">Edit leg</span>
                  <button
                    type="button"
                    onClick={() => toggleLegSide(selected.id)}
                    className="cursor-pointer"
                    title="Toggle buy/sell"
                  >
                    <Badge variant={selected.side === "buy" ? "buy" : "sell"}>
                      {selected.side}
                    </Badge>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLegType(selected.id)}
                    className="cursor-pointer"
                    title="Toggle call/put"
                  >
                    <Badge
                      variant={selected.type === "call" ? "call" : "put"}
                    >
                      {selected.type}
                    </Badge>
                  </button>
                  <span className="mono" style={{ fontSize: 12, color: "#e8ecf4" }}>
                    {formatPrice(selected.strike, 0)}
                  </span>
                  <Badge variant="outline" className="normal-case tracking-normal">
                    {shortExpiry(selected.expirationDate)} ·{" "}
                    {dteLabel(selected.expirationTimestamp)}
                  </Badge>
                </div>
                <button
                  type="button"
                  className="bos-icon-btn bos-icon-btn--danger"
                  onClick={() => removeLeg(selected.id)}
                  title="Remove this leg"
                  aria-label="Remove this leg"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>

              {chain && chain.expirations.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <label className="bos-field-label">Expiration (this leg)</label>
                  <select
                    className="bos-select mono"
                    value={selected.expirationTimestamp}
                    onChange={(e) =>
                      setLegExpiration(selected.id, Number(e.target.value))
                    }
                  >
                    {chain.expirations.map((exp) => (
                      <option
                        key={exp.expirationTimestamp}
                        value={exp.expirationTimestamp}
                      >
                        {exp.expirationDate} (
                        {Math.round(exp.daysToExpiration)}d)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="bos-field-label">Qty</label>
                  <Input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={selected.quantity}
                    onChange={(e) =>
                      updateLeg(selected.id, {
                        quantity: Math.max(0.1, Number(e.target.value) || 0.1),
                      })
                    }
                    className="h-7 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="bos-field-label">Premium (₿)</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.0001}
                    value={selected.premium}
                    onChange={(e) =>
                      updateLeg(selected.id, {
                        premium: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="h-7 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="bos-field-label">IV override %</label>
                  <Input
                    type="number"
                    min={1}
                    step={0.5}
                    placeholder={formatIv(selected.marketIv)}
                    value={
                      selected.ivOverride !== null
                        ? (selected.ivOverride * 100).toFixed(1)
                        : ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        updateLeg(selected.id, { ivOverride: null });
                        return;
                      }
                      const pct = Number(raw);
                      if (Number.isFinite(pct) && pct > 0) {
                        updateLeg(selected.id, { ivOverride: pct / 100 });
                      }
                    }}
                    className="h-7 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="mono bos-instrument-line">
                {selected.instrumentName} · mkt IV {formatIv(selected.marketIv)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Presets — secondary, after open legs */}
      <Card>
        <CardHeader>
          <CardTitle>
            <HelpTip
              label="Strategy presets"
              tip="Quick templates for common multi-leg structures. Click a name to apply at the active ATM, or open the full library for filters and education notes."
            />
          </CardTitle>
          <CardDescription>
            Optional starters — click a chip to load, or open the full library
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StrategyLibrary />
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}
