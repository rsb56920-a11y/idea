"""夜華カナタ_配信セット を zip にする(展開すると F:\\夜華カナタ_配信セット\\ になる形)。"""
import os, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "夜華カナタ_配信セット")
OUT = os.path.join(ROOT, "夜華カナタ_配信セット.zip")
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for d, dirs, files in os.walk(SRC):
        dirs.sort()
        for n in sorted(files):
            p = os.path.join(d, n)
            z.write(p, os.path.join("夜華カナタ_配信セット", os.path.relpath(p, SRC)))
print(OUT, os.path.getsize(OUT) // 1024, "KB")
