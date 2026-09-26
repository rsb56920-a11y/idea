// ナチュラルボイスチェンジャー — 画面の処理
//   リアルタイム: voice-processor.js(AudioWorklet)
//   ファイル(高品質): hq-engine.js(Web Worker で作り直し合成)
//   あなた専用の設定: voice-analysis.js(声の高さ・抑揚の幅・声道の長さを測る)
import { detectF0, profileVoice } from "./voice-analysis.js";

// なりたい声のプリセット。
//   target: 変換後の声の高さ(Hz)  formant: 平均的な男性の声から見た響きの倍率
//   range: その声らしい抑揚の幅(半音の標準偏差)  breath: 息っぽさ
const PRESETS = [
  { id: "girl", e: "🎀", name: "女の子", desc: "明るくかわいい10〜20代の声", target: 250, formant: 1.2, range: 3.0, breath: 0.35, soft: 3, bright: 3, lowcut: 180 },
  { id: "sister", e: "💄", name: "お姉さん", desc: "落ち着いた大人の女性の声", target: 205, formant: 1.14, range: 2.6, breath: 0.3, soft: 2.5, bright: 2, lowcut: 150 },
  { id: "boy", e: "✨", name: "美少年", desc: "澄んだ中性的な少年の声", target: 175, formant: 1.1, range: 2.4, breath: 0.2, soft: 1.5, bright: 2, lowcut: 130 },
  { id: "ryosei", e: "🌗", name: "両声類(中性)", desc: "男女どちらにも聞こえる声", target: 160, formant: 1.07, range: 2.6, breath: 0.2, soft: 1.5, bright: 1, lowcut: 110 },
  { id: "shota", e: "🧢", name: "ショタ", desc: "元気な小学生くらいの男の子", target: 260, formant: 1.24, range: 3.2, breath: 0.25, soft: 3, bright: 3, lowcut: 180 },
  { id: "ikevo", e: "🎩", name: "低音イケボ", desc: "今より低く太い大人の男性の声", target: 0.85, formant: 0.94, range: 2.0, breath: 0.05, soft: 0, bright: -1, lowcut: 50, relative: true },
];
// 声道の長さの基準(平均的な男性を測った時の値)。この測り方での基準値
const REF_TRACT = 16.5;

const KEY = "voice-changer:v1";
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
})();
const state = {
  f0: saved.f0 || 0,
  range: saved.range || 0, // あなたの抑揚の幅
  tract: saved.tract || 0, // あなたの声道の長さ(cm)
  preset: saved.preset || "girl",
  pitch: 0,
  formant: 1,
  bright: 0,
  lowcut: 80,
  breath: 0,
  inton: 1,
  soft: 0,
  gate: saved.gate ?? -55,
  keepConsonants: saved.keepConsonants ?? true,
  mine: saved.mine || [], // マイ設定 [{ name, pitch, formant, ... }]
};
const CUSTOM_KEYS = ["pitch", "formant", "bright", "lowcut", "breath", "inton", "soft"];
const persist = () => {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        f0: state.f0,
        range: state.range,
        tract: state.tract,
        preset: state.preset,
        gate: state.gate,
        keepConsonants: state.keepConsonants,
        mine: state.mine,
        custom: Object.fromEntries(CUSTOM_KEYS.map((k) => [k, state[k]])),
      }),
    );
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

// ---------- 1. あなたの声を測る ----------
// 6秒ぶん録音して、声の高さ・抑揚の幅・声道の長さを出す
async function measure() {
  const btn = $("#measure");
  btn.disabled = true;
  let stream;
  try {
    // 測定の時は雑音除去もオフ(声の響きの形が変わってしまうため)
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    btn.disabled = false;
    return toast("マイクを使えません。ブラウザのマイク許可を確認してください");
  }
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule("./capture-processor.js");
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  src.connect(an);
  // 圧縮しない生の音を集める
  const cap = new AudioWorkletNode(ctx, "capture-processor");
  const chunks = [];
  cap.port.onmessage = (e) => chunks.push(e.data);
  src.connect(cap);
  const buf = new Float32Array(an.fftSize);
  const start = performance.now();
  btn.textContent = "🎤 話してください…";
  await new Promise((done) => {
    const tick = () => {
      const t = performance.now() - start;
      $("#measureBar").style.width = `${Math.min(100, t / 60)}%`;
      an.getFloatTimeDomainData(buf);
      const f = detectF0(buf, ctx.sampleRate);
      if (f) $("#liveF0").textContent = `いまの声:${Math.round(f)}Hz`;
      t < 6000 ? setTimeout(tick, 80) : done();
    };
    tick();
  });
  src.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  btn.textContent = "🎤 もう一度測る";
  $("#liveF0").textContent = "分析中…";
  let prof = null;
  try {
    const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.length;
    }
    prof = profileVoice(all, ctx.sampleRate);
  } catch {}
  ctx.close();
  btn.disabled = false;
  $("#liveF0").textContent = "";
  if (!prof) return toast("声がうまく拾えませんでした。マイクに近づいてもう一度お試しください");
  state.f0 = prof.f0;
  state.range = prof.range;
  state.tract = prof.tract || 0;
  persist();
  applyPreset(state.preset === "custom" ? "girl" : state.preset);
  showF0();
  toast("あなた専用の設定を作りました");
}

