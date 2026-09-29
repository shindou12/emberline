/* Stage difficulty vs player power, measured on the pure logic layer.

   node tools/difficulty.js [runs]          smart-bot runs; every battle logs
                                             board metrics, player stats and outcome
   node tools/difficulty.js [runs] --out=f  also dump the raw rows as JSON

   Board metrics come from Logic.boardMetrics (enemy HP, reachable weak sides,
   crowding, special enemies, blows needed). The report shows how each metric
   tracks the bot's turns / HP lost, and how board demand and player power grow
   row by row: the two curves the difficulty scaling is tuned against. */
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const os = require("os");
const fs = require("fs");

if (!isMainThread) {
  global.window = { EL: {} };
  require("../js/data.js");
  require("../js/logic.js");
  const bal = require("./balance.js");
  const L = window.EL.Logic, D = window.EL.Data;
  bal.setProfile(bal.PROFILES.smart);
  const rows = [];

  function player(run) {
    const S = L.stats(run);
    return { atk: S.atk, mov: S.mov, refund: S.refund, weakMult: S.weakMult, comps: run.companions.length, relics: run.relics.length, hp: run.hp, maxHp: run.maxHp,
      snap: { heroId: run.heroId, bonusAtk: run.bonusAtk, bonusMov: run.bonusMov, companions: JSON.parse(JSON.stringify(run.companions)), relics: run.relics.slice(), maxHp: run.maxHp } };
  }
  function battle(run, node, tag) {
    const B = L.genBattle(run, node);
    const m = L.boardMetrics(B, run), p = player(run);
    let bestStart = B.starts[0], bestS = -Infinity;
    for (const s of B.starts) {
      B.hero = { x: s.x, y: s.y }; B.trail = [{ x: s.x, y: s.y }]; L.planTelegraphs(B);
      const r = bal.bestRoute(B, run);
      const sc = r ? bal.score(L.simulate(B, run, r), B, run) : -Infinity;
      if (sc > bestS) { bestS = sc; bestStart = s; }
    }
    B.hero = { x: bestStart.x, y: bestStart.y }; B.trail = [{ x: bestStart.x, y: bestStart.y }]; L.planTelegraphs(B);
    const hp0 = run.hp;
    let out = { win: false, turns: 20 };
    for (let turn = 1; turn <= 20; turn++) {
      L.unstick(B);
      const route = bal.bestRoute(B, run);
      let res;
      if (route) { res = L.simulate(B, run, route); L.commitRoute(B, run, route, res); }
      else { B.lastT = { moves: 0 }; res = { outcome: "ok" }; }
      if (res.outcome === "victory") { out = { win: true, turns: turn }; break; }
      if (res.outcome === "dead") { out = { win: false, turns: turn }; break; }
      const evs = L.enemyPhase(B, run);
      if (evs.some((e) => e.type === "victory")) { out = { win: true, turns: turn }; break; }
      if (evs.some((e) => e.type === "heroDown")) { out = { win: false, turns: turn }; break; }
    }
    if (out.win) L.claimObjectives(run, B);
    rows.push({ tag, hero: run.heroId, row: node.row, type: node.type, m, p, win: out.win, turns: out.turns, lost: hp0 - Math.max(0, run.hp), lostPct: (hp0 - Math.max(0, run.hp)) / run.maxHp });
    return out.win;
  }
  if (workerData.mode === "matrix") {
    // fixed boards × fixed player snapshots: board difficulty with the player held still
    for (const j of workerData.jobs) {
      const run = L.createRun(j.snap.heroId, j.seed);
      Object.assign(run, { bonusAtk: j.snap.bonusAtk, bonusMov: j.snap.bonusMov, companions: JSON.parse(JSON.stringify(j.snap.companions)), relics: j.snap.relics.slice(), maxHp: j.snap.maxHp, hp: j.snap.maxHp });
      battle(run, { type: j.type, row: j.row, spec: j.spec }, { tier: j.tier, pl: j.pl, board: j.board });
    }
    parentPort.postMessage(rows);
    return;
  }
  for (const [heroId, seed] of workerData.jobs) {
    const run = L.createRun(heroId, seed);
    while (true) {
      const open = L.nextNodes(run);
      if (!open.length) break;
      const nodes = open.map((id) => run.map.nodes[id]);
      const pref = (n) => ({ battle: 3, elite: run.hp > run.maxHp * 0.7 ? 4 : 0, treasure: 5, rest: run.hp < run.maxHp * 0.6 ? 6 : 1, event: 2, boss: 9 })[n.type];
      nodes.sort((a, b) => pref(b) - pref(a));
      const n = nodes[0];
      run.nodeId = n.id; run.visited.push(n.id);
      if (n.type === "battle" || n.type === "elite" || n.type === "boss") {
        if (!battle(run, n) || n.type === "boss") break;
        L.battleHeal(run);
        const rw = L.genRewards(run, n.type === "elite" ? "elite" : "battle");
        const pick = rw.find((r) => r.kind === "comp") || rw[0];
        if (pick) L.applyReward(run, pick);
      } else if (n.type === "treasure") {
        const rw = L.genRewards(run, "treasure"); if (rw[0]) L.applyReward(run, rw[0]);
      } else if (n.type === "rest") {
        if (run.hp < run.maxHp * 0.7) L.heal(run, Math.round(run.maxHp * D.BAL.restHealPct)); else run.bonusAtk++;
      } else if (n.type === "event") L.heal(run, 10);
    }
  }
  parentPort.postMessage(rows);
  return;
}

