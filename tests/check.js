// Calibration and behaviour checks for the Architecture Lab engine. Run: node lab-tests/check.js
const E = require("../engine.js"), LV = require("../levels.js");
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const line = (l, g) => `L${l.id} ${l.title.padEnd(28)} stars=${g.stars} normal(p95=${g.normal.p95.toFixed(0)}ms av=${(g.normal.availability*100).toFixed(2)}%) stress(p95=${g.stress.p95.toFixed(0)}ms av=${(g.stress.availability*100).toFixed(2)}%) cost=$${g.stress.cost}/${l.slo.budget} bottleneck=${g.stress.bottleneck.tier}@${g.stress.bottleneck.util.toFixed(2)}`;
for (const l of LV) {
  const naive = E.grade(l, E.defaults());
  const ref = E.grade(l, l.ref);
  console.log("naive ", line(l, naive));
  console.log("ref   ", line(l, ref));
  ok(ref.stars === 3, `level ${l.id}: reference solution earns 3 stars`);
  ok(l.id === 1 ? true : naive.stars < 3, `level ${l.id}: doing nothing does not earn 3 stars`);
}
// determinism
const a = JSON.stringify(E.simulate(LV[3], LV[3].ref)), b = JSON.stringify(E.simulate(LV[3], LV[3].ref));
ok(a === b, "same input gives identical result");
// over-engineering on level 1 must fail the budget
const big = E.grade(LV[0], { lb: "ha", app: { n: 8 }, cache: { tier: "l", nodes: 3 }, db: { shards: 2, replicas: 2, ha: true } });
ok(big.stars < 3 && !big.underBudget, "level 1: over-building blows the budget");
console.log(fail ? `\n${fail} FAILED` : "\nall checks passed");
process.exit(fail ? 1 : 0);
