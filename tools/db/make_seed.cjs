// 由 data/content.js 產生資料遷移 SQL（supabase/migrations/..._seed.sql）。可重複執行：km_load_content 以 upsert 方式寫入。
// 用法：node tools/db/make_seed.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'data/content.js'), 'utf8'), ctx);
const D = ctx.window.KM_DATA;
D.site = D.site || { title: '以數珠為喻', subtitle: '《狂密與真密》章節導覽' };
const json = JSON.stringify(D);
if (json.includes('$km$')) throw new Error('content contains dollar-quote tag');
const sql = `-- 資料遷移：匯入 data/content.js 的全部內容（名相 ${D.terms.length}、章 ${D.chapters.length}），並建立第一個正式發布版本。
-- 由 tools/db/make_seed.cjs 自動產生，請勿手改。
select public.km_load_content($km$${json}$km$::jsonb);
insert into public.content_revisions (kind, content, note) values ('publish', public.km_build_content(), '初始資料：由 data/content.js 匯入');
`;
fs.writeFileSync(path.join(root, 'supabase/migrations/20261015000300_seed.sql'), sql);
fs.writeFileSync(path.join(root, 'supabase/seed-source.json'), JSON.stringify(D, null, 1));
console.log('terms', D.terms.length, 'chapters', D.chapters.length, 'bytes', sql.length);
