// 管理後台端對端測試：瀏覽器執行真正的 admin/ 與網站 loader，
// 但 Supabase 換成測試替身——RPC 與 REST 請求轉到 PGlite（執行同一份 supabase/migrations），
// 並以 PostgREST 的方式設定 role 與 JWT sub，因此權限判斷完全由資料庫 RLS／函式負責。
// 未涵蓋：真正的 Supabase 伺服器、Google OAuth／Email 寄信流程（替身直接給登入身分）。
// 用法：PGLITE=<pglite 路徑> NODE_PATH=$(npm root -g) node tools/db/test_admin.cjs <網站根網址，例 http://localhost:8765/>
const fs = require('fs'), path = require('path');
const { PGlite } = require(process.env.PGLITE || '@electric-sql/pglite');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', '..');
const BASE = process.argv[2] || 'http://localhost:8765/';
const SB = 'https://fake-project.supabase.co';
const out = []; const ok = (n, c, x = '') => { out.push((c ? 'PASS ' : 'FAIL ') + n + (x !== '' ? '  ' + x : '')); };

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

// 瀏覽器端的 supabase-js 替身（只實作後台與 loader 用到的部分）
const FAKE_SB = `
window.supabase = { createClient: function () {
  var listeners = [];
  function user() { try { return localStorage.getItem('fake_sb_user'); } catch (e) { return null; } }
  return {
    auth: {
      getSession: function () { var u = user(); return Promise.resolve({ data: { session: u ? { user: { email: u } } : null } }); },
      onAuthStateChange: function (f) { listeners.push(f); return { data: { subscription: { unsubscribe: function () {} } } }; },
      signOut: function () { localStorage.removeItem('fake_sb_user'); listeners.forEach(function (f) { f('SIGNED_OUT', null); }); return Promise.resolve({ error: null }); },
      signInWithOAuth: function (o) { window.__oauth = o; return Promise.resolve({ data: {}, error: null }); },
      signInWithOtp: function (o) { window.__otp = o; return Promise.resolve({ data: {}, error: null }); }
    },
    rpc: function (name, args) { return window.__pgRpc(user() || '', name, args || {}); },
    storage: { from: function (bucket) { return {
      upload: function (path, file, opts) { (window.__uploads = window.__uploads || []).push({ bucket: bucket, path: path, type: opts && opts.contentType, size: file.size }); return Promise.resolve({ data: { path: path }, error: null }); },
      getPublicUrl: function (path) { return { data: { publicUrl: "https://fake-project.supabase.co/storage/v1/object/public/" + bucket + "/" + path } }; } }; } }
  };
} };`;

