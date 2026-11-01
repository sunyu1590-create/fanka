revoke update(membership_tier) on public.profiles from authenticated;

create or replace function public.set_membership_tier(p_profile_id uuid, p_membership_tier text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin access required'; end if;
  if p_membership_tier not in ('free', 'plus', 'pro') then raise exception 'invalid membership tier'; end if;
  update public.profiles set membership_tier = p_membership_tier where id = p_profile_id;
  if not found then raise exception 'profile not found'; end if;
  return p_membership_tier;
end;
$$;
revoke all on function public.set_membership_tier(uuid, text) from public, anon;
grant execute on function public.set_membership_tier(uuid, text) to authenticated;
