/* EMBERLINE — art: palette, pixel sprites, bitmap font, pixel UI primitives */
(function (EL) {
  "use strict";
  const U = EL.U;

  /* One palette for the whole game: warm embers vs. cold hollow violet/cyan */
  const PAL = {
    "0": "#120e1c", "1": "#241c36", "2": "#3a3150", "3": "#5a5078", "4": "#8a82aa", "5": "#c5bedd", "6": "#fff6df",
    r: "#e8453c", R: "#8f2231", o: "#ff8a2a", O: "#c24a12", y: "#ffd35a", Y: "#b8862e",
    s: "#f5cfa6", S: "#c98f6d", b: "#7fd8ff", B: "#3478e0", n: "#1f2f6b", c: "#7af0ff",
    p: "#b08cff", P: "#5c34b0", q: "#34205e", g: "#8fe07a", G: "#2f8f4e", t: "#3fd6c0", T: "#127a70",
    w: "#a06a3c", W: "#5e3a22", m: "#d3dbea", M: "#7c86a3", k: "#ff9ec4", K: "#b8457a", e: "#6b5f55", E: "#3d342f",
  };
  const C = {
    ink: "#120e1c", night: "#0b0812", panel: "#1c1530", panel2: "#261d3d", edge: "#3a2f58",
    gold: "#f2c94c", goldD: "#9a6f23", cream: "#fff6df", dim: "#9d92bd", mute: "#6c6390",
    ember: "#ff8a2a", emberL: "#ffd35a", emberD: "#c24a12", blood: "#ff4d5e", heal: "#8fe07a",
    move: "#7fd8ff", hollow: "#b08cff", cyan: "#7af0ff", weak: "#ffb020",
  };

  /* ---------- sprites (1 char = 1 art pixel; drawn at 2x) ---------- */
  const S = {};
  S.kai = [
    "................",
    "....0000000.....",
    "...011111110....",
    "..01111111110...",
    "..01111111110...",
    "..0111sssss10...",
    "..011ss0ss0s0...",
    "...01sssssss0...",
    "....0SsssSS0....",
    "...0rrrrrrrr0000",
    "..0rRmmmmmsY6660",
    "..0rmMmmmmm0000.",
    "...0mmmmmmM0....",
    "...0wwwwwww0....",
    "...0WW0.0WW0....",
    "...0000.0000....",
  ];
  S.rue = [
    ".............0..",
    "....000000..060.",
    "...0tttttt0.060.",
    "..0tttttttt0.m..",
    ".0Ttttssssst0m..",
    ".0Tttss0ss0s0m..",
    "..0T0sssssss0m..",
    "...0.0SsssS0sm..",
    "....0yyyyyy0sm..",
    "...0yYyyyyYy0m..",
    "...0y0yyyyy0.m..",
    "....0YyyyyY0.m..",
    "....0wwwwww0.m..",
    "....0W0..0W0.m..",
    "....0W0..0W0....",
    "....000..000....",
  ];
  S.gorm = [
    "................",
    ".....000000.....",
    "....0wwwwww0....",
    "...0wYYYYYYw0...",
    "...0YwwwwwwY0...",
    "...0Y000000Y0...",
    "...0Y0o00o0Y0...",
    "...0YYYYYYYY0...",
    "..0MmmmmmM0YYY0.",
    ".0mmMmmmm0YwwwY0",
    ".0mMmmmmm0YwowY0",
    ".0mmMmmmm0YwwwY0",
    "..0mmmmmm00YYY0.",
    "...0WWWWWW0.....",
    "...0WW00WW0.....",
    "...0000.0000....",
  ];
  S.pip = [
    "................",
    "................",
    "................",
    ".....00000......",
    "....0GGGGG0.....",
    "...0GGgggGGG0...",
    "..0GGGGGGGGGG0..",
    "...0Gssssss0....",
    "...0ss0sss0s0...",
    "....0ssssSs0.0..",
    "...0ggggggg00y0.",
    "..0sgGgggGg0yoy0",
    "...0ggggggg00y0.",
    "....0wwwwww0.0..",
    "....0W0..0W0....",
    "....000..000....",
  ];
  S.mira = [
    "........0.......",
    ".......010......",
    "......0110......",
    ".....01110......",
    "....011o110.....",
    "..00111111100...",
    ".0111111111110..",
    "..0ooosssooo0...",
    "..0oos0ss0so0...",
    "...0osssssS0....",
    "...0RRrrrrR0....",
    "..0RrrRRrrrR0...",
    "..0sRrrrrrrRs0..",
    "...0RRRRRRRR0...",
    "....0W0..0W0....",
    "....000..000....",
  ];
  S.tock = [
    "................",
    "................",
    "........0.......",
    ".......0o0......",
    "....0000y000....",
    "...0yyyyyyyy0...",
    "...0yY0000Yy0...",
    "...0yY0oo0Yy0...",
    "...0yY0000Yy0...",
    "...0yyyyyyyy0...",
    "....0YYYYYY0....",
    "...0mM0yy0Mm0...",
    "..0m0MmyymM0m0..",
    "...0.0MMMM0.0...",
    "....0W0..0W0....",
    "....000..000....",
  ];
  S.wren = [
    "................",
    "................",
    "............0...",
    ".....00000.0w0..",
    "....0GGGGG00w0..",
    "...0GGGGGGG0w0..",
    "...0GGsssss0.w0.",
    "...0Gss0ss0s0w0.",
    "....0sssssS0.w0.",
    "....0GgggggG0w0.",
    "...0gGggggGg0w0.",
    "...0s0ggggg0sw0.",
    "....0GGGGGG00w0.",
    "....0W0..0W0.0..",
    "....0W0..0W0....",
    "....000..000....",
  ];
  S.bram = [
    "................",
    "................",
    ".....000000.....",
    "....0MMMMMM0....",
    "...0MmmmmmmM0...",
    "...0Mssssss0....",
    "...0ss0ss0s0....",
    "...06666666600..",
    "..0666666660YY0.",
    ".0wwwwwww0YyyyY0",
    ".0wWwwwWw0YyoyY0",
    ".0sw0wwww0YyyyY0",
    "..00wwwww00YY0..",
    "...0WWWWW0.00...",
    "...0W0.0W0......",
    "...000.000......",
  ];
  S.sable = [
    "................",
    "................",
    "................",
    "................",
    "...0.....0......",
    "..010...010.....",
    "..0110001110....",
    "..0111111110....",
    "..01y11y1110..0.",
    "..0111111110.010",
    "...01111110..010",
    "...011111110010.",
    "..01111111111110",
    "..01111111111110",
    "..0110110110110.",
    "..000.000000.00.",
  ];
  S.luna = [
    "................",
    "..........0.....",
    ".........0y0....",
    "....0000.0y0....",
    "...0bbbb00Y0....",
    "..0bbbbbbb0m....",
    "..0bbsssss0m....",
    "..0bs0ss0s0m....",
    "..0b0sssss0m....",
    "..0b066666s0....",
    "...06655566m....",
    "..0665666556m...",
    "..0666666666m...",
    "...066666660m...",
    "....0W0..0W0....",
    "....000..000....",
  ];
  S.husk = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "......0000......",
    "....00pppp00....",
    "...0ppPPPPpp0...",
    "..0pPPpppPPPp0..",
    ".0pPPpPPPpPPPp0.",
    ".0c0PPPPPPPPPP0.",
    ".0ccPPPPqPPqPP0.",
    "..0PPqPPqPPqP0..",
    "..0P0P0P0P0P00..",
    "..0.0.0.0.0.0...",
    "................",
  ];
  S.wisp = [
    "................",
    "................",
    ".......0........",
    "......0c0.......",
    ".....0cbc0......",
    "....0cbbbc0.....",
    "...0cbb6bbc0....",
    "...0cb6c6bc0....",
    "..0cbbbbbbbc0...",
    "..0cb0bbb0bc0...",
    "..0cbbbbbbbc0...",
    "...0cbb0bbc0....",
    "...0cbbbbbc0....",
    "....0c0c0c0.....",
    ".....0.0.0......",
    "................",
  ];
  S.shield = [
    "................",
    "................",
    ".....000000.....",
    "....0qPPPPq0....",
    "...0PPPPPPPP0...",
    "...0P0cc0c0P0...",
    "...0PPPPPPPP0...",
    "..00mmmmqPPq0...",
    ".0mMmmmm0PPPP0..",
    ".0mmMmmm0qPPP0..",
    ".0mmMmmm0PPqP0..",
    ".0mmMmmm0PPPP0..",
    ".0mMmmmm0qqqq0..",
    "..0MMMM0.0P0P0..",
    "...0000..0q0q0..",
    ".........000000.",
  ];
  S.caller = [
    "................",
    "......000.......",
    ".....0PPP0......",
    "....0PqqqP0.....",
    "...0PqcqcqP0....",
    "...0Pqqqqq P0...",
    "...0PPqqqqPP0.0.",
    "..0PPPPPPPPP00p0",
    "..0PqPPPPPqP0pcp",
    "..0PPqPPPqPP00p0",
    "..0PPPPPPPPPP00.",
    ".0PPqPPPPPPqPP0.",
    ".0PPPPqPPPqPPP0.",
    ".0PPPPPPPPPPPP0.",
    "..0q0q0q0q0q00..",
    "...0.0.0.0.0....",
  ];
  S.brute = [
    "................",
    "..0..........0..",
    ".060.000000.060.",
    ".0660PPPPPP0660.",
    "..06PPPPPPPP60..",
    "..0PP0cPPc0PP0..",
    "..0PPPPPPPPPP0..",
    ".0PPP066660PPP0.",
    "0PPPPP0000PPPPP0",
    "0PqPPPPPPPPPPqP0",
    "0PqPPqPPPPqPPqP0",
    "0660PPPPPPPPP660",
    "0660PPPqqPPPP660",
    ".00.0PPP0PPP0.0.",
    "....0qq0.0qq0...",
    "....0000.0000...",
  ];
  /* mirrored: give the left half */
  S.totem = {
    half: [
      "......00",
      ".....066",
      "....0666",
      "....0555",
      "...05555",
      "...0444c",
      "...044cc",
      "...0444c",
      "...05444",
      "...044c4",
      "...0444c",
      "...0544c",
      "...04444",
      "..055555",
      "..044444",
      "..000000",
    ],
  };
  S.boss = {
    half: [
      "................",
      "................",
      ".........0......",
      "........0y0.....",
      "........0y0...0.",
      "...0....0yy0.0y0",
      "..0y0..0yyY0.0y0",
      "..0yy00yyYyy0yyY",
      "..0yYyyyyYyyyyYy",
      "...0YYYYYYYYYYYY",
      "...0000000000000",
      "....0111111qqqqq",
      "...01111qqqqqqqq",
      "...0111qq0000000",
      "..0111qq0cc66000",
      "..011qq00cccc000",
      ".0111qq0000cc000",
      ".0111qqq00000000",
      "01111qqqq0000000",
      "0q111qqqqqq00000",
      "0qq11qqqqqqqq0qq",
      "0qP0qqqq5qqqqqqq",
      "0P0506qq55qqqqqq",
      "0005550q55q5qqqq",
      "..05550qq55q55qq",
      "..0555qqq5555qqq",
      ".0qq5qqqqq5qqqqq",
      ".0qqqqqqqqqqqqqq",
      "0qqqqPqqqqqqPqqq",
      "0qqqPPqqqqqPPqqq",
      "0qqPP0qqqqPP0qqq",
      "000000000000000.",
    ],
  };
  S.rock = [
    "................",
    "................",
    "......0000......",
    ".....033330.....",
    "....03344330....",
    "...0333443330...",
    "...0233333320...",
    "..032333333230..",
    "..022333433220..",
    "..022233332220..",
    ".02222333222220.",
    ".02221222212220.",
    ".01222222222210.",
    "..011111111110..",
    "...0000000000...",
    "................",
  ];
  S.chest = [
    "................",
    "................",
    "................",
    "...0000000000...",
    "..0wwwwwwwwww0..",
    ".0wWwwwwwwwwWw0.",
    ".0YYYYYYYYYYYY0.",
    ".0wwwww00wwwww0.",
    ".0YYYYy66yYYYY0.",
    ".0wwwww00wwwww0.",
    ".0wWwwwwwwwwWw0.",
    ".0YYYYYYYYYYYY0.",
    ".0WWWWWWWWWWWW0.",
    "..000000000000..",
    "................",
    "................",
  ];

  /* ---------- icons (small) ---------- */
  const I = {};
  I.heart = ["0.0.0.0.0", ".0rr0rr0.", "0rkrrrrr0", "0rrrrrrr0", ".0rrrrr0.", "..0rrr0..", "...0r0...", "....0...."];
  I.heart = [".00.00.", "0kr0rr0", "0rrrrr0", "0rrrrr0", ".0rrr0.", "..0r0..", "...0..."];
  I.boot = ["..0000..", "..0bb0..", "..0bb0..", "..0bB0..", ".0bbB00.", "0bbbbbb0", "0BBBBBB0", ".000000."];
  I.skull = ["..00000..", ".0555550.", "055555550", "050055005", "050055005", "055505550", ".0555550.", "..05050..", "..00000.."];
  I.skull = [".00000.", "0555550", "5005005", "5005005", "0550550", ".05050.", ".00000."];
  I.sword = ["......00", ".....060", "....0650", "0..0650.", "00650...", ".0Y0....", "0Y00....", "00......"];
  I.shield = ["0000000", "0mmmmM0", "0mMMMM0", "0mmmmM0", "0mmmMM0", ".0mmM0.", "..000.."];
  I.flame = ["...0...", "..0o0..", "..0oo0.", ".0oyo0.", "0oyyyo0", "0oy6yo0", ".00000."];
  I.gear = ["..0.0..", ".05550.", "0550550", "05000500".slice(0, 7), "0550550", ".05550.", "..0.0.."];
  I.chain = ["00.....", "0y0....", ".0y00..", "..0yy0.", "..00y0.", "....0y0", ".....00"];
  I.pause = ["0000.0000", "0660.0660", "0660.0660", "0660.0660", "0660.0660", "0660.0660", "0000.0000"];
  I.star = ["...0...", "..0y0..", "00yyy00", "0yyyyy0", ".0y6y0.", "0y0.0y0", "00...00"];
  I.plus = ["..000..", "..0g0..", "000g000", "0ggggg0", "000g000", "..0g0..", "..000.."];
  I.arrowUp = ["...0...", "..0y0..", ".0yyy0.", "0yyyyy0", "000y000", "..0y0..", "..000.."];

  /* map node icons (10x10) */
  const N = {};
  N.battle = ["0........0", "060....060", ".0m0..0m0.", "..0m00m0..", "...0mm0...", "...0mm0...", "..0m00m0..", ".0Y0..0Y0.", "0YY0..0YY0", "000....000"];
  N.elite = ["0..0000..0", "060555506 0".replace(" ", ""), "0655555560", "0550550550", "0500550050", "0550550550", ".05555550.", "..050050..", "..055550..", "...0000..."];
  N.treasure = ["..000000..", ".0wwwwww0.", "0wWwwwwWw0", "0YYYYYYYY0", "0www66www0", "0YYY66YYY0", "0wWwwwwWw0", "0WWWWWWWW0", ".00000000.", ".........."];
  N.rest = ["....0.....", "...0o0....", "...0oo0...", "..0oyo0...", "..0yy6o0..", ".0oy66yo0.", ".00000000.", "0wW0000Ww0", ".0wwwwww0.", "..000000.."];
  N.event = ["..000000..", ".0bbbbbb0.", "0bb0000bb0", "000...0bb0", ".....0bb0.", "....0bb0..", "....0bb0..", "....0000..", "....0bb0..", "....0000.."];
  N.boss = ["0..0..0..0", "0y00y00y00".slice(0, 10), "0yy0yy0yy0", "0yyyyyyyy0", "0yYyyyyYy0", "0y6yyyy6y0", "0yyyyyyyy0", "0YYYYYYYY0", "0000000000", ".........."];

  /* relic icons (10x10) */
  const R = {};
  R.boots = ["..0000....", "..0oo0....", "..0oO0....", "..0oo0....", "..0oO000..", ".0ooooyo0.", "0ooooooyo0", "0OOOOOOOO0", "0000000000", ".........."];
  R.fang = ["0.......0.", "60.....06.", "660...066.", "0660.0660.", ".06606600.", ".0666660..", "..06660...", "..0660....", "...00.....", ".........."];
  R.dirk = [".......00.", "......060.", ".....0650.", "....0650..", "...0650...", "..0650....", "0.0rr0....", "0RY00.....", "0R0.......", "00........"];
  R.gauntlet = ["..00000...", ".0mmmmm0..", "0mMmMmMm0.", "0mmmmmmm0.", "0mMMMMMm0.", "0mmmmmmmm0", ".0mmmmmmM0", ".0MmmmmmM0", "..0MMMMM0.", "...00000.."];
  R.hourglass = ["0000000000", "0YYYYYYYY0", ".0eeeeee0.", "..0eeee0..", "...0ee0...", "...0.e0...", "..0..e.0..", ".0..eee.0.", "0YYYYYYYY0", "0000000000"];
  R.banner = ["00........", "0Y0000000.", "0Y0rrrrr0.", "0Y0rryrr0.", "0Y0ryyyr0.", "0Y0rryrr0.", "0Y0r0r0r0.", "0Y00.0.0..", "0Y0.......", "000......."];
  R.heart = [".00...00..", "0rr0.0rr0.", "0rRrrrrrr0", "0rRRrrrrr0", "0rrRRrrrr0", ".0rrRRrr0.", "..0rrRr0..", "...0rr0...", "....00....", ".........."];
  R.chain = ["000.......", "0y0.......", "000000....", "..0yy0....", "..000000..", "....0yy0..", "....000000", "......0y0.", "......000.", ".........."];
  R.sigil = ["....00....", "...0y60...", "...0yy0...", "....00....", "....0m0...", "...0mm0...", "...0mm0...", "...0mm0...", "..0MmmM0..", "..000000.."];
  R.charm = ["..0000....", ".0gggg0...", "0gg00gg0..", "0g0..0g0..", "0g0..0gg00", "0g0...0gg0", "0gg0...000", ".0gg0.....", "..0000....", ".........."];
  R.twin = ["..0....0..", ".0o0..0o0.", ".0oo0.0oo0", "0oyo00oyo0", "0y6y00y6y0", "0oyo00oyo0", ".0000.0000", "..0Y0.0Y0.", "..0Y0.0Y0.", "..000.000."];
  R.coal = [".........", "...000....", "..0EEE00..", ".0EeEEEE0.", "0EEEeEEEE0", "0EEEEEeEE0", ".0EEeEEE0.", "..00000...", "..........", ".........."];
  R.aegis = ["..000000..", ".0oyyyyo0.", "0oy6666yo0", "0oy6oo6yo0", "0oy6oo6yo0", ".0oy66yo0.", "..0oyyo0..", "...0oo0...", "....00....", ".........."];
  R.compass = ["...0000...", "..0bbbb0..", ".0b0000b0.", "0b0.rr.0b0", "0b0rr...b0", "0b0...bb00", "0b0.bb.0b0", ".0b0000b0.", "..0bbbb0..", "...0000..."];
  R.scorch = ["....0.....", "...0o0.0..", "..0oo00o0.", ".0oyo0oo0.", ".0yy6oyo0.", "0oy66yyo0.", "0OOOOOOOO0", "0EeEeEeEE0", "0000000000", ".........."];
  R.oath = ["...0000...", "..0yyyy0..", ".0y0000y0.", ".0y0..0y0.", "..00..00..", "...0660...", "...0660...", "...0660...", "..0YYYY0..", "..000000.."];
  R.pact = ["....0.....", "...0r0....", "..0rrr0...", ".0rrRrr0..", ".0rRRRr0..", "0rrRRRrr0.", "0rrrRrrr0.", ".0rrrrr0..", "..00000...", ".........."];
  R.plume = [".......00.", "......0y0.", ".....0yo0.", "....0yoo0.", "...0yoo0..", "..0yooo0..", ".0yoO00...", ".0oO0.....", "0o00......", "00........"];
  R.afterglow = ["..000000..", ".0oooooo0.", "0oyyyyyyo0", "0y666666y0", "0000000000", "..........", ".0000000..", "..0ooooo0.", "...00000..", ".........."];
  R.lantern = ["...0000...", "...0YY0...", "..000000..", ".0Yo66oY0.", ".0Yoy6oY0.", ".0Yooyo Y0".replace(" ", ""), ".0YooooY0.", "..000000..", "...0YY0...", "...0000..."];

  function normalize(rows) {
    const w = Math.max.apply(null, rows.map((r) => r.length));
    return rows.map((r) => (r.length < w ? r + ".".repeat(w - r.length) : r));
  }
  function mirrorRows(half) { return half.map((r) => r + r.split("").reverse().join("")); }

  const SPR = {};
  function build(name, def) {
    let rows = Array.isArray(def) ? def : mirrorRows(def.half);
    rows = normalize(rows);
    const h = rows.length, w = rows[0].length;
    const mk = (fn) => {
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const g = cv.getContext("2d");
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const ch = rows[y][x];
          if (ch === "." || ch === " " || !PAL[ch]) continue;
          g.fillStyle = fn(ch);
          g.fillRect(x, y, 1, 1);
        }
      return cv;
    };
    SPR[name] = {
      w, h, rows,
      img: mk((ch) => PAL[ch]),
      white: mk(() => "#ffffff"),
      dark: mk(() => "#120e1c"),
      red: mk((ch) => (ch === "0" ? "#3a0a14" : "#ff4d5e")),
    };
    // horizontally flipped copies
    for (const k of ["img", "white", "red"]) {
      const f = document.createElement("canvas");
      f.width = w; f.height = h;
      const g = f.getContext("2d");
      g.translate(w, 0); g.scale(-1, 1); g.drawImage(SPR[name][k], 0, 0);
      SPR[name][k + "F"] = f;
    }
  }
  for (const k in S) build(k, S[k]);
  for (const k in I) build("i_" + k, I[k]);
  for (const k in N) build("n_" + k, N[k]);
  for (const k in R) build("r_" + k, R[k]);

  /* floor tile textures (24x24 art px, three variants) */
  const TILES = [];
  (function () {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let v = 0; v < 3; v++) {
      const cv = document.createElement("canvas");
      cv.width = 24; cv.height = 24;
      const g = cv.getContext("2d");
      g.fillStyle = "#2a2240"; g.fillRect(0, 0, 24, 24);
      g.fillStyle = "#322a4c"; g.fillRect(1, 1, 22, 22);
      g.fillStyle = "#3a3156"; g.fillRect(1, 1, 22, 1); g.fillRect(1, 1, 1, 22);
      g.fillStyle = "#231c36"; g.fillRect(1, 22, 22, 1); g.fillRect(22, 1, 1, 22);
      for (let i = 0; i < 16; i++) {
        g.fillStyle = rnd() < 0.5 ? "#2c2444" : "#3b3358";
        g.fillRect(2 + Math.floor(rnd() * 20), 2 + Math.floor(rnd() * 20), 1 + Math.floor(rnd() * 2), 1);
      }
      if (v === 1) { g.fillStyle = "#281f3b"; g.fillRect(6, 9, 7, 1); g.fillRect(12, 10, 4, 1); g.fillRect(15, 11, 1, 3); }
      if (v === 2) { g.fillStyle = "#3f3660"; g.fillRect(4, 15, 3, 2); g.fillRect(16, 5, 2, 2); }
      TILES.push(cv);
    }
  })();

  /* ---------- bitmap font 5x7 ---------- */
  const G = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    "*": ["00000", "10001", "01010", "00100", "01010", "10001", "00000"],
    ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
    "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  };
  const fontCache = new Map();
  function fontCanvas(text, color, outline, grad) {
    const key = text + "|" + color + "|" + outline + "|" + (grad || "");
    let cv = fontCache.get(key);
    if (cv) return cv;
    const cw = 6, w = text.length * cw + 1, h = 9;
    cv = document.createElement("canvas");
    cv.width = w + 2; cv.height = h + 2;
    const g = cv.getContext("2d");
    const plot = (fill, ox, oy) => {
      g.fillStyle = fill;
      for (let i = 0; i < text.length; i++) {
        const gl = G[text[i]] || G["?"];
        for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (gl[y][x] === "1") {
          if (grad && fill !== outline) g.fillStyle = y < 3 ? grad : color;
          g.fillRect(1 + i * cw + x + ox, 1 + y + oy, 1, 1);
        }
      }
    };
    if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 2], [1, 1], [-1, 1]]) plot(outline, ox + 1, oy + 1);
    plot(color, 1, 1);
    if (fontCache.size > 400) fontCache.clear();
    fontCache.set(key, cv);
    return cv;
  }

  /* ---------- drawing API ---------- */
  const Art = (EL.Art = {
    PAL, C, SPR, TILES,
    spr(ctx, name, x, y, o = {}) {
      const s = SPR[name];
      if (!s) return;
      const sc = o.s || 2;
      const flip = !!o.flip;
      const ax = o.ax != null ? o.ax : 0.5, ay = o.ay != null ? o.ay : 1;
      const dx = Math.round(x - s.w * sc * ax), dy = Math.round(y - s.h * sc * ay);
      const a0 = ctx.globalAlpha;
      if (o.alpha != null) ctx.globalAlpha = a0 * o.alpha;
      if (o.red) ctx.drawImage(flip ? s.redF : s.red, dx, dy, s.w * sc, s.h * sc);
      else ctx.drawImage(flip ? s.imgF : s.img, dx, dy, s.w * sc, s.h * sc);
      if (o.white) {
        ctx.globalAlpha = a0 * (o.alpha != null ? o.alpha : 1) * o.white;
        ctx.drawImage(flip ? s.whiteF : s.white, dx, dy, s.w * sc, s.h * sc);
      }
      ctx.globalAlpha = a0;
    },
    silhouette(ctx, name, x, y, o = {}) {
      const s = SPR[name];
      if (!s) return;
      const sc = o.s || 2;
      const ax = o.ax != null ? o.ax : 0.5, ay = o.ay != null ? o.ay : 1;
      ctx.drawImage(s.dark, Math.round(x - s.w * sc * ax), Math.round(y - s.h * sc * ay), s.w * sc, s.h * sc);
    },
    /* bitmap text: s = logical px per font pixel */
    text(ctx, str, x, y, o = {}) {
      str = String(str).toUpperCase();
      const s = o.s || 2;
      const cv = fontCanvas(str, o.color || C.cream, o.outline === false ? null : o.outline || C.ink, o.grad);
      const w = cv.width * s, h = cv.height * s;
      let dx = x;
      if (o.align === "center") dx = x - w / 2;
      else if (o.align === "right") dx = x - w;
      ctx.drawImage(cv, Math.round(dx), Math.round(y - s), w, h);
      return w;
    },
    textWidth(str, s = 2) { return (String(str).length * 6 + 3) * s; },
    /* Japanese text (DotGothic16) with pixel outline */
    jp(ctx, str, x, y, o = {}) {
      const size = o.size || 16;
      ctx.font = `${size}px "DotGothic16", "Hiragino Kaku Gothic ProN", monospace`;
      ctx.textBaseline = "top";
      ctx.textAlign = o.align || "left";
      const xx = Math.round(x), yy = Math.round(y);
      if (o.outline !== false) {
        ctx.fillStyle = o.outline || C.ink;
        const ow = o.ow || 2;
        for (const [ox, oy] of [[-ow, 0], [ow, 0], [0, -ow], [0, ow], [-ow, -ow], [ow, ow], [-ow, ow], [ow, -ow]]) ctx.fillText(str, xx + ox, yy + oy);
      }
      ctx.fillStyle = o.color || C.cream;
      ctx.fillText(str, xx, yy);
      ctx.textAlign = "left";
    },
    jpWidth(ctx, str, size = 16) {
      ctx.font = `${size}px "DotGothic16", "Hiragino Kaku Gothic ProN", monospace`;
      return ctx.measureText(str).width;
    },
    wrap(ctx, str, maxW, size = 16) {
      ctx.font = `${size}px "DotGothic16", "Hiragino Kaku Gothic ProN", monospace`;
      const lines = [];
      for (const para of String(str).split("\n")) {
        let line = "";
        for (const ch of para) {
          const t = line + ch;
          if (ctx.measureText(t).width > maxW && line) {
            // keep closing punctuation on the same line
            if ("、。）」！？…".includes(ch)) { lines.push(t); line = ""; continue; }
            lines.push(line); line = ch;
          } else line = t;
        }
        lines.push(line);
      }
      return lines;
    },
    /* pixel frame: dark outline, colored rim, inner shade, fill; clipped corners */
    panel(ctx, x, y, w, h, o = {}) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const rim = o.rim || C.goldD, fill = o.fill || C.panel, hi = o.hi || C.gold;
      ctx.fillStyle = C.ink;
      ctx.fillRect(x + 2, y, w - 4, h); ctx.fillRect(x, y + 2, w, h - 4);
      ctx.fillStyle = rim;
      ctx.fillRect(x + 4, y + 2, w - 8, h - 4); ctx.fillRect(x + 2, y + 4, w - 4, h - 8);
      ctx.fillStyle = fill;
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      if (o.hiEdge !== false) {
        ctx.fillStyle = hi;
        ctx.fillRect(x + 4, y + 2, w - 8, 2);
      }
      if (o.shadow !== false) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x + 4, y + h - 8, w - 8, 4);
      }
    },
    /* 3D pixel button */
    button(ctx, x, y, w, h, o = {}) {
      const pressed = !!o.pressed, dis = !!o.disabled;
      const face = dis ? "#3b3350" : o.face || "#e0a33a";
      const top = dis ? "#4a4163" : o.top || "#ffd35a";
      const base = dis ? "#241d35" : o.base || "#8a4d12";
      const dy = pressed ? 4 : 0;
      ctx.fillStyle = C.ink;
      ctx.fillRect(x + 2, y + 2, w - 4, h); ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = base;
      ctx.fillRect(x + 2, y + 6, w - 4, h - 6);
      ctx.fillStyle = face;
      ctx.fillRect(x + 2, y + 2 + dy, w - 4, h - 8); ctx.fillRect(x + 4, y + dy, w - 8, 2);
      ctx.fillStyle = top;
      ctx.fillRect(x + 4, y + 2 + dy, w - 8, 2);
      return dy;
    },
    /* pixel line of 2px squares (Bresenham in art pixels) */
    pline(ctx, x0, y0, x1, y1, size = 2) {
      x0 = Math.round(x0 / 2); y0 = Math.round(y0 / 2); x1 = Math.round(x1 / 2); y1 = Math.round(y1 / 2);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      const off = (size - 2) / 2;
      for (let guard = 0; guard < 2000; guard++) {
        ctx.fillRect(x0 * 2 - off, y0 * 2 - off, size, size);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    /* pixel ellipse outline/fill made of 2px squares */
    pellipse(ctx, cx, cy, rx, ry, fill) {
      const steps = Math.max(12, Math.round((rx + ry) * 0.9));
      if (fill) {
        for (let yy = -ry; yy <= ry; yy += 2) {
          const k = Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)));
          const hw = U.snap(rx * k);
          ctx.fillRect(U.snap(cx - hw), U.snap(cy + yy), hw * 2, 2);
        }
        return;
      }
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        ctx.fillRect(U.snap(cx + Math.cos(a) * rx) - 1, U.snap(cy + Math.sin(a) * ry) - 1, 2, 2);
      }
    },
    /* dithered rect: checker pattern for pixel-art glows */
    dither(ctx, x, y, w, h, color, phase = 0) {
      ctx.fillStyle = color;
      for (let yy = 0; yy < h; yy += 2)
        for (let xx = ((yy / 2 + phase) % 2) * 2; xx < w; xx += 4) ctx.fillRect(x + xx, y + yy, 2, 2);
    },
    /* sprite pixels → list of 2x2 chunks for shatter effects */
    chunks(name, cx, cy, s = 2, flip = false) {
      const sp = SPR[name];
      if (!sp) return [];
      const out = [];
      const ox = cx - (sp.w * s) / 2, oy = cy - sp.h * s;
      for (let y = 0; y < sp.h; y += 2)
        for (let x = 0; x < sp.w; x += 2) {
          const ch = sp.rows[y][flip ? sp.w - 1 - x : x];
          if (ch === "." || !PAL[ch]) continue;
          out.push({ x: ox + x * s, y: oy + y * s, color: PAL[ch] });
        }
      return out;
    },
  });
})(window.EL);
