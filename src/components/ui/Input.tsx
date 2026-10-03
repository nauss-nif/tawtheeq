'use client';

import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  /** أيقونة داخل الحقل في بدايته (يمين في RTL) */
  icon?: React.ReactNode;
}

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & FieldProps
>(({ className, label, error, hint, id, icon, ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && (
      <label htmlFor={id} className="text-sm font-medium text-primary">
        {label}
      </label>
    )}
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted [&>svg]:size-[18px]">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          'h-11 w-full rounded-2xl border bg-surface px-4 text-base transition-colors',
          'placeholder:text-muted/70 focus:border-primary',
          icon && 'pr-11',
          error ? 'border-state-danger' : 'border-muted/30',
          className,
        )}
        {...props}
      />
    </div>
    {error && <p className="text-sm text-state-danger">{error}</p>}
    {hint && !error && <p className="text-sm text-muted">{hint}</p>}
  </div>
));
Input.displayName = 'Input';

/** حقل كلمة مرور بزر إظهار/إخفاء */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & FieldProps
>(({ className, label, error, hint, id, icon, ...props }, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-primary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted [&>svg]:size-[18px]">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          className={cn(
            'h-11 w-full rounded-2xl border bg-surface px-4 pl-11 text-base transition-colors',
            'placeholder:text-muted/70 focus:border-primary',
            icon && 'pr-11',
            error ? 'border-state-danger' : 'border-muted/30',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          className="absolute inset-y-0 left-0 flex w-11 items-center justify-center rounded-2xl text-muted hover:text-primary"
        >
          {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      </div>
      {error && <p className="text-sm text-state-danger">{error}</p>}
      {hint && !error && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<FieldProps, 'icon'>
>(({ className, label, error, hint, id, ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && (
      <label htmlFor={id} className="text-sm font-medium text-primary">
        {label}
      </label>
    )}
    <textarea
      ref={ref}
      id={id}
      className={cn(
        'min-h-24 rounded-2xl border bg-surface px-4 py-3 text-base transition-colors',
        'placeholder:text-muted/70 focus:border-primary',
        error ? 'border-state-danger' : 'border-muted/30',
        className,
      )}
      {...props}
    />
    {error && <p className="text-sm text-state-danger">{error}</p>}
    {hint && !error && <p className="text-sm text-muted">{hint}</p>}
  </div>
));
Textarea.displayName = 'Textarea';
