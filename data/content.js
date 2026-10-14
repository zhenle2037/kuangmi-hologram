/* 《狂密與真密》數珠導覽 — 內容資料（與視覺程式分離）
 * 來源標記 src：
 *   "book"  = 書籍原有目次／原文
 *   "quote" = 平實導師引文
 *   "nav"   = 本網站「見、修、行、果」導覽分類（非原書結論）
 * 預留欄位：body（正文）、notes（解說）、sources（出處）、related（相關名相）。
 * 補充內容只需在此檔填寫，不必改動視覺程式。
 */
window.KM_DATA = {
  quote:
    "以數珠為喻：西藏密宗乃是以種種虛構之觀想法、持外道咒、天瑜伽、遷識⋯等外道法為數珠，以風瑜伽為隔珠，以佛教教相及僧寶表相為佛頭珠；以自己所定義之般若中觀名相及果位修證名相，作為佛頭珠所懸之飾穗，最後以淫樂之樂空雙運欲界外道雙身法為串繩，貫串密宗之一切成佛理論與行門。如是串成之數珠，即是西藏密教之真實宗義。－－平實導師－－",

  // 數珠部件譬喻（引文／導覽）
  parts: {
    bead:   { title: "普通數珠（104顆）", text: "以種種虛構之觀想法、持外道咒、天瑜伽、遷識⋯等外道法為數珠", src: "quote" },
    head:   { title: "佛頭珠（另計 1 顆，不在環上 108 顆內）", text: "以佛教教相及僧寶表相為佛頭珠", src: "quote" },
    tassel: { title: "佛頭珠飾穗", text: "以密宗自己所定義之般若中觀名相及果位修證名相，作為佛頭珠所懸之飾穗", src: "quote" },
    string: { title: "串繩", text: "最後以淫樂之樂空雙運欲界外道雙身法為串繩，貫串密宗之一切成佛理論與行門", src: "quote" }
  },

  // 四個區段（珠位範圍由程式依「每 26 顆普通數珠接 1 顆隔珠」計算，此處只放內容）
  zones: [
    {
      id: "jian", name: "見", spacerTitle: "見", spacerName: "隔珠一",
      summary: "見（對佛法義理的理解與見地。）",
      core: "對佛法義理、心性、空性及相關名相的理解與詮釋。",
      terms: ["t-rulaizang", "t-bore", "t-kongxing", "t-fashen", "t-shixiang", "t-yuanqi", "t-wulou", "t-wuru"],
      chapters: [{ id: "c06" }, { id: "c07" }, { id: "c14", partial: true }],
      mainNote: "第六章、第七章及第十四章部分內容。"
    },
    {
      id: "xiu", name: "修", spacerTitle: "修（風瑜伽）", spacerName: "隔珠二",
      summary: "風瑜伽（修：依所立的見地而進行的修法。）",
      core: "各種修習方法、禪定技術、瑜伽與相關修行理論。",
      terms: ["t-guanxiang", "t-mingdian", "t-ganlu", "t-chizhou", "t-guanding", "t-wushang", "t-qianshi", "t-zhuohuo", "t-zhongyou", "t-dashouyin", "t-shuangshen"],
      chapters: [{ id: "c02" }, { id: "c03" }, { id: "c04" }, { id: "c05" }, { id: "c08" }, { id: "c09" }, { id: "c10" }, { id: "c14", partial: true }],
      mainNote: "第二至第五章、第八至第十章及第十四章部分內容。"
    },
    {
      id: "xing", name: "行", spacerTitle: "行", spacerName: "隔珠三",
      summary: "行（將修法落實於具體行門與實踐。）",
      core: "戒律、儀軌、實際行持、資糧累積及各種行門。",
      terms: ["t-sanmeiye", "t-chizhou2", "t-ziliang", "t-sijiaxing", "t-daocidi", "t-zita", "t-chuzui", "t-xizeng", "t-shuangshen"],
      chapters: [{ id: "c01", partial: true }, { id: "c05" }, { id: "c08" }, { id: "c09" }, { id: "c10" }, { id: "c13" }, { id: "c14", partial: true }],
      mainNote: "第一章部分內容、第五章、第八至第十章、第十三章及第十四章部分內容。"
    },
    {
      id: "guo", name: "果", spacerTitle: "果", spacerName: "隔珠四",
      summary: "果（所主張的修證成果、果位與解脫。）",
      core: "所主張的修證成果、智慧、果位、解脫與成佛境界。",
      terms: ["t-sishiguo", "t-duanhuo", "t-sanshen", "t-wuzhi", "t-wufenbie", "t-loujin", "t-jietuo", "t-jishen", "t-foguo"],
      chapters: [{ id: "c02" }, { id: "c03" }, { id: "c06" }, { id: "c09" }, { id: "c11" }, { id: "c12" }, { id: "c14", partial: true }],
      mainNote: "第二、三、六、九、十一、十二及十四章部分內容。"
    }
  ],

  // 名相（依使用者提供之各區名相逐項保留，未拆分、未增補）
  // note：分類是否適當、與單一章節的細部對應，皆待確認。
  terms: [
    { id: "t-rulaizang", name: "如來藏" },
    { id: "t-bore", name: "般若中觀（明光大手印）" },
    { id: "t-kongxing", name: "空性" },
    { id: "t-fashen", name: "法身" },
    { id: "t-shixiang", name: "實相菩提心" },
    { id: "t-yuanqi", name: "緣起、四緣" },
    { id: "t-wulou", name: "無漏法" },
    { id: "t-wuru", name: "五如來、五法身" },

    { id: "t-guanxiang", name: "觀想、天瑜伽" },
    { id: "t-mingdian", name: "明點、脈氣、風瑜伽" },
    { id: "t-ganlu", name: "甘露" },
    { id: "t-chizhou", name: "持咒、手印、夢瑜伽" },
    { id: "t-guanding", name: "灌頂" },
    { id: "t-wushang", name: "無上瑜伽" },
    { id: "t-qianshi", name: "遷識、奪舍" },
    { id: "t-zhuohuo", name: "拙火" },
    { id: "t-zhongyou", name: "中有、無死瑜伽" },
    { id: "t-dashouyin", name: "大手印相關修法與禪修" },

    { id: "t-sanmeiye", name: "三昧耶戒" },
    { id: "t-chizhou2", name: "持咒、供養" },
    { id: "t-ziliang", name: "資糧修集" },
    { id: "t-sijiaxing", name: "四加行" },
    { id: "t-daocidi", name: "道次第" },
    { id: "t-zita", name: "自他交換" },
    { id: "t-chuzui", name: "觀想除罪" },
    { id: "t-xizeng", name: "息增懷誅" },
    { id: "t-shuangshen", name: "雙身修法", note: "同一名相同時出現在「修」與「行」，共用同一份資料；「修」區的歸屬待確認。" },

    { id: "t-sishiguo", name: "四果五果" },
    { id: "t-duanhuo", name: "斷惑證果" },
    { id: "t-sanshen", name: "法身、報身、化身" },
    { id: "t-wuzhi", name: "五智（法界體性智）" },
    { id: "t-wufenbie", name: "無分別智" },
    { id: "t-loujin", name: "漏盡通、神通" },
    { id: "t-jietuo", name: "解脫、涅槃" },
    { id: "t-jishen", name: "即身成佛" },
    { id: "t-foguo", name: "佛果修證（明光大手印即身成佛之主張）" }
  ],

  // 17 章（穩定識別碼）。sections 為已提供的節；其餘節、目、頁碼待使用者補附，不猜補。
  chapters: [
    { id: "c01", no: 1,  title: "概說密宗" },
    { id: "c02", no: 2,  title: "觀想及天瑜伽" },
    { id: "c03", no: 3,  title: "密宗之明點與脈氣" },
    { id: "c04", no: 4,  title: "甘露" },
    { id: "c05", no: 5,  title: "持明、手印及夢瑜伽" },
    { id: "c06", no: 6,  title: "如來藏見" },
    { id: "c07", no: 7,  title: "般若中觀--兼述密宗之明光大手印", volumes: "跨第一、二輯",
      sections: [
        { no: "第三節", title: "密宗應成派中觀之般若見(上半)", volume: "第一輯", page: null, note: "第一輯至此節；原題名保留" },
        { no: "第三節", title: "應成派中觀之般若見(下半)", volume: "第二輯", page: null, note: "第二輯由此接續；原題名保留" }
      ] },
    { id: "c08", no: 8,  title: "灌頂" },
    { id: "c09", no: 9,  title: "無上瑜伽--雙身法之實修", volumes: "跨第二、三輯",
      volumeNote: "第二輯包含第一至第六節；第三輯接續第七至第十一節（第三輯原題「第九章 無上瑜伽」，仍屬同一第九章）。各節標題待補。" },
    { id: "c10", no: 10, title: "遷識法及奪舍法" },
    { id: "c11", no: 11, title: "密宗之斷惑證果" },
    { id: "c12", no: 12, title: "神通--密教誇大不實之神通証量" },
    { id: "c13", no: 13, title: "息增懷誅" },
    { id: "c14", no: 14, title: "餘諸邪見--恣意解釋佛法修證之名相" },
    { id: "c15", no: 15, title: "密宗推廣邪法之手段" },
    { id: "c16", no: 16, title: "狂密與真密" },
    { id: "c17", no: 17, title: "總結" }
  ],

  // 章之外已知的目次入口（僅知名稱；內容待補）
  extras: [
    { id: "x-appendix", title: "附錄" },
    { id: "x-biblio", title: "參考書目" },
    { id: "x-mudra", title: "手印指節示意圖" },
    { id: "x-afterword", title: "跋" }
  ]
};
