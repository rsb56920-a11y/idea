// 画像から動画メーカー — 画像にゆっくりした動き(ケン・バーンズ効果)と切り替えを付けて動画にする。
// プレビューも書き出しも同じ drawFrame(t) で描くので、見たまま動画になる。

import { PARTICLES, GRADES, drawParticles, drawGrade, drawRays, filterOf } from "./effects.js";
import { parseWish, describe } from "./wish.js";
import { MotionRenderer, REGION_FX, newMasks, hasPaint, autoMask, combineMasks, fxChannel } from "./motion.js";

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
const opt = { aspect: "9:16", fit: "contain", motion: "auto", transition: "fade", dur: 3, sparkle: false, vol: 0.8, wish: "" };
let bgm = null; // { buffer, name }

// ---------- 画像の読み込み ----------
const WORK_MAX = 1440; // 動かすときに使う写真の大きさ(長い辺)
function makeSlide(img, url) {
  const sc = Math.min(1, WORK_MAX / Math.max(img.width, img.height));
  const work = document.createElement("canvas");
  work.width = Math.round(img.width * sc);
  work.height = Math.round(img.height * sc);
  work.getContext("2d").drawImage(img, 0, 0, work.width, work.height);
  return {
    img, url, work, caption: "", wish: "", motion: "auto", blurBg: null,
    masks: newMasks(img), painted: { flow: false, sway: false, flicker: false, rise: false }, auto: {},
    maskData: null, maskVer: 0, maskDirty: true, flowDir: null, userDir: false, waveMode: false, active: false,
  };
}
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
    slides.push(makeSlide(img, url));
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
          <input data-k="wish" placeholder="この写真だけのお願い(任意)" maxlength="80" value="${esc(s.wish)}">
          <button class="btn small brush" type="button" data-op="brush">🖌 動かす場所をなぞる${Object.values(s.painted).some(Boolean) ? " ✓" : ""}</button>
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
  if (op === "brush") return openEditor(i);
  if (op === "del") {
    motionR.forget?.(slides[i]);
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

// この写真にかける効果(写真ごとのお願いがあればそれ、なければ全体のお願い)
const fxCache = new Map();
function fxOf(i) {
  const text = (slides[i].wish || opt.wish || "").trim();
  if (!fxCache.has(text)) fxCache.set(text, parseWish(text));
  const fx = fxCache.get(text);
  if (opt.sparkle && !fx.particles.includes("glow")) return { ...fx, particles: [...fx.particles, "glow"] };
  return fx;
}

// ---------- 写真の一部を動かす ----------
const motionR = new MotionRenderer();
// お願い(空・水は自動でさがす)と、なぞった場所から、動かす場所をまとめる
function prepareMotion(s, fx) {
  const want = {};
  for (const r of fx.regions) want[fxChannel(r.fx)] = r;
  for (const ch of ["flow", "sway", "flicker", "rise"]) {
    const r = want[ch];
    const autoArea = r && (r.area === "sky" || r.area === "water") ? r.area : null;
    if (!s.painted[ch] && s.auto[ch] !== autoArea) {
      const c = s.masks[ch];
      c.getContext("2d").clearRect(0, 0, c.width, c.height);
      if (autoArea) autoMask(s.img, autoArea, c);
      s.auto[ch] = autoArea;
      s.maskDirty = true;
    }
  }
  const fr = want.flow;
  if (!s.userDir && fr) s.flowDir = fr.dir || "right";
  const wave = !!(fr && fr.fx === "wave");
  if (!s.userDir && s.waveMode !== wave) s.waveMode = wave;
  if (s.maskDirty) {
    s.maskData = combineMasks(s.masks);
    s.maskVer++;
    s.maskDirty = false;
    let any = false;
    for (let k = 0; k < s.maskData.data.length && !any; k += 8) any = s.maskData.data[k] | s.maskData.data[k + 1] | s.maskData.data[k + 2] | s.maskData.data[k + 3];
    s.active = !!any;
  }
  return s.active && motionR.ok;
}

function motionOf(i) {
  if (slides[i].motion !== "auto") return slides[i].motion;
  const cam = fxOf(i).camera;
  if (cam) return cam;
  return opt.motion === "auto" ? MOTIONS[i % MOTIONS.length] : opt.motion;
}

// 1枚の画像を、そのスライド内の進み具合 p(0〜1) に合わせて描く
function drawSlide(i, p, extraScale = 1, t = currentT) {
  const s = slides[i];
  const W = canvas.width;
  const H = canvas.height;
  const e = ease(Math.min(1, Math.max(0, p)));
  const sp = fxOf(i).speed; // ゆっくり=動きを小さく、はやめ=大きく
  let zoom = 1.08;
  let dx = 0;
  let dy = 0;
  switch (motionOf(i)) {
    case "zoomIn": zoom = 1 + 0.15 * sp * e; break;
    case "zoomOut": zoom = 1 + 0.15 * sp * (1 - e); break;
    case "panLeft": zoom = 1.15; dx = (0.5 - e) * Math.min(1, sp); break;
    case "panRight": zoom = 1.15; dx = (e - 0.5) * Math.min(1, sp); break;
    case "panUp": zoom = 1.15; dy = (0.5 - e) * Math.min(1, sp); break;
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
  const fx = fxOf(i);
  const src = prepareMotion(s, fx) ? motionR.render(s, t, fx.speed) : s.img;
  const f = filterOf(fx.grade);
  if (f !== "none") ctx.filter = f;
  ctx.drawImage(src, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh);
  ctx.filter = "none";
}

// 写真にかける雰囲気と、舞うもの。alpha: 切り替え中の重なり具合
function drawFx(i, t, alpha) {
  if (alpha <= 0) return;
  const W = canvas.width;
  const H = canvas.height;
  const fx = fxOf(i);
  ctx.save();
  ctx.globalAlpha = alpha;
  drawGrade(ctx, fx.grade, W, H, t);
  if (fx.rays) drawRays(ctx, W, H, t);
  for (const p of fx.particles) drawParticles(ctx, p, t * (0.6 + 0.4 * fx.speed), W, H, fx.amount);
  ctx.restore();
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
  drawSlide(i, p, 1, t);

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
        drawSlide(next, pNext, 1, t);
        ctx.globalAlpha = 1;
        break;
      case "slide":
        ctx.save();
        ctx.translate(-W * qe, 0);
        drawSlide(i, p, 1, t);
        ctx.translate(W, 0);
        drawSlide(next, pNext, 1, t);
        ctx.restore();
        break;
      case "zoom":
        ctx.globalAlpha = qe;
        drawSlide(next, pNext, 1.25 - 0.25 * qe, t);
        ctx.globalAlpha = 1;
        break;
      case "flash":
        if (qe >= 0.5) drawSlide(next, pNext, 1, t);
        ctx.fillStyle = `rgba(255,255,255,${1 - Math.abs(qe - 0.5) * 2})`;
        ctx.fillRect(0, 0, W, H);
        break;
      default:
        if (qe >= 0.5) drawSlide(next, pNext, 1, t);
    }
    drawFx(i, t, 1 - qe);
    drawFx(next, t, qe);
    captionAlpha = 1 - qe;
    drawCaption(slides[i].caption, captionAlpha);
    drawCaption(slides[next].caption, qe);
  } else {
    drawFx(i, t, 1);
    drawCaption(slides[i].caption, captionAlpha);
  }
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

// ---------- なぞる画面 ----------
const ed = { i: -1, tool: "flow", size: 40, drawing: false, playRaf: 0, t0: 0 };
const edCanvas = $("#edCanvas");
const edCtx = edCanvas.getContext("2d");
$("#edTools").innerHTML =
  Object.entries(REGION_FX).map(([k, v]) => `<button class="btn small tool" data-tool="${k}" style="--c:rgb(${v.color})">${v.name}</button>`).join("") +
  `<button class="btn small tool" data-tool="erase" style="--c:#888">🧽 消しゴム</button>`;
function edTool(k) {
  ed.tool = k;
  document.querySelectorAll("#edTools .tool").forEach((b) => b.classList.toggle("on", b.dataset.tool === k));
}
$("#edTools").onclick = (e) => e.target.dataset.tool && edTool(e.target.dataset.tool);
function openEditor(i) {
  stop();
  ed.i = i;
  const s = slides[i];
  const maxW = Math.min(900, window.innerWidth - 40);
  const maxH = window.innerHeight * 0.55;
  const sc = Math.min(maxW / s.img.width, maxH / s.img.height);
  edCanvas.width = Math.round(s.img.width * sc);
  edCanvas.height = Math.round(s.img.height * sc);
  $("#edDir").value = s.flowDir || "right";
  $("#editor").hidden = false;
  edTool(ed.tool);
  edDraw();
}
function closeEditor() {
  edStopPlay();
  $("#editor").hidden = true;
  renderSlides();
  drawFrame(currentT);
}
$("#edClose").onclick = closeEditor;
$("#editor").onclick = (e) => e.target.id === "editor" && closeEditor();
// 写真の上に、なぞった所を色つきで重ねて見せる
const tint = document.createElement("canvas");
function edDraw(frame) {
  const s = slides[ed.i];
  const W = edCanvas.width, H = edCanvas.height;
  edCtx.clearRect(0, 0, W, H);
  edCtx.drawImage(frame || s.img, 0, 0, W, H);
  if (frame) return;
  tint.width = W;
  tint.height = H;
  const tg = tint.getContext("2d");
  for (const [k, v] of Object.entries(REGION_FX)) {
    const ch = fxChannel(k);
    if (k === "wave") continue; // 流れると同じ場所
    tg.globalCompositeOperation = "source-over";
    tg.clearRect(0, 0, W, H);
    tg.drawImage(s.masks[ch], 0, 0, W, H);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = `rgb(${v.color})`;
    tg.fillRect(0, 0, W, H);
    edCtx.globalAlpha = 0.5;
    edCtx.drawImage(tint, 0, 0);
    edCtx.globalAlpha = 1;
  }
}
function edPaint(e) {
  const s = slides[ed.i];
  const r = edCanvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * s.masks.w;
  const y = ((e.clientY - r.top) / r.height) * s.masks.h;
  const rad = (ed.size / r.width) * s.masks.w;
  const chans = ed.tool === "erase" ? ["flow", "sway", "flicker", "rise"] : [fxChannel(ed.tool)];
  for (const ch of chans) {
    const g = s.masks[ch].getContext("2d");
    g.globalCompositeOperation = ed.tool === "erase" ? "destination-out" : "source-over";
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.6, "rgba(255,255,255,0.8)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
    s.painted[ch] = ed.tool === "erase" ? hasPaint(s.masks[ch]) || s.painted[ch] : true;
  }
  if (ed.tool === "wave" || ed.tool === "flow") {
    s.waveMode = ed.tool === "wave";
    s.userDir = true;
  }
  s.maskDirty = true;
  if (!ed.playRaf) edDraw();
}
edCanvas.addEventListener("pointerdown", (e) => {
  ed.drawing = true;
  edCanvas.setPointerCapture(e.pointerId);
  edPaint(e);
});
edCanvas.addEventListener("pointermove", (e) => ed.drawing && edPaint(e));
edCanvas.addEventListener("pointerup", () => (ed.drawing = false));
$("#edSize").oninput = (e) => (ed.size = Number(e.target.value));
$("#edDir").onchange = (e) => {
  const s = slides[ed.i];
  s.flowDir = e.target.value;
  s.userDir = true;
};
$("#edClear").onclick = () => {
  const s = slides[ed.i];
  for (const ch of ["flow", "sway", "flicker", "rise"]) {
    s.masks[ch].getContext("2d").clearRect(0, 0, s.masks.w, s.masks.h);
    s.painted[ch] = true; // 自動でさがした所も消したままにする
  }
  s.maskDirty = true;
  edDraw();
};
function edAuto(area) {
  const s = slides[ed.i];
  autoMask(s.img, area, s.masks.flow);
  s.painted.flow = true;
  s.waveMode = area === "water";
  s.userDir = true;
  s.maskDirty = true;
  edTool(area === "water" ? "wave" : "flow");
  edDraw();
  if (!hasPaint(s.masks.flow)) toast(area === "sky" ? "空が見つかりませんでした。なぞって決めてください" : "水が見つかりませんでした。なぞって決めてください");
}
$("#edAutoSky").onclick = () => edAuto("sky");
$("#edAutoWater").onclick = () => edAuto("water");
function edStopPlay() {
  cancelAnimationFrame(ed.playRaf);
  ed.playRaf = 0;
  $("#edPlay").textContent = "▶ 動きを見る";
}
$("#edPlay").onclick = () => {
  if (ed.playRaf) {
    edStopPlay();
    return edDraw();
  }
  ed.t0 = performance.now();
  $("#edPlay").textContent = "■ なぞる画面にもどる";
  const tick = () => {
    const s = slides[ed.i];
    const fx = fxOf(ed.i);
    if (prepareMotion(s, fx)) edDraw(motionR.render(s, (performance.now() - ed.t0) / 1000, fx.speed));
    else edDraw(s.img);
    ed.playRaf = requestAnimationFrame(tick);
  };
  tick();
};

// ---------- お願い ----------
const EXAMPLES = ["桜が舞って夕焼けっぽく、ゆっくり近づいて", "雪が降る静かな夜", "誕生日のお祝い!紙吹雪いっぱい", "昔の思い出みたいにフィルム風", "星空と流れ星", "光が差して夢のようにふんわり", "花火が上がる夏の夜", "雨がしとしと降るエモい感じ"];
function renderWish() {
  const fx = parseWish(opt.wish);
  const items = describe(fx, { particles: PARTICLES, grades: GRADES });
  $("#wishChips").innerHTML = items.map((x) => `<span class="chip">${esc(x)}</span>`).join("");
  const notes = [];
  if (opt.wish.trim() && !items.length && !fx.cannot) notes.push("読み取れる言葉がありませんでした。下の例を押すか、「桜」「雪」「夕焼け」「近づいて」などの言葉を入れてみてください。");
  const needPaint = fx.regions.filter((r) => r.area === "paint");
  if (needPaint.length) notes.push(`🖌 「${needPaint.map((r) => r.label).join("・")}」は、写真の横の「🖌 動かす場所をなぞる」で、動かしたい所をなぞってください。`);
  if (fx.regions.some((r) => r.area !== "paint")) notes.push("☁️ 空・水は自動でさがして動かします(うまくいかない時は、なぞって直せます)。");
  if (!motionR.ok && fx.regions.length) notes.push("⚠️ このブラウザは写真の一部を動かす機能(WebGL2)に対応していません。Chrome か Edge を使ってください。");
  if (fx.cannot) notes.push("🙇 写真の中の人や動物の体を動かす(まばたき・口・歩く など)は、写真を描き直すAIが必要なため、このアプリではできません。そのぶん、まわりの雰囲気でかなえます。");
  $("#wishNote").textContent = notes.join(" ");
}
$("#wish").addEventListener("input", (e) => {
  opt.wish = e.target.value;
  renderWish();
  if (!playing) drawFrame(currentT);
});
$("#wishExamples").innerHTML = EXAMPLES.map((x) => `<button class="btn small" type="button">${esc(x)}</button>`).join("");
$("#wishExamples").onclick = (e) => {
  if (e.target.tagName !== "BUTTON") return;
  $("#wish").value = opt.wish = e.target.textContent;
  renderWish();
  if (!playing) drawFrame(currentT);
};

// ---------- 起動 ----------
resize();
$("#durVal").textContent = `${opt.dur} 秒`;
$("#volVal").textContent = `${Math.round(opt.vol * 100)}%`;
renderWish();
drawFrame(0);
updateTime();
