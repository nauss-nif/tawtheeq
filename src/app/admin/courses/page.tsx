import Link from 'next/link';
import { Eye, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatArabicDate } from '@/lib/utils';
import type { Course, Profile } from '@/lib/database.types';

export const metadata = { title: 'كل الدورات | الإدارة' };

export default async function AdminCoursesPage() {
  await requireProfile();
  const supabase = createClient();

  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: profiles } = await supabase.from('profiles').select('id, full_name');
  const nameMap = new Map((profiles as Pick<Profile, 'id' | 'full_name'>[] ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="heading-accent mb-6 text-2xl font-semibold text-primary">كل الدورات</h1>
      <Card>
        <CardTitle>الدورات ({courses?.length ?? 0})</CardTitle>
        <ul className="mt-4 flex flex-col divide-y divide-muted/10">
          {(courses as Course[] ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-primary">{c.title}</p>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-sm text-muted">
                  {nameMap.get(c.coordinator_id) ?? '—'} · {formatArabicDate(c.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="size-4" /> {c.views_count.toLocaleString('ar')}
                </span>
                {c.magazine_slug && c.status === 'published' && (
                  <Link href={`/m/${c.magazine_slug}`} target="_blank" className="inline-flex items-center gap-1 text-state-info hover:underline">
                    <ExternalLink className="size-4" /> المجلة
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
