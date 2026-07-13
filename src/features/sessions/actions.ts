'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { generateSessionText, isAiConfigured } from '@/lib/ai';
import { parseSchedule } from './parse';

/** لصق ذكي: يحلّل النص المنسوخ ويضيف الجلسات دفعة واحدة */
export async function importSessionsAction(courseId: string, text: string) {
  await requireProfile();
  const parsed = parseSchedule(text);
  if (parsed.length === 0) return { error: 'لم يتم التعرّف على جلسات في النص' };

  const supabase = createClient();
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId);
  const base = count ?? 0;

  const rows = parsed.map((p, i) => ({
    course_id: courseId,
    title: p.title,
    time_label: p.time_label,
    session_date: p.session_date,
    sort_order: base + i,
  }));

  const { error } = await supabase.from('sessions').insert(rows);
  if (error) return { error: 'تعذّر إضافة الجلسات' };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: `تمت إضافة ${parsed.length} جلسة`, count: parsed.length };
}

export async function addSessionAction(courseId: string, formData: FormData) {
  await requireProfile();
  const supabase = createClient();
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId);

  const { error } = await supabase.from('sessions').insert({
    course_id: courseId,
    title: String(formData.get('title') ?? '').trim(),
    presenter: String(formData.get('presenter') ?? '').trim() || null,
    session_date: String(formData.get('session_date') ?? '') || null,
    time_label: String(formData.get('time_label') ?? '').trim() || null,
    sort_order: count ?? 0,
  });
  if (error) return { error: 'تعذّر إضافة الجلسة' };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: 'تمت إضافة الجلسة' };
}

export async function updateSessionAction(sessionId: string, courseId: string, patch: {
  title?: string;
  presenter?: string | null;
  session_date?: string | null;
  time_label?: string | null;
  description?: string | null;
}) {
  await requireProfile();
  const supabase = createClient();
  const { error } = await supabase.from('sessions').update(patch).eq('id', sessionId);
  if (error) return { error: 'تعذّر حفظ الجلسة' };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: 'تم الحفظ' };
}

export async function deleteSessionAction(sessionId: string, courseId: string) {
  await requireProfile();
  const supabase = createClient();
  await supabase.from('sessions').delete().eq('id', sessionId);
  revalidatePath(`/dashboard/courses/${courseId}`);
}

/** توليد وصف احترافي للجلسة بالذكاء الاصطناعي وحفظه */
export async function generateSessionDescriptionAction(sessionId: string, courseId: string) {
  await requireProfile();
  if (!isAiConfigured()) return { error: 'ميزة الذكاء الاصطناعي غير مُفعّلة (يلزم إضافة المفتاح)' };

  const supabase = createClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('title, presenter')
    .eq('id', sessionId)
    .single();
  const { data: course } = await supabase
    .from('courses')
    .select('title')
    .eq('id', courseId)
    .single();
  if (!session || !course) return { error: 'بيانات غير مكتملة' };

  try {
    const text = await generateSessionText({
      courseTitle: course.title,
      sessionTitle: session.title,
      presenter: session.presenter,
    });
    await supabase.from('sessions').update({ description: text }).eq('id', sessionId);
    revalidatePath(`/dashboard/courses/${courseId}`);
    return { success: 'تم توليد الوصف', text };
  } catch {
    return { error: 'تعذّر توليد النص، حاول لاحقًا' };
  }
}
