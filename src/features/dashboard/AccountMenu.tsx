'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, UserCog, LogOut, Repeat } from 'lucide-react';
import { logoutAction } from '@/features/auth/actions';
import { toggleAdminModeAction } from './actions';
import type { Profile } from '@/lib/database.types';

/**
 * قائمة الحساب المنسدلة: اسم المستخدم يفتح قائمة بها «حسابي»،
 * وتبديل الدور (للمدير الذي يملك دورين)، و«تسجيل الخروج».
 */
export function AccountMenu({ profile, employeeMode }: { profile: Profile; employeeMode: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAdmin = profile.role === 'admin';

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/20"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-bold text-white">
          {profile.full_name.charAt(0)}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{profile.full_name}</span>
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl bg-surface p-1.5 text-right shadow-soft-md ring-1 ring-muted/15">
          {/* رأس القائمة */}
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-primary">{profile.full_name}</p>
            <p className="text-xs text-muted">
              {isAdmin ? (employeeMode ? 'وضع الموظف' : 'مدير النظام') : 'منسق'}
            </p>
          </div>
          <div className="my-1 h-px bg-muted/15" />

          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-primary transition hover:bg-primary/5"
          >
            <UserCog className="size-4 text-secondary" /> حسابي
          </Link>

          {/* تبديل الدور — للمدير فقط (يملك دور المدير ودور المنسق) */}
          {isAdmin && (
            <form action={toggleAdminModeAction.bind(null, employeeMode ? 'admin' : 'employee')}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-primary transition hover:bg-primary/5"
              >
                <Repeat className="size-4 text-secondary" />
                {employeeMode ? 'العودة لوضع المدير' : 'التبديل لوضع المنسق'}
              </button>
            </form>
          )}

          <div className="my-1 h-px bg-muted/15" />
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-state-danger transition hover:bg-state-danger/10"
            >
              <LogOut className="size-4" /> تسجيل الخروج
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
