/* EMBERLINE — content & balance data */
(function (EL) {
  "use strict";

  const BAL = {
    GW: 7, GH: 8, // board size (tiles)
    trailBase: 5, trailPer: 3, // ember trail length = base + per * companions
    deepTurn: 4, // from this turn on, the night deepens: every enemy presses +1
    healAfterBattle: 4,
    restHealPct: 0.35,
    maxCompanions: 3,
    maxRows: 7, // rows before the boss
  };

  const HEROES = {
    kai: {
      name: "カイ", title: "燠の剣士", sprite: "kai", hp: 36, atk: 3, mov: 5, refund: 2,
      trait: "背撃の達人", traitText: "ウィークサイド攻撃の倍率が×2.5になる。",
      style: "バランス型。背後を取って切り抜けろ。", color: "#e8453c",
      stats: { hp: 3, atk: 3, mov: 3 },
    },
    rue: {
      name: "ルゥ", title: "風の槍兵", sprite: "rue", hp: 30, atk: 3, mov: 6, refund: 2,
      trait: "突進", traitText: "攻撃の直前にまっすぐ進んだマス数だけ攻撃+1（最大+3）。",
      style: "連鎖型。長い直線で突き抜け、倒して走り続けろ。", color: "#3fd6c0",
      stats: { hp: 2, atk: 3, mov: 4 },
    },
    gorm: {
      name: "ゴルム", title: "灰の重騎士", sprite: "gorm", hp: 42, atk: 4, mov: 4, refund: 2,
      trait: "鉄壁", traitText: "各ターン最初の反撃を無効化する。",
      style: "重装型。少ない歩数で確実に砕け。", color: "#b8862e",
      stats: { hp: 4, atk: 4, mov: 2 },
    },
  };

  /* Companion abilities fire automatically, once per turn, the instant the
     route satisfies their condition. The condition is always about the route. */
  const COMPANIONS = {
    pip: {
      name: "ピップ", title: "灯持ちの従者", sprite: "pip", color: "#ffd35a",
      cond: { type: "straight", n: 4 }, condText: "直進4", condLong: "同じ方向へ4マス続けて進む",
      skill: "閃光の矢", skillText: "進行方向にいる最初の敵に5ダメージ", effect: "pierce", power: 5,
    },
    mira: {
      name: "ミラ", title: "燠火の魔女", sprite: "mira", color: "#ff8a2a",
      cond: { type: "corner", a: 2, b: 2 }, condText: "L字", condLong: "2マス直進→直角に曲がって2マス",
      skill: "爆ぜ火", skillText: "曲がり角の周囲3×3の敵に3ダメージ", effect: "burst", power: 3,
    },
    tock: {
      name: "トック", title: "ぜんまい従機", sprite: "tock", color: "#d3dbea",
      cond: { type: "zigzag", n: 4 }, condText: "ジグザグ", condLong: "2つの方向を交互に4歩",
      skill: "加速機構", skillText: "移動+3", effect: "haste", power: 3,
    },
    wren: {
      name: "レン", title: "灰森の射手", sprite: "wren", color: "#8fe07a",
      cond: { type: "kills", n: 2 }, condText: "撃破2", condLong: "このターンに2体撃破",
      skill: "追い撃ち", skillText: "HPの低い敵2体に3ダメージ", effect: "volley", power: 3,
    },
    bram: {
      name: "ブラム", title: "盾の老兵", sprite: "bram", color: "#fff6df",
      cond: { type: "hurt", n: 4 }, condText: "被弾4", condLong: "このターンに4ダメージ以上受ける",
      skill: "不屈", skillText: "HP5回復＋次の反撃を1回無効", effect: "guard", power: 5,
    },
    sable: {
      name: "セーブル", title: "影猫", sprite: "sable", color: "#b08cff",
      cond: { type: "weak", n: 2 }, condText: "背撃2", condLong: "このターンにウィークサイド攻撃2回",
      skill: "影渡り", skillText: "次の2回の攻撃が必ずウィークサイドになる", effect: "shadow", power: 2,
    },
    luna: {
      name: "ルナ", title: "月環の巫女", sprite: "luna", color: "#7fd8ff",
      cond: { type: "loop", n: 5 }, condText: "円を描く", condLong: "5歩以上の輪を描き、自分の道に隣接して閉じる",
      skill: "月の環", skillText: "輪の内側の敵すべてに4ダメージ", effect: "ring", power: 4,
    },
  };

  const ENEMIES = {
    husk: { name: "殻喰い", sprite: "husk", hp: 4, atk: 2, pressure: 1, desc: "灰を喰らう虚ろの虫。" },
    wisp: { name: "鬼火", sprite: "wisp", hp: 2, atk: 1, pressure: 2, rotates: true, desc: "脆いが圧が高い。弱点が毎ターン回る。" },
    shield: { name: "盾持ち", sprite: "shield", hp: 6, atk: 3, pressure: 1, desc: "正面は硬い。背後を狙え。" },
    caller: { name: "呼び声", sprite: "caller", hp: 3, atk: 1, pressure: 1, summons: true, desc: "毎ターン殻喰いを呼び寄せる。" },
    totem: { name: "結界柱", sprite: "totem", hp: 5, atk: 0, pressure: 1, seals: true, desc: "立っている間、他の敵の弱点を封じる。" },
    brute: { name: "骨砕き", sprite: "brute", hp: 7, atk: 5, pressure: 3, desc: "強敵。反撃が重い。" },
    boss: { name: "灰冠の王ヴォルグ", sprite: "boss", hp: 40, atk: 3, pressure: 3, size: 2, boss: true, desc: "深層の主。弱点は毎ターン巡り、眷属を呼ぶ。" },
  };

  /* Relics change *how* you draw routes, not just numbers. */
  const RELICS = {
    boots: { name: "燠の長靴", rarity: 1, icon: "r_boots", desc: "最大移動+1。" },
    fang: { name: "狩人の牙", rarity: 1, icon: "r_fang", desc: "撃破時の移動回復+1。" },
    dirk: { name: "背刺しの短剣", rarity: 2, icon: "r_dirk", desc: "ウィークサイド攻撃のダメージ倍率+1。" },
    gauntlet: { name: "鉄の手甲", rarity: 1, icon: "r_gauntlet", desc: "各ターン、最初に受ける反撃を無効化。" },
    hourglass: { name: "灰の砂時計", rarity: 1, icon: "r_hourglass", desc: "足跡の長さ−3。盤面が広く使える。" },
    banner: { name: "群れの旗", rarity: 2, icon: "r_banner", desc: "仲間1人につき攻撃+1。" },
    heart: { name: "狂戦士の心臓", rarity: 1, icon: "r_heart", desc: "HPが半分以下の間、攻撃+2。" },
    chain: { name: "連鎖の鎖", rarity: 2, icon: "r_chain", desc: "1ターン3体目以降の撃破ごとに移動+1・HP+1。" },
    sigil: { name: "直進の槍印", rarity: 1, icon: "r_sigil", desc: "3マス以上まっすぐ進んだ直後の攻撃+2。" },
    charm: { name: "曲がり角の護符", rarity: 2, icon: "r_charm", desc: "仲間の発動条件が1段階ゆるくなる。" },
    twin: { name: "二度咲きの灯", rarity: 2, icon: "r_twin", desc: "仲間の能力が1ターンに2回まで発動する。" },
    coal: { name: "冷えた炭", rarity: 2, icon: "r_coal", desc: "ターン終了時、敵1体ごとの圧−1。" },
    aegis: { name: "灯火の盾", rarity: 1, icon: "r_aegis", desc: "斜めから攻撃した敵は反撃しない。" },
    compass: { name: "渦の羅針", rarity: 1, icon: "r_compass", desc: "輪を描いて閉じると移動+2（1ターン1回）。" },
    scorch: { name: "燃え跡", rarity: 2, icon: "r_scorch", desc: "ターン終了時、足跡に隣接する敵に2ダメージ。" },
    oath: { name: "初撃の誓い", rarity: 1, icon: "r_oath", desc: "各ターン最初の攻撃は必ずウィークサイド。" },
    pact: { name: "血の契約", rarity: 2, icon: "r_pact", desc: "最大HP−8。攻撃+2。" },
    plume: { name: "不死鳥の羽", rarity: 2, icon: "r_plume", desc: "一度だけ、倒れてもHP10で立ち上がる。" },
    afterglow: { name: "余熱", rarity: 1, icon: "r_afterglow", desc: "余った移動1につき、ターン終了ダメージ−1。" },
    lantern: { name: "大灯籠", rarity: 1, icon: "r_lantern", desc: "攻撃+1。ただし足跡の長さ+4。" },
  };

  const EVENTS = {
    altar: {
      title: "朽ちた祭壇", icon: "n_event",
      text: "灰に埋もれた祭壇が、心臓のように脈打っている。\n血を捧げれば、古い力を授けるという。",
      choices: [
        { label: "血を捧げる（HP−8・稀少レリック）", act: "altar" },
        { label: "立ち去る", act: "leave" },
      ],
    },
    lost: {
      title: "迷い灯", icon: "n_event",
      text: "暗がりで小さな灯が揺れている。\n誰かが、深層で道に迷ったらしい。",
      choices: [
        { label: "連れて行く（仲間を選ぶ）", act: "recruit" },
        { label: "灯を分けてもらう（HP+10）", act: "heal10" },
      ],
    },
    spring: {
      title: "燠泉", icon: "n_event",
      text: "温かな湧き水が岩の間から滲んでいる。\n灰の匂いがしない、珍しい水だ。",
      choices: [
        { label: "飲む（HP+14）", act: "heal14" },
        { label: "浴びる（最大HP+5）", act: "maxhp5" },
      ],
    },
    chest: {
      title: "呪われた宝箱", icon: "n_treasure",
      text: "黒い鎖で縛られた宝箱。\n開ければ、何かが目を覚ますだろう。",
      choices: [
        { label: "こじ開ける（レリック・HP−6）", act: "cursed" },
        { label: "やめておく", act: "leave" },
      ],
    },
  };

  const NODE_INFO = {
    battle: { name: "戦闘", icon: "n_battle", color: "#d3dbea" },
    elite: { name: "強敵", icon: "n_elite", color: "#ff4d5e" },
    treasure: { name: "宝箱", icon: "n_treasure", color: "#ffd35a" },
    rest: { name: "焚き火", icon: "n_rest", color: "#ff8a2a" },
    event: { name: "？", icon: "n_event", color: "#7fd8ff" },
    boss: { name: "灰冠の王", icon: "n_boss", color: "#ffd35a" },
  };

  const CHAIN_LABELS = ["", "", "DOUBLE", "TRIPLE", "BLAZE", "INFERNO", "EMBERSTORM"];

  EL.Data = { BAL, HEROES, COMPANIONS, ENEMIES, RELICS, EVENTS, NODE_INFO, CHAIN_LABELS };
})(window.EL);
