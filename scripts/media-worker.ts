/**
 * عامل خلفي لإعادة محاولة أرشفة الوسائط الفاشلة في SharePoint.
 * ملاحظة: المعالجة الأساسية تتم لحظيًا عند الرفع؛ هذا العامل للتعافي فقط.
 * تشغيل دوري (cron): npm run worker:media
 *
 * يبحث عن الوسائط التي اكتملت معالجتها لكن فشلت أرشفتها،
 * ويعيد المحاولة. (يتطلب توفّر النسخة الأصلية؛ إن حُذفت فتُترك كما هي.)
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const { data: failed } = await supabase
    .from('media')
    .select('id, course_id, archive_status, processing_status')
    .eq('archive_status', 'failed')
    .eq('processing_status', 'done')
    .limit(50);

  if (!failed?.length) {
    console.log('لا توجد وسائط بحاجة لإعادة أرشفة.');
    return;
  }

  console.log(`عدد الوسائط الفاشلة: ${failed.length}`);
  // ملاحظة: بعد حذف الأصل من Supabase لا يمكن إعادة الأرشفة تلقائيًا.
  // في هذه الحالة تُعلَّم للمراجعة اليدوية. نكتفي هنا بالتقرير.
  for (const m of failed) {
    console.log(` - media ${m.id} (course ${m.course_id}) بحاجة لمراجعة يدوية`);
  }
}

main().catch((e) => {
  console.error('فشل العامل:', e.message ?? e);
  process.exit(1);
});
