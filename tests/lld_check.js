// Low-level design checks: every Java solution compiles and runs, diagrams are consistent. Run: node tests/lld_check.js
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
const only = process.argv[2];
const LLD = require("../lld.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const lldOnly = LLD.ITEMS.filter((x) => !x.kind), pats = LLD.ITEMS.filter((x) => x.kind === "pattern");
ok(lldOnly.length >= 20, `${lldOnly.length} low-level design questions`);
ok(pats.length >= 20 && new Set(pats.map((p) => p.group)).size >= 4, `${pats.length} design patterns in ${new Set(pats.map((p) => p.group)).size} groups`);
ok(new Set(LLD.ITEMS.map((x) => x.id)).size === LLD.ITEMS.length, "ids are unique");
const bad = [];
for (const it of LLD.ITEMS) {
  const cls = LLD.parseClasses(it.classes), names = new Set(cls.map((c) => c.name));
  if (cls.length < 2) bad.push(it.id + ": few classes");
  it.rels.forEach((r) => { if (!names.has(r[0]) || !names.has(r[1])) bad.push(`${it.id}: relation ${r[0]}>${r[1]} names an unknown class`); if (!["extends", "implements", "has", "uses"].includes(r[2])) bad.push(it.id + ": bad relation kind"); });
  if (!(it.func.length >= 3 && it.patterns.length >= 1 && it.follow.length >= 2 && it.look.length >= 3 && it.code.includes("public class Main"))) bad.push(it.id + ": incomplete");
}
ok(!bad.length, "diagrams and content are consistent" + (bad.length ? ": " + bad.slice(0, 4).join("; ") : ""));
let javac = true; try { cp.execSync("javac -version", { stdio: "pipe" }); } catch (e) { javac = false; }
if (!javac) console.log("skip  javac not found: Java solutions were not compiled");
else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lld-")), broken = [];
  for (const it of LLD.ITEMS) {
    if (only && it.id !== only) continue;
    const d = path.join(dir, it.id); fs.mkdirSync(d); fs.writeFileSync(path.join(d, "Main.java"), it.code);
    try { cp.execSync("javac Main.java", { cwd: d, stdio: "pipe", timeout: 60000 }); const out = cp.execSync("java Main", { cwd: d, stdio: "pipe", timeout: 20000 }).toString(); if (!out.trim()) broken.push(it.id + ": prints nothing"); }
    catch (e) { broken.push(it.id + ": " + String((e.stderr || e.message) || "").split("\n").slice(0, 3).join(" | ")); }
  }
  ok(!broken.length, "every Java solution compiles and runs" + (broken.length ? ":\n   " + broken.join("\n   ") : ""));
}
console.log(fail ? `\n${fail} FAILED` : "\nall low-level design checks passed"); process.exit(fail ? 1 : 0);
