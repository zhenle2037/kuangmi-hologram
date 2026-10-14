/* 數珠網站管理後台
 * - 登入：Supabase Auth（Google 或 Email 登入連結）
 * - 所有讀寫都經過資料庫函式（RPC），由資料庫檢查角色；前端隱藏按鈕只是方便，不是安全機制
 * - 畫面上的文字一律以 textContent 寫入，不使用 innerHTML 插入資料，避免 XSS */
(function () {
  "use strict";
  var C = window.KM_CONFIG || {};
  var ORIGINAL_QUOTE = "以數珠為喻：西藏密宗乃是以種種虛構之觀想法、持外道咒、天瑜伽、遷識⋯等外道法為數珠，以風瑜伽為隔珠，以佛教教相及僧寶表相為佛頭珠；以自己所定義之般若中觀名相及果位修證名相，作為佛頭珠所懸之飾穗，最後以淫樂之樂空雙運欲界外道雙身法為串繩，貫串密宗之一切成佛理論與行門。如是串成之數珠，即是西藏密教之真實宗義。－－平實導師－－";
  var KINDS = ["直接", "關聯", "僅章題"];
  var app = document.getElementById("app"), who = document.getElementById("who"), noticeEl = document.getElementById("notice");
  var sb = null, S = null, tab = "terms", dirty = false, selTerm = null, selChapter = null;

  /* ---------- 小工具 ---------- */
  function el(tag, attrs) {
    var e = document.createElement(tag), i, k;
    attrs = attrs || {};
    for (k in attrs) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "on") { for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]); }
      else if (k === "cls") e.className = attrs[k];
      else if (attrs[k] === true) e.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    for (i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue; if (Array.isArray(c)) c.forEach(function (x) { if (x) e.appendChild(typeof x === "string" ? document.createTextNode(x) : x); }); else e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function notice(msg, kind) { noticeEl.hidden = !msg; noticeEl.className = "notice" + (kind ? " " + kind : ""); noticeEl.textContent = msg || ""; if (msg && kind === "ok") setTimeout(function () { if (noticeEl.textContent === msg) notice(""); }, 4000); }
  function errText(e) {
    var m = (e && (e.message || e.details)) || String(e);
    if (/not_authorized/.test(m)) return "沒有權限執行此操作。";
    if (/version_conflict/.test(m)) return "版本衝突：" + m.replace(/^.*version_conflict:\s*/, "");
    if (/bead_occupied|bead_category_mismatch|term_archived|validation_failed|cannot_demote_self/.test(m)) return m.replace(/^[a-z_]+:\s*/, "");
    return "操作失敗：" + m;
  }
  function isConflict(e) { return /version_conflict/.test((e && e.message) || "") || (e && e.code === "40001"); }
  function rpc(name, args) { return sb.rpc(name, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function isOwner() { return S && S.me && S.me.role === "owner"; }
  function catName(id) { var c = S.categories.find(function (x) { return x.id === id; }); return c ? c.name : id; }
  function setDirty(v) { dirty = v; }
  function confirmLeave() { return !dirty || confirm("有尚未儲存的修改，確定要離開嗎？（修改將會遺失）"); }
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- 啟動與登入 ---------- */
  if (!C.supabaseUrl || !C.supabaseAnonKey) {
    clear(app).appendChild(el("div", { cls: "card login" }, el("h2", { text: "尚未連接資料庫" }),
      el("p", { text: "請依 docs/後台設定說明.md 建立 Supabase 專案，並在 assets/config.js 填入 Project URL 與 anon public key。" })));
    return;
  }
  sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") boot(); });
  boot();

  function boot() {
    sb.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (!session) return showLogin();
      return reload().catch(function (e) {
        if (/not_authorized/.test(e.message || "")) return showNoAccess(session.user.email);
        notice(errText(e), "err");
      });
    });
  }
  function headerFor(email, role) {
    clear(who).appendChild(el("span", { text: email }));
    if (role) who.appendChild(el("span", { cls: "role", text: { owner: "Owner 擁有者", editor: "Editor 編輯者", none: "未授權" }[role] || role }));
    who.appendChild(el("a", { href: "../", target: "_blank", text: "網站" }));
    if (role === "owner" || role === "editor") who.appendChild(el("a", { href: "../?preview=1", target: "_blank", text: "預覽草稿" }));
    who.appendChild(el("button", { text: "登出", on: { click: function () { if (confirmLeave()) { dirty = false; sb.auth.signOut(); } } } }));
  }
  function showLogin() {
    clear(who); var email = el("input", { type: "email", placeholder: "you@example.com", autocomplete: "email" });
    clear(app).appendChild(el("div", { cls: "card login" },
      el("h2", { text: "登入管理後台" }),
      el("p", { cls: "muted small", text: "只有網站擁有者授權的帳號可以編輯。訪客不需登入即可瀏覽網站。" }),
      el("button", { cls: "primary", text: "使用 Google 登入", on: { click: function () { sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href.split("#")[0] } }); } } }),
      el("label", { text: "或用 Email 收取登入連結" }), email,
      el("button", { text: "寄送登入連結", on: { click: function () {
        if (!email.value) return;
        sb.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: location.href.split("#")[0] } }).then(function (r) {
          notice(r.error ? errText(r.error) : "已寄出登入連結，請到信箱點擊連結完成登入。", r.error ? "err" : "ok");
        });
      } } })));
  }
  function showNoAccess(email) {
    headerFor(email, "none");
    clear(app).appendChild(el("div", { cls: "card login" }, el("h2", { text: "尚未獲得編輯權限" }),
      el("p", { text: "你已登入（" + email + "），但這個帳號尚未被網站擁有者授權。請將此 Email 告知擁有者，授權後重新整理此頁即可。" })));
  }
  function reload(keep) {
    return rpc("admin_load").then(function (d) {
      S = d; S.sections = S.sections || [];
      headerFor(S.me.email, S.me.role);
      render(keep);
    });
  }

  /* ---------- 版面 ---------- */
  var TABS = [["terms", "名相"], ["beads", "108 珠位"], ["chapters", "章節"], ["settings", "分類與網站設定"], ["publish", "發布與版本"], ["members", "成員權限"], ["audit", "操作紀錄"]];
  function render(keep) {
    clear(app);
    if (S.problems && S.problems.length) app.appendChild(el("div", { cls: "notice err" }, "發布前需修正：" + S.problems.join("；")));
    var nav = el("div", { cls: "tabs", role: "tablist" });
    TABS.forEach(function (t) {
      if (t[0] === "members" && !isOwner()) return;
      nav.appendChild(el("button", { role: "tab", "aria-selected": tab === t[0] ? "true" : "false", text: t[1], on: { click: function () { if (tab !== t[0] && confirmLeave()) { dirty = false; tab = t[0]; render(); } } } }));
    });
    app.appendChild(nav);
    var body = el("div"); app.appendChild(body);
    ({ terms: viewTerms, beads: viewBeads, chapters: viewChapters, settings: viewSettings, publish: viewPublish, members: viewMembers, audit: viewAudit })[tab](body, keep);
  }

  /* ---------- 名相 ---------- */
  var filt = { q: "", cat: "", arch: false };
  function viewTerms(body) {
    var left = el("div", { cls: "card" }), right = el("div", { cls: "card", id: "term-editor" });
    body.appendChild(el("div", { cls: "cols" }, left, right));
    var q = el("input", { type: "search", placeholder: "搜尋名相、內文、章節…", value: filt.q });
    var cat = el("select", {}, el("option", { value: "", text: "全部分類" }), S.categories.map(function (c) { return el("option", { value: c.id, text: c.name + "（主分類）", selected: filt.cat === c.id }); }));
    var arch = el("input", { type: "checkbox", checked: filt.arch });
    var list = el("div", { cls: "list" });
    left.appendChild(el("div", {}, q, el("div", { cls: "row", style: "margin-top:6px" }, cat, el("label", { cls: "fix", style: "margin:0;display:flex;gap:4px;align-items:center;white-space:nowrap" }, arch, "含封存"))));
    left.appendChild(el("div", { cls: "row", style: "margin-top:6px" }, el("button", { text: "＋ 新增名相", on: { click: newTerm } })));
    left.appendChild(list);
    function draw() {
      clear(list);
      var qs = filt.q.trim().toLowerCase();
      var rows = S.terms.filter(function (t) {
        if (!filt.arch && t.archived) return false;
        if (filt.cat && t.primary_category !== filt.cat) return false;
        if (!qs) return true;
        return [t.name, t.body, t.explanation, (t.notes || []).join(" "), (t.refs || []).map(function (r) { return r.label; }).join(" ")].join(" ").toLowerCase().indexOf(qs) >= 0;
      }).sort(function (a, b) { return (a.slot || 999) - (b.slot || 999); });
      rows.forEach(function (t) {
        list.appendChild(el("button", { cls: selTerm === t.id ? "on" : "", on: { click: function () { if (selTerm !== t.id && confirmLeave()) { dirty = false; selTerm = t.id; draw(); editTerm(right, t); } } } },
          el("span", { cls: "n", text: t.slot ? "珠" + t.slot : "—" }), el("span", { cls: t.archived ? "arch" : "", text: t.name }), el("span", { cls: "muted small", text: catName(t.primary_category) + ((t.show || []).length > 1 ? "・跨類" : "") })));
      });
      list.appendChild(el("p", { cls: "muted small", text: "共 " + rows.length + " 項" }));
    }
    q.addEventListener("input", function () { filt.q = q.value; draw(); });
    cat.addEventListener("change", function () { filt.cat = cat.value; draw(); });
    arch.addEventListener("change", function () { filt.arch = arch.checked; draw(); });
    draw();
    var cur = S.terms.find(function (t) { return t.id === selTerm; });
    if (cur) editTerm(right, cur); else right.appendChild(el("p", { cls: "muted", text: "← 從左側選一個名相編輯。" }));
  }
  function newTerm() {
    var name = prompt("新名相名稱："); if (!name || !name.trim()) return;
    var cat = prompt("主分類（輸入：見、修、行、果）："); var c = S.categories.find(function (x) { return x.name === (cat || "").trim(); });
    if (!c) { notice("請輸入見、修、行、果其中之一。", "err"); return; }
    rpc("create_term", { p_name: name.trim(), p_category: c.id }).then(function (r) { selTerm = r.id; notice("已新增名相（草稿），請設定珠位與內容後儲存。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
  }
  function sectionsOf(chId) { return S.sections.filter(function (s) { return s.chapter_id === chId; }).sort(function (a, b) { return a.sort - b.sort; }); }
  function secLabel(s) { var ch = S.chapters.find(function (c) { return c.id === s.chapter_id; }); return (ch ? "第" + ch.no + "章 " : "") + (s.parent_id ? "　目 " : "節 ") + s.no + " " + s.title + (s.page ? "（" + s.page + "頁）" : ""); }
  function editTerm(box, t) {
    clear(box); setDirty(false);
    var f = { name: el("input", { value: t.name }), cat: el("select", {}, S.categories.map(function (c) { return el("option", { value: c.id, text: c.name, selected: c.id === t.primary_category }); })) };
    var showBox = el("div", { cls: "checks" }), slotSel = el("select");
    function drawShow() {
      var cur = (t._show || t.show || []).slice();
      clear(showBox);
      S.categories.forEach(function (c) {
        var cb = el("input", { type: "checkbox", value: c.id, checked: cur.indexOf(c.id) >= 0 || c.id === f.cat.value, disabled: c.id === f.cat.value });
        showBox.appendChild(el("label", {}, cb, c.name + (c.id === f.cat.value ? "（主分類）" : "")));
      });
    }
    function drawSlots() {
      clear(slotSel); slotSel.appendChild(el("option", { value: "", text: "（未配置珠位）" }));
      S.beads.filter(function (b) { return b.kind === "bead" && b.category_id === f.cat.value; }).forEach(function (b) {
        var other = b.term_id && b.term_id !== t.id ? S.terms.find(function (x) { return x.id === b.term_id; }) : null;
        slotSel.appendChild(el("option", { value: b.n, selected: b.term_id === t.id, disabled: !!other, text: "第 " + b.n + " 顆" + (other ? "（已配置：" + other.name + "）" : b.term_id === t.id ? "（目前）" : "（空）") }));
      });
    }
    f.cat.addEventListener("change", function () { drawShow(); drawSlots(); setDirty(true); });
    drawShow(); drawSlots();
    var notes = el("textarea", {}), body = el("textarea", { style: "min-height:140px" }), expl = el("textarea", {}), img = el("input", { value: t.image || "", placeholder: "https://… 或 assets/…" }), cap = el("input", { value: t.image_caption || "" });
    notes.value = (t.notes || []).join("\n"); body.value = t.body || ""; expl.value = t.explanation || "";
    var refs = (t.refs || []).map(function (r) { return { kind: r.kind, label: r.label, chapter_id: r.chapter_id || "", section_id: r.section_id || "" }; });
    var refBox = el("div", { cls: "refs" });
    function drawRefs() {
      clear(refBox);
      refs.forEach(function (r, i) {
        var kind = el("select", {}, KINDS.map(function (k) { return el("option", { value: k, text: k, selected: r.kind === k }); }));
        var ch = el("select", {}, el("option", { value: "", text: "（章）" }), S.chapters.map(function (c) { return el("option", { value: c.id, selected: c.id === r.chapter_id, text: "第" + c.no + "章 " + c.title }); }));
        var sec = el("select", {}, el("option", { value: "", text: "（節／目，可不選）" }));
        function fillSec() { clear(sec); sec.appendChild(el("option", { value: "", text: "（節／目，可不選）" })); sectionsOf(ch.value).forEach(function (s) { sec.appendChild(el("option", { value: s.id, selected: s.id === r.section_id, text: (s.parent_id ? "　└ 目 " : "節 ") + s.no + " " + s.title })); }); }
        fillSec();
        var lab = el("textarea", { placeholder: "顯示文字（例：第六章 如來藏見｜第一節 …（二一二頁））" }); lab.value = r.label;
        kind.addEventListener("change", function () { r.kind = kind.value; setDirty(true); });
        ch.addEventListener("change", function () { r.chapter_id = ch.value; r.section_id = ""; fillSec(); setDirty(true); });
        sec.addEventListener("change", function () { r.section_id = sec.value; if (!lab.value.trim() && sec.value) { lab.value = secLabel(S.sections.find(function (x) { return x.id === sec.value; })); r.label = lab.value; } setDirty(true); });
        lab.addEventListener("input", function () { r.label = lab.value; setDirty(true); });
        refBox.appendChild(el("div", { cls: "ref" }, kind, el("div", {}, ch, sec), lab, el("div", { cls: "btns" },
          el("button", { title: "上移", text: "↑", disabled: i === 0, on: { click: function () { refs.splice(i - 1, 0, refs.splice(i, 1)[0]); setDirty(true); drawRefs(); } } }),
          el("button", { title: "下移", text: "↓", disabled: i === refs.length - 1, on: { click: function () { refs.splice(i + 1, 0, refs.splice(i, 1)[0]); setDirty(true); drawRefs(); } } }),
          el("button", { title: "刪除", cls: "danger", text: "✕", on: { click: function () { refs.splice(i, 1); setDirty(true); drawRefs(); } } }))));
      });
      refBox.appendChild(el("button", { text: "＋ 新增章節對應", on: { click: function () { refs.push({ kind: "直接", label: "", chapter_id: "", section_id: "" }); setDirty(true); drawRefs(); } } }));
    }
    drawRefs();
    [f.name, notes, body, expl, img, cap].forEach(function (x) { x.addEventListener("input", function () { setDirty(true); }); });
    showBox.addEventListener("change", function () { setDirty(true); }); slotSel.addEventListener("change", function () { setDirty(true); });
    var conflictBox = el("div");
    function payload() {
      var show = [f.cat.value]; showBox.querySelectorAll("input:checked").forEach(function (cb) { if (show.indexOf(cb.value) < 0) show.push(cb.value); });
      return { id: t.id, name: f.name.value.trim(), primary_category: f.cat.value, show: show, slot: slotSel.value ? +slotSel.value : null,
        notes: notes.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean), body: body.value, explanation: expl.value, image: img.value.trim(), image_caption: cap.value,
        refs: refs.filter(function (r) { return r.label.trim() || r.chapter_id; }) };
    }
    function save(version) {
      var p = payload(); if (!p.name) { notice("名稱不可空白。", "err"); return; }
      clear(conflictBox);
      rpc("save_term", { p: p, p_expected_version: version }).then(function () { setDirty(false); notice("已儲存草稿（尚未發布）。", "ok"); return reload(); }).catch(function (e) {
        if (isConflict(e)) {
          conflictBox.appendChild(el("div", { cls: "conflict" },
            el("strong", { text: "版本衝突：" }), "此名相在你編輯期間已被其他人儲存。你的修改仍保留在表單中，尚未寫入。",
            el("div", { cls: "row", style: "margin-top:8px" },
              el("button", { text: "查看對方的最新版本（捨棄我的修改）", on: { click: function () { setDirty(false); reload(); } } }),
              el("button", { cls: "danger", text: "仍以我的修改覆蓋", on: { click: function () {
                rpc("admin_load").then(function (d) { var nt = d.terms.find(function (x) { return x.id === t.id; }); if (nt && confirm("對方的版本是：「" + nt.name + "」（版本 " + nt.version + "）。確定以你的修改覆蓋？")) save(nt.version); });
              } } }))));
        } else notice(errText(e), "err");
      });
    }
    box.appendChild(el("div", {},
      el("div", { cls: "row" }, el("h2", { style: "margin:0", text: t.name }), el("span", { cls: "fix muted small", text: "ID " + t.id + "・版本 " + t.version + (t.archived ? "・已封存" : "") })),
      el("div", { cls: "grid2" }, el("div", {}, el("label", { text: "名稱" }), f.name), el("div", {}, el("label", { text: "主分類（實際珠位所在區）" }), f.cat)),
      el("label", { text: "可顯示分類（跨分類查詢；不增加珠位）" }), showBox,
      el("label", { text: "實際珠位（只能選主分類那一區的普通數珠；一顆珠只放一個名相）" }), slotSel,
      el("label", { text: "子名相・校訂註（每行一條）" }), notes,
      el("label", { text: "原書正文" }), body,
      el("label", { text: "整理說明（與原文分開）" }), expl,
      el("div", { cls: "grid2" }, el("div", {}, el("label", { text: "圖片網址" }), img), el("div", {}, el("label", { text: "圖片說明／來源" }), cap)),
      el("label", { text: "章節對應（〔直接〕〔關聯〕〔僅章題〕）" }), refBox,
      conflictBox,
      el("div", { cls: "actions" },
        el("button", { cls: "primary", text: "儲存草稿", on: { click: function () { save(t.version); } } }),
        el("button", { text: "放棄修改", on: { click: function () { setDirty(false); editTerm(box, t); } } }),
        el("button", { text: t.archived ? "取消封存" : "封存（釋放珠位）", on: { click: function () {
          if (!confirm(t.archived ? "取消封存？（不會自動回到原珠位）" : "封存此名相？公開網站發布後將不再顯示，珠位會釋放，資料保留可還原。")) return;
          rpc("archive_term", { p_id: t.id, p_expected_version: t.version, p_archived: !t.archived }).then(function () { setDirty(false); notice("已更新（草稿）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
        } } }),
        isOwner() && el("button", { cls: "danger", text: "永久刪除", on: { click: function () {
          if (prompt("永久刪除「" + t.name + "」及其章節對應，無法復原（可由歷史版本還原）。請輸入名稱確認：") !== t.name) return;
          rpc("delete_term", { p_id: t.id }).then(function () { setDirty(false); selTerm = null; notice("已刪除（草稿）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
        } } }))));
  }

  /* ---------- 108 珠位 ---------- */
  function viewBeads(body) {
    body.appendChild(el("p", { cls: "muted small", text: "108 顆固定，不可增刪。每區隔珠在前、名相珠在後。點已配置的珠可編輯名相；點空珠可把同區的名相移過來。" }));
    var order = [108].concat(Array.from({ length: 107 }, function (_, i) { return i + 1; }));
    S.categories.forEach(function (c) {
      var grid = el("div", { cls: "beads" });
      order.filter(function (n) { var b = S.beads[n - 1]; return b.category_id === c.id; }).forEach(function (n) {
        var b = S.beads[n - 1], t = b.term_id && S.terms.find(function (x) { return x.id === b.term_id; });
        var cell = el("button", { cls: "bead" + (b.kind === "spacer" ? " spacer" : t ? "" : " empty") }, el("small", { text: "第 " + n + " 顆" + (b.kind === "spacer" ? "・隔珠" : "") }), el("span", { text: b.kind === "spacer" ? c.spacer_name + "・" + c.spacer_title : t ? t.name : "（空）" }));
        if (b.kind !== "spacer") cell.addEventListener("click", function () {
          if (t) { selTerm = t.id; tab = "terms"; render(); return; }
          var cands = S.terms.filter(function (x) { return x.primary_category === c.id && !x.archived; });
          var names = cands.map(function (x, i) { return (i + 1) + ". " + x.name + (x.slot ? "（目前在第 " + x.slot + " 顆）" : "（未配置）"); }).join("\n");
          var k = prompt("把哪個名相放到第 " + n + " 顆？輸入編號：\n" + names); if (!k) return;
          var pick = cands[+k - 1]; if (!pick) return;
          rpc("save_term", { p: { id: pick.id, name: pick.name, primary_category: pick.primary_category, show: pick.show, slot: n, notes: pick.notes, body: pick.body, explanation: pick.explanation, image: pick.image, image_caption: pick.image_caption, refs: pick.refs }, p_expected_version: pick.version })
            .then(function () { notice("已將「" + pick.name + "」移到第 " + n + " 顆（草稿）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
        });
        grid.appendChild(cell);
      });
      body.appendChild(el("div", { cls: "zone card" }, el("h3", { text: c.name + " 區・" + c.spacer_name }), grid));
    });
  }

  /* ---------- 章節 ---------- */
  function viewChapters(body) {
    var left = el("div", { cls: "card" }), right = el("div", { cls: "card" });
    body.appendChild(el("div", { cls: "cols" }, left, right));
    var list = el("div", { cls: "list" });
    S.chapters.forEach(function (c) { list.appendChild(el("button", { cls: selChapter === c.id ? "on" : "", on: { click: function () { if (confirmLeave()) { dirty = false; selChapter = c.id; render(); } } } }, el("span", { cls: "n", text: c.no }), el("span", { text: c.title }))); });
    left.appendChild(list);
    var c = S.chapters.find(function (x) { return x.id === selChapter; });
    if (!c) { right.appendChild(el("p", { cls: "muted", text: "← 選一章編輯章名、內文與節目。" })); return; }
    var title = el("input", { value: c.title }), cb = el("textarea", {}), ce = el("textarea", {});
    cb.value = c.body || ""; ce.value = c.explanation || "";
    [title, cb, ce].forEach(function (x) { x.addEventListener("input", function () { setDirty(true); }); });
    right.appendChild(el("div", {}, el("h2", { style: "margin:0", text: "第" + c.no + "章" }), el("p", { cls: "muted small", text: "版本 " + c.version + "・輯別 " + (c.vols || []).join("、") }),
      el("label", { text: "章名" }), title, el("label", { text: "本章原書正文" }), cb, el("label", { text: "本章整理說明" }), ce,
      el("div", { cls: "actions" }, el("button", { cls: "primary", text: "儲存章（草稿）", on: { click: function () {
        rpc("save_chapter", { p: { id: c.id, title: title.value, body: cb.value, explanation: ce.value, image: c.image, image_caption: c.image_caption }, p_expected_version: c.version })
          .then(function () { setDirty(false); notice("已儲存（草稿）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
      } } }))));
    var tb = el("tbody");
    sectionsOf(c.id).forEach(function (s) {
      var no = el("input", { value: s.no }), ti = el("input", { value: s.title }), pg = el("input", { value: s.page }), vol = el("input", { value: s.vol == null ? "" : s.vol, type: "number", min: 1, max: 4 });
      var sbody = el("textarea", {}), sexp = el("textarea", {}); sbody.value = s.body || ""; sexp.value = s.explanation || "";
      var more = el("tr", { hidden: true }, el("td", { colspan: 5 }, el("label", { text: "原書正文" }), sbody, el("label", { text: "整理說明" }), sexp));
      [no, ti, pg, vol, sbody, sexp].forEach(function (x) { x.addEventListener("input", function () { setDirty(true); }); });
      tb.appendChild(el("tr", {}, el("td", { style: "width:70px" }, (s.parent_id ? "└ 目 " : ""), no), el("td", {}, ti), el("td", { style: "width:110px" }, pg), el("td", { style: "width:70px" }, vol),
        el("td", { style: "white-space:nowrap" },
          el("button", { text: "內文", on: { click: function () { more.hidden = !more.hidden; } } }),
          el("button", { cls: "primary", text: "儲存", on: { click: function () {
            rpc("save_section", { p: { id: s.id, no: no.value, title: ti.value, page: pg.value, vol: vol.value, body: sbody.value, explanation: sexp.value, image: s.image, image_caption: s.image_caption }, p_expected_version: s.version })
              .then(function () { setDirty(false); notice("已儲存（草稿）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
          } } }),
          isOwner() && el("button", { cls: "danger", text: "刪除", on: { click: function () {
            if (!confirm("刪除「" + s.title + "」？名相對應到此節的連結會改為只連到章。")) return;
            rpc("delete_section", { p_id: s.id }).then(function () { notice("已刪除（草稿）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
          } } }))));
      tb.appendChild(more);
    });
    right.appendChild(el("h3", { text: "節與目" }));
    right.appendChild(el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "編號" }), el("th", { text: "標題" }), el("th", { text: "頁碼" }), el("th", { text: "輯" }), el("th"))), tb));
    right.appendChild(el("button", { style: "margin-top:8px", text: "＋ 新增節", on: { click: function () {
      var ti = prompt("新節標題："); if (!ti) return;
      var id = c.id.replace(/^c0?/, "") + "-n" + Date.now().toString(36);
      rpc("save_section", { p: { id: id, chapter_id: c.id, no: String(sectionsOf(c.id).filter(function (s) { return !s.parent_id; }).length + 1), title: ti, page: "", vol: (c.vols || [])[0] || "" }, p_expected_version: 0 })
        .then(function () { notice("已新增節（草稿）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
    } } }));
  }

  /* ---------- 分類與網站設定 ---------- */
  function viewSettings(body) {
    var ro = !isOwner();
    if (ro) body.appendChild(el("p", { cls: "notice", text: "只有 Owner 可以修改分類與網站設定；Editor 僅能檢視。" }));
    var site = S.settings.site || { value: {}, version: 1 }, quote = S.settings.quote, parts = S.settings.parts;
    var st = el("input", { value: site.value.title || "", disabled: ro }), ss = el("input", { value: site.value.subtitle || "", disabled: ro });
    body.appendChild(el("div", { cls: "card zone" }, el("h3", { text: "網站標題" }), el("div", { cls: "grid2" }, el("div", {}, el("label", { text: "主標題" }), st), el("div", {}, el("label", { text: "副標題" }), ss)),
      !ro && el("div", { cls: "actions" }, el("button", { cls: "primary", text: "儲存", on: { click: function () { saveSetting("site", { title: st.value.trim(), subtitle: ss.value.trim() }, site.version); } } }))));
    var qt = el("textarea", { disabled: ro, style: "min-height:120px" }); qt.value = quote.value;
    body.appendChild(el("div", { cls: "card zone" }, el("h3", { text: "導師引文（必須逐字保留）" }), qt,
      el("p", { cls: "muted small", text: "儲存時若與原始引文不同，系統會要求再次確認。" }),
      !ro && el("div", { cls: "actions" }, el("button", { cls: "primary", text: "儲存", on: { click: function () {
        if (qt.value !== ORIGINAL_QUOTE && !confirm("引文與原始全文不同（可能改字、刪字或漏署名）。確定要儲存嗎？")) return;
        saveSetting("quote", qt.value, quote.version);
      } } }))));
    var pv = JSON.parse(JSON.stringify(parts.value)), pb = el("div");
    Object.keys(pv).forEach(function (k) {
      var ti = el("input", { value: pv[k].title, disabled: ro }), co = el("input", { value: pv[k].count || "", disabled: ro }), tx = el("textarea", { disabled: ro, style: "min-height:50px" }); tx.value = pv[k].text;
      ti.addEventListener("input", function () { pv[k].title = ti.value; }); co.addEventListener("input", function () { pv[k].count = co.value; }); tx.addEventListener("input", function () { pv[k].text = tx.value; });
      pb.appendChild(el("div", { cls: "grid2" }, el("div", {}, el("label", { text: "部件名稱" }), ti, el("label", { text: "數量說明" }), co), el("div", {}, el("label", { text: "引文對應文字" }), tx)));
    });
    body.appendChild(el("div", { cls: "card zone" }, el("h3", { text: "念珠部件譬喻" }), pb, !ro && el("div", { cls: "actions" }, el("button", { cls: "primary", text: "儲存", on: { click: function () { saveSetting("parts", pv, parts.version); } } }))));
    S.categories.forEach(function (c) {
      var nm = el("input", { value: c.name, disabled: ro }), stt = el("input", { value: c.spacer_title, disabled: ro }), su = el("textarea", { disabled: ro, style: "min-height:50px" }), co = el("textarea", { disabled: ro, style: "min-height:50px" });
      su.value = c.summary; co.value = c.core;
      body.appendChild(el("div", { cls: "card zone" }, el("h3", { text: c.spacer_name + "・" + c.name + " 區" }),
        el("div", { cls: "grid2" }, el("div", {}, el("label", { text: "分類名稱" }), nm), el("div", {}, el("label", { text: "隔珠標題" }), stt)),
        el("label", { text: "分類說明" }), su, el("label", { text: "核心" }), co,
        !ro && el("div", { cls: "actions" }, el("button", { cls: "primary", text: "儲存", on: { click: function () {
          rpc("save_category", { p: { id: c.id, name: nm.value, spacer_title: stt.value, summary: su.value, core: co.value }, p_expected_version: c.version })
            .then(function () { notice("已儲存（草稿）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
        } } }))));
    });
  }
  function saveSetting(key, value, version) {
    rpc("save_setting", { p_key: key, p_value: value, p_expected_version: version }).then(function () { notice("已儲存（草稿）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
  }

  /* ---------- 發布與版本 ---------- */
  function viewPublish(body) {
    var note = el("input", { placeholder: "這次發布的說明（例：修改如來藏內文）" });
    body.appendChild(el("div", { cls: "card zone" }, el("h3", { text: "發布" }),
      el("p", { cls: "small", text: "編輯的內容先存為草稿，訪客看不到；按「發布」後，公開網站才會改為最新內容。" }),
      el("div", { cls: "row" }, el("a", { href: "../?preview=1", target: "_blank", cls: "fix", text: "在新分頁預覽草稿 ↗" })),
      isOwner() ? el("div", { cls: "row", style: "margin-top:10px" }, note, el("button", { cls: "fix primary", text: "正式發布", disabled: !!(S.problems && S.problems.length), on: { click: function () {
        if (!confirm("確定發布？公開網站將顯示目前草稿的內容。")) return;
        rpc("publish", { p_note: note.value }).then(function (r) { notice("已發布（版本 #" + r.id + "）。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
      } } })) : el("p", { cls: "muted small", text: "只有 Owner 可以正式發布。" })));
    var tbl = el("tbody"), diffBox = el("div");
    body.appendChild(el("div", { cls: "card zone" }, el("h3", { text: "歷史版本" }), el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "#" }), el("th", { text: "類型" }), el("th", { text: "時間" }), el("th", { text: "人員" }), el("th", { text: "說明" }), el("th"))), tbl), diffBox));
    rpc("list_revisions", { p_limit: 100 }).then(function (revs) {
      revs.forEach(function (r) {
        tbl.appendChild(el("tr", {}, el("td", { text: "#" + r.id }), el("td", { text: r.kind === "publish" ? "正式發布" : "自動備份" }), el("td", { text: new Date(r.at).toLocaleString() }), el("td", { text: r.by || "（系統）" }), el("td", { text: r.note }),
          el("td", { style: "white-space:nowrap" },
            el("button", { text: "與目前草稿比較", on: { click: function () { showDiff(diffBox, r.id); } } }),
            isOwner() && el("button", { cls: "danger", text: "還原到草稿", on: { click: function () {
              if (!confirm("把草稿還原成版本 #" + r.id + "？目前的草稿會先自動備份。還原後需再按「正式發布」才會公開。")) return;
              rpc("restore_revision", { p_id: r.id }).then(function (x) { notice("已還原到草稿（目前草稿已備份為 #" + x.backup + "）。請預覽後再發布。", "ok"); return reload(); }).catch(function (e) { notice(errText(e), "err"); });
            } } }))));
      });
    }).catch(function (e) { notice(errText(e), "err"); });
  }
  function showDiff(box, id) {
    clear(box).appendChild(el("p", { cls: "muted", text: "比較中…" }));
    Promise.all([rpc("get_revision", { p_id: id }), rpc("preview_content")]).then(function (x) {
      var a = x[0], b = x[1], items = [];
      var ta = {}, tb = {}; (a.terms || []).forEach(function (t) { ta[t.id] = t; }); (b.terms || []).forEach(function (t) { tb[t.id] = t; });
      Object.keys(tb).forEach(function (id2) {
        var o = ta[id2], n = tb[id2];
        if (!o) { items.push(["add", "新增名相「" + n.name + "」（珠 " + (n.slot || "—") + "）"]); return; }
        var ch = [];
        if (o.name !== n.name) ch.push("名稱：「" + o.name + "」→「" + n.name + "」");
        if (o.slot !== n.slot) ch.push("珠位：" + (o.slot || "—") + " → " + (n.slot || "—"));
        if (o.group !== n.group) ch.push("主分類：" + o.group + " → " + n.group);
        if (JSON.stringify(o.show) !== JSON.stringify(n.show)) ch.push("顯示分類：" + (o.show || []).join("、") + " → " + (n.show || []).join("、"));
        if (JSON.stringify(o.refs) !== JSON.stringify(n.refs)) ch.push("章節對應：" + (o.refs || []).length + " → " + (n.refs || []).length + " 筆（內容有變）");
        if (JSON.stringify(o.notes) !== JSON.stringify(n.notes)) ch.push("校訂註有變");
        if (o.body !== n.body) ch.push("原書正文有變（" + (o.body || "").length + " → " + (n.body || "").length + " 字）");
        if (o.explanation !== n.explanation) ch.push("整理說明有變");
        if (ch.length) items.push(["chg", "「" + n.name + "」：" + ch.join("；")]);
      });
      Object.keys(ta).forEach(function (id2) { if (!tb[id2]) items.push(["del", "移除名相「" + ta[id2].name + "」"]); });
      var ca = {}; (a.chapters || []).forEach(function (c) { ca[c.id] = c; });
      (b.chapters || []).forEach(function (c) {
        var o = ca[c.id]; if (!o) { items.push(["add", "新增章：" + c.title]); return; }
        if (o.title !== c.title) items.push(["chg", "第" + c.no + "章章名：「" + o.title + "」→「" + c.title + "」"]);
        if (o.body !== c.body || o.explanation !== c.explanation) items.push(["chg", "第" + c.no + "章內文有變"]);
        if (JSON.stringify(o.sections) !== JSON.stringify(c.sections)) items.push(["chg", "第" + c.no + "章的節／目有變"]);
      });
      if (a.quote !== b.quote) items.push(["chg", "導師引文有變"]);
      if (JSON.stringify(a.parts) !== JSON.stringify(b.parts)) items.push(["chg", "念珠部件譬喻有變"]);
      if (JSON.stringify(a.zones) !== JSON.stringify(b.zones)) items.push(["chg", "分類說明有變"]);
      if (JSON.stringify(a.site) !== JSON.stringify(b.site)) items.push(["chg", "網站標題有變"]);
      clear(box).appendChild(el("h4", { text: "版本 #" + id + " → 目前草稿：" + (items.length ? items.length + " 項差異" : "沒有差異") }));
      box.appendChild(el("ul", { cls: "diff" }, items.map(function (it) { return el("li", { cls: it[0], text: { add: "＋ ", del: "－ ", chg: "～ " }[it[0]] + it[1] }); })));
    }).catch(function (e) { clear(box); notice(errText(e), "err"); });
  }

  /* ---------- 成員 ---------- */
  function viewMembers(body) {
    var em = el("input", { type: "email", placeholder: "對方登入用的 Email（Google 帳號或收信信箱）" }), ro = el("select", {}, el("option", { value: "editor", text: "Editor 編輯者" }), el("option", { value: "owner", text: "Owner 擁有者" }));
    body.appendChild(el("div", { cls: "card zone" }, el("h3", { text: "授權成員" }),
      el("p", { cls: "small muted", text: "填入對方的 Email 並授權；對方用同一個 Email 登入後即可編輯。系統不會自動寄出邀請信，請自行通知對方後台網址。" }),
      el("div", { cls: "row" }, em, el("span", { cls: "fix" }, ro), el("button", { cls: "fix primary", text: "授權", on: { click: function () {
        if (!em.value.trim()) return;
        rpc("set_member_role", { p_email: em.value.trim(), p_role: ro.value }).then(function () { notice("已授權。", "ok"); render(); }).catch(function (e) { notice(errText(e), "err"); });
      } } }))));
    var tb = el("tbody");
    body.appendChild(el("div", { cls: "card zone" }, el("h3", { text: "成員與邀請" }), el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "Email" }), el("th", { text: "角色" }), el("th", { text: "狀態" }), el("th"))), tb)));
    rpc("list_members").then(function (m) {
      var rows = {}; m.invites.forEach(function (i) { rows[i.email] = { email: i.email, role: i.role, state: "已授權，尚未登入" }; });
      m.profiles.forEach(function (p) { rows[p.email] = { email: p.email, role: p.role, state: "已登入過" }; });
      Object.keys(rows).sort().forEach(function (k) {
        var r = rows[k];
        tb.appendChild(el("tr", {}, el("td", { text: r.email }), el("td", { text: { owner: "Owner", editor: "Editor", none: "未授權" }[r.role] }), el("td", { cls: "muted", text: r.state }),
          el("td", {}, r.role !== "none" && r.email !== S.me.email && el("button", { cls: "danger", text: "撤銷", on: { click: function () {
            if (!confirm("撤銷 " + r.email + " 的權限？")) return;
            rpc("set_member_role", { p_email: r.email, p_role: "none" }).then(function () { notice("已撤銷。", "ok"); render(); }).catch(function (e) { notice(errText(e), "err"); });
          } } }), r.role === "none" && el("button", { text: "授權為 Editor", on: { click: function () { rpc("set_member_role", { p_email: r.email, p_role: "editor" }).then(function () { render(); }).catch(function (e) { notice(errText(e), "err"); }); } } }))));
      });
    }).catch(function (e) { notice(errText(e), "err"); });
  }

  /* ---------- 操作紀錄 ---------- */
  function viewAudit(body) {
    var sel = el("select", {}, [["", "全部"], ["terms", "名相"], ["bead_positions", "珠位"], ["term_chapters", "章節對應"], ["chapters", "章"], ["sections", "節目"], ["site_settings", "網站設定"], ["categories", "分類"], ["content_revisions", "發布／還原"], ["member_invites", "權限"]].map(function (o) { return el("option", { value: o[0], text: o[1] }); }));
    var tb = el("tbody");
    body.appendChild(el("div", { cls: "card" }, el("div", { cls: "row" }, el("span", { cls: "fix", text: "類別" }), sel), el("table", { style: "margin-top:8px" }, el("thead", {}, el("tr", {}, el("th", { text: "時間" }), el("th", { text: "人員" }), el("th", { text: "對象" }), el("th", { text: "動作" }), el("th", { text: "變更" }))), tb)));
    function load() {
      clear(tb);
      rpc("list_audit", { p_limit: 300, p_table: sel.value || null }).then(function (rows) {
        rows.forEach(function (a) {
          var ch = [];
          if (a.old_row && a.new_row) Object.keys(a.new_row).forEach(function (k) { if (["version", "updated_at", "updated_by"].indexOf(k) < 0 && JSON.stringify(a.old_row[k]) !== JSON.stringify(a.new_row[k])) ch.push(k); });
          tb.appendChild(el("tr", {}, el("td", { text: new Date(a.at).toLocaleString() }), el("td", { text: a.user_email || "（系統）" }), el("td", { text: a.table_name + " " + (a.row_key || "") }), el("td", { text: a.action }), el("td", { cls: "small", text: ch.join("、") })));
        });
      }).catch(function (e) { notice(errText(e), "err"); });
    }
    sel.addEventListener("change", load); load();
  }
})();
