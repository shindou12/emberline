/* EMBERLINE — Passive Views.
   Views hold draw parameters only (position, alpha, text, highlight flags…).
   They never decide game outcomes; they report what happened via emit(). */
(function (EL) {
  "use strict";
  const U = EL.U, A = EL.Art, C = A.C, D = EL.Data;
  const V = (EL.V = {});
  const T = 48, BX = 12, BY = 80, GW = D.BAL.GW, GH = D.BAL.GH;
  V.GEO = { T, BX, BY, GW, GH };
  const tc = (x, y) => ({ x: BX + x * T + T / 2, y: BY + y * T + T / 2 });
  V.tc = tc;
  const DIRV = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
  const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

  /* ================= generic ================= */
  class ButtonView extends EL.Node {
    constructor(id, label, w, h, o = {}) {
      super("Button:" + id);
      this.id = id; this.label = label; this.w = w; this.h = h;
      this.interactive = true; this.inputKind = "button";
      this.pressed = false; this.disabled = false; this.o = o; this.icon = o.icon || null;
      this.glow = 0; this.t = 0;
    }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      const o = this.o;
      const dy = A.button(ctx, 0, 0, this.w, this.h, { pressed: this.pressed, disabled: this.disabled, face: o.face, top: o.top, base: o.base });
      if (this.glow > 0) {
        const ga = ctx.globalAlpha;
        ctx.globalAlpha = ga * (0.5 + 0.5 * Math.sin(this.t / 160));
        ctx.fillStyle = "rgba(255,240,200,0.25)";
        ctx.fillRect(4, 2 + dy, this.w - 8, this.h - 10);
        ctx.globalAlpha = ga;
      }
      const col = this.disabled ? C.mute : o.color || C.ink;
      let tx = this.w / 2;
      if (this.icon) {
        A.spr(ctx, this.icon, 16, this.h / 2 + dy + 5, { s: 2 });
        tx += 8;
      }
      A.jp(ctx, this.label, tx, (this.h - 8) / 2 - 8 + dy + 1, { size: o.size || 16, align: "center", color: col, outline: this.disabled ? C.ink : o.outline || "rgba(255,255,255,0.35)", ow: 1 });
    }
  }
  V.ButtonView = ButtonView;

  /* ================= background ================= */
  const THEMES = {
    title: { top: "#07050d", mid: "#1b0f28", bot: "#3a1422", mote: ["#ff8a2a", "#ffd35a", "#c24a12"], up: true },
    map: { top: "#06060d", mid: "#141029", bot: "#1f1733", mote: ["#8a82aa", "#5a5078"], up: false },
    battle: { top: "#08060f", mid: "#150f24", bot: "#211634", mote: ["#ff8a2a", "#c24a12", "#5a5078"], up: true },
    boss: { top: "#0c0409", mid: "#220915", bot: "#3b0c1c", mote: ["#ff4d5e", "#ff8a2a", "#7af0ff"], up: true },
  };
  class BackgroundView extends EL.Node {
    constructor() { super("Background"); this.theme = "title"; this.t = 0; this.motes = []; this.cache = {}; this.pulse = 0; }
    bake(name) {
      if (this.cache[name]) return this.cache[name];
      const th = THEMES[name];
      const cv = document.createElement("canvas");
      cv.width = 180; cv.height = 320;
      const g = cv.getContext("2d");
      const mix = (a, b, t) => {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
        const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
        const bb = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
        return `rgb(${r},${gg},${bb})`;
      };
      const bands = 12;
      for (let i = 0; i < bands; i++) {
        const t = i / (bands - 1);
        const col = t < 0.5 ? mix(th.top, th.mid, t * 2) : mix(th.mid, th.bot, (t - 0.5) * 2);
        const y0 = Math.floor((i * 320) / bands), y1 = Math.floor(((i + 1) * 320) / bands);
        g.fillStyle = col; g.fillRect(0, y0, 180, y1 - y0);
        if (i < bands - 1) {
          const next = (i + 1) / (bands - 1);
          const c2 = next < 0.5 ? mix(th.top, th.mid, next * 2) : mix(th.mid, th.bot, (next - 0.5) * 2);
          g.fillStyle = c2;
          for (let x = 0; x < 180; x += 2) g.fillRect(x + ((y1 / 1) % 2), y1 - 1, 1, 1);
        }
      }
      // cave silhouettes
      let s = 11;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      g.fillStyle = "rgba(0,0,0,0.45)";
      for (let x = 0; x < 180; x += 6) { const h = 6 + Math.floor(rnd() * 22); g.fillRect(x, 0, 6, h); g.fillRect(x + 2, h, 2, Math.floor(rnd() * 8)); }
      g.fillStyle = "rgba(0,0,0,0.35)";
      for (let x = 0; x < 180; x += 8) { const h = 8 + Math.floor(rnd() * 26); g.fillRect(x, 320 - h, 8, h); }
      this.cache[name] = cv;
      return cv;
    }
    tick(dt) {
      this.t += dt;
      const th = THEMES[this.theme];
      if (Math.random() < dt / 90 && this.motes.length < 50) {
        this.motes.push({ x: Math.random() * 360, y: th.up ? 650 : -10, vy: th.up ? -U.rand(12, 40) : U.rand(8, 20), vx: U.rand(-6, 6), c: U.pick(th.mote), life: U.rand(6000, 14000), ph: Math.random() * 6 });
      }
      for (const m of this.motes) { m.x += (m.vx + Math.sin(this.t / 900 + m.ph) * 6) * dt / 1000; m.y += (m.vy * dt) / 1000; m.life -= dt; }
      this.motes = this.motes.filter((m) => m.life > 0 && m.y > -20 && m.y < 660);
    }
    draw(ctx) {
      ctx.drawImage(this.bake(this.theme), 0, 0, 360, 640);
      if (this.pulse > 0) { ctx.fillStyle = `rgba(255,60,80,${0.12 * this.pulse})`; ctx.fillRect(0, 0, 360, 640); }
      for (const m of this.motes) {
        ctx.globalAlpha = Math.min(1, m.life / 1500) * (0.4 + 0.3 * Math.sin(this.t / 200 + m.ph));
        ctx.fillStyle = m.c;
        ctx.fillRect(U.snap(m.x), U.snap(m.y), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
  V.BackgroundView = BackgroundView;

  /* ================= battle world ================= */
  class BoardView extends EL.Node {
    constructor() {
      super("Grid");
      this.x = BX; this.y = BY; this.w = T * GW; this.h = T * GH;
      this.interactive = true; this.inputKind = "route";
      this.tiles = new Array(GW * GH).fill(0);
      this.dim = 0; this.reach = null; this.entries = []; this.entryEmph = 0; this.t = 0; this.cursor = null; this.heroTile = null; this.heroHint = 0;
    }
    /* raw pointer → route input event (geometry only; legality decided elsewhere) */
    routeInput(phase, p) {
      const lx = p.x - this.x, ly = p.y - this.y;
      const tx = Math.floor(lx / T), ty = Math.floor(ly / T);
      const inside = tx >= 0 && ty >= 0 && tx < GW && ty < GH;
      const cx = tx * T + T / 2, cy = ty * T + T / 2;
      const near = inside && Math.hypot(lx - cx, ly - cy) < T * 0.34;
      this.emit("route.input", { phase, tile: inside ? { x: tx, y: ty } : null, near, px: p.x, py: p.y });
    }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      // frame
      ctx.fillStyle = C.ink; ctx.fillRect(-8, -8, this.w + 16, this.h + 16);
      ctx.fillStyle = "#2b2140"; ctx.fillRect(-6, -6, this.w + 12, this.h + 12);
      ctx.fillStyle = "#4a3a66"; ctx.fillRect(-6, -6, this.w + 12, 2);
      ctx.fillStyle = "#171125"; ctx.fillRect(-4, -4, this.w + 8, this.h + 8);
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          const px = x * T, py = y * T;
          ctx.drawImage(A.TILES[hash(x, y) % 3], px, py, T, T);
        }
      // rocks
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (this.tiles[y * GW + x] === 1) {
        ctx.fillStyle = "#140f20"; ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
        A.spr(ctx, "rock", x * T + T / 2, y * T + T - 4, { s: 3 });
      }
      // corner braziers
      for (const [cx, cy] of [[-4, -4], [this.w + 4, -4], [-4, this.h + 4], [this.w + 4, this.h + 4]]) {
        ctx.fillStyle = C.ink; ctx.fillRect(cx - 5, cy - 5, 10, 10);
        ctx.fillStyle = "#6b4f2a"; ctx.fillRect(cx - 3, cy - 3, 6, 6);
        const f = Math.floor(this.t / 110) % 3;
        ctx.fillStyle = C.ember; ctx.fillRect(cx - 2, cy - 6 - f * 2, 4, 4 + f * 2);
        ctx.fillStyle = C.emberL; ctx.fillRect(cx - 1, cy - 4 - f, 2, 2 + f);
      }
    }
    drawOver(ctx) {
      // dim the tiles you cannot reach (only while drawing a route)
      if (this.dim > 0.01 && this.reach) {
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
          const k = y * GW + x;
          if (this.reach.has(k) || this.tiles[k] === 1) continue;
          ctx.fillStyle = `rgba(6,4,12,${0.5 * this.dim})`;
          ctx.fillRect(x * T, y * T, T, T);
        }
        const pulse = 0.5 + 0.5 * Math.sin(this.t / 220);
        ctx.fillStyle = `rgba(255,214,140,${(0.18 + 0.12 * pulse) * this.dim})`;
        for (const k of this.reach) {
          const x = k % GW, y = Math.floor(k / GW);
          const px = x * T, py = y * T;
          const L = 8;
          ctx.fillRect(px + 3, py + 3, L, 2); ctx.fillRect(px + 3, py + 3, 2, L);
          ctx.fillRect(px + T - 3 - L, py + 3, L, 2); ctx.fillRect(px + T - 5, py + 3, 2, L);
          ctx.fillRect(px + 3, py + T - 5, L, 2); ctx.fillRect(px + 3, py + T - 3 - L, 2, L);
          ctx.fillRect(px + T - 3 - L, py + T - 5, L, 2); ctx.fillRect(px + T - 5, py + T - 3 - L, 2, L);
        }
      }
      // weak-side approach pads: "charge in from here"
      if (this.entries.length) {
        const e = this.entryEmph;
        for (const en of this.entries) {
          const px = en.x * T, py = en.y * T;
          const a = (0.25 + 0.55 * e) * (0.6 + 0.4 * Math.sin(this.t / 150 + en.x));
          ctx.globalAlpha = a;
          A.dither(ctx, px + 6, py + 6, T - 12, T - 12, C.weak, Math.floor(this.t / 200) % 2);
          ctx.globalAlpha = 1;
        }
      }
      // hero pulse hint ("drag from me")
      if (this.heroTile && this.heroHint > 0.01) {
        const px = this.heroTile.x * T, py = this.heroTile.y * T;
        const k = (this.t % 1200) / 1200;
        const g = Math.round(k * 10) * 2;
        ctx.globalAlpha = this.heroHint * (1 - k);
        ctx.fillStyle = C.emberL;
        ctx.fillRect(px - g, py - g, T + g * 2, 2); ctx.fillRect(px - g, py + T + g - 2, T + g * 2, 2);
        ctx.fillRect(px - g, py - g, 2, T + g * 2); ctx.fillRect(px + T + g - 2, py - g, 2, T + g * 2);
        ctx.globalAlpha = 1;
      }
    }
  }
  V.BoardView = BoardView;

  /* the ember trail: every tile walked burns until it cools */
  class FootprintView extends EL.Node {
    constructor() { super("Footprints"); this.trail = []; this.cool = 0; this.births = new Map(); this.ashes = []; this.t = 0; this.heat = 1; }
    tick(dt) {
      this.t += dt;
      for (const a of this.ashes) a.t += dt;
      this.ashes = this.ashes.filter((a) => a.t < 700);
    }
    draw(ctx) {
      const tr = this.trail, n = tr.length;
      // ashes (just cooled)
      for (const a of this.ashes) {
        const k = a.t / 700;
        const px = BX + a.x * T, py = BY + a.y * T;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = "#4d4350"; ctx.fillRect(px + 8, py + 8, T - 16, T - 16);
        ctx.fillStyle = "#8a7f86";
        for (let i = 0; i < 5; i++) ctx.fillRect(px + 10 + ((i * 7) % 28), py + 26 - k * 20 - i * 3, 2, 2);
        ctx.globalAlpha = 1;
      }
      // tiles
      for (let k = 0; k < n; k++) {
        const t = tr[k];
        const px = BX + t.x * T, py = BY + t.y * T;
        const cooling = k < this.cool;
        const heat = n > 1 ? (k + 1) / n : 1;
        if (cooling) {
          ctx.fillStyle = "rgba(60,48,60,0.75)"; ctx.fillRect(px + 4, py + 4, T - 8, T - 8);
          A.dither(ctx, px + 6, py + 6, T - 12, T - 12, "#5c5058", 0);
          ctx.fillStyle = "#b0413e";
          const f = (hash(t.x, t.y) + Math.floor(this.t / 300)) % 4;
          ctx.fillRect(px + 12 + f * 4, py + 30, 2, 2); ctx.fillRect(px + 30 - f * 2, py + 18, 2, 2);
        } else {
          ctx.fillStyle = `rgba(120,30,10,${0.45 + 0.25 * heat})`; ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
          ctx.globalAlpha = 0.35 + 0.45 * heat;
          A.dither(ctx, px + 4, py + 4, T - 8, T - 8, C.emberD, Math.floor(this.t / 260 + k) % 2);
          ctx.globalAlpha = 1;
          const f = (hash(t.x, t.y) + Math.floor(this.t / 140)) % 5;
          ctx.fillStyle = heat > 0.6 ? C.emberL : C.ember;
          ctx.fillRect(px + 8 + f * 6, py + 36 - ((f * 3) % 10), 2, 2);
          ctx.fillRect(px + 34 - f * 3, py + 10 + ((f * 5) % 12), 2, 2);
        }
        const b = this.births.get(t.x + "," + t.y);
        if (b != null) {
          const age = this.t - b;
          if (age < 350) {
            const q = age / 350;
            ctx.globalAlpha = 1 - q;
            ctx.fillStyle = C.emberL;
            const g = Math.round(q * 8) * 2;
            ctx.fillRect(px + 4 - g, py + 4 - g, T - 8 + g * 2, 2); ctx.fillRect(px + 4 - g, py + T - 6 + g, T - 8 + g * 2, 2);
            ctx.fillRect(px + 4 - g, py + 4 - g, 2, T - 8 + g * 2); ctx.fillRect(px + T - 6 + g, py + 4 - g, 2, T - 8 + g * 2);
            ctx.globalAlpha = 1;
          }
        }
      }
      // the line of travel: crossing lines stay visible as an X
      for (let k = 1; k < n; k++) {
        const a = tc(tr[k - 1].x, tr[k - 1].y), b = tc(tr[k].x, tr[k].y);
        const cooling = k - 1 < this.cool;
        ctx.fillStyle = cooling ? "#2a2230" : "#4a1208";
        A.pline(ctx, a.x, a.y, b.x, b.y, 6);
        ctx.fillStyle = cooling ? "#6e626c" : k > n - 4 ? C.emberL : C.ember;
        A.pline(ctx, a.x, a.y, b.x, b.y, 2);
      }
      // footprints
      for (let k = 1; k < n; k++) {
        const a = tr[k - 1], b = tr[k];
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L;
        const c = tc(b.x, b.y);
        ctx.fillStyle = k - 1 < this.cool ? "#241c26" : "#2a0c06";
        for (const [s, f] of [[-1, -1], [1, 1]]) {
          const fx = c.x + -uy * 5 * s + ux * 6 * f - 2, fy = c.y + ux * 5 * s + uy * 6 * f - 2;
          ctx.fillRect(U.snap(fx), U.snap(fy), 4, 4);
        }
      }
    }
  }
  V.FootprintView = FootprintView;

  /* the route you are drawing right now */
  class RoutePreviewView extends EL.Node {
    constructor() {
      super("RoutePreview");
      this.pts = []; this.endMoves = 0; this.endOk = true; this.dead = false; this.t = 0; this.consumed = 0;
      this.skillMarks = []; this.areas = []; this.finger = null; this.bad = null;
    }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      const pts = this.pts;
      if (pts.length < 1) return;
      const main = this.dead ? "#ff4d5e" : C.cream;
      // areas (skills that would fire)
      for (const ar of this.areas) {
        const fl = 0.5 + 0.5 * Math.sin(this.t / 90);
        if (ar.kind === "burst") {
          ctx.globalAlpha = 0.35 + 0.3 * fl;
          for (const t of ar.tiles) { if (t.x < 0 || t.y < 0 || t.x >= GW || t.y >= GH) continue; A.dither(ctx, BX + t.x * T + 2, BY + t.y * T + 2, T - 4, T - 4, C.ember, Math.floor(this.t / 120) % 2); }
          ctx.globalAlpha = 1;
        } else if (ar.kind === "ring") {
          ctx.globalAlpha = 0.25 + 0.2 * fl;
          ctx.fillStyle = "#7fd8ff";
          ctx.beginPath();
          ar.poly.forEach((t, i) => { const c = tc(t.x, t.y); if (i) ctx.lineTo(c.x, c.y); else ctx.moveTo(c.x, c.y); });
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
        } else if (ar.kind === "pierce") {
          const a = tc(ar.from.x, ar.from.y), b = tc(ar.to.x, ar.to.y);
          ctx.fillStyle = C.emberL;
          const L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.floor(L / 8);
          for (let i = 1; i < steps; i++) if ((i + Math.floor(this.t / 60)) % 2) ctx.fillRect(U.snap(a.x + ((b.x - a.x) * i) / steps) - 1, U.snap(a.y + ((b.y - a.y) * i) / steps) - 1, 4, 4);
        }
      }
      // line
      for (let k = 1; k < pts.length; k++) {
        const a = tc(pts[k - 1].x, pts[k - 1].y), b = tc(pts[k].x, pts[k].y);
        const done = k <= this.consumed;
        ctx.fillStyle = C.ink;
        A.pline(ctx, a.x, a.y, b.x, b.y, 8);
        ctx.fillStyle = done ? "rgba(255,246,223,0.25)" : main;
        A.pline(ctx, a.x, a.y, b.x, b.y, 4);
      }
      // marching light along the line
      if (pts.length > 1 && !this.consumed) {
        const total = pts.length - 1;
        const head = ((this.t / 70) % (total * 6)) / 6;
        const k = Math.floor(head);
        if (k < total) {
          const f = head - k;
          const a = tc(pts[k].x, pts[k].y), b = tc(pts[k + 1].x, pts[k + 1].y);
          ctx.fillStyle = C.emberL;
          ctx.fillRect(U.snap(a.x + (b.x - a.x) * f) - 3, U.snap(a.y + (b.y - a.y) * f) - 3, 6, 6);
        }
      }
      // step diamonds
      for (let k = 1; k < pts.length; k++) {
        if (k <= this.consumed) continue;
        const c = tc(pts[k].x, pts[k].y);
        ctx.fillStyle = C.ink; ctx.fillRect(c.x - 4, c.y - 2, 8, 4); ctx.fillRect(c.x - 2, c.y - 4, 4, 8);
        ctx.fillStyle = main; ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
      }
      // arrowhead + moves bubble at the tip
      if (pts.length > 1) {
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        const c = tc(b.x, b.y);
        const dx = U.sign(b.x - a.x), dy = U.sign(b.y - a.y);
        ctx.fillStyle = C.ink;
        ctx.fillRect(c.x + dx * 8 - 5, c.y + dy * 8 - 5, 10, 10);
        ctx.fillStyle = main;
        ctx.fillRect(c.x + dx * 8 - 3, c.y + dy * 8 - 3, 6, 6);
        ctx.fillRect(c.x + dx * 12 - 1, c.y + dy * 12 - 1, 2, 2);
      }
      const tip = pts[pts.length - 1];
      if (tip) {
        const c = tc(tip.x, tip.y);
        const bx = c.x + 14, by = c.y - 30;
        const col = this.endMoves > 0 ? C.move : "#ff8f8f";
        ctx.fillStyle = C.ink; ctx.fillRect(bx - 2, by, 24, 20); ctx.fillRect(bx, by - 2, 20, 24);
        ctx.fillStyle = "#1c2744"; ctx.fillRect(bx, by, 20, 20);
        ctx.fillStyle = col; ctx.fillRect(bx, by, 20, 2);
        A.text(ctx, String(this.endMoves), bx + 10, by + 5, { s: 2, align: "center", color: col });
        if (!this.endOk) {
          ctx.fillStyle = "#ff4d5e";
          A.text(ctx, "X", c.x, c.y - 6, { s: 3, align: "center", color: "#ff4d5e" });
        }
      }
      // companion trigger markers along the route
      for (const m of this.skillMarks) {
        const c = tc(m.x, m.y);
        const bob = Math.round(Math.sin(this.t / 120 + m.k) * 2) * 2;
        ctx.fillStyle = C.ink; ctx.fillRect(c.x - 13, c.y - 42 + bob, 26, 26);
        ctx.fillStyle = m.color; ctx.fillRect(c.x - 11, c.y - 40 + bob, 22, 22);
        ctx.fillStyle = "#1c1530"; ctx.fillRect(c.x - 9, c.y - 38 + bob, 18, 18);
        A.spr(ctx, D.COMPANIONS[m.comp].sprite, c.x, c.y - 21 + bob, { s: 1 });
        ctx.fillStyle = m.color; ctx.fillRect(c.x - 2, c.y - 16 + bob, 4, 4);
      }
      // rejected step flash
      if (this.bad && this.t - this.bad.t < 260) {
        const px = BX + this.bad.x * T, py = BY + this.bad.y * T;
        ctx.globalAlpha = 1 - (this.t - this.bad.t) / 260;
        ctx.fillStyle = "#ff4d5e";
        ctx.fillRect(px + 2, py + 2, T - 4, 2); ctx.fillRect(px + 2, py + T - 4, T - 4, 2);
        ctx.fillRect(px + 2, py + 2, 2, T - 4); ctx.fillRect(px + T - 4, py + 2, 2, T - 4);
        A.text(ctx, "X", px + T / 2, py + T / 2 - 7, { s: 2, align: "center", color: "#ff4d5e" });
        ctx.globalAlpha = 1;
      }
    }
  }
  V.RoutePreviewView = RoutePreviewView;

  /* hero & companions */
  class UnitView extends EL.Node {
    constructor(name, sprite) {
      super(name); this.sprite = sprite;
      this.flip = false; this.flash = 0; this.red = 0; this.ox = 0; this.oy = 0; this.sq = 0;
      this.t = Math.random() * 1000; this.bob = true; this.glow = 0; this.shield = 0; this.aura = 0; this.auraColor = C.hollow; this.lantern = false; this.hop = 0;
    }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      const bob = this.bob ? (Math.sin(this.t / 260) > 0.3 ? -2 : 0) : 0;
      const x = U.snap(this.ox), y = U.snap(this.oy + bob - this.hop);
      if (this.lantern) {
        const r = 22 + (Math.floor(this.t / 180) % 2) * 2;
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = C.ember;
        A.pellipse(ctx, x, y - 4, r, r * 0.55, true);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      A.pellipse(ctx, x, U.snap(this.oy) + 1, 12, 4, true);
      if (this.aura > 0.01) {
        ctx.globalAlpha = this.aura * (0.5 + 0.5 * Math.sin(this.t / 90));
        ctx.fillStyle = this.auraColor;
        A.pellipse(ctx, x, y - 14, 18, 20);
        ctx.globalAlpha = 1;
      }
      const sy = 1 + this.sq, sx = 1 - this.sq * 0.6;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx, sy);
      A.spr(ctx, this.sprite, 0, 0, { s: 2, flip: this.flip, white: this.flash, red: this.red > 0.5 });
      ctx.restore();
      if (this.shield > 0.01) {
        ctx.globalAlpha = this.shield * (0.6 + 0.4 * Math.sin(this.t / 100));
        ctx.fillStyle = C.move;
        A.pellipse(ctx, x, y - 16, 20, 22);
        ctx.globalAlpha = 1;
      }
    }
  }
  V.UnitView = UnitView;

  /* enemies — weak side is shown as an open, glowing flank between three shields */
  class EnemyView extends EL.Node {
    constructor(e) {
      super("Enemy:" + e.uid);
      const d = D.ENEMIES[e.type];
      this.uid = e.uid; this.type = e.type; this.sprite = d.sprite; this.size = e.size || 1;
      this.tx = e.x; this.ty = e.y; this.hp = e.hp; this.maxHp = e.maxHp; this.shownHp = e.hp;
      this.weak = e.weak; this.sealed = false; this.pressure = e.pressure; this.boss = !!e.boss;
      this.emph = 0; this.target = false; this.kill = false; this.dmg = null; this.dmgWeak = false; this.counter = null; this.blocked = false;
      this.flash = 0; this.ox = 0; this.oy = 0; this.t = Math.random() * 1000; this.spin = 0; this.phase2 = false; this.intent = d.summons ? "summon" : null;
      this.flip = false; this.dead = false; this.lunge = 0;
    }
    tick(dt) { this.t += dt; this.shownHp += (this.hp - this.shownHp) * Math.min(1, dt / 90); }
    rect() { return { x: BX + this.tx * T, y: BY + this.ty * T, s: T * this.size }; }
    draw(ctx) {
      if (this.dead) return;
      const r = this.rect();
      const cx = r.x + r.s / 2, bottom = r.y + r.s - 6;
      // cold aura under
      ctx.globalAlpha = 0.35;
      A.dither(ctx, r.x + 4, r.y + 4, r.s - 8, r.s - 8, this.phase2 ? "#ff4d5e" : "#5c34b0", Math.floor(this.t / 300) % 2);
      ctx.globalAlpha = 1;
      this.drawGuards(ctx, r);
      // pressure flames (top-left)
      for (let i = 0; i < this.pressure; i++) {
        const fx = r.x + 5 + i * 6, fy = r.y + 5;
        const f = (Math.floor(this.t / 160) + i) % 2;
        ctx.fillStyle = C.ink; ctx.fillRect(fx - 1, fy - 1, 6, 8);
        ctx.fillStyle = "#b08cff"; ctx.fillRect(fx, fy + 2 - f, 4, 4 + f);
        ctx.fillStyle = "#e9dcff"; ctx.fillRect(fx + 1, fy + 4, 2, 2);
      }
      // sprite
      const s = this.boss ? 3 : 2;
      const bob = this.type === "wisp" ? Math.round(Math.sin(this.t / 200) * 2) * 2 : 0;
      const sx = cx + U.snap(this.ox), sy = bottom + U.snap(this.oy) + bob;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      A.pellipse(ctx, cx, bottom + 1, this.boss ? 34 : 12, 4, true);
      A.spr(ctx, this.sprite, sx, sy, { s, flip: this.flip, white: this.flash, alpha: this.kill ? 0.75 : 1 });
      if (this.kill) {
        // fated to die: pulsing skull
        const k = Math.floor(this.t / 120) % 2;
        A.spr(ctx, "i_skull", cx, r.y + r.s / 2 + 2 - k * 2, { s: 3 });
        if (this.refund) A.text(ctx, "+" + this.refund, r.x + r.s - 4, r.y + 2, { s: 2, align: "right", color: C.heal });
      }
      if (this.intent === "summon") {
        const k = Math.floor(this.t / 200) % 2;
        ctx.fillStyle = C.ink; ctx.fillRect(r.x + r.s - 16, r.y + 3, 12, 12);
        ctx.fillStyle = "#b08cff"; ctx.fillRect(r.x + r.s - 14, r.y + 5, 8, 8);
        ctx.fillStyle = "#e9dcff"; ctx.fillRect(r.x + r.s - 12 + k * 2, r.y + 7, 2, 4);
      }
      this.drawHp(ctx, r);
      if (this.target) this.drawTarget(ctx, r);
    }
    drawGuards(ctx, r) {
      const inset = 3, th = 4;
      const sides = { U: [r.x + 6, r.y + inset, r.s - 12, th], D: [r.x + 6, r.y + r.s - inset - th, r.s - 12, th], L: [r.x + inset, r.y + 6, th, r.s - 12], R: [r.x + r.s - inset - th, r.y + 6, th, r.s - 12] };
      for (const k of ["U", "R", "D", "L"]) {
        const [x, y, w, h] = sides[k];
        if (k === this.weak && !this.sealed) continue;
        ctx.fillStyle = C.ink; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
        ctx.fillStyle = this.sealed ? "#7a5bc4" : "#7c86a3"; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = this.sealed ? "#c9b3ff" : "#d3dbea";
        if (w > h) ctx.fillRect(x, y, w, 2); else ctx.fillRect(x, y, 2, h);
        ctx.fillStyle = "#3b3350";
        if (w > h) { ctx.fillRect(x + 4, y + 1, 2, 2); ctx.fillRect(x + w - 6, y + 1, 2, 2); } else { ctx.fillRect(x + 1, y + 4, 2, 2); ctx.fillRect(x + 1, y + h - 6, 2, 2); }
      }
      if (this.sealed) {
        // chain seal glyph
        const k = Math.floor(this.t / 250) % 2;
        A.spr(ctx, "i_chain", r.x + r.s - 12, r.y + r.s - 6 - k * 2, { s: 2 });
        return;
      }
      // open flank: flickering ember gap + inward chevrons
      const [x, y, w, h] = sides[this.weak];
      const fl = 0.55 + 0.45 * Math.sin(this.t / 90);
      ctx.fillStyle = C.weak; ctx.globalAlpha = 0.5 + 0.5 * fl;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      const v = DIRV[this.weak];
      const spinK = this.spin > 0 ? Math.sin(this.spin * Math.PI) : 0;
      const e = 0.5 + 0.5 * this.emph;
      const phase = (this.t / 400) % 1;
      // chevrons live in each approach tile, pointing into the enemy
      const size = Math.round(3 + 2 * e + spinK * 3);
      ctx.globalAlpha = Math.min(1, 0.55 + this.emph * 0.45);
      for (let k = 0; k < this.size; k++) {
        const mid = v[0] !== 0 ? { x: r.x + r.s / 2, y: r.y + T / 2 + k * T } : { x: r.x + T / 2 + k * T, y: r.y + r.s / 2 };
        const ex = mid.x + v[0] * (r.s / 2 + 12 - phase * 8), ey = mid.y + v[1] * (r.s / 2 + 12 - phase * 8);
        for (let n = 0; n < 2; n++) {
          const off = n * 7;
          const px = ex + v[0] * off, py = ey + v[1] * off;
          ctx.fillStyle = C.ink;
          this.chev(ctx, px, py, v, size + 1, 4);
          ctx.fillStyle = n === 0 ? C.emberL : C.weak;
          this.chev(ctx, px, py, v, size, 2);
        }
      }
      ctx.globalAlpha = 1;
    }
    /* chevron pointing opposite of v (into the enemy) */
    chev(ctx, x, y, v, size, th) {
      for (let i = -size; i <= size; i++) {
        const along = Math.abs(i);
        const px = v[0] !== 0 ? x + v[0] * along * 2 : x + i * 2;
        const py = v[1] !== 0 ? y + v[1] * along * 2 : y + i * 2;
        ctx.fillRect(U.snap(px) - th / 2, U.snap(py) - th / 2, th, th);
      }
    }
    drawHp(ctx, r) {
      const shown = Math.max(0, Math.round(this.shownHp));
      const after = this.target && this.dmg != null ? Math.max(0, this.hp - this.dmg) : this.hp;
      const blink = Math.floor(this.t / 110) % 2;
      if (this.maxHp <= 8) {
        const pw = 4, gap = 2, tw = this.maxHp * (pw + gap) - gap;
        let x = U.snap(r.x + r.s / 2 - tw / 2);
        const y = r.y + r.s - 7;
        ctx.fillStyle = C.ink; ctx.fillRect(x - 2, y - 2, tw + 4, 8);
        for (let i = 0; i < this.maxHp; i++) {
          let col = "#3b2240";
          if (i < shown) col = "#ff4d5e";
          if (i >= after && i < this.hp) col = blink ? "#ffffff" : "#ff4d5e";
          ctx.fillStyle = col; ctx.fillRect(x, y, pw, pw);
          x += pw + gap;
        }
      } else {
        const bw = this.boss ? r.s - 20 : 38, bh = this.boss ? 8 : 6;
        const x = U.snap(r.x + r.s / 2 - bw / 2), y = r.y + r.s - (this.boss ? 12 : 9);
        ctx.fillStyle = C.ink; ctx.fillRect(x - 2, y - 2, bw + 4, bh + 4);
        ctx.fillStyle = "#3b2240"; ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = this.phase2 ? "#ff8a2a" : "#ff4d5e"; ctx.fillRect(x, y, Math.round((bw * Math.max(0, this.shownHp)) / this.maxHp), bh);
        if (this.target && after < this.hp) {
          ctx.fillStyle = blink ? "#ffffff" : "#ffb0b8";
          const a = Math.round((bw * after) / this.maxHp), b = Math.round((bw * this.hp) / this.maxHp);
          ctx.fillRect(x + a, y, b - a, bh);
        }
        ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, bw, 2);
        ctx.globalAlpha = 0.25; ctx.fillStyle = "#000"; ctx.fillRect(x, y, bw, 2); ctx.globalAlpha = 1;
        A.text(ctx, String(shown), x + bw + 2, y - 3, { s: 1, color: C.cream });
        if (this.boss && this.phase2) A.text(ctx, "ARMOR", r.x + r.s / 2, r.y - 10, { s: 2, align: "center", color: "#ff8a2a" });
      }
    }
    drawTarget(ctx, r) {
      const k = (Math.sin(this.t / 90) + 1) / 2;
      const g = Math.round(k * 2) * 2;
      ctx.fillStyle = this.dmgWeak ? C.weak : "#ff4d5e";
      const L = 10;
      const x0 = r.x - 2 + g, y0 = r.y - 2 + g, x1 = r.x + r.s + 2 - g, y1 = r.y + r.s + 2 - g;
      ctx.fillRect(x0, y0, L, 3); ctx.fillRect(x0, y0, 3, L);
      ctx.fillRect(x1 - L, y0, L, 3); ctx.fillRect(x1 - 3, y0, 3, L);
      ctx.fillRect(x0, y1 - 3, L, 3); ctx.fillRect(x0, y1 - L, 3, L);
      ctx.fillRect(x1 - L, y1 - 3, L, 3); ctx.fillRect(x1 - 3, y1 - L, 3, L);
      if (this.dmg != null) {
        const cx = r.x + r.s / 2;
        const col = this.dmgWeak ? C.weak : C.cream;
        A.text(ctx, String(this.dmg), cx, r.y - 16, { s: 3, align: "center", color: col, grad: this.dmgWeak ? "#fff6df" : null });
        if (this.dmgWeak) A.text(ctx, "WEAK", cx, r.y - 26, { s: 1, align: "center", color: C.emberL });
      }
      if (this.counter) {
        const bx = r.x + r.s - 4, by = r.y + r.s - 12;
        ctx.fillStyle = C.ink; ctx.fillRect(bx - 10, by - 4, 24, 14);
        ctx.fillStyle = "#5a1020"; ctx.fillRect(bx - 8, by - 2, 20, 10);
        A.text(ctx, "-" + this.counter, bx + 2, by - 1, { s: 1, align: "center", color: "#ff8f8f" });
      } else if (this.blocked) {
        A.spr(ctx, "i_shield", r.x + r.s - 6, r.y + r.s - 2, { s: 2 });
      }
    }
  }
  V.EnemyView = EnemyView;

  /* visual effects: slashes, rings, beams, shards (pure eye candy) */
  class FXView extends EL.Particles {
    constructor(name) { super(name || "BattleEffects"); this.prims = []; }
    slash(x, y, dir, color, big) { this.prims.push({ k: "slash", x, y, dir, color: color || "#fff6df", t: 0, life: big ? 240 : 180, big }); }
    ring(x, y, r, color, life, thick) { this.prims.push({ k: "ring", x, y, r, color, t: 0, life: life || 400, thick: thick || 2 }); }
    beam(x0, y0, x1, y1, color, life) { this.prims.push({ k: "beam", x0, y0, x1, y1, color, t: 0, life: life || 300 }); }
    tileFlash(tx, ty, color, life) { this.prims.push({ k: "tile", tx, ty, color, t: 0, life: life || 300 }); }
    ghost(sprite, x, y, flip, color) { this.prims.push({ k: "ghost", sprite, x, y, flip, color, t: 0, life: 220 }); }
    shatter(sprite, cx, bottom, s, flip, tint) {
      for (const ch of A.chunks(sprite, cx, bottom, s || 2, flip)) {
        const a = Math.atan2(ch.y - (bottom - 16), ch.x - cx) + U.rand(-0.4, 0.4);
        const sp = U.rand(60, 220);
        this.add({ x: ch.x, y: ch.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, ay: 420, drag: 0.02, life: U.rand(380, 720), size: (s || 2) * 2, color: tint || ch.color, shrink: false });
      }
    }
    tick(dt) {
      super.tick(dt);
      for (const p of this.prims) p.t += dt;
      this.prims = this.prims.filter((p) => p.t < p.life);
    }
    draw(ctx) {
      const base = ctx.globalAlpha;
      for (const p of this.prims) {
        const k = p.t / p.life;
        ctx.globalAlpha = base * (1 - k);
        if (p.k === "slash") {
          // arc of pixel squares sweeping across the target
          const ang = Math.atan2(p.dir[1], p.dir[0]);
          const R = p.big ? 26 : 20;
          const sweep = Math.min(1, k * 2.2);
          ctx.fillStyle = p.color;
          for (let i = 0; i <= 12; i++) {
            const f = i / 12;
            if (f > sweep) break;
            const a = ang - 1.3 + f * 2.6;
            const w = (1 - Math.abs(f - 0.5) * 2) * (p.big ? 6 : 4) + 2;
            const px = p.x + Math.cos(a) * R * 0.6 - Math.cos(ang) * 6, py = p.y + Math.sin(a) * R - Math.sin(ang) * 6;
            ctx.fillRect(U.snap(px - w / 2), U.snap(py - w / 2), U.snap(w), U.snap(w));
          }
        } else if (p.k === "ring") {
          ctx.fillStyle = p.color;
          const r = p.r * (0.3 + 0.7 * U.ease.outCubic(k));
          A.pellipse(ctx, p.x, p.y, r, r * 0.75);
          if (p.thick > 2) A.pellipse(ctx, p.x, p.y, r - 2, r * 0.75 - 2);
        } else if (p.k === "beam") {
          ctx.fillStyle = p.color;
          A.pline(ctx, p.x0, p.y0, p.x1, p.y1, Math.max(2, U.snap(8 * (1 - k))));
          ctx.fillStyle = "#fff";
          A.pline(ctx, p.x0, p.y0, p.x1, p.y1, 2);
        } else if (p.k === "ghost") {
          ctx.globalAlpha = base * (1 - k) * 0.55;
          A.spr(ctx, p.sprite, U.snap(p.x), U.snap(p.y), { s: 2, flip: p.flip, white: 0.6 });
        } else if (p.k === "tile") {
          ctx.fillStyle = p.color;
          ctx.fillRect(BX + p.tx * T + 2, BY + p.ty * T + 2, T - 4, T - 4);
        }
      }
      ctx.globalAlpha = base;
      super.draw(ctx);
      ctx.globalAlpha = base;
    }
  }
  V.FXView = FXView;

  /* ================= overlay ================= */
  class FloatTextView extends EL.Node {
    constructor() { super("DamageNumbers"); this.items = []; }
    spawn(text, x, y, o = {}) {
      this.items.push(Object.assign({ text: String(text), x, y, vy: -60, t: 0, life: 800, s: 3, color: C.cream, grad: null, kind: "bmp", size: 16, pop: true }, o));
    }
    tick(dt) {
      for (const it of this.items) { it.t += dt; it.y += (it.vy * dt) / 1000; it.vy *= Math.pow(0.9, dt / 16); }
      this.items = this.items.filter((it) => it.t < it.life);
    }
    draw(ctx) {
      const base = ctx.globalAlpha;
      for (const it of this.items) {
        const k = it.t / it.life;
        ctx.globalAlpha = base * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
        if (it.kind === "jp") A.jp(ctx, it.text, it.x, it.y, { size: it.size, align: "center", color: it.color });
        else {
          const s = it.pop && it.t < 90 ? it.s + 1 : it.s;
          A.text(ctx, it.text, it.x, it.y, { s, align: "center", color: it.color, grad: it.grad });
        }
      }
      ctx.globalAlpha = base;
    }
  }
  V.FloatTextView = FloatTextView;

  const CHAIN_COLS = ["#fff6df", "#fff6df", "#ffd35a", "#ffb020", "#ff8a2a", "#ff4d5e", "#b08cff"];
  class ComboView extends EL.Node {
    constructor() { super("ComboEffects"); this.chain = 0; this.t = 9999; this.visible = true; this.alpha = 0; this.hold = 0; }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      if (this.chain < 1) return;
      const col = CHAIN_COLS[Math.min(CHAIN_COLS.length - 1, this.chain)];
      const punch = this.t < 120 ? 1 : 0;
      const cx = 262, y = 88;
      // rays
      if (this.chain >= 2) {
        ctx.fillStyle = col;
        ctx.globalAlpha *= 0.35;
        for (let i = 0; i < 10; i++) {
          const a = i * 0.628 + this.t / 700;
          for (let r = 22; r < 34 + this.chain * 3; r += 4) ctx.fillRect(U.snap(cx - 28 + Math.cos(a) * r), U.snap(y + 14 + Math.sin(a) * r * 0.6), 2, 2);
        }
        ctx.globalAlpha /= 0.35;
      }
      const s = 4 + punch + (this.chain >= 4 ? 1 : 0);
      A.text(ctx, String(this.chain), cx - 14, y, { s, align: "right", color: col, grad: "#ffffff" });
      A.text(ctx, "CHAIN", cx - 6, y + 2, { s: 2, align: "left", color: col });
      const lbl = D.CHAIN_LABELS[Math.min(D.CHAIN_LABELS.length - 1, this.chain)];
      if (lbl) A.text(ctx, lbl, cx - 6, y + 20, { s: 2, align: "left", color: C.emberL });
    }
  }
  V.ComboView = ComboView;

  class BannerView extends EL.Node {
    constructor() { super("Banner"); this.text = ""; this.sub = ""; this.color = C.emberL; this.alpha = 0; this.band = 1; this.y = 280; this.s = 4; this.bandColor = "rgba(10,6,20,0.85)"; this.t = 0; }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      const h = 78 * this.band;
      ctx.fillStyle = this.bandColor;
      ctx.fillRect(0, -h / 2, 360, h);
      ctx.fillStyle = this.color;
      ctx.fillRect(0, -h / 2, 360, 2); ctx.fillRect(0, h / 2 - 2, 360, 2);
      const ty = this.sub ? -28 : -16;
      if (this.text) A.text(ctx, this.text, 180 + U.snap(this.tx || 0), ty, { s: this.s, align: "center", color: this.color, grad: "#ffffff" });
      if (this.sub) A.jp(ctx, this.sub, 180, 12, { size: 16, align: "center", color: C.cream });
    }
  }
  V.BannerView = BannerView;

  class SkillCutInView extends EL.Node {
    constructor() { super("SkillCutIn"); this.comp = null; this.p = 0; this.alpha = 0; this.t = 0; }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      if (!this.comp) return;
      const info = D.COMPANIONS[this.comp];
      const y = 230, h = 92;
      const off = U.snap((1 - this.p) * 380);
      ctx.fillStyle = C.ink;
      for (let i = 0; i < h; i += 4) ctx.fillRect(-off - i * 0.25 - 8, y + i, 380, 4);
      ctx.fillStyle = info.color;
      for (let i = 0; i < h; i += 4) ctx.fillRect(-off - i * 0.25, y + i + 2, 372, 2);
      ctx.fillStyle = "#1c1530";
      for (let i = 4; i < h - 4; i += 4) ctx.fillRect(-off - i * 0.25 + 4, y + i, 360, 4);
      // speed lines
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      for (let i = 0; i < 8; i++) ctx.fillRect(((i * 97 + this.t * 0.9) % 400) - 40 - off, y + 10 + i * 10, 30, 2);
      A.spr(ctx, info.sprite, 70 - off, y + h - 2, { s: 5 });
      A.jp(ctx, info.name, 140 - off, y + 16, { size: 16, color: info.color });
      A.jp(ctx, info.skill, 140 - off, y + 38, { size: 32, color: C.cream });
    }
  }
  V.SkillCutInView = SkillCutInView;

  class VignetteView extends EL.Node {
    constructor() { super("Vignette"); this.red = 0; this.white = 0; this.dark = 0; this.orange = 0; }
    draw(ctx) {
      if (this.dark > 0) { ctx.fillStyle = `rgba(4,2,8,${this.dark})`; ctx.fillRect(0, 0, 360, 640); }
      if (this.white > 0) { ctx.fillStyle = `rgba(255,250,235,${this.white})`; ctx.fillRect(0, 0, 360, 640); }
      if (this.orange > 0) { ctx.fillStyle = `rgba(255,150,40,${this.orange})`; ctx.fillRect(0, 0, 360, 640); }
      if (this.red > 0) {
        ctx.fillStyle = `rgba(255,40,60,${this.red * 0.6})`;
        for (let i = 0; i < 6; i++) {
          const w = 18 - i * 3;
          ctx.globalAlpha = (this.red * (6 - i)) / 6;
          ctx.fillRect(0, 0, 360, w); ctx.fillRect(0, 640 - w, 360, w); ctx.fillRect(0, 0, w, 640); ctx.fillRect(360 - w, 0, w, 640);
        }
        ctx.globalAlpha = 1;
      }
    }
  }
  V.VignetteView = VignetteView;

  class ToastView extends EL.Node {
    constructor() { super("Notifications"); this.title = ""; this.body = ""; this.alpha = 0; this.icon = null; this.y = 386; }
    draw(ctx) {
      if (!this.title && !this.body) return;
      const lines = A.wrap(ctx, this.body, 300, 16);
      const h = 36 + lines.length * 20;
      A.panel(ctx, 14, 0, 332, h, { fill: "#1c1530" });
      let x = 28;
      if (this.icon) { A.spr(ctx, this.icon, 38, 34, { s: 2 }); x = 60; }
      A.jp(ctx, this.title, x, 10, { size: 16, color: C.gold });
      lines.forEach((l, i) => A.jp(ctx, l, 28, 32 + i * 20, { size: 16, color: C.cream }));
    }
  }
  V.ToastView = ToastView;

  /* ================= HUD ================= */
  class PlayerHUD extends EL.Node {
    constructor() { super("PlayerHUD"); this.sprite = "kai"; this.name = ""; this.hp = 1; this.maxHp = 1; this.prev = null; this.shown = 1; this.shake = 0; this.t = 0; this.flash = 0; }
    tick(dt) { this.t += dt; this.shown += (this.hp - this.shown) * Math.min(1, dt / 120); }
    draw(ctx) {
      const sx = this.shake ? U.snap(Math.sin(this.t / 20) * this.shake) : 0;
      ctx.translate(sx, 0);
      A.panel(ctx, 6, 6, 44, 44, { fill: "#2b1d3d" });
      A.spr(ctx, this.sprite, 28, 44, { s: 2, white: this.flash });
      A.jp(ctx, this.name, 58, 6, { size: 16, color: C.cream });
      const x = 58, y = 30, w = 112, h = 12;
      ctx.fillStyle = C.ink; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = "#3b1a28"; ctx.fillRect(x, y, w, h);
      const fw = Math.round((w * Math.max(0, this.shown)) / this.maxHp);
      ctx.fillStyle = "#ff4d5e"; ctx.fillRect(x, y, fw, h);
      ctx.fillStyle = "#ff8f9b"; ctx.fillRect(x, y, fw, 2);
      ctx.fillStyle = "#b0263c"; ctx.fillRect(x, y + h - 2, fw, 2);
      if (this.prev != null && this.prev < this.hp) {
        const a = Math.round((w * Math.max(0, this.prev)) / this.maxHp);
        ctx.fillStyle = Math.floor(this.t / 120) % 2 ? "#ffffff" : "#ffd35a";
        ctx.fillRect(x + a, y, fw - a, h);
      }
      for (let i = 1; i < 6; i++) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x + Math.round((w * i) / 6), y, 2, h); }
      A.spr(ctx, "i_heart", x - 2, y + h + 1, { s: 2, ax: 0.5, ay: 1 });
      const hpTxt = this.prev != null && this.prev !== this.hp ? `${Math.max(0, this.prev)}/${this.maxHp}` : `${Math.max(0, Math.round(this.shown))}/${this.maxHp}`;
      A.text(ctx, hpTxt, x + w + 6, y - 1, { s: 2, color: this.prev != null && this.prev < this.hp ? "#ff8f9b" : C.cream });
    }
  }
  V.PlayerHUD = PlayerHUD;

  class TurnHUD extends EL.Node {
    constructor() { super("TurnHUD"); this.turn = 1; this.floor = ""; this.showTurn = true; }
    draw(ctx) {
      if (this.floor) A.jp(ctx, this.floor, 318, 8, { size: 16, align: "right", color: C.dim });
      if (this.showTurn) A.text(ctx, "TURN " + this.turn, 318, 30, { s: 2, align: "right", color: C.gold });
    }
  }
  V.TurnHUD = TurnHUD;

  class RelicHUD extends EL.Node {
    constructor() { super("RelicHUD"); this.x = 6; this.y = 52; this.ids = []; this.fresh = null; this.t = 0; }
    setRelics(ids) {
      this.ids = ids.slice();
      this.clear();
      ids.forEach((id, i) => {
        const b = new EL.Node("Relic:" + id);
        b.id = "relic"; b.payload = { relic: id }; b.interactive = true; b.inputKind = "button";
        b.x = i * 23; b.w = 22; b.h = 22;
        b.draw = (ctx) => {
          ctx.fillStyle = C.ink; ctx.fillRect(0, 0, 22, 22);
          ctx.fillStyle = b.pressed ? "#4a3a66" : "#2b2140"; ctx.fillRect(1, 1, 20, 20);
          A.spr(ctx, D.RELICS[id].icon, 11, 21, { s: 2 });
          if (this.fresh === id && Math.floor(this.t / 150) % 2) { ctx.fillStyle = "rgba(255,240,180,0.45)"; ctx.fillRect(1, 1, 20, 20); }
        };
        this.add(b);
      });
    }
    tick(dt) { this.t += dt; }
  }
  V.RelicHUD = RelicHUD;

  class MoveHUD extends EL.Node {
    constructor() { super("MovementHUD"); this.x = 12; this.y = 470; this.moves = 0; this.max = 5; this.prev = null; this.pulse = 0; this.t = 0; this.gain = 0; }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      A.panel(ctx, 0, 0, 166, 46, { fill: "#16203a", rim: "#2c4a7a", hi: C.move });
      const bump = this.pulse > 0 ? U.snap(this.pulse * 4) : 0;
      A.spr(ctx, "i_boot", 22, 38, { s: 3 });
      const val = this.prev != null ? this.prev : this.moves;
      const col = this.prev != null ? (this.prev > this.moves ? C.heal : this.prev <= 0 ? "#ff8f8f" : C.move) : C.cream;
      A.text(ctx, String(val), 62, 10 - bump / 2, { s: 4 + (bump ? 1 : 0), align: "center", color: col });
      // pips
      const n = Math.max(this.max, this.moves, this.prev || 0);
      const pw = Math.min(8, Math.floor(76 / Math.max(1, n)) - 2);
      for (let i = 0; i < n; i++) {
        const px = 86 + i * (pw + 2), py = 14;
        let c = "#2c3552";
        if (i < this.moves) c = C.move;
        if (this.prev != null) {
          if (i < Math.min(this.prev, this.moves)) c = C.move;
          else if (i < this.moves) c = Math.floor(this.t / 140) % 2 ? "#41507a" : "#2c3552";
          else if (i < this.prev) c = C.heal;
        }
        ctx.fillStyle = C.ink; ctx.fillRect(px - 1, py - 1, pw + 2, 20);
        ctx.fillStyle = c; ctx.fillRect(px, py, pw, 18);
      }
      if (this.gain > 0) {
        ctx.globalAlpha = this.gain;
        ctx.fillStyle = C.heal; ctx.fillRect(4, 4, 158, 38);
        ctx.globalAlpha = 1;
      }
    }
  }
  V.MoveHUD = MoveHUD;

  class PressureHUD extends EL.Node {
    constructor() { super("PressureHUD"); this.x = 186; this.y = 470; this.value = 0; this.prev = null; this.t = 0; this.pulse = 0; }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      A.panel(ctx, 0, 0, 162, 46, { fill: "#241428", rim: "#5a2a4a", hi: "#b08cff" });
      A.spr(ctx, "i_skull", 20, 36, { s: 3 });
      A.jp(ctx, "夜の圧", 40, 4, { size: 16, color: C.dim });
      const v = this.prev != null ? this.prev : this.value;
      const col = this.prev != null && this.prev < this.value ? C.heal : "#ff8f9b";
      if (this.prev != null && this.prev !== this.value) {
        A.text(ctx, "-" + this.value, 40, 26, { s: 2, color: C.mute });
        A.text(ctx, "-" + v, 150, 18, { s: 3, align: "right", color: col });
      } else A.text(ctx, "-" + v, 150, 18, { s: 3, align: "right", color: col });
    }
  }
  V.PressureHUD = PressureHUD;

  class CompanionCard extends EL.Node {
    constructor(i) {
      super("CompanionCard" + i);
      this.x = 12 + i * 114; this.y = 522; this.w = 108; this.h = 80;
      this.comp = null; this.cur = 0; this.need = 1; this.ready = false; this.used = 0; this.maxUses = 1; this.t = 0; this.bounce = 0; this.near = false;
      this.interactive = true; this.inputKind = "button"; this.id = "comp";
    }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      if (!this.comp) {
        ctx.fillStyle = "#1a1428"; ctx.fillRect(2, 2, this.w - 4, this.h - 4);
        ctx.fillStyle = "#2e2447";
        for (let i = 0; i < this.w; i += 8) { ctx.fillRect(i, 0, 4, 2); ctx.fillRect(i, this.h - 2, 4, 2); }
        for (let i = 0; i < this.h; i += 8) { ctx.fillRect(0, i, 2, 4); ctx.fillRect(this.w - 2, i, 2, 4); }
        A.jp(ctx, "仲間の枠", this.w / 2, this.h / 2 - 8, { size: 16, align: "center", color: "#3e345c", outline: false });
        return;
      }
      const info = D.COMPANIONS[this.comp];
      const spent = this.used >= this.maxUses;
      const b = this.bounce > 0 ? -U.snap(this.bounce * 6) : 0;
      A.panel(ctx, 0, b, this.w, this.h, { fill: this.ready ? "#3a2a1a" : "#1c1530", rim: this.ready ? info.color : "#3a2f58", hi: this.ready ? C.cream : info.color });
      if (this.ready) {
        const ga = ctx.globalAlpha;
        ctx.globalAlpha = ga * (0.4 + 0.3 * Math.sin(this.t / 80));
        ctx.fillStyle = info.color; ctx.fillRect(4, 4 + b, this.w - 8, this.h - 8);
        ctx.globalAlpha = ga;
      }
      A.spr(ctx, info.sprite, 22, 42 + b, { s: 2, alpha: spent ? 0.45 : 1 });
      A.jp(ctx, info.condText, 42, 8 + b, { size: 16, color: spent ? C.mute : C.cream });
      // progress pips
      const need = this.need;
      const pw = Math.min(10, Math.floor(58 / need) - 2);
      for (let i = 0; i < need; i++) {
        const px = 42 + i * (pw + 2), py = 32 + b;
        ctx.fillStyle = C.ink; ctx.fillRect(px - 1, py - 1, pw + 2, 10);
        ctx.fillStyle = spent ? "#2e2447" : i < this.cur ? info.color : "#2e2447";
        ctx.fillRect(px, py, pw, 8);
      }
      if (this.ready) A.text(ctx, "READY!", this.w / 2, 56 + b, { s: 2, align: "center", color: C.cream });
      else if (spent) A.text(ctx, "USED", this.w / 2, 56 + b, { s: 2, align: "center", color: C.mute });
      else A.jp(ctx, info.skill, this.w / 2, 52 + b, { size: 16, align: "center", color: this.near ? info.color : C.dim, outline: false });
    }
  }
  V.CompanionCard = CompanionCard;

  class CompanionHUD extends EL.Node {
    constructor() {
      super("CompanionHUD");
      this.cards = [0, 1, 2].map((i) => this.add(new CompanionCard(i)));
    }
  }
  V.CompanionHUD = CompanionHUD;

  class HintView extends EL.Node {
    constructor() { super("Hint"); this.text = ""; this.t = 0; this.y = 608; }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      if (!this.text) return;
      const f = Math.floor(this.t / 200) % 2;
      A.jp(ctx, this.text, 180, 6, { size: 16, align: "center", color: C.dim });
      ctx.fillStyle = C.ember;
      ctx.fillRect(12, 12 - f * 2, 4, 4 + f * 2);
      ctx.fillRect(344, 12 - f * 2, 4, 4 + f * 2);
    }
  }
  V.HintView = HintView;

  class IconButton extends ButtonView {
    constructor(id, icon) { super(id, "", 30, 30, {}); this.icon2 = icon; }
    draw(ctx) {
      const dy = A.button(ctx, 0, 0, this.w, this.h, { pressed: this.pressed, face: "#3a2f58", top: "#5a4a82", base: "#1a1428" });
      A.spr(ctx, this.icon2, 15, 22 + dy, { s: 2 });
    }
  }
  V.IconButton = IconButton;

  /* ================= map ================= */
  class MapNodeView extends EL.Node {
    constructor(node) {
      super("MapNode:" + node.id);
      this.node = node; this.id = "map.node"; this.payload = { node: node.id };
      this.x = node.x - 20; this.y = node.y - 20; this.w = 40; this.h = 40;
      this.interactive = true; this.inputKind = "button";
      this.state = "locked"; // locked | open | visited | current
      this.t = Math.random() * 1000;
    }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      const info = D.NODE_INFO[this.node.type];
      const big = this.node.type === "boss";
      const open = this.state === "open";
      const cx = 20, cy = 20;
      const r = big ? 22 : 16;
      const pulse = open ? Math.round((Math.sin(this.t / 180) + 1) * 2) * 2 : 0;
      if (open) {
        ctx.fillStyle = info.color;
        ctx.globalAlpha *= 0.35;
        A.pellipse(ctx, cx, cy, r + 4 + pulse, r + 4 + pulse, true);
        ctx.globalAlpha /= 0.35;
      }
      ctx.fillStyle = C.ink; A.pellipse(ctx, cx, cy, r + 2, r + 2, true);
      ctx.fillStyle = this.state === "visited" ? "#2a2238" : this.state === "locked" ? "#231c33" : "#3a2f58";
      A.pellipse(ctx, cx, cy, r, r, true);
      ctx.fillStyle = open ? info.color : this.state === "visited" ? "#4a4060" : "#3e345c";
      A.pellipse(ctx, cx, cy, r, r);
      const s = big ? 3 : 2;
      const a = this.state === "locked" ? 0.55 : this.state === "visited" ? 0.4 : 1;
      A.spr(ctx, info.icon, cx, cy + 5 * s - (this.pressed ? -2 : 0), { s, alpha: a });
      if (this.state === "visited") { ctx.fillStyle = C.ember; ctx.fillRect(cx + 8, cy - 14, 6, 6); }
    }
  }
  class MapView extends EL.Node {
    constructor() { super("MapScreen"); this.map = null; this.nodeViews = {}; this.visited = []; this.current = null; this.open = []; this.t = 0; this.marker = { x: 0, y: 0 }; this.heroSprite = "kai"; this.floorText = ""; this.sub = ""; }
    setMap(map) {
      this.map = map; this.clear(); this.nodeViews = {};
      for (const id in map.nodes) this.nodeViews[id] = this.add(new MapNodeView(map.nodes[id]));
    }
    setState(visited, current, open) {
      this.visited = visited; this.current = current; this.open = open;
      for (const id in this.nodeViews) {
        const v = this.nodeViews[id];
        v.state = open.includes(id) ? "open" : visited.includes(id) ? "visited" : "locked";
      }
    }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      if (!this.map) return;
      A.jp(ctx, "灰の深層", 180, 84, { size: 32, align: "center", color: C.gold });
      A.jp(ctx, this.floorText, 180, 118, { size: 16, align: "center", color: C.dim });
      if (this.sub) A.jp(ctx, this.sub, 196, 616, { size: 16, align: "center", color: C.emberL });
      const N = this.map.nodes;
      for (const id in N) {
        const a = N[id];
        for (const nid of a.next) {
          const b = N[nid];
          const walked = this.visited.includes(id) && (this.visited.includes(nid) || this.current === nid);
          const avail = this.current === id && this.open.includes(nid);
          const start = !this.current && false;
          const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.floor(L / 8);
          for (let i = 2; i < n - 1; i++) {
            const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
            if (walked) { ctx.fillStyle = C.ember; ctx.fillRect(U.snap(x) - 2, U.snap(y) - 2, 4, 4); }
            else if (avail) { if ((i + Math.floor(this.t / 120)) % 3) { ctx.fillStyle = C.emberL; ctx.fillRect(U.snap(x) - 2, U.snap(y) - 2, 4, 4); } }
            else if (i % 2 === 0 || start) { ctx.fillStyle = "#3e345c"; ctx.fillRect(U.snap(x) - 1, U.snap(y) - 1, 2, 2); }
          }
        }
      }
    }
    drawOver(ctx) {
      // hero marker
      const bob = Math.sin(this.t / 200) > 0 ? -2 : 0;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      A.pellipse(ctx, this.marker.x, this.marker.y + 2, 10, 4, true);
      A.spr(ctx, this.heroSprite, this.marker.x, this.marker.y + bob, { s: 2 });
    }
  }
  V.MapView = MapView;

  /* ================= modals ================= */
  class ModalBase extends EL.Node {
    constructor(name) { super(name); this.w = 360; this.h = 640; this.blocker = true; this.shade = 0.7; this.t = 0; }
    tick(dt) { this.t += dt; }
    draw(ctx) { ctx.fillStyle = `rgba(6,4,12,${this.shade})`; ctx.fillRect(0, 0, 360, 640); }
  }
  V.ModalBase = ModalBase;

  class TitleView extends ModalBase {
    constructor() {
      super("TitleScreen"); this.shade = 0;
      this.start = this.add(new ButtonView("title.start", "はじめる", 200, 52, { size: 16 }));
      this.start.x = 80; this.start.y = 470;
      this.help = this.add(new ButtonView("title.help", "遊び方", 200, 44, { face: "#3a2f58", top: "#5a4a82", base: "#1a1428", color: C.cream, outline: C.ink }));
      this.help.x = 80; this.help.y = 536;
      this.record = "";
      this.trail = [];
    }
    tick(dt) { super.tick(dt); }
    draw(ctx) {
      // marching party with ember trail
      const baseY = 400;
      const k = (this.t / 26) % 460;
      for (let i = 0; i < 40; i++) {
        const x = k - 60 - i * 10;
        if (x < -10 || x > 370) continue;
        ctx.globalAlpha = Math.max(0, 1 - i / 40) * 0.9;
        ctx.fillStyle = i < 6 ? C.emberL : i < 18 ? C.ember : "#6e3a2a";
        ctx.fillRect(U.snap(x), baseY + ((i * 7) % 3) * 2 - 2, 6, 2);
      }
      ctx.globalAlpha = 1;
      const order = ["kai", "pip", "mira", "luna"];
      order.forEach((sp, i) => {
        const x = k - 40 - i * 28;
        if (x > -30 && x < 390) A.spr(ctx, sp, U.snap(x), baseY - (Math.floor(this.t / 150 + i) % 2) * 2, { s: 2 });
      });
      // logo glow + rising sparks
      const glow = 0.05 + 0.015 * Math.sin(this.t / 400);
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = k < 3 ? `rgba(255,110,40,${glow})` : `rgba(255,200,90,${glow})`;
        A.pellipse(ctx, 180, 196, 170 - k * 26, 78 - k * 12, true);
      }
      for (let i = 0; i < 26; i++) {
        const ph = (this.t / (1800 + i * 90) + i * 0.37) % 1;
        const x = 40 + ((i * 97) % 280) + Math.sin(this.t / 500 + i) * 6;
        const y = 270 - ph * 170;
        ctx.globalAlpha = (1 - ph) * 0.9;
        ctx.fillStyle = i % 3 ? C.ember : C.emberL;
        ctx.fillRect(U.snap(x), U.snap(y), 2, 2);
      }
      ctx.globalAlpha = 1;
      // logo
      const bob = Math.round(Math.sin(this.t / 600) * 2) * 2;
      A.text(ctx, "EMBER", 180, 150 + bob, { s: 7, align: "center", color: C.ember, grad: C.emberL, outline: "#2a0a10" });
      A.text(ctx, "LINE", 180, 214 + bob, { s: 7, align: "center", color: C.emberL, grad: C.cream, outline: "#2a0a10" });
      A.jp(ctx, "燈 路 の 行 軍", 180, 284, { size: 32, align: "center", color: C.cream });
      A.jp(ctx, "指で描いた道が、そのまま刃になる。", 180, 330, { size: 16, align: "center", color: C.dim });
      if (this.record) A.jp(ctx, this.record, 180, 604, { size: 16, align: "center", color: C.mute });
    }
  }
  V.TitleView = TitleView;

  class CharCard extends EL.Node {
    constructor(heroId, i) {
      super("CharCard:" + heroId); this.hero = heroId; this.id = "char.pick"; this.payload = { hero: heroId };
      this.x = 12 + i * 114; this.y = 96; this.w = 108; this.h = 132; this.interactive = true; this.inputKind = "button"; this.selected = false; this.t = 0;
    }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      const h = D.HEROES[this.hero];
      const lift = this.selected ? -6 : 0;
      A.panel(ctx, 0, lift, this.w, this.h, { fill: this.selected ? "#3a2440" : "#1c1530", rim: this.selected ? h.color : "#3a2f58", hi: this.selected ? C.cream : "#5a4a82" });
      const glow = this.selected ? 0.25 + 0.15 * Math.sin(this.t / 150) : 0;
      if (glow) { ctx.fillStyle = `rgba(255,200,120,${glow})`; A.pellipse(ctx, 54, 86 + lift, 30, 8, true); }
      A.spr(ctx, h.sprite, 54, 92 + lift - (this.selected ? (Math.floor(this.t / 200) % 2) * 2 : 0), { s: 4 });
      A.jp(ctx, h.name, 54, 98 + lift, { size: 16, align: "center", color: this.selected ? C.cream : C.dim });
    }
  }
  class CharSelectView extends ModalBase {
    constructor() {
      super("CharacterSelect"); this.shade = 0.35;
      this.cards = Object.keys(D.HEROES).map((id, i) => this.add(new CharCard(id, i)));
      this.confirm = this.add(new ButtonView("char.confirm", "この燈で行く", 220, 52));
      this.confirm.x = 70; this.confirm.y = 566;
      this.back = this.add(new ButtonView("char.back", "戻る", 64, 36, { face: "#3a2f58", top: "#5a4a82", base: "#1a1428", color: C.cream, outline: C.ink }));
      this.back.x = 8; this.back.y = 8;
      this.selected = null;
    }
    draw(ctx) {
      super.draw(ctx);
      A.jp(ctx, "主人公を選ぶ", 180, 52, { size: 32, align: "center", color: C.gold });
      const id = this.selected;
      if (!id) { A.jp(ctx, "カードをタップして選択", 180, 300, { size: 16, align: "center", color: C.dim }); return; }
      const h = D.HEROES[id];
      A.panel(ctx, 12, 244, 336, 308, { fill: "#1c1530" });
      A.jp(ctx, h.title, 28, 256, { size: 16, color: h.color });
      A.jp(ctx, h.name, 28, 276, { size: 32, color: C.cream });
      const rows = [["HP", h.hp, h.stats.hp, "#ff4d5e"], ["ATK", h.atk, h.stats.atk, C.gold], ["MOV", h.mov, h.stats.mov, C.move]];
      rows.forEach(([k, v, n, col], i) => {
        const y = 324 + i * 24;
        A.text(ctx, k, 28, y, { s: 2, color: C.dim });
        for (let j = 0; j < 6; j++) { ctx.fillStyle = C.ink; ctx.fillRect(88 + j * 20, y - 2, 18, 14); ctx.fillStyle = j < n ? col : "#2e2447"; ctx.fillRect(90 + j * 20, y, 14, 10); }
        A.text(ctx, String(v), 222, y, { s: 2, color: C.cream });
      });
      A.jp(ctx, "撃破で移動回復", 28, 394, { size: 16, color: C.dim });
      A.text(ctx, "+" + h.refund, 222, 398, { s: 2, color: C.heal });
      A.jp(ctx, "【" + h.trait + "】", 28, 428, { size: 16, color: C.gold });
      A.wrap(ctx, h.traitText, 300, 16).forEach((l, i) => A.jp(ctx, l, 28, 452 + i * 20, { size: 16, color: C.cream }));
      A.wrap(ctx, h.style, 300, 16).forEach((l, i) => A.jp(ctx, l, 28, 518 + i * 20, { size: 16, color: C.dim }));
    }
  }
  V.CharSelectView = CharSelectView;

  class RewardCard extends EL.Node {
    constructor(i, r) {
      super("RewardCard" + i); this.r = r; this.id = "reward.card"; this.payload = { index: i };
      this.w = 106; this.h = 156; this.x = 11 + i * 114; this.y = 150; this.interactive = true; this.inputKind = "button"; this.selected = false; this.t = 0; this.flip = 0;
    }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      if (this.flip < 1) {
        // card back while flipping in
        ctx.save();
        ctx.translate(this.w / 2, 0);
        ctx.scale(Math.max(0.05, Math.abs(1 - this.flip * 2)), 1);
        ctx.translate(-this.w / 2, 0);
        if (this.flip < 0.5) {
          A.panel(ctx, 0, 0, this.w, this.h, { fill: "#3a1a14", rim: C.emberD, hi: C.ember });
          A.spr(ctx, "i_flame", this.w / 2, this.h / 2 + 10, { s: 4 });
          ctx.restore();
          return;
        }
      }
      const r = this.r;
      const isComp = r.kind === "comp";
      const info = isComp ? D.COMPANIONS[r.id] : D.RELICS[r.id];
      const rare = !isComp && info.rarity === 2;
      const lift = this.selected ? -8 : 0;
      const rim = this.selected ? C.cream : isComp ? info.color : rare ? "#b08cff" : C.goldD;
      A.panel(ctx, 0, lift, this.w, this.h, { fill: this.selected ? "#34254a" : "#1c1530", rim, hi: this.selected ? C.gold : rim });
      const bob = this.selected ? (Math.floor(this.t / 220) % 2) * 2 : 0;
      if (isComp) A.spr(ctx, info.sprite, this.w / 2, 78 + lift - bob, { s: 4 });
      else {
        ctx.fillStyle = rare ? "rgba(176,140,255,0.2)" : "rgba(255,211,90,0.15)";
        A.pellipse(ctx, this.w / 2, 52 + lift, 28, 28, true);
        A.spr(ctx, info.icon, this.w / 2, 72 + lift - bob, { s: 4 });
      }
      A.jp(ctx, isComp ? "仲間" : rare ? "稀少レリック" : "レリック", this.w / 2, 88 + lift, { size: 16, align: "center", color: isComp ? info.color : rare ? "#c9b3ff" : C.gold, outline: false });
      const nm = A.wrap(ctx, info.name, this.w - 12, 16);
      nm.slice(0, 2).forEach((l, i) => A.jp(ctx, l, this.w / 2, 110 + lift + i * 18, { size: 16, align: "center", color: C.cream }));
      if (this.flip < 1) ctx.restore();
    }
  }
  class RewardView extends ModalBase {
    constructor() {
      super("RewardSelect");
      this.cards = []; this.selected = -1; this.title = "戦利品"; this.sub = "";
      this.confirm = this.add(new ButtonView("reward.confirm", "受け取る", 200, 50));
      this.confirm.x = 80; this.confirm.y = 520;
      this.skip = this.add(new ButtonView("reward.skip", "見送る（HP+3）", 200, 38, { face: "#3a2f58", top: "#5a4a82", base: "#1a1428", color: C.cream, outline: C.ink }));
      this.skip.x = 80; this.skip.y = 582;
    }
    setRewards(list) {
      this.cards.forEach((c) => this.remove(c));
      this.cards = list.map((r, i) => this.add(new RewardCard(i, r)));
      this.cards.forEach((c) => { const x = c.x; c.x = (360 - list.length * 114) / 2 + (x - 11) + 3; });
      this.selected = -1;
    }
    draw(ctx) {
      super.draw(ctx);
      A.jp(ctx, this.title, 180, 60, { size: 32, align: "center", color: C.gold });
      if (this.sub) A.jp(ctx, this.sub, 180, 102, { size: 16, align: "center", color: C.dim });
      A.panel(ctx, 12, 328, 336, 180, { fill: "#1c1530" });
      const c = this.cards[this.selected];
      if (!c) { A.jp(ctx, "ひとつ選んでください", 180, 404, { size: 16, align: "center", color: C.dim }); return; }
      const r = c.r;
      if (r.kind === "comp") {
        const info = D.COMPANIONS[r.id];
        A.jp(ctx, info.title + "　" + info.name, 28, 342, { size: 16, color: info.color });
        A.jp(ctx, "発動条件", 28, 370, { size: 16, color: C.gold });
        A.wrap(ctx, info.condLong, 300, 16).forEach((l, i) => A.jp(ctx, l, 28, 390 + i * 20, { size: 16, color: C.cream }));
        A.jp(ctx, "能力「" + info.skill + "」", 28, 434, { size: 16, color: C.gold });
        A.wrap(ctx, info.skillText, 300, 16).forEach((l, i) => A.jp(ctx, l, 28, 454 + i * 20, { size: 16, color: C.cream }));
        A.jp(ctx, "※仲間が増えるほど足跡が長く残る", 28, 484, { size: 16, color: "#ff8f9b", outline: false });
      } else {
        const info = D.RELICS[r.id];
        A.jp(ctx, info.name, 28, 342, { size: 16, color: info.rarity === 2 ? "#c9b3ff" : C.gold });
        A.wrap(ctx, info.desc, 300, 16).forEach((l, i) => A.jp(ctx, l, 28, 372 + i * 22, { size: 16, color: C.cream }));
      }
    }
  }
  V.RewardView = RewardView;

  class ChoiceView extends ModalBase {
    constructor() { super("ChoiceModal"); this.title = ""; this.body = ""; this.icon = null; this.buttons = []; }
    setContent(title, body, icon, choices) {
      this.title = title; this.body = body; this.icon = icon;
      this.buttons.forEach((b) => this.remove(b));
      this.buttons = choices.map((c, i) => {
        const b = this.add(new ButtonView("choice", c.label, 300, 48, { size: 16 }));
        b.payload = { index: i }; b.x = 30; b.y = 420 + i * 60; b.disabled = !!c.disabled;
        return b;
      });
    }
    draw(ctx) {
      super.draw(ctx);
      A.panel(ctx, 20, 96, 320, 300, { fill: "#1c1530" });
      if (this.icon) {
        ctx.fillStyle = "rgba(255,138,42,0.15)"; A.pellipse(ctx, 180, 160, 34, 30, true);
        A.spr(ctx, this.icon, 180, 196 - (Math.floor(this.t / 300) % 2) * 2, { s: 5 });
      }
      A.jp(ctx, this.title, 180, 216, { size: 32, align: "center", color: C.gold });
      A.wrap(ctx, this.body, 280, 16).forEach((l, i) => A.jp(ctx, l, 180, 266 + i * 22, { size: 16, align: "center", color: C.cream }));
    }
  }
  V.ChoiceView = ChoiceView;

  class PauseView extends ModalBase {
    constructor() {
      super("Pause");
      const mk = (id, label, y, dark) => {
        const b = this.add(new ButtonView(id, label, 240, 48, dark ? { face: "#3a2f58", top: "#5a4a82", base: "#1a1428", color: C.cream, outline: C.ink } : {}));
        b.x = 60; b.y = y; return b;
      };
      this.resume = mk("pause.resume", "つづける", 200);
      this.bgm = mk("pause.bgm", "BGM", 264, true);
      this.sfx = mk("pause.sfx", "効果音", 324, true);
      this.help = mk("pause.help", "遊び方", 384, true);
      this.quit = mk("pause.quit", "ランをあきらめる", 460, true);
      this.quit.o.color = "#ff8f9b";
    }
    draw(ctx) { super.draw(ctx); A.jp(ctx, "ひと休み", 180, 130, { size: 32, align: "center", color: C.gold }); }
  }
  V.PauseView = PauseView;

  const HELP = [
    { t: "ルートを描く", b: "主人公から指をすべらせて、進む道を描く。斜めにも進める。指を離すと、その道を一気に駆け抜ける。", demo: "route" },
    { t: "敵を切り抜ける", b: "道の途中に敵がいれば、通り抜けざまに斬る。倒しきれないと反撃を受ける。道の終点は空きマスでなければならない。", demo: "attack" },
    { t: "ウィークサイド", b: "盾に囲まれていない光る側面が弱点。矢印の方向からまっすぐ突っ込むと、大ダメージで反撃も受けない。", demo: "weak" },
    { t: "撃破で移動回復", b: "敵を倒すたびに移動力が回復する。倒して、進んで、また倒す。長い連鎖が勝利への近道。", demo: "chain" },
    { t: "燠火の足跡", b: "歩いたマスは燃えて、しばらく入れない。斜めに交差するのはOK。仲間が増えるほど足跡は長く残る。", demo: "ember" },
    { t: "夜の圧", b: "ターン終了時、生き残った敵の数だけダメージを受ける。紫の炎の数がその敵の圧。のんびりしていると押し潰される。", demo: "pressure" },
    { t: "仲間の力", b: "仲間はルートの「形」で能力を発動する。直進、L字、ジグザグ、輪…。描く道そのものが作戦になる。", demo: "comp" },
  ];
  class HelpView extends ModalBase {
    constructor() {
      super("Help"); this.shade = 0.96; this.page = 0;
      this.prev = this.add(new ButtonView("help.prev", "◀", 64, 44, { face: "#3a2f58", top: "#5a4a82", base: "#1a1428", color: C.cream, outline: C.ink }));
      this.next = this.add(new ButtonView("help.next", "▶", 64, 44, { face: "#3a2f58", top: "#5a4a82", base: "#1a1428", color: C.cream, outline: C.ink }));
      this.close = this.add(new ButtonView("help.close", "とじる", 150, 44));
      this.prev.x = 24; this.next.x = 272; this.close.x = 105;
      this.prev.y = this.next.y = this.close.y = 560;
      this.pages = HELP;
    }
    draw(ctx) {
      super.draw(ctx);
      const p = HELP[this.page];
      A.text(ctx, `${this.page + 1}/${HELP.length}`, 180, 40, { s: 2, align: "center", color: C.dim });
      A.jp(ctx, p.t, 180, 62, { size: 32, align: "center", color: C.gold });
      A.panel(ctx, 30, 110, 300, 270, { fill: "#171125" });
      this.demo(ctx, p.demo);
      A.wrap(ctx, p.b, 300, 16).forEach((l, i) => A.jp(ctx, l, 30, 400 + i * 24, { size: 16, color: C.cream }));
    }
    /* tiny animated diagrams built from the same sprites */
    demo(ctx, kind) {
      const t = this.t;
      const S = 40, ox = 60, oy = 130;
      const cell = (x, y) => ({ x: ox + x * S + S / 2, y: oy + y * S + S / 2 });
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { ctx.fillStyle = (x + y) % 2 ? "#2c2444" : "#322a4c"; ctx.fillRect(ox + x * S, oy + y * S, S - 2, S - 2); }
      const path = { route: [[1, 5], [1, 4], [2, 3], [3, 3], [4, 2], [4, 1]], attack: [[1, 4], [2, 4], [3, 4], [4, 4]], weak: [[2, 5], [2, 4], [2, 3], [2, 2]], chain: [[0, 4], [1, 3], [2, 3], [3, 2], [4, 2], [5, 1]], ember: [[1, 5], [1, 4], [2, 3], [3, 4], [3, 5], [2, 4].slice(), [1, 3]], pressure: [], comp: [[1, 5], [1, 4], [1, 3], [2, 3], [3, 3]] }[kind] || [];
      const prog = (t % 3200) / 2400;
      const n = Math.min(path.length, Math.floor(prog * path.length) + 1);
      ctx.fillStyle = kind === "ember" ? C.ember : C.cream;
      for (let i = 1; i < n; i++) { const a = cell(...path[i - 1]), b = cell(...path[i]); A.pline(ctx, a.x, a.y, b.x, b.y, 4); }
      if (kind === "ember") for (let i = 0; i < n; i++) { const c = cell(...path[i]); ctx.globalAlpha = 0.5; ctx.fillStyle = C.emberD; ctx.fillRect(c.x - 16, c.y - 16, 30, 30); ctx.globalAlpha = 1; }
      const enemies = { attack: [[3, 4]], weak: [[2, 2]], chain: [[1, 3], [3, 2], [5, 1]], pressure: [[1, 1], [3, 2], [4, 4]], route: [], ember: [], comp: [[4, 1]] }[kind] || [];
      enemies.forEach(([x, y], i) => {
        const c = cell(x, y);
        const hit = path.findIndex((p) => p[0] === x && p[1] === y);
        const dead = hit >= 0 && hit < n - 0 && kind === "chain";
        if (!dead) A.spr(ctx, i % 2 ? "wisp" : "husk", c.x, c.y + 16, { s: 2 });
        if (kind === "weak") { ctx.fillStyle = C.weak; ctx.fillRect(c.x - 14, c.y + 16, 28, 4); ctx.fillStyle = "#7c86a3"; ctx.fillRect(c.x - 14, c.y - 18, 28, 4); ctx.fillRect(c.x - 18, c.y - 14, 4, 28); ctx.fillRect(c.x + 14, c.y - 14, 4, 28); }
        if (kind === "pressure") { ctx.fillStyle = "#b08cff"; for (let k = 0; k <= i; k++) ctx.fillRect(c.x - 16 + k * 6, c.y - 18, 4, 6); }
        if (dead) { A.text(ctx, "+2", c.x, c.y - 10, { s: 2, align: "center", color: C.heal }); }
      });
      const head = path.length ? cell(...path[Math.max(0, n - 1)]) : cell(2, 5);
      A.spr(ctx, "kai", head.x, head.y + 16, { s: 2 });
      if (kind === "comp" && n >= 5) { A.spr(ctx, "pip", head.x - 40, head.y + 16, { s: 2 }); ctx.fillStyle = C.emberL; A.pline(ctx, head.x, head.y, cell(4, 1).x, cell(4, 1).y, 4); }
      if (kind === "pressure") { const c = cell(2, 5); A.spr(ctx, "kai", c.x, c.y + 16, { s: 2 }); A.text(ctx, "-6", c.x, c.y - 30, { s: 3, align: "center", color: "#ff8f9b" }); }
    }
  }
  V.HelpView = HelpView;

  class ResultView extends ModalBase {
    constructor() {
      super("RunResult"); this.win = false; this.lines = []; this.heroSprite = "kai"; this.comps = []; this.relics = [];
      this.ok = this.add(new ButtonView("result.ok", "タイトルへ", 220, 52)); this.ok.x = 70; this.ok.y = 560;
    }
    draw(ctx) {
      super.draw(ctx);
      const col = this.win ? C.gold : "#ff8f9b";
      A.text(ctx, this.win ? "VICTORY" : "DEFEAT", 180, 70, { s: 6, align: "center", color: col, grad: C.cream });
      A.jp(ctx, this.win ? "灰冠の王は崩れ落ちた" : "燈は、ここで途絶えた", 180, 134, { size: 16, align: "center", color: C.cream });
      const xs = [104, 256, 60, 300];
      this.comps.forEach((c, i) => A.spr(ctx, D.COMPANIONS[c].sprite, xs[i], 236, { s: 3 }));
      A.spr(ctx, this.heroSprite, 180, 236, { s: 5 });
      A.panel(ctx, 30, 256, 300, 180, { fill: "#1c1530" });
      this.lines.forEach(([k, v], i) => {
        A.jp(ctx, k, 50, 272 + i * 30, { size: 16, color: C.dim });
        if (v !== "") A.text(ctx, String(v), 310, 280 + i * 30, { s: 2, align: "right", color: C.cream });
      });
      this.relics.forEach((r, i) => A.spr(ctx, D.RELICS[r].icon, 40 + (i % 12) * 24, 470 + Math.floor(i / 12) * 24, { s: 2 }));
    }
  }
  V.ResultView = ResultView;

  /* ================= transitions ================= */
  class WipeView extends EL.Node {
    constructor() { super("ScreenFade"); this.p = 0; this.color = "#07050d"; }
    draw(ctx) {
      if (this.p <= 0) return;
      const S = 24;
      ctx.fillStyle = this.color;
      for (let y = -1; y < 640 / S + 1; y++)
        for (let x = -1; x < 360 / S + 1; x++) {
          const d = (x + y) / (360 / S + 640 / S);
          const k = U.clamp(this.p * 2 - d, 0, 1);
          if (k <= 0) continue;
          const r = Math.ceil((k * S * 0.75) / 2) * 2;
          const cx = x * S + S / 2, cy = y * S + S / 2;
          for (let yy = -r; yy <= r; yy += 2) { const w = r - Math.abs(yy); ctx.fillRect(cx - w, cy + yy, w * 2, 2); }
        }
    }
  }
  V.WipeView = WipeView;

  class StageIntroView extends EL.Node {
    constructor() { super("StageTransition"); this.alpha = 0; this.title = ""; this.sub = ""; this.color = C.gold; this.icon = null; this.t = 0; }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      ctx.fillStyle = "rgba(6,4,12,0.8)"; ctx.fillRect(0, 230, 360, 150);
      ctx.fillStyle = this.color; ctx.fillRect(0, 230, 360, 2); ctx.fillRect(0, 378, 360, 2);
      if (this.icon) A.spr(ctx, this.icon, 180, 288, { s: 4 });
      A.jp(ctx, this.title, 180, 296, { size: 32, align: "center", color: this.color });
      A.jp(ctx, this.sub, 180, 340, { size: 16, align: "center", color: C.cream });
    }
  }
  V.StageIntroView = StageIntroView;

  class BossIntroView extends EL.Node {
    constructor() { super("BossIntro"); this.alpha = 0; this.bars = 0; this.p = 0; this.t = 0; this.shake = 0; }
    tick(dt) { this.t += dt; }
    draw(ctx) {
      const bh = U.snap(90 * this.bars);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 360, bh); ctx.fillRect(0, 640 - bh, 360, bh);
      const sx = this.shake ? U.snap(Math.sin(this.t / 16) * this.shake) : 0;
      ctx.globalAlpha *= this.p;
      ctx.fillStyle = "rgba(60,8,20,0.7)"; ctx.fillRect(0, 150, 360, 300);
      A.spr(ctx, "boss", 180 + sx, 380, { s: 6, white: Math.max(0, 1 - this.p * 1.4) });
      A.text(ctx, "BOSS", 180 + sx, 410, { s: 4, align: "center", color: "#ff4d5e", grad: C.cream });
      A.jp(ctx, "灰冠の王 ヴォルグ", 180, 452, { size: 32, align: "center", color: C.gold });
      ctx.globalAlpha /= Math.max(0.001, this.p);
    }
  }
  V.BossIntroView = BossIntroView;
})(window.EL);
