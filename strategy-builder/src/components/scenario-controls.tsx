"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useStrategyStore } from "@/store/strategy-store";
import { formatPrice } from "@/lib/utils";
import { HelpTip, TooltipProvider } from "@/components/ui/tooltip";

export function ScenarioControls() {
  const chain = useStrategyStore((s) => s.chain);
  const scenarioSpot = useStrategyStore((s) => s.scenarioSpot);
  const daysFromNow = useStrategyStore((s) => s.daysFromNow);
  const ivMultiplier = useStrategyStore((s) => s.ivMultiplier);
  const riskFreeRate = useStrategyStore((s) => s.riskFreeRate);
  const setScenarioSpot = useStrategyStore((s) => s.setScenarioSpot);
  const setDaysFromNow = useStrategyStore((s) => s.setDaysFromNow);
  const setIvMultiplier = useStrategyStore((s) => s.setIvMultiplier);
  const setRiskFreeRate = useStrategyStore((s) => s.setRiskFreeRate);
  const selectedExpiryTs = useStrategyStore((s) => s.selectedExpiryTs);
  const legs = useStrategyStore((s) => s.legs);

  const indexPrice = chain?.indexPrice ?? 100000;

  const maxDte = useMemo(() => {
    if (legs.length > 0) {
      const nearest = Math.min(...legs.map((l) => l.expirationTimestamp));
      return Math.max(1, Math.ceil((nearest - Date.now()) / 86400000));
    }
    const exp = chain?.expirations.find(
      (e) => e.expirationTimestamp === selectedExpiryTs
    );
    return Math.max(1, Math.ceil(exp?.daysToExpiration ?? 30));
  }, [legs, chain, selectedExpiryTs]);

  const spotMin = Math.round(indexPrice * 0.55);
  const spotMax = Math.round(indexPrice * 1.45);
  const spot = scenarioSpot || indexPrice;
  const ivPctChange = Math.round((ivMultiplier - 1) * 100);

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="bos-scenario-card">
        <CardHeader>
          <CardTitle>
            <HelpTip
              label="Scenario controls"
              tip="What-if knobs for the P&L chart, table, and metrics. They do not place orders — only reprice the model."
            />
          </CardTitle>
          <CardDescription>
            Stress-test spot, time, and IV — diagrams update instantly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bos-scenario-grid">
            {/* Spot */}
            <div className="bos-scenario-tile">
              <div className="bos-scenario-tile-hd">
                <span className="bos-scenario-tile-label">
                  <HelpTip
                    label="Underlying"
                    tip="Hypothetical BTC index for theoretical P&L and Greeks. Reset snaps back to Deribit’s live index."
                  />
                </span>
                <span className="mono bos-scenario-tile-value bos-scenario-tile-value--spot">
                  ${formatPrice(spot, 0)}
                </span>
              </div>
              <Slider
                min={spotMin}
                max={spotMax}
                step={Math.max(1, Math.round(indexPrice / 500))}
                value={[Math.min(spotMax, Math.max(spotMin, spot))]}
                onValueChange={([v]) => setScenarioSpot(v)}
              />
              <div className="bos-scenario-tile-ft">
                <span className="mono">${formatPrice(spotMin, 0)}</span>
                <button
                  type="button"
                  className="bos-scenario-reset"
                  onClick={() => setScenarioSpot(indexPrice)}
                >
                  Reset index
                </button>
                <span className="mono">${formatPrice(spotMax, 0)}</span>
              </div>
            </div>

            {/* Days */}
            <div className="bos-scenario-tile">
              <div className="bos-scenario-tile-hd">
                <span className="bos-scenario-tile-label">
                  <HelpTip
                    label="Days from now"
                    tip="Horizon for the theoretical curve. 0 = reprice as of now; sliding toward expiry reduces time value."
                  />
                </span>
                <span className="mono bos-scenario-tile-value bos-scenario-tile-value--time">
                  {daysFromNow}d
                  <span className="bos-scenario-tile-muted"> / {maxDte}d</span>
                </span>
              </div>
              <Slider
                min={0}
                max={maxDte}
                step={1}
                value={[Math.min(daysFromNow, maxDte)]}
                onValueChange={([v]) => setDaysFromNow(v)}
              />
              <div className="bos-scenario-tile-ft">
                <span>Now</span>
                <span>Expiry</span>
              </div>
            </div>

            {/* IV */}
            <div className="bos-scenario-tile">
              <div className="bos-scenario-tile-hd">
                <span className="bos-scenario-tile-label">
                  <HelpTip
                    label="IV adjustment"
                    tip="Multiplies each leg’s IV. +20% means every vol is scaled by 1.2 — useful for IV crush or expansion."
                  />
                </span>
                <span className="mono bos-scenario-tile-value bos-scenario-tile-value--iv">
                  {ivPctChange >= 0 ? "+" : ""}
                  {ivPctChange}%
                </span>
              </div>
              <Slider
                min={50}
                max={150}
                step={1}
                value={[Math.round(ivMultiplier * 100)]}
                onValueChange={([v]) => setIvMultiplier(v / 100)}
              />
              <div className="bos-scenario-tile-ft">
                <span>−50%</span>
                <button
                  type="button"
                  className="bos-scenario-reset"
                  onClick={() => setIvMultiplier(1)}
                >
                  Reset 0%
                </button>
                <span>+50%</span>
              </div>
            </div>

            {/* Risk-free rate */}
            <div className="bos-scenario-tile bos-scenario-tile--rate">
              <div className="bos-scenario-tile-hd">
                <span className="bos-scenario-tile-label">
                  <HelpTip
                    label="Risk-free rate"
                    tip="Continuous rate in Black–Scholes (e.g. 0.045 = 4.5%). Modest effect on crypto theos."
                  />
                </span>
                <span className="mono bos-scenario-tile-value">
                  {(riskFreeRate * 100).toFixed(2)}%
                </span>
              </div>
              <input
                id="rfr"
                type="number"
                min={0}
                max={0.2}
                step={0.001}
                value={riskFreeRate}
                onChange={(e) => setRiskFreeRate(Number(e.target.value) || 0)}
                className="bos-scenario-input mono"
                aria-label="Risk-free rate decimal"
              />
              <div className="bos-scenario-tile-ft">
                <span>decimal e.g. 0.045</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
