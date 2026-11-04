-- Keep aggregate counters writable only by the vote-count trigger.
revoke insert, update, delete on public.post_polls, public.post_poll_options from public, anon, authenticated;
grant select on public.post_polls, public.post_poll_options to anon, authenticated;
grant insert, delete on public.post_polls to authenticated;
grant update (question) on public.post_polls to authenticated;
grant insert, delete on public.post_poll_options to authenticated;
grant update (label, position) on public.post_poll_options to authenticated;

create or replace function public.prevent_deleting_voted_poll_options()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.post_poll_options o where o.poll_id = old.poll_id and o.vote_count > 0) then
    raise exception 'poll options cannot be removed after voting starts';
  end if;
  return old;
end;
$$;
revoke all on function public.prevent_deleting_voted_poll_options() from public, anon, authenticated;
create trigger post_poll_options_protect_votes before delete on public.post_poll_options
  for each row execute function public.prevent_deleting_voted_poll_options();
