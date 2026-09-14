import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getMagazineBySlug } from '@/features/magazine/data';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const W = 1200;
const H = 630;
const GREEN = { r: 14, g: 92, b: 80 };

/** تدرّج أخضر شفاف أسفل الصورة (PNG عبر Buffer خام — دون SVG لتفادي مشاكل التشغيل) */
async function gradientPng(): Promise<Buffer> {
  const raw = Buffer.alloc(H * 4);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const a = t < 0.45 ? 0 : Math.round(((t - 0.45) / 0.55) * 0.9 * 255);
    const i = y * 4;
    raw[i] = GREEN.r;
    raw[i + 1] = GREEN.g;
    raw[i + 2] = GREEN.b;
    raw[i + 3] = a;
  }
  return sharp(raw, { raw: { width: 1, height: H, channels: 4 } }).resize(W, H, { fit: 'fill' }).png().toBuffer();
}

/**
 * صورة معاينة (Open Graph) بصيغة JPEG لمشاركة الرابط: غلاف الدورة 1200×630
 * مع تدرّج أخضر وشعار الجامعة. تُعيد دائمًا صورة صالحة (fallback أخضر عند أي خطأ).
 */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const jpeg = await buildOg(params.slug).catch(() => null);
  const out =
    jpeg ??
    (await sharp({ create: { width: W, height: H, channels: 3, background: GREEN } }).jpeg().toBuffer());
  return new NextResponse(new Uint8Array(out), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  });
}

async function buildOg(slug: string): Promise<Buffer> {
  const data = await getMagazineBySlug(slug);
  const coverUrl = data?.cover?.processed_url ?? data?.landmarkUrl ?? null;

  let base: sharp.Sharp;
  if (coverUrl) {
    const res = await fetch(coverUrl, { next: { revalidate: 3600 } });
    const buf = Buffer.from(await res.arrayBuffer());
    base = sharp(buf).resize({ width: W, height: H, fit: 'cover', position: sharp.strategy.attention });
  } else {
    base = sharp({ create: { width: W, height: H, channels: 3, background: GREEN } });
  }

  const composites: sharp.OverlayOptions[] = [{ input: await gradientPng(), top: 0, left: 0 }];
  try {
    const logoBuf = await fs.readFile(path.join(process.cwd(), 'public', 'logo-nauss-white.png'));
    const logo = await sharp(logoBuf)
      .resize({ height: 84 })
      .extend({ bottom: 40, right: 56, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    composites.push({ input: logo, gravity: 'southeast' });
  } catch {
    // تجاهل الشعار إن تعذّر
  }

  return base.composite(composites).jpeg({ quality: 86 }).toBuffer();
}
