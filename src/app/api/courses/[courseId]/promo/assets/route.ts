import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const MAX_LOGO_BYTES = 5 * 1024 * 1024;   // 5MB
const MAX_MUSIC_BYTES = 25 * 1024 * 1024; // 25MB

/**
 * رفع أصل للبرومو: شعار إضافي أو ملف موسيقي خاص.
 *
 * الشعارات تُحوَّل إلى PNG بشفافية محفوظة ودقة كافية للفيديو، دون تغيير
 * نسبها الأصلية إطلاقًا.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { courseId: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });

  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .eq('id', params.courseId)
    .single();
  if (!course) return NextResponse.json({ error: 'البرنامج غير موجود' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const kind = String(form.get('kind') ?? '');
  const promoId = (form.get('promoId') as string | null) || null;

  if (!file) return NextResponse.json({ error: 'لا يوجد ملف' }, { status: 400 });
  if (kind !== 'logo' && kind !== 'music') {
    return NextResponse.json({ error: 'نوع الأصل غير مدعوم' }, { status: 400 });
  }

  if (kind === 'logo') {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'الشعار يجب أن يكون صورة' }, { status: 400 });
    }
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: 'حجم الشعار يتجاوز 5 ميغابايت' }, { status: 400 });
    }

    // حدّ الشعارات الإضافية: شعاران بجانب شعار الجامعة
    const { count } = await supabase
      .from('promo_assets')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', course.id)
      .eq('kind', 'logo');
    if ((count ?? 0) >= 2) {
      return NextResponse.json(
        { error: 'الحد الأقصى شعاران إضافيان بجانب شعار الجامعة' },
        { status: 400 },
      );
    }
  } else if (file.size > MAX_MUSIC_BYTES) {
    return NextResponse.json({ error: 'حجم الملف الموسيقي يتجاوز 25 ميغابايت' }, { status: 400 });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  let data: Buffer = raw;
  let mime = file.type;
  let width: number | null = null;
  let height: number | null = null;

  if (kind === 'logo') {
    // إعادة القياس داخل صندوق كبير مع الحفاظ التام على النسبة
    const png = await sharp(raw)
      .resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const meta = await sharp(png).metadata();
    data = png;
    mime = 'image/png';
    width = meta.width ?? null;
    height = meta.height ?? null;
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-60);
  const storagePath = `${course.id}/${promoId ?? 'shared'}/${kind}-${Date.now()}-${safeName}${
    kind === 'logo' ? '.png' : ''
  }`;

  const { error: upErr } = await supabase.storage
    .from('promo')
    .upload(storagePath, new Uint8Array(data), { contentType: mime, upsert: true });
  if (upErr) {
    return NextResponse.json({ error: `تعذّر الرفع: ${upErr.message}` }, { status: 500 });
  }

  const url = supabase.storage.from('promo').getPublicUrl(storagePath).data.publicUrl;

  const { data: asset, error: insErr } = await supabase
    .from('promo_assets')
    .insert({
      promo_id: promoId,
      course_id: course.id,
      kind,
      url,
      storage_path: storagePath,
      mime,
      file_size: data.byteLength,
      width,
      height,
      meta: { originalName: file.name },
    })
    .select('id, url, width, height')
    .single();

  if (insErr || !asset) {
    return NextResponse.json({ error: 'تعذّر حفظ الأصل' }, { status: 500 });
  }

  return NextResponse.json(asset);
}

/** حذف أصل مرفوع (شعار أو موسيقى) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { courseId: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'معرّف الأصل مفقود' }, { status: 400 });

  const { data: asset } = await supabase
    .from('promo_assets')
    .select('id, storage_path, course_id')
    .eq('id', id)
    .single();

  if (!asset || asset.course_id !== params.courseId) {
    return NextResponse.json({ error: 'الأصل غير موجود' }, { status: 404 });
  }

  if (asset.storage_path) await supabase.storage.from('promo').remove([asset.storage_path]);
  await supabase.from('promo_assets').delete().eq('id', id);

  return NextResponse.json({ success: true });
}
