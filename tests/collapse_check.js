// Collapse Lab checks. Run: node tests/collapse_check.js
const S = require("../sim.js"), C = require("../collapse.js"), P = require("../presets.js").PRESETS, M = require("../missions.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const strip = (d) => ({ nodes: d.nodes.map((n) => ({ id: n.id, type: n.type, props: n.props })), edges: d.edges });
const preset = (id) => { const p = P.find((x) => x.id === id).build(); return { g: strip(p), sc: p.scenario }; };

// a fragile design collapses under a simple failure, a robust one survives
const storm = preset("storm"), start = preset("start"), global = preset("global");
const burst = C.run(S, storm.g, storm.sc, [{ type: "burst", startMin: 15, durationMin: 3 }]);
ok(burst.verdict === "Collapsed" && !burst.recovered && burst.collapseMin != null, `the retry storm design collapses and never recovers (${burst.verdict}, recovered ${burst.recovered})`);
const calm = C.run(S, global.g, global.sc, []);
ok(calm.verdict === "Survived" && calm.recovered, "with no faults nothing collapses");
const regionDown = C.run(S, global.g, global.sc, [{ type: "region", target: "us", startMin: 15, durationMin: 8 }]);
ok(regionDown.verdict !== "Collapsed" && regionDown.recovered, `the two-region design survives losing a region (${regionDown.verdict}, ${(regionDown.avgDuring * 100).toFixed(1)}%)`);
const startDown = C.run(S, start.g, start.sc, [{ type: "node", target: "a", startMin: 15, durationMin: 8 }]);
ok(startDown.verdict === "Collapsed" && startDown.worstNodes.some((n) => n.down), "killing the only app server collapses the simple design and names the dead box");
ok(C.run(S, start.g, start.sc, [{ type: "surge", mag: 10, startMin: 10, durationMin: 5 }]).minAvail < C.run(S, start.g, start.sc, [{ type: "surge", mag: 2, startMin: 10, durationMin: 5 }]).minAvail + 1e-9, "a bigger surge never hurts less than a smaller one");
ok(C.toEvent({ type: "surge", mag: 5, startMin: 10, durationMin: 4 }).type === "surge:5" && C.toEvent({ type: "node", target: "x", startMin: 1, durationMin: 1 }).type === "node:x" && C.toEvent({ type: "region", target: "eu", startMin: 0, durationMin: 2 }).type === "region:eu", "faults become the right engine events");
ok(C.run(S, { nodes: [], edges: [] }, {}, []).error, "a design that cannot run reports an error");

// the hunter ranks weak points and scores resistance
const hStart = C.hunt(S, start.g, start.sc), hGlobal = C.hunt(S, global.g, global.sc), hStorm = C.hunt(S, storm.g, storm.sc);
ok(hStart.results.length >= 8 && hStart.results[0].verdict !== "Survived", `the hunter tries many single faults (${hStart.results.length}) and puts the worst first (${hStart.results[0].label})`);
ok(hGlobal.tested > hStart.tested && hGlobal.results.some((r) => /Region/.test(r.label)) && hGlobal.results.some((r) => /partition/i.test(r.label)), "a two-region design is also tested for region loss and partitions");
ok(hGlobal.resistance > hStart.resistance, `a robust design scores higher collapse resistance than a fragile one (${hGlobal.resistance} vs ${hStart.resistance})`);
ok(hStorm.results.some((r) => /surge|Traffic \+60%/.test(r.label) && !r.recovered), "the hunter finds the retry storm (a burst that never recovers)");
ok(hStart.results.every((r, i, a) => i === 0 || true) && JSON.stringify(C.hunt(S, start.g, start.sc).results.map((r) => r.label)) === JSON.stringify(hStart.results.map((r) => r.label)), "the ranking is deterministic");
// a mission reference design should be sturdier than its starter
const m = M.MISSIONS.find((x) => x.id === "payments");
ok(C.hunt(S, strip(m.reference()), m.scenario).resistance > C.hunt(S, strip(m.starter()), m.scenario).resistance, "a mission's reference design has higher collapse resistance than its starter");
console.log(fail ? `\n${fail} FAILED` : "\nall collapse checks passed"); process.exit(fail ? 1 : 0);
