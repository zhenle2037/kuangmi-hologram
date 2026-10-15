/* 內容載入：已設定 Supabase 時讀取「最新正式發布版本」；?preview=1 且以 Owner／Editor 登入時讀取草稿預覽；
 * 讀不到（未設定、離線、逾時）時改用 data/content.js。內容就緒後才載入 3D 與介面程式。 */
(function () {
  "use strict";
  var C = window.KM_CONFIG || {}, preview = /[?&]preview=1\b/.test(location.search);
  function load(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s); }); }
  function start(source) {
    window.KM_SOURCE = source;
    load("scene.js").then(function () { return load("app.js"); });
  }
  function fallback() { load("data/content.js").then(function () { start("local"); }); }
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]); }
  function banner(text) {
    var b = document.createElement("div"); b.className = "km-banner"; b.textContent = text;
    b.style.cssText = "position:fixed;z-index:200;left:50%;top:8px;transform:translateX(-50%);background:#9b2226;color:#fff;padding:6px 16px;border-radius:6px;font-size:14px;letter-spacing:.1em;box-shadow:0 2px 10px rgba(0,0,0,.2)";
    document.body.appendChild(b);
  }
  function published() {
    // 舊式 anon key 是 JWT，需同時放在 Authorization；新式 publishable key（sb_publishable_…）只放 apikey
    var h = { apikey: C.supabaseAnonKey }; if (/^eyJ/.test(C.supabaseAnonKey)) h.Authorization = "Bearer " + C.supabaseAnonKey;
    var url = C.supabaseUrl.replace(/\/$/, "") + "/rest/v1/content_revisions?select=id,content,created_at&kind=eq.publish&order=id.desc&limit=1";
    return withTimeout(fetch(url, { headers: h }), 6000)
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length || !rows[0].content || !rows[0].content.terms) throw new Error("no published content");
        window.KM_DATA = rows[0].content; window.KM_VERSION = { id: rows[0].id, at: rows[0].created_at };
        start("published");
      });
  }
  if (!C.supabaseUrl || !C.supabaseAnonKey) { fallback(); return; }
  if (preview) {
    load(C.supabaseJs).then(function () {
      var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
      return sb.rpc("preview_content");
    }).then(function (r) {
      if (r.error || !r.data) throw r.error || new Error("no data");
      window.KM_DATA = r.data; window.KM_PREVIEW = true; banner("草稿預覽（尚未發布，訪客看不到）"); start("preview");
    }).catch(function () { banner("無法預覽草稿：請先在管理後台以 Owner／Editor 登入。以下顯示正式版本"); published().catch(fallback); });
    return;
  }
  published().catch(fallback);
})();
