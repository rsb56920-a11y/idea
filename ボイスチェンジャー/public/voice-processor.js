// 声の高さ(ピッチ)と声の響き(フォルマント)を別々に動かす AudioWorklet。
//
// しくみ(1フレームごと):
//   1. 音を短く切ってFFTで周波数ごとに分ける
//   2. ケプストラムで「声の響きの形(スペクトル包絡)」を取り出す
//   3. 倍音の山(ピーク)を見つける
//   4. 山ごとにまわりのビンをまとめてピッチ倍率ぶんずらし、位相を山ごとに回して周波数を変える
//      (Laroche & Dolson の位相ロック方式。ビン単位でずらすより濁りが少ない)
//      このとき元の響き(包絡)を外し、フォルマント倍率で伸ばした響きを掛け直す
//   5. 逆FFTで音に戻して重ね合わせる
// ピッチだけ上げると「ヘリウム声」になるのは、2 の響きまで一緒に伸びるから。
// ここでは響きの伸び方を別に決められるので、女声・少年声が自然になりやすい。
//
// リアルタイム(マイク)とファイル変換(OfflineAudioContext)の両方で同じ処理を使う。

const N = 2048; // FFTの長さ(48kHzで約43ms。低い男声でも2〜3周期入る)
const OSAMP = 4; // 重ね合わせの多さ
const HOP = N / OSAMP;
const HALF = N / 2;

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
  // 正規化なし。inverse=false で e^{-i}、true で e^{+i}
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

class VoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.pitch = 1;
    this.formant = 1;
    this.mix = 1; // 1 = 変換後の声だけ
    this.bypass = false;
    // 変換後の音量を元の声に合わせる(倍音の数が減ると小さく聞こえるため)
    this.inPow = 1e-6;
    this.outPow = 1e-6;
    this.gain = 1;
    // ファイル変換では最初から設定を渡す(メッセージは届くのが遅れることがあるため)
    Object.assign(this, options?.processorOptions);
    this.port.onmessage = (e) => Object.assign(this, e.data);

    this.fft = new FFT(N);
    this.win = new Float64Array(N);
    for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

    this.inFIFO = new Float64Array(N);
    this.outFIFO = new Float64Array(N);
    this.outAccum = new Float64Array(2 * N);
    this.rover = N - HOP;
    this.lastPhase = new Float64Array(HALF + 1);

    this.re = new Float64Array(N);
    this.im = new Float64Array(N);
    this.cRe = new Float64Array(N);
    this.cIm = new Float64Array(N);
    this.anaMag = new Float64Array(HALF + 1);
    this.anaFreq = new Float64Array(HALF + 1);
    this.env = new Float64Array(HALF + 1);
    this.outRe = new Float64Array(HALF + 1);
    this.outIm = new Float64Array(HALF + 1);
    this.peaks = new Int32Array(HALF);
    this.newTheta = new Float64Array(HALF);
    this.prevPeaks = new Int32Array(HALF);
    this.prevTheta = new Float64Array(HALF);
    this.prevCount = 0;
    // ケプストラムで残す係数の数。小さいほど包絡がなめらか(倍音の細かい山を拾わない)
    this.lifter = Math.max(20, Math.round(sampleRate / 1000));
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0];
    if (!output?.[0]) return true;
    const out = output[0];
    if (!input) {
      out.fill(0);
    } else if (this.bypass) {
      out.set(input);
    } else {
      for (let i = 0; i < input.length; i++) {
        this.inFIFO[this.rover] = input[i];
        const dry = this.inFIFO[this.rover - (N - HOP)] ?? 0;
        let wet = this.outFIFO[this.rover - (N - HOP)];
        // 約0.3秒の平均パワーで音量を合わせる。無音時は上げすぎない
        const a = 1 / (0.3 * sampleRate);
        this.inPow += (dry * dry - this.inPow) * a;
        this.outPow += (wet * wet - this.outPow) * a;
        const target = this.inPow > 1e-7 ? Math.min(4, Math.max(0.5, Math.sqrt(this.inPow / (this.outPow + 1e-12)))) : this.gain;
        this.gain += (target - this.gain) * a * 4;
        wet *= this.gain;
        out[i] = wet * this.mix + dry * (1 - this.mix);
        this.rover++;
        if (this.rover >= N) {
          this.rover = N - HOP;
          this.frame();
        }
      }
    }
    for (let c = 1; c < output.length; c++) output[c].set(out);
    return true;
  }

  frame() {
    const { re, im, cRe, cIm, win, fft, anaMag, anaFreq, env } = this;
    const freqPerBin = sampleRate / N;
    const expct = (2 * Math.PI * HOP) / N;

    // 1. 分析: FFT と、位相の進み方から各ビンの本当の周波数を出す
    for (let k = 0; k < N; k++) {
      re[k] = this.inFIFO[k] * win[k];
      im[k] = 0;
    }
    fft.transform(re, im, false);
    let maxMag = 0;
    for (let k = 0; k <= HALF; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const phase = Math.atan2(im[k], re[k]);
      let d = phase - this.lastPhase[k] - k * expct;
      this.lastPhase[k] = phase;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      anaMag[k] = mag;
      anaFreq[k] = (k + (OSAMP * d) / (2 * Math.PI)) * freqPerBin;
      if (mag > maxMag) maxMag = mag;
    }

    // 2. スペクトル包絡(ケプストラムを低い方だけ残してなめらかにする)
    for (let k = 0; k <= HALF; k++) {
      cRe[k] = Math.log(anaMag[k] + 1e-9);
      cIm[k] = 0;
    }
    for (let k = HALF + 1; k < N; k++) {
      cRe[k] = cRe[N - k];
      cIm[k] = 0;
    }
    fft.transform(cRe, cIm, true);
    const L = this.lifter;
    for (let k = 0; k < N; k++) {
      const keep = k < L || k > N - L;
      cRe[k] = keep ? cRe[k] / N : 0;
      cIm[k] = keep ? cIm[k] / N : 0;
    }
    fft.transform(cRe, cIm, false);
    for (let k = 0; k <= HALF; k++) env[k] = Math.exp(cRe[k]);

    // 3. 倍音の山(ピーク)を探す
    const peaks = this.peaks;
    let np = 0;
    const floor = maxMag * 1e-4;
    for (let k = 2; k <= HALF - 2; k++) {
      const m = anaMag[k];
      if (m > floor && m > anaMag[k - 1] && m >= anaMag[k + 1] && m > anaMag[k - 2] && m >= anaMag[k + 2]) peaks[np++] = k;
    }

    // 4. 山ごとに「山のまわりのビン全部」をまとめてずらす(位相の関係を保つので濁りにくい)
    //    ずらした先で、響きの形(包絡)をフォルマント倍率で伸ばしたものに掛け替える
    const outRe = this.outRe;
    const outIm = this.outIm;
    outRe.fill(0);
    outIm.fill(0);
    const p = this.pitch;
    const f = this.formant;
    const warped = (k) => {
      const src = k / f;
      const i0 = Math.floor(src);
      return i0 >= HALF ? env[HALF] * 0.1 : env[i0] + (env[i0 + 1] - env[i0]) * (src - i0);
    };
    const newTheta = this.newTheta;
    for (let i = 0; i < np; i++) {
      const kp = peaks[i];
      const lo = i === 0 ? 0 : Math.ceil((peaks[i - 1] + kp) / 2);
      const hi = i === np - 1 ? HALF : Math.floor((kp + peaks[i + 1]) / 2);
      const fp = anaFreq[kp];
      const shift = Math.round((fp * p) / freqPerBin - kp);
      // 前のフレームで一番近かった山の回転を引き継ぎ、周波数の変化分だけ回す
      let prevTheta = 0;
      let bestDist = 4;
      for (let j = 0; j < this.prevCount; j++) {
        const dist = Math.abs(this.prevPeaks[j] - kp);
        if (dist < bestDist) {
          bestDist = dist;
          prevTheta = this.prevTheta[j];
        }
      }
      let theta = prevTheta + (2 * Math.PI * (fp * p - fp) * HOP) / sampleRate;
      theta -= 2 * Math.PI * Math.round(theta / (2 * Math.PI));
      newTheta[i] = theta;
      const c = Math.cos(theta);
      const sn = Math.sin(theta);
      for (let k = lo; k <= hi; k++) {
        const t = k + shift;
        if (t < 0 || t > HALF) continue;
        const g = warped(t) / env[k];
        outRe[t] += (re[k] * c - im[k] * sn) * g;
        outIm[t] += (re[k] * sn + im[k] * c) * g;
      }
    }
    this.prevPeaks.set(peaks.subarray(0, np));
    this.prevTheta.set(newTheta.subarray(0, np));
    this.prevCount = np;

    // 5. 音に戻して重ね合わせる
    for (let k = 0; k <= HALF; k++) {
      re[k] = outRe[k];
      im[k] = outIm[k];
    }
    for (let k = HALF + 1; k < N; k++) {
      re[k] = 0;
      im[k] = 0;
    }
    fft.transform(re, im, true);
    // 片側スペクトルなので実部を2倍/N。ハン窓を2回かけて4重に重ねると1.5倍になるので割る
    for (let k = 0; k < N; k++) this.outAccum[k] += (win[k] * 2 * re[k]) / N / 1.5;
    for (let k = 0; k < HOP; k++) this.outFIFO[k] = this.outAccum[k];
    this.outAccum.copyWithin(0, HOP);
    this.outAccum.fill(0, 2 * N - HOP);
    for (let k = 0; k < N - HOP; k++) this.inFIFO[k] = this.inFIFO[k + HOP];
  }
}

registerProcessor("voice-processor", VoiceProcessor);
