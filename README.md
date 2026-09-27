# Architecture Lab

A playable system design game. Static web app (no server, no accounts). Live: https://architecture-lab-one.vercel.app (Vercel free plan, project `architecture-lab`, deployed 2026-09-26 with `vercel deploy --prod` from this folder).

- `engine.js` deterministic capacity model. Teaching numbers, not benchmarks.
- `levels.js` ten levels. Each has a reference design that earns 3 stars; budgets are 25% above the cheapest passing design found by `tests/tune.js`.
- `app.js`, `style.css`, `index.html` mobile-first UI. Progress lives in the browser (localStorage).
- Studio mode (in app.js, with the same drawn canvas as the levels, saved per project): describe your own product and goals, calibrate every number with your own measurements (each marked teaching default / your estimate / measured), design, simulate, then export a Markdown design brief and a coding-agent prompt. Projects are saved in the browser.
- Game feel (from research/02-game-ideas.md): live playback of the simulated hour with speed control, a 100-point score in five dimensions with verdicts, badges (headroom, beat par, clean incident), par cost per level, best score, a how-to-play card, share links (`#s=`).
- Canvas (default view of the levels): draw the architecture Paperdraw-style (hand-drawn boxes, wires, animated traffic, busy % per box). `graph.js` holds the model and the wiring rules; the drawing is compiled into the same engine design, so scores and calibration are unchanged (`node tests/graph_check.js`: every reference design drawn on the canvas behaves exactly like the engine design). Wires that make no sense are refused with a reason; a box that is not wired from Client through App to Database does nothing and is flagged. The Buttons view still exists. Studio mode still uses buttons only.
- Sandbox (`sandbox.html`, `sandbox.js`, `sandbox.css`, `sim.js`, `presets.js`): the Paperdraw-style free canvas. 56 components, pan and zoom, drag from the palette, drag wires between any boxes, live simulation with speed, a traffic multiplier and failure buttons (DB down, cache flush, LB down, zone out, slow DB) that work while it runs, per-box busy %, a deterministic design review and chaos-readiness score, examples, undo, local-file export, shared YashAI-memory saves, share links, design brief and coding-agent prompt export. `sim.js` is a general graph engine; `node tests/sim_check.js` checks it against the calibrated level engine (all ten reference designs behave the same, within 30% at mid-run). Parallel and external calls count as load, latency and failures (conservatively, one after another).
- `manifest.webmanifest`, `sw.js`, icons: installable on iPhone (Safari, Share, Add to Home Screen) and works offline after the first visit.
- Tests: `node tests/check.js` (every level's reference design gets 3 stars, doing nothing does not, results are deterministic, over-building fails the budget).
- Re-tune after changing the engine: `node tests/tune.js`, then update `ref` and `budget` in levels.js.
- Redeploy: `vercel deploy --prod --yes` in this folder. Bump `CACHE` in sw.js so installed copies refresh.
- Direct local links: `sandbox.html` opens the free Architecture Canvas; `?studio=1` opens Product Studio directly.

Not built: multi-app-group simulation, sound, and a native App Store app (which needs an Apple developer account, $99/year, and a build service or Mac).

## Local-only features (Control Room copy at http://127.0.0.1:8765/architecture-lab/)
- Save to YashAI memory: each save is a new version under `learning/system-design/architecture-lab/projects/` with a note, a score summary and the design brief (`agents/architecture_lab_memory.py`).
- AI design review (`agents/architecture_lab_review.py`): the local Ollama model explains why the design misses its goals and what to change, using only the simulation's numbers (it does the instance arithmetic from the capacity figures and is told to ignore instructions hidden in the data). Offline tests: `python -m unittest test_architecture_lab` in `agents/`.
- AI Architect (`agents/architecture_lab_architect.py`): describe a product in the local Canvas and the local model produces a bounded, standard starter design with components, traffic assumptions, SLOs, risks and connections. The proposal is validated before it can be applied to the canvas.
- The public Vercel copy has neither, by design: a public page must not write to this PC.

## Resilience patterns (advanced)
Service and gateway boxes have Retries, Timeout, Circuit breaker and Fallback (Selected tab). The engine models retry amplification (each failed attempt adds load on the dependency), overload latency (queues build past 100% busy), timeouts (slower than the caller's timeout counts as failed) and breakers (open at more than 50% failed, probe at 10%, close after recovery). The "Retry storm lab" example and the 🔁 Burst button show a 5-tick burst turning into a lasting outage with retries alone, ending with a breaker, and staying mostly served with a fallback (`node tests/sim_check.js`). Not modelled yet: budgets for retries (token buckets), hedged requests, bulkheads, load shedding by priority.

## Multi-region (advanced)
Every box has a Region (US East, Europe, Asia; round trips 90 to 180 ms, teaching numbers). Calls between regions add the round trip; the diagram draws a band per region. Wires can carry Everything, Reads only, Writes only or Static only, and can be marked Failover only (a backup path used when the ordinary targets have failed a health check for 3 ticks). A database can be a Primary, a Read replica of another (lag = round trip plus a queueing penalty, optional auto-promote that loses the writes it had not received) or Active-active with another (conflicts grow with lag and hot keys). The bottom bar gets a "region down" button per region. Tests in `node tests/sim_check.js` cover latency, failover delay, promotion, data loss, N+1 capacity and conflicts. Not modelled yet: quorum and consistency modes, per-region autoscaling, cross-region traffic cost, split-brain.

## Product missions
Five real products (Support chatbot with RAG, Payments API, Job-listing scraper, Notification system, Video streaming) in the Sandbox's Missions tab. Each has a brief, goals, three hidden incidents (a traffic surge, a zone loss, a slow database, a slow provider or storage, a failed primary), acceptance criteria worth 100 points, hints and a cost budget. The incidents are only revealed after you run the mission test, which also reports availability and latency inside each incident window. Stars: 1 core goals, 2 all incidents survived, 3 also within budget. `missions.js` holds the data and `evaluate()`; `node tests/missions_check.js` checks that each starter design fails and each reference design scores 95+. The AI design review gets the mission and its failed criteria. Engine incident types added for this: `surge:<x>`, `node:<id>`, `slow:<id>`; queues now drain no faster than their consumers can take work.

## Consistency modes, partitions, Collapse Lab and leaderboard
- Databases have a Consistency setting: Eventual, Read-your-writes (readers who just wrote must read the primary, which limits read capacity), Quorum (R and W; R + W above the number of copies never returns stale data; needs enough copies alive) and Strong (leader reads, consensus, more latency). The group is the primary, its replicas and an optional peer in another region. A network **partition** (bottom bar) cuts every wire between regions: eventual databases stay available but stale, quorum and strong ones refuse to answer (the CAP trade-off).
- **Collapse tab** (`collapse.js`): a failure timeline builder with every failure the engine has (database primary, cache flush, load balancer, zone, slow databases, +60% burst, surge of any size, one component dying or slowing, a whole region, a partition), each with a start minute and duration. The result says Collapsed (below half for 2.5 minutes), Degraded or Survived, when it collapsed, whether and when it recovered (a design that never recovers has a metastable failure such as a retry storm), the worst-hit boxes, data lost on failover, stale reads and queue delay. "Find my weak points" tries every single failure the design can suffer plus the worst pairs, ranks them, and gives a Collapse resistance score.
- **Board tab** (`board.js`): personal best scores per mission and per design's collapse resistance, ranked by score then lower cost. Share codes (`ALB1:...`) let two people compare by pasting each other's scores. In the Control Room copy it is also saved to `learning/system-design/architecture-lab/leaderboard.json`.
- Tests: `node tests/sim_check.js`, `collapse_check.js`, `board_check.js`, and `python -m unittest test_architecture_lab` in `agents/`.

## Collapsible panels
Every component category (Clients, Traffic & edge, Compute, AI, Storage, Messaging, External, Observability) and every panel heading (Selected, Live, Traffic, Missions, Collapse, Board) folds open and closed. Expand all / Collapse all sit above the palette, searching opens the matching categories, and the choices are remembered in the browser.

## Component catalogue (303 parts)

The Sandbox palette holds the common building blocks of real systems, filterable by provider (All, AWS, Google Cloud, Azure, Kubernetes, Docker, DevOps, Open source, Basic):

- **AWS, Google Cloud, Azure**: compute, serverless, containers, load balancers, storage, databases, caches, messaging, AI, security, monitoring and pipelines.
- **Docker and Kubernetes**: containers, hosts, Deployments, StatefulSets, DaemonSets, Jobs, Services, Ingress, node pools, autoscaler (HPA), service meshes, Helm, Argo CD.
- **DevOps**: GitHub Actions, Jenkins, GitLab CI, Terraform, Ansible, Prometheus, Grafana, Datadog, PagerDuty, ELK, OpenTelemetry, Sentry, Vault, feature flags, scanners.
- **Open source software**: web frameworks, gateways, proxies, databases, search, vector stores, streaming, batch, storage, identity, networking, payments and more.

Select a box and use **Swap for another option** to replace it with the same job on another provider; wires and settings stay.

Kubernetes is modelled: wire a **node pool** to the deployments it runs. Pods only run if they fit on the nodes, the cluster autoscaler adds nodes with a delay, a zone outage removes nodes, and an HPA box wired to a deployment turns on pod autoscaling. Every service has a **release strategy** (rolling, blue-green, canary); the Collapse Lab can deploy a **bad release**, and monitoring (Prometheus, CloudWatch…) shortens how long it hurts. Findings show a DevOps readiness score. The numbers are teaching values, not vendor benchmarks. Checks: `node tests/catalog_check.js`.

## 118 examples and hover explanations

- **Examples menu** (top bar): 118 designs in 12 groups (Web, Social, Data, AI, AWS, Google Cloud, Azure, Docker and Kubernetes, DevOps, Reliability lessons, Real products, Classics), searchable. Each has a line saying what to notice. Designs marked "(fix me)" are puzzles that are broken on purpose. New examples live in `examples_more.js` as short text specs and are laid out automatically; `node tools/size_examples.js` re-sizes them so each meets its own goals.
- **Hover** any part in the palette or any box on the canvas for a plain-language explanation: what it is, when to use it, provider, and its teaching numbers. The text is in `catalog_docs.js` (every component has one).
- Checks: `node tests/examples_check.js` (all examples build, follow the wiring rules, run, meet their goals; every component is documented).

## Interview practice (Interview tab)

50 system design interview questions in four groups (classic problems, AI systems, cloud/DevOps/reliability), plus a 36-card cheat sheet of the concepts interviews ask about (caching, sharding, CAP, delivery guarantees, retries, SLOs, Kubernetes, deployments, patterns and back-of-envelope numbers).

Each question gives the interviewer's ask, requirements to confirm, a back-of-envelope table (requests per second, storage, bandwidth), hints, follow-up questions with model answers, and a strong reference design. **Check my design** scores what you drew out of 100: what a strong answer mentions (50), goals under load (30), and a failure test (20). Best scores are saved in this browser. Data and scoring: `interview.js`. Checks: `node tests/interview_check.js`.

### Class design (low-level design) questions

The Interview tab also has 20 low-level design questions (parking lot, elevator, vending machine, ATM, library, tic-tac-toe, chess, LRU cache, rate limiter, logger, expense sharing, movie booking, hotel booking, notifications, snakes and ladders, undo/redo editor, cab booking, file system, pub-sub, shopping cart). Each opens a dialog with requirements, a class diagram, working Java, the patterns to name, follow-ups and a "what interviewers look for" checklist. Files: `lld_a.js`, `lld_b.js`, `lld.js`. `node tests/lld_check.js` compiles and runs every Java solution (needs a JDK).

### Why this, and why not the others

Hover any component and, under its explanation, you see when to pick it, when to skip it, and the main alternatives with one line each. Select a box and open **Why this, and why not the others** for the full comparison with a Swap button per alternative. 53 decision tables cover all components (`catalog_alts.js`, `node tests/alts_check.js`).

## End to end: full platform architectures (HLD + LLD together)

- **10 full platform architectures** (Examples menu, group "End to end"): e-commerce (AWS), digital bank (Azure, zero trust), ride-hailing (Google Cloud), food delivery (Kubernetes), healthcare records (AWS, consent and audit), ticket booking (Google Cloud, flash sale), insurance claims (Azure), HR and payroll SaaS (AWS, multi-tenant), video streaming (Google Cloud) and logistics (own servers with Jenkins, Nexus, Ansible). Each has 7 to 9 Java services with their own data, a central auth server behind the API gateway, an event bus, an audit writer and append-only audit store, external providers, and the whole build, deploy, security and observability toolchain (40 to 47 boxes). Generated by `platforms.js`, sized by `node tools/size_platforms.js`.
- **Blueprint tab**: opens automatically with these examples. It explains the high-level design (each service and what it owns, direct calls and events, central sign-in, audit communication, patterns used and where, security, build and deploy, observability, trade-offs, how to present it) and opens the **low-level design** of the core service: class diagram and Java that compiles and runs (`lld_e.js`). Click "Show" on a service to find it on the board.
- Simpler focused examples remain: audit logging system, compliance-ready landing zone, DevSecOps pipeline. **Dashed wires are tooling** (pipelines, watching, auditing) and carry no traffic; faint wires are event-bus links.
- **27 new components** (`catalog_more2.js`): Tomcat, Spring Cloud Gateway, Eureka, config server, Git repository, Maven/Gradle, build server, deploy server, Harbor, Snyk, cosign, staging environment, audit log store, SIEM, Security Hub, Sentinel, Chronicle, GuardDuty, Defender, Security Command Center, AWS Config, Azure Policy, Organization Policy, cloud audit logs, Inspector, HSM. Each has hover help and a "why this and not the others" table.
- **Design patterns tab** (Interview tab): 27 patterns with a diagram and Java that compiles and runs: Singleton, Factory, Abstract Factory, Builder, Adapter, Decorator, Facade, Proxy, Strategy, Observer, Command, State, Template Method, Chain of Responsibility, Dependency Injection, Repository, Circuit Breaker, Retry with backoff, Saga, Outbox, Idempotent consumer, CQRS, Bulkhead, Audit trail (hash chain), RBAC, JWT filter, Strangler Fig.
- **4 more interview questions**: secure Java microservices platform, audit logging system, build and deploy platform, compliant cloud landing zone, plus cheat-sheet cards on audit logs, defence in depth, OWASP risks, the pipeline step by step and Java on the cloud.
- Findings now show "Delivery and security readiness" out of 9 (monitoring, autoscaling, safe releases, CI/CD, infrastructure as code, secrets, audit logging, security scanning, threat detection).

`node tests/blueprint_check.js` checks that each platform has 7+ Java services, central auth, an event bus, audit store, data per service, tooling, 8+ patterns and a linked class design.

## Every example is end to end

Every example in the Sandbox (the 9 Classics and the 121 examples, but not the "fix me" puzzles and not the 10 full platform architectures, which already are end-to-end) now gets central authentication, an audit bus and append-only audit store, monitoring with alerting, and the build/deploy pipeline wired on automatically (`LabExamples.endToEnd`, applied in `build()` and in the Classics wrapper in `sandbox.js`). The goals (p95 and budget) are adjusted to account for the extra hops and cost. The "New board" starter stays a true blank canvas.

End-to-end augmentation now reuses tooling a design already has (identity provider, audit store, monitoring, alerting, pipeline steps) instead of adding a duplicate, and gives the reused box enough extra capacity for the new load. `node tests/examples_check.js` checks no example ends up with two boxes doing the same job.
