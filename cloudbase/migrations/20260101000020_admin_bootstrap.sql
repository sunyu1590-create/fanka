-- Let the project database owner provision the first administrator without
-- allowing normal users or the application server to change profile roles.
create or replace function public.prevent_role_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.role <> old.role and not public.is_admin() and current_user <> 'postgres' then
    raise exception 'role change denied';
  end if;
  return new;
end;
$$;

create or replace function public.bootstrap_first_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_user <> 'postgres' then raise exception 'database owner privileges required'; end if;
  perform pg_advisory_xact_lock(hashtext('heika-first-admin-bootstrap'));
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'an administrator already exists';
  end if;
  update public.profiles set role = 'admin' where id = p_user_id;
  if not found then raise exception 'profile not found'; end if;
end;
$$;
revoke all on function public.bootstrap_first_admin(uuid) from public, anon, authenticated, service_role;
grant execute on function public.bootstrap_first_admin(uuid) to postgres;
