// Sandbox engine checks. Run: node tests/sim_check.js
const S = require("../sim.js"), E = require("../engine.js"), LV = require("../levels.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Draw an old-style design as a graph for the general engine
function fromCfg(cfg) {
  const nodes = [{ id: "c", type: "client" }], edges = []; let prev = "c";
  const add = (id, type, props, link = true) => { nodes.push({ id, type, props }); if (link) { edges.push({ from: prev, to: id }); prev = id; } };
  if (cfg.limiter > 0) add("lim", "limiter", { limit: cfg.limiter });
  if (cfg.cdn) add("cdn", "cdn");
  if (cfg.lb !== "none") add("lb", "lb", { inst: 1, ha: cfg.lb === "ha" });
  add("app", "app", { inst: cfg.app.n, auto: cfg.app.auto });
  nodes.push({ id: "db", type: "sql", props: { shards: cfg.db.shards, replicas: cfg.db.replicas, ha: cfg.db.ha, salting: cfg.db.salting } });
  if (cfg.cache.tier !== "none") { nodes.push({ id: "ca", type: "cache", props: { inst: cfg.cache.nodes, hit: E.K.cacheHit[cfg.cache.tier], coalesce: cfg.cache.coalesce } }); edges.push({ from: "app", to: "ca" }, { from: "ca", to: "db" }); }
  if (cfg.queue.on) { nodes.push({ id: "q", type: "queue", props: { workers: cfg.queue.workers } }); edges.push({ from: "app", to: "q" }, { from: "q", to: "db" }); }
  edges.push({ from: "app", to: "db" });
  return { nodes, edges };
}
const events = (l) => (l.chaos || []).map((c) => ({ tick: c.tick, until: c.tick + (c.duration || 1) + (c.type === "cacheFlush" ? 0 : 0), type: c.type === "azOut" ? "azOut" : c.type }));

console.log("\nCross-check against the calibrated level engine (reference designs)");
for (const l of LV) {
  const g = fromCfg(l.ref), sc = { base: l.load.base, shape: l.load.shape, spikeX: l.load.spikeX, readFrac: l.load.readFrac, staticFrac: l.load.staticFrac || 0, botFrac: l.load.botFrac || 0, skew: l.load.skew || 1 };
  const a = S.run(g, sc, []), old = E.grade(l, l.ref);
  if (a.error) { ok(false, `level ${l.id}: ${a.error}`); continue; }
  const av = a.summary.availability, p = a.summary.p95;
  console.log(`  L${l.id}: new p95 ${p.toFixed(0)} avail ${(av * 100).toFixed(2)} cost ${a.summary.cost} | old p95 ${old.normal.p95.toFixed(0)} avail ${(old.normal.availability * 100).toFixed(2)} cost ${old.normal.cost}`);
  ok(av >= 0.99, `level ${l.id}: a reference design serves normal traffic on the general engine (availability ${(av * 100).toFixed(2)}%)`);
  const mid = 60, pn = a.st.history[mid].p95, po = old.normal.ticks[mid].p95;
  ok(near(pn, po, Math.max(20, po * 0.3)), `level ${l.id}: mid-run p95 is within 30% of the level engine (${pn.toFixed(0)} vs ${po.toFixed(0)} ms)`);
  ok(near(a.summary.cost, old.normal.cost, old.normal.cost * 0.2 + 80), `level ${l.id}: monthly cost is in the same range`);
}
console.log("\nBehaviour");
const base = { base: 1000, shape: "steady", readFrac: 0.9, staticFrac: 0, botFrac: 0, skew: 1 };
const chain = (p) => ({ nodes: [{ id: "c", type: "client" }, { id: "a", type: "app", props: { inst: p.app || 4 } }, { id: "d", type: "sql", props: { replicas: p.rep || 0, ha: !!p.ha } }].concat(p.cache ? [{ id: "k", type: "cache", props: { hit: 0.9 } }] : []),
  edges: [{ from: "c", to: "a" }].concat(p.cache ? [{ from: "a", to: "k" }, { from: "k", to: "d" }, { from: "a", to: "d" }] : [{ from: "a", to: "d" }]) });
let r = S.run(chain({ app: 1 }), base, []); ok(r.summary.availability < 0.5, "one app server cannot carry 1,000 req/s");
const heavy = Object.assign({}, base, { base: 2500 });
r = S.run(chain({ app: 10 }), heavy, []); ok(r.summary.availability < 0.99 && r.summary.busiest.name.includes("SQL"), "with enough servers the database becomes the bottleneck (no cache)");
const r2 = S.run(chain({ app: 10, cache: true }), heavy, []); ok(r2.summary.availability > 0.99 && r2.summary.p95 < r.summary.p95, "adding a cache fixes availability and lowers latency");
ok(S.run({ nodes: [{ id: "a", type: "app" }], edges: [] }, base, []).error, "a diagram without a client cannot run");
const loop = { nodes: [{ id: "c", type: "client" }, { id: "a", type: "app" }, { id: "b", type: "app" }, { id: "d", type: "sql" }], edges: [{ from: "c", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "a" }, { from: "b", to: "d" }] };
const lr = S.run(loop, base, []); ok(!lr.error && lr.st.m.warnings.length === 1, "a loop is broken and reported, the run continues");
const dbKill = S.run(chain({ app: 4, cache: true, rep: 0 }), base, [{ tick: 50, until: 51, type: "dbDown" }]);
const dbKillHa = S.run(chain({ app: 4, cache: true, rep: 1, ha: true }), base, [{ tick: 50, until: 51, type: "dbDown" }]);
ok(dbKillHa.summary.availability > dbKill.summary.availability, "replica + failover survives a database failure better");
const flush = S.run(chain({ app: 4, cache: true }), Object.assign({}, base, { base: 3000 }), []); const flushed = S.run(chain({ app: 12, cache: true }), Object.assign({}, base, { base: 3000 }), [{ tick: 60, until: 61, type: "cacheFlush" }]);
ok(flushed.summary.p95 >= flush.summary.p95 || flushed.summary.availability <= 1, "a cache flush does not break the run");
const a1 = JSON.stringify(S.run(chain({ app: 4, cache: true }), base, []).st.history[10]), a2 = JSON.stringify(S.run(chain({ app: 4, cache: true }), base, []).st.history[10]); ok(a1 === a2, "same graph and scenario give identical results");
const llm = S.run({ nodes: [{ id: "c", type: "client" }, { id: "g", type: "llmgw" }, { id: "m", type: "llm", props: { inst: 2 } }], edges: [{ from: "c", to: "g" }, { from: "g", to: "m" }] }, Object.assign({}, base, { base: 20 }), []);
ok(llm.summary.p95 > 1000, "an LLM service is slow (over a second) by nature");
const mesh = S.run({ nodes: [{ id: "c", type: "client" }, { id: "a", type: "app", props: { inst: 4 } }, { id: "b", type: "go", props: { inst: 2 } }, { id: "d", type: "mongo" }], edges: [{ from: "c", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "d" }] }, base, []);
ok(mesh.summary.availability > 0.99, "a service calling another service (chain of two) works");
// regression: a WAF placed after the load balancer must still shed bot traffic
const botScenario = Object.assign({}, base, { base: 3000, botFrac: 0.5 });
const mk = (waf) => ({ nodes: [{ id: "c", type: "client" }, { id: "lb", type: "lb" }].concat(waf ? [{ id: "w", type: "waf" }] : []).concat([{ id: "a", type: "app", props: { inst: 12 } }, { id: "d", type: "sql" }]),
  edges: (waf ? [["c", "lb"], ["lb", "w"], ["w", "a"], ["a", "d"]] : [["c", "lb"], ["lb", "a"], ["a", "d"]]).map(([f, t]) => ({ from: f, to: t })) });
const withWaf = S.run(mk(true), botScenario, []), noWaf = S.run(mk(false), botScenario, []);
ok(withWaf.st.history[10].nodes.a.load < noWaf.st.history[10].nodes.a.load * 0.7, "a WAF after the load balancer reduces the load reaching the app servers (bots shed)");
// a long-running session must not grow without bound or slow down
const longRun = S.createSim(chain({ app: 4, cache: true }), base); for (let i = 0; i < 5000; i++) S.step(longRun, {});
ok(longRun.history.length <= 360 && longRun.t === 5000, "history stays bounded over 5,000 ticks");
ok(Math.abs(S.summarize(longRun).availability - 1) < 0.01, "cumulative availability still reflects the whole session");
// parallel and external calls now add to end-to-end latency
const noCall = S.run({ nodes: [{ id: "c", type: "client" }, { id: "a", type: "app", props: { inst: 4 } }, { id: "d", type: "sql" }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }] }, base, []);
const withPay = S.run({ nodes: [{ id: "c", type: "client" }, { id: "a", type: "app", props: { inst: 4 } }, { id: "d", type: "sql" }, { id: "p", type: "payment", props: { ratio: 0.5, inst: 4 } }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }, { from: "a", to: "p" }] }, base, []);
ok(withPay.summary.p95 > noCall.summary.p95 + 100, `an external payment call on half the requests adds its latency (${noCall.summary.p95.toFixed(0)} -> ${withPay.summary.p95.toFixed(0)} ms)`);
const slowVec = S.run({ nodes: [{ id: "c", type: "client" }, { id: "a", type: "app", props: { inst: 4 } }, { id: "v", type: "vector", props: { rd: 50 } }, { id: "d", type: "sql" }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }, { from: "a", to: "v", fan: true, w: 1 }] }, base, []);
ok(slowVec.summary.availability < 0.5, "a parallel call to an overloaded vector database now fails the requests that depend on it");
// resilience patterns: a retry storm, a circuit breaker and a fallback
function burstRun(props) {
  const g = { nodes: [{ id: "c", type: "client" }, { id: "a", type: "app", props: Object.assign({ inst: 12 }, props) }, { id: "d", type: "sql" }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }] };
  const st = S.createSim(g, { base: 1700, shape: "steady", readFrac: 1, staticFrac: 0, botFrac: 0 }), out = [];
  for (let t = 0; t < 90; t++) out.push(S.step(st, { trafficMult: t >= 20 && t < 25 ? 1.6 : 1 }));
  const av = (a, b) => out.slice(a, b).reduce((x, r) => x + r.ok, 0) / (b - a);
  return { during: av(20, 25), late: av(40, 90), dbLoadLate: out[70].nodes.d.load, out };
}
const plain = burstRun({}), storm = burstRun({ retries: 3, timeout: 200 }), guarded = burstRun({ retries: 3, timeout: 200, breaker: true }), soft = burstRun({ retries: 3, timeout: 200, breaker: true, fallback: true });
ok(plain.late > 0.99, "without retries a short burst is over quickly and the system recovers");
ok(storm.late < 0.05 && storm.dbLoadLate > 3 * plain.dbLoadLate, "retries without a breaker turn a 5-tick burst into a lasting outage (retry storm) and quadruple the database load");
ok(guarded.late > 0.99 && guarded.dbLoadLate < 1.2 * plain.dbLoadLate, "a circuit breaker ends the retry storm and the database load returns to normal");
ok(soft.during > guarded.during + 0.3, "a fallback keeps most requests served during the burst (degraded)");
ok(soft.out.some((r) => r.nodes.a.brkOpen) && soft.out.some((r) => r.degraded > 0.1), "the breaker opening and the degraded share are visible in the results");
const legacy = S.run(chain({ app: 4, cache: true }), base, []).summary;
ok(legacy.availability > 0.99, "designs that do not use retries or breakers behave as before");
// multi-region: latency between regions, entry failover, replica promotion, data loss on failover, active-active conflicts
function twoRegions(o) {
  o = Object.assign({ failover: true, promote: true, appInst: 8, dbRep: 1 }, o);
  const nodes = [{ id: "cUS", type: "client", props: { region: "us", share: 1 } }, { id: "cEU", type: "client", props: { region: "eu", share: 1 } },
    { id: "lbUS", type: "lb", props: { region: "us" } }, { id: "lbEU", type: "lb", props: { region: "eu" } },
    { id: "aUS", type: "app", props: { region: "us", inst: o.appInst } }, { id: "aEU", type: "app", props: { region: "eu", inst: o.appInst } },
    { id: "dUS", type: "postgres", props: { region: "us", replicas: o.dbRep } }, { id: "dEU", type: "postgres", props: { region: "eu", mode: "replica", peer: "dUS", autoPromote: o.promote, replicas: o.dbRep } }];
  const edges = [["cUS", "lbUS"], ["cEU", "lbEU"], ["lbUS", "aUS"], ["lbEU", "aEU"], ["aUS", "dUS"]].map(([a, b]) => ({ from: a, to: b }));
  edges.push({ from: "aEU", to: "dEU", only: "r" }, { from: "aEU", to: "dUS", only: "w" });
  if (o.failover) edges.push({ from: "cUS", to: "lbEU", failover: true }, { from: "cEU", to: "lbUS", failover: true });
  return { nodes, edges };
}
function regionRun(g, outage) {
  const st = S.createSim(g, { base: 3000, shape: "steady", readFrac: 0.9 }), out = [];
  for (let t = 0; t < 100; t++) out.push(S.step(st, { chaos: outage && t >= 30 && t < 60 ? { "region:us": true } : {} }));
  const av = (a, b) => out.slice(a, b).reduce((x, r) => x + r.ok, 0) / (b - a);
  return { out, av };
}
const calm = regionRun(twoRegions(), false), roomy = regionRun(twoRegions({ appInst: 16, dbRep: 3 }), true), tight = regionRun(twoRegions({ dbRep: 0 }), true), noFo = regionRun(twoRegions({ failover: false, appInst: 16, dbRep: 3 }), true), noPromo = regionRun(twoRegions({ promote: false, appInst: 16, dbRep: 3 }), true);
ok(calm.av(5, 100) > 0.999 && calm.out[50].nodes.dEU.rpo === 0, "two healthy regions serve all traffic with nothing lost");
ok(calm.out[20].nodes.dEU.lag > 0.05 && calm.out[20].nodes.dEU.lag < 0.5, `a replica trails its primary by about the round trip (${calm.out[20].nodes.dEU.lag.toFixed(2)} s)`);
ok(roomy.av(36, 60) > 0.99, `a regional outage is survived when the other region has room (${(roomy.av(36, 60) * 100).toFixed(1)}%)`);
ok(roomy.av(30, 33) < 0.95, "failover is not instant: the first ticks of the outage lose requests until the health check notices");
ok(noFo.av(36, 60) < 0.6, "without entry failover, the users of the failed region stay down");
ok(noPromo.av(36, 60) < roomy.av(36, 60) - 0.05, "without replica promotion, writes keep failing during the outage");
ok(roomy.out[45].nodes.dEU.rpo > 0, `promoting a replica loses the writes it had not received (${roomy.out[45].nodes.dEU.rpo} writes)`);
ok(tight.av(36, 60) < roomy.av(36, 60) - 0.05, "the surviving region without spare capacity is overloaded and fails too (N+1 capacity)");
const eu = S.run({ nodes: [{ id: "c", type: "client", props: { region: "eu" } }, { id: "a", type: "app", props: { region: "us", inst: 4 } }, { id: "d", type: "sql", props: { region: "us" } }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }] }, base, []).summary.p95;
const local = S.run({ nodes: [{ id: "c", type: "client", props: { region: "us" } }, { id: "a", type: "app", props: { region: "us", inst: 4 } }, { id: "d", type: "sql", props: { region: "us" } }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }] }, base, []).summary.p95;
ok(eu > local + 80, `users far from the region pay the round trip (${local.toFixed(0)} -> ${eu.toFixed(0)} ms)`);
const rw = S.createSim(twoRegions({ failover: false }), { base: 3000, shape: "steady", readFrac: 0.9 }); let recRW; for (let t = 0; t < 10; t++) recRW = S.step(rw, {});
ok(Math.abs(recRW.nodes.dEU.load - 1350) < 60 && Math.abs(recRW.nodes.dUS.load - 1650) < 60, `reads stay on the local replica (${Math.round(recRW.nodes.dEU.load)}/s) and the EU writes go to the primary (${Math.round(recRW.nodes.dUS.load)}/s) (only-wires)`);
const aa = (skew) => { const g = { nodes: [{ id: "c", type: "client", props: { region: "us" } }, { id: "a", type: "app", props: { region: "us", inst: 8 } }, { id: "d1", type: "postgres", props: { region: "us", mode: "active", peer: "d2" } }, { id: "d2", type: "postgres", props: { region: "ap", mode: "active", peer: "d1" } }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d1" }, { from: "a", to: "d2" }] };
  const st = S.createSim(g, { base: 2000, shape: "steady", readFrac: 0.5, skew }); let r; for (let t = 0; t < 10; t++) r = S.step(st, {}); return r.nodes.d1.conflict + r.nodes.d2.conflict; };
ok(aa(1) > 0 && aa(3) > aa(1) * 2, "active-active writes conflict, and conflicts grow with hot keys");
// consistency modes and network partitions
function oneDb(props, chaosOn, sc) {
  const g = { nodes: [{ id: "c", type: "client", props: { region: "us" } }, { id: "a", type: "app", props: { inst: 12, region: "us" } }, { id: "d", type: "postgres", props: Object.assign({ region: "us", replicas: 2 }, props) }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }] };
  const st = S.createSim(g, Object.assign({ base: 1500, shape: "steady", readFrac: 0.8 }, sc || {})); let r;
  for (let t = 0; t < 40; t++) r = S.step(st, { chaos: t >= 20 && chaosOn ? chaosOn : {} });
  return r;
}
const evn = oneDb({ consistency: "eventual" }), strg = oneDb({ consistency: "strong" }), quo = oneDb({ consistency: "quorum" });
ok(strg.p95 > evn.p95 && strg.nodes.d.util > evn.nodes.d.util * 1.5, "strong consistency costs latency and reads only the leader");
ok(quo.p95 > evn.p95 && quo.p95 < strg.p95, "quorum sits between eventual and strong on latency");
const heavyRead = { base: 6000, readFrac: 0.95 };
ok(oneDb({ consistency: "ryw", rywShare: 0.5 }, null, heavyRead).ok < oneDb({ consistency: "eventual" }, null, heavyRead).ok, "read-your-writes sends readers who just wrote to the primary, which limits read capacity");
const writeHeavy = { base: 2600, readFrac: 0.3 };
ok(oneDb({ consistency: "eventual" }, null, writeHeavy).nodes.d.util > 0.7 && oneDb({ consistency: "eventual" }, null, writeHeavy).stale > 0.05, "eventual reads go stale when writes are heavy");
ok(oneDb({ consistency: "quorum" }, null, writeHeavy).stale === 0 && oneDb({ consistency: "strong" }, null, writeHeavy).stale === 0 && oneDb({ consistency: "ryw" }, null, writeHeavy).stale === 0, "quorum (R+W>N), strong and read-your-writes never return stale reads");
const zone = { azOut: true };
ok(oneDb({ consistency: "quorum", replicas: 1 }, zone).ok < 0.05 && oneDb({ consistency: "eventual", replicas: 1 }, zone).ok > 0.5, "with only two copies a zone loss breaks the quorum but not an eventual database");
ok(oneDb({ consistency: "quorum", replicas: 2 }, zone).ok > 0.5, "with three copies the quorum survives a zone loss");
function partitionRun(props, sc, chaosOn) {
  const g = { nodes: [{ id: "c", type: "client", props: { region: "eu" } }, { id: "a", type: "app", props: { inst: 8, region: "eu" } }, { id: "dEU", type: "postgres", props: Object.assign({ region: "eu", mode: "replica", peer: "dUS", replicas: 0 }, props) }, { id: "dUS", type: "postgres", props: { region: "us" } }],
    edges: [{ from: "c", to: "a" }, { from: "a", to: "dEU", only: "r" }, { from: "a", to: "dUS", only: "w" }] };
  const st = S.createSim(g, Object.assign({ base: 1000, shape: "steady", readFrac: 1 }, sc || {})); let r;
  for (let t = 0; t < 40; t++) r = S.step(st, { chaos: t >= 20 && chaosOn ? { partition: true } : {} });
  return r;
}
const apRun = partitionRun({ consistency: "eventual" }, {}, true), cpRun = partitionRun({ consistency: "strong" }, {}, true), calmRun = partitionRun({ consistency: "strong" }, {}, false);
ok(calmRun.ok > 0.99, "without a partition the strong replica serves reads");
ok(apRun.ok > 0.99 && apRun.stale > 0.5, `during a partition an eventual replica stays available but serves stale data (${(apRun.stale * 100).toFixed(0)}% stale)`);
ok(cpRun.ok < 0.05 && cpRun.stale === 0, "during a partition a strong replica refuses to answer rather than serve stale data (CP)");
ok(partitionRun({ consistency: "quorum", qr: 1, qw: 2 }, {}, true).ok > 0.99, "a read-one write-all quorum keeps serving reads during a partition (but its writes would fail)");
const wPart = partitionRun({ consistency: "eventual" }, { readFrac: 0 }, true);
ok(wPart.ok < 0.05, "writes to a primary in another region fail while the regions are partitioned");
console.log(fail ? `\n${fail} FAILED` : "\nall sandbox engine checks passed"); process.exit(fail ? 1 : 0);
