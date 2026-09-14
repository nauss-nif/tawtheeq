import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { BUCKET_PROCESSED, mediaPath } from '@/lib/storage';
import { reprocessImage, type ImageEdit } from '@/lib/media/edit';

export const maxDuration = 60;

/**
 * قص وتحسين صورة مرفوعة.
 * المصدر دائمًا نسخة الأصل (master) — تُنشأ من النسخة الحالية أول مرة —
 * حتى يظل التعديل غير تراكمي ويمكن التراجع عنه بإعادة ضبط القيم.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { courseId: string; mediaId: string } },
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });

  // RLS يضمن أن المنسق لا يرى إلا وسائط دوراته
  const { data: media } = await supabase
    .from('media')
    .select('id, course_id, type')
    .eq('id', params.mediaId)
    .eq('course_id', params.courseId)
    .single();
  if (!media || media.type !== 'image')
    return NextResponse.json({ error: 'الصورة غير موجودة' }, { status: 404 });

  let edit: ImageEdit;
  try {
    edit = (await req.json()) as ImageEdit;
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }

  const store = supabase.storage.from(BUCKET_PROCESSED);
  const fullPath = mediaPath(params.courseId, params.mediaId, 'full', 'webp');
  const largePath = mediaPath(params.courseId, params.mediaId, 'large', 'webp');
  const thumbPath = mediaPath(params.courseId, params.mediaId, 'thumb', 'webp');
  const masterPath = mediaPath(params.courseId, params.mediaId, 'master', 'webp');

  // مصدر التحرير: master إن وُجد، وإلا ننشئه من النسخة الحالية
  let source: Buffer;
  const master = await store.download(masterPath);
  if (master.data) {
    source = Buffer.from(await master.data.arrayBuffer());
  } else {
    const current = await store.download(fullPath);
    if (!current.data)
      return NextResponse.json({ error: 'تعذّر تحميل الصورة الأصلية' }, { status: 500 });
    source = Buffer.from(await current.data.arrayBuffer());
    await store.upload(masterPath, new Uint8Array(source), {
      contentType: 'image/webp',
      upsert: true,
    });
  }

  let out;
  try {
    out = await reprocessImage(source, edit);
  } catch {
    return NextResponse.json({ error: 'تعذّرت معالجة الصورة' }, { status: 500 });
  }

  const put = (path: string, data: Buffer) =>
    store.upload(path, new Uint8Array(data), { contentType: 'image/webp', upsert: true });

  const results = await Promise.all([
    put(fullPath, out.full),
    put(largePath, out.large),
    put(thumbPath, out.thumb),
  ]);
  if (results.some((r) => r.error))
    return NextResponse.json({ error: 'تعذّر حفظ الصورة المعدّلة' }, { status: 500 });

  // كسر ذاكرة التخزين المؤقت: المسار ثابت فنغيّر رقم النسخة في الرابط
  const v = Date.now();
  const href = (path: string) => `${store.getPublicUrl(path).data.publicUrl}?v=${v}`;
  const processed_url = href(fullPath);
  const thumbnail_url = href(thumbPath);

  const { error: upErr } = await supabase
    .from('media')
    .update({
      processed_url,
      thumbnail_url,
      file_size: out.fullSize,
      compressed_size: out.fullSize,
      is_low_quality: false,
    })
    .eq('id', media.id);
  if (upErr) return NextResponse.json({ error: 'تعذّر تحديث السجل' }, { status: 500 });

  revalidatePath(`/dashboard/courses/${params.courseId}`);
  return NextResponse.json({ ok: true, processed_url, thumbnail_url });
}
