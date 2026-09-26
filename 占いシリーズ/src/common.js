// ==== 共通: 計算・画面・シェア・合言葉 ====
// 各占いは window.PRODUCT = { id, title, ... compute(v) } を用意して U.start() を呼ぶだけ。
const CFG = Object.assign(
  { siteName: "星詠みルナの占い館", siteUrl: "", xHandle: "", payUrl: {}, price: {}, unlock: {}, allPassHash: "" },
  window.URANAI || {},
);

U.hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
U.hash = (s) => U.hex(U.sha256(new TextEncoder().encode(s)));
U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---- 数・暦の計算 ----
// 数秘術: 数字を1桁に(11/22/33 はマスターナンバーとして残す)
U.reduce = (n, keepMaster = true) => {
  while (n > 9 && !(keepMaster && (n === 11 || n === 22 || n === 33))) n = String(n).split("").reduce((a, c) => a + +c, 0);
  return n;
};
U.digitSum = (s) => String(s).replace(/\D/g, "").split("").reduce((a, c) => a + +c, 0);
U.lifePath = (y, m, d) => U.reduce(U.digitSum(`${y}${m}${d}`));
U.personalYear = (m, d, year) => U.reduce(U.digitSum(`${m}${d}${year}`), false);
U.personalMonth = (py, month) => U.reduce(py + month, false);
// ユリウス通日(グレゴリオ暦)
U.jdn = (y, m, d) => {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
};
// 日柱(0=甲子 … 59=癸亥)。2000/1/1 = 戊午(54)
U.dayPillar = (y, m, d) => (U.jdn(y, m, d) + 49) % 60;
U.STEMS = "甲乙丙丁戊己庚辛壬癸";
U.BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
U.ELEM = ["木", "火", "土", "金", "水"];
U.pillarName = (i) => U.STEMS[i % 10] + U.BRANCHES[i % 12];
U.yearBranch = (y) => (((y - 4) % 12) + 12) % 12;
U.yearStem = (y) => (((y - 4) % 10) + 10) % 10;
// 12星座
U.ZODIAC = [
  ["やぎ座", 1, 19, "土"], ["みずがめ座", 2, 18, "風"], ["うお座", 3, 20, "水"], ["おひつじ座", 4, 19, "火"],
  ["おうし座", 5, 20, "土"], ["ふたご座", 6, 21, "風"], ["かに座", 7, 22, "水"], ["しし座", 8, 22, "火"],
  ["おとめ座", 9, 22, "土"], ["てんびん座", 10, 23, "風"], ["さそり座", 11, 22, "水"], ["いて座", 12, 21, "火"],
];
U.zodiac = (m, d) => {
  const z = U.ZODIAC[m - 1];
  const hit = d <= z[2] ? z : U.ZODIAC[m % 12];
  return { name: hit[0], elem: hit[3] };
};
// 文字列から決まった乱数(同じ入力なら同じ結果)
U.rng = (seed) => {
  let h = parseInt(U.hash(seed).slice(0, 8), 16) || 1;
  return () => {
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
};
U.today = () => {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), key: `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}` };
};
U.parseDate = (s) => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s || "");
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(y, mo - 1, d);
  if (t.getMonth() !== mo - 1 || y < 1900 || y > 2030) return null;
  return { y, m: mo, d };
};

// ---- 画面 ----
const $ = (s) => document.querySelector(s);

function drawSky() {
  const cv = $("#sky");
  const ctx = cv.getContext("2d");
  let W, H, stars;
  const resize = () => {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
    stars = Array.from({ length: Math.round((W * H) / 9000) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + 0.3, p: Math.random() * 6 }));
  };
  resize();
  addEventListener("resize", resize);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let last = 0;
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (t - last < 50) return; // 20fps でかるく
    last = t;
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      const a = reduce ? 0.7 : 0.35 + 0.65 * Math.abs(Math.sin(t / 1400 + s.p));
      ctx.globalAlpha = a;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  requestAnimationFrame(tick);
}

function unlocked(id) {
  try {
    return localStorage.getItem("uranai_unlock_" + id) === "1" || localStorage.getItem("uranai_unlock_all") === "1";
  } catch {
    return false;
  }
}
function setUnlocked(key) {
  try {
    localStorage.setItem("uranai_unlock_" + key, "1");
  } catch {}
}

