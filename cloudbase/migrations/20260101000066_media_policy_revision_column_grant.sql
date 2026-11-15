-- Storage object read policies inspect staged revision metadata. Grant anon
-- only the columns those policy predicates use; RLS has no anon SELECT policy
-- on post_revisions, so anonymous users can evaluate the policy but still see
-- zero revision rows.
grant select (status, payload) on table public.post_revisions to anon;
