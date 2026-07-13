/**
 * قراءة متغيرات البيئة بأمان مع تحقق واضح.
 * القيم الحساسة (service role, azure secret) لا تُقرأ إلا على الخادم.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`متغير البيئة المطلوب مفقود: ${name}`);
  return value;
}

// متاح للعميل
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
};

// خادم فقط
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN ?? 'nauss.edu.sa',
  enforceEmailDomain: (process.env.ENFORCE_EMAIL_DOMAIN ?? 'true') === 'true',
  azure: {
    tenantId: process.env.AZURE_TENANT_ID ?? '',
    clientId: process.env.AZURE_CLIENT_ID ?? '',
    clientSecret: process.env.AZURE_CLIENT_SECRET ?? '',
  },
  sharepoint: {
    siteId: process.env.SHAREPOINT_SITE_ID ?? '',
    driveId: process.env.SHAREPOINT_DRIVE_ID ?? '',
    libraryName: process.env.SHAREPOINT_LIBRARY_NAME ?? 'أرشيف إدارة عمليات التدريب',
  },
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
  // مفتاح الذكاء الاصطناعي لتوليد نصوص الجلسات (Anthropic)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
};

/** هل البريد ضمن النطاق المسموح؟ */
export function isEmailAllowed(email: string): boolean {
  if (!serverEnv.enforceEmailDomain) return true;
  return email.toLowerCase().endsWith('@' + serverEnv.allowedEmailDomain.toLowerCase());
}
