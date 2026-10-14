"""由交接包的 內容種子.json 產生網站用的 data/content.js。
用法：python3 -I build_content.py <內容種子.json> <輸出 content.js>
"""
import json, re, sys

seed = json.load(open(sys.argv[1], encoding="utf-8"))
out_path = sys.argv[2]

GROUPS = ["見", "修", "行", "果"]
IMG = {"/visualization-art.png": "assets/contemplation.jpg"}  # 原站圖片路徑 → 本站檔案

def ref_obj(text, tgt):
    m = re.match(r"〔([^〕]+)〕(.*)$", text)
    kind, rest = (m.group(1), m.group(2)) if m else ("", text)
    o = {"kind": kind, "text": rest}
    if tgt:
        o["ch"] = "c%02d" % int(tgt["chapterId"])
        if tgt.get("sectionId"):
            o["sec"] = tgt["sectionId"]
    return o

terms = []
for t in seed["terms"]:
    tg = t.get("referenceTargets") or []
    refs = [ref_obj(r, tg[i] if i < len(tg) else None) for i, r in enumerate(t["references"])]
    terms.append({
        "id": t["id"], "name": t["title"], "group": t["group"],
        "show": t["visibleGroups"], "slot": t["slot"],
        "refs": refs, "notes": t.get("notes") or [],
        "body": t.get("body", ""), "explanation": t.get("explanation", ""),
        "image": IMG.get(t.get("image", ""), t.get("image", "")), "imageCaption": t.get("imageCaption", ""),
    })

chapters = []
n_sec = n_item = 0
for c in seed["chapters"]:
    secs = []
    for s in c["sections"]:
        e = {"id": s["id"], "no": s["number"], "title": s["title"], "page": s["page"], "vol": s["volume"]}
        for k in ("body", "explanation", "image", "imageCaption"):
            e[k] = s.get(k, "")
        if "." in s["number"]:
            e["no"] = s["number"].split(".")[1]
            secs[-1].setdefault("items", []).append(e)
            n_item += 1
        else:
            secs.append(e)
            n_sec += 1
    vols = sorted({s["volume"] for s in c["sections"]})
    chapters.append({
        "id": "c%02d" % c["id"], "no": c["id"], "title": c["title"], "vols": vols,
        "sections": secs, "body": c.get("body", ""), "explanation": c.get("explanation", ""),
        "image": c.get("image", ""), "imageCaption": c.get("imageCaption", ""),
    })

data = {
    "quote": seed["quote"],
    "parts": {
        "bead": {"title": "數珠", "count": "普通數珠 104 顆", "text": "種種虛構之觀想法、持外道咒、天瑜伽、遷識⋯等外道法", "src": "quote"},
        "spacer": {"title": "隔珠", "count": "4 顆", "text": "風瑜伽", "src": "quote"},
        "head": {"title": "佛頭珠", "count": "由隔珠一兼作", "text": "佛教教相及僧寶表相", "src": "quote"},
        "tassel": {"title": "飾穗", "count": "佛頭珠所懸", "text": "自己所定義之般若中觀名相及果位修證名相", "src": "quote"},
        "string": {"title": "串繩", "count": "貫穿全串", "text": "淫樂之樂空雙運欲界外道雙身法，貫串密宗之一切成佛理論與行門", "src": "quote"},
    },
    "zones": [
        {"id": "jian", "name": "見", "spacerTitle": "見", "spacerName": "隔珠一",
         "summary": "見（對佛法義理的理解與見地。）", "core": "對佛法義理、心性、空性及相關名相的理解與詮釋。"},
        {"id": "xiu", "name": "修", "spacerTitle": "修（風瑜伽）", "spacerName": "隔珠二",
         "summary": "風瑜伽（修：依所立的見地而進行的修法。）", "core": "各種修習方法、禪定技術、瑜伽與相關修行理論。"},
        {"id": "xing", "name": "行", "spacerTitle": "行", "spacerName": "隔珠三",
         "summary": "行（將修法落實於具體行門與實踐。）", "core": "戒律、儀軌、實際行持、資糧累積及各種行門。"},
        {"id": "guo", "name": "果", "spacerTitle": "果", "spacerName": "隔珠四",
         "summary": "果（所主張的修證成果、果位與解脫。）", "core": "所主張的修證成果、智慧、果位、解脫與成佛境界。"},
    ],
    "terms": terms,
    "chapters": chapters,
    "extras": [{k: v for k, v in {"id": x["id"], "title": x["title"], "vol": x.get("volume"), "page": x.get("page", "")}.items() if v is not None} for x in seed["extras"]],
}

head = """/* 《狂密與真密》數珠導覽 — 內容資料（與視覺程式分離）
 * 由交接包「內容種子.json」產生（來源：狂密與真密目錄.docx、四類名相｜數珠配置確定版）。
 * 名相：slot＝環上主珠位（唯一）；group＝主分類；show＝可顯示的分類（跨類入口指向同一份資料）。
 * refs.kind：直接＝詞語出現在該節／目標題；關聯＝分類或合併上的關聯；僅章題＝僅章名出現。
 * 章：sections[].items 為「目」；page 為原書頁碼，vol 為輯別。
 * 預留欄位：body（原書正文）、explanation（整理說明）、image／imageCaption（圖片與來源）。
 * 未提供的正文與解說一律留空，前台顯示「待補」，不自行編寫。
 * 統計：名相 %d、章 %d、節 %d、目 %d。
 */
""" % (len(terms), len(chapters), n_sec, n_item)
open(out_path, "w", encoding="utf-8").write(head + "window.KM_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
print("terms", len(terms), "chapters", len(chapters), "sections", n_sec, "items", n_item)
