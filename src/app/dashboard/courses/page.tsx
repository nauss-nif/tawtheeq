import Link from 'next/link';
import { Plus, BookOpen, SearchX } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { CourseCard } from '@/features/courses/CourseCard';
import { CourseFilters } from '@/features/courses/CourseFilters';
import { loadCourseCards } from '@/features/courses/cardData';
import { SectionHeader } from '@/features/dashboard/DashboardHero';
import { Button } from '@/components/ui/Button';
import type { Course } from '@/lib/database.types';

export const metadata = { title: 'دوراتي | توثيق' };

export default async function CoursesPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const { userId } = await requireProfile();
  const supabase = createClient();
  const q = searchParams.q?.trim() || undefined;
  const status = ['published', 'draft', 'archived'].includes(searchParams.status ?? '') ? searchParams.status : undefined;

  const { count: totalCount } = await supabase
    .from('courses')
    .select('id', { count: 'exact', head: true })
    .eq('coordinator_id', userId);

  let query = supabase.from('courses').select('*').eq('coordinator_id', userId).order('created_at', { ascending: false });
  if (q) query = query.ilike('title', `%${q}%`);
  if (status) query = query.eq('status', status as Course['status']);
  const { data } = await query;
  const courses = (data ?? []) as Course[];
  const cards = await loadCourseCards(supabase, courses);

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeader
        title="دوراتي"
        count={totalCount ?? 0}
        action={
          <Link href="/dashboard/courses/new">
            <Button>
              <Plus className="size-5" />
              دورة جديدة
            </Button>
          </Link>
        }
      />

      {(totalCount ?? 0) > 0 && <CourseFilters basePath="/dashboard/courses" q={q} status={status} />}

      {courses.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              coverUrl={cards.get(course.id)?.coverUrl}
              imageCount={cards.get(course.id)?.imageCount}
              manageHref={`/dashboard/courses/${course.id}`}
            />
          ))}
        </div>
      ) : (totalCount ?? 0) > 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-12 text-center shadow-soft">
          <SearchX className="size-10 text-muted/50" />
          <p className="text-muted">لا توجد دورات مطابقة للبحث.</p>
          <Link href="/dashboard/courses" className="text-sm font-medium text-state-info hover:underline">عرض كل الدورات</Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface p-16 text-center shadow-soft">
          <BookOpen className="size-12 text-muted/40" />
          <p className="text-muted">لا توجد دورات بعد. ابدأ بإنشاء دورتك الأولى.</p>
          <Link href="/dashboard/courses/new">
            <Button>
              <Plus className="size-5" />
              إنشاء دورة
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
