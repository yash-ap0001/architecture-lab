// Component catalogue, pools, autoscaling and release checks. Run: node tests/catalog_check.js
const S = require("../sim.js"), fs = require("fs");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const more = require("../catalog_more.js");
ok(S.extend(more).length === more.length && S.CATALOG.length > 250, `the extra components are registered once (adding them again is ignored) (${S.CATALOG.length} components)`);
const ids = S.CATALOG.map((c) => c.id); ok(new Set(ids).size === ids.length, "component ids are unique");
const prov = {}; S.CATALOG.forEach((c) => { prov[c.prov] = (prov[c.prov] || 0) + 1; });
ok(prov.aws >= 40 && prov.gcp >= 35 && prov.azure >= 30 && prov.docker >= 4 && prov.k8s >= 12 && prov.devops >= 15, `AWS ${prov.aws}, Google Cloud ${prov.gcp}, Azure ${prov.azure}, Docker ${prov.docker}, Kubernetes ${prov.k8s}, DevOps ${prov.devops}`);
const bad = S.CATALOG.filter((c) => {
  if (["service", "proxy", "router", "cdn", "limiter", "external", "cache", "queue"].includes(c.cls)) return !(c.cap > 0 && c.ms > 0);
  if (["db", "store"].includes(c.cls)) return !(c.rd > 0 && c.wr > 0);
  if (c.cls === "pool") return !(c.cost > 0 && c.podsPerNode > 0);
  return false;
});
ok(bad.length === 0, "every component has usable capacity, latency and price numbers" + (bad.length ? ": " + bad.map((b) => b.id).join(",") : ""));
// swapping between clouds
const groups = {}; S.CATALOG.forEach((c) => { if (c.eq) (groups[c.eq] = groups[c.eq] || new Set()).add(c.prov); });
const tri = Object.keys(groups).filter((g) => ["aws", "gcp", "azure"].every((p) => groups[g].has(p)));
ok(tri.length >= 15, `${tri.length} kinds of service exist on all three clouds (${tri.slice(0, 8).join(", ")}...)`);
ok(["gcs", "blob", "s3"].every((id) => S.equivalents(id).some((x) => x.prov !== S.BY_ID[id].prov)) && S.equivalents("cloudrun").some((x) => x.id === "containerapps"), "an object store or a serverless container has equivalents on the other clouds");
ok(S.equivalents("dns").some((x) => x.id === "route53") && S.equivalents("sql").some((x) => x.id === "rds"), "the original generic components also map to cloud services");
// every component can be placed in a design and simulated
let broken = [];
for (const c of S.CATALOG) {
  if (c.cls === "source") continue;
  let g;
  if (["service", "proxy", "router", "cdn", "limiter", "external", "cache", "queue"].includes(c.cls)) g = { nodes: [{ id: "c", type: "client" }, { id: "x", type: c.id }, { id: "d", type: "sql" }], edges: [{ from: "c", to: "x" }, { from: "x", to: "d" }] };
  else if (["db", "store"].includes(c.cls)) g = { nodes: [{ id: "c", type: "client" }, { id: "a", type: "app" }, { id: "x", type: c.id }], edges: [{ from: "c", to: "a" }, { from: "a", to: "x" }] };
  else if (c.cls === "pool") g = { nodes: [{ id: "c", type: "client" }, { id: "a", type: "app" }, { id: "d", type: "sql" }, { id: "x", type: c.id }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }, { from: "x", to: "a" }] };
  else g = { nodes: [{ id: "c", type: "client" }, { id: "a", type: "app" }, { id: "d", type: "sql" }, { id: "x", type: c.id }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }] };
  try { const r = S.run(g, { base: 200, readFrac: 0.8 }, []); if (r.error || !Number.isFinite(r.summary.p95) || !Number.isFinite(r.summary.cost)) broken.push(c.id); } catch (e) { broken.push(c.id + ":" + e.message); }
}
ok(broken.length === 0, "all " + S.CATALOG.length + " components run in a simulation" + (broken.length ? ": " + broken.slice(0, 8).join(",") : ""));

