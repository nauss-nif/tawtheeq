import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { renderToBuffer } from '@react-pdf/renderer';
import { getMagazineBySlug, type MagazineData } from '@/features/magazine/data';
import { MagazinePDF, type PdfAssets } from '@/features/magazine/pdf';
import { planImageAspects } from '@/features/magazine/pdfLayout';

// معالجة كل صور المجلة (قصّ ذكي وتحسين) قد تتجاوز دقيقتين للمجلات الكبيرة
export const maxDuration = 300;

/**
 * سلسلة التحسين الاحترافي التلقائي للصور:
 * تصحيح الاتجاه، موازنة التباين، رفع الإشباع والسطوع قليلًا، وزيادة الوضوح.
 */
function enhance(img: sharp.Sharp): sharp.Sharp {
  return img
    .rotate() // احترام اتجاه EXIF
    .modulate({ brightness: 1.03, saturation: 1.1 })
    .normalize() // شدّ التباين تلقائيًا
    .sharpen({ sigma: 0.7 });
}

/**
 * قصّ ذكي نحو الوجوه/مركز الاهتمام إلى النسبة المطلوبة + تحسين احترافي.
 * تُملأ الصورة موضعها في التصميم دون قصّ الوجوه.
 */
async function toSmartJpeg(
  url: string,
  aspect: number,
  longSide = 1500,
): Promise<{ src: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    let w: number;
    let h: number;
    if (aspect >= 1) {
      w = longSide;
      h = Math.round(longSide / aspect);
    } else {
      h = longSide;
      w = Math.round(longSide * aspect);
    }
    const jpeg = await enhance(
      sharp(input).resize({ width: w, height: h, fit: 'cover', position: sharp.strategy.attention }),
    )
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
    const meta = await sharp(jpeg).metadata();
    return {
      src: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      w: meta.width ?? w,
      h: meta.height ?? h,
    };
  } catch {
    return null;
  }
}

/** يقرأ ملفًا من public ويعيده كـ data URL */
async function fileDataUrl(rel: string, mime: string): Promise<string> {
  const buf = await fs.readFile(path.join(process.cwd(), 'public', rel));
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * يجلب صورة (WebP/JPG) ويحوّلها إلى JPEG base64 صالحة للـ PDF.
 * @react-pdf لا يعرض WebP، لذا نحوّل كل صورة إلى JPEG على الخادم.
 */
async function toJpegDataUrl(url: string, maxWidth: number): Promise<string | null> {
  const r = await toJpegSized(url, maxWidth);
  return r ? r.src : null;
}

/** يحوّل الصورة إلى JPEG ويعيد أبعادها الفعلية (لضبط الإطار بدقّة في الـPDF) */
async function toJpegSized(
  url: string,
  maxWidth: number,
): Promise<{ src: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await enhance(sharp(input).resize({ width: maxWidth, withoutEnlargement: true }))
      .jpeg({ quality: 84 })
      .toBuffer();
    const meta = await sharp(jpeg).metadata();
    return {
      src: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      w: meta.width ?? maxWidth,
      h: meta.height ?? maxWidth,
    };
  } catch {
    return null;
  }
}

async function buildAssets(data: MagazineData): Promise<PdfAssets> {
  const [fontRegular, fontSemiBold, fontLatinRegular, fontLatinSemiBold, logoNauss, logoMoi, logoNaussWhite, logoStar] = await Promise.all([
    fileDataUrl('fonts/ElMessiri-PDF-Regular.ttf', 'font/ttf'),
    fileDataUrl('fonts/ElMessiri-PDF-SemiBold.ttf', 'font/ttf'),
    fileDataUrl('fonts/NotoSans-LatinExt-400.woff', 'font/woff'),
    fileDataUrl('fonts/NotoSans-LatinExt-600.woff', 'font/woff'),
    fileDataUrl('logo-nauss.png', 'image/png'),
    fileDataUrl('logo-moi.png', 'image/png'),
    fileDataUrl('logo-nauss-white.png', 'image/png'),
    fileDataUrl('logo-star.png', 'image/png'),
  ]);

  const coverSrc = data.cover?.processed_url ?? data.landmarkUrl ?? null;
  const coverImage = coverSrc ? await toJpegDataUrl(coverSrc, 1400) : null;

  // مُعِدّ المجلة (المنسق) مع صورته
  const coordinator = data.coordinator
    ? {
        name: data.coordinator.full_name,
        jobTitle: data.coordinator.job_title,
        avatar: data.coordinator.avatar_url ? await toJpegDataUrl(data.coordinator.avatar_url, 240) : null,
      }
    : null;
  // معلم المدينة كخلفية شفافة (إن وُجد)
  const watermark = data.landmarkUrl ? await toJpegDataUrl(data.landmarkUrl, 900) : null;

  // خريطة أبعاد كل صورة حسب موضعها في التصميم (للقصّ الذكي نحو الوجوه)
  const aspectById = planImageAspects(data.sessions, data.images);

  // نحوّل الصور (لتفادي ملفات ضخمة نكتفي بحدٍّ معقول): قصّ ذكي + تحسين احترافي
  const gallery = data.images.slice(0, 40);
  const images = (
    await Promise.all(
      gallery.map(async (m) => {
        const url = m.processed_url ?? m.thumbnail_url ?? '';
        const aspect = aspectById.get(m.id);
        const r = aspect ? await toSmartJpeg(url, aspect) : await toJpegSized(url, 1200);
        return r ? { src: r.src, caption: m.caption, sessionId: m.session_id, w: r.w, h: r.h } : null;
      }),
    )
  ).filter(
    (x): x is { src: string; caption: string | null; sessionId: string | null; w: number; h: number } => x !== null,
  );

  return {
    fontRegular,
    fontSemiBold,
    fontLatinRegular,
    fontLatinSemiBold,
    logoNauss,
    logoMoi,
    logoNaussWhite,
    logoStar,
    watermark,
    showMoi: data.course.show_partnership_logo,
    coverImage,
    coordinator,
    images,
  };
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const data = await getMagazineBySlug(params.slug);
  if (!data) return NextResponse.json({ error: 'غير متاح' }, { status: 404 });

  const assets = await buildAssets(data);
  const buffer = await renderToBuffer(
    <MagazinePDF course={data.course} sessions={data.sessions} assets={assets} />,
  );
  const fileName = encodeURIComponent(`${data.course.title}.pdf`);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
