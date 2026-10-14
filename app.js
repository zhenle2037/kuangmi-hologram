/* 數珠導覽 — 狀態、內容面板、目次與導覽。內容全部來自 data/content.js；3D 畫面在 scene.js。 */
(function () {
  "use strict";
  var D = window.KM_DATA;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var SRC = { book: "書籍目次", quote: "平實導師引文", nav: "本站導覽分類" };
  var tag = function (k) { return '<span class="tag ' + k + '">' + SRC[k] + "</span>"; };
  var ZCOLOR = { jian: "#6fe3f0", xiu: "#ffd27a", xing: "#c9a8ff", guo: "#ff8f9d" };

  var chById = {}, termById = {}, extraById = {};
  D.chapters.forEach(function (c) { chById[c.id] = c; });
  D.terms.forEach(function (t) { termById[t.id] = t; });
  D.extras.forEach(function (x) { extraById[x.id] = x; });

  /* ---------- 珠位模型（唯一準則：每 26 顆普通數珠後接 1 顆隔珠） ---------- */
  var BEADS = [];
  for (var n = 1; n <= 108; n++) {
    var z = Math.floor((n - 1) / 27), r = ((n - 1) % 27) + 1;
    BEADS[n] = { n: n, z: z, pos: r, spacer: r === 27, term: null };
  }
  D.zones.forEach(function (zn, zi) {
    zn.idx = zi; zn.first = zi * 27 + 1; zn.last = zi * 27 + 26; zn.spacerNo = zi * 27 + 27;
    zn.terms.forEach(function (tid, i) { BEADS[zn.first + i].term = tid; });
  });
  var ASSIGNED = BEADS.filter(function (b) { return b && b.term; }).map(function (b) { return b.n; });
  function zonesOfChapter(cid) {
    return D.zones.filter(function (zn) { return zn.chapters.some(function (c) { return c.id === cid; }); });
  }

  var sel = null, lastBead = 0, has3D = false;
  var KM = window.KM = { D: D, BEADS: BEADS, ASSIGNED: ASSIGNED, termById: termById, chById: chById, zonesOfChapter: zonesOfChapter, esc: esc,
    go: function (a, o) { go(a, o); }, getSel: function () { return sel; } };

  /* ---------- 選取 ---------- */
  function parseAct(a) { var i = a.indexOf(":"); return { k: a.slice(0, i), v: a.slice(i + 1) }; }
  function hashOf(s) {
    return s.k === "bead" ? "bead-" + s.n : s.k === "spacer" || s.k === "zone" ? s.k + "-" + s.z : s.k === "part" ? "part-" + s.id : s.k === "chapter" ? "ch-" + s.id : s.id;
  }
  function select(s, opt) {
    opt = opt || {};
    sel = s; if (s && s.k === "bead") lastBead = s.n;
    renderPanel(); syncToc();
    if (has3D) window.KM3D.setSelection(s);
    if (opt.hash !== false) { try { history.replaceState(null, "", s ? "#" + hashOf(s) : location.pathname + location.search); } catch (e) {} }
    if (opt.tab !== false) showTab("content");
  }

  /* ---------- 面板 ---------- */
  function chipsForChapters(list) {
    return '<div class="chips">' + list.map(function (c) {
      var ch = chById[c.id];
      return '<button class="chip" data-go="chapter:' + ch.id + '">第' + ch.no + "章 " + esc(ch.title) + (c.partial ? " <small>（部分內容）</small>" : "") + "</button>";
    }).join("") + "</div>";
  }
  function pendBlock() { return '<h3>正文・解說・出處</h3><p class="pend">正文待補。（解說、出處、相關名相欄位已預留於 data/content.js。）</p>'; }
  function zoneHead(zn) { return '<p class="crumb zone-' + zn.id + '">' + esc(zn.name) + "區 ・ 數珠 " + zn.first + "–" + zn.last + "，隔珠 " + zn.spacerNo + "</p>"; }
  function zoneBody(zn) {
    var h = "<h3>分類說明 " + tag("nav") + '</h3><div class="box"><p>' + esc(zn.summary) + "</p><p>核心：" + esc(zn.core) + "</p></div>";
    h += '<h3>相關名相（已配置珠位）</h3><div class="chips">' + zn.terms.map(function (tid, i) {
      var n = zn.first + i;
      return '<button class="chip" data-go="bead:' + n + '">' + (i + 1) + ". " + esc(termById[tid].name) + " <small>珠" + n + "</small></button>";
    }).join("") + "</div>";
    h += '<p class="pend" style="font-size:.88rem">本區 26 個珠位中，已配置 ' + zn.terms.length + " 個，其餘 " + (26 - zn.terms.length) + " 個待配置。</p>";
    h += "<h3>主要對應章 " + tag("nav") + '</h3><p style="margin:.2em 0;font-size:.92rem">' + esc(zn.mainNote) + "</p>" + chipsForChapters(zn.chapters);
    return h;
  }
  function renderPanel() {
    var el = $("#pane-content"), h = "";
    if (!sel) {
      h = '<p class="crumb">總覽</p><h2>請選取念珠、文字或目次</h2>' +
        "<p>拖曳可旋轉視角。點「見、修、行、果」隔珠或標籤，查看該區名相；點已配置的數珠，念珠會轉動並飛近，把它停在畫面中央；或切到「原書目次」按章瀏覽。左右切換只會在已配置內容的珠位間移動。</p>" +
        '<h3>四個區段</h3><div class="chips">' + D.zones.map(function (zn) { return '<button class="chip zone-' + zn.id + '" data-go="zone:' + zn.idx + '">' + esc(zn.name) + " 區 <small>" + zn.first + "–" + zn.last + "</small></button>"; }).join("") + "</div>" +
        '<h3>部件</h3><div class="chips">' + ["bead", "head", "tassel", "string"].map(function (k) { return '<button class="chip" data-go="part:' + k + '">' + esc(D.parts[k].title.replace(/（.*$/, "")) + "</button>"; }).join("") +
        D.zones.map(function (zn) { return '<button class="chip" data-go="spacer:' + zn.idx + '">' + zn.spacerName + "・" + esc(zn.spacerTitle) + "</button>"; }).join("") + "</div>" +
        '<div class="notice">環上 108 顆＝104 顆普通數珠＋4 顆隔珠（編號 27、54、81、108）；佛頭珠另計，與第四隔珠是不同部件。「見修行果」是本網站的導覽分類，不是引文原意。暗淡的珠子為待配置珠位。</div>';
    } else if (sel.k === "bead") {
      var b = BEADS[sel.n], zn = D.zones[b.z], t = termById[b.term];
      h = zoneHead(zn) + "<h2>" + esc(t.name) + "</h2>" +
        '<p class="pos">' + esc(zn.name) + "區 第 " + b.pos + "／26 珠 ・ 環上編號 " + sel.n + "／108 ・ 已配置 " + (zn.terms.indexOf(b.term) + 1) + "／" + zn.terms.length + " " + tag("nav") + "</p>";
      h += "<h3>名相 " + tag("nav") + '</h3><div class="box">' + esc(t.name) + "</div>";
      h += "<h3>所屬章（區段層級對應）</h3>" + chipsForChapters(zn.chapters);
      h += '<div class="notice">此名相與各章、節、目的細部對應尚待確認。上列為「' + esc(zn.name) + "」區所列之主要對應章（" + esc(zn.mainNote) + "），不代表該名相出自每一章。</div>";
      if (t.note) h += '<div class="notice">' + esc(t.note) + "</div>";
      var others = ASSIGNED.filter(function (m) { return BEADS[m].term === b.term && m !== sel.n; });
      if (others.length) h += '<h3>同一名相亦見於</h3><div class="chips">' + others.map(function (m) { return '<button class="chip" data-go="bead:' + m + '">' + esc(D.zones[BEADS[m].z].name) + "區 ・ 珠" + m + "</button>"; }).join("") + "</div>";
      h += pendBlock();
      h += '<p><button class="chip" data-go="zone:' + zn.idx + '">查看「' + esc(zn.name) + "」區全部名相</button></p>";
    } else if (sel.k === "spacer" || sel.k === "zone") {
      var z2 = D.zones[sel.z];
      if (sel.k === "spacer") {
        h = zoneHead(z2) + "<h2>" + z2.spacerName + "：" + esc(z2.spacerTitle) + "</h2>" +
          '<p class="pos">環上編號 ' + z2.spacerNo + "／108 ・ 代表其前 26 顆普通數珠（" + z2.first + "–" + z2.last + "）</p>";
        h += "<h3>原文的隔珠譬喻 " + tag("quote") + '</h3><div class="box">以風瑜伽為隔珠</div>';
        h += '<div class="notice">引文原本只說「以風瑜伽為隔珠」。將四顆隔珠分別設為「見、修、行、果」，是本網站的導覽安排，並非引文本身的說法。' + (sel.z === 1 ? "（第二隔珠標示「修（風瑜伽）」，與原文的風瑜伽相呼應。）" : "") + "</div>";
      } else h = zoneHead(z2) + "<h2>" + esc(z2.name) + "　區</h2>";
      h += zoneBody(z2);
    } else if (sel.k === "part") {
      var pt0 = D.parts[sel.id];
      h = '<p class="crumb">念珠部件</p><h2>' + esc(pt0.title) + "</h2><h3>譬喻 " + tag(pt0.src) + '</h3><div class="box">' + esc(pt0.text) + "</div>";
      if (sel.id === "bead") h += '<p>環上共 108 顆：104 顆普通數珠＋4 顆隔珠。每 26 顆普通數珠之後接 1 顆隔珠。普通數珠上的名相配置見四區說明。</p><div class="chips">' + D.zones.map(function (zn) { return '<button class="chip" data-go="zone:' + zn.idx + '">' + esc(zn.name) + " 區 " + zn.first + "–" + zn.last + "</button>"; }).join("") + "</div>";
      if (sel.id === "head") h += '<div class="notice">佛頭珠位於第四隔珠（環上第 108 顆）上方，是另計的 1 顆，不可與第四隔珠合併。</div>';
      if (sel.id === "string") h += '<div class="notice">串繩連續貫穿環上 108 顆珠子。</div>';
      h += '<p class="pend">此為引文中的譬喻說明；進一步解說待補。</p>';
    } else if (sel.k === "chapter") {
      var c = chById[sel.id], zs = zonesOfChapter(c.id);
      h = '<p class="crumb">原書目次 ・ 第 ' + c.no + " 章 " + tag("book") + "</p><h2>第" + c.no + "章 " + esc(c.title) + "</h2>";
      if (c.volumes) h += '<p class="pos">' + esc(c.volumes) + "</p>";
      h += "<h3>節、目、頁碼 " + tag("book") + "</h3>";
      if (c.sections) {
        h += '<ul class="toc" style="margin:0">' + c.sections.map(function (s) { return '<li class="sub" style="padding-left:0;color:var(--fg)">' + esc(s.no) + " " + esc(s.title) + '　<small class="pend">' + esc(s.volume) + "；頁碼待補</small></li>"; }).join("") + "</ul>";
        h += '<p class="pend" style="font-size:.88rem">其餘節、目及頁碼待補，不猜補。第七章第三節跨輯接續：上半在第一輯、下半在第二輯，各保留原題名。</p>';
      } else if (c.volumeNote) h += "<p>" + esc(c.volumeNote) + "</p>";
      else h += '<p class="pend">本章的節、目與頁碼待補（尚未提供）。</p>';
      h += "<h3>所屬分類 " + tag("nav") + "</h3>";
      if (zs.length) {
        h += '<div class="chips">' + zs.map(function (zn) { var part = zn.chapters.filter(function (x) { return x.id === c.id; })[0].partial; return '<button class="chip zone-' + zn.id + '" data-go="zone:' + zn.idx + '">' + esc(zn.name) + "區" + (part ? " <small>（部分內容）</small>" : "") + "</button>"; }).join("") + "</div>";
        h += '<div class="notice">念珠上已高亮這些區段中已配置的珠位。分類為章層級對應，節級對應待確認。</div>';
      } else h += '<p class="pend">此章尚未配置到「見修行果」珠位（待確認），仍可由目次進入。</p>';
      h += pendBlock();
    } else if (sel.k === "extra") {
      var x = extraById[sel.id];
      h = '<p class="crumb">原書目次入口 ' + tag("book") + "</p><h2>" + esc(x.title) + '</h2><p class="pend">目前僅有目次入口；內容與頁碼待補。</p>';
    }
    el.innerHTML = h;
    el.scrollTop = 0;
  }

  /* ---------- 目次 ---------- */
  function buildToc() {
    var h = '<p class="pend" style="font-size:.88rem;margin-top:0">已提供的章名皆列於此；各章的輯別、節、目、頁碼待補，未提供者不猜補。圓點為本站導覽分類。</p><ul class="toc">';
    D.chapters.forEach(function (c) {
      var zs = zonesOfChapter(c.id);
      h += '<li><button class="row" data-go="chapter:' + c.id + '"><span class="n">' + c.no + "</span><span>" + esc(c.title) + '</span><span class="dots">' +
        zs.map(function (zn) { return '<b style="background:' + ZCOLOR[zn.id] + '" title="' + zn.name + '">' + zn.name + "</b>"; }).join("") + "</span></button>";
      if (c.volumes) h += '<div class="sub" style="padding-bottom:4px">' + esc(c.volumes) + "</div>";
      if (c.sections) h += c.sections.map(function (s) { return '<div class="sub">' + esc(s.no) + " " + esc(s.title) + "（" + esc(s.volume) + "）</div>"; }).join("");
      if (c.volumeNote) h += '<div class="sub">' + esc(c.volumeNote) + "</div>";
      h += "</li>";
    });
    h += '</ul><h4>其他目次入口</h4><ul class="toc">' + D.extras.map(function (x) { return '<li><button class="row" data-go="extra:' + x.id + '"><span>' + esc(x.title) + '</span><span class="dots pend">待補</span></button></li>'; }).join("") + "</ul>";
    $("#pane-toc").innerHTML = h;
    $("#chsel").innerHTML = '<option value="">— 選擇章節 —</option>' + D.chapters.map(function (c) { return '<option value="chapter:' + c.id + '">第' + c.no + "章 " + esc(c.title) + "</option>"; }).join("") +
      D.extras.map(function (x) { return '<option value="extra:' + x.id + '">' + esc(x.title) + "</option>"; }).join("");
  }
  function syncToc() {
    document.querySelectorAll("#pane-toc .row").forEach(function (b) {
      b.classList.toggle("on", !!(sel && (sel.k === "chapter" || sel.k === "extra") && b.getAttribute("data-go") === sel.k + ":" + sel.id));
    });
    $("#chsel").value = sel && (sel.k === "chapter" || sel.k === "extra") ? sel.k + ":" + sel.id : "";
  }
  function showTab(name) {
    var c = name === "content";
    $("#tab-content").setAttribute("aria-selected", c); $("#tab-toc").setAttribute("aria-selected", !c);
    $("#pane-content").hidden = !c; $("#pane-toc").hidden = c;
  }

  /* ---------- 導覽 ---------- */
  function go(str, opt) {
    var a = parseAct(str), v = a.v;
    if (a.k === "bead") { if (BEADS[+v] && BEADS[+v].term) select({ k: "bead", n: +v }, opt); }
    else if (a.k === "spacer") select({ k: "spacer", z: +v }, opt);
    else if (a.k === "zone") select({ k: "zone", z: +v }, opt);
    else if (a.k === "part") { if (D.parts[v]) select({ k: "part", id: v }, opt); }
    else if (a.k === "chapter") { if (chById[v]) select({ k: "chapter", id: v }, opt); }
    else if (a.k === "extra") { if (extraById[v]) select({ k: "extra", id: v }, opt); }
  }
  function step(d) {
    var cur;
    if (sel && sel.k === "bead") cur = sel.n;
    else if (sel && sel.k === "spacer") cur = D.zones[sel.z].spacerNo;
    else if (sel && sel.k === "zone") cur = D.zones[sel.z].first - 0.5;
    else if (sel && sel.k === "chapter") { var zs = zonesOfChapter(sel.id); cur = zs.length ? zs[0].first - 0.5 : lastBead; }
    else cur = lastBead || (d > 0 ? 0 : 109);
    var pick;
    if (d > 0) { pick = ASSIGNED.filter(function (m) { return m > cur; })[0]; if (!pick) pick = ASSIGNED[0]; }
    else { var lo = ASSIGNED.filter(function (m) { return m < cur; }); pick = lo.length ? lo[lo.length - 1] : ASSIGNED[ASSIGNED.length - 1]; }
    select({ k: "bead", n: pick });
  }

  function init() {
    $("#quote").textContent = D.quote;
    buildToc();
    $("#partbar").innerHTML = ["bead", "head", "tassel", "string"].map(function (kk) { return '<button type="button" data-go="part:' + kk + '">' + esc(D.parts[kk].title.replace(/（.*$/, "")) + "說明</button>"; }).join("") +
      D.zones.map(function (zn) { return '<button type="button" data-go="spacer:' + zn.idx + '">' + zn.spacerName + "・" + esc(zn.spacerTitle) + "</button>"; }).join("");
    renderPanel();
    try { has3D = !!(window.THREE && window.KM3D && window.KM3D.init(KM)); } catch (e) { console.error(e); has3D = false; }
    if (!has3D) {
      $("#gl-fail").hidden = false;
      var l = $("#loading"); if (l) l.style.display = "none";
    }
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-go]"); if (!t) return;
      go(t.getAttribute("data-go"));
    });
    document.addEventListener("keydown", function (e) {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") select(null);
    });
    $("#prev").onclick = function () { step(-1); };
    $("#next").onclick = function () { step(1); };
    $("#home").onclick = function () { select(null); };
    $("#chsel").onchange = function (e) { if (e.target.value) go(e.target.value); };
    $("#tab-content").onclick = function () { showTab("content"); };
    $("#tab-toc").onclick = function () { showTab("toc"); };
    var mb = $("#motion"), paused = false, reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    function setMotion(off) { paused = off; if (has3D) KM3D.setPaused(off); mb.setAttribute("aria-pressed", off); mb.textContent = off ? "恢復動態" : "暫停動態"; }
    mb.onclick = function () { setMotion(!paused); };
    if (reduce) setMotion(true);
    var lb = $("#lines"), on = true;
    lb.onclick = function () { on = !on; if (has3D) KM3D.setLines(on); lb.setAttribute("aria-pressed", on); lb.textContent = on ? "引線：開" : "引線：關"; };
    var m = /^#(bead|spacer|zone|part|ch|x)-(.+)$/.exec(location.hash);
    if (m) {
      var kk = { ch: "chapter", x: "extra" }[m[1]] || m[1], v = kk === "extra" ? "x-" + m[2] : m[2];
      setTimeout(function () { go(kk + ":" + v, { hash: false }); }, 300);
    }
  }
  init();
})();
