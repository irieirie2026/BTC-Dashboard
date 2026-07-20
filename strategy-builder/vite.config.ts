import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Strategy Builder embed for BTC Dashboard.
 * Output: ../assets/options-strategy/btc-options-strategy.{js,css}
 * Mount: window.BtcOptionsStrategy.mount(el)
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: path.resolve(__dirname, "../assets/options-strategy"),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "src/embed.tsx"),
      name: "BtcOptionsStrategy",
      formats: ["iife"],
      fileName: () => "btc-options-strategy.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: "btc-options-strategy.[ext]",
        inlineDynamicImports: true,
      },
    },
  },
});
