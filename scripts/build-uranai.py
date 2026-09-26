"""占いシリーズ/src から、ダブルクリックで動く1ファイルの占いページを作る。

使い方: python scripts/build-uranai.py
できるもの: 占いシリーズ/<占いの名前>.html と 占いシリーズ/index.html(入口ページ)
"""
import glob
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "占いシリーズ")
SRC = os.path.join(DIR, "src")


def read(*p):
    with open(os.path.join(SRC, *p), encoding="utf-8") as f:
        return f.read()


def meta(js, key):
    m = re.search(key + r':\s*"([^"]*)"', js)
    return m.group(1) if m else ""


shell, css, base = read("shell.html"), read("style.css"), read("sha.js") + "\n" + read("common.js")
products = []
for path in sorted(glob.glob(os.path.join(SRC, "products", "*.js"))):
    js = open(path, encoding="utf-8").read()
    products.append({
        "js": js, "id": meta(js, "id"), "file": meta(js, "file"), "title": meta(js, "title"), "emoji": meta(js, "emoji"),
        "desc": re.sub(r"<[^>]+>", "", meta(js, "catch")),
    })
order = json.loads(read("order.json"))
products.sort(key=lambda p: order.index(p["id"]) if p["id"] in order else 99)
catalog = [{k: p[k] for k in ("id", "file", "title", "emoji", "desc")} for p in products]
catalog_js = "window.CATALOG = " + json.dumps(catalog, ensure_ascii=False) + ";\n"

for p in products:
    js = base + "\n" + catalog_js + "(() => {\n" + p["js"] + "\nU.start();\n})();"
    out = (shell.replace("{{CSS}}", css).replace("{{JS}}", js.replace("</script", "<\\/script"))
           .replace("{{TITLE}}", html.escape(p["title"])).replace("{{DESC}}", html.escape(p["desc"])))
    with open(os.path.join(DIR, p["file"]), "w", encoding="utf-8") as f:
        f.write(out)
    print("  ", p["file"], f"{len(out) // 1024}KB")

# 入口ページ
cards = "\n".join(
    f'<a class="item" href="{html.escape(p["file"])}"><b>{p["emoji"]}</b><span><strong>{html.escape(p["title"])}</strong><small>{html.escape(p["desc"])}</small></span></a>'
    for p in products
)
index = read("index.html").replace("{{CSS}}", css).replace("{{CARDS}}", cards)
with open(os.path.join(DIR, "index.html"), "w", encoding="utf-8") as f:
    f.write(index)
print("  index.html")
