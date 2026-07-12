import { publicEnv } from '@/lib/env';

export const BUCKET_PROCESSED = 'media-processed';
export const BUCKET_ORIGINAL = 'media-original';

/** رابط عام لملف في bucket المعالج (القراءة عامة) */
export function publicUrl(path: string): string {
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/${BUCKET_PROCESSED}/${path}`;
}

/** مسار تخزين موحّد: {course_id}/{media_id}-{variant}.ext */
export function mediaPath(courseId: string, mediaId: string, variant: string, ext: string) {
  return `${courseId}/${mediaId}-${variant}.${ext}`;
}
