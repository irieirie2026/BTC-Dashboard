"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useStrategyStore } from "@/store/strategy-store";
import {
  strategyPnlAt,
  maxProfitLoss,
  netPremiumBtc,
} from "@/lib/strategy-analytics";
import { cn, formatPrice } from "@/lib/utils";
import { HelpTip, TooltipProvider } from "@/components/ui/tooltip";

type DisplayMode = "btc" | "usd" | "pct_debit";

interface DateColumn {
  daysFromNow: number;
  asOfMs: number;
  label: string;
  sublabel: string;
  isExpiry: boolean;
}

function buildDateColumns(maxDte: number, now: number): DateColumn[] {
  if (maxDte <= 0) {
    return [
      {
        daysFromNow: 0,
        asOfMs: now,
        label: "Now",
        sublabel: "T+0",
        isExpiry: true,
      },
    ];
  }
  const targetCols = Math.min(8, Math.max(5, Math.ceil(maxDte / 7) + 2));
  const cols: DateColumn[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < targetCols; i++) {
    const days =
      i === targetCols - 1
        ? maxDte
        : Math.round((maxDte * i) / (targetCols - 1));
    if (seen.has(days)) continue;
    seen.add(days);
    const asOfMs = now + days * 86_400_000;
    const d = new Date(asOfMs);
    const isExpiry = days >= maxDte - 0.01;
    cols.push({
      daysFromNow: days,
      asOfMs,
      label: isExpiry
        ? "Expiry"
        : days === 0
          ? "Now"
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sublabel: days === 0 ? "T+0" : isExpiry ? `${maxDte}d` : `T+${days}`,
      isExpiry,
    });
  }
  return cols;
}

function buildPriceRows(spot: number, rangePct: number, n: number): number[] {
  if (spot <= 0) return [];
  const lo = spot * (1 - rangePct);
  const hi = spot * (1 + rangePct);
  const rows: number[] = [];
  for (let i = 0; i < n; i++) {
    rows.push(hi - (i / Math.max(1, n - 1)) * (hi - lo));
  }
  return rows;
}

