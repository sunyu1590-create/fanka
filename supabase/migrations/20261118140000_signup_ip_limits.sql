-- 注册 IP 限流：一个 IP 在窗口期内最多成功注册 N 个账号。
-- 表只允许 service role 访问，客户端无法读写。
create table if not exists public.signup_ip_slots (
  id bigserial primary key,
  ip text not null,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists signup_ip_slots_lookup
  on public.signup_ip_slots (ip, created_at desc);

alter table public.signup_ip_slots enable row level security;
revoke all on public.signup_ip_slots from anon, authenticated;

-- 原子抢占名额：同一 IP 串行执行（advisory lock），超出限额返回 null。
-- 返回 slot id，注册失败时调用方用它回滚，避免白白消耗名额。
create or replace function public.claim_signup_slot(
  p_ip text,
  p_limit int default 2,
  p_window_minutes int default 60
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
  slot_id bigint;
begin
  if p_ip is null or btrim(p_ip) = '' then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_ip));

  select count(*) into used
    from public.signup_ip_slots
   where ip = p_ip
     and created_at > now() - make_interval(mins => p_window_minutes);

  if used >= p_limit then
    return null;
  end if;

  insert into public.signup_ip_slots (ip) values (p_ip) returning id into slot_id;
  return slot_id;
end;
$$;

revoke all on function public.claim_signup_slot(text, int, int) from public, anon, authenticated;
grant execute on function public.claim_signup_slot(text, int, int) to service_role;
