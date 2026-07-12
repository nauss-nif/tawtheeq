import Link from 'next/link';
import { BookOpen, Eye, Upload, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export const metadata = { title: 'الرئيسية | توثيق' };

export default async function DashboardHome() {
  const { userId, profile } = await requireProfile();
  const supabase = createClient();

  const { data: courses } = await supabase
    .from('courses')
    .select('status, views_count')
    .eq('coordinator_id', userId);

  const total = courses?.length ?? 0;
  const published = courses?.filter((c) => c.status === 'published').length ?? 0;
  const views = courses?.reduce((s, c) => s + (c.views_count ?? 0), 0) ?? 0;

  const stats = [
    { label: 'إجمالي الدورات', value: total, icon: BookOpen },
    { label: 'مجلات منشورة', value: published, icon: Upload },
    { label: 'إجمالي المشاهدات', value: views, icon: Eye },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="heading-accent text-2xl font-semibold text-primary">
          مرحبًا، {profile.full_name}
        </h1>
        <p className="mt-3 text-muted">نظرة سريعة على نشاطك في المنصة.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/8">
              <s.icon className="size-6 text-primary" />
            </div>
            <div>
              <div className="stat-number text-3xl">{s.value.toLocaleString('ar')}</div>
              <div className="text-sm text-muted">{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/dashboard/courses/new">
          <Button>
            <Plus className="size-5" /> دورة جديدة
          </Button>
        </Link>
        <Link href="/dashboard/courses">
          <Button variant="ghost">عرض كل الدورات</Button>
        </Link>
      </div>
    </div>
  );
}
