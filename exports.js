/* Design documents generated from the canvas: HLD, LLD, API plan, data design, event contracts, sequence
 * diagrams, DevOps and network plan, threat model, DR plan, test strategy, delivery roadmap and cost plan.
 * Every document is derived from what is drawn plus recorded requirements; each section says whether a
 * value is on the canvas, user-confirmed, a recommended default or unknown. Nothing is fetched. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sim.js"), require("./studio.js"));
  else root.LabExports = factory(root.LabSim, root.LabStudio);
})(typeof self !== "undefined" ? self : this, function (S, ST) {
  "use strict";
  const DOCS = [
    ["hld", "High-level design (HLD)", "Requirements, architecture style, layers, components, diagram, user journeys, decisions."],
    ["lld", "Low-level design (LLD)", "Per component: responsibility, owner, APIs/events, data, scaling, auth, cache, resilience, observability, failure, cost."],
    ["api", "API plan + OpenAPI skeleton", "Endpoints per service from the wires, error model, auth, idempotency, versioning."],
    ["data", "Database design + ER diagram", "Data owners, engines, entities, indexes, retention, backup and encryption."],
    ["events", "Event contracts", "Producers, consumers, envelope schema, delivery guarantees, DLQ and ordering."],
    ["sequence", "Sequence diagrams", "Read and write journeys from each client (Mermaid)."],
    ["devops", "DevOps, network and IaC plan", "Environments, deployment targets, network zones, CI/CD stages, IaC layout, observability."],
    ["security", "Security threat model", "Trust boundaries, STRIDE threats with mitigations present or missing, AI threats, compliance."],
    ["dr", "Disaster recovery plan", "RPO/RTO targets and capability per data store, backup policy, failover runbook, drills."],
    ["testing", "Test strategy", "Unit, contract, integration, load, chaos, security, AI evaluation and DR tests with pass criteria."],
    ["roadmap", "Team and delivery roadmap", "Roles, phases, milestones with exit criteria, backlog and scale-up triggers."],
    ["cost", "Cost plan", "Scenarios, per-component estimates, AI tokens, alternatives, hidden costs and pricing references."],
  ].map(([key, title, desc]) => ({ key, title, desc, file: key }));

  const money = (n) => "$" + Math.round(n || 0).toLocaleString("en-US");
  const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "/").replace(/\r?\n/g, " ");
  const slug = (t) => String(t || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
  const mid = (t) => "n_" + String(t).replace(/[^A-Za-z0-9_]/g, "_");
  const mlabel = (t) => String(t).replace(/["<>{}[\]|]/g, " ").slice(0, 40);
  const first = (t) => { const s = String(t || "").split(/(?<=\.)\s/)[0]; return s.length > 180 ? s.slice(0, 177) + "…" : s; };
  const singular = (w) => w.replace(/ies$/, "y").replace(/ses$/, "s").replace(/s$/, "");

  function model(ctx) {
    const doc = ctx.doc, byId = {}, def = (n) => S.BY_ID[n.type] || { cls: "", name: n.type, cat: "" };
    doc.nodes.forEach((n) => { byId[n.id] = n; });
    const name = (n) => (n.props && n.props.name) || def(n).name;
    const out = (id) => doc.edges.filter((e) => e.from === id && byId[e.to]);
    const inn = (id) => doc.edges.filter((e) => e.to === id && byId[e.from]);
    const cls = (n) => def(n).cls, layer = (n) => ST.layerOf(def(n));
    const has = (p) => doc.nodes.some((n) => p(def(n), n));
    const r = doc.requirements || {}, conf = r.confirmed || {};
    const req = (k, dflt) => (conf[k] && r[k] != null && r[k] !== "" ? { v: r[k], basis: "user-confirmed" } : { v: dflt, basis: "assumed" });
    const slo = Object.assign({ p95: 300, avail: 99.5, budget: 5000 }, doc.slo || {});
    const services = doc.nodes.filter((n) => ["service", "proxy"].includes(cls(n)) && layer(n) !== "Edge");
    const stores = doc.nodes.filter((n) => ["db", "store"].includes(cls(n)));
    const queues = doc.nodes.filter((n) => cls(n) === "queue");
    const sources = doc.nodes.filter((n) => cls(n) === "source");
    const auth = doc.nodes.find((n) => ["auth", "cognito", "identityplatform", "entraid", "keycloak", "auth0", "oauthproxy"].includes(n.type) || def(n).tag === "iam" || /\b(auth|oidc|identity)\b/i.test(name(n)));
    const monitors = doc.nodes.filter((n) => ST.isMonitor(def(n)));
    const lintFor = (id) => ((ctx.lint && ctx.lint.findings) || []).filter((f) => f.nodes.includes(id));
    const planRow = (id) => ctx.plan && ctx.plan.components ? ctx.plan.components.find((c) => c.id === id) : null;
    const altFor = (n) => ctx.plan && ctx.plan.alternatives ? ctx.plan.alternatives.find((a) => a.name === name(n)) : null;
    const owners = (s) => [...new Set(inn(s.id).map((e) => byId[e.from]).filter((x) => x && cls(x) === "service").map((x) => x.id))];
    return { doc, byId, def, name, out, inn, cls, layer, has, req, slo, services, stores, queues, sources, auth, monitors, lintFor, planRow, altFor, owners, r, conf };
  }
  const header = (ctx, title) => [`# ${title}: ${ctx.doc.name || "Untitled design"}`, "", `Generated ${ctx.stamp || new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"} by Architecture Lab from canvas fingerprint **${ctx.hash || "—"}**. The canvas is the source of truth: regenerate after any change.`, "", "> Basis labels: **on canvas** = drawn; **user-confirmed** = answered in Requirements; **recommended** = a default to confirm; **assumed** = placeholder until confirmed; **unknown** = not on the canvas. Numbers come from a teaching model, not measurements or provider quotes.", ""];

  /* Contract of a wire, or a recommended one. */
  function contract(M, e) {
    const a = M.byId[e.from], b = M.byId[e.to], async = e.mode === "async" || M.cls(b) === "queue" || M.cls(a) === "queue";
    const ent = slug(singular(M.name(b).replace(/\b(service|api|server|app)\b/gi, "").trim() || M.name(b)));
    return {
      from: M.name(a), to: M.name(b), async,
      protocol: e.protocol || (async ? "message (AMQP / Kafka / cloud queue)" : M.cls(b) === "db" ? "SQL / driver" : "HTTPS (REST/JSON)"),
      api: e.api || (async ? `${slug(M.name(a))}.${ent}.changed` : M.cls(b) === "db" || M.cls(b) === "store" ? "owned data access" : `GET/POST /api/${ent}s`),
      payload: e.payload || "", timeout: e.timeout || (async ? "" : 800), retry: e.retry || (async ? "redelivery, then DLQ" : "1 retry with backoff (idempotent calls only)"),
      cls: e.classification || "unclassified", tls: e.tls !== false, basis: e.api || e.protocol ? "on canvas" : "recommended",
    };
  }

  function hld(ctx) {
    const M = model(ctx), L = header(ctx, "High-level design"), st = ctx.style || ST.recommendStyle(M.doc);
    const idea = M.req("idea", ""), users = M.req("usersLaunch", 1000), sens = M.req("dataSensitivity", "personal");
    L.push("## 1. Product summary", "", idea.v ? `${idea.v} *(${idea.basis})*` : "_Product description not recorded. Add it in Requirements._", "");
    L.push(`- Users at launch: ${users.v} *(${users.basis})*; after 12 months: ${M.req("users12m", (+users.v || 1000) * 5).v}`, `- Traffic: ${Math.round(+M.doc.scenario.base || 0).toLocaleString("en-US")} req/s peak, ${Math.round((M.doc.scenario.readFrac == null ? 0.9 : M.doc.scenario.readFrac) * 100)}% reads *(${M.conf.rps ? "user-confirmed" : "canvas setting"})*`, `- Most sensitive data: ${sens.v} *(${sens.basis})*; compliance: ${(M.r.compliance || []).map((x) => x.toUpperCase()).join(", ") || (M.r.complianceNone ? "none apply (user-confirmed)" : "not recorded")}`, "");
    L.push("## 2. Functional requirements (derived from the canvas: confirm each)", "");
    const fr = [];
    if (M.auth) fr.push("Users sign up, sign in and sign out; sessions expire; roles decide what each user may do.");
    M.services.filter((n) => M.layer(n) === "Application").forEach((n) => { const t = first((ctx.docs || {})[n.type]) || "core business capability — describe it."; fr.push(t.toLowerCase().startsWith(M.name(n).toLowerCase()) ? t : `${M.name(n)}: ${t}`); });
    if (M.has((d) => d.id === "payment")) fr.push("Users pay; each payment is idempotent, confirmed by webhook and reconciled daily.");
    if (M.has((d, n) => /email|notify|sms/i.test(d.name + M.name(n)))) fr.push("Users receive notifications (email / push / SMS) and can opt out.");
    if (M.has((d) => ST.isModel(d))) fr.push("Users ask questions and get AI answers grounded in approved sources, with a way to reach a human.");
    if (M.has((d) => d.tag === "agent")) fr.push("An AI agent performs allowed actions on the user's behalf; risky actions wait for human approval.");
    if (M.has((d) => d.tag === "audit")) fr.push("Every change to important records is written to an append-only audit trail.");
    fr.forEach((x, i) => L.push(`- FR-${i + 1}. ${x}`)); if (!fr.length) L.push("- Add services to the canvas to derive functional requirements.");
    L.push("", "## 3. Non-functional requirements", "", "| Requirement | Target | Basis |", "|---|---|---|");
    const goal = (k) => (M.conf[k] ? "user-confirmed" : "canvas goal (confirm in Requirements)");
    [["Availability", `${M.slo.avail}% (≈${Math.round((1 - M.slo.avail / 100) * 43200)} min downtime/month)`, goal("availability")], ["Latency", `p95 ≤ ${M.slo.p95} ms`, goal("p95")], ["Throughput", `${Math.round(+M.doc.scenario.base || 0).toLocaleString("en-US")} req/s peak`, goal("rps")], ["Budget", `≤ ${money(M.slo.budget)}/month`, goal("budget")],
      ["Recovery", M.slo.avail >= 99.95 ? "RTO 15 min, RPO 5 min, standby region" : M.slo.avail >= 99.9 ? "RTO 1 h, RPO 15 min" : "RTO 4 h, RPO 1 h", "recommended from the availability goal"], ["Security", "OWASP ASVS L2, TLS 1.2+, encryption at rest, least privilege", "recommended"], ["Observability", "RED metrics per service, traces across every hop, SLO alerts", "recommended"], ["Timeline", `${M.req("timelineWeeks", 12).v} weeks to MVP with ${M.req("teamSize", 4).v} engineers`, M.req("timelineWeeks", 12).basis]]
      .forEach(([a, b, c]) => L.push(`| ${a} | ${cell(b)} | ${c} |`));
    L.push("", "## 4. Architecture style and service count", "", `**Recommendation: ${st.style}.** MVP: **${st.mvpServices}** deployable service${st.mvpServices === 1 ? "" : "s"}; scale stage: **${st.scaleServices}**; drawn now: ${st.drawnServices}. Confidence ${Math.round(st.confidence * 100)}%.`, "", ...st.why.map((x) => "- " + x), "", "Based on: " + st.basis.join("; ") + ".", "", `Risk if wrong: ${st.riskIfWrong}`, "", "Split a module into its own service only when:", ...st.splitWhen.map((x) => "- " + x), "", "| Alternative | Choose it when | Trade-off |", "|---|---|---|", ...st.alternatives.map((a) => `| ${a.name} | ${a.when} | ${a.tradeoff} |`), "", "Validate before production: " + st.validate.join(" "), "");
    L.push("## 5. Layers and components", "");
    ST.LAYERS.forEach((l) => { const list = M.doc.nodes.filter((n) => M.layer(n) === l); if (list.length) L.push(`- **${l}** (${list.length}): ${list.map(M.name).join(", ")}`); });
    L.push("", "| Component | Type | Layer | Trust zone | Responsibility |", "|---|---|---|---|---|");
    M.doc.nodes.forEach((n) => L.push(`| ${cell(M.name(n))} | ${cell(M.def(n).name)} | ${M.layer(n)} | ${ST.zoneOf(M.def(n))} | ${cell(first((ctx.docs || {})[n.type]))} |`));
    L.push("", "## 6. Architecture diagram", "", "```mermaid", "flowchart LR");
    ST.LAYERS.forEach((l) => { const list = M.doc.nodes.filter((n) => M.layer(n) === l); if (!list.length) return; L.push(`  subgraph ${mid(l)}["${l}"]`); list.forEach((n) => L.push(`    ${mid(n.id)}["${mlabel(M.name(n))}"]`)); L.push("  end"); });
    M.doc.edges.forEach((e) => { if (M.byId[e.from] && M.byId[e.to]) L.push(`  ${mid(e.from)} ${e.mode === "async" || M.cls(M.byId[e.to]) === "queue" ? "-.->" : "-->"} ${mid(e.to)}`); });
    L.push("```", "", "## 7. User journeys (request paths on the canvas)", "");
    journeys(M).forEach((j, i) => L.push(`${i + 1}. ${j.map((id) => M.name(M.byId[id])).join(" → ")}`));
    L.push("", "## 8. Key decisions and trade-offs", "");
    (ctx.plan && ctx.plan.alternatives || []).slice(0, 8).forEach((a) => L.push(`- **${a.name}** uses ${a.current}; cheaper: ${a.alt}. Trade-off: ${a.trade}. Upgrade when: ${a.when}.`));
    L.push(`- Integration style: ${M.queues.length ? "events through " + M.queues.map(M.name).join(", ") + " for work that can finish later; synchronous HTTPS for reads and user-facing commands" : "synchronous calls only (no queue drawn)"}.`);
    L.push("", "## 9. Assumptions and unknowns", "");
    (ctx.reqState ? ctx.reqState.assumptions : []).forEach((a) => L.push("- " + a));
    ((ctx.lint && ctx.lint.findings) || []).filter((f) => f.basis === "not on canvas").forEach((f) => L.push(`- Unknown: ${f.title} (not on canvas).`));
    return L.join("\n") + "\n";
  }
  function journeys(M) {
    const res = [], walk = (id, path) => {
      if (res.length >= 8 || path.length > 12) return;
      const nexts = M.out(id).filter((e) => !e.fan && !["passive", "pool"].includes(M.cls(M.byId[e.to])) && !path.includes(e.to));
      if (!nexts.length || ["db", "store", "external"].includes(M.cls(M.byId[id]))) { if (path.length > 1) res.push(path.slice()); return; }
      nexts.slice(0, 3).forEach((e) => { path.push(e.to); walk(e.to, path); path.pop(); });
    };
    M.sources.forEach((s) => walk(s.id, [s.id]));
    return res;
  }

  function lld(ctx) {
    const M = model(ctx), L = header(ctx, "Low-level design");
    const sc = ctx.scen ? Object.fromEntries(ctx.scen.results.map((r) => [r.key, r])) : {};
    M.doc.nodes.filter((n) => M.cls(n) !== "source").forEach((n) => {
      const d = M.def(n), p = n.props || {}, c = d.cls, pr = ST.profile(d), row = M.planRow(n.id), alt = M.altFor(n), ins = M.inn(n.id), outs = M.out(n.id);
      const ownerTeam = M.layer(n) === "Application" || M.layer(n) === "AI" ? `${M.name(n)} team (one owning team; on-call for it)` : ["Data"].includes(M.layer(n)) ? (M.owners(n).length === 1 ? `owned by ${M.name(M.byId[M.owners(n)[0]])}` : M.owners(n).length ? `SHARED by ${M.owners(n).map((id) => M.name(M.byId[id])).join(", ")}: assign one owner` : "owner not on canvas") : "Platform team";
      const api = ins.map((e) => contract(M, e)).map((k) => `${k.async ? "consumes" : "serves"} ${k.api} from ${k.from} (${k.basis})`);
      const calls = outs.map((e) => contract(M, e)).map((k) => `${k.async ? "publishes" : "calls"} ${k.api} on ${k.to}${k.timeout ? `, timeout ${k.timeout} ms` : ""}`);
      const writes = outs.filter((e) => ["db", "store"].includes(M.cls(M.byId[e.to]))).map((e) => M.byId[e.to]);
      const cacheVia = outs.map((e) => M.byId[e.to]).filter((x) => M.cls(x) === "cache");
      const dlq = M.has((dd) => dd.tag === "dlq");
      const scaling = c === "db" ? `${p.ha ? "HA standby" : "single primary"}, ${p.replicas || 0} read replica(s), ${p.shards || 1} shard(s), ${p.consistency || "eventual"} reads` : c === "queue" ? `${p.workers || 1} consumer worker(s); scale on queue age` : ["service", "proxy", "router"].includes(c) ? `${row ? row.inst : p.inst || 1} instance(s)${p.auto ? ", autoscaling on CPU/requests" : " (no autoscaling)"}${p.ha ? ", HA pair" : ""}` : c === "cache" ? `${p.inst || 1} node(s), hit rate ${Math.round((p.hit == null ? d.hit || 0.8 : p.hit) * 100)}%` : "managed / not applicable";
      const failure = { service: `Instances sit behind a load balancer; losing one leaves ${Math.max(0, (p.inst || 1) - 1)} of ${p.inst || 1}. ${p.breaker ? "Callers fail fast via circuit breaker." : "Callers have no breaker."}`, proxy: "Stateless; replaced by the platform. Misroutes are rolled back by config versioning.", router: p.ha ? "HA pair: survives one node." : "Single point of failure until HA is on.", db: p.ha ? "Standby promoted automatically (≈2 min)." : "Writes stop until restored (≈20 min manual in the model).", cache: "Reads fall through to the data store; expect a load spike while it warms.", queue: "Messages persist; consumers resume and drain the backlog. Poison messages go to the DLQ.", external: "Calls time out; use breaker and fallback, retry from a queue.", store: "Managed durability; protect against deletion with versioning and backups.", passive: "Loss means blindness, not an outage: alert on missing data." }[c] || "—";
      const simKey = c === "db" ? "db-down" : c === "cache" ? "cache-fail" : c === "queue" ? "queue-backlog" : c === "external" ? (n.type === "payment" ? "payment-fail" : "third-party-timeout") : null;
      L.push(`## ${M.name(n)} — ${d.name}`, "", "| Aspect | Design | Basis |", "|---|---|---|");
      const row_ = (a, b, basis) => L.push(`| ${a} | ${cell(b)} | ${basis} |`);
      row_("Responsibility", first((ctx.docs || {})[n.type]) || "Describe its single responsibility.", "catalog description");
      row_("Layer / zone", `${pr.layer} / ${pr.zone}`, "on canvas");
      row_("Owner / team boundary", ownerTeam, "recommended");
      row_("APIs and events in", api.join("; ") || "none", ins.some((e) => e.api) ? "on canvas" : "recommended");
      row_("Calls and events out", calls.join("; ") || "none", outs.some((e) => e.api) ? "on canvas" : "recommended");
      row_("Dependencies", outs.map((e) => M.name(M.byId[e.to])).join(", ") || "none", "on canvas");
      row_("Data ownership", c === "service" ? (writes.length ? `writes ${writes.map(M.name).join(", ")}${writes.some((s) => M.owners(s).length > 1) ? " (shared: conflict)" : " (sole owner)"}` : "stateless") : ["db", "store"].includes(c) ? ownerTeam : "—", "on canvas");
      row_("Storage choice", ["db", "store", "cache"].includes(c) ? `${d.name}: ${scaling}` : writes.map((s) => M.def(s).name).join(", ") || "—", "on canvas");
      row_("Scaling", scaling, "on canvas");
      row_("Authentication / authorization", M.auth ? (c === "service" || c === "proxy" ? `validate OIDC tokens from ${M.name(M.auth)}; ${(M.auth.props || {}).authz || "RBAC (assumed)"}; deny by default` : ["db", "store", "cache", "queue"].includes(c) ? "workload identity / IAM role for the owning service only; no shared passwords" : "platform IAM") : "UNKNOWN: no identity provider on the canvas", M.auth ? "recommended" : "unknown");
      row_("Cache strategy", c === "cache" ? `cache-aside; TTL per key type; ${p.coalesce ? "miss coalescing on" : "add miss coalescing"}; never cache across tenants` : cacheVia.length ? `cache-aside via ${cacheVia.map(M.name).join(", ")}; invalidate on write` : "none", cacheVia.length || c === "cache" ? "on canvas" : "—");
      row_("Timeout / retry / breaker", ["service", "proxy"].includes(c) ? `timeout ${p.timeout || 1000} ms, ${p.retries || 0} retries (exponential backoff + jitter), breaker ${p.breaker ? "on" : "OFF"}${p.fallback ? " with fallback" : ""}` : "—", ["service", "proxy"].includes(c) ? "on canvas" : "—");
      row_("Idempotency / DLQ", c === "queue" ? `consumers store processed event ids; ${dlq ? "dead-letter queue on canvas" : "NO dead-letter queue"}` : c === "service" ? `${p.idem ? "idempotency keys on writes (on canvas)" : "add idempotency keys to POST/PUT that change state"}` : "—", "recommended");
      row_("Logs, metrics, traces, alerts", M.monitors.length ? `structured logs with trace id → ${M.monitors.map(M.name).join(", ")}; ${c === "db" || c === "cache" ? "USE metrics (utilisation, saturation, errors)" : "RED metrics (rate, errors, duration)"}; alert on SLO burn${c === "queue" ? " and oldest-message age" : ""}` : "UNKNOWN: no monitoring on canvas", M.monitors.length ? "on canvas + recommended" : "unknown");
      row_("Failure behaviour and recovery", failure + (simKey && sc[simKey] && sc[simKey].verdict !== "N/A" ? ` Simulation "${sc[simKey].name}": ${sc[simKey].verdict}.` : ""), simKey && sc[simKey] ? "simulated" : "recommended");
      row_("Cost estimate", row ? `${money(row.growth)}/month expected (${row.driver}, ${row.billing}); MVP ${money(row.mvp)}` : "—", "teaching estimate");
      row_("Cheaper alternative", alt ? `${alt.alt}: ${alt.trade}. Upgrade when ${alt.when}` : "—", alt ? "catalog decision table" : "—");
      row_("Complexity / limitations", `${pr.complexity}. ${pr.limitations.join(" ")}`, "catalog profile");
      row_("Security notes", pr.security.join("; "), "catalog profile");
      const f = M.lintFor(n.id); if (f.length) row_("Open findings", f.map((x) => `${x.sev}: ${x.title}`).join("; "), "checks");
      L.push("");
    });
    return L.join("\n") + "\n";
  }

  function api(ctx) {
    const M = model(ctx), L = header(ctx, "API plan"), paths = {};
    L.push("## Conventions (recommended)", "", "- REST over HTTPS with JSON; resources in plural nouns; versioned as `/v1` in the path.", "- Errors as RFC 9457 problem details (`type`, `title`, `status`, `detail`, `traceId`).", `- Authentication: ${M.auth ? `bearer tokens issued by ${M.name(M.auth)} (OIDC), validated at the gateway and again in each service` : "UNKNOWN: add an identity provider"}; authorization deny-by-default.`, "- Every state-changing request accepts an `Idempotency-Key` header; the server stores the result for 24 h.", "- Lists are paginated (`limit`, `cursor`); default 50, maximum 200.", "- Rate limits per client and per tenant; `429` with `Retry-After`.", "", "## Endpoints by service", "");
    M.services.forEach((s) => {
      const ins = M.inn(s.id).filter((e) => !["queue"].includes(M.cls(M.byId[e.from])));
      if (!ins.length) return;
      const ent = slug(singular(M.name(s).replace(/\b(service|api|server|app|gateway)\b/gi, "").trim() || M.name(s)));
      const listed = ins.map((e) => e.api).filter((a) => /^(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(a || ""));
      const eps = listed.length ? listed.map((a) => { const [m, p] = a.trim().split(/\s+/); return { m: m.toUpperCase(), p, basis: "on canvas" }; }) : [{ m: "GET", p: `/v1/${ent}s`, basis: "recommended" }, { m: "POST", p: `/v1/${ent}s`, basis: "recommended" }, { m: "GET", p: `/v1/${ent}s/{id}`, basis: "recommended" }, { m: "PATCH", p: `/v1/${ent}s/{id}`, basis: "recommended" }];
      L.push(`### ${M.name(s)}`, "", `Called by: ${[...new Set(ins.map((e) => M.name(M.byId[e.from])))].join(", ")}`, "", "| Method | Path | Auth | Idempotent | Basis |", "|---|---|---|---|---|");
      eps.forEach((x) => { L.push(`| ${x.m} | \`${x.p}\` | bearer | ${["GET", "PUT", "DELETE"].includes(x.m) ? "yes" : "with Idempotency-Key"} | ${x.basis} |`); (paths[x.p] = paths[x.p] || {})[x.m.toLowerCase()] = M.name(s); });
      L.push("");
    });
    L.push("## OpenAPI 3.1 skeleton", "", "```yaml", "openapi: 3.1.0", `info: { title: "${mlabel(M.doc.name || "API")}", version: "0.1.0" }`, "components:", "  securitySchemes:", "    oidc: { type: openIdConnect, openIdConnectUrl: https://YOUR-IDP/.well-known/openid-configuration }", "  schemas:", "    Problem: { type: object, properties: { type: { type: string }, title: { type: string }, status: { type: integer }, detail: { type: string }, traceId: { type: string } } }", "security: [ { oidc: [] } ]", "paths:", "  /health: { get: { security: [], responses: { '200': { description: healthy } } } }");
    Object.keys(paths).forEach((p) => { L.push(`  ${p}:`); Object.entries(paths[p]).forEach(([m, svc]) => L.push(`    ${m}: { tags: ["${mlabel(svc)}"], responses: { '${m === "post" ? 201 : 200}': { description: ok }, '4XX': { description: problem, content: { application/problem+json: { schema: { $ref: '#/components/schemas/Problem' } } } } } }`)); });
    L.push("```", "", "Replace the generic resources with the real domain model before implementation; the skeleton only fixes conventions.");
    return L.join("\n") + "\n";
  }

  function data(ctx) {
    const M = model(ctx), L = header(ctx, "Database design"), kms = M.has((d) => d.tag === "secrets" || ["kms-aws", "cloudkms", "cloudhsm"].includes(d.id)), backup = M.has((d) => d.tag === "backup");
    if (!M.stores.length) { L.push("No database or storage on the canvas."); return L.join("\n") + "\n"; }
    L.push("| Store | Engine | Owner | Consistency | HA / replicas / shards | Backup | Encryption at rest |", "|---|---|---|---|---|---|---|");
    M.stores.forEach((s) => { const p = s.props || {}, o = M.owners(s); L.push(`| ${cell(M.name(s))} | ${cell(M.def(s).name)} | ${o.length ? o.map((id) => M.name(M.byId[id])).join(", ") + (o.length > 1 ? " (SHARED)" : "") : "—"} | ${p.consistency || "eventual"} | ${p.ha ? "HA" : "no HA"} / ${p.replicas || 0} / ${p.shards || 1} | ${backup ? "on canvas" : "MISSING"} | ${kms ? "KMS on canvas" : "unknown"} |`); });
    L.push("", "## Entities (recommended starting point)", "", "Derived from the services that write to each store. Rename to the real domain model.", "", "```mermaid", "erDiagram");
    const tables = [];
    M.stores.filter((s) => M.cls(s) === "db").forEach((s) => {
      M.owners(s).forEach((oid) => {
        const t = slug(singular(M.name(M.byId[oid]).replace(/\b(service|api|server|app)\b/gi, "").trim())).replace(/-/g, "_") || "record";
        tables.push({ t, store: M.name(s) });
        L.push(`  ${t.toUpperCase()} {`, "    uuid id PK", "    uuid tenant_id", "    string status", "    timestamp created_at", "    timestamp updated_at", "    int version", "  }");
        L.push(`  ${t.toUpperCase()}_HISTORY {`, "    uuid id PK", `    uuid ${t}_id FK`, "    string change", "    timestamp at", "  }", `  ${t.toUpperCase()} ||--o{ ${t.toUpperCase()}_HISTORY : records`);
      });
    });
    if (M.queues.length) { L.push("  OUTBOX_EVENTS {", "    uuid id PK", "    uuid aggregate_id", "    string event_type", "    json payload", "    timestamp created_at", "    timestamp published_at", "  }"); tables.push({ t: "outbox_events", store: "each owning database" }); }
    if (M.has((d) => d.tag === "audit")) { L.push("  AUDIT_LOG {", "    uuid id PK", "    string actor", "    string action", "    string target", "    string trace_id", "    timestamp at", "  }"); tables.push({ t: "audit_log", store: "audit store (append-only)" }); }
    L.push("```", "", "## Indexes, retention and migrations", "");
    tables.forEach((x) => L.push(`- \`${x.t}\` in ${x.store}: index on (tenant_id, status, created_at)${x.t === "outbox_events" ? "; partial index where published_at is null" : ""}.`));
    L.push("- Retention: define per table (personal data: delete or anonymise on request and after the retention period).", "- Migrations: versioned and reversible (expand → migrate → contract); never drop a column in the same release that stops using it.", "- Multi-tenancy: tenant_id on every row and in every query; consider row-level security.", `- Data classification on wires: ${[...new Set(M.doc.edges.map((e) => e.classification).filter(Boolean))].join(", ") || "not recorded (set it on the wires)"}.`);
    return L.join("\n") + "\n";
  }

  function events(ctx) {
    const M = model(ctx), L = header(ctx, "Event contracts");
    if (!M.queues.length) { L.push("No queue or event stream on the canvas: there are no asynchronous contracts yet."); return L.join("\n") + "\n"; }
    L.push("## Envelope (every event)", "", "```json", JSON.stringify({ eventId: "uuid", type: "domain.entity.changed", version: 1, occurredAt: "RFC 3339 timestamp", producer: "service name", traceId: "W3C trace id", tenantId: "uuid", key: "ordering key (aggregate id)", data: {} }, null, 2), "```", "");
    M.queues.forEach((q) => {
      const prod = M.inn(q.id).map((e) => ({ e, k: contract(M, e) })), cons = M.out(q.id).map((e) => M.name(M.byId[e.to]));
      const dlq = M.def(q).tag === "dlq";
      L.push(`## ${M.name(q)} (${M.def(q).name})${dlq ? " — dead-letter queue" : ""}`, "", "| Event | Producer | Consumers | Payload | Delivery | Ordering key | Retry → DLQ | Basis |", "|---|---|---|---|---|---|---|---|");
      prod.forEach(({ e, k }) => L.push(`| \`${cell(k.api)}\` | ${cell(k.from)} | ${cell(cons.join(", ") || "none drawn")} | ${cell(e.payload || "ids + changed fields only (no secrets)")} | at-least-once | aggregate id | ${cell(e.retry || "5 attempts with backoff")} → ${M.has((d) => d.tag === "dlq") ? "DLQ" : "NO DLQ"} | ${k.basis} |`));
      L.push("", `Consumers must be idempotent (store processed eventId). Schema changes are additive; breaking changes get a new version and run side by side. Alert on oldest-message age${M.monitors.length ? "" : " (no monitoring on canvas yet)"}.`, "");
    });
    return L.join("\n") + "\n";
  }

  function pathFrom(M, src, kind) {
    const path = [src.id]; let cur = src.id;
    for (let i = 0; i < 12; i++) {
      const es = M.out(cur).filter((e) => !e.fan && !["passive", "pool"].includes(M.cls(M.byId[e.to])) && !path.includes(e.to) && (!e.only || e.only === kind));
      if (!es.length) break;
      const pref = (c) => es.find((e) => M.cls(M.byId[e.to]) === c);
      const e = kind === "r" ? (pref("cache") || es.find((e) => ["service", "proxy", "router", "cdn", "limiter"].includes(M.cls(M.byId[e.to]))) || es[0]) : (pref("queue") || es.find((e) => ["service", "proxy", "router", "limiter"].includes(M.cls(M.byId[e.to]))) || es[0]);
      path.push(e.to); cur = e.to;
      if (["db", "store", "external", "queue"].includes(M.cls(M.byId[cur]))) break;
    }
    return path;
  }
  function sequence(ctx) {
    const M = model(ctx), L = header(ctx, "Sequence diagrams");
    M.sources.slice(0, 3).forEach((src) => {
      [["r", "Read journey"], ["w", "Write journey"]].forEach(([kind, title]) => {
        const p = pathFrom(M, src, kind); if (p.length < 2) return;
        L.push(`## ${title}: ${M.name(src)}`, "", "```mermaid", "sequenceDiagram", "  autonumber");
        p.forEach((id) => L.push(`  participant ${mid(id)} as ${mlabel(M.name(M.byId[id]))}`));
        for (let i = 0; i < p.length - 1; i++) {
          const e = M.doc.edges.find((x) => x.from === p[i] && x.to === p[i + 1]), k = contract(M, e);
          L.push(`  ${mid(p[i])}${k.async ? "-)" : "->>"}${mid(p[i + 1])}: ${mlabel(k.api)}`);
          M.out(p[i + 1]).filter((x) => x.fan && M.byId[x.to]).forEach((x) => L.push(`  ${mid(p[i + 1])}->>${mid(x.to)}: parallel call`));
        }
        for (let i = p.length - 1; i > 0; i--) { const e = M.doc.edges.find((x) => x.from === p[i - 1] && x.to === p[i]); if (!contract(M, e).async) L.push(`  ${mid(p[i])}-->>${mid(p[i - 1])}: response`); else break; }
        L.push("```", "");
      });
    });
    if (M.has((d) => d.tag === "agent")) {
      const ag = M.doc.nodes.find((n) => M.def(n).tag === "agent"), gw = M.doc.nodes.find((n) => M.def(n).tag === "toolgw"), ap = M.doc.nodes.find((n) => M.def(n).tag === "approval");
      L.push("## AI agent tool call with approval", "", "```mermaid", "sequenceDiagram", "  participant U as User", `  participant A as ${mlabel(M.name(ag))}`, `  participant G as ${gw ? mlabel(M.name(gw)) : "Tool gateway (MISSING)"}`, `  participant H as ${ap ? mlabel(M.name(ap)) : "Human approval (MISSING)"}`, "  participant T as Tool / system", "  U->>A: request", "  A->>G: tool call + arguments", "  G->>G: allow-list and argument checks", "  alt risky or irreversible", "    G-)H: approval request", "    H--)G: approved / rejected", "  end", "  G->>T: execute", "  T-->>A: result", "  A-->>U: answer + what was done", "```", "");
    }
    return L.join("\n") + "\n";
  }

  function devops(ctx) {
    const M = model(ctx), L = header(ctx, "DevOps, network and IaC plan"), cloud = M.req("cloud", "any"), envs = M.req("environments", "full");
    const tools = M.doc.nodes.filter((n) => M.layer(n) === "DevOps").map(M.name), pool = M.has((d) => d.cls === "pool");
    L.push("## Environments", "", `- ${envs.v === "prod" ? "Production only" : envs.v === "staging" ? "Staging + production" : "Dev + staging + production"} *(${envs.basis})*; each in its own account/subscription/project with separate credentials.`, `- Cloud: ${cloud.v === "any" ? "not chosen (provider-neutral plan)" : String(cloud.v).toUpperCase()} *(${cloud.basis})*; region: ${M.req("region", "not chosen").v}.`, "");
    L.push("## Deployment targets", "", "| Component | Target | Instances | Release strategy | Basis |", "|---|---|---|---|---|");
    M.doc.nodes.filter((n) => ["service", "proxy", "router"].includes(M.cls(n))).forEach((n) => { const p = n.props || {}; L.push(`| ${cell(M.name(n))} | ${pool ? "Kubernetes deployment" : /serverless|lambda|function/i.test(M.def(n).name) ? "serverless function" : "managed containers (e.g. ECS Fargate / Azure Container Apps / Cloud Run)"} | ${p.inst || 1}${p.auto ? " + autoscaling" : ""} | ${p.deploy || "rolling"} | on canvas |`); });
    L.push("", "## Network design (recommended)", "", "- One VPC/VNet per environment across at least two availability zones.", "- **Public subnets**: only the load balancer / CDN origin / NAT. " + M.doc.nodes.filter((n) => ST.zoneOf(M.def(n)) === "Edge (DMZ)").map(M.name).join(", "), "- **Private application subnets**: " + M.doc.nodes.filter((n) => ST.zoneOf(M.def(n)) === "Private application").map(M.name).join(", "), "- **Isolated data subnets** (no internet route): " + M.doc.nodes.filter((n) => ST.zoneOf(M.def(n)) === "Data").map(M.name).join(", "), "- Private endpoints for managed data and secrets services; egress through NAT with an allow-list for third parties: " + (M.doc.nodes.filter((n) => M.cls(n) === "external").map(M.name).join(", ") || "none drawn") + ".", "", "Allowed flows between zones (security groups / network policies), from the wires:", "");
    const flows = new Set(); M.doc.edges.forEach((e) => { const a = M.byId[e.from], b = M.byId[e.to]; if (a && b && ST.zoneOf(M.def(a)) !== ST.zoneOf(M.def(b))) flows.add(`${ST.zoneOf(M.def(a))} → ${ST.zoneOf(M.def(b))}`); });
    [...flows].forEach((f) => L.push("- " + f)); L.push("- Everything else: denied.", "");
    L.push("## CI/CD pipeline", "", `Tools on the canvas: ${tools.join(", ") || "none drawn (recommended: GitHub Actions or GitLab CI, a container registry, Terraform)"}.`, "", "1. Commit → pull request with review and branch protection.", "2. Build, unit tests, lint, contract tests.", "3. Static analysis (SAST), dependency and licence scan, secrets scan.", "4. Build container image, generate SBOM, sign the image, push to the registry.", "5. Infrastructure plan (Terraform) reviewed; apply to staging.", "6. Deploy to staging; integration, smoke and DAST tests; load test before major releases.", "7. Manual approval gate for production.", `8. Production deploy (${[...new Set(M.services.map((n) => (n.props || {}).deploy || "rolling"))].join(", ") || "rolling"}), automatic rollback on SLO burn or failed health checks.`, "9. Post-deploy verification and change record.", "");
    L.push("## Infrastructure-as-Code layout (Terraform, recommended)", "", "```text", "infra/", "  modules/", "    network/        # VPC, subnets, NAT, endpoints, flow logs", "    edge/           # " + (M.doc.nodes.filter((n) => M.layer(n) === "Edge").map(M.name).join(", ") || "load balancer, WAF, CDN"), "    compute/        # " + (M.services.map(M.name).slice(0, 6).join(", ") || "services"), "    data/           # " + (M.stores.map(M.name).join(", ") || "databases"), M.queues.length ? "    messaging/      # " + M.queues.map(M.name).join(", ") : null, M.has((d) => d.cat === "AI & ML") ? "    ai/             # model endpoints, vector store, guardrails" : null, "    security/       # IAM roles, KMS keys, secrets, policies", "    observability/  # dashboards, alerts, log routing", "  envs/", "    dev/  staging/  prod/   # one state per environment, same modules", "```", "");
    L.push("## Observability", "", `On canvas: ${M.monitors.map(M.name).join(", ") || "nothing (add metrics, logs, tracing and alerting)"}.`, "- OpenTelemetry in every service; one trace id from the edge to the database.", `- SLOs: availability ${M.slo.avail}%, p95 ${M.slo.p95} ms; alert on fast and slow error-budget burn.`, "- Dashboards per service (RED) and per data store (USE); cost dashboard with FinOps tags.");
    return L.filter((x) => x != null).join("\n") + "\n";
  }

  function security(ctx) {
    const M = model(ctx), L = header(ctx, "Security threat model"), f = (ctx.lint && ctx.lint.findings) || [], open = (id) => f.some((x) => x.id === id);
    const status = (ok) => (ok ? "present on canvas" : "MISSING / unknown");
    const crossings = {}; M.doc.edges.forEach((e) => { const a = M.byId[e.from], b = M.byId[e.to]; if (!a || !b) return; const k = `${ST.zoneOf(M.def(a))} → ${ST.zoneOf(M.def(b))}`; if (ST.zoneOf(M.def(a)) !== ST.zoneOf(M.def(b))) (crossings[k] = crossings[k] || []).push(`${M.name(a)} → ${M.name(b)}`); });
    L.push("Method: STRIDE per trust-boundary crossing (Microsoft threat modelling), OWASP Top 10 (2021), OWASP API Security Top 10 (2023), OWASP Top 10 for LLM Applications (2025). A drawing cannot prove configuration: this model lists what to verify.", "", "## Trust boundaries crossed", "");
    Object.entries(crossings).forEach(([k, v]) => L.push(`- **${k}**: ${v.slice(0, 6).join("; ")}${v.length > 6 ? ` and ${v.length - 6} more` : ""}`));
    L.push("", "## STRIDE", "", "| Threat | Where | Mitigation | Status | Reference |", "|---|---|---|---|---|");
    const rows = [
      ["Spoofing", "Public → Edge", "OIDC authentication, MFA for admins, signed short-lived tokens", status(!open("no-authn") && !!M.auth), "OWASP API2:2023"],
      ["Tampering", "all wires", "TLS everywhere, mTLS for restricted data, signed images", status(!open("plaintext")), "OWASP A02:2021"],
      ["Repudiation", "Application → Data", "append-only audit log with actor, action, target, trace id", status(M.has((d) => d.tag === "audit")), "OWASP A09:2021"],
      ["Information disclosure", "Data zone", "private data subnets, encryption at rest with KMS, least-privilege IAM", status(!open("public-db") && !open("no-kms")), "OWASP A01/A05:2021"],
      ["Denial of service", "Edge", "WAF, rate limits, autoscaling, provider DDoS protection", status(!open("no-rate-limit")), "OWASP API4:2023"],
      ["Elevation of privilege", "Application", "authorization in every service (RBAC/ABAC), deny by default", status(!open("no-authz") && !open("no-authn")), "OWASP A01:2021, API1/API5:2023"],
    ];
    if (M.has((d) => d.cat === "AI & ML")) rows.push(["Prompt injection", "Public → AI", "input/output guardrails, retrieved text treated as data", status(!open("ai-injection")), "OWASP LLM01:2025"], ["Excessive agency", "AI → tools", "tool allow-list, argument validation, human approval", status(!open("ai-tools") && !open("ai-approval")), "OWASP LLM06:2025"], ["Unbounded consumption", "AI", "token budgets per user/tenant, rate limits, model router", status(!open("ai-cost")), "OWASP LLM10:2025"]);
    rows.forEach((r) => L.push(`| ${r.join(" | ")} |`));
    const fw = (M.r.compliance || []).map((x) => x.toUpperCase());
    L.push("", "## Compliance scope", "", fw.length ? `Recorded: ${fw.join(", ")} (user-confirmed). Relevant checks are in the findings below; a compliance owner must review data flows, retention and processor agreements.` : "Not recorded. Record frameworks (GDPR, HIPAA, PCI DSS, SOC 2, ISO 27001) in Checks.", "");
    L.push("## Open security, AI and compliance findings", "");
    f.filter((x) => ["security", "ai", "compliance"].includes(x.cat)).forEach((x) => L.push(`- **${x.sev}** ${x.title}: ${x.fix} (${x.ref}; ${x.basis}, confidence ${Math.round(x.confidence * 100)}%)`));
    if (!f.some((x) => ["security", "ai", "compliance"].includes(x.cat))) L.push("- None from the rule set. That is not proof of safety.");
    const br = ctx.scen && ctx.scen.results.find((r) => r.key === "breach");
    if (br && br.checks) { L.push("", "## Breach-attempt simulation", "", ...br.checks.map((c) => `- [${c.ok ? "x" : " "}] ${c.c}`)); }
    L.push("", "## Required before production", "", "- Threat-modelling workshop with the team on this diagram.", "- Penetration test and cloud security posture scan.", "- Secrets rotation and access review.", M.has((d) => d.cat === "AI & ML") ? "- AI red-team: direct and indirect prompt injection, data exfiltration through tools, jailbreaks." : null);
    return L.filter((x) => x != null).join("\n") + "\n";
  }

  function dr(ctx) {
    const M = model(ctx), L = header(ctx, "Disaster recovery plan"), rs = ctx.scen && ctx.scen.results.find((r) => r.key === "restore");
    const target = rs && rs.target ? rs.target : { rto: M.slo.avail >= 99.95 ? "15 min" : M.slo.avail >= 99.9 ? "1 h" : "4 h", rpo: M.slo.avail >= 99.95 ? "5 min" : M.slo.avail >= 99.9 ? "15 min" : "1 h" };
    L.push(`## Targets (recommended from the ${M.slo.avail}% availability goal)`, "", `- RTO (time to restore service): **${target.rto}**`, `- RPO (data you can afford to lose): **${target.rpo}**`, target.multi ? "- A warm standby region is needed for this goal." : "- One region across several zones meets this goal; a full region outage is an accepted risk to record.", "");
    L.push("## Capability per data store", "", "| Store | RPO on this design | RTO on this design | Meets target |", "|---|---|---|---|");
    (rs && rs.rows ? rs.rows : M.stores.map((s) => ({ name: M.name(s), rpo: "unknown", rto: "unknown", ok: false }))).forEach((r) => L.push(`| ${cell(r.name)} | ${cell(r.rpo)} | ${cell(r.rto)} | ${r.ok ? "likely" : "NO"} |`));
    L.push("", "## Backup policy (recommended)", "", "- Continuous backup / point-in-time restore for databases; daily snapshots kept 35 days; monthly kept 12 months (adjust to retention rules).", "- Copy backups to a separate account and region; immutable (object lock) against ransomware.", "- Encrypt backups with a key that the application role cannot delete.", "", "## Runbooks", "", "1. **Database primary fails**: confirm automatic failover; if none, promote a replica or restore to a new instance; repoint the service; verify writes.", "2. **Data corrupted or deleted**: stop writers, restore to a point before the event into a new instance, compare, switch over, replay safe events from the queue.", "3. **Region outage**: declare incident; " + (target.multi ? "fail over DNS / global load balancer to the standby region; promote the replica database; scale the standby to full size." : "rebuild from IaC in another region; restore from the cross-region backup copy; update DNS.") + "", "4. **Third-party outage**: open circuit breakers, queue requests, inform users; replay when healthy.", "", "## Drills", "", "- Restore drill every quarter with measured restore time; record it here.", "- Game day for failover twice a year.", rs ? `- Current simulator verdict for backup and DR: **${rs.verdict}**. ${rs.summary}` : "");
    return L.join("\n") + "\n";
  }

  function testing(ctx) {
    const M = model(ctx), L = header(ctx, "Test strategy");
    L.push("| Level | What | Pass criteria |", "|---|---|---|", "| Unit | domain rules in every service | ≥ 80% of business rules covered; fast (< 5 min) |", `| Contract | ${M.doc.edges.filter((e) => e.api).length} wires with recorded contracts (+ the rest once recorded) | consumer-driven contracts pass on both sides |`, "| Integration | each request path in the HLD journeys | happy path and main error paths pass in staging |", `| Load | expected ${Math.round(+M.doc.scenario.base || 0).toLocaleString("en-US")} req/s and peak (×3) | p95 ≤ ${M.slo.p95} ms, errors within ${M.slo.avail}% availability |`, "| Chaos | the Simulation Lab scenarios below, for real | service recovers without manual action within the RTO |", "| Security | SAST, dependency scan, DAST, secrets scan, pen test before launch | no critical/high open |", "| DR | restore drill and failover game day | measured RTO/RPO within target |");
    if (M.has((d) => d.cat === "AI & ML")) L.push("| AI evaluation | answer quality on a labelled set, groundedness/citations, refusal on out-of-scope, prompt-injection red-team set, tool-call safety | thresholds agreed with the product owner; zero unsafe tool calls |");
    if (ctx.scen) { L.push("", "## Simulation Lab status (teaching model)", "", "| Scenario | Verdict | Basis |", "|---|---|---|"); ctx.scen.results.forEach((r) => L.push(`| ${r.name} | ${r.verdict} | ${r.basis} |`)); L.push("", "Each scenario marked Pass here still needs a real test with production-like data before it counts (readiness level 3)."); }
    return L.join("\n") + "\n";
  }

  function roadmap(ctx) {
    const M = model(ctx), L = header(ctx, "Team and delivery roadmap"), st = ctx.style || ST.recommendStyle(M.doc);
    const weeks = +M.req("timelineWeeks", 12).v || 12, team = +M.req("teamSize", 4).v || 4, ph = (a, b) => `weeks ${Math.max(1, Math.round(a * weeks) + 1)}–${Math.max(1, Math.round(b * weeks))}`;
    const roles = [["Product owner", "priorities, acceptance, user research", true], ["Backend engineers", `${M.services.length} services/modules`, true], ["Frontend / mobile engineer", M.sources.map(M.name).join(", "), M.sources.some((s) => /web|browser|mobile|app/i.test(M.name(s) + M.def(s).name))], ["Platform / DevOps engineer", "CI/CD, IaC, environments, observability", true], ["Data engineer", "data model, migrations, analytics", M.stores.length > 2 || M.has((d) => d.cat === "Data & analytics")], ["AI/ML engineer", "models, RAG, evaluations, guardrails", M.has((d) => d.cat === "AI & ML")], ["Security champion", "threat model, scans, reviews", true], ["QA / test engineer", "test automation, load and chaos tests", team >= 5]];
    L.push(`## Team (${team} engineers ${M.conf.teamSize ? "user-confirmed" : "assumed"})`, "", "| Role | Focus | Needed |", "|---|---|---|", ...roles.map(([r, f, n]) => `| ${r} | ${cell(f)} | ${n ? "yes" : "later"} |`), "", `Service ownership: ${st.style}; ${st.mvpServices} deployable unit(s) for the MVP → about ${st.teams} team(s).`, "");
    L.push("## Phases and milestones", "", "| Phase | When | Scope | Exit criteria |", "|---|---|---|---|",
      `| 0. Foundations | ${ph(0, 0.15)} | repo, CI/CD, IaC, environments, identity, secrets, observability baseline | pipeline deploys a hello-world to staging with logs, traces and alerts |`,
      `| 1. MVP slice | ${ph(0.15, 0.6)} | ${cell(M.services.slice(0, 6).map(M.name).join(", ") || "core services")} on the main journey | journeys in the HLD work end to end in staging |`,
      `| 2. Hardening | ${ph(0.6, 0.85)} | close blocking findings, idempotency, retries/breakers, backups, load and chaos tests | readiness level 3 evidence (test validated) |`,
      `| 3. Launch readiness | ${ph(0.85, 1)} | security review, DR drill, runbooks, on-call, cost alerts | readiness level 4 sign-offs |`, "");
    L.push("## Scale-up triggers", "", `- Grow from ${st.mvpServices} to ${st.scaleServices} services when: ${st.splitWhen.join(" / ")}`);
    (ctx.plan && ctx.plan.alternatives || []).forEach((a) => L.push(`- ${a.name}: start with ${a.alt}; upgrade to ${a.current} when ${a.when}.`));
    L.push("", "## Backlog (draft user stories)", "");
    M.services.filter((n) => M.layer(n) === "Application" || M.layer(n) === "AI").slice(0, 20).forEach((n) => L.push(`- As a user, I can use **${M.name(n)}** (${M.def(n).name}). Done when its API contract, tests, metrics, alerts and runbook exist.`));
    ((ctx.lint && ctx.lint.findings) || []).filter((f) => ["critical", "high", "medium"].includes(f.sev)).forEach((f) => L.push(`- As the team, we fix: ${f.title}. ${f.fix}`));
    return L.join("\n") + "\n";
  }

  function cost(ctx) {
    const M = model(ctx), L = header(ctx, "Cost plan"), p = ctx.plan, ai = ST.aiTokenCost(M.doc, 1);
    if (!p) { L.push("The cost plan could not be calculated for this canvas."); return L.join("\n") + "\n"; }
    L.push(`Provider basis: ${p.provider.toUpperCase()}. Pricing reference: Architecture Lab teaching price list (sim.js), dated 2026-10. **Not a quote.** Check the official calculators: AWS https://calculator.aws/ · Azure https://azure.microsoft.com/pricing/calculator/ · Google Cloud https://cloud.google.com/products/calculator`, "", "## Scenarios", "", "| Scenario | Req/s | Monthly estimate | Note |", "|---|---|---|---|");
    p.scenarios.forEach((s) => L.push(`| ${s.name} | ${s.rps ? Math.round(s.rps).toLocaleString("en-US") : "—"} | ${s.key === "proto" ? "≈$0 cloud" : money(s.total)} | ${cell(s.note)} |`));
    L.push("", `All environments: ${money(p.envTotal)}/month. Budget: ${p.budget ? money(p.budget) : "not set"}.`, "");
    if (ai) L.push("## AI tokens", "", `About **${money(ai.monthly)}/month**${ai.router ? ` (${money(ai.without)} without the model router)` : ""}; ${ai.basis}.`, ...ai.assumptions.map((a) => "- " + a), "");
    L.push("## Per component", "", "| Component | Main driver | Billing | Basis | MVP | Expected | Peak | DR |", "|---|---|---|---|---|---|---|---|");
    p.components.forEach((c) => L.push(`| ${cell(c.name)} | ${cell(c.driver)} | ${cell(c.billing)} | ${cell(c.basis)} | ${money(c.mvp)} | ${money(c.growth)} | ${money(c.peak)} | ${money(c.dr)} |`));
    if (p.alternatives.length) { L.push("", "## Cheaper alternatives", "", "| Component | Current | Monthly | Alternative | Trade-off | Upgrade trigger |", "|---|---|---|---|---|---|"); p.alternatives.forEach((a) => L.push(`| ${cell(a.name)} | ${cell(a.current)} | ${money(a.cost)} | ${cell(a.alt)} | ${cell(a.trade)} | ${cell(a.when)} |`)); }
    L.push("", "## Hidden costs not in the totals", "", ...p.hidden.filter((h) => h.on).map((h) => `- ${h.item}: ${h.why}`));
    return L.join("\n") + "\n";
  }

  const GEN = { hld, lld, api, data, events, sequence, devops, security, dr, testing, roadmap, cost };
  function generate(key, ctx) { return GEN[key] ? GEN[key](ctx) : ""; }
  function all(ctx) {
    const parts = DOCS.map((d) => generate(d.key, ctx));
    return `# Architecture package: ${ctx.doc.name || "Untitled design"}\n\nCanvas fingerprint **${ctx.hash || "—"}**. Contents:\n\n${DOCS.map((d, i) => `${i + 1}. ${d.title}`).join("\n")}\n\n---\n\n` + parts.join("\n---\n\n");
  }
  return { DOCS, generate, all, contract, journeys: (ctx) => journeys(model(ctx)) };
});
