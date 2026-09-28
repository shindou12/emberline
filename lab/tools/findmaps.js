/* Finds boards worth playing on their own (the lab scenario site).

   node tools/findmaps.js [candidates] [workers]   → writes js/scenarios.js

   Each candidate board is played by the three bot profiles from the same start.
   A board is "good" when a practiced player wins it but not for free (it takes
   more than one route and some HP), a careless one pays much more, and the new
   enemy mechanics actually come into play (countdowns delayed or fired, archer
   lines, blasts). The best boards with distinct enemy line-ups are kept. */
const path = require("path");
const NEW = ["archer", "knight", "drummer", "sniper", "bomber", "herald"];

function play(Bal, L, D, cand, profName) {
  const prof = Bal.PROFILES[profName];
  Bal.setProfile(prof);
  const run = L.createRun(cand.hero, cand.seed);
  run.companions = cand.companions.slice(); run.relics = cand.relics.slice();
  run.hp = cand.hp;
  const B = L.genBattle(run, { type: cand.kind, row: cand.row, spec: cand.spec });
  const hp0 = run.hp, m = { delay: 0, arrow: 0, blast: 0, snipe: 0, drum: 0, rally: 0, counter: 0 };
  // the opening: best of the three start spots
  let bestStart = B.starts[0], bestS = -Infinity;
  for (const s of B.starts) {
    B.hero = { x: s.x, y: s.y }; B.trail = [{ x: s.x, y: s.y }]; L.planTelegraphs(B);
    const r = Bal.bestRoute(B, run, prof.beam, prof);
    const sc = r ? Bal.score(L.simulate(B, run, r), B, run, prof) : -Infinity;
    if (sc > bestS) { bestS = sc; bestStart = s; }
  }
  B.hero = { x: bestStart.x, y: bestStart.y }; B.trail = [{ x: bestStart.x, y: bestStart.y }]; L.planTelegraphs(B);
  for (let turn = 1; turn <= 12; turn++) {
    L.unstick(B);
    const route = Bal.bestRoute(B, run, prof.beam, prof);
    let res = { outcome: "ok", events: [] };
    if (route) { res = L.simulate(B, run, route); L.commitRoute(B, run, route, res); } else B.lastT = { moves: 0 };
    for (const e of res.events) { if (e.type === "delay") m.delay++; if (e.type === "guard") m[e.kind === "arrow" ? "arrow" : e.kind === "blast" ? "blast" : "counter"]++; }
    if (res.outcome === "victory") return { win: true, turns: turn, lost: hp0 - run.hp, m };
    if (res.outcome === "dead") return { win: false, turns: turn, lost: hp0, m };
    const evs = L.enemyPhase(B, run);
    for (const e of evs) if (e.type === "cdAct") m[e.act]++;
    if (evs.some((e) => e.type === "victory")) return { win: true, turns: turn, lost: hp0 - run.hp, m };
    if (evs.some((e) => e.type === "heroDown")) return { win: false, turns: turn, lost: hp0, m };
  }
  return { win: false, turns: 12, lost: hp0 - run.hp, m, timeout: true };
}

function candidate(L, D, seed) {
  const rng = L.rngFrom(seed * 7919 + 17);
  const heroes = ["kai", "rue", "gorm"], comps = Object.keys(D.COMPANIONS);
  const hero = heroes[seed % 3];
  const run = L.createRun(hero, seed);
  const nComp = Math.floor(rng() * 3);
  const pool = comps.slice().sort(() => rng() - 0.5);
  const companions = pool.slice(0, nComp);
  const row = 1 + Math.floor(rng() * 5), kind = rng() < 0.2 ? "elite" : "battle";
  run.companions = companions;
  const B = L.genBattle(run, { type: kind, row });
  if (!B.enemies.some((e) => NEW.includes(e.type))) return null;
  const hp = Math.round(D.HEROES[hero].hp * (0.7 + rng() * 0.3));
  return { seed, hero, hp, companions, relics: [], row, kind, spec: L.specOf(B) };
}

function evaluate(cand) {
  const L = window.EL.Logic, D = window.EL.Data;
  const Bal = require("./balance.js");
  const r = {};
  for (const p of ["smart", "greedy", "naive"]) r[p] = play(Bal, L, D, cand, p);
  const s = r.smart, used = Object.entries(s.m).filter(([k, v]) => v > 0 && k !== "counter").map(([k]) => k);
  let score = 0;
  if (!s.win) score -= 100;
  if (s.turns >= 2 && s.turns <= 5) score += 12;
  if (s.turns === 1) score -= 15;
  score += Math.min(12, s.lost) * 0.8; // it should cost something even played well
  score += (r.greedy.win ? r.greedy.lost - s.lost : 25) * 0.8;
  score += (r.naive.win ? r.naive.lost - s.lost : 20) * 0.4;
  score += used.length * 6;
  return Object.assign({}, cand, { score: Math.round(score), used, bots: { smart: { win: s.win, turns: s.turns, lost: s.lost }, greedy: { win: r.greedy.win, turns: r.greedy.turns, lost: r.greedy.lost }, naive: { win: r.naive.win, turns: r.naive.turns, lost: r.naive.lost } } });
}

