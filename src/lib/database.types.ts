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

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile, Partial<Profile> & { id: string; full_name: string }>;
      courses: TableDef<Course, Partial<Course> & { coordinator_id: string; title: string }>;
      media: TableDef<Media, Partial<Media> & { course_id: string; type: MediaType }>;
      magazine_sections: TableDef<MagazineSection, Partial<MagazineSection> & { course_id: string; type: SectionType }>;
      sessions: TableDef<Session, Partial<Session> & { course_id: string; title: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      increment_magazine_views: { Args: { p_slug: string }; Returns: undefined };
      admin_stats: { Args: Record<string, never>; Returns: unknown };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      course_status: CourseStatus;
      media_type: MediaType;
      processing_status: ProcessingStatus;
      archive_status: ArchiveStatus;
      section_type: SectionType;
    };
    CompositeTypes: Record<string, never>;
  };
}
