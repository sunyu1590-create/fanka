drop function public.create_custom_topic(text);

create function public.create_custom_topic(p_name text)
returns table(topic_id bigint, topic_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '^#+', ''));
begin
  if v_user_id is null then raise exception '请先登录'; end if;
  if length(v_name) < 2 or length(v_name) > 24 or v_name ~ '[[:cntrl:]#]' then
    raise exception '话题名称须为 2–24 字，且不能包含 #';
  end if;

  return query select t.id, t.name from public.interest_tags as t
    where lower(t.name) = lower(v_name) and t.active limit 1;
  if found then return; end if;

  if (select count(*) from public.interest_tags as t where t.created_by = v_user_id and t.is_custom) >= 30 then
    raise exception '每个账号最多创建 30 个自定义话题';
  end if;

  insert into public.interest_tags(name, active, created_by, is_custom)
    values (v_name, true, v_user_id, true)
    on conflict (lower(name)) do nothing
    returning public.interest_tags.id, public.interest_tags.name into topic_id, topic_name;

  if topic_id is null then
    select t.id, t.name into topic_id, topic_name from public.interest_tags as t
      where lower(t.name) = lower(v_name) and t.active limit 1;
  end if;
  return next;
end;
$$;

revoke execute on function public.create_custom_topic(text) from public, anon;
grant execute on function public.create_custom_topic(text) to authenticated;
