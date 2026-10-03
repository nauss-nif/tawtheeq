import Link from 'next/link';
import { BookOpen, Eye, HardDrive, Gauge, CloudUpload, Users, ArrowLeft, UserCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { StatCard } from '@/features/admin/StatCard';
import { PendingApprovals } from '@/features/admin/PendingApprovals';
import { CourseCard } from '@/features/courses/CourseCard';
import { loadCourseCards } from '@/features/courses/cardData';
import { DashboardHero, SectionHeader } from '@/features/dashboard/DashboardHero';
import { Card, CardTitle } from '@/components/ui/Card';
import { formatBytes, compressionRatio } from '@/lib/utils';
import type { Course, Profile } from '@/lib/database.types';
import { toArabicDigits } from '@/lib/text';

export const metadata = { title: 'لوحة الإدارة | توثيق' };

interface Stats {
  courses_total: number;
  courses_published: number;
  views_total: number;
  coordinators_pending: number;
  coordinators_active: number;
  storage_current: number;
  storage_original: number;
  storage_compressed: number;
  archive_pending: number;
  archive_done: number;
  archive_failed: number;
}

/** عدد أحدث المجلات المعروضة في لوحة الإدارة */
const LATEST = 6;

export default async function AdminHome() {
  const { profile } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase.rpc('admin_stats');
  const s = (data ?? {}) as unknown as Stats;

  // طلبات الاعتماد (المدير يقرأ كل الملفات عبر RLS)
  const { data: pending } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'coordinator')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  // أحدث المجلات من كل المنسقين
  const { data: latestData } = await supabase
    .from('courses')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(LATEST);
  const latest = (latestData ?? []) as Course[];
  const cards = await loadCourseCards(supabase, latest);
  const { data: names } = latest.length
    ? await supabase.from('profiles').select('id, full_name').in('id', [...new Set(latest.map((c) => c.coordinator_id))])
    : { data: [] };
  const nameMap = new Map((names ?? []).map((p) => [p.id, p.full_name]));

  const ratio = compressionRatio(s.storage_original, s.storage_compressed);
  const pendingCount = pending?.length ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <DashboardHero
        kicker="لوحة الإدارة"
        title={`أهلًا ${profile.full_name.split(' ')[0]}`}
        subtitle="نظرة شاملة على الدورات والمجلات والمنسقين ومساحة التخزين."
        actions={
          <>
            <Link
              href="/admin/courses"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-secondary px-5 font-medium text-white shadow-soft transition hover:brightness-95"
            >
              <BookOpen className="size-5" /> كل الدورات
            </Link>
            <Link
              href="/admin/users"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white/15 px-5 font-medium text-white transition hover:bg-white/25"
            >
              <Users className="size-5" /> المنسقون
              {pendingCount > 0 && (
                <span className="rounded-full bg-state-warning px-2 text-xs font-bold text-white">{toArabicDigits(pendingCount)}</span>
              )}
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="إجمالي الدورات" value={s.courses_total ?? 0} sub={`${toArabicDigits(s.courses_published ?? 0)} منشورة`} icon={BookOpen} />
        <StatCard label="إجمالي المشاهدات" value={s.views_total ?? 0} icon={Eye} tone="info" />
        <StatCard label="المنسقون المفعّلون" value={s.coordinators_active ?? 0} sub={`${toArabicDigits(s.coordinators_pending ?? 0)} بانتظار الاعتماد`} icon={UserCheck} tone="navy" />
        <StatCard label="المساحة المستخدمة" value={formatBytes(s.storage_current)} sub={`الأصل: ${formatBytes(s.storage_original)}`} icon={HardDrive} />
        <StatCard label="نسبة الضغط الكلية" value={`${toArabicDigits(ratio)}٪`} sub="توفير في الحجم" icon={Gauge} tone="warning" />
        <StatCard label="الأرشفة في SharePoint" value={s.archive_done ?? 0} sub={`${toArabicDigits(s.archive_pending ?? 0)} بالانتظار · ${toArabicDigits(s.archive_failed ?? 0)} فشل`} icon={CloudUpload} tone="navy" />
      </div>

      {pendingCount > 0 && <PendingApprovals pending={(pending as Profile[]) ?? []} />}

      <section>
        <SectionHeader
          title="أحدث المجلات"
          action={
            <Link href="/admin/courses" className="inline-flex items-center gap-1 text-sm font-medium text-state-info hover:underline">
              عرض كل الدورات <ArrowLeft className="size-4" />
            </Link>
          }
        />
        {latest.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                coverUrl={cards.get(c.id)?.coverUrl}
                imageCount={cards.get(c.id)?.imageCount}
                coordinatorName={nameMap.get(c.coordinator_id)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-surface p-10 text-center text-muted shadow-soft">لا توجد دورات بعد.</p>
        )}
      </section>

      {pendingCount === 0 && <PendingApprovals pending={[]} />}

      <Card>
        <CardTitle>حالة أرشفة SharePoint</CardTitle>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-xl bg-primary/8 px-3 py-2 text-primary">مؤرشف: {s.archive_done ?? 0}</span>
          <span className="rounded-xl bg-state-warning/15 px-3 py-2 text-state-warning">بالانتظار: {s.archive_pending ?? 0}</span>
          <span className="rounded-xl bg-state-danger/12 px-3 py-2 text-state-danger">فشل: {s.archive_failed ?? 0}</span>
        </div>
      </Card>
    </div>
  );
}
