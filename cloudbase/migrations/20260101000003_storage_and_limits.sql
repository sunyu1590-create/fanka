-- The bucket is private; clients access files through authorized signed URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('post-covers','post-covers',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy covers_insert on storage.objects for insert to authenticated with check(bucket_id='post-covers' and (storage.foldername(name))[1]=auth.uid()::text);
create policy covers_read on storage.objects for select to authenticated using(bucket_id='post-covers' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy covers_delete on storage.objects for delete to authenticated using(bucket_id='post-covers' and (storage.foldername(name))[1]=auth.uid()::text);
create table public.request_limits (user_id uuid not null references public.profiles(id) on delete cascade, action text not null, bucket_start timestamptz not null, count int not null default 1, primary key(user_id,action,bucket_start));
alter table public.request_limits enable row level security;
create or replace function public.check_rate_limit(action_name text, max_count int, window_seconds int) returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); start_at timestamptz; seen int;
begin
 if uid is null then raise exception 'authentication required'; end if;
 if action_name not in ('comment','post','report') or max_count<1 or window_seconds<1 then raise exception 'invalid limit'; end if;
 start_at:=to_timestamp(floor(extract(epoch from now())/window_seconds)*window_seconds);
 insert into public.request_limits(user_id,action,bucket_start) values(uid,action_name,start_at) on conflict(user_id,action,bucket_start) do update set count=public.request_limits.count+1 returning count into seen;
 if seen>max_count then raise exception 'rate limit exceeded'; end if;
end $$;
revoke all on function public.check_rate_limit(text,int,int) from public;
grant execute on function public.check_rate_limit(text,int,int) to authenticated;
