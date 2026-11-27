-- HEIKA Chat 2.0 · shared server-side query/action RPCs
-- Both web (Supabase client) and native (REST proxy) call these same functions,
-- keeping message business logic identical across clients.

-- Upsert a viewer's private conversation settings. Never touches the peer.
create or replace function public.dm_settings_upsert(
  room uuid,
  p_pinned boolean default null,
  p_muted boolean default null,
  p_archived boolean default null,
  p_manual_unread boolean default null,
  p_keep_archived boolean default null,
  p_theme text default null,
  p_background_path text default null,
  p_bubble_color text default null,
  p_font_scale numeric default null
)
returns public.dm_conversation_settings
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  valid boolean;
  result public.dm_conversation_settings;
begin
  if me is null then raise exception '请先登录'; end if;
  select exists(select 1 from public.dm_conversations where id = room and me in (user_a, user_b)) into valid;
  if not valid then raise exception '无权访问会话'; end if;
  if p_font_scale is not null and (p_font_scale < 0.85 or p_font_scale > 1.4) then raise exception '字号超出范围'; end if;

  insert into public.dm_conversation_settings (user_id, conversation_id)
    values (me, room)
  on conflict (user_id, conversation_id) do nothing;

  update public.dm_conversation_settings s
    set pinned = coalesce(p_pinned, s.pinned),
        pinned_at = case
          when p_pinned is null then s.pinned_at
          when p_pinned then coalesce(s.pinned_at, now())
          else null end,
        muted = coalesce(p_muted, s.muted),
        archived = coalesce(p_archived, s.archived),
        manual_unread = coalesce(p_manual_unread, s.manual_unread),
        keep_archived = coalesce(p_keep_archived, s.keep_archived),
        theme = case when p_theme is null then s.theme else p_theme end,
        background_path = case when p_background_path is null then s.background_path else p_background_path end,
        bubble_color = case when p_bubble_color is null then s.bubble_color else p_bubble_color end,
        font_scale = coalesce(p_font_scale, s.font_scale),
        updated_at = now()
    where s.user_id = me and s.conversation_id = room
  returning * into result;
  return result;
end $$;

-- Search messages the viewer is allowed to see. Global (room null) or scoped.
-- Cursor paging, never downloads the whole history. Recalled/invisible excluded.
create or replace function public.dm_search(
  q text, room uuid default null, before timestamptz default null, lim integer default 20
)
returns table (
  id uuid, conversation_id uuid, sender_id uuid, body text, created_at timestamptz,
  message_type text, media_path text, safety_flag text, peer_name text, peer_avatar text
)
language sql stable security definer set search_path = '' as $$
  with viewer as (select (select auth.uid()) as id)
  select m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
         m.message_type, m.media_path, m.safety_flag,
         case when c.user_a = v.id then p_b.nickname else p_a.nickname end as peer_name,
         case when c.user_a = v.id then p_b.avatar_url else p_a.avatar_url end as peer_avatar
  from public.dm_messages m
  join public.dm_conversations c on c.id = m.conversation_id
  cross join viewer v
  left join public.profiles p_a on p_a.id = c.user_a
  left join public.profiles p_b on p_b.id = c.user_b
  where v.id in (c.user_a, c.user_b)
    and coalesce(m.recalled, false) = false
    and (room is null or m.conversation_id = room)
    and (before is null or m.created_at < before)
    and length(trim(q)) between 1 and 60
    and m.body ilike '%' || trim(q) || '%'
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(lim, 20), 1), 50);
$$;

-- Media library for one conversation, filtered by kind.
create or replace function public.dm_media_library(
  room uuid, kind text default 'all', before timestamptz default null, lim integer default 30
)
returns table (
  id uuid, sender_id uuid, body text, created_at timestamptz,
  message_type text, media_path text, metadata jsonb
)
language sql stable security definer set search_path = '' as $$
  with viewer as (select (select auth.uid()) as id)
  select m.id, m.sender_id, m.body, m.created_at, m.message_type, m.media_path, m.metadata
  from public.dm_messages m
  join public.dm_conversations c on c.id = m.conversation_id
  cross join viewer v
  where v.id in (c.user_a, c.user_b)
    and c.id = room
    and coalesce(m.recalled, false) = false
    and (before is null or m.created_at < before)
    and (
      kind = 'all'
      or (kind = 'image' and m.message_type = 'image')
      or (kind = 'video' and m.message_type = 'video')
      or (kind = 'file' and m.message_type = 'file')
      or (kind = 'work' and m.message_type = 'work')
      or (kind = 'collection' and m.message_type = 'collection')
    )
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(lim, 30), 1), 60);
$$;

-- Forward a message to another conversation the viewer can write to.
-- Text is copied verbatim; media becomes a safe reference (never re-exposed publicly).
create or replace function public.dm_forward(
  source_message uuid, to_room uuid, nonce uuid
)
returns public.dm_messages
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  src public.dm_messages;
  peer uuid;
  result public.dm_messages;
  new_kind text;
  new_meta jsonb;
