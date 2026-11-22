-- 修复个人封面保存报 permission denied for table profiles。
-- 根因：profiles 的 UPDATE 授权是列级的（见 20261030163529 / 20261101044853 等），
-- 20261121170000 新增 cover_url / cover_meta 两列时没有补 GRANT，
-- 以 authenticated 角色 UPDATE 这两列会命中 42501（表级拒绝提示）。
-- 只授权这两列，受保护字段（role / membership_tier 等）授权不变。
grant update(cover_url, cover_meta) on public.profiles to authenticated;
