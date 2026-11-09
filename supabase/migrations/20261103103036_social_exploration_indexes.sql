-- Index foreign-key columns used by collection, pairing, and notification lookups.
create index if not exists app_notifications_actor_idx on public.app_notifications(actor_id);
create index if not exists app_notifications_post_idx on public.app_notifications(post_id);
create index if not exists app_notifications_comment_idx on public.app_notifications(comment_id);
create index if not exists bookmark_collection_collaborators_added_by_idx on public.bookmark_collection_collaborators(added_by);
create index if not exists bookmarks_collection_id_idx on public.bookmarks(collection_id);
create index if not exists bookmarks_post_id_idx on public.bookmarks(post_id);
create index if not exists co_explore_rooms_guest_idx on public.co_explore_rooms(guest_id);
create index if not exists co_explore_picks_user_idx on public.co_explore_picks(user_id);
create index if not exists co_explore_picks_post_idx on public.co_explore_picks(post_id);
