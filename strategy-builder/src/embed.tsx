"use client";

/**
 * Embed entry for BTC Dashboard (IIFE bundle).
 * window.BtcOptionsStrategy.mount(element)
 * window.BtcOptionsStrategy.unmount()
 */

import { createRoot, type Root } from "react-dom/client";
import { AppShell } from "@/components/app-shell";
import "./embed.css";

let root: Root | null = null;
let host: HTMLElement | null = null;

export function mount(el: HTMLElement) {
  if (!el) return;
  if (root && host === el) return;
  unmount();
  host = el;
  el.classList.add("btc-options-root");
  root = createRoot(el);
  root.render(<AppShell hideHeader />);
}

export function unmount() {
  if (root) {
    root.unmount();
    root = null;
  }
  host = null;
}

declare global {
  interface Window {
    BtcOptionsStrategy?: {
      mount: (el: HTMLElement) => void;
      unmount: () => void;
    };
  }
}

if (typeof window !== "undefined") {
  window.BtcOptionsStrategy = { mount, unmount };
}
