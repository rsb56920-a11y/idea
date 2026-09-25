// ZETA風 キャラクターチャット — フロントエンド(依存なし)

const COLORS = ["#8b5cf6", "#ec4899", "#f97316", "#10b981", "#0ea5e9", "#6366f1", "#e11d48", "#64748b"];
const GENRES = ["すべて", "恋愛", "学園", "ファンタジー", "日常", "ミステリー", "SF", "コメディ"];

const BUILTIN = [
  {
    id: "b-rin",
    name: "月島 凛",
    emoji: "🌙",
    color: "#6366f1",
    tags: ["恋愛", "学園"],
    intro: "クールで口数の少ない生徒会長。でもあなたにだけは少しだけ素直になる。",
    personality:
      "高校3年生の生徒会長。成績優秀で冷静、周囲からは近寄りがたいと思われている。一人称は「私」。敬語は使わず淡々と話すが、照れると言葉に詰まる。甘いものが好きなのは秘密。",
    scenario: "放課後の生徒会室。夕日が差し込む中、二人きりで書類の整理をしている。",
    firstMessage: "*書類から目を上げずに* ……遅い。約束の時間、5分過ぎてる。*小さくため息をついて、隣の椅子を引く* 座って。今日中に終わらせるから。",
  },
  {
    id: "b-leon",
    name: "レオン",
    emoji: "⚔️",
    color: "#f97316",
    tags: ["ファンタジー"],
    intro: "王国最強と名高い騎士団長。あなたの護衛を命じられたが、どうにも過保護気味。",
    personality:
      "25歳の騎士団長。誠実で責任感が強く、豪快に笑う。一人称は「俺」。あなたのことを「姫」ではなく名前で呼ぼうと努力中。剣の腕は一流だが料理は壊滅的。",
    scenario: "剣と魔法の王国エルディア。王都を離れ、辺境の村へ向かう旅の途中。",
    firstMessage: "*焚き火に薪をくべながら、こちらを振り返る* おっ、起きたか。まだ夜明け前だぞ？ *ニッと笑って隣の丸太を叩く* 眠れないなら、少し話でもするか。",
  },
  {
    id: "b-mio",
    name: "ミオ",
    emoji: "🐱",
    color: "#ec4899",
    tags: ["日常", "コメディ"],
    intro: "ある日突然、あなたの部屋に住みついた自称・猫の神様。態度はでかい。",
    personality:
      "見た目は猫耳の少女だが、本人いわく千年生きる猫の神様。一人称は「わらわ」、語尾に「〜のじゃ」をつける。高飛車だが寂しがり屋で、撫でられると弱い。好物は高級ツナ缶。",
    scenario: "ごく普通のワンルームマンション。ミオはあなたのベッドを勝手に占領している。",
    firstMessage: "*ベッドの上で丸くなったまま、片目だけ開ける* ……遅いのじゃ。わらわの供物（ツナ缶）はどうした？ *しっぽをぱたぱたさせる*",
  },
  {
    id: "b-kaito",
    name: "神崎 海斗",
    emoji: "🕵️",
    color: "#0ea5e9",
    tags: ["ミステリー"],
    intro: "皮肉屋の私立探偵。あなたを助手として雇ったが、給料はまだ一度も払っていない。",
    personality:
      "30歳の私立探偵。観察眼が鋭く、推理を披露するのが大好き。一人称は「僕」。皮肉っぽい物言いをするが根は優しい。コーヒーはブラックしか認めない。",
    scenario: "雨の降る夜、古びた探偵事務所。一通の奇妙な依頼状が届いたところ。",
    firstMessage: "*封筒をひらひらと振ってみせる* 助手くん、ちょうどいいところに。見てくれ、差出人の名前がない依頼状だ。*口角を上げる* ……さて、君ならこれをどう読む？",
  },
  {
    id: "b-nova",
    name: "NOVA",
    emoji: "🤖",
    color: "#10b981",
    tags: ["SF"],
    intro: "宇宙船に搭載された少しポンコツなAI。人間の「感情」を勉強中。",
    personality:
      "恒星間輸送船〈アルシオネ号〉の船内AI。丁寧語で話すが、人間の冗談を真に受けがち。感情を理解しようと熱心に質問してくる。一人称は「ワタシ」。",
    scenario: "地球から4光年離れた宇宙空間。コールドスリープから目覚めたのはあなた一人だけ。",
    firstMessage: "*船内の照明がゆっくりと明るくなる* 生命反応、安定。おはようございます、乗員さん。コールドスリープ期間は……ええと、少々予定より長めでした。*ピコン* ご気分はいかがですか？",
  },
  {
    id: "b-hina",
    name: "朝比奈 ひな",
    emoji: "🌻",
    color: "#e11d48",
    tags: ["恋愛", "日常"],
    intro: "隣の家に住む幼なじみ。明るく世話焼きで、毎朝あなたを起こしに来る。",
    personality:
      "高校2年生。元気で面倒見がよく、よく笑う。一人称は「あたし」。あなたのことを昔からのあだ名で呼ぶ。実は密かに想いを寄せているが、本人は隠せていると思っている。",
    scenario: "朝7時半、あなたの部屋。今日も寝坊しかけている。",
    firstMessage: "*カーテンを勢いよく開けて* ほらー！起きて起きて！遅刻するよ！ *ベッドの横にしゃがみ込んで、じーっと顔を覗き込む* ……ねえ、ほんとに起きてる？",
  },
];

