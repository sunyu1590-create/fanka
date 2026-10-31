alter table public.dm_reports add column evidence jsonb;
create function heika_private.guard_dm_report() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('dm-report:'||new.reporter_id::text));
 if (select count(*) from public.dm_reports where reporter_id=new.reporter_id and created_at>now()-interval '1 hour')>=10 then raise exception '举报过于频繁，请稍后重试'; end if;
 new.created_at:=now();new.evidence:=null;
 if new.message_id is not null then
 select jsonb_build_object('body',m.body,'sender_id',m.sender_id,'created_at',m.created_at) into new.evidence from public.dm_messages m join public.dm_conversations c on c.id=m.conversation_id where m.id=new.message_id and auth.uid() in(c.user_a,c.user_b);
 if new.evidence is null then raise exception '无权举报此消息'; end if;
 end if;
 return new;
end $$;
revoke execute on function heika_private.guard_dm_report() from public,anon,authenticated;
create trigger dm_report_guard before insert on public.dm_reports for each row execute function heika_private.guard_dm_report();
create policy limits_admin on public.request_limits for select to authenticated using(public.is_admin());
