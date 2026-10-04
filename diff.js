/* Canvas diff and fingerprint, shared by the AI change preview and version history.
 * Boxes are matched by id first, then by type + name (AI drafts use fresh ids for the same parts). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LabDiff = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SKIP = new Set(["__aiGenerated", "__aiParent"]);
  const clean = (props) => { const o = {}; Object.keys(props || {}).sort().forEach((k) => { if (!SKIP.has(k)) o[k] = props[k]; }); return o; };
  const nameOf = (n) => (n.props && n.props.name) || n.type;

  /* Stable short fingerprint of what the design is (not where boxes sit on screen). */
  function hash(doc) {
    const canon = JSON.stringify({
      nodes: (doc.nodes || []).map((n) => [n.id, n.type, clean(n.props)]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      edges: (doc.edges || []).map((e) => [e.from, e.to, e.fan || false, e.failover || false, e.protocol || "", e.mode || "", e.classification || "", e.tls === false ? 0 : 1, e.api || "", e.retry || ""]).sort(),
      scenario: doc.scenario || {}, slo: doc.slo || {}, requirements: doc.requirements || {},
    });
    let h = 0x811c9dc5;
    for (let i = 0; i < canon.length; i++) { h ^= canon.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }

  function diff(before, after, label) {
    const name = label || nameOf;
    const A = before.nodes || [], B = after.nodes || [];
    const map = {}, usedB = new Set();
    A.forEach((a) => { const b = B.find((x) => x.id === a.id && x.type === a.type); if (b) { map[a.id] = b.id; usedB.add(b.id); } });
    A.forEach((a) => { if (map[a.id]) return; const b = B.find((x) => !usedB.has(x.id) && x.type === a.type && name(x) === name(a)); if (b) { map[a.id] = b.id; usedB.add(b.id); } });
    const removed = A.filter((a) => !map[a.id]).map((a) => ({ id: a.id, type: a.type, name: name(a) }));
    const added = B.filter((b) => !usedB.has(b.id)).map((b) => ({ id: b.id, type: b.type, name: name(b) }));
    const changed = [];
    A.forEach((a) => {
      const b = B.find((x) => x.id === map[a.id]); if (!b) return;
      const pa = clean(a.props), pb = clean(b.props), keys = [...new Set(Object.keys(pa).concat(Object.keys(pb)))];
      const fields = keys.filter((k) => JSON.stringify(pa[k]) !== JSON.stringify(pb[k])).map((k) => ({ key: k, from: pa[k], to: pb[k] }));
      if (fields.length) changed.push({ id: b.id, type: b.type, name: name(b), fields });
    });
    const keyA = (e) => (map[e.from] || "?" + e.from) + ">" + (map[e.to] || "?" + e.to), keyB = (e) => e.from + ">" + e.to;
    const nameIn = (list, id) => { const n = list.find((x) => x.id === id); return n ? name(n) : id; };
    const EA = {}, EB = {}; (before.edges || []).forEach((e) => { EA[keyA(e)] = e; }); (after.edges || []).forEach((e) => { EB[keyB(e)] = e; });
    const edgeLabel = (e, list) => nameIn(list, e.from) + " → " + nameIn(list, e.to);
    const edgesRemoved = Object.keys(EA).filter((k) => !EB[k]).map((k) => edgeLabel(EA[k], A));
    const edgesAdded = Object.keys(EB).filter((k) => !EA[k]).map((k) => edgeLabel(EB[k], B));
    const scenarioChanged = JSON.stringify(before.scenario || {}) !== JSON.stringify(after.scenario || {}) || JSON.stringify(before.slo || {}) !== JSON.stringify(after.slo || {});
    return { added, removed, changed, edgesAdded, edgesRemoved, scenarioChanged, empty: !added.length && !removed.length && !changed.length && !edgesAdded.length && !edgesRemoved.length && !scenarioChanged };
  }

  return { diff, hash };
});
