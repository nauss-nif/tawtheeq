'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { courseSchema } from '@/lib/validations';
import { generateSlug } from '@/lib/utils';

function parseForm(formData: FormData) {
  return courseSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    start_date: formData.get('start_date') ?? '',
    end_date: formData.get('end_date') ?? '',
    location: formData.get('location') ?? '',
    // أسماء المدربين حقول ديناميكية متعددة
    trainer_names: formData.getAll('trainer_names').map(String).filter(Boolean),
    template_id: formData.get('template_id') ?? 'classic',
    show_partnership_logo: formData.get('show_partnership_logo') === 'on',
  });
}

/** نص الترحيب الافتراضي (قابل للتعديل أو الحذف لاحقًا) */
function defaultWelcomeText(title: string, location: string | null): string {
  const city = location?.split(/[،,\-|/]/)[0].trim() || 'المدينة';
  return `تحت إشراف برامج الشراكات الدولية بوزارة الداخلية، يسعدنا في جامعة نايف العربية للعلوم الأمنية – وكالة التدريب الترحيب بكم في دورتكم التدريبية "${title}" بمدينة ${city}.`;
}

export async function createCourseAction(formData: FormData) {
  const { userId } = await requireProfile();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  const d = parsed.data;
  const { data, error } = await supabase
    .from('courses')
    .insert({
      coordinator_id: userId,
      title: d.title,
      description: d.description || null,
      start_date: d.start_date || null,
      end_date: d.end_date || null,
      location: d.location || null,
      trainer_names: d.trainer_names,
      template_id: d.template_id,
      show_partnership_logo: d.show_partnership_logo,
      welcome_text: defaultWelcomeText(d.title, d.location || null),
    })
    .select('id')
    .single();

  if (error) return { error: 'تعذّر إنشاء الدورة' };

  // جلستان افتراضيتان (الأكثر تصويرًا في كل دورة): الافتتاح والتخريج
  await supabase.from('sessions').insert([
    { course_id: data.id, title: 'الافتتاح والتسجيل', sort_order: 0 },
    { course_id: data.id, title: 'حفل التخريج والتقاط صورة جماعية', sort_order: 1 },
  ]);

  revalidatePath('/dashboard/courses');
  redirect(`/dashboard/courses/${data.id}`);
}

export async function updateCourseAction(courseId: string, formData: FormData) {
  await requireProfile();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  const d = parsed.data;
  const welcome = String(formData.get('welcome_text') ?? '').trim();
  const { error } = await supabase
    .from('courses')
    .update({
      title: d.title,
      description: d.description || null,
      start_date: d.start_date || null,
      end_date: d.end_date || null,
      location: d.location || null,
      trainer_names: d.trainer_names,
      template_id: d.template_id,
      show_partnership_logo: d.show_partnership_logo,
      welcome_text: welcome || null,
    })
    .eq('id', courseId); // RLS يضمن الملكية

  if (error) return { error: 'تعذّر حفظ التعديلات' };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: 'تم حفظ التعديلات' };
}

export async function deleteCourseAction(courseId: string) {
  await requireProfile();
  const supabase = createClient();
  await supabase.from('courses').delete().eq('id', courseId);
  revalidatePath('/dashboard/courses');
  redirect('/dashboard/courses');
}

/** نشر المجلة: يولّد slug فريدًا ويضبط الحالة published */
export async function publishCourseAction(courseId: string) {
  await requireProfile();
  const supabase = createClient();

  const { data: course } = await supabase
    .from('courses')
    .select('magazine_slug')
    .eq('id', courseId)
    .single();

  const slug = course?.magazine_slug ?? generateSlug(14);

  const { error } = await supabase
    .from('courses')
    .update({ status: 'published', magazine_slug: slug, published_at: new Date().toISOString() })
    .eq('id', courseId);

  if (error) return { error: 'تعذّر نشر المجلة' };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: 'تم نشر المجلة', slug };
}

export async function unpublishCourseAction(courseId: string) {
  await requireProfile();
  const supabase = createClient();
  await supabase.from('courses').update({ status: 'draft' }).eq('id', courseId);
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: 'تم إلغاء النشر' };
}
