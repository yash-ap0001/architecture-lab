/* One-click fixes, goal-based optimisation and the three architecture options.
 * Every function is pure: it takes a canvas document and returns a NEW document plus a list of what changed,
 * so the app can show the change in its preview before anything touches the user's canvas. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sim.js"), require("./lint.js"));
  else root.LabFixes = factory(root.LabSim, root.LabLint);
})(typeof self !== "undefined" ? self : this, function (S, L) {
  "use strict";
  const SECRETS = { aws: "secretsmanager", azure: "keyvault", gcp: "secretmanager" };
  const LEAN_SWAP = { kafka: "queue", msk: "sqs", stream: "queue", pinecone: "pgvector", vector: "pgvector", aurora: "postgres", cassandra: "postgres", dragonfly: "cache", fastly: "cdn", cloudflare: "cdn" };
  const GOALS = {
    security: ["public-db", "unprotected-api", "plaintext", "no-authn", "no-authz", "no-rate-limit", "no-kms", "ai-injection", "ai-tools", "ai-approval"],
    reliability: ["spof-db", "spof-lb", "spof-service", "no-backup", "no-observability", "no-dlq", "retry-storm"],
    cost: ["overeng-stream", "ai-cost", "egress-store", "unused"],
    compliance: ["no-authn", "no-kms", "no-backup", "no-observability", "compliance-gdpr", "compliance-hipaa", "compliance-pci", "compliance-soc2", "compliance-iso27001"],
  };
  const def = (n) => S.BY_ID[n.type] || {};
  const clone = (d) => JSON.parse(JSON.stringify(d));
  const nm = (n) => (n.props && n.props.name) || def(n).name || n.type;

  function ctx(d) {
    let seq = 0;
    const byId = () => { const m = {}; d.nodes.forEach((n) => { m[n.id] = n; }); return m; };
    const newId = (p) => { let id; do { id = (p || "f") + Math.random().toString(36).slice(2, 7) + (seq++).toString(36); } while (d.nodes.some((n) => n.id === id)); return id; };
    const free = (x, y) => {
      for (let i = 0; i < 40; i++) {
        const cx = x + (i % 4) * 160 * (i % 8 < 4 ? 1 : -1), cy = y + Math.floor(i / 4) * 100;
        if (!d.nodes.some((n) => Math.abs(n.x - cx) < 150 && Math.abs(n.y - cy) < 90)) return { x: Math.round(cx), y: Math.round(cy) };
      }
      return { x: Math.round(x), y: Math.round(y + 400) };
    };
    const add = (type, props, near, dx, dy) => {
      const base = near || { x: 120, y: Math.max(0, ...d.nodes.map((n) => n.y)) + 130 };
      const p = free(base.x + (dx || 0), base.y + (dy == null ? 110 : dy));
      const n = { id: newId(), type, x: p.x, y: p.y, props: Object.assign({ name: (S.BY_ID[type] || {}).name || type }, props || {}) };
      d.nodes.push(n); return n;
    };
    const wire = (from, to, extra) => { if (from === to || d.edges.some((e) => e.from === from && e.to === to)) return; d.edges.push(Object.assign({ from, to }, extra || {})); };
    const between = (edge, type, props) => {
      const m = byId(), a = m[edge.from], b = m[edge.to];
      const n = add(type, props, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 0, -90);
      d.edges = d.edges.filter((e) => e !== edge);
      const { from, to, ...rest } = edge; wire(from, n.id, rest); wire(n.id, to, { w: 1 });
      return n;
    };
    const entry = () => { const m = byId(), e = d.edges.find((x) => m[x.from] && def(m[x.from]).cls === "source" && m[x.to]); return e ? m[e.to] : d.nodes.find((n) => def(n).cls !== "source"); };
    const sources = () => d.nodes.filter((n) => def(n).cls === "source");
    const has = (pred) => d.nodes.find((n) => pred(def(n), n));
    return { byId, add, wire, between, entry, sources, has };
  }

  /* fix makers: (doc, finding, k) => description string, or "" when nothing could be done */
  const MAKERS = {
    "public-db": (d, f, k) => {
      const m = k.byId(), out = [];
      d.edges.filter((e) => m[e.from] && m[e.to] && def(m[e.from]).cls === "source" && ["db", "cache"].includes(def(m[e.to]).cls)).forEach((e) => {
        const svc = d.edges.map((x) => x.to === e.to && m[x.from] && def(m[x.from]).cls === "service" ? m[x.from] : null).find(Boolean);
        d.edges = d.edges.filter((x) => x !== e);
        if (svc) { k.wire(e.from, svc.id); out.push(`${nm(m[e.from])} now calls ${nm(svc)} instead of ${nm(m[e.to])}`); }
        else { const api = k.add("app", { name: "API service", inst: 2 }, m[e.from], 160, 0); k.wire(e.from, api.id); k.wire(api.id, e.to); out.push(`added API service between ${nm(m[e.from])} and ${nm(m[e.to])}`); }
      });
      return out.join("; ");
    },
    "unprotected-api": (d, f, k) => {
      const m = k.byId(), edges = d.edges.filter((e) => m[e.from] && m[e.to] && def(m[e.from]).cls === "source" && def(m[e.to]).cls === "service");
      if (!edges.length) return "";
      const gw = k.add("apigw", { name: "API gateway", ha: true }, m[edges[0].from], 160, 0);
      edges.forEach((e) => { d.edges = d.edges.filter((x) => x !== e); const { from, to, ...rest } = e; k.wire(from, gw.id, rest); k.wire(gw.id, to); });
      return `added an API gateway in front of ${edges.map((e) => nm(m[e.to])).join(", ")}`;
    },
    "plaintext": (d, f) => { let n = 0; d.edges.forEach((e) => { if (e.tls === false && f.nodes.includes(e.from) && f.nodes.includes(e.to)) { e.tls = true; n++; } }); return n ? `turned TLS on for ${n} wire${n === 1 ? "" : "s"}` : ""; },
    "no-authn": (d, f, k) => { const en = k.entry(); if (!en) return ""; const idp = k.add("keycloak", { name: "Central auth (OIDC)", inst: 2, authz: "RBAC" }, en, 0, 130); k.wire(en.id, idp.id, { fan: true, w: 1 }); return `added an OIDC identity provider checked by ${nm(en)} on every request`; },
    "no-authz": (d, f, k) => { const a = d.nodes.filter((n) => ["auth", "keycloak", "cognito", "entraid", "identityplatform", "oauthproxy"].includes(n.type) || /auth/i.test(nm(n))); if (!a.length) return ""; a.forEach((n) => { n.props.authz = n.props.authz || "RBAC"; }); return `recorded role-based access control on ${a.map(nm).join(", ")} (confirm the real model)`; },
    "no-rate-limit": (d, f, k) => {
      const m = k.byId(), edges = d.edges.filter((e) => m[e.from] && m[e.to] && def(m[e.from]).cls === "source");
      if (!edges.length) return "";
      const lim = k.add("limiter", { name: "Rate limiter" }, m[edges[0].from], 160, -40);
      edges.forEach((e) => { d.edges = d.edges.filter((x) => x !== e); const { from, to, ...rest } = e; k.wire(from, lim.id, rest); k.wire(lim.id, to); });
      return `added a rate limiter on the entry path`;
    },
    "no-kms": (d, f, k, opts) => { const m = k.byId(), near = m[f.nodes[0]] || k.entry(); const type = SECRETS[(opts && opts.cloud) || ""] || "vault"; const n = k.add(type, { name: "Secrets + key management" }, near, 160, 110); return `added ${nm(n)} (${(S.BY_ID[type] || {}).name}) for keys and secrets`; },
    "spof-db": (d, f) => { const t = d.nodes.filter((n) => f.nodes.includes(n.id)); t.forEach((n) => { n.props.ha = true; }); return t.length ? `turned on high availability for ${t.map(nm).join(", ")}` : ""; },
    "spof-lb": (d, f) => { const t = d.nodes.filter((n) => f.nodes.includes(n.id)); t.forEach((n) => { n.props.ha = true; }); return t.length ? `made ${t.map(nm).join(", ")} highly available` : ""; },
    "spof-service": (d, f) => { const t = d.nodes.filter((n) => f.nodes.includes(n.id)); t.forEach((n) => { n.props.inst = Math.max(2, +n.props.inst || 1); n.props.auto = true; }); return t.length ? `two or more instances with autoscaling for ${t.map(nm).join(", ")}` : ""; },
    "no-backup": (d, f, k) => { const m = k.byId(), stores = f.nodes.map((id) => m[id]).filter(Boolean); if (!stores.length) return ""; const b = k.add("backup", { name: "Backup vault (PITR, cross-region copy)" }, stores[0], 0, 120); stores.forEach((s) => k.wire(s.id, b.id)); return `added a backup vault for ${stores.map(nm).join(", ")}`; },
    "no-observability": (d, f, k) => { const en = k.entry(); if (!en) return ""; const mo = k.add("prometheus", { name: "Metrics + alerts" }, en, -160, 130); k.wire(mo.id, en.id); const pd = k.add("pagerduty", {}, mo, 0, 110); k.wire(mo.id, pd.id); const tr = k.add("tracing", { name: "Tracing (OpenTelemetry)" }, mo, 160, 0); return `added ${nm(mo)}, ${nm(pd)} and ${nm(tr)}`; },
    "no-dlq": (d, f, k) => { const m = k.byId(), qs = f.nodes.map((id) => m[id]).filter(Boolean); if (!qs.length) return ""; const q = k.add("dlq", { name: "Dead-letter queue" }, qs[0], 0, 110); qs.forEach((x) => k.wire(x.id, q.id, { mode: "async", retry: "dlq", fan: true, w: 0.01 })); /* a 1% side share: the simulator sends all writes to a queue target, so a plain wire would swallow the whole stream */ return `added a dead-letter queue for ${qs.map(nm).join(", ")}`; },
    "retry-storm": (d, f) => { const t = d.nodes.filter((n) => f.nodes.includes(n.id)); t.forEach((n) => { n.props.breaker = true; }); return t.length ? `added circuit breakers to ${t.map(nm).join(", ")}` : ""; },
    "unused": (d, f) => { const ids = new Set(f.nodes), gone = d.nodes.filter((n) => ids.has(n.id)); d.nodes = d.nodes.filter((n) => !ids.has(n.id)); d.edges = d.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)); return gone.length ? `removed ${gone.map(nm).join(", ")}` : ""; },
    "egress-store": (d, f, k) => { const m = k.byId(), e = d.edges.find((x) => x.from === f.nodes[0] && x.to === f.nodes[1]); if (!e) return ""; k.between(e, "cdn", { name: "CDN" }); return `put a CDN between ${nm(m[e.from])} and ${nm(m[e.to])}`; },
    "overeng-stream": (d, f) => { const t = d.nodes.filter((n) => f.nodes.includes(n.id)); t.forEach((n) => { const was = def(n).name; n.type = n.type === "msk" ? "sqs" : "queue"; n.props.name = n.props.name === was ? def(n).name : n.props.name; }); return t.length ? `switched ${t.map(nm).join(", ")} to a managed queue` : ""; },
    "ai-injection": (d, f, k) => {
      const m = k.byId(), targets = new Set(f.nodes), into = d.edges.filter((e) => targets.has(e.to) && !targets.has(e.from) && m[e.from] && !(def(m[e.from]).tag === "guardrail"));
      if (!into.length) return "";
      const g = k.add("guardrails", { name: "AI guardrails" }, m[into[0].to], -160, -100);
      into.forEach((e) => { d.edges = d.edges.filter((x) => x !== e); const { from, to, ...rest } = e; k.wire(from, g.id, rest); k.wire(g.id, to); });
      return `routed ${[...targets].map((id) => m[id] ? nm(m[id]) : id).join(", ")} through AI guardrails`;
    },
    "ai-tools": (d, f, k) => {
      const m = k.byId(), agents = f.nodes.map((id) => m[id]).filter(Boolean); if (!agents.length) return "";
      const gw = k.add("toolgw", { name: "Agent tool gateway" }, agents[0], 160, 110);
      agents.forEach((a) => { d.edges.filter((e) => e.from === a.id && m[e.to] && !["llm", "bedrock", "azopenai", "openai", "gemini", "vertex", "modelrouter", "guardrails", "llmgw"].includes(m[e.to].type)).forEach((e) => { d.edges = d.edges.filter((x) => x !== e); const { from, to, ...rest } = e; k.wire(gw.id, to, rest); }); k.wire(a.id, gw.id); });
      return `agent tool calls now go through an allow-listed tool gateway`;
    },
    "ai-approval": (d, f, k) => { const gw = k.has((dd) => dd.tag === "toolgw"), m = k.byId(), a = gw || m[f.nodes[0]]; if (!a) return ""; const ap = k.add("approval", { name: "Human approval queue" }, a, 160, 0); k.wire(a.id, ap.id, { mode: "async", fan: true, w: 0.1 }); /* assumption: about 10% of actions are risky enough to need a person */ return `risky agent actions now wait in a human approval queue`; },
    "ai-cost": (d, f, k) => {
      const m = k.byId(), targets = new Set(f.nodes), into = d.edges.filter((e) => targets.has(e.to) && !targets.has(e.from) && m[e.from] && def(m[e.from]).tag !== "modelrouter");
      if (!into.length) return "";
      const r = k.add("modelrouter", { name: "Model router + semantic cache" }, m[into[0].to], -160, 100);
      into.forEach((e) => { d.edges = d.edges.filter((x) => x !== e); const { from, to, ...rest } = e; k.wire(from, r.id, rest); k.wire(r.id, to); });
      return `added a model router with a semantic cache before the model`;
    },
  };
  const compliance = (d, f, k, opts) => {
    const out = [], has = (p) => k.has(p);
    if (!has((dd, n) => dd.tag === "audit" || /audit/i.test(nm(n)))) { const en = k.entry(); if (en) { const a = k.add("auditlog", { name: "Audit log (append-only)", inst: 2 }, en, 160, 130); k.wire(en.id, a.id, { fan: true, w: 0.15, mode: "async" }); out.push("added an append-only audit log"); } }
    if (!has((dd) => dd.tag === "secrets" || ["kms-aws", "cloudkms", "cloudhsm"].includes(dd.id))) out.push(MAKERS["no-kms"](d, { nodes: [] }, k, opts));
    if (!has((dd) => ["auth", "keycloak", "cognito", "entraid", "identityplatform", "auth0", "oauthproxy"].includes(dd.id) || dd.tag === "iam")) out.push(MAKERS["no-authn"](d, f, k));
    const stores = d.nodes.filter((n) => ["db", "store"].includes(def(n).cls));
    if (stores.length && !has((dd) => dd.tag === "backup")) out.push(MAKERS["no-backup"](d, { nodes: stores.map((n) => n.id) }, k));
    return out.filter(Boolean).join("; ");
  };
  ["gdpr", "hipaa", "pci", "soc2", "iso27001"].forEach((fw) => { MAKERS["compliance-" + fw] = compliance; });

  const canFix = (finding) => !!MAKERS[finding.id];
  /* Returns { doc, changes: [string] } with the fix applied to a copy; changes is empty if nothing applied. */
  function applyFix(doc, finding, opts) {
    const maker = MAKERS[finding.id]; if (!maker) return { doc, changes: [] };
    const d = clone(doc), k = ctx(d), msg = maker(d, finding, k, opts || {});
    return msg ? { doc: d, changes: [msg] } : { doc, changes: [] };
  }
  /* Apply fixes for every finding whose id is in `ids`, re-linting after each one, until none are left. */
  function applyAll(doc, ids, opts) {
    let d = clone(doc); const changes = [], tried = new Set();
    for (let round = 0; round < 25; round++) {
      const f = L.lint(d, opts).findings.find((x) => ids.includes(x.id) && MAKERS[x.id] && !tried.has(x.id + "|" + x.nodes.join(",")));
      if (!f) break;
      tried.add(f.id + "|" + f.nodes.join(","));
      const r = applyFix(d, f, opts); if (r.changes.length) { d = r.doc; changes.push(...r.changes); }
    }
    return { doc: d, changes };
  }
  function optimize(doc, goal, opts) { return applyAll(doc, GOALS[goal] || [], opts); }
  function fixBlocking(doc, opts) {
    const ids = [...new Set(L.lint(doc, opts).findings.filter((f) => f.sev === "critical" || f.sev === "high").map((f) => f.id))];
    return applyAll(doc, ids, opts);
  }

  /* Three options built from the current canvas, each a real, editable document. */
  function options(doc, opts) {
    const base = clone(doc);
    const lean = clone(base), leanChanges = [], rps = +((doc.scenario || {}).base) || 1000;
    // Streaming and dedicated vector stores are only swapped below the scale where they stop paying off
    // (same threshold the linter uses); at high volume the cheaper part would need far more consumers.
    const HEAVY = new Set(["kafka", "msk", "stream", "pinecone", "vector"]);
    lean.nodes.forEach((n) => {
      if (n.props.ha) { n.props.ha = false; leanChanges.push(`${nm(n)}: single zone`); }
      if (n.props.replicas > 0) { n.props.replicas = 0; leanChanges.push(`${nm(n)}: no replicas`); }
      const to = LEAN_SWAP[n.type]; if (to && S.BY_ID[to] && !(HEAVY.has(n.type) && rps >= 2000)) { const was = def(n).name; if (n.props.name === was) n.props.name = S.BY_ID[to].name; n.type = to; leanChanges.push(`${was} → ${S.BY_ID[to].name}`); }
    });
    const leanSafe = applyAll(lean, ["public-db", "unprotected-api", "plaintext", "no-authn", "no-backup", "no-observability", "ai-injection", "ai-approval"], opts);
    leanSafe.doc.name = (doc.name || "Design") + " · Lean MVP";

    const bal = applyAll(base, GOALS.security.concat(["spof-db", "no-backup", "no-observability", "no-dlq", "retry-storm", "ai-cost"]), opts);
    bal.doc.name = (doc.name || "Design") + " · Balanced production";

    const ent = applyAll(bal.doc, GOALS.reliability.concat(GOALS.compliance), opts), entChanges = [];
    ent.doc.nodes.forEach((n) => {
      const c = def(n).cls;
      if (["router", "proxy"].includes(c) && !n.props.ha) { n.props.ha = true; entChanges.push(`${nm(n)}: HA`); }
      if (c === "db") { if (!n.props.ha) { n.props.ha = true; entChanges.push(`${nm(n)}: HA`); } if (!(n.props.replicas > 0) && def(n).rep) { n.props.replicas = 1; entChanges.push(`${nm(n)}: read replica`); } }
      if (c === "service" && (n.props.__aiLevel || 1) === 1 && !(n.props.inst >= 2)) { n.props.inst = 2; n.props.auto = true; entChanges.push(`${nm(n)}: 2+ instances, autoscaling`); }
    });
    ent.doc.dr = "warm-standby";
    ent.doc.name = (doc.name || "Design") + " · Enterprise scale";
    return [
      { key: "A", name: "Lean MVP", doc: leanSafe.doc, changes: leanChanges.concat(leanSafe.changes), note: "Lowest sensible cost: single zone, managed basics, but keeps the security essentials (gateway, auth, backups, monitoring, AI guardrails)." },
      { key: "B", name: "Balanced production", doc: bal.doc, changes: bal.changes, note: "Recommended default: your canvas plus the security controls, backups, monitoring and failure handling it is missing." },
      { key: "C", name: "Enterprise scale", doc: ent.doc, changes: bal.changes.concat(ent.changes, entChanges, ["warm standby region planned (priced in the cost plan's DR scenario)"]), note: "High availability everywhere, compliance controls, and a warm standby region for disaster recovery." },
    ];
  }

  return { applyFix, applyAll, optimize, fixBlocking, options, canFix, GOALS };
});