if (process.argv[2] === "--worker") {
  const [from, to] = process.argv.slice(3).map(Number);
  global.window = { EL: {} };
  require(path.join(__dirname, "../js/data.js"));
  require(path.join(__dirname, "../js/logic.js"));
  const L = window.EL.Logic, D = window.EL.Data;
  const out = [];
  for (let seed = from; seed < to; seed++) {
    const c = candidate(L, D, seed);
    if (c) out.push(evaluate(c));
  }
  process.stdout.write(JSON.stringify(out));
} else {
  const N = +process.argv[2] || 200, W = +process.argv[3] || 4;
  // re-pick from a saved dump without replaying: node tools/findmaps.js --from dump.json
  if (process.argv[2] === "--from") { finish(JSON.parse(require("fs").readFileSync(process.argv[3], "utf8"))); return; }
  const { spawn } = require("child_process");
  const results = [];
  let left = W;
  for (let w = 0; w < W; w++) {
    const from = 1 + Math.floor((N * w) / W), to = 1 + Math.floor((N * (w + 1)) / W);
    const cp = spawn(process.execPath, [__filename, "--worker", String(from), String(to)]);
    let buf = "";
    cp.stdout.on("data", (d) => (buf += d));
    cp.stderr.on("data", (d) => process.stderr.write(d));
    cp.on("close", () => { results.push(...JSON.parse(buf || "[]")); if (--left === 0) finish(results); });
  }
  function finish(all) {
    global.window = { EL: {} };
    require(path.join(__dirname, "../js/data.js"));
    const D = window.EL.Data;
    all.sort((a, b) => b.score - a.score);
    const picked = [], seen = new Set();
    for (const c of all) {
      if (c.score < 0) break;
      const sig = [...new Set(c.spec.enemies.map((e) => e.type).filter((t) => NEW.includes(t)))].sort().join("+");
      if (seen.has(sig)) continue;
      seen.add(sig); picked.push(c);
      if (picked.length >= 10) break;
    }
    picked.forEach((c, i) => {
      const names = [...new Set(c.spec.enemies.map((e) => e.type).filter((t) => NEW.includes(t)))].map((t) => D.ENEMIES[t].name);
      c.id = i + 1; c.name = names.join("・");
    });
    const fs = require("fs");
    if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(all));
    // blind test: five more boards from across the score range (not the ten above), shuffled; the ranks stay out of the page
    const rest = all.filter((c) => !picked.includes(c) && c.bots.smart.win);
    const blind = [0, 0.25, 0.5, 0.75, 1].map((q, k) => Object.assign({}, rest[Math.min(rest.length - 1, Math.round(q * (rest.length - 1)))], { tier: k + 1 }));
    const order = blind.map((b) => [Math.random(), b]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const key = order.map((b, i) => ({ id: "ABCDE"[i], tier: b.tier, score: b.score, seed: b.seed }));
    if (process.env.KEY) fs.writeFileSync(process.env.KEY, JSON.stringify(key, null, 1));
    const strip = (c) => ({ id: c.id, name: c.name, hero: c.hero, hp: c.hp, companions: c.companions, relics: c.relics, row: c.row, kind: c.kind, seed: c.seed, spec: c.spec });
    const blindOut = order.map((b, i) => strip(Object.assign({}, b, { id: "ABCDE"[i], name: "テスト" + "ABCDE"[i] })));
    fs.writeFileSync(path.join(__dirname, "../js/scenarios.js"), "/* EMBERLINE — lab boards picked by tools/findmaps.js (bots: smart/greedy/naive) */\nwindow.EL.Scenarios = " + JSON.stringify(picked.map(strip)) + ";\nwindow.EL.Blind = " + JSON.stringify(blindOut) + ";\n");
    console.log(`${all.length} candidates → ${picked.length} boards`);
    for (const c of picked) console.log(`#${c.id} ${c.name} [${c.hero}] row${c.row + 1} ${c.kind} score${c.score} used:${c.used.join(",")} | smart ${c.bots.smart.win ? "W" : "L"} ${c.bots.smart.turns}T -${c.bots.smart.lost} | greedy ${c.bots.greedy.win ? "W" : "L"} -${c.bots.greedy.lost} | naive ${c.bots.naive.win ? "W" : "L"} -${c.bots.naive.lost}`);
  }
}
