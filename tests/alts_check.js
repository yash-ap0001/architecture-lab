// Decision tables ("why this, and why not the others"). Run: node tests/alts_check.js
const S = require("../sim.js"), A = require("../catalog_alts.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const unknown = Object.keys(A.BY).filter((k) => !S.BY_ID[k]);
ok(!unknown.length, "every option names a real component" + (unknown.length ? ": " + unknown.join(",") : ""));
const uncovered = S.CATALOG.filter((c) => c.cls !== "source" && !A.BY[c.id]).map((c) => c.id);
ok(!uncovered.length, "every component has a decision entry" + (uncovered.length ? ": " + uncovered.join(",") : ""));
const bad = []; A.GROUPS.forEach((g) => { if (g.rows.length < 2) bad.push(g.name + ": one option only"); const seen = new Set(); g.rows.forEach(([id, pick, avoid]) => { if (seen.has(id)) bad.push(g.name + ": duplicate " + id); seen.add(id); if (!pick || pick.length < 12 || !avoid || avoid.length < 12) bad.push(id + ": pick/avoid too short"); }); });
ok(!bad.length, `${A.GROUPS.length} groups are well formed` + (bad.length ? ": " + bad.slice(0, 4).join("; ") : ""));
const i = A.info("redis-cluster"); ok(i && i.alts.length >= 5 && i.pick && i.avoid, "a component returns its own advice and its alternatives (Redis Cluster: " + i.alts.length + " alternatives)");
ok(A.info("s3").alts.some((x) => x.id === "gcs") && A.info("lambda").alts.some((x) => x.id === "gcf"), "cloud services list their counterparts on other clouds");
console.log(fail ? `\n${fail} FAILED` : "\nall alternatives checks passed"); process.exit(fail ? 1 : 0);
