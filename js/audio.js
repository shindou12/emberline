/* EMBERLINE — audio: synthesized SFX, formant voice blips, chiptune BGM sequencer */
(function (EL) {
  "use strict";
  let ctx = null, master, sfxBus, bgmBus, noiseBuf, pulse12, pulse25, shaper;
  const settings = { bgm: true, sfx: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem("emberline.audio") || "{}")); } catch (_) {}
  const save = () => { try { localStorage.setItem("emberline.audio", JSON.stringify(settings)); } catch (_) {} };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* iOS suspends (or 'interrupts') the context when the app goes to the
     background; resume it on return and on the next touch, and play a
     silent buffer inside the gesture so Safari fully unlocks output. */
  function wake() {
    if (!ctx) return;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    try {
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (_) {}
  }
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else wake();
  });
  window.addEventListener("pageshow", () => wake());
  window.addEventListener("focus", () => wake());
  function init() {
    if (ctx) { wake(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx ? 0.9 : 0; sfxBus.connect(master);
    bgmBus = ctx.createGain(); bgmBus.gain.value = settings.bgm ? 0.42 : 0; bgmBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const mkPulse = (duty) => {
      const n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      return ctx.createPeriodicWave(re, im);
    };
    pulse12 = mkPulse(0.125); pulse25 = mkPulse(0.25);
    shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 3); }
    shaper.curve = curve; shaper.connect(sfxBus);
    wake();
    if (Seq.pending) Seq.play(Seq.pending);
  }

  function osc(o) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.t || 0);
    const dur = o.dur || 0.1;
    const g = ctx.createGain();
    const v = ctx.createOscillator();
    if (o.type === "p12") v.setPeriodicWave(pulse12);
    else if (o.type === "p25") v.setPeriodicWave(pulse25);
    else v.type = o.type || "square";
    v.frequency.setValueAtTime(o.f || 440, t);
    if (o.f2) v.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
    const vol = o.vol || 0.2, att = o.att || 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    v.connect(g); g.connect(o.bus || sfxBus);
    v.start(t); v.stop(t + dur + 0.05);
    return v;
  }
  function noise(o) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.t || 0);
    const dur = o.dur || 0.1;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.ft || "bandpass"; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    const g = ctx.createGain();
    const vol = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.att || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  /* tiny formant "voice" — gives heroes/enemies a vocal bark */
  const VOW = { a: [800, 1250], e: [420, 2050], i: [300, 2300], o: [520, 880], u: [340, 820] };
  function voice(o) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.t || 0);
    const dur = o.dur || 0.18;
    const src = ctx.createOscillator(); src.type = "sawtooth";
    src.frequency.setValueAtTime(o.f || 220, t);
    src.frequency.exponentialRampToValueAtTime((o.f || 220) * (o.bend || 0.8), t + dur);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(o.vol || 0.22, t + 0.015);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const [f1, f2] = VOW[o.v || "a"];
    for (const [fq, gv] of [[f1, 1], [f2, 0.6]]) {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = fq; bp.Q.value = 7;
      const gg = ctx.createGain(); gg.gain.value = gv * 3;
      src.connect(bp); bp.connect(gg); gg.connect(out);
    }
    // breathy onset ("h")
    noise({ t: o.t || 0, dur: 0.05, vol: (o.vol || 0.22) * 0.5, f: f2, q: 2 });
    out.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  const PENTA = [0, 2, 4, 7, 9];
  const penta = (i, base = 72) => mtof(base + PENTA[i % 5] + 12 * Math.floor(i / 5));

  /* ---------- sound effects ---------- */
  const SFX = {
    tap() { osc({ type: "p25", f: 990, f2: 1320, dur: 0.05, vol: 0.12 }); },
    hover() { osc({ type: "triangle", f: 1400, dur: 0.03, vol: 0.06 }); },
    confirm() {
      osc({ type: "p25", f: 784, dur: 0.07, vol: 0.14 });
      osc({ type: "p25", f: 1175, dur: 0.12, vol: 0.14, t: 0.06 });
      osc({ type: "triangle", f: 1568, dur: 0.16, vol: 0.08, t: 0.06 });
    },
    cancel() { osc({ type: "p25", f: 520, f2: 260, dur: 0.1, vol: 0.12 }); },
    invalid() { osc({ type: "square", f: 110, f2: 90, dur: 0.12, vol: 0.12 }); noise({ f: 300, dur: 0.08, vol: 0.1, ft: "lowpass" }); },
    grab() { osc({ type: "triangle", f: 330, f2: 660, dur: 0.08, vol: 0.18 }); noise({ f: 2400, dur: 0.05, vol: 0.06 }); },
    step(n) { const f = penta(Math.min(n, 14), 67); osc({ type: "triangle", f, dur: 0.07, vol: 0.13 }); osc({ type: "p12", f: f * 2, dur: 0.03, vol: 0.03 }); },
    stepBack() { osc({ type: "triangle", f: 392, f2: 330, dur: 0.05, vol: 0.08 }); },
    lock() { osc({ type: "square", f: 1760, dur: 0.03, vol: 0.05 }); osc({ type: "square", f: 1320, dur: 0.04, vol: 0.05, t: 0.03 }); },
    killPreview(n) { const f = penta(n + 4, 79); osc({ type: "triangle", f, dur: 0.12, vol: 0.1 }); osc({ type: "p12", f: f * 1.5, dur: 0.1, vol: 0.04, t: 0.03 }); },
    skillReady() { [0, 4, 7, 12].forEach((s, i) => osc({ type: "triangle", f: mtof(84 + s), dur: 0.1, vol: 0.07, t: i * 0.035 })); },
    foot(n) { noise({ f: n % 2 ? 900 : 700, dur: 0.045, vol: 0.12, ft: "lowpass" }); osc({ type: "sine", f: 110, f2: 70, dur: 0.05, vol: 0.08 }); },
    dash() { noise({ f: 800, f2: 3200, dur: 0.12, vol: 0.12, q: 0.8 }); },
    slash() {
      noise({ f: 1800, f2: 6500, dur: 0.1, vol: 0.28, q: 1.2 });
      osc({ type: "square", f: 360, f2: 140, dur: 0.07, vol: 0.12 });
      osc({ type: "sine", f: 160, f2: 55, dur: 0.12, vol: 0.3 });
    },
    weak() {
      noise({ f: 2600, f2: 8000, dur: 0.12, vol: 0.3, q: 0.9 });
      osc({ type: "square", f: 1319, dur: 0.14, vol: 0.12 });
      osc({ type: "square", f: 1976, dur: 0.18, vol: 0.09, t: 0.02 });
      osc({ type: "sine", f: 190, f2: 50, dur: 0.2, vol: 0.4 });
      noise({ f: 5000, dur: 0.22, vol: 0.12, ft: "highpass", t: 0.03 });
    },
    counter() {
      osc({ type: "sine", f: 140, f2: 45, dur: 0.18, vol: 0.45 });
      noise({ f: 500, dur: 0.12, vol: 0.2, ft: "lowpass" });
      osc({ type: "square", f: 220, f2: 110, dur: 0.1, vol: 0.08 });
    },
    block() { osc({ type: "square", f: 1760, dur: 0.1, vol: 0.1 }); osc({ type: "square", f: 2349, dur: 0.14, vol: 0.07, t: 0.02 }); noise({ f: 6000, dur: 0.08, vol: 0.08, ft: "highpass" }); },
    kill(chain) {
      const c = Math.max(1, chain || 1);
      noise({ f: 900, f2: 200, dur: 0.22, vol: 0.3, q: 0.8 });
      osc({ type: "sine", f: 120, f2: 40, dur: 0.22, vol: 0.4 });
      const f = penta(c + 1, 72);
      osc({ type: "p25", f, dur: 0.12, vol: 0.12, t: 0.02 });
      osc({ type: "p25", f: f * 1.5, dur: 0.16, vol: 0.1, t: 0.07 });
      if (c >= 3) { noise({ f: 7000, dur: 0.35, vol: 0.1, ft: "highpass", t: 0.05 }); osc({ type: "triangle", f: f * 2, dur: 0.25, vol: 0.08, t: 0.12 }); }
    },
    refund(n) { [0, 4, 7].forEach((s, i) => osc({ type: "triangle", f: mtof(88 + s + (n || 0)), dur: 0.08, vol: 0.08, t: i * 0.04 })); },
    skill() {
      noise({ f: 400, f2: 3600, dur: 0.32, vol: 0.18, q: 0.7 });
      [0, 3, 7, 12, 15].forEach((s, i) => osc({ type: "p25", f: mtof(69 + s), dur: 0.14, vol: 0.08, t: 0.05 + i * 0.045 }));
    },
    boom() { osc({ type: "sine", f: 95, f2: 35, dur: 0.4, vol: 0.55 }); noise({ f: 400, f2: 80, dur: 0.4, vol: 0.3, ft: "lowpass" }); },
    fire() { noise({ f: 1200, f2: 300, dur: 0.35, vol: 0.28, q: 0.6 }); osc({ type: "sawtooth", f: 90, f2: 50, dur: 0.3, vol: 0.12, bus: shaper }); },
    arrow() { noise({ f: 3000, f2: 900, dur: 0.14, vol: 0.14, q: 3 }); osc({ type: "triangle", f: 1400, f2: 700, dur: 0.1, vol: 0.06 }); },
    beam() { osc({ type: "p12", f: 880, f2: 1760, dur: 0.2, vol: 0.1 }); noise({ f: 4000, dur: 0.18, vol: 0.12, q: 2 }); },
    gear() { for (let i = 0; i < 5; i++) osc({ type: "square", f: 1800 + i * 200, dur: 0.02, vol: 0.05, t: i * 0.04 }); },
    shadow() { osc({ type: "sine", f: 600, f2: 150, dur: 0.35, vol: 0.14 }); noise({ f: 800, f2: 200, dur: 0.35, vol: 0.1 }); },
    heal() { [0, 4, 7, 12].forEach((s, i) => osc({ type: "triangle", f: mtof(76 + s), dur: 0.14, vol: 0.09, t: i * 0.05 })); },
    bolt() { osc({ type: "sine", f: 420, f2: 160, dur: 0.16, vol: 0.12 }); noise({ f: 900, f2: 300, dur: 0.12, vol: 0.08 }); },
    hurt() { osc({ type: "sine", f: 100, f2: 38, dur: 0.35, vol: 0.55 }); noise({ f: 350, dur: 0.3, vol: 0.28, ft: "lowpass" }); },
    turn() { osc({ type: "p25", f: 523, dur: 0.08, vol: 0.1 }); osc({ type: "p25", f: 784, dur: 0.14, vol: 0.1, t: 0.08 }); },
    cool() { noise({ f: 5000, f2: 1500, dur: 0.4, vol: 0.08, ft: "highpass" }); },
    summon() { osc({ type: "sine", f: 180, f2: 620, dur: 0.35, vol: 0.14 }); noise({ f: 300, f2: 2400, dur: 0.35, vol: 0.12, q: 2 }); },
    rotate() { osc({ type: "square", f: 1200, dur: 0.03, vol: 0.05 }); osc({ type: "square", f: 900, dur: 0.03, vol: 0.05, t: 0.06 }); },
    victory() {
      const seq = [[72, 0], [76, 0.1], [79, 0.2], [84, 0.3], [79, 0.45], [84, 0.55]];
      seq.forEach(([m, t]) => { osc({ type: "p25", f: mtof(m), dur: 0.16, vol: 0.13, t }); osc({ type: "triangle", f: mtof(m - 12), dur: 0.18, vol: 0.12, t }); });
      [72, 76, 79, 84].forEach((m) => osc({ type: "p25", f: mtof(m), dur: 0.9, vol: 0.06, t: 0.7 }));
      noise({ f: 6000, dur: 0.8, vol: 0.08, ft: "highpass", t: 0.7 });
    },
    defeat() { [64, 62, 60, 55].forEach((m, i) => osc({ type: "triangle", f: mtof(m), dur: 0.35, vol: 0.14, t: i * 0.28 })); osc({ type: "sine", f: 80, f2: 30, dur: 1.2, vol: 0.3, t: 0.2 }); },
    pick() { [84, 88, 91].forEach((m, i) => osc({ type: "triangle", f: mtof(m), dur: 0.18, vol: 0.1, t: i * 0.05 })); },
    relic() {
      [72, 76, 79, 83, 86, 91].forEach((m, i) => osc({ type: "p25", f: mtof(m), dur: 0.12, vol: 0.08, t: i * 0.05 }));
      noise({ f: 8000, dur: 0.6, vol: 0.06, ft: "highpass", t: 0.1 });
    },
    roar() {
      const t = 0;
      osc({ type: "sawtooth", f: 130, f2: 48, dur: 1.4, vol: 0.35, bus: shaper, t });
      osc({ type: "sawtooth", f: 97, f2: 40, dur: 1.4, vol: 0.25, bus: shaper, t });
      noise({ f: 700, f2: 150, dur: 1.4, vol: 0.35, ft: "lowpass", att: 0.1, t });
      voice({ v: "o", f: 90, bend: 0.6, dur: 1.2, vol: 0.3, t });
    },
    travel() { for (let i = 0; i < 4; i++) noise({ f: 700, dur: 0.05, vol: 0.08, ft: "lowpass", t: i * 0.12 }); },
    open() { noise({ f: 300, f2: 900, dur: 0.25, vol: 0.12, q: 4 }); [79, 84, 88].forEach((m, i) => osc({ type: "triangle", f: mtof(m), dur: 0.2, vol: 0.08, t: 0.2 + i * 0.06 })); },
    phase() { SFX.roar(); osc({ type: "sine", f: 60, f2: 30, dur: 1.5, vol: 0.4 }); },
    whoosh() { noise({ f: 300, f2: 2400, dur: 0.25, vol: 0.14, q: 0.6 }); },
    chime() { osc({ type: "triangle", f: 1568, dur: 0.3, vol: 0.08 }); osc({ type: "triangle", f: 2093, dur: 0.4, vol: 0.05, t: 0.04 }); },
  };
  const VOICES = {
    kai: { f: 210, v: ["a", "e", "o"] }, rue: { f: 300, v: ["a", "i", "e"] }, gorm: { f: 120, v: ["o", "u", "a"] },
    pip: { f: 340, v: ["i", "a"] }, mira: { f: 330, v: ["a", "e"] }, tock: { f: 180, v: ["o", "i"] }, wren: { f: 310, v: ["e", "a"] },
    bram: { f: 130, v: ["o", "a"] }, sable: { f: 420, v: ["i", "a"] }, luna: { f: 360, v: ["u", "a"] },
  };

  /* ---------- BGM sequencer ---------- */
  const CH = (root, q) => ({ root, notes: q === "m" ? [0, 3, 7] : [0, 4, 7] });
  const SONGS = {
    map: {
      bpm: 84, bars: 8,
      chords: [CH(57, "m"), CH(53), CH(48), CH(55), CH(57, "m"), CH(53), CH(52), CH(52)],
      mel: [[76, 0, 72, 0], [77, 0, 76, 72], [72, 0, 74, 76], [74, 0, 0, 0], [76, 79, 81, 79], [77, 0, 76, 74], [71, 0, 72, 71], [68, 0, 0, 0]],
      melDiv: 4, melType: "triangle", melVol: 0.07,
      arp: { div: 2, type: "p12", vol: 0.035, octave: 12 },
      bass: { div: 8, vol: 0.12 },
      drums: null,
    },
    battle: {
      bpm: 134, bars: 8,
      chords: [CH(57, "m"), CH(53), CH(55), CH(52), CH(57, "m"), CH(53), CH(55), CH(57, "m")],
      mel: [
        [69, 0, 72, 74, 76, 0, 74, 72], [77, 0, 76, 74, 72, 0, 69, 0], [67, 0, 71, 74, 79, 0, 77, 76], [76, 74, 71, 68, 71, 0, 64, 0],
        [81, 0, 79, 76, 77, 76, 74, 72], [74, 0, 72, 69, 72, 0, 77, 0], [79, 77, 76, 74, 76, 0, 74, 71], [69, 0, 0, 0, 64, 67, 69, 0],
      ],
      melDiv: 2, melType: "p25", melVol: 0.06,
      arp: { div: 1, type: "p12", vol: 0.028, octave: 12 },
      bass: { div: 2, vol: 0.13, octJump: true },
      drums: { kick: [0, 6, 8], snare: [4, 12], hat: 2 },
      crackle: true,
    },
    boss: {
      bpm: 150, bars: 8,
      chords: [CH(50, "m"), CH(46), CH(55, "m"), CH(45), CH(50, "m"), CH(46), CH(48), CH(45)],
      mel: [
        [74, 0, 77, 74, 81, 0, 79, 77], [82, 0, 81, 77, 74, 0, 70, 0], [79, 0, 77, 74, 70, 74, 79, 0], [81, 0, 76, 73, 76, 0, 69, 0],
        [86, 0, 84, 81, 82, 81, 77, 74], [77, 0, 74, 70, 74, 77, 82, 0], [84, 82, 81, 79, 77, 0, 76, 72], [73, 0, 76, 0, 81, 0, 0, 0],
      ],
      melDiv: 2, melType: "square", melVol: 0.05,
      arp: { div: 1, type: "p25", vol: 0.026, octave: 12 },
      bass: { div: 1, vol: 0.12, octJump: true },
      drums: { kick: [0, 4, 8, 12], snare: [4, 12], hat: 1 },
    },
  };

  const Seq = {
    song: null, name: null, step: 0, next: 0, timer: null, pending: null,
    play(name) {
      if (!ctx) { this.pending = name; return; }
      this.pending = null;
      if (this.name === name) return;
      this.stop();
      this.name = name;
      this.song = SONGS[name];
      if (!this.song) return;
      this.step = 0;
      this.next = ctx.currentTime + 0.08;
      this.timer = setInterval(() => this.pump(), 25);
    },
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.name = null; this.song = null; },
    pump() {
      const s = this.song;
      if (!s || !ctx) return;
      const sd = 60 / s.bpm / 4;
      if (ctx.state !== "running") return;
      if (this.next < ctx.currentTime - 0.25) this.next = ctx.currentTime + 0.05;
      while (this.next < ctx.currentTime + 0.12) {
        this.fire(s, this.step, this.next, sd);
        this.next += sd;
        this.step = (this.step + 1) % (s.bars * 16);
      }
    },
    fire(s, step, t, sd) {
      const bar = Math.floor(step / 16), st = step % 16;
      const ch = s.chords[bar];
      const at = t - ctx.currentTime;
      if (at < -0.05) return;
      const B = bgmBus;
      // bass
      if (st % s.bass.div === 0) {
        let m = ch.root - 12;
        if (s.bass.octJump && (st / s.bass.div) % 2 === 1) m += 12;
        osc({ type: "triangle", f: mtof(m), dur: sd * s.bass.div * 0.95, vol: s.bass.vol, bus: B, t: at, att: 0.005 });
      }
      // arpeggio
      if (s.arp && st % s.arp.div === 0) {
        const k = Math.floor(st / s.arp.div);
        const seq = [0, 1, 2, 1];
        const n = ch.notes[seq[k % 4]] + ch.root + s.arp.octave + (k % 8 >= 4 ? 12 : 0);
        osc({ type: s.arp.type, f: mtof(n), dur: sd * s.arp.div * 0.9, vol: s.arp.vol, bus: B, t: at });
      }
      // melody
      if (st % s.melDiv === 0) {
        const m = s.mel[bar][st / s.melDiv];
        if (m) osc({ type: s.melType, f: mtof(m), dur: sd * s.melDiv * 1.6, vol: s.melVol, bus: B, t: at, att: 0.01 });
      }
      // drums
      const d = s.drums;
      if (d) {
        if (d.kick.includes(st)) { osc({ type: "sine", f: 150, f2: 40, dur: 0.14, vol: 0.32, bus: B, t: at }); }
        if (d.snare.includes(st)) { noise({ f: 1800, dur: 0.12, vol: 0.14, bus: B, t: at, q: 0.8 }); osc({ type: "triangle", f: 190, f2: 120, dur: 0.07, vol: 0.08, bus: B, t: at }); }
        if (st % d.hat === 0) noise({ f: 8000, dur: 0.03, vol: st % 4 === 2 ? 0.05 : 0.025, ft: "highpass", bus: B, t: at });
      }
      if (s.crackle && Math.random() < 0.06) noise({ f: 3000 + Math.random() * 3000, dur: 0.02, vol: 0.04, ft: "highpass", bus: B, t: at + Math.random() * sd });
    },
  };

  EL.Audio = {
    init,
    settings,
    play(name, arg) {
      if (!ctx || !settings.sfx) return;
      const f = SFX[name];
      if (f) try { f(arg); } catch (_) {}
    },
    voice(who, mood) {
      if (!ctx || !settings.sfx) return;
      const v = VOICES[who];
      if (!v) return;
      const vowel = v.v[Math.floor(Math.random() * v.v.length)];
      if (mood === "hurt") voice({ v: "u", f: v.f * 0.9, bend: 0.6, dur: 0.22, vol: 0.2 });
      else if (mood === "cheer") { voice({ v: "a", f: v.f * 1.1, bend: 1.25, dur: 0.2, vol: 0.2 }); voice({ v: "i", f: v.f * 1.3, bend: 1.1, dur: 0.16, vol: 0.16, t: 0.16 }); }
      else voice({ v: vowel, f: v.f, bend: 0.75, dur: 0.16, vol: 0.2 });
    },
    groan() { if (ctx && settings.sfx) voice({ v: "o", f: 110, bend: 0.5, dur: 0.3, vol: 0.14 }); },
    bgm(name) { if (name) Seq.play(name); else Seq.stop(); },
    setBgm(on) { settings.bgm = on; save(); if (bgmBus) bgmBus.gain.value = on ? 0.42 : 0; },
    setSfx(on) { settings.sfx = on; save(); if (sfxBus) sfxBus.gain.value = on ? 0.9 : 0; },
  };
})(window.EL);
