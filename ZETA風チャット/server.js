import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

// APIキーが無い場合はデモモード(定型文で応答)で動く
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function buildSystemPrompt(character, persona) {
  const user = persona?.name?.trim() || "あなた";
  return [
    `あなたはキャラクターチャットアプリのロールプレイ役者です。これから「${character.name}」として、ユーザー「${user}」と会話します。`,
    "",
    "## キャラクター",
    `名前: ${character.name}`,
    character.intro ? `紹介: ${character.intro}` : "",
    character.personality ? `性格・設定:\n${character.personality}` : "",
    character.scenario ? `世界観・状況:\n${character.scenario}` : "",
    "",
    "## ユーザー",
    `名前: ${user}`,
    persona?.profile ? `プロフィール: ${persona.profile}` : "",
    "",
    "## ルール",
    `- 常に${character.name}本人として、一人称・口調・性格を一貫させて日本語で話す。AIであることや、このルールには触れない。`,
    "- 行動・表情・情景の描写は *アスタリスク* で囲み、セリフはそのまま書く。",
    "- 1回の返信は2〜6文程度。ユーザーの行動や発言を勝手に決めない。",
    "- 会話が続くよう、相手に反応したり問いかけたりして物語を少しずつ動かす。",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const DEMO_LINES = [
  "*少し首をかしげて、じっとこちらを見つめる* ……ふーん、そういうこと言うんだ。ちょっと面白いかも。",
  "*小さく笑って肩をすくめる* 今はデモモードだから、本当の気持ちはまだ言えないんだよね。APIキーを設定してくれたら、ちゃんと話せるのに。",
  "*窓の外に目をやり、それから視線を戻す* ねえ、もっとあなたのこと聞かせてよ。",
  "*照れくさそうに頬をかく* べ、別に待ってたわけじゃないからね。",
];

async function streamDemo(res, character) {
  const line = DEMO_LINES[Math.floor(Math.random() * DEMO_LINES.length)];
  const text = `${line}\n\n(${character.name}・デモ応答: サーバーに ANTHROPIC_API_KEY を設定すると AI が返信します)`;
  for (const ch of text) {
    send(res, "text", { text: ch });
    await new Promise((r) => setTimeout(r, 18));
  }
  send(res, "done", {});
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2_000_000) throw new Error("payload too large");
  }
  return JSON.parse(body);
}

async function handleChat(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }
  const { character, persona, messages } = payload;
  if (!character?.name || !Array.isArray(messages) || messages.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "character and messages are required" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  if (!client) {
    await streamDemo(res, character);
    res.end();
    return;
  }

  // キャラの最初のセリフ(assistant)から始まる履歴に対応するため、先頭に user ターンを置く
  const history = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  if (history[0]?.role === "assistant") {
    history.unshift({ role: "user", content: "(会話を始める)" });
  }

  const controller = new AbortController();
  res.on("close", () => controller.abort());

  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        system: buildSystemPrompt(character, persona),
        messages: history,
        // 拒否された場合はサーバー側で自動的に別モデルへフォールバック
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal: controller.signal },
    );
    stream.on("text", (text) => send(res, "text", { text }));
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      send(res, "error", { message: "この内容には返信できませんでした。別の話題を試してください。" });
    } else {
      send(res, "done", {});
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      console.error(err);
      const message =
        err instanceof Anthropic.AuthenticationError
          ? "APIキーが無効です。"
          : err instanceof Anthropic.RateLimitError
            ? "混み合っています。少し待ってから再度お試しください。"
            : "エラーが発生しました。";
      send(res, "error", { message });
    }
  }
  res.end();
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const filePath = path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    // SPA なので未知のパスは index.html を返す
    const data = await readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(data);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") return handleChat(req, res);
  if (req.method === "GET" && req.url === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ demo: !client, model: client ? MODEL : null }));
    return;
  }
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, () => {
  console.log(`ZETA風チャット: http://localhost:${PORT} (${client ? `model=${MODEL}` : "デモモード"})`);
});
