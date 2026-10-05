// Sizes the "Classic interview systems" examples so each one meets its own goals in the simulator.
// Input: tools/classics_draft.js (designs with rough sizes). Output: tools/classics_sized.txt, ready to paste into examples_more.js.
// Usage: node tools/size_classics.js
const S = require("../sim.js"), X = require("../examples_more.js"), DRAFT = require("./classics_draft.js");
const fs = require("fs");

function good(g, r) { return !r.error && r.summary.availability >= 0.9955 && r.summary.p95 <= g.slo.p95 * 0.92; }
function peaks(r) { const p = {}; r.st.history.forEach((h) => Object.entries(h.nodes || {}).forEach(([id, v]) => { p[id] = Math.max(p[id] || 0, v.util || 0); })); return p; }
function bump(n, readFrac) {
  const cls = S.BY_ID[n.type].cls, p = n.props;
  if (cls === "db") { if (readFrac >= 0.7 && (p.replicas || 0) < 5) p.replicas = (p.replicas || 0) + 1; else p.shards = (p.shards || 1) + 1; }
  else if (cls === "queue") p.workers = Math.ceil((p.workers || 1) * 1.5) + 1;
  else p.inst = Math.ceil((p.inst || 1) * 1.4) + 1;
}
const fmt = (nodes) => nodes.map((n) => `${n.id}:${n.type}` + Object.entries(n.props).map(([k, v]) => v === true ? ` ${k}` : ` ${k}=${k === "name" ? String(v).replace(/ /g, "_") : v}`).join("")).join("; ");

const out = [], problems = [];
for (const d of DRAFT) {
  const nodes = X.parseNodes(d.nodes);
  const unknown = nodes.filter((n) => !S.BY_ID[n.type]).map((n) => n.type);
  if (unknown.length) { problems.push(`${d.name}: unknown component ${unknown.join(", ")}`); continue; }
  const make = (noE2E) => X.build({ cat: d.cat, name: d.name, notice: d.notice, scenario: d.scenario, slo: d.slo, nodes: fmt(nodes), edges: d.edges, noE2E }, S.BY_ID);
  let g, r, tries = 0;
  try {
    for (; tries < 80; tries++) {
      g = make(false); r = S.run(g, g.scenario, []);
      if (r.error) break;
      if (good(g, r)) break;
      const pk = peaks(r), core = nodes.filter((n) => S.BY_ID[n.type].cls !== "source").sort((a, b) => (pk[b.id] || 0) - (pk[a.id] || 0));
      if (!core.length || (pk[core[0].id] || 0) < 0.5) { core.forEach((n) => { if ((pk[n.id] || 0) > 0.3) bump(n, d.scenario.readFrac); }); if (tries > 40) break; }
      else bump(core[0], d.scenario.readFrac);
    }
  } catch (e) { problems.push(`${d.name}: ${e.message}`); continue; }
  if (r.error || !good(g, r)) { problems.push(`${d.name}: ${r.error || `avail ${(r.summary.availability * 100).toFixed(2)}% p95 ${Math.round(r.summary.p95)} ms (goal ${g.slo.p95})`} after ${tries} tries`); continue; }
  // wiring rules, as in tests/examples_check.js
  const bad = g.edges.map((e) => { const A = g.nodes.find((n) => n.id === e.from), B = g.nodes.find((n) => n.id === e.to), ca = S.BY_ID[A.type].cls, cb = S.BY_ID[B.type].cls; return cb === "source" || ["db", "store", "external"].includes(ca) ? `${A.type}>${B.type}` : ""; }).filter(Boolean);
  if (bad.length) { problems.push(`${d.name}: wiring ${bad.join(", ")}`); continue; }
  const core = make(true), cost = S.run(core, core.scenario, []).summary.cost, budget = Math.ceil(cost * 1.25 / 500) * 500;
  const sc = d.scenario, extra = Object.keys(sc).filter((k) => !["base", "shape", "readFrac"].includes(k));
  out.push(`  ex(${JSON.stringify(d.cat)}, ${JSON.stringify(d.name)}, ${JSON.stringify(d.notice)}, sc(${sc.base}, ${Math.round(sc.readFrac * 100)}, ${JSON.stringify(sc.shape)}${extra.length ? ", " + JSON.stringify(Object.fromEntries(extra.map((k) => [k, sc[k]]))) : ""}), slo(${d.slo.p95}, ${d.slo.avail}, ${budget}),\n    ${JSON.stringify(fmt(nodes))}, ${JSON.stringify(d.edges)});`);
  console.log(`ok   ${d.name}: ${tries} bumps, p95 ${Math.round(r.summary.p95)}/${g.slo.p95} ms, avail ${(r.summary.availability * 100).toFixed(2)}%, core cost $${Math.round(cost)} -> budget $${budget}`);
}
fs.writeFileSync(__dirname + "/classics_sized.txt", out.join("\n") + "\n");
console.log(`\n${out.length} sized, ${problems.length} problems`); problems.forEach((p) => console.log("PROBLEM", p));
