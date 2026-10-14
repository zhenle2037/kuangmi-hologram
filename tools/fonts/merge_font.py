"""將裁好的字型切片合併成每個字重一個 woff2。用法：python3 -I merge_font.py <網站目錄>"""
import sys, os, glob
from fontTools.merge import Merger, Options
from fontTools.ttLib import TTFont
site = sys.argv[1]; d = os.path.join(site, "assets", "fonts")
css = ["/* 思源宋體 Noto Serif TC（SIL Open Font License 1.1，見 assets/LICENSE-fonts.txt），僅保留本站用到的字 */"]
for w in (400, 700):
    parts = sorted(glob.glob(os.path.join(d, "nst-*-%d.woff2" % w)))
    tmp = []
    for i, p in enumerate(parts):  # 轉成 ttf 給 merger
        f = TTFont(p); f.flavor = None; t = p + ".ttf"; f.save(t); tmp.append(t)
    m = Merger(options=Options(drop_tables=["vmtx", "vhea", "VORG"])).merge(tmp)
    m.flavor = "woff2"; out = os.path.join(d, "noto-serif-tc-site-%d.woff2" % w); m.save(out)
    for t in tmp: os.remove(t)
    for p in parts: os.remove(p)
    print(w, len(parts), "->", os.path.getsize(out))
    css.append("@font-face{font-family:'Noto Serif TC Site';font-style:normal;font-weight:%d;font-display:swap;src:url(fonts/noto-serif-tc-site-%d.woff2) format('woff2')}" % (w, w))
open(os.path.join(site, "assets", "fonts.css"), "w", encoding="utf-8").write("\n".join(css) + "\n")
