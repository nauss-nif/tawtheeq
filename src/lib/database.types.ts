// أنواع قاعدة البيانات (مبسّطة يدويًا؛ يمكن توليدها لاحقًا عبر supabase gen types)

export type UserRole = 'admin' | 'coordinator';
export type UserStatus = 'pending' | 'active' | 'disabled';
export type CourseStatus = 'draft' | 'published' | 'archived';
export type MediaType = 'image' | 'video';
export type ProcessingStatus = 'pending' | 'processing' | 'done' | 'failed';
export type ArchiveStatus = 'pending' | 'archived' | 'failed';
export type SectionType = 'cover' | 'intro' | 'gallery' | 'video' | 'quotes' | 'closing';
export type TemplateId = 'classic' | 'modern' | 'celebratory';

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export type Course = {
  id: string;
  coordinator_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  trainer_names: string[];
  status: CourseStatus;
  magazine_slug: string | null;
  template_id: TemplateId;
  views_count: number;
  published_at: string | null;
  show_partnership_logo: boolean;
  welcome_text: string | null;
  created_at: string;
  updated_at: string;
}

export type Media = {
  id: string;
  course_id: string;
  type: MediaType;
  original_url: string | null;
  processed_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  processing_status: ProcessingStatus;
  archive_status: ArchiveStatus;
  file_size: number | null;
  original_size: number | null;
  compressed_size: number | null;
  duration: number | null;
  sharepoint_url: string | null;
  is_low_quality: boolean;
  session_id: string | null;
  /** أبعاد الصورة المعروضة (processed) بالبكسل */
  width: number | null;
  height: number | null;
  /** آخر إعدادات محرّر الصور (انظر ImageEditParams) */
  edit_params: Record<string, unknown> | null;
  created_at: string;
}

export type MagazineSection = {
  id: string;
  course_id: string;
  type: SectionType;
  content: Record<string, unknown>;
  sort_order: number;
  created_at: string;
}

// شكل متوافق مع GenericSchema الخاص بـ supabase-js
// (يجب توفير Tables/Views/Functions/Enums/CompositeTypes وإلا يعيد المُنشئ never)
type TableDef<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Session = {
  id: string;
  course_id: string;
  title: string;
  presenter: string | null;
  session_date: string | null;
  time_label: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
};

// --------------------------------------------------------------------------
// «الاستوديو الذكي للبرومو»
// --------------------------------------------------------------------------

export type PromoStatusDb =
  | 'draft' | 'queued' | 'analyzing' | 'planning'
  | 'narrating' | 'voicing' | 'rendering' | 'ready' | 'failed';
export type PromoAssetKindDb = 'logo' | 'music' | 'voiceover' | 'broll' | 'render' | 'poster';
export type PromoJobTypeDb = 'analyze' | 'plan' | 'narrate' | 'voice' | 'broll' | 'render' | 'qc' | 'scene';
export type PromoJobStatusDb = 'queued' | 'running' | 'done' | 'failed' | 'canceled';
export type PromoSceneStatusDb = 'planned' | 'rendering' | 'ready' | 'failed';
export type PromoLibraryKindDb = 'music' | 'logo';

// أعمدة jsonb غير مقيّدة النوع في قاعدة البيانات؛ الأنواع الحقيقية تُفرض
// في طبقة النطاق (src/lib/promo/types.ts) عند القراءة والكتابة.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export type Promo = {
  id: string;
  course_id: string;
  created_by: string | null;
  parent_promo_id: string | null;
  version: number;
  title: string;
  status: PromoStatusDb;
  settings: Json;
  opening_text: string | null;
  closing_text: string | null;
  narration_text: string | null;
  narration_source: string;
  analysis: Json;
  storyboard: Json;
  qc_report: Json;
  outputs: Json;
  progress: number;
  stage_label: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type PromoAsset = {
  id: string;
  promo_id: string | null;
  course_id: string;
  kind: PromoAssetKindDb;
  url: string | null;
  storage_path: string | null;
  mime: string | null;
  file_size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  meta: Json;
  sort_order: number;
  created_at: string;
};