function showF0() {
  const f = state.f0;
  if (!f) {
    $("#myF0").innerHTML = "未測定(男性の平均 110Hz として計算します)";
    return;
  }
  const kind = f < 130 ? "低めの男性の声" : f < 165 ? "男性〜中性的な声" : f < 210 ? "中性〜女性の低めの声" : "女性の声の高さ";
  $("#myF0").innerHTML = `<div class="prof">
    <div><small>声の高さ</small><b>${f}Hz</b><span>${kind}</span></div>
    <div><small>抑揚の幅</small><b>${state.range ? `${state.range}半音` : "—"}</b><span>${!state.range ? "" : state.range < 1.8 ? "落ち着いた話し方" : state.range < 3 ? "ふつう" : "表情ゆたか"}</span></div>
    <div><small>声道の長さ(推定)</small><b>${state.tract ? `${state.tract}cm` : "—"}</b><span>${state.tract ? "のどから唇まで" : "測れませんでした"}</span></div>
  </div>`;
}

// ---------- 2. プリセットと調整 ----------
function applyPreset(id) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  state.preset = p.id;
  const ratio = p.relative ? p.target : p.target / myF0();
  state.pitch = Math.round(semis(ratio) * 2) / 2;
  // あなた専用: 声道がもともと短めの人は響きを少なめに、長めの人は多めに動かす(測定のぶれを考えて ±8% まで)
  const tractAdj = state.tract ? Math.min(1.08, Math.max(0.92, state.tract / REF_TRACT)) : 1;
  state.formant = Math.round(p.formant * tractAdj * 100) / 100;
  // あなた専用: 抑揚が小さめの人は、その声らしい幅まで広げる
  state.inton = state.range >= 0.8 ? Math.round(Math.min(1.4, Math.max(0.9, p.range / state.range)) * 20) / 20 : p.relative ? 1 : 1.15;
  state.breath = p.breath;
  state.soft = p.soft;
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
  renderMine();
}

// ---------- マイ設定(自分で調整した設定を名前をつけて保存) ----------
const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function renderMine() {
  $("#mine").innerHTML =
    state.mine
      .map(
        (m, i) =>
          `<span class="mine ${state.preset === `mine:${i}` ? "active" : ""}"><button data-i="${i}">⭐ ${escHtml(m.name)}</button><button class="del" data-del="${i}" aria-label="削除">×</button></span>`,
      )
      .join("") + `<button class="btn small" id="saveMine">＋ 今の設定を保存</button>`;
  $("#mine").querySelectorAll("[data-i]").forEach(
    (b) =>
      (b.onclick = () => {
        const m = state.mine[Number(b.dataset.i)];
        for (const k of CUSTOM_KEYS) if (m[k] != null) state[k] = m[k];
        state.preset = `mine:${b.dataset.i}`;
        persist();
        renderControls();
        pushParams();
      }),
  );
  $("#mine").querySelectorAll("[data-del]").forEach(
    (b) =>
      (b.onclick = () => {
        const i = Number(b.dataset.del);
        if (!confirm(`「${state.mine[i].name}」を削除しますか？`)) return;
        state.mine.splice(i, 1);
        if (state.preset.startsWith("mine:")) state.preset = "custom";
        persist();
        renderControls();
      }),
  );
  $("#saveMine").onclick = () => {
    const name = prompt("この設定の名前(例:配信用の女の子)", "")?.trim().slice(0, 20);
    if (!name) return;
    state.mine.push({ name, ...Object.fromEntries(CUSTOM_KEYS.map((k) => [k, state[k]])) });
    state.preset = `mine:${state.mine.length - 1}`;
    persist();
    renderControls();
    toast(`「${name}」を保存しました`);
  };
}

