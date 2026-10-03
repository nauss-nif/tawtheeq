-- أبعاد الصورة المعروضة (لترتيب الصور وتجميعها حسب الاتجاه في المجلة)
-- وإعدادات آخر تعديل في المحرّر (ليفتح المحرّر على آخر قص وتكبير وفلتر بدل الوضع الافتراضي)
alter table public.media
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists edit_params jsonb;

comment on column public.media.width is 'عرض الصورة المعروضة (processed) بالبكسل';
comment on column public.media.height is 'ارتفاع الصورة المعروضة (processed) بالبكسل';
comment on column public.media.edit_params is 'آخر إعدادات المحرّر: القص والتدوير والمقاس والتكبير والإزاحة والفلتر والمنزلقات';
