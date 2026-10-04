/* Architecture linter: rules evaluated on the canvas graph (every level at once).
 * Each finding says what it is based on: "verified on canvas" (the drawing shows it), "not on canvas"
 * (the control may exist but is not drawn, so it is unknown), or "user-confirmed" (from requirements).
 * References name the standard or guidance the rule comes from; they are pointers, not a certification. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sim.js"));
  else root.LabLint = factory(root.LabSim);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";
  const REF = {
    spof: "AWS Well-Architected Reliability pillar; Google SRE book (removing single points of failure)",
    publicDb: "OWASP Top 10 (2021) A05 Security Misconfiguration; CIS cloud benchmarks (no publicly reachable databases)",
    authn: "OWASP API Security Top 10 (2023) API2 Broken Authentication",
    authz: "OWASP Top 10 (2021) A01 Broken Access Control; OWASP API Security Top 10 (2023) API1 and API5",
    crypto: "OWASP Top 10 (2021) A02 Cryptographic Failures; NIST SP 800-57 (key management)",
    backup: "NIST SP 800-34 Rev. 1 (contingency planning); tested-restore backup practice",
    observ: "OWASP Top 10 (2021) A09 Security Logging and Monitoring Failures; Google SRE book (monitoring)",
    rate: "OWASP API Security Top 10 (2023) API4 Unrestricted Resource Consumption",
    api: "OWASP API Security Top 10 (2023); defence in depth at the edge (gateway, WAF, rate limits)",
    dlq: "Cloud messaging guidance on dead-letter queues and redrive policies",
    cycle: "Dependency hygiene: call cycles cause cascading failures and deadlocks",
    owner: "Database-per-service / single data owner pattern",
    retry: "Circuit breaker pattern; Google SRE book (handling overload, retry budgets)",
    overeng: "Cost-aware architecture: modular monolith and managed services first, upgrade on measured triggers",
    egress: "Cloud provider data-transfer pricing (egress and cross-region transfer are billed per GB)",
    lockin: "Portability trade-off: provider-managed services versus open standards",
    unused: "Cost hygiene: provisioned resources bill even when idle",
    injection: "OWASP Top 10 for LLM Applications (2025) LLM01 Prompt Injection",
    agency: "OWASP Top 10 for LLM Applications (2025) LLM06 Excessive Agency",
    aicost: "AI cost control: model routing, semantic caching and token budgets",
    compliance: {
      gdpr: "GDPR Art. 32 (security of processing) and Art. 30 (records of processing)",
      hipaa: "HIPAA Security Rule, 45 CFR 164.312 (access, audit, integrity, transmission security)",
      pci: "PCI DSS v4.0 Requirements 3, 4 and 10 (stored data, encrypted transmission, logging)",
      soc2: "SOC 2 Trust Services Criteria (security and availability)",
      iso27001: "ISO/IEC 27001:2022 Annex A controls",
    },
  };
  const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const AUTH_IDS = new Set(["auth", "cognito", "identityplatform", "entraid", "keycloak", "auth0", "oauthproxy"]);
  const RATE_IDS = new Set(["apigw", "apigw-aws", "apigee", "apim", "kong", "springgw", "cloudflare", "akamai", "cloudarmor", "waf", "waf-aws", "azwaf", "shield", "frontdoor"]);
  const KMS_IDS = new Set(["kms-aws", "cloudkms", "cloudhsm"]);
  const MODEL_IDS = new Set(["llm", "bedrock", "sagemaker", "vertex", "gemini", "azopenai", "azureml", "openai", "mlserver", "vllm"]);
  const STREAM_IDS = new Set(["kafka", "msk", "stream"]);

  function lint(doc, opts) {
    opts = opts || {};
    const nodes = doc.nodes || [], edges = doc.edges || [], req = doc.requirements || {}, slo = doc.slo || {};
    const rps = opts.rps != null ? opts.rps : +((doc.scenario || {}).base) || 1000;
    const def = (n) => S.BY_ID[n.type] || { cls: "", name: n.type };
    const nm = (n) => (n.props && n.props.name) || def(n).name;
    const label = (n) => nm(n) + " " + def(n).name;
    const byId = {}; nodes.forEach((n) => { byId[n.id] = n; });
    const out = [];
    const add = (f) => out.push(Object.assign({ basis: "verified on canvas", confidence: 0.9, nodes: [] }, f));
    const any = (pred) => nodes.some((n) => pred(def(n), n));
    const all = (pred) => nodes.filter((n) => pred(def(n), n));
    const names = (list, max) => list.slice(0, max || 4).map(nm).join(", ") + (list.length > (max || 4) ? ` and ${list.length - (max || 4)} more` : "");

    const sources = all((d) => d.cls === "source");
    const services = all((d) => d.cls === "service");
    const isMonitor = (d) => d.monitor || ["monitoring", "alerting", "tracing", "logging", "errors"].includes(d.tag) || (d.cls === "passive" && d.cat === "Observability");
    const isAuth = (d, n) => AUTH_IDS.has(d.id) || d.tag === "iam" || /\b(auth|oidc|sso|identity|login)\b/i.test(nm(n));
    const isAuthz = (d, n) => d.tag === "iam" || /rbac|abac|polic|authori[sz]|permission|\bopa\b/i.test(label(n)) || !!(n.props || {}).authz;
    const isRate = (d) => d.cls === "limiter" || RATE_IDS.has(d.id);
    const isKms = (d) => d.tag === "secrets" || KMS_IDS.has(d.id);
    const isBackup = (d, n) => d.tag === "backup" || /backup|snapshot/i.test(nm(n));
    const isDlq = (d, n) => d.tag === "dlq" || /dead.?letter|\bdlq\b/i.test(nm(n));
    const isModel = (d) => MODEL_IDS.has(d.id);
    const isAgent = (d, n) => d.tag === "agent" || /\bagents?\b/i.test(nm(n));
    const isGuard = (d, n) => d.tag === "guardrail" || /guardrail|moderation|content safety|prompt shield/i.test(nm(n));
    const isToolGw = (d, n) => d.tag === "toolgw" || /tool gateway|tool allow/i.test(nm(n));
    const isApproval = (d, n) => d.tag === "approval" || /approv|human.in.the.loop|human review/i.test(nm(n));
    const isAudit = (d, n) => d.tag === "audit" || /audit/i.test(nm(n));

    // reachability from any client
    const reach = new Set(sources.map((n) => n.id)), queue = sources.map((n) => n.id);
    while (queue.length) { const id = queue.shift(); edges.forEach((e) => { if (e.from === id && !reach.has(e.to) && byId[e.to]) { reach.add(e.to); queue.push(e.to); } }); }

    // ---- security
    edges.forEach((e) => {
      const a = byId[e.from], b = byId[e.to]; if (!a || !b) return;
      const da = def(a), db = def(b);
      if (da.cls === "source" && ["db", "cache"].includes(db.cls))
        add({ id: "public-db", sev: "critical", cat: "security", title: "Database reachable from the public side", detail: `${nm(a)} connects straight to ${nm(b)}. Anything a client can reach, an attacker can reach.`, fix: `Put an API service in front of ${nm(b)} and keep the database in a private network.`, ref: REF.publicDb, nodes: [a.id, b.id], confidence: 0.95 });
      if (da.cls === "source" && db.cls === "service")
        add({ id: "unprotected-api", sev: "high", cat: "security", title: "API exposed without a gateway or load balancer", detail: `${nm(a)} calls ${nm(b)} directly: no TLS termination point, WAF, rate limit or central authentication in between.`, fix: "Route client traffic through an API gateway or load balancer with a WAF.", ref: REF.api, nodes: [a.id, b.id] });
      const cls = String(e.classification || "").toLowerCase();
      if (e.tls === false && (["confidential", "restricted"].includes(cls) || da.cls === "source"))
        add({ id: "plaintext", sev: "critical", cat: "security", title: "Sensitive traffic without TLS", detail: `${nm(a)} → ${nm(b)} is marked${cls ? " " + cls : " public-facing"} but has TLS turned off.`, fix: "Turn on TLS for this connection (mTLS between services that carry restricted data).", ref: REF.crypto, nodes: [a.id, b.id], confidence: 0.95 });
    });
    if (sources.length && services.length && !any(isAuth))
      add({ id: "no-authn", sev: "high", cat: "security", title: "No authentication on the canvas", detail: "Clients reach services, but no identity provider or auth service is drawn.", fix: "Add an identity provider (OIDC) or auth service and route requests through it or validate its tokens at the gateway.", ref: REF.authn, basis: "not on canvas", confidence: 0.75 });
    else if (any(isAuth) && !any(isAuthz))
      add({ id: "no-authz", sev: "medium", cat: "security", title: "Authorization rules are not visible", detail: "Users are authenticated, but nothing on the canvas says who may do what (roles, policies, tenant isolation).", fix: "Name the authorization model (RBAC, ABAC or a policy engine) on the auth or gateway box and check it in every service.", ref: REF.authz, basis: "not on canvas", confidence: 0.6 });
    if (sources.length && (services.length || any((d) => d.cls === "proxy")) && !any(isRate))
      add({ id: "no-rate-limit", sev: "medium", cat: "security", title: "No rate limiting", detail: "Nothing limits how many requests one client can send, so a bot or a bug can exhaust capacity and money.", fix: "Add a rate limiter, WAF or API gateway with per-client limits.", ref: REF.rate });
    const stores = all((d) => ["db", "store"].includes(d.cls));
    if (stores.length && !any(isKms))
      add({ id: "no-kms", sev: "medium", cat: "security", title: "Encryption and key management not shown", detail: `${names(stores)} keep data, but no key management or secrets service is drawn, so encryption at rest and secret handling are unknown.`, fix: "Add a KMS / secrets manager, encrypt data at rest and keep credentials out of code.", ref: REF.crypto, nodes: stores.map((n) => n.id), basis: "not on canvas", confidence: 0.55 });

    // ---- reliability and operations
    const lonelyDb = all((d, n) => d.cls === "db" && !(n.props || {}).ha && !((n.props || {}).replicas > 0) && d.tag !== "approval");
    if (lonelyDb.length) add({ id: "spof-db", sev: "high", cat: "reliability", title: "Database without failover", detail: `${names(lonelyDb)} ${lonelyDb.length === 1 ? "has" : "have"} no replica or standby: one failure stops every write.`, fix: "Turn on high availability (a standby in another zone) or add a replica with automatic promotion.", ref: REF.spof, nodes: lonelyDb.map((n) => n.id) });
    const lonelyLb = all((d, n) => d.cls === "router" && !(n.props || {}).ha && edges.some((e) => e.from === n.id));
    if (lonelyLb.length && nodes.length > 3) add({ id: "spof-lb", sev: "medium", cat: "reliability", title: "Load balancer is a single point of failure", detail: `${names(lonelyLb)} ${lonelyLb.length === 1 ? "is" : "are"} not highly available.`, fix: "Use a managed load balancer or turn on HA.", ref: REF.spof, nodes: lonelyLb.map((n) => n.id) });
    const single = services.filter((n) => reach.has(n.id) && (+(n.props || {}).inst || 1) === 1 && !(n.props || {}).auto);
    if (single.length) add({ id: "spof-service", sev: "low", cat: "reliability", title: "Single-instance services", detail: `${names(single)} run${single.length === 1 ? "s" : ""} one instance without autoscaling.`, fix: "Run at least two instances across zones, or turn on autoscaling.", ref: REF.spof, nodes: single.map((n) => n.id) });
    if (stores.length && !any(isBackup))
      add({ id: "no-backup", sev: "high", cat: "reliability", title: "No backups on the canvas", detail: "Replicas copy mistakes and ransomware too; only a separate, tested backup brings deleted or corrupted data back.", fix: "Add a backup vault with point-in-time restore, copy it to another account or region, and test a restore.", ref: REF.backup, nodes: stores.map((n) => n.id), basis: "not on canvas", confidence: 0.7 });
    if (nodes.length > 2 && !any(isMonitor))
      add({ id: "no-observability", sev: "high", cat: "operations", title: "No monitoring, logs or tracing", detail: "Failures and attacks will be noticed by users before you.", fix: "Add metrics, logs, tracing and alerting (OpenTelemetry plus a backend).", ref: REF.observ });
    const queues = all((d, n) => d.cls === "queue" && !isDlq(d, n) && !isApproval(d, n));
    if (queues.length && !any(isDlq))
      add({ id: "no-dlq", sev: "medium", cat: "reliability", title: "No dead-letter queue", detail: `${names(queues)} ${queues.length === 1 ? "has" : "have"} nowhere to put messages that keep failing; one bad message can block or loop forever.`, fix: "Add a dead-letter queue with an alert and a replay path.", ref: REF.dlq, nodes: queues.map((n) => n.id) });
    const retrying = all((d, n) => (+(n.props || {}).retries || 0) > 0 && !(n.props || {}).breaker);
    if (retrying.length) add({ id: "retry-storm", sev: "medium", cat: "reliability", title: "Retries without a circuit breaker", detail: `${names(retrying)} retr${retrying.length === 1 ? "ies" : "y"} failed calls without a breaker: a slow dependency gets more load exactly when it is weakest.`, fix: "Add a circuit breaker and capped exponential backoff with jitter.", ref: REF.retry, nodes: retrying.map((n) => n.id) });
    // Only synchronous call cycles: publishing to and consuming from a queue or event bus is the normal
    // way to decouple services, so a loop that passes through one is not a dependency cycle.
    const syncOut = {}; nodes.forEach((n) => { syncOut[n.id] = []; });
    edges.forEach((e) => { const a = byId[e.from], b = byId[e.to]; if (a && b && e.from !== e.to && e.mode !== "async" && def(a).cls !== "queue" && def(b).cls !== "queue") syncOut[e.from].push(e.to); });
    const color = {}, cycles = [];
    const dfs = (id, path) => {
      color[id] = 1; path.push(id);
      for (const to of syncOut[id]) {
        if (color[to] === 1) cycles.push(path.slice(path.indexOf(to)));
        else if (!color[to]) dfs(to, path);
      }
      path.pop(); color[id] = 2;
    };
    nodes.forEach((n) => { if (!color[n.id]) dfs(n.id, []); });
    cycles.slice(0, 3).forEach((c) => add({ id: "cycle", sev: "high", cat: "reliability", title: "Circular dependency", detail: `${c.map((id) => nm(byId[id])).join(" → ")} → ${nm(byId[c[0]])} call each other synchronously, so they slow down and fail together.`, fix: "Break the cycle with an event or a one-way call.", ref: REF.cycle, nodes: c }));
    stores.filter((n) => def(n).cls === "db").forEach((n) => {
      const writers = [...new Set(edges.filter((e) => e.to === n.id && byId[e.from] && def(byId[e.from]).cls === "service").map((e) => e.from))];
      if (writers.length >= 2) add({ id: "shared-db", sev: "medium", cat: "data", title: "Data ownership conflict", detail: `${nm(n)} is used directly by ${names(writers.map((id) => byId[id]))}. Shared tables couple deployments and blur who owns the data.`, fix: `Give ${nm(n)} one owning service; others use its API or its events.`, ref: REF.owner, nodes: [n.id].concat(writers), confidence: 0.7 });
    });

    // ---- cost
    const unused = nodes.filter((n) => !reach.has(n.id) && !["source", "passive", "pool"].includes(def(n).cls) && sources.length);
    if (unused.length) add({ id: "unused", sev: "low", cat: "cost", title: "Components no request reaches", detail: `${names(unused)} ${unused.length === 1 ? "is" : "are"} not reachable from any client: you would pay for ${unused.length === 1 ? "it" : "them"} without using ${unused.length === 1 ? "it" : "them"}.`, fix: "Connect them to the flow that needs them, or remove them.", ref: REF.unused, nodes: unused.map((n) => n.id) });
    const pools = all((d) => d.cls === "pool");
    if (pools.length && rps < 1000) add({ id: "overeng-k8s", sev: "low", cat: "cost", title: "Kubernetes before it pays off", detail: `A Kubernetes cluster at about ${Math.round(rps)} req/s: serverless containers usually cost less and need less operations work at this scale.`, fix: "Start on serverless containers; move to Kubernetes after sustained load above about 1,000 req/s or many always-on services.", ref: REF.overeng, nodes: pools.map((n) => n.id), basis: "estimated", confidence: 0.6 });
    const streams = all((d) => STREAM_IDS.has(d.id));
    if (streams.length && rps < 2000) add({ id: "overeng-stream", sev: "low", cat: "cost", title: "Event streaming before it is needed", detail: "Kafka-class streaming at this traffic: a managed queue or pub/sub is usually enough and much cheaper to run.", fix: "Use a managed queue until you need replay, strict ordering per key or very high throughput.", ref: REF.overeng, nodes: streams.map((n) => n.id), basis: "estimated", confidence: 0.6 });
    const topServices = services.filter((n) => Number((n.props || {}).__aiLevel || 1) === 1);
    if (topServices.length >= 8 && rps < 1000) add({ id: "overeng-micro", sev: "low", cat: "cost", title: "Many services for modest traffic", detail: `${topServices.length} top-level services at about ${Math.round(rps)} req/s.`, fix: "Group them into a modular monolith until several teams need to deploy independently.", ref: REF.overeng, nodes: topServices.map((n) => n.id), basis: "estimated", confidence: 0.55 });
    const regions = [...new Set(nodes.map((n) => (n.props || {}).region).filter(Boolean))];
    if (regions.length >= 2 && (+slo.avail || 0) < 99.95) add({ id: "overeng-region", sev: "low", cat: "cost", title: "Multi-region for a single-region goal", detail: `The design spans ${regions.length} regions but the availability goal is ${slo.avail || "?"}%.`, fix: "One region across several zones meets goals below 99.95% at far lower cost.", ref: REF.overeng, basis: "estimated", confidence: 0.6 });
    edges.forEach((e) => {
      const a = byId[e.from], b = byId[e.to]; if (!a || !b) return;
      if (def(a).cls === "source" && def(b).cls === "store") add({ id: "egress-store", sev: "low", cat: "cost", title: "Downloads served straight from storage", detail: `${nm(a)} downloads from ${nm(b)} without a CDN.`, fix: "Put a CDN in front: cheaper egress and faster for users.", ref: REF.egress, nodes: [a.id, b.id], basis: "estimated", confidence: 0.6 });
      const ra = (a.props || {}).region, rb = (b.props || {}).region;
      if (ra && rb && ra !== rb) add({ id: "egress-region", sev: "low", cat: "cost", title: "Cross-region traffic", detail: `${nm(a)} → ${nm(b)} crosses from ${ra} to ${rb}; this transfer is billed per GB and adds latency.`, fix: "Keep request paths inside one region; replicate data asynchronously.", ref: REF.egress, nodes: [a.id, b.id], basis: "estimated", confidence: 0.6 });
    });
    const provCount = {}; nodes.forEach((n) => { const p = def(n).prov; if (["aws", "gcp", "azure"].includes(p)) provCount[p] = (provCount[p] || 0) + 1; });
    Object.entries(provCount).filter(([, c]) => c >= 5).forEach(([p, c]) => add({ id: "lock-in", sev: "info", cat: "cost", title: `Deep use of ${p.toUpperCase()}-specific services`, detail: `${c} components are ${p.toUpperCase()}-only. That is often the right trade, but moving later means rework.`, fix: "Keep data in open formats and wrap provider APIs behind your own interfaces where moving is plausible.", ref: REF.lockin, basis: "estimated", confidence: 0.5 }));
    if (opts.monthlyCost != null && +slo.budget > 0 && opts.monthlyCost > +slo.budget)
      add({ id: "over-budget", sev: "high", cat: "cost", title: "Over the monthly budget", detail: `Estimated $${Math.round(opts.monthlyCost).toLocaleString("en-US")}/month against a $${Math.round(+slo.budget).toLocaleString("en-US")} budget.`, fix: "Open the cost plan for cheaper alternatives, or raise the budget deliberately.", ref: REF.overeng, basis: "estimated", confidence: 0.5 });

    // ---- AI
    const models = all(isModel), agents = all(isAgent);
    if ((models.length || agents.length) && !any(isGuard))
      add({ id: "ai-injection", sev: "high", cat: "ai", title: "Model calls without guardrails", detail: `${names(models.concat(agents))} receive${models.length + agents.length === 1 ? "s" : ""} text that may carry injected instructions, and nothing filters inputs or outputs.`, fix: "Add AI guardrails in front of every model call: input filtering, output checks and no secrets in prompts.", ref: REF.injection, nodes: models.concat(agents).map((n) => n.id) });
    if (agents.length && !any(isToolGw))
      add({ id: "ai-tools", sev: "high", cat: "ai", title: "Agent tools without an allow-list", detail: `${names(agents)} can call tools with nothing checking which tools and arguments are allowed.`, fix: "Route every tool call through a tool gateway with an allow-list, argument checks and logging.", ref: REF.agency, nodes: agents.map((n) => n.id) });
    if (agents.length && !any(isApproval))
      add({ id: "ai-approval", sev: "high", cat: "ai", title: "No human approval for risky agent actions", detail: "Payments, outgoing messages and deletions can run without a person agreeing.", fix: "Add a human approval queue for irreversible or costly actions.", ref: REF.agency, nodes: agents.map((n) => n.id), confidence: 0.8 });
    if (models.length && !any((d) => d.tag === "modelrouter" || d.id === "llmgw"))
      add({ id: "ai-cost", sev: "low", cat: "cost", title: "Every request goes to the model", detail: "No model router, gateway or semantic cache: easy and repeated questions pay full model price.", fix: "Add a model router with a semantic cache and per-user token budgets.", ref: REF.aicost, nodes: models.map((n) => n.id), basis: "estimated", confidence: 0.6 });

    // ---- compliance
    const frameworks = (req.compliance || []).map((x) => String(x).toLowerCase()).filter((x) => REF.compliance[x]);
    frameworks.forEach((fw) => {
      const missing = [];
      if (!any(isAudit)) missing.push("an audit log");
      if (!any(isKms)) missing.push("key management / encryption at rest");
      if (!any(isAuth)) missing.push("authentication");
      if (stores.length && !any(isBackup)) missing.push("backups");
      if (missing.length) add({ id: "compliance-" + fw, sev: "high", cat: "compliance", title: `${fw.toUpperCase()} controls missing from the design`, detail: `You marked ${fw.toUpperCase()} as required, but the canvas has no ${missing.join(", ")}.`, fix: "Add the missing controls, then have a compliance owner review data flows and retention.", ref: REF.compliance[fw], basis: "user-confirmed", confidence: 0.8 });
    });
    if (!frameworks.length && any((d) => d.id === "payment"))
      add({ id: "compliance-unknown", sev: "info", cat: "compliance", title: "Payments on the canvas, compliance not recorded", detail: "Card payments usually bring PCI DSS scope; personal data brings GDPR or local privacy law.", fix: "Record the compliance needs in the requirements so the checks can apply.", ref: REF.compliance.pci, basis: "unknown", confidence: 0.4 });

    out.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }; out.forEach((f) => { counts[f.sev]++; });
    return { findings: out, counts, blocking: counts.critical + counts.high };
  }

  return { lint, REF, SEV_ORDER };
});
