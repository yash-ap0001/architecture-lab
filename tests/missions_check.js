// Mission checks. Run: node tests/missions_check.js
const S = require("../sim.js"), M = require("../missions.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const strip = (g) => ({ nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, props: n.props })), edges: g.edges });
for (const m of M.MISSIONS) {
  const pts = m.criteria.reduce((a, c) => a + c.points, 0);
  ok(pts === 100, `${m.id}: criteria are worth 100 points`);
  ok(m.hints.length === 3 && m.incidents.length >= 3, `${m.id}: three hints and at least three hidden incidents`);
  const s = M.evaluate(S, strip(m.starter()), m), r = M.evaluate(S, strip(m.reference()), m);
  ok(!s.error && !r.error, `${m.id}: starter and reference run`);
  ok(s.score < 75 && s.stars <= 1, `${m.id}: the starter design is not good enough (${s.score}/100)`);
  ok(r.score >= 95 && r.stars === 3, `${m.id}: the reference design scores ${r.score}/100 with 3 stars`);
  ok(JSON.stringify(M.evaluate(S, strip(m.reference()), m).criteria) === JSON.stringify(r.criteria), `${m.id}: scoring is deterministic`);
  // a design that ignores the incidents but is cheap should not get full marks
  const cheap = strip(m.starter()); const c = M.evaluate(S, cheap, m); ok(c.criteria.some((x) => !x.pass && !x.budget), `${m.id}: incidents expose weaknesses in the starter`);
  ok(m.incidents.every((i) => i.events.every((e) => typeof e.type === "string" && e.until > e.tick)), `${m.id}: incident events are well formed`);
}
const broken = M.evaluate(S, { nodes: [{ id: "x", type: "app" }], edges: [] }, M.MISSIONS[0]); ok(broken.error, "a design without a client cannot be scored");
console.log(fail ? `\n${fail} FAILED` : "\nall mission checks passed"); process.exit(fail ? 1 : 0);
