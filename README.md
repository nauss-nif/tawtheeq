# توثيق — منصة توثيق الدورات التدريبية

منصة ويب لإدارة وتوثيق صور وفيديوهات الدورات التدريبية، وإنتاج **مجلة إلكترونية** لكل دورة تُشارك مع المتدربين عبر رابط عام غير قابل للتخمين. مبنيّة على هوية **جامعة نايف العربية للعلوم الأمنية**، واجهة عربية بالكامل (RTL) بخط IBM Plex Sans Arabic.

---

## الحزمة التقنية

| الطبقة | التقنية |
|--------|---------|
| الواجهة | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| قاعدة البيانات والمصادقة والتخزين | Supabase (PostgreSQL + Auth + Storage + RLS) |
| معالجة الصور | Sharp (تحسين إضاءة/ألوان، WebP، مصغّرات متعددة) |
| معالجة الفيديو | ffmpeg عبر fluent-ffmpeg (H.264/CRF، thumbnail، المدة) |
| توليد PDF | @react-pdf/renderer |
| الأرشفة | Microsoft Graph API (SharePoint) عبر @azure/msal-node |
| الحركة | Framer Motion · الأيقونات: lucide-react · التنبيهات: sonner |

---

## المتطلبات المسبقة

- Node.js 20+
- مشروع Supabase (مجاني يكفي للبداية)
- **ffmpeg + ffprobe** مثبّتان على الخادم الذي يعالج الفيديو (لمعالجة الفيديو فقط)
- (اختياري) تسجيل تطبيق Azure AD بصلاحية `Sites.ReadWrite.All` لأرشفة SharePoint

---

## الإعداد خطوة بخطوة

### 1) تثبيت الاعتماديات
```bash
npm install
```

### 2) متغيرات البيئة
انسخ `.env.example` إلى `.env.local` واملأ القيم:
```bash
cp .env.example .env.local
```
أهم المتغيرات:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — لإنشاء حساب المدير (الافتراضي: `nalshahrani@nauss.edu.sa`)
- `ALLOWED_EMAIL_DOMAIN=nauss.edu.sa` و`ENFORCE_EMAIL_DOMAIN=true` — قيد نطاق بريد المنسقين (اجعلها `false` للتعطيل)
- متغيرات Azure/SharePoint للأرشفة

> **أمان:** لا تُكتب أي بيانات اعتماد في الكود. كل الأسرار تُقرأ من البيئة فقط.

### 3) تهيئة قاعدة البيانات (المخطط + RLS)
نفّذ ملفات الهجرة في `supabase/migrations/` بالترتيب عبر لوحة Supabase (SQL Editor) أو Supabase CLI:
```bash
# عبر CLI
supabase db push
# أو الصق محتوى 0001_initial_schema.sql ثم 0002_rpc_and_storage.sql في SQL Editor
```
هذا يُنشئ الجداول (`profiles`, `courses`, `media`, `magazine_sections`)، الدوال، الـ triggers، **سياسات RLS**، ودلاء التخزين (`media-processed` عام، `media-original` خاص).

### 4) إنشاء حساب المدير (seed)
```bash
npm run seed:admin
```
يقرأ `ADMIN_EMAIL`/`ADMIN_PASSWORD` من البيئة، ويُنشئ مستخدمًا بدور `admin` وحالة `active`.

### 5) التشغيل
```bash
npm run dev      # التطوير
npm run build && npm start   # الإنتاج
```
افتح `http://localhost:3000`.

---

## الأدوار والحسابات

- **المدير** (`admin`): صلاحية كاملة. زر في الشريط العلوي للتبديل بين **وضع المدير** (اعتماد الحسابات، إدارة المنسقين، كل الدورات، الإحصائيات) و**وضع الموظف** (يستخدم المنصة كمنسق عادي). يُنشأ عبر seed فقط.
- **المنسق** (`coordinator`): تسجيل ذاتي (`/auth/register`) ببريد `@nauss.edu.sa`. الحساب `pending` حتى يعتمده المدير — تظهر له صفحة «حسابك بانتظار التفعيل». بعد الاعتماد يدير دوراته وينشر مجلاته مباشرة.
- **المتدرب**: لا حساب — يفتح المجلة عبر `/m/[slug]` (slug عشوائي 14 حرفًا).

---

## بنية المشروع

```
src/
├── app/                     # App Router
│   ├── auth/                # تسجيل/دخول/استعادة/انتظار التفعيل
│   ├── dashboard/           # لوحة المنسق (دورات، رفع، نشر)
│   ├── admin/               # لوحة المدير (إحصائيات، منسقون، دورات)
│   ├── m/[slug]/            # المجلة العامة + /pdf
│   └── api/courses/[id]/media  # رفع ومعالجة الوسائط
├── features/                # وحدات حسب الميزة (auth, courses, media, magazine, admin, dashboard)
├── components/ui/           # مكونات واجهة قابلة لإعادة الاستخدام
├── lib/                     # supabase clients, env, utils, media pipeline, storage, session
└── types/
supabase/migrations/         # المخطط + RLS + RPC + buckets
scripts/                     # seed-admin, media-worker
```

