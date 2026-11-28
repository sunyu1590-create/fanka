-- HEIKA Discussion 2.0 · 评论系统升级
-- Additive and backward compatible. No existing comment row is deleted, reset
-- or rewritten. Old clients keep working because every new column is nullable
-- or has a safe default.

-- ---------------------------------------------------------------------------
-- 1) Comment-level extensions
-- ---------------------------------------------------------------------------
alter table public.comments
  add column if not exists edited_at timestamptz,
  add column if not exists edit_count integer not null default 0,
  add column if not exists pinned boolean not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reply_to_id uuid,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists mention_ids uuid[] not null default '{}'::uuid[],
  add column if not exists client_nonce uuid;

-- Reply target: the exact comment a reply answers (flat two-level threads keep
-- the tree at depth one, this column only carries the @relationship).
alter table public.comments
  drop constraint if exists comments_reply_to_id_fkey;
alter table public.comments
  add constraint comments_reply_to_id_fkey
  foreign key (reply_to_id) references public.comments(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2) Indexes (list, thread, pin, idempotency)
-- ---------------------------------------------------------------------------
create index if not exists comments_post_status_idx
  on public.comments (post_id, status, created_at desc);
create index if not exists comments_parent_idx
  on public.comments (parent_id) where parent_id is not null;
-- At most one pinned comment per post, enforced by the database.
create unique index if not exists comments_pinned_unique
  on public.comments (post_id) where pinned;
-- Idempotency: one accepted send per (author, client nonce).
create unique index if not exists comments_nonce_unique
  on public.comments (author_id, client_nonce) where client_nonce is not null;

-- ---------------------------------------------------------------------------
-- 3) Attachment validation (shape only, storage paths are validated by API)
-- ---------------------------------------------------------------------------
create or replace function heika_private.guard_comment_attachments()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
begin
  if new.attachments is null then new.attachments := '[]'::jsonb; end if;
  if jsonb_typeof(new.attachments) <> 'array' then
    raise exception 'invalid comment attachments';
  end if;
  if jsonb_array_length(new.attachments) > 6 then
    raise exception 'too many comment attachments';
  end if;
  for item in select * from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'invalid comment attachment item';
    end if;
    if coalesce(item->>'path', '') = '' then
      raise exception 'comment attachment path required';
    end if;
    if length(item->>'path') > 300 then
      raise exception 'comment attachment path too long';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists guard_comment_attachments on public.comments;
create trigger guard_comment_attachments
  before insert or update of attachments on public.comments
  for each row execute function heika_private.guard_comment_attachments();

-- ---------------------------------------------------------------------------
-- 4) Mention notifications (@ real user ids only)
--    Inserts one row per distinct mentioned user, skipping the comment author,
--    the post author and the reply target author (they already get the
--    dedicated comment/reply notification). Never calls a paid model.
-- ---------------------------------------------------------------------------
create or replace function heika_private.notify_comment_mentions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_parent_author uuid;
  v_uid uuid;
begin
  if new.status <> 'visible' then return new; end if;
  if new.mention_ids is null or cardinality(new.mention_ids) = 0 then return new; end if;

  select p.author_id into v_owner from public.posts p where p.id = new.post_id;
  if new.parent_id is not null then
    select c.author_id into v_parent_author from public.comments c where c.id = new.parent_id;
  end if;

  for v_uid in select distinct unnest(new.mention_ids) loop
    continue when v_uid = new.author_id;
    continue when v_uid is not distinct from v_owner;
    continue when v_uid is not distinct from v_parent_author;
    continue when not exists (select 1 from public.profiles p where p.id = v_uid);
    continue when not coalesce((
      select bp.notification_comments_enabled from public.browsing_preferences bp
      where bp.user_id = v_uid
    ), true);
    insert into public.app_notifications(
      recipient_id, actor_id, notification_type, entity_id, post_id, comment_id, title
    ) values (
      v_uid, new.author_id, 'mention', new.id, new.post_id, new.id, '有人在评论中提到了你'
    ) on conflict do nothing;
  end loop;

  return new;
end $$;

drop trigger if exists comments_notify_mentions on public.comments;
create trigger comments_notify_mentions
  after insert on public.comments
  for each row execute function heika_private.notify_comment_mentions();

-- ---------------------------------------------------------------------------
-- 5) Comment count, single source of truth
--    All surfaces (detail page, list cards, admin) read this definition:
--    visible top-level comments plus visible replies.
-- ---------------------------------------------------------------------------
create or replace function public.post_comment_total(p_post_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*)::bigint
  from public.comments c
  where c.post_id = p_post_id and c.status = 'visible';
$$;

-- ---------------------------------------------------------------------------
-- 6) Edit window helper (server side authority, 15 minutes)
-- ---------------------------------------------------------------------------
create or replace function public.comment_editable(p_comment_id uuid, p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.comments c
    where c.id = p_comment_id
      and c.author_id = p_actor
      and c.status = 'visible'
      and c.deleted_at is null
      and c.created_at > now() - interval '15 minutes'
  );
$$;

revoke all on function public.post_comment_total(uuid) from public;
grant execute on function public.post_comment_total(uuid) to anon, authenticated, service_role;
revoke all on function public.comment_editable(uuid, uuid) from public;
grant execute on function public.comment_editable(uuid, uuid) to authenticated, service_role;
