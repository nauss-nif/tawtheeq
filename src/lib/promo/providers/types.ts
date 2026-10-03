/**
 * عقود مزوّدي الخدمات الخارجية.
 *
 * المبدأ: المنصة لا تعرف أي مزوّد بعينه. كل خدمة خارجية خلف واجهة هنا،
 * وكل تنفيذ (adapter) يعيش في مجلده. استبدال المزوّد = إضافة ملف وتغيير
 * متغيّر بيئة واحد، دون لمس محرّك القصة أو الرندر أو الواجهة.
 *
 * كل مزوّد يعلن `isConfigured()` — والنظام يتدهور بلطف عند غيابه
 * (لا يفشل الإنتاج، بل يسقط إلى البديل المحلّي أو يتخطّى المرحلة).
 */

import type {
  CourseContext, MediaAnalysis, PromoStyleId, RenderOrientation,
  StoryBeat, Timeline, VoiceSettings,
} from '../types';

export interface ProviderInfo {
  /** معرّف المزوّد كما يظهر في السجلات وتقرير الجودة */
  id: string;
  /** الخدمة التي يقدّمها */
  kind: ProviderKind;
  isConfigured(): boolean;
}

export type ProviderKind =
  | 'tts' | 'music' | 'i2v' | 'genvideo' | 'render' | 'analysis' | 'llm' | 'storage';

// --------------------------------------------------------------------------
// TTS — التعليق الصوتي
// --------------------------------------------------------------------------

export interface TtsRequest {
  text: string;
  /** معرّف الصوت داخل المنصة (يُترجَم للمزوّد داخل الـ adapter) */
  voiceId: string;
  settings: VoiceSettings;
  lang: 'ar' | 'en' | 'mixed';
  /** قاموس النطق مطبَّقًا مسبقًا أو مُمرّرًا للمزوّد إن كان يدعمه */
  lexicon?: { term: string; phonetic: string; ipa?: string | null }[];
  /** معاينة قصيرة (تُستخدم لعيّنات الأصوات) */
  preview?: boolean;
}

export interface TtsResult {
  audio: Buffer;
  mime: string;
  duration: number;
  /** توقيت الكلمات إن وفّره المزوّد — يُستخدم لمزامنة النص والـ ducking */
  wordTimings?: { word: string; start: number; end: number }[];
  provider: string;
}

export interface TtsProvider extends ProviderInfo {
  kind: 'tts';
  synthesize(req: TtsRequest): Promise<TtsResult>;
  /** هل يدعم المزوّد قاموس نطق أصليًا؟ إن لا، يُطبَّق نصيًا قبل الإرسال */
  supportsLexicon: boolean;
}

// --------------------------------------------------------------------------
// Music — مكتبة الموسيقى
// --------------------------------------------------------------------------

export interface MusicProvider extends ProviderInfo {
  kind: 'music';
  /**
   * تنزيل مقطع إلى مسار محلي جاهز للرندر.
   * `ref` مرجع يفهمه المزوّد — رابط عام في مزوّد التخزين الحالي.
   */
  fetchTrack(ref: string, destPath: string): Promise<{ path: string; duration: number }>;
  /** هل المقطع متاح فعليًا؟ */
  hasTrack(ref: string): Promise<boolean>;
}

// --------------------------------------------------------------------------
// Image → Video — تحريك الصور
// --------------------------------------------------------------------------

export interface I2vRequest {
  imagePath: string;
  duration: number;
  orientation: RenderOrientation;
  width: number;
  height: number;
  fps: number;
  motion: {
    type: string;
    intensity: number;
    focus: { x: number; y: number };
    easing: string;
  };
  /** وصف الحركة المطلوبة — للمزوّدات التوليدية فقط */
  prompt?: string;
}

export interface I2vResult {
  videoPath: string;
  provider: string;
  /** هل نتج المقطع عن توليد ذكاء اصطناعي (يؤثّر على وسم المحتوى)؟ */
  generated: boolean;
}

export interface I2vProvider extends ProviderInfo {
  kind: 'i2v';
  animate(req: I2vRequest): Promise<I2vResult>;
}

// --------------------------------------------------------------------------
// Generative Video — مشاهد B-roll السينمائية المولّدة
// --------------------------------------------------------------------------

export type BRollKind =
  | 'aerial_establishing' | 'city_establishing' | 'exterior_building'
  | 'landscape' | 'environment' | 'location_transition';

export interface BRollRequest {
  kind: BRollKind;
  /** المدينة/الموقع كما هو مسجّل في بيانات البرنامج */
  location: string | null;
  style: PromoStyleId;
  duration: number;
  orientation: RenderOrientation;
  width: number;
  height: number;
}

export interface BRollResult {
  videoPath: string;
  provider: string;
  prompt: string;
  /** يُحفظ في بيانات الأصل ليظهر أنه مشهد مساند مولّد */
  generated: true;
}

export interface GenVideoProvider extends ProviderInfo {
  kind: 'genvideo';
  generate(req: BRollRequest): Promise<BRollResult>;
}

// --------------------------------------------------------------------------
// Render — محرّك الإخراج النهائي
// --------------------------------------------------------------------------

export interface RenderRequest {
  timeline: Timeline;
  styleId: PromoStyleId;
  workDir: string;
  outputPath: string;
  /** استدعاء التقدّم 0..100 */
  onProgress?: (pct: number, label: string) => void;
}

export interface RenderResult {
  path: string;
  posterPath: string;
  duration: number;
  fileSize: number;
  width: number;
  height: number;
  provider: string;
}

export interface RenderProvider extends ProviderInfo {
  kind: 'render';
  render(req: RenderRequest): Promise<RenderResult>;
  /** رندر مشهد واحد فقط (لزر «إعادة توليد هذا المشهد») */
  renderScene(req: RenderRequest & { sceneIndex: number }): Promise<RenderResult>;
}

// --------------------------------------------------------------------------
// Analysis — تحليل الصور والفيديو
// --------------------------------------------------------------------------

export interface AnalysisRequest {
  mediaId: string;
  type: 'image' | 'video';
  /** مسار محلي أو رابط عام */
  src: string;
  localPath?: string;
}

export interface AnalysisProvider extends ProviderInfo {
  kind: 'analysis';
  analyze(req: AnalysisRequest): Promise<MediaAnalysis>;
}

// --------------------------------------------------------------------------
// LLM — كتابة النص وتخطيط القصة
// --------------------------------------------------------------------------

export interface NarrationRequest {
  course: CourseContext;
  /** عدد الكلمات المستهدف (محسوب من مدة الفيديو وسرعة القراءة) */
  targetWords: number;
  style: PromoStyleId;
  openingText?: string | null;
  closingText?: string | null;
  /** نص المستخدم عند طلب التحسين فقط */
  userText?: string | null;
  mode: 'generate' | 'enhance';
  /** ملخّص المواد المتاحة — لمنع ذكر ما لا يوجد */
  materialSummary: string;
}

export interface StoryPlanRequest {
  course: CourseContext;
  style: PromoStyleId;
  beats: StoryBeat[];
  analyses: MediaAnalysis[];
  duration: number;
}

export interface StoryPlanResult {
  /** ترتيب المشاهد المقترح مع تعيين المواد */
  order: { beat: StoryBeat; mediaId: string | null; reason: string }[];
  /** نصوص مقترحة لكل مشهد (اختياري) */
  captions?: Record<string, string>;
}

export interface LlmProvider extends ProviderInfo {
  kind: 'llm';
  writeNarration(req: NarrationRequest): Promise<string>;
  planStory(req: StoryPlanRequest): Promise<StoryPlanResult | null>;
}
