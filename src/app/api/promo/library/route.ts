import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';
import { LIBRARY_BUCKET, libraryPath } from '@/lib/promo/library';

export const maxDuration = 60;

const MAX_MUSIC_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_LOGO_BYTES = 5 * 1024 * 1024;   // 5MB

/**
 * رفع عنصر إلى مكتبة المنصة الثابتة — للمدير وحده.
 *
 * الشعارات تُحوَّل إلى PNG بشفافية محفوظة ونسبة أصلية لم تُمَسّ.
 * المقاطع الموسيقية تُخزَّن كما هي، ويُسجَّل ترخيصها إلزاميًا.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' || profile.status !== 'active') {
    return NextResponse.json({ error: 'رفع عناصر المكتبة للمدير فقط' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const kind = String(form.get('kind') ?? '');
  const title = String(form.get('title') ?? '').trim();
  const subtitle = String(form.get('subtitle') ?? '').trim();
  const license = String(form.get('license') ?? '').trim();
  const attribution = String(form.get('attribution') ?? '').trim();

  if (!file) return NextResponse.json({ error: 'لا يوجد ملف' }, { status: 400 });
  if (kind !== 'music' && kind !== 'logo') {
    return NextResponse.json({ error: 'نوع العنصر غير مدعوم' }, { status: 400 });
  }
  if (!title) return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 });

  if (kind === 'music') {
    if (!file.type.startsWith('audio/')) {
      return NextResponse.json({ error: 'الملف يجب أن يكون صوتيًا' }, { status: 400 });
    }
    if (file.size > MAX_MUSIC_BYTES) {
      return NextResponse.json({ error: 'حجم الملف يتجاوز 25 ميغابايت' }, { status: 400 });
    }
    // الترخيص إلزامي للموسيقى: المنصة تعرضه للمنسق قبل الاختيار
    if (!license) {
      return NextResponse.json(
        { error: 'سجّل ترخيص المقطع (مثال: CC0، أو رخصة مشتراة رقم …)' },
        { status: 400 },
      );
    }
  } else {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'الشعار يجب أن يكون صورة' }, { status: 400 });
    }
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: 'حجم الشعار يتجاوز 5 ميغابايت' }, { status: 400 });
    }
  }

  const raw = Buffer.from(await file.arrayBuffer());
  let data: Buffer = raw;
  let mime = file.type;
  let width: number | null = null;
  let height: number | null = null;

  if (kind === 'logo') {
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

  const storagePath = libraryPath(kind, kind === 'logo' ? `${file.name}.png` : file.name);

  const { error: upErr } = await supabase.storage
    .from(LIBRARY_BUCKET)
    .upload(storagePath, new Uint8Array(data), { contentType: mime, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: `تعذّر الرفع: ${upErr.message}` }, { status: 500 });
  }

  const url = supabase.storage.from(LIBRARY_BUCKET).getPublicUrl(storagePath).data.publicUrl;

  // العنصر الجديد يُوضع في آخر الترتيب
  const { count } = await supabase
    .from('promo_library')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind);

  const { data: row, error: insErr } = await supabase
    .from('promo_library')
    .insert({
      kind,
      title,
      subtitle: subtitle || null,
      url,
      storage_path: storagePath,
      mime,
      file_size: data.byteLength,
      width,
      height,
      license: license || null,
      attribution: attribution || null,
      sort_order: count ?? 0,
      created_by: user.id,
    })
    .select('id, url, title, kind')
    .single();

  if (insErr || !row) {
    // لا نترك ملفًا يتيمًا في التخزين إن فشل تسجيل الصف
    await supabase.storage.from(LIBRARY_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: 'تعذّر حفظ العنصر' }, { status: 500 });
  }

  return NextResponse.json(row);
}
