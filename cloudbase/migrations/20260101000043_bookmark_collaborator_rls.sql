-- Let collaborators read only their membership and the collection they joined.
create policy bookmark_collection_collaborators_self_read
  on public.bookmark_collection_collaborators for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.bookmark_collection_collaborators to authenticated;

create policy bookmark_collections_collaborator_read
  on public.bookmark_collections for select to authenticated
  using (exists (
    select 1 from public.bookmark_collection_collaborators m
    where m.collection_id = bookmark_collections.id and m.user_id = (select auth.uid())
  ));
