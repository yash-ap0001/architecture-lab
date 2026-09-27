// Canvas model checks. Run: node tests/graph_check.js
const E = require("../engine.js"), LV = require("../levels.js"), G = require("../graph.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const same = (a, b, l) => { const x = E.grade(l, a), y = E.grade(l, b); const near = (p, q) => Math.abs(p - q) <= 1e-6 * Math.max(1, Math.abs(p));
  return near(x.normal.p95, y.normal.p95) && near(x.stress.p95, y.stress.p95) && near(x.normal.availability, y.normal.availability) && near(x.stress.availability, y.stress.availability) && x.stress.cost === y.stress.cost; };

// 1. every reference design, drawn on the canvas and compiled back, is the same design
for (const l of LV) {
  const peak = Math.max(...E.trafficCurve(l.load));
  const g = G.fromCfg(l.ref, peak), c = G.compile(g, l, peak);
  ok(c.problems.length === 0 && same(c.cfg, l.ref, l), `level ${l.id}: reference design drawn on the canvas behaves exactly like the engine design`);
  ok(E.grade(l, c.cfg).stars === 3, `level ${l.id}: drawn reference design still earns 3 stars`);
}
// 2. starter picture compiles and runs
const s = G.starter(), sc = G.compile(s, LV[0], 120);
ok(sc.problems.length === 0 && sc.cfg.app.n === 1, "starter (Client, App, Database) is runnable");
// 3. wiring rules
let g = G.starter(); const app = g.nodes.find((n) => n.type === "app"), db = g.nodes.find((n) => n.type === "db"), cl = g.nodes.find((n) => n.type === "client");
ok(!G.canConnect(g, cl.id, db.id).ok, "client cannot skip the app server to reach the database");
const cache = G.addNode(g, "cache");
ok(!G.compile(g, LV[2], 1000).cfg.cache || G.compile(g, LV[2], 1000).cfg.cache.tier === "none", "an unwired cache does nothing");
ok(G.compile(g, LV[2], 1000).notes.some((n) => n.id === cache.id), "an unwired cache is reported");
G.connect(g, app.id, cache.id); ok(G.compile(g, LV[2], 1000).cfg.cache.tier === "none", "a cache with no path to the database still does nothing");
G.connect(g, cache.id, db.id); ok(G.compile(g, LV[2], 1000).cfg.cache.tier === "m", "a cache wired app -> cache -> database counts");
ok(!G.canConnect(g, db.id, app.id).ok, "no wire from the database back to the app");
// 4. missing pieces block the run
const empty = { nodes: [G.addNode({ nodes: [], edges: [] }, "client")], edges: [] };
ok(G.compile(empty, LV[0], 100).problems.length > 0, "a diagram without app and database cannot run");
// 5. more boxes means more capacity
g = G.starter(); const a2 = G.addNode(g, "app", { count: 3 }); G.connect(g, g.nodes[0].id, a2.id); G.connect(g, a2.id, g.nodes.find((n) => n.type === "db").id);
ok(G.compile(g, LV[0], 100).cfg.app.n === 4, "two app boxes (1 + 3) add up to 4 servers");
const d2 = G.addNode(g, "db"); G.connect(g, g.nodes.find((n) => n.type === "app").id, d2.id); ok(G.compile(g, LV[0], 100).cfg.db.shards === 2, "two database boxes are two shards");
// 6. auto-wire inserts a load balancer between client and app
g = G.starter(); const lb = G.addNode(g, "lb"); G.autoWire(g, lb);
const cc = G.compile(g, LV[1], 3000); ok(cc.cfg.lb === "single" && cc.problems.length === 0, "auto-wire puts a new load balancer between client and app");
console.log(fail ? `\n${fail} FAILED` : "\nall graph checks passed"); process.exit(fail ? 1 : 0);
