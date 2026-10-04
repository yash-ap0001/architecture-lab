/* One-click fixes, goal optimisation and the three options. Run: node tests/fixes_check.js */
global.self = global;
const S = require("../sim.js");
S.extend(require("../catalog_more.js")); S.extend(require("../catalog_more2.js"));
const F = require("../fixes.js"), L = require("../lint.js"), C = require("../cost.js"), P = require("../presets.js"), X = require("../examples_more.js");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };
const doc = (nodes, edges, extra) => Object.assign({ name: "T", nodes: nodes.map(([id, type, props], i) => ({ id, type, x: 100 + i * 180, y: 200, props: props || {} })), edges: edges.map(([from, to, p]) => Object.assign({ from, to }, p || {})), slo: { p95: 300, avail: 99.5, budget: 50000 }, scenario: Object.assign({}, S.DEFAULT_SCENARIO, { base: 300 }) }, extra || {});
const fixed = (d, id) => {
  const f = L.lint(d).findings.find((x) => x.id === id); if (!f) return "finding not raised";
  const r = F.applyFix(d, f); if (!r.changes.length) return "fix did nothing";
  if (L.lint(r.doc).findings.some((x) => x.id === id)) return "finding still there after the fix";
  if (S.run({ nodes: r.doc.nodes, edges: r.doc.edges }, r.doc.scenario, []).error) return "fixed design does not simulate";
  if (JSON.stringify(d) === JSON.stringify(r.doc)) return "original was mutated";
  return "";
};
const cases = [
  ["public-db", doc([["c", "client"], ["a", "app"], ["d", "postgres"]], [["c", "a"], ["c", "d"], ["a", "d"]])],
  ["unprotected-api", doc([["c", "client"], ["a", "app"]], [["c", "a"]])],
  ["plaintext", doc([["c", "client"], ["g", "apigw"], ["a", "app"]], [["c", "g", { tls: false }], ["g", "a"]])],
  ["no-authn", doc([["c", "client"], ["g", "apigw"], ["a", "app"]], [["c", "g"], ["g", "a"]])],
  ["no-authz", doc([["c", "client"], ["g", "apigw"], ["u", "auth"], ["a", "app"]], [["c", "g"], ["g", "u"], ["u", "a"]])],
  ["no-rate-limit", doc([["c", "client"], ["l", "lb"], ["a", "app"]], [["c", "l"], ["l", "a"]])],
  ["no-kms", doc([["c", "client"], ["l", "lb"], ["a", "app"], ["d", "postgres"]], [["c", "l"], ["l", "a"], ["a", "d"]])],
  ["spof-db", doc([["c", "client"], ["l", "lb"], ["a", "app"], ["d", "postgres"]], [["c", "l"], ["l", "a"], ["a", "d"]])],
  ["spof-service", doc([["c", "client"], ["l", "lb"], ["a", "app"]], [["c", "l"], ["l", "a"]])],
  ["no-backup", doc([["c", "client"], ["l", "lb"], ["a", "app"], ["d", "postgres"]], [["c", "l"], ["l", "a"], ["a", "d"]])],
  ["no-observability", doc([["c", "client"], ["l", "lb"], ["a", "app"]], [["c", "l"], ["l", "a"]])],
  ["no-dlq", doc([["c", "client"], ["a", "app"], ["q", "queue"], ["w", "worker"]], [["c", "a"], ["a", "q"], ["q", "w"]])],
  ["retry-storm", doc([["c", "client"], ["a", "app", { retries: 2 }]], [["c", "a"]])],
  ["unused", doc([["c", "client"], ["a", "app"], ["z", "app"]], [["c", "a"]])],
  ["egress-store", doc([["c", "client"], ["o", "object"], ["a", "app"]], [["c", "o"], ["c", "a"]])],
  ["overeng-stream", doc([["c", "client"], ["a", "app"], ["k", "kafka"], ["w", "worker"]], [["c", "a"], ["a", "k"], ["k", "w"]], { scenario: Object.assign({}, S.DEFAULT_SCENARIO, { base: 50 }) })],
  ["ai-injection", doc([["c", "client"], ["a", "app"], ["m", "llm"]], [["c", "a"], ["a", "m"]])],
  ["ai-tools", doc([["c", "client"], ["a", "app"], ["ag", "agent"], ["p", "payment"]], [["c", "a"], ["a", "ag"], ["ag", "p"]])],
  ["ai-approval", doc([["c", "client"], ["a", "app"], ["ag", "agent"]], [["c", "a"], ["a", "ag"]])],
  ["ai-cost", doc([["c", "client"], ["a", "app"], ["m", "llm"]], [["c", "a"], ["a", "m"]])],
  ["compliance-hipaa", doc([["c", "client"], ["g", "apigw"], ["a", "app"], ["d", "postgres"]], [["c", "g"], ["g", "a"], ["a", "d"]], { requirements: { compliance: ["hipaa"] } })],
];
cases.forEach(([id, d]) => { const why = fixed(d, id); ok(!why, `fix for ${id} clears it` + (why ? `: ${why}` : "")); });

