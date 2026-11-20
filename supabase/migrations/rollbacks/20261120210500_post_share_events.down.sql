-- 回滚 20261120210500_post_share_events.sql
-- 该迁移只新增对象，不修改既有表与数据；回滚即删除新增对象。
-- 如需保留分享数据，请先执行：
--   create table public.post_share_events_backup as select * from public.post_share_events;

drop view if exists public.post_share_stats;
drop table if exists public.post_share_events;
