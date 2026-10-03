/**
 * محرّك القصة (Storytelling Engine).
 *
 * لا يجمع المواد عشوائيًا: يبني تسلسلًا دراميًا من خطوات (beats)، يكيّفه حسب
 * ما تسنده المواد فعليًا، يوزّع المدد وفق إيقاع النمط، ثم يسند لكل خطوة أنسب مادة.
 *
 * يعمل حتميًا دون أي نموذج لغوي؛ وإن توفّر النموذج فإنه يُستشار لإعادة الترتيب
 * فقط، ولا يُسمح له بابتكار مواد أو معلومات.
 */

import { bestForBeat } from './analyze';
import { getStyle } from './styles';
import type {
  CourseContext, MediaAnalysis, PromoDuration, PromoStyleId, StoryBeat,
} from './types';

export interface BeatPlan {
  beat: StoryBeat;
  /** الوزن النسبي لهذه الخطوة في توزيع الزمن */
  weight: number;
  /** أقل عدد لقطات وأكثره لهذه الخطوة */
  minShots: number;
  maxShots: number;
  /** هل الخطوة إلزامية (لا تُحذف عند ضيق الوقت)؟ */
  required: boolean;
  /** هل تحمل نصًا على الشاشة؟ */
  carriesText: boolean;
}

/** التسلسل المرجعي الكامل — يُقلَّم ويُعاد ترتيبه حسب المحتوى */
const CANONICAL: BeatPlan[] = [
  { beat: 'opening',      weight: 1.0, minShots: 1, maxShots: 1, required: true,  carriesText: true  },
  { beat: 'title',        weight: 0.9, minShots: 1, maxShots: 1, required: true,  carriesText: true  },
  { beat: 'place',        weight: 0.8, minShots: 1, maxShots: 2, required: false, carriesText: true  },
  { beat: 'kickoff',      weight: 0.9, minShots: 1, maxShots: 2, required: false, carriesText: false },
  { beat: 'training',     weight: 1.6, minShots: 2, maxShots: 5, required: true,  carriesText: true  },
  { beat: 'activities',   weight: 1.3, minShots: 1, maxShots: 4, required: false, carriesText: false },
  { beat: 'highlights',   weight: 1.2, minShots: 1, maxShots: 4, required: false, carriesText: false },
  { beat: 'participants', weight: 1.0, minShots: 1, maxShots: 3, required: false, carriesText: false },
  { beat: 'closing',      weight: 0.9, minShots: 1, maxShots: 2, required: false, carriesText: true  },
  { beat: 'endcard',      weight: 1.0, minShots: 1, maxShots: 1, required: true,  carriesText: true  },
];

export const BEAT_LABELS: Record<StoryBeat, string> = {
  opening:      'افتتاحية بصرية',
  title:        'اسم البرنامج',
  place:        'المكان',
  kickoff:      'بداية الفعالية',
  training:     'التدريب والتفاعل',
  activities:   'التطبيقات والأنشطة',
  highlights:   'أبرز اللحظات',
  participants: 'المشاركون',
  closing:      'الختام',
  endcard:      'الشعارات والمعلومات',
};

export interface PlannedShot {
  beat: StoryBeat;
  /** المادة المسندة — null يعني بطاقة نصية أو مشهد مساند مولّد */
  media: MediaAnalysis | null;
  duration: number;
  /** هل هذه اللقطة بطاقة نصية بحتة (افتتاحية/عنوان/نهاية)؟ */
  isCard: boolean;
  /** هل تحتاج لقطة مساندة مولّدة لعدم توفّر مادة مناسبة؟ */
  needsBRoll: boolean;
}

export interface StoryPlan {
  shots: PlannedShot[];
  beats: StoryBeat[];
  totalDuration: number;
  /** تفسير قابل للعرض في الـ Storyboard */
  rationale: string[];
}

/**
 * بناء خطة القصة.
 *
 * الترتيب يتغيّر عن التسلسل المرجعي عندما يكون أنسب للمحتوى:
 * - إن لم يكن للبرنامج مكان مسجّل، تُحذف خطوة «المكان».
 * - إن كانت المواد كلها ورشًا تفاعلية وقليلة التنوّع، تُدمج «الأنشطة» في «التدريب».
 * - إن وُجد مقطع فيديو عالي الحركة، يُقدَّم لخطوة «أبرز اللحظات» ويُعطى مساحة أكبر.
 * - عند قلّة المواد، تُحذف الخطوات غير الإلزامية من الأدنى وزنًا.
 */
