/* Budget & Cost Plan for a canvas. Every number comes from the simulator's teaching price list (sim.js),
 * sized against the simulator's own load figures. They are estimates for learning trade-offs, NOT
 * provider quotes: nothing here has been checked against live AWS / Azure / Google Cloud pricing. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sim.js"), require("./catalog_alts.js"), require("./lint.js"));
  else root.LabCost = factory(root.LabSim, root.LabAlts, root.LabLint);
})(typeof self !== "undefined" ? self : this, function (S, A, L) {
  "use strict";
  const HEADROOM = 0.7;                       // size so each instance runs at 70% at the scenario's load
  const SECONDS_PER_MONTH = 2592000;
  const GLOBAL_EDGE = new Set(["dns", "cdn", "cloudflare", "fastly", "glb", "cloudfront", "cloudcdn", "frontdoor", "route53", "clouddns", "azuredns"]);
  const USAGE = new Set(["serverless", "lambda", "cloudrun", "fargate", "dynamo", "cdn", "cloudflare", "fastly", "cloudfront", "cloudcdn", "frontdoor", "bedrock", "azopenai", "openai", "thirdparty", "payment", "email", "sqs", "pubsub"]);
  const INCIDENTS = [{ tick: 50, until: 51, type: "dbDown" }, { tick: 60, until: 61, type: "cacheFlush" }, { tick: 80, until: 90, type: "azOut" }];
  // Cheaper same-role swaps used by the Lean option. Same simulator class, so the graph stays valid.
  const LEAN_SWAP = { kafka: "queue", msk: "sqs", stream: "queue", pinecone: "postgres", vector: "postgres", aurora: "postgres", cassandra: "postgres", dragonfly: "cache", fastly: "cdn", cloudflare: "cdn" };
  const SPEC_ALTS = [
    { test: (d) => d.cls === "pool", alt: "Serverless containers (Cloud Run / Fargate / Container Apps)", trade: "Less control over nodes, networking and daemons", when: "Many always-on services or sustained load above about 1,000 req/s" },
    { test: (d, p) => d.cls === "db" && p.ha, alt: "Single-zone database with tested backups", trade: "A zone outage takes the database down until restore", when: "Paid, business-critical workloads or an availability goal of 99.9% or more" },
    { test: (d) => ["kafka", "msk", "stream"].includes(d.id), alt: "Managed queue or pub/sub (SQS, Pub/Sub, Service Bus)", trade: "No long retention, replay or strict partition ordering", when: "Sustained high-volume ordered streams, replay or many independent consumers" },
    { test: (d) => ["vector", "pinecone"].includes(d.id), alt: "PostgreSQL + pgvector", trade: "Slower similarity search at very large scale", when: "Millions of vectors or retrieval latency pgvector cannot meet" },
    { test: (d) => ["llm", "bedrock", "azopenai"].includes(d.id), alt: "Small model + routing + semantic cache", trade: "Lower quality on some complex requests", when: "Escalate only the requests the small model fails" },
    { test: (d) => d.id === "mesh", alt: "Plain load balancer + library retries/mTLS", trade: "Less uniform traffic policy and telemetry", when: "Many services and teams need consistent mTLS and traffic rules" },
  ];

  const isAI = (d) => d.cat === "AI & ML";
  function driver(d) {
    if (isAI(d)) return "AI tokens / GPU";
    return { service: "Compute", pool: "Compute (cluster)", db: "Database", store: "Storage", cache: "Cache memory", queue: "Messaging", router: "Network", proxy: "Network", limiter: "Edge security", cdn: "Bandwidth / egress", passive: "Observability", external: "Third-party API" }[d.cls] || "Other";
  }
  const billing = (d, p) => (USAGE.has(d.id) || d.cls === "external" ? "Usage-based" : p.auto ? "Mixed (autoscaled)" : "Fixed (provisioned)");
  const level = (n) => Number((n.props || {}).__aiLevel || 1);

  function transform(graph, mode) {
    return {
      nodes: graph.nodes.map((n) => {
        const props = Object.assign({}, n.props || {}); let type = n.type; const def = S.BY_ID[type] || {};
        if (mode === "lean") { props.ha = false; props.replicas = 0; if (LEAN_SWAP[type] && S.BY_ID[LEAN_SWAP[type]]) type = LEAN_SWAP[type]; }
        if (mode === "ha") { if (["router", "db", "proxy"].includes(def.cls)) props.ha = true; if (def.cls === "db" && !(props.replicas > 0) && def.rep) props.replicas = 1; }
        return { id: n.id, type, props };
      }),
      edges: graph.edges,
    };
  }

  /* Size every box for `rps` and price it. Returns per-node rows and the run's p95 / availability. */
  function sizeAndPrice(graph, scenario, rps, mode, withIncidents) {
    const g = transform(graph, mode), m = S.build(g);
    if (m.error) return { error: m.error };
    const sc = Object.assign({}, scenario, { base: Math.max(1, rps), shape: "steady" });
    const run = S.run(g, sc, []), inc = withIncidents ? S.run(g, sc, INCIDENTS) : null;
    const load = run.summary.peakLoad || {}, rows = {};
    let total = 0;
    for (const id of m.order) {
      const { def: d, p } = m.nodes[id];
      let inst = +p.inst || 1, need = null;
      if (["router", "proxy", "service"].includes(d.cls) && d.cap > 0) {
        need = Math.ceil((load[id] || 0) / (d.cap * HEADROOM));
        inst = Math.min(200, Math.max(mode === "ha" || p.ha ? 2 : 1, need));
      }
      const cost = S.nodeCost(d, p, inst, +p.nodes || 1); total += cost;
      rows[id] = { cost, inst, need, load: load[id] || 0, type: g.nodes.find((n) => n.id === id).type };
    }
    return { total, rows, p95: run.summary.p95, availability: inc ? inc.summary.availability : run.summary.availability };
  }

  function hiddenCosts(graph, defs, dr) {
    const has = (pred) => graph.nodes.some((n) => pred(defs[n.id], n.props || {}));
    const list = [];
    const add = (on, item, why) => list.push({ on: !!on, item, why });
    add(has((d) => d.cls === "source" || d.cls === "cdn"), "Internet egress and CDN bandwidth", "Billed per GB delivered to users; grows with page weight and media.");
    add(has((d) => ["service", "pool"].includes(d.cls) && d.prov === "aws"), "NAT gateway", "Private services reaching the internet pay per hour and per GB processed.");
    add(has((d) => ["logs", "tracing", "metrics"].includes(d.id) || d.cls === "passive"), "Log, metric and trace ingestion", "Billed per GB ingested and retained; sample traces and set retention.");
    add(has((d) => d.cls === "db" || d.cls === "store"), "Backups and snapshots", "Snapshot storage and point-in-time recovery are billed separately from the database.");
    add(dr || has((d, p) => p.region), "Cross-region data transfer", "Replication and failover traffic between regions is billed per GB.");
    add(has(isAI), "AI tokens and GPU time", "Usage-based and spiky; one long prompt chain can cost more than the servers.");
    add(has((d) => d.cls === "external"), "Third-party APIs", "Per-call or per-message pricing (payments, email, SMS) is outside this plan.");
    add(true, "Support plan", "Production support from a cloud provider is usually a minimum fee or a share of the bill.");
    add(true, "Idle resources", "Dev and staging environments left running overnight and on weekends.");
    add(has((d) => d.cls === "pool" || d.id === "mesh" || ["kafka", "msk"].includes(d.id)), "Engineering and operations time", "Clusters, meshes and Kafka need people to upgrade, patch and tune them.");
    return list;
  }

  /* opts: { trafficMult, provider, priority, uptime, users, envs: {dev, staging} } */
  function plan(doc, opts) {
    opts = Object.assign({ trafficMult: 1, provider: "aws", priority: "balanced", uptime: 99.9, users: 0, envs: { dev: true, staging: true } }, opts || {});
    const graph = { nodes: doc.nodes.map((n) => ({ id: n.id, type: n.type, props: Object.assign({}, n.props) })), edges: doc.edges };
    const scenario = Object.assign({}, S.DEFAULT_SCENARIO, doc.scenario || {}), budget = +((doc.slo || {}).budget) || 0;
    const base = Math.max(1, (+scenario.base || 1000) * (+opts.trafficMult || 1)), spike = +scenario.spikeX || 3;
    const defs = {}; for (const n of graph.nodes) { const d = S.BY_ID[n.type]; if (!d) return { error: `Unknown component ${n.type}` }; defs[n.id] = d; }
    if (!graph.nodes.length) return { error: "The canvas is empty. Add components to see a cost plan." };
    const mvpRps = Math.max(5, base * 0.1);
    const mvp = sizeAndPrice(graph, scenario, mvpRps, "asis", false);
    if (mvp.error) return { error: mvp.error };
    const growth = sizeAndPrice(graph, scenario, base, "asis", true);
    const prod = sizeAndPrice(graph, scenario, base, "ha", true);
    const peak = sizeAndPrice(graph, scenario, base * spike, "ha", false);
    const globalCost = (r) => graph.nodes.filter((n) => GLOBAL_EDGE.has(r.rows[n.id].type)).reduce((a, n) => a + r.rows[n.id].cost, 0);
    const standby = 0.5 * (prod.total - globalCost(prod));
    const drTotal = prod.total + standby;
    const leanGrowth = sizeAndPrice(graph, scenario, base, "lean", true), leanPeak = sizeAndPrice(graph, scenario, base * spike, "lean", false);
    const asisPeak = sizeAndPrice(graph, scenario, base * spike, "asis", false);
    const standbyPeak = 0.5 * (peak.total - globalCost(peak));

    const scenarios = [
      { key: "proto", name: "Prototype / local development", rps: 0, total: 0, note: "Runs on a laptop with Docker; managed-only services use free tiers or local emulators." },
      { key: "mvp", name: "MVP / low traffic", rps: mvpRps, total: mvp.total, note: "10% of the canvas traffic, sized at 70% utilisation." },
      { key: "growth", name: "Growth / medium traffic", rps: base, total: growth.total, note: "The canvas traffic, as drawn (HA only where you turned it on)." },
      { key: "prod", name: "Production / high availability", rps: base, total: prod.total, note: "Same traffic, every load balancer and database highly available, at least one replica." },
      { key: "peak", name: "Peak traffic event", rps: base * spike, total: peak.total, note: `${spike}× the canvas traffic on the production design, scaled out for the peak.` },
      { key: "dr", name: "Disaster recovery / multi-region", rps: base, total: drTotal, note: "Production plus a warm standby region at half capacity (global edge counted once)." },
    ];
    const envs = { prod: prod.total, staging: opts.envs.staging ? mvp.total * 0.5 : 0, dev: opts.envs.dev ? mvp.total * 0.25 : 0 };

    const components = graph.nodes.map((n) => {
      const d = defs[n.id], p = n.props || {}, parent = p.__aiParent && graph.nodes.find((x) => x.id === p.__aiParent);
      const prodCost = prod.rows[n.id].cost;
      return {
        id: n.id, name: p.name || d.name, type: d.name, level: level(n), parent: parent ? (parent.props.name || defs[parent.id].name) : "",
        driver: driver(d), billing: billing(d, p), basis: p.cost != null && p.cost !== "" ? "User-entered price" : "Estimated · teaching price",
        mvp: mvp.rows[n.id].cost, growth: growth.rows[n.id].cost, peak: peak.rows[n.id].cost,
        dr: GLOBAL_EDGE.has(n.type) ? prodCost : prodCost * 1.5,
        inst: growth.rows[n.id].inst, need: growth.rows[n.id].need,
      };
    }).sort((a, b) => b.growth - a.growth);

    const alternatives = [];
    graph.nodes.forEach((n) => {
      const d = defs[n.id], p = n.props || {}, cur = growth.rows[n.id].cost;
      const spec = SPEC_ALTS.find((s) => s.test(d, p));
      if (spec) { alternatives.push({ name: p.name || d.name, current: d.name, cost: cur, alt: spec.alt, altCost: null, trade: spec.trade, when: spec.when }); return; }
      if (cur < 150) return;
      const info = A && A.info(n.type); if (!info) return;
      const cheaper = info.alts.map((a) => ({ a, def: S.BY_ID[a.id] })).filter((x) => x.def && x.def.cls === d.cls && x.def.cost > 0 && x.def.cost < d.cost).sort((x, y) => x.def.cost - y.def.cost)[0];
      if (!cheaper) return;
      alternatives.push({ name: p.name || d.name, current: d.name, cost: cur, alt: cheaper.def.name, altCost: cur * (cheaper.def.cost / d.cost), trade: "Pick it when " + cheaper.a.pick + "; avoid it when " + cheaper.a.avoid + ".", when: "Keep " + d.name + " when " + info.pick + "." });
    });
    alternatives.sort((a, b) => b.cost - a.cost);

    const swaps = [...new Set(graph.nodes.filter((n) => LEAN_SWAP[n.type] && S.BY_ID[LEAN_SWAP[n.type]]).map((n) => `${defs[n.id].name} → ${S.BY_ID[LEAN_SWAP[n.type]].name}`))];
    const leanChanges = "No HA or replicas" + (swaps.length ? "; " + swaps.join(", ") : "") + ".";
    const serviceCount = (rows) => Object.values(rows).filter((r) => { const d = S.BY_ID[r.type]; return d && !["source", "passive"].includes(d.cls); }).length;
    const heavy = graph.nodes.filter((n) => defs[n.id].cls === "pool" || ["mesh", "kafka", "msk", "stream"].includes(n.type)).length;
    const options = [
      { key: "A", name: "Lean MVP", tag: "lowest sensible cost", low: leanGrowth.total, high: leanPeak.total, services: serviceCount(leanGrowth.rows), availability: leanGrowth.availability, p95: leanGrowth.p95,
        changes: leanChanges, complexity: "Low", recovery: "Restore from backup; minutes to hours of downtime on a zone or database failure.",
        security: "Fine for pilots and internal tools; not for regulated or paid critical data.", upgrade: "Turn on database failover and a second app instance first, when paying customers depend on it.", risks: "A single failure stops the service; no headroom for spikes." },
      { key: "B", name: "Balanced production", tag: "recommended default", low: growth.total, high: asisPeak.total, services: serviceCount(growth.rows), availability: growth.availability, p95: growth.p95,
        changes: "The canvas as you drew it, sized to its traffic.", complexity: heavy ? "Medium–High" : "Medium", recovery: "Recovers from instance failures; zone or database failure depends on the HA you turned on.",
        security: "Suitable for most SaaS products with standard controls (auth, WAF, encryption, audit logs).", upgrade: "Add HA to every stateful tier when the availability goal reaches 99.9%.", risks: "Check the lint list for single points of failure." },
      { key: "C", name: "Enterprise scale", tag: "high availability and resilience", low: drTotal, high: peak.total + standbyPeak, services: serviceCount(prod.rows), availability: prod.availability, p95: prod.p95,
        changes: "Every load balancer and database highly available with replicas, plus a warm standby region.", complexity: "High", recovery: "Survives a zone loss; regional failover in minutes with a small, known data-loss window.",
        security: "Fits regulated workloads once audit, key management and access reviews are in place.", upgrade: "Active-active regions only when a regional outage is unacceptable and data can be partitioned.", risks: "Roughly double the spend and much more operations work; easy to over-build too early." },
    ];
    const recommended = opts.priority === "lowest" ? "A" : opts.priority === "ha" || opts.uptime >= 99.95 ? "C" : "B";

    const aiNodes = graph.nodes.some((n) => isAI(defs[n.id]));
    const perMillion = growth.total / (base * SECONDS_PER_MONTH / 1e6);
    return {
      base, mvpRps, spike, budget, provider: opts.provider, scenarios, envs, envTotal: envs.prod + envs.staging + envs.dev, components, alternatives, options, recommended,
      lint: L ? L.lint({ nodes: graph.nodes, edges: graph.edges, slo: doc.slo, requirements: doc.requirements }, { rps: base, monthlyCost: prod.total }).findings : [], hidden: hiddenCosts(graph, defs, true),
      perMillion, perUser: opts.users > 0 ? growth.total / opts.users : null, aiNodes, levels: [...new Set(components.map((c) => c.level))].sort(),
      totals: { mvp: mvp.total, growth: growth.total, prod: prod.total, peak: peak.total, dr: drTotal },
    };
  }

  return { plan, sizeAndPrice, transform, HEADROOM };
});