function renderControls() {
  renderPresets();
  $("#pitch").value = state.pitch;
  $("#formant").value = state.formant;
  $("#bright").value = state.bright;
  $("#lowcut").value = state.lowcut;
  $("#breath").value = state.breath;
  $("#soft").value = state.soft;
  $("#inton").value = state.inton;
  $("#gate").value = state.gate;
  $("#keepConsonants").checked = state.keepConsonants;
  const after = Math.round(myF0() * 2 ** (state.pitch / 12));
  $("#pitchVal").textContent = `${state.pitch > 0 ? "+" : ""}${state.pitch} 半音(約 ${after}Hz に)`;
  $("#formantVal").textContent = `${state.formant.toFixed(2)} 倍`;
  $("#brightVal").textContent = `${state.bright > 0 ? "+" : ""}${state.bright} dB`;
  $("#lowcutVal").textContent = `${state.lowcut} Hz 以下`;
  $("#breathVal").textContent = `${Math.round(state.breath * 100)}%`;
  $("#softVal").textContent = `+${state.soft} dB`;
  $("#intonVal").textContent = `${state.inton.toFixed(2)} 倍`;
}

for (const id of ["pitch", "formant", "bright", "lowcut", "breath", "inton", "soft"]) {
  $(`#${id}`).addEventListener("input", (e) => {
    state[id] = Number(e.target.value);
    state.preset = "custom";
    persist();
    renderControls();
    pushParams();
  });
}

$("#gate").onchange = (e) => {
  state.gate = Number(e.target.value);
  persist();
  pushParams();
};
$("#keepConsonants").onchange = (e) => {
  state.keepConsonants = e.target.checked;
  persist();
  pushParams();
};

// 変換に渡す設定
const vcParams = () => ({
  pitch: 2 ** (state.pitch / 12),
  formant: state.formant,
  breath: state.breath,
  inton: state.inton,
  gateDb: state.gate,
  keepConsonants: state.keepConsonants,
  baseF0: state.f0 || 0,
  soft: state.soft,
});

// ---------- 音の流れ: 入力 → 声の変換 → 低音カット → 明るさ → 出力 ----------
function buildChain(ctx, source) {
  const vc = new AudioWorkletNode(ctx, "voice-processor", { processorOptions: vcParams() });
  const hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: state.lowcut, Q: 0.7 });
  const shelf = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 3500, gain: state.bright });
  source.connect(vc).connect(hp).connect(shelf);
  return { vc, hp, shelf, out: shelf };
}

let live = null; // リアルタイム変換中の音の流れ

function pushParams() {
  if (!live) return;
  live.vc.port.postMessage(vcParams());
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
  await ctx.audioWorklet.addModule("./voice-processor.js");
  const chain = buildChain(ctx, ctx.createMediaStreamSource(stream));
  const recDest = ctx.createMediaStreamDestination();
  chain.out.connect(ctx.destination);
  chain.out.connect(recDest);
  live = { ctx, stream, recDest, ...chain };
  if ($("#sink").value) await ctx.setSinkId?.($("#sink").value).catch(() => {});
  // モニター: 変換した声を、別の出力先(ヘッドホン)でも鳴らす。配信で CABLE に送りながら自分でも聞ける
  live.monitor = new Audio();
  live.monitor.srcObject = recDest.stream;
  updateMonitor();
  if (!$("#sink").options.length || !$("#sink").options[0].textContent.trim() || $("#sink").options[0].textContent.startsWith("出力")) listSinks();
  $("#liveStart").textContent = "■ 変換ストップ";
  $("#compare").disabled = false;
  $("#rec").disabled = false;
  toast("変換中です。ヘッドホンで自分の声を確認してください");
}

async function updateMonitor() {
  if (!live?.monitor) return;
  if ($("#monitor").checked) {
    if ($("#monSink").value) await live.monitor.setSinkId?.($("#monSink").value).catch(() => {});
    live.monitor.play().catch(() => {});
  } else {
    live.monitor.pause();
  }
}
$("#monitor").onchange = updateMonitor;
$("#monSink").onchange = updateMonitor;