function formatCell(
  pnlBtc: number,
  mode: DisplayMode,
  indexPrice: number,
  riskBtc: number
): string {
  if (!Number.isFinite(pnlBtc)) return "—";
  if (mode === "btc") {
    return `${pnlBtc > 0 ? "+" : ""}${pnlBtc.toFixed(4)}`;
  }
  if (mode === "usd") {
    const usd = pnlBtc * indexPrice;
    if (Math.abs(usd) >= 1000)
      return `${usd > 0 ? "+" : ""}${(usd / 1000).toFixed(1)}k`;
    return `${usd > 0 ? "+" : ""}${usd.toFixed(0)}`;
  }
  const pct = (pnlBtc / (Math.abs(riskBtc) || 1)) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

function heat(pnl: number, maxAbs: number): React.CSSProperties {
  if (!Number.isFinite(pnl) || maxAbs <= 0) return { color: "#71717a" };
  const t = Math.min(1, Math.abs(pnl) / maxAbs);
  if (pnl > 1e-8) {
    return {
      background: `rgba(52, 211, 153, ${0.08 + t * 0.22})`,
      color: "#6ee7b7",
    };
  }
  if (pnl < -1e-8) {
    return {
      background: `rgba(248, 113, 113, ${0.08 + t * 0.22})`,
      color: "#fca5a5",
    };
  }
  return { background: "rgba(39,39,42,0.4)", color: "#a1a1aa" };
}

export function PnLTable() {
  const legs = useStrategyStore((s) => s.legs);
  const chain = useStrategyStore((s) => s.chain);
  const scenarioSpot = useStrategyStore((s) => s.scenarioSpot);
  const ivMultiplier = useStrategyStore((s) => s.ivMultiplier);
  const riskFreeRate = useStrategyStore((s) => s.riskFreeRate);
  const setScenarioSpot = useStrategyStore((s) => s.setScenarioSpot);
  const setDaysFromNow = useStrategyStore((s) => s.setDaysFromNow);

  const [rangePct, setRangePct] = useState(0.25);
  const [mode, setMode] = useState<DisplayMode>("btc");

  const indexPrice = chain?.indexPrice ?? 0;
  const spot = scenarioSpot || indexPrice;

  const maxDte = useMemo(() => {
    if (!legs.length) return 30;
    return Math.max(
      0,
      Math.ceil(
        (Math.min(...legs.map((l) => l.expirationTimestamp)) - Date.now()) /
          86_400_000
      )
    );
  }, [legs]);

  const columns = useMemo(
    () => buildDateColumns(maxDte, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxDte, legs.length]
  );

  const prices = useMemo(
    () => buildPriceRows(spot || indexPrice || 100000, rangePct, 13),
    [spot, indexPrice, rangePct]
  );

  const params = useMemo(
    () => ({ ivMultiplier, riskFreeRate }),
    [ivMultiplier, riskFreeRate]
  );

  const netPrem = useMemo(() => netPremiumBtc(legs), [legs]);
  const { maxLoss } = useMemo(
    () => maxProfitLoss(legs, spot || indexPrice || 1),
    [legs, spot, indexPrice]
  );
  const riskBtc =
    maxLoss !== null && maxLoss < 0
      ? Math.abs(maxLoss)
      : Math.abs(netPrem) || 1;

  const matrix = useMemo(() => {
    if (!legs.length || !prices.length) return [] as number[][];
    return prices.map((p) =>
      columns.map((c) => strategyPnlAt(legs, p, c.asOfMs, params))
    );
  }, [legs, prices, columns, params]);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const row of matrix) for (const v of row) m = Math.max(m, Math.abs(v));
    return m || 1;
  }, [matrix]);

  const spotRow = useMemo(() => {
    if (!prices.length || !spot) return -1;
    let best = 0;
    for (let i = 1; i < prices.length; i++) {
      if (Math.abs(prices[i] - spot) < Math.abs(prices[best] - spot)) best = i;
    }
    return best;
  }, [prices, spot]);

  return (
    <TooltipProvider delayDuration={200}>
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <HelpTip
              label="Profit / Loss table"
              tip="Matrix of theoretical P&L by underlying price (rows) and time to expiry (columns). Click a cell to jump scenario spot and days. Units switch between BTC, USD, and % of capital at risk."
            />
          </CardTitle>
          <CardDescription>
            Price rows × date columns · click a cell to set scenario spot / date
          </CardDescription>
        </div>
        {/* Range slider + display units grouped together */}
        <div className="bos-pnl-table-controls">
          <div className="bos-pnl-range">
            <span className="bos-pnl-range-label">
              Price range ±{Math.round(rangePct * 100)}%
            </span>
            <div className="bos-pnl-range-slider">
              <Slider
                min={8}
                max={50}
                step={1}
                value={[Math.round(rangePct * 100)]}
                onValueChange={([v]) => setRangePct(v / 100)}
              />
            </div>
          </div>
          <div className="bos-unit-toggle" role="group" aria-label="Display units">
            {(
              [
                ["btc", "BTC"],
                ["usd", "USD"],
                ["pct_debit", "%"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn("bos-unit-btn", mode === id && "is-active")}
                onClick={() => setMode(id)}
                title={
                  id === "btc"
                    ? "Show P&L in BTC"
                    : id === "usd"
                      ? "Show P&L in USD (× index)"
                      : "Show P&L as % of capital at risk"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {legs.length === 0 ? (
          <div
            style={{
              height: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              color: "#52525b",
              fontSize: 13,
            }}
          >
            Add legs to populate the matrix
          </div>
        ) : (
          <div
            className="scroll-xy"
            style={{
              maxHeight: 360,
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <table className="pnl-table">
              <thead>
                <tr>
                  <th
                    className="price-cell"
                    style={{
                      top: 0,
                      zIndex: 3,
                      background: "#141417",
                      position: "sticky",
                    }}
                  >
                    BTC $
                  </th>
                  {columns.map((c) => (
                    <th
                      key={c.daysFromNow}
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 2,
                        background: c.isExpiry
                          ? "rgba(76, 29, 149, 0.45)"
                          : "#141417",
                        color: c.isExpiry ? "#c4b5fd" : "#a1a1aa",
                        fontWeight: 500,
                      }}
                    >
                      <div>{c.label}</div>
                      <div style={{ fontSize: 9, color: "#52525b" }}>
                        {c.sublabel}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prices.map((price, ri) => {
                  const isSpot = ri === spotRow;
                  return (
                    <tr key={ri}>
                      <th
                        className={cn("price-cell", "mono")}
                        style={{
                          background: isSpot
                            ? "rgba(120, 53, 15, 0.9)"
                            : "#0c0c0e",
                          color: isSpot ? "#fcd34d" : "#a1a1aa",
                          fontWeight: isSpot ? 600 : 400,
                          fontSize: 11,
                        }}
                      >
                        {formatPrice(price, 0)}
                      </th>
                      {columns.map((col, ci) => {
                        const pnl = matrix[ri]?.[ci] ?? 0;
                        return (
                          <td
                            key={col.daysFromNow}
                            className="mono"
                            style={{
                              ...heat(pnl, maxAbs),
                              cursor: "pointer",
                              fontWeight: col.isExpiry ? 600 : 400,
                            }}
                            onClick={() => {
                              setScenarioSpot(price);
                              setDaysFromNow(col.daysFromNow);
                            }}
                            title={`${formatPrice(price, 0)} @ ${col.label}`}
                          >
                            {formatCell(pnl, mode, indexPrice, riskBtc)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
