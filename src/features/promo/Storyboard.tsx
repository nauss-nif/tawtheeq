'use client';

import { Film, Image as ImageIcon, Sparkles, Type, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from './ui';
import type { StoryboardRow } from '@/lib/promo/timeline';

const KIND_LABEL: Record<string, string> = {
  image: 'صورة',
  video: 'فيديو',
  broll: 'مشهد مساند مولّد',
  card: 'بطاقة',
};

/**
 * لوحة المشاهد — تعرض ما سيحدث في كل مشهد قبل الإنتاج:
 * المدة، المادة المستخدمة، النص، الحركة، والتعليق الصوتي.
 */
export function PromoStoryboard({
  rows,
  rationale,
  onEdit,
  onRegenerate,
  editable,
}: {
  rows: StoryboardRow[];
  rationale?: string[];
  onEdit?: (index: number) => void;
  onRegenerate?: (index: number) => void;
  editable?: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.duration, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone="primary">{rows.length} مشهد</Pill>
        <Pill>{total.toFixed(1)} ثانية</Pill>
      </div>

      {rationale && rationale.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-background p-3 text-sm text-muted">
          {rationale.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-secondary" />
              {r}
            </li>
          ))}
        </ul>
      )}

      <ol className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.index}
            className="flex gap-3 rounded-xl border border-muted/20 p-3 transition-colors hover:border-primary/30"
          >
            {/* المصغّرة */}
            <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-background">
              {row.thumbnail ? (
                <img src={row.thumbnail} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-muted">
                  {row.sourceKind === 'video' ? (
                    <Film className="size-5" />
                  ) : row.sourceKind === 'card' ? (
                    <Type className="size-5" />
                  ) : (
                    <ImageIcon className="size-5" />
                  )}
                </span>
              )}
              <span className="absolute bottom-0 left-0 rounded-tr-md bg-black/65 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
                {row.duration.toFixed(1)}ث
              </span>
            </div>

            {/* التفاصيل */}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-primary">{row.label}</span>
                <Pill>{row.beatLabel}</Pill>
                <Pill tone={row.sourceKind === 'broll' ? 'warning' : 'muted'}>
                  {KIND_LABEL[row.sourceKind] ?? row.sourceKind}
                </Pill>
              </div>

              <dl className="grid gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
                <Row label="الحركة" value={row.motionLabel} />
                <Row label="الانتقال" value={row.transition} />
              </dl>

              {row.texts.length > 0 && (
                <p className="flex items-start gap-1.5 text-sm text-primary/85">
                  <Type className="mt-0.5 size-3.5 shrink-0 text-muted" />
                  <span className="min-w-0">{row.texts.join(' — ')}</span>
                </p>
              )}

              {row.narration && (
                <p className="flex items-start gap-1.5 text-sm leading-relaxed text-muted">
                  <Volume2 className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0">{row.narration}</span>
                </p>
              )}

              {editable && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(row.index)}
                      className="rounded-lg bg-background px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/8"
                    >
                      تعديل المشهد
                    </button>
                  )}
                  {onRegenerate && (
                    <button
                      type="button"
                      onClick={() => onRegenerate(row.index)}
                      className="rounded-lg bg-secondary/15 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary/25"
                    >
                      إعادة توليد هذا المشهد
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('flex gap-1.5')}>
      <dt className="shrink-0">{label}:</dt>
      <dd className="min-w-0 truncate font-medium text-primary/75">{value}</dd>
    </div>
  );
}
