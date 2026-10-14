-- 權限、觸發器、RLS 與後台函式
-- 原則：訪客（anon）只能讀已發布快照；草稿與管理資料一律需 Owner／Editor；
--       寫入一律經 security definer 函式並在函式內檢查角色，資料表另有 RLS 作第二道防線。

-- ---------- 角色判斷 ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'none')
$$;
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() in ('owner', 'editor') $$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() = 'owner' $$;
create or replace function public.my_email() returns text
language sql stable security definer set search_path = public as $$ select email from public.profiles where id = auth.uid() $$;

-- ---------- 新帳號：建立 profile，依邀請名單給角色（預設無權限） ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  select role into r from public.member_invites where email = lower(new.email);
  insert into public.profiles (id, email, role) values (new.id, lower(new.email), coalesce(r, 'none'))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 只能由資料庫擁有者在 Supabase SQL Editor 執行，用來指定第一位 Owner（不寫死在程式中）
create or replace function public.bootstrap_owner(p_email text) returns text
language plpgsql security definer set search_path = public as $$
begin
  insert into public.member_invites (email, role) values (lower(p_email), 'owner')
  on conflict (email) do update set role = 'owner';
  update public.profiles set role = 'owner', updated_at = now() where email = lower(p_email);
  return 'owner set: ' || lower(p_email);
end $$;

-- ---------- 樂觀鎖：每次更新 version 必須正好 +1，否則視為版本衝突 ----------
create or replace function public.km_touch() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('km.loading', true), '') <> 'on' then
    if new.version is distinct from old.version + 1 then
      raise exception 'version_conflict: % % expected version %, got %', tg_table_name, coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'n', to_jsonb(old)->>'key'), old.version + 1, new.version
        using errcode = '40001';
    end if;
  else
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ---------- 操作紀錄 ----------
create or replace function public.km_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text; o jsonb; n jsonb;
begin
  -- 整份載入（初始資料、還原版本）時不逐列記錄，改由 restore_revision 記一筆並保留還原前備份
  if current_setting('km.loading', true) = 'on' then return null; end if;
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  k := coalesce(n->>'id', o->>'id', n->>'n', o->>'n', n->>'key', o->>'key', n->>'term_id', o->>'term_id', n->>'email', o->>'email');
  insert into public.audit_logs (user_id, user_email, table_name, row_key, action, old_row, new_row)
  values (auth.uid(), public.my_email(), tg_table_name, k, lower(tg_op), o, n);
  return null;
end $$;

-- ---------- 資料一致性：名相只能放在同分類的普通珠；已封存名相不能佔珠位 ----------
create or replace function public.km_check_bead() returns trigger
language plpgsql set search_path = public as $$
declare tc text; ta boolean;
begin
  if new.term_id is not null then
    select primary_category, archived into tc, ta from public.terms where id = new.term_id;
    if tc is distinct from new.category_id then
      raise exception 'bead_category_mismatch: 珠 % 屬於 %，名相 % 的主分類是 %', new.n, new.category_id, new.term_id, tc using errcode = '23514';
    end if;
    if ta then raise exception 'term_archived: 已封存的名相不能配置到珠位' using errcode = '23514'; end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories', 'terms', 'bead_positions', 'chapters', 'sections', 'extras', 'site_settings'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.km_touch()', t || '_touch', t);
  end loop;
  foreach t in array array['categories', 'terms', 'term_categories', 'bead_positions', 'chapters', 'sections', 'term_chapters', 'extras', 'site_settings', 'member_invites', 'profiles'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.km_audit()', t || '_audit', t);
  end loop;
end $$;
create trigger bead_positions_check before insert or update on public.bead_positions for each row execute function public.km_check_bead();
-- 108 顆珠位不可增刪
create or replace function public.km_no_bead_rows() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('km.loading', true), '') = 'on' and tg_op = 'INSERT' then return new; end if;
  raise exception 'bead_positions_fixed: 108 顆珠位固定，不可新增或刪除' using errcode = '42501';
end $$;
create trigger bead_positions_fixed before insert or delete on public.bead_positions for each row execute function public.km_no_bead_rows();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.member_invites enable row level security;
alter table public.categories enable row level security;
alter table public.terms enable row level security;
alter table public.term_categories enable row level security;
alter table public.bead_positions enable row level security;
alter table public.chapters enable row level security;
alter table public.sections enable row level security;
alter table public.term_chapters enable row level security;
alter table public.extras enable row level security;
alter table public.site_settings enable row level security;
alter table public.content_revisions enable row level security;
alter table public.audit_logs enable row level security;

