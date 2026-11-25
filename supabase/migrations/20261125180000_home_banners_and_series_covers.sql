-- 首页推荐位（图片 / 视频轮播）与全平台合集封面系统。
-- 全部为增量结构，不修改既有业务语义，不改动任何现有内容数据。
-- 1) 轮播全局配置（单行）
-- 2) 轮播内容项（图片 / 视频混合，结构化跳转目标）
-- 3) 轮播运营事件（按天 + 会话聚合，防重复上报放大）
-- 4) 合集封面（四类来源统一落库，post_series.cover_url 继续回写兼容旧客户端）
-- 5) 官方封面模板目录（动态配置，不发版即可调整）
-- 6) 历史合集封面补齐任务（可追踪、可重试、可中断恢复）

-- ---------- 1. 轮播全局配置 ----------
create table if not exists public.home_banner_settings (
  id text primary key default 'default',
  enabled boolean not null default true,
  autoplay boolean not null default true,
  image_duration_ms integer not null default 5000,
  transition_ms integer not null default 450,
  video_autoplay boolean not null default true,
  video_muted boolean not null default true,
  allow_unmute boolean not null default true,
  data_saver_fallback boolean not null default true,
  video_max_ms integer not null default 30000,
  size_mode text not null default 'ratio',
  cover_ratio text not null default '3:1',
  app_height integer not null default 120,
  mobile_height integer not null default 120,
  tablet_height integer not null default 160,
  desktop_height integer not null default 180,
  unified_size boolean not null default true,
  fit_mode text not null default 'cover',
  focus text not null default 'center',
  radius integer not null default 12,
  show_indicator boolean not null default true,
  invalid_target_policy text not null default 'media',
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint home_banner_settings_singleton check (id = 'default'),
  constraint home_banner_settings_duration check (image_duration_ms between 1500 and 20000),
  constraint home_banner_settings_transition check (transition_ms between 120 and 1500),
  constraint home_banner_settings_size_mode check (size_mode in ('ratio', 'fixed')),
  constraint home_banner_settings_fit check (fit_mode in ('cover', 'contain')),
  constraint home_banner_settings_focus check (focus in ('center', 'top', 'bottom')),
  constraint home_banner_settings_policy check (invalid_target_policy in ('media', 'filter')),
  constraint home_banner_settings_heights check (
    app_height between 80 and 280 and mobile_height between 80 and 280
    and tablet_height between 100 and 320 and desktop_height between 100 and 360
  ),
  constraint home_banner_settings_radius check (radius between 0 and 28),
  constraint home_banner_settings_video_max check (video_max_ms between 3000 and 120000)
);

comment on table public.home_banner_settings is '首页推荐位全局配置：尺寸、播放、降级与指示器策略，单行配置表';

insert into public.home_banner_settings (id) values ('default')
on conflict (id) do nothing;

alter table public.home_banner_settings enable row level security;

drop policy if exists home_banner_settings_read on public.home_banner_settings;
create policy home_banner_settings_read on public.home_banner_settings for select to anon, authenticated using (true);
drop policy if exists home_banner_settings_admin_write on public.home_banner_settings;
create policy home_banner_settings_admin_write on public.home_banner_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.home_banner_settings to anon, authenticated;
grant update on public.home_banner_settings to authenticated;

-- ---------- 2. 轮播内容 ----------
create table if not exists public.home_banners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  alt text not null default '',
  media_type text not null default 'image',
  image_path text,
  video_path text,
  poster_path text,
  width integer,
  height integer,
  video_duration_ms integer,
  display_ms integer,
  target_type text not null default 'none',
  target_id uuid,
  focus text not null default 'center',
  sort_order integer not null default 0,
  platforms text[] not null default array['app', 'web']::text[],
  enabled boolean not null default true,
  status text not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint home_banners_media_type check (media_type in ('image', 'video')),
  constraint home_banners_target_type check (target_type in ('none', 'post', 'series')),
  constraint home_banners_status check (status in ('draft', 'published')),
  constraint home_banners_focus check (focus in ('center', 'top', 'bottom')),
  constraint home_banners_display_ms check (display_ms is null or display_ms between 1500 and 60000),
  constraint home_banners_window check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint home_banners_media_present check (
    (media_type = 'image' and image_path is not null)
    or (media_type = 'video' and video_path is not null)
  ),
  constraint home_banners_target_pair check (
    (target_type = 'none' and target_id is null) or (target_type <> 'none' and target_id is not null)
  )
);

