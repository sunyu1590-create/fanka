-- Private reading highlights.
create table public.post_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  excerpt text not null check (char_length(excerpt) between 1 and 1000),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index post_highlights_user_created_idx on public.post_highlights(user_id, created_at desc);
alter table public.post_highlights enable row level security;
create policy post_highlights_own on public.post_highlights for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.post_highlights to authenticated;

-- Topic follows and durable recommendation controls.
create table public.topic_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_id bigint not null references public.interest_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);
create index topic_follows_topic_idx on public.topic_follows(topic_id, created_at desc);
alter table public.topic_follows enable row level security;
create policy topic_follows_own on public.topic_follows for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.topic_follows to authenticated;

create table public.user_recommendation_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  filter_type text not null check (filter_type in ('author', 'topic')),
  target_author_id uuid references public.profiles(id) on delete cascade,
  target_topic_id bigint references public.interest_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((filter_type = 'author' and target_author_id is not null and target_topic_id is null)
      or (filter_type = 'topic' and target_topic_id is not null and target_author_id is null))
);
create unique index user_recommendation_author_unique on public.user_recommendation_filters(user_id, target_author_id) where filter_type = 'author';
create unique index user_recommendation_topic_unique on public.user_recommendation_filters(user_id, target_topic_id) where filter_type = 'topic';
create index user_recommendation_filters_user_idx on public.user_recommendation_filters(user_id, created_at desc);
alter table public.user_recommendation_filters enable row level security;
create policy user_recommendation_filters_own on public.user_recommendation_filters for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.user_recommendation_filters to authenticated;

create or replace function public.get_recommendation_page(p_page integer, p_limit integer, p_tag bigint default null, p_query text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible_posts as materialized (
    select p.id, p.created_at
    from public.posts p
    where p.status = 'published'
      and (p_tag is null or p.tag_id = p_tag)
      and (p_query is null or strpos(lower(p.title), lower(p_query)) > 0)
      and not exists (
        select 1 from public.user_recommendation_filters f
        where f.user_id = auth.uid() and f.filter_type = 'author' and f.target_author_id = p.author_id
      )
      and not exists (
        select 1 from public.post_topics pt
        join public.user_recommendation_filters f on f.target_topic_id = pt.topic_id
        where pt.post_id = p.id and f.user_id = auth.uid() and f.filter_type = 'topic'
      )
      and not exists (
        select 1 from public.user_interactions i
        where i.post_id = p.id and i.user_id = auth.uid() and i.skipped_at is not null
      )
  ), page_rows as (
    select id from visible_posts order by created_at desc, id desc
    limit least(greatest(coalesce(p_limit, 12), 1), 24)
    offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_limit, 12), 1), 24)
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id) from page_rows), '[]'::jsonb),
    'total', (select count(*) from visible_posts)
  );
$$;
revoke all on function public.get_recommendation_page(integer, integer, bigint, text) from public;
grant execute on function public.get_recommendation_page(integer, integer, bigint, text) to anon, authenticated;