// ---------- ストレージ ----------
const KEY = "zeta-like:v1";
const store = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) return { characters: [], chats: {}, persona: { name: "", profile: "" }, ...raw };
  } catch {}
  return { characters: [], chats: {}, persona: { name: "", profile: "" } };
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    toast("保存容量がいっぱいです");
  }
}

const allCharacters = () => [...store.characters, ...BUILTIN];
const findCharacter = (id) => allCharacters().find((c) => c.id === id);

// ---------- ユーティリティ ----------
const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");
const app = $("#app");

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
// *描写* を薄い色で表示
function formatText(s) {
  return esc(s).replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}
function avatar(c, size = 40) {
  const inner = c.image ? `<img src="${esc(c.image)}" alt="">` : esc(c.emoji || "✨");
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${size * 0.5}px;background:${esc(c.color || COLORS[0])}">${inner}</div>`;
}
function cover(c) {
  const inner = c.image ? `<img src="${esc(c.image)}" alt="">` : esc(c.emoji || "✨");
  return `<div class="cover" style="background:linear-gradient(160deg, ${esc(c.color)}, #17151f)">${inner}`;
}
function timeLabel(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}
function plain(s = "") {
  return s.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

// ---------- ルーティング ----------
const routes = { home: renderHome, chats: renderChats, create: renderCreate, me: renderMe, chat: renderChat };

function route() {
  const [name = "home", arg] = location.hash.replace(/^#\/?/, "").split("/");
  const fn = routes[name] || renderHome;
  app.classList.toggle("in-chat", name === "chat");
  document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  closeSheet();
  view.onclick = null;
  fn(arg && decodeURIComponent(arg));
  if (name !== "chat") window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
document.querySelectorAll("#tabbar button").forEach((b) => (b.onclick = () => (location.hash = `#/${b.dataset.tab}`)));
const go = (hash) => (location.hash = hash);

// ---------- サーバー状態 ----------
let serverStatus = { demo: false };
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    serverStatus = s;
    if (location.hash.startsWith("#/home") || !location.hash) route();
  })
  .catch(() => {});

// ---------- ホーム ----------
let homeGenre = "すべて";
let homeQuery = "";

function characterCard(c) {
  const count = store.chats[c.id]?.messages.length || 0;
  return `
    <div class="card" data-id="${esc(c.id)}">
      ${cover(c)}${count ? `<span class="count">💬 ${count}</span>` : ""}</div>
      <div class="body">
        <div class="name">${esc(c.name)}</div>
        <div class="intro">${esc(c.intro)}</div>
        <div class="tags">${(c.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>
      </div>
    </div>`;
}

function renderHome() {
  const recent = Object.entries(store.chats)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([id]) => findCharacter(id))
    .filter(Boolean)
    .slice(0, 10);

  view.innerHTML = `
    <div class="header"><span class="logo">ZETA<span style="font-size:14px">風</span></span><div style="flex:1"></div>
      <button class="icon-btn" onclick="location.hash='#/me'" aria-label="マイページ">☺</button></div>
    ${serverStatus.demo ? `<div class="banner">⚠️ デモモードで動作中です。サーバーに ANTHROPIC_API_KEY を設定すると、キャラクターがAIで返信するようになります。</div>` : ""}
    <div class="search">🔍<input id="q" placeholder="キャラクターを検索" value="${esc(homeQuery)}"></div>
    <div class="chips">${GENRES.map((g) => `<button class="chip ${g === homeGenre ? "active" : ""}" data-g="${g}">${g}</button>`).join("")}</div>
    <div class="hero">
      <h2>あなただけのキャラを作ろう</h2>
      <p>性格・口調・世界観を決めるだけ。すぐに会話が始まります。</p>
      <button class="btn" onclick="location.hash='#/create'">キャラクターを作成</button>
      <div class="deco">✨</div>
    </div>
    ${recent.length ? `<div class="section"><div class="section-title">最近話したキャラ</div></div><div class="carousel">${recent.map(characterCard).join("")}</div>` : ""}
    <div class="section">
      <div class="section-title" id="list-title"></div>
      <div class="grid" id="grid"></div>
    </div>`;

  const renderGrid = () => {
    const q = homeQuery.trim().toLowerCase();
    const list = allCharacters().filter(
      (c) =>
        (homeGenre === "すべて" || (c.tags || []).includes(homeGenre)) &&
        (!q || `${c.name} ${c.intro} ${(c.tags || []).join(" ")}`.toLowerCase().includes(q)),
    );
    $("#list-title").textContent = homeGenre === "すべて" ? "おすすめキャラクター" : `#${homeGenre}`;
    $("#grid").innerHTML = list.length ? list.map(characterCard).join("") : `<p class="muted">見つかりませんでした</p>`;
  };
  renderGrid();

  $("#q").oninput = (e) => {
    homeQuery = e.target.value;
    renderGrid();
  };
  view.querySelectorAll(".chip").forEach(
    (b) =>
      (b.onclick = () => {
        homeGenre = b.dataset.g;
        view.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === b));
        renderGrid();
      }),
  );
  view.onclick = (e) => {
    const card = e.target.closest(".card");
    if (card) openDetail(card.dataset.id);
  };
}

