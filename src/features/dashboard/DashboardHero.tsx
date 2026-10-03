import { STAR_PATH, STAR_VIEWBOX } from '@/features/magazine/brandStar';
import { toArabicDigits } from '@/lib/text';

/** ترويسة لوحات المعلومات: بطاقة خضراء بنجمة الجامعة، عنوان وترحيب، وأزرار سريعة */
export function DashboardHero({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-primary to-primary-dark p-6 text-white shadow-soft-md sm:p-8">
      <svg aria-hidden viewBox={STAR_VIEWBOX} className="pointer-events-none absolute -bottom-28 -left-20 size-80">
        <path d={STAR_PATH} fill="#B99C6B" fillOpacity={0.2} fillRule="evenodd" />
      </svg>
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div>
          {kicker && <p className="mb-1 text-sm font-medium text-secondary">{kicker}</p>}
          <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}

/** عنوان قسم داخل لوحة المعلومات مع رابط اختياري */
export function SectionHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="heading-accent text-xl font-semibold text-primary">
        {title}
        {count !== undefined && (
          <span className="mr-2 rounded-full bg-primary/8 px-2.5 py-0.5 align-middle text-sm font-medium text-primary">
            {toArabicDigits(count)}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}