// Kubernetes: pods need nodes
const app = (id, props) => ({ id, type: "k8sdeploy", props: Object.assign({ inst: 40 }, props) });
const cluster = (poolProps, dep) => ({ nodes: [{ id: "c", type: "client" }, app("a", dep), { id: "d", type: "dynamo" }, { id: "np", type: "k8snodepool", props: poolProps }], edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }, { from: "np", to: "a" }] });
const run = (g, sc, chaosFn, ticks) => { const st = S.createSim(g, Object.assign({ base: 12000, readFrac: 0.9 }, sc || {})); for (let t = 0; t < (ticks || 60); t++) S.step(st, { chaos: chaosFn ? chaosFn(t) : {} }); return st.history; };
const avg = (o, a, b) => o.slice(a, b).reduce((x, r) => x + r.ok, 0) / (b - a);
const small = run(cluster({ nodes: 3 }), {}), roomy = run(cluster({ nodes: 6 }), {});
ok(small[30].nodes.np.util > 1 && avg(small, 20, 40) < avg(roomy, 20, 40) - 0.1, "pods that do not fit on the nodes cannot be scheduled: capacity is capped by the node pool");
ok(small[30].nodes.np.pending > 0 && roomy[30].nodes.np.pending === 0, "the pool reports pending pods");
const scaling = run(cluster({ nodes: 3, auto: true, max: 10 }), {}, null, 80);
ok(avg(scaling, 3, 8) < 0.9 && avg(scaling, 50, 80) > 0.98 && scaling[70].nodes.np.nodes > scaling[5].nodes.np.nodes, "a cluster autoscaler adds nodes, but only after a delay");
const az = run(cluster({ nodes: 6 }), {}, (t) => (t >= 20 ? { azOut: true } : {}));
ok(avg(az, 30, 55) < avg(roomy, 30, 55) - 0.15, "losing a zone removes half the nodes and the pods on them");
const multi = run(cluster({ nodes: 6, multiAz: true }), {}, (t) => (t >= 20 ? { azOut: true } : {}));
ok(avg(multi, 30, 55) > avg(az, 30, 55), "a multi-zone pool loses only a third of its nodes");
const killPool = run(cluster({ nodes: 6 }), {}, (t) => (t >= 20 ? { "node:np": true } : {}));
ok(avg(killPool, 30, 55) < 0.05, "losing the whole node pool takes the hosted pods down");
// HPA and pod autoscaling
const flat = (hpa) => ({ nodes: [{ id: "c", type: "client" }, { id: "a", type: "k8sdeploy", props: { inst: 6 } }, { id: "d", type: "dynamo" }].concat(hpa ? [{ id: "h", type: "k8shpa" }] : []), edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }].concat(hpa ? [{ from: "h", to: "a" }] : []) });
const noHpa = run(flat(false), { base: 1500 }, (t) => (t >= 20 ? { "surge:2": true } : {}), 70), withHpa = run(flat(true), { base: 1500 }, (t) => (t >= 20 ? { "surge:2": true } : {}), 70);
ok(avg(withHpa, 40, 70) > avg(noHpa, 40, 70) + 0.1, "an HPA box wired to a deployment turns on pod autoscaling");
// releases: strategy and monitoring decide the damage
const rel = (strategy, monitor) => { const g = { nodes: [{ id: "c", type: "client" }, { id: "a", type: "app", props: { inst: 8, deploy: strategy } }, { id: "d", type: "dynamo" }].concat(monitor ? [{ id: "m", type: "prometheus" }] : []), edges: [{ from: "c", to: "a" }, { from: "a", to: "d" }] };
  const o = run(g, { base: 1200 }, (t) => (t >= 20 && t < 40 ? { "bad:a": true } : {}), 60); return { lost: 1 - avg(o, 20, 40), o }; };
const canary = rel("canary", false), rolling = rel("rolling", false), blue = rel("bluegreen", false), canaryM = rel("canary", true), blueM = rel("bluegreen", true);
ok(canary.lost < rolling.lost && canary.lost < blue.lost, `a canary release limits a bad release (lost ${(canary.lost * 100).toFixed(1)}% vs rolling ${(rolling.lost * 100).toFixed(1)}% vs blue-green ${(blue.lost * 100).toFixed(1)}%)`);
ok(blueM.lost < blue.lost / 3 && canaryM.lost <= canary.lost, `monitoring and alerts cut the damage of a bad release (${(blue.lost * 100).toFixed(1)}% -> ${(blueM.lost * 100).toFixed(1)}%)`);
ok(rel("rolling", false).o[45].ok > 0.99, "after the bad release is rolled back the service recovers");
console.log(fail ? `\n${fail} FAILED` : "\nall catalogue checks passed"); process.exit(fail ? 1 : 0);
