import { AuthCard, AuthLink } from '@/features/auth/AuthCard';
import { ResetForm } from '@/features/auth/forms';

export const metadata = { title: 'استعادة كلمة المرور | توثيق' };

export default function ResetPage() {
  return (
    <AuthCard
      title="استعادة كلمة المرور"
      subtitle="أدخل بريدك وسنرسل لك رابطًا لإعادة تعيين كلمة المرور."
      footer={<AuthLink href="/auth/login">العودة لتسجيل الدخول</AuthLink>}
    >
      <ResetForm />
    </AuthCard>
  );
}
