alter table public.profiles
  add column membership_tier text not null default 'free'
    check (membership_tier in ('free', 'plus', 'pro'));

create policy profiles_admin_membership_update
on public.profiles for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));
grant update(membership_tier) on public.profiles to authenticated;

create or replace function public.record_experience_event(p_event_type text, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_timezone text;
  v_membership text := 'free';
  v_local_date date;
  v_points integer := 0;
  v_bonus integer := 0;
  v_event_key text;
  v_daily_count integer;
  v_inserted integer;
  v_total integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_event_type not in ('flip', 'rating') then raise exception 'invalid experience event'; end if;
  if not exists (select 1 from public.posts p where p.id = p_post_id and p.status = 'published' and p.author_id is distinct from v_user) then raise exception 'post is not eligible for experience'; end if;
  select coalesce(p.timezone, 'Asia/Shanghai'), coalesce(p.membership_tier, 'free')
    into v_timezone, v_membership from public.profiles p where p.id = v_user;
  v_local_date := (now() at time zone v_timezone)::date;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || v_local_date::text || ':' || p_event_type, 0));

  if p_event_type = 'flip' then
    if not exists (select 1 from public.user_interactions i where i.user_id = v_user and i.post_id = p_post_id and i.opened_at is not null) then raise exception 'card has not been opened'; end if;
    v_event_key := 'flip:' || v_local_date::text || ':' || p_post_id::text;
    select count(*)::integer into v_daily_count from public.experience_events e where e.user_id = v_user and e.event_type = 'flip' and (e.created_at at time zone v_timezone)::date = v_local_date;
    if v_daily_count < 10 then
      v_points := case when v_daily_count = 0 then 10 else 2 end;
      if v_daily_count = 0 then v_bonus := case v_membership when 'plus' then 3 when 'pro' then 6 else 0 end; end if;
      v_points := v_points + v_bonus;
    end if;
  else
    if not exists (select 1 from public.user_interactions i where i.user_id = v_user and i.post_id = p_post_id and i.rating between 1 and 5) then raise exception 'rating is missing'; end if;
    v_event_key := 'rating:' || p_post_id::text;
    select count(*)::integer into v_daily_count from public.experience_events e where e.user_id = v_user and e.event_type = 'rating' and (e.created_at at time zone v_timezone)::date = v_local_date;
    if v_daily_count < 5 then v_points := 2; end if;
  end if;

  if v_points > 0 then
    insert into public.experience_events(user_id, event_key, event_type, post_id, points) values (v_user, v_event_key, p_event_type, p_post_id, v_points) on conflict (user_id, event_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then v_points := 0; end if;
  end if;
  select coalesce(sum(points), 0)::integer into v_total from public.experience_events where user_id = v_user;
  return jsonb_build_object('awarded', v_points, 'total', v_total, 'membershipTier', v_membership);
end;
$$;

create or replace function public.my_experience_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', coalesce((select sum(e.points)::integer from public.experience_events e where e.user_id = auth.uid()), 0),
    'membershipTier', coalesce((select p.membership_tier from public.profiles p where p.id = auth.uid()), 'free'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.event_type, 'points', e.points, 'createdAt', e.created_at) order by e.created_at desc)
      from (select event_type, points, created_at from public.experience_events where user_id = auth.uid() order by created_at desc limit 20) e), '[]'::jsonb)
  );
$$;
