'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  BarChart3,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof icons;
}

const icons = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  users: Users,
  stats: BarChart3,
};

/**
 * شريط جانبي (يمين، RTL) قابل للطي مع تمييز الصفحة النشطة بخلفية خضراء فاتحة وحد ذهبي.
 * يتحول في الجوال لشريط سفلي ثابت.
 */
export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && href !== '/admin' && pathname.startsWith(href));

  return (
    <>
      {/* سطح المكتب: شريط جانبي */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen flex-col border-l border-muted/15 bg-surface transition-all duration-300 md:flex',
          open ? 'w-64' : 'w-20',
        )}
      >
        <div className="flex items-center justify-between p-4">
          {open && (
            <div className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-nauss.png" alt="جامعة نايف العربية للعلوم الأمنية" className="h-9 w-auto object-contain" />
              <span className="text-sm font-semibold text-primary">منصة توثيق</span>
            </div>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl p-2 text-primary hover:bg-primary/5"
            aria-label="طيّ القائمة"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map((item) => {
            const Icon = icons[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-r-4 border-secondary bg-primary/8 text-primary'
                    : 'text-muted hover:bg-primary/5 hover:text-primary',
                )}
              >
                <Icon className="size-5 shrink-0" />
                {open && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* الجوال: شريط سفلي ثابت */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-muted/15 bg-surface/95 py-2 backdrop-blur md:hidden">
        {items.map((item) => {
          const Icon = icons[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs',
                active ? 'text-primary' : 'text-muted',
              )}
            >
              <Icon className={cn('size-5', active && 'text-secondary')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
