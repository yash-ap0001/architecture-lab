/* Budget & cost plan checks: every built-in design gets a sane plan, and the lint rules fire. */
global.self = global;
const S = require("../sim.js");
try { S.extend(require("../catalog_more.js")); } catch (e) { /* optional */ }
const P = require("../presets.js"), C = require("../cost.js"), X = require("../examples_more.js");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL:", msg); } };
const prep = (d) => Object.assign(d, { scenario: Object.assign({}, S.DEFAULT_SCENARIO, d.scenario || {}), slo: d.slo || { budget: 5000 } });

const docs = P.PRESETS.map((p) => [p.id, p.build()]).concat(X.LIST.map((e, i) => [e.name || "x" + i, X.build(e, S.BY_ID)]));
for (const [id, d] of docs) {
  const r = C.plan(prep(d), {});
  if (r.error) { ok(false, `${id}: ${r.error}`); continue; }
  ok(Object.values(r.totals).every((v) => isFinite(v) && v >= 0), `${id}: totals finite and non-negative`);
  ok(r.totals.prod >= r.totals.growth - 1, `${id}: production HA costs at least the as-drawn design`);
  ok(r.totals.dr >= r.totals.prod, `${id}: DR costs at least production`);
  const [a, b, c] = r.options;
  ok(a.low <= b.low + 1 && b.low <= c.low + 1, `${id}: lean <= balanced <= enterprise`);
  ok(r.components.length === d.nodes.length, `${id}: every node priced, including level 2/3 detail`);
}

const graph = (nodes, edges, extra) => prep(Object.assign({ nodes: nodes.map(([id, type, props]) => ({ id, type, props: props || {} })), edges: edges.map(([from, to]) => ({ from, to })) }, extra || {}));
const ids = (r) => r.lint.map((x) => x.id);

let r = C.plan(graph([["c", "client"], ["db", "postgres"]], [["c", "db"]]), {});
ok(ids(r).includes("public-db"), "public database is flagged");
ok(ids(r).includes("spof-db"), "database without replica is flagged");

r = C.plan(graph([["c", "client"], ["a", "app"], ["k", "kafka"], ["w", "worker"]], [["c", "a"], ["a", "k"], ["k", "w"]], { scenario: { base: 50 } }), {});
ok(ids(r).includes("overeng-stream"), "Kafka at low traffic is flagged as over-engineering");
ok(r.alternatives.some((x) => /queue/i.test(x.alt)), "Kafka gets a managed-queue alternative");

r = C.plan(graph([["c", "client"], ["a", "app", { inst: 40 }]], [["c", "a"]], { slo: { budget: 50 } }), {});
ok(ids(r).includes("over-budget"), "budget guardrail fires");

r = C.plan(graph([["c", "client"], ["a", "app"], ["x", "app", { __aiLevel: 2, __aiParent: "a", name: "Inner" }]], [["c", "a"], ["a", "x"]]), {});
ok(r.levels.join() === "1,2" && r.components.find((x) => x.id === "x").parent, "level 2 detail is priced and linked to its parent");

ok(C.plan(graph([["a", "app"]], []), {}).error, "a canvas without a client explains why it cannot be sized");

console.log(fails ? `${fails} cost checks failed` : "all cost checks passed");
process.exit(fails ? 1 : 0);
