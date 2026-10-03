'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Download } from 'lucide-react';
import type { PageFlip as PageFlipInstance } from 'page-flip';
import { formatArabicDate } from '@/lib/utils';
import type { MagazineData } from './data';
import { sessionAccent, type SessionAccent } from './accents';

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

  // صفحة الترحيب (اختيارية)
  if (course.welcome_text) {
    interior.push(
      <MagPage key="welcome" heading={course.title} courseTitle={course.title} pageNo={++pageNo} showMoi={showMoi}>
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="mb-6 h-1 w-16 rounded-full bg-secondary" />
          <p className="max-w-[85%] text-[15px] font-medium leading-loose text-primary">{course.welcome_text}</p>
          <div className="mt-6 h-1 w-16 rounded-full bg-secondary" />
        </div>
      </MagPage>,
    );
  }

  // صفحة التعريف
  interior.push(
    <MagPage key="intro" heading={course.title} courseTitle={course.title} pageNo={++pageNo} showMoi={showMoi}>
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
        {coordinator && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-secondary/30 bg-white/60 p-3">
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
      at += Math.max(1, (bySession.get(s.id) ?? []).length);
      return first;
    });
    interior.push(
      <MagPage key="toc" heading="المحتويات" courseTitle={course.title} pageNo={++pageNo} showMoi={showMoi}>
        <TocList items={shownSessions.map((s, i) => ({ title: s.title, page: starts[i], accent: sessionAccent(i) }))} />
      </MagPage>,
    );
  }
  shownSessions.forEach((s, i) => {
    const sImgs = bySession.get(s.id) ?? [];
    const main = sImgs[0];
    const accent = sessionAccent(i);
    interior.push(
      <MagPage key={`s-${s.id}`} heading={s.title} courseTitle={course.title} pageNo={++pageNo} showMoi={showMoi} accent={accent}>
        <div className={`flex h-full gap-5 ${singlePage ? 'flex-col justify-center' : ''}`}>
          {/* عمود النص (يمين في RTL؛ أعلى الصفحة على الجوال) */}
          <div className={`flex flex-col justify-center ${main && !singlePage ? 'w-[44%]' : 'w-full'}`}>
            <span
              className="mb-2 w-fit rounded-full px-3 py-1 text-[11px] font-bold"
              style={{ backgroundColor: accent.tint, color: accent.main }}
            >
              الجلسة {toArabic(i + 1)}
            </span>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: accent.main }}>{s.title}</h2>
            <div className="mt-2 mb-3 h-1 w-12 rounded-full" style={{ backgroundColor: accent.main }} />
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

          {/* عمود الصورة الرئيسية (يسار) */}
          {main && (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex max-h-full w-fit items-center overflow-hidden rounded-xl border border-secondary/40 bg-white p-1.5 shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={main.processed_url ?? main.thumbnail_url ?? ''}
                  alt={main.caption ?? s.title}
                  className="mx-auto max-h-full w-auto max-w-full rounded-lg object-contain"
                />
              </div>
            </div>
          )}
        </div>
      </MagPage>,
    );

    // بقية صور المحور: صفحة كبيرة لكل صورة، عنوانها اسم المحور فقط
    sImgs.slice(1).forEach((m) => {
      interior.push(imagePage(m, s.title, course.title, ++pageNo, showMoi, s.title, accent));
    });
  });

  // الصور غير المرتبطة بمحور: صفحة كبيرة لكل صورة تحت عنوان عام
  if (unassigned.length > 0) {
    unassigned.forEach((m, idx) => {
      interior.push(imagePage(m, 'صور من الدورة', course.title, ++pageNo, showMoi, idx === 0 ? 'صور من الدورة' : undefined));
    });
  }

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