export type PromoScene = {
  id: string;
  promo_id: string;
  scene_index: number;
  beat: string;
  source_kind: string;
  media_id: string | null;
  asset_id: string | null;
  duration: number;
  motion: Json;
  transition: Json;
  texts: Json;
  narration: string | null;
  status: PromoSceneStatusDb;
  overrides: Json;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PromoJob = {
  id: string;
  promo_id: string;
  type: PromoJobTypeDb;
  status: PromoJobStatusDb;
  payload: Json;
  result: Json;
  progress: number;
  attempts: number;
  max_attempts: number;
  error: string | null;
  locked_at: string | null;
  locked_by: string | null;
  run_after: string;
  created_at: string;
  updated_at: string;
};

export type PromoPronunciation = {
  id: string;
  course_id: string | null;
  term: string;
  phonetic: string;
  ipa: string | null;
  lang: string;
  created_by: string | null;
  created_at: string;
};

/** عنصر في مكتبة المنصة الثابتة (شعارات رسمية وموسيقى معتمدة) */
export type PromoLibrary = {
  id: string;
  kind: PromoLibraryKindDb;
  title: string;
  subtitle: string | null;
  url: string;
  storage_path: string;
  mime: string | null;
  file_size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  license: string | null;
  attribution: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaAnalysisRow = {
  media_id: string;
  course_id: string;
  metrics: Json;
  labels: unknown;
  phash: string | null;
  focus: Json;
  score: number;
  engine: string | null;
  analyzed_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile, Partial<Profile> & { id: string; full_name: string }>;
      courses: TableDef<Course, Partial<Course> & { coordinator_id: string; title: string }>;
      media: TableDef<Media, Partial<Media> & { course_id: string; type: MediaType }>;
      magazine_sections: TableDef<MagazineSection, Partial<MagazineSection> & { course_id: string; type: SectionType }>;
      sessions: TableDef<Session, Partial<Session> & { course_id: string; title: string }>;
      promos: TableDef<Promo, Partial<Promo> & { course_id: string }>;
      promo_assets: TableDef<PromoAsset, Partial<PromoAsset> & { course_id: string; kind: PromoAssetKindDb }>;
      promo_scenes: TableDef<PromoScene, Partial<PromoScene> & { promo_id: string; scene_index: number; beat: string }>;
      promo_jobs: TableDef<PromoJob, Partial<PromoJob> & { promo_id: string; type: PromoJobTypeDb }>;
      promo_pronunciations: TableDef<PromoPronunciation, Partial<PromoPronunciation> & { term: string; phonetic: string }>;
      media_analysis: TableDef<MediaAnalysisRow, Partial<MediaAnalysisRow> & { media_id: string; course_id: string }>;
      promo_library: TableDef<PromoLibrary, Partial<PromoLibrary> & { kind: PromoLibraryKindDb; title: string; url: string; storage_path: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      increment_magazine_views: { Args: { p_slug: string }; Returns: undefined };
      admin_stats: { Args: Record<string, never>; Returns: unknown };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      owns_promo: { Args: { p: string }; Returns: boolean };
      promo_path_course: { Args: { p: string }; Returns: string | null };
      claim_promo_job: { Args: { p_worker: string }; Returns: PromoJob | null };
    };
    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      course_status: CourseStatus;
      media_type: MediaType;
      processing_status: ProcessingStatus;
      archive_status: ArchiveStatus;
      section_type: SectionType;
      promo_status: PromoStatusDb;
      promo_asset_kind: PromoAssetKindDb;
      promo_job_type: PromoJobTypeDb;
      promo_job_status: PromoJobStatusDb;
      promo_scene_status: PromoSceneStatusDb;
      promo_library_kind: PromoLibraryKindDb;
    };
    CompositeTypes: Record<string, never>;
  };
}
