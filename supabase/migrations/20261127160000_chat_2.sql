-- HEIKA Chat 2.0 · 连接与交流
-- Additive, backward-compatible upgrade. No existing message, conversation,
-- unread state or history is deleted, reset or rewritten. Old clients keep working.

-- ---------------------------------------------------------------------------
-- 1) Message-level extensions
-- ---------------------------------------------------------------------------
alter table public.dm_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists client_nonce uuid,
  add column if not exists reply_to uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists edit_count integer not null default 0,
  add column if not exists recalled boolean not null default false,
  add column if not exists safety_flag text,
  add column if not exists seq bigint,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create sequence if not exists public.dm_message_seq;

-- Idempotency: one accepted send per (sender, client nonce).
create unique index if not exists dm_messages_nonce
  on public.dm_messages (sender_id, client_nonce) where client_nonce is not null;
create index if not exists dm_messages_reply on public.dm_messages (reply_to) where reply_to is not null;
create index if not exists dm_messages_safety on public.dm_messages (safety_flag) where safety_flag is not null;

-- ---------------------------------------------------------------------------
-- 2) Lightweight, non-blocking contact-detail detection (server side only)
--    Rule based, never calls a paid AI model, never rejects or edits content.
--    Only stores a classification tag; no contact detail is persisted here.
-- ---------------------------------------------------------------------------
create or replace function public.dm_detect_contact(body text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  t text := lower(coalesce(body, ''));
  has_intent boolean;
begin
  if t is null or t = '' then return null; end if;

  -- Explicit intent words that make a plain digit/name string a contact.
  has_intent := t ~ '(qq|微信|weixin|wechat|vx|v信|加我|加v|联系|手机|电话|邮箱|电报|telegram|whatsapp|discord|instagram|line号|群号|私聊我)';

  -- E-mail address (strongest signal, no intent word required).
  if t ~* '(^|[^a-z0-9._%+-])[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}([^a-z0-9.-]|$)' then
    return 'email';
  end if;

  -- Mainland mobile number, with or without separators / leading +86.
  if t ~ '(\+?86[^0-9]?)?1[3-9][0-9][ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)' then
    return 'phone';
  end if;

  -- Messaging-platform invite links and handles.
  if t ~ '(t\.me/|telegram\.me/|wa\.me/|whatsapp\.com/|discord\.gg/|discord\.com/invite/|weixin://|https?://[^\ ]*(line\.me|t\.me))' then
    return 'social_link';
  end if;

  -- QQ number: intent word + a 5-12 digit run.
  if has_intent and t ~ '(qq|群号)' and t ~ '[0-9]{5,12}' then
    return 'qq';
  end if;

  -- WeChat id: intent word + alphanumeric handle (letters required).
  if has_intent and t ~ '(微信|weixin|wechat|vx|v信|加v)' and t ~ '[a-z][a-z0-9_-]{4,}' then
    return 'wechat';
  end if;

  -- Generic explicit "add/contact me" + identifier, including long digit runs.
  if has_intent and t ~ '[a-z0-9_-]{6,}' then
    return 'contact';
  end if;

  -- Bare long digit runs are NOT flagged (order numbers, article ids, dates).
  return null;
end $$;

create or replace function public.dm_safety_trigger()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.safety_flag := public.dm_detect_contact(new.body);
  if new.seq is null then new.seq := nextval('public.dm_message_seq'); end if;
  return new;
end $$;

drop trigger if exists dm_safety_apply on public.dm_messages;
create trigger dm_safety_apply
  before insert or update of body on public.dm_messages
  for each row execute function public.dm_safety_trigger();

revoke all on function public.dm_detect_contact(text) from public, anon;
grant execute on function public.dm_detect_contact(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Per-user conversation settings (never affects the peer)
-- ---------------------------------------------------------------------------
create table if not exists public.dm_conversation_settings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  pinned boolean not null default false,
  pinned_at timestamptz,
  muted boolean not null default false,
  archived boolean not null default false,
  manual_unread boolean not null default false,
  keep_archived boolean not null default false,
  theme text,
  background_path text,
  bubble_color text,
  font_scale numeric not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
alter table public.dm_conversation_settings enable row level security;
drop policy if exists dm_settings_own on public.dm_conversation_settings;
create policy dm_settings_own on public.dm_conversation_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.dm_conversation_settings to authenticated;

-- Reading cursor also stores the last read message id for precise multi-device sync.
alter table public.dm_reads add column if not exists last_read_message_id uuid;

-- ---------------------------------------------------------------------------
-- 4) Reactions / favorites / message requests
-- ---------------------------------------------------------------------------
create table if not exists public.dm_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.dm_reactions enable row level security;
drop policy if exists dm_reaction_read on public.dm_reactions;
create policy dm_reaction_read on public.dm_reactions for select to authenticated
  using (exists (
    select 1 from public.dm_messages m
    join public.dm_conversations c on c.id = m.conversation_id
    where m.id = message_id and (select auth.uid()) in (c.user_a, c.user_b)
  ));
drop policy if exists dm_reaction_write on public.dm_reactions;
create policy dm_reaction_write on public.dm_reactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.dm_reactions to authenticated;

create table if not exists public.dm_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.dm_favorites enable row level security;
drop policy if exists dm_favorite_own on public.dm_favorites;
create policy dm_favorite_own on public.dm_favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.dm_favorites to authenticated;

create table if not exists public.dm_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  media_path text,
  safety_flag text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'ignored', 'deleted')),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists dm_requests_recipient on public.dm_requests (recipient_id, status, created_at desc);
