import { AuthCard, AuthLink } from '@/features/auth/AuthCard';
import { LoginForm } from '@/features/auth/forms';

export const metadata = { title: 'تسجيل الدخول | توثيق' };

export default function LoginPage() {
  return (
    <AuthCard
      title="تسجيل الدخول"
      subtitle="ادخل إلى لوحة التحكم لإدارة دوراتك ومجلاتك."
      footer={
        <div className="flex flex-col gap-2">
          <span>
            ليس لديك حساب؟ <AuthLink href="/auth/register">سجّل الآن</AuthLink>
          </span>
          <AuthLink href="/auth/reset">نسيت كلمة المرور؟</AuthLink>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
