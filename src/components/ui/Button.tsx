import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  // الأزرار الرئيسية بالأخضر الأساسي
  primary: 'bg-primary text-white hover:bg-primary-dark shadow-soft',
  // الأزرار الثانوية بالذهبي
  secondary: 'bg-secondary text-white hover:brightness-95 shadow-soft',
  ghost: 'bg-transparent text-primary hover:bg-primary/5',
  danger: 'bg-state-danger text-white hover:brightness-95',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-base gap-2', // ارتفاع ≥ 44px لأهداف اللمس
  lg: 'h-12 px-7 text-lg gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-medium transition-all duration-200',
        'active:translate-y-px disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
