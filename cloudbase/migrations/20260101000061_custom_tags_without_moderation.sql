-- Custom user-created labels are immediately usable. They remain subject to
-- normal community governance tools, but are not held in a review queue.

-- Earlier custom community topics inherited the table's category default.
-- Mark them as tags so they remain available as post topics without expanding
-- the curated category selector.
update public.interest_tags
set kind = 'tag'
where channel = 'community'
  and is_custom
  and kind = 'category';

-- Add a small curated starting set for both channels. User-created labels are
-- still fully supported and are not restricted to these suggestions.
insert into public.interest_tags
  (name, active, is_custom, channel, kind, sort_order, description, moderation_status)
values
  ('旅行', true, false, 'community', 'tag', 20, '旅行中的路线、见闻与灵感。', 'approved'),
  ('美食', true, false, 'community', 'tag', 21, '记录食物、餐厅与烹饪体验。', 'approved'),
  ('阅读', true, false, 'community', 'tag', 22, '分享书籍、摘录与阅读思考。', 'approved'),
  ('电影', true, false, 'community', 'tag', 23, '围绕电影、剧集与影像表达展开。', 'approved'),
  ('音乐', true, false, 'community', 'tag', 24, '分享音乐发现、演出与聆听体验。', 'approved'),
  ('运动', true, false, 'community', 'tag', 25, '记录运动、训练与健康习惯。', 'approved'),
  ('穿搭', true, false, 'community', 'tag', 26, '分享穿搭灵感与个人风格。', 'approved'),
  ('家居', true, false, 'community', 'tag', 27, '关注居住空间、收纳与日常设计。', 'approved'),
  ('数码', true, false, 'community', 'tag', 28, '交流数码产品、体验与使用技巧。', 'approved'),
  ('宠物', true, false, 'community', 'tag', 29, '记录宠物日常与相处故事。', 'approved'),
  ('AI 编程', true, false, 'ai', 'tag', 70, 'AI 辅助编程、代码生成与开发实践。', 'approved'),
  ('AI 绘图', true, false, 'ai', 'tag', 71, 'AI 图像生成、工作流与创作经验。', 'approved'),
  ('模型测评', true, false, 'ai', 'tag', 72, '分享模型能力、效果与使用边界。', 'approved'),
  ('提示词技巧', true, false, 'ai', 'tag', 73, '提示词结构、变量设计与实践方法。', 'approved'),
  ('自动化工作流', true, false, 'ai', 'tag', 74, 'AI 工具连接、自动化与工作流案例。', 'approved'),
  ('效率工具', true, false, 'ai', 'tag', 75, '提升工作和学习效率的 AI 工具实践。', 'approved'),
  ('本地模型', true, false, 'ai', 'tag', 76, '本地部署、推理与模型运行经验。', 'approved'),
  ('AI 创作', true, false, 'ai', 'tag', 77, '使用 AI 进行文字、图像或多媒体创作。', 'approved')
on conflict (lower(name)) do nothing;

create or replace function public.create_channel_tag(p_name text, p_channel text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cleaned_name text;
  existing_tag public.interest_tags%rowtype;
  new_tag public.interest_tags%rowtype;
  tag_count integer;
begin
  if uid is null then raise exception '请先登录'; end if;

  cleaned_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if char_length(cleaned_name) not between 2 and 24 then
    raise exception '标签名称须为 2–24 个字符';
  end if;
  if p_channel not in ('community', 'ai') then raise exception '频道无效'; end if;

  select * into existing_tag
  from public.interest_tags
  where lower(name) = lower(cleaned_name)
  limit 1;

  if found then
    if existing_tag.channel <> p_channel then
      raise exception '这个名称已在另一个频道使用，请换一个标签名';
    end if;
    if not existing_tag.active or existing_tag.merged_into_id is not null then
      raise exception '这个标签已停用，请换一个标签名';
    end if;
    return jsonb_build_object(
      'id', existing_tag.id,
      'name', existing_tag.name,
      'channel', existing_tag.channel,
      'kind', existing_tag.kind,
      'moderation_status', existing_tag.moderation_status
    );
  end if;

  select count(*) into tag_count
  from public.interest_tags
  where created_by = uid and channel = p_channel and kind = 'tag' and is_custom;
  if tag_count >= 30 then raise exception '每个频道最多创建 30 个自定义标签'; end if;

  insert into public.interest_tags
    (name, active, is_custom, created_by, channel, kind, sort_order, moderation_status)
  values
    (cleaned_name, true, true, uid, p_channel, 'tag', 100, 'approved')
  returning * into new_tag;

  return jsonb_build_object(
    'id', new_tag.id,
    'name', new_tag.name,
    'channel', new_tag.channel,
    'kind', new_tag.kind,
    'moderation_status', new_tag.moderation_status
  );
exception when unique_violation then
  raise exception '这个标签刚刚被创建，请重新搜索并选择';
end
$$;
revoke all on function public.create_channel_tag(text, text) from public, anon;
grant execute on function public.create_channel_tag(text, text) to authenticated;

create or replace function public.create_custom_topic(p_name text)
returns table(topic_id bigint, topic_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '^#+', ''));
  existing_tag public.interest_tags%rowtype;
begin
  if v_user_id is null then raise exception '请先登录'; end if;
  if length(v_name) < 2 or length(v_name) > 24 or v_name ~ '[[:cntrl:]#]' then
    raise exception '话题名称须为 2–24 字，且不能包含 #';
  end if;

  select * into existing_tag
  from public.interest_tags as t
  where lower(t.name) = lower(v_name)
  limit 1;
  if found then
    if existing_tag.channel <> 'community' then
      raise exception '这个名称已在另一个频道使用，请换一个话题名';
    end if;
    if not existing_tag.active or existing_tag.merged_into_id is not null then
      raise exception '这个话题已停用，请换一个话题名';
    end if;
    topic_id := existing_tag.id;
    topic_name := existing_tag.name;
    return next;
    return;
  end if;

  if (select count(*) from public.interest_tags as t
      where t.created_by = v_user_id and t.channel = 'community' and t.is_custom) >= 30 then
    raise exception '每个账号最多创建 30 个自定义话题';
  end if;

  insert into public.interest_tags
    (name, active, created_by, is_custom, channel, kind, moderation_status)
  values (v_name, true, v_user_id, true, 'community', 'tag', 'approved')
  returning id, name into topic_id, topic_name;
  return next;
exception when unique_violation then
  raise exception '这个话题刚刚被创建，请重新搜索并选择';
end;
$$;
revoke execute on function public.create_custom_topic(text) from public, anon;
grant execute on function public.create_custom_topic(text) to authenticated;
