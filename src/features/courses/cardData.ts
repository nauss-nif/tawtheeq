import type { SupabaseClient } from '@supabase/supabase-js';
import type { Course, Database } from '@/lib/database.types';

export interface CourseCardInfo {
  coverUrl: string | null;
  imageCount: number;
}

/**
 * بيانات بطاقات المجلات: صورة الغلاف (المحددة غلافًا، وإلا أول صورة) وعدد الصور لكل دورة،
 * باستعلام واحد على الوسائط.
 */
export async function loadCourseCards(
  supabase: SupabaseClient<Database>,
  courses: Pick<Course, 'id'>[],
): Promise<Map<string, CourseCardInfo>> {
  const out = new Map<string, CourseCardInfo>();
  for (const c of courses) out.set(c.id, { coverUrl: null, imageCount: 0 });
  if (courses.length === 0) return out;

  const { data } = await supabase
    .from('media')
    .select('course_id, thumbnail_url, processed_url, is_cover, sort_order')
    .in('course_id', courses.map((c) => c.id))
    .eq('type', 'image')
    .order('sort_order', { ascending: true });

  const firstImage = new Map<string, string | null>();
  for (const m of data ?? []) {
    const info = out.get(m.course_id);
    if (!info) continue;
    info.imageCount += 1;
    const url = m.thumbnail_url ?? m.processed_url;
    if (m.is_cover && url) info.coverUrl = url;
    if (!firstImage.has(m.course_id)) firstImage.set(m.course_id, url);
  }
  for (const [id, info] of out) if (!info.coverUrl) info.coverUrl = firstImage.get(id) ?? null;
  return out;
}