export function buildStoryPlan(input: {
  course: CourseContext;
  analyses: MediaAnalysis[];
  duration: PromoDuration;
  style: PromoStyleId;
  allowBRoll: boolean;
  /** ترتيب مقترح من النموذج اللغوي (اختياري) */
  suggestedOrder?: { beat: StoryBeat; mediaId: string | null }[] | null;
}): StoryPlan {
  const style = getStyle(input.style);
  const rationale: string[] = [];

  // ---------------------------------------------------------------- ١) الخطوات
  let beats = CANONICAL.map((b) => ({ ...b }));

  if (!input.course.location) {
    beats = beats.filter((b) => b.beat !== 'place');
    rationale.push('حُذفت خطوة «المكان» لعدم تسجيل مكان تنفيذ للبرنامج.');
  }

  const videos = input.analyses.filter((a) => a.type === 'video');
  const hasActionVideo = videos.some((v) => (v.metrics.motionScore ?? 0) > 35);
  if (hasActionVideo) {
    const hi = beats.find((b) => b.beat === 'highlights');
    if (hi) { hi.weight += 0.4; hi.maxShots += 1; }
    rationale.push('زيدت مساحة «أبرز اللحظات» لتوفّر مقاطع فيديو ذات حركة.');
  }

  // تنوّع المحتوى: إن كانت المواد متقاربة جدًا، ندمج الأنشطة في التدريب
  const diversity = contentDiversity(input.analyses);
  if (diversity < 0.35 && beats.some((b) => b.beat === 'activities')) {
    beats = beats.filter((b) => b.beat !== 'activities');
    const tr = beats.find((b) => b.beat === 'training');
    if (tr) { tr.weight += 0.5; tr.maxShots += 2; }
    rationale.push('دُمجت «التطبيقات والأنشطة» في «التدريب» لتقارب المواد بصريًا.');
  }

  // ---------------------------------------------- ٢) ميزانية اللقطات والزمن
  // الافتتاحية وبطاقة النهاية تأخذان مدة ثابتة من النمط؛ الباقي يُوزَّع بالأوزان.
  // عدد اللقطات يُشتقّ من الزمن وإيقاع النمط، لا من عدد المواد: مدة الفيديو
  // التزام تجاه المستخدم. قلّة المواد تُعالَج لاحقًا بإعادة استخدام مدروسة.
  const fixedTime = style.openingDuration + style.endCardDuration;
  const bodyTime = Math.max(6, input.duration - fixedTime);
  let shotBudget = Math.max(3, Math.round(bodyTime / style.avgShotLength));

  // حذف الخطوات غير الإلزامية عند ضيق الميزانية (الأدنى وزنًا أولًا)
  const bodyBeats = beats.filter((b) => b.beat !== 'opening' && b.beat !== 'endcard');
  const minNeeded = () => bodyBeats.reduce((s, b) => s + b.minShots, 0);
  while (minNeeded() > shotBudget) {
    const optional = bodyBeats.filter((b) => !b.required).sort((a, b) => a.weight - b.weight);
    if (!optional.length) break;
    const drop = optional[0];
    bodyBeats.splice(bodyBeats.indexOf(drop), 1);
    beats = beats.filter((b) => b.beat !== drop.beat);
    rationale.push(`حُذفت خطوة «${BEAT_LABELS[drop.beat]}» لضيق مدة الفيديو.`);
  }

  // ---------------------------------------------------- ٣) توزيع اللقطات
  const totalWeight = bodyBeats.reduce((s, b) => s + b.weight, 0);
  const perBeat = new Map<StoryBeat, number>();
  let assigned = 0;
  for (const b of bodyBeats) {
    const n = Math.min(
      b.maxShots,
      Math.max(b.minShots, Math.round((b.weight / totalWeight) * shotBudget)),
    );
    perBeat.set(b.beat, n);
    assigned += n;
  }
  // ضبط الفارق على أوسع الخطوات
  let drift = shotBudget - assigned;
  const adjustable = [...bodyBeats].sort((a, b) => b.weight - a.weight);
  let guard = 0;
  while (drift !== 0 && guard++ < 40) {
    for (const b of adjustable) {
      if (drift === 0) break;
      const cur = perBeat.get(b.beat)!;
      if (drift > 0 && cur < b.maxShots) { perBeat.set(b.beat, cur + 1); drift--; }
      else if (drift < 0 && cur > b.minShots) { perBeat.set(b.beat, cur - 1); drift++; }
    }
    if (adjustable.every((b) => {
      const c = perBeat.get(b.beat)!;
      return drift > 0 ? c >= b.maxShots : c <= b.minShots;
    })) break;
  }
  shotBudget = [...perBeat.values()].reduce((a, b) => a + b, 0);

  // ---------------------------------------------------- ٤) إسناد المواد
  const used = new Set<string>();
  const shots: PlannedShot[] = [];

  // الافتتاحية: أفضل لقطة واسعة، أو مشهد مساند مولّد إن لم توجد
  const openingMedia = pickOpening(input.analyses, used);
  const needsBRollOpening = !openingMedia && input.allowBRoll;
  if (openingMedia) used.add(openingMedia.mediaId);
  else if (needsBRollOpening) {
    rationale.push('لا توجد لقطة افتتاحية واسعة مناسبة؛ سيُولَّد مشهد مساند سينمائي للموقع.');
  }
  shots.push({
    beat: 'opening',
    media: openingMedia,
    duration: style.openingDuration,
    isCard: !openingMedia && !needsBRollOpening,
    needsBRoll: needsBRollOpening,
  });

  // ترتيب مقترح من النموذج (إن وُجد) يُطبَّق كتفضيل إسناد لا كترتيب مُلزم
  const preferred = new Map<StoryBeat, string[]>();
  for (const s of input.suggestedOrder ?? []) {
    if (!s.mediaId) continue;
    preferred.set(s.beat, [...(preferred.get(s.beat) ?? []), s.mediaId]);
  }

  const bodyDuration = input.duration - fixedTime;
  const bodyShots: PlannedShot[] = [];

  // سقف إعادة الاستخدام: يُشتقّ من الفجوة بين اللقطات المطلوبة والمواد المتاحة.
  // نبقيه منخفضًا (٣ كحدّ أقصى) حتى لا يتحوّل الفيلم إلى تكرار لصورة واحدة.
  const poolSize = Math.max(1, input.analyses.length - used.size);
  const maxUses = Math.min(4, Math.max(1, Math.ceil(shotBudget / poolSize)));
  const useCount = new Map<string, number>();
  for (const id of used) useCount.set(id, 1);

  for (const b of bodyBeats) {
    const count = perBeat.get(b.beat) ?? 0;
    for (let i = 0; i < count; i++) {
      let media: MediaAnalysis | null = null;

      const wish = (preferred.get(b.beat) ?? []).find((id) => !used.has(id));
      if (wish) media = input.analyses.find((a) => a.mediaId === wish) ?? null;
      if (!media) {
        media = bestForBeat(input.analyses, b.beat, used, {
          useCount,
          maxUses,
          recent: bodyShots.slice(-2).map((s) => s.media?.mediaId ?? ''),
        });
      }

      if (media) {
        used.add(media.mediaId);
        useCount.set(media.mediaId, (useCount.get(media.mediaId) ?? 0) + 1);
      }
      bodyShots.push({
        beat: b.beat,
        media,
        duration: 0, // يُحسب بعد قليل
        isCard: !media,
        needsBRoll: false,
      });
    }
  }

  const reused = [...useCount.values()].filter((n) => n > 1).length;
  if (reused) {
    rationale.push(
      `المواد المتاحة (${input.analyses.length}) أقلّ ممّا تتطلّبه ${input.duration} ثانية بإيقاع ` +
        `«${style.label}»؛ أُعيد استخدام ${reused} مادة بتأطير وحركة مختلفين، مع منع تجاور النسختين.`,
    );
  }

  // توزيع الزمن على لقطات الجسم مع احترام حدود النمط
  distributeDurations(bodyShots, bodyDuration, style.minShot, style.maxShot, style.avgShotLength);
  shots.push(...bodyShots);

  // بطاقة النهاية
  shots.push({
    beat: 'endcard',
    media: null,
    duration: style.endCardDuration,
    isCard: true,
    needsBRoll: false,
  });

  const totalDuration = shots.reduce((s, sh) => s + sh.duration, 0);

  return {
    shots,
    beats: [...new Set(shots.map((s) => s.beat))],
    totalDuration,
    rationale,
  };
}

