-- Compatibility-first content expansion: existing rows remain community articles,
-- with their category IDs, interaction rows and moderation history untouched.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('member', 'admin', 'content_manager', 'reviewer'));

create or replace function heika_private.has_staff_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and case p.role
        when 'admin' then true
        when 'content_manager' then p_permission = any(array[
          'content.read','content.review','content.manage',
          'ai.read','ai.review','ai.manage','category.manage',
          'reports.manage','appeals.manage','comments.manage','keywords.manage','audit.read'
        ]::text[])
        when 'reviewer' then p_permission = any(array[
          'content.read','content.review','ai.read','ai.review',
          'reports.manage','appeals.manage','comments.manage','audit.read'
        ]::text[])
        else false
      end
  )
$$;
revoke all on function heika_private.has_staff_permission(text) from public, anon;
grant usage on schema heika_private to authenticated;
grant usage on schema heika_private to anon;
grant execute on function heika_private.has_staff_permission(text) to anon, authenticated;
create or replace function public.has_staff_permission(p_permission text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select heika_private.has_staff_permission(p_permission)
$$;
revoke all on function public.has_staff_permission(text) from public, anon;
grant execute on function public.has_staff_permission(text) to anon, authenticated;

-- Extend the existing catalog instead of replacing it: tag IDs are foreign keys
-- used by existing posts, interests, follows, and topic events.
alter table public.interest_tags
  add column if not exists channel text not null default 'community',
  add column if not exists parent_id bigint references public.interest_tags(id) on delete set null,
  add column if not exists kind text not null default 'category',
  add column if not exists sort_order integer not null default 0,
  add column if not exists description text not null default '',
  add column if not exists is_featured boolean not null default false,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists merged_into_id bigint references public.interest_tags(id) on delete set null,
  add column if not exists moderation_status text not null default 'approved';
alter table public.interest_tags drop constraint if exists interest_tags_channel_check;
alter table public.interest_tags add constraint interest_tags_channel_check check (channel in ('community','ai'));
alter table public.interest_tags drop constraint if exists interest_tags_kind_check;
alter table public.interest_tags add constraint interest_tags_kind_check check (kind in ('category','tag'));
alter table public.interest_tags drop constraint if exists interest_tags_moderation_status_check;
alter table public.interest_tags add constraint interest_tags_moderation_status_check check (moderation_status in ('pending','approved','rejected'));
update public.interest_tags set kind = case when is_custom then 'tag' else 'category' end;
update public.interest_tags set sort_order = id::integer where sort_order = 0;
create or replace function heika_private.mark_custom_interest_tag()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_custom then new.kind := 'tag'; end if;
  return new;
end
$$;
revoke all on function heika_private.mark_custom_interest_tag() from public, anon, authenticated;
drop trigger if exists mark_custom_interest_tag on public.interest_tags;
create trigger mark_custom_interest_tag before insert or update of is_custom on public.interest_tags
  for each row execute function heika_private.mark_custom_interest_tag();
create index if not exists interest_tags_channel_order_idx on public.interest_tags(channel, kind, parent_id, sort_order, id) where active;
create index if not exists interest_tags_featured_idx on public.interest_tags(channel, sort_order) where active and is_featured;
drop policy if exists tags_admin on public.interest_tags;
create policy tags_admin on public.interest_tags for all to authenticated
  using ((select public.has_staff_permission('category.manage')))
  with check ((select public.has_staff_permission('category.manage')));
drop policy if exists tags_read on public.interest_tags;
create policy tags_read on public.interest_tags for select to anon, authenticated
  using ((active and moderation_status = 'approved' and merged_into_id is null) or created_by = (select auth.uid()) or (select public.has_staff_permission('category.manage')));

-- A channel and an explicit type distinguish AI articles/resources from community
-- posts while retaining the established interactions and review workflow.
alter table public.posts
  add column if not exists channel text not null default 'community',
  add column if not exists content_type text not null default 'community_post',
  add column if not exists resource_data jsonb not null default '{}'::jsonb,
  add column if not exists featured_at timestamptz,
  add column if not exists view_count bigint not null default 0;
alter table public.posts drop constraint if exists posts_channel_check;
alter table public.posts add constraint posts_channel_check check (channel in ('community','ai'));
alter table public.posts drop constraint if exists posts_content_type_check;
alter table public.posts add constraint posts_content_type_check check (content_type in ('community_post','knowledge_article','agent','skill','prompt','ai_tool','tutorial'));
alter table public.posts drop constraint if exists posts_channel_content_type_check;
alter table public.posts add constraint posts_channel_content_type_check check (
  (channel = 'community' and content_type = 'community_post')
  or (channel = 'ai' and content_type in ('knowledge_article','agent','skill','prompt','ai_tool','tutorial'))
);
alter table public.posts drop constraint if exists posts_resource_data_object_check;
alter table public.posts add constraint posts_resource_data_object_check check (jsonb_typeof(resource_data) = 'object');
create index if not exists posts_channel_feed_idx on public.posts(channel, status, created_at desc, id desc);
create index if not exists posts_ai_type_feed_idx on public.posts(channel, content_type, status, created_at desc, id desc) where channel = 'ai';
create index if not exists posts_featured_channel_idx on public.posts(channel, featured_at desc) where status = 'published' and featured_at is not null;
update public.posts p set view_count = coalesce(v.views,0)
from (select post_id,count(*)::bigint as views from public.user_interactions where viewed_at is not null group by post_id) v
where p.id = v.post_id and p.view_count = 0;

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to anon, authenticated
  using (status = 'published' or author_id = (select auth.uid()) or (select public.has_staff_permission('content.review')));
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated
  using (author_id = (select auth.uid()) or (select public.has_staff_permission('content.review')))
  with check (
    (author_id = (select auth.uid()) and status in ('draft','pending_review'))
    or (select public.has_staff_permission('content.review'))
  );

-- Reviewers may change moderation fields, but cannot edit the work itself.
create or replace function heika_private.guard_reviewer_content_updates()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_role text;
begin
  select p.role into actor_role from public.profiles p where p.id = (select auth.uid());
  if actor_role <> 'reviewer' then return new; end if;
  if tg_table_name = 'posts' then
    -- This transaction-local marker can only be set inside the trusted review RPC.
    if current_setting('heika.apply_review_post_id', true) = new.id::text then return new; end if;
    if (to_jsonb(new) - array['status','moderation_review_note','moderation_reviewed_at','moderation_reviewed_by','updated_at'])
       is distinct from
       (to_jsonb(old) - array['status','moderation_review_note','moderation_reviewed_at','moderation_reviewed_by','updated_at']) then
      raise exception '审核员只能修改审核状态和审核记录';
    end if;
  elsif tg_table_name = 'post_revisions' then
    if (to_jsonb(new) - array['status','review_note','reviewed_at','reviewed_by','updated_at'])
       is distinct from
       (to_jsonb(old) - array['status','review_note','reviewed_at','reviewed_by','updated_at']) then
      raise exception '审核员不能改写投稿版本';
    end if;
    if new.status = 'approved' and not exists (
      select 1 from public.posts p where p.id = new.post_id and p.status = 'published'
        and p.title = new.payload->>'title' and p.body = new.payload->>'body'
        and p.channel = coalesce(new.payload->>'channel','community')
        and p.content_type = coalesce(new.payload->>'contentType','community_post')
        and p.resource_data = coalesce(new.payload->'resourceData','{}'::jsonb)
    ) then
      raise exception '请通过审核流程应用修改后再确认版本';
    end if;
  end if;
  return new;
end
$$;
revoke all on function heika_private.guard_reviewer_content_updates() from public, anon, authenticated;
drop trigger if exists guard_reviewer_posts on public.posts;
create trigger guard_reviewer_posts before update on public.posts
  for each row execute function heika_private.guard_reviewer_content_updates();
drop trigger if exists guard_reviewer_post_revisions on public.post_revisions;
create trigger guard_reviewer_post_revisions before update on public.post_revisions
  for each row execute function heika_private.guard_reviewer_content_updates();

drop policy if exists post_revisions_read on public.post_revisions;
create policy post_revisions_read on public.post_revisions for select to authenticated
  using (author_id = (select auth.uid()) or (select public.has_staff_permission('content.review')));
drop policy if exists post_revisions_update on public.post_revisions;
create policy post_revisions_update on public.post_revisions for update to authenticated
  using (author_id = (select auth.uid()) or (select public.has_staff_permission('content.review')))
  with check (
    (author_id = (select auth.uid()) and status in ('pending','rejected')
      and exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()) and p.status = 'published'))
    or (select public.has_staff_permission('content.review'))
  );
