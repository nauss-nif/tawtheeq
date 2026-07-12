import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createClient } from '@/lib/supabase/server';
import { processMediaFile } from '@/lib/media/pipeline';
import { UPLOAD_LIMITS } from '@/lib/validations';

export const maxDuration = 60; // متوافق مع خطة Vercel المجانية (الصور تُعالَج بسرعة)

/** رفع ملف وسائط واحد ومعالجته */
export async function POST(
  req: NextRequest,
  { params }: { params: { courseId: string } },
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });

  // تحقّق من ملكية الدورة (RLS يقيّد القراءة أصلًا)
  const { data: course } = await supabase
    .from('courses')
    .select('id, title, start_date, coordinator_id')
    .eq('id', params.courseId)
    .single();
  if (!course) return NextResponse.json({ error: 'الدورة غير موجودة' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'لا يوجد ملف' }, { status: 400 });

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo)
    return NextResponse.json({ error: 'نوع الملف غير مدعوم' }, { status: 400 });

  // فرض الحدود على الحجم والعدد
  if (isImage && file.size > UPLOAD_LIMITS.maxImageBytes)
    return NextResponse.json({ error: 'حجم الصورة يتجاوز 10 ميغابايت' }, { status: 400 });
  if (isVideo && file.size > UPLOAD_LIMITS.maxVideoBytes)
    return NextResponse.json({ error: 'حجم الفيديو يتجاوز 200 ميغابايت' }, { status: 400 });

  const type = isImage ? 'image' : 'video';
  const { count } = await supabase
    .from('media')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', course.id)
    .eq('type', type);

  const max = isImage ? UPLOAD_LIMITS.maxImages : UPLOAD_LIMITS.maxVideos;
  if ((count ?? 0) >= max)
    return NextResponse.json(
      { error: `تجاوزت الحد الأقصى (${max} ${isImage ? 'صورة' : 'فيديو'})` },
      { status: 400 },
    );

  // أنشئ سجل media (pending) عبر عميل المستخدم لاحترام RLS
  const { data: media, error: insErr } = await supabase
    .from('media')
    .insert({
      course_id: course.id,
      type,
      caption: null,
      sort_order: count ?? 0,
      processing_status: 'pending',
    })
    .select('id')
    .single();
  if (insErr || !media)
    return NextResponse.json({ error: 'تعذّر إنشاء السجل' }, { status: 500 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // معالجة (تُشغَّل في نفس الطلب؛ الواجهة تتابع الحالة عبر Realtime)
  try {
    if (isImage) {
      await processMediaFile({
        supabase, // عميل المستخدم المُصادَق (RLS) — لا يحتاج مفتاحًا سريًا
        mediaId: media.id,
        course,
        type,
        originalName: file.name,
        originalSize: file.size,
        buffer,
      });
    } else {
      const tmp = path.join(os.tmpdir(), `up-${media.id}-${file.name}`);
      await fs.writeFile(tmp, buffer);
      await processMediaFile({
        supabase,
        mediaId: media.id,
        course,
        type,
        originalName: file.name,
        originalSize: file.size,
        tempPath: tmp,
      });
      await fs.unlink(tmp).catch(() => {});
    }
  } catch (e) {
    console.error('processing failed', e);
    // الحالة عُلّمت failed داخل الـ pipeline
  }

  return NextResponse.json({ id: media.id });
}
