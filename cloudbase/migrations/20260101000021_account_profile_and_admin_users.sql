
-- Keep profile setup automatic for newly verified and unverified Auth users.
create or replace function public.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, nickname)
  values (
    new.id,
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'nickname'), 24), ''), '探索者')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.profiles
  add column if not exists role_updated_at timestamptz,
  add column if not exists role_updated_by uuid references public.profiles(id) on delete set null;

create policy profiles_admin_role_update
on public.profiles for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

grant update(role, role_updated_at, role_updated_by) on public.profiles to authenticated;

create or replace function public.prevent_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    if not public.is_admin() and current_user <> 'postgres' then
      raise exception 'role change denied';
    end if;

    if old.role = 'admin' and new.role <> 'admin' then
      perform pg_advisory_xact_lock(hashtext('heika-final-admin-guard'));
      if not exists (
        select 1 from public.profiles
        where role = 'admin' and id <> old.id
      ) then
        raise exception 'cannot remove the last administrator';
      end if;
    end if;

    new.role_updated_at := now();
    new.role_updated_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke execute on function public.create_profile() from public, anon, authenticated;