نظام التصميم (ألوان الهوية، الخط، الظلال) مُعرّف كمصدر واحد في
`tailwind.config.ts` و`src/app/globals.css`.

---

## خط معالجة الوسائط (هجين: Supabase + SharePoint)

عند رفع ملف (`POST /api/courses/[courseId]/media`):
1. **الصور (Sharp):** auto-orient، normalize، تحويل WebP بجودة متكيّفة (تُخفَّض حتى يبقى الناتج ≤ 800KB)، أقصى بُعد 2000px، مصغّرات 400px و1200px. كشف الصور شديدة الظلام/الضبابية (`is_low_quality`) لاستبعادها من العرض الافتراضي.
2. **الفيديو (ffmpeg):** 1080p H.264 بـ CRF 26، خفض تلقائي إلى 720p إن تجاوز 100MB، thumbnail من أول لقطة، استخراج المدة.
3. **الرفع:** النسخة المضغوطة والمصغّرات إلى `media-processed` (عام).
4. **الأرشفة:** النسخة الأصلية تُرفع إلى SharePoint (مجلد لكل دورة `اسم-الدورة_تاريخ-البداية`) عبر Graph API، مع **upload session** للملفات > 4MB و**إعادة محاولة 3 مرات**.
5. **التنظيف:** بعد نجاح الأرشفة لا تُخزَّن النسخة الأصلية في Supabase (`original_url = null`) — تبقى المساحة صغيرة والأصل محفوظ في SharePoint.
6. الواجهة تتابع `processing_status` و`archive_status` **لحظيًا** عبر Supabase Realtime، وتعرض نسبة التوفير.

> **الفيديو والبيئات بلا خادم دائم:** المعالجة تتم داخل طلب الرفع (`maxDuration=300`). للأحمال الكبيرة يُنصح بنقل معالجة الفيديو إلى قائمة انتظار/دالة serverless مخصصة تستدعي نفس دوال `src/lib/media/`. عامل `scripts/media-worker.ts` يرصد الأرشفة الفاشلة للمراجعة.

---

## المجلة والقوالب

- ثلاثة قوالب مبنية على الهوية: **كلاسيكي** / **عصري** / **احتفالي** (`src/features/magazine/templates.ts`).
- المجلة العامة صفحة تفاعلية: غلاف hero، تعريف، معرض صور (lightbox + lazy loading)، فيديوهات، مدربون، خاتمة.
- **وضع Flipbook** (مكتبة page-flip) وزر **تنزيل PDF**.
- مؤشر تقدم قراءة ذهبي، شريط تنقل يتحول لأخضر عند التمرير، scroll-spy، احترام `prefers-reduced-motion`.
- **الخصوصية:** المجلات `noindex`، وزيادة `views_count` عند كل زيارة عبر RPC آمنة.
- **Open Graph** لمعاينة جميلة عند المشاركة في واتساب.

### ملاحظة حول PDF العربي
`@react-pdf/renderer` يدعم العربية بشكل محدود في تشكيل الحروف (الوصل/الاتجاه). للحصول على تشكيل مثالي في الإنتاج، يمكن استبدال مسار `/m/[slug]/pdf` بتوليد عبر **Puppeteer** (طباعة صفحة المجلة نفسها إلى PDF) — وهو مذكور كخيار بديل ضمن الحزمة التقنية.

---

## الأمان

- **RLS** مُفعّل على كل الجداول: المنسق يرى/يعدّل دوراته فقط؛ قراءة عامة للمجلات المنشورة عبر slug فقط.
- دلو الأصول خاص؛ الروابط الأصلية لا تُكشف (تُحذف بعد الأرشفة).
- التحقق من المدخلات بـ **zod** على الخادم والعميل.
- قيد نطاق البريد على مستوى الخادم عند التسجيل.
- عمليات المدير الحساسة تتحقق من الدور قبل التنفيذ وتستخدم service role فقط داخل الخادم.

---

## خطة التنفيذ (المراحل)

1. إعداد المشروع + مخطط Supabase + RLS ✅
2. المصادقة ولوحة المنسق ✅
3. الرفع والمعالجة (Sharp/ffmpeg/SharePoint) ✅
4. منشئ المجلة والقوالب ✅
5. المجلة العامة + Flipbook + PDF ✅
6. لوحة المدير ✅
7. الصقل والاختبار — `npm run build` يمرّ بنجاح ✅

---

## أوامر مفيدة

```bash
npm run dev          # تشغيل التطوير
npm run build        # بناء الإنتاج
npm run seed:admin   # إنشاء/تحديث حساب المدير من البيئة
npm run worker:media # رصد الأرشفة الفاشلة
npx tsc --noEmit     # فحص الأنواع
```
