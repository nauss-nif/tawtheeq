'use client';

import { cn } from '@/lib/utils';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';

/** بطاقة قسم قابلة للطيّ — تُبقي الاستوديو بسيطًا رغم كثرة الخيارات */
export function Section({
  title,
  hint,
  icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-right transition-colors hover:bg-primary/[0.03]"
      >
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-semibold text-primary">{title}</span>
            {badge}
          </span>
          {hint && <span className="mt-0.5 block truncate text-sm text-muted">{hint}</span>}
        </span>
        <ChevronDown
          className={cn('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="border-t border-muted/15 px-5 py-5">{children}</div>}
    </section>
  );
}

/** شبكة خيارات — بطاقة لكل خيار مع وصف قصير */
export function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { id: T; label: string; description?: string; disabled?: boolean; note?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div
      className={cn('grid gap-2.5', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}
      role="radiogroup"
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.id)}
            className={cn(
              'group relative rounded-2xl border p-3.5 text-right transition-all',
              'disabled:cursor-not-allowed disabled:opacity-45',
              active
                ? 'border-primary bg-primary/[0.06] shadow-soft'
                : 'border-muted/25 hover:border-primary/40',
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                  active ? 'border-primary bg-primary' : 'border-muted/40',
                )}
              >
                {active && <Check className="size-3 text-white" strokeWidth={3} />}
              </span>
              <span className={cn('font-medium', active ? 'text-primary' : 'text-primary/80')}>
                {o.label}
              </span>
            </span>
            {o.description && (
              <span className="mt-1.5 block text-sm leading-relaxed text-muted">{o.description}</span>
            )}
            {o.note && <span className="mt-1 block text-xs text-state-warning">{o.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** أزرار اختيار مضغوطة في صفّ واحد */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm font-medium text-primary">{label}</span>}
      <div className="flex gap-1 rounded-2xl bg-background p-1" role="radiogroup">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              value === o.id ? 'bg-primary text-white shadow-soft' : 'text-muted hover:text-primary',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** منزلق بقيمة معروضة — يُستخدم لسرعة القراءة والحماس ومستوى الموسيقى */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-primary">{label}</label>
        <span className="text-sm tabular-nums text-muted">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-background accent-primary"
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** مفتاح تبديل بسيط */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow-soft transition-all',
            checked ? 'right-0.5' : 'right-5.5',
          )}
          style={{ right: checked ? 2 : 22 }}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-primary">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** شارة معلومة صغيرة */
export function Pill({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'primary' | 'warning' | 'danger' | 'success';
}) {
  const tones = {
    muted: 'bg-muted/15 text-muted',
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-state-warning/15 text-state-warning',
    danger: 'bg-state-danger/12 text-state-danger',
    success: 'bg-primary/10 text-primary',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  );
}