drop policy if exists post_revisions_delete on public.post_revisions;
create policy post_revisions_delete on public.post_revisions for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.has_staff_permission('content.review')));

-- AI categories are ordinary catalog entries, not a magic topic label.
insert into public.interest_tags(name, active, is_custom, channel, kind, sort_order, description, is_featured, moderation_status)
values
  ('Agent', true, false, 'ai', 'category', 10, 'AI 智能体与自动化工作流', true, 'approved'),
  ('Skills', true, false, 'ai', 'category', 20, 'AI 技能插件、安装与使用', true, 'approved'),
  ('Prompt', true, false, 'ai', 'category', 30, '提示词模板与提示词工程', true, 'approved'),
  ('AI 知识', true, false, 'ai', 'category', 40, '基础科普、模型技术与行业动态', true, 'approved'),
  ('AI 工具', true, false, 'ai', 'category', 50, '工具介绍、测评与使用经验', true, 'approved'),
  ('实战教程', true, false, 'ai', 'category', 60, '利用 AI 完成真实任务或开发项目', true, 'approved')
on conflict (name) do update set channel = excluded.channel, kind = excluded.kind,
  sort_order = excluded.sort_order, description = excluded.description, is_featured = excluded.is_featured;

create or replace function public.merge_interest_tag(p_source_id bigint, p_target_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare source_tag public.interest_tags%rowtype; target_tag public.interest_tags%rowtype;
begin
  if not heika_private.has_staff_permission('category.manage') then raise exception '没有分类管理权限'; end if;
  if p_source_id = p_target_id then raise exception '不能将分类合并到自身'; end if;
  select * into source_tag from public.interest_tags where id = p_source_id for update;
  select * into target_tag from public.interest_tags where id = p_target_id and active for update;
  if not found or source_tag.id is null then raise exception '分类不存在'; end if;
  if source_tag.channel <> target_tag.channel or source_tag.kind <> target_tag.kind then raise exception '只能合并到同频道、同类型分类'; end if;
  if target_tag.parent_id = p_source_id then raise exception '不能将上级分类合并到它的子分类'; end if;

  update public.posts set tag_id = p_target_id, updated_at = now() where tag_id = p_source_id;
  insert into public.post_topics(post_id, topic_id, created_at)
    select post_id, p_target_id, created_at from public.post_topics where topic_id = p_source_id on conflict do nothing;
  delete from public.post_topics where topic_id = p_source_id;
  insert into public.user_interests(user_id, tag_id)
    select user_id, p_target_id from public.user_interests where tag_id = p_source_id on conflict do nothing;
  delete from public.user_interests where tag_id = p_source_id;
  insert into public.topic_follows(user_id, topic_id, created_at)
    select user_id, p_target_id, created_at from public.topic_follows where topic_id = p_source_id on conflict do nothing;
  delete from public.topic_follows where topic_id = p_source_id;
  delete from public.user_recommendation_filters old_filter
    where old_filter.target_topic_id = p_source_id and exists (
      select 1 from public.user_recommendation_filters new_filter
      where new_filter.user_id = old_filter.user_id and new_filter.filter_type = 'topic' and new_filter.target_topic_id = p_target_id
    );
  update public.user_recommendation_filters set target_topic_id = p_target_id
    where target_topic_id = p_source_id and filter_type = 'topic';
  update public.topic_events set topic_id = p_target_id where topic_id = p_source_id;
  update public.interest_tags set parent_id = p_target_id where parent_id = p_source_id;
  update public.interest_tags set
    aliases = array(select distinct alias from unnest(aliases || source_tag.aliases || array[source_tag.name]) alias)
  where id = p_target_id;
  update public.interest_tags set active = false, merged_into_id = p_target_id, moderation_status = 'approved' where id = p_source_id;
  return jsonb_build_object('source_id', p_source_id, 'target_id', p_target_id, 'source_name', source_tag.name, 'target_name', target_tag.name);
end
$$;
revoke all on function public.merge_interest_tag(bigint,bigint) from public, anon;
grant execute on function public.merge_interest_tag(bigint,bigint) to authenticated;

create table if not exists public.ai_resource_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  version_label text not null check (char_length(btrim(version_label)) between 1 and 40),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  changelog text not null default '' check (char_length(changelog) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(post_id, version_label)
);
create index if not exists ai_resource_versions_post_idx on public.ai_resource_versions(post_id, created_at desc);
alter table public.ai_resource_versions enable row level security;
revoke all on public.ai_resource_versions from public, anon;
grant select, insert on public.ai_resource_versions to authenticated;
create policy ai_resource_versions_read on public.ai_resource_versions for select to authenticated
  using (
    exists(select 1 from public.posts p where p.id = post_id and p.channel = 'ai' and (p.status = 'published' or p.author_id = (select auth.uid())))
    or (select public.has_staff_permission('ai.review'))
  );
create policy ai_resource_versions_insert on public.ai_resource_versions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.has_staff_permission('ai.review'))
    and exists(select 1 from public.posts p where p.id = post_id and p.channel = 'ai')
  );

