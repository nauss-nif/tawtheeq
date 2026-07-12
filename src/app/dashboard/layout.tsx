import { redirect } from 'next/navigation';
import { requireProfile, isEmployeeMode } from '@/lib/session';
import { Sidebar, type NavItem } from '@/features/dashboard/Sidebar';
import { TopBar } from '@/features/dashboard/TopBar';

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: 'dashboard' },
  { href: '/dashboard/courses', label: 'دوراتي', icon: 'courses' },
];

/** تخطيط لوحة المنسق (يستخدمه المدير أيضًا في وضع الموظف) */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  const employeeMode = isEmployeeMode();

  // المدير في وضع الإدارة يذهب للوحة الإدارة؛ للوصول للوحة المنسق عليه تفعيل وضع الموظف
  if (profile.role === 'admin' && !employeeMode) redirect('/admin');

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar items={navItems} />
      <div className="flex flex-1 flex-col">
        <TopBar profile={profile} employeeMode={employeeMode} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
