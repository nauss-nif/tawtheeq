'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Mail, Lock, User, Phone, LogIn } from 'lucide-react';
import { Input, PasswordInput } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { loginAction, registerAction, resetPasswordAction, type ActionState } from './actions';

function SubmitButton({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} size="lg" className="mt-2 w-full">
      {!pending && icon}
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
      <Input id="email" name="email" type="email" label="البريد الإلكتروني" dir="ltr" placeholder="name@nauss.edu.sa" autoComplete="email" icon={<Mail />} required />
      <PasswordInput id="password" name="password" label="كلمة المرور" autoComplete="current-password" icon={<Lock />} required />
      <SubmitButton icon={<LogIn className="size-5" />}>تسجيل الدخول</SubmitButton>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useFormState(registerAction, null);
  useToastFeedback(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Input id="full_name" name="full_name" label="الاسم الكامل" autoComplete="name" icon={<User />} required />
      <Input id="email" name="email" type="email" label="البريد الإلكتروني" dir="ltr" placeholder="name@nauss.edu.sa" autoComplete="email" icon={<Mail />} required />
      <Input id="phone" name="phone" type="tel" label="رقم الجوال" dir="ltr" placeholder="05xxxxxxxx" autoComplete="tel" icon={<Phone />} required />
      <PasswordInput id="password" name="password" label="كلمة المرور" hint="8 أحرف على الأقل" autoComplete="new-password" icon={<Lock />} required />
      <PasswordInput id="confirm" name="confirm" label="تأكيد كلمة المرور" autoComplete="new-password" icon={<Lock />} required />
      <SubmitButton>إنشاء الحساب</SubmitButton>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useFormState(resetPasswordAction, null);
  useToastFeedback(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Input id="email" name="email" type="email" label="البريد الإلكتروني" dir="ltr" placeholder="name@nauss.edu.sa" autoComplete="email" icon={<Mail />} required />
      <SubmitButton>إرسال رابط إعادة التعيين</SubmitButton>
    </form>
  );
}
