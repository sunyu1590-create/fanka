-- Store each optional profile fact as its own row so RLS can expose only the
-- facts the owner explicitly marks public.
create table public.profile_attributes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  attribute text not null check (attribute in ('gender', 'mbti', 'birthday', 'hobbies')),
  value text not null default '',
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, attribute),
  check (length(value) <= 120)
);

create index profile_attributes_public_idx
  on public.profile_attributes(user_id, attribute) where is_public;

alter table public.profile_attributes enable row level security;
create policy profile_attributes_read
  on public.profile_attributes for select to anon, authenticated
  using (user_id = (select auth.uid()) or is_public);
create policy profile_attributes_insert
  on public.profile_attributes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profile_attributes_update
  on public.profile_attributes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy profile_attributes_delete
  on public.profile_attributes for delete to authenticated
  using (user_id = (select auth.uid()));
grant select on public.profile_attributes to anon, authenticated;
grant insert, update, delete on public.profile_attributes to authenticated;

-- Custom topics share the existing topic catalog and post aggregation. They
-- are created through a small authenticated RPC instead of broad table writes.
alter table public.interest_tags
  add column created_by uuid references public.profiles(id) on delete set null,
  add column is_custom boolean not null default false;

create unique index interest_tags_name_ci_uidx on public.interest_tags(lower(name));
create index interest_tags_creator_idx on public.interest_tags(created_by, id desc) where is_custom;

create function public.create_custom_topic(p_name text)
returns table(id bigint, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '^#+', ''));
begin
  if v_user_id is null then raise exception '请先登录'; end if;
  if length(v_name) < 2 or length(v_name) > 24 or v_name ~ '[[:cntrl:]#]' then
    raise exception '话题名称须为 2–24 字，且不能包含 #';
  end if;

  return query select t.id, t.name from public.interest_tags as t
    where lower(t.name) = lower(v_name) and t.active limit 1;
  if found then return; end if;

  if (select count(*) from public.interest_tags as t where t.created_by = v_user_id and t.is_custom) >= 30 then
    raise exception '每个账号最多创建 30 个自定义话题';
  end if;

  insert into public.interest_tags(name, active, created_by, is_custom)
    values (v_name, true, v_user_id, true)
    on conflict (lower(name)) do nothing
    returning public.interest_tags.id, public.interest_tags.name into id, name;

  if id is null then
    select t.id, t.name into id, name from public.interest_tags as t
      where lower(t.name) = lower(v_name) and t.active limit 1;
  end if;
  return next;
end;
$$;

revoke execute on function public.create_custom_topic(text) from public, anon;
grant execute on function public.create_custom_topic(text) to authenticated;
