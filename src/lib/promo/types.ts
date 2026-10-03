/**
 * «الاستوديو الذكي للبرومو» — الأنواع الأساسية للنطاق (Domain types).
 * كل الطبقات (التحليل، القصة، الجدول الزمني، الرندر، ضبط الجودة) تتحدث بهذه اللغة.
 */

export type PromoStatus =
  | 'draft' | 'queued' | 'analyzing' | 'planning'
  | 'narrating' | 'voicing' | 'rendering' | 'ready' | 'failed';

export type PromoOrientation = 'vertical' | 'horizontal' | 'both';
/** الاتجاه الفعلي عند البناء والرندر (لا يوجد "both" على مستوى الملف الواحد) */
export type RenderOrientation = 'vertical' | 'horizontal';

export type PromoStyleId =
  | 'cinematic' | 'institutional' | 'dynamic' | 'documentary' | 'premium' | 'modern';

export type PromoDuration = 30 | 60 | 90;
export type AudioMode = 'music_voice' | 'music_only' | 'voice_only' | 'silent';
export type NarrationSource = 'user' | 'ai' | 'ai_enhanced';

export type PromoAssetKind = 'logo' | 'music' | 'voiceover' | 'broll' | 'render' | 'poster';
export type PromoJobType = 'analyze' | 'plan' | 'narrate' | 'voice' | 'broll' | 'render' | 'qc' | 'scene';
export type PromoJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';
export type SceneStatus = 'planned' | 'rendering' | 'ready' | 'failed';

/** خطوات القصة (Story beats) — ترتيبها الافتراضي هو تسلسل الفيلم */
export type StoryBeat =
  | 'opening'      // افتتاحية بصرية
  | 'title'        // اسم البرنامج
  | 'place'        // المكان
  | 'kickoff'      // بداية الفعالية
  | 'training'     // التدريب والتفاعل
  | 'activities'   // التطبيقات والأنشطة
  | 'highlights'   // أبرز اللحظات
  | 'participants' // المشاركون
  | 'closing'      // الختام
  | 'endcard';     // الشعارات والمعلومات الختامية

/** أنواع الحركة المطبّقة على الصور الثابتة */
export type MotionType =
  | 'slow_zoom_in' | 'slow_zoom_out' | 'push_in' | 'pull_out'
  | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down'
  | 'parallax' | 'depth_push' | 'rack_focus' | 'static';

export type TransitionType =
  | 'cut' | 'fade' | 'dissolve' | 'wipe_right' | 'wipe_left'
  | 'slide_up' | 'whip_pan' | 'flash' | 'zoom_blur';

// --------------------------------------------------------------------------
// الإعدادات التي يختارها المستخدم
// --------------------------------------------------------------------------

export interface LogoSlot {
  /** معرّف الأصل في promo_assets، أو 'nauss' للشعار الثابت للجامعة */
  assetId: string | 'nauss';
  url: string;
  /** حجم نسبي 0.6 .. 1.4 (١ = الحجم القياسي) */
  scale: number;
  order: number;
}

export interface LogoSettings {
  /** شعار الجامعة جزء ثابت من الهوية ولا يُحذف */
  logos: LogoSlot[];
  placement: 'start' | 'end' | 'both';
}

export interface VoiceSettings {
  voiceId: string;
  /** سرعة القراءة 0.75 .. 1.25 */
  speed: number;
  /** مستوى الحماس 0 .. 1 */
  energy: number;
  /** النبرة: دافئة/محايدة/جادّة */
  tone: 'warm' | 'neutral' | 'serious';
  /** طول الوقفات بين الجمل بالمللي ثانية */
  pauseMs: number;
  /** وضوح النطق (يرفع الثبات ويخفض العشوائية لدى المزوّد) */
  clarity: number;
}

export interface MusicSettings {
  /** معرّف من مكتبة المنصة، أو 'upload' عند رفع ملف خاص */
  trackId: string | 'upload' | null;
  /** الأصل المرفوع عند trackId = 'upload' */
  assetId?: string | null;
  /** مستوى الموسيقى 0 .. 1 (يُطبّق قبل الـ ducking) */
  volume: number;
}

export interface PromoSettings {
  duration: PromoDuration;
  orientation: PromoOrientation;
  style: PromoStyleId;
  audioMode: AudioMode;
  voice: VoiceSettings;
  music: MusicSettings;
  logos: LogoSettings;
  /** السماح بتوليد لقطات مساندة سينمائية عند نقص المواد */
  allowGeneratedBRoll: boolean;
  /** تحسين صياغة نص المستخدم بالذكاء الاصطناعي */
  enhanceUserScript: boolean;
  /** تخطّي شاشة الـ Storyboard والذهاب مباشرة للإنتاج */
  skipStoryboard: boolean;
  /** معرّفات وسائط اختارها المستخدم يدويًا (فارغ = اختيار تلقائي) */
  includeMediaIds: string[];
  excludeMediaIds: string[];
}

// --------------------------------------------------------------------------
// تحليل المواد
// --------------------------------------------------------------------------

