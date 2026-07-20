"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchOptionsChain } from "@/lib/deribit-api";
import { useStrategyStore } from "@/store/strategy-store";
import { Header } from "@/components/header";
import { StrategyBuilder } from "@/components/strategy-builder";
import { StrikeRail } from "@/components/strike-rail";
import { PnLTable } from "@/components/pnl-table";
import { OptionsChain } from "@/components/options-chain";
import { PnLChart } from "@/components/pnl-chart";
import { MetricsPanel } from "@/components/metrics-panel";
import { ScenarioControls } from "@/components/scenario-controls";

const POLL_MS = 25_000;

export function AppShell({ hideHeader = false }: { hideHeader?: boolean }) {
  const setChain = useStrategyStore((s) => s.setChain);
  const setChainLoading = useStrategyStore((s) => s.setChainLoading);
  const [refreshing, setRefreshing] = useState(false);

  const loadChain = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      else setChainLoading(true);
      try {
        const result = await fetchOptionsChain(isManual);
        if (result.ok) setChain(result.data, null);
        else setChain(null, result.error);
      } catch (e) {
        setChain(
          null,
          e instanceof Error ? e.message : "Unknown error loading chain"
        );
      } finally {
        setRefreshing(false);
        setChainLoading(false);
      }
    },
    [setChain, setChainLoading]
  );

  useEffect(() => {
    loadChain(false);
    const id = setInterval(() => loadChain(false), POLL_MS);
    return () => clearInterval(id);
  }, [loadChain]);

  return (
    <div id="app-root" data-embed={hideHeader ? "1" : undefined}>
      {!hideHeader && (
        <Header onRefresh={() => loadChain(true)} refreshing={refreshing} />
      )}

      <main id="app-main">
        <section className="section">
          <StrategyBuilder />
        </section>

        <section className="section">
          <StrikeRail />
        </section>

        <section className="section">
          <MetricsPanel />
        </section>

        <section className="section">
          <PnLTable />
        </section>

        <section className="section">
          <PnLChart />
        </section>

        <section className="section">
          <ScenarioControls />
        </section>

        <section className="section">
          <OptionsChain />
        </section>

        <p
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: 11,
            color: "#52525b",
          }}
        >
          Deribit public API · BTC · not financial advice
        </p>
      </main>
    </div>
  );
}
