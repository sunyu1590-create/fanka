-- 管理员删除账号：把与外键约束冲突的数据按依赖顺序清掉，再删除 auth 用户。
-- 只允许 service_role 调用（网页端与管理端都经由 /api/v1/admin/users/[id] 的 DELETE）。
create or replace function public.admin_delete_user(p_user uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_nickname text;
  v_posts int := 0;
  v_orders int := 0;
begin
  if p_user = p_actor then
    raise exception '不能删除自己的账号';
  end if;
  select role, nickname into v_role, v_nickname from profiles where id = p_user;
  if v_role is null then
    raise exception '账号不存在或已被删除';
  end if;
  if v_role = 'admin' then
    raise exception '不能删除管理员账号，请先转移其管理身份';
  end if;

  -- 付费订单涉及资金记录，保留不删；存在订单时拒绝删除，避免账目断链。
  select count(*) into v_orders from afdian_orders where user_id = p_user;
  if v_orders > 0 then
    raise exception '该账号存在 % 条付费订单，请先处理财务记录', v_orders;
  end if;

  select count(*) into v_posts from posts where author_id = p_user;

  delete from dm_messages where conversation_id in (
    select id from dm_conversations where user_a = p_user or user_b = p_user
  );
  delete from dm_reports where reporter_id = p_user or user_id = p_user;
  delete from dm_conversations where user_a = p_user or user_b = p_user;
  -- 该账号作为管理员下发过的发言限制，先解绑再删（set_by 为 RESTRICT）。
  delete from community_restrictions where set_by = p_user;
  delete from posts where author_id = p_user;
  -- profiles / 其余业务表通过 auth.users 级联清理。
  delete from auth.users where id = p_user;

  return jsonb_build_object('id', p_user, 'nickname', v_nickname, 'removed_posts', v_posts);
end;
$$;

revoke all on function public.admin_delete_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_user(uuid, uuid) to service_role;
