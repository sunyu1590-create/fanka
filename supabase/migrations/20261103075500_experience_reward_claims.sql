create table public.experience_reward_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  level smallint not null check (level between 1 and 10),
  claimed_at timestamptz not null default now(),
  primary key (user_id, level)
);

alter table public.experience_reward_claims enable row level security;

create policy experience_reward_claims_read_own
  on public.experience_reward_claims
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy experience_reward_claims_insert_own_unlocked
  on public.experience_reward_claims
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and coalesce((
      select sum(points)::integer
      from public.experience_events
      where user_id = (select auth.uid())
    ), 0) >= case level
      when 1 then 0
      when 2 then 100
      when 3 then 240
      when 4 then 430
      when 5 then 680
      when 6 then 1000
      when 7 then 1390
      when 8 then 1850
      when 9 then 2380
      when 10 then 2980
    end
  );

grant select, insert on public.experience_reward_claims to authenticated;
revoke update, delete on public.experience_reward_claims from anon, authenticated;

create or replace function public.claim_experience_reward(p_level smallint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_threshold integer;
  v_total integer;
  v_claimed_at timestamptz;
  v_inserted integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_level is null or p_level < 1 or p_level > 10 then raise exception 'invalid reward level'; end if;

  v_threshold := case p_level
    when 1 then 0
    when 2 then 100
    when 3 then 240
    when 4 then 430
    when 5 then 680
    when 6 then 1000
    when 7 then 1390
    when 8 then 1850
    when 9 then 2380
    when 10 then 2980
  end;

  select coalesce(sum(points), 0)::integer into v_total
  from public.experience_events
  where user_id = v_user;
  if v_total < v_threshold then raise exception 'experience threshold not reached'; end if;

  insert into public.experience_reward_claims(user_id, level)
  values (v_user, p_level)
  on conflict (user_id, level) do nothing
  returning claimed_at into v_claimed_at;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select claimed_at into v_claimed_at
    from public.experience_reward_claims
    where user_id = v_user and level = p_level;
  end if;

  return jsonb_build_object(
    'level', p_level,
    'claimed', v_inserted = 1,
    'claimedAt', v_claimed_at,
    'total', v_total
  );
end;
$$;

revoke all on function public.claim_experience_reward(smallint) from public, anon;
grant execute on function public.claim_experience_reward(smallint) to authenticated;
