'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Star, Trash2, GripVertical, Loader2, CheckCircle2, XCircle,
  CloudUpload, AlertTriangle, Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn, compressionRatio, formatBytes } from '@/lib/utils';
import type { Media } from '@/lib/database.types';
import { setCoverAction, updateCaptionAction, deleteMediaAction, reorderMediaAction } from './actions';

/**
 * شبكة الوسائط: إعادة ترتيب بالسحب، تحديد الغلاف، تعليقات،
 * ومتابعة حالة المعالجة/الأرشفة لحظيًا عبر Supabase Realtime.
 */
export function MediaGrid({ courseId, initial }: { courseId: string; initial: Media[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Media[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => setItems(initial), [initial]);

  // اشتراك لحظي بتغييرات وسائط هذه الدورة
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`media-${courseId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'media', filter: `course_id=eq.${courseId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId, router]);

  async function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = items.findIndex((m) => m.id === dragId);
    const to = items.findIndex((m) => m.id === targetId);
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setDragId(null);
    await reorderMediaAction(courseId, next.map((m) => m.id));
  }

  if (items.length === 0)
    return <p className="py-8 text-center text-muted">لم تُرفع أي وسائط بعد.</p>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((m) => (
        <div
          key={m.id}
          draggable
          onDragStart={() => setDragId(m.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(m.id)}
          className={cn(
            'group relative flex flex-col overflow-hidden rounded-2xl bg-surface shadow-soft',
            m.is_cover && 'ring-2 ring-secondary',
            m.is_low_quality && 'opacity-80',
          )}
        >
          <div className="relative aspect-square bg-background">
            {m.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.thumbnail_url} alt={m.caption ?? ''} className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-muted/40">
                {m.type === 'video' ? <Film className="size-8" /> : <Loader2 className="size-6 animate-spin" />}
              </div>
            )}

            {/* مقبض السحب */}
            <span className="absolute right-1 top-1 rounded-lg bg-black/40 p-1 text-white opacity-0 transition group-hover:opacity-100">
              <GripVertical className="size-4" />
            </span>

            {/* شارات الحالة */}
            <div className="absolute bottom-1 left-1 flex gap-1">
              <ProcessBadge status={m.processing_status} />
              <ArchiveBadge status={m.archive_status} />
              {m.is_low_quality && (
                <span title="جودة منخفضة (مستبعدة من الاقتراح)" className="rounded-md bg-state-warning/90 p-0.5 text-white">
                  <AlertTriangle className="size-3.5" />
                </span>
              )}
            </div>

            {m.is_cover && (
              <span className="absolute right-1 top-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-white">
                الغلاف
              </span>
            )}
          </div>

          {/* تعليق + نسبة التوفير */}
          <div className="flex flex-col gap-1 p-2">
            <input
              defaultValue={m.caption ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (m.caption ?? ''))
                  updateCaptionAction(courseId, m.id, e.target.value);
              }}
              placeholder="أضف تعليقًا…"
              className="w-full rounded-lg border border-transparent bg-background px-2 py-1 text-xs focus:border-primary/30"
            />
            {m.compressed_size != null && m.original_size != null && (
              <span className="text-[10px] text-muted">
                {formatBytes(m.compressed_size)} · وفّر {compressionRatio(m.original_size, m.compressed_size)}%
              </span>
            )}
            <div className="flex gap-1">
              <button
                onClick={() => setCoverAction(courseId, m.id)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1 text-[11px] text-primary hover:bg-primary/5"
              >
                <Star className={cn('size-3.5', m.is_cover && 'fill-secondary text-secondary')} /> غلاف
              </button>
              <button
                onClick={async () => {
                  await deleteMediaAction(courseId, m.id);
                  toast.success('تم الحذف');
                }}
                className="flex items-center justify-center rounded-lg px-2 py-1 text-state-danger hover:bg-state-danger/10"
                aria-label="حذف"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProcessBadge({ status }: { status: Media['processing_status'] }) {
  if (status === 'done') return <span className="rounded-md bg-primary/90 p-0.5 text-white" title="اكتملت المعالجة"><CheckCircle2 className="size-3.5" /></span>;
  if (status === 'failed') return <span className="rounded-md bg-state-danger/90 p-0.5 text-white" title="فشلت المعالجة"><XCircle className="size-3.5" /></span>;
  return <span className="rounded-md bg-state-warning/90 p-0.5 text-white" title="قيد المعالجة"><Loader2 className="size-3.5 animate-spin" /></span>;
}

function ArchiveBadge({ status }: { status: Media['archive_status'] }) {
  if (status === 'archived') return <span className="rounded-md bg-chart-navy/90 p-0.5 text-white" title="مؤرشف في SharePoint"><CloudUpload className="size-3.5" /></span>;
  if (status === 'failed') return <span className="rounded-md bg-state-danger/70 p-0.5 text-white" title="فشلت الأرشفة"><CloudUpload className="size-3.5" /></span>;
  return null;
}
