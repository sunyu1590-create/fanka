-- Non-destructive rollback for Settings 2.0 feedback and comment notification preferences.
-- Preserve submitted feedback under a retired table name for later export or restoration.
begin;
alter table public.user_feedback disable row level security;
revoke all on public.user_feedback from anon, authenticated;
alter table public.user_feedback rename to user_feedback_retired_20261106012928;
-- Keep notification preference data as a harmless unused field during rollback.
commit;
