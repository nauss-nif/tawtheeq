'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, Loader2, Download, Trash2, Copy,
  ChevronDown, AlertTriangle, ShieldCheck, PlayCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Pill } from './ui';
import { PromoStoryboard } from './Storyboard';
import {
  approveStoryboardAction, deletePromoAction, duplicatePromoAction,
  promoProgressAction, regenerateSceneAction, updateSceneAction,
} from './actions';
import { STAGE_LABELS } from '@/lib/promo/jobs';
import type { StoryboardRow } from '@/lib/promo/timeline';
import type { QcCheck, RenderOutput } from '@/lib/promo/types';

export interface PromoListItem {
  id: string;
  title: string;
  version: number;
  status: string;
  progress: number;
  stageLabel: string | null;
  error: string | null;
  createdAt: string;
  outputs: Partial<Record<'vertical' | 'horizontal', RenderOutput>>;
  qc: { checks: QcCheck[]; passed: boolean; warnings: number; failures: number } | null;
  storyboard: StoryboardRow[];
  rationale: string[];
  duration: number;
  style: string;
}

const ACTIVE = ['queued', 'analyzing', 'planning', 'narrating', 'voicing', 'rendering'];

/** قائمة البروموهات مع المعاينة والتعديل وسجل الإصدارات */
export function PromoList({ promos, courseId }: { promos: PromoListItem[]; courseId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(promos);

  // متابعة التقدّم للبروموهات قيد الإنتاج
  useEffect(() => {
    const running = live.filter((p) => ACTIVE.includes(p.status));
    if (!running.length) return;

    const timer = setInterval(async () => {
      let anyDone = false;
      type Update = {
        id: string;
        status: string;
        progress: number;
        stageLabel: string | null;
        error: string | null;
      };

      const updates = await Promise.all(
        running.map(async (p): Promise<Update | null> => {
          const res = await promoProgressAction(p.id);
          if (!res.ok) return null;
          if (!ACTIVE.includes(res.status)) anyDone = true;
          return {
            id: p.id,
            status: res.status,
            progress: res.progress,
            stageLabel: res.stageLabel,
            error: res.error,
          };
        }),
      );

      setLive((prev) =>
        prev.map((p) => {
          const u = updates.find((x): x is Update => x?.id === p.id);
          return u
            ? { ...p, status: u.status, progress: u.progress, stageLabel: u.stageLabel, error: u.error }
            : p;
        }),
      );

      if (anyDone) router.refresh();
    }, 3500);

    return () => clearInterval(timer);
  }, [live, router]);

  useEffect(() => setLive(promos), [promos]);

  if (!live.length) {
    return (
      <p className="rounded-2xl bg-background p-6 text-center text-sm text-muted">
        لا توجد بروموهات بعد. اضبط الإعدادات أعلاه واضغط «إنشاء البرومو».
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {live.map((promo) => (
        <PromoCard key={promo.id} promo={promo} courseId={courseId} />
      ))}
    </div>
  );
}

function PromoCard({ promo, courseId }: { promo: PromoListItem; courseId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(ACTIVE.includes(promo.status) || promo.status === 'ready');
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>(
    promo.outputs.horizontal ? 'horizontal' : 'vertical',
  );

  const active = ACTIVE.includes(promo.status);
  const output = promo.outputs[orientation];
  const available = (['horizontal', 'vertical'] as const).filter((o) => promo.outputs[o]);

  // بعد التحليل ينتظر البرومو اعتماد لوحة المشاهد
  const awaitingApproval =
    promo.status === 'draft' && promo.storyboard.length > 0 && !output;

  return (
    <article className="overflow-hidden rounded-2xl border border-muted/20">
      <header className="flex flex-wrap items-center gap-3 bg-background px-4 py-3">
        <StatusIcon status={promo.status} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-primary">{promo.title}</p>
          <p className="text-xs text-muted">
            إصدار {promo.version} · {promo.duration} ثانية ·{' '}
            {new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(promo.createdAt))}
          </p>
        </div>

        {promo.qc && !active && (
          <Pill tone={promo.qc.failures ? 'danger' : promo.qc.warnings ? 'warning' : 'success'}>
            <ShieldCheck className="size-3" />
            {promo.qc.failures
              ? `${promo.qc.failures} إخفاق`
              : promo.qc.warnings
                ? `${promo.qc.warnings} تنبيه`
                : 'اجتاز الفحص'}
          </Pill>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:text-primary"
        >
          <ChevronDown className={cn('size-5 transition-transform', open && 'rotate-180')} />
        </button>
      </header>

      {active && (
        <div className="px-4 pb-3 pt-2">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-primary">{promo.stageLabel ?? STAGE_LABELS[promo.status]}</span>
            <span className="tabular-nums text-muted">{promo.progress}٪</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-secondary transition-all duration-500"
              style={{ width: `${Math.max(3, promo.progress)}%` }}
            />
          </div>
        </div>
      )}

      {promo.error && (
        <p className="flex items-start gap-2 bg-state-danger/8 px-4 py-3 text-sm text-state-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {promo.error}
        </p>
      )}

      {open && (
        <div className="flex flex-col gap-5 p-4">
          {/* المشغّل */}
          {output && (
            <div className="flex flex-col gap-3">
              {available.length > 1 && (
                <div className="flex gap-1 self-start rounded-xl bg-background p-1">
                  {available.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOrientation(o)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                        orientation === o ? 'bg-primary text-white' : 'text-muted',
                      )}
                    >
                      {o === 'vertical' ? 'عمودي 9:16' : 'أفقي 16:9'}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-center rounded-2xl bg-black/[0.03] p-3">
                <video
                  key={output.url}
                  src={output.url}
                  poster={output.posterUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className={cn(
                    'rounded-xl bg-black',
                    orientation === 'vertical' ? 'max-h-[70vh] w-auto' : 'w-full',
                  )}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={output.url}
                  download={`${promo.title}-${orientation}.mp4`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-2xl bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
                >
                  <Download className="size-4" /> تنزيل MP4
                </a>
                <Pill>
                  {output.width}×{output.height}
                </Pill>
                <Pill>{output.duration.toFixed(1)} ثانية</Pill>
                <Pill>{(output.fileSize / 1024 / 1024).toFixed(1)} م.ب</Pill>
              </div>
            </div>
          )}

          {/* اعتماد لوحة المشاهد */}
          {awaitingApproval && (
            <div className="flex flex-col gap-3 rounded-xl bg-secondary/8 p-4">
              <p className="text-sm font-medium text-primary">
                اكتمل التحليل. راجع لوحة المشاهد ثم ابدأ الإنتاج.
              </p>
              <div>
                <Button
                  type="button"
                  size="sm"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await approveStoryboardAction(promo.id);
                      if (res.error) return void toast.error(res.error);
                      toast.success('بدأ الإنتاج');
                      router.refresh();
                    })
                  }
                >
                  <PlayCircle className="size-4" /> اعتماد وبدء الإنتاج
                </Button>
              </div>
            </div>
          )}

          {/* لوحة المشاهد مع التعديل وإعادة التوليد */}
          {promo.storyboard.length > 0 && (
            <details className="rounded-xl bg-background p-4" open={awaitingApproval}>
              <summary className="cursor-pointer text-sm font-medium text-primary">
                لوحة المشاهد ({promo.storyboard.length} مشهد)
              </summary>
              <div className="mt-4">
                <PromoStoryboard
                  rows={promo.storyboard}
                  rationale={promo.rationale}
                  editable={!active}
                  onRegenerate={(index) =>
                    startTransition(async () => {
                      const res = await regenerateSceneAction(promo.id, index);
                      if (res.error) return void toast.error(res.error);
                      toast.success(`تُعاد صياغة المشهد ${index + 1} — المشاهد الأخرى لن يُعاد بناؤها`);
                      router.refresh();
                    })
                  }
                  onEdit={(index) => {
                    const seconds = window.prompt(
                      'مدة المشهد بالثواني (اتركه فارغًا لعدم التغيير):',
                      String(promo.storyboard[index].duration),
                    );
                    if (seconds === null) return;
                    const value = Number(seconds);
                    if (!Number.isFinite(value) || value < 0.8 || value > 8) {
                      return void toast.error('المدة يجب أن تكون بين 0.8 و 8 ثوانٍ.');
                    }
                    startTransition(async () => {
                      const res = await updateSceneAction(promo.id, index, { duration: value });
                      if (res.error) return void toast.error(res.error);
                      toast.success('حُفظ التعديل — اضغط «إعادة توليد هذا المشهد» لتطبيقه');
                      router.refresh();
                    });
                  }}
                />
              </div>
            </details>
          )}

          {/* تقرير ضبط الجودة */}
          {promo.qc && <QcPanel qc={promo.qc} />}

          {/* الإجراءات */}
          <div className="flex flex-wrap gap-2 border-t border-muted/15 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await duplicatePromoAction(promo.id);
                  if (res.error) return void toast.error(res.error);
                  toast.success('أُنشئ إصدار جديد بالإعدادات نفسها');
                  router.refresh();
                })
              }
            >
              <Copy className="size-4" /> إصدار جديد بالإعدادات نفسها
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-state-danger hover:bg-state-danger/8"
              loading={pending}
              onClick={() => {
                if (!window.confirm(`حذف «${promo.title}» وكل ملفاته نهائيًا؟`)) return;
                startTransition(async () => {
                  const res = await deletePromoAction(promo.id);
                  if (res.error) return void toast.error(res.error);
                  toast.success('حُذف البرومو');
                  router.refresh();
                });
              }}
            >
              <Trash2 className="size-4" /> حذف
            </Button>
          </div>
        </div>
      )}
      <input type="hidden" value={courseId} readOnly />
    </article>
  );
}

function QcPanel({ qc }: { qc: NonNullable<PromoListItem['qc']> }) {
  const order = { fail: 0, warn: 1, pass: 2 } as const;
  const sorted = [...qc.checks].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <details className="rounded-xl bg-background p-4" open={qc.failures > 0}>
      <summary className="cursor-pointer text-sm font-medium text-primary">
        تقرير ضبط الجودة ({qc.checks.length} فحصًا)
      </summary>
      <ul className="mt-3 flex flex-col gap-1.5">
        {sorted.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                c.severity === 'pass'
                  ? 'bg-primary'
                  : c.severity === 'warn'
                    ? 'bg-state-warning'
                    : 'bg-state-danger',
              )}
            />
            <div className="min-w-0">
              <span className="font-medium text-primary/85">{c.label}</span>
              {c.detail && <p className="text-muted">{c.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (ACTIVE.includes(status)) {
    return <Loader2 className="size-5 shrink-0 animate-spin text-state-warning" />;
  }
  if (status === 'ready') return <CheckCircle2 className="size-5 shrink-0 text-primary" />;
  if (status === 'failed') return <XCircle className="size-5 shrink-0 text-state-danger" />;
  return <PlayCircle className="size-5 shrink-0 text-muted" />;
}
