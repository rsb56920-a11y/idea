// 星詠みルナ — AI占い・診断(フロントエンド、依存なし)

// 価格と決済方式はサーバーの設定(/api/status)に合わせる
const pay = { price: 300, mode: "demo" };

const MENUS = {
  today: { ico: "☀️", name: "今日の運勢", desc: "毎日かわる、あなただけの運勢" },
  tarot: { ico: "🃏", name: "タロット占い", desc: "3枚のカードが悩みに答えます" },
  compat: { ico: "💞", name: "相性診断", desc: "気になるあの人との相性は？" },
  pastlife: { ico: "🏛️", name: "前世診断", desc: "あなたの魂の記憶をたどる" },
};

// 大アルカナ22枚
const TAROT = [
  ["愚者", "🃏"], ["魔術師", "🪄"], ["女教皇", "📜"], ["女帝", "👑"], ["皇帝", "🏰"], ["教皇", "🔔"],
  ["恋人", "💕"], ["戦車", "🏇"], ["力", "🦁"], ["隠者", "🏮"], ["運命の輪", "🎡"], ["正義", "⚖️"],
  ["吊るされた男", "🙃"], ["死神", "🦋"], ["節制", "🏺"], ["悪魔", "⛓️"], ["塔", "⚡"], ["星", "⭐"],
  ["月", "🌙"], ["太陽", "☀️"], ["審判", "📯"], ["世界", "🌍"],
];

const ZODIAC = [
  ["山羊座", 1, 19], ["水瓶座", 2, 18], ["魚座", 3, 20], ["牡羊座", 4, 19], ["牡牛座", 5, 20], ["双子座", 6, 21],
  ["蟹座", 7, 22], ["獅子座", 8, 22], ["乙女座", 9, 22], ["天秤座", 10, 23], ["蠍座", 11, 22], ["射手座", 12, 21],
];
function zodiacOf(birthday) {
  if (!birthday) return "";
  const [, m, d] = birthday.split("-").map(Number);
  const i = ZODIAC.findIndex(([, mm, dd]) => m === mm && d <= dd);
  return i >= 0 ? ZODIAC[i][0] : ZODIAC[m % 12][0];
}

