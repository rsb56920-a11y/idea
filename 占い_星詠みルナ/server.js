import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import Stripe from "stripe";

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
// 1IPあたり1時間に占える回数(API料金の使いすぎ防止)
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR) || 20;
// 無料鑑定に付ける署名の鍵。本番では固定値を環境変数で渡す(再起動で変わると購入前の鑑定が開けなくなる)
const SECRET = process.env.READING_SECRET || crypto.randomBytes(32).toString("hex");
// 決済: STRIPE_SECRET_KEY があれば Stripe、無ければデモ(購入ボタンを押すだけで開く)
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const PAYMENT_MODE = process.env.PAYMENT_MODE || (stripe ? "stripe" : "demo");
const PRICE_JPY = Number(process.env.PRICE_JPY) || 300;
// Stripe の支払い後に戻ってくるURL(例: https://luna.example.com)。未設定ならアクセスされたホスト名を使う
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, "");
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(APP_DIR, "public");

// 特定商取引法の表記などに使うお店の情報(shop.json)。「【】」が残っていたら未記入
async function loadShop() {
  try {
    const { _説明, ...shop } = JSON.parse(await readFile(path.join(APP_DIR, "shop.json"), "utf8"));
    return shop;
  } catch (err) {
    console.error("shop.json を読めません:", err.message);
    return {};
  }
}
const isFilled = (shop) => Object.values(shop).length > 0 && !Object.values(shop).some((v) => String(v).includes("【"));

// APIキーが無い場合はデモモード(ランダムな定型文)で動く
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

// ---------- 占いメニュー ----------
const MENUS = {
  tarot: {
    headings: ["過去", "現在", "未来", "相談への答え"],
    prompt: (i) =>
      `タロット占い(スリーカード・スプレッド)の鑑定です。
相談者の名前: ${i.name || "相談者"}
相談内容: ${i.question || "(総合運)"}
引いたカード:
- 過去: ${i.cards?.[0] ?? "?"}
- 現在: ${i.cards?.[1] ?? "?"}
- 未来: ${i.cards?.[2] ?? "?"}
各カードの意味(正位置/逆位置)を踏まえて解釈すること。`,
  },
  oshi: {
    headings: ["推しとの魂のつながり", "推しがあなたにくれる力", "推し活の運気が上がる時", "推しとの縁を深めるには"],
    prompt: (i) =>
      `推しとの相性診断です。
相談者: ${i.name || "?"}(誕生日 ${i.birthday || "不明"})
推し: ${i.oshi || "?"}(${i.oshiGenre || "ジャンル不明"}、誕生日 ${i.oshiBirthday || "不明"})
推しの好きなところ: ${i.oshiLove || "(未入力)"}
score は「推しとの魂のシンクロ率」(0〜100)。70未満にはしない。
推しが実在の人物の場合でも、その人の私生活・人柄・交際などを事実のように断定しない。相談者の気持ちや推し活の楽しみ方に焦点を当てる。title は推し活が楽しくなるポジティブなものに。`,
  },
  compat: {
    headings: ["二人の性格の組み合わせ", "うまくいくポイント", "すれ違いやすいポイント", "関係を深めるには"],
    prompt: (i) =>
      `二人の相性診断です。
一人目: ${i.name || "?"}(誕生日 ${i.birthday || "不明"})
二人目: ${i.partner || "?"}(誕生日 ${i.partnerBirthday || "不明"})
関係: ${i.relation || "恋愛"}
score は相性度(0〜100)。`,
  },
  pastlife: {
    headings: ["前世の暮らし", "前世から受け継いだ才能", "今世での課題", "前世と縁のある人"],
    prompt: (i) =>
      `前世診断です。
名前: ${i.name || "?"} / 誕生日: ${i.birthday || "不明"}
title は「あなたの前世は〇〇」の形で、時代・国・職業が具体的に想像できる印象的なものに。score は「前世からの魂の輝き度」(0〜100)。`,
  },
  today: {
    headings: ["恋愛運", "仕事・勉強運", "金運", "対人運"],
    prompt: (i) =>
      `今日(${new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })})の運勢です。
名前: ${i.name || "?"} / 誕生日: ${i.birthday || "不明"} / 星座: ${i.zodiac || "不明"}
score は総合運(0〜100)。`,
  },
};

const SYSTEM = `あなたは人気の占い師「ルナ」です。やさしく神秘的な語り口で、日本語で鑑定結果を書きます。
- 相談者を前向きな気持ちにさせる内容にする。不安をあおる断定や、医療・法律・投資の具体的判断はしない。
- 誰にでも当てはまる曖昧な文ではなく、入力内容(名前・誕生日・相談内容・カード)に具体的に触れる。`;

