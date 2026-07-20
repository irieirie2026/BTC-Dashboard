"use client";

import { Bitcoin, RefreshCw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";
import { useStrategyStore } from "@/store/strategy-store";

interface HeaderProps {
  onRefresh: () => void;
  refreshing: boolean;
}

export function Header({ onRefresh, refreshing }: HeaderProps) {
  const chain = useStrategyStore((s) => s.chain);
  const chainError = useStrategyStore((s) => s.chainError);
  const indexPrice = chain?.indexPrice ?? 0;
  const fetchedAt = chain?.fetchedAt;

  return (
    <header id="app-header">
      <div
        id="app-header-inner"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingTop: 10,
          paddingBottom: 10,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg,#f97316,#d97706)",
            }}
          >
            <Bitcoin size={18} color="#fff" />
          </div>
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: "#fafafa",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              BTC OptionStrat
            </div>
            <div style={{ fontSize: 11, color: "#71717a" }}>
              Deribit options builder
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 4,
                fontSize: 10,
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <Activity size={12} color="#34d399" />
              BTC
            </div>
            <div
              className="mono"
              style={{ fontSize: 16, fontWeight: 600, color: "#fafafa" }}
            >
              {indexPrice > 0 ? formatUsd(indexPrice, 0) : "—"}
            </div>
            <div style={{ fontSize: 10, color: "#52525b" }}>
              {fetchedAt
                ? new Date(fetchedAt).toLocaleTimeString()
                : chainError
                  ? "Error"
                  : "…"}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : undefined}
            />
          </Button>
        </div>
      </div>
    </header>
  );
}