/**
 * اللقطة الافتتاحية: نفضّل مادة واسعة عالية التكوين ومتزنة الإضاءة.
 * إن لم يبلغ أفضل مرشّح عتبة مقبولة، نعيد null ليُولَّد مشهد مساند.
 */
function pickOpening(pool: MediaAnalysis[], used: Set<string>): MediaAnalysis | null {
  const candidates = pool.filter((a) => !used.has(a.mediaId));
  if (!candidates.length) return null;

  const rank = (a: MediaAnalysis) => {
    const wide = a.metrics.aspect >= 1.5 ? 15 : 0;
    const exposure = 100 - Math.abs(a.metrics.brightness - 52) * 2;
    return a.score * 0.5 + a.metrics.composition * 0.25 + exposure * 0.1 + wide;
  };

  const best = candidates.reduce((x, y) => (rank(y) > rank(x) ? y : x));
  return rank(best) >= 58 ? best : null;
}

/**
 * توزيع المدد: نبدأ من المتوسط، ثم نوسّع/نضيّق نسبيًا للوصول للمدة المطلوبة
 * دون خرق حدّي النمط. اللقطات الأعلى جودة تنال وقتًا أطول قليلًا.
 */
function distributeDurations(
  shots: PlannedShot[],
  total: number,
  minBound: number,
  maxBound: number,
  avg: number,
) {
  if (!shots.length) return;

  // المدة الكلية التزام لا يُخالَف. إن تعذّر بلوغها ضمن حدود النمط (لقطات
  // أقلّ أو أكثر ممّا يفترضه الإيقاع) نوسّع الحدّ المعني بالقدر اللازم فقط.
  const n = shots.length;
  let min = minBound;
  let max = maxBound;
  if (total > max * n) max = (total / n) * 1.12;
  if (total < min * n) min = (total / n) * 0.9;

  // وزن أوّلي: الجودة ترفع المدة، والبطاقات النصية تأخذ مدة قراءة كافية
  const weights = shots.map((s) => {
    if (s.isCard) return 1.15;
    const q = s.media ? s.media.score / 100 : 0.5;
    const isVideo = s.media?.type === 'video';
    return 0.85 + q * 0.35 + (isVideo ? 0.15 : 0);
  });
  const wSum = weights.reduce((a, b) => a + b, 0);

  for (let i = 0; i < shots.length; i++) {
    shots[i].duration = clamp((weights[i] / wSum) * total, min, max);
  }

  // تسوية الفارق الناتج عن التقييد
  for (let pass = 0; pass < 12; pass++) {
    const cur = shots.reduce((s, sh) => s + sh.duration, 0);
    const diff = total - cur;
    if (Math.abs(diff) < 0.05) break;

    const room = shots.filter((s) =>
      diff > 0 ? s.duration < max - 0.01 : s.duration > min + 0.01,
    );
    if (!room.length) break;
    const share = diff / room.length;
    for (const s of room) s.duration = clamp(s.duration + share, min, max);
  }

  // تقريب لعُشر الثانية لسهولة القراءة في الـ Storyboard
  for (const s of shots) s.duration = Math.round(s.duration * 10) / 10;
  void avg;
}

/** تنوّع المحتوى 0..1 اعتمادًا على تباعد البصمات الإدراكية */
function contentDiversity(analyses: MediaAnalysis[]): number {
  const withHash = analyses.filter((a) => a.phash);
  if (withHash.length < 3) return 1;

  let sum = 0, pairs = 0;
  const sample = withHash.slice(0, 24);
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      sum += hamming(sample[i].phash, sample[j].phash);
      pairs++;
    }
  }
  return pairs ? Math.min(1, sum / pairs / 24) : 1;
}

function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 32;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
