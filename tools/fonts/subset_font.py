"""把思源宋體（Noto Serif TC, OFL）裁成本站實際用到的字，輸出 woff2 與 @font-face。
用法：python3 -I subset_font.py <fontsource files 目錄> <網站目錄>"""
import sys, os, glob, io
from fontTools.ttLib import TTFont
from fontTools import subset
src, site = sys.argv[1], sys.argv[2]
text = ""
for f in ["index.html", "app.js", "scene.js", "style.css", "data/content.js", "admin/index.html", "admin/admin.js"]:
    text += open(os.path.join(site, f), encoding="utf-8").read()
text += "０１２３４５６７８９一二三四五六七八九十百千第章節目頁輯珠顆區上下"
chars = {ord(c) for c in text if ord(c) > 0x20}
outdir = os.path.join(site, "assets", "fonts"); os.makedirs(outdir, exist_ok=True)
css = ["/* 思源宋體 Noto Serif TC（SIL Open Font License 1.1，見 assets/LICENSE-fonts.txt），僅保留本站用到的字 */"]
total = 0
for old in glob.glob(os.path.join(outdir, "*.woff2")): os.remove(old)
for w in (400, 700):
    # 先用「繁體中文」切片（大部分字都在這裡），其餘字再從其他切片補；每字只放一個檔，檔數因此很少
    files = sorted(glob.glob(os.path.join(src, "noto-serif-tc-*-%d-normal.woff2" % w)), key=lambda p: (0 if "chinese-traditional" in p else 1 if "-latin-" in p else 2, p))
    left = set(chars)
    for fp in files:
        f = TTFont(fp); cmap = set(f.getBestCmap().keys()); need = sorted(left & cmap); left -= set(need)
        if not need: continue
        opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["*"]; opts.name_IDs = ["*"]; opts.notdef_outline = True
        sub = subset.Subsetter(opts); sub.populate(unicodes=need); sub.subset(f)
        tag = os.path.basename(fp)[len("noto-serif-tc-"):].rsplit("-", 2)[0]
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
# 註：不要把切片合併成單一檔——合併後直書（vertical-rl）時字的垂直位置會錯（例如「一」貼到格子頂端）
