// ココロタイプ — 16タイプ性格診断(フロントエンド、依存なし)
import { AXES, QUESTIONS, SCALE, TYPES } from "/data.js";

// 価格と決済方式はサーバーの設定(/api/status)に合わせる
const pay = { price: 300, mode: "demo" };
const HEADINGS = ["恋愛の傾向", "向いている仕事・学び方", "人間関係のコツ", "まだ気づいていない才能", "相性のいいタイプとの付き合い方"];

// ---------- ストレージ ----------
const KEY = "kokoro:v1";
const store = (() => {
  try {
    return { name: "", history: [], ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { name: "", history: [] };
  }
})();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {}
}

// ---------- ユーティリティ ----------
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}
const topbar = (title, back = "#/") =>
  `<div class="topbar"><button class="back" onclick="location.hash='${back}'" aria-label="戻る">‹</button><span class="t">${esc(title)}</span></div>`;
const isCode = (c) => typeof c === "string" && Object.hasOwn(TYPES, c);

// ふたりのタイプの相性(%)。いちばん相性のいい組み合わせは98%、それ以外は共通する軸の数で決める
function compatOf(a, b) {
  if (TYPES[a].best === b) return 98;
  const same = [...a].filter((ch, i) => ch === b[i]).length;
  return [62, 70, 78, 86, 92][same];
}

// ---------- ルーティング ----------
function route() {
  const [p, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [name, arg] = p.split("/");
  window.scrollTo(0, 0);
  if (name === "quiz") return renderQuiz();
  if (name === "result") return renderResult(arg);
  if (name === "type" && isCode(arg)) return renderType(arg);
  if (name === "legal") return renderLegal(arg);
  renderHome(new URLSearchParams(query));
}
window.addEventListener("hashchange", route);

// ---------- ホーム ----------
// 友達からの招待(#/?from=タイプ&n=名前)は、診断が終わるまで覚えておく
let invite = null;

function renderHome(params = new URLSearchParams()) {
  if (isCode(params.get("from"))) invite = { code: params.get("from"), name: (params.get("n") || "友達").slice(0, 20) };
  const last = store.history[0];
  app.innerHTML = `
    <div class="hero">
      <div class="emojis">🦁🦊🐱🦉</div>
      <h1>ココロタイプ</h1>
      <p class="sub">16タイプ性格診断</p>
      <p>16の質問に答えるだけで、<br>あなたの本当の性格がわかります。</p>
    </div>
    <div class="chips"><span class="chip">⏱ 約2分</span><span class="chip">📝 全16問</span><span class="chip">🆓 無料で診断</span></div>
    ${
      invite
        ? `<div class="panel invite">💌 <b>${esc(invite.name)}さん</b>(${TYPES[invite.code].ico} ${esc(TYPES[invite.code].name)})が<br>あなたとの相性を知りたがっています！<br>診断すると、ふたりの相性がわかります</div>`
        : ""
    }
    <div class="panel start">
      <div class="field"><label for="name">ニックネーム(任意)</label><input id="name" maxlength="20" placeholder="例：ゆう" value="${esc(store.name)}"></div>
      <button class="btn main" id="start">診断をはじめる</button>
    </div>
    ${
      last
        ? `<div class="section-title">前回の結果</div>
           <div class="panel last" data-id="${last.id}"><span class="e">${TYPES[last.code].ico}</span>
           <div><b>${esc(TYPES[last.code].name)}</b><br><span class="muted" style="font-size:12px">${new Date(last.at).toLocaleDateString("ja-JP")} の診断</span></div></div>`
        : ""
    }
    ${installCard()}
    <div class="section-title">16のタイプ</div>
    <div class="types">${Object.entries(TYPES)
      .map(([c, t]) => `<button class="tcell" data-c="${c}"><span class="e">${t.ico}</span>${esc(t.name)}</button>`)
      .join("")}</div>
    <div class="footer">この診断は、自分を知るきっかけとして楽しむエンターテインメントです。${LEGAL_LINKS}</div>`;

  $("#start").onclick = () => {
    store.name = $("#name").value.trim();
    save();
    location.hash = "#/quiz";
  };
  $(".last")?.addEventListener("click", (e) => (location.hash = `#/result/${e.currentTarget.dataset.id}`));
  app.querySelectorAll(".tcell").forEach((b) => (b.onclick = () => (location.hash = `#/type/${b.dataset.c}`)));
  bindInstallCard();
}

// ---------- 質問 ----------
let answers = [];

function renderQuiz() {
  if (answers.length >= QUESTIONS.length) answers = [];
  const i = answers.length;
  const q = QUESTIONS[i];
  const sizes = [52, 42, 32, 42, 52];
  const colors = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#f9a8d4", "#ec4899"];
  app.innerHTML = `${topbar("性格診断")}
    <div class="progress"><div style="width:${(i / QUESTIONS.length) * 100}%"></div></div>
    <div class="qnum">${i + 1} / ${QUESTIONS.length}</div>
    <div class="panel q-anim">
      <div class="question">${esc(q.t)}</div>
      <div class="scale">${SCALE.map(
        (label, v) =>
          `<button data-v="${v + 1}" aria-label="${label}" style="width:${sizes[v]}px;height:${sizes[v]}px;color:${colors[v]}"></button>`,
      ).join("")}</div>
      <div class="scale-labels"><span style="color:#8b5cf6">ちがう</span><span style="color:#ec4899">そう思う</span></div>
    </div>
    ${i > 0 ? `<div style="margin-top:14px"><button class="btn" id="prev">← ひとつ前の質問へ</button></div>` : ""}`;

  app.querySelectorAll(".scale button").forEach(
    (b) =>
      (b.onclick = () => {
        b.classList.add("on");
        answers.push(Number(b.dataset.v));
        setTimeout(() => (answers.length === QUESTIONS.length ? submit() : renderQuiz()), 180);
      }),
  );
  $("#prev")?.addEventListener("click", () => {
    answers.pop();
    renderQuiz();
  });
}

async function submit() {
  app.innerHTML = `<div class="loading"><span class="spin">🔮</span><p>あなたのタイプを分析中…</p></div>`;
  try {
    const [res] = await Promise.all([
      fetch("/api/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: store.name, answers }),
      }),
      new Promise((r) => setTimeout(r, 1200)), // 分析している感を出す
    ]);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "エラーが発生しました");
    const entry = {
      id: Date.now().toString(36),
      name: store.name,
      code: data.code,
      percents: data.percents,
      ticket: data.ticket, // パーソナルレポートを買うときにサーバーへ送り返す
      friend: invite,
      unlocked: false,
      at: Date.now(),
    };
    invite = null;
    answers = [];
    store.history.unshift(entry);
    store.history = store.history.slice(0, 20);
    save();
    location.hash = `#/result/${entry.id}`;
  } catch (err) {
    app.innerHTML = `${topbar("性格診断")}<div class="panel"><p class="error">${esc(err.message)}</p><button class="btn main" id="retry">もう一度送る</button></div>`;
    $("#retry").onclick = submit;
  }
}

