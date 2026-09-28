// 画面全体にかける効果: 舞うもの(桜・雪・雨…)・色の雰囲気・光。
// どれも時刻 t だけで形が決まるので、プレビューと書き出しがまったく同じになる。

// 決まった乱数(k 番目の粒の性質)
const rnd = (k, s = 0) => {
  const v = Math.sin(k * 127.1 + s * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

export const PARTICLES = {
  sakura: { name: "🌸 桜", count: 60 },
  snow: { name: "❄️ 雪", count: 140 },
  rain: { name: "☔ 雨", count: 220 },
  leaves: { name: "🍁 紅葉", count: 40 },
  glow: { name: "✨ 光の粒", count: 60 },
  stars: { name: "⭐ 星がまたたく", count: 120 },
  shooting: { name: "🌠 流れ星", count: 3 },
  hearts: { name: "💗 ハート", count: 30 },
  confetti: { name: "🎉 紙吹雪", count: 120 },
  bubbles: { name: "🫧 シャボン玉", count: 25 },
  feathers: { name: "🪶 羽", count: 18 },
  fireworks: { name: "🎆 花火", count: 4 },
};

export const GRADES = {
  sunset: { name: "🌇 夕焼け" },
  night: { name: "🌙 夜" },
  film: { name: "📼 フィルム(思い出)" },
  dream: { name: "☁️ 夢のように" },
  mono: { name: "🖤 白黒" },
  vivid: { name: "🌈 あざやか" },
  cool: { name: "🧊 すずしげ" },
};

// 舞うものを描く。amount: 0.5〜2(量)
export function drawParticles(ctx, type, t, W, H, amount = 1) {
  const P = PARTICLES[type];
  if (!P) return;
  const n = Math.round(P.count * amount);
  const u = Math.min(W, H) / 1080; // 画面の大きさに合わせた単位
  ctx.save();
  for (let k = 0; k < n; k++) {
    const a = rnd(k, 1), b = rnd(k, 2), c = rnd(k, 3), d = rnd(k, 4);
    switch (type) {
      case "sakura":
      case "leaves":
      case "feathers": {
        // ひらひら落ちる: 横に揺れながら、くるくる回る
        const fall = type === "feathers" ? 0.05 : 0.09;
        const sp = fall * (0.6 + b * 0.8);
        const y = ((c + t * sp) % 1.1) * H * 1.1 - H * 0.05;
        const x = (a * W * 1.2 - W * 0.1 + Math.sin(t * (0.8 + d) + k) * W * 0.05 + t * W * 0.02 * (type === "leaves" ? 1 : 0.5)) % (W * 1.2);
        const s = (type === "feathers" ? 26 : type === "leaves" ? 20 : 14) * (0.6 + b * 0.8) * u;
        const rot = t * (1 + d * 2) + k;
        const flip = Math.abs(Math.cos(t * (1.5 + a) + k)); // 裏返りながら落ちる
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(1, 0.3 + 0.7 * flip);
        ctx.globalAlpha = 0.9;
        if (type === "sakura") {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
          g.addColorStop(0, "#fff0f5");
          g.addColorStop(1, "#ffb7cf");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.6, 0, s);
          ctx.bezierCurveTo(-s * 0.7, s * 0.6, -s * 0.9, -s * 0.6, -s * 0.2, -s * 0.9);
          ctx.lineTo(0, -s * 0.7);
          ctx.fill();
        } else if (type === "leaves") {
          ctx.fillStyle = ["#e0452b", "#f08a24", "#c9352a", "#e8b32c"][k % 4];
          ctx.beginPath();
          for (let q = 0; q < 10; q++) {
            const ang = (q / 10) * Math.PI * 2;
            const r = q % 2 ? s * 0.45 : s;
            ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          }
          ctx.fill();
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 1.5 * u;
          ctx.fillStyle = "rgba(255,255,255,0.75)";
          ctx.beginPath();
          ctx.ellipse(0, 0, s * 0.3, s, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(0, s);
          ctx.lineTo(0, -s);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case "snow": {
        const sp = 0.05 + b * 0.07;
        const y = ((c + t * sp) % 1) * H;
        const x = (a * W + Math.sin(t * (0.5 + d) + k) * 30 * u + W) % W;
        const r = (1.5 + b * 4) * u;
        ctx.globalAlpha = 0.5 + b * 0.5;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "rain": {
        const sp = 1.2 + b * 0.8;
        const y = ((c + t * sp) % 1.2) * H - H * 0.1;
        const x = (a * W * 1.2 + y * 0.12) % (W * 1.2);
        const len = (30 + b * 50) * u;
        ctx.globalAlpha = 0.25 + b * 0.35;
        ctx.strokeStyle = "#dfe8ff";
        ctx.lineWidth = (1 + b) * u;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len * 0.12, y + len);
        ctx.stroke();
        break;
      }
      case "glow":
      case "bubbles": {
        // ふわふわ上っていく
        const sp = (type === "bubbles" ? 0.06 : 0.03) * (0.6 + b);
        const y = H * 1.05 - ((c + t * sp) % 1.15) * H;
        const x = a * W + Math.sin(t * (0.6 + d) + k * 2) * 40 * u;
        const r = (type === "bubbles" ? 22 + b * 40 : 3 + b * 7) * u;
        if (type === "glow") {
          const tw = 0.5 + 0.5 * Math.sin(t * (2 + d * 3) + k);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
          g.addColorStop(0, `rgba(255,245,200,${0.9 * tw})`);
          g.addColorStop(1, "rgba(255,245,200,0)");
          ctx.fillStyle = g;
          ctx.globalCompositeOperation = "lighter";
          ctx.beginPath();
          ctx.arc(x, y, r * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        } else {
          const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
          g.addColorStop(0, "rgba(255,255,255,0.5)");
          g.addColorStop(0.7, `hsla(${(k * 40 + t * 30) % 360},80%,80%,0.15)`);
          g.addColorStop(1, "rgba(255,255,255,0.45)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "stars": {
        // 上半分でまたたく
        const x = a * W;
        const y = b * b * H * 0.6;
        const tw = Math.max(0, Math.sin(t * (1 + d * 3) + k * 3));
        const r = (1 + c * 2.5) * u;
        ctx.globalAlpha = 0.3 + 0.7 * tw;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (c > 0.8) {
          ctx.strokeStyle = `rgba(255,255,255,${0.6 * tw})`;
          ctx.lineWidth = u;
          ctx.beginPath();
          ctx.moveTo(x - r * 5, y);
          ctx.lineTo(x + r * 5, y);
          ctx.moveTo(x, y - r * 5);
          ctx.lineTo(x, y + r * 5);
          ctx.stroke();
        }
        break;
      }
      case "shooting": {
        const period = 3.5;
        const ph = ((t + k * 1.3) % period) / period;
        if (ph > 0.3) break;
        const q = ph / 0.3;
        const x0 = (0.3 + a * 0.7) * W, y0 = b * H * 0.3;
        const x = x0 - q * W * 0.5, y = y0 + q * H * 0.25;
        const g = ctx.createLinearGradient(x, y, x + W * 0.15, y - H * 0.075);
        g.addColorStop(0, `rgba(255,255,255,${1 - q})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + W * 0.15, y - H * 0.075);
        ctx.stroke();
        break;
      }
      case "hearts": {
        const sp = 0.05 * (0.6 + b);
        const y = H * 1.05 - ((c + t * sp) % 1.15) * H;
        const x = a * W + Math.sin(t + k) * 30 * u;
        const s = (14 + b * 22) * u;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = ["#ff5d8f", "#ff8fb1", "#ffc2d4"][k % 3];
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.35);
        ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s, x, y - s * 0.4);
        ctx.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.4, x, y + s * 0.35);
        ctx.fill();
        break;
      }
      case "confetti": {
        const sp = 0.12 * (0.6 + b);
        const y = ((c + t * sp) % 1.1) * H * 1.1 - H * 0.05;
        const x = (a * W + Math.sin(t * 2 + k) * 25 * u + W) % W;
        const s = (8 + b * 10) * u;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * (2 + d * 4) + k);
        ctx.scale(1, Math.cos(t * 5 + k));
        ctx.fillStyle = `hsl(${(k * 47) % 360},90%,60%)`;
        ctx.fillRect(-s / 2, -s / 4, s, s / 2);
        ctx.restore();
        break;
      }
      case "fireworks": {
        const period = 2.6;
        const ph = ((t + k * 0.9) % period) / period;
        const cx = (0.15 + a * 0.7) * W, cy = (0.12 + b * 0.3) * H;
        const hue = (k * 90 + Math.floor((t + k * 0.9) / period) * 50) % 360;
        const R = (180 + c * 160) * u * Math.min(1, ph * 3);
        const fade = Math.max(0, 1 - ph * 1.3);
        ctx.globalCompositeOperation = "lighter";
        for (let q = 0; q < 36; q++) {
          const ang = (q / 36) * Math.PI * 2;
          const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R + ph * ph * 80 * u;
          ctx.fillStyle = `hsla(${hue},100%,65%,${fade})`;
          ctx.beginPath();
          ctx.arc(x, y, 3.5 * u, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
        break;
      }
    }
  }
  ctx.restore();
}

// 色の雰囲気(描いたあとに上から重ねる)
export function drawGrade(ctx, grade, W, H, t) {
  if (!grade) return;
  ctx.save();
  switch (grade) {
    case "sunset": {
      ctx.globalCompositeOperation = "soft-light";
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "rgba(255,120,60,0.75)");
      g.addColorStop(1, "rgba(120,40,120,0.6)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "screen";
      const s = ctx.createRadialGradient(W * 0.7, H * 0.25, 0, W * 0.7, H * 0.25, W * 0.8);
      s.addColorStop(0, "rgba(255,170,90,0.35)");
      s.addColorStop(1, "rgba(255,170,90,0)");
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "night": {
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgba(60,80,150,0.85)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(20,30,70,0.25)";
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "cool": {
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(80,170,255,0.6)";
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "film": {
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(255,190,120,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      // 粒子(フィルムのざらつき): フレームごとに変わる
      const f = Math.floor(t * 24);
      ctx.globalAlpha = 0.07;
      for (let k = 0; k < 900; k++) {
        ctx.fillStyle = rnd(k, f) > 0.5 ? "#fff" : "#000";
        ctx.fillRect(rnd(k * 3, f) * W, rnd(k * 7, f) * H, 2, 2);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "dream": {
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(255,220,240,0.18)";
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "vivid":
    case "mono":
      break; // フィルターで処理(applyFilter)
  }
  ctx.restore();
  // 周辺を少し暗く(映画っぽく)
  if (grade === "film" || grade === "night" || grade === "sunset" || grade === "dream") {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${grade === "dream" ? 0.25 : 0.5})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
}

// 画像を描くときのフィルター(白黒・あざやか・夢)
export function filterOf(grade) {
  return grade === "mono" ? "grayscale(1) contrast(1.1)" : grade === "vivid" ? "saturate(1.45) contrast(1.08)" : grade === "dream" ? "saturate(1.1) brightness(1.05)" : "none";
}

// 光が差す(左上から斜めの光の筋が、ゆっくり揺れる)
export function drawRays(ctx, W, H, t) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let k = 0; k < 6; k++) {
    const a = rnd(k, 9);
    const sway = Math.sin(t * 0.4 + k) * 0.03;
    const x = (0.05 + a * 0.6 + sway) * W;
    const wdt = (0.04 + rnd(k, 8) * 0.08) * W;
    const alpha = 0.10 + 0.08 * Math.sin(t * 0.7 + k * 2);
    const g = ctx.createLinearGradient(x, 0, x + H * 0.45, H);
    g.addColorStop(0, `rgba(255,240,200,${alpha})`);
    g.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.lineTo(x + wdt, -10);
    ctx.lineTo(x + wdt + H * 0.45, H);
    ctx.lineTo(x + H * 0.45, H);
    ctx.fill();
  }
  const s = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(W, H) * 0.6);
  s.addColorStop(0, "rgba(255,245,210,0.35)");
  s.addColorStop(1, "rgba(255,245,210,0)");
  ctx.fillStyle = s;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
