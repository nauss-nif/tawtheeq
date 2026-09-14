/**
 * مكتبة البرومو الثابتة على مستوى المنصة.
 *
 * الشعارات الرسمية والمقاطع الموسيقية المعتمدة يرفعها المدير مرة واحدة،
 * فيختار منها كل المنسقين. هذا يبقي قرار الترخيص وقرار الهوية البصرية
 * في يد المؤسسة بدل أن يُترك لكل منسق على حدة.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Client = SupabaseClient<Database>;

export const LIBRARY_BUCKET = 'promo';
export const LIBRARY_PREFIX = { music: 'library/music', logo: 'library/logos' } as const;

export interface LibraryItem {
  id: string;
  kind: 'music' | 'logo';
  title: string;
  subtitle: string | null;
  url: string;
  storagePath: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  license: string | null;
  attribution: string | null;
  isActive: boolean;
  sortOrder: number;
}

type Row = Database['public']['Tables']['promo_library']['Row'];

function toItem(r: Row): LibraryItem {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    subtitle: r.subtitle,
    url: r.url,
    storagePath: r.storage_path,
    duration: r.duration === null ? null : Number(r.duration),
    width: r.width,
    height: r.height,
    license: r.license,
    attribution: r.attribution,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  };
}

/**
 * قراءة عناصر المكتبة.
 * `includeInactive` للمدير فقط — المنسق يرى المفعّل وحده (سياسة RLS تفرض ذلك).
 */
export async function listLibrary(
  supabase: Client,
  kind: 'music' | 'logo',
  includeInactive = false,
): Promise<LibraryItem[]> {
  let query = supabase
    .from('promo_library')
    .select('*')
    .eq('kind', kind)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);

  const { data } = await query;
  return (data ?? []).map(toItem);
}

/** عنصر واحد بمعرّفه — يُستخدم عند الرندر لجلب المسار الفعلي */
export async function getLibraryItem(
  supabase: Client,
  id: string,
): Promise<LibraryItem | null> {
  const { data } = await supabase.from('promo_library').select('*').eq('id', id).maybeSingle();
  return data ? toItem(data) : null;
}

/** مسار تخزين موحّد لملف مكتبة جديد */
export function libraryPath(kind: 'music' | 'logo', fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]+/g, '_').slice(-60);
  return `${LIBRARY_PREFIX[kind]}/${Date.now()}-${safe}`;
}
