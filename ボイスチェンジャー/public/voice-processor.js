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
    this.breath = 0; // 息っぽさ 0〜1
    this.inton = 1; // 抑揚の強さ(1 = そのまま、1.2 = 上がり下がりを2割大きく)
    this.gateDb = -120; // これより小さい音は消す(ノイズゲート)
    this.baseF0 = 0; // 測定したふだんの声の高さ(抑揚の中心)
    this.keepConsonants = true; // 子音(息の音)は高さを変えない
    this.fastOnset = true; // 声の始まりをすぐに判定する
    this.splitBand = true; // 2.5kHz 未満はいつも声の高さで動かす
    this.voicedGain = true; // 音量合わせは声の部分だけで行う
    this.soft = 0; // やわらかさ(dB): 声の一番低い倍音(第1倍音)を強める。女性の声の特徴
    // 変換後の音量を元の声に合わせる(倍音の数が減ると小さく聞こえるため)
    this.gain = 1;
    this.gainState = [
      { inPow: 1e-6, outPow: 1e-6, gain: 1 }, // 子音・無声
      { inPow: 1e-6, outPow: 1e-6, gain: 1 }, // 声
    ];
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
    this.ac = new Float64Array(N);
    this.logA = new Float64Array(HALF + 1);
    // 窓の自己相関(自己相関を窓の形で割って偏りをなくすため)
    this.wac = new Float64Array(N);
    for (let l = 0; l < N; l++) {
      let s = 0;
      for (let i = 0; i + l < N; i++) s += this.win[i] * this.win[i + l];
      this.wac[l] = s;
    }
    this.voicing = 0; // 有声(声帯が振動している)らしさ 0〜1
    this.logMean = 0; // 声の高さの平均(対数)
    this.gateGain = 1;
    // 息の音(子音)のときに、ケプストラムで残す係数の数。小さいほど包絡がなめらか
    this.lifter = Math.max(20, Math.round(sampleRate / 1000));
    // ノイズゲートが閉じている間は音量合わせを止めるための印
    this.gateOpen = true;
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
        // 約0.3秒の平均パワーで音量を元の声に合わせる。無音時は上げすぎない
        // 声(母音)と子音で倍率を分ける(1つだと、声を戻す倍率で子音まで大きくなる)
        const a = 1 / (0.3 * sampleRate);
        const v = this.voicing > 0.5 ? 1 : 0;
        const st = this.voicedGain ? this.gainState[v] : this.gainState[1];
        st.inPow += (dry * dry - st.inPow) * a;
        st.outPow += (wet * wet - st.outPow) * a;
        const target =
          st.inPow > 1e-7 && this.gateOpen ? Math.min(4, Math.max(0.25, Math.sqrt(st.inPow / (st.outPow + 1e-12)))) : st.gain;
        st.gain += (target - st.gain) * a * 4;
        // 切り替わりでぷつっとしないよう、使う倍率はなめらかに移す
        const g = this.voicedGain ? this.gainState[1].gain * this.voicing + this.gainState[0].gain * (1 - this.voicing) : st.gain;
        this.gain += (g - this.gain) * 0.01;
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

  // 分析済みの re/im(窓をかけた入力のFFT)から、声の高さ・はっきりさ・音の強さを出す
  analyzePitch() {
    const { re, im, ac, wac, fft } = this;
    const aRe = this.cRe;
    const aIm = this.cIm;
    for (let k = 0; k < N; k++) {
      aRe[k] = re[k] * re[k] + im[k] * im[k];
      aIm[k] = 0;
    }
    fft.transform(aRe, aIm, true);
    for (let l = 0; l < N; l++) ac[l] = aRe[l] / N / wac[l];
    const power = ac[0];
    if (power <= 0) return { f0: 0, clarity: 0, power: 0 };
    const minLag = Math.floor(sampleRate / 500);
    const maxLag = Math.min(HALF - 1, Math.floor(sampleRate / 60));
    let mx = 0;
    for (let l = minLag; l <= maxLag; l++) if (ac[l] > mx) mx = ac[l];
    // 最大値の9割を超える最初の山 = 本当の周期(倍の周期を拾わないため)
    for (let l = minLag + 1; l < maxLag; l++) {
      if (ac[l] > 0.9 * mx && ac[l] >= ac[l - 1] && ac[l] >= ac[l + 1]) {
        const a = ac[l - 1];
        const b = ac[l];
        const c = ac[l + 1];
        const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
        return { f0: sampleRate / (l + shift), clarity: b / power, power };
      }
    }
    return { f0: 0, clarity: 0, power };
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

    // 1b. 声の高さと「声か息か」を自己相関で調べる(パワースペクトルの逆FFT = 自己相関)
    const { f0, clarity, power } = this.analyzePitch();
    const voiced = clarity > 0.5 && power > 1e-7;
    // 声が始まったらすぐに「声」と判断する(遅れると、音節の頭で高さが遅れて上がる「しゃくり」が出る)
    this.voicing = voiced && this.fastOnset ? 1 : this.voicing + ((voiced ? 1 : 0) - this.voicing) * 0.5;
    if (voiced) {
      const lf = Math.log(f0);
      if (!this.logMean) this.logMean = this.baseF0 ? Math.log(this.baseF0) : lf;
      this.logMean += (lf - this.logMean) * 0.01;
    }

    // 1c. ノイズゲート(話していない時の雑音を消す)
    const db = 10 * Math.log10(power + 1e-20);
    const gateTarget = db > this.gateDb ? 1 : 0.03;
    this.gateGain += (gateTarget - this.gateGain) * (gateTarget > this.gateGain ? 0.7 : 0.2);
    this.gateOpen = this.gateGain > 0.5;

    // 2. スペクトル包絡(True Envelope 法: ケプストラムでなめらかにしては山に合わせて持ち上げる、を繰り返す)
    //    ただのケプストラムだと倍音と倍音の谷に引っぱられて包絡が低く・ぼやけるので、響きがこもる
    //    なめらかさは声の高さに合わせる(周期の半分まで)。低い声ほど細かく響きを拾える
    //    (合成音での評価: 固定48だと倍音のずれ 4.1dB → 声に合わせると 1.0dB)
    const L = voiced ? Math.max(24, Math.min(HALF - 1, Math.round((0.5 * sampleRate) / f0))) : this.lifter;
    const logA = this.logA;
    for (let k = 0; k <= HALF; k++) logA[k] = Math.log(anaMag[k] + 1e-9);
    for (let iter = 0; iter < 4; iter++) {
      for (let k = 0; k <= HALF; k++) {
        cRe[k] = logA[k];
        cIm[k] = 0;
      }
      for (let k = HALF + 1; k < N; k++) {
        cRe[k] = cRe[N - k];
        cIm[k] = 0;
      }
      fft.transform(cRe, cIm, true);
      for (let k = 0; k < N; k++) {
        const keep = k < L || k > N - L;
        cRe[k] = keep ? cRe[k] / N : 0;
        cIm[k] = keep ? cIm[k] / N : 0;
      }
      fft.transform(cRe, cIm, false);
      if (iter < 3) for (let k = 0; k <= HALF; k++) logA[k] = Math.max(logA[k], cRe[k]);
    }
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
    // 声の部分だけ高さを変える。子音(息の音)は元の高さのまま、響きだけ変える
    let pv = this.pitch;
    if (voiced && this.inton !== 1 && this.logMean) {
      pv *= Math.exp((this.inton - 1) * (Math.log(f0) - this.logMean));
      pv = Math.min(this.pitch * 1.5, Math.max(this.pitch / 1.5, pv));
    }
    const pc = this.keepConsonants ? 1 + (pv - 1) * this.voicing : pv;
    const f = this.formant;
    const warped = (k) => {
      const src = k / f;
      const i0 = Math.floor(src);
      return i0 >= HALF ? env[HALF] * 0.1 : env[i0] + (env[i0 + 1] - env[i0]) * (src - i0);
    };
    const newTheta = this.newTheta;
    for (let i = 0; i < np; i++) {
      const kp = peaks[i];
      // 山の範囲: となりの山との中間まで。ただし窓の主な山の幅(±3ビン)を超えない
      //   (広く取ると、0Hz付近の残りかすや別の倍音のすそまで回転させてしまい、ありもしない音が出る)
      const lo = Math.max(2, kp - 3, i === 0 ? 0 : Math.ceil((peaks[i - 1] + kp) / 2));
      const hi = Math.min(kp + 3, i === np - 1 ? HALF : Math.floor((kp + peaks[i + 1]) / 2));
      const fp = anaFreq[kp];
      // 声の倍音がある低い音域(2.5kHz 未満)はいつも声の高さで動かし、子音の雑音が多い高い音域だけ判定に従う
      const p = this.splitBand && fp < 2500 ? pv : pc;
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
      // 響きの掛け替えは山ごとに1つの倍率で(ビンごとに変えると山の形がくずれ、すその雑音が増える)
      const tp = kp + shift;
      if (tp < 1 || tp > HALF) continue;
      let g = warped(tp) / env[kp];
      // やわらかさ: 変換後の第1倍音(基本周波数)の山だけを持ち上げる
      if (this.soft && voiced && Math.abs(fp * p - f0 * p) < f0 * p * 0.3) g *= Math.pow(10, (this.soft * this.voicing) / 20);
      const c = Math.cos(theta) * g;
      const sn = Math.sin(theta) * g;
      for (let k = lo; k <= hi; k++) {
        const t = k + shift;
        if (t < 0 || t > HALF) continue;
        outRe[t] += re[k] * c - im[k] * sn;
        outIm[t] += re[k] * sn + im[k] * c;
      }
    }
    // 息っぽさ: 声の部分に、響きの形に沿った息の音(1.2kHz より上)を足す
    if (this.breath > 0 && this.voicing > 0.1) {
      const amt = this.breath * this.voicing * 0.12;
      for (let k = 0; k <= HALF; k++) {
        const hz = k * freqPerBin;
        if (hz < 1200) continue;
        const ramp = Math.min(1, (hz - 1200) / 1800);
        const m = amt * ramp * warped(k);
        const ph = Math.random() * 2 * Math.PI;
        outRe[k] += m * Math.cos(ph);
        outIm[k] += m * Math.sin(ph);
      }
    }
    if (this.gateGain < 0.999) {
      for (let k = 0; k <= HALF; k++) {
        outRe[k] *= this.gateGain;
        outIm[k] *= this.gateGain;
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
