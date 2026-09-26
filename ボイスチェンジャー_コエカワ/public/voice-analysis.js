// 声の分析(あなた専用の設定を作るため)。ブラウザとテスト(Node)の両方で使う。
//   - 声の高さ(基本周波数): 正規化自己相関
//   - 声道の長さ(のどから唇まで): LPC で共鳴(フォルマント)を出し、その間隔から計算
//     共鳴は「(2i-1) × 音速 / (4 × 声道の長さ)」に並ぶので、間隔 ΔF から 長さ = 音速 / (2ΔF)

const SOUND_CM = 35000; // 口の中の音速(cm/秒)

// はっきりした周期がない(無声音・無音)ときは null
export function detectF0(buf, sr) {
  let rms = 0;
  for (const v of buf) rms += v * v;
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return null;
  const W = Math.floor(buf.length / 2);
  const minLag = Math.floor(sr / 400);
  const maxLag = Math.min(W, Math.floor(sr / 60));
  const r = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    let a = 0;
    let b = 0;
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

// LPC の共鳴ピーク(Hz)。約11kHzに間引いてから12次で分析する
export function formants(buf, sr) {
  const step = Math.max(1, Math.round(sr / 11025));
  const fs = sr / step;
  const ds = [];
  for (let i = 0; i + step <= buf.length; i += step) {
    let s = 0;
    for (let j = 0; j < step; j++) s += buf[i + j];
    ds.push(s / step);
  }
  // 高い音を少し強調(声の自然な傾きを打ち消して共鳴を見やすくする)
  for (let i = ds.length - 1; i > 0; i--) ds[i] -= 0.94 * ds[i - 1];
  const n = ds.length;
  const P = 12;
  const w = ds.map((v, i) => v * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1))));
  const R = [];
  for (let k = 0; k <= P; k++) {
    let s = 0;
    for (let i = k; i < n; i++) s += w[i] * w[i - k];
    R[k] = s;
  }
  if (R[0] <= 0) return [];
  let a = [1];
  let e = R[0];
  for (let i = 1; i <= P; i++) {
    let acc = R[i];
    for (let j = 1; j < i; j++) acc += a[j] * R[i - j];
    const k = -acc / e;
    const na = a.slice();
    na[i] = k;
    for (let j = 1; j < i; j++) na[j] = a[j] + k * a[i - j];
    a = na;
    e *= 1 - k * k;
    if (e <= 0) return [];
  }
  // 多項式 z^P + a1 z^(P-1) + ... + aP の根を求め、角度=周波数、半径=共鳴の鋭さ にする
  const roots = polyRoots(a);
  const out = [];
  for (const [re, im] of roots) {
    if (im <= 0) continue;
    const f = (Math.atan2(im, re) * fs) / (2 * Math.PI);
    const bw = (-Math.log(Math.hypot(re, im)) * fs) / Math.PI;
    // 幅の広すぎる根は共鳴ではなく「全体の傾き」を表しているので除く
    if (f > 200 && f < 4800 && bw < 450) out.push(f);
  }
  return out.sort((p, q) => p - q);
}

// Durand-Kerner 法で多項式の根(複素数)を求める。a = [1, a1, ..., aP]
function polyRoots(a) {
  const P = a.length - 1;
  let z = [];
  for (let i = 0; i < P; i++) {
    const ang = (2 * Math.PI * i) / P + 0.4;
    z.push([0.9 * Math.cos(ang), 0.9 * Math.sin(ang)]);
  }
  const mul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
  const div = (p, q) => {
    const d = q[0] * q[0] + q[1] * q[1] || 1e-30;
    return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
  };
  for (let it = 0; it < 300; it++) {
    let moved = 0;
    const nz = z.map((zi, i) => {
      // 多項式の値(ホーナー法)
      let v = [1, 0];
      for (let k = 1; k <= P; k++) {
        v = mul(v, zi);
        v[0] += a[k];
      }
      let den = [1, 0];
      z.forEach((zj, j) => {
        if (j !== i) den = mul(den, [zi[0] - zj[0], zi[1] - zj[1]]);
      });
      const d = div(v, den);
      moved = Math.max(moved, Math.hypot(d[0], d[1]));
      return [zi[0] - d[0], zi[1] - d[1]];
    });
    z = nz;
    if (moved < 1e-10) break;
  }
  return z;
}

// 共鳴の並びから、共鳴の間隔 ΔF(Hz) を出す。第3共鳴まで見つかった時だけ
// (声道の長さ = 音速 / 2ΔF。母音ごとに口の形が違うので、1つの母音だけでは長さはぶれる)
export function formantSpacing(fmts) {
  // 共鳴を番号に割り当てる(i番目の共鳴はおおよそ (2i-1)×(音速/4L) 付近。L=12〜20cm の範囲)
  const slots = [
    [200, 1100],
    [700, 2700],
    [1900, 3700],
    [2900, 4800],
  ];
  const f = [];
  let from = 0;
  slots.forEach(([lo, hi], i) => {
    const cand = fmts.filter((x) => x >= lo && x <= hi && x > from);
    if (cand.length) {
      f[i] = cand[0];
      from = cand[0] + 150;
    }
  });
  const pts = f.map((fi, i) => [fi, (2 * i + 1) / 2]).filter((p) => p[0]);
  if (pts.length < 3 || !f[2]) return null;
  // F_i ≈ (2i-1)/2 × ΔF を最小二乗で当てはめる
  let num = 0;
  let den = 0;
  for (const [fi, c] of pts) {
    num += fi * c;
    den += c * c;
  }
  return num / den;
}

const median = (a) => {
  const s = [...a].sort((p, q) => p - q);
  return s[s.length >> 1];
};

// 録った声(Float32Array)から、あなたの声のプロフィールを作る
export function profileVoice(x, sr) {
  const n = Math.round(sr * 0.04);
  const hop = Math.round(sr * 0.02);
  const f0s = [];
  const spacings = [];
  for (let i = 0; i + n <= x.length; i += hop) {
    const seg = x.subarray(i, i + n);
    const f0 = detectF0(seg, sr);
    if (!f0) continue;
    f0s.push(f0);
    const dF = formantSpacing(formants(seg, sr));
    if (dF && dF > 700 && dF < 1900) spacings.push(dF);
  }
  if (f0s.length < 10) return null;
  const semis = f0s.map((f) => 12 * Math.log2(f));
  const mean = semis.reduce((p, q) => p + q) / semis.length;
  const sd = Math.sqrt(semis.reduce((p, q) => p + (q - mean) ** 2, 0) / semis.length);
  // 母音ごとのぶれを打ち消すため、上下2割を除いた平均の間隔から長さを出す
  let tract = null;
  if (spacings.length >= 8) {
    const sorted = [...spacings].sort((p, q) => p - q);
    const cut = Math.floor(sorted.length * 0.2);
    const mid = sorted.slice(cut, sorted.length - cut);
    const dF = mid.reduce((p, q) => p + q) / mid.length;
    tract = Math.round((SOUND_CM / (2 * dF)) * 10) / 10;
  }
  return {
    f0: Math.round(median(f0s)),
    range: Math.round(sd * 10) / 10, // 声の高さの動き(半音の標準偏差)
    tract,
  };
}
