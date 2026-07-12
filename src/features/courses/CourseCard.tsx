import Link from 'next/link';
import { Calendar, Eye, ImageOff } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { formatArabicDate } from '@/lib/utils';
import type { Course } from '@/lib/database.types';

/** بطاقة دورة مع صورة الغلاف والحالة */
export function CourseCard({ course, coverUrl }: { course: Course; coverUrl?: string | null }) {
  return (
    <Link
      href={`/dashboard/courses/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-surface shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft-md"
    >
      <div className="relative aspect-video overflow-hidden bg-background">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={course.title}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted/50">
            <ImageOff className="size-10" />
          </div>
        )}
        <div className="absolute right-3 top-3">
          <StatusBadge status={course.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 font-semibold text-primary">{course.title}</h3>
        {course.start_date && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Calendar className="size-4" />
            {formatArabicDate(course.start_date)}
          </p>
        )}
        {course.status === 'published' && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Eye className="size-4" />
            {course.views_count.toLocaleString('ar')} مشاهدة
          </p>
        )}
      </div>
    </Link>
  );
}
