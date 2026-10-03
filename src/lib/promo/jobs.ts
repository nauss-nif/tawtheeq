/**
 * طابور المهام الخلفية للبرومو.
 *
 * الرندر وتوليد الصوت عمليات طويلة لا تصلح لطلب HTTP. الواجهة تُنشئ مهمة
 * وتتابع التقدّم؛ العامل (`npm run worker:promo`) ينفّذها.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { PromoJobType } from './types';

type Client = SupabaseClient<Database>;

export interface EnqueueOptions {
  promoId: string;
  type: PromoJobType;
  payload?: Record<string, unknown>;
  /** تأجيل التنفيذ (ثوانٍ) */
  delaySeconds?: number;
}

export async function enqueueJob(supabase: Client, opts: EnqueueOptions) {
  const runAfter = new Date(Date.now() + (opts.delaySeconds ?? 0) * 1000).toISOString();

  const { data, error } = await supabase
    .from('promo_jobs')
    .insert({
      promo_id: opts.promoId,
      type: opts.type,
      payload: opts.payload ?? {},
      run_after: runAfter,
      status: 'queued',
    })
    .select('id')
    .single();

  if (error) throw new Error(`تعذّر إنشاء المهمة: ${error.message}`);
  return data.id;
}

/** إلغاء المهام المعلّقة لبرومو (عند إعادة الإنشاء أو الحذف) */
export async function cancelPendingJobs(supabase: Client, promoId: string) {
  await supabase
    .from('promo_jobs')
    .update({ status: 'canceled' })
    .eq('promo_id', promoId)
    .in('status', ['queued']);
}

/** حالة التقدّم كما تُعرض في الواجهة */
export interface PromoProgress {
  status: string;
  progress: number;
  stageLabel: string | null;
  error: string | null;
  /** المهمة الجارية إن وُجدت */
  activeJob: { type: string; attempts: number } | null;
}

export async function getProgress(
  supabase: Client,
  promoId: string,
): Promise<PromoProgress | null> {
  const [{ data: promo }, { data: jobs }] = await Promise.all([
    supabase
      .from('promos')
      .select('status, progress, stage_label, error')
      .eq('id', promoId)
      .single(),
    supabase
      .from('promo_jobs')
      .select('type, status, attempts')
      .eq('promo_id', promoId)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: true })
      .limit(1),
  ]);

  if (!promo) return null;
  const active = jobs?.[0];

  return {
    status: promo.status,
    progress: promo.progress,
    stageLabel: promo.stage_label,
    error: promo.error,
    activeJob: active ? { type: active.type, attempts: active.attempts } : null,
  };
}

/** التسميات العربية لمراحل الإنتاج */
export const STAGE_LABELS: Record<string, string> = {
  draft: 'مسودة',
  queued: 'في الطابور',
  analyzing: 'تحليل المواد',
  planning: 'بناء القصة',
  narrating: 'كتابة النص',
  voicing: 'توليد التعليق الصوتي',
  rendering: 'إنتاج الفيديو',
  ready: 'جاهز',
  failed: 'فشل',
};
