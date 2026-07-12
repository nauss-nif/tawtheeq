'use client';

import { useState, useTransition } from 'react';
import { Ban, RotateCcw, KeyRound, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { formatArabicDate } from '@/lib/utils';
import type { Profile } from '@/lib/database.types';
import {
  setCoordinatorStatusAction,
  resetCoordinatorPasswordAction,
  updateCoordinatorProfileAction,
} from './actions';

export function UserManager({ users }: { users: Profile[] }) {
  const [isPending, start] = useTransition();
  const [resetId, setResetId] = useState<string | null>(null);
  const [pwd, setPwd] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ full_name: string; phone: string }>({ full_name: '', phone: '' });

  return (
    <Card>
      <CardTitle>إدارة المنسقين</CardTitle>
      {users.length === 0 ? (
        <p className="mt-4 text-muted">لا يوجد منسقون.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-muted/10">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-primary">{u.full_name}</p>
                  <StatusBadge status={u.status} />
                </div>
                <p className="text-sm text-muted">{u.phone ?? ''} · انضم {formatArabicDate(u.created_at)}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {u.status === 'active' ? (
                  <Button size="sm" variant="danger" loading={isPending}
                    onClick={() => start(async () => { await setCoordinatorStatusAction(u.id, 'disabled'); toast.success('تم التعطيل'); })}>
                    <Ban className="size-4" /> تعطيل
                  </Button>
                ) : (
                  <Button size="sm" loading={isPending}
                    onClick={() => start(async () => { await setCoordinatorStatusAction(u.id, 'active'); toast.success('تمت إعادة التفعيل'); })}>
                    <RotateCcw className="size-4" /> إعادة تفعيل
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setEditId(editId === u.id ? null : u.id); setForm({ full_name: u.full_name, phone: u.phone ?? '' }); }}>
                  <Pencil className="size-4" /> البيانات
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setResetId(resetId === u.id ? null : u.id); setPwd(''); }}>
                  <KeyRound className="size-4" /> كلمة المرور
                </Button>
              </div>

              {editId === u.id && (
                <div className="flex w-full flex-wrap items-end gap-2">
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="الاسم الكامل"
                    className="h-10 flex-1 rounded-2xl border border-muted/30 bg-surface px-4 text-sm"
                  />
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="05xxxxxxxx"
                    dir="ltr"
                    className="h-10 w-40 rounded-2xl border border-muted/30 bg-surface px-4 text-sm"
                  />
                  <Button size="sm" loading={isPending}
                    onClick={() => start(async () => {
                      const res = await updateCoordinatorProfileAction(u.id, form.full_name, form.phone);
                      if (res?.error) toast.error(res.error);
                      else { toast.success(res?.success ?? 'تم'); setEditId(null); }
                    })}>
                    حفظ
                  </Button>
                </div>
              )}

              {resetId === u.id && (
                <div className="flex w-full items-center gap-2">
                  <input
                    type="text"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    placeholder="كلمة مرور جديدة (8+ أحرف)"
                    className="h-10 flex-1 rounded-2xl border border-muted/30 bg-surface px-4 text-sm"
                  />
                  <Button size="sm" loading={isPending}
                    onClick={() => start(async () => {
                      const res = await resetCoordinatorPasswordAction(u.id, pwd);
                      if (res?.error) toast.error(res.error);
                      else { toast.success(res?.success ?? 'تم'); setResetId(null); }
                    })}>
                    حفظ
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
