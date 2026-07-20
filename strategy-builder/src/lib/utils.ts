import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBtc(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} ₿`;
}

export function formatUsd(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatPrice(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatIv(ivDecimal: number): string {
  if (!Number.isFinite(ivDecimal)) return "—";
  return `${(ivDecimal * 100).toFixed(1)}%`;
}

export function formatPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSigned(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

/** Parse Deribit instrument name: BTC-28MAR25-100000-C */
export function parseInstrumentName(name: string): {
  expirationLabel: string;
  strike: number;
  type: "call" | "put";
} | null {
  const parts = name.split("-");
  if (parts.length < 4) return null;
  const typeChar = parts[parts.length - 1];
  const strike = Number(parts[parts.length - 2]);
  const expirationLabel = parts[1];
  if (!Number.isFinite(strike) || (typeChar !== "C" && typeChar !== "P")) {
    return null;
  }
  return {
    expirationLabel,
    strike,
    type: typeChar === "C" ? "call" : "put",
  };
}

export function expirationLabelFromTs(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

/** Short expiry for chips: "07-25" from "2026-07-25" */
export function shortExpiry(dateOrTs: string | number): string {
  if (typeof dateOrTs === "number") {
    return new Date(dateOrTs).toISOString().slice(5, 10);
  }
  // already YYYY-MM-DD
  if (dateOrTs.length >= 10) return dateOrTs.slice(5, 10);
  return dateOrTs;
}

/** Days remaining until expiry timestamp */
export function dteLabel(expirationTimestamp: number, now = Date.now()): string {
  const days = Math.max(
    0,
    Math.round((expirationTimestamp - now) / (1000 * 60 * 60 * 24))
  );
  return `${days}d`;
}

export function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, (toMs - fromMs) / (1000 * 60 * 60 * 24));
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
