import { NextResponse, type NextRequest } from 'next/server';
import { getMagazineBySlug } from '@/features/magazine/data';
import { buildOfflineHtml } from '@/features/magazine/offlineHtml';

export const maxDuration = 120;

/** تنزيل المجلة المتقلبة كملف HTML واحد يفتح دون اتصال بالإنترنت */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const data = await getMagazineBySlug(params.slug);
  if (!data) return NextResponse.json({ error: 'غير متاح' }, { status: 404 });

  const html = await buildOfflineHtml(data, params.slug);
  const fileName = encodeURIComponent(`${data.course.title} - المجلة الإلكترونية.html`);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
