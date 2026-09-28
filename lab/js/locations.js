/* EMBERLINE — battle locations: floor tiles, obstacles, the backdrop behind the
   board, the far background, corner lights and the lighting mood.
   Pure presentation: the logic only stores which location a battle uses. */
(function (EL) {
  "use strict";
  const A = EL.Art, C = A.C;

  /* ---------- obstacle sprites (16x16, same palette as everything else) ---------- */
  const recolor = (rows, map) => rows.map((r) => r.replace(/./g, (ch) => (map[ch] != null ? map[ch] : ch)));
  const ROCK = A.SPR.rock.rows;
  A.defSprite("o_mossrock", recolor(ROCK, { "4": "g", "3": "G", "2": "E" }).map((r, i) => (i === 3 || i === 4 ? r.replace(/[Ge]/g, "g") : r)));
  A.defSprite("o_rubble", recolor(ROCK, { "4": "m", "3": "M", "2": "e", "1": "E" }));
  A.defSprite("o_boulder", recolor(ROCK, { "4": "s", "3": "S", "2": "w", "1": "W" }));
  A.defSprite("o_greyrock", recolor(ROCK, { "4": "5", "3": "4", "2": "M", "1": "3" }));
  A.defSprite("o_snowrock", recolor(ROCK, { "4": "6", "3": "5", "2": "M", "1": "3" }).map((r, i) => (i >= 3 && i <= 6 ? r.replace(/[45M]/g, "6") : r)));
  A.defSprite("o_pine", [
    "................", ".......00.......", "......0660......", ".....06GG60.....",
    "....0GGGGGG0....", ".....0G66G0.....", "....0GGGGGGG0...", "...0GGG66GGGG0..",
    "....0GGGGGGG0...", "...0GG6GGGG6G0..", "..0GGGGGGGGGGG0.", "..00000WW00000..",
    "......0WW0......", "......0WW0......", ".....000000.....", "................",
  ]);
  A.defSprite("o_drift", [
    "................", "................", "................", "................",
    "................", "................", "..........00....", ".........0w0....",
    "..00000000ww0...", ".0wwwwwwwwwW0...", "0wWwwwwWwwwwW0..", "0WWWWWWWWWWWW0..",
    ".0000000000000..", "................", "................", "................",
  ]);
  A.defSprite("o_bush", [
    "................", "................", "................", "......000.......",
    "....00ggg00.....", "...0gggGggg0....", "..0ggGgggggG0...", "..0gGgggGggg0...",
    ".0GggggggggGG0..", ".0GgGgggGgggG0..", ".0GGgggGgggGG0..", "..0GGGgGGgGG0...",
    "...0GGGGGGG0....", "....0WWWW0......", "....000000......", "................",
  ]);
  A.defSprite("o_stump", [
    "................", "................", "................", "................",
    "....00000000....", "...0wwwwwwww0...", "...0wYwwwwYw0...", "...0WwwwwwwW0...",
    "...0WwWWWwWW0...", "...0WWwWWWwW0...", "...0WwWWwWWW0...", "..0gWWWWWWWWg0..",
    ".0gGWWWWWWWWGg0.", ".0GG00000000GG0.", "..00........00..", "................",
  ]);
  A.defSprite("o_crate", [
    "................", "................", "..000000000000..", "..0wwwwwwwwww0..",
    "..0wWwwwwwwWw0..", "..0wwWwwwwWww0..", "..0wwwWwwWwww0..", "..0wwwwWWwwww0..",
    "..0wwwwWWwwww0..", "..0wwwWwwWwww0..", "..0wwWwwwwWww0..", "..0wWwwwwwwWw0..",
    "..0wwwwwwwwww0..", "..0WWWWWWWWWW0..", "..000000000000..", "................",
  ]);
  A.defSprite("o_barrel", [
    "................", "................", "....00000000....", "...0WwwwwwwW0...",
    "...0MMMMMMMM0...", "..0WwwwwwwwwW0..", "..0WwwwwwwwwW0..", "..0MMMMMMMMMM0..",
    "..0WwwwwwwwwW0..", "..0WwwwwwwwwW0..", "..0WwwwwwwwwW0..", "..0MMMMMMMMMM0..",
    "...0WwwwwwwW0...", "...0WWWWWWWW0...", "....00000000....", "................",
  ]);
  A.defSprite("o_column", [
    "................", "....000..0......", "...0sS0.0s0.....", "...0sSS0sS0.....",
    "...0sSsSsS0.....", "...0sSsssS0.....", "...0sSsssS0.....", "...0sSsssS0.....",
    "...0sSsssS0.....", "...0sSsssS0.....", "...0sSsssS0.....", "..0SSSSSSSS0....",
    "..0wwwwwwww0....", ".0wwwwwwwwww0...", ".000000000000...", "................",
  ]);

  /* ---------- floor tiles (24x24 art px, three variants per location) ---------- */
  function tiles(style) {
    let seed = 7 + style.length * 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = [];
    for (let v = 0; v < 3; v++) {
      const cv = document.createElement("canvas");
      cv.width = 24; cv.height = 24;
      const g = cv.getContext("2d");
      const px = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
      if (style === "slab") return A.TILES; // the original temple floor
      if (style === "grass") {
        px("#1c3322", 0, 0, 24, 24); px("#244029", 1, 1, 22, 22);
        for (let i = 0; i < 26; i++) { const x = 1 + Math.floor(rnd() * 22), y = 2 + Math.floor(rnd() * 21); px(rnd() < 0.5 ? "#33583a" : "#2c4c31", x, y, 1, 2); }
        for (let i = 0; i < 6; i++) px("#3c6636", 2 + Math.floor(rnd() * 20), 2 + Math.floor(rnd() * 20), 1, 1);
        if (v === 1) { px("#2a2418", 8, 9, 5, 2); px("#2a2418", 7, 10, 3, 2); px("#342d1e", 9, 9, 2, 1); px("#4a4032", 14, 15, 2, 1); px("#4a4032", 5, 16, 1, 1); }
        if (v === 2) { px("#c9b3ff", 16, 6, 1, 1); px("#fff6df", 5, 17, 1, 1); px("#ffd35a", 12, 13, 1, 1); }
        px("#122018", 0, 23, 24, 1); px("#122018", 23, 0, 1, 24);
      } else if (style === "meadow") {
        px("#3e7a34", 0, 0, 24, 24); px("#4a8a3c", 1, 1, 22, 22);
        for (let i = 0; i < 30; i++) { const x = 1 + Math.floor(rnd() * 22), y = 2 + Math.floor(rnd() * 21); px(rnd() < 0.5 ? "#5ea24a" : "#3f7c36", x, y, 1, 2); }
        if (v === 1) { px("#fff6df", 6, 8, 1, 1); px("#ffd35a", 7, 9, 1, 1); px("#fff6df", 16, 15, 1, 1); px("#ff9ec4", 12, 5, 1, 1); }
        if (v === 2) { px("#6b5a3a", 9, 12, 4, 2); px("#7d6a46", 10, 12, 2, 1); }
        px("#356a2e", 0, 23, 24, 1); px("#356a2e", 23, 0, 1, 24);
      } else if (style === "beach") {
        px("#a88a5a", 0, 0, 24, 24); px("#bc9e6e", 1, 1, 22, 22);
        for (let i = 0; i < 18; i++) px(rnd() < 0.5 ? "#d6bc8e" : "#b0925e", 2 + Math.floor(rnd() * 20), 2 + Math.floor(rnd() * 20), 1, 1);
        if (v === 1) { px("#a88a5a", 4, 10, 16, 1); px("#a88a5a", 7, 14, 12, 1); }
        if (v === 2) { px("#f0e6d0", 15, 6, 2, 1); px("#ff9ec4", 6, 17, 2, 1); }
        px("#a88a5a", 0, 23, 24, 1); px("#a88a5a", 23, 0, 1, 24);
      } else if (style === "snow") {
        px("#a8b8d0", 0, 0, 24, 24); px("#c4d2e4", 1, 1, 22, 22);
        for (let i = 0; i < 14; i++) px(rnd() < 0.5 ? "#dfe8f4" : "#b0c0d6", 2 + Math.floor(rnd() * 20), 2 + Math.floor(rnd() * 20), 2, 1);
        if (v === 1) { px("#b4c4dc", 5, 9, 9, 1); px("#b4c4dc", 11, 10, 6, 1); }
        if (v === 2) { px("#9aa8bc", 15, 14, 3, 2); px("#b4c4dc", 16, 14, 1, 1); }
        px("#b4c4dc", 0, 23, 24, 1); px("#b4c4dc", 23, 0, 1, 24);
      } else if (style === "brick") {
        px("#11191c", 0, 0, 24, 24);
        for (let row = 0; row < 4; row++) {
          const off = row % 2 ? 6 : 0;
          for (let b = -1; b < 3; b++) {
            const x = b * 12 + off, y = row * 6;
            const c = ["#2a3c42", "#2f444b", "#26363c"][Math.floor(rnd() * 3)];
            px(c, x + 1, y + 1, 10, 4); px("#3a5058", x + 1, y + 1, 10, 1);
          }
        }
        if (v === 1) { px("#16323e", 4, 9, 12, 5); px("#24506a", 6, 10, 6, 1); px("#7fd8ff", 8, 10, 2, 1); }
        if (v === 2) { px("#2f5a3a", 2, 19, 5, 2); px("#3c6636", 3, 19, 2, 1); px("#2f5a3a", 17, 3, 3, 1); }
      } else if (style === "cobble") {
        px("#161216", 0, 0, 24, 24);
        for (let y = 0; y < 24; y += 6) for (let x = (y / 6) % 2 ? -3 : 0; x < 24; x += 6) {
          const c = ["#463a3e", "#40353a", "#4c4044"][Math.floor(rnd() * 3)];
          px(c, x + 1, y + 1, 5, 4); px("#5a4c50", x + 1, y + 1, 4, 1); px("#2a2226", x + 1, y + 4, 5, 1);
        }
        if (v === 1) { px("#2a1c14", 9, 10, 6, 3); px("#ff8a2a", 11, 11, 1, 1); }
        if (v === 2) { px("#1d1a2a", 3, 15, 8, 3); px("#2c2a44", 4, 15, 5, 1); }
      } else if (style === "sand") {
        px("#3a2a26", 0, 0, 24, 24); px("#4a3630", 1, 1, 22, 22); px("#5a4238", 1, 1, 22, 1); px("#2e2220", 1, 22, 22, 1);
        for (let i = 0; i < 14; i++) px(rnd() < 0.5 ? "#543c34" : "#624a3e", 2 + Math.floor(rnd() * 20), 2 + Math.floor(rnd() * 20), 2, 1);
        if (v === 1) { px("#2e2220", 5, 7, 8, 1); px("#2e2220", 12, 8, 1, 5); px("#2e2220", 13, 12, 5, 1); }
        if (v === 2) { px("#6e4a3a", 14, 14, 5, 4); px("#7a5444", 15, 14, 3, 1); }
      }
      out.push(cv);
    }
    return out;
  }

  /* ---------- the band behind the board (board-local coords, y in [-82, -6]) ---------- */
  const BACK = {
    temple(ctx, w) {
      ctx.fillStyle = "#130e1f"; ctx.fillRect(-12, -82, w + 24, 76);
      for (let i = 0; i < 8; i++) {
        const ax = -12 + i * 48;
        ctx.fillStyle = "#1d1630"; ctx.fillRect(ax + 6, -70, 36, 64);
        ctx.fillStyle = "#0b0814"; ctx.fillRect(ax + 12, -58, 24, 52); ctx.fillRect(ax + 16, -62, 16, 4);
        ctx.fillStyle = "#2a2140"; ctx.fillRect(ax, -82, 6, 76); ctx.fillStyle = "#3a2f58"; ctx.fillRect(ax, -82, 2, 76);
      }
      for (let yy = -80; yy < -8; yy += 8) { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(-12, yy, w + 24, 2); }
    },
    forest(ctx, w, t) {
      // tree trunks and a low canopy; the sky shows through the gaps
      for (let i = 0; i < 9; i++) {
        const x = -10 + i * 42 + ((i * 17) % 11), tw = 8 + ((i * 7) % 6);
        ctx.fillStyle = "#162418"; ctx.fillRect(x, -82, tw, 78);
        ctx.fillStyle = "#26402a"; ctx.fillRect(x + 1, -82, 2, 78);
      }
      for (let i = 0; i < 16; i++) {
        const x = -12 + i * 24, r = 14 + ((i * 5) % 9);
        ctx.fillStyle = i % 2 ? "#15321e" : "#1a3e24";
        A.pellipse(ctx, x, -80 + ((i * 11) % 10), r, 12, true);
      }
      ctx.fillStyle = "#1c3a22";
      for (let x = -12; x < w + 12; x += 6) { const h = 4 + ((x * 7) % 9); ctx.fillRect(x, -6 - h, 3, h); }
    },
    tunnel(ctx, w, t) {
      ctx.fillStyle = "#121a1e"; ctx.fillRect(-12, -82, w + 24, 76);
      for (let row = 0; row < 9; row++) for (let b = 0; b < 16; b++) {
        const x = -12 + b * 24 + (row % 2 ? 12 : 0), y = -82 + row * 8;
        ctx.fillStyle = (b + row) % 3 ? "#1a2428" : "#1e2a2f"; ctx.fillRect(x + 1, y + 1, 22, 6);
      }
      // the dark mouth of the tunnel
      ctx.fillStyle = "#05080a"; ctx.fillRect(w / 2 - 70, -60, 140, 54); A.pellipse(ctx, w / 2, -60, 70, 20, true);
      ctx.fillStyle = "#0a1014"; ctx.fillRect(w / 2 - 54, -48, 108, 42);
      // pipes and drips
      ctx.fillStyle = "#34454a"; ctx.fillRect(-12, -74, w / 2 - 60, 6); ctx.fillRect(w / 2 + 72, -70, w / 2 - 60, 6);
      ctx.fillStyle = "#5a3a2a"; ctx.fillRect(40, -74, 4, 6); ctx.fillRect(w - 50, -70, 4, 6);
      const k = Math.floor(t / 120) % 20;
      ctx.fillStyle = "#7fd8ff"; ctx.fillRect(60, -68 + k * 3, 1, 2); ctx.fillRect(w - 70, -64 + ((k + 9) % 20) * 3, 1, 2);
      ctx.fillStyle = "#16323e"; ctx.fillRect(-12, -10, w + 24, 4);
    },
    city(ctx, w, t) {
      // house fronts with lit windows
      const houses = [[-12, 58], [34, 70], [84, 50], [128, 74], [180, 60], [226, 68], [272, 54], [312, 72]];
      houses.forEach(([x, h], i) => {
        const hw = 48;
        ctx.fillStyle = i % 2 ? "#1d1830" : "#241d3a"; ctx.fillRect(x, -6 - h, hw, h);
        ctx.fillStyle = "#120e1c"; ctx.fillRect(x - 2, -8 - h, hw + 4, 4);
        for (let wy = -h + 6; wy < -16; wy += 14) for (let wx = 8; wx < hw - 8; wx += 14) {
          const lit = ((i * 7 + wx + wy) % 5) < 2;
          const f = lit && ((Math.floor(t / 700) + i + wx) % 9) === 0;
          ctx.fillStyle = lit ? (f ? "#ffb060" : "#ffd35a") : "#0e0b18";
          ctx.fillRect(x + wx, -6 + wy, 6, 8);
        }
      });
      ctx.fillStyle = "#2a2226"; ctx.fillRect(-12, -10, w + 24, 4);
    },
    meadow(ctx, w) {
      // a low wooden fence and tall grass; the open sky stays in view
      for (let x = -10; x < w + 12; x += 30) { ctx.fillStyle = "#4a3222"; ctx.fillRect(x, -30, 5, 24); ctx.fillStyle = "#6e4a30"; ctx.fillRect(x, -30, 2, 24); }
      ctx.fillStyle = "#6e4a30"; ctx.fillRect(-12, -26, w + 24, 3); ctx.fillRect(-12, -16, w + 24, 3);
      ctx.fillStyle = "#3e7a34";
      for (let x = -12; x < w + 12; x += 4) { const h = 6 + ((x * 7) % 10); ctx.fillRect(x, -6 - h, 2, h); }
    },
    coast(ctx, w) {
      // a low dark ledge with surf at its foot
      ctx.fillStyle = "#3a4450"; ctx.fillRect(-12, -18, w + 24, 12);
      for (let x = -12; x < w + 12; x += 18) { ctx.fillStyle = "#4a5664"; ctx.fillRect(x, -24 + ((x * 5) % 6), 14, 8); }
      ctx.fillStyle = "#e8f4ff"; for (let x = -12; x < w + 12; x += 7) ctx.fillRect(x, -8, 4, 2);
    },
    snow(ctx, w) {
      // soft drifts
      for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? "#dfe8f4" : "#c6d4e6"; A.pellipse(ctx, -12 + i * 32, -8, 26, 12, true); }
    },
    vista(ctx, w) {
      // only a broken balustrade: the sky and the distant ridges stay visible
      ctx.fillStyle = "#2e2220"; ctx.fillRect(-12, -22, w + 24, 16);
      ctx.fillStyle = "#4a3630"; ctx.fillRect(-12, -24, w + 24, 4);
      for (let x = -8; x < w + 12; x += 16) {
        if ((x * 13) % 7 === 3) continue; // missing balusters
        ctx.fillStyle = "#3a2a26"; ctx.fillRect(x, -34, 6, 12);
        ctx.fillStyle = "#5a4238"; ctx.fillRect(x, -34, 2, 12);
      }
      ctx.fillStyle = "#4a3630"; ctx.fillRect(-12, -38, w / 3, 4); ctx.fillRect(w / 2 + 20, -38, w / 2, 4);
    },
  };

  /* ---------- corner light fixtures ---------- */
  function corner(style, ctx, cx, cy, t) {
    const f = Math.floor(t / 110) % 3;
    ctx.fillStyle = C.ink;
    if (style === "post") {
      ctx.fillRect(cx - 2, cy - 20, 5, 24); ctx.fillStyle = "#6e4a30"; ctx.fillRect(cx - 1, cy - 19, 3, 22);
      ctx.fillStyle = C.ink; ctx.fillRect(cx + 2, cy - 20, 10, 7);
      ctx.fillStyle = f === 1 ? "#ff8a2a" : "#e8453c"; ctx.fillRect(cx + 3, cy - 19, 8 - f, 5);
      return;
    }
    if (style === "lamp") {
      ctx.fillRect(cx - 2, cy - 18, 4, 22); ctx.fillStyle = "#3a3450"; ctx.fillRect(cx - 1, cy - 17, 2, 20);
      ctx.fillStyle = C.ink; ctx.fillRect(cx - 5, cy - 26, 10, 9);
      ctx.fillStyle = "#ffe9a8"; ctx.fillRect(cx - 3, cy - 24, 6, 5);
      return;
    }
    if (style === "lantern") {
      ctx.fillRect(cx - 1, cy - 14, 3, 18); ctx.fillStyle = "#5e3a22"; ctx.fillRect(cx, cy - 13, 1, 16);
      ctx.fillStyle = C.ink; ctx.fillRect(cx - 4, cy - 20, 9, 8);
      ctx.fillStyle = f ? "#ffd35a" : "#ffb020"; ctx.fillRect(cx - 2, cy - 18, 5, 4);
      return;
    }
    if (style === "torch") {
      ctx.fillRect(cx - 2, cy - 6, 4, 10); ctx.fillStyle = "#5e3a22"; ctx.fillRect(cx - 1, cy - 5, 2, 8);
      ctx.fillStyle = "#7af0ff"; ctx.fillRect(cx - 2, cy - 10 - f * 2, 4, 4 + f * 2);
      ctx.fillStyle = "#e9fbff"; ctx.fillRect(cx - 1, cy - 8 - f, 2, 2 + f);
      return;
    }
    ctx.fillRect(cx - 5, cy - 5, 10, 10);
    ctx.fillStyle = "#6b4f2a"; ctx.fillRect(cx - 3, cy - 3, 6, 6);
    ctx.fillStyle = C.ember; ctx.fillRect(cx - 2, cy - 6 - f * 2, 4, 4 + f * 2);
    ctx.fillStyle = C.emberL; ctx.fillRect(cx - 1, cy - 4 - f, 2, 2 + f);
  }

  /* ---------- far background (baked 180x320 then scaled up) ---------- */
  const BG = {
    forest(g, rnd) {
      g.fillStyle = "#e8f0d8"; g.fillRect(132, 22, 12, 12); g.fillStyle = "#c8d8b8"; g.fillRect(134, 24, 4, 4);
      g.fillStyle = "rgba(0,0,0,0.55)";
      for (let x = 0; x < 180; x += 5) { const h = 30 + Math.floor(rnd() * 30); g.fillRect(x, 80 - h / 2, 5, h); }
      g.fillStyle = "rgba(8,20,12,0.8)";
      for (let x = 0; x < 180; x += 4) { const h = 18 + Math.floor(rnd() * 16); g.fillRect(x, 320 - h, 4, h); }
    },
    tunnel(g, rnd) {
      g.fillStyle = "rgba(0,0,0,0.4)";
      for (let y = 0; y < 320; y += 8) for (let x = (y / 8) % 2 ? 6 : 0; x < 180; x += 12) g.fillRect(x, y, 11, 1);
      for (let x = 0; x < 180; x += 7) { const h = 4 + Math.floor(rnd() * 16); g.fillRect(x + 2, 0, 3, h); }
    },
    city(g, rnd) {
      for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.3 ? "#fff6df" : "#8a82aa"; g.fillRect(Math.floor(rnd() * 180), Math.floor(rnd() * 70), 1, 1); }
      g.fillStyle = "#0e0b1c";
      let x = 0;
      while (x < 180) { const w = 10 + Math.floor(rnd() * 16), h = 20 + Math.floor(rnd() * 34); g.fillRect(x, 100 - h, w, h + 220); if (rnd() < 0.4) g.fillRect(x + 3, 100 - h - 8, 3, 8); x += w; }
      for (let i = 0; i < 30; i++) { g.fillStyle = "#ffb060"; g.fillRect(Math.floor(rnd() * 180), 70 + Math.floor(rnd() * 28), 1, 1); }
      g.fillStyle = "rgba(255,110,40,0.18)"; g.fillRect(0, 80, 180, 24);
    },
    meadow(g, rnd) {
      g.fillStyle = "#fff6d0"; A.pellipse(g, 140, 30, 10, 10, true);
      for (let i = 0; i < 7; i++) { g.fillStyle = "rgba(255,255,255,0.85)"; const x = Math.floor(rnd() * 170), y = 12 + Math.floor(rnd() * 50); g.fillRect(x, y, 18 + Math.floor(rnd() * 20), 4); g.fillRect(x + 4, y - 3, 10, 3); }
      const hills = (base, amp, col) => { g.fillStyle = col; for (let x = 0; x < 180; x += 2) { const y = base + Math.sin(x / 22 + base) * amp; g.fillRect(x, y, 2, 320 - y); } };
      hills(96, 6, "#7ab07a"); hills(108, 5, "#5a9656"); hills(120, 4, "#447c40");
    },
    coast(g, rnd) {
      g.fillStyle = "#fff6d0"; A.pellipse(g, 46, 40, 9, 9, true);
      for (let i = 0; i < 5; i++) { g.fillStyle = "rgba(255,255,255,0.8)"; g.fillRect(Math.floor(rnd() * 160), 14 + Math.floor(rnd() * 40), 24, 3); }
      g.fillStyle = "#3a78b0"; g.fillRect(0, 92, 180, 228);
      g.fillStyle = "#4a8ac4"; for (let y = 96; y < 140; y += 5) for (let x = (y * 3) % 11; x < 180; x += 13) g.fillRect(x, y, 5, 1);
      g.fillStyle = "#fff6d0"; for (let y = 94; y < 120; y += 3) g.fillRect(40 + Math.floor(rnd() * 12), y, 3, 1);
      g.fillStyle = "#56708a"; g.fillRect(118, 86, 30, 6); g.fillRect(126, 82, 12, 4);
    },
    snow(g, rnd) {
      const ridge = (base, amp, col, cap) => { let y = base; for (let x = 0; x < 180; x += 2) { y += (rnd() - 0.5) * amp; y = Math.max(base - 20, Math.min(base + 6, y)); g.fillStyle = col; g.fillRect(x, y, 2, 320 - y); g.fillStyle = cap; g.fillRect(x, y, 2, 3); } };
      ridge(96, 7, "#8a9ab4", "#f4f8ff"); ridge(110, 6, "#a8b8cc", "#ffffff"); ridge(124, 5, "#c6d4e6", "#ffffff");
    },
    vista(g, rnd) {
      g.fillStyle = "#ffd9a0"; A.pellipse(g, 110, 92, 16, 16, true);
      g.fillStyle = "rgba(255,220,180,0.35)";
      for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rnd() * 150), 30 + i * 10, 20 + Math.floor(rnd() * 30), 2);
      const ridge = (base, amp, col) => { g.fillStyle = col; let y = base; for (let x = 0; x < 180; x += 2) { y += (rnd() - 0.5) * amp; y = Math.max(base - 18, Math.min(base + 6, y)); g.fillRect(x, y, 2, 320 - y); } };
      ridge(100, 5, "#6a3a5a"); ridge(112, 6, "#4a2a48"); ridge(124, 7, "#2e1c34");
    },
  };

  const L = {
    temple: {
      name: "地下神殿", tiles: tiles("slab"), obstacles: ["rock"], back: BACK.temple, corner: "brazier",
      frame: ["#2b2140", "#4a3a66", "#171125"],
      bg: { top: "#08060f", mid: "#150f24", bot: "#211634", mote: ["#ff8a2a", "#c24a12", "#5a5078"], up: true },
      light: { ambient: "#aaa4d0", shaft: "255,210,150", shaftA: 0.045, corner: "255,150,70", bokeh: ["255,160,80", "180,150,255"] },
    },
    forest: {
      name: "夜の森", tiles: tiles("grass"), obstacles: ["o_bush", "o_stump", "o_mossrock"], back: BACK.forest, corner: "lantern",
      frame: ["#1e2a1c", "#3a5234", "#101a12"],
      bg: { top: "#040a0a", mid: "#0c1c18", bot: "#15301f", mote: ["#c8f07a", "#8fe07a", "#ffe9a8"], up: true, deco: BG.forest },
      light: { ambient: "#a8c6ba", shaft: "190,230,255", shaftA: 0.05, corner: "255,190,100", bokeh: ["190,255,140", "255,230,150"] },
    },
    tunnel: {
      name: "地下水路", tiles: tiles("brick"), obstacles: ["o_rubble", "o_crate", "o_barrel"], back: BACK.tunnel, corner: "torch",
      frame: ["#1c2628", "#34484e", "#0e1416"],
      bg: { top: "#040608", mid: "#0a1216", bot: "#122028", mote: ["#7fd8ff", "#3478e0"], up: false, deco: BG.tunnel },
      light: { ambient: "#90aab6", shaft: "150,220,255", shaftA: 0.025, corner: "120,230,240", bokeh: ["120,200,255", "150,255,230"] },
    },
    city: {
      name: "燃える市街", tiles: tiles("cobble"), obstacles: ["o_barrel", "o_crate", "o_barrel"], back: BACK.city, corner: "lamp",
      frame: ["#2a2226", "#4c4044", "#161216"],
      bg: { top: "#060818", mid: "#141836", bot: "#2e1a2c", mote: ["#ff8a2a", "#ffd35a", "#c24a12"], up: true, deco: BG.city },
      light: { ambient: "#a8aad0", shaft: "255,160,90", shaftA: 0.03, corner: "255,215,140", bokeh: ["255,150,70", "255,210,120"] },
    },
    vista: {
      name: "黄昏の崖", tiles: tiles("sand"), obstacles: ["o_column", "o_boulder"], back: BACK.vista, corner: "brazier",
      frame: ["#3a2a26", "#6a4a3e", "#221816"],
      bg: { top: "#1e1236", mid: "#8a3e5e", bot: "#e08a58", mote: ["#ffd0a0", "#ffb0c8", "#fff6df"], up: false, deco: BG.vista },
      light: { ambient: "#e6cac4", shaft: "255,200,140", shaftA: 0.085, corner: "255,170,90", bokeh: ["255,200,150", "255,170,200"] },
    },
  };
  L.meadow = {
    name: "風の草原", tiles: tiles("meadow"), obstacles: ["o_bush", "o_greyrock", "o_stump"], back: BACK.meadow, corner: "post",
    frame: ["#5a4230", "#8a6a48", "#3a2a1e"],
    bg: { top: "#3e78c8", mid: "#86b8e4", bot: "#cfe6f0", mote: ["#fff6df", "#ffe9a8", "#c8f07a"], up: false, deco: BG.meadow },
    light: { ambient: "#e8e4d6", bloom: 0.12, glow: 0.03, shaft: "255,245,210", shaftA: 0.05, corner: "255,220,160", bokeh: ["255,250,220", "220,240,255"] },
  };
  L.coast = {
    name: "潮騒の岬", tiles: tiles("beach"), obstacles: ["o_greyrock", "o_drift", "o_crate"], back: BACK.coast, corner: "post",
    frame: ["#6a5438", "#9a7e56", "#44361f"],
    bg: { top: "#4a86cc", mid: "#8cc0e8", bot: "#d8ecf4", mote: ["#ffffff", "#e8f4ff"], up: true, deco: BG.coast },
    light: { ambient: "#dcdad4", bloom: 0.08, glow: 0.02, shaft: "255,245,220", shaftA: 0.04, corner: "255,220,170", bokeh: ["255,255,235", "200,230,255"] },
  };
  L.snow = {
    name: "白嶺の雪原", tiles: tiles("snow"), obstacles: ["o_snowrock", "o_pine", "o_pine"], back: BACK.snow, corner: "post",
    frame: ["#8a9ab4", "#c6d4e6", "#5a6a84"],
    bg: { top: "#8ea4c4", mid: "#c4d2e4", bot: "#eef4fa", mote: ["#ffffff", "#e8f0ff", "#ffffff"], up: false, deco: BG.snow },
    light: { ambient: "#c8d0e0", bloom: 0.04, glow: 0.0, shaft: "235,245,255", shaftA: 0.03, corner: "255,210,160", bokeh: ["235,245,255", "255,255,255"] },
  };
  L.boss = Object.assign({}, L.temple, {
    name: "灰冠の玉座",
    bg: { top: "#0c0409", mid: "#220915", bot: "#3b0c1c", mote: ["#ff4d5e", "#ff8a2a", "#7af0ff"], up: true },
    light: { ambient: "#b08aa0", shaft: "255,120,120", shaftA: 0.045, corner: "255,150,70", bokeh: ["255,110,90", "180,150,255"] },
  });
  L.get = (id) => L[id] || L.temple;
  L.corner = corner;
  EL.Locations = L;
})(window.EL);
