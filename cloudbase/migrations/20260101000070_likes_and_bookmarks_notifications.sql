-- Add engagement events to the existing in-app notification center.
-- The triggers only emit on an actual like transition or a new bookmark row,
-- so retries/upserts that leave the state unchanged do not duplicate notices.
alter table public.app_notifications
  drop constraint if exists app_notifications_notification_type_check;
alter table public.app_notifications
  add constraint app_notifications_notification_type_check
  check (notification_type in ('creator_post','topic_post','series_post','comment','reply','moderation','like','bookmark'));

create or replace function heika_private.notify_post_engagement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_post_id uuid;
  v_type text;
  v_title text;
  v_owner uuid;
begin
  if tg_table_name = 'user_interactions' then
    if new.liked is distinct from true then return new; end if;
    if tg_op = 'UPDATE' and old.liked is true then return new; end if;
    v_actor := new.user_id;
    v_post_id := new.post_id;
    v_type := 'like';
    v_title := '赞了你的作品';
  else
    v_actor := new.user_id;
    v_post_id := new.post_id;
    v_type := 'bookmark';
    v_title := '收藏了你的作品';
  end if;

  select p.author_id into v_owner from public.posts p where p.id = v_post_id;
  if v_owner is not null and v_owner <> v_actor then
    insert into public.app_notifications(recipient_id, actor_id, notification_type, entity_id, post_id, title)
    values(v_owner, v_actor, v_type, gen_random_uuid(), v_post_id, v_title);
  end if;
  return new;
end;
$$;

revoke all on function heika_private.notify_post_engagement() from public, anon, authenticated;
drop trigger if exists user_interactions_notify_like on public.user_interactions;
create trigger user_interactions_notify_like
  after insert or update of liked on public.user_interactions
  for each row execute function heika_private.notify_post_engagement();

drop trigger if exists bookmarks_notify_author on public.bookmarks;
create trigger bookmarks_notify_author
  after insert on public.bookmarks
  for each row execute function heika_private.notify_post_engagement();
