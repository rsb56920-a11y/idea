// 夜華カナタ 配信セット 共通エンジン
//   - OBS WebSocket v5 との接続(Python なしで、マイクの音量・表情の切り替えを受け取る)
//   - 夜空(星・流れ星・月・月下美人の花びら)の描画
//   - ちびカナタの動き(まばたき・口パク・呼吸・表情)
// 軽さ優先: 描画は 30fps まで、非表示のときは止まる。
(() => {
  const C = window.KANATA || {};

  // ---------- SHA-256(OBS のパスワード認証用。OBS のブラウザソースでは crypto.subtle が使えないことがあるため自前) ----------
  function sha256(bytes) {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[len] = 0x80;
    const bits = len * 8;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 4, bits >>> 0);
    dv.setUint32(total - 8, Math.floor(bits / 2 ** 32));
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }
      H[0] += a;
      H[1] += b;
      H[2] += c;
      H[3] += d;
      H[4] += e;
      H[5] += f;
      H[6] += g;
      H[7] += h;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes));

  // ---------- OBS WebSocket v5 ----------
  // 使い方: const obs = K.obs({ onEvent(type, data) {}, volume: true });
  //         obs.broadcast({ kanata: "expr", value: "angry" })  … ほかのカナタ部品へ合図を送る
  const EV_GENERAL = 1 << 0;
  const EV_SCENES = 1 << 2;
  const EV_VOLUME = 1 << 16; // マイクの音量(たくさん届くので、口パクの部品だけが使う)
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("kanata") : null;

  function obs({ onEvent: rawOnEvent = () => {}, volume = false, onStatus = () => {} } = {}) {
    // 合図は OBS 経由と BroadcastChannel 経由の2通りで届くことがあるので、同じものは1回だけ扱う
    const seen = new Set();
    const onEvent = (type, d) => {
      if (type === "kanata" && d?._id) {
        if (seen.has(d._id)) return;
        seen.add(d._id);
        if (seen.size > 200) seen.delete(seen.values().next().value);
      }
      rawOnEvent(type, d);
    };
    let ws = null;
    let id = 0;
    let ready = false;
    const pending = new Map();
    let retry = 1000;

    function connect() {
      try {
        ws = new WebSocket(`ws://127.0.0.1:${C.obsPort || 4455}`);
      } catch {
        return setTimeout(connect, retry);
      }
      ws.onmessage = (msg) => {
        const m = JSON.parse(msg.data);
        if (m.op === 0) {
          // Hello → Identify
          const d = { rpcVersion: 1, eventSubscriptions: EV_GENERAL | EV_SCENES | (volume ? EV_VOLUME : 0) };
          const a = m.d.authentication;
          if (a) {
            const secret = b64(sha256(utf8((C.obsPassword || "") + a.salt)));
            d.authentication = b64(sha256(utf8(secret + a.challenge)));
          }
          ws.send(JSON.stringify({ op: 1, d }));
        } else if (m.op === 2) {
          ready = true;
          retry = 1000;
          onStatus("ok");
        } else if (m.op === 5) {
          const { eventType, eventData } = m.d;
          if (eventType === "CustomEvent" && eventData?.kanata) onEvent("kanata", eventData);
          else onEvent(eventType, eventData);
        } else if (m.op === 7) {
          const p = pending.get(m.d.requestId);
          if (p) {
            pending.delete(m.d.requestId);
            p(m.d.responseData || {}, m.d.requestStatus);
          }
        }
      };
      ws.onclose = (e) => {
        ready = false;
        // 4009 = パスワードちがい
        onStatus(e.code === 4009 ? "auth" : "off");
        setTimeout(connect, retry);
        retry = Math.min(10000, retry * 2);
      };
      ws.onerror = () => {};
    }
    connect();

    function request(requestType, requestData = {}) {
      return new Promise((resolve) => {
        if (!ready) return resolve(null);
        const requestId = String(++id);
        pending.set(requestId, resolve);
        ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      });
    }
    // 同じブラウザの中(テスト用)でも届くように BroadcastChannel にも流す
    if (bc) bc.onmessage = (e) => e.data?.kanata && onEvent("kanata", e.data);
    return {
      request,
      broadcast(data) {
        const eventData = { kanata: true, _id: Math.random().toString(36).slice(2) + Date.now().toString(36), ...data };
        bc?.postMessage(eventData);
        return request("BroadcastCustomEvent", { eventData });
      },
      get ready() {
        return ready;
      },
    };
  }

  // ---------- 30fps までに抑えたアニメーションのループ ----------
  function loop(fn, fps = 30) {
    let last = 0;
    const step = 1000 / fps;
    const tick = (t) => {
      requestAnimationFrame(tick);
      if (t - last < step - 1) return;
      last = t;
      fn(t / 1000);
    };
    requestAnimationFrame(tick);
  }

  // ---------- 夜空 ----------
  // opts: { stars: 数, shooting: 流れ星の多さ(0〜1), petals: 花びらの数, moon: {x,y,r} | null, aurora: true }
  const moonCache = {};
  function moonImage(r) {
    if (moonCache[r]) return moonCache[r];
    const c = document.createElement("canvas");
    c.width = c.height = r * 2 + 4;
    const m = c.getContext("2d");
    m.fillStyle = "#ffecaa";
    m.beginPath();
    m.arc(r + 2, r + 2, r, 0, 6.29);
    m.fill();
    m.globalCompositeOperation = "destination-out";
    m.beginPath();
    m.arc(r + 2 + r * 0.42, r + 2 - r * 0.18, r * 0.9, 0, 6.29);
    m.fill();
    return (moonCache[r] = c);
  }

  function sky(canvas, opts = {}) {
    const g = canvas.getContext("2d");
    let W = 0;
    let H = 0;
    const rand = (a, b) => a + Math.random() * (b - a);
    const stars = [];
    const petals = [];
    const shooters = [];
    function resize() {
      W = canvas.width = canvas.clientWidth;
      H = canvas.height = canvas.clientHeight;
      stars.length = 0;
      const n = opts.stars ?? 160;
      for (let i = 0; i < n; i++) {
        const big = Math.random() < 0.08;
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: big ? rand(1.6, 2.6) : rand(0.5, 1.4),
          tw: rand(0.6, 2.2), // またたく速さ
          ph: Math.random() * 6.28,
          gold: Math.random() < 0.18,
          big,
          vx: rand(2, 6) * (big ? 1.4 : 1), // ゆっくり横に流れる
        });
      }
      petals.length = 0;
      for (let i = 0; i < (opts.petals ?? 10); i++) petals.push(newPetal(true));
    }
    function newPetal(anywhere) {
      return {
        x: rand(0, W),
        y: anywhere ? rand(0, H) : -20,
        s: rand(6, 12),
        vy: rand(12, 26),
        sway: rand(0.4, 1.2),
        ph: Math.random() * 6.28,
        rot: Math.random() * 6.28,
        vr: rand(-0.8, 0.8),
      };
    }
    window.addEventListener("resize", resize);
    resize();
    let lastT = 0;
    function draw(t) {
      const dt = Math.min(0.1, t - (lastT || t));
      lastT = t;
      g.clearRect(0, 0, W, H);
      // ゆっくり色が動くオーロラ(紫〜紺)
      if (opts.aurora !== false) {
        for (let i = 0; i < 2; i++) {
          const cx = W * (0.3 + 0.4 * i) + Math.sin(t * 0.05 + i * 2) * W * 0.12;
          const cy = H * (0.75 - 0.35 * i) + Math.cos(t * 0.04 + i) * H * 0.08;
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, W * 0.55);
          gr.addColorStop(0, i ? "rgba(91,63,168,0.28)" : "rgba(120,80,200,0.22)");
          gr.addColorStop(1, "rgba(31,26,58,0)");
          g.fillStyle = gr;
          g.fillRect(0, 0, W, H);
        }
      }
      // 月
      if (opts.moon) {
        const { x, y, r } = opts.moon;
        const mx = x * W;
        const my = y * H + Math.sin(t * 0.3) * 4;
        const glow = g.createRadialGradient(mx, my, r * 0.6, mx, my, r * 3.2);
        glow.addColorStop(0, "rgba(255,236,170,0.35)");
        glow.addColorStop(1, "rgba(255,236,170,0)");
        g.fillStyle = glow;
        g.beginPath();
        g.arc(mx, my, r * 3.2, 0, 6.29);
        g.fill();
        // 三日月は別の小さなキャンバスで作ってから貼る(夜空ごと消さないため)
        g.drawImage(moonImage(r), mx - r - 2, my - r - 2);
      }
      // 星
      for (const s of stars) {
        s.x -= s.vx * dt;
        if (s.x < -4) s.x = W + 4;
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph));
        g.fillStyle = s.gold ? `rgba(255,236,170,${a})` : `rgba(235,230,255,${a})`;
        if (s.big) {
          // 大きい星はキラッと十字に光る
          const L = s.r * 4 * a;
          g.fillRect(s.x - L, s.y - 0.6, L * 2, 1.2);
          g.fillRect(s.x - 0.6, s.y - L, 1.2, L * 2);
        }
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, 6.29);
        g.fill();
      }
      // 流れ星
      if (Math.random() < (opts.shooting ?? 0.5) * dt * 0.35) {
        shooters.push({ x: rand(W * 0.2, W), y: rand(0, H * 0.4), vx: -rand(700, 1100), vy: rand(250, 420), life: 1 });
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt * 1.3;
        if (s.life <= 0) {
          shooters.splice(i, 1);
          continue;
        }
        const tx = s.x - s.vx * 0.12;
        const ty = s.y - s.vy * 0.12;
        const gr = g.createLinearGradient(s.x, s.y, tx, ty);
        gr.addColorStop(0, `rgba(255,246,210,${s.life})`);
        gr.addColorStop(1, "rgba(255,246,210,0)");
        g.strokeStyle = gr;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.lineTo(tx, ty);
        g.stroke();
      }
      // 月下美人の花びら(白くふわっと落ちる)
      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];
        p.y += p.vy * dt;
        p.x += Math.sin(t * p.sway + p.ph) * 18 * dt;
        p.rot += p.vr * dt;
        if (p.y > H + 20) petals[i] = newPetal(false);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = "rgba(255,255,250,0.75)";
        g.beginPath();
        g.ellipse(0, 0, p.s * 0.38, p.s, 0, 0, 6.29);
        g.fill();
        g.restore();
      }
    }
    return { draw, resize };
  }

  // ---------- ちびカナタの動き ----------
  // el: 画像を重ねて入れる箱。frames: { open_closed, blink_closed, open_talk, blink_talk, angry, sad } の画像パス
  // まばたき: 2.5〜5.5秒おき(ときどき2回つづけて)。口: 音量で開閉(少しだけ余韻を残す)。
  // 呼吸で少し上下し、話しているときは小さく弾む。表情は ふわっと切り替わる。
  function chibi(el, frames, { bob = 6, breathe = 0.012, talkBounce = 5 } = {}) {
    const imgs = {};
    for (const [k, src] of Object.entries(frames)) {
      const im = new Image();
      im.src = src;
      im.alt = "";
      im.className = "chibi-frame";
      im.style.opacity = k === "open_closed" ? "1" : "0";
      el.appendChild(im);
      imgs[k] = im;
    }
    let eye = "open";
    let mouth = "closed";
    let expr = "normal";
    let exprUntil = 0;
    let talkUntil = 0;
    let nextBlink = performance.now() / 1000 + 2 + Math.random() * 2;
    let blinkEnd = 0;
    let doubleBlink = false;
    let bounce = 0;
    let cur = "open_closed";

    function show(key) {
      if (key === cur) return;
      imgs[cur].style.opacity = "0";
      imgs[key].style.opacity = "1";
      cur = key;
    }
    function update(t) {
      if (t >= nextBlink && eye === "open") {
        eye = "blink";
        blinkEnd = t + 0.12;
      }
      if (eye === "blink" && t >= blinkEnd) {
        eye = "open";
        if (!doubleBlink && Math.random() < 0.2) {
          doubleBlink = true;
          nextBlink = t + 0.18;
        } else {
          doubleBlink = false;
          nextBlink = t + 2.5 + Math.random() * 3;
        }
      }
      const talking = t < talkUntil;
      mouth = talking ? "talk" : "closed";
      if (expr !== "normal" && exprUntil && t > exprUntil) expr = "normal";
      show(expr !== "normal" && imgs[expr] ? expr : `${eye}_${mouth === "talk" ? "talk" : "closed"}`);
      // 呼吸・ゆれ・話すときの弾み
      bounce += ((talking ? 1 : 0) - bounce) * 0.25;
      const y = Math.sin(t * 1.6) * bob + -Math.abs(Math.sin(t * 14)) * talkBounce * bounce;
      const s = 1 + Math.sin(t * 1.6) * breathe;
      el.style.transform = `translateY(${y.toFixed(2)}px) scale(${(s + bounce * 0.01).toFixed(4)}, ${(s - bounce * 0.005).toFixed(4)}) rotate(${(Math.sin(t * 0.7) * 0.8).toFixed(2)}deg)`;
    }
    return {
      update,
      // 声(音量)が来ている間、口をあける。hold 秒だけ余韻を残す
      talk(hold = 0.14) {
        talkUntil = performance.now() / 1000 + hold;
      },
      setExpr(e, seconds = 0) {
        expr = e;
        exprUntil = seconds ? performance.now() / 1000 + seconds : 0;
      },
      get expr() {
        return expr;
      },
    };
  }

  // 口パクと表情を OBS につなぐ(pngtuber と マップ隠し で共通)
  function connectChibi(c, { onStatus, onKanata = () => {} } = {}) {
    let loudSince = 0;
    const o = obs({
      volume: true,
      onStatus,
      onEvent(type, d) {
        if (type === "InputVolumeMeters") {
          const now = performance.now() / 1000;
          for (const inp of d.inputs || []) {
            if (inp.inputName !== (C.micName || "マイク") || !inp.inputLevelsMul?.length) continue;
            const peak = Math.max(...inp.inputLevelsMul.map((ch) => ch[1] || 0));
            const db = peak > 0 ? 20 * Math.log10(peak) : -100;
            if (db > (C.mouthThresholdDb ?? -38)) c.talk();
            // 大きな声が続いたら、自動で3秒おこ顔
            if (db > -10) {
              loudSince ||= now;
              if (now - loudSince > 0.8 && c.expr === "normal") c.setExpr("angry", 3);
            } else loudSince = 0;
          }
        } else if (type === "kanata") {
          if (d.type === "expr") c.setExpr(d.value, d.seconds || 0);
          // コメントが来たら、読み上げているように少し口を動かす
          if (d.type === "chat") {
            let n = 0;
            const iv = setInterval(() => {
              c.talk(0.12);
              if (++n > 6) clearInterval(iv);
            }, 170);
          }
          if (d.type === "follow" || d.type === "raid" || d.type === "sub") c.setExpr("normal");
          onKanata(d);
        }
      },
    });
    return o;
  }

  // 時計("21:05:09" と "9月26日(金)")
  function clock() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const wd = "日月火水木金土"[d.getDay()];
    return { time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, date: `${d.getMonth() + 1}月${d.getDate()}日(${wd})` };
  }

  window.K = { C, obs, loop, sky, chibi, connectChibi, clock, sha256, b64, utf8 };
})();
