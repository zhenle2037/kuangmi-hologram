/* 數珠導覽 — 狀態、內容面板、目次與導覽。內容全部來自 data/content.js；3D 畫面在 scene.js。
 * 兩種模式共用同一串念珠：
 *   mala ＝「以數珠為喻」：部件譬喻、見修行果四區、76 個名相主珠位
 *   book ＝「原書導讀」：17 章各配 1 顆普通數珠，章→節→目分層閱讀 */
(function () {
  "use strict";
  var D = window.KM_DATA;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var SRC = { book: "原書目次", quote: "平實導師引文", nav: "本站導覽分類" };
  var tag = function (k) { return '<span class="tag ' + k + '">' + SRC[k] + "</span>"; };
  var ZCOLOR = { jian: "#2f6690", xiu: "#a8741a", xing: "#6a52a3", guo: "#b3261e" };
  var GROUP_Z = { "見": 0, "修": 1, "行": 2, "果": 3 };
  var PART_KEYS = ["bead", "spacer", "head", "tassel", "string"];
  var CN = "零一二三四五六七八九";
  function cn(n) { n = +n; if (n <= 10) return n === 10 ? "十" : CN[n]; var t = Math.floor(n / 10), o = n % 10; return (t > 1 ? CN[t] : "") + "十" + (o ? CN[o] : ""); }
  var VOLNAME = function (v) { return "第" + cn(v) + "輯"; };

  /* ---------- 索引 ---------- */
  var chById = {}, termById = {}, extraById = {}, secById = {};
  D.chapters.forEach(function (c) {
    chById[c.id] = c;
    c.sections.forEach(function (s) {
      s.ch = c.id; secById[s.id] = s;
      (s.items || []).forEach(function (it) { it.ch = c.id; it.parent = s.id; secById[it.id] = it; });
    });
  });
  D.terms.forEach(function (t) { termById[t.id] = t; });
  D.extras.forEach(function (x) { extraById[x.id] = x; });
  function secLabel(s) { var base = String(s.no).replace(/[^0-9]/g, ""); return s.parent ? "第" + cn(base) + "目" : "第" + cn(base) + "節"; }
  function chLabel(c) { return "第" + cn(c.no) + "章"; }
  function shortTitle(t) { return String(t).split("——")[0]; }
  function volText(vols) { return vols.map(VOLNAME).join("、"); }

  /* ---------- 珠位模型（每 26 顆普通數珠後接 1 顆隔珠；名相依 slot 唯一主珠位） ---------- */
  var BEADS = [];
  for (var n = 1; n <= 108; n++) {
    var z = Math.floor((n - 1) / 27), r = ((n - 1) % 27) + 1;
    BEADS[n] = { n: n, z: z, pos: r, spacer: r === 27, term: null, ch: null };
  }
  D.zones.forEach(function (zn, zi) { zn.idx = zi; zn.first = zi * 27 + 1; zn.last = zi * 27 + 26; zn.spacerNo = zi * 27 + 27; zn.group = ["見", "修", "行", "果"][zi]; });
  var slotErr = [];
  D.terms.forEach(function (t) {
    var b = BEADS[t.slot], zi = GROUP_Z[t.group];
    if (!b || b.spacer || b.z !== zi || b.term) { slotErr.push(t.name); return; } // 防呆：越界、放在隔珠或重複珠位
    b.term = t.id;
  });
  if (slotErr.length && window.console) console.warn("名相珠位設定有誤，已略過：", slotErr);
  var ASSIGNED = BEADS.filter(function (b) { return b && b.term; }).map(function (b) { return b.n; });
  // 原書導讀：17 章依章序平均配置到 17 顆普通數珠
  var ORD = BEADS.filter(function (b) { return b && !b.spacer; }).map(function (b) { return b.n; });
  var CH_BEAD = {}, CH_ORDER = [];
  D.chapters.forEach(function (c, i) { var bn = ORD[6 + Math.round(i * 86 / (D.chapters.length - 1))]; /* 第 7–96 顆間平均分布，避開佛頭珠附近 */ CH_BEAD[c.id] = bn; BEADS[bn].ch = c.id; CH_ORDER.push(c.id); });

  function termsOfZone(zi) { // 主珠位在本區者，加上可跨類顯示於本區者
    var g = ["見", "修", "行", "果"][zi];
    return D.terms.filter(function (t) { return t.show.indexOf(g) >= 0; }).sort(function (a, b) {
      var pa = a.group === g ? 0 : 1, pb = b.group === g ? 0 : 1; return pa - pb || a.slot - b.slot;
    });
  }
  function termsOfSec(id) { return D.terms.filter(function (t) { return t.refs.some(function (r) { return r.sec === id || (secById[r.sec] && secById[r.sec].parent === id); }); }); }
  function termsOfChapter(cid) { return D.terms.filter(function (t) { return t.refs.some(function (r) { return r.ch === cid; }); }); }

  var sel = null, backSel = null, mode = "mala", lastBead = 0, has3D = false, batch = {}, narrowMQ = window.matchMedia("(max-width:900px)");
  var KM = window.KM = {
    D: D, BEADS: BEADS, ASSIGNED: ASSIGNED, CH_BEAD: CH_BEAD, termById: termById, chById: chById, secById: secById, esc: esc,
    go: function (a, o) { go(a, o); }, getSel: function () { return sel; }, getMode: function () { return mode; },
    actForBead: actForBead, focusInfo: focusInfo, partText: function (k) { return D.parts[k]; }, shortTitle: shortTitle, chLabel: chLabel
  };

  function actForBead(bn) {
    var b = BEADS[bn];
    if (mode === "book") return b.ch ? "chapter:" + b.ch : null;
    if (b.spacer) return "spacer:" + b.z;
    return b.term ? "bead:" + bn : "empty:" + bn;
  }

  /* ---------- 3D 聚焦時的文字（標題、相鄰珠名、章名引線） ---------- */
  function focusInfo(s) {
    if (!s) return null;
    var o = { n: 0, name: "", sub: "", fan: [], neighbors: [] };
    if (s.k === "bead" || s.k === "empty") {
      var b = BEADS[s.n], zn = D.zones[b.z]; o.n = s.n;
      if (b.term) {
        var t = termById[b.term]; o.name = t.name;
        var seen = {}; t.refs.forEach(function (r) { if (r.ch && !seen[r.ch]) { seen[r.ch] = 1; var c = chById[r.ch]; o.fan.push({ text: chLabel(c) + " " + shortTitle(c.title), act: "chapter:" + c.id }); } });
      } else o.name = "待配置珠位";
      o.sub = zn.name + "區 第 " + b.pos + "／26 珠 ・ 環上 " + s.n + "／108";
      [-2, -1, 1, 2].forEach(function (d) { var m = ((s.n - 1 + d + 108) % 108) + 1, bb = BEADS[m]; if (bb.term) o.neighbors.push({ n: m, text: termById[bb.term].name }); });
    } else if (s.k === "spacer") {
      var z2 = D.zones[s.z]; o.n = z2.spacerNo; o.name = z2.spacerName + "：" + z2.spacerTitle; o.sub = "環上 " + o.n + "／108 ・ 隔開其前 26 顆數珠";
    } else if (s.k === "chapter" || s.k === "sec") {
      var c2 = chById[s.k === "chapter" ? s.id : secById[s.id].ch]; o.n = CH_BEAD[c2.id];
      o.name = chLabel(c2); o.sub = c2.title;
      [-1, 1].forEach(function (d) { var i = CH_ORDER.indexOf(c2.id) + d; if (i >= 0 && i < CH_ORDER.length) { var cc = chById[CH_ORDER[i]]; o.neighbors.push({ n: CH_BEAD[cc.id], text: chLabel(cc) + " " + shortTitle(cc.title) }); } });
    } else return null;
    return o;
  }

  /* ---------- 選取 ---------- */
  function parseAct(a) { var i = a.indexOf(":"); return { k: a.slice(0, i), v: a.slice(i + 1) }; }
  function hashOf(s) {
    return s.k === "bead" || s.k === "empty" ? "bead-" + s.n : s.k === "spacer" || s.k === "zone" ? s.k + "-" + s.z : s.k === "part" ? "part-" + s.id : s.k === "chapter" ? "ch-" + s.id : s.k === "sec" ? "sec-" + s.id : "x-" + s.id;
  }
  function select(s, opt) {
    opt = opt || {};
    var want = s && (s.k === "chapter" || s.k === "sec" || s.k === "extra") ? "book" : s ? (mode === "terms" ? "terms" : "mala") : mode; // 名相頁中點珠，返回後仍回名相頁
    // 返回目標：從某區點進珠子時記住該區；換到其他頁面或離開珠內閱讀就清除
    if (want !== mode || !isDetail(s)) backSel = null;
    else if (sel && sel.k === "zone") backSel = sel;
    if (want !== mode) setMode(want, true);
    sel = s; if (s && (s.k === "bead" || s.k === "empty")) lastBead = s.n;
    renderPanel(); syncToc(); syncNav();
    if (has3D) window.KM3D.setSelection(s);
    syncBeadView();
    if (opt.hash !== false) { try { history.replaceState(null, "", s ? "#" + hashOf(s) : mode !== "mala" ? "#" + mode : location.pathname + location.search); } catch (e) {} }
    if (opt.tab !== false) showTab("content");
  }
  function setMode(m, quiet) { // 三個頁面：mala＝導師引文部件、terms＝見修行果四區名相、book＝原書章節
    mode = m;
    document.body.classList.toggle("mode-book", m === "book"); document.body.classList.toggle("mode-terms", m === "terms");
    ["mala", "terms", "book"].forEach(function (k) { $("#mode-" + k).setAttribute("aria-pressed", m === k); });
    if (has3D) window.KM3D.setMode(m);
    if (!quiet) select(null);
  }
  function syncNav() {
    var book = mode === "book";
    $("#prev").textContent = book ? "‹ 上一章" : "‹ 上一珠"; $("#next").textContent = book ? "下一章 ›" : "下一珠 ›";
    $("#prev").setAttribute("aria-label", book ? "上一章" : "上一個已配置珠位"); $("#next").setAttribute("aria-label", book ? "下一章" : "下一個已配置珠位");
    $("#home").textContent = "返回整串";
  }

  /* ---------- 面板 ---------- */
  function chip(act, html, cls) { return '<button class="chip' + (cls ? " " + cls : "") + '" data-go="' + act + '">' + html + "</button>"; }
  function pendBlock(o) {
    o = o || {};
    var h = "<h3>原書正文 " + tag("book") + "</h3>" + (o.body ? '<div class="prose">' + esc(o.body) + "</div>" : '<p class="pend">正文待補。</p>');
    h += "<h3>整理說明 " + tag("nav") + "</h3>" + (o.explanation ? '<div class="prose">' + esc(o.explanation) + "</div>" : '<p class="pend">解說待補（不以推測代替）。</p>');
    if (o.image) h += '<figure class="fig"><img src="' + esc(o.image) + '" alt="' + esc(o.imageCaption || "") + '" loading="lazy"><figcaption>' + esc(o.imageCaption || "圖片來源待註明") + "</figcaption></figure>";
    return h;
  }
  function refList(refs) {
    return '<ul class="refs">' + refs.map(function (r) {
      var k = r.kind === "直接" ? "direct" : r.kind === "關聯" ? "rel" : "chonly";
      var label = '<span class="rk ' + k + '">' + esc(r.kind) + "</span>" + esc(r.text);
      return "<li>" + (r.sec && secById[r.sec] ? '<button class="ref" data-go="sec:' + r.sec + '">' + label + "</button>" : r.ch ? '<button class="ref" data-go="chapter:' + r.ch + '">' + label + "</button>" : label) + "</li>";
    }).join("") + "</ul>";
  }
  function zoneHead(zn) { return '<p class="crumb zone-' + zn.id + '">以數珠為喻 ・ ' + esc(zn.name) + "區 ・ 數珠 " + zn.first + "–" + zn.last + "，隔珠 " + zn.spacerNo + "</p>"; }
  function zoneBody(zn) {
    var ts = termsOfZone(zn.idx), own = ts.filter(function (t) { return t.group === zn.group; });
    var h = "<h3>分類說明 " + tag("nav") + '</h3><div class="box"><p>' + esc(zn.summary) + "</p><p>核心：" + esc(zn.core) + "</p></div>";
    h += "<h3>本區名相</h3><div class=\"chips\">" + ts.map(function (t) {
      return t.group === zn.group ? chip("bead:" + t.slot, esc(t.name) + " <small>珠" + t.slot + "</small>")
        : chip("bead:" + t.slot, esc(t.name) + " <small>跨類顯示・主珠位在" + esc(t.group) + "區 珠" + t.slot + "</small>", "cross");
    }).join("") + "</div>";
    h += '<p class="pend small">本區 26 個珠位中，已配置 ' + own.length + " 個主名相，其餘 " + (26 - own.length) + " 個待配置。此為初始可調整配置。</p>";
    return h;
  }
  function batchSize() { return narrowMQ.matches ? 5 : 7; }
  function chapterBody(c, focusSec) {
    var secs = c.sections, bs = batchSize(), total = secs.length;
    var idx = focusSec ? secs.indexOf(focusSec) : -1;
    var st = batch[c.id] != null ? batch[c.id] : 0;
    if (idx >= 0 && (idx < st || idx >= st + bs)) st = Math.floor(idx / bs) * bs;
    st = Math.max(0, Math.min(st, Math.floor((total - 1) / bs) * bs)); batch[c.id] = st;
    var end = Math.min(total, st + bs);
    var h = '<div class="batchbar"><button class="bt" data-batch="' + c.id + ':-1"' + (st === 0 ? " disabled" : "") + ' aria-label="前一批節">‹ 前一批</button>' +
      '<span class="range">第 ' + (st + 1) + "–" + end + " 節／共 " + total + " 節</span>" +
      '<button class="bt" data-batch="' + c.id + ':1"' + (end >= total ? " disabled" : "") + ' aria-label="後一批節">後一批 ›</button></div>';
    h += '<ol class="secs">' + secs.slice(st, end).map(function (s) {
      var on = focusSec === s ? " on" : "";
      var row = '<li><button class="srow' + on + '" data-go="sec:' + s.id + '"><span class="sn">' + secLabel(s) + '</span><span class="st">' + esc(s.title) + '</span><span class="pg">' + esc(s.page) + "頁" + (c.vols.length > 1 ? "・" + VOLNAME(s.vol) : "") + "</span></button>";
      if (s.items && s.items.length) row += '<ol class="items">' + s.items.map(function (it) { return '<li><button class="irow" data-go="sec:' + it.id + '"><span class="sn">' + secLabel(it) + '</span><span class="st">' + esc(it.title) + '</span><span class="pg">' + esc(it.page) + "頁</span></button></li>"; }).join("") + "</ol>";
      return row + "</li>";
    }).join("") + "</ol>";
    return h;
  }
  function renderPanel() {
    var el = $("#pane-content"), h = "";
    if (!sel && mode === "mala") {
      h = '<p class="crumb">以數珠為喻 ・ 總覽</p><h2>以數珠為喻</h2><p class="guide">點選任一數珠可查看相關名相主題。</p>' +
        "<p>此頁標示導師引文中的五種念珠部件。點部件文字或念珠部件，可看對應譬喻；想看全部名相，請切換到上方「見修行果名相」。上一珠／下一珠只在已配置名相的珠位間移動。</p>" +
        "<h3>念珠部件與譬喻 " + tag("quote") + '</h3><ul class="parts">' + PART_KEYS.map(function (k) { var p = D.parts[k]; return '<li><button class="prow" data-go="part:' + k + '"><b>' + esc(p.title) + "</b><span>" + esc(p.text) + "</span></button></li>"; }).join("") + "</ul>" +
        '<h3>見修行果四區 ' + tag("nav") + '</h3><div class="chips">' + D.zones.map(function (zn) { return chip("zone:" + zn.idx, esc(zn.name) + " 區 <small>" + zn.first + "–" + zn.last + "</small>", "zone-" + zn.id); }).join("") + "</div>" +
        '<div class="notice">環上 108 顆＝104 顆普通數珠＋4 顆隔珠（編號 27、54、81、108）；第四隔珠（第 108 顆）較大，兼作佛頭珠，其上加三通塔頭並懸飾穗。「見修行果」是本網站的導覽分類，不是引文原意；引文原本說「以風瑜伽為隔珠」。目前 76 個名相各占一個主珠位，為初始可調整配置，其餘 28 顆待配置；顏色較淺的珠子為待配置珠位。</div>';
    } else if (!sel && mode === "terms") {
      h = '<p class="crumb">見修行果名相 ・ 總覽</p><h2>見修行果四區名相</h2><p class="guide">點隔珠或罩體，進入該區查看名相。</p>' +
        "<p>環上 104 顆普通數珠分為四區，每區 26 顆，以隔珠分隔，念珠上以半透明罩體標出。點隔珠或罩體進入該區，該區名相會在珠子上下列出；再點名相即進入那顆珠。76 個名相各占一個主珠位，顏色較淺的珠子為待配置珠位。「見修行果」是本網站的導覽分類，不是引文原意。</p>" +
        D.zones.map(function (zn) {
          var ts = termsOfZone(zn.idx), own = ts.filter(function (t) { return t.group === zn.group; });
          return '<h3 class="zone-' + zn.id + '">' + esc(zn.name) + " 區 <small>數珠 " + zn.first + "–" + zn.last + "・" + zn.spacerName + " " + zn.spacerNo + "・已配置 " + own.length + "／26</small></h3>" +
            '<p class="small" style="margin:.2em 0">' + esc(zn.summary) + '</p><div class="chips">' + ts.map(function (t) {
              return t.group === zn.group ? chip("bead:" + t.slot, esc(t.name) + " <small>" + t.slot + "</small>") : chip("bead:" + t.slot, esc(t.name) + " <small>跨類・主珠位在" + esc(t.group) + "區</small>", "cross");
            }).join("") + "</div>";
        }).join("");
    } else if (!sel && mode === "book") {
      h = '<p class="crumb">原書導讀 ・ 總覽</p><h2>原書導讀</h2><p class="guide">點選念珠上的章名或任一章，可分層查看節、目與頁碼。</p>' +
        "<p>全書四輯十七章，一章對應一顆數珠，不分見修行果。上一章／下一章只在 17 個章入口間移動；章內的節以「前一批／後一批」換頁。</p>" +
        '<ol class="chlist">' + D.chapters.map(function (c) { return '<li><button class="srow" data-go="chapter:' + c.id + '"><span class="sn">' + chLabel(c) + '</span><span class="st">' + esc(c.title) + '</span><span class="pg">' + c.sections.length + "節</span></button></li>"; }).join("") + "</ol>" +
        "<h3>其他目次入口 " + tag("book") + '</h3><div class="chips">' + D.extras.map(function (x) { return chip("extra:" + x.id, esc(x.title) + (x.vol ? " <small>" + VOLNAME(x.vol) + "</small>" : "")); }).join("") + "</div>";
    } else if (sel.k === "bead" || sel.k === "empty") {
      var b = BEADS[sel.n], zn = D.zones[b.z];
      if (!b.term) {
        h = zoneHead(zn) + "<h2>待配置珠位</h2>" + '<p class="pos">' + esc(zn.name) + "區 第 " + b.pos + "／26 珠 ・ 環上編號 " + sel.n + "／108</p>" +
          '<p class="pend">此珠位尚未配置名相，內容待補。</p>' + '<p>' + chip("zone:" + zn.idx, "查看「" + esc(zn.name) + "」區已配置名相") + "</p>";
      } else {
        var t = termById[b.term], idx = termsOfZone(b.z).filter(function (x) { return x.group === t.group; }).indexOf(t) + 1;
        h = zoneHead(zn) + "<h2>" + esc(t.name) + "</h2>" +
          '<p class="pos">' + esc(zn.name) + "區 第 " + b.pos + "／26 珠 ・ 環上編號 " + sel.n + "／108 ・ 本區第 " + idx + " 個名相 " + tag("nav") + "</p>";
        if (t.show.length > 1) h += '<div class="notice">主珠位在「' + esc(t.group) + "」區；亦可於「" + esc(t.show.filter(function (g) { return g !== t.group; }).join("、")) + "」區顯示，指向同一份內容，不另占珠位。</div>";
        if (t.notes.length) h += '<h3>子名相・校訂註</h3><ul class="notes">' + t.notes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
        h += "<h3>相關章節與頁碼 " + tag("book") + "</h3>" + refList(t.refs) +
          '<p class="pend small">〔直接〕詞語出現在該節／目標題；〔關聯〕為分類或合併上的關聯；〔僅章題〕僅章名出現。此為目次標題對照，不是正文逐字索引。</p>';
        h += pendBlock(t);
      }
    } else if (sel.k === "spacer" || sel.k === "zone") {
      var z2 = D.zones[sel.z];
      if (sel.k === "spacer") {
        h = zoneHead(z2) + "<h2>" + z2.spacerName + "：" + esc(z2.spacerTitle) + "</h2>" +
          '<p class="pos">環上編號 ' + z2.spacerNo + "／108 ・ 隔開其前 26 顆普通數珠（" + z2.first + "–" + z2.last + "）</p>";
        h += "<h3>原文的隔珠譬喻 " + tag("quote") + '</h3><div class="box">以風瑜伽為隔珠</div>';
        h += '<div class="notice">引文原本只說「以風瑜伽為隔珠」。將四顆隔珠分別設為「見、修、行、果」，是本網站的導覽安排，並非引文本身的說法。' + (sel.z === 1 ? "（第二隔珠標示「修（風瑜伽）」，與原文的風瑜伽相呼應。）" : "") + "</div>";
      } else h = zoneHead(z2) + "<h2>" + esc(z2.name) + "　區</h2>";
      h += zoneBody(z2);
    } else if (sel.k === "part") {
      var pt = D.parts[sel.id];
      h = '<p class="crumb">以數珠為喻 ・ 念珠部件</p><h2>' + esc(pt.title) + ' <small class="cnt">' + esc(pt.count) + "</small></h2><h3>譬喻 " + tag("quote") + '</h3><div class="box big">' + esc(pt.text) + "</div>";
      if (sel.id === "bead") h += '<p>環上共 108 顆：104 顆普通數珠＋4 顆隔珠。每 26 顆普通數珠之後接 1 顆隔珠。</p><div class="chips">' + D.zones.map(function (zn) { return chip("zone:" + zn.idx, esc(zn.name) + " 區 " + zn.first + "–" + zn.last); }).join("") + "</div>";
      if (sel.id === "spacer") h += '<div class="notice">四顆隔珠在環上第 27、54、81、108 顆。本站另以四隔珠標示「見、修、行、果」四區，這是導覽安排，不是引文原意。</div><div class="chips">' + D.zones.map(function (zn) { return chip("spacer:" + zn.idx, zn.spacerName + "・" + esc(zn.spacerTitle)); }).join("") + "</div>";
      if (sel.id === "head") h += '<div class="notice">本站以第四隔珠（環上第 108 顆，較其他隔珠大）兼作佛頭珠，上方加三通塔頭，飾穗由塔頭垂下。</div><div class="chips">' + chip("spacer:3", "查看第四隔珠") + "</div>";
      if (sel.id === "tassel") h += '<div class="notice">飾穗繫於佛頭珠尾端，為佛頭珠所懸。</div>';
      if (sel.id === "string") h += '<div class="notice">串繩連續貫穿環上 108 顆珠子。</div>';
      h += '<p class="pend">此為引文中的譬喻；進一步解說待補。</p>';
    } else if (sel.k === "chapter" || sel.k === "sec") {
      var s = sel.k === "sec" ? secById[sel.id] : null, c = chById[s ? s.ch : sel.id], parent = s && s.parent ? secById[s.parent] : null;
      h = '<p class="crumb">原書導讀 ・ ' + chLabel(c) + " ・ " + volText(c.vols) + " " + tag("book") + '</p><h2 class="chh">' + chLabel(c) + "　" + esc(c.title) + "</h2>";
      if (c.no === 7) h += '<div class="notice">第七章跨第一、二輯：第三節「應成派中觀之般若見」上半在第一輯、下半在第二輯，同屬一節。</div>';
      if (c.no === 9) h += '<div class="notice">第九章跨第二、三輯：第二輯含第一至第六節，第三輯接續第七至第十一節，同屬一章。</div>';
      if (s) {
        h += '<div class="secfocus"><p class="crumb">' + (parent ? secLabel(parent) + " " + esc(parent.title) + " ・ " : "") + secLabel(s) + "</p><h3 class=\"sech\">" + esc(s.title) + '</h3><p class="pos">原書頁碼 ' + esc(s.page) + " 頁 ・ " + VOLNAME(s.vol) + "</p>";
        if (s.items && s.items.length) h += '<ol class="items open">' + s.items.map(function (it) { return '<li><button class="irow" data-go="sec:' + it.id + '"><span class="sn">' + secLabel(it) + '</span><span class="st">' + esc(it.title) + '</span><span class="pg">' + esc(it.page) + "頁</span></button></li>"; }).join("") + "</ol>";
        var rel = termsOfSec(s.id);
        if (rel.length) h += "<h3>相關名相 " + tag("nav") + '</h3><div class="chips">' + rel.map(function (t) { return chip("bead:" + t.slot, esc(t.name) + " <small>" + esc(t.group) + "區</small>"); }).join("") + "</div>";
        h += pendBlock(s);
        h += '<p><button class="chip" data-go="chapter:' + c.id + '">‹ 回到本章節次</button></p></div>';
      } else {
        h += chapterBody(c, null);
        var rt = termsOfChapter(c.id);
        if (rt.length) h += "<h3>本章相關名相 " + tag("nav") + '</h3><div class="chips">' + rt.map(function (t) { return chip("bead:" + t.slot, esc(t.name) + " <small>" + esc(t.group) + "區</small>"); }).join("") + "</div>";
        else h += '<p class="pend small">本章目前沒有對應的名相主珠位，以章節模式完整閱讀。</p>';
        h += pendBlock(c);
      }
    } else if (sel.k === "extra") {
      var x = extraById[sel.id];
      h = '<p class="crumb">原書導讀 ・ 其他目次入口 ' + tag("book") + "</p><h2>" + esc(x.title) + '</h2><p class="pos">' + (x.vol ? VOLNAME(x.vol) + " ・ " : "") + "頁碼 " + esc(x.page || "待補") + '</p><p class="pend">目前僅有目次入口；內容待補。</p>';
    }
    el.innerHTML = h;
    el.scrollTop = 0;
  }

  /* ---------- 珠內閱讀：點珠後，文字直接寫在放大的珠內，左右露出相鄰珠 ---------- */
  function isDetail(s) { return !!s && (s.k === "bead" || s.k === "empty" || s.k === "chapter" || s.k === "sec"); }
  var texCache = {};
  function beadTex(k) { // 珠面正視圖：細小清晰的星點，越近邊緣越扁（球面透視）
    k = ((k % 6) + 6) % 6; if (texCache[k] != null) return texCache[k];
    try {
      var S = 900, c = document.createElement("canvas"); c.width = c.height = S; var g = c.getContext("2d"), seed = 97 + k * 131;
      var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      for (var i = 0; i < 620; i++) {
        var rr = Math.sqrt(rnd()) * 0.985, a = rnd() * Math.PI * 2, x = S / 2 + Math.cos(a) * rr * S / 2, y = S / 2 + Math.sin(a) * rr * S / 2;
        var sq = Math.sqrt(Math.max(0.04, 1 - rr * rr)), sz = (1.1 + Math.pow(rnd(), 2.2) * 2.6) * S / 900, d0 = Math.floor(70 + rnd() * 40), al = 0.75 + rnd() * 0.25;
        g.save(); g.translate(x, y); g.rotate(a); g.scale(sq, 1);
        var rg = g.createRadialGradient(0, 0, 0, 0, 0, sz * 1.4);
        rg.addColorStop(0, "rgba(" + d0 + "," + Math.floor(d0 * 0.62) + "," + Math.floor(d0 * 0.38) + "," + al + ")");
        rg.addColorStop(0.6, "rgba(" + (d0 + 25) + "," + Math.floor((d0 + 25) * 0.66) + "," + Math.floor((d0 + 25) * 0.42) + "," + al * 0.8 + ")");
        rg.addColorStop(1, "rgba(190,150,110,0)");
        g.fillStyle = rg; g.beginPath(); g.arc(0, 0, sz * 1.4, 0, Math.PI * 2); g.fill(); g.restore();
      }
      texCache[k] = c.toDataURL("image/png");
    } catch (e) { texCache[k] = ""; }
    return texCache[k];
  }
  function paintOrb(el, n, warm) {
    var t = beadTex(n);
    el.style.backgroundImage = "radial-gradient(circle at 36% 30%, rgba(255,255,255,.42), rgba(255,255,255,0) 42%), radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 60%, rgba(120,90,55,.26) 100%)" + (t ? ", url(" + t + ")" : "");
    el.style.backgroundColor = warm ? "#f2d3a2" : "#fbf6ec";
    el.classList.toggle("warm", !!warm);
  }
  function neighborsOf(s) {
    if (s.k === "chapter" || s.k === "sec") {
      var cid = s.k === "chapter" ? s.id : secById[s.id].ch, i = CH_ORDER.indexOf(cid), L = CH_ORDER.length;
      var pc = chById[CH_ORDER[(i - 1 + L) % L]], nc = chById[CH_ORDER[(i + 1) % L]];
      return { n: CH_BEAD[cid], warm: true, prev: { n: CH_BEAD[pc.id], name: chLabel(pc) + " " + shortTitle(pc.title) }, next: { n: CH_BEAD[nc.id], name: chLabel(nc) + " " + shortTitle(nc.title) }, unit: "章" };
    }
    var n = s.n, lo = ASSIGNED.filter(function (m) { return m < n; }), hi = ASSIGNED.filter(function (m) { return m > n; });
    var pn = lo.length ? lo[lo.length - 1] : ASSIGNED[ASSIGNED.length - 1], nn = hi.length ? hi[0] : ASSIGNED[0];
    return { n: n, warm: !!BEADS[n].term, prev: { n: pn, name: termById[BEADS[pn].term].name }, next: { n: nn, name: termById[BEADS[nn].term].name }, unit: "顆" };
  }
  function detailHTML(s) {
    var h = "";
    if (s.k === "bead" || s.k === "empty") {
      var b = BEADS[s.n], zn = D.zones[b.z];
      h += '<p class="bv-crumb">以數珠為喻 ・ ' + esc(zn.name) + "區 ・ 第 " + b.pos + "／26 珠 ・ 環上 " + s.n + "／108</p>";
      if (!b.term) return h + '<h1 id="bv-title">待配置珠位</h1><p class="bv-note">此珠位尚未配置名相，內容待補。</p><p class="bv-links">' + chip("zone:" + zn.idx, "查看「" + esc(zn.name) + "」區已配置名相") + "</p>";
      var t = termById[b.term];
      h += '<h1 id="bv-title">' + esc(t.name) + "</h1>";
      if (t.show.length > 1) h += '<p class="bv-note">主珠位在「' + esc(t.group) + "」區；亦於「" + esc(t.show.filter(function (g) { return g !== t.group; }).join("、")) + "」區顯示，為同一份內容。</p>";
      h += "<h2>內容</h2>";
      h += t.body ? '<div class="prose">' + esc(t.body) + "</div>" : '<p class="pend">原書正文待補。</p>';
      if (t.explanation) h += '<div class="prose">' + esc(t.explanation) + "</div>";
      if (t.notes.length) h += '<ul class="bv-notes">' + t.notes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
      if (t.image) h += '<figure class="fig"><img src="' + esc(t.image) + '" alt="' + esc(t.imageCaption || "") + '" loading="lazy"><figcaption>' + esc(t.imageCaption || "") + "</figcaption></figure>";
      h += "<h2>章節</h2>" + refList(t.refs) + '<p class="bv-note">〔直接〕詞語出現在該節／目標題；〔關聯〕為分類或合併上的關聯；〔僅章題〕僅章名出現。此為目次標題對照，不是正文逐字索引。</p>';
      h += '<p class="bv-links">' + chip("zone:" + zn.idx, "查看「" + esc(zn.name) + "」區全部名相") + "</p>";
      return h;
    }
    var sc = s.k === "sec" ? secById[s.id] : null, c = chById[sc ? sc.ch : s.id], parent = sc && sc.parent ? secById[sc.parent] : null;
    h += '<p class="bv-crumb">原書導讀 ・ ' + chLabel(c) + " ・ " + volText(c.vols) + "</p>";
    if (!sc) {
      h += '<h1 id="bv-title"><small>' + chLabel(c) + "</small>" + esc(c.title) + "</h1>";
      if (c.no === 7) h += '<p class="bv-note">第七章跨第一、二輯：第三節上半在第一輯、下半在第二輯，同屬一節。</p>';
      if (c.no === 9) h += '<p class="bv-note">第九章跨第二、三輯：第二輯含第一至第六節，第三輯接續第七至第十一節，同屬一章。</p>';
      h += "<h2>章節</h2>" + chapterBody(c, null);
      var rt = termsOfChapter(c.id);
      if (rt.length) h += "<h2>本章相關名相</h2><p class=\"bv-links\">" + rt.map(function (t) { return chip("bead:" + t.slot, esc(t.name)); }).join("") + "</p>";
      h += "<h2>內容</h2>" + (c.body ? '<div class="prose">' + esc(c.body) + "</div>" : '<p class="pend">原書正文與整理說明待補。</p>');
      return h;
    }
    h += '<h1 id="bv-title"><small>' + (parent ? secLabel(parent) + " " + esc(parent.title) + " ・ " : "") + secLabel(sc) + "</small>" + esc(sc.title) + "</h1>";
    h += '<p class="bv-note">原書頁碼 ' + esc(sc.page) + " 頁 ・ " + VOLNAME(sc.vol) + "</p>";
    if (sc.items && sc.items.length) h += '<h2>章節</h2><ol class="items open">' + sc.items.map(function (it) { return '<li><button class="irow" data-go="sec:' + it.id + '"><span class="sn">' + secLabel(it) + '</span><span class="st">' + esc(it.title) + '</span><span class="pg">' + esc(it.page) + "頁</span></button></li>"; }).join("") + "</ol>";
    h += "<h2>內容</h2>" + (sc.body ? '<div class="prose">' + esc(sc.body) + "</div>" : '<p class="pend">原書正文與整理說明待補。</p>');
    var rel = termsOfSec(sc.id);
    if (rel.length) h += "<h2>相關名相</h2><p class=\"bv-links\">" + rel.map(function (t) { return chip("bead:" + t.slot, esc(t.name) + " <small>" + esc(t.group) + "區</small>"); }).join("") + "</p>";
    h += '<p class="bv-links">' + chip("chapter:" + c.id, "‹ 回到" + chLabel(c) + "節次") + "</p>";
    return h;
  }
  var bvTimer = null;
  function syncBeadView() { // 文字浮在放大、半透明的那顆珠上；右側面板保留
    var v = $("#beadview");
    document.body.classList.toggle("reading", isDetail(sel) && has3D);
    if (!isDetail(sel) || !has3D) { if (!v.hidden) { v.classList.remove("on"); clearTimeout(bvTimer); bvTimer = setTimeout(function () { v.hidden = true; }, 400); } return; }
    var nb = neighborsOf(sel), wasOpen = !v.hidden && v.classList.contains("on");
    var content = $("#bv-content");
    $("#bv-prev .bv-dir").textContent = "‹ 上一" + nb.unit; $("#bv-next .bv-dir").textContent = "下一" + nb.unit + " ›";
    $("#bv-prev .bv-name").textContent = nb.prev.name; $("#bv-next .bv-name").textContent = nb.next.name;
    $("#bv-prev").setAttribute("aria-label", "上一" + nb.unit + "：" + nb.prev.name); $("#bv-next").setAttribute("aria-label", "下一" + nb.unit + "：" + nb.next.name);
    clearTimeout(bvTimer);
    v.hidden = false; v.classList.remove("on");
    content.innerHTML = detailHTML(sel); content.scrollTop = 0;
    bvTimer = setTimeout(function () { v.classList.add("on"); }, wasOpen ? 900 : 1500); // 等鏡頭拉近、珠子變半透明後再浮現文字
  }

  /* ---------- 純文字目次（3D 失效時仍可完整閱讀） ---------- */
  function buildToc() {
    var h = '<p class="pend small" style="margin-top:0">四輯十七章完整目次（章 17、節 159、目 21；第七章第三節分上下半）。點任一列可在念珠上定位並展開。</p>';
    var vol = 0;
    D.chapters.forEach(function (c) {
      if (c.vols[0] !== vol) { vol = c.vols[0]; h += "<h4>" + VOLNAME(vol) + "</h4>"; }
      h += '<details class="tocch" data-ch="' + c.id + '"><summary><button class="row" data-go="chapter:' + c.id + '"><span class="n">' + c.no + "</span><span>" + esc(c.title) + '</span><span class="cnt">' + c.sections.length + "節</span></button></summary><ol>" +
        c.sections.map(function (s) {
          return '<li><button class="trow" data-go="sec:' + s.id + '"><span>' + secLabel(s) + " " + esc(s.title) + "</span><i>" + esc(s.page) + (c.vols.length > 1 ? "・" + VOLNAME(s.vol) : "") + "</i></button>" +
            (s.items ? '<ol class="ti">' + s.items.map(function (it) { return '<li><button class="trow" data-go="sec:' + it.id + '"><span>' + secLabel(it) + " " + esc(it.title) + "</span><i>" + esc(it.page) + "</i></button></li>"; }).join("") + "</ol>" : "") + "</li>";
        }).join("") + "</ol></details>";
    });
    h += '<h4>其他目次入口</h4><ul class="toc">' + D.extras.map(function (x) { return '<li><button class="trow" data-go="extra:' + x.id + '"><span>' + esc(x.title) + (x.vol ? "（" + VOLNAME(x.vol) + "）" : "") + "</span><i>" + esc(x.page) + "</i></button></li>"; }).join("") + "</ul>";
    $("#pane-toc").innerHTML = h;
    $("#chsel").innerHTML = '<option value="">— 選擇章節 —</option>' + D.chapters.map(function (c) { return '<option value="chapter:' + c.id + '">' + chLabel(c) + " " + esc(c.title) + "</option>"; }).join("") +
      D.extras.map(function (x) { return '<option value="extra:' + x.id + '">' + esc(x.title) + (x.vol ? "（" + VOLNAME(x.vol) + "）" : "") + "</option>"; }).join("");
  }
  function syncToc() {
    var cid = sel && sel.k === "chapter" ? sel.id : sel && sel.k === "sec" ? secById[sel.id].ch : null;
    document.querySelectorAll("#pane-toc [data-go]").forEach(function (b) {
      var a = b.getAttribute("data-go");
      b.classList.toggle("on", !!(sel && (a === sel.k + ":" + (sel.id))));
    });
    document.querySelectorAll("#pane-toc details").forEach(function (d) { if (d.getAttribute("data-ch") === cid) d.open = true; });
    $("#chsel").value = cid ? "chapter:" + cid : sel && sel.k === "extra" ? "extra:" + sel.id : "";
  }
  function showTab(name) {
    var c = name === "content";
    $("#tab-content").setAttribute("aria-selected", c); $("#tab-toc").setAttribute("aria-selected", !c);
    $("#pane-content").hidden = !c; $("#pane-toc").hidden = c;
  }

  /* ---------- 導覽 ---------- */
  function go(str, opt) {
    var a = parseAct(str), v = a.v;
    if (a.k === "bead" || a.k === "empty") { var b = BEADS[+v]; if (b && !b.spacer) select({ k: b.term ? "bead" : "empty", n: +v }, opt); else if (b) select({ k: "spacer", z: b.z }, opt); }
    else if (a.k === "spacer") select({ k: "spacer", z: +v }, opt);
    else if (a.k === "zone") select({ k: "zone", z: +v }, opt);
    else if (a.k === "part") { if (D.parts[v]) select({ k: "part", id: v }, opt); }
    else if (a.k === "chapter") { if (chById[v]) select({ k: "chapter", id: v }, opt); }
    else if (a.k === "sec") { if (secById[v]) select({ k: "sec", id: v }, opt); }
    else if (a.k === "extra") { if (extraById[v]) select({ k: "extra", id: v }, opt); }
  }
  function step(d) {
    if (mode === "book") {
      var cid = sel && sel.k === "chapter" ? sel.id : sel && sel.k === "sec" ? secById[sel.id].ch : null, i = CH_ORDER.indexOf(cid);
      i = i < 0 ? (d > 0 ? 0 : CH_ORDER.length - 1) : (i + d + CH_ORDER.length) % CH_ORDER.length;
      select({ k: "chapter", id: CH_ORDER[i] }); return;
    }
    var cur;
    if (sel && (sel.k === "bead" || sel.k === "empty")) cur = sel.n;
    else if (sel && sel.k === "spacer") cur = D.zones[sel.z].spacerNo;
    else if (sel && sel.k === "zone") cur = D.zones[sel.z].first - 0.5;
    else cur = lastBead || (d > 0 ? 0 : 109);
    var pick;
    if (d > 0) { pick = ASSIGNED.filter(function (m) { return m > cur; })[0]; if (!pick) pick = ASSIGNED[0]; }
    else { var lo = ASSIGNED.filter(function (m) { return m < cur; }); pick = lo.length ? lo[lo.length - 1] : ASSIGNED[ASSIGNED.length - 1]; }
    select({ k: "bead", n: pick });
  }

  /* ---------- 引文：先顯示開頭，點選展開全文與署名 ---------- */
  function initQuote() {
    var q = D.quote, cut = q.indexOf("為數珠") + 3, box = $("#main-quote"), p = $("#quote"), btn = $("#quote-toggle");
    var open = false;
    function draw() {
      p.textContent = open ? q : q.slice(0, cut) + "⋯⋯";
      btn.textContent = open ? "收合引文" : "展開完整引文與署名";
      btn.setAttribute("aria-expanded", open); box.classList.toggle("open", open);
    }
    btn.onclick = function () { open = !open; draw(); };
    $("#quote-full").textContent = q; // 供搜尋、無障礙及測試的完整原文
    draw();
  }

  function goBack() { var b = backSel; select(isDetail(sel) && b ? b : null); }
  function init() {
    initQuote();
    buildToc();
    $("#partbar").innerHTML = PART_KEYS.map(function (kk) { return '<button type="button" data-go="part:' + kk + '">' + esc(D.parts[kk].title) + "</button>"; }).join("") +
      D.zones.map(function (zn) { return '<button type="button" class="mala-only" data-go="spacer:' + zn.idx + '">' + zn.spacerName + "・" + esc(zn.spacerTitle) + "</button>"; }).join("");
    try { has3D = !!(window.THREE && window.KM3D && window.KM3D.init(KM)); } catch (e) { console.error(e); has3D = false; }
    if (!has3D) {
      $("#gl-fail").hidden = false;
      var l = $("#loading"); if (l) l.style.display = "none";
    }
    setMode("mala", true); renderPanel(); syncNav();
    document.addEventListener("click", function (e) {
      var bt = e.target.closest("[data-batch]");
      if (bt) { var pr = bt.getAttribute("data-batch").split(":"); batch[pr[0]] = (batch[pr[0]] || 0) + (+pr[1]) * batchSize(); renderPanel();
        if (isDetail(sel)) { var bc = $("#bv-content"), keep = bc.scrollTop; bc.innerHTML = detailHTML(sel); bc.scrollTop = keep; var nb2 = bc.querySelector('[data-batch="' + pr[0] + ':' + pr[1] + '"]'); if (nb2 && !nb2.disabled) nb2.focus({ preventScroll: true }); }
        return; }
      var t = e.target.closest("[data-go]"); if (!t) return;
      if (t.closest("summary")) e.preventDefault();
      go(t.getAttribute("data-go"));
    });
    document.addEventListener("keydown", function (e) {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") goBack();
    });
    $("#prev").onclick = function () { step(-1); };
    $("#next").onclick = function () { step(1); };
    $("#home").onclick = function () { select(null); };
    $("#bv-back").onclick = function () { goBack(); };
    $("#bv-prev").onclick = function () { step(-1); };
    $("#bv-next").onclick = function () { step(1); };

    $("#mode-mala").onclick = function () { setMode("mala"); };
    $("#mode-terms").onclick = function () { setMode("terms"); };
    $("#mode-book").onclick = function () { setMode("book"); };
    $("#chsel").onchange = function (e) { if (e.target.value) go(e.target.value); };
    $("#tab-content").onclick = function () { showTab("content"); };
    $("#tab-toc").onclick = function () { showTab("toc"); };
    var mb = $("#motion"), paused = false, reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    function setMotion(off) { paused = off; if (has3D) KM3D.setPaused(off); mb.setAttribute("aria-pressed", off); mb.textContent = off ? "恢復動態" : "暫停動態"; }
    mb.onclick = function () { setMotion(!paused); };
    if (reduce) setMotion(true);
    var lb = $("#lines"), on = true;
    lb.onclick = function () { on = !on; if (has3D) KM3D.setLines(on); lb.setAttribute("aria-pressed", on); lb.textContent = on ? "引線：開" : "引線：關"; };
    narrowMQ.addEventListener && narrowMQ.addEventListener("change", function () { batch = {}; renderPanel(); });
    var m = /^#(bead|spacer|zone|part|ch|sec|x|book|terms)-?(.*)$/.exec(location.hash);
    if (m) {
      setTimeout(function () {
        if (m[1] === "book" || m[1] === "terms") { setMode(m[1]); return; }
        var kk = { ch: "chapter", x: "extra" }[m[1]] || m[1];
        go(kk + ":" + decodeURIComponent(m[2]), { hash: false });
      }, 300);
    }
  }
  init();
})();
