alter table public.user_interactions
  add column rarity_tier text
  check (rarity_tier in ('ordinary', 'S', 'SS', 'SSS', 'pending'));
