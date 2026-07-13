'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { formatArabicDate } from '@/lib/utils';
import type { MagazineData } from './data';

/**
 * وضع Flipbook: مجلة أفقية أنيقة. صورة واحدة كبيرة لكل صفحة (تناسب الصور الأفقية)،
 * شعارات شفافة في الترويسة، معلم المدينة كخلفية شفافة على كل الصفحات،
 * ترقيم ثابت أسفل الصفحة، وغلاف خلفي مرتّب. الشعارات قابلة للتحكم (الشراكات).
 */
export function Flipbook({ data, onClose }: { data: MagazineData; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { course, cover, images, landmarkUrl } = data;
  const coverBg = cover?.processed_url ?? landmarkUrl ?? null;
  const showMoi = course.show_partnership_logo;
  const watermark = landmarkUrl; // خلفية شفافة خفيفة لكل الصفحات

  useEffect(() => {
    let pageFlip: { destroy: () => void } | null = null;
    (async () => {
      const { PageFlip } = await import('page-flip');
      if (!containerRef.current) return;
      const pf = new PageFlip(containerRef.current, {
        width: 800,
        height: 560,
        size: 'stretch',
        minWidth: 320,
        maxWidth: 1000,
        minHeight: 300,
        maxHeight: 720,
        showCover: true,
        mobileScrollSupport: true,
        drawShadow: true,
        maxShadowOpacity: 0.4,
      });
      const pages = Array.from(containerRef.current.querySelectorAll<HTMLElement>('.flip-page'));
      pf.loadFromHTML(pages);
      pageFlip = pf;
    })();
    return () => pageFlip?.destroy();
  }, [course.id]);

  const interior: React.ReactNode[] = [];
  let pageNo = 0;

  // صفحة التعريف
  interior.push(
    <MagPage key="intro" title={course.title} pageNo={++pageNo} watermark={watermark} showMoi={showMoi}>
      <div className="flex h-full flex-col justify-center">
        <h2 className="text-xl font-semibold text-primary">عن الدورة</h2>
        <div className="mt-2 mb-3 h-1 w-14 rounded-full bg-secondary" />
        {course.description ? (
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-[#2a302d]">{course.description}</p>
        ) : (
          <p className="text-muted">دورة تدريبية ضمن برامج الشراكات الدولية.</p>
        )}
        {course.trainer_names.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-base font-semibold text-primary">المدربون</h3>
            <div className="flex flex-wrap gap-2">
              {course.trainer_names.map((n) => (
                <span key={n} className="rounded-lg border border-secondary/40 bg-white/70 px-3 py-1 text-[13px] text-primary">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </MagPage>,
  );

  // صورة واحدة أفقية كبيرة لكل صفحة
  images.forEach((m) => {
    interior.push(
      <MagPage key={m.id} title={course.title} pageNo={++pageNo} watermark={watermark} showMoi={showMoi}>
        <div className="flex h-full flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-xl border border-secondary/40 bg-white p-1.5 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.processed_url ?? m.thumbnail_url ?? ''}
                alt={m.caption ?? ''}
                className="max-h-[330px] w-auto max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
          {m.caption && (
            <div className="mt-2 shrink-0 text-center">
              <div className="mx-auto mb-1 h-0.5 w-10 rounded-full bg-secondary" />
              <p className="text-[13.5px] font-medium text-primary">{m.caption}</p>
            </div>
          )}
        </div>
      </MagPage>,
    );
  });

  // ضبط زوجي حتى ينغلق الغلاف الخلفي
  if ((interior.length + 2) % 2 !== 0) {
    interior.push(
      <div key="blank" className="flip-page magazine-pattern relative">
        <div className="absolute inset-y-0 right-0 w-1.5 bg-primary" />
      </div>,
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#0a3d35] p-2 sm:p-4">
      <button
        onClick={onClose}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
      >
        <X className="size-5" /> إغلاق
      </button>

      <div ref={containerRef} className="flipbook mx-auto">
        {/* ===== الغلاف الأمامي ===== */}
        <div className="flip-page relative overflow-hidden bg-primary" data-density="hard">
          {coverBg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverBg} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary/70 to-primary/25" />
          <div className="pointer-events-none absolute inset-4 rounded-lg border border-secondary/50" />

          {/* شعارات شفافة بيضاء في الأعلى مع فاصل شفاف */}
          <div className="absolute right-7 top-6 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss-white.png" alt="جامعة نايف" className="h-11 object-contain" />
            {showMoi && (
              <>
                <span className="h-9 w-px bg-white/30" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-moi-white.png" alt="وزارة الداخلية" className="h-11 object-contain" />
              </>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-8 text-white">
            <div className="mb-2.5 h-1.5 w-16 rounded-full bg-secondary" />
            <p className="mb-2 text-[13px] font-medium tracking-wide text-secondary">برامج الشراكات الدولية</p>
            <h1 className="max-w-[70%] text-[26px] font-semibold leading-snug drop-shadow-sm">{course.title}</h1>
            <div className="mt-3 flex gap-4 text-sm text-white/90">
              {course.start_date && <span>{formatArabicDate(course.start_date)}</span>}
              {course.location && <span>· {course.location}</span>}
            </div>
            <p className="mt-4 border-t border-white/20 pt-3 text-xs text-white/70">
              جامعة نايف العربية للعلوم الأمنية · إدارة عمليات التدريب
            </p>
          </div>
        </div>

        {/* ===== الصفحات الداخلية ===== */}
        {interior}

        {/* ===== الغلاف الخلفي ===== */}
        <div className="flip-page relative flex flex-col items-center justify-center overflow-hidden bg-primary text-center text-white" data-density="hard">
          {watermark && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={watermark} alt="" className="absolute inset-0 size-full object-cover opacity-15" />
          )}
          <div className="pointer-events-none absolute inset-4 rounded-lg border border-secondary/40" />
          {/* شعار الجامعة في منتصف الصفحة تمامًا */}
          <div className="relative flex flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss-white.png" alt="جامعة نايف" className="h-24 object-contain" />
          </div>
          {/* عبارة ثابتة في الأسفل بمحاذاة المنتصف */}
          <div className="relative mb-8 space-y-1">
            <div className="mx-auto mb-3 h-1 w-14 rounded-full bg-secondary" />
            <p className="text-base font-semibold">إدارة عمليات التدريب</p>
            <p className="text-sm text-white/80">وكالة الجامعة للتدريب</p>
            <p className="text-sm text-white/70">جامعة نايف العربية للعلوم الأمنية</p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-white/50">اسحب أو انقر حواف الصفحة للتقليب</p>
    </div>
  );
}

/** قالب صفحة داخلية أفقية: خلفية معلم شفافة + زخرفة + ترويسة بالشعارات + ترقيم ثابت */
function MagPage({
  title,
  pageNo,
  watermark,
  showMoi,
  children,
}: {
  title: string;
  pageNo: number;
  watermark: string | null;
  showMoi: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flip-page magazine-pattern relative flex flex-col overflow-hidden">
      {/* خلفية معلم المدينة شفافة جدًا على كل الصفحة */}
      {watermark && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={watermark} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.06]" />
      )}
      {/* شريط جانبي أخضر */}
      <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-primary to-primary-dark" />

      {/* الترويسة: العنوان يمينًا ثم الشعارات مع فاصل شفاف */}
      <div className="relative flex items-center justify-between px-6 pt-4">
        <span className="truncate text-xs font-semibold text-primary">{title}</span>
        <div className="flex shrink-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-nauss.png" alt="" className="h-7 object-contain" />
          {showMoi && (
            <>
              <span className="h-6 w-px bg-secondary/40" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-moi.png" alt="" className="h-7 object-contain" />
            </>
          )}
        </div>
      </div>
      <div className="relative mx-6 mt-2 h-px bg-gradient-to-l from-transparent via-secondary to-transparent opacity-60" />

      {/* المحتوى */}
      <div className="relative min-h-0 flex-1 px-7 py-3">{children}</div>

      {/* التذييل الثابت: رقم الصفحة يسارًا واسم البرنامج يمينًا */}
      <div className="relative mx-6 mb-3 flex items-center justify-between border-t border-secondary/25 pt-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{pageNo}</span>
        <span className="text-[10px] tracking-wide text-muted">برامج الشراكات الدولية</span>
      </div>
    </div>
  );
}
