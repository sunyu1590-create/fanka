-- Additive upgrade: existing content and profiles remain intact.
alter table public.profiles add column if not exists avatar_url text;
create table public.browsing_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 home_mode text not null default 'waterfall' check(home_mode in ('waterfall','blackcard')),
 daily_count int not null default 7 check(daily_count between 1 and 30),
 dm_permission text not null default 'everyone' check(dm_permission in ('everyone','nobody')),
 updated_at timestamptz not null default now()
);
create table public.user_blocks (
 owner_id uuid references public.profiles(id) on delete cascade,
 blocked_id uuid references public.profiles(id) on delete cascade,
 primary key(owner_id,blocked_id), check(owner_id<>blocked_id)
);
create table public.dm_conversations (
 id uuid primary key default gen_random_uuid(),
 user_a uuid not null references public.profiles(id),
 user_b uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(user_a,user_b), check(user_a<user_b)
);
create table public.dm_reads (
 conversation_id uuid references public.dm_conversations(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade,
 read_at timestamptz not null default now(), primary key(conversation_id,user_id)
);
create table public.dm_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id),
 media_path text,
 body text not null check(length(trim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index dm_messages_page on public.dm_messages(conversation_id,created_at desc,id);
create index dm_sender_time on public.dm_messages(sender_id,created_at desc);
create table public.dm_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public.profiles(id),
 user_id uuid references public.profiles(id),
 message_id uuid references public.dm_messages(id) on delete set null,
 reason text not null check(length(trim(reason)) between 3 and 500),
 status text not null default 'open' check(status in ('open','resolved','dismissed')),
 created_at timestamptz not null default now()
);
alter table public.browsing_preferences enable row level security;
alter table public.user_blocks enable row level security;
alter table public.dm_conversations enable row level security;
alter table public.dm_reads enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_reports enable row level security;
create policy preferences_own on public.browsing_preferences for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy blocks_own on public.user_blocks for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy conversation_read on public.dm_conversations for select to authenticated using((select auth.uid()) in (user_a,user_b));
create policy message_read on public.dm_messages for select to authenticated using(exists(select 1 from public.dm_conversations c where c.id=conversation_id and (select auth.uid()) in (c.user_a,c.user_b)));
create policy message_delete on public.dm_messages for delete to authenticated using(sender_id=(select auth.uid()));
create policy reads_select on public.dm_reads for select to authenticated using(user_id=(select auth.uid()));
create policy reads_write on public.dm_reads for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.dm_conversations c where c.id=conversation_id and (select auth.uid()) in (c.user_a,c.user_b)));
create policy dm_report_insert on public.dm_reports for insert to authenticated with check(reporter_id=(select auth.uid()) and status='open' and (user_id is not null or message_id is not null) and (message_id is null or exists(select 1 from public.dm_messages m where m.id=message_id)));
create policy dm_report_read on public.dm_reports for select to authenticated using(reporter_id=(select auth.uid()) or public.is_admin());
create policy dm_report_admin on public.dm_reports for update to authenticated using(public.is_admin()) with check(public.is_admin());
-- Narrow privileged entry points validate both identities and permissions.
create function public.open_dm(peer uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); result uuid;
begin
 if me is null or peer=me or peer is null then raise exception '无效的聊天对象'; end if;
 if exists(select 1 from public.user_blocks where (owner_id=me and blocked_id=peer) or (owner_id=peer and blocked_id=me)) or exists(select 1 from public.browsing_preferences where user_id=peer and dm_permission='nobody') then raise exception '对方暂不接受私聊'; end if;
 insert into public.dm_conversations(user_a,user_b) values(least(me,peer),greatest(me,peer)) on conflict(user_a,user_b) do nothing;
 select id into result from public.dm_conversations where user_a=least(me,peer) and user_b=greatest(me,peer);
 return result;
end $$;
create function public.send_dm(room uuid, content text, nonce uuid, image_path text default null) returns public.dm_messages language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); peer uuid; result public.dm_messages;
begin
 if me is null then raise exception '请先登录'; end if;
 select case when user_a=me then user_b else user_a end into peer from public.dm_conversations where id=room and me in (user_a,user_b);
 if peer is null then raise exception '无权访问会话'; end if;
 if exists(select 1 from public.user_blocks where (owner_id=me and blocked_id=peer) or (owner_id=peer and blocked_id=me)) or exists(select 1 from public.browsing_preferences where user_id=peer and dm_permission='nobody') then raise exception '对方暂不接受私聊'; end if;
 select * into result from public.dm_messages where id=nonce and sender_id=me and conversation_id=room;
 if found then return result; end if;
 perform pg_advisory_xact_lock(hashtext(me::text));
 if (select count(*) from public.dm_messages where sender_id=me and created_at>now()-interval '1 minute')>=30 then raise exception '发送过于频繁，请稍后重试'; end if;
 if image_path is not null and (split_part(image_path,'/',1)<>room::text or split_part(image_path,'/',2)<>me::text) then raise exception '图片路径无效'; end if;
 insert into public.dm_messages(id,conversation_id,sender_id,body,media_path) values(nonce,room,me,trim(content),image_path) returning * into result;
 return result;
end $$;
revoke all on function public.open_dm(uuid),public.send_dm(uuid,text,uuid,text) from public,anon;
grant execute on function public.open_dm(uuid),public.send_dm(uuid,text,uuid,text) to authenticated;
grant select,insert,update,delete on public.browsing_preferences,public.user_blocks,public.dm_reads to authenticated;
grant select on public.dm_conversations to authenticated;
grant select,delete on public.dm_messages to authenticated;
grant select,insert,update on public.dm_reports to authenticated;
alter publication supabase_realtime add table public.dm_messages;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('heika-chat','heika-chat',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy chat_image_read on storage.objects for select to authenticated using(bucket_id='heika-chat' and exists(select 1 from public.dm_conversations c where c.id::text=split_part(name,'/',1) and (select auth.uid()) in(c.user_a,c.user_b)));
create policy chat_image_insert on storage.objects for insert to authenticated with check(bucket_id='heika-chat' and split_part(name,'/',2)=(select auth.uid())::text and exists(select 1 from public.dm_conversations c where c.id::text=split_part(name,'/',1) and (select auth.uid()) in(c.user_a,c.user_b)));
