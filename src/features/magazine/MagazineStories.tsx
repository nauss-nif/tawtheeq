'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronDown, Calendar, MapPin } from 'lucide-react';
import { formatDateRange, toArabicDigits as toArabic } from '@/lib/text';
import type { MagazineData } from './data';
import { GOLD, sessionAccent, sessionOrdinal, type SessionAccent } from './accents';
import { STAR_PATH, STAR_VIEWBOX } from './brandStar';
import { groupByOrientation, orientationOf } from './imageLayout';
import { DownloadButtons } from './DownloadButtons';

type Media = MagazineData['images'][number];

/** «قصة» واحدة = شاشة كاملة في عارض الجوال */
type Story =
  | { kind: 'cover' }
  | { kind: 'welcome' }
  | { kind: 'about' }
  | { kind: 'toc' }
  | { kind: 'session'; index: number; image?: Media }
  | { kind: 'photo'; index: number | null; image: Media }
  | { kind: 'back' };

/** قسم في شريط التقدّم: مقدمة المجلة، ثم محور لكل قسم، ثم الختام */
interface Section {
  start: number;
  length: number;
  color: string;
}

function Star({ className, color, opacity }: { className: string; color: string; opacity: number }) {
  return (
    <svg aria-hidden viewBox={STAR_VIEWBOX} className={`pointer-events-none absolute ${className}`}>
      <path d={STAR_PATH} fill={color} fillOpacity={opacity} fillRule="evenodd" />
    </svg>
  );
}

/**
 * عارض المجلة للجوال بأسلوب «القصص»: كل صفحة تملأ الشاشة عموديًا، والتنقل بالسحب الأفقي
 * أو لمس طرفي الشاشة (اليسار للتالي واليمين للسابق، كالقراءة العربية)، مع شريط تقدّم
 * مقسّم بألوان المحاور، ومحتويات تفاعلية تنقل للمحور مباشرة. الصور الطولية تملأ الشاشة،
 * والأفقية تتوسطها فوق خلفية ضبابية من الصورة نفسها.
 */
