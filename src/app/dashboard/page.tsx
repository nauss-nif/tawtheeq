import Link from 'next/link';
import { BookOpen, Eye, Upload, Plus, FilePen, ArrowLeft, Images, Send, FolderPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { StatCard } from '@/features/admin/StatCard';
import { CourseCard } from '@/features/courses/CourseCard';
import { loadCourseCards } from '@/features/courses/cardData';
import { DashboardHero, SectionHeader } from '@/features/dashboard/DashboardHero';
import type { Course } from '@/lib/database.types';
import { toArabicDigits } from '@/lib/text';

export const metadata = { title: 'الرئيسية | توثيق' };

/** عدد البطاقات المعروضة في لوحة المعلومات قبل رابط «عرض الكل» */
const SHOWN = 9;

const STEPS = [
  { icon: FolderPlus, title: 'أنشئ الدورة', text: 'العنوان والتواريخ والمدربون والمحاور' },
  { icon: Images, title: 'ارفع الصور', text: 'واربط كل صورة بمحورها' },
  { icon: Send, title: 'انشر المجلة', text: 'وشارك رابطها أو نزّلها PDF' },
];

export default async function DashboardHome() {
  const { userId, profile } = await requireProfile();
  const supabase = createClient();

  const { data } = await supabase
    .from('courses')
    .select('*')
    .eq('coordinator_id', userId)
    .order('updated_at', { ascending: false });
  const courses = (data ?? []) as Course[];

  const published = courses.filter((c) => c.status === 'published').length;
  const drafts = courses.filter((c) => c.status === 'draft').length;
  const views = courses.reduce((s, c) => s + (c.views_count ?? 0), 0);
  const cards = await loadCourseCards(supabase, courses.slice(0, SHOWN));
  const firstName = profile.full_name.split(' ')[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <DashboardHero
        kicker="لوحة المنسق"
        title={`أهلًا ${firstName}`}
        subtitle={
          courses.length
            ? 'مجلاتك كلها هنا. افتح أي دورة لإدارة صورها ومحاورها، أو شارك مجلتها مباشرة.'
            : 'ابدأ بإنشاء دورتك الأولى، وستتحول صورها إلى مجلة إلكترونية جاهزة للمشاركة.'
        }
        actions={
          <Link
            href="/dashboard/courses/new"
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-secondary px-5 font-medium text-white shadow-soft transition hover:brightness-95"
          >
            <Plus className="size-5" /> دورة جديدة
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="الدورات" value={courses.length} icon={BookOpen} />
        <StatCard label="مجلات منشورة" value={published} icon={Upload} tone="info" />
        <StatCard label="مسودات" value={drafts} icon={FilePen} tone="warning" />
        <StatCard label="المشاهدات" value={views} icon={Eye} tone="navy" />
      </div>

      {courses.length > 0 ? (
        <section>
          <SectionHeader
            title="مجلاتي"
            count={courses.length}
            action={
              courses.length > SHOWN && (
                <Link href="/dashboard/courses" className="inline-flex items-center gap-1 text-sm font-medium text-state-info hover:underline">
                  عرض كل الدورات <ArrowLeft className="size-4" />
                </Link>
              )
            }
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.slice(0, SHOWN).map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                coverUrl={cards.get(c.id)?.coverUrl}
                imageCount={cards.get(c.id)?.imageCount}
                manageHref={`/dashboard/courses/${c.id}`}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-secondary/40 bg-surface p-8 text-center sm:p-12">
          <h2 className="text-xl font-semibold text-primary">ثلاث خطوات لمجلتك الأولى</h2>
          <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl bg-background p-5">
                <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
                  <s.icon className="size-6" />
                </span>
                <p className="font-semibold text-primary">{toArabicDigits(i + 1)}. {s.title}</p>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </div>
            ))}
          </div>
          <Link
            href="/dashboard/courses/new"
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-6 font-medium text-white shadow-soft transition hover:bg-primary-dark"
          >
            <Plus className="size-5" /> إنشاء دورة
          </Link>
        </section>
      )}
    </div>
  );
}
