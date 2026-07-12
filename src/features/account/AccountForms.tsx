'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
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
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>بياناتي</CardTitle>
      <form action={action} className="flex flex-col gap-4">
        <Input id="full_name" name="full_name" label="الاسم الكامل" defaultValue={profile.full_name} required />
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
