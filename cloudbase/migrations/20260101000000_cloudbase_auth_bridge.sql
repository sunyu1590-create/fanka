-- CloudBase 原生内核适配层
-- 本环境的身份认证使用 CloudBase Auth（用户主键为 bigint，非 Supabase uuid），
-- 因此将 JWT 中的 sub 映射到应用侧 uuid，使既有 RLS 策略（auth.uid() = uuid）继续成立。
create table if not exists public.cb_user_map (
  sub text primary key,
  uid uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists cb_user_map_uid_idx on public.cb_user_map(uid);

alter table public.cb_user_map enable row level security;

drop function if exists auth.uid();

create function auth.uid() returns uuid language sql stable as $$
  select (
    select m.uid
    from public.cb_user_map m
    where m.sub = nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )
$$;

-- 登录用户首次访问时确保存在 uuid 身份（供服务端注册流程调用）
create or replace function public.ensure_user_identity(p_sub text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if p_sub is null or length(trim(p_sub)) = 0 then
    raise exception 'missing sub';
  end if;
  insert into public.cb_user_map(sub) values (p_sub)
    on conflict (sub) do nothing;
  select uid into v_uid from public.cb_user_map where sub = p_sub;
  return v_uid;
end $$;
