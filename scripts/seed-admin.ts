/**
 * seed script لإنشاء/تحديث حساب المدير.
 * يقرأ ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_FULL_NAME من البيئة.
 * تشغيل: npm run seed:admin
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });
config(); // fallback إلى .env

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_FULL_NAME ?? 'مدير النظام';

if (!url || !serviceKey || !email || !password) {
  console.error('✗ متغيرات مفقودة: تأكد من NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // ابحث عن مستخدم موجود بنفس البريد
  const { data: list } = await supabase.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email!.toLowerCase());

  let userId: string;
  if (existing) {
    userId = existing.id;
    await supabase.auth.admin.updateUserById(userId, { password: password!, email_confirm: true });
    console.log('↻ حُدّثت كلمة مرور المدير الموجود');
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: email!,
      password: password!,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log('✓ أُنشئ مستخدم المدير');
  }

  // اضبط ملف profiles: دور admin وحالة active
  const { error: upErr } = await supabase.from('profiles').upsert({
    id: userId,
    full_name: fullName,
    role: 'admin',
    status: 'active',
  });
  if (upErr) throw upErr;

  console.log(`✓ حساب المدير جاهز: ${email}`);
}

main().catch((e) => {
  console.error('✗ فشل seed:', e.message ?? e);
  process.exit(1);
});