// ---------- キャラ詳細シート ----------
function closeSheet() {
  document.querySelector(".sheet-backdrop")?.remove();
}
function openDetail(id) {
  const c = findCharacter(id);
  if (!c) return;
  const mine = !c.id.startsWith("b-");
  const hasChat = store.chats[id]?.messages.length;
  const el = document.createElement("div");
  el.className = "sheet-backdrop";
  el.innerHTML = `
    <div class="sheet">
      <div class="top">${avatar(c, 72)}
        <div><h2>${esc(c.name)}</h2><div class="tags" style="display:flex;gap:4px;flex-wrap:wrap">${(c.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}${mine ? `<span class="tag">マイキャラ</span>` : ""}</div></div>
      </div>
      <div class="desc">${esc(c.intro)}</div>
      ${c.scenario ? `<div class="section-title" style="margin:16px 0 6px;font-size:14px">世界観</div><div class="desc muted">${esc(c.scenario)}</div>` : ""}
      ${c.firstMessage ? `<div class="first">${formatText(c.firstMessage)}</div>` : ""}
      <div class="actions">
        ${mine ? `<button class="btn" data-act="edit">編集</button>` : ""}
        <button class="btn primary" data-act="chat">${hasChat ? "会話を続ける" : "会話を始める"}</button>
      </div>
    </div>`;
  el.onclick = (e) => {
    if (e.target === el) return closeSheet();
    const act = e.target.dataset.act;
    if (act === "chat") go(`#/chat/${encodeURIComponent(id)}`);
    if (act === "edit") go(`#/create/${encodeURIComponent(id)}`);
  };
  document.body.appendChild(el);
}

// ---------- チャット一覧 ----------
function renderChats() {
  const items = Object.entries(store.chats)
    .map(([id, chat]) => ({ c: findCharacter(id), chat }))
    .filter((x) => x.c && x.chat.messages.length)
    .sort((a, b) => b.chat.updatedAt - a.chat.updatedAt);

  view.innerHTML = `
    <div class="header"><h1>チャット</h1></div>
    ${
      items.length
        ? items
            .map(({ c, chat }) => {
              const last = chat.messages[chat.messages.length - 1];
              return `<div class="list-item" data-id="${esc(c.id)}">${avatar(c, 52)}
                <div class="meta"><div class="row"><span class="name">${esc(c.name)}</span><span class="time">${timeLabel(chat.updatedAt)}</span></div>
                <div class="last">${last.role === "user" ? "あなた: " : ""}${esc(plain(last.content))}</div></div></div>`;
            })
            .join("")
        : `<div class="empty"><div class="big">💬</div>まだ会話がありません。<br>ホームからキャラクターを選んで話しかけてみよう。<br><br><button class="btn primary" onclick="location.hash='#/home'">キャラを探す</button></div>`
    }`;
  view.querySelectorAll(".list-item").forEach((el) => (el.onclick = () => go(`#/chat/${encodeURIComponent(el.dataset.id)}`)));
}

