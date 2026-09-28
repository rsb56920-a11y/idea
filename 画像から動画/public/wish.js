// 「お願い」の文章から、かける効果を決める(AIを使わず、言葉の辞書で読み取る)。
// 例: 「桜が舞って夕焼けっぽく、ゆっくり近づいて」→ 桜・夕焼け・ズームイン・ゆっくり

const RULES = [
  // [正規表現, 効果] 上から順に見る
  [/流れ星/, { particles: ["shooting"] }],
  [/桜|さくら|サクラ|花びら|花吹雪/, { particles: ["sakura"] }],
  [/雪|ゆき|スノー|冬/, { particles: ["snow"] }],
  [/雨|あめ|レイン|しとしと|梅雨/, { particles: ["rain"] }],
  [/紅葉|もみじ|落ち葉|秋/, { particles: ["leaves"] }],
  [/蛍|ほたる|光の粒|きらきら|キラキラ|輝|かがやく|魔法|まほう/, { particles: ["glow"] }],
  [/星空|星が|ほし|満天|スター|宇宙/, { particles: ["stars"], grade: "night" }],
  [/ハート|恋|すき|好き|ラブ|愛/, { particles: ["hearts"] }],
  [/紙吹雪|お祝い|おいわい|誕生日|たんじょうび|おめでと|パーティ|祝/, { particles: ["confetti"] }],
  [/泡|シャボン|しゃぼん/, { particles: ["bubbles"] }],
  [/羽|はね|天使/, { particles: ["feathers"] }],
  [/花火|はなび/, { particles: ["fireworks"], grade: "night" }],
  [/夕焼け|夕日|ゆうひ|夕暮れ|たそがれ|黄昏|エモ/, { grade: "sunset" }],
  [/夜|よる|ナイト|月夜|月明/, { grade: "night" }],
  [/昔|むかし|レトロ|フィルム|思い出|おもいで|懐かし|なつかし|ノスタル/, { grade: "film" }],
  [/夢|ゆめ|幻想|ファンタジー|ふんわり|やさしい|優しい|柔らか/, { grade: "dream" }],
  [/白黒|モノクロ|モノトーン/, { grade: "mono" }],
  [/鮮やか|あざやか|映え|ばえ|はっきり|カラフル/, { grade: "vivid" }],
  [/涼し|すずし|夏|爽やか|さわやか|クール/, { grade: "cool" }],
  [/光が差|ひかりがさ|日差し|木漏れ日|こもれび|神々し|光を|光って|ひかって/, { rays: true }],
  // カメラの動き
  [/近づ|ちかづ|寄って|よって|ズームイン|アップ/, { camera: "zoomIn" }],
  [/遠ざか|離れ|はなれ|引いて|ひいて|ズームアウト|全体を見せ/, { camera: "zoomOut" }],
  [/右へ|右に|みぎ/, { camera: "panRight" }],
  [/左へ|左に|ひだり/, { camera: "panLeft" }],
  [/上へ|上に|見上げ|うえに/, { camera: "panUp" }],
  [/止め|止まっ|動かさない|固定/, { camera: "none" }],
  [/ゆっくり|ゆったり|のんびり|静か|しずか/, { speed: 0.7 }],
  [/速く|はやく|テンポ|スピード|元気|げんき/, { speed: 1.4 }],
  // 写真の一部を動かす(なぞって場所を決める。空・水は自動でもさがす)
  [/滝|たき/, { region: { fx: "flow", dir: "down", area: "paint", label: "滝が流れる" } }],
  [/川|かわ|せせらぎ|水が流/, { region: { fx: "flow", dir: "right", area: "water", label: "水が流れる" } }],
  [/海|うみ|波|なみ|湖|みずうみ|水面/, { region: { fx: "wave", dir: "right", area: "water", label: "水面がゆれる" } }],
  [/雲|くも|空が/, { region: { fx: "flow", dir: "right", area: "sky", label: "雲が流れる" } }],
  [/髪|かみ|なびく|なびか|風|かぜ|揺れ|ゆれ|木|草|葉っぱ|はっぱ|旗|はた|カーテン/, { region: { fx: "sway", area: "paint", label: "風でゆれる" } }],
  [/炎|ほのお|火|ろうそく|キャンドル|たき火|焚き火|ゆらめ/, { region: { fx: "flicker", area: "paint", label: "炎がゆらめく" } }],
  [/湯気|ゆげ|煙|けむり|けむ|コーヒー|ラーメン/, { region: { fx: "rise", area: "paint", label: "湯気が立ちのぼる" } }],
  [/立体|飛び出|とびだ|3D|３Ｄ|奥行|おくゆき|浮き出/, { parallax: true }],
];

// 写真の中の人を「動かす」たぐいの願い(このアプリでは写真の中身は描き直せない)
const CANNOT = /まばたき|瞬き|目を閉|口を|しゃべ|喋|話す|笑う|笑わせ|踊|おど|歩|あるか|走|はし|手を振|振り向|うなず|表情|顔を動|動物を動|ジャンプ/;

export function parseWish(text = "") {
  const fx = { particles: [], grade: null, rays: false, camera: null, speed: 1, regions: [], parallax: false, cannot: false, amount: 1 };
  const s = text.replace(/\s+/g, "");
  if (!s) return fx;
  for (const [re, add] of RULES) {
    if (!re.test(s)) continue;
    if (add.particles) for (const p of add.particles) if (!fx.particles.includes(p)) fx.particles.push(p);
    if (add.grade && !fx.grade) fx.grade = add.grade;
    if (add.rays) fx.rays = true;
    if (add.camera && !fx.camera) fx.camera = add.camera;
    if (add.speed) fx.speed = add.speed;
    if (add.region && !fx.regions.some((r) => r.fx === add.region.fx)) fx.regions.push({ ...add.region });
    if (add.parallax) fx.parallax = true;
  }
  if (/たくさん|いっぱい|大量|めっちゃ|すごく/.test(s)) fx.amount = 1.7;
  if (/少し|すこし|ちょっと|控えめ|ひかえめ|ほんのり/.test(s)) fx.amount = 0.55;
  fx.cannot = CANNOT.test(s);
  return fx;
}

// 読み取った内容を、人が読める言葉の一覧にする
export function describe(fx, names) {
  const out = [];
  for (const p of fx.particles) out.push(names.particles[p]?.name || p);
  if (fx.grade) out.push(names.grades[fx.grade]?.name || fx.grade);
  if (fx.rays) out.push("☀️ 光が差す");
  if (fx.camera) out.push({ zoomIn: "🎥 ゆっくり近づく", zoomOut: "🎥 ゆっくり離れる", panRight: "🎥 右へ", panLeft: "🎥 左へ", panUp: "🎥 見上げる", none: "🎥 カメラ固定" }[fx.camera]);
  if (fx.speed !== 1) out.push(fx.speed < 1 ? "🐢 ゆっくり" : "🐇 はやめ");
  if (fx.amount !== 1) out.push(fx.amount > 1 ? "➕ たくさん" : "➖ ひかえめ");
  for (const r of fx.regions) out.push(`🖌 ${r.label}`);
  if (fx.parallax) out.push("🧊 立体的に");
  return out;
}