begin
  if me is null then raise exception '请先登录'; end if;
  select * into src from public.dm_messages where id = source_message;
  if not found or coalesce(src.recalled, false) then raise exception '原消息不可用'; end if;
  -- Source must be a conversation the viewer belongs to.
  if not exists (select 1 from public.dm_conversations
                 where id = src.conversation_id and me in (user_a, user_b)) then
    raise exception '无权访问原消息';
  end if;
  select case when user_a = me then user_b else user_a end into peer
    from public.dm_conversations where id = to_room and me in (user_a, user_b);
  if peer is null then raise exception '无权访问目标会话'; end if;
  if exists (select 1 from public.user_blocks
             where (owner_id = me and blocked_id = peer) or (owner_id = peer and blocked_id = me))
     or exists (select 1 from public.browsing_preferences where user_id = peer and dm_permission = 'nobody') then
    raise exception '对方暂不接受私聊';
  end if;
  select * into result from public.dm_messages where client_nonce = nonce and sender_id = me and conversation_id = to_room;
  if found then return result; end if;

  new_kind := case when src.message_type in ('image','video','file') then 'forward' else src.message_type end;
  new_meta := jsonb_build_object('forward', true, 'source_type', src.message_type);
  if src.message_type in ('image','video','file') then
    -- Keep only a reference + summary; do not carry the private storage path.
    new_meta := new_meta || jsonb_build_object('media_ref', src.id, 'source_room', src.conversation_id);
  end if;

  insert into public.dm_messages
    (id, conversation_id, sender_id, body, message_type, client_nonce, metadata)
  values
    (nonce, to_room, me, src.body, new_kind, nonce, new_meta)
  returning * into result;
  return result;
end $$;

-- Toggle a reaction; the viewer keeps at most one emoji per message.
create or replace function public.dm_react(message_id uuid, emoji text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  allowed boolean;
  existing text;
  result jsonb;
begin
  if me is null then raise exception '请先登录'; end if;
  if length(emoji) < 1 or length(emoji) > 8 then raise exception '表情无效'; end if;
  select exists (
    select 1 from public.dm_messages m
    join public.dm_conversations c on c.id = m.conversation_id
    where m.id = message_id and coalesce(m.recalled, false) = false and me in (c.user_a, c.user_b)
  ) into allowed;
  if not allowed then raise exception '无权操作该消息'; end if;

  select r.emoji into existing from public.dm_reactions r
    where r.message_id = dm_react.message_id and r.user_id = me;
  if existing = emoji then
    delete from public.dm_reactions r where r.message_id = dm_react.message_id and r.user_id = me;
    result := jsonb_build_object('emoji', emoji, 'active', false);
  else
    insert into public.dm_reactions (message_id, user_id, emoji)
      values (dm_react.message_id, me, emoji)
    on conflict on constraint dm_reactions_pkey do update set emoji = excluded.emoji, created_at = now();
    result := jsonb_build_object('emoji', emoji, 'active', true);
  end if;
  return result;
end $$;

-- Toggle a favorite (message bookmark). Never affects official post favorites.
create or replace function public.dm_favorite_toggle(message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  allowed boolean;
  was boolean;
  result jsonb;
begin
  if me is null then raise exception '请先登录'; end if;
  select exists (
    select 1 from public.dm_messages m
    join public.dm_conversations c on c.id = m.conversation_id
    where m.id = message_id and coalesce(m.recalled, false) = false and me in (c.user_a, c.user_b)
  ) into allowed;
  if not allowed then raise exception '无权操作该消息'; end if;
  was := exists (select 1 from public.dm_favorites f where f.message_id = dm_favorite_toggle.message_id and f.user_id = me);
  if was then
    delete from public.dm_favorites f where f.message_id = dm_favorite_toggle.message_id and f.user_id = me;
  else
    insert into public.dm_favorites (message_id, user_id) values (dm_favorite_toggle.message_id, me);
  end if;
  result := jsonb_build_object('favorite', not was);
  return result;
end $$;

-- Ignore/delete an incoming request (only recipient may act).
create or replace function public.dm_request_update(request_id uuid, status text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ok boolean;
begin
  if me is null then raise exception '请先登录'; end if;
  if status not in ('ignored', 'deleted', 'pending') then raise exception '状态无效'; end if;
  update public.dm_requests set status = dm_request_update.status
    where id = request_id and recipient_id = me;
  get diagnostics ok = row_count;
  if not ok then raise exception '请求不存在'; end if;
  return true;
end $$;

revoke all on function
  public.dm_settings_upsert(uuid,boolean,boolean,boolean,boolean,boolean,text,text,text,numeric),
  public.dm_search(text,uuid,timestamptz,integer),
  public.dm_media_library(uuid,text,timestamptz,integer),
  public.dm_forward(uuid,uuid,uuid),
  public.dm_react(uuid,text),
  public.dm_favorite_toggle(uuid),
  public.dm_request_update(uuid,text)
  from public, anon;
grant execute on function
  public.dm_settings_upsert(uuid,boolean,boolean,boolean,boolean,boolean,text,text,text,numeric),
  public.dm_search(text,uuid,timestamptz,integer),
  public.dm_media_library(uuid,text,timestamptz,integer),
  public.dm_forward(uuid,uuid,uuid),
  public.dm_react(uuid,text),
  public.dm_favorite_toggle(uuid),
  public.dm_request_update(uuid,text)
  to authenticated;
