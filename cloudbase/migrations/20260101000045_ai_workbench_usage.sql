create table public.ai_workbench_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ai_workbench_usage_user_created_idx on public.ai_workbench_usage(user_id, created_at desc);
alter table public.ai_workbench_usage enable row level security;
revoke all on public.ai_workbench_usage from public, anon, authenticated;
grant all on public.ai_workbench_usage to service_role;

create or replace function public.consume_ai_workbench_slot(p_user_id uuid)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
declare v_recent integer; v_daily integer;
begin
  if p_user_id is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':ai-workbench',0));
  select count(*)::integer into v_recent from public.ai_workbench_usage where user_id=p_user_id and created_at>=now()-interval '1 minute';
  select count(*)::integer into v_daily from public.ai_workbench_usage where user_id=p_user_id and created_at>=now()-interval '24 hours';
  if v_recent>=4 or v_daily>=60 then return false; end if;
  insert into public.ai_workbench_usage(user_id) values(p_user_id);
  return true;
end;
$$;
revoke all on function public.consume_ai_workbench_slot(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_workbench_slot(uuid) to service_role;