// ---------- 結果 ----------
function axisBars(percents) {
  return AXES.map((a, i) => {
    const p = percents[i];
    const [l, r] = a.poles;
    return `<div class="axis">
      <div class="names"><span>${l.ico} ${l.name} ${p}%</span><span>${100 - p}% ${r.name} ${r.ico}</span></div>
      <div class="bar"><div style="width:0" data-w="${p}%"></div></div>
      <div class="desc"><span>${l.desc}</span><span style="text-align:right">${r.desc}</span></div></div>`;
  }).join("");
}

function renderResult(id) {
  const h = store.history.find((x) => x.id === id);
  if (!h) return renderHome();
  const t = TYPES[h.code];
  const best = TYPES[t.best];

  app.innerHTML = `${topbar("診断結果")}
    <div class="panel type-card" style="background:linear-gradient(150deg, ${t.color}, #7c3aed)">
      <div class="you">${esc(h.name || "あなた")}のタイプは…</div>
      <div class="e">${t.ico}</div>
      <h2>${esc(t.name)}</h2>
      <div class="code">${h.code}</div>
      <div class="catch">${esc(t.catch)}</div>
      <div class="traits">${t.traits.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
    </div>
    ${
      h.friend
        ? `<div class="section-title">${esc(h.friend.name)}さんとの相性</div>
          <div class="panel compat"><div class="pair">${t.ico} × ${TYPES[h.friend.code].ico}</div>
          <div class="pct">${compatOf(h.code, h.friend.code)}%</div>
          <div class="muted" style="font-size:13px">${esc(t.name)} × ${esc(TYPES[h.friend.code].name)}</div></div>`
        : ""
    }
    <div class="section-title">あなたの4つの傾向</div>
    <div class="panel">${axisBars(h.percents)}</div>
    <div class="section-title">相性のいいタイプ</div>
    <div class="panel match" onclick="location.hash='#/type/${t.best}'"><span class="e">${best.ico}</span>
      <div><b>${esc(best.name)}</b><br><span class="muted" style="font-size:13px">${esc(best.catch)}</span></div></div>
    <div class="section-title">パーソナルレポート</div>
    <div class="panel report ${h.unlocked ? "" : "locked"}">
      <div class="report-body">${
        h.unlocked
          ? h.report.sections.map((s) => `<h3>${esc(s.heading)}</h3><p>${esc(s.body)}</p>`).join("")
          : HEADINGS.map((x) => `<h3>${x}</h3><p>${TEASER}</p>`).join("")
      }</div>
      ${
        h.unlocked
          ? ""
          : `<div class="lock-cover">
              <div>🔒 <b>あなたの回答だけをもとに</b>AIが書く<br>世界にひとつのレポート</div>
              <div class="muted" style="font-size:12px">${HEADINGS.join("・")}</div>
              <div><b style="font-size:18px">¥${pay.price}</b></div>
              <button class="btn main" id="unlock">レポートを読む</button>
            </div>`
      }
    </div>
    ${h.unlocked ? `<p class="advice">「${esc(h.report.advice)}」</p>` : ""}
    <div class="section-title" style="text-align:center">結果をシェア</div>
    <div class="share"><button class="btn x" id="x">𝕏 でポスト</button><button class="btn" id="img">画像を保存</button></div>
    <button class="btn friend" id="friend">💌 友達と相性をくらべる</button>
    <div style="margin-top:8px"><button class="btn" onclick="location.hash='#/'">トップへ戻る</button></div>
    <div class="footer">${LEGAL_LINKS}</div>`;

  requestAnimationFrame(() => app.querySelectorAll(".bar div").forEach((d) => (d.style.width = d.dataset.w)));
  $("#unlock")?.addEventListener("click", () => openPaywall(h));
  $("#x").onclick = () => {
    const text = `私は【${t.name}】タイプでした${t.ico}\n「${t.catch}」\n#ココロタイプ #性格診断`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.origin)}`, "_blank");
  };
  $("#img").onclick = () => shareImage(h);
  $("#friend").onclick = () => sendInvite(h);
}

// ---------- タイプ紹介 ----------
function renderType(code) {
  const t = TYPES[code];
  const letters = [...code].map((c, i) => AXES[i].poles.find((p) => p.c === c));
  app.innerHTML = `${topbar(t.name)}
    <div class="panel type-card" style="background:linear-gradient(150deg, ${t.color}, #7c3aed)">
      <div class="e">${t.ico}</div><h2>${esc(t.name)}</h2><div class="code">${code}</div>
      <div class="catch">${esc(t.catch)}</div>
      <div class="traits">${t.traits.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
    </div>
    <div class="section-title">このタイプの傾向</div>
    <div class="panel">${letters.map((p) => `<p style="margin:0 0 8px">${p.ico} <b>${p.name}</b>:${p.desc}</p>`).join("")}</div>
    <div class="section-title">相性のいいタイプ</div>
    <div class="panel match" onclick="location.hash='#/type/${t.best}'"><span class="e">${TYPES[t.best].ico}</span>
      <div><b>${esc(TYPES[t.best].name)}</b><br><span class="muted" style="font-size:13px">${esc(TYPES[t.best].catch)}</span></div></div>
    <div style="margin-top:20px"><button class="btn main" onclick="location.hash='#/quiz'">自分のタイプを診断する</button></div>`;
}

// ---------- 友達招待 ----------
async function sendInvite(h) {
  const q = new URLSearchParams({ from: h.code });
  if (h.name) q.set("n", h.name);
  const url = `${location.origin}/#/?${q}`;
  const text = `${h.name || "友達"}さんが、あなたとの相性を知りたがっています💌 性格診断してみて！`;
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast("リンクをコピーしました。LINEなどで送ってください");
  } catch {
    prompt("このリンクを送ってください", url);
  }
}

