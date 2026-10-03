import { createClient } from '@/lib/supabase/server';
import type { Course, Media, Session } from '@/lib/database.types';
import { cleanSessionTitle, tidyArabicText } from '@/lib/text';

export interface MagazineCoordinator {
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
}

export interface MagazineData {
  course: Course;
  cover: Media | null;
  images: Media[];
  videos: Media[];
  sessions: Session[];
  coordinator: MagazineCoordinator | null; // مُعِدّ المجلة (صاحب الحساب)
  landmarkUrl: string | null; // صورة معلم المدينة (تلقائية)
}

/**
 * تحميل بيانات المجلة عبر slug (قراءة عامة).
 * نستخدم service client للقراءة العامة المُتحكَّم بها بدقة (منشورة فقط)،
 * ونستبعد الوسائط غير المكتملة المعالجة.
 */
export async function getMagazineBySlug(slug: string): Promise<MagazineData | null> {
  // قراءة عامة عبر RLS (سياسات القراءة العامة للمجلات المنشورة فقط)
  const supabase = createClient();

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('magazine_slug', slug)
    .eq('status', 'published')
    .single();

  if (!course) return null;

  const { data: media } = await supabase
    .from('media')
    .select('*')
    .eq('course_id', course.id)
    .eq('processing_status', 'done')
    .order('sort_order', { ascending: true });

  const all = media ?? [];
  const cover = all.find((m) => m.is_cover && m.type === 'image') ?? all.find((m) => m.type === 'image') ?? null;
  // نستبعد منخفضة الجودة من العرض الافتراضي (تبقى في التخزين)
  const images = all.filter((m) => m.type === 'image' && !m.is_low_quality);
  const videos = all.filter((m) => m.type === 'video');

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('course_id', course.id)
    .order('sort_order', { ascending: true });

  // مُعِدّ المجلة: المنسق صاحب الحساب المسؤول عن الدورة
  const { data: coord } = await supabase
    .from('profiles')
    .select('full_name, job_title, avatar_url')
    .eq('id', course.coordinator_id)
    .single();
  const coordinator = coord ? (coord as MagazineCoordinator) : null;

  // أوقفنا الجلب التلقائي لصور المعالم (كانت ويكيبيديا تعيد صورًا مجمّعة رديئة تُفسد التصميم).
  // نعتمد الآن على صورة غلاف الدورة المرفوعة + خلفية العلامة الأنيقة للجامعة.
  const landmarkUrl = null;

  // تنقية النصوص عند العرض: تصلح كل المجلات القائمة دون تعديل بياناتها المخزّنة
  const cleanCourse: Course = {
    ...course,
    title: tidyArabicText(course.title),
    description: tidyArabicText(course.description),
    welcome_text: tidyArabicText(course.welcome_text),
    location: tidyArabicText(course.location),
  };
  const cleanSessions = (sessions ?? []).map((s) => ({
    ...s,
    title: cleanSessionTitle(s.title),
    description: tidyArabicText(s.description),
  }));

  return { course: cleanCourse, cover, images, videos, sessions: cleanSessions, coordinator, landmarkUrl };
}
