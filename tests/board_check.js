// Leaderboard checks. Run: node tests/board_check.js
const B = require("../board.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const me = B.empty("Yaswanth");
B.add(me, { kind: "mission", key: "payments", score: 50, stars: 1, cost: 660 });
B.add(me, { kind: "mission", key: "payments", score: 100, stars: 3, cost: 1650 });
B.add(me, { kind: "mission", key: "payments", score: 100, stars: 3, cost: 1400 });
B.add(me, { kind: "collapse", key: "URL shortener", score: 62, cost: 0 });
ok(B.ranking(me, "mission", "payments").length === 1 && B.ranking(me, "mission", "payments")[0].cost === 1400, "a player's best entry wins: highest score, then cheapest");
ok(B.history(me, "mission", "payments").length === 3, "the full history is kept");
ok(B.keys(me, "mission").join() === "payments" && B.keys(me, "collapse").join() === "URL shortener", "boards are listed per kind");
const friend = B.empty("Asha"); B.add(friend, { kind: "mission", key: "payments", score: 90, stars: 2, cost: 900 }); B.add(friend, { kind: "mission", key: "rag", score: 75, stars: 2, cost: 9000 });
const code = B.encode(friend);
ok(code.startsWith("ALB1:") && B.decode(code).entries.length === 2, "a share code round-trips");
const merged = B.merge(me, B.decode(code)); const r = B.ranking(merged.board, "mission", "payments");
ok(merged.added === 2 && r.length === 2 && r[0].player === "Yaswanth" && r[1].player === "Asha", "imported scores appear on the board, ranked against yours");
ok(B.merge(merged.board, B.decode(code)).added === 0, "importing the same code twice adds nothing");
for (const bad of ["hello", "ALB1:@@@", "ALB1:" + Buffer.from("{}").toString("base64")]) { let threw = false; try { B.decode(bad); } catch (e) { threw = true; } ok(threw, `a bad share code is rejected (${bad.slice(0, 12)})`); }
const hostile = B.clean({ kind: "mission", key: "<script>alert(1)</script>", player: "x".repeat(100), score: 9999, stars: -4, cost: "abc", note: "n\u0000n" });
ok(hostile && !/[<>]/.test(hostile.key) && hostile.player.length === 30 && hostile.score === 100 && hostile.stars === 0 && hostile.cost === 0, "hostile entries are cleaned and clamped");
ok(B.clean({ kind: "other", key: "x" }) === null && B.clean(null) === null, "unknown kinds are dropped");
const big = B.empty("p"); for (let i = 0; i < 700; i++) B.add(big, { kind: "mission", key: "k" + (i % 5), score: i % 100, cost: i }); ok(big.entries.length === B.MAX, `the board keeps at most ${B.MAX} entries`);
console.log(fail ? `\n${fail} FAILED` : "\nall board checks passed"); process.exit(fail ? 1 : 0);
