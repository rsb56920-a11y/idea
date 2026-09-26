// リアルタイム作り直しエンジン(AudioWorklet)。
// 高品質エンジン(hq-engine.js)と同じ「声を作り直す」方式を、5msずつ少しずつ行う。
//   1. 5msごとに、少し前(約21ms前)の時刻を中心に 声の高さ(YIN)・響き(True Envelope)・息の量 を調べる
//   2. 変換後の高さで声帯のパルスを並べ、響き(フォルマントを動かしたもの)を掛けて重ねる
//   3. 音量は、声(母音)と子音で別々に元の声に合わせる
// フェーズボコーダ方式(voice-processor.js)と違い、倍音をずらすのではなく作り直すので、
// 高さが正確で、にごりが出にくい。遅れは約28ms。

const N = 2048;
const HALF = N / 2;
const RING = 1 << 15;
const MASK = RING - 1;

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

class ResynthProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // 設定(画面から変えられる)
    this.pitch = 1;
    this.formant = 1;
    this.inton = 1;
    this.breath = 0;
    this.soft = 0;
    this.gateDb = -120;
    this.baseF0 = 0;
    this.bypass = false;
    this.mix = 1;
    this.voicedThresh = 0.35; // YIN の値がこれより小さければ声(有声)
    this.apScale = 0.3; // 息(非周期成分)の見積もりの強さ
    this.hiNoise = 0.1; // 3kHz より上に足す息の割合
    // 人の声の「ゆらぎ」。声帯は1回ごとに少しずつ間隔(ジッター)と強さ(シマー)がゆれている。
    // 完全に規則正しいパルスは機械っぽく(ブザーっぽく)聞こえるので、ごく少しだけ足す(1 = ふつう、0 = なし)
    this.humanize = 1;
    Object.assign(this, options?.processorOptions);
    this.port.onmessage = (e) => Object.assign(this, e.data);

    const sr = sampleRate;
    this.hop = Math.round(sr * 0.005);
    this.W = Math.round(sr * (this.yinMs || 20) / 1000); // YIN の積分の長さ(25ms→20ms: 精度はそのままで遅れが約2.5ms短い)
    this.minLag = Math.floor(sr / 500);
    this.maxLag = Math.ceil(sr / (this.minF0 || 60));
    this.M = 1 << Math.ceil(Math.log2(this.W + this.maxLag) + 1);
    // 分析の中心は今より D サンプル前(響きの分析窓の後ろ半分がそろうまで待つ)
    // (響きの窓は envLen の長さだけ使うので、その半分だけ先があればよい)
    const envHalf = Math.ceil(Math.min(N, this.envLen || Math.round(sr * 0.0267)) / 2);
    this.D = Math.max(envHalf, Math.ceil((this.W + this.maxLag) / 2)) + this.hop;
    this.latency = this.D + this.hop; // 全体の遅れ(サンプル)

    this.inRing = new Float64Array(RING);
    this.outRing = new Float64Array(RING);
    this.now = 0;
    this.nextPulse = 0;

    this.fft = new FFT(N);
    this.fftM = new FFT(this.M);
    // 息・子音の雑音は位相がいらないので、小さい窓(約11ms)で直接作る
    this.NN = 512;
    this.fftN = new FFT(this.NN);
    this.zRe = new Float64Array(this.NN);
    this.zIm = new Float64Array(this.NN);
    // 雑音の粒の端をなめらかにする窓(急に始まって終わると、高い音にカチッとした音がもれる)
    // ハン窓はパワーを 3/8 にするので、その分を戻す
    this.zWin = new Float64Array(this.NN);
    for (let i = 0; i < this.NN; i++) this.zWin[i] = (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / this.NN)) * Math.sqrt(8 / 3);
    // 響きを調べる窓の長さ(サンプル)。長いほど響きが安定、短いほど音の切れ目(子音→母音)がくっきり
    this.envLen = this.envLen || Math.round(sampleRate * 0.0267); // 約27ms(48kHz で 1280)
    this.win = new Float64Array(N);
    const EL = Math.min(N, this.envLen);
    const off = (N - EL) >> 1;
    for (let i = 0; i < EL; i++) this.win[off + i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / EL);
    this.re = new Float64Array(N);
    this.im = new Float64Array(N);
    this.nRe = new Float64Array(N);
    this.nIm = new Float64Array(N);
    this.yRe = new Float64Array(this.M);
    this.yIm = new Float64Array(this.M);
    this.yRe2 = new Float64Array(this.M);
    this.yIm2 = new Float64Array(this.M);
    this.d = new Float64Array(this.maxLag + 1);
    this.logA = new Float64Array(HALF + 1);
    this.envPrev = new Float64Array(HALF + 1).fill(-20);
    this.envCur = new Float64Array(HALF + 1).fill(-20);
    this.logP = new Float64Array(HALF + 1);
    this.logN = new Float64Array(HALF + 1);
    this.pRe = new Float64Array(HALF + 1);
    this.pIm = new Float64Array(HALF + 1);
    this.aRe = new Float64Array(HALF + 1);
    this.aIm = new Float64Array(HALF + 1);

    this.f0Prev = 0;
    this.f0Cur = 0;
    this.apPrev = 1;
    this.apCur = 1;
    this.lastVoicedF0 = 0;
    this.lastVoicedAt = -1e9;
    this.logMean = 0;
    this.seed = 12345;
    this.flutter = 0;
    // 音量合わせ(子音・声で別々)
    this.gs = [
      { inPow: 1e-6, outPow: 1e-6, gain: 1 },
      { inPow: 1e-6, outPow: 1e-6, gain: 1 },
    ];
    this.gain = 1;
    this.gateGain = 1;
    this.fast = 1;
    this.hIn = new Float64Array(3);
    this.hOut = new Float64Array(3);
    this.hIdx = 0;
  }

  rand() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff - 0.5;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0];
    if (!output?.[0]) return true;
    const out = output[0];
    const L = this.latency;
    for (let i = 0; i < out.length; i++) {
      const x = input ? input[i] : 0;
      this.inRing[this.now & MASK] = x;
      const oi = (this.now - L) & MASK;
      const wet = this.outRing[oi];
      this.outRing[oi] = 0;
      const dry = this.now >= L ? this.inRing[oi] : 0;
      out[i] = this.bypass ? dry : wet * this.mix + dry * (1 - this.mix);
      this.now++;
      if (this.now % this.hop === 0 && this.now > this.D + this.hop) this.step(this.now - this.D);
    }
    for (let c = 1; c < output.length; c++) output[c].set(out);
    return true;
  }

  // 時刻 c を中心に分析し、c までのパルスを並べる
  step(c) {
    const sr = sampleRate;
    const { f0, ap, power } = this.yin(c);
    this.envelope(c, f0);
    this.f0Prev = this.f0Cur;
    this.f0Cur = f0;
    this.apPrev = this.apCur;
    this.apCur = f0 ? ap : 1;
    if (f0) {
      const lf = Math.log(f0);
      if (!this.logMean) this.logMean = this.baseF0 ? Math.log(this.baseF0) : lf;
      this.logMean += (lf - this.logMean) * 0.005;
    }

    // ノイズゲート
    const db = 10 * Math.log10(power + 1e-20);
    const gateTarget = db > this.gateDb ? 1 : 0.03;
    this.gateGain += (gateTarget - this.gateGain) * (gateTarget > this.gateGain ? 0.7 : 0.2);

    // c までのパルスを並べる
    const t0 = c - this.hop;
    if (this.nextPulse < t0) this.nextPulse = t0;
    while (this.nextPulse <= c) {
      const t = this.nextPulse;
      const w = Math.min(1, Math.max(0, (t - t0) / this.hop));
      this.nextPulse += this.pulse(t, w);
    }

    // 音量合わせ: この5msの 入力と出力のパワーを、声と子音で別々に比べる
    const v = this.f0Cur ? 1 : 0;
    let pi = 0;
    let po = 0;
    for (let n = t0; n < c; n++) {
      const a = this.inRing[n & MASK];
      const b = this.outRing[n & MASK];
      pi += a * a;
      po += b * b;
    }
    const st = this.gs[v];
    const k = 1 - Math.exp(-this.hop / (0.3 * sr));
    st.inPow += (pi / this.hop - st.inPow) * k;
    st.outPow += (po / this.hop - st.outPow) * k;
    if (st.inPow > 1e-7 && this.gateGain > 0.5) {
      const target = Math.min(8, Math.max(0.1, Math.sqrt(st.inPow / (st.outPow + 1e-12))));
      st.gain += (target - st.gain) * 0.1;
    }
    // 音の切れ目をくっきり: 直近15msの入力の音量と比べて、出力が大きすぎるときだけすばやく絞る。
    // 響きを43msの窓で調べるため、話し終わりに声が尾を引き(言葉の輪郭がぼやけ)やすいのを防ぐ
    this.hIn[this.hIdx % 3] = pi;
    this.hOut[this.hIdx % 3] = po;
    this.hIdx++;
    const eIn = this.hIn[0] + this.hIn[1] + this.hIn[2];
    const eOut = (this.hOut[0] + this.hOut[1] + this.hOut[2]) * st.gain * st.gain;
    // いまの5msだけで見て急に静かになったとき(12dB以上の余裕をみて)も、すぐ絞る
    const now1 = 4 * Math.sqrt(pi / (po * st.gain * st.gain + 1e-12));
    const tgt = Math.min(1, Math.sqrt(eIn / (eOut + 1e-12)), now1);
    this.fast += (tgt - this.fast) * (tgt < this.fast ? 0.6 : 0.35);
    const g1 = st.gain * this.gateGain * this.fast;
    const g0 = this.gain;
    for (let n = t0; n < c; n++) {
      const g = g0 + ((g1 - g0) * (n - t0)) / this.hop;
      this.outRing[n & MASK] *= g;
    }
    this.gain = g1;
  }

  // YIN 法で声の高さを出す(c を中心に)
  yin(c) {
    const { W, M, minLag, maxLag, yRe: re, yIm: im, yRe2: re2, yIm2: im2, d } = this;
    const start = c - Math.floor((W + maxLag) / 2);
    let e0 = 0;
    for (let i = 0; i < M; i++) {
      const v = i < W + maxLag ? this.inRing[(start + i) & MASK] : 0;
      re[i] = v;
      im[i] = 0;
      re2[i] = i < W ? v : 0;
      im2[i] = 0;
      if (i < W) e0 += v * v;
    }
    const power = e0 / W;
    if (power < 1e-8) return { f0: 0, ap: 1, power };
    this.fftM.transform(re, im, false);
    this.fftM.transform(re2, im2, false);
    for (let k = 0; k < M; k++) {
      const a = re2[k];
      const b = -im2[k];
      const pr = a * re[k] - b * im[k];
      const pi = a * im[k] + b * re[k];
      re[k] = pr;
      im[k] = pi;
    }
    this.fftM.transform(re, im, true);
    // x[start+tau .. start+tau+W) の2乗和を、ずらしながら更新する
    let eTau = e0;
    let run = 0;
    d[0] = 1;
    for (let tau = 1; tau <= maxLag; tau++) {
      const out = this.inRing[(start + tau - 1) & MASK];
      const inn = this.inRing[(start + tau - 1 + W) & MASK];
      eTau += inn * inn - out * out;
      const diff = e0 + eTau - (2 * re[tau]) / M;
      run += diff;
      d[tau] = run > 0 ? (diff * tau) / run : 1;
    }
    let best = -1;
    let bestVal = 1;
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
    let t = best;
    if (best > minLag && best < maxLag) {
      const a = d[best - 1];
      const b = d[best];
      const cc = d[best + 1];
      const den = a - 2 * b + cc;
      if (den !== 0) t = best + (0.5 * (a - cc)) / den;
    }
    let f0 = sampleRate / t;
    // 声の続き: 直前(30ms以内)まで声で、高さもほぼ同じ(±2半音)なら、少しゆるい基準でも声とみなす。
    // 母音の途中で YIN の値が一瞬ゆれて「無声」になると、声の中に雑音がブツッと混ざってガサついて聞こえるため
    const cont =
      this.lastVoicedF0 && c - this.lastVoicedAt < sampleRate * 0.03 && Math.abs(Math.log2(f0 / this.lastVoicedF0)) < 2 / 12;
    // 話し始め: その人のふだんの高さ(±5半音)に近いときだけ、少しゆるい基準で声とみなす。
    // 1オクターブの読み違い(12半音ずれ)はここで弾かれるので、出だしが裏返らない
    const nearUsual = !cont && this.logMean && Math.abs(Math.log(f0) - this.logMean) < (5 / 12) * Math.LN2;
    const thresh = cont ? this.voicedThresh + 0.15 : nearUsual ? this.voicedThresh + 0.1 : this.voicedThresh;
    if (!(val < thresh && f0 >= 55 && f0 <= 550)) f0 = 0;
    // 直前の声と比べて、倍・半分に飛んだものは直す(未来は見られないので過去だけで判断)
    if (f0 && this.lastVoicedF0 && c - this.lastVoicedAt < sampleRate * 0.05) {
      const r = f0 / this.lastVoicedF0;
      if (r > 1.7 && r < 2.3) f0 /= 2;
      else if (r < 0.59 && r > 0.43) f0 *= 2;
    }
    if (f0) {
      this.lastVoicedF0 = f0;
      this.lastVoicedAt = c;
    }
    return { f0, ap: Math.min(1, Math.max(0.02, val * this.apScale)), power };
  }

  // True Envelope 法で響きの形(対数)を出し、envCur に入れる
  envelope(c, f0) {
    const { re, im, win, fft, logA } = this;
    this.envPrev.set(this.envCur);
    for (let i = 0; i < N; i++) {
      re[i] = this.inRing[(c - HALF + i) & MASK] * win[i];
      im[i] = 0;
    }
    fft.transform(re, im, false);
    // 窓を短くしたぶん、大きさを元の長さの窓と同じにそろえる
    const wScale = Math.log(N / Math.min(N, this.envLen));
    for (let k = 0; k <= HALF; k++) logA[k] = Math.log(Math.hypot(re[k], im[k]) + 1e-9) + wScale;
    const L = f0 ? Math.max(24, Math.min(HALF - 1, Math.round((0.5 * sampleRate) / f0))) : Math.max(20, Math.round(sampleRate / 1000));
    // 2回で十分(4回と比べて品質は同じ、計算は約2割少ない)
    for (let iter = 0; iter < 2; iter++) {
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
      if (iter < 1) for (let k = 0; k <= HALF; k++) logA[k] = Math.max(logA[k], re[k]);
    }
    for (let k = 0; k <= HALF; k++) this.envCur[k] = re[k];
  }

  minPhase(logMag, outRe, outIm) {
    const { re, im, fft } = this;
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
      const v = re[n] / N;
      re[n] = n === 0 || n === HALF ? v : n < HALF ? 2 * v : 0;
      im[n] = 0;
    }
    fft.transform(re, im, false);
    for (let k = 0; k <= HALF; k++) {
      const m = Math.exp(re[k]);
      outRe[k] = m * Math.cos(im[k]);
      outIm[k] = m * Math.sin(im[k]);
    }
  }

  // 時刻 t に1つのパルス(声)または雑音の粒(息・子音)を置き、次までの間隔を返す
  pulse(t, w) {
    const sr = sampleRate;
    const { re, im, logP, logN, pRe, pIm, fft } = this;
    const a0 = this.f0Prev;
    const a1 = this.f0Cur;
    const fin = a0 && a1 ? Math.exp(Math.log(a0) * (1 - w) + Math.log(a1) * w) : w < 0.5 ? a0 : a1;
    const voiced = fin > 0;
    let fout = 0;
    if (voiced) {
      fout = fin * this.pitch * (this.logMean ? Math.exp((this.inton - 1) * (Math.log(fin) - this.logMean)) : 1);
      fout = Math.min(1000, Math.max(40, fout));
    }
    let T = voiced ? sr / fout : sr * 0.005;
    // ゆらぎ: 間隔 ±0.3%(標準偏差)、強さ ±0.25dB。ゆっくりした揺れ(フラッター)も少し
    let shimmer = 0;
    if (voiced && this.humanize > 0) {
      const g1 = 2 * (this.rand() + this.rand() + this.rand());
      const g2 = 2 * (this.rand() + this.rand() + this.rand());
      this.flutter += (2 * (this.rand() + this.rand() + this.rand()) - this.flutter) * 0.02;
      T *= 1 + this.humanize * (0.003 * g1 + 0.002 * this.flutter);
      shimmer = (this.humanize * 0.25 * g2 * Math.LN10) / 20;
    }
    const apBase = voiced ? this.apPrev * (1 - w) + this.apCur * w : 1;
    const binHz = sr / N;
    const WSUM = N / 2;
    const WSQ = (3 * N) / 8;
    const f = this.formant;
    for (let k = 0; k <= HALF; k++) {
      const src = k / f;
      const j0 = Math.min(HALF - 1, Math.floor(src));
      const fw = Math.min(1, src - j0);
      const e0 = this.envPrev[j0] * (1 - fw) + this.envPrev[j0 + 1] * fw;
      const e1 = this.envCur[j0] * (1 - fw) + this.envCur[j0 + 1] * fw;
      let le = e0 * (1 - w) + e1 * w;
      if (src > HALF) le -= 3;
      const hz = k * binHz;
      const hi = Math.min(1, Math.max(0, (hz - 3000) / 5000));
      let a = voiced
        ? Math.min(1, apBase + (1 - apBase) * (this.hiNoise * hi + this.breath * 0.6 * Math.min(1, Math.max(0, (hz - 1200) / 1800))))
        : 1;
      a = Math.max(0.001, a);
      logP[k] = le + Math.log(Math.sqrt(1 - a * a) + 1e-6) + Math.log(T / WSUM) + shimmer;
      if (this.soft && voiced && hz < fout * 1.5) {
        const bell = hz < fout ? 1 : 1 - (hz - fout) / (fout * 0.5);
        logP[k] += (this.soft * Math.max(0, bell) * Math.LN10) / 20;
      }
      logN[k] = le + Math.log(a) - 0.5 * Math.log(WSQ);
    }
    const pos = Math.floor(t);
    const frac = t - pos;
    if (voiced) {
      this.minPhase(logP, pRe, pIm);
      for (let k = 0; k <= HALF; k++) {
        const ph = (-2 * Math.PI * k * frac) / N;
        const cs = Math.cos(ph);
        const sn = Math.sin(ph);
        re[k] = pRe[k] * cs - pIm[k] * sn;
        im[k] = pRe[k] * sn + pIm[k] * cs;
      }
      for (let k = HALF + 1; k < N; k++) {
        re[k] = re[N - k];
        im[k] = -im[N - k];
      }
      fft.transform(re, im, true);
      for (let n = 0; n < HALF; n++) this.outRing[(pos + n) & MASK] += re[n] / N;
    }
    // 雑音: 響きの形の大きさ × ランダムな位相。長さ T の白色雑音と同じ強さになるようにする
    const NN = this.NN;
    const step = N / NN;
    const zRe = this.zRe;
    const zIm = this.zIm;
    const sd = Math.sqrt(Math.max(1, T) / 2);
    for (let k = 0; k <= NN / 2; k++) {
      const m = Math.exp(logN[k * step]) * sd;
      // Box-Muller でガウス雑音を2つ作る
      const u1 = Math.max(1e-12, this.rand() + 0.5);
      const u2 = this.rand() + 0.5;
      const r = Math.sqrt(-2 * Math.log(u1));
      zRe[k] = m * r * Math.cos(2 * Math.PI * u2);
      zIm[k] = k === 0 || k === NN / 2 ? 0 : m * r * Math.sin(2 * Math.PI * u2);
    }
    for (let k = NN / 2 + 1; k < NN; k++) {
      zRe[k] = zRe[NN - k];
      zIm[k] = -zIm[NN - k];
    }
    this.fftN.transform(zRe, zIm, true);
    // パーセバルの定理より、1/NN で「長さ T の白色雑音に響きを掛けたもの」と同じ強さになる
    const gN = 1 / NN;
    const zWin = this.zWin;
    for (let n = 0; n < NN; n++) this.outRing[(pos + n) & MASK] += zRe[n] * gN * zWin[n];
    return T;
  }
}

registerProcessor("resynth-processor", ResynthProcessor);
