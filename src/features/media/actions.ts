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

/** ربط صورة بجلسة معيّنة (أو فكّ الربط عند تمرير null) */
export async function assignMediaSessionAction(
  courseId: string,
  mediaId: string,
  sessionId: string | null,
) {
  await requireProfile();
  const supabase = createClient();
  await supabase.from('media').update({ session_id: sessionId }).eq('id', mediaId);
  revalidatePath(`/dashboard/courses/${courseId}`);
}

/** جعل صورة هي الرئيسية لمحورها (تُعرض مع العنوان والنص) عبر تبديل ترتيبها مع أول صورة في المحور */
export async function makeSessionMainAction(courseId: string, mediaId: string) {
  await requireProfile();
  const supabase = createClient();
  const { data: me } = await supabase.from('media').select('session_id, sort_order').eq('id', mediaId).single();
  if (!me?.session_id) return { error: 'اربط الصورة بمحور أولًا' };

  const { data: sib } = await supabase
    .from('media')
    .select('id, sort_order')
    .eq('session_id', me.session_id)
    .order('sort_order', { ascending: true });
  const first = (sib ?? [])[0];
  if (!first || first.id === mediaId) return { success: 'هذه الصورة رئيسية بالفعل' };

  // تبديل الترتيب مع الصورة الأولى الحالية
  await supabase.from('media').update({ sort_order: first.sort_order }).eq('id', mediaId);
  await supabase.from('media').update({ sort_order: me.sort_order }).eq('id', first.id);
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: 'تم تعيينها كصورة رئيسية' };
}

/** ربط تلقائي ذكي: يوزّع الصور غير المرتبطة على الجلسات بالتساوي حسب الترتيب */
export async function autoAssignMediaAction(courseId: string) {
  await requireProfile();
  const supabase = createClient();
  const [{ data: media }, { data: sessions }] = await Promise.all([
    supabase.from('media').select('id, type, is_low_quality').eq('course_id', courseId).order('sort_order', { ascending: true }),
    supabase.from('sessions').select('id').eq('course_id', courseId).order('sort_order', { ascending: true }),
  ]);
  const imgs = (media ?? []).filter((m) => m.type === 'image' && !m.is_low_quality);
  const sess = sessions ?? [];
  if (imgs.length === 0 || sess.length === 0) return { error: 'يلزم وجود صور وجلسات أولًا' };

  // توزيع متوازن: نقسم الصور على عدد الجلسات بالتسلسل
  const per = Math.ceil(imgs.length / sess.length);
  await Promise.all(
    imgs.map((m, i) => {
      const sIdx = Math.min(Math.floor(i / per), sess.length - 1);
      return supabase.from('media').update({ session_id: sess[sIdx].id }).eq('id', m.id);
    }),
  );
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: `تم توزيع ${imgs.length} صورة على ${sess.length} جلسة` };
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
