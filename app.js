/* Architecture Lab UI. Static, no network calls: progress is kept in this browser (localStorage). */
(function () {
  "use strict";
  const E = window.LabEngine, LEVELS = window.LabLevels;
  const $app = document.getElementById("app"), $title = document.getElementById("title"), $back = document.getElementById("back"), $total = document.getElementById("totalStars");
  const KEY = "archlab.v1";
  const directPractice = new URLSearchParams(location.search).get("practice") === "1";

  // ---------------------------------------------------------------- progress
  let progress = { levels: {} };
  try { progress = JSON.parse(localStorage.getItem(KEY)) || progress; } catch (e) { /* private mode: play without saving */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ } };
  const starsOf = (id) => (progress.levels[id] && progress.levels[id].stars) || 0;
  const unlocked = (i) => i === 0 || starsOf(LEVELS[i - 1].id) >= 1;
  const totalStars = () => LEVELS.reduce((s, l) => s + starsOf(l.id), 0);
  const nextLesson = () => LEVELS.find((l, i) => unlocked(i) && starsOf(l.id) < 3) || LEVELS[0];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const num = (n) => Math.round(n).toLocaleString("en-US");
  const starText = (n) => "★".repeat(n) + "☆".repeat(3 - n);

  // ---------------------------------------------------------------- state of the open level
  let level = null, cfg = null, result = null, tab = "board", hintsShown = 0, mode = "game", kOver = null, practiceExample = "urlshort", referenceVisible = false, practiceLibraryOpen = false;

  function go(id) {
    stopPlay(); mode = "game"; kOver = null;
    level = LEVELS.find((l) => l.id === id) || null;
    result = null; tab = "board"; hintsShown = 0;
    if (level) { cfg = E.normalize(saved(level.id) || E.defaults()); loadGraph(); }
    render();
    window.scrollTo(0, 0);
  }
  function saved(id) { const p = progress.levels[id]; return p && p.cfg ? p.cfg : null; }

  // ---------------------------------------------------------------- training home
  function home() {
    const next = nextLesson();
    $title.textContent = "System Design Training"; $back.hidden = true;
    $total.textContent = totalStars() + " / " + LEVELS.length * 3 + " ★";
    $app.innerHTML = `
      <section class="training-hero">
        <span class="cr-kicker">Practice path</span>
        <h2>Learn by designing systems that have to survive.</h2>
        <p class="muted">Each lesson gives you a product story, traffic, reliability goals, and a budget. You make the design decisions, run the simulation, then improve the weak point.</p>
      </section>
      <section class="training-flow" aria-label="How learning works">
        <article><span>01</span><h3>Read the brief</h3><p>Understand users, peak traffic, SLOs, and the budget.</p></article>
        <article><span>02</span><h3>Design it</h3><p>Add and connect the components the lesson unlocks.</p></article>
        <article><span>03</span><h3>Run traffic</h3><p>Watch latency, errors, cost, and any incident play out.</p></article>
        <article><span>04</span><h3>Improve it</h3><p>Use the post-mortem, earn a star, and unlock the next scenario.</p></article>
      </section>
      <section class="card training-playground">
        <div class="training-levels-head"><div><span class="cr-badge">Reference practice</span><h2>Study it. Hide it. Rebuild it.</h2><p class="muted training-next-copy">Pick a real system, inspect the reference canvas, hide it, then draw your own version below. The local mentor reviews your design when you are ready.</p></div><div class="training-next-action"><button class="primary" data-open-practice="1">Start reference practice</button></div></div>
      </section>
      <section class="card training-levels">
        <div class="training-levels-head"><div><span class="cr-badge">Guided practice</span><h2>Choose your next challenge</h2><p class="muted training-next-copy">Start with the recommended lesson, or return to any unlocked lesson to improve your score.</p></div><div class="training-next-action"><span class="muted">${totalStars()} stars earned</span><button class="primary training-start" data-next-lesson="1">Start Level ${next.id}: ${esc(next.title)}</button></div></div>
        <div class="grid">${LEVELS.map((l, i) => {
          const ok = unlocked(i), s = starsOf(l.id);
          return `<button class="lvl" data-level="${l.id}" ${ok ? "" : "disabled"}>
            <span class="n">Level ${l.id}${ok ? "" : " · locked"}</span><span class="t">${esc(l.title)}</span>
            <span class="muted">${esc(l.learn.split(".")[0])}.</span><span class="s" aria-label="${s} of 3 stars">${starText(s)}</span></button>`;
        }).join("")}</div>
      </section>`;
  }

  // ---------------------------------------------------------------- level screen
  const has = (k) => level.allowed.includes(k);
  function ctl(label, hint, inner) { return `<div class="ctl"><span class="lab">${label}${hint ? `<span class="hint">${hint}</span>` : ""}</span>${inner}</div>`; }
  function seg(name, value, opts) {
    return `<span class="seg" role="group" aria-label="${name}">${opts.map(([v, t]) => `<button data-set="${name}" data-val="${v}" aria-pressed="${String(value) === String(v)}">${t}</button>`).join("")}</span>`;
  }
  function stepper(name, value) { return `<span class="step"><button data-step="${name}" data-d="-1" aria-label="Fewer">−</button><output>${value}</output><button data-step="${name}" data-d="1" aria-label="More">+</button></span>`; }
  const toggle = (name, v) => seg(name, v ? "1" : "0", [["0", "Off"], ["1", "On"]]);

  function controls() {
    const peak = Math.max(...E.trafficCurve(level.load));
    let h = "";
    if (has("cdn")) h += ctl("CDN", "answers images and scripts at the edge", toggle("cdn", cfg.cdn));
    if (has("limiter")) h += ctl("Rate limiter", "drops most bot traffic; too low also drops real users", seg("limiter", cfg.limiter ? Math.round(cfg.limiter / peak * 100) / 100 : 0,
      [[0, "Off"], [0.7, "70%"], [1, "100%"], [1.2, "120%"]]) + `<span class="muted" style="width:100%">of peak ${num(peak)} req/s</span>`);
    if (has("lb")) h += ctl("Load balancer", "spreads requests across servers", seg("lb", cfg.lb, [["none", "None"], ["single", "One"], ["ha", "HA pair"]]));
    if (has("app")) {
      h += ctl("App servers", `each handles about ${num(E.mergeK(kOver).appCap)} req/s`, stepper("app.n", cfg.app.n));
      if (has("auto")) h += ctl("Autoscaling", "adds servers under load, after a delay", toggle("app.auto", cfg.app.auto));
    }
    if (has("cache")) {
      h += ctl("Cache", "Redis-style, holds popular reads", seg("cache.tier", cfg.cache.tier, [["none", "None"], ["s", "S"], ["m", "M"], ["l", "L"]]));
      if (cfg.cache.tier !== "none") h += ctl("Cache nodes", "", stepper("cache.nodes", cfg.cache.nodes));
      if (has("coalesce") && cfg.cache.tier !== "none") h += ctl("Request coalescing", "one miss refills the key for everyone", toggle("cache.coalesce", cfg.cache.coalesce));
    }
    if (has("queue")) {
      h += ctl("Write queue", "accepts writes now, stores them soon", toggle("queue.on", cfg.queue.on));
      if (cfg.queue.on) h += ctl("Queue workers", `each drains about ${num(E.mergeK(kOver).workerCap)} writes/s`, stepper("queue.workers", cfg.queue.workers));
    }
    if (has("shards")) h += ctl("DB shards", `each shard takes about ${num(E.mergeK(kOver).dbWriteCap)} writes/s`, stepper("db.shards", cfg.db.shards));
    if (has("replicas")) h += ctl("Read replicas per shard", `each node serves about ${num(E.mergeK(kOver).dbReadCap)} reads/s`, stepper("db.replicas", cfg.db.replicas));
    if (has("ha")) h += ctl("DB failover (HA)", "standby takes over in seconds, not minutes", toggle("db.ha", cfg.db.ha));
    if (has("salting") && cfg.db.shards > 1) h += ctl("Key salting", "spreads a hot key across shards", toggle("db.salting", cfg.db.salting));
    return h;
  }

  function utilClass(u) { return u == null ? "off" : u < 0.7 ? "u-ok" : u <= 1 ? "u-warn" : "u-bad"; }
  function pct(u) { return u == null ? "" : Math.round(u * 100) + "%"; }

  function flow(r) {
    const T = r && r.peakTiers, c = cfg;
    const row = (name, on, meta, u) => `<div class="tier ${on ? utilClass(u) : "off"}"><span class="name">${name}</span><span class="meta">${on ? meta : "not used"}${u != null && on ? ` · ${pct(u)} busy` : ""}</span></div>`;
    return `<div class="flow" aria-label="Request path">
      <div class="tier"><span class="name">Users</span><span class="meta">${num(r ? r.peakRps : Math.max(...E.trafficCurve(level.load)))} req/s peak</span></div>
      ${has("limiter") ? row("Rate limiter", c.limiter > 0, num(c.limiter) + " req/s", null) : ""}
      ${has("cdn") ? row("CDN", c.cdn, "edge cache", null) : ""}
      ${has("lb") ? row("Load balancer", c.lb !== "none", c.lb === "ha" ? "HA pair" : "single", T && T.lb) : ""}
      ${row("App servers", true, c.app.n + (c.app.auto ? " + autoscale" : "") + " servers", T && T.app)}
      ${has("cache") ? row("Cache", c.cache.tier !== "none", c.cache.nodes + " × " + c.cache.tier.toUpperCase(), T && T.cache) : ""}
      ${has("queue") ? row("Write queue", c.queue.on, c.queue.workers + " workers", T && T.queue) : ""}
      ${row("Database reads", true, c.db.shards + " shard" + (c.db.shards > 1 ? "s" : "") + " × " + (1 + c.db.replicas) + " node" + (c.db.replicas ? "s" : ""), T && T.dbRead)}
      ${row("Database writes", true, "primary" + (c.db.ha ? " + standby" : ""), T && T.dbWrite)}
    </div>`;
  }

  function sloChips() {
    const s = level.slo;
    const c = [`p95 ≤ ${s.p95} ms`, `availability ≥ ${s.avail}%`, `budget ≤ ${money(s.budget)}/mo`];
    if (s.staleMax != null) c.push(`stale reads ≤ ${s.staleMax}%`);
    if (s.maxDelay != null) c.push(`write delay ≤ ${s.maxDelay} min`);
    if (level.chaos.length) c.push("incident: " + level.chaos.map((x) => ({ dbDown: "database primary dies", cacheFlush: "cache flushed", lbDown: "load balancer dies", azOut: "a data-centre zone goes dark" }[x.type])).join(" + "));
    return `<div class="chips">${c.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>`;
  }

  // ---------------------------------------------------------------- results
  function chart(r, upto) {
    const W = 600, H = 190, pad = 34, n = r.ticks.length;
    const x = (i) => pad + (i / (n - 1)) * (W - pad - 8);
    const maxMs = Math.max(level.slo.p95 * 2, ...r.ticks.map((t) => Math.min(t.p95, level.slo.p95 * 4)));
    const yMs = (v) => H - 24 - (Math.min(v, maxMs) / maxMs) * (H - 44);
    const yErr = (v) => H - 24 - Math.min(v * 100, 100) / 100 * (H - 44);
    const pts = upto == null ? r.ticks : r.ticks.slice(0, upto + 1);
    const line = (f, key) => pts.map((t, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + f(t[key]).toFixed(1)).join(" ");
    const maxR = Math.max(...r.ticks.map((t) => t.rps));
    const area = "M" + x(0) + " " + (H - 24) + " " + pts.map((t, i) => "L" + x(i).toFixed(1) + " " + (H - 24 - (t.rps / maxR) * (H - 44) * 0.55).toFixed(1)).join(" ") + " L" + x(pts.length - 1) + " " + (H - 24) + " Z";
    const marks = (level.chaos || []).map((c) => `<line x1="${x(c.tick)}" x2="${x(c.tick)}" y1="10" y2="${H - 24}" stroke="currentColor" stroke-dasharray="4 4" opacity=".55"/><text x="${x(c.tick) + 3}" y="20" font-size="10" fill="currentColor">incident</text>`).join("");
    const cursor = upto == null ? "" : `<line x1="${x(upto)}" x2="${x(upto)}" y1="10" y2="${H - 24}" stroke="var(--accent)" stroke-width="2"/>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Latency and error rate over one hour">
      <path d="${area}" fill="currentColor" opacity=".08"/>
      <line x1="${pad}" x2="${W - 8}" y1="${yMs(level.slo.p95)}" y2="${yMs(level.slo.p95)}" stroke="var(--ok)" stroke-dasharray="3 3"/>
      <text x="${pad + 2}" y="${yMs(level.slo.p95) - 3}" font-size="10" fill="var(--ok)">goal ${level.slo.p95} ms</text>
      <path d="${line(yMs, "p95")}" fill="none" stroke="var(--chart-a)" stroke-width="2.2"/>
      <path d="${line(yErr, "err")}" fill="none" stroke="var(--chart-b)" stroke-width="2.2"/>
      ${marks}${cursor}
      <text x="4" y="${H - 6}" font-size="10" fill="currentColor" opacity=".7">0 min</text><text x="${W - 40}" y="${H - 6}" font-size="10" fill="currentColor" opacity=".7">60 min</text>
      <text x="${pad}" y="${H - 6}" font-size="10" fill="var(--chart-a)" style="transform:translateX(70px)">— p95 latency</text>
      <text x="${pad + 150}" y="${H - 6}" font-size="10" fill="var(--chart-b)">— errors (0–100%)</text>
    </svg>`;
  }

  function metric(k, v, good, goal) { return `<div class="metric ${good ? "ok" : "bad"}"><div class="k">${k}</div><div class="v">${v}</div><div class="g ${good ? "" : "muted"}">${good ? "✓ " : "✗ "}${goal}</div></div>`; }

  function postmortem(g) {
    const items = [], L = level, n = g.normal, s = g.stress;
    const peakOrigin = n.peakRps;
    const names = { app: "app servers", cache: "cache", dbRead: "database reads", dbWrite: "database writes", lb: "load balancer", queue: "write queue" };
    if (!g.checks.normal.availability) {
      const t = n.bottleneck;
      items.push(`<b>Requests were dropped in normal traffic.</b> The busiest tier at peak was <b>${names[t.tier]}</b> (${pct(t.util)} of capacity). A tier above 100% turns extra requests into errors.`);
      if (t.tier === "app") items.push(`Each server handles about 400 req/s. At the ${num(peakOrigin)} req/s peak (less whatever a CDN answers) you need roughly ${Math.ceil(peakOrigin * (1 - (L.load.staticFrac || 0) * (cfg.cdn ? 0.9 : 0)) / 400)} servers, or fewer requests reaching them.`);
      if (t.tier === "dbRead") items.push("Reads reach the database whenever the cache misses. Add a cache, or add read replicas (each node serves about 2,000 reads/s).");
      if (t.tier === "dbWrite") items.push("One primary takes about 1,000 writes/s. A queue smooths bursts, but only shards add write capacity in the long run.");
    }
    if (g.checks.normal.availability && !g.checks.normal.latency) items.push(`<b>Too slow.</b> p95 was ${Math.round(n.p95)} ms against a goal of ${L.slo.p95} ms. Tiers above roughly 70% busy add queueing delay; look for the orange or red tier. A cache hit is much faster than a database read.`);
    if (!g.checks.normal.delay) items.push(`<b>Writes waited too long.</b> The queue held up to ${n.maxDelayMin.toFixed(1)} minutes of work. Add workers, and shards so storage can keep up.`);
    if (!g.checks.normal.stale) items.push("<b>Stale reads.</b> Replicas lag when writes are heavy, so some users read old data. Cache more, or send fewer reads to replicas.");
    if (g.passNormal && level.chaos.length && !g.passChaos) {
      const c = level.chaos.map((x) => x.type);
      items.push(`<b>Normal traffic passed, the incident did not</b> (availability ${(s.availability * 100).toFixed(2)}%, p95 ${Math.round(s.p95)} ms).`);
      if (c.includes("dbDown")) items.push("When the primary dies, writes stop until it is replaced. Failover (HA) shortens that from minutes to seconds; a queue can hold writes meanwhile; replicas keep reads alive.");
      if (c.includes("cacheFlush")) items.push("A flushed cache sends every read to the database at once (a thundering herd). Coalescing repeated misses and spare replica capacity absorb it.");
      if (c.includes("azOut")) items.push("Losing a zone removes half the servers and cache. Keep headroom, and use an HA load balancer with database failover.");
    }
    if (g.passNormal && g.passChaos && !g.underBudget) items.push(`<b>Works, but over budget:</b> ${money(s.cost)} against ${money(L.slo.budget)}. Look for tiers running below about 40% busy. Every unused server, replica or cache node is money.`);
    if (!g.passNormal || !g.passChaos) items.push(`Busiest tier at peak: <b>${names[n.bottleneck.tier]}</b> at ${pct(n.bottleneck.util)}. Start there.`);
    if (g.stars === 3) items.push("<b>All goals met.</b> Try a cheaper design that still passes, or move on.");
    return items;
  }

  function resultsHtml(g) {
    const n = g.normal, s = g.stress, sl = level.slo, ck = g.checks;
    const both = level.chaos.length ? s : n;
    return `
      ${scoreCard(g)}
      <section class="card">
        <div class="result-stars" aria-label="${g.stars} of 3 stars">${starText(g.stars)}</div>
        <p style="text-align:center;margin:4px 0 12px" class="muted">${["Not there yet.", "Goal met.", "Goal met and the incident survived.", "Goal met, incident survived, under budget."][g.stars]}</p>
        <div class="tabs" role="group"><button data-tab="normal" aria-pressed="${tab === "normal"}">Normal hour</button>${level.chaos.length ? `<button data-tab="stress" aria-pressed="${tab === "stress"}">With incident</button>` : ""}</div>
        ${chart(tab === "stress" && level.chaos.length ? s : n)}
        <div class="metrics" style="margin-top:10px">
          ${metric("p95 latency", Math.round(both.p95) + " ms", (level.chaos.length ? ck.stress : ck.normal).latency, "goal ≤ " + sl.p95 + " ms")}
          ${metric("Availability", (both.availability * 100).toFixed(2) + "%", (level.chaos.length ? ck.stress : ck.normal).availability, "goal ≥ " + sl.avail + "%")}
          ${metric("Monthly cost", money(s.cost), ck.underBudget, "budget " + money(sl.budget))}
          ${sl.maxDelay != null ? metric("Write delay", both.maxDelayMin.toFixed(1) + " min", (level.chaos.length ? ck.stress : ck.normal).delay, "goal ≤ " + sl.maxDelay + " min") : ""}
          ${sl.staleMax != null ? metric("Stale reads", (both.staleMax * 100).toFixed(1) + "%", (level.chaos.length ? ck.stress : ck.normal).stale, "goal ≤ " + sl.staleMax + "%") : ""}
        </div>
      </section>
      <section class="card post"><h2>Post-mortem</h2><ul>${postmortem(g).map((x) => `<li>${x}</li>`).join("") || "<li>Nothing to report.</li>"}</ul></section>
      <div class="row">${g.stars >= 1 && LEVELS.some((l) => l.id === level.id + 1) ? `<button class="primary" data-next="1">Next level →</button>` : ""}<button class="ghost" data-share="1">Copy share link</button></div>`;
  }


  // ---------------------------------------------------------------- score out of 100, badges, par
  const clamp01 = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const parMemo = {};
  function parOf(l) { if (!l.ref) return null; if (parMemo[l.id] == null) parMemo[l.id] = E.grade(l, l.ref).stress.cost; return parMemo[l.id]; }
  function scoreOf(g, lv, par) {
    const n = g.normal, s = g.stress, slo = lv.slo;
    const u = Math.max(...Object.values(peakTiers(n)));
    const av = (a) => { const fail = 1 - a, allowed = 1 - slo.avail / 100; return fail <= allowed ? 20 : clamp01(20 * (1 - (fail - allowed) / 0.05), 0, 20); };
    const la = (pms) => (pms <= slo.p95 ? 20 : clamp01(20 * (2.5 - pms / slo.p95) / 1.5, 0, 20));
    let resilience, rname;
    if (lv.chaos.length) { resilience = (av(s.availability) + la(s.p95)) / 2; rname = "Incident resilience"; }
    else {
      const grown = E.simulate(Object.assign({}, lv, { load: Object.assign({}, lv.load, { base: lv.load.base * 1.5 }) }), n.cfg, { chaos: false, k: kOver });
      resilience = (av(grown.availability) + la(grown.p95)) / 2; rname = "Growth headroom (+50%)";
    }
    const cost = s.cost;
    const dc = par != null
      ? (cost <= par ? 20 : cost <= slo.budget ? 20 - 10 * (cost - par) / Math.max(slo.budget - par, 1) : clamp01(10 - 30 * (cost / slo.budget - 1), 0, 10))
      : (cost <= 0.6 * slo.budget ? 20 : cost <= slo.budget ? 20 - 10 * (cost / slo.budget - 0.6) / 0.4 : clamp01(10 - 30 * (cost / slo.budget - 1), 0, 10));
    const dims = [["Scalability", clamp01(20 * (1.2 - u) / 0.5, 0, 20)], ["Availability", av(n.availability)], ["Latency", la(n.p95)], [rname, resilience], ["Cost", dc]];
    const total = Math.round(dims.reduce((a, d) => a + d[1], 0));
    const verdict = total < 31 ? "Needs work" : total < 51 ? "Decent" : total < 71 ? "Good" : total < 86 ? "Excellent" : "Architect level";
    const badges = [];
    if (g.passNormal && u <= 0.7) badges.push("⚖ Headroom: busiest tier under 70%");
    if (par != null && g.stars === 3 && cost < par) badges.push("💰 Beat par (" + money(par) + ")");
    if (lv.chaos.length && s.availability >= 0.9999) badges.push("🛡 Clean incident: no errors");
    return { dims, total, verdict, badges };
  }
  function scoreCard(g) {
    const par = mode === "game" ? parOf(level) : null, sc = scoreOf(g, level, par);
    return `<section class="card"><div class="score"><div class="big">${sc.total}<small>/100</small></div><div><b>${sc.verdict}</b><div class="muted">${par != null ? "Par cost " + money(par) + " · yours " + money(g.stress.cost) : "Cost " + money(g.stress.cost)}</div></div></div>
      ${sc.dims.map((d) => `<div class="dim"><span>${d[0]}</span><span class="bar"><i style="width:${Math.round(d[1] / 20 * 100)}%"></i></span><b>${Math.round(d[1])}/20</b></div>`).join("")}
      ${sc.badges.length ? `<div class="chips">${sc.badges.map((b) => `<span class="chip ok">${esc(b)}</span>`).join("")}</div>` : ""}</section>`;
  }

  // ---------------------------------------------------------------- playback of the simulated hour
  let play = null, speed = 3;
  function stopPlay() { if (play && play.timer) clearInterval(play.timer); play = null; }
  function startPlay() {
    stopPlay(); play = { idx: 0 };
    play.timer = setInterval(() => { if (!play) return; play.idx += 1; if (play.idx >= E.TICKS - 1) return finishPlay(); const el = document.getElementById("live"); if (el) el.innerHTML = liveInner(); if (canvasOn()) refreshCanvas(); }, Math.round(140 / speed));
  }
  function finishPlay() { stopPlay(); render(); const el = document.querySelector(".score"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function liveInner() {
    const run = level.chaos.length ? result.stress : result.normal, t = run.ticks[play.idx];
    const hot = [];
    if (t.dbDown) hot.push("database primary is down"); if (t.lbDown) hot.push("load balancer is down"); if (t.azOut) hot.push("a zone is dark");
    (level.chaos || []).forEach((c) => { if (c.type === "cacheFlush" && play.idx >= c.tick && play.idx < c.tick + 25) hot.push("cache is cold (refilling)"); });
    return `<h2>Running: minute ${Math.floor(play.idx / 2)} of 60</h2>
      <div class="metrics"><div class="metric"><div class="k">Requests / s</div><div class="v">${num(t.rps)}</div></div><div class="metric ${t.p95 <= level.slo.p95 ? "ok" : "bad"}"><div class="k">p95 latency</div><div class="v">${Math.round(t.p95)} ms</div></div>
        <div class="metric ${t.err < 0.01 ? "ok" : "bad"}"><div class="k">Errors</div><div class="v">${(t.err * 100).toFixed(1)}%</div></div></div>
      ${hot.length ? `<p class="chip bad" style="display:block;margin:10px 0 0">Incident: ${hot.join(", ")}</p>` : ""}
      ${chart(run, play.idx)}${flow({ peakRps: t.rps, peakTiers: t.tiers })}
      <div class="row" style="margin-top:12px"><span class="seg" role="group" aria-label="Speed">${[1, 3, 10].map((v) => `<button data-speed="${v}" aria-pressed="${speed === v}">${v}×</button>`).join("")}</span><button class="ghost" data-skip="1">Skip to result</button></div>`;
  }
  const liveCard = () => `<section class="card" id="live">${liveInner()}</section>`;

  function tipsHtml() {
    if (mode !== "game" || level.id > 2 || progress.tipsDismissed) return "";
    return `<section class="card"><h2>How to play</h2><ol style="margin:0 0 10px 18px;padding:0"><li>Read the story and the goals (chips above).</li><li>Change your design with the buttons. The estimated cost updates as you go.</li>
      <li>Press <b>Run the traffic</b> and watch the busy bars: orange or red is your bottleneck.</li><li>Read the post-mortem, fix the weakest tier, run again.</li></ol><button class="ghost" data-dismiss-tips="1">Got it</button></section>`;
  }

  // ---------------------------------------------------------------- level render
  function hints() {
    const L = level;
    const list = [L.learn, "Watch the busiest tier (orange or red) after a run. That is your bottleneck.", "Reference cost for a passing design is close to " + money(L.slo.budget / 1.25) + " a month. Yours can be lower or higher."];
    return list.slice(0, hintsShown).map((x) => `<p class="chip warn" style="display:block;margin:6px 0">${esc(x)}</p>`).join("");
  }

  function levelView() {
    $title.textContent = `Level ${level.id}: ${level.title}`; $back.hidden = false;
    $total.textContent = starText(starsOf(level.id));
    const live = E.simulate(level, cfg, { chaos: false, k: kOver });
    const shown = result ? result : null;
    if (ui === "canvas") {
      $app.innerHTML = `
      <section class="card"><h2>${esc(level.title)}</h2><p>${esc(level.story)}</p>${sloChips()}</section>
      ${tipsHtml()}
      ${canvasCard(play ? tickTiers() : shown ? peakTiers(shown.normal) : null, !!play)}
      <button class="primary" data-run="1">▶ Run the traffic</button>
      <div class="row" style="margin:10px 0"><button class="ghost" data-hint="1">Hint</button><button class="ghost" data-reset="1">Reset board</button></div>
      ${hintsShown ? `<div style="margin-bottom:10px">${hints()}</div>` : ""}
      ${play ? liveCard() : shown ? resultsHtml(shown) : `<section class="card muted">Press <b>Run the traffic</b> to see one simulated hour${level.chaos.length ? " including the incident" : ""}.</section>`}`;
      return;
    }
    $app.innerHTML = `
      <section class="card"><h2>${esc(level.title)}</h2><p>${esc(level.story)}</p>${sloChips()}</section>
      ${tipsHtml()}
      <div class="layout">
        <div>
          <section class="card"><div class="cv-head"><h2>Your design</h2><span class="seg" role="group" aria-label="Design view"><button data-ui="canvas" aria-pressed="false">Canvas</button><button data-ui="panel" aria-pressed="true">Buttons</button></span></div>${controls()}
            <p class="muted" style="margin:10px 0 0">Estimated cost: <b>${money(live.cost)}</b> a month (budget ${money(level.slo.budget)})</p></section>
          <button class="primary" data-run="1">▶ Run the traffic</button>
          <div class="row" style="margin-top:10px"><button class="ghost" data-hint="1">Hint</button><button class="ghost" data-reset="1">Reset design</button></div>
          ${hintsShown ? `<div style="margin-top:8px">${hints()}</div>` : ""}
        </div>
        <div>
          <section class="card"><h2>Request path</h2>${flow(shown && { peakRps: shown.normal.peakRps, peakTiers: peakTiers(shown.normal) })}</section>
          ${play ? liveCard() : shown ? resultsHtml(shown) : `<section class="card muted">Press <b>Run the traffic</b> to see one simulated hour${level.chaos.length ? " including the incident" : ""}.</section>`}
        </div>
      </div>`;
  }
  function peakTiers(r) { return r.ticks.reduce((m, t) => (t.rps > m.rps ? t : m), r.ticks[0]).tiers; }

  // ================================================================ CANVAS: draw the architecture, wire it, watch the traffic
  const G = window.LabGraph;
  let ui = progress.ui === "panel" ? "panel" : "canvas";       // canvas by default, panel for people who prefer buttons
  let graph = null, sel = null, linkFrom = null, toast = "", autoWire = true, drag = null;
  const W_ = 1200, H_ = 600, NW = 128, NH = 74;

  const canvasOn = () => ui === "canvas" && (mode === "game" || mode === "studio");
  function loadGraph() {
    const p = progress.levels[level.id];
    graph = p && p.graph && p.graph.nodes && p.graph.nodes.some((n) => n.type === "client") ? p.graph : G.starter();
    sel = null; linkFrom = null; toast = "";
  }
  function saveGraph() {
    if (mode === "studio") { const sp = project(); if (sp) { sp.graph = graph; save(); } return; }
    const p = progress.levels[level.id] || (progress.levels[level.id] = { stars: 0, attempts: 0 });
    p.graph = graph; save();
  }
  const peakOf = () => Math.max(...E.trafficCurve(level.load));
  const compileNow = () => G.compile(graph, level, peakOf());
  const palAllowed = (type) => type === "app" || type === "db" || level.allowed.includes(type === "limiter" ? "limiter" : type);

  function nodeUtil(n, tiers) {
    if (!tiers) return null;
    const t = { lb: tiers.lb, app: tiers.app, cache: tiers.cache, queue: tiers.queue, db: Math.max(tiers.dbRead, tiers.dbWrite) }[n.type];
    return t == null ? null : t;
  }
  function nodeSub(n) {
    switch (n.type) {
      case "app": return `× ${n.count}${n.auto ? " auto" : ""}`;
      case "cache": return `${String(n.size).toUpperCase()} × ${n.count}`;
      case "queue": return `${n.workers} workers`;
      case "db": return `${n.replicas} replica${n.replicas === 1 ? "" : "s"}${n.ha ? " · HA" : ""}`;
      case "lb": return n.ha ? "HA pair" : "single";
      case "limiter": return `${Math.round(n.limitX * 100)}% of peak`;
      case "cdn": return "edge";
      case "client": return `${num(peakOf())} req/s peak`;
      default: return "";
    }
  }

  function edgePath(a, b) {
    const x1 = a.x + NW / 2, y1 = a.y, x2 = b.x - NW / 2, y2 = b.y, dx = Math.max(30, (x2 - x1) / 2);
    return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
  }
  function svgInner(tiers, running) {
    const c = compileNow(), byId = (id) => graph.nodes.find((n) => n.id === id);
    const util = (n) => nodeUtil(n, tiers);
    const edges = graph.edges.map(([a, b]) => {
      const A = byId(a), B = byId(b); if (!A || !B) return "";
      const ok = c.live.has(a) && c.live.has(b), u = util(B), hot = u != null && u > 1, on = ok && (running || tiers);
      const isSel = sel && sel.edge && sel.edge[0] === a && sel.edge[1] === b;
      return `<g class="wire ${ok ? "" : "dead"} ${hot ? "hot" : ""} ${on ? "flow" : ""}"><path d="${edgePath(A, B)}" class="w"/><path d="${edgePath(A, B)}" class="hit" data-edge="${a}|${b}"/>${isSel ? `<path d="${edgePath(A, B)}" class="selw"/>` : ""}</g>`;
    }).join("");
    const nodes = graph.nodes.map((n) => {
      const T = G.TYPES[n.type], live = n.type === "client" || c.live.has(n.id), u = util(n);
      const cls = u == null ? "" : u < 0.7 ? "u-ok" : u <= 1 ? "u-warn" : "u-bad";
      const isSel = sel && sel.node === n.id, isLink = linkFrom === n.id;
      return `<g class="node ${cls} ${live ? "" : "dead"} ${isSel ? "sel" : ""} ${isLink ? "link" : ""}" data-node="${n.id}" transform="translate(${n.x} ${n.y})">
        <rect class="box" x="${-NW / 2}" y="${-NH / 2}" width="${NW}" height="${NH}" rx="14"/>
        <text class="ico" x="${-NW / 2 + 12}" y="-6">${T.icon}</text>
        <text class="lbl" x="${-NW / 2 + 40}" y="-8">${esc(T.label)}</text>
        <text class="sub" x="${-NW / 2 + 12}" y="22">${esc(nodeSub(n))}</text>
        ${u != null ? `<text class="pct" x="${NW / 2 - 8}" y="22" text-anchor="end">${Math.round(u * 100)}%</text>` : ""}
        ${live ? "" : `<text class="dn" x="0" y="${NH / 2 + 16}" text-anchor="middle">does nothing: wire it</text>`}
      </g>`;
    }).join("");
    return `<defs><filter id="rough" filterUnits="userSpaceOnUse" x="0" y="0" width="${W_}" height="${H_}"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter>
      <filter id="roughN" x="-15%" y="-25%" width="130%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3"/></filter>
      <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>
      <g filter="url(#rough)">${edges}</g><g>${nodes}</g>`;
  }

  function inspector() {
    if (sel && sel.edge) return `<div class="inspector"><b>Wire</b><span class="muted">${esc(G.TYPES[G.byId(graph, sel.edge[0]).type].label)} → ${esc(G.TYPES[G.byId(graph, sel.edge[1]).type].label)}</span><button class="ghost" data-rmedge="1">Remove wire</button></div>`;
    const n = sel && sel.node ? G.byId(graph, sel.node) : null;
    if (!n) return `<div class="inspector muted">Tap a box to change it. Tap a wire to remove it. Drag boxes to move them.</div>`;
    const T = G.TYPES[n.type], row = (l, inner) => `<div class="ctl"><span class="lab">${l}</span>${inner}</div>`;
    const stp = (prop, v, hint) => `<span class="step"><button data-np="${prop}" data-d="-1" aria-label="Fewer">−</button><output>${v}</output><button data-np="${prop}" data-d="1" aria-label="More">+</button></span>`;
    const tg = (prop, v) => `<span class="seg"><button data-nset="${prop}" data-val="0" aria-pressed="${!v}">Off</button><button data-nset="${prop}" data-val="1" aria-pressed="${!!v}">On</button></span>`;
    let body = "";
    if (n.type === "app") body = row("Servers", stp("count", n.count)) + (level.allowed.includes("auto") ? row("Autoscaling", tg("auto", n.auto)) : "");
    if (n.type === "cache") body = row("Size", `<span class="seg">${["s", "m", "l"].map((z) => `<button data-nset="size" data-val="${z}" aria-pressed="${n.size === z}">${z.toUpperCase()}</button>`).join("")}</span>`) + row("Nodes", stp("count", n.count)) + (level.allowed.includes("coalesce") ? row("Coalesce misses", tg("coalesce", n.coalesce)) : "");
    if (n.type === "queue") body = row("Workers", stp("workers", n.workers));
    if (n.type === "db") body = (level.allowed.includes("replicas") ? row("Read replicas", stp("replicas", n.replicas)) : "") + (level.allowed.includes("ha") ? row("Failover (HA)", tg("ha", n.ha)) : "") + (level.allowed.includes("salting") && graph.nodes.filter((x) => x.type === "db").length > 1 ? row("Key salting", tg("salting", n.salting)) : "");
    if (n.type === "lb") body = row("Highly available pair", tg("ha", n.ha));
    if (n.type === "limiter") body = row("Limit", `<span class="seg">${[0.7, 1, 1.2].map((v) => `<button data-nset="limitX" data-val="${v}" aria-pressed="${n.limitX === v}">${Math.round(v * 100)}%</button>`).join("")}</span>`);
    return `<div class="inspector"><b>${T.icon} ${esc(T.label)}</b>${body}<div class="row"><button class="ghost" data-linkfrom="1">${linkFrom === n.id ? "Tap the box to connect to…" : "Connect from here"}</button>${T.fixed ? "" : `<button class="ghost" data-del="1">Delete box</button>`}</div></div>`;
  }

  function canvasCard(tiers, running) {
    const c = compileNow();
    const palette = ["limiter", "cdn", "lb", "app", "cache", "queue", "db"].map((t) => `<button class="pal" data-add="${t}" ${palAllowed(t) ? "" : "disabled"} title="${esc(G.TYPES[t].label)}"><span>${G.TYPES[t].icon}</span>${esc(G.TYPES[t].label)}</button>`).join("");
    const live = E.simulate(level, E.normalize(c.cfg), { chaos: false, k: kOver });
    return `<section class="card cvcard">
      <div class="cv-head"><h2>Your architecture</h2><span class="seg" role="group" aria-label="Design view"><button data-ui="canvas" aria-pressed="${ui === "canvas"}">Canvas</button><button data-ui="panel" aria-pressed="${ui === "panel"}">Buttons</button></span></div>
      <div class="palette" role="group" aria-label="Add a box">${palette}</div>
      <div class="cv-wrap"><svg id="cv" viewBox="0 0 ${W_} ${H_}" role="img" aria-label="Architecture diagram">${svgInner(tiers, running)}</svg></div>
      <div class="cv-tools"><label class="chk sm"><input type="checkbox" data-autowire="1" ${autoWire ? "checked" : ""}> Auto-wire new boxes</label><button class="ghost" data-clear="1">Clear board</button>
        <span class="muted">Estimated cost <b>${c.problems.length ? "—" : money(live.cost)}</b> / month · budget ${money(level.slo.budget)}</span></div>
      ${toast ? `<p class="chip warn" style="display:block">${esc(toast)}</p>` : ""}
      ${c.problems.map((x) => `<p class="chip bad" style="display:block">${esc(x)}</p>`).join("")}
      ${c.notes.slice(0, 3).map((x) => `<p class="chip warn" style="display:block">${esc(x.text)}</p>`).join("")}
      ${inspector()}</section>`;
  }
  const refreshCanvas = () => { const el = document.getElementById("cv"); if (el) el.innerHTML = svgInner(play ? tickTiers() : result ? peakTiers(result.normal) : null, !!play); };
  function tickTiers() { const run = level.chaos.length ? result.stress : result.normal; return run.ticks[play.idx].tiers; }

  // ---- pointer handling: drag boxes, tap to select, tap-tap to wire
  function svgPoint(evt) { const svg = document.getElementById("cv"); const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
  document.addEventListener("pointerdown", (e) => {
    if (!canvasOn() || !level) return;
    const nodeEl = e.target.closest && e.target.closest("[data-node]"), edgeEl = e.target.closest && e.target.closest("[data-edge]");
    if (nodeEl) { const n = G.byId(graph, nodeEl.dataset.node); const p = svgPoint(e); drag = { id: n.id, dx: n.x - p.x, dy: n.y - p.y, sx: e.clientX, sy: e.clientY, moved: false }; try { nodeEl.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
    else if (edgeEl) { const [a, b] = edgeEl.dataset.edge.split("|"); sel = { edge: [a, b] }; linkFrom = null; render(); }
    else if (e.target.closest && e.target.closest("#cv")) { sel = null; linkFrom = null; render(); }
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
    drag.moved = true; const n = G.byId(graph, drag.id), p = svgPoint(e);
    n.x = Math.max(NW / 2, Math.min(W_ - NW / 2, p.x + drag.dx)); n.y = Math.max(NH / 2, Math.min(H_ - NH / 2 - 14, p.y + drag.dy)); refreshCanvas();
  });
  document.addEventListener("pointerup", () => {
    if (!drag) return; const d = drag; drag = null;
    if (d.moved) { saveGraph(); return; }
    if (linkFrom && linkFrom !== d.id) { const r = G.connect(graph, linkFrom, d.id); toast = r.ok ? "" : r.why; linkFrom = null; if (r.ok) { result = null; saveGraph(); } sel = { node: d.id }; return render(); }
    sel = { node: d.id }; linkFrom = null; toast = ""; render();
  });

  function nodeProp(prop, delta) {
    const n = G.byId(graph, sel.node); const lim = { count: [1, 60], workers: [1, 40], replicas: [0, 6] }[prop];
    if (n.type === "cache" && prop === "count") lim[1] = 12; if (n.type === "queue") lim[1] = 40;
    n[prop] = Math.max(lim[0], Math.min(lim[1], (+n[prop] || 0) + delta));
  }

  // ================================================================ STUDIO: the same engine, applied to your own product
  const CAL = [
    { g: "Capacity (requests per second)", key: "appCap", label: "One app instance", path: ["appCap"], unit: "req/s" },
    { g: "", key: "dbReadCap", label: "One database node, reads", path: ["dbReadCap"], unit: "req/s" },
    { g: "", key: "dbWriteCap", label: "One database primary, writes", path: ["dbWriteCap"], unit: "req/s" },
    { g: "", key: "cacheNodeCap", label: "One cache node", path: ["cacheNodeCap"], unit: "req/s" },
    { g: "", key: "workerCap", label: "One queue worker", path: ["workerCap"], unit: "msg/s" },
    { g: "Latency when idle", key: "msApp", label: "App server", path: ["baseMs", "app"], unit: "ms" },
    { g: "", key: "msRead", label: "Database read", path: ["baseMs", "dbRead"], unit: "ms" },
    { g: "", key: "msWrite", label: "Database write", path: ["baseMs", "dbWrite"], unit: "ms" },
    { g: "Cache hit rate for your real key pattern", key: "hitM", label: "Cache size M", path: ["cacheHit", "m"], unit: "0–1" },
    { g: "", key: "hitL", label: "Cache size L", path: ["cacheHit", "l"], unit: "0–1" },
    { g: "Monthly price (USD)", key: "pApp", label: "App instance", path: ["cost", "app"], unit: "$" },
    { g: "", key: "pShard", label: "Database primary", path: ["cost", "shard"], unit: "$" },
    { g: "", key: "pReplica", label: "Database replica", path: ["cost", "replica"], unit: "$" },
  ];
  const getDeep = (o, p) => p.reduce((x, k) => x[k], o);
  const STUDIO_DEFAULT = () => ({
    id: "p" + Date.now().toString(36), name: "My product", peakRps: 2000, shape: "steady", spikeX: 3, readPct: 90, staticPct: 0, botPct: 0, skew: 1,
    incidents: { dbDown: false, cacheFlush: false, lbDown: false, azOut: false }, p95: 200, avail: 99.9, budget: 5000, maxDelay: 0, cal: {}, cfg: E.defaults(),
  });
  let studioId = null;
  const projects = () => (progress.studio && progress.studio.projects) || [];
  const project = () => projects().find((p) => p.id === studioId) || null;

  function kOverFrom(p) {
    const over = {};
    CAL.forEach((c) => {
      const e = p.cal[c.key]; if (!e || e.v === "" || e.v == null || isNaN(+e.v)) return;
      let o = over; c.path.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; });
      o[c.path[c.path.length - 1]] = +e.v;
    });
    return Object.keys(over).length ? over : null;
  }
  function provenance(p, c) {
    const e = p.cal[c.key];
    if (e && e.measured) return "measured";
    return e && e.v !== "" && e.v != null && +e.v !== getDeep(E.K, c.path) ? "your estimate" : "teaching default";
  }
  function specToLevel(p) {
    const chaos = [];
    if (p.incidents.dbDown) chaos.push({ tick: 50, type: "dbDown", duration: 1 });
    if (p.incidents.cacheFlush) chaos.push({ tick: 60, type: "cacheFlush", duration: 1, severity: 1 });
    if (p.incidents.lbDown) chaos.push({ tick: 55, type: "lbDown", duration: 8 });
    if (p.incidents.azOut) chaos.push({ tick: 55, type: "azOut", duration: 25 });
    return { id: 0, title: p.name, story: "Your own product.", learn: "", allowed: ["cdn", "limiter", "lb", "app", "auto", "cache", "coalesce", "queue", "replicas", "shards", "ha", "salting"],
      load: { base: +p.peakRps, shape: p.shape, spikeX: +p.spikeX, readFrac: p.readPct / 100, staticFrac: p.staticPct / 100, botFrac: p.botPct / 100, skew: +p.skew },
      chaos, slo: { p95: +p.p95, avail: +p.avail, budget: +p.budget, maxDelay: +p.maxDelay > 0 ? +p.maxDelay : null } };
  }
  function enterProject(p) {
    studioId = p.id; mode = "studio"; level = specToLevel(p); cfg = E.normalize(p.cfg); kOver = kOverFrom(p); result = null; tab = "normal";
    graph = p.graph && p.graph.nodes && p.graph.nodes.some((n) => n.type === "client") ? p.graph : G.starter(); sel = null; linkFrom = null; toast = "";
  }
  function persistProject(p) { p.cfg = cfg; save(); }

  function studioHome() {
    $title.textContent = "Studio"; $back.hidden = false; $total.textContent = "";
    const list = projects();
    $app.innerHTML = `
      <section class="card"><h2>Studio: design your own product</h2>
        <p class="muted">The workflow: <b>describe</b> the product and its goals, <b>calibrate</b> with numbers you measured, <b>design</b> the architecture, <b>simulate</b> traffic and incidents, <b>export</b> a design brief and a hand-off prompt for a coding agent.
        Trust the result only where the numbers are marked <i>measured</i>; the brief says which ones are.</p>
        <button class="primary" data-studio-new="1">+ New project</button></section>
      ${list.length ? list.map((p) => `<section class="card"><h2>${esc(p.name)}</h2><p class="muted">${num(p.peakRps)} req/s baseline, ${esc(p.shape)}, ${p.readPct}% reads</p>
        <div class="row"><button class="ghost" data-studio-open="${p.id}">Open</button><button class="ghost" data-studio-del="${p.id}">Delete</button></div></section>`).join("") : `<p class="muted">No projects yet.</p>`}`;
  }

  function fld(label, name, value, opts) {
    opts = opts || {};
    return `<label class="fld"><span>${label}${opts.hint ? `<small class="muted"> ${opts.hint}</small>` : ""}</span>` +
      (opts.select ? `<select data-spec="${name}">${opts.select.map(([v, t]) => `<option value="${v}" ${String(v) === String(value) ? "selected" : ""}>${t}</option>`).join("")}</select>`
        : `<input data-spec="${name}" type="${opts.type || "number"}" value="${esc(value)}" ${opts.min != null ? `min="${opts.min}"` : ""} ${opts.max != null ? `max="${opts.max}"` : ""} ${opts.step ? `step="${opts.step}"` : ""} inputmode="${opts.type === "text" ? "text" : "decimal"}">`) + `</label>`;
  }

  function studioView() {
    const p = project(); if (!p) { mode = "game"; level = null; return render(); }
    $title.textContent = p.name; $back.hidden = false; $total.textContent = "";
    const peak = Math.max(...E.trafficCurve(level.load));
    const live = E.simulate(level, cfg, { chaos: false, k: kOver });
    const inc = (k, t) => `<label class="chk"><input type="checkbox" data-inc="${k}" ${p.incidents[k] ? "checked" : ""}> ${t}</label>`;
    const calRows = CAL.map((c) => {
      const e = p.cal[c.key] || {}, def = getDeep(E.K, c.path), prov = provenance(p, c);
      return `${c.g ? `<h3 class="grp">${c.g}</h3>` : ""}<div class="calrow"><span class="lab">${c.label}<small class="muted"> default ${def} ${c.unit}</small></span>
        <input data-cal="${c.key}" type="number" step="any" placeholder="${def}" value="${e.v == null ? "" : esc(e.v)}" aria-label="${c.label}">
        <label class="chk sm"><input type="checkbox" data-calm="${c.key}" ${e.measured ? "checked" : ""}> measured</label><span class="chip ${prov === "measured" ? "ok" : prov === "your estimate" ? "warn" : ""}">${prov}</span></div>`;
    }).join("");
    $app.innerHTML = `
      <section class="card"><h2>1 · Describe</h2>
        <div class="formgrid">
          ${fld("Product name", "name", p.name, { type: "text" })}
          ${fld("Baseline requests per second", "peakRps", p.peakRps, { min: 1 })}
          ${fld("Traffic shape", "shape", p.shape, { select: [["steady", "Steady"], ["ramp", "Growing"], ["diurnal", "Day / night"], ["spike", "Sudden spike"]] })}
          ${p.shape === "spike" ? fld("Spike multiplier", "spikeX", p.spikeX, { min: 1 }) : ""}
          ${fld("Reads (%)", "readPct", p.readPct, { min: 0, max: 100 })}
          ${fld("Static files (%)", "staticPct", p.staticPct, { min: 0, max: 100 })}
          ${fld("Bot traffic (%)", "botPct", p.botPct, { min: 0, max: 90 })}
          ${fld("Hot-key skew", "skew", p.skew, { min: 1, max: 5, step: "0.1", hint: "1 = even, 3 = one key gets 3× load" })}
        </div>
        <p class="muted">Peak load in this simulation: <b>${num(peak)} req/s</b>.</p>
        <h3 class="grp">Goals</h3>
        <div class="formgrid">${fld("p95 latency ≤ (ms)", "p95", p.p95, { min: 1 })}${fld("Availability ≥ (%)", "avail", p.avail, { min: 50, max: 100, step: "0.01" })}
          ${fld("Budget ≤ ($/month)", "budget", p.budget, { min: 1 })}${fld("Write delay ≤ (min, 0 = ignore)", "maxDelay", p.maxDelay, { min: 0 })}</div>
        <h3 class="grp">Incidents to survive</h3>
        <div class="chk-list">${inc("dbDown", "Database primary dies")}${inc("cacheFlush", "Cache is flushed")}${inc("lbDown", "Load balancer dies")}${inc("azOut", "A zone goes dark")}</div>
      </section>
      <section class="card"><h2>2 · Calibrate</h2>
        <p class="muted">These start as round teaching numbers. Replace them with what you measured or expect for your stack, and tick <i>measured</i> only if a load test or production metric backs it. The brief lists which numbers are which.</p>${calRows}</section>
      ${ui === "canvas" ? `<h2 class="cvtitle">3 · Design</h2>${canvasCard(play ? tickTiers() : result ? peakTiers(result.normal) : null, !!play)}<button class="primary" data-run="1">4 · ▶ Simulate</button>` : `      <div class="layout"><div>
        ${ui === "canvas" ? "" : `<section class="card"><div class="cv-head"><h2>3 · Design</h2><span class="seg" role="group" aria-label="Design view"><button data-ui="canvas" aria-pressed="false">Canvas</button><button data-ui="panel" aria-pressed="true">Buttons</button></span></div>${controls()}
          <p class="muted" style="margin:10px 0 0">Estimated cost: <b>${money(live.cost)}</b> a month (budget ${money(level.slo.budget)})</p></section>`}
        <button class="primary" data-run="1">4 · ▶ Simulate</button>
      </div><div><section class="card"><h2>Request path</h2>${flow(result && { peakRps: result.normal.peakRps, peakTiers: peakTiers(result.normal) })}</section></div></div>`}
      ${play ? liveCard() : result ? studioResult(result) : ""}`;
  }

  function studioResult(g) {
    const ck = g.checks, both = level.chaos.length ? g.stress : g.normal, cs = level.chaos.length ? ck.stress : ck.normal;
    const pass = g.passNormal && g.passChaos && g.underBudget;
    return `${scoreCard(g)}<section class="card"><h2>${pass ? "✓ Goals met in the model" : "✗ Goals not met yet"}</h2>
        <div class="tabs" role="group"><button data-tab="normal" aria-pressed="${tab === "normal"}">Normal hour</button>${level.chaos.length ? `<button data-tab="stress" aria-pressed="${tab === "stress"}">With incidents</button>` : ""}</div>
        ${chart(tab === "stress" && level.chaos.length ? g.stress : g.normal)}
        <div class="metrics" style="margin-top:10px">
          ${metric("p95 latency", Math.round(both.p95) + " ms", cs.latency, "goal ≤ " + level.slo.p95 + " ms")}
          ${metric("Availability", (both.availability * 100).toFixed(2) + "%", cs.availability, "goal ≥ " + level.slo.avail + "%")}
          ${metric("Monthly cost", money(g.stress.cost), ck.underBudget, "budget " + money(level.slo.budget))}
          ${level.slo.maxDelay != null ? metric("Write delay", both.maxDelayMin.toFixed(1) + " min", cs.delay, "goal ≤ " + level.slo.maxDelay + " min") : ""}
        </div></section>
      <section class="card post"><h2>Findings</h2><ul>${postmortem(g).map((x) => `<li>${x}</li>`).join("") || "<li>Nothing to report.</li>"}</ul></section>
      <section class="card"><h2>5 · Export</h2><p class="muted">A design brief with assumptions, results, risks and a checklist of what to verify with a real load test before building.</p>
        <div class="row"><button class="primary" data-copy="brief">Copy brief</button><button class="ghost" data-download="brief">Download .md</button></div>
        <div class="row" style="margin-top:10px"><button class="ghost" data-copy="prompt">Copy coding-agent prompt</button></div></section>`;
  }

  function designLines() {
    const c = cfg, L = [];
    if (c.cdn) L.push("CDN in front for static files");
    if (c.limiter > 0) L.push(`Rate limiter at ${num(c.limiter)} req/s`);
    L.push(c.lb === "none" ? "No load balancer" : c.lb === "ha" ? "Load balancer, highly available pair" : "Load balancer, single");
    L.push(`${c.app.n} app instances${c.app.auto ? " with autoscaling (up to 3×, reacts after about 2 minutes)" : ""}, stateless`);
    L.push(c.cache.tier === "none" ? "No cache" : `Cache: ${c.cache.nodes} node(s), size ${c.cache.tier.toUpperCase()}${c.cache.coalesce ? ", coalescing repeated misses" : ""}`);
    if (c.queue.on) L.push(`Write queue with ${c.queue.workers} workers (writes are accepted first and stored shortly after)`);
    L.push(`Database: ${c.db.shards} shard(s), ${c.db.replicas} read replica(s) per shard${c.db.ha ? ", automatic failover standby" : ""}${c.db.salting ? ", hot-key salting" : ""}`);
    return L;
  }
  const plain = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
  function buildBrief() {
    const p = project(), g = result, K = E.mergeK(kOver), lv = level, today = new Date().toISOString().slice(0, 10);
    const inc = Object.keys(p.incidents).filter((k) => p.incidents[k]).map((k) => ({ dbDown: "database primary dies", cacheFlush: "cache flushed", lbDown: "load balancer dies", azOut: "a zone goes dark" }[k]));
    const peak = Math.round(Math.max(...E.trafficCurve(lv.load)));
    const meas = CAL.filter((c) => provenance(p, c) === "measured").length;
    const both = lv.chaos.length ? g.stress : g.normal;
    const lines = [];
    lines.push(`# Design brief: ${p.name}`, "", `Generated ${today} by Architecture Lab (Studio). This is a **capacity model, not a load test.** Numbers marked "teaching default" are round teaching values and must not be trusted for sizing.`, "");
    lines.push("## Goals", "", `- Peak load in the model: ${num(peak)} req/s (baseline ${num(p.peakRps)}, shape ${p.shape}${p.shape === "spike" ? ` ×${p.spikeX}` : ""}), ${p.readPct}% reads, ${p.staticPct}% static, ${p.botPct}% bots, hot-key skew ${p.skew}`,
      `- p95 latency ≤ ${p.p95} ms; availability ≥ ${p.avail}%; budget ≤ ${money(p.budget)}/month${lv.slo.maxDelay != null ? `; write delay ≤ ${lv.slo.maxDelay} min` : ""}`, `- Incidents to survive: ${inc.length ? inc.join("; ") : "none selected"}`, "");
    lines.push("## Assumptions", "", "| Quantity | Value | Basis |", "|---|---|---|");
    CAL.forEach((c) => lines.push(`| ${c.label} (${c.unit}) | ${getDeep(K, c.path)} | ${provenance(p, c)} |`));
    lines.push("", `${meas} of ${CAL.length} numbers are marked measured.`, "");
    lines.push("## Design", "", ...designLines().map((x) => `- ${x}`), "");
    lines.push("## Simulated result", "", "| | Normal hour | With incidents |", "|---|---|---|", `| p95 latency | ${Math.round(g.normal.p95)} ms | ${Math.round(g.stress.p95)} ms |`,
      `| Availability | ${(g.normal.availability * 100).toFixed(2)}% | ${(g.stress.availability * 100).toFixed(2)}% |`, `| Monthly cost | ${money(g.normal.cost)} | ${money(g.stress.cost)} |`,
      `| Busiest tier at peak | ${g.normal.bottleneck.tier} (${Math.round(g.normal.bottleneck.util * 100)}%) | ${g.stress.bottleneck.tier} (${Math.round(g.stress.bottleneck.util * 100)}%) |`, "",
      `Verdict in the model: ${g.passNormal && g.passChaos && g.underBudget ? "all goals met" : "goals NOT met"} (latency ${(lv.chaos.length ? g.checks.stress : g.checks.normal).latency ? "ok" : "fail"}, availability ${(lv.chaos.length ? g.checks.stress : g.checks.normal).availability ? "ok" : "fail"}, budget ${g.underBudget ? "ok" : "fail"}).`, "");
    lines.push("## Findings", "", ...(postmortem(g).map((x) => `- ${plain(x)}`).length ? postmortem(g).map((x) => `- ${plain(x)}`) : ["- None."]), "");
    lines.push("## Verify before you build", "",
      `- [ ] Load-test one app instance to find its real capacity (model assumed ${K.appCap} req/s) and its idle latency (${K.baseMs.app} ms).`,
      `- [ ] Measure database read and write capacity on production-like data (model assumed ${K.dbReadCap} reads/s per node and ${K.dbWriteCap} writes/s per primary).`,
      `- [ ] Measure the real cache hit rate with a sample of real keys (model assumed ${Math.round((K.cacheHit[cfg.cache.tier] || 0) * 100)}% for size ${cfg.cache.tier.toUpperCase()}).`,
      ...inc.map((x) => `- [ ] Run a failure drill: ${x}. Confirm the recovery time the model assumed.`),
      `- [ ] Re-run this brief with the measured numbers and only then commit to the design.`, "");
    return lines.join("\n");
  }
  function buildPrompt() {
    const p = project(), g = result;
    return [`You are implementing the backend for "${p.name}". Follow the architecture below. Do not add components that are not listed, and say so if a listed component cannot meet a goal.`, "",
      "Architecture:", ...designLines().map((x) => `- ${x}`), "",
      "Goals to design and test against:", `- Peak ${num(Math.round(Math.max(...E.trafficCurve(level.load))))} req/s, ${p.readPct}% reads`, `- p95 latency ≤ ${p.p95} ms, availability ≥ ${p.avail}%`,
      "", "Deliver:", "- The service code and infrastructure definition for this design.", "- A load-test script that drives the peak load and reports p95 latency and error rate.",
      "- A failure drill script for each incident: " + (Object.keys(p.incidents).filter((k) => p.incidents[k]).join(", ") || "none") + ".",
      "- A short note listing every assumption you had to make.", "", "The capacity numbers behind this design are model estimates unless marked measured in the brief. Report measured results from the load test so the design can be re-checked."].join("\n");
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => false);
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) { /* ignore */ } ta.remove(); return Promise.resolve(ok);
  }
  function flash(btn, msg) { const t = btn.textContent; btn.textContent = msg; setTimeout(() => { btn.textContent = t; }, 1500); }

  function render() { if (mode === "practice") return practiceView(); if (mode === "studio") return studioView(); if (mode === "studio-home") return studioHome(); level ? levelView() : home(); }

  function practiceView() {
    const embedded = document.documentElement.classList.contains("control-room-embed");
    const examples = [
      ["urlshort", "URL shortener", "High-read redirects: cache hot links, keep writes durable, and prevent a database bottleneck.",
        "This is a read-heavy system: far more people click a short link than create one. The load balancer spreads incoming clicks across app servers so no single server is overwhelmed; the cache sits in front of the database and absorbs most of that read traffic, since the same popular links get clicked over and over. The database only needs to be fast for the smaller slice of writes (new links) and for cache misses. Watch what happens to database load if you remove the cache, or what happens to tail latency if one app server goes down without a load balancer in front."],
      ["news", "News site", "A read-heavy publishing system: CDN, cache, search, article updates, and traffic spikes.",
        "A CDN sits in front of everything because most requests are for the same handful of articles, especially during a traffic spike -- serving those from edge locations means your own servers barely see the load. The cache behind the CDN protects the database from the smaller slice of traffic the CDN doesn't catch. Search is a separate concern from the main database because search queries (full-text, ranked) are a different access pattern than simple lookups. Notice how the design assumes reads vastly outnumber writes (new articles are rare compared to article views)."],
      ["events", "Event ingestion", "Accept a burst of events safely, buffer work, process consumers, and keep data queryable.",
        "The core idea here is decoupling accepting an event from processing it. A burst of events arrives faster than you can process them one-by-one, so a queue absorbs the burst and lets consumers work through it at a sustainable pace instead of falling over. This trades immediacy (events aren't processed the instant they arrive) for durability (nothing gets dropped during a spike). Watch what happens to the queue depth during a traffic burst, and what happens if a consumer is too slow relative to the arrival rate."],
      ["payments", "Payments API", "Move money safely with idempotency, transaction boundaries, audit records, and failure recovery.",
        "Correctness matters more than speed here. An API gateway in front handles auth and rate limiting before a request ever reaches the payment logic. The database needs real transaction boundaries and replication for high availability, since losing a payment record is unacceptable. The external payment provider is modeled as a dependency that can fail or be slow -- notice it's drawn as a separate, limited-capacity node, because a real payment processor has its own rate limits and latency you don't control."],
      ["rag", "LLM chat with RAG", "Serve chat requests with retrieval, vector search, model calls, guardrails, and observability.",
        "A chat request isn't answered directly by the model -- it first goes through retrieval: a vector database finds relevant context, which gets added to the prompt before the LLM call. This is why vector search and the LLM are separate nodes with different cost/latency profiles (vector search is cheap and fast; the LLM call is slow and expensive). The gateway in front can add caching, rate limiting, and guardrails before an expensive model call happens. Watch the simulation's latency numbers -- the LLM step dominates almost everything else."],
      ["jobs", "Remote job discovery", "Discover companies, crawl job boards, match resumes, prepare applications, and keep proof in local memory.",
        "This pipeline has distinct stages that each do one job: discover companies, crawl their boards, match postings to a resume, then prepare an application -- each stage writes its result for the next one to read, rather than one giant function doing everything. A search index sits alongside the main database because searching/matching jobs is a different access pattern than storing raw crawl data. Notice the queue between crawling and the database: crawling is bursty and unreliable (sites change, fail, rate-limit you), so buffering that work protects the rest of the pipeline from crawl failures."],
      ["storm", "Retry storm", "See how retries amplify a dependency failure, then add limits, queues, and backoff.",
        "This one is a cautionary example on purpose. When a downstream dependency slows down or fails, naive retries can multiply the load on it -- each failed request becomes 2, 3, or more retried requests, making the failure worse instead of better. Run the simulation and break the dependency to watch retries amplify the problem, then add a rate limiter, a queue, or backoff/circuit-breaking and re-run it to see the difference. The lesson is that retries without limits are not a safety net, they're an accelerant."],
      ["global", "Global failover app", "Keep a worldwide app available through region routing, replicated data, and controlled failover.",
        "Users in different regions are routed to the nearest healthy region by a global load balancer, so normal traffic never crosses an ocean. Data is replicated between regions so a failover doesn't mean starting from zero. The interesting part is the failure case: when one region goes down, traffic has to shift to the other region's capacity, which means that region needs enough spare capacity to absorb it. Try the region-failure simulation and watch what the surviving region's load looks like."]
    ];
    const current = examples.find((x) => x[0] === practiceExample);
    const refSrc = `sandbox.html?reference=1&example=${practiceExample}&embed=${embedded ? "control-room" : "none"}`;
    $title.textContent = "Reference practice"; $back.hidden = directPractice; $total.textContent = "";
    $app.innerHTML = `<section class="practice-shell">
      <header class="practice-head"><div class="practice-intro"><span class="cr-badge">Learn by rebuilding</span><h2>${esc(current[1])}</h2><p>${esc(current[2])}</p><div class="practice-meta"><span>Guided exercise</span><span>Reference included</span><span>Build → simulate → review</span></div></div><div class="practice-actions"><button class="ghost" data-toggle-practice-library="1">${practiceLibraryOpen ? "Close examples" : "Browse examples"}</button><label>Example <select data-practice-example>${examples.map(([id, label]) => `<option value="${id}" ${id === practiceExample ? "selected" : ""}>${label}</option>`).join("")}</select></label><button class="primary practice-review" data-practice-review="1">Review my design</button></div></header>
      ${practiceLibraryOpen ? `<section class="practice-library" aria-label="System design example library"><div class="practice-library-head"><div><b>Example library</b><small>Open any example to read its goal and load its reference diagram.</small></div><span>${examples.length} systems</span></div><div class="practice-library-grid">${examples.map(([id, title, description]) => `<article class="practice-example ${id === practiceExample ? "selected" : ""}"><span>${id === practiceExample ? "OPEN" : "EXAMPLE"}</span><h3>${esc(title)}</h3><p>${esc(description)}</p><button data-practice-pick="${id}">${id === practiceExample ? "Viewing diagram" : "Open diagram"}</button></article>`).join("")}</div></section>` : ""}
      <details class="practice-reference-card" ${referenceVisible ? "open" : ""}><summary><span>Reference design · ${esc(current[1])}</span><small>Request path and components · click to ${referenceVisible ? "collapse" : "expand"}</small></summary>
        <div class="practice-reference-body">
          <div class="practice-reference-canvas"><button class="ghost practice-reference-pop" data-open-reference-dialog="1" data-ref-title="${esc(current[1])}" data-ref-src="${refSrc}">⤢ Open full size</button><iframe class="practice-reference" src="${refSrc}" title="${esc(current[1])} reference architecture"></iframe></div>
          <div class="practice-reference-learn"><b>What to learn from this design</b><p>${esc(current[3])}</p></div>
        </div>
      </details>
      <section class="practice-step practice-draw"><div class="practice-step-head"><span>Build</span><div><b>Your playground</b><small>Choose a component on the right, place it on the canvas, then connect the request flow.</small></div><em>Start with the entry point</em></div><iframe id="practiceBoard" class="practice-board" src="sandbox.html?practice=1&tab=architect&embed=${embedded ? "control-room" : "none"}" title="Your architecture canvas"></iframe></section>
    </section>`;
  }

  // ---------------------------------------------------------------- events
  function setPath(path, val) {
    const parts = path.split("."); let o = cfg;
    while (parts.length > 1) o = o[parts.shift()];
    o[parts[0]] = val;
  }
  function getPath(path) { return path.split(".").reduce((o, k) => o[k], cfg); }
  const LIMITS = { "app.n": [1, 60], "cache.nodes": [1, 12], "queue.workers": [1, 40], "db.shards": [1, 16], "db.replicas": [0, 6] };

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.openPlayground) {
      // Real Play (sandbox.html) is the actual free-draw canvas: the full 330-component catalog,
      // ~100 example designs to browse while you draw, live traffic, and a real AI mentor review --
      // Studio mode here covers draw+simulate but its own "Findings" are local rules, not an AI call,
      // and it doesn't have the example library. Embedding it in-page keeps Playground a tab of
      // Learn, not a trip to a different sidebar page.
      mode = "playground"; level = null; return render();
    }
    if (t.dataset.openPractice) { mode = "practice"; level = null; return render(); }
    if (t.dataset.openReferenceDialog) {
      const dlg = document.getElementById("referenceDialog");
      document.getElementById("referenceDialogTitle").textContent = "Reference design · " + t.dataset.refTitle;
      document.getElementById("referenceDialogFrame").src = t.dataset.refSrc;
      if (dlg && typeof dlg.showModal === "function") dlg.showModal();
      return;
    }
    if (t.id === "referenceDialogClose") { const dlg = document.getElementById("referenceDialog"); if (dlg) dlg.close(); return; }
    if (t.dataset.togglePracticeLibrary) { practiceLibraryOpen = !practiceLibraryOpen; return render(); }
    if (t.dataset.practicePick) { practiceExample = t.dataset.practicePick; referenceVisible = true; practiceLibraryOpen = false; return render(); }
    if (t.dataset.toggleReference) { referenceVisible = !referenceVisible; return render(); }
    if (t.dataset.practiceReview) { const board = document.getElementById("practiceBoard"); if (board && board.contentWindow) board.contentWindow.postMessage({ type: "archlab-review" }, "*"); flash(t, "Reviewing your canvas…"); return; }
    if (t.dataset.nextLesson) return go(nextLesson().id);
    if (t.dataset.level) return go(+t.dataset.level);
    if (t.id === "back") { stopPlay(); if (mode === "practice") { mode = "game"; return render(); } if (mode === "studio") { mode = "studio-home"; level = null; return render(); } if (mode === "studio-home") { mode = "game"; return render(); } level = null; return render(); }
    if (t.dataset.mode === "studio") { mode = "studio-home"; return render(); }
    if (t.dataset.studioNew) { const np = STUDIO_DEFAULT(); progress.studio = progress.studio || { projects: [] }; progress.studio.projects.push(np); save(); enterProject(np); return render(); }
    if (t.dataset.studioOpen) { const op = projects().find((x) => x.id === t.dataset.studioOpen); if (op) { enterProject(op); render(); window.scrollTo(0, 0); } return; }
    if (t.dataset.studioDel) { if (window.confirm("Delete this project?")) { progress.studio.projects = projects().filter((x) => x.id !== t.dataset.studioDel); save(); } return render(); }
    if (t.dataset.copy) { const txt = t.dataset.copy === "brief" ? buildBrief() : buildPrompt(); return copyText(txt).then((ok) => flash(t, ok ? "Copied" : "Copy failed")); }
    if (t.dataset.download) { const blob = new Blob([buildBrief()], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = project().name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-design-brief.md"; document.body.appendChild(a); a.click(); a.remove(); return; }
    if (!level) return;
    if (t.dataset.set) {
      const k = t.dataset.set, v = t.dataset.val;
      if (k === "limiter") { const peak = Math.max(...E.trafficCurve(level.load)); setPath(k, +v ? Math.round(peak * +v) : 0); }
      else if (["cdn", "app.auto", "cache.coalesce", "queue.on", "db.ha", "db.salting"].includes(k)) setPath(k, v === "1");
      else setPath(k, v);
      result = null; if (mode === "studio" && project()) persistProject(project()); return render();
    }
    if (t.dataset.step) {
      const k = t.dataset.step, lim = LIMITS[k];
      setPath(k, Math.max(lim[0], Math.min(lim[1], getPath(k) + +t.dataset.d)));
      result = null; if (mode === "studio" && project()) persistProject(project()); return render();
    }
    if (t.dataset.ui) { ui = t.dataset.ui; progress.ui = ui; save(); result = null; return render(); }
    if (t.dataset.add) {
      const n = G.addNode(graph, t.dataset.add); toast = "";
      if (autoWire) G.autoWire(graph, n);
      sel = { node: n.id }; result = null; saveGraph(); return render();
    }
    if (t.dataset.clear) { graph = G.starter(); sel = null; linkFrom = null; toast = ""; result = null; saveGraph(); return render(); }
    if (t.dataset.del && sel && sel.node) { G.removeNode(graph, sel.node); sel = null; result = null; saveGraph(); return render(); }
    if (t.dataset.rmedge && sel && sel.edge) { G.removeEdge(graph, sel.edge[0], sel.edge[1]); sel = null; result = null; saveGraph(); return render(); }
    if (t.dataset.linkfrom && sel && sel.node) { linkFrom = linkFrom === sel.node ? null : sel.node; toast = linkFrom ? "Now tap the box to connect to." : ""; return render(); }
    if (t.dataset.np && sel && sel.node) { nodeProp(t.dataset.np, +t.dataset.d); result = null; saveGraph(); return render(); }
    if (t.dataset.nset && sel && sel.node) { const n2 = G.byId(graph, sel.node), k = t.dataset.nset; n2[k] = ["auto", "coalesce", "ha", "salting"].includes(k) ? t.dataset.val === "1" : k === "limitX" ? +t.dataset.val : t.dataset.val; result = null; saveGraph(); return render(); }
    if (t.dataset.speed) { speed = +t.dataset.speed; if (play) { clearInterval(play.timer); const i = play.idx; startPlay(); play.idx = i; } return render(); }
    if (t.dataset.skip) return finishPlay();
    if (t.dataset.dismissTips) { progress.tipsDismissed = true; save(); return render(); }
    if (t.dataset.share) { const url = location.origin + location.pathname + "#s=" + btoa(JSON.stringify({ l: level.id, c: canvasOn() ? E.normalize(compileNow().cfg) : cfg })); return copyText(url).then((ok) => flash(t, ok ? "Link copied" : "Copy failed")); }
    if (t.dataset.tab) { tab = t.dataset.tab; return render(); }
    if (t.dataset.hint) { hintsShown = Math.min(3, hintsShown + 1); return render(); }
    if (t.dataset.reset && canvasOn()) { graph = G.starter(); sel = null; linkFrom = null; toast = ""; result = null; saveGraph(); return render(); }
    if (t.dataset.reset) { cfg = E.normalize(E.defaults()); result = null; if (mode === "studio" && project()) persistProject(project()); return render(); }
    if (t.dataset.next) return go(level.id + 1);
    if (t.dataset.run) {
      if (canvasOn()) { const cc = compileNow(); if (cc.problems.length) { toast = cc.problems[0]; return render(); } cfg = E.normalize(cc.cfg); toast = ""; }
      cfg = E.normalize(cfg);
      result = E.grade(level, cfg, { k: kOver }); tab = "normal";
      if (mode === "studio") { const sp = project(); if (sp) persistProject(sp); startPlay(); render(); const lv = document.getElementById("live"); if (lv) lv.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const p = progress.levels[level.id] || { stars: 0, attempts: 0 };
      p.attempts += 1; p.cfg = cfg; if (mode === "game" && ui === "canvas") p.graph = graph;
      if (result.stars > p.stars) p.stars = result.stars;
      if (result.stars === 3 && (!p.bestCost || result.stress.cost < p.bestCost)) p.bestCost = result.stress.cost;
      const sc = scoreOf(result, level, parOf(level)); if (!p.bestScore || sc.total > p.bestScore) p.bestScore = sc.total;
      progress.levels[level.id] = p; save();
      startPlay(); render();
      const el = document.getElementById("live"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // <details>'s own "toggle" event doesn't bubble, so it has to be caught in the capture phase to
  // reach a single delegated listener here -- without this, clicking the summary toggled the native
  // element open/closed but never told the app, so the next re-render (e.g. picking a new example)
  // snapped it back to whatever referenceVisible last was, fighting the user's own click.
  // Native <dialog> doesn't close on a backdrop click by default -- a click lands on the <dialog>
  // element itself only when it's outside the content box (CSS gives the content its own padding
  // box), so this is the standard way to detect "clicked the dim area, not the card".
  (function () {
    const dlg = document.getElementById("referenceDialog");
    if (!dlg) return;
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => { document.getElementById("referenceDialogFrame").src = "about:blank"; });
  })();
  document.addEventListener("toggle", (e) => {
    if (!e.target || !e.target.classList || !e.target.classList.contains("practice-reference-card")) return;
    referenceVisible = e.target.open;
    // Patch just the label in place instead of a full render() -- re-rendering here would
    // regenerate the reference and playground <iframe> tags, reloading both (and losing whatever
    // the user had just drawn) just because they expanded a summary.
    const label = e.target.querySelector("summary small");
    if (label) label.textContent = `Request path and components · click to ${referenceVisible ? "collapse" : "expand"}`;
    // A closed <details> has zero-size content, so the reference iframe's own first fitView()
    // ran against a 0x0 board and produced a degenerate zoom/pan; its resize-observer treats the
    // next (now-real-size) measurement as a fresh baseline rather than a change, so it never
    // re-fits on its own. Reloading the src on open re-runs fitView() once the card's real size
    // is in effect, which is harmless since this iframe is a read-only reference, not user work.
    if (referenceVisible) {
      const refFrame = e.target.querySelector(".practice-reference");
      if (refFrame && refFrame.contentWindow) refFrame.contentWindow.location.reload();
    }
  }, true);
  document.addEventListener("change", (e) => {
    if (e.target && e.target.dataset && e.target.dataset.practiceExample) { practiceExample = e.target.value; referenceVisible = true; return render(); }
    if (e.target.dataset && e.target.dataset.autowire) { autoWire = e.target.checked; return; }
    const t = e.target; if (mode !== "studio") return; const p = project(); if (!p) return;
    if (t.dataset.spec) { const k = t.dataset.spec; p[k] = ["name", "shape"].includes(k) ? t.value : Math.max(0, +t.value || 0); }
    else if (t.dataset.inc) p.incidents[t.dataset.inc] = t.checked;
    else if (t.dataset.cal) { const e2 = p.cal[t.dataset.cal] || (p.cal[t.dataset.cal] = {}); e2.v = t.value === "" ? "" : +t.value; }
    else if (t.dataset.calm) { const e2 = p.cal[t.dataset.calm] || (p.cal[t.dataset.calm] = {}); e2.measured = t.checked; }
    else return;
    level = specToLevel(p); kOver = kOverFrom(p); result = null; save(); render();
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  try {
    const m = /^#s=(.+)$/.exec(location.hash);
    if (m) { const d = JSON.parse(atob(m[1])); if (LEVELS.some((l) => l.id === d.l)) { go(d.l); cfg = E.normalize(d.c); ui = "canvas"; graph = G.fromCfg(cfg, peakOf()); render(); } }
  } catch (e) { /* ignore a broken link */ }
  if (!level) {
    const qs = new URLSearchParams(location.search);
    const lvlParam = qs.get("level");
    if (lvlParam) {
      const wantId = lvlParam === "next" ? nextLesson().id : Number(lvlParam);
      if (LEVELS.some((l) => l.id === wantId)) go(wantId);
    } else if (qs.get("studio") === "1") mode = "studio-home";
    else if (qs.get("practice") === "1") mode = "practice";
  }
  if (!level) render();
})();
