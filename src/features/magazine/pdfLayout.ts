import type { Session } from '@/lib/database.types';
import { orientationOf, packImagePages } from './imageLayout';

/**
 * مخطِّط أبعاد صور الـPDF: يحدّد لكل صورة نسبة العرض/الارتفاع (aspect) المطلوبة حسب موضعها،
 * لقصّها بذكاء نحو الوجوه على الخادم فتملأ موضعها دون قصّ الوجوه.
 *
 * النموذج (imageLayout.ts): أول صورة في كل محور = صفحة رئيسية (صورة + عنوان + نص)،
 * وبقية الصور مجمّعة حسب الاتجاه: صورتان طوليتان جنبًا إلى جنب في صفحة، والأفقية صفحة كاملة.
 */

/** مقاس الصفحة المربعة: ٢١×٢١ سم بالنقاط */
export const PDF_PAGE: [number, number] = [595.28, 595.28];
/** ارتفاع شريط صورة صفحة المحور الرئيسية */
export const PDF_HERO_BAND = 300;
/** ارتفاع شريط العنوان فوق صور الصفحة */
export const PDF_TITLE_BAND = 84;
/** الفاصل بين صورتين طوليتين في الصفحة نفسها */
export const PDF_PAIR_GAP = 6;

const IMAGE_AREA_H = PDF_PAGE[1] - PDF_TITLE_BAND - 4;

const ASPECT = {
  sessionHero: PDF_PAGE[0] / PDF_HERO_BAND, // صورة المحور الرئيسية (شريط ملء العرض مع النص)
  bigImage: PDF_PAGE[0] / IMAGE_AREA_H, // صورة أفقية تملأ الصفحة تحت عنوان المحور
  portraitCell: (PDF_PAGE[0] - PDF_PAIR_GAP) / 2 / IMAGE_AREA_H, // نصف الصفحة لصورة طولية
};

interface ImgMeta {
  id: string;
  session_id: string | null;
  width?: number | null;
  height?: number | null;
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
  const planPages = (list: ImgMeta[]) => {
    for (const slot of packImagePages(list)) {
      for (const m of slot.images) {
        out.set(m.id, slot.kind === 'pair' || orientationOf(m) === 'portrait' ? ASPECT.portraitCell : ASPECT.bigImage);
      }
    }
  };

  for (const s of sessions) {
    const arr = bySession.get(s.id)!;
    if (arr[0]) out.set(arr[0].id, ASPECT.sessionHero);
    planPages(arr.slice(1));
  }
  planPages(unassigned);
  return out;
}
