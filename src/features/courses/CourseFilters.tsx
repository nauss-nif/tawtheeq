import Link from 'next/link';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUSES = [
  { value: '', label: 'الكل' },
  { value: 'published', label: 'منشورة' },
  { value: 'draft', label: 'مسودة' },
];

/** شريط بحث وتصفية بالحالة لقوائم الدورات (نموذج GET بلا جافاسكربت) */
export function CourseFilters({ basePath, q, status }: { basePath: string; q?: string; status?: string }) {
  const href = (s: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (s) params.set('status', s);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <form action={basePath} className="relative min-w-[220px] flex-1">
        {status && <input type="hidden" name="status" value={status} />}
        <Search className="pointer-events-none absolute right-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="ابحث باسم الدورة…"
          className="h-11 w-full rounded-2xl border border-muted/30 bg-surface pr-11 pl-4 text-sm focus:border-primary"
        />
      </form>
      <div className="flex rounded-2xl bg-surface p-1 shadow-soft">
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={href(s.value)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              (status ?? '') === s.value ? 'bg-primary text-white' : 'text-muted hover:text-primary',
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
