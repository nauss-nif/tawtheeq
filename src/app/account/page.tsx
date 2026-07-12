import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { requireProfile, isEmployeeMode } from '@/lib/session';
import { ProfileForm, PasswordForm } from '@/features/account/AccountForms';

export const metadata = { title: 'حسابي | توثيق' };

export default async function AccountPage() {
  const { profile } = await requireProfile();
  // وجهة العودة حسب نوع الحساب/الوضع الحالي
  const backHref = profile.role === 'admin' && !isEmployeeMode() ? '/admin' : '/dashboard';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <Link href={backHref} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
          <ArrowRight className="size-4" /> العودة للوحة
        </Link>
        <h1 className="heading-accent mb-6 text-2xl font-semibold text-primary">حسابي</h1>
        <div className="flex flex-col gap-6">
          <ProfileForm profile={profile} />
          <PasswordForm />
        </div>
      </div>
    </div>
  );
}