export interface MediaMetrics {
  width: number;
  height: number;
  aspect: number;
  /** حدّة الصورة (تباين الحواف) 0..100 */
  sharpness: number;
  /** متوسط السطوع 0..100 */
  brightness: number;
  /** التباين 0..100 */
  contrast: number;
  /** غنى الألوان 0..100 */
  colorfulness: number;
  /** الإنتروبيا — مؤشر ثراء التفاصيل 0..100 */
  entropy: number;
  /** توازن التكوين (توزيع الكتلة البصرية) 0..100 */
  composition: number;
  /** للفيديو فقط */
  motionScore?: number;
  stability?: number;
  duration?: number;
  hasAudio?: boolean;
}

export interface FocusPoint {
  /** نسب 0..1 من عرض/ارتفاع المادة */
  x: number;
  y: number;
  /** ثقة التقدير 0..1 */
  confidence: number;
}

export interface MediaAnalysis {
  mediaId: string;
  type: 'image' | 'video';
  url: string;
  metrics: MediaMetrics;
  /** بصمة إدراكية (64 بت hex) لكشف الصور المتكرّرة */
  phash: string;
  /** وسوم المحتوى — تُملأ عند توفّر مزوّد رؤية، وإلا تبقى فارغة */
  labels: string[];
  focus: FocusPoint;
  /** القيمة البصرية الكلية 0..100 */
  score: number;
  /** المشاهد المرشّحة لهذه المادة حسب المحتوى */
  beatAffinity: Partial<Record<StoryBeat, number>>;
  engine: string;
}

// --------------------------------------------------------------------------
// المشاهد والجدول الزمني
// --------------------------------------------------------------------------

export interface TextOverlay {
  id: string;
  text: string;
  role: 'title' | 'subtitle' | 'kicker' | 'caption' | 'closing';
  /** موضع نسبي داخل الإطار الآمن (0..1) */
  anchor: { x: number; y: number };
  align: 'start' | 'center' | 'end';
  /** حجم نسبي من ارتفاع الإطار */
  sizeRatio: number;
  /** بداية الظهور ومدّته داخل المشهد (ثوانٍ) */
  inAt: number;
  duration: number;
  animation: 'fade' | 'rise' | 'mask_reveal' | 'letter_fade';
  rtl: boolean;
}

export interface SceneMotion {
  type: MotionType;
  /** شدّة الحركة 0..1 (كم يقترب/يبتعد الإطار) */
  intensity: number;
  focus: FocusPoint;
  /** منحنى التسارع */
  easing: 'linear' | 'ease_in_out' | 'ease_out';
}

/** طبقة صورة تُركَّب فوق المشهد (شعار الافتتاحية) */
export interface SceneOverlay {
  /** مسار محلي لصورة PNG بشفافية */
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  inAt: number;
  duration: number;
}

export interface Scene {
  id: string;
  index: number;
  beat: StoryBeat;
  sourceKind: 'image' | 'video' | 'broll' | 'card';
  mediaId?: string | null;
  assetId?: string | null;
  /** المسار/الرابط المستخدم عند الرندر */
  src?: string;
  /** للفيديو: نافذة القصّ من المصدر */
  clip?: { start: number; end: number; speed?: number };
  duration: number;
  /** الحركة محسوبة لكل اتجاه على حدة (إعادة تكوين لا قصّ) */
  motion: Record<RenderOrientation, SceneMotion>;
  texts: Record<RenderOrientation, TextOverlay[]>;
  transitionIn: { type: TransitionType; duration: number };
  /** طبقات فوقية لكل اتجاه (تُبنى بمقاس الإطار المعني) */
  overlays?: Record<RenderOrientation, SceneOverlay[]>;
  narration?: string | null;
  status: SceneStatus;
}

export interface Timeline {
  orientation: RenderOrientation;
  width: number;
  height: number;
  fps: number;
  scenes: Scene[];
  totalDuration: number;
  /** نقاط الإيقاع المستخرجة من الموسيقى (ثوانٍ) */
  beatGrid: number[];
  audio: {
    mode: AudioMode;
    musicPath?: string | null;
    musicVolume: number;
    voicePath?: string | null;
    /** مقاطع الكلام (لتطبيق الـ ducking بدقّة) */
    speechWindows: { start: number; end: number }[];
  };
}

// --------------------------------------------------------------------------
// ضبط الجودة
// --------------------------------------------------------------------------

export type QcSeverity = 'pass' | 'warn' | 'fail';

export interface QcCheck {
  id: string;
  label: string;
  severity: QcSeverity;
  detail?: string;
}

export interface QcReport {
  checks: QcCheck[];
  passed: boolean;
  warnings: number;
  failures: number;
  ranAt: string;
}

// --------------------------------------------------------------------------
// المخرجات
// --------------------------------------------------------------------------

export interface RenderOutput {
  orientation: RenderOrientation;
  url: string;
  storagePath: string;
  posterUrl?: string;
  width: number;
  height: number;
  duration: number;
  fileSize: number;
  renderedAt: string;
}

export type PromoOutputs = Partial<Record<RenderOrientation, RenderOutput>>;

// --------------------------------------------------------------------------
// سياق البرنامج (يُقرأ من منصة توثيق — لا يُطلب من المستخدم مجدّدًا)
// --------------------------------------------------------------------------

export interface CourseContext {
  id: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  trainers: string[];
  welcomeText: string | null;
  sessions: { title: string; presenter: string | null; description: string | null }[];
}
