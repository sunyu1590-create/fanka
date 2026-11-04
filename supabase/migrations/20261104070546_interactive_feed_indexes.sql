create index post_highlights_post_user_idx on public.post_highlights(post_id, user_id);
create index user_recommendation_author_target_idx on public.user_recommendation_filters(target_author_id) where filter_type = 'author';
create index user_recommendation_topic_target_idx on public.user_recommendation_filters(target_topic_id) where filter_type = 'topic';

create or replace function public.get_recommendation_page(p_page integer, p_limit integer, p_tag bigint default null, p_query text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible_posts as materialized (
    select p.id, p.created_at
    from public.posts p
    where p.status = 'published'
      and (p_tag is null or p.tag_id = p_tag)
      and (p_query is null or strpos(lower(p.title), lower(p_query)) > 0)
      and not exists (
        select 1 from public.user_recommendation_filters f
        where f.user_id = auth.uid() and f.filter_type = 'author' and f.target_author_id = p.author_id
      )
      and not exists (
        select 1 from public.post_topics pt
        join public.user_recommendation_filters f on f.target_topic_id = pt.topic_id
        where pt.post_id = p.id and f.user_id = auth.uid() and f.filter_type = 'topic'
      )
      and not exists (
        select 1 from public.user_interactions i
        where i.post_id = p.id and i.user_id = auth.uid() and i.skipped_at is not null
      )
  ), page_rows as (
    select id, created_at from visible_posts order by created_at desc, id desc
    limit least(greatest(coalesce(p_limit, 12), 1), 50)
    offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_limit, 12), 1), 50)
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id order by created_at desc, id desc) from page_rows), '[]'::jsonb),
    'total', (select count(*) from visible_posts)
  );
$$;
revoke all on function public.get_recommendation_page(integer, integer, bigint, text) from public;
grant execute on function public.get_recommendation_page(integer, integer, bigint, text) to anon, authenticated;
