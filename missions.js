/* Product missions for the Architecture Lab Sandbox.
 * Each mission is a real product with a brief, goals, hidden incidents and acceptance criteria.
 * evaluate() runs the design through the simulator (deterministic) and scores it out of 100.
 * Numbers are teaching numbers, like the rest of the simulator.
 */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.LabMissions = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const G = () => { const g = { nodes: [], edges: [] }; return { g, n(id, type, x, y, props) { g.nodes.push({ id, type, x, y, props: props || {} }); }, e(a, b, extra) { g.edges.push(Object.assign({ from: a, to: b }, extra || {})); } }; };
  const X = [80, 290, 500, 710, 920, 1130];
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

  const MISSIONS = [
    {
      id: "rag", title: "Support chatbot with RAG", icon: "🧠", level: "Intermediate",
      brief: "A software company puts an AI support assistant on its help site. Each question looks up passages in a vector database and asks a GPU-hosted language model. GPUs are slow and expensive, so capacity and caching decide everything.",
      learn: ["A GPU service handles very few requests per second", "A semantic cache can answer repeated questions without a GPU", "Spare GPU capacity is needed for a zone loss"],
      hints: ["The GPU box is the bottleneck. Work out instances = peak requests / capacity per instance.", "Many customers ask the same questions. Put a cache between the app and the language model and set its hit rate near 35%.", "Plan for losing half the GPUs in a zone: keep enough instances that half of them still carry the peak."],
      scenario: { base: 40, shape: "steady", readFrac: 1 }, slo: { p95: 4000, avail: 99, budget: 14000 },
      incidents: [
        { id: "launch", label: "Product launch: 3× the questions", events: [{ tick: 40, until: 60, type: "surge:3" }] },
        { id: "zone", label: "A data-centre zone loses half its machines", events: [{ tick: 70, until: 85, type: "azOut" }] },
        { id: "vector", label: "The vector database slows down 4×", events: [{ tick: 95, until: 110, type: "slowDb" }] },
      ],
      criteria: [
        { label: "Normal hour: p95 latency within 4 seconds", points: 10, core: true, check: (R) => R.normal.p95 <= 4000, detail: (R) => `${Math.round(R.normal.p95)} ms` },
        { label: "Normal hour: 99% of questions answered", points: 15, core: true, check: (R) => R.normal.availability >= 0.99, detail: (R) => pct(R.normal.availability) },
        { label: "Launch surge: at least 97% answered", points: 20, check: (R) => R.win.launch.availability >= 0.97, detail: (R) => pct(R.win.launch.availability) },
        { label: "Zone loss: at least 97% answered", points: 20, check: (R) => R.win.zone.availability >= 0.97, detail: (R) => pct(R.win.zone.availability) },
        { label: "Vector database slowdown: still 99% answered", points: 10, check: (R) => R.win.vector.availability >= 0.99, detail: (R) => pct(R.win.vector.availability) },
        { label: "Monthly cost within the budget", points: 25, budget: true, check: (R, m) => R.all.cost <= m.slo.budget, detail: (R, m) => `${money(R.all.cost)} of ${money(m.slo.budget)}` },
      ],
      starter() { const b = G(); b.n("c", "browser", X[0], 240, { name: "Help-site visitors" }); b.n("gw", "llmgw", X[1], 240); b.n("app", "python", X[2], 240, { inst: 2, name: "RAG app" }); b.n("vec", "vector", X[3], 100, { name: "Vector DB" }); b.n("llm", "llm", X[3], 380, { inst: 2, name: "Language model (GPU)" });
        b.e("c", "gw"); b.e("gw", "app"); b.e("app", "llm"); b.e("app", "vec", { fan: true, w: 1 }); return b.g; },
      reference() { const b = G(); b.n("c", "browser", X[0], 240, { name: "Help-site visitors" }); b.n("gw", "llmgw", X[1], 240); b.n("app", "python", X[2], 240, { inst: 4, name: "RAG app" }); b.n("cache", "cache", X[3], 240, { hit: 0.35, name: "Semantic cache" }); b.n("vec", "vector", X[3], 60, { name: "Vector DB" }); b.n("llm", "llm", X[4], 240, { inst: 6, name: "Language model (GPU)" });
        b.e("c", "gw"); b.e("gw", "app"); b.e("app", "cache"); b.e("cache", "llm"); b.e("app", "vec", { fan: true, w: 1 }); return b.g; },
    },
    {
      id: "payments", title: "Payments API", icon: "💳", level: "Advanced",
      brief: "A fintech app moves money through a card provider. Money must not be lost, the database must survive a failure, and the provider is outside your control: when it slows down you feel it.",
      learn: ["An external provider has its own capacity and can slow down", "A database primary needs automatic failover", "Autoscaling and headroom absorb marketing spikes"],
      hints: ["Half of the requests call the payment provider. Its capacity per instance is small: check its busy % during the slowdown and add instances.", "Turn on automatic failover for the database (HA) and add a replica.", "Give the service headroom or autoscaling so a 3× spike does not saturate it."],
      scenario: { base: 400, shape: "steady", readFrac: 0.5 }, slo: { p95: 800, avail: 99.95, budget: 2400 },
      incidents: [
        { id: "provider", label: "The card provider slows down (4× slower, 40% capacity)", events: [{ tick: 40, until: 60, type: "slow:pay" }] },
        { id: "db", label: "The database primary fails", events: [{ tick: 80, until: 81, type: "dbDown" }] },
        { id: "promo", label: "A marketing promotion triples traffic", events: [{ tick: 100, until: 112, type: "surge:3" }] },
      ],
      criteria: [
        { label: "Normal hour: p95 latency within 800 ms", points: 10, core: true, check: (R) => R.normal.p95 <= 800, detail: (R) => `${Math.round(R.normal.p95)} ms` },
        { label: "Normal hour: availability at least 99.95%", points: 15, core: true, check: (R) => R.normal.availability >= 0.9995, detail: (R) => pct(R.normal.availability) },
        { label: "Provider slowdown: at least 99.5% of payments succeed", points: 20, check: (R) => R.win.provider.availability >= 0.995, detail: (R) => pct(R.win.provider.availability) },
        { label: "Database failure: at least 99.5% succeed", points: 20, check: (R) => R.win.db.availability >= 0.995, detail: (R) => pct(R.win.db.availability) },
        { label: "Promotion spike: at least 99% succeed", points: 10, check: (R) => R.win.promo.availability >= 0.99, detail: (R) => pct(R.win.promo.availability) },
        { label: "Monthly cost within the budget", points: 25, budget: true, check: (R, m) => R.all.cost <= m.slo.budget, detail: (R, m) => `${money(R.all.cost)} of ${money(m.slo.budget)}` },
      ],
      starter() { const b = G(); b.n("c", "mobile", X[0], 240, { name: "Mobile app" }); b.n("gw", "apigw", X[1], 240); b.n("svc", "java", X[2], 240, { inst: 3, name: "Payments service" }); b.n("pay", "payment", X[3], 100, { inst: 2, ratio: 0.5, name: "Card provider" }); b.n("db", "sql", X[3], 380, { name: "Ledger DB" });
        b.e("c", "gw"); b.e("gw", "svc"); b.e("svc", "db"); b.e("svc", "pay"); return b.g; },
      reference() { const b = G(); b.n("c", "mobile", X[0], 240, { name: "Mobile app" }); b.n("gw", "apigw", X[1], 240, { inst: 2 }); b.n("svc", "java", X[2], 240, { inst: 6, auto: true, name: "Payments service" }); b.n("pay", "payment", X[3], 100, { inst: 5, ratio: 0.5, name: "Card provider" }); b.n("q", "sqs", X[3], 240, { workers: 6, name: "Payment intents queue" }); b.n("db", "sql", X[4], 380, { replicas: 1, ha: true, name: "Ledger DB" });
        b.e("c", "gw"); b.e("gw", "svc"); b.e("svc", "q"); b.e("q", "db"); b.e("svc", "db"); b.e("svc", "pay"); return b.g; },
    },
    {
      id: "scraper", title: "Job-listing scraper", icon: "🕸️", level: "Intermediate",
      brief: "A job-search product reads thousands of company career pages every day. Crawlers fetch pages from other people's sites, parsers turn them into records, and a database keeps them. Work arrives in bursts and the database can lag.",
      learn: ["A queue between stages absorbs bursts and slowdowns", "Third-party sites have limited capacity: do not exceed it", "Write delay matters more than latency for batch pipelines"],
      hints: ["Put a queue between the crawlers and the parsers so a slow database delays work instead of dropping it.", "Give the queue enough workers that it drains faster than work arrives.", "Watch the busiest box during the burst and add instances there."],
      scenario: { base: 500, shape: "steady", readFrac: 0.02 }, slo: { p95: 600, avail: 99, budget: 3000 },
      incidents: [
        { id: "burst", label: "A burst of 4× more pages (new companies added)", events: [{ tick: 40, until: 55, type: "surge:4" }] },
        { id: "dbslow", label: "The database slows down 4×", events: [{ tick: 70, until: 90, type: "slowDb" }] },
        { id: "zone", label: "A zone loses half its machines", events: [{ tick: 100, until: 112, type: "azOut" }] },
      ],
      criteria: [
        { label: "Normal hour: at least 99% of pages processed", points: 15, core: true, check: (R) => R.normal.availability >= 0.99, detail: (R) => pct(R.normal.availability) },
        { label: "Normal hour: work never waits more than 10 minutes", points: 10, core: true, check: (R) => R.normal.maxDelayMin <= 10, detail: (R) => `${R.normal.maxDelayMin.toFixed(1)} min` },
        { label: "Burst: at least 98% processed and waiting under 10 minutes", points: 20, check: (R) => R.win.burst.availability >= 0.98 && R.win.burst.maxDelayMin <= 10, detail: (R) => `${pct(R.win.burst.availability)}, wait ${R.win.burst.maxDelayMin.toFixed(1)} min` },
        { label: "Slow database: at least 98% processed and waiting under 10 minutes", points: 20, check: (R) => R.win.dbslow.availability >= 0.98 && R.win.dbslow.maxDelayMin <= 10, detail: (R) => `${pct(R.win.dbslow.availability)}, wait ${R.win.dbslow.maxDelayMin.toFixed(1)} min` },
        { label: "Zone loss: at least 98% processed", points: 10, check: (R) => R.win.zone.availability >= 0.98, detail: (R) => pct(R.win.zone.availability) },
        { label: "Monthly cost within the budget", points: 25, budget: true, check: (R, m) => R.all.cost <= m.slo.budget, detail: (R, m) => `${money(R.all.cost)} of ${money(m.slo.budget)}` },
      ],
      starter() { const b = G(); b.n("c", "client", X[0], 240, { name: "Scheduler" }); b.n("cr", "worker", X[1], 240, { inst: 4, name: "Crawlers" }); b.n("site", "thirdparty", X[2], 100, { inst: 3, ratio: 1, name: "Company sites" }); b.n("pa", "python", X[2], 380, { inst: 3, name: "Parsers" }); b.n("db", "sql", X[3], 380, { name: "Jobs DB" });
        b.e("c", "cr"); b.e("cr", "site"); b.e("cr", "pa"); b.e("pa", "db"); return b.g; },
      reference() { const b = G(); b.n("c", "client", X[0], 240, { name: "Scheduler" }); b.n("cr", "worker", X[1], 240, { inst: 6, name: "Crawlers" }); b.n("site", "thirdparty", X[2], 100, { inst: 8, ratio: 1, name: "Company sites" }); b.n("q", "queue", X[2], 380, { workers: 6, name: "Parse queue" }); b.n("pa", "python", X[3], 380, { inst: 6, name: "Parsers" }); b.n("db", "sql", X[4], 380, { shards: 2, name: "Jobs DB" });
        b.e("c", "cr"); b.e("cr", "site"); b.e("cr", "q"); b.e("q", "pa"); b.e("pa", "db"); return b.g; },
    },
    {
      id: "notify", title: "Notification system", icon: "🔔", level: "Intermediate",
      brief: "An app sends emails and push messages for millions of users. A marketing blast can be 15× the normal rate for a few minutes, and the email provider throttles when it is overloaded.",
      learn: ["A queue decouples the API from slow providers", "Workers must drain faster than the blast arrives", "External providers have capacity you must respect"],
      hints: ["The API should acknowledge immediately: put a queue behind it and let workers send.", "During the blast the queue grows: give it enough workers to drain it within a few minutes.", "The email provider gets 60% of messages. Give it instances for the blast, or the delay explodes."],
      scenario: { base: 800, shape: "steady", readFrac: 0 }, slo: { p95: 100, avail: 99.9, budget: 4400, maxDelay: 5 },
      incidents: [
        { id: "blast", label: "Marketing blast: 15× the messages for a few minutes", events: [{ tick: 40, until: 48, type: "surge:15" }] },
        { id: "email", label: "The email provider throttles (slower, less capacity)", events: [{ tick: 70, until: 85, type: "slow:email" }] },
        { id: "zone", label: "A zone loses half its machines", events: [{ tick: 100, until: 112, type: "azOut" }] },
      ],
      criteria: [
        { label: "Normal hour: the API answers within 100 ms", points: 10, core: true, check: (R) => R.normal.p95 <= 100, detail: (R) => `${Math.round(R.normal.p95)} ms` },
        { label: "Normal hour: at least 99.9% of messages accepted", points: 10, core: true, check: (R) => R.normal.availability >= 0.999, detail: (R) => pct(R.normal.availability) },
        { label: "Blast: nothing lost and nothing waits over 5 minutes", points: 25, check: (R) => R.win.blast.availability >= 0.999 && R.win.blast.maxDelayMin <= 5, detail: (R) => `${pct(R.win.blast.availability)}, wait ${R.win.blast.maxDelayMin.toFixed(1)} min` },
        { label: "Email throttling: at least 99% delivered", points: 15, check: (R) => R.win.email.availability >= 0.99, detail: (R) => pct(R.win.email.availability) },
        { label: "Zone loss: at least 99% accepted", points: 15, check: (R) => R.win.zone.availability >= 0.99, detail: (R) => pct(R.win.zone.availability) },
        { label: "Monthly cost within the budget", points: 25, budget: true, check: (R, m) => R.all.cost <= m.slo.budget, detail: (R, m) => `${money(R.all.cost)} of ${money(m.slo.budget)}` },
      ],
      starter() { const b = G(); b.n("c", "client", X[0], 240, { name: "Producers" }); b.n("api", "go", X[1], 240, { inst: 3, name: "Notification API" }); b.n("send", "notify", X[2], 240, { inst: 4, name: "Senders" }); b.n("email", "email", X[3], 100, { inst: 2, ratio: 0.6, name: "Email provider" }); b.n("db", "sql", X[3], 380, { name: "Delivery log" });
        b.e("c", "api"); b.e("api", "send"); b.e("send", "email"); b.e("send", "db"); return b.g; },
      reference() { const b = G(); b.n("c", "client", X[0], 240, { name: "Producers" }); b.n("api", "go", X[1], 240, { inst: 16, name: "Notification API" }); b.n("q", "sqs", X[2], 240, { workers: 20, name: "Message queue" }); b.n("send", "notify", X[3], 240, { inst: 16, name: "Senders" }); b.n("email", "email", X[4], 100, { inst: 8, ratio: 0.6, name: "Email provider" }); b.n("db", "cassandra", X[4], 380, { name: "Delivery log" });
        b.e("c", "api"); b.e("api", "q"); b.e("q", "send"); b.e("send", "email"); b.e("send", "db"); return b.g; },
    },
    {
      id: "video", title: "Video streaming", icon: "🎬", level: "Advanced",
      brief: "A streaming service serves video segments and a small API. Almost all traffic is static video data. A big premiere multiplies it, and storage can slow down.",
      learn: ["A CDN removes most of the static load from your origin", "Origin capacity still matters for cache misses", "Storage slowdowns hit whatever sits behind the CDN"],
      hints: ["Video segments are static: put a CDN in front, then a load balancer.", "Even with a CDN, 10% of static requests reach the origin: size the origin for that during the premiere.", "Object storage is the last stop: give it instances for the premiere and for a slowdown."],
      scenario: { base: 30000, shape: "steady", readFrac: 0.95, staticFrac: 0.9 }, slo: { p95: 300, avail: 99.9, budget: 4500 },
      incidents: [
        { id: "premiere", label: "Season premiere: 4× the viewers", events: [{ tick: 40, until: 60, type: "surge:4" }] },
        { id: "zone", label: "A zone loses half its machines", events: [{ tick: 75, until: 90, type: "azOut" }] },
        { id: "storage", label: "Object storage slows down (4× slower, 40% capacity)", events: [{ tick: 100, until: 112, type: "slow:store" }] },
      ],
      criteria: [
        { label: "Normal hour: p95 latency within 300 ms", points: 10, core: true, check: (R) => R.normal.p95 <= 300, detail: (R) => `${Math.round(R.normal.p95)} ms` },
        { label: "Normal hour: at least 99.9% of requests served", points: 15, core: true, check: (R) => R.normal.availability >= 0.999, detail: (R) => pct(R.normal.availability) },
        { label: "Premiere: at least 98% served (autoscaling needs a couple of minutes to react)", points: 20, check: (R) => R.win.premiere.availability >= 0.98, detail: (R) => pct(R.win.premiere.availability) },
        { label: "Zone loss: at least 99% served", points: 15, check: (R) => R.win.zone.availability >= 0.99, detail: (R) => pct(R.win.zone.availability) },
        { label: "Storage slowdown: at least 99% served", points: 15, check: (R) => R.win.storage.availability >= 0.99, detail: (R) => pct(R.win.storage.availability) },
        { label: "Monthly cost within the budget", points: 25, budget: true, check: (R, m) => R.all.cost <= m.slo.budget, detail: (R, m) => `${money(R.all.cost)} of ${money(m.slo.budget)}` },
      ],
      starter() { const b = G(); b.n("c", "browser", X[0], 240, { name: "Viewers" }); b.n("app", "app", X[1], 240, { inst: 12, name: "Origin servers" }); b.n("store", "object", X[2], 240, { inst: 2, name: "Video storage" });
        b.e("c", "app"); b.e("app", "store"); return b.g; },
      reference() { const b = G(); b.n("c", "browser", X[0], 240, { name: "Viewers" }); b.n("cdn", "cdn", X[1], 240, { inst: 2 }); b.n("lb", "lb", X[2], 240, { ha: true }); b.n("app", "app", X[3], 240, { inst: 32, auto: true, name: "Origin servers" }); b.n("store", "object", X[4], 240, { inst: 5, name: "Video storage" });
        b.e("c", "cdn"); b.e("cdn", "lb"); b.e("lb", "app"); b.e("app", "store"); return b.g; },
    },
  ];

  const pct = (x) => (x * 100).toFixed(2) + "%";

  /* Availability and p95 inside a window of ticks (request-weighted). */
  function windowStats(st, from, to) {
    const h = st.history.slice(from, to + 1); if (!h.length) return { availability: 1, p95: 0, maxDelayMin: 0 };
    const tw = h.reduce((a, x) => a + x.rps, 0) || 1, ok = h.reduce((a, x) => a + x.ok * x.rps, 0) / tw;
    const sorted = h.map((x) => ({ p: x.p95, w: x.rps })).sort((a, b) => a.p - b.p); let acc = 0, p95 = sorted[sorted.length - 1].p; for (const x of sorted) { acc += x.w / tw; if (acc >= 0.95) { p95 = x.p; break; } }
    return { availability: ok, p95, maxDelayMin: Math.max(...h.map((x) => x.delayMin)) };
  }

  /* Score a design. `S` is the LabSim module. Returns { error } when the design cannot run. */
  function evaluate(S, graph, mission) {
    const sim = (events) => S.run(graph, mission.scenario, events);
    const base = sim([]); if (base.error) return { error: base.error };
    const win = {}, incidentRuns = {};
    for (const inc of mission.incidents) {
      const r = sim(inc.events); incidentRuns[inc.id] = r.summary;
      const from = Math.min(...inc.events.map((e) => e.tick)), to = Math.max(...inc.events.map((e) => e.until)) + 4;
      win[inc.id] = windowStats(r.st, from, to);
    }
    const all = sim([].concat(...mission.incidents.map((i) => i.events)));
    const R = { normal: base.summary, win, all: all.summary, incidents: incidentRuns };
    const criteria = mission.criteria.map((c) => { let pass = false, detail = ""; try { pass = !!c.check(R, mission); detail = c.detail ? c.detail(R, mission) : ""; } catch (e) { detail = "could not be checked"; } return { label: c.label, points: c.points, pass, detail, core: !!c.core, budget: !!c.budget }; });
    const score = criteria.reduce((a, c) => a + (c.pass ? c.points : 0), 0);
    const coreOk = criteria.filter((c) => c.core).every((c) => c.pass), incidentsOk = criteria.filter((c) => !c.core && !c.budget).every((c) => c.pass), budgetOk = criteria.filter((c) => c.budget).every((c) => c.pass);
    const stars = coreOk ? (incidentsOk ? (budgetOk ? 3 : 2) : 1) : 0;
    return { R, criteria, score, stars, verdict: score >= 90 ? "Production ready" : score >= 70 ? "Nearly there" : score >= 40 ? "Fragile" : "Will not survive launch" };
  }

  return { MISSIONS, evaluate, windowStats };
});
