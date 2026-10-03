import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { toArabicDigits } from '@/lib/text';

/** بطاقة إحصائية برقم كبير بلون الأخضر الأساسي (مدمجة على الجوال) */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tone?: 'primary' | 'info' | 'warning' | 'navy';
}) {
  const tones = {
    primary: 'bg-primary/8 text-primary',
    info: 'bg-state-info/10 text-state-info',
    warning: 'bg-state-warning/15 text-state-warning',
    navy: 'bg-chart-navy/10 text-chart-navy',
  };
  return (
    <Card className="flex items-center gap-3 p-4 sm:gap-4 sm:p-6">
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl sm:size-12', tones[tone])}>
        <Icon className="size-5 sm:size-6" />
      </div>
      <div className="min-w-0">
        <div className="stat-number text-2xl sm:text-3xl">
          {typeof value === 'number' ? toArabicDigits(value) : value}
        </div>
        <div className="text-sm text-muted">{label}</div>
        {sub && <div className="truncate text-xs text-muted/80">{sub}</div>}
      </div>
    </Card>
  );
}
