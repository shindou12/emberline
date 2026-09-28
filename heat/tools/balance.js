/* Headless balance bots: play full runs on the pure logic layer.

   node tools/balance.js [runs] [hero]            all three bot profiles in parallel + report
   node tools/balance.js [runs] [hero] --bot=smart  one profile only
   DETAIL=kai node tools/balance.js               per-run log for one hero (smart bot)

   Bot profiles (a spread of player skill, not a single "difficulty" number):
     smart   deep search + positional judgement   ~ a practiced player   target 85-95%
     greedy  deep search, only counts kills/damage ~ a comfortable player target 50-65%
     naive   shallow search, kills/damage only     ~ a first-time player  target 10-20%
     hot     (BOTS=smart,hot) like smart, but chases the heat bonus      target 85-95% */
global.window = { EL: {} };
require("../js/data.js");
require("../js/logic.js");
const EL = window.EL, L = EL.Logic, D = EL.Data;
// tuning: HEAT='{"dmgMul":5}' overrides BAL.heat for this run
if (process.env.HEAT) Object.assign(D.BAL.heat, JSON.parse(process.env.HEAT));

const PROFILES = {
  smart: { beam: 70, naive: false, target: [85, 95], label: "上級者（熟練ボット）" },
  greedy: { beam: 50, naive: true, target: [50, 65], label: "中級者（撃破数だけ見る）" },
  naive: { beam: 6, naive: true, target: [10, 20], label: "初心者（浅い探索）" },
  hot: { beam: 70, naive: false, hot: true, target: [85, 95], label: "攻め型（熱を高く保つ）" },
};
let PROF = PROFILES.smart;

