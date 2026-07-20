/**
 * Mounts the in-app BTC Option Strategy React island.
 *
 * Source: strategy-builder/ (single app with this dashboard)
 * Build:  npm run build:strategy   (from repo root)
 * Assets: assets/options-strategy/btc-options-strategy.{js,css}
 * Data:   same-origin GET /api/options/chain
 */
(function () {
  let mounted = false;

  window.initOptionsStrategyBuilder = function initOptionsStrategyBuilder() {
    const root = document.getElementById("options-strategy-root");
    const fallback = document.getElementById("options-strategy-fallback");
    if (!root) return;

    const api = window.BtcOptionsStrategy;
    if (!api || typeof api.mount !== "function") {
      if (fallback) fallback.hidden = false;
      console.error("[options-strategy] BtcOptionsStrategy bundle not loaded");
      return;
    }

    try {
      if (fallback) fallback.hidden = true;
      api.mount(root);
      mounted = true;
    } catch (err) {
      console.error("[options-strategy] mount failed", err);
      if (fallback) fallback.hidden = false;
    }
  };

  window.teardownOptionsStrategyBuilder = function teardownOptionsStrategyBuilder() {
    if (!mounted) return;
    try {
      window.BtcOptionsStrategy?.unmount?.();
    } catch (_) {}
    mounted = false;
  };
})();
