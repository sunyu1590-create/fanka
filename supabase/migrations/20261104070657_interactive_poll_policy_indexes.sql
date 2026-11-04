create index post_poll_votes_poll_option_idx on public.post_poll_votes(poll_id, option_id);
create index post_poll_votes_user_idx on public.post_poll_votes(user_id);

drop policy if exists post_polls_author_manage on public.post_polls;
create policy post_polls_author_insert on public.post_polls for insert to authenticated with check (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
);
create policy post_polls_author_update on public.post_polls for update to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
create policy post_polls_author_delete on public.post_polls for delete to authenticated using (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
);

drop policy if exists post_poll_options_author_manage on public.post_poll_options;
create policy post_poll_options_author_insert on public.post_poll_options for insert to authenticated with check (
  exists (select 1 from public.post_polls pp join public.posts p on p.id = pp.post_id
    where pp.id = poll_id and p.author_id = (select auth.uid()))
);
create policy post_poll_options_author_update on public.post_poll_options for update to authenticated
  using (exists (select 1 from public.post_polls pp join public.posts p on p.id = pp.post_id
    where pp.id = poll_id and p.author_id = (select auth.uid())))
  with check (exists (select 1 from public.post_polls pp join public.posts p on p.id = pp.post_id
    where pp.id = poll_id and p.author_id = (select auth.uid())));
create policy post_poll_options_author_delete on public.post_poll_options for delete to authenticated using (
  exists (select 1 from public.post_polls pp join public.posts p on p.id = pp.post_id
    where pp.id = poll_id and p.author_id = (select auth.uid()))
);
