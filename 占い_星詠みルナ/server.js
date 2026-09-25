import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
// 1IPあたり1時間に占える回数(API料金の使いすぎ防止)
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR) || 20;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

// APIキーが無い場合はデモモード(ランダムな定型文)で動く
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

// ---------- 占いメニュー ----------
const MENUS = {
  tarot: {
    label: "タロット占い",
    prompt: (i) =>
      `タロット占い(スリーカード・スプレッド)の鑑定をしてください。
相談者の名前: ${i.name || "相談者"}
相談内容: ${i.question || "(総合運)"}
引いたカード:
- 過去: ${i.cards?.[0] ?? "?"}
- 現在: ${i.cards?.[1] ?? "?"}
- 未来: ${i.cards?.[2] ?? "?"}
sections は「過去」「現在」「未来」「相談への答え」の4つにしてください。各カードの意味(正位置/逆位置)を踏まえて解釈すること。`,
  },
  compat: {
    label: "相性診断",
    prompt: (i) =>
      `二人の相性診断をしてください。
一人目: ${i.name || "?"}(誕生日 ${i.birthday || "不明"})
二人目: ${i.partner || "?"}(誕生日 ${i.partnerBirthday || "不明"})
関係: ${i.relation || "恋愛"}
score は相性度(0〜100)。sections は「二人の性格の組み合わせ」「うまくいくポイント」「すれ違いやすいポイント」「関係を深めるには」の4つ。`,
  },
  pastlife: {
    label: "前世診断",
    prompt: (i) =>
      `前世診断をしてください。
名前: ${i.name || "?"} / 誕生日: ${i.birthday || "不明"}
title は「あなたの前世は〇〇」の形で、時代・国・職業が具体的に想像できる印象的なものに。score は「前世からの魂の輝き度」(0〜100)。
sections は「前世の暮らし」「前世から受け継いだ才能」「今世での課題」「前世と縁のある人」の4つ。`,
  },
  today: {
    label: "今日の運勢",
    prompt: (i) =>
      `今日(${new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })})の運勢を占ってください。
名前: ${i.name || "?"} / 誕生日: ${i.birthday || "不明"} / 星座: ${i.zodiac || "不明"}
score は総合運(0〜100)。sections は「恋愛運」「仕事・勉強運」「金運」「対人運」の4つ。`,
  },
};

const SYSTEM = `あなたは人気の占い師「ルナ」です。やさしく神秘的な語り口で、日本語で鑑定結果を書きます。
- 相談者を前向きな気持ちにさせる内容にする。不安をあおる断定や、医療・法律・投資の具体的判断はしない。
- 誰にでも当てはまる曖昧な文ではなく、入力内容(名前・誕生日・相談内容・カード)に具体的に触れる。
- summary は無料で見られる部分。続きが気になるよう、核心の手前で終える(2〜3文)。
- sections の本文はそれぞれ3〜5文。
- lucky にはラッキーカラー・ラッキーアイテム・ラッキーナンバー(1〜99)を入れる。
- shareText は SNS に投稿したくなる一言(40文字以内、絵文字1〜2個)。`;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "結果の見出し(20文字以内)" },
    score: { type: "integer", description: "0〜100" },
    summary: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: { heading: { type: "string" }, body: { type: "string" } },
        required: ["heading", "body"],
        additionalProperties: false,
      },
    },
    lucky: {
      type: "object",
      properties: { color: { type: "string" }, item: { type: "string" }, number: { type: "integer" } },
      required: ["color", "item", "number"],
      additionalProperties: false,
    },
    advice: { type: "string", description: "最後のひとこと(1文)" },
    shareText: { type: "string" },
  },
  required: ["title", "score", "summary", "sections", "lucky", "advice", "shareText"],
  additionalProperties: false,
};

async function aiReading(menu, input) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: MENUS[menu].prompt(input) }],
    output_config: { effort: "low", format: { type: "json_schema", schema: RESULT_SCHEMA } },
    // 拒否された場合はサーバー側で自動的に別モデルへフォールバック
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") throw new UserError("この内容では占えませんでした。相談内容を変えてお試しください。");
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`empty response (stop_reason=${response.stop_reason})`);
  return JSON.parse(text);
}

