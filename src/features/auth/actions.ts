'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isEmailAllowed, publicEnv } from '@/lib/env';
import { loginSchema, registerSchema, resetSchema } from '@/lib/validations';

export type ActionState = { error?: string; success?: string } | null;

/** تسجيل ذاتي للمنسق — يبقى الحساب pending حتى يعتمده المدير */
export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { email, password, full_name, phone } = parsed.data;

  // قيد نطاق البريد (قابل للتعطيل)
  if (!isEmailAllowed(email)) {
    return { error: 'التسجيل متاح فقط لبريد الجامعة (@nauss.edu.sa)' };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // ملف profiles يُنشأ تلقائيًا عبر trigger باستخدام هذه البيانات
      data: { full_name, phone },
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback`,
    },
  });

  if (error) {
    if (error.message.includes('already registered'))
      return { error: 'هذا البريد مسجّل مسبقًا' };
    return { error: 'تعذّر إنشاء الحساب، حاول لاحقًا' };
  }

  return { success: 'تم إنشاء حسابك بنجاح. حسابك بانتظار اعتماد المدير.' };
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'البريد أو كلمة المرور غير صحيحة' };

  // تحقّق من حالة الحساب
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', data.user.id)
    .single();

  if (!profile) return { error: 'تعذّر تحميل بيانات الحساب' };

  if (profile.status === 'pending') {
    await supabase.auth.signOut();
    return { error: 'حسابك بانتظار التفعيل من قبل المدير' };
  }
  if (profile.status === 'disabled') {
    await supabase.auth.signOut();
    return { error: 'تم تعطيل حسابك، تواصل مع الإدارة' };
  }

  redirect(profile.role === 'admin' ? '/admin' : '/dashboard');
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.siteUrl}/auth/update-password`,
  });
  // رسالة عامة (لا نكشف وجود البريد من عدمه)
  return { success: 'إن كان البريد مسجّلًا فستصلك رسالة لإعادة التعيين.' };
}

export async function logoutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/auth/login');
}
