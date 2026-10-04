/* Components for end-to-end designs: Java platform pieces, build and deploy tooling, security and audit services.
 * Teaching numbers only. Same format as catalog_more.js. */
(function (root, factory) {
  const items = factory();
  if (typeof module === "object" && module.exports) module.exports = items;
  if (root && root.LabSim && root.LabSim.extend) root.LabSim.extend(items);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const out = [];
  const add = (id, name, cat, icon, cls, prov, eq, o) => out.push(Object.assign({ id, name, cat, icon, cls, prov, eq: eq || "", cap: 0, ms: 1, cost: 0 }, o || {}));
  const svc = (cap, ms, cost, x) => Object.assign({ cap, ms, cost }, x || {});

  // Java platform
  add("tomcat", "Tomcat / WildFly app server", "Compute", "🍵", "service", "oss", "", svc(350, 30, 80));
  add("springgw", "Spring Cloud Gateway", "Traffic & edge", "🌸", "proxy", "oss", "", svc(20000, 3, 60));
  add("eureka", "Service discovery (Eureka / Consul)", "Containers & Kubernetes", "🧭", "passive", "oss", "", { cost: 40, tag: "discovery" });
  add("configserver", "Config server (Spring Cloud Config)", "Containers & Kubernetes", "🗂️", "passive", "oss", "", { cost: 20, tag: "config" });

  // Build, test and deploy
  add("gitrepo", "Git repository (GitHub / GitLab)", "DevOps & CI/CD", "🌿", "passive", "devops", "scm", { cost: 20, tag: "scm" });
  add("maven", "Maven / Gradle build", "DevOps & CI/CD", "🛠️", "passive", "devops", "", { cost: 0, tag: "build" });
  add("buildserver", "Build server (Jenkins agent / runner)", "DevOps & CI/CD", "🏗️", "passive", "devops", "buildsrv", { cost: 60, tag: "build" });
  add("deployserver", "Deploy server / bastion", "DevOps & CI/CD", "🚚", "passive", "devops", "deploysrv", { cost: 50, tag: "deploy" });
  add("harbor", "Harbor registry", "DevOps & CI/CD", "⚓", "passive", "devops", "registry", { cost: 30, tag: "registry" });
  add("snyk", "Dependency scanning (Snyk / Dependabot)", "DevOps & CI/CD", "🧬", "passive", "devops", "depscan", { cost: 25, tag: "security-scan" });
  add("codesign", "Artifact signing (cosign)", "DevOps & CI/CD", "✍️", "passive", "devops", "", { cost: 0, tag: "security-scan" });
  add("stagingenv", "Staging / test environment", "DevOps & CI/CD", "🧪", "passive", "devops", "", { cost: 200, tag: "env" });

  // Audit, threat detection and compliance
  add("auditlog", "Audit log store (append-only)", "Security & identity", "🧾", "store", "generic", "audit-store", { rd: 6000, wr: 6000, msR: 12, msW: 8, cost: 60, rep: 0, tag: "audit" });
  add("siem", "SIEM (Splunk / QRadar)", "Security & identity", "🛰️", "passive", "oss", "siem", { cost: 400, tag: "siem" });
  add("securityhub", "Security Hub", "Security & identity", "🛡️", "passive", "aws", "siem", { cost: 60, tag: "siem" });
  add("sentinel", "Microsoft Sentinel", "Security & identity", "🛡️", "passive", "azure", "siem", { cost: 90, tag: "siem" });
  add("chronicle", "Chronicle (Google SIEM)", "Security & identity", "🛡️", "passive", "gcp", "siem", { cost: 90, tag: "siem" });
  add("guardduty", "GuardDuty", "Security & identity", "🕵️", "passive", "aws", "threat", { cost: 40, tag: "threat" });
  add("defender", "Defender for Cloud", "Security & identity", "🕵️", "passive", "azure", "threat", { cost: 50, tag: "threat" });
  add("scc", "Security Command Center", "Security & identity", "🕵️", "passive", "gcp", "threat", { cost: 50, tag: "threat" });
  add("awsconfig", "AWS Config", "Security & identity", "📋", "passive", "aws", "compliance", { cost: 20, tag: "compliance" });
  add("azpolicy", "Azure Policy", "Security & identity", "📋", "passive", "azure", "compliance", { cost: 0, tag: "compliance" });
  add("orgpolicy", "Organization Policy", "Security & identity", "📋", "passive", "gcp", "compliance", { cost: 0, tag: "compliance" });
  add("cloudaudit", "Cloud Audit Logs", "Observability", "📜", "passive", "gcp", "audit", { cost: 20, tag: "audit" });
  add("azactivity", "Azure Activity Log", "Observability", "📜", "passive", "azure", "audit", { cost: 20, tag: "audit" });
  add("inspector", "Inspector (vulnerability scan)", "Security & identity", "🔎", "passive", "aws", "vulnscan", { cost: 25, tag: "security-scan" });
  add("cloudhsm", "HSM (CloudHSM / Managed HSM)", "Security & identity", "🔒", "external", "generic", "hsm", svc(2000, 4, 1200));

  // AI agents, safety and reliability building blocks
  add("agent", "AI agent / orchestrator", "AI & ML", "🤖", "service", "generic", "", svc(60, 800, 300, { tag: "agent" }));
  add("guardrails", "AI guardrails (input / output filter)", "AI & ML", "🛡️", "proxy", "generic", "", svc(3000, 25, 80, { tag: "guardrail" }));
  add("toolgw", "Agent tool gateway (allow-list)", "AI & ML", "🧰", "proxy", "generic", "", svc(2000, 10, 60, { tag: "toolgw" }));
  add("modelrouter", "Model router + semantic cache", "AI & ML", "🔀", "proxy", "generic", "", svc(3000, 6, 90, { tag: "modelrouter" }));
  add("approval", "Human approval queue", "AI & ML", "✋", "queue", "generic", "", svc(50, 5, 30, { unit: 10, tag: "approval" }));
  add("dlq", "Dead-letter queue", "Messaging", "📮", "queue", "generic", "", svc(200, 5, 15, { unit: 5, tag: "dlq" }));
  add("backup", "Backup vault (snapshots + point-in-time restore)", "Storage", "💾", "passive", "generic", "", { cost: 60, tag: "backup" });
  return out;
});
