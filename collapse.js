/* Collapse Lab: try to break a design on purpose.
 * A fault list becomes engine events; the run says whether the design collapsed, how badly, and whether it recovered.
 * hunt() tries every single fault (and the worst pairs) and ranks the weak points.
 */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.LabCollapse = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MIN = 2;                     // one simulated minute is two ticks

  /* Every kind of failure the engine can inject. `target`: none | node | region. */
  const FAULTS = [
    { type: "dbDown", label: "Database primary fails", target: "none", unit: "" },
    { type: "cacheFlush", label: "Cache is flushed", target: "none", unit: "" },
    { type: "lbDown", label: "Load balancer fails", target: "none", unit: "" },
    { type: "azOut", label: "A zone goes dark (half the capacity)", target: "none", unit: "" },
    { type: "slowDb", label: "All databases 4× slower", target: "none", unit: "" },
    { type: "burst", label: "Traffic +60%", target: "none", unit: "" },
    { type: "surge", label: "Traffic surge", target: "none", unit: "× traffic", mag: { min: 1.5, max: 30, def: 4 } },
    { type: "node", label: "One component dies", target: "node", unit: "" },
    { type: "bad", label: "A bad release is deployed to one component", target: "node", unit: "" },
    { type: "slow", label: "One component slows (4×, 40% capacity)", target: "node", unit: "" },
    { type: "region", label: "A whole region goes down", target: "region", unit: "" },
    { type: "partition", label: "Network partition between regions", target: "none", unit: "" },
  ];
  const BY_TYPE = {}; FAULTS.forEach((f) => { BY_TYPE[f.type] = f; });

  function toEvent(f) {
    const tick = Math.max(0, Math.round(f.startMin * MIN)), until = Math.max(tick + 1, Math.round((f.startMin + f.durationMin) * MIN));
    let type = f.type;
    if (f.type === "surge") type = "surge:" + (+f.mag || 4);
    else if (f.type === "node") type = "node:" + f.target; else if (f.type === "slow") type = "slow:" + f.target; else if (f.type === "bad") type = "bad:" + f.target; else if (f.type === "region") type = "region:" + f.target;
    return { tick, until, type };
  }

  /* Run a fault list. `S` is LabSim. */
  function run(S, graph, scenario, faults) {
    const r = S.run(graph, scenario, faults.map(toEvent)); if (r.error) return { error: r.error };
    const h = r.st.history, sc = r.st;
    const ends = faults.length ? Math.max(...faults.map((f) => Math.round((f.startMin + f.durationMin) * MIN))) : 0, starts = faults.length ? Math.min(...faults.map((f) => Math.round(f.startMin * MIN))) : 0;
    const ok = h.map((x) => x.ok);
    const during = h.slice(starts, Math.min(h.length, ends + 1)), avgDuring = during.length ? during.reduce((a, x) => a + x.ok * x.rps, 0) / (during.reduce((a, x) => a + x.rps, 0) || 1) : 1;
    const minAvail = Math.min(...ok.slice(Math.max(1, starts)));
    let run = 0, longest = 0, collapseTick = -1;                       // collapse means below half for at least 2.5 minutes, not one dip while a health check notices
    ok.forEach((v, i) => { if (i >= starts && v < 0.5) { run += 1; if (run > longest) longest = run; if (run === 5 && collapseTick < 0) collapseTick = i - 4; } else run = 0; });
    let recoverTick = -1;
    for (let t = ends; t < h.length - 2; t++) if (ok[t] >= 0.99 && ok[t + 1] >= 0.99 && ok[t + 2] >= 0.99) { recoverTick = t; break; }
    const recovered = faults.length === 0 || recoverTick >= 0;
    const last = h[h.length - 1];
    const worstNodes = Object.entries(h.reduce((m, x) => (x.ok < m.ok ? x : m), h[Math.min(h.length - 1, Math.max(starts, 0))]).nodes || {}).filter(([id, v]) => sc.m.nodes[id].def.cls !== "source" && (v.util > 1 || v.down || v.brkOpen)).map(([id, v]) => ({ id, name: sc.m.nodes[id].p.name || sc.m.nodes[id].def.name, util: v.util, down: !!v.down }));
    const verdict = longest >= 5 ? "Collapsed" : minAvail < 0.99 ? "Degraded" : "Survived";
    const score = Math.round(Math.max(0, Math.min(100, 100 * avgDuring - (recovered ? 0 : 30) - (longest >= 5 ? 10 : 0))));
    return { verdict, score, minAvail, avgDuring, collapseMin: collapseTick >= 0 ? collapseTick / MIN : null, recovered, recoveryMin: recoverTick >= 0 ? Math.max(0, (recoverTick - ends) / MIN) : null, endAvail: last.ok,
      maxDelayMin: Math.max(0, ...h.map((x) => x.delayMin)), staleMax: Math.max(0, ...h.map((x) => x.stale)), dataLost: Math.max(0, ...h.map((x) => Math.max(0, ...Object.values(x.nodes).map((n) => n.rpo || 0)))), cost: r.summary.cost, worstNodes,
      series: h.map((x) => ({ ok: x.ok, p95: x.p95, rps: x.rps })), events: faults.map(toEvent) };
  }

  /* Every single fault this design can suffer, then the worst pairs. */
  function hunt(S, graph, scenario, opts) {
    opts = opts || {};
    const startMin = opts.startMin || 15, durationMin = opts.durationMin || 8;
    const nodes = graph.nodes.filter((n) => S.BY_ID[n.type] && S.BY_ID[n.type].cls !== "source" && S.BY_ID[n.type].cls !== "passive");
    const regions = [...new Set(graph.nodes.map((n) => n.props && n.props.region).filter(Boolean))];
    const nameOf = (id) => { const n = graph.nodes.find((x) => x.id === id); return (n.props && n.props.name) || S.BY_ID[n.type].name; };
    const has = (cls) => graph.nodes.some((n) => S.BY_ID[n.type] && S.BY_ID[n.type].cls === cls);
    const singles = [];
    const add = (f, label) => singles.push({ faults: [Object.assign({ startMin, durationMin }, f)], label });
    if (has("db")) { add({ type: "dbDown" }, "Database primary fails"); add({ type: "slowDb" }, "All databases 4× slower"); }
    if (has("cache")) add({ type: "cacheFlush" }, "Cache is flushed");
    if (has("router")) add({ type: "lbDown" }, "Load balancer fails");
    add({ type: "azOut" }, "A zone goes dark"); add({ type: "burst" }, "Traffic +60%");
    [2, 4, 8].forEach((x) => add({ type: "surge", mag: x }, `Traffic surge ×${x}`));
    nodes.forEach((n) => { add({ type: "node", target: n.id }, `${nameOf(n.id)} dies`); add({ type: "slow", target: n.id }, `${nameOf(n.id)} slows down`); if (["service", "proxy"].includes(S.BY_ID[n.type].cls)) add({ type: "bad", target: n.id }, `A bad release hits ${nameOf(n.id)}`); });
    regions.forEach((rg) => add({ type: "region", target: rg }, `Region ${rg.toUpperCase()} goes down`));
    if (regions.length >= 2) add({ type: "partition" }, "Network partition between regions");
    const results = singles.map((s) => { const r = run(S, graph, scenario, s.faults); return Object.assign({ label: s.label, faults: s.faults }, r); }).filter((r) => !r.error);
    const damage = (r) => (1 - r.avgDuring) + (r.recovered ? 0 : 0.5) + (r.verdict === "Collapsed" ? 0.2 : 0);
    results.sort((a, b) => damage(b) - damage(a));
    // the worst pairs: combine the three most damaging different faults
    const worst = results.filter((r) => r.verdict !== "Survived").slice(0, 3), pairs = [];
    for (let i = 0; i < worst.length; i++) for (let j = i + 1; j < worst.length; j++) {
      const f = [worst[i].faults[0], Object.assign({}, worst[j].faults[0], { startMin: startMin + 2 })], r = run(S, graph, scenario, f);
      if (!r.error) pairs.push(Object.assign({ label: `${worst[i].label} + ${worst[j].label}`, faults: f }, r));
    }
    pairs.sort((a, b) => damage(b) - damage(a));
    const survived = (r) => r.verdict === "Survived" && r.recovered;
    const singleRate = results.length ? results.filter(survived).length / results.length : 1;
    const pairRate = pairs.length ? pairs.filter((r) => r.avgDuring >= 0.9 && r.recovered).length / pairs.length : singleRate;
    const resistance = Math.round(100 * (0.75 * singleRate + 0.25 * pairRate));
    return { resistance, results, pairs, tested: results.length + pairs.length, survivedCount: results.filter(survived).length };
  }

  return { FAULTS, BY_TYPE, toEvent, run, hunt, MIN };
});