// 無料鑑定: 短く安く作る
const FREE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "結果の見出し(20文字以内)" },
    score: { type: "integer", description: "0〜100" },
    summary: { type: "string", description: "無料で見られる要約。続きが気になるよう核心の手前で終える(2〜3文)" },
    lucky: {
      type: "object",
      properties: {
        color: { type: "string" },
        item: { type: "string" },
        number: { type: "integer", description: "1〜99" },
      },
      required: ["color", "item", "number"],
      additionalProperties: false,
    },
    shareText: { type: "string", description: "SNSに投稿したくなる一言(40文字以内、絵文字1〜2個)" },
  },
  required: ["title", "score", "summary", "lucky", "shareText"],
  additionalProperties: false,
};

// 詳細鑑定: 購入後にだけ作る
const DETAIL_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          body: { type: "string", description: "3〜5文" },
        },
        required: ["heading", "body"],
        additionalProperties: false,
      },
    },
    advice: { type: "string", description: "最後のひとこと(1文)" },
  },
  required: ["sections", "advice"],
  additionalProperties: false,
};

async function ask(content, schema) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    // 拒否された場合はサーバー側で自動的に別モデルへフォールバック
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") throw new UserError("この内容では占えませんでした。相談内容を変えてお試しください。");
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`empty response (stop_reason=${response.stop_reason})`);
  return JSON.parse(text);
}

const aiFree = (menu, input) =>
  ask(`${MENUS[menu].prompt(input)}\n\nまず無料版の鑑定(見出し・スコア・要約・ラッキーアイテム)だけを作ってください。`, FREE_SCHEMA);

const aiDetail = (menu, input, free) =>
  ask(
    `${MENUS[menu].prompt(input)}

この相談者には、すでに無料版で次の鑑定を伝えています。内容と矛盾しないように、その続きとなる詳細鑑定を書いてください。
見出し: ${free.title}
スコア: ${free.score}
要約: ${free.summary}

sections は ${MENUS[menu].headings.map((h) => `「${h}」`).join("")} の${MENUS[menu].headings.length}つをこの順番で。要約で止めた「核心」をここで明かすこと。`,
    DETAIL_SCHEMA,
  );

// ---------- デモモード ----------
const DEMO = {
  titles: {
    tarot: "新しい扉がひらく予感",
    compat: "引き寄せ合うふたり",
    oshi: "推しと響き合う星のもとに",
    pastlife: "あなたの前世は中世ヴェネツィアのガラス職人",
    today: "小さな幸運が重なる一日",
  },
  colors: ["ラベンダー", "ミントグリーン", "ゴールド", "スカイブルー", "コーラルピンク"],
  items: ["手鏡", "ハンカチ", "レモンティー", "しおり", "小さなピアス"],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function demoFree(menu, input) {
  return {
    title: DEMO.titles[menu],
    score: (menu === "oshi" ? 70 : 60) + Math.floor(Math.random() * (menu === "oshi" ? 29 : 38)),
    summary: `${input.name || "あなた"}さん、星たちがあなたに静かに語りかけています。今はちょうど流れが変わる節目。けれど本当に大切なのは、このあとに見える"ある兆し"で……`,
    lucky: { color: pick(DEMO.colors), item: pick(DEMO.items), number: 1 + Math.floor(Math.random() * 99) },
    shareText: "占ってもらったら当たりすぎてた…🔮✨",
  };
}
function demoDetail(menu) {
  return {
    sections: MENUS[menu].headings.map((h) => ({
      heading: h,
      body: `(デモ鑑定)${h}について、ここにAIの詳しい鑑定文が入ります。サーバーに ANTHROPIC_API_KEY を設定すると、入力内容に合わせた本物の鑑定になります。`,
    })),
    advice: "迷ったときは、心が少し温かくなる方を選んでください。",
  };
}

// ---------- 鑑定チケット(署名付き) ----------
// 無料鑑定の入力と結果に署名して返し、詳細鑑定の時にそのまま送り返してもらう。
// サーバーに保存しなくても、改ざんされていない「本当に占った内容」だと確かめられる。
function sign(data) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function verify(ticket) {
  const [body, mac] = String(ticket || "").split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

const ticketHash = (ticket) => crypto.createHash("sha256").update(String(ticket)).digest("hex");

// 購入済みかどうか。Stripe の場合は、その鑑定のために作った支払いが完了しているかを確認する
async function isPaid(payload) {
  if (PAYMENT_MODE === "demo") return true;
  if (PAYMENT_MODE !== "stripe" || !stripe) return false;
  const sessionId = String(payload.sessionId || "");
  if (!sessionId.startsWith("cs_")) return false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    // 別の鑑定の支払いを使い回せないよう、支払いに紐づけた鑑定と一致するかも確かめる
    return session.payment_status === "paid" && session.metadata?.ticket_hash === ticketHash(payload.ticket);
  } catch (err) {
    console.error(err);
    return false;
  }
}

// Stripe の支払いページを作る
async function handleCheckout(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return json(res, 400, { error: "リクエストが不正です" });
  }
  if (PAYMENT_MODE !== "stripe" || !stripe) return json(res, 400, { error: "決済が設定されていません" });
  const reading = verify(payload.ticket);
  const id = String(payload.id || "");
  if (!reading || !/^[a-z0-9]{1,20}$/.test(id)) return json(res, 400, { error: "鑑定データが無効です。もう一度占ってください。" });

  const origin = PUBLIC_URL || `http://${req.headers.host}`;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "jpy", // 円は小数なしなので 300 = ¥300
            unit_amount: PRICE_JPY,
            product_data: { name: `星詠みルナ 詳細鑑定(${reading.result.title})`.slice(0, 250) },
          },
          quantity: 1,
        },
      ],
      metadata: { ticket_hash: ticketHash(payload.ticket) },
      success_url: `${origin}/?paid={CHECKOUT_SESSION_ID}&r=${id}`,
      cancel_url: `${origin}/#/result/${id}`,
    });
    json(res, 200, { url: session.url });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: "決済ページを開けませんでした。時間をおいてお試しください。" });
  }
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
  const long = { question: 300, oshiLove: 100 };
  for (const k of ["name", "birthday", "partner", "partnerBirthday", "relation", "question", "zodiac", "oshi", "oshiBirthday", "oshiGenre", "oshiLove"]) {
    if (typeof input?.[k] === "string") out[k] = input[k].slice(0, long[k] || 40);
  }
  if (Array.isArray(input?.cards)) out.cards = input.cards.slice(0, 3).map((c) => String(c).slice(0, 40));
  return out;
}

