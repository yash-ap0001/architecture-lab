/* Architecture Lab engine: a deterministic capacity model of a web request path.
 *
 * It is a teaching model. Every number below is a round LEARNING number chosen so that
 * trade-offs show up clearly. They are not vendor benchmarks and must not be used to size a real system.
 * The same inputs always give the same result (no randomness), so a design can be replayed and compared.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LabEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TICKS = 120;                 // each tick is 30 seconds, so one run is one hour
  const TICK_S = 30;
  const KBASE = {
    lbCap: 30000,                    // requests/s one load balancer handles
    appCap: 400,                     // requests/s per app instance
    cacheNodeCap: 60000,             // requests/s per cache node
    cacheHit: { none: 0, s: 0.55, m: 0.8, l: 0.92 },
    cdnHit: 0.9,
    dbReadCap: 2000,                 // reads/s per database node
    dbWriteCap: 1000,                // writes/s per shard primary
    workerCap: 400,                  // writes/s per queue worker
    maxBacklog: 3000000,             // queued messages before the queue drops
    baseMs: { edge: 8, lb: 2, app: 25, cacheHit: 2, dbRead: 8, dbWrite: 12, queueAck: 4 },
    cost: { lb: 30, lbHa: 70, app: 80, cache: { s: 40, m: 90, l: 220 }, queue: 60, worker: 45, shard: 300, replica: 200, ha: 150, cdn: 200, limiter: 40 },
    coldTicks: 25,                   // ticks for a flushed cache to refill
    autoLag: 4,                      // ticks before autoscaling reacts
    recoverManual: 40, recoverHa: 4, // ticks to restore a dead database primary
  };

  /* A user can replace any teaching number with one they measured (calibration). Nested tables merge one level deep. */
  function mergeK(over) {
    if (!over) return KBASE;
    const k = Object.assign({}, KBASE, over);
    k.baseMs = Object.assign({}, KBASE.baseMs, over.baseMs || {});
    k.cacheHit = Object.assign({}, KBASE.cacheHit, over.cacheHit || {});
    k.cost = Object.assign({}, KBASE.cost, over.cost || {});
    k.cost.cache = Object.assign({}, KBASE.cost.cache, (over.cost && over.cost.cache) || {});
    return k;
  }

  // ---------------------------------------------------------------- traffic
  function trafficCurve(load) {
    const out = [];
    for (let t = 0; t < TICKS; t++) {
      let f = 1;
      if (load.shape === "ramp") f = 0.35 + 0.65 * (t / (TICKS - 1));
      else if (load.shape === "spike") f = t >= 40 && t < 75 ? load.spikeX || 5 : 1;
      else if (load.shape === "diurnal") f = 0.55 + 0.45 * Math.sin((t / TICKS) * Math.PI);
      out.push((load.base || 0) * f);
    }
    return out;
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const util = (load, cap) => (cap <= 0 ? (load > 0 ? 9 : 0) : load / cap);
  const stretch = (base, u) => { const x = clamp(u, 0, 0.95); return base * (1 + x / (2 * (1 - x))); };   // queueing delay grows as a tier fills (M/D/1 shape)

  function defaults() {
    return { cdn: false, limiter: 0, lb: "none", app: { n: 1, auto: false }, cache: { tier: "none", nodes: 1, coalesce: false },
             queue: { on: false, workers: 2 }, db: { shards: 1, replicas: 0, ha: false, salting: false } };
  }
  function normalize(cfg) {
    const d = defaults();
    return {
      cdn: !!(cfg && cfg.cdn), limiter: Math.max(0, +(cfg && cfg.limiter) || 0), lb: (cfg && cfg.lb) || d.lb,
      app: { n: clamp(Math.round(+((cfg && cfg.app && cfg.app.n) || 1)), 1, 60), auto: !!(cfg && cfg.app && cfg.app.auto) },
      cache: { tier: (cfg && cfg.cache && cfg.cache.tier) || "none", nodes: clamp(Math.round(+((cfg && cfg.cache && cfg.cache.nodes) || 1)), 1, 12), coalesce: !!(cfg && cfg.cache && cfg.cache.coalesce) },
      queue: { on: !!(cfg && cfg.queue && cfg.queue.on), workers: clamp(Math.round(+((cfg && cfg.queue && cfg.queue.workers) || 2)), 1, 40) },
      db: { shards: clamp(Math.round(+((cfg && cfg.db && cfg.db.shards) || 1)), 1, 16), replicas: clamp(Math.round(+((cfg && cfg.db && cfg.db.replicas) || 0)), 0, 6),
            ha: !!(cfg && cfg.db && cfg.db.ha), salting: !!(cfg && cfg.db && cfg.db.salting) },
    };
  }

  // ---------------------------------------------------------------- one run
  function simulate(levelIn, cfgIn, opts) {
    const K = mergeK(opts && opts.k);
    const level = levelIn, cfg = normalize(cfgIn), withChaos = !opts || opts.chaos !== false;
    const L = level.load, rps = trafficCurve(L);
    const rf = L.readFrac, sf = L.staticFrac || 0, skew = L.skew || 1;
    const chaos = withChaos ? level.chaos || [] : [];
    const active = (type, t) => chaos.some((c) => c.type === type && t >= c.tick && t < c.tick + (c.duration || 1));
    const started = (type, t) => { const c = chaos.find((x) => x.type === type && t >= x.tick); return c ? c.tick : -1; };

    const ticks = [];
    let backlog = 0, appLive = cfg.app.n, appExtraSum = 0, dbDownUntil = -1, lag = 0;
    let okSum = 0, reqSum = 0;

    for (let t = 0; t < TICKS; t++) {
      const R = rps[t];
      const bots = R * (L.botFrac || 0), legit = R - bots;
      // ---- rate limiter
      let admitted = R, shedLegit = 0;
      if (cfg.limiter > 0) {
        const botsPassed = bots * 0.1;
        let total = legit + botsPassed;
        if (total > cfg.limiter) { shedLegit = total - cfg.limiter; total = cfg.limiter; }
        admitted = total;
      }
      const botShare = cfg.limiter > 0 ? (bots * 0.1) / Math.max(admitted, 1) : bots / Math.max(R, 1);
      const legitAdmitted = Math.max(0, admitted * (1 - botShare));

      // ---- CDN takes static traffic
      const originIn = admitted * (1 - sf) + admitted * sf * (cfg.cdn ? 1 - K.cdnHit : 1);
      const edgeShare = cfg.cdn ? (sf * K.cdnHit) : 0;               // fraction of admitted requests answered at the edge

      // ---- load balancer
      let lbPass = 1, lbDown = active("lbDown", t) && cfg.lb === "single";
      if (cfg.lb === "none" && cfg.app.n > 1) lbPass = 1 / cfg.app.n;  // clients cannot spread traffic without one
      if (lbDown) lbPass = 0;
      if (originIn > K.lbCap) lbPass = Math.min(lbPass, K.lbCap / originIn);
      let flow = originIn * lbPass;

      // ---- app tier (with optional autoscaling and an availability-zone outage)
      const azOut = active("azOut", t) && !(cfg.db.ha && cfg.lb === "ha");
      let n = cfg.app.n;
      if (cfg.app.auto) {
        const target = clamp(Math.ceil(flow / (K.appCap * 0.6)), cfg.app.n, cfg.app.n * 3);
        if (target > appLive) { lag++; if (lag >= K.autoLag) appLive = Math.min(target, appLive + Math.max(2, Math.ceil(appLive * 0.25))); }
        else { lag = 0; appLive = Math.max(target, appLive - 1); }
        n = appLive;
      }
      appExtraSum += Math.max(0, n - cfg.app.n);
      const nEff = azOut ? Math.max(1, Math.floor(n / 2)) : n;
      const appCap = nEff * K.appCap;
      const appPass = flow > 0 ? Math.min(1, appCap / flow) : 1;
      const uApp = util(flow, appCap);
      flow *= appPass;

      const reads = flow * rf, writes = flow * (1 - rf);

      // ---- cache
      let hit = 0, cacheOverflow = 0, herd = 1, cacheCap = 0;
      if (cfg.cache.tier !== "none") {
        const nodes = azOut ? Math.max(1, Math.floor(cfg.cache.nodes / 2)) : cfg.cache.nodes;
        cacheCap = nodes * K.cacheNodeCap;
        hit = K.cacheHit[cfg.cache.tier] || 0;
        const fl = started("cacheFlush", t);
        if (fl >= 0 && t - fl < K.coldTicks) {
          const sev = (chaos.find((c) => c.type === "cacheFlush") || {}).severity || 1;   // share of the cache lost
          const loss = sev * (1 - (t - fl) / K.coldTicks);
          hit *= 1 - loss;
          herd = 1 + (cfg.cache.coalesce ? 0.3 : 2) * loss;            // thundering herd on the database
        }
        if (reads > cacheCap) cacheOverflow = reads - cacheCap;
      }
      const cacheServed = Math.min(reads, cacheCap) * hit;
      const readsToDb = (reads - cacheServed) * herd;

      // ---- queue and database
      const S = cfg.db.shards, rep = cfg.db.replicas;
      const k = S > 1 ? (cfg.db.salting ? Math.min(skew, 1.1) : skew) : 1;   // hot shard multiplier
      let dbWriteCap = (S * K.dbWriteCap) / k, nodes = S * (1 + rep);
      let dbReadCap = (nodes * K.dbReadCap) / k;
      if (active("dbDown", t) || dbDownUntil > t) {
        if (dbDownUntil < t && active("dbDown", t)) dbDownUntil = t + (cfg.db.ha ? K.recoverHa : K.recoverManual);
      }
      const dbDown = dbDownUntil > t;
      if (dbDown) { dbWriteCap = 0; dbReadCap = rep > 0 ? (S * rep * K.dbReadCap) / k : 0; }
      if (azOut && !cfg.db.ha) { dbWriteCap *= 0.5; dbReadCap *= 0.5; }

      let writePass = 1, wLatency = K.baseMs.dbWrite, dbWriteLoad = writes, delaySec = 0;
      if (cfg.queue.on) {
        const drainRate = Math.min(cfg.queue.workers * K.workerCap, dbWriteCap);      // messages per second reaching storage
        const pending = backlog + writes * TICK_S;                                    // backlog is counted in messages
        const drainedMsgs = Math.min(pending, drainRate * TICK_S);
        backlog = pending - drainedMsgs;
        if (backlog > K.maxBacklog) { writePass = 1 - (backlog - K.maxBacklog) / Math.max(writes * TICK_S, 1); writePass = clamp(writePass, 0, 1); backlog = K.maxBacklog; }
        dbWriteLoad = drainedMsgs / TICK_S;
        delaySec = drainRate > 0 ? backlog / drainRate : (backlog > 0 ? 1e9 : 0);
        wLatency = K.baseMs.queueAck;
      } else {
        writePass = writes > 0 ? Math.min(1, dbWriteCap / writes) : 1;
        dbWriteLoad = writes * writePass;
        wLatency = stretch(K.baseMs.dbWrite, util(dbWriteLoad, dbWriteCap));
      }
      const readsDb = readsToDb + cacheOverflow;
      const readPassDb = readsDb > 0 ? Math.min(1, dbReadCap / readsDb) : 1;
      const uDbR = util(readsDb, dbReadCap), uDbW = util(cfg.queue.on ? Math.min(writes, dbWriteCap) : writes, dbWriteCap);
      const missShare = reads > 0 ? readsDb / reads : 0;                  // fraction of reads that need the database
      const readPass = 1 - Math.min(1, missShare) * (1 - readPassDb);
      const stale = rep > 0 && uDbW > 0.7 ? (rep / (1 + rep)) * clamp((uDbW - 0.7) / 0.3, 0, 1) * (1 - hit) : 0;

      // ---- latency paths (weights are shares of ADMITTED requests)
      const uCache = cfg.cache.tier === "none" ? 0 : util(reads, cacheCap);
      const hitMs = K.baseMs.lb * (cfg.lb === "none" ? 0 : 1) + stretch(K.baseMs.app, uApp) + K.baseMs.cacheHit * stretch(1, uCache);
      const missMs = hitMs - K.baseMs.cacheHit * stretch(1, uCache) + (cfg.cache.tier === "none" ? 0 : K.baseMs.cacheHit) + stretch(K.baseMs.dbRead, uDbR);
      const wMs = K.baseMs.lb * (cfg.lb === "none" ? 0 : 1) + stretch(K.baseMs.app, uApp) + wLatency;
      const originShare = 1 - edgeShare, rdShare = originShare * rf, wrShare = originShare * (1 - rf);
      const paths = [
        { w: edgeShare, ms: K.baseMs.edge },
        { w: rdShare * (1 - clamp(missShare, 0, 1)), ms: hitMs },
        { w: rdShare * clamp(missShare, 0, 1), ms: missMs },
        { w: wrShare, ms: wMs },
      ].filter((p) => p.w > 1e-9).sort((a, b) => a.ms - b.ms);
      let acc = 0, p95 = paths.length ? paths[paths.length - 1].ms : 0;
      const tot = paths.reduce((s, p) => s + p.w, 0);
      for (const p of paths) { acc += p.w / tot; if (acc >= 0.95) { p95 = p.ms; break; } }

      // ---- success rate for legitimate requests this tick
      const passOrigin = lbPass * appPass * (rf * readPass + (1 - rf) * (dbDown && !cfg.queue.on && dbWriteCap === 0 ? 0 : writePass));
      const passAdmit = legit > 0 ? 1 - shedLegit / Math.max(legit, 1) : 1;
      const ok = (edgeShare + originShare * passOrigin) * clamp(passAdmit, 0, 1);
      okSum += ok * legit; reqSum += legit;

      const tiers = { app: uApp, cache: uCache, dbRead: uDbR, dbWrite: uDbW, lb: util(originIn, K.lbCap), queue: cfg.queue.on ? backlog / K.maxBacklog : 0 };
      ticks.push({ t, rps: R, p95: Math.min(p95, 5000), ok: clamp(ok, 0, 1), err: clamp(1 - ok, 0, 1), stale, hit, backlog, delaySec, tiers, dbDown, lbDown, azOut });
    }

    // ---- summary
    const weights = ticks.map((x) => x.rps);
    const sorted = ticks.map((x, i) => ({ p: x.p95, w: weights[i] })).sort((a, b) => a.p - b.p);
    const totalW = sorted.reduce((s, x) => s + x.w, 0);
    let a2 = 0, p95All = sorted.length ? sorted[sorted.length - 1].p : 0;
    for (const x of sorted) { a2 += x.w / totalW; if (a2 >= 0.95) { p95All = x.p; break; } }
    const availability = reqSum > 0 ? okSum / reqSum : 1;
    const staleMax = Math.max(...ticks.map((x) => x.stale));
    const c = K.cost;
    const avgApp = cfg.app.n + appExtraSum / TICKS;
    const cost = (cfg.lb === "single" ? c.lb : cfg.lb === "ha" ? c.lbHa : 0) + avgApp * c.app + (cfg.cache.tier === "none" ? 0 : cfg.cache.nodes * c.cache[cfg.cache.tier]) +
      (cfg.queue.on ? c.queue + cfg.queue.workers * c.worker : 0) + cfg.db.shards * (c.shard + cfg.db.replicas * c.replica + (cfg.db.ha ? c.ha : 0)) +
      (cfg.cdn ? c.cdn : 0) + (cfg.limiter > 0 ? c.limiter : 0);
    const peak = ticks.reduce((m, x) => (x.rps > m.rps ? x : m), ticks[0]);
    const bottleneck = Object.entries(peak.tiers).sort((a, b) => b[1] - a[1])[0];
    const maxBacklog = Math.max(...ticks.map((x) => x.backlog));
    const maxDelayMin = Math.max(...ticks.map((x) => x.delaySec)) / 60;
    return { cfg, ticks, p95: p95All, availability, staleMax, cost: Math.round(cost), peakRps: peak.rps, bottleneck: { tier: bottleneck[0], util: bottleneck[1] }, maxBacklog, maxDelayMin };
  }

  // ---------------------------------------------------------------- grading
  function grade(level, cfg, opts) {
    const k = opts && opts.k;
    const normal = simulate(level, cfg, { chaos: false, k });
    const stress = simulate(level, cfg, { chaos: true, k });
    const slo = level.slo;
    const check = (r) => ({
      latency: r.p95 <= slo.p95, availability: r.availability * 100 >= slo.avail, stale: slo.staleMax == null || r.staleMax * 100 <= slo.staleMax,
      delay: slo.maxDelay == null || r.maxDelayMin <= slo.maxDelay,
    });
    const cn = check(normal), cs = check(stress);
    const passNormal = cn.latency && cn.availability && cn.stale && cn.delay;
    const passChaos = !(level.chaos && level.chaos.length) ? passNormal : cs.latency && cs.availability && cs.stale && cs.delay;
    const underBudget = stress.cost <= slo.budget;
    let stars = 0;
    if (passNormal) stars = 1;
    if (passNormal && passChaos) stars = 2;
    if (passNormal && passChaos && underBudget) stars = 3;
    return { normal, stress, checks: { normal: cn, stress: cs, underBudget }, passNormal, passChaos, underBudget, stars };
  }

  return { TICKS, K: KBASE, mergeK, defaults, normalize, trafficCurve, simulate, grade };
});
