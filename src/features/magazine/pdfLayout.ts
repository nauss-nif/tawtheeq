import type { Session } from '@/lib/database.types';

/**
 * مخطِّط أبعاد صور الـPDF: يحدّد لكل صورة نسبة العرض/الارتفاع (aspect) المطلوبة
 * حسب موضعها، لقصّها بذكاء نحو الوجوه على الخادم فتملأ موضعها دون قصّ الوجوه.
 *
 * النموذج: أول صورة في كل محور = صفحة رئيسية (صورة + عنوان + نص).
 * بقية الصور = صفحة كبيرة لكل صورة، فوقها عنوان المحور فقط. لا يوجد «معرض».
 */

/** مقاس الصفحة المربعة: ٢١×٢١ سم بالنقاط */
export const PDF_PAGE: [number, number] = [595.28, 595.28];
/** ارتفاع شريط صورة صفحة المحور الرئيسية */
export const PDF_HERO_BAND = 300;
/** ارتفاع شريط العنوان فوق الصورة الكبيرة */
export const PDF_TITLE_BAND = 84;

const ASPECT = {
  sessionHero: PDF_PAGE[0] / PDF_HERO_BAND, // صورة المحور الرئيسية (شريط ملء العرض مع النص)
  bigImage: PDF_PAGE[0] / (PDF_PAGE[1] - PDF_TITLE_BAND - 4), // صورة كبيرة تملأ الصفحة تحت عنوان المحور
};

interface ImgMeta {
  id: string;
  session_id: string | null;
}

/** يعيد خريطة: معرّف الصورة → نسبة العرض/الارتفاع المطلوبة لموضعها */
export function planImageAspects(sessions: Session[], images: ImgMeta[]): Map<string, number> {
  const bySession = new Map<string, ImgMeta[]>();
  for (const s of sessions) bySession.set(s.id, []);
  const unassigned: ImgMeta[] = [];
  for (const m of images) {
    if (m.session_id && bySession.has(m.session_id)) bySession.get(m.session_id)!.push(m);
    else unassigned.push(m);
  }

  const out = new Map<string, number>();

  // صور المحاور: الأولى رئيسية، والباقي صور كبيرة
  for (const s of sessions) {
    const arr = bySession.get(s.id)!;
    arr.forEach((m, i) => out.set(m.id, i === 0 ? ASPECT.sessionHero : ASPECT.bigImage));
  }

  // الصور غير المرتبطة: صور كبيرة أيضًا
  for (const m of unassigned) out.set(m.id, ASPECT.bigImage);

  return out;
}
