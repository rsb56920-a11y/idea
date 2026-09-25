// OGP画像(1200x630)とアプリのアイコン(192/512)を public/ に作る。
// 使い方: node tools/make-images.cjs  (Playwright が必要)
const path = require("node:path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node22/lib/node_modules/playwright"));
}

const OUT = path.join(__dirname, "..", "public");
const BG = "radial-gradient(ellipse at top, #2a3170 0%, #0b1026 70%)";
const STARS = Array.from({ length: 70 }, () =>
  `<i style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;opacity:${(Math.random() * 0.7 + 0.2).toFixed(2)}"></i>`,
).join("");
const BASE = `<style>
  body{margin:0;font-family:"Hiragino Mincho ProN","Noto Serif CJK JP","Yu Mincho",serif;}
  .c{position:relative;overflow:hidden;background:${BG};color:#f6e3a1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  i{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff}
</style>`;

const og = `${BASE}<div class="c" style="width:1200px;height:630px">${STARS}
  <div style="position:absolute;inset:28px;border:3px solid rgba(233,196,106,.6)"></div>
  <div style="font-size:120px;filter:drop-shadow(0 0 30px rgba(246,227,161,.7))">🌙</div>
  <div style="font-size:92px;font-weight:700;letter-spacing:.12em;margin-top:6px">星詠みルナ</div>
  <div style="font-size:36px;color:#f4efe3;margin-top:18px">AI占い師があなたの星を読み解く</div>
  <div style="font-size:30px;color:#e9c46a;margin-top:26px">今日の運勢 ・ 推し相性診断 ・ タロット ・ 相性診断 ・ 前世診断</div>
</div>`;

const icon = (size) => `${BASE}<div class="c" style="width:${size}px;height:${size}px">${STARS}
  <div style="font-size:${size * 0.56}px;line-height:1;filter:drop-shadow(0 0 ${size / 12}px rgba(246,227,161,.8))">🌙</div>
</div>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [html, w, h, file] of [
    [og, 1200, 630, "og.png"],
    [icon(192), 192, 192, "icon-192.png"],
    [icon(512), 512, 512, "icon-512.png"],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(html);
    await p.screenshot({ path: path.join(OUT, file) });
    console.log("wrote", file);
  }
  await b.close();
})();