comment on table public.home_banners is '首页推荐位内容项：图片与视频共用一个有序轮播池，跳转目标结构化存储';

create index if not exists home_banners_order_idx on public.home_banners (sort_order, created_at desc);
create index if not exists home_banners_live_idx on public.home_banners (enabled, status, starts_at, ends_at);

alter table public.home_banners enable row level security;

drop policy if exists home_banners_public_read on public.home_banners;
create policy home_banners_public_read on public.home_banners for select to anon, authenticated
  using (enabled and status = 'published');
drop policy if exists home_banners_admin_read on public.home_banners;
create policy home_banners_admin_read on public.home_banners for select to authenticated
  using (public.is_admin());
drop policy if exists home_banners_admin_write on public.home_banners;
create policy home_banners_admin_write on public.home_banners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.home_banners to anon, authenticated;
grant insert, update, delete on public.home_banners to authenticated;

-- ---------- 3. 轮播运营事件 ----------
create table if not exists public.home_banner_events (
  banner_id uuid not null references public.home_banners(id) on delete cascade,
  event text not null,
  platform text not null,
  day date not null,
  session_key text not null,
  user_id uuid,
  hits integer not null default 0,
  duration_ms bigint not null default 0,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (banner_id, event, platform, day, session_key),
  constraint home_banner_events_event check (event in ('impression', 'click', 'video_start', 'video_complete')),
  constraint home_banner_events_platform check (platform in ('app', 'web')),
  constraint home_banner_events_session check (char_length(session_key) between 6 and 64)
);

comment on table public.home_banner_events is '轮播运营事件按天聚合：同一会话同一事件在最短间隔内不重复累加，避免重渲染放大统计';

create index if not exists home_banner_events_day_idx on public.home_banner_events (day desc, event);

alter table public.home_banner_events enable row level security;

drop policy if exists home_banner_events_admin_read on public.home_banner_events;
create policy home_banner_events_admin_read on public.home_banner_events for select to authenticated
  using (public.is_admin());
-- 写入统一走 security definer 函数，客户端不直接持有表写权限。
revoke all on public.home_banner_events from anon, authenticated;
grant select on public.home_banner_events to authenticated;

