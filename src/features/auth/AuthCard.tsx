import Image from 'next/image';
import Link from 'next/link';

/**
 * غلاف صفحات المصادقة: يحاكي أغلفة إصدارات الجامعة
 * (كتلة خضراء جانبية + مساحة كريمية للنموذج).
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* الكتلة الخضراء الجانبية (تظهر على الشاشات الكبيرة) */}
      <div className="relative hidden w-2/5 flex-col justify-between bg-primary p-12 text-white lg:flex">
        <Image src="/logo-nauss.svg" alt="شعار الجامعة" width={160} height={48} className="brightness-0 invert" />
        <div>
          <h2 className="text-3xl font-semibold leading-relaxed">منصة توثيق الدورات التدريبية</h2>
          <div className="mt-3 h-1 w-20 rounded-full bg-secondary" />
          <p className="mt-4 text-white/80">
            وثّق دوراتك، وأنتج مجلة إلكترونية أنيقة تُشارك مع المتدربين برابط واحد.
          </p>
        </div>
        <p className="text-sm text-white/60">إدارة عمليات التدريب</p>
      </div>

      {/* منطقة النموذج */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Image src="/logo-nauss.svg" alt="شعار الجامعة" width={140} height={42} />
          </div>
          <h1 className="heading-accent text-2xl font-semibold text-primary">{title}</h1>
          {subtitle && <p className="mt-3 text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-state-info hover:underline">
      {children}
    </Link>
  );
}
