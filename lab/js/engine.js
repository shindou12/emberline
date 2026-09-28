/* EMBERLINE — engine: math, clocks, tweens, scene graph, input, particles */
window.EL = window.EL || {};
(function (EL) {
  "use strict";

  EL.W = 360;
  EL.H = 640;

  /* ---------- math ---------- */
  const U = (EL.U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    snap: (v) => Math.round(v / 2) * 2,
    sign: (v) => (v > 0 ? 1 : v < 0 ? -1 : 0),
  });
  U.ease = {
    linear: (t) => t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inQuad: (t) => t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1,
  };

  /* ---------- clocks ----------
     world: frozen by hitstop / pause / slow-mo (board, units, vfx)
     ui:    always runs (menus, HUD, transitions) */
  const Time = (EL.Time = { world: 0, ui: 0, hitstop: 0, slow: 1, paused: false });
  EL.hitstop = (ms) => { Time.hitstop = Math.max(Time.hitstop, ms); };

  /* ---------- tweens ---------- */
  class Tweens {
    constructor() { this.list = []; }
    to(target, props, dur, o = {}) {
      return new Promise((resolve) => {
        this.list.push({
          target, props, dur: Math.max(1, dur || 1), ease: o.ease || U.ease.outCubic,
          delay: o.delay || 0, clock: o.clock || "world", t: 0, from: null, resolve,
          onUpdate: o.onUpdate || null, done: false,
        });
      });
    }
    update(dw, du) {
      const list = this.list;
      let anyDone = false;
      for (let i = 0; i < list.length; i++) {
        const tw = list[i];
        if (tw.done) continue;
        const dt = tw.clock === "ui" ? du : dw;
        if (tw.delay > 0) { tw.delay -= dt; if (tw.delay > 0) continue; }
        if (!tw.from && tw.target && tw.props) {
          tw.from = {};
          for (const k in tw.props) tw.from[k] = tw.target[k];
        }
        tw.t += dt;
        const p = Math.min(1, tw.t / tw.dur), e = tw.ease(p);
        if (tw.target && tw.props) for (const k in tw.props) tw.target[k] = tw.from[k] + (tw.props[k] - tw.from[k]) * e;
        if (tw.onUpdate) tw.onUpdate(e, p);
        if (p >= 1) { tw.done = true; anyDone = true; }
      }
      if (anyDone) {
        const done = list.filter((t) => t.done);
        this.list = list.filter((t) => !t.done);
        done.forEach((t) => t.resolve());
      }
    }
    kill(target) {
      const k = this.list.filter((t) => t.target === target);
      this.list = this.list.filter((t) => t.target !== target);
      k.forEach((t) => t.resolve());
    }
  }
  EL.tweens = new Tweens();
  EL.tween = (t, p, d, o) => EL.tweens.to(t, p, d, o);
  EL.wait = (ms, clock) => EL.tweens.to(null, null, ms, { clock: clock || "world" });

  /* ---------- scene graph ----------
     Every drawable is a Node under GameRoot. Views are passive: they own draw
     parameters only. Events bubble child → parent (chain of responsibility). */
  class Node {
    constructor(name) {
      this.name = name || "node";
      this.children = [];
      this.parent = null;
      this.x = 0; this.y = 0;
      this.sx = 1; this.sy = 1; this.px = 0; this.py = 0; // scale + pivot
      this.alpha = 1;
      this.visible = true;
      this.w = 0; this.h = 0;
      this.interactive = false;
      this.blocker = false; // swallows input (modal backdrops)
      this.inputKind = null; // 'button' | 'route'
      this.id = null;
      this.payload = null;
      this._h = {};
    }
    add(c) { if (c.parent) c.parent.remove(c); c.parent = this; this.children.push(c); return c; }
    remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; }
    clear() { this.children.forEach((c) => (c.parent = null)); this.children = []; }
    on(type, fn) { (this._h[type] = this._h[type] || []).push(fn); return this; }
    /* Bubble an event from this node to the root. A handler returning true stops it. */
    emit(type, data) {
      const evt = { type, data: Object.assign({}, data || {}), source: this, path: [] };
      let n = this;
      while (n) {
        evt.path.push(n.name);
        const hs = (n._h[type] || []).concat(n._h["*"] || []);
        for (const h of hs) if (h(evt) === true) return evt;
        n = n.parent;
      }
      return evt;
    }
    update(dt, clocks) {
      if (this.tick) this.tick(dt, clocks);
      for (let i = 0; i < this.children.length; i++) this.children[i].update(dt, clocks);
    }
    render(ctx) {
      if (!this.visible || this.alpha <= 0.003) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.sx !== 1 || this.sy !== 1) {
        ctx.translate(this.px, this.py);
        ctx.scale(this.sx, this.sy);
        ctx.translate(-this.px, -this.py);
      }
      ctx.globalAlpha *= this.alpha;
      this.draw(ctx);
      for (let i = 0; i < this.children.length; i++) this.children[i].render(ctx);
      if (this.drawOver) this.drawOver(ctx);
      ctx.restore();
    }
    draw() {}
    toLocal(x, y) {
      const lx = (x - this.x - this.px) / this.sx + this.px;
      const ly = (y - this.y - this.py) / this.sy + this.py;
      return { x: lx, y: ly };
    }
    hit(x, y) {
      if (!this.visible || this.alpha <= 0.05) return null;
      const l = this.toLocal(x, y);
      for (let i = this.children.length - 1; i >= 0; i--) {
        const r = this.children[i].hit(l.x, l.y);
        if (r) return r;
      }
      const inside = l.x >= 0 && l.y >= 0 && l.x < this.w && l.y < this.h;
      if (inside && (this.interactive || this.blocker)) return { node: this, x: l.x, y: l.y };
      return null;
    }
    /* global → local through the parent chain */
    globalToLocal(x, y) {
      const chain = [];
      let n = this;
      while (n) { chain.unshift(n); n = n.parent; }
      let p = { x, y };
      for (const c of chain) p = c.toLocal(p.x, p.y);
      return p;
    }
    localToGlobal(x, y) {
      let n = this, p = { x, y };
      while (n) {
        p = { x: (p.x - n.px) * n.sx + n.px + n.x, y: (p.y - n.py) * n.sy + n.py + n.y };
        n = n.parent;
      }
      return p;
    }
  }
  EL.Node = Node;

  /* A layer that ticks on the world clock or the ui clock */
  class Layer extends Node {
    constructor(name, clock) { super(name); this.clock = clock || "ui"; }
    update(dt, clocks) { super.update(this.clock === "world" ? clocks.world : clocks.ui, clocks); }
  }
  EL.Layer = Layer;

  /* HD-2D style pseudo-perspective: children render into an offscreen buffer
     which is drawn in horizontal strips, narrower and flatter toward the top
     so the board reads as a floor receding into the distance. toLocal() is
     the exact inverse, so input hit-testing still lands on the right tile. */
  class WarpLayer extends Layer {
    constructor(name, clock) {
      super(name, clock);
      this.enabled = false; this.buf = null; this.bctx = null; this.K = 1;
      this.top = 80; this.bot = 470; this.sTop = 0.8; this.vPow = 1.35; this.zoom = 1; this.zc = { x: 180, y: 300 };
      this.table();
    }
    scaleAt(y) {
      if (y >= this.bot) return 1;
      if (y <= this.top) return this.sTop;
      return this.sTop + (1 - this.sTop) * ((y - this.top) / (this.bot - this.top));
    }
    table() {
      const H = EL.H, dy = new Float32Array(H + 1);
      dy[this.bot] = this.bot;
      for (let y = this.bot - 1; y >= 0; y--) dy[y] = dy[y + 1] - Math.pow(this.scaleAt(y + 0.5), this.vPow);
      for (let y = this.bot + 1; y <= H; y++) dy[y] = dy[y - 1] + 1;
      this.DY = dy;
    }
    destY(y) {
      const yy = U.clamp(y, 0, EL.H), i = Math.min(EL.H - 1, Math.floor(yy)), f = yy - i;
      return this.DY[i] + (this.DY[i + 1] - this.DY[i]) * f;
    }
    /* world coords → screen coords (for overlays: damage numbers, lights…) */
    project(x, y) {
      if (!this.enabled) return { x: x + this.x, y: y + this.y };
      const s = this.scaleAt(y);
      const px = (x - 180) * s + 180, py = this.destY(y);
      const z = this.zoom;
      return { x: this.zc.x + (px - this.zc.x) * z + this.x, y: this.zc.y + (py - this.zc.y) * z + this.y };
    }
    toLocal(x, y) {
      if (!this.enabled) return super.toLocal(x, y);
      x -= this.x; y -= this.y;
      x = this.zc.x + (x - this.zc.x) / this.zoom; y = this.zc.y + (y - this.zc.y) / this.zoom;
      let lo = -200, hi = EL.H + 200;
      const f = (sy) => (sy < 0 ? this.DY[0] + sy * Math.pow(this.sTop, this.vPow) : sy > EL.H ? this.DY[EL.H] + (sy - EL.H) : this.destY(sy));
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (f(m) < y) lo = m; else hi = m; }
      const sy = (lo + hi) / 2;
      return { x: (x - 180) / this.scaleAt(sy) + 180, y: sy };
    }
    render(ctx) {
      if (!this.enabled) return super.render(ctx);
      if (!this.visible || this.alpha <= 0.003) return;
      const K = EL.K || 1;
      if (!this.buf || this.K !== K) {
        this.K = K;
        this.buf = document.createElement("canvas");
        this.buf.width = EL.W * K; this.buf.height = EL.H * K;
        this.bctx = this.buf.getContext("2d");
      }
      const b = this.bctx;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, this.buf.width, this.buf.height);
      b.setTransform(K, 0, 0, K, 0, 0);
      b.imageSmoothingEnabled = false;
      b.globalAlpha = 1;
      for (let i = 0; i < this.children.length; i++) this.children[i].render(b);
      ctx.save();
      ctx.globalAlpha *= this.alpha;
      ctx.imageSmoothingEnabled = true;
      if (this.zoom !== 1) { ctx.translate(this.zc.x, this.zc.y); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.zc.x, -this.zc.y); }
      const step = 2;
      for (let y = 0; y < EL.H; y += step) {
        const s = this.scaleAt(y + step / 2);
        const d0 = this.DY[y], d1 = this.DY[Math.min(EL.H, y + step)];
        ctx.drawImage(this.buf, 0, y * K, EL.W * K, step * K, 180 - 180 * s + this.x, d0 + this.y, EL.W * s, d1 - d0 + 0.5);
      }
      ctx.restore();
    }
  }
  EL.WarpLayer = WarpLayer;

  /* ---------- input ----------
     Raw pointer events are converted here. Buttons get press visuals and emit
     'ui.click' on release. Route surfaces get phase callbacks and emit their
     own semantic 'route.input' events. Nothing here decides game outcomes. */
  class InputManager {
    constructor(canvas, root) {
      this.canvas = canvas; this.root = root;
      this.active = null; this.target = null; this.lastPos = null;
      const opt = { passive: false };
      canvas.addEventListener("pointerdown", (e) => this.down(e), opt);
      canvas.addEventListener("pointermove", (e) => this.move(e), opt);
      canvas.addEventListener("pointerup", (e) => this.up(e), opt);
      canvas.addEventListener("pointercancel", (e) => this.cancel(e), opt);
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      this.onAny = null;
    }
    pos(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * EL.W, y: ((e.clientY - r.top) / r.height) * EL.H };
    }
    down(e) {
      e.preventDefault();
      if (this.onAny) this.onAny();
      if (this.active !== null) return;
      const p = this.pos(e);
      const h = this.root.hit(p.x, p.y);
      this.active = e.pointerId;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      this.target = h ? h.node : null;
      this.lastPos = p;
      if (!this.target) return;
      if (this.target.inputKind === "route") this.target.routeInput("begin", p);
      else if (this.target.inputKind === "button" && !this.target.disabled) {
        this.target.pressed = true;
        this.target.emit("ui.press", { id: this.target.id });
      } else if (this.target.blocker) this.target.emit("ui.backdrop", {});
    }
    move(e) {
      if (e.pointerId !== this.active) return;
      e.preventDefault();
      const p = this.pos(e);
      this.lastPos = p;
      const t = this.target;
      if (!t) return;
      if (t.inputKind === "route") t.routeInput("move", p);
      else if (t.inputKind === "button") {
        const h = this.root.hit(p.x, p.y);
        t.pressed = !!(h && h.node === t);
      }
    }
    up(e) {
      if (e.pointerId !== this.active) return;
      e.preventDefault();
      const p = this.pos(e);
      const t = this.target;
      this.active = null; this.target = null;
      if (!t) return;
      if (t.inputKind === "route") t.routeInput("end", p);
      else if (t.inputKind === "button") {
        const h = this.root.hit(p.x, p.y);
        const inside = h && h.node === t;
        t.pressed = false;
        if (inside && !t.disabled) t.emit("ui.click", Object.assign({ id: t.id }, t.payload || {}));
      }
    }
    cancel(e) {
      if (e.pointerId !== this.active) return;
      const t = this.target;
      this.active = null; this.target = null;
      if (!t) return;
      if (t.inputKind === "route") t.routeInput("cancel", this.lastPos || { x: 0, y: 0 });
      else t.pressed = false;
    }
  }
  EL.InputManager = InputManager;

  /* ---------- particles (visual only) ---------- */
  class Particles extends Node {
    constructor(name) { super(name); this.ps = []; }
    add(o) {
      const p = Object.assign({
        x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, life: 500, max: 0,
        size: 2, color: "#fff", colors: null, shape: "sq", shrink: true, fade: true, rot: 0, spin: 0, img: null, sw: 2, sh: 2,
      }, o);
      p.max = p.max || p.life;
      this.ps.push(p);
      return p;
    }
    burst(x, y, n, o) {
      for (let i = 0; i < n; i++) {
        const a = (o.angle != null ? o.angle : Math.random() * Math.PI * 2) + (o.spread != null ? (Math.random() - 0.5) * o.spread : 0);
        const sp = U.rand(o.speed ? o.speed[0] : 40, o.speed ? o.speed[1] : 160);
        this.add(Object.assign({}, o, {
          x: x + U.rand(-(o.jitter || 0), o.jitter || 0), y: y + U.rand(-(o.jitter || 0), o.jitter || 0),
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: U.rand(o.life ? o.life[0] : 300, o.life ? o.life[1] : 600),
          size: o.sizes ? U.pick(o.sizes) : o.size || 2,
          color: o.palette ? U.pick(o.palette) : o.color || "#fff",
        }));
      }
    }
    tick(dt) {
      const s = dt / 1000;
      const ps = this.ps;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life -= dt;
        p.vx += p.ax * s; p.vy += p.ay * s;
        if (p.drag) { const d = Math.pow(1 - p.drag, s * 60); p.vx *= d; p.vy *= d; }
        p.x += p.vx * s; p.y += p.vy * s;
        p.rot += p.spin * s;
      }
      if (ps.some((p) => p.life <= 0)) this.ps = ps.filter((p) => p.life > 0);
    }
    draw(ctx) {
      const base = ctx.globalAlpha;
      for (const p of this.ps) {
        const t = U.clamp(p.life / p.max, 0, 1);
        const a = p.fade ? Math.min(1, t * 2) : 1;
        ctx.globalAlpha = base * a * (p.alpha != null ? p.alpha : 1);
        let col = p.color;
        if (p.colors) col = p.colors[Math.min(p.colors.length - 1, Math.floor((1 - t) * p.colors.length))];
        ctx.fillStyle = col;
        const sz = Math.max(1, p.shrink ? Math.ceil(p.size * (0.35 + 0.65 * t) / 2) * 2 : p.size);
        if (p.shape === "sq") {
          ctx.fillRect(U.snap(p.x - sz / 2), U.snap(p.y - sz / 2), sz, sz);
        } else if (p.shape === "img" && p.img) {
          ctx.drawImage(p.img, p.ix, p.iy, p.iw, p.ih, U.snap(p.x), U.snap(p.y), p.iw * 2, p.ih * 2);
        } else if (p.shape === "line") {
          ctx.fillRect(U.snap(p.x), U.snap(p.y), 2, Math.max(2, U.snap(Math.abs(p.vy) * 0.04)));
        } else if (p.shape === "plus") {
          ctx.fillRect(U.snap(p.x - 1), U.snap(p.y - sz), 2, sz * 2);
          ctx.fillRect(U.snap(p.x - sz), U.snap(p.y - 1), sz * 2, 2);
        }
      }
      // additive halo pass: glowing embers/sparks bloom into their surroundings
      const op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      for (const p of this.ps) {
        if (!p.glow) continue;
        const t = U.clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = base * Math.min(1, t * 2) * 0.35;
        let col = p.color;
        if (p.colors) col = p.colors[Math.min(p.colors.length - 1, Math.floor((1 - t) * p.colors.length))];
        ctx.fillStyle = col;
        const hs = Math.max(4, p.size * 2.5);
        ctx.fillRect(U.snap(p.x - hs / 2), U.snap(p.y - hs / 2), U.snap(hs), U.snap(hs));
      }
      ctx.globalCompositeOperation = op;
      ctx.globalAlpha = base;
    }
  }
  EL.Particles = Particles;
})(window.EL);
