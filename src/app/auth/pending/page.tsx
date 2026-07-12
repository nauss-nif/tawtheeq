import Link from 'next/link';
import { Clock } from 'lucide-react';
import { AuthCard } from '@/features/auth/AuthCard';
import { logoutAction } from '@/features/auth/actions';
import { Button } from '@/components/ui/Button';

export const metadata = { title: 'بانتظار التفعيل | توثيق' };

export default function PendingPage() {
  return (
    <AuthCard title="حسابك بانتظار التفعيل">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-state-warning/15">
          <Clock className="size-8 text-state-warning" />
        </div>
        <p className="text-muted">
          تم إنشاء حسابك بنجاح. سيتمكّن المدير من مراجعته واعتماده قريبًا، وستتمكن
          بعدها من الدخول إلى لوحة التحكم.
        </p>
        <form action={logoutAction} className="w-full">
          <Button variant="ghost" className="w-full" type="submit">
            تسجيل الخروج
          </Button>
        </form>
        <Link href="/auth/login" className="text-sm text-state-info hover:underline">
          العودة لتسجيل الدخول
        </Link>
      </div>
    </AuthCard>
  );
}
