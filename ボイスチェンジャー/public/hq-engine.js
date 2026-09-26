// 高品質エンジン(録音・ファイル専用)。声を「高さ」「響き」「息」に分けて、声を作り直す。
// 音声合成でよく使われる WORLD と同じ考え方(ソース・フィルタ方式)を簡単にしたもの:
//   1. 声の高さを10msごとに YIN 法で調べる(前後も見て、飛びを直す)
//   2. 響きの形(スペクトル包絡)を True Envelope 法で取り出す
//   3. 変換後の高さで「声帯のパルス」を並べ直し、1つ1つのパルスに
//      フォルマントを動かした響き(最小位相=実際の声に近い位相)を掛けて重ねる
//   4. 息・子音は雑音に響きを掛けて作る
// リアルタイム版(voice-processor.js)より時間はかかるが、濁りや響きのにじみが出にくい。

const N = 2048;
const HALF = N / 2;
const HOP_SEC = 0.01;

class FFT {
  constructor(n) {
    this.n = n;
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
  }
  transform(re, im, inverse) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    const s = inverse ? 1 : -1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step];
          const wi = s * this.sin[k * step];
          const a = i + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }
}

// ---------- 1. 声の高さ(YIN法) ----------
function trackPitch(x, sr, hop) {
  const W = Math.round(sr * 0.025); // 積分する長さ
  const minLag = Math.floor(sr / 500);
  const maxLag = Math.ceil(sr / 60);
  const M = 1 << Math.ceil(Math.log2(W + maxLag) + 1);
  const fft = new FFT(M);
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  const re2 = new Float64Array(M);
  const im2 = new Float64Array(M);
  const frames = Math.ceil(x.length / hop);
  const f0 = new Float64Array(frames);
  const ap = new Float64Array(frames); // 周期性のなさ(0=きれいな声、1=雑音)
  const pow = new Float64Array(frames);
  const d = new Float64Array(maxLag + 1);
  // 2乗の累積和(差分関数のエネルギー項に使う)
  const cs = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) cs[i + 1] = cs[i] + x[i] * x[i];
  const seg = (a, b) => cs[Math.min(x.length, Math.max(0, b))] - cs[Math.min(x.length, Math.max(0, a))];

  for (let fr = 0; fr < frames; fr++) {
    const start = fr * hop - Math.floor((W + maxLag) / 2);
    // 相互相関 r(τ) = Σ x[t]·x[t+τ] (t は W 区間) を FFT で求める
    for (let i = 0; i < M; i++) {
      const j = start + i;
      const v = j >= 0 && j < x.length ? x[j] : 0;
      re[i] = i < W + maxLag ? v : 0;
      im[i] = 0;
      re2[i] = i < W ? v : 0;
      im2[i] = 0;
    }
    fft.transform(re, im, false);
    fft.transform(re2, im2, false);
    for (let k = 0; k < M; k++) {
      // conj(A)·B
      const a = re2[k];
      const b = -im2[k];
      const c = re[k];
      const e = im[k];
      const pr = a * c - b * e;
      const pi = a * e + b * c;
      re[k] = pr;
      im[k] = pi;
    }
    fft.transform(re, im, true);
    const e0 = seg(start, start + W);
    pow[fr] = e0 / W;
    let run = 0;
    let best = -1;
    let bestVal = 1;
    d[0] = 1;
    for (let tau = 1; tau <= maxLag; tau++) {
      const r = re[tau] / M;
      const diff = e0 + seg(start + tau, start + tau + W) - 2 * r;
      run += diff;
      d[tau] = run > 0 ? (diff * tau) / run : 1;
    }
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (d[tau] < 0.15) {
        while (tau + 1 <= maxLag && d[tau + 1] < d[tau]) tau++;
        best = tau;
        break;
      }
      if (d[tau] < bestVal) {
        bestVal = d[tau];
        best = tau;
      }
    }
    const val = d[best];
    // 放物線で小数点以下の周期を出す
    let t = best;
    if (best > minLag && best < maxLag) {
      const a = d[best - 1];
      const b = d[best];
      const c = d[best + 1];
      const den = a - 2 * b + c;
      if (den !== 0) t = best + (0.5 * (a - c)) / den;
    }
    f0[fr] = val < 0.35 && pow[fr] > 1e-6 ? sr / t : 0;
    ap[fr] = Math.min(1, Math.max(0.02, val * 1.5));
  }

  // 後処理: 前後と比べて飛んでいる値(倍・半分の間違い)を直し、短すぎる有声区間は無声にする
  const out = Float64Array.from(f0);
  for (let i = 0; i < frames; i++) {
    if (!f0[i]) continue;
    const near = [];
    for (let j = i - 3; j <= i + 3; j++) if (j >= 0 && j < frames && f0[j]) near.push(f0[j]);
    near.sort((a, b) => a - b);
    const med = near[near.length >> 1];
    if (f0[i] > med * 1.6 || f0[i] < med / 1.6) out[i] = med;
  }
  for (let i = 0; i < frames; ) {
    if (!out[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < frames && out[j]) j++;
    if (j - i < 3) for (let k = i; k < j; k++) out[k] = 0;
    i = j;
  }
  // 1フレームだけの無声のすき間は埋める
  for (let i = 1; i < frames - 1; i++) if (!out[i] && out[i - 1] && out[i + 1]) out[i] = (out[i - 1] + out[i + 1]) / 2;
  return { f0: out, ap, pow };
}

