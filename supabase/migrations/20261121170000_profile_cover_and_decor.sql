-- 个人封面 + 装扮系统（底栏 / 卡片主题 / 创意工坊）
-- 设计原则：
-- 1) 复用 profiles 承载个人资料，不新建账号体系；
-- 2) 装扮主题是一份可版本化的 JSON 配置，网页与 Android 读同一份；
-- 3) 主题分「已发布版本」与「待审版本」两份配置：更新审核期间，旧版本继续可用；
-- 4) 底栏 / 卡片当前应用状态属于账号设置（decor_settings），随账号同步。

-- ---------- 个人封面 ----------
alter table public.profiles add column if not exists cover_url text;
-- 封面取景参数：原图比例、默认收起窗口的对焦点与缩放、展开高度。
alter table public.profiles add column if not exists cover_meta jsonb not null default '{}'::jsonb;

comment on column public.profiles.cover_url is '个人封面原图地址（保留完整画面，供展开与完整查看）';
comment on column public.profiles.cover_meta is '封面取景：{focusX,focusY,zoom,ratio,collapsedHeight,fullWidth,fullHeight}';

-- ---------- 点赞时间 ----------
-- 他人主页新增「点赞」标签，需要按点赞先后排序（原来只有 liked 布尔值，没有时间）。
alter table public.user_interactions add column if not exists liked_at timestamptz;
update public.user_interactions ui
   set liked_at = p.created_at
  from public.posts p
 where p.id = ui.post_id and ui.liked and ui.liked_at is null;

create or replace function public.touch_liked_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.liked_at := case when new.liked then now() else null end;
  elsif new.liked and not old.liked then
    new.liked_at := now();
  elsif not new.liked then
    new.liked_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists user_interactions_liked_at on public.user_interactions;
create trigger user_interactions_liked_at
before insert or update of liked on public.user_interactions
for each row execute function public.touch_liked_at();

-- ---------- 装扮主题 ----------
create table if not exists public.decor_themes (
  id uuid primary key default gen_random_uuid(),
  slug text,
  title text not null,
  description text not null default '',
  -- official：官方预设（由后台维护，不进审核队列）；community：玩家投稿
  origin text not null default 'community',
  -- bundle 同时包含底栏与卡片；bottom / card 为单件主题
  kind text not null default 'bundle',
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  status text not null default 'pending',
  version integer not null default 1,
  tags text[] not null default '{}'::text[],
  -- config 为作者最新提交（待审）；published_config 为当前线上生效版本
  config jsonb not null default '{}'::jsonb,
  published_config jsonb,
  review_note text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.decor_themes drop constraint if exists decor_themes_origin_check;
alter table public.decor_themes add constraint decor_themes_origin_check check (origin in ('official', 'community'));
alter table public.decor_themes drop constraint if exists decor_themes_kind_check;
alter table public.decor_themes add constraint decor_themes_kind_check check (kind in ('bundle', 'bottom', 'card'));
alter table public.decor_themes drop constraint if exists decor_themes_status_check;
alter table public.decor_themes add constraint decor_themes_status_check check (status in ('pending', 'approved', 'rejected', 'delisted'));

-- slug 是官方预设的稳定标识。Postgres 的唯一索引默认把 NULL 视为互不相同，
-- 因此作者投稿（slug 为空）不会互相冲突，同时 ON CONFLICT (slug) 可以正常推断。
drop index if exists public.decor_themes_slug_idx;
create unique index if not exists decor_themes_slug_idx on public.decor_themes(slug);
create index if not exists decor_themes_list_idx on public.decor_themes(status, origin, updated_at desc);
create index if not exists decor_themes_author_idx on public.decor_themes(author_id, updated_at desc);

alter table public.decor_themes enable row level security;

drop policy if exists decor_themes_read on public.decor_themes;
create policy decor_themes_read on public.decor_themes for select
  using (status = 'approved' or author_id = (select auth.uid()));

drop policy if exists decor_themes_insert on public.decor_themes;
create policy decor_themes_insert on public.decor_themes for insert to authenticated
  with check (author_id = (select auth.uid()) and origin = 'community');

drop policy if exists decor_themes_update on public.decor_themes;
create policy decor_themes_update on public.decor_themes for update to authenticated
  using (author_id = (select auth.uid()) and origin = 'community')
  with check (author_id = (select auth.uid()));

grant select on public.decor_themes to anon, authenticated;
grant insert, update on public.decor_themes to authenticated;

-- ---------- 用户当前装扮（账号设置） ----------
create table if not exists public.decor_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- 用户自定义底栏：颜色、透明度、图标资源与取景
  bottom_bar jsonb,
  -- 用户自定义卡片：卡背、内容面、按钮
  card jsonb,
  -- 当前应用的整套主题（若来自主题则记录来源，便于统计使用人数）
  bottom_bar_theme_id uuid references public.decor_themes(id) on delete set null,
  card_theme_id uuid references public.decor_themes(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.decor_settings enable row level security;
drop policy if exists decor_settings_read on public.decor_settings;
create policy decor_settings_read on public.decor_settings for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists decor_settings_write on public.decor_settings;
create policy decor_settings_write on public.decor_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists decor_settings_update on public.decor_settings;
create policy decor_settings_update on public.decor_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists decor_settings_delete on public.decor_settings;
create policy decor_settings_delete on public.decor_settings for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.decor_settings to authenticated;

-- ---------- 收藏 ----------
create table if not exists public.decor_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  theme_id uuid not null references public.decor_themes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, theme_id)
);
create index if not exists decor_favorites_theme_idx on public.decor_favorites(theme_id);

