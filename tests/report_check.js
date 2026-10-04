/* Readiness level, score and report. Run: node tests/report_check.js */
global.self = global;
const S = require("../sim.js");
S.extend(require("../catalog_more.js")); S.extend(require("../catalog_more2.js"));
const R = require("../report.js"), L = require("../lint.js"), C = require("../cost.js"), DF = require("../diff.js"), D = require("../catalog_docs.js");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };

const N = (id, type, props) => ({ id, type, props: props || {} });
// A design that passes every blocking rule: gateway, auth, HA db with backup, KMS, monitoring.
const good = {
  name: "Clean API", scenario: Object.assign({}, S.DEFAULT_SCENARIO, { base: 300 }), slo: { p95: 400, avail: 99, budget: 20000 }, requirements: { complianceNone: true },
  nodes: [N("c", "client"), N("g", "apigw", { ha: true }), N("au", "auth", { inst: 2 }), N("a", "app", { inst: 3, auto: true }), N("d", "postgres", { ha: true, replicas: 1 }), N("b", "backup"), N("k", "vault"), N("m", "metrics")],
  edges: [{ from: "c", to: "g" }, { from: "g", to: "au" }, { from: "au", to: "a" }, { from: "a", to: "d" }],
};
const ctxFor = (doc, versions, brief) => {
  const lint = L.lint(doc), plan = C.plan(doc, {}), run = S.run({ nodes: doc.nodes, edges: doc.edges }, doc.scenario, []);
  const normal = run.error ? null : { p95: run.summary.p95, availability: run.summary.availability, cost: run.summary.cost };
  const drill = S.run({ nodes: doc.nodes, edges: doc.edges }, doc.scenario, [{ tick: 25, until: 26, type: "dbDown" }]);
  const chaos = drill.error ? null : { score: 85, summary: drill.summary, events: ["dbDown"] };
  return { doc, hash: DF.hash(doc), lint, plan, normal, chaos, versions: versions || [], brief: brief || "" };
};

let ctx = ctxFor(good);
let a = R.assess(ctx);
ok(ctx.lint.blocking === 0, "the clean design has no blocking findings (" + ctx.lint.findings.map((f) => f.id).join(",") + ")");
ok(a.level === 0, "without an approval the level stays Draft");
ok(a.blocking.some((b) => /approved version/.test(b)), "missing approval is listed as blocking");

const approved = [{ hash: DF.hash(good), approvedAt: "2026-10-02T10:00:00Z", approvedBy: "Asha" }];
a = R.assess(ctxFor(good, approved, "A small API for internal tools with a few hundred requests per second."));
ok(a.level === 2, `approved + goals met + drills >= 80 reaches Simulation validated (got ${a.level}: ${a.blocking.join(" | ")})`);
ok(a.score >= 90 && a.score <= 100, "a complete, approved design scores 90-100 (" + a.score + ")");

const changed = JSON.parse(JSON.stringify(good)); changed.nodes.push(N("x", "cache", { name: "Cache" })); changed.edges.push({ from: "a", to: "x" });
a = R.assess(ctxFor(changed, approved));
ok(a.level === 0 && a.stale && a.blocking.some((b) => /changed after the last approval/.test(b)), "editing the canvas invalidates the approval");

const risky = JSON.parse(JSON.stringify(good)); risky.edges.push({ from: "c", to: "d" });
a = R.assess(ctxFor(risky, [{ hash: DF.hash(risky), approvedAt: "2026-10-02T10:00:00Z", approvedBy: "Asha" }]));
ok(a.level === 0 && a.blocking.some((b) => /^Critical/.test(b)), "a critical finding blocks level 1 even with approval");

const noCompliance = JSON.parse(JSON.stringify(good)); delete noCompliance.requirements;
ok(R.assess(ctxFor(noCompliance)).blocking.some((b) => /Compliance needs are not recorded/.test(b)), "unrecorded compliance needs are blocking");

ok(R.LEVELS.length === 6 && R.LEVELS[5].name === "Production proven", "six readiness levels from Draft to Production proven");
ctx = ctxFor(good, approved, "brief"); a = R.assess(ctx);
const md = R.markdown(Object.assign({}, ctx, { a, byId: S.BY_ID, docs: D.D, stamp: "2026-10-02" }));
ok(md.includes(ctx.hash) && md.includes("Required human approvals") && md.includes("High-level design") && md.includes("Test plan"), "the report has the fingerprint, approvals, HLD and test plan");
ok(!/\b(100% perfect|fully certified|production certified)\b/i.test(md) && /not a certification/.test(md), "the report never claims certification");
ok(good.nodes.every((n) => md.includes("| " + ((n.props && n.props.name) || S.BY_ID[n.type].name) + " |")), "every component has a row in the HLD table");

console.log(fails ? `\n${fails} FAILED` : "\nall report checks passed");
process.exit(fails ? 1 : 0);
