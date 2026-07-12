-- ==========================================================================
-- منصة "توثيق" — المخطط الأولي + Row Level Security
-- ==========================================================================

-- أنواع مُعدّدة (enums)
create type user_role       as enum ('admin', 'coordinator');
create type user_status     as enum ('pending', 'active', 'disabled');
create type course_status   as enum ('draft', 'published', 'archived');
create type media_type      as enum ('image', 'video');
create type processing_status as enum ('pending', 'processing', 'done', 'failed');
create type archive_status  as enum ('pending', 'archived', 'failed');
create type section_type    as enum ('cover', 'intro', 'gallery', 'video', 'quotes', 'closing');

-- --------------------------------------------------------------------------
-- profiles: يرتبط 1:1 مع auth.users
-- --------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       user_role   not null default 'coordinator',
  full_name  text        not null,
  phone      text,
  status     user_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- courses
-- --------------------------------------------------------------------------
create table public.courses (
  id             uuid primary key default gen_random_uuid(),
  coordinator_id uuid not null references public.profiles(id) on delete cascade,
  title          text not null,
  description    text,
  start_date     date,
  end_date       date,
  location       text,
  trainer_names  text[] not null default '{}',
  status         course_status not null default 'draft',
  magazine_slug  text unique,           -- slug عشوائي 12+ حرفًا، يُولَّد عند النشر
  template_id    text not null default 'classic', -- classic | modern | celebratory
  views_count    bigint not null default 0,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index courses_coordinator_idx on public.courses(coordinator_id);
create index courses_slug_idx        on public.courses(magazine_slug);

-- --------------------------------------------------------------------------
-- media
-- --------------------------------------------------------------------------
create table public.media (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references public.courses(id) on delete cascade,
  type              media_type not null,
  original_url      text,   -- يُحذف بعد الأرشفة في SharePoint
  processed_url     text,   -- النسخة المضغوطة للعرض (WebP / H.264)
  thumbnail_url     text,
  caption           text,
  sort_order        int not null default 0,
  is_cover          boolean not null default false,
  processing_status processing_status not null default 'pending',
  archive_status    archive_status    not null default 'pending',
  file_size         bigint,  -- الحجم الحالي المخزّن
  original_size     bigint,  -- الحجم قبل المعالجة
  compressed_size   bigint,  -- الحجم بعد المعالجة
  duration          numeric, -- مدة الفيديو بالثواني
  sharepoint_url    text,
  -- نتائج فرز الجودة (Sharp stats): تُستبعد الصور شديدة الضبابية/الظلام من الاقتراح
  is_low_quality    boolean not null default false,
  created_at        timestamptz not null default now()
);

create index media_course_idx on public.media(course_id);
create index media_sort_idx   on public.media(course_id, sort_order);

-- --------------------------------------------------------------------------
-- magazine_sections
-- --------------------------------------------------------------------------
create table public.magazine_sections (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  type       section_type not null,
  content    jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index magazine_sections_course_idx on public.magazine_sections(course_id);

-- --------------------------------------------------------------------------
-- دوال مساعدة (تعمل بامتياز أعلى لتجنّب التكرار في سياسات RLS)
-- --------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.is_active_coordinator(course uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.courses c
    join public.profiles p on p.id = c.coordinator_id
    where c.id = course
      and c.coordinator_id = auth.uid()
      and p.status = 'active'
  );
$$;

-- تحديث updated_at تلقائيًا
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger courses_touch before update on public.courses
  for each row execute function public.touch_updated_at();

-- عند إنشاء مستخدم جديد في auth.users، أنشئ ملفه تلقائيًا (حالة pending)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    'coordinator',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================================================
-- تفعيل RLS
-- ==========================================================================
alter table public.profiles          enable row level security;
alter table public.courses           enable row level security;
alter table public.media             enable row level security;
alter table public.magazine_sections enable row level security;

-- --------------------------- profiles -------------------------------------
-- المستخدم يقرأ ملفه، المدير يقرأ الجميع
create policy profiles_select_self_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- المستخدم يعدّل ملفه (لا يغيّر الدور/الحالة — يُضبط عبر خدمة الخادم)
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- المدير يعدّل أي ملف (اعتماد/تعطيل)
create policy profiles_update_admin on public.profiles
  for update using (public.is_admin());

-- --------------------------- courses --------------------------------------
-- المنسق يقرأ دوراته، المدير يقرأ الكل، والعامة تقرأ المنشورة فقط (عبر slug)
create policy courses_select_own on public.courses
  for select using (coordinator_id = auth.uid() or public.is_admin());

create policy courses_select_public_published on public.courses
  for select using (status = 'published' and magazine_slug is not null);

create policy courses_insert_own on public.courses
  for insert with check (coordinator_id = auth.uid());

create policy courses_update_own on public.courses
  for update using (coordinator_id = auth.uid() or public.is_admin());

create policy courses_delete_own on public.courses
  for delete using (coordinator_id = auth.uid() or public.is_admin());

-- --------------------------- media ----------------------------------------
create policy media_select_own on public.media
  for select using (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = media.course_id and c.coordinator_id = auth.uid())
  );

-- القراءة العامة لوسائط الدورات المنشورة فقط
create policy media_select_public on public.media
  for select using (
    exists (select 1 from public.courses c
            where c.id = media.course_id
              and c.status = 'published'
              and c.magazine_slug is not null)
  );

create policy media_write_own on public.media
  for all using (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = media.course_id and c.coordinator_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = media.course_id and c.coordinator_id = auth.uid())
  );

-- --------------------------- magazine_sections ----------------------------
create policy sections_select_own on public.magazine_sections
  for select using (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = magazine_sections.course_id and c.coordinator_id = auth.uid())
  );

create policy sections_select_public on public.magazine_sections
  for select using (
    exists (select 1 from public.courses c
            where c.id = magazine_sections.course_id
              and c.status = 'published'
              and c.magazine_slug is not null)
  );

create policy sections_write_own on public.magazine_sections
  for all using (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = magazine_sections.course_id and c.coordinator_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = magazine_sections.course_id and c.coordinator_id = auth.uid())
  );