-- 訪客與一般登入者對草稿沒有任何權限；只開放必要的讀取
revoke all on all tables in schema public from anon, authenticated;
grant select on public.content_revisions to anon, authenticated;
grant select on public.profiles, public.categories, public.terms, public.term_categories, public.bead_positions,
  public.chapters, public.sections, public.term_chapters, public.extras, public.site_settings, public.audit_logs, public.member_invites to authenticated;
grant update on public.terms, public.chapters, public.sections, public.bead_positions, public.categories, public.site_settings, public.extras to authenticated;

create policy "published revisions are public" on public.content_revisions for select to anon, authenticated using (kind = 'publish');
create policy "editors read backups" on public.content_revisions for select to authenticated using (public.is_editor());

create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_owner());
create policy "owner reads invites" on public.member_invites for select to authenticated using (public.is_owner());
create policy "editors read audit" on public.audit_logs for select to authenticated using (public.is_editor());

do $$
declare t text;
begin
  foreach t in array array['categories', 'terms', 'term_categories', 'bead_positions', 'chapters', 'sections', 'term_chapters', 'extras', 'site_settings'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_editor())', 'editors read ' || t, t);
  end loop;
  -- 直接更新（不經函式）時：名相、章節、珠位為 Editor 可改；分類與網站設定僅 Owner
  foreach t in array array['terms', 'chapters', 'sections', 'bead_positions', 'extras'] loop
    execute format('create policy %I on public.%I for update to authenticated using (public.is_editor()) with check (public.is_editor())', 'editors update ' || t, t);
  end loop;
  foreach t in array array['categories', 'site_settings'] loop
    execute format('create policy %I on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', 'owner updates ' || t, t);
  end loop;
end $$;

-- ---------- 由草稿組出網站用的完整內容（與 data/content.js 的 KM_DATA 相同格式） ----------
create or replace function public.km_build_content() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'site', (select value from site_settings where key = 'site'),
    'quote', (select value #>> '{}' from site_settings where key = 'quote'),
    'parts', (select value from site_settings where key = 'parts'),
    'zones', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'spacerTitle', c.spacer_title, 'spacerName', c.spacer_name,
                'summary', c.summary, 'core', c.core) order by c.sort), '[]') from categories c),
    'terms', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'name', t.name, 'group', pc.group_name,
                'show', (select jsonb_agg(c2.group_name order by tc.sort, c2.sort) from term_categories tc join categories c2 on c2.id = tc.category_id where tc.term_id = t.id),
                'slot', b.n,
                'refs', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind', r.kind, 'text', r.label, 'ch', r.chapter_id, 'sec', r.section_id)) order by r.sort), '[]')
                         from term_chapters r where r.term_id = t.id),
                'notes', to_jsonb(t.notes), 'body', t.body, 'explanation', t.explanation, 'image', t.image, 'imageCaption', t.image_caption)
              order by pc.sort, b.n nulls last, t.id), '[]')
              from terms t join categories pc on pc.id = t.primary_category left join bead_positions b on b.term_id = t.id
              where not t.archived),
    'chapters', (select coalesce(jsonb_agg(jsonb_build_object('id', ch.id, 'no', ch.no, 'title', ch.title, 'vols', to_jsonb(ch.vols),
                  'sections', (select coalesce(jsonb_agg(
                      jsonb_build_object('id', s.id, 'no', s.no, 'title', s.title, 'page', s.page, 'vol', s.vol, 'body', s.body, 'explanation', s.explanation,
                        'image', s.image, 'imageCaption', s.image_caption)
                      || case when exists (select 1 from sections i where i.parent_id = s.id) then jsonb_build_object('items',
                           (select jsonb_agg(jsonb_build_object('id', i.id, 'no', i.no, 'title', i.title, 'page', i.page, 'vol', i.vol, 'body', i.body,
                              'explanation', i.explanation, 'image', i.image, 'imageCaption', i.image_caption) order by i.sort) from sections i where i.parent_id = s.id))
                         else '{}'::jsonb end
                      order by s.sort), '[]') from sections s where s.chapter_id = ch.id and s.parent_id is null),
                  'body', ch.body, 'explanation', ch.explanation, 'image', ch.image, 'imageCaption', ch.image_caption) order by ch.no), '[]') from chapters ch),
    'extras', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e.id, 'title', e.title, 'vol', e.vol, 'page', e.page)) order by e.sort), '[]') from extras e)
  )
