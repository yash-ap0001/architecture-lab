// Prints how the starter and the reference design score for each mission. Usage: node tests/missions_tune.js [id]
const S = require("../sim.js"), M = require("../missions.js");
const strip = (g) => ({ nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, props: n.props })), edges: g.edges });
for (const m of M.MISSIONS) {
  if (process.argv[2] && m.id !== process.argv[2]) continue;
  for (const [label, g] of [["starter", m.starter()], ["reference", m.reference()]]) {
    const r = M.evaluate(S, strip(g), m);
    if (r.error) { console.log(m.id, label, r.error); continue; }
    console.log(`${m.title.padEnd(28)} ${label.padEnd(9)} score ${String(r.score).padStart(3)} stars ${r.stars} ${r.verdict} | cost ${Math.round(r.R.all.cost)}`);
    r.criteria.forEach((c) => console.log(`     ${c.pass ? "PASS" : "fail"} ${String(c.points).padStart(2)}  ${c.label}  [${c.detail}]`));
  }
}
