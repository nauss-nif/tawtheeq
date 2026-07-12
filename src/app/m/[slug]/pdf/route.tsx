import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getMagazineBySlug } from '@/features/magazine/data';
import { MagazinePDF } from '@/features/magazine/pdf';

export const maxDuration = 120;

/** توليد وتنزيل PDF للمجلة */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const data = await getMagazineBySlug(params.slug);
  if (!data) return NextResponse.json({ error: 'غير متاح' }, { status: 404 });

  const buffer = await renderToBuffer(<MagazinePDF data={data} />);
  const fileName = encodeURIComponent(`${data.course.title}.pdf`);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
