/* Low-level design questions: merges the data files and parses the compact class lines. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.LabLLD = factory(root); })(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  const ITEMS = [];
  if (typeof module === "object" && module.exports) { ["./lld_a.js", "./lld_b.js", "./lld_c.js", "./lld_d.js", "./lld_e.js"].forEach((f) => { try { ITEMS.push(...require(f)); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; } }); }
  else ITEMS.push(...(root.LabLLDParts || []));
  const parseClasses = (lines) => lines.map((s) => { const p = s.split("|"); return { name: p[0], kind: p[1] || "class", fields: (p[2] || "").split(";").map((x) => x.trim()).filter(Boolean), methods: (p[3] || "").split(";").map((x) => x.trim()).filter(Boolean) }; });
  return { ITEMS, parseClasses };
});
