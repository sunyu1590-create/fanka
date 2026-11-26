-- 首页多媒体轮播增强：播放策略、文字层、预加载、资源上限与版本化。
-- 全部为增量字段，保留既有数据与语义；已有行通过默认值获得向后兼容的行为。
-- 1) 全局配置：视频播放模式 / 循环 / 预加载策略 / 文字总开关 / 缓存有效期 / 视频上限
-- 2) 内容项：标题、副标题、描述、单条文字开关、单条填充策略、封面填充策略

-- ---------- 1. 全局配置 ----------
alter table public.home_banner_settings
  add column if not exists video_play_mode text not null default 'full',
  add column if not exists video_loop boolean not null default false,
  add column if not exists preload_mode text not null default 'next',
  add column if not exists show_text boolean not null default true,
  add column if not exists cache_ttl_hours integer not null default 72,
  add column if not exists video_max_mb integer not null default 20,
  add column if not exists video_max_count integer not null default 6,
  add column if not exists video_max_width integer not null default 1920;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'home_banner_settings_play_mode') then
    alter table public.home_banner_settings
      add constraint home_banner_settings_play_mode check (video_play_mode in ('full', 'timed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'home_banner_settings_preload') then
    alter table public.home_banner_settings
      add constraint home_banner_settings_preload check (preload_mode in ('off', 'next', 'adjacent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'home_banner_settings_cache_ttl') then
    alter table public.home_banner_settings
      add constraint home_banner_settings_cache_ttl check (cache_ttl_hours between 1 and 720);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'home_banner_settings_video_limit') then
    alter table public.home_banner_settings
      add constraint home_banner_settings_video_limit check (
        video_max_mb between 5 and 200
        and video_max_count between 1 and 12
        and video_max_width between 640 and 3840
      );
  end if;
end $$;

comment on column public.home_banner_settings.video_play_mode is '视频切换时机：full=完整播放后切换，timed=到达 display_ms/video_max_ms 后切换';
comment on column public.home_banner_settings.video_loop is '视频是否循环播放；开启后在切换前反复播放而不黑屏';
comment on column public.home_banner_settings.preload_mode is '预加载策略：off=不预加载，next=只预加载下一条，adjacent=预加载相邻两条（视频仅取封面与元数据）';
comment on column public.home_banner_settings.show_text is '文字层总开关，关闭后所有轮播不展示标题/副标题/描述';
comment on column public.home_banner_settings.cache_ttl_hours is '离线时可展示旧配置的有效期（小时），过期后不再展示缓存内容';
comment on column public.home_banner_settings.video_max_mb is '单个轮播视频体积上限（MB），上传接口按此校验';
comment on column public.home_banner_settings.video_max_count is '同时启用的视频轮播数量上限，超出时后台拒绝新增';
comment on column public.home_banner_settings.video_max_width is '视频最大宽度（像素），超出时后台提示重新压缩';

update public.home_banner_settings
   set video_play_mode = coalesce(video_play_mode, 'full'),
       preload_mode = coalesce(preload_mode, 'next'),
       show_text = coalesce(show_text, true),
       cache_ttl_hours = coalesce(cache_ttl_hours, 72),
       video_max_mb = coalesce(video_max_mb, 20),
       video_max_count = coalesce(video_max_count, 6),
       video_max_width = coalesce(video_max_width, 1920)
 where id = 'default';

-- ---------- 2. 内容项 ----------
alter table public.home_banners
  add column if not exists title text not null default '',
  add column if not exists subtitle text not null default '',
  add column if not exists description text not null default '',
  add column if not exists show_text boolean not null default true,
  add column if not exists fit_mode text,
  add column if not exists poster_fit text not null default 'cover';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'home_banners_fit_mode') then
    alter table public.home_banners
      add constraint home_banners_fit_mode check (fit_mode is null or fit_mode in ('cover', 'contain'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'home_banners_poster_fit') then
    alter table public.home_banners
      add constraint home_banners_poster_fit check (poster_fit in ('cover', 'contain'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'home_banners_text_length') then
    alter table public.home_banners
      add constraint home_banners_text_length check (
        char_length(title) <= 40 and char_length(subtitle) <= 60 and char_length(description) <= 160
      );
  end if;
end $$;

comment on column public.home_banners.title is '轮播文字层主标题，留空则不展示';
comment on column public.home_banners.subtitle is '轮播文字层副标题，留空则不展示';
comment on column public.home_banners.description is '轮播文字层描述，留空则不展示';
comment on column public.home_banners.show_text is '单条文字开关，仅在全局 show_text 开启时生效';
comment on column public.home_banners.fit_mode is '单条媒体填充策略；null 表示跟随全局 fit_mode';
comment on column public.home_banners.poster_fit is '视频封面填充策略，独立于视频本体，避免封面拉伸';

create index if not exists home_banners_updated_idx on public.home_banners (updated_at desc);

-- 版本化读取：一次查询拿到版本号、条目数与最近更新时间，
-- 供客户端做轻量校验（避免每次拉完整配置）。
create or replace function public.heika_home_banner_revision()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select id, updated_at
      from public.home_banners
     where enabled and status = 'published'
       and (starts_at is null or starts_at <= now())
       and (ends_at is null or ends_at > now())
  ), cfg as (
    select version, updated_at from public.home_banner_settings where id = 'default'
  )
  select jsonb_build_object(
    'version', coalesce((select version from cfg), 1),
    'count', (select count(*) from live),
    'updated_at', greatest(
      coalesce((select max(updated_at) from live), to_timestamp(0)),
      coalesce((select updated_at from cfg), to_timestamp(0))
    ),
    'revision', md5(
      coalesce((select version::text from cfg), '1') || ':' ||
      coalesce((select string_agg(id::text || ':' || extract(epoch from updated_at)::text, ',' order by id) from live), '')
    )
  );
$$;

revoke all on function public.heika_home_banner_revision() from public;
grant execute on function public.heika_home_banner_revision() to anon, authenticated, service_role;

comment on function public.heika_home_banner_revision() is '首页轮播轻量版本指纹：客户端据此判断是否需要重新拉取完整配置';

notify pgrst, 'reload schema';
