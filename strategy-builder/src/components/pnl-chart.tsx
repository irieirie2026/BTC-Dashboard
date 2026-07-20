"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useStrategyStore } from "@/store/strategy-store";
import {
  buildPnLSeries,
  strategyExpirationPnl,
  strategyPnlAt,
  findBreakevens,
} from "@/lib/strategy-analytics";
import { formatBtc, formatPrice } from "@/lib/utils";

const W = 1100;
const H = 400;
const PAD = { top: 16, right: 20, bottom: 34, left: 58 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

const ZOOM_MIN = 0.06;
const ZOOM_MAX = 0.85;
const ZOOM_DEFAULT = 0.4;

interface ChartRow {
  price: number;
  expirationPnl: number;
  theoreticalPnl: number;
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (Math.abs(max - min) < 1e-12) {
    const c = min || 0;
    return [c - 1, c, c + 1];
  }
  const span = max - min;
  const step = span / Math.max(1, count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) ticks.push(min + step * i);
  return ticks;
}

function buildPath(
  pts: { x: number; y: number }[],
  mode: "line" | "step"
): string {
  if (pts.length === 0) return "";
  if (mode === "line") {
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` H${pts[i].x.toFixed(1)} V${pts[i].y.toFixed(1)}`;
  }
  return d;
}

export function PnLChart() {
  const uid = useId().replace(/:/g, "");
  const legs = useStrategyStore((s) => s.legs);
  const chain = useStrategyStore((s) => s.chain);
  const scenarioSpot = useStrategyStore((s) => s.scenarioSpot);
  const daysFromNow = useStrategyStore((s) => s.daysFromNow);
  const ivMultiplier = useStrategyStore((s) => s.ivMultiplier);
  const riskFreeRate = useStrategyStore((s) => s.riskFreeRate);

  const [hover, setHover] = useState<{
    price: number;
    exp: number;
    theo: number;
    x: number;
    y: number;
  } | null>(null);

  /** Half-width of X domain as fraction of spot (0.4 = ±40%). */
  const [rangePct, setRangePct] = useState(ZOOM_DEFAULT);
  /** Optional pan center (BTC price); null = follow scenario/index spot. */
  const [viewCenter, setViewCenter] = useState<number | null>(null);
  const panRef = useRef<{
    active: boolean;
    startX: number;
    startCenter: number;
  } | null>(null);

  const indexPrice = chain?.indexPrice ?? 0;
  const plotSpot = scenarioSpot || indexPrice || 100_000;
  const center = viewCenter ?? plotSpot;

  const params = useMemo(
    () => ({
      underlyingPrice: plotSpot,
      daysFromNow,
      ivMultiplier,
      riskFreeRate,
    }),
    [plotSpot, daysFromNow, ivMultiplier, riskFreeRate]
  );

  const series = useMemo((): ChartRow[] => {
    if (legs.length === 0) return [];
    // Build around view center so pan works; theo still uses scenario spot in params
    return buildPnLSeries(
      legs,
      { ...params, underlyingPrice: center },
      { points: 140, rangePct: rangePct }
    );
  }, [legs, params, center, rangePct]);

  const breakevens = useMemo(
    () => (legs.length ? findBreakevens(legs, plotSpot) : []),
    [legs, plotSpot]
  );

  const pnlAtSpot = useMemo(() => {
    if (!legs.length) return 0;
    return strategyPnlAt(
      legs,
      plotSpot,
      Date.now() + daysFromNow * 86_400_000,
      params
    );
  }, [legs, plotSpot, daysFromNow, params]);

  const expPnlAtSpot = useMemo(() => {
    if (!legs.length) return 0;
    return strategyExpirationPnl(legs, plotSpot);
  }, [legs, plotSpot]);

  const scales = useMemo(() => {
    if (series.length === 0) {
      return {
        xMin: 0,
        xMax: 1,
        yMin: -0.1,
        yMax: 0.1,
        xOf: () => PAD.left,
        yOf: () => PAD.top + INNER_H / 2,
      };
    }
    const xMin = series[0].price;
    const xMax = series[series.length - 1].price;
    const vals = series.flatMap((s) => [s.expirationPnl, s.theoreticalPnl]);
    let yMin = Math.min(...vals, 0);
    let yMax = Math.max(...vals, 0);
    if (Math.abs(yMax - yMin) < 1e-9) {
      yMin -= 0.05;
      yMax += 0.05;
    } else {
      const pad = (yMax - yMin) * 0.12;
      yMin -= pad;
      yMax += pad;
    }
    const xOf = (p: number) =>
      PAD.left + ((p - xMin) / (xMax - xMin || 1)) * INNER_W;
    const yOf = (v: number) =>
      PAD.top + ((yMax - v) / (yMax - yMin || 1)) * INNER_H;
    return { xMin, xMax, yMin, yMax, xOf, yOf };
  }, [series]);

  const expPts = useMemo(
    () =>
      series.map((s) => ({
        x: scales.xOf(s.price),
        y: scales.yOf(s.expirationPnl),
      })),
    [series, scales]
  );

  const theoPts = useMemo(
    () =>
      series.map((s) => ({
        x: scales.xOf(s.price),
        y: scales.yOf(s.theoreticalPnl),
      })),
    [series, scales]
  );

  const zeroY = scales.yOf(0);
  const spotX = scales.xOf(plotSpot);

  const areaPosPath = useMemo(() => {
    if (expPts.length === 0) return "";
    let d = `M${expPts[0].x},${zeroY}`;
    for (const p of expPts) d += ` L${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    d += ` L${expPts[expPts.length - 1].x},${zeroY} Z`;
    return d;
  }, [expPts, zeroY]);

  const xTicks = useMemo(
    () => niceTicks(scales.xMin, scales.xMax, 6),
    [scales.xMin, scales.xMax]
  );
  const yTicks = useMemo(
    () => niceTicks(scales.yMin, scales.yMax, 6),
    [scales.yMin, scales.yMax]
  );

  const zoomBy = useCallback((factor: number, anchorPrice?: number) => {
    setRangePct((r) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, r * factor));
      return next;
    });
    if (anchorPrice != null && Number.isFinite(anchorPrice)) {
      setViewCenter(anchorPrice);
    }
  }, []);

  const resetView = useCallback(() => {
    setRangePct(ZOOM_DEFAULT);
    setViewCenter(null);
  }, []);

  const priceFromClientX = useCallback(
    (svg: SVGSVGElement, clientX: number) => {
      const rect = svg.getBoundingClientRect();
      const mx = ((clientX - rect.left) / rect.width) * W;
      return (
        scales.xMin +
        ((mx - PAD.left) / INNER_W) * (scales.xMax - scales.xMin)
      );
    },
    [scales.xMin, scales.xMax]
  );

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (series.length === 0) return;
    const svg = e.currentTarget;

    if (panRef.current?.active) {
      const rect = svg.getBoundingClientRect();
      const dxPx = e.clientX - panRef.current.startX;
      const dxPrice =
        -(dxPx / rect.width) * (scales.xMax - scales.xMin);
      setViewCenter(panRef.current.startCenter + dxPrice);
      return;
    }

    const price = priceFromClientX(svg, e.clientX);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < series.length; i++) {
      const d = Math.abs(series[i].price - price);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const s = series[best];
    setHover({
      price: s.price,
      exp: s.expirationPnl,
      theo: s.theoreticalPnl,
      x: scales.xOf(s.price),
      y: scales.yOf(s.expirationPnl),
    });
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (series.length === 0) return;
    e.preventDefault();
    const price = priceFromClientX(e.currentTarget, e.clientX);
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    zoomBy(factor, price);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || series.length === 0) return;
    // Shift+drag or middle button = pan; plain drag also pans when holding space… use Shift
    if (!e.shiftKey && e.detail !== 0) {
      // Allow shift-drag pan; without shift, still allow drag-pan with meta? Use always drag-to-pan on empty + wheel zoom
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = {
      active: true,
      startX: e.clientX,
      startCenter: center,
    };
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current?.active) {
      panRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const zoomLabel = `±${Math.round(rangePct * 100)}%`;

  return (
    <Card>
      <CardHeader>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <CardTitle>Profit &amp; Loss Diagram</CardTitle>
            <CardDescription>
              Solid blue = expiration · Dashed purple = theoretical (T+
              {daysFromNow}d) · Scroll wheel zooms · drag pans · double-click
              resets
            </CardDescription>
          </div>
          {legs.length > 0 && (
            <div className="bos-pnl-stats">
              <div>
                <div className="bos-pnl-stat-label">Theo P&amp;L</div>
                <div
                  className="mono bos-pnl-stat-value"
                  style={{ color: pnlAtSpot >= 0 ? "#0ecb81" : "#f6465d" }}
                >
                  {formatBtc(pnlAtSpot)}
                </div>
              </div>
              <div>
                <div className="bos-pnl-stat-label">Expiry P&amp;L @ S</div>
                <div
                  className="mono bos-pnl-stat-value"
                  style={{ color: expPnlAtSpot >= 0 ? "#0ecb81" : "#f6465d" }}
                >
                  {formatBtc(expPnlAtSpot)}
                </div>
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 10,
            color: "#7d8799",
          }}
        >
          <span>
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 2,
                background: "#38bdf8",
                verticalAlign: "middle",
                marginRight: 4,
              }}
            />
            Expiration
          </span>
          <span>
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 0,
                borderTop: "2px dashed #a78bfa",
                verticalAlign: "middle",
                marginRight: 4,
              }}
            />
            Theoretical
          </span>
          <span>
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 10,
                background: "#f0b90b",
                verticalAlign: "middle",
                marginRight: 4,
              }}
            />
            Spot
          </span>
          {breakevens.slice(0, 3).map((b) => (
            <span key={b}>BE ${formatPrice(b, 0)}</span>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {legs.length === 0 ? (
          <div
            style={{
              height: H,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px dashed var(--border, #2a3142)",
              borderRadius: 8,
              color: "#5c6578",
              fontSize: 14,
            }}
          >
            Build a strategy to plot P&amp;L
          </div>
        ) : (
          <div
            className="bos-pnl-chart-wrap"
            style={{
              width: "100%",
              borderRadius: 8,
              border: "1px solid var(--border, #2a3142)",
              background: "var(--bg, #0b0e11)",
              overflow: "hidden",
              position: "relative",
              touchAction: "none",
            }}
          >
            {/* Zoom controls on the chart — next to the plot, not the header */}
            <div className="bos-zoom-bar" role="toolbar" aria-label="Chart zoom">
              <button
                type="button"
                className="bos-zoom-btn"
                onClick={() => zoomBy(1 / 1.25, hover?.price ?? center)}
                title="Zoom in (or scroll up)"
              >
                +
              </button>
              <button
                type="button"
                className="bos-zoom-btn"
                onClick={() => zoomBy(1.25, hover?.price ?? center)}
                title="Zoom out (or scroll down)"
              >
                −
              </button>
              <button
                type="button"
                className="bos-zoom-btn bos-zoom-btn--text"
                onClick={resetView}
                title="Reset zoom and pan (or double-click chart)"
              >
                Reset
              </button>
              <span className="mono bos-zoom-label">{zoomLabel}</span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height={H}
              style={{
                display: "block",
                maxWidth: "100%",
                cursor: panRef.current?.active ? "grabbing" : "crosshair",
              }}
              onMouseMove={onMove}
              onMouseLeave={() => {
                setHover(null);
                panRef.current = null;
              }}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={resetView}
              role="img"
              aria-label="Profit and loss diagram. Scroll to zoom, drag to pan, double-click to reset."
            >
              <defs>
                <linearGradient id={`pos-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ecb81" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0ecb81" stopOpacity="0.02" />
                </linearGradient>
                <clipPath id={`clip-${uid}`}>
                  <rect
                    x={PAD.left}
                    y={PAD.top}
                    width={INNER_W}
                    height={INNER_H}
                  />
                </clipPath>
              </defs>

              <rect
                x={PAD.left}
                y={PAD.top}
                width={INNER_W}
                height={INNER_H}
                fill="#0a0c10"
              />

              {yTicks.map((t) => {
                const y = scales.yOf(t);
                return (
                  <g key={`y-${t}`}>
                    <line
                      x1={PAD.left}
                      x2={PAD.left + INNER_W}
                      y1={y}
                      y2={y}
                      stroke="#2a3142"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={PAD.left - 8}
                      y={y + 3}
                      textAnchor="end"
                      fill="#7d8799"
                      fontSize={10}
                      fontFamily="ui-monospace, monospace"
                    >
                      {`${t >= 0 ? "+" : ""}${t.toFixed(3)}`}
                    </text>
                  </g>
                );
              })}

              {xTicks.map((t) => {
                const x = scales.xOf(t);
                return (
                  <g key={`x-${t}`}>
                    <text
                      x={x}
                      y={H - 10}
                      textAnchor="middle"
                      fill="#7d8799"
                      fontSize={10}
                      fontFamily="ui-monospace, monospace"
                    >
                      {t >= 1000
                        ? `${(t / 1000).toFixed(0)}k`
                        : String(Math.round(t))}
                    </text>
                  </g>
                );
              })}

              <g clipPath={`url(#clip-${uid})`}>
                <path d={areaPosPath} fill={`url(#pos-${uid})`} />

                <line
                  x1={PAD.left}
                  x2={PAD.left + INNER_W}
                  y1={zeroY}
                  y2={zeroY}
                  stroke="#5c6578"
                  strokeWidth={1}
                />

                {plotSpot >= scales.xMin && plotSpot <= scales.xMax && (
                  <line
                    x1={spotX}
                    x2={spotX}
                    y1={PAD.top}
                    y2={PAD.top + INNER_H}
                    stroke="#f0b90b"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                )}

                {breakevens.map((b) => {
                  if (b < scales.xMin || b > scales.xMax) return null;
                  const x = scales.xOf(b);
                  return (
                    <line
                      key={b}
                      x1={x}
                      x2={x}
                      y1={PAD.top}
                      y2={PAD.top + INNER_H}
                      stroke="#22d3ee"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      opacity={0.5}
                    />
                  );
                })}

                <path
                  d={buildPath(expPts, "step")}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />

                <path
                  d={buildPath(theoPts, "line")}
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  strokeLinejoin="round"
                />

                {hover && (
                  <>
                    <line
                      x1={hover.x}
                      x2={hover.x}
                      y1={PAD.top}
                      y2={PAD.top + INNER_H}
                      stroke="#a8b0c0"
                      strokeDasharray="2 2"
                      opacity={0.6}
                    />
                    <circle
                      cx={hover.x}
                      cy={hover.y}
                      r={4}
                      fill="#38bdf8"
                      stroke="#0b0e11"
                      strokeWidth={1}
                    />
                  </>
                )}
              </g>

              <text
                x={PAD.left + INNER_W / 2}
                y={H - 0}
                textAnchor="middle"
                fill="#5c6578"
                fontSize={9}
              >
                BTC price
              </text>
              <text
                x={14}
                y={PAD.top + INNER_H / 2}
                textAnchor="middle"
                fill="#5c6578"
                fontSize={9}
                transform={`rotate(-90 14 ${PAD.top + INNER_H / 2})`}
              >
                P&amp;L (BTC)
              </text>
            </svg>

            {hover && (
              <div
                className="mono"
                style={{
                  position: "absolute",
                  left: 12,
                  top: 12,
                  background: "rgba(20,24,32,0.95)",
                  border: "1px solid #2a3142",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 11,
                  pointerEvents: "none",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
                }}
              >
                <div style={{ color: "#e8ecf4", marginBottom: 4 }}>
                  ${formatPrice(hover.price, 0)}
                </div>
                <div style={{ color: "#38bdf8" }}>
                  Expiry {formatBtc(hover.exp)}
                </div>
                <div style={{ color: "#a78bfa" }}>
                  Theo {formatBtc(hover.theo)}
                </div>
                {indexPrice > 0 && (
                  <div style={{ color: "#7d8799", fontSize: 10, marginTop: 4 }}>
                    ≈ $
                    {(hover.exp * indexPrice).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