function score(res, B, run, prof) {
  prof = prof || PROF;
  const T = res.T;
  let dmg = 0;
  for (const e of B.enemies) { const p = res.st.enemies.find((x) => x.uid === e.uid); dmg += (e.hp - Math.max(0, p.hp)) * (e.boss ? 3 : 1); }
  if (res.outcome === "dead") return -1e6;
  // full gauges carried into the next turn are worth something
  const cb = Object.values(T.charge).reduce((x, y) => x + y, 0) / 15;
  if (res.outcome === "victory") return 1e5 + T.hp * 4 + T.bumps + cb;
  if (res.endBlocked) return -1e5;
  // a less practiced player reads the preview (kills, damage, heat) but does not plan the enemy turn
  if (prof.naive) return cb + T.kills * 30 + dmg * 3 - (run.hp - T.hp) * 0.8;
  const end = L.endHeat(run, B, res);
  if (end.heat >= 100) return -5e5;
  const alive = res.st.enemies.filter((e) => e.alive);
  const pressure = L.pressureOf(run, B, alive);
  const fury = (L.atkMul(100 - end.after) - 1) * 3; // how much the heat will multiply next turn's damage
  // positional sense: stay within reach of an enemy (never idle far away)
  let near = 99;
  for (const e of alive) near = Math.min(near, Math.max(Math.abs(e.x - res.end.x), Math.abs(e.y - res.end.y)));
  if (prof.hot) return cb + T.kills * 30 + dmg * 3 + fury * 25 - Math.max(0, end.heat - 88) * 12 - pressure * 4 - near * 4;
  return cb + T.kills * 30 + dmg * 3 + fury * 10 - end.heat * 1.2 - Math.max(0, end.heat - 75) * 6 - pressure * 4 - near * 4;
}
function bestRoute(B, run, beam, prof) {
  prof = prof || PROF;
  beam = beam || prof.beam;
  let frontier = [{ route: [{ x: B.hero.x, y: B.hero.y }], res: null }];
  let best = null, bestS = -Infinity;
  for (let depth = 0; depth < 24 && frontier.length; depth++) {
    const next = [];
    for (const f of frontier) {
      const res = f.res || L.simulate(B, run, f.route);
      if (res.outcome !== "ok") continue;
      const cur = f.route[f.route.length - 1];
      const blocked = L.blockedSet(B, f.route, res.T.cold);
      for (const [dx, dy] of L.DIRS8) {
        const nt = { x: cur.x + dx, y: cur.y + dy };
        if (L.stepError(B, blocked, res.T.moves, cur, nt)) continue;
        const route = f.route.concat([nt]);
        const r2 = L.simulate(B, run, route);
        const cands = [{ route, res: r2 }];
        // a gauge that is ready may be fired on this tile
        if (r2.outcome === "ok") for (const c of run.companions) if (r2.T.ready.has(c)) {
          const rf = f.route.concat([{ x: nt.x, y: nt.y, fire: c }]);
          cands.push({ route: rf, res: L.simulate(B, run, rf) });
        }
        for (const cd of cands) {
          const s = score(cd.res, B, run, prof);
          if (!cd.res.endBlocked && s > bestS) { bestS = s; best = cd.route; }
          next.push({ route: cd.route, res: cd.res, s });
        }
      }
    }
    next.sort((a, b) => b.s - a.s);
    frontier = next.slice(0, beam);
  }
  return best;
}
const objStats = {};
const G = { heatRow: {}, fury: 0, routes: 0, steps: 0, fires: 0, t1: 0, battles: 0, burn: {} };
function claim(run, B, turn) {
  const got = L.claimObjectives(run, B);
  for (const o of B.objectives) { const k = objStats[o.id] = objStats[o.id] || [0, 0]; k[1]++; if (got.includes(o)) k[0]++; }
  return { win: true, turns: turn };
}
function battle(run, node) {
  const B = L.genBattle(run, node);
  // opening: try each start spot and keep the one with the best first route
  let bestStart = B.starts[0], bestS = -Infinity;
  for (const s of B.starts) {
    B.hero = { x: s.x, y: s.y }; B.trail = [{ x: s.x, y: s.y }]; L.planTelegraphs(B);
    const r = bestRoute(B, run);
    const sc = r ? score(L.simulate(B, run, r), B, run) : -Infinity;
    if (sc > bestS) { bestS = sc; bestStart = s; }
  }
  B.hero = { x: bestStart.x, y: bestStart.y }; B.trail = [{ x: bestStart.x, y: bestStart.y }]; L.planTelegraphs(B);
  for (let turn = 1; turn <= 20; turn++) {
    L.unstick(B);
    const route = bestRoute(B, run);
    let res;
    if (route) {
      res = L.simulate(B, run, route);
      G.routes++; G.steps += res.last; G.fires += res.T.fired.length; if (L.heatOf(run.hp) >= 40) G.fury++;
      L.commitRoute(B, run, route, res);
    } else { B.lastT = { moves: 0 }; res = { outcome: "ok" }; }
    if (res.outcome === "victory") { G.battles++; if (turn === 1) G.t1++; return claim(run, B, turn); }
    if (res.outcome === "dead") { G.burn.route = (G.burn.route || 0) + 1; return { win: false, turns: turn }; }
    const evs = L.enemyPhase(B, run);
    if (evs.some((e) => e.type === "victory")) { G.battles++; return claim(run, B, turn); }
    if (evs.some((e) => e.type === "heroDown")) { G.burn.strike = (G.burn.strike || 0) + 1; return { win: false, turns: turn }; }
  }
  G.burn.timeout = (G.burn.timeout || 0) + 1;
  return { win: false, turns: 20, timeout: true };
}
function playRun(heroId, seed) {
  const run = L.createRun(heroId, seed);
  const log = { turns: [], hp: [], hpByRow: {}, died: null, types: [] };
  while (true) {
    const open = L.nextNodes(run);
    if (!open.length) break;
    // prefer: rest when low, else battles early, events/treasure otherwise
    const nodes = open.map((id) => run.map.nodes[id]);
    const pref = (n) => ({ battle: 3, elite: run.hp > 70 ? 4 : 0, treasure: 5, rest: run.hp < 60 ? 6 : 1, event: 2, boss: 9 })[n.type];
    nodes.sort((a, b) => pref(b) - pref(a));
    const n = nodes[0];
    run.nodeId = n.id; run.visited.push(n.id);
    log.types.push(n.type);
    if (n.type === "battle" || n.type === "elite" || n.type === "boss") {
      const hp0 = run.hp;
      const k = n.type === "boss" ? 7 : n.row, a = (G.heatRow[k] = G.heatRow[k] || [0, 0]); a[0] += L.heatOf(run.hp); a[1]++;
      const r = battle(run, n);
      log.turns.push([n.type, r.turns, hp0 - run.hp]);
      log.hp.push(run.hp);
      if (!r.win) { log.died = n.type === "boss" ? "boss" : n.type === "elite" ? "elite" : n.row <= 2 ? "early" : n.row <= 4 ? "mid" : "late"; return { win: false, log, run }; }
      if (n.type === "boss") return { win: true, log, run };
      L.battleHeal(run);
      const rw = L.genRewards(run, n.type === "elite" ? "elite" : "battle");
      const pick = rw.find((r) => r.kind === "comp") || rw[0];
      if (pick) L.applyReward(run, pick);
    } else if (n.type === "treasure") {
      const rw = L.genRewards(run, "treasure"); if (rw[0]) L.applyReward(run, rw[0]);
    } else if (n.type === "rest") {
      if (L.heatOf(run.hp) > 30) L.coolPct(run, D.BAL.restCool); else run.bonusAtk++;
    } else if (n.type === "event") {
      L.coolPct(run, 0.3);
    }
    if (n.row != null && n.type !== "boss") log.hpByRow[n.row] = run.hp / run.maxHp;
  }
  return { win: false, log, run };
}