// 結果を画像に(インスタ・Xにそのまま貼れる 1080x1350)
function makeCard(card, P) {
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d");
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, P.colors[0]);
  g.addColorStop(1, P.colors[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const r = U.rng(card.big + card.kicker);
  for (let i = 0; i < 160; i++) {
    c.globalAlpha = 0.25 + r() * 0.75;
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(r() * W, r() * H, r() * 2.2 + 0.4, 0, 7);
    c.fill();
  }
  c.globalAlpha = 1;
  c.strokeStyle = "rgba(255,236,170,0.7)";
  c.lineWidth = 3;
  c.strokeRect(46, 46, W - 92, H - 92);
  const font = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Yu Gothic","Meiryo",sans-serif';
  c.textAlign = "center";
  c.fillStyle = "#ffecaa";
  c.font = `700 44px ${font}`;
  c.fillText(P.title, W / 2, 150);
  c.font = `140px ${font}`;
  c.fillText(card.emoji || P.emoji, W / 2, 360);
  c.fillStyle = "#fff";
  c.font = `500 40px ${font}`;
  c.fillText(card.kicker, W / 2, 470);
  let fs = 110;
  c.font = `900 ${fs}px ${font}`;
  while (c.measureText(card.big).width > W - 160 && fs > 50) c.font = `900 ${(fs -= 6)}px ${font}`;
  c.shadowColor = "rgba(0,0,0,0.35)";
  c.shadowBlur = 20;
  c.fillText(card.big, W / 2, 610);
  c.shadowBlur = 0;
  c.font = `500 42px ${font}`;
  let y = 740;
  for (const line of card.lines || []) {
    // 長い行は折り返す
    let buf = "";
    for (const ch of line) {
      if (c.measureText(buf + ch).width > W - 200) {
        c.fillText(buf, W / 2, y);
        y += 62;
        buf = "";
      }
      buf += ch;
    }
    c.fillText(buf, W / 2, y);
    y += 78;
  }
  c.fillStyle = "#ffecaa";
  c.font = `700 36px ${font}`;
  c.fillText(`#${P.hashtag}`, W / 2, H - 150);
  c.fillStyle = "rgba(255,255,255,0.85)";
  c.font = `500 32px ${font}`;
  c.fillText(CFG.siteName + (CFG.xHandle ? `  ${CFG.xHandle}` : ""), W / 2, H - 95);
  return cv.toDataURL("image/png");
}

U.start = () => {
  const P = window.PRODUCT;
  document.title = `${P.title}|${CFG.siteName}`;
  document.documentElement.style.setProperty("--a", P.colors[0]);
  document.documentElement.style.setProperty("--b", P.colors[1]);
  drawSky();
  $("#emoji").textContent = P.emoji;
  $("#title").textContent = P.title;
  $("#catch").innerHTML = P.catch;
  $("#badges").innerHTML = (P.badges || []).map((b) => `<span>${U.esc(b)}</span>`).join("");
  $("#site").textContent = CFG.siteName;

  // 入力欄
  const form = $("#form");
  form.innerHTML =
    P.inputs
      .map((f) => {
        const req = f.optional ? "" : "required";
        const hint = f.optional ? '<small>(なくてもOK)</small>' : "";
        if (f.type === "date") return `<label>${U.esc(f.label)}${hint}<input type="date" id="in_${f.id}" min="1900-01-01" max="2030-12-31" value="${f.value || ""}" ${req}></label>`;
        return `<label>${U.esc(f.label)}${hint}<input type="text" id="in_${f.id}" maxlength="20" placeholder="${U.esc(f.placeholder || "")}" ${req}></label>`;
      })
      .join("") + `<button class="go" type="submit">${U.esc(P.button || "占う")}</button><p class="note">入力した内容はこの端末の中だけで計算され、どこにも送信されません。</p>`;

  // 前回の入力を復元
  try {
    const saved = JSON.parse(localStorage.getItem("uranai_input_" + P.id) || "{}");
    for (const f of P.inputs) if (saved[f.id]) $("#in_" + f.id).value = saved[f.id];
  } catch {}

  let last = null;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = {};
    const raw = {};
    for (const f of P.inputs) {
      const s = $("#in_" + f.id).value.trim();
      raw[f.id] = s;
      if (f.type === "date") {
        if (!s && f.optional) continue;
        const dt = U.parseDate(s);
        if (!dt) return alert(`${f.label}を正しく入れてください`);
        v[f.id] = dt;
      } else v[f.id] = s;
    }
    try {
      localStorage.setItem("uranai_input_" + P.id, JSON.stringify(raw));
    } catch {}
    last = P.compute(v);
    show(last);
  });

  function show(res) {
    const out = $("#result");
    out.hidden = false;
    out.classList.remove("reveal");
    void out.offsetWidth;
    out.classList.add("reveal");
    $("#free").innerHTML = res.free;
    renderPaid(res);
    setTimeout(() => out.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  function renderPaid(res) {
    const box = $("#paid");
    if (!res.paid) return (box.hidden = true);
    box.hidden = false;
    if (unlocked(P.id)) {
      box.innerHTML = `<h3>🔓 ${U.esc(P.paidTitle)}</h3>${res.paid}`;
      return;
    }
    const pay = CFG.payUrl[P.id] || CFG.payUrl.all || "";
    const price = CFG.price[P.id] || CFG.price.all || "";
    box.innerHTML = `
      <h3>🔒 ${U.esc(P.paidTitle)}</h3>
      <ul class="menu">${(P.paidMenu || []).map((m) => `<li>${U.esc(m)}</li>`).join("")}</ul>
      <div class="blur" aria-hidden="true">${res.paidTeaser || res.paid}</div>
      ${pay ? `<a class="buy" href="${U.esc(pay)}" target="_blank" rel="noopener">完全版を見る${price ? `(${U.esc(price)})` : ""}</a>` : `<p class="note">(販売ページのURLは 設定.js の payUrl に書くとここにボタンが出ます)</p>`}
      <form class="code" id="codeForm"><input id="code" placeholder="購入後に届く合言葉" autocomplete="off"><button>ひらく</button></form>
      <p class="note" id="codeMsg">購入後の画面・メールに書いてある「合言葉」を入れると、この端末でずっと見られます。</p>`;
    $("#codeForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const h = U.hash($("#code").value.trim());
      if (h === CFG.unlock[P.id]) setUnlocked(P.id);
      else if (CFG.allPassHash && h === CFG.allPassHash) setUnlocked("all");
      else return ($("#codeMsg").textContent = "合言葉がちがうようです。全角/半角や空白を確かめてね。");
      renderPaid(res);
    });
  }

  $("#saveImg").addEventListener("click", () => {
    if (!last) return;
    const url = makeCard(last.card, P);
    const m = $("#modal");
    m.hidden = false;
    $("#cardImg").src = url;
    $("#dl").href = url;
    $("#dl").download = `${P.title}.png`;
  });
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal" || e.target.id === "close") $("#modal").hidden = true;
  });
  $("#shareX").addEventListener("click", () => {
    if (!last) return;
    const url = CFG.siteUrl ? CFG.siteUrl.replace(/\/?$/, "/") + encodeURIComponent(P.file || "") : "";
    const text = `${last.share}\n#${P.hashtag} #占い`;
    open(`https://x.com/intent/post?text=${encodeURIComponent(text)}${url ? `&url=${encodeURIComponent(url)}` : ""}`, "_blank", "noopener");
  });
  $("#again").addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));

  // ほかの占い(回遊用)
  const others = (window.CATALOG || []).filter((c) => c.id !== P.id);
  $("#others").innerHTML = others.map((c) => `<a href="${encodeURI(c.file)}"><b>${c.emoji}</b><span>${U.esc(c.title)}</span></a>`).join("");
};

// ---- 結果HTMLの部品 ----
U.big = (k, v, s) => `<div class="big"><div class="k">${U.esc(k)}</div><div class="v">${U.esc(v)}</div>${s ? `<div class="s">${U.esc(s)}</div>` : ""}</div>`;
U.meter = (pct) => `<div class="meter"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
U.chips = (list) => `<div class="row">${list.map((c) => `<span class="chip">${U.esc(c)}</span>`).join("")}</div>`;
U.p = (s) => `<p>${U.esc(s)}</p>`;
U.h = (s) => `<h3>${U.esc(s)}</h3>`;
