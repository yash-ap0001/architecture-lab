/* Architecture Lab leaderboard: personal history plus scores imported from other people's share codes.
 * Everything is local data; a share code is just text you can paste to someone.
 */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.LabBoard = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MAX = 500, PREFIX = "ALB1:";
  const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
  const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function clean(e) {
    if (!e || typeof e !== "object") return null;
    const kind = e.kind === "collapse" ? "collapse" : e.kind === "mission" ? "mission" : null; if (!kind) return null;
    const key = clip(e.key, 60); if (!key) return null;
    return { id: clip(e.id, 24) || uid(), kind, key, player: clip(e.player, 30) || "Player", score: Math.round(num(e.score, 0, 100)), stars: Math.round(num(e.stars, 0, 3)), cost: Math.round(num(e.cost, 0, 1e9)), at: clip(e.at, 30), note: clip(e.note, 120) };
  }
  const empty = (player) => ({ player: clip(player, 30) || "You", entries: [] });

  function normalize(b) { const out = empty(b && b.player); for (const e of (b && b.entries) || []) { const c = clean(e); if (c && !out.entries.some((x) => x.id === c.id)) out.entries.push(c); } trim(out); return out; }
  function trim(b) { if (b.entries.length > MAX) { b.entries.sort((a, c) => c.score - a.score || (a.at < c.at ? 1 : -1)); b.entries.length = MAX; } }

  function add(b, entry) { const c = clean(Object.assign({ player: b.player, at: new Date().toISOString() }, entry)); if (!c) return null; b.entries.push(c); trim(b); return c; }

  /* Best entry per player for one board (kind + key). Higher score first, then cheaper. */
  function ranking(b, kind, key) {
    const best = {};
    for (const e of b.entries) if (e.kind === kind && e.key === key) { const cur = best[e.player]; if (!cur || e.score > cur.score || (e.score === cur.score && e.cost < cur.cost)) best[e.player] = e; }
    return Object.values(best).sort((x, y) => y.score - x.score || x.cost - y.cost || (x.at < y.at ? -1 : 1));
  }
  const keys = (b, kind) => [...new Set(b.entries.filter((e) => e.kind === kind).map((e) => e.key))].sort();
  const history = (b, kind, key, player) => b.entries.filter((e) => e.kind === kind && e.key === key && (!player || e.player === player)).sort((x, y) => (x.at < y.at ? 1 : -1));

  function merge(a, other) {
    const out = normalize(a), seen = new Set(out.entries.map((e) => e.id)); let added = 0;
    for (const e of (other && other.entries) || []) { const c = clean(e); if (c && !seen.has(c.id)) { seen.add(c.id); out.entries.push(c); added += 1; } }
    trim(out); return { board: out, added };
  }

  /* A short text you can send someone: your best score for every board. */
  function encode(b) {
    const mine = []; for (const kind of ["mission", "collapse"]) for (const key of keys(b, kind)) { const r = ranking(b, kind, key).find((x) => x.player === b.player); if (r) mine.push(r); }
    const json = JSON.stringify({ v: 1, player: b.player, entries: mine.slice(0, 80) });
    const bytes = typeof Buffer !== "undefined" ? Buffer.from(json, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(json)));
    return PREFIX + bytes;
  }
  function decode(code) {
    const s = String(code || "").trim(); if (!s.startsWith(PREFIX)) throw new Error("That is not an Architecture Lab share code.");
    let data; try { const raw = s.slice(PREFIX.length); const json = typeof Buffer !== "undefined" ? Buffer.from(raw, "base64").toString("utf8") : decodeURIComponent(escape(atob(raw))); data = JSON.parse(json); } catch (e) { throw new Error("That share code is damaged."); }
    if (!data || !Array.isArray(data.entries)) throw new Error("That share code has no scores.");
    return normalize({ player: data.player, entries: data.entries });
  }

  return { clean, empty, normalize, add, ranking, keys, history, merge, encode, decode, MAX };
});
