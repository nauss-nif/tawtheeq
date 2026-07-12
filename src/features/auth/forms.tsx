'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { loginAction, registerAction, resetPasswordAction, type ActionState } from './actions';

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      {children}
    </Button>
  );
}

/** يعرض رسائل النجاح/الخطأ كـ toast */
function useToastFeedback(state: ActionState) {
  useEffect(() => {
    if (state?.error) toast.error(state.error);
    if (state?.success) toast.success(state.success);
  }, [state]);
}

export function LoginForm() {
  const [state, action] = useFormState(loginAction, null);
  useToastFeedback(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Input id="email" name="email" type="email" label="البريد الإلكتروني" dir="ltr" placeholder="name@nauss.edu.sa" required />
      <Input id="password" name="password" type="password" label="كلمة المرور" required />
      <SubmitButton>تسجيل الدخول</SubmitButton>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useFormState(registerAction, null);
  useToastFeedback(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Input id="full_name" name="full_name" label="الاسم الكامل" required />
      <Input id="email" name="email" type="email" label="البريد الإلكتروني" dir="ltr" placeholder="name@nauss.edu.sa" required />
      <Input id="phone" name="phone" type="tel" label="رقم الجوال" dir="ltr" placeholder="05xxxxxxxx" required />
      <Input id="password" name="password" type="password" label="كلمة المرور" hint="8 أحرف على الأقل" required />
      <Input id="confirm" name="confirm" type="password" label="تأكيد كلمة المرور" required />
      <SubmitButton>إنشاء الحساب</SubmitButton>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useFormState(resetPasswordAction, null);
  useToastFeedback(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Input id="email" name="email" type="email" label="البريد الإلكتروني" dir="ltr" required />
      <SubmitButton>إرسال رابط إعادة التعيين</SubmitButton>
    </form>
  );
}
