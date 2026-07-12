import { createClient } from '@/lib/supabase/server';
import type { Course, Media } from '@/lib/database.types';

export interface MagazineData {
  course: Course;
  cover: Media | null;
  images: Media[];
  videos: Media[];
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

  return { course, cover, images, videos };
}
