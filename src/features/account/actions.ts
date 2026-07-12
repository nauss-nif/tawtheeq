'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { z } from 'zod';

const profileSchema = z.object({
  full_name: z.string().min(3, 'الاسم الكامل مطلوب (3 أحرف على الأقل)'),
  phone: z
    .string()
    .regex(/^05\d{8}$/, 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام')
    .or(z.literal('')),
});

/** تعديل بيانات الحساب الشخصي (الاسم والجوال) — لأي مستخدم مسجّل */
export async function updateOwnProfileAction(_prev: unknown, formData: FormData) {
  const { userId } = await requireProfile();
  const parsed = profileSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone || null })
    .eq('id', userId); // سياسة RLS تسمح للمستخدم بتعديل ملفه

  if (error) return { error: 'تعذّر حفظ البيانات' };
  revalidatePath('/account');
  return { success: 'تم حفظ بياناتك' };
}

/** تغيير كلمة المرور الشخصية — يعمل عبر جلسة المستخدم نفسه (لا يحتاج مفتاحًا سريًا) */
export async function updateOwnPasswordAction(_prev: unknown, formData: FormData) {
  await requireProfile();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < 8) return { error: 'كلمة المرور 8 أحرف على الأقل' };
  if (password !== confirm) return { error: 'كلمتا المرور غير متطابقتين' };

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'تعذّر تغيير كلمة المرور' };
  return { success: 'تم تغيير كلمة المرور بنجاح' };
}
