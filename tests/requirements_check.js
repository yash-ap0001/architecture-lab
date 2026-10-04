/* Requirements intake. Run: node tests/requirements_check.js */
global.self = global;
const S = require("../sim.js");
S.extend(require("../catalog_more.js")); S.extend(require("../catalog_more2.js"));
const R = require("../requirements.js");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };
const base = { name: "T", nodes: [{ id: "c", type: "client", props: {} }, { id: "a", type: "app", props: {} }, { id: "d", type: "postgres", props: {} }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }], scenario: Object.assign({}, S.DEFAULT_SCENARIO), slo: { p95: 300, avail: 99.5, budget: 5000 } };

let st = R.state(base);
ok(st.confirmedCount === 0 && st.questions.length >= 8, `a fresh design asks the essential questions (${st.questions.length})`);
ok(st.questions.some((q) => q.key === "compliance"), "compliance is asked when not recorded");
ok(!st.fields.some((f) => f.key === "aiRequestsDay"), "AI questions only appear when the canvas has AI parts");
ok(st.assumptions.some((a) => /Peak requests per second: 1000 \(assumed\)/.test(a)), "unanswered values are listed as assumptions");

const withAI = JSON.parse(JSON.stringify(base)); withAI.nodes.push({ id: "m", type: "llm", props: {} });
ok(R.state(withAI).questions.some((q) => q.key === "aiRequestsDay"), "an LLM on the canvas adds the AI-usage question");

const d = R.apply(base, { idea: "A booking app for clinics", rps: 250, availability: 99.9, budget: 3000, cloud: "aws", dataSensitivity: "health", readPct: 80 });
ok(d.scenario.base === 250 && d.slo.avail === 99.9 && d.slo.budget === 3000 && Math.abs(d.scenario.readFrac - 0.8) < 1e-9, "answers sync into traffic and goals");
ok(base.scenario.base === S.DEFAULT_SCENARIO.base, "the original document is not changed");
st = R.state(d);
ok(st.fields.find((f) => f.key === "rps").confirmed && !st.questions.some((q) => q.key === "rps"), "a confirmed answer is no longer a question");
ok(R.suggestedCompliance(d).includes("hipaa") && R.suggestedCompliance(d).includes("gdpr"), "health data suggests HIPAA and GDPR");
ok(/booking app for clinics/.test(R.brief(d)) && /250 requests per second/.test(R.brief(d)), "a brief for the AI Architect is built from confirmed answers");
const cleared = R.apply(d, { rps: "" });
ok(!R.state(cleared).fields.find((f) => f.key === "rps").confirmed, "clearing an answer turns it back into an assumption");

console.log(fails ? `\n${fails} FAILED` : "\nall requirements checks passed");
process.exit(fails ? 1 : 0);
