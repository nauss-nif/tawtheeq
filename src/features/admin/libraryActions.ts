'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { LIBRARY_BUCKET } from '@/lib/promo/library';

/** كل إجراءات المكتبة للمدير وحده — RLS يفرضه أيضًا، وهذا فحص مبكر واضح */
async function requireAdmin() {
  const { profile } = await requireProfile();
  if (profile.role !== 'admin') return null;
  return profile;
}

export async function updateLibraryItemAction(
  id: string,
  patch: { title?: string; subtitle?: string; license?: string; attribution?: string; sortOrder?: number },
) {
  if (!(await requireAdmin())) return { error: 'هذا الإجراء للمدير فقط' };
  const supabase = createClient();

  const { error } = await supabase
    .from('promo_library')
    .update({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle.trim() || null } : {}),
      ...(patch.license !== undefined ? { license: patch.license.trim() || null } : {}),
      ...(patch.attribution !== undefined ? { attribution: patch.attribution.trim() || null } : {}),
      ...(patch.sortOrder !== undefined ? { sort_order: patch.sortOrder } : {}),
    })
    .eq('id', id);

  if (error) return { error: 'تعذّر حفظ التعديل' };
  revalidatePath('/admin/library');
  return { success: true };
}

/**
 * التفعيل والتعطيل بدل الحذف حيثما أمكن: برومو قديم قد يكون استخدم المقطع،
 * والتعطيل يمنع الاختيار الجديد دون المساس بما أُنتج.
 */
export async function toggleLibraryItemAction(id: string, isActive: boolean) {
  if (!(await requireAdmin())) return { error: 'هذا الإجراء للمدير فقط' };
  const supabase = createClient();

  const { error } = await supabase
    .from('promo_library')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) return { error: 'تعذّر تغيير الحالة' };
  revalidatePath('/admin/library');
  return { success: true };
}

export async function deleteLibraryItemAction(id: string) {
  if (!(await requireAdmin())) return { error: 'هذا الإجراء للمدير فقط' };
  const supabase = createClient();

  const { data: item } = await supabase
    .from('promo_library')
    .select('storage_path')
    .eq('id', id)
    .single();
  if (!item) return { error: 'العنصر غير موجود' };

  await supabase.storage.from(LIBRARY_BUCKET).remove([item.storage_path]);
  const { error } = await supabase.from('promo_library').delete().eq('id', id);

  if (error) return { error: 'تعذّر الحذف' };
  revalidatePath('/admin/library');
  return { success: true };
}

/** إعادة الترتيب بتحريك عنصر خطوة واحدة */
export async function moveLibraryItemAction(id: string, direction: 'up' | 'down') {
  if (!(await requireAdmin())) return { error: 'هذا الإجراء للمدير فقط' };
  const supabase = createClient();

  const { data: item } = await supabase
    .from('promo_library')
    .select('id, kind, sort_order')
    .eq('id', id)
    .single();
  if (!item) return { error: 'العنصر غير موجود' };

  const { data: siblings } = await supabase
    .from('promo_library')
    .select('id, sort_order')
    .eq('kind', item.kind)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const list = siblings ?? [];
  const index = list.findIndex((x) => x.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return { success: true };

  // نعيد كتابة الترتيب كاملًا لتفادي القيم المتساوية المتراكمة
  const reordered = [...list];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await Promise.all(
    reordered.map((x, i) =>
      supabase.from('promo_library').update({ sort_order: i }).eq('id', x.id),
    ),
  );

  revalidatePath('/admin/library');
  return { success: true };
}
