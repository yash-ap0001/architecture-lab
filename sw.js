// Offline cache for Architecture Lab. Bump CACHE when files change so phones pick up the new version.
const CACHE = "archlab-v29";
const FILES = ["./", "index.html", "style.css", "engine.js", "levels.js", "graph.js", "sim.js", "theme.js", "catalog_more.js", "catalog_more2.js", "catalog_docs.js", "catalog_alts.js", "presets.js", "platforms.js", "platform_sizes.js", "examples_more.js", "sandbox.html", "sandbox.css", "sandbox.js", "missions.js", "interview.js", "lld_a.js", "lld_b.js", "lld_c.js", "lld_d.js", "lld_e.js", "lld.js", "collapse.js", "board.js", "app.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
