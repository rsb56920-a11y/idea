// 画像から動画メーカー — 画像にゆっくりした動き(ケン・バーンズ効果)と切り替えを付けて動画にする。
// プレビューも書き出しも同じ drawFrame(t) で描くので、見たまま動画になる。

const SIZES = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };
const MOTIONS = ["zoomIn", "panRight", "zoomOut", "panLeft", "panUp"];
const MOTION_NAMES = { auto: "全体の設定", zoomIn: "ズームイン", zoomOut: "ズームアウト", panLeft: "左へ", panRight: "右へ", panUp: "上へ", none: "止める" };
const TRANS = 0.7; // 切り替えにかける秒数
const FPS = 30;

const $ = (s) => document.querySelector(s);
const canvas = $("#canvas");
const ctx = canvas.getContext("2d");
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// slides: { img, url, caption, motion, blurBg(キャンバス) }
const slides = [];
const opt = { aspect: "9:16", fit: "contain", motion: "auto", transition: "fade", dur: 3, sparkle: false, vol: 0.8 };
let bgm = null; // { buffer, name }

// ---------- 画像の読み込み ----------
async function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      toast(`${f.name} は読み込めませんでした`);
      continue;
    }
    slides.push({ img, url, caption: "", motion: "auto", blurBg: null });
  }
  resize();
  renderSlides();
  drawFrame(0);
}

$("#files").onchange = (e) => addFiles(e.target.files);
const drop = $("#drop");
drop.ondragover = (e) => {
  e.preventDefault();
  drop.classList.add("over");
};
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  addFiles(e.dataTransfer.files);
};

function renderSlides() {
  $("#slides").innerHTML = slides
    .map(
      (s, i) => `<div class="slide" data-i="${i}">
        <img src="${s.url}" alt="">
        <div>
          <input data-k="caption" placeholder="文字を入れる(任意)" maxlength="40" value="${esc(s.caption)}">
          <select data-k="motion">${Object.entries(MOTION_NAMES)
            .map(([k, v]) => `<option value="${k}" ${k === s.motion ? "selected" : ""}>動き:${v}</option>`)
            .join("")}</select>
        </div>
        <div class="ops"><button data-op="up" aria-label="上へ">▲</button><button data-op="down" aria-label="下へ">▼</button><button data-op="del" aria-label="削除">✕</button></div>
      </div>`,
    )
    .join("");
  updateTime();
}

$("#slides").addEventListener("input", (e) => {
  const i = Number(e.target.closest(".slide")?.dataset.i);
  if (Number.isNaN(i) || !e.target.dataset.k) return;
  slides[i][e.target.dataset.k] = e.target.value;
  if (!playing) drawFrame(slideStart(i) + Math.min(1, opt.dur / 2));
});
$("#slides").addEventListener("click", (e) => {
  const op = e.target.dataset.op;
  if (!op) return;
  const i = Number(e.target.closest(".slide").dataset.i);
  if (op === "del") {
    URL.revokeObjectURL(slides[i].url);
    slides.splice(i, 1);
  } else {
    const j = op === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= slides.length) return;
    [slides[i], slides[j]] = [slides[j], slides[i]];
  }
  renderSlides();
  drawFrame(0);
});

// ---------- 設定 ----------
for (const id of ["aspect", "fit", "motion", "transition"]) {
  $(`#${id}`).onchange = (e) => {
    opt[id] = e.target.value;
    if (id === "aspect") {
      resize();
      slides.forEach((s) => (s.blurBg = null));
    }
    drawFrame(currentT);
  };
}
$("#dur").oninput = (e) => {
  opt.dur = Number(e.target.value);
  $("#durVal").textContent = `${opt.dur} 秒`;
  updateTime();
  drawFrame(currentT);
};
$("#sparkle").onchange = (e) => {
  opt.sparkle = e.target.checked;
  drawFrame(currentT);
};
$("#vol").oninput = (e) => {
  opt.vol = Number(e.target.value);
  $("#volVal").textContent = `${Math.round(opt.vol * 100)}%`;
};
$("#bgm").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const ac = new AudioContext();
    bgm = { buffer: await ac.decodeAudioData(await f.arrayBuffer()), name: f.name };
    ac.close();
    $("#bgmName").textContent = `🎵 ${f.name}`;
  } catch {
    toast("この音楽ファイルは読み込めませんでした");
  }
};

function resize() {
  const [w, h] = SIZES[opt.aspect];
  canvas.width = w;
  canvas.height = h;
}

// ---------- タイミング ----------
// 各スライドは opt.dur 秒。切り替えの TRANS 秒は前後のスライドが重なる
const slideStart = (i) => i * (opt.dur - TRANS);
const totalTime = () => (slides.length ? slides.length * (opt.dur - TRANS) + TRANS : 0);
const ease = (x) => x * x * (3 - 2 * x); // なめらかに動き出して止まる

