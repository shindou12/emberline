/* The shape of a board: how much it lets you do, not how hard it is.

   node tools/shape.js                 lab boards (js/scenarios.js) + per-tier samples

   From one search over first routes (every start spot, beam 40):
     opts    clearly different near-best openings (by what they kill)
     best    kills made by the best-scored opening
     peak    most kills any opening manages
     reach   share of enemies whose weak side can be entered
   These are a floor (a board below it is dull, reroll it), never a dial:
   difficulty is not raised by taking options or chains away. */
global.window = global.window || { EL: {} };
require("../js/data.js");
require("../js/logic.js");
const Bal = require("./balance.js");
const L = window.EL.Logic;

function shape(cand) {
  const prof = Bal.PROFILES.smart;
  Bal.setProfile(prof);
  const run = L.createRun(cand.hero, cand.seed || 1);
  run.companions = (cand.companions || []).slice(); run.relics = (cand.relics || []).slice(); run.hp = cand.hp || run.hp;
  const B = L.genBattle(run, { type: cand.kind || "battle", row: cand.row || 0, spec: cand.spec });
  const m = L.boardMetrics(B, run);
  const found = [];
  for (const s of B.starts) {
    B.hero = { x: s.x, y: s.y }; B.trail = [{ x: s.x, y: s.y }]; L.planTelegraphs(B);
    let frontier = [{ route: [{ x: s.x, y: s.y }], res: null }];
    for (let depth = 0; depth < 14 && frontier.length; depth++) {
      const next = [];
      for (const f of frontier) {
        const res = f.res || L.simulate(B, run, f.route);
        if (res.outcome !== "ok") continue;
        const cur = f.route[f.route.length - 1];
        const blocked = L.blockedSet(B, f.route, res.T.cold);
        for (const [dx, dy] of L.DIRS8) {
          const nt = { x: cur.x + dx, y: cur.y + dy };
          if (L.stepError(B, blocked, res.T.moves, cur, nt)) continue;
          const route = f.route.concat([nt]), r2 = L.simulate(B, run, route);
          const sc = Bal.score(r2, B, run, prof);
          const kills = r2.events.filter((e) => e.type === "kill").length;
          if (!r2.endBlocked) found.push({ sc, kills, sig: r2.events.filter((e) => e.type === "kill").map((e) => e.uid).sort().join(",") + "|" + r2.events.filter((e) => e.type === "attack").length });
          next.push({ route, res: r2, s: sc + kills * 20 }); // keep kill-rich lines alive in the beam too
        }
      }
      next.sort((a, b) => b.s - a.s);
      frontier = next.slice(0, 40);
    }
  }
  if (!found.length) return { opts: 0, best: 0, peak: 0, reach: 0, m };
  const top = found.reduce((a, b) => (b.sc > a.sc ? b : a));
  return {
    opts: new Set(found.filter((f) => f.sc >= top.sc - 20).map((f) => f.sig)).size,
    best: top.kills,
    peak: Math.max(...found.map((f) => f.kills)),
    reach: m.n ? 1 - m.weakShut / m.n : 0,
    m,
  };
}
module.exports = { shape };

if (require.main === module) {
  require("../js/scenarios.js");
  const out = (name, c, s) => console.log(`  ${name.padEnd(28)} 打ち筋${String(s.opts).padStart(3)}  最善で撃破${s.best}/${s.m.n}  最大撃破${s.peak}  弱点可${Math.round(s.reach * 100)}%`);
  console.log("■ ラボの盤面");
  for (const c of window.EL.Scenarios) out(c.id + " " + c.name, c, shape(c));
  console.log("\n■ 幕ごとのサンプル（素の序盤プレイヤー / 各20盤面の平均と、床割れの割合）");
  for (const [tier, node] of Object.entries({ t0: { row: 0 }, t1: { row: 2 }, t2: { row: 4 }, t3: { row: 6 }, elite: { row: 4, kind: "elite" } })) {
    const ss = [];
    for (let b = 0; b < 20; b++) {
      const r0 = L.createRun("kai", 90000 + b * 131 + tier.length * 7);
      const spec = L.specOf(L.genBattle(r0, { type: node.kind || "battle", row: node.row }));
      ss.push(shape({ hero: "kai", seed: 7 + b, kind: node.kind || "battle", row: node.row, spec }));
    }
    const a = (f) => (ss.reduce((s, x) => s + f(x), 0) / ss.length).toFixed(1);
    const dull = ss.filter((s) => s.opts <= 2 || s.best === 0).length;
    console.log(`  ${tier.padEnd(6)} 打ち筋 ${a((s) => s.opts)}  最善で撃破 ${a((s) => s.best)}  最大撃破 ${a((s) => s.peak)}  弱点可 ${a((s) => s.reach * 100)}%   打ち筋≤2 か 初手0撃破: ${dull}/20`);
  }
}