-- 上报：按 (banner, event, platform, day, session) 聚合。
-- 曝光 / 点击 30 秒内重复上报视为同一动作，不重复累加；视频事件每次都计入。
create or replace function public.heika_banner_track(
  p_banner uuid,
  p_event text,
  p_platform text,
  p_session text,
  p_duration integer default null,
  p_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Shanghai')::date;
  v_banner public.home_banners;
  v_existing public.home_banner_events;
  v_hits integer := 1;
begin
  if p_event not in ('impression', 'click', 'video_start', 'video_complete') then
    raise exception 'event_invalid';
  end if;
  if p_platform not in ('app', 'web') then
    raise exception 'platform_invalid';
  end if;
  if p_session is null or char_length(p_session) < 6 or char_length(p_session) > 64 then
    raise exception 'session_invalid';
  end if;

  select * into v_banner from public.home_banners where id = p_banner;
  if not found or not v_banner.enabled or v_banner.status <> 'published' then
    raise exception 'banner_unavailable';
  end if;

  select * into v_existing from public.home_banner_events
   where banner_id = p_banner and event = p_event and platform = p_platform
     and day = v_day and session_key = p_session;

  if found and p_event in ('impression', 'click') and v_existing.last_at > now() - interval '30 seconds' then
    update public.home_banner_events
       set last_at = now(),
           user_id = coalesce(user_id, p_user)
     where banner_id = p_banner and event = p_event and platform = p_platform
       and day = v_day and session_key = p_session;
    return jsonb_build_object('recorded', false, 'reason', 'throttled');
  end if;

  if found and p_event = 'video_complete' and v_existing.last_at > now() - interval '3 seconds' then
    return jsonb_build_object('recorded', false, 'reason', 'throttled');
  end if;

  insert into public.home_banner_events (banner_id, event, platform, day, session_key, user_id, hits, duration_ms, first_at, last_at)
  values (p_banner, p_event, p_platform, v_day, p_session, p_user, v_hits, coalesce(p_duration, 0), now(), now())
  on conflict (banner_id, event, platform, day, session_key) do update
    set hits = public.home_banner_events.hits + 1,
        duration_ms = public.home_banner_events.duration_ms + coalesce(excluded.duration_ms, 0),
        last_at = now(),
        user_id = coalesce(public.home_banner_events.user_id, excluded.user_id);

  return jsonb_build_object('recorded', true);
end;
$$;

grant execute on function public.heika_banner_track(uuid, text, text, text, integer, uuid) to anon, authenticated;

-- 运营统计：按自然日聚合，指标定义在函数内固定，前端不做二次推算。
create or replace function public.heika_banner_stats(p_days integer default 7, p_banner uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(90, coalesce(p_days, 7)));
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  with scoped as (
    select * from public.home_banner_events
     where day >= (now() at time zone 'Asia/Shanghai')::date - (v_days - 1)
       and (p_banner is null or banner_id = p_banner)
  ),
  daily as (
    select day,
           platform,
           sum(case when event = 'impression' then hits else 0 end) as impressions,
           sum(case when event = 'click' then hits else 0 end) as clicks,
           sum(case when event = 'video_start' then hits else 0 end) as video_starts,
           sum(case when event = 'video_complete' then hits else 0 end) as video_completes,
           count(distinct case when event = 'impression' then coalesce(user_id::text, session_key) end) as impression_users,
           count(distinct case when event = 'click' then coalesce(user_id::text, session_key) end) as click_users,
           coalesce(sum(case when event = 'video_complete' then duration_ms else 0 end), 0) as watched_ms
      from scoped
     group by day, platform
  ),
  per_banner as (
    select banner_id,
           sum(case when event = 'impression' then hits else 0 end) as impressions,
           sum(case when event = 'click' then hits else 0 end) as clicks,
           sum(case when event = 'video_start' then hits else 0 end) as video_starts,
           sum(case when event = 'video_complete' then hits else 0 end) as video_completes,
           count(distinct case when event = 'impression' then coalesce(user_id::text, session_key) end) as impression_users,
           count(distinct case when event = 'click' then coalesce(user_id::text, session_key) end) as click_users,
           coalesce(sum(case when event = 'video_complete' then duration_ms else 0 end), 0) as watched_ms
      from scoped
     group by banner_id
  ),
  totals as (
    select coalesce(sum(impressions), 0) as impressions,
           coalesce(sum(clicks), 0) as clicks,
           coalesce(sum(video_starts), 0) as video_starts,
           coalesce(sum(video_completes), 0) as video_completes,
           coalesce(sum(watched_ms), 0) as watched_ms
      from per_banner
  )
  select jsonb_build_object(
    'days', v_days,
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
        'day', day, 'platform', platform, 'impressions', impressions, 'clicks', clicks,
        'impression_users', impression_users, 'click_users', click_users,
        'video_starts', video_starts, 'video_completes', video_completes, 'watched_ms', watched_ms
      ) order by day) from daily), '[]'::jsonb),
    'banners', coalesce((select jsonb_agg(jsonb_build_object(
        'banner_id', banner_id, 'impressions', impressions, 'clicks', clicks,
        'impression_users', impression_users, 'click_users', click_users,
        'video_starts', video_starts, 'video_completes', video_completes, 'watched_ms', watched_ms,
        'ctr', case when impressions > 0 then round(clicks::numeric / impressions, 4) else null end,
        'completion_rate', case when video_starts > 0 then round(video_completes::numeric / video_starts, 4) else null end,
        'avg_watch_ms', case when video_completes > 0 then (watched_ms / video_completes)::bigint else null end
      )) from per_banner), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'impressions', impressions, 'clicks', clicks,
        'video_starts', video_starts, 'video_completes', video_completes,
        'ctr', case when impressions > 0 then round(clicks::numeric / impressions, 4) else null end,
        'completion_rate', case when video_starts > 0 then round(video_completes::numeric / video_starts, 4) else null end,
        'avg_watch_ms', case when video_completes > 0 then (watched_ms / video_completes)::bigint else null end
      ) from totals)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.heika_banner_stats(integer, uuid) from anon;
grant execute on function public.heika_banner_stats(integer, uuid) to authenticated;

