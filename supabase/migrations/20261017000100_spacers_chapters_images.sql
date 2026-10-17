-- 第二次更新：隔珠可編輯內容、新增章與目、圖片上傳
-- 在 Supabase 的 SQL Editor 貼上整份內容並執行一次即可；重複執行也安全。

-- ---------- 隔珠內容（與名相相同：原書正文、整理說明、圖片） ----------
alter table public.categories add column if not exists spacer_body text not null default '';
alter table public.categories add column if not exists spacer_explanation text not null default '';
alter table public.categories add column if not exists spacer_image text not null default '';
alter table public.categories add column if not exists spacer_image_caption text not null default '';
do $$ begin
  alter table public.categories add constraint categories_spacer_image_check check (spacer_image = '' or spacer_image ~ '^(https://|assets/)');
exception when duplicate_object then null; end $$;

create or replace function public.km_build_content() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'site', (select value from site_settings where key = 'site'),
    'quote', (select value #>> '{}' from site_settings where key = 'quote'),
    'parts', (select value from site_settings where key = 'parts'),
    'zones', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'spacerTitle', c.spacer_title, 'spacerName', c.spacer_name,
                'summary', c.summary, 'core', c.core, 'spacerBody', c.spacer_body, 'spacerExplanation', c.spacer_explanation, 'spacerImage', c.spacer_image, 'spacerImageCaption', c.spacer_image_caption) order by c.sort), '[]') from categories c),
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

create or replace function public.km_load_content(c jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare z jsonb; t jsonb; ch jsonb; s jsonb; it jsonb; e jsonb; r jsonb; zi int := 0; i int; j int; cat text; bn int; g text;
  gm jsonb := '{"見":"jian","修":"xiu","行":"xing","果":"guo"}';
begin
  perform set_config('km.loading', 'on', true);
  -- 分類
  for z in select value from jsonb_array_elements(c->'zones') loop
    insert into categories (id, group_name, name, spacer_name, spacer_title, summary, core, sort, spacer_body, spacer_explanation, spacer_image, spacer_image_caption)
    values (z->>'id', (array['見', '修', '行', '果'])[zi + 1], z->>'name', z->>'spacerName', z->>'spacerTitle', coalesce(z->>'summary', ''), coalesce(z->>'core', ''), zi,
      coalesce(z->>'spacerBody', ''), coalesce(z->>'spacerExplanation', ''), coalesce(z->>'spacerImage', ''), coalesce(z->>'spacerImageCaption', ''))
    on conflict (id) do update set name = excluded.name, spacer_name = excluded.spacer_name, spacer_title = excluded.spacer_title, summary = excluded.summary, core = excluded.core,
      spacer_body = excluded.spacer_body, spacer_explanation = excluded.spacer_explanation, spacer_image = excluded.spacer_image, spacer_image_caption = excluded.spacer_image_caption;
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
  delete from chapters where id not in (select value->>'id' from jsonb_array_elements(c->'chapters')); -- 還原到較早版本時，移除之後才新增的章（其節目一併刪除）
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

-- 隔珠（Owner／Editor 皆可編輯；分類名稱與分類說明仍由 Owner 在「分類與網站設定」修改）
create or replace function public.save_spacer(p jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select version into v from categories where id = p->>'id' for update;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v <> p_expected_version then raise exception 'version_conflict: 隔珠已被其他人修改（目前版本 %）', v using errcode = '40001'; end if;
  if length(btrim(coalesce(p->>'spacer_name', ''))) = 0 or length(btrim(coalesce(p->>'spacer_title', ''))) = 0 then raise exception 'validation_failed: 隔珠名稱與標題不可空白' using errcode = '23514'; end if;
  update categories set spacer_name = btrim(p->>'spacer_name'), spacer_title = btrim(p->>'spacer_title'),
    spacer_body = coalesce(p->>'spacer_body', ''), spacer_explanation = coalesce(p->>'spacer_explanation', ''),
    spacer_image = coalesce(btrim(p->>'spacer_image'), ''), spacer_image_caption = coalesce(p->>'spacer_image_caption', ''), version = v + 1
  where id = p->>'id';
  return jsonb_build_object('id', p->>'id', 'version', v + 1);
end $$;

-- 新增章（Owner／Editor）：章號預設接在最後
create or replace function public.create_chapter(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; cid text; vs int[];
begin
  if not public.is_editor() then raise exception 'not_authorized' using errcode = '42501'; end if;
  n := coalesce(nullif(p->>'no', '')::int, (select coalesce(max(no), 0) + 1 from chapters));
  if exists (select 1 from chapters where no = n) then raise exception 'validation_failed: 第 % 章已存在', n using errcode = '23505'; end if;
  if length(btrim(coalesce(p->>'title', ''))) = 0 then raise exception 'validation_failed: 章名不可空白' using errcode = '23514'; end if;
  cid := 'c' || lpad(n::text, 2, '0');
  while exists (select 1 from chapters where id = cid) loop cid := cid || 'x'; end loop;
  vs := coalesce(array(select jsonb_array_elements_text(coalesce(p->'vols', '[]')))::int[], '{}');
  insert into chapters (id, no, title, vols) values (cid, n, btrim(p->>'title'), vs);
  return jsonb_build_object('id', cid, 'no', n, 'version', 1);
end $$;

-- 刪除章（僅 Owner）：連同其節與目；名相對應到此章的連結會清空章節欄
create or replace function public.delete_chapter(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from chapters where id = p_id;
end $$;

revoke execute on function public.save_spacer(jsonb, int), public.create_chapter(jsonb), public.delete_chapter(text) from public, anon;
grant execute on function public.save_spacer(jsonb, int), public.create_chapter(jsonb), public.delete_chapter(text) to authenticated;
revoke execute on function public.km_build_content(), public.km_load_content(jsonb) from public, anon, authenticated;

-- ---------- 圖片上傳（Supabase Storage：公開讀取，只有 Owner／Editor 能上傳、覆蓋、刪除） ----------
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if; -- 測試環境沒有 Storage 時略過
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists km_images_insert on storage.objects';
  execute 'drop policy if exists km_images_update on storage.objects';
  execute 'drop policy if exists km_images_delete on storage.objects';
  execute $p$create policy km_images_insert on storage.objects for insert to authenticated with check (bucket_id = 'images' and public.is_editor())$p$;
  execute $p$create policy km_images_update on storage.objects for update to authenticated using (bucket_id = 'images' and public.is_editor())$p$;
  execute $p$create policy km_images_delete on storage.objects for delete to authenticated using (bucket_id = 'images' and public.is_editor())$p$;
end $$;
