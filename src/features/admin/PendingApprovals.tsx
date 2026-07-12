'use client';

import { useTransition } from 'react';
import { Check, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatArabicDate } from '@/lib/utils';
import type { Profile } from '@/lib/database.types';
import { approveCoordinatorAction, rejectCoordinatorAction } from './actions';

/** طلبات التسجيل الجديدة (اعتماد/رفض) — يستلمها المدير في لوحته */
export function PendingApprovals({ pending }: { pending: Profile[] }) {
  const [isPending, start] = useTransition();

  if (pending.length === 0)
    return (
      <Card>
        <CardTitle>طلبات التسجيل</CardTitle>
        <p className="mt-4 text-muted">لا توجد طلبات جديدة بانتظار الاعتماد.</p>
      </Card>
    );

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <UserPlus className="size-5 text-secondary" />
        <CardTitle className="pb-0 after:hidden">طلبات التسجيل الجديدة ({pending.length})</CardTitle>
      </div>
      <ul className="flex flex-col divide-y divide-muted/10">
        {pending.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium text-primary">{p.full_name}</p>
              <p className="text-sm text-muted">{p.phone ?? ''} · {formatArabicDate(p.created_at)}</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={isPending}
                onClick={() => start(async () => {
                  await approveCoordinatorAction(p.id);
                  toast.success('تم اعتماد الحساب');
                })}
              >
                <Check className="size-4" /> اعتماد
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={isPending}
                onClick={() => start(async () => {
                  await rejectCoordinatorAction(p.id);
                  toast.success('تم رفض الطلب');
                })}
              >
                <X className="size-4" /> رفض
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