-- ---------- 4. 合集封面 ----------
create table if not exists public.series_covers (
  series_id uuid primary key references public.post_series(id) on delete cascade,
  source text not null default 'auto',
  template_id text,
  template_version integer,
  title text,
  subtitle text,
  palette text,
  pattern text,
  crop jsonb,
  params jsonb,
  source_post_id uuid references public.posts(id) on delete set null,
  storage_path text,
  generated_at timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint series_covers_source check (source in ('auto', 'template', 'upload', 'post'))
);

comment on table public.series_covers is '合集封面四类来源的统一记录；storage_path 指向独立封面资源，作品图片删除不影响已生成的独立封面';

create index if not exists series_covers_template_idx on public.series_covers (template_id);
create index if not exists series_covers_source_idx on public.series_covers (source);

alter table public.series_covers enable row level security;

drop policy if exists series_covers_read on public.series_covers;
create policy series_covers_read on public.series_covers for select to anon, authenticated using (true);
drop policy if exists series_covers_write on public.series_covers;
create policy series_covers_write on public.series_covers for all to authenticated
  using (exists (select 1 from public.post_series s where s.id = series_id and s.creator_id = (select auth.uid())) or public.is_admin())
  with check (exists (select 1 from public.post_series s where s.id = series_id and s.creator_id = (select auth.uid())) or public.is_admin());

grant select on public.series_covers to anon, authenticated;
grant insert, update, delete on public.series_covers to authenticated;

-- ---------- 5. 官方封面模板 ----------
create table if not exists public.cover_templates (
  id text primary key,
  name text not null,
  category text not null,
  render_type text not null,
  palette jsonb not null default '{}'::jsonb,
  params jsonb not null default '{}'::jsonb,
  editable jsonb not null default '{}'::jsonb,
  preview_path text,
  version integer not null default 1,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  is_default boolean not null default false,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cover_templates_category check (category in ('swiss', 'glass', 'magazine', 'minimal', 'literary', 'creative')),
  constraint cover_templates_render check (render_type in ('swiss', 'glass', 'magazine', 'minimal', 'literary', 'creative'))
);

comment on table public.cover_templates is '官方封面模板目录：启用状态、排序与配色均可在线调整，客户端只读，不需重新发版';

create index if not exists cover_templates_order_idx on public.cover_templates (category, sort_order);

alter table public.cover_templates enable row level security;

drop policy if exists cover_templates_read on public.cover_templates;
create policy cover_templates_read on public.cover_templates for select to anon, authenticated using (true);
drop policy if exists cover_templates_admin_write on public.cover_templates;
create policy cover_templates_admin_write on public.cover_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.cover_templates to anon, authenticated;
grant insert, update, delete on public.cover_templates to authenticated;

-- ---------- 6. 历史封面补齐任务 ----------
create table if not exists public.cover_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued',
  total integer not null default 0,
  processed integer not null default 0,
  succeeded integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  cursor text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  constraint cover_backfill_status check (status in ('queued', 'running', 'paused', 'done', 'failed'))
);

comment on table public.cover_backfill_jobs is '历史合集封面补齐任务：分批处理、可中断恢复、可重试，cursor 记录处理位置';

create index if not exists cover_backfill_jobs_created_idx on public.cover_backfill_jobs (created_at desc);

alter table public.cover_backfill_jobs enable row level security;

drop policy if exists cover_backfill_jobs_admin on public.cover_backfill_jobs;
create policy cover_backfill_jobs_admin on public.cover_backfill_jobs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.cover_backfill_jobs to authenticated;

-- 无封面统计：管理后台直接读，不在前端遍历全量合集。
create or replace function public.heika_series_cover_coverage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
    'total', count(*),
    'with_cover', count(*) filter (where s.cover_url is not null and s.cover_url <> ''),
    'with_record', count(*) filter (where c.series_id is not null),
    'missing', count(*) filter (where s.cover_url is null or s.cover_url = ''),
    'by_source', coalesce((
      select jsonb_object_agg(source, amount) from (
        select coalesce(c2.source, 'none') as source, count(*) as amount
          from public.post_series s2
          left join public.series_covers c2 on c2.series_id = s2.id
         group by 1
      ) grouped
    ), '{}'::jsonb)
  ) into v_result
  from public.post_series s
  left join public.series_covers c on c.series_id = s.id;
  return v_result;
end;
$$;