function updateTime() {
  $("#timeLabel").textContent = `${currentT.toFixed(1)} / ${totalTime().toFixed(1)} 秒`;
  $("#seek").style.width = `${totalTime() ? (currentT / totalTime()) * 100 : 0}%`;
  $("#exportNote").textContent = slides.length
    ? `書き出しには動画と同じ時間(約${Math.ceil(totalTime())}秒)かかります。書き出し中はこのタブを開いたままにしてください。`
    : "";
}

// ---------- 描画 ----------
// 背景用のぼかし画像は1枚につき1回だけ作る(毎フレームぼかすと重いため)
function blurBgOf(s) {
  if (s.blurBg) return s.blurBg;
  const W = canvas.width / 4;
  const H = canvas.height / 4;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const sc = Math.max(W / s.img.width, H / s.img.height) * 1.1;
  g.filter = "blur(8px) brightness(0.6)";
  g.drawImage(s.img, (W - s.img.width * sc) / 2, (H - s.img.height * sc) / 2, s.img.width * sc, s.img.height * sc);
  return (s.blurBg = c);
}

function motionOf(i) {
  const m = slides[i].motion !== "auto" ? slides[i].motion : opt.motion;
  return m === "auto" ? MOTIONS[i % MOTIONS.length] : m;
}

// 1枚の画像を、そのスライド内の進み具合 p(0〜1) に合わせて描く
function drawSlide(i, p, extraScale = 1) {
  const s = slides[i];
  const W = canvas.width;
  const H = canvas.height;
  const e = ease(Math.min(1, Math.max(0, p)));
  let zoom = 1.08;
  let dx = 0;
  let dy = 0;
  switch (motionOf(i)) {
    case "zoomIn": zoom = 1 + 0.15 * e; break;
    case "zoomOut": zoom = 1.15 - 0.15 * e; break;
    case "panLeft": zoom = 1.15; dx = 0.5 - e; break;
    case "panRight": zoom = 1.15; dx = e - 0.5; break;
    case "panUp": zoom = 1.15; dy = 0.5 - e; break;
    case "none": zoom = 1; break;
  }
  zoom *= extraScale;
  const iw = s.img.width;
  const ih = s.img.height;
  const base = opt.fit === "cover" ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
  if (opt.fit === "contain") ctx.drawImage(blurBgOf(s), 0, 0, W, H);
  const dw = iw * base * zoom;
  const dh = ih * base * zoom;
  // はみ出している分の範囲で左右・上下に流す
  const ox = Math.max(0, dw - W) * dx;
  const oy = Math.max(0, dh - H) * dy;
  ctx.drawImage(s.img, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh);
}

