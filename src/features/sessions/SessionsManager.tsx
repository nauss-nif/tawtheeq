'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, Sparkles, Clock, User, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatArabicDate } from '@/lib/utils';
import type { Session } from '@/lib/database.types';
import {
  addSessionAction,
  updateSessionAction,
  deleteSessionAction,
  generateSessionDescriptionAction,
} from './actions';

export function SessionsManager({ courseId, initial }: { courseId: string; initial: Session[] }) {
  const [pending, start] = useTransition();

  return (
    <Card className="flex flex-col gap-5">
      <CardTitle>الجدول الزمني والجلسات</CardTitle>
      <p className="text-sm text-muted">
        أضف عناوين الجلسات ومقدّميها؛ ويمكنك توليد وصف احترافي لكل جلسة تلقائيًا.
      </p>

      {/* نموذج إضافة */}
      <form
        action={(fd) =>
          start(async () => {
            const res = await addSessionAction(courseId, fd);
            if (res?.error) toast.error(res.error);
            else toast.success(res?.success ?? 'تمت الإضافة');
          })
        }
        className="grid gap-3 rounded-2xl bg-background p-4 sm:grid-cols-2"
      >
        <Input name="title" label="عنوان الجلسة" required />
        <Input name="presenter" label="المقدّم" placeholder="اسم المدرب/المتحدث" />
        <Input name="session_date" type="date" label="التاريخ" />
        <Input name="time_label" label="الوقت" placeholder="09:00 - 10:30" dir="ltr" />
        <div className="sm:col-span-2">
          <Button type="submit" loading={pending}>
            <Plus className="size-5" /> إضافة جلسة
          </Button>
        </div>
      </form>

      {/* قائمة الجلسات */}
      {initial.length === 0 ? (
        <p className="py-4 text-center text-muted">لا توجد جلسات بعد.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {initial.map((s) => (
            <SessionRow key={s.id} session={s} courseId={courseId} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SessionRow({ session, courseId }: { session: Session; courseId: string }) {
  const [pending, start] = useTransition();
  const [desc, setDesc] = useState(session.description ?? '');
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    title: session.title,
    presenter: session.presenter ?? '',
    session_date: session.session_date ?? '',
    time_label: session.time_label ?? '',
  });

  return (
    <li className="rounded-2xl border border-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {editing ? (
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} label="عنوان الجلسة" />
            <Input value={f.presenter} onChange={(e) => setF({ ...f, presenter: e.target.value })} label="المقدّم" />
            <Input type="date" value={f.session_date} onChange={(e) => setF({ ...f, session_date: e.target.value })} label="التاريخ" />
            <Input value={f.time_label} onChange={(e) => setF({ ...f, time_label: e.target.value })} label="الوقت" dir="ltr" />
            <div className="flex gap-2 sm:col-span-2">
              <Button size="sm" loading={pending} onClick={() => start(async () => {
                const res = await updateSessionAction(session.id, courseId, {
                  title: f.title, presenter: f.presenter || null,
                  session_date: f.session_date || null, time_label: f.time_label || null,
                });
                if (res?.error) toast.error(res.error);
                else { toast.success('تم الحفظ'); setEditing(false); }
              })}>حفظ</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-primary">{session.title}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted">
              {session.presenter && (
                <span className="inline-flex items-center gap-1"><User className="size-4" /> {session.presenter}</span>
              )}
              {session.session_date && <span>{formatArabicDate(session.session_date)}</span>}
              {session.time_label && (
                <span className="inline-flex items-center gap-1" dir="ltr"><Clock className="size-4" /> {session.time_label}</span>
              )}
            </div>
          </div>
        )}
        {!editing && (
          <div className="flex gap-1">
            <button onClick={() => setEditing(true)} className="rounded-xl p-2 text-primary hover:bg-primary/5" aria-label="تعديل">
              <Pencil className="size-4" />
            </button>
            <button
              onClick={() => start(async () => { await deleteSessionAction(session.id, courseId); toast.success('تم الحذف'); })}
              className="rounded-xl p-2 text-state-danger hover:bg-state-danger/10"
              aria-label="حذف"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* الوصف + توليد بالذكاء */}
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => {
          if (desc !== (session.description ?? ''))
            start(async () => { await updateSessionAction(session.id, courseId, { description: desc || null }); });
        }}
        placeholder="وصف الجلسة (اكتبه أو ولّده بالذكاء)…"
        className="mt-3 min-h-20 w-full rounded-2xl border border-muted/30 bg-surface px-4 py-3 text-sm"
      />
      <div className="mt-2">
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await generateSessionDescriptionAction(session.id, courseId);
              if (res?.error) toast.error(res.error);
              else if (res?.text) { setDesc(res.text); toast.success('تم توليد الوصف'); }
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          توليد وصف احترافي
        </Button>
      </div>
    </li>
  );
}
