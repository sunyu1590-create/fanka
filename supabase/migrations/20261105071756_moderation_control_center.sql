-- Private community governance data. Rule and enforcement details are only
-- available to administrators; user generated text is checked server-side.
create table public.moderation_keyword_rules (
  id uuid primary key default gen_random_uuid(),
  keyword text not null check (char_length(btrim(keyword)) between 1 and 80),
  scopes text[] not null default array['post','comment','message','profile'],
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moderation_keyword_scopes_valid check (
    cardinality(scopes) between 1 and 4
    and scopes <@ array['post','comment','message','profile']::text[]
  )
);
create unique index moderation_keyword_rules_keyword_uidx
  on public.moderation_keyword_rules (lower(btrim(keyword)));
create index moderation_keyword_rules_enabled_scopes_idx
  on public.moderation_keyword_rules using gin (scopes) where enabled;
alter table public.moderation_keyword_rules enable row level security;
revoke all on public.moderation_keyword_rules from public, anon;
grant select, insert, update, delete on public.moderation_keyword_rules to authenticated;
create policy moderation_keyword_rules_admin_all on public.moderation_keyword_rules
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create table public.community_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  active boolean not null default true,
  restricted_until timestamptz,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  set_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_restrictions_active_idx
  on public.community_restrictions (restricted_until) where active;
alter table public.community_restrictions enable row level security;
revoke all on public.community_restrictions from public, anon;
grant select, insert, update, delete on public.community_restrictions to authenticated;
create policy community_restrictions_admin_all on public.community_restrictions
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create table public.moderation_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null check (char_length(target_type) between 1 and 40),
  target_id text,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index moderation_audit_logs_created_idx on public.moderation_audit_logs (created_at desc);
create index moderation_audit_logs_target_idx on public.moderation_audit_logs (target_type, target_id, created_at desc);
alter table public.moderation_audit_logs enable row level security;
revoke all on public.moderation_audit_logs from public, anon;
grant select, insert on public.moderation_audit_logs to authenticated;
create policy moderation_audit_logs_admin_read on public.moderation_audit_logs
  for select to authenticated using ((select public.is_admin()));
create policy moderation_audit_logs_admin_insert on public.moderation_audit_logs
  for insert to authenticated with check ((select public.is_admin()));

-- The trigger is intentionally kept in the private schema and uses a fixed
-- table/column map. It runs for all write paths, including direct Supabase
-- client calls, so the browser cannot bypass the configured keyword rules.
create or replace function heika_private.guard_community_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  content_scope text;
  content_author uuid;
  content_text text;
  blocked_keyword text;
  restriction record;
begin
  if auth.uid() is null or (select public.is_admin()) then return new; end if;

  if tg_table_name = 'posts' then
    content_scope := 'post';
    content_author := new.author_id;
    content_text := concat_ws(' ', new.title, new.body);
  elsif tg_table_name = 'post_revisions' then
    content_scope := 'post';
    content_author := new.author_id;
    content_text := concat_ws(' ', new.payload->>'title', new.payload->>'body');
  elsif tg_table_name = 'comments' then
    content_scope := 'comment';
    content_author := new.author_id;
    content_text := new.body;
  elsif tg_table_name = 'dm_messages' then
    content_scope := 'message';
    content_author := new.sender_id;
    content_text := new.body;
  elsif tg_table_name = 'profiles' then
    content_scope := 'profile';
    content_author := new.id;
    content_text := concat_ws(' ', new.nickname, new.bio);
  else
    return new;
  end if;

  if content_author is distinct from auth.uid() then return new; end if;

  if content_scope in ('post','post_revision','comment','message') then
    select r.active, r.restricted_until, r.reason into restriction
    from public.community_restrictions r where r.user_id = content_author;
    if found and restriction.active and (restriction.restricted_until is null or restriction.restricted_until > now()) then
      raise exception using errcode = 'P0001', message = '当前账号暂时不能发布内容或发送消息';
    end if;
  end if;

  select r.keyword into blocked_keyword
  from public.moderation_keyword_rules r
  where r.enabled and content_scope = any(r.scopes)
    and strpos(lower(content_text), lower(btrim(r.keyword))) > 0
  order by char_length(r.keyword) desc
  limit 1;
  if blocked_keyword is not null then
    raise exception using errcode = 'P0001', message = '内容包含暂不允许发布的关键词，请修改后再提交';
  end if;
  return new;
end;
$$;
revoke all on function heika_private.guard_community_content() from public, anon, authenticated;

drop trigger if exists guard_posts_community_content on public.posts;
create trigger guard_posts_community_content before insert or update of title, body on public.posts
  for each row execute function heika_private.guard_community_content();
drop trigger if exists guard_post_revisions_community_content on public.post_revisions;
create trigger guard_post_revisions_community_content before insert or update of payload on public.post_revisions
  for each row execute function heika_private.guard_community_content();
drop trigger if exists guard_comments_community_content on public.comments;
create trigger guard_comments_community_content before insert or update of body on public.comments
  for each row execute function heika_private.guard_community_content();
drop trigger if exists guard_messages_community_content on public.dm_messages;
create trigger guard_messages_community_content before insert or update of body on public.dm_messages
  for each row execute function heika_private.guard_community_content();
drop trigger if exists guard_profiles_community_content on public.profiles;
create trigger guard_profiles_community_content before insert or update of nickname, bio on public.profiles
  for each row execute function heika_private.guard_community_content();
