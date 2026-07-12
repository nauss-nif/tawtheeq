import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/database.types';

/** اسم الكوكي الذي يخزّن وضع المدير الحالي (admin | employee) */
export const ADMIN_MODE_COOKIE = 'tawtheeq_admin_mode';

/** يعيد المستخدم وملفه، أو يوجّه لتسجيل الدخول */
export async function requireProfile(): Promise<{ userId: string; profile: Profile }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/auth/login');
  if (profile.status === 'pending') redirect('/auth/pending');
  if (profile.status === 'disabled') redirect('/auth/login');

  return { userId: user.id, profile };
}

/** هل المدير حاليًا في "وضع الموظف"؟ (يُبدَّل عبر زر في الشريط العلوي) */
export function isEmployeeMode(): boolean {
  return cookies().get(ADMIN_MODE_COOKIE)?.value === 'employee';
}
