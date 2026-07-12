import Link from 'next/link';
import { LogOut, Repeat, UserCog } from 'lucide-react';
import { logoutAction } from '@/features/auth/actions';
import { toggleAdminModeAction } from './actions';
import type { Profile } from '@/lib/database.types';

/**
 * الشريط العلوي: يعرض اسم المستخدم وزر الخروج.
 * للمدير: زر تبديل بين وضع الإدارة ووضع الموظف.
 */
export function TopBar({
  profile,
  employeeMode,
}: {
  profile: Profile;
  employeeMode: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-muted/15 bg-primary px-4 text-white md:px-6">
      <div className="flex items-center gap-3">
        <span className="font-semibold">
          {employeeMode ? 'وضع الموظف' : profile.role === 'admin' ? 'لوحة الإدارة' : 'لوحة المنسق'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-white/80 sm:inline">{profile.full_name}</span>

        <Link
          href="/account"
          className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-white/90 transition hover:bg-white/10"
        >
          <UserCog className="size-4" />
          <span className="hidden sm:inline">حسابي</span>
        </Link>

        {profile.role === 'admin' && (
          <form action={toggleAdminModeAction.bind(null, employeeMode ? 'admin' : 'employee')}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2 text-sm font-medium text-white transition hover:brightness-95"
            >
              <Repeat className="size-4" />
              {employeeMode ? 'العودة لوضع المدير' : 'التبديل لوضع الموظف'}
            </button>
          </form>
        )}

        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-white/90 transition hover:bg-white/10"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </form>
      </div>
    </header>
  );
}
