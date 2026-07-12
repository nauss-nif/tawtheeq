import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { UserManager } from '@/features/admin/UserManager';
import { PendingApprovals } from '@/features/admin/PendingApprovals';
import type { Profile } from '@/lib/database.types';

export const metadata = { title: 'المنسقون | الإدارة' };

export default async function AdminUsersPage() {
  await requireProfile();
  const supabase = createClient();

  const { data: all } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'coordinator')
    .order('created_at', { ascending: false });

  const users = (all as Profile[]) ?? [];
  const pending = users.filter((u) => u.status === 'pending');
  const managed = users.filter((u) => u.status !== 'pending');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <h1 className="heading-accent text-2xl font-semibold text-primary">المنسقون</h1>
      <PendingApprovals pending={pending} />
      <UserManager users={managed} />
    </div>
  );
}
