'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { Course, TemplateId } from '@/lib/database.types';
import { createCourseAction, updateCourseAction } from './actions';

const templates: { id: TemplateId; name: string; desc: string }[] = [
  { id: 'classic', name: 'كلاسيكي', desc: 'كتلة خضراء جانبية وفواصل ذهبية' },
  { id: 'modern', name: 'عصري', desc: 'غلاف صورة كامل وطباعة جريئة' },
  { id: 'celebratory', name: 'احتفالي', desc: 'لمسات ذهبية أوسع للاختتام' },
];

export function CourseForm({ course }: { course?: Course }) {
  const [trainers, setTrainers] = useState<string[]>(
    course?.trainer_names.length ? course.trainer_names : [''],
  );
  const [template, setTemplate] = useState<TemplateId>(course?.template_id ?? 'classic');
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set('template_id', template);
    startTransition(async () => {
      const res = course
        ? await updateCourseAction(course.id, formData)
        : await createCourseAction(formData);
      if (res && 'error' in res && res.error) toast.error(res.error);
      else if (res && 'success' in res && res.success) toast.success(res.success);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <CardTitle>بيانات الدورة</CardTitle>
        <Input name="title" label="عنوان الدورة" defaultValue={course?.title} required />
        <Textarea name="description" label="الوصف" defaultValue={course?.description ?? ''} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="start_date" type="date" label="تاريخ البداية" defaultValue={course?.start_date ?? ''} />
          <Input name="end_date" type="date" label="تاريخ النهاية" defaultValue={course?.end_date ?? ''} />
        </div>
        <Input name="location" label="المكان" defaultValue={course?.location ?? ''} />

        {/* أسماء المدربين — حقول ديناميكية */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-primary">أسماء المدربين</label>
          {trainers.map((t, i) => (
            <div key={i} className="flex gap-2">
              <input
                name="trainer_names"
                value={t}
                onChange={(e) => {
                  const next = [...trainers];
                  next[i] = e.target.value;
                  setTrainers(next);
                }}
                placeholder={`المدرب ${i + 1}`}
                className="h-11 flex-1 rounded-2xl border border-muted/30 bg-surface px-4 focus:border-primary"
              />
              {trainers.length > 1 && (
                <button
                  type="button"
                  onClick={() => setTrainers(trainers.filter((_, j) => j !== i))}
                  className="rounded-2xl px-3 text-state-danger hover:bg-state-danger/10"
                  aria-label="حذف"
                >
                  <Trash2 className="size-5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTrainers([...trainers, ''])}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-state-info hover:underline"
          >
            <Plus className="size-4" /> إضافة مدرب
          </button>
        </div>
      </Card>

      {/* اختيار القالب */}
      <Card className="flex flex-col gap-4">
        <CardTitle>قالب المجلة</CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setTemplate(tpl.id)}
              className={cn(
                'rounded-2xl border-2 p-4 text-right transition-all',
                template === tpl.id
                  ? 'border-secondary bg-primary/5'
                  : 'border-muted/20 hover:border-primary/30',
              )}
            >
              <span className="block font-semibold text-primary">{tpl.name}</span>
              <span className="mt-1 block text-sm text-muted">{tpl.desc}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          {course ? 'حفظ التعديلات' : 'إنشاء الدورة'}
        </Button>
      </div>
    </form>
  );
}
