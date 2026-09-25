"""このフォルダー全体を「売れる商品.zip」にまとめる(node_modules と .git は除く)。"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "売れる商品.zip")
SKIP_DIRS = {".git", "node_modules", ".claude"}

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            if path == OUT or name.endswith(".zip"):
                continue
            z.write(path, os.path.join("売れる商品", os.path.relpath(path, ROOT)))
print(OUT)
