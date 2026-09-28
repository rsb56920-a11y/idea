// 写真の一部を動かす(シネマグラフ)。なぞった場所(マスク)だけ、流れる・揺れる・ゆらめく・立ちのぼる。
// WebGL で1コマずつ描くので、1080p でもなめらか。プレビューと書き出しは同じ時刻 t から同じ絵になる。

export const REGION_FX = {
  flow: { name: "〰️ 流れる(水・雲)", color: [60, 160, 255] },
  wave: { name: "🌊 水面がゆれる", color: [40, 220, 220] },
  sway: { name: "🍃 風でゆれる(髪・木・草)", color: [80, 230, 110] },
  flicker: { name: "🔥 ゆらめく(炎・陽炎)", color: [255, 140, 40] },
  rise: { name: "♨️ 立ちのぼる(湯気・煙)", color: [230, 230, 230] },
};
const CH = { flow: 0, wave: 0, sway: 1, flicker: 2, rise: 3 }; // マスクの色の成分(流れと波は同じ成分、種類は別の値で切り替え)
export const MASK_MAX = 512; // マスクの細かさ(長い辺)

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D img, msk;
uniform float t, speed, wave;
uniform vec2 dir, px;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ return n(p) * .55 + n(p * 2.1) * .3 + n(p * 4.3) * .15; }
// ループする流れ: 2つの位相を交互に重ねて、途切れずに流れ続けるように見せる
vec3 flowAt(vec2 st, vec2 d, float amt, float sp){
  float P = 4.0 / sp;
  float a = fract(t / P), b = fract(t / P + .5);
  vec2 wob = (vec2(fbm(st * 6. + t * .15), fbm(st * 6. - t * .15)) - .5) * .004;
  vec3 c1 = texture(img, st - d * (a - .5) * amt + wob).rgb;
  vec3 c2 = texture(img, st - d * (b - .5) * amt - wob).rgb;
  return mix(c1, c2, abs(1. - 2. * a));
}
void main(){
  vec4 m = texture(msk, uv);
  vec3 base = texture(img, uv).rgb;
  vec3 col = base;
  float sp = speed;
  // 流れる(水・雲)/ 水面がゆれる
  if (m.r > .003) {
    vec3 f;
    if (wave > .5) {
      vec2 w = vec2(sin(uv.y * 90. + t * 2.2 * sp + fbm(uv * 8.) * 6.) * .0025, sin(uv.x * 55. + t * 1.7 * sp) * .0018);
      f = texture(img, uv + w * m.r).rgb;
      f += (fbm(uv * vec2(20., 60.) + vec2(t * .4 * sp, 0.)) - .5) * .06; // きらめき
    } else {
      f = flowAt(uv, dir, .05, sp);
    }
    col = mix(col, f, m.r);
  }
  // 風でゆれる: 横にゆらゆら(ところどころ強い風)
  if (m.g > .003) {
    float gust = .6 + .4 * sin(t * .7 * sp);
    float s = sin(t * 1.8 * sp + uv.y * 7. + fbm(uv * 3. + t * .2) * 3.) * .006 * gust;
    float s2 = (fbm(uv * 9. + vec2(t * .6 * sp, 0.)) - .5) * .004;
    vec3 f = texture(img, uv + vec2(s + s2, s2 * .5) * m.g).rgb;
    col = mix(col, f, clamp(m.g * 1.5, 0., 1.));
  }
  // ゆらめく(炎・陽炎): 細かくゆがんで、明るさもちらつく
  if (m.b > .003) {
    vec2 d = (vec2(fbm(uv * 25. + vec2(0., -t * 3. * sp)), fbm(uv * 25. + vec2(5., -t * 2.6 * sp))) - .5) * .012;
    vec3 f = texture(img, uv + d * m.b).rgb;
    f *= 1. + (fbm(vec2(t * 4. * sp, uv.x * 3.)) - .5) * .25;
    col = mix(col, f, m.b);
  }
  // 立ちのぼる(湯気・煙): 上へ流れながら、うずを巻く
  if (m.a > .003) {
    vec2 sw = (vec2(fbm(uv * 10. + vec2(0., t * .5)), fbm(uv * 10. + vec2(3., t * .5))) - .5) * .02;
    vec3 f = flowAt(uv + sw * m.a, vec2(0., -1.), .06, sp * .8);
    float wisp = smoothstep(.45, .8, fbm(uv * vec2(6., 3.) + vec2(0., t * .35 * sp))) * .25 * m.a;
    col = mix(col, f, m.a) + wisp;
  }
  o = vec4(col, 1.);
}`;

export class MotionRenderer {
  constructor() {
    this.canvas = document.createElement("canvas");
    const gl = (this.gl = this.canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true }));
    if (!gl) return;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pr = (this.pr = gl.createProgram());
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const k of ["img", "msk", "t", "speed", "wave", "dir", "px"]) this.u[k] = gl.getUniformLocation(pr, k);
    gl.uniform1i(this.u.img, 0);
    gl.uniform1i(this.u.msk, 1);
    this.tex = new Map(); // slide → { img, msk, ver }
  }
  get ok() {
    return !!this.gl;
  }
  texFrom(src, old) {
    const gl = this.gl;
    const tx = old || gl.createTexture();
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    if (src.data instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.w, src.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    return tx;
  }
  // slide: { img, work(縮小した写真), maskData({data,w,h}), maskVer, flowDir, waveMode }
  render(slide, t, speed = 1) {
    const gl = this.gl;
    const W = slide.work.width, H = slide.work.height;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    let e = this.tex.get(slide);
    if (!e) {
      e = { img: this.texFrom(slide.work), msk: null, ver: -1 };
      this.tex.set(slide, e);
    }
    if (e.ver !== slide.maskVer) {
      e.msk = this.texFrom(slide.maskData, e.msk);
      e.ver = slide.maskVer;
    }
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, e.img);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, e.msk);
    gl.uniform1f(this.u.t, t);
    gl.uniform1f(this.u.speed, speed);
    gl.uniform1f(this.u.wave, slide.waveMode ? 1 : 0);
    const d = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[slide.flowDir || "right"];
    gl.uniform2f(this.u.dir, d[0], d[1]);
    gl.uniform2f(this.u.px, 1 / W, 1 / H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
  forget(slide) {
    const e = this.tex.get(slide);
    if (!e) return;
    this.gl.deleteTexture(e.img);
    if (e.msk) this.gl.deleteTexture(e.msk);
    this.tex.delete(slide);
  }
}

// ---------- マスク(どこを動かすか) ----------
// 効果ごとに白黒のキャンバスを持ち、使うときに1枚の色つきマスクにまとめる(ふちは、ぼかしてなじませる)
export function newMasks(img) {
  const sc = Math.min(1, MASK_MAX / Math.max(img.width, img.height));
  const w = Math.max(8, Math.round(img.width * sc)), h = Math.max(8, Math.round(img.height * sc));
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  return { flow: mk(), sway: mk(), flicker: mk(), rise: mk(), w, h };
}

export function hasPaint(c) {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 16) if (d[i] > 10) return true;
  return false;
}

// 自動で場所を見つける: 空(上のほうで明るい・青い所)、水(下のほうで青っぽい所)
export function autoMask(img, area, target) {
  const w = target.width, h = target.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const out = target.getContext("2d").getImageData(0, 0, w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    const fy = y / h;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = src[i], gg = src[i + 1], b = src[i + 2];
      const lum = 0.3 * r + 0.59 * gg + 0.11 * b;
      let v = 0;
      if (area === "sky") {
        const skyish = (b > r + 10 && b > 90) || lum > 185;
        v = skyish ? Math.min(1, Math.max(0, (0.65 - fy) / 0.2)) : 0;
      } else if (area === "water") {
        const waterish = b > r + 5 && b >= gg - 25 && lum < 220;
        v = waterish ? Math.min(1, Math.max(0, (fy - 0.35) / 0.15)) : 0;
      }
      o[i] = o[i + 1] = o[i + 2] = 255;
      o[i + 3] = Math.round(v * 255);
    }
  }
  target.getContext("2d").putImageData(out, 0, 0);
  return target;
}

// 4つの白黒マスクを、ぼかして1つの色つきマスク(生のデータ)にまとめる。
// キャンバスに入れると透明の所で色が消えるので、データのまま GPU に送る
export function combineMasks(masks) {
  const { w, h } = masks;
  const blur = Math.max(2, Math.round(Math.max(w, h) / 90));
  const chan = ["flow", "sway", "flicker", "rise"].map((k) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.filter = `blur(${blur}px)`;
    g.drawImage(masks[k], 0, 0);
    return g.getImageData(0, 0, w, h).data;
  });
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = chan[0][i + 3];
    data[i + 1] = chan[1][i + 3];
    data[i + 2] = chan[2][i + 3];
    data[i + 3] = chan[3][i + 3];
  }
  return { data, w, h };
}

export const fxChannel = (fx) => ["flow", "sway", "flicker", "rise"][CH[fx]];
