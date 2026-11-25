-- 修复：生产库 auth.users 上「插入即建档」的触发器丢失
--
-- 现象：2026-11-25 验收时用 Admin API 新建的账号没有 profiles 行，
--       随后收藏合集直接返回 400（collection_follows_user_id_fkey 外键违约），
--       阅读记录 upsert 静默失败、合集进度不回写。
-- 根因：0001_initial.sql 建立的 auth_profile 触发器在自建 Supabase 的某次升级/重建
--       auth schema 后不存在了；create_profile() 函数本身仍在。新注册用户因此没有档案，
--       所有指向 profiles(id) 的写入（发布、点赞、收藏、评论、阅读记录）都会失败。
-- 处理：重建触发器，并回填历史缺口。可重复执行。

drop trigger if exists auth_profile on auth.users;
create trigger auth_profile
after insert on auth.users
for each row execute function public.create_profile();

insert into public.profiles (id, nickname)
select
  u.id,
  coalesce(nullif(left(btrim(u.raw_user_meta_data ->> 'nickname'), 24), ''), '探索者')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
