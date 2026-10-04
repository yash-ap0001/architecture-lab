/* Simulation Lab: named scenarios run against the canvas.
 * Traffic and failure scenarios use the deterministic simulator (teaching numbers); security and AI-safety
 * scenarios are path analyses of the drawing (can an attacker's request reach X without passing Y?).
 * Each result says which of the two it is, so a "Pass" is never presented as more than it is. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sim.js"), require("./studio.js"));
  else root.LabScenarios = factory(root.LabSim, root.LabStudio);
})(typeof self !== "undefined" ? self : this, function (S, ST) {
  "use strict";
  const T0 = 30, T1 = 60, TICK_MIN = S.TICK_S / 60;   // incidents run from minute 15 to minute 30 of the simulated hour
  const LIST = [
    ["normal", "Flows", "Normal user flow", "One simulated hour at the traffic you set."],
    ["login", "Flows", "Login / authentication", "Every request is checked by an identity provider, and what happens if it fails."],
    ["api", "Flows", "API calls and transactions", "A write-heavy hour (half the requests change data)."],
    ["async", "Flows", "Async queue / event processing", "Writes double for 15 minutes; how far behind do consumers fall?"],
    ["ai-chat", "AI", "AI chatbot / agent flow", "Model capacity, latency, token cost and guardrails on the AI path."],
    ["ai-tools", "AI", "AI tool calls and human approval", "Agent tool calls go through an allow-list and risky ones wait for a person."],
    ["spike", "Load", "Traffic spike (×4)", "Traffic quadruples for 10 minutes."],
    ["ddos", "Load", "DDoS / rate-limit", "70% bot traffic and ×5 volume for 10 minutes."],
    ["slow-service", "Failures", "Slow service", "The busiest service becomes 4× slower with 40% capacity."],
    ["service-down", "Failures", "Service outage", "The busiest service stops for 15 minutes."],
    ["db-down", "Failures", "Database outage", "The primary database fails."],
    ["cache-fail", "Failures", "Cache failure", "The cache is flushed and warms up again."],
    ["queue-backlog", "Failures", "Queue backlog", "Consumers slow down while writes double."],
    ["third-party-timeout", "Failures", "Third-party API timeout", "An external API becomes 4× slower for 15 minutes."],
    ["payment-fail", "Failures", "Payment failure", "The payment provider is down for 10 minutes."],
    ["region-out", "Failures", "Cloud-region outage", "A region (or, if none is drawn, a zone) goes dark for 15 minutes."],
    ["prompt-injection", "Security & AI", "Prompt injection", "Can attacker text reach a model or agent without a guardrail?"],
    ["unsafe-tool", "Security & AI", "Unsafe AI tool call", "Can a manipulated agent touch data, payments or messages directly?"],
    ["breach", "Security & AI", "Data breach attempt", "An attacker probes from the internet toward the data stores."],
    ["restore", "Recovery", "Backup restore and disaster recovery", "Recovery point and recovery time for every data store."],
  ].map(([key, group, name, what]) => ({ key, group, name, what }));
  const BY_KEY = {}; LIST.forEach((s) => { BY_KEY[s.key] = s; });

  const def = (n) => S.BY_ID[n.type] || { cls: "", name: n.type };
  const nm = (n) => (n.props && n.props.name) || def(n).name;
  const clone = (d) => JSON.parse(JSON.stringify(d));
  const pct = (x) => (x * 100).toFixed(2) + "%";
  const graphOf = (doc) => ({ nodes: doc.nodes.map((n) => ({ id: n.id, type: n.type, props: Object.assign({}, n.props, { name: nm(n) }) })), edges: doc.edges });
  const isGuard = (d, n) => d.tag === "guardrail" || /guardrail|moderation|content safety|prompt shield/i.test(nm(n));
  const isToolGw = (d, n) => d.tag === "toolgw" || /tool gateway|tool allow/i.test(nm(n));
  const isApproval = (d, n) => d.tag === "approval" || /approv|human.in.the.loop|human review/i.test(nm(n));
  const isAgent = (d, n) => d.tag === "agent" || (!d.tag && /\bagents?\b/i.test(nm(n)));   // "Agent tool gateway" is a control, not an agent
  const isAuth = (d, n) => ["auth", "cognito", "identityplatform", "entraid", "keycloak", "auth0", "oauthproxy"].includes(d.id) || d.tag === "iam" || /\b(auth|oidc|sso|identity|login)\b/i.test(nm(n));
  const isEdgeShield = (d) => d.cls === "limiter" || d.waf || ["apigw", "apigw-aws", "apigee", "apim", "kong", "cloudflare", "akamai", "cloudarmor", "shield", "frontdoor"].includes(d.id);
  const isKms = (d) => d.tag === "secrets" || ["kms-aws", "cloudkms", "cloudhsm"].includes(d.id);
  const isAudit = (d, n) => d.tag === "audit" || /audit/i.test(nm(n));
  const isBackup = (d, n) => d.tag === "backup" || /backup|snapshot/i.test(nm(n));
  const isDlq = (d, n) => d.tag === "dlq" || /dead.?letter|\bdlq\b/i.test(nm(n));

  function ctxOf(doc) {
    const byId = {}; doc.nodes.forEach((n) => { byId[n.id] = n; });
    const out = {}; doc.nodes.forEach((n) => { out[n.id] = []; }); doc.edges.forEach((e) => { if (out[e.from] && byId[e.to]) out[e.from].push(e.to); });
    const any = (p) => doc.nodes.some((n) => p(def(n), n)), all = (p) => doc.nodes.filter((n) => p(def(n), n));
    return { byId, out, any, all, sources: all((d) => d.cls === "source") };
  }
  /* Every simple path from a client to a node matching `target` (bounded). */
  function pathsTo(k, target, through, max) {
    const res = [];
    const walk = (id, path) => {
      if (res.length >= (max || 60) || path.length > 14) return;
      const n = k.byId[id];
      if (path.length > 1 && target(def(n), n)) { res.push(path.slice()); return; }
      if (path.length > 1 && through && !through(def(n), n)) return;
      k.out[id].forEach((to) => { if (!path.includes(to)) { path.push(to); walk(to, path); path.pop(); } });
    };
    k.sources.forEach((s) => walk(s.id, [s.id]));
    return res;
  }
  function reachableFrom(k, start, stop) {
    const seen = new Set([start]), q = [start];
    while (q.length) { const id = q.shift(); k.out[id].forEach((to) => { if (seen.has(to)) return; seen.add(to); const n = k.byId[to]; if (!stop || !stop(def(n), n)) q.push(to); }); }
    seen.delete(start); return seen;
  }

  /* ---- simulation helpers */
  function simulate(doc, events, scOver, w) {
    const sc = Object.assign({}, S.DEFAULT_SCENARIO, doc.scenario || {}, scOver || {});
    sc.base = (+sc.base || 1000) * (w.trafficMult || 1);
    const ev = events.slice();
    (w.off || []).forEach((id) => ev.push({ tick: 0, until: S.TICKS, type: "node:" + id }));
    (w.slow || []).forEach((id) => ev.push({ tick: 0, until: S.TICKS, type: "slow:" + id }));
    return S.run(graphOf(doc), sc, ev);
  }
  function measure(doc, r, a, b, slo) {
    const h = r.st.history, m = r.st.m, end = Math.min(h.length, b + 20), seg = h.slice(a, end);
    const wsum = seg.reduce((s, x) => s + x.rps, 0) || 1;
    const avail = seg.reduce((s, x) => s + x.ok * x.rps, 0) / wsum;
    const cls = (id) => m.nodes[id].def.cls, ids = Object.keys(m.nodes);
    const maxOf = (pred, f) => { let v = 0; seg.forEach((x) => ids.forEach((id) => { if (pred(id) && x.nodes[id]) v = Math.max(v, f(x.nodes[id])); })); return v; };
    const caches = ids.filter((id) => cls(id) === "cache");
    const peakUtil = {}; seg.forEach((x) => ids.forEach((id) => { const v = x.nodes[id]; if (!v || cls(id) === "source" || cls(id) === "passive") return; const u = v.down ? 9 : v.util; if (!peakUtil[id] || u > peakUtil[id].util) peakUtil[id] = { util: u, down: !!v.down, brk: !!v.brkOpen }; }));
    const bottlenecks = Object.entries(peakUtil).filter(([, v]) => v.util > 0.9 || v.down).sort((x, y) => y[1].util - x[1].util).slice(0, 5).map(([id, v]) => ({ id, name: m.nodes[id].p.name, util: v.util, down: v.down }));
    let rec = -1; for (let t = b; t < h.length - 2; t++) if (h[t].ok >= 0.99 && h[t + 1].ok >= 0.99 && h[t + 2].ok >= 0.99) { rec = t; break; }
    const errMin = seg.reduce((s, x) => s + (1 - x.ok) * TICK_MIN, 0), allowed = Math.max(0.01, (1 - (+slo.avail || 99.5) / 100) * 43200);
    return {
      availability: avail, minOk: Math.min(...seg.map((x) => x.ok)), errorRate: 1 - avail, p95: Math.max(...seg.map((x) => x.p95)), peakRps: Math.max(...seg.map((x) => x.rps)),
      queueDepth: maxOf((id) => cls(id) === "queue", (v) => v.backlog || 0), queueDelayMin: Math.max(0, ...seg.map((x) => x.delayMin)),
      dbLoad: maxOf((id) => cls(id) === "db", (v) => v.util), cacheHit: caches.length ? Math.min(...seg.map((x) => caches.reduce((s, id) => s + (x.nodes[id] ? x.nodes[id].hit : 0), 0) / caches.length)) : null,
      cost: r.summary.cost, bottlenecks, recovered: rec >= 0 || seg.every((x) => x.ok >= 0.99), recoveryMin: rec >= 0 ? Math.max(0, (rec - b) * TICK_MIN) : null,
      errorMinutes: errMin, budgetUsed: errMin / allowed, hourAvailability: r.summary.availability, hourP95: r.summary.p95,
      dataLost: Math.max(0, ...seg.map((x) => Math.max(0, ...Object.values(x.nodes).map((v) => v.rpo || 0)))),
      _seg: seg, _m: m,
    };
  }
  function alertsFor(doc, k, mt, slo) {
    const mon = k.any((d) => ST.isMonitor(d)), pager = k.any((d) => d.tag === "alerting" || ["pagerduty", "alertmanager", "alerting", "cloudwatch-alarms", "azalerts", "cloudalerting"].includes(d.id));
    if (!mon) return { fired: [], note: "No monitoring on the canvas: nobody would be alerted. Users notice first." };
    const out = [];
    if (mt.minOk * 100 < +slo.avail) out.push(`SLO burn: availability fell to ${pct(mt.minOk)} (goal ${slo.avail}%)`);
    if (mt.p95 > +slo.p95) out.push(`Latency: p95 ${Math.round(mt.p95)} ms above the ${slo.p95} ms goal`);
    mt.bottlenecks.forEach((b) => out.push(b.down ? `${b.name} is down (health check failing)` : `${b.name} saturated at ${Math.round(b.util * 100)}%`));
    if (mt.queueDelayMin > 1) out.push(`Queue lag ${mt.queueDelayMin.toFixed(1)} min`);
    return { fired: out.slice(0, 6), note: pager ? "Alerts route to on-call." : "Monitoring is drawn but no alert routing (PagerDuty, Alertmanager…) is: alerts may go unseen." };
  }
  function failoverFor(doc, k, mt) {
    const out = [], m = mt._m, seg = mt._seg;
    doc.edges.filter((e) => e.failover).forEach((e) => { if (seg.some((x) => (x.edgeFlow[e.from + "|" + e.to] || 0) > 0.01)) out.push(`Traffic switched to ${nm(k.byId[e.to])} over the failover path`); });
    Object.keys(m.nodes).forEach((id) => {
      const n = m.nodes[id], c = n.def.cls, any = (f) => seg.some((x) => x.nodes[id] && f(x.nodes[id]));
      if (any((v) => v.brkOpen)) out.push(`${n.p.name} opened its circuit breaker${n.p.fallback ? " and served fallback answers" : ""}`);
      if (["service", "proxy"].includes(c) && n.p.auto && any((v) => v.live > (+n.p.inst || 1))) out.push(`${n.p.name} autoscaled to ${Math.max(...seg.map((x) => (x.nodes[id] || {}).live || 0))} instances`);
      if (c === "db" && any((v) => v.down)) out.push(n.p.ha ? `${n.p.name}: standby promoted after about ${(S.K.recoverHa * TICK_MIN).toFixed(0)} min (HA)` : `${n.p.name}: no standby, writes wait for a manual recovery (about ${(S.K.recoverManual * TICK_MIN).toFixed(0)} min in the model)`);
      if (c === "db" && (n.p.replicas || 0) > 0 && any((v) => v.down)) out.push(`Reads continued from ${n.p.replicas} replica(s) of ${n.p.name}`);
      if (c === "db" && any((v) => v.rpo > 0)) out.push(`${n.p.name} took over writes; about ${Math.round(Math.max(...seg.map((x) => (x.nodes[id] || {}).rpo || 0)))} recent writes were lost`);
    });
    return [...new Set(out)].slice(0, 8);
  }
  function verdictSim(mt) {
    if (!mt.recovered || mt.budgetUsed > 1 || mt.minOk < 0.5) return "Fail";      // below half served is a collapse, even if it comes back
    if (mt.budgetUsed <= 0.25 && mt.minOk >= 0.9) return "Pass";
    return "Degraded";
  }
  const busiest = (doc, w, pred) => {
    const r = simulate(doc, [], null, w); if (r.error) return null;
    const pk = r.st.history.reduce((a, x) => (x.rps > a.rps ? x : a), r.st.history[0]);
    const cand = Object.entries(pk.nodes).filter(([id]) => { const n = doc.nodes.find((x) => x.id === id); return n && pred(def(n), n); }).sort((a, b) => b[1].util - a[1].util)[0];
    return cand ? doc.nodes.find((x) => x.id === cand[0]) : null;
  };

  /* ---- patches the scenario can propose (always previewed by the app before anything changes) */
  const P = {
    harden: (d, ids) => { const c = []; d.edges.filter((e) => ids.includes(e.to)).forEach((e) => { const n = d.nodes.find((x) => x.id === e.from); if (!n || !["service", "proxy"].includes(def(n).cls)) return; const p = n.props; if (p.breaker && p.fallback && (+p.timeout || 1000) <= 800) return; p.breaker = true; p.fallback = true; p.timeout = Math.min(+p.timeout || 1000, 800); p.retries = Math.min(+p.retries || 0, 1); c.push(`${nm(n)}: 800 ms timeout, at most 1 retry, circuit breaker with fallback`); }); return c; },
    scale: (d, ids) => { const c = []; d.nodes.filter((n) => ids.includes(n.id)).forEach((n) => { const cl = def(n).cls; if (["service", "proxy"].includes(cl) && !n.props.auto) { n.props.auto = true; n.props.inst = Math.max(2, +n.props.inst || 1); c.push(`${nm(n)}: autoscaling from ${n.props.inst} instances`); } else if (["service", "proxy"].includes(cl)) { n.props.inst = Math.max(2, Math.ceil((+n.props.inst || 1) * 1.5)); c.push(`${nm(n)}: ${n.props.inst} base instances`); } else if (cl === "db") { n.props.replicas = (+n.props.replicas || 0) + 1; c.push(`${nm(n)}: +1 read replica`); } else if (cl === "queue") { n.props.workers = Math.max(2, (+n.props.workers || 1) * 2); c.push(`${nm(n)}: ${n.props.workers} workers`); } else if (cl === "cache") { n.props.inst = (+n.props.inst || 1) + 1; c.push(`${nm(n)}: ${n.props.inst} nodes`); } }); return c; },
    spread: (d, ids) => { const c = []; d.nodes.filter((n) => ids.includes(n.id)).forEach((n) => { if (["service", "proxy"].includes(def(n).cls) && ((+n.props.inst || 1) < 2 || !n.props.auto)) { n.props.inst = Math.max(2, +n.props.inst || 1); n.props.auto = true; c.push(`${nm(n)}: at least 2 instances across zones, autoscaling`); } }); return c; },
    dbHa: (d) => { const c = []; d.nodes.filter((n) => def(n).cls === "db" && def(n).tag !== "approval").forEach((n) => { if (!n.props.ha) { n.props.ha = true; c.push(`${nm(n)}: HA standby in a second zone`); } if (!(n.props.replicas > 0) && def(n).rep) { n.props.replicas = 1; c.push(`${nm(n)}: 1 read replica`); } }); return c; },
    coalesce: (d) => { const c = []; d.nodes.filter((n) => def(n).cls === "cache").forEach((n) => { if (!n.props.coalesce) { n.props.coalesce = true; c.push(`${nm(n)}: coalesce misses (one rebuild per key)`); } if ((+n.props.inst || 1) < 2) { n.props.inst = 2; c.push(`${nm(n)}: 2 nodes`); } }); return c; },
    idem: (d) => { const c = []; d.nodes.filter((n) => def(n).cls === "service" && d.edges.some((e) => e.from === n.id && ["db", "queue", "external"].includes(def(d.nodes.find((x) => x.id === e.to) || {}).cls))).forEach((n) => { if (!n.props.idem) { n.props.idem = true; c.push(`${nm(n)}: idempotency keys on writes`); } }); return c; },
    authHa: (d) => { const c = []; d.nodes.filter((n) => isAuth(def(n), n) && ["service", "proxy"].includes(def(n).cls)).forEach((n) => { if ((+n.props.inst || 1) < 2 || !n.props.auto) { n.props.inst = Math.max(2, +n.props.inst || 1); n.props.auto = true; c.push(`${nm(n)}: 2+ instances with autoscaling`); } }); return c; },
  };
  function withPatch(doc, fns) {
    const d = clone(doc), changes = [];
    fns.forEach(([f, ids]) => changes.push(...P[f](d, ids || [])));
    return changes.length ? { doc: d, changes } : null;
  }

  /* ---- the scenarios */
  function runOne(doc, key, w) {
    w = w || {}; const sc0 = BY_KEY[key]; if (!sc0) return { key, verdict: "N/A", summary: "Unknown scenario." };
    const slo = Object.assign({ p95: 300, avail: 99.5, budget: 5000 }, doc.slo || {}, w.avail ? { avail: +w.avail } : {}, w.budget ? { budget: +w.budget } : {});
    const k = ctxOf(doc), base = Object.assign({ key, name: sc0.name, group: sc0.group, what: sc0.what, fixIds: [], notes: [], path: [] }, {});
    const na = (why) => Object.assign(base, { verdict: "N/A", basis: "not applicable", summary: why });
    if (!k.sources.length) return na("Add a client wired into the design so traffic has somewhere to start.");
    const simScenario = (events, scOver, extra) => {
      const r = simulate(doc, events, scOver, w); if (r.error) return na(r.error);
      const a = events.length ? T0 : 0, b = events.length ? T1 : S.TICKS;
      const mt = measure(doc, r, a, b, slo), al = alertsFor(doc, k, mt, slo);
      const res = Object.assign(base, { basis: "simulated (teaching model)", metrics: mt, alerts: al.fired, alertNote: al.note, failover: failoverFor(doc, k, mt), verdict: verdictSim(mt), live: extra && extra.live });
      delete mt._seg; delete mt._m;
      return res;
    };
    const describe = (r, lead) => { if (r.verdict === "N/A") return r; const mt = r.metrics; r.summary = `${lead} Availability during the incident window ${pct(mt.availability)} (lowest ${pct(mt.minOk)}), p95 up to ${Math.round(mt.p95)} ms, ${mt.recovered ? `recovered${mt.recoveryMin ? " " + mt.recoveryMin.toFixed(1) + " min after the fault ended" : ""}` : "did not recover within the hour"}. Uses ${(mt.budgetUsed * 100).toFixed(0)}% of a month's error budget at ${slo.avail}%.`; return r; };
    const ai = ST.aiTokenCost(doc, w.aiMult);

    switch (key) {
      case "normal": {
        const r = simScenario([], null, { live: { chaos: [], mult: w.trafficMult || 1 } }); if (r.verdict === "N/A") return r;
        const mt = r.metrics, ok = { p95: mt.hourP95 <= +slo.p95, avail: mt.hourAvailability * 100 >= +slo.avail, cost: mt.cost + (ai ? ai.monthly : 0) <= +slo.budget };
        r.verdict = ok.p95 && ok.avail && ok.cost ? "Pass" : ok.avail ? "Degraded" : "Fail";
        r.summary = `p95 ${Math.round(mt.hourP95)} ms (goal ${slo.p95}), availability ${pct(mt.hourAvailability)} (goal ${slo.avail}%), about $${Math.round(mt.cost + (ai ? ai.monthly : 0)).toLocaleString("en-US")}/month${ai && ai.monthly ? " including AI tokens" : ""} (budget $${Math.round(slo.budget).toLocaleString("en-US")}).`;
        if (mt.bottlenecks.length) r.notes.push("Bottleneck: " + mt.bottlenecks.map((b) => `${b.name} ${Math.round(b.util * 100)}%`).join(", "));
        r.patch = withPatch(doc, [["scale", mt.bottlenecks.filter((b) => !b.down).map((b) => b.id)]]);
        return r;
      }
      case "login": {
        const auths = k.all(isAuth);
        if (!auths.length) { Object.assign(base, { verdict: "Fail", basis: "path analysis on canvas", summary: "No identity provider or auth service on the canvas: requests reach services without a login check.", fixIds: ["no-authn"] }); return base; }
        const live = auths.filter((a) => doc.edges.some((e) => e.to === a.id));
        if (!live.length) { Object.assign(base, { verdict: "Fail", basis: "path analysis on canvas", summary: `${auths.map(nm).join(", ")} ${auths.length === 1 ? "is" : "are"} drawn but nothing calls ${auths.length === 1 ? "it" : "them"}, so no request is checked.`, fixIds: ["no-authn"] }); return base; }
        const a = live[0];
        const r = ["service", "proxy", "router"].includes(def(a).cls) ? simScenario([{ tick: T0, until: T1, type: "node:" + a.id }], null, { live: { chaos: ["node:" + a.id] } }) : null;
        const single = ["service", "proxy"].includes(def(a).cls) && (+a.props.inst || 1) < 2 && !a.props.auto;
        const res = r && r.verdict !== "N/A" ? describe(r, `${nm(a)} checks sign-ins. If it goes down for 15 minutes:`) : Object.assign(base, { basis: "path analysis on canvas", summary: `${nm(a)} checks sign-ins (managed service: its outage is not simulated).`, verdict: "Pass" });
        res.path = [a.id];
        if (single) { res.verdict = res.verdict === "Pass" ? "Degraded" : res.verdict; res.notes.push(`${nm(a)} runs a single instance: one crash stops every login.`); }
        if (!k.any((d, n) => (n.props || {}).authz || /rbac|abac|polic|authori/i.test(nm(n)))) { res.notes.push("Authorization (who may do what) is not recorded on the canvas."); res.fixIds.push("no-authz"); }
        res.notes.push("Not modelled: MFA, token lifetime, session revocation. Confirm them in the security review.");
        res.patch = withPatch(doc, [["authHa"]]);
        return res;
      }
      case "api": {
        const writers = k.all((d) => d.cls === "db" || d.cls === "queue");
        if (!writers.length) return na("No database or queue on the canvas, so there is nothing to write to.");
        const r = simScenario([], { readFrac: Math.min((doc.scenario || {}).readFrac == null ? 0.9 : doc.scenario.readFrac, 0.5) }, { live: { chaos: [] } });
        if (r.verdict === "N/A") return r;
        const mt = r.metrics; r.verdict = mt.hourAvailability * 100 >= +slo.avail && mt.hourP95 <= +slo.p95 * 1.5 ? "Pass" : mt.hourAvailability >= 0.95 ? "Degraded" : "Fail";
        r.summary = `Half of all requests write data for the whole hour: availability ${pct(mt.hourAvailability)}, p95 ${Math.round(mt.hourP95)} ms${mt.bottlenecks.length ? `; write bottleneck ${mt.bottlenecks.map((b) => `${b.name} ${Math.round(b.util * 100)}%`).join(", ")}` : ""}.`;
        if (!k.any((d, n) => (n.props || {}).idem)) r.notes.push("No service is marked idempotent: a retried write (timeout, double click) can create duplicates or charge twice.");
        r.patch = withPatch(doc, [["idem"], ["scale", mt.bottlenecks.filter((b) => !b.down).map((b) => b.id)]]);
        return r;
      }
      case "async": {
        const qs = k.all((d, n) => d.cls === "queue" && !isDlq(d, n) && !isApproval(d, n));
        if (!qs.length) return na("No queue or event stream on the canvas: slow work runs inside the request. Consider a queue for email, reports, AI jobs and other work that can finish later.");
        const r = describe(simScenario([{ tick: T0, until: T1, type: "surge:2" }], { readFrac: 0.6 }, { live: { chaos: ["surge:2"] } }), "Writes double for 15 minutes.");
        if (r.verdict === "N/A") return r;
        r.summary += ` Consumers fell up to ${r.metrics.queueDelayMin.toFixed(1)} min behind (peak backlog ${Math.round(r.metrics.queueDepth).toLocaleString("en-US")} messages).`;
        if (r.metrics.queueDelayMin > 5 && r.verdict === "Pass") r.verdict = "Degraded";
        if (!k.any(isDlq)) { r.notes.push("No dead-letter queue: a message that always fails is retried forever or lost."); r.fixIds.push("no-dlq"); if (r.verdict === "Pass") r.verdict = "Degraded"; }
        r.notes.push("Delivery is at-least-once: consumers must be idempotent (store processed event ids).");
        r.patch = withPatch(doc, [["scale", qs.map((n) => n.id)], ["idem"]]);
        return r;
      }
      case "ai-chat": {
        const models = k.all((d) => ST.isModel(d)), agents = k.all(isAgent);
        if (!models.length && !agents.length) return na("No model or agent on the canvas.");
        const r = describe(simScenario([], { }, { live: { chaos: [] } }), "One hour of normal traffic through the AI path.");
        if (r.verdict === "N/A") return r;
        const mt = r.metrics, peakModel = mt.bottlenecks.find((b) => models.some((m) => m.id === b.id));
        r.verdict = mt.hourAvailability * 100 >= +slo.avail && mt.hourP95 <= Math.max(+slo.p95, 3000) ? "Pass" : mt.hourAvailability >= 0.95 ? "Degraded" : "Fail";
        r.summary = `AI path at ${Math.round(mt.peakRps).toLocaleString("en-US")} req/s total traffic: availability ${pct(mt.hourAvailability)}, p95 ${Math.round(mt.hourP95)} ms.` + (ai ? ` Token spend about $${Math.round(ai.monthly).toLocaleString("en-US")}/month (${ai.basis}).` : "");
        if (peakModel) r.notes.push(`${peakModel.name} is saturated (${Math.round(peakModel.util * 100)}%): add capacity, a model router or a cache.`);
        const unguarded = pathsTo(k, (d) => ST.isModel(d) || d.tag === "agent", null).filter((p) => !p.slice(1, -1).some((id) => isGuard(def(k.byId[id]), k.byId[id])));
        if (unguarded.length) { r.notes.push(`${unguarded.length} path(s) reach a model with no guardrail in between.`); r.fixIds.push("ai-injection"); if (r.verdict === "Pass") r.verdict = "Degraded"; r.path = unguarded[0]; }
        if (!k.any((d) => d.tag === "modelrouter" || d.id === "llmgw")) r.fixIds.push("ai-cost");
        if (k.any((d) => ["vector", "pinecone", "pgvector", "qdrant", "weaviate", "milvus"].includes(d.id))) r.notes.push("RAG: retrieved documents are untrusted input too (indirect prompt injection). Evaluate groundedness and citation accuracy before launch.");
        r.ai = ai; r.patch = withPatch(doc, [["scale", models.map((n) => n.id)]]);
        return r;
      }
      case "ai-tools": case "unsafe-tool": {
        const agents = k.all(isAgent);
        if (!agents.length) return na("No AI agent on the canvas.");
        const risky = (d, n) => d.cat !== "AI & ML" && (["db", "store", "external"].includes(d.cls) || d.id === "payment" || /email|sms|notify|payment/i.test(nm(n) + d.name));   // retrieval from a vector store is a read, not a tool action
        const direct = [], viaGw = [];
        agents.forEach((a) => { reachableFrom(k, a.id, (d, n) => isToolGw(d, n)).forEach((id) => { const n = k.byId[id], d = def(n); if (isToolGw(d, n)) { reachableFrom(k, id).forEach((t) => { if (risky(def(k.byId[t]), k.byId[t])) viaGw.push(t); }); } else if (risky(d, n)) direct.push([a.id, id]); }); });
        const approval = k.any(isApproval), gw = k.any(isToolGw);
        const res = Object.assign(base, { basis: "path analysis on canvas" });
        if (direct.length) {
          res.verdict = "Fail"; res.path = direct[0];
          res.summary = key === "unsafe-tool" ? `A manipulated agent can reach ${[...new Set(direct.map(([, t]) => nm(k.byId[t])))].join(", ")} directly: nothing checks which tool or arguments it uses.` : `Tool calls go straight from the agent to ${[...new Set(direct.map(([, t]) => nm(k.byId[t])))].join(", ")} without an allow-list.`;
          res.fixIds.push("ai-tools"); if (!approval) res.fixIds.push("ai-approval");
        } else if (!approval) {
          res.verdict = "Degraded"; res.summary = `Tool calls pass ${gw ? "the tool gateway" : "no risky targets"}, but no human approval queue exists for irreversible actions (payments, outgoing messages, deletions).`; res.fixIds.push("ai-approval");
        } else { res.verdict = "Pass"; res.summary = `Agent tool calls pass an allow-list${viaGw.length ? ` before reaching ${[...new Set(viaGw.map((t) => nm(k.byId[t])))].slice(0, 4).join(", ")}` : ""}, and a human approval queue is on the canvas.`; }
        res.notes.push("Path analysis only: confirm the allow-list content, argument validation and which actions require approval (OWASP LLM06 Excessive Agency).");
        if (key === "ai-tools") {
          const r = simulate(doc, [], null, w);
          if (!r.error) { const mt = measure(doc, r, 0, S.TICKS, slo); const ap = k.all(isApproval)[0]; res.metrics = mt; delete mt._seg; delete mt._m; if (ap) res.notes.push(`Approval queue: people must clear the backlog; up to ${mt.queueDelayMin.toFixed(1)} min of waiting in the model.`); }
        }
        return res;
      }
      case "spike": { const r = describe(simScenario([{ tick: T0, until: T0 + 20, type: "surge:4" }], null, { live: { chaos: ["surge:4"] } }), "Traffic ×4 for 10 minutes."); if (r.verdict === "N/A") return r; r.patch = withPatch(doc, [["scale", r.metrics.bottlenecks.filter((b) => !b.down).map((b) => b.id)]]); if (!k.any((d) => d.cls === "limiter" || isEdgeShield(d))) r.fixIds.push("no-rate-limit"); return r; }
      case "ddos": {
        const r = describe(simScenario([{ tick: T0, until: T0 + 20, type: "surge:5" }], { botFrac: 0.7 }, { live: { chaos: ["surge:5"] } }), "70% bots and ×5 volume for 10 minutes.");
        if (r.verdict === "N/A") return r;
        const shield = k.all((d) => isEdgeShield(d));
        if (!shield.length) { r.notes.push("No WAF, rate limiter or gateway with limits: bot traffic reaches the services and you pay for it."); r.fixIds.push("no-rate-limit", "unprotected-api"); if (r.verdict === "Pass") r.verdict = "Degraded"; }
        else r.notes.push(`Filtered at ${shield.map(nm).join(", ")}. Large volumetric attacks also need provider DDoS protection (for example AWS Shield, Azure DDoS Protection, Cloud Armor).`);
        return r;
      }
      case "slow-service": case "service-down": {
        const t = w.target ? k.byId[w.target] : busiest(doc, w, (d) => d.cls === "service" || d.cls === "proxy");
        if (!t) return na("No service to slow down or stop.");
        const type = (key === "slow-service" ? "slow:" : "node:") + t.id;
        const r = describe(simScenario([{ tick: T0, until: T1, type }], null, { live: { chaos: [type] } }), `${nm(t)} ${key === "slow-service" ? "is 4× slower with 40% capacity" : "is down"} for 15 minutes.`);
        if (r.verdict === "N/A") return r;
        r.path = [t.id]; r.target = t.id;
        r.patch = withPatch(doc, key === "slow-service" ? [["harden", [t.id]], ["scale", [t.id]]] : [["spread", [t.id]], ["harden", [t.id]]]);
        if (!doc.edges.some((e) => e.to === t.id && (k.byId[e.from].props || {}).breaker)) r.notes.push(`Callers of ${nm(t)} have no circuit breaker: they wait for timeouts and pile up.`);
        return r;
      }
      case "db-down": {
        if (!k.any((d) => d.cls === "db")) return na("No database on the canvas.");
        const r = describe(simScenario([{ tick: T0, until: T0 + 1, type: "dbDown" }], null, { live: { chaos: ["dbDown"] } }), "The primary database fails at minute 15.");
        if (r.verdict === "N/A") return r; r.fixIds.push("spof-db"); r.patch = withPatch(doc, [["dbHa"]]); return r;
      }
      case "cache-fail": {
        if (!k.any((d) => d.cls === "cache")) return na("No cache on the canvas: nothing to flush. (Every read already goes to the database.)");
        const r = describe(simScenario([{ tick: T0, until: T0 + 2, type: "cacheFlush" }], null, { live: { chaos: ["cacheFlush"] } }), "The cache is flushed at minute 15 and warms up again.");
        if (r.verdict === "N/A") return r; r.summary += r.metrics.cacheHit != null ? ` Hit rate fell to ${Math.round(r.metrics.cacheHit * 100)}%, database load peaked at ${Math.round(r.metrics.dbLoad * 100)}%.` : "";
        r.patch = withPatch(doc, [["coalesce"], ["dbHa"]]); return r;
      }
      case "queue-backlog": {
        const qs = k.all((d, n) => d.cls === "queue" && !isDlq(d, n) && !isApproval(d, n));
        if (!qs.length) return na("No queue on the canvas.");
        const consumers = [...new Set(doc.edges.filter((e) => qs.some((q) => q.id === e.from)).map((e) => e.to))].filter((id) => ["service", "db", "store"].includes(def(k.byId[id]).cls));
        const ev = consumers.map((id) => ({ tick: T0, until: T1, type: "slow:" + id })).concat([{ tick: T0, until: T1, type: "surge:2" }]);
        const r = describe(simScenario(ev, { readFrac: 0.6 }, { live: { chaos: consumers.map((id) => "slow:" + id).concat(["surge:2"]) } }), "Consumers slow down while writes double.");
        if (r.verdict === "N/A") return r;
        r.summary += ` Backlog peaked at ${Math.round(r.metrics.queueDepth).toLocaleString("en-US")} messages, ${r.metrics.queueDelayMin.toFixed(1)} min behind.`;
        if (r.metrics.queueDelayMin > 10 && r.verdict === "Pass") r.verdict = "Degraded";
        if (!k.any(isDlq)) r.fixIds.push("no-dlq");
        r.notes.push("Alert on queue age (oldest message), not only on depth.");
        r.patch = withPatch(doc, [["scale", qs.map((n) => n.id).concat(consumers)]]); r.path = qs.map((n) => n.id);
        return r;
      }
      case "third-party-timeout": case "payment-fail": {
        const ext = k.all((d) => d.cls === "external" && (key === "payment-fail" ? d.id === "payment" || /payment|stripe|adyen|paypal/i.test(d.name) : d.id !== "payment"));
        if (!ext.length) return na(key === "payment-fail" ? "No payment provider on the canvas." : "No third-party API on the canvas.");
        const t = ext[0], type = (key === "payment-fail" ? "node:" : "slow:") + t.id;
        const r = describe(simScenario([{ tick: T0, until: key === "payment-fail" ? T0 + 20 : T1, type }], null, { live: { chaos: [type] } }), key === "payment-fail" ? `${nm(t)} is down for 10 minutes.` : `${nm(t)} becomes 4× slower for 15 minutes.`);
        if (r.verdict === "N/A") return r;
        r.path = [t.id]; r.patch = withPatch(doc, [["harden", [t.id]], ["idem"]]);
        if (key === "payment-fail") { r.notes.push("Use the provider's idempotency keys so a retry after a timeout cannot charge twice; reconcile with webhooks."); r.notes.push("Keep the order in a pending state and retry from a queue instead of failing checkout."); }
        else r.notes.push("Set a timeout shorter than your own p95 goal, cap retries, and add a fallback or cached answer.");
        return r;
      }
      case "region-out": {
        const regions = [...new Set(doc.nodes.map((n) => (n.props || {}).region).filter(Boolean))];
        if (regions.length) {
          const rg = w.region || regions[0];
          const r = describe(simScenario([{ tick: T0, until: T1, type: "region:" + rg }], null, { live: { chaos: ["region:" + rg] } }), `Region ${String(rg).toUpperCase()} goes dark for 15 minutes.`);
          if (r.verdict !== "N/A" && regions.length < 2) { r.notes.push("Only one region is drawn: there is nowhere to fail over to."); }
          if (r.verdict !== "N/A" && !doc.edges.some((e) => e.failover)) r.notes.push("No failover wire: clients stay pointed at the dead region.");
          return r;
        }
        const r = describe(simScenario([{ tick: T0, until: T1, type: "azOut" }], null, { live: { chaos: ["azOut"] } }), "No regions are drawn, so a zone outage was simulated (half the capacity of anything not multi-zone).");
        if (r.verdict === "N/A") return r;
        r.notes.push(`A full region outage would stop everything: recovery means rebuilding in another region from backups (hours).${+slo.avail >= 99.95 ? " Your availability goal needs a warm standby region." : " That can be acceptable for your availability goal; record it as an accepted risk."}`);
        if (+slo.avail >= 99.95 && r.verdict === "Pass") r.verdict = "Degraded";
        r.patch = withPatch(doc, [["dbHa"], ["spread", doc.nodes.filter((n) => def(n).cls === "service").map((n) => n.id)]]);
        return r;
      }
      case "prompt-injection": {
        const targets = k.all((d, n) => ST.isModel(d) || isAgent(d, n));
        if (!targets.length) return na("No model or agent on the canvas.");
        const paths = pathsTo(k, (d, n) => ST.isModel(d) || isAgent(d, n)), open = paths.filter((p) => !p.slice(1, -1).some((id) => isGuard(def(k.byId[id]), k.byId[id])));
        const res = Object.assign(base, { basis: "path analysis on canvas" });
        if (!paths.length) { res.verdict = "Pass"; res.summary = "No client request reaches a model or agent (they are internal only)."; }
        else if (open.length) { res.verdict = "Fail"; res.path = open[0]; res.summary = `Attacker text travels ${open[0].map((id) => nm(k.byId[id])).join(" → ")} with no guardrail: an "ignore your instructions" message reaches the model unfiltered.`; res.fixIds.push("ai-injection"); }
        else { res.verdict = "Pass"; res.path = paths[0]; res.summary = `All ${paths.length} path(s) from clients to a model pass a guardrail first.`; }
        if (k.any(isAgent) && !k.any(isToolGw)) { res.notes.push("If an injection gets through, the agent can still call tools freely: add a tool gateway."); if (res.verdict === "Pass") res.verdict = "Degraded"; res.fixIds.push("ai-tools"); }
        res.notes.push("Also test indirect injection (instructions hidden in documents, web pages or emails the model reads) with a red-team prompt set. OWASP LLM01.");
        return res;
      }
      case "breach": {
        const stores = k.all((d) => ["db", "store", "cache"].includes(d.cls));
        if (!stores.length) return na("No data store on the canvas.");
        const direct = doc.edges.filter((e) => k.byId[e.from] && k.byId[e.to] && def(k.byId[e.from]).cls === "source" && ["db", "cache", "store"].includes(def(k.byId[e.to]).cls));
        const checks = [
          { c: "Data stores not reachable from the internet", ok: !direct.filter((e) => def(k.byId[e.to]).cls !== "store").length, sev: "critical", fix: "public-db" },
          { c: "Requests enter through a gateway, WAF or load balancer", ok: !doc.edges.some((e) => k.byId[e.from] && k.byId[e.to] && def(k.byId[e.from]).cls === "source" && def(k.byId[e.to]).cls === "service"), sev: "high", fix: "unprotected-api" },
          { c: "Authentication on the request path", ok: k.any(isAuth), sev: "high", fix: "no-authn" },
          { c: "Rate limiting or WAF against credential stuffing and scraping", ok: k.any((d) => isEdgeShield(d)), sev: "medium", fix: "no-rate-limit" },
          { c: "Encryption keys and secrets managed (KMS / vault)", ok: k.any((d) => isKms(d)), sev: "medium", fix: "no-kms" },
          { c: "TLS on every wire that carries sensitive data", ok: !doc.edges.some((e) => e.tls === false), sev: "high", fix: "plaintext" },
          { c: "Audit log to detect and investigate access", ok: k.any(isAudit), sev: "medium", fix: null },
          { c: "Threat detection / SIEM", ok: k.any((d) => ["siem", "threat"].includes(d.tag)), sev: "low", fix: null },
        ];
        const failed = checks.filter((x) => !x.ok), worst = failed.some((x) => x.sev === "critical" || x.sev === "high") ? "Fail" : failed.some((x) => x.sev === "medium") ? "Degraded" : "Pass";
        const res = Object.assign(base, { basis: "path analysis on canvas", verdict: worst, checks, fixIds: failed.map((x) => x.fix).filter(Boolean) });
        res.summary = failed.length ? `${checks.length - failed.length} of ${checks.length} defences are on the canvas. Missing: ${failed.map((x) => x.c.toLowerCase()).join("; ")}.` : `All ${checks.length} defences the tool checks are on the canvas.`;
        if (direct.length) res.path = [direct[0].from, direct[0].to];
        res.notes.push("A drawing cannot prove configuration: verify with a penetration test, cloud security posture scan and access review.");
        return res;
      }
      case "restore": {
        const stores = k.all((d) => ["db", "store"].includes(d.cls) && !["approval"].includes(d.tag));
        if (!stores.length) return na("No data store on the canvas.");
        const backup = k.any(isBackup), regions = new Set(doc.nodes.map((n) => (n.props || {}).region).filter(Boolean)).size;
        const rows = stores.map((n) => {
          const p = n.props || {}, peer = !!p.peer && (p.mode === "replica" || p.mode === "active");
          const rpo = p.ha ? "≈0 (synchronous standby)" : peer ? "seconds (async replica lag)" : backup ? "≈5 min with point-in-time restore, 24 h with daily snapshots only" : "everything since creation (no backup)";
          const rto = p.ha ? `≈${(S.K.recoverHa * TICK_MIN).toFixed(0)} min automatic failover` : peer && p.autoPromote ? "minutes (auto-promote)" : backup ? "1–4 h restore (size dependent)" : "unrecoverable";
          return { id: n.id, name: nm(n), rpo, rto, ok: !!backup && (p.ha || peer || def(n).cls === "store") };
        });
        const res = Object.assign(base, { basis: "path analysis on canvas + simulator recovery times", rows });
        const target = +slo.avail >= 99.99 ? { rto: "5 min", rpo: "near zero", multi: true } : +slo.avail >= 99.95 ? { rto: "15 min", rpo: "5 min", multi: true } : +slo.avail >= 99.9 ? { rto: "1 h", rpo: "15 min" } : { rto: "4 h", rpo: "1 h" };
        res.target = target;
        res.verdict = !backup ? "Fail" : rows.every((r) => r.ok) && (!target.multi || regions >= 2 || doc.dr) ? "Pass" : "Degraded";
        res.summary = `${backup ? "Backups are on the canvas." : "No backup on the canvas: deleted or corrupted data cannot be brought back (replicas copy the damage)."} For ${slo.avail}% availability aim for RTO ${target.rto} and RPO ${target.rpo}${target.multi ? " with a standby region" : ""}.`;
        if (!backup) res.fixIds.push("no-backup");
        if (stores.some((n) => def(n).cls === "db" && !(n.props || {}).ha)) res.fixIds.push("spof-db");
        res.notes.push("A backup only counts after a restore drill: restore into a clean environment, time it, and verify the data.");
        if (target.multi && regions < 2 && !doc.dr) res.notes.push("Your availability goal needs a second region (warm standby) or an accepted-risk decision.");
        res.patch = withPatch(doc, [["dbHa"]]);
        return res;
      }
      default: return na("Not implemented.");
    }
  }

  function runAll(doc, w) {
    const results = LIST.map((s) => { try { return runOne(doc, s.key, w); } catch (e) { return { key: s.key, name: s.name, group: s.group, verdict: "N/A", basis: "error", summary: "Could not run: " + e.message, fixIds: [], notes: [] }; } });
    const count = (v) => results.filter((r) => r.verdict === v).length;
    const applicable = results.filter((r) => r.verdict !== "N/A");
    const score = applicable.length ? Math.round(100 * applicable.reduce((a, r) => a + (r.verdict === "Pass" ? 1 : r.verdict === "Degraded" ? 0.5 : 0), 0) / applicable.length) : 0;
    return { results, pass: count("Pass"), degraded: count("Degraded"), fail: count("Fail"), na: count("N/A"), score };
  }

  return { LIST, BY_KEY, runOne, runAll, pathsTo, ctxOf, T0, T1 };
});
