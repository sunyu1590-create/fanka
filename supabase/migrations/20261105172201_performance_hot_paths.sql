-- Keep public feed rows small while preserving the full text for detail reads.
alter table public.posts
  add column body_excerpt text generated always as (left(body, 240)) stored;

alter table public.post_media
  add column thumbnail_path text,
  add column retina_thumbnail_path text;

-- This additive policy exposes generated variants only when their source post is
-- public, and keeps the existing note privacy rule intact.
create policy covers_read_thumbnails on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'post-covers'
  and exists (
    select 1
    from public.post_media m
    join public.posts p on p.id = m.post_id
    where (m.thumbnail_path = objects.name or m.retina_thumbnail_path = objects.name)
      and p.status = 'published'
      and not coalesce((select profile.notes_private from public.profiles profile where profile.id = p.author_id), false)
  )
);

-- Consolidate inbox rows, latest-message previews, and unread counts into one
-- RLS-respecting query. The existing dm_messages_page index serves both the
-- latest-message lookup and unread window scan.
create function public.dm_inbox_summary()
returns table (
  conversation_id uuid,
  user_a uuid,
  user_b uuid,
  created_at timestamptz,
  latest_message_id uuid,
  latest_sender_id uuid,
  latest_body text,
  latest_created_at timestamptz,
  latest_media_path text,
  unread bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with viewer as (select (select auth.uid()) as id)
  select
    c.id,
    c.user_a,
    c.user_b,
    c.created_at,
    latest.id,
    latest.sender_id,
    latest.body,
    latest.created_at,
    latest.media_path,
    coalesce(unread.count, 0)::bigint
  from public.dm_conversations c
  cross join viewer v
  left join public.dm_reads r on r.conversation_id = c.id and r.user_id = v.id
  left join lateral (
    select m.id, m.sender_id, m.body, m.created_at, m.media_path
    from public.dm_messages m
    where m.conversation_id = c.id
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*) as count
    from public.dm_messages m
    where m.conversation_id = c.id
      and m.sender_id <> v.id
      and m.created_at > coalesce(r.read_at, 'epoch'::timestamptz)
  ) unread on true
  where v.id in (c.user_a, c.user_b)
  order by c.created_at desc;
$$;

revoke execute on function public.dm_inbox_summary() from public, anon;
grant execute on function public.dm_inbox_summary() to authenticated;
