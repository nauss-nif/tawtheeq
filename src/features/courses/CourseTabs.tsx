'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'details', label: '١. البيانات' },
  { id: 'sessions', label: '٢. الجلسات' },
  { id: 'media', label: '٣. الصور' },
  { id: 'magazine', label: '٤. النشر' },
  { id: 'promo', label: '٥. البرومو' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function CourseTabs({
  details,
  media,
  sessions,
  magazine,
  promo,
}: Record<'details' | 'media' | 'sessions' | 'magazine' | 'promo', React.ReactNode>) {
  const [active, setActive] = useState<TabId>('details');
  const content = { details, media, sessions, magazine, promo };

  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-2xl bg-surface p-1 shadow-soft">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={cn(
              'flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              active === t.id ? 'bg-primary text-white' : 'text-muted hover:text-primary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{content[active]}</div>
    </div>
  );
}
