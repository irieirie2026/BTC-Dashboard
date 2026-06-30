/** Reinforce tab icon after Safari parses the document. */
(function () {
  const HREF = "https://btc-dashboard-bay.vercel.app/favicon-32.png?v=7";

  function applyFavicon() {
    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((el) => {
      el.remove();
    });
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.sizes = "32x32";
    link.href = HREF;
    document.head.appendChild(link);
  }

  applyFavicon();
  document.addEventListener("DOMContentLoaded", applyFavicon);
  window.addEventListener("pageshow", applyFavicon);
})();