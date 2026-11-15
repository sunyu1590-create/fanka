create table public.exploration_ad_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  kind text not null default 'text' check (kind in ('text', 'image')),
  title text not null default '' check (length(title) <= 80),
  body text not null default '' check (length(body) <= 300),
  image_url text check (image_url is null or length(image_url) <= 2048),
  post_id uuid references public.posts(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check (not enabled or (length(btrim(title)) > 0 and post_id is not null)),
  check (not enabled or kind <> 'image' or image_url is not null)
);

insert into public.exploration_ad_settings(id) values (1);

alter table public.exploration_ad_settings enable row level security;

create policy exploration_ad_read_enabled on public.exploration_ad_settings
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      id = 1 and enabled and post_id is not null
      and exists (
        select 1 from public.posts p
        where p.id = exploration_ad_settings.post_id and p.status = 'published'
      )
    )
  );

create policy exploration_ad_admin_update on public.exploration_ad_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.exploration_ad_settings to anon, authenticated;
grant update on public.exploration_ad_settings to authenticated;