function stopLive() {
  if (!live) return;
  live.monitor?.pause();
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
    const opts = outs.map((d, i) => `<option value="${d.deviceId}">${d.label || `出力 ${i + 1}`}</option>`).join("");
    $("#sink").innerHTML = opts;
    $("#monSink").innerHTML = opts;
    $("#sinkWrap").hidden = false;
    $("#monWrap").hidden = false;
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
    $("#convertBoth").disabled = false;
  } catch {
    toast("この音声ファイルは読み込めませんでした");
  }
}

const settingName = () =>
  PRESETS.find((x) => x.id === state.preset)?.name ||
  (state.preset.startsWith("mine:") ? state.mine[Number(state.preset.slice(5))]?.name : null) ||
  "カスタム";

async function convertWith(engines, btn, label) {
  if (!sourceBuffer) return;
  btn.disabled = true;
  try {
    for (const eng of engines) {
      const name = eng === "hq" ? "高品質" : "リアルタイム方式";
      btn.textContent = `${name}で変換中…`;
      const wav = encodeWav(await renderOffline(sourceBuffer, (pr) => (btn.textContent = `${name}で変換中… ${Math.round(pr * 100)}%`), eng));
      addClip("#fileOut", wav, `${settingName()}・${name}`, "wav");
    }
  } catch (err) {
    console.error(err);
    toast("変換に失敗しました");
  }
  btn.disabled = false;
  btn.textContent = label;
}
$("#convert").onclick = () => convertWith([$("#engine").value], $("#convert"), "✨ 今の設定で変換");
// 同じ録音を両方の方式で変換して並べる(自分の声でどちらが自然か聞きくらべる)
$("#convertBoth").onclick = () => convertWith(["rt", "hq"], $("#convertBoth"), "🎧 両方の方式で変換して聞きくらべ");

// 高品質エンジンを別スレッドで動かす
function runHQ(mono, sr, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker("./hq-worker.js", { type: "module" });
    w.onmessage = (e) => {
      if (e.data.progress != null) onProgress(e.data.progress);
      if (e.data.done) {
        w.terminate();
        resolve(e.data.done);
      }
      if (e.data.error) {
        w.terminate();
        reject(new Error(e.data.error));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(e);
    };
    const p = vcParams();
    w.postMessage({ data: mono, sampleRate: sr, opts: { pitch: p.pitch, formant: p.formant, inton: p.inton, breath: p.breath, baseF0: p.baseF0, soft: p.soft } });
  });
}

// 変換処理の遅れ(1536サンプル)ぶん長めに作って先頭を切る
const LATENCY = 1536;
async function renderOffline(buf, onProgress = () => {}, engine = $("#engine").value) {
  const sr = buf.sampleRate;
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) buf.getChannelData(c).forEach((v, i) => (mono[i] += v / buf.numberOfChannels));
  const hq = engine === "hq";
  const input = hq ? await runHQ(mono, sr, onProgress) : mono;
  const ctx = new OfflineAudioContext(1, buf.length + LATENCY + sr, sr);
  const inBuf = ctx.createBuffer(1, buf.length, sr);
  inBuf.copyToChannel(input, 0);
  const src = new AudioBufferSourceNode(ctx, { buffer: inBuf });
  if (hq) {
    // 高品質エンジンの後ろには、低音カットと明るさだけを掛ける
    const hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: state.lowcut, Q: 0.7 });
    const shelf = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 3500, gain: state.bright });
    src.connect(hp).connect(shelf).connect(ctx.destination);
  } else {
    await ctx.audioWorklet.addModule("./voice-processor.js");
    buildChain(ctx, src).out.connect(ctx.destination);
  }
  src.start();
  const skip = hq ? 0 : LATENCY;
  const out = (await ctx.startRendering()).getChannelData(0).slice(skip, skip + buf.length);
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
// マイクは https か localhost のページでしか使えない(スマホで開く時は https で公開したページを使う)
if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  document.querySelector("header").insertAdjacentHTML(
    "beforeend",
    `<p class="warn">⚠️ このページではマイクが使えません。パソコンでは http://localhost で、スマホでは https で公開したページ(GitHub Pages など)で開いてください。</p>`,
  );
}
$("#measure").onclick = measure;
showF0();
if ((state.preset === "custom" || state.preset.startsWith("mine:")) && saved.custom) {
  Object.assign(state, saved.custom);
  state.breath ??= 0;
  state.soft ??= 0;
  state.inton ??= 1;
  renderControls();
} else {
  applyPreset(state.preset);
}
listSinks();