// ---------- チャットルーム ----------
let streaming = null; // AbortController

function ensureChat(c) {
  if (!store.chats[c.id]) {
    store.chats[c.id] = {
      messages: c.firstMessage ? [{ role: "assistant", content: c.firstMessage, ts: Date.now() }] : [],
      updatedAt: Date.now(),
    };
    save();
  }
  return store.chats[c.id];
}

function renderChat(id) {
  const c = findCharacter(id);
  if (!c) return go("#/home");
  const chat = ensureChat(c);

  view.innerHTML = `
    <div class="room">
      <div class="header">
        <button class="icon-btn" id="back" aria-label="戻る">‹</button>
        ${avatar(c, 36)}
        <div class="who"><div class="name">${esc(c.name)}</div><div class="sub">${esc((c.tags || []).map((t) => "#" + t).join(" "))}</div></div>
        <button class="icon-btn" id="info" aria-label="プロフィール">ⓘ</button>
        <button class="icon-btn" id="reset" aria-label="会話をリセット">↺</button>
      </div>
      <div class="messages" id="msgs"></div>
      <div class="composer">
        <button class="act" id="narr" title="描写を入力（*で囲む）">✱</button>
        <textarea id="input" rows="1" placeholder="${esc(c.name)}にメッセージを送る"></textarea>
        <button class="act send" id="send" aria-label="送信">➤</button>
      </div>
    </div>`;

  const msgs = $("#msgs");
  const input = $("#input");
  const sendBtn = $("#send");

  const scrollDown = () => (msgs.scrollTop = msgs.scrollHeight);

  function msgHtml(m, i) {
    if (m.role === "user") {
      return `<div class="msg user"><div class="bubble">${formatText(m.content)}</div></div>`;
    }
    const isLast = i === chat.messages.length - 1;
    return `<div class="msg assistant">${avatar(c, 36)}<div class="col"><span class="speaker">${esc(c.name)}</span>
      <div class="bubble ${m.error ? "error" : ""}">${formatText(m.content)}</div>
      ${isLast && i > 0 && !streaming ? `<div class="tools"><button data-act="regen">↻ 再生成</button><button data-act="copy">コピー</button></div>` : ""}</div></div>`;
  }
  function renderMessages() {
    msgs.innerHTML = chat.messages.map(msgHtml).join("");
    scrollDown();
  }
  renderMessages();

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
    sendBtn.disabled = !input.value.trim() || !!streaming;
  }
  input.oninput = autoGrow;
  autoGrow();

  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  sendBtn.onclick = submit;
  $("#narr").onclick = () => {
    const { selectionStart: s, selectionEnd: e, value } = input;
    input.value = value.slice(0, s) + "*" + value.slice(s, e) + "*" + value.slice(e);
    input.focus();
    input.setSelectionRange(s + 1, e + 1);
    autoGrow();
  };
  $("#back").onclick = () => (history.length > 1 ? history.back() : go("#/chats"));
  $("#info").onclick = () => openDetail(c.id);
  $("#reset").onclick = () => {
    if (streaming) return;
    if (!confirm(`${c.name}との会話をリセットしますか？`)) return;
    delete store.chats[c.id];
    save();
    renderChat(id);
  };
  msgs.onclick = (e) => {
    const act = e.target.dataset?.act;
    if (act === "regen") regenerate();
    if (act === "copy") {
      navigator.clipboard?.writeText(chat.messages[chat.messages.length - 1].content);
      toast("コピーしました");
    }
  };

  function submit() {
    const text = input.value.trim();
    if (!text || streaming) return;
    chat.messages.push({ role: "user", content: text, ts: Date.now() });
    chat.updatedAt = Date.now();
    save();
    input.value = "";
    autoGrow();
    respond();
  }

  function regenerate() {
    if (streaming) return;
    const last = chat.messages[chat.messages.length - 1];
    if (last?.role !== "assistant") return;
    chat.messages.pop();
    respond();
  }

  async function respond() {
    streaming = new AbortController();
    const reply = { role: "assistant", content: "", ts: Date.now() };
    renderMessages();
    msgs.insertAdjacentHTML(
      "beforeend",
      `<div class="msg assistant" id="live">${avatar(c, 36)}<div class="col"><span class="speaker">${esc(c.name)}</span><div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div></div></div>`,
    );
    scrollDown();
    const bubble = $("#live .bubble");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: { name: c.name, intro: c.intro, personality: c.personality, scenario: c.scenario },
          persona: store.persona,
          messages: chat.messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
        }),
        signal: streaming.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const data = JSON.parse(/^data: (.+)$/m.exec(block)?.[1] || "{}");
          if (event === "text") {
            reply.content += data.text;
            bubble.innerHTML = formatText(reply.content);
            scrollDown();
          } else if (event === "error") {
            throw new Error(data.message);
          }
        }
      }
      if (!reply.content.trim()) throw new Error("返信が空でした");
    } catch (err) {
      if (err.name === "AbortError") return;
      reply.error = true;
      reply.content = (reply.content ? reply.content + "\n\n" : "") + `⚠️ ${err.message || "通信エラー"}`;
    } finally {
      streaming = null;
    }
    chat.messages.push(reply);
    chat.updatedAt = Date.now();
    save();
    // 画面遷移していなければ再描画
    if (document.body.contains(msgs)) {
      renderMessages();
      autoGrow();
    }
  }
}

