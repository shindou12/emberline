/* EMBERLINE — game logic (no rendering, no audio, no timing).
   simulate() is deterministic: the same function drives the drag preview and
   the real execution, so what the player sees while drawing is what happens. */
(function (EL) {
  "use strict";
  const D = EL.Data, BAL = D.BAL;
  const CARD = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
  const CW = ["U", "R", "D", "L"];
  const DIRS8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

  /* ---------- rng ---------- */
  function rngFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ri = (rng, a, b) => Math.floor(a + rng() * (b - a + 1));
  const rpick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const has = (run, id) => run.relics.includes(id);

  /* ---------- run ---------- */
  function createRun(heroId, seed) {
    const h = D.HEROES[heroId];
    seed = seed || (Date.now() ^ Math.floor(Math.random() * 1e9));
    const rng = rngFrom(seed);
    return {
      heroId, seed, rng,
      hp: h.hp, maxHp: h.hp, bonusAtk: 0, bonusMov: 0,
      companions: [], relics: [],
      map: genMap(rng), nodeId: null, visited: [],
      flags: {}, plumeUsed: false,
      stats: { kills: 0, maxChain: 0, turns: 0, battles: 0, bestRoute: 0 },
    };
  }

  function stats(run, hpNow) {
    const h = D.HEROES[run.heroId];
    const hp = hpNow != null ? hpNow : run.hp;
    let atk = h.atk + run.bonusAtk;
    if (has(run, "pact")) atk += 2;
    if (has(run, "lantern")) atk += 1;
    if (has(run, "banner")) atk += run.companions.length;
    if (has(run, "heart") && hp <= run.maxHp / 2) atk += 2;
    const mov = h.mov + run.bonusMov + (has(run, "boots") ? 1 : 0);
    const refund = h.refund + (has(run, "fang") ? 1 : 0);
    let weakMult = run.heroId === "kai" ? 2.5 : 2;
    if (has(run, "dirk")) weakMult += 1;
    const trail = Math.max(2, BAL.trailBase + BAL.trailPer * run.companions.length - (has(run, "hourglass") ? 3 : 0) + (has(run, "lantern") ? 4 : 0));
    return { atk, mov, refund, weakMult, trail };
  }

  /* ---------- map ---------- */
  function genMap(rng) {
    const ROWS = BAL.maxRows, COLS = 4;
    const cells = [...Array(ROWS)].map(() => Array(COLS).fill(false));
    const edges = [];
    const crosses = (r, a, b) => edges.some((e) => e.r === r && ((a < e.a && b > e.b) || (a > e.a && b < e.b)));
    const starts = shuffle(rng, [0, 1, 2, 3]).slice(0, 3);
    for (const s of starts) {
      let c = s;
      cells[0][c] = true;
      for (let r = 0; r < ROWS - 1; r++) {
        const opts = shuffle(rng, [c - 1, c, c + 1].filter((d) => d >= 0 && d < COLS));
        let d = opts.find((o) => !crosses(r, c, o));
        if (d == null) d = c;
        if (!edges.some((e) => e.r === r && e.a === c && e.b === d)) edges.push({ r, a: c, b: d });
        c = d;
        cells[r + 1][c] = true;
      }
    }
    const nodes = {};
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      rows.push([]);
      for (let c = 0; c < COLS; c++) if (cells[r][c]) {
        const id = `n${r}_${c}`;
        nodes[id] = { id, row: r, col: c, type: "battle", next: [], x: 60 + c * 80 + ri(rng, -8, 8), y: 574 - r * 58 };
        rows[r].push(id);
      }
    }
    for (const e of edges) nodes[`n${e.r}_${e.a}`].next.push(`n${e.r + 1}_${e.b}`);
    nodes.boss = { id: "boss", row: ROWS, col: 1.5, type: "boss", next: [], x: 180, y: 574 - ROWS * 58 - 10 };
    for (const id of rows[ROWS - 1]) nodes[id].next = ["boss"];
    // node types
    const weighted = (tbl) => {
      const tot = tbl.reduce((s, [, w]) => s + w, 0);
      let x = rng() * tot;
      for (const [k, w] of tbl) { x -= w; if (x <= 0) return k; }
      return tbl[0][0];
    };
    for (let r = 0; r < ROWS; r++) {
      for (const id of rows[r]) {
        let t;
        if (r === 0) t = "battle";
        else if (r === ROWS - 1) t = "rest";
        else if (r <= 2) t = weighted([["battle", 60], ["event", 30], ["treasure", 10]]);
        else t = weighted([["battle", 42], ["elite", 26], ["event", 20], ["rest", 12]]);
        nodes[id].type = t;
      }
    }
    // guarantee one treasure on row 3 and an elite on rows 4-5
    const r3 = rows[3];
    if (r3 && !r3.some((id) => nodes[id].type === "treasure")) nodes[rpick(rng, r3)].type = "treasure";
    const late = rows[4].concat(rows[5]);
    if (!late.some((id) => nodes[id].type === "elite")) nodes[rpick(rng, late)].type = "elite";
    return { nodes, rows, boss: "boss" };
  }
  function nextNodes(run) {
    if (!run.nodeId) return run.map.rows[0].slice();
    return run.map.nodes[run.nodeId].next.slice();
  }

  /* ---------- battle generation ---------- */
  const ENC = {
    t0: [["husk", "husk", "wisp", "husk"]],
    t1: [["husk", "husk", "wisp", "husk", "shield"], ["husk", "wisp", "wisp", "caller", "husk"], ["husk", "shield", "wisp", "husk", "husk"]],
    t2: [["husk", "shield", "wisp", "caller", "husk", "husk"], ["shield", "shield", "wisp", "totem", "husk"], ["husk", "husk", "wisp", "wisp", "caller", "shield"], ["totem", "husk", "shield", "wisp", "husk", "husk"]],
    t3: [["shield", "caller", "wisp", "husk", "husk", "wisp"], ["totem", "shield", "shield", "wisp", "husk", "husk"], ["husk", "husk", "husk", "wisp", "wisp", "shield", "caller"]],
    elite: [["brute", "husk", "wisp", "husk", "shield"], ["brute", "shield", "totem", "wisp", "husk"], ["brute", "brute", "caller", "wisp"]],
  };
  const inB = (B, x, y) => x >= 0 && y >= 0 && x < B.w && y < B.h;
  const idx = (B, x, y) => y * B.w + x;
  const isRock = (B, x, y) => !inB(B, x, y) || B.tiles[idx(B, x, y)] === 1;
  const covers = (e, x, y) => x >= e.x && y >= e.y && x < e.x + e.size && y < e.y + e.size;
  const enemyAt = (enemies, x, y) => enemies.find((e) => e.alive && covers(e, x, y)) || null;

  function makeEnemy(B, type, x, y, rng) {
    const d = D.ENEMIES[type];
    const e = { uid: ++B.uidSeq, type, x, y, size: d.size || 1, hp: d.hp, maxHp: d.hp, atk: d.atk, pressure: d.pressure, weak: "D", alive: true, boss: !!d.boss, tangled: false, tele: null };
    e.weak = pickWeak(B, e, rng);
    return e;
  }
  function validWeaks(B, e) {
    return CW.filter((w) => {
      const [dx, dy] = CARD[w];
      for (let k = 0; k < e.size; k++) {
        const tx = dx === 0 ? e.x + k : dx > 0 ? e.x + e.size : e.x - 1;
        const ty = dy === 0 ? e.y + k : dy > 0 ? e.y + e.size : e.y - 1;
        if (!isRock(B, tx, ty)) return true;
      }
      return false;
    });
  }
  function pickWeak(B, e, rng) {
    const v = validWeaks(B, e);
    return v.length ? rpick(rng, v) : "D";
  }
  function connected(B, sx, sy) {
    const seen = new Set([idx(B, sx, sy)]);
    const q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of DIRS8.filter((d) => d[0] === 0 || d[1] === 0)) {
        const nx = x + dx, ny = y + dy;
        if (isRock(B, nx, ny) || seen.has(idx(B, nx, ny))) continue;
        seen.add(idx(B, nx, ny)); q.push([nx, ny]);
      }
    }
    let floor = 0;
    for (let i = 0; i < B.tiles.length; i++) if (B.tiles[i] === 0) floor++;
    return seen.size === floor;
  }

  function genBattle(run, node) {
    const rng = run.rng;
    const B = { w: BAL.GW, h: BAL.GH, tiles: new Array(BAL.GW * BAL.GH).fill(0), enemies: [], hero: { x: 3, y: 7 }, trail: [], turn: 1, kind: node.type, isBoss: node.type === "boss", phase2: false, uidSeq: 0, row: node.row, bst: { chain: 0, weak: 0, bumps: 0, multi: 0, guardHits: 0, friendly: 0 }, objectives: [] };
    B.trail = [{ x: 3, y: 7 }];
    if (B.isBoss) {
      for (const [x, y] of [[0, 4], [6, 4], [1, 0], [5, 0]]) B.tiles[idx(B, x, y)] = 1;
      const boss = makeEnemy(B, "boss", 2, 1, rng);
      boss.weak = "D";
      B.enemies.push(boss);
      B.enemies.push(makeEnemy(B, "husk", 0, 2, rng));
      B.enemies.push(makeEnemy(B, "husk", 6, 2, rng));
      B.enemies.push(makeEnemy(B, "wisp", 3, 4, rng));
      B.objectives = genObjectives(run, B);
      planTelegraphs(B);
      return B;
    }
    // rocks
    const nRocks = ri(rng, 2, 4);
    for (let tries = 0, placed = 0; placed < nRocks && tries < 200; tries++) {
      const x = ri(rng, 0, B.w - 1), y = ri(rng, 0, 6);
      if (Math.abs(x - 3) <= 1 && y >= 6) continue;
      if (B.tiles[idx(B, x, y)]) continue;
      B.tiles[idx(B, x, y)] = 1;
      if (!connected(B, 3, 7)) { B.tiles[idx(B, x, y)] = 0; continue; }
      placed++;
    }
    // enemies
    let list;
    const row = node.row;
    if (node.type === "elite") { list = rpick(rng, ENC.elite).slice(); if (row >= 5) list.push("husk"); }
    else if (row === 0) list = rpick(rng, ENC.t0).slice();
    else if (row <= 2) list = rpick(rng, ENC.t1).slice();
    else if (row <= 4) list = rpick(rng, ENC.t2).slice();
    else list = rpick(rng, ENC.t3).slice();
    if (run.flags.cursed) { list.push("brute"); run.flags.cursed = false; }
    const free = [];
    for (let y = 0; y <= 5; y++) for (let x = 0; x < B.w; x++) if (!B.tiles[idx(B, x, y)]) free.push([x, y]);
    const order = shuffle(rng, free);
    const spaced = (x, y) => !B.enemies.some((e) => Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1);
    for (const type of list) {
      let spot = order.find(([x, y]) => !enemyAt(B.enemies, x, y) && spaced(x, y));
      if (!spot) spot = order.find(([x, y]) => !enemyAt(B.enemies, x, y));
      if (!spot) break;
      B.enemies.push(makeEnemy(B, type, spot[0], spot[1], rng));
    }
    B.objectives = genObjectives(run, B);
    planTelegraphs(B);
    return B;
  }

  /* ---------- geometry & rules ---------- */
  const enemiesAt = (enemies, x, y) => enemies.filter((e) => e.alive && covers(e, x, y));
  /* tiles you cannot step on: the old trail plus this route's burning tiles.
     `cold` = route tiles that did not catch fire (an enemy stood there). */
  function blockedSet(B, route, cold) {
    const s = new Set();
    for (const t of B.trail) s.add(idx(B, t.x, t.y));
    if (route) for (const t of route) { const k = idx(B, t.x, t.y); if (!cold || !cold.has(k)) s.add(k); }
    return s;
  }
  /* why a step is illegal ('' = legal). The View never decides this. */
  function stepError(B, blocked, moves, a, b) {
    if (!inB(B, b.x, b.y)) return "out";
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return "far";
    if (isRock(B, b.x, b.y)) return "rock";
    if (blocked.has(idx(B, b.x, b.y))) return "ember";
    if (moves < 1) return "moves";
    return "";
  }
  function isWeakEntry(e, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    if (covers(e, a.x, a.y)) return false;
    const side = CW.find((w) => CARD[w][0] === -dx && CARD[w][1] === -dy);
    return e.weak === side;
  }
  /* a ward pillar seals every enemy within sealRange (Chebyshev) of it: no weak side */
  const sealedBy = (enemies, e) => !e.boss && e.type !== "totem" &&
    enemies.some((t) => t.alive && t.type === "totem" && Math.max(Math.abs(t.x - e.x), Math.abs(t.y - e.y)) <= BAL.sealRange);
  const dirEq = (a, b) => a[0] === b[0] && a[1] === b[1];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x + 0.5, yi = poly[i].y + 0.5, xj = poly[j].x + 0.5, yj = poly[j].y + 0.5;
      if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* ---------- telegraphs (Into the Breach style) ----------
     Enemies announce the tiles they will strike at the start of the next enemy
     phase. The pattern is stored relative to the enemy, so shoving an enemy
     drags its attack along (and can aim it at other enemies). */
  function planTele(B, e) {
    const d = D.ENEMIES[e.type];
    e.tele = null;
    if (!d.tele || !e.alive) return;
    const h = B.hero;
    const cx = e.x + (e.size - 1) / 2, cy = e.y + (e.size - 1) / 2;
    let sx = sgn(h.x - cx), sy = sgn(h.y - cy);
    if (!sx && !sy) sy = 1;
    const tiles = [];
    switch (d.tele) {
      case "adjacent": tiles.push([sx, sy]); break;
      case "line": {
        const alongX = Math.abs(h.x - cx) >= Math.abs(h.y - cy);
        const dx = alongX ? sx || 1 : 0, dy = alongX ? 0 : sy || 1;
        for (let k = 1; k <= 3; k++) {
          if (isRock(B, e.x + dx * k, e.y + dy * k)) break;
          tiles.push([dx * k, dy * k]);
        }
        break;
      }
      case "cross": for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) tiles.push([sx + ox, sy + oy]); break;
      case "boss":
        if (B.turn % 2 === 1) for (let x = 0; x < B.w; x++) { tiles.push([x - e.x, 2]); tiles.push([x - e.x, 3]); }
        else for (let y = 0; y < B.h; y++) { tiles.push([-1, y - e.y]); tiles.push([2, y - e.y]); }
        break;
    }
    e.tele = {
      tiles: tiles.filter(([dx, dy]) => !(dx >= 0 && dy >= 0 && dx < e.size && dy < e.size)),
      dmg: d.teleDmg + (e.boss && B.phase2 ? 2 : 0),
    };
  }
  function planTelegraphs(B) { for (const e of B.enemies) if (e.alive) planTele(B, e); }
  function teleTiles(B, e) {
    if (!e.tele || !e.alive || e.tangled) return [];
    return e.tele.tiles.map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy })).filter((t) => inB(B, t.x, t.y) && !isRock(B, t.x, t.y));
  }
  function teleDmgAt(B, enemies, x, y) {
    let n = 0;
    for (const e of enemies) if (teleTiles(B, e).some((t) => t.x === x && t.y === y)) n += e.tele.dmg;
    return n;
  }

  /* companion condition thresholds (the charm relic relaxes each by one notch) */
  function condReq(run, comp) {
    const c = D.COMPANIONS[comp].cond;
    const r = has(run, "charm") ? 1 : 0;
    switch (c.type) {
      case "straight": return { n: Math.max(2, c.n - r) };
      case "corner": return { a: Math.max(1, c.a - r), b: c.b };
      case "zigzag": return { n: Math.max(2, c.n - r) };
      case "loop": return { n: Math.max(3, c.n - r) };
      default: return { n: Math.max(1, c.n - r) };
    }
  }
  const markOf = (T, comp) => T.marks[comp] || { dirs: 0, weak: 0, route: 0, tangle: 0, kills: 0 };

  /* progress for the HUD */
  function condProgress(run, comp, T) {
    const c = D.COMPANIONS[comp].cond, q = condReq(run, comp);
    const mk = markOf(T, comp);
    const dirs = T.dirs.slice(mk.dirs);
    let cur = 0, need = 1;
    switch (c.type) {
      case "straight": {
        need = q.n;
        for (let k = dirs.length - 1; k >= 0 && dirEq(dirs[k], dirs[dirs.length - 1]); k--) cur++;
        break;
      }
      case "corner": {
        need = q.a + q.b;
        if (!dirs.length) break;
        const last = dirs[dirs.length - 1];
        let run2 = 0;
        for (let k = dirs.length - 1; k >= 0 && dirEq(dirs[k], last); k--) run2++;
        const before = dirs.length - 1 - run2 >= 0 ? dirs[dirs.length - 1 - run2] : null;
        let run1 = 0;
        if (before && dot(before, last) === 0) for (let k = dirs.length - 1 - run2; k >= 0 && dirEq(dirs[k], before); k--) run1++;
        cur = before && dot(before, last) === 0 ? Math.min(q.a, run1) + Math.min(q.b, run2) : Math.min(q.a, run2);
        break;
      }
      case "zigzag": {
        need = q.n;
        if (!dirs.length) break;
        cur = 1;
        for (let k = dirs.length - 2; k >= 0; k--) {
          const A = dirs[dirs.length - 1], Bd = dirs[dirs.length - 2];
          if (dirEq(A, Bd)) break;
          const expect = (dirs.length - 1 - k) % 2 === 0 ? A : Bd;
          if (!dirEq(dirs[k], expect)) break;
          cur++;
        }
        break;
      }
      case "tangle": need = q.n; cur = T.tangles - mk.tangle; break;
      case "kills": need = q.n; cur = T.kills - mk.kills; break;
      case "weak": need = q.n; cur = T.weakHits - mk.weak; break;
      case "loop": need = q.n; cur = Math.min(q.n - 1, T.route.length - 1 - mk.route); break;
    }
    return { cur: Math.max(0, Math.min(need, cur)), need };
  }

  function cloneBattleState(B) {
    return { enemies: B.enemies.map((e) => Object.assign({}, e)), phase2: B.phase2, w: B.w, h: B.h, tiles: B.tiles, trail: B.trail };
  }
  function pushDist(run) { return BAL.pushDist + (has(run, "brawn") ? 1 : 0) + (run.heroId === "gorm" ? 1 : 0); }

  /* ---------- the route simulator ---------- */
  function simulate(B, run, route) {
    const st = cloneBattleState(B);
    const S0 = stats(run);
    const T = {
      moves: S0.mov, hp: run.hp, chain: 0, kills: 0, weakHits: 0, dmgTaken: 0, attacks: 0,
      guardBlock: (run.heroId === "gorm" ? 1 : 0) + (has(run, "shade") ? 1 : 0), guardHits: 0,
      forcedWeak: 0, uses: {}, marks: {}, dirs: [], straight: 0, route: [route[0]],
      compassUsed: false, plumeUsed: run.plumeUsed, bumps: 0, tangles: 0, multi: 0,
      cold: new Set(), coldAt: [false], hitCount: {},
    };
    const events = [], steps = [];
    let outcome = "ok", last = 0, done = false;
    const alive = () => st.enemies.filter((e) => e.alive);
    const push = (ev) => { events.push(ev); return ev; };

    const heal = (n) => {
      const before = T.hp;
      T.hp = Math.min(run.maxHp, T.hp + n);
      if (T.hp > before) push({ type: "heal", amount: T.hp - before, hp: T.hp });
    };
    function kill(e, src, rec) {
      e.alive = false;
      T.kills++; T.chain++;
      // the first kill of a route refunds in full, later kills one less
      let refund = stats(run, T.hp).refund - (T.kills > 1 ? BAL.refundDecay : 0);
      let bonusHeal = 0;
      if (has(run, "chain") && T.chain >= 3) { refund += 1; bonusHeal = 1; }
      if (has(run, "rope") && e.tangled) refund += 1;
      T.moves += refund;
      push({ type: "kill", uid: e.uid, refund, chain: T.chain, moves: T.moves, src, x: e.x, y: e.y, size: e.size });
      if (bonusHeal) heal(bonusHeal);
      if (rec) rec.kills.push(e.uid);
      if (!alive().length) { outcome = "victory"; push({ type: "victory" }); done = true; }
    }
    function damage(e, dmg, src, rec, extra) {
      e.hp -= dmg;
      const type = src === "hero" ? "attack" : src === "bump" ? "bump" : "skillHit";
      push(Object.assign({ type, uid: e.uid, dmg, hp: Math.max(0, e.hp), maxHp: e.maxHp }, extra || {}));
      if (e.boss && !st.phase2 && e.hp > 0 && e.hp <= e.maxHp / 2) { st.phase2 = true; push({ type: "bossPhase", uid: e.uid }); }
      if (e.hp <= 0) kill(e, src, rec);
    }
    function heroHurt(dmg, e) {
      T.hp -= dmg; T.dmgTaken += dmg;
      push({ type: "guard", uid: e.uid, dmg, hp: Math.max(0, T.hp) });
      if (T.hp <= 0) {
        if (has(run, "plume") && !T.plumeUsed) { T.plumeUsed = true; T.hp = 10; push({ type: "revive", hp: 10 }); }
        else { outcome = "dead"; push({ type: "heroDown" }); done = true; }
      }
    }

    function counter(e, rec) {
      if (T.guardBlock > 0) { T.guardBlock--; push({ type: "guardBlocked", uid: e.uid, reason: "guard" }); rec.guards.push({ uid: e.uid, blocked: true }); return; }
      const dmg = Math.max(0, e.atk - (has(run, "gauntlet") ? 1 : 0));
      if (!dmg) return;
      T.guardHits++;
      rec.guards.push({ uid: e.uid, dmg });
      heroHurt(dmg, e);
    }
    /* shove a survivor along the line of travel; rocks, the board edge, embers and bodies stop it.
       Returns true when it actually slid. */
    function shove(e, d, rec) {
      if (e.boss || e.size > 1) return false;
      const n = pushDist(run);
      const ember = blockedSet(B, T.route, T.cold);
      const from = { x: e.x, y: e.y }, path = [];
      let stop = null, other = [];
      for (let k = 0; k < n; k++) {
        const t = { x: e.x + d[0], y: e.y + d[1] };
        if (isRock(B, t.x, t.y)) { stop = "wall"; break; }
        if (ember.has(idx(B, t.x, t.y))) { stop = "ember"; break; }
        const occ = enemiesAt(st.enemies, t.x, t.y).filter((o) => o !== e);
        if (occ.length) {
          other = occ;
          if (occ.some((o) => o.boss)) { stop = "boss"; break; }
          const cap = BAL.tangleMax + (has(run, "rope") ? 1 : 0);
          if (occ.length + 1 <= cap) { e.x = t.x; e.y = t.y; path.push({ x: t.x, y: t.y }); stop = "tangle"; }
          else stop = "full";
          break;
        }
        e.x = t.x; e.y = t.y; path.push({ x: t.x, y: t.y });
      }
      // momentum: the more moves you still carry, the harder the slam
      const bump = (BAL.bump + Math.floor(T.moves * BAL.bumpPerMove)) * (has(run, "impact") ? 2 : 1);
      push({ type: "push", uid: e.uid, from, path, stop, dir: d, bump: stop ? bump : 0 });
      rec.pushes.push({ uid: e.uid, from, path, stop, dir: d, bump: stop ? bump : 0 });
      if (!stop) return path.length > 0;
      T.bumps++;
      // whatever it slams into (wall, rock, embers, another enemy) leaves it tangled:
      // no counterattack, weak-side damage from any hit, and the hit unties it
      T.tangles++;
      const members = stop === "tangle" ? enemiesAt(st.enemies, e.x, e.y) : [e];
      if (stop === "full" && other[0] && !other[0].boss) members.push(other[0]);
      members.forEach((m) => (m.tangled = true));
      push({ type: "tangle", uid: e.uid, x: e.x, y: e.y, uids: members.map((m) => m.uid), pile: stop === "tangle", reason: stop });
      const extra = stop === "ember" && has(run, "emberhand") ? 2 : 0;
      damage(e, bump + extra, "bump", rec, { reason: stop });
      if (stop === "tangle" || stop === "full" || stop === "boss") {
        const o = stop === "boss" ? other.find((x) => x.boss) : other[0];
        if (!done && o && o.alive) damage(o, bump, "bump", rec, { reason: stop });
      }
      return path.length > 0;
    }

    function trySkills(i, rec) {
      for (const comp of run.companions) {
        if (done) return;
        const maxUses = has(run, "twin") ? 2 : 1;
        if ((T.uses[comp] || 0) >= maxUses) continue;
        const info = D.COMPANIONS[comp], q = condReq(run, comp);
        const mk = markOf(T, comp);
        const dirs = T.dirs.slice(mk.dirs);
        let ok = false;
        const data = {};
        const lastN = (n) => (dirs.length >= n ? dirs.slice(dirs.length - n) : null);
        switch (info.cond.type) {
          case "straight": { const L = lastN(q.n); ok = !!L && L.every((d) => dirEq(d, L[0])); break; }
          case "corner": {
            const L = lastN(q.a + q.b);
            if (L) {
              const A = L[0], Bd = L[L.length - 1];
              ok = L.slice(0, q.a).every((d) => dirEq(d, A)) && L.slice(q.a).every((d) => dirEq(d, Bd)) && dot(A, Bd) === 0;
              if (ok) data.center = T.route[i - q.b];
            }
            break;
          }
          case "zigzag": {
            const L = lastN(q.n);
            if (L) { const A = L[0], Bd = L[1]; ok = !dirEq(A, Bd) && L.every((d, k) => dirEq(d, k % 2 ? Bd : A)); }
            break;
          }
          case "tangle": ok = T.tangles - mk.tangle >= q.n; break;
          case "kills": ok = T.kills - mk.kills >= q.n; break;
          case "weak": ok = T.weakHits - mk.weak >= q.n; break;
          case "loop":
            for (let j = i - q.n; j >= mk.route; j--) if (cheb(T.route[j], T.route[i]) === 1) { ok = true; data.poly = T.route.slice(j, i + 1); break; }
            break;
        }
        if (!ok) continue;
        T.uses[comp] = (T.uses[comp] || 0) + 1;
        T.marks[comp] = { dirs: T.dirs.length, weak: T.weakHits, route: i, tangle: T.tangles, kills: T.kills };
        runSkill(comp, info, i, data, rec);
      }
    }
    function runSkill(comp, info, i, data, rec) {
      const here = T.route[i];
      const ev = push({ type: "skill", comp, effect: info.effect, i, data });
      rec.skills.push({ comp, effect: info.effect, data, targets: [] });
      const sk = rec.skills[rec.skills.length - 1];
      const hit = (e, dmg) => { sk.targets.push({ uid: e.uid, dmg, kill: e.hp - dmg <= 0 }); damage(e, dmg, "skill", rec, { comp }); };
      switch (info.effect) {
        case "pierce": {
          const d = T.dirs[T.dirs.length - 1];
          let x = here.x + d[0], y = here.y + d[1], target = null;
          while (inB(B, x, y) && !isRock(B, x, y)) {
            const e = enemiesAt(st.enemies, x, y)[0];
            if (e) { target = e; break; }
            x += d[0]; y += d[1];
          }
          data.from = here; data.dir = d; data.to = { x, y };
          if (target) { data.target = target.uid; hit(target, info.power); }
          break;
        }
        case "burst": {
          const c = data.center;
          data.area = [];
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) data.area.push({ x: c.x + dx, y: c.y + dy });
          alive().filter((e) => data.area.some((t) => covers(e, t.x, t.y))).forEach((e) => { if (e.alive && !done) hit(e, info.power); });
          break;
        }
        case "haste": T.moves += info.power; ev.moves = T.moves; data.amount = info.power; break;
        case "volley": {
          const targets = alive().sort((a, b) => a.hp - b.hp || cheb(a, here) - cheb(b, here)).slice(0, 2);
          data.targets = targets.map((e) => e.uid);
          targets.forEach((e) => { if (e.alive && !done) hit(e, info.power); });
          break;
        }
        case "guard": T.guardBlock += 1; heal(info.power); break;
        case "shadow": T.forcedWeak += info.power; break;
        case "ring": {
          const poly = data.poly;
          const onRoute = (e) => T.route.some((t) => covers(e, t.x, t.y));
          const targets = alive().filter((e) => !onRoute(e) && pointInPoly(e.x + e.size / 2, e.y + e.size / 2, poly));
          data.targets = targets.map((e) => e.uid);
          targets.forEach((e) => { if (e.alive && !done) hit(e, info.power); });
          break;
        }
      }
    }

    for (let i = 1; i < route.length && !done; i++) {
      const a = route[i - 1], b = route[i];
      if (T.moves < 1) break;
      T.moves--;
      const d = [b.x - a.x, b.y - a.y];
      T.straight = T.dirs.length && dirEq(T.dirs[T.dirs.length - 1], d) ? T.straight + 1 : 1;
      T.dirs.push(d);
      T.route.push(b);
      last = i;
      const diag = d[0] !== 0 && d[1] !== 0;
      // the ground under an enemy does not catch fire: you may cross it again
      const cold = enemiesAt(st.enemies, b.x, b.y).length > 0;
      if (cold) T.cold.add(idx(B, b.x, b.y)); else T.cold.delete(idx(B, b.x, b.y));
      T.coldAt[i] = cold;
      push({ type: "step", i, from: a, to: b, dir: d, diag, moves: T.moves, cold });
      const rec = { i, tile: b, attack: null, attacks: [], skills: [], kills: [], pushes: [], guards: [], moves: 0, hp: 0, relic: null };
      steps.push(rec);

      // passing through enemies
      const hereE = enemiesAt(st.enemies, b.x, b.y).filter((e) => !covers(e, a.x, a.y));
      if (hereE.length) {
        const S = stats(run, T.hp);
        let bonus = 0;
        if (run.heroId === "rue") bonus += Math.min(3, T.straight - 1);
        if (has(run, "sigil") && T.straight - 1 >= 3) bonus += 2;
        const base = S.atk + bonus;
        const tangled = hereE.length > 1 || hereE.some((e) => e.tangled);
        if (tangled) {
          // a tangle has no guard: every tangled body takes a weak-side hit, and the hit unties it
          let killed = 0;
          const untied = [];
          for (const e of hereE) {
            if (!e.alive || done) continue;
            T.hitCount[e.uid] = (T.hitCount[e.uid] || 0) + 1;
            if (!e.tangled) continue; // already cashed in this route
            untied.push(e);
            const dmg = Math.floor(base * S.weakMult);
            T.weakHits++; T.attacks++;
            rec.attacks.push({ uid: e.uid, dmg, weak: true, tangle: true, kill: e.hp - dmg <= 0 });
            damage(e, dmg, "hero", rec, { weak: true, tangle: true, dir: d, diag, bonus, tile: { x: b.x, y: b.y } });
            if (!e.alive) killed++;
          }
          untied.forEach((m) => (m.tangled = false));
          const still = untied.filter((m) => m.alive);
          if (still.length) push({ type: "untie", uids: still.map((m) => m.uid) });
          T.multi = Math.max(T.multi, killed);
        } else {
          const e = hereE[0];
          // an enemy already struck this route is only shoved: the follow-up deals no blade damage
          // (enemies that cannot be shoved, i.e. the boss, may be struck again)
          const again = (T.hitCount[e.uid] = (T.hitCount[e.uid] || 0) + 1) > 1 && !e.boss && e.size === 1;
          if (again) {
            T.attacks++;
            rec.attacks.push({ uid: e.uid, dmg: 0, weak: false, pushOnly: true, kill: false });
            push({ type: "attack", uid: e.uid, dmg: 0, hp: e.hp, maxHp: e.maxHp, pushOnly: true, dir: d, diag, tile: { x: b.x, y: b.y } });
            shove(e, d, rec);
          } else {
            const sealed = sealedBy(st.enemies, e);
            let weak = !sealed && isWeakEntry(e, a, b), forced = false;
            if (!weak && T.forcedWeak > 0) { weak = true; forced = true; T.forcedWeak--; }
            if (!weak && has(run, "oath") && T.attacks === 0) { weak = true; forced = true; }
            T.attacks++;
            let dmg = base;
            if (weak) { dmg = Math.floor(dmg * S.weakMult); T.weakHits++; }
            if (e.boss && st.phase2 && !weak) dmg = Math.ceil(dmg / 2);
            rec.attacks.push({ uid: e.uid, dmg, weak, forced, sealed, kill: e.hp - dmg <= 0, bonus });
            damage(e, dmg, "hero", rec, { weak, forced, sealed, dir: d, diag, bonus, tile: { x: b.x, y: b.y } });
            const moved = !done && e.alive ? shove(e, d, rec) : false;
            // counterattack: a straight (non-diagonal) hit on a shielded side that leaves it standing
            if (!done && e.alive && !weak && !diag && e.atk > 0 && !e.tangled && !(moved && has(run, "aegis"))) counter(e, rec);
            if (done) break;
          }
        }
        rec.attack = rec.attacks[0] || null;
      }
      if (!done) trySkills(i, rec);
      if (!done && has(run, "compass") && !T.compassUsed) {
        for (let j = i - 5; j >= 0; j--) if (cheb(T.route[j], b) === 1) {
          T.compassUsed = true; T.moves += 2;
          push({ type: "relic", id: "compass", moves: T.moves });
          rec.relic = "compass";
          break;
        }
      }
      rec.moves = T.moves; rec.hp = T.hp;
    }
    const endTile = route[last];
    const endBlocked = outcome === "ok" && enemiesAt(st.enemies, endTile.x, endTile.y).length > 0;
    const teleEnd = outcome === "ok" ? teleDmgAt(B, st.enemies, endTile.x, endTile.y) : 0;
    return { events, steps, st, T, outcome, last, end: endTile, endBlocked, teleEnd };
  }

  /* after a route is played out, make it the battle's truth */
  function commitRoute(B, run, route, res) {
    B.enemies = res.st.enemies.filter((e) => e.alive);
    B.phase2 = res.st.phase2;
    B.hero = { x: res.end.x, y: res.end.y };
    for (let i = 1; i <= res.last; i++) if (!res.T.coldAt[i]) B.trail.push({ x: route[i].x, y: route[i].y });
    run.hp = Math.max(0, res.T.hp);
    run.plumeUsed = res.T.plumeUsed;
    run.stats.kills += res.T.kills;
    run.stats.maxChain = Math.max(run.stats.maxChain, res.T.chain);
    run.stats.bestRoute = Math.max(run.stats.bestRoute, res.last);
    run.stats.turns++;
    const s = B.bst;
    s.chain = Math.max(s.chain, res.T.chain);
    s.weak += res.T.weakHits; s.bumps += res.T.bumps; s.multi = Math.max(s.multi, res.T.multi); s.guardHits += res.T.guardHits;
    B.lastT = res.T;
  }

  /* ---------- enemy phase (mutates B/run, returns events to replay) ---------- */
  function occupied(B, x, y, self) {
    return B.enemies.some((e) => e !== self && e.alive && covers(e, x, y)) || (x === B.hero.x && y === B.hero.y);
  }
  function freeFor(B, x, y, self, ember) {
    return !isRock(B, x, y) && !ember.has(idx(B, x, y)) && !occupied(B, x, y, self);
  }
  function nearestFree(B, sx, sy, self) {
    const ember = blockedSet(B);
    const seen = new Set([idx(B, sx, sy)]), q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx, ny = y + dy;
        if (!inB(B, nx, ny) || seen.has(idx(B, nx, ny)) || isRock(B, nx, ny)) continue;
        seen.add(idx(B, nx, ny));
        if (freeFor(B, nx, ny, self, ember)) return { x: nx, y: ny };
        q.push([nx, ny]);
      }
    }
    return null;
  }
  function enemyPhase(B, run) {
    const events = [];
    const rng = run.rng;
    const S = stats(run);
    const push = (ev) => { events.push(ev); return ev; };
    const alive = () => B.enemies.filter((e) => e.alive);
    const hurtHero = (dmg, extra) => {
      run.hp -= dmg;
      push(Object.assign({ type: "heroHit", total: dmg, reduced: 0, hp: Math.max(0, run.hp) }, extra || {}));
      if (run.hp <= 0) {
        if (has(run, "plume") && !run.plumeUsed) { run.plumeUsed = true; run.hp = 10; push({ type: "revive", hp: 10 }); return false; }
        run.hp = 0; push({ type: "heroDown" }); return true;
      }
      return false;
    };

    // 1. embers scorch neighbours (relic)
    if (has(run, "scorch")) {
      for (const e of alive()) {
        let adj = false;
        for (const t of B.trail) {
          for (let k = 0; k < e.size * e.size && !adj; k++) {
            const ex = e.x + (k % e.size), ey = e.y + Math.floor(k / e.size);
            if (Math.max(Math.abs(ex - t.x), Math.abs(ey - t.y)) === 1) adj = true;
          }
          if (adj) break;
        }
        if (!adj) continue;
        e.hp -= 2;
        push({ type: "scorch", uid: e.uid, dmg: 2, hp: Math.max(0, e.hp) });
        if (e.hp <= 0) { e.alive = false; run.stats.kills++; push({ type: "kill", uid: e.uid, refund: 0, chain: 0, src: "scorch", x: e.x, y: e.y, size: e.size }); }
      }
      B.enemies = alive();
      if (!B.enemies.length) { push({ type: "victory" }); return events; }
    }
    // 2. announced strikes land (tangled enemies are stunned and miss theirs)
    for (const e of alive().slice()) {
      if (!e.alive) continue;
      const tiles = teleTiles(B, e);
      if (!tiles.length) continue;
      push({ type: "strike", uid: e.uid, tiles, dmg: e.tele.dmg });
      for (const t of tiles) for (const o of enemiesAt(B.enemies, t.x, t.y)) {
        if (o === e || !o.alive) continue;
        o.hp -= e.tele.dmg;
        push({ type: "friendly", uid: o.uid, by: e.uid, dmg: e.tele.dmg, hp: Math.max(0, o.hp) });
        if (o.hp <= 0) { o.alive = false; B.bst.friendly++; run.stats.kills++; push({ type: "kill", uid: o.uid, refund: 0, chain: 0, src: "friendly", x: o.x, y: o.y, size: o.size }); }
      }
      if (tiles.some((t) => t.x === B.hero.x && t.y === B.hero.y)) {
        if (hurtHero(e.tele.dmg, { src: "strike", uid: e.uid })) return events;
      }
    }
    B.enemies = alive();
    if (!B.enemies.length) { push({ type: "victory" }); return events; }
    // 3. old embers cool down
    const nCool = coolCount(run, B.trail.length);
    if (nCool > 0) push({ type: "cool", tiles: B.trail.splice(0, nCool) });
    // 4. the night presses in (anti-turtling): each surviving enemy
    let total = 0;
    for (const e of alive()) {
      const p = enemyPressure(run, B, e);
      if (p > 0) { push({ type: "pressure", uid: e.uid, dmg: p }); total += p; }
    }
    let reduced = 0;
    if (has(run, "afterglow") && B.lastT) { reduced = Math.min(total, Math.max(0, B.lastT.moves)); total -= reduced; }
    if (total > 0 || reduced > 0) {
      run.hp -= total;
      push({ type: "heroHit", total, reduced, hp: Math.max(0, run.hp) });
      if (run.hp <= 0) {
        if (has(run, "plume") && !run.plumeUsed) { run.plumeUsed = true; run.hp = 10; push({ type: "revive", hp: 10 }); }
        else { run.hp = 0; push({ type: "heroDown" }); return events; }
      }
    }
    // 5. tangles come loose
    const moved = [], seenTile = new Set();
    for (const e of alive()) {
      const k = idx(B, e.x, e.y);
      if (!seenTile.has(k)) { seenTile.add(k); continue; }
      const to = nearestFree(B, e.x, e.y, e);
      if (to) { moved.push({ uid: e.uid, from: { x: e.x, y: e.y }, to }); e.x = to.x; e.y = to.y; seenTile.add(idx(B, to.x, to.y)); }
    }
    alive().forEach((e) => (e.tangled = false));
    if (moved.length) push({ type: "untangle", moves: moved });
    // 6. enemy actions: turn, summon, walk
    const ember = blockedSet(B);
    const freeTiles = () => {
      const out = [];
      for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
        if (!freeFor(B, x, y, null, ember)) continue;
        if (Math.max(Math.abs(x - B.hero.x), Math.abs(y - B.hero.y)) <= 1) continue;
        out.push({ x, y });
      }
      return out;
    };
    const rotateTo = (e, w) => { if (w && w !== e.weak && validWeaks(B, e).includes(w)) { e.weak = w; push({ type: "rotate", uid: e.uid, weak: w }); } };
    const rotate = (e) => {
      const v = validWeaks(B, e);
      let k = CW.indexOf(e.weak);
      for (let n = 0; n < 4; n++) { k = (k + 1) % 4; if (v.includes(CW[k])) break; }
      rotateTo(e, CW[k]);
    };
    const summon = (type) => {
      const f = freeTiles();
      if (!f.length) return;
      const t = f[Math.floor(rng() * f.length)];
      const e = makeEnemy(B, type, t.x, t.y, rng);
      B.enemies.push(e);
      push({ type: "summon", enemy: Object.assign({}, e) });
    };
    const faceHero = (e) => {
      // walkers show their back: the weak side points away from the hero
      const dx = B.hero.x - e.x, dy = B.hero.y - e.y;
      rotateTo(e, Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "L" : "R") : dy > 0 ? "U" : "D");
    };
    const step4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const walkTo = (e, to) => { push({ type: "move", uid: e.uid, from: { x: e.x, y: e.y }, to }); e.x = to.x; e.y = to.y; };
    const chase = (e) => {
      if (cheb(e, B.hero) <= 1) return;
      // BFS (4-dir) toward any tile next to the hero
      const start = idx(B, e.x, e.y), prev = new Map([[start, -1]]), q = [[e.x, e.y]];
      let goal = null;
      while (q.length && !goal) {
        const [x, y] = q.shift();
        for (const [dx, dy] of step4) {
          const nx = x + dx, ny = y + dy, k = idx(B, nx, ny);
          if (!inB(B, nx, ny) || prev.has(k) || !freeFor(B, nx, ny, e, ember)) continue;
          prev.set(k, idx(B, x, y));
          if (cheb({ x: nx, y: ny }, B.hero) <= 1) { goal = k; break; }
          q.push([nx, ny]);
        }
      }
      if (goal == null) return;
      let k = goal;
      while (prev.get(k) !== start) k = prev.get(k);
      walkTo(e, { x: k % B.w, y: Math.floor(k / B.w) });
      faceHero(e);
    };
    const flee = (e) => {
      let best = null, bd = cheb(e, B.hero);
      for (const [dx, dy] of step4) {
        const t = { x: e.x + dx, y: e.y + dy };
        if (!inB(B, t.x, t.y) || !freeFor(B, t.x, t.y, e, ember)) continue;
        const dd = cheb(t, B.hero);
        if (dd > bd) { bd = dd; best = t; }
      }
      if (best) walkTo(e, best);
    };
    for (const e of alive().slice().sort((a, b) => cheb(a, B.hero) - cheb(b, B.hero))) {
      const d = D.ENEMIES[e.type];
      if (d.rotates) rotate(e);
      if (d.summons && alive().length < 7) summon("husk");
      if (e.boss) {
        rotate(e);
        const minions = alive().filter((m) => !m.boss).length;
        if (B.phase2) { if (minions < 2) summon("husk"); if (minions < 3) summon("wisp"); }
        else if (minions < 2) summon("husk");
      }
      if (d.ai === "chase" || (d.ai === "slow" && B.turn % 2 === 0)) chase(e);
      else if (d.ai === "flee") flee(e);
    }
    // 7. next turn: new announcements
    B.turn++;
    planTelegraphs(B);
    push({ type: "teles" });
    push({ type: "turn", turn: B.turn });
    return events;
  }

  /* ---------- objectives: an action and its reward, shown up front ---------- */
  function drawRelic(run, rng, rareChance, exclude) {
    const pool = Object.keys(D.RELICS).filter((id) => !run.relics.includes(id) && !exclude.includes(id));
    if (!pool.length) return null;
    const rares = pool.filter((id) => D.RELICS[id].rarity === 2), commons = pool.filter((id) => D.RELICS[id].rarity !== 2);
    if ((rng() < rareChance && rares.length) || !commons.length) return rpick(rng, rares);
    return rpick(rng, commons);
  }
  function genObjectives(run, B) {
    const rng = run.rng;
    const teleCount = B.enemies.filter((e) => D.ENEMIES[e.type].tele).length;
    const pool = shuffle(rng, Object.keys(D.OBJECTIVES)).filter((id) => !(id === "friendly" && teleCount < 2) && !(id === "multi" && B.enemies.length < 3) && !(id === "fast2" && B.isBoss));
    const used = [];
    return pool.slice(0, 2).map((id, k) => {
      let reward = null;
      const slots = BAL.maxCompanions - run.companions.length;
      const comps = Object.keys(D.COMPANIONS).filter((c) => !run.companions.includes(c) && !used.includes(c));
      if (k === 0 && slots > 0 && comps.length && rng() < 0.5) reward = { kind: "comp", id: rpick(rng, comps) };
      if (!reward) { const r = drawRelic(run, rng, B.kind === "elite" ? 0.6 : 0.3, used); if (r) reward = { kind: "relic", id: r }; }
      if (!reward) reward = { kind: "maxhp", amount: 5 };
      if (reward.id) used.push(reward.id);
      return { id, reward };
    });
  }
  /* 'done' | 'failed' | 'open' — final=true at victory */
  function objectiveState(B, o, final) {
    const s = B.bst;
    switch (o.id) {
      case "chain3": return s.chain >= 3 ? "done" : "open";
      case "multi": return s.multi >= 2 ? "done" : "open";
      case "weak3": return s.weak >= 3 ? "done" : "open";
      case "bump3": return s.bumps >= 3 ? "done" : "open";
      case "friendly": return s.friendly >= 1 ? "done" : "open";
      case "noguard": return s.guardHits > 0 ? "failed" : final ? "done" : "open";
      case "fast2": return B.turn > 2 ? "failed" : final ? "done" : "open";
    }
    return "open";
  }
  function claimObjectives(run, B) {
    const got = [];
    for (const o of B.objectives) {
      if (objectiveState(B, o, true) !== "done") continue;
      const r = o.reward;
      if (r.kind === "maxhp") { run.maxHp += r.amount; run.hp += r.amount; }
      else if (r.kind === "comp" && run.companions.length >= BAL.maxCompanions) continue;
      else applyReward(run, r);
      got.push(o);
    }
    return got;
  }

  /* ---------- rewards ---------- */
  function genRewards(run, kind) {
    const rng = run.rng;
    const out = [];
    const compPool = shuffle(rng, Object.keys(D.COMPANIONS).filter((id) => !run.companions.includes(id)));
    const slots = BAL.maxCompanions - run.companions.length;
    let nComp = 0, nRelic = 3, rare = 0.2;
    if (kind === "battle") { nComp = slots > 0 ? (run.companions.length === 0 ? 2 : 1) : 0; nRelic = 3 - nComp; }
    if (kind === "elite") { nRelic = 3; rare = 0.65; }
    if (kind === "treasure") { nRelic = 3; rare = 0.35; }
    if (kind === "lost") { nComp = Math.min(2, slots); nRelic = 0; }
    for (let i = 0; i < nComp && i < compPool.length; i++) out.push({ kind: "comp", id: compPool[i] });
    const ex = [];
    for (let i = 0; i < nRelic; i++) {
      const r = drawRelic(run, rng, rare, ex);
      if (!r) break;
      ex.push(r);
      out.push({ kind: "relic", id: r });
    }
    return out;
  }
  function applyReward(run, r) {
    if (r.kind === "comp") { if (run.companions.length < BAL.maxCompanions && !run.companions.includes(r.id)) run.companions.push(r.id); }
    else if (r.kind === "relic") {
      if (run.relics.includes(r.id)) return;
      run.relics.push(r.id);
      if (r.id === "pact") { run.maxHp = Math.max(10, run.maxHp - 8); run.hp = Math.min(run.hp, run.maxHp); }
    }
  }
  function heal(run, n) { const b = run.hp; run.hp = Math.min(run.maxHp, run.hp + n); return run.hp - b; }

  /* for UI: tiles reachable from `from` with `moves` steps (ignores refunds) */
  function reachable(B, blocked, from, moves) {
    const out = new Set();
    if (moves <= 0) return out;
    const seen = new Map([[idx(B, from.x, from.y), 0]]);
    const q = [[from.x, from.y, 0]];
    while (q.length) {
      const [x, y, d] = q.shift();
      if (d >= moves) continue;
      for (const [dx, dy] of DIRS8) {
        const b = { x: x + dx, y: y + dy };
        if (stepError(B, blocked, 1, { x, y }, b)) continue;
        const k = idx(B, b.x, b.y);
        if (seen.has(k) && seen.get(k) <= d + 1) continue;
        seen.set(k, d + 1); out.add(k);
        q.push([b.x, b.y, d + 1]);
      }
    }
    return out;
  }
  function weakEntries(B, enemies, e) {
    const [dx, dy] = CARD[e.weak];
    const out = [];
    for (let k = 0; k < e.size; k++) {
      const tx = dx === 0 ? e.x + k : dx > 0 ? e.x + e.size : e.x - 1;
      const ty = dy === 0 ? e.y + k : dy > 0 ? e.y + e.size : e.y - 1;
      if (!isRock(B, tx, ty)) out.push({ x: tx, y: ty });
    }
    return out;
  }
  /* how many of the oldest trail tiles cool at turn end (hero's tile never) */
  function coolCount(run, len) {
    return Math.max(0, Math.max(len - stats(run).trail, Math.min(BAL.coolMin, len - 1)));
  }
  function canMove(B) {
    const blocked = blockedSet(B, [B.hero]);
    return DIRS8.some(([dx, dy]) => !stepError(B, blocked, 1, B.hero, { x: B.hero.x + dx, y: B.hero.y + dy }));
  }
  function unstick(B) {
    const cooled = [];
    while (B.trail.length > 1 && !canMove(B)) cooled.push(B.trail.shift());
    return cooled;
  }
  function enemyPressure(run, B, e) {
    let p = e.pressure - (has(run, "coal") ? 1 : 0);
    if (e.boss && B.phase2) p += 1;
    return Math.max(0, p);
  }
  function pressureOf(run, B, enemies) {
    let total = 0;
    for (const e of enemies) if (e.alive) total += enemyPressure(run, B, e);
    return total;
  }

  EL.Logic = {
    CARD, CW, DIRS8, rngFrom, createRun, stats, genMap, nextNodes, genBattle,
    blockedSet, stepError, isWeakEntry, sealedBy, enemyAt, enemiesAt, covers, isRock, idx, inB,
    simulate, commitRoute, enemyPhase, genRewards, applyReward, heal, reachable, weakEntries,
    condReq, condProgress, pressureOf, enemyPressure, has, coolCount, canMove, unstick,
    teleTiles, teleDmgAt, planTelegraphs, pushDist,
    objectiveState, claimObjectives,
  };
})(window.EL);
