-- 合集不再进入人工审核：创建即上架，资料修改即时生效。
-- 1) 历史遗留的待审/退回合集全部转为已上架，避免作者侧仍显示「审核中」；
-- 2) 待审快照清空，线上字段即最终字段。

update public.post_series
set review_status = 'approved',
    is_public = true,
    review_note = null,
    pending_public = null,
    pending_review_note = null,
    updated_at = now()
where review_status <> 'approved'
   or is_public = false
   or pending_public is not null
   or pending_review_note is not null;
