/**
 * تصنيفات الموسيقى وترتيب الترشيح.
 *
 * المقاطع نفسها ليست في الشيفرة: يرفعها المدير مرة واحدة إلى مكتبة المنصة
 * (`promo_library`) من لوحة الإدارة، فيختار منها كل المنسقين. هذا الملف يحمل
 * التصنيفات فقط، وهو آمن للاستيراد في الواجهة.
 */

export type MusicMood =
  | 'cinematic' | 'inspirational' | 'corporate' | 'epic'
  | 'technology' | 'security' | 'documentary' | 'emotional' | 'energetic';

export const MUSIC_MOODS: { id: MusicMood; label: string }[] = [
  { id: 'cinematic',     label: 'سينمائي' },
  { id: 'inspirational', label: 'ملهم' },
  { id: 'corporate',     label: 'مؤسسي' },
  { id: 'epic',          label: 'ملحمي' },
  { id: 'technology',    label: 'تقني' },
  { id: 'security',      label: 'أمني' },
  { id: 'documentary',   label: 'وثائقي' },
  { id: 'emotional',     label: 'عاطفي' },
  { id: 'energetic',     label: 'حماسي' },
];

export const MOOD_LABEL: Record<string, string> = Object.fromEntries(
  MUSIC_MOODS.map((m) => [m.id, m.label]),
);

/** مقطع كما يصل الواجهة بعد قراءته من مكتبة المنصة */
export interface LibraryTrack {
  id: string;
  title: string;
  mood: string;
  url: string;
  duration: number | null;
  license: string | null;
  attribution: string | null;
}

/**
 * ترتيب المقاطع حسب ملاءمتها للنمط المختار: تصنيفات النمط أولًا ثم البقية.
 * لا يُخفي شيئًا — المستخدم يرى كل ما رفعته المؤسسة، لكن الأنسب يظهر أولًا.
 */
export function tracksForMoods<T extends { mood: string; title: string }>(
  tracks: T[],
  moods: string[],
): T[] {
  const rank = new Map(moods.map((m, i) => [m, i]));
  return [...tracks].sort((a, b) => {
    const ra = rank.has(a.mood) ? rank.get(a.mood)! : 99;
    const rb = rank.has(b.mood) ? rank.get(b.mood)! : 99;
    return ra - rb || a.title.localeCompare(b.title, 'ar');
  });
}