// ---------- 2. 響きの形(True Envelope) ----------
function envelopes(x, sr, hop, f0) {
  const fft = new FFT(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const frames = f0.length;
  const env = new Float32Array(frames * (HALF + 1)); // 対数(自然対数)で持つ
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const logA = new Float64Array(HALF + 1);
  for (let fr = 0; fr < frames; fr++) {
    const c = fr * hop - HALF;
    for (let i = 0; i < N; i++) {
      const j = c + i;
      re[i] = j >= 0 && j < x.length ? x[j] * win[i] : 0;
      im[i] = 0;
    }
    fft.transform(re, im, false);
    for (let k = 0; k <= HALF; k++) logA[k] = Math.log(Math.hypot(re[k], im[k]) + 1e-9);
    const L = f0[fr] ? Math.max(24, Math.min(HALF - 1, Math.round((0.5 * sr) / f0[fr]))) : Math.max(20, Math.round(sr / 1000));
    for (let iter = 0; iter < 4; iter++) {
      for (let k = 0; k <= HALF; k++) {
        re[k] = logA[k];
        im[k] = 0;
      }
      for (let k = HALF + 1; k < N; k++) {
        re[k] = re[N - k];
        im[k] = 0;
      }
      fft.transform(re, im, true);
      for (let k = 0; k < N; k++) {
        const keep = k < L || k > N - L;
        re[k] = keep ? re[k] / N : 0;
        im[k] = keep ? im[k] / N : 0;
      }
      fft.transform(re, im, false);
      if (iter < 3) for (let k = 0; k <= HALF; k++) logA[k] = Math.max(logA[k], re[k]);
    }
    env.set(re.subarray(0, HALF + 1), fr * (HALF + 1));
  }
  return env;
}

// ---------- 3. 合成 ----------
export function convertHQ(input, sr, opts = {}) {
  const pitch = opts.pitch ?? 1;
  const formant = opts.formant ?? 1;
  const inton = opts.inton ?? 1;
  const breath = opts.breath ?? 0;
  const soft = opts.soft ?? 0; // やわらかさ(dB): 第1倍音を強める
  const onProgress = opts.onProgress || (() => {});
  const x = Float64Array.from(input);
  const hop = Math.round(sr * HOP_SEC);

  const { f0, ap, pow } = trackPitch(x, sr, hop);
  onProgress(0.25);
  const env = envelopes(x, sr, hop, f0);
  onProgress(0.5);
  const frames = f0.length;
  const binHz = sr / N;

  // 抑揚の中心(ふだんの高さ)
  let logSum = 0;
  let cnt = 0;
  for (const v of f0) if (v) (logSum += Math.log(v)), cnt++;
  const logMean = opts.baseF0 ? Math.log(opts.baseF0) : cnt ? logSum / cnt : Math.log(120);

  const fft = new FFT(N);
  const out = new Float64Array(x.length + N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const nRe = new Float64Array(N);
  const nIm = new Float64Array(N);
  const logEnvW = new Float64Array(HALF + 1);
  const logP = new Float64Array(HALF + 1);
  const logN = new Float64Array(HALF + 1);
  const pRe = new Float64Array(HALF + 1);
  const pIm = new Float64Array(HALF + 1);
  const aRe = new Float64Array(HALF + 1);
  const aIm = new Float64Array(HALF + 1);
  const WSUM = N / 2; // ハン窓の和
  const WSQ = (3 * N) / 8; // ハン窓の2乗の和

  // 対数振幅から最小位相のスペクトルを作る(ケプストラムを片側に折りたたむ)
  const minPhase = (logMag, outRe, outIm) => {
    for (let k = 0; k <= HALF; k++) {
      re[k] = logMag[k];
      im[k] = 0;
    }
    for (let k = HALF + 1; k < N; k++) {
      re[k] = re[N - k];
      im[k] = 0;
    }
    fft.transform(re, im, true);
    for (let n = 0; n < N; n++) {
      const c = re[n] / N;
      re[n] = n === 0 || n === HALF ? c : n < HALF ? 2 * c : 0;
      im[n] = 0;
    }
    fft.transform(re, im, false);
    for (let k = 0; k <= HALF; k++) {
      const m = Math.exp(re[k]);
      outRe[k] = m * Math.cos(im[k]);
      outIm[k] = m * Math.sin(im[k]);
    }
  };

  // 入力の時刻 t(サンプル)での値をフレーム間で直線補間
  const frameAt = (t) => {
    const f = Math.min(frames - 1, Math.max(0, t / hop));
    const i0 = Math.floor(f);
    return { i0, i1: Math.min(frames - 1, i0 + 1), w: f - i0 };
  };
  const f0At = (t) => {
    const { i0, i1, w } = frameAt(t);
    const a = f0[i0];
    const b = f0[i1];
    if (a && b) return Math.exp(Math.log(a) * (1 - w) + Math.log(b) * w);
    return w < 0.5 ? a : b;
  };

  let t = 0;
  let noiseState = 12345;
  const rand = () => {
    noiseState = (noiseState * 1103515245 + 12345) & 0x7fffffff;
    return noiseState / 0x7fffffff - 0.5;
  };
  let lastReport = 0;
  while (t < x.length) {
    const fin = f0At(t);
    const voiced = fin > 0;
    let fout = 0;
    if (voiced) {
      fout = fin * pitch * Math.exp((inton - 1) * (Math.log(fin) - logMean));
      fout = Math.min(1000, Math.max(40, fout));
    }
    // 次のパルスまでの間隔(無声のときは5msおき)
    const T = voiced ? sr / fout : sr * 0.005;
    const { i0, i1, w } = frameAt(t);

    // 響きをフォルマント倍率で伸ばし、息(非周期成分)の割合を決める
    const apBase = voiced ? ap[i0] * (1 - w) + ap[i1] * w : 1;
    for (let k = 0; k <= HALF; k++) {
      const src = k / formant;
      const j0 = Math.min(HALF - 1, Math.floor(src));
      const fw = Math.min(1, src - j0);
      const e0 = env[i0 * (HALF + 1) + j0] * (1 - fw) + env[i0 * (HALF + 1) + j0 + 1] * fw;
      const e1 = env[i1 * (HALF + 1) + j0] * (1 - fw) + env[i1 * (HALF + 1) + j0 + 1] * fw;
      let le = e0 * (1 - w) + e1 * w;
      if (src > HALF) le -= 3; // 範囲外は小さく
      logEnvW[k] = le;
      const hz = k * binHz;
      // 高い周波数ほど息の成分が多い。息っぽさの設定でさらに足す
      const hi = Math.min(1, Math.max(0, (hz - 3000) / 5000));
      let a = voiced ? Math.min(1, apBase + (1 - apBase) * (0.4 * hi + breath * 0.6 * Math.min(1, Math.max(0, (hz - 1200) / 1800)))) : 1;
      a = Math.max(0.001, a);
      // 周期成分: 振幅を T/窓の和 にすると、分析時と同じ倍音の高さになる
      logP[k] = le + Math.log(Math.sqrt(1 - a * a) + 1e-6) + Math.log(T / WSUM);
      // やわらかさ: 基本周波数のまわり(0〜1.5倍)をなだらかに持ち上げる
      if (soft && voiced && hz < fout * 1.5) {
        const bell = hz < fout ? 1 : 1 - (hz - fout) / (fout * 0.5);
        logP[k] += (soft * Math.max(0, bell) * Math.LN10) / 20;
      }
      logN[k] = le + Math.log(a) - 0.5 * Math.log(WSQ);
    }

    const pos = Math.floor(t);
    const frac = t - pos;
    // 周期成分(声帯のパルス)
    if (voiced) {
      minPhase(logP, pRe, pIm);
      for (let k = 0; k <= HALF; k++) {
        // 小数点以下の時刻ずれを位相で表す
        const ph = (-2 * Math.PI * k * frac) / N;
        const c = Math.cos(ph);
        const s = Math.sin(ph);
        re[k] = pRe[k] * c - pIm[k] * s;
        im[k] = pRe[k] * s + pIm[k] * c;
      }
      for (let k = HALF + 1; k < N; k++) {
        re[k] = re[N - k];
        im[k] = -im[N - k];
      }
      fft.transform(re, im, true);
      for (let n = 0; n < HALF && pos + n < out.length; n++) out[pos + n] += re[n] / N;
    }
    // 非周期成分(息・子音): 長さ T の雑音に響きを掛ける
    minPhase(logN, aRe, aIm);
    const Tn = Math.max(1, Math.round(T));
    for (let n = 0; n < N; n++) {
      nRe[n] = n < Tn ? rand() * Math.sqrt(12) : 0;
      nIm[n] = 0;
    }
    fft.transform(nRe, nIm, false);
    for (let k = 0; k <= HALF; k++) {
      const r = nRe[k] * aRe[k] - nIm[k] * aIm[k];
      const i = nRe[k] * aIm[k] + nIm[k] * aRe[k];
      re[k] = r;
      im[k] = i;
    }
    for (let k = HALF + 1; k < N; k++) {
      re[k] = re[N - k];
      im[k] = -im[N - k];
    }
    fft.transform(re, im, true);
    for (let n = 0; n < N && pos + n < out.length; n++) out[pos + n] += re[n] / N;

    t += T;
    if (t - lastReport > sr) {
      lastReport = t;
      onProgress(0.5 + (0.45 * t) / x.length);
    }
  }

  // 4. 音量の流れを元の声に合わせる(20msごと、なめらかに)
  const y = out.subarray(0, x.length);
  const blk = Math.round(sr * 0.02);
  const nb = Math.ceil(x.length / blk);
  const gains = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    let pi = 0;
    let po = 0;
    for (let n = b * blk; n < Math.min(x.length, (b + 1) * blk); n++) {
      pi += x[n] * x[n];
      po += y[n] * y[n];
    }
    gains[b] = po > 0 ? Math.sqrt(pi / po) : 0;
  }
  // 極端な値をならす(前後5ブロックの中央値)
  const sm = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    const a = [];
    for (let j = b - 2; j <= b + 2; j++) if (j >= 0 && j < nb) a.push(gains[j]);
    a.sort((p, q) => p - q);
    sm[b] = a[a.length >> 1];
  }
  for (let n = 0; n < x.length; n++) {
    const f = n / blk - 0.5;
    const b0 = Math.max(0, Math.min(nb - 1, Math.floor(f)));
    const b1 = Math.min(nb - 1, b0 + 1);
    const w2 = Math.min(1, Math.max(0, f - b0));
    y[n] *= sm[b0] * (1 - w2) + sm[b1] * w2;
  }
  onProgress(1);
  return Float32Array.from(y);
}
