/* Example designs for the Sandbox. Each is a graph plus a traffic scenario and goals. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.LabPresets = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function G() { const g = { nodes: [], edges: [] }; return { g, n(id, type, x, y, props) { g.nodes.push({ id, type, x, y, props: props || {} }); return id; }, e(a, b, extra) { g.edges.push(Object.assign({ from: a, to: b }, extra || {})); } }; }
  const X = [80, 290, 500, 710, 920, 1130];
  const PRESETS = [
    { id: "urlshort", name: "URL shortener", build() {
      const b = G(); b.n("c", "client", X[0], 260); b.n("lb", "lb", X[1], 260, { ha: true }); b.n("a", "app", X[2], 260, { inst: 22 }); b.n("k", "cache", X[3], 160, { hit: 0.92, coalesce: true }); b.n("d", "postgres", X[4], 260, { replicas: 2, ha: true });
      b.e("c", "lb"); b.e("lb", "a"); b.e("a", "k"); b.e("k", "d"); b.e("a", "d");
      return { name: "URL shortener", nodes: b.g.nodes, edges: b.g.edges, scenario: { base: 6000, shape: "diurnal", readFrac: 0.99, skew: 2 }, slo: { p95: 80, avail: 99.95, budget: 9000 } }; } },
    { id: "news", name: "News site (read heavy, CDN)", build() {
      const b = G(); b.n("c", "browser", X[0], 260); b.n("cdn", "cdn", X[1], 260); b.n("lb", "lb", X[2], 260); b.n("a", "app", X[3], 260, { inst: 30, auto: true }); b.n("k", "cache", X[4], 160, { inst: 2, hit: 0.9 }); b.n("d", "mysql", X[5], 260, { replicas: 2 });
      b.e("c", "cdn"); b.e("cdn", "lb"); b.e("lb", "a"); b.e("a", "k"); b.e("k", "d"); b.e("a", "d");
      return { name: "News site", nodes: b.g.nodes, edges: b.g.edges, scenario: { base: 12000, shape: "spike", spikeX: 2, readFrac: 0.96, staticFrac: 0.5 }, slo: { p95: 150, avail: 99.5, budget: 9000 } }; } },
    { id: "events", name: "Event ingestion (write heavy, queue)", build() {
      const b = G(); b.n("c", "client", X[0], 260); b.n("lb", "lb", X[1], 260); b.n("a", "go", X[2], 260, { inst: 14 }); b.n("q", "kafka", X[3], 260, { workers: 8 }); b.n("d", "cassandra", X[4], 260, { shards: 2 });
      b.e("c", "lb"); b.e("lb", "a"); b.e("a", "q"); b.e("q", "d");
      return { name: "Event ingestion", nodes: b.g.nodes, edges: b.g.edges, scenario: { base: 5000, shape: "spike", spikeX: 2, readFrac: 0.05 }, slo: { p95: 80, avail: 99, budget: 9000 } }; } },
    { id: "payments", name: "Payments API (external provider)", build() {
      const b = G(); b.n("c", "mobile", X[0], 260); b.n("gw", "apigw", X[1], 260); b.n("s", "java", X[2], 260, { inst: 6 }); b.n("p", "payment", X[3], 120, { inst: 2, ratio: 0.3 }); b.n("d", "sql", X[3], 380, { replicas: 1, ha: true });
      b.e("c", "gw"); b.e("gw", "s"); b.e("s", "p"); b.e("s", "d");
      return { name: "Payments API", nodes: b.g.nodes, edges: b.g.edges, scenario: { base: 500, shape: "steady", readFrac: 0.6 }, slo: { p95: 400, avail: 99.9, budget: 6000 } }; } },
    { id: "rag", name: "LLM chat app (RAG)", build() {
      const b = G(); b.n("c", "browser", X[0], 260); b.n("gw", "llmgw", X[1], 260); b.n("a", "python", X[2], 260, { inst: 4 }); b.n("v", "vector", X[3], 120); b.n("m", "llm", X[3], 380, { inst: 6 });
      b.e("c", "gw"); b.e("gw", "a"); b.e("a", "m"); b.e("a", "v", { fan: true, w: 1 });
      return { name: "LLM chat app (RAG)", nodes: b.g.nodes, edges: b.g.edges, scenario: { base: 60, shape: "steady", readFrac: 1 }, slo: { p95: 4000, avail: 99, budget: 12000 } }; } },
    { id: "jobs", name: "Remote job discovery", build() {
      const b = G(); b.n("c", "browser", X[0], 260); b.n("w", "waf", X[1], 260); b.n("a", "go", X[2], 260, { inst: 8, auto: true }); b.n("q", "kafka", X[3], 350, { workers: 10 }); b.n("d", "postgres", X[4], 350, { replicas: 2, ha: true }); b.n("s", "search-db", X[4], 130, { replicas: 1 });
      b.e("c", "w"); b.e("w", "a"); b.e("a", "q"); b.e("q", "d"); b.e("a", "s", { fan: true, w: 1 });
      return { name: "Remote job discovery", nodes: b.g.nodes, edges: b.g.edges, scenario: { base: 1600, shape: "spike", spikeX: 3, readFrac: 0.75, botFrac: 0.18 }, slo: { p95: 300, avail: 99.9, budget: 10000 } }; } },
    { id: "storm", name: "Retry storm lab (breaks on a burst)", build() {
      const b = G(); b.n("c", "client", X[0], 260); b.n("a", "app", X[2], 260, { inst: 12, retries: 3, timeout: 200 }); b.n("d", "sql", X[4], 260);
      b.e("c", "a"); b.e("a", "d");
      return { name: "Retry storm lab", nodes: b.g.nodes, edges: b.g.edges, scenario: { base: 1700, shape: "steady", readFrac: 1 }, slo: { p95: 150, avail: 99.5, budget: 4000 } }; } },
    { id: "global", name: "Global app: 2 regions with failover", build() {
      const b = G(); const R = { us: { y: 130 }, eu: { y: 400 } };
      b.n("cUS", "client", 80, R.us.y, { region: "us", name: "Users (US)" }); b.n("cEU", "client", 80, R.eu.y, { region: "eu", name: "Users (EU)" });
      b.n("lbUS", "lb", 300, R.us.y, { region: "us", name: "LB US" }); b.n("lbEU", "lb", 300, R.eu.y, { region: "eu", name: "LB EU" });
      b.n("aUS", "app", 540, R.us.y, { region: "us", inst: 16, name: "App US" }); b.n("aEU", "app", 540, R.eu.y, { region: "eu", inst: 16, name: "App EU" });
      b.n("dUS", "postgres", 800, R.us.y, { region: "us", replicas: 2, name: "DB US (primary)" }); b.n("dEU", "postgres", 800, R.eu.y, { region: "eu", replicas: 2, mode: "replica", peer: "dUS", autoPromote: true, name: "DB EU (replica)" });
      b.e("cUS", "lbUS"); b.e("cEU", "lbEU"); b.e("cUS", "lbEU", { failover: true }); b.e("cEU", "lbUS", { failover: true });
      b.e("lbUS", "aUS"); b.e("lbEU", "aEU"); b.e("aUS", "dUS"); b.e("aEU", "dEU", { only: "r" }); b.e("aEU", "dUS", { only: "w" });
      return { name: "Global app (2 regions)", nodes: b.g.nodes, edges: b.g.edges, scenario: { base: 3000, shape: "steady", readFrac: 0.9 }, slo: { p95: 250, avail: 99.5, budget: 12000 } }; } },
    { id: "start", name: "Start simple (client, app, database)", build() {
      const b = G(); b.n("c", "client", X[0], 260); b.n("a", "app", X[2], 260, { inst: 1 }); b.n("d", "sql", X[4], 260);
      b.e("c", "a"); b.e("a", "d");
      return { name: "Untitled design", nodes: b.g.nodes, edges: b.g.edges, scenario: { base: 800, shape: "ramp", readFrac: 0.9 }, slo: { p95: 200, avail: 99.5, budget: 3000 } }; } },
  ];
  return { PRESETS };
});
