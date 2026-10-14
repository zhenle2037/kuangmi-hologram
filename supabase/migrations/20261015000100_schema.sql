-- 《狂密與真密》數珠網站：內容管理資料庫（Supabase / PostgreSQL）
-- 草稿：以下各內容資料表本身即「草稿工作區」，只有 Owner／Editor 能讀寫。
-- 正式：content_revisions(kind='publish') 保存每次發布的完整內容快照；訪客只能讀這些已發布快照。
-- 108 顆珠位固定為 bead_positions 的 108 列，任何角色都不能新增或刪除列。

-- ---------- 帳號與角色 ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'none' check (role in ('owner', 'editor', 'none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_invites (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  role text not null check (role in ('owner', 'editor', 'none')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 內容（草稿工作區） ----------
create table public.categories (
  id text primary key check (id in ('jian', 'xiu', 'xing', 'guo')),
  group_name text not null unique check (group_name in ('見', '修', '行', '果')),
  name text not null,
  spacer_name text not null,
  spacer_title text not null,
  summary text not null default '',
  core text not null default '',
  sort int not null unique,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.terms (
  id text primary key check (id ~ '^[^[:space:]<>"''&]{1,80}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  primary_category text not null references public.categories(id),
  body text not null default '',
  explanation text not null default '',
  image text not null default '' check (image = '' or image ~ '^(https://|assets/)'),
  image_caption text not null default '',
  notes text[] not null default '{}',
  archived boolean not null default false,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- 跨分類顯示（多對多）；主分類也列在其中，sort=0 為主分類
create table public.term_categories (
  term_id text not null references public.terms(id) on delete cascade,
  category_id text not null references public.categories(id),
  sort int not null default 0,
  primary key (term_id, category_id)
);

-- 108 顆實際珠位：kind=spacer 的 4 顆不能放名相；一個名相最多佔一顆（term_id unique）
create table public.bead_positions (
  n int primary key check (n between 1 and 108),
  kind text not null check (kind in ('bead', 'spacer')),
  category_id text not null references public.categories(id),
  term_id text unique references public.terms(id) on delete set null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint spacer_has_no_term check (kind = 'bead' or term_id is null),
  constraint spacer_positions check ((kind = 'spacer') = (n in (27, 54, 81, 108)))
);

create table public.chapters (
  id text primary key,
  no int not null unique check (no between 1 and 99),
  title text not null check (length(btrim(title)) > 0),
  vols int[] not null default '{}',
  body text not null default '',
  explanation text not null default '',
  image text not null default '' check (image = '' or image ~ '^(https://|assets/)'),
  image_caption text not null default '',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- 節與目（parent_id 不為空者為「目」）
create table public.sections (
  id text primary key,
  chapter_id text not null references public.chapters(id) on delete cascade,
  parent_id text references public.sections(id) on delete cascade,
  no text not null,
  title text not null check (length(btrim(title)) > 0),
  page text not null default '',
  vol int,
  sort int not null,
  body text not null default '',
  explanation text not null default '',
  image text not null default '' check (image = '' or image ~ '^(https://|assets/)'),
  image_caption text not null default '',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index sections_chapter_idx on public.sections(chapter_id, sort);

-- 名相與章節的對應（多對多，含來源標記）
create table public.term_chapters (
  id bigint generated always as identity primary key,
  term_id text not null references public.terms(id) on delete cascade,
  chapter_id text references public.chapters(id) on delete set null,
  section_id text references public.sections(id) on delete set null,
  kind text not null check (kind in ('直接', '關聯', '僅章題', '')),
  label text not null,
  sort int not null default 0
);
create index term_chapters_term_idx on public.term_chapters(term_id, sort);
create index term_chapters_section_idx on public.term_chapters(section_id);

create table public.extras (
  id text primary key,
  title text not null,
  vol int,
  page text not null default '',
  sort int not null default 0,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- 網站設定：site（標題、副標）、quote（導師引文）、parts（念珠部件譬喻）
create table public.site_settings (
  key text primary key check (key in ('site', 'quote', 'parts')),
  value jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------- 版本與紀錄 ----------
-- kind=publish：正式發布快照（訪客可讀最新一筆）；kind=backup：還原前自動備份的草稿
create table public.content_revisions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('publish', 'backup')),
  content jsonb not null,
  note text not null default '',
  restored_from bigint references public.content_revisions(id),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);
create index content_revisions_kind_idx on public.content_revisions(kind, id desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  table_name text not null,
  row_key text,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
create index audit_logs_at_idx on public.audit_logs(at desc);
create index audit_logs_row_idx on public.audit_logs(table_name, row_key);
