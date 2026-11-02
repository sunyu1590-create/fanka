create table if not exists public.account_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists account_recovery_codes_email_hash_idx
  on public.account_recovery_codes (lower(email), code_hash);

alter table public.account_recovery_codes enable row level security;
revoke all on public.account_recovery_codes from anon, authenticated;
grant all on public.account_recovery_codes to service_role;
