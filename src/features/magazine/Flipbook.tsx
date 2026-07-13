'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { formatArabicDate } from '@/lib/utils';
import type { MagazineData } from './data';

/**
 * وضع Flipbook: مجلة حقيقية بصفحات مزخرفة راقية، ترقيم، ترويسة بعنوان الدورة،
 * شعارات كبيرة أنيقة، وصورة واحدة لكل صفحة (بلا تجاوز للحدود).
 * عدد الصفحات يُضبط زوجيًا حتى ينغلق الغلاف الخلفي كمجلة فعلية.
 */
export function Flipbook({ data, onClose }: { data: MagazineData; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { course, cover, images, landmarkUrl } = data;
  const coverBg = cover?.processed_url ?? landmarkUrl ?? null;

  useEffect(() => {
    let pageFlip: { destroy: () => void } | null = null;
    (async () => {
      const { PageFlip } = await import('page-flip');
      if (!containerRef.current) return;
      const pf = new PageFlip(containerRef.current, {
        width: 545,
        height: 760,
        size: 'stretch',
        minWidth: 300,
        maxWidth: 850,
        minHeight: 420,
        maxHeight: 1200,
        showCover: true,
        mobileScrollSupport: true,
        drawShadow: true,
        maxShadowOpacity: 0.4,
        useMouseEvents: true,
      });
      const pages = Array.from(containerRef.current.querySelectorAll<HTMLElement>('.flip-page'));
      pf.loadFromHTML(pages);
      pageFlip = pf;
    })();
    return () => pageFlip?.destroy();
  }, [course.id]);

  // بناء الصفحات الداخلية
  const interior: React.ReactNode[] = [];
  let pageNo = 0;

  // صفحة التعريف
  interior.push(
    <MagPage key="intro" title={course.title} pageNo={++pageNo}>
      <div className="flex h-full flex-col justify-center">
        <h2 className="text-2xl font-semibold text-primary">عن الدورة</h2>
        <div className="mt-2 mb-4 h-1 w-16 rounded-full bg-secondary" />
        {course.description ? (
          <p className="whitespace-pre-line text-[15px] leading-loose text-[#2a302d]">
            {course.description}
          </p>
        ) : (
          <p className="text-muted">دورة تدريبية ضمن برامج الشراكات الدولية.</p>
        )}
        {course.trainer_names.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 text-lg font-semibold text-primary">المدربون</h3>
            <div className="flex flex-wrap gap-2">
              {course.trainer_names.map((n) => (
                <span key={n} className="rounded-xl border border-secondary/40 bg-white px-3 py-1.5 text-sm text-primary">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </MagPage>,
  );

  // صورة واحدة لكل صفحة (تُعرض كاملة بلا تجاوز)
  images.forEach((m) => {
    interior.push(
      <MagPage key={m.id} title={course.title} pageNo={++pageNo}>
        <div className="flex h-full flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-2xl border border-secondary/40 bg-white p-2 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.processed_url ?? m.thumbnail_url ?? ''}
                alt={m.caption ?? ''}
                className="max-h-[560px] w-auto max-w-full rounded-xl object-contain"
              />
            </div>
          </div>
          {m.caption && (
            <div className="mt-4 shrink-0 text-center">
              <div className="mx-auto mb-2 h-0.5 w-12 rounded-full bg-secondary" />
              <p className="text-[15px] font-medium text-primary">{m.caption}</p>
            </div>
          )}
        </div>
      </MagPage>,
    );
  });

  // ضبط عدد الصفحات زوجيًا (الغلاف + الخلفي فرديان) حتى ينغلق الكتاب
  // المجموع = 1 (غلاف) + interior + 1 (خلفي). نريده زوجيًا.
  if ((interior.length + 2) % 2 !== 0) {
    interior.push(
      <div key="blank" className="flip-page magazine-pattern corner-ornament relative">
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
          <div className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary/75 to-primary/20" />
          <div className="pointer-events-none absolute inset-5 rounded-lg border-2 border-secondary/50" />

          {/* شعارات كبيرة على شريط أبيض */}
          <div className="absolute inset-x-5 top-5 flex items-center justify-between gap-3 rounded-xl bg-white/95 px-6 py-4 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-moi.png" alt="وزارة الداخلية" className="h-12 object-contain" />
            <span className="h-10 w-px bg-muted/25" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss.png" alt="جامعة نايف" className="h-12 object-contain" />
          </div>

          <div className="absolute inset-x-0 bottom-0 p-9 text-white">
            <div className="mb-3 h-1.5 w-20 rounded-full bg-secondary" />
            <p className="mb-3 text-sm font-medium tracking-wide text-secondary">برامج الشراكات الدولية</p>
            <h1 className="text-[28px] font-semibold leading-snug drop-shadow-sm">{course.title}</h1>
            <div className="mt-4 space-y-1 text-sm text-white/90">
              {course.start_date && <p>{formatArabicDate(course.start_date)}</p>}
              {course.location && <p>{course.location}</p>}
            </div>
            <p className="mt-6 border-t border-white/20 pt-4 text-xs text-white/70">
              جامعة نايف العربية للعلوم الأمنية · إدارة عمليات التدريب
            </p>
          </div>
        </div>

        {/* ===== الصفحات الداخلية ===== */}
        {interior}

        {/* ===== الغلاف الخلفي ===== */}
        <div className="flip-page relative flex flex-col items-center justify-center overflow-hidden bg-primary p-8 text-center text-white" data-density="hard">
          <div className="pointer-events-none absolute inset-5 rounded-lg border-2 border-secondary/40" />
          <div className="mb-7 flex items-center gap-5 rounded-2xl bg-white px-7 py-5 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-moi.png" alt="" className="h-14 object-contain" />
            <span className="h-12 w-px bg-muted/25" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss.png" alt="" className="h-14 object-contain" />
          </div>
          <div className="mb-4 h-1 w-16 rounded-full bg-secondary" />
          <p className="text-xl font-semibold">إدارة عمليات التدريب</p>
          <p className="mt-2 text-sm text-white/75">جامعة نايف العربية للعلوم الأمنية</p>
          <p className="mt-1 text-xs text-white/55">برامج الشراكات الدولية — وزارة الداخلية</p>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-white/50">اسحب أو انقر حواف الصفحة للتقليب</p>
    </div>
  );
}

/** قالب صفحة مجلة داخلية: خلفية مزخرفة راقية + ترويسة بعنوان الدورة + ترقيم أنيق */
function MagPage({
  title,
  pageNo,
  children,
}: {
  title: string;
  pageNo: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flip-page magazine-pattern corner-ornament relative flex flex-col overflow-hidden">
      {/* شريط جانبي أخضر رفيع */}
      <div className="absolute inset-y-0 right-0 w-2 bg-gradient-to-b from-primary to-primary-dark" />

      {/* الترويسة */}
      <div className="flex items-center justify-between px-7 pt-6">
        <span className="truncate text-[13px] font-semibold text-primary">{title}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-nauss.png" alt="" className="h-8 object-contain opacity-90" />
      </div>
      <div className="mx-7 mt-2.5 h-px bg-gradient-to-l from-transparent via-secondary to-transparent opacity-70" />

      {/* المحتوى */}
      <div className="min-h-0 flex-1 px-7 py-5">{children}</div>

      {/* التذييل */}
      <div className="mx-7 mb-4 flex items-center justify-between border-t border-secondary/25 pt-2.5">
        <span className="text-[10px] tracking-wide text-muted">برامج الشراكات الدولية</span>
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
          {pageNo}
        </span>
      </div>
    </div>
  );
}
