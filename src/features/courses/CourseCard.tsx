import Link from 'next/link';
import { Calendar, Eye, ImageOff, Images, MapPin, Settings2, ExternalLink, BookOpen, User } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDateRange, toArabicDigits } from '@/lib/text';
import type { Course } from '@/lib/database.types';

/**
 * بطاقة مجلة/دورة: الغلاف والحالة والمعلومات الأساسية، مع أزرار وصول مباشر
 * (إدارة الدورة، فتح المجلة، المجلة المتقلبة). تُستخدم في لوحتي المنسق والمدير.
 */
export function CourseCard({
  course,
  coverUrl,
  imageCount,
  coordinatorName,
  manageHref,
}: {
  course: Course;
  coverUrl?: string | null;
  imageCount?: number;
  /** اسم المنسق (في لوحة المدير) */
  coordinatorName?: string;
  /** رابط إدارة الدورة؛ بدونه لا يظهر زر الإدارة (لوحة المدير) */
  manageHref?: string;
}) {
  const published = course.status === 'published' && course.magazine_slug;
  const dates = formatDateRange(course.start_date, course.end_date);
  const primaryHref = manageHref ?? (published ? `/m/${course.magazine_slug}` : undefined);

  const cover = (
    <div className="relative aspect-[16/10] overflow-hidden bg-background">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt={course.title}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-muted/50">
          <ImageOff className="size-9" />
          <span className="text-xs">لا توجد صور بعد</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
      <div className="absolute right-3 top-3">
        <StatusBadge status={course.status} className="bg-white/95 shadow-sm" />
      </div>
      {imageCount !== undefined && (
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
          <Images className="size-3.5" /> {toArabicDigits(imageCount)}
        </span>
      )}
    </div>
  );

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-muted/10 bg-surface shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft-md">
      {primaryHref ? (
        <Link href={primaryHref} target={manageHref ? undefined : '_blank'} aria-label={course.title}>
          {cover}
        </Link>
      ) : (
        cover
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 min-h-[3rem] font-semibold leading-snug text-primary">
          {primaryHref ? (
            <Link href={primaryHref} target={manageHref ? undefined : '_blank'} className="hover:underline">
              {course.title}
            </Link>
          ) : (
            course.title
          )}
        </h3>
        <div className="flex flex-col gap-1 text-[13px] text-muted">
          {coordinatorName && (
            <span className="flex items-center gap-1.5"><User className="size-3.5 shrink-0" /> {coordinatorName}</span>
          )}
          {dates && (
            <span className="flex items-center gap-1.5"><Calendar className="size-3.5 shrink-0" /> {dates}</span>
          )}
          {course.location && (
            <span className="flex items-center gap-1.5"><MapPin className="size-3.5 shrink-0" /> <span className="truncate">{course.location}</span></span>
          )}
          {published && (
            <span className="flex items-center gap-1.5"><Eye className="size-3.5 shrink-0" /> {toArabicDigits(course.views_count)} مشاهدة</span>
          )}
        </div>

        {/* أزرار الوصول المباشر */}
        <div className="mt-auto flex flex-wrap gap-2 border-t border-muted/10 pt-3">
          {manageHref && (
            <Link
              href={manageHref}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white transition hover:bg-primary-dark"
            >
              <Settings2 className="size-3.5" /> إدارة الدورة
            </Link>
          )}
          {published ? (
            <>
              <Link
                href={`/m/${course.magazine_slug}`}
                target="_blank"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/8 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/15"
              >
                <ExternalLink className="size-3.5" /> المجلة
              </Link>
              <Link
                href={`/m/${course.magazine_slug}/flip`}
                target="_blank"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-secondary/15 px-3 py-2 text-xs font-medium text-[#7a6338] transition hover:bg-secondary/25"
                title="المجلة المتقلبة"
              >
                <BookOpen className="size-3.5" /> تقليب
              </Link>
            </>
          ) : (
            !manageHref && <span className="py-2 text-xs text-muted">لم تُنشر المجلة بعد</span>
          )}
        </div>
      </div>
    </article>
  );
}
