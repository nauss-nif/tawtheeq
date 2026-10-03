-- ==========================================================================
-- «الاستوديو الذكي للبرومو» — AI Promo Studio
-- مخطط البيانات + RLS + دلو التخزين
-- ==========================================================================

-- --------------------------- أنواع مُعدّدة --------------------------------
create type promo_status       as enum ('draft','queued','analyzing','planning','narrating','voicing','rendering','ready','failed');
create type promo_orientation  as enum ('vertical','horizontal','both');
create type promo_style        as enum ('cinematic','institutional','dynamic','documentary','premium','modern');
create type promo_audio_mode   as enum ('music_voice','music_only','voice_only','silent');
create type promo_asset_kind   as enum ('logo','music','voiceover','broll','render','poster');
create type promo_job_type     as enum ('analyze','plan','narrate','voice','broll','render','qc','scene');
create type promo_job_status   as enum ('queued','running','done','failed','canceled');
create type promo_scene_status as enum ('planned','rendering','ready','failed');

-- --------------------------------------------------------------------------
-- promos: البرومو الواحد (إصدار واحد). الإصدارات السابقة تُحفظ كصفوف مستقلة
--         مرتبطة بـ parent_promo_id.
-- --------------------------------------------------------------------------
create table public.promos (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  created_by       uuid references public.profiles(id) on delete set null,
  parent_promo_id  uuid references public.promos(id) on delete set null,
  version          int  not null default 1,
  title            text not null default 'برومو',
  status           promo_status not null default 'draft',

  -- إعدادات المستخدم (المدة/الاتجاه/النمط/الصوت/الموسيقى/الشعارات)
  settings         jsonb not null default '{}'::jsonb,

  -- النصوص
  opening_text     text,
  closing_text     text,
  narration_text   text,
  narration_source text not null default 'user',   -- user | ai | ai_enhanced

  -- مخرجات المراحل
  analysis         jsonb not null default '{}'::jsonb,  -- ملخّص تحليل المواد
  storyboard       jsonb not null default '{}'::jsonb,  -- خطة القصة
  qc_report        jsonb not null default '{}'::jsonb,  -- تقرير ضبط الجودة
  outputs          jsonb not null default '{}'::jsonb,  -- { vertical: {...}, horizontal: {...} }

  -- تتبّع التقدّم
  progress         int  not null default 0,             -- 0..100
  stage_label      text,
  error            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index promos_course_idx on public.promos(course_id, created_at desc);
create index promos_status_idx on public.promos(status);
create index promos_parent_idx on public.promos(parent_promo_id);

-- --------------------------------------------------------------------------
-- promo_assets: كل ملف يخصّ البرومو (شعارات، موسيقى مرفوعة، تعليق صوتي،
--               مشاهد مولّدة، ملفات الإخراج النهائية)
-- --------------------------------------------------------------------------
create table public.promo_assets (
  id           uuid primary key default gen_random_uuid(),
  promo_id     uuid references public.promos(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  kind         promo_asset_kind not null,
  url          text,
  storage_path text,
  mime         text,
  file_size    bigint,
  duration     numeric,
  width        int,
  height       int,
  meta         jsonb not null default '{}'::jsonb,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index promo_assets_promo_idx  on public.promo_assets(promo_id, kind, sort_order);
create index promo_assets_course_idx on public.promo_assets(course_id, kind);

-- --------------------------------------------------------------------------
-- promo_scenes: المشاهد المنفصلة — تسمح بإعادة توليد مشهد واحد فقط
-- --------------------------------------------------------------------------
create table public.promo_scenes (
  id          uuid primary key default gen_random_uuid(),
  promo_id    uuid not null references public.promos(id) on delete cascade,
  scene_index int  not null,
  beat        text not null,                 -- opening | title | place | training | ...
  source_kind text not null default 'image', -- image | video | broll | card
  media_id    uuid references public.media(id) on delete set null,
  asset_id    uuid references public.promo_assets(id) on delete set null,
  duration    numeric not null default 3,
  motion      jsonb not null default '{}'::jsonb, -- الحركة ونقطة التركيز لكل اتجاه
  transition  jsonb not null default '{}'::jsonb,
  texts       jsonb not null default '[]'::jsonb, -- نصوص المشهد ومواضعها
  narration   text,                                -- الجزء المقابل من التعليق الصوتي
  status      promo_scene_status not null default 'planned',
  overrides   jsonb not null default '{}'::jsonb,  -- تعديلات المستخدم اليدوية
  preview_url text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index promo_scenes_order_idx on public.promo_scenes(promo_id, scene_index);

-- --------------------------------------------------------------------------
-- promo_jobs: طابور المهام الخلفية (تحليل/تخطيط/صوت/توليد/رندر/فحص)
-- --------------------------------------------------------------------------
create table public.promo_jobs (
  id           uuid primary key default gen_random_uuid(),
  promo_id     uuid not null references public.promos(id) on delete cascade,
  type         promo_job_type not null,
  status       promo_job_status not null default 'queued',
  payload      jsonb not null default '{}'::jsonb,
  result       jsonb not null default '{}'::jsonb,
  progress     int not null default 0,
  attempts     int not null default 0,
  max_attempts int not null default 3,
  error        text,
  locked_at    timestamptz,
  locked_by    text,
  run_after    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index promo_jobs_queue_idx on public.promo_jobs(status, run_after);
create index promo_jobs_promo_idx on public.promo_jobs(promo_id, created_at);

-- --------------------------------------------------------------------------
-- promo_pronunciations: قاموس النطق (على مستوى الدورة، أو عام إذا كان
--                       course_id فارغًا — يُدار من لوحة المدير)
-- --------------------------------------------------------------------------
create table public.promo_pronunciations (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid references public.courses(id) on delete cascade,
  term       text not null,
  phonetic   text not null,          -- النطق المكتوب كما يُقرأ
  ipa        text,                   -- اختياري لمزوّدي TTS الداعمين
  lang       text not null default 'ar',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index promo_pron_course_idx on public.promo_pronunciations(course_id);
create unique index promo_pron_term_idx
  on public.promo_pronunciations(coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid), term, lang);

-- --------------------------------------------------------------------------
-- media_analysis: نتائج تحليل المواد (قابلة لإعادة الاستخدام بين البروموهات)
-- --------------------------------------------------------------------------
create table public.media_analysis (
  media_id    uuid primary key references public.media(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  metrics     jsonb not null default '{}'::jsonb, -- حدّة/إضاءة/تباين/تكوين/حركة
  labels      jsonb not null default '[]'::jsonb, -- وسوم محتوى (رؤية LLM اختيارية)
  phash       text,                                -- بصمة إدراكية لكشف التكرار
  focus       jsonb not null default '{}'::jsonb, -- نقطة التركيز {x,y} لكل اتجاه
  score       numeric not null default 0,          -- 0..100 القيمة البصرية
  engine      text,
  analyzed_at timestamptz not null default now()
);

create index media_analysis_course_idx on public.media_analysis(course_id, score desc);

-- --------------------------- تحديث updated_at -----------------------------
create trigger promos_touch       before update on public.promos
  for each row execute function public.touch_updated_at();
create trigger promo_scenes_touch before update on public.promo_scenes
  for each row execute function public.touch_updated_at();
create trigger promo_jobs_touch   before update on public.promo_jobs
  for each row execute function public.touch_updated_at();

-- ==========================================================================
-- RLS
-- ==========================================================================
alter table public.promos               enable row level security;
alter table public.promo_assets         enable row level security;
alter table public.promo_scenes         enable row level security;
alter table public.promo_jobs           enable row level security;
alter table public.promo_pronunciations enable row level security;
alter table public.media_analysis       enable row level security;

-- دالة مساعدة: هل يملك المستخدم البرومو (عبر ملكية الدورة)؟
create or replace function public.owns_promo(p uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.promos pr
    join public.courses c on c.id = pr.course_id
    where pr.id = p
      and (c.coordinator_id = auth.uid() or public.is_admin())
  );
$$;

-- ------------------------------- promos -----------------------------------
create policy promos_rw_own on public.promos
  for all using (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = promos.course_id and c.coordinator_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = promos.course_id and c.coordinator_id = auth.uid())
  );

-- قراءة عامة للبروموهات الجاهزة ضمن دورة منشورة (لعرضها في المجلة)
create policy promos_select_public on public.promos
  for select using (
    status = 'ready'
    and exists (select 1 from public.courses c
                where c.id = promos.course_id
                  and c.status = 'published'
                  and c.magazine_slug is not null)
  );

-- ---------------------------- promo_assets --------------------------------
create policy promo_assets_rw_own on public.promo_assets
  for all using (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = promo_assets.course_id and c.coordinator_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = promo_assets.course_id and c.coordinator_id = auth.uid())
  );

create policy promo_assets_select_public on public.promo_assets
  for select using (
    exists (select 1 from public.courses c
            where c.id = promo_assets.course_id
              and c.status = 'published'
              and c.magazine_slug is not null)
  );

-- ---------------------------- promo_scenes --------------------------------
create policy promo_scenes_rw_own on public.promo_scenes
  for all using (public.owns_promo(promo_scenes.promo_id))
  with check (public.owns_promo(promo_scenes.promo_id));

-- ----------------------------- promo_jobs ---------------------------------
-- القراءة للمالك (لعرض التقدّم)؛ التنفيذ يتم عبر العامل الخلفي (service role)
create policy promo_jobs_select_own on public.promo_jobs
  for select using (public.owns_promo(promo_jobs.promo_id));

create policy promo_jobs_insert_own on public.promo_jobs
  for insert with check (public.owns_promo(promo_jobs.promo_id));

-- ------------------------ promo_pronunciations ----------------------------
create policy promo_pron_select on public.promo_pronunciations
  for select using (
    course_id is null
    or public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = promo_pronunciations.course_id and c.coordinator_id = auth.uid())
  );

create policy promo_pron_write on public.promo_pronunciations
  for all using (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = promo_pronunciations.course_id and c.coordinator_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = promo_pronunciations.course_id and c.coordinator_id = auth.uid())
  );

-- ---------------------------- media_analysis ------------------------------
create policy media_analysis_rw_own on public.media_analysis
  for all using (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = media_analysis.course_id and c.coordinator_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.courses c
               where c.id = media_analysis.course_id and c.coordinator_id = auth.uid())
  );

-- ==========================================================================
-- التخزين: دلو البرومو (قراءة عامة — الفيديوهات النهائية تُشارَك)
-- المسار الموحّد: {course_id}/{promo_id}/{kind}-{name}.ext
-- ==========================================================================
insert into storage.buckets (id, name, public)
values ('promo', 'promo', true)
on conflict (id) do nothing;

create policy "promo public read" on storage.objects
  for select using (bucket_id = 'promo');

create policy "promo write own course" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'promo'
    and public.is_active_coordinator( (split_part(name, '/', 1))::uuid )
  );

create policy "promo update own course" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'promo'
    and ( public.is_admin()
          or public.is_active_coordinator( (split_part(name, '/', 1))::uuid ) )
  );

create policy "promo delete own course" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'promo'
    and ( public.is_admin()
          or public.is_active_coordinator( (split_part(name, '/', 1))::uuid ) )
  );

-- ==========================================================================
-- سحب مهمة من الطابور بأمان (للعامل الخلفي — service role فقط)
-- ==========================================================================
create or replace function public.claim_promo_job(p_worker text)
returns public.promo_jobs
language plpgsql
security definer
set search_path = public
as $$
declare job public.promo_jobs;
begin
  select * into job
  from public.promo_jobs
  where status = 'queued' and run_after <= now()
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.promo_jobs
  set status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = p_worker
  where id = job.id
  returning * into job;

  return job;
end;
$$;

revoke execute on function public.claim_promo_job(text) from anon, authenticated;
