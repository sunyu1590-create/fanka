create index topic_events_topic_idx on public.topic_events(topic_id);
create index topic_events_created_by_idx on public.topic_events(created_by) where created_by is not null;
