-- 修复审核员守卫在无登录上下文时的误判。
-- 原实现在 auth.uid() 为空（service_role、运维脚本、删除用户触发的外键 ON DELETE SET NULL）
-- 时，actor_role 为 NULL，`actor_role <> 'reviewer'` 结果为 NULL 不会提前返回，
-- 于是把合法的服务端更新当成审核员越权并抛错，导致管理员删除账号失败。
-- 改为 IS DISTINCT FROM 后，非审核员（含无登录上下文）直接放行，
-- 审核员仍然只能修改审核字段。

create or replace function heika_private.guard_reviewer_content_updates()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_role text;
begin
  select p.role into actor_role from public.profiles p where p.id = (select auth.uid());
    -- 用 IS DISTINCT FROM：service_role、SQL 脚本和删除用户触发的外键置空没有 auth.uid()，
  -- 原来的 <> 比较在 NULL 时不会提前返回，导致这些正常操作被误判为审核员越权。
  if actor_role is distinct from 'reviewer' then return new; end if;
  if tg_table_name = 'posts' then
    -- This transaction-local marker can only be set inside the trusted review RPC.
    if current_setting('heika.apply_review_post_id', true) = new.id::text then return new; end if;
    if (to_jsonb(new) - array['status','moderation_review_note','moderation_reviewed_at','moderation_reviewed_by','updated_at'])
       is distinct from
       (to_jsonb(old) - array['status','moderation_review_note','moderation_reviewed_at','moderation_reviewed_by','updated_at']) then
      raise exception '审核员只能修改审核状态和审核记录';
    end if;
  elsif tg_table_name = 'post_revisions' then
    if (to_jsonb(new) - array['status','review_note','reviewed_at','reviewed_by','updated_at'])
       is distinct from
       (to_jsonb(old) - array['status','review_note','reviewed_at','reviewed_by','updated_at']) then
      raise exception '审核员不能改写投稿版本';
    end if;
    if new.status = 'approved' and not exists (
      select 1 from public.posts p where p.id = new.post_id and p.status = 'published'
        and p.title = new.payload->>'title' and p.body = new.payload->>'body'
        and p.channel = coalesce(new.payload->>'channel','community')
        and p.content_type = coalesce(new.payload->>'contentType','community_post')
        and p.resource_data = coalesce(new.payload->'resourceData','{}'::jsonb)
    ) then
      raise exception '请通过审核流程应用修改后再确认版本';
    end if;
  end if;
  return new;
end
$$;
