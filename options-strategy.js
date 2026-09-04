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
  let pendingTimer = null;

  function showFallback(el, html, isError) {
    if (!el) return;
    el.hidden = false;
    el.innerHTML = html;
    el.classList.toggle("options-strategy-fallback--loading", !isError);
  }

  window.initOptionsStrategyBuilder = function initOptionsStrategyBuilder() {
    const root = document.getElementById("options-strategy-root");
    const fallback = document.getElementById("options-strategy-fallback");
    if (!root) return;
    if (mounted && root.childNodes.length) {
      if (fallback) fallback.hidden = true;
      return;
    }

    const tryMount = (attempt) => {
      const api = window.BtcOptionsStrategy;
      if (!api || typeof api.mount !== "function") {
        if (attempt < 25) {
          showFallback(fallback, "Loading strategy builder…", false);
          pendingTimer = setTimeout(() => tryMount(attempt + 1), 150);
          return;
        }
        showFallback(
          fallback,
          "Strategy builder failed to load. From the dashboard root run " +
            "<code>npm run install:strategy && npm run build:strategy</code> then refresh.",
          true,
        );
        console.error("[options-strategy] BtcOptionsStrategy bundle not loaded");
        return;
      }

      try {
        if (fallback) fallback.hidden = true;
        api.mount(root);
        mounted = true;
      } catch (err) {
        console.error("[options-strategy] mount failed", err);
        showFallback(
          fallback,
          "Strategy builder hit a mount error. Refresh the page — rebuild with " +
            "<code>npm run build:strategy</code> only if the island is missing after a pull.",
          true,
        );
      }
    };

    if (pendingTimer) clearTimeout(pendingTimer);
    tryMount(0);
  };

  window.teardownOptionsStrategyBuilder = function teardownOptionsStrategyBuilder() {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (!mounted) return;
    try {
      window.BtcOptionsStrategy?.unmount?.();
    } catch (_) {}
    mounted = false;
  };
})();
