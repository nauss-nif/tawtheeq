import { Card, CardTitle } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';
import { providerStatuses } from '@/lib/promo/providers';
import { listLibrary } from '@/lib/promo/library';
import { toStoryboard } from '@/lib/promo/timeline';
import { PromoStudio, type StudioMedia, type StudioTrack } from './PromoStudio';
import { PromoList, type PromoListItem } from './PromoList';
import type { Course } from '@/lib/database.types';
import type { StoryboardRow } from '@/lib/promo/timeline';

/**
 * لوحة «الاستوديو الذكي للبرومو» داخل صفحة البرنامج.
 *
 * تقرأ كل ما يلزم من المنصة (بيانات البرنامج، الوسائط، الشعارات المرفوعة،
 * قاموس النطق، حالة المزوّدين) فلا يُطلب من المستخدم إدخال شيء موجود مسبقًا.
 */
export async function PromoPanel({ course }: { course: Course }) {
  const supabase = createClient();

  const [
    { data: media },
    { data: analysis },
    { data: assets },
    { data: pron },
    { data: promos },
    libraryMusic,
    libraryLogos,
  ] = await Promise.all([
      supabase
        .from('media')
        .select('id, type, thumbnail_url, caption, is_low_quality, processing_status')
        .eq('course_id', course.id)
        .eq('processing_status', 'done')
        .order('sort_order', { ascending: true }),
      supabase.from('media_analysis').select('media_id, score').eq('course_id', course.id),
      supabase
        .from('promo_assets')
        .select('id, url, kind, meta')
        .eq('course_id', course.id)
        .eq('kind', 'logo')
        .order('created_at', { ascending: true }),
      supabase
        .from('promo_pronunciations')
        .select('id, term, phonetic')
        .eq('course_id', course.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('promos')
        .select('*')
        .eq('course_id', course.id)
        .order('created_at', { ascending: false }),
      // مكتبة المنصة الثابتة — يرفعها المدير ويختار منها كل المنسقين
      listLibrary(supabase, 'music'),
      listLibrary(supabase, 'logo'),
    ]);

  const scores = new Map((analysis ?? []).map((a) => [a.media_id, Number(a.score)]));

  const studioMedia: StudioMedia[] = (media ?? []).map((m) => ({
    id: m.id,
    type: m.type,
    thumbnail: m.thumbnail_url,
    caption: m.caption,
    isLowQuality: m.is_low_quality,
    score: scores.get(m.id) ?? null,
  }));

  const tracks: StudioTrack[] = libraryMusic.map((t) => ({
    id: t.id,
    title: t.title,
    mood: t.subtitle ?? '',
    license: t.license,
    attribution: t.attribution,
    duration: t.duration,
    url: t.url,
  }));

  // الشعارات الرسمية من المكتبة + ما رفعه المنسق لهذه الدورة
  const logos = [
    ...libraryLogos.map((l) => ({
      id: l.id,
      url: l.url,
      name: l.title,
      official: true,
    })),
    ...(assets ?? []).map((a) => ({
      id: a.id,
      url: a.url ?? '',
      name: (a.meta as { originalName?: string })?.originalName ?? 'شعار',
      official: false,
    })),
  ];

  const items: PromoListItem[] = (promos ?? []).map((p) => {
    const storyboard = (p.storyboard ?? {}) as {
      rows?: StoryboardRow[];
      rationale?: string[];
      shots?: unknown[];
    };
    const settings = (p.settings ?? {}) as { duration?: number; style?: string };

    return {
      id: p.id,
      title: p.title,
      version: p.version,
      status: p.status,
      progress: p.progress,
      stageLabel: p.stage_label,
      error: p.error,
      createdAt: p.created_at,
      outputs: (p.outputs ?? {}) as PromoListItem['outputs'],
      qc:
        p.qc_report && (p.qc_report as { checks?: unknown[] }).checks
          ? (p.qc_report as PromoListItem['qc'])
          : null,
      storyboard: sceneRows(p.id, storyboard),
      rationale: storyboard.rationale ?? [],
      duration: settings.duration ?? 60,
      style: settings.style ?? 'cinematic',
    };
  });

  // صفوف لوحة المشاهد للبروموهات التي حُفظت مشاهدها في الجدول
  const withScenes = await attachScenes(supabase, items, studioMedia);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <CardTitle>الاستوديو الذكي للبرومو</CardTitle>
        <p className="text-sm leading-relaxed text-muted">
          ارفع المواد في تبويب «الصور»، ثم اضبط ما تريد هنا واضغط «إنشاء البرومو».
          يحلّل النظام المواد، يبني القصة البصرية، يحرّك الصور، ينتج التعليق الصوتي
          والموسيقى، ويُخرج فيديو جاهزًا للنشر.
        </p>
      </Card>

      <PromoStudio
        courseId={course.id}
        courseTitle={course.title}
        courseLocation={course.location}
        courseStartDate={course.start_date}
        media={studioMedia}
        tracks={tracks}
        logos={logos}
        pronunciations={pron ?? []}
        providers={providerStatuses()}
        hasMusicLibrary={tracks.length > 0}
      />

      <Card className="flex flex-col gap-4">
        <CardTitle>البروموهات والإصدارات</CardTitle>
        <PromoList promos={withScenes} courseId={course.id} />
      </Card>
    </div>
  );
}

