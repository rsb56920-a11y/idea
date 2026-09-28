"""画像から動画/public から、ダブルクリックで動く1ファイル版「画像から動画.html」を作る。"""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "画像から動画", "public")
OUT = os.path.join(ROOT, "画像から動画", "画像から動画.html")
MODULES = ["effects.js", "wish.js", "motion.js", "app.js"]  # 依存の順

def read(n):
    with open(os.path.join(PUB, n), encoding="utf-8") as f:
        return f.read()

js = []
for n in MODULES:
    if not os.path.exists(os.path.join(PUB, n)):
        continue
    src = read(n)
    src = re.sub(r'^import [^;]+;\n', "", src, flags=re.M)  # 1ファイルにまとめるので import は不要
    src = re.sub(r'^export (?=(const|function|class|let|async) )', "", src, flags=re.M)
    js.append(f"// ===== {n} =====\n" + src)
html = read("index.html")
html = html.replace('<link rel="stylesheet" href="style.css" />', "<style>\n" + read("style.css") + "\n</style>")
body = "\n".join(js).replace("</script", "<\\/script")
html = html.replace('<script type="module" src="app.js"></script>', '<script type="module">\n' + body + "\n</script>")
assert "<style>" in html and "===== app.js" in html
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(OUT, f"{len(html) // 1024}KB")
