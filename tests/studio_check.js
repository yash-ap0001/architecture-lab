/* Design studio: layers, style recommendation, layout, Simulation Lab scenarios and document exports.
 * Run: node tests/studio_check.js */
global.self = global;
const S = require("../sim.js");
const ST = require("../studio.js"), X = require("../scenarios.js"), EX = require("../exports.js");
const F = require("../fixes.js"), L = require("../lint.js"), C = require("../cost.js"), E = require("../examples_more.js"), DOCS = require("../catalog_docs.js");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };
const doc = (nodes, edges, extra) => Object.assign({ name: "T", nodes: nodes.map(([id, type, props], i) => ({ id, type, x: 100 + i * 180, y: 200, props: props || {} })), edges: edges.map(([from, to, p]) => Object.assign({ from, to }, p || {})), slo: { p95: 300, avail: 99.5, budget: 50000 }, scenario: Object.assign({}, S.DEFAULT_SCENARIO, { base: 300 }) }, extra || {});
const verdict = (d, key, w) => X.runOne(d, key, w).verdict;

// ---- layers and profiles
ok(S.CATALOG.every((c) => ST.LAYERS.includes(ST.layerOf(c))), `every one of ${S.CATALOG.length} components maps to a layer`);
ok(S.CATALOG.every((c) => { const p = ST.profile(c); return p && p.complexity && p.costCategory && p.security.length && ST.ZONES.includes(p.zone); }), "every component has a profile with complexity, cost category, security notes and a trust zone");
const L_ = (id) => ST.layerOf(S.BY_ID[id]);
ok(L_("client") === "Client" && L_("cdn") === "Edge" && L_("postgres") === "Data" && L_("kafka") === "Messaging" && L_("llm") === "AI" && L_("prometheus") === "Observability" && L_("auth") === "Security" && L_("payment") === "External", "layer mapping of core components");

// ---- architecture style
const small = doc([["c", "client"], ["g", "apigw"], ["a", "app"], ["b", "app"], ["d", "postgres"]], [["c", "g"], ["g", "a"], ["g", "b"], ["a", "d"], ["b", "d"]]);
const st1 = ST.recommendStyle(small);
ok(/^Modular monolith/.test(st1.style) && st1.mvpServices === 1, "small assumed team gets a modular monolith with 1 deployable");
ok(st1.basis.some((b) => /assumed/.test(b)) && st1.confidence < 0.5, "unconfirmed team size lowers confidence and is labelled assumed");
const big = Object.assign({}, small, { requirements: { teamSize: 40, timelineWeeks: 26, confirmed: { teamSize: true, timelineWeeks: true } } });
const st2 = ST.recommendStyle(big);
ok(/^Microservices/.test(st2.style) && st2.mvpServices >= 3 && st2.confidence > st1.confidence, "a confirmed 40-person org gets microservices with higher confidence");
const busy = Object.assign({}, small, { scenario: Object.assign({}, S.DEFAULT_SCENARIO, { base: 30000 }) });
ok(/^Modular monolith/.test(ST.recommendStyle(busy).style), "high traffic alone does not push a small team to microservices");

// ---- merge (simplify) and layout
const many = doc([["c", "client"], ["g", "apigw"], ["a", "app"], ["b", "java"], ["e", "node"], ["d", "postgres"], ["q", "queue"]], [["c", "g"], ["g", "a"], ["a", "b"], ["b", "e"], ["e", "d"], ["a", "q"]]);
const m = ST.mergeServices(many, ["a", "b", "e"]);
ok(m.changes.length && m.doc.nodes.length === many.nodes.length - 2, "merging three services leaves one monolith node");
ok(!m.doc.edges.some((e) => e.from === e.to) && m.doc.edges.some((e) => e.from === "g") && m.doc.edges.some((e) => S.BY_ID[m.doc.nodes.find((n) => n.id === e.from).type].cls === "service" && e.to === "d") && m.doc.edges.some((e) => e.to === "q"), "merge keeps outside wires and drops internal ones");
ok(!S.run({ nodes: m.doc.nodes, edges: m.doc.edges }, many.scenario, []).error && many.nodes.length === 7, "merged design simulates and the original is untouched");
const lay = ST.autoLayout(many), ln = (id) => lay.doc.nodes.find((n) => n.id === id);
ok(lay.doc.nodes.every((n) => isFinite(n.x) && isFinite(n.y)) && ln("c").x < ln("g").x && ln("g").x < ln("a").x && ln("e").x < ln("d").x, "auto-layout puts nodes in request-flow order");
ok(JSON.stringify(ST.autoLayout(many).doc) === JSON.stringify(lay.doc), "auto-layout is deterministic");

