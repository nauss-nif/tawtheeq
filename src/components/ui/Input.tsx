import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & FieldProps
>(({ className, label, error, hint, id, ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && (
      <label htmlFor={id} className="text-sm font-medium text-primary">
        {label}
      </label>
    )}
    <input
      ref={ref}
      id={id}
      className={cn(
        'h-11 rounded-2xl border bg-surface px-4 text-base transition-colors',
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
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
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
