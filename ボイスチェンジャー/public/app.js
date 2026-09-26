// ナチュラルボイスチェンジャー — 画面の処理(声の変換そのものは voice-processor.js)

// なりたい声のプリセット。target は変換後の声の高さ(Hz)、formant は響きの倍率
const PRESETS = [
  { id: "girl", e: "🎀", name: "女の子", desc: "明るくかわいい10〜20代の声", target: 250, formant: 1.2, bright: 4, lowcut: 180 },
  { id: "sister", e: "💄", name: "お姉さん", desc: "落ち着いた大人の女性の声", target: 205, formant: 1.14, bright: 3, lowcut: 150 },
  { id: "boy", e: "✨", name: "美少年", desc: "澄んだ中性的な少年の声", target: 175, formant: 1.1, bright: 3, lowcut: 130 },
  { id: "ryosei", e: "🌗", name: "両声類(中性)", desc: "男女どちらにも聞こえる声", target: 160, formant: 1.07, bright: 2, lowcut: 110 },
  { id: "shota", e: "🧢", name: "ショタ", desc: "元気な小学生くらいの男の子", target: 260, formant: 1.24, bright: 4, lowcut: 180 },
  { id: "ikevo", e: "🎩", name: "低音イケボ", desc: "今より低く太い大人の男性の声", target: 0.85, formant: 0.94, bright: -1, lowcut: 50, relative: true },
];

const KEY = "voice-changer:v1";
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
})();
const state = { f0: saved.f0 || 0, preset: saved.preset || "girl", pitch: 0, formant: 1, bright: 0, lowcut: 80 };
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ f0: state.f0, preset: state.preset, custom: { pitch: state.pitch, formant: state.formant, bright: state.bright, lowcut: state.lowcut } }));
  } catch {}
};

const $ = (s) => document.querySelector(s);
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
const myF0 = () => state.f0 || 110;
const semis = (ratio) => 12 * Math.log2(ratio);

// ---------- 1. 声の高さを測る ----------
// 正規化自己相関で基本周波数を出す。はっきりした周期がない(無声音・無音)ときは null
function detectF0(buf, sr) {
  let rms = 0;
  for (const v of buf) rms += v * v;
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return null;
  const W = Math.floor(buf.length / 2);
  const minLag = Math.floor(sr / 400);
  const maxLag = Math.min(W, Math.floor(sr / 60));
  const r = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, a = 0, b = 0;
    for (let i = 0; i < W; i++) {
      s += buf[i] * buf[i + lag];
      a += buf[i] * buf[i];
      b += buf[i + lag] * buf[i + lag];
    }
    r[lag] = s / Math.sqrt(a * b + 1e-12);
  }
  let mx = 0;
  for (let l = minLag; l <= maxLag; l++) mx = Math.max(mx, r[l]);
  if (mx < 0.75) return null;
  for (let l = minLag + 1; l < maxLag; l++) {
    if (r[l] > 0.9 * mx && r[l] >= r[l - 1] && r[l] >= r[l + 1]) return sr / l;
  }
  return null;
}

async function measure() {
  const btn = $("#measure");
  btn.disabled = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
  } catch {
    btn.disabled = false;
    return toast("マイクを使えません。ブラウザのマイク許可を確認してください");
  }
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  an.fftSize = 4096;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  const found = [];
  const start = performance.now();
  btn.textContent = "🎤 話してください…";
  await new Promise((done) => {
    const tick = () => {
      const t = performance.now() - start;
      $("#measureBar").style.width = `${Math.min(100, t / 50)}%`;
      an.getFloatTimeDomainData(buf);
      const f = detectF0(buf, ctx.sampleRate);
      if (f) found.push(f);
      t < 5000 ? setTimeout(tick, 60) : done();
    };
    tick();
  });
  stream.getTracks().forEach((t) => t.stop());
  ctx.close();
  btn.disabled = false;
  btn.textContent = "🎤 もう一度測る";
  if (found.length < 10) return toast("声がうまく拾えませんでした。マイクに近づいてもう一度お試しください");
  found.sort((a, b) => a - b);
  state.f0 = Math.round(found[Math.floor(found.length / 2)]);
  persist();
  applyPreset(state.preset);
  showF0();
}

function showF0() {
  const f = state.f0;
  const kind = !f ? "" : f < 130 ? "(低めの男性の声)" : f < 165 ? "(男性〜中性的な声)" : f < 210 ? "(中性〜女性の低めの声)" : "(女性の声の高さ)";
  $("#myF0").textContent = f ? `あなたの声:約 ${f}Hz ${kind}` : "未測定(男性の平均 110Hz として計算します)";
}

