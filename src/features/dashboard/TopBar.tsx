import { AccountMenu } from './AccountMenu';
import type { Profile } from '@/lib/database.types';

/**
 * الشريط العلوي: يعرض السياق الحالي وقائمة الحساب المنسدلة
 * (حسابي، تبديل الدور للمدير، تسجيل الخروج).
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

      <AccountMenu profile={profile} employeeMode={employeeMode} />
    </header>
  );
}
