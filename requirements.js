/* Requirements intake: the inputs the spec asks for, which of them the user has confirmed, the clarifying
 * questions still open, and the assumption used meanwhile. Saving syncs traffic and goals into the canvas
 * document so the simulator, checks, cost plan and readiness all use the same numbers. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sim.js"));
  else root.LabReq = factory(root.LabSim);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";
  const has = (doc, pred) => (doc.nodes || []).some((n) => pred(S.BY_ID[n.type] || {}, n));
  const AI = (doc) => has(doc, (d) => d.cat === "AI & ML");
  const RAG = (doc) => has(doc, (d) => ["vector", "pinecone", "pgvector", "qdrant", "weaviate", "milvus", "embed"].includes(d.id));
  const STORE = (doc) => has(doc, (d) => ["db", "store"].includes(d.cls));

  /* group, key, label, kind, why it matters, default (doc => value), when it applies, essential */
  const FIELDS = [
    ["Product", "idea", "What does the product do, and for whom?", "text", "Everything else is sized and checked against this.", () => "", null, true],
    ["Product", "dataSensitivity", "Most sensitive data it handles", "select:public=Public only|internal=Internal business data|personal=Personal data|payment=Card or payment data|health=Health data", "Decides encryption, audit, residency and compliance scope.", () => "personal", null, true],
    ["Scale", "usersLaunch", "Users at launch", "number", "Sets the first traffic estimate.", () => 1000, null, true],
    ["Scale", "users12m", "Users after 12 months", "number", "Sets the growth plan and when to upgrade.", (d, r) => (+r.usersLaunch || 1000) * 5, null, false],
    ["Scale", "rps", "Peak requests per second", "number", "Sizes every service; the simulator uses it as its traffic.", (d) => +((d.scenario || {}).base) || 1000, null, true],
    ["Scale", "readPct", "Share of requests that are reads (%)", "number", "Decides how much caches and replicas help.", (d) => Math.round(((d.scenario || {}).readFrac == null ? 0.9 : d.scenario.readFrac) * 100), null, false],
    ["Data", "storageGB", "Data stored at launch (GB)", "number", "Sizes the database and backup costs.", () => 50, STORE, false],
    ["Data", "storageGrowthGB", "Data growth per month (GB)", "number", "Drives storage and backup cost over time.", () => 10, STORE, false],
    ["Data", "egressGB", "Data sent to users per month (GB)", "number", "Egress is billed per GB and is often a hidden cost.", () => 200, null, false],
    ["AI", "aiRequestsDay", "AI requests per day", "number", "AI tokens are usually the largest usage cost.", () => 5000, AI, true],
    ["AI", "tokensPerRequest", "Tokens per AI request (prompt + answer)", "number", "Multiplies straight into model cost.", () => 1500, AI, false],
    ["AI", "documents", "Documents in the knowledge base", "number", "Sizes embedding and the vector store.", () => 10000, RAG, false],
    ["Goals", "availability", "Availability goal (%)", "number", "Decides whether you need multi-zone, failover or a second region.", (d) => +((d.slo || {}).avail) || 99.5, null, true],
    ["Goals", "p95", "p95 latency goal (ms)", "number", "The simulator checks every design against it.", (d) => +((d.slo || {}).p95) || 300, null, false],
    ["Goals", "budget", "Monthly budget ceiling ($)", "number", "The cost plan and checks warn above it.", (d) => +((d.slo || {}).budget) || 5000, null, true],
    ["Goals", "priority", "What matters most", "select:lowest=Lowest cost|balanced=Balanced|performance=High performance|ha=High availability|speed=Developer speed", "Picks which of the three options is recommended.", () => "balanced", null, false],
    ["Platform", "cloud", "Preferred cloud", "select:aws=AWS|azure=Azure|gcp=Google Cloud|any=No preference / self-hosted", "Decides managed-service choices and pricing references.", () => "any", null, true],
    ["Platform", "region", "Main region", "text", "Latency, data residency and price all depend on it.", () => "", null, false],
    ["Platform", "environments", "Environments", "select:prod=Production only|staging=Production + staging|full=Dev + staging + production", "Each environment adds cost.", () => "full", null, false],
    ["Delivery", "timelineWeeks", "Weeks until the MVP must ship", "number", "Short timelines favour managed services and fewer moving parts.", () => 12, null, true],
    ["Delivery", "teamSize", "Engineers on the team", "number", "Microservices need teams to own them; small teams favour a modular monolith.", () => 4, null, false],
    ["Delivery", "horizon", "Planning horizon", "select:mvp=MVP|6m=6 months|12m=12 months|3y=3 years", "How far ahead the scale-up plan should look.", () => "12m", null, false],
  ].map(([group, key, label, kind, why, dflt, when, essential]) => ({ group, key, label, kind, why, dflt, when, essential }));

  const applies = (f, doc) => !f.when || f.when(doc);
  function state(doc) {
    const r = doc.requirements || {}, conf = r.confirmed || {};
    const fields = FIELDS.filter((f) => applies(f, doc)).map((f) => {
      const confirmed = !!conf[f.key] && r[f.key] != null && r[f.key] !== "";
      return Object.assign({}, f, { value: confirmed ? r[f.key] : f.dflt(doc, r), confirmed });
    });
    const questions = fields.filter((f) => !f.confirmed && f.essential);
    const compliance = (r.compliance && r.compliance.length) || r.complianceNone;
    if (!compliance) questions.push({ key: "compliance", label: "Which compliance frameworks apply (GDPR, HIPAA, PCI DSS, SOC 2, ISO 27001, or none)?", why: "Turns on the matching control checks.", value: "not recorded", confirmed: false, group: "Data" });
    const assumptions = fields.filter((f) => !f.confirmed && f.value !== "" && f.value != null).map((f) => `${f.label}: ${f.value} (assumed)`);
    return { fields, questions, assumptions, confirmedCount: fields.filter((f) => f.confirmed).length, total: fields.length };
  }

  /* answers: { key: value }. Returns a new document with requirements stored and traffic/goals synced. */
  function apply(doc, answers) {
    const d = JSON.parse(JSON.stringify(doc)), r = d.requirements = d.requirements || {}, conf = r.confirmed = r.confirmed || {};
    Object.keys(answers || {}).forEach((k) => {
      const f = FIELDS.find((x) => x.key === k); if (!f) return;
      let v = answers[k]; if (f.kind === "number") { v = v === "" || v == null ? null : +v; if (v != null && !isFinite(v)) v = null; }
      if (v == null || v === "") { delete r[k]; delete conf[k]; return; }
      r[k] = v; conf[k] = true;
    });
    d.scenario = Object.assign({}, S.DEFAULT_SCENARIO, d.scenario || {}); d.slo = Object.assign({ p95: 300, avail: 99.5, budget: 5000 }, d.slo || {});
    if (conf.rps) d.scenario.base = Math.max(1, +r.rps);
    if (conf.readPct) d.scenario.readFrac = Math.min(1, Math.max(0, +r.readPct / 100));
    if (conf.availability) d.slo.avail = Math.min(99.999, Math.max(50, +r.availability));
    if (conf.p95) d.slo.p95 = Math.max(1, +r.p95);
    if (conf.budget) d.slo.budget = Math.max(1, +r.budget);
    return d;
  }

  /* Suggested compliance frameworks from the data the product handles. */
  function suggestedCompliance(doc) {
    const r = doc.requirements || {}, out = [];
    if (r.dataSensitivity === "payment" || has(doc, (d) => d.id === "payment")) out.push("pci");
    if (r.dataSensitivity === "health") out.push("hipaa");
    if (["personal", "payment", "health"].includes(r.dataSensitivity)) out.push("gdpr");
    return out;
  }

  /* A plain-language brief for the AI Architect built from confirmed answers. */
  function brief(doc) {
    const r = doc.requirements || {}, c = r.confirmed || {}, parts = [];
    if (c.idea) parts.push(r.idea);
    if (c.usersLaunch) parts.push(`${r.usersLaunch} users at launch${c.users12m ? `, ${r.users12m} after 12 months` : ""}.`);
    if (c.rps) parts.push(`Peak about ${r.rps} requests per second.`);
    if (c.aiRequestsDay) parts.push(`About ${r.aiRequestsDay} AI requests per day.`);
    if (c.availability) parts.push(`Availability goal ${r.availability}%.`);
    if (c.budget) parts.push(`Budget ${r.budget} USD per month.`);
    if (c.cloud && r.cloud !== "any") parts.push(`Preferred cloud: ${r.cloud.toUpperCase()}.`);
    if (c.dataSensitivity) parts.push(`Handles ${r.dataSensitivity} data.`);
    if ((r.compliance || []).length) parts.push(`Compliance: ${r.compliance.map((x) => x.toUpperCase()).join(", ")}.`);
    if (c.timelineWeeks) parts.push(`MVP in ${r.timelineWeeks} weeks${c.teamSize ? ` with ${r.teamSize} engineers` : ""}.`);
    return parts.join(" ");
  }

  return { FIELDS, state, apply, suggestedCompliance, brief };
});
