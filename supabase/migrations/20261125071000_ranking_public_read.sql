-- 榜单快照是公开数据（不含用户信息），允许客户端与服务端以匿名身份读取。
alter table public.ranking_snapshots enable row level security;
drop policy if exists ranking_snapshots_public_read on public.ranking_snapshots;
create policy ranking_snapshots_public_read on public.ranking_snapshots for select using (true);

-- 合集精选状态公开可读，作者信息不外泄。
alter table public.series_curation enable row level security;
drop policy if exists series_curation_public_read on public.series_curation;
create policy series_curation_public_read on public.series_curation for select using (true);
