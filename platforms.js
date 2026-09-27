/* Full-platform reference architectures: many Java services, central authentication, audit communication, events, data per service,
 * the build and deploy pipeline, security and observability. Each platform generates (1) a design for the canvas and (2) a blueprint
 * that explains the high-level design and points to the low-level design (classes and patterns) of its core service.
 * Teaching numbers only. Sizes come from platform_sizes.js (tools/size_platforms.js).
 */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.LabPlatforms = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const sc = (base, readPct, shape, x) => Object.assign({ base, shape: shape || "diurnal", readFrac: readPct / 100 }, x || {});
  const slo = (p95, avail, budget) => ({ p95, avail, budget });

  // what each cloud (or your own data centre) provides for each role
  const CLOUD = {
    aws: { label: "AWS", cdn: "cloudfront", waf: "waf-aws", lb: "alb", idp: "cognito", idpName: "Amazon Cognito", pool: "eks", poolName: "EKS nodes", bus: "msk", busName: "Amazon MSK (Kafka)",
      db: { sql: "aurora", doc: "documentdb", wide: "keyspaces", kv: "dynamodb-aws", search: "opensearch-aws", obj: "s3", wh: "redshift" }, cache: "elasticache",
      pipeline: [["ci", "codepipeline"], ["mv", "maven"], ["sq", "sonarqube"], ["sn", "snyk"], ["tv", "trivy"], ["er", "ecr"]], deploy: ["ac", "argocd"], iac: ["tf", "cloudformation"], secrets: ["vt", "secretsmanager"],
      mon: ["mo", "cloudwatch"], trace: ["tr", "xray"], audit: ["ct", "cloudtrail"], threat: ["gd", "guardduty"], hub: ["sm", "securityhub"], alert: ["pd", "pagerduty"], hsm: "cloudhsm" },
    azure: { label: "Azure", cdn: "frontdoor", waf: "azwaf", lb: "appgw", idp: "entraid", idpName: "Microsoft Entra ID", pool: "aks", poolName: "AKS nodes", bus: "eventhubs", busName: "Azure Event Hubs",
      db: { sql: "azuresql", doc: "cosmos", wide: "cosmos", kv: "cosmos", search: "elasticsearch", obj: "blob", wh: "synapse" }, cache: "azredis",
      pipeline: [["ci", "azdevops"], ["mv", "maven"], ["sq", "sonarqube"], ["sn", "snyk"], ["tv", "trivy"], ["er", "acr"]], deploy: ["ac", "argocd"], iac: ["tf", "bicep"], secrets: ["vt", "keyvault"],
      mon: ["mo", "azmonitor"], trace: ["tr", "appinsights"], audit: ["ct", "azactivity"], threat: ["gd", "defender"], hub: ["sm", "sentinel"], alert: ["pd", "pagerduty"], hsm: "cloudhsm" },
    gcp: { label: "Google Cloud", cdn: "cloudcdn", waf: "cloudarmor", lb: "cloudlb", idp: "identityplatform", idpName: "Google Identity Platform", pool: "gke", poolName: "GKE nodes", bus: "gcppubsub", busName: "Google Pub/Sub",
      db: { sql: "cloudsql", doc: "firestore", wide: "bigtable", kv: "bigtable", search: "elasticsearch", obj: "gcs", wh: "bigquery" }, cache: "memorystore",
      pipeline: [["ci", "cloudbuild"], ["mv", "maven"], ["sq", "sonarqube"], ["sn", "snyk"], ["tv", "trivy"], ["er", "artifactregistry"]], deploy: ["ac", "clouddeploy"], iac: ["tf", "deploymentmanager"], secrets: ["vt", "secretmanager"],
      mon: ["mo", "cloudmonitoring"], trace: ["tr", "cloudtrace"], audit: ["ct", "cloudaudit"], threat: ["gd", "scc"], hub: ["sm", "chronicle"], alert: ["pd", "pagerduty"], hsm: "cloudhsm" },
    k8s: { label: "Kubernetes (any cloud)", cdn: "cloudflare", waf: "waf", lb: "lb", idp: "keycloak", idpName: "Keycloak (OAuth2 / OIDC)", pool: "k8snodepool", poolName: "Kubernetes nodes", bus: "kafka", busName: "Apache Kafka",
      db: { sql: "postgres", doc: "mongo", wide: "cassandra", kv: "cassandra", search: "elasticsearch", obj: "minio", wh: "clickhouse" }, cache: "redis-cluster",
      pipeline: [["ci", "githubactions"], ["mv", "maven"], ["sq", "sonarqube"], ["sn", "snyk"], ["tv", "trivy"], ["cs", "codesign"], ["er", "harbor"]], deploy: ["ac", "argocd"], iac: ["tf", "terraform"], secrets: ["vt", "vault"],
      mon: ["mo", "prometheus"], trace: ["tr", "otel"], audit: ["ct", "elk"], threat: null, hub: ["sm", "siem"], alert: ["pd", "pagerduty"], hsm: "cloudhsm" },
    onprem: { label: "your own data centre", cdn: "akamai", waf: "firewall2", lb: "haproxy", idp: "keycloak", idpName: "Keycloak (OAuth2 / OIDC)", pool: null, poolName: "", bus: "kafka", busName: "Apache Kafka",
      db: { sql: "oracle", doc: "mongo", wide: "cassandra", kv: "cassandra", search: "elasticsearch", obj: "minio", wh: "clickhouse" }, cache: "redis-cluster",
      pipeline: [["ci", "jenkins"], ["mv", "maven"], ["sq", "sonarqube"], ["sn", "snyk"], ["er", "artifactory"]], deploy: ["ac", "deployserver"], iac: ["tf", "ansible"], secrets: ["vt", "vault"],
      mon: ["mo", "prometheus"], trace: ["tr", "otel"], audit: ["ct", "elk"], threat: null, hub: ["sm", "siem"], alert: ["pd", "pagerduty"], hsm: "cloudhsm" },
  };
  const DBNAME = { sql: "relational database", doc: "document database", wide: "wide-column database", kv: "key-value database", search: "search index", obj: "object storage", wh: "warehouse" };

  const P = [];
  /* service: [id, label, responsibility, dbKind (sql|doc|wide|kv|search|obj|wh|none), {cache, canary, patterns, auditShare, note}] */
  const S = (id, label, resp, db, o) => Object.assign({ id, label, resp, db: db || "none", cache: false, canary: false, patterns: [], audit: 0.3 }, o || {});
  const platform = (cfg) => P.push(cfg);

  // ---------------------------------------------------------------- 1. e-commerce
  platform({ id: "ecom", cloud: "aws", name: "E-commerce platform (Java microservices)", client: "browser",
    notice: "Nine Java services with a database each, one central sign-in, an event bus, an audit trail, saga-based checkout and the full delivery pipeline. Open the Blueprint tab for the high-level and low-level design.",
    summary: "An online store split into Spring Boot services around business capabilities. Browsing is cached and searchable; checkout is a saga across order, inventory, payment and shipping, published as events and audited.",
    scenario: sc(2600, 85, "spike", { spikeX: 3, staticFrac: 0.3 }), slo: slo(350, 99.9, 90000),
    services: [
      S("cat", "Catalog service", "Product data and prices. Serves reads from a cache; changes are published so search stays fresh.", "doc", { cache: true, canary: true, patterns: ["Cache-aside", "CQRS read model"], audit: 0.05 }),
      S("srch", "Search service", "Full-text and filter search over a search index built from product events.", "search", { patterns: ["CQRS read model"], audit: 0.02 }),
      S("cart", "Cart service", "Holds the shopping cart per user. Fast, short-lived data.", "sql", { cache: true, patterns: ["Repository"], audit: 0.1 }),
      S("ord", "Order service", "Owns orders. Orchestrates the checkout saga and publishes OrderPlaced through an outbox.", "sql", { canary: true, patterns: ["Saga (orchestrator)", "Transactional outbox", "State", "Repository"], audit: 0.6 }),
      S("pay", "Payment service", "Charges cards through an external provider. Idempotent, with a circuit breaker and timeouts.", "sql", { patterns: ["Adapter", "Circuit breaker", "Idempotency key"], audit: 0.8 }),
      S("inv", "Inventory service", "Stock levels and reservations with optimistic locking.", "sql", { patterns: ["Optimistic locking", "Saga participant"], audit: 0.3 }),
      S("shp", "Shipping service", "Creates shipments and tracks them. Chooses a carrier per order.", "wide", { patterns: ["Strategy (carrier choice)"], audit: 0.2 }),
      S("usr", "User profile service", "Profiles and addresses. Authentication itself lives in the central auth server.", "sql", { patterns: ["Repository", "DTO mapping"], audit: 0.4 }),
      S("ntf", "Notification service", "Sends email and push from events; never called directly by other services.", "none", { patterns: ["Observer", "Strategy (channels)"], audit: 0 }),
    ],
    routes: [["cat", "r", null], ["srch", null, 0.4], ["cart", null, 0.25], ["ord", "w", null], ["usr", null, 0.12]],
    calls: [["ord", "inv", 0.9, "REST", "Reserve stock as the first saga step; fails fast if unavailable"], ["ord", "pay", 0.9, "REST", "Charge the card as the second saga step with an idempotency key"], ["cart", "cat", 0.5, "REST", "Read current prices when the cart is shown"]],
    events: [["cat", "srch", 0.05, "ProductChanged", "Keeps the search index in step with the catalog"], ["ord", "shp", 0.6, "OrderPaid", "Shipping starts only after payment"], ["ord", "ntf", 0.6, "OrderPlaced", "Confirmation email and push, decoupled from checkout"], ["pay", "ord", 0.5, "PaymentResult", "Result flows back to the saga"]],
    external: [["pay", "stripe", 0.9, "Card processor"]],
    extras: ["e2:email ratio=0.2 inst=? name=Email_provider"], extraEdges: ["ntf>e2"],
    tradeoffs: ["Eventual consistency between services: the search index and read models lag by seconds.", "Many services to run: needs strong automation, tracing and on-call.", "Saga compensations must be idempotent and tested."],
    talk: ["Start from the business capabilities and draw one service per capability with its own database.", "Explain the checkout flow as a saga and where compensation happens.", "Show the single sign-in and how every service verifies the token itself.", "Point out the audit events and how they reach an append-only store.", "Finish with failure modes: payment provider slow, Kafka lag, hot product."],
    lld: "bp-ecom" });

  // ---------------------------------------------------------------- 2. digital bank
  platform({ id: "bank", cloud: "azure", name: "Digital bank (Java, zero trust, audit trail)", client: "mobile",
    notice: "Accounts, transfers, cards, loans, KYC, fraud and a double-entry ledger as separate Java services, with a hardware key module, mutual TLS, a tamper-evident audit trail and a SIEM.",
    summary: "A retail bank on Azure. Money movement is a saga with a double-entry ledger; every call is authenticated and audited; fraud checks sit on the critical path with a safe fallback.",
    scenario: sc(1800, 60, "diurnal"), slo: slo(300, 99.95, 140000),
    services: [
      S("acct", "Accounts service", "Customer accounts, balances and statements.", "sql", { cache: true, patterns: ["CQRS (statements)", "Repository"], audit: 0.5 }),
      S("xfer", "Transfers service", "Moves money: validates, checks fraud, posts to the ledger. A saga with idempotent steps.", "sql", { canary: true, patterns: ["Saga", "Idempotency key", "Transactional outbox", "Circuit breaker"], audit: 1 }),
      S("ldg", "Ledger service", "Double-entry, append-only ledger. The source of truth for balances.", "sql", { patterns: ["Event sourcing (append-only)", "Optimistic locking"], audit: 1 }),
      S("card", "Cards service", "Card issue, limits and authorisation. Keys live in the HSM.", "sql", { patterns: ["State", "Adapter (card network)"], audit: 0.7 }),
      S("loan", "Loans service", "Applications, scoring and repayment schedules.", "sql", { patterns: ["Strategy (scoring)", "Template method (workflow)"], audit: 0.4 }),
      S("kyc", "KYC / onboarding service", "Identity checks and document verification.", "doc", { patterns: ["Chain of responsibility (checks)", "Adapter (vendors)"], audit: 0.8 }),
      S("frd", "Fraud service", "Scores each transfer in real time from features.", "kv", { cache: true, patterns: ["Strategy (rules + model)", "Circuit breaker + fallback"], audit: 0.5 }),
      S("ntf", "Notification service", "SMS, push and email alerts from events.", "none", { patterns: ["Observer", "Strategy (channels)"], audit: 0 }),
      S("rpt", "Regulatory reporting service", "Batch reports for regulators from the event stream.", "wh", { patterns: ["Template method", "CQRS read model"], audit: 0.05 }),
    ],
    routes: [["acct", "r", null], ["xfer", "w", null], ["card", null, 0.2], ["loan", null, 0.06], ["kyc", null, 0.05]],
    calls: [["xfer", "frd", 0.9, "gRPC", "Real-time fraud score before money moves; fallback rules if it is slow"], ["xfer", "ldg", 0.9, "gRPC", "Post the double-entry transaction"], ["acct", "ldg", 0.3, "gRPC", "Read balances from the ledger"], ["card", "frd", 0.4, "gRPC", "Score card authorisations"]],
    events: [["xfer", "ntf", 0.9, "TransferCompleted", "Alert the customer"], ["ldg", "rpt", 0.9, "LedgerPosted", "Feeds regulatory reports and analytics"], ["kyc", "acct", 0.05, "CustomerVerified", "Activates the account"]],
    external: [["xfer", "thirdparty", 0.4, "Payment rails (SWIFT / UPI)"]], hsm: ["xfer", "card"],
    extras: [], extraEdges: [],
    tradeoffs: ["Strong consistency in the ledger limits write scaling: shard by account.", "Fraud on the critical path adds latency and needs a fallback policy.", "Compliance adds cost: HSM, long log retention, SIEM."],
    talk: ["Explain why the ledger is append-only and the single source of truth.", "Walk through a transfer as a saga with idempotency keys.", "Show zero trust: gateway auth, mutual TLS between services, per-service authorisation.", "Explain the audit trail and how tampering is detected.", "Discuss fraud fallback and regulatory reporting."],
    lld: "bp-bank" });

  // ---------------------------------------------------------------- 3. ride hailing
  platform({ id: "ride", cloud: "gcp", name: "Ride-hailing platform (Java services on Kafka-style events)", client: "mobile",
    notice: "Rider and driver apps, a location service taking constant writes, matching, trips as a state machine, dynamic pricing, payments and notifications, all as separate Java services.",
    summary: "A ride-hailing backend on Google Cloud. Driver locations are a firehose kept in memory and streamed; matching reads them; trips follow a strict state machine; pricing reacts to demand.",
    scenario: sc(6000, 35, "diurnal", { skew: 2 }), slo: slo(250, 99.9, 160000),
    services: [
      S("rider", "Rider service", "Rider profiles and ride requests.", "sql", { patterns: ["Repository"], audit: 0.3 }),
      S("drv", "Driver service", "Driver profiles, documents and availability.", "sql", { patterns: ["Repository", "State (availability)"], audit: 0.3 }),
      S("loc", "Location service", "Ingests driver positions constantly and keeps them in an in-memory geo index.", "wide", { cache: true, patterns: ["Geohash index", "Write-behind"], audit: 0 }),
      S("mat", "Matching service", "Finds the best nearby driver for a request.", "none", { patterns: ["Strategy (matching)"], audit: 0.2 }),
      S("trip", "Trip service", "Owns the trip life cycle and events.", "sql", { canary: true, patterns: ["State machine", "Transactional outbox", "Observer"], audit: 0.7 }),
      S("prc", "Pricing service", "Fare estimates and surge from demand and supply.", "kv", { cache: true, patterns: ["Strategy (pricing)", "Decorator (surge, promo)"], audit: 0.1 }),
      S("pay", "Payment service", "Charges at trip end; idempotent.", "sql", { patterns: ["Adapter", "Circuit breaker", "Idempotency key"], audit: 0.8 }),
      S("ntf", "Notification service", "Push and SMS for status changes.", "none", { patterns: ["Observer"], audit: 0 }),
    ],
    routes: [["rider", null, 0.2], ["loc", null, 0.5], ["trip", "w", null], ["prc", null, 0.2], ["drv", null, 0.05]],
    calls: [["trip", "mat", 0.5, "gRPC", "Ask for a driver when a trip is requested"], ["mat", "loc", 0.9, "gRPC", "Read nearby drivers from the geo index"], ["trip", "prc", 0.5, "REST", "Quote the fare"]],
    events: [["loc", "mat", 0.3, "DriverMoved", "Keeps matching data fresh"], ["trip", "pay", 0.2, "TripCompleted", "Triggers payment"], ["trip", "ntf", 0.9, "TripStatusChanged", "Rider and driver notifications"]],
    external: [["pay", "stripe", 0.9, "Card processor"]], extras: ["mp:maps ratio=0.2 inst=? name=Maps_and_routing"], extraEdges: ["trip>mp"],
    tradeoffs: ["Location writes dominate: memory and streams are essential, the database only gets snapshots.", "Matching quality vs latency: a wider search finds better drivers but takes longer.", "Surge pricing needs guardrails to stay fair and legal."],
    talk: ["Start with the location firehose and where it lives.", "Show matching as a strategy over a geo index.", "Explain the trip state machine and why events flow from it.", "Discuss pricing strategy and decorators for surge and promotions.", "Cover failure: driver app offline, payment failure at trip end."],
    lld: "bp-ride" });

  // ---------------------------------------------------------------- 4. food delivery
  platform({ id: "food", cloud: "k8s", name: "Food delivery platform (Java microservices on Kubernetes)", client: "mobile",
    notice: "Restaurants, menus, orders, dispatch, live tracking, promotions and payments on Kubernetes with Kafka, plus the whole GitOps pipeline and observability stack.",
    summary: "A delivery marketplace run on Kubernetes. Orders flow through a state machine; dispatch assigns couriers; tracking streams positions; promotions and pricing are pluggable strategies.",
    scenario: sc(3800, 60, "spike", { spikeX: 3 }), slo: slo(300, 99.9, 110000),
    services: [
      S("rest", "Restaurant & menu service", "Restaurants, menus, opening hours.", "doc", { cache: true, patterns: ["Cache-aside", "Repository"], audit: 0.05 }),
      S("ord", "Order service", "Takes and tracks orders through their life cycle.", "sql", { canary: true, patterns: ["State", "Transactional outbox", "Saga"], audit: 0.6 }),
      S("dsp", "Dispatch service", "Assigns couriers to orders.", "none", { patterns: ["Strategy (assignment)", "Command"], audit: 0.2 }),
      S("trk", "Tracking service", "Streams courier positions to customers.", "wide", { cache: true, patterns: ["Observer", "Write-behind"], audit: 0 }),
      S("pay", "Payment service", "Charges, refunds and courier payouts.", "sql", { patterns: ["Adapter", "Circuit breaker", "Idempotency key"], audit: 0.8 }),
      S("prm", "Promotions service", "Coupons and discounts.", "sql", { patterns: ["Strategy (rules)", "Chain of responsibility"], audit: 0.2 }),
      S("usr", "Customer service", "Customer profiles and addresses.", "sql", { patterns: ["Repository"], audit: 0.4 }),
      S("ntf", "Notification service", "Push and SMS for order updates.", "none", { patterns: ["Observer", "Strategy (channels)"], audit: 0 }),
    ],
    routes: [["rest", "r", null], ["ord", "w", null], ["trk", null, 0.3], ["usr", null, 0.1]],
    calls: [["ord", "prm", 0.6, "REST", "Apply the best promotion at checkout"], ["ord", "pay", 0.6, "REST", "Authorise payment"], ["ord", "rest", 0.5, "REST", "Confirm the restaurant accepted"]],
    events: [["ord", "dsp", 0.6, "OrderReady", "Starts courier assignment"], ["dsp", "trk", 0.5, "CourierAssigned", "Starts live tracking"], ["ord", "ntf", 0.9, "OrderStatusChanged", "Customer updates"], ["trk", "ntf", 0.1, "CourierArriving", "Arrival alerts"]],
    external: [["pay", "stripe", 0.6, "Card processor"]], extras: ["mp:maps ratio=0.3 inst=? name=Maps_and_ETA"], extraEdges: ["dsp>mp"],
    tradeoffs: ["Meal peaks are short and sharp: pre-scaling matters more than reactive scaling.", "Tracking traffic can dwarf order traffic; keep it off the order database.", "Promotions logic changes weekly: keep rules as data and strategies."],
    talk: ["Draw the order state machine first.", "Explain dispatch as a strategy that can change without touching orders.", "Show how tracking streams positions and where it is stored.", "Cover the Kubernetes deployment: pods, HPA, node pool, canary and GitOps.", "Discuss lunch and dinner peaks and failure of the payment provider."],
    lld: "bp-food" });

  // ---------------------------------------------------------------- 5. healthcare
  platform({ id: "health", cloud: "aws", name: "Healthcare records platform (privacy, consent, full audit)", client: "browser",
    notice: "Patients, appointments, medical records, consent, imaging and billing as Java services. Every access is checked against consent and written to a tamper-evident audit trail.",
    summary: "A hospital platform on AWS where privacy comes first. Access is decided by role and patient consent; every read is audited; imaging lives in object storage; records are encrypted with managed keys.",
    scenario: sc(1400, 78, "diurnal"), slo: slo(400, 99.95, 90000),
    services: [
      S("pat", "Patient service", "Demographics and identifiers.", "sql", { cache: true, patterns: ["Repository", "Adapter (HL7 / FHIR)"], audit: 1 }),
      S("apt", "Appointments service", "Scheduling clinics and doctors.", "sql", { patterns: ["Repository", "Observer (reminders)"], audit: 0.6 }),
      S("rec", "Medical records service", "Clinical notes, prescriptions and results.", "doc", { cache: true, canary: true, patterns: ["Chain of responsibility (access checks)", "Decorator (audit)", "Adapter (FHIR)"], audit: 1 }),
      S("cns", "Consent service", "Who may see which patient data, and until when.", "sql", { cache: true, patterns: ["Policy (ABAC)", "Repository"], audit: 1 }),
      S("img", "Imaging service", "Scans and reports stored in object storage with signed URLs.", "obj", { patterns: ["Proxy (signed access)"], audit: 1 }),
      S("bil", "Billing service", "Claims and invoices.", "sql", { patterns: ["Strategy (payer rules)", "Saga"], audit: 0.6 }),
      S("ntf", "Notification service", "Appointment reminders and result alerts.", "none", { patterns: ["Observer", "Strategy (channels)"], audit: 0 }),
    ],
    routes: [["pat", null, 0.35], ["apt", null, 0.2], ["rec", "r", null], ["bil", "w", null], ["img", null, 0.1]],
    calls: [["rec", "cns", 1, "gRPC", "Every read asks: does the patient consent to this viewer?"], ["img", "cns", 1, "gRPC", "Same consent check before a scan URL is issued"], ["rec", "pat", 0.5, "gRPC", "Resolve patient identity"]],
    events: [["apt", "ntf", 0.5, "AppointmentBooked", "Reminders"], ["rec", "ntf", 0.1, "ResultReady", "Tell the patient"], ["rec", "bil", 0.2, "ProcedureRecorded", "Creates billable items"]],
    external: [], extras: [], extraEdges: [],
    tradeoffs: ["Consent check on every read adds latency: cache carefully and invalidate on change.", "Full auditing of reads produces very large logs: stream and archive them.", "Break-glass emergency access must be possible and heavily audited."],
    talk: ["Start with privacy requirements: consent, minimum access, audit of every read.", "Show the access chain: authenticate, authorise by role, check consent, log.", "Explain how imaging avoids the app servers with signed URLs.", "Cover encryption and key management.", "Discuss break-glass access and retention of audit logs."],
    lld: "bp-health" });

  // ---------------------------------------------------------------- 6. ticketing
  platform({ id: "ticket", cloud: "gcp", name: "Ticket booking platform (flash-sale safe)", client: "browser",
    notice: "A waiting room, seat inventory with holds, booking, payments and notifications as Java services designed to survive an on-sale spike.",
    summary: "A ticketing system on Google Cloud built for sudden crowds: static browsing at the edge, a waiting room that admits users at a safe rate, seat holds with expiry, and a payment saga.",
    scenario: sc(900, 60, "spike", { spikeX: 15, skew: 3 }), slo: slo(600, 99.5, 130000),
    services: [
      S("evt", "Events service", "Events, venues and show times. Cached and CDN friendly.", "doc", { cache: true, patterns: ["Cache-aside"], audit: 0.02 }),
      S("wait", "Waiting room service", "Admits users at a rate the backend can serve, using tokens.", "none", { cache: true, patterns: ["Token bucket", "Queue"], audit: 0.05 }),
      S("seat", "Seat inventory service", "Seat map and holds with expiry.", "sql", { patterns: ["Locking with expiry", "Optimistic locking"], audit: 0.4 }),
      S("book", "Booking service", "Turns a hold into a booking after payment.", "sql", { canary: true, patterns: ["Saga", "State", "Transactional outbox"], audit: 0.7 }),
      S("pay", "Payment service", "Charges and refunds.", "sql", { patterns: ["Adapter", "Circuit breaker", "Idempotency key"], audit: 0.8 }),
      S("usr", "Customer service", "Accounts and order history.", "sql", { patterns: ["Repository"], audit: 0.3 }),
      S("ntf", "Notification service", "E-tickets and reminders.", "none", { patterns: ["Observer"], audit: 0 }),
    ],
    routes: [["evt", "r", null], ["wait", null, 0.6], ["book", "w", null], ["usr", null, 0.1]],
    calls: [["book", "seat", 0.9, "gRPC", "Hold seats first, confirm after payment"], ["book", "pay", 0.8, "REST", "Charge after the hold succeeds"], ["seat", "evt", 0.3, "REST", "Seat map metadata"]],
    events: [["book", "ntf", 0.8, "BookingConfirmed", "Send the e-ticket"], ["book", "seat", 0.2, "BookingCancelled", "Release seats back to sale"]],
    external: [["pay", "stripe", 0.8, "Card processor"]], extras: [], extraEdges: [],
    tradeoffs: ["Fairness vs throughput in the waiting room.", "Holds that expire lock inventory: choose the hold time carefully.", "Overloading the seat database is the main risk: protect it with the queue."],
    talk: ["Describe the spike and admit users through a waiting room.", "Explain seat holds with expiry and optimistic locking.", "Show the booking saga and what happens if payment fails.", "Discuss CDN for static pages and pre-scaling.", "Cover bots and fairness."],
    lld: "bp-ticket" });

  // ---------------------------------------------------------------- 7. insurance
  platform({ id: "insure", cloud: "azure", name: "Insurance claims platform (workflow, documents, fraud)", client: "browser",
    notice: "Policies, claims, underwriting, documents, fraud checks and a workflow engine as Java services, with approvals, audit and document storage.",
    summary: "A claims platform on Azure. A claim moves through a workflow with rules and human approvals; documents sit in object storage; fraud scoring and audit run on every step.",
    scenario: sc(700, 70, "diurnal"), slo: slo(450, 99.9, 80000),
    services: [
      S("pol", "Policy service", "Policies, coverage and premiums.", "sql", { cache: true, patterns: ["Repository", "Strategy (premium rules)"], audit: 0.5 }),
      S("clm", "Claims service", "Claim intake and life cycle.", "sql", { canary: true, patterns: ["State machine", "Transactional outbox", "Command"], audit: 1 }),
      S("und", "Underwriting service", "Risk rules for new policies.", "none", { patterns: ["Strategy (rules)", "Chain of responsibility"], audit: 0.4 }),
      S("doc", "Document service", "Uploads, scans and generated letters in object storage.", "obj", { patterns: ["Proxy (signed access)", "Adapter (OCR)"], audit: 0.6 }),
      S("frd", "Fraud service", "Scores claims for suspicious patterns.", "kv", { cache: true, patterns: ["Strategy (models)", "Circuit breaker + fallback"], audit: 0.5 }),
      S("wf", "Workflow service", "Runs approvals and tasks (a BPMN engine).", "sql", { patterns: ["State machine", "Chain of responsibility (approvals)"], audit: 1 }),
      S("pay", "Payout service", "Pays approved claims.", "sql", { patterns: ["Adapter", "Idempotency key", "Saga participant"], audit: 1 }),
      S("ntf", "Notification service", "Letters, email and SMS to customers.", "none", { patterns: ["Observer", "Strategy (channels)"], audit: 0 }),
    ],
    routes: [["pol", null, 0.3], ["clm", "w", null], ["doc", null, 0.2], ["und", null, 0.05]],
    calls: [["clm", "frd", 0.9, "REST", "Score the claim on submission"], ["clm", "pol", 0.9, "REST", "Check coverage"], ["clm", "wf", 0.7, "REST", "Start the approval workflow"]],
    events: [["wf", "pay", 0.3, "ClaimApproved", "Triggers payout"], ["clm", "ntf", 0.8, "ClaimStatusChanged", "Keep the customer informed"], ["clm", "doc", 0.2, "LetterRequested", "Generate letters"]],
    external: [["pay", "thirdparty", 0.3, "Bank payout API"]], extras: [], extraEdges: [],
    tradeoffs: ["Human approval steps make claims long-running: the workflow state must be durable.", "Documents are large and sensitive: keep them off the request path and encrypt them.", "Fraud false positives slow honest customers."],
    talk: ["Describe a claim as a long-running workflow.", "Show rules as strategies and approvals as a chain.", "Explain document handling and privacy.", "Cover fraud scoring with a safe fallback.", "Discuss auditability for regulators."],
    lld: "bp-insure" });

  // ---------------------------------------------------------------- 8. HR / payroll SaaS
  platform({ id: "hr", cloud: "aws", name: "HR & payroll SaaS (multi-tenant Java services)", client: "browser",
    notice: "Tenants, employees, payroll, attendance and leave as Java services serving many customer companies, with tenant isolation, monthly payroll batches and reporting.",
    summary: "A multi-tenant HR product on AWS. Every request carries a tenant; data is isolated per tenant; payroll runs are heavy monthly batches; reporting is built from events into a warehouse.",
    scenario: sc(1600, 82, "diurnal", { skew: 1.6 }), slo: slo(350, 99.9, 85000),
    services: [
      S("tnt", "Tenant service", "Companies, plans and limits.", "sql", { cache: true, patterns: ["Repository", "Multi-tenancy (tenant context)"], audit: 0.3 }),
      S("emp", "Employee service", "Employee records and org structure.", "sql", { cache: true, patterns: ["Repository", "Multi-tenancy"], audit: 0.6 }),
      S("pyr", "Payroll service", "Monthly salary runs with country tax rules.", "sql", { canary: true, patterns: ["Strategy (tax per country)", "Template method (pipeline)", "Command"], audit: 1 }),
      S("att", "Attendance service", "Clock-in data and timesheets.", "wide", { patterns: ["Repository", "Observer"], audit: 0.2 }),
      S("lea", "Leave service", "Leave requests and balances.", "sql", { patterns: ["State (request)", "Chain of responsibility (approvals)"], audit: 0.5 }),
      S("rpt", "Reporting service", "Dashboards and exports from a warehouse.", "wh", { patterns: ["CQRS read model"], audit: 0.05 }),
      S("bil", "Billing service", "Subscriptions and invoices for tenants.", "sql", { patterns: ["Strategy (plans)", "Idempotency key"], audit: 0.5 }),
      S("ntf", "Notification service", "Email and in-app notices.", "none", { patterns: ["Observer"], audit: 0 }),
    ],
    routes: [["emp", null, 0.35], ["att", null, 0.25], ["lea", null, 0.15], ["pyr", "w", null], ["rpt", null, 0.12]],
    calls: [["pyr", "emp", 0.8, "gRPC", "Read salaries and structure for a run"], ["lea", "emp", 0.5, "gRPC", "Resolve the approver chain"], ["emp", "tnt", 0.6, "gRPC", "Tenant limits and settings"]],
    events: [["pyr", "rpt", 0.4, "PayrollRunFinished", "Feeds reports"], ["lea", "ntf", 0.5, "LeaveDecided", "Tell the employee"], ["att", "pyr", 0.15, "TimesheetClosed", "Input for payroll"]],
    external: [["bil", "stripe", 0.5, "Card processor"]], extras: [], extraEdges: [],
    tradeoffs: ["Shared database with tenant id is cheap but one bug can leak data: enforce tenant filters in one place.", "Payroll runs are spiky batch work: run them on separate capacity.", "Country rules change often: keep them as strategies and data."],
    talk: ["Start with multi-tenancy: how a tenant is identified and isolated.", "Explain the payroll pipeline as a template with country strategies.", "Show reporting via events into a warehouse.", "Discuss noisy neighbours and per-tenant limits.", "Cover data privacy and audit of salary access."],
    lld: "bp-hr" });

  // ---------------------------------------------------------------- 9. OTT streaming
  platform({ id: "ott", cloud: "gcp", name: "Video streaming service (Java control plane, CDN data plane)", client: "browser",
    notice: "Catalog, playback, recommendations, subscriptions, billing and licences as Java services, with video bytes served by the CDN and analytics flowing through events.",
    summary: "An OTT service on Google Cloud. The heavy video traffic bypasses the services entirely; the Java control plane decides what you can watch, issues licences and records what you watched.",
    scenario: sc(5200, 92, "diurnal", { staticFrac: 0.6 }), slo: slo(250, 99.95, 170000),
    services: [
      S("cat", "Catalog service", "Titles, artwork and metadata.", "doc", { cache: true, patterns: ["Cache-aside", "CQRS read model"], audit: 0.02 }),
      S("ply", "Playback service", "Checks entitlement and hands out signed stream URLs and licences.", "none", { cache: true, canary: true, patterns: ["Chain of responsibility (entitlement, region, device)", "Proxy (signed URL)"], audit: 0.15 }),
      S("rec", "Recommendation service", "Personalised rows from models and history.", "kv", { cache: true, patterns: ["Strategy (ranking)", "Decorator (caching)"], audit: 0.02 }),
      S("sub", "Subscription service", "Plans and entitlements.", "sql", { cache: true, patterns: ["State (subscription)", "Repository"], audit: 0.4 }),
      S("bil", "Billing service", "Charges and invoices.", "sql", { patterns: ["Adapter", "Idempotency key", "Circuit breaker"], audit: 0.8 }),
      S("drm", "Licence (DRM) service", "Issues licence keys for protected streams.", "none", { patterns: ["Adapter (DRM vendors)", "Circuit breaker"], audit: 0.3 }),
      S("ana", "Analytics ingest service", "Collects viewing events.", "wh", { patterns: ["Write-behind", "Stream processing"], audit: 0 }),
      S("usr", "Profile service", "Profiles and watch lists.", "sql", { patterns: ["Repository"], audit: 0.3 }),
    ],
    routes: [["cat", "r", null], ["ply", null, 0.45], ["rec", null, 0.35], ["usr", null, 0.1], ["sub", "w", null]],
    calls: [["ply", "sub", 0.9, "gRPC", "Entitlement check for the viewer's plan"], ["ply", "drm", 0.8, "gRPC", "Licence for protected content"], ["rec", "usr", 0.4, "gRPC", "Watch history"]],
    events: [["ply", "ana", 0.9, "PlaybackStarted", "Viewing analytics"], ["sub", "bil", 0.2, "SubscriptionChanged", "Billing trigger"], ["ana", "rec", 0.1, "ViewingSummary", "Feeds recommendation models"]],
    external: [["bil", "stripe", 0.2, "Card processor"]], extras: [], extraEdges: [],
    tradeoffs: ["Personalisation costs compute and cache memory; precompute where possible.", "DRM vendors are a critical external dependency: breakers and fallbacks.", "A viral release needs CDN warming and scaled playback checks."],
    talk: ["Split control plane (Java) from data plane (CDN).", "Explain the playback chain: entitlement, region, device, DRM.", "Show recommendations as a strategy with caching.", "Cover analytics through events.", "Discuss a new-release spike."],
    lld: "bp-ott" });

  // ---------------------------------------------------------------- 10. logistics (on premises)
  platform({ id: "logi", cloud: "onprem", name: "Logistics platform (Java on your own servers, Jenkins pipeline)", client: "browser",
    notice: "Orders, warehouse, inventory, route planning, live tracking and billing as Java services on Tomcat, deployed by Jenkins, Nexus and Ansible in your own data centre.",
    summary: "A logistics company running in its own data centre. Classic Java servers behind HAProxy, Keycloak for sign-in, Kafka for events, Oracle for core data, and a Jenkins, Nexus and Ansible delivery chain.",
    scenario: sc(1500, 70, "diurnal"), slo: slo(400, 99.9, 90000),
    services: [
      S("ord", "Order service", "Shipment orders and their life cycle.", "sql", { patterns: ["State", "Transactional outbox", "Repository"], audit: 0.6 }),
      S("wh", "Warehouse service", "Receiving, picking and packing tasks.", "sql", { patterns: ["Command", "Template method (workflow)"], audit: 0.4 }),
      S("inv", "Inventory service", "Stock per warehouse.", "sql", { cache: true, patterns: ["Optimistic locking", "Repository"], audit: 0.4 }),
      S("rte", "Route planning service", "Plans delivery routes.", "none", { cache: true, patterns: ["Strategy (planner)", "Template method"], audit: 0.1 }),
      S("trk", "Tracking service", "Consumes vehicle GPS and answers where-is-my-parcel.", "wide", { cache: true, patterns: ["Observer", "Write-behind"], audit: 0 }),
      S("bil", "Billing service", "Rates and invoices.", "sql", { patterns: ["Strategy (rate cards)", "Idempotency key"], audit: 0.6 }),
      S("vnd", "Partner integration service", "EDI and APIs to carriers and customers.", "none", { patterns: ["Adapter", "Circuit breaker", "Facade"], audit: 0.4 }),
      S("ntf", "Notification service", "Email and SMS to customers and drivers.", "none", { patterns: ["Observer"], audit: 0 }),
    ],
    routes: [["ord", "w", null], ["trk", "r", null], ["wh", null, 0.2], ["inv", null, 0.2], ["rte", null, 0.1]],
    calls: [["ord", "inv", 0.8, "REST", "Reserve stock"], ["ord", "rte", 0.4, "REST", "Plan the route"], ["wh", "inv", 0.6, "REST", "Update stock on pick"]],
    events: [["trk", "ntf", 0.2, "ParcelDelivered", "Delivery notices"], ["ord", "bil", 0.4, "ShipmentCompleted", "Invoice the customer"], ["ord", "wh", 0.5, "OrderAccepted", "Start picking"]],
    external: [["vnd", "thirdparty", 0.4, "Carrier APIs"]], extras: [], extraEdges: [],
    tradeoffs: ["Capacity is fixed: you plan for peak, not for average.", "Manual scaling and patching: automation with Ansible is essential.", "Tomcat monoliths are easier to run than dozens of containers but harder to scale individually."],
    talk: ["Explain the traditional delivery chain: Git, Jenkins, Maven, Sonar, Nexus, deploy server, Ansible.", "Show why services are still separate by capability.", "Discuss sizing for peak and failover across two data centres.", "Cover tracking as high-volume writes handled with a stream.", "Talk about migrating gradually to containers (strangler)."],
    lld: "bp-logi" });

  // ---------------------------------------------------------------- generation
  const T = (s) => s.replace(/\s+/g, "_");
  const hosted = (C) => !!C.pool;
  function generate(cfg) {
    const C = CLOUD[cfg.cloud], nodes = [], edges = [], N = (id, type, props) => nodes.push(id + ":" + type + (props ? " " + props : "")), E = (s) => edges.push(s);
    const svcType = cfg.cloud === "onprem" ? "tomcat" : "springboot";
    N("c", cfg.client || "browser", ""); N("cdn", C.cdn); N("w", C.waf); N("lb", C.lb + " ha");
    N("gw", "springgw", "name=API_Gateway inst=?"); N("idp", C.idp, "name=Central_auth_server inst=?");
    E("c>cdn>w>lb>gw"); E("gw~idp{1}");
    cfg.services.forEach((s) => N(s.id, svcType, `name=${T(s.label)} inst=? auto retries=1 breaker` + (s.canary ? " deploy=canary" : "")));
    cfg.services.forEach((s) => {
      if (s.db === "none") return;
      const type = s.db === "sql" && cfg.cloud === "onprem" ? "oracle" : C.db[s.db], name = `name=${T(s.label.replace(/ service$/, "") + " " + DBNAME[s.db])}`;
      if (s.cache) { N(s.id + "_k", C.cache, `name=${T(s.label.replace(/ service$/, "") + " cache")} inst=? hit=0.85`); E(`${s.id}>${s.id}_k>${s.id}_d`); E(`${s.id}>${s.id}_d`); }
      else E(`${s.id}>${s.id}_d`);
      N(s.id + "_d", type, s.db === "obj" ? `${name} inst=?` : s.db === "search" ? `${name} replicas=1 shards=?` : s.db === "sql" ? `${name} shards=? replicas=1 ha` : `${name} shards=?`);
    });
    N("bus", C.bus, "name=Event_bus workers=?");
    N("aw", "worker", "name=Audit_writer inst=? auto"); N("al", "auditlog", "name=Audit_log_store_(append-only) inst=?");
    E("bus~aw{1}"); E("aw>al");
    if (hosted(C)) { N("np", C.pool, `name=${T(C.poolName)} nodes=? auto max=80 multiAz`); }
    // routing from the gateway
    cfg.routes.forEach(([id, only, share]) => { if (share) E(`gw~${id}{${share}}`); else E(only ? `gw>${id}[${only}]` : `gw>${id}`); });
    // synchronous calls
    cfg.calls.forEach(([a, b, share]) => E(`${a}~${b}{${share}}`));
    // asynchronous events and audit
    const prod = {}; cfg.events.forEach(([a, b, share]) => { prod[a] = (prod[a] || 0) + share; });
    cfg.services.forEach((s) => { const w = Math.min(1, (prod[s.id] || 0) + s.audit); if (w > 0) E(`${s.id}~bus{${w.toFixed(2)}}`); });
    const consumers = {}; cfg.events.forEach(([a, b, share]) => { consumers[b] = (consumers[b] || 0) + share; });
    Object.keys(consumers).forEach((id) => E(`bus~${id}{${Math.min(1, consumers[id]).toFixed(2)}}`));
    // external providers
    (cfg.external || []).forEach(([svc, type, ratio, label], i) => { const id = "x" + (i + 1); N(id, type, `name=${T(label)} ratio=${ratio} inst=?`); E(`${svc}>${id}`); });
    (cfg.hsm ? [cfg.hsm] : []).forEach((list) => { N("hsm", C.hsm, "name=Hardware_key_module ratio=0.03 inst=?"); list.forEach((id) => E(`${id}~hsm{0.05}`)); });
    (cfg.extras || []).forEach((x) => N(...(function (spec) { const i = spec.indexOf(":"), rest = spec.slice(i + 1), sp = rest.indexOf(" "); return [spec.slice(0, i), sp < 0 ? rest : rest.slice(0, sp), sp < 0 ? "" : rest.slice(sp + 1)]; })(x)));
    (cfg.extraEdges || []).forEach((x) => E(x));
    // pods run on the node pool
    if (hosted(C)) { cfg.services.forEach((s) => E(`np>${s.id}`)); E("np>gw"); }
    // pipeline, security, observability (tooling: dashed, no traffic)
    const tools = [["gr", "gitrepo"], ...C.pipeline, C.deploy, C.iac, C.secrets, C.mon, C.trace, C.alert, C.audit, C.threat, C.hub].filter(Boolean);
    tools.forEach(([id, type]) => { if (nodes.every((n) => !n.startsWith(id + ":"))) N(id, type); });
    const chain = ["gr", ...C.pipeline.map((x) => x[0]), C.deploy[0]].join(">"); E(chain);
    const target = hosted(C) ? "np" : "gw";
    E(`${C.deploy[0]}>${target}`); E(`${C.iac[0]}>${target}`); E(`${C.secrets[0]}>${target}`); E(`${C.mon[0]}>${target}`); E(`${C.trace[0]}>gw`); E(`${C.mon[0]}>${C.alert[0]}`);
    E(`${C.audit[0]}>${C.hub[0]}`); if (C.threat) E(`${C.threat[0]}>${C.hub[0]}`); E(`${C.hub[0]}>al`);
    return { cat: "End to end", name: cfg.name, notice: cfg.notice, scenario: cfg.scenario, slo: cfg.slo, nodes: nodes.join("; "), edges: edges.join(" "), blueprint: cfg.id };
  }

  function blueprint(cfg) {
    const C = CLOUD[cfg.cloud], id2 = {}; cfg.services.forEach((s) => { id2[s.id] = s; });
    const nm = (id) => (id2[id] ? id2[id].label : id);
    const dbLine = (s) => (s.db === "none" ? "No database of its own" : `${DBNAME[s.db]}${s.cache ? " with a cache in front" : ""}`);
    const byTopic = {}; cfg.events.forEach(([a, b, , topic, why]) => { (byTopic[topic] = byTopic[topic] || { topic, from: a, to: [], why }).to.push(b); });
    const pipeline = ["Developer pushes to Git", ...C.pipeline.map((x) => x[1]), C.deploy[1]];
    return {
      id: cfg.id, name: cfg.name, cloud: C.label, summary: cfg.summary, lld: cfg.lld,
      services: cfg.services.map((s) => ({ id: s.id, label: s.label, resp: s.resp, data: dbLine(s), patterns: s.patterns })),
      sync: cfg.calls.map(([a, b, , how, why]) => ({ from: nm(a), to: nm(b), fromId: a, toId: b, how, why })),
      async: Object.values(byTopic).map((t) => ({ topic: t.topic, from: nm(t.from), to: t.to.map(nm), why: t.why })),
      auth: [
        `Users sign in at the central auth server (${C.idpName}) using OAuth 2 / OpenID Connect and receive a short-lived JWT access token plus a refresh token.`,
        "Every request enters through the WAF and the API gateway, which validates the token signature, expiry and audience, then applies rate limits.",
        "The gateway forwards the token; each Java service verifies it again and checks roles and scopes itself (never trust a network position). Between services, mutual TLS plus the propagated identity are used.",
        "Service-to-service calls use short-lived service tokens; secrets come from " + C.secrets[1] + " at start-up, never from the code.",
      ],
      audit: [
        "Every service publishes an audit event for important actions (who, what, when, from where, outcome) to the event bus, in addition to its business events.",
        "An audit writer consumes all audit topics and appends them to the append-only audit store (object lock or hash chain), so no service can edit history.",
        `Cloud and platform actions are recorded by ${C.audit[1]}; ${C.threat ? C.threat[1] + " watches for threats; " : ""}${C.hub[1]} gathers findings for the security team.`,
        "Audit records never contain secrets or full card numbers; retention follows the compliance period.",
      ],
      patterns: (function () { const m = {}; cfg.services.forEach((s) => s.patterns.forEach((p) => { (m[p] = m[p] || []).push(s.label); })); return Object.keys(m).map((p) => ({ name: p, where: m[p] })); })(),
      security: ["Edge: CDN and WAF in front of a load balancer; TLS everywhere.", "Central authentication, per-service authorisation, least-privilege roles per service.", "Encryption at rest with managed keys" + (cfg.hsm ? " and a hardware security module for the most sensitive keys" : "") + ".", "Pipeline gates: code scan, dependency scan, image scan" + (C.pipeline.some((x) => x[0] === "cs") ? ", image signing" : "") + " before anything is deployed."],
      deploy: [`Runs on ${C.label}` + (C.pool ? ` (${C.poolName})` : " (Tomcat on servers behind HAProxy)") + ".", "Pipeline: " + pipeline.join(" → ") + ".", `Infrastructure as code with ${C.iac[1]}; secrets in ${C.secrets[1]}.`, "Canary releases for the services that carry the most risk; rollback by redeploying the previous artifact."],
      observability: [`Metrics with ${C.mon[1]}, traces with ${C.trace[1]}, central logs.`, `Alerts go to on-call through ${C.alert[1]}.`, "Golden signals per service: latency, traffic, errors, saturation."],
      tradeoffs: cfg.tradeoffs, talk: cfg.talk,
    };
  }

  const DESIGNS = P.map((cfg) => generate(cfg)), BLUEPRINTS = {};
  P.forEach((cfg) => { BLUEPRINTS[cfg.id] = blueprint(cfg); });
  return { PLATFORMS: P, DESIGNS, BLUEPRINTS, generate, blueprint, CLOUD };
});
