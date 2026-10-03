/**
 * تعبئة أبعاد الصور (width/height) للصور القائمة قبل إضافة العمودين،
 * من نسخة full المعروضة في المجلة. آمن للتكرار: يعالج فقط الصور بلا أبعاد.
 *
 * التشغيل: npx tsx scripts/backfill-dimensions.ts
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
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const { data: rows, error } = await db
    .from('media')
    .select('id, processed_url')
    .eq('type', 'image')
    .eq('processing_status', 'done')
    .is('width', null);
  if (error) throw error;

  let ok = 0;
  let failed = 0;
  const queue = [...(rows ?? [])];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let m = queue.shift(); m; m = queue.shift()) {
        try {
          if (!m.processed_url) throw new Error('بلا رابط');
          const res = await fetch(m.processed_url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
          if (!meta.width || !meta.height) throw new Error('أبعاد مجهولة');
          const { error: e2 } = await db.from('media').update({ width: meta.width, height: meta.height }).eq('id', m.id);
          if (e2) throw e2;
          ok++;
        } catch (e) {
          failed++;
          console.warn('تعذّر:', m.id, e instanceof Error ? e.message : e);
        }
      }
    }),
  );
  console.log(`عُبّئت أبعاد ${ok} صورة${failed ? `، وتعذّرت ${failed}` : ''}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
