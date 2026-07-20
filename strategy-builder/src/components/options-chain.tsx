"use client";

import { useMemo, useState } from "react";
import { Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStrategyStore } from "@/store/strategy-store";
import { formatIv, formatPrice, cn } from "@/lib/utils";
import type { OptionQuote, OptionType } from "@/types/options";
import { HelpTip, TooltipProvider } from "@/components/ui/tooltip";

function QuoteCell({
  quote,
  type,
  strike,
  expirationTimestamp,
  expirationDate,
  side,
}: {
  quote: OptionQuote | null;
  type: OptionType;
  strike: number;
  expirationTimestamp: number;
  expirationDate: string;
  side: "bid" | "ask" | "mark";
}) {
  const addLegFromQuote = useStrategyStore((s) => s.addLegFromQuote);

  if (!quote) {
    return <td className="bos-chain-empty">—</td>;
  }

  const value =
    side === "bid" ? quote.bid : side === "ask" ? quote.ask : quote.mark;
  const legSide = side === "ask" ? "buy" : side === "bid" ? "sell" : "buy";
  const disabled = value === null || value === undefined;

  return (
    <td className="bos-chain-quote">
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          addLegFromQuote(
            quote,
            type,
            strike,
            expirationTimestamp,
            expirationDate,
            legSide
          )
        }
        className={cn(
          "bos-chain-quote-btn",
          side === "bid" && "is-bid",
          side === "ask" && "is-ask",
          side === "mark" && "is-mark",
          disabled && "is-disabled"
        )}
        title={
          side === "mark"
            ? "Add long leg at mark"
            : side === "ask"
              ? "Buy at ask"
              : "Sell at bid"
        }
      >
        {value !== null && value !== undefined ? value.toFixed(4) : "—"}
      </button>
    </td>
  );
}