alter table public.decor_favorites enable row level security;
drop policy if exists decor_favorites_read on public.decor_favorites;
create policy decor_favorites_read on public.decor_favorites for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists decor_favorites_write on public.decor_favorites;
create policy decor_favorites_write on public.decor_favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists decor_favorites_delete on public.decor_favorites;
create policy decor_favorites_delete on public.decor_favorites for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, delete on public.decor_favorites to authenticated;

-- ---------- 存储桶 ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('heika-decor', 'heika-decor', true, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists decor_object_insert on storage.objects;
create policy decor_object_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'heika-decor' and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists decor_object_delete on storage.objects;
create policy decor_object_delete on storage.objects for delete to authenticated
  using (bucket_id = 'heika-decor' and split_part(name, '/', 1) = (select auth.uid())::text);

-- ---------- 官方预设登记 ----------
-- 配置本体随代码发布（lib/decor/official.ts），这里只登记身份与上架状态，
-- 以便「使用人数 / 收藏」有真实统计来源，也避免官方预设被误删。
insert into public.decor_themes (slug, title, description, origin, kind, status, version, tags, config, published_config, published_at)
values
  ('obsidian-native', '黑曜原生', '黑卡原生质感：深色玻璃底栏与黑曜卡背，克制、耐看。', 'official', 'bundle', 'approved', 1, array['深色','极简','原生'], '{"preset":"obsidian"}', '{"preset":"obsidian"}', now()),
  ('letter-from-hills', '山野来信', '苔绿与米白的山野气息，像一封从林间寄来的信。', 'official', 'bundle', 'approved', 1, array['自然','绿色','治愈'], '{"preset":"hills"}', '{"preset":"hills"}', now()),
  ('silver-archive', '银白档案', '冷银灰与档案纸张，适合记录与整理。', 'official', 'bundle', 'approved', 1, array['浅色','档案','理性'], '{"preset":"silver"}', '{"preset":"silver"}', now()),
  ('mist-pine', '雾松底栏', '雾面松绿底栏，安静地待在屏幕底部。', 'official', 'bottom', 'approved', 1, array['底栏','绿色','雾面'], '{"preset":"mist"}', '{"preset":"mist"}', now()),
  ('pixel-desk', '像素工作台', '八位机像素图标与硬边卡片，复古但不吵闹。', 'official', 'bundle', 'approved', 1, array['像素','复古','图标'], '{"preset":"pixel"}', '{"preset":"pixel"}', now()),
  ('paper-notes', '手绘便签', '便签纸质感与手写线条，轻轻贴在主页上。', 'official', 'bundle', 'approved', 1, array['手绘','便签','暖色'], '{"preset":"paper"}', '{"preset":"paper"}', now())
on conflict (slug) do nothing;
