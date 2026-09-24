/* Headless balance bot: plays full runs on the pure logic layer.
   node tools/balance.js [runs] [hero] */
global.window = { EL: {} };
require("../js/data.js");
require("../js/logic.js");
const EL = window.EL, L = EL.Logic, D = EL.Data;

function score(res, B, run) {
  const T = res.T;
  let dmg = 0;
  for (const e of B.enemies) { const p = res.st.enemies.find((x) => x.uid === e.uid); dmg += (e.hp - Math.max(0, p.hp)) * (e.boss ? 3 : 1); }
  const alive = res.st.enemies.filter((e) => e.alive);
  const pressure = L.pressureOf(run, B, alive);
  if (res.outcome === "dead") return -1e6;
  if (res.outcome === "victory") return 1e5 + T.hp * 10;
  if (res.endBlocked) return -1e5;
  // positional sense: stay close to a weak-side entry, keep room to move
  const end = res.end;
  let near = 99;
  for (const e of alive) {
    for (const t of L.weakEntries(B, alive, e)) near = Math.min(near, Math.max(Math.abs(t.x - end.x), Math.abs(t.y - end.y)));
    near = Math.min(near, Math.max(Math.abs(e.x - end.x), Math.abs(e.y - end.y)) + 1);
  }
  const room = L.reachable(B, L.blockedSet(B, res.T.route), end, 3).size;
  return T.kills * 30 + dmg * 3 - (run.hp - T.hp) * 4 - pressure * 6 + T.moves * 0.5 - near * 3 + room * 0.4;
}
function bestRoute(B, run, beam = 70) {
  let frontier = [{ route: [{ x: B.hero.x, y: B.hero.y }], res: null }];
  let best = null, bestS = -Infinity;
  for (let depth = 0; depth < 24 && frontier.length; depth++) {
    const next = [];
    for (const f of frontier) {
      const res = f.res || L.simulate(B, run, f.route);
      if (res.outcome !== "ok") continue;
      const cur = f.route[f.route.length - 1];
      const blocked = L.blockedSet(B, f.route);
      for (const [dx, dy] of L.DIRS8) {
        const nt = { x: cur.x + dx, y: cur.y + dy };
        if (L.stepError(B, blocked, res.T.moves, cur, nt)) continue;
        const route = f.route.concat([nt]);
        const r2 = L.simulate(B, run, route);
        const s = score(r2, B, run);
        if (!r2.endBlocked && s > bestS) { bestS = s; best = route; }
        next.push({ route, res: r2, s });
      }
    }
    next.sort((a, b) => b.s - a.s);
    frontier = next.slice(0, beam);
  }
  return best;
}
function battle(run, node, log) {
  const B = L.genBattle(run, node);
  for (let turn = 1; turn <= 20; turn++) {
    const route = bestRoute(B, run);
    let res;
    if (route) { res = L.simulate(B, run, route); L.commitRoute(B, run, route, res); }
    else { B.lastT = { moves: 0 }; res = { outcome: "ok" }; }
    if (res.outcome === "victory") return { win: true, turns: turn };
    if (res.outcome === "dead") return { win: false, turns: turn };
    const evs = L.enemyPhase(B, run);
    if (evs.some((e) => e.type === "victory")) return { win: true, turns: turn };
    if (evs.some((e) => e.type === "heroDown")) return { win: false, turns: turn };
  }
  return { win: false, turns: 20, timeout: true };
}
function playRun(heroId, seed) {
  const run = L.createRun(heroId, seed);
  const log = { turns: [], hp: [], died: null, types: [] };
  while (true) {
    const open = L.nextNodes(run);
    if (!open.length) break;
    // prefer: rest when low, else battles early, events/treasure otherwise
    const nodes = open.map((id) => run.map.nodes[id]);
    const pref = (n) => ({ battle: 3, elite: run.hp > run.maxHp * 0.7 ? 4 : 0, treasure: 5, rest: run.hp < run.maxHp * 0.6 ? 6 : 1, event: 2, boss: 9 })[n.type];
    nodes.sort((a, b) => pref(b) - pref(a));
    const n = nodes[0];
    run.nodeId = n.id; run.visited.push(n.id);
    log.types.push(n.type);
    if (n.type === "battle" || n.type === "elite" || n.type === "boss") {
      const hp0 = run.hp;
      const r = battle(run, n, log);
      log.turns.push([n.type, r.turns, hp0 - run.hp]);
      log.hp.push(run.hp);
      if (!r.win) { log.died = n.type === "boss" ? "boss" : "row" + n.row; return { win: false, log, run }; }
      if (n.type === "boss") return { win: true, log, run };
      L.heal(run, D.BAL.healAfterBattle);
      const rw = L.genRewards(run, n.type === "elite" ? "elite" : "battle");
      const pick = rw.find((r) => r.kind === "comp") || rw[0];
      if (pick) L.applyReward(run, pick);
    } else if (n.type === "treasure") {
      const rw = L.genRewards(run, "treasure"); if (rw[0]) L.applyReward(run, rw[0]);
    } else if (n.type === "rest") {
      if (run.hp < run.maxHp * 0.7) L.heal(run, Math.round(run.maxHp * D.BAL.restHealPct)); else run.bonusAtk++;
    } else if (n.type === "event") {
      L.heal(run, 10);
    }
  }
  return { win: false, log, run };
}
const N = +process.argv[2] || 20;
const heroes = process.argv[3] ? [process.argv[3]] : Object.keys(D.HEROES);
for (const h of heroes) {
  let wins = 0; const deaths = {}; let turnSum = 0, battles = 0; const perType = {};
  for (let i = 0; i < N; i++) {
    const r = playRun(h, 1000 + i * 7919);
    if (r.win) wins++; else deaths[r.log.died] = (deaths[r.log.died] || 0) + 1;
    for (const [t, n, lost] of r.log.turns) { turnSum += n; battles++; (perType[t] = perType[t] || []).push(n); (perType[t + "Dmg"] = perType[t + "Dmg"] || []).push(lost); }
  }
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  console.log(`${h}: win ${wins}/${N}  avgTurns ${(turnSum / battles).toFixed(2)}  ` + Object.entries(perType).map(([k, v]) => `${k}:${avg(v)}`).join(" ") + "  deaths " + JSON.stringify(deaths));
}
if (process.env.DETAIL) {
  for (let i = 0; i < 6; i++) {
    const r = playRun(process.env.DETAIL, 1000 + i * 7919);
    console.log(r.win ? "WIN " : "LOSE", r.log.died || "", r.log.types.join(">"), "| turns", r.log.turns.map((t) => t[1]).join(","), "| hp", r.log.hp.join(","), "| comps", r.run.companions.join(","), "| relics", r.run.relics.join(","));
  }
}
