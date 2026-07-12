import { cn } from '@/lib/utils';
import type {
  CourseStatus,
  ProcessingStatus,
  ArchiveStatus,
  UserStatus,
} from '@/lib/database.types';

/** شارات الحالات بألوان الهوية الفرعية */
const map: Record<string, { label: string; className: string }> = {
  // حالة الدورة
  draft: { label: 'مسودة', className: 'bg-muted/15 text-muted' },
  published: { label: 'منشورة', className: 'bg-primary/10 text-primary' },
  archived: { label: 'مؤرشفة', className: 'bg-chart-navy/10 text-chart-navy' },
  // حالة المعالجة
  pending: { label: 'بالانتظار', className: 'bg-muted/15 text-muted' },
  processing: { label: 'قيد المعالجة', className: 'bg-state-warning/15 text-state-warning' },
  done: { label: 'مكتملة', className: 'bg-primary/10 text-primary' },
  failed: { label: 'فشلت', className: 'bg-state-danger/12 text-state-danger' },
  // حالة الأرشفة
  archived_ok: { label: 'مؤرشف', className: 'bg-primary/10 text-primary' },
  // حالة الحساب
  active: { label: 'مفعّل', className: 'bg-primary/10 text-primary' },
  disabled: { label: 'معطّل', className: 'bg-state-danger/12 text-state-danger' },
};

export function StatusBadge({
  status,
  className,
}: {
  status: CourseStatus | ProcessingStatus | ArchiveStatus | UserStatus | string;
  className?: string;
}) {
  const item = map[status] ?? { label: status, className: 'bg-muted/15 text-muted' };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        item.className,
        className,
      )}
    >
      {item.label}
    </span>
  );
}
