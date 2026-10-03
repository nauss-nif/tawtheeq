import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import sharp from 'sharp';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { BUCKET_PROCESSED, mediaPath } from '@/lib/storage';
import { reprocessImage, type ImageEdit } from '@/lib/media/edit';

export const maxDuration = 60;

type Params = { params: { courseId: string; mediaId: string } };

/** يتحقق من الجلسة وملكية الصورة (RLS يضمن أن المنسق لا يرى إلا وسائط دوراته) */
async function authorize(courseId: string, mediaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'غير مصرّح' }, { status: 401 }) };
  const { data: media } = await supabase
    .from('media')
    .select('id, course_id, type, processed_url, edit_params')
    .eq('id', mediaId)
    .eq('course_id', courseId)
    .single();
  if (!media || media.type !== 'image')
    return { error: NextResponse.json({ error: 'الصورة غير موجودة' }, { status: 404 }) };
  return { supabase, media };
}

/** هل لنسخة الأصل (master) ملف في التخزين؟ */
async function hasMaster(courseId: string, mediaId: string) {
  const store = createServiceClient().storage.from(BUCKET_PROCESSED);
  const { data } = await store.list(courseId, { search: `${mediaId}-master` });
  return (data ?? []).some((f) => f.name === `${mediaId}-master.webp`);
}

/**
 * بيانات فتح المحرّر: صورة المصدر (الأصل قبل أي تعديل) وآخر إعدادات محفوظة.
 * المحرّر يعرض الأصل ويطبّق عليه الإعدادات، فتتطابق إحداثيات القص مع ما يطبّقه الخادم.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await authorize(params.courseId, params.mediaId);
  if ('error' in auth) return auth.error;
  const { media } = auth;

  let source = media.processed_url;
  if (await hasMaster(params.courseId, params.mediaId)) {
    const store = createServiceClient().storage.from(BUCKET_PROCESSED);
    source = store.getPublicUrl(mediaPath(params.courseId, params.mediaId, 'master', 'webp')).data.publicUrl;
  }
  return NextResponse.json({ source, params: media.edit_params ?? null });
}

/**
 * قص وتحسين صورة مرفوعة.
 * المصدر دائمًا نسخة الأصل (master) — تُنشأ من النسخة الحالية أول مرة —
 * حتى يظل التعديل غير تراكمي ويمكن التراجع عنه بإعادة ضبط القيم.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await authorize(params.courseId, params.mediaId);
  if ('error' in auth) return auth.error;
  const { supabase, media } = auth;

  let body: ImageEdit & { params?: unknown };
  try {
    body = (await req.json()) as ImageEdit & { params?: unknown };
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }
  const { params: editorState, ...edit } = body;

  // الكتابة فوق ملفات قائمة (upsert) تتطلب صلاحية UPDATE على التخزين وهي غير ممنوحة للمنسق؛
  // تحققنا من ملكية الصورة أعلاه عبر RLS، فنكتب بعميل الخدمة
  const store = createServiceClient().storage.from(BUCKET_PROCESSED);
  const fullPath = mediaPath(params.courseId, params.mediaId, 'full', 'webp');
  const largePath = mediaPath(params.courseId, params.mediaId, 'large', 'webp');
  const thumbPath = mediaPath(params.courseId, params.mediaId, 'thumb', 'webp');
  const masterPath = mediaPath(params.courseId, params.mediaId, 'master', 'webp');

  // مصدر التحرير: master إن وُجد، وإلا ننشئه من النسخة الحالية (التي لم تُعدَّل بعد)
  let source: Buffer;
  const master = await store.download(masterPath);
  if (master.data) {
    source = Buffer.from(await master.data.arrayBuffer());
  } else {
    const current = await store.download(fullPath);
    if (!current.data)
      return NextResponse.json({ error: 'تعذّر تحميل الصورة الأصلية' }, { status: 500 });
    source = Buffer.from(await current.data.arrayBuffer());
    const saved = await store.upload(masterPath, new Uint8Array(source), { contentType: 'image/webp', upsert: true });
    // بدون نسخة أصل محفوظة سيُطبَّق التعديل التالي على صورة معدّلة فيتراكم ويختل القص
    if (saved.error) {
      console.error('[media/edit] master upload failed:', saved.error);
      return NextResponse.json({ error: 'تعذّر حفظ نسخة الأصل' }, { status: 500 });
    }
  }

  let out;
  try {
    out = await reprocessImage(source, edit);
  } catch (e) {
    console.error('[media/edit] reprocess failed:', e);
    return NextResponse.json({ error: 'تعذّرت معالجة الصورة' }, { status: 500 });
  }

  const put = (path: string, data: Buffer) =>
    store.upload(path, new Uint8Array(data), { contentType: 'image/webp', upsert: true });

  const results = await Promise.all([
    put(fullPath, out.full),
    put(largePath, out.large),
    put(thumbPath, out.thumb),
  ]);
  const failed = results.find((r) => r.error);
  if (failed) {
    console.error('[media/edit] upload failed:', failed.error);
    return NextResponse.json({ error: 'تعذّر حفظ الصورة المعدّلة' }, { status: 500 });
  }

  // كسر ذاكرة التخزين المؤقت: المسار ثابت فنغيّر رقم النسخة في الرابط
  const v = Date.now();
  const href = (path: string) => `${store.getPublicUrl(path).data.publicUrl}?v=${v}`;
  const processed_url = href(fullPath);
  const thumbnail_url = href(thumbPath);
  const meta = await sharp(out.full).metadata();

  // إعدادات المحرّر كما هي (كائن صغير) ليُفتح عليها المحرّر لاحقًا
  const edit_params =
    editorState && typeof editorState === 'object' && JSON.stringify(editorState).length < 4000
      ? (editorState as Record<string, unknown>)
      : null;

  const { error: upErr } = await supabase
    .from('media')
    .update({
      processed_url,
      thumbnail_url,
      file_size: out.fullSize,
      compressed_size: out.fullSize,
      is_low_quality: false,
      width: meta.width ?? null,
      height: meta.height ?? null,
      edit_params,
    })
    .eq('id', media.id);
  if (upErr) {
    console.error('[media/edit] row update failed:', upErr);
    return NextResponse.json({ error: 'تعذّر تحديث السجل' }, { status: 500 });
  }

  revalidatePath(`/dashboard/courses/${params.courseId}`);
  return NextResponse.json({ ok: true, processed_url, thumbnail_url });
}
