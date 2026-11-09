-- Keep staff media access inside existing read policies to avoid duplicate
-- permissive SELECT policies, while still exposing only reviewable content.
drop policy if exists post_media_staff_read on public.post_media;
drop policy if exists media_read on public.post_media;
create policy media_read on public.post_media for select to anon, authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and (
      p.author_id = (select auth.uid())
      or (select public.is_admin())
      or (select public.has_staff_permission('content.review'))
      or (
        p.status = 'published'
        and not coalesce((select profile.notes_private from public.profiles profile where profile.id = p.author_id), false)
      )
    )
  ));

drop policy if exists post_topics_staff_read on public.post_topics;
drop policy if exists post_topics_read on public.post_topics;
create policy post_topics_read on public.post_topics for select to anon, authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and (
      p.status = 'published'
      or p.author_id = (select auth.uid())
      or (select public.is_admin())
      or (select public.has_staff_permission('content.review'))
    )
  ));

create index if not exists ai_resource_feedback_reporter_idx on public.ai_resource_feedback(reporter_id);
create index if not exists ai_resource_feedback_handler_idx on public.ai_resource_feedback(handled_by) where handled_by is not null;
create index if not exists ai_resource_versions_creator_idx on public.ai_resource_versions(created_by) where created_by is not null;
create index if not exists moderation_appeals_handler_idx on public.moderation_appeals(handled_by) where handled_by is not null;
create index if not exists post_revisions_author_idx on public.post_revisions(author_id);
create index if not exists post_revisions_reviewer_idx on public.post_revisions(reviewed_by) where reviewed_by is not null;
