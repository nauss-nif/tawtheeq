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
  // مفتاح الذكاء الاصطناعي لتوليد نصوص الجلسات (OpenAI / ChatGPT)
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',

  // ------------------------------------------------------------------
  // «الاستوديو الذكي للبرومو» — مفاتيح المزوّدين (خادم فقط، لا تُكشف للعميل)
  // كل خدمة خلف Adapter؛ ترك المفتاح فارغًا يعطّل المزوّد بلطف دون كسر الإنتاج.
  // ------------------------------------------------------------------
  promo: {
    /** اختيار المزوّد لكل خدمة — يسمح بالتبديل دون تغيير الشيفرة */
    ttsProvider: process.env.PROMO_TTS_PROVIDER ?? 'auto',        // elevenlabs | openai | auto
    llmProvider: process.env.PROMO_LLM_PROVIDER ?? 'auto',        // anthropic | openai | auto
    i2vProvider: process.env.PROMO_I2V_PROVIDER ?? 'motion',      // motion (محلي) | replicate
    genVideoProvider: process.env.PROMO_GENVIDEO_PROVIDER ?? '',  // replicate | (فارغ = معطّل)
    renderProvider: process.env.PROMO_RENDER_PROVIDER ?? 'ffmpeg',

    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
    elevenLabsModel: process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2',

    replicateApiToken: process.env.REPLICATE_API_TOKEN ?? '',
    /** نموذج تحريك الصور (image-to-video) */
    replicateI2vModel: process.env.REPLICATE_I2V_MODEL ?? '',
    /** نموذج توليد المشاهد المساندة (text-to-video) */
    replicateGenVideoModel: process.env.REPLICATE_GENVIDEO_MODEL ?? '',

    /** مسار خط El Messiri المستخدم في نصوص الفيديو */
    fontPath: process.env.PROMO_FONT_PATH ?? 'public/fonts/ElMessiri.ttf',
    /** وزن العناوين (SemiBold) ووزن المتن (Regular) من El Messiri */
    fontBodyPath: process.env.PROMO_FONT_BODY_PATH ?? 'public/fonts/ElMessiri-Regular.ttf',
    /** خط احتياطي إذا لم يتوفّر El Messiri */
    fallbackFontPath: process.env.PROMO_FALLBACK_FONT_PATH ?? 'public/fonts/Cairo.ttf',

    /** عدد المشاهد التي يعالجها العامل بالتوازي */
    renderConcurrency: Number(process.env.PROMO_RENDER_CONCURRENCY ?? 2),
    /** مهلة رندر المشهد الواحد بالثواني */
    sceneTimeout: Number(process.env.PROMO_SCENE_TIMEOUT ?? 180),
  },
};

/** هل البريد ضمن النطاق المسموح؟ */
export function isEmailAllowed(email: string): boolean {
  if (!serverEnv.enforceEmailDomain) return true;
  return email.toLowerCase().endsWith('@' + serverEnv.allowedEmailDomain.toLowerCase());
}