/* ---------- main: fan out, then report ---------- */
const args = process.argv.slice(2);
const N = +args.find((a) => !a.startsWith("--")) || 12;
const outFile = (args.find((a) => a.startsWith("--out=")) || "").slice(6);
global.window = { EL: {} };
require("../js/data.js");
const heroes = Object.keys(window.EL.Data.HEROES);
const jobs = [];
for (const h of heroes) for (let i = 0; i < N; i++) jobs.push([h, 5000 + i * 7919]);
const pool = (mode, list) => {
  const W = Math.min(os.cpus().length, list.length);
  const parts = [...Array(W)].map((_, k) => list.filter((_, i) => i % W === k));
  return Promise.all(parts.map((p) => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { mode, jobs: p } }); w.on("message", res); w.on("error", rej); }))).then((c) => [].concat(...c));
};
const K = +((args.find((a) => a.startsWith("--boards=")) || "").slice(9)) || 24;
(async () => {
  const rows = await pool("runs", jobs);
  report(rows);
  // controlled pass: players sampled from the runs at three stages, boards from each tier
  require("../js/logic.js");
  const L = window.EL.Logic;
  const stages = { 序盤: (r) => r.row <= 1, 中盤: (r) => r.row >= 2 && r.row <= 4, 終盤: (r) => r.row >= 5 };
  const players = {};
  for (const [name, f] of Object.entries(stages)) {
    const g = rows.filter((r) => r.type === "battle" && f(r));
    // median-power player of the stage (by atk + companions), one per hero
    players[name] = heroes.map((h) => { const gh = g.filter((r) => r.hero === h).sort((a, b) => a.p.atk + a.p.comps - (b.p.atk + b.p.comps)); return gh[Math.floor(gh.length / 2)]; }).filter(Boolean).map((r) => r.p.snap);
    if (!players[name].length) delete players[name];
  }
  const tiers = { t0: { type: "battle", row: 0 }, t1: { type: "battle", row: 2 }, t2: { type: "battle", row: 4 }, t3: { type: "battle", row: 6 }, elite: { type: "elite", row: 4 } };
  const mjobs = [];
  for (const [tier, node] of Object.entries(tiers))
    for (let b = 0; b < K; b++) {
      const r0 = L.createRun("kai", 90000 + b * 131 + tier.length * 7);
      const spec = L.specOf(L.genBattle(r0, node));
      for (const [pl, snaps] of Object.entries(players)) { const snap = snaps[b % snaps.length]; mjobs.push({ tier, pl, board: tier + b, type: node.type, row: node.row, spec, snap, seed: 777 + b }); }
    }
  const mrows = await pool("matrix", mjobs);
  if (outFile) fs.writeFileSync(outFile.replace(/\.json$/, "") + ".matrix.json", JSON.stringify(mrows));
  matrix(mrows, players);
})();

