/**
 * تنسيق تحليل المواد: تشغيل المحلّل على وسائط الدورة، التخزين المؤقّت في
 * `media_analysis`، ثم الفرز وإزالة التكرار واختيار الأفضل.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { localAnalysis, hammingDistance } from './providers/analysis/local';
import type { Database } from '@/lib/database.types';
import type { MediaAnalysis, StoryBeat } from './types';

type Client = SupabaseClient<Database>;

/** مسافة هامينغ التي نعتبر ما دونها تكرارًا بصريًا */
const DUPLICATE_THRESHOLD = 9;
/** الحدّ الأدنى للقيمة البصرية لدخول البرومو */
const MIN_SCORE = 34;

export interface AnalyzeOptions {
  courseId: string;
  /** إعادة التحليل حتى لو كان مخزّنًا */
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
}

/**
 * يحلّل كل وسائط الدورة المكتملة المعالجة، مع إعادة استخدام النتائج المخزّنة.
 * المواد التي يفشل تحليلها تُتخطّى ولا تُسقط العملية.
 */
export async function analyzeCourseMedia(
  supabase: Client,
  opts: AnalyzeOptions,
): Promise<MediaAnalysis[]> {
  const { data: media } = await supabase
    .from('media')
    .select('id, type, processed_url, thumbnail_url, duration, is_low_quality, processing_status')
    .eq('course_id', opts.courseId)
    .eq('processing_status', 'done')
    .order('sort_order', { ascending: true });

  const rows = (media ?? []).filter((m) => m.processed_url);
  if (!rows.length) return [];

  const { data: cachedRows } = await supabase
    .from('media_analysis')
    .select('*')
    .eq('course_id', opts.courseId);

  const cached = new Map((cachedRows ?? []).map((r) => [r.media_id, r]));
  const out: MediaAnalysis[] = [];
  let done = 0;

  for (const m of rows) {
    const hit = !opts.force ? cached.get(m.id) : undefined;
    if (hit) {
      out.push({
        mediaId: m.id,
        type: m.type,
        url: m.processed_url!,
        metrics: hit.metrics as MediaAnalysis['metrics'],
        phash: hit.phash ?? '',
        labels: (hit.labels as string[]) ?? [],
        focus: hit.focus as MediaAnalysis['focus'],
        score: Number(hit.score),
        beatAffinity: (hit.metrics as { beatAffinity?: MediaAnalysis['beatAffinity'] })
          ?.beatAffinity ?? {},
        engine: hit.engine ?? 'local',
      });
      opts.onProgress?.(++done, rows.length);
      continue;
    }

    try {
      const analysis = await localAnalysis.analyze({
        mediaId: m.id,
        type: m.type,
        src: m.processed_url!,
      });

      await supabase.from('media_analysis').upsert({
        media_id: m.id,
        course_id: opts.courseId,
        metrics: { ...analysis.metrics, beatAffinity: analysis.beatAffinity },
        labels: analysis.labels,
        phash: analysis.phash,
        focus: analysis.focus,
        score: analysis.score,
        engine: analysis.engine,
        analyzed_at: new Date().toISOString(),
      });

      out.push(analysis);
    } catch {
      // مادة تعذّر تحليلها تُستبعد بهدوء بدلًا من إسقاط الإنتاج كلّه
    }
    opts.onProgress?.(++done, rows.length);
  }

  return out;
}

/**
 * إزالة التكرار البصري: نبقي الأعلى جودة من كل مجموعة صور متشابهة.
 * يعيد القائمة المنقّاة ومجموعات التكرار للعرض في تقرير التحليل.
 */
export function dedupe(analyses: MediaAnalysis[]): {
  kept: MediaAnalysis[];
  duplicates: { keptId: string; droppedIds: string[] }[];
} {
  const sorted = [...analyses].sort((a, b) => b.score - a.score);
  const kept: MediaAnalysis[] = [];
  const duplicates: { keptId: string; droppedIds: string[] }[] = [];

  for (const item of sorted) {
    const twin = kept.find(
      (k) =>
        k.type === item.type &&
        item.phash &&
        k.phash &&
        hammingDistance(k.phash, item.phash) <= DUPLICATE_THRESHOLD,
    );
    if (twin) {
      const group = duplicates.find((d) => d.keptId === twin.mediaId);
      if (group) group.droppedIds.push(item.mediaId);
      else duplicates.push({ keptId: twin.mediaId, droppedIds: [item.mediaId] });
      continue;
    }
    kept.push(item);
  }

  return { kept, duplicates };
}

export interface SelectionResult {
  selected: MediaAnalysis[];
  rejected: { mediaId: string; reason: string }[];
  duplicates: { keptId: string; droppedIds: string[] }[];
  stats: { total: number; analyzed: number; images: number; videos: number; avgScore: number };
}

/**
 * اختيار المواد الداخلة في البرومو:
 * ١) احترام اختيار المستخدم اليدوي (تضمين/استبعاد صريح)
 * ٢) استبعاد ما دون عتبة الجودة
 * ٣) إزالة التكرار البصري
 * ٤) الإبقاء على عدد كافٍ للمشاهد المطلوبة مع تنويع بصري
 */
