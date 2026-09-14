/**
 * بطاقات الهوية: خلفيات المشاهد النصية وبطاقة النهاية بالشعارات.
 *
 * تُبنى كصور PNG بمقاس الإطار الكامل عبر Sharp، ثم تدخل خطّ الرندر كأي مادة.
 * الشعارات تحافظ على نسبها الأصلية دائمًا (fit: 'inside')، ولا تُمدّ ولا تُشوّه،
 * ولا تُستخدم كعلامات مائية فوق المحتوى.
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { SAFE } from './timeline';
import type { LogoSettings, RenderOrientation } from './types';

/** ألوان الهوية — مطابقة لـ tailwind.config.ts */
export const BRAND = {
  primary: '#0E5C50',
  primaryDark: '#0A4A40',
  secondary: '#B99C6B',
  background: '#F6F2EA',
  surface: '#FFFFFF',
  ink: '#1A2B28',
} as const;

export interface CardFrame {
  width: number;
  height: number;
  orientation: RenderOrientation;
}

/**
 * خلفية بطاقة: تدرّج مؤسسي هادئ بلون الهوية مع لمسة ذهبية خفيفة.
 * تُستخدم للافتتاحية عند غياب مادة مناسبة، ولبطاقة النهاية.
 */
export async function renderCardBackground(
  frame: CardFrame,
  outPath: string,
  variant: 'dark' | 'light' = 'dark',
): Promise<string> {
  const { width, height, orientation } = frame;
  const dark = variant === 'dark';

  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${orientation === 'vertical' ? 0.3 : 1}" y2="1">
      <stop offset="0%"   stop-color="${dark ? BRAND.primary : BRAND.background}"/>
      <stop offset="100%" stop-color="${dark ? BRAND.primaryDark : '#EFE7D8'}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="${orientation === 'vertical' ? '38%' : '45%'}" r="70%">
      <stop offset="0%"   stop-color="${BRAND.secondary}" stop-opacity="${dark ? 0.16 : 0.1}"/>
      <stop offset="100%" stop-color="${BRAND.secondary}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outPath);
  return outPath;
}

// --------------------------------------------------------------------------
// بطاقة النهاية
// --------------------------------------------------------------------------

export interface EndCardInput {
  frame: CardFrame;
  logos: LogoSettings;
  /** مسارات محلية للشعارات بعد تنزيلها */
  logoPaths: { path: string; scale: number }[];
  outPath: string;
}

/**
 * بطاقة النهاية: خلفية الهوية + صفّ شعارات متوازن + خط ذهبي فاصل.
 * النصوص (اسم البرنامج والمعلومات) تُرسم لاحقًا في طبقة الفيديو، لأنها
 * تحتاج التشكيل العربي الذي يتولاه محرّك النصوص.
 *
 * التوازن: تُوزَّع الشعارات على عرض واحد مشترك بارتفاع بصري متساوٍ،
 * فيبدو الشعار العريض والشعار المربّع بالوزن نفسه لا بالحجم نفسه.
 */
