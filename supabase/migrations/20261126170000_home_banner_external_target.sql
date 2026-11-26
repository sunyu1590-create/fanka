-- 首页轮播跳转目标扩展：在作品 / 合集之外支持「合法外链」。
-- 只允许 https 绝对地址或站内相对路径，杜绝 javascript:、data: 与协议相对地址。
-- 既有数据不受影响：原约束的行在新约束下依然成立。

alter table public.home_banners
  add column if not exists external_url text;

alter table public.home_banners drop constraint if exists home_banners_target_type;
alter table public.home_banners
  add constraint home_banners_target_type check (target_type in ('none', 'post', 'series', 'external'));

alter table public.home_banners drop constraint if exists home_banners_target_pair;
alter table public.home_banners
  add constraint home_banners_target_pair check (
    (target_type = 'none' and target_id is null and external_url is null)
    or (target_type in ('post', 'series') and target_id is not null and external_url is null)
    or (
      target_type = 'external'
      and target_id is null
      and external_url is not null
      and char_length(external_url) between 1 and 500
      and (external_url like 'https://%' or external_url like '/%')
      and external_url not like '//%'
    )
  );

comment on column public.home_banners.external_url is '外链跳转目标：https 绝对地址或站内相对路径，服务端与客户端都会再次校验';

create index if not exists home_banners_target_idx on public.home_banners (target_type) where target_type <> 'none';

notify pgrst, 'reload schema';