export function selectMaterials(
  analyses: MediaAnalysis[],
  opts: {
    sceneBudget: number;
    includeIds?: string[];
    excludeIds?: string[];
  },
): SelectionResult {
  const include = new Set(opts.includeIds ?? []);
  const exclude = new Set(opts.excludeIds ?? []);
  const rejected: { mediaId: string; reason: string }[] = [];

  let pool = analyses.filter((a) => {
    if (exclude.has(a.mediaId)) {
      rejected.push({ mediaId: a.mediaId, reason: 'استبعاد يدوي' });
      return false;
    }
    return true;
  });

  // الاختيار اليدوي يتجاوز عتبة الجودة تمامًا
  const manual = pool.filter((a) => include.has(a.mediaId));
  const auto = pool.filter((a) => !include.has(a.mediaId));

  const qualified = auto.filter((a) => {
    if (a.score < MIN_SCORE) {
      rejected.push({ mediaId: a.mediaId, reason: `جودة منخفضة (${Math.round(a.score)})` });
      return false;
    }
    return true;
  });

  const { kept, duplicates } = dedupe(qualified);
  for (const g of duplicates) {
    for (const id of g.droppedIds) rejected.push({ mediaId: id, reason: 'مكرّرة بصريًا' });
  }

  // نحتاج مواد أكثر من عدد المشاهد قليلًا لإتاحة تنويع في التوزيع
  const budget = Math.ceil(opts.sceneBudget * 1.4);
  const ranked = [...kept].sort((a, b) => b.score - a.score);

  // ضمان حضور الفيديو: نحجز مكانًا لأفضل مقطعين إن وُجدا
  const videos = ranked.filter((a) => a.type === 'video').slice(0, 3);
  const images = ranked.filter((a) => a.type === 'image');
  const merged = [...videos, ...images].slice(0, Math.max(budget, videos.length));

  const selected = [...manual, ...merged.filter((m) => !include.has(m.mediaId))];

  const scores = selected.map((s) => s.score);
  return {
    selected,
    rejected,
    duplicates,
    stats: {
      total: analyses.length,
      analyzed: analyses.length,
      images: selected.filter((s) => s.type === 'image').length,
      videos: selected.filter((s) => s.type === 'video').length,
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    },
  };
}

/** ملخّص نصي للمواد — يُمرَّر للنموذج اللغوي لمنعه من ذكر ما لا يوجد */
export function materialSummary(selected: MediaAnalysis[]): string {
  const images = selected.filter((s) => s.type === 'image').length;
  const videos = selected.filter((s) => s.type === 'video').length;
  const labels = [...new Set(selected.flatMap((s) => s.labels))];
  const parts = [`${images} صورة`, videos ? `${videos} مقطع فيديو` : null].filter(Boolean);
  return (
    `المتاح: ${parts.join(' و')}.` +
    (labels.length ? ` محتوى مرصود: ${labels.join('، ')}.` : ' لم تُرصد وسوم محتوى تفصيلية.')
  );
}

/**
 * أفضل مادة لخطوة قصة معيّنة.
 *
 * الأصل ألّا تتكرّر مادة. لكن حين تكون المواد أقلّ ممّا تتطلّبه مدة الفيديو،
 * إعادة استخدام أفضل المواد بتأطير وحركة مختلفين أفضل من فيلم أقصر من المطلوب
 * أو من لقطات جامدة طويلة. لذلك نسمح بالتكرار ضمن سقف، ونمنع تجاور النسختين.
 */
export function bestForBeat(
  pool: MediaAnalysis[],
  beat: StoryBeat,
  used: Set<string>,
  opts?: {
    /** عدد مرات استخدام كل مادة حتى الآن */
    useCount?: Map<string, number>;
    /** أقصى عدد مرات مسموح لكل مادة */
    maxUses?: number;
    /** المواد المستخدمة في اللقطات القليلة الأخيرة (تُتجنّب للتجاور) */
    recent?: string[];
  },
): MediaAnalysis | null {
  const scoreOf = (x: MediaAnalysis) =>
    x.score * 0.55 + (x.beatAffinity[beat] ?? 0.4) * 100 * 0.45;

  // المحاولة الأولى: مواد لم تُستخدم إطلاقًا
  const fresh = pool.filter((a) => !used.has(a.mediaId));
  if (fresh.length) return fresh.reduce((b, a) => (scoreOf(a) > scoreOf(b) ? a : b));

  const maxUses = opts?.maxUses ?? 1;
  if (maxUses <= 1 || !pool.length) return null;

  const counts = opts?.useCount;
  const recentList = opts?.recent ?? [];
  const recent = new Set(recentList.filter(Boolean));
  const previous = recentList[recentList.length - 1];

  const uses = (a: MediaAnalysis) => counts?.get(a.mediaId) ?? 1;
  const underCap = (a: MediaAnalysis) => uses(a) < maxUses;
  const notPrevious = (a: MediaAnalysis) => a.mediaId !== previous;

  // عند إعادة الاستخدام نوازن الاستهلاك أولًا ثم نفاضل بالجودة، حتى لا تبتلع
  // أفضل صورة نصف الفيلم بينما تُهمَل البقية.
  const leastUsedThenBest = (xs: MediaAnalysis[]) =>
    xs.reduce((b, a) => {
      if (uses(a) !== uses(b)) return uses(a) < uses(b) ? a : b;
      return scoreOf(a) > scoreOf(b) ? a : b;
    });

  // (٢) تحت السقف وخارج نافذة التكرار القريب — الحالة المثلى لإعادة الاستخدام
  const spaced = pool.filter((a) => underCap(a) && !recent.has(a.mediaId));
  if (spaced.length) return leastUsedThenBest(spaced);

  // (٣) تحت السقف وغير ملاصقة للقطة السابقة
  const capped = pool.filter((a) => underCap(a) && notPrevious(a));
  if (capped.length) return leastUsedThenBest(capped);

  // (٤) تجاوز السقف أهون من بطاقة فارغة أو فيلم أقصر من المطلوب،
  //     لكن التجاور المباشر يبقى ممنوعًا ما دام هناك بديل.
  const nonAdjacent = pool.filter(notPrevious);
  return nonAdjacent.length ? leastUsedThenBest(nonAdjacent) : null;
}
