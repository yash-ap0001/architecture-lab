// Sizes every "?" in examples_more.js so each example meets its own goals at peak traffic, then rewrites the file.
// Run: node tools/size_examples.js
const fs = require("fs"), path = require("path");
const IV = require("../interview.js");
const S = require("../sim.js"), X = require("../examples_more.js");
const jobs = [["examples_more.js", X.LIST.filter((e) => !e.generated)], ["interview.js", IV.QUESTIONS.filter((z) => z.ref.nodes).map((z) => ({ name: z.title, nodes: z.ref.nodes, edges: z.ref.edges, scenario: z.ref.scenario, slo: z.ref.slo }))]];
let report = [];
for (const [fname, list] of jobs) {
const file = path.join(__dirname, "..", fname); let text = fs.readFileSync(file, "utf8");
for (const e of list) {
  const slots = []; const nodes = X.parseNodes(e.nodes); nodes.forEach((n, i) => Object.keys(n.props).forEach((k) => { if (n.props[k] === "?") slots.push({ id: n.id, k }); }));
  const vals = slots.map(() => 1), sizes = {};
  let best = null;
  for (let it = 0; it < 40; it++) {
    sizes[e.name] = vals;
    const g = X.build(e, S.BY_ID, sizes), r = S.run(g, e.scenario, []); if (r.error) { report.push(["ERROR", e.name, r.error]); break; }
    const hist = r.st.history, peak = {}; hist.forEach((h) => Object.entries(h.nodes).forEach(([id, v]) => { peak[id] = Math.max(peak[id] || 0, v.util || 0); }));
    const avail = r.summary.availability; best = { avail, p95: r.summary.p95, cost: r.summary.cost, peak };
    let changed = false;
    slots.forEach((s, i) => { const u = peak[s.id] || 0; if (u > 0.85) { vals[i] = Math.min(4000, Math.max(vals[i] + 1, Math.ceil(vals[i] * u / 0.7))); changed = true; } });
    if (!changed) break;
  }
  if (slots.length) { let i = 0; const ns = e.nodes.replace(/\?/g, () => String(vals[i++])); if (ns !== e.nodes) { const q = JSON.stringify(e.nodes); if (!text.includes(q)) { report.push(["NOFIND", e.name]); continue; } text = text.replace(q, JSON.stringify(ns)); } }
  if (best) report.push([best.avail >= 0.995 && best.p95 <= e.slo.p95 && best.cost <= e.slo.budget ? "ok" : "CHECK", e.name, `avail ${(best.avail * 100).toFixed(2)}% p95 ${Math.round(best.p95)}ms (goal ${e.slo.p95}) cost $${Math.round(best.cost)} (budget ${e.slo.budget})`]);
}
fs.writeFileSync(file, text);
}
console.log(report.filter((r) => r[0] !== "ok").map((r) => r.join(" | ")).join("\n")); console.log(report.filter((r) => r[0] === "ok").length + " ok of " + report.length);