// ---- AI token estimate
ok(ST.aiTokenCost(small) === null, "no AI: no token estimate");
const hosted = ST.aiTokenCost(doc([["c", "client"], ["a", "app"], ["m", "llm"]], [["c", "a"], ["a", "m"]]));
ok(hosted && hosted.monthly === 0 && hosted.hosted, "self-hosted model: no token bill (GPU is in compute)");
const api1 = ST.aiTokenCost(doc([["c", "client"], ["a", "app"], ["m", "bedrock"]], [["c", "a"], ["a", "m"]])), api2 = ST.aiTokenCost(doc([["c", "client"], ["a", "app"], ["r", "modelrouter"], ["m", "bedrock"]], [["c", "a"], ["a", "r"], ["r", "m"]]));
ok(api1.monthly > 0 && api2.monthly < api1.monthly && /assumed/.test(api1.basis), "model router lowers the token estimate; unconfirmed volumes are labelled assumed");

// ---- scenarios
ok(X.LIST.length === 20 && new Set(X.LIST.map((s) => s.key)).size === 20, "20 distinct simulation scenarios");
const nohaDb = doc([["c", "client"], ["l", "lb", { ha: true }], ["a", "app", { inst: 4 }], ["d", "postgres"]], [["c", "l"], ["l", "a"], ["a", "d"]], { scenario: Object.assign({}, S.DEFAULT_SCENARIO, { base: 300, readFrac: 0.5 }) });
const haDb = JSON.parse(JSON.stringify(nohaDb)); haDb.nodes[3].props.ha = true;
const r0 = X.runOne(nohaDb, "db-down"), r1 = X.runOne(haDb, "db-down");
ok(r1.metrics.availability > r0.metrics.availability && ["Pass", "Degraded", "Fail"].includes(r0.verdict), "database outage: HA standby keeps more requests served");
ok(r0.failover.some((x) => /no standby/.test(x)) && r1.failover.some((x) => /standby promoted/.test(x)), "failover path explains standby vs manual recovery");
ok(r0.patch && r0.patch.doc.nodes.find((n) => n.id === "d").props.ha === true && !nohaDb.nodes[3].props.ha, "db-down proposes HA as a previewable patch without touching the canvas");
ok(r0.alerts.length === 0 && /No monitoring/.test(r0.alertNote), "no monitoring: no alerts fire, and the result says so");
const mon = JSON.parse(JSON.stringify(nohaDb)); mon.nodes.push({ id: "p", type: "prometheus", x: 0, y: 0, props: {} }); mon.edges.push({ from: "p", to: "a" });
ok(X.runOne(mon, "db-down").alerts.length > 0, "with monitoring, the outage fires alerts");
const inj = doc([["c", "client"], ["a", "app"], ["m", "llm"]], [["c", "a"], ["a", "m"]]);
ok(verdict(inj, "prompt-injection") === "Fail" && X.runOne(inj, "prompt-injection").path.length === 3, "prompt injection: unguarded path fails and shows the path");
const injFixed = F.applyAll(inj, ["ai-injection"]).doc;
ok(verdict(injFixed, "prompt-injection") === "Pass", "prompt injection passes after the guardrail fix");
const tool = doc([["c", "client"], ["a", "app"], ["ag", "agent"], ["d", "postgres"], ["p", "payment"]], [["c", "a"], ["a", "ag"], ["ag", "d"], ["ag", "p"]]);
ok(verdict(tool, "unsafe-tool") === "Fail" && X.runOne(tool, "unsafe-tool").fixIds.includes("ai-tools"), "unsafe tool call: direct agent access to data and payments fails");
const toolFixed = F.applyAll(tool, ["ai-tools", "ai-approval"]).doc;
ok(verdict(toolFixed, "unsafe-tool") === "Pass" && verdict(toolFixed, "ai-tools") === "Pass", "tool gateway + approval queue pass both agent scenarios");
const breach = doc([["c", "client"], ["a", "app"], ["d", "postgres"]], [["c", "a"], ["c", "d"], ["a", "d"]]);
const br = X.runOne(breach, "breach");
ok(br.verdict === "Fail" && !br.checks[0].ok && br.fixIds.includes("public-db"), "breach attempt: a public database fails the first defence");
ok(verdict(breach, "restore") === "Fail", "no backup: restore scenario fails");
const safe = JSON.parse(JSON.stringify(breach)); safe.nodes[2].props.ha = true; safe.nodes.push({ id: "b", type: "backup", x: 0, y: 0, props: {} }); safe.edges.push({ from: "d", to: "b" });
ok(verdict(safe, "restore") === "Pass", "backup + HA at 99.5% passes the restore scenario");
ok(verdict(breach, "payment-fail") === "N/A" && verdict(breach, "ai-chat") === "N/A", "scenarios that do not apply say N/A");
const pay = doc([["c", "client"], ["g", "apigw"], ["a", "app", { inst: 3 }], ["p", "payment"], ["d", "postgres", { ha: true }]], [["c", "g"], ["g", "a"], ["a", "p"], ["a", "d"]]);
const pf = X.runOne(pay, "payment-fail");
ok(pf.verdict !== "N/A" && pf.patch && pf.patch.doc.nodes.find((n) => n.id === "a").props.breaker, "payment failure proposes breaker, timeout and idempotency on the caller");
ok(X.runOne(pay, "service-down", { target: "a" }).target === "a", "what-if: choose which service fails");
const off = X.runOne(pay, "normal", { off: ["a"] }), base = X.runOne(pay, "normal");
ok(off.metrics.hourAvailability < base.metrics.hourAvailability, "what-if: turning a service off lowers availability");
ok(X.runOne(pay, "normal", { trafficMult: 3 }).metrics.peakRps > base.metrics.peakRps * 2.5, "what-if: traffic multiplier raises load");

