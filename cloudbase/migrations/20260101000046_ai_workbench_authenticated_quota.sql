-- Let the authenticated caller consume only their own AI quota. The function
-- uses its owner rights for the RLS-protected usage table after binding the
-- requested user id to auth.uid().
create or replace function public.consume_ai_workbench_slot(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_recent integer;
  v_daily integer;
begin
  if v_user_id is null or p_user_id is distinct from v_user_id then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':ai-workbench', 0)
  );
  select count(*)::integer into v_recent
    from public.ai_workbench_usage
    where user_id = v_user_id and created_at >= pg_catalog.now() - interval '1 minute';
  select count(*)::integer into v_daily
    from public.ai_workbench_usage
    where user_id = v_user_id and created_at >= pg_catalog.now() - interval '24 hours';

  if v_recent >= 4 or v_daily >= 60 then return false; end if;
  insert into public.ai_workbench_usage(user_id) values (v_user_id);
  return true;
end;
$$;

revoke all on function public.consume_ai_workbench_slot(uuid) from public, anon, authenticated, service_role;
grant execute on function public.consume_ai_workbench_slot(uuid) to authenticated;
