// Fuzz the general engine: random graphs must never throw and never produce NaN/Infinity/negative values.
const S = require("../sim.js");
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; const pick = (a) => a[Math.floor(rnd() * a.length)];
const types = S.CATALOG.map((c) => c.id); let bad = 0, runs = 0, errors = 0; const problems = new Set();
for (let i = 0; i < 4000; i++) {
  const n = 1 + Math.floor(rnd() * 12), nodes = [], edges = [];
  for (let k = 0; k < n; k++) nodes.push({ id: "n" + k, type: pick(types), props: rnd() < 0.25 ? { region: pick(["us", "eu", "ap", ""]), mode: pick(["primary", "replica", "active"]), peer: "n" + Math.floor(rnd() * n), autoPromote: rnd() < 0.5, retries: pick([0, 2]), breaker: rnd() < 0.3 } : rnd() < 0.3 ? { inst: pick([0, 1, 3, 50]), share: pick([0, 1, 5]), workers: pick([0, 1, 9]), shards: pick([0, 1, 4]), replicas: pick([0, 2]), hit: pick([0, 0.5, 1, 1.5]), limit: pick([0, 1, 1000]), ratio: pick([0, 0.5, 2]) } : {} });
  if (rnd() < 0.85) nodes[0].type = pick(["client", "mobile", "browser"]);
  const m = Math.floor(rnd() * 20); for (let k = 0; k < m; k++) edges.push({ from: "n" + Math.floor(rnd() * n), to: "n" + Math.floor(rnd() * (n + 1)), w: pick([undefined, 0, 1, 5, -2]), fan: rnd() < 0.15, only: pick(["", "r", "w", "s", "x"]), failover: rnd() < 0.2 });
  const sc = { base: pick([0, 1, 500, 20000, 1e7]), shape: pick(["steady", "ramp", "spike", "diurnal"]), spikeX: pick([1, 5]), readFrac: pick([0, 0.5, 1]), staticFrac: pick([0, 0.5, 1]), botFrac: pick([0, 0.3, 0.9]), skew: pick([1, 3]) };
  const ev = rnd() < 0.5 ? [{ tick: 30, until: 60, type: pick(["dbDown", "cacheFlush", "lbDown", "azOut", "slowDb", "burst", "region:us", "region:eu"]) }] : [];
  let r; try { r = S.run({ nodes, edges }, sc, ev); } catch (e) { errors++; problems.add("THROW " + e.message.slice(0, 80)); continue; }
  if (r.error) continue; runs++;
  const chk = (v, what) => { if (!Number.isFinite(v) || v < -1e-9) { bad++; problems.add(`${what}=${v}`); } };
  for (const h of r.st.history) { chk(h.p95, "p95"); chk(h.ok, "ok"); chk(h.cost, "cost"); chk(h.rps, "rps"); if (h.ok > 1 + 1e-9) { bad++; problems.add("ok>1 " + h.ok); } for (const v of Object.values(h.nodes)) { chk(v.util, "util"); chk(v.load, "load"); chk(v.ms, "ms"); } }
  const s = r.summary; chk(s.availability, "availability"); chk(s.p95, "summary p95"); chk(s.cost, "summary cost");
}
console.log({ runs, errors, bad }); [...problems].slice(0, 15).forEach((p) => console.log(" ", p)); process.exit(errors + bad ? 1 : 0);
