/* Architecture Lab canvas model: a drawn diagram of boxes and wires, compiled into the design the engine simulates.
 *
 * Rules that keep the drawing honest (nothing is simulated that is not wired):
 *  - traffic enters at Client and must reach the Database through an App server;
 *  - only wires that make sense are allowed (see ALLOWED);
 *  - a box that is not on a wired path from Client to Database does nothing, and is reported as such.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LabGraph = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TYPES = {
    client:  { rank: 0, label: "Client",        icon: "👥", fixed: true },
    limiter: { rank: 1, label: "Rate limiter",  icon: "🚦", key: "limiter" },
    cdn:     { rank: 2, label: "CDN",           icon: "🌐", key: "cdn" },
    lb:      { rank: 3, label: "Load balancer", icon: "⚖️", key: "lb" },
    app:     { rank: 4, label: "App servers",   icon: "🖥️", key: "app" },
    cache:   { rank: 5, label: "Cache",         icon: "⚡", key: "cache" },
    queue:   { rank: 6, label: "Write queue",   icon: "📬", key: "queue" },
    db:      { rank: 7, label: "Database",      icon: "🗄️", key: "db" },
  };
  const ALLOWED = {
    client: ["limiter", "cdn", "lb", "app"], limiter: ["cdn", "lb", "app"], cdn: ["lb", "app"], lb: ["app"],
    app: ["cache", "queue", "db"], cache: ["db"], queue: ["db"], db: [],
  };
  const DEFAULT_PROPS = {
    client: {}, limiter: { limitX: 1 }, cdn: {}, lb: { ha: false }, app: { count: 2, auto: false }, cache: { size: "m", count: 1, coalesce: false },
    queue: { workers: 4 }, db: { replicas: 0, ha: false, salting: false },
  };
  const SIZE_ORDER = { s: 1, m: 2, l: 3 };

  const COL_X = [75, 220, 365, 510, 655, 800, 945, 1090];   // x of each rank column in a 1200-wide board
  let counter = 0;
  const newId = (type) => type + "-" + Date.now().toString(36) + (counter++).toString(36);

  function place(g, node) {
    const same = g.nodes.filter((n) => n.type === node.type).length;
    node.x = COL_X[TYPES[node.type].rank];
    node.y = 300 + (same % 2 ? 1 : -1) * Math.ceil(same / 2) * 110;
    if (same === 0) node.y = 300;
  }
  function addNode(g, type, props) {
    const n = Object.assign({ id: newId(type), type }, JSON.parse(JSON.stringify(DEFAULT_PROPS[type])), props || {});
    place(g, n);
    g.nodes.push(n);
    return n;
  }
  function byId(g, id) { return g.nodes.find((n) => n.id === id); }

  function canConnect(g, a, b) {
    const A = byId(g, a), B = byId(g, b);
    if (!A || !B || A === B) return { ok: false, why: "Pick two different boxes." };
    if (g.edges.some((e) => e[0] === a && e[1] === b)) return { ok: false, why: "Already connected." };
    if (!ALLOWED[A.type].includes(B.type)) {
      if (B.type === "client") return { ok: false, why: "Nothing sends traffic to the client." };
      if (A.type === "client" && (B.type === "db" || B.type === "cache" || B.type === "queue")) return { ok: false, why: "Traffic must go through an app server first." };
      return { ok: false, why: `${TYPES[A.type].label} cannot send traffic to ${TYPES[B.type].label} directly.` };
    }
    return { ok: true };
  }
  function connect(g, a, b) { const c = canConnect(g, a, b); if (c.ok) g.edges.push([a, b]); return c; }
  function removeNode(g, id) {
    const n = byId(g, id); if (!n || TYPES[n.type].fixed) return false;
    g.nodes = g.nodes.filter((x) => x.id !== id); g.edges = g.edges.filter((e) => e[0] !== id && e[1] !== id); return true;
  }
  function removeEdge(g, a, b) { g.edges = g.edges.filter((e) => !(e[0] === a && e[1] === b)); }

  /* Starting picture: Client -> App -> Database. */
  function starter() {
    const g = { nodes: [], edges: [] };
    const c = addNode(g, "client"), a = addNode(g, "app", { count: 1 }), d = addNode(g, "db");
    connect(g, c.id, a.id); connect(g, a.id, d.id);
    return g;
  }

  /* Wire a newly added box into the existing picture (optional helper for beginners). */
  function autoWire(g, node) {
    const r = TYPES[node.type].rank;
    const connected = g.nodes.filter((n) => n !== node);
    const before = connected.filter((n) => TYPES[n.type].rank < r && ALLOWED[n.type].includes(node.type)).sort((a, b) => TYPES[b.type].rank - TYPES[a.type].rank)[0];
    const after = connected.filter((n) => TYPES[n.type].rank > r && ALLOWED[node.type].includes(n.type)).sort((a, b) => TYPES[a.type].rank - TYPES[b.type].rank)[0];
    const notes = [];
    if (before) {
      // insert into an existing wire when the new box sits between two connected boxes
      const spanning = after && g.edges.find((e) => e[0] === before.id && e[1] === after.id);
      if (spanning && ALLOWED[before.type].includes(node.type) && ALLOWED[node.type].includes(after.type)) { removeEdge(g, before.id, after.id); connect(g, before.id, node.id); connect(g, node.id, after.id); return notes; }
      connect(g, before.id, node.id);
    }
    if (after) connect(g, node.id, after.id);
    return notes;
  }

  /* ---------------------------------------------------------------- compile to an engine design */
  function compile(g, level, peakRps) {
    const rank = (id) => TYPES[byId(g, id).type].rank;
    const valid = g.edges.filter((e) => byId(g, e[0]) && byId(g, e[1]) && ALLOWED[byId(g, e[0]).type].includes(byId(g, e[1]).type));
    const out = {}, inn = {};
    g.nodes.forEach((n) => { out[n.id] = []; inn[n.id] = []; });
    valid.forEach(([a, b]) => { out[a].push(b); inn[b].push(a); });
    const walk = (starts, adj) => { const seen = new Set(starts); const q = [...starts]; while (q.length) { const x = q.pop(); adj[x].forEach((y) => { if (!seen.has(y)) { seen.add(y); q.push(y); } }); } return seen; };
    const client = g.nodes.find((n) => n.type === "client");
    const fromClient = walk([client.id], out);
    const dbs = g.nodes.filter((n) => n.type === "db").map((n) => n.id);
    const toDb = walk(dbs, inn);
    const live = new Set([...fromClient].filter((id) => toDb.has(id)));
    const on = (type) => g.nodes.filter((n) => n.type === type && live.has(n.id));
    const problems = [], notes = [];
    const apps = on("app"), dbn = on("db");
    if (!apps.length || !dbn.length) problems.push("Connect Client → App servers → Database to run traffic.");
    g.nodes.forEach((n) => { if (!TYPES[n.type].fixed && !live.has(n.id)) notes.push({ id: n.id, text: `${TYPES[n.type].label} is not on a wired path from Client to Database, so it does nothing.` }); });
    const cfg = {
      cdn: on("cdn").length > 0, limiter: 0, lb: "none", app: { n: 1, auto: false }, cache: { tier: "none", nodes: 1, coalesce: false }, queue: { on: false, workers: 2 },
      db: { shards: 1, replicas: 0, ha: false, salting: false },
    };
    const lim = on("limiter"); if (lim.length) cfg.limiter = Math.round((peakRps || 0) * Math.max(...lim.map((n) => +n.limitX || 1)));
    const lbs = on("lb"); if (lbs.length) cfg.lb = lbs.some((n) => n.ha) ? "ha" : "single";
    if (apps.length) cfg.app = { n: apps.reduce((s, n) => s + (+n.count || 1), 0), auto: apps.some((n) => n.auto) };
    const caches = on("cache");
    if (caches.length) cfg.cache = { tier: caches.map((n) => n.size).sort((a, b) => SIZE_ORDER[b] - SIZE_ORDER[a])[0], nodes: caches.reduce((s, n) => s + (+n.count || 1), 0), coalesce: caches.some((n) => n.coalesce) };
    const qs = on("queue"); if (qs.length) cfg.queue = { on: true, workers: qs.reduce((s, n) => s + (+n.workers || 1), 0) };
    if (dbn.length) cfg.db = { shards: dbn.length, replicas: Math.max(...dbn.map((n) => +n.replicas || 0)), ha: dbn.some((n) => n.ha), salting: dbn.some((n) => n.salting) };
    // wires that the rules forbid (kept out of the compile, reported for the player)
    g.edges.forEach(([a, b]) => { if (!valid.some((e) => e[0] === a && e[1] === b)) notes.push({ id: a, text: "A wire that the rules do not allow was ignored." }); });
    return { cfg, problems, notes, live };
  }

  /* Draw a design that is equivalent to an engine config (used for reference designs and tests). */
  function fromCfg(cfg, peakRps) {
    const g = { nodes: [], edges: [] };
    const chain = [addNode(g, "client")];
    const add = (type, props) => { const n = addNode(g, type, props); chain.push(n); return n; };
    if (cfg.limiter > 0) add("limiter", { limitX: peakRps ? Math.round((cfg.limiter / peakRps) * 100) / 100 : 1 });
    if (cfg.cdn) add("cdn");
    if (cfg.lb && cfg.lb !== "none") add("lb", { ha: cfg.lb === "ha" });
    add("app", { count: cfg.app.n, auto: !!cfg.app.auto });
    const appNode = chain[chain.length - 1];
    for (let i = 0; i < chain.length - 1; i++) connect(g, chain[i].id, chain[i + 1].id);
    const dbs = [];
    for (let i = 0; i < cfg.db.shards; i++) dbs.push(addNode(g, "db", { replicas: cfg.db.replicas, ha: !!cfg.db.ha, salting: !!cfg.db.salting }));
    let upstream = appNode;
    if (cfg.cache && cfg.cache.tier !== "none") { const c = addNode(g, "cache", { size: cfg.cache.tier, count: cfg.cache.nodes, coalesce: !!cfg.cache.coalesce }); connect(g, appNode.id, c.id); dbs.forEach((d) => connect(g, c.id, d.id)); }
    if (cfg.queue && cfg.queue.on) { const q = addNode(g, "queue", { workers: cfg.queue.workers }); connect(g, appNode.id, q.id); dbs.forEach((d) => connect(g, q.id, d.id)); }
    dbs.forEach((d) => connect(g, appNode.id, d.id));
    return g;
  }

  return { TYPES, ALLOWED, DEFAULT_PROPS, starter, addNode, connect, canConnect, removeNode, removeEdge, autoWire, compile, fromCfg, byId };
});