/** صفحة صورة كبيرة أفقية مع عنوان قسم اختياري */
function imagePage(
  m: { id: string; processed_url: string | null; thumbnail_url: string | null; caption: string | null },
  heading: string,
  courseTitle: string,
  pageNo: number,
  showMoi: boolean,
  sectionLabel?: string,
  accent?: SessionAccent,
) {
  return (
    <MagPage key={`img-${m.id}`} heading={heading} courseTitle={courseTitle} pageNo={pageNo} showMoi={showMoi} accent={accent}>
      <div className="flex h-full flex-col">
        {sectionLabel && (
          <div className="mb-2 shrink-0">
            <h2 className="text-lg font-semibold text-primary" style={accent && { color: accent.main }}>{sectionLabel}</h2>
            <div className="mt-1 h-1 w-12 rounded-full bg-secondary" style={accent && { backgroundColor: accent.main }} />
          </div>
        )}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex h-full max-h-full max-w-full items-center justify-center overflow-hidden rounded-xl border border-secondary/40 bg-white p-1.5 shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.processed_url ?? m.thumbnail_url ?? ''}
              alt={m.caption ?? ''}
              className="max-h-full w-auto max-w-full rounded-lg object-contain"
            />
          </div>
        </div>
        {m.caption && (
          <div className="mt-2 shrink-0 text-center">
            <div className="mx-auto mb-1 h-0.5 w-10 rounded-full bg-secondary" />
            <p className="text-[13px] font-medium text-primary">{m.caption}</p>
          </div>
        )}
      </div>
    </MagPage>
  );
}

/**
 * قالب صفحة داخلية أفقية بمواضع مثبّتة بشكل قاطع (absolute):
 * الترويسة ملتصقة بالأعلى (عنوان الجلسة + الشعارات)، والتذييل ملتصق بالأسفل
 * (رقم الصفحة + عنوان الدورة). هذا يضمن ثبات الترقيم أسفل كل صفحة دائمًا.
 */
function MagPage({
  heading,
  courseTitle,
  pageNo,
  showMoi,
  accent,
  children,
}: {
  heading: string;
  courseTitle: string;
  pageNo: number;
  showMoi: boolean;
  /** لون المحور: يلوّن الشريط الجانبي والترويسة ورقم الصفحة */
  accent?: SessionAccent;
  children: React.ReactNode;
}) {
  return (
    <div className="flip-page magazine-pattern relative overflow-hidden">
      {/* شريط جانبي أخضر */}
      <div
        className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-primary to-primary-dark"
        style={accent && { background: accent.main }}
      />

      {/* الترويسة مثبّتة أعلى الصفحة: عنوان الجلسة يمينًا ثم الشعارات */}
      <div className="absolute inset-x-0 top-0 px-6 pt-4">
        <div className="flex items-center justify-between">
          <span className="truncate pl-3 text-xs font-semibold text-primary" style={accent && { color: accent.main }}>{heading}</span>
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
        <div className="mt-2 h-px bg-gradient-to-l from-transparent via-secondary to-transparent opacity-60" />
      </div>

      {/* المحتوى بين الترويسة والتذييل (يُقصّ إن زاد ليمنع أي تداخل) */}
      <div className="absolute inset-x-0 bottom-12 top-16 overflow-hidden px-7">{children}</div>

      {/* التذييل مثبّت أسفل الصفحة: رقم الصفحة يسارًا وعنوان الدورة يمينًا */}
      <div className="absolute inset-x-6 bottom-3 flex items-center justify-between border-t border-secondary/25 pt-2">
        <span
          className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white"
          style={accent && { backgroundColor: accent.main }}
        >
          {toArabic(pageNo)}
        </span>
        <span className="truncate pr-3 text-[10px] tracking-wide text-muted">{courseTitle}</span>
      </div>
    </div>
  );
}

/** قائمة المحتويات: رقم المحور بلونه، العنوان، ثم رقم الصفحة */
function TocList({ items }: { items: { title: string; page: number; accent: SessionAccent }[] }) {
  // نصغّر الأسطر تلقائيًا حين تكثر المحاور لتتسع في صفحة واحدة
  const dense = items.length > 10;
  return (
    <div className="flex h-full flex-col justify-center">
      <h2 className="text-xl font-semibold text-primary">المحتويات</h2>
      <div className="mt-2 mb-3 h-1 w-14 rounded-full bg-secondary" />
      <ol className={dense ? 'space-y-1' : 'space-y-2'}>
        {items.map((it, i) => (
          <li key={i} className={`flex items-center gap-3 ${dense ? 'text-[12px]' : 'text-[13.5px]'}`}>
            <span
              className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${dense ? 'size-5 text-[10px]' : 'size-6 text-[11px]'}`}
              style={{ backgroundColor: it.accent.main }}
            >
              {toArabic(i + 1)}
            </span>
            <span className="truncate font-medium text-[#2a302d]">{it.title}</span>
            <span className="min-w-6 flex-1 border-b border-dotted border-secondary/60" />
            <span className="shrink-0 tabular-nums text-muted">{toArabic(it.page)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
