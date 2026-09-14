/**
 * العامل الخلفي لـ «الاستوديو الذكي للبرومو».
 *
 * يسحب المهام من الطابور وينفّذها: تحليل، تخطيط، صوت، رندر، ضبط جودة.
 * يعمل بمفتاح الخدمة (service role) لأنه يكتب في التخزين ويحدّث سجلات
 * لا يملكها مستخدم مُصادَق.
 *
 *   تشغيل مستمر:  npm run worker:promo
 *   دورة واحدة:   npm run worker:promo -- --once
 *
 * ملاحظة: يتطلّب ffmpeg و ffprobe متاحين في PATH أو عبر FFMPEG_PATH.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import os from 'os';
import { promises as fs } from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { preparePromo, producePromo, regenerateScene } from '../src/lib/promo/pipeline';
import { buildReport } from '../src/lib/promo/qc';
import type { Database } from '../src/lib/database.types';

const WORKER_ID = `${os.hostname()}-${process.pid}`;
const POLL_INTERVAL = 4000;
const ONCE = process.argv.includes('--once');

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type Job = Database['public']['Tables']['promo_jobs']['Row'];

async function claim(): Promise<Job | null> {
  const { data, error } = await supabase.rpc('claim_promo_job', { p_worker: WORKER_ID });
  if (error) {
    console.error('تعذّر سحب مهمة:', error.message);
    return null;
  }
  return (data as Job | null) ?? null;
}

async function run(job: Job): Promise<void> {
  const started = Date.now();
  console.log(`▶ مهمة ${job.type} للبرومو ${job.promo_id} (محاولة ${job.attempts})`);

  const ctx = {
    supabase: supabase as unknown as SupabaseClient<Database>,
    promoId: job.promo_id,
    onProgress: async (pct: number, label: string) => {
      await supabase.from('promo_jobs').update({ progress: pct }).eq('id', job.id);
      process.stdout.write(`\r   ${pct}% — ${label}${' '.repeat(20)}`);
    },
  };

  switch (job.type) {
    case 'render': {
      const prepared = await preparePromo(ctx);
      const { outputs, qc, warnings, storyboardRows } = await producePromo(ctx, prepared);
      const report = buildReport(qc);

      await supabase
        .from('promos')
        .update({
          outputs: outputs as never,
          qc_report: report as never,
          status: report.passed ? 'ready' : 'ready', // الإخفاق يُعرض ولا يمنع المعاينة
          progress: 100,
          stage_label: report.passed
            ? 'اكتمل الإنتاج'
            : `اكتمل الإنتاج مع ${report.failures} ملاحظة`,
          error: null,
          // نحفظ صفوف العرض فقط، لا خطة القصة كاملة: الخطة تحمل نتائج تحليل
          // كل مادة وتضخّم الصف بلا فائدة للواجهة.
          storyboard: {
            rows: storyboardRows,
            rationale: prepared.plan.rationale,
            beats: prepared.plan.beats,
            totalDuration: prepared.plan.totalDuration,
            warnings,
          } as never,
        })
        .eq('id', job.promo_id);

      await cleanupWorkDir(job.promo_id);
      break;
    }

    case 'scene': {
      const sceneIndex = Number((job.payload as { sceneIndex?: number })?.sceneIndex ?? 0);
      await regenerateScene(ctx, sceneIndex);
      break;
    }

    case 'analyze': {
      const prepared = await preparePromo(ctx);
      await supabase
        .from('promos')
        .update({
          status: 'draft',
          progress: 45,
          stage_label: 'اكتمل التحليل — بانتظار اعتماد الـ Storyboard',
        })
        .eq('id', job.promo_id);
      console.log(`\n   ${prepared.plan.shots.length} مشهد مخطّط.`);
      break;
    }

    default:
      throw new Error(`نوع مهمة غير مدعوم: ${job.type}`);
  }

  await supabase
    .from('promo_jobs')
    .update({ status: 'done', progress: 100, error: null })
    .eq('id', job.id);

  console.log(`\n✔ اكتملت في ${((Date.now() - started) / 1000).toFixed(1)} ثانية`);
}

async function fail(job: Job, err: Error): Promise<void> {
  const willRetry = job.attempts < job.max_attempts;
  console.error(`\n✖ فشلت المهمة ${job.id}: ${err.message}`);

  await supabase
    .from('promo_jobs')
    .update({
      status: willRetry ? 'queued' : 'failed',
      error: err.message,
      // تراجع أسّي بين المحاولات
      run_after: new Date(Date.now() + Math.pow(3, job.attempts) * 5000).toISOString(),
    })
    .eq('id', job.id);

  if (!willRetry) {
    await supabase
      .from('promos')
      .update({ status: 'failed', error: err.message, stage_label: 'تعذّر الإنتاج' })
      .eq('id', job.promo_id);
  }
}

async function cleanupWorkDir(promoId: string): Promise<void> {
  const dir = path.join(os.tmpdir(), `promo-${promoId}`);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY مفقود — العامل يحتاج مفتاح الخدمة.');
    process.exit(1);
  }

  console.log(`عامل البرومو ${WORKER_ID} بدأ العمل${ONCE ? ' (دورة واحدة)' : ''}.`);

  let running = true;
  const stop = () => {
    console.log('\nإيقاف العامل بعد إنهاء المهمة الحالية…');
    running = false;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (running) {
    const job = await claim();

    if (!job) {
      if (ONCE) break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    try {
      await run(job);
    } catch (e) {
      await fail(job, e as Error);
    }

    if (ONCE) break;
  }

  console.log('توقّف العامل.');
}

main().catch((e) => {
  console.error('خطأ غير متوقّع في العامل:', e);
  process.exit(1);
});
