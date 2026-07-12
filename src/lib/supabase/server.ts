import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { publicEnv, serverEnv } from '@/lib/env';

/** عميل Supabase مرتبط بجلسة المستخدم (SSR / Server Components / Route Handlers) */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // يُستدعى من Server Component — يتكفّل middleware بتحديث الجلسة
          }
        },
      },
    },
  );
}

/**
 * عميل بامتياز service role — يتجاوز RLS.
 * يُستخدم فقط في مسارات خادم موثوقة (seed، معالجة، عمليات المدير الحساسة).
 */
export function createServiceClient() {
  return createAdminClient<Database>(
    publicEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
