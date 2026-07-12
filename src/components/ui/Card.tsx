import { cn } from '@/lib/utils';

/** بطاقة بيضاء بظل ناعم جدًا وزوايا مستديرة — أساس هوية الواجهة */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl bg-surface p-6 shadow-soft', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('heading-accent text-xl font-semibold text-primary', className)}
      {...props}
    />
  );
}
