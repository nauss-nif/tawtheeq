import Link from 'next/link';
import { Plus, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { CourseCard } from '@/features/courses/CourseCard';
import { Button } from '@/components/ui/Button';

export const metadata = { title: 'دوراتي | توثيق' };

export default async function CoursesPage() {
  const { userId } = await requireProfile();
  const supabase = createClient();

  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .eq('coordinator_id', userId)
    .order('created_at', { ascending: false });

  // جلب صور الأغلفة (صورة is_cover لكل دورة)
  const ids = (courses ?? []).map((c) => c.id);
  const { data: covers } = ids.length
    ? await supabase
        .from('media')
        .select('course_id, thumbnail_url, processed_url')
        .in('course_id', ids)
        .eq('is_cover', true)
    : { data: [] };

  const coverMap = new Map(
    (covers ?? []).map((m) => [m.course_id, m.thumbnail_url ?? m.processed_url]),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="heading-accent text-2xl font-semibold text-primary">دوراتي</h1>
        <Link href="/dashboard/courses/new">
          <Button>
            <Plus className="size-5" />
            دورة جديدة
          </Button>
        </Link>
      </div>

      {courses && courses.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} coverUrl={coverMap.get(course.id)} />
          ))}
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
