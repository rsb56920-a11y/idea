import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import Stripe from "stripe";
import { AXES, QUESTIONS, SCALE, TYPES, judge, validAnswers } from "./public/data.js";

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
// 1IPあたり1時間にAIレポートを作れる回数(API料金の使いすぎ防止)
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR) || 20;
// 診断結果に付ける署名の鍵。本番では固定値を環境変数で渡す
const SECRET = process.env.READING_SECRET || crypto.randomBytes(32).toString("hex");
// 決済: STRIPE_SECRET_KEY があれば Stripe、無ければデモ(購入ボタンを押すだけで開く)
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const PAYMENT_MODE = process.env.PAYMENT_MODE || (stripe ? "stripe" : "demo");
const PRICE_JPY = Number(process.env.PRICE_JPY) || 300;
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, "");
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(APP_DIR, "public");

// APIキーが無い場合はデモモード(定型文)で動く。無料の診断はAIを使わないので常に動く
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

const REPORT_HEADINGS = ["恋愛の傾向", "向いている仕事・学び方", "人間関係のコツ", "まだ気づいていない才能", "相性のいいタイプとの付き合い方"];

// ---------- お店の情報(特定商取引法の表記など) ----------
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

// ---------- AIレポート ----------
const SYSTEM = `あなたは性格分析が得意な心理カウンセラー「ココロ先生」です。やさしく前向きな語り口で、日本語でパーソナルレポートを書きます。
- タイプの一般論だけでなく、相談者の回答の特徴(どの質問に強く同意・反対したか)に具体的に触れて「私のことだ」と感じられる内容にする。
- 短所は「伸びしろ」として前向きに伝える。診断名・病名のような医学的な断定はしない。
- 性格診断は娯楽であり、科学的に確定したものではないという前提で書く。`;

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: { heading: { type: "string" }, body: { type: "string", description: "4〜6文" } },
        required: ["heading", "body"],
        additionalProperties: false,
      },
    },
    advice: { type: "string", description: "最後のひとこと(1文)" },
  },
  required: ["sections", "advice"],
  additionalProperties: false,
};

function reportPrompt({ name, answers, code, percents }) {
  const t = TYPES[code];
  const axes = AXES.map((a, i) => `${a.poles[0].name} ${percents[i]}% / ${a.poles[1].name} ${100 - percents[i]}%`).join("、");
  const lines = QUESTIONS.map((q, i) => `- ${q.t} → ${SCALE[answers[i] - 1]}`).join("\n");
  return `相談者: ${name || "あなた"}
タイプ: ${t.name}(${code}) — ${t.catch}
軸の割合: ${axes}
相性のいいタイプ: ${TYPES[t.best].name}
回答:
${lines}

この人のためのパーソナルレポートを書いてください。
sections は ${REPORT_HEADINGS.map((h) => `「${h}」`).join("")} の${REPORT_HEADINGS.length}つをこの順番で。`;
}

async function aiReport(data) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: reportPrompt(data) }],
    output_config: { effort: "low", format: { type: "json_schema", schema: REPORT_SCHEMA } },
    // 拒否された場合はサーバー側で自動的に別モデルへフォールバック
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") throw new UserError("レポートを作成できませんでした。");
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`empty response (stop_reason=${response.stop_reason})`);
  return JSON.parse(text);
}

function demoReport({ code }) {
  return {
    sections: REPORT_HEADINGS.map((h) => ({
      heading: h,
      body: `(デモレポート)「${TYPES[code].name}」のあなたの${h}について、ここにAIが回答内容をもとにした詳しい分析を書きます。サーバーに ANTHROPIC_API_KEY を設定すると本物のレポートになります。`,
    })),
    advice: "あなたらしさは、そのままで十分な魅力です。",
  };
}

// ---------- 診断チケット(署名付き) ----------
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

