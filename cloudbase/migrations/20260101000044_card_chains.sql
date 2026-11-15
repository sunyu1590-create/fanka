create table if not exists public.exploration_chains (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  seed_post_id uuid not null references public.posts(id) on delete cascade,
  title text not null check (char_length(title) between 4 and 100),
  prompt text not null check (char_length(prompt) between 8 and 220),
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists exploration_chains_status_created_idx on public.exploration_chains(status, created_at desc);
create index if not exists exploration_chains_owner_created_idx on public.exploration_chains(owner_id, created_at desc);

create table if not exists public.exploration_chain_entries (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.exploration_chains(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  content text not null check (char_length(content) between 8 and 600),
  created_at timestamptz not null default now(),
  unique(chain_id,user_id)
);
create index if not exists exploration_chain_entries_chain_created_idx on public.exploration_chain_entries(chain_id, created_at);
alter table public.exploration_chains enable row level security;
alter table public.exploration_chain_entries enable row level security;
revoke all on public.exploration_chains, public.exploration_chain_entries from public, anon, authenticated;
grant all on public.exploration_chains, public.exploration_chain_entries to service_role;
