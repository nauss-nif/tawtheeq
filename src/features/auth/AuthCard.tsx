import Link from 'next/link';
import { Images, BookOpenCheck, FileDown } from 'lucide-react';
import { STAR_PATH, STAR_VIEWBOX } from '@/features/magazine/brandStar';

const FEATURES = [
  { icon: Images, title: 'توثيق منظّم', text: 'صور كل دورة مرتّبة حسب محاورها' },
  { icon: BookOpenCheck, title: 'مجلة إلكترونية', text: 'موقع ومجلة متقلبة تُشارك برابط واحد' },
  { icon: FileDown, title: 'مخرجات جاهزة', text: 'ملف PDF ونسخة تعمل دون إنترنت' },
];

/** نجمة شعار الجامعة كعنصر زخرفي */
function Star({ className, color, opacity }: { className: string; color: string; opacity: number }) {
  return (
    <svg aria-hidden viewBox={STAR_VIEWBOX} className={`pointer-events-none absolute ${className}`}>
      <path d={STAR_PATH} fill={color} fillOpacity={opacity} fillRule="evenodd" />
    </svg>
  );
}

/**
 * غلاف صفحات المصادقة (الدخول، التسجيل، استعادة كلمة المرور):
 * لوحة هوية خضراء بشعار الجامعة واضحًا ونجمتها الكبيرة، وبطاقة النموذج على خلفية كريمية.
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
      {/* لوحة الهوية (الشاشات الكبيرة) */}
      <aside className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-dark p-12 text-white lg:flex xl:p-16">
        <Star className="-bottom-40 -left-40 size-[560px]" color="#B99C6B" opacity={0.16} />
        <Star className="-top-24 right-16 size-56" color="#ffffff" opacity={0.05} />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-nauss-white.png"
          alt="جامعة نايف العربية للعلوم الأمنية"
          className="relative h-24 w-auto self-start object-contain xl:h-28"
        />

        <div className="relative">
          <p className="mb-3 text-sm font-medium tracking-wide text-secondary">وكالة الجامعة للتدريب</p>
          <h2 className="text-4xl font-semibold leading-snug xl:text-[2.6rem]">منصة توثيق<br />الدورات التدريبية</h2>
          <div className="mt-5 h-1 w-20 rounded-full bg-secondary" />
          <ul className="mt-10 flex flex-col gap-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <f.icon className="size-5 text-secondary" />
                </span>
                <span>
                  <span className="block font-semibold">{f.title}</span>
                  <span className="text-sm text-white/70">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">إدارة عمليات التدريب · جامعة نايف العربية للعلوم الأمنية</p>
      </aside>

      {/* منطقة النموذج */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden p-5 sm:p-8">
        <Star className="-bottom-32 -right-32 size-96 lg:hidden" color="#B99C6B" opacity={0.1} />
        <div className="relative w-full max-w-md">
          {/* الشعار بالألوان (الجوال والشاشات الصغيرة) */}
          <div className="mb-8 flex justify-center lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss-deep.png" alt="جامعة نايف العربية للعلوم الأمنية" className="h-20 w-auto object-contain" />
          </div>

          <div className="rounded-3xl border border-secondary/20 bg-surface p-7 shadow-soft-md sm:p-9">
            <h1 className="heading-accent text-2xl font-semibold text-primary">{title}</h1>
            {subtitle && <p className="mt-3 text-sm leading-relaxed text-muted">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>

          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
          <p className="mt-8 text-center text-xs text-muted/80 lg:hidden">إدارة عمليات التدريب · جامعة نايف العربية للعلوم الأمنية</p>
        </div>
      </main>
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
