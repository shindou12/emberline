/* EMBERLINE — bootstrap: builds the GameRoot hierarchy, wires input → Mediator,
   and runs the frame loop. */
(function (EL) {
  "use strict";
  const V = EL.V, U = EL.U;

  function build() {
    const root = new EL.Node("GameRoot");
    root.w = EL.W; root.h = EL.H;

    const bgLayer = root.add(new EL.Layer("BackgroundLayer", "ui"));
    const worldLayer = root.add(new EL.WarpLayer("WorldLayer", "world"));
    const postLayer = root.add(new EL.Layer("PostFXLayer", "ui"));
    const hudLayer = root.add(new EL.Layer("HUDLayer", "ui"));
    const overlayLayer = root.add(new EL.Layer("OverlayLayer", "ui"));
    const modalLayer = root.add(new EL.Layer("ModalLayer", "ui"));
    const transLayer = root.add(new EL.Layer("TransitionLayer", "ui"));

    const v = { root, worldLayer, hudLayer, overlayLayer, modalLayer, transLayer };
    EL.warp = worldLayer;
    v.postfx = postLayer.add(new V.PostFXView());
    v.postfx.v = v; v.postfx.visible = false;
    v.bg = bgLayer.add(new V.BackgroundView());

    // World
    const battleWorld = (v.battleWorld = worldLayer.add(new EL.Node("BattleWorld")));
    v.board = battleWorld.add(new V.BoardView());
    v.footprints = battleWorld.add(new V.FootprintView());
    v.route = battleWorld.add(new V.RoutePreviewView());
    v.enemies = battleWorld.add(new EL.Node("Enemies"));
    v.units = battleWorld.add(new EL.Node("Units")); // companions + player
    v.fx = battleWorld.add(new V.FXView("BattleEffects"));
    v.mapView = worldLayer.add(new V.MapView());

    // HUD
    v.playerHUD = hudLayer.add(new V.PlayerHUD());
    v.turnHUD = hudLayer.add(new V.TurnHUD());
    v.relicHUD = hudLayer.add(new V.RelicHUD());
    v.moveHUD = hudLayer.add(new V.MoveHUD());
    v.pressureHUD = hudLayer.add(new V.PressureHUD());
    v.companionHUD = hudLayer.add(new V.CompanionHUD());
    v.hint = hudLayer.add(new V.HintView());
    v.pauseBtn = hudLayer.add(new V.IconButton("pause", "i_pause"));
    v.pauseBtn.x = 326; v.pauseBtn.y = 6;
    // route confirmation (shown only while a drawn route waits)
    v.actionBar = hudLayer.add(new EL.Node("ActionBar"));
    v.actionBar.visible = false;
    const redo = v.actionBar.add(new V.ButtonView("route.redo", "やり直す", 112, 34, { face: "#3a2f58", top: "#5a4a82", base: "#1a1428", color: "#fff6df", outline: "#120e1c" }));
    redo.x = 12; redo.y = 602;
    const go = v.actionBar.add(new V.ButtonView("route.go", "出撃！", 222, 34, { face: "#ff8a2a", top: "#ffd35a", base: "#8a2f0a" }));
    go.x = 126; go.y = 602; go.glow = 1;

    // Overlay
    v.combo = overlayLayer.add(new V.ComboView());
    v.floats = overlayLayer.add(new V.FloatTextView());
    v.orbs = overlayLayer.add(new EL.Node("RefundOrbs"));
    v.hudFx = overlayLayer.add(new V.FXView("OverlayEffects"));
    v.banner = overlayLayer.add(new V.BannerView());
    v.banner.y = 300; v.banner.alpha = 0;
    v.cutin = overlayLayer.add(new V.SkillCutInView());
    v.vignette = overlayLayer.add(new V.VignetteView());
    v.toast = overlayLayer.add(new V.ToastView());
    v.toast.alpha = 0;

    // Modals
    v.title = modalLayer.add(new V.TitleView());
    v.charSelect = modalLayer.add(new V.CharSelectView());
    v.reward = modalLayer.add(new V.RewardView());
    v.choice = modalLayer.add(new V.ChoiceView());
    v.pause = modalLayer.add(new V.PauseView());
    v.help = modalLayer.add(new V.HelpView());
    v.result = modalLayer.add(new V.ResultView());
    for (const k of ["charSelect", "reward", "choice", "pause", "help", "result"]) v[k].visible = false;

    // Transitions
    v.stageIntro = transLayer.add(new V.StageIntroView());
    v.bossIntro = transLayer.add(new V.BossIntroView());
    v.wipe = transLayer.add(new V.WipeView());
    return v;
  }

  /* camera: shake/punch applied to the world layer (runs on the ui clock) */
  function makeCamera(world) {
    const cam = { amt: 0, t: 0, dur: 1 };
    cam.shake = (a, ms) => { if (a >= cam.amt * (1 - cam.t / cam.dur)) { cam.amt = a; cam.t = 0; cam.dur = ms; } };
    /* zoom punch toward a world point (HD-2D camera kick on big hits) */
    cam.punch = (amt, x, y) => {
      if (!world.project) return;
      const p = world.project(x, y);
      world.zc = { x: p.x - world.x, y: p.y - world.y };
      EL.tweens.kill(world);
      world.zoom = 1 + amt;
      EL.tween(world, { zoom: 1 }, 260, { clock: "ui", ease: U.ease.outCubic });
    };
    cam.update = (dt) => {
      cam.t += dt;
      const k = Math.max(0, 1 - cam.t / cam.dur);
      const a = cam.amt * k;
      world.x = a > 0.5 ? U.snap((Math.random() * 2 - 1) * a) : 0;
      world.y = a > 0.5 ? U.snap((Math.random() * 2 - 1) * a) : 0;
    };
    return cam;
  }

  function start() {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const v = build();
    const cam = makeCamera(v.worldLayer);
    const med = new EL.Mediator(v, cam);
    EL.game = { v, med }; // debug handle

    // every bubbled event ends up at the root and goes to the mediator
    v.root.on("*", (evt) => { med.dispatch(evt); return true; });

    const input = new EL.InputManager(canvas, v.root);
    input.onAny = () => EL.Audio.init();
    document.addEventListener("touchend", () => EL.Audio.init(), { passive: true });
    window.addEventListener("keydown", () => EL.Audio.init(), { once: true });

    let K = 1;
    function resize() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const s = Math.min(vw / EL.W, vh / EL.H);
      const cw = Math.floor(EL.W * s), ch = Math.floor(EL.H * s);
      canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
      const dpr = window.devicePixelRatio || 1;
      K = Math.max(1, Math.min(4, Math.round(s * dpr)));
      canvas.width = EL.W * K; canvas.height = EL.H * K;
      EL.K = K;
    }
    window.addEventListener("resize", resize);
    resize();

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(50, now - last) * (EL.Time.speed || 1);
      last = now;
      const T = EL.Time;
      T.ui += dt;
      let dw = dt * T.slow;
      if (T.paused) dw = 0;
      if (T.hitstop > 0) { T.hitstop -= dt; dw = 0; }
      T.world += dw;
      EL.tweens.update(dw, dt);
      cam.update(dt);
      v.root.update(dt, { world: dw, ui: dt });
      ctx.setTransform(K, 0, 0, K, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#07050d";
      ctx.fillRect(0, 0, EL.W, EL.H);
      v.root.render(ctx);
      requestAnimationFrame(frame);
    }
    med.go("Title");
    requestAnimationFrame(frame);
    const loading = document.getElementById("loading");
    if (loading) loading.remove();
  }

  const fontReady = document.fonts && document.fonts.load ? document.fonts.load('16px "DotGothic16"').catch(() => {}) : Promise.resolve();
  Promise.race([fontReady, new Promise((r) => setTimeout(r, 2500))]).then(start);
})(window.EL);
