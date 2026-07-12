'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_MODE_COOKIE } from '@/lib/session';

/** تبديل المدير بين وضع الإدارة ووضع الموظف */
export async function toggleAdminModeAction(target: 'admin' | 'employee') {
  cookies().set(ADMIN_MODE_COOKIE, target, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(target === 'employee' ? '/dashboard' : '/admin');
}
