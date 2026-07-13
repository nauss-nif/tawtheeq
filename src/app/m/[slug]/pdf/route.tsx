import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { renderToBuffer } from '@react-pdf/renderer';
import { getMagazineBySlug, type MagazineData } from '@/features/magazine/data';
import { MagazinePDF, type PdfAssets } from '@/features/magazine/pdf';

export const maxDuration = 120;

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
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(input)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  }
}

async function buildAssets(data: MagazineData): Promise<PdfAssets> {
  const [fontRegular, fontSemiBold, logoNauss, logoMoi, logoNaussWhite] = await Promise.all([
    fileDataUrl('fonts/Cairo.ttf', 'font/ttf'),
    fileDataUrl('fonts/Cairo.ttf', 'font/ttf'),
    fileDataUrl('logo-nauss.png', 'image/png'),
    fileDataUrl('logo-moi.png', 'image/png'),
    fileDataUrl('logo-nauss-white.png', 'image/png'),
  ]);

  const coverSrc = data.cover?.processed_url ?? data.landmarkUrl ?? null;
  const coverImage = coverSrc ? await toJpegDataUrl(coverSrc, 1400) : null;
  // معلم المدينة كخلفية شفافة (إن وُجد)
  const watermark = data.landmarkUrl ? await toJpegDataUrl(data.landmarkUrl, 900) : null;

  // أول 12 صورة للمعرض (لتفادي ملفات ضخمة)
  const gallery = data.images.slice(0, 16);
  const images = (
    await Promise.all(
      gallery.map(async (m) => {
        const src = await toJpegDataUrl(m.processed_url ?? m.thumbnail_url ?? '', 1200);
        return src ? { src, caption: m.caption } : null;
      }),
    )
  ).filter((x): x is { src: string; caption: string | null } => x !== null);

  return {
    fontRegular,
    fontSemiBold,
    logoNauss,
    logoMoi,
    logoNaussWhite,
    watermark,
    showMoi: data.course.show_partnership_logo,
    coverImage,
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
