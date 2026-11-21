-- 合集系统升级：在既有 post_series 上扩展，避免重复创建同功能实体。
-- 概念层级：频道 channel → 分类 category → 合集 collection(post_series) → 单篇作品 post。
-- 话题仍由 post_topics/interest_tags 独立承载，不复用为合集。

alter table public.post_series
  add column if not exists kind text not null default 'serial',
  add column if not exists cover_url text,
  add column if not exists channel text not null default 'community',
  add column if not exists category_id bigint references public.interest_tags(id) on delete set null,
  add column if not exists status text not null default 'ongoing',
  add column if not exists is_public boolean not null default true,
  add column if not exists review_status text not null default 'approved',
  add column if not exists review_note text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.post_series drop constraint if exists post_series_kind_check;
alter table public.post_series add constraint post_series_kind_check check (kind in ('serial', 'tutorial', 'resource'));
alter table public.post_series drop constraint if exists post_series_channel_check;
alter table public.post_series add constraint post_series_channel_check check (channel in ('community', 'ai'));
alter table public.post_series drop constraint if exists post_series_status_check;
alter table public.post_series add constraint post_series_status_check check (status in ('ongoing', 'completed'));
alter table public.post_series drop constraint if exists post_series_review_status_check;
alter table public.post_series add constraint post_series_review_status_check check (review_status in ('pending', 'approved', 'rejected'));

-- 章节顺序（同一合集内）。作品仍可独立存在：series_id / series_order 均为空时就是普通作品。
alter table public.posts add column if not exists series_order integer;
create index if not exists posts_series_order_idx on public.posts(series_id, series_order nulls last, created_at);

-- 合集收藏与更新订阅（与单篇作品 bookmarks 分开）
create table if not exists public.collection_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  series_id uuid not null references public.post_series(id) on delete cascade,
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);
create index if not exists collection_follows_series_idx on public.collection_follows(series_id);
alter table public.collection_follows enable row level security;
drop policy if exists collection_follows_read on public.collection_follows;
create policy collection_follows_read on public.collection_follows for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists collection_follows_write on public.collection_follows;
create policy collection_follows_write on public.collection_follows for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists collection_follows_update on public.collection_follows;
create policy collection_follows_update on public.collection_follows for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists collection_follows_delete on public.collection_follows;
create policy collection_follows_delete on public.collection_follows for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.collection_follows to authenticated;

-- 合集阅读进度（章节级）
create table if not exists public.collection_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  series_id uuid not null references public.post_series(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, series_id)
);
create index if not exists collection_progress_user_idx on public.collection_progress(user_id, updated_at desc);
alter table public.collection_progress enable row level security;
drop policy if exists collection_progress_read on public.collection_progress;
create policy collection_progress_read on public.collection_progress for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists collection_progress_write on public.collection_progress;
create policy collection_progress_write on public.collection_progress for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists collection_progress_update on public.collection_progress;
create policy collection_progress_update on public.collection_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.collection_progress to authenticated;

-- 合集公开信息修改后需要重新审核：作者可写 review_status，但只能写 pending；
-- 管理员通过 service_role 审核后回写 approved/rejected。
drop policy if exists post_series_update on public.post_series;
create policy post_series_update on public.post_series for update to authenticated
  using ((select auth.uid()) = creator_id)
  with check ((select auth.uid()) = creator_id);

-- 合集更新时间自动维护
create or replace function public.touch_post_series_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists post_series_touch_updated_at on public.post_series;
create trigger post_series_touch_updated_at before update on public.post_series
  for each row execute function public.touch_post_series_updated_at();

-- 阅读进度写入时校验作品确实属于该合集，避免跨合集污染
create or replace function public.record_collection_progress(p_series_id uuid, p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.posts p where p.id = p_post_id and p.series_id = p_series_id) then
    return;
  end if;
  insert into public.collection_progress(user_id, series_id, post_id, updated_at)
  values (auth.uid(), p_series_id, p_post_id, now())
  on conflict (user_id, series_id) do update set post_id = excluded.post_id, updated_at = now();
end;
$$;
revoke all on function public.record_collection_progress(uuid, uuid) from public, anon;
grant execute on function public.record_collection_progress(uuid, uuid) to authenticated;
