-- ==========================================================================
-- مكتبة البرومو الثابتة على مستوى المنصة
--
-- الشعارات الرسمية والمقاطع الموسيقية المعتمدة يرفعها المدير مرة واحدة،
-- فيختار منها كل المنسقين دون رفع متكرّر ودون قرارات ترخيص فردية.
-- ==========================================================================

create type promo_library_kind as enum ('music', 'logo');

create table public.promo_library (
  id           uuid primary key default gen_random_uuid(),
  kind         promo_library_kind not null,
  title        text not null,
  -- الموسيقى: التصنيف (cinematic/corporate…) | الشعار: الجهة المالكة
  subtitle     text,
  url          text not null,
  storage_path text not null,
  mime         text,
  file_size    bigint,
  duration     numeric,   -- للموسيقى
  width        int,       -- للشعار
  height       int,
  -- الترخيص مسؤولية مؤسسية: يُسجَّل عند الرفع ويُعرض للمنسق قبل الاختيار
  license      text,
  attribution  text,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index promo_library_kind_idx on public.promo_library(kind, is_active, sort_order);

create trigger promo_library_touch before update on public.promo_library
  for each row execute function public.touch_updated_at();

alter table public.promo_library enable row level security;

-- كل مستخدم مفعّل يقرأ المكتبة (ليختار منها)، والمدير وحده يكتب فيها
create policy promo_library_select on public.promo_library
  for select to authenticated using (is_active or public.is_admin());

create policy promo_library_write on public.promo_library
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ==========================================================================
-- إصلاح سياسات التخزين
--
-- السياسات السابقة تحوّل أول جزء من المسار إلى uuid مباشرة. ملفات المكتبة
-- تعيش تحت البادئة `library/` وليست uuid، والتحويل المباشر يرفع خطأ يُجهض
-- عملية الرفع كاملةً (لا يعيد false فحسب). لذلك نمرّر عبر دالة آمنة تعيد
-- NULL لأي مسار ليس معرّفًا صالحًا.
-- ==========================================================================

create or replace function public.promo_path_course(p text)
returns uuid
language plpgsql
immutable
as $$
declare seg text;
begin
  seg := split_part(p, '/', 1);
  if seg ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return seg::uuid;
  end if;
  return null;
end;
$$;

drop policy if exists "promo write own course"  on storage.objects;
drop policy if exists "promo update own course" on storage.objects;
drop policy if exists "promo delete own course" on storage.objects;

-- مسارات الدورات: {course_id}/{promo_id}/…  — للمنسق صاحب الدورة
-- مسار المكتبة:   library/…                 — للمدير وحده
create policy "promo write own course" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'promo'
    and (
      public.is_active_coordinator(public.promo_path_course(name))
      or (name like 'library/%' and public.is_admin())
    )
  );

create policy "promo update own course" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'promo'
    and (
      public.is_admin()
      or public.is_active_coordinator(public.promo_path_course(name))
    )
  );

create policy "promo delete own course" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'promo'
    and (
      public.is_admin()
      or public.is_active_coordinator(public.promo_path_course(name))
    )
  );
