-- 回滚：恢复 20261104065039 版本的 notify_followers_on_publish，去掉 collection_follows 通知分支。
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
