"""把思源宋體（Noto Serif TC, OFL）裁成本站實際用到的字，輸出 woff2 與 @font-face。
用法：python3 -I subset_font.py <fontsource files 目錄> <網站目錄>"""
import sys, os, glob, io
from fontTools.ttLib import TTFont
from fontTools import subset
src, site = sys.argv[1], sys.argv[2]
text = ""
for f in ["index.html", "app.js", "scene.js", "style.css", "data/content.js"]:
    text += open(os.path.join(site, f), encoding="utf-8").read()
text += "０１２３４５６７８９一二三四五六七八九十百千第章節目頁輯珠顆區上下"
chars = {ord(c) for c in text if ord(c) > 0x20}
outdir = os.path.join(site, "assets", "fonts"); os.makedirs(outdir, exist_ok=True)
css = ["/* 思源宋體 Noto Serif TC（SIL Open Font License 1.1），僅保留本站用到的字 */"]
total = 0
for w in (400, 700):
    files = sorted(glob.glob(os.path.join(src, "noto-serif-tc-*-%d-normal.woff2" % w)))
    for fp in files:
        f = TTFont(fp); cmap = set(f.getBestCmap().keys()); need = sorted(chars & cmap)
        if not need: continue
        opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["*"]; opts.name_IDs = ["*"]; opts.notdef_outline = True
        sub = subset.Subsetter(opts); sub.populate(unicodes=need); sub.subset(f)
        tag = os.path.basename(fp).split("-")[3]
        out = "nst-%s-%d.woff2" % (tag, w); f.flavor = "woff2"; f.save(os.path.join(outdir, out))
        total += os.path.getsize(os.path.join(outdir, out))
        # 合併連續碼位為 unicode-range
        rng, a = [], need[0]; prev = a
        for u in need[1:] + [None]:
            if u is not None and u == prev + 1: prev = u; continue
            rng.append("U+%X" % a if a == prev else "U+%X-%X" % (a, prev))
            if u is not None: a = prev = u
        css.append("@font-face{font-family:'Noto Serif TC Site';font-style:normal;font-weight:%d;font-display:swap;src:url(fonts/%s) format('woff2');unicode-range:%s}" % (w, out, ",".join(rng)))
open(os.path.join(site, "assets", "fonts.css"), "w", encoding="utf-8").write("\n".join(css) + "\n")
print("chars", len(chars), "files", len(css) - 1, "bytes", total)
