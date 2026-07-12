'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';

export async function setCoverAction(courseId: string, mediaId: string) {
  await requireProfile();
  const supabase = createClient();
  // صورة غلاف واحدة فقط لكل دورة
  await supabase.from('media').update({ is_cover: false }).eq('course_id', courseId);
  await supabase.from('media').update({ is_cover: true }).eq('id', mediaId);
  revalidatePath(`/dashboard/courses/${courseId}`);
}

export async function updateCaptionAction(courseId: string, mediaId: string, caption: string) {
  await requireProfile();
  const supabase = createClient();
  await supabase.from('media').update({ caption: caption || null }).eq('id', mediaId);
  revalidatePath(`/dashboard/courses/${courseId}`);
}

export async function deleteMediaAction(courseId: string, mediaId: string) {
  await requireProfile();
  const supabase = createClient();
  await supabase.from('media').delete().eq('id', mediaId);
  revalidatePath(`/dashboard/courses/${courseId}`);
}

/** حفظ ترتيب جديد للوسائط بعد السحب */
export async function reorderMediaAction(courseId: string, orderedIds: string[]) {
  await requireProfile();
  const supabase = createClient();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('media').update({ sort_order: i }).eq('id', id),
    ),
  );
  revalidatePath(`/dashboard/courses/${courseId}`);
}