/** Market data table for the active expiry. */
export function OptionsChain() {
  const chain = useStrategyStore((s) => s.chain);
  const chainLoading = useStrategyStore((s) => s.chainLoading);
  const chainError = useStrategyStore((s) => s.chainError);
  const selectedExpiryTs = useStrategyStore((s) => s.selectedExpiryTs);
  const chainPanelOpen = useStrategyStore((s) => s.chainPanelOpen);
  const setChainPanelOpen = useStrategyStore((s) => s.setChainPanelOpen);
  const [showExtra, setShowExtra] = useState(true);

  const expiration = useMemo(
    () =>
      chain?.expirations.find(
        (e) => e.expirationTimestamp === selectedExpiryTs
      ) ?? chain?.expirations[0],
    [chain, selectedExpiryTs]
  );

  const indexPrice = chain?.indexPrice ?? 0;

  const atmStrike = useMemo(() => {
    if (!expiration || !indexPrice) return null;
    return expiration.strikes.reduce((best, row) =>
      Math.abs(row.strike - indexPrice) < Math.abs(best.strike - indexPrice)
        ? row
        : best
    ).strike;
  }, [expiration, indexPrice]);

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="bos-chain-card">
        <CardHeader>
          <div className="bos-chain-hd">
            <div>
              <CardTitle>
                <HelpTip
                  label="Options chain"
                  tip="Live Deribit quotes for the active expiration. Click bid to sell, ask to buy, or mark to add a long at mid. Prefer the strike rail for visual structure building."
                />
              </CardTitle>
              <CardDescription>
                Active expiry quotes · click bid / mark / ask to add a leg
                {expiration
                  ? ` · ${expiration.expirationDate} (${Math.round(expiration.daysToExpiration)}d)`
                  : ""}
              </CardDescription>
            </div>
            <div className="bos-chain-hd-actions">
              {chainPanelOpen && (
                <button
                  type="button"
                  className="bos-chain-toggle-extra"
                  onClick={() => setShowExtra((v) => !v)}
                >
                  {showExtra ? "Hide IV/OI" : "Show IV/OI"}
                </button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setChainPanelOpen(!chainPanelOpen)}
              >
                {chainPanelOpen ? (
                  <>
                    <ChevronUp size={14} /> Collapse
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} /> Show chain
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {chainPanelOpen && (
          <CardContent className="bos-chain-body">
            {chainLoading && !chain && (
              <div className="bos-chain-status">
                <Loader2 size={16} className="animate-spin" />
                Loading Deribit chain…
              </div>
            )}

            {chainError && !chain && (
              <div className="bos-chain-status bos-chain-status--error">
                <AlertCircle size={18} />
                <p>Failed to load options chain</p>
                <p className="bos-chain-status-sub">{chainError}</p>
              </div>
            )}

            {chain && !expiration && (
              <div className="bos-chain-status">
                Select an expiration in the strike builder to load the chain.
              </div>
            )}

            {expiration && (
              <div className="scroll-xy bos-chain-scroll">
                <table className="bos-chain-table">
                  <thead>
                    <tr className="bos-chain-group-row">
                      <th
                        colSpan={showExtra ? 5 : 3}
                        className="bos-chain-group bos-chain-group--calls"
                      >
                        Calls
                      </th>
                      <th className="bos-chain-group bos-chain-group--strike">
                        Strike
                      </th>
                      <th
                        colSpan={showExtra ? 5 : 3}
                        className="bos-chain-group bos-chain-group--puts"
                      >
                        Puts
                      </th>
                    </tr>
                    <tr className="bos-chain-col-row">
                      <th>Bid</th>
                      <th>Mark</th>
                      <th>Ask</th>
                      {showExtra && (
                        <>
                          <th>IV</th>
                          <th>OI</th>
                        </>
                      )}
                      <th className="bos-chain-strike-hd">USD</th>
                      <th>Bid</th>
                      <th>Mark</th>
                      <th>Ask</th>
                      {showExtra && (
                        <>
                          <th>IV</th>
                          <th>OI</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {expiration.strikes.map((row) => {
                      const isAtm = row.strike === atmStrike;
                      const isBelowSpot = row.strike < indexPrice;
                      return (
                        <tr
                          key={row.strike}
                          className={cn(
                            "bos-chain-row",
                            isAtm && "is-atm",
                            isBelowSpot && "is-below-spot"
                          )}
                        >
                          <QuoteCell
                            quote={row.call}
                            type="call"
                            strike={row.strike}
                            expirationTimestamp={
                              expiration.expirationTimestamp
                            }
                            expirationDate={expiration.expirationDate}
                            side="bid"
                          />
                          <QuoteCell
                            quote={row.call}
                            type="call"
                            strike={row.strike}
                            expirationTimestamp={
                              expiration.expirationTimestamp
                            }
                            expirationDate={expiration.expirationDate}
                            side="mark"
                          />
                          <QuoteCell
                            quote={row.call}
                            type="call"
                            strike={row.strike}
                            expirationTimestamp={
                              expiration.expirationTimestamp
                            }
                            expirationDate={expiration.expirationDate}
                            side="ask"
                          />
                          {showExtra && (
                            <>
                              <td className="bos-chain-meta">
                                {row.call ? formatIv(row.call.iv) : "—"}
                              </td>
                              <td className="bos-chain-meta">
                                {row.call
                                  ? Math.round(
                                      row.call.openInterest
                                    ).toLocaleString()
                                  : "—"}
                              </td>
                            </>
                          )}
                          <td
                            className={cn(
                              "bos-chain-strike",
                              isAtm && "is-atm"
                            )}
                          >
                            {formatPrice(row.strike, 0)}
                          </td>
                          <QuoteCell
                            quote={row.put}
                            type="put"
                            strike={row.strike}
                            expirationTimestamp={
                              expiration.expirationTimestamp
                            }
                            expirationDate={expiration.expirationDate}
                            side="bid"
                          />
                          <QuoteCell
                            quote={row.put}
                            type="put"
                            strike={row.strike}
                            expirationTimestamp={
                              expiration.expirationTimestamp
                            }
                            expirationDate={expiration.expirationDate}
                            side="mark"
                          />
                          <QuoteCell
                            quote={row.put}
                            type="put"
                            strike={row.strike}
                            expirationTimestamp={
                              expiration.expirationTimestamp
                            }
                            expirationDate={expiration.expirationDate}
                            side="ask"
                          />
                          {showExtra && (
                            <>
                              <td className="bos-chain-meta">
                                {row.put ? formatIv(row.put.iv) : "—"}
                              </td>
                              <td className="bos-chain-meta">
                                {row.put
                                  ? Math.round(
                                      row.put.openInterest
                                    ).toLocaleString()
                                  : "—"}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </TooltipProvider>
  );
}
