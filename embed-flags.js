// Kept out of the HTML so the public site's CSP can stay script-src 'self' (no inline scripts).
(function () {
  const q = new URLSearchParams(location.search), root = document.documentElement;
  if (q.get("embed") === "control-room") root.classList.add("control-room-embed");
  if (q.get("reference") === "1") root.classList.add("reference-canvas");
})();