create table if not exists public.ai_resource_feedback (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('broken_link','unsafe','outdated','other')),
  details text not null check (char_length(btrim(details)) between 3 and 1000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  review_note text,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_resource_feedback_queue_idx on public.ai_resource_feedback(status, created_at desc);
create unique index if not exists ai_resource_feedback_open_user_idx on public.ai_resource_feedback(post_id, reporter_id, kind) where status = 'open';
alter table public.ai_resource_feedback enable row level security;
revoke all on public.ai_resource_feedback from public, anon;
grant select, insert on public.ai_resource_feedback to authenticated;
grant update(status, review_note, handled_by, handled_at) on public.ai_resource_feedback to authenticated;
create policy ai_resource_feedback_read on public.ai_resource_feedback for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.has_staff_permission('ai.review')));
create policy ai_resource_feedback_insert on public.ai_resource_feedback for insert to authenticated
  with check (
    reporter_id = (select auth.uid()) and status = 'open' and review_note is null and handled_by is null and handled_at is null
    and exists(select 1 from public.posts p where p.id = post_id and p.channel = 'ai' and p.status = 'published' and p.author_id <> (select auth.uid()))
  );
create policy ai_resource_feedback_update on public.ai_resource_feedback for update to authenticated
  using ((select public.has_staff_permission('ai.review')))
  with check ((select public.has_staff_permission('ai.review')));
create or replace function heika_private.guard_ai_resource_feedback_target()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.posts p where p.id = new.post_id and p.channel = 'ai') then
    raise exception '反馈对象不是 AI 内容';
  end if;
  return new;
end
$$;
revoke all on function heika_private.guard_ai_resource_feedback_target() from public, anon, authenticated;
drop trigger if exists guard_ai_resource_feedback_target on public.ai_resource_feedback;
create trigger guard_ai_resource_feedback_target before insert or update of post_id
  on public.ai_resource_feedback for each row execute function heika_private.guard_ai_resource_feedback_target();

-- Preserve the existing topic, rating, bookmark and comment graph for AI posts.
drop policy if exists post_topics_staff_read on public.post_topics;
create policy post_topics_staff_read on public.post_topics for select to authenticated
  using ((select public.has_staff_permission('content.review')));
drop policy if exists post_topics_admin_manage on public.post_topics;
create policy post_topics_admin_manage on public.post_topics for all to authenticated
  using ((select public.has_staff_permission('content.review')) and current_setting('heika.apply_review_post_id', true) = post_id::text)
  with check ((select public.has_staff_permission('content.review')) and current_setting('heika.apply_review_post_id', true) = post_id::text);
drop policy if exists post_media_staff_read on public.post_media;
create policy post_media_staff_read on public.post_media for select to authenticated
  using ((select public.has_staff_permission('content.review')));
drop policy if exists post_media_admin_manage on public.post_media;
create policy post_media_admin_manage on public.post_media for all to authenticated
  using ((select public.has_staff_permission('content.review')) and current_setting('heika.apply_review_post_id', true) = post_id::text)
  with check ((select public.has_staff_permission('content.review')) and current_setting('heika.apply_review_post_id', true) = post_id::text);
drop policy if exists covers_read on storage.objects;
create policy covers_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'post-covers' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_admin())
    or ((select public.has_staff_permission('content.review')) and (
      exists(select 1 from public.post_media m where m.storage_path = name)
      or exists(select 1 from public.post_revisions r where r.status = 'pending' and coalesce(r.payload->'mediaPaths','[]'::jsonb) ? name)
    ))
    or exists(select 1 from public.post_media m join public.posts p on p.id = m.post_id
      where m.storage_path = name and p.status = 'published'
        and not coalesce((select profile.notes_private from public.profiles profile where profile.id = p.author_id), false))
  ));
drop policy if exists post_videos_read on storage.objects;
create policy post_videos_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'post-videos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_admin())
    or ((select public.has_staff_permission('content.review')) and (
      exists(select 1 from public.post_media m where m.storage_path = name)
      or exists(select 1 from public.post_revisions r where r.status = 'pending' and coalesce(r.payload->'mediaPaths','[]'::jsonb) ? name)
    ))
    or exists(select 1 from public.post_media m join public.posts p on p.id = m.post_id
      where m.storage_path = name and p.status = 'published'
        and not coalesce((select profile.notes_private from public.profiles profile where profile.id = p.author_id), false))
  ));

drop policy if exists moderation_audit_logs_admin_read on public.moderation_audit_logs;
create policy moderation_audit_logs_admin_read on public.moderation_audit_logs for select to authenticated
  using ((select public.has_staff_permission('audit.read')));
drop policy if exists moderation_audit_logs_admin_insert on public.moderation_audit_logs;
create policy moderation_audit_logs_admin_insert on public.moderation_audit_logs for insert to authenticated
  with check (actor_id = (select auth.uid()) and (select public.has_staff_permission('audit.read')));

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.has_staff_permission('reports.manage')));
drop policy if exists reports_admin on public.reports;
create policy reports_admin on public.reports for update to authenticated
  using ((select public.has_staff_permission('reports.manage')))
  with check ((select public.has_staff_permission('reports.manage')));
revoke update on public.reports from authenticated;
grant update(status, review_note, reviewed_by, reviewed_at) on public.reports to authenticated;
drop policy if exists comments_admin on public.comments;
create policy comments_admin on public.comments for update to authenticated
  using ((select public.has_staff_permission('comments.manage')))
  with check ((select public.has_staff_permission('comments.manage')));