$$;

-- 發布前檢查：108 顆、4 顆隔珠、名相珠位唯一且分類一致、主分類列在顯示分類中
create or replace function public.km_validate() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare probs text[] := '{}'; c int;
begin
  select count(*) into c from bead_positions; if c <> 108 then probs := probs || ('珠位數為 ' || c || '，應為 108'); end if;
  select count(*) into c from bead_positions where kind = 'spacer'; if c <> 4 then probs := probs || ('隔珠數為 ' || c || '，應為 4'); end if;
  select count(*) into c from bead_positions b join terms t on t.id = b.term_id where t.primary_category <> b.category_id;
  if c > 0 then probs := probs || (c || ' 個名相的珠位與主分類不符'); end if;
  select count(*) into c from terms t where not archived and not exists (select 1 from term_categories tc where tc.term_id = t.id and tc.category_id = t.primary_category);
  if c > 0 then probs := probs || (c || ' 個名相的顯示分類未包含主分類'); end if;
  return to_jsonb(probs);
end $$;

-- ---------- 後台讀取（需 Editor） ----------
create or replace function public.admin_load() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'me', (select jsonb_build_object('id', id, 'email', email, 'role', role) from profiles where id = auth.uid()),
    'categories', (select jsonb_agg(to_jsonb(c) order by c.sort) from categories c),
    'terms', (select jsonb_agg(to_jsonb(t) || jsonb_build_object(
                'slot', (select n from bead_positions b where b.term_id = t.id),
                'show', (select jsonb_agg(category_id order by sort) from term_categories tc where tc.term_id = t.id),
                'refs', (select coalesce(jsonb_agg(jsonb_build_object('kind', r.kind, 'label', r.label, 'chapter_id', r.chapter_id, 'section_id', r.section_id) order by r.sort), '[]') from term_chapters r where r.term_id = t.id))
              order by t.primary_category, t.id) from terms t),
    'beads', (select jsonb_agg(to_jsonb(b) order by b.n) from bead_positions b),
    'chapters', (select jsonb_agg(to_jsonb(c) order by c.no) from chapters c),
    'sections', (select jsonb_agg(to_jsonb(s) order by s.chapter_id, s.sort) from sections s),
    'extras', (select coalesce(jsonb_agg(to_jsonb(e) order by e.sort), '[]') from extras e),
    'settings', (select jsonb_object_agg(key, jsonb_build_object('value', value, 'version', version)) from site_settings),
    'problems', public.km_validate()
  );
end $$;

create or replace function public.preview_content() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.km_build_content();
end $$;

create or replace function public.list_revisions(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'note', note, 'by', created_by_email, 'at', created_at, 'restored_from', restored_from) order by id desc), '[]')
          from (select * from content_revisions order by id desc limit least(greatest(p_limit, 1), 500)) r);
end $$;

create or replace function public.get_revision(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return (select content from content_revisions where id = p_id);
end $$;

create or replace function public.list_audit(p_limit int default 200, p_table text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc), '[]') from
          (select * from audit_logs where p_table is null or table_name = p_table order by id desc limit least(greatest(p_limit, 1), 1000)) a);
end $$;

