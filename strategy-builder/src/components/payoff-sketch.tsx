"use client";

import type { PayoffShape } from "@/types/options";

/**
 * Tiny educational payoff thumbnails (schematic, not live P&L).
 * Paths are normalized to a 64×36 viewBox.
 */
const PATHS: Record<PayoffShape, string> = {
  "long-call": "M4 28 H28 L56 8",
  "long-put": "M8 8 L28 28 H60",
  "short-call": "M4 8 H28 L56 28",
  "short-put": "M8 28 L28 8 H60",
  "bull-call": "M4 28 H20 L36 10 H60",
  "bear-put": "M4 10 H20 L36 28 H60",
  "bull-put": "M4 22 H24 L40 10 H60",
  "bear-call": "M4 10 H24 L40 22 H60",
  straddle: "M8 8 L32 28 L56 8",
  strangle: "M6 12 L22 28 H42 L58 12",
  "short-straddle": "M8 28 L32 8 L56 28",
  "short-strangle": "M6 24 L22 8 H42 L58 24",
  "iron-condor": "M4 24 L14 24 L22 10 H42 L50 24 H60",
  "iron-butterfly": "M4 24 L18 24 L32 6 L46 24 H60",
  "long-butterfly": "M6 26 L20 26 L32 8 L44 26 H58",
  "short-butterfly": "M6 10 L20 10 L32 28 L44 10 H58",
  "inverse-condor": "M4 12 L14 12 L22 26 H42 L50 12 H60",
  calendar: "M8 22 Q32 6 56 22",
  "risk-reversal": "M8 28 L28 20 L56 6",
  "jade-lizard": "M6 20 L20 20 L32 8 H50 L58 16",
  "ladder-bull": "M4 26 H18 L30 12 L42 18 L58 28",
  "ladder-bear": "M4 12 L18 20 L30 28 L42 14 L58 6",
  "ratio-back": "M6 20 H24 L32 24 L58 4",
  "ratio-front": "M6 22 H22 L36 8 L58 28",
  "synthetic-long": "M8 28 L56 8",
  "synthetic-short": "M8 8 L56 28",
  strip: "M8 6 L32 28 L52 14",
  strap: "M12 14 L32 28 L56 6",
};

export function PayoffSketch({
  shape,
  width = 72,
  height = 40,
  className,
}: {
  shape: PayoffShape;
  width?: number;
  height?: number;
  className?: string;
}) {
  const d = PATHS[shape] ?? PATHS["long-call"];
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 64 36"
      className={className}
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* axes */}
      <line x1="4" y1="18" x2="60" y2="18" stroke="#3f3f46" strokeWidth="0.8" />
      <line x1="32" y1="4" x2="32" y2="32" stroke="#3f3f46" strokeWidth="0.6" strokeDasharray="2 2" />
      {/* profit zone hint */}
      <rect x="4" y="4" width="56" height="14" fill="rgba(52,211,153,0.06)" />
      <rect x="4" y="18" width="56" height="14" fill="rgba(248,113,113,0.05)" />
      <path
        d={d}
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