// ---------- 購入 ----------
const TEASER = "ここには、あなたの16の回答からAIが読み取った、あなただけの分析が書かれています。自分では気づいていない一面が見つかるかもしれません。";

async function fetchReport(h) {
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket: h.ticket, sessionId: h.sessionId }),
  });
  const data = await res.json();
  if (res.status === 402) {
    delete h.sessionId; // 支払いが確認できないので、もう一度購入できる状態に戻す
    save();
  }
  if (!res.ok) throw new Error(data.error || "エラーが発生しました");
  h.report = data;
}

async function unlock(h) {
  await fetchReport(h);
  h.unlocked = true;
  save();
  toast("レポートをひらきました");
  renderResult(h.id);
}

async function goCheckout(h) {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket: h.ticket, id: h.id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "決済ページを開けませんでした");
  location.href = data.url;
}

function openPaywall(h) {
  // 支払い済みなのにレポートの作成だけ失敗していた場合は、支払わずにやり直せる
  const paid = pay.mode === "demo" || h.sessionId;
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal panel">
      <h3>📖 パーソナルレポート ¥${pay.price}</h3>
      <p>${HEADINGS.join("・")}<br>を、あなたの回答をもとにAIが分析します。</p>
      <p class="error" id="payErr"></p>
      ${pay.mode === "demo" ? `<p style="font-size:11px">※ 現在はデモ版のため、決済なしで表示されます。</p>` : ""}
      <button class="btn main" id="pay">${h.sessionId ? "購入済み・レポートを表示する" : pay.mode === "demo" ? "購入して読む(デモ)" : "購入して読む"}</button>
      ${pay.mode === "stripe" && !h.sessionId ? `<p style="font-size:11px">クレジットカード・Apple Pay・Google Pay が使えます(Stripe の安全な決済ページに移動します)</p>` : ""}
      <p style="font-size:11px">購入前に<a href="#/legal/tokushoho" class="link">特定商取引法に基づく表記</a>と<a href="#/legal/terms" class="link">利用規約</a>をご確認ください。デジタル商品のため、購入後の返品・キャンセルはできません。</p>
      <button class="btn" id="cancel">閉じる</button>
    </div>`;
  document.body.appendChild(bg);
  bg.onclick = async (e) => {
    if (e.target === bg || e.target.id === "cancel" || e.target.classList.contains("link")) return bg.remove();
    if (e.target.id !== "pay") return;
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = paid ? "AIがレポートを書いています…" : "決済ページに移動しています…";
    try {
      if (!paid) return await goCheckout(h);
      await unlock(h);
      bg.remove();
    } catch (err) {
      $("#payErr").textContent = err.message;
      btn.disabled = false;
      btn.textContent = "もう一度試す";
    }
  };
}

// Stripe の支払いから戻ってきた時(/?paid=セッションID&r=結果ID)
async function handlePaidReturn() {
  const q = new URLSearchParams(location.search);
  const sessionId = q.get("paid");
  if (!sessionId) return false;
  const h = store.history.find((x) => x.id === q.get("r"));
  history.replaceState(null, "", `/#/result/${h?.id || ""}`);
  if (!h) return false;
  h.sessionId = sessionId; // レポートの作成に失敗してもやり直せるよう先に保存
  save();
  app.innerHTML = `<div class="loading"><span class="spin">📖</span><p>ご購入ありがとうございます。<br>AIがレポートを書いています…</p></div>`;
  try {
    await unlock(h);
  } catch (err) {
    renderResult(h.id);
    toast(err.message);
  }
  return true;
}

