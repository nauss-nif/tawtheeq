/**
 * إعادة توليد المعاينات المصغّرة لكل الصور بصيغتها الجديدة: الصورة كاملة دون قصّ مربع.
 * المعاينات القديمة كانت مقصوصة 400×400 فتُخفي الوجوه في الصور الطولية.
 *
 * التشغيل: npx tsx scripts/regen-thumbnails.ts            (كل الدورات)
 *          npx tsx scripts/regen-thumbnails.ts <courseId>  (دورة واحدة)
 *
 * المصدر نسخة full المعروضة في المجلة (تشمل أي قصّ يدوي)، ولا يُمسّ غير ملف thumb.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import sharp from 'sharp';

config({ path: '.env.local' });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('يلزم NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const BUCKET = 'media-processed';
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const store = db.storage.from(BUCKET);

async function main() {
  const courseId = process.argv[2];
  let q = db
    .from('media')
    .select('id, course_id')
    .eq('type', 'image')
    .eq('processing_status', 'done');
  if (courseId) q = q.eq('course_id', courseId);
  const { data: rows, error } = await q;
  if (error) throw error;

  let ok = 0;
  let failed = 0;
  const v = Date.now();
  const queue = [...(rows ?? [])];

  // ٤ عمليات متوازية
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let m = queue.shift(); m; m = queue.shift()) {
        const base = `${m.course_id}/${m.id}`;
        try {
          const src = await store.download(`${base}-full.webp`);
          if (!src.data) throw new Error('لا توجد نسخة full');
          const thumb = await sharp(Buffer.from(await src.data.arrayBuffer()), { failOn: 'none' })
            .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 72 })
            .toBuffer();
          const up = await store.upload(`${base}-thumb.webp`, new Uint8Array(thumb), {
            contentType: 'image/webp',
            upsert: true,
          });
          if (up.error) throw up.error;
          // رقم نسخة في الرابط لتجاوز التخزين المؤقت للمعاينة القديمة
          const thumbnail_url = `${store.getPublicUrl(`${base}-thumb.webp`).data.publicUrl}?v=${v}`;
          const { error: e2 } = await db.from('media').update({ thumbnail_url }).eq('id', m.id);
          if (e2) throw e2;
          ok++;
        } catch (e) {
          failed++;
          console.warn('تعذّر:', m.id, e instanceof Error ? e.message : e);
        }
      }
    }),
  );

  console.log(`تمت إعادة توليد ${ok} معاينة${failed ? `، وتعذّرت ${failed}` : ''}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
