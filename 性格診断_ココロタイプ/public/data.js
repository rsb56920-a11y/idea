// ココロタイプの質問と16タイプの定義。サーバー(タイプの判定)と画面の両方で使う。

// 4つの軸。各軸の1つめの極が質問の「そう思う」側(dir: 1)
export const AXES = [
  { key: "energy", poles: [{ c: "S", name: "太陽", ico: "☀️", desc: "人と関わって元気になる" }, { c: "M", name: "月", ico: "🌙", desc: "ひとりの時間で元気になる" }] },
  { key: "view", poles: [{ c: "E", name: "大地", ico: "🌿", desc: "目の前の事実を大切にする" }, { c: "K", name: "空", ico: "☁️", desc: "ひらめきや可能性を大切にする" }] },
  { key: "judge", poles: [{ c: "B", name: "剣", ico: "⚔️", desc: "筋道と論理で決める" }, { c: "F", name: "花", ico: "🌸", desc: "気持ちと思いやりで決める" }] },
  { key: "pace", poles: [{ c: "P", name: "星図", ico: "🗺️", desc: "計画を立てて進む" }, { c: "W", name: "風", ico: "🍃", desc: "その場の流れで動く" }] },
];

// axis: AXES の番号、dir: 1 なら「そう思う」が1つめの極寄り
export const QUESTIONS = [
  { t: "初対面の人とも、すぐに打ち解けられる", axis: 0, dir: 1 },
  { t: "新しいことは、まず実際にやってみて覚える", axis: 1, dir: 1 },
  { t: "迷ったときは、気持ちより筋が通っているかで決める", axis: 2, dir: 1 },
  { t: "旅行は行き先や時間をしっかり決めておきたい", axis: 3, dir: 1 },
  { t: "休日は家でひとりで過ごすと元気になる", axis: 0, dir: -1 },
  { t: "「もしも〜だったら」と空想するのが好き", axis: 1, dir: -1 },
  { t: "友達の相談には、解決策より気持ちに寄り添いたい", axis: 2, dir: -1 },
  { t: "締め切りギリギリの方が力を発揮できる", axis: 3, dir: -1 },
  { t: "大人数の集まりにいるとワクワクする", axis: 0, dir: 1 },
  { t: "説明は具体的な例や数字があるとわかりやすい", axis: 1, dir: 1 },
  { t: "間違っていることは、相手が誰でも指摘したい", axis: 2, dir: 1 },
  { t: "部屋や持ち物が整理されていないと落ち着かない", axis: 3, dir: 1 },
  { t: "話す前に、頭の中で考えをまとめておきたい", axis: 0, dir: -1 },
  { t: "物事の裏にある意味やつながりが気になる", axis: 1, dir: -1 },
  { t: "人を傷つけないよう、言葉を選ぶことが多い", axis: 2, dir: -1 },
  { t: "予定が急に変わっても、むしろ楽しめる", axis: 3, dir: -1 },
];

export const SCALE = ["ちがう", "ややちがう", "どちらでも", "ややそう", "そう思う"];

