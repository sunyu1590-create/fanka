-- Drafts may be incomplete; published posts retain the original validation.
alter table public.posts drop constraint if exists posts_title_check;
alter table public.posts add constraint posts_title_check
  check ((status = 'draft' and length(title) between 0 and 80) or (status <> 'draft' and length(title) between 1 and 80));
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts add constraint posts_body_check
  check ((status = 'draft' and length(body) between 0 and 5000) or (status <> 'draft' and length(body) between 1 and 5000));

-- The composer autosaves one active draft per account. This also prevents duplicate drafts
-- if two autosave requests race during first use.
create unique index if not exists posts_single_active_draft_per_author
  on public.posts(author_id) where status = 'draft' and author_id is not null and is_demo = false;
