import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';
import { requireProfile, isEmployeeMode } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { ProfileForm, PasswordForm } from '@/features/account/AccountForms';
import { Card, CardTitle } from '@/components/ui/Card';

export const metadata = { title: 'حسابي | توثيق' };

export default async function AccountPage() {
  const { profile } = await requireProfile();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? '';
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
          {/* البريد الإلكتروني (اسم الدخول) */}
          <Card className="flex flex-col gap-3">
            <CardTitle>البريد الإلكتروني</CardTitle>
            <div className="flex items-center gap-3 rounded-2xl bg-background px-4 py-3">
              <Mail className="size-5 text-secondary" />
              <span dir="ltr" className="flex-1 text-primary">{email}</span>
            </div>
            <p className="text-sm text-muted">
              هذا هو اسم الدخول الخاص بك. لتغيير البريد تواصل مع مدير النظام.
            </p>
          </Card>

          <ProfileForm profile={profile} />
          <PasswordForm />
        </div>
      </div>
    </div>
  );
}
