'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { formatArabicDate } from '@/lib/utils';
import type { MagazineData } from './data';

/**
 * وضع Flipbook: تجربة تقليب صفحات احترافية باستخدام page-flip.
 * غلاف بالشعارين وصورة معلم المدينة، وصفحات صور بإطار أنيق مع النصوص أسفلها.
 */
export function Flipbook({ data, onClose }: { data: MagazineData; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { course, cover, images, landmarkUrl } = data;
  const coverBg = landmarkUrl ?? cover?.processed_url ?? null;

  useEffect(() => {
    let pageFlip: { destroy: () => void } | null = null;
    (async () => {
      const { PageFlip } = await import('page-flip');
      if (!containerRef.current) return;
      const pf = new PageFlip(containerRef.current, {
        width: 560,
        height: 760,
        size: 'stretch',
        minWidth: 300,
        maxWidth: 900,
        minHeight: 420,
        maxHeight: 1250,
        showCover: true,
        mobileScrollSupport: true,
        drawShadow: true,
        maxShadowOpacity: 0.5,
      });
      const pages = Array.from(containerRef.current.querySelectorAll<HTMLElement>('.flip-page'));
      pf.loadFromHTML(pages);
      pageFlip = pf;
    })();
    return () => pageFlip?.destroy();
  }, [course.id]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-primary-dark p-2 sm:p-4">
      <button
        onClick={onClose}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
      >
        <X className="size-5" /> إغلاق
      </button>

      <div ref={containerRef} className="flipbook mx-auto">
        {/* ===== الغلاف ===== */}
        <div className="flip-page relative overflow-hidden bg-primary" data-density="hard">
          {coverBg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverBg} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary/70 to-primary/30" />

          {/* شعارات على شريط أبيض */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-white/95 px-5 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-moi.png" alt="وزارة الداخلية" className="h-9 object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss.png" alt="جامعة نايف" className="h-9 object-contain" />
          </div>

          {/* العنوان */}
          <div className="absolute inset-x-0 bottom-0 p-7 text-white">
            <div className="mb-3 h-1.5 w-16 rounded-full bg-secondary" />
            <p className="mb-2 text-sm text-secondary">برامج الشراكات الدولية</p>
            <h1 className="text-3xl font-semibold leading-snug">{course.title}</h1>
            <div className="mt-3 space-y-0.5 text-sm text-white/85">
              {course.start_date && <p>{formatArabicDate(course.start_date)}</p>}
              {course.location && <p>{course.location}</p>}
            </div>
            <p className="mt-5 text-xs text-white/60">جامعة نايف العربية للعلوم الأمنية · إدارة عمليات التدريب</p>
          </div>
        </div>

        {/* ===== صفحات الصور ===== */}
        {images.map((m, i) => (
          <div key={m.id} className="flip-page flex flex-col bg-background">
            {/* ترويسة رفيعة */}
            <div className="flex items-center justify-between border-b border-secondary/30 bg-surface px-5 py-2.5">
              <span className="truncate text-xs font-medium text-primary">{course.title}</span>
              <span className="text-[10px] text-muted">{i + 1} / {images.length}</span>
            </div>
            {/* الصورة في إطار أنيق */}
            <div className="flex flex-1 items-center justify-center p-5">
              <div className="max-h-full overflow-hidden rounded-2xl border border-secondary/40 bg-surface p-1.5 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.processed_url ?? m.thumbnail_url ?? ''}
                  alt={m.caption ?? ''}
                  className="max-h-[560px] w-full rounded-xl object-contain"
                />
              </div>
            </div>
            {/* النص أسفل الصورة */}
            {m.caption && (
              <div className="px-6 pb-6 text-center">
                <div className="mx-auto mb-2 h-0.5 w-10 rounded-full bg-secondary" />
                <p className="text-sm leading-relaxed text-primary">{m.caption}</p>
              </div>
            )}
          </div>
        ))}

        {/* ===== الختام ===== */}
        <div className="flip-page flex flex-col items-center justify-center bg-primary p-8 text-center text-white" data-density="hard">
          <div className="mb-6 flex items-center gap-4 rounded-2xl bg-white px-5 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-moi.png" alt="" className="h-12 object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss.png" alt="" className="h-12 object-contain" />
          </div>
          <div className="mb-3 h-1 w-16 rounded-full bg-secondary" />
          <p className="text-lg font-semibold">إدارة عمليات التدريب</p>
          <p className="mt-1 text-sm text-white/70">جامعة نايف العربية للعلوم الأمنية</p>
          <p className="mt-0.5 text-xs text-white/50">برامج الشراكات الدولية — وزارة الداخلية</p>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-white/50">اسحب أو انقر حواف الصفحة للتقليب</p>
    </div>
  );
}