// ---------- 2. プリセットと調整 ----------
function applyPreset(id) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  state.preset = p.id;
  const ratio = p.relative ? p.target : p.target / myF0();
  state.pitch = Math.round(semis(ratio) * 2) / 2;
  state.formant = p.formant;
  state.bright = p.bright;
  state.lowcut = p.lowcut;
  persist();
  renderControls();
  pushParams();
}

function renderPresets() {
  $("#presets").innerHTML = PRESETS.map(
    (p) => `<button class="preset ${p.id === state.preset ? "active" : ""}" data-id="${p.id}"><span class="e">${p.e}</span><b>${p.name}</b><small>${p.desc}</small></button>`,
  ).join("");
  document.querySelectorAll(".preset").forEach((b) => (b.onclick = () => applyPreset(b.dataset.id)));
}

function renderControls() {
  renderPresets();
  $("#pitch").value = state.pitch;
  $("#formant").value = state.formant;
  $("#bright").value = state.bright;
  $("#lowcut").value = state.lowcut;
  const after = Math.round(myF0() * 2 ** (state.pitch / 12));
  $("#pitchVal").textContent = `${state.pitch > 0 ? "+" : ""}${state.pitch} 半音(約 ${after}Hz に)`;
  $("#formantVal").textContent = `${state.formant.toFixed(2)} 倍`;
  $("#brightVal").textContent = `${state.bright > 0 ? "+" : ""}${state.bright} dB`;
  $("#lowcutVal").textContent = `${state.lowcut} Hz 以下`;
}

for (const id of ["pitch", "formant", "bright", "lowcut"]) {
  $(`#${id}`).addEventListener("input", (e) => {
    state[id] = Number(e.target.value);
    state.preset = "custom";
    persist();
    renderControls();
    pushParams();
  });
}

// ---------- 音の流れ: 入力 → 声の変換 → 低音カット → 明るさ → 出力 ----------
function buildChain(ctx, source) {
  const vc = new AudioWorkletNode(ctx, "voice-processor", {
    processorOptions: { pitch: 2 ** (state.pitch / 12), formant: state.formant },
  });
  const hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: state.lowcut, Q: 0.7 });
  const shelf = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 3500, gain: state.bright });
  source.connect(vc).connect(hp).connect(shelf);
  return { vc, hp, shelf, out: shelf };
}

let live = null; // リアルタイム変換中の音の流れ

function pushParams() {
  if (!live) return;
  live.vc.port.postMessage({ pitch: 2 ** (state.pitch / 12), formant: state.formant });
  live.hp.frequency.value = state.lowcut;
  live.shelf.gain.value = state.bright;
}

// ---------- 3a. リアルタイム ----------
async function startLive() {
  if (live) return stopLive();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
    });
  } catch {
    return toast("マイクを使えません。ブラウザのマイク許可を確認してください");
  }
  const ctx = new AudioContext({ latencyHint: "interactive" });
  await ctx.audioWorklet.addModule("/voice-processor.js");
  const chain = buildChain(ctx, ctx.createMediaStreamSource(stream));
  const recDest = ctx.createMediaStreamDestination();
  chain.out.connect(ctx.destination);
  chain.out.connect(recDest);
  live = { ctx, stream, recDest, ...chain };
  if ($("#sink").value) await ctx.setSinkId?.($("#sink").value).catch(() => {});
  $("#liveStart").textContent = "■ 変換ストップ";
  $("#compare").disabled = false;
  $("#rec").disabled = false;
  toast("変換中です。ヘッドホンで自分の声を確認してください");
}

function stopLive() {
  if (!live) return;
  if (live.recorder?.state === "recording") live.recorder.stop();
  live.stream.getTracks().forEach((t) => t.stop());
  live.ctx.close();
  live = null;
  $("#liveStart").textContent = "▶ 変換スタート";
  for (const id of ["compare", "rec"]) $(`#${id}`).disabled = true;
  $("#compare").classList.remove("on");
  $("#rec").classList.remove("rec-on");
  $("#rec").textContent = "⏺ 録音";
}

$("#liveStart").onclick = startLive;
$("#compare").onclick = () => {
  if (!live) return;
  const on = !$("#compare").classList.contains("on");
  $("#compare").classList.toggle("on", on);
  $("#compare").textContent = on ? "🔁 元の声を再生中(押すと戻る)" : "🔁 元の声と聞きくらべ";
  live.vc.port.postMessage({ bypass: on });
};

$("#rec").onclick = () => {
  if (!live) return;
  if (live.recorder?.state === "recording") return live.recorder.stop();
  const chunks = [];
  const rec = new MediaRecorder(live.recDest.stream);
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    addClip("#recs", new Blob(chunks, { type: rec.mimeType }), "変換した声の録音", ext(rec.mimeType));
    $("#rec").classList.remove("rec-on");
    $("#rec").textContent = "⏺ 録音";
  };
  rec.start();
  live.recorder = rec;
  $("#rec").classList.add("rec-on");
  $("#rec").textContent = "■ 録音を止める";
};

