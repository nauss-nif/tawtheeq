import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/** بطاقة إحصائية برقم كبير بلون الأخضر الأساسي */
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
    <Card className="flex items-center gap-4">
      <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl', tones[tone])}>
        <Icon className="size-6" />
      </div>
      <div className="min-w-0">
        <div className="stat-number text-3xl">
          {typeof value === 'number' ? value.toLocaleString('ar') : value}
        </div>
        <div className="text-sm text-muted">{label}</div>
        {sub && <div className="text-xs text-muted/80">{sub}</div>}
      </div>
    </Card>
  );
}
