create table public.post_rating_stats (
  post_id uuid primary key references public.posts(id) on delete cascade,
  rating_count integer not null default 0 check (rating_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),
  updated_at timestamptz not null default now(),
  check (rating_sum >= rating_count)
);

alter table public.post_rating_stats enable row level security;
create policy post_rating_stats_read on public.post_rating_stats
  for select to anon, authenticated using (true);
grant select on public.post_rating_stats to anon, authenticated;
revoke insert, update, delete on public.post_rating_stats from anon, authenticated;

insert into public.post_rating_stats (post_id, rating_count, rating_sum)
select post_id, count(*)::integer, sum(rating)::integer
from public.user_interactions
where rating is not null
group by post_id;

create function public.sync_post_rating_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and old.rating is not null then
    update public.post_rating_stats
    set rating_count = rating_count - 1,
        rating_sum = rating_sum - old.rating,
        updated_at = now()
    where post_id = old.post_id;

    delete from public.post_rating_stats
    where post_id = old.post_id and rating_count = 0;
  end if;

  if tg_op <> 'DELETE' and new.rating is not null then
    insert into public.post_rating_stats (post_id, rating_count, rating_sum)
    values (new.post_id, 1, new.rating)
    on conflict (post_id) do update
    set rating_count = public.post_rating_stats.rating_count + 1,
        rating_sum = public.post_rating_stats.rating_sum + excluded.rating_sum,
        updated_at = now();
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.sync_post_rating_stats() from public, anon, authenticated;

create trigger user_interactions_rating_stats
after insert or update of rating or delete on public.user_interactions
for each row execute function public.sync_post_rating_stats();
