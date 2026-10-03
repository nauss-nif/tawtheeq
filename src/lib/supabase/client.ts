'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * عميل Supabase للمتصفح (anon key فقط) — نسخة واحدة للتبويب كله.
 *
 * إنشاء نسخة لكل مكوّن يعني مؤقّت تحديث تلقائي لكل نسخة، فتتسابق على تدوير
 * توكن التحديث وتُبطل إحداها الأخرى => خروج قسري.
 */
export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      publicEnv.supabaseUrl,
      publicEnv.supabaseAnonKey,
    );
  }
  return browserClient;
}
