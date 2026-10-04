/* Design-studio helpers shared by the canvas, simulations and exports: architecture layers and trust zones,
 * a per-component profile (complexity, cost category, limitations, security notes), the architecture-style
 * and service-count recommendation, "simplify to a modular monolith", auto-layout and the AI token estimate.
 * Pure functions on a canvas document; nothing here touches the page. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sim.js"));
  else root.LabStudio = factory(root.LabSim);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";
  const LAYERS = ["Client", "Edge", "Application", "AI", "Data", "Messaging", "Security", "Observability", "DevOps", "Cloud Network", "External"];
  const LAYER_COLORS = { Client: "#2563eb", Edge: "#0e7490", Application: "#6d3fd0", AI: "#c026d3", Data: "#b45309", Messaging: "#15803d", Security: "#b91c1c", Observability: "#475569", DevOps: "#7c3aed", "Cloud Network": "#0369a1", External: "#9a3412" };
  const SEC_TAGS = new Set(["iam", "secrets", "audit", "siem", "threat", "compliance", "security-scan"]);
  const OBS_TAGS = new Set(["monitoring", "alerting", "tracing", "logging", "errors"]);
  const OPS_TAGS = new Set(["cicd", "registry", "iac", "gitops", "scm", "build", "deploy", "env", "quality", "flags", "config", "k8s-cp", "hpa", "discovery"]);
  const MODEL_IDS = new Set(["llm", "bedrock", "sagemaker", "vertex", "gemini", "azopenai", "azureml", "openai", "mlserver", "vllm"]);
  const SELF_HOSTED_MODELS = new Set(["llm", "vllm", "mlserver"]);

  const def = (n) => S.BY_ID[n.type] || { cls: "", name: n.type, cat: "" };
  const nm = (n) => (n.props && n.props.name) || def(n).name;
  const clone = (d) => JSON.parse(JSON.stringify(d));

  function layerOf(d) {
    if (!d) return "Application";
    if (d.cls === "source") return "Client";
    if (d.cat === "AI & ML") return "AI";
    if (d.cat === "Security & identity" || SEC_TAGS.has(d.tag) || ["auth", "keycloak", "auth0", "cognito", "entraid", "identityplatform", "oauthproxy"].includes(d.id)) return "Security";
    if (d.cat === "Observability" || d.monitor || OBS_TAGS.has(d.tag)) return "Observability";
    if (d.cat === "DevOps & CI/CD" || OPS_TAGS.has(d.tag) || (d.cat === "Containers & Kubernetes" && d.cls === "passive")) return "DevOps";
    if (d.cat === "Networking" || d.tag === "network") return "Cloud Network";
    if (d.cls === "external") return "External";
    if (["db", "store", "cache"].includes(d.cls) || d.cat === "Data & analytics") return "Data";
    if (d.cls === "queue") return "Messaging";
    if (["cdn", "limiter", "router"].includes(d.cls) || d.cat === "Traffic & edge") return "Edge";
    return "Application";
  }
  /* Trust zones for the security view and the threat model. */
  const ZONES = ["Public", "Edge (DMZ)", "Private application", "Data", "Management plane", "Third party"];
  function zoneOf(d) {
    const l = layerOf(d);
    if (l === "Client") return "Public";
    if (l === "Edge" || l === "Cloud Network") return "Edge (DMZ)";
    if (l === "Data") return "Data";
    if (l === "External") return "Third party";
    if (l === "Security" || l === "Observability" || l === "DevOps") return d.cls === "passive" ? "Management plane" : "Private application";
    return "Private application";
  }

  /* What a component is like to own: hover card, LLD and cost plan all use this. */
  function profile(d) {
    if (!d) return null;
    const name = (d.name || "") + " " + (d.id || "");
    const high = d.cls === "pool" || /kafka|cassandra|kubernetes|\beks\b|\baks\b|\bgke\b|mesh|istio|linkerd|spark|flink|hadoop|opensearch|elasticsearch|clickhouse|gpu|vllm|self-hosted/i.test(name) || ["llm"].includes(d.id);
    const low = d.cls === "passive" || d.cls === "cdn" || d.cls === "external" || /serverless|lambda|function|cloud run|app service|fargate|managed|firebase|dynamo|s3|blob|bucket/i.test(name) || d.auto;
    const complexity = high ? "High" : low ? "Low" : ["db", "queue", "proxy", "cache"].includes(d.cls) ? "Medium" : "Medium";
    const c = +d.cost || 0;
    const costCategory = d.cls === "external" ? "Usage-based (per call or message)" : c === 0 ? "Free or usage-based" : c < 50 ? "Low (under $50/mo each)" : c < 250 ? "Medium ($50–250/mo each)" : c < 1000 ? "High ($250–1,000/mo each)" : "Very high (over $1,000/mo each)";
    const L = {
      source: "Untrusted: every input from here must be validated server-side.",
      router: "Single entry point: needs HA and health checks; a misrouted rule can expose internal services.",
      proxy: "Adds a hop and its own capacity limit; misconfigured routes are a common exposure.",
      service: "Must be stateless to scale horizontally; capacity is per instance.",
      cache: "Data can be stale; a flush sends every read to the database at once (stampede).",
      queue: "Delivery is usually at-least-once: consumers must handle duplicates and ordering.",
      db: "Writes scale on one primary unless sharded; schema changes need care under load.",
      store: "Object storage is not a database: listing and small random writes are slow.",
      cdn: "Cached content goes stale until invalidated; dynamic pages gain little.",
      limiter: "Limits can block real users if set from guesses rather than measurements.",
      external: "Outages, rate limits and price changes are outside your control.",
      pool: "You operate the cluster: upgrades, node patching, capacity and cost.",
      passive: "Only helps if someone acts on it: alerts need owners and runbooks.",
    };
    const sec = {
      source: ["Treat as hostile input", "Use TLS everywhere"],
      router: ["Terminate TLS with managed certificates", "Only expose the ports and paths you need"],
      proxy: ["Validate tokens (OIDC/JWT) and apply rate limits here", "Log every denied request"],
      service: ["Least-privilege identity per service", "Validate input; no secrets in code or images"],
      cache: ["Keep in a private network with auth and TLS", "Do not cache data across tenants"],
      queue: ["Encrypt messages that carry personal data", "Restrict who can publish and consume"],
      db: ["Private subnet only, never public", "Encryption at rest with managed keys, backups encrypted"],
      store: ["Block public access by default", "Signed, short-lived URLs for downloads"],
      cdn: ["Origin only reachable from the CDN", "WAF rules and bot protection at the edge"],
      limiter: ["Per-client and per-tenant limits", "Alert on sustained blocking"],
      external: ["Keep API keys in a secrets manager", "Set timeouts; share only the data the provider needs"],
      pool: ["Patch nodes, restrict the control plane", "Network policies between namespaces"],
      passive: ["Logs can contain personal data: mask it and restrict access"],
    };
    const notes = (sec[d.cls] || []).slice();
    if (d.cat === "AI & ML") notes.push("Prompt injection and data leakage risks (OWASP LLM Top 10): guard inputs and outputs");
    if (d.tag === "agent") notes.push("Allow-list tools and require human approval for irreversible actions (OWASP LLM06)");
    const limits = [L[d.cls] || ""].filter(Boolean);
    if (d.cat === "AI & ML" && d.cls === "service") limits.push("Answers can be wrong or invented; latency and token cost vary with prompt size.");
    return { layer: layerOf(d), zone: zoneOf(d), complexity, costCategory, limitations: limits, security: notes };
  }

  const isModel = (d) => MODEL_IDS.has(d.id);
  const isMonitor = (d) => !!d.monitor || OBS_TAGS.has(d.tag) || (d.cls === "passive" && d.cat === "Observability");
  const topServices = (doc) => (doc.nodes || []).filter((n) => def(n).cls === "service" && Number((n.props || {}).__aiLevel || 1) === 1 && layerOf(def(n)) === "Application");

  /* Architecture style and exact service counts, with the evidence behind them. */
  function recommendStyle(doc) {
    const r = doc.requirements || {}, c = r.confirmed || {};
    const team = c.teamSize ? +r.teamSize : 4, weeks = c.timelineWeeks ? +r.timelineWeeks : 12;
    const rps = +((doc.scenario || {}).base) || 1000;
    const nodes = doc.nodes || [], drawn = topServices(doc);
    const hasQueue = nodes.some((n) => def(n).cls === "queue" && !["dlq", "approval"].includes(def(n).tag));
    const hasAI = nodes.some((n) => def(n).cat === "AI & ML" && def(n).cls === "service");
    const hasWorker = nodes.some((n) => /worker|consumer|job|batch/i.test(nm(n) + " " + def(n).name));
    const teams = Math.max(1, Math.ceil(team / 7));
    const basis = [c.teamSize ? `team of ${team} (you confirmed)` : `team of ${team} (assumed: set it in Requirements)`, c.timelineWeeks ? `${weeks}-week MVP (you confirmed)` : `${weeks}-week MVP (assumed)`, `about ${Math.round(rps).toLocaleString("en-US")} req/s from the traffic settings`, `${drawn.length} application service${drawn.length === 1 ? "" : "s"} drawn`];
    let style, mvp, scale, why = [];
    const extras = (hasQueue || hasWorker ? 1 : 0) + (hasAI ? 1 : 0);
    if (team <= 8) {
      style = "Modular monolith"; mvp = 1 + extras; scale = mvp + (rps >= 5000 ? 1 : 0) + (rps >= 20000 ? 1 : 0);
      why.push(`One team of ${team} ships faster with one deployable: one pipeline, one database schema with module boundaries, no network calls between modules.`);
      if (rps >= 5000) why.push(`At about ${Math.round(rps).toLocaleString("en-US")} req/s scale the monolith horizontally first; extract only the hottest path when a load test shows it needs a different scaling profile.`);
      if (extras) why.push(`${hasQueue || hasWorker ? "A separate worker for queued/background work" : ""}${hasQueue || hasWorker ? (hasAI ? " and an" : "") : "An"}${hasAI ? " AI service so model latency and GPU/token cost scale on their own" : ""}.`);
    } else if (team <= 20) {
      style = "Modular monolith with a few extracted services"; mvp = 1 + extras + 1; scale = Math.max(mvp, Math.min(drawn.length || mvp, teams * 2 + extras));
      why.push(`${teams} teams: extract only modules with a different scaling profile, release cadence or owner; keep the rest together.`);
    } else {
      style = "Microservices (one per bounded context and owning team)"; mvp = Math.max(3, Math.min(drawn.length || teams * 2, teams * 2)); scale = Math.max(mvp, teams * 3);
      why.push(`${teams} teams and ${Math.round(rps).toLocaleString("en-US")} req/s justify independent deployment and scaling per bounded context.`);
    }
    if (hasQueue) { style += " + event-driven integration"; why.push("Queues on the canvas: integrate modules/services with events (outbox + idempotent consumers) instead of chains of synchronous calls."); }
    const alternatives = [
      { name: "Serverless functions + managed database", when: "spiky or low traffic (under ~50 req/s), very short timeline, tiny team", tradeoff: "cold starts, per-request cost grows fast at steady high load, harder local testing" },
      { name: "Modular monolith", when: "one or two teams, unclear domain boundaries, MVP stage", tradeoff: "one deploy unit; must enforce module boundaries in code review" },
      { name: "Microservices", when: "several teams need to release independently or parts scale very differently", tradeoff: "distributed transactions, more infrastructure, observability and on-call cost" },
      { name: "Event-driven", when: "many consumers react to the same business events, or work can finish later", tradeoff: "eventual consistency, duplicate and out-of-order messages" },
    ];
    const simplify = drawn.length > scale ? drawn.map((n) => n.id) : [];
    const confidence = (c.teamSize ? 0.25 : 0) + (c.timelineWeeks ? 0.1 : 0) + (c.rps ? 0.15 : 0) + 0.3;
    return { style, mvpServices: mvp, scaleServices: scale, drawnServices: drawn.length, teams, why, basis, alternatives, simplify, confidence: Math.min(0.85, confidence),
      riskIfWrong: style.startsWith("Microservices") ? "Too many services too early: slower delivery, distributed-transaction bugs and a larger cloud bill." : "If teams or traffic grow faster than planned, the monolith becomes a release bottleneck; module boundaries make extraction cheaper later.",
      validate: ["Confirm team size and how many teams must release independently.", "Load-test the busiest module before deciding to split it out.", "List the bounded contexts and which data each owns."],
      splitWhen: ["A module needs a different scaling profile (for example 10× the traffic of the rest).", "A separate team owns it and is blocked by the shared release.", "It needs a different runtime, compliance boundary or failure isolation."] };
  }

  /* Merge several application services into one modular monolith node; wires are re-pointed, internal wires dropped. */
  function mergeServices(doc, ids, label) {
    const d = clone(doc), set = new Set(ids), group = d.nodes.filter((n) => set.has(n.id));
    if (group.length < 2) return { doc, changes: [] };
    const first = group[0], inst = Math.max(2, ...group.map((n) => +(n.props || {}).inst || 1));
    const x = Math.round(group.reduce((a, n) => a + n.x, 0) / group.length), y = Math.round(group.reduce((a, n) => a + n.y, 0) / group.length);
    const id = "mono" + Math.random().toString(36).slice(2, 7);
    const names = group.map(nm);
    const merged = { id, type: first.type, x, y, props: Object.assign({}, S.defaultProps(def(first)), { name: label || "Modular monolith", inst, auto: true, modules: names.join(", ") }) };
    d.nodes = d.nodes.filter((n) => !set.has(n.id)).concat([merged]);
    const seen = new Set(), edges = [];
    d.edges.forEach((e) => {
      const from = set.has(e.from) ? id : e.from, to = set.has(e.to) ? id : e.to;
      if (from === to) return;
      const k = from + "|" + to; if (seen.has(k)) return; seen.add(k);
      edges.push(Object.assign({}, e, { from, to }));
    });
    d.edges = edges;
    return { doc: d, changes: [`merged ${names.join(", ")} into one modular monolith (${inst} instances, autoscaling); calls between them become in-process module calls`] };
  }

  /* Layered auto-layout: columns follow the request flow from the clients; tooling goes underneath, grouped by layer. */
  function autoLayout(doc) {
    const d = clone(doc), top = d.nodes.filter((n) => Number((n.props || {}).__aiLevel || 1) === 1), ids = new Set(top.map((n) => n.id));
    const out = {}, tooling = new Set(top.filter((n) => ["passive", "pool"].includes(def(n).cls)).map((n) => n.id)); top.forEach((n) => { out[n.id] = []; });
    d.edges.forEach((e) => { if (ids.has(e.from) && ids.has(e.to) && e.from !== e.to && !tooling.has(e.to)) out[e.from].push(e.to); });
    const rank = {}, srcs = top.filter((n) => def(n).cls === "source");
    srcs.forEach((n) => { rank[n.id] = 0; });
    for (let i = 0; i < top.length; i++) {          // longest path from a client; a cycle stops at the cap
      let changed = false;
      top.forEach((n) => { if (rank[n.id] == null) return; out[n.id].forEach((to) => { const r = Math.min(rank[n.id] + 1, 12); if (rank[to] == null || rank[to] < r) { rank[to] = r; changed = true; } }); });
      if (!changed) break;
    }
    const flow = top.filter((n) => rank[n.id] != null), rest = top.filter((n) => rank[n.id] == null);
    const cols = {}; flow.forEach((n) => { (cols[rank[n.id]] = cols[rank[n.id]] || []).push(n); });
    const li = (n) => LAYERS.indexOf(layerOf(def(n)));
    let maxY = 0;
    Object.keys(cols).forEach((r) => {
      cols[r].sort((a, b) => li(a) - li(b) || nm(a).localeCompare(nm(b)));
      cols[r].forEach((n, i) => { n.x = 120 + +r * 220; n.y = 120 + i * 110; maxY = Math.max(maxY, n.y); });
    });
    const byLayer = {}; rest.forEach((n) => { (byLayer[layerOf(def(n))] = byLayer[layerOf(def(n))] || []).push(n); });
    let row = 0;
    LAYERS.forEach((l) => { const list = byLayer[l]; if (!list) return; list.forEach((n, i) => { n.x = 120 + (i % 8) * 180; n.y = maxY + 200 + (row + Math.floor(i / 8)) * 110; }); row += Math.ceil(list.length / 8); });
    return { doc: d, moved: top.length };
  }

  /* AI token spend: requirements (or assumptions) × a blended teaching price. Self-hosted models cost GPU time instead. */
  const PRICE = { premium: 10, small: 0.6 };   // USD per million tokens, teaching assumption dated 2026-10
  function aiTokenCost(doc, aiMult) {
    const nodes = doc.nodes || [], models = nodes.filter((n) => isModel(def(n)));
    if (!models.length && !nodes.some((n) => def(n).tag === "agent")) return null;
    const r = doc.requirements || {}, c = r.confirmed || {};
    const perDay = (c.aiRequestsDay ? +r.aiRequestsDay : 5000) * (aiMult == null ? 1 : +aiMult);
    const tokens = c.tokensPerRequest ? +r.tokensPerRequest : 1500;
    const router = nodes.some((n) => def(n).tag === "modelrouter" || n.type === "llmgw");
    const hosted = models.length && models.every((n) => SELF_HOSTED_MODELS.has(n.type));
    const tokMonth = perDay * 30 * tokens;
    const blended = router ? 0.8 * (0.4 * PRICE.premium + 0.6 * PRICE.small) : PRICE.premium;   // router: 20% cache hits, 60% of the rest to a small model
    const monthly = hosted ? 0 : (tokMonth / 1e6) * blended;
    const without = (tokMonth / 1e6) * PRICE.premium;
    return {
      monthly, without, perDay, tokens, tokensMonth: tokMonth, router, hosted,
      basis: c.aiRequestsDay && c.tokensPerRequest ? "user-confirmed volumes, estimated price" : "estimated (volumes assumed until set in Requirements)",
      assumptions: [`${Math.round(perDay).toLocaleString("en-US")} AI requests/day × ${tokens.toLocaleString("en-US")} tokens`, `premium model $${PRICE.premium} and small model $${PRICE.small} per million tokens (teaching prices, 2026-10; check your provider)`, router ? "model router: 20% semantic-cache hits, 60% of the rest routed to the small model" : "every request goes to the premium model", hosted ? "self-hosted model: no token bill, GPU cost is in the compute estimate" : ""].filter(Boolean),
    };
  }

  return { LAYERS, LAYER_COLORS, ZONES, layerOf, zoneOf, profile, recommendStyle, mergeServices, autoLayout, aiTokenCost, isModel, isMonitor, PRICE };
});