alter table public.dm_requests enable row level security;
drop policy if exists dm_request_sender_read on public.dm_requests;
create policy dm_request_sender_read on public.dm_requests for select to authenticated
  using (sender_id = (select auth.uid()));
drop policy if exists dm_request_recipient_read on public.dm_requests;
create policy dm_request_recipient_read on public.dm_requests for select to authenticated
  using (recipient_id = (select auth.uid()));
grant select on public.dm_requests to authenticated;

create or replace function public.dm_request_safety_trigger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.safety_flag is null then new.safety_flag := public.dm_detect_contact(new.body); end if;
  return new;
end $$;
drop trigger if exists dm_request_safety_apply on public.dm_requests;
create trigger dm_request_safety_apply
  before insert on public.dm_requests
  for each row execute function public.dm_request_safety_trigger();

-- ---------------------------------------------------------------------------
-- 5) Privacy preferences: mutual-DM, read receipts, typing, presence
-- ---------------------------------------------------------------------------
alter table public.browsing_preferences
  drop constraint if exists browsing_preferences_dm_permission_check;
alter table public.browsing_preferences
  add constraint browsing_preferences_dm_permission_check
  check (dm_permission in ('everyone', 'mutual', 'nobody'));
alter table public.browsing_preferences
  add column if not exists read_receipt boolean not null default true,
  add column if not exists typing_indicator boolean not null default true,
  add column if not exists online_visibility text not null default 'everyone';

-- ---------------------------------------------------------------------------
-- 6) Server-authoritative helpers
-- ---------------------------------------------------------------------------

-- Send with idempotency, edit window, reply, share cards and safety tag.
-- Recalled messages keep a placeholder row so quotes/previews can resolve.
create or replace function public.dm_send_v2(
  room uuid, content text, nonce uuid,
  reply uuid default null, kind text default 'text', meta jsonb default '{}'::jsonb
)
returns public.dm_messages language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  peer uuid;
  result public.dm_messages;
