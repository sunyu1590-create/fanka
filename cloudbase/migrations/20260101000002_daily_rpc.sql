-- Daily state changes are exposed only through authenticated, transactional RPCs.
create table public.recommendation_settings (id int primary key default 1 check(id=1), interest_slots int not null default 2 check(interest_slots between 0 and 5), adjacent_slots int not null default 1 check(adjacent_slots between 0 and 5), curated_slots int not null default 1 check(curated_slots between 0 and 5), surprise_slots int not null default 1 check(surprise_slots between 0 and 5), updated_at timestamptz not null default now(), check(interest_slots+adjacent_slots+curated_slots+surprise_slots=5));
insert into public.recommendation_settings(id) values(1);
alter table public.recommendation_settings enable row level security;
create policy settings_read on public.recommendation_settings for select using(true);
create policy settings_admin on public.recommendation_settings for update using(public.is_admin()) with check(public.is_admin());
create table public.curated_posts (post_id uuid primary key references public.posts(id) on delete cascade, priority int not null default 0);
alter table public.curated_posts enable row level security;
create policy curated_read on public.curated_posts for select using(true);
create policy curated_admin on public.curated_posts for all using(public.is_admin()) with check(public.is_admin());

create or replace function public.get_daily_deck() returns table(deck_id uuid, local_date date, slot int, post_id uuid, opened_at timestamptz, swapped_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); tz text; today date; did uuid; chosen uuid[]:=array[]::uuid[]; candidate uuid; slot_no int; interests bigint[]; cfg public.recommendation_settings%rowtype;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select p.timezone into tz from public.profiles p where p.id=uid;
 if tz is null then raise exception 'profile missing'; end if;
 today:=(now() at time zone tz)::date;
 perform pg_advisory_xact_lock(hashtext(uid::text||today::text));
 select d.id into did from public.daily_decks d where d.user_id=uid and d.local_date=today;
 if did is null then
   insert into public.daily_decks(user_id,local_date,timezone) values(uid,today,tz) returning id into did;
   select array_agg(tag_id) into interests from public.user_interests where user_id=uid;
   select * into cfg from public.recommendation_settings where id=1;
   for slot_no in 1..5 loop
     candidate:=null;
     if slot_no<=cfg.interest_slots then
       select p.id into candidate from public.posts p where p.status='published' and p.tag_id=any(coalesce(interests,array[]::bigint[])) and not(p.id=any(chosen)) order by md5(uid::text||today::text||p.id::text) limit 1;
     elsif slot_no<=cfg.interest_slots+cfg.adjacent_slots then
       select p.id into candidate from public.posts p where p.status='published' and not(p.tag_id=any(coalesce(interests,array[]::bigint[]))) and not(p.id=any(chosen)) order by md5(uid::text||today::text||p.id::text) limit 1;
     elsif slot_no<=cfg.interest_slots+cfg.adjacent_slots+cfg.curated_slots then
       select p.id into candidate from public.posts p join public.curated_posts c on c.post_id=p.id where p.status='published' and not(p.id=any(chosen)) order by c.priority desc,md5(uid::text||today::text||p.id::text) limit 1;
     end if;
     if candidate is null then select p.id into candidate from public.posts p where p.status='published' and not(p.id=any(chosen)) order by md5(uid::text||today::text||p.id::text) limit 1; end if;
     if candidate is null then raise exception 'at least five published posts required'; end if;
     insert into public.daily_cards(deck_id,slot,post_id) values(did,slot_no,candidate);
     chosen:=array_append(chosen,candidate);
   end loop;
 end if;
 return query select d.id,d.local_date,c.slot,c.post_id,c.opened_at,d.swapped_at from public.daily_decks d join public.daily_cards c on c.deck_id=d.id where d.id=did order by c.slot;
end $$;

create or replace function public.open_daily_card(card_slot int) returns table(deck_id uuid, local_date date, slot int, post_id uuid, opened_at timestamptz, swapped_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare did uuid; tz text; today date;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if card_slot not between 1 and 5 then raise exception 'invalid slot'; end if;
 perform public.get_daily_deck();
 select p.timezone into tz from public.profiles p where p.id=auth.uid(); today:=(now() at time zone tz)::date;
 select d.id into did from public.daily_decks d where d.user_id=auth.uid() and d.local_date=today;
 update public.daily_cards c set opened_at=coalesce(c.opened_at,now()) where c.deck_id=did and c.slot=card_slot;
 return query select d.id,d.local_date,c.slot,c.post_id,c.opened_at,d.swapped_at from public.daily_decks d join public.daily_cards c on c.deck_id=d.id where d.id=did order by c.slot;
end $$;

create or replace function public.swap_daily_card() returns table(deck_id uuid, local_date date, slot int, post_id uuid, opened_at timestamptz, swapped_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare did uuid; tz text; today date; target_slot int; replacement uuid;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 perform public.get_daily_deck();
 select p.timezone into tz from public.profiles p where p.id=auth.uid(); today:=(now() at time zone tz)::date;
 select d.id into did from public.daily_decks d where d.user_id=auth.uid() and d.local_date=today for update;
 if (select d.swapped_at is not null from public.daily_decks d where d.id=did) then raise exception 'already swapped today'; end if;
 select c.slot into target_slot from public.daily_cards c where c.deck_id=did and c.opened_at is null order by c.slot limit 1;
 if target_slot is null then raise exception 'all cards already opened'; end if;
 select p.id into replacement from public.posts p where p.status='published' and not exists(select 1 from public.daily_cards c where c.deck_id=did and c.post_id=p.id) order by md5(auth.uid()::text||today::text||'swap'||p.id::text) limit 1;
 if replacement is null then raise exception 'no replacement available'; end if;
 update public.daily_cards c set post_id=replacement where c.deck_id=did and c.slot=target_slot;
 update public.daily_decks d set swapped_at=now() where d.id=did;
 return query select d.id,d.local_date,c.slot,c.post_id,c.opened_at,d.swapped_at from public.daily_decks d join public.daily_cards c on c.deck_id=d.id where d.id=did order by c.slot;
end $$;
revoke all on function public.get_daily_deck() from public;
revoke all on function public.open_daily_card(int) from public;
revoke all on function public.swap_daily_card() from public;
grant execute on function public.get_daily_deck() to authenticated;
grant execute on function public.open_daily_card(int) to authenticated;
grant execute on function public.swap_daily_card() to authenticated;
