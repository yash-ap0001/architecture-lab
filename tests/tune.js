// Finds the cheapest 3-star design for each level by seeded random search. Usage: node lab-tests/tune.js [levelId]
const E = require("../engine.js"), LV = require("../levels.js");
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const only = process.argv[2] ? +process.argv[2] : null;
function sample(l) {
  const has = (k) => l.allowed.includes(k);
  const peak = Math.max(...E.trafficCurve(l.load));
  const c = { cdn: has("cdn") && rnd() < 0.5, limiter: has("limiter") && rnd() < 0.5 ? Math.round(peak * pick([0.7, 0.85, 1, 1.2])) : 0,
    lb: has("lb") ? pick(["none", "single", "ha"]) : "none",
    app: { n: has("app") ? pick([1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 22, 26, 30, 35, 40, 50, 60]) : 1, auto: has("auto") && rnd() < 0.5 },
    cache: { tier: has("cache") ? pick(["none", "s", "m", "l"]) : "none", nodes: pick([1, 1, 2, 3, 4]), coalesce: has("coalesce") && rnd() < 0.6 },
    queue: { on: has("queue") && rnd() < 0.5, workers: pick([2, 4, 8, 12, 16, 24, 32]) },
    db: { shards: has("shards") ? pick([1, 1, 2, 3, 4, 6, 8]) : 1, replicas: has("replicas") ? pick([0, 1, 2, 3]) : 0, ha: has("ha") && rnd() < 0.5, salting: has("salting") && rnd() < 0.5 } };
  return c;
}
const out = {};
for (const l of LV) {
  if (only && l.id !== only) continue;
  let best = null, threeStars = 0;
  for (let i = 0; i < 150000; i++) {
    const c = sample(l);
    const g = E.grade(Object.assign({}, l, { slo: Object.assign({}, l.slo, { budget: 1e9 }) }), c);   // ignore budget while searching
    if (g.passNormal && g.passChaos) { threeStars++; if (!best || g.stress.cost < best.cost) best = { cost: g.stress.cost, cfg: E.normalize(c) }; }
  }
  console.log(`L${l.id} ${l.title}: feasible=${threeStars}/150000 cheapest=$${best ? best.cost : "none"}`);
  if (best) { out[l.id] = best; console.log("   ", JSON.stringify(best.cfg)); }
}
require("fs").writeFileSync(__dirname + "/tuned.json", JSON.stringify(out, null, 1));
