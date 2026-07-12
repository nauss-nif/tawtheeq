import { AuthCard, AuthLink } from '@/features/auth/AuthCard';
import { RegisterForm } from '@/features/auth/forms';

export const metadata = { title: 'إنشاء حساب | توثيق' };

export default function RegisterPage() {
  return (
    <AuthCard
      title="إنشاء حساب منسق"
      subtitle="سجّل ببريد الجامعة. سيُفعّل حسابك بعد اعتماد المدير."
      footer={
        <span>
          لديك حساب؟ <AuthLink href="/auth/login">تسجيل الدخول</AuthLink>
        </span>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
