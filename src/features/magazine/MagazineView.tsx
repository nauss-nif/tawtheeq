'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { X, BookOpen, LayoutGrid, Download, Play, MapPin, Calendar, Users } from 'lucide-react';
import { cn, formatArabicDate } from '@/lib/utils';
import { TEMPLATES } from './templates';
import type { MagazineData } from './data';
import { Flipbook } from './Flipbook';

const NAV = [
  { id: 'intro', label: 'تعريف' },
  { id: 'sessions', label: 'الجلسات' },
  { id: 'gallery', label: 'المعرض' },
  { id: 'videos', label: 'الفيديو' },
  { id: 'trainers', label: 'المدربون' },
];

export function MagazineView({ data, siteUrl }: { data: MagazineData; siteUrl: string }) {
  const { course, cover, images, videos, sessions, landmarkUrl } = data;
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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          {/* العنوان + الشعارات (شفافة، مع فاصل خفيف) */}
          <div className="flex items-center gap-3">
            <span className={cn('max-w-[36vw] truncate font-semibold', scrolled ? 'text-white' : 'text-white drop-shadow')}>
              {course.title}
            </span>
            <div className="hidden items-center gap-2.5 sm:flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-nauss-white.png" alt="جامعة نايف" className="h-8 object-contain drop-shadow" />
              {course.show_partnership_logo && (
                <>
                  <span className="h-6 w-px bg-white/30" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-moi-white.png" alt="برامج الشراكات الدولية" className="h-8 object-contain drop-shadow" />
                </>
              )}
            </div>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-sm transition-colors',
                  scrolled ? 'text-white/90 hover:bg-white/10' : 'text-white/90 hover:bg-black/20',
                )}
              >
                {n.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFlip(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5 text-sm font-medium text-white hover:brightness-95"
            >
              <BookOpen className="size-4" /> <span className="hidden sm:inline">تقليب</span>
            </button>
            <a
              href={`/m/${course.magazine_slug}/pdf`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25"
            >
              <Download className="size-4" /> <span className="hidden sm:inline">PDF</span>
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
          <p className="mb-2 text-sm font-medium text-secondary">برامج الشراكات الدولية</p>
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
        {/* قسم تعريفي */}
        {course.description && (
          <Section id="intro" title="عن الدورة" tpl={tpl}>
            <p className="whitespace-pre-line text-lg leading-loose text-[#2a302d]">{course.description}</p>
          </Section>
        )}

        {/* الجدول الزمني والجلسات */}
        {sessions.length > 0 && (
          <Section id="sessions" title="الجدول الزمني" tpl={tpl}>
            <div className="flex flex-col gap-4">
              {sessions.map((sn) => (
                <motion.div
                  key={sn.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4 }}
                  className="relative rounded-2xl border border-secondary/30 bg-surface p-5 shadow-soft"
                >
                  {/* شريط جانبي ذهبي */}
                  <span className="absolute inset-y-4 right-0 w-1 rounded-full bg-secondary" />
                  <div className="flex flex-wrap items-center gap-3">
                    {sn.time_label && (
                      <span dir="ltr" className="rounded-lg bg-primary/8 px-2.5 py-1 text-sm font-medium text-primary">
                        {sn.time_label}
                      </span>
                    )}
                    <h3 className="text-lg font-semibold text-primary">{sn.title}</h3>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted">
                    {sn.presenter && <span>المقدّم: {sn.presenter}</span>}
                    {sn.session_date && <span>{formatArabicDate(sn.session_date)}</span>}
                  </div>
                  {sn.description && (
                    <p className="mt-3 leading-loose text-[#2a302d]">{sn.description}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </Section>
        )}

        {/* معرض الصور */}
        {images.length > 0 && (
          <Section id="gallery" title="معرض الصور" tpl={tpl}>
            <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
              {images.map((m, i) => (
                <motion.figure
                  key={m.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4 }}
                  className="group cursor-zoom-in overflow-hidden rounded-2xl border border-secondary/40 bg-surface p-2 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-md"
                  onClick={() => setLightbox(i)}
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
