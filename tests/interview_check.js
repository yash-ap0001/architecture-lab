// Interview practice checks. Run: node tests/interview_check.js
const S = require("../sim.js"), X = require("../examples_more.js"), P = require("../presets.js").PRESETS, C = require("../collapse.js"), I = require("../interview.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const Q = I.QUESTIONS;
ok(Q.length >= 54, `${Q.length} interview questions`);
ok(new Set(Q.map((q) => q.title)).size === Q.length, "titles are unique");
ok(Q.every((q) => q.ask && q.func.length >= 2 && q.nonfunc.length >= 2 && q.concepts.length >= 2 && q.follow.length >= 1 && q.follow.every((f) => f.q && f.a.length > 30)), "every question has an ask, requirements, concepts and model answers to follow-ups");
ok(I.CHEAT.length >= 30, `${I.CHEAT.length} cheat-sheet cards`);
const allNeeds = new Set(); Q.forEach((q) => q.concepts.forEach((c) => c.needs.forEach((n) => allNeeds.add(n))));
const known = ["cache", "cdn", "lb", "gateway", "queue", "limiter", "object", "ws", "monitor", "external", "db", "search", "nosql", "graph", "warehouse", "vector", "llm", "sql", "replicas", "shards", "ha", "auto", "region2", "breaker", "retries", "canary", "identity", "secrets", "cicd", "scan", "audit", "siem", "iac", "registry"];
ok([...allNeeds].every((n) => known.includes(n)), "every concept check is a known feature" + ([...allNeeds].filter((n) => !known.includes(n)).join(",")));
const e = I.estimate(Q[0]); ok(e.avgQps > 0 && e.peakQps > e.avgQps && e.storageTotal > 0, "the back-of-envelope estimate works (URL shortener: " + Math.round(e.avgQps) + " avg req/s, " + I.bytes(e.storageTotal) + " in 5 years)");
const starter = { nodes: [{ id: "c", type: "client", props: {} }, { id: "a", type: "app", props: { inst: 1 } }, { id: "d", type: "sql", props: {} }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }] };
const weak = [], low = [], errs = [];
for (const q of Q) {
  let ref; try { ref = I.reference(S, X, P, q); } catch (x) { errs.push(q.title + ": " + x.message); continue; }
  const r = I.evaluate(S, C, ref.graph, q, ref); if (r.error) { errs.push(q.title + ": " + r.error); continue; }
  if (r.score < 80) weak.push(`${q.title} ${r.score} [${r.checks.filter((c) => !c.pass).map((c) => c.label).join("; ") || "goals"}${r.goals.okAvail ? "" : " avail"}${r.goals.okLat ? "" : " lat"}${r.goals.okCost ? "" : " cost"}${r.incident.points < 20 ? " incident " + (r.incident.avail * 100).toFixed(0) + "%" : ""}]`);
  const b = I.evaluate(S, C, starter, q, ref); if (!b.error && b.score >= 60) low.push(q.title + " " + b.score);
}
ok(!errs.length, "every reference design loads and scores" + (errs.length ? ": " + errs.slice(0, 3).join("; ") : ""));
ok(!weak.length, "every reference answer scores 80 or more" + (weak.length ? ":\n   " + weak.join("\n   ") : ""));
ok(!low.length, "a bare app and database does not pass any question" + (low.length ? ": " + low.slice(0, 4).join(", ") : ""));
console.log(fail ? `\n${fail} FAILED` : "\nall interview checks passed"); process.exit(fail ? 1 : 0);
