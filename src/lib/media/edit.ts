import sharp from 'sharp';
import { getImageFilter } from './filters';

/** تعديلات المستخدم على صورة مرفوعة (قص/تدوير/تحسين) */
export interface ImageEdit {
  /** مستطيل القص بنسب 0..1 من أبعاد الصورة بعد التدوير */
  crop?: { x: number; y: number; w: number; h: number };
  /** زاوية التدوير: 0 | 90 | 180 | 270 */
  rotate?: number;
  brightness?: number; // 1 = بلا تغيير
  contrast?: number;
  saturation?: number;
  /** معرّف فلتر جاهز من IMAGE_FILTERS (يُطبَّق قبل التباين) */
  filter?: string;
}

export interface EditedImage {
  full: Buffer;
  large: Buffer;
  thumb: Buffer;
  fullSize: number;
}

const MAX_DIMENSION = 2000;
const TARGET_MAX_BYTES = 800 * 1024;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

/**
 * إعادة توليد نسخ الصورة (full / large / thumb) بعد قصّ وتحسين يدويين.
 * تُطبَّق دائمًا على نسخة الأصل (master) لا على النسخة المعدّلة سابقًا،
 * حتى لا تتراكم خسارة الجودة مع كل تعديل.
 */
export async function reprocessImage(input: Buffer, edit: ImageEdit): Promise<EditedImage> {
  const angle = ((Math.round((edit.rotate ?? 0) / 90) * 90) % 360 + 360) % 360;

  // نُثبّت التدوير أولًا ليكون فضاء إحداثيات القص هو نفسه الذي رآه المستخدم
  let buf = angle === 0
    ? input
    : await sharp(input, { failOn: 'none' }).rotate(angle).toBuffer();

  if (edit.crop) {
    const meta = await sharp(buf, { failOn: 'none' }).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (W > 0 && H > 0) {
      const left = Math.round(clamp(edit.crop.x, 0, 0.99) * W);
      const top = Math.round(clamp(edit.crop.y, 0, 0.99) * H);
      const width = Math.max(16, Math.min(W - left, Math.round(clamp(edit.crop.w, 0.01, 1) * W)));
      const height = Math.max(16, Math.min(H - top, Math.round(clamp(edit.crop.h, 0.01, 1) * H)));
      // نتجاهل القص إن كان يغطي الصورة كاملة (توفير معالجة)
      if (left > 0 || top > 0 || width < W || height < H) {
        buf = await sharp(buf, { failOn: 'none' }).extract({ left, top, width, height }).toBuffer();
      }
    }
  }

  // قيم المنزلقات مضروبة في مضاعفات الفلتر المختار
  const fx = getImageFilter(edit.filter);
  const brightness = clamp((edit.brightness ?? 1) * fx.brightness, 0.4, 2);
  const saturation = clamp((edit.saturation ?? 1) * fx.saturation, 0, 2.4);
  const contrast = clamp((edit.contrast ?? 1) * fx.contrast, 0.4, 2.4);
  // التباين حول الرمادي المتوسط مع إزاحة الفلتر لكل قناة: c·(x + o − ½) + ½
  const offsets = fx.offset.map((o) => contrast * o * 255 + 128 * (1 - contrast));

  // الترتيب نفسه في معاينة المتصفح: سطوع وتشبّع ← مصفوفة الفلتر ← تباين
  const tuned = (img: sharp.Sharp) => {
    let p = img.modulate({ brightness, saturation });
    if (fx.id !== 'none') p = p.removeAlpha().recomb(fx.matrix as sharp.Matrix3x3);
    return p.linear([contrast, contrast, contrast], offsets).sharpen({ sigma: 0.6 });
  };

  const fullPipe = tuned(
    sharp(buf, { failOn: 'none' }).resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    }),
  );

  let quality = 82;
  let full = await fullPipe.clone().webp({ quality }).toBuffer();
  while (full.length > TARGET_MAX_BYTES && quality > 45) {
    quality -= 8;
    full = await fullPipe.clone().webp({ quality }).toBuffer();
  }

  const large = await tuned(
    sharp(buf, { failOn: 'none' }).resize({ width: 1200, fit: 'inside', withoutEnlargement: true }),
  )
    .webp({ quality: 78 })
    .toBuffer();

  const thumb = await tuned(
    // الصورة كاملة دون قصّ مربع، حتى تطابق المعاينة ما يظهر في المجلة
    sharp(buf, { failOn: 'none' }).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }),
  )
    .webp({ quality: 72 })
    .toBuffer();

  return { full, large, thumb, fullSize: full.length };
}
