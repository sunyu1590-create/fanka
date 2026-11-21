-- 回滚：恢复为默认公开（是否可见仍由 review_status 控制）。
update public.post_series set is_public = true where is_public = false and review_status <> 'approved';
