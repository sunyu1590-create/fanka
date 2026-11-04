drop policy if exists post_poll_votes_own_update on public.post_poll_votes;
create policy post_poll_votes_own_update on public.post_poll_votes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.post_polls pp join public.posts p on p.id = pp.post_id
    where pp.id = poll_id and p.status = 'published'
  ));