begin
  if me is null then raise exception '请先登录'; end if;
  select case when user_a = me then user_b else user_a end into peer
    from public.dm_conversations where id = room and me in (user_a, user_b);
  if peer is null then raise exception '无权访问会话'; end if;
  if exists (select 1 from public.user_blocks
             where (owner_id = me and blocked_id = peer) or (owner_id = peer and blocked_id = me))
     or exists (select 1 from public.browsing_preferences where user_id = peer and dm_permission = 'nobody') then
    raise exception '对方暂不接受私聊';
  end if;

  -- Idempotent replay: same sender + nonce always returns the original row.
  select * into result from public.dm_messages
    where client_nonce = nonce and sender_id = me and conversation_id = room;
  if found then return result; end if;

  perform pg_advisory_xact_lock(hashtext(me::text));
  if (select count(*) from public.dm_messages where sender_id = me and created_at > now() - interval '1 minute') >= 40 then
    raise exception '发送过于频繁，请稍后重试';
  end if;

  insert into public.dm_messages
    (id, conversation_id, sender_id, body, message_type, client_nonce, reply_to, metadata)
  values
    (nonce, room, me, trim(content), coalesce(kind, 'text'), nonce, reply, coalesce(meta, '{}'::jsonb))
  returning * into result;

  update public.dm_reads
    set last_read_message_id = nonce
    where conversation_id = room and user_id = me;
  return result;
end $$;

-- Edit within 15 minutes, version-guarded against silent cross-device overwrite.
create or replace function public.dm_edit_v2(message_id uuid, content text, expect_version integer)
returns public.dm_messages language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  result public.dm_messages;
begin
  if me is null then raise exception '请先登录'; end if;
  if length(trim(content)) not between 1 and 2000 then raise exception '消息长度须为 1-2000 字'; end if;
  select * into result from public.dm_messages where id = message_id for update;
  if not found or result.sender_id <> me then raise exception '只能编辑自己发送的消息'; end if;
  if result.recalled then raise exception '已撤回的消息无法编辑'; end if;
  if now() - result.created_at > interval '15 minutes' then raise exception '超过 15 分钟，无法编辑'; end if;
  if expect_version is not null and result.edit_count <> expect_version then
    raise exception '这条消息已在其他设备修改，请刷新后重试';
  end if;
  if result.message_type <> 'text' then raise exception '仅支持编辑文字消息'; end if;

  update public.dm_messages
    set body = trim(content), edited_at = now(), edit_count = edit_count + 1
    where id = message_id
  returning * into result;
  return result;
end $$;

-- Soft recall: keep a placeholder so quotes resolve and peers see a prompt.
create or replace function public.dm_recall_v2(message_id uuid)
returns public.dm_messages language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  result public.dm_messages;
begin
  if me is null then raise exception '请先登录'; end if;
  select * into result from public.dm_messages where id = message_id for update;
  if not found or result.sender_id <> me then raise exception '只能撤回自己发送的消息'; end if;
  -- 3 分钟窗口与线上既有行为一致，旧客户端不会因升级失效。
  if now() - result.created_at > interval '3 minutes' then raise exception '超过 3 分钟，无法撤回'; end if;

  delete from public.dm_reactions r where r.message_id = dm_recall_v2.message_id;
  delete from public.dm_favorites f where f.message_id = dm_recall_v2.message_id;
  -- 保留中性提示文案（而非空串），旧客户端也能正常显示；新客户端按 recalled 标志做特殊样式。
  update public.dm_messages
    set recalled = true, body = '撤回了一条消息', safety_flag = null,
        metadata = metadata || '{"recalled":true}'::jsonb
    where id = message_id
  returning * into result;
  return result;
end $$;

