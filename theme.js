/* Theme: Auto (follows the device), Light or Dark. Remembered in this browser. */
(function () {
  "use strict";
  var K = "archlab.theme", mode = "auto", root = document.documentElement;
  try { mode = localStorage.getItem(K) || "auto"; } catch (e) { /* ignore */ }
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
