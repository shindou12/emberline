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
    const e = { uid: ++B.uidSeq, type, x, y, size: d.size || 1, hp: d.hp, maxHp: d.hp, atk: d.atk, pressure: d.pressure, weak: "D", alive: true, boss: !!d.boss };
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
    const B = { w: BAL.GW, h: BAL.GH, tiles: new Array(BAL.GW * BAL.GH).fill(0), enemies: [], hero: { x: 3, y: 7 }, trail: [], turn: 1, kind: node.type, isBoss: node.type === "boss", phase2: false, uidSeq: 0, row: node.row };
    B.trail = [{ x: 3, y: 7 }];
    if (B.isBoss) {
      for (const [x, y] of [[0, 4], [6, 4], [1, 0], [5, 0]]) B.tiles[idx(B, x, y)] = 1;
      const boss = makeEnemy(B, "boss", 2, 1, rng);
      boss.weak = "D";
      B.enemies.push(boss);
      B.enemies.push(makeEnemy(B, "husk", 0, 2, rng));
      B.enemies.push(makeEnemy(B, "husk", 6, 2, rng));
      B.enemies.push(makeEnemy(B, "wisp", 3, 4, rng));
      return B;
    }
    // rocks
    const nRocks = ri(rng, 3, 5);
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
    return B;
  }

  /* ---------- route rules ---------- */
  function blockedSet(B, route) {
    const s = new Set();
    for (const t of B.trail) s.add(idx(B, t.x, t.y));
    if (route) for (const t of route) s.add(idx(B, t.x, t.y));
    return s;
  }
  /* why a step is illegal ('' = legal). The View never decides this. */
  function stepError(B, blocked, moves, a, b) {
    if (!inB(B, b.x, b.y)) return "out";
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return "far";
    if (isRock(B, b.x, b.y)) return "rock";
    if (dx !== 0 && dy !== 0 && isRock(B, a.x + dx, a.y) && isRock(B, a.x, a.y + dy)) return "squeeze";
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
  const sealedBy = (enemies, e) => !e.boss && e.type !== "totem" && enemies.some((t) => t.alive && t.type === "totem");
  const dirEq = (a, b) => a[0] === b[0] && a[1] === b[1];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x + 0.5, yi = poly[i].y + 0.5, xj = poly[j].x + 0.5, yj = poly[j].y + 0.5;
      if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* companion condition thresholds (the charm relic relaxes each by one notch) */
  function condReq(run, comp) {
    const c = D.COMPANIONS[comp].cond;
    const r = has(run, "charm") ? 1 : 0;
    switch (c.type) {
      case "straight": return { n: Math.max(2, c.n - r) };
      case "corner": return { a: c.a, b: Math.max(1, c.b - r) };
      case "zigzag": return { n: Math.max(3, c.n - r) };
      case "kills": return { n: Math.max(1, c.n - r) };
      case "hurt": return { n: Math.max(1, c.n - 2 * r) };
      case "weak": return { n: Math.max(1, c.n - r) };
      case "loop": return { n: Math.max(3, c.n - r) };
    }
    return {};
  }

  /* progress 0..1 and a detail object for the HUD */
  function condProgress(run, comp, T) {
    const c = D.COMPANIONS[comp].cond, q = condReq(run, comp);
    const mk = T.marks[comp] || { dirs: 0, kills: 0, hurt: 0, weak: 0, route: 0 };
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
      case "kills": need = q.n; cur = T.kills - mk.kills; break;
      case "hurt": need = q.n; cur = T.dmgTaken - mk.hurt; break;
      case "weak": need = q.n; cur = T.weakHits - mk.weak; break;
      case "loop": need = q.n; cur = Math.min(q.n - 1, T.route.length - 1 - mk.route); break;
    }
    return { cur: Math.max(0, Math.min(need, cur)), need };
  }

  function cloneBattleState(B) {
    return { enemies: B.enemies.map((e) => Object.assign({}, e)), phase2: B.phase2, w: B.w, h: B.h, tiles: B.tiles, trail: B.trail };
  }

  /* ---------- the route simulator ---------- */
  function simulate(B, run, route) {
    const st = cloneBattleState(B);
    const S0 = stats(run);
    const hero = D.HEROES[run.heroId];
    const T = {
      moves: S0.mov, hp: run.hp, chain: 0, kills: 0, weakHits: 0, dmgTaken: 0, attacks: 0,
      counterBlock: (has(run, "gauntlet") ? 1 : 0) + (run.heroId === "gorm" ? 1 : 0),
      forcedWeak: 0, uses: {}, marks: {}, dirs: [], straight: 0, route: [route[0]],
      compassUsed: false, plumeUsed: run.plumeUsed, heals: 0,
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
    function kill(e, src, stepRec) {
      e.alive = false;
      T.kills++; T.chain++;
      let refund = stats(run, T.hp).refund;
      let bonusHeal = 0;
      if (has(run, "chain") && T.chain >= 3) { refund += 1; bonusHeal = 1; }
      T.moves += refund;
      push({ type: "kill", uid: e.uid, refund, chain: T.chain, moves: T.moves, src, x: e.x, y: e.y, size: e.size });
      if (bonusHeal) heal(bonusHeal);
      if (stepRec) stepRec.kills.push(e.uid);
      if (!alive().length) { outcome = "victory"; push({ type: "victory" }); done = true; }
    }
    function damage(e, dmg, src, stepRec, extra) {
      e.hp -= dmg;
      push(Object.assign({ type: src === "hero" ? "attack" : "skillHit", uid: e.uid, dmg, hp: Math.max(0, e.hp), maxHp: e.maxHp }, extra || {}));
      if (e.boss && !st.phase2 && e.hp > 0 && e.hp <= e.maxHp / 2) { st.phase2 = true; push({ type: "bossPhase", uid: e.uid }); }
      if (e.hp <= 0) kill(e, src, stepRec);
    }
    function heroHurt(dmg, e) {
      T.hp -= dmg; T.dmgTaken += dmg;
      push({ type: "counter", uid: e.uid, dmg, hp: Math.max(0, T.hp) });
      if (T.hp <= 0) {
        if (has(run, "plume") && !T.plumeUsed) { T.plumeUsed = true; T.hp = 10; push({ type: "revive", hp: 10 }); }
        else { outcome = "dead"; push({ type: "heroDown" }); done = true; }
      }
    }

    function trySkills(i, stepRec) {
      for (const comp of run.companions) {
        if (done) return;
        const maxUses = has(run, "twin") ? 2 : 1;
        if ((T.uses[comp] || 0) >= maxUses) continue;
        const info = D.COMPANIONS[comp], q = condReq(run, comp);
        const mk = T.marks[comp] || { dirs: 0, kills: 0, hurt: 0, weak: 0, route: 0 };
        const dirs = T.dirs.slice(mk.dirs);
        let ok = false, data = {};
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
          case "kills": ok = T.kills - mk.kills >= q.n; break;
          case "hurt": ok = T.dmgTaken - mk.hurt >= q.n; break;
          case "weak": ok = T.weakHits - mk.weak >= q.n; break;
          case "loop": {
            for (let j = i - q.n; j >= mk.route; j--) {
              if (cheb(T.route[j], T.route[i]) === 1) { ok = true; data.poly = T.route.slice(j, i + 1); break; }
            }
            break;
          }
        }
        if (!ok) continue;
        T.uses[comp] = (T.uses[comp] || 0) + 1;
        T.marks[comp] = { dirs: T.dirs.length, kills: T.kills, hurt: T.dmgTaken, weak: T.weakHits, route: i };
        runSkill(comp, info, i, data, stepRec);
      }
    }

    function runSkill(comp, info, i, data, stepRec) {
      const here = T.route[i];
      const ev = push({ type: "skill", comp, effect: info.effect, i, data });
      stepRec.skills.push({ comp, effect: info.effect, data, targets: [] });
      const rec = stepRec.skills[stepRec.skills.length - 1];
      const hit = (e, dmg) => { rec.targets.push({ uid: e.uid, dmg, kill: e.hp - dmg <= 0 }); damage(e, dmg, "skill", stepRec, { comp }); };
      switch (info.effect) {
        case "pierce": {
          const d = T.dirs[T.dirs.length - 1];
          let x = here.x + d[0], y = here.y + d[1], target = null;
          while (inB(B, x, y) && !isRock(B, x, y)) {
            const e = enemyAt(st.enemies, x, y);
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
          const targets = alive().filter((e) => data.area.some((t) => covers(e, t.x, t.y)));
          targets.forEach((e) => { if (e.alive && !done) hit(e, info.power); });
          break;
        }
        case "haste": T.moves += info.power; ev.moves = T.moves; data.amount = info.power; break;
        case "volley": {
          const targets = alive().sort((a, b) => a.hp - b.hp || cheb(a, here) - cheb(b, here)).slice(0, 2);
          data.targets = targets.map((e) => e.uid);
          targets.forEach((e) => { if (e.alive && !done) hit(e, info.power); });
          break;
        }
        case "guard": T.counterBlock += 1; heal(info.power); break;
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
      push({ type: "step", i, from: a, to: b, dir: d, diag, moves: T.moves });
      const rec = { i, tile: b, attack: null, skills: [], kills: [], moves: 0, hp: 0, relic: null };
      steps.push(rec);

      const e = enemyAt(st.enemies, b.x, b.y);
      if (e) {
        const sealed = sealedBy(st.enemies, e);
        let weak = !sealed && isWeakEntry(e, a, b);
        let forced = false;
        if (!weak && T.forcedWeak > 0) { weak = true; forced = true; T.forcedWeak--; }
        if (!weak && has(run, "oath") && T.attacks === 0) { weak = true; forced = true; }
        T.attacks++;
        const S = stats(run, T.hp);
        let bonus = 0;
        if (run.heroId === "rue") bonus += Math.min(3, T.straight - 1);
        if (has(run, "sigil") && T.straight - 1 >= 3) bonus += 2;
        let dmg = S.atk + bonus;
        if (weak) { dmg = Math.floor(dmg * S.weakMult); T.weakHits++; }
        if (e.boss && st.phase2 && !weak) dmg = Math.ceil(dmg / 2);
        const wouldKill = e.hp - dmg <= 0;
        rec.attack = { uid: e.uid, dmg, weak, forced, sealed, kill: wouldKill, counter: 0, blocked: false, bonus };
        damage(e, dmg, "hero", rec, { weak, forced, sealed, dir: d, diag, bonus, tile: { x: b.x, y: b.y } });
        if (!done && e.alive && !weak && e.atk > 0) {
          if (has(run, "aegis") && diag) { push({ type: "counterBlocked", uid: e.uid, reason: "aegis" }); rec.attack.blocked = true; }
          else if (T.counterBlock > 0) { T.counterBlock--; push({ type: "counterBlocked", uid: e.uid, reason: "guard" }); rec.attack.blocked = true; }
          else { rec.attack.counter = e.atk; heroHurt(e.atk, e); }
        }
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
    const endBlocked = outcome === "ok" && !!enemyAt(st.enemies, endTile.x, endTile.y);
    return { events, steps, st, T, outcome, last, end: endTile, endBlocked };
  }

  /* after a route is played out, make it the battle's truth */
  function commitRoute(B, run, route, res) {
    B.enemies = res.st.enemies.filter((e) => e.alive);
    B.phase2 = res.st.phase2;
    B.hero = { x: res.end.x, y: res.end.y };
    for (let i = 1; i <= res.last; i++) B.trail.push({ x: route[i].x, y: route[i].y });
    run.hp = Math.max(0, res.T.hp);
    run.plumeUsed = res.T.plumeUsed;
    run.stats.kills += res.T.kills;
    run.stats.maxChain = Math.max(run.stats.maxChain, res.T.chain);
    run.stats.bestRoute = Math.max(run.stats.bestRoute, res.last);
    run.stats.turns++;
    B.lastT = res.T;
  }

  /* ---------- enemy phase (mutates B/run, returns events to replay) ---------- */
  function enemyPhase(B, run) {
    const events = [];
    const rng = run.rng;
    const S = stats(run);
    const push = (ev) => { events.push(ev); return ev; };
    const alive = () => B.enemies.filter((e) => e.alive);

    // 1. embers scorch neighbours (relic)
    if (has(run, "scorch")) {
      const trailTiles = B.trail;
      for (const e of alive()) {
        let adj = false;
        for (const t of trailTiles) {
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
    // 2. old embers cool down
    const nCool = coolCount(run, B.trail.length);
    if (nCool > 0) {
      const cooled = B.trail.splice(0, nCool);
      push({ type: "cool", tiles: cooled });
    }
    // 3. the night presses in: each surviving enemy hurts the hero
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
    // 4. enemy actions
    const freeTiles = () => {
      const out = [];
      const blocked = blockedSet(B);
      for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
        if (isRock(B, x, y) || blocked.has(idx(B, x, y)) || enemyAt(B.enemies, x, y)) continue;
        if (x === B.hero.x && y === B.hero.y) continue;
        if (Math.max(Math.abs(x - B.hero.x), Math.abs(y - B.hero.y)) <= 1) continue;
        out.push({ x, y });
      }
      return out;
    };
    const rotate = (e) => {
      const v = validWeaks(B, e);
      let k = CW.indexOf(e.weak);
      for (let n = 0; n < 4; n++) { k = (k + 1) % 4; if (v.includes(CW[k])) break; }
      e.weak = CW[k];
      push({ type: "rotate", uid: e.uid, weak: e.weak });
    };
    const summon = (type) => {
      const f = freeTiles();
      if (!f.length) return;
      const t = f[Math.floor(rng() * f.length)];
      const e = makeEnemy(B, type, t.x, t.y, rng);
      B.enemies.push(e);
      push({ type: "summon", enemy: Object.assign({}, e) });
    };
    for (const e of alive().slice()) {
      const d = D.ENEMIES[e.type];
      if (d.rotates) rotate(e);
      if (d.summons && alive().length < 7) summon("husk");
      if (e.boss) {
        rotate(e);
        const minions = alive().filter((m) => !m.boss).length;
        if (B.phase2) { if (minions < 2) summon("husk"); if (minions < 3) summon("wisp"); }
        else if (minions < 2) summon("husk");
      }
    }
    // 5. next turn
    B.turn++;
    push({ type: "turn", turn: B.turn });
    return events;
  }

  /* ---------- rewards ---------- */
  function drawRelic(run, rng, rareChance, exclude) {
    const pool = Object.keys(D.RELICS).filter((id) => !run.relics.includes(id) && !exclude.includes(id));
    if (!pool.length) return null;
    const rares = pool.filter((id) => D.RELICS[id].rarity === 2), commons = pool.filter((id) => D.RELICS[id].rarity !== 2);
    if ((rng() < rareChance && rares.length) || !commons.length) return rpick(rng, rares);
    return rpick(rng, commons);
  }
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
    if (r.kind === "comp") { if (run.companions.length < BAL.maxCompanions) run.companions.push(r.id); }
    else if (r.kind === "relic") {
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
  /* tile from which a straight-in attack hits the weak side (null if sealed/blocked) */
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
  /* boxed in by embers: the oldest embers crumble until a step opens up */
  function unstick(B) {
    const cooled = [];
    while (B.trail.length > 1 && !canMove(B)) cooled.push(B.trail.shift());
    return cooled;
  }
  function enemyPressure(run, B, e) {
    let p = e.pressure - (has(run, "coal") ? 1 : 0);
    if (e.boss && B.phase2) p += 1;
    if (B.turn >= BAL.deepTurn) p += 1;
    return Math.max(0, p);
  }
  function pressureOf(run, B, enemies) {
    let total = 0;
    for (const e of enemies) if (e.alive) total += enemyPressure(run, B, e);
    return total;
  }

  EL.Logic = {
    CARD, CW, DIRS8, rngFrom, createRun, stats, genMap, nextNodes, genBattle,
    blockedSet, stepError, isWeakEntry, sealedBy, enemyAt, covers, isRock, idx, inB,
    simulate, commitRoute, enemyPhase, genRewards, applyReward, heal, reachable, weakEntries,
    condReq, condProgress, pressureOf, enemyPressure, has, coolCount, canMove, unstick,
  };
})(window.EL);
