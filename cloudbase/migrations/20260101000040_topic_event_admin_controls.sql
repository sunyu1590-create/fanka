alter table public.topic_events
  add column if not exists is_active boolean not null default true;

drop policy if exists topic_events_read on public.topic_events;
create policy topic_events_read on public.topic_events
for select to anon, authenticated
using (
  (is_active and starts_at <= now() and ends_at > now())
  or created_by = (select auth.uid())
  or public.is_admin()
);

create index if not exists topic_events_admin_order_idx
  on public.topic_events(is_active, starts_at desc, ends_at);