-- Mark read with a monotonic cursor (older devices cannot rewind unread).
create or replace function public.dm_mark_read_v2(room uuid, last_message uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  valid boolean;
begin
  if me is null then raise exception '请先登录'; end if;
  select exists(select 1 from public.dm_conversations
                where id = room and me in (user_a, user_b)) into valid;
  if not valid then raise exception '无权访问会话'; end if;
  insert into public.dm_reads (conversation_id, user_id, read_at, last_read_message_id)
    values (room, me, now(), last_message)
  on conflict (conversation_id, user_id) do update
    set read_at = greatest(dm_reads.read_at, excluded.read_at),
        last_read_message_id = coalesce(
          (select m.id from public.dm_messages m
           where m.id = excluded.last_read_message_id and m.conversation_id = room),
          dm_reads.last_read_message_id);
  return true;
end $$;

-- Open (or create) a normal conversation after a request is accepted.
create or replace function public.dm_accept_request(request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  req public.dm_requests;
  room uuid;
begin
  if me is null then raise exception '请先登录'; end if;
  select * into req from public.dm_requests where id = request_id and recipient_id = me for update;
  if not found then raise exception '消息请求不存在'; end if;

  insert into public.dm_conversations (user_a, user_b)
    values (least(req.sender_id, req.recipient_id), greatest(req.sender_id, req.recipient_id))
  on conflict (user_a, user_b) do nothing;
  select id into room from public.dm_conversations
    where user_a = least(req.sender_id, req.recipient_id)
      and user_b = greatest(req.sender_id, req.recipient_id);

  if req.media_path is null then
    insert into public.dm_messages (id, conversation_id, sender_id, body, client_nonce)
      values (gen_random_uuid(), room, req.sender_id, req.body, gen_random_uuid());
  end if;
  update public.dm_requests set status = 'accepted' where id = request_id;
  return room;
end $$;

-- Send a first-contact request (subject to recipient privacy + blocks + rate limit).
create or replace function public.dm_request_send(recipient uuid, content text, image_path text default null)
returns public.dm_requests language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  pref public.browsing_preferences;
  result public.dm_requests;
begin
  if me is null then raise exception '请先登录'; end if;
  if recipient is null or recipient = me then raise exception '无效的聊天对象'; end if;
  if length(trim(content)) not between 1 and 2000 then raise exception '消息长度须为 1-2000 字'; end if;
  if exists (select 1 from public.user_blocks
             where (owner_id = me and blocked_id = recipient) or (owner_id = recipient and blocked_id = me)) then
    raise exception '无法向该用户发送消息';
  end if;
  select * into pref from public.browsing_preferences where user_id = recipient;
  if coalesce(pref.dm_permission, 'everyone') = 'nobody' then raise exception '对方暂不接受私信'; end if;
  if coalesce(pref.dm_permission, 'everyone') = 'mutual' and not exists (
      select 1 from public.creator_follows
      where (follower_id = me and creator_id = recipient) or (follower_id = recipient and creator_id = me)
  ) then raise exception '仅互相关注的用户可以私信'; end if;

  -- Already has an accepted conversation -> normal send, not a request.
  if exists (select 1 from public.dm_conversations
             where least(user_a, user_b) = least(me, recipient)
               and greatest(user_a, user_b) = greatest(me, recipient)) then
    raise exception '你们已经是好友，请通过会话发送消息';
  end if;

  if (select count(*) from public.dm_requests
      where sender_id = me and recipient_id = recipient and status = 'pending'
        and created_at > now() - interval '24 hours') >= 3 then
    raise exception '请求过于频繁，请等待对方处理';
  end if;

  insert into public.dm_requests (sender_id, recipient_id, body, media_path)
    values (me, recipient, trim(content), image_path)
  returning * into result;
  return result;
end $$;

revoke all on function
  public.dm_send_v2(uuid,text,uuid,uuid,text,jsonb),
  public.dm_edit_v2(uuid,text,integer),
  public.dm_recall_v2(uuid),
  public.dm_mark_read_v2(uuid,uuid),
  public.dm_accept_request(uuid),
  public.dm_request_send(uuid,text,text)
  from public, anon;
grant execute on function
  public.dm_send_v2(uuid,text,uuid,uuid,text,jsonb),
  public.dm_edit_v2(uuid,text,integer),
  public.dm_recall_v2(uuid),
  public.dm_mark_read_v2(uuid,uuid),
  public.dm_accept_request(uuid),
  public.dm_request_send(uuid,text,text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Old RPCs stay intact but gain safety tag / soft-recall awareness.
--    send_dm keeps its old signature and now routes through the same trigger.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 8) Realtime: chat list/state surfaces need incremental events too.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.dm_conversation_settings;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.dm_reactions;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.dm_favorites;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.dm_requests;
exception when duplicate_object then null; end $$;

-- Full-text search index (additive; recalled rows are filtered in the query).
create index if not exists dm_messages_body_search on public.dm_messages using gin (to_tsvector('simple', body));
