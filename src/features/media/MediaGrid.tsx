'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Star, Trash2, GripVertical, Loader2, CheckCircle2, XCircle,
  CloudUpload, AlertTriangle, Film, Crown, Crop, ChevronDown, ChevronsUpDown, ChevronsDownUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn, compressionRatio, formatBytes } from '@/lib/utils';
import type { Media, Session } from '@/lib/database.types';
import { sessionAccent, type SessionAccent } from '@/features/magazine/accents';
import { groupByOrientation } from '@/features/magazine/imageLayout';
import { ImageEditor } from './ImageEditor';
import {
  setCoverAction, updateCaptionAction, deleteMediaAction, reorderMediaAction,
  assignMediaSessionAction, autoAssignMediaAction, makeSessionMainAction,
} from './actions';

/** لون قسم الصور غير المرتبطة بمحور */
const UNASSIGNED_ACCENT: SessionAccent = { main: '#8B8178', deep: '#5F5750', tint: '#EFEBE6' };

const toArabic = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);

interface Group {
  key: string;
  sessionId: string | null;
  title: string;
  number: number | null;
  accent: SessionAccent;
  items: Media[];
}

/**
 * شبكة الوسائط مقسّمة حسب المحاور: لكل محور قسم بلونه يمكن طيّه وفتحه،
 * مع إعادة الترتيب بالسحب (والسحب إلى قسم آخر ينقل الصورة لمحوره)، وتحديد الغلاف،
 * والتعليقات، ومتابعة حالة المعالجة/الأرشفة لحظيًا عبر Supabase Realtime.
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
  const [dropKey, setDropKey] = useState<string | null>(null); // القسم الذي تُسحب فوقه صورة
  const [editing, setEditing] = useState<Media | null>(null); // الصورة قيد القص والتحسين
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => setItems(initial), [initial]);

  // نتذكّر الأقسام المطويّة لكل دورة (تفضيل شخصي في المتصفح)
  const storageKey = `media-collapsed-${courseId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch { /* التخزين غير متاح */ }
  }, [storageKey]);
  const saveCollapsed = (next: Set<string>) => {
    setCollapsed(next);
    try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* التخزين غير متاح */ }
  };

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

  /** نقل صورة إلى محور آخر (تفاؤليًا ثم الحفظ) */
  function moveToSession(id: string, sid: string | null) {
    const m = items.find((x) => x.id === id);
    if (!m || m.type !== 'image' || (m.session_id ?? null) === sid) return false;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, session_id: sid } : x)));
    assignMediaSessionAction(courseId, id, sid)
      .then(() => toast.success(sid ? 'نُقلت الصورة إلى المحور' : 'أُلغي ربط الصورة بالمحور'))
      .catch(() => toast.error('تعذّر الحفظ، حاول مجددًا'));
    return true;
  }

  async function onDropOnCard(targetId: string) {
    setDropKey(null);
    if (!dragId || dragId === targetId) return;
    const target = items.find((m) => m.id === targetId);
    // السحب إلى صورة في قسم محور آخر ينقلها إلى ذلك المحور
    if (sessions.length > 0 && target) moveToSession(dragId, target.session_id ?? null);
    const from = items.findIndex((m) => m.id === dragId);
    const to = items.findIndex((m) => m.id === targetId);
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, { ...moved, session_id: target?.session_id ?? moved.session_id });
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

  // الأقسام: محور لكل قسم بترتيب المحاور، ثم الصور غير المرتبطة، ثم الفيديو
  const sessionIds = new Set(sessions.map((s) => s.id));
  const groups: Group[] = sessions.map((s, i) => ({
    key: s.id,
    sessionId: s.id,
    title: s.title,
    number: i + 1,
    accent: sessionAccent(i),
    // بترتيب المجلة نفسه: الرئيسية أولًا ثم بقية الصور مجمّعة حسب الاتجاه
    items: (() => {
      const list = items.filter((m) => m.type === 'image' && m.session_id === s.id);
      const mainId = mainBySession.get(s.id)?.id;
      const main = list.find((m) => m.id === mainId);
      const rest = list.filter((m) => m.id !== mainId);
      return main ? [main, ...groupByOrientation(rest)] : groupByOrientation(rest);
    })(),
  }));
  const unassigned = groupByOrientation(items.filter((m) => m.type === 'image' && !(m.session_id && sessionIds.has(m.session_id))));
  const videos = items.filter((m) => m.type === 'video');
  if (unassigned.length > 0 || sessions.length === 0)
    groups.push({ key: 'none', sessionId: null, title: sessions.length ? 'صور غير مرتبطة بمحور' : 'الصور', number: null, accent: UNASSIGNED_ACCENT, items: unassigned });
  if (videos.length > 0)
    groups.push({ key: 'videos', sessionId: null, title: 'الفيديو', number: null, accent: UNASSIGNED_ACCENT, items: videos });

  const allCollapsed = groups.every((g) => collapsed.has(g.key));

  const card = (m: Media) => (
    <div
      key={m.id}
      draggable
      onDragStart={() => setDragId(m.id)}
      onDragEnd={() => { setDragId(null); setDropKey(null); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.stopPropagation(); onDropOnCard(m.id); }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl bg-surface shadow-soft',
        m.is_cover && 'ring-2 ring-secondary',
        m.is_low_quality && 'opacity-80',
        dragId === m.id && 'opacity-40',
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

      {/* تعليق + المحور + نسبة التوفير */}
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
            onChange={(e) => moveToSession(m.id, e.target.value || null)}
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
  );

  return (
    <div className="flex flex-col gap-3">
      {sessions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-secondary/30 bg-background p-3">
          <p className="text-xs text-muted">
            الصور مقسّمة حسب المحاور. اسحب صورة إلى قسم محور آخر لنقلها إليه، أو وزّعها تلقائيًا.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => saveCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}
              className="inline-flex items-center gap-1 rounded-xl border border-secondary/40 bg-surface px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
            >
              {allCollapsed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
              {allCollapsed ? 'فتح كل الأقسام' : 'طي كل الأقسام'}
            </button>
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
        </div>
      )}

      {groups.map((g) => {
        const isOpen = !collapsed.has(g.key);
        const canDrop = g.key !== 'videos' && sessions.length > 0;
        const preview = g.items.slice(0, 5);
        return (
          <section
            key={g.key}
            onDragOver={(e) => { if (canDrop && dragId) { e.preventDefault(); setDropKey(g.key); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropKey((k) => (k === g.key ? null : k)); }}
            onDrop={() => {
              setDropKey(null);
              if (canDrop && dragId) moveToSession(dragId, g.sessionId);
              setDragId(null);
            }}
            className={cn(
              'overflow-hidden rounded-2xl border bg-surface transition-shadow',
              dropKey === g.key ? 'shadow-soft-md ring-2' : 'shadow-soft',
            )}
            style={{ borderColor: `${g.accent.main}33`, ...(dropKey === g.key ? { ['--tw-ring-color' as string]: g.accent.main } : {}) }}
          >
            {/* رأس القسم: لسان بلون المحور، العنوان، العدد، وزر الطي */}
            <button
              type="button"
              onClick={() => {
                const next = new Set(collapsed);
                if (isOpen) next.add(g.key); else next.delete(g.key);
                saveCollapsed(next);
              }}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 p-3 text-right transition-colors hover:bg-background/70"
              style={{ background: `linear-gradient(to left, ${g.accent.tint}, transparent 70%)` }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${g.accent.main}, ${g.accent.deep})` }}
              >
                {g.number != null ? toArabic(g.number) : g.key === 'videos' ? <Film className="size-4" /> : '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold" style={{ color: g.accent.deep }}>{g.title}</span>
                <span className="text-[11px] text-muted">
                  {g.items.length === 0 ? 'لا توجد صور بعد' : `${toArabic(g.items.length)} ${g.key === 'videos' ? 'مقطع' : 'صورة'}`}
                </span>
              </span>
              {/* معاينة مصغّرة عند الطي */}
              {!isOpen && preview.length > 0 && (
                <span className="hidden items-center sm:flex">
                  {preview.map((m, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={m.id}
                      src={m.thumbnail_url ?? ''}
                      alt=""
                      className="size-8 rounded-lg border-2 border-surface object-cover shadow-sm"
                      style={{ marginRight: i === 0 ? 0 : -10 }}
                    />
                  ))}
                </span>
              )}
              <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} />
            </button>

            {isOpen && (
              <div className="p-3 pt-1">
                {g.items.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{g.items.map(card)}</div>
                ) : (
                  <p
                    className="rounded-xl border-2 border-dashed py-6 text-center text-xs text-muted"
                    style={{ borderColor: `${g.accent.main}40` }}
                  >
                    {canDrop ? 'اسحب صورة إلى هنا لربطها بهذا المحور' : 'لا توجد عناصر'}
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}

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
