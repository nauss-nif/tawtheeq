'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Loader2, Camera, User } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/database.types';
import { updateOwnProfileAction, updateOwnPasswordAction } from './actions';

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending}>{children}</Button>;
}

function useToast(state: { error?: string; success?: string } | null | undefined) {
  useEffect(() => {
    if (state?.error) toast.error(state.error);
    if (state?.success) toast.success(state.success);
  }, [state]);
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useFormState(updateOwnProfileAction, null);
  useToast(state as never);
  const [avatar, setAvatar] = useState(profile.avatar_url ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    if (!file.type.startsWith('image/')) return toast.error('اختر ملف صورة');
    if (file.size > 5 * 1024 * 1024) return toast.error('حجم الصورة أقل من 5 ميجابايت');
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatar(data.publicUrl);
      toast.success('تم رفع الصورة، لا تنسَ حفظ البيانات');
    } catch {
      toast.error('تعذّر رفع الصورة');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>بياناتي</CardTitle>
      <p className="-mt-2 text-sm text-muted">
        اسمك وصورتك ومسمّاك يظهرون في المجلة كمُعِدّ لها، بشكل احترافي.
      </p>
      <form action={action} className="flex flex-col gap-4">
        {/* الصورة الشخصية */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative size-20 shrink-0 overflow-hidden rounded-full border border-secondary/40 bg-background"
            aria-label="تغيير الصورة"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              <User className="absolute inset-0 m-auto size-8 text-muted/50" />
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-primary/70 py-1 text-white">
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
            </span>
          </button>
          <div className="text-sm text-muted">
            <p className="font-medium text-primary">الصورة الشخصية</p>
            <p>اضغط الدائرة لرفع صورة واضحة لك.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
          />
        </div>

        <input type="hidden" name="avatar_url" value={avatar} />
        <Input id="full_name" name="full_name" label="الاسم الكامل" defaultValue={profile.full_name} required />
        <Input id="job_title" name="job_title" label="المسمّى الوظيفي" placeholder="منسّق الدورة / مسؤول البرنامج الميداني" defaultValue={profile.job_title ?? ''} />
        <Input id="phone" name="phone" type="tel" label="رقم الجوال" dir="ltr" placeholder="05xxxxxxxx" defaultValue={profile.phone ?? ''} />
        <SubmitButton>حفظ البيانات</SubmitButton>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action] = useFormState(updateOwnPasswordAction, null);
  useToast(state as never);
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>تغيير كلمة المرور</CardTitle>
      <form action={action} className="flex flex-col gap-4">
        <Input id="password" name="password" type="password" label="كلمة المرور الجديدة" hint="8 أحرف على الأقل" required />
        <Input id="confirm" name="confirm" type="password" label="تأكيد كلمة المرور" required />
        <SubmitButton>تحديث كلمة المرور</SubmitButton>
      </form>
    </Card>
  );
}
