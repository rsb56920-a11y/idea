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
const BASE = `<style>
  body{margin:0;font-family:"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Noto Sans CJK JP",sans-serif}
  .c{background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
</style>`;

const og = `${BASE}<div class="c" style="width:1200px;height:630px">
  <div style="background:#fff;color:#2b2340;border-radius:48px;width:1080px;height:510px;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="font-size:84px;letter-spacing:10px">🦁🦊🐱🦉🐇</div>
    <div style="font-size:104px;font-weight:800;margin-top:10px;background:linear-gradient(135deg,#8b5cf6,#ec4899);-webkit-background-clip:text;color:transparent">ココロタイプ</div>
    <div style="font-size:42px;font-weight:800;margin-top:6px">16タイプ性格診断</div>
    <div style="font-size:32px;color:#7c7396;margin-top:18px">16問・約2分であなたの本当の性格がわかる</div>
  </div>
</div>`;

const icon = (size) => `${BASE}<div class="c" style="width:${size}px;height:${size}px">
  <div style="font-size:${size * 0.6}px;line-height:1">🦊</div>
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