const ext = (mime) => (mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm");

// 出力先(仮想オーディオケーブルなど)を選べるブラウザだけ表示
async function listSinks() {
  if (!("setSinkId" in AudioContext.prototype)) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outs = devices.filter((d) => d.kind === "audiooutput");
    if (!outs.length) return;
    $("#sink").innerHTML = outs.map((d, i) => `<option value="${d.deviceId}">${d.label || `出力 ${i + 1}`}</option>`).join("");
    $("#sinkWrap").hidden = false;
    $("#sink").onchange = () => live?.ctx.setSinkId($("#sink").value).catch(() => toast("出力先を変更できませんでした"));
  } catch {}
}

// ---------- 3b. 録音・ファイルを変換 ----------
let sourceBuffer = null;
let rawRecorder = null;

$("#rawRec").onclick = async () => {
  if (rawRecorder?.state === "recording") return rawRecorder.stop();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
  } catch {
    return toast("マイクを使えません");
  }
  const chunks = [];
  rawRecorder = new MediaRecorder(stream);
  rawRecorder.ondataavailable = (e) => chunks.push(e.data);
  rawRecorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    $("#rawRec").textContent = "⏺ 地声を録音する";
    $("#rawRec").classList.remove("rec-on");
    await loadSource(new Blob(chunks), "録音した地声");
  };
  rawRecorder.start();
  $("#rawRec").textContent = "■ 録音を止める";
  $("#rawRec").classList.add("rec-on");
};

$("#file").onchange = (e) => {
  const f = e.target.files[0];
  if (f) loadSource(f, f.name);
};

async function loadSource(blob, label) {
  try {
    const ctx = new AudioContext();
    sourceBuffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    $("#fileName").textContent = `🎧 ${label}(${sourceBuffer.duration.toFixed(1)}秒)`;
    $("#convert").disabled = false;
  } catch {
    toast("この音声ファイルは読み込めませんでした");
  }
}

$("#convert").onclick = async () => {
  if (!sourceBuffer) return;
  const btn = $("#convert");
  btn.disabled = true;
  btn.textContent = "変換中…";
  try {
    const wav = encodeWav(await renderOffline(sourceBuffer));
    const p = PRESETS.find((x) => x.id === state.preset);
    addClip("#fileOut", wav, `変換結果(${p ? p.name : "カスタム"})`, "wav");
  } catch (err) {
    console.error(err);
    toast("変換に失敗しました");
  }
  btn.disabled = false;
  btn.textContent = "✨ 今の設定で変換";
};

// 変換処理の遅れ(1536サンプル)ぶん長めに作って先頭を切る
const LATENCY = 1536;
async function renderOffline(buf) {
  const sr = buf.sampleRate;
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) buf.getChannelData(c).forEach((v, i) => (mono[i] += v / buf.numberOfChannels));
  const ctx = new OfflineAudioContext(1, buf.length + LATENCY + sr, sr);
  await ctx.audioWorklet.addModule("/voice-processor.js");
  const inBuf = ctx.createBuffer(1, buf.length, sr);
  inBuf.copyToChannel(mono, 0);
  const src = new AudioBufferSourceNode(ctx, { buffer: inBuf });
  buildChain(ctx, src).out.connect(ctx.destination);
  src.start();
  const out = (await ctx.startRendering()).getChannelData(0).slice(LATENCY, LATENCY + buf.length);
  // 音割れしないよう最大音量を -1dB にそろえる
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) {
    const g = 0.89 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  return { data: out, sampleRate: sr };
}

function encodeWav({ data, sampleRate }) {
  const buf = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + data.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

function addClip(target, blob, label, extension) {
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).replaceAll(":", "");
  const el = document.createElement("div");
  el.className = "clip";
  el.innerHTML = `<span>${label}</span><audio controls src="${url}"></audio><a href="${url}" download="voice-${stamp}.${extension}">保存</a>`;
  $(target).prepend(el);
}

// ---------- タブ ----------
document.querySelectorAll(".tab").forEach(
  (t) =>
    (t.onclick = () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
      $("#pane-live").hidden = t.dataset.tab !== "live";
      $("#pane-file").hidden = t.dataset.tab !== "file";
    }),
);

// ---------- 起動 ----------
$("#measure").onclick = measure;
showF0();
if (state.preset === "custom" && saved.custom) {
  Object.assign(state, saved.custom);
  renderControls();
} else {
  applyPreset(state.preset);
}
listSinks();
