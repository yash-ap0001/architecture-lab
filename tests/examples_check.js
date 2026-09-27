// Example designs: every one builds, follows the wiring rules, runs, and meets its own goals unless it is a "fix me" puzzle.
const S = require("../sim.js"), X = require("../examples_more.js"), P = require("../presets.js").PRESETS, C = require("../collapse.js"), D = require("../catalog_docs.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const all = P.map((p) => ({ name: p.name, g: p.build(), orig: true })).concat(X.LIST.map((e) => ({ name: e.name, g: X.build(e, S.BY_ID), e })));
ok(all.length >= 100, `${all.length} examples`);
ok(new Set(all.map((a) => a.name)).size === all.length, "example names are unique");
ok(X.LIST.every((e) => e.notice && e.notice.length > 20 && e.cat), "every new example has a category and a sentence saying what to notice");
ok(new Set(X.LIST.map((e) => e.cat)).size >= 10, "examples cover " + new Set(X.LIST.map((e) => e.cat)).size + " categories");
ok(!X.LIST.filter((e) => !e.generated).some((e) => e.nodes.includes("?")), "no unsized values are left");
const badWire = [], bad = [], weak = [], types = new Set();
for (const a of all) {
  const g = a.g, ids = new Set(g.nodes.map((n) => n.id));
  g.nodes.forEach((n) => { if (!S.BY_ID[n.type]) bad.push(a.name + ":" + n.type); else types.add(n.type); });
  g.edges.forEach((e) => { const A = g.nodes.find((n) => n.id === e.from), B = g.nodes.find((n) => n.id === e.to); if (!A || !B) { badWire.push(a.name); return; }
    const ca = S.BY_ID[A.type].cls, cb = S.BY_ID[B.type].cls; if (cb === "source" || (["db", "store", "external"].includes(ca)) || (S.BY_ID[A.type].tag === "hpa" && cb !== "service")) badWire.push(a.name + ": " + A.type + ">" + B.type); });
  const r = S.run(g, g.scenario, []); if (r.error || !Number.isFinite(r.summary.p95)) { bad.push(a.name + ": " + (r.error || "no result")); continue; }
  const fixme = /fix me/i.test(a.name), good = r.summary.availability >= 0.995 && r.summary.p95 <= g.slo.p95 && r.summary.cost <= g.slo.budget;
  if (!a.orig && !fixme && !good) weak.push(`${a.name} (avail ${(r.summary.availability * 100).toFixed(1)}%, p95 ${Math.round(r.summary.p95)}ms, $${Math.round(r.summary.cost)})`);
  if (fixme && good) { const h = C.hunt(S, g, g.scenario); if (h.results[0].verdict === "Survived") weak.push(a.name + " should break under some fault but survives them all"); }
}
ok(!bad.length, "every example runs" + (bad.length ? ": " + bad.slice(0, 4).join(", ") : ""));
ok(!badWire.length, "every wire follows the rules" + (badWire.length ? ": " + badWire.slice(0, 4).join(", ") : ""));
ok(!weak.length, "each example meets its own goals (fix-me puzzles do not)" + (weak.length ? ": " + weak.slice(0, 4).join("; ") : ""));
ok(types.size >= 150, `the examples use ${types.size} different components`);
const undocumented = S.CATALOG.filter((c) => !D.D[c.id]); ok(!undocumented.length, "every component has a hover explanation");
// the weak-point hunter runs on a spread of examples without errors
let hunted = 0, herr = [];
for (let i = 0; i < all.length; i += 6) { try { const h = C.hunt(S, all[i].g, all[i].g.scenario); if (!h.results.length || !Number.isFinite(h.resistance)) herr.push(all[i].name); hunted++; } catch (e) { herr.push(all[i].name + ": " + e.message); } }
ok(!herr.length, `the weak-point hunter works on ${hunted} examples` + (herr.length ? ": " + herr.join(", ") : ""));

// no example ends up with two boxes doing the same job (monitoring, alerting, pipeline steps, identity, audit) after end-to-end augmentation
const TOOL_TAGS = ["monitoring", "alerting", "scm", "cicd", "build", "quality", "security-scan", "registry", "gitops", "deploy", "audit"];
const dupes = [];
for (const a of all) {
  const g = a.g; if (!g.nodes.some((n) => n.id.startsWith("z_"))) continue;
  const idps = g.nodes.filter((n) => (S.BY_ID[n.type] || {}).eq === "idp"); if (idps.length > 1) dupes.push(`${a.name}: ${idps.length} identity providers`);
  TOOL_TAGS.forEach((t) => { const ns = g.nodes.filter((n) => (S.BY_ID[n.type] || {}).tag === t), auto = ns.filter((n) => n.id.startsWith("z_")); if (ns.length > 1 && auto.length) dupes.push(`${a.name}: tag ${t} has ${ns.length} boxes including an auto-added one`); });
}
ok(!dupes.length, "end-to-end augmentation never duplicates tooling the design already has" + (dupes.length ? ":\n   " + dupes.join("\n   ") : ""));
console.log(fail ? `\n${fail} FAILED` : "\nall example checks passed"); process.exit(fail ? 1 : 0);
