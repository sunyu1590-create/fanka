create table public.experience_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  event_type text not null check (event_type in ('flip', 'rating')),
  post_id uuid not null references public.posts(id) on delete cascade,
  points integer not null check (points > 0),
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create index experience_events_user_created_idx
  on public.experience_events (user_id, created_at desc);
alter table public.experience_events enable row level security;
create policy experience_events_read_own on public.experience_events
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.experience_events to authenticated;
revoke insert, update, delete on public.experience_events from anon, authenticated;

create or replace function public.record_experience_event(p_event_type text, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_timezone text;
  v_local_date date;
  v_points integer := 0;
  v_event_key text;
  v_daily_count integer;
  v_inserted integer;
  v_total integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_event_type not in ('flip', 'rating') then raise exception 'invalid experience event'; end if;
  if not exists (
    select 1 from public.posts p
    where p.id = p_post_id and p.status = 'published' and p.author_id is distinct from v_user
  ) then raise exception 'post is not eligible for experience'; end if;

  select coalesce(p.timezone, 'Asia/Shanghai') into v_timezone
  from public.profiles p where p.id = v_user;
  v_local_date := (now() at time zone v_timezone)::date;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || v_local_date::text || ':' || p_event_type, 0));

  if p_event_type = 'flip' then
    if not exists (
      select 1 from public.user_interactions i
      where i.user_id = v_user and i.post_id = p_post_id and i.opened_at is not null
    ) then raise exception 'card has not been opened'; end if;
    v_event_key := 'flip:' || v_local_date::text || ':' || p_post_id::text;
    select count(*)::integer into v_daily_count
    from public.experience_events e
    where e.user_id = v_user and e.event_type = 'flip'
      and (e.created_at at time zone v_timezone)::date = v_local_date;
    if v_daily_count < 10 then
      v_points := case when v_daily_count = 0 then 10 else 2 end;
    end if;
  else
    if not exists (
      select 1 from public.user_interactions i
      where i.user_id = v_user and i.post_id = p_post_id and i.rating between 1 and 5
    ) then raise exception 'rating is missing'; end if;
    v_event_key := 'rating:' || p_post_id::text;
    select count(*)::integer into v_daily_count
    from public.experience_events e
    where e.user_id = v_user and e.event_type = 'rating'
      and (e.created_at at time zone v_timezone)::date = v_local_date;
    if v_daily_count < 5 then v_points := 2; end if;
  end if;

  if v_points > 0 then
    insert into public.experience_events(user_id, event_key, event_type, post_id, points)
    values (v_user, v_event_key, p_event_type, p_post_id, v_points)
    on conflict (user_id, event_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then v_points := 0; end if;
  end if;

  select coalesce(sum(points), 0)::integer into v_total
  from public.experience_events where user_id = v_user;
  return jsonb_build_object('awarded', v_points, 'total', v_total);
end;
$$;
revoke all on function public.record_experience_event(text, uuid) from public, anon;
grant execute on function public.record_experience_event(text, uuid) to authenticated;

create or replace function public.my_experience_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', coalesce((select sum(e.points)::integer from public.experience_events e where e.user_id = auth.uid()), 0),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('type', e.event_type, 'points', e.points, 'createdAt', e.created_at) order by e.created_at desc)
      from (select event_type, points, created_at from public.experience_events where user_id = auth.uid() order by created_at desc limit 20) e
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.my_experience_summary() from public, anon;
grant execute on function public.my_experience_summary() to authenticated;
