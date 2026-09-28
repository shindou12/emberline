/* EMBERLINE — content & balance data */
(function (EL) {
  "use strict";

  const BAL = {
    GW: 7, GH: 8, // board size (tiles)
    trailBase: 5, trailPer: 3, // ember trail length = base + per * companions
    pushDist: 2, // survivors are shoved this many tiles along your line
    tangleMax: 3, // enemies that can pile into one tile
    bump: 1, bumpPerMove: 1 / 3, // collision damage = bump + floor(moves left × bumpPerMove)
    refundDecay: 1, // kills after the first in a route refund this much less // moves regained for creating a tangle
    coolMin: 2, // embers always cool at least this many tiles per turn
    sealRange: 2, // ward pillar: enemies within this many tiles lose their weak side
    healAfterBattle: 10, // Kai's trait only: heat vented after each won battle
    restCool: 60, // the campfire's rest
    /* heat: 0..100, burnout at 100. Carried between battles. */
    heat: {
      step: 6, // heat per step (a step alone never burns you out)
      dmgMul: 5, // heat per point of enemy damage (counters, strikes)
      pressPct: 0.08, // each point of night pressure takes this share of the margin left
      cool: 0.2, // after the night, this share of your heat cools off
      ventBase: 6, ventPct: 0.15, ventLater: 2 / 3, // a kill vents base + share of heat (later kills in a route vent less)
      fury1: 40, fury2: 65, // attack +1 / +2 at this much heat
      chargeHeat: 2, // companion charge ×(1 + chargeHeat × heat/100)
    },
    maxCompanions: 3,
    maxRows: 7, // rows before the boss
  };

  const HEROES = {
    kai: {
      name: "カイ", title: "燠の剣士", sprite: "kai", hp: 100, atk: 3, mov: 6, bud: [5, 0.4], refund: 2,
      trait: "燠の手当て", traitText: "戦闘に勝つたび、熱が10下がる。",
      style: "バランス型。背後を取って切り抜けろ。", color: "#e8453c",
      stats: { hp: 3, atk: 3, mov: 3 },
    },
    rue: {
      name: "ルゥ", title: "風の槍兵", sprite: "rue", hp: 100, atk: 3, mov: 7, bud: [6, 0.5], refund: 2,
      trait: "突進", traitText: "攻撃の直前にまっすぐ進んだマス数だけ攻撃+1（最大+3）。",
      style: "連鎖型。長い直線で突き抜け、倒して走り続けろ。", color: "#3fd6c0",
      stats: { hp: 2, atk: 3, mov: 4 },
    },
    gorm: {
      name: "ゴルム", title: "灰の重騎士", sprite: "gorm", hp: 100, atk: 4, mov: 5, bud: [4, 0.3], refund: 2,
      trait: "鉄壁", traitText: "各ターン最初の反撃を無効化する。押し出しが1マス伸びる。",
      style: "重装型。少ない歩数で確実に砕け。", color: "#b8862e",
      stats: { hp: 4, atk: 4, mov: 2 },
    },
  };

  /* Companions fill a gauge: each time the route meets their condition (charge[0])
     and a little on every step (charge[1]), both multiplied by heat. A gauge that
     is full when the turn begins can be fired from any tile of the route. */
  const COMPANIONS = {
    pip: {
      name: "ピップ", title: "灯持ちの従者", sprite: "pip", color: "#ffd35a",
      cond: { type: "straight", n: 2 }, condText: "直進2", condLong: "同じ方向へ2マス続けて進む", charge: [46, 4],
      skill: "閃光の矢", skillText: "進んできた方向の先にいる最初の敵に5ダメージ", effect: "pierce", power: 5,
    },
    mira: {
      name: "ミラ", title: "燠火の魔女", sprite: "mira", color: "#ff8a2a",
      cond: { type: "corner", a: 1, b: 1 }, condText: "直角", condLong: "直角に曲がる", charge: [52, 4],
      skill: "爆ぜ火", skillText: "周囲3×3の敵に3ダメージ", effect: "burst", power: 3,
    },
    tock: {
      name: "トック", title: "ぜんまい従機", sprite: "tock", color: "#d3dbea",
      cond: { type: "zigzag", n: 2 }, condText: "方向転換", condLong: "進む向きを変える", charge: [52, 6],
      skill: "加速機構", skillText: "移動+3", effect: "haste", power: 3,
    },
    wren: {
      name: "レン", title: "灰森の射手", sprite: "wren", color: "#8fe07a",
      cond: { type: "tangle", n: 1 }, condText: "もつれ", condLong: "敵を押し出して、もつれを作る", charge: [65, 4],
      skill: "追い撃ち", skillText: "HPの低い敵2体に3ダメージ", effect: "volley", power: 3,
    },
    bram: {
      name: "ブラム", title: "盾の老兵", sprite: "bram", color: "#fff6df",
      cond: { type: "kills", n: 1 }, condText: "撃破", condLong: "敵を1体倒す", charge: [65, 6],
      skill: "不屈", skillText: "熱−12＋次の反撃を1回無効", effect: "guard", power: 12,
    },
    sable: {
      name: "セーブル", title: "影猫", sprite: "sable", color: "#b08cff",
      cond: { type: "weak", n: 1 }, condText: "背撃", condLong: "ウィークサイドから1回攻撃する", charge: [58, 4],
      skill: "影渡り", skillText: "次の2回の攻撃が必ずウィークサイドになる", effect: "shadow", power: 2,
    },
    luna: {
      name: "ルナ", title: "月環の巫女", sprite: "luna", color: "#7fd8ff",
      cond: { type: "loop", n: 3 }, condText: "円を描く", condLong: "3歩以上の輪を描き、自分の道に隣接して閉じる", charge: [78, 8],
      skill: "月の環", skillText: "周囲2マス以内の敵すべてに4ダメージ", effect: "ring", power: 4,
    },
  };

  const ENEMIES = {
    husk: { name: "殻喰い", sprite: "husk", hp: 11, atk: 1, pressure: 1, ai: "chase", desc: "近づいてくる。背中（弱点）を向けて歩く。" },
    wisp: { name: "鬼火", sprite: "wisp", hp: 7, atk: 0, pressure: 2, rotates: true, ai: "static", desc: "脆いが夜の圧が強い。弱点が毎ターン回る。" },
    shield: { name: "盾持ち", sprite: "shield", hp: 15, atk: 2, pressure: 1, ai: "static", desc: "硬く、反撃が痛い。背後を狙え。" },
    caller: { name: "呼び声", sprite: "caller", hp: 10, atk: 1, pressure: 1, summons: true, ai: "flee", desc: "逃げ回りながら殻喰いを呼ぶ。" },
    totem: { name: "結界柱", sprite: "totem", hp: 12, atk: 0, pressure: 1, seals: true, ai: "static", desc: "周囲2マスの敵の弱点を封じる。倒すか、範囲の外へ押し出せば弱点が戻る。" },
    brute: { name: "骨砕き", sprite: "brute", hp: 19, atk: 3, pressure: 2, ai: "slow", tele: "cross", teleDmg: 5, desc: "2ターンに1歩。十字に大槌を振り下ろす。" },
    boss: { name: "灰冠の王ヴォルグ", sprite: "boss", hp: 44, atk: 2, pressure: 4, size: 2, boss: true, ai: "static", tele: "boss", teleDmg: 6, desc: "深層の主。弱点は毎ターン巡り、灰の波で列を薙ぐ。押し出せない。" },
  };

  /* Relics change *how* you draw routes, not just numbers. */
  const RELICS = {
    boots: { name: "燠の長靴", rarity: 1, icon: "r_boots", desc: "最低歩数+1。" },
    fang: { name: "狩人の牙", rarity: 1, icon: "r_fang", desc: "撃破時の移動回復+1。" },
    dirk: { name: "背刺しの短剣", rarity: 2, icon: "r_dirk", desc: "ウィークサイド攻撃のダメージ倍率+1。" },
    gauntlet: { name: "鉄の手甲", rarity: 1, icon: "r_gauntlet", desc: "反撃で受けるダメージ−1（熱−4）。" },
    hourglass: { name: "灰の砂時計", rarity: 1, icon: "r_hourglass", desc: "足跡の長さ−3。盤面が広く使える。" },
    banner: { name: "群れの旗", rarity: 2, icon: "r_banner", desc: "仲間1人につき攻撃+1。" },
    heart: { name: "狂戦士の心臓", rarity: 1, icon: "r_heart", desc: "熱が50以上の間、攻撃+2。" },
    chain: { name: "連鎖の鎖", rarity: 2, icon: "r_chain", desc: "1ターン3体目以降の撃破ごとに移動+1・熱−3。" },
    sigil: { name: "直進の槍印", rarity: 1, icon: "r_sigil", desc: "3マス以上まっすぐ進んだ直後の攻撃+2。" },
    charm: { name: "曲がり角の護符", rarity: 2, icon: "r_charm", desc: "仲間のゲージが30%たまりやすくなる。" },
    twin: { name: "二度咲きの灯", rarity: 2, icon: "r_twin", desc: "満タンになったゲージを、そのターンのうちに使える。" },
    coal: { name: "冷えた炭", rarity: 2, icon: "r_coal", desc: "ターン終了時、敵1体ごとの圧−1。" },
    aegis: { name: "灯火の盾", rarity: 1, icon: "r_aegis", desc: "押し出せた敵からは反撃されない。" },
    compass: { name: "渦の羅針", rarity: 1, icon: "r_compass", desc: "輪を描いて閉じると移動+2（1ターン1回）。" },
    scorch: { name: "燃え跡", rarity: 2, icon: "r_scorch", desc: "ターン終了時、足跡に隣接する敵に2ダメージ。" },
    oath: { name: "初撃の誓い", rarity: 1, icon: "r_oath", desc: "各ターン最初の攻撃は必ずウィークサイド。" },
    pact: { name: "血の契約", rarity: 2, icon: "r_pact", desc: "攻撃+2。被弾で上がる熱が20%増える。" },
    plume: { name: "不死鳥の羽", rarity: 2, icon: "r_plume", desc: "一度だけ、燃え尽きても熱50で持ちこたえる。" },
    afterglow: { name: "余熱", rarity: 1, icon: "r_afterglow", desc: "余った移動1につき、夜の圧−1。" },
    lantern: { name: "大灯籠", rarity: 1, icon: "r_lantern", desc: "攻撃+1。ただし足跡の長さ+4。" },
    brawn: { name: "剛腕", rarity: 1, icon: "r_gauntlet", desc: "押し出しが1マス伸びる。" },
    impact: { name: "衝撃の鋲", rarity: 1, icon: "r_sigil", desc: "衝突ダメージが2倍になる。" },
    rope: { name: "絡め縄", rarity: 2, icon: "r_chain", desc: "もつれた敵を倒すと移動+1。もつれは4体まで重なる。" },
    shade: { name: "影歩き", rarity: 1, icon: "r_plume", desc: "各ターン最初の反撃を無効化する。" },
    emberhand: { name: "燠の手", rarity: 1, icon: "r_scorch", desc: "燃える足跡に押し込んだ敵に+2ダメージ。" },
  };

  const EVENTS = {
    altar: {
      title: "朽ちた祭壇", icon: "n_event",
      text: "灰に埋もれた祭壇が、心臓のように脈打っている。\n身を焦がす熱を捧げれば、古い力を授けるという。",
      choices: [
        { label: "熱を捧げる（熱+25・稀少レリック）", act: "altar" },
        { label: "立ち去る", act: "leave" },
      ],
    },
    lost: {
      title: "迷い灯", icon: "n_event",
      text: "暗がりで小さな灯が揺れている。\n誰かが、深層で道に迷ったらしい。",
      choices: [
        { label: "連れて行く（仲間を選ぶ）", act: "recruit" },
        { label: "灯を預ける（熱−25）", act: "heal10" },
      ],
    },
    spring: {
      title: "燠泉", icon: "n_event",
      text: "温かな湧き水が岩の間から滲んでいる。\n灰の匂いがしない、珍しい水だ。",
      choices: [
        { label: "飲む（熱−35）", act: "heal14" },
        { label: "浴びる（仲間のゲージ満タン）", act: "maxhp5" },
      ],
    },
    chest: {
      title: "呪われた宝箱", icon: "n_treasure",
      text: "黒い鎖で縛られた宝箱。\n開ければ、何かが目を覚ますだろう。",
      choices: [
        { label: "こじ開ける（レリック・熱+20）", act: "cursed" },
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

  /* battle objectives: an action and its reward are shown before the fight */
  const OBJECTIVES = {
    chain3: { label: "3連鎖", desc: "1ターンに3体以上を連続撃破する" },
    multi: { label: "まとめ撃破", desc: "もつれた敵を2体同時に倒す" },
    weak3: { label: "背撃3", desc: "ウィークサイドから3回攻撃する" },
    bump3: { label: "衝突3", desc: "押し出しで3回ぶつける" },
    noguard: { label: "反撃ゼロ", desc: "一度も反撃を受けずに勝つ" },
    fast2: { label: "2ターン", desc: "2ターン以内に全滅させる" },
    friendly: { label: "同士討ち", desc: "敵の攻撃予告で敵を倒させる" },
  };

  const CHAIN_LABELS = ["", "", "DOUBLE", "TRIPLE", "BLAZE", "INFERNO", "EMBERSTORM"];

  EL.Data = { BAL, HEROES, COMPANIONS, ENEMIES, RELICS, EVENTS, NODE_INFO, CHAIN_LABELS, OBJECTIVES };
})(window.EL);