revoke all on function public.heika_series_cover_coverage() from anon;
grant execute on function public.heika_series_cover_coverage() to authenticated;

-- ---------- 7. 官方模板种子：24 套，六个系列，各自独立版式 ----------
insert into public.cover_templates (id, name, category, render_type, palette, params, editable, sort_order, enabled, is_default) values
  ('swiss-01', '瑞士编辑 · 大标题左对齐', 'swiss', 'swiss', '{"bg":"#F4F1EA","ink":"#141414","accent":"#1F4EF5","muted":"#8A8578"}', '{"layout":"stack","rule":true,"index":true}', '{"title":true,"subtitle":true,"palette":true}', 10, true, true),
  ('swiss-02', '瑞士编辑 · 网格分栏', 'swiss', 'swiss', '{"bg":"#0E0E10","ink":"#F5F3EE","accent":"#E8FF59","muted":"#7A776F"}', '{"layout":"grid","rule":true,"index":true}', '{"title":true,"subtitle":true,"palette":true}', 20, true, false),
  ('swiss-03', '瑞士编辑 · 编号档案', 'swiss', 'swiss', '{"bg":"#FFFFFF","ink":"#101010","accent":"#FF4A1C","muted":"#9B9B9B"}', '{"layout":"index","rule":true,"index":true}', '{"title":true,"subtitle":true,"palette":true}', 30, true, false),
  ('swiss-04', '瑞士编辑 · 高对比横条', 'swiss', 'swiss', '{"bg":"#111111","ink":"#FFFFFF","accent":"#FFFFFF","muted":"#8C8C8C"}', '{"layout":"bar","rule":false,"index":true}', '{"title":true,"subtitle":true,"palette":true}', 40, true, false),
  ('swiss-05', '瑞士编辑 · 学术留白', 'swiss', 'swiss', '{"bg":"#FBFBF9","ink":"#1A1A1A","accent":"#2F6B4F","muted":"#9A9A93"}', '{"layout":"airy","rule":true,"index":false}', '{"title":true,"subtitle":true,"palette":true}', 50, true, false),
  ('swiss-06', '瑞士编辑 · 双色错位', 'swiss', 'swiss', '{"bg":"#E9E4D8","ink":"#191919","accent":"#1A1A1A","muted":"#7E786B"}', '{"layout":"offset","rule":true,"index":true}', '{"title":true,"subtitle":true,"palette":true}', 60, true, false),

  ('glass-01', '光学玻璃 · 棱镜色散', 'glass', 'glass', '{"bg":"#0A0C12","ink":"#F2F5FF","accent":"#7AA2FF","muted":"#6D7690"}', '{"shape":"prism","gradient":"cool"}', '{"title":true,"subtitle":true,"palette":true}', 70, true, false),
  ('glass-02', '光学玻璃 · 透光球体', 'glass', 'glass', '{"bg":"#101319","ink":"#EDF1FA","accent":"#B79BFF","muted":"#6E7488"}', '{"shape":"sphere","gradient":"violet"}', '{"title":true,"subtitle":true,"palette":true}', 80, true, false),
  ('glass-03', '光学玻璃 · 折射切片', 'glass', 'glass', '{"bg":"#0C1014","ink":"#EAF6FF","accent":"#4FD6C8","muted":"#69808C"}', '{"shape":"slice","gradient":"teal"}', '{"title":true,"subtitle":true,"palette":true}', 90, true, false),
  ('glass-04', '光学玻璃 · 冷光阶梯', 'glass', 'glass', '{"bg":"#0B0D11","ink":"#F4F6FB","accent":"#8EA7FF","muted":"#666E85"}', '{"shape":"stairs","gradient":"steel"}', '{"title":true,"subtitle":true,"palette":true}', 100, true, false),

  ('magazine-01', '沉浸杂志 · 满版大图', 'magazine', 'magazine', '{"bg":"#121212","ink":"#FFFFFF","accent":"#FFFFFF","muted":"#B4B4B4"}', '{"layout":"full","overlay":"bottom"}', '{"title":true,"subtitle":true,"palette":true,"image":true}', 110, true, false),
  ('magazine-02', '沉浸杂志 · 图上标题', 'magazine', 'magazine', '{"bg":"#0F0F0F","ink":"#FFFFFF","accent":"#FFD84D","muted":"#C0C0C0"}', '{"layout":"split","overlay":"top"}', '{"title":true,"subtitle":true,"palette":true,"image":true}', 120, true, false),
  ('magazine-03', '沉浸杂志 · 胶片留边', 'magazine', 'magazine', '{"bg":"#F2EFE8","ink":"#151515","accent":"#151515","muted":"#8B8578"}', '{"layout":"frame","overlay":"none"}', '{"title":true,"subtitle":true,"palette":true,"image":true}', 130, true, false),
  ('magazine-04', '沉浸杂志 · 双图拼贴', 'magazine', 'magazine', '{"bg":"#101010","ink":"#F7F7F7","accent":"#F7F7F7","muted":"#A8A8A8"}', '{"layout":"collage","overlay":"bottom"}', '{"title":true,"subtitle":true,"palette":true,"image":true}', 140, true, false),

  ('minimal-01', '极简文字 · 大字标题', 'minimal', 'minimal', '{"bg":"#FFFFFF","ink":"#0F0F0F","accent":"#0F0F0F","muted":"#9C9C9C"}', '{"align":"left","weight":"heavy"}', '{"title":true,"subtitle":true,"palette":true}', 150, true, false),
  ('minimal-02', '极简文字 · 居中留白', 'minimal', 'minimal', '{"bg":"#F7F6F3","ink":"#1B1B1B","accent":"#1B1B1B","muted":"#A0A0A0"}', '{"align":"center","weight":"medium"}', '{"title":true,"subtitle":true,"palette":true}', 160, true, false),
  ('minimal-03', '极简文字 · 深底反白', 'minimal', 'minimal', '{"bg":"#0D0D0F","ink":"#FAFAFA","accent":"#FAFAFA","muted":"#8E8E8E"}', '{"align":"left","weight":"bold"}', '{"title":true,"subtitle":true,"palette":true}', 170, true, false),
  ('minimal-04', '极简文字 · 色块标签', 'minimal', 'minimal', '{"bg":"#F0EDE6","ink":"#161616","accent":"#2B3A8F","muted":"#8C887E"}', '{"align":"left","weight":"bold","tag":true}', '{"title":true,"subtitle":true,"palette":true}', 180, true, false),

  ('literary-01', '文学艺术 · 纸张纹理', 'literary', 'literary', '{"bg":"#EFE7D8","ink":"#2A2419","accent":"#8A6A3B","muted":"#9C907C"}', '{"texture":"paper","serif":true}', '{"title":true,"subtitle":true,"palette":true}', 190, true, false),
  ('literary-02', '文学艺术 · 竖排题签', 'literary', 'literary', '{"bg":"#F4EDE0","ink":"#232019","accent":"#7A2E2E","muted":"#9B8F7B"}', '{"texture":"paper","vertical":true,"serif":true}', '{"title":true,"subtitle":true,"palette":true}', 200, true, false),
  ('literary-03', '文学艺术 · 墨色渐层', 'literary', 'literary', '{"bg":"#E8E4DA","ink":"#1D1D1B","accent":"#3B3B36","muted":"#8E887C"}', '{"texture":"wash","serif":true}', '{"title":true,"subtitle":true,"palette":true}', 210, true, false),

  ('creative-01', '创作实践 · 高饱和实践', 'creative', 'creative', '{"bg":"#10203A","ink":"#F4F7FF","accent":"#FF7A3C","muted":"#8FA3C4"}', '{"shape":"arc","energy":"high"}', '{"title":true,"subtitle":true,"palette":true}', 220, true, false),
  ('creative-02', '创作实践 · 教程工坊', 'creative', 'creative', '{"bg":"#FBF3E6","ink":"#1A1A1A","accent":"#E4571F","muted":"#94897A"}', '{"shape":"grid","energy":"medium"}', '{"title":true,"subtitle":true,"palette":true}', 230, true, false),
  ('creative-03', '创作实践 · 实验构图', 'creative', 'creative', '{"bg":"#121A16","ink":"#EAF7EE","accent":"#57E08C","muted":"#7C9A87"}', '{"shape":"fragments","energy":"high"}', '{"title":true,"subtitle":true,"palette":true}', 240, true, false)
on conflict (id) do nothing;

-- ---------- 8. 权限收敛：模板表只允许管理员写入 ----------
revoke insert, update, delete on public.cover_templates from anon;
