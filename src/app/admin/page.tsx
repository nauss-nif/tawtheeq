import { BookOpen, Eye, HardDrive, Gauge, CloudUpload, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { StatCard } from '@/features/admin/StatCard';
import { PendingApprovals } from '@/features/admin/PendingApprovals';
import { Card, CardTitle } from '@/components/ui/Card';
import { formatBytes, compressionRatio } from '@/lib/utils';
import type { Profile } from '@/lib/database.types';

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

export default async function AdminHome() {
  await requireProfile();
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

  const ratio = compressionRatio(s.storage_original, s.storage_compressed);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="heading-accent mb-6 text-2xl font-semibold text-primary">لوحة الإدارة</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="إجمالي الدورات" value={s.courses_total ?? 0} sub={`${s.courses_published ?? 0} منشورة`} icon={BookOpen} />
        <StatCard label="إجمالي المشاهدات" value={s.views_total ?? 0} icon={Eye} tone="info" />
        <StatCard label="المنسقون المفعّلون" value={s.coordinators_active ?? 0} sub={`${s.coordinators_pending ?? 0} بانتظار الاعتماد`} icon={Users} tone="navy" />
        <StatCard label="المساحة المستخدمة" value={formatBytes(s.storage_current)} sub={`الأصل: ${formatBytes(s.storage_original)}`} icon={HardDrive} />
        <StatCard label="نسبة الضغط الكلية" value={`${ratio}%`} sub="توفير في الحجم" icon={Gauge} tone="warning" />
        <StatCard label="الأرشفة في SharePoint" value={s.archive_done ?? 0} sub={`${s.archive_pending ?? 0} بالانتظار · ${s.archive_failed ?? 0} فشل`} icon={CloudUpload} tone="navy" />
      </div>

      <div className="mt-8">
        <PendingApprovals pending={(pending as Profile[]) ?? []} />
      </div>

      <div className="mt-8">
        <Card>
          <CardTitle>حالة أرشفة SharePoint</CardTitle>
          <div className="mt-4 flex gap-4 text-sm">
            <span className="rounded-xl bg-primary/8 px-3 py-2 text-primary">مؤرشف: {s.archive_done ?? 0}</span>
            <span className="rounded-xl bg-state-warning/15 px-3 py-2 text-state-warning">بالانتظار: {s.archive_pending ?? 0}</span>
            <span className="rounded-xl bg-state-danger/12 px-3 py-2 text-state-danger">فشل: {s.archive_failed ?? 0}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