-- ---------- 名相儲存（草稿）：名稱、分類、跨類、珠位、內文、章節對應一次寫入；版本不符即拒絕 ----------
create or replace function public.save_term(p jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tid text := p->>'id'; cur public.terms; newslot int := nullif(p->>'slot', '')::int; cat text := p->>'primary_category'; i int := 0; r jsonb; c text;
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into cur from terms where id = tid for update;
  if not found then raise exception 'not_found: %', tid using errcode = 'P0002'; end if;
  if cur.version <> p_expected_version then
    raise exception 'version_conflict: 名相 % 已被其他人修改（目前版本 %，你的版本 %）', tid, cur.version, p_expected_version using errcode = '40001';
  end if;
  update terms set name = btrim(p->>'name'), primary_category = cat, body = coalesce(p->>'body', ''), explanation = coalesce(p->>'explanation', ''),
    image = coalesce(p->>'image', ''), image_caption = coalesce(p->>'image_caption', ''),
    notes = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'notes', '[]')) x where btrim(x) <> ''), '{}'),
    version = cur.version + 1 where id = tid;
  -- 顯示分類：主分類一定在第一位
  delete from term_categories where term_id = tid;
  insert into term_categories (term_id, category_id, sort) values (tid, cat, 0);
  for c in select value from jsonb_array_elements_text(coalesce(p->'show', '[]')) loop
    if c <> cat then i := i + 1; insert into term_categories (term_id, category_id, sort) values (tid, c, i) on conflict do nothing; end if;
  end loop;
  -- 章節對應
  if p ? 'refs' then
    delete from term_chapters where term_id = tid; i := 0;
    for r in select value from jsonb_array_elements(p->'refs') loop
      insert into term_chapters (term_id, chapter_id, section_id, kind, label, sort)
      values (tid, nullif(r->>'chapter_id', ''), nullif(r->>'section_id', ''), coalesce(r->>'kind', ''), coalesce(r->>'label', ''), i);
      i := i + 1;
    end loop;
  end if;
  -- 珠位：先釋放舊珠位，再配置新珠位（同一顆珠已有其他名相時拒絕，避免誤蓋）
  if newslot is distinct from (select n from bead_positions where term_id = tid) then
    if newslot is not null and exists (select 1 from bead_positions where n = newslot and term_id is not null and term_id <> tid) then
      raise exception 'bead_occupied: 珠 % 已配置其他名相，請先移開', newslot using errcode = '23505';
    end if;
    update bead_positions set term_id = null, version = version + 1 where term_id = tid;
    if newslot is not null then update bead_positions set term_id = tid, version = version + 1 where n = newslot; end if;
  end if;
  if exists (select 1 from bead_positions where term_id = tid and category_id <> cat) then
    raise exception 'bead_category_mismatch: 名相的主分類與所在珠位的分類不符，請改選同分類的珠位' using errcode = '23514';
  end if;
  return jsonb_build_object('id', tid, 'version', cur.version + 1);
end $$;

