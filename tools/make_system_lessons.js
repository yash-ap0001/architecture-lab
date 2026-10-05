// Writes one "from zero" walkthrough per example system for the Mentor: learning/system-design/systems/*.md
// Everything is derived from the example itself (its parts, wires, traffic and goals) and from the simulator,
// so the text always matches the design the learner can open in Learn. Usage: node tools/make_system_lessons.js
const fs = require("fs"), path = require("path");
const S = require("../sim.js"), X = require("../examples_more.js"), P = require("../presets.js").PRESETS, DOCS = require("../catalog_docs.js");
const OUT = path.resolve(__dirname, "..", "..", "..", "learning", "system-design", "systems");

const PLAIN_JOB = {   // same wording as the Learn guide (sandbox.js)
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
  passive: "A supporting tool: it watches, records or helps deliver the system but is not on the path of a user's request.",
  pool: "A group of machines that the other parts run on.",
};
const PRESET_NOTICE = {
  urlshort: "Far more people click a short link than create one, so almost every request is a read that a cache can answer.",
  news: "Most visitors read the same few articles, so copies close to the reader (a CDN) and a cache absorb almost all traffic.",
  events: "Events arrive faster than they can be processed, so a queue takes the burst and workers catch up at their own pace.",
  payments: "Correctness matters more than speed: a payment must happen exactly once even when a call to the outside provider fails.",
  rag: "The model only answers well when it is first given the right documents, so every question goes through a search step before the model.",
  jobs: "A pipeline of separate stages: find companies, collect their job posts, match them to a resume, each stage handing work to the next.",
  storm: "A warning example: when one part slows down, automatic retries multiply the load on it and make the failure worse.",
  global: "Users are served from the region nearest to them, and a second region stands ready to take over if the first one fails.",
  start: "The smallest possible system: one program and one database. Everything else is added only when this stops being enough.",
};
const sentence1 = (t) => String(t || "").split(/(?<=\.)\s/)[0];
const cls = (n) => (S.BY_ID[n.type] || {}).cls;
const nameOf = (n) => (n.props && n.props.name) || S.BY_ID[n.type].name;
const num = (v) => Number(v).toLocaleString("en-US");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function wire(a, b, e) {
  const ca = cls(a), cb = cls(b), A = nameOf(a), B = nameOf(b);
  if (e.failover) return `If the main path fails, ${A} switches to ${B} as a backup.`;
  if (e.fan) return `${A} also asks ${B} at the same time, for part of the request.`;
  if (ca === "cache" && cb === "db") return `When ${A} does not have the answer, the request goes on to ${B}.`;
  if (cb === "cache") return `${A} asks ${B} first, because memory answers faster than a database.`;
  if (cb === "queue") return `${A} drops the work into ${B} instead of doing it straight away.`;
  if (ca === "queue") return `${B} picks the work up from ${A} at its own pace.`;
  if (cb === "db") return `${A} reads and saves its data in ${B}.`;
  if (cb === "store") return `${A} keeps its files in ${B}.`;
  if (cb === "external") return `${A} calls ${B}, which is run by someone else.`;
  return `The request goes from ${A} to ${B}.`;
}
function sizeNote(n) {
  const p = n.props || {}, c = cls(n), out = [];
  if (p.inst > 1 && c !== "cache") out.push(`${p.inst} copies run side by side${p.auto ? ", and more are added automatically when it gets busy" : ""}`);
  if (c === "cache") { if (p.inst > 1) out.push(`${p.inst} cache machines`); if (p.hit) out.push(`it answers about ${Math.round(p.hit * 100)} of every 100 reads by itself`); }
  if (p.shards > 1) out.push(`the data is split over ${p.shards} machines (shards)`);
  if (p.replicas > 0) out.push(`${p.replicas} extra read-only cop${p.replicas > 1 ? "ies" : "y"} (replicas)`);
  if (p.ha) out.push("a standby takes over automatically if it fails");
  if (p.workers > 1) out.push(`${p.workers} workers read from it`);
  if (p.breaker) out.push("it stops calling a broken dependency for a while instead of piling up requests (circuit breaker)");
  return out.length ? " In this design: " + out.join("; ") + "." : "";
}

