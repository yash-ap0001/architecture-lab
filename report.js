/* Readiness level, "ready to implement" score and the final readiness report (Markdown).
 * Everything is derived from evidence the tool actually has: the canvas, the linter, the simulator, the
 * cost plan, recorded requirements and recorded approvals. Levels 3-5 need evidence from outside the tool
 * (real tests, expert sign-off, production data), so the tool can list what is required but never award them. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LabReport = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const LEVELS = [
    { n: 0, name: "Draft", means: "Requirements or assumptions are incomplete." },
    { n: 1, name: "Design reviewed", means: "No critical or high findings, and a named person approved this exact canvas fingerprint." },
    { n: 2, name: "Simulation validated", means: "Normal traffic meets the latency, availability and budget goals, and the automatic failure drills score at least 80/100." },
    { n: 3, name: "Test validated", means: "Real load, chaos, integration and security tests pass agreed thresholds. Evidence comes from your pipeline, not this tool." },
    { n: 4, name: "Production readiness reviewed", means: "Security, compliance, reliability and operations experts signed off; every critical risk has an owner." },
    { n: 5, name: "Production proven", means: "Running in production with monitored SLOs, real incidents handled, backups restored in drills." },
  ];
  const money = (n) => "$" + Math.round(n || 0).toLocaleString("en-US");
  const pct = (x) => (x * 100).toFixed(2) + "%";

  /* ctx: { doc, hash, lint, plan, normal:{p95,availability,cost}, chaos:{score,events}|null, versions:[], brief } */
  function assess(ctx) {
    const { doc, lint, normal, chaos } = ctx, slo = doc.slo || {}, req = doc.requirements || {};
    const c = lint ? lint.counts : { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const approved = (ctx.versions || []).filter((v) => v.approvedAt);
    const current = approved.find((v) => v.hash === ctx.hash);
    const stale = !current && approved.length ? approved[0] : null;
    const goals = normal ? { p95: normal.p95 <= +slo.p95, avail: normal.availability * 100 >= +slo.avail, cost: normal.cost <= +slo.budget } : null;
    const goalsMet = goals && goals.p95 && goals.avail && goals.cost;
    const chaosOk = chaos && chaos.score >= 80;
    const complianceRecorded = (req.compliance && req.compliance.length > 0) || !!req.complianceNone;
    const briefRecorded = !!(ctx.brief && ctx.brief.trim().length >= 20);

    const parts = [
      { key: "checks", label: "Architecture checks", max: 35, got: Math.max(0, 35 - 12 * c.critical - 6 * c.high - 1 * c.medium), note: `${c.critical} critical, ${c.high} high, ${c.medium} medium` },
      { key: "sim", label: "Simulation", max: 25, got: (goalsMet ? 10 : 0) + (chaos ? Math.round(Math.min(100, chaos.score) * 0.15) : 0), note: normal ? `goals ${goalsMet ? "met" : "not met"}; failure drills ${chaos ? chaos.score + "/100" : "not run"}` : "could not run (add a client)" },
      { key: "cost", label: "Budget", max: 10, got: !normal || !(+slo.budget) ? 0 : normal.cost <= +slo.budget ? 10 : Math.max(0, Math.round(10 * (+slo.budget) / normal.cost) - 5), note: normal && +slo.budget ? `${money(normal.cost)} of ${money(slo.budget)}` : "no budget set" },
      { key: "approval", label: "Human approval", max: 15, got: current ? 15 : stale ? 5 : 0, note: current ? `approved by ${current.approvedBy}` : stale ? `last approval was for an older fingerprint (${stale.hash})` : "not approved" },
      { key: "req", label: "Requirements recorded", max: 15, got: (complianceRecorded ? 7 : 0) + (briefRecorded ? 4 : 0) + (+slo.p95 && +slo.avail && +slo.budget ? 4 : 0), note: [complianceRecorded ? "compliance recorded" : "compliance not recorded", briefRecorded ? "product brief written" : "no product brief", +slo.budget ? "goals set" : "goals missing"].join("; ") },
    ];
    const score = parts.reduce((a, p) => a + p.got, 0);

    let level = 0;
    if (c.critical === 0 && c.high === 0 && current) level = 1;
    if (level === 1 && goalsMet && chaosOk) level = 2;

    const blocking = [];
    (lint ? lint.findings : []).filter((f) => f.sev === "critical" || f.sev === "high").forEach((f) => blocking.push(`${f.sev === "critical" ? "Critical" : "High"}: ${f.title}. ${f.fix}`));
    if (!normal) blocking.push("The simulator cannot run this canvas yet (add a client wired into the design).");
    else {
      if (!goals.p95) blocking.push(`p95 latency ${Math.round(normal.p95)} ms is above the ${slo.p95} ms goal.`);
      if (!goals.avail) blocking.push(`Availability ${pct(normal.availability)} is below the ${slo.avail}% goal.`);
      if (!goals.cost) blocking.push(`Estimated ${money(normal.cost)}/month is over the ${money(slo.budget)} budget.`);
    }
    if (!chaos) blocking.push("Automatic failure drills have not produced a result.");
    else if (!chaosOk) blocking.push(`Failure drills score ${chaos.score}/100 (80 needed).`);
    if (!current) blocking.push(stale ? "The canvas changed after the last approval: save a version and approve it again." : "No approved version: save a version and have the architecture owner approve it.");
    if (!complianceRecorded) blocking.push("Compliance needs are not recorded (choose the frameworks in Checks, or mark that none apply).");

    const frameworks = (req.compliance || []).map((x) => String(x).toUpperCase());
    const approvals = [
      { role: "Architecture owner", status: current ? `Approved by ${current.approvedBy} on ${new Date(current.approvedAt).toISOString().slice(0, 10)} (fingerprint ${current.hash})` : "Not recorded" },
      { role: "Security reviewer (threat model, findings)", status: "Not recorded in this tool" },
      frameworks.length ? { role: `Compliance owner (${frameworks.join(", ")})`, status: "Not recorded in this tool" } : null,
      { role: "Operations / SRE (runbooks, on-call, backups)", status: "Not recorded in this tool" },
      { role: "Budget owner", status: "Not recorded in this tool" },
    ].filter(Boolean);
    const next = LEVELS[Math.min(5, level + 1)];
    return { level, levelName: LEVELS[level].name, next, score, parts, blocking, approvals, goals, current, stale, LEVELS };
  }

  function firstSentence(t) { const s = String(t || "").split(/(?<=\.)\s/)[0]; return s.length > 160 ? s.slice(0, 157) + "…" : s; }
  const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "/").replace(/\n/g, " ");

  /* ctx as assess() plus { a (assess result), byId (catalog), docs (hover text by type), stamp (date string) } */
  function markdown(ctx) {
    const { doc, a, plan, lint, normal, chaos, byId, docs } = ctx, slo = doc.slo || {};
    const name = (n) => (n.props && n.props.name) || (byId[n.type] || {}).name || n.type;
    const byNode = {}; doc.nodes.forEach((n) => { byNode[n.id] = n; });
    const out = (id) => doc.edges.filter((e) => e.from === id && byNode[e.to]).map((e) => name(byNode[e.to]) + (e.mode === "async" ? " (async)" : ""));
    const inn = (id) => doc.edges.filter((e) => e.to === id && byNode[e.from]).map((e) => name(byNode[e.from]));
    const def = (n) => byId[n.type] || {};
    const compRow = (plan && plan.components) ? Object.fromEntries(plan.components.map((c) => [c.id, c])) : {};
    const alt = (n) => (plan && plan.alternatives || []).find((x) => x.name === name(n));
    const L = [];
    const h = (t) => L.push("", t, "");
    L.push(`# Readiness report: ${doc.name || "Untitled design"}`, "");
    L.push(`Generated ${ctx.stamp} by Architecture Lab from the canvas. Canvas fingerprint **${ctx.hash}**: this report is invalid after any change to the canvas, traffic, goals or requirements.`);
    L.push("", "> Estimates use the simulator's teaching numbers, not provider quotes or measurements. Findings are rules evaluated on the drawing. This report supports a design review; it is not a certification.");
    h("## Summary");
    L.push(`- Readiness level: **${a.level} — ${a.levelName}**. Next: ${a.next.n} — ${a.next.name} (${a.next.means})`);
    L.push(`- Ready-to-implement score: **${a.score}/100** (${a.parts.map((p) => `${p.label} ${p.got}/${p.max}`).join(", ")})`);
    L.push(`- Components: ${doc.nodes.length} across level${plan && plan.levels.length > 1 ? "s " + plan.levels.join(", ") : " 1"}; wires: ${doc.edges.length}`);
    L.push(`- Goals: p95 ≤ ${slo.p95} ms, availability ≥ ${slo.avail}%, budget ≤ ${money(slo.budget)}/month; traffic ${Math.round(+(doc.scenario || {}).base || 0).toLocaleString("en-US")} req/s`);
    if (ctx.brief) L.push(`- Product brief: ${cell(ctx.brief).slice(0, 600)}`);
    h("## Items blocking implementation");
    L.push(...(a.blocking.length ? a.blocking.map((b) => "- " + b) : ["- None found by the tool. Continue to the external validation gates below."]));
    h("## Required human approvals");
    L.push("| Role | Status | Signature / date |", "|---|---|---|", ...a.approvals.map((x) => `| ${cell(x.role)} | ${cell(x.status)} |  |`));
    h("## Selected architecture options");
    if (plan) {
      L.push("| Option | Monthly estimate (expected → peak) | Services | Availability in failure drill | Complexity | When to choose |", "|---|---|---|---|---|---|");
      plan.options.forEach((o) => L.push(`| ${o.key}. ${o.name}${o.key === plan.recommended ? " (fits inputs)" : ""} | ${money(o.low)} → ${money(o.high)} | ${o.services} | ${pct(o.availability)} | ${o.complexity} | ${cell(o.upgrade)} |`));
      L.push("", `MVP scope: start from option A (${cell(plan.options[0].changes)}) and move to B and C on these triggers: ${cell(plan.options[0].upgrade)} ${cell(plan.options[1].upgrade)}`);
    }
    h("## High-level design: components");
    L.push("| Component | Type | Level | Responsibility | Calls | Called by | Scaling | Resilience settings | Est. / month | Cheaper alternative |", "|---|---|---|---|---|---|---|---|---|---|");
    doc.nodes.forEach((n) => {
      const p = n.props || {}, d = def(n), r = compRow[n.id], al = alt(n);
      const scaling = d.cls === "db" ? `${p.ha ? "HA standby" : "single primary"}${p.replicas ? ", " + p.replicas + " replica(s)" : ""}${p.shards > 1 ? ", " + p.shards + " shards" : ""}` : ["service", "proxy", "router"].includes(d.cls) ? `${r ? r.inst : p.inst || 1} instance(s)${p.auto ? ", autoscaling" : ""}${p.ha ? ", HA" : ""}` : "—";
      const res = [p.timeout ? "timeout " + p.timeout + " ms" : "", p.retries ? p.retries + " retries" : "", p.breaker ? "circuit breaker" : "", p.idem ? "idempotent" : ""].filter(Boolean).join(", ") || "not set";
      L.push(`| ${cell(name(n))} | ${cell(d.name)} | L${p.__aiLevel || 1} | ${cell(firstSentence(docs[n.type]))} | ${cell(out(n.id).join(", ") || "—")} | ${cell(inn(n.id).join(", ") || "—")} | ${cell(scaling)} | ${cell(res)} | ${r ? money(r.growth) : "—"} | ${al ? cell(al.alt) : "—"} |`);
    });
    h("## API, event and data contracts (from the wires)");
    const contracts = doc.edges.filter((e) => byNode[e.from] && byNode[e.to] && (e.protocol || e.api || e.payload || e.mode || e.retry || e.classification || e.timeout || e.tls === false));
    if (contracts.length) {
      L.push("| From → to | Protocol | API / event | Payload | Style | Timeout | Retry | Data class | TLS |", "|---|---|---|---|---|---|---|---|---|");
      contracts.forEach((e) => L.push(`| ${cell(name(byNode[e.from]))} → ${cell(name(byNode[e.to]))} | ${cell(e.protocol || "—")} | ${cell(e.api || "—")} | ${cell(e.payload || "—")} | ${e.mode === "async" ? "async" : "sync"} | ${e.timeout ? e.timeout + " ms" : "—"} | ${cell(e.retry || "—")} | ${cell(e.classification || "unclassified")} | ${e.tls === false ? "OFF" : "on"} |`));
      const missing = doc.edges.length - contracts.length; if (missing) L.push("", `${missing} other wire${missing === 1 ? " has" : "s have"} no contract details yet: add protocol, API or event name, timeout, retry policy and data classification in the wire panel.`);
    } else L.push("No wire has contract details yet. Select a wire to record its protocol, API or event name, payload, timeout, retry policy, data classification and TLS.");
    const stack = {}; doc.nodes.forEach((n) => { const d = def(n); (stack[d.cat || "Other"] = stack[d.cat || "Other"] || new Set()).add(d.name); });
    h("## Technology stack on the canvas");
    Object.keys(stack).sort().forEach((k) => L.push(`- **${k}**: ${[...stack[k]].join(", ")}`));
    h("## Cost plan (estimates)");
    if (plan) {
      L.push("| Scenario | Req/s | Monthly estimate |", "|---|---|---|", ...plan.scenarios.map((s) => `| ${s.name} | ${s.rps ? Math.round(s.rps).toLocaleString("en-US") : "—"} | ${s.key === "proto" ? "≈$0 cloud" : money(s.total)} |`));
      if (plan.alternatives.length) { L.push("", "| Component | Current | Monthly est. | Lower-cost alternative | Trade-off | When to upgrade |", "|---|---|---|---|---|---|"); plan.alternatives.forEach((x) => L.push(`| ${cell(x.name)} | ${cell(x.current)} | ${money(x.cost)} | ${cell(x.alt)} | ${cell(x.trade)} | ${cell(x.when)} |`)); }
      L.push("", "Hidden costs not in these totals: " + plan.hidden.filter((x) => x.on).map((x) => x.item).join("; ") + ".");
    }
    h("## Security, reliability, AI and compliance findings");
    if (lint && lint.findings.length) { L.push("| Severity | Area | Finding | Fix | Basis | Reference |", "|---|---|---|---|---|---|"); lint.findings.forEach((f) => L.push(`| ${f.sev} | ${f.cat} | ${cell(f.title)}: ${cell(f.detail)} | ${cell(f.fix)} | ${f.basis}, ${Math.round(f.confidence * 100)}% | ${cell(f.ref)} |`)); }
    else L.push("No findings from the rule set. That is not proof of safety; it means these rules found nothing.");
    h("## Simulation results");
    if (normal) L.push(`- Normal hour: p95 ${Math.round(normal.p95)} ms, availability ${pct(normal.availability)}, ${money(normal.cost)}/month.`);
    if (chaos) L.push(`- Automatic failure drills (${chaos.events.join(", ") || "none applicable"}): score ${chaos.score}/100, p95 ${Math.round(chaos.summary.p95)} ms, availability ${pct(chaos.summary.availability)}.`);
    if (ctx.scen) {
      L.push(`- Simulation Lab: ${ctx.scen.pass} pass, ${ctx.scen.degraded} degraded, ${ctx.scen.fail} fail, ${ctx.scen.na} not applicable (score ${ctx.scen.score}/100).`, "", "| Scenario | Verdict | Basis | Result |", "|---|---|---|---|");
      ctx.scen.results.forEach((r) => L.push(`| ${cell(r.name)} | ${r.verdict} | ${cell(r.basis)} | ${cell(r.summary)} |`));
      L.push("");
    }
    L.push("- These come from a teaching model with round numbers. Confirm with a real load test and chaos test before production.");
    h("## Risks, gaps and unknowns");
    const unknown = (lint ? lint.findings : []).filter((f) => f.basis !== "verified on canvas");
    L.push(...(unknown.length ? unknown.map((f) => `- ${f.title} (${f.basis}): confirm whether it exists outside the drawing.`) : ["- None flagged as unknown."]));
    L.push("- Traffic, data volume and growth figures are assumptions until measured.", "- Prices are teaching estimates; check the provider's pricing calculator for your region.");
    h("## Implementation milestones (draft from the canvas)");
    L.push("1. Foundation: repository, CI/CD, environments, identity, secrets, observability baseline.");
    L.push("2. Close every blocking item above and re-run the checks.");
    L.push(`3. Build the MVP slice (option A): ${doc.nodes.filter((n) => def(n).cls === "service").slice(0, 6).map(name).join(", ") || "core services"}.`);
    L.push("4. Load, chaos and security testing against the goals (gate for level 3).");
    L.push("5. Production readiness review with security, compliance and operations (gate for level 4).");
    h("## Backlog (draft user stories)");
    doc.nodes.filter((n) => ["service", "db", "queue"].includes(def(n).cls)).slice(0, 25).forEach((n) => L.push(`- As the team, build **${name(n)}** (${def(n).name}): ${firstSentence(docs[n.type]) || "define its responsibility"} Done when it meets its API contract, has tests, metrics and alerts.`));
    (lint ? lint.findings : []).filter((f) => ["critical", "high", "medium"].includes(f.sev)).forEach((f) => L.push(`- Fix: ${f.title}. ${f.fix}`));
    h("## Test plan");
    L.push("- Unit and contract tests for every service API and event.", "- Integration tests for each request path on the canvas.", `- Load test at expected (${Math.round(+(doc.scenario || {}).base || 0)} req/s) and peak traffic; pass if p95 ≤ ${slo.p95} ms and errors stay within the availability goal.`, "- Chaos tests: database failover, cache loss, zone loss, slow dependency, queue backlog.", "- Security: dependency and container scanning, SAST/DAST, secrets scanning, threat-model review.", "- Backup restore drill with a measured restore time.");
    h("## Readiness levels");
    a.LEVELS.forEach((l) => L.push(`- ${l.n === a.level ? "**→ " : ""}${l.n}. ${l.name}${l.n === a.level ? "**" : ""}: ${l.means}`));
    return L.join("\n") + "\n";
  }

  return { assess, markdown, LEVELS };
});
