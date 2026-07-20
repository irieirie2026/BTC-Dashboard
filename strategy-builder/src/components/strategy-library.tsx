"use client";

import { useMemo, useState } from "react";
import {
  STRATEGY_PRESETS,
  PROFICIENCY_ORDER,
  PROFICIENCY_LABEL,
} from "@/lib/presets";
import { useStrategyStore } from "@/store/strategy-store";
import { PayoffSketch } from "@/components/payoff-sketch";
import type {
  StrategyPreset,
  StrategyProficiency,
  StrategySentiment,
} from "@/types/options";
import { BookOpen, Search, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const SENTIMENT_FILTERS: { id: StrategySentiment | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "bullish", label: "Bullish" },
  { id: "bearish", label: "Bearish" },
  { id: "neutral", label: "Neutral" },
  { id: "volatile", label: "Volatility" },
  { id: "income", label: "Income" },
];

function tagLabel(t: string): string {
  return t
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sentimentColor(s: StrategySentiment): string {
  switch (s) {
    case "bullish":
      return "#34d399";
    case "bearish":
      return "#f87171";
    case "neutral":
      return "#a1a1aa";
    case "volatile":
      return "#a78bfa";
    case "income":
      return "#fbbf24";
  }
}

function StrategyCard({
  strategy,
  selected,
  onSelect,
  onApply,
  disabled,
}: {
  strategy: StrategyPreset;
  selected: boolean;
  onSelect: () => void;
  onApply: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={() => !disabled && onApply()}
      disabled={disabled}
      style={{
        textAlign: "left",
        width: "100%",
        padding: "10px 10px 8px",
        borderRadius: 10,
        border: selected
          ? "1px solid rgba(16,185,129,0.55)"
          : "1px solid #2a2a30",
        background: selected ? "rgba(16,185,129,0.08)" : "#0c0c0e",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#f4f4f5",
              lineHeight: 1.2,
            }}
          >
            {strategy.name}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "#71717a",
              marginTop: 2,
              lineHeight: 1.3,
            }}
          >
            {strategy.description}
          </div>
        </div>
        <PayoffSketch shape={strategy.payoff} width={64} height={36} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {strategy.sentiment.map((s) => (
          <span
            key={s}
            style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              color: sentimentColor(s),
              border: `1px solid ${sentimentColor(s)}44`,
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            {s}
          </span>
        ))}
        {strategy.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            style={{
              fontSize: 9,
              color: "#71717a",
              background: "#18181b",
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            {tagLabel(t)}
          </span>
        ))}
      </div>
    </button>
  );
}