export function MagazineStories({ data, onClose }: { data: MagazineData; onClose: () => void }) {
  const { course, cover, images, sessions, coordinator, landmarkUrl } = data;
  const coverBg = cover?.processed_url ?? landmarkUrl ?? null;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const storyRefs = useRef<(HTMLElement | null)[]>([]);
  const [current, setCurrent] = useState(0);

  // ---- بناء القصص بترتيب المجلة ----
  const bySession = new Map<string, Media[]>();
  for (const s of sessions) bySession.set(s.id, []);
  const unassigned: Media[] = [];
  for (const m of images) {
    if (m.session_id && bySession.has(m.session_id)) bySession.get(m.session_id)!.push(m);
    else unassigned.push(m);
  }

  const stories: Story[] = [];
  const sections: Section[] = [];
  const pushSection = (start: number, color: string) => sections.push({ start, length: stories.length - start, color });

  stories.push({ kind: 'cover' });
  if (course.welcome_text) stories.push({ kind: 'welcome' });
  stories.push({ kind: 'about' });
  if (sessions.length) stories.push({ kind: 'toc' });
  pushSection(0, '#ffffff');

  const sessionStart: number[] = [];
  sessions.forEach((s, i) => {
    const start = stories.length;
    sessionStart.push(start);
    const imgs = bySession.get(s.id) ?? [];
    stories.push({ kind: 'session', index: i, image: imgs[0] });
    for (const m of groupByOrientation(imgs.slice(1))) stories.push({ kind: 'photo', index: i, image: m });
    pushSection(start, sessionAccent(i).main);
  });
  if (unassigned.length) {
    const start = stories.length;
    for (const m of groupByOrientation(unassigned)) stories.push({ kind: 'photo', index: null, image: m });
    pushSection(start, GOLD.main);
  }
  const backStart = stories.length;
  stories.push({ kind: 'back' });
  pushSection(backStart, GOLD.main);

  // ---- التنقل ----
  const goTo = useCallback((i: number, smooth = true) => {
    const el = storyRefs.current[Math.max(0, Math.min(i, storyRefs.current.length - 1))];
    // scrollIntoView يتعامل مع اتجاه RTL دون حساب إزاحات scrollLeft السالبة
    el?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', inline: 'start', block: 'nearest' });
  }, []);

  // القصة الظاهرة حاليًا
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    storyRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [stories.length]);

  // لوحة المفاتيح: اليسار للتالي واليمين للسابق
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(current + 1);
      else if (e.key === 'ArrowRight') goTo(current - 1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, goTo, onClose]);

  // لمس طرفي الشاشة: الثلث الأيسر للتالي والثلث الأيمن للسابق
  const onTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button, [data-scroll]')) return;
    const x = e.clientX / window.innerWidth;
    if (x < 0.33) goTo(current + 1);
    else if (x > 0.67) goTo(current - 1);
  };

  const dates = formatDateRange(course.start_date, course.end_date);

  const renderStory = (st: Story) => {
    switch (st.kind) {
      case 'cover':
        return (
          <div className="relative size-full overflow-hidden bg-primary text-white">
            {coverBg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverBg} alt="" className="absolute inset-0 size-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary/60 to-black/30" />
            <Star className="-left-24 -top-24 size-80" color="#ffffff" opacity={0.1} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss-white.png" alt="جامعة نايف العربية للعلوم الأمنية" className="absolute right-6 top-20 h-14 object-contain" />
            <div className="absolute inset-x-0 bottom-0 p-7 pb-16">
              <div className="mb-3 h-1.5 w-16 rounded-full bg-secondary" />
              <p className="mb-2 text-sm font-medium text-secondary">الدورة التدريبية</p>
              <h1 className="text-[2rem] font-semibold leading-snug">{course.title}</h1>
              <div className="mt-4 flex flex-col gap-1.5 text-sm text-white/85">
                {dates && <span className="flex items-center gap-2"><Calendar className="size-4" /> {dates}</span>}
                {course.location && <span className="flex items-center gap-2"><MapPin className="size-4" /> {course.location}</span>}
              </div>
              <p className="mt-8 flex items-center gap-2 text-xs text-white/60">
                <span className="animate-pulse">←</span> اسحب أو المس يسار الشاشة للتصفح
              </p>
            </div>
          </div>
        );
      case 'welcome':
        return (
          <Paper accent={GOLD}>
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <svg aria-hidden viewBox={STAR_VIEWBOX} className="mb-6 size-12"><path d={STAR_PATH} fill={GOLD.main} fillRule="evenodd" /></svg>
              <p className="text-lg font-medium leading-[2.1] text-primary">{course.welcome_text}</p>
              <div className="mt-6 h-1 w-16 rounded-full bg-secondary" />
            </div>
          </Paper>
        );
      case 'about':
        return (
          <Paper accent={GOLD}>
            <div data-scroll className="flex h-full flex-col justify-center overflow-y-auto px-7 py-24">
              <h2 className="text-2xl font-semibold text-primary">عن الدورة</h2>
              <div className="mb-4 mt-2 h-1 w-14 rounded-full bg-secondary" />
              {course.description && <p className="whitespace-pre-line leading-loose text-[#2a302d]">{course.description}</p>}
              {course.trainer_names.length > 0 && (
                <>
                  <h3 className="mb-2 mt-6 font-semibold text-primary">المدربون</h3>
                  <div className="flex flex-wrap gap-2">
                    {course.trainer_names.map((n) => (
                      <span key={n} className="rounded-lg border border-secondary/40 bg-white/80 px-3 py-1 text-sm text-primary">{n}</span>
                    ))}
                  </div>
                </>
              )}
              {coordinator && (
                <p className="mt-6 text-sm text-muted">
                  إعداد المجلة: <span className="font-semibold text-primary">{coordinator.full_name}</span>
                </p>
              )}
            </div>
          </Paper>
        );
      case 'toc':
        return (
          <Paper accent={GOLD}>
            <div data-scroll className="flex h-full flex-col overflow-y-auto px-6 pb-10 pt-24">
              <h2 className="text-2xl font-semibold text-primary">المحتويات</h2>
              <div className="mb-5 mt-2 h-1 w-14 rounded-full bg-secondary" />
              <ol className="flex flex-col gap-2.5">
                {sessions.map((s, i) => {
                  const a = sessionAccent(i);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => goTo(sessionStart[i])}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white/80 p-3 text-right shadow-sm transition active:scale-[0.98]"
                      >
                        <span
                          className="flex h-9 w-10 shrink-0 items-center justify-center rounded-l-xl rounded-r-md font-bold text-white"
                          style={{ background: `linear-gradient(135deg, ${a.main}, ${a.deep})` }}
                        >
                          {toArabic(i + 1)}
                        </span>
                        <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug" style={{ color: a.deep }}>{s.title}</span>
                        <ChevronDown className="size-4 shrink-0 rotate-90 text-muted" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </Paper>
        );
      case 'session': {
        const s = sessions[st.index];
        const a = sessionAccent(st.index);
        return (
          <div className="relative flex size-full flex-col overflow-hidden bg-[#F7F3EC]">
            <div className="relative h-[46%] shrink-0 overflow-hidden" style={{ background: a.main }}>
              {st.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={st.image.processed_url ?? st.image.thumbnail_url ?? ''} alt="" loading="lazy" className="size-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
              <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: a.main }} />
            </div>
            <Star className="-bottom-28 -left-28 size-80" color={a.main} opacity={0.1} />
            <span aria-hidden className="pointer-events-none absolute left-4 top-[47%] text-[150px] font-bold leading-none" style={{ color: a.tint }}>
              {toArabic(st.index + 1)}
            </span>
            <div data-scroll className="relative flex-1 overflow-y-auto px-7 pb-10 pt-6">
              <span className="flex items-center gap-2 text-sm font-bold" style={{ color: a.main }}>
                <span className="h-[3px] w-6 rounded-full" style={{ background: a.main }} /> الجلسة {sessionOrdinal(st.index)}
              </span>
              <h2 className="mt-2 text-2xl font-semibold leading-snug" style={{ color: a.deep }}>{s.title}</h2>
              <div className="mb-3 mt-3 h-[3px] w-14 rounded-full" style={{ background: `linear-gradient(to left, ${a.main}, ${GOLD.main})` }} />
              {s.description && <p className="leading-loose text-[#2a302d]">{s.description}</p>}
            </div>
          </div>
        );
      }
      case 'photo': {
        const a = st.index !== null ? sessionAccent(st.index) : GOLD;
        const title = st.index !== null ? sessions[st.index].title : 'صور من الدورة';
        const src = st.image.processed_url ?? st.image.thumbnail_url ?? '';
        const portrait = orientationOf(st.image) === 'portrait';
        return (
          <div className="relative size-full overflow-hidden bg-black">
            {/* خلفية ضبابية من الصورة نفسها تملأ الفراغ حول الصور الأفقية */}
            {!portrait && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={st.image.thumbnail_url ?? src} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover opacity-90 blur-2xl brightness-90 saturate-125" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={st.image.caption ?? title} loading="lazy" className={`absolute inset-0 size-full ${portrait ? 'object-cover' : 'object-contain'}`} />
            <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/60 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-6 pb-10 text-white">
              {st.index !== null && (
                <span
                  className="flex h-9 w-10 shrink-0 items-center justify-center rounded-l-xl rounded-r-md font-bold"
                  style={{ background: `linear-gradient(135deg, ${a.main}, ${a.deep})` }}
                >
                  {toArabic(st.index + 1)}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{title}</p>
                {st.image.caption && <p className="text-xs text-white/80">{st.image.caption}</p>}
              </div>
            </div>
          </div>
        );
      }
      case 'back':
        return (
          <div className="relative flex size-full flex-col items-center justify-center overflow-hidden bg-primary text-center text-white">
            <Star className="-bottom-32 -right-32 size-96" color="#B99C6B" opacity={0.18} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss-white.png" alt="جامعة نايف العربية للعلوم الأمنية" className="relative h-24 object-contain" />
            <div className="relative mt-14 flex flex-col items-center gap-1">
              <div className="mb-3 h-1 w-14 rounded-full bg-secondary" />
              <p className="font-semibold">إدارة عمليات التدريب</p>
              <p className="text-sm text-white/80">وكالة الجامعة للتدريب</p>
              <p className="text-sm text-white/70">جامعة نايف العربية للعلوم الأمنية</p>
            </div>
            <button type="button" onClick={() => goTo(0)} className="relative mt-10 rounded-2xl bg-white/15 px-5 py-2.5 text-sm hover:bg-white/25">
              العودة للغلاف
            </button>
          </div>
        );
    }
  };

  // ---- شريط التقدّم ----
  const sectionFill = (sec: Section) => {
    if (current >= sec.start + sec.length) return 1;
    if (current < sec.start) return 0;
    return (current - sec.start + 1) / sec.length;
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black" dir="rtl">
      {/* الشريط العلوي: التقدّم بألوان المحاور والأزرار */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/55 to-transparent px-3 pb-6 pt-[max(env(safe-area-inset-top),10px)]">
        <div className="flex gap-1">
          {sections.map((sec, i) => (
            <div key={i} className="h-1 overflow-hidden rounded-full bg-white/25" style={{ flex: Math.max(1, sec.length) }}>
              <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${sectionFill(sec) * 100}%`, background: sec.color }} />
            </div>
          ))}
        </div>
        <div className="pointer-events-auto mt-3 flex items-center justify-between">
          <button type="button" onClick={onClose} aria-label="إغلاق" className="inline-flex size-10 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
            <X className="size-5" />
          </button>
          <span className="rounded-full bg-black/30 px-3 py-1 text-xs tabular-nums text-white/85 backdrop-blur-sm">
            {toArabic(current + 1)} / {toArabic(stories.length)}
          </span>
          {course.magazine_slug ? <DownloadButtons slug={course.magazine_slug} /> : <span className="w-10" />}
        </div>
      </div>

      {/* القصص: تمرير أفقي بالتقاط كل شاشة */}
      <div
        ref={scrollerRef}
        onClick={onTap}
        className="flex h-[100dvh] w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {stories.map((st, i) => (
          <section
            key={i}
            ref={(el) => { storyRefs.current[i] = el; }}
            data-index={i}
            className="relative h-full w-full shrink-0 snap-start snap-always"
          >
            {Math.abs(i - current) <= 3 || st.kind === 'toc' || st.kind === 'cover' ? renderStory(st) : <div className="size-full bg-[#F7F3EC]" />}
          </section>
        ))}
      </div>
    </div>
  );
}

/** خلفية ورقية للقصص النصية: لون الورق، إضاءة ناعمة، ونجمة الجامعة في الزاوية */
function Paper({ accent, children }: { accent: SessionAccent; children: React.ReactNode }) {
  return (
    <div className="relative size-full overflow-hidden bg-[#F7F3EC]">
      <div className="absolute inset-0" style={{ background: `radial-gradient(90% 60% at 100% 100%, ${accent.tint} 0%, transparent 65%)` }} />
      <Star className="-bottom-28 -right-28 size-80" color={accent.main} opacity={0.13} />
      <div className="relative size-full">{children}</div>
    </div>
  );
}