// ---------- ホーム画面に追加 ----------
let installEvent = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  if (!location.hash || location.hash.startsWith("#/?") || location.hash === "#/") route();
});
window.addEventListener("appinstalled", () => {
  store.installHidden = true;
  save();
  toast("ホーム画面に追加しました");
});

function installCard() {
  if (isStandalone() || store.installHidden || (!installEvent && !isIOS())) return "";
  return `<div class="panel install">
    <button class="close" id="installClose" aria-label="閉じる">×</button>
    <b>📲 ホーム画面に追加</b><br><span class="muted">友達の結果とくらべたい時に、すぐ開けます</span>
    ${
      installEvent
        ? `<button class="btn main" id="installBtn">ホーム画面に追加する</button>`
        : `<div class="ios-steps">Safari の <b>共有ボタン</b>(□に↑)→「<b>ホーム画面に追加</b>」をタップ</div>`
    }</div>`;
}
function bindInstallCard() {
  $("#installBtn")?.addEventListener("click", async () => {
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    route();
  });
  $("#installClose")?.addEventListener("click", () => {
    store.installHidden = true;
    save();
    route();
  });
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

// ---------- 特定商取引法の表記・プライバシーポリシー・利用規約 ----------
const LEGAL_LINKS = `<div class="legal-links">
  <a href="#/legal/tokushoho">特定商取引法に基づく表記</a>
  <a href="#/legal/privacy">プライバシーポリシー</a>
  <a href="#/legal/terms">利用規約</a></div>`;

let shopCache;
const loadShop = () => (shopCache ??= fetch("/api/shop").then((r) => r.json()).catch(() => ({})));
// 「【】」が残っている項目は未記入として目立たせる
const v = (text) => {
  const s = esc(text ?? "【未設定】");
  return s.includes("【") ? `<span class="unset">${s}</span>` : s;
};

const LEGAL = {
  tokushoho: {
    title: "特定商取引法に基づく表記",
    body: (s) => `<table class="legal-table">
      <tr><th>販売事業者</th><td>${v(s.sellerName)}</td></tr>
      <tr><th>運営統括責任者</th><td>${v(s.representative)}</td></tr>
      <tr><th>所在地</th><td>${v(s.address)}</td></tr>
      <tr><th>電話番号</th><td>${v(s.phone)}</td></tr>
      <tr><th>メールアドレス</th><td>${v(s.email)}</td></tr>
      <tr><th>販売URL</th><td>${v(s.url)}</td></tr>
      <tr><th>販売価格</th><td>パーソナルレポート 1回 ${esc(s.price ?? pay.price)}円(税込)</td></tr>
      <tr><th>商品代金以外の必要料金</th><td>インターネット接続にかかる通信料はお客様のご負担となります。</td></tr>
      <tr><th>支払方法</th><td>クレジットカード、Apple Pay、Google Pay(決済代行: Stripe)</td></tr>
      <tr><th>支払時期</th><td>ご購入手続きの完了時にお支払いが確定します。</td></tr>
      <tr><th>商品の引渡時期</th><td>決済完了後、ただちに画面上でレポートを表示します。</td></tr>
      <tr><th>返品・キャンセル</th><td>デジタルコンテンツの性質上、購入後の返品・キャンセルはお受けできません。ただし、システムの不具合によりレポートが表示されない場合は、再表示または返金にて対応いたします。</td></tr>
      <tr><th>動作環境</th><td>最新版の Chrome・Safari・Edge などのブラウザ(JavaScript とローカルストレージが有効であること)</td></tr>
    </table>`,
  },
  privacy: {
    title: "プライバシーポリシー",
    body: (s) => `
      <p>${v(s.sellerName)}(以下「当方」)は、${esc(s.serviceName || "本サービス")}(以下「本サービス」)における利用者の情報を、以下のとおり取り扱います。</p>
      <h3>1. 取得する情報</h3>
      <ul><li>診断のために入力された情報(ニックネーム、質問への回答)</li>
      <li>アクセス時のIPアドレス(短時間の利用回数の制限のため)</li>
      <li>決済に関する情報(決済の完了状況など。カード番号は決済代行会社 Stripe が取り扱い、当方は受け取りません)</li></ul>
      <h3>2. 利用目的</h3>
      <ul><li>診断結果とパーソナルレポートの作成・表示</li><li>購入の確認</li><li>不正利用の防止、お問い合わせへの対応</li></ul>
      <h3>3. 外部サービスへの提供</h3>
      <p>パーソナルレポートの作成のため、ニックネームと回答を AI サービス提供事業者(Anthropic, PBC)に送信します。決済は Stripe, Inc. が行います。これら以外の第三者に、法令に基づく場合を除き個人情報を提供することはありません。</p>
      <h3>4. 保存について</h3>
      <p>回答と診断結果は、利用者のブラウザ内(ローカルストレージ)に保存されます。当方のサーバーには保存しません。IPアドレスは利用回数の制限のため一時的にのみ保持します。</p>
      <h3>5. お問い合わせ</h3>
      <p>個人情報の取り扱いに関するお問い合わせは ${v(s.email)} までご連絡ください。</p>
      <p class="muted">制定日: ${v(s.effectiveDate)}</p>`,
  },
  terms: {
    title: "利用規約",
    body: (s) => `
      <p>この規約は、${v(s.sellerName)}(以下「当方」)が提供する${esc(s.serviceName || "本サービス")}(以下「本サービス」)の利用条件を定めるものです。本サービスを利用した時点で、この規約に同意したものとみなします。</p>
      <h3>第1条(本サービスの内容)</h3>
      <p>本サービスは、質問への回答から性格の傾向を示すエンターテインメントです。心理検査や医学的な診断ではなく、結果の正確性を保証するものではありません。進路・就職・健康などの重要な判断は、ご自身の責任で行ってください。</p>
      <h3>第2条(有料サービス)</h3>
      <p>パーソナルレポートは有料です。価格・支払方法等は「特定商取引法に基づく表記」のとおりです。未成年の方は、保護者の同意を得たうえでご購入ください。</p>
      <h3>第3条(返品・返金)</h3>
      <p>デジタルコンテンツの性質上、購入後の返品・返金はできません。ただし、当方の不具合によりレポートが表示されない場合はこの限りではありません。</p>
      <h3>第4条(禁止事項)</h3>
      <ul><li>他人になりすます行為</li><li>本サービスへの過度な負荷、不正アクセス、決済の不正利用</li>
      <li>診断結果を用いて他人を誹謗中傷・差別する行為</li><li>その他、法令または公序良俗に反する行為</li></ul>
      <h3>第5条(免責)</h3>
      <p>当方は、本サービスの利用により生じた損害について、当方の故意または重大な過失による場合を除き、責任を負いません。本サービスは予告なく内容の変更・停止をすることがあります。</p>
      <h3>第6条(規約の変更)</h3>
      <p>当方は必要に応じて本規約を変更できるものとし、変更後の規約は本ページに掲載した時点で効力を生じます。</p>
      <p class="muted">制定日: ${v(s.effectiveDate)}</p>`,
  },
};

async function renderLegal(kind) {
  const page = LEGAL[kind];
  if (!page) return renderHome();
  app.innerHTML = `${topbar(page.title)}<div class="panel legal"><p class="muted">読み込み中…</p></div>`;
  const shop = await loadShop();
  if (location.hash !== `#/legal/${kind}`) return;
  $(".legal").innerHTML = page.body(shop);
}

// ---------- シェア画像 ----------
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

async function shareImage(h) {
  const t = TYPES[h.code];
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  await document.fonts?.ready;
  const font = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, t.color);
  g.addColorStop(1, "#7c3aed");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.roundRect(60, 60, W - 120, H - 120, 48);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "#7c7396";
  ctx.font = `800 36px ${font}`;
  ctx.fillText(`${h.name || "わたし"}のタイプは…`, W / 2, 170);
  ctx.font = `200px ${font}`;
  ctx.fillText(t.ico, W / 2, 400);
  ctx.fillStyle = "#2b2340";
  ctx.font = `800 80px ${font}`;
  ctx.fillText(t.name, W / 2, 520);
  ctx.fillStyle = "#7c7396";
  ctx.font = `800 30px ${font}`;
  ctx.fillText(h.code.split("").join(" "), W / 2, 570);
  ctx.fillStyle = "#2b2340";
  ctx.font = `36px ${font}`;
  wrap(ctx, `「${t.catch}」`, W - 240).forEach((l, i) => ctx.fillText(l, W / 2, 650 + i * 54));

  // 4つの軸
  AXES.forEach((a, i) => {
    const y = 800 + i * 90;
    const p = h.percents[i];
    ctx.font = `800 28px ${font}`;
    ctx.textAlign = "left";
    ctx.fillStyle = "#2b2340";
    ctx.fillText(`${a.poles[0].ico} ${a.poles[0].name} ${p}%`, 150, y);
    ctx.textAlign = "right";
    ctx.fillText(`${100 - p}% ${a.poles[1].name} ${a.poles[1].ico}`, W - 150, y);
    ctx.fillStyle = "#e7defa";
    ctx.beginPath();
    ctx.roundRect(150, y + 16, W - 300, 20, 10);
    ctx.fill();
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.roundRect(150, y + 16, Math.max(20, (W - 300) * (p / 100)), 20, 10);
    ctx.fill();
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#7c3aed";
  ctx.font = `800 40px ${font}`;
  ctx.fillText("ココロタイプ | 16タイプ性格診断", W / 2, 1230);

  const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
  const file = new File([blob], "kokoro-type.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `私は【${t.name}】タイプでした${t.ico} #ココロタイプ` });
      return;
    } catch {}
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kokoro-type.png";
  a.click();
  toast("画像を保存しました");
}

// ---------- 起動 ----------
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => Object.assign(pay, { price: s.price ?? pay.price, mode: s.payment ?? pay.mode }))
  .catch(() => {})
  .finally(async () => {
    if (!(await handlePaidReturn())) route();
  });
