// Platform architectures: real multi-service designs with central auth, audit, patterns, pipeline and a linked class design. Run: node tests/blueprint_check.js
const S = require("../sim.js"), X = require("../examples_more.js"), PL = require("../platforms.js"), LLD = require("../lld.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const platforms = X.LIST.filter((e) => e.generated);
ok(platforms.length >= 10, `${platforms.length} full platform architectures`);
const problems = [];
for (const e of platforms) {
  const g = X.build(e, S.BY_ID), byId = {}; g.nodes.forEach((n) => { byId[n.id] = n; });
  const bp = PL.BLUEPRINTS[e.blueprint], types = g.nodes.map((n) => n.type);
  const javaSvcs = g.nodes.filter((n) => ["springboot", "tomcat"].includes(n.type)).length;
  if (javaSvcs < 7) problems.push(`${e.name}: only ${javaSvcs} Java services`);
  if (g.nodes.length < 35) problems.push(`${e.name}: only ${g.nodes.length} boxes`);
  ["springgw", "auditlog", "worker"].forEach((t) => { if (!types.includes(t)) problems.push(`${e.name}: no ${t}`); });
  if (!g.nodes.some((n) => S.BY_ID[n.type].eq === "idp" || n.type === "keycloak")) problems.push(e.name + ": no central auth");
  if (!g.nodes.some((n) => S.BY_ID[n.type].cls === "queue")) problems.push(e.name + ": no event bus");
  if (!g.edges.some((x) => x.from === "gw" && x.to === "idp")) problems.push(e.name + ": gateway does not call the auth server");
  if (!g.nodes.some((n) => S.BY_ID[n.type].tag === "audit")) problems.push(e.name + ": no audit store");
  const dbs = g.nodes.filter((n) => ["db", "store"].includes(S.BY_ID[n.type].cls)).length; if (dbs < javaSvcs - 3) problems.push(`${e.name}: services do not own their data (${dbs} stores)`);
  if (g.nodes.filter((n) => S.BY_ID[n.type].cls === "passive").length < 10) problems.push(e.name + ": pipeline and tooling missing");
  bp.services.forEach((s) => { if (!byId[s.id]) problems.push(`${e.name}: blueprint service ${s.id} is not on the canvas`); });
  bp.sync.forEach((c) => { if (!byId[c.fromId] || !byId[c.toId]) problems.push(e.name + ": call between unknown boxes"); });
  const allPatterns = new Set(); bp.services.forEach((s) => s.patterns.forEach((p) => allPatterns.add(p))); if (allPatterns.size < 8) problems.push(`${e.name}: only ${allPatterns.size} patterns`);
  const lld = LLD.ITEMS.find((x) => x.id === bp.lld); if (!lld) problems.push(e.name + ": low-level design " + bp.lld + " missing");
  else { const names = new Set(LLD.parseClasses(lld.classes).map((c) => c.name)); lld.rels.forEach((r) => { if (!names.has(r[0]) || !names.has(r[1])) problems.push(`${e.name}: LLD relation ${r[0]}>${r[1]}`); }); if (lld.kind !== "blueprint" || lld.classes.length < 6) problems.push(e.name + ": LLD too small"); }
  if (!(bp.auth.length >= 4 && bp.audit.length >= 4 && bp.deploy.length >= 3 && bp.tradeoffs.length >= 3 && bp.talk.length >= 5)) problems.push(e.name + ": blueprint sections incomplete");
}
ok(!problems.length, "each platform has 7+ Java services, central auth, event bus, audit store, data per service, tooling, patterns and a linked class design" + (problems.length ? ":\n   " + problems.slice(0, 8).join("\n   ") : ""));
const cloudsUsed = new Set(PL.PLATFORMS.map((p) => p.cloud)); ok(["aws", "azure", "gcp", "k8s", "onprem"].every((c) => cloudsUsed.has(c)), "platforms cover AWS, Azure, Google Cloud, Kubernetes and on-premises");
console.log(fail ? `\n${fail} FAILED` : "\nall blueprint checks passed"); process.exit(fail ? 1 : 0);
