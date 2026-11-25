-- 封面与轮播的存储桶、模板使用计数。
-- 两个桶都设为 public：封面与运营轮播本身就是公开可见内容，
-- 公开读可让列表页直接命中 CDN 缓存，写入仍由服务端 service role 统一收口。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('series-covers', 'series-covers', true, 8388608, array['image/png', 'image/webp', 'image/jpeg']),
  ('home-banners', 'home-banners', true, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 模板使用计数：只统计真实生成成功的次数，不做估算。
create or replace function public.heika_cover_template_bump(p_template text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cover_templates
     set usage_count = usage_count + 1,
         updated_at = now()
   where id = p_template;
$$;

grant execute on function public.heika_cover_template_bump(text) to authenticated, anon;
