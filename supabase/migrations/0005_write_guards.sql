-- Enforce write limits even when clients call PostgREST directly.
create or replace function public.guard_content_write() returns trigger language plpgsql security definer set search_path=public as $$
declare recent_count int; duplicate_count int;
begin
 new.created_at:=now();
 if tg_table_name='comments' then
   perform pg_advisory_xact_lock(hashtext('comment:'||new.author_id::text));
   select count(*) into recent_count from public.comments where author_id=new.author_id and created_at>now()-interval '1 minute';
   if recent_count>=5 then raise exception 'comment rate limit exceeded'; end if;
   select count(*) into duplicate_count from public.comments where author_id=new.author_id and post_id=new.post_id and body=new.body and created_at>now()-interval '10 minutes';
   if duplicate_count>0 then raise exception 'duplicate comment'; end if;
   if new.parent_id is not null and not exists(select 1 from public.comments c where c.id=new.parent_id and c.post_id=new.post_id and c.status='visible') then raise exception 'invalid parent comment'; end if;
 elsif tg_table_name='posts' then
   perform pg_advisory_xact_lock(hashtext('post:'||new.author_id::text));
   select count(*) into recent_count from public.posts where author_id=new.author_id and created_at>now()-interval '1 hour';
   if recent_count>=10 then raise exception 'post rate limit exceeded'; end if;
 elsif tg_table_name='reports' then
   perform pg_advisory_xact_lock(hashtext('report:'||new.reporter_id::text));
   select count(*) into recent_count from public.reports where reporter_id=new.reporter_id and created_at>now()-interval '1 hour';
   if recent_count>=10 then raise exception 'report rate limit exceeded'; end if;
 end if;
 return new;
end $$;
create trigger guard_comments before insert on public.comments for each row execute function public.guard_content_write();
create trigger guard_posts before insert on public.posts for each row when(new.is_demo=false) execute function public.guard_content_write();
create trigger guard_reports before insert on public.reports for each row execute function public.guard_content_write();
