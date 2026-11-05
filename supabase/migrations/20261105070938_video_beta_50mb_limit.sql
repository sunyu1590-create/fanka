-- Keep the beta upload cap within Supabase Free's global upload limit.
update storage.buckets
set file_size_limit = 52428800
where id = 'post-videos';
