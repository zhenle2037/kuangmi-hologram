// 資料庫權限與流程測試：在 PGlite（WebAssembly 版 PostgreSQL）中模擬 Supabase 的 auth 結構與 anon／authenticated 角色，
// 依序執行 supabase/migrations，然後以不同身分實際呼叫資料表與函式，驗證 RLS、角色、草稿／發布／還原、版本衝突與 108 珠完整性。
// 用法：npm i @electric-sql/pglite && node tools/db/test_db.cjs
const fs = require('fs'), path = require('path');
const { PGlite } = require(process.env.PGLITE || '@electric-sql/pglite');
const root = path.join(__dirname, '..', '..');
// jsonb 不保留物件鍵順序，比較時先排序鍵
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().filter(k => v[k] !== undefined && v[k] !== null).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
const out = []; const ok = (name, cond, extra = '') => out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- 與 Supabase 預設相同：public 下新建的資料表與函式預設開放給 anon／authenticated（migration 必須自行收回）
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

(async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const migs = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
  for (const m of migs) {
    try { await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', m), 'utf8')); ok('migration ' + m, true); }
    catch (e) { ok('migration ' + m, false, e.message); console.log(out.join('\n')); process.exit(1); }
  }
  // 身分
  const U = { owner: '11111111-1111-1111-1111-111111111111', editor: '22222222-2222-2222-2222-222222222222', stranger: '33333333-3333-3333-3333-333333333333', editor2: '44444444-4444-4444-4444-444444444444' };
  await db.query(`select public.bootstrap_owner('owner@example.com')`);
  await db.query(`insert into auth.users (id, email) values ($1, 'Owner@Example.com')`, [U.owner]);
  await db.query(`insert into auth.users (id, email) values ($1, 'stranger@example.com')`, [U.stranger]);

  // 以某身分執行（模擬 PostgREST：交易內 set role + JWT sub）
  async function as(who, sql, params = []) {
    try {
      return await db.transaction(async tx => {
        await tx.query(`select set_config('role', $1, true)`, [who === 'anon' ? 'anon' : 'authenticated']);
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who === 'anon' ? '' : U[who]]);
        const r = await tx.query(sql, params);
        return { rows: r.rows, count: r.affectedRows };
      });
    } catch (e) { return { error: e.message, code: e.code }; }
  }
  const rpc = (who, fn, args = []) => as(who, `select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args).then(x => x.error ? x : { r: x.rows[0].r });

  // ---- 1. 資料遷移完整性 ----
  const src = JSON.parse(fs.readFileSync(path.join(root, 'supabase/seed-source.json'), 'utf8'));
  const pub0 = await as('anon', `select id, content from public.content_revisions where kind = 'publish' order by id desc limit 1`);
  const C0 = pub0.rows && pub0.rows[0] && pub0.rows[0].content;
  ok('訪客可讀取最新正式版本', !!C0);
  const cnt = await db.query(`select (select count(*) from bead_positions) b, (select count(*) from bead_positions where kind='spacer') s, (select count(*) from terms) t,
    (select count(*) from bead_positions where term_id is not null) a, (select count(*) from chapters) c, (select count(*) from sections where parent_id is null) sec,
    (select count(*) from sections where parent_id is not null) it, (select count(*) from term_chapters) refs, (select count(*) from extras) ex`);
  const k = cnt.rows[0];
  ok('遷移：108 珠位、4 隔珠', +k.b === 108 && +k.s === 4);
  ok('遷移：76 名相皆有唯一珠位', +k.t === 76 && +k.a === 76);
  ok('遷移：17 章、160 節、21 目、8 入口', +k.c === 17 && +k.sec === 160 && +k.it === 21 && +k.ex === 8, JSON.stringify(k));
  const srcRefs = src.terms.reduce((a, t) => a + t.refs.length, 0);
  ok('遷移：名相章節對應數一致', +k.refs === srcRefs, k.refs + '/' + srcRefs);
  // 逐項比對：已發布內容與原始 content.js 完全一致（名相、珠位、跨類、章節）
  const norm = t => canon({ id: t.id, name: t.name, group: t.group, show: t.show, slot: t.slot, refs: t.refs, notes: t.notes, body: t.body, image: t.image, imageCaption: t.imageCaption });
  const srcT = Object.fromEntries(src.terms.map(t => [t.id, norm(t)])), pubT = Object.fromEntries(C0.terms.map(t => [t.id, norm(t)]));
  const diffT = Object.keys(srcT).filter(id => srcT[id] !== pubT[id]);
  ok('遷移：76 名相逐項與原始資料一致', diffT.length === 0, diffT.slice(0, 3).join(','));
  ok('遷移：章節目逐項一致', canon(C0.chapters) === canon(src.chapters));
  ok('遷移：引文、部件、分類、入口一致', C0.quote === src.quote && canon(C0.parts) === canon(src.parts) && canon(C0.zones) === canon(src.zones) && canon(C0.extras) === canon(src.extras));
  const chz = C0.terms.find(t => t.name === '持咒'), zy = C0.terms.find(t => t.name === '密宗之中有解脫');
  ok('持咒：唯一珠位在修區，跨類顯示於行', chz.slot === 39 && chz.group === '修' && JSON.stringify(chz.show) === '["修","行"]');
  ok('中有解脫：唯一珠位在果區，跨類顯示於修', zy.slot === 100 && zy.group === '果' && JSON.stringify(zy.show) === '["果","修"]');

  // ---- 2. 訪客與未授權者 ----
  for (const t of ['terms', 'bead_positions', 'site_settings', 'audit_logs', 'profiles', 'member_invites']) {
    const r = await as('anon', `select count(*) n from public.${t}`);
    ok('訪客不能讀 ' + t, !!r.error, r.error ? '' : 'rows=' + r.rows[0].n);
  }
  const anonBackup = await as('anon', `select count(*) n from public.content_revisions where kind <> 'publish'`);
  ok('訪客看不到草稿備份', anonBackup.rows && +anonBackup.rows[0].n === 0);
  ok('訪客不能寫入名相', !!(await as('anon', `update public.terms set name = 'x' where id = 'term-見-1'`)).error);
  ok('訪客不能呼叫後台函式', !!(await rpc('anon', 'admin_load')).error);
  ok('訪客不能直接新增發布版本', !!(await as('anon', `insert into public.content_revisions (kind, content) values ('publish', '{}')`)).error);
  const sRead = await as('stranger', `select count(*) n from public.terms`);
  ok('已登入但未授權者讀不到草稿', sRead.rows && +sRead.rows[0].n === 0);
  const sUpd = await as('stranger', `update public.terms set name = 'x', version = version + 1 where id = 'term-見-1'`);
  ok('已登入但未授權者不能修改', !sUpd.error && sUpd.count === 0);
  ok('未授權者不能呼叫 save_term', /not_authorized/.test((await rpc('stranger', 'save_term', [JSON.stringify({ id: 'term-見-1', name: 'x', primary_category: 'jian' }), 1])).error || ''));
  ok('未授權者不能把自己升級', !!(await rpc('stranger', 'set_member_role', ['stranger@example.com', 'owner'])).error);
  ok('未授權者不能直接改自己的角色', !!(await as('stranger', `update public.profiles set role = 'owner' where id = '${U.stranger}'`)).error);
  const sProf = await db.query(`select role from profiles where id = $1`, [U.stranger]);
  ok('未授權者角色仍為 none', sProf.rows[0].role === 'none');

  // ---- 3. Owner 授權 Editor ----
  ok('Owner 角色正確（大小寫不敏感的 email）', (await db.query(`select role from profiles where id = $1`, [U.owner])).rows[0].role === 'owner');
  ok('Owner 邀請 Editor', !(await rpc('owner', 'set_member_role', ['Editor@Example.com', 'editor'])).error);
  await db.query(`insert into auth.users (id, email) values ($1, 'editor@example.com')`, [U.editor]);
  ok('Editor 登入後自動取得 editor 角色', (await db.query(`select role from profiles where id = $1`, [U.editor])).rows[0].role === 'editor');
  ok('Editor 不能管理授權', !!(await rpc('editor', 'set_member_role', ['stranger@example.com', 'editor'])).error);
  ok('Owner 不能撤銷自己', !!(await rpc('owner', 'set_member_role', ['owner@example.com', 'none'])).error);

  // ---- 4. Editor 存草稿，不能發布；草稿不影響公開網站 ----
  const L = await rpc('editor', 'admin_load');
  ok('Editor 可讀後台資料', !L.error && L.r.terms.length === 76 && L.r.beads.length === 108);
  const t1 = L.r.terms.find(t => t.id === 'term-見-1');
  const save1 = await rpc('editor', 'save_term', [JSON.stringify({ ...t1, name: '如來藏（草稿測試）', show: t1.show, refs: t1.refs, slot: t1.slot }), t1.version]);
  ok('Editor 儲存名相草稿', !save1.error && save1.r.version === t1.version + 1, save1.error || '');
  const pubNow = await as('anon', `select content from public.content_revisions where kind = 'publish' order by id desc limit 1`);
  ok('草稿不影響公開網站', pubNow.rows[0].content.terms.find(t => t.id === 'term-見-1').name === '如來藏');
  const prev = await rpc('editor', 'preview_content');
  ok('Editor 可預覽草稿', prev.r && prev.r.terms.find(t => t.id === 'term-見-1').name === '如來藏（草稿測試）');
  ok('Editor 不能發布', /只有 Owner/.test((await rpc('editor', 'publish', ['x'])).error || ''));
  ok('Editor 不能還原版本', !!(await rpc('editor', 'restore_revision', [1])).error);
  ok('Editor 不能改網站設定', !!(await rpc('editor', 'save_setting', ['site', JSON.stringify({ title: 'x' }), 1])).error);

  // ---- 5. 版本衝突 ----
  const conflict = await rpc('editor', 'save_term', [JSON.stringify({ ...t1, name: '舊版本覆蓋', show: t1.show, refs: t1.refs, slot: t1.slot }), t1.version]);
  ok('同時編輯：用舊版本儲存會被拒絕（不靜默覆蓋）', /version_conflict/.test(conflict.error || ''));
  const direct = await as('editor', `update public.terms set name = '直接覆蓋' where id = 'term-見-1'`);
  ok('直接改資料表而未更新版本號也會被拒絕', /version_conflict/.test(direct.error || ''));

  // ---- 6. Owner 發布；公開網站顯示新標題 ----
  const pubR = await rpc('owner', 'publish', ['改名測試']);
  ok('Owner 發布', !pubR.error, pubR.error || '');
  const pub2 = await as('anon', `select id, content from public.content_revisions where kind = 'publish' order by id desc limit 1`);
  ok('發布後公開網站顯示新標題', pub2.rows[0].content.terms.find(t => t.id === 'term-見-1').name === '如來藏（草稿測試）');

  // ---- 7. 珠位與結構保護 ----
  const L2 = (await rpc('editor', 'admin_load')).r;
  const t2 = L2.terms.find(t => t.id === 'term-見-2'), before = JSON.stringify(L2.beads.filter(b => b.n !== t2.slot).map(b => [b.n, b.term_id]));
  ok('不能把名相放到隔珠', !!(await rpc('editor', 'save_term', [JSON.stringify({ ...t2, slot: 27 }), t2.version])).error);
  ok('不能把見區名相放到修區珠位', /bead_category_mismatch/.test((await rpc('editor', 'save_term', [JSON.stringify({ ...t2, slot: 49 }), t2.version])).error || ''));
  ok('不能佔用已有名相的珠位', /bead_occupied/.test((await rpc('editor', 'save_term', [JSON.stringify({ ...t2, slot: 3 }), t2.version])).error || ''));
  const mv = await rpc('editor', 'save_term', [JSON.stringify({ ...t2, slot: 20 }), t2.version]);
  ok('名相可移到同區空珠位', !mv.error, mv.error || '');
  const L3 = (await rpc('editor', 'admin_load')).r;
  ok('移動一個名相不影響其他珠子', JSON.stringify(L3.beads.filter(b => b.n !== 2 && b.n !== 20).map(b => [b.n, b.term_id])) === JSON.stringify(L2.beads.filter(b => b.n !== 2 && b.n !== 20).map(b => [b.n, b.term_id])));
  ok('Owner 也不能刪除珠位列', !!(await as('owner', `delete from public.bead_positions where n = 5`)).error && +(await db.query('select count(*) n from bead_positions')).rows[0].n === 108);
  ok('不能新增第 109 顆', !!(await db.query(`insert into public.bead_positions (n, kind, category_id) values (109, 'bead', 'jian')`).catch(e => ({ error: e.message }))).error);
  const t3 = L3.terms.find(t => t.id === 'term-見-3');
  const arc = await rpc('editor', 'archive_term', [t3.id, t3.version, true]);
  const k2 = (await db.query(`select (select count(*) from bead_positions) b, (select term_id from bead_positions where n = 3) t3`)).rows[0];
  ok('封存名相：釋放珠位、仍是 108 顆', !arc.error && +k2.b === 108 && k2.t3 === null);
  ok('Editor 不能永久刪除名相', !!(await rpc('editor', 'delete_term', ['term-見-4'])).error);
  const del = await rpc('owner', 'delete_term', ['term-見-4']);
  const k3 = (await db.query(`select (select count(*) from bead_positions) b, (select count(*) from term_chapters where term_id = 'term-見-4') r`)).rows[0];
  ok('Owner 刪除名相：關聯一併移除、仍是 108 顆', !del.error && +k3.b === 108 && +k3.r === 0);
  ok('發布前檢查通過', (await rpc('owner', 'publish', ['結構測試'])).error === undefined);
  const pub3 = (await as('anon', `select content from public.content_revisions where kind = 'publish' order by id desc limit 1`)).rows[0].content;
  ok('已封存／刪除的名相不出現在公開內容', !pub3.terms.find(t => t.id === 'term-見-3' || t.id === 'term-見-4') && pub3.terms.length === 74);

  // ---- 8. 還原版本 ----
  const revs = (await rpc('owner', 'list_revisions', [20])).r;
  const first = revs[revs.length - 1];
  const rs = await rpc('owner', 'restore_revision', [first.id]);
  ok('Owner 還原到初始版本（先自動備份目前草稿）', !rs.error && rs.r.backup > 0, rs.error || '');
  const afterRestore = (await rpc('owner', 'preview_content')).r;
  ok('還原後草稿內容與初始版本相同', afterRestore.terms.length === 76 && afterRestore.terms.find(t => t.id === 'term-見-1').name === '如來藏' && afterRestore.terms.find(t => t.id === 'term-見-2').slot === 2);
  ok('還原不會自動公開（需再發布）', (await as('anon', `select content from public.content_revisions where kind = 'publish' order by id desc limit 1`)).rows[0].content.terms.length === 74);
  await rpc('owner', 'publish', ['還原初始']);
  const pub4 = (await as('anon', `select content from public.content_revisions where kind = 'publish' order by id desc limit 1`)).rows[0].content;
  ok('還原並發布後公開內容與原始資料一致', pub4.terms.length === 76 && pub4.terms.every(t => srcT[t.id] === norm(t)));
  ok('還原後仍是 108 顆、4 隔珠', +(await db.query('select count(*) n from bead_positions')).rows[0].n === 108);

  // ---- 9. 紀錄 ----
  const aud = (await rpc('owner', 'list_audit', [1000, 'terms'])).r.concat((await rpc('owner', 'list_audit', [1000, 'content_revisions'])).r);
  ok('操作紀錄記下修改者與時間', aud.some(a => a.table_name === 'terms' && a.user_email === 'editor@example.com' && a.action === 'update' && a.at));
  ok('操作紀錄記下發布與還原', aud.some(a => a.action === 'publish') && aud.some(a => a.action === 'restore_to_draft'));
  ok('未授權者讀不到紀錄', !!(await rpc('stranger', 'list_audit', [10])).error);
  // 撤銷 Editor
  await rpc('owner', 'set_member_role', ['editor@example.com', 'none']);
  ok('撤銷後 Editor 立即失去編輯權', !!(await rpc('editor', 'admin_load')).error);

  console.log(out.join('\n'));
  console.log('\n' + out.filter(l => l.startsWith('PASS')).length + ' passed, ' + out.filter(l => l.startsWith('FAIL')).length + ' failed');
  process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
})();
