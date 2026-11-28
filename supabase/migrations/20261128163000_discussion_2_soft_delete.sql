-- HEIKA Discussion 2.0 · 软删除占位兼容
-- 现状：comments_body_check 要求正文长度 1-1000，comments_status_check 只允许
-- visible / hidden。因此「保留 id、时间与回复关系的删除占位」无法通过写空正文
-- 实现。本次迁移只放宽校验条件，不删除、不改写任何既有评论，也不扩大可写范围。
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments
  add constraint comments_body_check
  check (
    (deleted_at is not null)
    or (length(btrim(body)) >= 1 and length(btrim(body)) <= 1000)
  );
