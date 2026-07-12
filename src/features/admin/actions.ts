'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/** يتحقق أن المستدعي مدير مفعّل، وإلا يرمي */
async function assertAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('غير مصرّح');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' || profile.status !== 'active') throw new Error('غير مصرّح');
}

export async function approveCoordinatorAction(profileId: string) {
  await assertAdmin();
  // المدير يعدّل حالة أي ملف عبر RLS (سياسة profiles_update_admin) — لا حاجة للمفتاح السرّي
  const supabase = createClient();
  await supabase.from('profiles').update({ status: 'active' }).eq('id', profileId);
  revalidatePath('/admin');
}

export async function rejectCoordinatorAction(profileId: string) {
  await assertAdmin();
  // الرفض: حذف حساب المصادقة يتطلب المفتاح السرّي؛ إن لم يتوفّر نكتفي بتعطيل الحساب
  const supabase = createClient();
  await supabase.from('profiles').update({ status: 'disabled' }).eq('id', profileId);
  try {
    const svc = createServiceClient();
    await svc.auth.admin.deleteUser(profileId);
    await svc.from('profiles').delete().eq('id', profileId);
  } catch {
    // المفتاح السرّي غير مُعدّ — يبقى الحساب معطّلًا فقط
  }
  revalidatePath('/admin');
}

export async function setCoordinatorStatusAction(profileId: string, status: 'active' | 'disabled') {
  await assertAdmin();
  const supabase = createClient();
  await supabase.from('profiles').update({ status }).eq('id', profileId);
  revalidatePath('/admin');
}

/** تعديل بيانات منسق (الاسم والجوال) — المدير عبر RLS، لا يحتاج مفتاحًا سريًا */
export async function updateCoordinatorProfileAction(
  profileId: string,
  fullName: string,
  phone: string,
) {
  await assertAdmin();
  if (fullName.trim().length < 3) return { error: 'الاسم قصير جدًا' };
  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName.trim(), phone: phone.trim() || null })
    .eq('id', profileId);
  if (error) return { error: 'تعذّر حفظ البيانات' };
  revalidatePath('/admin/users');
  return { success: 'تم حفظ بيانات المنسق' };
}

export async function resetCoordinatorPasswordAction(profileId: string, newPassword: string) {
  await assertAdmin();
  if (newPassword.length < 8) return { error: 'كلمة المرور 8 أحرف على الأقل' };
  const svc = createServiceClient();
  const { error } = await svc.auth.admin.updateUserById(profileId, { password: newPassword });
  if (error) return { error: 'تعذّر إعادة التعيين' };
  return { success: 'تم تحديث كلمة المرور' };
}
