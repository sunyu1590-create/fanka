-- A single public app download destination controlled only by administrators.
-- This additive table is safe to leave in place if an older app build is restored.
create table public.app_download_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  download_url text check (download_url is null or (length(download_url) <= 2048 and download_url ~ '^https://[^[:space:]]+$')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.app_download_settings(id) values (1) on conflict (id) do nothing;

alter table public.app_download_settings enable row level security;

create policy app_download_public_read_enabled on public.app_download_settings
  for select to anon, authenticated
  using (id = 1 and enabled and download_url is not null);

create policy app_download_admin_read on public.app_download_settings
  for select to authenticated
  using (public.is_admin());

create policy app_download_admin_update on public.app_download_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.app_download_settings to anon, authenticated;
grant update on public.app_download_settings to authenticated;