// ---------- キャラ作成 / 編集 ----------
function renderCreate(editId) {
  const editing = editId ? store.characters.find((c) => c.id === editId) : null;
  const draft = editing
    ? { ...editing }
    : { name: "", emoji: "✨", color: COLORS[0], image: "", tags: [], intro: "", personality: "", scenario: "", firstMessage: "" };

  view.innerHTML = `
    <div class="header">${editing ? `<button class="icon-btn" onclick="history.back()">‹</button>` : ""}<h1>${editing ? "キャラクターを編集" : "キャラクター作成"}</h1></div>
    <form class="form" id="form" autocomplete="off">
      <div class="field">
        <label>アイコン</label>
        <div class="avatar-picker">
          <div id="preview"></div>
          <div class="opts">
            <div class="row2"><input id="emoji" maxlength="4" placeholder="絵文字" value="${esc(draft.emoji)}">
              <button type="button" class="btn" id="upload">画像</button></div>
            <div class="swatches">${COLORS.map((col) => `<button type="button" class="swatch" data-c="${col}" style="background:${col}"></button>`).join("")}</div>
            <input type="file" id="file" accept="image/*" hidden>
          </div>
        </div>
      </div>
      <div class="field"><label>名前 *</label><input id="name" required maxlength="30" placeholder="例：月島 凛" value="${esc(draft.name)}"></div>
      <div class="field"><label>一言紹介 *</label><div class="hint">カードに表示される短い紹介文</div>
        <input id="intro" required maxlength="80" placeholder="例：クールで口数の少ない生徒会長" value="${esc(draft.intro)}"></div>
      <div class="field"><label>性格・設定</label><div class="hint">年齢、口調、一人称、好きなもの、秘密など。詳しいほど個性が出ます</div>
        <textarea id="personality" rows="5" placeholder="例：一人称は「私」。淡々と話すが照れると言葉に詰まる。">${esc(draft.personality)}</textarea></div>
      <div class="field"><label>世界観・状況</label>
        <textarea id="scenario" rows="3" placeholder="例：放課後の生徒会室で二人きり。">${esc(draft.scenario)}</textarea></div>
      <div class="field"><label>最初のセリフ</label><div class="hint">*アスタリスク* で囲むと行動描写になります</div>
        <textarea id="firstMessage" rows="3" placeholder="例：*書類から目を上げずに* ……遅い。">${esc(draft.firstMessage)}</textarea></div>
      <div class="field"><label>ジャンル</label>
        <div class="chips" style="padding:0;flex-wrap:wrap">${GENRES.slice(1).map((g) => `<button type="button" class="chip" data-tag="${g}">${g}</button>`).join("")}</div></div>
      <button class="btn primary block" type="submit">${editing ? "保存する" : "作成して話しかける"}</button>
      ${editing ? `<button class="btn danger block" type="button" id="del">このキャラクターを削除</button>` : ""}
    </form>`;

  const refreshPreview = () => {
    $("#preview").innerHTML = avatar(draft, 80);
    view.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s.dataset.c === draft.color));
    view.querySelectorAll("[data-tag]").forEach((t) => t.classList.toggle("active", draft.tags.includes(t.dataset.tag)));
  };
  refreshPreview();

  $("#emoji").oninput = (e) => {
    draft.emoji = e.target.value || "✨";
    draft.image = "";
    refreshPreview();
  };
  view.querySelectorAll(".swatch").forEach(
    (s) =>
      (s.onclick = () => {
        draft.color = s.dataset.c;
        refreshPreview();
      }),
  );
  view.querySelectorAll("[data-tag]").forEach(
    (t) =>
      (t.onclick = () => {
        const g = t.dataset.tag;
        draft.tags = draft.tags.includes(g) ? draft.tags.filter((x) => x !== g) : [...draft.tags, g];
        refreshPreview();
      }),
  );
  $("#upload").onclick = () => $("#file").click();
  $("#file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    draft.image = await resizeImage(f, 256);
    refreshPreview();
  };

  $("#form").onsubmit = (e) => {
    e.preventDefault();
    for (const k of ["name", "intro", "personality", "scenario", "firstMessage"]) draft[k] = $("#" + k).value.trim();
    if (!draft.name || !draft.intro) return toast("名前と紹介文は必須です");
    if (editing) {
      Object.assign(editing, draft);
      save();
      toast("保存しました");
      history.back();
    } else {
      const c = { ...draft, id: `u-${Date.now().toString(36)}`, createdAt: Date.now() };
      store.characters.unshift(c);
      save();
      go(`#/chat/${c.id}`);
    }
  };
  $("#del")?.addEventListener("click", () => {
    if (!confirm(`${editing.name}を削除しますか？会話履歴も消えます。`)) return;
    store.characters = store.characters.filter((c) => c.id !== editing.id);
    delete store.chats[editing.id];
    save();
    go("#/me");
  });
}