function drawCaption(text, alpha) {
  if (!text || alpha <= 0) return;
  const W = canvas.width;
  const H = canvas.height;
  const size = Math.round(Math.min(W, H) * 0.065);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `800 ${size}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const lines = wrap(text, W * 0.86);
  const y0 = H * (opt.aspect === "9:16" ? 0.78 : 0.84) - ((lines.length - 1) * size * 1.3) / 2;
  lines.forEach((l, k) => {
    const y = y0 + k * size * 1.3 + (1 - alpha) * size * 0.4;
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(l, W / 2, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(l, W / 2, y);
  });
  ctx.restore();
}

function wrap(text, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// キラキラ: 時間 t から位置が決まるので、プレビューと書き出しで同じになる
function drawSparkles(t) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 40; k++) {
    const seed = Math.sin(k * 12.9898) * 43758.5453;
    const r1 = seed - Math.floor(seed);
    const r2 = (seed * 7.13) % 1;
    const speed = 0.03 + r2 * 0.05;
    const x = (r1 * W + Math.sin(t * 0.8 + k) * W * 0.02) % W;
    const y = H - ((((r2 + t * speed) % 1) + 1) % 1) * H;
    const tw = 0.5 + 0.5 * Math.sin(t * 4 + k * 1.7);
    const r = (2 + r1 * 5) * (W / 1080);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, `rgba(255,250,220,${0.9 * tw})`);
    g.addColorStop(1, "rgba(255,250,220,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFrame(t) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (!slides.length) {
    ctx.fillStyle = "#666";
    ctx.font = `700 ${Math.round(W * 0.05)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("画像を入れるとここに表示されます", W / 2, H / 2);
    return;
  }
  const step = opt.dur - TRANS;
  const i = Math.min(slides.length - 1, Math.floor(t / step));
  const local = t - slideStart(i);
  const p = local / opt.dur;
  drawSlide(i, p);

  // 次のスライドへの切り替え
  const next = i + 1;
  const q = (local - step) / TRANS; // 0〜1 で切り替え中
  let captionAlpha = Math.min(1, local / 0.5);
  if (next < slides.length && q > 0) {
    const qe = ease(Math.min(1, q));
    const pNext = (local - step) / opt.dur;
    switch (opt.transition) {
      case "fade":
        ctx.globalAlpha = qe;
        drawSlide(next, pNext);
        ctx.globalAlpha = 1;
        break;
      case "slide":
        ctx.save();
        ctx.translate(-W * qe, 0);
        drawSlide(i, p);
        ctx.translate(W, 0);
        drawSlide(next, pNext);
        ctx.restore();
        break;
      case "zoom":
        ctx.globalAlpha = qe;
        drawSlide(next, pNext, 1.25 - 0.25 * qe);
        ctx.globalAlpha = 1;
        break;
      case "flash":
        if (qe >= 0.5) drawSlide(next, pNext);
        ctx.fillStyle = `rgba(255,255,255,${1 - Math.abs(qe - 0.5) * 2})`;
        ctx.fillRect(0, 0, W, H);
        break;
      default:
        if (qe >= 0.5) drawSlide(next, pNext);
    }
    captionAlpha = 1 - qe;
    drawCaption(slides[i].caption, captionAlpha);
    drawCaption(slides[next].caption, qe);
  } else {
    drawCaption(slides[i].caption, captionAlpha);
  }
  if (opt.sparkle) drawSparkles(t);
  // 最後は0.4秒かけて暗くして終わる
  const fadeOut = (t - (totalTime() - 0.4)) / 0.4;
  if (fadeOut > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fadeOut)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- 再生 ----------
let currentT = 0;
let playing = null; // { start, raf, audio }

function play({ onEnd, audioDest } = {}) {
  stop();
  const total = totalTime();
  const audio = startBgm(audioDest);
  const t0 = performance.now();
  const tick = () => {
    currentT = Math.min(total, (performance.now() - t0) / 1000);
    drawFrame(currentT);
    updateTime();
    if (currentT >= total) {
      stop();
      onEnd?.();
      return;
    }
    playing.raf = requestAnimationFrame(tick);
  };
  playing = { raf: requestAnimationFrame(tick), audio };
  $("#play").textContent = "■ 停止";
}

function stop() {
  if (!playing) return;
  cancelAnimationFrame(playing.raf);
  playing.audio?.stop();
  playing = null;
  $("#play").textContent = "▶ プレビュー";
}

// BGM を鳴らす。書き出し時は録画用の出力にもつなぐ
function startBgm(audioDest) {
  if (!bgm) return null;
  const ac = audioDest?.context || new AudioContext();
  const src = new AudioBufferSourceNode(ac, { buffer: bgm.buffer, loop: true });
  const gain = new GainNode(ac, { gain: opt.vol });
  const total = totalTime();
  // 最後の1.5秒で音を小さくして終える
  gain.gain.setValueAtTime(opt.vol, ac.currentTime + Math.max(0, total - 1.5));
  gain.gain.linearRampToValueAtTime(0, ac.currentTime + total);
  src.connect(gain).connect(audioDest || ac.destination);
  src.start();
  return {
    stop() {
      try {
        src.stop();
      } catch {}
      if (!audioDest) ac.close();
    },
  };
}

$("#play").onclick = () => {
  if (!slides.length) return toast("先に画像を入れてください");
  if (playing) return stop();
  play({ onEnd: () => {} });
};
$(".bar").onclick = (e) => {
  if (playing || !slides.length) return;
  const r = e.currentTarget.getBoundingClientRect();
  currentT = ((e.clientX - r.left) / r.width) * totalTime();
  drawFrame(currentT);
  updateTime();
};

// ---------- 書き出し ----------
function pickMime() {
  const cands = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return cands.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

$("#export").onclick = async () => {
  if (!slides.length) return toast("先に画像を入れてください");
  const btn = $("#export");
  btn.disabled = true;
  $("#play").disabled = true;
  btn.textContent = "書き出し中…";
  const mime = pickMime();
  const stream = canvas.captureStream(FPS);
  let ac = null;
  let audioDest = null;
  if (bgm) {
    ac = new AudioContext();
    audioDest = ac.createMediaStreamDestination();
    audioDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  }
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(500);
  play({ audioDest: audioDest || undefined, onEnd: () => setTimeout(() => rec.stop(), 200) });
  await done;
  ac?.close();
  const type = rec.mimeType || mime || "video/webm";
  const blob = new Blob(chunks, { type });
  const url = URL.createObjectURL(blob);
  const ext = type.includes("mp4") ? "mp4" : "webm";
  $("#result").innerHTML = `<video controls playsinline src="${url}"></video><a href="${url}" download="video-${Date.now()}.${ext}">⬇ ${ext.toUpperCase()} を保存(${(blob.size / 1e6).toFixed(1)}MB)</a>
    ${ext === "webm" ? `<p class="hint center">このブラウザは MP4 で保存できないため WebM で保存します。TikTok などが WebM を受け付けない場合は、最新の Chrome / Edge で書き出すと MP4 になります。</p>` : ""}`;
  btn.disabled = false;
  $("#play").disabled = false;
  btn.textContent = "⬇ 動画を書き出す";
  toast("書き出しました");
};

// ---------- 起動 ----------
resize();
$("#durVal").textContent = `${opt.dur} 秒`;
$("#volVal").textContent = `${Math.round(opt.vol * 100)}%`;
drawFrame(0);
updateTime();
