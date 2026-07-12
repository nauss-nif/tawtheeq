import sharp from 'sharp';

export interface ProcessedImage {
  full: Buffer; // النسخة الرئيسية (≤ 2000px, WebP)
  large: Buffer; // 1200px
  thumb: Buffer; // 400px
  width: number;
  height: number;
  fullSize: number;
  isLowQuality: boolean; // شديدة الضبابية/الظلام
}

const TARGET_MAX_BYTES = 800 * 1024; // ≤ 800KB للناتج الرئيسي
const MAX_DIMENSION = 2000;

/**
 * ضغط ذكي للصور:
 * - auto-orient (تصحيح دوران EXIF)
 * - normalize (تحسين التباين والإضاءة)
 * - تحويل WebP بجودة متكيّفة تُخفَّض تلقائيًا حتى يبقى الناتج ≤ 800KB
 * - مصغرات 400px و1200px
 * - كشف الصور شديدة الضبابية/الظلام عبر إحصائيات Sharp
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input, { failOn: 'none' }).rotate(); // auto-orient
  const meta = await base.metadata();

  // كشف الجودة المنخفضة: صورة داكنة جدًا أو منخفضة التباين (شبه ضبابية)
  const stats = await base.clone().stats();
  const meanBrightness =
    stats.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) /
    Math.min(3, stats.channels.length);
  const meanStdev =
    stats.channels.slice(0, 3).reduce((s, c) => s + c.stdev, 0) /
    Math.min(3, stats.channels.length);
  // عتبات تجريبية: سطوع منخفض جدًا أو تباين شبه معدوم
  const isLowQuality = meanBrightness < 40 || meanStdev < 12;

  // تحسين احترافي تلقائي للصورة: موازنة الإضاءة والتباين، رفع خفيف للتشبّع، وزيادة الوضوح
  const pipeline = base
    .clone()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .normalize() // موازنة التباين والإضاءة تلقائيًا
    .modulate({ brightness: 1.02, saturation: 1.08 }) // إشراق وحيوية ألوان معتدلة
    .sharpen({ sigma: 0.7 }); // زيادة الوضوح بلطف

  // جودة متكيّفة: ابدأ 82% وخفّض تدريجيًا حتى ≤ 800KB
  let quality = 82;
  let full = await pipeline.clone().webp({ quality }).toBuffer();
  while (full.length > TARGET_MAX_BYTES && quality > 45) {
    quality -= 8;
    full = await pipeline.clone().webp({ quality }).toBuffer();
  }

  const large = await base
    .clone()
    .resize({ width: 1200, fit: 'inside', withoutEnlargement: true })
    .normalize()
    .modulate({ brightness: 1.02, saturation: 1.08 })
    .sharpen({ sigma: 0.7 })
    .webp({ quality: 78 })
    .toBuffer();

  const thumb = await base
    .clone()
    .resize({ width: 400, height: 400, fit: 'cover', position: 'attention' })
    .webp({ quality: 72 })
    .toBuffer();

  return {
    full,
    large,
    thumb,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    fullSize: full.length,
    isLowQuality,
  };
}
