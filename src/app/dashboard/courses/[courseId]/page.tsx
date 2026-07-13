import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { publicEnv } from '@/lib/env';
import { StatusBadge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { CourseForm } from '@/features/courses/CourseForm';
import { CourseTabs } from '@/features/courses/CourseTabs';
import { PublishPanel } from '@/features/courses/PublishPanel';
import { MediaUploader } from '@/features/media/MediaUploader';
import { MediaGrid } from '@/features/media/MediaGrid';
import { SessionsManager } from '@/features/sessions/SessionsManager';

export default async function CourseDetailPage({ params }: { params: { courseId: string } }) {
  await requireProfile();
  const supabase = createClient();

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', params.courseId)
    .single();
  if (!course) notFound();

  const { data: media } = await supabase
    .from('media')
    .select('*')
    .eq('course_id', course.id)
    .order('sort_order', { ascending: true });

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('course_id', course.id)
    .order('sort_order', { ascending: true });

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/courses" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
        <ArrowRight className="size-4" /> العودة للدورات
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <h1 className="heading-accent text-2xl font-semibold text-primary">{course.title}</h1>
        <StatusBadge status={course.status} />
      </div>

      <CourseTabs
        details={<CourseForm course={course} />}
        media={
          <div className="flex flex-col gap-6">
            <Card className="flex flex-col gap-4">
              <CardTitle>رفع الوسائط</CardTitle>
              <MediaUploader courseId={course.id} />
            </Card>
            <Card className="flex flex-col gap-4">
              <CardTitle>معرض الوسائط</CardTitle>
              <MediaGrid courseId={course.id} initial={media ?? []} />
            </Card>
          </div>
        }
        sessions={<SessionsManager courseId={course.id} initial={sessions ?? []} />}
        magazine={
          <div className="flex flex-col gap-6">
            <PublishPanel course={course} siteUrl={publicEnv.siteUrl} />
            <Card className="flex flex-col gap-2">
              <CardTitle>معاينة المجلة</CardTitle>
              <p className="text-sm text-muted">
                القالب الحالي: <span className="font-medium text-primary">{course.template_id}</span>. يمكنك تغييره من تبويب البيانات.
              </p>
              {course.magazine_slug && (
                <Link
                  href={`/m/${course.magazine_slug}`}
                  target="_blank"
                  className="w-fit text-sm font-medium text-state-info hover:underline"
                >
                  فتح المجلة في نافذة جديدة ↗
                </Link>
              )}
            </Card>
          </div>
        }
      />
    </div>
  );
}
