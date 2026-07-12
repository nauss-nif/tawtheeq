-- ==========================================================================
-- دوال RPC عامة + دلاء التخزين (Storage buckets)
-- ==========================================================================

-- زيادة عدّاد المشاهدات عبر slug (آمنة للاستدعاء العام؛ لا تكشف بيانات)
create or replace function public.increment_magazine_views(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.courses
  set views_count = views_count + 1
  where magazine_slug = p_slug and status = 'published';
$$;

grant execute on function public.increment_magazine_views(text) to anon, authenticated;

-- إحصائيات لوحة المدير (تُجمَّع بأمان عبر security definer)
create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'courses_total',    (select count(*) from public.courses),
    'courses_published',(select count(*) from public.courses where status = 'published'),
    'views_total',      (select coalesce(sum(views_count),0) from public.courses),
    'coordinators_pending', (select count(*) from public.profiles where role='coordinator' and status='pending'),
    'coordinators_active',  (select count(*) from public.profiles where role='coordinator' and status='active'),
    'storage_current',  (select coalesce(sum(file_size),0)       from public.media),
    'storage_original', (select coalesce(sum(original_size),0)   from public.media),
    'storage_compressed',(select coalesce(sum(compressed_size),0) from public.media),
    'archive_pending',  (select count(*) from public.media where archive_status='pending'),
    'archive_done',     (select count(*) from public.media where archive_status='archived'),
    'archive_failed',   (select count(*) from public.media where archive_status='failed')
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_stats() to authenticated;

-- --------------------------------------------------------------------------
-- دلاء التخزين
--   media-processed : عام للقراءة (النسخ المضغوطة والمصغرات للعرض)
--   media-original  : خاص (النسخ الأصلية قبل الأرشفة، تُحذف بعد رفعها لـ SharePoint)
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media-processed', 'media-processed', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('media-original', 'media-original', false)
on conflict (id) do nothing;

-- سياسات bucket الأصلي: المنسق يرفع/يقرأ داخل مجلد دورته فقط
-- (المسار المتفق عليه: {course_id}/{media_id}.ext)
create policy "original upload own course" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media-original'
    and public.is_active_coordinator( (split_part(name, '/', 1))::uuid )
  );

create policy "original read own course" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media-original'
    and ( public.is_admin()
          or public.is_active_coordinator( (split_part(name, '/', 1))::uuid ) )
  );

create policy "original delete own course" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media-original'
    and ( public.is_admin()
          or public.is_active_coordinator( (split_part(name, '/', 1))::uuid ) )
  );

-- bucket المعالج: قراءة عامة، كتابة للمنسق صاحب الدورة
create policy "processed public read" on storage.objects
  for select using (bucket_id = 'media-processed');

create policy "processed write own course" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media-processed'
    and public.is_active_coordinator( (split_part(name, '/', 1))::uuid )
  );

create policy "processed delete own course" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media-processed'
    and ( public.is_admin()
          or public.is_active_coordinator( (split_part(name, '/', 1))::uuid ) )
  );