const agentDoc = cases.find((c) => c[0] === "ai-tools")[1], ra = F.applyFix(agentDoc, L.lint(agentDoc).findings.find((f) => f.id === "ai-tools")).doc;
ok(!ra.edges.some((e) => e.from === "ag" && e.to === "p") && ra.edges.some((e) => e.to === "p"), "the agent reaches the payment tool only through the tool gateway");

const all = P.PRESETS.map((p) => [p.id, p.build()]).concat(X.LIST.map((e) => [e.name, X.build(e, S.BY_ID)]));
let cleared = 0, before = 0, after = 0, broken = [], orderBad = [];
for (const [id, d0] of all) {
  const d = Object.assign({ scenario: Object.assign({}, S.DEFAULT_SCENARIO), slo: { p95: 300, avail: 99.5, budget: 99999 } }, d0);
  const b = L.lint(d).blocking, r = F.fixBlocking(d), a = L.lint(r.doc).blocking;
  before += b; after += a; if (a === 0) cleared++;
  if (S.run({ nodes: r.doc.nodes, edges: r.doc.edges }, d.scenario, []).error) broken.push(id);
  const o = F.options(d);
  if (o.some((x) => S.run({ nodes: x.doc.nodes, edges: x.doc.edges }, d.scenario, []).error)) broken.push(id + " (options)");
  const cost = o.map((x) => C.sizeAndPrice({ nodes: x.doc.nodes, edges: x.doc.edges }, d.scenario, d.scenario.base || 1000, "asis", false).total);
  if (!(cost[0] <= cost[1] + 1 && cost[1] <= cost[2] + 1)) orderBad.push(id + " " + cost.map(Math.round).join("/"));
}
ok(!broken.length, `fixed designs and all three options still simulate (${all.length} designs)` + (broken.length ? ": " + broken.slice(0, 5).join(", ") : ""));
ok(after === 0, `"fix blocking" clears every blocking finding across built-in designs (${before} → ${after}; ${cleared}/${all.length} fully cleared)`);
ok(!orderBad.length, "option costs are ordered lean <= balanced <= enterprise" + (orderBad.length ? ": " + orderBad.slice(0, 5).join("; ") : ""));
const o = F.options(cases[1][1]);
ok(o.length === 3 && o.every((x) => x.doc.nodes.length >= 2 && x.changes.length >= 0 && x.note), "three named options with their changes");
ok(L.lint(o[0].doc).findings.every((f) => f.id !== "unprotected-api" && f.id !== "no-authn"), "the lean option keeps the security essentials");

console.log(fails ? `\n${fails} FAILED` : "\nall fix checks passed");
process.exit(fails ? 1 : 0);
