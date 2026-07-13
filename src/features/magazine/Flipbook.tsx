'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { formatArabicDate } from '@/lib/utils';
import type { Media } from '@/lib/database.types';
import type { MagazineData } from './data';

/**
 * وضع Flipbook: تجربة مجلة حقيقية بصفحات مزخرفة، ترقيم، ترويسة بعنوان الدورة،
 * شعارات أنيقة، وفواصل ذهبية بين الصور. الشعارات والغلاف بهوية الجامعة.
 */
export function Flipbook({ data, onClose }: { data: MagazineData; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { course, cover, images, landmarkUrl } = data;
  const coverBg = landmarkUrl ?? cover?.processed_url ?? null;

  // نجمّع الصور صفحتين × صورة لكل صفحة داخلية (فاصل واضح بينها)
  const pairs: Media[][] = [];
  for (let i = 0; i < images.length; i += 2) pairs.push(images.slice(i, i + 2));

  useEffect(() => {
    let pageFlip: { destroy: () => void } | null = null;
    (async () => {
      const { PageFlip } = await import('page-flip');
      if (!containerRef.current) return;
      const pf = new PageFlip(containerRef.current, {
        width: 560,
        height: 780,
        size: 'stretch',
        minWidth: 300,
        maxWidth: 900,
        minHeight: 440,
        maxHeight: 1280,
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

  let pageNo = 0; // ترقيم الصفحات الداخلية

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
          <div className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary/75 to-primary/25" />
          {/* إطار ذهبي زخرفي */}
          <div className="pointer-events-none absolute inset-4 rounded-xl border border-secondary/50" />

          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-white/95 px-5 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-moi.png" alt="وزارة الداخلية" className="h-9 object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss.png" alt="جامعة نايف" className="h-9 object-contain" />
          </div>

          <div className="absolute inset-x-0 bottom-0 p-8 text-white">
            <div className="mb-3 h-1.5 w-16 rounded-full bg-secondary" />
            <p className="mb-2 text-sm font-medium tracking-wide text-secondary">برامج الشراكات الدولية</p>
            <h1 className="text-3xl font-semibold leading-snug">{course.title}</h1>
            <div className="mt-3 space-y-0.5 text-sm text-white/85">
              {course.start_date && <p>{formatArabicDate(course.start_date)}</p>}
              {course.location && <p>{course.location}</p>}
            </div>
            <p className="mt-5 text-xs text-white/60">جامعة نايف العربية للعلوم الأمنية · إدارة عمليات التدريب</p>
          </div>
        </div>

        {/* ===== صفحة التعريف ===== */}
        <MagPage title={course.title} pageNo={++pageNo}>
          <div className="flex h-full flex-col justify-center px-2">
            <h2 className="heading-accent text-2xl font-semibold text-primary">عن الدورة</h2>
            {course.description ? (
              <p className="mt-4 whitespace-pre-line text-[15px] leading-loose text-[#2a302d]">
                {course.description}
              </p>
            ) : (
              <p className="mt-4 text-muted">دورة تدريبية ضمن برامج الشراكات الدولية.</p>
            )}
            {course.trainer_names.length > 0 && (
              <div className="mt-8">
                <h3 className="mb-2 text-lg font-semibold text-primary">المدربون</h3>
                <div className="gold-divider mb-3 w-24" />
                <div className="flex flex-wrap gap-2">
                  {course.trainer_names.map((n) => (
                    <span key={n} className="rounded-xl bg-primary/8 px-3 py-1.5 text-sm text-primary">{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </MagPage>

        {/* ===== صفحات الصور (صورتان لكل صفحة مع فاصل ذهبي) ===== */}
        {pairs.map((pair, idx) => (
          <MagPage key={idx} title={course.title} pageNo={++pageNo}>
            <div className="flex h-full flex-col gap-3">
              {pair.map((m, j) => (
                <div key={m.id} className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-secondary/40 bg-white p-1.5 shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.processed_url ?? m.thumbnail_url ?? ''}
                      alt={m.caption ?? ''}
                      className="max-h-full w-full rounded-xl object-cover"
                    />
                  </div>
                  {m.caption && (
                    <p className="mt-1.5 text-center text-[13px] font-medium text-primary">{m.caption}</p>
                  )}
                  {/* فاصل ذهبي بين الصورتين */}
                  {j === 0 && pair.length > 1 && <div className="gold-divider mx-auto mt-3 w-2/3" />}
                </div>
              ))}
            </div>
          </MagPage>
        ))}

        {/* ===== الختام ===== */}
        <div className="flip-page flex flex-col items-center justify-center bg-primary p-8 text-center text-white" data-density="hard">
          <div className="pointer-events-none absolute inset-4 rounded-xl border border-secondary/40" />
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

/** قالب صفحة مجلة داخلية: خلفية مزخرفة + ترويسة بعنوان الدورة + ترقيم */
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
    <div className="flip-page magazine-pattern relative flex flex-col">
      {/* شريط جانبي أخضر رفيع (لمسة إصدارات الجامعة) */}
      <div className="absolute inset-y-0 right-0 w-1.5 bg-primary" />
      {/* الترويسة: عنوان الدورة + خط ذهبي */}
      <div className="flex items-center justify-between px-6 pt-5">
        <span className="truncate text-xs font-semibold text-primary">{title}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-nauss.png" alt="" className="h-6 object-contain opacity-80" />
      </div>
      <div className="mx-6 mt-2 h-px bg-secondary/40" />

      {/* المحتوى */}
      <div className="min-h-0 flex-1 px-6 py-4">{children}</div>

      {/* التذييل: الجهة + رقم الصفحة */}
      <div className="mx-6 mb-3 mt-1 flex items-center justify-between border-t border-secondary/25 pt-2">
        <span className="text-[10px] text-muted">برامج الشراكات الدولية</span>
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/8 text-[11px] font-semibold text-primary">
          {pageNo}
        </span>
      </div>
    </div>
  );
}
