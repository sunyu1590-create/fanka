-- Fold staff review writes into the existing media/topic policies so each
-- table has one policy per read/write action and preserves author behavior.
drop policy if exists post_media_admin_manage on public.post_media;
drop policy if exists media_insert on public.post_media;
create policy media_insert on public.post_media for insert to authenticated
  with check (
    (exists(select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
      and split_part(storage_path, '/', 1) = (select auth.uid())::text)
    or ((select public.has_staff_permission('content.review'))
      and current_setting('heika.apply_review_post_id', true) = post_id::text)
  );
drop policy if exists media_update on public.post_media;
create policy media_update on public.post_media for update to authenticated
  using (
    exists(select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
    or ((select public.has_staff_permission('content.review'))
      and current_setting('heika.apply_review_post_id', true) = post_id::text)
  )
  with check (
    (exists(select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
      and split_part(storage_path, '/', 1) = (select auth.uid())::text)
    or ((select public.has_staff_permission('content.review'))
      and current_setting('heika.apply_review_post_id', true) = post_id::text)
  );
drop policy if exists media_delete on public.post_media;
create policy media_delete on public.post_media for delete to authenticated
  using (
    exists(select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
    or ((select public.has_staff_permission('content.review'))
      and current_setting('heika.apply_review_post_id', true) = post_id::text)
  );

drop policy if exists post_topics_admin_manage on public.post_topics;
drop policy if exists post_topics_insert on public.post_topics;
create policy post_topics_insert on public.post_topics for insert to authenticated
  with check (
    (exists(select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())
      and p.status in ('draft','pending_review','published'))
      and exists(select 1 from public.interest_tags t where t.id = topic_id and t.active))
    or ((select public.has_staff_permission('content.review'))
      and current_setting('heika.apply_review_post_id', true) = post_id::text)
  );
drop policy if exists post_topics_delete on public.post_topics;
create policy post_topics_delete on public.post_topics for delete to authenticated
  using (
    exists(select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
    or ((select public.has_staff_permission('content.review'))
      and current_setting('heika.apply_review_post_id', true) = post_id::text)
  );
drop policy if exists post_topics_read on public.post_topics;
create policy post_topics_read on public.post_topics for select to anon, authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and (
      p.author_id = (select auth.uid())
      or (select public.is_admin())
      or (select public.has_staff_permission('content.review'))
      or (p.status = 'published' and not coalesce(
        (select profile.notes_private from public.profiles profile where profile.id = p.author_id), false))
    )
  ));

create index if not exists post_media_post_id_idx on public.post_media(post_id);
