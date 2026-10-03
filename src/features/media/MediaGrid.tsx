'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Star, Trash2, GripVertical, Loader2, CheckCircle2, XCircle,
  CloudUpload, AlertTriangle, Film, Crown, Crop,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn, compressionRatio, formatBytes } from '@/lib/utils';
import type { Media, Session } from '@/lib/database.types';
import { ImageEditor } from './ImageEditor';
import {
  setCoverAction, updateCaptionAction, deleteMediaAction, reorderMediaAction,
  assignMediaSessionAction, autoAssignMediaAction, makeSessionMainAction,
} from './actions';

/**
 * شبكة الوسائط: إعادة ترتيب بالسحب، تحديد الغلاف، تعليقات،
 * ومتابعة حالة المعالجة/الأرشفة لحظيًا عبر Supabase Realtime.
 */
export function MediaGrid({
  courseId,
  initial,
  sessions = [],
}: {
  courseId: string;
  initial: Media[];
  sessions?: Session[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Media[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Media | null>(null); // الصورة قيد القص والتحسين

  useEffect(() => setItems(initial), [initial]);

  // اشتراك لحظي بتغييرات الوسائط — مع تجميع (debounce) لتفادي إعادة تحميل متكررة تُبطئ الصفحة
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 1500);
    };
    const channel = supabase
      .channel(`media-${courseId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'media', filter: `course_id=eq.${courseId}` },
        scheduleRefresh,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
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

  // الصورة الرئيسية لكل محور = الأقل ترتيبًا بين صوره
  const mainBySession = new Map<string, { id: string; so: number }>();
  for (const m of items) {
    if (!m.session_id) continue;
    const c = mainBySession.get(m.session_id);
    if (!c || m.sort_order < c.so) mainBySession.set(m.session_id, { id: m.id, so: m.sort_order });
  }

  return (
    <div className="flex flex-col gap-3">
    {sessions.length > 0 && (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-secondary/30 bg-background p-3">
        <p className="text-xs text-muted">
          اربط كل صورة بجلستها لتظهر بجانب عنوانها ووصفها في المجلة، أو وزّعها تلقائيًا.
        </p>
        <button
          onClick={async () => {
            const res = await autoAssignMediaAction(courseId);
            if (res?.error) toast.error(res.error);
            else toast.success(res?.success ?? 'تم التوزيع');
          }}
          className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-medium text-white hover:bg-secondary/90"
        >
          توزيع الصور على الجلسات تلقائيًا
        </button>
      </div>
    )}
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
              <img src={m.thumbnail_url} alt={m.caption ?? ''} className="size-full object-contain" />
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
            {m.type === 'image' && sessions.length > 0 && (
              <select
                value={m.session_id ?? ''}
                onChange={(e) => {
                  const sid = e.target.value || null;
                  // تحديث فوري للواجهة (تفاؤلي) حتى لا ترتدّ القائمة، ثم الحفظ في الخلفية
                  setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, session_id: sid } : x)));
                  assignMediaSessionAction(courseId, m.id, sid)
                    .then(() => toast.success(sid ? 'رُبطت الصورة بالجلسة' : 'أُلغي الربط'))
                    .catch(() => toast.error('تعذّر الحفظ، حاول مجددًا'));
                }}
                className={cn(
                  'w-full rounded-lg border bg-background px-2 py-1 text-[11px]',
                  m.session_id ? 'border-secondary/50 text-primary' : 'border-muted/30 text-muted',
                )}
              >
                <option value="">— بدون جلسة —</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            )}
            {m.type === 'image' && m.session_id && (() => {
              const isMain = mainBySession.get(m.session_id)?.id === m.id;
              return (
                <button
                  onClick={() => {
                    const cur = mainBySession.get(m.session_id!);
                    if (!cur || cur.id === m.id) return;
                    // تبديل الترتيب فوريًا حتى تنتقل شارة «رئيسية»
                    setItems((prev) =>
                      prev.map((x) =>
                        x.id === m.id ? { ...x, sort_order: cur.so } : x.id === cur.id ? { ...x, sort_order: m.sort_order } : x,
                      ),
                    );
                    makeSessionMainAction(courseId, m.id)
                      .then((r) => (r?.error ? toast.error(r.error) : toast.success('تم تعيينها كصورة رئيسية للمحور')))
                      .catch(() => toast.error('تعذّر التعيين'));
                  }}
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-lg py-1 text-[11px] font-medium transition-colors',
                    isMain ? 'bg-secondary text-white' : 'text-primary hover:bg-primary/5',
                  )}
                  title="الصورة الرئيسية للمحور (تظهر مع العنوان والنص)"
                >
                  <Crown className={cn('size-3.5', isMain && 'fill-white')} />
                  {isMain ? 'الصورة الرئيسية للمحور' : 'اجعلها رئيسية للمحور'}
                </button>
              );
            })()}
            {m.compressed_size != null && m.original_size != null && (
              <span className="text-[10px] text-muted">
                {formatBytes(m.compressed_size)} · وفّر {compressionRatio(m.original_size, m.compressed_size)}%
              </span>
            )}
            <div className="flex gap-1">
              <button
                onClick={() => {
                  // تحديد الغلاف فوريًا (تفاؤلي)
                  setItems((prev) => prev.map((x) => ({ ...x, is_cover: x.id === m.id })));
                  setCoverAction(courseId, m.id).catch(() => toast.error('تعذّر تحديد الغلاف'));
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1 text-[11px] text-primary hover:bg-primary/5"
              >
                <Star className={cn('size-3.5', m.is_cover && 'fill-secondary text-secondary')} /> غلاف
              </button>
              {m.type === 'image' && m.processing_status === 'done' && m.processed_url && (
                <button
                  onClick={() => setEditing(m)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1 text-[11px] text-primary hover:bg-primary/5"
                  title="قص الصورة وتحسينها"
                >
                  <Crop className="size-3.5" /> قص
                </button>
              )}
              <button
                onClick={() => {
                  // حذف فوري من الواجهة ثم الحذف في الخلفية
                  setItems((prev) => prev.filter((x) => x.id !== m.id));
                  deleteMediaAction(courseId, m.id)
                    .then(() => toast.success('تم الحذف'))
                    .catch(() => toast.error('تعذّر الحذف، حاول مجددًا'));
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

    {editing?.processed_url && (
      <ImageEditor
        courseId={courseId}
        mediaId={editing.id}
        src={editing.processed_url}
        onClose={() => setEditing(null)}
      />
    )}
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