function lesson(id, example, name, cat, notice, g) {
  const by = {}; g.nodes.forEach((n) => { by[n.id] = n; });
  const order = [], seen = new Set(), q = g.nodes.filter((n) => cls(n) === "source").map((n) => n.id);
  q.forEach((x) => seen.add(x));
  while (q.length) { const x = q.shift(); order.push(x); g.edges.filter((e) => e.from === x).forEach((e) => { if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }); }
  g.nodes.forEach((n) => { if (!seen.has(n.id)) order.push(n.id); });
  const nodes = order.map((x) => by[x]), has = (c) => nodes.filter((n) => cls(n) === c);
  const sc = Object.assign({}, S.DEFAULT_SCENARIO, g.scenario), readPct = Math.round((sc.readFrac == null ? 0.8 : sc.readFrac) * 100);
  const shape = { steady: "about the same all day", diurnal: "busy in the day and quiet at night", spike: `with sudden rushes of up to ${sc.spikeX || 3} times normal`, ramp: "growing steadily" }[sc.shape] || "about the same all day";
  const r = S.run(g, g.scenario, []);
  const peak = {}; if (!r.error) r.st.history.forEach((h) => Object.entries(h.nodes || {}).forEach(([k, v]) => { peak[k] = Math.max(peak[k] || 0, v.util || 0); }));
  const hot = nodes.filter((n) => !["source", "passive"].includes(cls(n))).sort((a, b) => (peak[b.id] || 0) - (peak[a.id] || 0))[0];

  const parts = nodes.map((n, i) => { const d = S.BY_ID[n.type], own = n.props.name && n.props.name !== d.name;
    return `${i + 1}. **${nameOf(n)}**${own ? ` (${d.name})` : ""}. ${PLAIN_JOB[d.cls] || ""} ${sentence1(DOCS.D[n.type])}${sizeNote(n)}`.replace(/\s+/g, " "); });
  const flow = []; const done = new Set();
  order.forEach((x) => g.edges.forEach((e, i) => { if (e.from === x && !done.has(i) && by[e.to]) { done.add(i); flow.push(`${flow.length + 1}. ${wire(by[e.from], by[e.to], e)}${e.only === "r" ? " Only reads take this path." : e.only === "w" ? " Only writes take this path." : e.only === "s" ? " Only static files (pictures, video) take this path." : ""}`); } }));

  const why = [];
  if (has("cdn").length) why.push("A CDN is in front because many users ask for the same files. Serving them from a nearby copy is faster for the user and removes that load from your own servers.");
  if (has("cache").length) why.push(readPct >= 50 ? `${readPct} of every 100 requests only read data. A cache answers most of those from memory, so the database sees only the misses and the writes.` : "A cache remembers recent answers, so repeated lookups are answered from memory and do not reach the database.");
  if (has("queue").length) why.push("Work that does not need to finish while the user waits goes through a queue. A sudden rush then becomes a longer line instead of an overloaded system.");
  const dbs = has("db");
  if (dbs.some((n) => n.props.replicas > 0 || n.props.ha)) why.push("The database has spare copies. If the main one fails, a copy takes over, and reads can be shared between them.");
  if (dbs.some((n) => n.props.shards > 1)) why.push("One database machine cannot hold or write all of this data, so it is split across several machines called shards.");
  if (dbs.length > 1) why.push(`There are ${dbs.length} different data stores because the data is used in different ways: each store is good at one kind of question.`);
  if (nodes.some((n) => cls(n) === "service" && n.props.inst > 1)) why.push("Several copies of the same program run side by side. If one copy crashes, the others keep answering, and more copies can be added when traffic grows.");
  if (has("external").length) why.push("Calls to outside companies can be slow or fail. The design must keep working, or fail clearly, when they do.");
  if (has("limiter").length) why.push("A rate limiter stands at the door so one noisy user or a flood of bots cannot use up everything.");
  if (!why.length) why.push("This design is deliberately small. Extra parts are added only when the numbers show they are needed.");

  const qs = ["Follow one request from the first box to the last. Which parts does it touch, in order?"];
  if (has("cache").length) qs.push("What does the cache hold in this system, and what happens to the database if the cache is suddenly empty?");
  if (has("queue").length) qs.push("Which work goes through the queue here, and why should the user not wait for it?");
  if (hot) qs.push(`${nameOf(hot)} is the busiest part at peak. What would you change first if traffic doubled?`);
  qs.push("Pick one part and say what users would notice if it stopped working.");
  if (dbs.length) qs.push("What keeps the data safe if a database machine dies?");

  return `---\nid: ${id}\ntitle: ${name}\ncat: ${cat}\nexample: ${example}\n---\n# ${name}\n\n` +
    `## What this system is\n${notice}\n\nIt has ${nodes.length} parts. You can open the same design in Learn (All systems, then “${name}”) and press Watch it being built.\n\n` +
    `## The numbers it is built for\n- About ${num(sc.base)} requests every second, ${shape}.\n- ${readPct} of every 100 requests only read data; the rest change something.\n- Goal: 95 of every 100 requests answered within ${g.slo.p95} ms (thousandths of a second), and at least ${g.slo.avail}% of requests succeed.\n\n` +
    `## The parts, one by one\n${parts.join("\n")}\n\n` +
    `## How a request travels\n${flow.join("\n")}\n\n` +
    `## Why it is built this way\n${why.map((w) => "- " + w).join("\n")}\n\n` +
    `## What gets busy first\n${hot && !r.error ? `In the simulator, with the sizes above, this design answers 95 of 100 requests within ${Math.round(r.summary.p95)} ms and ${(r.summary.availability * 100).toFixed(2)}% of requests succeed. The busiest part at the peak is **${nameOf(hot)}** (about ${Math.round((peak[hot.id] || 0) * 100)}% busy). It is the first part to grow when traffic rises.` : "Run it in Learn to see which part gets busy first."}\n\n` +
    `## What to remember\n- ${notice}\n- Every part has one job; a request passes through them in a fixed order.\n- Know which part is busiest and what happens when any one part fails.\n\n` +
    `## Practice questions\n${qs.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.readdirSync(OUT).filter((f) => f.endsWith(".md")).forEach((f) => fs.unlinkSync(path.join(OUT, f)));
const all = P.map((p) => ({ example: p.id, name: p.id === "start" ? "The simplest system" : p.name, cat: "Start here", notice: PRESET_NOTICE[p.id] || "", g: p.build() }))
  .concat(X.LIST.map((e, i) => ({ example: "x" + i, name: e.name, cat: e.cat, notice: e.notice, g: X.build(Object.assign({}, e, { noE2E: true }), S.BY_ID) })));
all.sort((a, b) => (a.example === "start" ? -1 : b.example === "start" ? 1 : 0));
const ids = new Set(); let n = 0;
all.forEach((a, i) => {
  let id = "sys-" + slug(a.name); while (ids.has(id)) id += "-2"; ids.add(id);
  fs.writeFileSync(path.join(OUT, `${String(i + 1).padStart(3, "0")}-${id.slice(4)}.md`), lesson(id, a.example, a.name, a.cat, a.notice, a.g)); n += 1;
});
console.log(n + " system walkthroughs written to " + OUT);
