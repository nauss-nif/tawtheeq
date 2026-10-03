import { AuthCard, AuthLink } from '@/features/auth/AuthCard';
import { LoginForm } from '@/features/auth/forms';

export const metadata = { title: 'تسجيل الدخول | توثيق' };

export default function LoginPage() {
  return (
    <AuthCard
      title="تسجيل الدخول"
      subtitle="أهلًا بك في منصة توثيق. ادخل لإدارة دوراتك ومجلاتها."
      footer={
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span>
            ليس لديك حساب؟ <AuthLink href="/auth/register">سجّل الآن</AuthLink>
          </span>
          <span className="text-muted/40">|</span>
          <AuthLink href="/auth/reset">نسيت كلمة المرور؟</AuthLink>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