// ---------- ストレージ ----------
const KEY = "luna:v1";
const store = (() => {
  try {
    return { profile: {}, history: [], ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { profile: {}, history: [] };
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
const topbar = (title) =>
  `<div class="topbar"><button class="back" onclick="location.hash='#/'" aria-label="戻る">‹</button><span class="t">${esc(title)}</span></div>`;

// ---------- ルーティング ----------
function route() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [name, arg] = path.split("/");
  window.scrollTo(0, 0);
  if (name === "result") return renderResult(arg);
  if (name === "legal") return renderLegal(arg);
  if (MENUS[name]) return renderForm(name, new URLSearchParams(query));
  renderHome();
}
window.addEventListener("hashchange", route);

// ---------- ホーム ----------
function renderHome() {
  const entries = Object.entries(MENUS);
  app.innerHTML = `
    <div class="hero">
      <div class="moon">🌙</div>
      <h1>星詠みルナ</h1>
      <p>AI占い師ルナが、あなたの星を読み解きます。<br>すべてのメニューが無料で占えます。</p>
    </div>
    <div class="menus">
      ${entries
        .map(
          ([k, m], i) => `
        <button class="menu ${i === 0 ? "wide" : ""}" data-k="${k}">
          <span class="ico">${m.ico}</span>
          <span><span class="name">${m.name}</span> ${i === 0 ? `<span class="badge">毎日更新</span>` : ""}<br><span class="desc">${m.desc}</span></span>
        </button>`,
        )
        .join("")}
    </div>
    ${
      store.history.length
        ? `<div class="section-title">これまでの鑑定</div><div class="panel" style="padding:4px 0">${store.history
            .slice(0, 8)
            .map(
              (h) =>
                `<div class="history-item" data-id="${h.id}"><span>${MENUS[h.menu].ico} ${esc(h.result.title)}</span><span class="d">${new Date(h.at).toLocaleDateString("ja-JP")}</span></div>`,
            )
            .join("")}</div>`
        : ""
    }
    <div class="footer">占い結果はAIが生成したエンターテインメントです。<br>大切な判断はご自身の意思で行ってください。
      ${LEGAL_LINKS}</div>`;
  app.querySelectorAll(".menu").forEach((b) => (b.onclick = () => (location.hash = `#/${b.dataset.k}`)));
  app.querySelectorAll(".history-item").forEach((el) => (el.onclick = () => (location.hash = `#/result/${el.dataset.id}`)));
}

// ---------- 入力フォーム ----------
function field(id, label, type = "text", extra = "", value) {
  const v = value ?? store.profile[id] ?? "";
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(v)}" ${extra}></div>`;
}

function renderForm(menu, params = new URLSearchParams()) {
  // 相性診断の招待リンク(#/compat?from=名前&rel=関係)から来た場合。誕生日はリンクに載せない
  const inviter = menu === "compat" ? params.get("from")?.slice(0, 20) : null;
  const m = MENUS[menu];
  const intros = {
    today: "生年月日から星座を読み、今日一日の流れを占います。",
    tarot: "心に悩みを思い浮かべながら、直感で3枚のカードを選んでください。",
    compat: "ふたりの名前と誕生日から、魂の相性を読み解きます。",
    pastlife: "あなたの名前と誕生日に刻まれた、前世の記憶をたどります。",
  };
  const rel = params.get("rel");
  const fields = {
    today: field("name", "お名前(ニックネーム可)", "text", 'maxlength="20" required') + field("birthday", "生年月日", "date", "required"),
    tarot:
      field("name", "お名前(ニックネーム可)", "text", 'maxlength="20" required') +
      `<div class="field"><label for="question">占いたいこと</label><textarea id="question" maxlength="300" placeholder="例：今の仕事を続けるべき？ / 片思いの彼との未来は？" required></textarea></div>`,
    compat: `
      <div class="pair">${field("name", "あなたの名前", "text", 'maxlength="20" required')}${field("birthday", "誕生日", "date")}</div>
      <div class="pair">${field("partner", "相手の名前", "text", 'maxlength="20" required', inviter || "")}${field("partnerBirthday", "誕生日", "date", "", inviter ? "" : undefined)}</div>
      <div class="field"><label for="relation">ふたりの関係</label><select id="relation">
        <option>恋愛</option><option>片思い</option><option>夫婦</option><option>友達</option><option>仕事仲間</option></select></div>`,
    pastlife: field("name", "お名前(フルネーム推奨)", "text", 'maxlength="20" required') + field("birthday", "生年月日", "date", "required"),
  };
  app.innerHTML = `${topbar(m.name)}
    ${
      inviter
        ? `<div class="panel invite"><b>💌 ${esc(inviter)}さんが、あなたとの相性を占いました</b><br>あなたの名前を入れて、ふたりの相性を確かめてみましょう。</div>`
        : `<p class="intro">${intros[menu]}</p>`
    }
    <form class="form panel" id="f">${fields[menu]}
      <button class="btn gold" type="submit">${menu === "tarot" ? "カードを選ぶ" : "ルナに占ってもらう"}</button>
    </form>`;

  if (inviter && rel && $("#relation")) $("#relation").value = rel;
  if (inviter) $("#name")?.focus();

  $("#f").onsubmit = (e) => {
    e.preventDefault();
    const input = {};
    app.querySelectorAll("input, textarea, select").forEach((el) => (input[el.id] = el.value.trim()));
    // 名前・誕生日は次回のために覚えておく
    for (const k of ["name", "birthday"]) if (input[k]) store.profile[k] = input[k];
    save();
    if (input.birthday) input.zodiac = zodiacOf(input.birthday);
    if (menu === "tarot") return renderTarotPick(input);
    runReading(menu, input);
  };
}

// ---------- タロット: カードを選ぶ ----------
function renderTarotPick(input) {
  const deck = [...TAROT.keys()].sort(() => Math.random() - 0.5).slice(0, 18);
  const picks = [];
  const labels = ["過去", "現在", "未来"];
  app.innerHTML = `${topbar("タロット占い")}
    <p class="spread-guide">「${esc(input.question)}」<br>を思い浮かべながら、カードを3枚選んでください</p>
    <div class="slots">${labels.map((l, i) => `<div class="slot"><div class="face" id="s${i}"></div>${l}</div>`).join("")}</div>
    <div class="deck">${deck.map((_, i) => `<button class="tcard" data-i="${i}" aria-label="カード${i + 1}"></button>`).join("")}</div>
    <div style="margin-top:20px"><button class="btn gold" id="go" disabled>この3枚で占う</button></div>`;

  app.querySelectorAll(".tcard").forEach(
    (b) =>
      (b.onclick = () => {
        if (picks.length >= 3) return;
        b.classList.add("picked");
        const [name, sym] = TAROT[deck[b.dataset.i]];
        const reversed = Math.random() < 0.3;
        const slot = $(`#s${picks.length}`);
        slot.classList.add("filled");
        slot.innerHTML = `<div class="flip"><div class="back-side"></div><div class="front-side ${reversed ? "rev" : ""}"><span class="sym">${sym}</span><span class="nm">${name}</span><span class="pos">${reversed ? "逆位置" : "正位置"}</span></div></div>`;
        picks.push(`${name}(${reversed ? "逆位置" : "正位置"})`);
        $("#go").disabled = picks.length < 3;
      }),
  );
  $("#go").onclick = () => runReading("tarot", { ...input, cards: picks });
}

// ---------- 鑑定 ----------
const LOADING_LINES = ["ルナが星の配置を読んでいます…", "あなたの運命の糸をたどっています…", "水晶に未来が映りはじめました…"];

async function runReading(menu, input) {
  let li = 0;
  app.innerHTML = `<div class="loading"><div class="orb"></div><p id="ll">${LOADING_LINES[0]}</p></div>`;
  const timer = setInterval(() => {
    const el = $("#ll");
    if (el) el.textContent = LOADING_LINES[++li % LOADING_LINES.length];
  }, 2200);
  try {
    const res = await fetch("/api/reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu, input }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "エラーが発生しました");
    const entry = {
      id: Date.now().toString(36),
      menu,
      input,
      result: data.result,
      headings: data.headings,
      ticket: data.ticket, // 詳細鑑定を買うときにサーバーへ送り返す
      demo: data.demo,
      unlocked: false,
      at: Date.now(),
    };
    store.history.unshift(entry);
    store.history = store.history.slice(0, 30);
    save();
    location.hash = `#/result/${entry.id}`;
  } catch (err) {
    app.innerHTML = `${topbar(MENUS[menu].name)}<div class="panel"><p class="error">${esc(err.message)}</p>
      <button class="btn gold" id="retry">もう一度占う</button></div>`;
    $("#retry").onclick = () => runReading(menu, input);
  } finally {
    clearInterval(timer);
  }
}

// ---------- 結果 ----------
function gauge(score) {
  const r = 64;
  const c = 2 * Math.PI * r;
  return `<div class="gauge"><svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="url(#g)" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" style="transition:stroke-dashoffset 1.2s ease" id="arc" data-to="${c * (1 - score / 100)}"/>
      <defs><linearGradient id="g"><stop offset="0" stop-color="#f6e3a1"/><stop offset="1" stop-color="#f2a7c3"/></linearGradient></defs>
    </svg><div class="num"><div><b>${score}</b><small>/ 100</small></div></div></div>`;
}

function renderResult(id) {
  const h = store.history.find((x) => x.id === id);
  if (!h) return renderHome();
  const r = h.result;
  const m = MENUS[h.menu];
  const scoreLabel = { today: "総合運", tarot: "運気", compat: "相性度", pastlife: "魂の輝き" }[h.menu];

  app.innerHTML = `${topbar(m.name)}
    <div class="result-head">
      <div class="kind">${m.ico} ${m.name.toUpperCase()}</div>
      <h2>${esc(r.title)}</h2>
      ${gauge(r.score)}
      <div class="muted" style="font-size:12px;margin-top:6px">${scoreLabel}</div>
    </div>
    ${h.menu === "tarot" && h.input.cards ? `<div class="panel" style="margin-bottom:12px;font-size:13px;text-align:center">過去：${esc(h.input.cards[0])}　現在：${esc(h.input.cards[1])}　未来：${esc(h.input.cards[2])}</div>` : ""}
    <div class="panel"><p class="summary">${esc(r.summary)}</p></div>
    <div class="lucky">
      <div><small>ラッキーカラー</small><b>${esc(r.lucky.color)}</b></div>
      <div><small>ラッキーアイテム</small><b>${esc(r.lucky.item)}</b></div>
      <div><small>ラッキーナンバー</small><b>${esc(r.lucky.number)}</b></div>
    </div>
    <div class="detail panel ${h.unlocked ? "" : "locked"}">
      <div class="detail-body">${
        h.unlocked
          ? r.sections.map((s) => `<h3>${esc(s.heading)}</h3><p>${esc(s.body)}</p>`).join("")
          : // 購入前は本文を持っていないので、見出しとダミー文をぼかして見せる
            headingsOf(h).map((t) => `<h3>${esc(t)}</h3><p>${TEASER}</p>`).join("")
      }</div>
      ${
        h.unlocked
          ? ""
          : `<div class="lock-cover">
              <div>🔒 この先は<b>詳細鑑定</b>で読めます</div>
              <div class="muted" style="font-size:12px">${headingsOf(h).map(esc).join("・")}</div>
              <div class="price">詳細鑑定 <b>¥${pay.price}</b></div>
              <button class="btn gold" id="unlock">続きを読む</button>
            </div>`
      }
    </div>
    ${h.unlocked ? `<p class="advice">「${esc(r.advice)}」</p>` : ""}
    ${
      h.menu === "compat"
        ? `<div class="panel invite-cta"><b>${esc(h.input.partner)}さんにも占ってもらう？</b><br><span class="muted">リンクを送ると、名前が入った状態で相性診断が始まります</span>
            <button class="btn gold" id="invite">💌 ${esc(h.input.partner)}さんに送る</button></div>`
        : ""
    }
    <div class="section-title" style="text-align:center">結果をシェア</div>
    <div class="share">
      <button class="btn x" id="x">𝕏 でポスト</button>
      <button class="btn" id="img">画像を保存</button>
    </div>
    <div style="margin-top:12px"><button class="btn" onclick="location.hash='#/'">ほかの占いをする</button></div>
    <div class="footer">${h.demo ? "※ デモモードの鑑定です(APIキー未設定)" : ""}${LEGAL_LINKS}</div>`;

  requestAnimationFrame(() => {
    const arc = $("#arc");
    if (arc) arc.style.strokeDashoffset = arc.dataset.to;
  });
  $("#unlock")?.addEventListener("click", () => openPaywall(h));
  $("#x").onclick = () => {
    const text = `${r.shareText}\n【${m.name}】${r.title}(${scoreLabel} ${r.score}点)\n#星詠みルナ #AI占い`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.origin)}`, "_blank");
  };
  $("#img").onclick = () => shareImage(h, scoreLabel);
  $("#invite")?.addEventListener("click", () => sendInvite(h));
}

// 相性診断の招待リンクを送る(相手の画面では送り主の名前が入った状態で始まる)
async function sendInvite(h) {
  const q = new URLSearchParams({ from: h.input.name || "" });
  if (h.input.relation) q.set("rel", h.input.relation);
  const url = `${location.origin}/#/compat?${q}`;
  const text = `${h.input.name}さんが、あなたとの相性を占いました💞 結果を見てみる？`;
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

const TEASER = "ここにはルナによる詳しい鑑定が書かれています。あなたの星が示す本当の意味と、これから訪れる変化について。";
// 古い履歴(全文を持っているもの)にも対応
const headingsOf = (h) => h.headings || h.result.sections?.map((s) => s.heading) || [];

async function fetchDetail(h) {
  if (h.result.sections) return; // 以前の形式の履歴は全文を持っている
  if (!h.ticket) throw new Error("この鑑定は開けません。もう一度占ってください。");
  const res = await fetch("/api/reading/detail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket: h.ticket, sessionId: h.sessionId }),
  });
  const data = await res.json();
  if (res.status === 402) {
    // 支払いが確認できない(未完了・取り消し)ので、もう一度購入できる状態に戻す
    delete h.sessionId;
    save();
  }
  if (!res.ok) throw new Error(data.error || "エラーが発生しました");
  h.result.sections = data.sections;
  h.result.advice = data.advice;
}

async function unlock(h) {
  await fetchDetail(h);
  h.unlocked = true;
  save();
  toast("詳細鑑定をひらきました");
  renderResult(h.id);
}

// Stripe の支払いページへ移動する(支払い後は ?paid=... 付きでこのサイトに戻ってくる)
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
  // 支払い済みなのに鑑定の作成だけ失敗していた場合は、支払わずにやり直せる
  const paid = pay.mode === "demo" || h.sessionId;
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal panel">
      <h3>🔮 詳細鑑定 ¥${pay.price}</h3>
      <p>${headingsOf(h).map(esc).join("・")}<br>をルナが詳しく鑑定します。</p>
      <p class="error" id="payErr"></p>
      ${pay.mode === "demo" ? `<p style="font-size:11px">※ 現在はデモ版のため、決済なしで表示されます。</p>` : ""}
      <button class="btn gold" id="pay">${
        h.sessionId ? "購入済み・鑑定を表示する" : pay.mode === "demo" ? "購入して読む(デモ)" : "購入して読む"
      }</button>
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
    btn.textContent = paid ? "ルナが詳しく鑑定しています…" : "決済ページに移動しています…";
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
      <tr><th>販売価格</th><td>詳細鑑定 1回 ${esc(s.price ?? pay.price)}円(税込)</td></tr>
      <tr><th>商品代金以外の必要料金</th><td>インターネット接続にかかる通信料はお客様のご負担となります。</td></tr>
      <tr><th>支払方法</th><td>クレジットカード、Apple Pay、Google Pay(決済代行: Stripe)</td></tr>
      <tr><th>支払時期</th><td>ご購入手続きの完了時にお支払いが確定します。</td></tr>
      <tr><th>商品の引渡時期</th><td>決済完了後、ただちに画面上で詳細鑑定を表示します。</td></tr>
      <tr><th>返品・キャンセル</th><td>デジタルコンテンツの性質上、購入後の返品・キャンセルはお受けできません。ただし、システムの不具合により詳細鑑定が表示されない場合は、再表示または返金にて対応いたします。</td></tr>
      <tr><th>動作環境</th><td>最新版の Chrome・Safari・Edge などのブラウザ(JavaScript と Cookie・ローカルストレージが有効であること)</td></tr>
    </table>`,
  },
  privacy: {
    title: "プライバシーポリシー",
    body: (s) => `
      <p>${v(s.sellerName)}(以下「当方」)は、${esc(s.serviceName || "本サービス")}(以下「本サービス」)における利用者の情報を、以下のとおり取り扱います。</p>
      <h3>1. 取得する情報</h3>
      <ul><li>占いのために入力された情報(お名前・ニックネーム、生年月日、相談内容、相手の名前など)</li>
      <li>アクセス時のIPアドレス(短時間の利用回数の制限のため)</li>
      <li>決済に関する情報(決済の完了状況など。カード番号は決済代行会社 Stripe が取り扱い、当方は受け取りません)</li></ul>
      <h3>2. 利用目的</h3>
      <ul><li>占い結果の作成と表示</li><li>購入の確認と詳細鑑定の提供</li><li>不正利用の防止、お問い合わせへの対応</li></ul>
      <h3>3. 外部サービスへの提供</h3>
      <p>占い結果の作成のため、入力された情報を AI サービス提供事業者(Anthropic, PBC)に送信します。決済は Stripe, Inc. が行います。これら以外の第三者に、法令に基づく場合を除き個人情報を提供することはありません。</p>
      <h3>4. 保存について</h3>
      <p>入力内容と占い結果は、利用者のブラウザ内(ローカルストレージ)に保存されます。当方のサーバーには占いの内容を保存しません。IPアドレスは利用回数の制限のため一時的にのみ保持します。</p>
      <h3>5. お問い合わせ</h3>
      <p>個人情報の取り扱いに関するお問い合わせは ${v(s.email)} までご連絡ください。</p>
      <p class="muted">制定日: ${v(s.effectiveDate)}</p>`,
  },
  terms: {
    title: "利用規約",
    body: (s) => `
      <p>この規約は、${v(s.sellerName)}(以下「当方」)が提供する${esc(s.serviceName || "本サービス")}(以下「本サービス」)の利用条件を定めるものです。本サービスを利用した時点で、この規約に同意したものとみなします。</p>
      <h3>第1条(本サービスの内容)</h3>
      <p>本サービスは、AI が生成する占い・診断結果を提供するエンターテインメントです。結果の正確性・的中を保証するものではありません。健康・法律・金銭・進学などの重要な判断は、ご自身の責任で行い、必要に応じて専門家にご相談ください。</p>
      <h3>第2条(有料サービス)</h3>
      <p>詳細鑑定は有料です。価格・支払方法等は「特定商取引法に基づく表記」のとおりです。未成年の方は、保護者の同意を得たうえでご購入ください。</p>
      <h3>第3条(返品・返金)</h3>
      <p>デジタルコンテンツの性質上、購入後の返品・返金はできません。ただし、当方の不具合により詳細鑑定が表示されない場合はこの限りではありません。</p>
      <h3>第4条(禁止事項)</h3>
      <ul><li>他人になりすます行為、他人の個人情報を無断で入力する行為</li>
      <li>本サービスへの過度な負荷、不正アクセス、決済の不正利用</li>
      <li>占い結果を用いて他人を誹謗中傷する行為</li><li>その他、法令または公序良俗に反する行為</li></ul>
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
  if (location.hash !== `#/legal/${kind}`) return; // 読み込み中に別ページへ移動した
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

async function shareImage(h, scoreLabel) {
  const r = h.result;
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  await document.fonts?.ready;
  const serif = '"Shippori Mincho", "Hiragino Mincho ProN", serif';

  const bgGrad = ctx.createRadialGradient(W / 2, 0, 100, W / 2, H / 2, H);
  bgGrad.addColorStop(0, "#2a3170");
  bgGrad.addColorStop(1, "#0b1026");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.6})`;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(233,196,106,0.6)";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  ctx.textAlign = "center";
  ctx.fillStyle = "#e9c46a";
  ctx.font = `700 40px ${serif}`;
  ctx.fillText(`${MENUS[h.menu].ico} ${MENUS[h.menu].name}`, W / 2, 150);

  ctx.fillStyle = "#f6e3a1";
  ctx.font = `700 64px ${serif}`;
  wrap(ctx, r.title, W - 200).forEach((l, i) => ctx.fillText(l, W / 2, 260 + i * 84));

  ctx.font = `700 200px ${serif}`;
  ctx.fillText(String(r.score), W / 2, 620);
  ctx.fillStyle = "#a9a6c4";
  ctx.font = `36px ${serif}`;
  ctx.fillText(`${scoreLabel} / 100`, W / 2, 680);

  ctx.fillStyle = "#f4efe3";
  ctx.font = `36px ${serif}`;
  wrap(ctx, r.summary, W - 220)
    .slice(0, 6)
    .forEach((l, i) => ctx.fillText(l, W / 2, 790 + i * 58));

  ctx.fillStyle = "#e9c46a";
  ctx.font = `32px ${serif}`;
  ctx.fillText(`ラッキーカラー ${r.lucky.color} ／ ラッキーナンバー ${r.lucky.number}`, W / 2, 1180);
  ctx.font = `700 40px ${serif}`;
  ctx.fillText("🌙 星詠みルナ", W / 2, 1260);

  const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
  const file = new File([blob], "luna.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${r.shareText} #星詠みルナ` });
      return;
    } catch {}
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "luna.png";
  a.click();
  toast("画像を保存しました");
}

// Stripe の支払いから戻ってきた時(/?paid=セッションID&r=鑑定ID)
async function handlePaidReturn() {
  const q = new URLSearchParams(location.search);
  const sessionId = q.get("paid");
  const h = store.history.find((x) => x.id === q.get("r"));
  if (!sessionId) return false;
  history.replaceState(null, "", `/#/result/${h?.id || ""}`);
  if (!h) return false;
  h.sessionId = sessionId; // 鑑定の作成に失敗してもやり直せるよう先に保存
  save();
  app.innerHTML = `<div class="loading"><div class="orb"></div><p>ご購入ありがとうございます。<br>ルナが詳しく鑑定しています…</p></div>`;
  try {
    await unlock(h);
  } catch (err) {
    renderResult(h.id);
    toast(err.message);
  }
  return true;
}

fetch("/api/status")
  .then((r) => r.json())
  .then((s) => Object.assign(pay, { price: s.price ?? pay.price, mode: s.payment ?? pay.mode }))
  .catch(() => {})
  .finally(async () => {
    if (!(await handlePaidReturn())) route();
  });
