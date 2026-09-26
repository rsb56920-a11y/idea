"""ボイスチェンジャー「コエカワ」を、ダブルクリックで開ける1つの HTML にまとめる。

使い方: python3 scripts/build-koekawa.py
できるもの: ボイスチェンジャー_コエカワ/コエカワ.html
(部品の JS は Blob URL として埋め込むので、サーバーなしで file:// から動く)
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "ボイスチェンジャー_コエカワ", "public")
OUT = os.path.join(ROOT, "ボイスチェンジャー_コエカワ", "コエカワ.html")


def read(name):
    with open(os.path.join(PUB, name), encoding="utf-8") as f:
        return f.read()


def strip_exports(src):
    return re.sub(r"^export ", "", src, flags=re.M)


def strip_imports(src):
    return re.sub(r"^import .*?;\n", "", src, flags=re.M)


def js_string(s):
    # </script> で HTML が途中で閉じないようにする
    return json.dumps(s, ensure_ascii=False).replace("</", "<\\/")


# 別スレッドで動く部品(AudioWorklet・Worker)はそれぞれ単体のコードにする
assets = {
    "voice-processor.js": read("voice-processor.js"),
    "capture-processor.js": read("capture-processor.js"),
    "resynth-processor.js": read("resynth-processor.js"),
    # Worker は import を使わない普通のスクリプトにする(高品質エンジンを前にくっつける)
    "hq-worker.js": strip_exports(read("hq-engine.js")) + "\n" + strip_imports(read("hq-worker.js")),
}
# file:// で開いた時、AudioWorklet は Blob URL を読めない(Chrome の制限)ので data: URL にする。
# Worker は Blob URL で読める
def asset_line(k, v):
    if k.endswith("-processor.js"):
        url = f"'data:text/javascript;charset=utf-8,' + encodeURIComponent({js_string(v)})"
    else:
        url = f"URL.createObjectURL(new Blob([{js_string(v)}], {{ type: 'text/javascript' }}))"
    return f"window.__KOEKAWA_ASSETS[{json.dumps(k)}] = {url};\n"


asset_js = "window.__KOEKAWA_ASSETS = {};\n" + "".join(asset_line(k, v) for k, v in assets.items())
# 画面のスクリプト: 声の分析 + app.js を1つにする
main_js = strip_exports(read("voice-analysis.js")) + "\n" + strip_imports(read("app.js"))

html = read("index.html")
html = html.replace('<link rel="stylesheet" href="style.css" />', "<style>\n" + read("style.css") + "\n</style>")
html = html.replace(
    '<script type="module" src="app.js"></script>',
    "<script>\n" + asset_js + "</script>\n<script type=\"module\">\n" + main_js.replace("</script", "<\\/script") + "\n</script>",
)
assert "__KOEKAWA_ASSETS" in html and "<style>" in html, "置き換えに失敗しました"
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(OUT, f"{len(html) // 1024}KB")