/* one profile, all requested heroes → plain stats object */
function measure(N, heroes) {
  const out = { runs: 0, wins: 0, byHero: {}, deaths: {}, perType: {}, hpRow: {} };
  for (const h of heroes) {
    let w = 0;
    for (let i = 0; i < N; i++) {
      const r = playRun(h, 1000 + i * 7919);
      out.runs++;
      if (r.win) { w++; out.wins++; } else out.deaths[r.log.died] = (out.deaths[r.log.died] || 0) + 1;
      for (const [t, n, lost] of r.log.turns) { const p = (out.perType[t] = out.perType[t] || { turns: 0, dmg: 0, n: 0 }); p.turns += n; p.dmg += lost; p.n++; }
      for (const [row, f] of Object.entries(r.log.hpByRow)) { const a = (out.hpRow[row] = out.hpRow[row] || [0, 0]); a[0] += f; a[1]++; }
    }
    out.byHero[h] = w;
  }
  out.objectives = objStats;
  out.G = G;
  return out;
}

const args = process.argv.slice(2);
const flag = (k) => { const a = args.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const pos = args.filter((x) => !x.startsWith("--"));
const N = +pos[0] || 20;
const heroes = pos[1] ? [pos[1]] : Object.keys(D.HEROES);

if (process.env.DETAIL) {
  for (let i = 0; i < 6; i++) {
    const r = playRun(process.env.DETAIL, 1000 + i * 7919);
    console.log(r.win ? "WIN " : "LOSE", r.log.died || "", r.log.types.join(">"), "| turns", r.log.turns.map((t) => t[1]).join(","), "| hp", r.log.hp.join(","), "| comps", r.run.companions.join(","), "| relics", r.run.relics.join(","));
  }
} else if (flag("bot")) {
  PROF = PROFILES[flag("bot")];
  const res = measure(N, heroes);
  if (args.includes("--json")) process.stdout.write(JSON.stringify(res));
  else report({ [flag("bot")]: res }, N, heroes);
} else {
  // all profiles in parallel child processes
  const { spawn } = require("child_process");
  const names = (process.env.BOTS || "smart,greedy,naive").split(",");
  const results = {};
  let left = names.length;
  for (const name of names) {
    const cp = spawn(process.execPath, [__filename, String(N), ...(pos[1] ? [pos[1]] : []), "--bot=" + name, "--json"]);
    let buf = "";
    cp.stdout.on("data", (d) => (buf += d));
    cp.stderr.on("data", (d) => process.stderr.write(d));
    cp.on("close", () => { results[name] = JSON.parse(buf); if (--left === 0) report(results, N, heroes); });
  }
}

function report(results, N, heroes) {
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const DEATH = { early: "序盤", mid: "中盤", late: "終盤", elite: "強敵", boss: "ボス" };
  console.log(`=== balance: ${N} runs x ${heroes.join("/")} ===`);
  for (const [name, r] of Object.entries(results)) {
    const P = PROFILES[name], w = pct(r.wins, r.runs);
    const ok = w >= P.target[0] && w <= P.target[1] ? "OK" : w < P.target[0] ? "難しすぎ" : "易しすぎ";
    console.log(`\n[${name}] ${P.label}  勝率 ${w}% (目標 ${P.target[0]}-${P.target[1]}%) ${ok}`);
    console.log("  主人公別 " + Object.entries(r.byHero).map(([h, n]) => `${h} ${pct(n, N)}%`).join("  "));
    const losses = r.runs - r.wins;
    if (losses) {
      console.log("  負けた場所 " + Object.entries(r.deaths).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${DEATH[k] || k} ${pct(n, losses)}%`).join("  "));
      if ((r.deaths.boss || 0) / losses > 0.7 && losses >= 5) console.log("  ! 負けの7割以上がボス戦: 道中が簡単でボスだけ難しい「難易度の崖」");
    }
    const t = (k) => r.perType[k] ? `${(r.perType[k].turns / r.perType[k].n).toFixed(1)}T / 被ダメ${(r.perType[k].dmg / r.perType[k].n).toFixed(1)}` : "-";
    console.log(`  通常戦 ${t("battle")}   強敵 ${t("elite")}   ボス ${t("boss")}  (被ダメ=上がった熱)`);
    const g = r.G;
    console.log(`  ルート平均${(g.steps / Math.max(1, g.routes)).toFixed(1)}歩  1ターン目で全滅${pct(g.t1, g.battles)}%  スキル発動/戦闘${(g.fires / Math.max(1, g.battles)).toFixed(1)}  熱40+で手番${pct(g.fury, g.routes)}%  燃え尽き ${JSON.stringify(g.burn)}`);
    console.log("  戦闘開始時の熱 " + Object.keys(g.heatRow).sort((a, b) => a - b).map((k) => (+k === 7 ? "ボス" : +k + 1 + "層") + ":" + Math.round(g.heatRow[k][0] / g.heatRow[k][1])).join(" "));
  }
  const smart = results.smart;
  if (smart && smart.objectives) console.log("\n戦闘目標の達成率(熟練) " + Object.entries(smart.objectives).map(([k, [a, b]]) => `${k} ${pct(a, b)}%`).join("  "));
}
