/**
 * تخطيط صور المحور حسب المقاس — مشترك بين الموقع والمجلة المتقلبة والنسخة دون اتصال والـPDF:
 *
 * ١. الترتيب: الصورة الرئيسية للمحور أولًا كما هي، ثم بقية الصور مجمّعة حسب الاتجاه بترتيب
 *    أول ظهور: إن ظهرت صورة طولية تتبعها كل الصور الطولية بترتيبها، وكذلك الأفقية.
 * ٢. الصفحات: كل صورتين طوليتين متتاليتين في صفحة واحدة جنبًا إلى جنب (توفير الصفحات)،
 *    والأفقية صفحة كاملة لكل صورة لأنها تملأ الصفحة جيدًا.
 */
export type Orientation = 'portrait' | 'landscape';

export interface Sized {
  width?: number | null;
  height?: number | null;
}

/** طولية إن زاد ارتفاعها عن عرضها بوضوح؛ المربعة والمجهولة الأبعاد تُعامل أفقية */
export function orientationOf(m: Sized): Orientation {
  return m.width && m.height && m.height > m.width * 1.05 ? 'portrait' : 'landscape';
}

/** يجمّع الصور حسب الاتجاه بترتيب أول ظهور مع الحفاظ على ترتيبها داخل كل مجموعة */
export function groupByOrientation<T extends Sized>(images: T[]): T[] {
  const first = images.length ? orientationOf(images[0]) : 'landscape';
  const same = images.filter((m) => orientationOf(m) === first);
  const other = images.filter((m) => orientationOf(m) !== first);
  return [...same, ...other];
}

/** صور صفحة واحدة: صورة أفقية واحدة أو صورتان طوليتان (أو طولية منفردة) */
export interface ImageSlot<T> {
  kind: 'single' | 'pair';
  images: T[];
}

/** يوزّع صور المحور (عدا الرئيسية) على صفحات حسب الاتجاه */
export function packImagePages<T extends Sized>(images: T[]): ImageSlot<T>[] {
  const ordered = groupByOrientation(images);
  const pages: ImageSlot<T>[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const m = ordered[i];
    const next = ordered[i + 1];
    if (orientationOf(m) === 'portrait' && next && orientationOf(next) === 'portrait') {
      pages.push({ kind: 'pair', images: [m, next] });
      i++;
    } else {
      pages.push({ kind: 'single', images: [m] });
    }
  }
  return pages;
}

/** عدد صفحات المحور: صفحته الرئيسية + صفحات بقية الصور */
export function sessionPageCount<T extends Sized>(images: T[]): number {
  return 1 + packImagePages(images.slice(1)).length;
}