revoke update on public.comments from authenticated;
grant update(status) on public.comments to authenticated;
alter table public.dm_reports
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;
drop policy if exists dm_report_read on public.dm_reports;
create policy dm_report_read on public.dm_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.has_staff_permission('reports.manage')));
drop policy if exists dm_report_admin on public.dm_reports;
create policy dm_report_admin on public.dm_reports for update to authenticated
  using ((select public.has_staff_permission('reports.manage')))
  with check ((select public.has_staff_permission('reports.manage')));
revoke update on public.dm_reports from authenticated;
grant update(status, review_note, reviewed_by, reviewed_at) on public.dm_reports to authenticated;

-- Give users a durable appeal path for hidden work, hidden comments, resolved
-- reports, and active account restrictions; staff decisions stay auditable.
drop policy if exists community_restrictions_own_read on public.community_restrictions;
create policy community_restrictions_own_read on public.community_restrictions for select to authenticated
  using (user_id = (select auth.uid()));
create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  appellant_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('content','comment','report','account')),
  target_id text not null check (char_length(target_id) between 1 and 100),
  target_title text not null default '' check (char_length(target_title) <= 160),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  status text not null default 'open' check (status in ('open','accepted','rejected')),
  review_note text,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'open' and handled_by is null and handled_at is null) or (status <> 'open' and handled_by is not null and handled_at is not null))
);
create unique index if not exists moderation_appeals_one_open_target_idx
  on public.moderation_appeals(appellant_id,target_type,target_id) where status = 'open';
create index if not exists moderation_appeals_queue_idx on public.moderation_appeals(status,created_at desc);
alter table public.moderation_appeals enable row level security;
revoke all on public.moderation_appeals from public, anon;
grant select,insert,update on public.moderation_appeals to authenticated;
revoke update on public.moderation_appeals from authenticated;
grant update(status,review_note,handled_by,handled_at) on public.moderation_appeals to authenticated;
drop policy if exists moderation_appeals_read on public.moderation_appeals;
create policy moderation_appeals_read on public.moderation_appeals for select to authenticated
  using (appellant_id = (select auth.uid()) or (select public.has_staff_permission('appeals.manage')));
drop policy if exists moderation_appeals_insert on public.moderation_appeals;
create policy moderation_appeals_insert on public.moderation_appeals for insert to authenticated
  with check (
    appellant_id = (select auth.uid()) and status = 'open' and review_note is null and handled_by is null and handled_at is null
    and case target_type
      when 'content' then exists(select 1 from public.posts p where p.id::text = target_id and p.author_id = (select auth.uid()) and p.status = 'hidden')
      when 'comment' then exists(select 1 from public.comments c where c.id::text = target_id and c.author_id = (select auth.uid()) and c.status = 'hidden')
      when 'report' then exists(select 1 from public.reports r where r.id::text = target_id and r.reporter_id = (select auth.uid()) and r.status in ('resolved','dismissed'))
      when 'account' then target_id = (select auth.uid())::text and exists(select 1 from public.community_restrictions r where r.user_id = (select auth.uid()) and r.active)
      else false
    end
  );
drop policy if exists moderation_appeals_update on public.moderation_appeals;
create policy moderation_appeals_update on public.moderation_appeals for update to authenticated
  using ((select public.has_staff_permission('appeals.manage')))
  with check ((select public.has_staff_permission('appeals.manage')));
drop policy if exists community_restrictions_admin_all on public.community_restrictions;
create policy community_restrictions_admin_all on public.community_restrictions for all to authenticated
  using ((select public.has_staff_permission('accounts.manage')))
  with check ((select public.has_staff_permission('accounts.manage')));

