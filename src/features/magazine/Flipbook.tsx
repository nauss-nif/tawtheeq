'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Download } from 'lucide-react';
import type { PageFlip as PageFlipInstance } from 'page-flip';
import { formatArabicDate } from '@/lib/utils';
import type { MagazineData } from './data';
import { GOLD, sessionAccent, sessionOrdinal, tabTopRatio, type SessionAccent } from './accents';
import { STAR_H, STAR_PATH, STAR_VIEWBOX, STAR_W } from './brandStar';
import { packImagePages, sessionPageCount, type ImageSlot } from './imageLayout';

/**
 * وضع Flipbook: مجلة أفقية أنيقة. صورة واحدة كبيرة لكل صفحة (تناسب الصور الأفقية)،
 * شعارات شفافة في الترويسة، معلم المدينة كخلفية شفافة على كل الصفحات،
 * ترقيم ثابت أسفل الصفحة، وغلاف خلفي مرتّب. الشعارات قابلة للتحكم (الشراكات).
 */
export function Flipbook({ data, onClose }: { data: MagazineData; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { course, cover, images, sessions, coordinator, landmarkUrl } = data;
  const coverBg = cover?.processed_url ?? landmarkUrl ?? null;
  const showMoi = course.show_partnership_logo;

  // نجمع الصور حسب الجلسة المرتبطة بها
  const bySession = new Map<string, typeof images>();
  for (const s of sessions) bySession.set(s.id, []);
  const unassigned: typeof images = [];
  for (const m of images) {
    if (m.session_id && bySession.has(m.session_id)) bySession.get(m.session_id)!.push(m);
    else unassigned.push(m);
  }

  // مقاس التصميم الثابت للصفحة الواحدة. على الجوال نعرض صفحة واحدة، وعلى الشاشات الكبيرة صفحتين،
  // ثم نُصغّرها بتناسب واحد (transform) لتملأ الشاشة دون الحاجة لإمالة الجهاز.
  // مقاس الصفحة: أفقي على الشاشات الكبيرة، وعمودي على الجوال ليملأ الشاشة
  const LANDSCAPE = { w: 800, h: 560 };
  const PORTRAIT = { w: 560, h: 800 };
  const [singlePage, setSinglePage] = useState(false);
  const [scale, setScale] = useState(0.5);
  const PAGE_W = singlePage ? PORTRAIT.w : LANDSCAPE.w;
  const PAGE_H = singlePage ? PORTRAIT.h : LANDSCAPE.h;

  useEffect(() => {
    const fit = () => {
      const single = window.innerWidth < 768; // الجوال: صفحة واحدة عمودية
      const { w, h } = single ? PORTRAIT : LANDSCAPE;
      const pages = single ? 1 : 2;
      const availW = window.innerWidth - 12;
      const availH = window.innerHeight - 128; // مساحة أزرار التقليب والسطر الإرشادي
      setSinglePage(single);
      setScale(Math.max(0.2, Math.min(availW / (w * pages), availH / h, 1.25)));
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, []);

  const [flip, setFlip] = useState<PageFlipInstance | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  // مفتاح التركيب: تغيّره يُعيد بناء حاوية نظيفة — page-flip ينقل عناصر DOM ولا يقبل إعادة تهيئة فوق حاوية مستعملة
  const mountKey = `${course.id}-${singlePage ? 'portrait' : 'landscape'}`;

  useEffect(() => {
    let pf: PageFlipInstance | null = null;
    let cancelled = false;

    (async () => {
      const { PageFlip } = await import('page-flip');
      const el = containerRef.current;
      // الاستيراد غير متزامن: قد يُفكَّك المكوّن قبل الوصول هنا (StrictMode يركّب مرتين)
      if (cancelled || !el) return;
      // اتجاه عربي: page-flip لا يدعم RTL، فنمرّر الصفحات معكوسة ونبدأ من آخرها،
      // فيقع الغلاف وحده يسارًا وتُقلَّب الصفحات من اليسار إلى اليمين كالكتاب العربي
      const pages = Array.from(el.querySelectorAll<HTMLElement>('.flip-page')).reverse();
      if (pages.length === 0) return;

      const instance = new PageFlip(el, {
        width: PAGE_W,
        height: PAGE_H,
        size: 'fixed',
        showCover: true,
        usePortrait: singlePage, // صفحة واحدة على الجوال
        mobileScrollSupport: true,
        startPage: pages.length - 1,
        useMouseEvents: true,
        swipeDistance: 20, // لمسة أقصر تكفي للتقليب على الجوال
        drawShadow: true,
        maxShadowOpacity: 0.4,
      });
      instance.loadFromHTML(pages);

      if (cancelled) {
        try { instance.destroy(); } catch { /* فُكِّك قبل اكتمال التهيئة */ }
        return;
      }

      instance.on('flip', (e) => setPageIndex(Number(e.data)));
      pf = instance;
      setFlip(instance);
      setPageCount(instance.getPageCount());
      setPageIndex(instance.getCurrentPageIndex());
    })();

    return () => {
      cancelled = true;
      setFlip(null);
      try { pf?.destroy(); } catch { /* استبدلت React العناصر قبل التدمير */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountKey]);

  // تقليب بالأسهم وإغلاق بـ Escape
  useEffect(() => {
    if (!flip) return;
    const onKey = (e: KeyboardEvent) => {
      // الترتيب معكوس: التقدّم في القراءة = الرجوع في فهرس المكتبة
      if (e.key === 'ArrowRight') flip.flipNext();
      else if (e.key === 'ArrowLeft') flip.flipPrev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flip, onClose]);

  const interior: React.ReactNode[] = [];
  let pageNo = 0;
  // الصفحة الداخلية رقم k (من الصفر) تقع يمين الصفحتين المتقابلتين إن كان ترتيبها في القراءة فرديًا (الغلاف = ٠)
  const sideOf = (k: number): Side => ((k + 1) % 2 === 1 ? 'right' : 'left');

  // صفحة الترحيب (اختيارية)
  if (course.welcome_text) {
    interior.push(
      <MagPage key="welcome" side={sideOf(interior.length)} heading={course.title} courseTitle={course.title} pageNo={++pageNo} showMoi={showMoi}>
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <Ornament />
          <p className="my-6 max-w-[85%] text-[16px] font-medium leading-[2.1] text-primary">{course.welcome_text}</p>
          <Ornament />
        </div>
      </MagPage>,
    );
  }

  // صفحة التعريف
  interior.push(
    <MagPage key="intro" side={sideOf(interior.length)} heading={course.title} courseTitle={course.title} pageNo={++pageNo} showMoi={showMoi}>
      <div className="flex h-full flex-col justify-center">
        <SectionTitle accent={GOLD}>عن الدورة</SectionTitle>
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
                <span key={n} className="rounded-lg border border-secondary/40 bg-white/80 px-3 py-1 text-[13px] text-primary shadow-sm">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
        {coordinator && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-secondary/30 bg-white/70 p-3 shadow-sm">
            {coordinator.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coordinator.avatar_url} alt={coordinator.full_name} className="size-12 shrink-0 rounded-full border border-secondary/50 object-cover" />
            ) : null}
            <div>
              <p className="text-[11px] text-muted">إعداد المجلة</p>
              <p className="text-[13.5px] font-semibold text-primary">{coordinator.full_name}</p>
              <p className="text-[11px] text-muted">{coordinator.job_title || 'منسّق الدورة'}</p>
            </div>
          </div>
        )}
      </div>
    </MagPage>,
  );

  // كل المحاور تُعرض بترقيم تسلسلي، ولو لم تُسند لها صور
  const shownSessions = sessions;

  // صفحة المحتويات: نحسب رقم أول صفحة لكل محور مسبقًا (صفحة المحور + صفحة لكل صورة إضافية)
  if (shownSessions.length > 0) {
    let at = pageNo + 1; // صفحة المحتويات نفسها
    const starts = shownSessions.map((s) => {
      const first = at + 1;
      at += sessionPageCount(bySession.get(s.id) ?? []);
      return first;
    });
    interior.push(
      <MagPage key="toc" side={sideOf(interior.length)} heading="المحتويات" courseTitle={course.title} pageNo={++pageNo} showMoi={showMoi}>
        <TocList items={shownSessions.map((s, i) => ({ title: s.title, page: starts[i], accent: sessionAccent(i) }))} />
      </MagPage>,
    );
  }

  shownSessions.forEach((s, i) => {
    const sImgs = bySession.get(s.id) ?? [];
    const main = sImgs[0];
    const accent = sessionAccent(i);
    const side = sideOf(interior.length);
    interior.push(
      <MagPage key={`s-${s.id}`} side={side} heading={s.title} courseTitle={course.title} pageNo={++pageNo} showMoi={showMoi} accent={accent} tab={i}>
        {/* رقم المحور بحجم كبير وبدرجة فاتحة من لونه خلف عمود النص (يمين الصفحة دائمًا) */}
        <span
          aria-hidden
          className="pointer-events-none absolute select-none font-bold leading-none"
          style={{ right: -4, top: singlePage ? -10 : 0, fontSize: 170, color: accent.tint }}
        >
          {toArabic(i + 1)}
        </span>
        <div className={`relative flex h-full gap-6 ${singlePage ? 'flex-col justify-center' : ''}`}>
          {/* عمود النص (يمين في RTL؛ أعلى الصفحة على الجوال) */}
          <div className={`flex flex-col justify-center ${main && !singlePage ? 'w-[44%] shrink-0' : 'w-full'}`}>
            <span className="mb-2 flex items-center gap-2 text-[12px] font-bold tracking-wide" style={{ color: accent.main }}>
              <span className="h-[3px] w-6 rounded-full" style={{ backgroundColor: accent.main }} />
              الجلسة {sessionOrdinal(i)}
            </span>
            <h2 className="text-[22px] font-semibold leading-snug" style={{ color: accent.deep }}>{s.title}</h2>
            <div className="mt-2.5 mb-3 h-[3px] w-14 rounded-full" style={{ background: `linear-gradient(to left, ${accent.main}, ${GOLD.main})` }} />
            {(s.presenter || s.time_label) && (
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                {s.presenter && <span>المقدّم: {s.presenter}</span>}
                {s.time_label && <span dir="ltr">{s.time_label}</span>}
              </div>
            )}
            {s.description ? (
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-[#2a302d]">{s.description}</p>
            ) : (
              <p className="text-[13px] leading-relaxed text-muted">جلسة ضمن برنامج الدورة التدريبية.</p>
            )}
          </div>

          {/* الصورة الرئيسية فوق كتلة بلون المحور */}
          {main && (
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
              <AccentFrame accent={accent} side={side} offset={12}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={main.processed_url ?? main.thumbnail_url ?? ''}
                  alt={main.caption ?? s.title}
                  className={`mx-auto block w-auto max-w-full rounded-lg object-contain ${singlePage ? 'max-h-[320px]' : 'max-h-[400px]'}`}
                />
              </AccentFrame>
            </div>
          )}
        </div>
      </MagPage>,
    );

    // بقية صور المحور: صفحة كبيرة لكل صورة، عنوانها اسم المحور فقط
    // بقية الصور مرتبة حسب الاتجاه: صورتان طوليتان في صفحة، والأفقية صفحة كاملة
    packImagePages(sImgs.slice(1)).forEach((slot) => {
      interior.push(imagePage(slot, s.title, course.title, ++pageNo, showMoi, sideOf(interior.length), singlePage, s.title, accent, i));
    });
  });

  // الصور غير المرتبطة بمحور: صفحة كبيرة لكل صورة تحت عنوان عام
  if (unassigned.length > 0) {
    packImagePages(unassigned).forEach((slot, idx) => {
      interior.push(
        imagePage(slot, 'صور من الدورة', course.title, ++pageNo, showMoi, sideOf(interior.length), singlePage, idx === 0 ? 'صور من الدورة' : undefined),
      );
    });
  }

  // ضبط زوجي حتى ينغلق الغلاف الخلفي
  if ((interior.length + 2) % 2 !== 0) {
    interior.push(
      <div key="blank" className="flip-page relative overflow-hidden bg-[#F7F3EC]">
        <BrandStar color={GOLD.main} opacity={0.12} size={460} style={{ bottom: -150, left: -150 }} />
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
      {course.magazine_slug && (
        <a
          href={`/m/${course.magazine_slug}/offline`}
          title="ملف HTML واحد يفتح على أي جهاز دون اتصال بالإنترنت"
          className="absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
        >
          <Download className="size-5" /> تنزيل للعرض دون اتصال
        </a>
      )}

      {/* غلاف يحجز المساحة المُصغّرة، والداخل بمقاس التصميم مع تصغير بتناسب واحد */}
      <div style={{ width: PAGE_W * (singlePage ? 1 : 2) * scale, height: PAGE_H * scale }} className="relative">
      {/* غلاف التصغير: نعزل تحويل React عن الحاوية التي يتحكّم بها page-flip */}
      <div
        className="absolute left-0 top-0"
        style={{ width: PAGE_W * (singlePage ? 1 : 2), height: PAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
      <div
        key={mountKey}
        ref={containerRef}
        className="flipbook"
        style={{ width: PAGE_W * (singlePage ? 1 : 2), height: PAGE_H }}
      >
        {/* ===== الغلاف الأمامي ===== */}
        <div className="flip-page relative overflow-hidden bg-primary" data-density="hard">
          {coverBg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverBg} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary/70 to-primary/25" />
          <div className="pointer-events-none absolute inset-4 rounded-lg border border-secondary/50" />
          {/* نجمة الجامعة كبيرة شفافة تخرج من الزاوية */}
          <BrandStar color="#ffffff" opacity={0.1} size={520} style={{ top: -170, left: -170 }} />

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
            <p className="mb-2 text-[13px] font-medium tracking-wide text-secondary">الدورة التدريبية</p>
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

        {/* ===== الغلاف الخلفي: الشعار في المنتصف تمامًا + عبارة ثابتة أسفل (مواضع مثبّتة) ===== */}
        <div className="flip-page relative overflow-hidden bg-primary text-center text-white" data-density="hard">
          <div className="pointer-events-none absolute inset-4 rounded-lg border border-secondary/40" />
          <BrandStar color="#B99C6B" opacity={0.16} size={560} style={{ bottom: -190, right: -190 }} />
          {/* شعار الجامعة في منتصف الصفحة تمامًا */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss-white.png" alt="جامعة نايف العربية للعلوم الأمنية" className="h-28 object-contain" />
          </div>
          {/* عبارة ثابتة أسفل الصفحة */}
          <div className="absolute inset-x-0 bottom-10 space-y-1">
            <div className="mx-auto mb-3 h-1 w-14 rounded-full bg-secondary" />
            <p className="text-base font-semibold">إدارة عمليات التدريب</p>
            <p className="text-sm text-white/80">وكالة الجامعة للتدريب</p>
            <p className="text-sm text-white/70">جامعة نايف العربية للعلوم الأمنية</p>
          </div>
        </div>
      </div>
      </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-white/85">
        <button
          type="button"
          onClick={() => flip?.flipNext()}
          disabled={!flip || (pageCount > 0 && pageIndex >= pageCount - 1)}
          aria-label="الصفحة السابقة"
          className="inline-flex size-10 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25 disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
        <span className="min-w-24 text-center text-xs tabular-nums text-white/70">
          {pageCount > 0 ? `${toArabic(pageCount - pageIndex)} / ${toArabic(pageCount)}` : '...'}
        </span>
        <button
          type="button"
          onClick={() => flip?.flipPrev()}
          disabled={!flip || pageIndex === 0}
          aria-label="الصفحة التالية"
          className="inline-flex size-10 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25 disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>
      </div>

      <p className="mt-2 text-center text-xs text-white/50">اسحب الصفحة أو استخدم الأزرار والأسهم للتقليب</p>
    </div>
  );
}

/** أرقام عربية */
function toArabic(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

type Side = 'right' | 'left';

// لون ورق الصفحات الداخلية #F7F3EC يُعطى بصنف CSS (bg-[#F7F3EC]) لا بخاصية style:
// page-flip يستبدل style عناصر الصفحات عند التهيئة فتضيع أي خلفية مضمّنة فيه

/** نجمة شعار الجامعة المتجهة، تُلوَّن وتوضع مقصوصة عند الزوايا */
function BrandStar({ color, opacity, size, style }: { color: string; opacity: number; size: number; style: React.CSSProperties }) {
  return (
    <svg
      aria-hidden
      viewBox={STAR_VIEWBOX}
      width={size}
      height={(size * STAR_H) / STAR_W}
      className="pointer-events-none absolute"
      style={style}
    >
      <path d={STAR_PATH} fill={color} fillOpacity={opacity} fillRule="evenodd" />
    </svg>
  );
}

/** زخرفة صغيرة: خطان ذهبيان بينهما نجمة الجامعة */
function Ornament() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-14 bg-gradient-to-l from-secondary to-transparent" />
      <svg aria-hidden viewBox={STAR_VIEWBOX} className="size-5">
        <path d={STAR_PATH} fill={GOLD.main} fillRule="evenodd" />
      </svg>
      <span className="h-px w-14 bg-gradient-to-r from-secondary to-transparent" />
    </div>
  );
}

/** عنوان قسم بخط متدرّج تحته */
function SectionTitle({ accent, children }: { accent: SessionAccent; children: React.ReactNode }) {
  return (
    <>
      <h2 className="text-[21px] font-semibold text-primary">{children}</h2>
      <div className="mt-2 mb-3 h-[3px] w-14 rounded-full" style={{ background: `linear-gradient(to left, ${accent.main}, ${accent.tint})` }} />
    </>
  );
}

/** إطار صورة أبيض فوق كتلة ملوّنة مزاحة نحو الحافة الخارجية للصفحة (أسلوب المجلات) */
function AccentFrame({ accent, side, offset, children }: { accent: SessionAccent; side: Side; offset: number; children: React.ReactNode }) {
  const dx = side === 'right' ? offset : -offset;
  return (
    <div className="relative max-w-full">
      <div
        aria-hidden
        className="absolute inset-0 rounded-xl"
        style={{ transform: `translate(${dx}px, ${offset}px)`, background: `linear-gradient(135deg, ${accent.main}, ${accent.deep})` }}
      />
      <div className="relative overflow-hidden rounded-xl bg-white p-1.5 shadow-lg">{children}</div>
    </div>
  );
}

type PageImage = { id: string; processed_url: string | null; thumbnail_url: string | null; caption: string | null; width: number | null; height: number | null };

/** صفحة صور: صورة أفقية واحدة كبيرة، أو صورتان طوليتان جنبًا إلى جنب، مع عنوان قسم اختياري */
function imagePage(
  slot: ImageSlot<PageImage>,
  heading: string,
  courseTitle: string,
  pageNo: number,
  showMoi: boolean,
  side: Side,
  singlePage: boolean,
  sectionLabel?: string,
  accent?: SessionAccent,
  tab?: number,
) {
  const ac = accent ?? GOLD;
  const captions = slot.images.map((m) => m.caption).filter(Boolean) as string[];
  // أقصى ارتفاع للصورة داخل مساحة المحتوى (أفقي ٤٤٨ / عمودي ٦٨٨) بعد العنوان والإطار والتعليق
  const maxH = (singlePage ? 640 : 420) - (sectionLabel ? 40 : 0) - (captions.length ? 30 : 0);
  const pair = slot.kind === 'pair';
  return (
    <MagPage key={`img-${slot.images[0].id}`} side={side} heading={heading} courseTitle={courseTitle} pageNo={pageNo} showMoi={showMoi} accent={accent} tab={tab}>
      <div className="flex h-full flex-col">
        {sectionLabel && (
          <div className="mb-3 flex shrink-0 items-center gap-2">
            <span className="h-[3px] w-6 rounded-full" style={{ backgroundColor: ac.main }} />
            <h2 className="truncate text-[16px] font-semibold" style={{ color: accent?.deep ?? '#0E5C50' }}>{sectionLabel}</h2>
          </div>
        )}
        <div className={`flex min-h-0 flex-1 items-center justify-center pb-3 ${pair ? 'gap-7' : ''}`}>
          {slot.images.map((m) => (
            <div key={m.id} className={pair ? 'flex min-w-0 flex-1 justify-center' : 'flex justify-center'}>
              <AccentFrame accent={ac} side={side} offset={8}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.processed_url ?? m.thumbnail_url ?? ''}
                  alt={m.caption ?? ''}
                  className="block w-auto max-w-full rounded-lg object-contain"
                  style={{ maxHeight: maxH }}
                />
              </AccentFrame>
            </div>
          ))}
        </div>
        {captions.length > 0 && (
          <div className="shrink-0 text-center">
            <p className="text-[13px] font-medium text-primary">{captions.join(' · ')}</p>
          </div>
        )}
      </div>
    </MagPage>
  );
}

/**
 * قالب صفحة داخلية بمواضع مثبّتة (absolute): الترويسة أعلى، والتذييل أسفل.
 * هوية المحور: لسان فهرسة ملوّن على الحافة الخارجية يتدرّج موضعه من محور لآخر،
 * ونجمة الجامعة كبيرة بلون المحور مقصوصة عند الزاوية السفلية الخارجية.
 */
function MagPage({
  heading,
  courseTitle,
  pageNo,
  showMoi,
  side,
  accent,
  tab,
  children,
}: {
  heading: string;
  courseTitle: string;
  pageNo: number;
  showMoi: boolean;
  /** جهة الصفحة في الصفحتين المتقابلتين: تحدد الحافة الخارجية */
  side: Side;
  /** لون المحور؛ بدونه تأخذ الصفحة الذهبي العام */
  accent?: SessionAccent;
  /** رقم المحور (من الصفر) لإظهار لسان الفهرسة */
  tab?: number;
  children: React.ReactNode;
}) {
  const ac = accent ?? GOLD;
  const outer = side; // الحافة الخارجية
  const inner: Side = side === 'right' ? 'left' : 'right';
  const tabRadius = outer === 'right'
    ? { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }
    : { borderTopRightRadius: 12, borderBottomRightRadius: 12 };
  return (
    <div className="flip-page relative overflow-hidden bg-[#F7F3EC]">
      {/* إضاءة ناعمة بلون المحور من الزاوية الخارجية */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: `radial-gradient(90% 70% at ${outer === 'right' ? '100%' : '0%'} 100%, ${ac.tint} 0%, transparent 60%)` }}
      />
      {/* نجمة الجامعة الكبيرة مقصوصة عند الزاوية السفلية الخارجية */}
      <BrandStar color={ac.main} opacity={accent ? 0.1 : 0.14} size={430} style={{ bottom: -140, [outer]: -140 }} />

      {/* لسان الفهرسة على الحافة الخارجية */}
      {tab !== undefined && accent && (
        <div
          aria-hidden
          className="absolute flex w-[34px] flex-col items-center justify-center gap-1.5 text-white shadow-md"
          style={{
            top: `${tabTopRatio(tab) * 100}%`,
            [outer]: 0,
            height: 74,
            background: `linear-gradient(180deg, ${accent.main}, ${accent.deep})`,
            ...tabRadius,
          }}
        >
          <span className="text-[17px] font-bold leading-none">{toArabic(tab + 1)}</span>
          <svg viewBox={STAR_VIEWBOX} className="size-3 opacity-80">
            <path d={STAR_PATH} fill="#fff" fillRule="evenodd" />
          </svg>
        </div>
      )}

      {/* الترويسة: عنوان الجلسة ثم الشعارات */}
      <div className="absolute inset-x-0 top-0 px-7 pt-4">
        <div className="flex items-center justify-between">
          <span className="flex min-w-0 items-center gap-2 pl-3 text-xs font-semibold" style={{ color: accent?.main ?? '#0E5C50' }}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: ac.main }} />
            <span className="truncate">{heading}</span>
          </span>
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
        <div className="mt-2 h-px" style={{ background: `linear-gradient(to ${inner}, ${ac.main}, transparent)`, opacity: 0.55 }} />
      </div>

      {/* المحتوى بين الترويسة والتذييل؛ مسافة إضافية عند لسان الفهرسة */}
      <div className="absolute bottom-12 top-16 overflow-hidden" style={{ [outer]: tab !== undefined ? 52 : 30, [inner]: 30 }}>
        {children}
      </div>

      {/* التذييل: رقم الصفحة عند الحافة الخارجية وعنوان الدورة عند الداخلية */}
      <div
        className="absolute bottom-3 flex items-center justify-between gap-3 pt-2"
        style={{ left: 24, right: 24, flexDirection: outer === 'right' ? 'row' : 'row-reverse', borderTop: `1px solid ${ac.main}33` }}
      >
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${ac.main}, ${ac.deep})` }}
        >
          {toArabic(pageNo)}
        </span>
        <span className="truncate text-[10px] tracking-wide text-muted">{courseTitle}</span>
      </div>
    </div>
  );
}

/** قائمة المحتويات: لسان المحور بلونه، العنوان، ثم رقم الصفحة */
function TocList({ items }: { items: { title: string; page: number; accent: SessionAccent }[] }) {
  // نصغّر الأسطر تلقائيًا حين تكثر المحاور لتتسع في صفحة واحدة
  const dense = items.length > 10;
  return (
    <div className="flex h-full flex-col justify-center">
      <SectionTitle accent={GOLD}>المحتويات</SectionTitle>
      <ol className={dense ? 'space-y-1' : 'space-y-2'}>
        {items.map((it, i) => (
          <li key={i} className={`flex items-center gap-3 ${dense ? 'text-[12px]' : 'text-[13.5px]'}`}>
            <span
              className={`flex shrink-0 items-center justify-center rounded-l-lg rounded-r-sm font-bold text-white shadow-sm ${dense ? 'h-5 w-7 text-[10px]' : 'h-6 w-8 text-[11px]'}`}
              style={{ background: `linear-gradient(135deg, ${it.accent.main}, ${it.accent.deep})` }}
            >
              {toArabic(i + 1)}
            </span>
            <span className="truncate font-medium" style={{ color: it.accent.deep }}>{it.title}</span>
            <span className="min-w-6 flex-1 border-b border-dotted" style={{ borderColor: `${it.accent.main}66` }} />
            <span className="shrink-0 tabular-nums text-muted">{toArabic(it.page)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
