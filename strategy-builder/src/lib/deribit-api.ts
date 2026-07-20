/**
 * Client-side Deribit options chain fetch.
 * Works in:
 *  - standalone Next (via /api/options/chain route)
 *  - embedded in BTC Dashboard (same-origin Python /api/options/chain)
 */

import type { OptionsChainData } from "@/types/options";

export type ChainResult =
  | { ok: true; data: OptionsChainData }
  | { ok: false; error: string };

function apiBase(): string {
  if (typeof window === "undefined") return "";
  const w = window as Window & { BTC_OPTIONS_API_BASE?: string };
  if (w.BTC_OPTIONS_API_BASE) return w.BTC_OPTIONS_API_BASE.replace(/\/$/, "");
  return "";
}

export async function fetchOptionsChain(
  refresh = false
): Promise<ChainResult> {
  try {
    const q = refresh ? "?refresh=1" : "";
    const res = await fetch(`${apiBase()}/api/options/chain${q}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, error: `API error ${res.status}` };
    }
    const json = (await res.json()) as
      | OptionsChainData
      | { error?: string; ok?: boolean; data?: OptionsChainData };

    // Support both raw payload and { ok, data } wrappers
    if (json && typeof json === "object" && "ok" in json) {
      if ((json as { ok: boolean }).ok && (json as { data?: OptionsChainData }).data) {
        return { ok: true, data: (json as { data: OptionsChainData }).data };
      }
      return {
        ok: false,
        error: (json as { error?: string }).error ?? "Unknown API error",
      };
    }

    const data = json as OptionsChainData;
    if (!data.expirations || typeof data.indexPrice !== "number") {
      return { ok: false, error: "Invalid chain payload" };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load options chain",
    };
  }
}