const width = (t) => [...t].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
const padW = (t, n) => t + " ".repeat(Math.max(0, n - width(t)));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const rank = (a) => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : 0; };
const spear = (a, b) => corr(rank(a), rank(b));
const METRICS = {
  "敵数": (r) => r.m.n, "合計HP": (r) => r.m.hp, "平均HP": (r) => r.m.avgHp, "最大HP": (r) => r.m.maxHp,
  "空き辺(平均)": (r) => r.m.open, "弱点塞がり": (r) => r.m.weakShut, "密集ペア": (r) => r.m.cramped,
  "特殊敵": (r) => r.m.special, "夜の圧": (r) => r.m.pressure, "反撃合計": (r) => r.m.counter,
  "必要打数": (r) => r.m.hits, "打数/移動": (r) => r.m.reach,
};
/* least squares y ~ X (with intercept) → coefficients, R² */
function ols(X, y) {
  const n = X.length, k = X[0].length + 1, A = X.map((r) => [1].concat(r));
  const M = [...Array(k)].map((_, i) => [...Array(k)].map((_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)));
  const v = [...Array(k)].map((_, i) => A.reduce((s, r, t) => s + r[i] * y[t], 0));
  for (let i = 0; i < k; i++) M[i][i] += 1e-6;
  for (let i = 0; i < k; i++) { let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; [v[i], v[p]] = [v[p], v[i]];
    for (let r = 0; r < k; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c < k; c++) M[r][c] -= f * M[i][c]; v[r] -= f * v[i]; } }
  const b = v.map((x, i) => x / M[i][i]);
  const pred = A.map((r) => r.reduce((s, x, i) => s + x * b[i], 0)), my = mean(y);
  const r2 = 1 - y.reduce((s, t, i) => s + (t - pred[i]) ** 2, 0) / y.reduce((s, t) => s + (t - my) ** 2, 0);
  return { b, r2 };
}
function matrix(rows, players) {
  console.log("\n\n==== 統制実験: 同じ盤面を、段階ごとの代表プレイヤーで遊ぶ ====");
  for (const [k, sn] of Object.entries(players)) console.log(`  ${k}の代表: ` + sn.map((p) => `${p.heroId} 攻+${p.bonusAtk} 仲間${p.companions.length} 遺物${p.relics.length}`).join(" / "));
  const tiers = [...new Set(rows.map((r) => r.tag.tier))], pls = Object.keys(players);
  console.log("\n■ 盤面の段階 × プレイヤーの段階   ターン数 / 被ダメ% / 勝率");
  console.log("  盤面＼自分  " + pls.map((p) => padW(p, 20)).join(""));
  for (const t of tiers) {
    let line = "  " + padW(t, 11);
    for (const pl of pls) { const g = rows.filter((r) => r.tag.tier === t && r.tag.pl === pl); line += padW(`${f1(mean(g.map((r) => r.turns)))}T ${Math.round(mean(g.map((r) => r.lostPct)) * 100)}% ${Math.round((g.filter((r) => r.win).length / g.length) * 100)}%`, 20); }
    console.log(line);
  }
  console.log("\n■ 盤面指標の効き目（プレイヤー固定での順位相関の平均）  ターン数  被ダメ%");
  for (const [k, f] of Object.entries(METRICS)) {
    const ct = [], cl = [];
    for (const pl of pls) { const g = rows.filter((r) => r.tag.pl === pl && r.type === "battle"); ct.push(spear(g.map(f), g.map((r) => r.turns))); cl.push(spear(g.map(f), g.map((r) => r.lostPct))); }
    console.log("  " + padW(k, 14) + "   " + mean(ct).toFixed(2).padStart(6) + "  " + mean(cl).toFixed(2).padStart(6));
  }
  // a first difficulty formula: turns ≈ a + b·打数/移動 + c·特殊敵 + d·夜の圧 + e·弱点塞がり
  const g = rows.filter((r) => r.type === "battle");
  const feats = [["打数/移動", (r) => r.m.reach], ["特殊敵", (r) => r.m.special], ["夜の圧", (r) => r.m.pressure], ["弱点塞がり", (r) => r.m.weakShut], ["密集ペア", (r) => r.m.cramped]];
  for (const [yn, yf] of [["ターン数", (r) => r.turns], ["被ダメ%", (r) => r.lostPct * 100]]) {
    const { b, r2 } = ols(g.map((r) => feats.map(([, f]) => f(r))), g.map(yf));
    console.log(`\n■ 回帰 ${yn} ≈ ${f1(b[0])} ` + feats.map(([n], i) => `${b[i + 1] >= 0 ? "+" : "-"} ${Math.abs(b[i + 1]).toFixed(2)}×${n}`).join(" ") + `   (R²=${r2.toFixed(2)})`);
  }
}
function report(rows) {
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(rows));
  const B = rows.filter((r) => r.type === "battle");
  console.log(`battles logged: ${rows.length} (normal ${B.length}) from ${N} runs × ${heroes.length} heroes\n`);

  // 1. which board metrics actually predict a harder fight (normal battles, all rows)
  const metrics = METRICS;
  console.log("■ 指標と実戦（通常戦）の順位相関  ＋が「大きいほど難しい」");
  console.log("  指標            ターン数  被ダメ%");
  for (const [k, f] of Object.entries(metrics)) {
    const x = B.map(f);
    console.log("  " + padW(k, 14) + "   " + spear(x, B.map((r) => r.turns)).toFixed(2).padStart(6) + "  " + spear(x, B.map((r) => r.lostPct)).toFixed(2).padStart(6));
  }

  // 2. the two curves by map row
  console.log("\n■ 行ごとの推移（通常戦）");
  console.log("  行  盤:敵数 合計HP 特殊  必要打数 打数/移動 | 自:攻 移 弱点倍 仲間 遺物 | 実戦:ターン 被ダメ%");
  const byRow = {};
  for (const r of B) (byRow[r.row] = byRow[r.row] || []).push(r);
  for (const row of Object.keys(byRow).sort((a, b) => a - b)) {
    const g = byRow[row], a = (f) => mean(g.map(f));
    console.log(`  ${row}   ${f1(a((r) => r.m.n)).padStart(5)} ${f1(a((r) => r.m.hp)).padStart(6)} ${f1(a((r) => r.m.special)).padStart(4)}  ${f1(a((r) => r.m.hits)).padStart(6)}  ${f1(a((r) => r.m.reach)).padStart(7)}  | ${f1(a((r) => r.p.atk)).padStart(4)} ${f1(a((r) => r.p.mov)).padStart(3)} ${f1(a((r) => r.p.weakMult)).padStart(4)} ${f1(a((r) => r.p.comps)).padStart(4)} ${f1(a((r) => r.p.relics)).padStart(4)}  | ${f1(a((r) => r.turns)).padStart(5)} ${Math.round(a((r) => r.lostPct) * 100).toString().padStart(5)}%   (n=${g.length})`);
  }
  for (const t of ["elite", "boss"]) {
    const g = rows.filter((r) => r.type === t);
    if (!g.length) continue;
    const a = (f) => mean(g.map(f));
    console.log(`  ${t.padEnd(5)} 合計HP ${f1(a((r) => r.m.hp))} 必要打数 ${f1(a((r) => r.m.hits))} 攻${f1(a((r) => r.p.atk))} → ターン ${f1(a((r) => r.turns))} 被ダメ ${Math.round(a((r) => r.lostPct) * 100)}% 勝率 ${Math.round((g.filter((r) => r.win).length / g.length) * 100)}%`);
  }
}
