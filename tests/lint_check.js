/* Architecture linter rules. Run: node tests/lint_check.js */
global.self = global;
const S = require("../sim.js");
S.extend(require("../catalog_more.js")); S.extend(require("../catalog_more2.js"));
const L = require("../lint.js"), P = require("../presets.js"), X = require("../examples_more.js");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };
const doc = (nodes, edges, extra) => Object.assign({ nodes: nodes.map(([id, type, props]) => ({ id, type, props: props || {} })), edges: edges.map(([from, to, p]) => Object.assign({ from, to }, p || {})), slo: { p95: 200, avail: 99.9, budget: 5000 }, scenario: { base: 1000 } }, extra || {});
const ids = (d, o) => L.lint(d, o).findings.map((f) => f.id);
const has = (d, id, o) => ids(d, o).includes(id);

ok(has(doc([["c", "client"], ["db", "postgres"]], [["c", "db"]]), "public-db"), "client wired straight to a database is critical");
ok(has(doc([["c", "client"], ["a", "app"], ["db", "postgres"]], [["c", "a"], ["a", "db"]]), "unprotected-api"), "client calling a service with no gateway is flagged");
ok(!has(doc([["c", "client"], ["g", "apigw"], ["a", "app"]], [["c", "g"], ["g", "a"]]), "unprotected-api"), "a gateway in front clears the unprotected-API finding");
ok(has(doc([["c", "client"], ["g", "apigw"], ["a", "app"]], [["c", "g"], ["g", "a"]]), "no-authn"), "no identity provider is flagged");
ok(!has(doc([["c", "client"], ["g", "apigw"], ["a", "app"]], [["c", "g"], ["g", "a"]]), "no-rate-limit"), "an API gateway counts as rate limiting");
ok(has(doc([["c", "client"], ["l", "lb"], ["a", "app"]], [["c", "l"], ["l", "a"]]), "no-rate-limit"), "a plain load balancer does not rate-limit");
ok(has(doc([["c", "client"], ["l", "lb"], ["a", "app"], ["d", "postgres"]], [["c", "l"], ["l", "a"], ["a", "d"]]), "no-backup"), "databases without a backup vault are flagged");
ok(!has(doc([["c", "client"], ["l", "lb"], ["a", "app"], ["d", "postgres"], ["b", "backup"]], [["c", "l"], ["l", "a"], ["a", "d"]]), "no-backup"), "a backup vault clears it");
ok(has(doc([["c", "client"], ["l", "lb"], ["a", "app"], ["d", "postgres"]], [["c", "l"], ["l", "a"], ["a", "d"]]), "spof-db"), "database without HA or replica is a single point of failure");
ok(!has(doc([["c", "client"], ["l", "lb"], ["a", "app"], ["d", "postgres", { ha: true }]], [["c", "l"], ["l", "a"], ["a", "d"]]), "spof-db"), "HA clears it");
ok(has(doc([["c", "client"], ["a", "app"], ["q", "queue"], ["w", "worker"]], [["c", "a"], ["a", "q"], ["q", "w"]]), "no-dlq"), "queue without a dead-letter queue is flagged");
ok(!has(doc([["c", "client"], ["a", "app"], ["q", "queue"], ["w", "worker"], ["x", "dlq"]], [["c", "a"], ["a", "q"], ["q", "w"], ["q", "x"]]), "no-dlq"), "a dead-letter queue clears it");
ok(has(doc([["c", "client"], ["a", "app"], ["b", "app"]], [["c", "a"], ["a", "b"], ["b", "a"]]), "cycle"), "services calling each other synchronously are a cycle");
ok(!has(doc([["c", "client"], ["a", "app"], ["q", "kafka"], ["b", "app"]], [["c", "a"], ["a", "q"], ["q", "b"], ["b", "q"], ["q", "a"]]), "cycle"), "a loop through an event bus is not a dependency cycle");
ok(has(doc([["c", "client"], ["a", "app"], ["b", "app"], ["d", "postgres"]], [["c", "a"], ["c", "b"], ["a", "d"], ["b", "d"]]), "shared-db"), "two services writing one database is an ownership conflict");
ok(has(doc([["c", "client"], ["a", "app"], ["z", "app"]], [["c", "a"]]), "unused"), "unreachable services are flagged as unused");
ok(has(doc([["c", "client"], ["a", "app"], ["m", "llm"]], [["c", "a"], ["a", "m"]]), "ai-injection"), "a model without guardrails is flagged (LLM01)");
ok(!has(doc([["c", "client"], ["a", "app"], ["g", "guardrails"], ["m", "llm"]], [["c", "a"], ["a", "g"], ["g", "m"]]), "ai-injection"), "guardrails clear it");
const agent = doc([["c", "client"], ["a", "app"], ["g", "guardrails"], ["ag", "agent"]], [["c", "a"], ["a", "g"], ["g", "ag"]]);
ok(has(agent, "ai-tools") && has(agent, "ai-approval"), "an agent without a tool gateway or human approval is flagged (LLM06)");
ok(has(doc([["c", "client"], ["a", "app"]], [["c", "a", { tls: false }]]), "plaintext"), "public traffic with TLS off is critical");
ok(has(doc([["c", "client"], ["g", "apigw"], ["a", "app"]], [["c", "g"], ["g", "a"]], { requirements: { compliance: ["hipaa"] } }), "compliance-hipaa"), "a declared framework checks for audit, keys, auth and backups");
ok(has(doc([["c", "client"], ["a", "app"]], [["c", "a"]]), "over-budget", { monthlyCost: 9000 }), "a cost over the budget is flagged");
const severities = L.lint(doc([["c", "client"], ["db", "postgres"], ["a", "app"]], [["c", "db"], ["c", "a"]])).findings.map((f) => L.SEV_ORDER[f.sev]);
ok(severities.every((v, i) => i === 0 || severities[i - 1] <= v), "findings are sorted most severe first");
ok(L.lint(doc([["c", "client"], ["a", "app"]], [["c", "a"]])).findings.every((f) => f.ref && f.fix && f.basis && f.confidence > 0), "every finding has a fix, a reference, a basis and a confidence");

let falseCycles = 0, total = 0;
const all = P.PRESETS.map((p) => p.build()).concat(X.LIST.map((e) => X.build(e, S.BY_ID)));
for (const d of all) { const r = L.lint(d); total++; if (r.findings.some((f) => f.id === "cycle")) falseCycles++; }
ok(total > 100 && falseCycles === 0, `${total} built-in designs lint cleanly without false cycle reports`);

console.log(fails ? `\n${fails} FAILED` : "\nall lint checks passed");
process.exit(fails ? 1 : 0);