// 16タイプ。best: いちばん相性のいいタイプ
export const TYPES = {
  SEBP: { name: "頼れる司令塔", ico: "🦁", color: "#f59e0b", catch: "みんなを引っぱる、生まれつきのリーダー", traits: ["決断が早い", "責任感が強い", "段取り上手"], best: "MEFW" },
  SEBW: { name: "現場のヒーロー", ico: "🏄", color: "#ef4444", catch: "考えるより先に体が動く、頼もしい行動派", traits: ["ピンチに強い", "度胸がある", "切り替えが早い"], best: "MEFP" },
  SEFP: { name: "みんなのお世話係", ico: "🐻", color: "#f97316", catch: "気づけばいつも誰かを助けている、あたたかい人", traits: ["気配り上手", "面倒見がいい", "約束を守る"], best: "MEBW" },
  SEFW: { name: "ムードメーカー", ico: "🦜", color: "#ec4899", catch: "その場をパッと明るくする、みんなの太陽", traits: ["ノリがいい", "人を笑顔にする", "好奇心旺盛"], best: "MEBP" },
  SKBP: { name: "未来を描く指揮者", ico: "🦅", color: "#8b5cf6", catch: "大きな夢を、本当に形にしてしまう戦略家", traits: ["ビジョンがある", "説得力がある", "目標に一直線"], best: "MKFW" },
  SKBW: { name: "ひらめきの発明家", ico: "🦊", color: "#06b6d4", catch: "アイデアが次々わいてくる、議論好きの天才肌", traits: ["発想がユニーク", "頭の回転が速い", "新しもの好き"], best: "MKFP" },
  SKFP: { name: "心を導く語り手", ico: "🦢", color: "#d946ef", catch: "人の可能性を信じて、背中を押してあげられる人", traits: ["共感力が高い", "言葉に力がある", "理想を大切にする"], best: "MKBW" },
  SKFW: { name: "自由な冒険家", ico: "🦋", color: "#14b8a6", catch: "ワクワクを追いかけて、人生を楽しむ天才", traits: ["情熱的", "人懐っこい", "想像力豊か"], best: "MKBP" },
  MEBP: { name: "堅実な守り手", ico: "🐢", color: "#64748b", catch: "コツコツ積み上げて、確かな結果を出す人", traits: ["誠実", "粘り強い", "ルールを大切にする"], best: "SEFW" },
  MEBW: { name: "クールな職人", ico: "🐺", color: "#0ea5e9", catch: "手を動かしながら答えを見つける、静かな実力者", traits: ["器用", "冷静", "ムダがない"], best: "SEFP" },
  MEFP: { name: "やさしい守り手", ico: "🐑", color: "#84cc16", catch: "大切な人を、そっと陰から支える人", traits: ["献身的", "思いやりがある", "細やか"], best: "SEBW" },
  MEFW: { name: "マイペースな芸術家", ico: "🐱", color: "#f472b6", catch: "自分だけの「好き」を持っている、感性の人", traits: ["センスがいい", "おだやか", "自分らしさを大切にする"], best: "SEBP" },
  MKBP: { name: "静かな戦略家", ico: "🦉", color: "#6366f1", catch: "何手も先を読んでいる、頭脳派の策士", traits: ["分析力が高い", "独立心が強い", "計画的"], best: "SKFW" },
  MKBW: { name: "好奇心の研究者", ico: "🐙", color: "#22d3ee", catch: "「なぜ？」を追いかけ続ける、知の探検家", traits: ["論理的", "探究心が強い", "こだわりがある"], best: "SKFP" },
  MKFP: { name: "見守る賢者", ico: "🦌", color: "#a78bfa", catch: "人の心の奥まで見通す、静かな理解者", traits: ["洞察力がある", "信念が強い", "聞き上手"], best: "SKBW" },
  MKFW: { name: "夢見る詩人", ico: "🐇", color: "#fb7185", catch: "心の中にやさしい世界を持っている理想家", traits: ["感受性が豊か", "やさしい", "創造的"], best: "SKBP" },
};

// 回答(1〜5 の配列)からタイプコードと各軸の割合(1つめの極が何%か)を出す
export function judge(answers) {
  const sums = [0, 0, 0, 0];
  QUESTIONS.forEach((q, i) => (sums[q.axis] += (answers[i] - 3) * q.dir));
  const counts = [0, 0, 0, 0];
  QUESTIONS.forEach((q) => counts[q.axis]++);
  const code = sums.map((s, a) => AXES[a].poles[s >= 0 ? 0 : 1].c).join("");
  const percents = sums.map((s, a) => Math.round(50 + (s / (counts[a] * 2)) * 50));
  return { code, percents };
}

export const validAnswers = (a) =>
  Array.isArray(a) && a.length === QUESTIONS.length && a.every((x) => Number.isInteger(x) && x >= 1 && x <= 5);