create or replace function public.create_term(p_name text, p_category text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tid text; k int;
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select count(*) + 1 into k from terms where primary_category = p_category;
  tid := 'term-' || p_category || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
  insert into terms (id, name, primary_category) values (tid, btrim(p_name), p_category);
  insert into term_categories (term_id, category_id, sort) values (tid, p_category, 0);
  return jsonb_build_object('id', tid, 'version', 1);
end $$;

-- 封存：保留資料、釋放珠位（108 顆結構不變）；取消封存不自動回到原珠位
create or replace function public.archive_term(p_id text, p_expected_version int, p_archived boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select version into v from terms where id = p_id for update;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v <> p_expected_version then raise exception 'version_conflict: 名相已被其他人修改' using errcode = '40001'; end if;
  if p_archived then update bead_positions set term_id = null, version = version + 1 where term_id = p_id; end if;
  update terms set archived = p_archived, version = v + 1 where id = p_id;
  return jsonb_build_object('id', p_id, 'version', v + 1);
end $$;

-- 永久刪除（僅 Owner）：一併刪除其章節對應與分類關係，珠位釋放
create or replace function public.delete_term(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not_authorized' using errcode = '42501'; end if;
  update bead_positions set term_id = null, version = version + 1 where term_id = p_id;
  delete from terms where id = p_id;
end $$;

create or replace function public.save_chapter(p jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select version into v from chapters where id = p->>'id' for update;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v <> p_expected_version then raise exception 'version_conflict: 章已被其他人修改（目前版本 %）', v using errcode = '40001'; end if;
  update chapters set title = btrim(p->>'title'), body = coalesce(p->>'body', ''), explanation = coalesce(p->>'explanation', ''),
    image = coalesce(p->>'image', ''), image_caption = coalesce(p->>'image_caption', ''), version = v + 1 where id = p->>'id';
  return jsonb_build_object('id', p->>'id', 'version', v + 1);
end $$;

create or replace function public.save_section(p jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int; sid text := p->>'id';
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_expected_version = 0 then -- 新增節／目
    insert into sections (id, chapter_id, parent_id, no, title, page, vol, sort, body, explanation)
    values (sid, p->>'chapter_id', nullif(p->>'parent_id', ''), coalesce(p->>'no', ''), btrim(p->>'title'), coalesce(p->>'page', ''), nullif(p->>'vol', '')::int,
      coalesce(nullif(p->>'sort', '')::int, (select coalesce(max(sort), 0) + 1 from sections where chapter_id = p->>'chapter_id')), coalesce(p->>'body', ''), coalesce(p->>'explanation', ''));
    return jsonb_build_object('id', sid, 'version', 1);
  end if;
  select version into v from sections where id = sid for update;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v <> p_expected_version then raise exception 'version_conflict: 節已被其他人修改（目前版本 %）', v using errcode = '40001'; end if;
  update sections set no = coalesce(p->>'no', no), title = btrim(p->>'title'), page = coalesce(p->>'page', ''), vol = nullif(p->>'vol', '')::int,
    body = coalesce(p->>'body', ''), explanation = coalesce(p->>'explanation', ''), image = coalesce(p->>'image', ''), image_caption = coalesce(p->>'image_caption', ''),
    version = v + 1 where id = sid;
  return jsonb_build_object('id', sid, 'version', v + 1);
end $$;

create or replace function public.delete_section(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from sections where id = p_id;
end $$;

-- 分類與網站設定（僅 Owner）
create or replace function public.save_category(p jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.is_owner() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select version into v from categories where id = p->>'id' for update;
  if v <> p_expected_version then raise exception 'version_conflict: 分類已被其他人修改' using errcode = '40001'; end if;
  update categories set name = btrim(p->>'name'), spacer_title = btrim(p->>'spacer_title'), summary = coalesce(p->>'summary', ''), core = coalesce(p->>'core', ''), version = v + 1
  where id = p->>'id';
  return jsonb_build_object('id', p->>'id', 'version', v + 1);
end $$;

create or replace function public.save_setting(p_key text, p_value jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.is_owner() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select version into v from site_settings where key = p_key for update;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v <> p_expected_version then raise exception 'version_conflict: 設定已被其他人修改' using errcode = '40001'; end if;
  update site_settings set value = p_value, version = v + 1 where key = p_key;
  return jsonb_build_object('key', p_key, 'version', v + 1);
end $$;

-- ---------- 匯入完整內容（資料遷移與還原共用；不開放給前端直接呼叫） ----------
create or replace function public.km_load_content(c jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare z jsonb; t jsonb; ch jsonb; s jsonb; it jsonb; e jsonb; r jsonb; zi int := 0; i int; j int; cat text; bn int; g text;
  gm jsonb := '{"見":"jian","修":"xiu","行":"xing","果":"guo"}';
begin
  perform set_config('km.loading', 'on', true);
  -- 分類
  for z in select value from jsonb_array_elements(c->'zones') loop
    insert into categories (id, group_name, name, spacer_name, spacer_title, summary, core, sort)
    values (z->>'id', (array['見', '修', '行', '果'])[zi + 1], z->>'name', z->>'spacerName', z->>'spacerTitle', coalesce(z->>'summary', ''), coalesce(z->>'core', ''), zi)
    on conflict (id) do update set name = excluded.name, spacer_name = excluded.spacer_name, spacer_title = excluded.spacer_title, summary = excluded.summary, core = excluded.core;
    zi := zi + 1;
  end loop;
  -- 108 珠位（只在第一次建立；之後只清空配置）
  if (select count(*) from bead_positions) = 0 then
    for bn in 1..108 loop
      insert into bead_positions (n, kind, category_id) values (bn, case when bn % 27 = 0 then 'spacer' else 'bead' end,
        (array['jian', 'xiu', 'xing', 'guo'])[case when bn % 27 = 0 then ((bn / 27) % 4) + 1 else ((bn - 1) / 27) + 1 end]);
    end loop;
  end if;
  update bead_positions set term_id = null where term_id is not null;
  -- 網站設定
  insert into site_settings (key, value) values ('quote', to_jsonb(c->>'quote')) on conflict (key) do update set value = excluded.value;
  insert into site_settings (key, value) values ('parts', c->'parts') on conflict (key) do update set value = excluded.value;
  insert into site_settings (key, value) values ('site', coalesce(c->'site', '{"title":"以數珠為喻","subtitle":"《狂密與真密》章節導覽"}'::jsonb)) on conflict (key) do update set value = excluded.value;
  -- 章、節、目
  update terms set archived = true where id not in (select value->>'id' from jsonb_array_elements(c->'terms'));
  delete from sections where chapter_id in (select value->>'id' from jsonb_array_elements(c->'chapters'))
    and id not in (select s2->>'id' from jsonb_array_elements(c->'chapters') ch2, jsonb_array_elements(ch2->'sections') s2
                   union select it2->>'id' from jsonb_array_elements(c->'chapters') ch3, jsonb_array_elements(ch3->'sections') s3, jsonb_array_elements(coalesce(s3->'items', '[]')) it2);
  for ch in select value from jsonb_array_elements(c->'chapters') loop
    insert into chapters (id, no, title, vols, body, explanation, image, image_caption)
    values (ch->>'id', (ch->>'no')::int, ch->>'title', array(select jsonb_array_elements_text(ch->'vols'))::int[], coalesce(ch->>'body', ''), coalesce(ch->>'explanation', ''), coalesce(ch->>'image', ''), coalesce(ch->>'imageCaption', ''))
    on conflict (id) do update set no = excluded.no, title = excluded.title, vols = excluded.vols, body = excluded.body, explanation = excluded.explanation, image = excluded.image, image_caption = excluded.image_caption;
    i := 0;
    for s in select value from jsonb_array_elements(ch->'sections') loop
      i := i + 1;
      insert into sections (id, chapter_id, parent_id, no, title, page, vol, sort, body, explanation, image, image_caption)
      values (s->>'id', ch->>'id', null, s->>'no', s->>'title', coalesce(s->>'page', ''), nullif(s->>'vol', '')::int, i * 100, coalesce(s->>'body', ''), coalesce(s->>'explanation', ''), coalesce(s->>'image', ''), coalesce(s->>'imageCaption', ''))
      on conflict (id) do update set chapter_id = excluded.chapter_id, parent_id = null, no = excluded.no, title = excluded.title, page = excluded.page, vol = excluded.vol, sort = excluded.sort,
        body = excluded.body, explanation = excluded.explanation, image = excluded.image, image_caption = excluded.image_caption;
      j := 0;
      for it in select value from jsonb_array_elements(coalesce(s->'items', '[]')) loop
        j := j + 1;
        insert into sections (id, chapter_id, parent_id, no, title, page, vol, sort, body, explanation, image, image_caption)
        values (it->>'id', ch->>'id', s->>'id', it->>'no', it->>'title', coalesce(it->>'page', ''), nullif(it->>'vol', '')::int, i * 100 + j, coalesce(it->>'body', ''), coalesce(it->>'explanation', ''), coalesce(it->>'image', ''), coalesce(it->>'imageCaption', ''))
        on conflict (id) do update set chapter_id = excluded.chapter_id, parent_id = excluded.parent_id, no = excluded.no, title = excluded.title, page = excluded.page, vol = excluded.vol, sort = excluded.sort,
          body = excluded.body, explanation = excluded.explanation, image = excluded.image, image_caption = excluded.image_caption;
      end loop;
    end loop;
  end loop;
  -- 其他目次入口
  delete from extras where id not in (select value->>'id' from jsonb_array_elements(c->'extras'));
  i := 0;
  for e in select value from jsonb_array_elements(c->'extras') loop
    i := i + 1;
    insert into extras (id, title, vol, page, sort) values (e->>'id', e->>'title', nullif(e->>'vol', '')::int, coalesce(e->>'page', ''), i)
    on conflict (id) do update set title = excluded.title, vol = excluded.vol, page = excluded.page, sort = excluded.sort;
  end loop;
  -- 名相、跨分類、章節對應、珠位
  for t in select value from jsonb_array_elements(c->'terms') loop
    cat := gm->>(t->>'group');
    insert into terms (id, name, primary_category, body, explanation, image, image_caption, notes, archived)
    values (t->>'id', t->>'name', cat, coalesce(t->>'body', ''), coalesce(t->>'explanation', ''), coalesce(t->>'image', ''), coalesce(t->>'imageCaption', ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(t->'notes', '[]'))), '{}'), false)
    on conflict (id) do update set name = excluded.name, primary_category = excluded.primary_category, body = excluded.body, explanation = excluded.explanation,
      image = excluded.image, image_caption = excluded.image_caption, notes = excluded.notes, archived = false;
    delete from term_categories where term_id = t->>'id';
    i := 0;
    for g in select value from jsonb_array_elements_text(coalesce(t->'show', jsonb_build_array(t->>'group'))) loop
      insert into term_categories (term_id, category_id, sort) values (t->>'id', gm->>g, case when gm->>g = cat then 0 else i + 1 end) on conflict do nothing;
      i := i + 1;
    end loop;
    insert into term_categories (term_id, category_id, sort) values (t->>'id', cat, 0) on conflict do nothing;
    delete from term_chapters where term_id = t->>'id';
    i := 0;
    for r in select value from jsonb_array_elements(coalesce(t->'refs', '[]')) loop
      insert into term_chapters (term_id, chapter_id, section_id, kind, label, sort)
      values (t->>'id', nullif(r->>'ch', ''), case when exists (select 1 from sections where id = r->>'sec') then r->>'sec' end, coalesce(r->>'kind', ''), coalesce(r->>'text', ''), i);
      i := i + 1;
    end loop;
    if nullif(t->>'slot', '') is not null then update bead_positions set term_id = t->>'id' where n = (t->>'slot')::int; end if;
  end loop;
  perform set_config('km.loading', 'off', true);
end $$;

-- ---------- 發布、還原（僅 Owner） ----------
create or replace function public.publish(p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare probs jsonb; rid bigint;
begin
  if not public.is_owner() then raise exception 'not_authorized: 只有 Owner 可以發布' using errcode = '42501'; end if;
  probs := public.km_validate();
  if jsonb_array_length(probs) > 0 then raise exception 'validation_failed: %', probs::text using errcode = '23514'; end if;
  insert into content_revisions (kind, content, note, created_by, created_by_email)
  values ('publish', public.km_build_content(), coalesce(p_note, ''), auth.uid(), public.my_email()) returning id into rid;
  insert into audit_logs (user_id, user_email, table_name, row_key, action) values (auth.uid(), public.my_email(), 'content_revisions', rid::text, 'publish');
  return jsonb_build_object('id', rid);
end $$;

-- 還原：先把目前草稿備份為 backup，再把指定版本載入草稿；需再按「發布」才會公開
create or replace function public.restore_revision(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare src jsonb; bid bigint;
begin
  if not public.is_owner() then raise exception 'not_authorized: 只有 Owner 可以還原' using errcode = '42501'; end if;
  select content into src from content_revisions where id = p_id;
  if src is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into content_revisions (kind, content, note, created_by, created_by_email)
  values ('backup', public.km_build_content(), '還原前自動備份（還原版本 #' || p_id || '）', auth.uid(), public.my_email()) returning id into bid;
  perform public.km_load_content(src);
  insert into audit_logs (user_id, user_email, table_name, row_key, action, new_row) values (auth.uid(), public.my_email(), 'content_revisions', p_id::text, 'restore_to_draft', jsonb_build_object('backup', bid));
  return jsonb_build_object('restored', p_id, 'backup', bid);
end $$;

-- ---------- 成員管理（僅 Owner） ----------
create or replace function public.list_members() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'profiles', (select coalesce(jsonb_agg(jsonb_build_object('email', email, 'role', role, 'created_at', created_at) order by email), '[]') from profiles),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('email', email, 'role', role, 'created_at', created_at) order by email), '[]') from member_invites));
end $$;

create or replace function public.set_member_role(p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(p_email));
begin
  if not public.is_owner() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_role not in ('owner', 'editor', 'none') then raise exception 'bad_role' using errcode = '22023'; end if;
  if e = public.my_email() and p_role <> 'owner' then raise exception 'cannot_demote_self: 不能撤銷自己的 Owner 權限' using errcode = '42501'; end if;
  insert into member_invites (email, role, invited_by) values (e, p_role, auth.uid()) on conflict (email) do update set role = excluded.role, invited_by = excluded.invited_by;
  update profiles set role = p_role, updated_at = now() where email = e;
  return jsonb_build_object('email', e, 'role', p_role);
end $$;

-- ---------- 函式執行權限：只開放給已登入者（函式內再檢查角色）；內部函式不對外 ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_role(), public.is_editor(), public.is_owner(), public.my_email() to authenticated;
grant execute on function public.admin_load(), public.preview_content(), public.list_revisions(int), public.get_revision(bigint), public.list_audit(int, text),
  public.save_term(jsonb, int), public.create_term(text, text), public.archive_term(text, int, boolean), public.delete_term(text),
  public.save_chapter(jsonb, int), public.save_section(jsonb, int), public.delete_section(text), public.save_category(jsonb, int), public.save_setting(text, jsonb, int),
  public.publish(text), public.restore_revision(bigint), public.list_members(), public.set_member_role(text, text) to authenticated;
-- 觸發器與 RLS 內部使用的函式需可被執行（不經由 API 暴露時仍需執行權）
grant execute on function public.km_touch(), public.km_audit(), public.km_check_bead(), public.km_no_bead_rows() to authenticated;