-- Single-choice polls. Voter identities are only visible to their own account;
-- public results expose aggregate counters on the option rows.
create table public.post_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 180),
  created_at timestamptz not null default now()
);
create table public.post_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.post_polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  position smallint not null check (position between 0 and 3),
  vote_count integer not null default 0 check (vote_count >= 0),
  unique (poll_id, id),
  unique (poll_id, position)
);
create table public.post_poll_votes (
  poll_id uuid not null references public.post_polls(id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  foreign key (poll_id, option_id) references public.post_poll_options(poll_id, id) on delete cascade
);
create index post_poll_votes_option_idx on public.post_poll_votes(option_id);
alter table public.post_polls enable row level security;
alter table public.post_poll_options enable row level security;
alter table public.post_poll_votes enable row level security;
create policy post_polls_public_read on public.post_polls for select to anon, authenticated using (
  exists (select 1 from public.posts p where p.id = post_id and (p.status = 'published' or p.author_id = (select auth.uid())))
);
create policy post_polls_author_manage on public.post_polls for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
create policy post_poll_options_public_read on public.post_poll_options for select to anon, authenticated using (
  exists (select 1 from public.post_polls pp join public.posts p on p.id = pp.post_id
    where pp.id = poll_id and (p.status = 'published' or p.author_id = (select auth.uid())))
);
create policy post_poll_options_author_manage on public.post_poll_options for all to authenticated
  using (exists (select 1 from public.post_polls pp join public.posts p on p.id = pp.post_id
    where pp.id = poll_id and p.author_id = (select auth.uid())))
  with check (exists (select 1 from public.post_polls pp join public.posts p on p.id = pp.post_id
    where pp.id = poll_id and p.author_id = (select auth.uid())));
create policy post_poll_votes_own_read on public.post_poll_votes for select to authenticated using (user_id = (select auth.uid()));
create policy post_poll_votes_own_insert on public.post_poll_votes for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.post_polls pp join public.posts p on p.id = pp.post_id
    where pp.id = poll_id and p.status = 'published'
  )
);
create policy post_poll_votes_own_update on public.post_poll_votes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.post_polls, public.post_poll_options to anon, authenticated;
grant insert, update, delete on public.post_polls, public.post_poll_options to authenticated;
grant select, insert, update on public.post_poll_votes to authenticated;

create or replace function public.update_post_poll_vote_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.post_poll_options set vote_count = vote_count + 1 where id = new.option_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.post_poll_options set vote_count = greatest(0, vote_count - 1) where id = old.option_id;
    return old;
  elsif old.option_id is distinct from new.option_id then
    update public.post_poll_options set vote_count = greatest(0, vote_count - 1) where id = old.option_id;
    update public.post_poll_options set vote_count = vote_count + 1 where id = new.option_id;
  end if;
  return new;
end;
$$;
revoke all on function public.update_post_poll_vote_counts() from public, anon, authenticated;
create trigger post_poll_vote_counts after insert or update of option_id or delete on public.post_poll_votes
  for each row execute function public.update_post_poll_vote_counts();

-- Series subscriptions.
create table public.series_subscriptions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  series_id uuid not null references public.post_series(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);
create index series_subscriptions_series_idx on public.series_subscriptions(series_id, created_at desc);
alter table public.series_subscriptions enable row level security;
create policy series_subscriptions_own on public.series_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.series_subscriptions to authenticated;

-- Deliver new topic and series posts in the existing notification center.
alter table public.app_notifications drop constraint app_notifications_notification_type_check;
alter table public.app_notifications add constraint app_notifications_notification_type_check
  check (notification_type in ('creator_post', 'topic_post', 'series_post', 'comment', 'reply'));

create or replace function public.notify_followers_on_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and new.author_id is not null and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.app_notifications(recipient_id, actor_id, notification_type, entity_id, post_id, title)
    select f.follower_id, new.author_id, 'creator_post', new.id, new.id, '你关注的创作者发布了新内容'
    from public.creator_follows f where f.creator_id = new.author_id and f.follower_id <> new.author_id
    on conflict (recipient_id, notification_type, entity_id) do nothing;

    insert into public.app_notifications(recipient_id, actor_id, notification_type, entity_id, post_id, title)
    select distinct f.user_id, new.author_id, 'topic_post', new.id, new.id, '你关注的话题有了新内容'
    from public.post_topics pt join public.topic_follows f on f.topic_id = pt.topic_id
    where pt.post_id = new.id and f.user_id <> new.author_id
    on conflict (recipient_id, notification_type, entity_id) do nothing;

    if new.series_id is not null then
      insert into public.app_notifications(recipient_id, actor_id, notification_type, entity_id, post_id, title)
      select s.user_id, new.author_id, 'series_post', new.id, new.id, '你订阅的作品系列更新了'
      from public.series_subscriptions s where s.series_id = new.series_id and s.user_id <> new.author_id
      on conflict (recipient_id, notification_type, entity_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_followers_on_publish() from public, anon, authenticated;
