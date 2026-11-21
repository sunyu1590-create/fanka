-- 待审合集不应处于公开状态：统一回填，之后新建默认 false、审核通过时置 true。
update public.post_series
   set is_public = false
 where review_status <> 'approved'
   and is_public is distinct from false;
