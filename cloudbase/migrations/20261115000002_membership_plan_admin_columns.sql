-- Allow the existing admin-only RLS policy to manage allowance and activation
-- fields through the CloudBase PostgREST-compatible API.
grant update (daily_flip_allowance, active) on public.membership_plans to authenticated;
