/* Architecture Lab Sandbox engine: a general capacity simulator for any drawn graph of components.
 *
 * Teaching model. Every capacity, latency and price is a round LEARNING number chosen so trade-offs are visible.
 * They are not benchmarks. The player can override numbers per component.
 * Deterministic: the same graph, scenario and events always give the same result.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LabSim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TICK_S = 30;                 // one tick is 30 simulated seconds
  const TICKS = 120;                 // a full run is one simulated hour
  const K = { nodeLag: 8, detectTicks: 3, breakerProbe: 0.1, cdnHit: 0.9, coldTicks: 25, autoLag: 4, recoverManual: 40, recoverHa: 4, maxBacklog: 3000000, wafBotPass: 0.1, limiterBotPass: 0.1 };

  // ---------------------------------------------------------------- component catalogue
  // cls decides behaviour: source, router, proxy, service, cache, queue, db, store, cdn, limiter, external, passive
  const C = (id, name, cat, icon, cls, o) => Object.assign({ id, name, cat, icon, cls, cap: 0, ms: 1, cost: 0 }, o || {});
  const CATALOG = [
    C("client", "Client", "Clients", "👥", "source"), C("mobile", "Mobile app", "Clients", "📱", "source"), C("browser", "Web browser", "Clients", "🌍", "source"),
    C("dns", "DNS", "Traffic & edge", "📖", "router", { cap: 200000, ms: 5, cost: 20 }),
    C("cdn", "CDN", "Traffic & edge", "🌐", "cdn", { cap: 500000, ms: 8, cost: 200 }),
    C("cloudflare", "Cloudflare", "Traffic & edge", "☁️", "cdn", { cap: 800000, ms: 7, cost: 250 }),
    C("fastly", "Fastly", "Traffic & edge", "⚡", "cdn", { cap: 800000, ms: 6, cost: 260 }),
    C("waf", "WAF", "Traffic & edge", "🛡️", "limiter", { cap: 200000, ms: 3, cost: 60, waf: true }),
    C("limiter", "Rate limiter", "Traffic & edge", "🚦", "limiter", { cap: 20000, ms: 1, cost: 40 }),
    C("lb", "Load balancer", "Traffic & edge", "⚖️", "router", { cap: 30000, ms: 2, cost: 30, ha: true }),
    C("glb", "Global load balancer", "Traffic & edge", "🌐", "router", { cap: 1000000, ms: 5, cost: 120 }),
    C("apigw", "API gateway", "Traffic & edge", "🚪", "proxy", { cap: 15000, ms: 4, cost: 90 }),
    C("ingress", "Ingress", "Traffic & edge", "↘️", "proxy", { cap: 20000, ms: 2, cost: 40 }),
    C("nginx", "Nginx", "Traffic & edge", "🟩", "proxy", { cap: 25000, ms: 1.5, cost: 35 }),
    C("haproxy", "HAProxy", "Traffic & edge", "🔀", "router", { cap: 40000, ms: 1.5, cost: 35 }),
    C("envoy", "Envoy", "Traffic & edge", "🔷", "proxy", { cap: 30000, ms: 2, cost: 40 }),
    C("mesh", "Service mesh", "Traffic & edge", "🕸️", "proxy", { cap: 20000, ms: 3, cost: 80 }),
    C("app", "App server", "Compute", "🖥️", "service", { cap: 400, ms: 25, cost: 80 }),
    C("java", "Java service", "Compute", "☕", "service", { cap: 500, ms: 22, cost: 90 }),
    C("node", "Node.js service", "Compute", "🟢", "service", { cap: 450, ms: 20, cost: 70 }),
    C("python", "Python service", "Compute", "🐍", "service", { cap: 250, ms: 30, cost: 65 }),
    C("go", "Go service", "Compute", "🐹", "service", { cap: 900, ms: 10, cost: 70 }),
    C("auth", "Auth service", "Compute", "🔐", "service", { cap: 800, ms: 15, cost: 70 }),
    C("search", "Search service", "Compute", "🔎", "service", { cap: 300, ms: 40, cost: 110 }),
    C("notify", "Notifications", "Compute", "🔔", "service", { cap: 600, ms: 20, cost: 60 }),
    C("worker", "Worker", "Compute", "⚙️", "service", { cap: 350, ms: 60, cost: 75 }),
    C("serverless", "Serverless function", "Compute", "λ", "service", { cap: 1000, ms: 60, cost: 100, auto: true }),
    C("llmgw", "LLM gateway", "AI & ML", "🧭", "proxy", { cap: 2000, ms: 8, cost: 120 }),
    C("llm", "LLM inference (GPU)", "AI & ML", "🧠", "service", { cap: 15, ms: 1500, cost: 1800 }),
    C("embed", "Embedding model", "AI & ML", "🧬", "service", { cap: 120, ms: 90, cost: 900 }),
    C("vector", "Vector DB", "AI & ML", "🧮", "db", { rd: 1500, wr: 400, msR: 15, msW: 25, cost: 500, rep: 150 }),
    C("sql", "SQL database", "Storage", "🗄️", "db", { rd: 2000, wr: 1000, msR: 8, msW: 12, cost: 300, rep: 200 }),
    C("postgres", "PostgreSQL", "Storage", "🐘", "db", { rd: 2200, wr: 1000, msR: 8, msW: 12, cost: 300, rep: 200 }),
    C("mysql", "MySQL", "Storage", "🐬", "db", { rd: 2000, wr: 900, msR: 8, msW: 12, cost: 280, rep: 190 }),
    C("mongo", "MongoDB", "Storage", "🍃", "db", { rd: 5000, wr: 2500, msR: 6, msW: 9, cost: 380, rep: 260 }),
    C("dynamo", "DynamoDB", "Storage", "⚡", "db", { rd: 12000, wr: 6000, msR: 5, msW: 8, cost: 450, rep: 0 }),
    C("cassandra", "Cassandra", "Storage", "👁️", "db", { rd: 8000, wr: 8000, msR: 6, msW: 5, cost: 420, rep: 280 }),
    C("clickhouse", "ClickHouse", "Storage", "📊", "db", { rd: 3000, wr: 5000, msR: 20, msW: 6, cost: 480, rep: 300 }),
    C("search-db", "OpenSearch", "Storage", "🔍", "db", { rd: 2500, wr: 800, msR: 18, msW: 15, cost: 420, rep: 280 }),
    C("warehouse", "Data warehouse", "Storage", "🏭", "db", { rd: 400, wr: 2000, msR: 300, msW: 10, cost: 900, rep: 0 }),
    C("cache", "Cache (Redis)", "Storage", "⚡", "cache", { cap: 60000, ms: 1.5, cost: 90, hit: 0.8 }),
    C("memcached", "Memcached", "Storage", "🧊", "cache", { cap: 70000, ms: 1, cost: 70, hit: 0.75 }),
    C("dragonfly", "Dragonfly", "Storage", "🐉", "cache", { cap: 120000, ms: 1, cost: 110, hit: 0.8 }),
    C("object", "Object store", "Storage", "🪣", "store", { rd: 20000, wr: 5000, msR: 25, msW: 40, cost: 120 }),
    C("queue", "Message queue", "Messaging", "📬", "queue", { cap: 400, ms: 4, cost: 45, unit: 60 }),
    C("sqs", "SQS", "Messaging", "📭", "queue", { cap: 500, ms: 5, cost: 40, unit: 40 }),
    C("rabbit", "RabbitMQ", "Messaging", "🐇", "queue", { cap: 450, ms: 3, cost: 55, unit: 55 }),
    C("kafka", "Kafka", "Messaging", "🧵", "queue", { cap: 1500, ms: 5, cost: 200, unit: 150 }),
    C("stream", "Event stream", "Messaging", "🌊", "queue", { cap: 1200, ms: 5, cost: 160, unit: 120 }),
    C("pubsub", "Pub/Sub", "Messaging", "📣", "queue", { cap: 800, ms: 5, cost: 80, unit: 70 }),
    C("thirdparty", "Third-party API", "External", "🔌", "external", { cap: 300, ms: 120, cost: 0 }),
    C("payment", "Payment provider", "External", "💳", "external", { cap: 200, ms: 250, cost: 0 }),
    C("email", "Email service", "External", "✉️", "external", { cap: 400, ms: 150, cost: 0 }),
    C("metrics", "Metrics", "Observability", "📈", "passive", { cost: 40 }), C("logs", "Logs", "Observability", "📜", "passive", { cost: 50 }),
    C("tracing", "Tracing", "Observability", "🧭", "passive", { cost: 45 }), C("alerting", "Alerting", "Observability", "🚨", "passive", { cost: 20 }),
  ];
  const BY_ID = {}; CATALOG.forEach((c) => { c.prov = c.prov || "generic"; BY_ID[c.id] = c; });
  const CATS = [...new Set(CATALOG.map((c) => c.cat))];
  const CLASSES = ["source", "router", "proxy", "service", "cache", "queue", "db", "store", "cdn", "limiter", "external", "pool", "passive"];
  // equivalence groups for the original generic components, so they can be swapped with cloud services
  const EQ_BASE = { app: "vm", serverless: "fn", lb: "lb7", dns: "dns", cdn: "cdn", waf: "waf", apigw: "apigw", sql: "sql", postgres: "sql", mysql: "sql", mongo: "document", dynamo: "nosql-managed", cassandra: "wide-column", cache: "redis", object: "object", queue: "queue", kafka: "kafka", pubsub: "pubsub", stream: "stream", rabbit: "rabbit", "search-db": "search", warehouse: "warehouse", vector: "vector", llm: "llm-self", llmgw: "", memcached: "", worker: "batch", auth: "idp" };
  Object.keys(EQ_BASE).forEach((id) => { if (BY_ID[id]) BY_ID[id].eq = EQ_BASE[id]; });
  /* Add components (used by catalog_more.js). Bad entries are skipped and reported. */
  function extend(items) {
    const skipped = [];
    for (const it of items || []) {
      if (!it || !it.id || BY_ID[it.id] || CLASSES.indexOf(it.cls) < 0) { skipped.push(it && it.id); continue; }
      const c = Object.assign({ cap: 0, ms: 1, cost: 0, prov: "generic", eq: "" }, it); CATALOG.push(c); BY_ID[c.id] = c;
    }
    CATS.length = 0; [...new Set(CATALOG.map((c) => c.cat))].forEach((x) => CATS.push(x));
    return skipped;
  }
  /* Other components that do the same job on another provider. */
  const equivalents = (id) => { const c = BY_ID[id]; return c && c.eq ? CATALOG.filter((x) => x.eq === c.eq && x.id !== id) : []; };

  function defaultProps(def) {
    const p = { name: def.name };
    if (def.cls !== "passive") p.region = "";
    if (def.cls === "source") p.share = 1;
    if (["router", "proxy", "service"].includes(def.cls)) { p.inst = def.cls === "service" ? 2 : 1; p.auto = !!def.auto; if (def.ha) p.ha = false; }
    if (["proxy", "service"].includes(def.cls)) { p.retries = 0; p.timeout = 1000; p.breaker = false; p.fallback = false; p.deploy = "rolling"; }
    if (def.cls === "pool") { p.nodes = 3; p.auto = false; p.max = 30; p.multiAz = false; p.podsPerNode = def.podsPerNode || 8; }
    if (def.cls === "cache") { p.inst = 1; p.hit = def.hit; p.coalesce = false; }
    if (def.cls === "queue") { p.workers = 4; }
    if (def.cls === "db") { p.shards = 1; p.replicas = 0; p.ha = false; p.salting = false; p.mode = "primary"; p.peer = ""; p.consistency = "eventual"; p.qr = 0; p.qw = 0; p.rywShare = 0.2; }
    if (def.cls === "store") { p.inst = 1; }
    if (def.cls === "limiter") { p.limit = def.cap; }
    if (def.cls === "external") { p.ratio = 0.1; }
    return p;
  }

  // ---------------------------------------------------------------- traffic
  function trafficCurve(sc) {
    const out = [];
    for (let t = 0; t < TICKS; t++) {
      let f = 1;
      if (sc.shape === "ramp") f = 0.35 + 0.65 * (t / (TICKS - 1));
      else if (sc.shape === "spike") f = t >= 40 && t < 75 ? sc.spikeX || 5 : 1;
      else if (sc.shape === "diurnal") f = 0.55 + 0.45 * Math.sin((t / TICKS) * Math.PI);
      out.push((sc.base || 0) * f);
    }
    return out;
  }
  const DEFAULT_SCENARIO = { base: 1000, shape: "steady", spikeX: 3, readFrac: 0.9, staticFrac: 0, botFrac: 0, skew: 1 };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const stretch = (base, u) => { const x = clamp(u, 0, 0.95); return base * (1 + x / (2 * (1 - x))) + (u > 1 ? Math.min(u - 1, 20) * base * 40 : 0); };   // past 100% busy, queues build and latency climbs

  // ---------------------------------------------------------------- model
  /* graph: { nodes: [{id, type, props}], edges: [{from, to, w?}] }. Returns the runnable model or {error}. */
  function build(graph) {
    const nodes = {}, out = {}, inn = {};
    for (const n of graph.nodes) {
      const base = BY_ID[n.type]; if (!base) return { error: `Unknown component ${n.type}` };
      const p = Object.assign(defaultProps(base), n.props || {}), def = Object.assign({}, base);
      ["cap", "ms", "cost", "rd", "wr", "msR", "msW"].forEach((k) => { if (p[k] != null && p[k] !== "" && !isNaN(+p[k])) def[k] = +p[k]; });   // numbers the player replaced
      nodes[n.id] = { id: n.id, def, p }; out[n.id] = []; inn[n.id] = [];
    }
    const edges = [];
    for (const e of graph.edges) { if (nodes[e.from] && nodes[e.to] && e.from !== e.to && !edges.some((x) => x.from === e.from && x.to === e.to)) { edges.push({ from: e.from, to: e.to, w: e.w > 0 ? +e.w : 1, fan: !!e.fan, only: ["r", "w", "s"].includes(e.only) ? e.only : "", failover: !!e.failover }); } }
    // topological order; edges that close a cycle are dropped and reported
    const order = [], state = {}, dropped = [];
    const adj = {}; Object.keys(nodes).forEach((id) => { adj[id] = []; }); edges.forEach((e) => adj[e.from].push(e));
    const dfs = (id) => { state[id] = 1; for (const e of adj[id]) { if (state[e.to] === 1) dropped.push(e); else if (!state[e.to]) dfs(e.to); } state[id] = 2; order.push(id); };
    Object.keys(nodes).forEach((id) => { if (!state[id]) dfs(id); });
    order.reverse();
    const keep = edges.filter((e) => !dropped.includes(e));
    keep.forEach((e) => { out[e.from].push(e); inn[e.to].push(e); });
    const hostOf = {};                               // a node pool hosts the services it is wired to; an HPA box turns autoscaling on for its target
    keep.forEach((e) => { const A = nodes[e.from], B = nodes[e.to]; if (A.def.cls === "pool" && ["service", "proxy", "router"].includes(B.def.cls) && !hostOf[e.to]) hostOf[e.to] = e.from; if (A.def.tag === "hpa" && B.def.cls === "service") B.p.auto = true; });
    const monitored = Object.values(nodes).some((n) => n.def.monitor);
    const sources = Object.values(nodes).filter((n) => n.def.cls === "source");
    const warnings = [];
    if (!sources.length) return { error: "Add a Client so traffic has somewhere to start." };
    dropped.forEach((e) => warnings.push(`A wire from ${nodes[e.from].p.name} to ${nodes[e.to].p.name} makes a loop and was ignored.`));
    return { nodes, out, inn, order, sources, edges: keep, warnings, hostOf, monitored };
  }

  /* Which children receive which kind of request. Returns {r:[[id,weight]...], w:[...], s:[...], ext:[[id,ratio]...]} */
  function routes(m, id, unhealthy) {
    if (m.nodes[id].def.cls === "pool") return { r: [], w: [], s: [], ext: [] };
    const es = m.out[id], fan = es.filter((e) => e.fan), ext = [];
    const kindList = (kind) => {
      const groups = { cache: [], queue: [], data: [], chain: [], store: [], cdn: [] };
      for (const e of es) {
        if (e.fan || (e.only && e.only !== kind)) continue;          // a parallel call is an extra request; 'only' limits a wire to reads, writes or static files
        const c = m.nodes[e.to].def.cls;
        if (c === "cache") groups.cache.push(e); else if (c === "queue") groups.queue.push(e); else if (c === "db") groups.data.push(e); else if (c === "store") groups.store.push(e);
        else if (c === "external" || c === "passive" || c === "pool") continue; else if (c === "cdn") groups.cdn.push(e); else groups.chain.push(e);
      }
      const pick = (...lists) => lists.find((l) => l.length) || [];
      const list = kind === "r" ? pick(groups.cache, groups.chain, groups.cdn, groups.data, groups.store) : kind === "w" ? pick(groups.queue, groups.chain, groups.cdn, groups.data, groups.store) : pick(groups.store, groups.cdn, groups.chain);
      // failover wires carry traffic only when every ordinary target has been found unhealthy
      const prim = list.filter((e) => !e.failover), back = list.filter((e) => e.failover), ok = (e) => !(unhealthy && unhealthy[e.to]);
      const use = prim.filter(ok).length ? prim.filter(ok) : back.filter(ok).length ? back.filter(ok) : prim.length ? prim : back;
      const sum = use.reduce((a, e) => a + e.w, 0) || 1;
      return use.map((e) => {
        let to = e.to;
        if (kind === "w" && unhealthy && unhealthy[to] && m.nodes[to].def.cls === "db") {        // promote a replica
          const rep = Object.values(m.nodes).find((n) => n.def.cls === "db" && n.p.mode === "replica" && n.p.peer === to && n.p.autoPromote && !unhealthy[n.id]);
          if (rep) to = rep.id;
        }
        return [to, e.w / sum];
      });
    };
    for (const e of es) if (!e.fan && !e.only && m.nodes[e.to].def.cls === "external") ext.push([e.to, m.nodes[e.to].p.ratio == null ? 0.1 : +m.nodes[e.to].p.ratio]);
    return { r: kindList("r"), w: kindList("w"), s: kindList("s"), ext: ext.concat(fan.map((e) => [e.to, clamp(e.w, 0, 1)])) };
  }

  // Round-trip time between two regions (teaching numbers). A box with no region is treated as global: no extra delay.
  const RTT = { "eu|us": 90, "ap|us": 180, "ap|eu": 130 };
  function rtt(sc, a, b) {
    if (!a || !b || a === b) return 0;
    const key = [a, b].sort().join("|"), custom = sc && sc.rtt && sc.rtt[key];
    return custom != null ? +custom : (RTT[key] != null ? RTT[key] : 100);
  }

  // Monthly teaching cost of one box. `live` / `nodesNow` are the instances or pool nodes running right now.
  function nodeCost(d, p, live, nodesNow) {
    const cls = d.cls;
    if (cls === "db") return (p.shards || 1) * ((d.cost || 0) + (p.replicas || 0) * (d.rep || 0) + (p.ha ? 150 : 0));
    if (cls === "store" || cls === "cache") return (p.inst || 1) * (d.cost || 0);
    if (cls === "queue") return (d.cost || 0) + (p.workers || 1) * (d.unit || 45);
    if (cls === "router" || cls === "proxy" || cls === "service") return (live || p.inst || 1) * (d.cost || 0) + (cls === "router" && p.ha ? d.cost || 0 : 0);
    if (cls === "pool") return (nodesNow || +p.nodes || 1) * (d.cost || 0);
    if (cls === "limiter" || cls === "cdn" || cls === "passive") return d.cost || 0;
    return 0;
  }

  // ---------------------------------------------------------------- simulation
  /* opts:{ scenario, trafficMult, chaos: { dbDown, cacheFlush, lbDown, azOut, slowDb }, k: overrides } */
  function createSim(graph, scenario) {
    const m = build(graph); if (m.error) return { error: m.error };
    const sc = Object.assign({}, DEFAULT_SCENARIO, scenario || {});
    const st = { t: 0, m, sc, curve: trafficCurve(sc), nodes: {}, chaosSince: {}, prevChaos: {}, prevSp: {}, prevSl: {}, unhealthy: {}, deadTicks: {}, history: [], okSum: 0, reqSum: 0, costAcc: 0 };
    for (const id of Object.keys(m.nodes)) st.nodes[id] = { brk: {}, backlog: 0, live: m.nodes[id].p.inst || 1, lag: 0, downUntil: -1, util: 0, load: 0, err: 0, ms: 0, out: {}, flow: 0, delaySec: 0, hit: 0, stale: 0 };
    return st;
  }

  function nodeCaps(m, n, chaos, ns, t) {
    const d = n.def, p = n.p, cls = d.cls;
    const az = chaos.azOut && !(p.ha || (n.def.cls === "db" && p.ha));
    const inst = ns.live * (az ? 0.5 : 1);
    return { az, inst: Math.max(cls === "db" ? 0 : 1, Math.floor(inst)) };
  }

  /* One tick. Pure with respect to the graph; mutates st. */
  function step(st, live) {
    live = live || {};
    const { m, sc } = st, t = st.t, mult = live.trafficMult == null ? 1 : live.trafficMult, chaos = live.chaos || {};
    let surge = 1; for (const k of Object.keys(chaos)) if (chaos[k] && k.indexOf("surge:") === 0) surge *= +k.slice(6) || 1;      // 'surge:5' multiplies traffic by 5
    const R = (st.curve[Math.min(t, TICKS - 1)] || 0) * mult * (chaos.burst ? 1.6 : 1) * surge;
    const bots = R * (sc.botFrac || 0), legit = R - bots;
    // chaos transitions
    for (const k of Object.keys(chaos)) { if (chaos[k] && !st.prevChaos[k]) st.chaosSince[k] = t; }
    st.prevChaos = Object.assign({}, chaos);
    const poolFit = {};
    for (const id of m.order) {
      const pn = m.nodes[id]; if (pn.def.cls !== "pool") continue;
      const ns = st.nodes[id], pp = Math.max(1, +pn.p.podsPerNode || +pn.def.podsPerNode || 8);
      if (ns.nodesNow == null) ns.nodesNow = Math.max(1, +pn.p.nodes || 3);
      let desired = 0; for (const sid of Object.keys(m.hostOf)) if (m.hostOf[sid] === id) desired += Math.max(1, st.nodes[sid].live || +m.nodes[sid].p.inst || 1);
      const need = Math.ceil(desired / pp);
      if (pn.p.auto) {                                   // cluster autoscaler: slower than pod autoscaling
        if (need > ns.nodesNow) { ns.nlag = (ns.nlag || 0) + 1; if (ns.nlag >= K.nodeLag) ns.nodesNow = Math.min(Math.max(1, +pn.p.max || 30), ns.nodesNow + Math.max(1, Math.ceil((need - ns.nodesNow) / 2))); }
        else { ns.nlag = 0; ns.nodesNow = Math.max(Math.max(1, +pn.p.nodes || 1), need, ns.nodesNow - 1); }
      } else ns.nodesNow = Math.max(1, +pn.p.nodes || 3);
      const dead = !!(pn.p.region && chaos["region:" + pn.p.region]) || !!chaos["node:" + id] || !!(live.down && live.down[id]);
      const eff = dead ? 0 : Math.floor(ns.nodesNow * (chaos.azOut ? (pn.p.multiAz ? 2 / 3 : 0.5) : 1)), capPods = eff * pp;
      poolFit[id] = desired > 0 ? Math.min(1, capPods / desired) : 1;
      ns.poolUtil = desired > 0 ? (capPods > 0 ? desired / capPods : 9) : 0; ns.poolLoad = desired; ns.pending = Math.max(0, desired - capPods); ns.poolDead = dead;
    }
    const inflow = {}; for (const id of m.order) inflow[id] = { r: 0, w: 0, s: 0, b: 0 };
    const per = {};                                                       // per-node results this tick
    const totalShare = m.sources.reduce((a, n) => a + (+n.p.share || 0), 0) || 1;
    for (const s of m.sources) { const sh = (+s.p.share || 0) / totalShare; inflow[s.id].r += legit * sc.readFrac * (1 - sc.staticFrac) * sh; inflow[s.id].w += legit * (1 - sc.readFrac) * (1 - sc.staticFrac) * sh; inflow[s.id].s += legit * sc.staticFrac * sh; inflow[s.id].b += bots * sh; }
    const recv = {}; const pass = {};                                     // pass[id] = {r,w,s,b} fraction that survives the node
    const edgeFlow = {};

    for (const id of m.order) {
      const n = m.nodes[id], ns = st.nodes[id], d = n.def, p = n.p, f = inflow[id], cls = d.cls;
      const total = f.r + f.w + f.s + f.b;
      const rt = routes(m, id, st.unhealthy);
      let pr = 1, pw = 1, ps = 1, pb = 1, ms = d.ms || 1, util = 0, hit = 0, outR = f.r + f.b, outW = f.w, outS = f.s, herd = 1, bShare = null;
      const nodeDown = !!(live.down && live.down[id]) || !!(p.region && chaos["region:" + p.region]) || !!chaos["node:" + id];
      const slow = !!chaos["slow:" + id], capF = slow ? 0.4 : 1, msF = slow ? 4 : 1;      // 'slow:<id>' makes that one box 4x slower with 40% of its capacity
      ns.killed = nodeDown;
      let alive = !nodeDown;                       // used by health checks (failover) and does not depend on load
      if (cls === "source") { util = 0; ms = 0; }
      else if (cls === "pool") { util = ns.poolUtil || 0; ms = 0; outR = outW = outS = 0; if (ns.poolDead) alive = false; }
      else if (cls === "passive") { outR = outW = outS = 0; }
      else if (cls === "cdn") {
        const cap = (d.cap || 1) * (p.inst || 1); util = total / cap; const pass_ = Math.min(1, cap / Math.max(total, 1e-9)); pr = pw = ps = pb = pass_;
        const absorbed = f.s * pass_ * K.cdnHit; outS = f.s * pass_ - absorbed; outR = (f.r + f.b) * pass_; outW = f.w * pass_; hit = K.cdnHit; ns.cdnAbs = absorbed;
        ms = d.ms;
      } else if (cls === "limiter") {
        const botPass = d.waf ? K.wafBotPass : K.limiterBotPass;
        let lim = d.waf ? d.cap : Math.max(1, +p.limit || d.cap);
        const b2 = f.b * botPass, tot2 = f.r + f.w + f.s + b2; const admit = d.waf ? 1 : Math.min(1, lim / Math.max(tot2, 1e-9));
        pr = pw = ps = admit; pb = botPass * admit; util = tot2 / lim; outR = (f.r + b2) * admit; outW = f.w * admit; outS = f.s * admit; bShare = (f.r + b2) > 0 ? b2 / (f.r + b2) : 0;
      } else if (["router", "proxy", "service"].includes(cls)) {
        let instBase = p.inst || 1;
        if (p.auto && cls !== "router") {
          const target = clamp(Math.ceil(total / ((d.cap || 1) * 0.6)), instBase, instBase * 3);
          if (target > ns.live) { ns.lag++; if (ns.lag >= K.autoLag) ns.live = Math.min(target, ns.live + Math.max(2, Math.ceil(ns.live * 0.25))); } else { ns.lag = 0; ns.live = Math.max(target, ns.live - 1); }
        } else ns.live = instBase;
        let inst = ns.live; const isHa = cls === "router" && p.ha;
        const host = m.hostOf[id];
        if (host) inst = Math.floor(inst * (poolFit[host] == null ? 1 : poolFit[host]));
        else if (chaos.azOut && !isHa) inst = Math.max(1, Math.floor(inst / 2));
        const lbKill = chaos.lbDown && cls === "router" && !isHa;
        if (nodeDown || lbKill) inst = 0;
        if (inst === 0) alive = false;
        const cap = inst * (d.cap || 1) * capF; ns.capNow = cap; util = cap > 0 ? total / cap : (total > 0 ? 9 : 0);
        let pass_ = total > 0 ? Math.min(1, cap / total) : 1, badErr = 0;
        if (chaos["bad:" + id] && cls !== "router") {
          const since = t - (st.chaosSince["bad:" + id] == null ? t : st.chaosSince["bad:" + id]), detect = m.monitored ? 2 : 10, strat = p.deploy || "rolling";   // monitoring and alerts notice it sooner
          badErr = since < detect ? (strat === "canary" ? 0.05 : strat === "bluegreen" ? 1 : Math.min(1, (since + 1) / 6)) : 0;
        }
        ns.badErr = badErr; pass_ *= (1 - badErr);
        pr = pw = ps = pb = pass_; ms = stretch(d.ms * msF, util);
        outR = (f.r + f.b) * pass_; outW = f.w * pass_; outS = f.s * pass_;
        // a service with no static target serves static itself (consumes it); with a target forwards
        if (!rt.s.length) outS = 0;
        if (!rt.r.length) outR = 0; if (!rt.w.length) outW = 0;
      } else if (cls === "cache") {
        let nodes = p.inst || 1; if (chaos.azOut) nodes = Math.max(1, Math.floor(nodes / 2)); if (nodeDown) nodes = 0;
        if (nodes === 0) alive = false;
        const cap = nodes * (d.cap || 1) * capF, reads = f.r + f.b; util = cap > 0 ? reads / cap : (reads > 0 ? 9 : 0);
        hit = clamp(+p.hit || d.hit, 0, 1);
        if (chaos.cacheFlush || nodeDown) {
          const since = st.chaosSince.cacheFlush == null ? t : st.chaosSince.cacheFlush;
          const prog = chaos.cacheFlush ? clamp((t - since) / K.coldTicks, 0, 1) : 0;
          hit *= prog; herd = 1 + (p.coalesce ? 0.3 : 2) * (1 - prog);
        } else if (st.flushEnd != null && t - st.flushEnd < K.coldTicks) { const prog = (t - st.flushEnd) / K.coldTicks; hit *= prog; herd = 1 + (p.coalesce ? 0.3 : 2) * (1 - prog); }
        if (st.prevFlush && !chaos.cacheFlush) st.flushEnd = t;
        st.prevFlush = !!chaos.cacheFlush;
        const served = Math.min(reads, cap), over = reads - served;
        pr = reads > 0 ? served / reads + (0) : 1; pb = pr; pw = 1; ps = 1;
        outR = (served * (1 - hit)) * herd + over; outW = f.w; outS = f.s; ms = d.ms * stretch(1, util);
        if (!rt.r.length) outR = 0; if (!rt.w.length) outW = 0;
        ns.hit = hit; ns.herd = herd;
      } else if (cls === "queue") {
        const drainRate = (p.workers || 1) * (d.cap || 1); const pending = ns.backlog + f.w * TICK_S;
        let dbCap = Infinity;
        const tgts = rt.w; if (tgts.length) { dbCap = 0; for (const [cid, w] of tgts) dbCap += (st.nodes[cid].wcap != null ? st.nodes[cid].wcap : st.nodes[cid].capNow != null ? st.nodes[cid].capNow : Infinity) * (w > 0 ? 1 : 0); }   // a queue cannot drain faster than its consumers can take work
        const rate = Math.min(drainRate, dbCap);
        const drained = Math.min(pending, rate * TICK_S); ns.backlog = pending - drained;
        pw = 1; if (ns.backlog > K.maxBacklog) { pw = clamp(1 - (ns.backlog - K.maxBacklog) / Math.max(f.w * TICK_S, 1), 0, 1); ns.backlog = K.maxBacklog; }
        if (nodeDown) { pw = 0; }
        outW = tgts.length ? drained / TICK_S : 0; outR = 0; outS = 0; pr = ps = pb = 1;
        util = ns.backlog / K.maxBacklog; ms = d.ms; ns.delaySec = rate > 0 ? ns.backlog / rate : (ns.backlog > 0 ? 1e9 : 0);
      } else if (cls === "db" || cls === "store") {
        const isDb = cls === "db";
        const S = isDb ? p.shards || 1 : 1, rep = isDb ? p.replicas || 0 : 0, sk = S > 1 ? (p.salting ? Math.min(sc.skew || 1, 1.1) : sc.skew || 1) : 1;
        let wcap = ((isDb ? S : (p.inst || 1)) * (d.wr || 1)) / sk, nodesN = isDb ? S * (1 + rep) : (p.inst || 1);
        let rcap = (nodesN * (d.rd || 1)) / sk;
        const since = st.chaosSince.dbDown, active = chaos.dbDown && isDb;
        if (active && (ns.downUntil < t)) { ns.downUntil = t + (p.ha ? K.recoverHa : K.recoverManual); }
        const down = (isDb && ns.downUntil > t) || nodeDown;
        if (down) alive = false;
        if (down) { wcap = 0; rcap = (isDb && rep > 0 && !nodeDown) ? (S * rep * (d.rd || 1)) / sk : 0; }
        if (chaos.azOut && !(p.ha)) { wcap *= 0.5; rcap *= 0.5; }
        wcap *= capF; rcap *= capF;
        // consistency: how many copies must answer, and what that costs in capacity, latency and availability
        const cons = isDb ? (p.consistency || "eventual") : "eventual", Nn = 1 + rep, peerNode = isDb && p.peer && p.peer !== id && m.nodes[p.peer] ? m.nodes[p.peer] : null;
        const partitioned = !!(chaos.partition && peerNode && rtt(sc, p.region, peerNode.p.region) > 0), group = Nn + (peerNode ? 1 : 0);
        const lostLocal = Math.min(Nn, (down ? (nodeDown ? Nn : 1) : 0) + (chaos.azOut && !p.ha ? Math.floor(Nn / 2) : 0));
        const aliveN = Math.max(0, group - lostLocal - (peerNode && (partitioned || st.nodes[p.peer].down) ? 1 : 0));
        let qR = 1, qW = 1, coordR = 0, coordW = 0, rOk = true, wOk = true;
        if (cons === "quorum") { qR = clamp(Math.round(+p.qr || (Math.floor(group / 2) + 1)), 1, group); qW = clamp(Math.round(+p.qw || (Math.floor(group / 2) + 1)), 1, group); }
        else if (cons === "strong") { qR = qW = Math.floor(group / 2) + 1; }
        if (cons === "quorum" || cons === "strong") {
          rOk = aliveN >= qR; wOk = aliveN >= qW;
          const remote = peerNode ? rtt(sc, p.region, peerNode.p.region) : 0;
          coordR = (qR - 1) * 2 + (qR > Nn ? remote : 0) + (cons === "strong" ? 5 : 0); coordW = (qW - 1) * 2 + (qW > Nn ? remote : 0) + (cons === "strong" ? 5 : 0);
        }
        const primaryReads = ((S * (d.rd || 1)) / sk) * capF * (chaos.azOut && !p.ha ? 0.5 : 1);
        if (isDb && cons === "strong") rcap = Math.min(rcap, primaryReads);                                   // reads go through the leader
        if (isDb && cons === "ryw") { const share = clamp(+p.rywShare >= 0 ? +p.rywShare : 0.2, 0.01, 1); rcap = Math.min(rcap, primaryReads / share); }   // readers who just wrote must read the primary
        const reads = f.r + f.b, writes = f.w;
        pr = reads > 0 ? Math.min(1, rcap / reads) : 1; pb = pr; pw = writes > 0 ? Math.min(1, wcap / writes) : 1; ps = 1;
        if (!rOk) { pr = 0; pb = 0; } if (!wOk) pw = 0;
        const uR = rcap > 0 ? reads / rcap : (reads > 0 ? 9 : 0), uW = wcap > 0 ? writes / wcap : (writes > 0 ? 9 : 0);
        util = Math.max(uR, uW); ms = { r: stretch((d.msR || d.ms || 1) * (chaos.slowDb && isDb ? 4 : 1) * msF, uR) + coordR, w: stretch((d.msW || d.ms || 1) * (chaos.slowDb && isDb ? 4 : 1) * msF, uW) + coordW };
        ns.wcap = wcap; ns.rcap = rcap; ns.uR = uR; ns.uW = uW; ns.down = down;
        ns.stale = rep > 0 && uW > 0.7 ? (rep / (1 + rep)) * clamp((uW - 0.7) / 0.3, 0, 1) : 0;
        // replication between regions: a replica trails its primary by the round trip plus a queueing penalty; two active primaries can conflict
        ns.lastW = writes; ns.lagSec = 0; ns.conflict = 0;
        const peer = isDb && p.peer && p.peer !== id && m.nodes[p.peer] && (p.mode === "replica" || p.mode === "active") ? m.nodes[p.peer] : null;
        if (peer) {
          const pns = st.nodes[p.peer], uWp = clamp(pns.uW || 0, 0, 3);
          ns.lagSec = (rtt(sc, p.region, peer.p.region) / 1000) * (1 + 4 * uWp * uWp);
          if (partitioned) { ns.partSec = (ns.partSec || 0) + TICK_S; ns.lagSec += ns.partSec; } else ns.partSec = 0;      // copies cannot sync while the network is split
          if (p.mode === "replica") ns.stale = Math.max(ns.stale, clamp(ns.lagSec / 2, 0, 1));
          if (p.mode === "active") ns.conflict = (writes + (pns.lastW || 0)) * ns.lagSec * 0.02 * (sc.skew || 1);
          if (p.mode === "replica" && pns.down && writes > 0 && !ns.promoted) { ns.promoted = true; ns.rpoLost = Math.round(ns.lagSec * (pns.lastW || 0)); }   // writes the replica never received
          if (!pns.down) ns.promoted = false;
        }
        if (cons === "strong") ns.stale = 0;
        else if (cons === "quorum") ns.stale = qR + qW > group ? 0 : ns.stale * (1 - (qR - 1) / Math.max(1, group - 1));
        else if (cons === "ryw") ns.stale = partitioned ? ns.stale * 0.5 : 0;                                    // a reader always sees their own writes
        ns.consistency = cons; ns.aliveN = aliveN; ns.groupN = group;
        outR = outW = outS = 0;
      } else if (cls === "external") {
        const cap = (nodeDown ? 0 : (d.cap || 1) * (p.inst || 1) * capF); const load = total; util = cap > 0 ? load / cap : (load > 0 ? 9 : 0); const pass_ = load > 0 ? Math.min(1, cap / load) : 1; pr = pw = ps = pb = pass_; ms = stretch(d.ms * msF, util); outR = outW = outS = 0;
      }
      per[id] = { pr, pw, ps, pb, ms, util, hit, total, alive };
      Object.assign(st.nodes[id], { util, load: total, ms: typeof ms === "object" ? ms.r : ms });
      // hand flow to children (bot requests travel as their own stream so a WAF or limiter anywhere downstream can shed them)
      const R = Math.max(0, Math.min(5, Math.round(+p.retries || 0)));
      const ampOf = (cid) => {
        if (!R && !p.breaker) return 1;
        const T0 = +p.timeout > 0 ? +p.timeout : 1000, tf = clamp(((st.prevSl[cid] || 0) - T0) / (0.5 * T0), 0, 1);
        const fl = clamp(1 - (1 - clamp(1 - (st.prevSp[cid] == null ? 1 : st.prevSp[cid]), 0, 1)) * (1 - tf), 0, 1);      // failed or too slow
        if (p.breaker) { const b = ns.brk[cid] || (ns.brk[cid] = { open: false, since: 0 }); if (!b.open && fl > 0.5) { b.open = true; b.since = t; } else if (b.open && fl < 0.2 && t - b.since >= 3) b.open = false; if (b.open) return K.breakerProbe; }
        return R ? (fl >= 0.999 ? R + 1 : (1 - Math.pow(fl, R + 1)) / (1 - fl)) : 1;
      };
      const give = (kind, amount, list) => { for (const [cid, w] of list) {
        if (chaos.partition && rtt(sc, p.region, m.nodes[cid].p.region) > 0) continue; /* a split network drops traffic that crosses regions */
        const a = amount * w * ampOf(cid); inflow[cid][kind] += a; edgeFlow[id + "|" + cid] = (edgeFlow[id + "|" + cid] || 0) + a; } };
      if (bShare == null) bShare = (f.r + f.b) > 0 ? f.b / (f.r + f.b) : 0;
      if (cls === "queue") give("w", outW, rt.w);
      else { give("r", outR * (1 - bShare), rt.r); give("b", outR * bShare, rt.r); give("w", outW, rt.w); give("s", outS, rt.s); }
      // external calls: each external target sees `ratio` of everything this node handled
      for (const [cid, ratio] of rt.ext) { const amt = (f.r + f.w + f.s) * (per[id].pr) * ratio; inflow[cid].r += amt; edgeFlow[id + "|" + cid] = (edgeFlow[id + "|" + cid] || 0) + amt; }
    }

    // ---- how well each node's whole subtree served its requests this tick (callers read this next tick to decide on retries and breakers)
    const sp = {}, sl = {};
    for (let i = m.order.length - 1; i >= 0; i--) {
      const id = m.order[i], r = per[id], f = inflow[id], c = m.nodes[id].def.cls, tot = f.r + f.w + f.s + f.b;
      if (tot <= 0) { sp[id] = 1; sl[id] = 0; continue; }
      const own = (f.r * r.pr + f.b * r.pb + f.w * r.pw + f.s * r.ps) / tot, rt = routes(m, id, st.unhealthy);
      const kids = (list) => (list.length ? list.reduce((a, [cid, w]) => a + w * (sp[cid] == null ? 1 : sp[cid]), 0) : 1);
      let kr = kids(rt.r); if (c === "cache") kr = r.hit + (1 - r.hit) * kr;
      let ks = kids(rt.s); if (c === "cdn") ks = K.cdnHit + (1 - K.cdnHit) * ks;
      const kw = c === "queue" ? 1 : kids(rt.w);
      sp[id] = c === "db" || c === "store" || c === "external" || c === "passive" ? own : own * (((f.r + f.b) * kr + f.w * kw + f.s * ks) / tot);
      const mr = typeof r.ms === "object" ? r.ms.r : r.ms, mw = typeof r.ms === "object" ? r.ms.w : r.ms, terminal = c === "db" || c === "store" || c === "external" || c === "passive";
      const lk = (list) => (list.length ? list.reduce((a, [cid, w]) => a + w * (sl[cid] || 0), 0) : 0);
      sl[id] = c === "source" ? 0 : ((f.r + f.b) * (mr + (terminal ? 0 : (c === "cache" ? (1 - r.hit) : 1) * lk(rt.r))) + f.w * (mw + (terminal || c === "queue" ? 0 : lk(rt.w))) + f.s * (mr + (terminal ? 0 : lk(rt.s)))) / tot;
    }
    st.prevSp = sp; st.prevSl = sl;
    // ---- health checks: a node is unhealthy when it, or what it depends on, has been dead for a few ticks (independent of load)
    const pa = {}, localDead = {};
    for (let i = m.order.length - 1; i >= 0; i--) {
      const id = m.order[i], c = m.nodes[id].def.cls, rt0 = routes(m, id, localDead);
      const avg = (list) => (list.length ? list.reduce((a, [cid, w]) => a + w * (pa[cid] == null ? 1 : pa[cid]), 0) / list.reduce((a, [, w]) => a + w, 0) : 1);
      const terminal = c === "db" || c === "store" || c === "external" || c === "passive" || c === "queue" && !rt0.w.length;
      pa[id] = (per[id].alive === false ? 0 : 1) * (terminal ? 1 : (avg(rt0.r) + avg(rt0.w)) / 2);
      localDead[id] = pa[id] <= 0.5;
    }
    for (const id of m.order) { st.deadTicks[id] = pa[id] <= 0.5 ? (st.deadTicks[id] || 0) + 1 : 0; st.unhealthy[id] = st.deadTicks[id] >= K.detectTicks; }

    // ---- success and latency for legitimate requests, by walking the paths
    const leaves = { ok: 0, tot: 0, paths: [], degraded: 0 };
    const hop = (fromId, cid, kind, wt, lat, succ, depth, sink) => {
      const p = m.nodes[fromId].p, R = clamp(Math.round(+p.retries || 0), 0, 5), T = +p.timeout > 0 ? +p.timeout : 1000, b = p.breaker ? st.nodes[fromId].brk[cid] : null, open = !!(b && b.open);
      const hopRtt = rtt(sc, m.nodes[fromId].p.region, m.nodes[cid].p.region);
      if (chaos.partition && hopRtt > 0) { sink.tot += wt; sink.paths.push({ w: wt, s: 0, ms: lat + hopRtt + 1000 }); return; }
      if (!R && !open) return walk(cid, kind, wt, lat + hopRtt, succ, depth, sink);
      const probe = open ? K.breakerProbe : 1;
      if (open) {                       // fail fast (or serve the fallback) for the requests the breaker holds back
        const w0 = wt * (1 - probe), s0 = p.fallback ? 1 : 0;
        sink.tot += w0; sink.ok += w0 * succ * s0; sink.paths.push({ w: w0, s: succ * s0, ms: lat + 2 }); if (p.fallback) sink.degraded += w0 * succ;
      }
      const sub = { ok: 0, tot: 0, paths: [], degraded: 0 }; walk(cid, kind, wt * probe, 0, 1, depth, sub);
      for (const x of sub.paths) {
        const late = clamp((x.ms - T) / (0.5 * T), 0, 1), xs = x.s * (1 - late);
        const fails = 1 - xs, s2 = R ? 1 - Math.pow(fails, R + 1) : x.s;
        const waited = R ? (xs > 1e-6 ? fails * (1 - Math.pow(fails, R + 1)) / xs : R + 1) * T : 0;     // expected time lost to failed attempts
        sink.tot += x.w; sink.ok += x.w * succ * s2; sink.paths.push({ w: x.w, s: succ * s2, ms: lat + hopRtt + Math.min(x.ms, T) + waited });
      }
      sink.degraded += sub.degraded;
    };
    const walk = (id, kind, wt, lat, succ, depth, sink) => {
      const n = m.nodes[id], r = per[id], d = n.def, cls = d.cls; if (depth > 40 || wt < 1e-9) return;
      const passK = kind === "r" ? r.pr : kind === "w" ? r.pw : r.ps;
      const msK = typeof r.ms === "object" ? (kind === "w" ? r.ms.w : r.ms.r) : r.ms;
      const l2 = lat + (cls === "source" ? 0 : msK), s2 = succ * (cls === "source" ? 1 : passK);
      const rt = routes(m, id, st.unhealthy), list = kind === "r" ? rt.r : kind === "w" ? rt.w : rt.s;
      // parallel and external calls made by this node: the request waits for them (conservatively, one after another)
      let lat2 = l2, succ2 = s2;
      if (cls !== "source") for (const [cid, ratio] of rt.ext) { const q = per[cid]; if (!q) continue; const rr = clamp(ratio, 0, 1); lat2 += rr * (typeof q.ms === "object" ? q.ms.r : q.ms); succ2 *= clamp(1 - rr * (1 - q.pr), 0, 1); }
      const finish = (w, l, s) => { sink.ok += w * s; sink.tot += w; sink.paths.push({ w, s, ms: l }); };
      if (cls === "cache" && kind === "r") {
        const h = r.hit; finish(wt * h, lat2, succ2);
        if (list.length) for (const [cid, w] of list) hop(id, cid, kind, wt * (1 - h) * w, lat2, succ2, depth + 1, sink); else finish(wt * (1 - h), lat2, succ2);
        return;
      }
      if (cls === "cdn" && kind === "s") { finish(wt * K.cdnHit, lat2, succ2); if (list.length) for (const [cid, w] of list) hop(id, cid, kind, wt * (1 - K.cdnHit) * w, lat2, succ2, depth + 1, sink); else finish(wt * (1 - K.cdnHit), lat2, succ2); return; }
      if (cls === "queue" && kind === "w") { finish(wt, lat + (d.cap ? 4 : 4), succ * r.pw); return; }   // acknowledged once queued
      if (cls === "db" || cls === "store" || cls === "external" || cls === "passive" || !list.length) { finish(wt, lat2, succ2); return; }
      for (const [cid, w] of list) hop(id, cid, kind, wt * w, lat2, succ2, depth + 1, sink);
    };
    const shares = { r: sc.readFrac * (1 - sc.staticFrac), w: (1 - sc.readFrac) * (1 - sc.staticFrac), s: sc.staticFrac };
    for (const s of m.sources) { const sh = (+s.p.share || 0) / totalShare; for (const k of ["r", "w", "s"]) if (shares[k] > 0 && sh > 0) walk(s.id, k, shares[k] * sh, 0, 1, 0, leaves); }
    let ok = leaves.tot > 0 ? leaves.ok / leaves.tot : 1;
    // limiter shedding of legitimate traffic (over the limit) is already in the pass fractions
    const sorted = leaves.paths.map((x) => ({ w: x.w * x.s, ms: x.ms })).filter((x) => x.w > 1e-9).sort((a, b) => a.ms - b.ms); const tw = sorted.reduce((a, x) => a + x.w, 0);
    let acc = 0, p95 = sorted.length ? sorted[sorted.length - 1].ms : leaves.paths.reduce((a, x) => Math.max(a, x.ms), 0); for (const x of sorted) { acc += x.w / (tw || 1); if (acc >= 0.95) { p95 = x.ms; break; } }
    // stats
    let cost = 0, maxDelay = 0, stale = 0;
    for (const id of m.order) {
      const n = m.nodes[id], ns = st.nodes[id];
      ns.cost = nodeCost(n.def, n.p, ns.live, ns.nodesNow); cost += ns.cost;
      maxDelay = Math.max(maxDelay, ns.delaySec || 0); stale = Math.max(stale, ns.stale || 0);
    }
    const rec = { t, rps: R, p95: Math.min(p95, 20000), ok: clamp(ok, 0, 1), err: clamp(1 - ok, 0, 1), degraded: leaves.tot > 0 ? clamp(leaves.degraded / leaves.tot, 0, 1) : 0, cost, delayMin: maxDelay / 60, stale, edgeFlow, nodes: {} };
    for (const id of m.order) { const ns = st.nodes[id]; rec.nodes[id] = { util: ns.util, load: ns.load, ms: ns.ms, hit: ns.hit || 0, backlog: ns.backlog, live: ns.live, down: !!ns.down || !!ns.killed || !!(live.down && live.down[id]), brkOpen: Object.values(ns.brk || {}).some((b) => b.open), cons: ns.consistency || "", nodes: ns.nodesNow || 0, pending: ns.pending || 0, badErr: ns.badErr || 0, aliveN: ns.aliveN || 0, groupN: ns.groupN || 0, lag: ns.lagSec || 0, conflict: ns.conflict || 0, rpo: ns.rpoLost || 0, unhealthy: !!st.unhealthy[id], cost: ns.cost || 0 }; }
    st.history.push(rec); if (st.history.length > 360) st.history.shift();      // keep about three simulated hours; totals below are cumulative
    st.okSum += ok * legit; st.reqSum += legit; st.costLast = cost; st.t += 1;
    return rec;
  }

  function summarize(st) {
    const h = st.history, w = h.map((x) => x.rps), tw = w.reduce((a, b) => a + b, 0) || 1;
    const sorted = h.map((x, i) => ({ p: x.p95, w: w[i] })).sort((a, b) => a.p - b.p); let acc = 0, p95 = sorted.length ? sorted[sorted.length - 1].p : 0;
    for (const x of sorted) { acc += x.w / tw; if (acc >= 0.95) { p95 = x.p; break; } }
    const peak = h.reduce((mx, x) => (x.rps > mx.rps ? x : mx), h[0] || { rps: 0, nodes: {} });
    const busiest = Object.entries(peak.nodes || {}).filter(([id]) => st.m.nodes[id].def.cls !== "source").sort((a, b) => b[1].util - a[1].util)[0];
    const last = h[h.length - 1] || { nodes: {} };
    return { p95, availability: st.reqSum > 0 ? st.okSum / st.reqSum : 1, cost: st.costLast || 0, costByNode: Object.fromEntries(Object.entries(last.nodes).map(([id, x]) => [id, x.cost || 0])), peakLoad: Object.fromEntries(Object.entries(peak.nodes || {}).map(([id, x]) => [id, x.load || 0])), peakRps: peak.rps, maxDelayMin: Math.max(0, ...h.map((x) => x.delayMin)), staleMax: Math.max(0, ...h.map((x) => x.stale)),
      busiest: busiest ? { id: busiest[0], name: st.m.nodes[busiest[0]].p.name, util: busiest[1].util } : null };
  }

  /* Run a whole hour with scheduled chaos: events = [{tick, until, type}] */
  function run(graph, scenario, events) {
    const st = createSim(graph, scenario); if (st.error) return { error: st.error };
    for (let t = 0; t < TICKS; t++) {
      const chaos = {}; (events || []).forEach((e) => { if (t >= e.tick && t < (e.until != null ? e.until : e.tick + 1)) chaos[e.type] = true; });
      step(st, { chaos });
    }
    return { st, summary: summarize(st) };
  }

  const api = { TICKS, TICK_S, K, CATALOG, BY_ID, CATS, extend, equivalents, CLASSES, defaultProps, DEFAULT_SCENARIO, trafficCurve, build, routes, createSim, step, summarize, run, nodeCost };
  if (typeof module === "object" && module.exports) { try { api.extend(require("./catalog_more.js")); } catch (e) { /* optional */ } try { api.extend(require("./catalog_more2.js")); } catch (e) { /* optional */ } }
  return api;
});
