/* Architecture Lab Sandbox: a free canvas for any architecture, with live traffic and failures. Runs entirely in the browser. */
(function () {
  "use strict";
  const S = window.LabSim, PRESETS = window.LabPresets.PRESETS;
  PRESETS.forEach((p) => {
    p.cat = p.cat || "Classics";
    if (p.id !== "start" && window.LabExamples) { const orig = p.build; p.coreBuild = orig; p.build = () => window.LabExamples.endToEnd(orig(), S.BY_ID); }
  });
  if (window.LabExamples) window.LabExamples.LIST.forEach((e, i) => PRESETS.push({ id: "x" + i, name: e.name, cat: e.cat, notice: e.notice, coreBuild: () => window.LabExamples.build(Object.assign({}, e, { noE2E: true }), S.BY_ID), build: () => Object.assign(window.LabExamples.build(e, S.BY_ID), e.blueprint ? { blueprint: e.blueprint } : {}) }));
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const query = new URLSearchParams(location.search), referenceMode = query.get("reference") === "1", practiceMode = query.get("practice") === "1", referenceExample = query.get("example") || "urlshort";
  const guideId = practiceMode ? query.get("guide") || "" : "";
  // Skill level is shared by Mentor, Learn and Real Play (same origin, one localStorage key).
  const LEVELS = [["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]];
  let skill = ""; try { skill = query.get("level") || localStorage.getItem("yashai.level") || ""; } catch (e) { skill = query.get("level") || ""; }
  if (!LEVELS.some(([k]) => k === skill)) skill = "";
  const NW = 132, NH = 66, KEY = practiceMode ? "archlab.practice.v2" : "archlab.sandbox.v1";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Math.round(n).toLocaleString("en-US"), money = (n) => "$" + num(n);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const uid = () => "n" + Math.random().toString(36).slice(2, 8);

  // ---------------------------------------------------------------- document
  let doc = null, view = { x: 40, y: 20, z: 1 }, sel = { node: null, edge: null }, tool = "select", linkFrom = null, rubber = null, drag = null, panning = null, spaceDown = false, hoverNodeId = "", deepPart = "";
  let hist = [], histAt = -1, sim = null, timer = null, running = false, speed = 1, mult = 1, chaos = {}, down = {}, lastRec = null, toast = "", chaosCache = null;
  let tab = query.get("tab") || "parts";
  const C = window.LabCost;   // budget & cost plan (cost.js)
  const STU = window.LabStudio, SCN = window.LabScenarios, EXP = window.LabExports;
  // multi = extra selected boxes (shift-click / shift-drag); highlight = a scenario's path shown on the canvas
  let multi = new Set(), marquee = null, highlight = new Set(), viewMode = "arch", playScript = null;
  try { viewMode = localStorage.getItem("archlab.view") || "arch"; } catch (e) { /* ignore */ }
  let costOpts = { trafficMult: 1, provider: "aws", priority: "balanced", uptime: 99.9, users: 0, envs: { dev: true, staging: true } }, costSeededFrom = "";
  let costTimer = null, costLast = null, costDelta = 0;
  if (!["parts", "inspect", "architect", "delivery", "live", "scenario", "missions", "interview", "blueprint", "collapse", "board"].includes(tab)) tab = "parts";
  // AI Driven is a three-column workspace: decisions, canvas, component design.
  // Keep that layout while users select and inspect components.
  const aiWorkspace = tab === "architect";
  // ---------------------------------------------------------------- AI-Driven levels: one real board, reused
  // Level 1/2/3 are not separate diagrams — they are the SAME board (drag, connect, undo, simulate,
  // chaos, all of it), just loaded with a different document. Drilling into a box swaps in a small
  // generated document for that box's internals; the L1/L2/L3 toolbar buttons are breadcrumbs back.
  let levelPath = [{ level: 1, key: "1", node: null }];
  const levelCache = new Map();
  function gbuild() { const g = { nodes: [], edges: [] }; return { g, n(id, type, x, y, props) { g.nodes.push({ id, type, x, y, props: props || {} }); return id; }, e(a, b, extra) { g.edges.push(Object.assign({ from: a, to: b }, extra || {})); } }; }
  const TYPE_KEYWORDS = [[/gateway|bff|route/i, "apigw"], [/frontend|browser|screen|ui\b/i, "browser"], [/waf|limit|protect/i, "waf"], [/controller|api\b/i, "apigw"], [/oidc|rbac|auth|identity/i, "auth"], [/domain|tx|transaction|business/i, "java"], [/postgres|database|db\b|primary|replica|table/i, "postgres"], [/audit/i, "logs"], [/outbox/i, "queue"], [/kafka|topic/i, "kafka"], [/queue|event/i, "queue"], [/trace|log|metric|observe/i, "tracing"], [/worker|consumer/i, "worker"], [/backup|recovery|restore/i, "object"], [/dead letter/i, "sqs"]];
  const typeForLabel = (label) => (TYPE_KEYWORDS.find(([re]) => re.test(label)) || [, "app"])[1];
  function chainDoc(name, steps) {
    const b = gbuild(); let prev = null; const perRow = 4, colW = 210, rowH = 180;
    steps.forEach(([title, sub], i) => {
      const id = "n" + i, row = Math.floor(i / perRow);
      let col = i % perRow;
      if (row % 2 === 1) col = perRow - 1 - col; // snake layout: wrapped rows connect with a short drop, not a long diagonal
      b.n(id, typeForLabel(title + " " + (sub || "")), 80 + col * colW, 200 + row * rowH, { name: title });
      if (prev) b.e(prev, id); prev = id;
    });
    return { name, nodes: b.g.nodes, edges: b.g.edges, scenario: Object.assign({}, S.DEFAULT_SCENARIO), slo: { p95: 200, avail: 99.5, budget: 5000 } };
  }
  function levelTwoSteps(n) {
    const d = S.BY_ID[n.type], p = n.props;
    if (d.cls === "service") {
      const stack = n.type === "java" ? "Java / Spring Boot" : n.type === "node" ? "Node.js service" : n.type === "python" ? "Python service" : n.type === "go" ? "Go service" : "Application service";
      return [["Frontend / BFF", "HTTPS request"], ["Controller", "JWT + validation"], [stack, "domain API"], ["Domain + Tx", "business rules"], ["OIDC / RBAC", "authorize"], ["Postgres", "owned data"], ["Audit log", "who changed what"], ["Outbox", "same DB tx"], ["Kafka", "domain events"]];
    }
    if (["router", "proxy"].includes(d.cls)) return [["Frontend", "HTTPS"], ["WAF + limit", "protect"], ["Gateway / BFF", "route + compose"], ["OIDC", "JWT / RBAC"], ["Trace + logs", "observe"]];
    if (d.cls === "db") return [["Java service", "repository"], ["Primary DB", "writes"], ["Read replica", "queries"], ["Backup + restore", "recovery"], ["Audit + metrics", "observe"]];
    if (d.cls === "queue") return [["Java service", "outbox event"], [p.name || d.name, "durable topic"], ["Worker service", "idempotent"], ["Dead letter queue", "manual recovery"]];
    return [["Upstream", "request / event"], [p.name || d.name, d.name], ["Downstream", "data / event"], ["Logs + metrics", "observe"]];
  }
  const L3_STEPS = {
    apigw: ["REST controller", [["HTTP route", "POST /api/resources"], ["Request DTO", "validated fields"], ["Validate + authorize", "@Valid · RBAC policy"], ["Use case", "command handler"], ["Response", "201 · resource id"]]],
    java: ["Domain transaction", [["Command handler", "business command"], ["Aggregate", "domain rules"], ["Repository", "load + lock"], ["Commit", "state write"], ["Outbox row", "event recorded"]]],
    postgres: ["PostgreSQL data model", [["Primary table", "id · owner · status"], ["Related table", "history / children"], ["Index", "lookup keys"], ["Migration", "versioned + reversible"], ["Recovery", "backup + restore drill"]]],
    browser: ["Frontend-to-service flow", [["Screen", "search / detail / history"], ["UI state", "form + optimistic state"], ["API client", "typed request contract"], ["Gateway", "JWT + route policy"], ["Service API", "command / query"]]],
    auth: ["Identity and authorization", [["Bearer token", "OIDC issuer"], ["JWT verify", "signature + expiry"], ["Identity", "subject + tenant"], ["Policy", "role + ownership"], ["Decision", "allow / deny + audit"]]],
    queue: ["Transactional outbox", [["Business write", "domain state"], ["Outbox insert", "event + payload"], ["Atomic commit", "one DB transaction"], ["Publisher", "poll + publish"], ["Mark delivered", "retry-safe state"]]],
    kafka: ["Event delivery pipeline", [["Event schema", "version + event id"], ["Topic / partition", "aggregate-id key"], ["Consumer", "idempotency key"], ["Retry policy", "bounded backoff"], ["DLQ", "operator recovery"]]],
    logs: ["Audit and observability", [["Request context", "trace + request id"], ["Audit event", "actor + action + target"], ["Structured log", "safe diagnostic fields"], ["Metrics", "latency + errors"], ["Alert", "SLO breach route"]]],
    waf: ["Entry boundary", [["Rule set", "OWASP + rate policy"], ["Rate limit", "per-key budget"], ["Block / allow", "decision + reason"], ["Log", "blocked request record"]]],
  };
  L3_STEPS.node = L3_STEPS.python = L3_STEPS.go = L3_STEPS.java; L3_STEPS.sql = L3_STEPS.mysql = L3_STEPS.mongo = L3_STEPS.postgres; L3_STEPS.tracing = L3_STEPS.metrics = L3_STEPS.logs; L3_STEPS.sqs = L3_STEPS.rabbit = L3_STEPS.queue;
  function levelThreeSteps(n) { return L3_STEPS[n.type] || ["Implementation", [["Input", "request or event"], ["Validate", "contract + policy"], ["Execute", "owned responsibility"], ["Persist", "state or event"], ["Observe", "trace + metrics"]]]; }
  function captureBoardState() { return { doc, view: Object.assign({}, view), sel: Object.assign({}, sel), hist: hist.slice(), histAt, chaos: Object.assign({}, chaos), down: Object.assign({}, down), mult, speed, tool }; }
  function restoreBoardState(s) {
    doc = s.doc; view = Object.assign({}, s.view); sel = Object.assign({}, s.sel); hist = s.hist.slice(); histAt = s.histAt; chaos = Object.assign({}, s.chaos); down = Object.assign({}, s.down); mult = s.mult; speed = s.speed; tool = s.tool;
    sim = null; running = false; clearInterval(timer); lastRec = null; chaosCache = null;
  }
  function currentPathKey() { return levelPath[levelPath.length - 1].key; }
  function updateLevelControls() {
    const controls = $("#levelControls"); if (controls) controls.hidden = false;
    const depth = levelPath[levelPath.length - 1].level;
    $$('[data-level-focus]').forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.levelFocus) === depth)));
    $$('[data-level-toggle]').forEach((b) => { const lv = Number(b.dataset.levelToggle); b.setAttribute("aria-pressed", String(lv === depth)); b.disabled = lv > levelPath.length; });
  }
  // Read-only thumbnail of a cached level's document — just boxes and wires, no interaction.
  function previewSvg(d) {
    if (!d || !d.nodes || !d.nodes.length) return "";
    const xs = d.nodes.map((n) => n.x), ys = d.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - NW, maxX = Math.max(...xs) + NW, minY = Math.min(...ys) - NH * 1.6, maxY = Math.max(...ys) + NH * 1.6;
    const boxes = d.nodes.map((n) => {
      const def = S.BY_ID[n.type] || { icon: "📦", name: n.type };
      return `<g transform="translate(${n.x - NW / 2} ${n.y - NH / 2})"><rect width="${NW}" height="${NH}" rx="10" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/><text x="10" y="27" font-size="20">${def.icon}</text><text x="40" y="25" font-size="13" font-weight="700" fill="var(--ink)" font-family="-apple-system,Segoe UI,sans-serif">${esc((n.props && n.props.name) || def.name)}</text></g>`;
    }).join("");
    const wires = d.edges.map((e) => {
      const a = d.nodes.find((x) => x.id === e.from), b = d.nodes.find((x) => x.id === e.to);
      if (!a || !b) return "";
      return `<path d="M${a.x + NW / 2} ${a.y} L${b.x - NW / 2} ${b.y}" stroke="var(--ink)" stroke-width="2" fill="none" opacity=".65" marker-end="url(#pvArrow)"/>`;
    }).join("");
    return `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" style="width:100%;height:100%;display:block"><defs><marker id="pvArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--ink)"/></marker></defs>${wires}${boxes}</svg>`;
  }
  // One spacious playground: every drill level uses the same full canvas. The breadcrumb
  // identifies the current depth; Level 2 and 3 open only when a component is selected.
  function renderStaircase() {
    if (!aiWorkspace) return;
    const stage = $("#stage"), side = $("#side"), third = $("#thirdSide");
    if (!stage || !side || !third) return;
    const current = levelPath[levelPath.length - 1].level;
    const panelTitles = { 1: "System canvas", 2: "Service internals", 3: "Implementation detail" };
    stage.style.order = ""; stage.className = "level-main"; stage.dataset.level = current; stage.dataset.levelTitle = panelTitles[current] + (current === 1 ? " · double-click a box to open it" : "");
    side.hidden = true; third.hidden = true;
    side.className = ""; third.className = "";
    delete side.dataset.jumpLevel; delete third.dataset.jumpLevel;
  }
  function activateLevel(index) {
    if (!aiWorkspace || index < 0 || index > 2) return;
    const target = index + 1, hit = doc.nodes.find((n) => Number(n.props.__aiLevel || 1) === target);
    if (!hit) { say(`Open a component to create the Level ${target} branch on this canvas.`); return; }
    sel = { node: hit.id, edge: null }; const r = $("#board").getBoundingClientRect(); view.x = r.width / 2 - hit.x * view.z; view.y = r.height / 2 - hit.y * view.z; updateLevelControls(); render();
  }
  function resetToLevel1() {
    if (!aiWorkspace) return;
    const base = levelCache.get("1");
    if (!base) return;
    restoreBoardState(Object.assign({}, base, { doc: JSON.parse(JSON.stringify(base.doc)) }));
    levelPath = [{ level: 1, key: "1", node: null }]; levelCache.clear();
    updUndo(); paintButtons(); paintChaos(); kpis(); render(); fitView(); updateLevelControls(); renderStaircase();
  }
  function drillInto(n) {
    if (!aiWorkspace || !n) return;
    const sourceLevel = Number(n.props.__aiLevel || 1);
    if (sourceLevel >= 3) { say("This is Level 3. Its implementation flow is already on the canvas."); return; }
    const nextLevel = sourceLevel + 1;
    if (!levelCache.has("1")) levelCache.set("1", Object.assign(captureBoardState(), { doc: JSON.parse(JSON.stringify(doc)) }));
    const removeFrom = sourceLevel === 1 ? 2 : 3;
    const removed = new Set(doc.nodes.filter((x) => Number(x.props.__aiLevel || 1) >= removeFrom).map((x) => x.id));
    if (removed.size) { doc.nodes = doc.nodes.filter((x) => !removed.has(x.id)); doc.edges = doc.edges.filter((e) => !removed.has(e.from) && !removed.has(e.to)); }
    const steps = nextLevel === 2 ? levelTwoSteps(n) : levelThreeSteps(n)[1];
    // Anchor near the clicked node, not the rightmost node on the whole board -- with several sibling
    // branches already on the canvas, "rightmost of everything" put the new chain far past the node
    // actually being drilled into, forcing its connecting wire to cross straight through unrelated
    // siblings sitting in between (looked like a wrong connection, wasn't one). But "near" on its own
    // then overlapped whatever already occupied that same patch of canvas -- so clear a path first:
    // scan existing nodes whose vertical span the new chain would pass through, and if any sit to the
    // right of the preferred spot, start past the furthest one instead of on top of it. The wire gets
    // longer when the canvas is crowded, but it goes around real content instead of through it.
    const cols = 4, gapX = 190, gapY = 132, startY = n.y - 70;
    const rows = Math.ceil(steps.length / cols);
    const bandTop = Math.min(n.y, startY) - NH / 2 - 20, bandBottom = startY + (rows - 1) * gapY + NH / 2 + 20;
    const blockers = doc.nodes.filter((x) => x.id !== n.id && x.y + NH / 2 >= bandTop && x.y - NH / 2 <= bandBottom && x.x > n.x);
    const clearX = blockers.length ? Math.max(...blockers.map((x) => x.x + NW / 2)) + 110 : 0;
    // A longer gap here (was 260) gives the level link room to read as its own deliberate jump from
    // one level to the next, not just a tightly-packed continuation of the same row.
    const startX = Math.max(n.x + 460, clearX);
    let previous = n.id;
    steps.forEach(([title, sub], i) => {
      const id = `ai-${nextLevel}-${uid()}`, row = Math.floor(i / cols), col = i % cols;
      doc.nodes.push({ id, type: typeForLabel(title + " " + (sub || "")), x: Math.round(startX + col * gapX), y: Math.round(startY + row * gapY), props: { name: title, __aiLevel: nextLevel, __aiParent: n.id, __aiGenerated: true } });
      doc.edges.push({ from: previous, to: id, aiDrill: true }); previous = id;
    });
    levelPath = [{ level: 1, key: "1", node: null }, ...(nextLevel === 3 ? [{ level: 2, key: `inline:${n.props.__aiParent || "service"}`, node: null }] : []), { level: nextLevel, key: `inline:${n.id}`, node: n }];
    sel = { node: n.id, edge: null }; commit(false); fitView(); updateLevelControls(); renderStaircase();
    say(`Level ${nextLevel} branch is shown to the right on this same canvas.`);
  }

  function fresh(p) { const d = JSON.parse(JSON.stringify(p.build())); d.slo = d.slo || { p95: 200, avail: 99.5, budget: 5000 }; d.scenario = Object.assign({}, S.DEFAULT_SCENARIO, d.scenario || {}); return d; }
  function practiceStarter() {
    const d = fresh(PRESETS.find((p) => p.id === "start"));
    d.name = "Your practice design";
    d.nodes = [];
    d.edges = [];
    return d;
  }
  function loadDoc() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.nodes && d.edges) { d.scenario = Object.assign({}, S.DEFAULT_SCENARIO, d.scenario || {}); d.slo = d.slo || { p95: 200, avail: 99.5, budget: 5000 }; return d; } } catch (e) { /* ignore */ } return null; }
  function persist() { if (referenceMode) return; try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) { /* ignore */ } }
  function snapshot() { hist = hist.slice(0, histAt + 1); hist.push(JSON.stringify(doc)); if (hist.length > 60) hist.shift(); histAt = hist.length - 1; updUndo(); }
  function commit(rebuild) { chaosCache = null; persist(); snapshot(); if (rebuild !== false) rebuildSim(); render(); scheduleCost(); }
  function undo(d) { const i = histAt + d; if (i < 0 || i >= hist.length) return; histAt = i; doc = JSON.parse(hist[i]); chaosCache = null; sel = { node: null, edge: null }; multi.clear(); highlight.clear(); persist(); rebuildSim(); render(); updUndo(); scheduleCost(); }
  function updUndo() { $("#undo").disabled = histAt <= 0; $("#redo").disabled = histAt >= hist.length - 1; }
  const node = (id) => doc.nodes.find((n) => n.id === id);
  const graphForSim = () => ({ nodes: doc.nodes.map((n) => ({ id: n.id, type: n.type, props: Object.assign({}, n.props, { name: n.props.name || S.BY_ID[n.type].name }) })), edges: doc.edges });

  // ---------------------------------------------------------------- simulation control
  function rebuildSim() {
    if (!sim) return; const t = sim.t;
    const s2 = S.createSim(graphForSim(), doc.scenario); if (s2.error) { sim = null; running = false; clearInterval(timer); paintButtons(); showBanner(s2.error, "bad"); return; }
    s2.t = t; sim = s2; lastRec = null;
  }
  function start() {
    if (!sim) { const s = S.createSim(graphForSim(), doc.scenario); if (s.error) { showBanner(s.error, "bad"); return; } sim = s; lastRec = null; }
    running = !running; clearInterval(timer); if (running) timer = setInterval(tick, Math.round(300 / speed)); paintButtons();
    if (running) noteGuide("ran");
  }
  function stop() { running = false; clearInterval(timer); sim = null; lastRec = null; chaos = {}; down = {}; playScript = null; showBanner(""); paintButtons(); render(); kpis(); }
  function tick() {
    if (playScript) {
      const on = sim.t >= playScript.from && sim.t < playScript.to;
      playScript.keys.forEach((k) => { chaos[k] = on; }); paintChaos();
      if (sim.t >= playScript.end) { playScript = null; running = false; clearInterval(timer); paintButtons(); showBanner("Scenario finished: the fault was injected and removed. ▶ continues normal traffic, ■ resets.", "warn"); return; }
    }
    const rec = S.step(sim, { trafficMult: mult, chaos, down }); lastRec = rec; render(true); kpis();
    if (sim.t % 4 === 0) paintGuide();
    const over = Object.entries(rec.nodes).filter(([id, v]) => doc.nodes.find((n) => n.id === id) && S.BY_ID[node(id).type].cls !== "source" && v.util > 1).sort((a, b) => b[1].util - a[1].util)[0];
    if (over) showBanner(over[1].down ? `${node(over[0]).props.name || S.BY_ID[node(over[0]).type].name} is down. Requests that need it fail until it recovers.` : `${node(over[0]).props.name || S.BY_ID[node(over[0]).type].name} is over capacity (${Math.round(over[1].util * 100)}%). Requests are being dropped.`, "bad");
    else if (Object.values(chaos).some(Boolean) || Object.values(down).some(Boolean)) showBanner(playScript ? `${playScript.name}: fault active (${Math.max(0, Math.round((playScript.to - sim.t) * S.TICK_S / 60))} simulated min left).` : "A failure is being injected.", "warn");
    else if (playScript && sim.t < playScript.from) showBanner(`${playScript.name}: normal traffic, the fault starts in ${Math.round((playScript.from - sim.t) * S.TICK_S / 60)} simulated min.`, "warn");
    else if (playScript) showBanner(`${playScript.name}: fault removed, watching recovery.`, "warn");
    else showBanner("");
  }
  function paintButtons() { $("#play").textContent = running ? "⏸ Pause" : sim ? "▶ Resume" : "▶ Start"; }
  function showBanner(t, kind) { const b = $("#banner"); b.hidden = !t; b.textContent = t || ""; b.className = "banner " + (kind || ""); }

  // ---------------------------------------------------------------- board rendering
  const worldPt = (e) => { const r = $("#board").getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z }; };
  // Straight orthogonal routing (right-angle elbow, lightly rounded at the corner) instead of a wide
  // bezier S-curve -- the curve looked clean with one wire on screen but turned into a tangle of
  // overlapping wobbly lines once a real design had a dozen of them crossing at different heights.
  function edgePath(a, b) {
    const dyAB = b.y - a.y;
    if (b.x - NW / 2 < a.x + NW / 2 + 20 && Math.abs(dyAB) > NH) {   // target is on another row and not to the right: leave from the bottom (or top) instead of looping around
      const s = dyAB > 0 ? 1 : -1, X1 = a.x, Y1 = a.y + s * NH / 2, X2 = b.x, Y2 = b.y - s * NH / 2;
      if (Math.abs(X1 - X2) < 1) return `M${X1} ${Y1} L${X2} ${Y2}`;
      const midY = (Y1 + Y2) / 2, dx = X2 > X1 ? 1 : -1, r = Math.max(0, Math.min(10, Math.abs(X2 - X1) / 2, Math.abs(midY - Y1)));
      return `M${X1} ${Y1} L${X1} ${midY - r * s} Q${X1} ${midY} ${X1 + r * dx} ${midY} L${X2 - r * dx} ${midY} Q${X2} ${midY} ${X2} ${midY + r * s} L${X2} ${Y2}`;
    }
    const x1 = a.x + NW / 2, y1 = a.y, x2 = b.x - NW / 2, y2 = b.y;
    if (Math.abs(y1 - y2) < 1) return `M${x1} ${y1} L${x2} ${y2}`;
    const midX = x1 + Math.max(24, (x2 - x1) / 2);
    const r = Math.max(0, Math.min(10, Math.abs(y2 - y1) / 2, Math.abs(midX - x1), Math.abs(x2 - midX)));
    const dirY = y2 > y1 ? 1 : -1;
    return `M${x1} ${y1} L${midX - r} ${y1} Q${midX} ${y1} ${midX} ${y1 + r * dirY} L${midX} ${y2 - r * dirY} Q${midX} ${y2} ${midX + r} ${y2} L${x2} ${y2}`;
  }
  // Level links get their own route instead of sharing the standard elbow path: the standard one
  // picks a midpoint between the two nodes and turns there, which can land right between two
  // unrelated components if anything else happens to sit in that gap. This one drops straight down
  // to a lane below every node currently on the board, travels the lane, then rises into the target
  // -- guaranteed clear of the whole diagram instead of threading through whatever's in the middle.
  function branchEdgePath(a, b) {
    const x1 = a.x + NW / 2, y1 = a.y, x2 = b.x - NW / 2, y2 = b.y;
    const laneY = Math.max(...doc.nodes.map((n) => n.y)) + NH / 2 + 60;
    if (Math.abs(y1 - laneY) < 1 && Math.abs(y2 - laneY) < 1) return `M${x1} ${y1} L${x2} ${y2}`;
    const r = 14;
    // Turn back up to the target's row with room to spare before reaching it (was turning right at
    // the target's own x, arriving from straight below -- the arrowhead pointed up into the bottom
    // of the box instead of in from the side like every other wire, and there was no visible gap
    // between the two levels since the rise happened right at the box edge). Rising earlier leaves a
    // deliberate horizontal run approaching the target, so the arrow turns and points right like the
    // rest of the diagram, with real space between the level-2 row and the level-3 box it leads into.
    const riseX = Math.max(x1 + 40, x2 - 90);
    const dir = y2 < laneY ? -1 : 1;
    return `M${x1} ${y1} L${x1} ${laneY - r} Q${x1} ${laneY} ${x1 + r} ${laneY} L${riseX - r} ${laneY} Q${riseX} ${laneY} ${riseX} ${laneY + r * dir} L${riseX} ${y2 - r * dir} Q${riseX} ${y2} ${riseX + r} ${y2} L${x2} ${y2}`;
  }
  function connected() {
    const out = {}; doc.nodes.forEach((n) => { out[n.id] = []; }); doc.edges.forEach((e) => { if (out[e.from]) out[e.from].push(e.to); });
    const seen = new Set(); const q = doc.nodes.filter((n) => S.BY_ID[n.type].cls === "source").map((n) => n.id); q.forEach((x) => seen.add(x));
    while (q.length) { const x = q.pop(); (out[x] || []).forEach((y) => { if (!seen.has(y)) { seen.add(y); q.push(y); } }); } return seen;
  }
  // ---- regions
  const DEFAULT_REGIONS = [{ id: "us", name: "US East" }, { id: "eu", name: "Europe" }, { id: "ap", name: "Asia" }];
  const regionList = () => (doc.regions && doc.regions.length ? doc.regions : DEFAULT_REGIONS);
  const regionName = (id) => { const r = regionList().find((x) => x.id === id); return r ? r.name : id; };
  const REGION_COLORS = ["#6d3fd0", "#157a3d", "#c2410c", "#0e7490", "#a21caf"];
  const regionColor = (id) => REGION_COLORS[Math.max(0, regionList().findIndex((x) => x.id === id)) % REGION_COLORS.length];
  const usedRegions = () => [...new Set(doc.nodes.map((n) => n.props.region).filter(Boolean))];
  let regionSig = "";
  function paintRegionChaos() {
    const used = usedRegions(), sig = used.join(",");
    if (sig !== regionSig) { regionSig = sig; $("#regionChaos").innerHTML = used.length >= 2 ? used.map((id) => `<button data-chaos="region:${esc(id)}" title="Every box in ${esc(regionName(id))} fails">🌍 ${esc(id.toUpperCase())} down</button>`).join("") : ""; }
    paintChaos();
  }
  const subLabel = (n) => subLabelBase(n) + (n.props.region ? ` · ${String(n.props.region).toUpperCase()}` : "");
  function subLabelBase(n) {
    const p = n.props, c = S.BY_ID[n.type].cls;
    if (c === "db") return `${p.shards || 1} shard${(p.shards || 1) > 1 ? "s" : ""} · ${p.replicas || 0} repl${p.ha ? " · HA" : ""}${p.mode === "replica" ? " · replica" : p.mode === "active" ? " · active" : ""}`;
    if (c === "cache") return `× ${p.inst || 1} · hit ${Math.round((p.hit == null ? 0.8 : p.hit) * 100)}%`;
    if (c === "queue") return `${p.workers || 1} workers`; if (c === "limiter") return `${num(p.limit || S.BY_ID[n.type].cap)} req/s`;
    if (c === "pool") return `${p.nodes || 1} nodes${p.auto ? " auto" : ""}${p.multiAz ? " · 3 zones" : ""}`;
    if (c === "source") return "traffic"; if (c === "external") return `${Math.round((p.ratio == null ? 0.1 : p.ratio) * 100)}% of calls`; if (c === "passive") return "watching";
    return `× ${p.inst || 1}${p.auto ? " auto" : ""}${p.ha ? " · HA" : ""}${p.retries > 0 ? ` · ↻${p.retries}` : ""}${p.breaker ? " · ⛔cb" : ""}`;
  }
  // ---- views: the same canvas seen through one concern (layers, trust zones, data, deployment, CI/CD, cost)
  const VIEWS = [["arch", "Architecture (HLD)"], ["layers", "Layers"], ["security", "Security & trust boundaries"], ["dataflow", "Data flow"], ["data", "Data model"], ["deploy", "Deployment"], ["cicd", "CI/CD"], ["cost", "Cost"]];
  let viewCostKey = null, viewCostRows = {};
  function viewInfo() {
    if (viewMode === "arch" || !STU) return null;
    const D = (n) => S.BY_ID[n.type], Lr = (n) => STU.layerOf(D(n)), Z = (n) => STU.zoneOf(D(n));
    const v = { dim: () => false, badge: () => "", group: null, hot: () => false, color: null };
    if (viewMode === "layers") { v.group = Lr; v.color = (k) => STU.LAYER_COLORS[k] || "#888"; }
    else if (viewMode === "security") {
      v.group = Z; v.color = (k) => ({ Public: "#b91c1c", "Edge (DMZ)": "#c2410c", "Private application": "#6d3fd0", Data: "#b45309", "Management plane": "#475569", "Third party": "#9a3412" }[k] || "#888");
      const f = lintNow(), hot = new Set(); if (f) f.findings.filter((x) => ["security", "ai", "compliance"].includes(x.cat) && ["critical", "high"].includes(x.sev)).forEach((x) => x.nodes.forEach((id) => hot.add(id)));
      v.hot = (n) => hot.has(n.id); v.badge = (n) => (hot.has(n.id) ? "⚠ security finding" : "");
    } else if (viewMode === "dataflow") v.dim = (n) => ["passive", "pool"].includes(D(n).cls) || ["DevOps", "Observability"].includes(Lr(n));
    else if (viewMode === "cicd") v.dim = (n) => Lr(n) !== "DevOps";
    else if (viewMode === "data") {
      const keep = new Set(doc.nodes.filter((n) => Lr(n) === "Data" || D(n).cls === "queue").map((n) => n.id));
      doc.edges.forEach((e) => { const a = node(e.from); if (a && keep.has(e.to) && D(a).cls === "service") keep.add(e.from); });
      v.dim = (n) => !keep.has(n.id);
      v.badge = (n) => { if (!["db", "store"].includes(D(n).cls)) return ""; const w = [...new Set(doc.edges.filter((e) => e.to === n.id && node(e.from) && D(node(e.from)).cls === "service").map((e) => e.from))]; return w.length > 1 ? `shared by ${w.length} services` : w.length ? `owner: ${(node(w[0]).props.name || D(node(w[0])).name).slice(0, 18)}` : "no owner"; };
      v.hot = (n) => / shared/.test(v.badge(n));
    } else if (viewMode === "deploy") v.badge = (n) => { const p = n.props, c = D(n).cls; if (["source", "passive"].includes(c)) return ""; return [p.region ? String(p.region).toUpperCase() : "", c === "db" ? (p.ha ? "multi-AZ" : "single AZ") : ["service", "proxy", "router"].includes(c) ? `×${p.inst || 1}${p.auto ? " auto" : ""}${p.ha ? " HA" : ""}` : "", p.deploy && p.deploy !== "rolling" ? p.deploy : ""].filter(Boolean).join(" · "); };
    else if (viewMode === "cost" && C) {
      const key = hist[histAt] + "|" + costOpts.trafficMult;
      if (key !== viewCostKey) { viewCostKey = key; try { const r = C.sizeAndPrice(graphForSim(), doc.scenario, (+doc.scenario.base || 1000) * costOpts.trafficMult, "asis", false); viewCostRows = (r && r.rows) || {}; } catch (e) { viewCostRows = {}; } }
      const tot = Object.values(viewCostRows).reduce((a, r) => a + (r.cost || 0), 0) || 1;
      v.badge = (n) => (viewCostRows[n.id] && viewCostRows[n.id].cost ? `${money(viewCostRows[n.id].cost)}/mo · ${Math.round(100 * viewCostRows[n.id].cost / tot)}%` : "");
      v.hot = (n) => viewCostRows[n.id] && viewCostRows[n.id].cost / tot > 0.15;
    }
    return v;
  }
  function bandSvg(ns, label, col, opts) {
    if (!ns.length) return "";
    const pad = (opts && opts.pad) || 24, x0 = Math.min(...ns.map((n) => n.x)) - NW / 2 - pad, x1 = Math.max(...ns.map((n) => n.x)) + NW / 2 + pad, y0 = Math.min(...ns.map((n) => n.y)) - NH / 2 - pad - 10, y1 = Math.max(...ns.map((n) => n.y)) + NH / 2 + pad;
    return `<g class="band ${(opts && opts.cls) || ""}"${opts && opts.group ? ` data-group="${esc(opts.group)}"` : ""}><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="20" fill="${col}" opacity="${(opts && opts.op) || 0.06}" stroke="${col}" stroke-opacity=".55" stroke-dasharray="8 6"/><text x="${x0 + 12}" y="${y0 + 18}" font-size="13" font-weight="700" fill="${col}">${esc(label)}</text></g>`;
  }
  function render(light) {
    const board = $("#board"), live = connected(), rec = lastRec, nu = (id) => (rec && rec.nodes[id]) || null, vi = viewInfo();
    // With a dozen+ crossing wires on a busy board, picking out "which wire is THIS box's" by eye
    // alone doesn't work -- so the node currently under the mouse (or selected) gets its own wires
    // pulled forward (thicker, solid, full opacity, drawn last so they sit on top of the crossing),
    // and every other wire fades back instead of competing with it for attention.
    const focusNode = hoverNodeId || sel.node;
    const edgeList = doc.edges.map((e) => {
      const A = node(e.from), B = node(e.to); if (!A || !B) return null;
      const fl = rec && rec.edgeFlow && rec.edgeFlow[e.from + "|" + e.to], uB = nu(e.to), hot = uB && uB.util > 1, on = running && (fl > 0.01);
      // Only the edge that actually JUMPS a level (parent level < child level) needs the clear-lane
      // route -- the plain in-chain links between steps already on the same level are simple
      // same-row neighbors and look better as the normal short straight segment between them.
      const isLevelJump = e.aiDrill && Number(A.props.__aiLevel || 1) < Number(B.props.__aiLevel || 0);
      const d = isLevelJump ? branchEdgePath(A, B) : edgePath(A, B), mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      const fc = S.BY_ID[node(e.from).type].cls, tc = S.BY_ID[node(e.to).type].cls, ctl = fc === "passive" || fc === "pool" || (fc === "queue" && tc === "queue") ? true : false, evt = !ctl && (tc === "queue" || fc === "queue") && e.fan;
      // Pink is reserved for the jump itself (the one edge that actually crosses from one level to
      // the next) -- the plain in-chain links between steps already on the same level are a normal
      // implementation sequence, not a level change, so they stay the default wire color.
      const branchCls = isLevelJump ? (Number(B.props.__aiLevel) === 2 ? "ai-branch-2" : "ai-branch-3") : "";
      const touches = focusNode && (e.from === focusNode || e.to === focusNode);
      const faded = (focusNode && !touches) || (vi && (vi.dim(A) || vi.dim(B))) || (highlight.size && !(highlight.has(e.from) && highlight.has(e.to)));
      const zoneX = vi && viewMode === "security" && STU.zoneOf(S.BY_ID[A.type]) !== STU.zoneOf(S.BY_ID[B.type]);
      const dataCls = viewMode === "dataflow" && e.classification ? "dc-" + esc(e.classification) : "";
      const vlabel = viewMode === "dataflow" && !rec ? [e.classification, e.payload].filter(Boolean).join(" · ") : "";
      const markup = `<g class="wire ${ctl ? "ctl" : ""} ${evt ? "evt" : ""} ${on ? "flow" : ""} ${hot ? "hot" : ""} ${branchCls} ${touches ? "touch" : ""} ${faded ? "fade" : ""} ${zoneX ? "xzone" : ""} ${dataCls} ${highlight.has(e.from) && highlight.has(e.to) ? "hl" : ""} ${sel.edge && sel.edge.from === e.from && sel.edge.to === e.to ? "sel" : ""}"><path class="w" d="${d}" ${e.fan ? 'stroke-dasharray="2 6"' : e.mode === "async" ? 'stroke-dasharray="7 5"' : ""}/><path class="hit" d="${d}" data-edge="${e.from}|${e.to}"/>${rec && fl > 0.5 ? `<text class="wlabel" x="${mid.x}" y="${mid.y - 6}" text-anchor="middle">${num(fl)}/s</text>` : vlabel ? `<text class="wlabel wcontract" x="${mid.x}" y="${mid.y - 6}" text-anchor="middle">${esc(vlabel.slice(0, 32))}</text>` : (e.api || e.protocol) ? `<text class="wlabel wcontract" x="${mid.x}" y="${mid.y - 6}" text-anchor="middle">${esc(String(e.api || e.protocol).slice(0, 28))}</text>` : ""}${e.tls === false ? `<text class="wlabel wnotls" x="${mid.x}" y="${mid.y + 12}" text-anchor="middle">no TLS</text>` : ""}</g>`;
      return { touches, markup };
    }).filter(Boolean);
    // Touching wires render last (later in the SVG = on top), so they sit visually above every
    // crossing, unrelated wire instead of getting lost underneath one.
    const edges = edgeList.filter((x) => !x.touches).map((x) => x.markup).join("") + edgeList.filter((x) => x.touches).map((x) => x.markup).join("");
    const nodes = doc.nodes.map((n) => {
      const def = S.BY_ID[n.type], u = nu(n.id), util = u ? u.util : null, isSrc = def.cls === "source";
      const cls = (util == null || isSrc ? "" : util < 0.7 ? "u-ok" : util <= 1 ? "u-warn" : "u-bad") + (u && u.down ? " down" : "") + (!live.has(n.id) ? " orphan" : "") + (sel.node === n.id ? " sel" : "") + (down[n.id] ? " down" : "") + (multi.has(n.id) ? " msel" : "") + (highlight.has(n.id) ? " hl" : highlight.size ? " vdim" : "") + (vi && vi.dim(n) ? " vdim" : "") + (vi && vi.hot(n) ? " vhot" : "") + (n.props.locked ? " locked" : "");
      const vb = vi ? vi.badge(n) : "";
      const nm = (n.props.name || def.name), fill = util == null ? 0 : clamp(util, 0, 1) * (NW - 24);
      const aiLevel = Number(n.props.__aiLevel || 1);
      return `<g class="node ${cls} ${aiLevel > 1 ? "ai-level-node" : ""}" data-node="${n.id}" transform="translate(${n.x} ${n.y})">
        ${referenceMode && DOCS.D[n.type] ? `<title>${esc(nm)} — ${esc(DOCS.D[n.type])}</title>` : ""}
        <rect class="box" x="${-NW / 2}" y="${-NH / 2}" width="${NW}" height="${NH}" rx="13"/>
        ${PROV[def.prov] ? `<rect x="${-NW / 2 + 8}" y="${-NH / 2 - 9}" width="${PROV[def.prov][0].length * 6.5 + 10}" height="15" rx="7.5" fill="${PROV[def.prov][1]}"/><text x="${-NW / 2 + 13}" y="${-NH / 2 + 2}" font-size="9.5" font-weight="700" fill="${PROV[def.prov][2]}">${PROV[def.prov][0]}</text>` : ""}
        <text class="ico" x="${-NW / 2 + 10}" y="-8">${def.icon}</text><text class="nm" x="${-NW / 2 + 38}" y="-11">${esc(nm.length > 16 ? nm.slice(0, 15) + "…" : nm)}</text>
        ${aiLevel > 1 ? `<text class="ai-depth" x="${NW / 2 - 9}" y="${-NH / 2 + 14}" text-anchor="end">L${aiLevel}</text>` : ""}
        <text class="sb" x="${-NW / 2 + 10}" y="12">${esc(subLabel(n))}</text>
        ${util != null && !isSrc ? `<rect class="ubg" x="${-NW / 2 + 12}" y="${NH / 2 - 14}" width="${NW - 24}" height="6" rx="3"/><rect class="ufill" x="${-NW / 2 + 12}" y="${NH / 2 - 14}" width="${fill}" height="6" rx="3"/><text class="pc" x="${NW / 2 - 8}" y="12" text-anchor="end">${Math.round(util * 100)}%</text>` : ""}
        ${u && u.down ? `<text class="pc" x="${NW / 2}" y="${-NH / 2 - 6}" text-anchor="end" fill="var(--bad)">DOWN</text>` : ""}${u && u.brkOpen ? `<text class="pc" x="${NW / 2}" y="${-NH / 2 - 6}" text-anchor="end" fill="var(--bad)">BREAKER OPEN</text>` : ""}${u && u.unhealthy && running && !u.down ? `<text class="pc" x="${NW / 2}" y="${-NH / 2 - 6}" text-anchor="end" fill="var(--bad)">unhealthy</text>` : ""}
        ${isSrc ? "" : `<circle class="in" cx="${-NW / 2}" cy="0" r="4"/>`}<circle class="handle-hit" data-handle="${n.id}" cx="${NW / 2}" cy="0" r="20"/><circle class="handle" data-handle="${n.id}" cx="${NW / 2}" cy="0" r="8"/>
        ${n.props.locked ? `<text class="nbadge" x="${NW / 2 - 4}" y="${NH / 2 + 4}" text-anchor="end">🔒</text>` : ""}${n.props.comment ? `<text class="nbadge" x="${-NW / 2 + 2}" y="${NH / 2 + 4}"><title>${esc(n.props.comment)}</title>💬</text>` : ""}
        ${vb ? `<text class="vbadge" x="0" y="${NH / 2 + 16}" text-anchor="middle">${esc(vb)}</text>` : ""}
      </g>`;
    }).join("");
    const bands = usedRegions().map((id) => { const ns = doc.nodes.filter((n) => n.props.region === id); if (!ns.length) return ""; const x0 = Math.min(...ns.map((n) => n.x)) - NW / 2 - 24, x1 = Math.max(...ns.map((n) => n.x)) + NW / 2 + 24, y0 = Math.min(...ns.map((n) => n.y)) - NH / 2 - 34, y1 = Math.max(...ns.map((n) => n.y)) + NH / 2 + 26, col = regionColor(id), down = chaos["region:" + id];
      return `<g><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="22" fill="${down ? "var(--bad)" : col}" opacity="${down ? 0.16 : 0.07}" stroke="${col}" stroke-opacity=".6" stroke-dasharray="8 6"/><text x="${x0 + 14}" y="${y0 + 22}" font-size="14" font-weight="700" fill="${col}">${esc(regionName(id))}${down ? " · DOWN" : ""}</text></g>`; }).join("");
    const rub = rubber ? `<path class="rubber" d="M${rubber.x1} ${rubber.y1} L${rubber.x2} ${rubber.y2}"/>` : "";
    let vbands = "";
    if (vi && vi.group) { const keys = [...new Set(doc.nodes.map(vi.group))]; vbands = keys.map((k) => bandSvg(doc.nodes.filter((n) => vi.group(n) === k), k, vi.color(k), { pad: 14, op: 0.08, cls: "vband" })).join(""); }
    const gbands = (doc.groups || []).map((g) => bandSvg(doc.nodes.filter((n) => g.ids.includes(n.id)), "\u25a3 " + g.name, "var(--accent)", { pad: 30, op: 0.05, cls: "gband", group: g.id })).join("");
    const mq = marquee ? `<rect class="marquee" x="${Math.min(marquee.x1, marquee.x2)}" y="${Math.min(marquee.y1, marquee.y2)}" width="${Math.abs(marquee.x2 - marquee.x1)}" height="${Math.abs(marquee.y2 - marquee.y1)}"/>` : "";
    board.innerHTML = `<defs><filter id="roughN" x="-15%" y="-25%" width="130%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter>
      <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker>
      <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="translate(${view.x % (28 * view.z)} ${view.y % (28 * view.z)}) scale(${view.z})"><circle class="grid-dot" cx="2" cy="2" r="1.2"/></pattern></defs>
      <rect width="100%" height="100%" fill="url(#dots)"/><g id="world" transform="translate(${view.x} ${view.y}) scale(${view.z})">${vbands}${gbands}${bands}${edges}${nodes}${rub}${mq}</g>`;
    $("#hint").textContent = doc.nodes.length <= (guideId ? 0 : 1) ? (practiceMode ? (guideId ? "Follow the guide steps. Step 1: add a Client from the Components panel." : "Rebuild the reference: drag a Client from the Components tab, add the boxes you saw, and connect them in request order. Then press Start.") : aiWorkspace ? "Start here: describe your app in the AI assistant tab and press Generate, or drag components from the Components tab. Then follow the steps on the left." : "Pick a component on the right to start drawing") : "";
    $("#board").setAttribute("class", tool === "hand" || spaceDown ? "pan" : tool === "connect" || linkFrom ? "link" : "");
    zoomLabel(); paintRegionChaos(); paintWirePanel(); paintMinimap(); paintMultiBar(); if (!light) paintGuide(); if (!light || tab === "live") updSide();
  }
  // ---- minimap: every box as a dot, the visible area as a frame; click to jump there
  function paintMinimap() {
    const mm = $("#minimap"); if (!mm) return;
    if (!doc.nodes.length || referenceMode) { mm.setAttribute("hidden", ""); return; }
    mm.removeAttribute("hidden");
    const r = $("#board").getBoundingClientRect(), W = 180, H = 116;
    const vx0 = -view.x / view.z, vy0 = -view.y / view.z, vw = r.width / view.z, vh = r.height / view.z;
    const xs = doc.nodes.map((n) => n.x), ys = doc.nodes.map((n) => n.y);
    const x0 = Math.min(...xs, vx0) - NW, x1 = Math.max(...xs, vx0 + vw) + NW, y0 = Math.min(...ys, vy0) - NH, y1 = Math.max(...ys, vy0 + vh) + NH;
    const k = Math.min(W / (x1 - x0), H / (y1 - y0)), ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    const px = (x) => ox + (x - x0) * k, py = (y) => oy + (y - y0) * k;
    mm.dataset.map = JSON.stringify({ x0, y0, k, ox, oy });
    mm.innerHTML = doc.edges.map((e) => { const a = node(e.from), b = node(e.to); return a && b ? `<line x1="${px(a.x)}" y1="${py(a.y)}" x2="${px(b.x)}" y2="${py(b.y)}"/>` : ""; }).join("") +
      doc.nodes.map((n) => `<rect class="${multi.has(n.id) || sel.node === n.id ? "on" : highlight.has(n.id) ? "hl" : ""}" x="${px(n.x) - NW * k / 2}" y="${py(n.y) - NH * k / 2}" width="${Math.max(2, NW * k)}" height="${Math.max(2, NH * k)}" rx="1.5" style="fill:${STU ? STU.LAYER_COLORS[STU.layerOf(S.BY_ID[n.type])] : "var(--accent)"}"/>`).join("") +
      `<rect class="vp" x="${px(vx0)}" y="${py(vy0)}" width="${vw * k}" height="${vh * k}"/>`;
  }
  // ---- multi-selection toolbar
  function paintMultiBar() {
    const bar = $("#multiBar"); if (!bar) return;
    if (multi.size < 2) { bar.hidden = true; return; }
    const ids = [...multi], svcs = ids.filter((id) => node(id) && S.BY_ID[node(id).type].cls === "service"), allLocked = ids.every((id) => node(id) && node(id).props.locked);
    const grp = (doc.groups || []).find((g) => g.ids.length === ids.length && g.ids.every((id) => multi.has(id)));
    const sig = ids.join(",") + allLocked + (grp ? grp.id : "");
    if (bar.dataset.sig === sig && !bar.hidden) return;
    bar.dataset.sig = sig; bar.hidden = false;
    bar.innerHTML = `<b>${ids.length} selected</b><button data-multi="lock">${allLocked ? "Unlock" : "Lock"}</button><button data-multi="dup">Duplicate</button>${grp ? `<button data-multi="ungroup">Ungroup “${esc(grp.name)}”</button>` : `<button data-multi="group">Group…</button>`}${svcs.length >= 2 ? `<button data-multi="merge" title="Preview merging these services into one modular monolith">Merge ${svcs.length} services…</button>` : ""}<button data-multi="delete" class="danger">Delete</button><button data-multi="clear" aria-label="Clear selection">&times;</button>`;
  }

  // ---------------------------------------------------------------- side panel
  const MORE_TABS = ["missions", "interview", "blueprint", "collapse", "board"];
  function updSide() {
    if (aiWorkspace) {
      document.body.classList.add("ai-workspace");
      const deck = $("#aiDeck"), architect = $("#tab-architect");
      if (architect.parentElement !== deck) deck.appendChild(architect);
      deck.hidden = false; architect.hidden = false;
      // #stage always holds the live, interactive board for the current level. #side/#thirdSide
      // always show the other two levels — visited ones as preview thumbnails, unvisited ones
      // as empty placeholders — positioned left to right by level number (see renderStaircase).
      updateLevelControls();
      renderStaircase();
      renderArchitect();
      return;
    }
    $("#thirdSide").hidden = true;
    $("#levelControls").hidden = true;
    $("#main").style.gridTemplateColumns = "";
    $$("#side [data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
    const moreBtn = $("#mMoreTabs"); if (moreBtn) moreBtn.setAttribute("aria-pressed", String(MORE_TABS.includes(tab)));
    ["parts", "inspect", "architect", "delivery", "live", "scenario", "missions", "interview", "blueprint", "collapse", "board"].forEach((t) => { $("#tab-" + t).hidden = t !== tab; });
    if (tab === "inspect") renderInspect(); else if (tab === "architect") renderArchitect(); else if (tab === "delivery") renderDelivery(); else if (tab === "scenario") renderScenario(); else if (tab === "live") renderLive(); else if (tab === "missions") renderMissions(); else if (tab === "interview") renderInterview(); else if (tab === "blueprint") renderBlueprint(); else if (tab === "collapse") renderCollapse(); else if (tab === "board") renderBoard();
  }
  // ---- collapsible sections: every panel heading and every component category can be folded, and the choice is remembered
  const SKEY = "archlab.sections.v1";
  let secState = {}; try { secState = JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { secState = {}; }
  const secOpen = (id, def) => (secState[id] == null ? def : !!secState[id]);
  const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  document.addEventListener("toggle", (e) => { const d = e.target; if (d && d.dataset && d.dataset.sec) { secState[d.dataset.sec] = d.open; try { localStorage.setItem(SKEY, JSON.stringify(secState)); } catch (x) { /* ignore */ } } }, true);
  function collapsifyDom(el, prefix) {
    const kids = [...el.children], headed = (k, i) => k.tagName === "H3" && (i > 0 || prefix !== "inspect");     // the component title at the top of the Selected tab stays a plain title
    if (!kids.some(headed)) return;
    const frag = document.createDocumentFragment(); let cur = null;
    kids.forEach((k, i) => {
      if (headed(k, i)) {
        const title = k.textContent.trim(), id = prefix + ":" + slug(title), d = document.createElement("details"), sm = document.createElement("summary"), body = document.createElement("div");
        d.className = "sec"; d.dataset.sec = id; d.open = secOpen(id, !/^(your numbers|why this)/i.test(title)); sm.textContent = title; body.className = "secbody"; d.appendChild(sm); d.appendChild(body); frag.appendChild(d); cur = body;
      } else (cur || frag).appendChild(k);
    });
    el.replaceChildren(frag);
  }
  const CAT_ICONS = { "Clients": "👥", "Traffic & Edge": "🚦", "Compute": "🖥️", "AI & ML": "🧠", "Storage": "🪣", "Databases": "🗄️", "Cache": "⚡", "Messaging": "📬", "External Integrations": "🔌", "Observability": "📈", "Security & Identity": "🔐", "Containers & Kubernetes": "☸️", "DevOps & CI/CD": "🔁", "Networking": "🌐", "Analytics": "📊" };
  // Display grouping only: component data keeps its original category, which the checks and cost model read.
  const CAT_ORDER = Object.keys(CAT_ICONS), CAT_RENAME = { "Traffic & edge": "Traffic & Edge", "Security & identity": "Security & Identity", "External": "External Integrations", "Data & analytics": "Analytics" };
  const dispCat = (x) => (x.cat === "Storage" ? (x.cls === "db" ? "Databases" : x.cls === "cache" ? "Cache" : "Storage") : CAT_RENAME[x.cat] || x.cat);
  const displayCats = () => { const used = [...new Set(S.CATALOG.map(dispCat))]; return CAT_ORDER.filter((c) => used.includes(c)).concat(used.filter((c) => !CAT_ORDER.includes(c))); };
  const PROVS = [["all", "All"], ["aws", "AWS"], ["gcp", "Google Cloud"], ["azure", "Azure"], ["k8s", "Kubernetes"], ["docker", "Docker"], ["devops", "DevOps"], ["oss", "Open source"], ["generic", "Basic"]];
  let provFilter = "all";
  const PROV = { aws: ["AWS", "#FF9900", "#1a1200"], gcp: ["GCP", "#4285F4", "#fff"], azure: ["Azure", "#0078D4", "#fff"], k8s: ["K8s", "#326CE5", "#fff"], docker: ["Docker", "#2496ED", "#fff"], devops: ["DevOps", "#7C3AED", "#fff"], oss: ["OSS", "#16a34a", "#fff"] };
  const provPill = (x) => (PROV[x.prov] ? `<em class="prov" style="background:${PROV[x.prov][1]};color:${PROV[x.prov][2]}">${PROV[x.prov][0]}</em>` : "");
  let partsQuery = "";
  let guide = null; // guided practice state (Learn), set up by initGuide()
  // Each category shows only its first two rows by default -- the catalog has hundreds of entries,
  // and an always-fully-open category pushes everything else below it out of view. "More options"
  // reveals the rest; collapsing back to two rows is remembered per category, same as open/closed.
  const partsRowsExpanded = new Set();
  const PARTS_ROW_THRESHOLD = 6; // ~2 rows at the panel's narrowest column count; a few extra items may
                                  // still fit before "More options" is needed, which is fine -- the
                                  // button just appears slightly early rather than content being cut
                                  // off with no way to reach it.
  function renderParts() {
    const BASIC = skill === "beginner" ? new Set(["client", "mobile", "browser", "dns", "cdn", "limiter", "lb", "apigw", "app", "worker", "auth", "search", "notify", "sql", "postgres", "mongo", "cache", "object", "queue", "kafka", "thirdparty", "payment", "email", "llm", "embed", "vector", "metrics", "logs"].concat(guide ? guide.ref.nodes.map((n) => n.type) : [])) : null;
    const q = partsQuery.toLowerCase(), cats = displayCats().map((c) => ({ c, items: S.CATALOG.filter((x) => dispCat(x) === c && (!BASIC || BASIC.has(x.id)) && (BASIC || provFilter === "all" || x.prov === provFilter) && (!q || x.name.toLowerCase().includes(q) || c.toLowerCase().includes(q) || (x.prov || "").includes(q))) })).filter((g) => g.items.length);
    $("#tab-parts").innerHTML = `<div class="parts-tools"><input class="search" id="q" placeholder="Search components" title="Search ${S.CATALOG.length} components" value="${esc(partsQuery)}" aria-label="Search components">
      <select id="provSel" aria-label="Provider" title="Show one provider's components">${PROVS.map(([v, t]) => `<option value="${v}" ${provFilter === v ? "selected" : ""}>${v === "all" ? "All providers" : t}</option>`).join("")}</select>
      <button type="button" class="icon-btn" data-secall="open" title="Expand all categories" aria-label="Expand all categories">⊞</button><button type="button" class="icon-btn" data-secall="close" title="Collapse all categories" aria-label="Collapse all categories">⊟</button></div>` +
      cats.map((g) => {
        const key = "cat:" + slug(g.c), rowsOpen = BASIC || partsRowsExpanded.has(key) || q || provFilter !== "all";
        const more = g.items.length > PARTS_ROW_THRESHOLD && !BASIC
          ? `<button class="parts-more" data-secmore="${key}">${rowsOpen ? "Show fewer options ▴" : `Show ${g.items.length - PARTS_ROW_THRESHOLD} more options ▾`}</button>`
          : "";
        return `<details class="sec cat" data-sec="${key}" ${BASIC || q || provFilter !== "all" || secOpen(key, ["Clients", "Traffic & Edge", "Compute"].includes(g.c)) ? "open" : ""}><summary>${CAT_ICONS[g.c] || ""} ${esc(g.c)} <span class="count">${g.items.length}</span></summary><div class="parts secbody ${rowsOpen ? "expanded" : ""}">${g.items.map((x) => `<button class="part" style="${PROV[x.prov] ? "border-top:3px solid " + PROV[x.prov][1] : ""}" draggable="true" data-add="${x.id}"><span>${x.icon}</span>${esc(x.name)}${provPill(x)}</button>`).join("")}</div>${more}</details>`;
      }).join("") + (BASIC ? `<p class="parts-note">Beginner level: only the ${BASIC.size} basic parts. Intermediate shows all ${S.CATALOG.length}.</p>` : "") || "<p class='muted'>Nothing matches.</p>";
    const q2 = $("#q"); q2.oninput = () => { partsQuery = q2.value; const pos = q2.selectionStart; renderParts(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); };
  }
  // ---- component explanations live in the Selected panel
  const DOCS = window.LabDocs || { D: {}, CLS: {}, PROV: {} };
  function tipHtml(id) {
    const d = S.BY_ID[id]; if (!d) return "";
    const nums = []; if (d.cap) nums.push(`${num(d.cap)} req/s per instance`); if (d.rd) nums.push(`${num(d.rd)} reads/s · ${num(d.wr)} writes/s`); if (d.ms > 1) nums.push(`~${d.ms} ms`); if (d.msR) nums.push(`~${d.msR} ms read`); if (d.cost) nums.push(`$${num(d.cost)}/month`);
    const pv = PROV[d.prov] ? `<em class="prov" style="background:${PROV[d.prov][1]};color:${PROV[d.prov][2]}">${PROV[d.prov][0]}</em>` : "";
    const pf = STU && STU.profile(d), prof = pf ? `<div class="tt-prof"><span><b>Layer</b> ${esc(pf.layer)}</span><span><b>Complexity</b> ${esc(pf.complexity)}</span><span><b>Cost</b> ${esc(pf.costCategory)}</span></div>${pf.limitations.length ? `<div class="tt-lim"><b>Limitations</b> ${esc(pf.limitations.join(" "))}</div>` : ""}${pf.security.length ? `<div class="tt-sec"><b>Security</b> ${esc(pf.security.join("; "))}</div>` : ""}` : "";
    return `<div class="tt-h"><span>${d.icon}</span><b>${esc(d.name)}</b>${pv}</div><div class="tt-k">${esc(DOCS.CLS[d.cls] || d.cls)}${DOCS.PROV[d.prov] && d.prov !== "generic" ? " · " + esc(DOCS.PROV[d.prov]) : ""}</div><p>${esc(DOCS.D[id] || "")}</p>${prof}${nums.length ? `<div class="tt-n">${nums.join(" · ")}</div>` : ""}<div class="tt-n muted">Teaching numbers; replace them with yours in the Selected tab.</div>${altTipHtml(id)}`;
  }
  const ALTS = window.LabAlts || { info: () => null };
  const altName = (id) => (S.BY_ID[id] ? S.BY_ID[id].name : id);
  function altTipHtml(id) {
    const a = ALTS.info(id); if (!a) return "";
    const shown = a.alts.slice(0, 4), more = a.alts.length - shown.length;
    return `<div class="tt-alt"><div class="tt-q">${esc(a.question)}</div><div class="tt-pick"><b>Pick it when</b> ${esc(a.pick)}</div><div class="tt-avoid"><b>Skip it when</b> ${esc(a.avoid)}</div>${shown.length ? `<div class="tt-inst"><b>Instead, consider</b>${shown.map((x) => `<div><span>${esc(altName(x.id))}</span> ${esc(x.pick)}</div>`).join("")}${more > 0 ? `<div class="muted">+${more} more: select the box and open “Why this, and why not the others”.</div>` : ""}</div>` : ""}</div>`;
  }
  function altPanelHtml(id) {
    const a = ALTS.info(id); if (!a) return "";
    const cls = S.BY_ID[id].cls;
    return `<h3 style="margin-top:14px">Why this, and why not the others</h3><p class="muted">${esc(a.question)}</p><div class="altrow me"><b>${esc(altName(id))} (this one)</b><div class="tt-pick">Pick it when ${esc(a.pick)}</div><div class="tt-avoid">Skip it when ${esc(a.avoid)}</div></div>` + a.alts.map((x) => `<div class="altrow"><div class="althead"><b>${esc(altName(x.id))}</b>${S.BY_ID[x.id] && S.BY_ID[x.id].cls === cls ? `<button class="pchip" data-swap="${x.id}">Swap</button>` : ""}</div><div class="tt-pick">Pick it when ${esc(x.pick)}</div><div class="tt-avoid">Skip it when ${esc(x.avoid)}</div></div>`).join("");
  }
  // Hover cards were removed because they obstructed both the component palette
  // and the drawing surface.  Select a component to see the same explanation.
  function swapType(id, type) {
    const n = node(id), old = S.BY_ID[n.type], nu_ = S.BY_ID[type]; if (!n || !nu_) return;
    const keepName = !n.props.name || n.props.name === old.name, fresh = S.defaultProps(nu_);
    n.type = type; n.props = Object.assign(fresh, n.props, { measured: {} }); ["cap", "ms", "cost", "rd", "wr"].forEach((k) => { delete n.props[k]; });
    if (keepName) n.props.name = nu_.name;
    commit(); say(`Swapped ${old.name} for ${nu_.name}.`);
  }
  const fld = (label, inner, hint) => `<div class="field"><label>${label}${hint ? `<small>${hint}</small>` : ""}</label>${inner}</div>`;
  const numIn = (k, v, min, max, step) => `<input type="number" data-p="${k}" value="${v}" min="${min}" max="${max}" step="${step || 1}">`;
  const tog = (k, v) => `<span class="seg"><button data-pt="${k}" data-v="0" aria-pressed="${!v}">Off</button><button data-pt="${k}" data-v="1" aria-pressed="${!!v}">On</button></span>`;
  function componentContract(n) {
    const d = S.BY_ID[n.type], name = (n.props.name || d.name).toLowerCase();
    if (d.cls === "source") return { kind: "Frontend app", title: "Screens and backend calls", left: ["Sign in / session", "Dashboard", "Create or update action", "History / status"], right: ["GET /api/me", "GET /api/dashboard", "POST /api/commands", "GET /api/activity"] };
    if (d.cls === "db") return { kind: "Database schema", title: "Tables owned by the product", left: ["users", "user_roles", "parking_spaces", "parking_sessions", "payments", "outbox_events", "audit_log"], right: ["PK + indexes", "service-owned writes", "migration version", "created_at / updated_at", "audit actor + request id"] };
    if (d.cls === "service") {
      if (/parking/.test(name)) return { kind: "Java service", title: "Parking Service API and tables", left: ["GET /api/parking/spaces", "POST /api/parking/sessions", "PATCH /api/parking/sessions/:id/close", "GET /api/parking/sessions/:id"], right: ["parking_spaces", "parking_sessions", "parking_rates", "outbox_events", "audit_log"] };
      if (/payment/.test(name)) return { kind: "Java service", title: "Payment Service API and tables", left: ["POST /api/payments", "GET /api/payments/:id", "POST /api/payments/:id/refund", "POST /webhooks/payment-provider"], right: ["payments", "payment_attempts", "refunds", "outbox_events", "audit_log"] };
      if (/user|profile|auth/.test(name)) return { kind: "Java service", title: "User Service API and tables", left: ["GET /api/users/:id", "PATCH /api/users/:id", "GET /api/users/:id/roles", "POST /api/users/:id/roles"], right: ["users", "profiles", "user_roles", "sessions", "audit_log"] };
      return { kind: "Java service", title: "API and data contract", left: ["GET /api/resources", "POST /api/resources", "GET /api/resources/:id", "PATCH /api/resources/:id"], right: ["resource", "resource_history", "outbox_events", "audit_log", "schema migrations"] };
    }
    if (["router", "proxy"].includes(d.cls)) return { kind: "API gateway", title: "Frontend routes and backend APIs", left: ["/api/* route matching", "JWT verification", "rate limits", "request tracing"], right: ["User Service", "Parking Service", "Payment Service", "versioned API contracts"] };
    if (d.cls === "queue") return { kind: "Event contract", title: "Published and consumed events", left: ["parking.session.opened", "payment.completed", "user.updated", "audit.recorded"], right: ["event id", "aggregate id", "event version", "idempotency key", "occurred at"] };
    return { kind: d.name, title: "Integration contract", left: ["Inbound request or event", "Validate contract", "Execute responsibility"], right: ["Output contract", "Trace id", "Audit information", "Failure handling"] };
  }
  function contractCanvasHtml(n) {
    const c = componentContract(n);
    const rightPart = c.kind === "Event contract" ? "Kafka" : c.kind === "Database schema" ? "Postgres" : "Postgres";
    const leftPart = c.kind === "Database schema" ? "Postgres" : c.kind === "API gateway" ? "Gateway / BFF" : "Controller";
    const cards = (items, tone, deepPart) => items.map((item) => `<span class="contract-card ${tone}" data-deep-part="${esc(deepPart)}" tabindex="0" role="button" aria-label="Open detailed design for ${esc(item)}">${esc(item)}</span>`).join("");
    return `<section class="contract-canvas"><div class="contract-head"><b>${esc(c.kind)}</b><span>${esc(c.title)}</span></div><p class="contract-hint">Click any item to open its Level 3 implementation.</p><div class="contract-grid"><div><strong>${c.kind === "Database schema" ? "Tables" : "Screens / APIs"}</strong>${cards(c.left, "input", leftPart)}</div><div><strong>${c.kind === "Database schema" ? "Schema rules" : "Tables / downstream"}</strong>${cards(c.right, "output", rightPart)}</div></div></section>`;
  }
  const DEEP_ICONS = [[/gateway|route/i, "🚪"], [/frontend|browser|screen|ui\b/i, "🖥️"], [/waf|limit|protect/i, "🛡️"], [/controller|api\b/i, "🎛️"], [/oidc|rbac|auth|identity/i, "🔐"], [/domain|tx|transaction|business/i, "⚙️"], [/postgres|database|db\b|primary|replica|table/i, "🗄️"], [/audit/i, "📝"], [/outbox/i, "📤"], [/kafka|queue|topic|event/i, "🧵"], [/trace|log|metric|observe/i, "📈"], [/worker|consumer/i, "🔧"], [/upstream/i, "⬆️"], [/downstream/i, "⬇️"], [/backup|recovery|restore/i, "💾"], [/dead letter/i, "☠️"]];
  const deepIcon = (title) => (DEEP_ICONS.find(([re]) => re.test(title)) || [, "📦"])[1];
  function deepCanvasHtml(n) {
    const d = S.BY_ID[n.type], p = n.props, serviceCount = (/\b(\d{1,3})\s+backend\s+(?:apps|services)\b/i.exec(p.name || "") || [])[1] || "1";
    const box = (x, y, w, title, sub, accent) => `<g class="deep-box ${accent ? "accent" : ""}" data-deep-part="${esc(title)}" tabindex="0" role="button" aria-label="Open detailed design for ${esc(title)}"><rect class="deep-hit" x="${x - 4}" y="${y - 4}" width="${w + 8}" height="50" fill="transparent"/><rect x="${x}" y="${y}" width="${w}" height="42" rx="8"/><text x="${x + 7}" y="${y + 15}" class="deep-ico">${deepIcon(title)}</text><text x="${x + 22}" y="${y + 16}" class="deep-title">${esc(title)}</text><text x="${x + 22}" y="${y + 31}" class="deep-sub">${esc(sub)}</text></g>`;
    const wire = (x1, y1, x2, y2, dashed) => `<path class="deep-wire ${dashed ? "dashed" : ""}" d="M${x1} ${y1} L${x2} ${y2}"/>`;
    let diagram = "", caption = "";
    if (d.cls === "service") {
      const stack = n.type === "java" ? "Java / Spring Boot" : n.type === "node" ? "Node.js service" : n.type === "python" ? "Python service" : n.type === "go" ? "Go service" : "Application service";
      caption = `${serviceCount} deployable ${stack} service${serviceCount === "1" ? "" : "s"} represented by this component.`;
      diagram = `${wire(94, 45, 145, 45)}${wire(244, 45, 288, 45)}${wire(347, 66, 347, 118)}${wire(228, 66, 228, 118, true)}${wire(347, 160, 407, 160)}${wire(315, 160, 228, 160)}${wire(228, 160, 228, 212)}${wire(94, 45, 94, 118, true)}
        ${box(8, 24, 86, "Frontend / BFF", "HTTPS request")}${box(145, 24, 99, "Controller", "JWT + validation", true)}${box(288, 24, 118, stack, "domain API", true)}${box(288, 118, 118, "Domain + Tx", "business rules", true)}${box(145, 118, 83, "OIDC / RBAC", "authorize")}${box(407, 139, 66, "Postgres", "owned data")}${box(145, 191, 83, "Audit log", "who changed what")}${box(258, 191, 91, "Outbox", "same DB tx")}${box(370, 191, 96, "Kafka", "domain events")}`;
    } else if (["router", "proxy"].includes(d.cls)) {
      caption = "Entry boundary canvas: authenticate, protect, route, and observe every request before it reaches a service.";
      diagram = `${wire(92, 45, 142, 45)}${wire(238, 45, 288, 45)}${wire(190, 66, 190, 130, true)}${wire(336, 66, 336, 130, true)}${box(8, 24, 84, "Frontend", "HTTPS")}${box(142, 24, 96, "WAF + limit", "protect")}${box(288, 24, 96, "Gateway / BFF", "route + compose", true)}${box(142, 109, 96, "OIDC", "JWT / RBAC")}${box(288, 109, 96, "Trace + logs", "observe")}`;
    } else if (d.cls === "db") {
      caption = "Data canvas: one service owns writes; backups, replica policy, and auditability are part of the design.";
      diagram = `${wire(108, 45, 170, 45)}${wire(268, 45, 330, 45)}${wire(219, 66, 219, 129, true)}${wire(378, 66, 378, 129, true)}${box(8, 24, 100, "Java service", "repository")}${box(170, 24, 98, "Primary DB", "writes", true)}${box(330, 24, 120, "Read replica", "queries")}${box(170, 109, 98, "Backup + restore", "recovery")}${box(330, 109, 120, "Audit + metrics", "observe")}`;
    } else if (d.cls === "queue") {
      caption = "Async canvas: an outbox publishes after commit; consumers retry safely and send poison messages to a dead-letter queue.";
      diagram = `${wire(105, 45, 165, 45)}${wire(275, 45, 335, 45)}${wire(220, 66, 220, 129, true)}${box(8, 24, 97, "Java service", "outbox event")}${box(165, 24, 110, "${p.name || d.name}", "durable topic", true)}${box(335, 24, 115, "Worker service", "idempotent")}${box(165, 109, 110, "Dead letter queue", "manual recovery")}`;
    } else {
      caption = "This is the local component canvas: use the connections above to trace how requests and events reach it.";
      diagram = `${wire(112, 45, 184, 45)}${wire(296, 45, 370, 45)}${wire(240, 66, 240, 129, true)}${box(8, 24, 104, "Upstream", "request / event")}${box(184, 24, 112, p.name || d.name, d.name, true)}${box(370, 24, 98, "Downstream", "data / event")}${box(184, 109, 112, "Logs + metrics", "observe")}`;
    }
    return `<section class="deep-canvas"><div class="deep-canvas-head"><b>Level 2 · Internal design canvas</b><span>${esc(caption)} Click any box to open its Level 3 implementation canvas.</span></div><svg viewBox="0 0 480 250" role="img" aria-label="Internal design for ${esc(p.name || d.name)}"><defs><marker id="deepArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z"/></marker></defs>${diagram}</svg></section>`;
  }
  function thirdLevelCanvasHtml(n) {
    if (!deepPart) return `<section class="third-canvas third-empty"><b>Level 3 · Implementation canvas</b><span>Click a box in the Level 2 canvas above to inspect its request flow, data, and production responsibilities.</span></section>`;
    const part = String(deepPart).toLowerCase();
    let title = deepPart, summary = "Implementation flow and operating contract.", steps = [];
    if (/controller/.test(part)) { title = "REST controller"; summary = "The HTTP boundary turns a validated request into one use-case command."; steps = [["HTTP route", "POST /api/parking/sessions"], ["Request DTO", "spaceId · vehicleId"], ["Validate + authorize", "@Valid · RBAC policy"], ["Use case", "OpenSessionCommand"], ["Response", "201 · sessionId"]]; }
    else if (/java|spring|domain|tx/.test(part)) { title = "Java domain transaction"; summary = "One business command runs inside a transaction and records its publishable event atomically."; steps = [["Command handler", "OpenSessionCommand"], ["Aggregate", "ParkingSession rules"], ["Repository", "load + lock space"], ["Commit", "session write"], ["Outbox row", "session.opened event"]]; }
    else if (/postgres|primary db|read replica|table/.test(part)) { title = "PostgreSQL data model"; summary = "The service owns its tables, indexes, migrations, recovery, and read/write policy."; steps = [["parking_sessions", "id · space_id · status"], ["parking_spaces", "id · zone · availability"], ["Index", "space_id, status"], ["Migration", "versioned + reversible"], ["Recovery", "backup + restore drill"]]; }
    else if (/frontend|bff/.test(part)) { title = "Frontend-to-service flow"; summary = "The client owns the screen state and calls versioned APIs through the boundary."; steps = [["Screen", "search / booking / history"], ["UI state", "form + optimistic state"], ["API client", "typed request contract"], ["Gateway", "JWT + route policy"], ["Service API", "command / query"]]; }
    else if (/oidc|rbac|auth/.test(part)) { title = "Identity and authorization"; summary = "Every request is authenticated once and authorized close to the business operation."; steps = [["Bearer token", "OIDC issuer"], ["JWT verify", "signature + expiry"], ["Identity", "subject + tenant"], ["Policy", "role + ownership"], ["Decision", "allow / deny + audit"]]; }
    else if (/outbox/.test(part)) { title = "Transactional outbox"; summary = "The business write and event record commit together; publishing happens safely afterward."; steps = [["Business write", "parking session"], ["Outbox insert", "event + payload"], ["Atomic commit", "one DB transaction"], ["Publisher", "poll + publish"], ["Mark delivered", "retry-safe state"]]; }
    else if (/kafka|queue|dead letter/.test(part)) { title = "Event delivery pipeline"; summary = "Consumers process ordered, versioned events with idempotency and an explicit failure path."; steps = [["Event schema", "version + event id"], ["Topic / partition", "aggregate-id key"], ["Consumer", "idempotency key"], ["Retry policy", "bounded backoff"], ["DLQ", "operator recovery"]]; }
    else if (/audit|logs|metrics|trace/.test(part)) { title = "Audit and observability"; summary = "Every material action carries correlation, actor, outcome, and performance evidence."; steps = [["Request context", "trace + request id"], ["Audit event", "actor + action + target"], ["Structured log", "safe diagnostic fields"], ["Metrics", "latency + errors"], ["Alert", "SLO breach route"]]; }
    else { steps = [["Input", "request or event"], ["Validate", "contract + policy"], ["Execute", "owned responsibility"], ["Persist", "state or event"], ["Observe", "trace + metrics"]]; }
    const nodes = steps.map((s, i) => `<div class="third-node"><b>${esc(s[0])}</b><span>${esc(s[1])}</span>${i < steps.length - 1 ? `<i aria-hidden="true">→</i>` : ""}</div>`).join("");
    return `<section class="third-canvas"><div class="third-head"><b>Level 3 · ${esc(title)}</b><span>Level 1: ${esc(n.props.name || S.BY_ID[n.type].name)} → Level 2: ${esc(deepPart)} → implementation</span></div><p>${esc(summary)}</p><div class="third-flow">${nodes}</div></section>`;
  }
  function deepDesignHtml(n) {
    const d = S.BY_ID[n.type], p = n.props, incoming = doc.edges.filter((e) => e.to === n.id).map((e) => node(e.from).props.name || S.BY_ID[node(e.from).type].name), outgoing = doc.edges.filter((e) => e.from === n.id).map((e) => node(e.to).props.name || S.BY_ID[node(e.to).type].name);
    const role = d.cls === "source" ? "Starts user traffic and owns the user experience." : d.cls === "db" ? "Durable system of record. Its owner defines the data contract and recovery plan." : d.cls === "queue" ? "Separates asynchronous work from the user request. Consumers must be retry-safe and idempotent." : d.cls === "cache" ? "Serves reusable reads quickly. The source of truth still owns correctness." : ["router", "proxy"].includes(d.cls) ? "Controls the boundary: routing, authentication, rate limits, and rollout safety." : d.cls === "service" ? "Owns one business capability and exposes a versioned API or event contract." : d.cls === "passive" ? "Provides a cross-cutting platform capability for the rest of the system." : "Provides a supporting runtime capability.";
    const scale = d.cls === "db" ? `${p.shards || 1} shard(s), ${p.replicas || 0} replica(s)${p.ha ? ", automatic failover enabled" : ""}.` : d.cls === "queue" ? `${p.workers || 1} consumer worker(s); size retries and dead-letter handling before production.` : `${p.inst || 1} instance(s)${p.auto ? ", autoscaling enabled" : ""}${p.ha ? ", HA enabled" : ""}.`;
    const resilience = ["service", "proxy"].includes(d.cls) ? `Timeout ${p.timeout || 1000}ms; retries ${p.retries || 0}; ${p.breaker ? "circuit breaker protects a failing dependency" : "add a circuit breaker for downstream failure"}.` : d.cls === "db" ? "Backups, restore drills, encryption, and a tested failover path are required." : d.cls === "queue" ? "Use idempotency keys, bounded retries, and a dead-letter queue for poison messages." : "Define ownership, health checks, and monitoring before production.";
    return `<article class="deep-design"><span class="architect-kicker">LEVEL 2 · DEEP DESIGN</span><h3>${d.icon} ${esc(p.name || d.name)}</h3><p>${esc(role)}</p>${deepCanvasHtml(n)}${contractCanvasHtml(n)}<div class="deep-design-grid"><div><b>Inputs</b><span>${esc(incoming.join(" · ") || "Entry point")}</span></div><div><b>Outputs</b><span>${esc(outgoing.join(" · ") || "No downstream component yet")}</span></div><div><b>Scale plan</b><span>${esc(scale)}</span></div><div><b>Failure plan</b><span>${esc(resilience)}</span></div></div><p class="deep-design-note">Click an internal canvas box to open its implementation canvas on the right.</p></article>`;
  }
  const WIRE_PROTOCOLS = ["", "HTTPS / REST", "gRPC", "GraphQL", "WebSocket", "SQL", "Queue message", "Event (pub/sub)", "Stream (Kafka-style)", "File / object", "Other"];
  const WIRE_CLASS = [["", "Not classified"], ["public", "Public"], ["internal", "Internal"], ["confidential", "Confidential (personal / business)"], ["restricted", "Restricted (payments, health, secrets)"]];
  const WIRE_RETRY = [["", "Not set"], ["none", "No retries"], ["backoff", "3 retries, exponential backoff + jitter"], ["dlq", "Retry, then dead-letter queue"], ["idempotent", "Retries with idempotency key"]];
  const sel3 = (k, list, v) => `<select data-es="${k}">${list.map((x) => { const [val, lab] = Array.isArray(x) ? x : [x, x || "Not set"]; return `<option value="${esc(val)}" ${(v || "") === val ? "selected" : ""}>${esc(lab)}</option>`; }).join("")}</select>`;
  function wireFields(e) {
    return fld("Protocol", sel3("protocol", WIRE_PROTOCOLS, e.protocol)) +
      fld("API or event name", `<input type="text" data-es="api" value="${esc(e.api || "")}" maxlength="80" placeholder="POST /orders · order.created">`) +
      fld("Payload", `<input type="text" data-es="payload" value="${esc(e.payload || "")}" maxlength="120" placeholder="orderId, items, total">`) +
      fld("Call style", sel3("mode", [["", "Synchronous (waits for an answer)"], ["async", "Asynchronous (fire and forget / event)"]], e.mode), "Async wires do not count as dependency cycles") +
      fld("Timeout (ms)", `<input type="number" data-e="timeout" value="${e.timeout || ""}" min="0" step="50" placeholder="e.g. 800">`) +
      fld("Retry policy", sel3("retry", WIRE_RETRY, e.retry)) +
      fld("Data classification", sel3("classification", WIRE_CLASS, e.classification), "Restricted or confidential data needs TLS and access logging") +
      fld("Encrypted in transit (TLS)", tog("tls", e.tls !== false)) +
      fld("Parallel call", tog("fan", e.fan), "Also called on every request (for example a vector search next to the main path)") + fld(e.fan ? "Share of requests" : "Traffic weight", `<input type="number" data-e="w" value="${e.w || 1}" min="0" max="${e.fan ? 1 : 100}" step="${e.fan ? 0.1 : 1}">`, e.fan ? "0 to 1" : "Splits traffic between several targets") +
      fld("Carries", `<select data-es="only">${[["", "Everything"], ["r", "Reads only"], ["w", "Writes only"], ["s", "Static files only"]].map(([v, t]) => `<option value="${v}" ${(e.only || "") === v ? "selected" : ""}>${t}</option>`).join("")}</select>`, "Send reads to a local replica and writes to the primary") + fld("Failover only", tog("failover", e.failover), "A backup path: used only when the other targets are unhealthy") +
      `<div class="btnrow"><button class="danger" data-act="delEdge">Remove wire</button></div>`;
  }
  // Real Play hides the side inspector, so a selected wire gets a small floating panel on the canvas.
  let wirePanelKey = "", rpBefore = null;
  // Narrow guided practice: the side panel floats over the canvas and is shown only when it is needed.
  const narrowGuide = () => !!guide && matchMedia("(min-width: 761px) and (max-width: 900px)").matches;
  function setRightTab(name, byUser) {
    const col = $("#rightCol"); if (!col) return;
    col.dataset.tab = name; if (byUser) rpBefore = null;
    $$("#rightCol [data-rp]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.rp === name)));
    if (byUser) { document.body.classList.remove("rp-collapsed"); try { localStorage.setItem("archlab.rp", name); } catch (e) { /* ignore */ } }
  }
  // Selecting something shows the Inspect tab; clearing the selection returns to the tab you were on.
  function inspectShown(show) {
    const col = $("#rightCol"); if (!col) return;
    if (show && guide && col.dataset.tab === "parts") { const i = guideStatus().done.indexOf(false); if (i >= 0 && /^(add|connect)$/.test(guide.steps[i].kind)) return; }   // keep Components open while the guide is still building
    if (narrowGuide()) document.body.classList.toggle("rp-collapsed", !show);
    if (show && col.dataset.tab !== "inspect") { rpBefore = col.dataset.tab; setRightTab("inspect"); }
    else if (!show && col.dataset.tab === "inspect" && rpBefore) { setRightTab(rpBefore); rpBefore = null; }
  }
  function paintWirePanel() {
    const stage = $("#stage"); if (!stage || !aiWorkspace) return;
    let panel = $("#wirePanel");
    if (!panel) { panel = document.createElement("section"); panel.id = "wirePanel"; panel.className = "wire-panel"; panel.hidden = true; ($("#rpInspect") || stage).appendChild(panel); }
    const e = sel.edge && doc.edges.find((x) => x.from === sel.edge.from && x.to === sel.edge.to);
    if (!e && sel.node && node(sel.node)) {
      const n = node(sel.node), key = "n:" + n.id + ":" + JSON.stringify(n.props) + ":" + doc.edges.length + ":" + (costLast || 0) + ":" + (lastRec && lastRec.nodes[n.id] ? Math.round(lastRec.nodes[n.id].util * 10) : "") + ":" + skill;
      if (key === wirePanelKey && !panel.hidden) return;
      if (!panel.hidden && panel.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && wirePanelKey.startsWith("n:" + n.id + ":")) { const ld = panel.querySelector(".set-load"); if (ld) ld.outerHTML = loadNote(n) || "<span class='set-load'></span>"; return; }   // don't rebuild under the user's cursor
      wirePanelKey = key; panel.hidden = false; panel.innerHTML = explainHtml(n); inspectShown(true); return;
    }
    if (!e || !node(e.from) || !node(e.to)) { if (!panel.hidden) inspectShown(false); panel.hidden = true; wirePanelKey = ""; return; }
    const key = JSON.stringify(e); if (key === wirePanelKey && !panel.hidden) return;
    wirePanelKey = key; panel.hidden = false; inspectShown(true);
    const nm = (id) => esc(node(id).props.name || S.BY_ID[node(id).type].name);
    panel.innerHTML = `<header><b>Wire</b><span>${nm(e.from)} → ${nm(e.to)}</span><button type="button" id="wirePanelClose" aria-label="Close wire panel">&times;</button></header><div class="wire-panel-body">${wireFields(e)}</div>`;
  }
  function renderInspect() { renderInspect0(); collapsifyDom($("#tab-inspect"), "inspect"); }
  function renderInspect0() {
    const el = $("#tab-inspect");
    const third = $("#thirdContent");
    const selectedNode = sel.node && node(sel.node);
    if (third) third.innerHTML = aiWorkspace ? (selectedNode ? thirdLevelCanvasHtml(selectedNode) : `<section class="third-canvas third-empty"><b>Level 3 · Implementation canvas</b><span>Select a Level 1 component, then select a Level 2 box. Its API, transaction, data, and delivery path will appear here.</span></section>`) : "";
    if (sel.edge) {
      const e = doc.edges.find((x) => x.from === sel.edge.from && x.to === sel.edge.to); if (!e) { el.innerHTML = "<p class='muted'>Nothing selected.</p>"; return; }
      el.innerHTML = `<h3>Wire</h3><p class="muted">${esc(node(e.from).props.name || S.BY_ID[node(e.from).type].name)} → ${esc(node(e.to).props.name || S.BY_ID[node(e.to).type].name)}</p>` + wireFields(e); return;
    }
    const n = selectedNode; if (!n) {
      const preview = hoverNodeId && node(hoverNodeId);
      el.innerHTML = aiWorkspace && architectBusy
        ? `<article class="design-generating"><span class="architect-kicker">WORKING</span><div class="architect-progress"><i></i><span>Designing the complete system — services, data, and flows…</span></div></article>`
        : preview ? `<article class="hover-preview"><span class="architect-kicker">HOVER PREVIEW</span><h3>${esc(preview.props.name || S.BY_ID[preview.type].name)}</h3><p>Click this component to keep the complete design open.</p>${deepCanvasHtml(preview)}${contractCanvasHtml(preview)}</article>` : architectResult && !architectResult.error ? `<article class="design-ready"><span class="architect-kicker">DESIGN GENERATED</span><h2>${esc(doc.name)}</h2><p>Your system is drawn on the canvas. Hover a box for its API and data preview; click it to open the complete design.</p><div><span>${doc.nodes.length} components</span><span>${doc.edges.length} connections</span></div><button class="primary-sm" data-tab="architect">Edit decisions</button></article>` : "<p class='muted'>Hover a box to preview its APIs and tables, then click it to open the complete design.</p>";
      return;
    }
    const d = S.BY_ID[n.type], p = n.props, c = d.cls; let h = `<h3>${d.icon} ${esc(d.name)} ${provPill(d)}</h3>` + fld("Name", `<input type="text" data-p="name" value="${esc(p.name || d.name)}" maxlength="30">`);
    h = deepDesignHtml(n) + h;
    const eqs = S.equivalents(n.type); if (eqs.length) h += `<div class="field"><label>Swap for another option<small>Same job, different provider. Your wires stay.</small></label><div class="pchips">${eqs.slice(0, 14).map((x) => `<button class="pchip" data-swap="${x.id}" title="${esc(x.name)}">${x.icon} ${esc(x.name)}</button>`).join("")}</div></div>`;
    if (c === "pool") h += fld("Nodes", numIn("nodes", p.nodes || 1, 1, 500), "Machines in the pool. Wire this box to the deployments that run on it.") + fld("Pods per node", numIn("podsPerNode", p.podsPerNode || d.podsPerNode || 8, 1, 200), "How many pods fit on one machine") + fld("Cluster autoscaler", tog("auto", p.auto), "Adds nodes when pods stop fitting, slower than pod autoscaling") + (p.auto ? fld("Most nodes", numIn("max", p.max || 30, 1, 1000)) : "") + fld("Spread over 3 zones", tog("multiAz", p.multiAz), "A zone outage then takes a third of the nodes, not half");
    if (["proxy", "service"].includes(c)) h += fld("Release strategy", `<select data-ps="deploy">${[["rolling", "Rolling update"], ["bluegreen", "Blue-green (switch all at once)"], ["canary", "Canary (5% first)"]].map(([v, t]) => `<option value="${v}" ${(p.deploy || "rolling") === v ? "selected" : ""}>${t}</option>`).join("")}</select>`, "Decides how many users a bad release reaches before it is rolled back. Monitoring and alerts shorten that time.");
    if (["router", "proxy", "service"].includes(c)) h += fld(c === "router" ? "Instances" : "Instances", numIn("inst", p.inst || 1, 1, 200)) + (c !== "router" ? fld("Autoscaling", tog("auto", p.auto), "Adds instances under load, after a delay") : "") + (c === "router" ? fld("Highly available pair", tog("ha", p.ha), "Survives a load balancer failure") : "");
    if (c === "cache") h += fld("Nodes", numIn("inst", p.inst || 1, 1, 24)) + fld("Hit rate", `<input type="number" data-p="hit" value="${p.hit == null ? d.hit : p.hit}" min="0" max="1" step="0.05">`, "Share of reads answered from the cache") + fld("Coalesce misses", tog("coalesce", p.coalesce), "Softens a cold-cache stampede");
    if (c === "store") h += fld("Instances", numIn("inst", p.inst || 1, 1, 50));
    if (c === "cdn") h += fld("Instances", numIn("inst", p.inst || 1, 1, 20));
    if (c === "queue") h += fld("Workers", numIn("workers", p.workers || 1, 1, 200), "Each drains about " + d.cap + " msg/s");
    if (c === "db") h += fld("Shards", numIn("shards", p.shards || 1, 1, 32), "Each takes its own writes") + fld("Read replicas", numIn("replicas", p.replicas || 0, 0, 8)) + fld("Automatic failover (HA)", tog("ha", p.ha)) + ((p.shards || 1) > 1 ? fld("Key salting", tog("salting", p.salting), "Spreads a hot key") : "");
    if (c === "limiter" && !d.waf) h += fld("Limit (req/s)", numIn("limit", p.limit || d.cap, 1, 10000000, 100));
    if (["proxy", "service"].includes(c)) h += `<h3 style="margin-top:12px">Resilience</h3>` + fld("Retries", numIn("retries", p.retries || 0, 0, 5), "Extra attempts when a call to a dependency fails") + fld("Timeout (ms)", numIn("timeout", p.timeout || 1000, 10, 60000, 10), "Slower answers count as failed (used with retries or a breaker)") + fld("Circuit breaker", tog("breaker", p.breaker), "Stops calling a failing dependency, then probes it") + (p.breaker ? fld("Fallback when open", tog("fallback", p.fallback), "Serve a degraded answer instead of an error") : "");
    if (c === "external") h += fld("Calls per request", `<input type="number" data-p="ratio" value="${p.ratio == null ? 0.1 : p.ratio}" min="0" max="1" step="0.05">`, "Share of requests that call it") + fld("Instances", numIn("inst", p.inst || 1, 1, 50));
    if (c === "source") h += fld("Share of traffic", numIn("share", p.share == null ? 1 : p.share, 0, 100, 0.5), "Relative to other clients");
    if (c !== "passive") h += fld("Region", `<select data-ps="region"><option value="">None (global)</option>${regionList().map((r) => `<option value="${esc(r.id)}" ${p.region === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`, "Where this box runs. Calls between regions add the round trip.");
    if (c === "db") {
      const others = doc.nodes.filter((x) => S.BY_ID[x.type].cls === "db" && x.id !== n.id);
      h += fld("Replication", `<select data-ps="mode">${[["primary", "Primary"], ["replica", "Read replica of…"], ["active", "Active-active with…"]].map(([v, t]) => `<option value="${v}" ${(p.mode || "primary") === v ? "selected" : ""}>${t}</option>`).join("")}</select>`, "Copies between regions are asynchronous")
        + ((p.mode === "replica" || p.mode === "active") ? fld("Peer", `<select data-ps="peer"><option value="">Choose…</option>${others.map((o) => `<option value="${esc(o.id)}" ${p.peer === o.id ? "selected" : ""}>${esc(o.props.name || S.BY_ID[o.type].name)}</option>`).join("")}</select>`) : "")
        + (p.mode === "replica" ? fld("Auto-promote", tog("autoPromote", p.autoPromote), "Takes the writes if the primary fails; writes it had not received are lost") : "");
    }
    if (c === "db") {
      const cons = p.consistency || "eventual", group = (1 + (p.replicas || 0)) + (p.peer ? 1 : 0);
      h += fld("Consistency", `<select data-ps="consistency">${[["eventual", "Eventual (fast, may be stale)"], ["ryw", "Read-your-writes"], ["quorum", "Quorum (R + W)"], ["strong", "Strong (leader, consensus)"]].map(([v, t]) => `<option value="${v}" ${cons === v ? "selected" : ""}>${t}</option>`).join("")}</select>`, `Copies in the group: ${group}. Stronger modes cost latency and need copies alive.`)
        + (cons === "quorum" ? fld("Read from (R)", numIn("qr", p.qr || 0, 0, group), "0 = a majority") + fld("Write to (W)", numIn("qw", p.qw || 0, 0, group), "0 = a majority. R + W above the group size never reads stale data.") : "")
        + (cons === "ryw" ? fld("Readers who just wrote", `<input type="number" data-p="rywShare" value="${p.rywShare == null ? 0.2 : p.rywShare}" min="0.01" max="1" step="0.05">`, "Their reads must hit the primary") : "");
    }
    if (running) h += fld("Fail this box now", tog("__down", !!down[n.id]), "Only while the simulation runs");
    const nums = [["cap", "Capacity per instance (req/s)", d.cap], ["ms", "Idle latency (ms)", d.ms], ["cost", "Monthly price ($)", d.cost], ["rd", "Reads per second", d.rd], ["wr", "Writes per second", d.wr]].filter((x) => x[2]);
    if (nums.length && c !== "source" && c !== "passive") {
      h += `<h3 style="margin-top:14px">Your numbers</h3><p class="muted">Defaults are teaching values. Replace them with what you measured and tick <i>measured</i>.</p>` +
        nums.map(([k, l, dv]) => fld(l, `<input type="number" data-p="${k}" placeholder="${dv}" value="${p[k] == null ? "" : p[k]}" step="any"><label style="font-size:11px"><input type="checkbox" data-meas="${k}" ${p.measured && p.measured[k] ? "checked" : ""}> measured</label>`)).join("");
    }
    h += altPanelHtml(n.type);
    h += fld("Locked", tog("locked", p.locked), "Locked boxes cannot be moved or deleted (L)") + fld("Comment", `<textarea data-pc="comment" rows="2" maxlength="500" placeholder="Decision, open question or TODO">${esc(p.comment || "")}</textarea>`);
    h += `<div class="btnrow"><button data-act="dup">Duplicate</button><button class="danger" data-act="delNode">Delete</button></div>`; el.innerHTML = h;
  }
  function renderScenario() { renderScenario0(); collapsifyDom($("#tab-scenario"), "traffic"); }
  function renderScenario0() {
    const s = doc.scenario, o = doc.slo;
    const f = (l, k, v, min, max, step, h) => fld(l, `<input type="number" data-s="${k}" value="${v}" min="${min}" max="${max}" step="${step}">`, h);
    $("#tab-scenario").innerHTML = `<h3>Traffic</h3>` + f("Baseline requests / second", "base", s.base, 1, 100000000, 100) +
      fld("Shape", `<select data-s="shape">${[["steady", "Steady"], ["ramp", "Growing"], ["diurnal", "Day / night"], ["spike", "Sudden spike"]].map(([v, t]) => `<option value="${v}" ${s.shape === v ? "selected" : ""}>${t}</option>`).join("")}</select>`) +
      (s.shape === "spike" ? f("Spike multiplier", "spikeX", s.spikeX, 1, 50, 0.5) : "") + f("Reads (%)", "readPct", Math.round(s.readFrac * 100), 0, 100, 1) + f("Static files (%)", "staticPct", Math.round(s.staticFrac * 100), 0, 100, 1) + f("Bots (%)", "botPct", Math.round(s.botFrac * 100), 0, 90, 1) + f("Hot-key skew", "skew", s.skew, 1, 5, 0.1, "1 even, 3 one key gets 3× load") +
      `<h3 style="margin-top:14px">Goals</h3>` + fld("p95 latency ≤ (ms)", `<input type="number" data-g="p95" value="${o.p95}" min="1">`) + fld("Availability ≥ (%)", `<input type="number" data-g="avail" value="${o.avail}" min="50" max="100" step="0.01">`) + fld("Budget ≤ ($/month)", `<input type="number" data-g="budget" value="${o.budget}" min="1">`);
  }
  function findings() {
    const out = [], live = connected(); const rec = lastRec, o = doc.slo;
    doc.nodes.forEach((n) => { const d = S.BY_ID[n.type]; if (["pool", "passive"].includes(d.cls)) { if (d.cls === "pool" && !doc.edges.some((e) => e.from === n.id)) out.push(["chip", `${n.props.name || d.name} runs nothing: wire it to a deployment or service.`]); return; } if (d.cls !== "source" && !live.has(n.id)) out.push(["warn", `${n.props.name || d.name} is not reachable from a client, so it does nothing.`]); });
    if (!doc.nodes.some((n) => S.BY_ID[n.type].cls === "db" || S.BY_ID[n.type].cls === "store")) out.push(["warn", "There is no database or storage, so nothing durable is being kept."]);
    doc.nodes.forEach((n) => { if ((n.props.retries || 0) > 0 && !n.props.breaker) out.push(["warn", `${n.props.name || S.BY_ID[n.type].name} retries failed calls without a circuit breaker: if a dependency slows down, the retries can multiply its load and turn a short spike into a lasting outage (a retry storm).`]); });
    doc.nodes.forEach((n) => { const d = S.BY_ID[n.type]; if (["service"].includes(d.cls) && (n.props.inst || 1) === 1 && !n.props.auto) out.push(["chip", `${n.props.name || d.name} has a single instance: one failure takes it down.`]); if (d.cls === "db" && !n.props.ha && !(n.props.replicas > 0)) out.push(["chip", `${n.props.name || d.name} has no replica or failover.`]); });
    if (doc.nodes.filter((n) => ["service", "proxy"].includes(S.BY_ID[n.type].cls)).length) {
      const has = (f) => doc.nodes.some((n) => f(S.BY_ID[n.type], n)), svcs = doc.nodes.filter((n) => ["service", "proxy"].includes(S.BY_ID[n.type].cls));
      const checks = [["monitoring", has((d) => d.monitor)], ["autoscaling", svcs.some((n) => n.props.auto)], ["safe releases", svcs.some((n) => n.props.deploy === "canary" || n.props.deploy === "bluegreen")], ["CI/CD", has((d) => /ci\/cd|pipeline|actions|jenkins|argo|gitops/i.test(d.name))], ["infrastructure as code", has((d) => /terraform|cloudformation|pulumi|ansible|bicep/i.test(d.name))], ["secrets", has((d) => /vault|secret|key vault|kms/i.test(d.name))], ["audit logging", has((d) => d.tag === "audit" || /audit|cloudtrail|activity log/i.test(d.name))], ["security scanning", has((d) => d.tag === "security-scan")], ["threat detection", has((d) => d.tag === "threat" || d.tag === "siem")]];
      const got = checks.filter((x) => x[1]).length; out.push([got >= 6 ? "ok" : "chip", `Delivery and security readiness ${got}/${checks.length}. Missing: ${checks.filter((x) => !x[1]).map((x) => x[0]).join(", ") || "nothing"}.`]);
      if (!has((d) => d.monitor)) out.push(["chip", "There is no monitoring or alerting: a bad release or a slow leak is noticed late (10 minutes in the simulator). Add Prometheus, CloudWatch, Azure Monitor or similar."]);
    }
    const regs = usedRegions();
    if (regs.length >= 2) {
      if (!doc.edges.some((e) => e.failover)) out.push(["warn", "The design spans regions but has no failover wire: users of a failed region will stay down. Add a backup wire (Failover only) from each client to the other region's entry."]);
      doc.nodes.forEach((n) => { if (S.BY_ID[n.type].cls === "db" && n.props.mode === "replica" && !n.props.autoPromote) out.push(["chip", `${n.props.name || S.BY_ID[n.type].name} is a replica that will not take over writes if its primary region fails.`]); if (S.BY_ID[n.type].cls === "db" && (n.props.mode === "replica" || n.props.mode === "active") && !n.props.peer) out.push(["warn", `${n.props.name || S.BY_ID[n.type].name} has no peer chosen, so nothing is replicated.`]); });
    }
    if (rec) {
      Object.entries(rec.nodes).forEach(([id, v]) => { const n = node(id); if (!n) return; const nm = n.props.name || S.BY_ID[n.type].name; if (v.groupN && (v.cons === "quorum" || v.cons === "strong") && v.aliveN < Math.floor(v.groupN / 2) + 1) out.push(["bad", `${nm} has lost its quorum (${v.aliveN} of ${v.groupN} copies reachable), so it refuses requests rather than risk stale data.`]); if (v.cons === "eventual" && v.groupN > 1 && rec.stale > 0.05) out.push(["warn", `${nm} is eventually consistent and about ${(rec.stale * 100).toFixed(0)}% of reads are stale right now.`]); if (v.lag > 0.05) out.push(["chip", `${nm} trails its peer by ${v.lag.toFixed(2)} s, so reads there can be stale.`]); if (v.rpo > 0) out.push(["bad", `${nm} took over writes and about ${num(v.rpo)} recent writes never reached it (data loss on failover).`]); if (v.conflict > 0.5) out.push(["warn", `${nm} sees about ${v.conflict.toFixed(1)} conflicting writes per second between active regions.`]); });
    }
    if (rec) {
      const rows = Object.entries(rec.nodes).map(([id, v]) => ({ id, v, n: node(id) })).filter((x) => x.n && S.BY_ID[x.n.type].cls !== "source");
      rows.filter((x) => x.v.util > 1).forEach((x) => out.unshift(["bad", `${x.n.props.name || S.BY_ID[x.n.type].name} is over capacity (${Math.round(x.v.util * 100)}%).`]));
      if (sim.t > 10) rows.filter((x) => x.v.util < 0.12 && (S.BY_ID[x.n.type].cost || 0) >= 200 && S.BY_ID[x.n.type].cls !== "passive").forEach((x) => out.push(["chip", `${x.n.props.name || S.BY_ID[x.n.type].name} is mostly idle (${Math.round(x.v.util * 100)}%): you may be paying for capacity you do not need.`]));
      const sm = S.summarize(sim), good = sm.p95 <= o.p95 && sm.availability * 100 >= o.avail && sm.cost <= o.budget;
      out.unshift([good ? "ok" : "warn", `${good ? "On track" : "Not yet"}: p95 ${Math.round(sm.p95)} ms (goal ${o.p95}), availability ${(sm.availability * 100).toFixed(2)}% (goal ${o.avail}), cost ${money(sm.cost)} (budget ${money(o.budget)}).`]);
    }
    return out;
  }
  function chaosReadiness() {
    const fingerprint = JSON.stringify({ nodes: doc.nodes, edges: doc.edges, scenario: doc.scenario, slo: doc.slo });
    if (chaosCache && chaosCache.fingerprint === fingerprint) return chaosCache.value;
    const graph = graphForSim(), kinds = new Set(doc.nodes.map((n) => S.BY_ID[n.type].cls));
    const plan = [];
    if (kinds.has("db")) { plan.push({ tick: 25, until: 26, type: "dbDown" }, { tick: 80, until: 95, type: "slowDb" }); }
    if (kinds.has("cache")) plan.push({ tick: 50, until: 51, type: "cacheFlush" });
    if (doc.nodes.some((n) => S.BY_ID[n.type].cls === "router")) plan.push({ tick: 70, until: 71, type: "lbDown" });
    if (doc.nodes.length > 3) plan.push({ tick: 100, until: 110, type: "azOut" });
    if (doc.nodes.some((n) => (n.props.retries || 0) > 0)) plan.push({ tick: 30, until: 35, type: "burst" });
    if (usedRegions().length >= 2) usedRegions().slice(0, 2).forEach((id, i) => plan.push({ tick: 45 + i * 30, until: 60 + i * 30, type: "region:" + id }));   // lose each region in turn   // reveals retry storms
    const run = S.run(graph, doc.scenario, plan); if (run.error) return null;
    const s = run.summary, o = doc.slo;
    const lat = Math.min(30, 30 * o.p95 / Math.max(s.p95, 1));
    const avail = Math.min(45, 45 * (s.availability * 100) / Math.max(o.avail, 1));
    const cost = Math.min(25, 25 * o.budget / Math.max(s.cost, 1));
    const value = { score: Math.round(lat + avail + cost), summary: s, events: plan.map((e) => e.type).filter((v, i, a) => a.indexOf(v) === i) };
    chaosCache = { fingerprint, value }; return value;
  }
  // ---- AI design review (local model, needs the YashAI Control Room copy of the Lab)
  let memoryOn = false, reviewText = "", reviewBusy = false;
  fetch("/api/architecture-lab/projects").then((r) => { memoryOn = r.ok; if (memoryOn) { if (tab === "live") renderLive(); try { renderArchitect(); } catch (e) { /* panel not built yet */ } } }).catch(() => { memoryOn = false; });
  function runFacts(events) {
    const run = S.run(graphForSim(), doc.scenario, events); if (run.error) return null;
    const st = run.st, s = run.summary, peak = st.history.reduce((m, x) => (x.rps > m.rps ? x : m), st.history[0]);
    const comps = Object.entries(peak.nodes).filter(([id]) => node(id) && S.BY_ID[node(id).type].cls !== "source").map(([id, v]) => {
      const n = node(id), d = S.BY_ID[n.type], isDb = d.cls === "db";
      return { name: n.props.name || d.name, type: d.name, region: n.props.region || "", lag_s: +(v.lag || 0).toFixed(2), rpo_writes: Math.round(v.rpo || 0), conflicts_per_s: +(v.conflict || 0).toFixed(1), peak_util_pct: Math.round(v.util * 100), peak_load_rps: Math.round(v.load), latency_ms: Math.round(v.ms || 0),
        instances: isDb ? (n.props.shards || 1) : (n.props.inst || n.props.workers || 1), capacity_per_instance_rps: Math.round(n.props.cap != null && n.props.cap !== "" ? +n.props.cap : (d.cap || d.rd || 0)) };
    }).sort((a, b) => b.peak_util_pct - a.peak_util_pct).slice(0, 14);
    return { p95_ms: Math.round(s.p95), availability_pct: +(s.availability * 100).toFixed(3), monthly_cost: Math.round(s.cost), nodes: comps };
  }
  function settingsText(n) {
    const d = S.BY_ID[n.type] || {}, p = n.props, c = d.cls, on = (v) => (v ? "on" : "off"), out = [];
    if (["router", "proxy", "service"].includes(c)) out.push(`instances ${p.inst || 1}`);
    if (["proxy", "service"].includes(c)) out.push(`autoscaling ${on(p.auto)}`, `circuit breaker ${on(p.breaker)}`, `retries ${p.retries || 0}`);
    if (c === "router") out.push(`high availability ${on(p.ha)}`);
    if (c === "cache") out.push(`nodes ${p.inst || 1}`, `hit rate ${Math.round(100 * (p.hit == null ? d.hit || 0 : p.hit))}%`);
    if (c === "queue") out.push(`workers ${p.workers || 1}`);
    if (c === "db") out.push(`read replicas ${p.replicas || 0}`, `automatic failover ${on(p.ha)}`, `shards ${p.shards || 1}`);
    return out.join(", ") || subLabel(n);
  }
  function reviewFacts() {
    const sc = doc.scenario, o = doc.slo, ev = events();
    const label = (n) => n.props.name || S.BY_ID[n.type].name;
    return { name: doc.name || "Untitled", goals: { p95_ms: o.p95, availability_pct: o.avail, budget_per_month: o.budget },
      scenario: { baseline_rps: sc.base, shape: sc.shape, read_pct: Math.round(sc.readFrac * 100), static_pct: Math.round(sc.staticFrac * 100), bot_pct: Math.round(sc.botFrac * 100) },
      design: doc.nodes.filter((n) => S.BY_ID[n.type].cls !== "source").map((n) => `${label(n)} (${S.BY_ID[n.type].name}): ${settingsText(n)}`),
      wires: doc.edges.map((e) => `${label(node(e.from))} -> ${label(node(e.to))}${e.fan ? " (parallel call)" : ""}`),
      normal: runFacts([]), incident: ev.length ? runFacts(ev) : null, incidents: ev.map((x) => x.type),
      mission: (activeMission() && mresult && !mresult.error) ? { title: activeMission().title, score: mresult.score, failed: mresult.criteria.filter((c) => !c.pass).map((c) => `${c.label} (${c.detail})`), incidents: activeMission().incidents.map((i) => `${i.label}: ${pctS(mresult.R.win[i.id].availability)} served`) } : null,
      notes: findings().map((f) => f[1]) };
  }
  function renderReviewSurface() { renderArchitect(); if (tab === "live") renderLive(); }
  async function aiReview() {
    if (reviewBusy) return; reviewBusy = true; reviewText = memoryOn ? "Reviewing this architecture with the local mentor (about 20 to 60 seconds)…" : "Reviewing this design…"; renderReviewSurface();
    try { const r = await memoryApi("/api/architecture-lab/review", { facts: reviewFacts(), level: skill || "" }); reviewText = r.review; noteGuide("reviewed"); }
    catch (err) {
      if (memoryOn) reviewText = "The mentor review could not run: " + err.message;
      else { reviewText = builtInReview(); noteGuide("reviewed"); }   // online copy: no AI model, so the design checks answer instead
    }
    reviewBusy = false; renderReviewSurface();
  }
  /* Review without a model: the simulated numbers against the goal, then the top findings of the design checks. */
  function builtInReview() {
    const r = S.run(graphForSim(), doc.scenario, []), m = r.error ? null : r.summary, l = lintNow(), out = [];
    out.push("This online copy has no AI mentor, so this review comes from the simulator and the built-in design checks.");
    if (m) {
      const fast = m.p95 <= +doc.slo.p95, up = m.availability * 100 >= +doc.slo.avail;
      out.push(`**Numbers:** p95 ${Math.round(m.p95)} ms (goal ${doc.slo.p95} ms: ${fast ? "met" : "missed"}), availability ${(m.availability * 100).toFixed(2)}% (goal ${doc.slo.avail}%: ${up ? "met" : "missed"}).`);
    }
    const top = l ? l.findings.filter((f) => f.sev !== "info").slice(0, 5) : [];
    if (top.length) { out.push("**Fix in this order:**"); top.forEach((f, i) => out.push(`${i + 1}. ${f.title} (${SEV_LABEL[f.sev] || f.sev}). ${f.fix || ""}`)); }
    else out.push("**Checks:** nothing important was found in this design.");
    return out.join("\n\n");
  }
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "archlab-review" || referenceMode) return;
    sel = { node: null, edge: null }; render(); tab = "architect"; updSide(); setRightTab("ai", true); aiReview();
  });
  // ---- AI Architect: a product brief becomes a reviewable starter canvas.
  let architectApplied = false;
  let architectBusy = false, architectResult = null, architectDraft = "", architectScale = "starter", architectStack = "recommend", architectMode = "ai";
  let architectPrefs = { style: "modular-monolith", frontends: 1, backends: 3, cloud: "aws", cicd: "github-actions", auth: "oidc", audit: "yes", observability: "yes", transaction: "outbox-saga", queue: "kafka" };
  const ARCHITECT_SCALES = { starter: "Pilot · up to 10k users", growth: "Growth · 10k to 1M users", scale: "Scale · 1M+ users" };
  const ARCHITECT_STACKS = {
    recommend: "AI recommended (explain why)",
    "java-spring": "Java + Spring Boot",
    "node-express": "Node.js + Express/NestJS",
    "python-django": "Python + Django/FastAPI",
    dotnet: ".NET / C#",
    go: "Go",
  };
  const ARCHITECT_STYLES = { monolith: "Simple monolith", "modular-monolith": "Modular monolith", microservices: "Microservices", microfrontends: "Micro-frontends" };
  const ARCHITECT_CLOUDS = { aws: "AWS", azure: "Microsoft Azure", gcp: "Google Cloud", kubernetes: "Kubernetes / any cloud", local: "Local / self-hosted" };
  const ARCHITECT_CICD = { "github-actions": "GitHub Actions", "gitlab-ci": "GitLab CI", jenkins: "Jenkins", argo: "Argo CD + CI", none: "Decide later" };
  const ARCHITECT_AUTH = { oidc: "OIDC + JWT / RBAC", managed: "Managed identity provider", session: "Secure sessions" };
  const ARCHITECT_TRANSACTIONS = { "outbox-saga": "Outbox + Saga", local: "Local database transactions", strict: "Strong consistency" };
  const ARCHITECT_QUEUES = { kafka: "Kafka", rabbitmq: "RabbitMQ", cloud: "Cloud queue", none: "No async queue" };
  const ARCHITECT_EXAMPLES = [
    ["Remote jobs", "Build a remote job platform where candidates upload a resume, search worldwide jobs, and receive a ranked daily shortlist. Recruiters can post jobs. Start at 10,000 users."],
    ["AI support", "Build an AI support assistant that answers customer questions from company documents, escalates uncertain conversations to a human, and serves 5,000 daily users."],
    ["Marketplace", "Build a marketplace where customers browse products, place orders, and sellers receive reliable notifications. Start at 2,000 daily users."],
    ["10 FE / 100 BE", "Build an enterprise platform with 10 frontend apps and 100 backend services. Users manage projects, approvals, files and notifications. Use transactions for approvals and payments."],
    ["Modular monolith", "Build a modular monolith for a new SaaS product. Keep billing, users, projects and notifications as modules, with one deployable backend until the team and traffic grow."],
  ];
  function architectProposal() {
    if (!architectResult || architectResult.error) return "";
    const d = architectResult.document, names = d.nodes.slice(0, 6).map((n) => (S.BY_ID[n.type] || {}).name || n.type);
    const extra = d.nodes.length > 6 ? ` +${d.nodes.length - 6}` : "";
    const b = architectResult.blueprint || {};
    const topology = (b.topology || []).map((x) => `<div class="architect-topology-item"><span>${esc(x.label)}</span><b>${esc(x.value)}</b><p>${esc(x.detail)}</p></div>`).join("");
    const flows = (b.flows || []).map((flow, i) => `<details class="architect-flow" ${i === 0 ? "open" : ""}><summary>${esc(flow.name)}</summary><ol>${(flow.steps || []).map((step) => `<li>${esc(step)}</li>`).join("")}</ol></details>`).join("");
    const patterns = (b.patterns || []).map((x) => `<li><b>${esc(x.name)}</b><span>${esc(x.why)}</span></li>`).join("");
    const transaction = b.transactions ? `<section class="architect-transaction"><span class="architect-kicker">${esc(b.transactions.title)}</span><p>${esc(b.transactions.strategy)}</p><ul>${(b.transactions.rules || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : "";
    return `<article class="architect-result">
      <div class="architect-result-head"><div><span class="architect-kicker">READY TO REVIEW</span><h3>${esc(d.name)}</h3></div><span class="architect-ready">✓ Valid canvas</span></div>
      <p class="architect-explanation">${esc(architectResult.explanation || "A standard first design was created.")}</p>
      <div class="architect-metrics"><div><b>${d.nodes.length}</b><span>components</span></div><div><b>${d.edges.length}</b><span>connections</span></div><div><b>${d.slo.p95}ms</b><span>p95 target</span></div></div>
      <div class="architect-stack"><span>Starter stack</span><p>${esc(names.join(" · ") + extra)}</p></div>
      ${topology ? `<section class="architect-topology"><h4>System topology</h4>${topology}<p class="architect-canvas-note">${esc(b.canvas_note || "The canvas is a representative, runnable view of this system.")}</p></section>` : ""}
      ${flows ? `<section class="architect-flows"><h4>End-to-end flows</h4>${flows}</section>` : ""}
      ${transaction}
      ${patterns ? `<details class="architect-patterns"><summary>Patterns used <span>${(b.patterns || []).length}</span></summary><ul>${patterns}</ul></details>` : ""}
      <details class="architect-details" open><summary>Assumptions to validate <span>${architectResult.assumptions.length}</span></summary><ul>${architectResult.assumptions.map((x) => `<li>${esc(x)}</li>`).join("") || "<li>Confirm the product requirements before build.</li>"}</ul></details>
      <details class="architect-details risk"><summary>Risks before production <span>${architectResult.risks.length}</span></summary><ul>${architectResult.risks.map((x) => `<li>${esc(x)}</li>`).join("") || "<li>Run traffic and failure simulations before launch.</li>"}</ul></details>
      <div class="architect-actions"><button class="primary-sm architect-apply" data-act="applyArchitect">${architectApplied ? "Preview again" : "Review and apply"}</button><button data-act="editArchitect">Edit brief</button></div>
      <p class="architect-replace">${architectApplied ? "Applied to the canvas. If you edit the canvas and want this version back, preview it again: nothing changes until you approve." : "Not applied yet. Your canvas stays as it is until you review the changes, cost and risks and press Apply."}</p>
    </article>`;
  }
  function mentorMarkup() {
    return `<section class="architect-mentor"><div><span class="architect-kicker">ARCHITECTURE MENTOR</span><h3>Get feedback before you build</h3><p>The mentor checks the current canvas, traffic target, incident path, cost, and missing production controls. It works from your local design only.</p></div><button class="architect-mentor-btn" data-act="mentorReview" ${reviewBusy ? "disabled" : ""}>${reviewBusy ? "Reviewing design…" : "✦ Review with mentor"}</button>${reviewText ? `<div class="architect-mentor-answer">${esc(reviewText)}</div>` : `<small>Generate a canvas first, then ask for a review whenever you change it.</small>`}</section>`;
  }
  function renderArchitect() {
    const el = $("#tab-architect");
    if (guide) {   // guided practice: the AI tab is only the mentor review, not the product-brief generator
      el.innerHTML = `<section class="architect-mentor"><div><span class="architect-kicker">MENTOR REVIEW</span><h3>What is good, what to improve</h3><p>${memoryOn ? "The local mentor reads your canvas and its simulation numbers. It takes 20 to 60 seconds." : "Your design is checked against its simulation numbers and the built-in design checks."}</p></div><button class="architect-mentor-btn" data-act="mentorReview" ${reviewBusy ? "disabled" : ""}>${reviewBusy ? "Reviewing design…" : "✦ Review my design"}</button>${reviewText ? `<div class="architect-mentor-answer">${mdLite(reviewText)}</div>` : ""}</section>`;
      return;
    }
    const progress = architectBusy ? `<div class="architect-progress"><i></i><span>Turning your brief into a validated starter architecture…</span></div>` : "";
    const error = architectResult && architectResult.error ? `<div class="architect-error">${esc(architectResult.error)}</div>` : "";
    el.innerHTML = `<div class="architect-hero"><span class="architect-kicker">${memoryOn ? "LOCAL AI WORKSPACE" : "AI WORKSPACE"}</span><h2>Turn a product idea into a reviewable system design.</h2><p>Set the product intent, let ${memoryOn ? "local AI" : "AI"} draft the system, then inspect every service, flow, risk, and delivery gate on the canvas.</p><ol class="architect-steps"><li class="active"><b>1</b><span>Frame</span></li><li><b>2</b><span>Generate</span></li><li><b>3</b><span>Inspect</span></li><li><b>4</b><span>Freeze</span></li></ol></div>
      <section class="architect-brief"><div class="architect-section-head"><div><span class="architect-step-label">STEP 1</span><h3>Frame the product</h3><p>Who uses it, what they do, and the scale you expect.</p></div><span class="architect-private">◉ ${memoryOn ? "Local only" : "Online AI"}</span></div>
        <label class="architect-label" for="architectPrompt">Describe the app</label><textarea id="architectPrompt" data-architect-input rows="7" placeholder="Example: Candidates upload a resume, search worldwide jobs, and receive a ranked daily shortlist. Recruiters post jobs. Start with 10,000 users and daily imports.">${esc(architectDraft)}</textarea>
        <div class="architect-guidance"><span>Include: users</span><span>main action</span><span>expected scale</span></div>
        <button class="architect-improve" data-act="improveArchitect">✦ Improve this brief</button>
        <div class="architect-example-row"><span>Start from an example</span>${ARCHITECT_EXAMPLES.map(([label, text]) => `<button data-architect-example="${esc(text)}">${esc(label)}</button>`).join("")}</div>
        <div class="architect-scale"><span><b>Planning horizon</b><small>Choose a starting scale; you can revise it after the first simulation.</small></span><div>${Object.entries(ARCHITECT_SCALES).map(([id, label]) => `<button data-architect-scale="${id}" aria-pressed="${architectScale === id}">${esc(label)}</button>`).join("")}</div></div>
        <div class="architect-mode"><span><b>Design approach</b><small>Start with a local recommendation or set every architectural decision yourself.</small></span><div><button data-architect-mode="ai" aria-pressed="${architectMode === "ai"}">✦ AI-recommended foundation</button><button data-architect-mode="manual" aria-pressed="${architectMode === "manual"}">Manual / edit choices</button></div></div>
        <section class="architect-options">
          <div class="architect-options-head"><b>${architectMode === "ai" ? "AI-recommended foundation" : "Your architecture choices"}</b><span>${architectMode === "ai" ? "You can switch to manual and edit every decision." : "These are mandatory inputs for the generated design."}</span></div>
          <div class="architect-selected"><b>Selected foundation</b><span>${esc(ARCHITECT_STACKS[architectStack])} · ${esc(ARCHITECT_STYLES[architectPrefs.style])} · ${esc(ARCHITECT_CLOUDS[architectPrefs.cloud])} · ${esc(ARCHITECT_CICD[architectPrefs.cicd])}</span></div>
          ${architectMode === "ai" ? `<details class="architect-choice-review"><summary>Review AI recommendations</summary><div class="architect-control-grid is-guided">` : `<div class="architect-control-grid">`}
            <label>Architecture<select data-architect-pref="style" ${architectMode === "ai" ? "disabled" : ""}>${Object.entries(ARCHITECT_STYLES).map(([id,label]) => `<option value="${id}" ${architectPrefs.style === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
            <label>Backend stack<select data-architect-stack-select ${architectMode === "ai" ? "disabled" : ""}>${Object.entries(ARCHITECT_STACKS).map(([id,label]) => `<option value="${id}" ${architectStack === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
            <label>Frontend apps<input type="number" min="1" max="10" data-architect-pref="frontends" value="${architectPrefs.frontends}" ${architectMode === "ai" ? "disabled" : ""}></label>
            <label>Backend services<input type="number" min="1" max="100" data-architect-pref="backends" value="${architectPrefs.backends}" ${architectMode === "ai" ? "disabled" : ""}></label>
            <label>Cloud<select data-architect-pref="cloud" ${architectMode === "ai" ? "disabled" : ""}>${Object.entries(ARCHITECT_CLOUDS).map(([id,label]) => `<option value="${id}" ${architectPrefs.cloud === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
            <label>CI / CD<select data-architect-pref="cicd" ${architectMode === "ai" ? "disabled" : ""}>${Object.entries(ARCHITECT_CICD).map(([id,label]) => `<option value="${id}" ${architectPrefs.cicd === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
            <label>Authentication<select data-architect-pref="auth" ${architectMode === "ai" ? "disabled" : ""}>${Object.entries(ARCHITECT_AUTH).map(([id,label]) => `<option value="${id}" ${architectPrefs.auth === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
            <label>Transactions<select data-architect-pref="transaction" ${architectMode === "ai" ? "disabled" : ""}>${Object.entries(ARCHITECT_TRANSACTIONS).map(([id,label]) => `<option value="${id}" ${architectPrefs.transaction === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
            <label>Message queue<select data-architect-pref="queue" ${architectMode === "ai" ? "disabled" : ""}>${Object.entries(ARCHITECT_QUEUES).map(([id,label]) => `<option value="${id}" ${architectPrefs.queue === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
            <label>Audit trail<select data-architect-pref="audit" ${architectMode === "ai" ? "disabled" : ""}><option value="yes" ${architectPrefs.audit === "yes" ? "selected" : ""}>Required</option><option value="no" ${architectPrefs.audit === "no" ? "selected" : ""}>Not required</option></select></label>
            <label>Logs, metrics & traces<select data-architect-pref="observability" ${architectMode === "ai" ? "disabled" : ""}><option value="yes" ${architectPrefs.observability === "yes" ? "selected" : ""}>Required</option><option value="no" ${architectPrefs.observability === "no" ? "selected" : ""}>Not required</option></select></label>
          ${architectMode === "ai" ? `</div></details>` : `</div>`}
        </section>
        <div class="architect-generate-wrap"><div><span class="architect-step-label">STEP 2</span><b>Generate the system canvas</b><small>${memoryOn ? "Creates a starter design locally." : "Creates a starter design with AI."} You stay in control of every choice.</small></div><button class="architect-generate" data-act="runArchitect" ${architectBusy ? "disabled" : ""}><span>✦</span>${architectBusy ? "Designing the complete system…" : "Generate complete system design"}</button></div>${progress}
      </section>
      <section class="architect-contract"><b>What you will get</b><span>Validated components</span><span>End-to-end flows</span><span>Transaction strategy</span><span>Patterns & risks</span><span>Scale & reliability plan</span><span>Build & deploy handoff</span></section><button class="architect-improve" data-act="openDelivery">Open build &amp; deploy workspace</button>${error}${architectProposal()}${mentorMarkup()}`;
  }
  function deliveryChecks() {
    const types = doc.nodes.map((n) => (S.BY_ID[n.type] || {}).name || n.type).join(" ").toLowerCase();
    return [[doc.nodes.length >= 3, "Architecture has core components"], [doc.edges.length >= 2, "Main request flow is connected"], [!!doc.slo && !!doc.slo.p95, "SLO target is recorded"], [/monitor|observ/.test(types), "Observability is included"], [/pipeline|ci\/cd|github actions|jenkins|argo/.test(types), "Delivery pipeline is modelled"], [/secret|vault|key vault|kms/.test(types), "Secrets management is modelled"]];
  }
  function deliveryHandoff() {
    const checks = deliveryChecks().map(([ok, label]) => `- [${ok ? "x" : " "}] ${label}`).join("\n");
    return `# Implementation handoff: ${doc.name || "Untitled architecture"}\n\n## Frozen architecture\n\n${buildBrief()}\n\n## Delivery gates\n\n${checks}\n\n## Required execution order\n\n1. Generate the application code, tests, Docker files, infrastructure-as-code, and CI pipeline from this design.\n2. Run lint, unit tests, integration tests, dependency/security scanning, and build the deployable artifacts.\n3. Deploy to staging and run smoke tests.\n4. Present the staging URL, pipeline logs, costs, and rollback plan for approval.\n5. Deploy to production only after explicit approval.\n`;
  }
  function architectureViews() {
    const label = (id) => { const n = node(id); return n ? (n.props.name || S.BY_ID[n.type].name) : id; };
    const requestSteps = doc.edges.map((e, i) => `${i + 1}. ${label(e.from)} → ${label(e.to)}`).join("\n") || "1. Add the request flow to the canvas.";
    const mermaid = ["sequenceDiagram", "  autonumber", ...doc.edges.map((e) => `  participant ${slug(label(e.from))} as ${label(e.from)}\n  participant ${slug(label(e.to))} as ${label(e.to)}\n  ${slug(label(e.from))}->>${slug(label(e.to))}: request / event`)].join("\n");
    const services = doc.nodes.filter((n) => ["service", "app"].includes((S.BY_ID[n.type] || {}).cls)).map((n) => n.props.name || S.BY_ID[n.type].name);
    const database = doc.nodes.find((n) => (S.BY_ID[n.type] || {}).cls === "db");
    return { requestSteps, mermaid, services, database: database ? (database.props.name || S.BY_ID[database.type].name) : "Service-owned database" };
  }
  function implementationBundle() {
    const clean = (doc.name || "yashai-product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "yashai-product";
    const views = architectureViews(), checks = deliveryChecks().map(([ok, label]) => `- [${ok ? "x" : " "}] ${label}`).join("\n");
    const serviceList = views.services.length ? views.services.map((s) => `- ${s}`).join("\n") : "- Application service";
    return {
      format: "YashAI implementation package v1",
      generated_at: new Date().toISOString(),
      architecture: JSON.parse(JSON.stringify(doc)),
      files: {
        "README.md": `# ${doc.name}\n\nGenerated from a frozen YashAI architecture. Start with the acceptance gates before writing production code.\n\n## Services\n${serviceList}\n\n## Delivery gates\n${checks}\n`,
        "docs/architecture/request-flow.md": `# Request flow\n\n${views.requestSteps}\n\n\`\`\`mermaid\n${views.mermaid}\n\`\`\`\n`,
        "docs/architecture/decisions/0001-system-shape.md": `# ADR 0001: ${doc.name} system shape\n\n## Context\n${architectDraft || "Product brief to be confirmed."}\n\n## Decision\nUse the frozen Level 1, Level 2, and Level 3 architecture in this package.\n\n## Consequences\nEvery service owns its API and data contract. Change this decision only through a new ADR and updated architecture canvas.\n`,
        "api/openapi.yaml": `openapi: 3.1.0\ninfo:\n  title: ${clean} API\n  version: 0.1.0\npaths:\n  /health:\n    get:\n      responses:\n        '200': { description: healthy }\n  /api/resources:\n    get:\n      responses:\n        '200': { description: resource list }\n    post:\n      responses:\n        '201': { description: resource created }\n`,
        "db/migrations/V1__initial_schema.sql": `-- ${views.database} owns these tables. Replace generic names with the approved domain model.\ncreate table resources (id uuid primary key, status varchar(40) not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());\ncreate table outbox_events (id uuid primary key, aggregate_id uuid not null, event_type varchar(120) not null, payload jsonb not null, created_at timestamptz not null default now(), delivered_at timestamptz);\ncreate index outbox_events_undelivered on outbox_events (created_at) where delivered_at is null;\ncreate table audit_log (id uuid primary key, actor_id varchar(160), action varchar(160) not null, target_id varchar(160), request_id varchar(160), created_at timestamptz not null default now());\n`,
        "Dockerfile": `# Replace the build command for the chosen stack.\nFROM eclipse-temurin:21-jre\nWORKDIR /app\nCOPY build/libs/*.jar app.jar\nUSER 10001\nEXPOSE 8080\nENTRYPOINT [\"java\", \"-jar\", \"/app/app.jar\"]\n`,
        ".github/workflows/ci.yml": `name: CI\non: [push, pull_request]\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Build and test\n        run: ./gradlew test\n      - name: Build image\n        run: docker build -t ${clean}:${'${{ github.sha }}'} .\n      - name: Security scan\n        run: echo \"Add dependency and container scanning here\"\n`,
        "deploy/k8s/app.yaml": `apiVersion: apps/v1\nkind: Deployment\nmetadata: { name: ${clean} }\nspec:\n  replicas: 2\n  selector: { matchLabels: { app: ${clean} } }\n  template:\n    metadata: { labels: { app: ${clean} } }\n    spec:\n      containers:\n        - name: app\n          image: ${clean}:latest\n          ports: [{ containerPort: 8080 }]\n          readinessProbe: { httpGet: { path: /health, port: 8080 } }\n          resources: { requests: { cpu: 100m, memory: 256Mi }, limits: { cpu: 1, memory: 1Gi } }\n`,
        "YASHAI_HANDOFF.md": deliveryHandoff()
      }
    };
  }
  function renderDelivery() {
    const el = $("#tab-delivery"), frozen = doc.delivery && doc.delivery.frozenAt, checks = deliveryChecks(), ready = checks.filter((x) => x[0]).length;
    el.innerHTML = `<div class="delivery-hero"><span class="architect-kicker">DELIVERY CONTROL ROOM</span><h2>From approved design to running product.</h2><p>Freeze the architecture, create an implementation handoff, then let the build agent create code and the pipeline verify it. Deployment remains an explicit final approval.</p></div><section class="delivery-state"><span class="delivery-dot ${frozen ? "done" : ""}"></span><div><b>${frozen ? "Architecture frozen for implementation" : "Architecture is still editable"}</b><p>${frozen ? "The handoff uses this exact component map and flow." : "Review the canvas, traffic tests, risks, and SLO before freezing."}</p></div></section><h3>Readiness ${ready} / ${checks.length}</h3><ul class="delivery-checks">${checks.map(([ok, label]) => `<li class="${ok ? "ok" : ""}"><b>${ok ? "✓" : "○"}</b>${esc(label)}</li>`).join("")}</ul><h3>Delivery path</h3><ol class="delivery-path"><li><b>Freeze design</b><span>Locks a local snapshot for the build agent.</span></li><li><b>Download build package</b><span>OpenAPI, SQL migration, ADR, request flow, Dockerfile, CI workflow, and Kubernetes starter manifest.</span></li><li><b>Generate code</b><span>Agent creates frontend, services, tests, infrastructure and documentation from the package.</span></li><li><b>Run pipeline</b><span>Lint, unit tests, integration tests, security scan and image build must pass.</span></li><li><b>Deploy</b><span>Deploy to staging first; production needs your final approval and configured cloud account.</span></li></ol><div class="btnrow">${frozen ? `<button class="primary-sm" data-act="downloadBundle">Download build package</button><button data-act="downloadHandoff">Download handoff</button><button data-act="unfreezeDelivery">Edit architecture</button>` : `<button class="primary-sm" data-act="freezeDelivery">Freeze for implementation</button>`}</div>${frozen ? `<p class="delivery-note">The package is local and reviewable. Give it to the build agent with a local folder or Git repository; it creates code, runs checks, and presents staging before any deployment.</p>` : ""}`;
  }
  async function aiArchitect() {
    const stackLine = architectStack === "recommend"
      ? "Tech stack: recommend the best backend/frontend stack for this product and explain why in the explanation."
      : `Tech stack: use ${ARCHITECT_STACKS[architectStack]}. Choose component types and names that match this stack.`;
    const required = `Mandatory design controls: architecture style=${ARCHITECT_STYLES[architectPrefs.style]}; frontend applications=${architectPrefs.frontends}; backend services=${architectPrefs.backends}; cloud=${ARCHITECT_CLOUDS[architectPrefs.cloud]}; CI/CD=${ARCHITECT_CICD[architectPrefs.cicd]}; authentication=${ARCHITECT_AUTH[architectPrefs.auth]}; audit trail=${architectPrefs.audit}; observability (structured logs, metrics, traces)=${architectPrefs.observability}; transaction strategy=${ARCHITECT_TRANSACTIONS[architectPrefs.transaction]}; messaging=${ARCHITECT_QUEUES[architectPrefs.queue]}. Draw every required application, service, platform component, security control, audit/logging component, transaction boundary and queue on the canvas. Include end-to-end request, async, failure, deployment and security flows. Do not omit a required element.`;
    const description = `${architectDraft}\n\nPlanning horizon: ${ARCHITECT_SCALES[architectScale]}\n${stackLine}\n${required}`;
    architectBusy = true; architectResult = null; renderArchitect(); renderInspect(); $("#stage").classList.add("ai-generating");
    try {
      architectResult = await memoryApi("/api/architecture-lab/architect", { description });
      if (!architectResult.error) { architectApplied = false; previewArchitect(); }
    } catch (err) { architectResult = { error: err.message }; }
    architectBusy = false;
    $("#stage").classList.remove("ai-generating");
    renderArchitect(); renderInspect();
  }
  function improveArchitectBrief() {
    const additions = [
      "Users and roles: describe the people who use it and their permissions.",
      "Core journey: name the most important user action from start to finish.",
      "Data and integrations: list critical records, files, payments, or third-party systems.",
      "Quality bar: state expected traffic, latency, availability, privacy, and compliance needs."
    ];
    const missing = additions.filter((line) => !architectDraft.toLowerCase().includes(line.slice(0, 12).toLowerCase()));
    architectDraft = `${architectDraft.trim()}${architectDraft.trim() ? "\n\n" : ""}Design details to confirm:\n${missing.map((line) => `- ${line}`).join("\n")}`.slice(0, 2500);
    architectResult = null;
    renderArchitect();
    $("#architectPrompt").focus();
    say("Prompt improved with the design details the AI needs.");
  }
  const mdLite = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^(Verdict|Why|Fix in this order|Trade-offs|Check with a real test):/gm, "<b>$1:</b>").replace(/\n/g, "<br>");
  // ---------------------------------------------------------------- collapse lab and leaderboard
  const CL = window.LabCollapse, BD = window.LabBoard, BKEY = "archlab.board.v1";
  let lb = BD.empty("You"); try { lb = BD.normalize(JSON.parse(localStorage.getItem(BKEY))); if (!lb.player) lb.player = "You"; } catch (e) { lb = BD.empty("You"); }
  let cfaults = [{ type: "dbDown", target: "", mag: 4, startMin: 15, durationMin: 8 }], cresult = null, chunt = null, boardMsg = "", boardSyncOk = false;
  function saveBoard() {
    try { localStorage.setItem(BKEY, JSON.stringify(lb)); } catch (e) { /* ignore */ }
    if (memoryOn) memoryApi("/api/architecture-lab/leaderboard", { board: lb }).then(() => { boardSyncOk = true; }).catch(() => { boardSyncOk = false; });
  }
  function record(kind, key, score, stars, cost) { BD.add(lb, { kind, key, score, stars, cost, player: lb.player }); saveBoard(); }
  function syncBoardFromMemory() {
    if (!memoryOn) return;
    memoryApi("/api/architecture-lab/leaderboard").then((remote) => { const m = BD.merge(lb, remote); lb = m.board; if (!lb.player || lb.player === "You") lb.player = remote.player || lb.player; try { localStorage.setItem(BKEY, JSON.stringify(lb)); } catch (e) { /* ignore */ } boardSyncOk = true; if (tab === "board") renderBoard(); }).catch(() => { boardSyncOk = false; });
  }
  setTimeout(syncBoardFromMemory, 800);

  const NODE_FAULTS = ["node", "slow"];
  const nodeChoices = () => doc.nodes.filter((n) => !["source", "passive"].includes(S.BY_ID[n.type].cls));
  function faultRow(f, i) {
    const def = CL.BY_TYPE[f.type] || CL.FAULTS[0], tgt = def.target;
    const targets = tgt === "node" ? nodeChoices().map((n) => `<option value="${esc(n.id)}" ${f.target === n.id ? "selected" : ""}>${esc(n.props.name || S.BY_ID[n.type].name)}</option>`).join("")
      : tgt === "region" ? (usedRegions().length ? usedRegions() : regionList().map((r) => r.id)).map((id) => `<option value="${esc(id)}" ${f.target === id ? "selected" : ""}>${esc(regionName(id))}</option>`).join("") : "";
    return `<div class="frow"><select data-cf="${i}:type" aria-label="Failure type">${CL.FAULTS.map((x) => `<option value="${x.type}" ${x.type === f.type ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
      ${tgt !== "none" ? `<select data-cf="${i}:target" aria-label="Target">${targets || "<option value=''>(none)</option>"}</select>` : ""}
      ${def.mag ? `<label class="mini">×<input type="number" data-cf="${i}:mag" value="${f.mag}" min="${def.mag.min}" max="${def.mag.max}" step="0.5"></label>` : ""}
      <label class="mini">at min<input type="number" data-cf="${i}:startMin" value="${f.startMin}" min="0" max="58" step="1"></label><label class="mini">for min<input type="number" data-cf="${i}:durationMin" value="${f.durationMin}" min="1" max="60" step="1"></label>
      <button data-cfdel="${i}" aria-label="Remove failure">✕</button></div>`;
  }
  function availChart(series, events) {
    const W = 300, H = 90, n = series.length, x = (i) => 4 + (i / (n - 1)) * (W - 8), y = (v) => H - 6 - v * (H - 14);
    const bands = events.map((e) => `<rect x="${x(e.tick)}" y="2" width="${Math.max(2, x(Math.min(n - 1, e.until)) - x(e.tick))}" height="${H - 8}" fill="var(--bad)" opacity=".13"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Availability over one hour">${bands}<line x1="4" x2="${W - 4}" y1="${y(0.99)}" y2="${y(0.99)}" stroke="var(--ok)" stroke-dasharray="3 3" opacity=".7"/><path d="${series.map((s, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(s.ok).toFixed(1)).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2"/></svg>`;
  }
  function collapseResultHtml(r) {
    if (r.error) return `<div class="chip bad">${esc(r.error)}</div>`;
    const cls = r.verdict === "Survived" ? "ok" : r.verdict === "Degraded" ? "warn" : "bad";
    return `<div class="chip ${cls}"><b>${r.verdict}</b>: lowest availability ${pctS(r.minAvail)}, ${pctS(r.avgDuring)} while the failures lasted.${r.collapseMin != null ? ` Collapsed at minute ${r.collapseMin.toFixed(1)}.` : ""}</div>${availChart(r.series, r.events)}
      <div class="chip">${r.recovered ? `Recovered ${r.recoveryMin != null ? (r.recoveryMin === 0 ? "immediately" : `${r.recoveryMin.toFixed(1)} min`) : ""} after the failures ended.` : "<b>Never recovered.</b> The system stayed broken after the failures ended (a metastable failure, often a retry storm)."}</div>
      ${r.worstNodes.length ? `<div class="chip warn">Worst hit: ${r.worstNodes.slice(0, 5).map((n) => esc(n.name) + (n.down ? " (down)" : ` (${Math.round(n.util * 100)}% busy)`)).join(", ")}</div>` : ""}
      ${r.dataLost > 0 ? `<div class="chip bad">About ${num(r.dataLost)} writes were lost on failover.</div>` : ""}${r.maxDelayMin > 1 ? `<div class="chip warn">Queued work waited up to ${r.maxDelayMin.toFixed(1)} min.</div>` : ""}${r.staleMax > 0.05 ? `<div class="chip warn">Up to ${(r.staleMax * 100).toFixed(0)}% of reads were stale.</div>` : ""}`;
  }
  function renderCollapse() { renderCollapse0(); collapsifyDom($("#tab-collapse"), "collapse"); }
  function renderCollapse0() {
    const el = $("#tab-collapse");
    let h = `<p class="muted">Try to break your design on purpose. Add any failures, choose when they start and how long they last, and see whether it survives and recovers.</p>
      <h3>Failures to inject</h3>${cfaults.map(faultRow).join("")}
      <div class="btnrow"><button data-cfadd="1">+ Add a failure</button><button class="primary-sm" data-cfrun="1">▶ Run the collapse test</button></div>`;
    if (cresult) h += `<h3 style="margin-top:14px">Result</h3>` + collapseResultHtml(cresult);
    h += `<h3 style="margin-top:16px">Find the weak points automatically</h3><p class="muted">Tries every single failure this design can suffer (each component dying or slowing, a zone or region lost, surges, partitions) and the worst pairs, and ranks them.</p>
      <div class="btnrow"><button class="primary-sm" data-chunt="1">🔎 Find my weak points</button></div>`;
    if (chunt) {
      h += `<div class="mscore" style="margin-top:10px"><span class="big">${chunt.resistance}<small>/100</small></span><div><b>Collapse resistance</b><div class="muted">${chunt.survivedCount} of ${chunt.results.length} single failures survived, ${chunt.tested} scenarios tested</div></div></div>`;
      h += `<ul class="mcrit">${chunt.results.slice(0, 8).map((r, i) => `<li class="${r.verdict === "Survived" && r.recovered ? "ok" : "bad"}"><b>${r.verdict === "Survived" && r.recovered ? "✓" : "✗"}</b> ${esc(r.label)} <span class="muted">${r.verdict}, min ${pctS(r.minAvail)}${r.recovered ? "" : ", never recovered"}</span> <button class="linkbtn" data-chload="${i}">replay</button></li>`).join("")}</ul>`;
      if (chunt.pairs.length) h += `<h3>Worst combinations</h3><ul class="mcrit">${chunt.pairs.slice(0, 3).map((r, i) => `<li class="${r.avgDuring >= 0.9 && r.recovered ? "ok" : "bad"}"><b>${r.avgDuring >= 0.9 && r.recovered ? "✓" : "✗"}</b> ${esc(r.label)} <span class="muted">${r.verdict}, min ${pctS(r.minAvail)}</span> <button class="linkbtn" data-chloadp="${i}">replay</button></li>`).join("")}</ul>`;
    }
    el.innerHTML = h;
  }
  function runCollapse() { const r = CL.run(S, graphForSim(), doc.scenario, cfaults.map((f) => Object.assign({}, f, { target: f.target || defaultTarget(f.type) }))); cresult = r; renderCollapse(); }
  function defaultTarget(type) { const def = CL.BY_TYPE[type]; if (!def) return ""; if (def.target === "node") return (nodeChoices()[0] || {}).id || ""; if (def.target === "region") return usedRegions()[0] || regionList()[0].id; return ""; }
  function huntCollapse() {
    chunt = CL.hunt(S, graphForSim(), doc.scenario); cresult = null;
    record("collapse", doc.name || "Untitled design", chunt.resistance, 0, chunt.results.length ? Math.round(chunt.results[0].cost) : 0);
    renderCollapse();
  }

  function renderBoard() { renderBoard0(); collapsifyDom($("#tab-board"), "board"); }
  function renderBoard0() {
    const el = $("#tab-board"), tbl = (kind, key, title) => {
      const rows = BD.ranking(lb, kind, key).slice(0, 6);
      return `<div class="mission"><div class="mhead"><b>${esc(title)}</b><span class="muted">${BD.history(lb, kind, key).length} runs</span></div><table class="live">${rows.map((r, i) => `<tr class="${r.player === lb.player ? "me" : ""}"><td>${i + 1}</td><td>${esc(r.player)}</td><td><b>${r.score}</b>/100</td><td>${kind === "mission" ? "★".repeat(r.stars) + "☆".repeat(3 - r.stars) : ""}</td><td>${kind === "mission" ? money(r.cost) : ""}</td></tr>`).join("")}</table></div>`;
    };
    const mk = BD.keys(lb, "mission"), ck = BD.keys(lb, "collapse");
    let h = `<p class="muted">Your best scores, and anyone's you import. Saved on this device${memoryOn ? (boardSyncOk ? " and in YashAI memory" : " (YashAI memory not reachable right now)") : ""}. Ranked by score, then by the lower monthly cost.</p>
      <div class="field"><label>Player name</label><input type="text" data-bname="1" value="${esc(lb.player)}" maxlength="30"></div>`;
    h += `<h3>Missions</h3>` + (mk.length ? mk.map((k) => tbl("mission", k, (MISSIONS.find((m) => m.id === k) || { title: k }).title)).join("") : `<p class="muted">Run a mission test to get on the lb.</p>`);
    h += `<h3>Collapse resistance</h3>` + (ck.length ? ck.map((k) => tbl("collapse", k, k)).join("") : `<p class="muted">Use "Find my weak points" in the Collapse tab to get a resistance score.</p>`);
    h += `<h3>Compare with someone</h3><div class="btnrow"><button data-bcopy="1">Copy my share code</button></div><textarea id="bcode" rows="3" placeholder="Paste a share code here" style="width:100%;margin-top:8px"></textarea><div class="btnrow"><button data-bimport="1">Import their scores</button></div>${boardMsg ? `<div class="chip">${esc(boardMsg)}</div>` : ""}`;
    el.innerHTML = h;
  }

  // ---------------------------------------------------------------- product missions
  const MISSIONS = window.LabMissions.MISSIONS, MKEY = "archlab.missions.v1";
  let mprog = {}; try { mprog = JSON.parse(localStorage.getItem(MKEY)) || {}; } catch (e) { mprog = {}; }
  let mresult = null, mhints = 0;
  const saveM = () => { try { localStorage.setItem(MKEY, JSON.stringify(mprog)); } catch (e) { /* ignore */ } };
  const activeMission = () => MISSIONS.find((m) => m.id === doc.mission) || null;
  function startMission(m) {
    if (doc.nodes.length > 4 && !window.confirm("Replace the board with this mission's starter design? Your current design is kept in Undo.")) return;
    const st = JSON.parse(JSON.stringify(m.starter()));
    doc = { name: m.title, nodes: st.nodes, edges: st.edges, scenario: Object.assign({}, S.DEFAULT_SCENARIO, m.scenario), slo: { p95: m.slo.p95, avail: m.slo.avail, budget: m.slo.budget }, mission: m.id };
    mresult = null; mhints = 0; sel = { node: null, edge: null }; sim = null; running = false; clearInterval(timer); lastRec = null; chaos = {}; down = {}; chaosCache = null;
    $("#title").value = doc.name; commit(false); paintButtons(); showBanner(""); render(); fitView(); kpis(); paintChaos();
  }
  function runMission() {
    const m = activeMission(); if (!m) return;
    const r = window.LabMissions.evaluate(S, graphForSim(), m); if (r.error) { mresult = { error: r.error }; renderMissions(); return; }
    mresult = r; const p = mprog[m.id] || { best: 0, stars: 0, attempts: 0 }; p.attempts += 1; if (r.score > p.best) p.best = r.score; if (r.stars > p.stars) p.stars = r.stars; mprog[m.id] = p; saveM(); record("mission", m.id, r.score, r.stars, r.R.all.cost); renderMissions();
  }
  const pctS = (x) => (x * 100).toFixed(2) + "%";
  // ---- interview practice: classic questions, checked against your drawing, plus a cheat sheet
  const IV = window.LabInterview, IKEY = "archlab.interview.v1";
  let iprog = {}; try { iprog = JSON.parse(localStorage.getItem(IKEY)) || {}; } catch (e) { iprog = {}; }
  const saveI = () => { try { localStorage.setItem(IKEY, JSON.stringify(iprog)); } catch (e) { /* ignore */ } };
  let iview = "list", ires = null, ihints = 0, iquery = "", iopen = {};
  const activeQ = () => IV.QUESTIONS.find((x) => x.id === (doc.interview || "")) || null;
  const refOf = (qn) => IV.reference(S, window.LabExamples, window.LabPresets.PRESETS, qn);
  function startInterview(qn) {
    if (doc.nodes.length > 4 && !window.confirm("Replace the board with a blank starting design for this question? Your current design is kept in Undo.")) return;
    const ref = refOf(qn), st = { nodes: [{ id: "c", type: "browser", x: 80, y: 240, props: S.defaultProps(S.BY_ID.browser) }, { id: "a", type: "app", x: 350, y: 240, props: S.defaultProps(S.BY_ID.app) }, { id: "d", type: "sql", x: 620, y: 240, props: S.defaultProps(S.BY_ID.sql) }], edges: [{ from: "c", to: "a", w: 1 }, { from: "a", to: "d", w: 1 }] };
    doc = { name: qn.title, nodes: st.nodes, edges: st.edges, scenario: Object.assign({}, S.DEFAULT_SCENARIO, ref.scenario), slo: { p95: ref.slo.p95, avail: ref.slo.avail, budget: ref.slo.budget }, interview: qn.id };
    ires = null; ihints = 0; iopen = {}; sel = { node: null, edge: null }; sim = null; running = false; clearInterval(timer); lastRec = null; chaos = {}; down = {}; chaosCache = null;
    $("#title").value = doc.name; commit(false); paintButtons(); showBanner(""); render(); fitView(); kpis(); paintChaos();
  }
  function showStrongAnswer(qn) {
    if (!window.confirm("Open a strong reference design on the board? Yours stays in Undo. Try the question yourself first if you can.")) return;
    const ref = refOf(qn), d = JSON.parse(JSON.stringify(ref.graph));
    doc = { name: qn.title + " (reference)", nodes: d.nodes, edges: d.edges, scenario: Object.assign({}, S.DEFAULT_SCENARIO, ref.scenario), slo: { p95: ref.slo.p95, avail: ref.slo.avail, budget: ref.slo.budget }, interview: qn.id };
    sim = null; running = false; clearInterval(timer); lastRec = null; chaos = {}; down = {}; chaosCache = null; $("#title").value = doc.name; commit(false); paintButtons(); render(); fitView(); kpis(); paintChaos();
  }
  function checkInterview() {
    const qn = activeQ(); if (!qn) return; const ref = refOf(qn);
    const r = IV.evaluate(S, window.LabCollapse, graphForSim(), qn, ref); if (r.error) { ires = { error: r.error }; return renderInterview(); }
    ires = r; const p = iprog[qn.id] || { best: 0, attempts: 0 }; p.attempts += 1; if (r.score > p.best) p.best = r.score; iprog[qn.id] = p; saveI(); renderInterview();
  }

  // ---- low-level design: class diagram, Java solution, patterns and follow-ups in a dialog
  const LL = window.LabLLD;
  let lldTab = "diagram", lldId = "";
  function classBox(c, x, y, w) {
    const head = c.kind === "class" ? "" : c.kind === "abstract" ? "«abstract»" : c.kind === "interface" ? "«interface»" : "«enum»";
    const rows = [...c.fields.map((f) => ({ t: f, m: false })), ...c.methods.map((m) => ({ t: m, m: true }))];
    const h = 26 + (head ? 12 : 0) + (rows.length ? rows.length * 15 + 8 : 6);
    return { name: c.name, x, y, w, h, head, rows, kind: c.kind };
  }
  function classSvg(item) {
    const cls = LL.parseClasses(item.classes), W = 210, GX = 56, GY = 52, MAXROW = 4;
    // layered layout: parents above children, owners above the things they own
    const rank = {}; cls.forEach((c) => { rank[c.name] = 0; });
    const above = item.rels.map((r) => (r[2] === "extends" || r[2] === "implements" ? [r[1], r[0]] : [r[0], r[1]]));
    for (let pass = 0; pass < cls.length; pass++) { let moved = false; above.forEach(([u, v]) => { if (rank[v] <= rank[u] && rank[u] + 1 < cls.length) { rank[v] = rank[u] + 1; moved = true; } }); if (!moved) break; }
    const rows = []; cls.forEach((c) => { (rows[rank[c.name]] = rows[rank[c.name]] || []).push(c); });
    const grid = []; rows.filter(Boolean).forEach((r) => { for (let i = 0; i < r.length; i += MAXROW) grid.push(r.slice(i, i + MAXROW)); });
    const widest = Math.max(...grid.map((r) => r.length)), boxes = []; let y = 16;
    grid.forEach((r) => { const bs = r.map((c) => classBox(c, 0, y, W)), rh = Math.max(...bs.map((b) => b.h)), rowW = r.length * W + (r.length - 1) * GX, x0 = 20 + ((widest * W + (widest - 1) * GX) - rowW) / 2; bs.forEach((b, i) => { b.x = x0 + i * (W + GX); b.y = y + (rh - b.h) / 2; boxes.push(b); }); y += rh + GY; });
    const colY = [y - GY + 26], cols = widest;
    const by = {}; boxes.forEach((b) => { by[b.name] = b; });
    const W_ = 40 + cols * W + (cols - 1) * GX, H_ = Math.max(...colY) + 10;
    const clip = (a, b) => { const cx = a.x + a.w / 2, cy = a.y + a.h / 2, tx = b.x + b.w / 2, ty = b.y + b.h / 2, dx = tx - cx, dy = ty - cy; const sx = dx === 0 ? Infinity : (a.w / 2) / Math.abs(dx), sy = dy === 0 ? Infinity : (a.h / 2) / Math.abs(dy), s = Math.min(sx, sy); return { x: cx + dx * s, y: cy + dy * s }; };
    const lines = item.rels.map((r) => {
      const a = by[r[0]], b = by[r[1]]; if (!a || !b) return ""; const p1 = clip(a, b), p2 = clip(b, a), dash = r[2] === "implements" ? ' stroke-dasharray="6 4"' : "";
      const mk = r[2] === "extends" || r[2] === "implements" ? "url(#tri)" : r[2] === "uses" ? "url(#arr)" : "";
      const dia = r[2] === "has" ? "url(#dia)" : "";
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="var(--muted)" stroke-width="1.6"${dash} ${r[2] === "has" ? `marker-start="${dia}"` : `marker-end="${mk}"`}/>${r[3] ? `<text x="${mx}" y="${my - 4}" font-size="10.5" fill="var(--muted)" text-anchor="middle">${esc(r[3])}</text>` : ""}`;
    }).join("");
    const bx = boxes.map((b) => `<g><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="var(--card)" stroke="${b.kind === "interface" ? "#7C3AED" : b.kind === "abstract" ? "#0a78d4" : b.kind === "enum" ? "#16a34a" : "var(--ink, #333)"}" stroke-width="1.6"/>${b.head ? `<text x="${b.x + b.w / 2}" y="${b.y + 14}" font-size="10" text-anchor="middle" fill="var(--muted)">${b.head}</text>` : ""}<text x="${b.x + b.w / 2}" y="${b.y + (b.head ? 27 : 19)}" font-size="13" font-weight="700" text-anchor="middle" fill="currentColor" ${b.kind === "abstract" || b.kind === "interface" ? 'font-style="italic"' : ""}>${esc(b.name)}</text>${b.rows.length ? `<line x1="${b.x}" x2="${b.x + b.w}" y1="${b.y + (b.head ? 33 : 26)}" y2="${b.y + (b.head ? 33 : 26)}" stroke="var(--line)"/>` : ""}${b.rows.map((r, i) => `<text x="${b.x + 10}" y="${b.y + (b.head ? 47 : 40) + i * 15}" font-size="11" fill="${r.m ? "currentColor" : "var(--muted)"}" font-family="ui-monospace,Consolas,monospace">${esc(r.t.length > 30 ? r.t.slice(0, 29) + "…" : r.t)}${r.m && !/\)$/.test(r.t) && !/\(/.test(r.t) ? "()" : ""}</text>`).join("")}</g>`).join("");
    return `<svg viewBox="0 0 ${W_} ${H_}" style="width:100%;height:auto;max-height:66vh" role="img" aria-label="Class diagram"><defs><marker id="tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto"><path d="M1 1 L11 6 L1 11 Z" fill="var(--card)" stroke="var(--muted)"/></marker><marker id="arr" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="var(--muted)" stroke-width="1.6"/></marker><marker id="dia" viewBox="0 0 16 12" refX="1" refY="6" markerWidth="15" markerHeight="11" orient="auto"><path d="M1 6 L8 1 L15 6 L8 11 Z" fill="var(--muted)"/></marker></defs>${lines}${bx}</svg>
      <p class="muted" style="font-size:11.5px">Hollow triangle: extends (dashed: implements). Filled diamond: owns many or one. Arrow: uses.</p>`;
  }
  function lldDialog() {
    const it = LL.ITEMS.find((x) => x.id === lldId), dlg = $("#lld"); if (!it) { dlg.hidden = true; return; }
    const done = (iprog["lld:" + it.id] || {}).look || [];
    const isP = it.kind === "pattern", tabs = [["diagram", isP ? "Structure" : "Class diagram"], ["code", "Java code"], ["notes", isP ? "Seen in, follow-ups, trade-offs" : "Patterns & follow-ups"]];
    let body = "";
    if (lldTab === "diagram") body = `<h3>${isP ? "When to use it" : it.kind === "blueprint" ? "How it is built" : "Requirements"}</h3><ul class="mlist">${it.func.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` + classSvg(it);
    else if (lldTab === "code") body = `<div class="btnrow"><button data-lcopy="1">Copy Java</button></div><pre class="code">${esc(it.code)}</pre><p class="muted">This compiles and runs as one file (Main.java, Java 17 or newer). Read the classes first, then main() to see the flow.</p>`;
    else body = `<h3>${isP ? "Where you have seen it" : it.kind === "blueprint" ? "Patterns in this design" : "Patterns to name"}</h3>${it.patterns.map((p) => `<div class="follow"><b>${esc(p[0])}</b><p>${esc(p[1])}</p></div>`).join("")}<h3>Follow-up questions</h3>${it.follow.map((f, i) => `<div class="follow"><b>${esc(f.q)}</b>${(iopen["l" + it.id + i]) ? `<p>${esc(f.a)}</p>` : `<div><button class="primary-sm" data-lfollow="${i}">Show model answer</button></div>`}</div>`).join("")}${isP ? `<h3>Trade-offs</h3><ul class="mlist">${it.look.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<h3>What interviewers look for</h3><ul class="mcrit">${it.look.map((x, i) => `<li><label><input type="checkbox" data-llook="${i}" ${done.includes(i) ? "checked" : ""}> ${esc(x)}</label></li>`).join("")}</ul><p class="muted">Tick what your own answer covered.</p>`}`;
    dlg.innerHTML = `<div class="lld-card"><div class="lld-head"><b>${esc(it.title)}</b><button data-lclose="1" aria-label="Close">✕</button></div><p class="muted">“${esc(it.ask)}”</p><div class="btnrow">${tabs.map(([v, t]) => `<button data-ltab="${v}" aria-pressed="${lldTab === v}">${t}</button>`).join("")}</div><div class="lld-body">${body}</div></div>`; dlg.hidden = false;
  }
  const lldDlg = document.createElement("div"); lldDlg.id = "lld"; lldDlg.hidden = true; document.body.appendChild(lldDlg);
  // ---- blueprint: the high-level design and the low-level design of a full platform, next to its diagram
  const PLAT = window.LabPlatforms || { BLUEPRINTS: {}, PLATFORMS: [] };
  function focusNode(id) {
    const n = node(id); if (!n) return; sel = { node: id, edge: null }; const r = $("#board").getBoundingClientRect();
    view.x = r.width / 2 - n.x * view.z; view.y = r.height / 2 - n.y * view.z; render(); tab = "inspect"; updSide();
  }
  function openBlueprintLld(id) { const it = LL.ITEMS.find((x) => x.id === id); if (!it) return; lldId = id; lldTab = "diagram"; lldDialog(); }
  function renderBlueprint() { renderBlueprint0(); collapsifyDom($("#tab-blueprint"), "blueprint"); }
  function renderBlueprint0() {
    const el = $("#tab-blueprint"), bp = PLAT.BLUEPRINTS[doc.blueprint];
    if (!bp) {
      el.innerHTML = `<h3>Blueprint</h3><p class="muted">A blueprint explains a full architecture: the services and what each owns, how they talk (calls and events), central sign-in, the audit trail, the design patterns used and where, the build and deploy pipeline, and the class-level design of the core service. Open one of these platforms to see it next to its diagram:</p>` +
        PLAT.PLATFORMS.map((p) => `<div class="mission"><div class="mhead"><b>${esc(p.name)}</b><span class="chip">${esc(PLAT.CLOUD[p.cloud].label)}</span></div><p class="muted">${esc(p.summary)}</p><div class="mrow"><span class="muted">${p.services.length} Java services</span><button class="primary-sm" data-bpopen="${p.id}">Open</button></div></div>`).join("");
      return;
    }
    const li = (a) => `<ul class="mlist">${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    el.innerHTML = `<div class="mhead"><b>${esc(bp.name)}</b><span class="chip">${esc(bp.cloud)}</span></div><p>${esc(bp.summary)}</p>
      <div class="btnrow"><button class="primary-sm" data-bplld="${esc(bp.lld)}">Open class design (LLD) and Java</button><button data-bpleave="1">Close blueprint</button></div>
      <h3>Services and what each owns</h3><p class="muted">Click a service to find it on the board.</p>` +
      bp.services.map((s) => `<div class="altrow"><div class="althead"><b>${esc(s.label)}</b><button class="pchip" data-bpfocus="${s.id}">Show</button></div><div class="muted">${esc(s.resp)}</div><div class="muted"><i>Data:</i> ${esc(s.data)}</div>${s.patterns.length ? `<div>${s.patterns.map((p) => `<span class="pchip static">${esc(p)}</span>`).join(" ")}</div>` : ""}</div>`).join("") +
      `<h3>How services talk: direct calls</h3>` + bp.sync.map((c) => `<div class="follow"><b>${esc(c.from)} → ${esc(c.to)}</b> <span class="chip">${esc(c.how)}</span><p>${esc(c.why)}</p></div>`).join("") +
      `<h3>How services talk: events</h3>` + bp.async.map((c) => `<div class="follow"><b>${esc(c.topic)}</b><p>${esc(c.from)} publishes; ${esc(c.to.join(", "))} consume${c.to.length > 1 ? "" : "s"}. ${esc(c.why)}.</p></div>`).join("") +
      `<h3>Central sign-in and authorisation</h3>${li(bp.auth)}<h3>Audit communication</h3>${li(bp.audit)}` +
      `<h3>Design patterns used, and where</h3>` + bp.patterns.map((p) => `<div class="follow"><b>${esc(p.name)}</b><p>${esc(p.where.join(", "))}</p></div>`).join("") +
      `<h3>Security</h3>${li(bp.security)}<h3>Build and deploy</h3>${li(bp.deploy)}<h3>Observability</h3>${li(bp.observability)}<h3>Trade-offs</h3>${li(bp.tradeoffs)}<h3>How to present this in an interview</h3><ol class="mlist">${bp.talk.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
  }
  function bindSearch() { const n = $("#iq"); if (n) n.oninput = () => { iquery = n.value; const pos = n.selectionStart; renderInterview(); const m = $("#iq"); m.focus(); m.setSelectionRange(pos, pos); }; }
  function renderInterview() { renderInterview0(); collapsifyDom($("#tab-interview"), "interview"); }
  function renderInterview0() {
    const el = $("#tab-interview"), qn = activeQ();
    const nav = `<div class="btnrow"><button data-iview="list" aria-pressed="${iview === "list"}">Questions</button><button data-iview="lld" aria-pressed="${iview === "lld"}">Class design (LLD)</button><button data-iview="patterns" aria-pressed="${iview === "patterns"}">Design patterns</button><button data-iview="cheat" aria-pressed="${iview === "cheat"}">Cheat sheet</button></div>`;
    if (iview === "cheat") {
      const cq = iquery.toLowerCase(), groups = [...new Set(IV.CHEAT.map((c) => c[0]))];
      el.innerHTML = nav + `<h3>Concepts interviews ask about</h3><input class="search" id="iq" placeholder="Search ${IV.CHEAT.length} concepts…" value="${esc(iquery)}" aria-label="Search concepts">` + groups.map((g) => { const items = IV.CHEAT.filter((c) => c[0] === g && (!cq || (c[1] + c[2] + g).toLowerCase().includes(cq))); return items.length ? `<details class="sec" ${cq ? "open" : ""}><summary>${esc(g)} <span class="count">${items.length}</span></summary><div class="secbody">${items.map((c) => `<div class="cheat"><b>${esc(c[1])}</b><p>${esc(c[2])}</p></div>`).join("")}</div></details>` : ""; }).join("");
      return bindSearch();
    }
    if (iview === "patterns") {
      const cq = iquery.toLowerCase(), pats = LL.ITEMS.filter((x) => x.kind === "pattern"), groups = [...new Set(pats.map((x) => x.group))];
      el.innerHTML = nav + `<h3>Design patterns in Java</h3><p class="muted">${pats.length} patterns interviewers and real projects use: the classic Gang of Four ones, plus enterprise, cloud and security patterns (circuit breaker, saga, outbox, CQRS, audit trail, RBAC, JWT). Each has a diagram, Java that compiles and runs, where you have seen it, follow-ups and trade-offs.</p><input class="search" id="iq" placeholder="Search ${pats.length} patterns…" value="${esc(iquery)}" aria-label="Search patterns">` +
        (groups.map((g) => { const items = pats.filter((x) => x.group === g && (!cq || (x.title + x.ask + g).toLowerCase().includes(cq))); return items.length ? `<details class="sec" ${cq ? "open" : ""}><summary>${esc(g)} <span class="count">${items.length}</span></summary><div class="secbody">${items.map((x) => `<div class="mission"><div class="mhead"><b>${esc(x.title)}</b></div><p class="muted">${esc(x.ask)}</p><div class="mrow"><span class="muted">${x.classes.length} classes</span><button class="primary-sm" data-lopen="${x.id}">Open</button></div></div>`).join("")}</div></details>` : ""; }).join("") || "<p class='muted'>Nothing matches.</p>");
      return bindSearch();
    }
    if (iview === "lld") {
      const cq = iquery.toLowerCase(), items = LL.ITEMS.filter((x) => !x.kind && (!cq || (x.title + x.ask).toLowerCase().includes(cq)));
      el.innerHTML = nav + `<h3>Low-level design (class design)</h3><p class="muted">The other kind of design interview: not servers, but classes. Each question has requirements, a class diagram, Java code that compiles and runs, the patterns to name, follow-up questions, and what interviewers look for.</p><input class="search" id="iq" placeholder="Search ${LL.ITEMS.length} questions…" value="${esc(iquery)}" aria-label="Search questions">` + (items.map((x) => { const p = iprog["lld:" + x.id] || {}, n = (p.look || []).length; return `<div class="mission"><div class="mhead"><b>${esc(x.title)}</b>${n ? `<span class="chip ${n >= x.look.length ? "ok" : ""}">${n}/${x.look.length}</span>` : ""}</div><p class="muted">${esc(x.ask)}</p><div class="mrow"><span class="muted">${x.classes.length} classes · ${x.patterns.map((q) => q[0]).slice(0, 2).join(", ")}</span><button class="primary-sm" data-lopen="${x.id}">Open</button></div></div>`; }).join("") || "<p class='muted'>Nothing matches.</p>");
      return bindSearch();
    }
    if (!qn) {
      const cq = iquery.toLowerCase(), cats = [...new Set(IV.QUESTIONS.map((x) => x.cat))], done = IV.QUESTIONS.filter((x) => iprog[x.id] && iprog[x.id].best >= 75).length;
      el.innerHTML = nav + `<h3>System design interview practice</h3><p class="muted">${IV.QUESTIONS.length} classic questions. Read the ask, draw your answer on the board, then check it: the lab scores what you drew (what a strong answer mentions, your goals under load, and a failure test). Open a strong reference design afterwards. ${done ? `<b>${done}</b> answered well so far.` : ""}</p>
        <div class="chip">How to answer: 1 clarify requirements · 2 estimate the load · 3 draw the design · 4 dive into the hard part · 5 talk about bottlenecks and failures</div>
        <input class="search" id="iq" placeholder="Search ${IV.QUESTIONS.length} questions…" value="${esc(iquery)}" aria-label="Search questions">` +
        (cats.map((c) => { const items = IV.QUESTIONS.filter((x) => x.cat === c && (!cq || (x.title + x.ask + c).toLowerCase().includes(cq))); return items.length ? `<details class="sec" ${cq ? "open" : ""}><summary>${esc(c)} <span class="count">${items.length}</span></summary><div class="secbody">${items.map((x) => { const p = iprog[x.id] || {}; return `<div class="mission"><div class="mhead"><b>${esc(x.title)}</b>${p.best != null ? `<span class="chip ${p.best >= 75 ? "ok" : ""}">${p.best}/100</span>` : ""}</div><p class="muted">${esc(x.ask)}</p><div class="mrow"><span class="muted">${p.attempts ? p.attempts + " attempt" + (p.attempts > 1 ? "s" : "") : "Not tried yet"}</span><button class="primary-sm" data-istart="${x.id}">${p.attempts ? "Again" : "Start"}</button></div></div>`; }).join("")}</div></details>` : ""; }).join("") || "<p class='muted'>Nothing matches.</p>");
      return bindSearch();
    }
    const e = IV.estimate(qn), ref = refOf(qn), scaled = ref.scenario.base, real = e.peakQps, ratio = real / Math.max(1, scaled), L = qn.load;
    let h = nav + `<div class="mhead"><b>${esc(qn.title)}</b><span class="chip">${esc(qn.cat)}</span></div>
      <h3>The interviewer asks</h3><p><i>“${esc(qn.ask)}”</i></p>
      <h3>Requirements to confirm</h3><p class="muted"><b>Functional</b></p><ul class="mlist">${qn.func.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="muted"><b>Non-functional</b></p><ul class="mlist">${qn.nonfunc.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>Back-of-envelope</h3><table class="est"><tr><td>Daily active users</td><td>${IV.fmt(L.users)}</td></tr><tr><td>Reads / writes per user per day</td><td>${L.reads} / ${L.writes}</td></tr><tr><td>Requests per day</td><td>${IV.fmt(e.dailyRequests)}</td></tr><tr><td>Average requests / second</td><td>${IV.fmt(e.avgQps)}</td></tr><tr><td>Peak (×${L.peakX})</td><td>${IV.fmt(e.peakQps)} / s</td></tr><tr><td>Writes / second (avg)</td><td>${IV.fmt(e.writeQps)}</td></tr><tr><td>Storage per year</td><td>${IV.bytes(e.storagePerYear)}</td></tr><tr><td>Storage over ${L.years} years</td><td>${IV.bytes(e.storageTotal)}</td></tr><tr><td>Peak bandwidth</td><td>${IV.bytes(e.peakBandwidth)}/s</td></tr></table>
      <p class="muted">The board simulates a scaled model of ${num(scaled)} requests per second${ratio > 1.5 || ratio < 0.67 ? ` (the real peak is about ${IV.fmt(real)})` : ""}. Goals: p95 ≤ ${ref.slo.p95} ms, availability ≥ ${ref.slo.avail}%, budget ≤ ${money(ref.slo.budget)} a month.</p>
      <div class="btnrow"><button class="primary-sm" data-icheck="1">✔ Check my design</button><button data-ihint="1" ${ihints >= qn.concepts.length ? "disabled" : ""}>💡 Hint ${ihints}/${qn.concepts.length}</button><button data-iref="1">Show a strong answer</button><button data-ileave="1">Leave question</button></div>`;
    if (ihints) h += qn.concepts.slice(0, ihints).map((c, i) => `<div class="chip">Hint ${i + 1}: think about ${esc(c.label.toLowerCase())}.</div>`).join("");
    if (ires && ires.error) h += `<div class="chip bad">${esc(ires.error)}</div>`;
    else if (ires) {
      const r = ires;
      h += `<h3 style="margin-top:14px">Result</h3><div class="mscore"><span class="big">${r.score}<small>/100</small></span><div><b>${esc(r.verdict)}</b><div class="muted">${"★".repeat(r.stars)}${"☆".repeat(3 - r.stars)}</div></div></div>
        <h3>A strong answer mentions</h3><ul class="mcrit">${r.checks.map((c) => `<li class="${c.pass ? "ok" : "bad"}"><b>${c.pass ? "✓" : "✗"}</b> ${esc(c.label)}<div class="muted">${esc(c.why)}</div></li>`).join("")}</ul>
        <ul class="mcrit"><li class="${r.goals.okAvail ? "ok" : "bad"}"><b>${r.goals.okAvail ? "✓" : "✗"}</b> Availability ${pctS(r.goals.availability)} <span class="muted">(goal ${r.goals.goals.avail}%)</span></li><li class="${r.goals.okLat ? "ok" : "bad"}"><b>${r.goals.okLat ? "✓" : "✗"}</b> p95 ${Math.round(r.goals.p95)} ms <span class="muted">(goal ${r.goals.goals.p95})</span></li><li class="${r.goals.okCost ? "ok" : "bad"}"><b>${r.goals.okCost ? "✓" : "✗"}</b> Cost ${money(r.goals.cost)} <span class="muted">(budget ${money(r.goals.goals.budget)})</span></li>
        <li class="${r.incident.points >= 20 ? "ok" : "bad"}"><b>${r.incident.points >= 20 ? "✓" : "✗"}</b> Failure test: ${esc(r.incident.label)} <span class="muted">${pctS(r.incident.avail)} served, ${r.incident.recovered ? "recovered" : "did not recover"}</span></li></ul>`;
    }
    h += `<h3>Follow-up questions</h3><p class="muted">Interviewers push on the hard parts. Answer out loud, then open the model answer.</p>` + qn.follow.map((f, i) => `<div class="follow"><b>${esc(f.q)}</b>${iopen[i] ? `<p>${esc(f.a)}</p>` : `<div><button class="primary-sm" data-ifollow="${i}">Show model answer</button></div>`}</div>`).join("");
    el.innerHTML = h;
  }

  function missionReport() {
    const m = activeMission(), r = mresult; if (!m || !r || r.error) return "";
    return [`# Mission report: ${m.title}`, "", `Score ${r.score}/100 (${r.verdict}), ${r.stars} of 3 stars. Monthly cost ${money(r.R.all.cost)} against a budget of ${money(m.slo.budget)}.`, "", "## Acceptance criteria", "", ...r.criteria.map((c) => `- [${c.pass ? "x" : " "}] ${c.label} (${c.points} points) - ${c.detail}`), "", "## Incidents that happened", "", ...m.incidents.map((i) => `- ${i.label}: ${pctS(r.R.win[i.id].availability)} served, p95 ${Math.round(r.R.win[i.id].p95)} ms`), "", "Numbers are from a teaching model, not a load test."].join("\n");
  }
  function renderMissions() { renderMissions0(); collapsifyDom($("#tab-missions"), "missions"); }
  function renderMissions0() {
    const el = $("#tab-missions"), m = activeMission();
    if (!m) {
      el.innerHTML = `<p class="muted">Real products with real goals. Each mission hides a few incidents: you only find out what goes wrong when you run the test. Build a design that survives all of them and stays inside the budget.</p>` +
        MISSIONS.map((x) => { const p = mprog[x.id] || {}; return `<div class="mission"><div class="mhead"><b>${x.icon} ${esc(x.title)}</b><span class="chip">${esc(x.level)}</span></div><p class="muted">${esc(x.brief)}</p>
          <div class="mrow"><span class="muted">${p.attempts ? `Best ${p.best}/100 · ${"★".repeat(p.stars)}${"☆".repeat(3 - p.stars)}` : "Not tried yet"}</span><button class="primary-sm" data-mstart="${x.id}">${p.attempts ? "Play again" : "Start"}</button></div></div>`; }).join("");
      return;
    }
    let h = `<div class="mhead"><b>${m.icon} ${esc(m.title)}</b><span class="chip">${esc(m.level)}</span></div><p>${esc(m.brief)}</p>
      <h3>You will practise</h3><ul class="mlist">${m.learn.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>Goals</h3><p class="muted">p95 latency ≤ ${m.slo.p95} ms · availability ≥ ${m.slo.avail}% · budget ≤ ${money(m.slo.budget)} a month${m.slo.maxDelay != null ? ` · work waits ≤ ${m.slo.maxDelay} min` : ""}</p>
      <div class="chip warn">${m.incidents.length} incidents are hidden. You will only learn what they were after you run the mission test.</div>
      <div class="btnrow"><button class="primary-sm" data-mrun="1">▶ Run the mission test</button><button data-mhint="1" ${mhints >= 3 ? "disabled" : ""}>💡 Hint ${mhints}/3</button><button data-mreset="1">Restart from the starter</button><button data-mleave="1">Leave mission</button></div>`;
    if (mhints) h += m.hints.slice(0, mhints).map((x, i) => `<div class="chip">Hint ${i + 1}: ${esc(x)}</div>`).join("");
    if (mresult && mresult.error) h += `<div class="chip bad">${esc(mresult.error)}</div>`;
    else if (mresult) {
      const r = mresult;
      h += `<h3 style="margin-top:14px">Result</h3><div class="mscore"><span class="big">${r.score}<small>/100</small></span><div><b>${esc(r.verdict)}</b><div class="muted">${"★".repeat(r.stars)}${"☆".repeat(3 - r.stars)} · cost ${money(r.R.all.cost)}</div></div></div>
        <ul class="mcrit">${r.criteria.map((c) => `<li class="${c.pass ? "ok" : "bad"}"><b>${c.pass ? "✓" : "✗"}</b> ${esc(c.label)} <span class="muted">(${c.points}) ${esc(c.detail)}</span></li>`).join("")}</ul>
        <h3>What happened</h3>${m.incidents.map((i) => `<div class="chip ${r.R.win[i.id].availability >= 0.98 ? "" : "warn"}"><b>${esc(i.label)}</b><br>${pctS(r.R.win[i.id].availability)} served, p95 ${Math.round(r.R.win[i.id].p95)} ms${r.R.win[i.id].maxDelayMin > 0.05 ? `, work waited up to ${r.R.win[i.id].maxDelayMin.toFixed(1)} min` : ""}</div>`).join("")}
        <div class="btnrow"><button data-mreport="1">Copy report</button></div>`;
    }
    el.innerHTML = h;
  }
  function saveExtra() {
    const a = S.run(graphForSim(), doc.scenario, []), b = S.run(graphForSim(), doc.scenario, events());
    const ok = (r) => !r.error && r.summary.p95 <= doc.slo.p95 && r.summary.availability * 100 >= doc.slo.avail && r.summary.cost <= doc.slo.budget;
    const note = window.prompt("Note for this version (optional):", "") || "";
    return { note, brief: buildBrief(), score: a.error ? {} : { p95_ms: Math.round(a.summary.p95), availability_pct: +(a.summary.availability * 100).toFixed(3), monthly_cost: Math.round(a.summary.cost), goals_met_normal: ok(a), goals_met_with_incidents: !b.error && ok(b) } };
  }
  function renderLive() { renderLive0(); collapsifyDom($("#tab-live"), "live"); }
  function renderLive0() {
    const el = $("#tab-live"), rec = lastRec;
    let h = "";
    if (!rec) h += `<p class="muted">Press <b>Start</b> to see each component's load, latency and how busy it is.</p>`;
    else {
      const rows = Object.entries(rec.nodes).map(([id, v]) => ({ id, v, n: node(id) })).filter((x) => x.n && S.BY_ID[x.n.type].cls !== "source").sort((a, b) => b.v.util - a.v.util);
      h += `<table class="live">${rows.map((x) => `<tr><td>${S.BY_ID[x.n.type].icon} ${esc(x.n.props.name || S.BY_ID[x.n.type].name)}</td><td>${num(x.v.load)}/s</td><td><span class="ubar"><i class="${x.v.util > 1 ? "b" : x.v.util > 0.7 ? "w" : ""}" style="width:${clamp(x.v.util, 0, 1) * 100}%"></i></span> ${Math.round(x.v.util * 100)}%</td><td>${x.v.ms ? x.v.ms.toFixed(0) + " ms" : ""}</td></tr>`).join("")}</table>`;
    }
    const chaos = chaosReadiness();
    if (chaos) h += `<h3 style="margin-top:14px">Chaos readiness</h3><div class="chip ${chaos.score >= 80 ? "ok" : chaos.score >= 55 ? "warn" : "bad"}"><b>${chaos.score}/100</b> across ${chaos.events.length || 0} automatic failure drills · p95 ${Math.round(chaos.summary.p95)} ms · availability ${(chaos.summary.availability * 100).toFixed(2)}%</div>`;
    h += `<h3 style="margin-top:14px">Design review</h3>` + (findings().map(([k, t]) => `<div class="chip ${k === "chip" ? "" : k}">${esc(t)}</div>`).join("") || "<p class='muted'>No risks found yet. Run a traffic spike and a failure before trusting the design.</p>");
    if (memoryOn) h += `<h3 style="margin-top:14px">AI design review</h3><p class="muted">A local model explains why the design misses its goals and what to change, using only this simulation's numbers.</p><div class="btnrow"><button data-act="aiReview" ${reviewBusy ? "disabled" : ""}>🧠 ${reviewBusy ? "Reviewing…" : "Review my design"}</button></div>` + (reviewText ? `<div class="chip" style="line-height:1.5">${mdLite(reviewText)}</div>` : "");
    el.innerHTML = h;
  }
  function kpis() {
    const el = $("#kpis"), rec = lastRec, o = doc.slo;
    if (!rec) { el.innerHTML = document.body.classList.contains("studio-shell") ? `<span class="kpi-idle" title="Press Start to see live requests, latency, availability and cost.">Press Start to see live numbers.</span>` : `<div class="kpi"><b>—</b><span>requests/s</span></div><div class="kpi"><b>—</b><span>p95 latency</span></div><div class="kpi"><b>—</b><span>availability</span></div><div class="kpi"><b>—</b><span>cost / month</span></div>`; return; }
    const sm = S.summarize(sim), okAv = sm.availability * 100 >= o.avail;
    const of = (c) => Object.entries(rec.nodes).filter(([id]) => node(id) && S.BY_ID[node(id).type].cls === c).map(([, v]) => v);
    const qs = of("queue"), dbs = of("db"), caches = of("cache"), ai = STU ? STU.aiTokenCost(doc, mult) : null;
    el.innerHTML = `<div class="kpi"><b>${num(rec.rps)}</b><span>requests/s</span></div><div class="kpi ${rec.p95 <= o.p95 ? "ok" : "bad"}"><b>${Math.round(rec.p95)} ms</b><span>p95 now</span></div>` +
      `<div class="kpi ${rec.err * 100 <= 100 - o.avail ? "ok" : "bad"}"><b>${(rec.err * 100).toFixed(2)}%</b><span>errors now</span></div>` +
      `<div class="kpi ${okAv ? "ok" : "bad"}"><b>${(sm.availability * 100).toFixed(2)}%</b><span>availability so far</span></div>` +
      (qs.length ? `<div class="kpi ${rec.delayMin > 1 ? "bad" : ""}"><b>${num(Math.max(...qs.map((v) => v.backlog || 0)))}</b><span>queue depth</span></div>` : "") +
      (dbs.length ? `<div class="kpi ${Math.max(...dbs.map((v) => v.util)) > 1 ? "bad" : ""}"><b>${Math.round(Math.max(...dbs.map((v) => v.util)) * 100)}%</b><span>DB load</span></div>` : "") +
      (caches.length ? `<div class="kpi"><b>${Math.round(caches.reduce((a, v) => a + v.hit, 0) / caches.length * 100)}%</b><span>cache hits</span></div>` : "") +
      `<div class="kpi ${rec.cost + (ai ? ai.monthly : 0) <= o.budget ? "ok" : "bad"}"><b>${money(rec.cost)}</b><span>cloud / month</span></div>` +
      (ai && ai.monthly ? `<div class="kpi" title="${esc(ai.assumptions.join("; "))}"><b>${money(ai.monthly)}</b><span>AI tokens / month</span></div>` : "");
  }
  function zoomLabel() { $("#zoomReset").textContent = Math.round(view.z * 100) + "%"; }

  // ---------------------------------------------------------------- editing
  function addNode(type, x, y) {
    const def = S.BY_ID[type]; const p = S.defaultProps(def); const same = doc.nodes.filter((n) => n.type === type).length; if (same) p.name = def.name + " " + (same + 1);
    const n = { id: uid(), type, x: Math.round(x), y: Math.round(y), props: p }; doc.nodes.push(n); sel = { node: n.id, edge: null }; commit(); return n;
  }
  function connect(a, b) {
    const A = node(a), B = node(b); if (!A || !B || a === b) return;
    const ca = S.BY_ID[A.type].cls, cb = S.BY_ID[B.type].cls;
    if (doc.edges.some((e) => e.from === a && e.to === b)) return say("Already connected.");
    if (cb === "source") return say("Nothing sends traffic to a client.");
    if (S.BY_ID[A.type].tag === "hpa" && cb !== "service") return say("An autoscaler box scales a deployment or service: wire it to one.");
    if (["db", "store", "external"].includes(ca)) return say(`${S.BY_ID[A.type].name} does not send traffic onward.`);
    doc.edges.push({ from: a, to: b, w: 1 }); commit();
  }
  function say(t) { toast = t; showBanner(t, "warn"); setTimeout(() => { if (toast === t) { toast = ""; if (!running) showBanner(""); } }, 2600); }
  function delSel() {
    if (multi.size > 1) return deleteIds([...multi]);
    if (sel.node) { if (node(sel.node) && node(sel.node).props.locked) return say("Locked: unlock it before deleting it."); deleteIds([sel.node]); }
    else if (sel.edge) { doc.edges = doc.edges.filter((e) => !(e.from === sel.edge.from && e.to === sel.edge.to)); sel = { node: null, edge: null }; commit(); }
  }
  const selectionIds = () => (multi.size ? [...multi] : sel.node ? [sel.node] : []);
  function deleteIds(ids) {
    const kill = new Set(ids.filter((id) => node(id) && !node(id).props.locked));
    if (!kill.size) return say("Locked boxes cannot be deleted. Unlock them first.");
    doc.nodes = doc.nodes.filter((n) => !kill.has(n.id)); doc.edges = doc.edges.filter((e) => !kill.has(e.from) && !kill.has(e.to));
    if (doc.groups) doc.groups = doc.groups.map((g) => Object.assign({}, g, { ids: g.ids.filter((id) => !kill.has(id)) })).filter((g) => g.ids.length > 1);
    multi.clear(); sel = { node: null, edge: null }; commit();
    if (kill.size < ids.length) say(`${ids.length - kill.size} locked box${ids.length - kill.size === 1 ? " was" : "es were"} kept.`);
  }
  function duplicateIds(ids) {
    const map = {};
    ids.forEach((id) => { const n = node(id); if (!n) return; const c = JSON.parse(JSON.stringify(n)); c.id = uid(); c.x += 40; c.y += 50; delete c.props.locked; if (ids.length === 1) c.props.name = (n.props.name || S.BY_ID[n.type].name) + " copy"; map[id] = c.id; doc.nodes.push(c); });
    doc.edges.filter((e) => map[e.from] && map[e.to]).forEach((e) => doc.edges.push(Object.assign({}, e, { from: map[e.from], to: map[e.to] })));   // wires inside the selection come along
    const made = Object.values(map); multi = new Set(made.length > 1 ? made : []); sel = { node: made.length === 1 ? made[0] : null, edge: null }; commit();
  }
  function toggleLock(ids) {
    if (!ids.length) return say("Select a box first.");
    const lock = !ids.every((id) => node(id) && node(id).props.locked);
    ids.forEach((id) => { const n = node(id); if (n) { if (lock) n.props.locked = true; else delete n.props.locked; } });
    commit(false); say(lock ? `Locked ${ids.length} box${ids.length === 1 ? "" : "es"}: they cannot be moved or deleted until unlocked.` : "Unlocked.");
  }
  function multiAction(a) {
    const ids = [...multi];
    if (a === "clear") { multi.clear(); return render(); }
    if (a === "delete") return deleteIds(ids);
    if (a === "dup") return duplicateIds(ids);
    if (a === "lock") return toggleLock(ids);
    if (a === "group") { const name = (window.prompt("Name this group (for example: Checkout domain)", "Group " + ((doc.groups || []).length + 1)) || "").trim().slice(0, 40); if (!name) return; doc.groups = (doc.groups || []).filter((g) => !g.ids.some((id) => multi.has(id))).concat([{ id: "g" + Date.now().toString(36), name, ids }]); commit(false); return say(`Grouped ${ids.length} boxes as ${name}. Click the group label to select them together.`); }
    if (a === "ungroup") { doc.groups = (doc.groups || []).filter((g) => !(g.ids.length === ids.length && g.ids.every((id) => multi.has(id)))); commit(false); return say("Group removed; the boxes stay."); }
    if (a === "merge" && STU) { const svcs = ids.filter((id) => S.BY_ID[node(id).type].cls === "service"); fixPreview("Merge into a modular monolith", STU.mergeServices(doc, svcs), "Fewer deployables for a small team: one pipeline, in-process calls between modules, one place to scale. Split a module out again only on a measured trigger."); }
  }
  function resetSimple() { loadPreset(PRESETS.find((p) => p.id === "start")); say("Canvas reset to the simple starter."); }
  function clearCanvas() {
    const blank = fresh(PRESETS.find((p) => p.id === "start"));
    blank.name = "Untitled design"; blank.nodes = []; blank.edges = []; delete blank.blueprint;
    useDocument(blank, true); say("All components were cleared. Undo (Ctrl+Z) brings them back.");
  }
  function fitView() {
    if (!doc.nodes.length) return; const r = $("#board").getBoundingClientRect(); const xs = doc.nodes.map((n) => n.x), ys = doc.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - NW, maxX = Math.max(...xs) + NW, minY = Math.min(...ys) - NH * 1.5, maxY = Math.max(...ys) + NH * 1.5;
    // The reference board reserves a 42px top margin for its label, so the height available to
    // fit the diagram into is that much shorter than the board itself -- using the full board
    // height here under-zoomed just enough that tall diagrams ran past the bottom edge.
    const fitHeight = referenceMode ? r.height - 42 : r.height;
    const rail = $("#studioRail"), inset = !referenceMode && rail && rail.offsetWidth && rail.closest("#stage") ? rail.offsetWidth + 16 : 0, fitWidth = r.width - inset;
    if (document.body.classList.contains("studio-shell")) {
      // room for the level label and minimap on top and the floating toolbar at the bottom
      const top = 64, fitH = Math.max(120, r.height - top - (document.body.classList.contains("has-guide") ? 140 : 84)), fitW = Math.max(120, r.width - 48);   // guide: also keep clear of the warning banner above the toolbar
      view.z = clamp(Math.min(fitW / (maxX - minX), fitH / (maxY - minY)), 0.3, 1.2);
      view.x = (r.width - (maxX + minX) * view.z) / 2; view.y = top + (fitH - (maxY + minY) * view.z) / 2;
      return render();
    }
    view.z = clamp(Math.min(fitWidth / (maxX - minX), fitHeight / (maxY - minY)), 0.3, 1.4);
    view.x = inset + (fitWidth - (maxX + minX) * view.z) / 2;
    // The reference board is deliberately compact: place its diagram just below its label.
    // Other canvases retain space for the floating editing toolbar.
    if (referenceMode) {
      view.y = 42 - minY * view.z;
    } else {
      const desiredTop = 150, bottomSafe = r.height - 72 - maxY * view.z;
      view.y = Math.max(bottomSafe, desiredTop - minY * view.z);
    }
    render();
  }
  function loadPreset(p) { doc = fresh(skill === "beginner" && p.coreBuild ? { build: p.coreBuild } : p); levelPath = [{ level: 1, key: "1", node: null }]; levelCache.clear(); chaosCache = null; $("#title").value = doc.name; sel = { node: null, edge: null }; sim = null; running = false; clearInterval(timer); lastRec = null; chaos = {}; down = {}; snapshot(); persist(); paintButtons(); showBanner(""); render(); fitView(); kpis(); paintChaos(); }   // history kept: Undo returns to the previous design
  function useDocument(next, keepHistory) {
    if (!next || !Array.isArray(next.nodes) || !Array.isArray(next.edges)) throw new Error("That saved project is not a valid Architecture Lab design.");
    doc = next; levelPath = [{ level: 1, key: "1", node: null }]; levelCache.clear(); chaosCache = null; multi.clear(); highlight.clear(); doc.scenario = Object.assign({}, S.DEFAULT_SCENARIO, doc.scenario || {}); doc.slo = doc.slo || { p95: 200, avail: 99.5, budget: 5000 };
    $("#title").value = doc.name || "Untitled design"; sim = null; running = false; clearInterval(timer); lastRec = null; chaos = {}; down = {}; if (!keepHistory) { hist = []; histAt = -1; }
    snapshot(); persist(); paintButtons(); showBanner(""); render(); fitView(); kpis(); paintChaos(); scheduleCost();
  }
  async function memoryApi(path, body) {
    const r = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json", "X-YashAI": "1" } : {}, body: body ? JSON.stringify(body) : undefined });
    // The public static copy has no /api server: a 404 HTML page instead of JSON means "not available here".
    const data = await r.json().catch(() => null);
    if (!data) throw new Error("AI review, AI Architect and saved projects need the local YashAI app. This online copy runs the simulator only.");
    if (!r.ok) throw new Error(data.error || "YashAI memory is unavailable"); return data;
  }
  async function openMemory() {
    const list = $("#memoryList"); list.innerHTML = "<p class='muted'>Loading saved projects…</p>"; $("#memory").showModal();
    try {
      const data = await memoryApi("/api/architecture-lab/projects");
      list.innerHTML = data.projects.length ? data.projects.map((p) => `<button class="memory-project" data-memory-id="${esc(p.id)}"><b>${esc(p.name)}</b><span>${esc(p.saved_at || "Saved locally")} · ${p.nodes} components · ${p.edges} connections</span></button>`).join("") : "<p class='muted'>No shared projects yet. Use File → Save to YashAI memory.</p>";
    } catch (err) { list.innerHTML = `<p class='muted'>${esc(err.message)}</p>`; }
  }

  // ---------------------------------------------------------------- pointer handling
  const board = $("#board");
  board.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-handle]"), nodeEl = e.target.closest("[data-node]"), edgeEl = e.target.closest("[data-edge]");
    if (e.button === 1 || tool === "hand" || spaceDown) { panning = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; board.setAttribute("class", "pan panning"); board.setPointerCapture(e.pointerId); return; }
    if (handle) { const n = node(handle.dataset.handle); linkFrom = n.id; rubber = { x1: n.x + NW / 2, y1: n.y, x2: n.x + NW / 2, y2: n.y }; board.setPointerCapture(e.pointerId); return; }
    if (nodeEl) {
      const n = node(nodeEl.dataset.node);
      if (tool === "connect") { if (linkFrom && linkFrom !== n.id) { connect(linkFrom, n.id); linkFrom = null; } else { linkFrom = n.id; say("Now click the box to connect to."); } deepPart = ""; sel = { node: n.id, edge: null }; render(); return; }
      if (e.shiftKey) { if (sel.node && sel.node !== n.id && !multi.size) multi.add(sel.node); if (multi.has(n.id)) multi.delete(n.id); else multi.add(n.id); sel = { node: null, edge: null }; render(); return; }
      if (!multi.has(n.id)) multi.clear();
      if (n.props.locked && multi.size < 2) { deepPart = ""; sel = { node: n.id, edge: null }; render(); say("Locked: unlock it (L) to move it."); return; }
      const now = Date.now();
      if (aiWorkspace && lastDown.id === n.id && now - lastDown.t < 450) { lastDown = {}; drillInto(n); return; }   // the board re-renders between clicks, so native dblclick never reaches the box
      lastDown = { id: n.id, t: now };
      const p = worldPt(e), group = multi.size > 1 ? [...multi].filter((id) => node(id) && !node(id).props.locked).map((id) => ({ id, x: node(id).x, y: node(id).y })) : null;
      drag = { id: n.id, dx: n.x - p.x, dy: n.y - p.y, sx: e.clientX, sy: e.clientY, moved: false, group, p0: p }; deepPart = ""; if (!group) { sel = { node: n.id, edge: null }; if (tab === "parts" || tab === "architect" || architectResult) tab = "inspect"; } render(); board.setPointerCapture(e.pointerId); return;
    }
    if (edgeEl) { const [a, b] = edgeEl.dataset.edge.split("|"); multi.clear(); sel = { node: null, edge: { from: a, to: b } }; tab = "inspect"; render(); return; }
    const gl = e.target.tagName === "text" && e.target.closest("[data-group]");
    if (gl) { const g = (doc.groups || []).find((x) => x.id === gl.dataset.group); if (g) { multi = new Set(g.ids.filter((id) => node(id))); sel = { node: null, edge: null }; render(); return; } }
    if (e.shiftKey && tool === "select") { const p = worldPt(e); marquee = { x1: p.x, y1: p.y, x2: p.x, y2: p.y }; board.setPointerCapture(e.pointerId); return; }
    multi.clear(); highlight.clear();
    sel = { node: null, edge: null }; linkFrom = null; panning = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; board.setAttribute("class", "pan panning"); board.setPointerCapture(e.pointerId); render();
  });
  board.addEventListener("pointermove", (e) => {
    const hovered = e.target.closest && e.target.closest("[data-node]");
    const nextHover = hovered && !drag && !panning && !rubber ? hovered.dataset.node : "";
    if (hoverNodeId !== nextHover) { hoverNodeId = nextHover; if (!drag && !panning && !rubber) render(true); }
    if (panning) { view.x = panning.vx + (e.clientX - panning.sx); view.y = panning.vy + (e.clientY - panning.sy); render(true); return; }
    if (rubber) { const p = worldPt(e); rubber.x2 = p.x; rubber.y2 = p.y; render(true); return; }
    if (marquee) { const p = worldPt(e); marquee.x2 = p.x; marquee.y2 = p.y; render(true); return; }
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return; drag.moved = true; const p = worldPt(e);
      if (drag.group) drag.group.forEach((g) => { const n = node(g.id); n.x = Math.round(g.x + p.x - drag.p0.x); n.y = Math.round(g.y + p.y - drag.p0.y); });
      else { const n = node(drag.id); n.x = Math.round(p.x + drag.dx); n.y = Math.round(p.y + drag.dy); }
      render(true);
    }
  });
  board.addEventListener("pointerup", (e) => {
    if (panning) { panning = null; board.setAttribute("class", ""); return; }
    if (marquee) {
      const m = marquee, x0 = Math.min(m.x1, m.x2), x1 = Math.max(m.x1, m.x2), y0 = Math.min(m.y1, m.y2), y1 = Math.max(m.y1, m.y2); marquee = null;
      doc.nodes.filter((n) => n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1).forEach((n) => multi.add(n.id));
      if (multi.size === 1) { sel = { node: [...multi][0], edge: null }; multi.clear(); } else sel = { node: null, edge: null };
      render(); return;
    }
    if (rubber) { const t = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest && el.closest("[data-node]")).find(Boolean); const from = linkFrom; rubber = null; linkFrom = null; if (t && t.dataset.node !== from) connect(from, t.dataset.node); else render(); return; }
    if (drag) { const d = drag; drag = null; if (d.moved) commit(false); else render(); }
  });
  // Some touchpads, accessibility tools, and embedded-browser controls emit a
  // click without a preceding pointerdown. Keep selection usable for them too.
  board.addEventListener("click", (e) => {
    const nodeEl = e.target.closest && e.target.closest("[data-node]");
    if (!nodeEl || tool === "connect" || drag || panning || rubber || e.shiftKey || multi.size > 1) return;
    const n = node(nodeEl.dataset.node); if (!n || n.props.locked || (sel.node === n.id && tab === "inspect")) return;
    deepPart = ""; sel = { node: n.id, edge: null };
    if (tab === "parts" || tab === "architect" || architectResult) tab = "inspect";
    render();
  });
  let lastDown = {};
  board.addEventListener("wheel", (e) => {
    e.preventDefault(); const r = board.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = Math.exp(-e.deltaY * 0.0012), z2 = clamp(view.z * k, 0.25, 2.5);
    view.x = mx - ((mx - view.x) / view.z) * z2; view.y = my - ((my - view.y) / view.z) * z2; view.z = z2; render();
  }, { passive: false });
  board.addEventListener("dragover", (e) => { e.preventDefault(); });
  board.addEventListener("drop", (e) => { e.preventDefault(); const t = e.dataTransfer.getData("text/plain"); if (S.BY_ID[t]) { const p = worldPt(e); addNode(t, p.x, p.y); } });
  document.addEventListener("dragstart", (e) => { const b = e.target.closest && e.target.closest("[data-add]"); if (b) e.dataTransfer.setData("text/plain", b.dataset.add); });

  // ---------------------------------------------------------------- clicks and inputs
  function paintChaos() {
    $$("[data-chaos]").forEach((b) => b.setAttribute("aria-pressed", String(!!chaos[b.dataset.chaos])));
    const n = Object.values(chaos).filter(Boolean).length, s = $("#chaosCount"); if (s) s.textContent = n ? String(n) : "";
  }
  document.addEventListener("click", (e) => {
    if (aiWorkspace) {
      const preview = e.target.closest && e.target.closest(".level-preview");
      if (preview && preview.dataset.jumpLevel) { activateLevel(Number(preview.dataset.jumpLevel) - 1); return; }
    }
    const t = e.target.closest("button"); if (!t) { if (!e.target.closest(".menu")) { $("#fileMenu").hidden = true; $("#presetMenu").hidden = true; $("#moreTabsMenu").hidden = true; } return; }
    if (t.dataset.levelToggle) { activateLevel(Number(t.dataset.levelToggle) - 1); return; }
    if (t.dataset.levelFocus) { activateLevel(Number(t.dataset.levelFocus) - 1); return; }
    if (t.hasAttribute("data-level-reset")) { resetToLevel1(); return; }
    if (t.id === "mFile") { $("#fileMenu").hidden = !$("#fileMenu").hidden; $("#presetMenu").hidden = true; $("#moreTabsMenu").hidden = true; return; }
    if (t.id === "mPreset") { $("#presetMenu").hidden = !$("#presetMenu").hidden; $("#fileMenu").hidden = true; $("#moreTabsMenu").hidden = true; return; }
    if (t.id === "mMoreTabs") { $("#moreTabsMenu").hidden = !$("#moreTabsMenu").hidden; $("#fileMenu").hidden = true; $("#presetMenu").hidden = true; return; }
    if (t.dataset.tab && t.closest("#moreTabsMenu")) { $("#moreTabsMenu").hidden = true; }
    if (t.dataset.preset) { $("#presetMenu").hidden = true; loadPreset(PRESETS.find((p) => p.id === t.dataset.preset)); if (doc.blueprint) { tab = "blueprint"; updSide(); } return; }
    if (t.dataset.cfadd) { cfaults.push({ type: "cacheFlush", target: "", mag: 4, startMin: 20, durationMin: 6 }); return renderCollapse(); }
    if (t.dataset.cfdel) { cfaults.splice(+t.dataset.cfdel, 1); if (!cfaults.length) cfaults.push({ type: "dbDown", target: "", mag: 4, startMin: 15, durationMin: 8 }); return renderCollapse(); }
    if (t.dataset.cfrun) return runCollapse();
    if (t.dataset.chunt) return huntCollapse();
    if (t.dataset.chload || t.dataset.chloadp) { const r = t.dataset.chload != null && t.dataset.chload !== "" ? chunt.results[+t.dataset.chload] : chunt.pairs[+t.dataset.chloadp]; cfaults = r.faults.map((f) => Object.assign({ mag: 4, target: "" }, f)); return runCollapse(); }
    if (t.dataset.bcopy) return copy(BD.encode(lb), "Share code copied");
    if (t.dataset.bimport) { try { const m = BD.merge(lb, BD.decode($("#bcode").value)); lb = m.board; boardMsg = `Imported ${m.added} scores.`; saveBoard(); } catch (err) { boardMsg = err.message; } return renderBoard(); }
    if (t.dataset.provf) { provFilter = t.dataset.provf; return renderParts(); }
    if (t.dataset.swap && sel.node) { swapType(sel.node, t.dataset.swap); return; }
    if (t.dataset.secall) { const open = t.dataset.secall === "open"; displayCats().forEach((c) => { secState["cat:" + slug(c)] = open; }); try { localStorage.setItem(SKEY, JSON.stringify(secState)); } catch (x) { /* ignore */ } partsQuery = ""; return renderParts(); }
    if (t.dataset.secmore) { const k = t.dataset.secmore; if (partsRowsExpanded.has(k)) partsRowsExpanded.delete(k); else partsRowsExpanded.add(k); return renderParts(); }
    if (t.dataset.mstart) { startMission(MISSIONS.find((x) => x.id === t.dataset.mstart)); tab = "missions"; updSide(); return; }
    if (t.dataset.mrun) return runMission();
    if (t.dataset.mhint) { mhints = Math.min(3, mhints + 1); return renderMissions(); }
    if (t.dataset.mreset) { const m = activeMission(); if (m) { doc.nodes = []; startMission(m); } return; }
    if (t.dataset.bpopen) { const p = PRESETS.find((x) => x.name === (PLAT.PLATFORMS.find((q) => q.id === t.dataset.bpopen) || {}).name); if (p) { loadPreset(p); tab = "blueprint"; updSide(); } return; }
    if (t.dataset.bpfocus) return focusNode(t.dataset.bpfocus);
    if (t.dataset.bplld) return openBlueprintLld(t.dataset.bplld);
    if (t.dataset.bpleave) { delete doc.blueprint; persist(); return renderBlueprint(); }
    if (t.dataset.lopen) { lldId = t.dataset.lopen; lldTab = "diagram"; return lldDialog(); }
    if (t.dataset.lclose) { lldId = ""; return lldDialog(); }
    if (t.dataset.ltab) { lldTab = t.dataset.ltab; return lldDialog(); }
    if (t.dataset.lfollow) { iopen["l" + lldId + t.dataset.lfollow] = true; return lldDialog(); }
    if (t.dataset.lcopy) { const it = LL.ITEMS.find((x) => x.id === lldId); return copy(it.code, "Java copied"); }
    if (t.dataset.iview) { iview = t.dataset.iview; iquery = ""; return renderInterview(); }
    if (t.dataset.istart) { startInterview(IV.QUESTIONS.find((x) => x.id === t.dataset.istart)); iview = "list"; tab = "interview"; updSide(); return; }
    if (t.dataset.icheck) return checkInterview();
    if (t.dataset.ihint) { ihints += 1; return renderInterview(); }
    if (t.dataset.iref) { const qn = activeQ(); if (qn) showStrongAnswer(qn); return; }
    if (t.dataset.ileave) { delete doc.interview; ires = null; ihints = 0; persist(); return renderInterview(); }
    if (t.dataset.ifollow) { iopen[t.dataset.ifollow] = true; return renderInterview(); }
    if (t.dataset.mleave) { delete doc.mission; mresult = null; mhints = 0; persist(); return renderMissions(); }
    if (t.dataset.mreport) return copy(missionReport(), "Report copied");
    if (t.dataset.architectExample != null) { architectDraft = t.dataset.architectExample; architectResult = null; return renderArchitect(); }
    if (t.dataset.architectScale) { architectScale = t.dataset.architectScale; return renderArchitect(); }
    if (t.dataset.architectStack) { architectStack = t.dataset.architectStack; return renderArchitect(); }
    if (t.dataset.architectMode) { architectMode = t.dataset.architectMode; if (architectMode === "ai") { architectStack = "java-spring"; architectPrefs = { ...architectPrefs, style: "modular-monolith", frontends: 1, backends: 3, cloud: "aws", cicd: "github-actions", auth: "oidc", audit: "yes", observability: "yes", transaction: "outbox-saga", queue: "kafka" }; } return renderArchitect(); }
    if (t.dataset.tab) { tab = t.dataset.tab; updSide(); return; }
    if (t.dataset.tool) { tool = t.dataset.tool; linkFrom = null; $$("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool))); render(); return; }
    if (t.dataset.add) {
      // tap/click-to-add: next to the last box, on the first spot that overlaps nothing, then keep it in view
      const r = board.getBoundingClientRect(), last = doc.nodes[doc.nodes.length - 1], right = (r.width - view.x) / view.z - NW / 2 - 10;
      let x0 = last ? last.x + NW + 70 : (NW / 2 + 40 - view.x) / view.z, y0 = last ? last.y : (r.height / 2 - view.y) / view.z;
      if (last && x0 > right) { x0 = Math.min(...doc.nodes.map((m) => m.x)); y0 = Math.max(...doc.nodes.map((m) => m.y)) + NH + 60; }   // wrap like text so boxes stay readable
      const free = (x, y) => !doc.nodes.some((m) => Math.abs(m.x - x) < NW + 24 && Math.abs(m.y - y) < NH + 24);
      let spot = [x0, y0];
      for (let k = 0; k < 60 && !free(...spot); k++) spot = [x0 + (k % 3) * (NW + 70), y0 + (Math.floor(k / 3) + 1) * (NH + 50) * (k % 2 ? -1 : 1)];
      const n = addNode(t.dataset.add, spot[0], spot[1]), sx = n.x * view.z + view.x, sy = n.y * view.z + view.y;
      if (sx < NW / 2 || sy < NH / 2 || sx > r.width - NW / 2 || sy > r.height - NH / 2) fitView();
      if (narrowGuide()) document.body.classList.add("rp-collapsed");   // show the new box, not the list
      return;
    }
    if (t.dataset.chaos) { chaos[t.dataset.chaos] = !chaos[t.dataset.chaos]; if (!running && !sim) say("Press Start first, then break things while it runs."); else if (chaos[t.dataset.chaos]) noteGuide("broke"); paintChaos(); return; }
    if (t.dataset.skill) {
      const first = !!t.closest("#skillDlg");
      setSkill(t.dataset.skill); const dl = $("#skillDlg"); if (dl && dl.open) dl.close();
      // First visit as a beginner: swap the default example for its core version (no CI/CD and tooling boxes).
      const p = PRESETS.find((x) => x.name === doc.name);
      if (first && t.dataset.skill === "beginner" && p && p.coreBuild && doc.nodes.some((n) => /^z_/.test(n.id))) loadPreset(p);
      return;
    }
    if (t.dataset.guide) { guideAction(t); return; }
    if (t.dataset.pt) { const k = t.dataset.pt, v = t.dataset.v === "1"; if (k === "__down") { down[sel.node] = v; renderInspect(); return; } if ((k === "fan" || k === "failover" || k === "tls") && sel.edge) { const e2 = doc.edges.find((x) => x.from === sel.edge.from && x.to === sel.edge.to); e2[k] = v; commit(); return; } node(sel.node).props[k] = v; commit(); return; }
    if (t.parentElement && t.parentElement.id === "speed") { speed = +t.dataset.v; $$("#speed button").forEach((b) => b.setAttribute("aria-pressed", String(b === t))); if (running) { clearInterval(timer); timer = setInterval(tick, Math.round(300 / speed)); } return; }
    if (t.id === "play") return start(); if (t.id === "stop") return stop();
    if (t.id === "undo") return undo(-1); if (t.id === "redo") return undo(1);
    if (t.id === "zoomIn") { view.z = clamp(view.z * 1.2, 0.25, 2.5); return render(); } if (t.id === "zoomOut") { view.z = clamp(view.z / 1.2, 0.25, 2.5); return render(); }
    if (t.id === "zoomReset") { view.z = 1; return render(); } if (t.id === "fit") return fitView();
    if (t.id === "costBtn") { renderCostPlan(); $("#costPlan").showModal(); return; }
    if (t.id === "simBtn") { renderSimLab(); $("#simDlg").showModal(); return; }
    if (t.id === "simClose") { $("#simDlg").close(); return; }
    if (t.dataset.simRun || t.dataset.simPlay || t.dataset.simPath || t.dataset.simFix) { simAction(t); return; }
    if (t.id === "exportBtn") { exportPreview = ""; renderExport(); $("#exportDlg").showModal(); return; }
    if (t.id === "exportClose") { $("#exportDlg").close(); return; }
    if (t.dataset.expDl || t.dataset.expView || t.dataset.expAll) { exportAction(t); return; }
    if (t.dataset.multi) { multiAction(t.dataset.multi); return; }
    if (t.dataset.drill) { const n = node(t.dataset.drill); if (n) drillInto(n); return; }
    if (t.dataset.rp) { setRightTab(t.dataset.rp, true); return; }
    if (t.classList.contains("rp-collapse") || t.id === "rpOpen") { document.body.classList.toggle("rp-collapsed"); try { localStorage.setItem("archlab.rp.collapsed", document.body.classList.contains("rp-collapsed") ? "1" : ""); } catch (x) { /* ignore */ } return; }
    if (t.dataset.optSimplify && STU) { const st = STU.recommendStyle(doc); $("#optDlg").close(); fixPreview("Simplify to a modular monolith", STU.mergeServices(doc, st.simplify), st.why.join(" ")); return; }
    if (t.id === "costClose") { $("#costPlan").close(); return; }
    if (t.id === "changeApply") { const fn = pendingApply; pendingApply = null; $("#changeDlg").close(); if (fn) fn(); return; }
    if (t.id === "changeCancel" || t.id === "changeClose") { pendingApply = null; $("#changeDlg").close(); say("Kept your canvas. The proposal is still in the AI panel if you want to review it again."); return; }
    if (t.id === "verBtn") { verCompare = null; renderVersions(); $("#verDlg").showModal(); return; }
    if (t.id === "verClose") { $("#verDlg").close(); return; }
    if (t.dataset.verSave || t.dataset.verCompare || t.dataset.verRestore || t.dataset.verDelete || t.dataset.verApprove) { versionAction(t); return; }
    if (t.id === "readyBtn") { renderReadiness(); $("#readyDlg").showModal(); return; }
    if (t.id === "readyClose") { $("#readyDlg").close(); return; }
    if (t.dataset.readyDownload) { downloadReadiness(); return; }
    if (t.dataset.readyOpen) { $("#readyDlg").close(); const b = document.getElementById(t.dataset.readyOpen); if (b) b.click(); return; }
    if (t.id === "wirePanelClose") { sel = { node: null, edge: null }; render(); return; }
    if (t.id === "reqBtn") { renderRequirements(); $("#reqDlg").showModal(); return; }
    if (t.id === "reqClose") { $("#reqDlg").close(); return; }
    if (t.dataset.reqSave || t.dataset.reqBrief || t.dataset.reqAccept) { if (t.dataset.reqAccept && !window.confirm("Mark every value shown, including the assumed ones, as confirmed by you?")) return; saveRequirements(!!t.dataset.reqBrief, !!t.dataset.reqAccept); return; }
    if (t.id === "optBtn") { renderOptions(); $("#optDlg").showModal(); return; }
    if (t.id === "optClose") { $("#optDlg").close(); return; }
    if (t.dataset.optApply || t.dataset.optSave) { optionAction(t); return; }
    if (t.dataset.lintFix != null || t.dataset.lintFixAll || t.dataset.optimize) { lintFixAction(t); return; }
    if (t.id === "lintBtn") { renderChecks(); $("#lintDlg").showModal(); return; }
    if (t.id === "lintClose") { $("#lintDlg").close(); return; }
    if (t.dataset.lintFocus) { const id = t.dataset.lintFocus; $("#lintDlg").close(); if (node(id)) { sel = { node: id, edge: null }; render(); say("Selected " + (node(id).props.name || S.BY_ID[node(id).type].name) + ". Its wires are highlighted."); } return; }
    if (t.dataset.compliance) { doc.requirements = doc.requirements || {}; const list = new Set(doc.requirements.compliance || []), k = t.dataset.compliance; if (k === "none") { doc.requirements.complianceNone = !doc.requirements.complianceNone; if (doc.requirements.complianceNone) list.clear(); } else { if (list.has(k)) list.delete(k); else list.add(k); doc.requirements.complianceNone = false; } doc.requirements.compliance = [...list]; commit(false); renderChecks(); return; }
    if (t.dataset.memoryId) { memoryApi("/api/architecture-lab/load", { id: t.dataset.memoryId }).then((data) => { $("#memory").close(); useDocument(data.document); say(`Opened “${doc.name || "project"}” from YashAI memory.`); }).catch((err) => say(err.message)); return; }
    const act = t.dataset.act; if (!act) return; $("#fileMenu").hidden = true;
    if (act === "new") { if (window.confirm("Start a new board? Unsaved changes are lost.")) resetSimple(); }
    else if (act === "resetSimple") { if (window.confirm("Reset this canvas to the simple starter? Your current unsaved design will be replaced.")) resetSimple(); }
    else if (act === "clearCanvas") { if (window.confirm("Clear every component and wire from this canvas?")) clearCanvas(); }
    else if (act === "deleteSelected") { if (!sel.node && !sel.edge) say("Select a component or wire on the board first."); else { delSel(); say("Selection deleted."); } }
    else if (act === "open") $("#file").click(); else if (act === "save") download(JSON.stringify(doc, null, 1), (doc.name || "design").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".archlab.json", "application/json");
    else if (act === "aiReview" || act === "mentorReview") { if (act === "mentorReview") tab = "architect"; aiReview(); }   // answer where it was asked; selecting a box may have moved tab to "inspect"
    else if (act === "openDelivery") { location.href = `${location.pathname}?tab=delivery`; }
    else if (act === "runArchitect") { aiArchitect(); }
    else if (act === "improveArchitect") { improveArchitectBrief(); }
    else if (act === "editArchitect") { architectResult = null; renderArchitect(); $("#architectPrompt").focus(); }
    else if (act === "applyArchitect" && architectResult) previewArchitect();
    else if (act === "freezeDelivery") { doc.delivery = { frozenAt: new Date().toISOString() }; persist(); snapshot(); renderDelivery(); say("Architecture frozen locally. Create the implementation handoff when ready."); }
    else if (act === "unfreezeDelivery") { delete doc.delivery; persist(); snapshot(); renderDelivery(); say("Architecture is editable again."); }
    else if (act === "downloadBundle") { const name = (doc.name || "architecture").replace(/[^a-z0-9]+/gi, "-").toLowerCase(); download(JSON.stringify(implementationBundle(), null, 2), `${name}-build-package.json`, "application/json"); say("Build package downloaded: API, database, ADR, CI/CD, deployment, and handoff."); }
    else if (act === "downloadHandoff") { download(deliveryHandoff(), (doc.name || "architecture").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-implementation-handoff.md", "text/markdown"); say("Implementation handoff downloaded."); }
    else if (act === "saveMemory") { memoryApi("/api/architecture-lab/save", { document: doc, extra: saveExtra() }).then((p) => say(`Saved “${p.name}” to YashAI memory.`)).catch((err) => say(err.message)); }
    else if (act === "openMemory") { openMemory(); }
    else if (act === "brief") download(buildBrief(), (doc.name || "design").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-design-brief.md", "text/markdown");
    else if (act === "prompt") copy(buildPrompt(), "Prompt copied"); else if (act === "share") copy(location.origin + location.pathname + "#d=" + btoa(unescape(encodeURIComponent(JSON.stringify(doc)))), "Share link copied");
    else if (act === "help") $("#help").showModal(); else if (act === "delNode" || act === "delEdge") delSel();
    else if (act === "dup") { if (sel.node) duplicateIds([sel.node]); }
    else if (act === "layout" && STU) { tidyLayout(); say("Arranged by request flow and layer (locked boxes stayed). Undo (Ctrl+Z) restores the previous positions."); }
  });
  document.addEventListener("input", (e) => {
    const t = e.target; if (!t.dataset) return;
    if (t.id === "title") { doc.name = t.value; persist(); return; }
    if (t.dataset.architectInput != null) { architectDraft = t.value.slice(0, 2500); return; }
    if (t.dataset.architectPref && t.type === "number") { architectPrefs[t.dataset.architectPref] = Math.max(+t.min || 1, Math.min(+t.max || 100, +t.value || 1)); return; }
    if (t.id === "mult") { mult = +t.value; $("#multOut").textContent = mult + "×"; return; }
  });
  document.addEventListener("change", (e) => {
    const t = e.target; if (!t.dataset) return;
    if (t.id === "provSel") { provFilter = t.value; return renderParts(); }
    if (t.dataset.architectPref) { architectPrefs[t.dataset.architectPref] = t.value; architectMode = "manual"; return renderArchitect(); }
    if (t.dataset.architectStackSelect != null) { architectStack = t.value; architectMode = "manual"; return renderArchitect(); }
    if (t.dataset.llook != null && lldId) { const k = "lld:" + lldId, p = iprog[k] || (iprog[k] = { look: [] }), i = +t.dataset.llook; p.look = p.look.filter((x) => x !== i); if (t.checked) p.look.push(i); saveI(); return; }
    if (t.dataset.p && sel.node) { const p = node(sel.node).props, k = t.dataset.p; if (k === "name") p[k] = t.value; else if (t.value === "") delete p[k]; else p[k] = +t.value; commit(); }
    else if (t.dataset.meas && sel.node) { const p = node(sel.node).props; p.measured = p.measured || {}; p.measured[t.dataset.meas] = t.checked; commit(false); }
    else if (t.dataset.cf) { const [i, k] = t.dataset.cf.split(":"), f = cfaults[+i]; if (f) { f[k] = ["type", "target"].includes(k) ? t.value : +t.value; if (k === "type") f.target = defaultTarget(t.value); } renderCollapse(); }
    else if (t.dataset.bname) { lb.player = (t.value || "You").slice(0, 30); saveBoard(); renderBoard(); }
    else if (t.dataset.pc && sel.node) { const p = node(sel.node).props, v = t.value.trim().slice(0, 500); if (v) p.comment = v; else delete p.comment; commit(false); }
    else if (t.dataset.ps && sel.node) { node(sel.node).props[t.dataset.ps] = t.value; commit(); paintRegionChaos(); }
    else if (t.dataset.es && sel.edge) { doc.edges.find((x) => x.from === sel.edge.from && x.to === sel.edge.to)[t.dataset.es] = t.value; commit(); }
    else if (t.dataset.e && sel.edge) { const e2 = doc.edges.find((x) => x.from === sel.edge.from && x.to === sel.edge.to); e2[t.dataset.e] = +t.value; commit(); }
    else if (t.dataset.s) { const s = doc.scenario, k = t.dataset.s, v = t.type === "number" ? +t.value : t.value; if (k === "readPct") s.readFrac = clamp(v / 100, 0, 1); else if (k === "staticPct") s.staticFrac = clamp(v / 100, 0, 1); else if (k === "botPct") s.botFrac = clamp(v / 100, 0, 0.9); else s[k] = v; commit(); renderScenario(); }
    else if (t.dataset.g) { doc.slo[t.dataset.g] = +t.value; persist(); kpis(); }
    else if (t.id === "file") { const f = t.files[0]; if (!f) return; f.text().then((txt) => { try { useDocument(JSON.parse(txt)); } catch (err) { say("That file is not an Architecture Lab design."); } }); t.value = ""; }
  });
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === " " && !typing) { spaceDown = true; e.preventDefault(); }
    if (typing) return;
    if ((e.key === "Delete" || e.key === "Backspace") && (sel.node || sel.edge || multi.size)) { delSel(); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { undo(e.shiftKey ? 1 : -1); e.preventDefault(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { undo(1); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selectionIds().length) { duplicateIds(selectionIds()); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { multi = new Set(doc.nodes.map((n) => n.id)); sel = { node: null, edge: null }; render(); e.preventDefault(); }
    else if (e.key === "Escape") { sel = { node: null, edge: null }; linkFrom = null; rubber = null; marquee = null; multi.clear(); highlight.clear(); render(); }
    else if (e.ctrlKey || e.metaKey || e.altKey) { /* leave browser shortcuts alone */ }
    else if (e.key === "l" || e.key === "L") { toggleLock(selectionIds()); }
    else if (e.key === "v") { document.querySelector('[data-tool="select"]').click(); } else if (e.key === "h") { document.querySelector('[data-tool="hand"]').click(); } else if (e.key === "c") { document.querySelector('[data-tool="connect"]').click(); }
    else if (e.key === "+" || e.key === "=") { view.z = clamp(view.z * 1.2, 0.25, 2.5); render(); } else if (e.key === "-") { view.z = clamp(view.z / 1.2, 0.25, 2.5); render(); }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key !== " ") return;
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (typing) return; // typing a space in a field must never rebuild the side panel and steal focus
    spaceDown = false; render(true);
  });

  // ---------------------------------------------------------------- export
  function download(text, name, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function copy(text, msg) { const done = (ok) => say(ok ? msg : "Copy failed"); if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); else { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (x) { /* ignore */ } ta.remove(); done(ok); } }
  function provenance(n, k) { if (n.props.measured && n.props.measured[k]) return "measured"; return n.props[k] != null && n.props[k] !== "" ? "your estimate" : "teaching default"; }
  function events() { const ev = []; if (doc.nodes.some((n) => S.BY_ID[n.type].cls === "db")) ev.push({ tick: 50, until: 51, type: "dbDown" }); if (doc.nodes.some((n) => S.BY_ID[n.type].cls === "cache")) ev.push({ tick: 60, until: 61, type: "cacheFlush" }); return ev; }
  function buildBrief() {
    const g = graphForSim(), sc = doc.scenario, o = doc.slo, a = S.run(g, sc, []), b = S.run(g, sc, events());
    if (a.error) return `# Design brief\n\nCannot run: ${a.error}\n`;
    const s1 = a.summary, s2 = b.summary, pass = (s) => s.p95 <= o.p95 && s.availability * 100 >= o.avail && s.cost <= o.budget;
    const L = [`# Design brief: ${doc.name || "Untitled"}`, "", `Generated ${new Date().toISOString().slice(0, 10)} by Architecture Lab (Sandbox). This is a **capacity model, not a load test.** Numbers marked "teaching default" are round teaching values and must not be trusted for sizing.`, ""];
    L.push("## Goals", "", `- Baseline ${num(sc.base)} req/s, shape ${sc.shape}${sc.shape === "spike" ? ` ×${sc.spikeX}` : ""}, ${Math.round(sc.readFrac * 100)}% reads, ${Math.round(sc.staticFrac * 100)}% static, ${Math.round(sc.botFrac * 100)}% bots, hot-key skew ${sc.skew}`, `- p95 latency ≤ ${o.p95} ms; availability ≥ ${o.avail}%; budget ≤ ${money(o.budget)}/month`, "");
    L.push("## Design", "", ...doc.nodes.filter((n) => S.BY_ID[n.type].cls !== "source").map((n) => `- ${n.props.name || S.BY_ID[n.type].name} (${S.BY_ID[n.type].name}): ${subLabel(n)}`), "", `Connections: ${doc.edges.map((e) => `${node(e.from).props.name || S.BY_ID[node(e.from).type].name} → ${node(e.to).props.name || S.BY_ID[node(e.to).type].name}${e.fan ? " (parallel call)" : ""}`).join("; ") || "none"}`, "");
    L.push("## Assumptions", "", "| Component | Number | Value | Basis |", "|---|---|---|---|");
    doc.nodes.forEach((n) => { const d = S.BY_ID[n.type]; [["cap", "capacity/instance"], ["ms", "idle latency ms"], ["rd", "reads/s"], ["wr", "writes/s"], ["cost", "price $/mo"]].forEach(([k, l]) => { const v = n.props[k] != null && n.props[k] !== "" ? n.props[k] : d[k]; if (v && d.cls !== "source" && d.cls !== "passive") L.push(`| ${n.props.name || d.name} | ${l} | ${v} | ${provenance(n, k)} |`); }); });
    L.push("", "## Simulated result", "", "| | Normal hour | With incidents |", "|---|---|---|", `| p95 latency | ${Math.round(s1.p95)} ms | ${Math.round(s2.p95)} ms |`, `| Availability | ${(s1.availability * 100).toFixed(2)}% | ${(s2.availability * 100).toFixed(2)}% |`, `| Monthly cost | ${money(s1.cost)} | ${money(s2.cost)} |`,
      `| Busiest component | ${s1.busiest ? s1.busiest.name + " " + Math.round(s1.busiest.util * 100) + "%" : "-"} | ${s2.busiest ? s2.busiest.name + " " + Math.round(s2.busiest.util * 100) + "%" : "-"} |`, "",
      `Incidents simulated: ${events().map((x) => x.type).join(", ") || "none (no database or cache)"}. Verdict: normal hour ${pass(s1) ? "meets" : "misses"} the goals; with incidents ${pass(s2) ? "meets" : "misses"} them.`, "");
    L.push("## Verify before you build", "", "- [ ] Load-test one instance of each service to replace the teaching capacity and latency numbers.", "- [ ] Measure database read and write capacity on production-like data.", "- [ ] Measure the real cache hit rate with a sample of real keys.", "- [ ] Run a failure drill for each incident above and confirm recovery times.", "- [ ] Re-run this brief with measured numbers before committing to the design.", "");
    return L.join("\n");
  }
  function buildPrompt() {
    const sc = doc.scenario, o = doc.slo;
    return [`You are implementing the backend for "${doc.name}". Follow this architecture. Do not add components that are not listed, and say so if a listed component cannot meet a goal.`, "", "Components:", ...doc.nodes.filter((n) => S.BY_ID[n.type].cls !== "source").map((n) => `- ${n.props.name || S.BY_ID[n.type].name}: ${S.BY_ID[n.type].name}, ${subLabel(n)}`),
      "", "Traffic flows:", ...doc.edges.map((e) => `- ${node(e.from).props.name || S.BY_ID[node(e.from).type].name} -> ${node(e.to).props.name || S.BY_ID[node(e.to).type].name}${e.fan ? " (parallel call)" : ""}`), "", "Goals:", `- ${num(sc.base)} req/s baseline (${sc.shape}), ${Math.round(sc.readFrac * 100)}% reads`, `- p95 latency ≤ ${o.p95} ms, availability ≥ ${o.avail}%`,
      "", "Deliver: the service code and infrastructure definition; a load-test script that drives the peak load and reports p95 and error rate; a failure drill for each component that can fail; a short list of every assumption you made.", "The capacity numbers behind this design are model estimates unless marked measured in the brief."].join("\n");
  }

  // ---------------------------------------------------------------- start
  let exQuery = "";
  function renderExamples() {
    const q = exQuery.toLowerCase(), cats = [...new Set(PRESETS.map((p) => p.cat))];
    $("#presetMenu").innerHTML = `<input class="search" id="exq" placeholder="Search ${PRESETS.length} examples…" value="${esc(exQuery)}" aria-label="Search examples">` + cats.map((c) => { const items = PRESETS.filter((p) => p.cat === c && (!q || (p.name + " " + (p.notice || "") + " " + c).toLowerCase().includes(q))); return items.length ? `<details class="sec exc" ${q ? "open" : ""}><summary>${esc(c)} <span class="count">${items.length}</span></summary>${items.map((p) => `<button data-preset="${p.id}" title="${esc(p.notice || "")}">${esc(p.name)}${p.notice ? `<small>${esc(p.notice)}</small>` : ""}</button>`).join("")}</details>` : ""; }).join("") || "<p class='muted' style='padding:8px'>Nothing matches.</p>";
    const n = $("#exq"); n.oninput = () => { exQuery = n.value; const pos = n.selectionStart; renderExamples(); const m = $("#exq"); m.focus(); m.setSelectionRange(pos, pos); };
  }
  renderExamples();
  let startDoc = null;
  try { const m = /^#d=(.+)$/.exec(location.hash); if (m) { startDoc = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (!startDoc.nodes || !startDoc.edges) startDoc = null; } } catch (e) { startDoc = null; }
  if (startDoc) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ } }
  const referencePreset = PRESETS.find((p) => p.id === referenceExample) || PRESETS.find((p) => p.id === "urlshort");
  doc = startDoc || (referenceMode ? fresh(query.get("core") === "1" && referencePreset.coreBuild ? { build: referencePreset.coreBuild } : referencePreset) : loadDoc()) || (practiceMode ? practiceStarter() : fresh(PRESETS.find((p) => p.id === "urlshort")));
  if (aiWorkspace && doc.nodes.some((n) => n.props && n.props.__aiGenerated)) {
    const removed = new Set(doc.nodes.filter((n) => n.props && n.props.__aiGenerated).map((n) => n.id));
    doc.nodes = doc.nodes.filter((n) => !removed.has(n.id)); doc.edges = doc.edges.filter((e) => !removed.has(e.from) && !removed.has(e.to)); persist();
  }
  doc.scenario = Object.assign({}, S.DEFAULT_SCENARIO, doc.scenario || {}); doc.slo = doc.slo || { p95: 200, avail: 99.5, budget: 5000 };
  $("#title").value = doc.name || "Untitled design"; if (startDoc) persist(); snapshot(); renderParts(); paintButtons(); paintChaos(); kpis(); render(); requestAnimationFrame(fitView);
  window.addEventListener("hashchange", () => { if (/^#d=/.test(location.hash)) location.reload(); });   // a share link pasted into an open tab
  // Keep the same world point in the middle when the sidebar changes width.
  // A plain redraw leaves the diagram shifted or clipped after an expand/drag.
  let boardSize = null;
  function syncCanvasViewport() {
    const r = $("#board").getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (!boardSize) { boardSize = { width: r.width, height: r.height }; return; }
    const old = boardSize;
    if (Math.abs(old.width - r.width) < 1 && Math.abs(old.height - r.height) < 1) return;
    boardSize = { width: r.width, height: r.height };
    fitView();
  }
  if (window.ResizeObserver) new ResizeObserver(syncCanvasViewport).observe($("#stage"));
  window.addEventListener("resize", syncCanvasViewport);
  // ---- side panel: resize by dragging, expand, hide
  (function sidePanel() {
    const PK = "archlab.side.v1"; let st = { w: 380, hidden: false }; try { st = Object.assign(st, JSON.parse(localStorage.getItem(PK)) || {}); } catch (e) { /* ignore */ }
    const root = document.documentElement, save = () => { try { localStorage.setItem(PK, JSON.stringify(st)); } catch (e) { /* ignore */ } };
    const wide = $("#sideWide"), hide = $("#sideHide"), show = $("#sideShow"), grip = $("#sideGrip");
    // Do not let an incomplete or cached document stop the canvas from loading.
    if (!wide || !hide || !show || !grip) return;
    const clampW = (w) => Math.max(300, Math.min(Math.round(innerWidth * 0.7), w));
    const apply = () => { root.style.setProperty("--side", clampW(st.w) + "px"); document.body.classList.toggle("side-hidden", !!st.hidden); show.hidden = !st.hidden; wide.textContent = st.w >= 620 ? "⤡ Shrink" : "⤢ Expand"; requestAnimationFrame(() => requestAnimationFrame(() => { syncCanvasViewport(); fitView(); })); };
    wide.onclick = () => { st.w = st.w >= 620 ? 380 : Math.min(Math.round(innerWidth * 0.6), 720); apply(); save(); };
    hide.onclick = () => { st.hidden = true; apply(); save(); };
    show.onclick = () => { st.hidden = false; apply(); save(); };
    let drag = null;
    grip.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, w: clampW(st.w) }; grip.classList.add("on"); grip.setPointerCapture(e.pointerId); e.preventDefault(); });
    grip.addEventListener("pointermove", (e) => { if (!drag) return; st.w = clampW(drag.w + (drag.x - e.clientX)); root.style.setProperty("--side", st.w + "px"); });
    grip.addEventListener("pointerup", () => { if (!drag) return; drag = null; grip.classList.remove("on"); apply(); save(); });
    grip.addEventListener("dblclick", () => { st.w = 380; apply(); save(); });
    addEventListener("resize", () => { root.style.setProperty("--side", clampW(st.w) + "px"); });
    document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest(".tabs button"); if (t) t.scrollIntoView({ block: "nearest", inline: "center" }); });
    apply();
  })();
  // ---- AI design panel (Real Play): collapse to give the canvas the full width back, and resize
  // (drag the grip, or Expand toward half the screen) for when the brief/options scroll too much
  // in a narrow fixed column -- same persisted collapse+resize pattern as the side panel above,
  // but scoped to the AI workspace only, and its own width so the two don't fight over one var.
  (function aiDeckPanel() {
    if (!aiWorkspace) return;
    const PK = "archlab.deck.v1";
    let st = { hidden: false, w: 420 };
    try { st = Object.assign(st, JSON.parse(localStorage.getItem(PK)) || {}); } catch (e) { /* ignore */ }
    const root = document.documentElement, save = () => { try { localStorage.setItem(PK, JSON.stringify(st)); } catch (e) { /* ignore */ } };
    const hideBtn = $("#deckHide"), showBtn = $("#deckShow"), wideBtn = $("#deckWide"), grip = $("#deckGrip");
    if (!hideBtn || !showBtn || !wideBtn || !grip) return;
    const clampW = (w) => Math.max(340, Math.min(Math.round(innerWidth * 0.5), w));
    const apply = () => {
      root.style.setProperty("--deck-w", clampW(st.w) + "px");
      document.body.classList.toggle("ai-deck-hidden", !!st.hidden);
      showBtn.hidden = !st.hidden;
      wideBtn.textContent = st.w >= Math.round(innerWidth * 0.4) ? "⤡ Shrink" : "⤢ Expand";
      requestAnimationFrame(() => requestAnimationFrame(() => { syncCanvasViewport(); fitView(); }));
    };
    hideBtn.onclick = () => { st.hidden = true; apply(); save(); };
    showBtn.onclick = () => { st.hidden = false; apply(); save(); };
    wideBtn.onclick = () => { st.w = st.w >= Math.round(innerWidth * 0.4) ? 420 : Math.round(innerWidth * 0.5); apply(); save(); };
    let drag = null;
    grip.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, w: clampW(st.w) }; grip.classList.add("on"); grip.setPointerCapture(e.pointerId); e.preventDefault(); });
    grip.addEventListener("pointermove", (e) => { if (!drag) return; st.w = clampW(drag.w - (e.clientX - drag.x)); root.style.setProperty("--deck-w", st.w + "px"); });
    grip.addEventListener("pointerup", () => { if (!drag) return; drag = null; grip.classList.remove("on"); apply(); save(); });
    grip.addEventListener("dblclick", () => { st.w = 420; apply(); save(); });
    addEventListener("resize", () => { root.style.setProperty("--deck-w", clampW(st.w) + "px"); });
    apply();
  })();
  // ---- Control Room embed: the top bar (File menu, title, tools) is hidden so the Control
  // Room owns navigation, but that also hid Select/Pan/Connect/Undo/Zoom with no replacement --
  // move that toolbar onto the canvas itself instead of leaving it unreachable. Only in the embed;
  // the standalone app keeps its normal top bar untouched.
  (function embedToolbar() {
    if (!document.documentElement.classList.contains("control-room-embed")) return;
    const tools = $("#bar .tools"), stage = $("#stage");
    if (!tools || !stage) return;
    // Examples (~100 real designs to browse and load while you draw) is a separate button+dropdown
    // from .tools, not covered by the move above -- without this it stayed trapped inside #bar too,
    // with the rest of the top bar hidden and no other way to reach it in the embed.
    const examplesBtn = $("#mPreset"), examplesMenu = $("#presetMenu");
    if (examplesBtn && examplesMenu) { tools.insertBefore(examplesBtn, tools.firstChild); tools.insertBefore(examplesMenu, tools.firstChild); }
    stage.appendChild(tools);
    // theme.js (a separate script, loaded in <head>) mounts its own Light/Dark/Auto button into
    // "#bar .tools" on DOMContentLoaded by looking it up fresh at that moment -- relying on it to
    // run before this relocation (or re-finding it after) is a cross-script timing race that was
    // silently losing the button entirely. Give the embed its own color-mode toggle instead, so it
    // never depends on when/whether theme.js's own mount happened to fire relative to this script.
    if ($("#themeBtn")) return;
    const K = "archlab.theme", LABEL = { auto: "🌓 Auto", light: "☀️ Light", dark: "🌙 Dark" };
    let mode = "auto";
    try { mode = localStorage.getItem(K) || "auto"; } catch (e) { /* ignore */ }
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "themeBtn";
    const paint = () => {
      if (mode === "auto") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", mode);
      btn.textContent = LABEL[mode]; btn.title = "Color mode: " + mode + " (click to change)";
    };
    btn.onclick = () => { mode = mode === "auto" ? "dark" : mode === "dark" ? "light" : "auto"; try { localStorage.setItem(K, mode); } catch (e) { /* ignore */ } paint(); };
    paint();
    tools.appendChild(btn);
  })();
  // ---- Budget & cost plan: every node on this one canvas (Level 1, 2 and 3 together) is priced.
  function costNow() {
    if (!C || !doc || !doc.nodes.length) return null;
    const r = C.sizeAndPrice(graphForSim(), doc.scenario, (+doc.scenario.base || 1000) * costOpts.trafficMult, "asis", false);
    return r.error ? null : r.total;
  }
  function paintCostPill() {
    const pill = $("#costPill"); if (!pill) return;
    if (costLast == null) { pill.textContent = ""; return; }
    const d = Math.round(costDelta);
    pill.innerHTML = `≈${money(costLast)}/mo` + (d ? ` <i class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${money(Math.abs(d))}</i>` : "");
  }
  function scheduleCost() {
    clearTimeout(costTimer);
    costTimer = setTimeout(() => {
      const now = costNow(); costDelta = costLast != null && now != null ? now - costLast : 0; costLast = now; paintCostPill();
      if ($("#costPlan") && $("#costPlan").open) renderCostPlan();
      paintLintPill(); paintReqPill(); paintSimPill(); if ($("#lintDlg") && $("#lintDlg").open) renderChecks();
    }, 450);
  }
  // ---- AI change preview: nothing the AI proposes touches the canvas until the user approves it.
  const DF = window.LabDiff;
  let pendingApply = null;
  function previewArchitect() {
    const r = architectResult; if (!r || r.error) return;
    previewChange({
      title: "AI Architect proposal: " + (r.document.name || "new architecture"),
      next: r.document,
      benefits: [r.explanation].filter(Boolean),
      risks: (r.risks || []).concat((r.assumptions || []).map((x) => "Assumption: " + x)),
      onApply: () => { useDocument(JSON.parse(JSON.stringify(r.document)), true); architectApplied = true; sel = { node: null, edge: null }; deepPart = ""; levelPath = [{ level: 1, key: "1", node: null }]; levelCache.clear(); tab = aiWorkspace ? "architect" : "inspect"; updSide(); say("Applied the AI architecture. Undo (Ctrl+Z) brings your previous canvas back."); },
    });
  }
  function priceOf(d) {
    if (!C) return null;
    const sc = d.scenario || doc.scenario;
    const r = C.sizeAndPrice({ nodes: d.nodes.map((n) => ({ id: n.id, type: n.type, props: n.props || {} })), edges: d.edges }, sc, (+sc.base || 1000) * costOpts.trafficMult, "asis", false);
    return r.error ? null : r.total;
  }
  function previewChange(o) {
    const dlg = $("#changeDlg"), body = $("#changeBody");
    if (!dlg || !body || !DF) { if (window.confirm("Replace the canvas with the AI proposal?")) o.onApply(); return; }
    const next = Object.assign({ scenario: doc.scenario, slo: doc.slo, requirements: doc.requirements }, JSON.parse(JSON.stringify(o.next)));
    const d = DF.diff(doc, next, (n) => (n.props && n.props.name) || (S.BY_ID[n.type] || {}).name || n.type), c0 = priceOf(doc), c1 = priceOf(next);
    const l0 = LINT ? LINT.lint(doc, { rps: +doc.scenario.base || 1000 }) : null;
    const l1 = LINT ? LINT.lint(next, { rps: +(next.scenario || doc.scenario).base || 1000 }) : null;
    const key = (f) => f.id + "|" + f.title;
    const newF = l0 && l1 ? l1.findings.filter((f) => !l0.findings.some((g) => key(g) === key(f))) : [];
    const fixedF = l0 && l1 ? l0.findings.filter((f) => !l1.findings.some((g) => key(g) === key(f))) : [];
    const list = (items, fmt, max) => {
      const m = max || 12;
      if (!items.length) return `<p class="muted">None.</p>`;
      return `<ul>${items.slice(0, m).map((x) => `<li>${fmt(x)}</li>`).join("")}${items.length > m ? `<li class="muted">and ${items.length - m} more</li>` : ""}</ul>`;
    };
    const nm = (x) => { const t = (S.BY_ID[x.type] || {}).name || x.type; return esc(x.name) + (t !== x.name ? ` <small>${esc(t)}</small>` : ""); };
    const delta = c0 != null && c1 != null ? c1 - c0 : null;
    pendingApply = o.onApply;
    $("#changeTitle").textContent = o.title;
    body.innerHTML = `
      <p class="cost-note">This is a preview. Your canvas has not changed. Apply replaces it with the proposal below; Undo brings your current canvas back.</p>
      <div class="change-stats">
        <div><span>Boxes</span><b>+${d.added.length} / −${d.removed.length} / ~${d.changed.length}</b></div>
        <div><span>Wires</span><b>+${d.edgesAdded.length} / −${d.edgesRemoved.length}</b></div>
        <div><span>Monthly estimate</span><b>${c0 == null ? "—" : money(c0)} → ${c1 == null ? "—" : money(c1)}</b>${delta != null ? `<small class="${delta > 0 ? "up" : "down"}">${delta >= 0 ? "+" : "−"}${money(Math.abs(delta))}/month</small>` : ""}</div>
        <div><span>Blocking checks</span><b>${l0 ? l0.blocking : "—"} → ${l1 ? l1.blocking : "—"}</b><small>${newF.length} new · ${fixedF.length} resolved</small></div>
      </div>
      <div class="change-cols">
        <section><h3>Boxes added</h3>${list(d.added, nm)}<h3>Boxes removed</h3>${list(d.removed, nm)}<h3>Boxes changed</h3>${list(d.changed, (x) => nm(x) + `<small>${x.fields.map((f) => esc(f.key)).join(", ")}</small>`)}</section>
        <section><h3>Wires added</h3>${list(d.edgesAdded, esc, 10)}<h3>Wires removed</h3>${list(d.edgesRemoved, esc, 10)}</section>
      </div>
      ${o.changesList && o.changesList.length ? `<h3>What this change does</h3>${list(o.changesList, esc, 20)}` : ""}
      ${o.benefits && o.benefits.length ? `<h3>Why</h3>${o.benefits.map((b) => `<p>${esc(b)}</p>`).join("")}` : ""}
      <h3>Risks and assumptions</h3>${list(o.risks || [], esc)}
      <h3>New check findings</h3>${list(newF, (f) => `<span class="lint-sev ${f.sev}">${esc(f.sev)}</span> ${esc(f.title)}`)}
      <h3>Findings it resolves</h3>${list(fixedF, (f) => esc(f.title))}
      <p class="cost-foot">Cost is the teaching estimate at the current traffic. The explanation comes from a local model, so check it against the findings above.</p>
      <div class="btnrow change-actions"><button class="primary-sm" id="changeApply">Apply to canvas</button><button id="changeCancel">Keep my canvas</button></div>`;
    dlg.showModal();
  }
  // ---- Versions: named snapshots of the canvas with a fingerprint, compare, restore (previewed) and approval.
  const VKEY = KEY + ".versions";
  function loadVersions() { try { const v = JSON.parse(localStorage.getItem(VKEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function storeVersions(list) { try { localStorage.setItem(VKEY, JSON.stringify(list.slice(0, 40))); return true; } catch (e) { say("Could not save versions in this browser (storage full or blocked)."); return false; } }
  let verCompare = null;
  function docCore(d) { return { name: d.name, nodes: d.nodes, edges: d.edges, scenario: d.scenario, slo: d.slo, requirements: d.requirements || {} }; }
  function saveVersion(label) {
    const list = loadVersions(), full = JSON.parse(JSON.stringify(doc)), h = DF.hash(docCore(full));
    if (list[0] && list[0].hash === h) { say("This exact design is already saved as “" + list[0].name + "”."); return; }
    const lint = LINT ? LINT.lint(doc, { rps: +doc.scenario.base || 1000, monthlyCost: costLast }) : null;
    list.unshift({ id: "v" + Date.now().toString(36), name: label || "Version " + (list.length + 1), at: new Date().toISOString(), hash: h, cost: costLast, blocking: lint ? lint.blocking : null, doc: full });
    if (storeVersions(list)) say("Saved version “" + list[0].name + "” (" + h + ").");
  }
  function renderVersions() {
    const body = $("#verBody"); if (!body) return;
    const list = loadVersions(), cur = DF.hash(docCore(doc));
    let reviewer = ""; try { reviewer = localStorage.getItem("archlab.reviewer") || ""; } catch (e) { /* ignore */ }
    const cmp = verCompare && list.find((v) => v.id === verCompare);
    let cmpHtml = "";
    if (cmp) {
      const d = DF.diff(cmp.doc, doc, (n) => (n.props && n.props.name) || (S.BY_ID[n.type] || {}).name || n.type), c1 = costLast, c0 = cmp.cost;
      const li = (arr, f) => arr.length ? arr.slice(0, 10).map((x) => `<li>${f(x)}</li>`).join("") + (arr.length > 10 ? `<li class="muted">and ${arr.length - 10} more</li>` : "") : `<li class="muted">none</li>`;
      cmpHtml = `<section class="ver-compare"><h3>“${esc(cmp.name)}” → current canvas</h3>${d.empty ? `<p class="muted">No differences: the canvas matches this version.</p>` : `
        <div class="change-stats"><div><span>Boxes</span><b>+${d.added.length} / −${d.removed.length} / ~${d.changed.length}</b></div><div><span>Wires</span><b>+${d.edgesAdded.length} / −${d.edgesRemoved.length}</b></div><div><span>Monthly estimate</span><b>${c0 == null ? "—" : money(c0)} → ${c1 == null ? "—" : money(c1)}</b>${c0 != null && c1 != null ? `<small class="${c1 > c0 ? "up" : "down"}">${c1 >= c0 ? "+" : "−"}${money(Math.abs(c1 - c0))}/month</small>` : ""}</div></div>
        <div class="change-cols"><section><h4>Added since</h4><ul>${li(d.added, (x) => esc(x.name))}</ul><h4>Removed since</h4><ul>${li(d.removed, (x) => esc(x.name))}</ul><h4>Changed since</h4><ul>${li(d.changed, (x) => esc(x.name) + ` <small>${x.fields.map((f) => esc(f.key)).join(", ")}</small>`)}</ul></section>
        <section><h4>Wires added</h4><ul>${li(d.edgesAdded, esc)}</ul><h4>Wires removed</h4><ul>${li(d.edgesRemoved, esc)}</ul>${d.scenarioChanged ? `<p>Traffic or goals changed.</p>` : ""}</section></div>`}</section>`;
    }
    body.innerHTML = `
      <p class="cost-note">A version is a frozen copy of the whole canvas (every level, traffic and goals) with a fingerprint. Versions are kept in this browser. Restoring shows a preview first; approving records who signed off on that exact fingerprint.</p>
      <section class="cost-inputs"><label>Name <input id="verName" type="text" maxlength="60" placeholder="e.g. Lean MVP after review"></label><button class="primary-sm" type="button" data-ver-save="1">Save current canvas</button><span class="muted">Current fingerprint <code>${cur}</code></span>
        <label>Approver <input id="verReviewer" type="text" maxlength="60" value="${esc(reviewer)}" placeholder="your name"></label></section>
      ${list.length ? `<table class="cost-table ver-table"><thead><tr><th>Version</th><th>Saved</th><th>Fingerprint</th><th>Est. / month</th><th>Blocking</th><th>Approval</th><th></th></tr></thead><tbody>${list.map((v) => `<tr class="${v.hash === cur ? "is-current" : ""}">
        <td><b>${esc(v.name)}</b>${v.hash === cur ? `<small>matches the canvas</small>` : ""}</td><td>${esc(new Date(v.at).toLocaleString())}</td><td><code>${esc(v.hash)}</code></td><td>${v.cost == null ? "—" : money(v.cost)}</td><td>${v.blocking == null ? "—" : v.blocking}</td>
        <td>${v.approvedAt ? `✓ ${esc(v.approvedBy)}<small>${esc(new Date(v.approvedAt).toLocaleDateString())}</small>` : `<button type="button" data-ver-approve="${v.id}">Approve</button>`}</td>
        <td class="ver-actions"><button type="button" data-ver-compare="${v.id}">Compare</button><button type="button" data-ver-restore="${v.id}">Restore…</button><button type="button" data-ver-delete="${v.id}" title="Delete this version">✕</button></td></tr>`).join("")}</tbody></table>` : `<p class="muted">No versions yet. Save one before and after each big change so you can compare cost and risk.</p>`}
      ${cmpHtml}`;
  }
  function versionAction(t) {
    const list = loadVersions();
    if (t.dataset.verSave) { saveVersion(($("#verName").value || "").trim()); verCompare = null; return renderVersions(); }
    const id = t.dataset.verCompare || t.dataset.verRestore || t.dataset.verDelete || t.dataset.verApprove, v = list.find((x) => x.id === id); if (!v) return;
    if (t.dataset.verCompare) { verCompare = verCompare === id ? null : id; return renderVersions(); }
    if (t.dataset.verDelete) { if (!window.confirm("Delete version “" + v.name + "”? This cannot be undone.")) return; storeVersions(list.filter((x) => x.id !== id)); if (verCompare === id) verCompare = null; return renderVersions(); }
    if (t.dataset.verApprove) {
      const who = ($("#verReviewer").value || "").trim(); if (!who) { say("Type the approver's name first."); $("#verReviewer").focus(); return; }
      try { localStorage.setItem("archlab.reviewer", who); } catch (e) { /* ignore */ }
      v.approvedBy = who; v.approvedAt = new Date().toISOString(); storeVersions(list); say("Recorded approval of “" + v.name + "” (" + v.hash + ") by " + who + "."); return renderVersions();
    }
    if (t.dataset.verRestore) { $("#verDlg").close(); previewChange({ title: "Restore version: " + v.name, next: v.doc, benefits: ["Brings back the canvas saved on " + new Date(v.at).toLocaleString() + " (fingerprint " + v.hash + ")."], risks: [], onApply: () => { useDocument(JSON.parse(JSON.stringify(v.doc)), true); say("Restored “" + v.name + "”. Undo brings the previous canvas back."); } }); }
  }
  // ---- Readiness: level, score, blocking items, approvals and the downloadable report.
  const RP = window.LabReport;
  function readinessCtx() {
    const lint = lintNow(), plan = C ? C.plan({ nodes: doc.nodes, edges: doc.edges, scenario: doc.scenario, slo: doc.slo, requirements: doc.requirements }, costOpts) : null;
    const run = S.run(graphForSim(), doc.scenario, []);
    const normal = run.error ? null : { p95: run.summary.p95, availability: run.summary.availability, cost: run.summary.cost };
    const chaos = run.error ? null : chaosReadiness();
    return { doc, hash: DF.hash(docCore(doc)), lint, plan: plan && !plan.error ? plan : null, normal, chaos, scen: SCN ? runSimLab() : null, versions: loadVersions(), brief: architectDraft || (RQ ? RQ.brief(doc) : "") };
  }
  function renderReadiness() {
    const body = $("#readyBody"); if (!body) return;
    if (!RP) { body.innerHTML = `<p class="muted">The report module did not load.</p>`; return; }
    const ctx = readinessCtx(), a = RP.assess(ctx);
    body.innerHTML = `
      <p class="cost-note">Readiness comes only from evidence the tool has: the checks, the simulator, recorded requirements and a named approval of this exact canvas (fingerprint <code>${ctx.hash}</code>). Levels 3 to 5 need real tests, expert sign-off and production data, so the tool lists what they require but never awards them.</p>
      <div class="ready-top"><div class="ready-score"><b>${a.score}</b><span>/100 ready to implement</span></div>
        <ol class="ready-ladder">${a.LEVELS.map((l) => `<li class="${l.n < a.level ? "done" : l.n === a.level ? "now" : l.n > 2 ? "ext" : ""}"><b>${l.n}. ${esc(l.name)}</b><span>${esc(l.means)}</span></li>`).join("")}</ol></div>
      <h3>Score breakdown</h3><table class="cost-table ready-parts"><tbody>${a.parts.map((p) => `<tr><td><b>${esc(p.label)}</b><small>${esc(p.note)}</small></td><td>${p.got} / ${p.max}</td></tr>`).join("")}</tbody></table>
      <h3>Blocking implementation <small>${a.blocking.length}</small></h3>${a.blocking.length ? `<ul class="cost-lint">${a.blocking.map((b) => `<li class="${/^Critical/.test(b) ? "bad" : "warn"}"><i>${/^Critical/.test(b) ? "✖" : "▲"}</i><span>${esc(b)}</span></li>`).join("")}</ul>` : `<p class="muted">Nothing the tool can check is blocking. Next gate: ${esc(a.next.name)}.</p>`}
      <h3>Required human approvals</h3><table class="cost-table"><tbody>${a.approvals.map((x) => `<tr><td><b>${esc(x.role)}</b></td><td>${esc(x.status)}</td></tr>`).join("")}</tbody></table>
      <div class="btnrow change-actions"><button class="primary-sm" type="button" data-ready-download="1">Download readiness report (.md)</button><button type="button" data-ready-open="verBtn">Versions &amp; approval</button><button type="button" data-ready-open="lintBtn">Checks</button><button type="button" data-ready-open="costBtn">Cost plan</button></div>`;
  }
  function downloadReadiness() {
    const ctx = readinessCtx(), a = RP.assess(ctx);
    const md = RP.markdown(Object.assign({}, ctx, { a, byId: S.BY_ID, docs: DOCS.D || {}, stamp: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC" }));
    const blob = new Blob([md], { type: "text/markdown" }), url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = ((doc.name || "architecture").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "architecture") + "-readiness-" + ctx.hash + ".md";
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    say("Downloaded the readiness report for fingerprint " + ctx.hash + ".");
  }
  // ---- Design studio: requirements, fixes, options and component explanations.
  const RQ = window.LabReq, FX = window.LabFixes;
  const reqOpts = () => { const r = doc.requirements || {}; return { rps: +doc.scenario.base || 1000, cloud: r.cloud && r.cloud !== "any" ? r.cloud : "" }; };
  function paintReqPill() { const pill = $("#reqPill"); if (!pill || !RQ || !doc) return; const n = RQ.state(doc).questions.length; pill.textContent = n ? n + " open" : "done"; pill.className = n ? "warn" : "ok"; }
  function renderRequirements() {
    const body = $("#reqBody"); if (!body || !RQ) return;
    const st = RQ.state(doc), groups = [...new Set(st.fields.map((f) => f.group))], sugg = RQ.suggestedCompliance(doc), comp = (doc.requirements || {}).compliance || [];
    const input = (f) => {
      if (f.kind.startsWith("select:")) return `<select data-req="${f.key}">${f.kind.slice(7).split("|").map((o) => { const [v, l] = o.split("="); return `<option value="${esc(v)}" ${String(f.value) === v ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select>`;
      if (f.kind === "text") return `<input type="text" data-req="${f.key}" value="${esc(f.value || "")}" maxlength="${f.key === "idea" ? 600 : 80}" placeholder="${f.key === "idea" ? "e.g. Clinics book appointments online; patients get reminders by SMS" : ""}">`;
      return `<input type="number" data-req="${f.key}" value="${esc(f.value)}" min="0">`;
    };
    body.innerHTML = `
      <p class="cost-note">The canvas stays the source of truth; these answers set the traffic, goals and constraints that the simulator, checks, cost plan and readiness use. Anything you have not answered is shown as an <b>assumption</b>. Saved answers count as user-confirmed.</p>
      ${st.questions.length ? `<section class="req-questions"><h3>Clarifying questions <small>${st.questions.length} open</small></h3><ol>${st.questions.map((q) => `<li><b>${esc(q.label)}</b><span>${esc(q.why)} Using for now: <em>${esc(q.value === "" ? "not set" : q.value)}</em></span></li>`).join("")}</ol></section>` : `<p class="cost-sub"><b>All essential questions answered.</b></p>`}
      <form id="reqForm" class="req-form" onsubmit="return false">${groups.map((g) => `<fieldset><legend>${esc(g)}</legend>${st.fields.filter((f) => f.group === g).map((f) => `<label class="req-field ${f.confirmed ? "ok" : "assumed"}${f.key === "idea" ? " wide" : ""}"><span>${esc(f.label)} <i>${f.confirmed ? "confirmed" : "assumed"}</i></span>${input(f)}<small>${esc(f.why)}</small></label>`).join("")}</fieldset>`).join("")}</form>
      <p class="cost-sub">Compliance: ${comp.length ? comp.map((x) => x.toUpperCase()).join(", ") : (doc.requirements || {}).complianceNone ? "none apply" : "not recorded"}${sugg.length ? ` · the data you handle suggests ${sugg.map((x) => x.toUpperCase()).join(", ")}` : ""}. Set it under Checks.</p>
      ${st.assumptions.length ? `<details class="req-assume"><summary>Assumptions in use (${st.assumptions.length})</summary><ul>${st.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>` : ""}
      <div class="btnrow change-actions"><button class="primary-sm" type="button" data-req-save="1">Save my answers</button><button type="button" data-req-brief="1">Save and use as AI Architect brief</button><button type="button" data-req-accept="1" title="Confirms every value shown, including the assumed ones">Accept all shown values…</button></div>`;
    $$("#reqForm [data-req]").forEach((el) => { const mark = () => { el.dataset.touched = "1"; el.closest(".req-field").classList.add("edited"); }; el.addEventListener("input", mark); el.addEventListener("change", mark); });
  }
  function saveRequirements(useAsBrief, acceptAll) {
    // Only what the user typed or chose (or explicitly accepted) becomes "user-confirmed"; untouched
    // assumed values stay assumptions, so the readiness score cannot be inflated by pressing Save.
    const answers = {}, st = RQ.state(doc).fields;
    $$("#reqForm [data-req]").forEach((el) => { const f = st.find((x) => x.key === el.dataset.req); if (!f) return; if (f.confirmed || el.dataset.touched || acceptAll) answers[f.key] = el.value; });
    doc = RQ.apply(doc, answers); commit();
    if (useAsBrief || !architectDraft) { const b = RQ.brief(doc); if (b) architectDraft = b; }
    if (aiWorkspace) renderArchitect();
    renderRequirements(); paintReqPill();
    const msg = useAsBrief ? "Saved. The AI Architect brief now uses these answers." : "Saved your answers. Traffic and goals on the canvas were updated.";
    say(msg);
    const acts = $("#reqDlg .change-actions"); if (acts) acts.insertAdjacentHTML("afterbegin", `<p class="req-saved" role="status">✓ ${esc(msg)}</p>`);   // the banner is behind the open popup
  }
  function fixPreview(title, result, why) {
    if (!result.changes.length) { say("Nothing to change automatically for that."); return; }
    previewChange({ title, next: result.doc, benefits: [why].filter(Boolean), risks: ["Automatic fixes use generic parts and teaching sizes; rename and size them for your stack.", "Review new wires: they change how traffic flows in the simulator."], changesList: result.changes, onApply: () => { useDocument(JSON.parse(JSON.stringify(result.doc)), true); say("Applied: " + result.changes.join("; ") + ". Undo brings the previous canvas back."); } });
  }
  function lintFixAction(t) {
    const r = lintNow(); if (!r || !FX) return;
    if (t.dataset.lintFix != null) { const f = r.findings[+t.dataset.lintFix]; if (!f) return; $("#lintDlg").close(); fixPreview("Fix: " + f.title, FX.applyFix(doc, f, reqOpts()), f.fix); return; }
    if (t.dataset.lintFixAll) { $("#lintDlg").close(); fixPreview("Fix all blocking findings", FX.fixBlocking(doc, reqOpts()), "Applies the automatic fix for every critical and high finding, re-checking after each one."); return; }
    if (t.dataset.optimize) { $("#lintDlg").close(); fixPreview("Optimize for " + t.dataset.optimize, FX.optimize(doc, t.dataset.optimize, reqOpts()), "Applies every automatic fix in the " + t.dataset.optimize + " group."); }
  }
  let optCache = null;
  function renderOptions() {
    const body = $("#optBody"); if (!body || !FX) return;
    optCache = FX.options(doc, reqOpts());
    const r = doc.requirements || {}, rec = r.priority === "lowest" || r.priority === "speed" ? "A" : r.priority === "ha" || +doc.slo.avail >= 99.95 ? "C" : "B";
    const cards = optCache.map((o) => {
      const base0 = priceOf(o.doc), price = base0 == null ? null : o.doc.dr ? base0 * 1.5 : base0, l = LINT ? LINT.lint(o.doc, { rps: +doc.scenario.base || 1000 }) : null;   /* DR: warm standby at half size, as in the cost plan */
      const svc = o.doc.nodes.filter((n) => !["source", "passive"].includes((S.BY_ID[n.type] || {}).cls)).length;
      return `<article class="${o.key === rec ? "rec" : ""}"><header><b>${o.key}. ${esc(o.name)}</b><span>${o.key === rec ? "fits your requirements" : ""}</span></header>
        <p>${esc(o.note)}</p>
        <div class="cost-range">${price == null ? "—" : money(price)}<small>/month estimate at the canvas traffic${o.doc.dr ? `, including a warm standby region (${money(base0)} without it)` : ""}</small></div>
        <dl><dt>Components</dt><dd>${o.doc.nodes.length} (${svc} running services and stores)</dd><dt>Blocking findings</dt><dd>${l ? l.blocking : "—"} · ${l ? l.findings.length : "—"} total</dd><dt>Changes from your canvas</dt><dd>${o.changes.length ? `<ul>${o.changes.slice(0, 8).map((c) => `<li>${esc(c)}</li>`).join("")}${o.changes.length > 8 ? `<li class="muted">and ${o.changes.length - 8} more</li>` : ""}</ul>` : "None: your canvas already matches this option."}</dd></dl>
        <div class="btnrow"><button class="primary-sm" type="button" data-opt-apply="${o.key}">Preview and apply</button></div></article>`;
    }).join("");
    const st = STU ? STU.recommendStyle(doc) : null;
    const styleCard = st ? `<section class="opt-style"><h3>Architecture style: ${esc(st.style)}</h3><p>MVP: <b>${st.mvpServices}</b> deployable service${st.mvpServices === 1 ? "" : "s"} · scale stage: <b>${st.scaleServices}</b> · drawn now: <b>${st.drawnServices}</b> · confidence ${Math.round(st.confidence * 100)}%</p><ul>${st.why.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="muted">Based on: ${esc(st.basis.join("; "))}. Risk if wrong: ${esc(st.riskIfWrong)}</p>
      <details><summary>Alternatives, and when to split a service out</summary><ul>${st.alternatives.map((a) => `<li><b>${esc(a.name)}</b>: when ${esc(a.when)}. Trade-off: ${esc(a.tradeoff)}.</li>`).join("")}</ul><p><b>Split only when:</b> ${esc(st.splitWhen.join(" / "))}</p><p><b>Validate:</b> ${esc(st.validate.join(" "))}</p></details>
      ${st.simplify.length >= 2 ? `<div class="btnrow"><button type="button" data-opt-simplify="1">Simplify: merge ${st.simplify.length} services into a modular monolith…</button></div>` : ""}</section>` : "";
    body.innerHTML = `<p class="cost-note">Three versions of <b>your</b> canvas, built by the same rules as Checks and priced by the same model as the cost plan. Nothing changes until you preview one and press Apply. Each applied option stays fully editable.</p>${styleCard}
      <div class="cost-opts">${cards}</div>
      <div class="btnrow change-actions"><button type="button" data-opt-save="1">Save all three as versions (to compare later)</button></div>`;
  }
  function optionAction(t) {
    if (!optCache) return;
    if (t.dataset.optApply) { const o = optCache.find((x) => x.key === t.dataset.optApply); if (!o) return; $("#optDlg").close(); previewChange({ title: "Option " + o.key + ": " + o.name, next: o.doc, benefits: [o.note], risks: ["Generated from rules, not from an AI model: check names, sizes and wiring before building."], changesList: o.changes, onApply: () => { useDocument(JSON.parse(JSON.stringify(o.doc)), true); say("Applied option " + o.key + ". Undo brings your previous canvas back."); } }); return; }
    if (t.dataset.optSave) { const list = loadVersions(); optCache.slice().reverse().forEach((o) => { const full = JSON.parse(JSON.stringify(o.doc)); list.unshift({ id: "v" + Date.now().toString(36) + o.key, name: "Option " + o.key + " · " + o.name, at: new Date().toISOString(), hash: DF.hash(docCore(full)), cost: priceOf(full), blocking: LINT ? LINT.lint(full, { rps: +doc.scenario.base || 1000 }).blocking : null, doc: full }); }); if (storeVersions(list)) say("Saved the three options as versions. Open Versions to compare or restore them."); }
  }
  // ---- Simulation Lab: named scenarios with what-if controls; every fix goes through the preview.
  let simW = { trafficMult: 1, aiMult: 1, off: "", slow: "", target: "", avail: "", budget: "" }, simRes = null, simKey = "";
  const simWhatIf = () => ({ trafficMult: +simW.trafficMult || 1, aiMult: simW.aiMult === "" ? 1 : +simW.aiMult, off: simW.off && node(simW.off) ? [simW.off] : [], slow: simW.slow && node(simW.slow) ? [simW.slow] : [], target: simW.target && node(simW.target) ? simW.target : undefined, avail: simW.avail ? +simW.avail : undefined, budget: simW.budget ? +simW.budget : undefined });
  const simFingerprint = () => DF.hash(docCore(doc)) + JSON.stringify(simW);
  function runSimLab(force) {
    if (!SCN) return null;
    const k = simFingerprint(); if (!force && simRes && simKey === k) return simRes;
    simRes = SCN.runAll(doc, simWhatIf()); simKey = k; paintSimPill(); return simRes;
  }
  function paintSimPill() {
    const p = $("#simPill"); if (!p || !doc) return;
    if (!simRes) { p.textContent = ""; return; }
    const stale = simKey !== simFingerprint(); p.textContent = stale ? "re-run" : simRes.score + "/100"; p.className = stale ? "" : simRes.fail ? "warn" : "ok";
  }
  function simCard(x) {
    const V = { Pass: "ok", Degraded: "warn", Fail: "bad", "N/A": "na" }[x.verdict] || "na", m = x.metrics, pc = (v) => (v * 100).toFixed(2) + "%";
    const tiles = m ? [["Availability", pc(m.availability)], ["Lowest", pc(m.minOk)], ["p95", Math.round(m.p95) + " ms"], ["Errors", pc(m.errorRate)], ["Peak", num(m.peakRps) + " req/s"], m.queueDepth ? ["Queue depth", num(m.queueDepth)] : null, m.dbLoad ? ["DB load", Math.round(m.dbLoad * 100) + "%"] : null, m.cacheHit != null ? ["Cache hit", Math.round(m.cacheHit * 100) + "%"] : null, ["Cloud", money(m.cost) + "/mo"], x.ai && x.ai.monthly ? ["AI tokens", money(x.ai.monthly) + "/mo"] : null, ["Error budget", Math.round(m.budgetUsed * 100) + "% used"]].filter(Boolean) : [];
    const li = (arr) => arr.map((s) => `<li>${esc(s)}</li>`).join("");
    const canFix = (x.patch && x.patch.changes.length) || (FX && x.fixIds && x.fixIds.length && FX.applyAll(doc, [...new Set(x.fixIds)], reqOpts()).changes.length);   // no button when every fix is already in place
    return `<article class="sim-card ${V}"><header><span class="sim-v ${V}">${esc(x.verdict)}</span><b>${esc(x.name)}</b><small>${esc(x.basis || "")}</small></header>
      <p>${esc(x.summary || "")}</p>
      ${tiles.length ? `<div class="sim-tiles">${tiles.map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join("")}</div>` : ""}
      ${m && m.bottlenecks.length ? `<p class="sim-k"><b>Bottlenecks</b> ${esc(m.bottlenecks.map((b) => b.down ? b.name + " (down)" : `${b.name} ${Math.round(b.util * 100)}%`).join(", "))}</p>` : ""}
      ${x.alerts ? `<p class="sim-k"><b>Alerts fired</b> ${x.alerts.length ? esc(x.alerts.join(" · ")) : "none"}${x.alertNote ? ` <small>${esc(x.alertNote)}</small>` : ""}</p>` : ""}
      ${x.failover && x.failover.length ? `<p class="sim-k"><b>Failover path</b> ${esc(x.failover.join(" · "))}</p>` : ""}
      ${x.checks ? `<ul class="sim-checks">${x.checks.map((c) => `<li class="${c.ok ? "ok" : "bad"}">${c.ok ? "✓" : "✖"} ${esc(c.c)}</li>`).join("")}</ul>` : ""}
      ${x.rows ? `<table class="cost-table"><thead><tr><th>Store</th><th>RPO</th><th>RTO</th></tr></thead><tbody>${x.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.rpo)}</td><td>${esc(r.rto)}</td></tr>`).join("")}</tbody></table>` : ""}
      ${x.notes && x.notes.length ? `<ul class="sim-notes">${li(x.notes)}</ul>` : ""}
      <div class="btnrow">${x.live ? `<button type="button" data-sim-play="${x.key}">▶ Play on canvas</button>` : ""}${x.path && x.path.length ? `<button type="button" data-sim-path="${x.key}">Show on canvas</button>` : ""}${canFix ? `<button type="button" class="${x.verdict === "Pass" ? "" : "primary-sm"}" data-sim-fix="${x.key}">${x.verdict === "Pass" ? "Improve…" : "Preview fix…"}</button>` : ""}</div></article>`;
  }
  function renderSimLab() {
    const body = $("#simBody"); if (!body) return;
    if (!SCN) { body.innerHTML = `<p class="muted">The simulation module did not load.</p>`; return; }
    const r = runSimLab(), opts = doc.nodes.filter((n) => !["source", "passive"].includes(S.BY_ID[n.type].cls)).map((n) => [n.id, n.props.name || S.BY_ID[n.type].name]);
    const pick = (k, label, hint) => `<label title="${esc(hint)}">${label} <select data-simw="${k}"><option value="">—</option>${opts.map(([id, nm]) => `<option value="${esc(id)}" ${simW[k] === id ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select></label>`;
    const groups = [...new Set(SCN.LIST.map((s) => s.group))];
    body.innerHTML = `
      <p class="cost-note">Traffic and failure scenarios run the simulator for one hour (incidents from minute 15 to 30) with its <b>teaching numbers</b>. Security and AI scenarios check the <b>paths drawn on the canvas</b>. A Pass here means the design survives the model, not that it is production-proven: confirm with real load, chaos and security tests (readiness level 3).</p>
      <section class="cost-inputs" aria-label="What-if controls"><b>What if</b>
        <label>Traffic <input type="range" min="0.25" max="10" step="0.25" value="${simW.trafficMult}" data-simw="trafficMult"><output>${simW.trafficMult}×</output></label>
        <label>AI requests <input type="range" min="0" max="10" step="0.5" value="${simW.aiMult}" data-simw="aiMult"><output>${simW.aiMult}×</output></label>
        <label>Availability goal <select data-simw="avail"><option value="">canvas (${doc.slo.avail}%)</option>${[99, 99.5, 99.9, 99.95, 99.99].map((v) => `<option value="${v}" ${String(simW.avail) === String(v) ? "selected" : ""}>${v}%</option>`).join("")}</select></label>
        <label>Budget $/mo <input type="number" min="0" step="100" data-simw="budget" value="${esc(simW.budget)}" placeholder="${esc(doc.slo.budget)}"></label>
        ${pick("off", "Turn off", "This box is down for the whole hour in every scenario")}${pick("slow", "Add latency to", "This box is 4× slower with 40% capacity for the whole hour")}${pick("target", "Fail in outage tests", "Which service the slow-service and outage scenarios hit (default: the busiest)")}
        <button type="button" class="primary-sm" data-sim-run="1">Re-run all</button>
        <small class="muted">To change a component's provider or region, select it on the canvas (Swap / Region); the next run uses it.</small></section>
      <div class="sim-summary"><div class="ready-score"><b>${r.score}</b><span>/100 scenario score</span></div><span class="sim-v ok">${r.pass} pass</span><span class="sim-v warn">${r.degraded} degraded</span><span class="sim-v bad">${r.fail} fail</span><span class="sim-v na">${r.na} not applicable</span></div>
      ${groups.map((g) => `<h3>${esc(g)}</h3><div class="sim-grid">${r.results.filter((x) => x.group === g).map(simCard).join("")}</div>`).join("")}
      <p class="cost-foot">Deterministic: the same canvas and what-if settings always give the same results. Fingerprint <code>${esc(DF.hash(docCore(doc)))}</code>.</p>`;
  }
  function simAction(t) {
    if (t.dataset.simRun) { runSimLab(true); return renderSimLab(); }
    const key = t.dataset.simPlay || t.dataset.simPath || t.dataset.simFix, x = simRes && simRes.results.find((r) => r.key === key); if (!x) return;
    $("#simDlg").close();
    if (t.dataset.simPlay) {
      stop(); chaos = {}; simWhatIf().off.forEach((id) => { down[id] = true; }); simWhatIf().slow.forEach((id) => { chaos["slow:" + id] = true; });
      const keys = x.live.chaos || [], short = keys.length && keys.every((k) => k === "dbDown" || k === "cacheFlush");
      // same timing as the scenario, compressed: 3 simulated minutes of normal traffic, the fault, then recovery
      playScript = keys.length ? { name: x.name, keys, from: 6, to: short ? 8 : 36, end: short ? 50 : 70 } : null;
      mult = x.live.mult || +simW.trafficMult || 1; $("#mult").value = Math.min(5, mult); $("#multOut").textContent = mult + "×";
      highlight = new Set(x.path || []); start(); paintChaos();
      say(`Playing “${x.name}” on the canvas: watch box load, failures and flows. ■ stops it.`); return;
    }
    if (t.dataset.simPath) { highlight = new Set(x.path); sel = { node: null, edge: null }; render(); say(`Showing the path for “${x.name}”. Click empty canvas or press Esc to clear.`); return; }
    let d = x.patch ? x.patch.doc : doc; const changes = x.patch ? x.patch.changes.slice() : [];
    if (FX && x.fixIds && x.fixIds.length) { const r2 = FX.applyAll(d, [...new Set(x.fixIds)], reqOpts()); d = r2.doc; changes.push(...r2.changes); }
    fixPreview("Fix for scenario: " + x.name, { doc: d, changes }, x.summary);
  }
  // ---- Export: design documents generated from the canvas
  let exportPreview = "";
  function exportCtx() {
    const plan = C ? C.plan({ nodes: doc.nodes, edges: doc.edges, scenario: doc.scenario, slo: doc.slo, requirements: doc.requirements }, costOpts) : null;
    return { doc, lint: lintNow(), plan: plan && !plan.error ? plan : null, scen: runSimLab(), reqState: RQ ? RQ.state(doc) : null, style: STU ? STU.recommendStyle(doc) : null, docs: DOCS.D || {}, hash: DF.hash(docCore(doc)), stamp: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC" };
  }
  const docSlug = () => (doc.name || "architecture").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "architecture";
  function renderExport() {
    const body = $("#exportBody"); if (!body) return;
    if (!EXP) { body.innerHTML = `<p class="muted">The export module did not load.</p>`; return; }
    const h = DF.hash(docCore(doc));
    body.innerHTML = `
      <p class="cost-note">Every document is generated from the current canvas (fingerprint <code>${esc(h)}</code>), the recorded requirements, the checks, the cost plan and the Simulation Lab. Each value is labelled <b>on canvas</b>, <b>user-confirmed</b>, <b>recommended</b>, <b>assumed</b> or <b>unknown</b>. Regenerate after any change; the fingerprint in each file tells you which canvas it describes.</p>
      <div class="exp-grid">${EXP.DOCS.map((d) => `<article><b>${esc(d.title)}</b><p>${esc(d.desc)}</p><div class="btnrow"><button type="button" class="primary-sm" data-exp-dl="${d.key}">Download .md</button><button type="button" data-exp-view="${d.key}">Preview</button></div></article>`).join("")}</div>
      <div class="btnrow change-actions"><button type="button" class="primary-sm" data-exp-all="1">Download the whole package (.md)</button><button type="button" data-ready-download="1">Readiness report (.md)</button></div>
      <h3>Project and sharing</h3>
      <div class="btnrow"><button type="button" data-act="save">Save project file</button><button type="button" data-act="open">Open project file…</button><button type="button" data-act="saveMemory">Save to YashAI memory</button><button type="button" data-act="openMemory">Open YashAI project…</button><button type="button" data-act="share">Copy share link</button><button type="button" data-act="prompt">Copy coding-agent prompt</button></div>
      ${exportPreview ? `<h3>Preview</h3><pre class="exp-pre">${esc(exportPreview)}</pre>` : ""}`;
  }
  function exportAction(t) {
    const ctx = exportCtx();
    if (t.dataset.expAll) { download(EXP.all(ctx), `${docSlug()}-architecture-package-${ctx.hash}.md`, "text/markdown"); say("Downloaded the full architecture package for fingerprint " + ctx.hash + "."); return; }
    const key = t.dataset.expDl || t.dataset.expView, md = EXP.generate(key, ctx);
    if (t.dataset.expDl) { download(md, `${docSlug()}-${key}-${ctx.hash}.md`, "text/markdown"); say("Downloaded " + (EXP.DOCS.find((d) => d.key === key) || {}).title + "."); return; }
    exportPreview = md; renderExport(); const pre = $("#exportBody .exp-pre"); if (pre) pre.scrollIntoView({ block: "start" });
  }
  // The settings people actually change, in the Inspect panel (Real Play hides the classic side inspector).
  function settingsHtml(n) {
    const d = S.BY_ID[n.type] || {}, p = n.props, c = d.cls, rows = [];
    const row = (label, input, hint) => rows.push(`<div class="set-row"><label>${label}${hint ? `<small>${hint}</small>` : ""}</label>${input}</div>`);
    if (["router", "proxy", "service"].includes(c)) row("Instances", numIn("inst", p.inst || 1, 1, 200), `Each handles about ${num(d.cap || 0)} req/s`);
    if (["proxy", "service"].includes(c)) row("Autoscaling", tog("auto", p.auto), "Adds instances under load");
    if (c === "router") row("High availability", tog("ha", p.ha), "Survives one load balancer failing");
    if (c === "cache") { row("Nodes", numIn("inst", p.inst || 1, 1, 24)); row("Hit rate", `<input type="number" data-p="hit" value="${p.hit == null ? d.hit : p.hit}" min="0" max="1" step="0.05">`, "Share of reads answered from the cache"); }
    if (c === "queue") row("Workers", numIn("workers", p.workers || 1, 1, 200), `Each drains about ${num(d.cap || 0)} msg/s`);
    if (c === "db") { row("Read replicas", numIn("replicas", p.replicas || 0, 0, 8), "Extra copies that serve reads"); row("Automatic failover", tog("ha", p.ha), "A standby takes over if it fails"); row("Shards", numIn("shards", p.shards || 1, 1, 32), skill === "beginner" ? "Split the data over several databases: more writes per second" : "Each shard takes its own writes"); }
    if (c === "limiter" && !d.waf) row("Limit (req/s)", numIn("limit", p.limit || d.cap, 1, 10000000, 100));
    if (c === "external") row("Calls per request", `<input type="number" data-p="ratio" value="${p.ratio == null ? 0.1 : p.ratio}" min="0" max="1" step="0.05">`, "Share of requests that call it");
    if (c === "source") row("Share of traffic", numIn("share", p.share == null ? 1 : p.share, 0, 100, 0.5));
    if (["proxy", "service"].includes(c) && skill !== "beginner") { row("Retries", numIn("retries", p.retries || 0, 0, 5)); row("Timeout (ms)", numIn("timeout", p.timeout || 1000, 10, 60000, 10)); row("Circuit breaker", tog("breaker", p.breaker), "Stops calling a failing dependency"); }
    if (!rows.length) return "";
    return `<h4>Settings</h4>${loadNote(n)}<div class="set-grid">${rows.join("")}</div>`;
  }
  function loadNote(n) {
    const u = lastRec && lastRec.nodes[n.id];
    const busy = u && S.BY_ID[n.type].cls !== "source" ? Math.round(u.util * 100) : null;
    if (u && u.down) return `<p class="set-load bad"><b>Down</b> Not answering right now. Automatic failover brings a standby up in seconds; read replicas keep reads working meanwhile.</p>`;
    const pk = Math.round(peakUtil(n.id) * 100);
    if (busy != null && pk >= 100 && pk > busy + 5) return `<p class="set-load bad"><b>${busy}% busy now, ${pk}% at the peak</b> When traffic peaks this box is overloaded and requests are dropped. Raise its capacity until the peak stays under 100%.</p>`;
    return busy == null ? "" : `<p class="set-load ${busy > 100 ? "bad" : busy > 70 ? "warn" : "ok"}"><b>${busy}% busy</b> ${busy > 100 ? "Overloaded: requests are dropped. Raise Instances (or add a cache in front)." : busy > 70 ? "Getting busy: little headroom left." : "Healthy."}</p>`;
  }
  function explainHtml(n) {
    const d = S.BY_ID[n.type] || {}, nm = (id) => { const x = node(id); return x ? esc(x.props.name || S.BY_ID[x.type].name) : id; };
    const info = ALTS && ALTS.info(n.type), lint = lintNow(), mine = lint ? lint.findings.map((f, i) => [f, i]).filter(([f]) => f.nodes.includes(n.id)) : [];
    let est = null; try { const r = C && C.sizeAndPrice(graphForSim(), doc.scenario, (+doc.scenario.base || 1000) * costOpts.trafficMult, "asis", false); est = r && r.rows && r.rows[n.id]; } catch (e) { /* not sizable */ }
    const outs = doc.edges.filter((e) => e.from === n.id).map((e) => nm(e.to)), ins = doc.edges.filter((e) => e.to === n.id).map((e) => nm(e.from));
    const alts = info ? info.alts.slice(0, 4).map((a) => { const ad = S.BY_ID[a.id] || {}; return `<li><b>${esc(ad.name || a.id)}</b>${ad.cost != null && d.cost ? ` <small>${ad.cost < d.cost ? "cheaper" : ad.cost > d.cost ? "pricier" : "similar price"}</small>` : ""}<span>Pick it when ${esc(a.pick)}.</span></li>`; }).join("") : "";
    return `<header><b>${esc(n.props.name || d.name)}</b><span>${esc(d.name)} · L${n.props.__aiLevel || 1}</span><button type="button" id="wirePanelClose" aria-label="Close panel">&times;</button></header><div class="wire-panel-body explain">
      <p>${esc((DOCS.D || {})[n.type] || "No description yet.")}</p>
      ${info ? `<p class="ex-pick"><b>Best when</b> ${esc(info.pick)}.</p><p class="ex-avoid"><b>Not a fit when</b> ${esc(info.avoid)}.</p>` : ""}
      <p class="ex-cost"><b>Estimate:</b> ${est ? money(est.cost) + "/month" + (est.need != null ? ` · ${est.inst} instance${est.inst === 1 ? "" : "s"} at the canvas traffic` : "") : "—"} <small>(teaching price)</small></p>
      ${settingsHtml(n)}
      <p><b>Calls:</b> ${outs.join(", ") || "nothing"}<br><b>Called by:</b> ${ins.join(", ") || "nothing"}</p>
      ${mine.length ? `<h4>Findings here (${mine.length})</h4><ul class="ex-findings">${mine.map(([f, i]) => `<li class="${f.sev}"><span class="lint-sev ${f.sev}">${esc(f.sev)}</span> ${esc(f.title)}${FX && FX.canFix(f) ? ` <button type="button" data-lint-fix="${i}">Fix…</button>` : ""}</li>`).join("")}</ul>` : `<p class="muted">No findings involve this component.</p>`}
      ${alts ? `<h4>Alternatives</h4><ul class="ex-alts">${alts}</ul>` : ""}
      <div class="ex-tools">${aiWorkspace && Number(n.props.__aiLevel || 1) < 3 ? `<button type="button" class="primary-sm" data-drill="${esc(n.id)}" title="Or double-click the box">Open internals (Level ${Number(n.props.__aiLevel || 1) + 1})</button>` : ""}<button type="button" data-pt="locked" data-v="${n.props.locked ? 0 : 1}">${n.props.locked ? "🔓 Unlock" : "🔒 Lock"}</button><button type="button" data-act="dup">Duplicate</button><button type="button" class="danger" data-act="delNode">Delete</button></div>
      <label class="ex-comment"><b>Comment</b><textarea data-pc="comment" rows="2" maxlength="500" placeholder="Decision, open question or TODO for this box">${esc(n.props.comment || "")}</textarea></label></div>`;
  }
  const LINT = window.LabLint, SEV_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Note" };
  const CAT_LABEL = { security: "Security", reliability: "Reliability", operations: "Operations", data: "Data", cost: "Cost", ai: "AI safety", compliance: "Compliance" };
  function lintNow() { return LINT && doc ? LINT.lint(doc, { rps: +doc.scenario.base || 1000, monthlyCost: costLast }) : null; }
  function paintLintPill() {
    const pill = $("#lintPill"), btn = $("#lintBtn"); if (!pill || !btn) return;
    const r = lintNow(); if (!r) { pill.textContent = ""; return; }
    const c = r.counts, worst = c.critical ? "critical" : c.high ? "high" : c.medium ? "medium" : "ok";
    btn.dataset.worst = worst;
    pill.textContent = c.critical + c.high ? `${c.critical + c.high} blocking` : c.medium + c.low ? `${c.medium + c.low} to review` : "clear";
  }
  function renderChecks() {
    const body = $("#lintBody"); if (!body) return;
    const r = lintNow(); if (!r) { body.innerHTML = `<p class="muted">The checks module did not load.</p>`; return; }
    const comp = new Set((doc.requirements || {}).compliance || []);
    const fw = [["gdpr", "GDPR"], ["hipaa", "HIPAA"], ["pci", "PCI DSS"], ["soc2", "SOC 2"], ["iso27001", "ISO 27001"]], none = !!(doc.requirements || {}).complianceNone;
    const c = r.counts;
    body.innerHTML = `
      <p class="cost-note">Rules run on everything drawn on this canvas, every level included, and update after each change. A finding marked <b>not on canvas</b> means the control may exist but is not drawn, so it is unknown. References name the standard each rule comes from; passing these checks is a design review step, not a certification.</p>
      <section class="cost-inputs" aria-label="Compliance needs"><b>Compliance needs</b>${fw.map(([k, l]) => `<button type="button" class="lint-fw" data-compliance="${k}" aria-pressed="${comp.has(k)}">${l}</button>`).join("")}<button type="button" class="lint-fw" data-compliance="none" aria-pressed="${none}">None apply</button><small class="muted">Your answer is treated as user-confirmed.</small></section>
      <div class="lint-counts">${["critical", "high", "medium", "low", "info"].map((k) => `<span class="lint-sev ${k}">${c[k]} ${SEV_LABEL[k]}</span>`).join("")}</div>
      ${FX ? `<div class="lint-actions">${r.blocking ? `<button class="primary-sm" type="button" data-lint-fix-all="1">Fix all blocking…</button>` : ""}<span>Optimize for</span>${["security", "reliability", "cost", "compliance"].map((g) => `<button type="button" data-optimize="${g}">${g[0].toUpperCase() + g.slice(1)}…</button>`).join("")}<small class="muted">Every fix opens a preview first.</small></div>` : ""}
      ${r.findings.length ? `<ol class="lint-list">${r.findings.map((f) => `<li class="lint-item ${f.sev}">
        <header><span class="lint-sev ${f.sev}">${SEV_LABEL[f.sev]}</span><span class="lint-cat">${esc(CAT_LABEL[f.cat] || f.cat)}</span><b>${esc(f.title)}</b></header>
        <p>${esc(f.detail)}</p>
        <p class="lint-fix"><b>Fix:</b> ${esc(f.fix)}</p>
        <p class="lint-meta">Reference: ${esc(f.ref)} · Basis: ${esc(f.basis)} · Confidence ${Math.round(f.confidence * 100)}%</p>
        <div class="lint-nodes">${FX && FX.canFix(f) ? `<button type="button" class="primary-sm" data-lint-fix="${r.findings.indexOf(f)}">Fix…</button>` : ""}${[...new Set(f.nodes)].slice(0, 6).map((id) => node(id) ? `<button type="button" data-lint-focus="${esc(id)}">Show ${esc(node(id).props.name || S.BY_ID[node(id).type].name)}</button>` : "").join("")}</div>
      </li>`).join("")}</ol>` : `<p class="muted">No findings. That means these rules found nothing, not that the design is safe: run the simulations and a human review next.</p>`}`;
  }
  function renderCostPlan() {
    const body = $("#costBody"); if (!body) return;
    if (!C) { body.innerHTML = `<p class="muted">The cost module did not load.</p>`; return; }
    const rq = doc.requirements || {}, rc = rq.confirmed || {}, reqKey = JSON.stringify([rq, rc]);
    // confirmed requirements seed the what-if inputs once; after that the user's changes here stick
    if (reqKey !== costSeededFrom) {
      costSeededFrom = reqKey;
      if (rc.cloud) costOpts.provider = rq.cloud === "any" ? "generic" : rq.cloud;
      if (rc.users12m || rc.usersLaunch) costOpts.users = +(rq.users12m || rq.usersLaunch) || 0;
      if (rc.priority) costOpts.priority = rq.priority === "speed" ? "lowest" : rq.priority;
      if (rc.availability) costOpts.uptime = +rq.availability;
      if (rc.environments) costOpts.envs = { staging: rq.environments !== "prod", dev: rq.environments === "full" };
    }
    const p = C.plan({ nodes: doc.nodes, edges: doc.edges, scenario: doc.scenario, slo: doc.slo, requirements: doc.requirements }, costOpts);
    if (p.error) { body.innerHTML = `<p class="cost-note bad">${esc(p.error)}</p>`; return; }
    const m = (x) => (x == null ? "—" : money(x)), budget = p.budget, over = (x) => (budget > 0 && x > budget ? "over" : "");
    const opt = (k, v, label) => `<option value="${v}" ${String(costOpts[k]) === String(v) ? "selected" : ""}>${label}</option>`;
    const sevIcon = { bad: "✖", warn: "▲", info: "●" };
    const lv = (c) => `<span class="cost-lv l${c.level}">L${c.level}</span>`;
    body.innerHTML = `
      <p class="cost-note">Estimates for learning trade-offs, built from the simulator's teaching price list and its own load figures. <b>Not provider quotes</b>: no live ${esc(p.provider.toUpperCase())} pricing was checked. Validate with the provider's pricing calculator and a load test before committing to a budget.</p>
      <section class="cost-inputs" aria-label="What-if inputs">
        <label>Provider <select data-cost-opt="provider">${opt("provider", "aws", "AWS")}${opt("provider", "azure", "Azure")}${opt("provider", "gcp", "Google Cloud")}${opt("provider", "generic", "Any / self-hosted")}</select></label>
        <label>Priority <select data-cost-opt="priority">${opt("priority", "lowest", "Lowest cost")}${opt("priority", "balanced", "Balanced")}${opt("priority", "performance", "High performance")}${opt("priority", "ha", "High availability")}</select></label>
        <label>Uptime goal <select data-cost-opt="uptime">${opt("uptime", 99.5, "99.5%")}${opt("uptime", 99.9, "99.9%")}${opt("uptime", 99.95, "99.95%")}${opt("uptime", 99.99, "99.99%")}</select></label>
        <label>Traffic <input type="range" min="0.1" max="10" step="0.1" value="${costOpts.trafficMult}" data-cost-opt="trafficMult"><output>${costOpts.trafficMult}× · ${num(p.base)} req/s</output></label>
        <label>Users <input type="number" min="0" step="100" value="${costOpts.users || ""}" placeholder="optional" data-cost-opt="users"></label>
        <label class="chk"><input type="checkbox" data-cost-env="staging" ${costOpts.envs.staging ? "checked" : ""}> Staging</label>
        <label class="chk"><input type="checkbox" data-cost-env="dev" ${costOpts.envs.dev ? "checked" : ""}> Dev</label>
      </section>
      <p class="cost-sub">Priority and uptime choose the recommended option below. Every provider is priced from the same teaching price list, so totals only change with traffic, environments and the design itself.</p>
      <h3>Monthly budget by scenario <small>${p.components.length} components across level${p.levels.length > 1 ? "s" : ""} ${p.levels.join(", ")} · budget ${budget ? money(budget) : "not set"}</small></h3>
      <div class="cost-scen">${p.scenarios.map((s) => `<div class="${over(s.total)}"><span>${esc(s.name)}</span><b>${s.key === "proto" ? "≈$0 cloud" : m(s.total)}</b><small>${s.rps ? num(s.rps) + " req/s · " : ""}${esc(s.note)}</small></div>`).join("")}</div>
      <p class="cost-sub">All environments (production${costOpts.envs.staging ? " + staging" : ""}${costOpts.envs.dev ? " + dev" : ""}): <b>${m(p.envTotal)}/month</b> · about <b>${p.perMillion < 1 ? "under $1" : money(p.perMillion)}</b> per million requests${p.perUser != null ? ` · <b>$${p.perUser.toFixed(2)}</b> per user per month` : ""}. Staging and dev are assumed at 50% and 25% of the MVP size.</p>
      <h3>Three options</h3>
      <div class="cost-opts">${p.options.map((o) => `<article class="${o.key === p.recommended ? "rec" : ""}"><header><b>${o.key}. ${esc(o.name)}</b><span>${esc(o.tag)}${o.key === p.recommended ? " · fits your inputs" : ""}</span></header>
        <div class="cost-range">${m(o.low)} – ${m(o.high)}<small>/month, expected → peak traffic</small></div>
        <dl><dt>Changes</dt><dd>${esc(o.changes)}</dd><dt>Services</dt><dd>${o.services}</dd><dt>Ops complexity</dt><dd>${esc(o.complexity)}</dd><dt>Availability in the incident drill</dt><dd>${(o.availability * 100).toFixed(2)}% · p95 ${num(o.p95)} ms</dd><dt>Recovery</dt><dd>${esc(o.recovery)}</dd><dt>Security / compliance</dt><dd>${esc(o.security)}</dd><dt>Upgrade path</dt><dd>${esc(o.upgrade)}</dd><dt>Risks</dt><dd>${esc(o.risks)}</dd></dl></article>`).join("")}</div>
      ${(() => { const costF = p.lint.filter((x) => x.cat === "cost"), other = p.lint.length - costF.length; return `<h3>Cost checks <small>${costF.length || "no"} finding${costF.length === 1 ? "" : "s"}${other ? ` · ${other} security, reliability and AI finding${other === 1 ? "" : "s"} are under Checks` : ""}</small></h3>
      ${costF.length ? `<ul class="cost-lint">${costF.map((x) => `<li class="${x.sev === "high" || x.sev === "critical" ? "bad" : x.sev === "info" ? "info" : "warn"}"><i>${sevIcon[x.sev === "high" || x.sev === "critical" ? "bad" : x.sev === "info" ? "info" : "warn"]}</i><span><b>${esc(x.title)}.</b> ${esc(x.detail)} ${esc(x.fix)}</span></li>`).join("")}</ul>` : `<p class="muted">No over-building, unused parts, egress hot spots or budget overrun found by these rules.</p>`}`; })()}
      <h3>Every component <small>sized at 70% utilisation · DR adds a half-size standby</small></h3>
      <div class="cost-table-wrap"><table class="cost-table"><thead><tr><th>Component</th><th>Level</th><th>Main driver</th><th>Billing</th><th>Basis</th><th>MVP</th><th>Expected</th><th>Peak</th><th>DR</th></tr></thead><tbody>
        ${p.components.map((c) => `<tr><td><b>${esc(c.name)}</b><small>${esc(c.type)}${c.parent ? " · inside " + esc(c.parent) : ""}${c.need != null ? " · " + c.inst + " instance" + (c.inst === 1 ? "" : "s") : ""}</small></td><td>${lv(c)}</td><td>${esc(c.driver)}</td><td>${esc(c.billing)}</td><td>${esc(c.basis)}</td><td>${m(c.mvp)}</td><td>${m(c.growth)}</td><td>${m(c.peak)}</td><td>${m(c.dr)}</td></tr>`).join("")}
      </tbody><tfoot><tr><td colspan="5">Total</td><td>${m(p.totals.mvp)}</td><td>${m(p.totals.growth)}</td><td>${m(p.totals.peak)}</td><td>${m(p.totals.dr)}</td></tr></tfoot></table></div>
      ${p.levels.length > 1 ? `<p class="cost-sub">Level 2 and 3 parts are priced as drawn. If a detail box is just a zoom-in on its parent (not extra infrastructure), remove one of the two before trusting the total.</p>` : ""}
      <h3>Cheaper alternatives <small>${p.alternatives.length} expensive or heavyweight choice${p.alternatives.length === 1 ? "" : "s"}</small></h3>
      ${p.alternatives.length ? `<div class="cost-table-wrap"><table class="cost-table alts"><thead><tr><th>Component</th><th>Current choice</th><th>Monthly est.</th><th>Lower-cost alternative</th><th>Trade-off</th><th>When to upgrade</th></tr></thead><tbody>
        ${p.alternatives.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.current)}</td><td>${m(a.cost)}</td><td>${esc(a.alt)}${a.altCost != null ? `<small>≈${m(a.altCost)}</small>` : ""}</td><td>${esc(a.trade)}</td><td>${esc(a.when)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">Nothing on this canvas is expensive enough to need a cheaper stand-in.</p>`}
      <h3>Hidden costs not in these totals</h3>
      <ul class="cost-hidden">${p.hidden.sort((a, b) => b.on - a.on).map((h) => `<li class="${h.on ? "on" : ""}"><b>${esc(h.item)}</b>${h.on ? " <em>applies to this design</em>" : ""}<span>${esc(h.why)}</span></li>`).join("")}</ul>
      <h3>Cost controls to set up</h3>
      <ul class="cost-controls">
        <li><b>Budget alerts</b> at 50%, 80% and 100% of ${budget ? money(budget) : "your monthly budget"}, plus a forecast alert.</li>
        <li><b>Quotas and limits</b>: maximum autoscaling instances per service, per-tenant request quotas, and a hard spend cap for sandbox accounts.</li>
        <li><b>Anomaly detection</b> on daily spend per service and per tenant.</li>
        ${p.aiNodes ? `<li><b>AI protections</b>: token budget per user and per tenant, route easy requests to a small model, semantic cache, batch non-urgent jobs, cap response length and retrieved chunks, rate limits, and a token-usage dashboard.</li>` : ""}
        <li><b>FinOps tags on every resource</b>: product, environment, team, owner, cost-center, customer/tenant, expiration-date.</li>
      </ul>
      <p class="cost-foot">Source: Architecture Lab teaching price list (sim.js), sized by the in-browser simulator · calculated ${new Date().toLocaleString()} · confidence: low until checked against ${esc(p.provider === "generic" ? "your hosting provider" : p.provider.toUpperCase())} pricing. Ready for the next validation step, not a quote.</p>`;
  }
  (function costWiring() {
    const body = $("#costBody"); if (!body) return;
    const onInput = (e) => {
      const t = e.target;
      if (t.dataset.costOpt) {
        const k = t.dataset.costOpt;
        costOpts[k] = ["trafficMult", "uptime", "users"].includes(k) ? Math.max(0, +t.value || 0) : t.value;
        if (k === "trafficMult") { costOpts.trafficMult = Math.max(0.1, costOpts.trafficMult); if (e.type === "input") { const o = t.nextElementSibling; if (o) o.textContent = costOpts.trafficMult + "×"; return; } }
      } else if (t.dataset.costEnv) costOpts.envs[t.dataset.costEnv] = t.checked;
      else return;
      renderCostPlan(); costLast = costNow(); costDelta = 0; paintCostPill();
    };
    body.addEventListener("change", onInput); body.addEventListener("input", onInput);
    $("#costPlan").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    costLast = costNow(); paintCostPill(); paintLintPill(); paintReqPill();
    $("#lintDlg").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  })();
  (function studioWiring() {
    ['#simDlg', '#exportDlg'].forEach((s) => { const d = $(s); if (d) d.addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }); });
    document.addEventListener("pointerdown", (e) => { const m = $(".chaos-menu"); if (m && m.open && !m.contains(e.target)) m.open = false; }, true);
    const sb = $("#simBody");
    if (sb) {
      const onW = (e) => {
        const t = e.target, k = t.dataset && t.dataset.simw; if (!k) return;
        simW[k] = t.type === "range" ? +t.value : t.value;
        if (t.type === "range") { const o = t.nextElementSibling; if (o) o.textContent = t.value + "×"; if (e.type === "input") return; }
        renderSimLab();
      };
      sb.addEventListener("input", onW); sb.addEventListener("change", onW);
    }
    const vs = $("#viewSel");
    if (vs) {
      vs.innerHTML = VIEWS.map(([v, l]) => `<option value="${v}" ${viewMode === v ? "selected" : ""}>${esc(l)}</option>`).join("");
      vs.addEventListener("change", () => { viewMode = vs.value; try { localStorage.setItem("archlab.view", viewMode); } catch (e) { /* ignore */ } render(); say(VIEWS.find((x) => x[0] === viewMode)[1] + " view. Everything stays editable."); });
    }
    const mm = $("#minimap");
    if (mm) mm.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      let m; try { m = JSON.parse(mm.dataset.map || "null"); } catch (x) { m = null; } if (!m) return;
      const r = mm.getBoundingClientRect(), b = $("#board").getBoundingClientRect(), wx = m.x0 + (e.clientX - r.left - m.ox) / m.k, wy = m.y0 + (e.clientY - r.top - m.oy) / m.k;
      view.x = b.width / 2 - wx * view.z; view.y = b.height / 2 - wy * view.z; render();
    });
    paintSimPill();
  })();
  // ---- Component panel (Real Play): the full catalog (#tab-parts, already rendered and wired for
  // search + drag-to-canvas by renderParts()) normally lives inside #side, which stays hidden in the
  // AI workspace. Relocate the SAME populated element into its own persistent column instead -- next
  // to the AI deck on the right, always visible by default (browsing it is how ideas get found, not
  // just a one-off add), resizable up to half the screen so the category list doesn't need to scroll
  // to be useful. Same collapse+resize pattern as the AI deck.
  (function partsPanel() {
    if (!aiWorkspace) return;
    const parts = $("#tab-parts"), panel = $("#partsPanel"), tip = $("#partTip");
    if (!parts || !panel) return;
    panel.insertBefore(parts, tip || null);
    parts.hidden = false;
    // Hover a component in the catalog -> show the same "pick it when / skip it when" explanation
    // tipHtml() already builds for the canvas inspector, in the docked footer instead of a floating
    // card (floating ones used to cover the very buttons being hovered -- see the note further down).
    if (tip) {
      parts.addEventListener("mouseover", (e) => {
        const b = e.target.closest && e.target.closest(".part[data-add]");
        if (!b || !parts.contains(b)) return;
        tip.innerHTML = tipHtml(b.dataset.add) || "<p class='muted'>No details for this one yet.</p>";
      });
      parts.addEventListener("mouseout", (e) => {
        const left = e.target.closest && e.target.closest(".part[data-add]");
        if (!left) return;
        const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".part[data-add]");
        if (to) return;
        tip.innerHTML = "<p class='muted'>Hover a component for what it's best at, and when to pick something else instead.</p>";
      });
    }
    const PK = "archlab.parts.v1";
    let st = { hidden: false, w: 320 };
    try { st = Object.assign(st, JSON.parse(localStorage.getItem(PK)) || {}); } catch (e) { /* ignore */ }
    const root = document.documentElement, save = () => { try { localStorage.setItem(PK, JSON.stringify(st)); } catch (e) { /* ignore */ } };
    const hideBtn = $("#partsHide"), showBtn = $("#partsShow"), wideBtn = $("#partsWide"), grip = $("#partsGrip");
    if (!hideBtn || !showBtn || !wideBtn || !grip) return;
    const clampW = (w) => Math.max(260, Math.min(Math.round(innerWidth * 0.5), w));
    const apply = () => {
      root.style.setProperty("--parts-w", clampW(st.w) + "px");
      document.body.classList.toggle("parts-hidden", !!st.hidden);
      showBtn.hidden = !st.hidden;
      wideBtn.textContent = st.w >= Math.round(innerWidth * 0.4) ? "⤡ Shrink" : "⤢ Expand";
      requestAnimationFrame(() => requestAnimationFrame(() => { syncCanvasViewport(); fitView(); }));
    };
    hideBtn.onclick = () => { st.hidden = true; apply(); save(); };
    showBtn.onclick = () => { st.hidden = false; apply(); save(); };
    wideBtn.onclick = () => { st.w = st.w >= Math.round(innerWidth * 0.4) ? 320 : Math.round(innerWidth * 0.5); apply(); save(); };
    let drag = null;
    grip.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, w: clampW(st.w) }; grip.classList.add("on"); grip.setPointerCapture(e.pointerId); e.preventDefault(); });
    grip.addEventListener("pointermove", (e) => { if (!drag) return; st.w = clampW(drag.w - (e.clientX - drag.x)); root.style.setProperty("--parts-w", st.w + "px"); });
    grip.addEventListener("pointerup", () => { if (!drag) return; drag = null; grip.classList.remove("on"); apply(); save(); });
    grip.addEventListener("dblclick", () => { st.w = 320; apply(); save(); });
    addEventListener("resize", () => { root.style.setProperty("--parts-w", clampW(st.w) + "px"); });
    apply();
  })();
  // ---- Studio shell (Real Play): one header, the design steps docked on the left, the canvas with a
  // floating toolbar, and one tabbed panel on the right (Components / AI assistant / Inspect).
  // ---- Skill level: Beginner sees the basic parts and the essential steps; each level adds tools.
  function setSkill(k, quiet) {
    skill = k || ""; try { if (k) localStorage.setItem("yashai.level", k); } catch (e) { /* ignore */ }
    document.body.classList.remove("lvl-beginner", "lvl-intermediate", "lvl-advanced"); if (k) document.body.classList.add("lvl-" + k);
    if (k === "beginner") provFilter = "generic"; else if (provFilter === "generic") provFilter = "all";
    $$("[data-skill]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.skill === k)));
    renderParts(); wirePanelKey = ""; paintGuide(); render();
    if (!quiet && k) say({ beginner: practiceMode ? "Beginner: basic parts only, plain explanations, the essential steps." : "Beginner: basic parts only. Press ▶ Start to see traffic flow. For step-by-step help, open Learn in the left menu.", intermediate: "Intermediate: every component, trade-off tools and checks.", advanced: "Advanced: the full studio, including versions, readiness and export." }[k]);
  }
  function showSkillChooser() {
    let dl = $("#skillDlg");
    if (!dl) {
      dl = document.createElement("dialog"); dl.id = "skillDlg"; dl.className = "skill-dialog";
      dl.innerHTML = `<h2>How much system design do you know?</h2><p>This sets how much the studio shows. You can change it any time at the top right.</p>
        <div class="skill-cards">
          <button type="button" data-skill="beginner"><b>Beginner</b><span>New to this. Plain words, step-by-step help, only the basic parts (client, server, database, cache, queue…).</span></button>
          <button type="button" data-skill="intermediate"><b>Intermediate</b><span>I know servers, databases and APIs. Show me all components, checks and cost so I can compare trade-offs.</span></button>
          <button type="button" data-skill="advanced"><b>Advanced</b><span>I design production systems. Give me everything: failure drills, versions, readiness and exports.</span></button>
        </div>`;
      document.body.appendChild(dl);
    }
    if (!dl.open) dl.showModal();
  }
  // ---- Guided practice (Learn): steps built from the example's core design, checked live against the canvas.
  let guideSum = { key: "", sum: null };
  const nameOf = (n) => (n.props && n.props.name) || (S.BY_ID[n.type] || {}).name || n.type;
  const an = (w) => (/^[aeio]/i.test(w) ? "an " : "a ") + w;
  const sentence1 = (t) => String(t || "").split(/(?<=\.)\s/)[0];
  const kindOf = (type) => { const d = S.BY_ID[type] || {}, ai = d.cat === "AI & ML"; return d.cls === "service" ? (ai ? "ai-service" : "service") : d.cls === "proxy" ? (ai ? "ai-proxy" : "proxy") : d.cls === "db" ? (ai ? "vector" : "db") : d.cls; };
  const sameJob = (a, b) => a === b || (!!S.BY_ID[a] && !!S.BY_ID[b] && !!S.BY_ID[a].eq && S.BY_ID[a].eq === S.BY_ID[b].eq) || kindOf(a) === kindOf(b);
  /* What each kind of box is for, in words for someone who has never seen one. */
  const PLAIN_JOB = {
    source: "This is where requests come from: the people or programs that use the system.",
    router: "It decides where each request should go, like a signpost at the entrance.",
    cdn: "It keeps copies of pictures and pages close to the users, so most requests never reach your own servers.",
    limiter: "A doorman: it lets a fair number of requests in and turns away floods.",
    proxy: "It stands in front and hands each request to one of the servers behind it, so no single server is overloaded.",
    service: "A program that does the actual work for each request.",
    cache: "A fast short-term memory: it remembers recent answers so the slower database is asked less often.",
    db: "Where the data is kept safely, so nothing is lost when a server restarts.",
    queue: "A waiting line: work is dropped here and picked up a moment later, so a sudden burst does not overwhelm anyone.",
    store: "Storage for big things such as files, pictures and videos.",
    external: "A service run by another company that this system calls.",
  };
  function plainWire(a, b) {
    const ca = S.BY_ID[a.type].cls, cb = S.BY_ID[b.type].cls, A = nameOf(a), B = nameOf(b);
    if (ca === "cache" && cb === "db") return `When ${A} does not have the answer, the request goes on to ${B}.`;
    if (cb === "cache") return `${A} asks ${B} first, because memory answers faster than a database.`;
    if (cb === "queue") return `${A} drops the work into ${B} instead of doing it straight away.`;
    if (ca === "queue") return `${B} picks the work up from ${A} at its own pace.`;
    if (cb === "db") return `${A} reads and saves its data in ${B}.`;
    if (cb === "store") return `${A} keeps its files in ${B}.`;
    if (cb === "external") return `${A} calls ${B}, which is run by someone else.`;
    return `Requests travel from ${A} to ${B}.`;
  }
  function buildGuide() {
    const p = PRESETS.find((x) => x.id === guideId); if (!p) return null;
    const ref = JSON.parse(JSON.stringify((p.coreBuild || p.build)())), by = {};
    ref.nodes.forEach((n) => { by[n.id] = n; });
    const order = [], seen = new Set(), q = ref.nodes.filter((n) => S.BY_ID[n.type].cls === "source").map((n) => n.id);
    q.forEach((id) => seen.add(id));
    while (q.length) { const id = q.shift(); order.push(id); ref.edges.filter((e) => e.from === id).forEach((e) => { if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }); }
    ref.nodes.forEach((n) => { if (!seen.has(n.id)) order.push(n.id); });
    const steps = [], added = new Set(), wired = new Set();
    order.forEach((id) => {
      const n = by[id], d = S.BY_ID[n.type], own = n.props.name && n.props.name !== d.name;
      steps.push({ kind: "add", ref: n, title: own ? `Add ${an(d.name)} for “${n.props.name}”` : `Add ${an(d.name)}`, why: [PLAIN_JOB[d.cls] || "", own ? `In this system it is the “${n.props.name}”.` : "", sentence1(DOCS.D[n.type]) || ""].filter(Boolean).join(" ") || d.name });
      added.add(id);
      ref.edges.forEach((e, i) => {
        if (wired.has(i) || !((e.to === id && added.has(e.from)) || (e.from === id && added.has(e.to)))) return;
        wired.add(i); const a = by[e.from], b = by[e.to];
        steps.push({ kind: "connect", ref: e, a, b, title: `Connect ${nameOf(a)} → ${nameOf(b)}`, why: e.fan ? `${nameOf(a)} also calls ${nameOf(b)} on every request, at the same time.` : e.failover ? "A backup path: used only when the main one fails." : e.only === "r" ? "Only reads go this way." : e.only === "w" ? "Only writes go this way." : plainWire(a, b) });
      });
    });
    steps.push({ kind: "run", title: "Press ▶ Start to send traffic", why: `The simulator sends about ${num(ref.scenario.base)} requests per second through your design. Boxes turn green, amber or red by how busy they are.` });
    steps.push({ kind: "fit", title: "Make it handle the load", why: `Goal: 95% of requests answered within ${ref.slo.p95} ms and at least ${ref.slo.avail}% of them working. If a box is red, click it and raise Instances (for a database: Read replicas for reads, Shards for writes).` });
    steps.push({ kind: "break", title: "Break something on purpose", why: "Real systems fail. Inject a failure while traffic runs and watch which boxes suffer and whether the design recovers." });
    steps.push({ kind: "review", title: "Ask the mentor to review it", why: "The mentor reads your design and its simulation numbers and explains what is good and what to improve." });
    return { id: p.id, name: ref.name || p.name, ref, steps };
  }
  function initGuide() {
    guide = buildGuide(); if (!guide) return;
    if (!doc.guide || doc.guide.id !== guide.id) {
      if (doc.guide) { doc.nodes = []; doc.edges = []; }      // another system was on the canvas: start this one clean
      doc.guide = { id: guide.id }; doc.name = "My " + guide.name; doc.scenario = Object.assign({}, S.DEFAULT_SCENARIO, guide.ref.scenario); doc.slo = Object.assign({}, guide.ref.slo);
      $("#title").value = doc.name; persist();
    }
    document.body.classList.add("has-guide");
    const main = $("#main");
    if (main && !$("#guidePanel")) { const g = document.createElement("aside"); g.id = "guidePanel"; g.setAttribute("aria-label", "Guided steps"); main.insertBefore(g, main.firstChild); }
  }
  function guideSummary() {
    const key = hist[histAt] + "|" + JSON.stringify(doc.scenario);
    if (guideSum.key !== key) {
      const r = S.run(graphForSim(), doc.scenario, []), peak = {};
      if (!r.error) r.st.history.forEach((h) => Object.entries(h.nodes || {}).forEach(([id, v]) => { peak[id] = Math.max(peak[id] || 0, v.util || 0); }));
      guideSum = { key, sum: r.error ? null : r.summary, peak };
    }
    return guideSum.sum;
  }
  function peakUtil(id) { return (guide && guideSummary() && guideSum.peak[id]) || 0; }   // busiest moment of the simulated hour, not just now
  function guideMap() {
    const map = {}, used = new Set();
    guide.steps.filter((s) => s.kind === "add").forEach((s) => {
      const r = s.ref, pick = (pred) => doc.nodes.filter((n) => !used.has(n.id) && pred(n)).sort((a, b) => a.x - b.x)[0];
      const c = pick((n) => n.type === r.type) || pick((n) => sameJob(r.type, n.type));
      if (c) { map[r.id] = c.id; used.add(c.id); }
    });
    return map;
  }
  function guideStatus() {
    const map = guideMap(), f = doc.guide || {};
    const done = guide.steps.map((s) => {
      if (s.kind === "add") return !!map[s.ref.id];
      if (s.kind === "connect") { const a = map[s.a.id], b = map[s.b.id]; return !!(a && b && doc.edges.some((e) => e.from === a && e.to === b)); }
      if (s.kind === "run") return !!f.ran;
      if (s.kind === "fit") { if (!f.ran) return false; const m = guideSummary(); return !!(m && m.p95 <= +doc.slo.p95 && m.availability * 100 >= +doc.slo.avail); }
      if (s.kind === "break") return !!f.broke;
      return !!f.reviewed;
    });
    return { map, done };
  }
  function noteGuide(k) { if (!doc || !doc.guide || doc.guide[k]) return; doc.guide[k] = true; persist(); paintGuide(); }
  function tidyLayout() { const r = STU.autoLayout(doc), pos = {}; r.doc.nodes.forEach((n) => { pos[n.id] = n; }); doc.nodes.forEach((n) => { if (pos[n.id] && !n.props.locked) { n.x = pos[n.id].x; n.y = pos[n.id].y; } }); commit(false); fitView(); }
  let guideSig = "";
  /* Watch mode: for someone who has never done this. We build the reference design one step at a time (with its real
   * sizes, so it carries the load), run it, break it and bring it back, saying in plain words what each step is for. */
  let demo = null;
  function demoStop(finished) {
    if (!demo) return;
    clearTimeout(demo.timer); demo = null; highlight.clear();
    if (finished) { doc.guide.watched = true; persist(); }
    Object.keys(chaos).forEach((k) => { chaos[k] = false; }); paintChaos(); render(); guideSig = ""; paintGuide();
  }
  function demoStart() {
    if (doc.nodes.length && !window.confirm("Watching clears your canvas and builds this system from the start. Continue?")) return;
    doc.nodes = []; doc.edges = []; doc.guide = { id: guide.id }; stop(); view = { x: 40, y: 20, z: 1 }; commit();
    demo = { phase: "build", title: "", text: "", timer: 0 }; demoStep();
  }
  function demoStep() {
    if (!demo || !guide) return;
    const { done } = guideStatus(), i = done.indexOf(false), s = i >= 0 ? guide.steps[i] : null, build = guide.steps.filter((x) => x.kind === "add" || x.kind === "connect").length;
    const show = (title, text, ms) => { demo.title = title; demo.text = text; guideSig = ""; paintGuide(); demo.timer = setTimeout(demoStep, ms); };
    if (demo.phase === "build" && s && (s.kind === "add" || s.kind === "connect")) {
      guideAction({ dataset: { guide: "do", i: String(i) } });
      if (s.kind === "add") { const id = guideMap()[s.ref.id], n = id && node(id); if (n) { Object.assign(n.props, JSON.parse(JSON.stringify(s.ref.props))); commit(false); highlight = new Set([id]); render(); } }
      else { const map = guideMap(); highlight = new Set([map[s.a.id], map[s.b.id]].filter(Boolean)); render(); }
      return show(`Step ${i + 1} of ${build}: ${s.title}`, s.why, s.kind === "add" ? 3400 : 2200);
    }
    highlight.clear();
    if (demo.phase === "build") { demo.phase = "run"; if (!running) start(); return show("Now we send traffic through it", `We pressed Start. About ${num(doc.scenario.base)} requests every second now travel from the first box to the last. Green boxes are relaxed, amber are busy, red are overloaded. We already gave each box enough capacity, so this design copes.`, 8000); }
    if (demo.phase === "run") { demo.phase = "break"; guideAction({ dataset: { guide: "break" } }); return show("Now we break something on purpose", "Real systems fail, so we switch one part off while traffic is running. Watch which boxes turn red and the errors number at the bottom: this is what an outage looks like.", 8000); }
    if (demo.phase === "break") { demo.phase = "heal"; Object.keys(chaos).forEach((k) => { chaos[k] = false; }); paintChaos(); return show("And we bring it back", "The failure is switched off and the boxes recover. Good designs keep a spare copy ready so this takes seconds, not minutes.", 6000); }
    demoStop(true); say("That was the whole system. Now try building it yourself.");
  }
  function paintGuide() {
    const el = $("#guidePanel"); if (!el || !guide) return;
    const { done } = guideStatus(), lv = skill || "beginner", m = (doc.guide || {}).ran ? guideSummary() : null;
    const failing = Object.keys(chaos).filter((k) => chaos[k]);
    const sig = lv + done.join("") + (m ? Math.round(m.p95) + ":" + m.availability.toFixed(4) : "") + guide.id + failing.join() + (demo ? demo.title : "") + doc.nodes.length + (doc.guide.watched ? "w" : "");
    if (sig === guideSig) return; guideSig = sig;
    const total = done.length, ok = done.filter(Boolean).length, cur = done.indexOf(false);
    if (lv === "beginner" && STU && cur >= 0 && guide.steps[cur].kind === "run" && !doc.guide.tidied) {
      doc.guide.tidied = true; const map = guideMap(), w = $("#board").getBoundingClientRect().width, cols = Math.max(2, Math.floor((w - 40) / (NW + 60)));
      guide.steps.filter((s) => s.kind === "add").map((s) => map[s.ref.id] && node(map[s.ref.id])).filter((n) => n && !n.props.locked)
        .forEach((n, i) => { n.x = 40 + NW / 2 + (i % cols) * (NW + 60); n.y = 40 + NH / 2 + Math.floor(i / cols) * (NH + 70); });   // rows that fit the canvas at full size, in build order
      commit(false); fitView(); say("All boxes are in place. I lined them up in build order so they fit the canvas. Undo (Ctrl+Z) puts them back.");
    }
    const goal = `<div class="g-goal"><b>Goal</b> ${num(doc.scenario.base)} req/s · p95 ≤ ${doc.slo.p95} ms · ${doc.slo.avail}% working${m ? `<span class="${m.p95 <= doc.slo.p95 && m.availability * 100 >= doc.slo.avail ? "ok" : "bad"}">Now: p95 ${Math.round(m.p95)} ms · ${(m.availability * 100).toFixed(2)}%</span>` : ""}</div>`;
    const btns = (s, i) => {
      if (s.kind === "add") return `<button type="button" data-guide="show" data-i="${i}">Show me</button><button type="button" data-guide="do" data-i="${i}">Do it for me</button>`;
      if (s.kind === "connect") return `<button type="button" data-guide="show" data-i="${i}">Show me</button><button type="button" data-guide="do" data-i="${i}">Do it for me</button>`;
      if (s.kind === "run") return `<button type="button" class="primary-sm" data-guide="run">▶ Start now</button>`;
      if (s.kind === "fit") return `<button type="button" data-guide="hot">Show the busiest box</button>`;
      if (s.kind === "break") return `<button type="button" class="primary-sm" data-guide="break">Break the database</button>`;
      return `<button type="button" class="primary-sm" data-guide="review">Review my design</button>`;
    };
    let list;
    if (lv === "advanced") {
      const chaos = done[total - 3] ? chaosReadiness() : null;
      list = `<p class="g-intro">No step-by-step help at this level. Build it your way, meet the goal, then survive failures.</p>
        <ol class="g-steps">${guide.steps.map((s, i) => [s, i]).filter(([s]) => ["run", "fit", "break", "review"].includes(s.kind)).map(([s, i]) => `<li class="${done[i] ? "done" : ""}"><b>${esc(s.title)}</b>${!done[i] ? `<div class="g-act">${btns(s, i)}</div>` : ""}</li>`).join("")}</ol>
        ${chaos ? `<p class="g-note">Failure-drill score: <b>${chaos.score}/100</b> (80+ is strong).</p>` : ""}`;
    } else if (lv === "intermediate") {
      const build = guide.steps.map((s, i) => [s, i]).filter(([s]) => s.kind === "add" || s.kind === "connect"), rest = guide.steps.map((s, i) => [s, i]).filter(([s]) => !(s.kind === "add" || s.kind === "connect"));
      list = `<p class="g-intro">Build these in any order. Ask for a hint only if you are stuck.</p>
        <ul class="g-check">${build.map(([s, i]) => `<li class="${done[i] ? "done" : ""}"><span>${done[i] ? "✓" : "○"}</span>${esc(s.title)}${!done[i] ? `<button type="button" class="g-hint" data-guide="show" data-i="${i}">Hint</button>` : ""}</li>`).join("")}</ul>
        <ol class="g-steps">${rest.map(([s, i]) => `<li class="${done[i] ? "done" : i === cur ? "now" : ""}"><b>${esc(s.title)}</b>${i === cur ? `<p>${esc(s.why)}</p><div class="g-act">${btns(s, i)}</div>` : ""}</li>`).join("")}</ol>`;
    } else {
      list = `<ol class="g-steps">${guide.steps.map((s, i) => `<li class="${done[i] ? "done" : i === cur ? "now" : "later"}"><b>${esc(s.title)}</b>${i === cur ? `<p>${esc(s.why)}</p><div class="g-act">${btns(s, i)}</div>` : ""}</li>`).join("")}</ol>`;
    }
    const FAIL = { dbDown: ["The database is down.", "Click the database box and turn on <b>Automatic failover</b> (a standby takes over in seconds) and add a <b>Read replica</b> so reads keep working."], cacheFlush: ["The cache was emptied, so every read hits the database.", "Give the database <b>Read replicas</b> so it can absorb the burst until the cache warms up again."], azOut: ["One data centre (zone) went offline and half the capacity is gone.", "Turn on <b>High availability</b> / <b>Automatic failover</b> on the load balancer and database, and run extra Instances."] };
    const failBox = failing.length ? `<div class="g-fail"><b>Failure is on.</b> ${failing.map((k) => (FAIL[k] || [k])[0]).join(" ")} Red boxes are failing and requests are lost (see <i>errors now</i> at the bottom right).<p><b>How real systems survive it:</b> ${failing.map((k) => (FAIL[k] || [, ""])[1]).join(" ")}</p><div class="g-act"><button type="button" data-guide="heal">Stop the failure</button></div></div>` : "";
    el.innerHTML = `<header class="g-head"><span class="g-level">${esc((LEVELS.find(([k]) => k === lv) || [, ""])[1])}</span><h2>Rebuild: ${esc(guide.name)}</h2>
        <div class="g-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${ok}"><i style="width:${Math.round(100 * ok / total)}%"></i></div><small>${ok} of ${total} done</small></header>
      ${demo ? `<div class="g-watch live" aria-live="polite"><small>Watching: we build it, you look</small><b>${esc(demo.title)}</b><p>${esc(demo.text)}</p><div class="g-act"><button type="button" data-guide="watchstop">Stop and build it myself</button></div></div>`
        : doc.guide.watched && !doc.guide.tried && cur >= 0 ? `<div class="g-watch"><b>You have seen the whole system.</b><p>Now build it yourself: the steps below tell you what to add next, and “Do it for me” is there if you get stuck.</p><div class="g-act"><button type="button" class="primary-sm" data-guide="tryself">Clear it and build it myself</button><button type="button" data-guide="watch">Watch again</button></div></div>`
        : !doc.nodes.length && !doc.guide.tried ? `<div class="g-watch"><b>New to this? Watch first.</b><p>We build this system for you, one box at a time, and explain every step in plain words. Then it is your turn.</p><div class="g-act"><button type="button" class="primary-sm" data-guide="watch">▶ Watch it being built</button></div></div>` : ""}
      ${goal}${demo ? "" : failBox}${list}
      ${cur < 0 ? `<div class="g-done"><b>Well done!</b><p>You rebuilt the ${esc(guide.name)}, ran it, broke it and got a review. Try the next system, or move up a level at the top of the page.</p></div>` : ""}
      <footer class="g-foot"><button type="button" data-guide="peek">Peek at the reference</button><button type="button" data-guide="fresh">Start over</button></footer>`;
    const nowEl = el.querySelector(".g-fail") || el.querySelector("li.now");   // keep the failure note or current step visible without scrolling the page around the frame
    if (nowEl && (nowEl.offsetTop < el.scrollTop || nowEl.offsetTop + nowEl.offsetHeight > el.scrollTop + el.clientHeight)) el.scrollTop = Math.max(0, nowEl.offsetTop - 120);
  }
  function guideAction(t) {
    const a = t.dataset.guide, s = guide && guide.steps[+t.dataset.i], map = guide ? guideMap() : {};
    if (a === "watch") { demoStop(false); demoStart(); return; }
    if (a === "watchstop") { demoStop(false); say("Stopped. Carry on from the current step, or press Start over."); return; }
    if (a === "tryself") { doc.nodes = []; doc.edges = []; doc.guide = { id: guide.id, watched: true, tried: true }; stop(); view = { x: 40, y: 20, z: 1 }; commit(); guideSig = ""; paintGuide(); return; }
    if (a === "peek") { try { window.parent.postMessage({ type: "archlab-open-reference" }, "*"); } catch (e) { /* ignore */ } return; }
    if (a === "fresh") { if (!window.confirm("Clear your canvas and start this system again?")) return; doc.nodes = []; doc.edges = []; doc.guide = { id: guide.id }; stop(); view = { x: 40, y: 20, z: 1 }; commit(); guideSig = ""; paintGuide(); return; }
    if (a === "run") { if (!running) start(); return; }
    if (a === "break") {
      if (!running) start();
      const k = doc.nodes.some((n) => S.BY_ID[n.type].cls === "db") ? "dbDown" : doc.nodes.some((n) => S.BY_ID[n.type].cls === "cache") ? "cacheFlush" : "azOut";
      chaos[k] = true; paintChaos(); noteGuide("broke");
      say("Failure injected. Read the box on the left to see what broke and how real systems survive it."); return;
    }
    if (a === "heal") { Object.keys(chaos).forEach((k) => { chaos[k] = false; }); paintChaos(); guideSig = ""; paintGuide(); say(doc.nodes.some((n) => S.BY_ID[n.type].cls === "db" && !n.props.ha) ? "Failure switched off. Without Automatic failover the database takes about 40 simulated seconds to be restored by hand; with it, about 4. Watch it recover." : "Failure switched off. Watch the boxes recover."); return; }
    if (a === "review") { sel = { node: null, edge: null }; render(); setRightTab("ai", true); tab = "architect"; updSide(); aiReview(); return; }
    if (a === "hot") {
      if (!running && !lastRec) { start(); say("Running the simulation first: the busiest box will be selected in a moment."); setTimeout(() => guideAction(t), 2500); return; }
      const rec = lastRec, worst = (id, v) => Math.max(v.util, peakUtil(id));
      const hot = rec && Object.entries(rec.nodes).filter(([id]) => node(id) && S.BY_ID[node(id).type].cls !== "source").sort((x, y) => worst(...y) - worst(...x))[0];
      if (hot) {
        const hn = node(hot[0]), cls = S.BY_ID[hn.type].cls, w = worst(...hot), atPeak = w > hot[1].util + 0.05;
        const tip = cls === "db" ? "Raise Read replicas if it is busy with reads, or Shards if it is busy with writes" : cls === "queue" ? "Raise its Workers" : cls === "cache" ? "Raise its Nodes" : "Raise its Instances";
        sel = { node: hot[0], edge: null }; render(); say(`${nameOf(hn)} is ${atPeak ? `fine now but reaches ${Math.round(w * 100)}% at the traffic peak` : `${Math.round(w * 100)}% busy`}. ${tip} in the panel on the right.`);
      }
      return;
    }
    if (!s) return;
    if (s.kind === "add") {
      const d = S.BY_ID[s.ref.type];
      if (a === "show") { partsQuery = d.name; if (provFilter !== "all" && d.prov !== provFilter) provFilter = "all"; renderParts(); setRightTab("parts", true); const b = document.querySelector(`#tab-parts .part[data-add="${s.ref.type}"]`); if (b) { b.scrollIntoView({ block: "center" }); b.classList.add("pulse"); setTimeout(() => b.classList.remove("pulse"), 2600); } say(`Drag “${d.name}” from the Components panel onto the canvas (or click it).`); return; }
      const n = addNode(s.ref.type, s.ref.x, s.ref.y); if (s.ref.props.name) { n.props.name = s.ref.props.name; commit(false); }
      partsQuery = ""; renderParts(); fitView(); if (narrowGuide()) document.body.classList.add("rp-collapsed"); return;
    }
    if (s.kind === "connect") {
      const from = map[s.a.id], to = map[s.b.id];
      if (!from || !to) { say("Add both boxes first."); return; }
      if (a === "show") { highlight = new Set([from, to]); sel = { node: null, edge: null }; render(); say(`Drag from the round dot on the right edge of ${nameOf(node(from))} and drop it on ${nameOf(node(to))}.`); return; }
      const { from: _f, to: _t, ...extra } = s.ref; doc.edges.push(Object.assign({ from, to, w: 1 }, extra)); highlight.clear(); commit();
    }
  }
  (function studioShell() {
    if (!aiWorkspace || referenceMode) return;
    const bar = $("#bar"), main = $("#main"), stage = $("#stage"), rail = $("#studioRail"), tools = $(".tools");
    if (!bar || !main || !stage) return;
    document.body.classList.add("studio-shell");
    const menu = $("#bar .menu"), ex = $("#mPreset"), exMenu = $("#presetMenu");
    if (menu && ex && exMenu && !menu.contains(ex)) { menu.appendChild(ex); menu.appendChild(exMenu); }
    let right = $("#barRight");
    if (!right) { right = document.createElement("div"); right.id = "barRight"; right.className = "tools bar-right"; bar.appendChild(right); }
    const viewLabel = document.createElement("label"); viewLabel.className = "bar-view"; viewLabel.innerHTML = "<span>View</span>";
    if ($("#viewSel")) { viewLabel.appendChild($("#viewSel")); right.appendChild(viewLabel); }
    [$("#levelControls"), $("#themeBtn")].forEach((el) => { if (el) right.appendChild(el); });
    if (!right.querySelector('[data-act="help"]')) right.insertAdjacentHTML("beforeend", `<button type="button" data-act="help" title="Help and keyboard shortcuts" aria-label="Help">?</button>`);
    if (tools && tools !== right) { if (tools.parentElement !== stage) stage.appendChild(tools); tools.classList.add("canvas-toolbar"); tools.setAttribute("aria-label", "Canvas tools"); }
    // Learn embeds this canvas under its own header: no second header row, View moves into the canvas toolbar.
    if (practiceMode && tools) { const vs = $("#viewSel"); if (vs) tools.appendChild(vs); document.body.classList.add("no-bar"); }
    if (rail) {
      main.insertBefore(rail, main.firstChild);
      if (!rail.querySelector(".rail-title")) {
        rail.insertAdjacentHTML("afterbegin", `<div class="rail-title">Design steps</div>`);
        [["reqBtn", "Plan", "plan"], ["simBtn", "Validate", "validate"], ["verBtn", "Deliver", "deliver"]].forEach(([id, label, g]) => { const b = $("#" + id); if (b) b.insertAdjacentHTML("beforebegin", `<span class="rail-h" data-g="${g}">${label}</span>`); });
      }
    }
    if (!$("#rightCol")) {
      const col = document.createElement("aside"); col.id = "rightCol";
      col.innerHTML = `<nav class="rp-tabs" role="tablist" aria-label="Side panel"><button type="button" role="tab" data-rp="parts">Components</button><button type="button" role="tab" data-rp="ai">AI assistant</button><button type="button" role="tab" data-rp="inspect">Inspect</button><button type="button" class="rp-collapse" title="Hide this panel" aria-label="Hide panel">⟩</button></nav>
        <section id="rpInspect" class="rp-inspect"><div class="rp-empty"><b>Nothing selected</b><p>Click a box or a wire to see what it does, what it costs, its findings and its settings.</p><p>Double-click a box to open its internals (Level 2). Shift-click to select several.</p></div></section>`;
      main.appendChild(col);
      [$("#partsPanel"), $("#aiDeck")].forEach((el) => { if (el) col.appendChild(el); });
      stage.insertAdjacentHTML("beforeend", `<button type="button" id="rpOpen" title="Show the side panel">⟨ Panel</button>`);
      const wp = $("#wirePanel"); if (wp) $("#rpInspect").appendChild(wp);
    }
    let saved = ""; try { saved = localStorage.getItem("archlab.rp") || ""; if (localStorage.getItem("archlab.rp.collapsed")) document.body.classList.add("rp-collapsed"); } catch (e) { /* ignore */ }
    setRightTab(["parts", "ai"].includes(saved) ? saved : practiceMode || doc.nodes.length > 1 ? "parts" : "ai");
    kpis();
    requestAnimationFrame(() => requestAnimationFrame(fitView));
  })();
  (function skillShell() {
    if (!aiWorkspace || referenceMode) return;
    const right = $("#barRight");
    if (right && !practiceMode && !$("#skillSeg")) right.insertAdjacentHTML("afterbegin", `<div id="skillSeg" class="skill-seg" role="group" aria-label="Your level" title="Shows more tools as you grow">${LEVELS.map(([k, l]) => `<button type="button" data-skill="${k}" aria-pressed="${skill === k}">${l}</button>`).join("")}</div>`);
    if (guideId) initGuide();
    if (narrowGuide()) document.body.classList.add("rp-collapsed", "rp-float");
    if (!skill && practiceMode) skill = "beginner";
    setSkill(skill, true);
    if (!skill) showSkillChooser();
  })();
})();