export function StrategyLibrary() {
  const chain = useStrategyStore((s) => s.chain);
  const applyPresetById = useStrategyStore((s) => s.applyPresetById);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [proficiency, setProficiency] = useState<StrategyProficiency | "all">(
    "all"
  );
  const [sentiment, setSentiment] = useState<StrategySentiment | "all">("all");
  const [activeId, setActiveId] = useState<string | null>("long-call");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STRATEGY_PRESETS.filter((p) => {
      if (proficiency !== "all" && p.proficiency !== proficiency) return false;
      if (sentiment !== "all" && !p.sentiment.includes(sentiment)) return false;
      if (!q) return true;
      const hay = [
        p.name,
        p.description,
        p.education,
        p.family,
        ...(p.aliases ?? []),
        ...p.legsSummary,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, proficiency, sentiment]);

  const grouped = useMemo(() => {
    const byProf: Record<string, Record<string, StrategyPreset[]>> = {};
    for (const p of filtered) {
      if (!byProf[p.proficiency]) byProf[p.proficiency] = {};
      if (!byProf[p.proficiency][p.family]) byProf[p.proficiency][p.family] = [];
      byProf[p.proficiency][p.family].push(p);
    }
    return byProf;
  }, [filtered]);

  const active =
    STRATEGY_PRESETS.find((p) => p.id === activeId) ?? STRATEGY_PRESETS[0];

  const apply = (id: string) => {
    applyPresetById(id);
    setOpen(false);
  };

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      {/* Compact bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STRATEGY_PRESETS.slice(0, 6).map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!chain}
              onClick={() => apply(p.id)}
              title={p.description}
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #2a2a30",
                background: "#0c0c0e",
                color: "#d4d4d8",
                cursor: chain ? "pointer" : "not-allowed",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="bos-library-btn"
          onClick={() => setOpen(true)}
          disabled={!chain}
          title="Browse all strategy presets"
        >
          <BookOpen size={13} strokeWidth={2} className="bos-library-btn-icon" />
          <span className="bos-library-btn-text">Strategy library</span>
          <span className="bos-library-btn-count">{STRATEGY_PRESETS.length}</span>
        </button>
      </div>

      {/* Modal library */}
      {open && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1100px, 100%)",
              maxHeight: "min(880px, 92vh)",
              background: "#141417",
              border: "1px solid #2a2a30",
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #2a2a30",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  <Sparkles size={16} color="#34d399" />
                  Strategy library
                </div>
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>
                  Classic structures · classified by level &amp; outlook · double-click
                  to apply
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#a1a1aa",
                  cursor: "pointer",
                  padding: 6,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Filters */}
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid #2a2a30",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#0c0c0e",
                  border: "1px solid #2a2a30",
                  borderRadius: 8,
                  padding: "6px 10px",
                }}
              >
                <Search size={14} color="#71717a" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search strategies, legs, aliases…"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#f4f4f5",
                    fontSize: 13,
                    minWidth: 0,
                  }}
                />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#52525b", alignSelf: "center" }}>
                  Level
                </span>
                {(["all", ...PROFICIENCY_ORDER] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProficiency(p)}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 6,
                      border:
                        proficiency === p
                          ? "1px solid rgba(16,185,129,0.5)"
                          : "1px solid #2a2a30",
                      background:
                        proficiency === p
                          ? "rgba(16,185,129,0.12)"
                          : "#0c0c0e",
                      color: proficiency === p ? "#6ee7b7" : "#a1a1aa",
                      cursor: "pointer",
                    }}
                  >
                    {p === "all" ? "All" : PROFICIENCY_LABEL[p]}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#52525b", alignSelf: "center" }}>
                  Outlook
                </span>
                {SENTIMENT_FILTERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSentiment(s.id)}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 6,
                      border:
                        sentiment === s.id
                          ? "1px solid rgba(56,189,248,0.45)"
                          : "1px solid #2a2a30",
                      background:
                        sentiment === s.id
                          ? "rgba(56,189,248,0.1)"
                          : "#0c0c0e",
                      color: sentiment === s.id ? "#7dd3fc" : "#a1a1aa",
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body: list + education */}
            <div className="strategy-lib-body">
              <div
                className="scroll-xy"
                style={{
                  padding: 12,
                  borderRight: "1px solid #2a2a30",
                  maxHeight: "100%",
                }}
              >
                {filtered.length === 0 && (
                  <p style={{ color: "#71717a", fontSize: 13 }}>
                    No strategies match your filters.
                  </p>
                )}
                {PROFICIENCY_ORDER.map((prof) => {
                  const families = grouped[prof];
                  if (!families) return null;
                  return (
                    <div key={prof} style={{ marginBottom: 18 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "#a1a1aa",
                          marginBottom: 8,
                        }}
                      >
                        {PROFICIENCY_LABEL[prof]}
                      </div>
                      {Object.entries(families).map(([family, list]) => (
                        <div key={family} style={{ marginBottom: 12 }}>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#52525b",
                              marginBottom: 6,
                            }}
                          >
                            {family}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fill, minmax(200px, 1fr))",
                              gap: 8,
                            }}
                          >
                            {list.map((s) => (
                              <StrategyCard
                                key={s.id}
                                strategy={s}
                                selected={active?.id === s.id}
                                onSelect={() => setActiveId(s.id)}
                                onApply={() => apply(s.id)}
                                disabled={!chain}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Education panel */}
              <div
                className="scroll-xy"
                style={{
                  padding: 16,
                  background: "#0c0c0e",
                  maxHeight: "100%",
                }}
              >
                {active && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: "#fafafa",
                          }}
                        >
                          {active.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#71717a",
                            marginTop: 4,
                          }}
                        >
                          {PROFICIENCY_LABEL[active.proficiency]} ·{" "}
                          {active.family}
                          {active.aliases?.length
                            ? ` · also ${active.aliases.join(", ")}`
                            : ""}
                        </div>
                      </div>
                      <div
                        style={{
                          background: "#141417",
                          border: "1px solid #2a2a30",
                          borderRadius: 10,
                          padding: 8,
                        }}
                      >
                        <PayoffSketch
                          shape={active.payoff}
                          width={96}
                          height={54}
                        />
                        <div
                          style={{
                            fontSize: 9,
                            color: "#52525b",
                            textAlign: "center",
                            marginTop: 4,
                          }}
                        >
                          schematic payoff
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 12,
                      }}
                    >
                      {active.sentiment.map((s) => (
                        <span
                          key={s}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: sentimentColor(s),
                            border: `1px solid ${sentimentColor(s)}55`,
                            borderRadius: 6,
                            padding: "3px 8px",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                      {active.tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            fontSize: 10,
                            color: "#a1a1aa",
                            background: "#18181b",
                            borderRadius: 6,
                            padding: "3px 8px",
                          }}
                        >
                          {tagLabel(t)}
                        </span>
                      ))}
                      {active.needsSecondExpiry && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#fbbf24",
                            border: "1px solid rgba(251,191,36,0.35)",
                            borderRadius: 6,
                            padding: "3px 8px",
                          }}
                        >
                          multi-expiry
                        </span>
                      )}
                    </div>

                    <p
                      style={{
                        margin: "14px 0 0",
                        fontSize: 13,
                        lineHeight: 1.55,
                        color: "#d4d4d8",
                      }}
                    >
                      {active.education}
                    </p>

                    <div style={{ marginTop: 16 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "#71717a",
                          marginBottom: 8,
                        }}
                      >
                        Construction
                      </div>
                      <ol
                        style={{
                          margin: 0,
                          paddingLeft: 18,
                          color: "#a1a1aa",
                          fontSize: 12,
                          lineHeight: 1.6,
                        }}
                      >
                        {active.legsSummary.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <Button
                        style={{ width: "100%" }}
                        disabled={!chain}
                        onClick={() => apply(active.id)}
                      >
                        Apply {active.name} to rail
                      </Button>
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontSize: 10,
                          color: "#52525b",
                          textAlign: "center",
                        }}
                      >
                        Legs use the active expiry
                        {active.needsSecondExpiry
                          ? " (+ next further expiry for calendars)"
                          : ""}
                        . Drag strikes after applying.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
