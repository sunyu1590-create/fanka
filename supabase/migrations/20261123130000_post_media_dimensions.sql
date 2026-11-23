-- 详情页占位需要的原图像素尺寸。
--
-- 图片容器在请求发出前就必须确定高度，否则图片到达时会把正文整体下移。
-- 尺寸由 /api/v1/media 上传时写入；历史数据通过 scripts/backfill-media-dimensions.mjs 回填，
-- 回填前前端退回统一比例，布局仍然稳定。
alter table public.post_media add column if not exists width integer;
alter table public.post_media add column if not exists height integer;

comment on column public.post_media.width is '原图像素宽（EXIF 方向已校正）';
comment on column public.post_media.height is '原图像素高（EXIF 方向已校正）';
