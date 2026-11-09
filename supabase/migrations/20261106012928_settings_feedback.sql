-- Settings 2.0: user controlled comment notifications and general feedback.
-- Additive migration; existing preferences, notifications, and user content remain intact.
alter table public.browsing_preferences
  add column if not exists notification_comments_enabled boolean not null default true;

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('suggestion', 'problem', 'other')),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  review_note text check (review_note is null or char_length(btrim(review_note)) <= 1000),
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_feedback_status_created_idx
  on public.user_feedback(status, created_at desc, id desc);
create index if not exists user_feedback_user_created_idx
  on public.user_feedback(user_id, created_at desc);

alter table public.user_feedback enable row level security;
grant select, insert on public.user_feedback to authenticated;
grant update (status, review_note, handled_by, handled_at) on public.user_feedback to authenticated;
revoke all on public.user_feedback from anon;

create policy user_feedback_submit_own on public.user_feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_feedback_read_own_or_staff on public.user_feedback
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.has_staff_permission('reports.manage'))
  );

create policy user_feedback_staff_update on public.user_feedback
  for update to authenticated
  using ((select public.has_staff_permission('reports.manage')))
  with check ((select public.has_staff_permission('reports.manage')));

-- Keep comment/reply events in the existing in-app notification system, while
-- honoring the recipient's setting at event creation time.
create or replace function public.notify_comment_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_parent_author uuid;
begin
  select p.author_id into v_owner from public.posts p where p.id = new.post_id;
  if new.parent_id is null then
    if v_owner is not null and v_owner <> new.author_id and coalesce((
      select bp.notification_comments_enabled from public.browsing_preferences bp where bp.user_id = v_owner
    ), true) then
      insert into public.app_notifications(recipient_id,actor_id,notification_type,entity_id,post_id,comment_id,title)
      values(v_owner,new.author_id,'comment',new.id,new.post_id,new.id,'有人评论了你的内容') on conflict do nothing;
    end if;
  else
    select c.author_id into v_parent_author from public.comments c where c.id = new.parent_id;
    if v_parent_author is not null and v_parent_author <> new.author_id and coalesce((
      select bp.notification_comments_enabled from public.browsing_preferences bp where bp.user_id = v_parent_author
    ), true) then
      insert into public.app_notifications(recipient_id,actor_id,notification_type,entity_id,post_id,comment_id,title)
      values(v_parent_author,new.author_id,'reply',new.id,new.post_id,new.id,'有人回复了你的评论') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_comment_conversation() from public, anon, authenticated;
