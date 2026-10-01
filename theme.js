/* Theme: Auto (follows the device), Light or Dark. Remembered in this browser. */
(function () {
  "use strict";
  var K = "archlab.theme", mode = "auto", root = document.documentElement;
  try { mode = localStorage.getItem(K) || "auto"; } catch (e) { /* ignore */ }
  var embedded = false;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  if (embedded) root.classList.add("embedded");
  // Opened directly on the local Control Room dashboard (not embedded, not the public Vercel
  // site) — send it into the dashboard shell instead of showing the bare standalone page.
  else if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) && location.pathname.indexOf("/architecture-lab/") === 0) {
    var qs = new URLSearchParams(location.search);
    var view = qs.get("tab") === "architect" ? "design-ai" : /sandbox\.html$/.test(location.pathname) ? "design-realplay" : "design-training";
    location.replace("/?view=" + view);
  }
  var LABEL = { auto: "🌓 Auto", light: "☀️ Light", dark: "🌙 Dark" };
  function isDark() { return mode === "dark" || (mode === "auto" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches); }
  function apply() {
    if (mode === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", isDark() ? "#0d0918" : "#1b1233");
    var b = document.getElementById("themeBtn"); if (b) { b.textContent = LABEL[mode]; b.title = "Theme: " + mode + " (click to change)"; }
  }
  function cycle() { mode = mode === "auto" ? "dark" : mode === "dark" ? "light" : "auto"; try { localStorage.setItem(K, mode); } catch (e) { /* ignore */ } apply(); }
  function mount() {
    if (document.getElementById("themeBtn")) return;
    var host = document.querySelector("#bar .tools") || document.querySelector("header.top"); if (!host) return;
    var b = document.createElement("button"); b.id = "themeBtn"; b.type = "button"; b.className = "theme-btn"; b.onclick = cycle; host.appendChild(b); apply();
  }
  apply();
  if (window.matchMedia) { try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply); } catch (e) { /* ignore */ } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
