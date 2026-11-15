-- Keep auth lookups out of per-row evaluation for the topic association policies.
drop policy post_topics_read on public.post_topics;
drop policy post_topics_insert on public.post_topics;
drop policy post_topics_delete on public.post_topics;

create policy post_topics_read on public.post_topics for select to anon, authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and (p.status = 'published' or p.author_id = (select auth.uid()) or (select public.is_admin()))
  ));
create policy post_topics_insert on public.post_topics for insert to authenticated
  with check (exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid()) and p.status in ('draft', 'published')
  ) and exists (select 1 from public.interest_tags t where t.id = topic_id and t.active));
create policy post_topics_delete on public.post_topics for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
