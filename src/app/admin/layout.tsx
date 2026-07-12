import { redirect } from 'next/navigation';
import { requireProfile, isEmployeeMode } from '@/lib/session';
import { Sidebar, type NavItem } from '@/features/dashboard/Sidebar';
import { TopBar } from '@/features/dashboard/TopBar';

const navItems: NavItem[] = [
  { href: '/admin', label: 'الإحصائيات', icon: 'stats' },
  { href: '/admin/users', label: 'المنسقون', icon: 'users' },
  { href: '/admin/courses', label: 'كل الدورات', icon: 'courses' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  // فقط المدير، وفي وضع الإدارة (لا وضع الموظف)
  if (profile.role !== 'admin') redirect('/dashboard');
  if (isEmployeeMode()) redirect('/dashboard');

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar items={navItems} />
      <div className="flex flex-1 flex-col">
        <TopBar profile={profile} employeeMode={false} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
