-- 个人封面持久化：版本号 + 更新时间
--
-- 背景：封面图片本身已经存在 heika-decor 存储桶，profiles.cover_url 保存的是
-- 稳定公开地址；但主页读取用的 /api/v1/library-state 没有查询这两列，
-- 前端 hydrate 时用 undefined 覆盖了本地状态，表现为「上传成功，重开就没了」。
--
-- 本次补两列，让客户端可以做「本地缓存 vs 云端版本」比较：
--   cover_version    每次换图 / 删除 +1，取景参数微调不变
--   cover_updated_at 最近一次换图 / 删除的时间
-- 列级授权沿用 profiles 的既有模式，必须显式补 GRANT。

alter table public.profiles add column if not exists cover_version integer not null default 0;
alter table public.profiles add column if not exists cover_updated_at timestamptz;

comment on column public.profiles.cover_version is '个人封面版本：换图或删除时递增，供客户端判断本地缓存是否过期';
comment on column public.profiles.cover_updated_at is '个人封面最近一次换图或删除的时间';

-- 已有封面统一从 1 开始，和「从未上传」的 0 区分开。
update public.profiles
   set cover_version = 1,
       cover_updated_at = coalesce(cover_updated_at, now())
 where cover_url is not null
   and cover_version = 0;

grant update(cover_url, cover_meta, cover_version, cover_updated_at) on public.profiles to authenticated;