// every built-in example: every scenario runs without error and is deterministic
const ex = E.LIST.map((e) => { const d = E.build(e, S.BY_ID); d.name = e.name; d.scenario = Object.assign({}, S.DEFAULT_SCENARIO, d.scenario || {}); d.slo = d.slo || { p95: 300, avail: 99.5, budget: 5000 }; return d; });
let errs = 0, nondet = 0;
const all = ex.map((d) => { const a = X.runAll(d, {}); errs += a.results.filter((r) => r.basis === "error").length; return a; });
ex.slice(0, 15).forEach((d, i) => { const b = X.runAll(d, {}); if (JSON.stringify(b.results.map((r) => r.verdict + (r.summary || ""))) !== JSON.stringify(all[i].results.map((r) => r.verdict + (r.summary || "")))) nondet++; });
ok(errs === 0, `all 20 scenarios run on ${ex.length} examples without errors`);
ok(nondet === 0, "scenario results are deterministic");
ok(all.every((a) => a.results.every((r) => ["Pass", "Degraded", "Fail", "N/A"].includes(r.verdict) && r.basis && typeof r.summary === "string")), "every result has a verdict, a basis and a summary");
ok(all.every((a) => a.score >= 0 && a.score <= 100), "simulation score is 0-100");

// ---- exports
let bad = 0, missing = 0;
ex.forEach((d, i) => {
  const plan = C.plan({ nodes: d.nodes, edges: d.edges, scenario: d.scenario, slo: d.slo, requirements: d.requirements }, { trafficMult: 1, provider: "aws", priority: "balanced", uptime: 99.9, users: 0, envs: { dev: true, staging: true } });
  const ctx = { doc: d, lint: L.lint(d, {}), plan: plan.error ? null : plan, scen: all[i], docs: DOCS.D, hash: "h" + i, stamp: "2026-10-02" };
  EX.DOCS.forEach((k) => { const md = EX.generate(k.key, ctx); if (!md || md.length < 200 || /undefined|NaN|\[object Object\]/.test(md)) bad++; });
  const h = EX.generate("hld", ctx); if (!d.nodes.every((n) => h.includes((n.props && n.props.name) || S.BY_ID[n.type].name))) missing++;
});
ok(bad === 0, `all ${EX.DOCS.length} documents generate cleanly for every example`);
ok(missing === 0, "the HLD lists every component on the canvas");
const c1 = doc([["c", "client"], ["g", "apigw"], ["a", "app"], ["q", "queue"], ["w", "worker"], ["d", "postgres"]], [["c", "g"], ["g", "a", { api: "POST /v1/orders", protocol: "HTTPS" }], ["a", "q", { mode: "async", api: "order.created" }], ["q", "w"], ["w", "d"]]);
const ctx1 = { doc: c1, lint: L.lint(c1), plan: null, scen: X.runAll(c1), docs: DOCS.D, hash: "x", stamp: "s" };
const apiMd = EX.generate("api", ctx1), evMd = EX.generate("events", ctx1), seq = EX.generate("sequence", ctx1), hld = EX.generate("hld", ctx1);
ok(/`\/v1\/orders` \| bearer \| with Idempotency-Key \| on canvas/.test(apiMd) && /openapi: 3\.1\.0/.test(apiMd), "API plan uses the wire's recorded endpoint and includes an OpenAPI skeleton");
ok(/`order\.created`/.test(evMd) && /NO DLQ/.test(evMd), "event contracts use the recorded event name and flag the missing DLQ");
ok(/sequenceDiagram/.test(seq) && /POST \/v1\/orders/.test(seq), "sequence diagrams follow the drawn path with contract names");
ok(/```mermaid\nflowchart LR/.test(hld) && /Modular monolith/.test(hld), "HLD has the diagram and the style recommendation");
ok(/High-level design/.test(EX.all(ctx1)) && /Disaster recovery plan/.test(EX.all(ctx1)), "the full package contains every document");

console.log(fails ? `${fails} studio check(s) failed` : "all studio checks passed");
process.exit(fails ? 1 : 0);