create or replace function public.resolve_moderation_appeal(p_id uuid, p_decision text, p_review_note text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare appeal public.moderation_appeals%rowtype;
begin
  if not public.has_staff_permission('appeals.manage') then raise exception '没有申诉处理权限'; end if;
  if p_decision not in ('accepted','rejected') or char_length(btrim(p_review_note)) not between 3 and 500 then raise exception '申诉决定或处理说明无效'; end if;
  select * into appeal from public.moderation_appeals where id = p_id and status = 'open' for update;
  if not found then raise exception '申诉已处理或不存在'; end if;

  if p_decision = 'accepted' then
    if appeal.target_type = 'content' then
      update public.posts set status = 'published', moderation_review_note = btrim(p_review_note), moderation_reviewed_at = now(), moderation_reviewed_by = auth.uid(), updated_at = now()
        where id::text = appeal.target_id and author_id = appeal.appellant_id and status = 'hidden';
      if not found then raise exception '申诉作品已变化，无法恢复'; end if;
    elsif appeal.target_type = 'comment' then
      update public.comments set status = 'visible' where id::text = appeal.target_id and author_id = appeal.appellant_id and status = 'hidden';
      if not found then raise exception '申诉评论已变化，无法恢复'; end if;
    elsif appeal.target_type = 'report' then
      update public.reports set status = 'open', review_note = null, reviewed_at = null, reviewed_by = null
        where id::text = appeal.target_id and reporter_id = appeal.appellant_id and status in ('resolved','dismissed');
      if not found then raise exception '申诉举报已变化，无法重新打开'; end if;
    elsif appeal.target_type = 'account' then
      if not public.has_staff_permission('accounts.manage') then raise exception '账号限制申诉需要超级管理员处理'; end if;
      delete from public.community_restrictions where user_id = appeal.appellant_id and active;
      if not found then raise exception '账号限制已变化，无法解除'; end if;
    end if;
  end if;

  update public.moderation_appeals set status = p_decision, review_note = btrim(p_review_note), handled_by = auth.uid(), handled_at = now() where id = p_id;
  return jsonb_build_object('id', appeal.id, 'status', p_decision, 'target_type', appeal.target_type, 'target_id', appeal.target_id);
end
$$;
revoke all on function public.resolve_moderation_appeal(uuid,text,text) from public, anon;
grant execute on function public.resolve_moderation_appeal(uuid,text,text) to authenticated;

-- Reuse the existing notification center for authors' moderation outcomes.
alter table public.app_notifications drop constraint if exists app_notifications_notification_type_check;
alter table public.app_notifications add constraint app_notifications_notification_type_check
  check (notification_type in ('creator_post','topic_post','series_post','comment','reply','moderation'));
create or replace function heika_private.notify_post_moderation_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.author_id is not null and new.status is distinct from old.status
    and (new.status = 'hidden' or (old.status in ('pending_review','hidden') and new.status = 'published')) then
    insert into public.app_notifications(recipient_id,actor_id,notification_type,entity_id,post_id,title)
    values(new.author_id,auth.uid(),'moderation',gen_random_uuid(),new.id,
      case when new.status = 'published' then '你的作品已审核通过并公开' else '你的作品未通过审核，请查看原因并修改' end);
  end if;
  return new;
end
$$;
revoke all on function heika_private.notify_post_moderation_result() from public,anon,authenticated;
drop trigger if exists notify_post_moderation_result on public.posts;
create trigger notify_post_moderation_result after update of status on public.posts
  for each row execute function heika_private.notify_post_moderation_result();
create or replace function heika_private.notify_revision_moderation_result()
returns trigger language plpgsql security definer set search_path = '' as $$
declare post_channel text;
begin
  if old.status = 'pending' and new.status in ('approved','rejected') then
    select p.channel into post_channel from public.posts p where p.id = new.post_id;
    insert into public.app_notifications(recipient_id,actor_id,notification_type,entity_id,post_id,title)
    values(new.author_id,auth.uid(),'moderation',gen_random_uuid(),new.post_id,
      case when new.status = 'approved'
        then case when post_channel = 'ai' then '你的 AI 内容修改已审核通过' else '你的作品修改已审核通过' end
        else case when post_channel = 'ai' then '你的 AI 内容修改未通过审核' else '你的作品修改未通过审核' end end);
  end if;
  return new;
end
$$;
revoke all on function heika_private.notify_revision_moderation_result() from public,anon,authenticated;
drop trigger if exists notify_revision_moderation_result on public.post_revisions;
create trigger notify_revision_moderation_result after update of status on public.post_revisions
  for each row execute function heika_private.notify_revision_moderation_result();

-- Version snapshots are generated by database writes to published AI resources;
-- clients cannot forge or replace release history.
drop policy if exists ai_resource_versions_insert on public.ai_resource_versions;
drop policy if exists ai_resource_versions_read on public.ai_resource_versions;
revoke insert on public.ai_resource_versions from authenticated;
grant select on public.ai_resource_versions to anon, authenticated;
create policy ai_resource_versions_read on public.ai_resource_versions for select to anon, authenticated
  using (exists(select 1 from public.posts p where p.id = post_id and p.channel = 'ai' and p.status = 'published'));

create or replace function heika_private.capture_ai_resource_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare next_version integer;
begin
  if new.channel <> 'ai' or new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' and old.channel = new.channel
    and old.title is not distinct from new.title and old.body is not distinct from new.body
    and old.tag_id is not distinct from new.tag_id and old.resource_data is not distinct from new.resource_data then
    return new;
  end if;
  select coalesce(max(nullif(regexp_replace(version_label, '[^0-9]', '', 'g'), '')::integer), 0) + 1
    into next_version from public.ai_resource_versions where post_id = new.id;
  insert into public.ai_resource_versions(post_id, version_label, payload, changelog, created_by)
  values (new.id, 'v' || next_version::text,
    jsonb_build_object('title', new.title, 'body', new.body, 'contentType', new.content_type, 'resourceData', new.resource_data, 'categoryId', new.tag_id),
    coalesce(new.resource_data->>'changelog', case when next_version = 1 then '首次发布' else '审核通过的更新' end), new.author_id);
  return new;
end
$$;
revoke all on function heika_private.capture_ai_resource_version() from public, anon, authenticated;
drop trigger if exists capture_ai_resource_version on public.posts;
create trigger capture_ai_resource_version after insert or update of status, title, body, tag_id, content_type, resource_data on public.posts
  for each row execute function heika_private.capture_ai_resource_version();

-- Review staged AI edits atomically while keeping the previously published
-- version public until an authorized reviewer approves the complete payload.
create or replace function public.apply_ai_post_revision(p_post_id uuid, p_review_note text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare revision public.post_revisions%rowtype; current_post public.posts%rowtype; target_tag_id bigint; target_type text; target_data jsonb;
  topic_names text[];
begin
  if not public.has_staff_permission('ai.review') then raise exception '需要 AI 内容审核权限'; end if;
  select * into revision from public.post_revisions where post_id = p_post_id and status = 'pending' for update;
  if not found then raise exception '待审核修改不存在'; end if;
  select * into current_post from public.posts where id = p_post_id for update;
  if not found or current_post.channel <> 'ai' or current_post.status <> 'published' or current_post.author_id <> revision.author_id then
    raise exception 'AI 资源已不可用，无法应用修改';
  end if;
  if char_length(btrim(revision.payload->>'title')) not between 1 and 80 or char_length(btrim(revision.payload->>'body')) not between 1 and 5000 then
    raise exception '待审核内容无效';
  end if;
  target_type := revision.payload->>'contentType';
  if target_type not in ('knowledge_article','agent','skill','prompt','ai_tool','tutorial') then raise exception 'AI 内容类型无效'; end if;
  target_data := coalesce(revision.payload->'resourceData','{}'::jsonb);
  if jsonb_typeof(target_data) <> 'object' then raise exception 'AI 资源字段无效'; end if;
  select id into target_tag_id from public.interest_tags where name = revision.payload->>'tag' and channel = 'ai' and kind = 'category' and active and merged_into_id is null;
  if target_tag_id is null then raise exception 'AI 分类已失效'; end if;
  if jsonb_typeof(revision.payload->'mediaPaths') is distinct from 'array' then raise exception '媒体列表无效'; end if;
  if jsonb_array_length(revision.payload->'mediaPaths') > 9 or exists(select 1 from jsonb_array_elements_text(revision.payload->'mediaPaths') p where p !~ ('^' || revision.author_id::text || '/[^/]{1,280}$')) then raise exception '媒体路径无效'; end if;
  if jsonb_typeof(revision.payload->'topics') is distinct from 'array' then raise exception '标签列表无效'; end if;
  select coalesce(array_agg(value), '{}') into topic_names from jsonb_array_elements_text(revision.payload->'topics') as topics(value);
  if cardinality(topic_names) > 5 or cardinality(topic_names) <> (select count(distinct value) from unnest(topic_names) value)
    or exists(select 1 from unnest(topic_names) n left join public.interest_tags t on t.name = n and t.channel = 'ai' and t.kind = 'tag' and t.active and t.moderation_status = 'approved' where t.id is null) then
    raise exception 'AI 标签无效';
  end if;
  perform set_config('heika.apply_review_post_id', p_post_id::text, true);
  update public.posts set title = btrim(revision.payload->>'title'), body = btrim(revision.payload->>'body'), tag_id = target_tag_id,
    content_type = target_type, resource_data = target_data, image_url = nullif(revision.payload->>'coverUrl',''),
    moderation_review_note = p_review_note, moderation_reviewed_at = now(), moderation_reviewed_by = auth.uid(), updated_at = now()
    where id = p_post_id;
  delete from public.post_media where post_id = p_post_id;
  insert into public.post_media(post_id, storage_path, sort_order)
    select p_post_id, value, (ordinality - 1)::integer from jsonb_array_elements_text(revision.payload->'mediaPaths') with ordinality as paths(value, ordinality);
  delete from public.post_topics where post_id = p_post_id;
  insert into public.post_topics(post_id, topic_id)
    select p_post_id, t.id from public.interest_tags t where t.name = any(topic_names) and t.channel = 'ai' and t.kind = 'tag' and t.active and t.moderation_status = 'approved';
  update public.post_revisions set status = 'approved', review_note = p_review_note, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now() where id = revision.id;
  return jsonb_build_object('id', p_post_id, 'status', 'published', 'revision_applied', true);
end
$$;
revoke all on function public.apply_ai_post_revision(uuid, text) from public, anon;
grant execute on function public.apply_ai_post_revision(uuid, text) to authenticated;

create or replace function public.get_staff_category_counts()
returns table(category_id bigint, content_count bigint)
language sql stable security definer set search_path = '' as $$
  select t.id, count(p.id)::bigint
  from public.interest_tags t left join public.posts p on p.tag_id = t.id
  where t.active and t.merged_into_id is null and heika_private.has_staff_permission('category.manage')
  group by t.id
$$;
revoke all on function public.get_staff_category_counts() from public, anon;
grant execute on function public.get_staff_category_counts() to authenticated;

create or replace function public.get_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'; result jsonb;
begin
  if not heika_private.has_staff_permission('content.read') then raise exception '没有管理概览权限'; end if;
  select jsonb_build_object(
    'usersToday',(select count(*) from public.profiles where created_at >= day_start),
    'postsToday',(select count(*) from public.posts where created_at >= day_start),
    'pending',(select count(*) from public.posts where status='pending_review') + (select count(*) from public.post_revisions where status='pending'),
    'pendingReports',(select count(*) from public.reports where status='open') + (select count(*) from public.dm_reports where status='open') + (select count(*) from public.moderation_appeals where status='open'),
    'aiResources',(select count(*) from public.posts where channel='ai' and status='published'),
    'views',(select coalesce(sum(view_count),0) from public.posts where status='published'),
    'likes',(select coalesce(sum(like_count),0) from public.post_like_stats),
    'saves',(select count(*) from public.bookmarks),
    'comments',(select count(*) from public.comments where status='visible'),
    'recent',coalesce((select jsonb_agg(jsonb_build_object('id',item.id,'action',item.action,'target_type',item.target_type,'target_id',item.target_id,'reason',item.reason,'created_at',item.created_at,'nickname',item.nickname) order by item.created_at desc)
      from (select l.id,l.action,l.target_type,l.target_id,l.reason,l.created_at,p.nickname from public.moderation_audit_logs l left join public.profiles p on p.id=l.actor_id order by l.created_at desc limit 6) item),'[]'::jsonb),
    'asOf',now()) into result;
  return result;
end
$$;
revoke all on function public.get_admin_overview() from public, anon;
grant execute on function public.get_admin_overview() to authenticated;

create or replace function public.record_post_view(p_post_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); next_count bigint;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.posts where id=p_post_id and status='published') then raise exception '内容不存在'; end if;
  with recorded as (
    insert into public.user_interactions(user_id,post_id,viewed_at) values(uid,p_post_id,now())
    on conflict(user_id,post_id) do update set viewed_at=excluded.viewed_at where public.user_interactions.viewed_at is null
    returning post_id
  ) update public.posts set view_count=view_count+1 where id=p_post_id and exists(select 1 from recorded);
  select view_count into next_count from public.posts where id=p_post_id;
  return next_count;
end
$$;
revoke all on function public.record_post_view(uuid) from public, anon;
grant execute on function public.record_post_view(uuid) to authenticated;

create or replace function public.create_channel_tag(p_name text,p_channel text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cleaned_name text; new_tag public.interest_tags%rowtype; tag_count integer;
begin
  if uid is null then raise exception '请先登录'; end if;
  cleaned_name := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  if char_length(cleaned_name) not between 2 and 24 then raise exception '标签名称须为 2–24 个字符'; end if;
  if p_channel not in ('community','ai') then raise exception '频道无效'; end if;
  select count(*) into tag_count from public.interest_tags where created_by=uid and channel=p_channel and kind='tag' and is_custom;
  if tag_count >= 30 then raise exception '每个频道最多创建 30 个自定义标签'; end if;
  insert into public.interest_tags(name,active,is_custom,created_by,channel,kind,sort_order,moderation_status)
    values(cleaned_name,true,true,uid,p_channel,'tag',100,'pending') returning * into new_tag;
  return jsonb_build_object('id',new_tag.id,'name',new_tag.name,'channel',new_tag.channel,'kind',new_tag.kind,'moderation_status',new_tag.moderation_status);
exception when unique_violation then raise exception '这个标签已存在，请直接搜索并选择';
end
$$;
revoke all on function public.create_channel_tag(text,text) from public, anon;
grant execute on function public.create_channel_tag(text,text) to authenticated;

-- Keep the established discovery RPCs and daily flip mechanics intact while
-- drawing their candidate pool exclusively from the community channel.
create or replace function public.get_discover_cursor(
  p_limit integer, p_tag bigint default null, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with feed_limit as (select least(greatest(coalesce(p_limit,24),1),24) as value),
  visible_posts as materialized (
    select p.id,p.created_at from public.posts p
    where p.status='published' and p.channel='community' and (p_tag is null or p.tag_id=p_tag)
      and not exists(select 1 from public.user_recommendation_filters f where f.user_id=auth.uid() and f.filter_type='author' and f.target_author_id=p.author_id)
      and not exists(select 1 from public.post_topics pt join public.user_recommendation_filters f on f.target_topic_id=pt.topic_id where pt.post_id=p.id and f.user_id=auth.uid() and f.filter_type='topic')
      and not exists(select 1 from public.user_interactions i where i.post_id=p.id and i.user_id=auth.uid() and i.skipped_at is not null)
  ), eligible_posts as (
    select id,created_at from visible_posts where p_cursor_created_at is null or (p_cursor_id is not null and (created_at,id)<(p_cursor_created_at,p_cursor_id))
  ), candidates as (
    select e.id,e.created_at from eligible_posts e order by e.created_at desc,e.id desc limit (select value+1 from feed_limit)
  ), page_rows as (
    select c.id,c.created_at from candidates c order by c.created_at desc,c.id desc limit (select value from feed_limit)
  ) select jsonb_build_object('ids',coalesce((select jsonb_agg(id order by created_at desc,id desc) from page_rows),'[]'::jsonb),
    'has_more',(select count(*)>(select value from feed_limit) from candidates),
    'total',case when p_cursor_created_at is null then (select count(*) from visible_posts) else null end)
$$;
revoke all on function public.get_discover_cursor(integer,bigint,timestamptz,uuid) from public;
grant execute on function public.get_discover_cursor(integer,bigint,timestamptz,uuid) to anon,authenticated;

create or replace function public.get_recommendation_page(p_page integer,p_limit integer,p_tag bigint default null,p_query text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible_posts as materialized (
    select p.id,p.created_at from public.posts p where p.status='published' and p.channel='community'
      and (p_tag is null or p.tag_id=p_tag) and (p_query is null or strpos(lower(p.title),lower(p_query))>0)
      and not exists(select 1 from public.user_recommendation_filters f where f.user_id=auth.uid() and f.filter_type='author' and f.target_author_id=p.author_id)
      and not exists(select 1 from public.post_topics pt join public.user_recommendation_filters f on f.target_topic_id=pt.topic_id where pt.post_id=p.id and f.user_id=auth.uid() and f.filter_type='topic')
      and not exists(select 1 from public.user_interactions i where i.post_id=p.id and i.user_id=auth.uid() and i.skipped_at is not null)
  ), page_rows as (
    select id,created_at from visible_posts order by created_at desc,id desc
      limit least(greatest(coalesce(p_limit,12),1),50) offset (greatest(coalesce(p_page,1),1)-1)*least(greatest(coalesce(p_limit,12),1),50)
  ) select jsonb_build_object('ids',coalesce((select jsonb_agg(id order by created_at desc,id desc) from page_rows),'[]'::jsonb),'total',(select count(*) from visible_posts))
$$;
revoke all on function public.get_recommendation_page(integer,integer,bigint,text) from public;
grant execute on function public.get_recommendation_page(integer,integer,bigint,text) to anon,authenticated;

create or replace function public.get_daily_deck()
returns table(deck_id uuid,local_date date,slot int,post_id uuid,opened_at timestamptz,swapped_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare uid uuid:=auth.uid(); tz text; today date; did uuid; chosen uuid[]:=array[]::uuid[]; candidate uuid; slot_no int; interests bigint[]; cfg public.recommendation_settings%rowtype;
begin
  if uid is null then raise exception 'authentication required'; end if;
  select p.timezone into tz from public.profiles p where p.id=uid; if tz is null then raise exception 'profile missing'; end if;
  today:=(now() at time zone tz)::date; perform pg_advisory_xact_lock(hashtext(uid::text||today::text));
  select d.id into did from public.daily_decks d where d.user_id=uid and d.local_date=today;
  if did is null then
    insert into public.daily_decks(user_id,local_date,timezone) values(uid,today,tz) returning id into did;
    select array_agg(tag_id) into interests from public.user_interests where user_id=uid;
    select * into cfg from public.recommendation_settings where id=1;
    for slot_no in 1..5 loop
      candidate:=null;
      if slot_no<=cfg.interest_slots then
        select p.id into candidate from public.posts p where p.status='published' and p.channel='community' and p.tag_id=any(coalesce(interests,array[]::bigint[])) and not(p.id=any(chosen)) order by md5(uid::text||today::text||p.id::text) limit 1;
      elsif slot_no<=cfg.interest_slots+cfg.adjacent_slots then
        select p.id into candidate from public.posts p where p.status='published' and p.channel='community' and not(p.tag_id=any(coalesce(interests,array[]::bigint[]))) and not(p.id=any(chosen)) order by md5(uid::text||today::text||p.id::text) limit 1;
      elsif slot_no<=cfg.interest_slots+cfg.adjacent_slots+cfg.curated_slots then
        select p.id into candidate from public.posts p join public.curated_posts c on c.post_id=p.id where p.status='published' and p.channel='community' and not(p.id=any(chosen)) order by c.priority desc,md5(uid::text||today::text||p.id::text) limit 1;
      end if;
      if candidate is null then select p.id into candidate from public.posts p where p.status='published' and p.channel='community' and not(p.id=any(chosen)) order by md5(uid::text||today::text||p.id::text) limit 1; end if;
      if candidate is null then raise exception 'at least five published posts required'; end if;
      insert into public.daily_cards(deck_id,slot,post_id) values(did,slot_no,candidate); chosen:=array_append(chosen,candidate);
    end loop;
  end if;
  return query select d.id,d.local_date,c.slot,c.post_id,c.opened_at,d.swapped_at from public.daily_decks d join public.daily_cards c on c.deck_id=d.id where d.id=did order by c.slot;
end
$$;

create or replace function public.swap_daily_card()
returns table(deck_id uuid,local_date date,slot int,post_id uuid,opened_at timestamptz,swapped_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare did uuid; tz text; today date; target_slot int; replacement uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform public.get_daily_deck(); select p.timezone into tz from public.profiles p where p.id=auth.uid(); today:=(now() at time zone tz)::date;
  select d.id into did from public.daily_decks d where d.user_id=auth.uid() and d.local_date=today for update;
  if (select d.swapped_at is not null from public.daily_decks d where d.id=did) then raise exception 'already swapped today'; end if;
  select c.slot into target_slot from public.daily_cards c where c.deck_id=did and c.opened_at is null order by c.slot limit 1;
  if target_slot is null then raise exception 'all cards already opened'; end if;
  select p.id into replacement from public.posts p where p.status='published' and p.channel='community' and not exists(select 1 from public.daily_cards c where c.deck_id=did and c.post_id=p.id) order by md5(auth.uid()::text||today::text||'swap'||p.id::text) limit 1;
  if replacement is null then raise exception 'no replacement available'; end if;
  update public.daily_cards c set post_id=replacement where c.deck_id=did and c.slot=target_slot;
  update public.daily_decks d set swapped_at=now() where d.id=did;
  return query select d.id,d.local_date,c.slot,c.post_id,c.opened_at,d.swapped_at from public.daily_decks d join public.daily_cards c on c.deck_id=d.id where d.id=did order by c.slot;
end
$$;


-- Use the same atomic revision workflow for staff reviewers while preserving the existing post, media, poll, and topic records.
create or replace function public.apply_post_revision(p_post_id uuid, p_review_note text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  revision public.post_revisions%rowtype;
  current_post public.posts%rowtype;
  target_tag_id bigint;
  target_series_id uuid;
  media_paths text[];
  topic_names text[];
  current_poll public.post_polls%rowtype;
  current_options jsonb;
  current_votes bigint;
  target_poll jsonb;
  target_question text;
  target_options text[];
  target_poll_id uuid;
begin
  if not public.has_staff_permission('content.review') then raise exception '需要作品审核权限'; end if;
  select * into revision from public.post_revisions where post_id = p_post_id and status = 'pending' for update;
  if not found then raise exception '待审核修改不存在'; end if;
  select * into current_post from public.posts where id = p_post_id for update;
  if not found or current_post.status <> 'published' or current_post.author_id <> revision.author_id then
    raise exception '原内容已不可用，无法应用修改';
  end if;
  if jsonb_typeof(revision.payload->'title') is distinct from 'string' or char_length(btrim(revision.payload->>'title')) not between 1 and 80
    or jsonb_typeof(revision.payload->'body') is distinct from 'string' or char_length(btrim(revision.payload->>'body')) not between 1 and 5000 then
    raise exception '待审核正文数据无效';
  end if;
  select id into target_tag_id from public.interest_tags where name = revision.payload->>'tag' and active;
  if target_tag_id is null then raise exception '分类已失效'; end if;
  target_series_id := nullif(revision.payload->>'seriesId', '')::uuid;
  if target_series_id is not null and not exists (select 1 from public.post_series where id = target_series_id and creator_id = revision.author_id) then
    raise exception '作品系列已失效';
  end if;
  if jsonb_typeof(revision.payload->'mediaPaths') is distinct from 'array' then raise exception '图片列表无效'; end if;
  select coalesce(array_agg(value order by ordinality), '{}') into media_paths
  from jsonb_array_elements_text(revision.payload->'mediaPaths') with ordinality as paths(value, ordinality);
  if cardinality(media_paths) > 9 or cardinality(media_paths) <> (select count(distinct value) from unnest(media_paths) value)
    or exists (
      select 1 from unnest(media_paths) value
      where value !~ ('^' || revision.author_id::text || '/[^/]+$')
        or char_length(value) > char_length(revision.author_id::text) + 281
    ) then
    raise exception '图片列表无效';
  end if;
  if jsonb_typeof(revision.payload->'topics') is distinct from 'array' then raise exception '话题列表无效'; end if;
  select coalesce(array_agg(value), '{}') into topic_names from jsonb_array_elements_text(revision.payload->'topics') as topics(value);
  if cardinality(topic_names) > 5 or cardinality(topic_names) <> (select count(distinct value) from unnest(topic_names) value)
    or exists (select 1 from unnest(topic_names) n left join public.interest_tags t on t.name = n and t.active where t.id is null) then
    raise exception '话题列表无效';
  end if;
  if coalesce(revision.payload->>'coverUrl', '') <> '' and revision.payload->>'coverUrl' !~ '^https?://' then raise exception '封面地址无效'; end if;

  target_poll := revision.payload->'poll';
  select * into current_poll from public.post_polls where post_id = p_post_id;
  if found then
    select coalesce(jsonb_agg(label order by position), '[]'::jsonb), coalesce(sum(vote_count), 0)
      into current_options, current_votes from public.post_poll_options where poll_id = current_poll.id;
    if current_votes > 0 and target_poll is distinct from jsonb_build_object('question', current_poll.question, 'options', current_options) then
      raise exception '投票已有人参与，无法应用对投票的修改';
    end if;
  else
    current_votes := 0;
  end if;
  if current_votes = 0 then
    if target_poll is null or target_poll = 'null'::jsonb then
      delete from public.post_polls where post_id = p_post_id;
    else
      target_question := btrim(target_poll->>'question');
      select array_agg(btrim(value) order by ordinality) into target_options
      from jsonb_array_elements_text(target_poll->'options') with ordinality as options(value, ordinality)
      where btrim(value) <> '';
      if target_question is null or char_length(target_question) not between 1 and 180 or coalesce(cardinality(target_options), 0) not between 2 and 4
        or exists (select 1 from unnest(target_options) value where char_length(value) > 80)
        or cardinality(target_options) <> (select count(distinct value) from unnest(target_options) value) then
        raise exception '投票内容无效';
      end if;
      if current_poll.id is not null then
        update public.post_polls set question = target_question where id = current_poll.id returning id into target_poll_id;
        delete from public.post_poll_options where post_poll_options.poll_id = target_poll_id;
      else
        insert into public.post_polls(post_id, question) values (p_post_id, target_question) returning id into target_poll_id;
      end if;
      insert into public.post_poll_options(poll_id, label, position)
      select target_poll_id, value, (ordinality - 1)::smallint from unnest(target_options) with ordinality as options(value, ordinality);
    end if;
  end if;

  perform set_config('heika.apply_review_post_id', p_post_id::text, true);
  delete from public.post_media where post_id = p_post_id;
  insert into public.post_media(post_id, storage_path, sort_order)
  select p_post_id, value, (ordinality - 1)::int from unnest(media_paths) with ordinality as paths(value, ordinality);
  delete from public.post_topics where post_id = p_post_id;
  insert into public.post_topics(post_id, topic_id)
  select p_post_id, t.id from public.interest_tags t where t.name = any(topic_names) and t.active;
  update public.posts set
    title = btrim(revision.payload->>'title'), body = btrim(revision.payload->>'body'), tag_id = target_tag_id,
    series_id = target_series_id, image_url = nullif(revision.payload->>'coverUrl', ''), status = 'published',
    moderation_review_note = p_review_note, moderation_reviewed_at = now(), moderation_reviewed_by = auth.uid(), updated_at = now()
  where id = p_post_id;
  update public.post_revisions set status = 'approved', review_note = p_review_note, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
  where id = revision.id;
  return jsonb_build_object('id', p_post_id, 'status', 'published', 'revision_applied', true);
end;
$$;
revoke all on function public.apply_post_revision(uuid, text) from public, anon;
grant execute on function public.apply_post_revision(uuid, text) to authenticated;
