"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStrategyStore } from "@/store/strategy-store";
import {
  computeStrategyMetrics,
  strategyPnlAt,
} from "@/lib/strategy-analytics";
import {
  formatBtc,
  formatPct,
  formatPrice,
  formatSigned,
  cn,
} from "@/lib/utils";
import { HelpTip, TooltipProvider } from "@/components/ui/tooltip";

function Stat({
  label,
  tip,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  tip: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "pos" | "neg" | "muted";
}) {
  return (
    <div className="bos-metric-tile">
      <div className="bos-metric-label">
        <HelpTip label={label} tip={tip} />
      </div>
      <div
        className={cn(
          "mono bos-metric-value",
          tone === "pos" && "text-emerald-400",
          tone === "neg" && "text-red-400",
          tone === "neutral" && "text-zinc-100",
          tone === "muted" && "text-zinc-400"
        )}
        title={value}
      >
        {value}
      </div>
      {sub && <div className="bos-metric-sub">{sub}</div>}
    </div>
  );
}

export function MetricsPanel() {
  const legs = useStrategyStore((s) => s.legs);
  const scenarioSpot = useStrategyStore((s) => s.scenarioSpot);
  const daysFromNow = useStrategyStore((s) => s.daysFromNow);
  const ivMultiplier = useStrategyStore((s) => s.ivMultiplier);
  const riskFreeRate = useStrategyStore((s) => s.riskFreeRate);
  const chain = useStrategyStore((s) => s.chain);
  const indexPrice = chain?.indexPrice ?? scenarioSpot;

  const params = useMemo(
    () => ({
      underlyingPrice: scenarioSpot || indexPrice,
      daysFromNow,
      ivMultiplier,
      riskFreeRate,
    }),
    [scenarioSpot, indexPrice, daysFromNow, ivMultiplier, riskFreeRate]
  );

  const metrics = useMemo(
    () => computeStrategyMetrics(legs, params),
    [legs, params]
  );

  const livePnl = useMemo(
    () => strategyPnlAt(legs, params.underlyingPrice, Date.now(), params),
    [legs, params]
  );

  if (legs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Key Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p style={{ margin: 0, fontSize: 12, color: "#52525b" }}>
            Add legs to see debit/credit, max P&amp;L, breakevens, PoP, and
            Greeks.
          </p>
        </CardContent>
      </Card>
    );
  }

  const netTone =
    metrics.netPremiumBtc > 0
      ? "neg"
      : metrics.netPremiumBtc < 0
        ? "pos"
        : "neutral";

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader>
          <CardTitle>
            <HelpTip
              label="Key Metrics"
              tip="Summary risk stats for the whole multi-leg strategy at the current scenario (spot, days, IV)."
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="metrics-grid metrics-grid--row">
            <Stat
              label={
                metrics.netPremiumBtc >= 0 ? "Net Debit" : "Net Credit"
              }
              tip={
                metrics.netPremiumBtc >= 0
                  ? "Cash you pay to open the structure (sum of buy premiums − sell premiums), in BTC."
                  : "Cash you receive to open the structure (credit). Positive for you at entry; risk is elsewhere."
              }
              value={formatBtc(Math.abs(metrics.netPremiumBtc))}
              sub={`≈ $${Math.abs(metrics.netPremiumUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              tone={netTone}
            />
            <Stat
              label="Max Profit"
              tip="Best expiration P&L found on a wide BTC price grid. “Unlimited” means inverse put-style risk can grow without a bound as price → 0 (or similar)."
              value={
                metrics.maxProfitBtc === null
                  ? "Unlimited"
                  : formatBtc(metrics.maxProfitBtc)
              }
              sub={
                metrics.maxProfitUsd !== null
                  ? `≈ $${metrics.maxProfitUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : "Inverse put as S→0"
              }
              tone="pos"
            />
            <Stat
              label="Max Loss"
              tip="Worst expiration P&L on the scan. “Unlimited” means loss can keep growing at an extreme price (e.g. short puts in coin-margined terms)."
              value={
                metrics.maxLossBtc === null
                  ? "Unlimited"
                  : formatBtc(metrics.maxLossBtc)
              }
              sub={
                metrics.maxLossUsd !== null
                  ? `≈ $${metrics.maxLossUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : undefined
              }
              tone="neg"
            />
            <Stat
              label="Breakevens"
              tip="BTC prices at expiration where strategy P&L crosses zero (approx. from a fine price grid)."
              value={
                metrics.breakevens.length === 0
                  ? "—"
                  : metrics.breakevens
                      .slice(0, 3)
                      .map((b) => formatPrice(b, 0))
                      .join(" · ")
              }
              sub={
                metrics.breakevens.length > 3
                  ? `+${metrics.breakevens.length - 3} more`
                  : "At expiration"
              }
            />
            <Stat
              label="Prob. of Profit"
              tip="Rough chance expiration P&L > 0 under a lognormal price model using average leg IV and the risk-free rate. Educational only — not a forecast."
              value={formatPct(metrics.probabilityOfProfit)}
              sub="Lognormal approx."
              tone="muted"
            />
            <Stat
              label="P&L @ Scenario"
              tip="Mark-to-model P&L at the scenario underlying price and “days from now” using Black–Scholes (or expiry payoff if days left ≈ 0)."
              value={formatBtc(livePnl)}
              sub={`S=${formatPrice(params.underlyingPrice, 0)} · T+${daysFromNow}d`}
              tone={livePnl > 0 ? "pos" : livePnl < 0 ? "neg" : "neutral"}
            />
            <Stat
              label="Delta"
              tip="Net sensitivity to BTC price (≈ change in strategy value per $1 move in spot, BS approximation for coin-margined options)."
              value={formatSigned(metrics.greeks.delta, 3)}
              tone={metrics.greeks.delta >= 0 ? "pos" : "neg"}
            />
            <Stat
              label="Gamma"
              tip="How fast delta changes as spot moves. High gamma means P&L is more curved near the money."
              value={formatSigned(metrics.greeks.gamma, 5)}
            />
            <Stat
              label="Theta / day"
              tip="Approx. daily time decay of the strategy value (BTC terms). Negative theta means the position loses value if nothing else changes."
              value={formatSigned(metrics.greeks.theta, 5)}
              sub="BTC"
              tone={metrics.greeks.theta >= 0 ? "pos" : "neg"}
            />
            <Stat
              label="Vega / 1% IV"
              tip="Approx. change in strategy value for a +1 percentage-point move in IV (e.g. 50% → 51%), in BTC."
              value={formatSigned(metrics.greeks.vega, 5)}
              sub="BTC"
            />
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
