'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { X, BookOpen, LayoutGrid, Download, Play, MapPin, Calendar, Users } from 'lucide-react';
import { cn, formatArabicDate } from '@/lib/utils';
import { TEMPLATES } from './templates';
import type { MagazineData } from './data';
import { Flipbook } from './Flipbook';
import { sessionAccent, sessionOrdinal } from './accents';
import { STAR_PATH, STAR_VIEWBOX } from './brandStar';

const NAV = [
  { id: 'intro', label: 'تعريف' },
  { id: 'sessions', label: 'المحاور' },
  { id: 'gallery', label: 'المعرض' },
  { id: 'videos', label: 'الفيديو' },
  { id: 'trainers', label: 'المدربون' },
];

export function MagazineView({ data, siteUrl }: { data: MagazineData; siteUrl: string }) {
  const { course, cover, images, videos, sessions, landmarkUrl } = data;
  // نجمع الصور حسب الجلسة لعرضها بجانب محاور الدورة
  const bySession = new Map<string, typeof images>();
  for (const sn of sessions) bySession.set(sn.id, []);
  for (const m of images) {
    if (m.session_id && bySession.has(m.session_id)) bySession.get(m.session_id)!.push(m);
  }
  const unassignedImages = images.filter((m) => !(m.session_id && bySession.has(m.session_id)));
  const toArabic = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
  // خلفية الغلاف: صورة الغلاف التي اختارها المنسق أولًا، ثم معلم المدينة احتياطيًا
  const usingLandmark = !cover?.processed_url && !!landmarkUrl;
  const heroBg = cover?.processed_url ?? landmarkUrl ?? null;
  const tpl = TEMPLATES[course.template_id];
  const [scrolled, setScrolled] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [flip, setFlip] = useState(false);

  // مؤشر تقدم القراءة الذهبي
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // إغلاق lightbox بمفتاح Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (flip) {
    return (
      <Flipbook
        data={data}
        onClose={() => setFlip(false)}
      />
    );
  }

  return (
    <div className="min-h-screen magazine-pattern">
      {/* مؤشر تقدم القراءة */}
      <motion.div className="fixed inset-x-0 top-0 z-50 h-1 origin-right bg-secondary" style={{ scaleX: progress }} />

      {/* شريط تنقل: شفاف يتحول لأخضر صلب عند التمرير */}
      <nav
        className={cn(
          'fixed inset-x-0 top-1 z-40 transition-all duration-300',
          scrolled ? 'bg-primary/95 shadow-soft backdrop-blur' : 'bg-transparent',
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          {/* يمينًا: الشعارات ثم العنوان ثم روابط الأقسام */}
          <div className="flex min-w-0 items-center gap-3">
            {/* الشعارات (جامعة نايف ثم برامج الشراكات) */}
            <div className="flex shrink-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-nauss-white.png" alt="جامعة نايف العربية للعلوم الأمنية" className="h-8 object-contain drop-shadow sm:h-9" />
              {course.show_partnership_logo && (
                <>
                  <span className="h-7 w-px bg-white/30" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-moi-white.png" alt="برامج الشراكات الدولية" className="h-8 object-contain drop-shadow sm:h-9" />
                </>
              )}
            </div>
            <span className="hidden h-8 w-px bg-white/25 lg:block" />
            <span className={cn('hidden max-w-[22vw] truncate font-semibold text-white drop-shadow lg:block')}>
              {course.title}
            </span>
            <div className="mr-2 hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  className={cn(
                    'rounded-xl px-2.5 py-1.5 text-sm text-white/90 transition-colors',
                    scrolled ? 'hover:bg-white/10' : 'hover:bg-black/20',
                  )}
                >
                  {n.label}
                </a>
              ))}
            </div>
          </div>
          {/* يسارًا: الأزرار */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setFlip(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5 text-sm font-medium text-white hover:brightness-95"
            >
              <BookOpen className="size-4" /> <span className="hidden sm:inline">المجلة الإلكترونية</span>
            </button>
            <a
              href={`/m/${course.magazine_slug}/pdf`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25"
            >
              <Download className="size-4" /> <span className="hidden sm:inline">PDF</span>
            </a>
            <a
              href={`/m/${course.magazine_slug}/offline`}
              title="ملف HTML واحد يفتح على أي جهاز دون اتصال بالإنترنت"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25"
            >
              <Download className="size-4" /> <span className="hidden sm:inline">نسخة دون اتصال</span>
            </a>
          </div>
        </div>
      </nav>

      {/* غلاف hero */}
      <header className={cn('relative flex h-[85vh] min-h-[520px] items-end overflow-hidden', tpl.hero)}>
        {heroBg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroBg} alt={course.title} className="absolute inset-0 size-full object-cover" />
        )}
        <div className={cn('absolute inset-0', tpl.heroOverlay)} />
        {/* إسناد المصدر عند استخدام صورة معلم من ويكيبيديا */}
        {usingLandmark && (
          <span className="absolute bottom-2 left-3 z-10 text-[10px] text-white/60">
            الصورة: ويكيميديا
          </span>
        )}
        <div className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16 text-white">
          <div className={cn('mb-4 h-1.5 w-24 rounded-full', tpl.accent)} />
          <p className="mb-2 text-sm font-medium text-secondary">الدورة التدريبية</p>
          <h1 className={tpl.heroTitle}>{course.title}</h1>
          <div className="mt-4 flex flex-wrap gap-4 text-white/90">
            {course.start_date && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-5" /> {formatArabicDate(course.start_date)}
              </span>
            )}
            {course.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-5" /> {course.location}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        {/* نص الترحيب (اختياري) */}
        {course.welcome_text && (
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <div className="mx-auto mb-5 h-1 w-16 rounded-full bg-secondary" />
            <p className="text-xl font-medium leading-loose text-primary">{course.welcome_text}</p>
            <div className="mx-auto mt-5 h-1 w-16 rounded-full bg-secondary" />
          </div>
        )}

        {/* قسم تعريفي */}
        {course.description && (
          <Section id="intro" title="عن الدورة" tpl={tpl}>
            <p className="whitespace-pre-line text-lg leading-loose text-[#2a302d]">{course.description}</p>
          </Section>
        )}

        {/* محاور الدورة: كل المحاور تُذكر بعنوانها ووصفها، والصور إن وُجدت */}
        {sessions.length > 0 && (
          <Section id="sessions" title="محاور الدورة" tpl={tpl}>
            <div className="flex flex-col gap-8">
              {sessions.map((sn, i) => {
                const sImgs = bySession.get(sn.id) ?? [];
                const accent = sessionAccent(i);
                return (
                  <motion.article
                    key={sn.id}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.45 }}
                    className="relative grid gap-6 overflow-hidden rounded-3xl border border-secondary/30 border-r-4 bg-surface p-6 shadow-soft md:grid-cols-2"
                    style={{ borderRightColor: accent.main, background: `radial-gradient(70% 90% at 100% 0%, ${accent.tint} 0%, #fff 55%)` }}
                  >
                    {/* نجمة الجامعة بلون المحور تخرج من زاوية البطاقة */}
                    <svg aria-hidden viewBox={STAR_VIEWBOX} className="pointer-events-none absolute -bottom-24 -left-24 size-72">
                      <path d={STAR_PATH} fill={accent.main} fillOpacity={0.07} fillRule="evenodd" />
                    </svg>
                    {/* النص */}
                    <div className={`relative ${sImgs.length === 0 ? 'md:col-span-2' : ''}`}>
                      <span className="flex items-center gap-2 text-xs font-bold tracking-wide" style={{ color: accent.main }}>
                        <span
                          className="flex h-7 w-9 items-center justify-center rounded-l-lg rounded-r-sm text-[13px] text-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${accent.main}, ${accent.deep})` }}
                        >
                          {toArabic(i + 1)}
                        </span>
                        الجلسة {sessionOrdinal(i)}
                      </span>
                      <h3 className="mt-3 text-xl font-semibold" style={{ color: accent.deep }}>{sn.title}</h3>
                      <div className="mt-1.5 mb-3 h-1 w-14 rounded-full" style={{ background: `linear-gradient(to left, ${accent.main}, #B99C6B)` }} />
                      <div className="flex flex-wrap gap-3 text-sm text-muted">
                        {sn.presenter && <span>المقدّم: {sn.presenter}</span>}
                        {sn.time_label && <span dir="ltr">{sn.time_label}</span>}
                        {sn.session_date && <span>{formatArabicDate(sn.session_date)}</span>}
                      </div>
                      {sn.description ? (
                        <p className="mt-3 leading-loose text-[#2a302d]">{sn.description}</p>
                      ) : (
                        <p className="mt-3 leading-loose text-muted">جلسة ضمن محاور الدورة التدريبية.</p>
                      )}
                    </div>

                    {/* كل صور المحور (قابلة للتكبير) */}
                    {sImgs.length > 0 && (
                      <div className={`relative grid content-start gap-3 ${sImgs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {sImgs.map((m) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={m.id}
                            src={m.processed_url ?? m.thumbnail_url ?? ''}
                            alt={m.caption ?? sn.title}
                            onClick={() => setLightbox(images.findIndex((x) => x.id === m.id))}
                            className="h-auto w-full cursor-zoom-in rounded-2xl border border-secondary/30 object-cover transition-transform duration-300 hover:-translate-y-0.5"
                          />
                        ))}
                      </div>
                    )}
                  </motion.article>
                );
              })}
            </div>
          </Section>
        )}

        {/* صور من الدورة (غير المرتبطة بمحور) — بلا تكرار لصور المحاور */}
        {unassignedImages.length > 0 && (
          <Section id="gallery" title="صور من الدورة" tpl={tpl}>
            <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
              {unassignedImages.map((m) => (
                <motion.figure
                  key={m.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4 }}
                  className="group cursor-zoom-in overflow-hidden rounded-2xl border border-secondary/40 bg-surface p-2 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-md"
                  onClick={() => setLightbox(images.findIndex((x) => x.id === m.id))}
                >
                  <div className="overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.thumbnail_url ?? m.processed_url ?? ''}
                      alt={m.caption ?? ''}
                      loading="lazy"
                      className="w-full transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  {m.caption && (
                    <figcaption className="px-1 pb-1 pt-3 text-center">
                      <span className="mx-auto mb-2 block h-0.5 w-8 rounded-full bg-secondary" />
                      <span className="text-sm font-medium text-primary">{m.caption}</span>
                    </figcaption>
                  )}
                </motion.figure>
              ))}
            </div>
          </Section>
        )}

        {/* قسم الفيديوهات */}
        {videos.length > 0 && (
          <Section id="videos" title="الفيديوهات" tpl={tpl}>
            <div className="grid gap-6 sm:grid-cols-2">
              {videos.map((v) => (
                <div key={v.id} className="overflow-hidden rounded-2xl bg-surface shadow-soft">
                  <video controls poster={v.thumbnail_url ?? undefined} preload="none" className="aspect-video w-full bg-black">
                    <source src={v.processed_url ?? ''} type="video/mp4" />
                  </video>
                  {v.caption && <p className="p-3 text-sm text-muted">{v.caption}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* قسم المدربين */}
        {course.trainer_names.length > 0 && (
          <Section id="trainers" title="المدربون" tpl={tpl}>
            <div className="flex flex-wrap gap-3">
              {course.trainer_names.map((name) => (
                <span key={name} className="inline-flex items-center gap-2 rounded-2xl bg-surface px-4 py-2.5 shadow-soft">
                  <Users className="size-5 text-secondary" /> <span className="font-medium text-primary">{name}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* مُعِدّ المجلة (المنسق المسؤول) */}
        {data.coordinator && (
          <Section id="editor" title="إعداد المجلة" tpl={tpl}>
            <div className="flex items-center gap-5 rounded-3xl border border-secondary/30 bg-surface p-6 shadow-soft">
              {data.coordinator.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.coordinator.avatar_url}
                  alt={data.coordinator.full_name}
                  className="size-24 shrink-0 rounded-full border-2 border-secondary/50 object-cover"
                />
              ) : (
                <span className="flex size-24 shrink-0 items-center justify-center rounded-full border-2 border-secondary/40 bg-background">
                  <Users className="size-10 text-secondary" />
                </span>
              )}
              <div>
                <p className="text-xl font-semibold text-primary">{data.coordinator.full_name}</p>
                <div className="mt-1 mb-2 h-1 w-12 rounded-full bg-secondary" />
                <p className="text-muted">
                  {data.coordinator.job_title || 'منسّق الدورة'}
                </p>
                <p className="mt-1 text-sm text-muted">إدارة عمليات التدريب · جامعة نايف العربية للعلوم الأمنية</p>
              </div>
            </div>
          </Section>
        )}

        {/* خاتمة */}
        <footer className="mt-16 rounded-2xl bg-primary p-10 text-center text-white">
          <div className="mx-auto mb-6 flex w-fit items-center gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nauss-white.png" alt="جامعة نايف" className="h-14 object-contain" />
            {course.show_partnership_logo && (
              <>
                <span className="h-12 w-px bg-white/30" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-moi-white.png" alt="برامج الشراكات الدولية" className="h-14 object-contain" />
              </>
            )}
          </div>
          <div className={cn('mx-auto mb-3 h-1 w-16 rounded-full', tpl.accent)} />
          <p className="text-lg font-semibold">إدارة عمليات التدريب</p>
          <p className="mt-1 text-sm text-white/80">وكالة الجامعة للتدريب</p>
          <p className="mt-0.5 text-sm text-white/70">جامعة نايف العربية للعلوم الأمنية</p>
        </footer>
      </main>

      {/* Lightbox */}
      {lightbox !== null && images[lightbox] && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="إغلاق">
            <X className="size-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[lightbox].processed_url ?? ''}
            alt={images[lightbox].caption ?? ''}
            className="max-h-[90vh] max-w-full rounded-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  tpl,
  children,
}: {
  id: string;
  title: string;
  tpl: (typeof TEMPLATES)[keyof typeof TEMPLATES];
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-10">
      <h2 className={cn('mb-6 text-2xl font-semibold', tpl.sectionTitle)}>{title}</h2>
      {children}
    </section>
  );
}