/** استخراج صفوف لوحة المشاهد من storyboard المحفوظ إن وُجدت */
function sceneRows(
  _promoId: string,
  storyboard: { rows?: StoryboardRow[] },
): StoryboardRow[] {
  return storyboard.rows ?? [];
}

/**
 * يُكمل صفوف لوحة المشاهد من جدول `promo_scenes` (المصدر الأدقّ بعد الإنتاج).
 * الصفوف المحفوظة في storyboard تُستخدم قبل الإنتاج، وهذه بعده.
 */
async function attachScenes(
  supabase: ReturnType<typeof createClient>,
  items: PromoListItem[],
  media: StudioMedia[],
): Promise<PromoListItem[]> {
  const ids = items.filter((i) => !i.storyboard.length).map((i) => i.id);
  if (!ids.length) return items;

  const { data: scenes } = await supabase
    .from('promo_scenes')
    .select('promo_id, scene_index, beat, source_kind, media_id, duration, motion, transition, texts, narration')
    .in('promo_id', ids)
    .order('scene_index', { ascending: true });

  if (!scenes?.length) return items;

  const thumbs = new Map(media.map((m) => [m.id, m.thumbnail ?? '']));
  const byPromo = new Map<string, StoryboardRow[]>();

  for (const s of scenes) {
    const orientation = (s.motion as Record<string, unknown>)?.horizontal
      ? 'horizontal'
      : 'vertical';
    const motion = (s.motion as Record<string, { type?: string }>)?.[orientation];
    const texts = (s.texts as Record<string, { text: string }[]>)?.[orientation] ?? [];

    const row: StoryboardRow = {
      index: s.scene_index,
      label: `مشهد ${String(s.scene_index + 1).padStart(2, '0')}`,
      beat: s.beat,
      beatLabel: BEAT_AR[s.beat] ?? s.beat,
      duration: Number(s.duration),
      sourceKind: s.source_kind as StoryboardRow['sourceKind'],
      mediaId: s.media_id,
      thumbnail: s.media_id ? thumbs.get(s.media_id) : undefined,
      motion: motion?.type ?? 'static',
      motionLabel: MOTION_AR[motion?.type ?? 'static'] ?? motion?.type ?? 'ثابت',
      transition: TRANSITION_AR[(s.transition as { type?: string })?.type ?? 'cut'] ?? 'قطع',
      texts: texts.map((t) => t.text),
      narration: s.narration,
    };

    byPromo.set(s.promo_id, [...(byPromo.get(s.promo_id) ?? []), row]);
  }

  return items.map((i) =>
    byPromo.has(i.id) ? { ...i, storyboard: byPromo.get(i.id)! } : i,
  );
}

const BEAT_AR: Record<string, string> = {
  opening: 'افتتاحية بصرية',
  title: 'اسم البرنامج',
  place: 'المكان',
  kickoff: 'بداية الفعالية',
  training: 'التدريب والتفاعل',
  activities: 'التطبيقات والأنشطة',
  highlights: 'أبرز اللحظات',
  participants: 'المشاركون',
  closing: 'الختام',
  endcard: 'الشعارات والمعلومات',
};

const MOTION_AR: Record<string, string> = {
  slow_zoom_in: 'تقريب بطيء',
  slow_zoom_out: 'إبعاد بطيء',
  push_in: 'اندفاع للأمام',
  pull_out: 'انسحاب للخلف',
  pan_left: 'مسح لليسار',
  pan_right: 'مسح لليمين',
  pan_up: 'مسح لأعلى',
  pan_down: 'مسح لأسفل',
  parallax: 'اختلاف منظر (عمق)',
  depth_push: 'اندفاع بعمق',
  rack_focus: 'نقل تركيز',
  static: 'ثابت',
};

const TRANSITION_AR: Record<string, string> = {
  cut: 'قطع مباشر',
  fade: 'تلاشٍ',
  dissolve: 'ذوبان',
  wipe_right: 'مسح يمين',
  wipe_left: 'مسح يسار',
  slide_up: 'انزلاق لأعلى',
  whip_pan: 'مسح سريع',
  flash: 'ومضة',
  zoom_blur: 'تقريب ضبابي',
};

export { toStoryboard };
