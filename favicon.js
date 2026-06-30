/** Safari often ignores static favicon links — reinforce after parse. */
(function () {
  const ORIGIN = "https://btc-dashboard-bay.vercel.app";
  const HREF = ORIGIN + "/favicon-32.png?v=6";

  function applyFavicon() {
    document.querySelectorAll('link[data-favicon-fix]').forEach((el) => el.remove());
    const png = document.createElement("link");
    png.rel = "icon";
    png.type = "image/png";
    png.sizes = "32x32";
    png.href = HREF;
    png.setAttribute("data-favicon-fix", "1");
    document.head.appendChild(png);

    const shortcut = document.createElement("link");
    shortcut.rel = "shortcut icon";
    shortcut.type = "image/png";
    shortcut.href = HREF;
    shortcut.setAttribute("data-favicon-fix", "1");
    document.head.appendChild(shortcut);
  }

  applyFavicon();
  document.addEventListener("DOMContentLoaded", applyFavicon);
  window.addEventListener("pageshow", applyFavicon);
})();