// 購入済みかどうか。Stripe の場合は、その診断のために作った支払いが完了しているかを確認する
async function isPaid(payload) {
  if (PAYMENT_MODE === "demo") return true;
  if (PAYMENT_MODE !== "stripe" || !stripe) return false;
  const sessionId = String(payload.sessionId || "");
  if (!sessionId.startsWith("cs_")) return false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session.payment_status === "paid" && session.metadata?.ticket_hash === ticketHash(payload.ticket);
  } catch (err) {
    console.error(err);
    return false;
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
const clientIp = (req) => req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;

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

async function withJson(req, res, fn) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    return json(res, 400, { error: err instanceof UserError ? err.message : "リクエストが不正です" });
  }
  try {
    await fn(payload);
  } catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    const message =
      err instanceof UserError
        ? err.message
        : err instanceof Anthropic.RateLimitError
          ? "ただいま混み合っています。少し待ってからお試しください。"
          : "エラーが発生しました。もう一度お試しください。";
    json(res, 500, { error: message });
  }
}

// 無料の診断結果(AIは使わない)
const handleResult = (req, res) =>
  withJson(req, res, async ({ name, answers }) => {
    if (!validAnswers(answers)) return json(res, 400, { error: "すべての質問に答えてください" });
    const cleanName = typeof name === "string" ? name.slice(0, 20) : "";
    const { code, percents } = judge(answers);
    json(res, 200, { code, percents, ticket: sign({ name: cleanName, answers, code, percents, at: Date.now() }) });
  });

// 有料のAIレポート(購入後)
const handleReport = (req, res) =>
  withJson(req, res, async (payload) => {
    const data = verify(payload.ticket);
    if (!data || !TYPES[data.code]) return json(res, 400, { error: "診断データが無効です。もう一度診断してください。" });
    if (!(await isPaid(payload))) return json(res, 402, { error: "購入が確認できませんでした。" });
    if (client && rateLimited(clientIp(req))) return json(res, 429, { error: "混み合っています。少し時間を空けてからお試しください。" });
    json(res, 200, client ? await aiReport(data) : demoReport(data));
  });

// Stripe の支払いページを作る
const handleCheckout = (req, res) =>
  withJson(req, res, async (payload) => {
    if (PAYMENT_MODE !== "stripe" || !stripe) return json(res, 400, { error: "決済が設定されていません" });
    const data = verify(payload.ticket);
    const id = String(payload.id || "");
    if (!data || !/^[a-z0-9]{1,20}$/.test(id)) return json(res, 400, { error: "診断データが無効です。もう一度診断してください。" });
    const origin = PUBLIC_URL || `http://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "jpy",
            unit_amount: PRICE_JPY,
            product_data: { name: `ココロタイプ パーソナルレポート(${TYPES[data.code].name})` },
          },
          quantity: 1,
        },
      ],
      metadata: { ticket_hash: ticketHash(payload.ticket) },
      success_url: `${origin}/?paid={CHECKOUT_SESSION_ID}&r=${id}`,
      cancel_url: `${origin}/#/result/${id}`,
    });
    json(res, 200, { url: session.url });
  });

// index.html の %ORIGIN% を公開URLに置き換える(SNSのリンクカード用)
async function sendIndex(req, res) {
  const html = await readFile(path.join(PUBLIC_DIR, "index.html"), "utf8");
  res.writeHead(200, { "Content-Type": MIME[".html"] });
  res.end(html.replaceAll("%ORIGIN%", PUBLIC_URL || `http://${req.headers.host}`));
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
    if (req.method === "POST" && req.url === "/api/result") return handleResult(req, res);
    if (req.method === "POST" && req.url === "/api/report") return handleReport(req, res);
    if (req.method === "POST" && req.url === "/api/checkout") return handleCheckout(req, res);
    if (req.method === "GET" && req.url === "/api/shop") return loadShop().then((shop) => json(res, 200, { ...shop, price: PRICE_JPY }));
    if (req.method === "GET" && req.url === "/api/status") return json(res, 200, { demo: !client, payment: PAYMENT_MODE, price: PRICE_JPY });
    if (req.method === "GET") return serveStatic(req, res);
    res.writeHead(405).end();
  })
  .listen(PORT, () => {
    console.log(`ココロタイプ: http://localhost:${PORT} (${client ? `model=${MODEL}` : "デモモード"}, 決済=${PAYMENT_MODE})`);
    loadShop().then((shop) => {
      if (!isFilled(shop)) console.warn("⚠️ shop.json に未記入の項目があります。本番で販売する前に書き換えてください。");
    });
  });
