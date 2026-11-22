-- 回滚 20261122180000_profile_cover_version.sql
-- 只撤销新增列与对应授权；cover_url / cover_meta 属于上一阶段，不在此回滚。
revoke update(cover_version, cover_updated_at) on public.profiles from authenticated;
alter table public.profiles drop column if exists cover_updated_at;
alter table public.profiles drop column if exists cover_version;