(async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const m of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', m), 'utf8'));
  await db.query(`select public.bootstrap_owner('owner@example.com')`);
  const ids = {}; let nid = 1;
  async function signIn(email) { // 模擬 Supabase Auth 首次登入：在 auth.users 建立帳號（觸發 handle_new_user）
    if (!ids[email]) { ids[email] = '00000000-0000-0000-0000-' + String(nid++).padStart(12, '0'); await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ids[email], email]); }
  }
  const sig = {};
  for (const r of (await db.query(`select p.proname, p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) t) types from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows) sig[r.proname] = r;
  async function as(email, sql, params) {
    return db.transaction(async tx => {
      await tx.query(`select set_config('role', $1, true)`, [email ? 'authenticated' : 'anon']);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [email ? ids[email] : '']);
      return (await tx.query(sql, params)).rows;
    });
  }
  async function rpc(email, name, args) { // 與 PostgREST 相同：具名參數呼叫；錯誤回傳 {message, code}
    try {
      const s = sig[name]; if (!s) return { data: null, error: { message: 'function not found', code: 'PGRST202' } };
      const names = Object.keys(args), parts = [], params = [];
      names.forEach(k => { const i = (s.proargnames || []).indexOf(k); if (i < 0) throw Object.assign(new Error('unknown arg ' + k), { code: 'PGRST202' }); const ty = s.types[i]; params.push(args[k] == null ? null : /json/.test(ty) ? JSON.stringify(args[k]) : args[k]); parts.push(`${k} => $${params.length}::${ty}`); });
      const rows = await as(email, `select public.${name}(${parts.join(', ')}) as r`, params);
      return { data: rows[0].r, error: null };
    } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
  }
  const latestPublished = () => as('', `select id, content, created_at from public.content_revisions where kind = 'publish' order by id desc limit 1`, []);

  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  await ctx.exposeFunction('__pgRpc', (email, name, args) => rpc(email, name, args));
  await ctx.route('**/assets/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.KM_CONFIG = { supabaseUrl: "${SB}", supabaseAnonKey: "anon-public-test", supabaseJs: "${SB}/fake-supabase.js" };` }));
  await ctx.route(SB + '/fake-supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE_SB }));
  let restHits = 0;
  await ctx.route(SB + '/rest/v1/**', async r => { // 公開網站：以 anon 身分讀最新正式版本（同 PostgREST）
    restHits++;
    const u = new URL(r.request().url());
    if (r.request().headers().apikey !== 'anon-public-test' || !/content_revisions/.test(u.pathname)) return r.fulfill({ status: 401, body: '{}' });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(await latestPublished()) });
  });
  ctx.on('page', p => { p.on('pageerror', e => errs.push(String(e))); });
  const dialogs = []; let answers = [];
  ctx.on('page', p => p.on('dialog', d => { dialogs.push(d.message()); const a = answers.length ? answers.shift() : true; if (a === false) d.dismiss(); else d.accept(typeof a === 'string' ? a : undefined); }));

  const page = await ctx.newPage();
  const A = BASE + 'admin/';
  const loginAs = async email => { if (email) await signIn(email); await page.evaluate(e => e ? localStorage.setItem('fake_sb_user', e) : localStorage.removeItem('fake_sb_user'), email); await page.goto(A); await page.waitForTimeout(600); };
  const text = () => page.evaluate(() => document.body.innerText);
  const tab = async name => { await page.click(`.tabs button:has-text("${name}")`); await page.waitForTimeout(300); };
  const pickTerm = async name => { await page.fill('input[type=search]', name); await page.click(`.list button:has(span:text-is("${name}"))`); await page.waitForTimeout(200); };
  const field = lab => page.locator(`#term-editor label:text-is("${lab}") + *`);
  const noticeTxt = () => page.textContent('#notice');
  const termOf = (C, name) => C.terms.find(t => t.name === name);

  /* 1. 未登入 */
  await page.goto(A); await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.removeItem('fake_sb_user')); await page.goto(A); await page.waitForTimeout(500);
  ok('未登入：顯示登入畫面（Google 與 Email 連結）', /登入管理後台/.test(await text()) && await page.isVisible('button:has-text("使用 Google 登入")'));
  await page.click('button:has-text("使用 Google 登入")');
  ok('Google 登入呼叫 Supabase OAuth（provider=google，回到後台）', await page.evaluate(() => window.__oauth && window.__oauth.provider === 'google' && /\/admin\/$/.test(window.__oauth.options.redirectTo)));
  await page.fill('input[type=email]', 'someone@example.com'); await page.click('button:has-text("寄送登入連結")'); await page.waitForTimeout(200);
  ok('Email 登入連結：呼叫 signInWithOtp 並提示查收', /已寄出登入連結/.test(await noticeTxt()));
  const anonLoad = await rpc('', 'admin_load', {});
  ok('未登入直接呼叫後台 API 被資料庫拒絕', !!anonLoad.error, anonLoad.error && anonLoad.error.message);

  /* 2. 已登入但未授權 */
  await loginAs('stranger@example.com');
  ok('未授權帳號：顯示「尚未獲得編輯權限」，看不到編輯介面', /尚未獲得編輯權限/.test(await text()) && !(await page.$('.tabs')));
  const st = await rpc('stranger@example.com', 'save_term', { p: { id: 'x' }, p_expected_version: 1 });
  ok('未授權帳號繞過介面直接呼叫寫入 API 被拒', st.error && /not_authorized/.test(st.error.message));

  /* 3. Owner 登入、授權 Editor */
  await loginAs('owner@example.com');
  let t = await text();
  ok('Owner 登入：顯示角色與全部分頁（含成員權限）', /Owner 擁有者/.test(t) && /成員權限/.test(t) && /108 珠位/.test(t));
  await tab('成員權限');
  await page.fill('input[type=email]', 'editor@example.com'); await page.click('button:has-text("授權")'); await page.waitForTimeout(500);
  ok('Owner 授權 editor@example.com 為 Editor', /editor@example\.com[\s\S]*Editor[\s\S]*尚未登入/.test(await text()));

  /* 4. Editor 編輯草稿 */
  await loginAs('editor@example.com');
  t = await text();
  ok('Editor 首次登入即取得 Editor 角色，看不到成員權限分頁', /Editor 編輯者/.test(t) && !/成員權限/.test(t));
  await pickTerm('持咒');
  const shot = async n => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png'), fullPage: false }); };
  await shot('admin-term');
  const slotOpts = await page.$$eval('#term-editor label:text-is("實際珠位（只能選主分類那一區的普通數珠；一顆珠只放一個名相）") + select option', os => os.map(o => +o.value).filter(Boolean));
  ok('珠位選單只列主分類（修）區的 26 顆普通數珠', slotOpts.length === 26 && slotOpts.every(n => n >= 28 && n <= 53), slotOpts[0] + '…' + slotOpts[slotOpts.length - 1]);
  const showChecked = await page.$$eval('#term-editor .checks input:checked', xs => xs.map(x => x.parentElement.textContent));
  ok('持咒：主分類修、跨類顯示於行（勾選）', showChecked.join() === '修（主分類）,行', showChecked.join());
  const MARK = '【測試修訂】';
  const body0 = await field('原書正文').inputValue();
  await field('原書正文').fill(body0 + MARK);
  answers = [false]; // 未儲存就換名相 → 出現確認，選「取消」留在原處
  await page.fill('input[type=search]', ''); await page.click('.list button:has(span:text-is("如來藏"))').catch(() => {}); await page.waitForTimeout(200);
  ok('有未儲存修改時切換會先確認，取消則保留修改', /尚未儲存/.test(dialogs[dialogs.length - 1] || '') && (await field('原書正文').inputValue()).endsWith(MARK));
  await page.click('button:has-text("儲存草稿")'); await page.waitForTimeout(600);
  ok('Editor 儲存草稿成功', /已儲存草稿/.test(await noticeTxt()));
  let pub = (await latestPublished())[0].content;
  ok('草稿尚未發布：訪客讀到的正式版本不變', !termOf(pub, '持咒').body.includes(MARK));
  const prev = await rpc('editor@example.com', 'preview_content', {});
  ok('草稿預覽（Editor）可看到修改', termOf(prev.data, '持咒').body.includes(MARK));

  /* 5. 版本衝突 */
  await pickTerm('持咒');
  await field('整理說明（與原文分開）').fill('Editor 的說明');
  const cur = (await rpc('owner@example.com', 'admin_load', {})).data.terms.find(x => x.name === '持咒');
  const ow = await rpc('owner@example.com', 'save_term', { p: Object.assign({}, cur, { explanation: 'Owner 同時修改' }), p_expected_version: cur.version });
  ok('另一人（Owner）同時儲存同一名相', !ow.error, ow.error && ow.error.message);
  await page.click('button:has-text("儲存草稿")'); await page.waitForTimeout(600);
  ok('衝突偵測：Editor 以舊版本儲存被擋下並顯示衝突選項，表單保留修改', await page.isVisible('.conflict') && (await field('整理說明（與原文分開）').inputValue()) === 'Editor 的說明');
  answers = [true];
  await page.click('button:has-text("仍以我的修改覆蓋")'); await page.waitForTimeout(800);
  const afterC = (await rpc('owner@example.com', 'admin_load', {})).data.terms.find(x => x.name === '持咒');
  ok('確認後以自己的修改覆蓋（版本 +1）', afterC.explanation === 'Editor 的說明' && afterC.version === cur.version + 2, 'v' + afterC.version);

  /* 6. Editor 權限邊界 */
  await tab('發布與版本');
  ok('Editor 看不到「正式發布」按鈕', !(await page.$('button:has-text("正式發布")')) && /只有 Owner 可以正式發布/.test(await text()));
  const ep = await rpc('editor@example.com', 'publish', { p_note: 'x' });
  ok('Editor 直接呼叫發布 API 被資料庫拒絕', ep.error && /not_authorized/.test(ep.error.message));
  const er = await rpc('editor@example.com', 'restore_revision', { p_id: 1 });
  ok('Editor 直接呼叫還原 API 被拒', er.error && /not_authorized/.test(er.error.message));
  const es = await rpc('editor@example.com', 'save_setting', { p_key: 'quote', p_value: 'x', p_expected_version: 1 });
  ok('Editor 不能改導師引文（資料庫拒絕）', es.error && /not_authorized/.test(es.error.message));
  const em = await rpc('editor@example.com', 'set_member_role', { p_email: 'editor@example.com', p_role: 'owner' });
  ok('Editor 不能自行升級為 Owner', em.error && /not_authorized/.test(em.error.message));
  await tab('分類與網站設定');
  ok('分類與網站設定：Editor 只能檢視（欄位停用）', /只有 Owner 可以修改/.test(await text()) && await page.$eval('textarea', x => x.disabled));
  // 珠位規則
  const all = (await rpc('editor@example.com', 'admin_load', {})).data;
  const chz = all.terms.find(x => x.name === '持咒');
  const emptyXing = all.beads.find(x => x.kind === 'bead' && x.n >= 55 && x.n <= 80 && !x.term_id).n;
  const mm = await rpc('editor@example.com', 'save_term', { p: Object.assign({}, chz, { slot: emptyXing }), p_expected_version: chz.version });
  ok('把修區名相移到行區珠位被拒（主分類與珠位分類不符）', mm.error && /bead_category_mismatch/.test(mm.error.message));
  const other = all.terms.find(x => x.primary_category === chz.primary_category && x.slot && x.slot !== chz.slot);
  const oc = await rpc('editor@example.com', 'save_term', { p: Object.assign({}, chz, { slot: other.slot }), p_expected_version: chz.version });
  ok('一顆珠不能放兩個名相', oc.error && /bead_occupied/.test(oc.error.message));
  const sp = await rpc('editor@example.com', 'save_term', { p: Object.assign({}, chz, { slot: 54 }), p_expected_version: chz.version });
  ok('名相不能放到隔珠', !!sp.error, sp.error && sp.error.message.slice(0, 60));

  /* 7. 108 珠位畫面、XSS */
  await tab('108 珠位'); await shot('admin-beads');
  ok('108 珠位畫面：108 格、4 隔珠', (await page.$$('.bead')).length === 108 && (await page.$$('.bead.spacer')).length === 4);
  await tab('名相');
  await pickTerm('持咒');
  await field('子名相・校訂註（每行一條）').fill('<img src=x onerror="window.__xss=1">');
  await page.click('button:has-text("儲存草稿")'); await page.waitForTimeout(600);
  await pickTerm('持咒');
  ok('輸入 HTML 只當文字儲存與顯示，不會執行（XSS）', !(await page.evaluate(() => window.__xss)) && (await field('子名相・校訂註（每行一條）').inputValue()).includes('<img'));
  // 還原校訂註
  const c2 = (await rpc('editor@example.com', 'admin_load', {})).data.terms.find(x => x.name === '持咒');
  await rpc('editor@example.com', 'save_term', { p: Object.assign({}, c2, { notes: cur.notes }), p_expected_version: c2.version });

  /* 8. Owner 發布、公開網站更新 */
  await loginAs('owner@example.com');
  await tab('發布與版本');
  await page.fill('input[placeholder^="這次發布的說明"]', '測試發布'); answers = [true];
  await page.click('button:has-text("正式發布")'); await page.waitForTimeout(800);
  ok('Owner 發布成功', /已發布（版本 #\d+）/.test(await noticeTxt()), await noticeTxt());
  pub = (await latestPublished())[0];
  ok('發布後正式版本含修改', termOf(pub.content, '持咒').body.includes(MARK));
  const site = await ctx.newPage();
  await site.goto(BASE); await site.waitForFunction(() => window.__kmReady, null, { timeout: 120000 });
  const sv = await site.evaluate(() => ({ src: window.KM_SOURCE, v: window.KM_VERSION && window.KM_VERSION.id, body: (KM_DATA.terms.find(t => t.name === '持咒') || {}).body || '', n: KM_DATA.terms.length }));
  ok('公開網站讀取 Supabase 最新正式版本並顯示修改', sv.src === 'published' && sv.v === pub.id && sv.body.includes(MARK) && sv.n === 76, JSON.stringify({ src: sv.src, v: sv.v, n: sv.n }));
  await site.click('#mode-terms').catch(() => {}); await site.waitForTimeout(500);
  ok('公開網站以發布資料正常運作（3D 已載入、無 JS 錯誤）', errs.length === 0, errs.join(' | '));
  await site.close();

  /* 9. 版本比較與還原 */
  await tab('發布與版本');
  await page.waitForTimeout(400);
  const firstRow = page.locator('tbody tr', { hasText: '#1' }).first();
  await firstRow.locator('button:has-text("與目前草稿比較")').click(); await page.waitForTimeout(800);
  await shot('admin-diff');
  ok('版本比較：列出持咒正文差異', /「持咒」：[^\n]*原書正文有變/.test(await text()));
  const auditN = async () => (await rpc('owner@example.com', 'list_audit', { p_limit: 1000 })).data.length;
  const before = await auditN();
  answers = [true];
  await firstRow.locator('button:has-text("還原到草稿")').click(); await page.waitForTimeout(1000);
  const added = (await auditN()) - before;
  ok('還原只記一筆紀錄（不把整份載入逐列灌入紀錄），並保留還原前備份', added === 1, '新增 ' + added + ' 筆');
  ok('還原：先自動備份目前草稿', /已還原到草稿（目前草稿已備份為 #\d+）/.test(await noticeTxt()), await noticeTxt());
  const restored = (await rpc('owner@example.com', 'preview_content', {})).data;
  ok('還原後草稿回到版本 #1，正式版本仍不變（需再發布）', !termOf(restored, '持咒').body.includes(MARK) && termOf((await latestPublished())[0].content, '持咒').body.includes(MARK));
  answers = [true]; await page.click('button:has-text("正式發布")'); await page.waitForTimeout(800);
  ok('再次發布後公開網站回到原內容', !termOf((await latestPublished())[0].content, '持咒').body.includes(MARK));

  /* 10. 操作紀錄 */
  await tab('操作紀錄'); await page.waitForTimeout(600);
  t = await text();
  ok('操作紀錄記下人員與對象（editor 修改名相、owner 發布與還原）', /editor@example\.com\s+terms term-/.test(t) && /owner@example\.com\s+content_revisions \d+\s+publish/.test(t) && /restore_to_draft/.test(t), t.split('\n').slice(-4).join(' / '));

  /* 11. 引文保護 */
  await tab('分類與網站設定');
  const q = page.locator('h3:text-is("導師引文（必須逐字保留）") + textarea');
  await q.fill((await q.inputValue()).replace('平實導師', '平實')); answers = [false];
  await page.locator('h3:text-is("導師引文（必須逐字保留）") ~ .actions button').click(); await page.waitForTimeout(400);
  const qv = (await rpc('owner@example.com', 'preview_content', {})).data.quote;
  ok('修改引文時要求再次確認，取消則不儲存', /引文與原始全文不同/.test(dialogs[dialogs.length - 1]) && qv.includes('平實導師'));

  /* 11b. 隔珠編輯、新增章與目、上傳圖片 */
  await tab('108 珠位');
  await page.click('.bead.spacer:has-text("第 27 顆")'); await page.waitForTimeout(400);
  ok('108 珠位：點隔珠開啟隔珠編輯', await page.isVisible('#spacer-editor'));
  await page.fill('#spacer-editor label:text-is("原書正文") + textarea', '隔珠二的正文（測試）');
  await page.setInputFiles('#spacer-editor input[type=file]', { name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') }); await page.waitForTimeout(500);
  const upUrl = await page.inputValue('#spacer-editor .row input:not([type=file])');
  ok('上傳圖片：存到 images 空間並填入公開網址', /^https:\/\/fake-project\.supabase\.co\/storage\/v1\/object\/public\/images\/spacers\/.+\.png$/.test(upUrl) && (await page.evaluate(() => window.__uploads.length)) === 1, upUrl);
  await page.click('button:has-text("儲存隔珠（草稿）")'); await page.waitForTimeout(600);
  const zx = (await rpc('owner@example.com', 'preview_content', {})).data.zones.find(z => z.id === 'xiu');
  ok('隔珠內容與圖片存入草稿', zx.spacerBody === '隔珠二的正文（測試）' && zx.spacerImage === upUrl);
  await tab('名相'); await pickTerm('持咒');
  ok('名相編輯有「上傳圖片」按鈕', await page.isVisible('#term-editor button:has-text("上傳圖片")'));
  await tab('章節');
  answers = ['測試第十八章', '4'];
  await page.click('button:has-text("＋ 新增章")'); await page.waitForTimeout(800);
  ok('章節：新增章（第 18 章）', /已新增第 18 章/.test(await noticeTxt()) && (await rpc('owner@example.com', 'admin_load', {})).data.chapters.length === 18, await noticeTxt());
  answers = ['新節一'];
  await page.click('button:has-text("＋ 新增節")'); await page.waitForTimeout(800);
  answers = ['新目一'];
  await page.click('button:has-text("＋目")'); await page.waitForTimeout(800);
  const c18 = (await rpc('owner@example.com', 'preview_content', {})).data.chapters.find(c => c.no === 18);
  ok('章節：新章下新增節與目', c18 && c18.title === '測試第十八章' && c18.sections[0].title === '新節一' && c18.sections[0].items && c18.sections[0].items[0].title === '新目一', JSON.stringify(c18 && c18.sections));
  ok('章節：章也有上傳圖片按鈕，Owner 有刪除本章', await page.isVisible('button:has-text("上傳圖片")') && await page.isVisible('button:has-text("刪除本章")'));
  answers = ['18'];
  await page.click('button:has-text("刪除本章")'); await page.waitForTimeout(800);
  ok('章節：Owner 刪除新章', (await rpc('owner@example.com', 'admin_load', {})).data.chapters.length === 17);

  /* 12. 撤銷權限 */
  await tab('成員權限'); answers = [true];
  await page.locator('tr', { hasText: 'editor@example.com' }).locator('button:has-text("撤銷")').click(); await page.waitForTimeout(600);
  await loginAs('editor@example.com');
  ok('撤銷後 Editor 無法再進入後台', /尚未獲得編輯權限/.test(await text()));
  const ow2 = await rpc('owner@example.com', 'set_member_role', { p_email: 'owner@example.com', p_role: 'editor' });
  ok('Owner 不能把自己降級（避免沒有 Owner）', ow2.error && /cannot_demote_self/.test(ow2.error.message));

  /* 13. 草稿預覽頁 */
  await loginAs('owner@example.com');
  const pv = await ctx.newPage();
  await pv.goto(BASE + '?preview=1'); await pv.waitForFunction(() => window.__kmReady, null, { timeout: 120000 });
  ok('以 Owner 登入時 ?preview=1 顯示草稿並標示', await pv.evaluate(() => window.KM_SOURCE === 'preview' && /草稿預覽/.test(document.querySelector('.km-banner').textContent)));
  await pv.evaluate(() => localStorage.removeItem('fake_sb_user'));
  await pv.goto(BASE + '?preview=1'); await pv.waitForFunction(() => window.__kmReady, null, { timeout: 120000 });
  ok('未登入開預覽：拒絕草稿，改顯示正式版本', await pv.evaluate(() => window.KM_SOURCE === 'published' && /無法預覽草稿/.test(document.querySelector('.km-banner').textContent)));
  await pv.close();

  /* 14. Supabase 無法連線時退回內建資料 */
  await ctx.unroute(SB + '/rest/v1/**');
  await ctx.route(SB + '/rest/v1/**', r => r.abort());
  const off = await ctx.newPage();
  await off.goto(BASE); await off.waitForFunction(() => window.__kmReady, null, { timeout: 120000 });
  ok('資料庫無法連線時，網站改用內建 data/content.js', await off.evaluate(() => window.KM_SOURCE === 'local' && KM_DATA.terms.length === 76));
  await off.close();

  ok('全程無 JS 錯誤', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(out.join('\n'));
  const f = out.filter(x => x.startsWith('FAIL')).length;
  console.log(`\n${out.length - f} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.log(out.join('\n')); console.error(e); process.exit(1); });