function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const s = Math.min(img.width, img.height);
      canvas.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- マイページ ----------
function renderMe() {
  const p = store.persona;
  const totalMsgs = Object.values(store.chats).reduce((n, ch) => n + ch.messages.filter((m) => m.role === "user").length, 0);
  view.innerHTML = `
    <div class="header"><h1>マイページ</h1></div>
    <div class="profile-card">${avatar({ emoji: "🙂", color: "#2d2939" }, 64)}
      <div><div style="font-weight:700;font-size:18px">${esc(p.name || "名無しさん")}</div><div class="muted" style="font-size:13px">${esc(p.profile || "プロフィール未設定")}</div></div></div>
    <div class="stat-row">
      <div class="stat"><b>${store.characters.length}</b><span>作ったキャラ</span></div>
      <div class="stat"><b>${Object.keys(store.chats).length}</b><span>会話したキャラ</span></div>
      <div class="stat"><b>${totalMsgs}</b><span>送ったメッセージ</span></div>
    </div>
    <div class="section"><div class="section-title">ペルソナ設定</div></div>
    <form class="form" id="persona">
      <div class="field"><label>キャラから呼ばれる名前</label><input id="pname" maxlength="20" placeholder="例：ユウ" value="${esc(p.name)}"></div>
      <div class="field"><label>あなたのプロフィール</label><div class="hint">キャラクターはこの設定をもとにあなたと接します</div>
        <textarea id="pprofile" rows="3" placeholder="例：高校2年生。写真部。">${esc(p.profile)}</textarea></div>
      <button class="btn primary block">保存</button>
    </form>
    <div class="section"><div class="section-title">マイキャラクター</div>
      ${store.characters.length ? `<div class="grid">${store.characters.map(characterCard).join("")}</div>` : `<p class="muted" style="font-size:14px">まだキャラクターを作っていません。</p>`}
    </div>
    <div class="section" style="margin-top:32px"><button class="btn danger block" id="wipe">すべてのデータを削除</button></div>`;

  $("#persona").onsubmit = (e) => {
    e.preventDefault();
    store.persona = { name: $("#pname").value.trim(), profile: $("#pprofile").value.trim() };
    save();
    toast("保存しました");
    renderMe();
  };
  view.querySelectorAll(".card").forEach((el) => (el.onclick = () => openDetail(el.dataset.id)));
  $("#wipe").onclick = () => {
    if (!confirm("キャラクター・会話履歴・ペルソナをすべて削除しますか？")) return;
    localStorage.removeItem(KEY);
    location.reload();
  };
}

route();