// ---------- デモモード ----------
const DEMO = {
  titles: {
    tarot: "新しい扉がひらく予感",
    compat: "引き寄せ合うふたり",
    pastlife: "あなたの前世は中世ヴェネツィアのガラス職人",
    today: "小さな幸運が重なる一日",
  },
  colors: ["ラベンダー", "ミントグリーン", "ゴールド", "スカイブルー", "コーラルピンク"],
  items: ["手鏡", "ハンカチ", "レモンティー", "しおり", "小さなピアス"],
};
function demoReading(menu, input) {
  const r = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const headings = {
    tarot: ["過去", "現在", "未来", "相談への答え"],
    compat: ["二人の性格の組み合わせ", "うまくいくポイント", "すれ違いやすいポイント", "関係を深めるには"],
    pastlife: ["前世の暮らし", "前世から受け継いだ才能", "今世での課題", "前世と縁のある人"],
    today: ["恋愛運", "仕事・勉強運", "金運", "対人運"],
  }[menu];
  return {
    title: DEMO.titles[menu],
    score: 60 + Math.floor(Math.random() * 38),
    summary: `${input.name || "あなた"}さん、星たちがあなたに静かに語りかけています。今はちょうど流れが変わる節目。けれど本当に大切なのは、このあとに見える"ある兆し"で……`,
    sections: headings.map((h) => ({
      heading: h,
      body: `(デモ鑑定)${h}について、ここにAIの詳しい鑑定文が入ります。サーバーに ANTHROPIC_API_KEY を設定すると、入力内容に合わせた本物の鑑定になります。`,
    })),
    lucky: { color: r(DEMO.colors), item: r(DEMO.items), number: 1 + Math.floor(Math.random() * 99) },
    advice: "迷ったときは、心が少し温かくなる方を選んでください。",
    shareText: "占ってもらったら当たりすぎてた…🔮✨",
  };
}

// ---------- HTTP ----------
class UserError extends Error {}

const hits = new Map(); // ip -> timestamps
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (list.length >= RATE_LIMIT) return true;
  list.push(now);
  hits.set(ip, list);
  return false;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new UserError("入力が長すぎます");
  }
  return JSON.parse(body);
}

// 入力は文字列だけを短く切って使う
function clean(input) {
  const out = {};
  for (const k of ["name", "birthday", "partner", "partnerBirthday", "relation", "question", "zodiac"]) {
    if (typeof input?.[k] === "string") out[k] = input[k].slice(0, k === "question" ? 300 : 40);
  }
  if (Array.isArray(input?.cards)) out.cards = input.cards.slice(0, 3).map((c) => String(c).slice(0, 40));
  return out;
}

async function handleReading(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    return json(res, 400, { error: err instanceof UserError ? err.message : "リクエストが不正です" });
  }
  const { menu } = payload;
  if (!MENUS[menu]) return json(res, 400, { error: "不明なメニューです" });
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  if (client && rateLimited(ip)) return json(res, 429, { error: "占いの回数が上限に達しました。1時間ほど空けてからお試しください。" });

  const input = clean(payload.input);
  try {
    const result = client ? await aiReading(menu, input) : demoReading(menu, input);
    json(res, 200, { menu, result, demo: !client });
  } catch (err) {
    console.error(err);
    const message =
      err instanceof UserError
        ? err.message
        : err instanceof Anthropic.RateLimitError
          ? "ただいま混み合っています。少し待ってからお試しください。"
          : "鑑定中にエラーが発生しました。もう一度お試しください。";
    json(res, 500, { error: message });
  }
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const filePath = path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return res.writeHead(403).end();
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    const data = await readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(data);
  }
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/reading") return handleReading(req, res);
    if (req.method === "GET" && req.url === "/api/status") return json(res, 200, { demo: !client });
    if (req.method === "GET") return serveStatic(req, res);
    res.writeHead(405).end();
  })
  .listen(PORT, () => {
    console.log(`AI占い: http://localhost:${PORT} (${client ? `model=${MODEL}` : "デモモード"})`);
  });
