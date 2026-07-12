import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** الجذر: يوجّه المستخدم حسب حالته */
export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'active') redirect('/auth/login');
  redirect(profile.role === 'admin' ? '/admin' : '/dashboard');
}
