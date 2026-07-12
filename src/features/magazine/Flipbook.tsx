'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { MagazineData } from './data';

/**
 * وضع Flipbook: تجربة تقليب صفحات باستخدام مكتبة page-flip (تُحمّل ديناميكيًا).
 * كل صورة صفحة، مع صفحة غلاف وصفحة ختامية.
 */
export function Flipbook({ data, onClose }: { data: MagazineData; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { course, cover, images } = data;

  useEffect(() => {
    let pageFlip: { destroy: () => void } | null = null;

    (async () => {
      const { PageFlip } = await import('page-flip');
      if (!containerRef.current) return;

      const pf = new PageFlip(containerRef.current, {
        width: 550,
        height: 733,
        size: 'stretch',
        minWidth: 315,
        maxWidth: 1000,
        minHeight: 400,
        maxHeight: 1350,
        showCover: true,
        mobileScrollSupport: true,
        // اتجاه RTL يتكفّل به CSS للصفحة عمومًا؛ page-flip يعمل بالترتيب المعطى
      });

      const pages = Array.from(containerRef.current.querySelectorAll<HTMLElement>('.flip-page'));
      pf.loadFromHTML(pages);
      pageFlip = pf;
    })();

    return () => pageFlip?.destroy();
  }, [course.id]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-primary-dark p-4">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-white hover:bg-white/25"
      >
        <X className="size-5" /> إغلاق
      </button>

      <div ref={containerRef} className="flipbook mx-auto">
        {/* صفحة الغلاف */}
        <div className="flip-page flex flex-col items-center justify-center bg-primary text-white" data-density="hard">
          {cover?.processed_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.processed_url} alt="" className="absolute inset-0 size-full object-cover opacity-60" />
          )}
          <div className="relative z-10 p-8 text-center">
            <h1 className="text-3xl font-semibold">{course.title}</h1>
          </div>
        </div>

        {/* صفحات الصور */}
        {images.map((m) => (
          <div key={m.id} className="flip-page flex flex-col items-center justify-center bg-surface p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.processed_url ?? m.thumbnail_url ?? ''} alt={m.caption ?? ''} className="max-h-[85%] max-w-full object-contain" />
            {m.caption && <p className="mt-3 text-center text-sm text-muted">{m.caption}</p>}
          </div>
        ))}

        {/* صفحة ختامية */}
        <div className="flip-page flex flex-col items-center justify-center bg-primary text-white" data-density="hard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-nauss.svg" alt="" className="h-14 brightness-0 invert" />
          <p className="mt-4 text-lg">إدارة عمليات التدريب</p>
        </div>
      </div>
    </div>
  );
}