export async function renderEndCard(input: EndCardInput): Promise<{
  path: string;
  /** موضع الخط الذهبي — تُبنى النصوص أسفله */
  ruleY: number;
  logoBandTop: number;
  logoBandBottom: number;
}> {
  const { width, height, orientation } = input.frame;
  const safe = SAFE[orientation];

  const bgPath = input.outPath.replace(/\.png$/, '-bg.png');
  await renderCardBackground(input.frame, bgPath, 'dark');

  const sideMargin = Math.round(width * safe.side);
  const usableWidth = width - sideMargin * 2;

  // شريط الشعارات في الثلث العلوي من المنطقة الآمنة
  const bandTop = Math.round(height * (orientation === 'vertical' ? 0.3 : 0.26));
  const bandHeight = Math.round(height * (orientation === 'vertical' ? 0.12 : 0.16));

  const composites: sharp.OverlayOptions[] = [];

  if (input.logoPaths.length) {
    const count = input.logoPaths.length;
    const gap = Math.round(usableWidth * (count > 2 ? 0.05 : 0.07));
    const slotWidth = Math.floor((usableWidth - gap * (count - 1)) / count);

    // ارتفاع بصري موحّد: كل شعار يُقاس داخل صندوقه مع الحفاظ على نسبته
    const prepared = await Promise.all(
      input.logoPaths.map(async (logo) => {
        const targetH = Math.round(bandHeight * clamp(logo.scale, 0.6, 1.4));
        const targetW = Math.round(slotWidth * clamp(logo.scale, 0.6, 1.4));
        const buf = await sharp(logo.path)
          .resize({
            width: targetW,
            height: targetH,
            fit: 'inside',            // الحفاظ على النسب — لا تمديد ولا تشويه
            withoutEnlargement: false,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer();
        const meta = await sharp(buf).metadata();
        return { buf, w: meta.width ?? targetW, h: meta.height ?? targetH };
      }),
    );

    // توسيط الصفّ ككتلة واحدة
    const totalW = prepared.reduce((s, p) => s + p.w, 0) + gap * (count - 1);
    let x = Math.round((width - totalW) / 2);

    for (const p of prepared) {
      composites.push({
        input: p.buf,
        left: x,
        top: Math.round(bandTop + (bandHeight - p.h) / 2),
      });
      x += p.w + gap;
    }
  }

  // الخط الذهبي الفاصل أسفل الشعارات
  const ruleY = bandTop + bandHeight + Math.round(height * 0.045);
  const ruleWidth = Math.round(usableWidth * 0.28);
  const ruleSvg = `<svg width="${ruleWidth}" height="4" xmlns="http://www.w3.org/2000/svg">
    <rect width="${ruleWidth}" height="4" rx="2" fill="${BRAND.secondary}"/></svg>`;
  composites.push({
    input: Buffer.from(ruleSvg),
    left: Math.round((width - ruleWidth) / 2),
    top: ruleY,
  });

  await sharp(bgPath).composite(composites).png().toFile(input.outPath);
  await fs.unlink(bgPath).catch(() => {});

  return {
    path: input.outPath,
    ruleY,
    logoBandTop: bandTop,
    logoBandBottom: bandTop + bandHeight,
  };
}

// --------------------------------------------------------------------------
// شعار الافتتاحية (ركن صغير محترم — ليس علامة مائية)
// --------------------------------------------------------------------------

/**
 * شعار صغير في ركن الإطار لبداية الفيديو.
 * الحجم مقيّد عمدًا (≤ ٩٪ من عرض الإطار) حتى لا يتحوّل إلى علامة مائية
 * تغطّي المحتوى، والموضع داخل المنطقة الآمنة.
 */
export async function renderCornerLogo(
  logoPath: string,
  frame: CardFrame,
  outPath: string,
): Promise<{ path: string; width: number; height: number; x: number; y: number }> {
  const { width, height, orientation } = frame;
  const safe = SAFE[orientation];

  const targetW = Math.round(width * (orientation === 'vertical' ? 0.26 : 0.14));
  const targetH = Math.round(height * (orientation === 'vertical' ? 0.05 : 0.09));

  const buf = await sharp(logoPath)
    .resize({
      width: targetW,
      height: targetH,
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const meta = await sharp(buf).metadata();
  await fs.writeFile(outPath, buf);

  return {
    path: outPath,
    width: meta.width ?? targetW,
    height: meta.height ?? targetH,
    // أعلى اليمين — يناسب الواجهة العربية RTL
    x: Math.round(width - width * safe.side - (meta.width ?? targetW)),
    y: Math.round(height * safe.top * 0.7),
  };
}

// --------------------------------------------------------------------------

/** تنزيل شعار من رابط عام إلى مسار محلي (للشعارات المرفوعة) */
export async function downloadTo(url: string, destDir: string, name: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`تعذّر تحميل الملف: ${name} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(destDir, name);
  await fs.writeFile(dest, buf);
  return dest;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
