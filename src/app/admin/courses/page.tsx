import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { CourseCard } from '@/features/courses/CourseCard';
import { CourseFilters } from '@/features/courses/CourseFilters';
import { loadCourseCards } from '@/features/courses/cardData';
import { SectionHeader } from '@/features/dashboard/DashboardHero';
import type { Course, Profile } from '@/lib/database.types';

export const metadata = { title: 'كل الدورات | الإدارة' };

export default async function AdminCoursesPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  await requireProfile();
  const supabase = createClient();
  const q = searchParams.q?.trim() || undefined;
  const status = ['published', 'draft', 'archived'].includes(searchParams.status ?? '') ? searchParams.status : undefined;

  const { count: totalCount } = await supabase.from('courses').select('id', { count: 'exact', head: true });

  let query = supabase.from('courses').select('*').order('created_at', { ascending: false });
  if (q) query = query.ilike('title', `%${q}%`);
  if (status) query = query.eq('status', status as Course['status']);
  const { data } = await query;
  const courses = (data ?? []) as Course[];

  const [cards, { data: profiles }] = await Promise.all([
    loadCourseCards(supabase, courses),
    supabase.from('profiles').select('id, full_name'),
  ]);
  const nameMap = new Map(((profiles as Pick<Profile, 'id' | 'full_name'>[]) ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeader title="كل الدورات" count={totalCount ?? 0} />
      <CourseFilters basePath="/admin/courses" q={q} status={status} />

      {courses.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              coverUrl={cards.get(c.id)?.coverUrl}
              imageCount={cards.get(c.id)?.imageCount}
              coordinatorName={nameMap.get(c.coordinator_id) ?? '—'}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-12 text-center shadow-soft">
          <SearchX className="size-10 text-muted/50" />
          <p className="text-muted">{q || status ? 'لا توجد دورات مطابقة للبحث.' : 'لا توجد دورات بعد.'}</p>
          {(q || status) && (
            <Link href="/admin/courses" className="text-sm font-medium text-state-info hover:underline">عرض كل الدورات</Link>
          )}
        </div>
      )}
    </div>
  );
}