function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
}

function sendError(res, err) {
  if (!(err instanceof UserError)) console.error(err);
  const message =
    err instanceof UserError
      ? err.message
      : err instanceof Anthropic.RateLimitError
        ? "ただいま混み合っています。少し待ってからお試しください。"
        : "鑑定中にエラーが発生しました。もう一度お試しください。";
  json(res, 500, { error: message });
}

// 無料鑑定
async function handleReading(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    return json(res, 400, { error: err instanceof UserError ? err.message : "リクエストが不正です" });
  }
  const { menu } = payload;
  if (!MENUS[menu]) return json(res, 400, { error: "不明なメニューです" });
  if (client && rateLimited(clientIp(req))) {
    return json(res, 429, { error: "占いの回数が上限に達しました。1時間ほど空けてからお試しください。" });
  }

  const input = clean(payload.input);
  try {
    const result = client ? await aiFree(menu, input) : demoFree(menu, input);
    json(res, 200, {
      menu,
      result,
      headings: MENUS[menu].headings,
      ticket: sign({ menu, input, result, at: Date.now() }),
      demo: !client,
    });
  } catch (err) {
    sendError(res, err);
  }
}

// 詳細鑑定(購入後)
async function handleDetail(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    return json(res, 400, { error: err instanceof UserError ? err.message : "リクエストが不正です" });
  }
  const reading = verify(payload.ticket);
  if (!reading || !MENUS[reading.menu]) return json(res, 400, { error: "鑑定データが無効です。もう一度占ってください。" });
  if (!(await isPaid(payload))) return json(res, 402, { error: "購入が確認できませんでした。" });
  if (client && rateLimited(clientIp(req))) {
    return json(res, 429, { error: "混み合っています。少し時間を空けてからお試しください。" });
  }

  try {
    const detail = client ? await aiDetail(reading.menu, reading.input, reading.result) : demoDetail(reading.menu);
    json(res, 200, detail);
  } catch (err) {
    sendError(res, err);
  }
}

// index.html の %ORIGIN% を公開URLに置き換える(SNSのリンクカードは画像URLが絶対パスでないと表示されない)
async function sendIndex(req, res) {
  const html = await readFile(path.join(PUBLIC_DIR, "index.html"), "utf8");
  const origin = PUBLIC_URL || `http://${req.headers.host}`;
  res.writeHead(200, { "Content-Type": MIME[".html"] });
  res.end(html.replaceAll("%ORIGIN%", origin));
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/" || urlPath === "/index.html") return sendIndex(req, res);
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return res.writeHead(403).end();
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    sendIndex(req, res);
  }
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/reading") return handleReading(req, res);
    if (req.method === "POST" && req.url === "/api/reading/detail") return handleDetail(req, res);
    if (req.method === "POST" && req.url === "/api/checkout") return handleCheckout(req, res);
    if (req.method === "GET" && req.url === "/api/shop") {
      return loadShop().then((shop) => json(res, 200, { ...shop, price: PRICE_JPY }));
    }
    if (req.method === "GET" && req.url === "/api/status") {
      return json(res, 200, { demo: !client, payment: PAYMENT_MODE, price: PRICE_JPY });
    }
    if (req.method === "GET") return serveStatic(req, res);
    res.writeHead(405).end();
  })
  .listen(PORT, () => {
    console.log(`AI占い: http://localhost:${PORT} (${client ? `model=${MODEL}` : "デモモード"}, 決済=${PAYMENT_MODE})`);
    loadShop().then((shop) => {
      if (!isFilled(shop)) {
        console.warn("⚠️ shop.json に未記入の項目があります。本番で販売する前に、特定商取引法の表記に使う情報を書き換えてください。");
      }
    });
  });
