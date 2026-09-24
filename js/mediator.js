/* EMBERLINE — Mediator: the single state machine that judges every input/UI
   event, drives game logic, and tells passive views what to show.
   Logic facts (events from EL.Logic) → Mediator → view commands/audio/camera. */
(function (EL) {
  "use strict";
  const U = EL.U, D = EL.Data, L = EL.Logic, V = EL.V, A = EL.Art, C = A.C, S = EL.Audio;
  const tc = V.tc;
  const feet = (t) => { const c = tc(t.x, t.y); return { x: c.x, y: c.y + 18 }; };
  const sameTile = (a, b) => a && b && a.x === b.x && a.y === b.y;

  class Mediator {
    constructor(v, camera) {
      this.v = v; this.cam = camera;
      this.state = null; this.run = null; this.B = null;
      this.busy = false; this.paused = false; this.helpReturn = null;
      this.enemyViews = {}; this.compViews = []; this.path = [];
      this.route = null; this.preview = null; this.chain = 0;
      this.toastTimer = null; this.quitArmed = false;
      this.record = this.loadRecord();
    }

    /* ---------- state machine core ---------- */
    go(name, arg) {
      const prev = STATES[this.state];
      if (prev && prev.exit) prev.exit.call(this, name);
      this.state = name;
      const s = STATES[name];
      if (s && s.enter) s.enter.call(this, arg);
    }
    dispatch(evt) {
      const t = evt.type, d = evt.data;
      if (t === "ui.press") { if (!this.busy) S.play("tap"); return; }
      if (this.busy) return;
      if (this.paused) return this.pauseHandle(evt);
      if (this.v.help.visible) return this.helpHandle(evt);
      if (t === "ui.click") {
        if (d.id === "pause") { if (["Map", "Battle.Idle", "Battle.Planned"].includes(this.state)) this.openPause(); return; }
        if (d.id === "relic") { this.toastRelic(d.relic); return; }
        if (d.id === "comp") { const c = evt.source.comp; if (c) this.toastComp(c); return; }
      }
      const s = STATES[this.state];
      if (s && s.on) s.on.call(this, evt);
    }

    /* ---------- shared helpers ---------- */
    hideToast() { clearTimeout(this.toastTimer); EL.tweens.kill(this.v.toast); this.v.toast.alpha = 0; }
    async wipe(fn, color) {
      this.busy = true;
      this.hideToast();
      const w = this.v.wipe;
      w.color = color || "#07050d";
      S.play("whoosh");
      await EL.tween(w, { p: 1 }, 320, { clock: "ui", ease: U.ease.inQuad });
      await fn();
      await EL.wait(80, "ui");
      await EL.tween(w, { p: 0 }, 360, { clock: "ui", ease: U.ease.outQuad });
      this.busy = false;
    }
    showOnly(names) {
      const v = this.v;
      if (names.length) this.hideToast();
      for (const k of ["title", "charSelect", "reward", "choice", "pause", "help", "result"]) v[k].visible = names.includes(k);
    }
    setHud(mode) {
      const v = this.v;
      const battle = mode === "battle", map = mode === "map";
      v.hudLayer.visible = battle || map;
      v.moveHUD.visible = v.pressureHUD.visible = battle;
      v.companionHUD.visible = battle;
      v.pauseBtn.visible = battle || map;
      v.turnHUD.showTurn = battle;
      v.hint.visible = battle;
      v.battleWorld.visible = battle;
      v.mapView.visible = map;
    }
    hint(text) { this.v.hint.text = text; this.v.hint.t = 0; }
    toast(title, body, icon, ms) {
      const t = this.v.toast;
      t.title = title; t.body = body; t.icon = icon || null;
      EL.tweens.kill(t);
      t.alpha = 0; t.y = 400;
      EL.tween(t, { alpha: 1, y: 386 }, 160, { clock: "ui" });
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => EL.tween(t, { alpha: 0 }, 250, { clock: "ui" }), ms || 2400);
    }
    toastRelic(id) { const r = D.RELICS[id]; S.play("hover"); this.toast(r.name, r.desc, r.icon); }
    toastComp(id) {
      const c = D.COMPANIONS[id]; S.play("hover");
      this.toast(`${c.name}「${c.skill}」`, `条件：${c.condLong}\n効果：${c.skillText}`, null, 3200);
    }
    refreshRunHud() {
      const v = this.v, run = this.run;
      const h = D.HEROES[run.heroId];
      v.playerHUD.sprite = h.sprite; v.playerHUD.name = `${h.name}`;
      v.playerHUD.hp = run.hp; v.playerHUD.maxHp = run.maxHp; v.playerHUD.prev = null;
      v.relicHUD.setRelics(run.relics);
      v.companionHUD.cards.forEach((c, i) => {
        c.comp = run.companions[i] || null; c.cur = 0; c.ready = false; c.used = 0;
        c.maxUses = L.has(run, "twin") ? 2 : 1;
        if (c.comp) c.need = L.condProgress(run, c.comp, this.emptyT()).need;
      });
    }
    emptyT() { return { dirs: [], kills: 0, dmgTaken: 0, weakHits: 0, route: [{ x: 0, y: 0 }], marks: {}, uses: {} }; }
    floorText() {
      if (!this.run.nodeId) return "入口";
      const n = this.run.map.nodes[this.run.nodeId];
      return n.type === "boss" ? "最深部" : `第${n.row + 1}層`;
    }
    loadRecord() { try { return JSON.parse(localStorage.getItem("emberline.record") || "{}"); } catch (_) { return {}; } }
    saveRecord() { try { localStorage.setItem("emberline.record", JSON.stringify(this.record)); } catch (_) {} }

    /* ---------- pause / help ---------- */
    openPause() {
      this.paused = true; EL.Time.paused = true; this.quitArmed = false;
      const p = this.v.pause;
      p.quit.label = "ランをあきらめる";
      p.bgm.label = "BGM：" + (S.settings.bgm ? "ON" : "OFF");
      p.sfx.label = "効果音：" + (S.settings.sfx ? "ON" : "OFF");
      p.visible = true; p.alpha = 0;
      EL.tween(p, { alpha: 1 }, 160, { clock: "ui" });
    }
    closePause() { this.paused = false; EL.Time.paused = false; this.v.pause.visible = false; }
    pauseHandle(evt) {
      if (this.v.help.visible) return this.helpHandle(evt);
      if (evt.type !== "ui.click") return;
      const p = this.v.pause;
      switch (evt.data.id) {
        case "pause.resume": this.closePause(); break;
        case "pause.bgm": S.setBgm(!S.settings.bgm); p.bgm.label = "BGM：" + (S.settings.bgm ? "ON" : "OFF"); break;
        case "pause.sfx": S.setSfx(!S.settings.sfx); p.sfx.label = "効果音：" + (S.settings.sfx ? "ON" : "OFF"); break;
        case "pause.help": this.openHelp(); break;
        case "pause.quit":
          if (!this.quitArmed) { this.quitArmed = true; p.quit.label = "本当に？（もう一度）"; break; }
          this.closePause();
          this.wipe(async () => { this.go("Title"); });
          break;
      }
    }
    openHelp() { const h = this.v.help; h.page = 0; h.visible = true; h.alpha = 0; this.syncHelp(); EL.tween(h, { alpha: 1 }, 160, { clock: "ui" }); }
    syncHelp() { const h = this.v.help; h.prev.disabled = h.page === 0; h.next.disabled = h.page === h.pages.length - 1; }
    helpHandle(evt) {
      if (evt.type !== "ui.click") return;
      const h = this.v.help;
      if (evt.data.id === "help.prev") { h.page = Math.max(0, h.page - 1); h.t = 0; }
      if (evt.data.id === "help.next") { h.page = Math.min(h.pages.length - 1, h.page + 1); h.t = 0; }
      if (evt.data.id === "help.close") { h.visible = false; }
      this.syncHelp();
    }

    /* ================= battle presentation ================= */
    setupBattle() {
      const v = this.v, B = this.B, run = this.run;
      v.board.tiles = B.tiles;
      v.footprints.trail = B.trail.map((t) => ({ x: t.x, y: t.y }));
      v.footprints.births.clear(); v.footprints.ashes = [];
      v.route.pts = []; v.route.skillMarks = []; v.route.areas = [];
      v.enemies.clear(); this.enemyViews = {};
      for (const e of B.enemies) this.addEnemyView(e);
      this.refreshEnemyStatics();
      v.units.clear();
      this.path = B.trail.map((t) => ({ x: t.x, y: t.y }));
      this.compViews = run.companions.map((c, i) => {
        const u = v.units.add(new V.UnitView("Companion:" + c, D.COMPANIONS[c].sprite));
        const p = feet(B.hero);
        u.x = p.x - 10 - i * 6; u.y = p.y - 2; u.t = i * 300;
        return u;
      });
      const hero = (v.hero = v.units.add(new V.UnitView("Player", D.HEROES[run.heroId].sprite)));
      hero.lantern = true;
      const p = feet(B.hero);
      hero.x = p.x; hero.y = p.y;
      v.fx.ps = []; v.fx.prims = [];
      v.combo.chain = 0; v.combo.alpha = 0;
      v.turnHUD.turn = B.turn; v.turnHUD.floor = this.floorText();
      this.coolPreview();
    }
    addEnemyView(e) {
      const ev = this.v.enemies.add(new V.EnemyView(e));
      ev.flip = e.weak === "L";
      this.enemyViews[e.uid] = ev;
      return ev;
    }
    refreshEnemyStatics() {
      const B = this.B;
      for (const e of B.enemies) {
        const ev = this.enemyViews[e.uid];
        if (!ev) continue;
        ev.sealed = L.sealedBy(B.enemies, e);
        ev.weak = e.weak; ev.hp = e.hp; ev.phase2 = e.boss && B.phase2;
        ev.pressure = L.enemyPressure(this.run, B, e);
        ev.flip = e.weak === "L";
      }
    }
    /* tiles that will cool at the end of this turn if no more are added */
    coolPreview(extra) {
      const S0 = L.stats(this.run);
      const n = this.v.footprints.trail.length + (extra || 0);
      this.v.footprints.cool = Math.max(0, n - S0.trail);
    }
    clearTargets() {
      for (const k in this.enemyViews) {
        const ev = this.enemyViews[k];
        ev.target = false; ev.kill = false; ev.dmg = null; ev.counter = null; ev.blocked = false; ev.dmgWeak = false;
      }
    }
    resetTurnHud() {
      const v = this.v, run = this.run, B = this.B;
      const S0 = L.stats(run);
      v.moveHUD.moves = S0.mov; v.moveHUD.max = S0.mov; v.moveHUD.prev = null;
      v.pressureHUD.value = L.pressureOf(run, B, B.enemies); v.pressureHUD.prev = null;
      v.playerHUD.hp = run.hp; v.playerHUD.maxHp = run.maxHp; v.playerHUD.prev = null;
      v.companionHUD.cards.forEach((c) => {
        c.ready = false; c.used = 0; c.near = false;
        if (c.comp) { const pr = L.condProgress(run, c.comp, this.emptyT()); c.cur = 0; c.need = pr.need; }
      });
    }

    /* ---------- route drawing ---------- */
    beginRoute() {
      this.route = [{ x: this.B.hero.x, y: this.B.hero.y }];
      this.lastKills = 0; this.lastSkills = 0; this.lastAttacks = 0;
      this.updatePreview(true);
    }
    tryExtend(tile) {
      const B = this.B, run = this.run;
      const r = this.route;
      const lastT = r[r.length - 1];
      if (sameTile(tile, lastT)) return;
      const back = r.findIndex((t) => sameTile(t, tile));
      if (back >= 0) {
        this.route = r.slice(0, back + 1);
        S.play("stepBack");
        this.updatePreview();
        return;
      }
      // walk toward the finger one tile at a time (handles fast swipes)
      let added = 0, err = "";
      for (let guard = 0; guard < 12; guard++) {
        const cur = this.route[this.route.length - 1];
        if (sameTile(cur, tile)) break;
        if (this.preview && this.preview.outcome !== "ok") { err = "done"; break; }
        const next = { x: cur.x + U.sign(tile.x - cur.x), y: cur.y + U.sign(tile.y - cur.y) };
        const moves = this.preview ? this.preview.T.moves : L.stats(run).mov;
        err = L.stepError(B, L.blockedSet(B, this.route), moves, cur, next);
        if (err) break;
        this.route.push(next);
        added++;
        this.preview = L.simulate(B, run, this.route);
      }
      if (added) { S.play("step", this.route.length - 1); this.updatePreview(); }
      if (err && err !== "done" && err !== "far") {
        const cur = this.route[this.route.length - 1];
        const nx = { x: cur.x + U.sign(tile.x - cur.x), y: cur.y + U.sign(tile.y - cur.y) };
        if (!this.lastBad || !sameTile(this.lastBad, nx) || EL.Time.ui - this.lastBadT > 400) {
          this.v.route.bad = { x: nx.x, y: nx.y, t: this.v.route.t };
          this.lastBad = nx; this.lastBadT = EL.Time.ui;
          S.play("invalid");
          if (err === "moves") this.hint("移動力が足りない — 撃破で回復する");
          else if (err === "ember") this.hint("燃えている足跡には入れない（斜めの交差はOK）");
        }
      }
    }
    updatePreview(first) {
      const B = this.B, run = this.run, v = this.v;
      const res = (this.preview = L.simulate(B, run, this.route));
      const rt = v.route;
      rt.pts = this.route.slice(); rt.consumed = 0;
      rt.endMoves = res.T.moves; rt.endOk = !res.endBlocked; rt.dead = res.outcome === "dead";
      // enemies: predicted damage / kills / counters
      this.clearTargets();
      const alivePred = {};
      for (const e of res.st.enemies) alivePred[e.uid] = e;
      let kills = 0, attacks = 0, skills = 0;
      for (const e of B.enemies) {
        const ev = this.enemyViews[e.uid], p = alivePred[e.uid];
        if (!ev || !p) continue;
        const dmg = e.hp - Math.max(0, p.hp);
        if (dmg > 0 || !p.alive) { ev.target = true; ev.dmg = dmg; ev.kill = !p.alive; ev.refund = !p.alive ? L.stats(run).refund : 0; }
        if (!p.alive) kills++;
      }
      rt.skillMarks = []; rt.areas = [];
      for (const st of res.steps) {
        if (st.attack) {
          attacks++;
          const ev = this.enemyViews[st.attack.uid];
          if (ev) {
            ev.dmgWeak = ev.dmgWeak || st.attack.weak;
            if (st.attack.counter) ev.counter = (ev.counter || 0) + st.attack.counter;
            if (st.attack.blocked) ev.blocked = true;
          }
        }
        for (const sk of st.skills) {
          skills++;
          rt.skillMarks.push({ x: st.tile.x, y: st.tile.y, comp: sk.comp, color: D.COMPANIONS[sk.comp].color, k: skills });
          if (sk.effect === "burst") rt.areas.push({ kind: "burst", tiles: sk.data.area });
          if (sk.effect === "ring") rt.areas.push({ kind: "ring", poly: sk.data.poly });
          if (sk.effect === "pierce") rt.areas.push({ kind: "pierce", from: sk.data.from, to: sk.data.target ? this.enemyTile(sk.data.target) : { x: sk.data.to.x - sk.data.dir[0], y: sk.data.to.y - sk.data.dir[1] } });
        }
      }
      // HUD previews
      v.moveHUD.prev = res.T.moves;
      v.playerHUD.prev = res.T.hp !== run.hp ? res.T.hp : null;
      v.pressureHUD.prev = L.pressureOf(run, B, res.st.enemies);
      v.companionHUD.cards.forEach((c) => {
        if (!c.comp) return;
        const pr = L.condProgress(run, c.comp, res.T);
        const used = res.T.uses[c.comp] || 0;
        c.cur = used ? pr.need : pr.cur; c.need = pr.need;
        const wasReady = c.ready;
        c.ready = used > 0; c.near = !used && pr.cur >= pr.need - 1 && pr.cur > 0;
        if (c.ready && !wasReady) { c.bounce = 1; EL.tween(c, { bounce: 0 }, 300, { clock: "ui", ease: U.ease.outBack }); }
      });
      // reachable tiles & weak-side approach pads
      const blocked = L.blockedSet(B, this.route);
      const end = this.route[this.route.length - 1];
      v.board.reach = res.outcome === "ok" ? L.reachable(B, blocked, end, res.T.moves) : new Set();
      const pads = [];
      for (const e of res.st.enemies) {
        if (!e.alive || L.sealedBy(res.st.enemies, e)) continue;
        for (const t of L.weakEntries(B, res.st.enemies, e)) {
          if (!blocked.has(L.idx(B, t.x, t.y)) && !L.enemyAt(res.st.enemies, t.x, t.y)) pads.push(t);
        }
      }
      v.board.entries = pads;
      this.coolPreview(this.route.length - 1);
      // audio cues when the plan changes
      if (!first) {
        if (kills > this.lastKills) S.play("killPreview", kills);
        else if (attacks > this.lastAttacks) S.play("lock");
        if (skills > this.lastSkills) S.play("skillReady");
      }
      this.lastKills = kills; this.lastAttacks = attacks; this.lastSkills = skills;
      // contextual hint
      if (res.outcome === "dead") this.hint("このルートでは倒れる！");
      else if (res.endBlocked) this.hint("敵のマスでは止まれない");
      else if (res.outcome === "victory") this.hint("このルートで全滅できる！");
      else if (skills) this.hint("仲間の能力が発動する！");
      else if (kills) this.hint(`撃破で移動+${L.stats(run).refund} — まだ伸ばせる`);
      else if (this.route.length > 1) this.hint("指を離して、出撃ボタンで実行");
      else this.hint("光る側面からまっすぐ突っ込め");
    }
    enemyTile(uid) { const e = this.B.enemies.find((x) => x.uid === uid); return e ? { x: e.x, y: e.y } : { x: 0, y: 0 }; }
    setDragUI(on) {
      const v = this.v;
      EL.tween(v.board, { dim: on ? 1 : 0, entryEmph: on ? 1 : 0 }, 180, { clock: "ui" });
      for (const k in this.enemyViews) EL.tween(this.enemyViews[k], { emph: on ? 1 : 0 }, 180, { clock: "ui" });
      if (!on) {
        v.board.entries = []; v.board.reach = null;
        v.moveHUD.prev = null; v.pressureHUD.prev = null; v.playerHUD.prev = null;
        this.clearTargets();
      }
    }

    /* ---------- execution: replay logic events as choreography ---------- */
    async playRoute(route) {
      const B = this.B, run = this.run, v = this.v;
      const res = L.simulate(B, run, route);
      v.route.pts = route.slice(0, res.last + 1); v.route.consumed = 0; v.route.skillMarks = []; v.route.areas = [];
      this.clearTargets();
      v.companionHUD.cards.forEach((c) => { c.ready = false; c.near = false; });
      this.chain = 0;
      this.footN = 0;
      this.deadSet = new Set();
      const evs = res.events;
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i];
        const nextEv = evs[i + 1];
        const fn = this["ev_" + ev.type];
        if (fn) await fn.call(this, ev, nextEv);
      }
      v.route.pts = []; v.route.consumed = 0;
      return res;
    }
    unitTo(u, tile, dur, ease) {
      const p = feet(tile);
      if (p.x !== u.x) u.flip = p.x < u.x;
      return EL.tween(u, { x: p.x, y: p.y }, dur, { ease: ease || U.ease.outQuad });
    }
    async ev_step(ev, next) {
      const v = this.v;
      const into = next && next.type === "attack";
      const dur = into ? 80 : U.clamp(118 - this.chain * 8, 64, 118);
      v.footprints.trail.push({ x: ev.to.x, y: ev.to.y });
      v.footprints.births.set(ev.to.x + "," + ev.to.y, v.footprints.t);
      this.coolPreview();
      this.path.push({ x: ev.to.x, y: ev.to.y });
      v.route.consumed = ev.i;
      v.moveHUD.moves = ev.moves;
      const from = feet(ev.from);
      v.fx.burst(from.x, from.y - 2, 4, { speed: [10, 40], life: [200, 400], palette: ["#6e3a2a", "#8a5a40"], size: 2, angle: -Math.PI / 2, spread: 2 });
      S.play(into ? "dash" : "foot", this.footN++);
      const hero = v.hero;
      v.fx.ghost(hero.sprite, hero.x, hero.y, hero.flip);
      if (this.chain >= 2) v.fx.ghost(hero.sprite, (hero.x + feet(ev.to).x) / 2, (hero.y + feet(ev.to).y) / 2, hero.flip);
      hero.hop = 4; EL.tween(hero, { hop: 0 }, dur, { ease: U.ease.outQuad });
      const tweens = [this.unitTo(hero, ev.to, dur, into ? U.ease.inQuad : U.ease.outQuad)];
      const spots = this.companionSpots(ev.to);
      this.compViews.forEach((u, i) => { if (spots[i]) tweens.push(this.unitTo(u, spots[i], dur)); });
      await Promise.all(tweens);
    }
    async ev_attack(ev) {
      const v = this.v, evw = this.enemyViews[ev.uid];
      if (!evw) return;
      const r = evw.rect();
      const cx = r.x + r.s / 2, cy = r.y + r.s / 2;
      const hitPoint = ev.tile ? tc(ev.tile.x, ev.tile.y) : { x: cx, y: cy };
      const hx = hitPoint.x, hy = hitPoint.y;
      v.fx.slash(hx, hy, ev.dir, ev.weak ? C.emberL : C.cream, ev.weak);
      evw.flash = 1; EL.tween(evw, { flash: 0 }, 200);
      evw.ox = U.sign(ev.dir[0]) * 8; evw.oy = U.sign(ev.dir[1]) * 8;
      EL.tween(evw, { ox: 0, oy: 0 }, 220, { ease: U.ease.outBack });
      evw.hp = ev.hp;
      const ang = Math.atan2(ev.dir[1], ev.dir[0]);
      v.fx.burst(hx, hy, ev.weak ? 22 : 10, { angle: ang, spread: 1.6, speed: [80, 260], life: [150, 380], palette: ev.weak ? ["#fff6df", "#ffd35a", "#ffb020", "#ff8a2a"] : ["#fff6df", "#d3dbea", "#ffd35a"], sizes: [2, 4], drag: 0.08 });
      if (ev.weak) {
        v.floats.spawn(ev.dmg, hx, hy - 30, { s: 4, color: C.weak, grad: "#ffffff", life: 900, vy: -80 });
        v.floats.spawn(ev.forced ? "WEAK!!" : "WEAK!", hx, hy - 58, { s: 2, color: C.emberL, life: 800, vy: -50 });
        // shield shards fly off the open flank
        v.fx.burst(hx - ev.dir[0] * 16, hy - ev.dir[1] * 16, 12, { angle: ang + Math.PI, spread: 2.2, speed: [60, 180], life: [300, 600], palette: ["#7c86a3", "#d3dbea", "#3b3350"], size: 4, ay: 300 });
        v.vignette.orange = 0.22; EL.tween(v.vignette, { orange: 0 }, 220, { clock: "ui" });
        S.play("weak");
        if (Math.random() < 0.5) S.voice(this.run.heroId);
        EL.hitstop(115);
        this.cam.shake(6, 220);
      } else {
        v.floats.spawn(ev.dmg, hx, hy - 30, { s: 3, color: C.cream, life: 750 });
        if (ev.sealed) v.floats.spawn("封印", hx, hy - 54, { kind: "jp", color: "#c9b3ff", life: 700, vy: -30 });
        if (ev.bonus) v.floats.spawn("+" + ev.bonus, hx + 22, hy - 44, { s: 2, color: C.move, life: 600, vy: -40 });
        S.play("slash");
        EL.hitstop(55);
        this.cam.shake(3, 140);
      }
      await EL.wait(ev.weak ? 110 : 70);
    }
    async ev_counter(ev) {
      const v = this.v, evw = this.enemyViews[ev.uid];
      if (evw) {
        const dx = U.sign(v.hero.x - (evw.rect().x + 24)), dy = U.sign(v.hero.y - 18 - (evw.rect().y + 24));
        evw.ox = dx * 12; evw.oy = dy * 12;
        EL.tween(evw, { ox: 0, oy: 0 }, 200, { ease: U.ease.outQuad });
      }
      await EL.wait(60);
      const h = v.hero;
      h.red = 1; EL.tween(h, { red: 0 }, 260);
      h.ox = -6; EL.tween(h, { ox: 0 }, 220, { ease: U.ease.outElastic });
      v.floats.spawn("-" + ev.dmg, h.x, h.y - 50, { s: 3, color: "#ff4d5e", life: 800 });
      v.fx.burst(h.x, h.y - 16, 10, { speed: [60, 180], life: [200, 400], palette: ["#ff4d5e", "#ff8f9b", "#8f2231"], size: 2 });
      v.playerHUD.hp = ev.hp; v.playerHUD.shake = 3; v.playerHUD.flash = 0.6;
      EL.tween(v.playerHUD, { shake: 0, flash: 0 }, 300, { clock: "ui" });
      v.vignette.red = 0.6; EL.tween(v.vignette, { red: 0 }, 380, { clock: "ui" });
      S.play("counter"); S.voice(this.run.heroId, "hurt");
      EL.hitstop(70);
      this.cam.shake(5, 200);
      await EL.wait(150);
    }
    async ev_counterBlocked(ev) {
      const v = this.v, h = v.hero;
      h.shield = 1; EL.tween(h, { shield: 0 }, 380);
      v.floats.spawn("BLOCK", h.x, h.y - 52, { s: 2, color: C.move, life: 700 });
      S.play("block");
      await EL.wait(110);
    }
    async ev_kill(ev) {
      const v = this.v, evw = this.enemyViews[ev.uid];
      if (!evw) return;
      const r = evw.rect();
      const cx = r.x + r.s / 2, bottom = r.y + r.s - 6;
      const scorch = ev.src === "scorch";
      if (!scorch) { this.chain = ev.chain; v.combo.chain = ev.chain; v.combo.t = 0; v.combo.alpha = 1; EL.tweens.kill(v.combo); }
      evw.flash = 1;
      await EL.wait(40);
      evw.dead = true;
      v.fx.shatter(evw.sprite, cx, bottom, evw.boss ? 3 : 2, evw.flip);
      v.fx.ring(cx, r.y + r.s / 2, evw.boss ? 70 : 34, C.emberL, 420, 4);
      v.fx.burst(cx, r.y + r.s / 2, 14, { speed: [40, 160], life: [300, 700], palette: [C.ember, C.emberL, "#c24a12"], size: 2, ay: -60 });
      v.fx.tileFlash(evw.tx, evw.ty, "rgba(255,211,90,0.5)", 260);
      const c = Math.max(1, ev.chain || 1);
      S.play("kill", c);
      if (c >= 2 && Math.random() < 0.45) S.voice(this.run.heroId, c >= 3 ? "cheer" : null);
      S.groan();
      EL.hitstop(80 + Math.min(5, c) * 14);
      this.cam.shake(3 + Math.min(6, c), 200 + c * 30);
      if (c >= 3) { v.vignette.white = 0.22; EL.tween(v.vignette, { white: 0 }, 200, { clock: "ui" }); }
      if (ev.refund > 0) {
        v.floats.spawn("+" + ev.refund + " MOVE", cx, r.y + r.s + 4, { s: 2, color: C.heal, life: 900, vy: -24 });
        this.flyOrb(cx, r.y + r.s / 2, ev.moves);
      }
      v.pressureHUD.value = L.pressureOf(this.run, this.B, this.aliveAfterKill(ev.uid));
      if (!scorch) EL.tween(v.combo, { alpha: 0 }, 400, { delay: 1600, clock: "ui" });
      await EL.wait(c >= 3 ? 150 : 100);
    }
    aliveAfterKill(uid) {
      this.deadSet = this.deadSet || new Set();
      this.deadSet.add(uid);
      return this.B.enemies.map((e) => Object.assign({}, e, { alive: !this.deadSet.has(e.uid) }));
    }
    flyOrb(x, y, moves) {
      const v = this.v;
      const orb = v.orbs.add(new EL.Node("RefundOrb"));
      orb.x = x; orb.y = y; orb.k = 0;
      const tx = v.moveHUD.x + 62, ty = v.moveHUD.y + 22;
      const sx = x, sy = y, mx = (x + tx) / 2 + U.rand(-40, 40), my = Math.min(y, ty) - 80;
      orb.draw = (ctx) => {
        const f = Math.floor(EL.Time.ui / 60) % 2;
        ctx.fillStyle = C.ink; ctx.fillRect(-5, -5, 10, 10);
        ctx.fillStyle = f ? C.heal : "#e8ffd9"; ctx.fillRect(-3, -3, 6, 6);
      };
      EL.tween(orb, { k: 1 }, 380, {
        clock: "ui", ease: U.ease.inQuad,
        onUpdate: (e) => {
          const k = e;
          orb.x = (1 - k) * (1 - k) * sx + 2 * (1 - k) * k * mx + k * k * tx;
          orb.y = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * my + k * k * ty;
          if (Math.random() < 0.6) v.hudFx.add({ x: orb.x, y: orb.y, vx: 0, vy: 10, life: 260, size: 2, color: C.heal });
        },
      }).then(() => {
        v.orbs.remove(orb);
        v.moveHUD.pulse = 1; v.moveHUD.gain = 0.5;
        EL.tween(v.moveHUD, { pulse: 0, gain: 0 }, 260, { clock: "ui" });
        v.hudFx.burst(tx, ty, 10, { speed: [40, 120], life: [200, 400], palette: [C.heal, "#e8ffd9"], size: 2 });
        S.play("refund", Math.min(8, this.chain));
      });
    }
    async ev_skill(ev) {
      const v = this.v, info = D.COMPANIONS[ev.comp];
      const ci = this.run.companions.indexOf(ev.comp);
      const cu = this.compViews[ci];
      const card = v.companionHUD.cards[ci];
      if (card) { card.used++; card.ready = false; card.bounce = 1; EL.tween(card, { bounce: 0 }, 300, { clock: "ui" }); }
      // cut-in (world holds its breath)
      const ci2 = v.cutin;
      ci2.comp = ev.comp; ci2.p = 0; ci2.alpha = 1;
      EL.hitstop(760);
      S.play("skill"); S.voice(ev.comp, "cheer");
      if (cu) { cu.hop = 10; EL.tween(cu, { hop: 0 }, 300, { clock: "ui", ease: U.ease.outBack }); cu.flash = 1; EL.tween(cu, { flash: 0 }, 300, { clock: "ui" }); }
      await EL.tween(ci2, { p: 1 }, 220, { clock: "ui", ease: U.ease.outCubic });
      await EL.wait(380, "ui");
      await EL.tween(ci2, { alpha: 0 }, 160, { clock: "ui" });
      ci2.comp = null;
      const hero = v.hero;
      const here = tc(this.path[this.path.length - 1].x, this.path[this.path.length - 1].y);
      switch (ev.effect) {
        case "pierce": {
          const to = ev.data.target ? this.enemyTile(ev.data.target) : { x: ev.data.to.x - ev.data.dir[0], y: ev.data.to.y - ev.data.dir[1] };
          const b = tc(to.x, to.y);
          v.fx.beam(here.x, here.y, b.x, b.y, C.emberL, 360);
          v.fx.burst(b.x, b.y, 16, { speed: [60, 200], life: [200, 400], palette: [C.emberL, C.cream], size: 2 });
          S.play("beam"); this.cam.shake(4, 160);
          break;
        }
        case "burst": {
          const c = tc(ev.data.center.x, ev.data.center.y);
          for (const t of ev.data.area) if (t.x >= 0 && t.y >= 0 && t.x < 7 && t.y < 8) v.fx.tileFlash(t.x, t.y, "rgba(255,138,42,0.55)", 420);
          v.fx.ring(c.x, c.y, 80, C.ember, 460, 4);
          v.fx.ring(c.x, c.y, 50, C.emberL, 360, 4);
          v.fx.burst(c.x, c.y, 40, { speed: [60, 240], life: [300, 700], palette: [C.ember, C.emberL, "#ff4d5e", C.cream], sizes: [2, 4], ay: -120 });
          S.play("fire"); this.cam.shake(7, 260);
          break;
        }
        case "haste": {
          v.fx.burst(hero.x, hero.y - 16, 16, { speed: [40, 120], life: [300, 600], palette: [C.move, C.cream, "#d3dbea"], size: 2, shape: "plus" });
          v.floats.spawn("+" + ev.data.amount + " MOVE", hero.x, hero.y - 56, { s: 2, color: C.heal, life: 900 });
          if (ev.moves != null) v.moveHUD.moves = ev.moves;
          v.moveHUD.pulse = 1; EL.tween(v.moveHUD, { pulse: 0 }, 300, { clock: "ui" });
          S.play("gear");
          break;
        }
        case "volley": {
          const src = cu ? { x: cu.x, y: cu.y - 20 } : here;
          for (const uid of ev.data.targets || []) {
            const evw = this.enemyViews[uid];
            if (!evw) continue;
            const r = evw.rect();
            v.fx.beam(src.x, src.y, r.x + r.s / 2, r.y + r.s / 2, C.heal, 260);
            S.play("arrow");
            await EL.wait(90);
          }
          break;
        }
        case "guard": hero.shield = 1; EL.tween(hero, { shield: 0.35 }, 500); S.play("block"); break;
        case "shadow": hero.aura = 1; hero.auraColor = "#b08cff"; v.floats.spawn("SHADOW", hero.x, hero.y - 56, { s: 2, color: "#c9b3ff", life: 900 }); S.play("shadow"); break;
        case "ring": {
          const poly = ev.data.poly;
          for (let k = 0; k < poly.length; k++) {
            const a = tc(poly[k].x, poly[k].y), b = tc(poly[(k + 1) % poly.length].x, poly[(k + 1) % poly.length].y);
            v.fx.beam(a.x, a.y, b.x, b.y, C.move, 520);
          }
          const cx = poly.reduce((s, t) => s + tc(t.x, t.y).x, 0) / poly.length, cy = poly.reduce((s, t) => s + tc(t.x, t.y).y, 0) / poly.length;
          v.fx.ring(cx, cy, 70, C.move, 520, 4);
          S.play("beam"); S.play("chime"); this.cam.shake(5, 220);
          break;
        }
      }
      await EL.wait(200);
    }
    async ev_skillHit(ev) {
      const v = this.v, evw = this.enemyViews[ev.uid];
      if (!evw) return;
      const r = evw.rect();
      const cx = r.x + r.s / 2, cy = r.y + r.s / 2;
      evw.flash = 1; EL.tween(evw, { flash: 0 }, 200);
      evw.hp = ev.hp;
      const col = D.COMPANIONS[ev.comp] ? D.COMPANIONS[ev.comp].color : C.cream;
      v.floats.spawn(ev.dmg, cx, cy - 30, { s: 3, color: col, life: 750 });
      v.fx.burst(cx, cy, 10, { speed: [60, 180], life: [200, 380], palette: [col, C.cream], size: 2 });
      S.play("slash");
      EL.hitstop(45);
      await EL.wait(80);
    }
    async ev_heal(ev) {
      const v = this.v, h = v.hero;
      v.floats.spawn("+" + ev.amount, h.x, h.y - 50, { s: 3, color: C.heal, life: 800 });
      v.fx.burst(h.x, h.y - 16, 12, { speed: [20, 80], life: [300, 600], palette: [C.heal, "#e8ffd9"], size: 2, ay: -80, shape: "plus" });
      v.playerHUD.hp = ev.hp;
      S.play("heal");
      await EL.wait(120);
    }
    async ev_revive(ev) {
      const v = this.v, h = v.hero;
      v.vignette.white = 0.7; EL.tween(v.vignette, { white: 0 }, 600, { clock: "ui" });
      v.floats.spawn("REVIVE", h.x, h.y - 60, { s: 3, color: C.emberL, life: 1200 });
      v.playerHUD.hp = ev.hp;
      S.play("relic"); v.relicHUD.fresh = "plume";
      await EL.wait(500);
    }
    async ev_relic(ev) {
      const v = this.v, h = v.hero;
      v.floats.spawn("+2 MOVE", h.x, h.y - 56, { s: 2, color: C.heal, life: 800 });
      v.moveHUD.moves = ev.moves;
      v.relicHUD.fresh = ev.id; setTimeout(() => (v.relicHUD.fresh = null), 900);
      S.play("refund", 4);
      await EL.wait(120);
    }
    async ev_bossPhase(ev) {
      const v = this.v, evw = this.enemyViews[ev.uid];
      EL.hitstop(900);
      S.play("phase");
      this.cam.shake(8, 900);
      if (evw) { evw.phase2 = true; evw.flash = 1; EL.tween(evw, { flash: 0 }, 800, { clock: "ui" }); }
      v.bg.pulse = 1; EL.tween(v.bg, { pulse: 0.4 }, 900, { clock: "ui" });
      await this.banner("ARMOR", "灰冠が覚醒した — 弱点以外の攻撃は半減", "#ff8a2a", 1300);
    }
    async ev_victory() { await EL.wait(60); }
    async ev_heroDown() { await EL.wait(60); }

    async banner(text, sub, color, hold) {
      const b = this.v.banner;
      b.text = text; b.sub = sub || ""; b.color = color || C.emberL; b.band = 0; b.alpha = 1; b.tx = -300;
      await Promise.all([EL.tween(b, { band: 1 }, 180, { clock: "ui" }), EL.tween(b, { tx: 0 }, 260, { clock: "ui", ease: U.ease.outBack })]);
      await EL.wait(hold || 600, "ui");
      await Promise.all([EL.tween(b, { tx: 300 }, 200, { clock: "ui", ease: U.ease.inQuad }), EL.tween(b, { alpha: 0 }, 220, { clock: "ui" })]);
    }

    /* ---------- enemy phase choreography ---------- */
    async playEnemyPhase(events) {
      const v = this.v;
      let pending = [];
      for (const ev of events) {
        switch (ev.type) {
          case "scorch": {
            const evw = this.enemyViews[ev.uid];
            if (!evw) break;
            const r = evw.rect();
            v.fx.burst(r.x + r.s / 2, r.y + r.s - 8, 14, { speed: [20, 90], life: [300, 600], palette: [C.ember, C.emberL], size: 2, ay: -160 });
            evw.hp = ev.hp; evw.flash = 1; EL.tween(evw, { flash: 0 }, 200);
            v.floats.spawn(ev.dmg, r.x + r.s / 2, r.y - 4, { s: 2, color: C.ember });
            S.play("fire");
            await EL.wait(160);
            break;
          }
          case "kill": await this.ev_kill(ev); break;
          case "victory": return "victory";
          case "cool": {
            const n = ev.tiles.length;
            const tr = v.footprints.trail;
            for (let k = 0; k < n; k++) {
              const t = tr[k];
              if (t) { v.footprints.ashes.push({ x: t.x, y: t.y, t: -k * 40 }); const c = tc(t.x, t.y); v.fx.burst(c.x, c.y, 3, { speed: [5, 25], life: [400, 800], palette: ["#8a7f86", "#5c5058"], size: 2, angle: -Math.PI / 2, spread: 1, ay: -30 }); }
            }
            v.footprints.trail = tr.slice(n);
            this.coolPreview();
            S.play("cool");
            await EL.wait(360);
            break;
          }
          case "pressure": {
            const evw = this.enemyViews[ev.uid];
            if (!evw) break;
            const r = evw.rect();
            const sx = r.x + r.s / 2, sy = r.y + r.s / 2;
            evw.oy = -6; EL.tween(evw, { oy: 0 }, 220, { ease: U.ease.outBack });
            const h = v.hero;
            const dist = Math.hypot(h.x - sx, h.y - 16 - sy);
            const sp = 520;
            v.fx.add({ x: sx, y: sy, vx: ((h.x - sx) / dist) * sp, vy: ((h.y - 16 - sy) / dist) * sp, life: (dist / sp) * 1000, size: 6, colors: ["#e9dcff", "#b08cff", "#5c34b0"], shrink: false });
            for (let k = 0; k < 4; k++) v.fx.add({ x: sx, y: sy, vx: ((h.x - sx) / dist) * sp * 0.9, vy: ((h.y - 16 - sy) / dist) * sp * 0.9, life: (dist / sp) * 1000 * 1.05, size: 2, color: "#b08cff", delay: 0 });
            S.play("bolt");
            pending.push(ev);
            await EL.wait(110);
            break;
          }
          case "heroHit": {
            await EL.wait(260);
            const h = v.hero;
            h.red = 1; EL.tween(h, { red: 0 }, 400);
            h.ox = -8; EL.tween(h, { ox: 0 }, 300, { ease: U.ease.outElastic });
            if (ev.total > 0) v.floats.spawn("-" + ev.total, h.x, h.y - 56, { s: 4, color: "#ff4d5e", grad: "#ffb0b8", life: 1100 });
            if (ev.reduced) v.floats.spawn("余熱 -" + ev.reduced, h.x, h.y - 88, { kind: "jp", color: C.emberL, life: 1100, vy: -30 });
            v.fx.burst(h.x, h.y - 16, 20, { speed: [60, 200], life: [200, 500], palette: ["#b08cff", "#ff4d5e", "#5c34b0"], size: 2 });
            v.playerHUD.hp = ev.hp; v.playerHUD.shake = 4; v.playerHUD.flash = 0.7;
            EL.tween(v.playerHUD, { shake: 0, flash: 0 }, 400, { clock: "ui" });
            v.vignette.red = 1; EL.tween(v.vignette, { red: 0 }, 600, { clock: "ui" });
            v.bg.pulse = 1; EL.tween(v.bg, { pulse: this.B.isBoss && this.B.phase2 ? 0.4 : 0 }, 600, { clock: "ui" });
            if (ev.total > 0) { S.play("hurt"); S.voice(this.run.heroId, "hurt"); this.cam.shake(7, 320); EL.hitstop(90); }
            pending = [];
            await EL.wait(520);
            break;
          }
          case "revive": await this.ev_revive(ev); break;
          case "heroDown": return "dead";
          case "rotate": {
            const evw = this.enemyViews[ev.uid];
            if (!evw) break;
            evw.weak = ev.weak; evw.flip = ev.weak === "L"; evw.spin = 0;
            EL.tween(evw, { spin: 1 }, 320);
            S.play("rotate");
            await EL.wait(160);
            break;
          }
          case "summon": {
            const e = ev.enemy;
            const evw = this.addEnemyView(e);
            evw.alpha = 0; evw.oy = 10;
            const r = evw.rect();
            v.fx.ring(r.x + r.s / 2, r.y + r.s / 2, 30, "#b08cff", 500, 4);
            v.fx.burst(r.x + r.s / 2, r.y + r.s / 2, 16, { speed: [30, 90], life: [300, 600], palette: ["#b08cff", "#5c34b0", "#e9dcff"], size: 2, ay: -60 });
            EL.tween(evw, { alpha: 1, oy: 0 }, 360, { ease: U.ease.outBack });
            S.play("summon");
            await EL.wait(280);
            break;
          }
          case "turn": {
            v.turnHUD.turn = ev.turn;
            this.refreshEnemyStatics();
            S.play("turn");
            await this.banner("TURN " + ev.turn, "", C.gold, 380);
            break;
          }
        }
      }
      return "ok";
    }
  }

  /* ================= states ================= */
  const STATES = {
    Title: {
      enter() {
        const v = this.v;
        this.run = null; this.B = null;
        v.bg.theme = "title"; v.bg.pulse = 0;
        this.setHud("none");
        v.battleWorld.visible = false; v.mapView.visible = false; v.hudLayer.visible = false;
        this.showOnly(["title"]);
        const r = this.record;
        v.title.record = r.runs ? `挑戦 ${r.runs}回 ・ 踏破 ${r.wins || 0}回 ・ 最大連鎖 ${r.bestChain || 0}` : "";
        S.bgm("map");
      },
      on(evt) {
        if (evt.type !== "ui.click") return;
        if (evt.data.id === "title.start") { S.play("confirm"); this.wipe(async () => this.go("CharSelect")); }
        if (evt.data.id === "title.help") { S.play("confirm"); this.openHelp(); }
      },
    },

    CharSelect: {
      enter() {
        const v = this.v;
        this.showOnly(["charSelect"]);
        v.bg.theme = "map";
        v.charSelect.selected = null;
        v.charSelect.cards.forEach((c) => (c.selected = false));
        v.charSelect.confirm.disabled = true;
        this.setHud("none"); v.hudLayer.visible = false;
      },
      on(evt) {
        if (evt.type !== "ui.click") return;
        const v = this.v, d = evt.data;
        if (d.id === "char.pick") {
          v.charSelect.selected = d.hero;
          v.charSelect.cards.forEach((c) => (c.selected = c.hero === d.hero));
          v.charSelect.confirm.disabled = false;
          v.charSelect.confirm.glow = 1;
          S.play("pick"); S.voice(d.hero);
        }
        if (d.id === "char.back") this.wipe(async () => this.go("Title"));
        if (d.id === "char.confirm" && v.charSelect.selected) {
          S.play("confirm"); S.voice(v.charSelect.selected, "cheer");
          this.run = L.createRun(v.charSelect.selected);
          this.record.runs = (this.record.runs || 0) + 1; this.saveRecord();
          this.v.mapView.setMap(this.run.map);
          this.wipe(async () => this.go("Map", { first: true }));
        }
      },
    },

    Map: {
      enter(arg) {
        const v = this.v, run = this.run;
        this.showOnly([]);
        this.setHud("map");
        v.bg.theme = "map"; v.bg.pulse = 0;
        S.bgm("map");
        this.refreshRunHud();
        v.turnHUD.floor = this.floorText();
        const open = L.nextNodes(run);
        v.mapView.setState(run.visited, run.nodeId, open);
        v.mapView.heroSprite = D.HEROES[run.heroId].sprite;
        const cur = run.nodeId ? run.map.nodes[run.nodeId] : { x: 34, y: 606 };
        v.mapView.sub = arg && arg.first ? "光る場所をタップして進む" : "";
        v.mapView.marker = { x: cur.x, y: cur.y + 8 };
        const rowNext = open.length ? run.map.nodes[open[0]].row : 0;
        v.mapView.floorText = rowNext >= D.BAL.maxRows ? "最深部 — 灰冠の王が待つ" : `第${rowNext + 1}層 / ${D.BAL.maxRows}層`;
        this.hint(arg && arg.first ? "光る場所をタップして進む" : "次の行き先を選ぼう");
      },
      on(evt) {
        if (evt.type !== "ui.click" || evt.data.id !== "map.node") return;
        const open = L.nextNodes(this.run);
        if (!open.includes(evt.data.node)) { S.play("invalid"); return; }
        this.go("MapTravel", evt.data.node);
      },
    },

    MapTravel: {
      async enter(id) {
        const v = this.v, run = this.run;
        this.busy = true;
        const n = run.map.nodes[id];
        S.play("travel");
        await EL.tween(v.mapView.marker, { x: n.x, y: n.y + 8 }, 520, { clock: "ui", ease: U.ease.inOutSine });
        run.nodeId = id; run.visited.push(id);
        this.busy = false;
        switch (n.type) {
          case "battle": case "elite": this.go("BattleIntro", n); break;
          case "boss": this.go("BossIntro", n); break;
          case "treasure": this.go("Treasure"); break;
          case "rest": this.go("Rest"); break;
          case "event": this.go("Event"); break;
        }
      },
    },

    BattleIntro: {
      async enter(node) {
        const v = this.v, run = this.run;
        this.B = L.genBattle(run, node);
        this.deadSet = new Set();
        await this.wipe(async () => {
          this.showOnly([]);
          this.setHud("battle");
          v.bg.theme = node.type === "boss" ? "boss" : "battle";
          this.refreshRunHud();
          this.setupBattle();
          this.resetTurnHud();
          v.hint.text = "";
        }, node.type === "elite" ? "#1a0508" : "#07050d");
        if (node.type === "boss") S.bgm("boss"); else S.bgm("battle");
        if (node.type !== "boss") {
          const si = v.stageIntro;
          si.title = node.type === "elite" ? "強敵" : "戦闘";
          si.sub = `${this.floorText()} ・ 敵 ${this.B.enemies.length}体`;
          si.color = node.type === "elite" ? "#ff4d5e" : C.gold;
          si.icon = null;
          this.busy = true;
          await EL.tween(si, { alpha: 1 }, 200, { clock: "ui" });
          await EL.wait(700, "ui");
          await EL.tween(si, { alpha: 0 }, 200, { clock: "ui" });
          this.busy = false;
        }
        this.first = run.stats.turns === 0;
        this.go("Battle.Idle");
      },
    },

    BossIntro: {
      async enter(node) {
        const v = this.v;
        S.bgm(null);
        this.busy = true;
        await this.wipe(async () => { this.showOnly([]); v.hudLayer.visible = false; v.battleWorld.visible = false; v.mapView.visible = false; v.bg.theme = "boss"; }, "#000");
        this.busy = true;
        const bi = v.bossIntro;
        bi.alpha = 1; bi.bars = 0; bi.p = 0; bi.shake = 0;
        await EL.tween(bi, { bars: 1 }, 400, { clock: "ui" });
        S.play("roar");
        bi.shake = 6; this.cam.shake(8, 1200);
        await EL.tween(bi, { p: 1 }, 900, { clock: "ui", ease: U.ease.outCubic });
        EL.tween(bi, { shake: 0 }, 600, { clock: "ui" });
        await EL.wait(1100, "ui");
        await EL.tween(bi, { alpha: 0 }, 300, { clock: "ui" });
        this.busy = false;
        this.go("BattleIntro", node);
      },
    },

    "Battle.Idle": {
      enter() {
        const v = this.v, B = this.B, run = this.run;
        this.route = null; this.preview = null; this.tapTile = null;
        this.resetTurnHud();
        v.board.heroTile = { x: B.hero.x, y: B.hero.y };
        EL.tween(v.board, { heroHint: 1 }, 300, { clock: "ui" });
        v.hero.aura = 0; v.hero.shield = 0;
        this.coolPreview();
        v.route.pts = [];
        this.hint(this.first ? "主人公から指でなぞってルートを描こう" : `ルートを描いて切り抜けろ — 残り${B.enemies.length}体`);
        // stuck? (no legal first step)
        const blocked = L.blockedSet(B, [B.hero]);
        const any = L.DIRS8.some(([dx, dy]) => !L.stepError(B, blocked, 1, B.hero, { x: B.hero.x + dx, y: B.hero.y + dy }));
        if (!any) {
          this.busy = true;
          this.hint("動けない！ 足跡に囲まれた…");
          S.play("invalid");
          setTimeout(() => { this.busy = false; B.lastT = { moves: 0 }; this.go("Battle.EnemyPhase"); }, 1100);
        }
      },
      exit() { EL.tween(this.v.board, { heroHint: 0 }, 150, { clock: "ui" }); },
      on(evt) {
        if (evt.type !== "route.input") return;
        const d = evt.data, B = this.B;
        if (d.phase === "begin") {
          const hc = tc(B.hero.x, B.hero.y);
          const grabbed = (d.tile && sameTile(d.tile, B.hero)) || Math.hypot(d.px - hc.x, d.py - hc.y) < V.GEO.T * 0.85;
          if (grabbed) { this.go("Battle.Dragging"); return; }
          this.tapTile = d.tile;
        } else if (d.phase === "end") {
          if (this.tapTile && d.tile && sameTile(this.tapTile, d.tile)) {
            const e = L.enemyAt(B.enemies, d.tile.x, d.tile.y);
            if (e) {
              const info = D.ENEMIES[e.type];
              const wk = { U: "上", D: "下", L: "左", R: "右" }[e.weak];
              const sealed = L.sealedBy(B.enemies, e);
              this.toast(`${info.name}　HP${e.hp}/${e.maxHp}`, `反撃${e.atk}・圧${e.pressure}・弱点：${sealed ? "封印中" : wk + "側"}\n${info.desc}`);
            } else if (d.tile) {
              this.hint("主人公（光っているマス）からなぞって始める");
            }
          }
          this.tapTile = null;
        }
      },
    },

    "Battle.Dragging": {
      enter(resume) {
        const v = this.v;
        S.play("grab");
        this.showActions(false);
        v.hero.sq = 0.15; EL.tween(v.hero, { sq: 0 }, 200, { clock: "ui", ease: U.ease.outBack });
        this.setDragUI(true);
        if (resume) { this.route = resume.slice(); this.lastKills = 0; this.lastSkills = 0; this.lastAttacks = 0; this.updatePreview(true); }
        else this.beginRoute();
      },
      on(evt) {
        if (evt.type !== "route.input") return;
        const d = evt.data;
        if (d.phase === "move") {
          if (d.tile && d.near) this.tryExtend(d.tile);
        } else if (d.phase === "end") {
          this.finishRoute();
        } else if (d.phase === "cancel") {
          this.setDragUI(false);
          this.go("Battle.Idle");
        }
      },
    },

    /* the route is drawn but not launched: confirm, redo, or keep drawing from its tip */
    "Battle.Planned": {
      enter(route) {
        this.route = route;
        this.updatePreview(true);
        this.showActions(true);
        this.hint("");
      },
      exit() { this.showActions(false); },
      on(evt) {
        const d = evt.data;
        if (evt.type === "ui.click") {
          if (d.id === "route.go") { S.play("confirm"); this.go("Battle.Executing", this.route); }
          if (d.id === "route.redo") { S.play("cancel"); this.setDragUI(false); this.go("Battle.Idle"); }
          return;
        }
        if (evt.type !== "route.input" || d.phase !== "begin") return;
        const B = this.B, tip = this.route[this.route.length - 1];
        const near = (t) => { const c = tc(t.x, t.y); return Math.hypot(d.px - c.x, d.py - c.y) < V.GEO.T * 0.7; };
        if (near(tip)) this.go("Battle.Dragging", this.route);
        else if (near(B.hero)) this.go("Battle.Dragging");
      },
    },

    "Battle.Executing": {
      async enter(route) {
        const v = this.v;
        this.busy = true;
        this.setDragUI(false);
        this.hint("");
        const res = await this.playRoute(route);
        L.commitRoute(this.B, this.run, route, res);
        this.syncAfterRoute();
        this.busy = false;
        if (res.outcome === "victory") this.go("Battle.Victory");
        else if (res.outcome === "dead") this.go("Battle.Defeat");
        else this.go("Battle.EnemyPhase");
      },
    },

    "Battle.EnemyPhase": {
      async enter() {
        const v = this.v;
        this.busy = true;
        this.hint("夜の圧が迫る…");
        v.combo.alpha = 0;
        await EL.wait(200);
        const events = L.enemyPhase(this.B, this.run);
        const out = await this.playEnemyPhase(events);
        this.syncAfterEnemy();
        this.busy = false;
        if (out === "victory") this.go("Battle.Victory");
        else if (out === "dead") this.go("Battle.Defeat");
        else { this.first = false; this.go("Battle.Idle"); }
      },
    },

    "Battle.Victory": {
      async enter() {
        const v = this.v, run = this.run, B = this.B;
        this.busy = true;
        EL.Time.slow = 0.3;
        v.vignette.white = 0.4; EL.tween(v.vignette, { white: 0 }, 500, { clock: "ui" });
        await EL.wait(520, "ui");
        EL.Time.slow = 1;
        S.bgm(null);
        S.play("victory"); S.voice(run.heroId, "cheer");
        for (let i = 0; i < 3; i++) setTimeout(() => v.hudFx.burst(U.rand(60, 300), U.rand(200, 360), 24, { speed: [40, 200], life: [500, 1100], palette: [C.ember, C.emberL, C.cream, C.gold], sizes: [2, 4], ay: 120 }), i * 180);
        run.stats.battles++;
        await this.banner(B.isBoss ? "CONQUERED" : "VICTORY", B.isBoss ? "灰冠の王を討ち果たした" : `撃破！ ${B.turn}ターンで制圧`, C.gold, 900);
        if (!B.isBoss) {
          const healed = L.heal(run, D.BAL.healAfterBattle);
          if (healed) { v.floats.spawn("+" + healed, v.hero.x, v.hero.y - 50, { s: 3, color: C.heal }); v.playerHUD.hp = run.hp; S.play("heal"); await EL.wait(500); }
        }
        this.busy = false;
        if (B.isBoss) { this.wipe(async () => this.go("RunClear")); return; }
        const kind = B.kind === "elite" ? "elite" : "battle";
        this.go("Reward", { kind, title: kind === "elite" ? "強敵の戦利品" : "戦利品", sub: kind === "elite" ? "稀少なレリックが眠っている" : "仲間かレリックをひとつ" });
      },
    },

    "Battle.Defeat": {
      async enter() {
        const v = this.v;
        this.busy = true;
        S.bgm(null);
        EL.Time.slow = 0.25;
        v.hero.red = 1;
        await EL.tween(v.vignette, { dark: 0.55 }, 600, { clock: "ui" });
        EL.Time.slow = 1;
        S.play("defeat");
        await this.banner("DEFEAT", "燈が消えた…", "#ff8f9b", 1200);
        v.vignette.dark = 0;
        this.busy = false;
        this.wipe(async () => this.go("GameOver"), "#000");
      },
    },

    Reward: {
      enter(arg) {
        const v = this.v, run = this.run;
        this.rewardArg = arg;
        this.rewards = arg.list || L.genRewards(run, arg.kind);
        const rv = v.reward;
        rv.title = arg.title || "戦利品"; rv.sub = arg.sub || "";
        rv.setRewards(this.rewards);
        rv.confirm.disabled = true;
        rv.skip.visible = !arg.noSkip;
        rv.skip.label = arg.kind === "lost" ? "やめておく" : "見送る（HP+3）";
        this.showOnly(["reward"]);
        rv.alpha = 0;
        EL.tween(rv, { alpha: 1 }, 200, { clock: "ui" });
        rv.cards.forEach((c, i) => { c.flip = 0; EL.tween(c, { flip: 1 }, 420, { clock: "ui", delay: 180 + i * 140, ease: U.ease.inOutSine }); setTimeout(() => S.play("pick"), 380 + i * 140); });
        if (!rv.cards.length) { rv.confirm.disabled = true; rv.sub = "持っていけるものはなかった"; }
      },
      on(evt) {
        if (evt.type !== "ui.click") return;
        const v = this.v, rv = v.reward, d = evt.data, run = this.run;
        if (d.id === "reward.card") {
          rv.selected = d.index;
          rv.cards.forEach((c, i) => (c.selected = i === d.index));
          rv.confirm.disabled = false; rv.confirm.glow = 1;
          const r = this.rewards[d.index];
          if (r.kind === "comp") S.voice(r.id); else S.play("hover");
        }
        if (d.id === "reward.confirm" && rv.selected >= 0) {
          const r = this.rewards[rv.selected];
          L.applyReward(run, r);
          S.play("relic");
          if (r.kind === "comp") S.voice(r.id, "cheer");
          this.refreshRunHud();
          if (r.kind === "relic") { v.relicHUD.fresh = r.id; setTimeout(() => (v.relicHUD.fresh = null), 1500); }
          const txt = r.kind === "comp" ? `${D.COMPANIONS[r.id].name}が仲間になった` : `${D.RELICS[r.id].name}を手に入れた`;
          this.wipe(async () => { this.go("Map"); this.toast(txt, r.kind === "comp" ? "足跡が長く残るようになった" : D.RELICS[r.id].desc, r.kind === "relic" ? D.RELICS[r.id].icon : null); });
        }
        if (d.id === "reward.skip") {
          if (this.rewardArg.kind !== "lost") L.heal(run, 3);
          S.play("cancel");
          this.wipe(async () => this.go("Map"));
        }
      },
    },

    Treasure: {
      enter() {
        S.play("open");
        this.go("Reward", { kind: "treasure", title: "宝箱", sub: "ひとつだけ持っていける", noSkip: false });
      },
    },

    Rest: {
      enter() {
        const run = this.run, v = this.v;
        const amt = Math.round(run.maxHp * D.BAL.restHealPct);
        this.choiceActs = ["rest", "train"];
        v.choice.setContent("焚き火", "揺れる火が、深層の冷えを和らげる。\n最後の休息になるかもしれない。", "n_rest", [
          { label: `休む（HP+${amt}）` }, { label: "鍛える（攻撃+1）" },
        ]);
        this.showOnly(["choice"]);
        this.hint("");
      },
      on(evt) {
        if (evt.type !== "ui.click" || evt.data.id !== "choice") return;
        const run = this.run;
        const act = this.choiceActs[evt.data.index];
        if (act === "rest") { const h = L.heal(run, Math.round(run.maxHp * D.BAL.restHealPct)); S.play("heal"); this.wipe(async () => { this.go("Map"); this.toast("ひと息ついた", `HPが${h}回復した`); }); }
        if (act === "train") { run.bonusAtk++; S.play("relic"); this.wipe(async () => { this.go("Map"); this.toast("刃を研いだ", "攻撃が1上がった"); }); }
      },
    },

    Event: {
      enter() {
        const run = this.run, v = this.v;
        const pool = Object.keys(D.EVENTS).filter((k) => !(run.flags.seen || []).includes(k));
        const id = pool.length ? pool[Math.floor(run.rng() * pool.length)] : "spring";
        run.flags.seen = (run.flags.seen || []).concat(id);
        const ev = D.EVENTS[id];
        this.eventDef = ev;
        const choices = ev.choices.map((c) => {
          let disabled = false;
          if (c.act === "altar" && run.hp <= 8) disabled = true;
          if (c.act === "cursed" && run.hp <= 6) disabled = true;
          if (c.act === "recruit" && run.companions.length >= D.BAL.maxCompanions) disabled = true;
          return { label: c.label, disabled };
        });
        v.choice.setContent(ev.title, ev.text, ev.icon, choices);
        this.showOnly(["choice"]);
        S.play("chime");
      },
      on(evt) {
        if (evt.type !== "ui.click" || evt.data.id !== "choice") return;
        const run = this.run;
        const c = this.eventDef.choices[evt.data.index];
        const back = (title, body, icon) => this.wipe(async () => { this.go("Map"); if (title) this.toast(title, body, icon); });
        const grant = (rare) => {
          const list = L.genRewards(run, rare ? "elite" : "treasure");
          const r = list.find((x) => x.kind === "relic");
          if (r) { L.applyReward(run, r); return r.id; }
          return null;
        };
        switch (c.act) {
          case "altar": { run.hp -= 8; const id = grant(true); S.play("relic"); back(id ? D.RELICS[id].name + "を授かった" : "何も起こらなかった", id ? D.RELICS[id].desc : "", id ? D.RELICS[id].icon : null); break; }
          case "recruit": S.play("confirm"); this.go("Reward", { kind: "lost", title: "迷い灯", sub: "誰を連れて行く？" }); break;
          case "heal10": L.heal(run, 10); S.play("heal"); back("灯を分けてもらった", "HPが10回復した"); break;
          case "heal14": L.heal(run, 14); S.play("heal"); back("燠泉を飲んだ", "HPが14回復した"); break;
          case "maxhp5": run.maxHp += 5; run.hp += 5; S.play("relic"); back("燠泉を浴びた", "最大HPが5上がった"); break;
          case "cursed": { run.hp -= 6; run.flags.cursed = true; const id = grant(false); S.play("roar"); back(id ? D.RELICS[id].name + "を手に入れた" : "空っぽだった", "次の戦闘に骨砕きが紛れ込む…", id ? D.RELICS[id].icon : null); break; }
          default: S.play("cancel"); back(); break;
        }
      },
    },

    RunClear: {
      enter() {
        const v = this.v, run = this.run;
        this.record.wins = (this.record.wins || 0) + 1;
        this.record.bestChain = Math.max(this.record.bestChain || 0, run.stats.maxChain);
        this.saveRecord();
        this.setHud("none"); v.hudLayer.visible = false; v.battleWorld.visible = false; v.mapView.visible = false;
        this.fillResult(true);
        this.showOnly(["result"]);
        v.bg.theme = "title";
        S.bgm("map");
      },
      on(evt) { if (evt.type === "ui.click" && evt.data.id === "result.ok") this.wipe(async () => this.go("Title")); },
    },
    GameOver: {
      enter() {
        const v = this.v, run = this.run;
        this.record.bestChain = Math.max(this.record.bestChain || 0, run.stats.maxChain);
        this.saveRecord();
        this.setHud("none"); v.hudLayer.visible = false; v.battleWorld.visible = false; v.mapView.visible = false;
        this.fillResult(false);
        this.showOnly(["result"]);
        v.bg.theme = "map";
      },
      on(evt) { if (evt.type === "ui.click" && evt.data.id === "result.ok") this.wipe(async () => this.go("Title")); },
    },
  };

  /* helpers that need STATES defined */
  Mediator.prototype.finishRoute = function () {
    const B = this.B, run = this.run;
    let r = this.route;
    let res = L.simulate(B, run, r);
    while (r.length > 1 && res.endBlocked) { r = r.slice(0, -1); res = L.simulate(B, run, r); }
    // a route cut short by victory/death ends where it ended
    if (res.outcome !== "ok") r = r.slice(0, res.last + 1);
    if (r.length < 2) {
      S.play("cancel");
      this.setDragUI(false);
      this.go("Battle.Idle");
      return;
    }
    S.play("lock");
    this.go("Battle.Planned", r);
  };
  Mediator.prototype.showActions = function (on) {
    const a = this.v.actionBar;
    EL.tweens.kill(a);
    if (on) { a.visible = true; a.alpha = 0; a.y = 8; EL.tween(a, { alpha: 1, y: 0 }, 160, { clock: "ui", ease: U.ease.outBack }); }
    else a.visible = false;
    this.v.hint.visible = !on;
  };
  /* tiles behind the hero along the walked path, skipping tiles held by live enemies */
  Mediator.prototype.companionSpots = function (head, settled) {
    const out = [];
    const occupied = (t) => this.B.enemies.some((e) => e.alive !== false && !(this.deadSet && this.deadSet.has(e.uid)) && L.covers(e, t.x, t.y));
    for (let k = this.path.length - 2; k >= 0 && out.length < this.compViews.length; k--) {
      const t = this.path[k];
      if (sameTile(t, head) || occupied(t)) continue;
      out.push(t);
    }
    return out;
  };
  Mediator.prototype.syncAfterRoute = function () {
    const v = this.v, B = this.B, run = this.run;
    v.footprints.trail = B.trail.map((t) => ({ x: t.x, y: t.y }));
    for (const k in this.enemyViews) if (!B.enemies.find((e) => e.uid === +k)) { v.enemies.remove(this.enemyViews[k]); delete this.enemyViews[k]; }
    this.deadSet = new Set();
    this.refreshEnemyStatics();
    v.playerHUD.hp = run.hp;
    v.pressureHUD.value = L.pressureOf(run, B, B.enemies);
    this.path = B.trail.map((t) => ({ x: t.x, y: t.y }));
  };
  Mediator.prototype.syncAfterEnemy = function () {
    const v = this.v, B = this.B;
    for (const k in this.enemyViews) if (!B.enemies.find((e) => e.uid === +k)) { v.enemies.remove(this.enemyViews[k]); delete this.enemyViews[k]; }
    v.footprints.trail = B.trail.map((t) => ({ x: t.x, y: t.y }));
    this.path = B.trail.map((t) => ({ x: t.x, y: t.y }));
    // companions settle onto the (possibly shortened) trail
    const spots = this.companionSpots(B.hero, true);
    this.compViews.forEach((u, i) => this.unitTo(u, spots[i] || this.path[0], 200));
    this.refreshEnemyStatics();
    this.coolPreview();
  };
  Mediator.prototype.fillResult = function (win) {
    const v = this.v, run = this.run;
    const rv = v.result;
    rv.win = win;
    rv.heroSprite = D.HEROES[run.heroId].sprite;
    rv.comps = run.companions.slice();
    rv.relics = run.relics.slice();
    const depth = run.nodeId ? (run.map.nodes[run.nodeId].type === "boss" ? "最深部" : `第${run.map.nodes[run.nodeId].row + 1}層`) : "入口";
    rv.lines = [["到達", depth], ["撃破数", run.stats.kills], ["最大連鎖", run.stats.maxChain], ["最長ルート", run.stats.bestRoute + "マス"], ["戦闘", run.stats.battles]];
    rv.lines = rv.lines.map(([k, v2]) => [k, typeof v2 === "number" ? String(v2) : v2]);
    // ResultView prints values with the bitmap font — keep them ASCII
    rv.lines = rv.lines.map(([k, v2]) => [k + (typeof v2 === "string" && /[^\x00-\x7F]/.test(v2) ? "：" + v2 : ""), /[^\x00-\x7F]/.test(v2) ? "" : v2]);
  };

  EL.Mediator = Mediator;
})(window.EL);
