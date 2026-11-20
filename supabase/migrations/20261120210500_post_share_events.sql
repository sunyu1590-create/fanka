-- 2026-11-20 分享行为落库
-- 背景：分享此前只发生在客户端（系统分享 / 复制文案 / 平台跳转），
-- 服务端没有任何记录，无法核对「分享」是否真的走到数据库，也无法做后续的分享统计。
--
-- 设计原则：
-- 1. 复用既有 posts / profiles 外键，不新建作品或用户维度；
-- 2. 只记录「哪篇作品、哪个平台、哪个端、什么时候」，不存分享文案（文案可由作品实时生成）；
-- 3. 写入只允许服务端（API 用 service_role），客户端 RLS 一律不可写，避免伪造 user_id 或刷量；
-- 4. 读取只开放给有内容审核权限的管理员。
--
-- 回滚：supabase/migrations/rollbacks/20261120210500_post_share_events.down.sql
-- 备份：变更前已用 pg_dump -Fc 全库备份（2026-11-20 20:56）。

create table if not exists public.post_share_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  platform text not null,
  surface text not null default 'web',
  created_at timestamptz not null default now(),
  constraint post_share_events_platform_check
    check (platform in ('system', 'copy', 'wechat', 'moments', 'x', 'telegram', 'facebook', 'qq', 'instagram', 'other')),
  constraint post_share_events_surface_check
    check (surface in ('web', 'android', 'ios'))
);

comment on table public.post_share_events is '作品分享行为流水；仅服务端可写，管理员可读。';
comment on column public.post_share_events.platform is '分享去向：system=系统分享，copy=复制文案，wechat=微信好友，moments=朋友圈，x/telegram/facebook/qq/instagram 为对应平台。';
comment on column public.post_share_events.surface is '来源端：web / android / ios。';

create index if not exists post_share_events_post_created_idx
  on public.post_share_events (post_id, created_at desc);
create index if not exists post_share_events_created_idx
  on public.post_share_events (created_at desc);
create index if not exists post_share_events_user_created_idx
  on public.post_share_events (user_id, created_at desc)
  where user_id is not null;

alter table public.post_share_events enable row level security;

-- 客户端一律不可写；写入统一走 /api/v1/posts/[id]/share（service_role）。
revoke all on public.post_share_events from anon, authenticated;
grant select on public.post_share_events to authenticated;

drop policy if exists post_share_events_admin_read on public.post_share_events;
create policy post_share_events_admin_read on public.post_share_events
  for select to authenticated
  using (public.is_admin() or public.has_staff_permission('content.review'));

-- 便于后台直接看单篇分享量，不额外建汇总表。
create or replace view public.post_share_stats
with (security_invoker = true) as
select post_id, count(*)::integer as share_count, max(created_at) as last_shared_at
from public.post_share_events
group by post_id;

comment on view public.post_share_stats is '按作品聚合的分享次数；security_invoker 继承底表 RLS。';
