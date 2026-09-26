// 作り直しエンジン(resynth-processor.js)の自動チェック。
//   node ボイスチェンジャー_コエカワ/tools/check-engine.mjs
// 80〜200Hz の合成母音(あ・い・う・え・お)と、低い「ゴー」という雑音入りの声で、
// エンジンが読み取る声の高さが正しいか(1オクターブの読み違い・ロックインがないか)を確かめる。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const SR = 48000;
const file = fileURLToPath(new URL("../public/resynth-processor.js", import.meta.url));
const VOWELS = [[700, 1200, 2600], [300, 2200, 3000], [350, 1300, 2400], [500, 1900, 2600], [500, 850, 2500]];
const res = (s, fc, bw) => { const r = Math.exp(-Math.PI * bw / SR), a1 = 2 * r * Math.cos(2 * Math.PI * fc / SR), a2 = -r * r; const o = new Float64Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s[i] + a1 * (o[i - 1] || 0) + a2 * (o[i - 2] || 0); return o; };
let seed = 1; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
function voice(f0, noiseDb) {
  const seg = Math.floor(SR * 0.6), out = [];
  for (const v of VOWELS) { let s = new Float64Array(seg); let ph = 0; for (let i = 0; i < seg; i++) { ph += f0 * (1 + 0.03 * Math.sin(2 * Math.PI * 0.7 * i / SR)) / SR; if (ph >= 1) { ph -= 1; s[i] = 1; } }
    for (let j = 0; j < 3; j++) s = res(s, v[j], 90 + 30 * j); out.push(...s); }
  const x = Float64Array.from(out); let m = 0; for (const q of x) m = Math.max(m, Math.abs(q)); for (let i = 0; i < x.length; i++) x[i] = (x[i] / m) * 0.4;
  if (noiseDb != null) { let px = 0; for (const q of x) px += q * q; px /= x.length; const n = new Float64Array(x.length); let lp = 0, pn = 0; for (let i = 0; i < n.length; i++) { lp = 0.97 * lp + 0.03 * rnd(); n[i] = lp * 3 + rnd() * 0.3; pn += n[i] ** 2; } pn /= n.length; const g = Math.sqrt(px / pn / 10 ** (noiseDb / 10)); for (let i = 0; i < x.length; i++) x[i] += n[i] * g; }
  return x;
}
function run(x, f0) {
  let Proc; globalThis.sampleRate = SR; globalThis.AudioWorkletProcessor = class { constructor() { this.port = {}; } }; globalThis.registerProcessor = (n, c) => (Proc = c);
  eval(readFileSync(file, "utf8"));
  const p = new Proc({ processorOptions: { pitch: 2, formant: 1.2 } });
  let ok = 0, oct = 0, unv = 0, n = 0; const orig = p.step.bind(p);
  p.step = (c) => { orig(c); const pos = (c % (SR * 0.6)) / (SR * 0.6); if (pos < 0.15 || pos > 0.85) return; n++;
    const truth = f0 * (1 + 0.03 * Math.sin(2 * Math.PI * 0.7 * (c % (SR * 0.6)) / SR));
    if (!p.f0Cur) unv++; else { const e = Math.abs(1200 * Math.log2(p.f0Cur / truth)); if (e < 50) ok++; else if (Math.abs(e - 1200) < 100) oct++; } };
  for (let i = 0; i < x.length; i += 128) { const inp = Float32Array.from(x.subarray(i, i + 128)); p.process([[inp]], [[new Float32Array(inp.length)]]); }
  return { ok: ok / n, oct: oct / n, unv: unv / n };
}
let fail = 0;
for (const [f0, nz, minOk] of [[80, null, 0.95], [100, null, 0.95], [115, null, 0.95], [130, null, 0.95], [150, null, 0.95], [175, null, 0.95], [200, null, 0.95], [100, 20, 0.9], [130, 20, 0.9], [100, 10, 0.6]]) {
  const r = run(voice(f0, nz), f0);
  const good = r.ok >= minOk && r.oct < 0.03;
  if (!good) fail++;
  console.log(`${good ? "OK " : "NG "} ${f0}Hz${nz != null ? ` 雑音SN比${nz}dB` : ""}: 正しい ${(r.ok * 100).toFixed(0)}% / 1オクターブ違い ${(r.oct * 100).toFixed(1)}% / 無声 ${(r.unv * 100).toFixed(0)}%`);
}
// サイレン: 「あ〜↗↘」と高さを大きく速く上げ下げしても、高さが遅れずについていくか(90→300Hz を0.8秒で往復)
{
  const n = Math.floor(SR * 2.4), f = new Float64Array(n);
  for (let i = 0; i < n; i++) { const u = (i / (SR * 0.8)) % 1; f[i] = 90 * (300 / 90) ** (0.5 - 0.5 * Math.cos(2 * Math.PI * u)); }
  let s = new Float64Array(n), ph = 0; for (let i = 0; i < n; i++) { ph += f[i] / SR; if (ph >= 1) { ph -= 1; s[i] = 1; } }
  for (let j = 0; j < 3; j++) s = res(s, VOWELS[0][j], 90 + 30 * j); let m = 0; for (const q of s) m = Math.max(m, Math.abs(q)); for (let i = 0; i < n; i++) s[i] = (s[i] / m) * 0.4;
  let Proc; globalThis.sampleRate = SR; globalThis.AudioWorkletProcessor = class { constructor() { this.port = {}; } }; globalThis.registerProcessor = (nm, c) => (Proc = c);
  eval(readFileSync(file, "utf8")); const p = new Proc({ processorOptions: { pitch: 2, formant: 1.2 } });
  let ok = 0, cnt = 0; const orig = p.step.bind(p);
  p.step = (c) => { orig(c); if (c < SR * 0.1 || c >= n) return; cnt++; if (p.f0Cur && Math.abs(1200 * Math.log2(p.f0Cur / f[c])) < 50) ok++; };
  for (let i = 0; i < n; i += 128) { const inp = Float32Array.from(s.subarray(i, i + 128)); p.process([[inp]], [[new Float32Array(inp.length)]]); }
  const good = ok / cnt >= 0.9; if (!good) fail++;
  console.log(`${good ? "OK " : "NG "} 速いサイレン(90→300Hz): 正しい ${((100 * ok) / cnt).toFixed(0)}%`);
}
// ささやき声: 息だけの声を「声」と誤判定して、ブッという声が混ざらないか
{
  const n = Math.floor(SR * 1.5); let w = Float64Array.from({ length: n }, rnd);
  w = res(res(res(w, 700, 130), 1200, 150), 2600, 200); let m = 0; for (const q of w) m = Math.max(m, Math.abs(q)); for (let i = 0; i < n; i++) w[i] = (w[i] / m) * 0.25;
  let Proc; globalThis.sampleRate = SR; globalThis.AudioWorkletProcessor = class { constructor() { this.port = {}; } }; globalThis.registerProcessor = (nm, c) => (Proc = c);
  eval(readFileSync(file, "utf8")); const p = new Proc({ processorOptions: { pitch: 2, formant: 1.2 } });
  let v = 0, cnt = 0; const orig = p.step.bind(p); p.step = (c) => { orig(c); if (c < SR * 0.1 || c > n - SR * 0.1) return; cnt++; if (p.f0Cur) v++; };
  for (let i = 0; i < n; i += 128) { const inp = Float32Array.from(w.subarray(i, i + 128)); p.process([[inp]], [[new Float32Array(inp.length)]]); }
  const good = v / cnt < 0.08; if (!good) fail++;
  console.log(`${good ? "OK " : "NG "} ささやき声: 声と誤判定 ${((100 * v) / cnt).toFixed(1)}%(8%未満で合格)`);
}
// 机を叩く音(低い「ドン」)とキーボードの「カチッ」: 無音の中なら元の音そのままで通るか(音程のある音に化けないか)
{
  const x = new Float64Array(SR * 2); const ev = [];
  const knock = () => { const n = Math.floor(SR * 0.12), o = new Float64Array(n); for (let i = 0; i < n; i++) { const t = i / SR; o[i] = 0.5 * Math.exp(-t / 0.025) * (Math.sin(2 * Math.PI * 180 * t) + 0.5 * Math.sin(2 * Math.PI * 420 * t + 1)) + (i < 96 ? rnd() : 0); } return o; };
  const key = () => { const n = Math.floor(SR * 0.02); let o = Float64Array.from({ length: n }, (_, i) => rnd() * Math.exp(-i / 100)); o = res(o, 4000, 2000); let m = 0; for (const q of o) m = Math.max(m, Math.abs(q)); return o.map((q) => (q / m) * 0.25); };
  for (const [t, a] of [[0.4, knock()], [0.9, key()], [1.2, key()], [1.5, knock()]]) { const s = Math.floor(t * SR); x.set(a, s); ev.push([s, s + a.length]); }
  let Proc; globalThis.sampleRate = SR; globalThis.AudioWorkletProcessor = class { constructor() { this.port = {}; } }; globalThis.registerProcessor = (nm, c) => (Proc = c);
  eval(readFileSync(file, "utf8")); const p = new Proc({ processorOptions: { pitch: 2, formant: 1.2 } });
  const y = new Float64Array(x.length); for (let i = 0; i < x.length; i += 128) { const inp = Float32Array.from(x.subarray(i, i + 128)); const o = new Float32Array(inp.length); p.process([[inp]], [[o]]); y.set(o, i); }
  const L = p.latency; let worst = 1;
  for (const [a, b] of ev) { let xy = 0, xx = 0, yy = 0; for (let i = a; i < b; i++) { xy += x[i] * y[i + L]; xx += x[i] ** 2; yy += y[i + L] ** 2; } worst = Math.min(worst, xy / Math.sqrt(xx * yy + 1e-20)); }
  const good = worst > 0.95; if (!good) fail++;
  console.log(`${good ? "OK " : "NG "} 机・キーボードの音: 元の音との一致度(最低) ${worst.toFixed(2)}`);
}
// 拍手: 無音の中の拍手が、変換されずにそのままの鋭さで通るか・音割れしないか
{
  const clap = (amp) => { const n = Math.floor(SR * 0.06), o = new Float64Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; const w = rnd(); lp += 0.35 * (w - lp); o[i] = amp * Math.min(1, t / 0.0015) * Math.exp(-t / 0.008) * (w - lp * 0.5) * 2; } return o; };
  const x = new Float64Array(SR * 2); const at = [Math.floor(SR * 0.5), Math.floor(SR * 1.2)]; for (const s of at) x.set(clap(0.95), s);
  let Proc; globalThis.sampleRate = SR; globalThis.AudioWorkletProcessor = class { constructor() { this.port = {}; } }; globalThis.registerProcessor = (n, c) => (Proc = c);
  eval(readFileSync(file, "utf8")); const p = new Proc({ processorOptions: { pitch: 2, formant: 1.2 } });
  const y = new Float64Array(x.length); for (let i = 0; i < x.length; i += 128) { const inp = Float32Array.from(x.subarray(i, i + 128)); const o = new Float32Array(inp.length); p.process([[inp]], [[o]]); y.set(o, i); }
  const L = p.latency; let peak = 0, ok = true;
  for (const s of at) { let ei = 0, eo = 0; for (let i = 0; i < 480; i++) { ei += x[s + i] ** 2; eo += y[s + L + i] ** 2; } const d = Math.abs(10 * Math.log10(eo / ei)); if (d > 3) ok = false; }
  for (const v of y) peak = Math.max(peak, Math.abs(v)); if (peak > 1) ok = false;
  if (!ok) fail++;
  console.log(`${ok ? "OK " : "NG "} 拍手: そのまま通る・音割れなし(出力の最大 ${peak.toFixed(2)})`);
}
console.log(fail ? `❌ ${fail}件の失敗` : "✅ すべて合格");
process.exit(fail ? 1 : 0);
